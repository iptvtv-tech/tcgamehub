// ─────────────────────────────────────────────────────────────
//  STATION DEFENSE — the rules, shared by game.js and check.mjs.
//
//  A level is one map: a glowing space lane (two from level 9) from a warp
//  gate at the top down to your station, build pads beside it, and 3–5 waves
//  of ships. Turrets on the pads shoot ships in range; the station cannon
//  fires where the player taps. Ships that reach the station knock out its
//  shields; lose them all and a life goes (the field is cleared and play
//  restarts from the oldest wave still out; turrets and credits stay).
//
//  Pure logic: no drawing, no Math.random. The map and the waves come from the
//  engine's seeded rng (Daily Challenge), and a step is deterministic, so
//  check.mjs can replay a level with a bot and prove it can be won.
// ─────────────────────────────────────────────────────────────

export const W = 480, H = 720;
export const CELL = 48, COLS = 10, ROWS = 14, OY = 48;     // the map grid sits under a 48 px HUD strip
export const STEP = 1 / 120;
export const SX = 240, SY = OY + 13 * CELL;                // station centre: the 2×2 block at cols 4–5, rows 12–13
export const STATION_R = 40;
export const SHIELDS = 10;
export const cx = (c) => c * CELL + CELL / 2;
export const cy = (r) => OY + r * CELL + CELL / 2;

// ── Turrets ──────────────────────────────────────────────────
// tiers[0] is the build; tiers[1..2] are upgrades (up = upgrade price).
export const TURRETS = {
  laser: {
    name: 'Pulse Laser', color: '#22d3ee', unlock: 1, cost: 50,
    blurb: 'Fast shots at one ship. Weak against armour.',
    tiers: [
      { dmg: 6, rate: 2.5, range: 104 },
      { up: 60, dmg: 11, rate: 2.8, range: 110 },
      { up: 95, dmg: 18, rate: 3.2, range: 118 },
    ],
  },
  missile: {
    name: 'Missile Pod', color: '#fb923c', unlock: 3, cost: 85,
    blurb: 'Slow homing missiles that blast a whole group.',
    tiers: [
      { dmg: 22, rate: 0.7, range: 135, splash: 42 },
      { up: 80, dmg: 38, rate: 0.78, range: 142, splash: 48 },
      { up: 125, dmg: 60, rate: 0.85, range: 150, splash: 54 },
    ],
  },
  cryo: {
    name: 'Cryo Beam', color: '#7dd3fc', unlock: 6, cost: 70,
    blurb: 'A freezing pulse that slows every ship in range.',
    tiers: [
      { dmg: 4, rate: 0.9, range: 88, slow: 0.35, dur: 1.6 },
      { up: 70, dmg: 8, rate: 1.0, range: 96, slow: 0.45, dur: 1.9 },
      { up: 110, dmg: 14, rate: 1.1, range: 104, slow: 0.55, dur: 2.2 },
    ],
  },
  tesla: {
    name: 'Tesla Coil', color: '#c084fc', unlock: 8, cost: 120,
    blurb: 'Lightning that jumps from ship to ship, straight through armour.',
    tiers: [
      { dmg: 18, rate: 0.85, range: 108, chain: 3 },
      { up: 110, dmg: 28, rate: 0.95, range: 114, chain: 4 },
      { up: 165, dmg: 42, rate: 1.05, range: 122, chain: 5 },
    ],
  },
};
export const KINDS = Object.keys(TURRETS);
export const SELL_BACK = 0.7;
export const MISSILE_SPEED = 300;
export const TESLA_JUMP = 85;      // how far lightning can leap to the next ship
export const tierOf = (t) => TURRETS[t.kind].tiers[t.tier];
/** Credits spent on a turret so far (build + upgrades). */
export const spentOn = (t) => TURRETS[t.kind].cost + TURRETS[t.kind].tiers.slice(1, t.tier + 1).reduce((a, x) => a + x.up, 0);
export const sellValue = (t) => Math.floor(spentOn(t) * SELL_BACK);
/** One number for the info panel: rough damage per second (and what else it does). */
export function statLine(kind, st) {
  switch (kind) {
    case 'laser': return `${Math.round(st.dmg * st.rate)} damage/s`;
    case 'missile': return `${Math.round(st.dmg * st.rate)} damage/s to a group`;
    case 'cryo': return `slows ${Math.round(st.slow * 100)}% for ${st.dur}s`;
    case 'tesla': return `${Math.round(st.dmg * st.rate)} damage/s × ${st.chain} ships`;
  }
  return '';
}

// ── The station cannon (the player's own gun) ────────────────
export const CANNON = { cd: 0.75, speed: 820, dmg: 10, splash: 26 };
export const cannonDmg = (level) => Math.round(CANNON.dmg * (1 + 0.06 * (level - 1)));

// ── Enemies ──────────────────────────────────────────────────
// intro: the level a ship first appears. shield = an energy bubble that soaks damage
// before the hull (Tesla lightning tears it at double rate). splits = shards on death.
export const ENEMIES = {
  scout:    { name: 'Scout',      intro: 1,  hp: 16,   speed: 58, armor: 0, reward: 4,  leak: 1, r: 9,  pts: 10,  gap: 0.6,  threat: 1 },
  raider:   { name: 'Raider',     intro: 2,  hp: 46,   speed: 42, armor: 0, reward: 7,  leak: 1, r: 12, pts: 20,  gap: 0.85, threat: 2.4 },
  tank:     { name: 'Tank',       intro: 3,  hp: 170,  speed: 27, armor: 4, reward: 15, leak: 2, r: 16, pts: 50,  gap: 1.7,  threat: 7 },
  dart:     { name: 'Dart',       intro: 4,  hp: 20,   speed: 96, armor: 0, reward: 5,  leak: 1, r: 8,  pts: 20,  gap: 0.45, threat: 1.5 },
  splitter: { name: 'Splitter',   intro: 7,  hp: 70,   speed: 38, armor: 0, reward: 6,  leak: 1, r: 14, pts: 30,  gap: 1.0,  threat: 4, splits: 2 },
  shard:    { name: 'Shard',      intro: 99, hp: 18,   speed: 62, armor: 0, reward: 2,  leak: 1, r: 7,  pts: 8,   gap: 0,    threat: 0 },
  warden:   { name: 'Warden',     intro: 9,  hp: 60,   speed: 44, armor: 0, reward: 10, leak: 1, r: 13, pts: 40,  gap: 0.9,  threat: 4.5, shield: 60 },
  mother:   { name: 'Mothership', intro: 11, hp: 650,  speed: 30, armor: 6, reward: 80, leak: 3, r: 26, pts: 400, gap: 0,    threat: 0, launches: 5 },
};
const WEIGHT = { scout: 3, raider: 3, tank: 2, dart: 2, splitter: 2, warden: 2 };
export const bossLevel = (level) => level >= 11 && level % 2 === 1;

// ── Difficulty curve ─────────────────────────────────────────
// Ships toughen a little faster than the economy grows (hp ÷ credits creeps up), and the
// pads cap how much firepower fits on a map, so the levels keep getting harder.
export const hpScale = (level) => 1 + 0.33 * (level - 1) + 0.004 * (level - 1) ** 2;
export const econ = (level) => 1 + 0.22 * (level - 1) + 0.002 * (level - 1) ** 2;
export const rewardScale = econ;
export const speedScale = (level) => 1 + Math.min(0.3, 0.012 * (level - 1));
export const armorScale = (level) => Math.min(2, 1 + 0.04 * (level - 1));
export const startCredits = (level) => (level === 1 ? 140 : Math.round(190 * econ(level) / 5) * 5);
export const padCount = (level, lanes = 1) => (lanes > 1 ? 12 : level <= 3 ? 8 : level <= 7 ? 9 : 10);
export const firstCountdown = (level) => (level === 1 ? 15 : 12);   // build time before wave 1
export const waveGap = (level) => Math.max(4, 7 - level * 0.2);     // breather between waves
export const waveCount = (level) => (level <= 2 ? 3 : level <= 7 ? 4 : 5);

// ── Map ──────────────────────────────────────────────────────
/** One lane from a gate on the top edge to the station dock: a serpentine of
 *  horizontal runs joined by drops of 2–3 rows, so pads between two runs cover both. */
function lanePath(level, rng, startX = rng.int(1, 8)) {
  const cells = [];
  let x = startX, y = 0;
  const go = (nx, ny) => { x = nx; y = ny; cells.push([x, y]); };
  cells.push([x, 0]);
  const runs = level <= 3 ? 4 : level <= 9 ? 3 : 2;
  const minRun = level <= 3 ? 4 : 3;
  for (let i = 0, n = rng.int(1, 2); i < n; i++) go(x, y + 1);
  for (let made = 0; made < runs && y <= 8;) {
    const opts = [];
    for (let c = 0; c < COLS; c++) if (Math.abs(c - x) >= minRun) opts.push(c);
    const tx = rng.pick(opts);
    while (x !== tx) go(x + Math.sign(tx - x), y);
    made++;
    const drop = rng.int(2, 3);
    if (made >= runs || y + drop > 9) break;
    for (let i = 0; i < drop; i++) go(x, y + 1);
  }
  // the final approach: down to row 10, across to the dock column, down to the station
  while (y < 10) go(x, y + 1);
  const fx = x <= 4 ? 4 : 5;
  while (x !== fx) go(x + Math.sign(fx - x), y);
  go(x, 11);
  return cells;
}

/** A second lane from another gate that joins the first one well down the map,
 *  never running alongside it before the merge. Null if this layout won't take one. */
function secondLane(a, level, rng) {
  const onA = new Map(a.map(([x, y], i) => [x + y * COLS, i]));
  const touches = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && x + dx < COLS && onA.has(x + dx + (y + dy) * COLS));
  for (let k = 0; k < 30; k++) {
    const gx = rng.int(0, 9);
    if (Math.abs(gx - a[0][0]) < 4) continue;
    const b = lanePath(level, rng, gx);
    const cut = b.findIndex(([x, y]) => onA.has(x + y * COLS));
    if (cut < 7) continue;
    const join = onA.get(b[cut][0] + b[cut][1] * COLS);
    if (join < a.length * 0.35) continue;
    const prefix = b.slice(0, cut);
    if (prefix.slice(0, -1).some(([x, y]) => touches(x, y))) continue;
    return [...prefix, ...a.slice(join)];
  }
  return null;
}

/** Pixel waypoints (gate → every corner → the station's dock) with segment lengths. */
function toLane(cells, i) {
  const pts = [[cx(cells[0][0]), OY + 8]];     // ships come out of the warp gate in the top row
  for (let k = 1; k < cells.length - 1; k++) {
    const [ax, ay] = cells[k - 1], [bx, by] = cells[k], [qx, qy] = cells[k + 1];
    if (bx - ax !== qx - bx || by - ay !== qy - by) pts.push([cx(bx), cy(by)]);
  }
  const last = cells[cells.length - 1];
  pts.push([cx(last[0]), SY - STATION_R + 8]);
  const seg = [];
  let len = 0;
  for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(l); len += l; }
  return { i, pts, seg, len };
}

/** Where a ship d px along the lane is: [x, y, heading]. */
export function pointAt(lane, d) {
  let i = 0;
  while (i < lane.seg.length - 1 && d > lane.seg[i]) { d -= lane.seg[i]; i++; }
  const [ax, ay] = lane.pts[i], [bx, by] = lane.pts[i + 1], k = Math.max(0, Math.min(1, d / lane.seg[i]));
  return [ax + (bx - ax) * k, ay + (by - ay) * k, Math.atan2(by - ay, bx - ax)];
}

const inStation = (x, y) => (x === 4 || x === 5) && y >= 12;

/** Build pads: free cells touching a lane, scored by how much lane they cover, never touching each other.
 *  The first pad guards the dock and the next ones each gate, so there is always a last line and a first line. */
function pickPads(lanes, n, rng) {
  const on = new Set(lanes.flat().map(([x, y]) => x + y * COLS));
  const unique = [...on].map((k) => [k % COLS, Math.floor(k / COLS)]);
  const prog = lanes.map((cells) => new Map(cells.map(([x, y], i) => [x + y * COLS, i / (cells.length - 1)])));
  const cand = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (on.has(x + y * COLS) || inStation(x, y)) continue;
    const at = prog.map(() => -1);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= COLS) continue;
      prog.forEach((m, li) => { const v = m.get(x + dx + (y + dy) * COLS); if (v !== undefined) at[li] = Math.max(at[li], v); });
    }
    if (at.every((v) => v < 0)) continue;
    let cover = 0;
    for (const [px, py] of unique) if (Math.hypot(px - x, py - y) <= 2.2) cover++;
    cand.push({ x, y, cover, at, score: cover + rng.range(0, 2.5) });
  }
  const pads = [];
  const free = (c) => !pads.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 1);
  const best = (f) => cand.filter((c) => f(c) && free(c)).sort((a, b) => b.score - a.score)[0];
  const firsts = [(c) => c.at[0] > 0.82, ...lanes.map((_, li) => (c) => c.at[li] >= 0 && c.at[li] < 0.25)];
  for (const f of firsts) { const c = best(f); if (c) pads.push(c); }
  for (const c of [...cand].sort((a, b) => b.score - a.score)) {
    if (pads.length >= n) break;
    if (free(c)) pads.push(c);
  }
  return pads.map((p, i) => ({ i, c: p.x, r: p.y, x: cx(p.x), y: cy(p.y), cover: p.cover }));
}

export function makeMap(level, rng) {
  const two = level >= 9 && (level >= 14 || rng.chance(0.6));
  let map = null;
  for (let tries = 0; tries < 60; tries++) {
    const a = lanePath(level, rng);
    const cells = [a];
    if (two && tries < 50) { const b = secondLane(a, level, rng); if (!b) continue; cells.push(b); }
    const n = padCount(level, cells.length);
    const pads = pickPads(cells, n, rng);
    map = { lanes: cells.map(toLane), cells, pads };
    if (cells.length > 1) {   // how far along lane 2 it runs on its own before joining lane 1
      const onA = new Set(cells[0].map(([x, y]) => x + y * COLS));
      map.lanes[1].own = 16 + cells[1].findIndex(([x, y]) => onA.has(x + y * COLS)) * CELL;
    }
    if (pads.length === n) break;
  }
  return map;
}

// ── Waves ────────────────────────────────────────────────────
/** waves[w] = groups of { type, count, gap (s between ships), delay (s before the group), lane }.
 *  A threat budget per wave (counted in scouts) is spent on groups; toughness grows with hpScale. */
export function makePlan(level, rng, lanes = 1) {
  const n = waveCount(level);
  const pool = Object.keys(WEIGHT).filter((t) => ENEMIES[t].intro <= level);
  const fresh = pool.filter((t) => ENEMIES[t].intro === level && level > 1);   // this level's new ship
  const fast = Math.min(1.5, 1 + 0.035 * (level - 1));
  const waves = [];
  for (let w = 0; w < n; w++) {
    let budget = (8 + 5 * w) * (1 + 0.05 * (level - 1)) * (w === n - 1 && bossLevel(level) ? 0.7 : 1);   // the boss brings a lighter escort
    const k = w === 0 ? 1 : w < 3 ? 2 : 3;
    const groups = [];
    for (let g = 0; g < k; g++) {
      let type;
      if (level === 1) type = w === n - 1 && g === k - 1 ? 'raider' : 'scout';   // a taste of what comes next
      else if (fresh.length && w >= 1 && g === 0) type = fresh[0];                // the new ship gets a proper debut
      else {
        let total = 0; for (const t of pool) total += WEIGHT[t];
        let r = rng.range(0, total); type = pool[0];
        for (const t of pool) { r -= WEIGHT[t]; if (r < 0) { type = t; break; } }
      }
      const E = ENEMIES[type], share = budget / (k - g);
      const count = Math.max(1, Math.round(share / E.threat));
      budget -= count * E.threat;
      groups.push({ type, count, gap: E.gap / fast, delay: g ? 1.8 : 0, lane: lanes > 1 ? (w + g) % 2 : 0 });
    }
    if (w === n - 1 && bossLevel(level)) groups.push({ type: 'mother', count: 1, gap: 0, delay: 3, lane: 0 });
    waves.push(groups);
  }
  return { waves, credits: startCredits(level) };
}

// ── The simulation ───────────────────────────────────────────
export class Sim {
  constructor(level, rng) {
    this.level = level;
    this.map = makeMap(level, rng);
    this.plan = makePlan(level, rng, this.map.lanes.length);
    this.credits = this.plan.credits;
    this.shields = SHIELDS;
    this.turrets = []; this.enemies = []; this.shots = []; this.pending = [];
    this.wave = -1;                         // the last wave launched
    this.countdown = firstCountdown(level); // seconds until the next wave (null while a wave is still arriving)
    this.t = 0; this.cannonCd = 0; this.ids = 0;
    this.left = []; this.alive = []; this.leaks = []; this.cleared = [];   // per wave
    this.events = [];
    this.done = false; this.down = false;
  }

  get waves() { return this.plan.waves.length; }
  /** Can the player call the next wave now (for a bonus)? */
  get canCall() { return !this.done && !this.down && this.countdown !== null && this.wave < this.waves - 1; }

  // ── Player actions ──
  build(pad, kind) {
    const T = TURRETS[kind];
    if (!T || T.unlock > this.level || this.credits < T.cost || this.turretAt(pad)) return null;
    this.credits -= T.cost;
    const t = { id: ++this.ids, kind, tier: 0, pad, x: pad.x, y: pad.y, cd: 0.2, aim: -Math.PI / 2 };
    this.turrets.push(t);
    this.events.push({ type: 'build', t });
    return t;
  }
  upgrade(t) {
    const next = TURRETS[t.kind].tiers[t.tier + 1];
    if (!next || this.credits < next.up) return false;
    this.credits -= next.up; t.tier++;
    this.events.push({ type: 'upgrade', t });
    return true;
  }
  sell(t) {
    const i = this.turrets.indexOf(t);
    if (i < 0) return 0;
    const v = sellValue(t);
    this.turrets.splice(i, 1); this.credits += v;
    this.events.push({ type: 'sell', t, v });
    return v;
  }
  turretAt(pad) { return this.turrets.find((t) => t.pad === pad) || null; }

  /** Fire the station cannon at (tx, ty). Returns false while it reloads. */
  fire(tx, ty) {
    if (this.cannonCd > 0 || this.done || this.down) return false;
    this.cannonCd = CANNON.cd;
    const ox = SX, oy = SY - 16, T = Math.hypot(tx - ox, ty - oy) / CANNON.speed;
    this.shots.push({ kind: 'shell', ox, oy, x: ox, y: oy, tx, ty, t: 0, T, dmg: cannonDmg(this.level), r: CANNON.splash });
    this.events.push({ type: 'fire', tx, ty });
    return true;
  }

  /** Send the next wave now. Every second skipped pays a bonus (and a credit). */
  callWave() {
    if (!this.canCall) return 0;
    const secs = Math.ceil(this.countdown);
    this.credits += secs;
    this.events.push({ type: 'early', secs });
    this.launch();
    return secs;
  }

  // ── Waves ──
  launch() {
    const w = ++this.wave;
    let at = this.t + 0.3, total = 0;
    for (const g of this.plan.waves[w]) {
      at += g.delay;
      for (let i = 0; i < g.count; i++) { this.pending.push({ at, type: g.type, w, lane: g.lane }); at += g.gap; total++; }
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.left[w] = total; this.alive[w] = 0; this.leaks[w] = 0; this.cleared[w] = false;
    this.countdown = null;
    this.events.push({ type: 'wave', w });
  }

  /** After a lost life: clear the field, recharge the shields and fly again from the
   *  oldest wave that still had ships out (turrets and credits stay). */
  restartWave() {
    let i = 0;
    while (i < this.wave && this.left[i] === 0 && this.alive[i] === 0) i++;
    this.enemies = []; this.shots = []; this.pending = [];
    this.shields = SHIELDS; this.down = false;
    for (let j = i; j < this.waves; j++) { this.left[j] = this.alive[j] = this.leaks[j] = 0; this.cleared[j] = false; }
    this.wave = i - 1;
    this.countdown = 4;
  }

  spawn(type, w, laneI = 0, d = 0, counted = true) {
    const E = ENEMIES[type], lane = this.map.lanes[Math.min(laneI, this.map.lanes.length - 1)], L = this.level;
    const hp = Math.round(E.hp * hpScale(L));
    const e = {
      id: ++this.ids, type, w, lane, d, hp, maxHp: hp, armor: Math.round(E.armor * armorScale(L)), r: E.r,
      shield: E.shield ? Math.round(E.shield * hpScale(L)) : 0, maxShield: E.shield ? Math.round(E.shield * hpScale(L)) : 0,
      speed: E.speed * speedScale(L), reward: Math.round(E.reward * rewardScale(L)), leak: E.leak, pts: E.pts,
      slow: 0, slowT: 0, alive: true, x: 0, y: 0, a: 0, launch: E.launches || 0,
    };
    [e.x, e.y, e.a] = pointAt(lane, d);
    this.enemies.push(e);
    if (counted) this.left[w]--;
    this.alive[w]++;
    return e;
  }

  // ── Damage ──
  /** pierce: ignores armour (Tesla). shieldMul: extra damage to a shield bubble. */
  hit(e, dmg, by, pierce = false, shieldMul = 1) {
    if (!e.alive) return;
    if (e.shield > 0) {
      const sd = dmg * shieldMul;
      if (sd < e.shield) { e.shield -= sd; return; }
      dmg = (sd - e.shield) / shieldMul; e.shield = 0;
      this.events.push({ type: 'shieldBreak', e });
    }
    const d = e.armor && !pierce ? Math.max(dmg * 0.25, dmg - e.armor) : dmg;
    e.hp -= d;
    if (e.hp <= 0) this.kill(e, by);
  }
  kill(e, by) {
    e.alive = false;
    this.credits += e.reward;
    this.alive[e.w]--;
    this.events.push({ type: 'kill', e, by });
    const n = ENEMIES[e.type].splits;
    if (n) for (let i = 0; i < n; i++) this.spawn('shard', e.w, e.lane.i, Math.max(0, e.d - 8 + i * 16), false);
  }
  /** The ship nearest the station inside range of (x, y). */
  target(x, y, range) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > range * range) continue;
      const rem = e.lane.len - e.d;
      if (rem < bd) { bd = rem; best = e; }
    }
    return best;
  }
  blast(x, y, r, dmg, by) {
    let n = 0;
    for (let i = 0, n0 = this.enemies.length; i < n0; i++) {       // shards born in this blast aren't caught by it
      const e = this.enemies[i];
      if (!e.alive || Math.hypot(e.x - x, e.y - y) > r + e.r * 0.5) continue;
      this.hit(e, dmg, by); n++;
    }
    this.events.push({ type: 'boom', x, y, r, n, by });
  }

  fireTurret(t, st, e) {
    t.aim = Math.atan2(e.y - t.y, e.x - t.x);
    switch (t.kind) {
      case 'laser':
        this.events.push({ type: 'laser', t, x: e.x, y: e.y });
        this.hit(e, st.dmg, t);
        break;
      case 'missile':
        this.shots.push({ kind: 'missile', x: t.x + Math.cos(t.aim) * 12, y: t.y + Math.sin(t.aim) * 12, a: t.aim, target: e, tx: e.x, ty: e.y, dmg: st.dmg, r: st.splash, life: 3, by: t });
        this.events.push({ type: 'missile', t });
        break;
      case 'cryo':
        for (let i = 0, n0 = this.enemies.length; i < n0; i++) {
          const f = this.enemies[i];
          if (!f.alive || Math.hypot(f.x - t.x, f.y - t.y) > st.range + f.r * 0.5) continue;
          const slow = f.type === 'mother' ? st.slow * 0.5 : st.slow;
          if (f.slowT <= 0 || slow >= f.slow) f.slow = slow;
          f.slowT = Math.max(f.slowT, st.dur);
          this.hit(f, st.dmg, t);
        }
        this.events.push({ type: 'frost', t, r: st.range });
        break;
      case 'tesla': {
        const pts = [[t.x, t.y - 10]], hitSet = new Set();
        let cur = e, dmg = st.dmg;
        for (let k = 0; k < st.chain && cur; k++) {
          hitSet.add(cur); pts.push([cur.x, cur.y]);
          this.hit(cur, dmg, t, true, 2);
          dmg *= 0.85;
          let next = null, nd = TESLA_JUMP;
          for (const f of this.enemies) {
            if (!f.alive || hitSet.has(f)) continue;
            const d = Math.hypot(f.x - cur.x, f.y - cur.y);
            if (d < nd) { nd = d; next = f; }
          }
          cur = next;
        }
        this.events.push({ type: 'tesla', t, pts });
        break;
      }
    }
  }

  // ── One fixed step ──
  step(dt = STEP) {
    if (this.done || this.down) return;
    this.t += dt;
    if (this.cannonCd > 0) this.cannonCd = Math.max(0, this.cannonCd - dt);

    // the countdown to the next wave
    if (this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.launch();
    }
    while (this.pending.length && this.pending[0].at <= this.t) { const p = this.pending.shift(); this.spawn(p.type, p.w, p.lane); }

    // ships fly the lane
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      if (e.slowT > 0) e.slowT -= dt;
      e.d += e.speed * (e.slowT > 0 ? 1 - e.slow : 1) * dt;
      if (e.d >= e.lane.len) {
        e.alive = false;
        this.alive[e.w]--; this.leaks[e.w] += e.leak;
        this.shields = Math.max(0, this.shields - e.leak);
        this.events.push({ type: 'leak', e });
        if (this.shields <= 0) { this.down = true; this.events.push({ type: 'down' }); return; }
        continue;
      }
      [e.x, e.y, e.a] = pointAt(e.lane, e.d);
      if (e.launch && (e.launchT = (e.launchT ?? e.launch) - dt) <= 0) {     // the mothership launches fighters
        e.launchT = e.launch;
        const f = this.spawn('scout', e.w, e.lane.i, e.d + e.r, false);
        this.events.push({ type: 'launch', e, f });
      }
    }

    // turrets
    for (const t of this.turrets) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      const st = tierOf(t);
      const e = this.target(t.x, t.y, st.range);
      if (!e) { t.cd = 0; continue; }
      t.cd += 1 / st.rate;
      this.fireTurret(t, st, e);
    }

    // cannon shells and missiles
    for (const s of this.shots) {
      if (s.kind === 'shell') {
        s.t += dt;
        const k = Math.min(1, s.t / s.T);
        s.x = s.ox + (s.tx - s.ox) * k; s.y = s.oy + (s.ty - s.oy) * k;
        if (k >= 1) { s.dead = true; this.blast(s.tx, s.ty, s.r, s.dmg, 'cannon'); }
        continue;
      }
      // a missile homes on its target (or its last position once the target is gone)
      if (s.target.alive) { s.tx = s.target.x; s.ty = s.target.y; }
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), v = MISSILE_SPEED * dt;
      s.life -= dt;
      if (d <= v + 6 || s.life <= 0) { s.dead = true; this.blast(s.tx, s.ty, s.r, s.dmg, s.by); continue; }
      s.a = Math.atan2(dy, dx); s.x += (dx / d) * v; s.y += (dy / d) * v;
    }
    if (this.shots.some((s) => s.dead)) this.shots = this.shots.filter((s) => !s.dead);
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);

    // wave bookkeeping
    const w = this.wave;
    if (w >= 0 && this.countdown === null && this.left[w] === 0 && w < this.waves - 1) this.countdown = waveGap(this.level);
    for (let i = 0; i <= w; i++) {
      if (!this.cleared[i] && this.left[i] === 0 && this.alive[i] === 0) {
        this.cleared[i] = true;
        this.events.push({ type: 'waveClear', w: i, perfect: this.leaks[i] === 0 });
      }
    }
    if (w === this.waves - 1 && this.left[w] === 0 && !this.enemies.length) {
      this.done = true;
      this.events.push({ type: 'clear', shields: this.shields });
    }
  }
}

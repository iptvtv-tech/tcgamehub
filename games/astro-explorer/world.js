// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — the rules (pure: no DOM, no canvas, no sound). Shared by game.js and
//  check.mjs, so the checker flies exactly the movement the player does.
//
//  A planet is one hand-drawn tile map. PlanetSim runs it at a fixed 120 Hz step: the
//  astronaut, his energy blade and blaster, suit armour, spikes, star dust, the exit beacon
//  and the aliens. step(input) returns a list of events (hit, kill, hurt…) that game.js turns
//  into sound, particles and points.
//
//  Everything random — which alien sits in each slot, elites, hop timing, drops — comes from
//  one stream per planet, seeded from the run seed and the planet number. So in the Daily
//  Challenge every player meets the same aliens on the same planet, whatever came before.
//
//  Tiles:   # rock   = one-way ledge (land on it from above)   ^ floor spikes   v ceiling spikes
//  Markers (air underneath):  S spawn   E exit beacon   * star dust
//           c ground alien slot   f flying alien slot   t acid pod slot (rooted on the rock beside it)
// ─────────────────────────────────────────────────────────────
import { makeRng } from '../../assets/js/rng.js';

export const TILE = 24;
export const DT = 1 / 120;
export const AIR = 0, ROCK = 1, LEDGE = 2, SPIKE_UP = 3, SPIKE_DOWN = 4;
export const isSpike = (k) => k === SPIKE_UP || k === SPIKE_DOWN;
export const isFloor = (k) => k === ROCK || k === LEDGE;

// The astronaut: a box (centre-x, feet-y) and the movement feel
export const PW = 14, PH = 30;
export const RUN = 175, ACCEL_G = 1900, ACCEL_A = 1250, FRICTION = 2300;
export const GRAV = 1500, FALL_MUL = 1.45, MAX_FALL = 640;
export const JUMP_V = -520, JUMP_CUT = 0.45;
export const COYOTE = 0.09, BUFFER = 0.11;

// Combat
export const SLASH_T = 0.17, SLASH_CD = 0.3, SLASH_ON = [0.012, 0.11];   // swing length, cooldown, frames that hit
export const POGO_V = -440;                                               // bounce off a down-slash hit
export const SHOT_CD = 0.24, BOLT_V = 560, BOLT_LIFE = 0.6;
export const INV_T = 1.1, HAZARD_T = 0.6, KB_T = 0.2;
/** What the explorer starts each run with (Section 3 upgrades raise these). */
export const LOADOUT = { pips: 3, energy: 6, blade: 1, blaster: 1 };

// ── Planets ──────────────────────────────────────────────────
const LANDING_SITE = [
  '########################################################',
  '########################################################',
  '########################################################',
  '######..............###.................####....########',
  '######..............###.................####....########',
  '######..............vvv.................####....########',
  '#........................................t......########',
  '#..*.........f.........................................#',
  '#.............................f........................#',
  '#..................*...................................#',
  '#...........*.....======............*..................#',
  '#....E.*..======............*.....=====................#',
  '#.#######.................======............*..........#',
  '#.#######.................................=====.....*..#',
  '#.#######.........................................######',
  '#.................................................######',
  '#..............................................*.......#',
  '#.............................................====.....#',
  '#......................................................#',
  '#.........................................*............#',
  '#........................................====..........#',
  '#......................................................#',
  '#....................................*.....f...........#',
  '#...................................====...............#',
  '#............................*.........................#',
  '#..................*.....*.c...^^*.....................#',
  '#.......................###########....................#',
  '#..S..*....c..*.......*.###########..................*.#',
  '#################....##############.....*....c...*..t..#',
  '#################^^^^###################################',
  '########################################################',
  '########################################################',
];

// Until Section 4's hand-drawn planets arrive, every level flies the Landing Site map, but each
// planet in the cycle has its own colours (game.js THEMES): sky, rock, crystals — and the
// astronaut's mirrored visor reflects them.
export const PLANETS = [
  { name: 'Landing Site', theme: 'dust', rows: LANDING_SITE },
  { name: 'Frost Moon', theme: 'ice', rows: LANDING_SITE },
  { name: 'Ember Rock', theme: 'ember', rows: LANDING_SITE },
  { name: 'Spore Jungle', theme: 'jungle', rows: LANDING_SITE },
  { name: 'Dune World', theme: 'desert', rows: LANDING_SITE },
  { name: 'Nebula Reach', theme: 'nebula', rows: LANDING_SITE },
];
export const planetFor = (level) => PLANETS[(level - 1) % PLANETS.length];

/** Parse a planet into a tile grid plus its markers. Throws on ragged rows or a missing spawn/exit. */
export function parsePlanet(p) {
  const rows = p.rows, R = rows.length, C = rows[0].length;
  const t = new Uint8Array(R * C), dust = [], slots = [];
  let spawn = null, exit = null;
  for (let r = 0; r < R; r++) {
    if (rows[r].length !== C) throw new Error(`planet "${p.name}": row ${r} is ${rows[r].length} wide, expected ${C}`);
    for (let c = 0; c < C; c++) {
      const ch = rows[r][c];
      t[r * C + c] = ch === '#' ? ROCK : ch === '=' ? LEDGE : ch === '^' ? SPIKE_UP : ch === 'v' ? SPIKE_DOWN : AIR;
      if (ch === '*') dust.push({ c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      else if (ch === 'S') spawn = { x: c * TILE + TILE / 2, y: (r + 1) * TILE };
      else if (ch === 'E') exit = { c, r, x: c * TILE + TILE / 2, y: (r + 1) * TILE };
      else if (ch === 'c' || ch === 'f' || ch === 't') slots.push({ type: { c: 'ground', f: 'air', t: 'pod' }[ch], c, r });
    }
  }
  if (!spawn || !exit) throw new Error(`planet "${p.name}" needs an S and an E`);
  return { name: p.name, theme: p.theme, C, R, w: C * TILE, h: R * TILE, t, dust, slots, spawn, exit };
}

/** Outside the map counts as rock, so nothing can leave it. */
export const tileAt = (m, c, r) => (c < 0 || r < 0 || c >= m.C || r >= m.R ? ROCK : m.t[r * m.C + c]);
export const tileAtPx = (m, x, y) => tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE));
const hit4 = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];
const circleBox = (x, y, r, b) => x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3];
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));

/**
 * Move a box (o.x centre, o.y bottom) by its velocity, axis by axis, against rock.
 * oneWay: land on = ledges when falling onto them from above. Zeroes the blocked velocity.
 */
export function moveBody(o, hw, h, m, dt, oneWay = true) {
  const res = { wall: 0, ground: false, ceil: false };
  o.x += o.vx * dt;
  const top = Math.floor((o.y - h + 0.01) / TILE), bot = Math.floor((o.y - 0.01) / TILE);
  if (o.vx > 0) {
    const c = Math.floor((o.x + hw) / TILE);
    for (let r = top; r <= bot; r++) if (tileAt(m, c, r) === ROCK) { o.x = c * TILE - hw - 0.001; o.vx = 0; res.wall = 1; break; }
  } else if (o.vx < 0) {
    const c = Math.floor((o.x - hw) / TILE);
    for (let r = top; r <= bot; r++) if (tileAt(m, c, r) === ROCK) { o.x = (c + 1) * TILE + hw + 0.001; o.vx = 0; res.wall = -1; break; }
  }
  const prevY = o.y; o.y += o.vy * dt;
  const c0 = Math.floor((o.x - hw + 0.01) / TILE), c1 = Math.floor((o.x + hw - 0.01) / TILE);
  if (o.vy >= 0) {
    const r = Math.floor(o.y / TILE);
    for (let c = c0; c <= c1; c++) {
      const k = tileAt(m, c, r);
      if (k === ROCK || (oneWay && k === LEDGE && prevY <= r * TILE + 0.5)) { o.y = r * TILE; o.vy = 0; res.ground = true; break; }
    }
  } else {
    const r = Math.floor((o.y - h) / TILE);
    for (let c = c0; c <= c1; c++) if (tileAt(m, c, r) === ROCK) { o.y = (r + 1) * TILE + h + 0.001; o.vy = 0; res.ceil = true; break; }
  }
  return res;
}

// ── The astronaut ────────────────────────────────────────────
export function makePlayer(m, lo = LOADOUT) {
  return {
    x: m.spawn.x, y: m.spawn.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, jumpHeld: false, jumped: false, air: 0, kbT: 0,
    pips: lo.pips, energy: lo.energy, inv: 0, atk: null, atkCD: 0, shotCD: 0, slashBuf: 0, shotBuf: 0, shoot: null, hazard: 0, dead: false,
    safe: { x: m.spawn.x, y: m.spawn.y }, pogos: 0, hits: 0,
  };
}

/**
 * One 1/120 s movement step. inp = { dir: -1|0|1, jumpPress (edge), jumpHeld }.
 * Returns true on the tick a jump starts. check.mjs searches with exactly this function.
 */
export function stepPlayer(p, inp, m, dt = DT) {
  const ctrl = !(p.kbT > 0);                 // knocked back: no steering for a moment
  if (p.kbT > 0) p.kbT -= dt;
  const dir = ctrl ? inp.dir : 0;
  if (dir) { if (!p.atk) p.face = dir; p.vx = approach(p.vx, dir * RUN, (p.ground ? ACCEL_G : ACCEL_A) * dt); }
  else if (ctrl) p.vx = approach(p.vx, 0, (p.ground ? FRICTION : FRICTION * 0.25) * dt);

  // jump: buffered press + coyote time; let go early for a short hop
  let jumped = false;
  p.buffer = inp.jumpPress ? BUFFER : Math.max(0, p.buffer - dt);
  p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
  if (ctrl && p.buffer > 0 && p.coyote > 0) { p.vy = JUMP_V; p.buffer = 0; p.coyote = 0; p.ground = false; p.jumped = true; jumped = true; }
  if (!inp.jumpHeld && p.jumpHeld && p.vy < 0 && p.jumped) { p.vy *= JUMP_CUT; p.jumped = false; }
  p.jumpHeld = !!inp.jumpHeld;

  // gravity, heavier on the way down so jumps feel snappy
  p.vy = Math.min(MAX_FALL, p.vy + GRAV * (p.vy > 0 ? FALL_MUL : 1) * dt);
  const r = moveBody(p, PW / 2, PH, m, dt, true);
  p.ground = r.ground;
  if (r.ground) p.jumped = false;
  p.air = p.ground ? 0 : p.air + dt;
  return jumped;
}

/** Does this box touch the sharp part of any spike tile? */
export function boxHitsSpikes(m, x0, y0, x1, y1) {
  const c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE), r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = tileAt(m, c, r);
    if (k === SPIKE_UP && hit4([x0, y0, x1, y1], [c * TILE + 3, r * TILE + TILE * 0.4, (c + 1) * TILE - 3, (r + 1) * TILE])) return true;
    if (k === SPIKE_DOWN && hit4([x0, y0, x1, y1], [c * TILE + 3, r * TILE, (c + 1) * TILE - 3, r * TILE + TILE * 0.6])) return true;
  }
  return false;
}
export const touchesSpikes = (p, m) => boxHitsSpikes(m, p.x - PW / 2 + 1.5, p.y - PH + 2, p.x + PW / 2 - 1.5, p.y - 0.5);

/** The astronaut's box overlaps the exit beacon. */
export const atExit = (p, m) => Math.abs(p.x - m.exit.x) < TILE * 0.7 && p.y > m.exit.y - TILE * 2 && p.y - PH < m.exit.y;

/** Star dust the astronaut is touching (indices into m.dust). */
export function dustTouched(p, m, taken) {
  const out = [];
  for (let i = 0; i < m.dust.length; i++) {
    if (taken[i]) continue;
    const d = m.dust[i];
    if (Math.abs(p.x - d.x) < PW / 2 + 9 && d.y > p.y - PH - 9 && d.y < p.y + 9) out.push(i);
  }
  return out;
}

/** Where the energy blade hits: [x0, y0, x1, y1] for a side, up or down slash. */
export function slashBox(p, kind, face) {
  if (kind === 'up') return [p.x - 16, p.y - PH - 22, p.x + 16, p.y - PH + 6];
  if (kind === 'down') return [p.x - 15, p.y - 8, p.x + 15, p.y + 26];
  return face > 0 ? [p.x + 2, p.y - PH - 3, p.x + 31, p.y + 1] : [p.x - 31, p.y - PH - 3, p.x - 2, p.y + 1];
}

/** Clear view between two points (no rock in the way). */
export function lineOfSight(m, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) { const k = i / n; if (tileAtPx(m, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) === ROCK) return false; }
  return true;
}

// ── Aliens ───────────────────────────────────────────────────
export const FOES = {
  crawler: { name: 'Dust Mite', hp: 2, w: 20, h: 12, speed: 36, pts: 50 },
  hopper:  { name: 'Spore Toad', hp: 3, w: 18, h: 16, pts: 70 },
  wisp:    { name: 'Void Wisp', hp: 2, w: 16, h: 16, speed: 72, pts: 60 },
  pod:     { name: 'Acid Pod', hp: 3, w: 18, h: 18, pts: 80, every: 2.6 },
};

/** Feet height of the first floor at or below a marker. */
function floorBelow(m, c, r) {
  for (let rr = r; rr < m.R - 1; rr++) if (isFloor(tileAt(m, c, rr + 1))) return (rr + 1) * TILE;
  return (r + 1) * TILE;
}

/** Root an acid pod on the rock next to its marker (floor first, then ceiling, then walls). */
function mountPod(m, f, c, r) {
  const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2, L = 18;
  if (tileAt(m, c, r + 1) === ROCK) { f.mount = 'floor'; f.anchor = [cx, (r + 1) * TILE]; f.box = [cx - 8, (r + 1) * TILE - L, cx + 8, (r + 1) * TILE]; f.muzzle = [cx, (r + 1) * TILE - 15]; }
  else if (tileAt(m, c, r - 1) === ROCK) { f.mount = 'ceil'; f.anchor = [cx, r * TILE]; f.box = [cx - 8, r * TILE, cx + 8, r * TILE + L]; f.muzzle = [cx, r * TILE + 15]; }
  else if (tileAt(m, c - 1, r) === ROCK) { f.mount = 'left'; f.anchor = [c * TILE, cy]; f.box = [c * TILE, cy - 8, c * TILE + L, cy + 8]; f.muzzle = [c * TILE + 15, cy]; }
  else { f.mount = 'right'; f.anchor = [(c + 1) * TILE, cy]; f.box = [(c + 1) * TILE - L, cy - 8, (c + 1) * TILE, cy + 8]; f.muzzle = [(c + 1) * TILE - 15, cy]; }
  f.x = (f.box[0] + f.box[2]) / 2; f.y = f.box[3];
}

/**
 * Fill the planet's slots from the seeded stream. Every slot draws the same five numbers
 * whatever it becomes, so one slot's choice never shifts another's.
 */
export function spawnFoes(m, level, rng) {
  const out = [];
  const sp = Math.min(1.55, Math.pow(1.04, level - 1));             // pace grows 4% a planet
  const active = Math.min(1, 0.72 + 0.07 * (level - 1));            // share of slots filled
  m.slots.forEach((s, i) => {
    const on = rng.next() < active, kindRoll = rng.next(), eliteRoll = rng.next(), dir = rng.next() < 0.5 ? -1 : 1, phase = rng.next();
    if (!on) return;
    let kind;
    if (s.type === 'ground') kind = level >= 2 && kindRoll < Math.min(0.5, 0.22 + 0.04 * level) ? 'hopper' : 'crawler';
    else if (s.type === 'air') kind = 'wisp';
    else { if (level < 2) return; kind = 'pod'; }                    // planet 1 has no pods yet
    const d = FOES[kind], elite = level >= 3 && eliteRoll < Math.min(0.45, 0.05 * level);
    const hp = d.hp + (elite ? (level >= 8 ? 2 : 1) : 0) + (level >= 10 ? 1 : 0);
    const f = { id: i + 1, kind, x: s.c * TILE + TILE / 2, y: 0, vx: 0, vy: 0, dir, hp, max: hp, elite, sp, phase, t: 0,
      hurtT: 0, kbT: 0, kbv: 0, ground: false, moving: false, dead: false, tele: 0, teleMax: 0.5, cool: 0, hop: 0, crouch: 0, aggro: false };
    if (kind === 'crawler' || kind === 'hopper') f.y = floorBelow(m, s.c, s.r);
    else if (kind === 'wisp') f.y = s.r * TILE + TILE / 2 + d.h / 2;
    else mountPod(m, f, s.c, s.r);
    f.home = { x: f.x, y: f.y, dir };
    resetFoe(f);
    out.push(f);
  });
  return out;
}

function resetFoe(f) {
  f.x = f.home.x; f.y = f.home.y; f.dir = f.home.dir; f.vx = 0; f.vy = 0; f.hp = f.max;
  f.hurtT = 0; f.kbT = 0; f.kbv = 0; f.tele = 0; f.aggro = false; f.crouch = 0;
  f.cool = 1.0 + f.phase * 1.5; f.hop = 0.6 + f.phase; f.t = f.phase * 3;
}

/** The box an alien hurts (and is hurt) with. */
export function foeBox(f) {
  if (f.kind === 'pod') return f.box;
  const d = FOES[f.kind];
  return [f.x - d.w / 2, f.y - d.h, f.x + d.w / 2, f.y];
}

/** One alien's 1/120 s step (exported for check.mjs). */
export function stepFoe(sim, f) {
  const m = sim.m, p = sim.p, d = FOES[f.kind], rng = sim.rng;
  f.t += DT;
  if (f.hurtT > 0) f.hurtT -= DT;
  const hunt = !p.dead && p.hazard <= 0;
  if (f.kind === 'crawler') {
    if (f.kbT > 0) { f.kbT -= DT; f.vx = f.kbv; } else f.vx = f.dir * d.speed * f.sp;
    f.vy = Math.min(MAX_FALL, f.vy + GRAV * DT);
    const r = moveBody(f, d.w / 2, d.h, m, DT, true);
    f.ground = r.ground; f.moving = Math.abs(f.vx) > 1;
    if (f.kbT <= 0) {
      if (r.wall) f.dir = -r.wall;
      else if (f.ground) {                        // turn round at ledges and in front of spikes
        const c = Math.floor((f.x + f.dir * (d.w / 2 + 1)) / TILE);
        if (!isFloor(tileAt(m, c, Math.floor((f.y + 1) / TILE))) || isSpike(tileAt(m, c, Math.floor((f.y - 1) / TILE)))) f.dir = -f.dir;
      }
    }
  } else if (f.kind === 'hopper') {
    if (f.kbT > 0) { f.kbT -= DT; f.vx = f.kbv; }
    if (f.ground && f.kbT <= 0) {
      f.vx = 0;
      const dx = p.x - f.x, near = hunt && Math.abs(dx) < 220 && Math.abs(p.y - f.y) < 150;
      if (near) f.dir = dx < 0 ? -1 : 1;
      f.hop -= DT;
      f.crouch = f.hop < 0.35 ? 1 - Math.max(0, f.hop) / 0.35 : 0;   // squats before it springs
      if (f.hop <= 0) {
        if (near) { f.vy = -390 * Math.sqrt(f.sp); f.vx = f.dir * 125 * f.sp; } else { f.vy = -170; f.vx = 0; }
        f.ground = false; f.crouch = 0;
        f.hop = rng.range(1.0, 1.7) / f.sp;
        sim.ev.push({ type: 'hop', x: f.x, y: f.y, near });
      }
    }
    f.vy = Math.min(MAX_FALL, f.vy + GRAV * DT);
    const r = moveBody(f, d.w / 2, d.h, m, DT, true);
    f.ground = r.ground;
  } else if (f.kind === 'wisp') {
    const cy = f.y - d.h / 2, dx = p.x - f.x, dy = (p.y - PH / 2) - cy, dist = Math.hypot(dx, dy) || 1;
    if (f.kbT > 0) { f.kbT -= DT; f.vx *= 0.97; f.vy *= 0.97; }
    else {
      if (hunt && (dist < 165 || (f.aggro && dist < 300))) {
        f.aggro = true;
        f.vx += (dx / dist) * 300 * f.sp * DT; f.vy += (dy / dist) * 300 * f.sp * DT;
        f.dir = dx < 0 ? -1 : 1;
      } else {                                      // drift back and hover round its home
        f.aggro = false;
        const hx = f.home.x + Math.sin(f.t * 0.8 + f.phase * 6) * 18, hy = f.home.y + Math.sin(f.t * 1.6 + f.phase * 3) * 9;
        f.vx += (hx - f.x) * 2.2 * DT; f.vy += (hy - f.y) * 2.2 * DT;
        f.vx *= 0.985; f.vy *= 0.985;
        if (Math.abs(f.vx) > 4) f.dir = f.vx < 0 ? -1 : 1;
      }
      const v = Math.hypot(f.vx, f.vy), max = (f.aggro ? d.speed : 40) * f.sp;
      if (v > max) { f.vx *= max / v; f.vy *= max / v; }
    }
    f.vy += Math.sin(f.t * 5 + f.phase * 9) * 14 * DT;
    moveBody(f, d.w / 2, d.h, m, DT, false);
  } else {                                          // acid pod: aim, swell, spit
    const [mx, my] = f.muzzle, px = p.x, py = p.y - PH / 2;
    if (f.tele > 0) {
      f.tele -= DT;
      if (f.tele <= 0) {
        const dx = px - mx, dy = py - my, dist = Math.hypot(dx, dy) || 1, v = 150 * Math.sqrt(f.sp);
        sim.globs.push({ x: mx, y: my, vx: (dx / dist) * v, vy: (dy / dist) * v, t: 0, dead: false });
        sim.ev.push({ type: 'spit', x: mx, y: my });
        f.cool = (d.every / f.sp) * rng.range(0.85, 1.15);
      }
    } else if ((f.cool -= DT) <= 0) {
      if (hunt && Math.hypot(px - mx, py - my) < 270 && lineOfSight(m, mx, my, px, py)) { f.tele = f.teleMax; sim.ev.push({ type: 'charge', x: mx, y: my }); }
      else f.cool = 0.3;
    }
  }
  if (f.y > m.h + 40) f.dead = true;                 // fell out of the world (closed maps never allow it)
}

// ── One planet in play ───────────────────────────────────────
export class PlanetSim {
  /** def: a PLANETS entry; seed: this planet's seed; lo: the run's loadout (see LOADOUT). */
  constructor(def, level, seed, lo = LOADOUT) {
    this.level = level; this.lo = { ...LOADOUT, ...lo };
    this.m = parsePlanet(def);
    this.rng = makeRng(seed >>> 0);
    this.foes = spawnFoes(this.m, level, this.rng);
    this.p = makePlayer(this.m, this.lo);
    this.taken = new Array(this.m.dust.length).fill(false);
    this.bolts = []; this.globs = []; this.drops = [];
    this.dustGot = 0; this.kills = 0; this.hits = 0; this.t = 0; this.stop = 0; this.done = false;
    this.pend = { jump: false, slash: false, shoot: false };
    this.ev = [];
  }

  /** After a lost life: back to the landing spot with a fresh suit. Beaten aliens stay beaten. */
  respawn() {
    this.p = makePlayer(this.m, this.lo);
    this.p.inv = 1.0;                               // a moment's grace after "Get ready!"
    this.bolts = []; this.globs = []; this.drops = [];
    for (const f of this.foes) if (!f.dead) resetFoe(f);
    this.stop = 0; this.pend = { jump: false, slash: false, shoot: false };
  }

  /**
   * Advance 1/120 s. inp = { dir, aim (-1 up, 0, 1 down), jumpPress, jumpHeld, slashPress, shootPress }.
   * Returns this tick's events.
   */
  step(inp) {
    const ev = this.ev = [];
    if (this.done || this.p.dead) return ev;
    if (this.stop > 0) {                            // hit-stop: the world freezes for a few frames; presses wait
      this.stop -= DT;
      if (inp.jumpPress) this.pend.jump = true;
      if (inp.slashPress) this.pend.slash = true;
      if (inp.shootPress) this.pend.shoot = true;
      return ev;
    }
    const I = { dir: inp.dir || 0, aim: inp.aim || 0, jumpHeld: !!inp.jumpHeld,
      jumpPress: !!inp.jumpPress || this.pend.jump, slashPress: !!inp.slashPress || this.pend.slash, shootPress: !!inp.shootPress || this.pend.shoot };
    this.pend.jump = this.pend.slash = this.pend.shoot = false;
    this.t += DT;
    const p = this.p, m = this.m;

    if (p.hazard > 0) {                             // spiked: fade out, back to the last safe ground, fade in
      const before = p.hazard;
      p.hazard -= DT;
      if (before > HAZARD_T / 2 && p.hazard <= HAZARD_T / 2) {
        p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; p.ground = true;
        ev.push({ type: 'return', x: p.x, y: p.y });
      }
      if (p.hazard <= 0) { p.hazard = 0; p.inv = Math.max(p.inv, 0.7); }
    } else {
      p.inv = Math.max(0, p.inv - DT); p.atkCD -= DT; p.shotCD -= DT;
      if (p.shoot && (p.shoot.t += DT) > 0.3) p.shoot = null;
      // presses made a moment before the blade/blaster is ready still count (0.12 s buffer)
      p.slashBuf = I.slashPress ? 0.12 : Math.max(0, p.slashBuf - DT);
      p.shotBuf = I.shootPress ? 0.12 : Math.max(0, p.shotBuf - DT);
      if (p.slashBuf > 0 && p.atkCD <= 0) { p.slashBuf = 0; this.slash(I); }
      if (p.shotBuf > 0 && p.shotCD <= 0) { p.shotBuf = 0; this.fire(I); }
      const wasGround = p.ground, vy0 = p.vy;
      if (stepPlayer(p, I, m)) ev.push({ type: 'jump', x: p.x, y: p.y });
      if (p.ground && !wasGround) { p.pogos = 0; ev.push({ type: 'land', x: p.x, y: p.y, hard: vy0 > 330 }); }
      if (p.atk) this.stepSlash();
      if (touchesSpikes(p, m) || p.y > m.h + 60) this.spiked();
      else if (p.ground && p.kbT <= 0) this.markSafe();
    }
    for (const f of this.foes) if (!f.dead) stepFoe(this, f);
    this.stepBolts(); this.stepGlobs(); this.stepDrops();
    if (!p.dead && p.hazard <= 0) { this.contact(); this.collect(); }
    return ev;
  }

  markSafe() {
    const p = this.p, m = this.m;
    if (!isFloor(tileAtPx(m, p.x - PW / 2 + 1, p.y + 1)) || !isFloor(tileAtPx(m, p.x + PW / 2 - 1, p.y + 1))) return;
    const rf = Math.floor((p.y - 1) / TILE), c0 = Math.floor((p.x - PW / 2 - TILE) / TILE), c1 = Math.floor((p.x + PW / 2 + TILE) / TILE);
    for (let c = c0; c <= c1; c++) if (isSpike(tileAt(m, c, rf)) || isSpike(tileAt(m, c, rf - 1))) return;
    p.safe.x = p.x; p.safe.y = p.y;
  }

  slash(I) {
    const p = this.p;
    const kind = I.aim < 0 ? 'up' : I.aim > 0 && !p.ground ? 'down' : 'side';
    p.atk = { kind, t: 0, face: p.face, hit: new Set(), pogo: false };
    p.atkCD = SLASH_CD;
    this.ev.push({ type: 'slash', kind });
  }

  stepSlash() {
    const p = this.p, a = p.atk;
    a.t += DT;
    if (a.t >= SLASH_T) { p.atk = null; return; }
    if (a.t < SLASH_ON[0] || a.t > SLASH_ON[1]) return;
    const b = slashBox(p, a.kind, a.face);
    for (const f of this.foes) {
      if (f.dead || a.hit.has(f.id) || !hit4(b, foeBox(f))) continue;
      a.hit.add(f.id);
      p.energy = Math.min(this.lo.energy, p.energy + 1);        // blade hits charge the blaster
      this.damageFoe(f, this.lo.blade, a.kind, a.face);
      if (a.kind === 'down') this.pogo(a);
      else if (a.kind === 'side' && p.kbT <= 0) p.vx -= a.face * 70;
    }
    for (const g of this.globs) {
      if (!g.dead && circleBox(g.x, g.y, 5, b)) { g.dead = true; this.ev.push({ type: 'parry', x: g.x, y: g.y }); if (a.kind === 'down') this.pogo(a); }
    }
    if (a.kind === 'down' && !a.pogo && boxHitsSpikes(this.m, b[0], b[1], b[2], b[3])) {
      this.pogo(a); this.ev.push({ type: 'clink', x: p.x, y: b[3] - 8 });
    }
  }

  pogo(a) {
    if (a.pogo) return;
    const p = this.p;
    a.pogo = true;
    p.vy = POGO_V; p.jumped = false; p.ground = false; p.coyote = 0; p.buffer = 0;
    p.pogos++;
    this.ev.push({ type: 'pogo', x: p.x, y: p.y, n: p.pogos });
  }

  fire(I) {
    const p = this.p;
    if (p.energy < 1) { p.shotCD = 0.3; this.ev.push({ type: 'empty', x: p.x, y: p.y - PH }); return; }
    const dir = I.aim < 0 ? 'up' : I.aim > 0 && !p.ground ? 'down' : 'side';
    p.energy -= 1; p.shotCD = SHOT_CD; p.shoot = { dir, t: 0 };
    const x = p.x + p.face * (dir === 'side' ? 12 : 4), y = dir === 'up' ? p.y - PH - 6 : dir === 'down' ? p.y + 2 : p.y - 18;
    this.bolts.push({ x, y, vx: dir === 'side' ? p.face * BOLT_V : 0, vy: dir === 'up' ? -BOLT_V : dir === 'down' ? BOLT_V : 0, t: 0, dead: false });
    if (dir === 'side' && p.kbT <= 0) p.vx -= p.face * 45;
    this.ev.push({ type: 'shoot', x, y, dir });
  }

  damageFoe(f, dmg, by, face) {
    const p = this.p;
    f.hp -= dmg; f.hurtT = 0.16;
    const dx = by === 'side' || by === 'bolt' ? face : (Math.sign(f.x - p.x) || face);
    if (f.kind === 'crawler' || f.kind === 'hopper') {
      f.kbT = 0.14; f.kbv = dx * (by === 'bolt' ? 110 : 175);
      if (by === 'up' && f.ground) { f.vy = -150; f.ground = false; }
    } else if (f.kind === 'wisp') {
      f.kbT = 0.24; f.vx = dx * 240; f.vy = by === 'up' ? -240 : by === 'down' ? 240 : -40;
    }
    const b = foeBox(f), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    if (f.hp <= 0) {
      f.dead = true; this.kills++;
      this.ev.push({ type: 'kill', id: f.id, x: cx, y: cy, foe: f.kind, elite: f.elite, by, pts: Math.round(FOES[f.kind].pts * (f.elite ? 1.5 : 1)) });
      this.dropLoot(f, cx, cy);
      this.stop = Math.max(this.stop, 0.07);
    } else {
      this.ev.push({ type: 'hit', x: cx, y: cy, foe: f.kind, by });
      this.stop = Math.max(this.stop, by === 'bolt' ? 0.02 : 0.045);
    }
  }

  dropLoot(f, x, y) {
    const rng = this.rng, n = (rng.next() < 0.65 ? 1 : 0) + (f.elite ? 1 : 0), kit = rng.next() < (f.elite ? 0.25 : 0.08);
    for (let i = 0; i < n; i++) this.drops.push({ kind: 'orb', x, y: y + 4, vx: rng.range(-70, 70), vy: rng.range(-280, -170), t: 0, dead: false });
    if (kit) this.drops.push({ kind: 'kit', x, y: y + 4, vx: rng.range(-40, 40), vy: -250, t: 0, dead: false });
  }

  stepBolts() {
    for (const b of this.bolts) {
      if ((b.t += DT) > BOLT_LIFE) { b.dead = true; continue; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (tileAtPx(this.m, b.x, b.y) === ROCK) { b.dead = true; this.ev.push({ type: 'spark', x: b.x, y: b.y }); continue; }
      for (const f of this.foes) {
        if (f.dead) continue;
        const fb = foeBox(f);
        if (b.x > fb[0] - 3 && b.x < fb[2] + 3 && b.y > fb[1] - 3 && b.y < fb[3] + 3) { b.dead = true; this.damageFoe(f, this.lo.blaster, 'bolt', Math.sign(b.vx) || this.p.face); break; }
      }
      if (b.dead) continue;
      for (const g of this.globs) if (!g.dead && Math.hypot(g.x - b.x, g.y - b.y) < 8) { g.dead = true; b.dead = true; this.ev.push({ type: 'parry', x: g.x, y: g.y }); break; }
    }
    this.bolts = this.bolts.filter((b) => !b.dead);
  }

  stepGlobs() {
    for (const g of this.globs) {
      if ((g.t += DT) > 4) { g.dead = true; continue; }
      g.x += g.vx * DT; g.y += g.vy * DT;
      if (tileAtPx(this.m, g.x, g.y) === ROCK) { g.dead = true; this.ev.push({ type: 'splat', x: g.x, y: g.y }); }
    }
    this.globs = this.globs.filter((g) => !g.dead);
  }

  /** Energy orbs and suit-repair kits: fall, settle, and drift to the astronaut when he needs them. */
  stepDrops() {
    const p = this.p;
    for (const d of this.drops) {
      if ((d.t += DT) > 12) { d.dead = true; continue; }
      const want = d.kind === 'orb' ? p.energy < this.lo.energy : p.pips < this.lo.pips;
      const dx = p.x - d.x, dy = (p.y - PH / 2) - (d.y - 4), dist = Math.hypot(dx, dy) || 1;
      if (want && !p.dead && p.hazard <= 0 && d.t > 0.35 && dist < 72) {
        d.vx = (d.vx + (dx / dist) * 1100 * DT) * 0.96; d.vy = (d.vy + (dy / dist) * 1100 * DT) * 0.96;
        d.x += d.vx * DT; d.y += d.vy * DT;
        continue;
      }
      d.vy = Math.min(420, d.vy + 950 * DT);
      const r = moveBody(d, 4, 8, this.m, DT, true);
      if (r.ground) d.vx *= 0.86;
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  hurt(n, fromX) {
    const p = this.p;
    if (p.inv > 0 || p.hazard > 0 || p.dead) return;
    p.hits++; this.hits++; p.pips -= n; p.inv = INV_T; p.atk = null;
    const d = Math.sign(p.x - fromX) || -p.face;
    p.vx = d * 240; p.vy = -300; p.kbT = KB_T; p.ground = false; p.jumped = false;
    this.ev.push({ type: 'hurt', x: p.x, y: p.y - PH / 2, pips: p.pips });
    this.stop = Math.max(this.stop, 0.08);
    if (p.pips <= 0) { p.pips = 0; p.dead = true; this.ev.push({ type: 'dead' }); }
  }

  spiked() {
    const p = this.p;
    p.hits++; this.hits++; p.pips -= 1; p.atk = null; p.shoot = null; p.vx = 0; p.vy = 0; p.kbT = 0;
    this.ev.push({ type: 'spike', x: p.x, y: p.y - PH / 2, pips: p.pips });
    this.stop = Math.max(this.stop, 0.06);
    if (p.pips <= 0) { p.pips = 0; p.dead = true; this.ev.push({ type: 'dead' }); return; }
    p.hazard = HAZARD_T;
  }

  contact() {
    const p = this.p;
    if (p.inv > 0) return;
    const pb = [p.x - PW / 2 + 2, p.y - PH + 3, p.x + PW / 2 - 2, p.y - 1];
    for (const f of this.foes) if (!f.dead && hit4(pb, inset(foeBox(f), 2.5))) { this.hurt(1, f.x); return; }
    for (const g of this.globs) {
      if (!g.dead && circleBox(g.x, g.y, 4.5, pb)) { g.dead = true; this.ev.push({ type: 'splat', x: g.x, y: g.y }); this.hurt(1, g.x - g.vx); return; }
    }
  }

  collect() {
    const p = this.p, m = this.m;
    for (const i of dustTouched(p, m, this.taken)) {
      this.taken[i] = true; this.dustGot++;
      this.ev.push({ type: 'dust', x: m.dust[i].x, y: m.dust[i].y, all: this.dustGot === m.dust.length });
    }
    for (const d of this.drops) {
      const dx = p.x - d.x, dy = (p.y - PH / 2) - (d.y - 4);
      if (dx * dx + dy * dy > 16 * 16) continue;
      if (d.kind === 'orb' && p.energy < this.lo.energy) { d.dead = true; p.energy++; this.ev.push({ type: 'orb', x: d.x, y: d.y - 4 }); }
      else if (d.kind === 'kit' && p.pips < this.lo.pips) { d.dead = true; p.pips++; this.ev.push({ type: 'repair', x: d.x, y: d.y - 4 }); }
    }
    if (!this.done && atExit(p, m)) { this.done = true; this.ev.push({ type: 'exit', x: m.exit.x, y: m.exit.y, clean: this.hits === 0 }); }
  }
}

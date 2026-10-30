// Benchmark contract for Star Strike 3D (see tools/bench.mjs). The bot flies like a mouse player:
// it holds Space to fire and steers by pointing (onPointerMove with the button up, the way the
// engine passes a hovering mouse; the ship chases the pointer). Every look it works out, for each
// thing coming down the tunnel, when it will reach the ship's depth and where it will be then —
// enemy bolts on their straight lines, rocks drifting, swarmers on their weave, divers and shards
// homing in, laser gates (be inside the gap), laser fences (be away from the beam's height then),
// mines, cruisers — and picks the spot on a grid across the tunnel that the ship can reach in
// time and that stays clear of all of it, preferring a spot lined up with the nearest enemy (or
// the boss, or the next golden ring in a Ring Run). Lower skill looks less often, notices things
// later, leaves less room and aims sloppier. The mistake: stop firing and fly into the next rock,
// mine or bolt (until it really costs a life — a shield only postpones it).
const W = 480, H = 720;
const SHIP_Z = 4.5, XMAX = 3, YMAX = 2;
const STEP = 1 / 120;
const XS = Array.from({ length: 25 }, (_, i) => -XMAX + i * 0.25);
const YS = Array.from({ length: 17 }, (_, i) => -YMAX + i * 0.25);
const NOHIT = new Set(['seg', 'gun', 'plate', 'pod', 'pylon', 'ring', 'pickup']);
const BOSS = new Set(['mother', 'head', 'core']);

/** Pointer position that makes the ship fly to (x, y) (the inverse of the game's onPointerMove). */
const toScreen = (x, y) => [W / 2 + (x / (XMAX * 1.1)) * (W / 2), 470 - (y / YMAX) * 90];

/** How the ship gets from where it is to (tx, ty): at 9 / 7 units a second, straight for it. */
function shipAt(sh, tx, ty, t) {
  const dx = tx - sh.x, dy = ty - sh.y;
  return [sh.x + Math.sign(dx) * Math.min(Math.abs(dx), 9 * t), sh.y + Math.sign(dy) * Math.min(Math.abs(dy), 7 * t)];
}

/** When an entity will reach the ship's depth (s from now), or null if it won't / not soon. */
function arrival(g, e) {
  const v = g.speed;
  if (e.z < SHIP_Z + 0.8) return null;
  let sp;
  switch (e.kind) {
    case 'fighter': case 'phantom':
      if (e.holdT > 0) { const toHold = Math.max(0, (e.z - e.hold) / (v * 0.9)); return toHold + e.holdT + (e.hold - SHIP_Z - 0.8) / (v * 0.8); }
      sp = v * 0.8; break;
    case 'cruiser':
      if (e.holdT > 0) { const toHold = Math.max(0, (e.z - e.hold) / (v * 0.7)); return toHold + e.holdT + (e.hold - SHIP_Z - 0.8) / (v * 0.6); }
      sp = v * 0.6; break;
    case 'swarm': sp = v * 1.05; break;
    case 'splitter': sp = v * 0.9; break;
    case 'shard': sp = v * 1.15; break;
    case 'diver': sp = v * 1.25; break;
    case 'layer': sp = v * 0.25; break;
    case 'ring': sp = v * 1.1; break;
    case 'pickup': sp = v * 0.75; break;
    default: sp = v;
  }
  return (e.z - (SHIP_Z + 0.8)) / sp;
}

/** Where an entity will be (x, y) after t s, given where the ship will be (for homing ones). */
function entAt(g, e, t, sx, sy) {
  switch (e.kind) {
    case 'swarm': { const ph = e.ph + t * 2.2; return [e.cx + Math.sin(ph) * e.A, e.cy + Math.cos(ph * 0.8) * e.A * 0.55]; }
    case 'rock': return [e.x + e.drift[0] * t, e.y + e.drift[1] * t];
    case 'shard': return [e.x + e.vx * t + Math.sign(sx - e.x) * t * t, e.y + e.vy * t + Math.sign(sy - e.y) * t * t];
    case 'diver': {
      const lock = Math.max(0, Math.min(t, t - Math.max(0, (e.z - 40) / (g.speed * 1.25))));
      const dx = sx - e.x, dy = sy - e.y;
      return [e.x + Math.sign(dx) * Math.min(Math.abs(dx), 2.2 * lock), e.y + Math.sign(dy) * Math.min(Math.abs(dy), 1.8 * lock)];
    }
    case 'layer': return [e.x + e.dir * 2.6 * t, e.y];
    case 'fighter': case 'phantom': case 'cruiser': return [e.x, e.y];
    default: return [e.x, e.y];
  }
}

/** Everything that can hurt the ship, as tests run against a candidate path. */
function threats(g, b) {
  const out = [], m = b.mem, skill = b.skill;
  m.seenAt ??= new WeakMap();
  const look = 0.02 + (1 - skill) * 0.6;                  // s from something appearing to taking it in
  const noticed = (o) => { let t = m.seenAt.get(o); if (t == null) { t = b.t; m.seenAt.set(o, t); } return b.t - t >= look; };
  for (const e of g.ents) {
    if (e.dead || e.checked || NOHIT.has(e.kind) || BOSS.has(e.kind) || !noticed(e)) continue;
    if (e.kind === 'fence' && e.link.alive < 2) continue;
    const t = arrival(g, e);
    if (t == null || t > 2.2) continue;
    out.push({ e, t });
  }
  for (const bo of g.bolts) {
    if (bo.checked || bo.dead || !noticed(bo)) continue;
    const t = bo.wait + (bo.z - (SHIP_Z + 0.3)) / -bo.vz;
    if (t < 0 || t > 2.2) continue;
    const tm = Math.max(0, t - bo.wait);
    out.push({ bolt: true, x: bo.x + bo.vx * tm, y: bo.y + bo.vy * tm, t });
  }
  return out;
}

/** Danger of heading for (tx, ty): how soon and how surely it ends in a hit, plus near misses. */
function danger(g, list, tx, ty, margin) {
  const sh = g.ship;
  let hard = 0, soft = 0;
  for (const th of list) {
    const t = th.t;
    const [sx, sy] = shipAt(sh, tx, ty, t + STEP);
    let cx, cy;   // how far inside the hit box the ship would be (> 0 = hit)
    if (th.bolt) { cx = 0.75 + margin - Math.abs(th.x - sx); cy = 0.45 + margin - Math.abs(th.y - sy); }
    else {
      const e = th.e;
      if (e.kind === 'gate') {
        cx = Math.abs(sx - e.gx) - (e.gw / 2 - 0.3 - margin); cy = Math.abs(sy - e.gy) - (e.gh / 2 - 0.2 - margin);
        if (cx > 0 || cy > 0) { hard = Math.max(hard, 3 - t); } else soft += Math.max(0, 0.25 + Math.max(cx, cy)) * 4;
        continue;
      }
      if (e.kind === 'fence') {
        const fy = Math.sin((g.t + t) * e.link.spd + e.link.phase) * (YMAX - 0.2);
        const c = 0.38 + margin - Math.abs(sy - fy);
        if (c > 0) hard = Math.max(hard, 3 - t); else soft += Math.max(0, 0.3 + c) * 4;
        continue;
      }
      if (e.kind === 'phantom' && Math.sin((e.phase + t) * 1.4) < -0.6) continue;   // cloaked as it passes
      const [ex, ey] = entAt(g, e, t, sx, sy);
      const size = e.kind === 'rock' ? e.size + 0.45 : e.kind === 'mine' ? 1.1 : e.kind === 'cruiser' || e.kind === 'layer' ? 1.6 : 0.9;
      cx = size + margin - Math.abs(ex - sx); cy = size * 0.8 + margin - Math.abs(ey - sy);
    }
    if (cx > 0 && cy > 0) hard = Math.max(hard, 3 - t);
    else soft += Math.max(0, 0.35 + Math.min(cx, cy)) * 3;
  }
  return hard * 1000 + soft;
}

/** What to line up with: the boss (or its open parts), else the nearest enemy in front. */
function aimPoint(g) {
  const sh = g.ship;
  if (g.bonus) {
    const ring = g.ents.filter((e) => e.kind === 'ring' && !e.checked && e.z > SHIP_Z + 1).sort((p, q) => p.z - q.z)[0];
    return ring ? [ring.x, ring.y] : null;
  }
  const shootable = g.ents.filter((e) => !e.dead && e.kind !== 'gate' && e.kind !== 'fence' && e.kind !== 'ring' && e.kind !== 'plate' && e.z > SHIP_Z + 2 && e.z < (BOSS.has(e.kind) || e.kind === 'seg' || e.kind === 'gun' ? 105 : 75)
    && !(e.kind === 'cruiser' && g.ents.some((p) => p.kind === 'pod' && p.parent === e && !p.dead))
    && !(e.kind === 'head' && e.armour));
  if (!shootable.length) return null;
  // nearest first; things that will run into us (rocks, mines, divers) count as nearer
  const pri = (e) => e.z - (['rock', 'mine', 'diver', 'shard', 'splitter'].includes(e.kind) ? 15 : 0) - (e.kind === 'pickup' ? 10 : 0) + (BOSS.has(e.kind) ? 5 : 0);
  shootable.sort((p, q) => pri(p) - pri(q));
  const e = shootable[0];
  const t = Math.max(0, (e.z - SHIP_Z) / (90 + g.speed));                 // shots fly at 90
  return entAt(g, e, t, sh.x, sh.y);
}

function plan(g, b) {
  const skill = b.skill, sh = g.ship;
  const margin = 0.02 + skill * 0.2;
  const list = threats(g, b);
  const want = aimPoint(g) || [sh.x * 0.7, -0.6];
  const cost = (x, y) => (g.bonus ? 0 : danger(g, list, x, y, margin)) + Math.abs(x - want[0]) * 2 + Math.abs(y - want[1]) * 2 + (Math.abs(x - sh.x) + Math.abs(y - sh.y)) * 0.2;
  // a coarse look across the tunnel (every 0.5), then a closer one around the three best spots
  const coarse = [];
  for (let i = 0; i < XS.length; i += 2) for (let j = 0; j < YS.length; j += 2) coarse.push({ i, j, c: cost(XS[i], YS[j]) });
  coarse.sort((p, q) => p.c - q.c);
  let best = [XS[coarse[0].i], YS[coarse[0].j]], bc = coarse[0].c;
  for (const { i, j } of coarse.slice(0, 3)) {
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if ((!di && !dj) || XS[i + di] === undefined || YS[j + dj] === undefined) continue;
      const c = cost(XS[i + di], YS[j + dj]);
      if (c < bc) { bc = c; best = [XS[i + di], YS[j + dj]]; }
    }
  }
  return best;
}

const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());

function bot(g, s, b) {
  const m = b.mem;
  if (m.crash) {
    if (s.livesLost > m.crash.lives) m.crash = null;
    else { crashInto(g, s); return; }
  }
  const every = 0.02 + (1 - b.skill) * 0.4;                 // s between looks
  if (m.next == null || b.t >= m.next) {
    const p = plan(g, b);
    const shake = (1 - b.skill) * 0.5;
    m.goal = [p[0] + gauss(b.rand) * shake, p[1] + gauss(b.rand) * shake];
    m.next = b.t + every * (0.6 + b.rand() * 0.8);
  }
  s.hold(g.bonus ? [] : ['action']);
  const [px, py] = toScreen(m.goal[0], m.goal[1]);
  s.pointerMove(px, py);
}

/** Stop firing and fly at the next rock, mine or bolt. Returns false when nothing is coming. */
function crashInto(g, s) {
  s.hold([]);
  let best = null;
  for (const e of g.ents) {
    if (e.dead || e.checked || !['rock', 'mine', 'fighter', 'swarm', 'splitter', 'shard', 'diver'].includes(e.kind)) continue;
    const t = arrival(g, e);
    if (t == null || t > 1.5) continue;
    if (!best || t < best.t) best = { t, at: entAt(g, e, t, g.ship.x, g.ship.y) };
  }
  for (const bo of g.bolts) {
    if (bo.checked) continue;
    const t = bo.wait + (bo.z - (SHIP_Z + 0.3)) / -bo.vz;
    if (t < 0 || t > 1.5) continue;
    const tm = Math.max(0, t - bo.wait);
    if (!best || t < best.t) best = { t, at: [bo.x + bo.vx * tm, bo.y + bo.vy * tm] };
  }
  if (!best) return false;
  const [px, py] = toScreen(Math.max(-XMAX, Math.min(XMAX, best.at[0])), Math.max(-YMAX, Math.min(YMAX, best.at[1])));
  s.pointerMove(px, py);
  return true;
}

const track = new WeakMap();

export default {
  levels: 20,                           // endless game: bench levels 1–20
  // a sector lasts 40 + 1.4 × level s (max 60) plus the time for the last wave to pass; boss
  // sectors add the fight (~10–40 s); a lost life costs no time
  limit: (level) => 75 + Math.min(20, level * 1.4) + (level % 5 === 4 ? 90 : 0),
  stuck: 35,                            // waves come every ~1 s; a real Hydra fight (it fires since its 30 Oct fix) can mean ~20 s of dodging between tail hits

  // seconds through the sector, then kills, things gone by and damage done to the boss
  progress(g) {
    const ahead = g.ents.reduce((a, e) => a + (e.z >= SHIP_Z - 2 && e.kind !== 'pickup' ? 1 : 0), 0);
    const boss = g.boss ? g.boss.max - g.boss.hp : 0;
    return Math.min(g.sectorT, g.sectorLen) + g.kills + boss - ahead * 0.001 + (g.bossDead ? 1000 : 0) + (g.boss?.armour === false ? 50 : 0);
  },

  invariants(g, s) {
    const sh = g.ship;
    if (![sh.x, sh.y, sh.bank, sh.pitch].every(Number.isFinite)) return 'the ship position is not a number';
    if (Math.abs(sh.x) > XMAX + 1e-9 || Math.abs(sh.y) > YMAX + 1e-9) return `the ship left the tunnel at (${sh.x.toFixed(2)}, ${sh.y.toFixed(2)})`;
    const w = g.weapon;
    if (!['laser', 'spread', 'plasma'].includes(w.type) || !(w.lvl >= 1 && w.lvl <= 3) || !(w.t >= -STEP && w.t <= 20)) return `weapon ${w.type} level ${w.lvl} timer ${w.t}`;
    if (!(g.bombs >= 0 && g.bombs <= 5)) return `${g.bombs} bombs`;
    if (g.invuln > 2.2 + 1e-9) return `invulnerable for ${g.invuln} s`;
    if (!Number.isInteger(g.kills) || g.kills < 0) return `kills is ${g.kills}`;
    for (const e of g.ents) {
      if (e.kind === 'fence') { if (!Number.isFinite(e.z)) return 'a laser fence position is not a number'; continue; }
      if (e.kind === 'gate') { if (![e.z, e.gx, e.gy].every(Number.isFinite)) return 'a laser gate position is not a number'; continue; }
      if (![e.x, e.y, e.z].every(Number.isFinite)) return `a ${e.kind} position is not a number`;
      if (e.hp != null && !(e.hp <= (e.max ?? 12) + 1e-9)) return `a ${e.kind} has ${e.hp} hp`;
      if (e.z > 135) return `a ${e.kind} is at z ${e.z.toFixed(0)} (waves spawn at 95–131)`;
    }
    if (g.boss) {
      if (!(g.boss.hp > 0 && g.boss.hp <= g.boss.max)) return `the boss has ${g.boss.hp} of ${g.boss.max} hp but is alive`;
      if (!g.ents.includes(g.boss)) return 'the boss is not in the tunnel';
    }
    if (g.bossLevel && g.bossDead && g.boss) return 'the boss is dead and alive';
    if (!g.bossLevel && g.boss) return 'a boss in a sector without one';
    for (const bo of g.bolts) {
      if (![bo.x, bo.y, bo.z, bo.vx, bo.vy].every(Number.isFinite)) return 'an enemy bolt position is not a number';
      if (Math.abs(bo.vz + (26 + g.level * 0.8)) > 1e-6) return `an enemy bolt flies at ${-bo.vz} (should be ${26 + g.level * 0.8})`;
    }
    for (const sh2 of g.shots) if (![sh2.x, sh2.y, sh2.z].every(Number.isFinite) || sh2.z > 110 + 2) return 'a shot left the tunnel';
    if (g.ents.length > 400 || g.shots.length > 400 || g.bolts.length > 400) return `too many objects (${g.ents.length} things, ${g.shots.length} shots, ${g.bolts.length} bolts)`;
    // a sector ends once its clock has run and everything has gone by (or the boss is down)
    const t = track.get(g) || { over: null };
    if (!g.bonus && !g.bossLevel && g.sectorT >= g.sectorLen && g.ents.every((e) => e.z < SHIP_Z - 2 || e.kind === 'pickup')) {
      t.over ??= g.t;
      if (g.t - t.over > 0.1) return 'the sector is over but it never finished';
    } else t.over = null;
    track.set(g, t);
    return null;
  },

  bot,

  mistake(g, s, b) {
    if (!crashInto(g, s)) { bot(g, s, b); return false; }
    b.mem.crash = { lives: s.livesLost };
    return true;
  },
};

// Benchmark contract for TC Pixel Craft (see tools/bench.mjs). A level is one day: it ends at the
// next sunrise, so the job is to live through the night. The bot plays like a careful survivor,
// with the game's own inputs: W/A/S/D (+ Shift) to walk, Space to jump, the mouse to look, J to
// mine (hold; it punches bare-handed), K to use / place, Q to eat, the number keys to pick a hotbar
// slot. By day it walks
// the surface (a search over the island's heights: a step up of one block at most, never a long
// drop) to the nearest trees and chops logs, eats when it's getting hungry, and runs from any
// monster that comes close. Before dark it digs the classic emergency shelter: picks a spot of
// soft ground whose surroundings are solid (no cave or water next to the hole), digs three blocks
// straight down, and seals the hole above its head with one of the dirt blocks it dug — nothing
// can reach it there — and waits for the sun. On a ★ Starfall round it runs for the stars.
// Lower skill turns the view more slowly, spots monsters later, and heads for shelter later
// (some average days it is still digging when night falls) or not at all (about half the
// average nights it stays out in the open, running from what comes); now and then it doesn't
// check the walls of its hole. The mistake: walk into the nearest deep water and stay under
// (drowning) — or, with no deep water in reach, spend the night out in the open.
import { B, INFO } from './items.js';
import { SX, SY, SZ, SEA } from './world.js';

const CYCLE = 200;
// Headless there's no WebGL: the game says so on every start and falls back to its software
// view, which the bench never draws. Keep that one note out of the benchmark's output.
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith('WebGL renderer unavailable')) warn(...a); };
const OPEN = new Set([B.AIR, B.WATER, B.LAVA, B.TORCH, B.BUSH, B.BUSH_RIPE, B.MUSHROOM]);
const SOFT = new Set([B.GRASS, B.DIRT, B.SAND, B.SNOW, B.GRAVEL]);
const HOSTILE = new Set(['gloom', 'thorn', 'boom', 'crawler', 'king']);
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const angDiff = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const solid = (w, x, y, z) => !OPEN.has(w.get(x, y, z));

/** Where you'd stand in a column: the highest solid block (not a tree) with two free blocks over it. */
function standY(w, x, z) {
  if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) return -1;
  for (let y = Math.min(SY - 3, w.top[z * SX + x]); y >= 1; y--) {
    const v = w.get(x, y, z);
    if (OPEN.has(v) || v === B.LEAVES) continue;          // under a tree's leaves is fine if they're high enough
    if (v === B.LOG || v === B.CACTUS) return -1;
    return solid(w, x, y + 1, z) || solid(w, x, y + 2, z) ? -1 : y;
  }
  return -1;
}

/** A walk over the island's surface from the player's column (BFS: up one block at most, down three). */
function surfaceSearch(g, goal, maxN = 4096, wade = false) {
  const w = g.world, sx = Math.floor(g.p.x), sz = Math.floor(g.p.z);
  const H = new Int16Array(SX * SZ).fill(-2), prev = new Int32Array(SX * SZ).fill(-1);
  const h = (x, z) => { const i = z * SX + x; if (H[i] === -2) H[i] = standY(w, x, z); return H[i]; };
  const start = sz * SX + sx; prev[start] = start;
  const q = [start];
  for (let k = 0; k < q.length && k < maxN; k++) {
    const i = q[k], x = i % SX, z = (i / SX) | 0;
    const hy = i === start ? Math.floor(g.p.y) - 1 : h(x, z);
    if (i !== start && goal(x, z, hy)) {
      const path = [];
      for (let j = i; j !== start; j = prev[j]) path.unshift([j % SX, (j / SX) | 0]);
      return path;
    }
    if (i !== start && !wade && w.get(x, hy + 1, z) === B.WATER) continue;      // don't plan routes through water
    for (const [dx, dz] of DIRS4) {
      const nx = x + dx, nz = z + dz, j = nz * SX + nx;
      if (prev[j] >= 0) continue;
      const ny = h(nx, nz);
      if (ny < 0 || ny - hy > 1 || hy - ny > 3) continue;
      if (w.get(nx, ny + 1, nz) === B.LAVA || w.get(nx, ny, nz) === B.LAVA || w.get(nx, ny, nz) === B.CACTUS) continue;
      prev[j] = i; q.push(j);
    }
  }
  return null;
}

/** Turn the view toward (yaw, pitch) at a mouse speed that depends on skill. Returns true when on it. */
function look(g, b, yaw, pitch) {
  const rate = (2.5 + 7 * b.skill) / 120;
  const dy = angDiff(yaw - g.yaw), dp = pitch - g.pitch;
  g.yaw += Math.max(-rate, Math.min(rate, dy));
  g.pitch = Math.max(-1.5, Math.min(1.5, g.pitch + Math.max(-rate, Math.min(rate, dp))));
  return Math.abs(angDiff(yaw - g.yaw)) < 0.02 && Math.abs(pitch - g.pitch) < 0.02;
}
function keys(g, list) {
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyJ']) if (!list.includes(k)) g.keys.delete(k);
  for (const k of list) g.keys.add(k);
}
const hostiles = (g) => g.mobs.filter((m) => HOSTILE.has(m.type) && !m.dead);
const slotOf = (g, test) => { for (let i = 0; i < 9; i++) if (g.inv[i] && test(g.inv[i].id)) return i; return -1; };
/** Mine with a bare hand (or a real tool): put away a block before punching. */
function bareHand(g) {
  const it = g.held();
  if (!it || INFO[it.id].speed) return;
  for (let i = 0; i < 9; i++) if (!g.inv[i] || INFO[g.inv[i].id].speed) { g.select(i); return; }
}

/** Walk the path (list of columns). Returns 'done' at the end, 'stuck' when it can't get on. */
function follow(g, b, m, sprint) {
  const p = g.p, path = m.route;
  while (path.length && Math.hypot(path[0][0] + 0.5 - p.x, path[0][1] + 0.5 - p.z) < (path.length > 1 ? 0.45 : 0.25)) path.shift();
  if (!path.length) { keys(g, []); return 'done'; }
  const [tx, tz] = path[0];
  const yaw = Math.atan2(tx + 0.5 - p.x, tz + 0.5 - p.z);
  look(g, b, yaw, -0.15);
  const off = Math.abs(angDiff(yaw - g.yaw));
  const k = [];
  if (off < 0.6) k.push('KeyW');
  if (sprint && off < 0.3 && path.length > 2) k.push('ShiftLeft');
  if (p.inWater) k.push('Space');
  // a step up ahead: the game hops single blocks by itself; help it when we've slowed right down
  const speed = Math.hypot(p.vx, p.vz);
  m.slowT = speed < 0.6 && off < 0.6 ? (m.slowT || 0) + 1 / 120 : 0;
  if (m.slowT > 0.3) k.push('Space');
  keys(g, k);
  return m.slowT > 2.5 ? 'stuck' : 'go';
}

/** A good spot for the hole: soft ground, solid all round the pocket, nothing liquid near. */
function goodSite(g, x, z, y, careful) {
  const w = g.world;
  if (y < SEA + 2 || y < 5) return false;
  for (let k = 0; k <= 2; k++) if (!SOFT.has(w.get(x, y - k, z))) return false;
  const v3 = w.get(x, y - 3, z);
  if (OPEN.has(v3)) return false;                        // a cave right under the hole
  if (!careful) return true;
  for (let yy = y - 3; yy <= y + 1; yy++) for (const [dx, dz] of DIRS4) {
    const v = w.get(x + dx, yy, z + dz);
    if (v === B.WATER || v === B.LAVA) return false;
    if (yy <= y - 1 && OPEN.has(v)) return false;          // the pocket's walls must be solid
  }
  return true;
}

/** Aim so the crosshair puts a block into the cell (cx, cy, cz). Returns [yaw, pitch] or null. */
function aimToPlace(g, cx, cy, cz) {
  const y0 = g.yaw, p0 = g.pitch;
  let best = null;
  for (let a = 0; a < 16 && !best; a++) for (const pitch of [1.0, 0.9, 1.1, 0.8, 1.2, 0.7, 1.3]) {
    g.yaw = (a * Math.PI) / 8; g.pitch = pitch;
    const t = g.castBlock();
    if (t && t.px === cx && t.py === cy && t.pz === cz) { best = [g.yaw, pitch]; break; }
  }
  g.yaw = y0; g.pitch = p0;
  return best;
}
/** Aim at the middle of block (x, y, z); true once the crosshair is on it. */
function aimAt(g, b, x, y, z) {
  const [ex, ey, ez] = g.eye();
  const dx = x + 0.5 - ex, dy = y + 0.5 - ey, dz = z + 0.5 - ez;
  look(g, b, Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)));
  const t = g.castBlock();
  return t && t.x === x && t.y === y && t.z === z;
}

function shelterTime(g, b) {
  const m = b.mem;
  if (m.shelterAt == null) {
    m.shelterAt = g.sunsetAt() - 30 * b.skill + (1 - b.skill) * (b.rand() * 60 - 10);
    // a less experienced player often doesn't think of digging in at all, and spends the night
    // out in the open, keeping away from the monsters
    if (b.rand() < (1 - b.skill) * 1.1) m.shelterAt = Infinity;
  }
  return g.dayT >= m.shelterAt;
}

/** Run from the nearest monster that's close (a slower player notices later). */
function threat(g, b) {
  const p = g.p, near = (3 + 5 * b.skill);
  let best = null;
  for (const mo of hostiles(g)) {
    const d = Math.hypot(mo.x - p.x, mo.z - p.z);
    if (d < near && Math.abs(mo.y - p.y) < 3 && (!best || d < best.d)) best = { mo, d };
  }
  return best;
}

function dayTask(g, s, b) {
  const m = b.mem, p = g.p, w = g.world;
  // hungry and carrying food: eat
  if (g.energy < 12 && !g.eatT) {
    const f = slotOf(g, (id) => INFO[id].food);
    if (f >= 0) { g.select(f); if (g.startEat()) { keys(g, []); return; } }
  }
  if (g.eatT) { keys(g, []); return; }
  // something hostile close by: get away from it
  const th = threat(g, b);
  if (th && (m.fleeT || 0) <= 0 && b.rand() < 0.02 + 0.2 * b.skill) m.fleeT = 2 + 2 * b.skill;
  if (m.fleeT > 0) {
    m.fleeT -= 1 / 120;
    const t = th?.mo || m.fleeFrom;
    if (th) m.fleeFrom = th.mo;
    if (t) { look(g, b, Math.atan2(p.x - t.x, p.z - t.z), -0.1); keys(g, ['KeyW', 'ShiftLeft', ...(m.slowT > 0.3 ? ['Space'] : [])]); m.slowT = Math.hypot(p.vx, p.vz) < 0.6 ? (m.slowT || 0) + 1 / 120 : 0; m.route = null; m.tree = null; return; }
  }
  // chop: walk next to the nearest tree trunk, then mine its logs from the bottom up
  if (m.tree) {
    const [tx, ty, tz] = m.tree;
    if (w.get(tx, ty, tz) !== B.LOG) {
      if (w.get(tx, ty + 1, tz) === B.LOG && ty + 1 - (p.y + 1.62) < 3) { m.tree = [tx, ty + 1, tz]; return; }
      m.tree = null; m.chopped = (m.chopped || 0) + 1; keys(g, []); return;
    }
    const d = Math.hypot(tx + 0.5 - p.x, tz + 0.5 - p.z);
    if (d > 2.2 && m.route && m.route.length) { if (follow(g, b, m, false) === 'stuck') { m.bad.add(tx * 64 + tz); m.tree = null; m.route = null; } return; }
    if (d > 3.2) { m.bad.add(tx * 64 + tz); m.tree = null; return; }
    const on = aimAt(g, b, tx, ty, tz);
    if (on) bareHand(g);
    keys(g, on ? ['KeyJ'] : []);
    m.chopT = (m.chopT || 0) + 1 / 120;
    if (m.chopT > 12) { m.bad.add(tx * 64 + tz); m.tree = null; }
    return;
  }
  if ((m.chopped || 0) < 6 && (m.lookT || 0) <= 0) {
    m.lookT = 1;
    m.bad ??= new Set();
    const route = surfaceSearch(g, (x, z, y) => {
      for (const [dx, dz] of DIRS4) {
        const lx = x + dx, lz = z + dz;
        if (m.bad.has(lx * 64 + lz)) continue;
        if (w.get(lx, y + 1, lz) === B.LOG && Math.hypot(lx - p.x, lz - p.z) < 14) { m.treeAt = [lx, y + 1, lz]; return true; }
      }
      return false;
    }, 900);
    if (route) { m.route = route; m.tree = m.treeAt; m.chopT = 0; return; }
  }
  m.lookT = (m.lookT || 0) - 1 / 120;
  keys(g, []);
}

/** Dig the hole and seal it. */
function shelter(g, s, b) {
  const m = b.mem, p = g.p, w = g.world;
  const sh = m.shelter;
  if (!sh) {
    // pick the spot: the nearest good ground (a careless player skips the wall check now and then)
    const careful = b.rand() < 0.5 + 0.5 * b.skill;
    m.bad ??= new Set();
    const route = surfaceSearch(g, (x, z, y) => !m.bad.has(x * 64 + z + 9000) && goodSite(g, x, z, y, careful), 2500);
    const here = Math.floor(p.x), hz = Math.floor(p.z), hy = Math.floor(p.y) - 1;
    if (p.grounded && goodSite(g, here, hz, hy, careful)) { m.shelter = { x: here, z: hz, y: hy, phase: 'centre', t: 0 }; return; }
    if (route) { const [x, z] = route[route.length - 1]; m.route = route; m.shelter = { x, z, y: standY(w, x, z), phase: 'walk', t: 0 }; return; }
    // nowhere good: just dig where we stand
    m.shelter = { x: here, z: hz, y: hy, phase: 'centre', t: 0 };
    return;
  }
  sh.t += 1 / 120;
  const cx = sh.x + 0.5, cz = sh.z + 0.5, off = Math.hypot(cx - p.x, cz - p.z);
  const giveUp = () => { m.bad.add(sh.x * 64 + sh.z + 9000); m.shelter = null; m.route = null; keys(g, []); };
  if (sh.phase === 'walk') {
    const r = follow(g, b, m, true);
    if (r === 'stuck' || sh.t > 25) return giveUp();
    if (r === 'done') { sh.phase = 'centre'; sh.t = 0; }
    return;
  }
  if (sh.phase === 'centre') {
    // creep to the middle of the column with taps of W
    const yaw = Math.atan2(cx - p.x, cz - p.z);
    look(g, b, yaw, -1.5);
    m.tap = ((m.tap || 0) + 1) % 8;
    keys(g, off > 0.12 && m.tap === 0 && Math.abs(angDiff(yaw - g.yaw)) < 0.3 ? ['KeyW'] : []);
    if (off <= 0.12 && Math.hypot(p.vx, p.vz) < 0.2) { sh.phase = 'dig'; sh.t = 0; }
    if (sh.t > 8) return giveUp();
    return;
  }
  if (sh.phase === 'dig') {
    const feet = Math.floor(p.y + 0.01);
    if (feet <= sh.y - 2 && p.grounded) { sh.phase = 'seal'; sh.t = 0; keys(g, []); return; }
    if (feet < sh.y - 2 || Math.floor(p.x) !== sh.x || Math.floor(p.z) !== sh.z) {
      // fell somewhere else (broke into a cave) or got knocked out of the hole: start again
      return giveUp();
    }
    const below = feet - 1;
    if (!look(g, b, g.yaw, -1.5)) { keys(g, []); return; }
    const t = g.castBlock();
    bareHand(g);
    keys(g, t && t.x === sh.x && t.z === sh.z && t.y === below ? ['KeyJ'] : []);
    if (sh.t > 14) return giveUp();
    // drifted off the middle: nudge back
    if (off > 0.18 && p.grounded) { sh.phase = 'centre'; sh.t = 0; }
    return;
  }
  if (sh.phase === 'seal') {
    const cell = [sh.x, sh.y, sh.z];
    if (solid(w, ...cell)) { sh.phase = 'hide'; sh.t = 0; keys(g, []); return; }
    let slot = slotOf(g, (id) => id === B.DIRT || id === B.SAND || id === B.GRAVEL || id === B.COBBLE);
    if (slot < 0) slot = slotOf(g, (id) => id === B.PLANKS || id === B.LOG);
    if (slot < 0) return giveUp();
    if (g.sel !== slot) g.select(slot);
    sh.aim ??= aimToPlace(g, ...cell);
    if (!sh.aim) { sh.phase = 'hide'; return; }
    keys(g, []);
    if (look(g, b, sh.aim[0], sh.aim[1])) {
      const t = g.castBlock();
      if (t && t.px === sh.x && t.py === sh.y && t.pz === sh.z && g.useCd <= 0) g.useQueued = true;      // K
    }
    if (sh.t > 6) { sh.aim = null; sh.t = 0; }
    return;
  }
  // hidden: wait for the sun. If the hole was opened (a blast, a stray dig), dig in again.
  keys(g, []);
  look(g, b, g.yaw, 0);
  const pocketOk = solid(w, sh.x, sh.y, sh.z) && Math.floor(p.x) === sh.x && Math.floor(p.z) === sh.z;
  if (!pocketOk) { m.shelter = null; m.route = null; }
  if (g.energy < 8 && !g.eatT) { const f = slotOf(g, (id) => INFO[id].food); if (f >= 0) { g.select(f); g.startEat(); } }
}

function starfall(g, b) {
  const p = g.p, m = b.mem;
  let best = null;
  for (const st of g.stars) {
    const d = Math.hypot(st.x - p.x, st.z - p.z);
    const eta = st.landed ? 0 : Math.max(0, (st.y - p.y) / -st.vy);
    if (d / 4.3 > (st.landed || 6) + eta) continue;
    const sc = d + (st.landed ? 0 : eta * 2);
    if (!best || sc < best.sc) best = { st, sc };
  }
  if (!best) { keys(g, []); return; }
  const yaw = Math.atan2(best.st.x - p.x, best.st.z - p.z);
  look(g, b, yaw, -0.1);
  m.slowT = Math.hypot(p.vx, p.vz) < 0.6 ? (m.slowT || 0) + 1 / 120 : 0;
  keys(g, [...(Math.abs(angDiff(yaw - g.yaw)) < 0.8 ? ['KeyW', 'ShiftLeft'] : []), ...(m.slowT > 0.3 || p.inWater ? ['Space'] : [])]);
}

export default {
  levels: 15,                   // days 1–12 (★ Starfall rounds at 5, 10 and 15): Thornbacks, Boomcaps,
                                // Crawlers, longer nights, armoured monsters and three Blood Moons
  limit: () => 270,             // a day is 200 s (less the first morning), plus 2 s for each life lost
  stuck: 30,

  // the clock is the goal: the level ends at sunrise (stars caught in a Starfall)
  progress: (g) => (g.bonus ? g.s.score : g.dayT),

  invariants(g, s) {
    const p = g.p;
    if (![p.x, p.y, p.z, p.vx, p.vy, p.vz, g.yaw, g.pitch, g.dayT, g.health, g.energy, g.air].every(Number.isFinite)) return 'a player value (position, speed, view, health, energy, air) or the clock is not a number';
    if (p.x < 0.29 || p.z < 0.29 || p.x > SX - 0.29 || p.z > SZ - 0.29) return `the player left the island at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
    if (p.y < 1 - 1e-6 || p.y > SY + 5) return `the player is at height ${p.y.toFixed(2)} (bedrock is at 0)`;
    if (g.collides(p.x, p.y + 0.05, p.z, 0.29, 1.7)) return `the player is stuck inside a block at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
    if (Math.hypot(p.vx, p.vz) > 16) return `the player moves at ${Math.hypot(p.vx, p.vz).toFixed(1)} blocks/s`;
    if (p.vy < -40 - 1e-6 || p.vy > 9) return `vertical speed ${p.vy.toFixed(1)}`;
    if (g.health < 0 || g.health > 20 || !Number.isInteger(g.health)) return `health ${g.health} (0–20, whole)`;
    if (g.energy < 0 || g.energy > 20) return `energy ${g.energy.toFixed(2)} (0–20)`;
    if (g.air < 0 || g.air > 10) return `air ${g.air.toFixed(2)} (0–10)`;
    if (g.dayT < 0 || g.dayT > CYCLE) return `the clock is at ${g.dayT.toFixed(1)} of a ${CYCLE} s day`;
    if (Math.abs(g.pitch) > 1.5 + 1e-9) return `looking ${g.pitch.toFixed(2)} rad up/down (±1.5)`;
    if (g.inv.length !== 36 || g.armour.length !== 4) return `${g.inv.length} bag slots and ${g.armour.length} armour slots (36 and 4)`;
    for (const it of g.inv) {
      if (!it) continue;
      const info = INFO[it.id];
      if (!info) return `an unknown item ${it.id} in the bag`;
      if (!Number.isInteger(it.n) || it.n < 1 || it.n > info.stack) return `a stack of ${it.n} ${info.name} (1–${info.stack})`;
      if (info.dur && (it.dur > info.dur || it.dur <= 0)) return `${info.name} at ${it.dur} of ${info.dur} durability`;
    }
    // whatever is in your hand, the block under the crosshair can be broken (mining it takes a
    // finite time; bedrock, water and lava excepted)
    const t = g.target, held = g.held();
    if (t && Number.isFinite(INFO[t.v]?.hard) && !Number.isFinite(g.breakTime(t.v, held ? INFO[held.id] : null))) return `holding ${held ? INFO[held.id].name : 'nothing'}, the ${INFO[t.v].name} under the crosshair can never be broken (break time ${g.breakTime(t.v, held ? INFO[held.id] : null)})`;
    if (g.grave && !g.grave.items.length) return 'an empty grave';
    if (g.bonus && s.livesLost) return 'a life was lost in a Starfall (nothing can hurt you)';
    if (g.bonus && g.mobs.some((mo) => HOSTILE.has(mo.type) && mo.type !== 'king')) return 'a monster in a Starfall';
    let host = 0;
    for (const mo of g.mobs) {
      if (![mo.x, mo.y, mo.z, mo.vx, mo.vy, mo.vz, mo.hp].every(Number.isFinite)) return `a ${mo.type} position, speed or health is not a number`;
      if (mo.x < 0 || mo.z < 0 || mo.x > SX || mo.z > SZ || mo.y < -2.5 || mo.y > SY + 8) return `a ${mo.type} is outside the world at (${mo.x.toFixed(1)}, ${mo.y.toFixed(1)}, ${mo.z.toFixed(1)})`;
      if (mo.hp > mo.maxHp) return `a ${mo.type} has ${mo.hp} of ${mo.maxHp} health`;
      if (HOSTILE.has(mo.type) && mo.type !== 'king') host++;
    }
    if (host > 20) return `${host} monsters at once (the cap is 19 on a Blood Moon)`;
    for (const sh of g.shots) if (![sh.x, sh.y, sh.z].every(Number.isFinite)) return 'a dart or orb position is not a number';
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    if (s.livesLost !== (m.lives ?? 0)) { m.lives = s.livesLost; m.shelter = null; m.route = null; m.tree = null; m.fleeT = 0; }
    if (g.bonus) return starfall(g, b);
    if (m.shelter || shelterTime(g, b)) { m.tree = null; return shelter(g, s, b); }
    dayTask(g, s, b);
  },

  // The mistake: walk into the nearest deep water and stay under until you drown (~20 s). If no
  // deep water can be reached within a minute, the other classic: stay out in the open at night.
  mistake(g, s, b) {
    const m = b.mem;
    if (g.bonus) return true;
    m.lives0 ??= s.livesLost;
    m.mt = (m.mt || 0) + 1 / 120;
    if (s.livesLost > m.lives0) { keys(g, []); m.route = null; return true; }
    const w = g.world, p = g.p;
    if (m.mt > 60 && !m.dive) { dayTask(g, s, b); return false; }     // plan B: no shelter tonight
    // under water: stop swimming and sink
    if (w.get(Math.floor(p.x), Math.floor(p.y + 1.62), Math.floor(p.z)) === B.WATER || (p.inWater && m.dive)) { m.dive = true; keys(g, []); look(g, b, g.yaw, -1.2); return false; }
    // stuck against something: hop, and if that doesn't do it, try another way for a moment
    const slow = Math.hypot(p.vx, p.vz) < 0.5 && g.keys.has('KeyW');
    m.stuckT = slow ? (m.stuckT || 0) + 1 / 120 : 0;
    if (m.stuckT > 3) { m.detour = 1; m.detourYaw = g.yaw + (b.rand() < 0.5 ? 1.6 : -1.6); m.stuckT = 0; m.route = null; }
    if (m.detour > 0) { m.detour -= 1 / 120; look(g, b, m.detourYaw, -0.2); keys(g, ['KeyW', 'Space']); return false; }
    const hop = m.stuckT > 0.4 ? ['Space'] : [];
    if (p.inWater) {
      // wading: head straight for the deepest water close by
      let best = null;
      for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
        if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) continue;
        let y = SEA; while (y > 0 && w.get(x, y, z) === B.WATER) y--;
        if (y > SEA - 3 || (dx === 0 && dz === 0)) continue;      // deep enough to go under
        const sc = Math.hypot(dx, dz) + y * 0.3;
        if (!best || sc < best.sc) best = { x, z, sc };
      }
      if (best) { look(g, b, Math.atan2(best.x + 0.5 - p.x, best.z + 0.5 - p.z), -0.3); keys(g, ['KeyW', ...hop]); return false; }
    }
    if (!m.route || !m.route.length) {
      m.route = surfaceSearch(g, (x, z, y) => w.get(x, y + 1, z) === B.WATER && SEA - y >= 3, 4096, true)
        || surfaceSearch(g, (x, z, y) => w.get(x, y + 1, z) === B.WATER, 4096, true);
      if (!m.route) { m.mt = 61; return false; }                   // no water it can walk to
      // the search stops at the water's edge: walk on past it
      const [x, z] = m.route[m.route.length - 1], [x0, z0] = m.route.length > 1 ? m.route[m.route.length - 2] : [Math.floor(p.x), Math.floor(p.z)];
      for (let k = 1; k <= 3; k++) m.route.push([x + (x - x0) * k, z + (z - z0) * k]);
    }
    if (follow(g, b, m, false) === 'stuck') m.route = null;
    if (hop.length) g.keys.add('Space');
    return false;
  },
};

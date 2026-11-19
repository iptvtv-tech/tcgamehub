// ─────────────────────────────────────────────────────────────
//  EGGSPRESS — "is there any way across this stretch with the egg?"
//  A wide search over ways of driving (gas, coast or brake, a tenth of a second at a time), played
//  out on a private copy of the truck and egg with the game's own physics (stepCar / stepEgg); the
//  real game is never touched. Lines of play that lose the egg, crack it more than allowed, or let
//  it out of its cup are dropped; of lines that end up in the same place at the same speed with
//  the egg sitting the same way, the better one is kept. Used by check.mjs to prove that ramps and
//  chasms can be crossed, and handy for looking at any stretch of road a bot or a player can't pass.
// ─────────────────────────────────────────────────────────────
import { STEP } from '../../tools/lib/headless.mjs';

const NOOP = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : NOOP), apply: () => NOOP });
const QUIET = { sound: NOOP, fx: NOOP, award() {}, unlock() {}, hurt() {}, gold: false, comboCount: 0 };

/** A private copy of the truck and egg on the same road (the road arrays are only read). */
export function model(g) {
  const m = Object.create(Object.getPrototypeOf(g));
  Object.assign(m, g);
  m.s = QUIET; m.dust = []; m.puff = () => {}; m.cam3 = { p: () => null }; m.cam = { x: 0, y: 0 };
  m.car = { ...g.car, wheels: g.car.wheels.map((w) => ({ ...w })) };
  m.egg = { ...g.egg, crackSeeds: [] };
  m.mcd = g.mushrooms.map((q) => q.cd); m.stuck = g.stuckT;
  return m;
}
export function clone(m) {
  const n = Object.create(Object.getPrototypeOf(m));
  Object.assign(n, m);
  n.car = { ...m.car, wheels: m.car.wheels.map((w) => ({ ...w })) };
  n.egg = { ...m.egg, crackSeeds: [] }; n.mcd = [...m.mcd];
  return n;
}
/** One engine step, the way the game's update() runs it (two half steps, mushrooms, chasms, stuck on
 *  the roof). Returns true when the egg is lost. */
export function mstep(m, th) {
  const h = STEP / 2;
  m.t += STEP; m.time += STEP;
  for (let k = 0; k < 2; k++) { m.stepCar(h, th); if (m.stepEgg(h)) return true; }
  const c = m.car;
  for (let i = 0; i < m.mushrooms.length; i++) {
    const q = m.mushrooms[i];
    m.mcd[i] = Math.max(0, m.mcd[i] - STEP);
    if (Math.abs(q.x - c.x) > 200) continue;
    if (m.mcd[i] > 0) continue;
    if (c.wheels.some((wh) => wh.on && Math.abs(wh.x - q.x) < 26)) { m.mcd[i] = 1.2; const boost = -720 - Math.max(0, c.vy); c.vy += boost; m.egg.vy += boost; }
  }
  const gp = m.gaps.find((q) => c.x > q.x0 - 30 && c.x < q.x1 + 30);
  if (gp && c.y > m.ground(gp.x0 - 15) + 200) return true;
  m.stuck = Math.cos(c.a) < -0.2 && Math.hypot(c.vx, c.vy) < 60 ? m.stuck + STEP : 0;
  if (m.stuck > 1.5 || !m.egg.alive) return true;
  m.egg.crackCd = Math.max(0, m.egg.crackCd - STEP);            // (a crack can't follow a crack at once)
  return false;
}
/** Where the egg is, seen from the truck (it rests in its cup at about (0, −27)). */
export const eggLocal = (m) => { const c = m.car, cs = Math.cos(c.a), sn = Math.sin(c.a), dx = m.egg.x - c.x, dy = m.egg.y - c.y; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };

/**
 * Search for a way from where the truck is now to beyond `toX`, on both wheels with the egg in its
 * cup and at most `maxCracks` new cracks. Returns { ok, t (seconds of driving), cracks, seq (one
 * letter per tenth of a second: G gas, B brake, - coast) } or { ok: false, why }.
 */
export function findWay(g, toX, { width = 400, depth = 130, maxCracks = 0, from = null, settled = false, maxSpeed = 0 } = {}) {
  // (from: start from this private copy instead of the game; the answer then carries `end`, the copy
  // as it stands at the end of the way, so a long road can be worked out a stretch at a time.
  // settled: only stop where the egg sits still in its cup and the truck is not rocking.
  // maxSpeed: …and is going no faster than this.)
  const BLOCK = 12, c0 = (from || g).egg.cracks;
  let beam = [{ m: from ? clone(from) : model(g), seq: '' }];
  for (let d = 0; d < depth; d++) {
    const next = new Map();
    for (const st of beam) for (const th of [1, 0, -1]) {
      const m = clone(st.m);
      let gone = false;
      for (let i = 0; i < BLOCK && !gone; i++) gone = mstep(m, th);
      if (gone || m.egg.cracks > c0 + maxCracks) continue;
      const c = m.car, [ex, ey] = eggLocal(m);
      if (Math.abs(ex) > 22 || ey > -8 || ey < -70) continue;           // the egg is out of its cup: as good as lost
      const v = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a), seq = st.seq + (th > 0 ? 'G' : th < 0 ? 'B' : '-');
      if (c.x > toX && c.wheels[0].on && c.wheels[1].on && Math.abs(ex) < 10 && (!settled || (Math.hypot(m.egg.vx - c.vx, m.egg.vy - c.vy) < 70 && Math.abs(c.w) < 1.5 && ey < -20 && ey > -34)) && (!maxSpeed || v < maxSpeed))
        return { ok: true, t: (d + 1) * BLOCK * STEP, cracks: m.egg.cracks - c0, seq, end: m };
      const key = `${Math.round(c.x / 10)},${Math.round(v / 25)},${Math.round(c.a / 0.12)},${Math.round(c.w / 0.8)},${Math.round(ex / 4)},${Math.round(ey / 6)},${m.egg.cracks}`;
      const f = c.x + 0.25 * v - 400 * m.egg.cracks - Math.abs(ex) * 3;
      const old = next.get(key);
      if (!old || f > old.f) next.set(key, { m, seq, f });
    }
    if (!next.size) return { ok: false, why: 'every way of driving loses the egg' };
    // keep the most promising lines, and a spread of the others (slower ones, ones further back)
    const all = [...next.values()].sort((a, b) => b.f - a.f), head = Math.floor(width * 0.7);
    beam = all.slice(0, head);
    const rest = all.slice(head), extra = width - head;
    for (let i = 0; i < extra && rest.length; i++) beam.push(rest[Math.floor(i * rest.length / extra)]);
  }
  return { ok: false, why: `no way found in ${(depth * BLOCK * STEP).toFixed(0)} s of driving`, gotTo: Math.max(...beam.map((b) => b.m.car.x)) };
}

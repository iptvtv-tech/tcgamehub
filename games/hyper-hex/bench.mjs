// Benchmark contract for Hyper Hex (see tools/bench.mjs). The bot holds ← / → like a keyboard
// player. Every few frames it reads the walls closing in and plans the next ~0.9 s: every
// hold-left / hold-right / let-go choice, one per decision, worked out as a small table (where
// the arrow can be at each moment, given that a wall's side blocks it and a wall reaching the
// orbit in its lane is a crash). It follows the move that survives longest, gets out of a lane
// before a wall fills it and ends up near the middle of a lane. Lower skill decides less often
// (keeping its key held in between), looks less far ahead (so it misses the long way round a
// spiral or tunnel), now and then reads a wall thinner than it is, and has short lapses of
// attention where the key stays as it was — so it clips more walls as the levels get longer and
// faster. The mistake: let go of the keys in (or slide into) the lane of the next wall.
const SIDES = 6, SEG = (Math.PI * 2) / SIDES, TAU = Math.PI * 2, RP = 86, CORE = 56;
// how the player's skill shows (all scaled by 1 - skill, so the expert has none of it):
const EVERY = 6;              // extra frames between decisions (slower thumbs)
const LP = 0.3, LT = 0.2;     // attention lapses per second / how long one lasts (s): the key stays as it was
const MISP = 0.3, THIN = 0.8; // how often / how badly it reads a wall thinner than it is
const goalFor = (level) => Math.min(60, 20 + (level - 1) * 4);
const sectorOf = (a) => Math.floor((((a % TAU) + TAU) % TAU) / SEG) % SIDES;

// scratch tables, reused (the planner runs every few frames)
const MAXN = 48, MAXK = 2 * MAXN + 1;
const occ = new Uint8Array((MAXN + 4) * SIDES);        // [i][lane] a wall is at the orbit during step i
const startOcc = new Uint8Array((MAXN + 4) * SIDES);   // [i][lane] … at the start of step i (blocks sideways)
const V = new Float64Array((MAXN + 1) * MAXK);

/** Fill the occupancy tables for planning steps of dt s: a lane is deadly in step i when a
 *  wall's band overlaps the orbit (RP ± 5, plus the bot's margin) at any moment of that step.
 *  `thin` < 1 = the bot reads the walls thinner than they are. */
function occupancy(g, N, dt, margin, thin) {
  occ.fill(0, 0, (N + 4) * SIDES); startOcc.fill(0, 0, (N + 4) * SIDES);
  const v = g.wallSpeed, lo = RP - 5 - margin, hi = RP + 5 + margin;
  for (const w of g.walls) {
    const th = w.th * thin;
    for (let i = 0; i < N + 4; i++) {
      const d0 = w.d - v * i * dt, d1 = d0 - v * dt;   // inner edge at the start / end of step i
      if (d1 > hi) continue;
      if (d0 + th < lo) break;
      occ[i * SIDES + w.side] = 1;
      if (d0 <= RP + 5 && d0 + th >= RP - 5) startOcc[i * SIDES + w.side] = 1;
    }
  }
}

/** Best first move (-1, 0, +1): a table over N planning steps of dt s of where the arrow can
 *  be. Surviving to the horizon comes first; then being out of a lane a wall is about to fill
 *  (so it moves early rather than at the last moment), then sitting near the middle of a lane. */
function plan(g, N, dt) {
  const da = g.moveSpeed * dt, a0 = g.angle, K = N;
  const idx = (i, k) => i * MAXK + (k + K);
  const secAt = (k) => sectorOf(a0 + k * da);
  const soon = (i, sec) => occ[(i + 1) * SIDES + sec] * 3 + occ[(i + 2) * SIDES + sec] * 2 + occ[(i + 3) * SIDES + sec];
  for (let k = -K; k <= K; k++) {
    const a = a0 + k * da, u = ((a % SEG) + SEG) % SEG;
    V[idx(N, k)] = 1e6 + (SEG / 2 - Math.abs(u - SEG / 2)) * 100;
  }
  let first = 0;
  for (let i = N - 1; i >= 0; i--) {
    const lim = Math.min(K, i + 1);
    for (let k = -lim; k <= lim; k++) {
      let best = -Infinity, bestA = 0;
      const sec = secAt(k);
      for (const a of [0, -1, 1]) {
        let nk = k + a;
        if (a && (nk > K || nk < -K)) continue;
        if (a && startOcc[i * SIDES + secAt(nk)]) nk = k;          // a wall's side is in the way
        const s2 = secAt(nk);
        const dead = occ[i * SIDES + s2] || (nk !== k && occ[i * SIDES + sec]);
        const val = dead ? i * 1000 : V[idx(i + 1, nk)] - soon(i, s2) * 8;
        if (val > best + 1e-9) { best = val; bestA = a; }
      }
      V[idx(i, k)] = best;
      if (i === 0 && k === 0) first = bestA;
    }
  }
  return first;
}

/** Hold the key for direction d (-1 left, +1 right, 0 none). */
const steer = (s, d) => s.hold(d < 0 ? ['left'] : d > 0 ? ['right'] : []);

/** The nearest lane (this one or a neighbour) a wall will reach soonest. */
function doomLane(g) {
  const here = sectorOf(g.angle);
  let best = null;
  for (const w of g.walls) {
    if (w.d + w.th < RP) continue;
    const dl = ((w.side - here + SIDES + 1) % SIDES) - 1;      // -1, 0, +1 = left / here / right
    if (dl < -1 || dl > 1) continue;
    const eta = (w.d - RP) / g.wallSpeed;
    if (eta < 0.25 && dl !== 0) continue;                       // too late to slide in front of it
    if (!best || eta < best.eta) best = { eta, dl };
  }
  return best;
}

export default {
  levels: 20,                     // endless game: bench levels 1–20 (5, 10, 15, 20 are GEM RUSH)
  // survive goalFor(level) s (20 s at L1 … 60 s from L11) in one go: a crash restarts the clock,
  // so the expert needs the goal plus the mistake (~2 s in, + 2 s of crash and banner)
  limit: (level) => goalFor(level) + 30,
  stuck: 8,                       // a ring passes about every second: 8 s without one = stuck

  // rings slipped through since the clock last started, plus the clock itself
  progress: (g) => g.ringsPassed * 1000 + Math.floor(g.clock),

  invariants(g, s) {
    if (!Number.isFinite(g.angle)) return `the arrow's angle is ${g.angle}`;
    const m = (seenAngle.get(g) ?? { a: g.angle, lives: s.livesLost, level: g.level });
    if (m.lives === s.livesLost && m.level === g.level && Math.abs(g.angle - m.a) > g.moveSpeed / 120 + 1e-9) return `the arrow jumped ${(g.angle - m.a).toFixed(3)} rad in one step (max ${(g.moveSpeed / 120).toFixed(3)})`;
    seenAngle.set(g, { a: g.angle, lives: s.livesLost, level: g.level });
    if (g.moveSpeed > 10.5 + 1e-9 || g.wallSpeed > 600 + 1e-9) return `speeds over their caps (move ${g.moveSpeed}, walls ${g.wallSpeed})`;
    if (g.clock < 0 || (!g.bonus && g.clock > g.goal + 0.02)) return `the level clock is ${g.clock.toFixed(2)} of ${g.goal}`;
    if (!g.bonus && g.goal !== goalFor(g.level)) return `level ${g.level} goal is ${g.goal} s`;
    if (!g.bonus && g.hits(g.angle)) return `the arrow is inside a wall in lane ${sectorOf(g.angle)} and no crash happened`;
    if (!Number.isInteger(g.ringsPassed) || g.ringsPassed < 0 || g.ringsPassed > (g.ringId ?? 0)) return `rings passed ${g.ringsPassed} of ${g.ringId ?? 0} spawned`;
    if (g.bonus && g.ringsPassed !== 0) return `GEM RUSH counted ${g.ringsPassed} rings`;
    for (const w of g.walls) {
      if (!Number.isFinite(w.d) || !Number.isFinite(w.th) || w.th <= 0) return 'a wall has a distance or thickness that is not a number';
      if (w.side < 0 || w.side >= SIDES || !Number.isInteger(w.side)) return `a wall on side ${w.side}`;
      if (w.d + w.th <= CORE - 4) return 'a wall went inside the core and was not removed';
    }
    if (g.walls.length > 400 || g.gems.length > 200) return `too many objects (${g.walls.length} walls, ${g.gems.length} gems)`;
    if (!Number.isInteger(g.gemCount) || g.gemCount < 0) return `gem count ${g.gemCount}`;
    if (s.lives < 0) return `lives ${s.lives}`;
    return null;
  },

  bot(g, s, b) {
    const m = b.mem, skill = b.skill;
    if (m.crash != null) {                                      // finishing the mistake
      if (s.livesLost > m.crash) m.crash = null;
      else return crashInto(g, s);
    }
    if (g.bonus) {                                              // GEM RUSH: walls are ghosts, chase the gems
      const gem = g.gems.filter((x) => x.d > RP - 8).sort((p, q) => p.d - q.d)[0];
      if (!gem) return steer(s, 0);
      let d = ((gem.a - g.angle) % TAU + TAU * 1.5) % TAU - Math.PI;
      if (b.rand() < (1 - skill) * 0.05) d = -d;               // a sloppy thumb
      return steer(s, Math.abs(d) < 0.05 ? 0 : Math.sign(d));
    }
    // it decides every `every` frames and keeps that key held till the next decision
    // (3 frames = 1/40 s for the expert, slower thumbs at lower skill)
    const every = 3 + Math.round((1 - skill) * EVERY);
    m.f = (m.f ?? 0) + 1;
    if (m.lapse > b.t) return steer(s, m.dir);              // not looking for a moment: same key held
    if (m.dir == null || m.f >= every) {
      m.f = 0;
      if (b.rand() < (1 - skill) * LP * every / 120) { m.lapse = b.t + LT * (0.5 + b.rand()); return steer(s, m.dir ?? 0); }
      const dt = every / 120;
      const horizon = 0.35 + skill * 0.55;                     // seconds it thinks ahead
      const N = Math.min(MAXN, Math.round(horizon / dt));
      const thin = 1 - (1 - skill) * (b.rand() < MISP ? THIN : 0);   // now and then misjudges how thick the walls are
      const margin = skill * 3;
      occupancy(g, N, dt, margin, thin);
      m.dir = plan(g, N, dt);
    }
    steer(s, m.dir);
  },

  mistake(g, s, b) {
    if (g.bonus) return false;
    if (!doomLane(g)) return false;
    b.mem.crash = s.livesLost;
    crashInto(g, s);
    return true;
  },
};

const seenAngle = new WeakMap();

/** Let go in the lane of the next wall, or slide into it. */
function crashInto(g, s) {
  const t = doomLane(g);
  if (!t) return steer(s, 0);
  steer(s, t.dl);
}

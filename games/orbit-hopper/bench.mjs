// Benchmark contract for Orbit Hopper (see tools/bench.mjs).
// The bot plays the one button the way a player does: while circling a planet it pictures where
// letting go right now would take it (the same physics as the game, with the planets' swing and
// the black hole) and presses when that flight lands on a planet higher up. Lower skill misjudges
// the angle and reacts late, so it sometimes lets go into the void.
// The mistake: one release the bot knows ends in the void (or the black hole).
import { W, HOPPER_R, MAX_FLIGHT, ORBIT_GAP, STEP, stepFlight, orbitState, bounds } from './world.js';

const H = 720;

/** Where does a release from the current orbit (angle shifted by `da`) end up? Mirrors game.update. */
function predict(g, da = 0) {
  const o = g.orbit;
  const ps = g.planets.map((p) => ({ ...p }));
  const from = ps[o.p.i];
  const f = orbitState(from, o.a + da, o.dir, g.level);
  const b = bounds(ps);
  let t = g.t, ft = 0;
  while (ft <= MAX_FLIGHT) {
    t += STEP; ft += STEP;
    for (const p of ps) if (p.amp) p.x = p.x0 + Math.sin(t * p.om + p.phase) * p.amp;
    const hit = stepFlight(f, ps, STEP);
    if (g.hole && Math.hypot(g.hole.x - f.x, g.hole.y - f.y) < g.hole.r + HOPPER_R) return { lost: true, t: ft };
    if (hit && !(hit === from && ft < 0.15)) return { i: hit.i, goal: !!hit.goal, t: ft };
    if (f.x < b.x0 || f.x > b.x1 || f.y > b.y1 || f.y < b.y0) return { lost: true, t: ft };
  }
  return { lost: true, t: ft };
}

export default {
  levels: 20,
  limit: (level) => 150 + level * 10,
  stuck: 60,                               // a full lap is 2–4 s; a minute with no new planet = stuck

  // the highest planet reached so far (the beacon ends the level)
  progress: (g) => Math.max(...g.visited),

  invariants(g) {
    const x = g.hx(), y = g.hy();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'the hopper position is not a number';
    if (g.fly && g.fly.t > MAX_FLIGHT + 0.05) return `a flight has lasted ${g.fly.t.toFixed(2)} s (the limit is ${MAX_FLIGHT})`;
    if (!g.fly && !g.orbit) return 'the hopper is neither flying nor in orbit';
    if (g.orbit) {
      const b = bounds(g.planets);
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return `the orbit at planet ${g.orbit.p.i} is outside the field (x ${x.toFixed(0)}, y ${y.toFixed(0)})`;
    }
    for (const p of g.planets) if (p.x - p.r < 0 || p.x + p.r > W) return `planet ${p.i} is off screen (x ${p.x.toFixed(0)}, r ${p.r.toFixed(0)})`;
    return null;
  },

  bot(g, s, b) {
    if (!g.orbit) return;                                  // in flight: nothing to press
    if (g.bonus) {                                         // star shower: no danger, just keep hopping
      if (b.rand() < 0.02) s.tap(W / 2, H / 2);
      return;
    }
    const m = b.mem;
    if (m.wait > 0) { m.wait -= STEP; if (m.wait <= 0) s.tap(W / 2, H / 2); return; }
    // a weaker bot misjudges where it is on the orbit, and takes a moment to press
    const err = (1 - b.skill) * 0.3 * (b.rand() - 0.5);
    const r = predict(g, err);
    const here = g.orbit.p.i;
    if (r.lost || r.i <= here) return;
    // an expert waits for a hop that gains ground; anything higher will do after a few laps
    m.laps = m.planet === here ? m.laps + STEP : 0; m.planet = here;
    if (!r.goal && r.i > here + 2 && m.laps < 4 && b.skill > 0.9) return;   // long shots only when nothing safer comes round
    const delay = (1 - b.skill) * 0.08 * b.rand();
    if (delay < STEP) s.tap(W / 2, H / 2); else m.wait = delay;
  },

  // let go on a line that ends in the void
  mistake(g, s) {
    if (!g.orbit) return false;
    if (!predict(g).lost) return false;
    s.tap(W / 2, H / 2);
    return !g.orbit;
  },
};

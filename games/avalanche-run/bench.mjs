// Benchmark contract for Avalanche Run (see tools/bench.mjs). Try it: node tools/bench.mjs --games=avalanche-run
// The bot rides by eye: it jumps a rock or a crack when it is about a third of a second away, rides
// the kickers as they come (a wide crevasse always has one at its edge), sits still in the air so
// the sled levels itself, and tucks when the avalanche is close. A less skilled rider jumps late,
// and now and then tries a flip and lets go at the wrong moment.
import { snowAt, gradeAt, gapAt, wrap, MAX_GAP, START_GAP } from './world.js';

function bot(g, s, b) {
  const sim = g.sim, p = sim.p, sl = g.slope, m = b.mem;
  if (p.air) {
    if (b.skill < 0.9 && p.from === 'kicker') {            // an average rider tries a backflip off some kickers …
      if (p.airT < 0.02) m.flip = b.rand() < 0.25 * (1 - b.skill) + 0.1 ? 0.55 + b.rand() * 0.5 * (1.4 - b.skill) : 0;
      if (p.airT < m.flip) return s.hold(['left']);        // … and holds it for about a flip's worth
    }
    return s.hold([]);
  }
  const keys = [];
  if (g.bonus || sim.gap < START_GAP * 0.8 || b.skill > 0.8) keys.push('down');
  const late = (1 - b.skill) * (m.late ?? (m.late = b.rand())) * 0.3 * p.v;      // how late this rider is for the next jump (m)
  const rock = sl.rocks.find((r) => !r.hit && r.x > p.x);
  const crack = sl.gaps.find((c) => c.crack && c.x > p.x);
  let jump = false;
  if (rock && rock.x - p.x < Math.max(2.4, p.v * 0.3) - late) jump = true;
  if (crack && crack.x - p.x < Math.max(1.2, p.v * 0.1) - late * 0.25) jump = true;
  if (jump && !m.pressed) { keys.push('up'); m.pressed = true; m.late = b.rand(); } else if (!jump) m.pressed = false;
  s.hold(keys);
}

export default {
  levels: 15,
  limit: (level) => 150 + level * 12,
  stuck: 25,                          // the sled always moves: 25 s without getting further down is stuck
  // metres along the run (crystals in a rush); the flag keeps what was reached before a lost life
  progress: (g) => (g.bonus ? g.slope.crystals.filter((c) => c.got).length + g.sim.p.x : g.sim.p.x),
  invariants(g) {
    const sim = g.sim, p = sim.p, R = sim.R, sl = g.slope;
    if (![p.x, p.y, p.v, p.vx, p.vy, p.rot, sim.az].every(Number.isFinite)) return 'the sled or the avalanche is at NaN';
    if (p.v > R.top + 1e-6 || p.v < 0) return `the sled rides at ${p.v.toFixed(1)} m/s (top speed ${R.top.toFixed(1)})`;
    const snow = snowAt(sl, p.x);
    if (!p.air && Math.abs(p.y - snow) > 1e-6) return 'the sled is off the snow but not in the air';
    if (!gapAt(sl, p.x) && !sim.done && p.y < snow - 0.5) return `the sled is ${(snow - p.y).toFixed(1)} m under the snow`;
    if (p.y > snow + 40) return `the sled is ${(p.y - snow).toFixed(0)} m above the snow`;
    if (!g.bonus && sim.az > p.x + 1e-6 && !sim.done) return 'the avalanche is ahead of the sled';
    if (!g.bonus && sim.gap > MAX_GAP + sim.room + 1e-6) return `the avalanche is ${sim.gap.toFixed(0)} m behind (it never falls more than ${MAX_GAP + sim.room} m back)`;
    if (p.x > sl.len + 120) return 'the sled rode past the hut';
    return null;
  },
  bot,
  // one real mistake: ride into the next rock if one is near; otherwise turn over off a kicker and land on your head
  mistake(g, s) {
    const sim = g.sim, p = sim.p, sl = g.slope;
    if (g.bonus) return false;
    if (p.tumble > 0) return true;
    if (p.air) {
      if (p.from !== 'kicker') { s.hold([]); return false; }
      const off = wrap(p.rot - Math.atan(gradeAt(sl, p.x)));
      s.hold([off >= 0 ? 'left' : 'right']);               // (◀ turns the nose up; this holds the sled upside down)
      return false;
    }
    const rock = sl.rocks.find((r) => !r.hit && r.x > p.x && r.x - p.x < 40);
    if (rock) { s.hold([]); return false; }                // straight into it
    bot(g, s, { skill: 1, rand: () => 0.5, mem: {} });
    return false;
  },
};

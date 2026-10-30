// node games/eggspress/test.mjs [--levels 20] [--seeds 8]
// Road-shape regression tests (found by the benchmark, 30 Oct 2026). Builds every delivery's real
// road headless (tools/lib/headless.mjs) and measures it.
//  1. Ramp lips: the road builder flattened over-steep hills and squashed each ramp's kicker with
//     them; the missing height came back as one sudden step at the lip, up to 233 px: a wall that
//     even an egg-less truck going flat out could not get over.
//  2. Climbs: from delivery 8 the steepest allowed climb (grade 0.70 → 0.78) was more than any
//     driving can keep the egg in the cup on (it slides over the back of the cup past ~0.65).
// Ramp kickers (the 200–320 px run-up to each lip, meant to be jumped at speed) and the chasms are
// left out of the climb check; everywhere else a climb stays within the cap, and nowhere does the
// road jump in a single sample.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 20), SEEDS = arg('--seeds', 8);
const EG = await loadGame('eggspress');
const t = reporter('eggspress');
const STEP = 10, GRADE = 0.62, LIP = 20;            // game.js sample spacing; the climb cap; the biggest one-sample rise allowed
                                                    // (a kicker's own lip is at most ~1.25 + the hill's 0.62 → ~19 px; the walls were 20–233 px)

let roads = 0, worstGrade = 0, worstStep = 0;
for (let level = 1; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;                      // the bonus runs are endless roads
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = EG.start({ seed: seed * 1009 + level, level, unlimited: true }), g = s.game;
    g.ensure(g.goalX);
    roads++;
    const inKicker = (x) => g.ramps.some((rp) => x > rp.x - (rp.gap ? 330 : 210) && x < rp.x + (rp.gap ? rp.w + 400 : 300));
    const inGap = (x) => g.gaps.some((gp) => x > gp.x0 - STEP * 2 && x < gp.x1 + STEP * 2);
    let bad = 0;
    for (let x = 0; x < g.goalX && bad < 2; x += STEP) {
      if (inGap(x)) continue;
      const a = g.ground(x), b = g.ground(x + STEP);
      if (a > 1500 || b > 1500) continue;
      const rise = a - b;                                      // y grows downwards: positive = uphill
      if (Math.abs(rise) > worstStep && !inGap(x + STEP)) worstStep = Math.abs(rise);
      if (rise > LIP) { bad++; t.fail(`delivery ${level} seed ${seed}: the road jumps up ${rise.toFixed(0)} px at x=${x} (a wall)`); continue; }
      if (inKicker(x)) continue;
      if (rise / STEP > worstGrade) worstGrade = rise / STEP;
      if (rise / STEP > GRADE + 0.01) { bad++; t.fail(`delivery ${level} seed ${seed}: a climb of grade ${(rise / STEP).toFixed(2)} at x=${x} (cap ${GRADE}; the egg can't stay in the cup)`); }
    }
  }
}
t.done(`${roads} roads: no walls, steepest climb ${worstGrade.toFixed(2)} (cap ${GRADE}), biggest one-sample rise ${worstStep.toFixed(0)} px outside chasms`);

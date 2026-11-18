// node games/eggspress/test.mjs [--levels 20] [--seeds 8]
// Road-shape regression tests (found by the benchmark, 30 Oct 2026). Builds every delivery's real
// road headless (tools/lib/headless.mjs) and measures it.
//  1. Ramp lips: the road builder flattened over-steep hills and squashed each ramp's kicker with
//     them; the missing height came back as one sudden step at the lip, up to 233 px: a wall that
//     even an egg-less truck going flat out could not get over.
//  2. Climbs: from delivery 8 the steepest allowed climb (grade 0.70 → 0.78) was more than any
//     driving can keep the egg in the cup on (it slides over the back of the cup past ~0.65).
//  3. Long steep climbs (17 Nov 2026): a climb could stay at the cap for 300–440 px (262 px of
//     height), which could be driven with the egg only by near-perfect feathering of the gas.
//     A climb now eases off after 160 px at a grade over 0.45.
//  4. Ramps on steep ground (17 Nov 2026): a ramp's kicker was added on top of whatever hill was
//     under it. On a climb the two stacked up to grade 1.8, and at the foot of a steep drop the
//     truck ran straight into the kicker: walls no driving got the egg over (about half the roads
//     from delivery 11 had one). Every ramp now stands on a flat pad, as the chasms do: the hill
//     in the 400 px before the lip stays between grade −0.4 and 0.3, and kicker and hill together
//     never go over 1.2.
//  5. Chasms (17 Nov 2026): from delivery 9 the taller hills were not calmed in a chasm's run-up, so
//     it was not flat, and gusts, oil, moon patches and mushrooms could lie in the run-up or over
//     the jump. From delivery 11 most chasms could not be jumped with the egg, many not even
//     without it. The 980 px before a chasm's kicker are now flat (grade within ±0.15), and
//     nothing else lies between 1650 px before the chasm and 760 px after it.
//  6. Gusts on slopes (17 Nov 2026): a headwind on a steep climb (or a tailwind on a steep drop)
//     pushed the egg out of its cup whatever the driving. A gust blowing down a slope now fades
//     from grade 0.25 and is gone by 0.45 (the hillside gives shelter).
//  7. The checkpoint flag (17 Nov 2026): you restart there standing still with a fresh egg. On a
//     steep slope it rolled straight out of the cup (1 road in 4 if you did nothing, 1 in 25
//     whatever you did), so every restart cost another life. The flag now stands on a flat pad
//     with nothing on it, and a truck restarted there keeps its egg for 3 s untouched.
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

const STEEP = 0.45, RUN = 160;                      // game.js STEEP_RUN: the longest a climb may stay over grade 0.45 (px)
const RAMP_GRADE = 1.2, RAMP_HILL = [-0.4, 0.3];    // game.js: kicker + hill at most; the hill before a ramp's lip (drop, climb)
const RUNUP = 0.15;                                 // the steepest the ground may be in the 980 px before a chasm's kicker
let gusts = 0, worstGust = 0, restarts = 0;
let roads = 0, worstGrade = 0, worstStep = 0, longest = 0, ramps = 0, worstKick = 0, chasms = 0, worstRunUp = 0;
for (let level = 1; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;                      // the bonus runs are endless roads
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = EG.start({ seed: seed * 1009 + level, level, unlimited: true }), g = s.game;
    g.ensure(g.goalX);
    roads++;
    const inKicker = (x) => g.ramps.some((rp) => x > rp.x - (rp.gap ? 330 : 210) && x < rp.x + (rp.gap ? rp.w + 400 : 300));
    const inGap = (x) => g.gaps.some((gp) => x > gp.x0 - STEP * 2 && x < gp.x1 + STEP * 2);
    let bad = 0, run = 0;
    {
      // a restart at the flag, hands off the controls
      const s2 = EG.start({ seed: seed * 1009 + level, level, unlimited: true }), g2 = s2.game;
      g2.ensure(g2.checkX + 3000); g2.flagged = true; g2.maxX = g2.checkX + 1; g2.respawnX = g2.checkX + 20; g2.spawn(g2.respawnX);
      s2.run(3, () => s2.livesLost > 0);
      restarts++;
      if (s2.livesLost) { bad++; t.fail(`delivery ${level} seed ${seed}: restarting at the checkpoint flag (x=${g2.respawnX.toFixed(0)}, grade ${(-g2.slope(g2.respawnX)).toFixed(2)}) loses the fresh egg without touching the controls`); }
    }
    for (const z of g.winds) {
      if (z.x0 > g.goalX) continue;
      gusts++;
      for (let x = z.x0 + STEP; x < z.x1 && bad < 2; x += STEP) {
        if (g.ground(x - 40) > 1500 || g.ground(x + 40) > 1500) continue;
        const fall = (g.ground(x + 40) - g.ground(x - 40)) / 80, into = z.f < 0 ? -fall : fall, w = Math.abs(g.windAt(x));   // into: how steeply the road runs against the gust
        if (into >= 0.45) { if (w > worstGust) worstGust = w; if (w > 1) { bad++; t.fail(`delivery ${level} seed ${seed}: a gust of ${w.toFixed(0)} blows down a slope of grade ${into.toFixed(2)} at x=${x} (it should be sheltered)`); } }
        if (w > Math.abs(z.f) + 1e-6) { bad++; t.fail(`delivery ${level} seed ${seed}: a gust blows at ${w.toFixed(0)}, over its strength of ${Math.abs(z.f).toFixed(0)}`); }
      }
    }
    for (const rp of g.ramps) {
      if (!rp.gap) continue;
      chasms++;
      let k = 0;
      for (let u = -1300; u < -320; u += STEP) k = Math.max(k, Math.abs(g.ground(rp.x + u) - g.ground(rp.x + u + STEP)) / STEP);
      if (k > worstRunUp) worstRunUp = k;
      if (k > RUNUP + 0.01 && bad < 2) { bad++; t.fail(`delivery ${level} seed ${seed}: the run-up to the chasm at x=${rp.x.toFixed(0)} is not flat (grade ${k.toFixed(2)}; at most ${RUNUP})`); }
      const mush = g.mushrooms.find((q) => q.x > rp.x - 1650 && q.x < rp.x + rp.w + 760);
      if (mush && bad < 2) { bad++; t.fail(`delivery ${level} seed ${seed}: a mushroom (x=${mush.x.toFixed(0)}) stands in the run-up or landing of the chasm at x=${rp.x.toFixed(0)}`); }
      for (const [what, list] of [['a gust', g.winds], ['an oil patch', g.oils], ['a moon patch', g.lowG]]) {
        const z = list.find((q) => q.x1 > rp.x - 1650 && q.x0 < rp.x + rp.w + 760);
        if (z && bad < 2) { bad++; t.fail(`delivery ${level} seed ${seed}: ${what} (${z.x0.toFixed(0)}–${z.x1.toFixed(0)}) lies in the run-up, jump or landing of the chasm at x=${rp.x.toFixed(0)}`); }
      }
    }
    for (const rp of g.ramps) {
      if (rp.gap || rp.x > g.goalX) continue;
      ramps++;
      const hill = (x) => g.ground(x) - g.rampLift(x);
      let kick = 0, lo = 0, hi = 0;
      for (let u = -200; u < 0; u += STEP) kick = Math.max(kick, (g.ground(rp.x + u) - g.ground(rp.x + u + STEP)) / STEP);
      for (let u = -400; u < 0; u += STEP) { const k = (hill(rp.x + u) - hill(rp.x + u + STEP)) / STEP; lo = Math.min(lo, k); hi = Math.max(hi, k); }
      if (kick > worstKick) worstKick = kick;
      if (kick > RAMP_GRADE + 0.02 && bad < 2) { bad++; t.fail(`delivery ${level} seed ${seed}: the ramp at x=${rp.x.toFixed(0)} is a wall: its kicker and the hill under it reach grade ${kick.toFixed(2)} (cap ${RAMP_GRADE})`); }
      else if ((lo < RAMP_HILL[0] - 0.02 || hi > RAMP_HILL[1] + 0.02) && bad < 2) { bad++; t.fail(`delivery ${level} seed ${seed}: the ramp at x=${rp.x.toFixed(0)} stands on steep ground (the hill before its lip runs from grade ${lo.toFixed(2)} to ${hi.toFixed(2)}; allowed ${RAMP_HILL[0]} to ${RAMP_HILL[1]})`); }
    }
    for (let x = 0; x < g.goalX && bad < 2; x += STEP) {
      if (inGap(x)) { run = 0; continue; }
      const a = g.ground(x), b = g.ground(x + STEP);
      if (a > 1500 || b > 1500) continue;
      const rise = a - b;                                      // y grows downwards: positive = uphill
      if (Math.abs(rise) > worstStep && !inGap(x + STEP)) worstStep = Math.abs(rise);
      if (rise > LIP) { bad++; t.fail(`delivery ${level} seed ${seed}: the road jumps up ${rise.toFixed(0)} px at x=${x} (a wall)`); continue; }
      if (inKicker(x)) { run = 0; continue; }
      run = rise / STEP > STEEP ? run + STEP : 0;
      if (run > longest) longest = run;
      if (run === RUN + 2 * STEP) { bad++; t.fail(`delivery ${level} seed ${seed}: a climb steeper than ${STEEP} goes on for more than ${RUN} px, ending past x=${x}`); }
      if (rise / STEP > worstGrade) worstGrade = rise / STEP;
      if (rise / STEP > GRADE + 0.01) { bad++; t.fail(`delivery ${level} seed ${seed}: a climb of grade ${(rise / STEP).toFixed(2)} at x=${x} (cap ${GRADE}; the egg can't stay in the cup)`); }
    }
  }
}
t.done(`${roads} roads: no walls, steepest climb ${worstGrade.toFixed(2)} (cap ${GRADE}), longest steep climb ${longest} px (cap ${RUN}), biggest one-sample rise ${worstStep.toFixed(0)} px outside chasms; ${ramps} ramps on gentle ground, steepest kicker ${worstKick.toFixed(2)} (cap ${RAMP_GRADE}); ${chasms} chasms with a flat, clear run-up (steepest ${worstRunUp.toFixed(2)}); ${gusts} gusts, none on a steep slope against the truck; ${restarts} restarts at the flag keep their egg`);

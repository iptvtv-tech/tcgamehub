// node games/lunar-delivery/test.mjs [--levels 20] [--seeds 6]
// Regression test (16 Nov 2026, found while writing the benchmark bot): from level 8 some legs
// cannot be flown on one tank, even by the level checker's own fuel sum (legFuel in world.js);
// the fuel canisters on the leg make up the difference. A canister stayed "taken" after a lost
// life, so a pilot who picked it up and then crashed was sent back to the pad with one tank and
// no canister: that leg could never be finished again, however many lives were left.
// Runs the real game headless (tools/lib/headless.mjs): on every leg it flies the hopper through
// each canister (the game's own pick-up), crashes it (the game's own crash), and checks that the
// leg's canisters are waiting again and the tank plus canisters still covers the leg.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { legFuel, crateKind, PHYS } from './world.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 20), SEEDS = arg('--seeds', 6);
const warn = console.warn; console.warn = () => {};          // no WebGL in Node: the game says so once per start
const LD = await loadGame('lunar-delivery');
const t = reporter('lunar-delivery');

let legs = 0, thirsty = 0;
for (let level = 1; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;                              // bonus rounds have no cargo and no fuel
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = LD.start({ seed: seed * 409 + level, level, lives: 99 });
    const g = s.game, tag = `level ${level} seed ${seed}`;
    for (let leg = 0; leg < g.legs; leg++) {
      const A = g.W.pads[leg], B = g.W.pads[leg + 1];
      const need = legFuel(g.W.ground, A, B, level, crateKind(level, leg)).fuel;
      const cans = g.W.fuel.filter((f) => f.leg === leg);
      legs++; if (need > 100) thirsty++;
      // start this leg as the game does after a delivery, then take every canister on it
      g.leg = leg; g.spawnAtPad(leg); g.newCrate(leg, leg === 0 ? A.cargo : null);
      for (const f of cans) { g.p = [f.x, f.y, f.z]; g.landed = false; g.collect(); }
      if (!t.check(cans.every((f) => f.got), `${tag} leg ${leg}: flying through a canister did not pick it up`)) continue;
      // the mistake: a crash
      const before = s.livesLost;
      g.crash('TEST CRASH');
      s.run(8, () => s.state === 'playing' && s.livesLost > before);
      if (!t.check(s.livesLost === before + 1 && s.state === 'playing', `${tag} leg ${leg}: the crash did not cost a life and restart the leg`)) continue;
      const left = g.W.fuel.filter((f) => f.leg === leg && !f.got).length;
      const have = g.fuel + left * PHYS.CAN;
      if (left !== cans.length) t.fail(`${tag} leg ${leg}: after a lost life ${cans.length - left} of ${cans.length} canister(s) are gone for good`);
      else if (need > have) t.fail(`${tag} leg ${leg}: needs ${need.toFixed(0)}% fuel, has ${have.toFixed(0)}% after a lost life`);
    }
  }
}
console.warn = warn;
t.done(`${legs} legs (${thirsty} need more than one tank): the canisters are back after a lost life`);

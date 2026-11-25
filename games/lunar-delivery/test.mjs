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
import { legFuel, crateKind, PHYS, CRATE_MASS, burnFor } from './world.js';

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
// Regression test (25 Nov 2026, found while chasing the benchmark's unfinishable runs on
// levels 18–19): legFuel priced every leg at a 13 m/s cruise, but a pilot holding the stick
// hard forward with the engine lit never passes ~7 m/s (normal crate) or ~6 m/s (heavy), so
// the longest heavy legs were provisioned a canister short — for players too, not just bots.
// The model's priced cruise speed must never exceed what a full-stick pilot actually reaches.
const STEP = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** Hook the crate, climb, then full stick towards the next pad with the engine lit: peak speed. */
function fullStickPeak(level, seed) {
  const s = LD.start({ seed: seed * 7919 + level * 31, level, lives: 99 });
  const g = s.game, T = g.W.pads[1];
  let playT = 0, peak = 0, phase = 'hook';
  for (let i = 0; i < Math.round(90 / STEP) && s.state === 'playing' && g.leg === 0 && g.fuel > 1; i++) {
    const p = g.p, v = g.v, c = g.crate;
    let burn = false, tilt = 0, turn = 0;
    if (!c?.hooked) {
      phase = 'hook';
      const over = c ? Math.hypot(c.c[0] - p[0], c.c[2] - p[2]) : 0;
      if (c && over > 0.2) {
        let e = wrap(Math.atan2(c.c[0] - p[0] - v[0] * 2, c.c[2] - p[2] - v[2] * 2) - g.yaw), back = false;
        if (Math.abs(e) > Math.PI / 2) { e = wrap(e + Math.PI); back = true; }
        turn = clamp(-e * 4, -1, 1); tilt = clamp(over / 4, 0, 0.5) * Math.cos(e) * (back ? -1 : 1);
      }
      burn = v[1] < clamp((c ? c.c[1] + 5.4 - p[1] : 0) * 0.9, -2, 4);
    } else if (phase !== 'go' && p[1] < g.W.ceiling - 30) {
      phase = 'climb'; burn = v[1] < 5;
      if (p[1] > g.W.ground(p[0], p[2]) + 40) phase = 'go';
    } else {
      phase = 'go';
      let e = wrap(Math.atan2(T.x - p[0], T.z - p[2]) - g.yaw), back = false;
      if (Math.abs(e) > Math.PI / 2) { e = wrap(e + Math.PI); back = true; }
      turn = clamp(-e * 4, -1, 1); tilt = Math.cos(e) * (back ? -1 : 1);
      burn = v[1] < 0.2;
      peak = Math.max(peak, Math.hypot(v[0], v[2]));
    }
    g.stick = { id: 'bot', dx: turn, dy: -tilt };
    s.hold(burn ? ['action'] : []);
    s.tick();
    playT += STEP;
  }
  return peak;
}
const flat = () => 0, A0 = { x: 0, z: 0, y: 0 };
for (const [kind, level, seed] of [['normal', 1, 1], ['heavy', 18, 1]]) {
  // the cruise speed the model charges for, backed out of legFuel on flat ground
  const f1 = legFuel(flat, A0, { x: 200, z: 0, y: 0 }, level, kind).fuel;
  const f2 = legFuel(flat, A0, { x: 400, z: 0, y: 0 }, level, kind).fuel;
  const duty = PHYS.G * (1 + CRATE_MASS[kind]) / PHYS.THRUST;
  const priced = 200 * duty * burnFor(level) / (f2 - f1);
  const peak = fullStickPeak(level, seed);
  t.check(peak > 2, `the full-stick pilot never got going on level ${level} (peak ${peak.toFixed(1)} m/s)`);
  t.check(priced <= peak + 0.01, `legFuel prices a ${kind} cruise at ${priced.toFixed(1)} m/s but a full-stick pilot reaches only ${peak.toFixed(1)} m/s: long ${kind} legs get too few canisters`);
}

console.warn = warn;
t.done(`${legs} legs (${thirsty} need more than one tank): the canisters are back after a lost life`);

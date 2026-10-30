// node games/star-strike/test.mjs
// Regression tests for the Hydra boss (sectors 9, 24, …), found by the benchmark, 30 Oct 2026.
// Plays the real game headless (tools/lib/headless.mjs); the sector clock is skipped so the boss
// arrives straight away.
//  1. It crawled in at ~0.23 units/s instead of 14 (the approach was scaled by dt twice), so it
//     never came within firing range: a harmless shooting gallery.
//  2. Its head armour cracked only with 2 of 8 tail segments left, not half.
//  3. A lost life removes everything near the ship (z ≤ 30); a tail segment removed that way
//     would never be counted as broken, so the armour could never crack (the boss unkillable).
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const G = await loadGame('star-strike');
const t = reporter('star-strike');

function hydra(level) {
  const s = G.start({ seed: level, level, unlimited: true }), g = s.game;
  g.sectorT = g.sectorLen; g.ents = []; g.waveT = 99;
  s.run(0.1);
  return { s, g };
}

for (const level of [9, 24]) {
  // 1. comes within range and fires
  {
    const { s, g } = hydra(level);
    if (!t.check(g.boss?.kind === 'head', `level ${level}: no Hydra (boss ${g.boss?.kind})`)) continue;
    let shots = 0; const eb = g.enemyShot.bind(g); g.enemyShot = (...a) => { shots++; return eb(...a); };
    s.run(10, () => { g.invuln = 99; return false; });
    t.check(g.boss.z < 42, `level ${level}: after 10 s the Hydra's head is still at z ${g.boss.z.toFixed(1)} (it fires only below 42)`);
    t.check(shots > 0, `level ${level}: the Hydra fired nothing in its first 10 s`);
  }
  // 2. armour cracks at half the tail
  {
    const { s, g } = hydra(level);
    const n = g.ents.filter((e) => e.kind === 'seg').length;
    let broken = 0;
    while (g.boss.armour && broken < n) { g.destroy(g.ents.find((e) => e.kind === 'seg' && !e.dead)); broken++; s.run(1 / 120); }
    t.check(broken === Math.ceil(n / 2) || broken === Math.floor(n / 2), `level ${level}: the armour cracked after ${broken} of ${n} tail segments, not half`);
  }
  // 3. a lost life never removes tail segments
  {
    const { s, g } = hydra(level);
    s.run(8, () => { g.invuln = 99; return false; });
    const before = g.ents.filter((e) => e.kind === 'seg' && !e.dead).length;
    g.invuln = 0; s.hurt(); s.run(3, () => s.state === 'playing');
    const after = g.ents.filter((e) => e.kind === 'seg' && !e.dead).length;
    t.check(after === before && g.hydraSegs === after, `level ${level}: a lost life left ${after} of ${before} tail segments (count says ${g.hydraSegs})`);
  }
}
t.done('the Hydra comes in and fires, its armour cracks at half its tail, and a lost life keeps its tail');

// node games/bubble-blitz/test.mjs
// Regression tests (found by the benchmark, 30 Oct 2026). Plays the real game headless
// (tools/lib/headless.mjs).
//  1. Dead launcher: the "TOO LOW!" countdown ended at -3.6e-16 instead of 0, which the launcher
//     and the danger check read as "still failing": after the first TOO LOW life loss nothing
//     ever fired again, on every level, and the level could never end.
//  2. Death spiral: a lost life melted only the two lowest rows and the ceiling never came back
//     up, so once it had dropped far enough every shot cost another life.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const BB = await loadGame('bubble-blitz');
const t = reporter('bubble-blitz');
const H = 720, R = 19, DANGER = H - 158;                 // game.js
const press = (s) => { s.keyUp('action'); s.keyDown('action'); };

/** Fire straight up again and again (no aiming) until a TOO LOW life loss. */
function loseOne(s, g, limit = 180) {
  const lost = s.livesLost;
  for (let i = 0; i < limit * 120 && s.livesLost === lost; i++) { if (s.state === 'playing' && !g.shot) press(s); s.tick(); }
  s.run(3, () => s.state === 'playing');
  return s.livesLost > lost;
}
const lowest = (g) => Math.max(...g.cells().map(([row]) => g.xy(row, 0)[1] + R));

let checked = 0;
for (const level of [1, 3, 6, 9, 14, 18]) {
  for (const seed of [1, 2, 3]) {
    const s = BB.start({ seed, level, unlimited: true }), g = s.game;
    if (!t.check(loseOne(s, g), `level ${level} seed ${seed}: firing straight up never cost a life (test setup)`)) continue;
    // 1. the launcher fires again after a TOO LOW life loss
    let shots = 0;
    for (let i = 0; i < 20; i++) { press(s); if (g.shot) shots++; s.run(0.5); }
    t.check(shots > 0, `level ${level} seed ${seed}: after a TOO LOW life loss the launcher never fires again (failing = ${g.failing})`);
    // 2. no death spiral: lose life after life, and each time the board comes back clear of the line
    for (let k = 0; k < 14; k++) {
      if (!loseOne(s, g)) break;
      const low = lowest(g);
      if (!t.check(low <= DANGER - 2 * R * Math.sqrt(3) + 1, `level ${level} seed ${seed}: after ${s.livesLost} lost lives the board is still at the line (lowest bubble ${low.toFixed(0)}, line ${DANGER}) — every shot would cost another life`)) break;
    }
    checked++;
  }
}
t.done(`${checked} runs: the launcher always fires again after TOO LOW, and every lost life leaves the board clear of the line`);

// node games/crystal-cascade/test.mjs
// Regression test (found by the benchmark, 30 Oct 2026): a fresh board (a new level, or the board
// rebuilt after a lost life) sometimes started with a ready-made group of 3: the builder re-picked
// a clashing colour at random up to 8 times and could miss the one safe colour (~1 board in 350).
// Builds real boards headless (tools/lib/headless.mjs).
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const G = await loadGame('crystal-cascade');
const t = reporter('crystal-cascade');
let boards = 0, bad = 0;
for (let level = 1; level <= 20; level++) for (let seed = 1; seed <= 200; seed++) {
  const s = G.start({ seed, level }), g = s.game;
  if (g.bonus) continue;
  boards++;
  const gr = g.findGroups();
  if (gr.length && ++bad <= 5) t.fail(`level ${level} seed ${seed}: the fresh board starts with ${gr.length} ready-made group(s) of 3+`);
}
t.done(`${boards} fresh boards, none with a ready-made group`);

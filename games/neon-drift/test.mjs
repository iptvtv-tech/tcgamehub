// node games/neon-drift/test.mjs
// Regression test (found by the benchmark, 30 Oct 2026): the title screen's attract race follows
// the third rival, but a boss race (levels 5, 10, 15, 20) has only one. Losing your last life at a
// boss and pressing Menu threw an error every frame (the backdrop froze, the console filled up).
// Plays the real game headless (tools/lib/headless.mjs).
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const G = await loadGame('neon-drift');
const t = reporter('neon-drift');
for (const boss of [5, 10, 15, 20]) {
  const s = G.start({ seed: boss, level: boss - 1 }), g = s.game;
  g.startLevel(boss, false);                       // the run reaches the boss
  s.state = 'over'; g.idle(1 / 60);                // game over there…
  s.state = 'title';                               // …and the player taps Menu
  let err = null;
  try { for (let i = 0; i < 120; i++) g.idle(1 / 60); } catch (e) { err = e; }
  t.check(!err, `level ${boss} boss: the title screen after a game over throws "${err?.message}"`);
  try { G.start({ seed: 1, level: boss }); } catch (e) { t.fail(`starting straight at the level ${boss} boss throws "${e.message}"`); }
}
t.done('the title screen runs after a game over at every boss');

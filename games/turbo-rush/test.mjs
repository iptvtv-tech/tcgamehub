// node games/turbo-rush/test.mjs
// Regression test (found by the benchmark, 30 Oct 2026): from level 9 a police car overtakes you.
// Once it was 70 segments ahead the traffic step dropped it from the road, but the game still
// held on to it as "the police car", frozen in place: no new police car came for the rest of that
// life, and driving past the spot later showed the "MOVE!" warning and the siren with no car there.
// Drives real levels headless (tools/lib/headless.mjs) with the benchmark's bot.
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';

const G = await loadGame('turbo-rush');
const B = (await import('./bench.mjs')).default;
const t = reporter('turbo-rush');

let runs = 0, policeSeen = 0;
for (const level of [9, 13, 17]) {
  for (const seed of [1, 2, 3]) {
    const s = G.start({ seed, level, unlimited: true }), g = s.game;
    const b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
    const seen = new Set();
    let ghost = 0;
    for (let i = 0; i < 120 * 90 && !s.cleared; i++) {
      if (s.state === 'playing') { b.t = i * STEP; B.bot(g, s, b); }
      s.tick();
      if (g.police) { seen.add(g.police); if (s.state === 'playing' && !g.cars.includes(g.police)) ghost++; }
    }
    runs++; policeSeen += seen.size;
    t.check(ghost === 0, `level ${level} seed ${seed}: the police car stayed "on duty" for ${(ghost * STEP).toFixed(1)} s after leaving the road (a frozen ghost)`);
    t.check(seen.size >= 2, `level ${level} seed ${seed}: only ${seen.size} police car(s) in ${s.time.toFixed(0)} s (one should come every ~9–16 s)`);
  }
}
t.done(`${runs} runs, ${policeSeen} police cars, none left behind as a ghost`);

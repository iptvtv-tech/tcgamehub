// node games/prism-breaker/test.mjs [--levels 40] [--seeds 1500]
// Regression test (29 Oct 2026 review): from level 6 some bricks turn to unbreakable steel at
// random. Bricks sit 5 px apart and the ball is 14 px across, so a brick boxed in by steel on all
// four sides can never be hit and the level can never be cleared. Builds thousands of real
// boards (tools/lib/headless.mjs) and checks every breakable brick has an open path to it.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 40), SEEDS = arg('--seeds', 1500);
const PB = await loadGame('prism-breaker');
const t = reporter('prism-breaker');

// independent check (not the game's own sealedIn): grid flood fill from outside the wall
function sealed(g) {
  const at = new Map();   // bricks are 51+5 px wide and 22+5 px tall, starting at (18.5, 84)
  for (const b of g.bricks) at.set(`${Math.round((b.x - 18.5) / 56)},${Math.round((b.y - 84) / 27)}`, b);
  const C = 8, R = Math.max(0, ...[...at.keys()].map((k) => +k.split(',')[1])) + 1;
  const seen = new Set(), q = [];
  for (let c = -1; c <= C; c++) for (let r = -1; r <= R; r++) if (c < 0 || c === C || r < 0 || r === R) { seen.add(`${c},${r}`); q.push([c, r]); }
  while (q.length) { const [c, r] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${c + a},${r + b}`; if (c + a < -1 || c + a > C || r + b < -1 || r + b > R || seen.has(k) || at.get(k)?.type === 'steel') continue; seen.add(k); q.push([c + a, r + b]); } }
  return [...at.entries()].filter(([k, b]) => b.type !== 'steel' && !seen.has(k)).length;
}

let boards = 0, withSteel = 0;
for (let level = 6; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;
  let bad = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = PB.start({ seed: seed * 977 + level, level });
    boards++; if (s.game.bricks.some((b) => b.type === 'steel')) withSteel++;
    const n = sealed(s.game);
    if (n && bad++ < 2) t.fail(`level ${level} seed ${seed}: ${n} brick(s) walled in by steel — the level can never be cleared`);
  }
}
t.done(`${boards} boards from level 6 (${withSteel} with steel), every brick reachable`);

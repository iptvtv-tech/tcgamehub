// node games/neon-snake/test.mjs [--levels 30] [--seeds 3000]
// Regression test (29 Oct 2026 review): food must only appear where the snake can get to it.
// The reachability search treated portal squares as floor, but moving into a portal comes out of
// the other one, so a pocket whose only way in was a portal square counted as reachable. Builds
// thousands of real boards (tools/lib/headless.mjs), spawns food on each, and checks every piece
// with an independent search that moves exactly the way the game's step() does.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 30), SEEDS = arg('--seeds', 3000);
const NS = await loadGame('neon-snake');
const t = reporter('neon-snake');

// where can the head get to? state = cell; a move into a portal exits the other one, one step on
function reach(g, COLS, ROWS) {
  const ok = (x, y) => (g.solid ? (x < 0 || y < 0 || x >= COLS || y >= ROWS ? null : [x, y]) : [(x + COLS) % COLS, (y + ROWS) % ROWS]);
  const P = g.portals, isP = (c) => P && P.some((p) => p.x === c[0] && p.y === c[1]);
  const h = g.snake[0], seen = new Set([`${h.x},${h.y}`]), q = [[h.x, h.y]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let c = ok(x + dx, y + dy);
      if (c && isP(c)) { const o = P[0].x === c[0] && P[0].y === c[1] ? P[1] : P[0]; c = ok(o.x + dx, o.y + dy); }
      if (!c || isP(c) || g.obstacles.has(c[1] * COLS + c[0]) || seen.has(`${c[0]},${c[1]}`)) continue;
      seen.add(`${c[0]},${c[1]}`); q.push(c);
    }
  }
  return seen;
}

let boards = 0, foods = 0;
for (let level = 1; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;
  let bad = 0;
  for (let seed = 1; seed <= SEEDS && bad < 2; seed++) {
    const s = NS.start({ seed: seed * 389 + level, level }), g = s.game;
    const COLS = 20, ROWS = 20;                           // games/neon-snake/game.js board
    boards++;
    for (let k = 0; k < 6; k++) g.spawnFood();
    const R = reach(g, COLS, ROWS);
    // the game's own map of reachable squares must agree on every free square (a pocket behind
    // a portal used to count as reachable, so food could spawn there)
    const mine = g.reachableCells();
    const isP = (x, y) => g.portals && g.portals.some((p) => p.x === x && p.y === y);
    let wrong = null;
    for (let y = 0; y < ROWS && !wrong; y++) for (let x = 0; x < COLS; x++) {
      if (g.obstacles.has(y * COLS + x) || isP(x, y)) continue;
      if (!!mine[y * COLS + x] !== R.has(`${x},${y}`)) { wrong = [x, y, !!mine[y * COLS + x]]; break; }
    }
    if (wrong) { t.fail(`level ${level} seed ${seed}: square ${wrong[0]},${wrong[1]} is ${wrong[2] ? 'counted reachable but isn\'t' : 'reachable but not counted'}`); bad++; continue; }
    for (const f of g.foods) {
      foods++;
      if (g.obstacles.has(f.y * COLS + f.x)) { t.fail(`level ${level} seed ${seed}: food on a wall at ${f.x},${f.y}`); bad++; break; }
      if (!R.has(`${f.x},${f.y}`)) { t.fail(`level ${level} seed ${seed}: food at ${f.x},${f.y} can't be reached${g.portals ? ' (portals on this level)' : ''}`); bad++; break; }
    }
  }
}
t.done(`${boards} boards: reachable squares worked out right, ${foods} food spawns all reachable`);

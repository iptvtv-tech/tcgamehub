// node games/snake-escape-puzzle/test.mjs [--levels 160]
// Plays the real Snake Escape Puzzle headless (tools/lib/headless.mjs) and proves:
//   1 · the puzzle book: the board the game really shows on every level (1–160: the 32 stored
//       puzzles, the repeats, and the turned / mirrored knots from level 41) is well formed
//       (snakes on the board, on no rock, not overlapping) and can be cleared, and the fewest
//       moves that clear it is exactly the "opt" the move limit is built on. Same for the Daily
//       Challenge's turned boards.
//   2 · tapping the shortest solution clears every level inside the move limit (opt + 2 spare
//       moves up to level 4, + 1 up to 29, none after), and a blocked tap costs no move
//   3 · levels can be finished after a real mistake (the benchmark's bot wastes moves until it
//       is out of moves, loses the life, then solves the board), rules holding at every step
//   4 · OUT OF MOVES costs exactly one life and gives the board back as new; ↺ Restart is free,
//       and from level 12 it doesn't give the clock back; TIME UP costs one life and does
//   5 · STAMPEDE (bonus): every herd can be freed completely, and it ends on its 15 s timer
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';
import { makeBoard, occupancy, reach, exitOffset, keyOf } from './rules.js';
import { PUZZLES } from './puzzles.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 160);
const G = await loadGame('snake-escape-puzzle');
const B = (await import('./bench.mjs')).default;
const t = reporter('snake-escape-puzzle');
const W = 480, BOARD = 440, BX = (W - BOARD) / 2, BY = 112;
const RESTART = { x: W / 2, y: BY + BOARD + 50 + 19 };
const slackFor = (L) => (L <= 4 ? 2 : L <= 29 ? 1 : 0);
const isBonus = (L) => L % 5 === 0;

/** Is this board well formed? A problem in words, or null. */
function malformed(P) {
  const n = P.n, seen = new Map(), rocks = new Set((P.rocks || []).map(([x, y]) => y * n + x));
  for (const [x, y] of P.rocks || []) if (x < 0 || y < 0 || x >= n || y >= n) return `a rock is off the board at (${x}, ${y})`;
  for (let i = 0; i < P.snakes.length; i++) {
    const sn = P.snakes[i];
    if (sn.body.length < 2) return `snake ${i} is ${sn.body.length} cell long`;
    if (![0, 1, 2, 3].includes(sn.d)) return `snake ${i} faces ${sn.d}`;
    for (let k = 0; k < sn.body.length; k++) {
      const [x, y] = sn.body[k], id = y * n + x;
      if (x < 0 || y < 0 || x >= n || y >= n) return `snake ${i} is off the board at (${x}, ${y})`;
      if (rocks.has(id)) return `snake ${i} lies on a rock at (${x}, ${y})`;
      if (seen.has(id)) return `snakes ${seen.get(id)} and ${i} overlap at (${x}, ${y})`;
      seen.set(id, i);
      if (k && Math.abs(x - sn.body[k - 1][0]) + Math.abs(y - sn.body[k - 1][1]) !== 1) return `snake ${i} is broken between cells ${k - 1} and ${k}`;
    }
  }
  return null;
}

/** Every position of a board: the fewest moves to clear it, and a shortest line of taps. */
const solved = new Map();
function solve(P) {
  const id = JSON.stringify([P.n, P.rocks, P.snakes]);
  if (solved.has(id)) return solved.get(id);
  const Bd = makeBoard(P), n = Bd.snakes.length;
  const start = new Array(n).fill(0), goal = keyOf(Bd.snakes.map(exitOffset));
  const from = new Map([[keyOf(start), null]]);
  let layer = [start], depth = 0, found = false;
  while (layer.length && !found) {
    const next = [];
    for (const st of layer) {
      const occ = occupancy(Bd, st), k0 = keyOf(st);
      if (k0 === goal) { found = true; break; }
      for (let i = 0; i < n; i++) {
        if (st[i] >= exitOffset(Bd.snakes[i])) continue;
        const k = reach(Bd, st, i, occ);
        if (!k) continue;
        const ns = st.slice(); ns[i] += k;
        const nk = keyOf(ns);
        if (!from.has(nk)) { from.set(nk, [k0, i]); next.push(ns); }
      }
    }
    if (!found) { layer = next; depth++; }
  }
  let line = null;
  if (found) { line = []; for (let k = goal; from.get(k); k = from.get(k)[0]) line.unshift(from.get(k)[1]); }
  const out = { opt: found ? depth : null, line, states: from.size };
  solved.set(id, out);
  return out;
}

// ── 1 · the puzzle book ──
let boards = 0, turned = 0;
{
  const keys = Object.keys(PUZZLES).map(Number);
  for (let L = 1; L <= 40; L++) if (!isBonus(L)) t.check(keys.includes(L), `level ${L} has no puzzle of its own in puzzles.js`);
  const shapes = new Set();
  for (let L = 1; L <= LEVELS; L++) {
    if (isBonus(L)) continue;
    const s = G.start({ seed: 1, level: L }), g = s.game, P = g.P;
    boards++; shapes.add(JSON.stringify(P.snakes));
    const bad = malformed(P);
    if (!t.check(!bad, `level ${L}: ${bad}`)) continue;
    const r = solve(P);
    if (!t.check(r.opt != null, `level ${L}: the board can't be cleared at all`)) continue;
    t.check(r.opt === P.opt, `level ${L}: the board needs ${r.opt} moves at best, but the game counts on ${P.opt}`);
    t.check(g.limit === P.opt + slackFor(L), `level ${L}: the move limit is ${g.limit} (opt ${P.opt} + ${slackFor(L)} spare)`);
    t.check(g.timeMax === (L >= 12 ? 30 + P.opt * 6 : 0), `level ${L}: the clock is ${g.timeMax} s`);
  }
  // from level 41 the 16 hardest knots come back turned and mirrored, a new view each time round
  t.check(LEVELS < 160 || shapes.size >= 110, `only ${shapes.size} different boards in levels 1–${LEVELS} (the 32 puzzles and about 90 turned views expected)`);
  // the Daily Challenge turns the board with the day's seed
  for (const L of [1, 8, 19, 27, 38]) for (let seed = 1; seed <= 12; seed++) {
    const s = G.start({ seed, level: L }), g = s.game;
    s.daily = true; g.startLevel(L, false);
    turned++;
    const bad = malformed(g.P), r = bad ? null : solve(g.P);
    t.check(!bad && r.opt === g.P.opt, `Daily, level ${L} seed ${seed}: ${bad || `the turned board needs ${r.opt} moves, the game counts on ${g.P.opt}`}`);
  }
}

// taps, the way a player makes them
const cellXY = (g, [x, y]) => [BX + (x + 0.5) * g.cell, BY + (y + 0.5) * g.cell];
const settle = (s) => s.run(6, () => s.state !== 'playing' || !s.game.busy());
/** Tap snake i (on a cell it lies on now) and let it finish slithering. */
function tapSnake(s, i) {
  const g = s.game, sn = g.B.snakes[i];
  const c = sn.path[g.st[i] + sn.len - 1] || sn.path[g.st[i]];
  s.tap(...cellXY(g, c));
  settle(s);
}

// ── 2 · the shortest solution clears every level; a blocked tap is free ──
let solvedRuns = 0;
for (let L = 1; L <= Math.min(LEVELS, 60); L++) {
  if (isBonus(L)) continue;
  const s = G.start({ seed: 2, level: L }), g = s.game;
  const line = solve(g.P).line;
  if (!line) continue;
  // a snake that can't move yet: tapping it must not use up a move
  const stuck = g.B.snakes.findIndex((_, i) => reach(g.B, g.st, i, g.occ) === 0);
  if (stuck >= 0) { tapSnake(s, stuck); t.check(g.moves === 0 && s.livesLost === 0, `level ${L}: tapping a blocked snake used a move or a life`); s.run(0.6); }
  for (const i of line) tapSnake(s, i);
  s.run(1, () => s.cleared > 0);
  solvedRuns++;
  t.check(s.cleared === 1 && s.livesLost === 0, `level ${L}: tapping the ${line.length}-move solution did not clear the board (moves ${g.moves}/${g.limit}, lives lost ${s.livesLost})`);
  t.check(g.moves === g.par, `level ${L}: the solution took ${g.moves} moves on screen, opt is ${g.par}`);
}

// ── 3 · finishable after a real mistake ──
let runs = 0, lost = 0, costly = 0;
for (const level of [1, 3, 4, 6, 9, 12, 14, 17, 19]) {
  const r = botPlay(G, B, { level, seed: 1 });
  runs++; lost += r.deaths;
  const g = r.shell.game;
  t.check(r.cleared, `level ${level}: ${why(r)} (moves ${g.moves}/${g.limit}, ${r.deaths} lives lost)`);
  if (r.mistakeCost >= 1) costly++;
}
// (on a few small boards wasted moves can still be made good, so the mistake costs nothing there)
t.check(costly >= 6, `the wasted moves cost a life on only ${costly} of ${runs} levels`);

// ── 4 · out of moves, restart, time up ──
for (const L of [7, 9, 13, 22, 33]) {
  const s = G.start({ seed: 3, level: L, unlimited: true }), g = s.game;
  // waste moves: always the tap that leaves the longest way home, until the limit
  const lives = s.livesLost;
  let guard = 0;
  while (s.state === 'playing' && s.livesLost === lives && guard++ < 60) {
    const can = g.B.snakes.map((_, i) => i).filter((i) => g.st[i] < exitOffset(g.B.snakes[i]) && reach(g.B, g.st, i, g.occ) > 0);
    if (!can.length || g.moves >= g.limit) { s.run(1.5, () => s.livesLost > lives); break; }
    // a tap that doesn't send a snake out, when there is one
    const partial = can.find((i) => g.st[i] + reach(g.B, g.st, i, g.occ) < exitOffset(g.B.snakes[i]));
    tapSnake(s, partial ?? can[0]);
    if (g.moves < g.limit && s.state === 'playing' && !g.busy()) { s.run(1); s.tap(RESTART.x, RESTART.y); s.tick(); if (g.moves === 0) break; }
  }
  // (that loop also pressed ↺ Restart after the first tap: a free restart)
  t.check(s.livesLost === lives && g.moves === 0 && g.restarts === 1, `level ${L}: ↺ Restart after one move left moves ${g.moves}, restarts ${g.restarts}, lives lost ${s.livesLost - lives}`);
  t.check(g.st.every((o) => o === 0) && g.snakes.every((sn) => sn.alive), `level ${L}: ↺ Restart did not put every snake back`);
  if (g.timeMax) t.check(g.timeLeft < g.timeMax - 1, `level ${L}: ↺ Restart gave the clock back (${g.timeLeft.toFixed(1)} of ${g.timeMax} s)`);

  // now really run out: tap anything that moves until the game says OUT OF MOVES / STUCK
  guard = 0;
  while (s.state === 'playing' && s.livesLost === lives && guard++ < 80) {
    const can = g.B.snakes.map((_, i) => i).filter((i) => g.st[i] < exitOffset(g.B.snakes[i]) && reach(g.B, g.st, i, g.occ) > 0);
    if (s.cleared) break;
    if (!can.length || g.moves >= g.limit) { s.run(1.5, () => s.livesLost > lives); break; }
    const partial = can.filter((i) => g.st[i] + reach(g.B, g.st, i, g.occ) < exitOffset(g.B.snakes[i]));
    tapSnake(s, partial.length ? partial[guard % partial.length] : can[0]);
  }
  if (s.cleared) { t.fail(`level ${L}: wasting moves cleared the board, so running out of moves was not tested`); continue; }
  t.check(s.livesLost === lives + 1, `level ${L}: running out of moves cost ${s.livesLost - lives} lives (should be 1)`);
  t.check(g.moves <= g.limit, `level ${L}: ${g.moves} moves were allowed on a limit of ${g.limit}`);
  s.run(3, () => s.state === 'playing');
  t.check(s.state === 'playing' && g.moves === 0 && g.st.every((o) => o === 0) && g.snakes.every((sn) => sn.alive), `level ${L}: the board was not given back as new after the lost life`);
  if (g.timeMax) t.check(g.timeLeft > g.timeMax - 0.1, `level ${L}: the clock was not given back after the lost life (${g.timeLeft.toFixed(1)} of ${g.timeMax} s)`);
  // and it can still be solved
  for (const i of solve(g.P).line) tapSnake(s, i);
  s.run(1, () => s.cleared > 0);
  t.check(s.cleared === 1 && s.livesLost === lives + 1, `level ${L}: the board could not be solved after the lost life`);
}
for (const L of [12, 26]) {                                   // TIME UP
  const s = G.start({ seed: 4, level: L, unlimited: true }), g = s.game;
  t.check(g.timeMax > 0, `level ${L} has no clock`);
  const secs = s.run(g.timeMax + 5, () => s.livesLost > 0);
  t.check(s.livesLost === 1 && Math.abs(secs - g.timeMax) < 0.2, `level ${L}: doing nothing cost ${s.livesLost} lives after ${secs.toFixed(1)} s (TIME UP is at ${g.timeMax} s)`);
  s.run(3, () => s.state === 'playing');
  t.check(g.timeLeft > g.timeMax - 0.1 && g.moves === 0, `level ${L}: after TIME UP the clock is at ${g.timeLeft.toFixed(1)} of ${g.timeMax} s`);
}

// ── 5 · STAMPEDE: every herd can be freed, ends on its timer ──
{
  let herds = 0, freed = 0;
  for (const L of [5, 10, 20]) for (let seed = 1; seed <= 20; seed++) {
    const s = G.start({ seed: seed * 7 + L, level: L }), g = s.game;
    herds++;
    // newest snake first always has a clear way out
    for (let guard = 0; guard < 60; guard++) {
      const left = g.snakes.filter((sn) => sn.alive && !sn.leaving);
      if (!left.length) break;
      const free = left.filter((sn) => g.blockedAt(sn) < 0);
      if (!t.check(free.length > 0, `level ${L} seed ${seed}: a herd with ${left.length} snakes left and none free to go`)) break;
      g.tapStampede(free[0]); freed++;
    }
    t.check(g.snakes.every((sn) => !sn.alive || sn.leaving), `level ${L} seed ${seed}: the herd was not freed completely`);
  }
  t.check(herds === 60 && freed > 400, `only ${herds} herds / ${freed} snakes were checked`);
  for (const L of [5, 15]) {
    const s = G.start({ seed: L, level: L }), g = s.game;
    let k = 0;
    const secs = s.run(20, () => {                              // tap every cell in turn, blocked or not
      if (k++ % 12 === 0) { const c = Math.floor(k / 12) % (g.n * g.n); s.tap(...cellXY(g, [c % g.n, Math.floor(c / g.n)])); }
      return s.cleared > 0;
    });
    t.check(s.cleared === 1 && Math.abs(secs - 15) < 0.1 && s.livesLost === 0, `level ${L} (STAMPEDE): ended after ${secs.toFixed(1)} s with ${s.livesLost} lives lost (15 s timer, no lives at stake)`);
    t.check(g.bonusCount > 0, `level ${L} (STAMPEDE): no snake was freed by tapping`);
  }
}

t.done(`${boards} boards (+ ${turned} Daily boards) well formed with the right fewest-moves count; ${solvedRuns} solved by their shortest line; ${runs} levels finished after running out of moves (${lost} lives lost); restart, clock and STAMPEDE follow the rules`);

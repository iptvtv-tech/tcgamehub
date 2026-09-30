// Generates the hand-checked puzzle set for Snake Escape Puzzle.
// Run:  node tools/gen-snake-puzzles.mjs 1 40, then  node tools/gen-snake-puzzles.mjs merge
//
// RULES (shared with the game, see puzzleRules.js):
//   Tap a snake and it slithers forward, head first, until something is in the way.
//   If nothing is in the way it leaves the board. Clear the board within the move limit.
//   Sliding only part of the way is sometimes exactly what you need… and sometimes it
//   jams two snakes against each other for good. That's the puzzle.
//
// Every puzzle is solved exhaustively (breadth-first over every reachable position),
// so we know: it can be solved, the fewest moves it needs, how many positions are
// dead ends, and how often random tapping would get through.
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { makeBoard, slide, exitOffset, keyOf } from '../games/snake-escape-puzzle/rules.js';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function randomPuzzle(rnd, n, count, maxLen, rocks) {
  const occ = new Array(n * n).fill(-1);
  const at = (x, y) => occ[y * n + x];
  const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const rockList = [];
  for (let i = 0; i < rocks * 5 && rockList.length < rocks; i++) {
    const x = 1 + Math.floor(rnd() * (n - 2)), y = 1 + Math.floor(rnd() * (n - 2));
    if (at(x, y) === -1) { occ[y * n + x] = -2; rockList.push([x, y]); }
  }
  const snakes = [];
  for (let tries = 0; tries < 400 && snakes.length < count; tries++) {
    const hx = Math.floor(rnd() * n), hy = Math.floor(rnd() * n);
    if (at(hx, hy) !== -1) continue;
    const d = Math.floor(rnd() * 4);
    const len = 2 + Math.floor(rnd() * (maxLen - 1));
    const body = [[hx, hy]], used = new Set([hx + ',' + hy]);
    const [dx, dy] = DIRS[d];
    // the ray may not run through its own body
    const ray = new Set(); { let x = hx + dx, y = hy + dy; while (inside(x, y)) { ray.add(x + ',' + y); x += dx; y += dy; } }
    for (let k = 1; k < len; k++) {
      const [tx, ty] = body[body.length - 1];
      const opts = DIRS.map(([ex, ey]) => [tx + ex, ty + ey]).filter(([ax, ay]) => inside(ax, ay) && at(ax, ay) === -1 && !used.has(ax + ',' + ay) && !ray.has(ax + ',' + ay));
      if (!opts.length) break;
      const c = opts[Math.floor(rnd() * opts.length)];
      body.push(c); used.add(c[0] + ',' + c[1]);
    }
    if (body.length < 2) continue;
    // the neck can't sit straight in front of the head
    if (body[1][0] === hx + dx && body[1][1] === hy + dy) continue;
    for (const [x, y] of body) occ[y * n + x] = snakes.length;
    snakes.push({ body, d });
  }
  return { n, rocks: rockList, snakes };
}

/** Exhaustive search. Returns null if unsolvable or too big. */
function analyse(p, cap = 120000) {
  const B = makeBoard(p);
  const start = new Array(B.snakes.length).fill(0);
  const goal = B.snakes.map((sn) => exitOffset(sn));
  const gkey = keyOf(goal);
  const seen = new Map([[keyOf(start), { d: 0, next: [] }]]);
  const order = [start];
  let solved = null;
  for (let qi = 0; qi < order.length; qi++) {
    const st = order[qi], k = keyOf(st), node = seen.get(k);
    for (let i = 0; i < st.length; i++) {
      const ns = slide(B, st, i);
      if (!ns) continue;
      const nk = keyOf(ns);
      node.next.push(nk);
      if (!seen.has(nk)) {
        seen.set(nk, { d: node.d + 1, next: [] });
        order.push(ns);
        if (nk === gkey && !solved) solved = node.d + 1;
        if (seen.size > cap) return null;
      }
    }
  }
  if (!solved) return null;
  // which positions can still reach the goal?
  const good = new Set([gkey]);
  let changed = true;
  while (changed) { changed = false; for (const [k, v] of seen) if (!good.has(k) && v.next.some((n) => good.has(n))) { good.add(k); changed = true; } }
  const dead = 1 - good.size / seen.size;
  // how often does random tapping (only on snakes that can move) clear it within the limit?
  let wins = 0;
  const tries = 300;
  const rnd = mulberry32(12345);
  for (let t = 0; t < tries; t++) {
    let k = keyOf(start), moves = 0;
    while (k !== gkey && moves < solved + 1) { const nx = seen.get(k).next; if (!nx.length) break; k = nx[Math.floor(rnd() * nx.length)]; moves++; }
    if (k === gkey) wins++;
  }
  // "greedy" player: always sends out a snake that can leave completely, otherwise taps anything
  let gw = 0;
  const exits = (st) => st.map((o, i) => i).filter((i) => { const ns = slide(B, st, i); return ns && ns[i] >= exitOffset(B.snakes[i]); });
  for (let t = 0; t < 200; t++) {
    let st = start.slice(), moves = 0;
    while (keyOf(st) !== gkey && moves < solved + 1) {
      const ex = exits(st);
      let pick;
      if (ex.length) pick = ex[Math.floor(rnd() * ex.length)];
      else { const mv = st.map((o, i) => i).filter((i) => slide(B, st, i)); if (!mv.length) break; pick = mv[Math.floor(rnd() * mv.length)]; }
      st = slide(B, st, pick); moves++;
    }
    if (keyOf(st) === gkey) gw++;
  }
  return { opt: solved, states: seen.size, dead, random: wins / tries, greedy: gw / 200, partials: solved - B.snakes.length };
}

// Level plan: board size, snakes, and how tough the search has to be
function plan(level) {
  const n = level <= 3 ? 5 : level <= 9 ? 6 : level <= 19 ? 7 : level <= 29 ? 8 : 9;
  const count = Math.min(13, 3 + Math.floor(level / 2.5));
  const maxLen = Math.min(7, 3 + Math.floor(level / 8));
  const rocks = level >= 6 ? Math.min(5, 1 + Math.floor(level / 8)) : 0;
  const minPartials = level <= 2 ? 0 : level <= 4 ? 1 : level <= 9 ? 2 : 3;
  const maxRandom = level <= 2 ? 1 : level <= 4 ? 0.6 : level <= 9 ? 0.35 : level <= 19 ? 0.2 : 0.1;
  // how often a player who just clears the "easy outside snakes first" may still win
  const maxGreedy = level <= 2 ? 1 : level <= 4 ? 0.7 : level <= 9 ? 0.4 : level <= 19 ? 0.2 : 0.1;
  const minDead = level <= 4 ? 0 : level <= 9 ? 0.25 : 0.4;
  return { n, count, maxLen, rocks, minPartials, maxRandom, minDead, maxGreedy };
}

// Usage:  node tools/gen-snake-puzzles.mjs [from] [to]   → tools/snake-parts/L<n>.json (one file per level, saved as it goes)
//         node tools/gen-snake-puzzles.mjs merge          → games/snake-escape-puzzle/puzzles.js
const PARTS = new URL('./snake-parts/', import.meta.url);
if (process.argv[2] === 'merge') {
  const out = {};
  for (const f of readdirSync(PARTS).filter((f) => /^L\d+\.json$/.test(f))) out[+f.slice(1, -5)] = JSON.parse(readFileSync(new URL(f, PARTS)));
  writeFileSync(new URL('../games/snake-escape-puzzle/puzzles.js', import.meta.url),
    `// Generated by tools/gen-snake-puzzles.mjs — every puzzle solved exhaustively.\n// opt = the fewest moves that clear the board.\nexport const PUZZLES = ${JSON.stringify(out)};\n`);
  console.log('merged', Object.keys(out).length, 'levels');
  process.exit(0);
}
const from = +(process.argv[2] || 1), to = +(process.argv[3] || 40);
for (let level = from; level <= to; level++) {
  if (level % 5 === 0) continue;                          // bonus rounds
  if (existsSync(new URL(`L${level}.json`, PARTS))) continue;
  const rnd = mulberry32(20260930 + level * 7919 + +(process.env.SALT || 0));        // each level has its own seed, so ranges can run side by side
  const P = plan(level);
  let best = null, bestScore = -1, tries = 0;
  const t0 = Date.now();
  while (tries < 40000 && Date.now() - t0 < (level < 6 ? 15000 : +(process.env.BUDGET || 55000))) {
    tries++;
    const pz = randomPuzzle(rnd, P.n, P.count, P.maxLen, P.rocks);
    if (pz.snakes.length < P.count) continue;
    const a = analyse(pz);
    if (!a) continue;
    const ok = a.partials >= P.minPartials && a.random <= P.maxRandom && a.dead >= P.minDead && a.greedy <= P.maxGreedy;
    const score = a.partials * 3 + a.dead * 10 + (1 - a.random) * 10 + (1 - a.greedy) * 25 + (ok ? 100 : 0);
    if (score > bestScore) { best = { ...pz, ...a }; bestScore = score; }
    if (ok && tries > 40) break;
  }
  if (!best) { console.log(`L${level}: nothing found!`); continue; }
  writeFileSync(new URL(`L${level}.json`, PARTS), JSON.stringify({ n: best.n, rocks: best.rocks, snakes: best.snakes, opt: best.opt }));
  console.log(`L${String(level).padStart(2)} ${best.n}x${best.n} snakes ${best.snakes.length} fewest moves ${best.opt} (${best.partials} part-slides) dead-ends ${(best.dead * 100).toFixed(0)}% random-win ${(best.random * 100).toFixed(0)}% outside-first-win ${(best.greedy * 100).toFixed(0)}% states ${best.states} · tries ${tries}`);
}

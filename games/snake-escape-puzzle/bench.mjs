// Benchmark contract for Snake Escape Puzzle (see tools/bench.mjs). The bot plays like a puzzler
// who works the board out in its head: it reads the board it is shown and searches every position
// it can reach (the same slide rule the game uses), so it knows how many moves each position still
// needs. It clicks the snake that keeps it on a shortest line. A weaker player now and then taps a
// snake that looks right but isn't (a misread), thinks longer per move (the clock runs from L12),
// and when that leaves too few moves it only sometimes spots it and presses the free ↺ Restart;
// otherwise it plays on until the game says OUT OF MOVES / STUCK. In the STAMPEDE bonus it clicks
// snakes whose way out is clear. The mistake: waste moves (the taps that most lengthen the
// solution) until the board can't be cleared in the moves left, then play on until it costs a life.
import { makeBoard, occupancy, reach, exitOffset, keyOf } from './rules.js';

const W = 480, BOARD = 440, BX = (W - BOARD) / 2, BY = 112;
const RESTART = { x: W / 2 - 80, y: BY + BOARD + 50, w: 160, h: 38 };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const slackFor = (L) => (L <= 4 ? 2 : L <= 29 ? 1 : 0);

// ── the player's head: every position of this board, and how many moves each still needs ──
const solved = new Map();
function solve(P) {
  const id = JSON.stringify(P);
  if (solved.has(id)) return solved.get(id);
  const B = makeBoard(P), n = B.snakes.length;
  const start = new Array(n).fill(0), goal = B.snakes.map(exitOffset), gk = keyOf(goal);
  const next = new Map(), order = [start];
  next.set(keyOf(start), null);
  for (let q = 0; q < order.length; q++) {
    const st = order[q], occ = occupancy(B, st), out = [];
    for (let i = 0; i < n; i++) {
      if (st[i] >= goal[i]) continue;
      const k = reach(B, st, i, occ);
      if (!k) continue;
      const ns = st.slice(); ns[i] += k;
      const nk = keyOf(ns);
      out.push([i, nk]);
      if (!next.has(nk)) { next.set(nk, null); order.push(ns); }
    }
    next.set(keyOf(st), out);
  }
  // moves still needed from each position (backwards from the cleared board)
  const back = new Map();
  for (const [k, out] of next) for (const [, nk] of out) (back.get(nk) ?? back.set(nk, []).get(nk)).push(k);
  const dist = new Map([[gk, 0]]), q = [gk];
  for (let i = 0; i < q.length; i++) for (const pk of back.get(q[i]) || []) if (!dist.has(pk)) { dist.set(pk, dist.get(q[i]) + 1); q.push(pk); }
  const S = { next, dist };
  solved.set(id, S);
  return S;
}
const need = (S, k) => S.dist.get(k) ?? Infinity;

/** Click on snake i (any cell of it that is on the board). */
function clickSnake(g, s, i) {
  const occ = g.occ, n = g.n;
  for (let c = 0; c < occ.length; c++) if (occ[c] === i) {
    const x = BX + ((c % n) + 0.5) * g.cell, y = BY + (Math.floor(c / n) + 0.5) * g.cell;
    s.pointerMove(x, y); s.pointerDown(x, y); s.pointerUp(x, y);
    return true;
  }
  return false;
}
function clickRestart(s) {
  const x = RESTART.x + RESTART.w / 2, y = RESTART.y + RESTART.h / 2;
  s.pointerMove(x, y); s.pointerDown(x, y); s.pointerUp(x, y);
}
/** Ready for the next tap: nothing sliding, no fail on its way. */
const ready = (g) => !g.busy() && g.pendingFail <= 0 && g.pendingHurt <= 0;
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());

/** The most moves a player could still spend from position k before the board is cleared or
 *  jammed: wandering there and then the shortest finish (the board only ever moves forward, so
 *  the positions form a one-way graph). */
function worst(S, k) {
  S.worst ??= new Map();
  if (S.worst.has(k)) return S.worst.get(k);
  let w = need(S, k);
  for (const [, nk] of S.next.get(k) || []) w = Math.max(w, 1 + worst(S, nk));
  S.worst.set(k, w);
  return w;
}
/** The tap that wastes the most moves (the mistake): towards a jam, or the longest way round. */
function worstMove(S, k, rand) {
  const out = S.next.get(k) || [];
  if (!out.length) return null;
  let best = -1, pick = null;
  for (const [i, nk] of out) { const d = worst(S, nk) + rand() * 0.1; if (d > best) { best = d; pick = i; } }
  return pick;
}

function stampede(g, s, b) {
  const m = b.mem;
  if (b.t < (m.wait ?? 0)) return;
  const free = g.snakes.filter((sn) => sn.alive && !sn.leaving && !sn.bump && g.blockedAt(sn) < 0);
  if (!free.length) return;
  let sn = free[Math.floor(b.rand() * free.length)];
  // a hasty player sometimes clicks one that is blocked
  if (b.rand() < (1 - b.skill) * 0.3) { const all = g.snakes.filter((q) => q.alive && !q.leaving); sn = all[Math.floor(b.rand() * all.length)]; }
  const [hx, hy] = sn.body[0];
  const x = BX + (hx + 0.5) * g.cell, y = BY + (hy + 0.5) * g.cell;
  s.pointerMove(x, y); s.pointerDown(x, y); s.pointerUp(x, y);
  m.wait = b.t + 0.18 + (1 - b.skill) * 0.5 * b.rand();
}

function bot(g, s, b) {
  const m = b.mem;
  if (g.bonus) return stampede(g, s, b);
  if (m.lives !== s.livesLost) { m.lives = s.livesLost; m.wait = null; m.blunder = false; }   // board reset after a lost life
  if (!ready(g)) { m.wait = null; return; }
  const S = solve(g.P), k = keyOf(g.st);
  // a good look at a new board first, then a moment before each tap (longer for a weaker player)
  if (m.wait == null) m.wait = g.moves === 0 && !m.looked ? 2.2 + (1 - b.skill) * 2 : b.t + 0.25 + (1 - b.skill) * Math.abs(gauss(b.rand)) * 1.6;
  m.looked = true;
  if (b.t < m.wait) return;
  m.wait = null;
  const left = g.limit - g.moves, d = need(S, k);
  if (m.blunder || d > left) {
    // too few moves left: a sharp player spots it and restarts (free); otherwise it plays on and pays for it
    if (!m.blunder && g.moves > 0) {
      m.blunder = b.rand() >= b.skill * b.skill;
      if (!m.blunder) { clickRestart(s); return; }
    }
    const i = worstMove(S, k, b.rand);
    if (i != null) clickSnake(g, s, i);
    return;
  }
  const out = S.next.get(k) || [];
  const good = out.filter(([, nk]) => need(S, nk) === d - 1);
  let pick = good.length ? good[Math.floor(b.rand() * good.length)][0] : out[0]?.[0];
  if (out.length > 1 && b.rand() < (1 - b.skill) * 0.4) pick = out[Math.floor(b.rand() * out.length)][0];   // a misread
  if (pick != null) clickSnake(g, s, pick);
}

/** Progress: how far the snakes have slithered in total, and how many boards were finished. */
const slithered = (g) => (g.bonus ? g.bonusCount : g.st.reduce((a, v) => a + v, 0));

export default {
  // levels 1–20 (5, 10, 15, 20 are the STAMPEDE bonus). The puzzles need 3–14 moves; each slide
  // animates in under a second, so the expert clears a board in ~5–15 s, ~30 s with the mistake
  // (wasted moves until out of moves, the life lost, then the board again)
  limit: (level) => 40 + level * 2,
  stuck: 8,                     // a tap every ~1 s; nothing slithering for 8 s = stuck
  progress: slithered,

  invariants(g) {
    if (g.bonus) {
      if (!(g.bonusCount >= 0) || g.bonusCount > 200) return `stampede count ${g.bonusCount}`;
      for (let y = 0; y < g.n; y++) for (let x = 0; x < g.n; x++) {
        const o = g.grid[y][x];
        if (o === -1) continue;
        const sn = g.snakes[o];
        if (!sn || !sn.alive || sn.leaving || !sn.body.some(([bx, by]) => bx === x && by === y)) return `stampede grid cell (${x}, ${y}) names snake ${o}, which isn't there`;
      }
      return null;
    }
    const B = g.B, n = g.n;
    if (!Number.isInteger(g.moves) || g.moves < 0 || g.moves > g.limit) return `moves ${g.moves} of ${g.limit}`;
    if (g.limit !== g.par + slackFor(g.level)) return `move limit ${g.limit} for par ${g.par} on level ${g.level}`;
    if (g.timeMax && !(g.timeLeft <= g.timeMax + 1e-9)) return `clock ${g.timeLeft} over ${g.timeMax}`;
    const seen = new Map();
    for (let i = 0; i < B.snakes.length; i++) {
      const sn = B.snakes[i], o = g.st[i], ex = exitOffset(sn), v = g.snakes[i].vis;
      if (!Number.isInteger(o) || o < 0 || o > ex) return `snake ${i} is at ${o} on a track of ${ex}`;
      if (!Number.isFinite(v) || v < -1e-9 || v > o + 1e-9) return `snake ${i} is drawn at ${v} but is at ${o}`;
      if (!g.snakes[i].alive && o < ex) return `snake ${i} vanished while still on the board`;
      for (let k = o; k < o + sn.len; k++) {
        const c = sn.path[k];
        if (!c) continue;
        if (c[0] < 0 || c[1] < 0 || c[0] >= n || c[1] >= n) return `snake ${i} is off the board at (${c})`;
        const id = c[1] * n + c[0];
        if (B.rocks.has(id)) return `snake ${i} is on a rock at (${c})`;
        if (seen.has(id)) return `snakes ${seen.get(id)} and ${i} overlap at (${c})`;
        seen.set(id, i);
      }
    }
    const out = g.snakes.filter((sn) => !sn.alive).length;
    if (out > g.total) return `${out} snakes out of ${g.total}`;
    return null;
  },

  bot,

  mistake(g, s, b) {
    if (g.bonus) return true;
    if (!ready(g)) return false;
    const m = b.mem, S = solve(g.P), k = keyOf(g.st);
    m.lives = s.livesLost;
    if (need(S, k) > g.limit - g.moves) { m.blunder = true; m.wait = null; return true; }   // it can't be cleared now
    const i = worstMove(S, k, b.rand);
    if (i == null || !clickSnake(g, s, i)) return false;
    // that tap may be the one that jams the board or uses the last spare move
    if (need(S, keyOf(g.st)) > g.limit - g.moves) { m.blunder = true; m.wait = null; return true; }
    return false;
  },
};

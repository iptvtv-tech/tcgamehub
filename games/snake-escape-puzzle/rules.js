// ─────────────────────────────────────────────────────────────
//  SNAKE ESCAPE — puzzle rules (no drawing), shared by the game and
//  tools/gen-snake-puzzles.mjs.
//
//  Each snake travels along one fixed track: its own body (tail → head), then
//  straight on from its head to the edge of the board and beyond. Its position is
//  just how far along that track it has slithered (the "offset").
//  Tap a snake → it slithers forward until the cell in front of its head is taken.
//  If the way is clear all the way to the edge it leaves the board.
// ─────────────────────────────────────────────────────────────
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function makeBoard(p) {
  const n = p.n;
  const snakes = p.snakes.map((s) => {
    const [dx, dy] = DIRS[s.d];
    const path = s.body.slice().reverse().map(([x, y]) => [x, y]);
    let [x, y] = s.body[0];
    for (;;) { x += dx; y += dy; if (x < 0 || y < 0 || x >= n || y >= n) break; path.push([x, y]); }
    const onBoard = path.length;
    for (let k = 0; k < s.body.length; k++) path.push(null);   // off the board
    return { body: s.body, d: s.d, len: s.body.length, path, onBoard };
  });
  return { n, rocks: new Set((p.rocks || []).map(([x, y]) => y * n + x)), snakes };
}

export const exitOffset = (sn) => sn.path.length - sn.len;
export const keyOf = (st) => st.join(',');

/** Which snake (index) or rock (-2) is on each cell for positions `st`. */
export function occupancy(B, st) {
  const occ = new Array(B.n * B.n).fill(-1);
  for (const r of B.rocks) occ[r] = -2;
  B.snakes.forEach((sn, i) => {
    for (let k = st[i]; k < st[i] + sn.len; k++) { const c = sn.path[k]; if (c) occ[c[1] * B.n + c[0]] = i; }
  });
  return occ;
}

/** How far snake i can slither from positions st (0 = it's stuck). */
export function reach(B, st, i, occ = occupancy(B, st)) {
  const sn = B.snakes[i], ex = exitOffset(sn);
  let k = 0;
  while (st[i] + k < ex) {
    const c = sn.path[st[i] + sn.len + k];
    if (!c) return ex - st[i];                         // head has left the board: it's gone
    if (occ[c[1] * B.n + c[0]] !== -1) break;
    k++;
  }
  return k;
}

/** New positions after tapping snake i, or null if it can't move. */
export function slide(B, st, i) {
  if (st[i] >= exitOffset(B.snakes[i])) return null;
  const k = reach(B, st, i);
  if (!k) return null;
  const ns = st.slice(); ns[i] += k;
  return ns;
}

export const cleared = (B, st) => B.snakes.every((sn, i) => st[i] >= exitOffset(sn));

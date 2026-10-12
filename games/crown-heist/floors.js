// ─────────────────────────────────────────────────────────────
//  CROWN HEIST — the floors of the Deep Vaults.
//
//  Every floor is built from a fixed seed, so it is exactly the same every time
//  you play (fair for progress carried across sessions and devices). Each floor
//  is only accepted once an automatic check proves it can be escaped:
//    • the crown can be reached from the entrance
//    • with the portcullis slammed shut there is still a side route to the stairs,
//      and the lever really does open a shortcut
//    • every cracked floor can give way and the vault still holds together
//    • guards never patrol right next to the entrance
//    • there are hiding alcoves along the way in and the way out
//    • the seal countdown leaves time to spare at crown-carrying speed
//    • floors 11-15: the Crown Wraith can be outrun on the best escape route
//    • floor 15: the collapse can be outrun
//  If a seed fails any check, the next seed in a fixed list is tried — still the
//  same result every time. Run `node games/crown-heist/check.mjs` to see the report.
//
//  No DOM here: the check runs in node too.
// ─────────────────────────────────────────────────────────────
export const FINAL = 15, SECRET = 16, BONUS = [5, 10];
export const SPEED = { walk: 2.75, carry: 2.0, strafe: 2.1 };
/** cell types */
export const C = { WALL: 0, OPEN: 1, ALCOVE: 2, GATE: 3, LEVER: 4, CRACK: 5, BRAZ: 6, PIT: 7, RUBBLE: 8, THRONE: 9 };

export const NAMES = {
  1: ['The Sand Cellars', 'Sneak in, take the crown, run for the stairs.'],
  2: ['The Grain Store', 'A portcullis slams shut when the crown is lifted. Find the lever, or another way round.'],
  3: ['The Dusty Stacks', 'Cracked floors give way behind you once the crown is taken.'],
  4: ['The Old Cistern', 'Throw a coin (C) to lure a guard away.'],
  5: ['Treasure Vault', ''],
  6: ['The Gilded Gallery', 'Gold-armoured knights run. Smoke (X) breaks their line of sight.'],
  7: ['The Marble Stair', 'Hide in the dark alcoves while the torches pass.'],
  8: ['The Brazier Walk', 'The crown\'s light makes you easier to spot.'],
  9: ['The Bullion Hall', 'More knights, longer halls.'],
  10: ['The Gold Reserve', ''],
  11: ['The Antechamber', 'Something wakes when the crown is lifted. It follows the crown\'s light — through walls.'],
  12: ['The Hall of Banners', 'The Crown Wraith cannot be hidden from. Keep moving.'],
  13: ['The Regent\'s Court', 'Knights and the Wraith together.'],
  14: ['The Throne of Ash', 'One floor from the crown of the Crypt Kings.'],
  15: ['The Deepest Vault', 'The crown of the Crypt Kings. Lift it and the vault comes down.'],
  16: ['The Empty Throne', 'No guard has ever seen this room.'],
};
export const theme = (n) => (n >= 11 ? 'throne' : n >= 6 ? 'marble' : 'sand');

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// ── Grid helpers ─────────────────────────────────────────────
export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Uint8Array(w * h); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x, y) { return this.in(x, y) ? this.c[y * this.w + x] : C.WALL; }
  set(x, y, v) { if (this.in(x, y)) this.c[y * this.w + x] = v; }
  clone() { const g = new Grid(this.w, this.h); g.c.set(this.c); return g; }
}
/** walkable before the crown is lifted (gate open) */
export const walkOpen = (v) => v === C.OPEN || v === C.ALCOVE || v === C.GATE || v === C.CRACK || v === C.THRONE;
/** walkable once the gate has slammed shut */
export const walkClosed = (v) => v === C.OPEN || v === C.ALCOVE || v === C.CRACK || v === C.THRONE;

/** BFS distances from one or more cells. pass(x, y) → walkable. Returns Int32Array (-1 = unreachable). */
export function bfs(g, from, pass) {
  const d = new Int32Array(g.w * g.h).fill(-1), q = new Int32Array(g.w * g.h);
  let head = 0, tail = 0;
  for (const [x, y] of from) { const i = y * g.w + x; if (d[i] < 0) { d[i] = 0; q[tail++] = i; } }
  while (head < tail) {
    const i = q[head++], x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!g.in(nx, ny)) continue;
      const j = ny * g.w + nx;
      if (d[j] >= 0 || !pass(nx, ny)) continue;
      d[j] = d[i] + 1; q[tail++] = j;
    }
  }
  return d;
}
/** shortest path a → b as a list of [x, y] (inclusive), or null */
export function path(g, a, b, pass) {
  const d = bfs(g, [b], pass);
  if (d[a[1] * g.w + a[0]] < 0) return null;
  const out = [[a[0], a[1]]];
  let [x, y] = a;
  while (x !== b[0] || y !== b[1]) {
    const cur = d[y * g.w + x];
    let moved = false;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (g.in(nx, ny) && d[ny * g.w + nx] === cur - 1) { x = nx; y = ny; out.push([x, y]); moved = true; break; }
    }
    if (!moved) return null;
  }
  return out;
}
const dist = (d, g, [x, y]) => d[y * g.w + x];

// ── The floors ───────────────────────────────────────────────
const cache = new Map();
/** The floor for level n (1-16). Always identical for the same n. */
export function buildFloor(n) {
  if (cache.has(n)) return cache.get(n);
  let f;
  if (BONUS.includes(n)) f = treasureVault(n);
  else if (n === SECRET) f = emptyThrone();
  else {
    for (let attempt = 0; attempt < 600 && !f; attempt++) {
      const cand = tryFloor(n, attempt);
      if (cand && check(cand).ok) { f = cand; f.attempt = attempt; }
    }
    if (!f) throw new Error(`Crown Heist: no escapable layout for floor ${n}`);
  }
  f.name = NAMES[n][0]; f.tip = NAMES[n][1];
  cache.set(n, f);
  return f;
}

function tryFloor(n, attempt) {
  const r = rng(n * 104729 + attempt * 7919 + 17);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const size = n <= 4 ? 25 : n <= 9 ? 29 : 31;
  const g = new Grid(size, size);
  // 1. rooms on odd coordinates, odd sizes (so corridors on odd lines never run side by side)
  const want = Math.min(11, 6 + Math.floor(n / 2.5)), rooms = [];
  for (let k = 0; k < 400 && rooms.length < want; k++) {
    const w = pick([3, 5, 5, 7]), h = pick([3, 5, 5, 7]);
    const x = 1 + 2 * Math.floor(r() * ((size - 1 - w) / 2)), y = 1 + 2 * Math.floor(r() * ((size - 1 - h) / 2));
    if (x + w > size - 1 || y + h > size - 1) continue;
    if (rooms.some((o) => x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y)) continue;
    rooms.push({ x, y, w, h });
  }
  if (rooms.length < 5) return null;
  for (const o of rooms) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) g.set(x, y, C.OPEN);
  const inRoom = (x, y) => rooms.findIndex((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  const port = (o) => [o.x + 2 * Math.floor(r() * ((o.w + 1) / 2)), o.y + 2 * Math.floor(r() * ((o.h + 1) / 2))];
  const centre = (o) => [o.x + (o.w - 1) / 2, o.y + (o.h - 1) / 2];
  const carve = (a, b) => {
    let [x, y] = a;
    const hFirst = r() < 0.5;
    const step = (tx, ty) => { while (x !== tx) { x += Math.sign(tx - x); if (g.at(x, y) === C.WALL) g.set(x, y, C.OPEN); } while (y !== ty) { y += Math.sign(ty - y); if (g.at(x, y) === C.WALL) g.set(x, y, C.OPEN); } };
    if (hFirst) { step(b[0], y); step(x, b[1]); } else { step(x, b[1]); step(b[0], y); }
  };
  // 2. join them: a spanning tree, then extra links so there are loops (side routes)
  const D = (a, b) => Math.hypot(centre(a)[0] - centre(b)[0], centre(a)[1] - centre(b)[1]);
  const inTree = [0], edges = new Set();
  while (inTree.length < rooms.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) if (!inTree.includes(j)) { const d = D(rooms[i], rooms[j]); if (!best || d < best.d) best = { i, j, d }; }
    inTree.push(best.j); edges.add(best.i + ',' + best.j); carve(port(rooms[best.i]), port(rooms[best.j]));
  }
  const extra = 2 + Math.floor(n / 4);
  for (let k = 0, added = 0; k < 60 && added < extra; k++) {
    const i = Math.floor(r() * rooms.length);
    const near = rooms.map((o, j) => ({ j, d: D(rooms[i], o) })).filter((e) => e.j !== i && !edges.has(i + ',' + e.j) && !edges.has(e.j + ',' + i)).sort((a, b) => a.d - b.d);
    if (!near.length) continue;
    const j = near[Math.min(near.length - 1, Math.floor(r() * 2))].j;
    edges.add(i + ',' + j); carve(port(rooms[i]), port(rooms[j])); added++;
  }

  // 3. entrance, crown room (deepest), exit (far from both)
  const order = rooms.map((o, i) => ({ i, k: (centre(o)[0] + centre(o)[1]) * (attempt % 2 ? 1 : -1) + (attempt % 4 > 1 ? centre(o)[0] * 0.5 : 0) })).sort((a, b) => a.k - b.k);
  const startRoom = order[0].i, sr = rooms[startRoom];
  const start = [sr.x + Math.floor(sr.w / 2), sr.y + Math.floor(sr.h / 2)];
  const pass0 = (x, y) => walkOpen(g.at(x, y));
  const dS = bfs(g, [start], pass0);
  let crownRoom = -1, far = -1;
  rooms.forEach((o, i) => { const d = dist(dS, g, centre(o).map(Math.floor)); if (i !== startRoom && d > far && o.w >= 3 && o.h >= 3) { far = d; crownRoom = i; } });
  if (crownRoom < 0) return null;
  const cr = rooms[crownRoom], crown = centre(cr).map(Math.floor);
  const dC = bfs(g, [crown], pass0);
  let exitRoom = -1, score = -1;
  rooms.forEach((o, i) => {
    if (i === startRoom || i === crownRoom) return;
    const c = centre(o).map(Math.floor), s = dist(dC, g, c) + 0.6 * dist(dS, g, c);
    if (s > score) { score = s; exitRoom = i; }
  });
  if (exitRoom < 0) return null;
  const er = rooms[exitRoom], exit = centre(er).map(Math.floor);

  const f = { n, w: size, h: size, g, rooms, start, crown, exit, startRoom, crownRoom, exitRoom, theme: theme(n),
    gate: null, lever: null, alcoves: [], cracks: [], braziers: [], guards: [], coins: [], chests: [], wraith: n >= 11, collapse: n === 15 };

  // 4. the portcullis: on the short way out, with a longer way round still open
  const P1 = path(g, crown, exit, pass0);
  if (!P1) return null;
  const L1 = P1.length - 1;
  if (L1 < 10) return null;
  if (n >= 2 && n !== 15) {
    const cands = [];
    for (let i = 3; i < P1.length - 3; i++) {
      const [x, y] = P1[i];
      if (inRoom(x, y) >= 0) continue;
      const h2 = walkOpen(g.at(x - 1, y)) && walkOpen(g.at(x + 1, y)) && !walkOpen(g.at(x, y - 1)) && !walkOpen(g.at(x, y + 1));
      const v2 = walkOpen(g.at(x, y - 1)) && walkOpen(g.at(x, y + 1)) && !walkOpen(g.at(x - 1, y)) && !walkOpen(g.at(x + 1, y));
      if (!h2 && !v2) continue;
      const d = bfs(g, [crown], (a, b) => (a !== x || b !== y) && pass0(a, b));
      const L2 = dist(d, g, exit);
      if (L2 >= L1 + 6 && L2 <= L1 * 2.3 + 14) cands.push({ x, y, L2, i });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => Math.abs(a.i - P1.length * 0.45) - Math.abs(b.i - P1.length * 0.45));
    const gt = cands[0];
    g.set(gt.x, gt.y, C.GATE);
    f.gate = { x: gt.x, y: gt.y, horiz: walkOpen(g.at(gt.x - 1, gt.y)) };
  }
  const passC = (x, y) => walkClosed(g.at(x, y));
  // 5. the lever: off the main path, opens the shortcut
  if (f.gate) {
    const dCC = bfs(g, [crown], passC), dEO = bfs(g, [exit], pass0), dP = bfs(g, P1, pass0);
    const L2 = dist(dCC, g, exit);
    let best = null;
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      if (g.at(x, y) !== C.WALL) continue;
      for (const [dx, dy] of DIRS) {
        const ox = x + dx, oy = y + dy;
        if (g.at(ox, oy) !== C.OPEN) continue;
        const d1 = dist(dCC, g, [ox, oy]), d2 = dist(dEO, g, [ox, oy]), off = dist(dP, g, [ox, oy]);
        if (d1 < 4 || d2 < 0 || off < 3 || (ox === crown[0] && oy === crown[1])) continue;
        const gain = L2 - (d1 + d2);
        const v = gain - Math.abs(off - 4) * 0.5;
        if (!best || v > best.v) best = { x, y, fx: dx, fy: dy, d1, d2, gain, v };
      }
    }
    if (!best || best.gain < 2) return null;
    g.set(best.x, best.y, C.LEVER);
    f.lever = best;
  }

  // 6. hiding alcoves: one-square niches off the corridors, near the way in and the way out
  const P0 = path(g, start, crown, pass0), P2 = path(g, crown, exit, passC);
  if (!P0 || !P2) return null;
  const dP0 = bfs(g, P0, pass0), dP2 = bfs(g, P2, passC);
  const alcoveCands = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    if (g.at(x, y) !== C.WALL) continue;
    const open = DIRS.filter(([dx, dy]) => g.at(x + dx, y + dy) !== C.WALL && g.at(x + dx, y + dy) !== C.LEVER);
    if (open.length !== 1) continue;
    const [dx, dy] = open[0], ox = x + dx, oy = y + dy;
    if (g.at(ox, oy) !== C.OPEN || inRoom(ox, oy) >= 0 && r() < 0.7) continue;
    if (g.at(x - dx, y - dy) === C.LEVER) continue;
    // the niche's own sides must be solid (so it really is a niche)
    if (DIRS.some(([ex, ey]) => (ex !== dx || ey !== dy) && g.at(x + ex, y + ey) === C.LEVER)) continue;
    const near0 = dist(dP0, g, [ox, oy]), near2 = dist(dP2, g, [ox, oy]);
    if (near0 < 0 && near2 < 0) continue;
    alcoveCands.push({ x, y, ox, oy, k: Math.min(near0 < 0 ? 99 : near0, near2 < 0 ? 99 : near2) + r() * 2.5, near0, near2 });
  }
  alcoveCands.sort((a, b) => a.k - b.k);
  const wantAlc = 5 + Math.floor(n / 3);
  for (const a of alcoveCands) {
    if (f.alcoves.length >= wantAlc) break;
    if (f.alcoves.some((b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 4)) continue;
    if (Math.hypot(a.x - start[0], a.y - start[1]) < 3) continue;
    g.set(a.x, a.y, C.ALCOVE); f.alcoves.push(a);
  }

  // 7. braziers in the corners of big rooms (gallery and throne floors) — only where they can't block a way through
  if (f.theme !== 'sand') {
    rooms.forEach((o, i) => {
      if (o.w < 5 || o.h < 5 || i === startRoom) return;
      for (const [x, y] of [[o.x, o.y], [o.x + o.w - 1, o.y], [o.x, o.y + o.h - 1], [o.x + o.w - 1, o.y + o.h - 1]]) {
        const outside = DIRS.some(([dx, dy]) => inRoom(x + dx, y + dy) !== i && g.at(x + dx, y + dy) !== C.WALL);
        if (outside || (x === crown[0] && y === crown[1]) || (x === exit[0] && y === exit[1])) continue;
        g.set(x, y, C.BRAZ); f.braziers.push([x, y]);
      }
    });
  }

  // 8. cracked floors (floor 3+): on corridors, never where losing them would cut the vault in two
  if (n >= 3 && n !== 15) {
    const want = Math.min(7, 2 + Math.floor(n / 2));
    const opens = () => { const cells = []; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (passC(x, y)) cells.push([x, y]); return cells; };
    const connectedWithout = (skip) => {
      const cells = opens().filter(([x, y]) => !skip.has(x + ',' + y));
      const d = bfs(g, [cells[0]], (x, y) => passC(x, y) && !skip.has(x + ',' + y));
      return cells.every(([x, y]) => d[y * g.w + x] >= 0);
    };
    const skip = new Set();
    const along = [...P2.slice(2, -2), ...P0.slice(3, -2)];
    for (const [x, y] of along) {
      if (f.cracks.length >= want) break;
      if (g.at(x, y) !== C.OPEN || inRoom(x, y) >= 0) continue;
      if (f.gate && Math.abs(x - f.gate.x) + Math.abs(y - f.gate.y) < 2) continue;
      if (f.cracks.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3)) continue;
      if (f.alcoves.some((a) => a.ox === x && a.oy === y)) continue;
      if (f.lever && f.lever.x + f.lever.fx === x && f.lever.y + f.lever.fy === y) continue;
      skip.add(x + ',' + y);
      if (connectedWithout(skip)) { f.cracks.push([x, y]); } else skip.delete(x + ',' + y);
    }
    for (const [x, y] of f.cracks) g.set(x, y, C.CRACK);
  }

  // 9. guards: patrol loops between rooms, never close to the entrance
  const kind = n <= 5 ? 'skeleton' : 'knight';
  const count = { 1: 2, 2: 3, 3: 3, 4: 4, 6: 4, 7: 4, 8: 5, 9: 5, 11: 4, 12: 5, 13: 5, 14: 6, 15: 6 }[n] || 3;
  const dStart = bfs(g, [start], pass0);
  const pool = rooms.map((o, i) => i).filter((i) => i !== startRoom);
  for (let k = 0; k < count; k++) {
    let ok = null;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      const m = 2 + (r() < 0.4 ? 1 : 0), stops = [];
      while (stops.length < m) { const i = pool[Math.floor(r() * pool.length)]; if (!stops.includes(i)) stops.push(i); }
      const pts = stops.map((i) => { const o = rooms[i]; return [o.x + Math.floor(r() * o.w), o.y + Math.floor(r() * o.h)]; }).filter(([x, y]) => g.at(x, y) === C.OPEN);
      if (pts.length < 2) continue;
      const route = [];
      let good = true;
      for (let i = 0; i < pts.length && good; i++) {
        const seg = path(g, pts[i], pts[(i + 1) % pts.length], pass0);
        if (!seg) { good = false; break; }
        route.push(...seg.slice(0, -1));
      }
      if (!good || route.length < 6) continue;
      if (route.some(([x, y]) => dist(dStart, g, [x, y]) < 6)) continue;
      ok = route;
    }
    if (ok) f.guards.push({ kind, route: ok, phase: Math.floor(r() * ok.length) });
  }
  // a sentry by the crown, turning slowly (floor 2+)
  if (n >= 2) {
    const spots = [];
    for (let y = cr.y; y < cr.y + cr.h; y++) for (let x = cr.x; x < cr.x + cr.w; x++) {
      if (g.at(x, y) !== C.OPEN || (x === crown[0] && y === crown[1])) continue;
      const dd = Math.abs(x - crown[0]) + Math.abs(y - crown[1]);
      if (dd >= 2) spots.push([x, y, dd]);
    }
    if (spots.length) {
      spots.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
      const [x, y] = spots[Math.floor(r() * Math.min(4, spots.length))];
      if (dist(dStart, g, [x, y]) >= 6) f.guards.push({ kind, route: [[x, y]], sentry: true, phase: Math.floor(r() * 4) });
    }
  }
  if (f.guards.length < Math.min(2, count)) return null;

  // 10. loose gold and chests
  const free = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    if (g.at(x, y) !== C.OPEN) continue;
    if ((x === start[0] && y === start[1]) || (x === crown[0] && y === crown[1]) || (x === exit[0] && y === exit[1])) continue;
    if (f.alcoves.some((a) => a.ox === x && a.oy === y)) continue;
    const exits = DIRS.filter(([dx, dy]) => walkOpen(g.at(x + dx, y + dy))).length;
    free.push({ x, y, dead: exits === 1 });
  }
  const dead = free.filter((c) => c.dead);
  for (let k = 0; k < Math.min(2, dead.length); k++) { const c = dead[Math.floor(r() * dead.length)]; if (!f.chests.some(([a, b]) => a === c.x && b === c.y)) f.chests.push([c.x, c.y]); }
  const coinN = 12 + n;
  for (let k = 0; k < coinN * 3 && f.coins.length < coinN; k++) {
    const c = free[Math.floor(r() * free.length)];
    if (f.coins.some(([a, b]) => Math.abs(a - c.x) + Math.abs(b - c.y) < 2) || f.chests.some(([a, b]) => a === c.x && b === c.y)) continue;
    f.coins.push([c.x, c.y]);
  }

  // 11. timings: the seal countdown, the wraith's pace, the collapse's pace
  plan(f);
  return f;
}

/** Work out the best escape and the timings that keep it fair. */
function plan(f) {
  const g = f.g, passC = (x, y) => walkClosed(g.at(x, y)), passO = (x, y) => walkOpen(g.at(x, y));
  const side = path(g, f.crown, f.exit, passC);
  let route = side, viaLever = null;
  if (f.lever) {
    const o = [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy];
    const a = path(g, f.crown, o, passC), b = path(g, o, f.exit, passO);
    if (a && b) viaLever = [...a, ...b.slice(1)];
  }
  // lever pull ≈ 1 second ≈ 2 squares
  const sideLen = side ? side.length - 1 : Infinity, leverLen = viaLever ? viaLever.length - 1 + 2 : Infinity;
  if (leverLen < sideLen) route = viaLever;
  f.escape = { route, len: Math.min(sideLen, leverLen), side: sideLen, lever: leverLen };
  const runT = f.escape.len / SPEED.carry;
  f.seal = Math.ceil(runT * (f.n <= 2 ? 2.2 : f.n <= 9 ? 1.9 : 1.75) + 10);
  // the Wraith: wakes 3 s after the crown is lifted, drifts straight at you through walls.
  if (f.wraith) {
    const base = 0.95 + (f.n - 11) * 0.09;
    let lo = 0.4, hi = base;
    if (!wraithSafe(f, route, hi)) { for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (wraithSafe(f, route, m)) lo = m; else hi = m; } f.wraithSpeed = +(lo * 0.9).toFixed(3); }
    else f.wraithSpeed = base;
  }
  // floor 15: the vault falls in, spreading out from the crown
  if (f.collapse) {
    const dC = bfs(g, [f.crown], passO);
    let v = 1.9;
    route.forEach(([x, y], i) => {
      const t = i / SPEED.carry + 1.4;                         // you must be past each square 1.4 s before it falls
      const d = dC[y * g.w + x];
      if (t > 3) v = Math.min(v, d / (t - 3));
    });
    f.collapseDelay = 3; f.collapseSpeed = +Math.max(0.6, v * 0.95).toFixed(3);
    f.collapseDist = dC;
  }
}
const WRAITH_WAKE = 3;
function wraithSafe(f, route, speed) {
  let wx = f.crown[0] + 0.5, wy = f.crown[1] + 0.5;
  const dt = 0.05, total = (route.length - 1) / SPEED.carry;
  for (let t = 0; t <= total; t += dt) {
    const i = Math.min(route.length - 1, t * SPEED.carry), a = route[Math.floor(i)], b = route[Math.min(route.length - 1, Math.floor(i) + 1)], k = i - Math.floor(i);
    const px = a[0] + (b[0] - a[0]) * k + 0.5, py = a[1] + (b[1] - a[1]) * k + 0.5;
    if (t > WRAITH_WAKE) { const dx = px - wx, dy = py - wy, d = Math.hypot(dx, dy); if (d > 0.01) { wx += dx / d * speed * dt; wy += dy / d * speed * dt; } }
    if (t > WRAITH_WAKE && Math.hypot(px - wx, py - wy) < 1.6) return false;
  }
  return true;
}
export { WRAITH_WAKE };

// ── The check ────────────────────────────────────────────────
/** Prove a floor can be escaped. { ok, problems: [], stats } */
export function check(f) {
  const out = [], g = f.g;
  if (BONUS.includes(f.n) || f.n === SECRET) return { ok: true, problems: out, stats: {} };
  const passO = (x, y) => walkOpen(g.at(x, y)), passC = (x, y) => walkClosed(g.at(x, y));
  const dS = bfs(g, [f.start], passO);
  if (dist(dS, g, f.crown) < 0) out.push('crown unreachable');
  if (dist(dS, g, f.exit) < 0) out.push('exit unreachable');
  const dCC = bfs(g, [f.crown], passC);
  if (dist(dCC, g, f.exit) < 0) out.push('no side route with the gate shut');
  if (f.gate) {
    if (!f.lever) out.push('gate without a lever');
    else {
      const o = [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy];
      if (dist(dCC, g, o) < 0) out.push('lever unreachable with the gate shut');
    }
  }
  // all cracks gone + gate shut: everything still joined up
  const cells = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (passC(x, y) && g.at(x, y) !== C.CRACK) cells.push([x, y]);
  const dAll = bfs(g, [f.crown], (x, y) => passC(x, y) && g.at(x, y) !== C.CRACK);
  if (cells.some(([x, y]) => dAll[y * g.w + x] < 0)) out.push('a collapsed floor would cut the vault in two');
  // guards stay away from the entrance
  for (const gd of f.guards) if (gd.route.some(([x, y]) => dist(dS, g, [x, y]) < 6)) out.push('guard patrols by the entrance');
  // hiding places on the way in and out
  const P0 = path(g, f.start, f.crown, passO) || [], P2 = f.escape?.route || [];
  const near = (P) => { const d = bfs(g, P, passO); return f.alcoves.filter((a) => d[a.oy * g.w + a.ox] >= 0 && d[a.oy * g.w + a.ox] <= 3).length; };
  if (near(P0) < 2) out.push('fewer than 2 alcoves on the way in');
  if (near(P2) < 1) out.push('no alcove on the way out');
  // the seal leaves time
  const runT = f.escape.len / SPEED.carry;
  if (!(f.seal > runT + 8)) out.push('seal countdown too short');
  if (f.wraith && !(f.wraithSpeed >= 0.55)) out.push('wraith would be too slow to matter');
  if (f.wraith && !wraithSafe(f, f.escape.route, f.wraithSpeed)) out.push('wraith cannot be outrun');
  if (f.collapse) {
    f.escape.route.forEach(([x, y], i) => { const fall = f.collapseDelay + f.collapseDist[y * g.w + x] / f.collapseSpeed; if (i / SPEED.carry > fall - 1.2) out.push('collapse catches the best route'); });
  }
  return { ok: !out.length, problems: [...new Set(out)], stats: { size: g.w, rooms: f.rooms.length, guards: f.guards.length, alcoves: f.alcoves.length, cracks: f.cracks.length, gate: !!f.gate, inLen: P0.length - 1, outLen: f.escape.len, seal: f.seal, wraith: f.wraithSpeed, collapse: f.collapseSpeed } };
}

// ── The treasure vaults (floors 5 and 10): no guards, gold everywhere, 15 seconds ──
function treasureVault(n) {
  const size = 17, g = new Grid(size, size), r = rng(n * 31337);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) g.set(x, y, C.OPEN);
  const braziers = [];
  for (let y = 3; y < size - 2; y += 4) for (let x = 3; x < size - 2; x += 4) { g.set(x, y, C.BRAZ); braziers.push([x, y]); }
  const coins = [], chests = [[1, 1], [size - 2, 1], [1, size - 2], [size - 2, size - 2]];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    if (g.at(x, y) !== C.OPEN || chests.some(([a, b]) => a === x && b === y)) continue;
    if ((x + y) % 2 === 0 && !(x === 8 && y === size - 2) && r() < 0.85) coins.push([x, y]);
  }
  return { n, w: size, h: size, g, rooms: [], start: [8, size - 2], crown: null, exit: null, theme: n === 5 ? 'sand' : 'marble', treasure: true,
    gate: null, lever: null, alcoves: [], cracks: [], braziers, guards: [], coins, chests, wraith: false, collapse: false, seal: 0, escape: { len: 0 } };
}

// ── The secret floor 16: the empty throne ──
function emptyThrone() {
  const rows = [
    '###########',
    '####.T.####',
    '###H...H###',
    '##.t...t.##',
    '##.......##',
    '##t.....t##',
    '##.......##',
    '##t.....t##',
    '##.......##',
    '##t.....t##',
    '##.......##',
    '##t.....t##',
    '##.......##',
    '##t.....t##',
    '##.......##',
    '###.....###',
    '####.@.####',
    '###########',
  ];
  const w = rows[0].length, h = rows.length, g = new Grid(w, h), braziers = [], coins = [], chests = [];
  let start, throne;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') return;
    g.set(x, y, ch === 't' ? C.BRAZ : ch === 'T' ? C.THRONE : C.OPEN);
    if (ch === 't') braziers.push([x, y]);
    if (ch === 'T') throne = [x, y];
    if (ch === 'H') chests.push([x, y]);
    if (ch === '@') start = [x, y];
    if (ch === '.' && y > 3 && y < 15 && (x === 3 || x === 7)) coins.push([x, y]);
  }));
  return { n: 16, w, h, g, rooms: [], start, crown: null, exit: null, throne, theme: 'throne', secret: true,
    gate: null, lever: null, alcoves: [], cracks: [], braziers, guards: [], coins, chests, wraith: false, collapse: false, seal: 0, escape: { len: 0 } };
}

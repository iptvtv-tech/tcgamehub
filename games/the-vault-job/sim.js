// ─────────────────────────────────────────────────────────────
//  THE VAULT JOB — pure game rules (no drawing), shared by the game and the
//  level checker, so every level can be proven finishable without being seen.
//
//  Time moves in ticks of 0.1s. Guards, dogs, cameras and lasers all follow
//  fixed timetables, so the museum is completely predictable — patient players
//  can always find a safe moment.
// ─────────────────────────────────────────────────────────────
export const TICK = 0.1;          // seconds per tick
export const PLAYER_EVERY = 2;    // the thief can step once every 2 ticks
export const COLS = 15, ROWS = 13;
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

//  Map key:  #  wall        .  floor       S  start        E  exit
//            $  treasure    o  coin        H  hiding spot (plant / statue) — you're invisible on it
//            P  exhibit     =  laser       V  the display case (secret level)
const WALK = new Set(['.', 'S', 'E', '$', 'o', 'H', '=', 'V']);
const OPAQUE = new Set(['#', 'P', 'H', 'V']);

const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up');

function guardTimeline(g) {
  const pts = g.path;
  const seq = g.loop ? [...pts, pts[0]] : pts;
  const tiles = [pts[0]];
  for (let i = 1; i < seq.length; i++) {
    const [ax, ay] = seq[i - 1], [bx, by] = seq[i];
    if (ax !== bx && ay !== by) throw new Error(`Guard path must be straight lines: ${seq[i - 1]} → ${seq[i]}`);
    const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
    let x = ax, y = ay;
    while (x !== bx || y !== by) { x += sx; y += sy; tiles.push([x, y]); }
  }
  let cycle;
  if (g.loop) cycle = tiles.slice(0, -1);
  else cycle = tiles.concat(tiles.slice(1, -1).reverse());
  const n = cycle.length, every = g.every, pause = g.pause ?? 6;
  const tl = [];
  for (let i = 0; i < n; i++) {
    const cur = cycle[i], next = cycle[(i + 1) % n], prev = cycle[(i - 1 + n) % n];
    const dir = n === 1 ? g.face || 'down' : dirOf(cur, next);
    const pdir = n === 1 ? dir : dirOf(prev, cur);
    if (dir !== pdir) for (let k = 0; k < pause; k++) tl.push({ x: cur[0], y: cur[1], dir: k < pause / 2 ? pdir : dir, turning: true, nx: cur[0], ny: cur[1], f: 0 });
    for (let k = 0; k < every; k++) tl.push({ x: cur[0], y: cur[1], dir, turning: false, nx: next[0], ny: next[1], f: k / every });
  }
  // Start part-way through the timetable if the level asks (lets guards start out of sync)
  const shift = (g.phase || 0) % tl.length;
  return tl.slice(shift).concat(tl.slice(0, shift));
}

function cameraTimeline(c) {
  const tl = [];
  for (const d of c.dirs) for (let k = 0; k < c.hold; k++) tl.push({ x: c.x, y: c.y, dir: d, turning: k >= c.hold - 5 && c.dirs.length > 1, nx: c.x, ny: c.y, f: 0 });
  return tl;
}

export function parseLevel(def) {
  if (def.map.length !== ROWS) throw new Error(`Map needs ${ROWS} rows (has ${def.map.length})`);
  def.map.forEach((r, i) => { if (r.length !== COLS) throw new Error(`Row ${i} is ${r.length} wide: "${r}"`); });
  const grid = def.map.map((r) => r.split(''));
  const L = { def, grid, treasures: [], coins: [], start: null, exit: null, vault: null, lasers: [], watchers: [], blocked: new Set() };
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === 'S') L.start = [x, y];
    if (ch === 'E') L.exit = [x, y];
    if (ch === 'V') L.vault = [x, y];
    if (ch === '$') L.treasures.push([x, y]);
    if (ch === 'o') L.coins.push([x, y]);
  }));
  // Laser groups: connected runs of '='
  const seen = new Set();
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch !== '=' || seen.has(`${x},${y}`)) return;
    const tiles = [], stack = [[x, y]];
    seen.add(`${x},${y}`);
    while (stack.length) {
      const [cx, cy] = stack.pop(); tiles.push([cx, cy]);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
        if (grid[ny]?.[nx] === '=' && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    const i = L.lasers.length;
    const t = (def.lasers || [])[i] || { on: 12, off: 12, offset: i * 6 };
    L.lasers.push({ tiles, set: new Set(tiles.map(([a, b]) => `${a},${b}`)), on: t.on, off: t.off, offset: t.offset || 0 });
  }));
  for (const g of def.guards || []) L.watchers.push({ type: g.dog ? 'dog' : 'guard', vision: g.vision ?? (g.dog ? 2 : 3), timeline: guardTimeline(g) });
  for (const c of def.cameras || []) { L.watchers.push({ type: 'camera', vision: c.vision ?? 5, timeline: cameraTimeline(c) }); L.blocked.add(`${c.x},${c.y}`); }
  return L;
}

export const tileAt = (L, x, y) => L.grid[y]?.[x] ?? '#';
export const walkable = (L, x, y) => WALK.has(tileAt(L, x, y)) && !L.blocked.has(`${x},${y}`);
export const opaque = (L, x, y) => OPAQUE.has(tileAt(L, x, y));
export const isHide = (L, x, y) => tileAt(L, x, y) === 'H';
export const watcherAt = (w, tick) => w.timeline[((tick % w.timeline.length) + w.timeline.length) % w.timeline.length];
export const laserOn = (l, tick) => ((tick + l.offset) % (l.on + l.off)) < l.on;

/** Tiles a watcher can see: a beam straight ahead, widening to 3 tiles after the first. */
export function vision(L, w, st) {
  const out = [];
  const [dx, dy] = DIRS[st.dir];
  const px = -dy, py = dx;
  for (const side of [0, -1, 1]) {
    for (let d = 1; d <= w.vision; d++) {
      if (side !== 0 && d < 2) continue;
      const x = st.x + dx * d + px * side, y = st.y + dy * d + py * side;
      if (opaque(L, x, y)) break;
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * Is the thief caught at this tick? Returns the reason (a watcher or 'laser') or null.
 * prev = where the thief was on the previous tick (to catch squeezing past a guard).
 */
export function caught(L, tick, x, y, prev = null) {
  for (const l of L.lasers) if (l.set.has(`${x},${y}`) && laserOn(l, tick)) return 'laser';
  const hidden = isHide(L, x, y);
  for (const w of L.watchers) {
    const st = watcherAt(w, tick);
    if (w.type !== 'camera') {
      if (st.x === x && st.y === y) return w;
      if (prev) { const before = watcherAt(w, tick - 1); if (before.x === x && before.y === y && st.x === prev[0] && st.y === prev[1]) return w; }
    }
    if (hidden) continue;
    for (const [vx, vy] of vision(L, w, st)) if (vx === x && vy === y) return w;
  }
  return null;
}

/** How long before every moving part repeats (for the level checker). */
export function period(L) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  let p = PLAYER_EVERY;
  const lcm = (a, b) => (a / g(a, b)) * b;
  for (const w of L.watchers) p = lcm(p, w.timeline.length);
  for (const l of L.lasers) p = lcm(p, l.on + l.off);
  return p;
}

/**
 * Level checker: can the exit (or the display case) be reached without ever being seen?
 * Returns the number of ticks of the fastest safe route, or -1.
 */
export function solve(L, maxTicks = 6000, step = PLAYER_EVERY) {
  const goal = L.vault || L.exit;
  if (!goal) return -1;
  const g = (a, b) => (b ? g(b, a % b) : a);
  const P0 = period(L), P = (P0 / g(P0, step)) * step;
  const key = (x, y, t) => `${x},${y},${t % P}`;
  if (caught(L, 0, L.start[0], L.start[1])) return -2;
  let frontier = [[L.start[0], L.start[1]]];
  const seen = new Set([key(L.start[0], L.start[1], 0)]);
  for (let t = 0; t < maxTicks; t += step) {
    const next = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && !walkable(L, nx, ny)) continue;
        let bad = false;
        for (let k = 1; k <= step && !bad; k++) if (caught(L, t + k, nx, ny, k === 1 ? [x, y] : null)) bad = true;
        if (bad) continue;
        if (nx === goal[0] && ny === goal[1]) return t + step;
        const kk = key(nx, ny, t + step);
        if (seen.has(kk)) continue;
        seen.add(kk); next.push([nx, ny]);
      }
    }
    frontier = next;
    if (!frontier.length) return -1;
  }
  return -1;
}

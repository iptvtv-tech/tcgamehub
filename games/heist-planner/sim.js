// ─────────────────────────────────────────────────────────────
//  HEIST PLANNER — pure rules (no drawing). Shared by the game and the
//  level checker (tools/check-heist-levels.mjs), which proves every level
//  has a plan that works.
//
//  Time moves in STEPS. On every step each crew member does one thing from
//  their plan (move one tile, or wait), and every guard moves one tile along
//  its patrol. Everything is predictable: a good plan always works.
// ─────────────────────────────────────────────────────────────
export const COLS = 12, ROWS = 12;
export const MOVES = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], W: [0, 0] };
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

//  Map key:  #  wall          .  floor         E  getaway van (everyone must end here)
//            $  loot (thief)  *  bonus gem (thief, optional)
//            C  computer terminal — the HACKER standing here switches off cameras + lasers
//            D  locked door — only the MUSCLE can smash through; then it's open for all
//            =  laser beam    H  plant / statue — hide on it and guards can't see you
//            P  exhibit (solid)   V  the vault prize (secret level)
//            T / K / M  starting spots of the Thief / hacKer / Muscle
export const CREW = {
  T: { id: 'T', name: 'Thief',  color: '#fbbf24', icon: '🕵️' },
  K: { id: 'K', name: 'Hacker', color: '#22d3ee', icon: '💻' },
  M: { id: 'M', name: 'Muscle', color: '#f472b6', icon: '💪' },
};
const FLOORISH = new Set(['.', 'E', '$', '*', 'C', '=', 'H', 'T', 'K', 'M', 'V']);
const OPAQUE = new Set(['#', 'P', 'H', 'D']);

const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up');

function guardTimeline(g) {
  const pts = g.path;
  const seq = g.loop ? [...pts, pts[0]] : pts;
  const tiles = [pts[0]];
  for (let i = 1; i < seq.length; i++) {
    const [ax, ay] = seq[i - 1], [bx, by] = seq[i];
    if (ax !== bx && ay !== by) throw new Error(`Guard path must be straight: ${seq[i - 1]} → ${seq[i]}`);
    const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
    let x = ax, y = ay;
    while (x !== bx || y !== by) { x += sx; y += sy; tiles.push([x, y]); }
  }
  const cycle = g.loop ? tiles.slice(0, -1) : tiles.concat(tiles.slice(1, -1).reverse());
  const n = cycle.length, pause = g.pause ?? 1;
  const tl = [];
  for (let i = 0; i < n; i++) {
    const cur = cycle[i], next = cycle[(i + 1) % n], prev = cycle[(i - 1 + n) % n];
    const dir = n === 1 ? g.face || 'down' : dirOf(cur, next);
    const pdir = n === 1 ? dir : dirOf(prev, cur);
    if (dir !== pdir || n === 1) for (let k = 0; k < pause; k++) tl.push({ x: cur[0], y: cur[1], dir: k < pause / 2 && n > 1 ? pdir : dir });
    tl.push({ x: cur[0], y: cur[1], dir });
  }
  const shift = (g.phase || 0) % tl.length;
  return tl.slice(shift).concat(tl.slice(0, shift));
}
function cameraTimeline(c) {
  const tl = [];
  for (const d of c.dirs) for (let k = 0; k < c.hold; k++) tl.push({ x: c.x, y: c.y, dir: d });
  return tl;
}

export function parseLevel(def) {
  if (def.map.length !== ROWS) throw new Error(`Map needs ${ROWS} rows (has ${def.map.length})`);
  def.map.forEach((r, i) => { if (r.length !== COLS) throw new Error(`Row ${i} is ${r.length} wide: "${r}"`); });
  const grid = def.map.map((r) => r.split(''));
  const L = { def, grid, crew: [], loot: [], gems: [], exits: [], terminals: [], doors: [], vault: null, watchers: [], lasers: [], blocked: new Set() };
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (CREW[ch]) L.crew.push({ id: ch, x, y });
    if (ch === '$') L.loot.push([x, y]);
    if (ch === '*') L.gems.push([x, y]);
    if (ch === 'E') L.exits.push([x, y]);
    if (ch === 'C') L.terminals.push([x, y]);
    if (ch === 'D') L.doors.push([x, y]);
    if (ch === 'V') L.vault = [x, y];
  }));
  L.crew.sort((a, b) => 'TKM'.indexOf(a.id) - 'TKM'.indexOf(b.id));
  // lasers: every '=' tile belongs to one group per level (optionally blinking)
  const lz = [];
  grid.forEach((row, y) => row.forEach((ch, x) => { if (ch === '=') lz.push([x, y]); }));
  if (lz.length) { const c = def.laser || {}; L.lasers.push({ set: new Set(lz.map(([a, b]) => `${a},${b}`)), on: c.on ?? 1, off: c.off ?? 0, offset: c.offset ?? 0 }); }
  for (const g of def.guards || []) L.watchers.push({ type: 'guard', vision: g.vision ?? 3, timeline: guardTimeline(g) });
  for (const c of def.cameras || []) { L.watchers.push({ type: 'camera', vision: c.vision ?? 5, timeline: cameraTimeline(c) }); L.blocked.add(`${c.x},${c.y}`); }
  return L;
}

export const tileAt = (L, x, y) => L.grid[y]?.[x] ?? '#';
export const watcherAt = (w, t) => w.timeline[((t % w.timeline.length) + w.timeline.length) % w.timeline.length];
export const laserOn = (l, t) => l.off === 0 || ((t + l.offset) % (l.on + l.off)) < l.on;
/** Can this crew member stand on (x,y)? `open` = set of smashed doors. */
export function canWalk(L, id, x, y, open) {
  const ch = tileAt(L, x, y);
  if (L.blocked.has(`${x},${y}`)) return false;
  if (ch === 'D') return open.has(`${x},${y}`) || id === 'M';
  return FLOORISH.has(ch);
}
const isOpaque = (L, x, y, open) => { const ch = tileAt(L, x, y); return ch === 'D' ? !open.has(`${x},${y}`) : OPAQUE.has(ch); };

export function vision(L, w, st, open) {
  const out = [];
  const [dx, dy] = DIRV[st.dir];
  const px = -dy, py = dx;
  for (const side of [0, -1, 1]) {
    for (let d = 1; d <= w.vision; d++) {
      const x = st.x + dx * d + px * side, y = st.y + dy * d + py * side;
      if (isOpaque(L, x, y, open)) break;          // walls block the view (no peeking round corners)
      if (side !== 0 && d < 2) continue;           // the beam widens after the first tile
      out.push([x, y]);
    }
  }
  return out;
}

/** Is a crew member at (x,y) spotted at step t? Returns a reason or null. */
export function spotted(L, t, x, y, prev, hacked, open) {
  if (!hacked) for (const l of L.lasers) if (l.set.has(`${x},${y}`) && laserOn(l, t)) return 'laser';
  const hidden = tileAt(L, x, y) === 'H';
  for (const w of L.watchers) {
    if (w.type === 'camera' && hacked) continue;
    const st = watcherAt(w, t);
    if (w.type === 'guard') {
      if (st.x === x && st.y === y) return 'guard';
      if (prev) { const b = watcherAt(w, t - 1); if (b.x === x && b.y === y && st.x === prev[0] && st.y === prev[1]) return 'guard'; }
    }
    if (hidden) continue;
    for (const [vx, vy] of vision(L, w, st, open)) if (vx === x && vy === y) return w.type;
  }
  return null;
}

/**
 * Play out a plan. plans = { T: 'RRDW…', K: '…', M: '…' }.
 * Returns { ok, steps, fail: {step, who, why} | null, frames: [...] } — frames are for the replay.
 */
export function simulate(L, plans) {
  const crew = L.crew.map((c) => ({ id: c.id, x: c.x, y: c.y }));
  const open = new Set();
  const lootLeft = new Set(L.loot.map(([x, y]) => `${x},${y}`));
  const gemsLeft = new Set(L.gems.map(([x, y]) => `${x},${y}`));
  let gems = 0, prize = false;
  const T = Math.max(1, ...crew.map((c) => (plans[c.id] || '').length));
  const hackedAt = (cs) => cs.some((c) => c.id === 'K' && tileAt(L, c.x, c.y) === 'C');
  const frames = [{ t: 0, crew: crew.map((c) => ({ ...c })), open: new Set(open), hacked: hackedAt(crew), loot: new Set(lootLeft), gems: new Set(gemsLeft), events: [] }];
  for (let t = 1; t <= T; t++) {
    const prevPos = {};
    const events = [];
    // muscle first (so a door smashed this step is open for the others), then the rest
    const order = [...crew].sort((a, b) => (a.id === 'M' ? -1 : b.id === 'M' ? 1 : 0));
    for (const c of order) {
      prevPos[c.id] = [c.x, c.y];
      const mv = (plans[c.id] || '')[t - 1] || 'W';
      const [dx, dy] = MOVES[mv] || [0, 0];
      const nx = c.x + dx, ny = c.y + dy;
      if ((dx || dy) && canWalk(L, c.id, nx, ny, open)) {
        c.x = nx; c.y = ny;
        const k = `${nx},${ny}`;
        if (tileAt(L, nx, ny) === 'D' && !open.has(k)) { open.add(k); events.push({ type: 'smash', x: nx, y: ny }); }
        if (c.id === 'T' && lootLeft.has(k)) { lootLeft.delete(k); events.push({ type: 'loot', x: nx, y: ny }); }
        if (c.id === 'T' && gemsLeft.has(k)) { gemsLeft.delete(k); gems++; events.push({ type: 'gem', x: nx, y: ny }); }
        if (c.id === 'T' && L.vault && nx === L.vault[0] && ny === L.vault[1] && !lootLeft.size) { prize = true; events.push({ type: 'prize', x: nx, y: ny }); }
      } else if (dx || dy) events.push({ type: 'bump', who: c.id });
    }
    const hacked = hackedAt(crew);
    frames.push({ t, crew: crew.map((c) => ({ ...c })), open: new Set(open), hacked, loot: new Set(lootLeft), gems: new Set(gemsLeft), events });
    for (const c of crew) {
      const why = spotted(L, t, c.x, c.y, prevPos[c.id], hacked, open);
      if (why) return { ok: false, steps: t, fail: { step: t, who: c.id, why }, frames, gems };
    }
  }
  const allOut = crew.every((c) => tileAt(L, c.x, c.y) === 'E');
  if (lootLeft.size) return { ok: false, steps: T, fail: { step: T, who: 'T', why: 'noloot' }, frames, gems };
  if (L.vault && !prize) return { ok: false, steps: T, fail: { step: T, who: 'T', why: 'noprize' }, frames, gems };
  if (!allOut && !L.vault) return { ok: false, steps: T, fail: { step: T, who: crew.find((c) => tileAt(L, c.x, c.y) !== 'E').id, why: 'left' }, frames, gems };
  return { ok: true, steps: T, fail: null, frames, gems, prize };
}

/** Where everyone would be at each step if nobody got caught (for the planning preview). */
export function trace(L, plans, T) {
  const crew = L.crew.map((c) => ({ id: c.id, x: c.x, y: c.y }));
  const open = new Set();
  const out = [{ crew: crew.map((c) => ({ ...c })), open: new Set(), hacked: crew.some((c) => c.id === 'K' && tileAt(L, c.x, c.y) === 'C') }];
  for (let t = 1; t <= T; t++) {
    const order = [...crew].sort((a, b) => (a.id === 'M' ? -1 : b.id === 'M' ? 1 : 0));
    for (const c of order) {
      const [dx, dy] = MOVES[(plans[c.id] || '')[t - 1] || 'W'];
      if ((dx || dy) && canWalk(L, c.id, c.x + dx, c.y + dy, open)) {
        c.x += dx; c.y += dy;
        if (tileAt(L, c.x, c.y) === 'D') open.add(`${c.x},${c.y}`);
      }
    }
    out.push({ crew: crew.map((c) => ({ ...c })), open: new Set(open), hacked: crew.some((c) => c.id === 'K' && tileAt(L, c.x, c.y) === 'C') });
  }
  return out;
}

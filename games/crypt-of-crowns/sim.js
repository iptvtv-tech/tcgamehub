// ─────────────────────────────────────────────────────────────
//  CRYPT OF CROWNS — the rules, shared by the game and the level checker.
//  The world runs on fixed ticks, so the patrols and spikes always follow the
//  same timetable. That's what lets a flawless run be pure skill.
//
//  Map key
//    #  crypt wall     =  bone wall      %  cracked wall (secret — SEARCH it)
//    @  start          E  stairs (exit)  C  the golden crown (secret vault)
//    k  gold key       D  gold door      b  blue key        B  blue door
//    L  lever (wall)   G  gate, opens when L is pulled   g  gate, CLOSES when L is pulled
//    M  lever 2        H  gate for M                      h  closes when M is pulled
//    *  spike trap     t  brazier (blocks)                c  gold coin      T  treasure chest
//    r l u d  skeleton starting to walk right / left / up / down; it patrols back and
//             forth along its row or column until something blocks it
// ─────────────────────────────────────────────────────────────
export const TICK = 0.1;          // seconds per world tick
export const ACT = 2;             // ticks for a step, a turn or a search
export const SPIKE_PERIOD = 24, SPIKE_UP = 10;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E S W N — angle = d·90°

const SKEL_WALK = new Set(['.', 'c', 'k', 'b', 'T', 'E', '@', '*', 'r', 'l', 'u', 'd']);
const SKEL_CH = { r: [0, 1], l: [0, -1], d: [1, 1], u: [1, -1] };   // [axis 0=x 1=y, sign]

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;

export function parse(def) {
  const rows = def.map, h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(w, ' ').split(''));
  const W = { w, h, grid, def, skels: [], spikes: [], keys: [], doors: [], secrets: [], start: null, exit: null, crown: null };
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? ' ' : grid[y][x]);
  W.at = at;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grid[y][x];
    if (c === '@') W.start = { x, y, d: def.dir ?? 0 };
    else if (c === 'E') W.exit = { x, y };
    else if (c === 'C') W.crown = { x, y };
    else if (c === 'k' || c === 'b') W.keys.push({ x, y, blue: c === 'b' });
    else if (c === 'D' || c === 'B') W.doors.push({ x, y, blue: c === 'B' });
    else if (c === '%') W.secrets.push({ x, y });
    else if (c === '*') W.spikes.push({ x, y, phase: def.spikePhase ? def.spikePhase(x, y) : (x * 3 + y * 5) % SPIKE_PERIOD });
    else if (SKEL_CH[c]) {
      const [axis, sign] = SKEL_CH[c], dx = axis ? 0 : 1, dy = axis ? 1 : 0;
      let x0 = x, y0 = y; while (SKEL_WALK.has(at(x0 - dx, y0 - dy))) { x0 -= dx; y0 -= dy; }
      const route = []; let cx = x0, cy = y0;
      while (SKEL_WALK.has(at(cx, cy))) { route.push([cx, cy]); cx += dx; cy += dy; }
      const i0 = route.findIndex(([rx, ry]) => rx === x && ry === y), n = route.length;
      const cyc = Math.max(1, 2 * (n - 1));
      const k0 = n < 2 ? 0 : sign > 0 ? (i0 === n - 1 ? n - 1 : i0) : (i0 === 0 ? 0 : cyc - i0);
      W.skels.push({ route, k0, cyc, sk: def.skel ?? 5 });
    }
  }
  // the world timetable repeats every P ticks
  let P = 1;
  for (const s of W.skels) P = lcm(P, s.cyc * s.sk);
  if (W.spikes.length) P = lcm(P, SPIKE_PERIOD);
  W.P = P;
  return W;
}

/** Where skeleton s is at tick T: {from, to, f} (f = 0..1 of the way from → to). */
export function skelAt(s, T) {
  const n = s.route.length;
  if (n < 2) return { from: s.route[0], to: s.route[0], f: 0 };
  const k = (s.k0 + Math.floor(T / s.sk)) % s.cyc, k1 = (k + 1) % s.cyc;
  const pos = (q) => s.route[q < n ? q : s.cyc - q];
  return { from: pos(k), to: pos(k1), f: (T % s.sk) / s.sk };
}
export const spikeUp = (sp, T) => ((T + sp.phase) % SPIKE_PERIOD) < SPIKE_UP;

/**
 * Dynamic state: { keys:Set of key index taken, doors:Set of door index opened, secrets:Set, levers:{L,M}, gold, blue }
 */
export function freshState() { return { keys: new Set(), doors: new Set(), secrets: new Set(), levers: { L: false, M: false }, gold: 0, blue: 0 }; }

/** Is this cell solid for the player right now? */
export function solidFor(W, st, x, y) {
  const c = W.at(x, y);
  switch (c) {
    case '#': case '=': case ' ': case 't': case 'L': case 'M': return true;
    case '%': return !st.secrets.has(W.secrets.findIndex((q) => q.x === x && q.y === y));
    case 'D': case 'B': return !st.doors.has(W.doors.findIndex((q) => q.x === x && q.y === y));
    case 'G': return !st.levers.L;
    case 'g': return st.levers.L;
    case 'H': return !st.levers.M;
    case 'h': return st.levers.M;
    default: return false;
  }
}

/** Would the player standing in `cells` at tick T be caught? Returns 'skeleton' | 'spikes' | null. */
export function danger(W, T, cells, spikeCell) {
  for (const s of W.skels) {
    const p = skelAt(s, T);
    for (const [x, y] of cells) if ((p.from[0] === x && p.from[1] === y) || (p.to[0] === x && p.to[1] === y)) return 'skeleton';
  }
  if (spikeCell) for (const sp of W.spikes) if (sp.x === spikeCell[0] && sp.y === spikeCell[1] && spikeUp(sp, T)) return 'spikes';
  return null;
}

/**
 * What happens when the player tries to act. Returns {type, ...}:
 *   move   → {type:'move', to:[x,y]}          (the step is allowed)
 *   door   → {type:'door', i}                 (a locked door you have the key for — it opens)
 *   locked → {type:'locked', blue}            (no key)
 *   lever  → {type:'lever', which}            (walk into or search a lever — it flips)
 *   secret → {type:'secret', i}               (search a cracked wall — it slides open)
 *   bump   → {type:'bump'}
 */
export function tryAct(W, st, x, y, d, act) {
  const dir = act === 'back' ? (d + 2) % 4 : d;
  const [dx, dy] = DIRS[dir], nx = x + dx, ny = y + dy, c = W.at(nx, ny);
  if (c === 'L' || c === 'M') return act === 'back' ? { type: 'bump' } : { type: 'lever', which: c };
  if (c === '%' && act === 'search') {
    const i = W.secrets.findIndex((q) => q.x === nx && q.y === ny);
    if (!st.secrets.has(i)) return { type: 'secret', i };
  }
  if ((c === 'D' || c === 'B') && act !== 'back') {
    const i = W.doors.findIndex((q) => q.x === nx && q.y === ny);
    if (!st.doors.has(i)) return (c === 'B' ? st.blue : st.gold) > 0 ? { type: 'door', i } : { type: 'locked', blue: c === 'B' };
  }
  if (act === 'search') return { type: 'bump' };
  if (solidFor(W, st, nx, ny)) return { type: 'bump' };
  return { type: 'move', to: [nx, ny] };
}

/** Pulling this lever would slam a gate shut on the cell you're standing in? */
export function jammed(W, st, x, y, which) {
  const c = W.at(x, y);
  if (which === 'L') return (c === 'G' && st.levers.L) || (c === 'g' && !st.levers.L);
  return (c === 'H' && st.levers.M) || (c === 'h' && !st.levers.M);
}

/** Apply a door / lever / secret / key pickup to the state (mutates). */
export function applyAct(W, st, r) {
  if (r.type === 'door') { st.doors.add(r.i); if (W.doors[r.i].blue) st.blue--; else st.gold--; }
  else if (r.type === 'lever') st.levers[r.which] = !st.levers[r.which];
  else if (r.type === 'secret') st.secrets.add(r.i);
}
export function pickKey(W, st, x, y) {
  const i = W.keys.findIndex((q) => q.x === x && q.y === y);
  if (i < 0 || st.keys.has(i)) return null;
  st.keys.add(i); if (W.keys[i].blue) st.blue++; else st.gold++;
  return W.keys[i];
}

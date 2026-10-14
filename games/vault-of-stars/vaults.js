// ─────────────────────────────────────────────────────────────
//  VAULT OF STARS — the sixteen vaults, and the rules that move everything in them.
//
//  Every vault is drawn by hand below and runs on a fixed tick clock (TICK seconds):
//  the astronaut moves one tile per tick, laser grids switch on a fixed beat and
//  sentry drones fly fixed routes. So a vault plays out exactly the same way every
//  time — learn it, and you can run it faster.
//
//  `node games/vault-of-stars/check.mjs` replays every possible route through every
//  vault with these same rules and proves each one can be finished, with oxygen to
//  spare; it also works out each vault's PAR (the fastest possible time).
//
//  No DOM here: the checker runs in node.
// ─────────────────────────────────────────────────────────────
export const FINAL = 15, SECRET = 16, BONUS = [5, 10];
export const TICK = 0.15;          // seconds per step
export const COLS = 15, ROWS = 15;

// Map key
//   #  hull wall              .  floor                 S  start           E  exit airlock
//   *  alien crystal (50)     $  star chart (200)      o  oxygen canister (+10 s)
//   A B C  access keys        a b c  their force-field doors
//   ~  zero-g drift tile: step on it and you slide until something stops you
//   x  cracked hull plate: it gives way once you step off it
//   1 2 3  laser grid tiles (each number switches on its own beat — see `lasers`)
//   @  the Golden Beacon (vault 16)
//
// lasers: { group: [ticksOn, ticksOff, phase] } — a tile is live while ((t + phase) % (on + off)) < on
// drones: { x, y, route, every } — route is moves (U D L R); a route that ends where it began loops,
//         otherwise the drone flies back the way it came. It moves one tile every `every` ticks.
// o2: seconds of oxygen. breach: (vault 15) seconds to reach the airlock once the last key is taken.
// par: fastest possible time in ticks — filled in from check.mjs (it fails if they don't match).

export const VAULTS = {
  1: {
    name: 'Outer Atrium', tip: 'Find the airlock. Grab the crystals on the way if you like.',
    o2: 30, par: 24,
    map: [
      '###############',
      '#S...#....*...#',
      '#.##.#.####.#.#',
      '#.#*.#...*#.#.#',
      '#.#.####.##.#.#',
      '#...*.........#',
      '#####.###.#####',
      '#*....#E#....*#',
      '#.###.#.#.###.#',
      '#.#*..#.#..*#.#',
      '#.#.###.###.#.#',
      '#.............#',
      '#.###.###.###.#',
      '#*..#..*..#..*#',
      '###############',
    ],
  },
  2: {
    name: 'The Storage Ring', tip: 'The airlock is sealed behind a force field. Its key card is somewhere in the ring.',
    o2: 30, par: 28,
    map: [
      '###############',
      '#S..#.....*...#',
      '#.#.#.#####.#.#',
      '#.#...#*..#.#.#',
      '#.#####.#.#.#.#',
      '#.....#.#...#.#',
      '#.###.#.#####.#',
      '#.#A#...#*....#',
      '#.#.#####.#####',
      '#...*...#.....#',
      '###.###.#.###.#',
      '#*....#.#.#E#.#',
      '#.###.#...#a#.#',
      '#.....#.*.....#',
      '###############',
    ],
  },
  3: {
    name: 'Corridor Seven', tip: 'Laser grids switch on and off. Watch the beat, then cross.',
    o2: 30, par: 27,
    lasers: { 1: [4, 6, 0] },
    map: [
      '###############',
      '#S....1.......#',
      '#####.#.#####.#',
      '#*..#.1.#*..#.#',
      '#.#.#.#.#.#.#.#',
      '#.#...#...#...#',
      '#.#####1#######',
      '#.....#.#....*#',
      '#####.#.#.###.#',
      '#*....1.1...#.#',
      '#.#####.#.#.#.#',
      '#.#...#.#.#...#',
      '#.#.#.#.#.#####',
      '#...#...#....E#',
      '###############',
    ],
  },
  4: {
    name: 'The Junction', tip: 'Two grids, two beats. When one goes dark, the other lights up.',
    o2: 30, par: 25,
    lasers: { 1: [4, 4, 0], 2: [4, 4, 4] },
    map: [
      '###############',
      '#S..#....*....#',
      '#.#.#.#######.#',
      '#.#...1...2...#',
      '#.#####.#.#####',
      '#.*...#2#1#..*#',
      '#####.#.#.#.###',
      '#.....1.#.2...#',
      '#.#######.###.#',
      '#.#*....2...#.#',
      '#.#.#####1#.#.#',
      '#...#..*..#.#.#',
      '###.#.#####.#.#',
      '#*....#.....2E#',
      '###############',
    ],
  },
  5: {
    name: 'Relic Cache', tip: '', bonus: true, o2: 60, par: 0,
    map: [
      '###############',
      '#S*.*.*.*.*.*.#',
      '#.............#',
      '#*.*.*.*.*.*.*#',
      '#.............#',
      '#.*.*.*.*.*.*.#',
      '#.............#',
      '#*.*.*.$.*.*.*#',
      '#.............#',
      '#.*.*.*.*.*.*.#',
      '#.............#',
      '#*.*.*.*.*.*.*#',
      '#.............#',
      '#.*.*.*.*.*.*.#',
      '###############',
    ],
  },
  6: {
    name: 'The Drone Bay', tip: 'Sentry drones fly fixed routes. Duck into an alcove and let them pass.',
    o2: 25, par: 22,
    drones: [
      { x: 13, y: 5, route: 'LLLLLLLLLLLL', every: 2 },
      { x: 1, y: 9, route: 'RRRRRRRRRRRR', every: 2 },
    ],
    map: [
      '###############',
      '#S....#...*...#',
      '###.#.#.#####.#',
      '#...#...#.....#',
      '#.#######.#.#.#',
      '#.............#',
      '#.#.#.#.#.#.#.#',
      '#*#.#*#.#*#.#*#',
      '#####.###.#####',
      '#.............#',
      '#.###.#.#.###.#',
      '#.#*..#.#..*#.#',
      '#.#.###.###.#.#',
      '#.....#E#.....#',
      '###############',
    ],
  },
  7: {
    name: 'Zero-G Section', tip: 'No gravity here. Step onto the field and you drift until something stops you.',
    o2: 30, par: 28,
    map: [
      '###############',
      '#S...........*#',
      '#.###########.#',
      '#~~~~~~~~~~~~~#',
      '#~~~#~~~~~~~#~#',
      '#~~~~~~~~#~~~~#',
      '#~#~~~~~~~~~~~#',
      '#~~~~~~#~~~~~~#',
      '#~~~~~~~~~~~#~#',
      '#~~~~##~~~~~~~#',
      '#######.#######',
      '#*...........*#',
      '#.###.#.#.###.#',
      '#.....#E#.....#',
      '###############',
    ],
  },
  8: {
    name: 'Pressure Lock', tip: 'Drones and lasers together. Fetch the key card, then find the gap.',
    o2: 35, par: 36,
    lasers: { 1: [3, 5, 0], 2: [3, 5, 4] },
    drones: [
      { x: 1, y: 7, route: 'RRRRRRRRRRRR', every: 2 },
    ],
    map: [
      '###############',
      '#S..1...#*...A#',
      '#.#.#.#.#.###.#',
      '#.#...#...#...#',
      '#.#########.###',
      '#*....2.......#',
      '#####.###.#.#.#',
      '#.............#',
      '#.#.#.#.#.#.#.#',
      '#*#.#*#.#*#.#*#',
      '###.#####.###.#',
      '#...#*..#...#.#',
      '#.###.#.#.#.###',
      '#.....#.2.#.aE#',
      '###############',
    ],
  },
  9: {
    name: 'The Deep Ring', tip: 'The key card floats in the middle of a drift field. Find the stops that take you to it.',
    o2: 35, par: 36,
    drones: [
      { x: 1, y: 13, route: 'UUUUUUUUU', every: 2 },
      { x: 13, y: 13, route: 'UUUUUUUUUUUU', every: 2 },
    ],
    map: [
      '###############',
      '#S.....#.....*#',
      '#.###.###.###.#',
      '#.#~~~~~~~~~#.#',
      '#.#~#~~~~~#~#.#',
      '#.#~~~~#~~~~#.#',
      '#.#~~~~~~~#~#.#',
      '#...~#~A~~~...#',
      '#.#~#~~~~~~~#.#',
      '#.#~~~~#~~~~#.#',
      '#.#~#~~~~~#~#.#',
      '#.#~~~~.~~~~#.#',
      '#.###.#a#.###.#',
      '#*....#E#....*#',
      '###############',
    ],
  },
  10: {
    name: 'Secondary Cache', tip: '', bonus: true, o2: 60, par: 0,
    map: [
      '###############',
      '#S~~~~~~~~~~~*#',
      '#~*~~~~#~~~~*~#',
      '#~~~*~~~~~*~~~#',
      '#~~~~~*~*~~~~~#',
      '#*~~~~~$~~~~~*#',
      '#~~#~~~~~~~#~~#',
      '#~~~*~~*~~*~~~#',
      '#~~~~~~~~~~~~~#',
      '#*~#~~~*~~~#~*#',
      '#~~~~~~~~~~~~~#',
      '#~~*~~~~~~~*~~#',
      '#~~~~~#~#~~~~~#',
      '#*~~~~~*~~~~~*#',
      '###############',
    ],
  },
  11: {
    name: 'Power Sector', tip: 'The lights are out. Your helmet lamp shows the way — the drones still fly.',
    o2: 35, dark: true, par: 36,
    drones: [
      { x: 13, y: 8, route: 'LLLLLLLLLLLLUUUUURRRRRRRRRRRRDDDDD', every: 1 },
      { x: 5, y: 11, route: 'RRRRRRR', every: 2 },
    ],
    map: [
      '###############',
      '#S.#.........A#',
      '#..#.#######..#',
      '#.............#',
      '#.#.##.#.##.#.#',
      '#.#.#*.#.*#.#.#',
      '#...#..#..#...#',
      '#.#.##.#.##.#.#',
      '#.............#',
      '#####.#.#.#####',
      '#*...........*#',
      '#.#..........##',
      '#.###.#.#.#####',
      '#.....#.#...aE#',
      '###############',
    ],
  },
  12: {
    name: 'Blackout Junction', tip: 'Dark, with lasers. The grids glow just before they fire — watch for it.',
    o2: 35, dark: true, par: 42,
    lasers: { 1: [4, 4, 0], 2: [3, 5, 2] },
    drones: [
      { x: 13, y: 7, route: 'LLLL', every: 2 },
    ],
    map: [
      '###############',
      '#S..#....1..B.#',
      '#.#.#.##.#.##.#',
      '#.#...#..#....#',
      '#.###.#.###.#.#',
      '#*..#.2.....#*#',
      '###.#.#####.#.#',
      '#.......#.....#',
      '#.#####.#.###.#',
      '#.#*..1.b..*#.#',
      '#.#.#####.###.#',
      '#...#...2.....#',
      '#.###.#.#######',
      '#*....#....b.E#',
      '###############',
    ],
  },
  13: {
    name: 'The Hull Walk', tip: 'Cracked plates give way behind you. The key card is across the bridge — plan the walk before you take it.',
    o2: 30, par: 32,
    map: [
      '###############',
      '#S...###.....A#',
      '#....xxx......#',
      '#....###.....*#',
      '###x#######x###',
      '#*...........*#',
      '#.###.###.###.#',
      '#.............#',
      '#*.....$.....*#',
      '#######x###x###',
      '#.....#x###x..#',
      '#*............#',
      '#.###.#a#####.#',
      '#.....#E#....*#',
      '###############',
    ],
  },
  14: {
    name: 'Inner Sanctum', tip: 'Cracked plates, drift fields and drones. One vault from the Core.',
    o2: 35, par: 36,
    lasers: { 1: [3, 5, 0] },
    drones: [
      { x: 13, y: 9, route: 'LLLLLLLLLLLL', every: 2 },
      { x: 1, y: 11, route: 'RRRRRRRRRRRR', every: 2 },
    ],
    map: [
      '###############',
      '#S..#~~~~~~~.A#',
      '#...#~~#~~~~..#',
      '#...~~~~~~#~#.#',
      '#.###~~~~~~~###',
      '#.#*...1...*#.#',
      '#.###x###x###.#',
      '#.#*.x...x.*#.#',
      '#.###x###x###.#',
      '#.............#',
      '#.#.#.#.#.#.#.#',
      '#.............#',
      '#######a#######',
      '#*.....E.....*#',
      '###############',
    ],
  },
  15: {
    name: 'The Core Chamber', tip: 'Take the last key and the hull breaches. Then run for the airlock.',
    o2: 45, breach: 6, par: 64,
    lasers: { 1: [4, 4, 0], 2: [4, 4, 4] },
    drones: [
      { x: 1, y: 7, route: 'RRRRRRRRRRRRLLLLLLLLLLLL', every: 1 },
      { x: 11, y: 13, route: 'LLLLLLLLL', every: 2 },
    ],
    map: [
      '###############',
      '#S..#.......#A#',
      '#.#.#.#####.#.#',
      '#.#...#*..#...#',
      '#.#####.#.###.#',
      '#o..1...#..2.*#',
      '#######a#######',
      '#.............#',
      '#.#~~~~~~~~~#.#',
      '#.#~#~~*~~#~#.#',
      '#.#~~~~~~~~~#.#',
      '#.xx~~~~~~~xx.#',
      '#.###########b#',
      '#B...*...*..#E#',
      '###############',
    ],
  },
  16: {
    name: 'The Signal Room', tip: 'Three rings, three key cards. The Beacon waits at the centre.',
    o2: 60, par: 96,
    lasers: { 1: [4, 4, 0], 2: [4, 4, 4] },
    drones: [
      { x: 13, y: 7, route: 'DDDDDDLLLLLLLLLLLLUUUUUUUUUUUURRRRRRRRRRRRDDDDDD', every: 2 },
      { x: 11, y: 11, route: 'UUUUUUUULLLLLLLLDDDDDDDDRRRRRRRR', every: 2 },
    ],
    map: [
      '###############',
      '#S...........o#',
      '#.###########.#',
      '#.#....1....#.#',
      '#.#.#######.#.#',
      '#.#.#C~~~~#.#.#',
      '#.#.#~###~#.#.#',
      '#.a2#~#@#~b2#.#',
      '#.#.#~#c#~#.#.#',
      '#.#.#~~.~~#.#.#',
      '#.#.#######.#.#',
      '#.#B...1....#.#',
      '#.###########.#',
      '#*...........A#',
      '###############',
    ],
  },
};

// Themes: outer ring (1-5), deep ring (6-10), the core (11-16).
export const theme = (n) => (n >= 11 ? 'core' : n >= 6 ? 'deep' : 'outer');

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_LIST = ['up', 'down', 'left', 'right'];
const MOVES = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;

/** Parse vault n into everything the game and the checker need. */
export function buildVault(n) {
  const def = VAULTS[n];
  if (!def) throw new Error(`No vault ${n}`);
  const rows = def.map;
  if (rows.length !== ROWS || rows.some((r) => r.length !== COLS)) throw new Error(`Vault ${n}: map must be ${COLS}×${ROWS}`);
  const v = {
    n, def, name: def.name, tip: def.tip, bonus: !!def.bonus, dark: !!def.dark, secret: n === SECRET,
    cell: rows.map((r) => r.split('')),
    start: null, exit: null, beacon: null,
    keys: {}, doors: [], relics: [], canisters: [], cracks: [], lasers: [],
    laserTiming: def.lasers || {}, drones: [],
    o2Ticks: Math.round((def.o2 || 60) / TICK),
    breachTicks: def.breach ? Math.round(def.breach / TICK) : 0,
    par: def.par || 0,
  };
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = rows[y][x];
      if (c === 'S') v.start = [x, y];
      else if (c === 'E') v.exit = [x, y];
      else if (c === '@') v.beacon = [x, y];
      else if (c === '*' || c === '$') v.relics.push({ x, y, big: c === '$' });
      else if (c === 'o') v.canisters.push({ x, y });
      else if ('ABC'.includes(c)) v.keys[c] = [x, y];
      else if ('abc'.includes(c)) v.doors.push({ x, y, key: c.toUpperCase() });
      else if (c === 'x') v.cracks.push([x, y]);
      else if ('123'.includes(c)) { v.lasers.push({ x, y, g: +c }); if (!v.laserTiming[c]) throw new Error(`Vault ${n}: laser group ${c} has no timing`); }
    }
  }
  if (!v.start) throw new Error(`Vault ${n}: no start`);
  if (!v.bonus && !v.exit && !v.beacon) throw new Error(`Vault ${n}: no exit`);
  v.keyNames = Object.keys(v.keys).sort();
  v.crackIndex = new Map(v.cracks.map(([x, y], i) => [y * COLS + x, i]));
  v.laserAt = new Map(v.lasers.map((l) => [l.y * COLS + l.x, l.g]));
  // Drones: expand each route into the tile it's on at every drone-step.
  for (const d of def.drones || []) {
    const path = [[d.x, d.y]];
    let [x, y] = [d.x, d.y];
    for (const m of d.route) { const [dx, dy] = MOVES[m]; x += dx; y += dy; path.push([x, y]); }
    const loops = x === d.x && y === d.y;
    const cyc = loops ? path.slice(0, -1) : [...path, ...path.slice(1, -1).reverse()];
    for (const [px, py] of cyc) if (rows[py]?.[px] === '#' || rows[py]?.[px] === undefined) throw new Error(`Vault ${n}: drone flies into a wall at ${px},${py}`);
    v.drones.push({ cyc, every: d.every || 1 });
  }
  // The whole vault repeats every `cycle` ticks.
  let cycle = 1;
  for (const [on, off] of Object.values(v.laserTiming)) cycle = lcm(cycle, on + off);
  for (const d of v.drones) cycle = lcm(cycle, d.cyc.length * d.every);
  v.cycle = cycle;
  return v;
}

// ── The rules (shared by the game and the checker) ──────────
export const laserOn = (v, g, t) => { const [on, off, ph] = v.laserTiming[g]; return ((t + ph) % (on + off) + (on + off)) % (on + off) < on; };
/** Is a laser tile live at tick t? */
export const laserLive = (v, x, y, t) => { const g = v.laserAt.get(y * COLS + x); return g ? laserOn(v, g, t) : false; };
export const droneAt = (d, t) => d.cyc[Math.floor(t / d.every) % d.cyc.length];

/**
 * A player state: { x, y, t, keys (bitmask over v.keyNames), holes (bitmask over v.cracks), slide (dir or null) }
 */
export function initialState(v) {
  return { x: v.start[0], y: v.start[1], t: 0, keys: 0, holes: 0, slide: null };
}

export function keyBit(v, name) { return 1 << v.keyNames.indexOf(name); }
export const allKeys = (v) => (1 << v.keyNames.length) - 1;

/** Can the astronaut stand on (x, y) right now? */
export function walkable(v, st, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  const c = v.cell[y][x];
  if (c === '#') return false;
  if ('abc'.includes(c) && !(st.keys & keyBit(v, c.toUpperCase()))) return false;
  const ci = v.crackIndex.get(y * COLS + x);
  if (ci !== undefined && st.holes & (1 << ci)) return false;
  return true;
}

/** The direction the astronaut is forced to keep moving in (drifting), or null. */
export function forcedDir(v, st) {
  if (!st.slide || v.cell[st.y][st.x] !== '~') return null;
  const [dx, dy] = DIRS[st.slide];
  return walkable(v, st, st.x + dx, st.y + dy) ? st.slide : null;
}

/**
 * Advance one tick. dir = 'up' | 'down' | 'left' | 'right' | null (wait).
 * Returns { st: next state, moved, hit: null | 'drone' | 'laser', key: name | null, slid: bool }.
 * A forced drift overrides dir.
 */
export function step(v, st, dir) {
  const forced = forcedDir(v, st);
  const go = forced || dir;
  let { x, y, keys, holes } = st;
  let moved = false, slide = null, key = null;
  if (go) {
    const [dx, dy] = DIRS[go];
    if (walkable(v, st, x + dx, y + dy)) {
      // leaving a cracked plate breaks it
      const ci = v.crackIndex.get(y * COLS + x);
      if (ci !== undefined) holes |= 1 << ci;
      x += dx; y += dy; moved = true;
      if (v.cell[y][x] === '~') slide = go;
      const c = v.cell[y][x];
      if ('ABC'.includes(c) && !(keys & keyBit(v, c))) { keys |= keyBit(v, c); key = c; }
    }
  }
  const t = st.t + 1;
  // What hurts: a live laser under you, or a drone on your tile (or one you swapped places with).
  let hit = null;
  if (laserLive(v, x, y, t)) hit = 'laser';
  for (const d of v.drones) {
    const [ax, ay] = droneAt(d, t), [bx, by] = droneAt(d, st.t);
    if ((ax === x && ay === y) || (moved && bx === x && by === y && ax === st.x && ay === st.y)) hit = 'drone';
  }
  return { st: { x, y, t, keys, holes, slide }, moved, hit, key, slid: !!forced };
}

/** Has this state reached the goal? (the airlock, or the Beacon in vault 16) */
export const atGoal = (v, st) => {
  const g = v.beacon || v.exit;
  return !!g && st.x === g[0] && st.y === g[1];
};

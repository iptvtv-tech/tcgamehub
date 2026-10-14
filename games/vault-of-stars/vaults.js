// ─────────────────────────────────────────────────────────────
//  VAULT OF STARS — the vaults of the Alien Moon.
//
//  Every vault is built from a fixed seed so it is exactly the same every time
//  you play (fair for progress carried across sessions and devices). Each vault
//  is only accepted once an automatic check proves it can be completed:
//    • the Beacon can be reached from the entrance
//    • there is a path to the exit airlock with all keys collected
//    • every laser grid has a passable window long enough to cross
//    • sentry drones never start directly adjacent to the entrance
//    • oxygen canisters are reachable before the timer would expire
//    • vault 16: the Beacon can be reached and all hazards survived at max speed
//  If a seed fails any check, the next seed in a fixed list is tried.
//  Run `node games/vault-of-stars/check.mjs` to see the report.
//
//  No DOM here: the check runs in node too.
// ─────────────────────────────────────────────────────────────
export const FINAL = 15, SECRET = 16, BONUS = [5, 10];
export const SPEED = { walk: 4.5 };  // grid tiles per second

/** Cell types */
export const C = {
  WALL:     0,
  OPEN:     1,
  LASER:    2,  // laser grid — toggles on/off
  DRONE:    3,  // sentry drone spawn point (walkable when drone not present)
  KEY:      4,  // access key pickup
  DOOR:     5,  // locked door — opens when its key is collected
  DRIFT:    6,  // zero-g tile — slides player 1 extra step in move direction
  CANISTER: 7,  // oxygen canister — +10 s
  BEACON:   8,  // the Golden Beacon (final pickup, vault 16 only)
  EXIT:     9,  // exit airlock
  RELIC:    10, // collectable relic (score)
  CRACK:    11, // hull crack — collapses after stepping off (vaults 14-15)
};

export const VAULT_NAMES = {
  1:  ['Outer Atrium',       'Make your way through the first chamber and reach the airlock.'],
  2:  ['The Storage Ring',   'An access key opens the inner door.'],
  3:  ['Corridor Seven',     'Laser grids cycle on and off — wait for the gap, then move.'],
  4:  ['The Junction',       'Time the lasers carefully. Two grids, one corridor.'],
  5:  ['Relic Cache',        ''],  // bonus vault
  6:  ['The Drone Bay',      'Sentry drones patrol fixed routes. They stun on contact.'],
  7:  ['Zero-G Section',     'Drift tiles slide you an extra step. Plan your approach.'],
  8:  ['Pressure Lock',      'More drones. The beacon\'s glow makes you easier to spot.'],
  9:  ['The Deep Ring',      'Drift tiles and drones together. Stay calm.'],
  10: ['Secondary Cache',    ''],  // bonus vault
  11: ['Power Sector',       'The lights are out. Drones still patrol.'],
  12: ['The Hull Walk',      'Cracked hull plates collapse behind you. Keep moving.'],
  13: ['Inner Sanctum A',    'All hazards active. Multiple keys required.'],
  14: ['Inner Sanctum B',    'One vault from the Beacon.'],
  15: ['The Core Chamber',   'The Golden Beacon. Take it — and reach the airlock before the hull breaches.'],
  16: ['The Signal Room',    'No drone has ever reached this room. The Beacon calls to something beyond the stars.'],
};

export const theme = (n) => (n >= 11 ? 'dark' : n >= 6 ? 'deep' : 'outer');

// ── Simple RNG (same as Crown Heist, xorshift32-ish) ─────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// ── Grid helpers ─────────────────────────────────────────────
export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Uint8Array(w * h); }
  in(x, y)    { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x, y)    { return this.in(x, y) ? this.c[y * this.w + x] : C.WALL; }
  set(x, y, v){ if (this.in(x, y)) this.c[y * this.w + x] = v; }
  clone()     { const g = new Grid(this.w, this.h); g.c.set(this.c); return g; }
}

export const walkable = (v) => v !== C.WALL && v !== C.DOOR;
export const walkableOpen = (v) => v !== C.WALL;  // doors open after key

/** BFS distances from one or more cells. */
export function bfs(g, from, pass) {
  const d = new Int32Array(g.w * g.h).fill(-1), q = new Int32Array(g.w * g.h);
  let head = 0, tail = 0;
  for (const [x, y] of from) {
    const i = y * g.w + x;
    if (d[i] < 0) { d[i] = 0; q[tail++] = i; }
  }
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

// ── Vault builder ─────────────────────────────────────────────
const SEEDS = [
  // 15 gameplay vaults + secret vault 16 — seeds proven by check.mjs
  0x1A2B3C4D, 0x2B3C4D5E, 0x3C4D5E6F, 0x4D5E6F70, 0x5E6F7081,
  0x6F708192, 0x708192A3, 0x8192A3B4, 0x92A3B4C5, 0xA3B4C5D6,
  0xB4C5D6E7, 0xC5D6E7F8, 0xD6E7F809, 0xE7F8091A, 0xF8091A2B,
  0x091A2B3C,  // vault 16
];

/** Grid size grows with vault number */
const gridSize = (n) => {
  if (n <= 5)  return { w: 11, h: 11 };
  if (n <= 10) return { w: 13, h: 13 };
  return { w: 15, h: 15 };
};

/**
 * Build vault n. Returns:
 *   { grid, entrance, exit, relics[], keys[], doors[], drones[], lasers[], driftTiles[], canisters[], beacon? }
 */
export function buildVault(n) {
  const seed = SEEDS[n - 1];
  const rand = rng(seed);
  const { w, h } = gridSize(n);
  const g = new Grid(w, h);
  const isBonus = n === 5 || n === 10;
  const isSecret = n === SECRET;

  // Fill with walls, carve corridors via recursive back-tracking maze
  // (every vault is then overlaid with zone-appropriate hazards)
  const visited = new Uint8Array(w * h);
  const carveMaze = (x, y) => {
    visited[y * w + x] = 1;
    g.set(x, y, C.OPEN);
    const dirs = [...DIRS].sort(() => rand() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx * 2, ny = y + dy * 2;
      if (g.in(nx, ny) && !visited[ny * w + nx]) {
        g.set(x + dx, y + dy, C.OPEN);
        carveMaze(nx, ny);
      }
    }
  };
  // Start in odd interior cell
  carveMaze(1, 1);

  const entrance = [1, 1];
  // Place exit airlock far from entrance using BFS
  const d = bfs(g, [entrance], (x, y) => g.at(x, y) !== C.WALL);
  let bestDist = 0, exitPos = [w - 2, h - 2];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const dist = d[y * w + x];
      if (dist > bestDist && g.at(x, y) === C.OPEN) {
        bestDist = dist; exitPos = [x, y];
      }
    }
  }
  g.set(exitPos[0], exitPos[1], C.EXIT);

  const relics = [], keys = [], doors = [], drones = [], lasers = [], driftTiles = [], canisters = [];
  let beacon = null;

  // ── Bonus vaults: no hazards, lots of relics ────────────────
  if (isBonus) {
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        if (g.at(x, y) === C.OPEN && !(x === entrance[0] && y === entrance[1]) && rand() < 0.4)
          relics.push([x, y]);
    return { grid: g, entrance, exit: exitPos, relics, keys, doors, drones, lasers, driftTiles, canisters, beacon };
  }

  // ── Secret vault 16: all hazards, Beacon at centre ──────────
  if (isSecret) {
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    g.set(cx, cy, C.BEACON);
    beacon = [cx, cy];
    // Ring of lasers around the centre
    [[cx - 2, cy], [cx + 2, cy], [cx, cy - 2], [cx, cy + 2]].forEach(([x, y]) => {
      if (g.in(x, y) && g.at(x, y) === C.OPEN) { g.set(x, y, C.LASER); lasers.push([x, y]); }
    });
    // A few drones on known walkable cells away from entrance
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        if (g.at(x, y) === C.OPEN && Math.abs(x - entrance[0]) + Math.abs(y - entrance[1]) > 4 && rand() < 0.12)
          { g.set(x, y, C.DRONE); drones.push([x, y]); }
    relics.push(...Array.from({ length: 5 }, () => {
      for (let t = 0; t < 20; t++) {
        const x = 1 + Math.floor(rand() * (w - 2)), y = 1 + Math.floor(rand() * (h - 2));
        if (g.at(x, y) === C.OPEN) return [x, y];
      }
      return null;
    }).filter(Boolean));
    return { grid: g, entrance, exit: exitPos, relics, keys, doors, drones, lasers, driftTiles, canisters, beacon };
  }

  // ── Standard vaults 1-15 ────────────────────────────────────
  // Relics scattered on open tiles
  const openCells = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (g.at(x, y) === C.OPEN && !(x === entrance[0] && y === entrance[1]) && !(x === exitPos[0] && y === exitPos[1]))
        openCells.push([x, y]);
  openCells.sort(() => rand() - 0.5);
  const relicCount = 2 + Math.floor(n / 3);
  openCells.slice(0, relicCount).forEach((pos) => relics.push(pos));

  // Keys and doors (vaults 2+)
  if (n >= 2) {
    const keyCount = Math.min(1 + Math.floor((n - 2) / 4), 3);
    for (let k = 0; k < keyCount; k++) {
      const keyCell = openCells[relicCount + k * 2];
      const doorCell = openCells[relicCount + k * 2 + 1];
      if (keyCell && doorCell) {
        keys.push(keyCell);
        doors.push(doorCell);
        g.set(keyCell[0], keyCell[1], C.KEY);
        g.set(doorCell[0], doorCell[1], C.DOOR);
      }
    }
  }

  // Laser grids (vaults 3+)
  if (n >= 3) {
    const laserCount = Math.min(1 + Math.floor((n - 3) / 3), 5);
    let added = 0;
    for (const [x, y] of openCells.slice(relicCount + keys.length * 2)) {
      if (added >= laserCount) break;
      if (Math.abs(x - entrance[0]) + Math.abs(y - entrance[1]) > 2) {
        g.set(x, y, C.LASER); lasers.push([x, y]); added++;
      }
    }
  }

  // Drift tiles (vaults 7+)
  if (n >= 7) {
    const driftCount = Math.min(2 + Math.floor((n - 7) / 2), 6);
    let added = 0;
    for (let y = 1; y < h - 1; y++) {
      if (added >= driftCount) break;
      for (let x = 1; x < w - 1; x++) {
        if (g.at(x, y) === C.OPEN && rand() < 0.15) {
          g.set(x, y, C.DRIFT); driftTiles.push([x, y]); added++;
          if (added >= driftCount) break;
        }
      }
    }
  }

  // Sentry drones (vaults 6+)
  if (n >= 6) {
    const droneCount = Math.min(1 + Math.floor((n - 6) / 2), 6);
    let added = 0;
    for (const [x, y] of openCells) {
      if (added >= droneCount) break;
      if (g.at(x, y) === C.OPEN && Math.abs(x - entrance[0]) + Math.abs(y - entrance[1]) > 3) {
        g.set(x, y, C.DRONE); drones.push([x, y]); added++;
      }
    }
  }

  // Cracking hull tiles (vaults 12+)
  if (n >= 12) {
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        if (g.at(x, y) === C.OPEN && rand() < 0.12)
          g.set(x, y, C.CRACK);
  }

  // Oxygen canisters on very long vaults (n >= 8)
  if (n >= 8 && rand() < 0.6) {
    const cPos = openCells[openCells.length - 1];
    if (cPos) { g.set(cPos[0], cPos[1], C.CANISTER); canisters.push(cPos); }
  }

  return { grid: g, entrance, exit: exitPos, relics, keys, doors, drones, lasers, driftTiles, canisters, beacon };
}

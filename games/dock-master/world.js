// ─────────────────────────────────────────────────────────────
//  DOCK MASTER — world rules shared by the game and check.mjs.
//
//  A space station sits mid-screen with one colour-coded docking bay per
//  traffic colour. Ships warp in from the screen edges and drift; the player
//  drags a route from a ship to its matching bay. Two ships touching is a
//  collision (a life); the wrong-colour bay politely refuses. Dock the level's
//  quota to finish. Everything here is pure functions of plain objects so the
//  checker can verify every level headlessly.
// ─────────────────────────────────────────────────────────────

export const W = 480;
export const H = 720;
export const SHIP_R = 11;          // ship hull radius (collision circle)
export const BAY_R = 20;           // docking mouth radius
export const STATION_R = 56;       // solid station core
export const CX = W / 2, CY = H / 2 - 26;
export const WRAP = 36;            // how far off-screen a drifting ship goes before wrapping
export const ROUTE_BOOST = 1.35;   // ships fly a plotted route faster than they drift

/** Traffic colours, in the order levels introduce them. */
export const COLORS = [
  { hue: 350, name: 'Ruby' },
  { hue: 190, name: 'Cyan' },
  { hue: 45,  name: 'Amber' },
  { hue: 270, name: 'Violet' },
];

// ── Difficulty curve ─────────────────────────────────────────
export function levelSpec(level) {
  return {
    quota: Math.min(26, 5 + level * 2),                   // ships to dock: 7 at L1 … 26 at L11+
    colours: Math.min(4, 2 + Math.floor((level - 1) / 2)),// 2 colours at L1–2, 3 at L3–4, 4 at L5+
    speed: 42 + Math.min(46, level * 4),                  // drift speed, px/s
    spawnEvery: Math.max(1.5, 4.0 - level * 0.25),        // seconds between warp-ins
    maxAlive: Math.min(7, 3 + Math.ceil(level / 2)),      // spawner holds back beyond this
    shift: level >= 8,                                    // bays trade colours on a timer from L8
    shiftEvery: Math.max(9, 16 - level * 0.5),            // seconds between bay colour trades
  };
}

/** Bays around the station: one per colour, evenly spaced, rotated by the seed. */
export function makeLevel(level, rng) {
  const sp = levelSpec(level);
  const a0 = rng.range(0, Math.PI * 2);
  // shuffle which colour lands on which arm
  const order = Array.from({ length: sp.colours }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const bays = order.map((color, i) => {
    const a = a0 + (i * Math.PI * 2) / sp.colours;
    return {
      color, a,
      x: CX + Math.cos(a) * (STATION_R + BAY_R * 0.4),
      y: CY + Math.sin(a) * (STATION_R + BAY_R * 0.4),
      mx: CX + Math.cos(a) * (STATION_R + BAY_R + 6),     // the mouth: where ships must arrive
      my: CY + Math.sin(a) * (STATION_R + BAY_R + 6),
    };
  });
  return { spec: sp, bays };
}

/** Warp a new ship in on a screen edge, heading loosely toward the centre. */
export function spawnShip(spec, rng) {
  const edge = rng.int(0, 3);                              // 0 top, 1 right, 2 bottom, 3 left
  const f = rng.range(0.15, 0.85);
  const x = edge === 1 ? W + WRAP - 4 : edge === 3 ? -WRAP + 4 : W * f;
  const y = edge === 0 ? -WRAP + 4 : edge === 2 ? H + WRAP - 4 : H * f;
  const aim = Math.atan2(CY - y, CX - x) + rng.range(-0.5, 0.5);
  return {
    x, y, r: SHIP_R,
    color: rng.int(0, spec.colours - 1),
    vx: Math.cos(aim) * spec.speed, vy: Math.sin(aim) * spec.speed,
    path: [],                                              // plotted route (points), empty = drifting
    dock: null,                                            // set once committed to a bay's final approach
  };
}

/** One step of a ship: follow its route (boosted), else drift and wrap. Returns distance travelled. */
export function stepShip(ship, spec, dt) {
  const v = spec.speed * (ship.path.length ? ROUTE_BOOST : 1);
  let left = v * dt;
  while (ship.path.length && left > 0) {
    const p = ship.path[0];
    const dx = p.x - ship.x, dy = p.y - ship.y, d = Math.hypot(dx, dy);
    if (d <= Math.max(left, 3)) { ship.x = p.x; ship.y = p.y; ship.path.shift(); left -= d; continue; }
    ship.x += (dx / d) * left; ship.y += (dy / d) * left;
    ship.vx = (dx / d) * v; ship.vy = (dy / d) * v;        // remember heading for when the route runs out
    left = 0;
  }
  if (!ship.path.length && left > 0) {
    const n = Math.hypot(ship.vx, ship.vy) || 1;
    ship.x += (ship.vx / n) * left;
    ship.y += (ship.vy / n) * left;
    // wrap the void: a drifting ship that leaves one side returns on the other
    if (ship.x < -WRAP) ship.x = W + WRAP; else if (ship.x > W + WRAP) ship.x = -WRAP;
    if (ship.y < -WRAP) ship.y = H + WRAP; else if (ship.y > H + WRAP) ship.y = -WRAP;
  }
  return v * dt;
}

export const shipsCollide = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy < (a.r + b.r) * (a.r + b.r);
};

/** Is the ship at a bay's mouth? (Any colour — the game decides dock vs refuse.) */
export function atBay(ship, bay) {
  return Math.hypot(ship.x - bay.mx, ship.y - bay.my) < BAY_R * 0.9;
}

/** Does the ship overlap the solid station core (not a bay mouth)? */
export function hitsStation(ship) {
  return Math.hypot(ship.x - CX, ship.y - CY) < STATION_R + ship.r - 2;
}

/** Straight-line seconds from the worst spawn corner to the farthest bay mouth (throughput maths). */
export function worstDockTime(bays, spec) {
  const corners = [[0, 0], [W, 0], [0, H], [W, H]];
  let worst = 0;
  for (const [x, y] of corners) for (const b of bays) {
    worst = Math.max(worst, Math.hypot(b.mx - x, b.my - y) / (spec.speed * ROUTE_BOOST));
  }
  return worst;
}

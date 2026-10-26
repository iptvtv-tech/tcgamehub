// ─────────────────────────────────────────────────────────────
//  ORBIT HOPPER — world rules shared by the game and check.mjs.
//
//  A level is a column of planets rising from the start planet (bottom) to the
//  beacon planet (top). The hopper circles a planet; one press lets go and it
//  flies on a straight line bent by every planet's gravity. Touching a planet
//  captures it into orbit there. Drifting out of the field or flying for too
//  long loses a life. Everything here is pure functions of plain objects so the
//  checker can replay it headlessly.
// ─────────────────────────────────────────────────────────────

export const W = 480;                // logical width — the world is exactly one screen wide
export const HOPPER_R = 8;
export const G = 900;                // gravity constant (mass = radius²): escape speed ≈ 200 at launch, bends hard close to a planet
export const MAX_ACC = 900;          // gravity cap right next to a planet
export const MAX_FLIGHT = 2.6;       // seconds in the void before a life is lost (≈ 2–3 planets of travel)
export const STEP = 1 / 120;
export const STAR_R = 7;

/** Hop speed at release (tangent) and the orbit gap above the surface. */
export const launchSpeed = (level) => 300 + Math.min(60, level * 5);
export const ORBIT_GAP = 22;
/** Angular speed while orbiting, rad/s (rises with level — timing gets tighter). */
export const orbitSpeed = (level) => 1.4 + Math.min(1.4, (level - 1) * 0.08);

/** Field bounds around a level's planets: beyond this margin the hopper is lost. */
export function bounds(planets) {
  let top = Infinity, bottom = -Infinity;
  for (const p of planets) { top = Math.min(top, p.y - p.r); bottom = Math.max(bottom, p.y + p.r); }
  return { x0: -60, x1: W + 60, y0: top - 220, y1: bottom + 160 };
}

/** Acceleration on (x, y) from every planet. */
export function gravity(planets, x, y, out = [0, 0]) {
  let ax = 0, ay = 0;
  for (const p of planets) {
    const dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
    const a = Math.min(MAX_ACC, G * p.r * p.r / d2);
    ax += a * dx / d; ay += a * dy / d;
  }
  out[0] = ax; out[1] = ay; return out;
}

/** One physics step of a free-flying hopper {x, y, vx, vy}. Returns the planet it touched, or null. */
export function stepFlight(h, planets, dt = STEP) {
  const [ax, ay] = gravity(planets, h.x, h.y);
  h.vx += ax * dt; h.vy += ay * dt;
  h.x += h.vx * dt; h.y += h.vy * dt;
  for (const p of planets) {
    const dx = h.x - p.x, dy = h.y - p.y;
    if (dx * dx + dy * dy <= (p.r + HOPPER_R) * (p.r + HOPPER_R)) return p;
  }
  return null;
}

/** Position and tangent velocity of a hopper orbiting planet p at angle a, direction dir (+1 ccw / −1 cw). */
export function orbitState(p, a, dir, level) {
  const R = p.r + ORBIT_GAP;
  const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
  const v = launchSpeed(level);
  return { x, y, vx: -Math.sin(a) * dir * v, vy: Math.cos(a) * dir * v };
}

/** Simulate a release from planet p at angle a: which planet is reached (or null = void / timeout). */
export function simulateHop(planets, p, a, dir, level, maxT = MAX_FLIGHT) {
  const h = orbitState(p, a, dir, level);
  const b = bounds(planets);
  let t = 0, hit = null;
  // the first few steps are still touching the home planet's capture ring: ignore it for 0.15 s
  while (t < maxT) {
    hit = stepFlight(h, planets);
    t += STEP;
    if (hit) { if (hit === p && t < 0.15) { hit = null; continue; } return { planet: hit, t }; }
    if (h.x < b.x0 || h.x > b.x1 || h.y < b.y0 || h.y > b.y1) return { planet: null, t };
  }
  return { planet: null, t };
}

// ── Level generation ─────────────────────────────────────────
/** How many planets, how big, how far apart — the difficulty curve. */
export function levelSpec(level) {
  return {
    count: Math.min(12, 4 + Math.floor(level * 0.9)),     // 5 planets at L1 … 12 at L9+
    rMin: Math.max(18, 40 - level * 1.6),
    rMax: Math.max(30, 56 - level * 1.8),
    gapMin: 150 + Math.min(90, level * 7),                // vertical spacing between planets
    gapMax: 210 + Math.min(130, level * 9),
    stars: 4 + Math.min(8, level),
  };
}

/** Build the planets (bottom = start, top = beacon) and the stars for a level. rng is the engine's seeded one. */
export function makeLevel(level, rng) {
  const sp = levelSpec(level);
  const planets = [];
  let y = 0, x = W / 2;
  const hues = [190, 320, 50, 140, 270, 20, 210, 0];
  for (let i = 0; i < sp.count; i++) {
    const r = i === 0 ? 44 : i === sp.count - 1 ? 38 : rng.range(sp.rMin, sp.rMax);
    if (i > 0) {
      y -= rng.range(sp.gapMin, sp.gapMax);
      // snake left and right, but always leave the planet fully on screen
      const dir = i % 2 ? -1 : 1;
      x = Math.max(r + 30, Math.min(W - r - 30, W / 2 + dir * rng.range(40, 170)));
    }
    planets.push({ x, y, r, hue: i === sp.count - 1 ? 45 : hues[(i + level) % hues.length], i, goal: i === sp.count - 1, start: i === 0 });
  }
  // stars float in the gaps between planets, a little off the straight line
  const stars = [];
  for (let k = 0; k < sp.stars; k++) {
    const a = planets[rng.int(0, planets.length - 2)], b = planets[a.i + 1];
    const f = rng.range(0.3, 0.7);
    stars.push({ x: a.x + (b.x - a.x) * f + rng.range(-50, 50), y: a.y + (b.y - a.y) * f + rng.range(-30, 30), got: false });
  }
  return { planets, stars };
}

/** For the checker and the in-game route hint: the set of planets reachable from p by some release angle. */
export function reachable(planets, p, level, stepDeg = 3) {
  const out = new Map();   // planet -> first angle that reaches it
  for (const dir of [1, -1]) {
    for (let deg = 0; deg < 360; deg += stepDeg) {
      const a = deg * Math.PI / 180;
      const r = simulateHop(planets, p, a, dir, level);
      if (r.planet && r.planet !== p && !out.has(r.planet)) out.set(r.planet, { a, dir, t: r.t });
    }
  }
  return out;
}

/** Can the beacon be reached from the start? Returns the hop route (planet indices) or null. */
export function route(planets, level) {
  const start = planets[0], goal = planets[planets.length - 1];
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift();
    if (p === goal) break;
    for (const q of reachable(planets, p, level).keys()) if (!prev.has(q)) { prev.set(q, p); queue.push(q); }
  }
  if (!prev.has(goal)) return null;
  const path = []; for (let p = goal; p; p = prev.get(p)) path.unshift(p.i);
  return path;
}

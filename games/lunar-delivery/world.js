// ─────────────────────────────────────────────────────────────
//  LUNAR DELIVERY 3D — the moon itself.
//  Pure data, no DOM: game.js and check.mjs both build worlds with this,
//  so every route the game makes can be proven flyable on the command line.
//
//  A world is a 768 m square of seeded terrain (rolling regolith, craters,
//  and from delivery 4 sharp ridges that grow taller every level), with
//  landing pads flattened into it, base domes and masts round each pad,
//  a trail of stardust and fuel canisters along every leg, and from
//  delivery 9 dust geysers on the way.
// ─────────────────────────────────────────────────────────────

export const GRID = 192, CELL = 4, N = GRID + 1, HALF = (GRID * CELL) / 2; // 768 m across
export const PAD_R = 9;          // landing / drop zone radius
export const CARGO_OFF = 5;      // the crate waits this far from the pad centre
export const LIMIT = HALF - 60;  // soft edge of the flying area
const TAU = Math.PI * 2;

/** small fast seeded random (0..1) */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rand) {
  const tab = new Float32Array(256 * 256);
  for (let i = 0; i < tab.length; i++) tab[i] = rand();
  const v = (x, z) => tab[(z & 255) * 256 + (x & 255)];
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = v(xi, zi), b = v(xi + 1, zi), c = v(xi, zi + 1), d = v(xi + 1, zi + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
}

/** flight numbers, shared by game.js and check.mjs */
export const PHYS = {
  G: 1.9,            // moon gravity (m/s², a bit above the real 1.62 so it feels responsive)
  THRUST: 5.6,       // main engine (m/s² on the empty hopper)
  CABLE: 7,          // tow cable length (m)
  FEET: 1.9,         // hopper centre to feet
  BURN: 2.3,         // fuel % per second of thrust at level 1
  REFUEL: 30,        // % per second while landed on a pad
  CAN: 35,           // a fuel canister
  SAFE_VY: 3.4,      // fastest safe touchdown (m/s down)
  SAFE_VH: 4.5,      // fastest safe sideways touchdown
  DROP_V: 2.2,       // the crate must be this slow to count as set down
};
export const burnFor = (level) => PHYS.BURN * Math.min(1.35, 1 + 0.022 * (level - 1)) * (level >= 3 ? 1.08 : 1);

export const CRATE_MASS = { normal: 0.5, heavy: 0.9, fragile: 0.4 };
export const crateKind = (level, k) => (level >= 12 && k % 2 === 1 ? 'fragile' : level >= 8 && k % 2 === 0 ? 'heavy' : 'normal');
/** Fuel (%) a careful pilot needs for one leg: climb over the highest rock on the straight line with the crate
 *  12 m clear, cruise at 13 m/s, fall then brake down to the pad, plus 6 s to hook up and set down. */
export function legFuel(ground, A, B, level, kind) {
  const D = Math.hypot(B.x - A.x, B.z - A.z), m = CRATE_MASS[kind];
  let top = -1e9;
  for (let s = 0; s <= 200; s++) { const t = s / 200; top = Math.max(top, ground(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t)); }
  const cruiseY = top + 12 + PHYS.CABLE + 2, duty = PHYS.G * (1 + m) / PHYS.THRUST;
  const aNet = (PHYS.THRUST * 0.95 / (1 + m) - PHYS.G);
  const climb = Math.max(0, cruiseY - A.y) + 8, drop = Math.max(0, cruiseY - B.y);
  const climbT = Math.sqrt(2 * climb / (aNet + aNet * aNet / PHYS.G)) * 1.4;
  const h1 = drop * aNet / (PHYS.G + aNet), brakeT = Math.sqrt(2 * PHYS.G * h1) / aNet * 1.3;
  const secs = (D / 13) * duty + climbT + brakeT + 6;
  return { fuel: secs * burnFor(level), cruiseY, D };
}

const BASE_NAMES = ['Tycho Depot', 'Copernicus', 'Kepler Station', 'Shackleton', 'Tranquility', 'Aitken Works', 'Plato Labs', 'Clavius', 'Aristarchus', 'Mare Crisium', 'Hadley Rille', 'Grimaldi', 'Endymion', 'Petavius', 'Langrenus'];

export const isNight = (level, bonus) => !bonus && level >= 11 && level % 2 === 1;
export const deliveriesFor = (level) => (level <= 1 ? 1 : level <= 3 ? 2 : level <= 9 ? 3 : 4);
export const legLength = (level) => Math.min(150 + 14 * (level - 1), 360);

/** Build the world for one level. Everything comes from `seed` (the engine's seeded rng), so the Daily Challenge is the same for everyone. */
export function buildWorld({ level, bonus, seed }) {
  const rand = rngFrom(seed);
  const noise = makeNoise(rand), noise2 = makeNoise(rand);
  const L = level;
  const h = new Float32Array(N * N);
  const roll = bonus ? 6 : 9 + Math.min(L, 12) * 0.6;
  const ridgeAmp = bonus ? 0 : L >= 4 ? Math.min(10 + 4.2 * (L - 3), 50) : 0;

  // 1. rolling ground + ridges
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * CELL - HALF, z = j * CELL - HALF;
    let y = 0, a = 1, f = 1 / 110;
    for (let o = 0; o < 4; o++) { y += (noise(x * f + 31.7 * o, z * f - 17.3 * o) - 0.5) * a; a *= 0.48; f *= 2.1; }
    y *= roll * 2.2;
    if (ridgeAmp) {
      const r = 1 - Math.abs(noise2(x / 140, z / 140) * 2 - 1);
      y += Math.pow(r, 3) * ridgeAmp;
    }
    h[j * N + i] = y;
  }
  // 2. craters
  const craters = [];
  const nCr = bonus ? 10 : 16 + Math.min(L, 15);
  for (let k = 0; k < nCr; k++) {
    const r = 7 + Math.pow(rand(), 2.2) * 58;
    craters.push({ x: (rand() * 2 - 1) * HALF, z: (rand() * 2 - 1) * HALF, r, d: r * (0.22 + rand() * 0.1) });
  }
  for (const c of craters) {
    const reach = c.r * 1.7;
    const i0 = Math.max(0, Math.floor((c.x - reach + HALF) / CELL)), i1 = Math.min(GRID, Math.ceil((c.x + reach + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((c.z - reach + HALF) / CELL)), j1 = Math.min(GRID, Math.ceil((c.z + reach + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * CELL - HALF, z = j * CELL - HALF, q = Math.hypot(x - c.x, z - c.z) / c.r;
      let dy = 0;
      if (q < 1) dy -= c.d * (1 - q * q);
      dy += c.d * 0.38 * Math.exp(-(((q - 1) / 0.28) ** 2));
      h[j * N + i] += dy;
    }
  }

  const W = { level, bonus, seed, h, craters, pads: [], domes: [], masts: [], tubes: [], dust: [], fuel: [], geysers: [], night: isNight(level, bonus) };
  W.ground = (x, z) => groundAt(h, x, z);

  // 3. pads
  const pick = BASE_NAMES.slice();
  const name = () => pick.splice(Math.floor(rand() * pick.length), 1)[0] || 'Outpost';
  if (bonus) {
    W.pads.push({ x: 0, z: 0, name: 'Stardust Mesa' });
  } else {
    const count = deliveriesFor(L) + 1, lim = LIMIT - 40;
    let base = legLength(L);
    for (let tries = 0; tries < 20 && W.pads.length < count; tries++) {
      W.pads = [{ x: (rand() * 2 - 1) * lim * 0.4, z: (rand() * 2 - 1) * lim * 0.4 }];
      let heading = rand() * TAU;
      for (let k = 1; k < count; k++) {
        let ok = null;
        for (let a = 0; a < 90 && !ok; a++) {
          const ang = heading + (rand() - 0.5) * (a < 40 ? 2.4 : TAU), d = base * (0.85 + rand() * 0.3);
          const p = W.pads[k - 1], cand = { x: p.x + Math.sin(ang) * d, z: p.z + Math.cos(ang) * d };
          if (Math.abs(cand.x) > lim || Math.abs(cand.z) > lim) continue;
          if (W.pads.some((q) => Math.hypot(q.x - cand.x, q.z - cand.z) < 110)) continue;
          ok = cand; heading = ang;
        }
        if (!ok) break;
        W.pads.push(ok);
      }
      if (W.pads.length < count) { W.pads = []; base *= 0.92; }
    }
    W.pads[0].name = 'Tycho Depot';
    for (let k = 1; k < W.pads.length; k++) W.pads[k].name = name();
  }
  // flatten the ground under each pad (a little plateau that blends out)
  for (const p of W.pads) {
    let sum = 0, n = 0;
    for (let a = 0; a < 16; a++) for (const r of [0, 6, 12]) { sum += groundAt(h, p.x + Math.sin(a / 16 * TAU) * r, p.z + Math.cos(a / 16 * TAU) * r); n++; }
    p.y = sum / n + 0.6;
    const r0 = 28, r1 = 44;
    const i0 = Math.max(0, Math.floor((p.x - r1 + HALF) / CELL)), i1 = Math.min(GRID, Math.ceil((p.x + r1 + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((p.z - r1 + HALF) / CELL)), j1 = Math.min(GRID, Math.ceil((p.z + r1 + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * CELL - HALF, z = j * CELL - HALF, d = Math.hypot(x - p.x, z - p.z);
      if (d > r1) continue;
      const k = d <= r0 ? 1 : 1 - (d - r0) / (r1 - r0), s = k * k * (3 - 2 * k);
      h[j * N + i] = h[j * N + i] * (1 - s) + p.y * s;
    }
  }
  // base buildings round every pad, kept out of the approach lines
  W.pads.forEach((p, k) => {
    const away = [];
    if (k > 0) away.push(Math.atan2(W.pads[k - 1].x - p.x, W.pads[k - 1].z - p.z));
    if (k < W.pads.length - 1) away.push(Math.atan2(W.pads[k + 1].x - p.x, W.pads[k + 1].z - p.z));
    const free = (ang) => away.every((b) => Math.abs(Math.atan2(Math.sin(ang - b), Math.cos(ang - b))) > 1.0);
    const angs = [];
    for (let a = 0; a < 40 && angs.length < 3; a++) {
      const ang = rand() * TAU;
      if (free(ang) && angs.every((b) => Math.abs(Math.atan2(Math.sin(ang - b), Math.cos(ang - b))) > 0.9)) angs.push(ang);
    }
    angs.forEach((ang, n) => {
      if (n === 0) { const r = 5.5 + rand() * 1.5, d = 19; W.domes.push({ x: p.x + Math.sin(ang) * d, z: p.z + Math.cos(ang) * d, y: p.y - 0.3, r, pad: k }); }
      else if (n === 1) { const d = 16; W.masts.push({ x: p.x + Math.sin(ang) * d, z: p.z + Math.cos(ang) * d, y: p.y - 0.3, h: 13 + rand() * 5, pad: k }); }
      else { const d = 21, r = 4 + rand(); W.domes.push({ x: p.x + Math.sin(ang) * d, z: p.z + Math.cos(ang) * d, y: p.y - 0.3, r, pad: k }); }
    });
    // a habitat tube joining the dome to the pad's edge
    const dm = W.domes.find((d) => d.pad === k);
    if (dm) W.tubes.push({ x0: p.x + (dm.x - p.x) * 0.55, z0: p.z + (dm.z - p.z) * 0.55, x1: dm.x, z1: dm.z, y: p.y + 0.6, r: 1.3 });
    p.cargo = { x: p.x + Math.sin(angs[0] ?? 0) * -CARGO_OFF, z: p.z + Math.cos(angs[0] ?? 0) * -CARGO_OFF };
  });

  // 4. things to collect and things in the way
  const top = (x, z) => Math.max(W.ground(x, z), -40);
  if (bonus) {
    // STARDUST STORM: rings of stars round the mesa at different heights
    for (let r = 0; r < 7; r++) {
      const ang = r / 7 * TAU, R = 70 + (r % 3) * 35, cx = Math.sin(ang) * R, cz = Math.cos(ang) * R;
      const gy = top(cx, cz) + 18 + (r % 4) * 9;
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU;
        W.dust.push({ x: cx + Math.cos(a) * 9 * Math.cos(ang), z: cz - Math.cos(a) * 9 * Math.sin(ang), y: gy + Math.sin(a) * 9, gold: k % 5 === 0 });
      }
    }
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * TAU * 2, R = 40 + k * 3;
      W.dust.push({ x: Math.sin(a) * R, z: Math.cos(a) * R, y: top(Math.sin(a) * R, Math.cos(a) * R) + 10 + k * 0.6 });
    }
  } else {
    for (let k = 0; k < W.pads.length - 1; k++) {
      const A = W.pads[k], B = W.pads[k + 1], dx = B.x - A.x, dz = B.z - A.z, D = Math.hypot(dx, dz);
      const sx = -dz / D, sz = dx / D, ph = rand() * TAU, swing = 6 + rand() * 8;
      const n = Math.floor(D / 13);
      for (let q = 0; q <= n; q++) {
        const t = 0.2 + 0.6 * q / n, off = Math.sin(t * TAU + ph) * swing;
        const x = A.x + dx * t + sx * off, z = A.z + dz * t + sz * off;
        W.dust.push({ x, z, y: top(x, z) + 13 + 7 * Math.sin(t * Math.PI) + (rand() - 0.5) * 3, gold: q === Math.floor(n / 2) });
      }
      if (L < 7 || k % 2 === 0) {
        const t = 0.45 + rand() * 0.1, off = (rand() < 0.5 ? -1 : 1) * (14 + rand() * 6);
        const x = A.x + dx * t + sx * off, z = A.z + dz * t + sz * off;
        W.fuel.push({ x, z, y: top(x, z) + 7, leg: k });
      }
      if (L >= 9) {
        const gn = L >= 13 ? 2 : 1;
        for (let g = 0; g < gn; g++) {
          const t = gn === 1 ? 0.5 : 0.36 + g * 0.28, off = (rand() - 0.5) * 8;
          const x = A.x + dx * t + sx * off, z = A.z + dz * t + sz * off;
          if (W.pads.some((P) => Math.hypot(P.x - x, P.z - z) < PAD_R + 14)) continue;
          W.geysers.push({ x, z, y: W.ground(x, z), ph: rand() * 5, period: 4.2 + rand() * 1.6 });
        }
      }
    }
  }
  // top up every leg with canisters until a careful pilot has 20% to spare (at most 5)
  if (!bonus) for (let k = 0; k < W.pads.length - 1; k++) {
    const A = W.pads[k], B = W.pads[k + 1], dx = B.x - A.x, dz = B.z - A.z, D = Math.hypot(dx, dz), sx = -dz / D, sz = dx / D;
    const need = legFuel(W.ground, A, B, L, crateKind(L, k)).fuel * 1.2;
    const onLeg = () => W.fuel.filter((f) => f.leg === k).length;
    const spots = [0.3, 0.7, 0.5, 0.15, 0.85, 0.4, 0.6];
    for (let n = 0; 100 + onLeg() * PHYS.CAN < need && onLeg() < 5 && n < spots.length; n++) {
      const t = spots[n] + (rand() - 0.5) * 0.06, off = (rand() < 0.5 ? -1 : 1) * (6 + rand() * 8);
      const x = A.x + dx * t + sx * off, z = A.z + dz * t + sz * off;
      if (W.fuel.some((f) => Math.hypot(f.x - x, f.z - z) < 22)) continue;
      W.fuel.push({ x, z, y: top(x, z) + 9, leg: k });
    }
  }
  let maxY = -1e9; for (let i = 0; i < h.length; i++) maxY = Math.max(maxY, h[i]);
  W.maxY = maxY;
  W.ceiling = maxY + 75;
  return W;
}

/** exact height of the drawn triangles at (x, z) */
export function groundAt(h, x, z) {
  const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) {
    const cx = Math.max(0, Math.min(GRID - 1e-4, gx)), cz = Math.max(0, Math.min(GRID - 1e-4, gz));
    return groundAt(h, cx * CELL - HALF, cz * CELL - HALF);
  }
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const h00 = h[j * N + i], h10 = h[j * N + i + 1], h01 = h[(j + 1) * N + i], h11 = h[(j + 1) * N + i + 1];
  return fx > fz ? h00 + (h10 - h00) * fx + (h11 - h10) * fz : h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}

/** surface normal at (x, z) */
export function normalAt(W, x, z) {
  const e = 1.5, hx = W.ground(x + e, z) - W.ground(x - e, z), hz = W.ground(x, z + e) - W.ground(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  return [-hx / l, 2 * e / l, -hz / l];
}

/** Per-vertex sunlight (0 = in a crater's shadow, 1 = lit) by marching across the heightmap toward the sun. */
export function sunShade(W, sun) {
  const h = W.h, out = new Float32Array(N * N);
  const hl = Math.hypot(sun[0], sun[2]) || 1, dx = sun[0] / hl, dz = sun[2] / hl, rise = sun[1] / hl;
  if (sun[1] <= 0) return out;
  const step = CELL * 1.5;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x0 = i * CELL - HALF, z0 = j * CELL - HALF, y0 = h[j * N + i] + 0.4;
    let lit = 1;
    for (let s = 1; s < 70; s++) {
      const d = s * step, y = y0 + rise * d;
      if (y > W.maxY) break;
      const g = groundAt(h, x0 + dx * d, z0 + dz * d);
      if (g > y) { lit = Math.min(lit, Math.max(0, 1 - (g - y) / 2.5)); if (lit <= 0) break; }
    }
    out[j * N + i] = lit;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
//  3D car models and the little renderer that draws them (Turbo Rush 3D, Neon Drift 3D).
//  The road is classic "pseudo-3D", so each car is drawn as a real lit 3D
//  mesh anchored on the road: we see it from behind, a little from above,
//  and from the side when it's in another lane or on a bend.
//
//  Model units: x = -1..1 across the car, y up from the ground, z forward
//  from the rear bumper. Materials (face colour index into a palette):
//    0 paint · 1 dark trim · 2 glass · 3 tail lights (glow) · 4 chrome
//    5 tyres · 6 left indicator · 7 police blue (glow) · 8 stripe / accent
//    9 right indicator · 10 police red (glow)
// ─────────────────────────────────────────────────────────────
const GLOW = new Set([3, 6, 7, 9, 10]);

const mk = () => ({ v: [], f: [], lights: [] });
const V = (m, x, y, z) => (m.v.push([x, y, z]), m.v.length - 1);
const face = (m, idx, k) => m.f.push([...idx, k]);

/** axis-aligned box; k = material or { top, side, back, front, bottom } */
function box(m, x0, y0, z0, x1, y1, z1, k) {
  const K = typeof k === 'object' ? k : {};
  const d = typeof k === 'number' ? k : (K.side ?? 0);
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map((q) => V(m, ...q));
  face(m, [p[0], p[1], p[2], p[3]], K.back ?? d);      // rear (z0)
  face(m, [p[5], p[4], p[7], p[6]], K.front ?? d);     // front (z1)
  face(m, [p[3], p[2], p[6], p[7]], K.top ?? d);       // top
  face(m, [p[4], p[5], p[1], p[0]], K.bottom ?? d);    // bottom
  face(m, [p[1], p[5], p[6], p[2]], d);                // right
  face(m, [p[4], p[0], p[3], p[7]], d);                // left
}
/** mirror a box across x = 0 */
const box2 = (m, x0, y0, z0, x1, y1, z1, k) => { box(m, x0, y0, z0, x1, y1, z1, k); box(m, -x1, y0, z0, -x0, y1, z1, k); };

/** loft between cross-sections ({z, pts:[[x,y]…]}); mat(i, edge) picks each face's material */
function loft(m, secs, mat, { closed = true, capBack = null, capFront = null } = {}) {
  const idx = secs.map((s) => s.pts.map(([x, y]) => V(m, x, y, s.z)));
  const n = secs[0].pts.length, edges = closed ? n : n - 1;
  for (let i = 0; i < secs.length - 1; i++) for (let e = 0; e < edges; e++) {
    const a = e, b = (e + 1) % n;
    face(m, [idx[i][a], idx[i][b], idx[i + 1][b], idx[i + 1][a]], mat(i, e));
  }
  if (capBack != null) face(m, [...idx[0]].reverse(), capBack);
  if (capFront != null) face(m, idx[idx.length - 1], capFront);
}
/** wheel: a cylinder along x */
function wheel(m, x, y, z, r, w, n = 10) {
  const a = [], b = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n * Math.PI * 2;
    a.push(V(m, x - w / 2, y + Math.sin(t) * r, z + Math.cos(t) * r));
    b.push(V(m, x + w / 2, y + Math.sin(t) * r, z + Math.cos(t) * r));
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; face(m, [a[i], a[j], b[j], b[i]], 5); }
  const outer = x > 0 ? b : a, inner = x > 0 ? a : b;
  face(m, outer, 4); face(m, inner, 5);
  // a dark hub so the rim reads as a wheel
  const hub = [];
  const hx = x + (x > 0 ? w / 2 + 0.005 : -w / 2 - 0.005);
  for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; hub.push(V(m, hx, y + Math.sin(t) * r * 0.35, z + Math.cos(t) * r * 0.35)); }
  face(m, hub, 1);
}
const sec = (z, hw, yb, ys, yt, tw) => ({ z, pts: [[-hw * 0.96, yb], [-hw, ys], [-tw, yt], [tw, yt], [hw, ys], [hw * 0.96, yb]] });
const cab = (z, bw, yb, tw, yt) => ({ z, pts: [[-bw, yb], [-tw, yt], [tw, yt], [bw, yb]] });
const bodyMat = (i, e) => (e === 5 ? 1 : 0);

// tail-light / indicator anchor points used for the glow halos
const lightsAt = (m, y, x, kind = 'tail') => { m.lights.push({ p: [-x, y, -0.04], kind }, { p: [x, y, -0.04], kind }); };

/** The player's sports car (also the rival's). */
export const SPORTS = (() => {
  const m = mk();
  loft(m, [
    sec(0.0, 0.92, 0.26, 0.62, 0.74, 0.78),
    sec(0.12, 0.98, 0.2, 0.63, 0.79, 0.85),
    sec(1.2, 1.0, 0.18, 0.62, 0.8, 0.87),
    sec(2.8, 1.0, 0.18, 0.56, 0.7, 0.86),
    sec(3.55, 0.95, 0.2, 0.46, 0.56, 0.8),
    sec(3.9, 0.84, 0.24, 0.36, 0.42, 0.62),
  ], bodyMat, { capBack: 0, capFront: 0 });
  loft(m, [cab(0.62, 0.78, 0.78, 0.74, 0.8), cab(1.3, 0.8, 0.78, 0.6, 1.14), cab(2.3, 0.82, 0.74, 0.62, 1.16), cab(2.95, 0.84, 0.7, 0.74, 0.71)],
    (i, e) => (e === 1 ? (i === 1 ? 0 : 2) : 2), { closed: false });
  box2(m, 0.5, 0.48, -0.04, 0.93, 0.62, 0.02, 3);                    // tail lights
  box(m, -0.5, 0.54, -0.035, 0.5, 0.58, 0.02, 3);                    // light bar
  box2(m, 0.93, 0.4, -0.03, 0.99, 0.5, 0.06, 6);                     // indicators (left/right set below)
  for (let i = m.f.length - 12; i < m.f.length - 6; i++) m.f[i][m.f[i].length - 1] = 9;   // +x box = right indicator
  box(m, -0.9, 0.12, -0.07, 0.9, 0.3, 0.1, 1);                       // diffuser
  box2(m, 0.32, 0.16, -0.12, 0.48, 0.26, 0.0, 4);                    // twin exhausts
  box(m, -0.24, 0.32, -0.045, 0.24, 0.44, 0.0, 4);                   // number plate
  box2(m, 0.06, 0.3, -0.03, 0.17, 0.74, 0.0, 8);                     // stripes on the rear panel
  box2(m, 0.52, 0.76, 0.12, 0.6, 0.96, 0.3, 1);                      // spoiler posts
  box(m, -0.96, 0.95, 0.0, 0.96, 1.01, 0.42, { side: 0, top: 0, back: 8 });   // wing
  box2(m, 0.97, 0.66, 2.55, 1.06, 0.74, 2.7, 0);                     // mirrors
  for (const z of [0.82, 3.0]) for (const x of [-0.9, 0.9]) wheel(m, x, 0.33, z, 0.33, 0.24);
  lightsAt(m, 0.55, 0.72);
  m.lights.push({ p: [-0.97, 0.45, 0], kind: 'indL' }, { p: [0.97, 0.45, 0], kind: 'indR' });
  m.len = 3.9; m.exhaust = [[-0.4, 0.21, -0.12], [0.4, 0.21, -0.12]];
  return m;
})();

/** A family saloon. */
export const SEDAN = (() => {
  const m = mk();
  loft(m, [
    sec(0.0, 0.94, 0.28, 0.62, 0.74, 0.82),
    sec(0.15, 1.0, 0.22, 0.64, 0.78, 0.88),
    sec(3.0, 1.0, 0.22, 0.62, 0.74, 0.88),
    sec(3.75, 0.96, 0.24, 0.52, 0.62, 0.82),
    sec(4.05, 0.88, 0.28, 0.42, 0.48, 0.7),
  ], bodyMat, { capBack: 0, capFront: 0 });
  loft(m, [cab(0.45, 0.82, 0.76, 0.8, 0.78), cab(1.05, 0.84, 0.76, 0.7, 1.28), cab(2.45, 0.86, 0.74, 0.7, 1.3), cab(3.1, 0.88, 0.72, 0.84, 0.74)],
    (i, e) => (e === 1 ? (i === 1 ? 0 : 2) : 2), { closed: false });
  box2(m, 0.58, 0.5, -0.04, 0.94, 0.66, 0.02, 3);
  box2(m, 0.94, 0.42, -0.03, 1.0, 0.52, 0.06, 6);
  for (let i = m.f.length - 12; i < m.f.length - 6; i++) m.f[i][m.f[i].length - 1] = 9;
  box(m, -0.96, 0.16, -0.07, 0.96, 0.32, 0.12, 4);                   // chrome bumper
  box(m, -0.26, 0.38, -0.045, 0.26, 0.5, 0.0, 4);
  box(m, -0.56, 0.7, -0.03, 0.56, 0.74, 0.0, 4);                     // boot trim
  for (const z of [0.85, 3.25]) for (const x of [-0.9, 0.9]) wheel(m, x, 0.32, z, 0.32, 0.22);
  lightsAt(m, 0.58, 0.76);
  m.lights.push({ p: [-0.99, 0.47, 0], kind: 'indL' }, { p: [0.99, 0.47, 0], kind: 'indR' });
  m.len = 4.05;
  return m;
})();

/** A tall SUV / hatchback — harder to see past. */
export const SUV = (() => {
  const m = mk();
  loft(m, [
    sec(0.0, 0.94, 0.36, 0.78, 0.9, 0.84),
    sec(0.12, 1.0, 0.3, 0.8, 0.94, 0.9),
    sec(3.3, 1.0, 0.3, 0.76, 0.88, 0.9),
    sec(3.95, 0.94, 0.32, 0.64, 0.76, 0.82),
  ], bodyMat, { capBack: 0, capFront: 0 });
  loft(m, [cab(0.08, 0.88, 0.92, 0.82, 0.94), cab(0.3, 0.9, 0.92, 0.8, 1.62), cab(2.7, 0.9, 0.9, 0.8, 1.62), cab(3.35, 0.9, 0.88, 0.86, 0.9)],
    (i, e) => (e === 1 ? (i === 1 ? 0 : 2) : 2), { closed: false });
  box2(m, 0.62, 0.62, -0.04, 0.95, 0.9, 0.02, 3);
  box2(m, 0.95, 0.52, -0.03, 1.0, 0.62, 0.06, 6);
  for (let i = m.f.length - 12; i < m.f.length - 6; i++) m.f[i][m.f[i].length - 1] = 9;
  box(m, -0.96, 0.2, -0.08, 0.96, 0.4, 0.12, 1);
  box(m, -0.26, 0.46, -0.045, 0.26, 0.58, 0.0, 4);
  box2(m, 0.55, 1.62, 0.5, 0.62, 1.68, 2.6, 4);                      // roof rails
  box(m, -0.3, 0.98, -0.12, 0.3, 1.38, -0.0, 5);                     // spare wheel
  for (const z of [0.8, 3.15]) for (const x of [-0.9, 0.9]) wheel(m, x, 0.38, z, 0.38, 0.26);
  lightsAt(m, 0.76, 0.8);
  m.lights.push({ p: [-0.99, 0.57, 0], kind: 'indL' }, { p: [0.99, 0.57, 0], kind: 'indR' });
  m.len = 3.95;
  return m;
})();

/** An articulated lorry — wide, tall and slow. Width units are the truck's own (it is drawn wider). */
export const TRUCK = (() => {
  const m = mk();
  box(m, -1, 0.42, 0.0, 1, 2.5, 5.6, { side: 0, top: 4, back: 4, front: 4 });     // trailer
  box2(m, 0.0, 0.48, -0.03, 0.03, 2.44, 0.0, 1);                                   // door seam
  box2(m, 0.3, 0.9, -0.05, 0.36, 2.0, 0.0, 1);                                     // door bars
  box2(m, 0.62, 0.9, -0.05, 0.68, 2.0, 0.0, 1);
  box(m, -1.01, 1.28, 0.0, 1.01, 1.46, 5.6, { side: 8, top: 4, back: 8, front: 4 }); // company stripe
  box(m, -0.92, 0.2, -0.1, 0.92, 0.34, 0.1, 1);                                    // under-run bar
  box2(m, 0.62, 0.3, -0.05, 0.92, 0.42, 0.02, 3);                                  // tail lights
  box2(m, 0.92, 0.3, -0.04, 0.99, 0.42, 0.03, 6);
  for (let i = m.f.length - 12; i < m.f.length - 6; i++) m.f[i][m.f[i].length - 1] = 9;
  box2(m, 0.7, 0.15, 0.1, 0.95, 0.42, 0.14, 1);                                    // mud flaps
  box(m, -0.95, 2.5, 5.6, 0.95, 2.62, 5.75, 1);
  for (const z of [0.6, 1.45]) for (const x of [-0.82, 0.82]) wheel(m, x, 0.32, z, 0.32, 0.34);
  m.lights.push({ p: [-0.77, 0.36, -0.06], kind: 'tail' }, { p: [0.77, 0.36, -0.06], kind: 'tail' }, { p: [-0.96, 0.36, -0.05], kind: 'indL' }, { p: [0.96, 0.36, -0.05], kind: 'indR' });
  m.len = 5.6;
  return m;
})();

/** Police interceptor: a saloon with a light bar. */
export const POLICE = (() => {
  const m = mk();
  m.v = SEDAN.v.map((p) => [...p]); m.f = SEDAN.f.map((f) => [...f]); m.lights = SEDAN.lights.map((l) => ({ ...l }));
  // the boot and doors get the white accent
  box2(m, 0.995, 0.36, 0.9, 1.01, 0.6, 3.0, 8);
  box(m, -0.5, 1.3, 1.5, 0.5, 1.33, 2.0, 1);
  box(m, -0.5, 1.33, 1.55, 0.0, 1.45, 1.95, 7);                      // light bar (blue · red)
  box(m, 0.0, 1.33, 1.55, 0.5, 1.45, 1.95, 10);
  m.lights.push({ p: [-0.26, 1.42, 1.5], kind: 'blue' }, { p: [0.26, 1.42, 1.5], kind: 'red' });
  m.len = SEDAN.len;
  return m;
})();

// ── Renderer ─────────────────────────────────────────────────
const cache = new Map();
export const rgb = (h) => { let c = cache.get(h); if (!c) { c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; cache.set(h, c); } return c; };
const LX = 0.32, LY = 0.82, LZ = -0.47;                         // light: above and a little behind the viewer

/**
 * Draw a car.
 *   o.x, o.y   screen anchor (rear bumper, road level)
 *   o.ppu      pixels per model unit (half the car's width on screen)
 *   o.yaw      the car's heading relative to the view (radians, + turns right)
 *   o.pitch    how far we look down on it (radians)
 *   o.roll     body lean
 *   o.pal      palette (array of hex colours by material)
 *   o.fog      [rgb, amount] colour to fade towards
 *   o.amb      ambient light (lower at night)
 *   o.lights   { brake, indL, indR, siren } → which lamps are lit
 *   o.halo     0..1 strength of light halos (night / rain / tunnels)
 */
export function drawCar(ctx, mesh, o) {
  const { x: ax, y: ay, ppu, pal } = o;
  const yaw = o.yaw || 0, pitch = o.pitch || 0, roll = o.roll || 0, amb = o.amb ?? 0.42;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const zc = mesh.len / 2, persp = o.persp || 0;
  const T = (x, y, z) => {
    // roll about the car's centre line, yaw about its middle, then look down at it
    let X = x * cr - (y - 0.5) * sr, Y = (y - 0.5) * cr + x * sr + 0.5;
    const zz = z - zc; let Z = zz * cy - X * sy; X = X * cy + zz * sy; Z += zc;
    const Y2 = Y * cp + Z * sp, Z2 = Z * cp - Y * sp;
    const f = 1 / (1 + Z2 * persp);
    return [ax + X * ppu * f, ay - Y2 * ppu * f, Z2];
  };
  const P = mesh.v.map(([x, y, z]) => T(x, y, z));
  const L = o.lights || {};
  const glowCol = (k) => {
    if (k === 3) return L.brake ? '#ff2a45' : pal[3];
    if (k === 6) return L.indL ? '#fbbf24' : '#6b3e08';
    if (k === 9) return L.indR ? '#fbbf24' : '#6b3e08';
    if (k === 7) return L.siren === 1 ? '#60a5fa' : '#1e3a8a';
    if (k === 10) return L.siren === 2 ? '#f87171' : '#7f1d1d';
    return pal[k];
  };
  const faces = [];
  for (const f of mesh.f) {
    const n = f.length - 1, k = f[n];
    let zs = 0; for (let i = 0; i < n; i++) zs += P[f[i]][2];
    // screen-space normal (for shading): cross of two edges in the rotated model
    const a = P[f[0]], b = P[f[1]], c = P[f[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = (b[2] - a[2]) * ppu, wx = c[0] - a[0], wy = c[1] - a[1], wz = (c[2] - a[2]) * ppu;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    faces.push({ f, n, k, z: zs / n, d: Math.abs(nx * LX - ny * LY + nz * LZ), up: Math.abs(ny) });
  }
  faces.sort((p, q) => q.z - p.z);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineJoin = 'round'; ctx.lineWidth = ppu > 30 ? 0.7 : 0.5;
  const fog = o.fog;
  for (const fc of faces) {
    const k = fc.k;
    let col = rgb(glowCol(k));
    if (!GLOW.has(k)) {
      const lit = amb + (1 - amb) * fc.d;
      const spec = (k === 2 || k === 4) ? Math.pow(fc.up, 6) * 110 : k === 0 ? Math.pow(fc.d, 14) * 70 : 0;
      col = [Math.min(255, col[0] * lit + spec), Math.min(255, col[1] * lit + spec), Math.min(255, col[2] * lit + spec)];
    }
    if (fog && fog[1] > 0) col = [col[0] + (fog[0][0] - col[0]) * fog[1], col[1] + (fog[0][1] - col[1]) * fog[1], col[2] + (fog[0][2] - col[2]) * fog[1]];
    ctx.fillStyle = ctx.strokeStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
    ctx.beginPath();
    const f = fc.f; ctx.moveTo(P[f[0]][0], P[f[0]][1]);
    for (let i = 1; i < fc.n; i++) ctx.lineTo(P[f[i]][0], P[f[i]][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // light halos
  const halo = o.halo || 0;
  if (halo > 0 && ppu > 6) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of mesh.lights) {
      let col = null, r = ppu * 0.5;
      if (l.kind === 'tail') col = L.brake ? '#ff2846' : '#f43f5e';
      else if (l.kind === 'indL' && L.indL) col = '#fbbf24';
      else if (l.kind === 'indR' && L.indR) col = '#fbbf24';
      else if (l.kind === 'blue' && L.siren === 1) { col = '#60a5fa'; r = ppu * 1.4; }
      else if (l.kind === 'red' && L.siren === 2) { col = '#f87171'; r = ppu * 1.4; }
      if (!col) continue;
      const q = T(...l.p), a = halo * (L.brake && l.kind === 'tail' ? 0.75 : 0.5);
      if (o.glow) o.glow(ctx, q[0], q[1], r, col, a);
    }
  }
  ctx.restore();
  return T;
}

/** Palettes */
export function palette(paint, { stripe = '#f8fafc', glass = '#0f172a', tail = '#e11d48', dark = '#111827' } = {}) {
  return [paint, dark, glass, tail, '#cbd5e1', '#0b0f19', '#6b3e08', '#1e3a8a', stripe, '#6b3e08', '#7f1d1d'];
}

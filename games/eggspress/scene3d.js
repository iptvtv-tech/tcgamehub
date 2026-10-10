// ─────────────────────────────────────────────────────────────
//  EGGSPRESS 3D — the 3D look. The physics are 2D (x along the road, y down);
//  this file adds depth: the road has width (z), and a perspective camera looks
//  at it from the side and a little above, so hills, trees and the truck are
//  all solid, lit 3D shapes. Everything is drawn in code.
// ─────────────────────────────────────────────────────────────
export const RW = 70;          // half the road's width
const LIGHT = (() => { const l = [-0.45, -0.75, -0.5], n = Math.hypot(...l); return l.map((v) => v / n); })();
const HALF = (() => { const h = [LIGHT[0], LIGHT[1], LIGHT[2] - 1], n = Math.hypot(...h); return h.map((v) => v / n); })();
const cache = new Map();
export const rgb = (h) => { if (!cache.has(h)) cache.set(h, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); return cache.get(h); };
export const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
export const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ── Meshes ───────────────────────────────────────────────────
const mk = () => ({ v: [], f: [] });
const V = (m, p) => (m.v.push(p), m.v.length - 1);
const tri = (m, a, b, c, k) => m.f.push([a, b, c, k]);
const quad = (m, a, b, c, d, k) => { tri(m, a, b, c, k); tri(m, a, c, d, k); };
/** box from [x0,y0,z0] to [x1,y1,z1]; mats [top, side, front/back] */
function box(m, [x0, y0, z0], [x1, y1, z1], k, top = k, end = k) {
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map((q) => V(m, q));
  quad(m, p[0], p[1], p[2], p[3], k); quad(m, p[5], p[4], p[7], p[6], k);   // near / far sides
  quad(m, p[4], p[5], p[1], p[0], top); quad(m, p[3], p[2], p[6], p[7], k); // top / bottom (y is down)
  quad(m, p[1], p[5], p[6], p[2], end); quad(m, p[4], p[0], p[3], p[7], end);
}
/** a cylinder along z: centre (cx,cy), radius r, from z0 to z1, n sides */
function cyl(m, cx, cy, r, z0, z1, n, side, cap) {
  const a = [], b = [];
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push(V(m, [cx + Math.cos(t) * r, cy + Math.sin(t) * r, z0])); b.push(V(m, [cx + Math.cos(t) * r, cy + Math.sin(t) * r, z1])); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, a[i], a[j], b[j], b[i], typeof side === 'function' ? side(i) : side); }
  const ca = V(m, [cx, cy, z0]), cb = V(m, [cx, cy, z1]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(m, a[j], a[i], ca, typeof cap === 'function' ? cap(i) : cap); tri(m, b[i], b[j], cb, typeof cap === 'function' ? cap(i) : cap); }
}
/** rings around the y axis: [[y, r]] */
function latheY(m, rings, n, k, { sx = 1, sz = 1, off = [0, 0, 0] } = {}) {
  const idx = rings.map(([y, r]) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return V(m, [off[0] + Math.cos(t) * r * sx, off[1] + y, off[2] + Math.sin(t) * r * sz]); }));
  const K = typeof k === 'function' ? k : () => k;
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, idx[r][i], idx[r][j], idx[r + 1][j], idx[r + 1][i], K(r, i)); }
  return idx;
}

/** The truck (local coords: x forward, y down, z depth). mats: 0 paint · 1 dark · 2 glass · 3 lights · 4 chrome */
export const TRUCK = (() => {
  const m = mk();
  box(m, [-47, 3, -24], [47, 9, 24], 1);                     // chassis
  box(m, [-45, -12, -22], [20, 3, 22], 0);                   // bed + body
  box(m, [-45.5, -4, -22.5], [44.5, -2, 22.5], 4, 4, 4);       // chrome stripe
  box(m, [20, -27, -21], [44, 3, 21], 0);                    // cab
  box(m, [24, -25, -21.5], [41, -14, 21.5], 2, 0, 2);        // side windows
  box(m, [41, -25, -18], [44.6, -14, 18], 2);                // windscreen
  box(m, [44, -6, -20], [48, 2, 20], 4);                     // front bumper
  box(m, [-49, -6, -20], [-45, 2, 20], 4);                   // back bumper
  box(m, [45.5, -11, -19], [47.5, -6, -12], 3); box(m, [45.5, -11, 12], [47.5, -6, 19], 3);   // headlights
  box(m, [-47.5, -11, -19], [-45.5, -6, -13], 3); box(m, [-47.5, -11, 13], [-45.5, -6, 19], 3); // tail lights
  box(m, [-30, -16, -22], [-26, -12, 22], 4); box(m, [8, -16, -22], [12, -12, 22], 4);           // roll bars
  // the egg cup on the roof
  latheY(m, [[-12, 6], [-15, 15], [-18, 16.5], [-20, 17]], 10, (r) => (r === 2 ? 4 : 1));
  return m;
})();
export const WHEEL = (() => {
  const m = mk();
  cyl(m, 0, 0, 14, -5, 5, 14, (i) => (i % 2 ? 1 : 5), 1);
  cyl(m, 0, 0, 8, -5.6, 5.6, 7, 4, (i) => (i % 2 ? 4 : 6));
  return m;
})();
export const EGG = (() => {
  const m = mk(), rings = [];
  for (let i = 0; i <= 10; i++) { const t = -Math.PI / 2 + i / 10 * Math.PI, sn = Math.sin(t); rings.push([sn * 15 - 0.5, Math.max(0.01, Math.cos(t) * 11.5 * (sn < 0 ? 1 - 0.2 * -sn : 1))]); }
  latheY(m, rings, 12, 0);
  return m;
})();
export const PINE = (() => {
  const m = mk();
  latheY(m, [[0, 4], [-18, 4]], 6, 1);
  latheY(m, [[-14, 26], [-50, 0.01]], 7, 0);
  latheY(m, [[-38, 20], [-74, 0.01]], 7, 0);
  latheY(m, [[-60, 13], [-92, 0.01]], 7, 0);
  return m;
})();
export const OAK = (() => {
  const m = mk();
  latheY(m, [[0, 5], [-30, 4]], 6, 1);
  latheY(m, [[-24, 0.01], [-30, 22], [-46, 30], [-62, 24], [-72, 0.01]], 8, (r, i) => ((r + i) % 3 ? 0 : 2));
  return m;
})();
export const ROCK = (() => { const m = mk(); latheY(m, [[0, 22], [-10, 20], [-20, 12], [-26, 0.01]], 6, (r, i) => ((i + r) % 2 ? 0 : 1), { sz: 0.8 }); return m; })();
export const MUSHROOM = (() => {
  const m = mk();
  latheY(m, [[0, 9], [-24, 7]], 8, 1);
  latheY(m, [[-20, 24], [-28, 27], [-36, 22], [-42, 12], [-45, 0.01]], 12, (r, i) => (r === 1 && i % 3 === 0 ? 2 : 0));
  return m;
})();
export const BARN = (() => {
  const m = mk();
  box(m, [-90, -110, -60], [90, 0, 60], 0, 0, 0);
  // roof (a prism)
  const a = V(m, [-98, -110, -68]), b = V(m, [98, -110, -68]), c = V(m, [98, -110, 68]), d = V(m, [-98, -110, 68]), e = V(m, [-98, -170, 0]), f = V(m, [98, -170, 0]);
  quad(m, a, b, f, e, 1); quad(m, c, d, e, f, 1); tri(m, a, e, d, 0); tri(m, b, c, f, 0);
  box(m, [-30, -80, -62], [30, 0, -60], 2);                  // big doors
  box(m, [-34, -84, -63], [34, -80, -59], 3); box(m, [-2, -80, -63], [2, 0, -59], 3);
  return m;
})();
export const POST = (() => { const m = mk(); latheY(m, [[0, 4], [-120, 3]], 6, 0); return m; })();

/** Perspective camera looking along +z from the side, a little above the road. */
export class Cam {
  constructor(W, H) { this.W = W; this.H = H; this.f = 900 * W / 800; this.z = -640; this.x = 0; this.y = 0; this.cy = H * 0.3; }
  // the eye sits above the road; cy shifts the picture up so the truck sits mid-screen
  p(x, y, z) { const d = z - this.z; if (d < 20) return null; const k = this.f / d; return [this.W / 2 + (x - this.x) * k, this.cy + (y - this.y) * k, k]; }
}

/**
 * Draw a mesh: local (x,y,z) → rotated by `a` around z (the truck's tilt) → moved to pos.
 * pal: an array of hex colours indexed by face material.
 */
export function drawMesh(ctx, cam, mesh, pos, a, pal, { scale = 1, alpha = 1, rotY = 0, glowMat = 3, fog = null, amb = 0.38 } = {}) {
  const cs = Math.cos(a), sn = Math.sin(a), cy = Math.cos(rotY), sy = Math.sin(rotY);
  const pts = mesh.v.map(([x, y, z]) => {
    x *= scale; y *= scale; z *= scale;
    if (rotY) { const t = x * cy + z * sy; z = -x * sy + z * cy; x = t; }
    return [pos[0] + x * cs - y * sn, pos[1] + x * sn + y * cs, pos[2] + z];
  });
  const scr = pts.map((p) => cam.p(p[0], p[1], p[2]));
  if (scr.some((s) => !s)) return;
  const faces = [];
  for (const f of mesh.f) {
    const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const nl = Math.hypot(...n) || 1; n = n.map((v) => v / nl);
    faces.push({ f, z: (A[2] + B[2] + C[2]) / 3 + ((A[0] + B[0] + C[0]) / 3 - cam.x) * 0 , d: Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), s: Math.pow(Math.abs(n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 20), up: -n[1] });
  }
  faces.sort((p, q) => q.z - p.z);
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineWidth = 0.6;
  for (const fc of faces) {
    const k = fc.f[3], base = rgb(pal[k] || pal[0]);
    let col;
    if (k === glowMat) col = base;
    else { const lit = amb + (1 - amb) * fc.d, sp = fc.s * (k === 2 || k === 4 ? 200 : 70); col = base.map((c) => Math.min(255, c * lit + sp)); }
    if (fog) col = mix(col, fog[0], fog[1]);
    ctx.fillStyle = ctx.strokeStyle = css(col);
    const a0 = scr[fc.f[0]], a1 = scr[fc.f[1]], a2 = scr[fc.f[2]];
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

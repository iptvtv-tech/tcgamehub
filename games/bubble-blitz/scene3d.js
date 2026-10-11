// ─────────────────────────────────────────────────────────────
//  BUBBLE BLITZ 3D — the 3D look. The game rules still run on the flat board
//  (x across, y down, 480 × 720) exactly as before; this file stands that board
//  up as a tilted table in 3D space and looks at it through a perspective camera
//  from just above and in front. Bubbles are lit glossy spheres sitting on the
//  table, the ceiling and side rails are solid lit blocks and the launcher is a
//  3D turret. Built on the same mesh + lighting code as Eggspress 3D / Star Strike 3D.
//  Everything is drawn in code.
// ─────────────────────────────────────────────────────────────
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
// one light for everything (up-left, towards the viewer) + a cool rim light from behind
export const LIGHT = norm([-0.45, -0.75, -0.5]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);
const RIM = norm([0.15, 0.35, 0.92]);
const cache = new Map();
export const rgb = (h) => { if (!cache.has(h)) cache.set(h, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); return cache.get(h); };
export const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
export const css = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

// ── Meshes (local coords: x across, y = −height above the table, z = up the table is −) ──
export const mk = () => ({ v: [], f: [] });
const V = (m, p) => (m.v.push(p), m.v.length - 1);
const tri = (m, a, b, c, k) => m.f.push([a, b, c, k]);
const quad = (m, a, b, c, d, k) => { tri(m, a, b, c, k); tri(m, a, c, d, k); };
/** box from [x0,y0,z0] to [x1,y1,z1]; mats: sides k, top `top`, ends `end` */
export function box(m, [x0, y0, z0], [x1, y1, z1], k, top = k, end = k) {
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map((q) => V(m, q));
  quad(m, p[0], p[1], p[2], p[3], end); quad(m, p[5], p[4], p[7], p[6], end);
  quad(m, p[4], p[5], p[1], p[0], top); quad(m, p[3], p[2], p[6], p[7], k);
  quad(m, p[1], p[5], p[6], p[2], k); quad(m, p[4], p[0], p[3], p[7], k);
}
/** a cylinder along z: centre (cx,cy), radius r, from z0 to z1, n sides */
export function cyl(m, cx, cy, r, z0, z1, n, side, cap) {
  const a = [], b = [];
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push(V(m, [cx + Math.cos(t) * r, cy + Math.sin(t) * r, z0])); b.push(V(m, [cx + Math.cos(t) * r, cy + Math.sin(t) * r, z1])); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, a[i], a[j], b[j], b[i], typeof side === 'function' ? side(i) : side); }
  const ca = V(m, [cx, cy, z0]), cb = V(m, [cx, cy, z1]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(m, a[j], a[i], ca, cap); tri(m, b[i], b[j], cb, cap); }
}
/** rings around the y (height) axis: [[y, r]] */
export function latheY(m, rings, n, k, off = [0, 0, 0]) {
  const idx = rings.map(([y, r]) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return V(m, [off[0] + Math.cos(t) * r, off[1] + y, off[2] + Math.sin(t) * r]); }));
  const K = typeof k === 'function' ? k : () => k;
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, idx[r][i], idx[r][j], idx[r + 1][j], idx[r + 1][i], K(r, i)); }
}

/** The launcher turret base. mats: 0 body · 1 dark · 2 trim · 3 glow */
export const TURRET = (() => {
  const m = mk();
  latheY(m, [[0, 46], [-6, 46], [-10, 42], [-16, 36], [-20, 28], [-22, 20]], 18, (r, i) => (r === 1 ? 2 : r === 0 ? 1 : i % 6 === 0 && r === 3 ? 3 : 0));
  latheY(m, [[-22, 20], [-22, 0.01]], 18, 1);                         // the hub the bubble sits in
  return m;
})();
/** The barrel (points up the table, along −z). Rotated to the aim each frame. */
export const BARREL = (() => {
  const m = mk();
  cyl(m, 0, -20, 11, -14, -60, 12, (i) => (i % 3 === 0 ? 2 : 0), 1);
  cyl(m, 0, -20, 13.5, -56, -66, 12, 2, 1);                           // muzzle ring
  box(m, [-4, -33, -20], [4, -30, -54], 3, 3, 3);                     // glowing sight strip on top
  return m;
})();
/** Little stand for the NEXT bubble. */
export const PEDESTAL = (() => { const m = mk(); latheY(m, [[0, 22], [-5, 22], [-8, 17], [-8, 0.01]], 14, (r) => (r === 0 ? 1 : r === 1 ? 2 : 0)); return m; })();

// ── The camera and the tilted table ──────────────────────────
export class TableCam {
  /** W,H: canvas size. pivot: board y that sits at the table's hinge. tilt: degrees the table leans back. */
  constructor(W, H, { pivot = 636, tilt = 26, dist = 900, centreY = 380, fitBottomY = H + 6, fitHalfWidth = 250 } = {}) {
    this.W = W; this.H = H; this.piv = pivot;
    const t = tilt * Math.PI / 180;
    this.c = Math.cos(t); this.s = Math.sin(t);
    this.camY = -(pivot - centreY) * this.c - dist * 0.35; this.camZ = -dist;
    const pb = this.world(0, H);
    this.f = fitHalfWidth / (W / 2) * (pb[2] - this.camZ);
    this.cy = 0; this.cy = fitBottomY - this.p(pb)[1];
  }
  /** board (x, y) + height above the table → world [X, Y, Z] (Y down, Z away from the viewer) */
  world(gx, gy, h = 0) { const b = this.piv - gy; return [gx - this.W / 2, -b * this.c - h * this.s, b * this.s - h * this.c]; }
  /** world → screen [x, y, scale] */
  p([X, Y, Z]) { const d = Z - this.camZ, k = this.f / d; return [this.W / 2 + X * k, this.cy + (Y - this.camY) * k, k]; }
  /** board point → screen [x, y, scale] */
  at(gx, gy, h = 0) { return this.p(this.world(gx, gy, h)); }
  /** screen point → the board point under it, at height h (used for aiming with the mouse / finger) */
  unproject(sx, sy, h = 0) {
    const { c, s, f } = this, dx = (sx - this.W / 2) / f, dy = (sy - this.cy) / f;
    const den = dy + c / s;
    const t = Math.abs(den) < 1e-6 ? 1e6 : (-(this.camZ + h * c) * c / s - h * s - this.camY) / den;
    const Z = this.camZ + t, b = (Z + h * c) / s;
    return [t * dx + this.W / 2, this.piv - b];
  }
}

/**
 * Draw a set of meshes together, faces sorted far → near so they overlap correctly.
 * items: [{ mesh, xf(localVertex) → world, pal: [hex…], glow: mat drawn unlit, alpha }]
 */
export function drawMeshes(ctx, cam, items, { amb = 0.4 } = {}) {
  const faces = [];
  for (const it of items) {
    const pts = it.mesh.v.map(it.xf), scr = pts.map((q) => cam.p(q));
    for (const f of it.mesh.f) {
      const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]];
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
      const dz = (A[2] + B[2] + C[2]) / 3 - cam.camZ, dyy = (A[1] + B[1] + C[1]) / 3 - cam.camY;
      faces.push({ it, f, scr, z: dz * dz + dyy * dyy,
        d: Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]),
        sp: Math.pow(Math.abs(n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 20),
        rim: Math.pow(Math.max(0, n[0] * RIM[0] + n[1] * RIM[1] + n[2] * RIM[2]), 2.5) });
    }
  }
  faces.sort((p, q) => q.z - p.z);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 0.6;
  for (const fc of faces) {
    const k = fc.f[3], it = fc.it, base = rgb(it.pal[k] || it.pal[0]);
    let col;
    if (k === (it.glow ?? 3)) col = base;
    else { const lit = amb + (1 - amb) * fc.d, sp = fc.sp * (k === 2 ? 190 : 70), rim = fc.rim * 40; col = base.map((v, ci) => Math.min(255, v * lit + sp + rim * [0.75, 0.85, 1][ci])); }
    ctx.globalAlpha = it.alpha ?? 1;
    ctx.fillStyle = ctx.strokeStyle = css(col);
    const a0 = fc.scr[fc.f[0]], a1 = fc.scr[fc.f[1]], a2 = fc.scr[fc.f[2]];
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ── Sphere sprites: every bubble is a real lit sphere, shaded per pixel once and reused ──
const SPR = 96;                                         // sprite size in pixels (sharp on phones)
function sphere(shade) {
  const cv = document.createElement('canvas'); cv.width = cv.height = SPR;
  const g = cv.getContext('2d'), img = g.createImageData(SPR, SPR), d = img.data, r = SPR / 2 - 1;
  for (let py = 0; py < SPR; py++) for (let px = 0; px < SPR; px++) {
    const nx = (px + 0.5 - SPR / 2) / r, ny = (py + 0.5 - SPR / 2) / r, q = nx * nx + ny * ny;
    if (q > 1) continue;
    const nz = -Math.sqrt(1 - q);                       // facing the camera
    const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);   // LIGHT points towards the light
    const hd = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
    const spec = Math.pow(hd, 60) + Math.pow(hd, 9) * 0.22;      // sharp highlight + soft gloss
    const rim = Math.pow(Math.max(0, nx * RIM[0] + ny * RIM[1] + nz * RIM[2] + 0.35), 2) * 0.6 + Math.pow(1 - Math.abs(nz), 3) * 0.35;
    const [cr, cg, cb, ca] = shade(diff, spec, rim, nx, ny);
    const edge = Math.min(1, (1 - Math.sqrt(q)) * r * 0.9);   // soft anti-aliased edge
    const i = (py * SPR + px) * 4;
    d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = ca * edge;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
/** A glossy coloured bubble: bright colour in the light, deep shade on the dark side, white highlight, cool rim. */
export function bubbleSprite(hex, shadeHex) {
  const C = rgb(hex), S = rgb(shadeHex);
  return sphere((diff, spec, rim) => {
    const k = Math.min(1, 0.28 + diff * 1.0);
    const base = mix(S, C, k);
    return [0, 1, 2].map((i) => Math.min(255, base[i] + spec * 255 + rim * [150, 190, 255][i] * 0.55)).concat(255);
  });
}
/** A rough grey stone. */
export function stoneSprite() {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = Array.from({ length: 64 }, () => rnd());
  return sphere((diff, spec, rim, nx, ny) => {
    const nn = noise[(Math.floor((nx + 1) * 4) + Math.floor((ny + 1) * 4) * 8) & 63];
    const v = 70 + diff * 140 + nn * 28 + spec * 40;
    return [v * 0.92, v * 0.97, v * 1.05].map((x) => Math.min(255, x)).concat(255);
  });
}
/** Lighting on its own (dark side + highlight), laid over the spinning rainbow bubble. */
export function shadingSprite() {
  return sphere((diff, spec) => {
    const dark = Math.max(0, 0.75 - diff) * 0.75;
    const a = Math.max(dark, spec);
    const v = spec > dark ? 255 : 0;
    return [v, v, v, a * 255];
  });
}

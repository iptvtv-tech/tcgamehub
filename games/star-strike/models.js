// ─────────────────────────────────────────────────────────────
//  STAR STRIKE 3D — the low-poly models, built in code.
//  Every face has a material slot: 0 hull · 1 trim · 2 glass · 3 glow (lit up,
//  not shaded). Each ship picks its own four colours for those slots.
//  Models are built nose-forward (+z); enemies are flipped to face the player.
// ─────────────────────────────────────────────────────────────
const mk = () => ({ v: [], f: [] });
const V = (m, p) => (m.v.push(p), m.v.length - 1);
const tri = (m, a, b, c, mat) => m.f.push([a, b, c, mat]);
const quad = (m, a, b, c, d, mat) => { tri(m, a, b, c, mat); tri(m, a, c, d, mat); };

/** Rings along z: [[z, rx, ry]]. mat may be a number or (ringIndex, side) => number. */
function lathe(m, rings, n, mat, { off = [0, 0, 0], rot0 = Math.PI / n, capF, capB, skipF = false, skipB = false } = {}) {
  const M = typeof mat === 'function' ? mat : () => mat;
  capF ??= M(rings.length - 2, 0); capB ??= M(0, 0);
  const idx = rings.map(([z, rx, ry]) => Array.from({ length: n }, (_, i) => {
    const a = rot0 + i / n * Math.PI * 2;
    return V(m, [off[0] + Math.cos(a) * rx, off[1] + Math.sin(a) * ry, off[2] + z]);
  }));
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, idx[r][i], idx[r][j], idx[r + 1][j], idx[r + 1][i], M(r, i)); }
  const last = rings.length - 1;
  if (!skipF) { const c = V(m, [off[0], off[1], off[2] + rings[last][0]]); for (let i = 0; i < n; i++) tri(m, idx[last][i], idx[last][(i + 1) % n], c, capF); }
  if (!skipB) { const c = V(m, [off[0], off[1], off[2] + rings[0][0]]); for (let i = 0; i < n; i++) tri(m, idx[0][(i + 1) % n], idx[0][i], c, capB); }
}
/** A flat panel with thickness. axis 'y': outline is [x,z] at height c; axis 'x': outline is [y,z] at side c. */
function slab(m, pts, c, t, mat, axis = 'y', edge = mat) {
  const P = (u, w, h) => (axis === 'y' ? [u, c + h, w] : [c + h, u, w]);
  const top = pts.map(([u, w]) => V(m, P(u, w, t / 2))), bot = pts.map(([u, w]) => V(m, P(u, w, -t / 2)));
  for (let i = 1; i < pts.length - 1; i++) { tri(m, top[0], top[i], top[i + 1], mat); tri(m, bot[0], bot[i + 1], bot[i], mat); }
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; quad(m, top[i], top[j], bot[j], bot[i], edge); }
}
const mirror = (pts) => pts.map(([x, z]) => [-x, z]).reverse();
function flip(m) { m.v = m.v.map(([x, y, z]) => [-x, y, -z]); return m; }

// ── The player's starfighter ─────────────────────────────────
export const SHIP = (() => {
  const m = mk();
  lathe(m, [[-1.0, 0.2, 0.15], [-0.65, 0.3, 0.22], [0.15, 0.27, 0.2], [0.85, 0.13, 0.11], [1.4, 0.02, 0.02]], 6, (r) => (r === 1 ? 1 : 0), { capB: 3 });
  lathe(m, [[-0.15, 0.09, 0.07], [0.15, 0.12, 0.1], [0.55, 0.04, 0.04]], 6, 2, { off: [0, 0.17, 0.2] });
  const wing = [[0.25, 0.25], [1.25, -0.45], [1.32, -0.72], [0.28, -0.6]];
  slab(m, wing, -0.03, 0.06, 1, 'y', 0); slab(m, mirror(wing), -0.03, 0.06, 1, 'y', 0);
  for (const s of [-1, 1]) {
    lathe(m, [[-0.75, 0.045, 0.045], [0.45, 0.04, 0.04]], 5, 0, { off: [s * 1.28, -0.03, 0] });
    slab(m, [[0.08, -0.45], [0.48, -0.9], [0.5, -1.05], [0.1, -0.98]], s * 0.2, 0.04, 1, 'x', 0);
    lathe(m, [[-0.6, 0.1, 0.1], [-0.45, 0.14, 0.14], [0.2, 0.13, 0.13], [0.45, 0.05, 0.05]], 6, 0, { off: [s * 0.42, -0.06, -0.45], capB: 3 });
  }
  return m;
})();

// ── Enemies (built nose +z, then flipped to face you) ────────
export const INTERCEPTOR = (() => {
  const m = mk();
  lathe(m, [[-0.8, 0.18, 0.12], [-0.2, 0.26, 0.16], [0.6, 0.1, 0.08], [1.0, 0.02, 0.02]], 4, 0, { capB: 3, rot0: 0 });
  lathe(m, [[0.05, 0.08, 0.06], [0.4, 0.05, 0.05]], 4, 2, { off: [0, 0.12, 0] });
  const w = [[0.2, 0.2], [1.1, 0.55], [1.15, 0.3], [0.25, -0.5]];
  slab(m, w, 0, 0.05, 1, 'y', 0); slab(m, mirror(w), 0, 0.05, 1, 'y', 0);
  for (const s of [-1, 1]) slab(m, [[0.05, -0.2], [0.42, -0.6], [0.42, -0.75], [0.05, -0.7]], s * 0.5, 0.04, 1, 'x', 0);
  return flip(m);
})();

export const SWARMER = (() => {
  const m = mk();
  lathe(m, [[-0.45, 0.001, 0.001], [0, 0.32, 0.32], [0.45, 0.001, 0.001]], 6, (r, i) => (i % 2 ? 0 : 1), { skipF: true, skipB: true });
  for (const a of [0, 1, 2, 3]) {
    const c = Math.cos(a * Math.PI / 2), s = Math.sin(a * Math.PI / 2);
    const tip = V(m, [c * 0.75, s * 0.75, -0.1]), b1 = V(m, [c * 0.25 - s * 0.08, s * 0.25 + c * 0.08, 0.1]), b2 = V(m, [c * 0.25 + s * 0.08, s * 0.25 - c * 0.08, 0.1]), b3 = V(m, [c * 0.25, s * 0.25, -0.25]);
    tri(m, tip, b1, b2, 1); tri(m, tip, b2, b3, 0); tri(m, tip, b3, b1, 0);
  }
  lathe(m, [[0.3, 0.1, 0.1], [0.5, 0.06, 0.06]], 6, 3);
  return flip(m);
})();

export const CRUISER = (() => {
  const m = mk();
  lathe(m, [[-1.6, 0.35, 0.25], [-1.2, 0.55, 0.38], [0.6, 0.5, 0.35], [1.4, 0.25, 0.2], [1.8, 0.06, 0.06]], 8, (r, i) => (r === 1 && i % 2 ? 1 : 0), { capB: 3 });
  slab(m, [[-0.2, -0.9], [0.2, -0.9], [0.18, 0.2], [-0.18, 0.2]], 0.42, 0.35, 0, 'y', 1);
  lathe(m, [[0.0, 0.12, 0.08], [0.25, 0.1, 0.07]], 6, 2, { off: [0, 0.62, 0] });
  const w = [[0.4, 0.4], [1.6, -0.2], [1.6, -0.6], [0.4, -0.9]];
  slab(m, w, -0.05, 0.08, 1, 'y', 0); slab(m, mirror(w), -0.05, 0.08, 1, 'y', 0);
  for (const s of [-1, 1]) lathe(m, [[-1.75, 0.16, 0.16], [-1.3, 0.2, 0.2], [-0.6, 0.16, 0.16]], 6, 0, { off: [s * 0.5, -0.1, 0], capB: 3 });
  return flip(m);
})();
export const POD = (() => { const m = mk(); lathe(m, [[-0.4, 0.05, 0.05], [-0.25, 0.3, 0.3], [0.25, 0.3, 0.3], [0.4, 0.05, 0.05]], 8, (r) => (r === 1 ? 3 : 0)); return m; })();

export const CRYSTAL = (() => {
  const m = mk();
  lathe(m, [[-0.9, 0.001, 0.001], [-0.2, 0.45, 0.45], [0.2, 0.45, 0.45], [0.9, 0.001, 0.001]], 6, (r, i) => (r === 1 ? 3 : i % 2 ? 0 : 1), { skipF: true, skipB: true, rot0: 0 });
  return m;
})();
export const SHARD = (() => { const m = mk(); lathe(m, [[-0.45, 0.001, 0.001], [0, 0.25, 0.25], [0.45, 0.001, 0.001]], 3, (r, i) => (i ? 0 : 1), { skipF: true, skipB: true }); return m; })();

export const LAYER = (() => {
  const m = mk();
  slab(m, [[0, 1.2], [1.6, -0.2], [1.3, -0.7], [0.4, -0.5], [0, -0.9], [-0.4, -0.5], [-1.3, -0.7], [-1.6, -0.2]], 0, 0.22, 0, 'y', 1);
  lathe(m, [[-0.6, 0.25, 0.18], [0.3, 0.3, 0.2], [0.8, 0.1, 0.08]], 6, 1, { off: [0, 0.12, 0], capB: 3 });
  for (const s of [-1, 1]) lathe(m, [[-0.2, 0.08, 0.08], [0.15, 0.08, 0.08]], 6, 3, { off: [s * 1.25, 0, -0.45] });
  return flip(m);
})();

export const PYLON = (() => {
  const m = mk();
  m.v = []; m.f = [];
  // a column standing along y
  const n = 8, rings = [[-1.4, 0.35], [-1.1, 0.25], [0.9, 0.2], [1.1, 0.32], [1.4, 0.12]];
  const idx = rings.map(([y, r]) => Array.from({ length: n }, (_, i) => V(m, [Math.cos(i / n * 6.283) * r, y, Math.sin(i / n * 6.283) * r])));
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, idx[k][i], idx[k][j], idx[k + 1][j], idx[k + 1][i], k === 2 ? 3 : k === 1 && i % 2 ? 1 : 0); }
  const top = V(m, [0, 1.6, 0]); for (let i = 0; i < n; i++) tri(m, idx[4][i], idx[4][(i + 1) % n], top, 3);
  return m;
})();

export const PHANTOM = (() => {
  const m = mk();
  lathe(m, [[-0.9, 0.12, 0.06], [0, 0.3, 0.1], [0.9, 0.02, 0.02]], 4, (r, i) => (i % 2 ? 1 : 0), { capB: 3, rot0: 0 });
  const w = [[0.15, 0.3], [1.2, -0.7], [0.9, -0.85], [0.15, -0.4]];
  slab(m, w, 0, 0.04, 1, 'y', 0); slab(m, mirror(w), 0, 0.04, 1, 'y', 0);
  lathe(m, [[0.1, 0.08, 0.05], [0.45, 0.04, 0.03]], 4, 2, { off: [0, 0.08, 0], rot0: 0 });
  return flip(m);
})();

export const DIVER = (() => {
  const m = mk();
  lathe(m, [[-0.6, 0.18, 0.18], [0.2, 0.22, 0.22], [1.3, 0.001, 0.001]], 5, (r, i) => (i % 2 ? 1 : 0), { capB: 3, skipF: true });
  for (let a = 0; a < 3; a++) { const c = Math.cos(a * 2.094), s = Math.sin(a * 2.094); slab(m, [[0.15, -0.6], [0.6, -0.8], [0.18, 0.1]], 0, 0.03, 1, 'y'); m.v.slice(-6).forEach((v, k, arr) => { const i = m.v.length - 6 + k, [x, y, z] = m.v[i]; m.v[i] = [x * c - y * s, x * s + y * c, z]; }); }
  return flip(m);
})();

export const TURRET = (() => {
  const m = mk();
  lathe(m, [[-0.5, 0.05, 0.05], [-0.35, 0.45, 0.45], [0.2, 0.5, 0.5], [0.45, 0.2, 0.2]], 8, (r, i) => (r === 1 && i % 2 ? 1 : 0), { capF: 2 });
  lathe(m, [[0.3, 0.07, 0.07], [1.1, 0.06, 0.06]], 6, 1, { off: [0.18, 0, 0], capF: 3 });
  lathe(m, [[0.3, 0.07, 0.07], [1.1, 0.06, 0.06]], 6, 1, { off: [-0.18, 0, 0], capF: 3 });
  return flip(m);
})();

export const MINE = (() => {
  const m = mk();
  lathe(m, [[-0.4, 0.001, 0.001], [-0.2, 0.36, 0.36], [0.2, 0.36, 0.36], [0.4, 0.001, 0.001]], 8, (r, i) => (r === 1 ? (i % 2 ? 3 : 0) : 0), { skipF: true, skipB: true });
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [x, y, z] of dirs) {
    const tip = V(m, [x * 0.75, y * 0.75, z * 0.75]);
    const ax = x ? [0, 0.08, 0] : [0.08, 0, 0], bx = z ? [0, 0.08, 0] : [0, 0, 0.08];
    const c = [x * 0.3, y * 0.3, z * 0.3];
    const p = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, w]) => V(m, [c[0] + ax[0] * u + bx[0] * w, c[1] + ax[1] * u + bx[1] * w, c[2] + ax[2] * u + bx[2] * w]));
    for (let i = 0; i < 4; i++) tri(m, p[i], p[(i + 1) % 4], tip, 1);
  }
  return m;
})();

export function rock(seed) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  // subdivide once for a lumpier rock
  const m = { v: v.map((p) => { const n = Math.hypot(...p); return p.map((c) => c / n); }), f: [] };
  const mid = new Map();
  const M = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!mid.has(k)) { const p = m.v[a].map((c, i) => (c + m.v[b][i]) / 2), n = Math.hypot(...p); mid.set(k, V(m, p.map((c) => c / n))); } return mid.get(k); };
  for (const [a, b, c] of f) { const ab = M(a, b), bc = M(b, c), ca = M(c, a); m.f.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  m.v = m.v.map((p, i) => { const j = 0.78 + ((Math.sin(seed * 12.9 + i * 78.2) + 1) / 2) * 0.32; return p.map((c) => c * j); });
  m.f = m.f.map((fc, i) => [...fc, (Math.sin(seed * 3.1 + i * 1.7) > 0.55 ? 1 : 0)]);
  return m;
}

// ── Bosses ───────────────────────────────────────────────────
export const MOTHER = (() => {
  const m = mk(), n = 16;
  // a saucer: lathe around y, built as rings in the xz plane
  const prof = [[0.75, 0.001], [0.55, 0.9], [0.22, 1.5], [0.05, 2.4], [-0.08, 2.5], [-0.3, 1.8], [-0.5, 0.8], [-0.55, 0.001]];
  const idx = prof.map(([y, r]) => Array.from({ length: n }, (_, i) => V(m, [Math.cos(i / n * 6.283) * r, y, Math.sin(i / n * 6.283) * r])));
  const mats = [2, 2, 0, 1, 0, 0, 3];
  for (let k = 0; k < prof.length - 1; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(m, idx[k][i], idx[k][j], idx[k + 1][j], idx[k + 1][i], k === 3 ? (i % 2 ? 3 : 1) : k === 5 && i % 4 === 0 ? 3 : mats[k]); }
  return m;
})();
export const HYDRA_SEG = (() => { const m = mk(); lathe(m, [[-0.55, 0.3, 0.3], [-0.35, 0.6, 0.55], [0.35, 0.6, 0.55], [0.55, 0.3, 0.3]], 8, (r, i) => (r === 1 ? (i % 2 ? 1 : 0) : i % 4 === 0 ? 3 : 0)); return m; })();
export const HYDRA_HEAD = (() => {
  const m = mk();
  lathe(m, [[-0.7, 0.55, 0.5], [0, 0.8, 0.6], [0.8, 0.5, 0.35], [1.4, 0.15, 0.1]], 8, (r, i) => (r === 1 && (i === 1 || i === 3) ? 3 : r === 2 ? 1 : 0), { capB: 0 });
  for (const s of [-1, 1]) slab(m, [[0.3, 0.2], [0.9, 1.3], [0.55, 1.4], [0.15, 0.6]], s * 0.32, 0.08, 1, 'x', 0);
  for (const s of [-1, 1]) slab(m, [[0.15, -0.5], [0.95, -1.3], [0.7, -0.4]], s * 0.6, 0.06, 1, 'y', 0);
  return flip(m);
})();
export const CORE = (() => {
  const m = mk();
  lathe(m, [[-1.2, 0.8, 0.8], [-0.7, 1.4, 1.4], [0.7, 1.4, 1.4], [1.2, 0.8, 0.8]], 8, (r, i) => (r === 1 ? (i % 2 ? 3 : 1) : 0), { capF: 3, capB: 0 });
  return flip(m);
})();
export const PLATE = (() => { const m = mk(); slab(m, [[-0.9, -0.15], [0.9, -0.15], [0.7, 0.15], [-0.7, 0.15]], 0, 0.9, 1, 'y', 0); return m; })();

// ── Pick-ups ─────────────────────────────────────────────────
export const CAPSULE = (() => { const m = mk(); lathe(m, [[-0.45, 0.06, 0.06], [-0.3, 0.3, 0.3], [0.3, 0.3, 0.3], [0.45, 0.06, 0.06]], 8, (r, i) => (r === 1 ? (i % 2 ? 3 : 0) : 1)); return m; })();
export const DRONE = (() => { const m = mk(); lathe(m, [[-0.35, 0.12, 0.12], [0, 0.18, 0.18], [0.4, 0.04, 0.04]], 6, 0, { capB: 3 }); slab(m, [[0.1, 0], [0.45, -0.2], [0.1, -0.3]], 0, 0.03, 1); slab(m, mirror([[0.1, 0], [0.45, -0.2], [0.1, -0.3]]), 0, 0.03, 1); return m; })();

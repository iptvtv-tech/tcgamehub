// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — block textures, 32 × 32 pixels, drawn in code.
//  Layout (RGBA): TEX[((id * 3 + face) * TS * TS + v * TS + u) * 4 + channel]
//  faces: 0 top · 1 side · 2 bottom. Alpha 0 = see-through (leaves, plants, torch).
// ─────────────────────────────────────────────────────────────
import { B, NBLOCKS } from './items.js';

export const TS = 32;
const TT = TS * TS;

export function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const cb = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** colour ramp through a list of hex stops, k in 0..1 */
function ramp(stops) { const C = stops.map(hex); return (k) => { k = Math.max(0, Math.min(0.9999, k)) * (C.length - 1); const i = Math.floor(k); return mixc(C[i], C[i + 1], k - i); }; }

/** tileable value noise: period = number of cells across the tile */
function makeVN(seed) {
  const r = prng(seed), G = new Float32Array(32 * 32).map(() => r());
  return (x, y, period) => {
    const fx = x / TS * period, fy = y / TS * period, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (i, j) => G[(((j % period) + period) % period) * 32 + (((i % period) + period) % period)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx, b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}
/** tileable Voronoi cells */
function voronoi(r, n) {
  const P = Array.from({ length: n }, () => [r() * TS, r() * TS]);
  return (u, v) => {
    let d1 = 1e9, d2 = 1e9, best = 0, bdx = 0, bdy = 0;
    P.forEach(([px, py], i) => {
      let dx = u + 0.5 - px, dy = v + 0.5 - py;
      if (dx > TS / 2) dx -= TS; if (dx < -TS / 2) dx += TS; if (dy > TS / 2) dy -= TS; if (dy < -TS / 2) dy += TS;
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; best = i; bdx = dx; bdy = dy; } else if (d < d2) d2 = d;
    });
    return { i: best, d1, d2, dx: bdx, dy: bdy, edge: d2 - d1 };
  };
}

export function makeTextures() {
  const T = new Uint8Array(NBLOCKS * 3 * TT * 4);
  const r = prng(777), vn = makeVN(4242), vn2 = makeVN(99);
  const put = (id, f, u, v, c, a = 255) => { const o = ((id * 3 + f) * TT + v * TS + u) * 4; T[o] = cb(c[0]); T[o + 1] = cb(c[1]); T[o + 2] = cb(c[2]); T[o + 3] = a; };
  const get = (id, f, u, v) => { const o = ((id * 3 + f) * TT + (v & 31) * TS + (u & 31)) * 4; return [T[o], T[o + 1], T[o + 2], T[o + 3]]; };
  const each = (fn) => { for (let v = 0; v < TS; v++) for (let u = 0; u < TS; u++) fn(u, v); };
  const copy = (id, from, ff, tf) => each((u, v) => { const c = get(from, ff, u, v); put(id, tf, u, v, c, c[3]); });
  const fbm = (u, v, s = 0) => 0.55 * vn(u + s, v, 4) + 0.3 * vn(u, v + s, 8) + 0.15 * vn(u + s, v + s, 16);
  const fbm2 = (u, v) => 0.5 * vn2(u, v, 2) + 0.3 * vn2(u, v, 4) + 0.2 * vn2(u, v, 8);
  const ALL = [0, 1, 2];
  const clear = (id) => { for (const f of ALL) each((u, v) => put(id, f, u, v, [0, 0, 0], 0)); };

  // ── earth ────────────────────────────────────────────────
  const dirtR = ramp(['#4e3118', '#6b4422', '#80522a', '#946234', '#a26d3b']);
  each((u, v) => { let c = dirtR(fbm(u, v) * 1.1 - 0.05); if (r() < 0.07) c = sc(c, 0.78); if (r() < 0.04) c = sc(c, 1.18); for (const f of ALL) put(B.DIRT, f, u, v, c); });
  for (let k = 0; k < 9; k++) { // pebbles
    const pu = Math.floor(r() * 30), pv = Math.floor(r() * 30), pc = hex(['#8a7f73', '#7d6a58', '#9b8f82'][k % 3]);
    for (const f of ALL) { put(B.DIRT, f, pu, pv, sc(pc, 1.2)); put(B.DIRT, f, pu + 1, pv, pc); put(B.DIRT, f, pu, pv + 1, pc); put(B.DIRT, f, pu + 1, pv + 1, sc(pc, 0.75)); }
  }
  const grassR = ramp(['#2f6f1c', '#3f8a24', '#4fa52f', '#62bd3b', '#7ad14d']);
  const grassTop = (u, v) => { let c = grassR(fbm(u, v, 7) * 1.15 - 0.05); const p = r(); if (p < 0.1) c = sc(c, 1.16); else if (p < 0.18) c = sc(c, 0.82); return c; };
  each((u, v) => put(B.GRASS, 0, u, v, grassTop(u, v)));
  copy(B.GRASS, B.DIRT, 1, 1); copy(B.GRASS, B.DIRT, 2, 2);
  for (let u = 0; u < TS; u++) {
    let d = 5 + Math.floor(vn(u * 2, 3, 8) * 6);
    if (r() < 0.12) d += 3;
    for (let v = 0; v < d; v++) put(B.GRASS, 1, u, v, sc(grassTop(u, v), 1 - v / d * 0.25));
    put(B.GRASS, 1, u, d, sc(get(B.DIRT, 1, u, d), 0.62));
  }
  const snowR = ramp(['#c9d6e6', '#dde7f2', '#eef3f9', '#ffffff']);
  each((u, v) => { let c = snowR(fbm(u, v, 3)); if (r() < 0.03) c = [255, 255, 255]; if (r() < 0.04) c = hex('#bcd0e8'); put(B.SNOW, 0, u, v, c); });
  copy(B.SNOW, B.DIRT, 1, 1); copy(B.SNOW, B.DIRT, 2, 2);
  for (let u = 0; u < TS; u++) { const d = 6 + Math.floor(vn(u * 2, 9, 8) * 5); for (let v = 0; v < d; v++) put(B.SNOW, 1, u, v, v === d - 1 ? hex('#b8c8dc') : snowR(fbm(u, v, 3))); put(B.SNOW, 1, u, d, sc(get(B.DIRT, 1, u, d), 0.65)); }

  // ── stone family ─────────────────────────────────────────
  const stoneR = ramp(['#626265', '#717174', '#7f7f82', '#8c8c8f', '#9a9a9d']);
  each((u, v) => { let c = stoneR(fbm(u, v, 3) * 1.2 - 0.1); if (r() < 0.05) c = sc(c, 0.85); if (r() < 0.03) c = sc(c, 1.15); for (const f of ALL) put(B.STONE, f, u, v, c); });
  for (let k = 0; k < 5; k++) { // hairline cracks
    let u = Math.floor(r() * 32), v = Math.floor(r() * 32);
    for (let s = 0; s < 6 + Math.floor(r() * 7); s++) {
      for (const f of ALL) { put(B.STONE, f, u & 31, v & 31, hex('#55555a')); put(B.STONE, f, (u + 1) & 31, (v + 1) & 31, hex('#a2a2a5')); }
      u += r() < 0.6 ? 1 : 0; v += r() < 0.5 ? 1 : -1;
    }
  }
  const cobble = (id, n, cols, mortar, seed) => {
    const vo = voronoi(prng(seed), n), C = cols.map(hex), M = hex(mortar);
    each((u, v) => {
      const c = vo(u, v);
      let col;
      if (c.edge < 1.4) col = sc(M, 0.9 + r() * 0.15);
      else {
        col = sc(C[c.i % C.length], 0.9 + fbm(u, v) * 0.2);
        const k = 1 - (c.dx + c.dy) / (c.d1 + 4) * 0.22;   // lit from the top-left
        col = sc(col, k);
        if (c.edge < 2.6) col = sc(col, c.dx + c.dy > 0 ? 0.88 : 1.1);
      }
      for (const f of ALL) put(id, f, u, v, col);
    });
  };
  cobble(B.COBBLE, 11, ['#6d6d70', '#7d7d80', '#8a8a8d', '#979799', '#757578'], '#3a3a3d', 5);
  cobble(B.GRAVEL, 20, ['#7d7570', '#8f8883', '#6a625e', '#a39c97', '#5d5551', '#857059'], '#463f3c', 17);
  // stone bricks
  const bricks = (id, base, mortar, tint = 0) => {
    const BR = ramp(base);
    each((u, v) => {
      const row = Math.floor(v / 16), off = row % 2 ? 8 : 0, bu = (u + off) % 16, bv = v % 16, bi = Math.floor((u + off) / 16) + row * 7;
      let col;
      if (bv === 15 || bu === 15) col = hex(mortar);
      else {
        col = sc(BR(fbm(u, v, 5) * 0.8 + ((bi * 37) % 10) / 40), 1);
        if (bv === 0 || bu === 0) col = sc(col, 1.18); else if (bv === 14 || bu === 14) col = sc(col, 0.78);
        if (r() < 0.04) col = sc(col, 0.88);
      }
      for (const f of ALL) put(id, f, u, v, col);
    });
  };
  bricks(B.BRICKS, ['#6f6f72', '#7f7f82', '#8e8e91', '#9b9b9e'], '#4a4a4d');
  bricks(B.ALTAR, ['#2a2140', '#342850', '#3f3160', '#4a3a70'], '#120c20');
  for (const f of [0, 1]) for (let v = 0; v < TS; v++) for (let u = 0; u < TS; u++) { // glowing rune ring
    const d = Math.hypot(u - 15.5, v - 15.5);
    if (Math.abs(d - 9) < 1.1 || (d < 3.2)) put(B.ALTAR, f, u, v, d < 2 ? hex('#fdf4ff') : hex('#e879f9'));
    else if (Math.abs(d - 9) < 2) put(B.ALTAR, f, u, v, mixc(get(B.ALTAR, f, u, v), hex('#a21caf'), 0.5));
  }
  const bedR = ramp(['#141414', '#262626', '#3a3a3a', '#555555', '#6b6b6b']);
  each((u, v) => { const c = bedR(fbm2(u, v) * 1.3 - 0.15 + (r() - 0.5) * 0.25); for (const f of ALL) put(B.BEDROCK, f, u, v, c); });
  const sandR = ramp(['#d4bf86', '#dfcc95', '#e8d7a3', '#f0e2b3', '#f7ebc4']);
  each((u, v) => { let c = sandR(fbm(u, v, 2) * 0.9 + 0.05); const p = r(); if (p < 0.1) c = sc(c, 0.9); else if (p < 0.16) c = sc(c, 1.07); for (const f of ALL) put(B.SAND, f, u, v, c); });
  each((u, v) => {
    const top = sandR(fbm(u, v, 9) * 0.6 + 0.3);
    put(B.SANDSTONE, 0, u, v, top); put(B.SANDSTONE, 2, u, v, sc(top, 0.92));
    let c = sandR(fbm(u, v, 9) * 0.5 + 0.25);
    if (v < 5) c = sc(sandR(0.85), 1); else if (v === 5 || v === 18) c = hex('#b8a06a'); else if (v === 6 || v === 19) c = sc(c, 1.08);
    if (v > 27) c = sc(c, 0.9);
    put(B.SANDSTONE, 1, u, v, c);
  });

  // ── ores: stone with chunky gem clusters ─────────────────
  const ore = (id, mid, hi, dark, n = 6) => {
    copy(id, B.STONE, 0, 0); copy(id, B.STONE, 1, 1); copy(id, B.STONE, 2, 2);
    const rr = prng(id * 991), M = hex(mid), Hc = hex(hi), D = hex(dark);
    for (let k = 0; k < n; k++) {
      const cu = 3 + Math.floor(rr() * 26), cv = 3 + Math.floor(rr() * 26);
      for (let q = 0; q < 3; q++) {
        const gu = cu + Math.floor(rr() * 5) - 2, gv = cv + Math.floor(rr() * 5) - 2, rad = 1 + Math.floor(rr() * 2);
        for (let dv = -rad - 1; dv <= rad + 1; dv++) for (let du = -rad - 1; du <= rad + 1; du++) {
          const m = Math.abs(du) + Math.abs(dv), u = (gu + du) & 31, v = (gv + dv) & 31;
          let c = null;
          if (m <= rad) c = du + dv <= -rad + 1 ? Hc : (du + dv >= rad ? sc(M, 0.8) : M);
          else if (m === rad + 1) c = D;
          if (c) for (const f of ALL) put(id, f, u, v, c);
        }
      }
    }
  };
  ore(B.COAL_ORE, '#2b2b2b', '#5a5a5a', '#101010', 7);
  ore(B.IRON_ORE, '#d8a27a', '#f6d4b6', '#7d5236');
  ore(B.GOLD_ORE, '#f5c518', '#fff4b0', '#8a6600');
  ore(B.CRYSTAL_ORE, '#e879f9', '#ffffff', '#86198f', 5);

  // ── wood ─────────────────────────────────────────────────
  const barkR = ramp(['#3a2210', '#4a2e16', '#5d3a1d', '#6e4524', '#7a4f2a']);
  each((u, v) => {
    const groove = Math.sin(u * Math.PI / 4 + vn(u, v, 4) * 5 + Math.sin(v * Math.PI / 16) * 0.8);
    let c = barkR(0.45 + groove * 0.3 + (vn(u, v * 2 % 32, 8) - 0.5) * 0.4);
    if (groove < -0.75) c = sc(c, 0.7);
    put(B.LOG, 1, u, v, c);
    const du = u - 15.5, dv = v - 15.5, d = Math.max(Math.abs(du), Math.abs(dv)) * 0.6 + Math.hypot(du, dv) * 0.4 + vn(u, v, 8) * 1.5;
    let t = d > 14 ? barkR(0.6) : (Math.floor(d / 2.6) % 2 ? hex('#c39256') : hex('#a8793f'));
    if (d < 1.8) t = hex('#8a5f30');
    put(B.LOG, 0, u, v, sc(t, 0.95 + r() * 0.08)); put(B.LOG, 2, u, v, sc(t, 0.95 + r() * 0.08));
  });
  const plankCols = ['#b8874a', '#ad7d42', '#c29256', '#a8783f'].map(hex);
  each((u, v) => {
    const board = Math.floor(v / 8), bv = v % 8;
    const grain = 0.5 + 0.5 * Math.sin(v * 2.3 + 1.6 * Math.sin(u * Math.PI / 8 + board * 1.3) + board);
    let c = sc(plankCols[board], 0.88 + grain * 0.16);
    if (bv === 7) c = hex('#6b4a26'); else if (bv === 0) c = sc(c, 1.1);
    const joint = (board * 11 + 5) % 32;
    if (u === joint) c = hex('#7c5a2f');
    if ((u === joint + 2 || u === joint - 2) && (bv === 2 || bv === 5)) c = hex('#4a3520');
    for (const f of ALL) put(B.PLANKS, f, u, v, c);
  });
  // leaves with see-through gaps
  const leafR = ramp(['#174a1d', '#1f5d25', '#26702c', '#2f8434', '#3a9a3d', '#4cb04e']);
  each((u, v) => {
    const n = fbm(u, v, 3);
    const hole = n < 0.36 && r() < 0.85;
    let c = leafR(n * 1.1 + (r() - 0.5) * 0.3);
    if (r() < 0.05) c = sc(c, 1.25);
    for (const f of ALL) put(B.LEAVES, f, u, v, hole ? hex('#123a16') : c, hole ? 0 : 255);
  });
  // cactus
  each((u, v) => {
    let c = sc(ramp(['#1f6b2e', '#2a8a3b', '#36a047', '#42b453'])(0.5 + Math.sin(u * Math.PI / 4) * 0.35 + (vn(u, v, 8) - 0.5) * 0.3), 1);
    if (u % 8 === 0) c = hex('#185a25');
    if (u % 8 === 4 && v % 7 === 3) c = hex('#f1f5f9'); if (u % 8 === 5 && v % 7 === 3) c = hex('#14532d');
    put(B.CACTUS, 1, u, v, c);
    const d = Math.max(Math.abs(u - 15.5), Math.abs(v - 15.5));
    const t = d > 14 ? hex('#185a25') : d > 11 ? hex('#3fa34f') : (Math.floor(d) % 4 === 0 ? hex('#2a8a3b') : hex('#36a047'));
    put(B.CACTUS, 0, u, v, t); put(B.CACTUS, 2, u, v, t);
  });

  // ── made things ──────────────────────────────────────────
  copy(B.TABLE, B.PLANKS, 0, 2);
  each((u, v) => {
    const edge = u < 2 || v < 2 || u > 29 || v > 29;
    const grid = (u % 10 === 1 || v % 10 === 1);
    put(B.TABLE, 0, u, v, edge ? hex('#5a381c') : grid ? hex('#7c5a2f') : sc(hex('#c99a5e'), 0.92 + vn(u, v, 8) * 0.14));
    put(B.TABLE, 1, u, v, v < 6 ? (v === 0 || v === 5 ? hex('#4a2e16') : sc(hex('#7a4f2a'), 0.95 + r() * 0.08)) : get(B.PLANKS, 1, u, v));
  });
  // a saw (left) and a hammer (right) on the side
  for (let i = 0; i < 12; i++) { put(B.TABLE, 1, 4 + i % 4 + 0, 9 + i, hex('#c0c4c9')); if (i % 2 === 0) put(B.TABLE, 1, 8, 9 + i, hex('#9ca3af')); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) put(B.TABLE, 1, 4 + i, 21 + j, hex('#6b4423'));
  for (let i = 0; i < 14; i++) put(B.TABLE, 1, 23, 10 + i, hex('#6b4423'));
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) put(B.TABLE, 1, 19 + i, 9 + j, j === 0 ? hex('#d1d5db') : hex('#6b7280'));
  copy(B.FURNACE, B.COBBLE, 0, 0); copy(B.FURNACE, B.COBBLE, 0, 2); copy(B.FURNACE, B.COBBLE, 0, 1);
  each((u, v) => {
    if (u >= 8 && u <= 23 && v >= 15 && v <= 27) {
      const fire = v > 20 && r() < 0.7;
      put(B.FURNACE, 1, u, v, fire ? hex(r() < 0.4 ? '#fbbf24' : r() < 0.6 ? '#f97316' : '#dc2626') : v === 15 || u === 8 || u === 23 ? hex('#141414') : hex('#262626'));
    } else if ((v === 13 || v === 14) && u >= 6 && u <= 25) put(B.FURNACE, 1, u, v, hex(v === 13 ? '#b4b4b8' : '#6e6e72'));
  });
  // water & lava (animated in the renderer)
  each((u, v) => {
    const w = 0.5 + 0.25 * Math.sin(u * Math.PI / 8 + Math.sin(v * Math.PI / 8) * 2) + 0.25 * Math.sin(v * Math.PI / 16 + u * Math.PI / 16);
    const c = w > 0.86 ? hex('#7fb4f5') : w > 0.7 ? hex('#4a8be6') : mixc(hex('#1f5bbd'), hex('#2f6fd6'), w);
    for (const f of ALL) put(B.WATER, f, u, v, c, 190);
  });
  const lv = voronoi(prng(31), 9);
  each((u, v) => {
    const c = lv(u, v);
    const col = c.edge < 1.2 ? hex('#a62a00') : c.d1 < 2.5 ? hex('#fff3a8') : c.d1 < 4.5 ? hex('#ffc23d') : c.d1 < 7 ? hex('#ff9a1f') : hex('#e85a0c');
    for (const f of ALL) put(B.LAVA, f, u, v, col);
  });
  // torch: a stick with a flame (drawn as a crossed picture)
  clear(B.TORCH);
  for (const f of ALL) for (let v = 4; v < TS; v++) for (let u = 13; u <= 18; u++) {
    if (v >= 12 && (u < 14 || u > 17)) continue;
    let c;
    if (v < 12) { const d = Math.abs(u - 15.5) + Math.abs(v - 9) * 0.6; if (d > 3.2) continue; c = d < 1.2 ? hex('#fffbe6') : d < 2.2 ? hex('#ffe066') : hex('#ff8c1a'); }
    else c = u === 14 ? hex('#a0743f') : u === 17 ? hex('#4a2e16') : hex('#7c4a1e');
    put(B.TORCH, f, u, v, c);
  }
  // bed
  each((u, v) => {
    let top;
    if (v < 10) top = (u < 2 || u > 29 || v < 1) ? hex('#cbd5e1') : sc(hex('#f8fafc'), 0.95 + vn(u, v, 8) * 0.08);
    else top = sc(hex('#dc2626'), 0.86 + vn(u, v, 4) * 0.2 + ((u + v * 3) % 11 === 0 ? 0.08 : 0));
    if (v === 10) top = hex('#991b1b');
    put(B.BED, 0, u, v, top);
    put(B.BED, 1, u, v, v < 10 ? sc(hex('#dc2626'), 0.86 + vn(u, v, 4) * 0.2) : v < 13 ? hex('#f1f5f9') : v < 18 ? hex('#6b4423') : (u < 4 || u > 27) ? hex('#5a381c') : [0, 0, 0]);
    if (v >= 18 && u >= 4 && u <= 27) put(B.BED, 1, u, v, [0, 0, 0], 0);
  });
  copy(B.BED, B.PLANKS, 2, 2);
  // berry bushes (ripe + not) and glowcap mushrooms
  const bush = (id, berry, berryHi) => {
    clear(id);
    each((u, v) => {
      const n = fbm(u, v, 5);
      const e = ((u - 15.5) / 14) ** 2 + ((v - 17) / 13.5) ** 2;
      if (e > 1 + (n - 0.5) * 0.7 || (n < 0.33 && r() < 0.7)) return;
      let c = leafR(0.3 + n * 0.9); if (r() < 0.06) c = sc(c, 1.25);
      for (const f of ALL) put(id, f, u, v, c);
    });
    for (let v = 26; v < TS; v++) for (const u of [12, 15, 19]) for (const f of ALL) put(id, f, u + (v % 2), v, hex('#5a381c'));
    if (berry) for (const [bu, bv] of [[8, 9], [20, 7], [14, 14], [24, 16], [6, 19], [17, 21], [11, 24], [22, 23]]) for (const f of ALL) {
      put(id, f, bu, bv, hex(berryHi)); put(id, f, bu + 1, bv, hex(berry)); put(id, f, bu, bv + 1, hex(berry)); put(id, f, bu + 1, bv + 1, sc(hex(berry), 0.65));
    }
  };
  bush(B.BUSH, '#6aa84f', '#b6e08f');
  bush(B.BUSH_RIPE, '#dc2626', '#fecaca');
  clear(B.MUSHROOM);
  for (const f of ALL) each((u, v) => {
    if (v >= 17 && v < TS && u >= 13 && u <= 18) put(B.MUSHROOM, f, u, v, u === 13 ? hex('#d6c7b0') : u === 18 ? hex('#a8957a') : hex('#efe4d2'));
    const e = ((u - 15.5) / 11) ** 2 + ((v - 13) / 7) ** 2;
    if (e < 1 && v < 18) {
      const spot = ((u * 7 + v * 13) % 23 === 0) || (Math.hypot(u - 10, v - 11) < 1.6) || (Math.hypot(u - 20, v - 10) < 1.8) || (Math.hypot(u - 16, v - 8) < 1.3);
      put(B.MUSHROOM, f, u, v, spot ? hex('#ecfeff') : v > 16 ? hex('#0e7490') : mixc(hex('#22d3ee'), hex('#0891b2'), (v - 6) / 12));
    }
  });
  return T;
}

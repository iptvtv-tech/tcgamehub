// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — the scenery: the erupting volcano far behind, the shaft's rock and ledges,
//  the vent of cold air at the top, the lava, and the foreground rock. Purely cosmetic
//  (Math.random is fine here). Layers move at different speeds as the camera climbs, for depth.
// ─────────────────────────────────────────────────────────────
import { TILE, ROCK, LEDGE, tileAt } from './world.js';

const TAU = Math.PI * 2;
const INK = '#05050a';
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/** Everything cosmetic about one shaft, worked out once when the level starts. */
export function makeScene(m, W) {
  const left = [], right = [], blocks = [], ledges = [];
  for (let r = 0; r < m.R; r++) {
    let a = 0; while (a < m.C && tileAt(m, a, r) === ROCK) a++;
    let b = 0; while (b < m.C && tileAt(m, m.C - 1 - b, r) === ROCK) b++;
    left.push(a); right.push(b);
    if (a < m.C) for (let c = a; c < m.C - b; c++) if (tileAt(m, c, r) === ROCK) blocks.push({ c, r });
    for (let c = 0; c < m.C; c++) {
      if (tileAt(m, c, r) !== LEDGE || tileAt(m, c - 1, r) === LEDGE) continue;
      let e = c; while (tileAt(m, e + 1, r) === LEDGE) e++;
      const x0 = c * TILE, x1 = (e + 1) * TILE, n = Math.max(2, Math.round((x1 - x0) / 18)), under = [];
      for (let i = 0; i <= n; i++) under.push([x0 + 5 + ((x1 - x0 - 10) * i) / n, 14 + hash(r * 97 + c * 13 + i) * 7]);
      const cracks = [];
      for (let i = 0; i < Math.max(1, Math.round((x1 - x0) / 60)); i++) { const x = x0 + 14 + hash(r * 31 + c + i * 7) * (x1 - x0 - 28); cracks.push([x, hash(r + i * 3 + c) > 0.5 ? 1 : -1]); }
      ledges.push({ r, x0, x1, y: r * TILE, under, cracks });
    }
  }
  const jit = Array.from({ length: m.R + 1 }, (_, r) => [(hash(r * 7 + 1) - 0.5) * 7, (hash(r * 7 + 2) - 0.5) * 7, (hash(r * 7 + 3) - 0.5) * 9, (hash(r * 7 + 4) - 0.5) * 9]);
  return {
    left, right, blocks, ledges, jit,
    mid: Array.from({ length: 12 }, (_, i) => ({ x: 40 + Math.random() * (W - 140), y: i * 230 + Math.random() * 90, w: 46 + Math.random() * 54 })),
    cliffs: Array.from({ length: 2 }, () => Array.from({ length: 14 }, (_, i) => ({ y: i * 90, d: 34 + Math.random() * 46 }))),
    spikes: Array.from({ length: 8 }, (_, i) => ({ side: i % 2 ? 1 : -1, y: i * 170 + Math.random() * 60, len: 18 + Math.random() * 18, w: 14 + Math.random() * 12 })),
    plates: Array.from({ length: 14 }, (_, i) => ({ x: (i % 7) * 74 + Math.random() * 30, w: 36 + Math.random() * 34, d: i < 7 ? 8 + Math.random() * 16 : 34 + Math.random() * 40, v: (Math.random() - 0.5) * (i < 7 ? 9 : 5) })),
    motes: Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: Math.random(), v: 14 + Math.random() * 26, ph: Math.random() * TAU, ash: Math.random() < 0.35 })),
    flakes: Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), v: 18 + Math.random() * 20, ph: Math.random() * TAU })),
    bubbles: Array.from({ length: 5 }, () => ({ x: Math.random() * W, ph: Math.random() * 3 })),
  };
}

// ── The far scene: sky, ridges, the erupting volcano, ash, fog ──
let skyCache = null;
function sky(ctx, W, vh) {
  if (!skyCache || skyCache.vh !== vh) {
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#050409'); g.addColorStop(0.45, '#120c18'); g.addColorStop(0.78, '#2a0f0d'); g.addColorStop(1, '#4a170b');
    skyCache = { vh, g };
  }
  ctx.fillStyle = skyCache.g; ctx.fillRect(0, 0, W, vh);
}

/**
 * The volcano, far away behind the shaft: a dark cone against its own glow, the crater spitting
 * fire, a tall plume of ash, lava creeping down its flanks. Kept dim so it never reads as part of
 * the playfield. climb: how far the camera has risen (the volcano sinks a little as you climb).
 */
export function drawBackdrop(ctx, sc, W, vh, climb, t, glow) {
  sky(ctx, W, vh);
  const cx = W / 2, cy = vh * 0.2 + Math.min(70, climb * 0.07), base = cy + vh * 0.8, half = W * 0.72;
  const pulse = 0.85 + Math.sin(t * 5.1) * 0.1 + Math.sin(t * 13.7) * 0.05;
  // its glow lights the sky around it, so the cone stands out as a silhouette
  ctx.globalAlpha = 0.9; ctx.drawImage(glow('rgba(160,52,16,0.6)'), cx - W * 0.8, cy - vh * 0.28, W * 1.6, vh * 0.9); ctx.globalAlpha = 1;
  // far ridges either side of it
  ctx.fillStyle = '#1a1322';
  ctx.beginPath(); ctx.moveTo(0, vh);
  for (const [x, y] of [[0, 0.62], [0.08, 0.58], [0.18, 0.61], [0.3, 0.57], [0.7, 0.58], [0.82, 0.55], [0.92, 0.6], [1, 0.57]]) ctx.lineTo(x * W, cy + (y - 0.2) * vh);
  ctx.lineTo(W, vh); ctx.closePath(); ctx.fill();
  // the cone: a darker left flank, a lighter right one, a warm rim along its edges
  const flank = (s) => [[cx + s * 22, cy], [cx + s * 46, cy + 40], [cx + s * 96, cy + vh * 0.2], [cx + s * 170, cy + vh * 0.42], [cx + s * half, base]];
  ctx.fillStyle = '#0b0810'; ctx.beginPath(); ctx.moveTo(cx, cy); for (const [x, y] of flank(-1)) ctx.lineTo(x, y); ctx.lineTo(cx, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#120d19'; ctx.beginPath(); ctx.moveTo(cx, cy); for (const [x, y] of flank(1)) ctx.lineTo(x, y); ctx.lineTo(cx, base); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a1f12'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); flank(s).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  // lava creeping down the flanks, fading with distance from the crater
  for (const [s, wob] of [[-1, 0], [1, 1.7]]) {
    let px = cx + s * 14, py = cy + 3;
    for (let i = 1; i <= 7; i++) {
      const y = cy + 3 + i * vh * 0.06, x = cx + s * (14 + i * i * 2.6 + Math.sin(i * 1.9 + wob) * 6);
      ctx.strokeStyle = `rgba(232,89,12,${(0.62 - i * 0.075).toFixed(3)})`; ctx.lineWidth = 2.2 - i * 0.18;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      px = x; py = y;
    }
  }
  // the ash plume, slowly boiling up out of the top of the screen
  const ash = [[0, -26, 26, 13, '#2a2032'], [-16, -50, 34, 16, '#231b2b'], [18, -62, 36, 17, '#231b2b'], [-6, -92, 48, 21, '#1b1523'], [26, -122, 56, 24, '#16111d'], [-30, -146, 58, 25, '#130f19'], [6, -180, 74, 28, '#0f0c15'], [-20, -226, 92, 32, '#0c0a11']];
  ash.forEach(([dx, dy, rx, ry, col], i) => {
    const s = 1 + Math.sin(t * 0.7 + i) * 0.06, y = cy + dy - ((t * 4 + i * 9) % 18);
    if (y + ry < -10) return;
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx + dx + Math.sin(t * 0.4 + i * 1.7) * 5, y, rx * s, ry * s, 0, 0, TAU); ctx.fill();
  });
  ctx.globalAlpha = 0.35 * pulse; ctx.drawImage(glow('rgba(255,122,26,0.7)'), cx - 60, cy - 70, 120, 70); ctx.globalAlpha = 1;
  // volcanic lightning in the plume, now and then
  if (t % 7.3 < 0.14) {
    ctx.strokeStyle = '#e7dbff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + 34, cy - 160); ctx.lineTo(cx + 24, cy - 138); ctx.lineTo(cx + 36, cy - 132); ctx.lineTo(cx + 22, cy - 106); ctx.stroke();
  }
  // the crater and its fire
  ctx.globalAlpha = 0.7 * pulse; ctx.drawImage(glow('rgba(255,122,26,0.9)'), cx - 70, cy - 60, 140, 110); ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 22, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 10, 2.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff8a30'; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(cx - 14, cy);
  for (const [x, y] of [[-9, -34 + Math.sin(t * 11) * 5], [-3, -18], [2, -50 + Math.sin(t * 9 + 1) * 8], [7, -18], [12, -32 + Math.sin(t * 13 + 2) * 5]]) ctx.lineTo(cx + x, cy + y * pulse);
  ctx.lineTo(cx + 14, cy); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  // lava bombs arcing out of the crater
  for (const [i, x1, h1] of [[0, -110, 90], [1, 120, 70], [2, -170, 50]]) {
    const k = (t * 0.42 + i * 0.37) % 1;
    const qx = (u) => cx + x1 * u, qy = (u) => cy - h1 * 4 * u * (1 - u) + u * u * vh * 0.18;
    ctx.strokeStyle = 'rgba(255,122,26,.5)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); const u0 = Math.max(0, k - 0.18); ctx.moveTo(qx(u0), qy(u0)); for (let u = u0; u <= k; u += 0.03) ctx.lineTo(qx(u), qy(u)); ctx.stroke();
    ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(qx(k), qy(k), 2.3, 0, TAU); ctx.fill();
  }
  // fog bands
  ctx.fillStyle = '#8a7a98';
  for (const [y, rx, ry, a] of [[0.62, W * 0.7, 26, 0.1], [0.46, W * 0.55, 18, 0.08], [0.33, W * 0.42, 14, 0.06]]) { ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(cx, cy + (y - 0.2) * vh, rx, ry, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}

/** Ghosted slabs and cliffs at middle depth, moving slower than the shaft. */
export function drawMiddle(ctx, sc, W, vh, camY, t) {
  const P = 230 * sc.mid.length;
  ctx.globalAlpha = 0.5;
  for (const s of sc.mid) {
    const y = ((s.y - camY * 0.4) % P + P) % P - 60;
    if (y < -40 || y > vh + 40) continue;
    ctx.fillStyle = '#17131f'; ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y - 2); ctx.lineTo(s.x + s.w + 4, y + 4); ctx.lineTo(s.x - 2, y + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#100d17'; ctx.beginPath(); ctx.moveTo(s.x - 2, y + 6); ctx.lineTo(s.x + s.w + 4, y + 4); ctx.lineTo(s.x + s.w - 6, y + 14); ctx.lineTo(s.x + s.w * 0.45, y + 18); ctx.lineTo(s.x + 4, y + 12); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the cliffs behind the shaft's walls
  const C = 90 * sc.cliffs[0].length;
  sc.cliffs.forEach((col, side) => {
    ctx.fillStyle = '#0e0b14';
    ctx.beginPath(); const edge = side ? W : 0, sgn = side ? -1 : 1;
    ctx.moveTo(edge, -20);
    const off = ((camY * 0.65) % C + C) % C;
    for (let y = -90; y <= vh + 90; y += 45) {
      const i = Math.floor(((y + off) % C + C) % C / 90), d = col[i % col.length].d;
      ctx.lineTo(edge + sgn * (d + Math.sin((y + off) * 0.03) * 8), y);
    }
    ctx.lineTo(edge, vh + 20); ctx.closePath(); ctx.fill();
  });
}

// ── The shaft: rock walls, stone ledges ──
/** Draw the shaft's rock and ledges in world coordinates (the caller translates by -camY). lavaY: for the warm light. */
export function drawShaft(ctx, sc, m, camY, vh, lavaY, t) {
  const r0 = Math.max(0, Math.floor(camY / TILE) - 1), r1 = Math.min(m.R - 1, Math.floor((camY + vh) / TILE) + 1);
  const T = TILE;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const side of [0, 1]) {
    const run = side ? sc.right : sc.left, sx = (x) => (side ? m.w - x : x);
    ctx.beginPath(); ctx.moveTo(sx(-12), r0 * T);
    for (let r = r0; r <= r1; r++) {
      const x = run[r] * T, j = sc.jit[r][side], jb = sc.jit[r][2 + side];
      if (run[r] >= m.C) { ctx.lineTo(sx(m.w / 2 + 2), r * T); ctx.lineTo(sx(m.w / 2 + 2), (r + 1) * T); continue; }
      ctx.lineTo(sx(x + (r > 0 && run[r - 1] > run[r] ? 0 : j * 0.3)), r * T);
      ctx.lineTo(sx(x + jb * 0.5 + 2), r * T + T / 2);
      ctx.lineTo(sx(x + (r < m.R - 1 && run[r + 1] > run[r] ? 0 : sc.jit[r + 1][side] * 0.3)), (r + 1) * T);
    }
    ctx.lineTo(sx(-12), (r1 + 1) * T); ctx.closePath();
    ctx.fillStyle = '#06050a'; ctx.fill();
    ctx.strokeStyle = '#7a2a12'; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    // pale rim light on every top face (where the wall steps out)
    ctx.strokeStyle = '#8a8098'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let r = r0; r <= r1; r++) {
      if (r === 0 || run[r] <= run[r - 1] || run[r] >= m.C) continue;
      ctx.moveTo(sx(run[r - 1] * T + 2), r * T + 0.5); ctx.lineTo(sx(run[r] * T + 1), r * T + 0.5);
    }
    ctx.stroke();
    // a few cracks in the rock face
    ctx.strokeStyle = '#1a1220'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let r = r0; r <= r1; r++) {
      if (run[r] < 1 || run[r] >= m.C || hash(r * 5 + side) > 0.32) continue;
      const x = run[r] * T - 6 - (sc.jit[r][2] + 5) * 0.6, d = hash(r * 11 + side) * 8;
      ctx.moveTo(sx(x), r * T + 2 + d); ctx.lineTo(sx(x - 4 - d * 0.4), r * T + 11 + d); ctx.lineTo(sx(x - 1), r * T + 19 + d * 0.5);
    }
    ctx.stroke();
  }
  // loose rock blocks (not part of a wall)
  for (const b of sc.blocks) {
    if (b.r < r0 || b.r > r1) continue;
    ctx.fillStyle = '#0e0b14'; ctx.fillRect(b.c * T, b.r * T, T, T);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(b.c * T + 1, b.r * T + 1, T - 2, T - 2);
    if (tileAt(m, b.c, b.r - 1) !== ROCK) { ctx.strokeStyle = '#8a8098'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.c * T + 2, b.r * T + 0.5); ctx.lineTo(b.c * T + T - 2, b.r * T + 0.5); ctx.stroke(); }
  }
  // stone ledges: a pale-rimmed top, a jagged dark underside, and the lava's glow beneath when it's close
  for (const L of sc.ledges) {
    if (L.r < r0 || L.r > r1) continue;
    const { x0, x1, y } = L;
    ctx.beginPath(); ctx.moveTo(x0, y + 7);
    for (const [x, d] of L.under) ctx.lineTo(x, y + d);
    ctx.lineTo(x1, y + 7); ctx.closePath();
    ctx.fillStyle = '#15121c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + 3, y); ctx.lineTo(x1 - 3, y); ctx.lineTo(x1 + 1, y + 7); ctx.lineTo(x0 - 1, y + 7); ctx.closePath();
    ctx.fillStyle = '#2a2634'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = '#8a8098'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + 4, y + 0.5); ctx.lineTo(x1 - 4, y + 0.5); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [x, s] of L.cracks) { ctx.moveTo(x, y + 2); ctx.lineTo(x + 3 * s, y + 9); ctx.lineTo(x + s, y + 14); }
    ctx.stroke();
    const heat = Math.max(0.25, Math.min(1, 1 - (lavaY - y) / 420));
    ctx.strokeStyle = '#ff7a1a'; ctx.globalAlpha = 0.6 * heat; ctx.lineWidth = 1.2;
    ctx.beginPath(); L.under.forEach(([x, d], i) => (i ? ctx.lineTo(x, y + d - 1) : ctx.moveTo(x, y + d - 1))); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** The vent at the top: the one cold light in the volcano, and snow drifting down from it. */
export function drawVent(ctx, sc, m, camY, vh, t, glow) {
  const ex = m.exit.x, ey = m.exit.y;
  if (ey - camY > vh + 200) return;
  // find the opening in the ceiling above the exit
  let top = Math.floor(ey / TILE) - 1;
  while (top > 0 && tileAt(m, Math.floor(ex / TILE), top - 1) !== ROCK) top--;
  const oy = top * TILE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 + Math.sin(t * 1.3) * 0.08;
  ctx.drawImage(glow('rgba(160,215,245,0.8)'), ex - 70, oy - 40, 140, 90);
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#cfe8f5';
  for (const [w0, w1, s] of [[30, 110, 0], [16, 70, 1], [40, 150, 2]]) {
    const sway = Math.sin(t * 0.6 + s) * 6;
    ctx.beginPath(); ctx.moveTo(ex - w0, oy); ctx.lineTo(ex + w0, oy); ctx.lineTo(ex + w1 + sway, ey + 6); ctx.lineTo(ex - w1 + sway, ey + 6); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 0.35; ctx.drawImage(glow('rgba(207,232,245,0.7)'), ex - 80, ey - 30, 160, 50);
  ctx.restore();
  // snow falling out of the vent
  ctx.fillStyle = '#eef6fa';
  for (const f of sc.flakes) {
    const yy = oy + ((f.y * 260 + t * f.v) % 260), xx = ex + (f.x - 0.5) * 120 * ((yy - oy) / 260 + 0.3) + Math.sin(t * 1.5 + f.ph) * 5;
    ctx.globalAlpha = 0.75 * (1 - (yy - oy) / 260);
    ctx.fillRect(xx - 1, yy - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
}

// ── The lava ──
let glowStrip = null, moltenStrip = null;
function strip() {
  if (glowStrip) return glowStrip;
  const c = document.createElement('canvas'); c.width = 2; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,122,26,0)'); gr.addColorStop(0.7, 'rgba(255,122,26,0.16)'); gr.addColorStop(1, 'rgba(255,154,60,0.42)');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 128);
  return (glowStrip = c);
}
/** The molten body: white-hot at the surface, deep red further down. */
function molten() {
  if (moltenStrip) return moltenStrip;
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ffb35c'); gr.addColorStop(0.04, '#f76707'); gr.addColorStop(0.14, '#c2410c'); gr.addColorStop(0.32, '#8a2c0e'); gr.addColorStop(0.62, '#5a1c0a'); gr.addColorStop(1, '#3a1006');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  return (moltenStrip = c);
}

/** The lava, in screen coordinates: sy = its surface on screen. */
export function drawLava(ctx, sc, sy, W, vh, t) {
  if (sy > vh + 30) {               // below the screen: just its glow at the bottom edge
    const k = Math.max(0, 1 - (sy - vh) / 260);
    if (k > 0) { ctx.globalAlpha = k * 0.8; ctx.drawImage(strip(), 0, vh - 150, W, 150); ctx.globalAlpha = 1; }
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(strip(), 0, sy - 220, W, 224);
  ctx.globalCompositeOperation = 'source-over';
  const wave = (x, k = 1) => sy + Math.sin(x * 0.045 + t * 1.6) * 3 * k + Math.sin(x * 0.11 - t * 2.3) * 1.6 * k;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, wave(0));
  for (let x = 12; x <= W; x += 12) ctx.lineTo(x, wave(x));
  ctx.lineTo(W, vh + 40); ctx.lineTo(0, vh + 40); ctx.closePath(); ctx.clip();
  ctx.drawImage(molten(), 0, sy - 4, W, 256);
  if (sy + 252 < vh + 40) { ctx.fillStyle = '#4a1508'; ctx.fillRect(0, sy + 252, W, vh + 40 - sy - 252); }
  // the dark crust, broken into drifting plates with glowing cracks
  for (const p of sc.plates) {
    const x = (((p.x + t * p.v) % (W + 80)) + W + 80) % (W + 80) - 40, y = sy + p.d;
    ctx.fillStyle = '#1a0805';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + p.w * 0.8, y - 3); ctx.lineTo(x + p.w, y + 8); ctx.lineTo(x + p.w * 0.4, y + 13); ctx.lineTo(x - 4, y + 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#ffa24a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, wave(0)); for (let x = 12; x <= W; x += 12) ctx.lineTo(x, wave(x)); ctx.stroke();
  ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, wave(0) - 1); for (let x = 12; x <= W; x += 12) ctx.lineTo(x, wave(x) - 1); ctx.stroke();
  // bubbles
  for (const b of sc.bubbles) {
    const k = (t * 0.7 + b.ph) % 2.4;
    if (k > 1) continue;
    ctx.strokeStyle = `rgba(255,217,160,${(1 - k).toFixed(2)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.x, sy + 14 - k * 10, 2 + k * 4, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/** Embers and ash drifting past the camera, and dark rock in the foreground at the edges. */
export function drawForeground(ctx, sc, W, vh, camY, t, lavaSy) {
  ctx.save();
  for (const q of sc.motes) {
    const y = vh - ((q.y * (vh + 60) + t * q.v) % (vh + 60)), x = q.x + Math.sin(t * 0.9 + q.ph) * 12;
    if (q.ash) { ctx.fillStyle = '#8a8098'; ctx.globalAlpha = 0.35; ctx.fillRect(x, y, 1.6, 1.6); continue; }
    const near = Math.max(0.25, Math.min(1, 1 - (lavaSy - y) / 500));
    ctx.fillStyle = q.v > 30 ? '#ffb060' : '#ff9a3c'; ctx.globalAlpha = 0.85 * near;
    ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const P = 170 * sc.spikes.length;
  for (const s of sc.spikes) {
    const y = ((s.y - camY * 1.3) % P + P) % P - 80;
    if (y < -90 || y > vh + 20) continue;
    const e = s.side < 0 ? 0 : W, d = s.side < 0 ? 1 : -1;
    ctx.fillStyle = '#020204';
    ctx.beginPath(); ctx.moveTo(e, y - s.w); ctx.lineTo(e + d * s.len, y + s.w * 0.2); ctx.lineTo(e, y + s.w); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff7a1a'; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(e + d * s.len, y + s.w * 0.2); ctx.lineTo(e, y + s.w); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

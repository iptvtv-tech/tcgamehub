// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — the art.
//
//  THE ICEMAN is the same man of ice who climbed out of the volcano in Magma Escape, drawn the same
//  way: hand-inked, thick dark outlines, the big eight-sided head with its icicle ears, the zigzag
//  snow collar, the ragged scarf and the long ice blade for an arm. On the sled you see him from
//  behind, so his shapes are Magma Escape's own (same points, same colours) turned round: no eyes,
//  no chest crystal. At the hut he turns to face you, and that IS Magma Escape's drawing
//  (drawIceman, imported), so the two games can never drift apart.
//
//  The WOLF and the YETI are painted, not faceted: soft shaded fur with a ragged edge, real joints,
//  dark noses and paws.
//
//  Everything is canvas paths; no image files.
// ─────────────────────────────────────────────────────────────
import { drawIceman, PAL as ICEMAN } from '../magma-escape/art.js';

const TAU = Math.PI * 2;
const INK = '#05050a';
const SLED = { ice: { deck: '#b45309', deckLit: '#d97706', runner: '#7c2d12', rope: '#fde68a' }, gold: { deck: '#f59e0b', deckLit: '#fcd34d', runner: '#92400e', rope: '#fffbeb' } };
/** The Iceman's colours are Magma Escape's; the sled adds its own. */
export const PAL = { ice: { ...ICEMAN.ice, ...SLED.ice }, gold: { ...ICEMAN.gold, ...SLED.gold } };

const path = (ctx, pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); };
const shape = (ctx, pts, fill, line = 2.6) => { path(ctx, pts); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke(); } };
const tint = (ctx, pts, fill, a) => { path(ctx, pts); ctx.fillStyle = fill; ctx.globalAlpha *= a; ctx.fill(); ctx.globalAlpha /= a; };

// Magma Escape's own points for his ears (one side; the other is the mirror image) and his tuft.
const SPIKES = [[-24, -88, -38, -128, -18, -98, 1], [-18, -92, -28, -136, -10, -100, 1], [-10, -96, -14, -122, -2, -98, 0], [-28, -82, -44, -102, -26, -92, 0]];
const TUFT = [[-6, -98, -3, -114, 0, -100], [0, -100, 4, -118, 8, -98]];
const HEAD = [-18, -100, 18, -100, 28, -86, 28, -62, 16, -44, -16, -44, -28, -62, -28, -86];
const TORSO = [-20, -46, 20, -46, 22, -26, 18, -12, -18, -12, -22, -26];
const COLLAR = [-30, -48, -24, -38, -18, -46, -12, -34, -6, -44, 0, -33, 6, -44, 12, -34, 18, -46, 24, -38, 30, -48, 18, -54, -18, -54];
const BLADE = [-4, -6, 8, -8, 74, -1, 10, 9, -4, 6];

function spike(ctx, s, mirror, pal) {
  const m = mirror ? -1 : 1;
  shape(ctx, [s[0] * m, s[1], s[2] * m, s[3], s[4] * m, s[5]], pal.ears, 2.4);
  if (s[6]) tint(ctx, [s[0] * m, s[1], s[2] * m, s[3], (s[0] + (s[4] - s[0]) * 0.35) * m, s[1] - 6], pal.earLit, 0.85);
}

/** The sled alone (art units: 70 wide, the snow at y = 0). */
export function drawSled(ctx, pal = PAL.ice) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  shape(ctx, [-31, 4, -22, 4, -22, -8, -31, -8], pal.runner, 2); shape(ctx, [22, 4, 31, 4, 31, -8, 22, -8], pal.runner, 2);
  // tipped nose-down the hill, so you see the top of the deck running away from you, and the runners' curled tips beyond it
  for (const x of [-22, 22]) { ctx.strokeStyle = INK; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(x, -44); ctx.quadraticCurveTo(x * 0.98, -56, x * 0.8, -55); ctx.stroke(); ctx.strokeStyle = pal.runner; ctx.lineWidth = 3; ctx.stroke(); }
  shape(ctx, [-33, -22, 33, -22, 25, -47, -25, -47], pal.deckLit, 2.4);
  ctx.strokeStyle = pal.deck; ctx.lineWidth = 1.4; ctx.beginPath(); for (const x of [-17, 0, 17]) { ctx.moveTo(x, -22); ctx.lineTo(x * 0.76, -47); } ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.moveTo(-30, -32); ctx.lineTo(30, -32); ctx.stroke(); ctx.globalAlpha /= 0.5;
  shape(ctx, [-35, -6, 35, -6, 33, -22, -33, -22], pal.deck, 2.4);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); for (const x of [-17, 0, 17]) { ctx.moveTo(x, -7); ctx.lineTo(x, -21); } ctx.stroke();
}

/** The Iceman on his sled, from behind. Art units: the sled is 70 wide and the snow is at y = 0.
 *  st: { t, lean (−1..1 steering), tuck, grab, air, boost } */
export function drawIcemanSled(ctx, st, pal = PAL.ice) {
  drawSled(ctx, pal);
  const low = st.tuck || st.grab ? 0.74 : 1;
  ctx.save();
  // his own drawing is 104 units from feet to crown; seated, his hips are on the deck
  // … and he leans forward into the drop, so from behind he is a little foreshortened, his head sunk towards his shoulders
  ctx.translate(st.lean * 2, -24); ctx.scale(0.74, 0.66 * low);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the scarf, streaming back up the hill towards you
  {
    const fl = st.t * 9, pts = [-9, -50];
    [[-15, -64], [-11, -80], [-19, -96], [-9, -108], [-1, -120], [5, -106], [13, -94], [7, -80], [13, -64]].forEach(([x, y], i) => pts.push(x + Math.sin(fl + i) * (1.5 + i * 0.5) - st.lean * (4 + i), y - (st.air ? i * 1.4 : 0)));
    pts.push(9, -50);
    shape(ctx, pts, pal.scarf, 2.3);
    ctx.strokeStyle = pal.scarfLine; ctx.lineWidth = 1; ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.moveTo(0, -56); ctx.lineTo(pts[10] + 2, pts[11] + 6); ctx.stroke(); ctx.globalAlpha /= 0.7;
  }
  // his folded legs on the deck
  shape(ctx, [-20, -14, -4, -14, -6, 2, -24, 2], pal.back, 2.4); shape(ctx, [20, -14, 4, -14, 6, 2, 24, 2], pal.back, 2.4);
  // the left arm, an icicle point, down to the steering rope (or to the deck for a grab)
  ctx.save(); ctx.translate(-19, -44); ctx.rotate(st.grab ? 0.5 : 0.18 - st.lean * 0.12);
  shape(ctx, [1, -2, -11, 4, -25, 40, -1, 20], pal.ears, 2.4);
  ctx.restore();
  if (!st.grab) { ctx.strokeStyle = pal.rope; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-40, -6); ctx.lineTo(-44, 6); ctx.stroke(); }
  // the blade arm, held low along the sled, its point trailing in the snow
  ctx.save(); ctx.translate(19, -42); ctx.rotate(st.grab ? 0.75 : 1.0 + st.lean * 0.12 + Math.sin(st.t * 2.2) * 0.03);
  shape(ctx, BLADE, pal.blade, 2.4);
  ctx.strokeStyle = pal.bladeEdge; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(70, -0.5); ctx.stroke();
  ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(8, -7); ctx.lineTo(73, -1.5); ctx.stroke();
  shape(ctx, [-7, 0, 0, -8, 7, 0, 0, 8], pal.guard, 2);
  ctx.restore();
  // the body: faceted ice with its veins (his back: the chest crystal is on the other side)
  shape(ctx, TORSO, pal.body, 2.6);
  ctx.save(); path(ctx, TORSO); ctx.clip();
  tint(ctx, [-20, -46, 0, -46, -6, -20, -22, -26], pal.light, 0.75);
  tint(ctx, [20, -46, 0, -46, -2, -16, 18, -12, 22, -26], pal.shade, 0.6);
  ctx.restore();
  ctx.strokeStyle = pal.frost; ctx.lineWidth = 1; ctx.globalAlpha *= 0.7;
  ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-6, -30); ctx.lineTo(-12, -22); ctx.moveTo(10, -38); ctx.lineTo(8, -28); ctx.lineTo(13, -19); ctx.moveTo(0, -44); ctx.lineTo(1, -30); ctx.stroke();
  ctx.globalAlpha /= 0.7;
  // the snow collar
  shape(ctx, COLLAR, pal.collar, 2);
  tint(ctx, [-30, -48, -24, -38, -18, -46, -12, -34, -6, -44, 0, -33, -4, -40, -16, -44], pal.collarLo, 0.8);
  // the head, from behind: the same eight sides, ears and tuft; no eyes on this side
  ctx.save(); ctx.translate(st.lean * 3, 0);
  for (const s of SPIKES) { spike(ctx, s, false, pal); spike(ctx, s, true, pal); }
  for (const s of TUFT) spike(ctx, [...s, 0], false, pal);
  shape(ctx, HEAD, pal.head, 3);
  tint(ctx, [-18, -100, 18, -100, 28, -86, 0, -80], pal.headTop, 0.9);
  tint(ctx, [-28, -62, -16, -44, 0, -52, -14, -70], pal.headLo, 0.8);
  tint(ctx, [28, -62, 16, -44, 0, -52, 14, -70], pal.headLo2, 0.7);
  ctx.strokeStyle = pal.frost; ctx.lineWidth = 1.3; ctx.globalAlpha *= 0.6;
  ctx.beginPath(); ctx.moveTo(-24, -88); for (let i = 1; i <= 8; i++) ctx.lineTo(-24 + i * 6, i % 2 ? -80 : -88); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -74); ctx.lineTo(-3, -64); ctx.lineTo(-9, -56); ctx.moveTo(9, -72); ctx.lineTo(6, -62); ctx.lineTo(11, -54); ctx.stroke();
  ctx.globalAlpha /= 0.6;
  ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.4; ctx.globalAlpha *= 0.75;
  ctx.beginPath(); ctx.moveTo(-28, -86); ctx.lineTo(-18, -100); ctx.lineTo(18, -100); ctx.lineTo(28, -86); ctx.stroke();
  ctx.globalAlpha /= 0.75;
  ctx.restore();
  // a rim of light when a clean landing has him flying
  if (st.boost) { ctx.strokeStyle = pal.rim; ctx.lineWidth = 2.5; ctx.globalAlpha *= 0.8; path(ctx, TORSO); ctx.stroke(); ctx.globalAlpha /= 0.8; }
  ctx.restore();
}

/** The Iceman facing you, off his sled at the hut: Magma Escape's own drawing of him.
 *  x, y: where his feet are; h: how tall to draw him (px to the top of his head); k: 0..1 through the arrival. */
export function drawIcemanFront(ctx, x, y, h, t, k, gold, glow) {
  const hop = k > 0.25 && k < 0.6 ? Math.sin((k - 0.25) / 0.35 * Math.PI) : 0;
  drawIceman(ctx, { x, y: y - hop * h * 0.22, k: h / 55, stage: 3, face: 1, mode: hop > 0.05 ? 'jump' : 'idle', phase: 0, t, slash: null, hurt: 0, blinkOut: false, heat: 0, land: k >= 0.6 && k < 0.72 ? 1 - (k - 0.6) / 0.12 : 0 }, gold ? ICEMAN.gold : ICEMAN.ice, glow);
}

// ── Fur ──────────────────────────────────────────────────────
/** A closed outline through the points, ragged like fur: every edge is broken into little tufts. */
function furPath(ctx, pts, tuft = 3, seed = 0) {
  ctx.beginPath();
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[((i + 1) % n) * 2], y1 = pts[((i + 1) % n) * 2 + 1];
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.round(len / (tuft * 1.6))), nx = (y1 - y0) / len, ny = -(x1 - x0) / len;
    if (i === 0) ctx.moveTo(x0, y0);
    for (let j = 1; j <= steps; j++) {
      const a = (j - 0.5) / steps, b = j / steps, r = 0.55 + 0.45 * Math.abs(Math.sin((i * 7 + j + seed) * 12.9898));
      ctx.lineTo(x0 + (x1 - x0) * a + nx * tuft * r, y0 + (y1 - y0) * a + ny * tuft * r);
      ctx.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
    }
  }
  ctx.closePath();
}
/** Short strokes of fur lying in one direction inside a box. */
function furStrokes(ctx, x0, y0, x1, y1, n, dx, dy, col, seed = 0) {
  ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = Math.abs(Math.sin((i + seed) * 78.233)) , b = Math.abs(Math.sin((i + seed) * 37.719)), x = x0 + (x1 - x0) * a, y = y0 + (y1 - y0) * b; ctx.moveTo(x, y); ctx.lineTo(x + dx * (0.6 + b), y + dy * (0.6 + a)); }
  ctx.stroke();
}

/** An arctic wolf running beside the sled, seen from behind and a little to one side, its head turned
 *  to watch you. Art units: about 40 wide and 62 tall, the snow at y = 0.
 *  st: { t, state, side } — before a lunge it sinks low, ears back, eyes burning. */
export function drawWolf(ctx, st) {
  const crouch = st.state === 'crouch', lunge = st.state === 'lunge', down = st.state === 'down';
  const g = st.t * 17, low = crouch ? 0.76 : 1, s = -st.side;        // s: which way its head turns (towards the sled)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (down) { ctx.translate(0, -8); ctx.rotate(st.side * 1.35); }
  const legs = (front) => {
    for (const [x, ph] of front ? [[-7, 1.6], [8, 4.7]] : [[-11, 0], [11, 3.14]]) {
      const k = crouch || down ? 0 : Math.sin(g + ph), top = (front ? -36 : -30) * low, knee = top * 0.5 + (front ? 2 : -3) * k, foot = -Math.max(0, k) * 7;
      ctx.strokeStyle = front ? '#aab6c6' : '#c9d3df'; ctx.lineWidth = front ? 5 : 6.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.quadraticCurveTo(x + (front ? -1 : 2) * (1 + k), knee, x + k * 1.5, foot - 3); ctx.stroke();
      ctx.fillStyle = '#eef2f7'; ctx.beginPath(); ctx.ellipse(x + k * 1.5, foot - 2, front ? 3.2 : 4, 2.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b3442'; ctx.beginPath(); ctx.ellipse(x + k * 1.5, foot - 0.6, front ? 2.6 : 3.2, 1, 0, 0, TAU); ctx.fill();
    }
  };
  legs(true);                                                          // the forelegs, further away
  // chest and shoulders (further off, so a little smaller and cooler)
  let gr = ctx.createLinearGradient(0, -56 * low, 0, -26 * low); gr.addColorStop(0, '#dfe6ee'); gr.addColorStop(1, '#93a1b3');
  furPath(ctx, [-11, -30 * low, -13, -44 * low, -8, -53 * low, 8, -53 * low, 13, -44 * low, 11, -30 * low], 2.4, 3); ctx.fillStyle = gr; ctx.fill();
  legs(false);
  // haunches and back, nearest to you
  gr = ctx.createRadialGradient(-4, -40 * low, 3, 0, -30 * low, 24); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e3e9f0'); gr.addColorStop(1, '#a3b0c1');
  furPath(ctx, [-16, -18 * low, -18, -32 * low, -13, -44 * low, 0, -48 * low, 13, -44 * low, 18, -32 * low, 16, -18 * low, 6, -13 * low, -6, -13 * low], 3, 1); ctx.fillStyle = gr; ctx.fill();
  furStrokes(ctx, -13, -42 * low, 13, -18 * low, 26, 0, 3, 'rgba(120,134,152,0.55)', 2);
  ctx.strokeStyle = 'rgba(96,110,130,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -47 * low); ctx.quadraticCurveTo(1, -38 * low, 0, -28 * low); ctx.stroke();   // the dark line down its back
  // the tail: thick, streaming, dark at the tip
  const sw = down ? 0 : Math.sin(g * 0.5) * 5;
  gr = ctx.createLinearGradient(0, -30 * low, 0, -2); gr.addColorStop(0, '#f4f7fa'); gr.addColorStop(0.7, '#c2ccd8'); gr.addColorStop(1, '#6b7889');
  furPath(ctx, [-4, -30 * low, 4, -30 * low, 7 + sw * 0.6, -16 * low, 4 + sw, -3, sw, 0, -5 + sw, -5, -7 + sw * 0.6, -17 * low], 2.6, 5); ctx.fillStyle = gr; ctx.fill();
  // neck and head, turned towards the sled
  const hx = s * (lunge ? 13 : 8), hy = -56 * low + (crouch ? 5 : 0);
  gr = ctx.createLinearGradient(0, hy - 14, 0, hy + 12); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#aebaca');
  furPath(ctx, [hx - 8, hy + 10, hx - 9, hy - 2, hx - 5, hy - 10, hx + 5, hy - 10, hx + 9, hy - 2, hx + 8, hy + 10], 2.2, 7); ctx.fillStyle = gr; ctx.fill();
  // ears: up when running, laid back before a lunge
  for (const e of [-1, 1]) {
    const ex = hx + e * 6, tip = crouch || lunge ? [ex + e * 5 - s * 4, hy - 14] : [ex + e * 1.5, hy - 22];
    ctx.fillStyle = '#d4dce6'; ctx.beginPath(); ctx.moveTo(ex - 3.5, hy - 8); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(ex + 3.5, hy - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b6676'; ctx.beginPath(); ctx.moveTo(ex - 1.6, hy - 9); ctx.lineTo(tip[0], tip[1] + 4); ctx.lineTo(ex + 1.6, hy - 9); ctx.closePath(); ctx.fill();
  }
  // muzzle in profile: a long snout, black nose, the jaw dropping open in a lunge
  const mx = hx + s * 7, jaw = lunge ? 5 : crouch ? 1.5 : 0;
  ctx.fillStyle = '#f2f5f9'; ctx.beginPath(); ctx.moveTo(hx + s * 2, hy - 5); ctx.quadraticCurveTo(mx + s * 4, hy - 5, mx + s * 9, hy); ctx.lineTo(mx + s * 9, hy + 3); ctx.lineTo(hx + s * 2, hy + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9d2de'; ctx.beginPath(); ctx.moveTo(hx + s * 2, hy + 4); ctx.lineTo(mx + s * 8, hy + 3.5 + jaw); ctx.lineTo(mx + s * 2, hy + 7 + jaw); ctx.lineTo(hx + s * 1, hy + 8); ctx.closePath(); ctx.fill();
  if (jaw > 1) {
    ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.moveTo(hx + s * 3, hy + 3.5); ctx.lineTo(mx + s * 8, hy + 3.2); ctx.lineTo(mx + s * 7.5, hy + 3 + jaw); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; for (const q of [3, 5.5, 8]) { ctx.beginPath(); ctx.moveTo(mx + s * (q - 0.9), hy + 3.2); ctx.lineTo(mx + s * q, hy + 5.6); ctx.lineTo(mx + s * (q + 0.9), hy + 3.2); ctx.closePath(); ctx.fill(); }
  }
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.ellipse(mx + s * 9, hy + 0.6, 1.9, 1.6, 0, 0, TAU); ctx.fill();
  // the eye: amber; before a lunge it burns red
  ctx.fillStyle = crouch || lunge ? '#ff3b30' : '#f5b301'; ctx.beginPath(); ctx.ellipse(hx + s * 3.2, hy - 2.6, crouch ? 2.2 : 1.7, crouch ? 1.6 : 1.3, s * -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(hx + s * 3.5, hy - 2.6, 0.7, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4b5565'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(hx + s * 0.8, hy - 4.6); ctx.lineTo(hx + s * 5.6, hy - 4 + (crouch || lunge ? 1.2 : 0)); ctx.stroke();   // the brow
}

/** A yeti standing on the slope, facing up the hill at you. Art units: about 80 wide and 124 tall, the snow at y = 0.
 *  st: { t, arm (0..1, wound up to throw), flat } */
export function drawYeti(ctx, st) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (st.flat) {                         // flattened: a heap of fur, two dazed eyes, a foot in the air
    const gr = ctx.createLinearGradient(0, -24, 0, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b4c2d4');
    furPath(ctx, [-42, 0, -38, -12, -18, -22, 10, -24, 34, -15, 42, 0], 3.5, 2); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = '#3d5673'; ctx.beginPath(); ctx.ellipse(0, -13, 13, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#eaf2fb'; ctx.lineWidth = 2; for (const x of [-6, 6]) { ctx.beginPath(); ctx.moveTo(x - 2.5, -16); ctx.lineTo(x + 2.5, -11); ctx.moveTo(x + 2.5, -16); ctx.lineTo(x - 2.5, -11); ctx.stroke(); }
    ctx.fillStyle = '#3d5673'; ctx.beginPath(); ctx.ellipse(33, -22, 7, 4.5, -0.5, 0, TAU); ctx.fill();
    return;
  }
  const br = Math.sin(st.t * 2.2), up = st.arm, sway = br * 1.5;
  // legs: short and thick, dark soles and claws
  for (const sx of [-1, 1]) {
    const gr = ctx.createLinearGradient(0, -40, 0, 0); gr.addColorStop(0, '#e9eff6'); gr.addColorStop(1, '#9fb0c4');
    furPath(ctx, [sx * 6, -40, sx * 26, -40, sx * 28, -8, sx * 24, 0, sx * 6, 0, sx * 4, -10], 3, sx + 2); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = '#31475f'; ctx.beginPath(); ctx.ellipse(sx * 16, -2, 12, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8eef5'; for (const c of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(sx * 16 + c - 2, -1); ctx.lineTo(sx * 16 + c, 3.5); ctx.lineTo(sx * 16 + c + 2, -1); ctx.closePath(); ctx.fill(); }
  }
  // the hanging arm: long, the hand below the knee
  const arm = (sx, raise) => {
    const sh = [sx * 34, -92 - br], el = raise > 0.1 ? [sx * 50, -100 - raise * 26] : [sx * 46 + sway * sx, -62], hd = raise > 0.1 ? [sx * 44, -118 - raise * 30] : [sx * 44 + sway * sx * 1.5, -30];
    const gr = ctx.createLinearGradient(sh[0], sh[1], hd[0], hd[1]); gr.addColorStop(0, '#f1f5fa'); gr.addColorStop(1, '#a9b9cc');
    furPath(ctx, [sh[0] - sx * 9, sh[1] + 4, sh[0] + sx * 5, sh[1] - 6, el[0] + sx * 8, el[1], hd[0] + sx * 8, hd[1], hd[0] - sx * 6, hd[1] + 2, el[0] - sx * 8, el[1] + 6], 3.2, sx * 3 + 9); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = '#31475f'; ctx.beginPath(); ctx.ellipse(hd[0] + sx, hd[1] + (raise > 0.1 ? -5 : 6), 8, 7, 0, 0, TAU); ctx.fill();
    return hd;
  };
  arm(-1, 0);
  // the body: a mountain of shoulders narrowing to the hips, shaded from the top
  let gr = ctx.createRadialGradient(-10, -92, 6, 0, -70, 62); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#e6edf5'); gr.addColorStop(1, '#93a5bb');
  furPath(ctx, [-26, -36, -34, -60, -40, -84, -34, -102 - br, -16, -110 - br, 16, -110 - br, 34, -102 - br, 40, -84, 34, -60, 26, -36, 0, -30], 4, 1); ctx.fillStyle = gr; ctx.fill();
  furStrokes(ctx, -30, -100, 30, -40, 70, 0, 5, 'rgba(118,136,158,0.5)', 4);
  ctx.fillStyle = 'rgba(70,92,120,0.22)'; ctx.beginPath(); ctx.ellipse(0, -62, 20, 24, 0, 0, TAU); ctx.fill();          // the shadow of its belly
  // the head, sunk between the shoulders: a crest of fur, dark bare face
  gr = ctx.createLinearGradient(0, -134, 0, -100); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c3d0e0');
  furPath(ctx, [-19, -100 - br, -22, -116 - br, -13, -131 - br, 0, -136 - br, 13, -131 - br, 22, -116 - br, 19, -100 - br], 3.4, 6); ctx.fillStyle = gr; ctx.fill();
  const fy = -113 - br;
  ctx.fillStyle = '#3d5673'; ctx.beginPath(); ctx.moveTo(-13, fy - 8); ctx.quadraticCurveTo(0, fy - 14, 13, fy - 8); ctx.quadraticCurveTo(16, fy + 4, 9, fy + 12); ctx.quadraticCurveTo(0, fy + 16, -9, fy + 12); ctx.quadraticCurveTo(-16, fy + 4, -13, fy - 8); ctx.fill();
  ctx.fillStyle = '#2a3d55'; ctx.beginPath(); ctx.moveTo(-14, fy - 7); ctx.quadraticCurveTo(0, fy - 2, 14, fy - 7); ctx.quadraticCurveTo(0, fy - 13, -14, fy - 7); ctx.fill();   // the heavy brow
  for (const sx of [-1, 1]) {                                                  // deep-set eyes that catch the light
    ctx.fillStyle = '#0d1826'; ctx.beginPath(); ctx.ellipse(sx * 6, fy - 2.5, 4, 2.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = up > 0.2 ? '#ffd84d' : '#bfe9ff'; ctx.beginPath(); ctx.arc(sx * 6, fy - 2.3, 1.7, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#22344a'; ctx.beginPath(); ctx.moveTo(-3.5, fy + 2); ctx.lineTo(3.5, fy + 2); ctx.lineTo(2, fy + 5); ctx.lineTo(-2, fy + 5); ctx.closePath(); ctx.fill();   // the flat nose
  const open = 1.5 + up * 5;                                                    // the mouth roars open as it throws
  ctx.fillStyle = '#571a1a'; ctx.beginPath(); ctx.ellipse(0, fy + 9, 6.5, open, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f8fafc'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 5.5, fy + 9 - open); ctx.lineTo(sx * 4, fy + 9 - open + 3 + up * 2); ctx.lineTo(sx * 2.6, fy + 9 - open); ctx.closePath(); ctx.fill(); }
  // the throwing arm, wound up with a snow boulder
  const hd = arm(1, up);
  if (up > 0.15) {
    const g2 = ctx.createRadialGradient(hd[0] - 3, hd[1] - 20, 2, hd[0], hd[1] - 16, 14); g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#b9cbe0');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(hd[0], hd[1] - 16, 13, 0, TAU); ctx.fill();
  }
}

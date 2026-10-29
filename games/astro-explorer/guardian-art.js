// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — the guardians' art (canvas paths, cosmetic only: reads state, changes nothing).
//  Mite Matriarch · Storm Jelly · Magma Wyrm, their attacks, the lair gate, treasure chests.
//  World pixels; each guardian is drawn from its sim object g (see guardians.js).
// ─────────────────────────────────────────────────────────────
import { wyrmSegments } from './guardians.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

// ── Mite Matriarch ──────────────────────────────────────────
/** A giant armoured mite: banded shell with spines, a glowing brood sac, six heavy legs, a crown of eyes. */
export function drawMatriarch(ctx, g, t) {
  const white = g.hurtT > 0.05, s = g.state, red = g.phase2;
  let rear = 0, squash = 1, legRate = 1.2, eyeHot = 0, mouth = 0.15, shake = 0;
  if (s === 'sleep') { squash = 0.82; legRate = 0; }
  else if (s === 'wake') { const k = Math.min(1, g.t / 0.5); rear = Math.sin(Math.min(1, g.t / 1.0) * Math.PI) * 0.35; eyeHot = k; mouth = 0.2 + 0.8 * Math.sin(Math.min(1, g.t / 1.2) * Math.PI); }
  else if (s === 'charge-tele') { const k = Math.min(1, g.t / Math.max(0.01, g.dur)); rear = 0.32 * k; eyeHot = k; mouth = 0.7 * k; shake = k * 0.8; }
  else if (s === 'charge') { legRate = 5.5; rear = -0.06; eyeHot = 1; mouth = 0.4; }
  else if (s === 'stun') { squash = 0.9; legRate = 0; rear = -0.08 + Math.sin(g.t * 20) * 0.02; }
  else if (s === 'leap-tele') { squash = 1 - 0.2 * Math.min(1, g.t / Math.max(0.01, g.dur)); legRate = 0; eyeHot = 0.6; }
  else if (s === 'leap') { squash = g.vy < 0 ? 1.12 : 1.05; legRate = 0; rear = g.vy < 0 ? 0.12 : -0.1; }
  else if (s === 'slam') { squash = Math.min(1, 0.78 + g.t * 0.8); legRate = 0; }
  else if (s === 'brood-tele') { const k = Math.min(1, g.t / Math.max(0.01, g.dur)); rear = 0.28 * k; mouth = k; eyeHot = 0.5; shake = 0.5; }
  else if (s === 'dying') { shake = 1.6; squash = 1 - 0.15 * Math.min(1, g.t / g.dur); }
  if (g.shake > 0) shake = Math.max(shake, 1.2);
  const jx = shake ? Math.sin(t * 70) * shake : 0;
  const shell = white ? ['#ffffff', '#f5f3ff', '#ede9fe'] : red ? ['#a21caf', '#6b21a8', '#3b0764'] : ['#8b5cf6', '#6d28d9', '#3b0764'];
  const legC = white ? '#fff' : '#1e1035', eye = white ? '#fff' : red ? '#fde047' : '#86efac';
  ctx.save(); ctx.translate(g.x + jx, g.y); ctx.scale(g.face, 1);
  // legs: three pairs, far side darker, a walking gait
  const ph = t * 8 * legRate;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 3; i++) {
      const bx = -14 + i * 13, sw = legRate ? Math.sin(ph + i * 2.1 + side * Math.PI) * 4 : 0, lift = legRate ? Math.max(0, Math.cos(ph + i * 2.1 + side * Math.PI)) * 3 : 0;
      ctx.strokeStyle = side ? (white ? '#fff' : '#120a24') : legC; ctx.lineWidth = side ? 3.2 : 3.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(bx, -12 * squash); ctx.lineTo(bx + 6 + sw, -20 * squash - 2); ctx.lineTo(bx + 9 + sw * 1.2, -lift); ctx.stroke();
      if (!side) { ctx.fillStyle = white ? '#fff' : '#a78bfa'; ctx.beginPath(); ctx.arc(bx + 9 + sw * 1.2, -lift, 1.6, 0, TAU); ctx.fill(); }
    }
  }
  ctx.save(); ctx.scale(1, squash); ctx.rotate(-rear);
  // the brood sac behind, glowing (pulses faster before a brood call)
  const pulse = 0.5 + 0.5 * Math.sin(t * (s === 'brood-tele' ? 14 : 3));
  const sac = ctx.createRadialGradient(-26, -18, 2, -24, -16, 17);
  sac.addColorStop(0, white ? '#fff' : `rgba(250,${200 + 40 * pulse | 0},255,1)`); sac.addColorStop(0.6, white ? '#fff' : red ? '#db2777' : '#c026d3'); sac.addColorStop(1, white ? '#f5f3ff' : '#4a044e');
  ctx.fillStyle = sac; ctx.beginPath(); ctx.ellipse(-24, -16, 15, 12, -0.2, 0, TAU); ctx.fill();
  if (!white) { ctx.fillStyle = 'rgba(255,255,255,.25)'; for (const [ex, ey] of [[-28, -20], [-22, -12], [-30, -12], [-19, -21]]) { ctx.beginPath(); ctx.arc(ex, ey, 2.2, 0, TAU); ctx.fill(); } }
  // shell: three overlapping bands, each with spines
  for (let b = 0; b < 3; b++) {
    const cx = -9 + b * 11, w = 15 - b, h = 17 - b * 1.5;
    const sg = ctx.createLinearGradient(0, -34, 0, -6);
    sg.addColorStop(0, shell[0]); sg.addColorStop(0.55, shell[1]); sg.addColorStop(1, shell[2]);
    ctx.fillStyle = 'rgba(10,5,25,.7)'; ctx.beginPath(); ctx.ellipse(cx, -14, w + 1.2, h + 1.2, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(cx, -14, w, h, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    // spines
    ctx.fillStyle = white ? '#fff' : red ? '#fca5a5' : '#ddd6fe';
    for (let k = -1; k <= 1; k++) { const a = -Math.PI / 2 + k * 0.55, px = cx + Math.cos(a) * w * 0.92, py = -14 + Math.sin(a) * h * 0.92; ctx.beginPath(); ctx.moveTo(px - 2, py + 1); ctx.lineTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5); ctx.lineTo(px + 2, py + 1); ctx.fill(); }
    // phase two: glowing cracks
    if (red && !white) { ctx.strokeStyle = `rgba(253,224,71,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(cx - 4, -26 + b); ctx.lineTo(cx - 1, -20); ctx.lineTo(cx - 5, -15); ctx.moveTo(cx - 1, -20); ctx.lineTo(cx + 4, -17); ctx.stroke(); }
  }
  ctx.fillStyle = white ? '#fff' : '#1e1035'; ctx.fillRect(-24, -15, 50, 3);       // belly line
  // head
  const hx = 25, hy = -13;
  ctx.fillStyle = 'rgba(10,5,25,.7)'; ctx.beginPath(); ctx.ellipse(hx, hy, 10.5, 9.5, 0.1, 0, TAU); ctx.fill();
  const hg = ctx.createRadialGradient(hx - 3, hy - 4, 1, hx, hy, 10);
  hg.addColorStop(0, white ? '#fff' : '#4c1d95'); hg.addColorStop(1, white ? '#f5f3ff' : '#1e1035');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(hx, hy, 9.5, 8.6, 0.1, 0, TAU); ctx.fill();
  // crown of eyes
  const blink = s === 'stun' ? 0.25 : 1;
  ctx.fillStyle = eye;
  for (const [ex, ey, r] of [[hx + 4, hy - 4, 2.1], [hx + 7.5, hy - 1, 1.6], [hx, hy - 5.5, 1.5], [hx + 6, hy - 6.5, 1.2]]) { ctx.beginPath(); ctx.ellipse(ex, ey, r, r * blink, 0, 0, TAU); ctx.fill(); }
  if (eyeHot > 0 && !white) { ctx.fillStyle = `rgba(255,255,255,${0.8 * eyeHot})`; ctx.beginPath(); ctx.arc(hx + 4, hy - 4, 0.9, 0, TAU); ctx.fill(); }
  // mandibles
  const op = 0.25 + 0.6 * mouth;
  ctx.strokeStyle = white ? '#fff' : '#e9d5ff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx + 7, hy + 3); ctx.quadraticCurveTo(hx + 15, hy + 2 - op * 4, hx + 16, hy + 7 - op * 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx + 7, hy + 5); ctx.quadraticCurveTo(hx + 15, hy + 7 + op * 3, hx + 15, hy + 11 + op * 2); ctx.stroke();
  ctx.restore();
  if (s === 'stun' && !white) {                           // dazed: little stars round the head
    for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.09; ctx.fillStyle = '#fde68a'; star(ctx, 26 + Math.cos(a) * 10, -34 + Math.sin(a) * 3, 2.2); }
  }
  ctx.restore();
}

// ── Storm Jelly ─────────────────────────────────────────────
/** A great space jellyfish: a ribbed glowing bell, a bright core, frilled rim and long electric tendrils. */
export function drawJelly(ctx, g, t, glow) {
  const white = g.hurtT > 0.05, s = g.state, red = g.phase2;
  let pulse = 0.5 + 0.5 * Math.sin(t * 3.2), sx = 1, sy = 1, bright = 0.5, limp = 0, shake = 0;
  if (s === 'sleep') { bright = 0.12; sx = 0.92; sy = 0.86; limp = 0.6; }
  else if (s === 'wake') bright = 0.12 + 0.88 * Math.min(1, g.t / 1.0);
  else if (s === 'ring-tele' || s === 'ring2') { const k = Math.min(1, g.t / Math.max(0.01, g.dur)); bright = 0.6 + 0.4 * k; sx = 1 - 0.12 * k; sy = 1 + 0.1 * k; }
  else if (s === 'dive-tele') { bright = 0.8; shake = g.shake > 0 ? 1.5 : 0; }
  else if (s === 'dive') { sx = 0.75; sy = 1.3; bright = 1; }
  else if (s === 'stuck') { sx = 1.25; sy = 0.65; bright = 0.25 + 0.1 * Math.sin(t * 6); limp = 1; }
  else if (s === 'storm-tele') { bright = 0.9; }
  else if (s === 'dying') { const k = Math.min(1, g.t / g.dur); sx = 1 + 0.2 * k; sy = 1 - 0.5 * k; bright = (1 - k) * (0.5 + 0.5 * Math.sin(t * 30)); limp = k; shake = 1; }
  if (g.shake > 0) shake = Math.max(shake, 1.2);
  const cx = g.x + (shake ? Math.sin(t * 60) * shake : 0), cy = g.y;
  const C = white ? ['#ffffff', '#ffffff', '#ffffff'] : red ? ['#f5d0fe', '#c084fc', '#581c87'] : ['#ecfeff', '#22d3ee', '#164e63'];
  if (glow) { ctx.globalAlpha = 0.25 + 0.5 * bright; ctx.drawImage(glow, cx - 54, cy - 50, 108, 100); ctx.globalAlpha = 1; }
  // tendrils (drawn first, behind the bell)
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const bx = cx + (i - 3.5) * 5.6 * sx, len = (34 + (i % 3) * 8) * (1 - 0.35 * limp);
    ctx.strokeStyle = white ? '#fff' : red ? 'rgba(216,180,254,.75)' : 'rgba(165,243,252,.7)'; ctx.lineWidth = i % 2 ? 1.6 : 2.4;
    ctx.beginPath(); ctx.moveTo(bx, cy + 10 * sy);
    for (let k = 1; k <= 6; k++) {
      const yy = cy + 10 * sy + (len * k) / 6, ww = Math.sin(t * 4 + k * 0.8 + i * 1.3) * (2 + k * 0.7) * (1 - limp * 0.6);
      ctx.lineTo(bx + ww + (limp ? (i - 3.5) * k * 0.9 : 0), limp ? Math.min(yy, g.y + 13) : yy);
    }
    ctx.stroke();
  }
  // electric arcs crackling along the tendrils (brighter before a storm)
  if (!white && (s === 'storm-tele' || (bright > 0.7 && Math.floor(t * 9) % 3 === 0))) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.9;
    for (let i = 0; i < 2; i++) {
      const bx = cx + (Math.sin(t * 13 + i * 5) * 16);
      ctx.beginPath(); ctx.moveTo(bx, cy + 12);
      for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 40 + k * 7 + i) * 5, cy + 12 + k * 7);
      ctx.stroke();
    }
  }
  // bell
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy);
  const bg = ctx.createRadialGradient(-6, -10, 2, 0, -2, 28);
  bg.addColorStop(0, C[0]); bg.addColorStop(0.45, C[1]); bg.addColorStop(1, C[2]);
  ctx.globalAlpha = white ? 1 : 0.92;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, 26, 21, 0, Math.PI, 0);
  // the frilled rim
  for (let k = 0; k <= 10; k++) { const x = 26 - k * 5.2; ctx.quadraticCurveTo(x - 1.3, 12 + (k % 2 ? 3 : 0), x - 2.6, 9 + (k % 2 ? 0 : 3)); }
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // ribs
  ctx.strokeStyle = white ? '#fff' : `rgba(255,255,255,${0.22 + 0.2 * bright})`; ctx.lineWidth = 1;
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) { ctx.beginPath(); ctx.moveTo(Math.sin(a) * 8, -19 + Math.abs(a) * 4); ctx.quadraticCurveTo(Math.sin(a) * 18, -8, Math.sin(a) * 24, 9); ctx.stroke(); }
  // the core: what glows before it fires
  const core = ctx.createRadialGradient(0, -6, 0.5, 0, -6, 10 + 5 * bright);
  core.addColorStop(0, `rgba(255,255,255,${0.5 + 0.5 * bright})`); core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, -6, 10 + 5 * bright, 0, TAU); ctx.fill();
  // eyes
  ctx.fillStyle = white ? '#fff' : red ? '#3b0764' : '#083344';
  const ey = s === 'stuck' ? 0.3 : 1;
  ctx.beginPath(); ctx.ellipse(-7 + g.face * 3, -3, 2.4, 2.8 * ey, 0, 0, TAU); ctx.ellipse(7 + g.face * 3, -3, 2.4, 2.8 * ey, 0, 0, TAU); ctx.fill();
  if (!white) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(-6.3 + g.face * 3, -4, 0.8, 0, TAU); ctx.arc(7.7 + g.face * 3, -4, 0.8, 0, TAU); ctx.fill(); }
  // highlight
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(-3, -4, 18, 13, 0, -2.6, -1.7); ctx.stroke();
  ctx.restore();
  ctx.lineCap = 'butt';
}

// ── Magma Wyrm ──────────────────────────────────────────────
/** The wake under the floor while it swims: glowing cracks and spurts of dust where it passes. */
export function drawWyrmWake(ctx, g, t, floorY) {
  const under = ['under', 'arc-move', 'spit-move', 'erupt-tele', 'arc-tele'].includes(g.state) || (g.state === 'wake' && g.y > floorY + 20);
  if (!under || g.dead) return;
  const tele = g.state.endsWith('-tele'), k = tele ? Math.min(1, g.t / Math.max(0.01, g.dur)) : 0;
  const w = tele ? 16 + 14 * k : 22;
  const gr = ctx.createRadialGradient(g.x, floorY, 1, g.x, floorY, w + 10);
  gr.addColorStop(0, `rgba(254,215,170,${tele ? 0.55 + 0.4 * k : 0.4})`); gr.addColorStop(0.5, 'rgba(249,115,22,.35)'); gr.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = gr; ctx.fillRect(g.x - w - 10, floorY - 22, (w + 10) * 2, 30);
  ctx.strokeStyle = `rgba(253,186,116,${tele ? 0.7 + 0.3 * Math.sin(t * 30) : 0.55})`; ctx.lineWidth = 1.3; ctx.lineJoin = 'miter';
  ctx.beginPath();
  const seed = Math.floor(g.x / 9);
  for (let i = -2; i <= 2; i++) { const x = g.x + i * 7; ctx.moveTo(x, floorY); ctx.lineTo(x + ((seed + i) % 3 - 1) * 3, floorY + 4); ctx.lineTo(x + ((seed * 7 + i) % 5 - 2), floorY + 8); }
  ctx.stroke();
}
export function drawWyrm(ctx, g, t, floorY) {
  if (g.state === 'sleep' || g.dead) return;
  const white = g.hurtT > 0.05, red = g.phase2, segs = wyrmSegments(g);
  ctx.save();
  ctx.beginPath(); ctx.rect(g.x - 400, floorY - 400, 800, 400); ctx.clip();       // nothing shows below the floor line
  for (let i = segs.length - 1; i >= 1; i--) {
    const sg = segs[i]; if (sg.y - sg.r > floorY) continue;
    const gr = ctx.createRadialGradient(sg.x - sg.r * 0.3, sg.y - sg.r * 0.4, 1, sg.x, sg.y, sg.r);
    gr.addColorStop(0, white ? '#fff' : '#57534e'); gr.addColorStop(0.7, white ? '#fff' : '#292524'); gr.addColorStop(1, white ? '#f5f5f4' : '#0c0a09');
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(sg.x, sg.y, sg.r + 1.2, 0, TAU); ctx.fill();
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sg.x, sg.y, sg.r, 0, TAU); ctx.fill();
    if (!white) {                                         // glowing lava seams
      ctx.strokeStyle = red ? `rgba(254,240,138,${0.7 + 0.3 * Math.sin(t * 8 + i)})` : `rgba(251,146,60,${0.6 + 0.3 * Math.sin(t * 5 + i)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sg.x, sg.y, sg.r * 0.62, i + t * 0.5, i + t * 0.5 + 1.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sg.x - sg.r * 0.5, sg.y + sg.r * 0.2); ctx.lineTo(sg.x + sg.r * 0.1, sg.y - sg.r * 0.1); ctx.stroke();
    }
    // dorsal spike
    const nx = i > 0 ? segs[i - 1].x - sg.x : 1, ny = i > 0 ? segs[i - 1].y - sg.y : 0, l = Math.hypot(nx, ny) || 1, px = -ny / l, py = nx / l;
    const up = py < 0 ? 1 : -1;
    ctx.fillStyle = white ? '#fff' : '#44403c';
    ctx.beginPath(); ctx.moveTo(sg.x + px * up * sg.r * 0.7 - nx / l * 3, sg.y + py * up * sg.r * 0.7 - ny / l * 3); ctx.lineTo(sg.x + px * up * (sg.r + 6), sg.y + py * up * (sg.r + 6)); ctx.lineTo(sg.x + px * up * sg.r * 0.7 + nx / l * 3, sg.y + py * up * sg.r * 0.7 + ny / l * 3); ctx.fill();
  }
  // the head, turned along its path, jaw open to spit
  const h = segs[0], n = segs[1] || { x: h.x, y: h.y + 10 };
  const ang = Math.atan2(h.y - n.y, h.x - n.x);
  if (h.y - h.r <= floorY) {
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
    const open = g.state === 'spit' ? 0.5 + 0.5 * Math.sin(Math.min(1, (g.t % 0.32) / 0.32) * Math.PI) : g.state.endsWith('-tele') || g.state === 'erupt' ? 0.4 : 0.15;
    const hg = ctx.createRadialGradient(-3, -4, 1, 0, 0, 15);
    hg.addColorStop(0, white ? '#fff' : '#78716c'); hg.addColorStop(1, white ? '#f5f5f4' : '#1c1917');
    // lower jaw
    ctx.fillStyle = white ? '#fff' : '#292524';
    ctx.beginPath(); ctx.moveTo(-8, 3); ctx.quadraticCurveTo(10, 6 + open * 6, 19, 4 + open * 9); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill();
    if (!white) { ctx.fillStyle = `rgba(253,186,116,${0.5 + 0.5 * open})`; ctx.beginPath(); ctx.moveTo(0, 3); ctx.quadraticCurveTo(10, 4 + open * 5, 16, 3 + open * 7); ctx.lineTo(2, 6); ctx.closePath(); ctx.fill(); }
    // skull
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(0, -1, 15, 11.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(-13, -2); ctx.quadraticCurveTo(-12, -12, 2, -11); ctx.quadraticCurveTo(16, -9, 20, -1 - open * 2); ctx.quadraticCurveTo(10, 3, -8, 4); ctx.closePath(); ctx.fill();
    // horns
    ctx.fillStyle = white ? '#fff' : '#a8a29e';
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(-14, -18, -20, -17); ctx.quadraticCurveTo(-12, -13, -9, -6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-4, -20, -10, -22); ctx.quadraticCurveTo(-4, -15, -2, -8); ctx.fill();
    // eye
    ctx.fillStyle = white ? '#fff' : red ? '#fef08a' : '#fb923c';
    ctx.beginPath(); ctx.ellipse(6, -5, 2.8, 2, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1c1917'; ctx.beginPath(); ctx.ellipse(6.6, -5, 0.8, 1.7, 0, 0, TAU); ctx.fill();
    // teeth
    if (!white) { ctx.fillStyle = '#e7e5e4'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(8 + k * 4, 0); ctx.lineTo(9.5 + k * 4, 3.5 + open); ctx.lineTo(11 + k * 4, 0); ctx.fill(); } }
    ctx.restore();
  }
  ctx.restore();
}

// ── Their attacks ────────────────────────────────────────────
export function drawBossShot(ctx, s, t, a) {
  if (s.kind === 'wave') {                                // a shockwave of rock shards along the floor
    const d = Math.sign(s.vx) || 1, k = 1 - s.t / s.life;
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(d, 1);
    const gr = ctx.createLinearGradient(-12, 0, 6, 0); gr.addColorStop(0, 'rgba(196,181,253,0)'); gr.addColorStop(1, 'rgba(233,213,255,.8)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.quadraticCurveTo(-2, -s.h - 2, 7, 0); ctx.fill();
    ctx.fillStyle = '#ede9fe';
    for (let i = 0; i < 3; i++) { const x = -i * 5, h = s.h * (1 - i * 0.25); ctx.beginPath(); ctx.moveTo(x - 2.5, 0); ctx.lineTo(x + 0.5, -h); ctx.lineTo(x + 3, 0); ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = 1 - k * 0;
  } else if (s.kind === 'orb') {
    ctx.fillStyle = 'rgba(103,232,249,.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.45, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(236,254,255,.8)'; ctx.lineWidth = 0.7;
    const q = t * 20 + s.x; ctx.beginPath(); ctx.moveTo(s.x + Math.cos(q) * s.r, s.y + Math.sin(q) * s.r); ctx.lineTo(s.x + Math.cos(q) * (s.r + 4), s.y + Math.sin(q) * (s.r + 4)); ctx.stroke();
  } else if (s.kind === 'warn') {                         // where the lightning will fall
    const k = s.t / s.life, flick = 0.5 + 0.5 * Math.sin(t * (8 + k * 30));
    ctx.fillStyle = `rgba(165,243,252,${0.05 + 0.14 * k * flick})`; ctx.fillRect(s.x - s.w, a.ceilY, s.w * 2, a.floorY - a.ceilY);
    ctx.strokeStyle = `rgba(165,243,252,${0.3 + 0.5 * k})`; ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(s.x, a.ceilY); ctx.lineTo(s.x, a.floorY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(236,254,255,${0.4 + 0.5 * k})`; ctx.beginPath(); ctx.ellipse(s.x, a.floorY - 1, s.w + 3 * k, 2.5, 0, 0, TAU); ctx.fill();
  } else if (s.kind === 'zap') {                          // the strike
    const k = 1 - s.t / s.life;
    ctx.fillStyle = `rgba(165,243,252,${0.3 * k})`; ctx.fillRect(s.x - s.w - 4, a.ceilY, (s.w + 4) * 2, a.floorY - a.ceilY);
    for (const [w, col] of [[7, `rgba(103,232,249,${0.7 * k})`], [2.6, `rgba(255,255,255,${k})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'miter'; ctx.beginPath();
      const n = 9, h = (a.floorY - a.ceilY) / n;
      ctx.moveTo(s.x, a.ceilY);
      for (let i = 1; i <= n; i++) ctx.lineTo(s.x + (i < n ? Math.sin(i * 12.7 + Math.floor(t * 30)) * 7 : 0), a.ceilY + i * h);
      ctx.stroke();
    }
  } else if (s.kind === 'glob') {
    ctx.fillStyle = 'rgba(249,115,22,.4)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 3, 0, TAU); ctx.fill();
    const gr = ctx.createRadialGradient(s.x - 1.5, s.y - 1.5, 0.5, s.x, s.y, s.r);
    gr.addColorStop(0, '#fef3c7'); gr.addColorStop(0.5, '#fb923c'); gr.addColorStop(1, '#9a3412');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  } else if (s.kind === 'puddle') {                       // burning magma on the floor
    const k = Math.min(1, s.t / 0.12) * Math.min(1, (s.life - s.t) / 0.3);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#9a3412'; ctx.beginPath(); ctx.ellipse(s.x, s.y - 1, s.w, 3.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.ellipse(s.x, s.y - 1.5, s.w * 0.8, 2.2, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const fx = s.x - s.w * 0.7 + i * s.w * 0.47, fh = 6 + 4 * Math.sin(t * 14 + i * 2);
      const fg = ctx.createLinearGradient(0, s.y - fh, 0, s.y);
      fg.addColorStop(0, 'rgba(254,240,138,0)'); fg.addColorStop(1, 'rgba(251,146,60,.9)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(fx - 2.5, s.y - 1); ctx.quadraticCurveTo(fx, s.y - fh * 1.3, fx + 2.5, s.y - 1); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** The lair's gate while it's shut: an energy barrier across the opening. */
export function drawGate(ctx, x, y, h, t, open) {
  if (open >= 1) return;
  const a = 1 - open;
  ctx.globalAlpha = a;
  const gr = ctx.createLinearGradient(x, 0, x + 24, 0);
  gr.addColorStop(0, 'rgba(244,63,94,0)'); gr.addColorStop(0.5, `rgba(251,113,133,${0.55 + 0.2 * Math.sin(t * 9)})`); gr.addColorStop(1, 'rgba(244,63,94,0)');
  ctx.fillStyle = gr; ctx.fillRect(x, y, 24, h);
  ctx.strokeStyle = 'rgba(255,228,230,.85)'; ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); const bx = x + 7 + i * 5;
    ctx.moveTo(bx, y);
    for (let k = 1; k <= 8; k++) ctx.lineTo(bx + Math.sin(t * 25 + k * 3 + i * 2) * 1.6, y + (h * k) / 8);
    ctx.stroke();
  }
  ctx.fillStyle = '#4c0519'; ctx.fillRect(x + 2, y - 4, 20, 4); ctx.fillRect(x + 2, y + h, 20, 4);
  ctx.fillStyle = '#fb7185'; ctx.fillRect(x + 4, y - 3, 16, 1.5); ctx.fillRect(x + 4, y + h + 1.5, 16, 1.5);
  ctx.globalAlpha = 1;
}

/** A treasure chest (feet x, y): rattles when hit, bursts open into star dust. */
export function drawChest(ctx, c, t) {
  if (c.open) {
    ctx.fillStyle = '#422006'; roundBox(ctx, c.x - 10, c.y - 9, 20, 9, 2); ctx.fill();
    ctx.fillStyle = '#78350f'; roundBox(ctx, c.x - 9, c.y - 8, 18, 7, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(253,224,71,.35)'; ctx.fillRect(c.x - 8, c.y - 9, 16, 2);
    ctx.save(); ctx.translate(c.x - 10, c.y - 9); ctx.rotate(-1.9);
    ctx.fillStyle = '#92400e'; roundBox(ctx, 0, -1, 20, 7, 2); ctx.fill(); ctx.restore();
    return;
  }
  const j = c.hurtT > 0 ? Math.sin(t * 80) * 1.5 : 0, x = c.x + j, y = c.y;
  const glow = 0.5 + 0.5 * Math.sin(t * 3 + c.x);
  ctx.fillStyle = `rgba(253,224,71,${0.12 + 0.1 * glow})`; ctx.beginPath(); ctx.ellipse(x, y - 8, 17, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1c0a02'; roundBox(ctx, x - 11, y - 17, 22, 17, 3); ctx.fill();
  const g = ctx.createLinearGradient(0, y - 16, 0, y); g.addColorStop(0, c.hurtT > 0 ? '#fff' : '#b45309'); g.addColorStop(1, c.hurtT > 0 ? '#fde68a' : '#78350f');
  ctx.fillStyle = g; roundBox(ctx, x - 10, y - 16, 20, 15, 2.5); ctx.fill();
  ctx.fillStyle = '#fbbf24'; ctx.fillRect(x - 10, y - 10, 20, 2); ctx.fillRect(x - 6, y - 16, 2, 15); ctx.fillRect(x + 4, y - 16, 2, 15);
  ctx.fillStyle = '#fde68a'; roundBox(ctx, x - 2.5, y - 12, 5, 5, 1); ctx.fill();
  ctx.fillStyle = '#78350f'; ctx.fillRect(x - 0.6, y - 10.5, 1.2, 2);
  for (let i = 0; i < c.hp; i++) { ctx.fillStyle = '#fef3c7'; ctx.fillRect(x - 4 + i * 3.4, y - 20, 2, 2); }
}

function roundBox(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  ctx.closePath(); ctx.fill();
}
export { lerp };

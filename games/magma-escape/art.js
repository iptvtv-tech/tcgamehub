// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — the art. Hand-inked look: near-black silhouettes, thick dark outlines, a
//  cold rim light on the ice, and the lava, the crater and the eyes as the only bright light.
//  Everything is drawn with canvas paths (no image files). The Iceman follows the owner's
//  sketches: blue ice, glowing white eyes, no mouth, icicle ears, a snow collar, a ragged scarf
//  and a long ice blade for an arm.
// ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const INK = '#05050a';

/** The Iceman's colours. gold: the golden Iceman (a Legends unlock, never sold). */
export const PAL = {
  ice: {
    body: '#7ebce6', light: '#a9ddf5', shade: '#4a8cc8', back: '#5f9bd0', head: '#5f9bd0', headTop: '#8cc3e8', headLo: '#3f7fb8', headLo2: '#4a8cc8',
    ears: '#cfe8f5', earLit: '#f2fbff', collar: '#eef6fa', collarLo: '#c8dce8', scarf: '#8cc3e8', scarfLine: '#cfe8f5',
    blade: '#f2fbff', bladeEdge: '#8fd3f0', guard: '#8fd3f0', crystal: '#cff0ff', frost: '#cfe8f5', crack: '#2a4a6a', rim: '#ffffff',
  },
  gold: {
    body: '#e3b341', light: '#fde68a', shade: '#b7791f', back: '#c9962b', head: '#d4a017', headTop: '#f5d061', headLo: '#a66b12', headLo2: '#b7791f',
    ears: '#fde68a', earLit: '#fffbeb', collar: '#fff7d6', collarLo: '#f1dc9c', scarf: '#f5d27a', scarfLine: '#fff1c1',
    blade: '#fff8dc', bladeEdge: '#fcd34d', guard: '#fcd34d', crystal: '#fff3c4', frost: '#fff1c1', crack: '#7a4a10', rim: '#fffbeb',
  },
};

const path = (ctx, pts) => {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
};
const shape = (ctx, pts, fill, line = 2.6) => {
  path(ctx, pts); ctx.fillStyle = fill; ctx.fill();
  if (line) { ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke(); }
};
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => 1 - (1 - x) ** 3;

// ── The Iceman (local units: feet at 0,0, facing right; ~104 units from feet to the top of the head) ──
export const ART_H = 104;
/** How tall he is drawn at full size (px from his feet to the top of his head; his ears go higher). */
export const DRAW_H = 55;
const SPIKES = [            // one ear: base, tip, base (the other ear is the mirror image)
  [-24, -88, -38, -128, -18, -98, 1],
  [-18, -92, -28, -136, -10, -100, 1],
  [-10, -96, -14, -122, -2, -98, 0],
  [-28, -82, -44, -102, -26, -92, 0],
];
const TUFT = [[-6, -98, -3, -114, 0, -100], [0, -100, 4, -118, 8, -98]];
const EAR_LEN = [0, 0.5, 0.78, 1];        // by size stage: Small, Cracks, Drips, Full
const BLADE_LEN = [0.72, 0.86, 0.95, 1];
const BLADE = [-4, -6, 8, -8, 74, -1, 10, 9, -4, 6];

function spike(ctx, s, e, mirror, pal) {
  const m = mirror ? -1 : 1, bx = (s[0] + s[4]) / 2, by = (s[1] + s[5]) / 2;
  const tx = bx + (s[2] - bx) * e, ty = by + (s[3] - by) * e;
  shape(ctx, [s[0] * m, s[1], tx * m, ty, s[4] * m, s[5]], pal.ears, 2.4);
  if (s[6] && e > 0.4) { path(ctx, [s[0] * m, s[1], tx * m, ty, (s[0] + (s[4] - s[0]) * 0.35) * m, s[1] - 6]); ctx.fillStyle = pal.earLit; ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85; }
}

/** The blade's angle (0 = straight ahead, + = turning down) and where its shoulder is, for a pose. */
export function bladeAngle(st) {
  if (st.slash) {
    const k = ease(Math.min(1, st.slash.k * 1.25));
    if (st.slash.kind === 'up') return { a: lerp(1.15, -2.75, k), sx: 14, sy: -46 };
    if (st.slash.kind === 'down') return { a: Math.PI / 2 + 0.05, sx: 6, sy: -30 + 10 * Math.min(1, st.slash.k * 3) };
    return { a: lerp(-2.05, 1.3, k), sx: 16, sy: -42 };
  }
  const t = st.t;
  if (st.mode === 'run') return { a: 1.2 + Math.sin(st.phase) * 0.1, sx: 14, sy: -42 };
  if (st.mode === 'jump') return { a: -0.35, sx: 16, sy: -44 };
  if (st.mode === 'fall') return { a: 0.45 + Math.sin(t * 9) * 0.05, sx: 16, sy: -44 };
  return { a: 0.95 + Math.sin(t * 2.2) * 0.05, sx: 15, sy: -42 };
}

/**
 * Draw the Iceman. st = { x, y (screen, feet), k (drawn size), stage (0 Small … 3 Full), face (±1),
 * mode ('idle' | 'run' | 'jump' | 'fall'), phase (run cycle), t, slash ({kind, k}) | null,
 * hurt (0..1), blinkOut (bool: flickering after a hit), heat (0..1: lava light on his feet), land (0..1) }.
 */
export function drawIceman(ctx, st, pal = PAL.ice, glow = null) {
  const a = (DRAW_H * st.k) / ART_H, stage = st.stage;
  ctx.save();
  ctx.translate(st.x, st.y);
  const squash = st.land > 0 ? 1 - st.land * 0.12 : 1;
  ctx.scale(st.face * a * (2 - squash), a * squash);
  if (st.blinkOut) ctx.globalAlpha = 0.35;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const run = st.mode === 'run', air = st.mode === 'jump' || st.mode === 'fall';
  const sw = run ? Math.sin(st.phase) : 0;
  const lean = run ? 0.09 : st.mode === 'jump' ? -0.04 : 0;
  ctx.rotate(lean);

  // the scarf, streaming back
  {
    const fl = st.t * 9, stream = run ? 1.25 : air ? 1.1 : 0.85, lift = st.mode === 'fall' ? -6 : st.mode === 'jump' ? 5 : 0;
    const len = stage === 0 ? 0.7 : 1;
    const tail = (x, y, i) => [x * stream * len, y + lift * (i / 8) + Math.sin(fl + i) * 1.6 * (i / 4)];
    const pts = [-14, -52];
    [[-30, -57], [-46, -59], [-62, -53], [-57, -47], [-69, -41], [-52, -39], [-36, -43]].forEach(([x, y], i) => pts.push(...tail(x, y, i + 1)));
    pts.push(-16, -44);
    shape(ctx, pts, pal.scarf, 2.3);
    ctx.strokeStyle = pal.scarfLine; ctx.lineWidth = 1; ctx.globalAlpha *= 0.7;
    ctx.beginPath(); ctx.moveTo(-20, -48); ctx.lineTo(...tail(-50, -49, 4)); ctx.stroke(); ctx.globalAlpha /= 0.7;
  }

  // the back leg and the back arm (an icicle point)
  const legY = air ? -3 : 0;
  const leg = (front) => {
    const f = front ? sw * 8 : -sw * 8, lift = front ? Math.max(0, -sw) * 4 : Math.max(0, sw) * 4;
    const x0 = front ? 3 : -17, x1 = front ? 17 : -3, fx0 = front ? 8 : -24, fx1 = front ? 24 : -8;
    return [x0, -14, x1, -14, fx1 + f + (air ? (front ? -3 : 3) : 0), legY - lift, fx0 + f + (air ? (front ? -3 : 3) : 0), legY - lift];
  };
  shape(ctx, leg(false), pal.back, 2.4);
  ctx.save(); ctx.translate(-19, -44); ctx.rotate(run ? -sw * 0.35 : air ? -0.35 : Math.sin(st.t * 2.2) * 0.04);
  shape(ctx, [1, -2, -11, 4, -25, 40, -1, 20], pal.ears, 2.4);
  ctx.restore();

  // the body: faceted ice, veins, the glowing crystal in his chest
  const tor = stage === 0 ? [-18, -42, 18, -42, 20, -26, 16, -12, -16, -12, -20, -26] : [-20, -46, 20, -46, 22, -26, 18, -12, -18, -12, -22, -26];
  shape(ctx, tor, pal.body, 2.6);
  ctx.save(); path(ctx, tor); ctx.clip();
  path(ctx, [-20, -46, 0, -46, -6, -20, -22, -26]); ctx.fillStyle = pal.light; ctx.globalAlpha *= 0.75; ctx.fill(); ctx.globalAlpha /= 0.75;
  path(ctx, [20, -46, 0, -46, -2, -16, 18, -12, 22, -26]); ctx.fillStyle = pal.shade; ctx.globalAlpha *= 0.6; ctx.fill(); ctx.globalAlpha /= 0.6;
  ctx.restore();
  ctx.strokeStyle = pal.frost; ctx.lineWidth = 1; ctx.globalAlpha *= 0.7;
  ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-6, -30); ctx.lineTo(-12, -22); ctx.moveTo(10, -38); ctx.lineTo(8, -28); ctx.lineTo(13, -19); ctx.stroke();
  ctx.globalAlpha /= 0.7;
  if (glow) { ctx.globalAlpha *= 0.55; ctx.drawImage(glow, -12, -42, 24, 24); ctx.globalAlpha /= 0.55; }
  shape(ctx, [0, -38, 5, -30, 0, -22, -5, -30], pal.crystal, 1.5);
  shape(ctx, leg(true), pal.body, 2.4);
  if (st.heat > 0.02) {           // the lava's light on his feet
    ctx.fillStyle = `rgba(255,122,26,${(0.55 * st.heat).toFixed(3)})`;
    path(ctx, leg(true)); ctx.fill(); path(ctx, leg(false)); ctx.fill();
  }
  if (stage <= 1) {               // cracks
    ctx.strokeStyle = pal.crack; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-5, -44); ctx.lineTo(-1, -34); ctx.lineTo(-7, -26); ctx.lineTo(-3, -18); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,122,26,.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  // the snow collar
  const col = [-30, -48, -24, -38, -18, -46, -12, -34, -6, -44, 0, -33, 6, -44, 12, -34, 18, -46, 24, -38, 30, -48, 18, -54, -18, -54];
  shape(ctx, stage === 0 ? col.map((v, i) => (i % 2 ? v + 3 : v * 0.8)) : col, pal.collar, 2);
  path(ctx, [-30, -48, -24, -38, -18, -46, -12, -34, -6, -44, 0, -33, -4, -40, -16, -44]); ctx.fillStyle = pal.collarLo; ctx.globalAlpha *= 0.8; ctx.fill(); ctx.globalAlpha /= 0.8;
  if (stage === 2) {              // drips hang from the collar
    const d = (st.t * 1.3) % 1;
    for (const [x, ph] of [[-12, 0], [14, 0.5]]) {
      const k = (d + ph) % 1, y = -36 + k * 7, r = 1.8 + k * 1.2;
      ctx.fillStyle = pal.light; ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.quadraticCurveTo(x + r, y, x, y + r); ctx.quadraticCurveTo(x - r, y, x, y - r * 2.2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // the head (the small man's head stays big)
  ctx.save();
  if (stage === 0) { ctx.translate(0, -44); ctx.scale(1.16, 1.16); ctx.translate(0, 44 + 3); }
  const e = EAR_LEN[stage];
  if (e > 0) for (const s of SPIKES) { spike(ctx, s, e, false, pal); spike(ctx, s, e, true, pal); }
  for (const s of TUFT) spike(ctx, [...s, 0], stage === 0 ? 0.8 : e, false, pal);
  const head = [-18, -100, 18, -100, 28, -86, 28, -62, 16, -44, -16, -44, -28, -62, -28, -86];
  shape(ctx, head, pal.head, 3);
  path(ctx, [-18, -100, 18, -100, 28, -86, 0, -80]); ctx.fillStyle = pal.headTop; ctx.globalAlpha *= 0.9; ctx.fill(); ctx.globalAlpha /= 0.9;
  path(ctx, [-28, -62, -16, -44, 0, -52, -14, -70]); ctx.fillStyle = pal.headLo; ctx.globalAlpha *= 0.8; ctx.fill(); ctx.globalAlpha /= 0.8;
  path(ctx, [28, -62, 16, -44, 0, -52, 14, -70]); ctx.fillStyle = pal.headLo2; ctx.globalAlpha *= 0.7; ctx.fill(); ctx.globalAlpha /= 0.7;
  ctx.strokeStyle = pal.frost; ctx.lineWidth = 1.3; ctx.globalAlpha *= 0.6;
  ctx.beginPath(); ctx.moveTo(-24, -88); for (let i = 1; i <= 8; i++) ctx.lineTo(-24 + i * 6, i % 2 ? -80 : -88); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, -62); ctx.lineTo(-9, -54); ctx.lineTo(-12, -48); ctx.moveTo(12, -62); ctx.lineTo(9, -54); ctx.lineTo(12, -48); ctx.stroke();
  ctx.globalAlpha /= 0.6;
  if (stage <= 1) {
    ctx.strokeStyle = pal.crack; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(14, -97); ctx.lineTo(10, -88); ctx.lineTo(15, -80); if (stage === 0) { ctx.moveTo(-16, -90); ctx.lineTo(-12, -82); } ctx.stroke();
    ctx.strokeStyle = 'rgba(255,122,26,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // the eyes: glowing white, no mouth. They look where he's going, and blink now and then.
  const blink = (st.t % 4.3) < 0.12 ? 0.15 : 1, look = 2.5;
  if (glow) { ctx.globalAlpha *= 0.4; ctx.drawImage(glow, -11 + look - 17, -93, 34, 34); ctx.drawImage(glow, 11 + look - 17, -93, 34, 34); ctx.globalAlpha /= 0.4; }
  for (const ex of [-11, 11]) {
    ctx.beginPath(); ctx.ellipse(ex + look, -76, 8, 8 * blink, 0, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  }
  // the cold rim light along the top edges
  ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.4; ctx.globalAlpha *= 0.75;
  ctx.beginPath(); ctx.moveTo(-18, -100); ctx.lineTo(18, -100); ctx.lineTo(28, -86); ctx.stroke();
  ctx.globalAlpha /= 0.75;
  ctx.restore();

  // the blade arm (in front)
  const b = bladeAngle(st), len = BLADE_LEN[stage];
  ctx.save(); ctx.translate(b.sx, b.sy); ctx.rotate(b.a); ctx.scale(len, 1);
  shape(ctx, BLADE, pal.blade, 2.4);
  ctx.strokeStyle = pal.bladeEdge; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(70, -0.5); ctx.stroke();
  ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(8, -7); ctx.lineTo(73, -1.5); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(b.sx, b.sy); ctx.rotate(b.a);
  shape(ctx, [-7, 0, 0, -8, 7, 0, 0, 8], pal.guard, 2);
  ctx.restore();

  if (st.hurt > 0) {              // the hit: the ice flares hot orange for a moment
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, st.hurt * 1.6) * 0.5; ctx.fillStyle = '#ff6a1a';
    path(ctx, tor); ctx.fill(); ctx.save(); if (stage === 0) { ctx.translate(0, -44); ctx.scale(1.16, 1.16); ctx.translate(0, 47); } path(ctx, head); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

/** The melted Iceman: a puddle with his two eyes, steaming. */
export function drawPuddle(ctx, x, y, k, t, pal = PAL.ice) {
  const w = 30 * k * Math.min(1, 0.4 + t * 1.5);
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, -2, w, 5, 0, 0, TAU); ctx.fillStyle = pal.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-w * 0.3, -3, w * 0.4, 1.6, 0, 0, TAU); ctx.fillStyle = pal.light; ctx.fill();
  const fade = Math.max(0, 1 - t * 0.6);
  ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-5, -6, 3, 3 * (0.4 + 0.6 * fade), 0, 0, TAU); ctx.ellipse(5, -6, 3, 3 * (0.4 + 0.6 * fade), 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/** The arc the blade leaves through the air. */
export function drawSlashArc(ctx, x, y, face, st, k) {
  const sl = st.slash; if (!sl || sl.k > 0.85) return;
  const a = (DRAW_H * k) / ART_H, fade = 1 - sl.k / 0.85;
  ctx.save(); ctx.translate(x, y); ctx.scale(face * a, a);
  if (sl.kind === 'down') {
    // a spear of cold light straight down
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(143,211,240,.45)';
    ctx.beginPath(); ctx.moveTo(-24, -10); ctx.quadraticCurveTo(-6, 70, 0, 128); ctx.quadraticCurveTo(6, 70, 24, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(242,251,255,.9)';
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.quadraticCurveTo(-2, 60, 0, 116); ctx.quadraticCurveTo(2, 60, 9, -6); ctx.closePath(); ctx.fill();
  } else {
    // a crescent swoosh: thin where the swing began, thick and bright at the blade
    const [from, to] = sl.kind === 'up' ? [1.15, -2.75] : [-2.05, 1.3];
    const now = lerp(from, to, ease(Math.min(1, sl.k * 1.25)));
    const cx = sl.kind === 'up' ? 14 : 16, cy = sl.kind === 'up' ? -46 : -42, R = 84;
    const N = 18, pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N, an = lerp(from, now, u); pts.push([cx + Math.cos(an) * R, cy + Math.sin(an) * R, an, u]); }
    const inner = (an, u) => [cx + Math.cos(an) * (R - 4 - 30 * u * u), cy + Math.sin(an) * (R - 4 - 30 * u * u)];
    ctx.globalAlpha = fade;
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    for (let i = N; i >= 0; i--) { const [ix, iy] = inner(pts[i][2], pts[i][3]); ctx.lineTo(ix, iy); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(143,211,240,.55)'; ctx.fill();
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    for (let i = N; i >= 0; i--) { const an = pts[i][2], u = pts[i][3], rr = R - 2 - 12 * u * u; ctx.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(242,251,255,.95)'; ctx.fill();
  }
  ctx.restore();
}

// ── Magma embers ─────────────────────────────────────────────
const EMBER_SHAPE = [[0, -24], [12, -19], [17, -9], [14, 0], [-14, 0], [-17, -10], [-11, -21]];
/** A magma ember: black cracked rock, a hot orange rim, glowing eye slits. state: fall | crawl | squat | hop. */
export function drawEmber(ctx, e, x, y, t, glow) {
  ctx.save(); ctx.translate(x, y);
  let sx = 1, sy = 1;
  if (e.state === 'squat') { const k = 1 - e.t / 0.35; sx = 1 + 0.25 * k; sy = 1 - 0.3 * k; }
  else if (e.state === 'hop') { sx = 0.88; sy = 1.15; }
  else if (e.state === 'fall') { sx = 0.82; sy = 1.2; }
  if (glow) { ctx.globalAlpha = 0.75 + Math.sin(t * 7 + e.id) * 0.1; ctx.drawImage(glow, -34, -46, 68, 68); ctx.globalAlpha = 1; }
  if (e.state === 'fall') {        // a fiery tail above it
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,122,26,.5)'; ctx.beginPath(); ctx.moveTo(-9, -24); ctx.lineTo(0, -60 - Math.sin(t * 30) * 6); ctx.lineTo(9, -24); ctx.fill();
    ctx.fillStyle = 'rgba(255,217,160,.55)'; ctx.beginPath(); ctx.moveTo(-4, -23); ctx.lineTo(0, -42); ctx.lineTo(4, -23); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.scale(sx * (e.dir || 1), sy);
  const wob = Math.sin(t * 6 + e.id) * 0.8;
  if (e.state === 'crawl') {       // little legs
    const s = Math.sin(t * 14 + e.id);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-11 + s * 3, 1); ctx.moveTo(8, -3); ctx.lineTo(11 - s * 3, 1); ctx.stroke();
  }
  ctx.beginPath();
  EMBER_SHAPE.forEach(([px, py], i) => { const q = 1 + ((e.id * 7 + i * 13) % 5) * 0.03; i ? ctx.lineTo(px * q, py * q + wob) : ctx.moveTo(px * q, py * q + wob); });
  ctx.closePath();
  ctx.fillStyle = '#0a0709'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.8; ctx.stroke();
  // the magma glowing through its cracks
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-5, -18); ctx.lineTo(1, -10); ctx.lineTo(-3, -3); ctx.moveTo(8, -13); ctx.lineTo(6, -5); ctx.moveTo(-12, -9); ctx.lineTo(-8, -6); ctx.stroke();
  ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 0.8; ctx.stroke();
  // eye slits, narrowed (angrier while it crouches to hop)
  const angry = e.state === 'squat' || e.state === 'hop' ? 2 : 0;
  ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-2, -15 - angry * 0.5); ctx.lineTo(4, -14 + angry * 0.5); ctx.moveTo(7, -14 + angry * 0.5); ctx.lineTo(12, -15 - angry * 0.5); ctx.stroke();
  ctx.restore();
}

/** The warning before an ember drips: a bead of magma gathering at the top of the screen. */
export function drawDripWarn(ctx, x, k, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,122,26,${(0.18 + 0.3 * k).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(x, 0, 22 + 10 * k, 16 + 10 * k, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const r = 3 + 5 * k;
  ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.moveTo(x - r, 0); ctx.quadraticCurveTo(x - r, r * 1.6, x, r * 2.2 + Math.sin(t * 18) * 0.8); ctx.quadraticCurveTo(x + r, r * 1.6, x + r, 0); ctx.fill();
  ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(x - r * 0.3, r * 0.9, r * 0.35, 0, TAU); ctx.fill();
  ctx.restore();
}

/** An ice crystal: a cold shard that freezes the Iceman back up a stage. */
export function drawCrystal(ctx, x, y, t, glow) {
  const bob = Math.sin(t * 2.4 + x * 0.05) * 3;
  ctx.save(); ctx.translate(x, y + bob);
  if (glow) { ctx.globalAlpha = 0.6 + Math.sin(t * 3 + x) * 0.15; ctx.drawImage(glow, -26, -26, 52, 52); ctx.globalAlpha = 1; }
  shape(ctx, [-2, 10, -10, -1, -5, -14, 3, -3], '#5fa8d8', 1.8);
  shape(ctx, [-2, 10, 3, -3, 8, -16, 10, 2], '#d6f0fb', 1.8);
  shape(ctx, [-5, -14, 0, -22, 8, -16, 3, -3], '#f2fbff', 1.8);
  const tw = (t * 1.7 + x * 0.01) % 2.2;
  if (tw < 0.4) {
    const s = Math.sin((tw / 0.4) * Math.PI) * 5;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(5 - s, -16); ctx.lineTo(5 + s, -16); ctx.moveTo(5, -16 - s); ctx.lineTo(5, -16 + s); ctx.stroke();
  }
  ctx.restore();
}

// ── The other magma creatures (Section 2) ────────────────────
/** A spitter: a squat cone of rock with a glowing mouth on top; it swells before it spits. */
export function drawSpitter(ctx, e, x, y, t, glow) {
  ctx.save(); ctx.translate(x, y);
  const swell = e.aiming ? 1 + Math.min(1, (-e.spitT) / 0.5) * 0.22 : 1;
  if (glow) { ctx.globalAlpha = 0.7; ctx.drawImage(glow, -34, -50, 68, 68); ctx.globalAlpha = 1; }
  if (e.state === 'fall') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,122,26,.45)'; ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(0, -56); ctx.lineTo(8, -26); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.scale(swell, 1 / Math.sqrt(swell));
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-13, -12); ctx.lineTo(-8, -22); ctx.lineTo(8, -22); ctx.lineTo(13, -12); ctx.lineTo(18, 0); ctx.closePath();
  ctx.fillStyle = '#0a0709'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = e.aiming ? '#ffd9a0' : '#ff9a3c'; ctx.beginPath(); ctx.ellipse(0, -22, 7, 3, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-5, -12); ctx.moveTo(9, -5); ctx.lineTo(5, -14); ctx.stroke();
  ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const d = e.dir || 1;
  ctx.beginPath(); ctx.moveTo(-6 + d * 2, -13); ctx.lineTo(-1 + d * 2, -12); ctx.moveTo(2 + d * 2, -12); ctx.lineTo(7 + d * 2, -13); ctx.stroke();
  ctx.restore();
}

/** A cinder bat: ragged black wings with burning edges around a glowing core. */
export function drawBat(ctx, e, x, y, t, glow) {
  ctx.save(); ctx.translate(x, y - 9);
  const flap = e.state === 'dive' ? 0.15 : Math.sin(t * 14 + e.id) * 0.6, aim = e.state === 'aim';
  if (glow) { ctx.globalAlpha = aim ? 0.95 : 0.6; ctx.drawImage(glow, -30, -30, 60, 60); ctx.globalAlpha = 1; }
  ctx.scale(e.dir || 1, 1);
  if (e.state === 'dive') ctx.rotate(Math.atan2(e.vy, Math.abs(e.vx)) * 0.6);
  for (const s of [-1, 1]) {
    ctx.save(); ctx.scale(s, 1); ctx.rotate(-flap);
    ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(14, -12); ctx.lineTo(26, -8); ctx.lineTo(22, -2); ctx.lineTo(27, 3); ctx.lineTo(17, 2); ctx.lineTo(12, 7); ctx.lineTo(4, 3); ctx.closePath();
    ctx.fillStyle = '#0a0709'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(26, -8); ctx.lineTo(22, -2); ctx.lineTo(27, 3); ctx.lineTo(17, 2); ctx.lineTo(12, 7); ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 8, 0, 0, TAU); ctx.fillStyle = '#0a0709'; ctx.fill(); ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = aim ? '#ffffff' : '#ffb060';
  ctx.beginPath(); ctx.arc(-2.5, -2, 1.6, 0, TAU); ctx.arc(2.8, -2, 1.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(-5, -12); ctx.lineTo(-1, -7); ctx.moveTo(4, -7); ctx.lineTo(5, -12); ctx.lineTo(1, -7); ctx.fill();
  ctx.restore();
}

/** A magma brute: a big horned ember. After the first hit it is cracked wide open and glows hotter. */
export function drawBrute(ctx, e, x, y, t, glow) {
  ctx.save(); ctx.translate(x, y);
  let sx = 1, sy = 1;
  if (e.state === 'squat') { const k = 1 - e.t / 0.35; sx = 1 + 0.2 * k; sy = 1 - 0.25 * k; }
  if (glow) { ctx.globalAlpha = 0.8; ctx.drawImage(glow, -40, -58, 80, 80); ctx.globalAlpha = 1; }
  ctx.scale(sx * (e.dir || 1), sy);
  if (e.state === 'crawl') { const s = Math.sin(t * 9 + e.id); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-12 + s * 3, 1); ctx.moveTo(9, -3); ctx.lineTo(12 - s * 3, 1); ctx.stroke(); }
  const body = [[0, -30], [13, -27], [20, -14], [17, 0], [-17, 0], [-21, -13], [-14, -27]];
  ctx.beginPath(); body.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
  ctx.fillStyle = e.flash > 0 ? '#3a1a10' : '#0a0709'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.stroke(); ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2; ctx.stroke();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 8, -28); ctx.quadraticCurveTo(s * 18, -38, s * 22, -44); ctx.lineTo(s * 13, -29); ctx.closePath(); ctx.fillStyle = '#1a1220'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); }
  const hot = e.hp < 2;
  ctx.strokeStyle = hot ? '#ffd9a0' : '#ff7a1a'; ctx.lineWidth = hot ? 3 : 2.2;
  ctx.beginPath(); ctx.moveTo(-7, -24); ctx.lineTo(0, -14); ctx.lineTo(-4, -5); ctx.moveTo(10, -18); ctx.lineTo(7, -8);
  if (hot) { ctx.moveTo(-15, -14); ctx.lineTo(-6, -10); ctx.moveTo(14, -6); ctx.lineTo(4, -3); }
  ctx.stroke();
  ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(4, -18); ctx.moveTo(8, -18); ctx.lineTo(14, -20); ctx.stroke();
  ctx.restore();
}

/** A spitter's fireball, with a short burning trail. */
export function drawShot(ctx, b, glow) {
  ctx.save();
  if (glow) { ctx.globalAlpha = 0.8; ctx.drawImage(glow, b.x - 18, b.y - 18, 36, 36); ctx.globalAlpha = 1; }
  ctx.strokeStyle = 'rgba(255,122,26,.6)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); ctx.stroke();
  ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(b.x - 1.5, b.y - 1.5, 2.6, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Rock rain: the warning shadow on the ledge below, then the falling rock. */
export function drawRockShadow(ctx, b, t) {
  const k = 1 - Math.max(0, b.warn) / 1.0, pulse = 0.5 + 0.5 * Math.sin(t * 18);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${(0.35 + 0.3 * k).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(b.x, b.land - 1, 8 + 10 * k, 3 + 2 * k, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,154,60,${(0.35 + 0.4 * pulse * k).toFixed(3)})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(b.x, b.land - 1, 12 + 8 * k, 4 + 2 * k, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
export function drawRock(ctx, b) {
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.strokeStyle = 'rgba(138,128,152,.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(-7, -11); ctx.lineTo(4, -12); ctx.lineTo(11, -4); ctx.lineTo(9, 8); ctx.lineTo(-5, 10); ctx.closePath();
  ctx.fillStyle = '#1a1220'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(9, 8); ctx.lineTo(-5, 10); ctx.lineTo(-11, -3); ctx.stroke();
  ctx.restore();
}

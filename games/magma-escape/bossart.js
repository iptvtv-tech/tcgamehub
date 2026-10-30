// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — the mini-bosses' art, in the same hand-inked style as art.js: near-black
//  basalt with thick ink outlines, the magma inside showing only through cracks, eyes and
//  mouths. A dazed boss glows white-hot (that's when the blade hurts it).
//  Every boss is drawn with its feet at (b.x, b.y), facing b.face.
// ─────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const INK = '#05050a';
const ROCKC = '#0d0a12', ROCK2 = '#1a1420', HOT = '#ff7a1a', HOTTER = '#ffb060', WHITE = '#fff3d6';

const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
const inked = (ctx, fill, w = 3) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke(); };
const cracks = (ctx, segs, col, w) => {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); for (const s of segs) { ctx.moveTo(s[0], s[1]); for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]); } ctx.stroke();
};
const ease = (k) => k * k * (3 - 2 * k);

// ── The Magma Golem ──────────────────────────────────────────
/** A hunched giant of basalt, a molten core in its chest, fists like boulders. */
export function drawGolem(ctx, b, t, glow) {
  const dazed = b.state === 'stuck', dying = b.state === 'dying';
  const k = dying ? 1 - Math.max(0, b.t) / 1.7 : 0;
  ctx.save(); ctx.translate(b.x, b.y);
  // the heat around it
  if (glow) { ctx.globalAlpha = dazed ? 0.95 : 0.55; ctx.drawImage(glow, -90, -150, 180, 170); ctx.globalAlpha = 1; }
  if (dying) { ctx.globalAlpha = 1 - k * 0.85; ctx.translate(0, k * 30); ctx.scale(1 + k * 0.15, 1 - k * 0.45); }
  ctx.scale(b.face || 1, 1);
  const walk = b.state === 'walk' ? Math.sin(b.anim * 5.2) : 0, bob = Math.abs(walk) * 2.5;
  const wind = b.state === 'windup' ? ease(Math.min(1, 1 - b.t / 0.8)) : 0;
  const heave = b.state === 'throw' ? ease(Math.min(1, 1 - b.t / 0.6)) : 0;
  const lean = dazed ? 0.28 : b.state === 'windup' ? -0.12 * wind : 0.05;
  const hot = b.flash > 0 ? '#ffe8c0' : dazed ? HOTTER : HOT;
  // legs
  for (const s of [-1, 1]) {
    const st = s * walk * 7;
    poly(ctx, [[s * 10 - 9 + st, -26], [s * 10 + 9 + st, -26], [s * 12 + 11 + st, -3], [s * 12 + 14 + st, 0], [s * 12 - 12 + st, 0], [s * 12 - 10 + st, -6]]);
    inked(ctx, ROCK2, 3);
  }
  ctx.translate(0, -24 - bob);
  ctx.rotate(lean);
  // the back arm (behind the body)
  arm(ctx, -1, b, walk, wind, heave, dazed, hot);
  // the body: a great hunched boulder
  const body = [[-30, 2], [-36, -22], [-32, -48], [-20, -62], [4, -66], [26, -58], [36, -38], [32, -12], [24, 4]];
  poly(ctx, body); inked(ctx, ROCKC, 3.6);
  ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-20, -60); ctx.lineTo(4, -64); ctx.lineTo(24, -57); ctx.stroke();
  // plates of stone on the shoulders
  poly(ctx, [[-30, -46], [-18, -60], [4, -64], [-4, -50], [-22, -40]]); inked(ctx, ROCK2, 2.4);
  // the molten core: a jagged opening in the chest
  const pulse = 0.5 + 0.5 * Math.sin(t * (dazed ? 14 : 4));
  if (glow && (dazed || b.flash > 0)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + pulse * 0.4; ctx.drawImage(glow, -34, -66, 68, 68); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  poly(ctx, [[2, -42], [12, -36], [10, -24], [16, -16], [4, -14], [-2, -24], [-6, -34]]);
  ctx.fillStyle = dazed ? (pulse > 0.5 ? WHITE : '#ffd9a0') : b.flash > 0 ? WHITE : '#c2410c'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.fillStyle = dazed ? HOTTER : HOT; ctx.beginPath(); ctx.arc(5, -28, dazed ? 5 : 3.5, 0, TAU); ctx.fill();
  // cracks of magma across the stone (more of them as it is hurt)
  const hurt = 1 - b.hp / b.max;
  const segs = [[-24, -14, -14, -22, -16, -32], [22, -48, 14, -44], [26, -20, 18, -14, 22, -4], [-28, -36, -20, -40]];
  if (hurt > 0.2) segs.push([-10, -6, -2, -10, 0, -2], [12, -60, 16, -52]);
  if (hurt > 0.5) segs.push([-32, -24, -22, -26, -18, -18], [28, -34, 20, -30, 24, -24]);
  if (hurt > 0.7) segs.push([-14, -52, -6, -46, -10, -40], [30, -8, 22, -10]);
  cracks(ctx, segs, hot, 2.4); cracks(ctx, segs, '#ffd9a0', 0.8);
  // the head: small, sunk between its shoulders
  ctx.save(); ctx.translate(14, -62);
  poly(ctx, [[-12, 4], [-12, -10], [-4, -17], [10, -16], [16, -6], [14, 6]]); inked(ctx, ROCK2, 3);
  // a brow of stone and two eyes of fire
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(14, -9); ctx.stroke();
  const eye = b.state === 'windup' || b.state === 'throw' ? WHITE : dazed ? '#ffd9a0' : HOTTER;
  ctx.strokeStyle = eye; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  if (dazed) { ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(2, -2); ctx.moveTo(7, -2); ctx.lineTo(12, -4); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(2, -3); ctx.moveTo(7, -3); ctx.lineTo(12, -5); ctx.stroke(); }
  // a slit of a mouth, glowing
  ctx.strokeStyle = hot; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(10, 1); ctx.stroke();
  ctx.restore();
  // the front arm
  arm(ctx, 1, b, walk, wind, heave, dazed, hot);
  ctx.restore();
  // dazed: the floor cracked open where its fists went in, and sparks circling its head
  if (dazed) {
    const fx = b.x + b.face * 46, pulse2 = 0.6 + 0.4 * Math.sin(t * 10);
    ctx.strokeStyle = `rgba(255,154,60,${pulse2.toFixed(2)})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, l] of [[-1, 26], [-0.4, 18], [0.5, 20], [1, 28]]) { ctx.moveTo(fx, b.y + 1); ctx.lineTo(fx + a * l, b.y + 1 + (Math.abs(a) < 0.6 ? 0 : 1)); }
    ctx.stroke();
    ctx.fillStyle = '#1a1220';
    for (const d of [-22, -12, 10, 20]) { ctx.beginPath(); ctx.moveTo(fx + d - 4, b.y + 1); ctx.lineTo(fx + d, b.y - 6); ctx.lineTo(fx + d + 4, b.y + 1); ctx.closePath(); ctx.fill(); }

    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * TAU) / 3;
      ctx.fillStyle = i % 2 ? WHITE : HOTTER;
      ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * 22 + b.face * 20, b.y - 100 + Math.sin(a) * 6, 2.6, 0, TAU); ctx.fill();
    }
  }
}

/** One of the golem's arms: a stone shoulder, a forearm and a boulder of a fist. s = -1 back, 1 front. */
function arm(ctx, s, b, walk, wind, heave, dazed, hot) {
  ctx.save();
  const sx = s > 0 ? 18 : -18, sy = -50;
  let fx, fy;
  if (dazed) { fx = s > 0 ? 50 : 30; fy = 24; }                              // fists buried in the floor
  else if (wind > 0) { fx = s * 10 + 6; fy = -96 - 22 * wind; }               // both fists high over its head
  else if (heave > 0 && s < 0) { fx = -40 + 10 * heave; fy = -78 - 10 * heave; } // the throwing arm, back and up
  else { fx = sx + s * 16 + walk * s * 8; fy = -8 + Math.abs(walk) * 2; }
  const ex = (sx + fx) / 2 + s * 10, ey = (sy + fy) / 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 19; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.strokeStyle = s > 0 ? ROCK2 : ROCKC; ctx.lineWidth = 13; ctx.stroke();
  // the fist
  poly(ctx, [[fx - 13, fy - 9], [fx - 4, fy - 15], [fx + 11, fy - 12], [fx + 15, fy], [fx + 8, fy + 12], [fx - 9, fy + 11], [fx - 15, fy + 2]]);
  inked(ctx, s > 0 ? ROCK2 : ROCKC, 3);
  cracks(ctx, [[fx - 6, fy - 6, fx, fy, fx - 3, fy + 7], [fx + 6, fy - 8, fx + 9, fy - 1]], hot, 1.8);
  if (heave > 0 && s < 0) {                                                  // the boulder it's about to hurl
    ctx.beginPath(); ctx.arc(fx, fy - 18, 11, 0, TAU); inked(ctx, '#2a1a14', 2.6);
    cracks(ctx, [[fx - 6, fy - 22, fx, fy - 18, fx - 2, fy - 12], [fx + 4, fy - 26, fx + 7, fy - 19]], HOTTER, 2);
  }
  ctx.restore();
}

/** A shockwave from the golem's slam: a wave of lava bursting up out of the floor as it runs. */
export function drawWave(ctx, w, t, glow) {
  const d = Math.sign(w.vx) || 1, f = Math.min(1, w.t * 6) * (1 - Math.max(0, w.t - 1.5) / 0.4);
  ctx.save(); ctx.translate(w.x, w.y); ctx.scale(d, 1);
  if (glow) { ctx.globalAlpha = 0.8 * f; ctx.drawImage(glow, -36, -46, 72, 60); ctx.globalAlpha = 1; }
  // cracked floor left behind
  ctx.strokeStyle = HOT; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7 * f;
  ctx.beginPath(); ctx.moveTo(-60, 1); ctx.lineTo(-44, -1); ctx.lineTo(-30, 2); ctx.lineTo(-14, 0); ctx.stroke();
  ctx.globalAlpha = f;
  // the burst itself: a curling crest of lava with a dark crust edge
  const h = 22 + Math.sin(t * 30 + w.x * 0.1) * 3;
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.quadraticCurveTo(-10, -h * 0.6, 2, -h); ctx.quadraticCurveTo(10, -h * 0.9, 14, -h * 0.55); ctx.quadraticCurveTo(8, -h * 0.5, 12, 0); ctx.closePath();
  ctx.fillStyle = '#c2410c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-4, -h * 0.5, 3, -h * 0.78); ctx.quadraticCurveTo(6, -h * 0.4, 6, 0); ctx.closePath();
  ctx.fillStyle = HOTTER; ctx.fill();
  ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(2, -h * 0.55, 2.2, 0, TAU); ctx.fill();
  // droplets thrown off the crest
  for (let i = 0; i < 3; i++) { const q = (t * 3 + i * 0.33) % 1; ctx.fillStyle = HOTTER; ctx.fillRect(4 + i * 5 - q * 8, -h - 4 + q * q * 26 - 10 * (1 - q), 2.4, 2.4); }
  ctx.restore();
}

/** A molten boulder thrown by the golem. */
export function drawBoulder(ctx, b, glow) {
  ctx.save(); ctx.translate(b.x, b.y);
  if (glow) { ctx.globalAlpha = 0.85; ctx.drawImage(glow, -28, -28, 56, 56); ctx.globalAlpha = 1; }
  ctx.strokeStyle = 'rgba(255,122,26,.5)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-b.vx * 0.05, -b.vy * 0.05); ctx.stroke();
  ctx.rotate(b.t * 7);
  poly(ctx, [[-11, -3], [-6, -11], [5, -12], [12, -3], [9, 9], [-3, 12], [-11, 6]]); inked(ctx, '#2a1a14', 2.8);
  cracks(ctx, [[-6, -6, 0, -1, -2, 6], [5, -8, 7, 0], [-8, 3, -4, 5]], HOTTER, 2.2);
  cracks(ctx, [[-6, -6, 0, -1, -2, 6]], WHITE, 0.8);
  ctx.restore();
}

// ── The Cinder Drake ─────────────────────────────────────────
/** A lean dragon of black stone and burning membrane: horned head, long neck, barbed tail. */
export function drawDrake(ctx, b, t, glow) {
  const dazed = b.state === 'dazed', dying = b.state === 'dying', dive = b.state === 'dive';
  const rear = b.state === 'rear', inhale = b.state === 'inhale';
  const k = dying ? 1 - Math.max(0, b.t) / 1.7 : 0;
  const onGround = dazed || dying;
  const hot = b.flash > 0 ? '#ffe8c0' : dazed ? HOTTER : HOT;
  ctx.save(); ctx.translate(b.x, b.y - 22);
  if (glow) { ctx.globalAlpha = dazed ? 0.95 : 0.6; ctx.drawImage(glow, -120, -100, 240, 170); ctx.globalAlpha = 1; }
  ctx.scale(1.3, 1.3);
  if (dying) { ctx.globalAlpha = 1 - k * 0.85; ctx.translate(0, k * 14); ctx.scale(1, 1 - k * 0.4); }
  ctx.scale(b.face || 1, 1);
  if (dive) ctx.rotate(Math.atan2(b.vy, Math.abs(b.vx)) * 0.75);
  else if (rear) ctx.rotate(-0.25);
  // wing flap: fast while hovering, swept back in a dive, drooped when dazed
  const flap = dive ? -0.9 : onGround ? 0.85 : rear ? -0.6 : Math.sin(b.anim * 7) * 0.55;
  wing(ctx, -1, flap, hot, b.anim);
  // the tail
  const sw = Math.sin(b.anim * 3) * 6;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-14, 2); ctx.quadraticCurveTo(-40, 8 + sw, -62, -2 - sw); ctx.stroke();
  ctx.strokeStyle = ROCKC; ctx.lineWidth = 6; ctx.stroke();
  poly(ctx, [[-60, -2 - sw], [-74, -10 - sw], [-70, 2 - sw]]); inked(ctx, ROCK2, 2.4);
  // the body
  poly(ctx, [[-22, -2], [-16, -14], [2, -18], [18, -12], [22, 0], [12, 10], [-12, 10]]); inked(ctx, ROCKC, 3.4);
  // the belly: plates glowing with the fire inside
  ctx.save(); poly(ctx, [[-16, 6], [-6, 2], [8, 2], [18, 0], [12, 9], [-12, 9]]); ctx.clip();
  ctx.fillStyle = b.flash > 0 ? WHITE : dazed ? '#ffd9a0' : '#c2410c'; ctx.fillRect(-24, -2, 48, 14);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); for (const x of [-10, -3, 4, 11]) { ctx.moveTo(x, 0); ctx.lineTo(x - 2, 10); } ctx.stroke();
  ctx.restore();
  cracks(ctx, [[-14, 2, -6, -4, 2, 2], [8, -10, 14, -4]], hot, 2); cracks(ctx, [[-14, 2, -6, -4, 2, 2]], '#ffd9a0', 0.7);
  // legs tucked under (planted when it's down)
  for (const s of [-8, 10]) {
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(s, 6);
    if (onGround) ctx.lineTo(s + 4, 17); else ctx.lineTo(s - 6, 14);
    ctx.stroke(); ctx.strokeStyle = ROCK2; ctx.lineWidth = 3; ctx.stroke();
  }
  // the neck and head
  const hx = onGround ? 34 : rear ? 26 : 32, hy = onGround ? 4 : rear ? -40 : inhale ? -18 : -26;
  ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(12, -8); ctx.quadraticCurveTo(24, -20, hx - 4, hy + 2); ctx.stroke();
  ctx.strokeStyle = ROCKC; ctx.lineWidth = 7; ctx.stroke();
  ctx.save(); ctx.translate(hx, hy); if (onGround) ctx.rotate(0.35);
  const jaw = inhale ? 0.25 + 0.2 * Math.sin(t * 20) : dazed ? 0.15 : 0.05;
  // horns
  for (const [a, l] of [[-0.5, 14], [-0.2, 11]]) { poly(ctx, [[-4, -6], [-4 - Math.cos(a) * l, -6 - l + 2], [2, -7]]); inked(ctx, ROCK2, 2); }
  // skull and upper jaw
  poly(ctx, [[-8, -8], [4, -10], [18, -5], [22, -1], [8, 0], [-6, 2]]); inked(ctx, ROCKC, 3);
  // lower jaw
  ctx.save(); ctx.translate(-4, 1); ctx.rotate(jaw);
  poly(ctx, [[0, -1], [22, -1], [16, 5], [2, 5]]); inked(ctx, ROCK2, 2.6);
  ctx.restore();
  if (inhale) {                                   // fire gathering in its mouth
    ctx.globalCompositeOperation = 'lighter';
    if (glow) { ctx.globalAlpha = 0.9; ctx.drawImage(glow, 4, -18, 36, 36); ctx.globalAlpha = 1; }
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(18, 1, 3 + Math.sin(t * 24) * 1.2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // the eye
  ctx.fillStyle = dazed ? '#ffd9a0' : rear || dive ? WHITE : HOTTER;
  if (dazed) { ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(10, -4); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(11, -5); ctx.lineTo(5, -3); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  wing(ctx, 1, flap, hot, b.anim);
  ctx.restore();
  if (dazed) {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * TAU) / 3;
      ctx.fillStyle = i % 2 ? WHITE : HOTTER;
      ctx.beginPath(); ctx.arc(b.x + b.face * 46 + Math.cos(a) * 16, b.y - 46 + Math.sin(a) * 5, 2.4, 0, TAU); ctx.fill();
    }
  }
}

/** A drake wing: bone fingers with a burning membrane between them. s = -1 far wing, 1 near wing. */
function wing(ctx, s, flap, hot, anim) {
  ctx.save();
  ctx.translate(s > 0 ? 2 : -4, -12);
  ctx.rotate(-flap * (s > 0 ? 1 : 0.85));
  if (s < 0) ctx.globalAlpha *= 0.85;
  const tips = [[-18, -64], [-46, -54], [-66, -30], [-70, -8]];
  // membrane
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tips[0]);
  for (let i = 1; i < tips.length; i++) { const [a, c] = tips[i - 1], [d, e] = tips[i]; ctx.quadraticCurveTo((a + d) / 2 + 6, (c + e) / 2 + 8, d, e); }
  ctx.quadraticCurveTo(-36, 2, 0, 0); ctx.closePath();
  ctx.fillStyle = s > 0 ? '#1a0d10' : '#120a0e'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
  // the burning edge of the membrane
  ctx.strokeStyle = hot; ctx.lineWidth = 1.6; ctx.globalAlpha *= 0.7 + 0.3 * Math.sin(anim * 9 + s);
  ctx.beginPath(); ctx.moveTo(...tips[0]);
  for (let i = 1; i < tips.length; i++) { const [a, c] = tips[i - 1], [d, e] = tips[i]; ctx.quadraticCurveTo((a + d) / 2 + 6, (c + e) / 2 + 8, d, e); }
  ctx.stroke();
  ctx.globalAlpha = s < 0 ? 0.85 : 1;
  // bones
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); for (const [x, y] of tips) { ctx.moveTo(0, 0); ctx.lineTo(x * 0.35, y * 0.55 - 6); ctx.lineTo(x, y); } ctx.stroke();
  ctx.strokeStyle = '#3a2a30'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

// ── The arena ────────────────────────────────────────────────
/** The crust sealing the vent while the boss lives: a plug of black rock with glowing seams. */
export function drawVentSeal(ctx, m, t, TILE) {
  const ex = m.exit.x, c = Math.floor(ex / TILE);
  let top = Math.floor(m.exit.y / TILE) - 1;
  while (top > 0 && m.t[(top - 1) * m.C + c] !== 1) top--;
  // the opening's width in that row
  let c0 = c, c1 = c; while (m.t[top * m.C + c0 - 1] !== 1) c0--; while (m.t[top * m.C + c1 + 1] !== 1) c1++;
  const x0 = c0 * TILE - 8, x1 = (c1 + 1) * TILE + 8, y = top * TILE + 14;
  ctx.save();
  const pts = []; for (let i = 0; i <= 10; i++) pts.push([x0 + ((x1 - x0) * i) / 10, y + 26 + ((i * 7) % 5) * 3 - (i === 0 || i === 10 ? 12 : 0)]);
  ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x1, y - 4); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(...pts[i]); ctx.closePath();
  ctx.fillStyle = '#0d0a12'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  const p = 0.6 + 0.4 * Math.sin(t * 3);
  ctx.strokeStyle = `rgba(255,122,26,${p.toFixed(2)})`; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) { const x = x0 + ((x1 - x0) * i) / 6; ctx.moveTo(x, y); ctx.lineTo(x + (i % 2 ? 6 : -6), y + 12); ctx.lineTo(x, y + 24); }
  ctx.moveTo(x0 + 6, y + 10); ctx.lineTo(x1 - 6, y + 12);
  ctx.stroke();
  ctx.strokeStyle = '#8a8098'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0 + 4, y - 3); ctx.lineTo(x1 - 4, y - 3); ctx.stroke();
  ctx.restore();
}

// ── The Volcano Lord ─────────────────────────────────────────
/**
 * The final boss, twice the Iceman's height: a king of cooled basalt with lava running in his
 * seams, a crown of three smoking volcanic spires, a molten heart in his chest and a cloak of
 * smoke. He glows white-hot when he staggers (that's when the blade hurts him).
 */
export function drawLord(ctx, b, t, glow) {
  const st = b.state, dazed = st === 'stuck', dying = st === 'dying';
  const k = dying ? 1 - Math.max(0, b.t) / 1.7 : 0;
  const P = b.phase || 1;
  const hot = b.flash > 0 ? '#ffe8c0' : dazed ? HOTTER : HOT;
  ctx.save(); ctx.translate(b.x, b.y);
  if (glow) { ctx.globalAlpha = dazed ? 1 : 0.5 + P * 0.12; ctx.drawImage(glow, -110, -170, 220, 200); ctx.globalAlpha = 1; }
  if (dying) { ctx.globalAlpha = 1 - k * 0.85; ctx.translate(0, k * 40); ctx.scale(1 + k * 0.2, 1 - k * 0.5); }
  ctx.scale(b.face || 1, 1);
  const walk = st === 'walk' ? Math.sin(b.anim * 4.6) : 0, bob = Math.abs(walk) * 3;
  const crouch = st === 'crouch' ? ease(Math.min(1, 1 - b.t / 0.5)) : 0;
  const up = st === 'air' || st === 'fall' || st === 'hunt';
  const wind = st === 'windup' ? ease(Math.min(1, 1 - b.t / 0.85)) : 0;
  const raise = st === 'summon' ? ease(Math.min(1, 1 - b.t / 0.7)) : 0;
  const thrust = st === 'volley' ? ease(Math.min(1, 1 - b.t / 0.65)) : 0;
  if (crouch) ctx.scale(1 + crouch * 0.12, 1 - crouch * 0.2);
  if (up) ctx.scale(0.9, 1.12);
  // the cloak of smoke, streaming behind him
  ctx.save(); ctx.globalAlpha *= 0.85;
  const wave = Math.sin(t * 2.4) * 6, wave2 = Math.sin(t * 3.1 + 1) * 5;
  ctx.beginPath(); ctx.moveTo(-20, -84); ctx.quadraticCurveTo(-46 + wave, -60, -52 + wave2, -18);
  ctx.lineTo(-60 + wave, -4); ctx.lineTo(-44 + wave2, -10); ctx.lineTo(-36, 0); ctx.lineTo(-26 + wave, -12); ctx.lineTo(-12, -40); ctx.closePath();
  ctx.fillStyle = '#16111c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,122,26,.45)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-60 + wave, -4); ctx.lineTo(-44 + wave2, -10); ctx.lineTo(-36, 0); ctx.stroke();
  ctx.restore();
  // legs (kneeling when he staggers)
  for (const s of [-1, 1]) {
    const st2 = s * walk * 8;
    if (dazed && s > 0) { poly(ctx, [[2, -44], [18, -44], [26, -18], [30, -2], [8, 0], [6, -16]]); inked(ctx, ROCK2, 3); continue; }
    if (dazed) { poly(ctx, [[-20, -44], [-4, -44], [-10, -10], [-30, -2], [-34, 0], [-36, -6], [-22, -12]]); inked(ctx, ROCKC, 3); continue; }
    poly(ctx, [[s * 11 - 10 + st2 * 0.3, -46], [s * 11 + 10 + st2 * 0.3, -46], [s * 12 + 10 + st2, -6], [s * 12 + 15 + st2, 0], [s * 12 - 13 + st2, 0], [s * 12 - 11 + st2, -8]]);
    inked(ctx, s > 0 ? ROCK2 : ROCKC, 3);
    cracks(ctx, [[s * 11 + st2 * 0.6, -36, s * 12 + 3 + st2 * 0.8, -22]], hot, 1.6);
  }
  const lean = dazed ? 0.32 : wind ? -0.1 * wind : thrust ? 0.08 : 0;
  ctx.translate(0, (dazed ? -32 : -44) - bob + crouch * 6);
  ctx.rotate(lean);
  lordArm(ctx, -1, { walk, wind, raise, thrust, dazed, up }, hot, t);
  // torso: broad shoulders tapering to the waist, armoured in basalt plates
  poly(ctx, [[-20, 4], [-28, -18], [-34, -38], [-28, -50], [-8, -56], [16, -54], [32, -44], [30, -20], [20, 4]]); inked(ctx, ROCKC, 3.8);
  poly(ctx, [[-30, -42], [-24, -52], [-8, -56], [-12, -44], [-26, -36]]); inked(ctx, ROCK2, 2.4);
  poly(ctx, [[30, -42], [26, -52], [14, -55], [16, -44], [26, -38]]); inked(ctx, ROCK2, 2.4);
  // a smoking vent on each shoulder
  for (const [sx, sy] of [[-22, -52], [24, -52]]) {
    ctx.fillStyle = hot; ctx.beginPath(); ctx.ellipse(sx, sy, 4, 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(138,128,152,.25)';
    for (let i = 0; i < 3; i++) { const q = (t * 0.8 + i / 3) % 1; ctx.beginPath(); ctx.arc(sx - q * 8, sy - 6 - q * 26, 3 + q * 6, 0, TAU); ctx.fill(); }
  }
  // the molten heart: a rune of fire in his chest
  const pulse = 0.5 + 0.5 * Math.sin(t * (dazed ? 14 : 3.5));
  if (glow && (dazed || b.flash > 0)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + pulse * 0.4; ctx.drawImage(glow, -34, -62, 68, 68); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  poly(ctx, [[0, -42], [10, -32], [6, -18], [0, -12], [-6, -18], [-10, -32]]);
  ctx.fillStyle = dazed ? (pulse > 0.5 ? WHITE : '#ffd9a0') : b.flash > 0 ? WHITE : '#c2410c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
  cracks(ctx, [[0, -38, 0, -16], [-5, -28, 5, -28]], dazed ? '#c2410c' : HOTTER, 2);
  // seams of lava across the plates: more of them as he breaks
  const segs = [[-24, -10, -16, -18, -18, -28], [22, -14, 14, -8, 18, 0], [-14, -50, -6, -46]];
  if (P >= 2) segs.push([-28, -28, -20, -32, -22, -40], [26, -30, 18, -26, 22, -20], [-6, -2, 0, -6, 4, 2]);
  if (P >= 3) segs.push([12, -48, 6, -42, 10, -36], [-18, 0, -12, -6], [28, -6, 22, -2]);
  cracks(ctx, segs, hot, 2.4); cracks(ctx, segs, '#ffd9a0', 0.8);
  // the head, set low between the shoulders
  ctx.save(); ctx.translate(6, -60);
  if (dazed) ctx.rotate(0.3);
  poly(ctx, [[-12, 6], [-13, -8], [-6, -16], [8, -16], [15, -8], [14, 6], [4, 10], [-6, 9]]); inked(ctx, ROCK2, 3);
  // the crown: three volcanic spires, each smoking at its tip
  const flare = raise > 0 || P === 3 ? 1 : 0;
  for (const [x, h, w] of [[-9, 14, 5], [1, 22, 6], [11, 15, 5]]) {
    poly(ctx, [[x - w, -14], [x - w * 0.4, -14 - h], [x + w * 0.4, -14 - h], [x + w, -14]]); inked(ctx, ROCKC, 2.4);
    ctx.fillStyle = hot; ctx.fillRect(x - w * 0.4, -15 - h, w * 0.8, 2.5);
    const fl = 4 + Math.sin(t * 13 + x) * 2 + flare * 6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,154,60,.75)'; ctx.beginPath(); ctx.moveTo(x - w * 0.4, -15 - h); ctx.quadraticCurveTo(x, -15 - h - fl * 2.2, x + w * 0.4, -15 - h); ctx.fill();
    ctx.fillStyle = 'rgba(255,243,214,.8)'; ctx.beginPath(); ctx.moveTo(x - w * 0.2, -15 - h); ctx.quadraticCurveTo(x, -15 - h - fl, x + w * 0.2, -15 - h); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // brow, burning eyes, a maw of fire
  ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(14, -8); ctx.stroke();
  const eyeHot = st === 'windup' || st === 'crouch' || st === 'summon' || st === 'volley' || st === 'intro';
  ctx.strokeStyle = dazed ? '#ffd9a0' : eyeHot ? WHITE : HOTTER; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(1, -1); ctx.moveTo(6, -1); ctx.lineTo(12, -3); ctx.stroke();
  const maw = thrust ? 4 : st === 'intro' || raise ? 3 : 1.5;
  ctx.fillStyle = hot; ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(12, 3); ctx.lineTo(10, 4 + maw); ctx.lineTo(0, 4 + maw); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); for (const x of [1, 5, 9]) { ctx.moveTo(x, 3); ctx.lineTo(x + 1, 4 + maw * 0.6); } ctx.stroke();
  ctx.restore();
  lordArm(ctx, 1, { walk, wind, raise, thrust, dazed, up }, hot, t);
  ctx.restore();
  if (dazed) {
    for (let i = 0; i < 4; i++) {
      const a = t * 4.5 + (i * TAU) / 4;
      ctx.fillStyle = i % 2 ? WHITE : HOTTER;
      ctx.beginPath(); ctx.arc(b.x + b.face * 26 + Math.cos(a) * 26, b.y - 118 + Math.sin(a) * 7, 2.8, 0, TAU); ctx.fill();
    }
  }
}

/** One of the Lord's arms: a plated shoulder, a long forearm and a clawed hand. */
function lordArm(ctx, s, A, hot, t) {
  const sx = s > 0 ? 22 : -22, sy = -46;
  let hx, hy;
  if (A.dazed) { hx = s > 0 ? 52 : 34; hy = s > 0 ? 34 : 24; }                 // braced on the floor
  else if (A.wind > 0) { hx = s * 8 + 6; hy = -96 - 22 * A.wind; }                // both fists high
  else if (A.raise > 0) { hx = s * 30; hy = -84 - 18 * A.raise; }                 // arms spread to the sky
  else if (A.thrust > 0) { hx = 44 + 10 * A.thrust + (s < 0 ? -8 : 0); hy = -40 + (s < 0 ? 6 : 0); }
  else if (A.up) { hx = s * 16 + 4; hy = -92; }
  else { hx = sx + s * 14 + A.walk * s * 10 + 6; hy = 2 + Math.abs(A.walk) * 3; }
  const ex = (sx + hx) / 2 + s * 12, ey = (sy + hy) / 2 + 4;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = s > 0 ? ROCK2 : ROCKC; ctx.lineWidth = 11; ctx.stroke();
  cracks(ctx, [[(sx + ex) / 2, (sy + ey) / 2 - 2, ex, ey]], hot, 1.6);
  // the hand: a palm and three claws
  ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); inked(ctx, s > 0 ? ROCK2 : ROCKC, 3);
  ctx.strokeStyle = INK; ctx.lineWidth = 4.4;
  ctx.beginPath(); for (const a of [-0.6, 0, 0.6]) { const d = A.dazed ? Math.PI / 2 : A.wind || A.raise || A.up ? -Math.PI / 2 : A.thrust ? 0 : Math.PI / 2; ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(d + a) * 15, hy + Math.sin(d + a) * 15); } ctx.stroke();
  if (A.thrust > 0 && s > 0) {                                                      // fire gathering in his palm
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,154,60,.8)'; ctx.beginPath(); ctx.arc(hx + 10, hy, 7 + A.thrust * 5 + Math.sin(t * 30) * 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(hx + 10, hy, 3 + A.thrust * 2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** His shadow on the floor while he hangs in the smoke above: it hunts, then stops and turns red. */
export function drawLeapShadow(ctx, b, t) {
  const locked = b.locked || b.state === 'fall', near = b.state === 'fall' ? Math.min(1, (b.y + 170) / (b.floorY + 170)) : 0;
  const w = 30 + near * 16, x = b.tx, y = b.floorY;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${(0.45 + near * 0.35).toFixed(2)})`;
  ctx.beginPath(); ctx.ellipse(x, y - 1, w, 6 + near * 3, 0, 0, TAU); ctx.fill();
  const pulse = 0.5 + 0.5 * Math.sin(t * (locked ? 22 : 8));
  ctx.strokeStyle = locked ? `rgba(255,70,40,${(0.6 + 0.4 * pulse).toFixed(2)})` : `rgba(255,154,60,${(0.35 + 0.3 * pulse).toFixed(2)})`;
  ctx.lineWidth = locked ? 2.6 : 1.6;
  ctx.beginPath(); ctx.ellipse(x, y - 1, w + 8, 9 + near * 3, 0, 0, TAU); ctx.stroke();
  if (locked) {                                                                    // falling debris lines from above
    ctx.strokeStyle = 'rgba(255,154,60,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (const d of [-22, -6, 12, 26]) { const q = (t * 3 + d * 0.05) % 1; ctx.moveTo(x + d, y - 140 + q * 100); ctx.lineTo(x + d, y - 120 + q * 100); } ctx.stroke();
  }
  ctx.restore();
}

/** A fire pillar: first a glowing mark in the floor, then a column of flame. */
export function drawPillar(ctx, q, t, glow, PH, HW, WARN) {
  const x = q.x, y = q.y;
  ctx.save();
  if (q.warn > 0) {
    const k = 1 - q.warn / WARN, pulse = 0.5 + 0.5 * Math.sin(t * (10 + k * 20));
    if (glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.5 * k; ctx.drawImage(glow, x - 30, y - 30, 60, 40); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    ctx.strokeStyle = `rgba(255,${Math.round(154 + 60 * pulse)},60,${(0.5 + 0.5 * k).toFixed(2)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y - 1, HW + 4, 4, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); for (const d of [-10, -3, 5, 11]) { ctx.moveTo(x + d, y); ctx.lineTo(x + d * 1.3, y - 3); } ctx.stroke();
    // sparks rising out of the mark
    ctx.fillStyle = HOTTER;
    for (let i = 0; i < 4; i++) { const u = (t * 1.6 + i * 0.25) % 1; ctx.globalAlpha = (1 - u) * k; ctx.fillRect(x - 10 + i * 6 + Math.sin(t * 6 + i) * 3, y - 4 - u * 34 * (0.5 + k), 2, 2); }
    ctx.restore(); return;
  }
  // the column: layered tongues of flame
  const flick = (i) => Math.sin(t * 24 + i * 1.7) * 3;
  if (glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85; ctx.drawImage(glow, x - 46, y - PH - 20, 92, PH + 40); ctx.globalAlpha = 1; }
  ctx.globalCompositeOperation = 'source-over';
  const col = (w, top, c) => {
    ctx.beginPath(); ctx.moveTo(x - w, y);
    for (let i = 0; i <= 6; i++) { const yy = y - (PH * i) / 6; ctx.lineTo(x - w * (1 - i * 0.08) + flick(i), yy); }
    ctx.lineTo(x + flick(9), y - PH - top);
    for (let i = 6; i >= 0; i--) { const yy = y - (PH * i) / 6; ctx.lineTo(x + w * (1 - i * 0.08) + flick(i + 3), yy); }
    ctx.closePath(); ctx.fillStyle = c; ctx.fill();
  };
  col(HW + 2, 18, '#c2410c'); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
  col(HW * 0.65, 10, HOTTER); col(HW * 0.28, 4, WHITE);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — character art. Canvas paths only (no images), all cosmetic:
//  these functions read game state and never change the rules.
//
//  The explorer is a real EVA astronaut: white pressure suit with bearing rings at the
//  shoulders, elbows, wrists and knees, a life-support backpack with antenna and thrusters,
//  a chest control box with hoses, red commander stripes, gloves and boots, and the gold sun
//  visor pulled down: a curved mirror of sky and ground with a moving shine, so his face is
//  never seen. Drawn in world pixels, origin at the feet centre, facing +x (the caller
//  mirrors for left), about 31 px tall.
// ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
/** angle → unit vector: 0 points straight down, +π/2 forward (+x), π straight up */
const dv = (a) => [Math.sin(a), Math.cos(a)];
const lerp = (a, b, t) => a + (b - a) * t;

export const SUITS = {
  normal: {
    suit: '#eef2f6', light: '#ffffff', shade: '#b9c3cf', far: '#a3aebb', joint: '#8d99a8', trim: '#566171',
    pack: '#dde3ea', packShade: '#a9b4c1', stripe: '#d63b3b', rim: '#8794a6', glass: '56,189,248',
    boot: '#d6dce4', sole: '#3f4a5a', glove: '#f4f6f9', tips: '#5c6878', visor: ['#24170a', '#8a5a12', '#f8d36b', '#6b4210', '#c48a26'],
    blade: ['#ecfeff', '#67e8f9', 'rgba(34,211,238,'], line: 'rgba(8,12,28,.62)',
  },
  gold: {
    suit: '#fcd34d', light: '#fef3c7', shade: '#e0a526', far: '#c98a1c', joint: '#b7791f', trim: '#7c4a12',
    pack: '#fbbf24', packShade: '#c88a1a', stripe: '#fffbeb', rim: '#fde68a', glass: '251,191,36',
    boot: '#fcd34d', sole: '#6b3d0c', glove: '#fef3c7', tips: '#a16207', visor: ['#1c1003', '#6b3a07', '#f59e0b', '#4a2a06', '#a16207'],
    blade: ['#fffbeb', '#fde047', 'rgba(250,204,21,'], line: 'rgba(40,20,4,.6)',
  },
  flash: {
    suit: '#ffffff', light: '#ffffff', shade: '#ffe4e6', far: '#fecdd3', joint: '#fda4af', trim: '#fb7185',
    pack: '#ffffff', packShade: '#fecdd3', stripe: '#fb7185', rim: '#fda4af', glass: '255,228,230',
    boot: '#ffffff', sole: '#fb7185', glove: '#ffffff', tips: '#fda4af', visor: ['#fda4af', '#fecdd3', '#ffffff', '#fb7185', '#fecdd3'],
    blade: ['#ffffff', '#fecdd3', 'rgba(255,228,230,'], line: 'rgba(80,10,20,.5)',
  },
};

// body measurements (world px)
const THIGH = 5.4, SHIN = 5.0, BOOT = 1.8;
const UPPER = 4.8, FORE = 4.2, GLOVE = 1.65;
const SHOULDER = { x: 1.0, y: -9.0 };          // in the upper-body frame (hip = 0,0)
const HELM = { x: 1.6, y: -14.0, r: 5.1 };     // helmet centre / radius, upper-body frame
export const ASTRO_H = 31;

/**
 * Turn game state into a pose.
 * s = { mode: 'idle'|'run'|'jump'|'fall', t, phase, run (0..1), vy, flame (0..1), land (0..1),
 *       slash: { kind: 'side'|'up'|'down', k (0..1) } | null, shoot: { dir: 'side'|'up'|'down', k } | null,
 *       hurt (0..1), look: { x, y } (-1..1) — where the visor's shine drifts, idleLook (-1..1) }
 */
export function astroPose(s) {
  const t = s.t || 0;
  const P = {
    lean: 0, bob: 0, tilt: 0, grounded: s.mode === 'idle' || s.mode === 'run',
    near: { thigh: 0.07, bend: 0.12 }, far: { thigh: -0.06, bend: 0.14 },
    armN: { a: 0.16, bend: 0.38 }, armF: { a: -0.04, bend: 0.32 },
    look: { x: s.look?.x ?? 0.5, y: s.look?.y ?? 0 }, visorBlade: 0,
    squash: 1, flame: 0, weapon: null, weaponK: 0, slashKind: null, breath: 0,
  };
  if (s.mode === 'idle') {
    const br = Math.sin(t * 2.0);
    P.breath = br; P.bob = br * 0.16;
    P.armN.a = 0.15 + br * 0.03; P.armF.a = -0.03 - br * 0.03;
    P.tilt = (s.idleLook || 0) * 0.12;
    if (s.idleLook) P.look = { x: s.idleLook > 0 ? 0.9 : -0.6, y: -0.5 * Math.abs(s.idleLook) };
  } else if (s.mode === 'run') {
    const ph = s.phase || 0, k = s.run ?? 1;
    P.near.thigh = 0.66 * Math.sin(ph) * k + 0.04;
    P.far.thigh = -0.66 * Math.sin(ph) * k + 0.04;
    P.near.bend = 0.14 + 1.05 * Math.max(0, Math.cos(ph)) * k;
    P.far.bend = 0.14 + 1.05 * Math.max(0, -Math.cos(ph)) * k;
    P.armN.a = -0.62 * Math.sin(ph) * k + 0.12;
    P.armF.a = 0.62 * Math.sin(ph) * k + 0.08;
    P.armN.bend = 0.45 + 0.6 * Math.max(0, -Math.sin(ph)) * k;
    P.armF.bend = 0.45 + 0.6 * Math.max(0, Math.sin(ph)) * k;
    P.lean = 0.13 * k; P.tilt = -0.05 * k;
  } else if (s.mode === 'jump') {
    P.near = { thigh: 0.9, bend: 1.45 }; P.far = { thigh: -0.12, bend: 0.62 };
    P.armN = { a: 2.45, bend: 0.4 }; P.armF = { a: 2.05, bend: 0.45 };
    P.lean = 0.06; P.flame = s.flame || 0; P.look.y = -0.6;
  } else {   // fall
    const w = Math.sin(t * 9) * 0.09;
    P.near = { thigh: 0.36, bend: 0.55 }; P.far = { thigh: -0.32, bend: 0.7 };
    P.armN = { a: 1.7 + w, bend: 0.35 }; P.armF = { a: 2.0 - w, bend: 0.35 };
    P.lean = -0.04; P.look.y = 0.6;
  }
  if (s.land > 0) {
    const k = s.land;
    P.near.thigh += 0.5 * k; P.far.thigh += 0.38 * k; P.near.bend += 1.0 * k; P.far.bend += 1.0 * k;
    P.lean += 0.14 * k; P.squash = 1 - 0.06 * k;
  }
  if (s.slash) {
    const k = s.slash.k, e = 1 - Math.pow(1 - Math.min(1, k * 1.25), 3);
    P.weapon = 'blade'; P.weaponK = k; P.slashKind = s.slash.kind; P.visorBlade = 1 - k;
    if (s.slash.kind === 'up') { P.armN = { a: lerp(1.15, 3.55, e), bend: 0.12 }; P.lean -= 0.08; P.look.y = -1; }
    else if (s.slash.kind === 'down') { P.armN = { a: lerp(1.8, -0.55, e), bend: 0.12 }; P.lean += 0.12; P.look.y = 1; P.near = { thigh: 0.75, bend: 1.3 }; P.far = { thigh: 0.35, bend: 1.2 }; }
    else { P.armN = { a: lerp(2.75, 0.62, e), bend: 0.1 }; P.lean += 0.16; P.look.x = 1; }
  } else if (s.shoot) {
    const kick = Math.max(0, 1 - s.shoot.k * 5) * 0.18;
    P.weapon = 'blaster'; P.weaponK = s.shoot.k; P.visorBlade = Math.max(0, 1 - s.shoot.k * 5) * 0.8;
    if (s.shoot.dir === 'up') { P.armN = { a: Math.PI - 0.1 - kick, bend: 0.05 }; P.look.y = -1; P.lean -= 0.05; }
    else if (s.shoot.dir === 'down') { P.armN = { a: 0.18 + kick, bend: 0.05 }; P.look.y = 1; }
    else { P.armN = { a: Math.PI / 2 + kick, bend: 0.04 }; P.look.x = 1; P.lean -= kick * 0.5; }
  }
  if (s.hurt > 0) {
    const k = s.hurt;
    P.lean = -0.32 * k; P.armN = { a: 2.4, bend: 0.65 }; P.armF = { a: 2.75, bend: 0.5 };
    P.weapon = null;
  }
  return P;
}

function stroke(ctx, pts, w, col, line) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = w + 1.25; ctx.stroke(); }
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}
function ring(ctx, x, y, a, rx, ry, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function legPoints(hx, L) {
  const [tx, ty] = dv(L.thigh), kx = hx + tx * THIGH, ky = ty * THIGH;
  const sa = L.thigh - L.bend, [sx, sy] = dv(sa);
  return { kx, ky, ax: kx + sx * SHIN, ay: ky + sy * SHIN, sa };
}

/** Draw one boot at the ankle. flat: keep the sole level (standing / running on the ground). */
function boot(ctx, x, y, a, C, flat) {
  ctx.save(); ctx.translate(x, y);
  ctx.rotate(flat ? 0 : Math.max(-0.7, Math.min(0.7, -a * 0.6)));
  ctx.fillStyle = C.line; rr(ctx, -2.9, -0.9, 6.6, 3.5, 1.4); ctx.fill();
  ctx.fillStyle = C.boot; rr(ctx, -2.4, -0.5, 5.8, 2.7, 1.1); ctx.fill();
  ctx.fillStyle = C.sole; ctx.fillRect(-2.4, 1.45, 5.8, 0.85);
  ctx.fillStyle = C.joint; ctx.fillRect(-2.0, -0.5, 4.4, 0.55);      // boot cuff ring
  ctx.restore();
}

function arm(ctx, sx, sy, A, C, near, P) {
  const [ux, uy] = dv(A.a), ex = sx + ux * UPPER, ey = sy + uy * UPPER;
  const fa = A.a + A.bend, [fx, fy] = dv(fa), hx = ex + fx * FORE, hy = ey + fy * FORE;
  const col = near ? C.suit : C.far;
  stroke(ctx, [sx, sy, ex, ey], 3.7, col, C.line);
  stroke(ctx, [ex, ey, hx, hy], 3.3, col, C.line);
  // bearing rings at the elbow and wrist, a mission patch on the near upper arm
  ring(ctx, ex, ey, -A.a, 1.95, 1.0, C.joint);
  const wx = ex + fx * FORE * 0.82, wy = ey + fy * FORE * 0.82;
  ring(ctx, wx, wy, -fa, 1.85, 0.75, near ? C.trim : C.joint);
  if (near) {
    const px = sx + ux * UPPER * 0.42, py = sy + uy * UPPER * 0.42;
    ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(px, py, 0.95, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(px + 0.15, py - 0.1, 0.38, 0, TAU); ctx.fill();
  }
  // glove: palm + darker fingertips, pointing along the forearm
  const gx = hx + fx * 0.6, gy = hy + fy * 0.6;
  ctx.fillStyle = C.line; ctx.beginPath(); ctx.arc(gx, gy, GLOVE + 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = near ? C.glove : C.far; ctx.beginPath(); ctx.arc(gx, gy, GLOVE, 0, TAU); ctx.fill();
  ctx.fillStyle = C.tips; ctx.beginPath(); ctx.arc(gx + fx * 0.85, gy + fy * 0.85, GLOVE * 0.62, 0, TAU); ctx.fill();
  return { hx: gx, hy: gy, fa };
}

function weapon(ctx, h, P, C) {
  const [fx, fy] = dv(h.fa);
  if (P.weapon === 'blade') {
    // hilt in the fist, then the energy blade
    const bx = h.hx + fx * 0.5, by = h.hy + fy * 0.5;
    stroke(ctx, [h.hx - fx * 1.3, h.hy - fy * 1.3, bx + fx * 1.1, by + fy * 1.1], 1.7, '#374151', C.line);
    const L = 15.5, tx = bx + fx * (1.2 + L), ty = by + fy * (1.2 + L);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.blade[2] + '.35)'; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(bx + fx * 1.2, by + fy * 1.2); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = C.blade[1]; ctx.lineWidth = 2.1; ctx.stroke();
    ctx.strokeStyle = C.blade[0]; ctx.lineWidth = 0.9; ctx.stroke();
  } else if (P.weapon === 'blaster') {
    ctx.save(); ctx.translate(h.hx, h.hy); ctx.rotate(Math.atan2(fy, fx));
    ctx.fillStyle = C.line; rr(ctx, -1.6, -2.1, 7.6, 3.6, 1); ctx.fill();
    ctx.fillStyle = '#4b5563'; rr(ctx, -1.2, -1.7, 6.8, 2.8, 0.9); ctx.fill();
    ctx.fillStyle = '#9ca3af'; ctx.fillRect(-0.6, -1.7, 4.6, 0.7);
    ctx.fillStyle = '#22d3ee'; ctx.fillRect(4.6, -1.3, 1.2, 2.0);           // emitter
    if (P.weaponK < 0.18) {                                                // muzzle flash
      const f = 1 - P.weaponK / 0.18;
      ctx.fillStyle = `rgba(165,243,252,${0.85 * f})`; ctx.beginPath(); ctx.arc(7.4, -0.3, 2.6 * f + 0.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * The lowered gold sun visor (helmet frame): a curved mirror of dark space, a glowing horizon and
 * the ground, with a soft shine that drifts as the head turns. Nothing behind it shows.
 * P may also carry: visorBlade (0..1, the energy blade's light), visorFlash (0..1, red hit flash),
 * crack (last armour plate), glint (0..1, a sparkle after a kill) — the HUD portrait uses those.
 */
function mirror(ctx, vx, vy, rx, ry, P, C) {
  const V = C.visor, top = vy - ry, h = ry * 2;
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, V[0]); g.addColorStop(0.42, V[1]); g.addColorStop(0.57, V[2]); g.addColorStop(0.66, V[3]); g.addColorStop(1, V[4]);
  ctx.fillStyle = g; ctx.fillRect(vx - rx - 1, top - 1, rx * 2 + 2, h + 2);
  // the horizon, bent by the curved glass, and a few reflected stars
  ctx.globalAlpha = 0.55; ctx.strokeStyle = V[2]; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.ellipse(vx - 0.6, vy + 6.1, rx + 2.4, 5.6, 0, -2.65, -0.45); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (const [sx, sy] of [[-1.7, -2.7], [0.8, -3.2], [2.2, -2.0], [-0.4, -1.5]]) ctx.fillRect(vx + sx, vy + sy, 0.32, 0.32);
  // the shine: a soft bloom and two bright streaks
  const lx = (P.look?.x || 0) * 0.35, ly = (P.look?.y || 0) * 0.3, bx = vx - 1.3 + lx, by = vy - 1.9 + ly;
  const sh = ctx.createRadialGradient(bx, by, 0.1, bx, by, 2.7);
  sh.addColorStop(0, 'rgba(255,255,255,.78)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(vx - rx, vy - ry, rx * 2, ry * 2);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.88)'; ctx.lineWidth = 0.55;
  ctx.beginPath(); ctx.ellipse(vx - 0.2, vy - 0.2, rx - 0.85, ry - 0.85, -0.12, -2.6 + lx * 0.3, -1.7 + lx * 0.3); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.ellipse(vx + 0.3, vy + 0.4, rx - 1.1, ry - 1.2, -0.12, 0.2, 0.9); ctx.stroke();
  if (P.visorBlade > 0) {                       // the energy blade's light sweeping across the glass
    ctx.strokeStyle = C.blade[2] + (0.75 * P.visorBlade) + ')'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(vx + 0.4, vy, rx - 1.4, ry - 1.5, -0.12, -0.9, 0.6); ctx.stroke();
  }
  if (P.visorFlash > 0) { ctx.fillStyle = `rgba(251,113,133,${0.6 * P.visorFlash})`; ctx.fillRect(vx - rx, vy - ry, rx * 2, ry * 2); }
  if (P.crack) {                                // last plate: the glass has cracked
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.28; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(vx + 2.6, vy - 2.6); ctx.lineTo(vx + 1.1, vy - 0.9); ctx.lineTo(vx + 1.6, vy + 0.2); ctx.lineTo(vx - 0.2, vy + 1.9);
    ctx.moveTo(vx + 1.1, vy - 0.9); ctx.lineTo(vx - 0.6, vy - 1.3); ctx.moveTo(vx + 1.6, vy + 0.2); ctx.lineTo(vx + 2.9, vy + 0.9); ctx.stroke();
  }
  if (P.glint > 0) {                            // a four-point sparkle after a kill
    const k = P.glint, gx = bx + 0.7, gy = by + 0.5, L = 2.1 * k, w = 0.32 * k;
    ctx.fillStyle = `rgba(255,255,255,${0.95 * k})`;
    ctx.beginPath(); ctx.moveTo(gx, gy - L); ctx.lineTo(gx + w, gy - w); ctx.lineTo(gx + L, gy); ctx.lineTo(gx + w, gy + w);
    ctx.lineTo(gx, gy + L); ctx.lineTo(gx - w, gy + w); ctx.lineTo(gx - L, gy); ctx.lineTo(gx - w, gy - w); ctx.closePath(); ctx.fill();
  }
}

function helmet(ctx, P, C, lamp) {
  const hx = HELM.x, hy = HELM.y, r = HELM.r;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(P.tilt); ctx.translate(-hx, -hy);
  // neck ring (helmet bearing)
  ring(ctx, hx - 0.3, hy + 4.4, -0.08, 3.9, 1.35, C.joint);
  // shell
  ctx.fillStyle = C.line; ctx.beginPath(); ctx.arc(hx, hy, r + 0.62, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(hx - 1.4, hy - 2.3, 0.4, hx, hy, r + 0.6);
  g.addColorStop(0, C.light); g.addColorStop(0.55, C.suit); g.addColorStop(1, C.shade);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill();
  // the visor hood: a raised ridge round the top of the visor
  ctx.lineCap = 'round'; ctx.strokeStyle = C.shade; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.arc(hx + 0.3, hy + 0.3, r - 0.55, -2.15, -0.55); ctx.stroke();
  // the gold sun visor, pulled down over the face
  const vx = hx + 1.7, vy = hy + 0.45, vrx = 3.75, vry = 4.05;
  ctx.save();
  ctx.beginPath(); ctx.arc(hx, hy, r - 0.05, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.ellipse(vx, vy, vrx, vry, -0.12, 0, TAU); ctx.clip();
  mirror(ctx, vx, vy, vrx, vry, P, C);
  ctx.restore();
  ctx.strokeStyle = C.rim; ctx.lineWidth = 0.75;
  ctx.beginPath(); ctx.ellipse(vx, vy, vrx, vry, -0.12, -2.25, 1.75); ctx.stroke();
  // two helmet lamps on the top-front
  for (const [ax, ay] of [[1.9, -4.75], [3.95, -3.2]]) {
    ctx.fillStyle = C.trim; rr(ctx, hx + ax - 0.85, hy + ay - 0.65, 1.7, 1.3, 0.4); ctx.fill();
    ctx.fillStyle = lamp > 0 ? '#fffbeb' : '#cbd5e1'; ctx.beginPath(); ctx.arc(hx + ax + 0.35, hy + ay - 0.05, 0.42, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the astronaut. P from astroPose(), C a SUITS entry.
 * opt: { lamp (0..1) — helmet lamps lit, led — backpack status light on }
 */
export function drawAstronaut(ctx, P, C, opt = {}) {
  const hipN = 0.55, hipF = -0.45;
  const n = legPoints(hipN, P.near), f = legPoints(hipF, P.far);
  // ground fit: the lower ankle sits on the floor when grounded; in the air keep standing height
  const stand = THIGH + SHIN - 0.15;
  const hipY = P.grounded ? -(Math.max(n.ay, f.ay) + BOOT) : -(stand + BOOT) + 0.6;
  ctx.save();
  ctx.scale(1, P.squash); ctx.translate(0, hipY + P.bob);
  ctx.lineCap = 'round';

  // ── far side: arm (behind the body), leg
  ctx.save(); ctx.rotate(P.lean);
  arm(ctx, SHOULDER.x - 1.0, SHOULDER.y + 0.3, P.armF, C, false, P);
  ctx.restore();
  stroke(ctx, [hipF, 0, f.kx, f.ky], 4.4, C.far, C.line);
  stroke(ctx, [f.kx, f.ky, f.ax, f.ay], 4.0, C.far, C.line);
  ring(ctx, f.kx, f.ky, -P.far.thigh, 2.2, 1.1, C.joint);
  boot(ctx, f.ax, f.ay, f.sa, C, P.grounded);

  // ── backpack (life support), under the upper-body rotation
  ctx.save(); ctx.rotate(P.lean);
  const breath = P.breath * 0.12;
  ctx.fillStyle = C.line; rr(ctx, -10.5, -12.2, 7.4, 11.4, 1.9); ctx.fill();
  const pg = ctx.createLinearGradient(-10, 0, -3.6, 0); pg.addColorStop(0, C.packShade); pg.addColorStop(1, C.pack);
  ctx.fillStyle = pg; rr(ctx, -10.0, -11.7, 6.4, 10.4, 1.5); ctx.fill();
  ctx.fillStyle = C.packShade; ctx.fillRect(-10.0, -10.4, 6.4, 0.6); ctx.fillRect(-10.0, -5.6, 6.4, 0.45);
  ctx.fillStyle = C.trim; ctx.fillRect(-9.2, -3.6, 2.2, 1.4);
  ctx.fillStyle = opt.led ? '#4ade80' : '#166534'; ctx.fillRect(-6.6, -3.4, 0.9, 0.9);
  // antenna
  ctx.strokeStyle = C.trim; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(-9.0, -11.7); ctx.lineTo(-9.4, -16.2); ctx.stroke();
  ctx.fillStyle = C.trim; ctx.beginPath(); ctx.arc(-9.4, -16.3, 0.45, 0, TAU); ctx.fill();
  // thruster nozzles + flame
  ctx.fillStyle = C.trim; ctx.fillRect(-9.4, -1.3, 1.6, 1.0); ctx.fillRect(-6.2, -1.3, 1.6, 1.0);
  if (P.flame > 0) {
    for (const nx of [-8.6, -5.4]) {
      const L = (3 + 4.5 * P.flame) * (0.8 + 0.2 * Math.sin(performance.now() / 23 + nx));
      const fg = ctx.createLinearGradient(0, -0.3, 0, L);
      fg.addColorStop(0, 'rgba(255,251,235,.95)'); fg.addColorStop(0.35, 'rgba(253,186,116,.85)'); fg.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(nx - 0.9, -0.3); ctx.quadraticCurveTo(nx, L * 1.15, nx + 0.9, -0.3); ctx.fill();
    }
  }
  ctx.restore();

  // ── near leg
  stroke(ctx, [hipN, 0, n.kx, n.ky], 4.4, C.suit, C.line);
  stroke(ctx, [n.kx, n.ky, n.ax, n.ay], 4.0, C.suit, C.line);
  { // red commander stripe around the thigh
    const [tx, ty] = dv(P.near.thigh), mx = hipN + tx * THIGH * 0.52, my = ty * THIGH * 0.52;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(-P.near.thigh);
    ctx.fillStyle = C.stripe; ctx.fillRect(-2.2, -0.55, 4.4, 1.1);
    ctx.restore();
  }
  ring(ctx, n.kx, n.ky, -P.near.thigh, 2.25, 1.15, C.joint);
  boot(ctx, n.ax, n.ay, n.sa, C, P.grounded);

  // ── torso, helmet, near arm (all lean with the upper body)
  ctx.save(); ctx.rotate(P.lean);
  ctx.fillStyle = C.line; rr(ctx, -5.3, -10.9 - breath, 11.6, 12.4 + breath, 3.4); ctx.fill();
  const tg = ctx.createLinearGradient(-4.8, 0, 6, 0); tg.addColorStop(0, C.shade); tg.addColorStop(0.45, C.suit); tg.addColorStop(1, C.light);
  ctx.fillStyle = tg; rr(ctx, -4.75, -10.4 - breath, 10.5, 11.4 + breath, 3.0); ctx.fill();
  ctx.fillStyle = C.joint; ctx.fillRect(-4.6, -1.7, 10.2, 1.15);                     // waist bearing ring
  ctx.fillStyle = C.shade; ctx.fillRect(-4.6, -6.0, 3.0, 0.45);                       // seam
  // chest control box + hoses
  ctx.strokeStyle = C.trim; ctx.lineWidth = 0.65;
  ctx.beginPath(); ctx.moveTo(-3.4, -3.4); ctx.quadraticCurveTo(0.6, -1.4, 3.8, -5.0); ctx.stroke();
  ctx.fillStyle = C.line; rr(ctx, 2.75, -8.95, 4.5, 4.0, 0.8); ctx.fill();
  ctx.fillStyle = C.trim; rr(ctx, 3.15, -8.55, 3.75, 3.25, 0.6); ctx.fill();
  ctx.fillStyle = '#1f2937'; ctx.fillRect(3.55, -8.15, 2.1, 1.0);
  ctx.fillStyle = '#ef4444'; ctx.fillRect(3.55, -6.65, 0.75, 0.75);
  ctx.fillStyle = '#facc15'; ctx.fillRect(4.6, -6.65, 0.75, 0.75);
  ctx.fillStyle = '#4ade80'; ctx.fillRect(5.65, -6.65, 0.75, 0.75);
  // shoulder bearing
  ctx.fillStyle = C.line; ctx.beginPath(); ctx.arc(SHOULDER.x, SHOULDER.y, 2.75, 0, TAU); ctx.fill();
  ctx.fillStyle = C.joint; ctx.beginPath(); ctx.arc(SHOULDER.x, SHOULDER.y, 2.2, 0, TAU); ctx.fill();
  helmet(ctx, P, C, opt.lamp || 0);
  const h = arm(ctx, SHOULDER.x, SHOULDER.y, P.armN, C, true, P);
  if (P.weapon) weapon(ctx, h, P, C);
  ctx.restore();

  ctx.restore();
}

/**
 * The explorer's helmet on its own (for the HUD portrait), centred on 0,0 with radius ≈ 5.1
 * before the caller scales it. P: tilt, look {x,y}, and optionally visorBlade, visorFlash, crack, glint.
 */
export function drawPortrait(ctx, P, C) {
  ctx.save(); ctx.translate(-HELM.x, -HELM.y);
  helmet(ctx, P, C, 1);
  ctx.restore();
}

/** The energy-blade swoosh in front of the body (world px, caller has mirrored for facing). */
export function drawSlashArc(ctx, kind, k, C) {
  // the swoosh follows the blade: same easing as the arm in astroPose(), sweeping from where the
  // swing starts to where the blade is now; sized to match slashBox() in world.js
  const e = 1 - Math.pow(1 - Math.min(1, k * 1.25), 3), fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
  if (fade <= 0 || e <= 0.02) return;
  const [cx, cy, r, from, to] = kind === 'up' ? [1, -22, 23, 0.5, -2.2] : kind === 'down' ? [0, -9, 22, -0.25, 2.25] : [2, -19, 24, -1.22, 0.98];
  const end = from + (to - from) * e;
  ctx.save(); ctx.lineCap = 'round';
  for (const [w, col] of [[9, C.blade[2] + (0.26 * fade) + ')'], [4, C.blade[2] + (0.6 * fade) + ')'], [1.5, `rgba(255,255,255,${0.95 * fade})`]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(from, end), Math.max(from, end)); ctx.stroke();
  }
  ctx.restore();
}

// ── Aliens ─────────────────────────────────────────────────────
// Each is drawn around its feet centre (x, y = bottom), facing f.dir. `t` = seconds.

const ELITE = { shell: ['#7f1d1d', '#dc2626'], eye: '#fde047' };

/** Dust Mite: armoured six-legged crawler with glowing eyes. */
export function drawCrawler(ctx, f, t, white) {
  const e = f.elite, step = t * 14 * (f.moving ? 1 : 0.15);
  ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir, 1);
  // legs
  ctx.strokeStyle = white ? '#fff' : '#2e1065'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const lx = -5 + i * 5, sw = Math.sin(step + i * 2.1) * 1.6;
    ctx.beginPath(); ctx.moveTo(lx, -4); ctx.lineTo(lx + 2 + sw, -2.5); ctx.lineTo(lx + 1 + sw, 0); ctx.stroke();
  }
  // shell
  const g = ctx.createLinearGradient(0, -12, 0, -2);
  g.addColorStop(0, white ? '#fff' : e ? ELITE.shell[1] : '#a855f7'); g.addColorStop(1, white ? '#fde4ff' : e ? ELITE.shell[0] : '#4c1d95');
  ctx.fillStyle = 'rgba(8,6,20,.6)'; ctx.beginPath(); ctx.ellipse(0, -5.5, 10.6, 7.2, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -5.5, 9.8, 6.5, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = white ? '#fff' : e ? '#450a0a' : '#3b0764'; ctx.fillRect(-9.8, -5.8, 19.6, 2.2);
  ctx.strokeStyle = white ? '#fff' : e ? '#fca5a5' : '#d8b4fe'; ctx.lineWidth = 0.7;
  for (const sx of [-4, 0.5, 5]) { ctx.beginPath(); ctx.moveTo(sx, -11.2 + Math.abs(sx) * 0.25); ctx.quadraticCurveTo(sx + 1.2, -8, sx + 0.6, -5.8); ctx.stroke(); }
  // head + eyes + mandibles
  ctx.fillStyle = white ? '#fff' : '#1e1b4b'; ctx.beginPath(); ctx.ellipse(9, -4.6, 3.4, 2.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = white ? '#fff' : e ? ELITE.eye : '#86efac';
  ctx.beginPath(); ctx.arc(10.2, -5.6, 0.9, 0, TAU); ctx.arc(8.4, -5.9, 0.75, 0, TAU); ctx.fill();
  ctx.strokeStyle = white ? '#fff' : '#1e1b4b'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(11.6, -3.6); ctx.lineTo(13.2, -2.4 + Math.sin(t * 9) * 0.5); ctx.stroke();
  ctx.restore();
}

/** Spore Toad: round hopper with one big slit eye. */
export function drawHopper(ctx, f, t, white) {
  const e = f.elite, sq = f.ground ? 1 - (f.crouch > 0 ? 0.2 * f.crouch : 0.05 * Math.max(0, Math.sin(t * 3 + f.phase * 6))) : 1.12;
  ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir * (1.5 - sq * 0.5), sq);
  // feet
  ctx.fillStyle = white ? '#fff' : '#7c2d12';
  ctx.beginPath(); ctx.ellipse(-4.5, -1.2, 3.2, 1.4, 0, 0, TAU); ctx.ellipse(4.5, -1.2, 3.2, 1.4, 0, 0, TAU); ctx.fill();
  // body
  ctx.fillStyle = 'rgba(20,6,4,.55)'; ctx.beginPath(); ctx.ellipse(0, -8, 9.8, 8.3, 0, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(-2, -11, 1, 0, -8, 9.5);
  g.addColorStop(0, white ? '#fff' : e ? '#fca5a5' : '#fdba74'); g.addColorStop(1, white ? '#ffe4e6' : e ? '#991b1b' : '#c2410c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -8, 9, 7.6, 0, 0, TAU); ctx.fill();
  // spots
  ctx.fillStyle = white ? '#fff' : 'rgba(124,45,18,.55)';
  for (const [sx, sy, r] of [[-5, -10, 1.4], [-2, -13.5, 1.0], [-6.5, -6, 0.9]]) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); }
  // eye
  ctx.fillStyle = white ? '#fff' : '#fefce8'; ctx.beginPath(); ctx.ellipse(3.2, -9.5, 3.6, 3.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = white ? '#fff' : e ? '#dc2626' : '#16a34a'; ctx.beginPath(); ctx.ellipse(4.0, -9.5, 2.2, 2.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#052e16'; ctx.beginPath(); ctx.ellipse(4.3, -9.5, 0.55, 1.9, 0, 0, TAU); ctx.fill();
  // mouth
  ctx.strokeStyle = white ? '#fff' : '#431407'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(2.5, -4.2); ctx.quadraticCurveTo(5.5, -3.2, 7.8, -5.2); ctx.stroke();
  ctx.restore();
}

/** Void Wisp: a glowing space jellyfish with trailing tendrils. */
export function drawWisp(ctx, f, t, white, glow) {
  const e = f.elite, cx = f.x, cy = f.y - 8, pulse = 0.5 + 0.5 * Math.sin(t * 4 + f.phase * 6);
  if (glow) { ctx.globalAlpha = 0.55 + 0.25 * pulse; ctx.drawImage(glow, cx - 18, cy - 18, 36, 36); ctx.globalAlpha = 1; }
  // tendrils
  ctx.strokeStyle = white ? '#fff' : e ? 'rgba(252,165,165,.8)' : 'rgba(165,243,252,.75)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(cx + i * 2.2, cy + 3);
    for (let k = 1; k <= 4; k++) ctx.lineTo(cx + i * 2.2 + Math.sin(t * 5 + k * 0.9 + i) * 1.6, cy + 3 + k * 2.4);
    ctx.stroke();
  }
  // bell
  const g = ctx.createRadialGradient(cx - 1.5, cy - 3, 0.5, cx, cy, 8.5);
  g.addColorStop(0, white ? '#fff' : '#ecfeff'); g.addColorStop(0.5, white ? '#fff' : e ? 'rgba(248,113,113,.85)' : 'rgba(34,211,238,.8)'); g.addColorStop(1, white ? '#fff' : e ? 'rgba(127,29,29,.6)' : 'rgba(14,116,144,.55)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, 7.6, 6.4, 0, Math.PI, 0); ctx.quadraticCurveTo(cx + 4, cy + 4.2, cx, cy + 2.6); ctx.quadraticCurveTo(cx - 4, cy + 4.2, cx - 7.6, cy); ctx.fill();
  // core + eyes
  ctx.fillStyle = white ? '#fff' : `rgba(255,255,255,${0.55 + 0.4 * pulse})`; ctx.beginPath(); ctx.arc(cx, cy - 1.6, 2.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#083344'; ctx.beginPath(); ctx.arc(cx + f.dir * 2.4 - 1, cy - 0.6, 0.75, 0, TAU); ctx.arc(cx + f.dir * 2.4 + 1.2, cy - 0.6, 0.75, 0, TAU); ctx.fill();
}

/** Acid Pod: a fleshy alien plant fixed to a floor, ceiling or wall; opens to spit. */
export function drawSpitter(ctx, f, t, white) {
  const e = f.elite, open = f.tele > 0 ? 1 - f.tele / f.teleMax : Math.max(0, 0.15 * Math.sin(t * 2 + f.phase * 6));
  const rot = { floor: 0, ceil: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[f.mount] || 0;
  const [ax, ay] = f.anchor;           // where the pod is rooted (on the surface)
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(rot);
  // roots
  ctx.strokeStyle = white ? '#fff' : '#14532d'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 5, -1, s * 8, 0.5); ctx.stroke(); }
  // stalk + bulb
  ctx.fillStyle = white ? '#fff' : '#166534'; ctx.fillRect(-2, -6, 4, 6);
  const swell = 1 + 0.12 * open;
  ctx.fillStyle = 'rgba(3,20,8,.6)'; ctx.beginPath(); ctx.ellipse(0, -11, 8.4 * swell, 7.4 * swell, 0, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(-2, -14, 1, 0, -11, 8);
  g.addColorStop(0, white ? '#fff' : e ? '#fecaca' : '#bef264'); g.addColorStop(1, white ? '#fff' : e ? '#b91c1c' : '#3f6212');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -11, 7.6 * swell, 6.7 * swell, 0, 0, TAU); ctx.fill();
  // mouth (opens while it charges), acid glow inside
  ctx.fillStyle = white ? '#fff' : '#1a2e05'; ctx.beginPath(); ctx.ellipse(0, -15.2, 3.6, 0.6 + 2.6 * open, 0, 0, TAU); ctx.fill();
  if (open > 0.2 && !white) { ctx.fillStyle = `rgba(190,242,100,${open})`; ctx.beginPath(); ctx.arc(0, -15.2, 1.6 * open + 0.4, 0, TAU); ctx.fill(); }
  ctx.fillStyle = white ? '#fff' : e ? '#fde047' : '#ecfccb';
  ctx.beginPath(); ctx.arc(-3.6, -10, 0.9, 0, TAU); ctx.arc(3.6, -10, 0.9, 0, TAU); ctx.fill();
  ctx.restore();
}

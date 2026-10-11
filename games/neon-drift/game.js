// ─────────────────────────────────────────────────────────────
//  NEON DRIFT 3D — game 21 (Zone 4 · Ultra)
//  A top-down arcade circuit racer seen from high above at an angle, in the
//  spirit of the old overhead racers but in real 3D: a perspective camera
//  follows your car round a neon circuit, the cars are lit 3D models
//  (assets/js/car-models.js, shared with Turbo Rush 3D) and the walls,
//  gantry and signs stand up off the track.
//
//  Three laps against three rivals. Hold a turn at speed and the tail steps
//  out: that's a DRIFT. Drift points bank when you straighten up, and every
//  drift you chain inside the combo window raises the multiplier. Touch a wall
//  and the drift is lost. Overtakes, laps and your finishing place score too.
//
//    L1 top 3 to qualify   L2 oil slicks   L3 top 2   L4 ⚡ boost pads
//    L7+ only a win counts  L8, L14, L20 black ice (less grip)
//  Every 5th level: ★ NEON COIN RUSH — no rivals, grab the coins.
//  Each race track is built from the seeded RNG, so the Daily Challenge
//  circuit is the same for everyone.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { SPORTS, drawCar, palette } from '../../assets/js/car-models.js';

const ID = 'neon-drift';
const W = 480, H = 720;
const TILT = 0.95, CT = Math.cos(TILT), ST = Math.sin(TILT);   // camera looks down ~54°
const FOCAL = 1040, AY = H * 0.54;                              // the follow point sits a little below the middle
const STEP = 24;                     // track sample spacing (world units)
const RUNOFF = 34;                   // run-off strip between the track edge and the wall
const WALL_H = 16;
const CAR_U = 15;                    // world units per car-model unit (car ≈ 30 wide, 58 long)
const CAR_R = 22;                    // collision radius
const CAR_HALF = SPORTS.len * CAR_U / 2;
const LAPS = 3;
const PLACES = ['1st', '2nd', '3rd', '4th'];
const TAU = Math.PI * 2;
const wrapA = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const need = (l) => (l <= 2 ? 3 : l <= 6 ? 2 : 1);
const isIce = (l) => l >= 8 && l % 6 === 2;
const needText = (l) => (need(l) === 1 ? 'Win the race.' : `Top ${need(l)} to qualify.`);

const RIVALS = [
  { name: 'VOLT',  paint: '#22d3ee', stripe: '#0e7490', glow: '#22d3ee' },
  { name: 'TOXIN', paint: '#a3e635', stripe: '#365314', glow: '#a3e635' },
  { name: 'NOVA',  paint: '#a78bfa', stripe: '#4c1d95', glow: '#c084fc' },
];
const THEMES = {
  synth: { bg: ['#0a0418', '#1a0b33'], grid: '#7c3aed', road: '#1c1733', road2: '#221c3e', runoff: '#120a24', edge: '#22d3ee', kerb: ['#f472b6', '#f8fafc'], wall: '#f472b6', face: '#2a1440', sign: ['#22d3ee', '#f472b6', '#fde047'] },
  toxic: { bg: ['#020f08', '#0b2414'], grid: '#16a34a', road: '#15201b', road2: '#1a2721', runoff: '#0a150f', edge: '#a3e635', kerb: ['#a855f7', '#ecfccb'], wall: '#a855f7', face: '#1d1430', sign: ['#a3e635', '#c084fc', '#22d3ee'] },
  ember: { bg: ['#120603', '#2a0f05'], grid: '#c2410c', road: '#211a20', road2: '#281f26', runoff: '#170e10', edge: '#fb923c', kerb: ['#38bdf8', '#fff7ed'], wall: '#38bdf8', face: '#0f2030', sign: ['#fb923c', '#38bdf8', '#fde047'] },
  ice:   { bg: ['#020a16', '#0b1f33'], grid: '#0284c7', road: '#1b2638', road2: '#22304a', runoff: '#0f1828', edge: '#e0f2fe', kerb: ['#38bdf8', '#ffffff'], wall: '#7dd3fc', face: '#12263a', sign: ['#7dd3fc', '#e0f2fe', '#f0abfc'] },
  gold:  { bg: ['#120a02', '#2b1a05'], grid: '#ca8a04', road: '#2a2112', road2: '#322716', runoff: '#1a1208', edge: '#fde047', kerb: ['#fbbf24', '#fff7ed'], wall: '#fbbf24', face: '#33240a', sign: ['#fde047', '#fbbf24', '#fff7ed'] },
};
const SIGNS = ['NEON', 'DRIFT', 'TC', 'ULTRA', 'TURBO', 'GO!', 'ZONE 4', 'FULL SEND'];

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 3.2,
  comboStep: 1,
  maxMultiplier: 6,
  bonusTime: 25,
  detail: true,
  music: { bpm: 140, style: 'chase', lead: 'sawtooth', arp: [0, 2, 4, 2, 1, 3, 4, 3], oct: [12, 12, 24, 12, 12, 12, 24, 12], bass: 'drive' },
  levelInfo: (l, b) => b ? 'NEON COIN RUSH — no rivals. Drift between the coins!'
    : l === 1 ? 'Finish in the top 3. Hold a turn at full speed to DRIFT — chain drifts for a big combo!'
    : l === 2 ? 'Oil slicks! Hit one and you spin out. Top 3 to qualify.'
    : l === 3 ? 'Tighter track — only the top 2 qualify now.'
    : l === 4 ? 'Hit the ⚡ boost pads. Rivals are getting faster. Top 2.'
    : l === 7 ? 'From here on, ONLY A WIN COUNTS.'
    : isIce(l) ? `BLACK ICE — less grip everywhere! ${needText(l)}`
    : `Faster rivals, tighter turns. ${needText(l)}`,
  create: (shell) => new NeonDrift(shell),
});

// ── Track building ─────────────────────────────────────────────
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleTrack(ctrl, halfW) {
  const n = ctrl.length, dense = [];
  for (let i = 0; i < n; i++) {
    const a = ctrl[(i - 1 + n) % n], b = ctrl[i], c = ctrl[(i + 1) % n], d = ctrl[(i + 2) % n];
    for (let j = 0; j < 40; j++) { const t = j / 40; dense.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)]); }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) { const p = dense[i - 1], q = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const total = cum[dense.length], N = Math.round(total / STEP), step = total / N;
  const x = new Float32Array(N), z = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), p = dense[j], q = dense[(j + 1) % dense.length];
    x[i] = p[0] + (q[0] - p[0]) * f; z[i] = p[1] + (q[1] - p[1]) * f;
  }
  return finishTrack(x, z, step, halfW);
}
function finishTrack(x, z, step, halfW) {
  const N = x.length;
  const tx = new Float32Array(N), tz = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N), ang = new Float32Array(N), k = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = x[b] - x[a], dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz; nx[i] = dz; nz[i] = -dx; ang[i] = Math.atan2(dx, dz);
  }
  for (let i = 0; i < N; i++) k[i] = wrapA(ang[(i + 1) % N] - ang[(i - 1 + N) % N]) / (2 * step);
  return { N, step, L: N * step, x, z, tx, tz, nx, nz, ang, k, halfW };
}
function validTrack(T) {
  const reach = T.halfW + RUNOFF + 12;
  for (let i = 0; i < T.N; i++) if (Math.abs(T.k[i]) * reach > 0.9) return false;
  const sep = 2 * (T.halfW + RUNOFF) + 50, G = Math.ceil(1.7 * sep / T.step);
  for (let i = 0; i < T.N; i += 2) for (let j = i + G; j < T.N; j += 2) {
    if (T.N - (j - i) < G) continue;
    const dx = T.x[i] - T.x[j], dz = T.z[i] - T.z[j];
    if (dx * dx + dz * dz < sep * sep) return false;
  }
  return true;
}
/** rotate a track so that sample 0 sits in the middle of its straightest stretch (the start/finish line) */
function rotateToStraight(T) {
  let best = 0, bestS = 1e9;
  for (let i = 0; i < T.N; i++) { let s = 0; for (let d = -10; d <= 6; d++) s += Math.abs(T.k[(i + d + T.N) % T.N]); if (s < bestS) { bestS = s; best = i; } }
  const x = new Float32Array(T.N), z = new Float32Array(T.N);
  for (let i = 0; i < T.N; i++) { x[i] = T.x[(i + best) % T.N]; z[i] = T.z[(i + best) % T.N]; }
  return finishTrack(x, z, T.step, T.halfW);
}
function buildTrack(rng, level, bonus) {
  const halfW = bonus ? 126 : Math.max(90, 124 - level * 2.4);
  const n = bonus ? 9 : 8 + Math.min(7, Math.floor(level / 2));
  let vari = bonus ? 0.16 : Math.min(0.42, 0.2 + level * 0.018);
  for (let tries = 0; tries < 40; tries++) {
    const R = 980 + n * 32, ctrl = [];
    for (let i = 0; i < n; i++) {
      const a = (i + rng.range(-0.28, 0.28)) / n * TAU, r = R * (1 + rng.range(-vari, vari));
      ctrl.push([Math.cos(a) * r, Math.sin(a) * r * 1.12]);
    }
    if (rng.chance(0.5)) ctrl.reverse();
    const T = sampleTrack(ctrl, halfW);
    if (validTrack(T)) return rotateToStraight(T);
    vari *= 0.9;
  }
  const ctrl = Array.from({ length: 10 }, (_, i) => [Math.cos(i / 10 * TAU) * 1200, Math.sin(i / 10 * TAU) * 900]);
  return rotateToStraight(sampleTrack(ctrl, halfW));
}
/** position on the track at distance d with a sideways offset: [x, z, heading, curvature, nx, nz] */
function at(T, d, off = 0) {
  const dd = ((d % T.L) + T.L) % T.L, fi = dd / T.step, i = Math.floor(fi) % T.N, j = (i + 1) % T.N, f = fi - Math.floor(fi);
  const nx = T.nx[i] + (T.nx[j] - T.nx[i]) * f, nz = T.nz[i] + (T.nz[j] - T.nz[i]) * f;
  return [T.x[i] + (T.x[j] - T.x[i]) * f + nx * off, T.z[i] + (T.z[j] - T.z[i]) * f + nz * off, T.ang[i] + wrapA(T.ang[j] - T.ang[i]) * f, T.k[i], nx, nz];
}

// ── Camera (fixed north-up, follows the car) ──────────────────
const cam = { x: 0, z: 0, d: 1000 };
function P(x, y, z) {
  const rx = x - cam.x, rz = z - cam.z, dep = -y * ST + rz * CT + cam.d, k = FOCAL / dep;
  return [W / 2 + rx * k, AY - (y * CT + rz * ST) * k, k, dep];
}
function ground(sx, sy) {
  const a = (sx - W / 2) / FOCAL, b = (AY - sy) / FOCAL, rz = b * cam.d / (ST - b * CT), dep = rz * CT + cam.d;
  return [cam.x + a * dep, cam.z + rz];
}

function glowDot(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
function hexA(h, a) { return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`; }

class NeonDrift {
  constructor(s) {
    this.s = s; this.t = 0; this.touch = 0;
    this.startLevel(1, false);
  }

  // ── Level setup ─────────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.T = buildTrack(r, level, bonus);
    this.theme = bonus ? THEMES.gold : isIce(level) ? THEMES.ice : [THEMES.synth, THEMES.toxic, THEMES.ember][(level - 1) % 3];
    this.grip = isIce(level) ? 0.62 : 1;
    this.sc = Math.min(1.22, s.speed(0.022));
    this.maxV = 600 * this.sc;
    const T = this.T, hw = T.halfW;
    const straight = (i) => { let m = 0; for (let d = -3; d <= 3; d++) m = Math.max(m, Math.abs(T.k[(i + d + T.N) % T.N])); return m < 0.0016; };
    const pick = (lo, hi, test) => { for (let k = 0; k < 60; k++) { const i = r.int(Math.floor(T.N * lo), Math.floor(T.N * hi)); if (!test || test(i)) return i; } return r.int(Math.floor(T.N * lo), Math.floor(T.N * hi)); };
    // ⚡ boost pads on straights
    this.boosts = [];
    const nb = bonus ? 3 : level >= 4 ? 2 + (level >= 9 ? 1 : 0) : 0;
    for (let i = 0; i < nb; i++) this.boosts.push({ d: pick(0.1 + i / nb * 0.85, 0.1 + (i + 1) / nb * 0.85, straight) * T.step, off: r.range(-0.4, 0.4) * hw, cool: 0 });
    // oil slicks
    this.oils = [];
    const no = bonus ? 0 : level >= 2 ? Math.min(8, 2 + Math.floor(level / 2)) : 0;
    for (let i = 0; i < no; i++) this.oils.push({ d: pick(0.12, 0.95) * T.step, off: r.range(-0.6, 0.6) * hw, r: 30, blobs: [[0, 0, 1], [r.range(-14, 14), r.range(-12, 12), 0.7], [r.range(-16, 16), r.range(-14, 14), 0.55]] });
    // coins
    this.coins = [];
    if (bonus) {
      for (let d = 260; d < T.L - 120; d += 300) for (let c = 0; c < 5; c++) { const dd = d + c * 42; this.coins.push({ d: dd, off: Math.sin(dd / 260) * 0.55 * hw, got: false }); }
    } else {
      for (let l = 0; l < 3; l++) { const d0 = pick(0.15 + l * 0.27, 0.35 + l * 0.27) * T.step, ph = r.range(0, TAU); for (let c = 0; c < 5; c++) this.coins.push({ d: d0 + c * 44, off: Math.sin(ph + c * 0.7) * 0.5 * hw, got: false }); }
    }
    // roadside neon signs (cosmetic)
    this.signs = [];
    for (let d = 300, n = 0; d < T.L - 200; d += 560, n++) {
      const side = n % 2 ? 1 : -1, [x, z, , , nx, nz] = at(T, d, side * (hw + RUNOFF + 74));
      let clear = true;
      for (let i = 0; i < T.N && clear; i++) { const dx = x - T.x[i], dz = z - T.z[i]; if (dx * dx + dz * dz < (hw + RUNOFF + 46) ** 2) clear = false; }
      if (!clear) continue;
      this.signs.push({ x, z, tx: -nz, tz: nx, text: SIGNS[(n + level) % SIGNS.length], col: this.theme.sign[n % 3] });
    }
    this.buildMinimap();
    this.resetRace();
  }

  resetRace() {
    const T = this.T, hw = T.halfW;
    this.timers = []; this.skids = []; this.smoke = []; this.result = null;
    this.count = this.bonus ? 0 : 2.1; this.lastCount = 4;
    this.raceT = 0; this.finishedRivals = 0;
    const p0 = -110, [x, z, h] = at(T, p0, 0.38 * hw);
    this.p = { x, z, h, vx: 0, vz: 0, steer: 0, slide: 0, spinT: 0, spinDir: 1, boostT: 0, idx: ((Math.round(p0 / T.step) % T.N) + T.N) % T.N,
      acc: Math.round(p0 / T.step), prog: p0, lapDone: 0, wallHits: 0, drift: 0, driftT: 0, calmT: 0, offroad: false, finished: false, place: 0,
      passed: new Set(), wrongT: 0, lastProg: p0, squeal: 0, bumpT: 0, brake: false };
    this.rivals = this.bonus ? [] : RIVALS.map((R, i) => {
      const d = i < 2 ? -40 : -110, off = (i === 0 ? -0.38 : i === 1 ? 0.38 : -0.38) * hw;
      const [rx, rz, rh] = at(T, d, off);
      return { ...R, i, d, off, offT: off, v: 0, x: rx, z: rz, h: rh, slip: 0, spinT: 0, boostT: 0, finished: false, retarget: 1 + i * 0.4,
        vmax: this.maxV * (0.82 + 0.025 * i + Math.min(0.07, (this.level - 1) * 0.006)), ahead: true };
    });
    for (const o of this.oils) o.hit = 0;
    for (const b of this.boosts) b.cool = 0;
    for (const c of this.coins) c.got = false;
    this.coinsGot = 0;
    cam.x = x; cam.z = z; cam.d = 1000;
  }

  buildMinimap() {
    const T = this.T, S = 104, pad = 8;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.x[i]); x1 = Math.max(x1, T.x[i]); z0 = Math.min(z0, T.z[i]); z1 = Math.max(z1, T.z[i]); }
    const sc = (S - pad * 2) / Math.max(x1 - x0, z1 - z0);
    this.mm = { S, f: (x, z) => [pad + (x - x0) * sc + ((S - pad * 2) - (x1 - x0) * sc) / 2, S - pad - (z - z0) * sc - ((S - pad * 2) - (z1 - z0) * sc) / 2] };
    const cv = document.createElement('canvas'); cv.width = cv.height = S * 2;
    const g = cv.getContext('2d'); g.scale(2, 2);
    g.fillStyle = 'rgba(5,3,15,0.72)'; roundRect(g, 0, 0, S, S, 12); g.fill();
    g.strokeStyle = hexA(this.theme.edge, 0.35); g.lineWidth = 7; g.lineJoin = 'round';
    g.beginPath(); for (let i = 0; i <= T.N; i++) { const [mx, my] = this.mm.f(T.x[i % T.N], T.z[i % T.N]); i ? g.lineTo(mx, my) : g.moveTo(mx, my); } g.stroke();
    g.strokeStyle = this.theme.edge; g.lineWidth = 2; g.stroke();
    const [sx, sy] = this.mm.f(T.x[0], T.z[0]); g.fillStyle = '#fff'; g.fillRect(sx - 3, sy - 3, 6, 6);
    this.mmCanvas = cv;
  }

  // ── Input ───────────────────────────────────────────────────
  onAction(a, x) {
    if (a === 'press') this.touch = x < W / 2 ? -1 : 1;
    else if (a === 'release') this.touch = 0;
  }
  onPointerMove(x, y, down) { if (down) this.touch = x < W / 2 ? -1 : 1; }
  onLifeLost() { this.resetRace(); }

  after(t, fn) { this.timers.push({ t, fn }); }

  // ── Simulation ──────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); if (this.s.state !== 'playing') return; } }
    this.timers = this.timers.filter((tm) => !tm.done);
    if (this.count > 0) {
      const before = Math.ceil(this.count / 0.7);
      this.count -= dt;
      const now = Math.ceil(this.count / 0.7);
      if (this.count <= 0) { this.s.sound.play('go'); this.s.fx.text(W / 2, H * 0.36, 'GO!', { color: this.theme.edge, size: 64, life: 0.8 }); }
      else if (now !== before) this.s.sound.play('tick');
      this.updateCamera(dt);
      return;
    }
    this.raceT += dt;
    this.updatePlayer(dt);
    for (const rv of this.rivals) this.updateRival(rv, dt);
    this.collide(dt);
    this.objects(dt);
    this.raceLogic();
    this.particles(dt);
    this.updateCamera(dt);
  }

  idle(dt) {
    this.t += dt;
    const st = this.s.state;
    if (st === 'title' || st === 'clear' || st === 'over') {
      // attract mode / victory lap: everyone keeps driving on autopilot
      if (this.count > 0 && st === 'title') this.count = 0;
      if (st !== 'title') this.updatePlayer(dt, true);
      for (const rv of this.rivals) this.updateRival(rv, dt, true);
      this.particles(dt);
      if (st === 'title' && this.rivals.length) { const rv = this.rivals[2]; this.follow(rv.x, rv.z, Math.sin(rv.h) * rv.v, Math.cos(rv.h) * rv.v, dt); }
      else this.updateCamera(dt);
    }
  }

  steerInput() {
    const i = this.s.input;
    return clamp((i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0) + this.touch, -1, 1);
  }

  updatePlayer(dt, auto = false) {
    const p = this.p, T = this.T, s = this.s;
    let steerIn = 0, hand = false;
    if (auto || p.finished) {
      const [ax, az] = at(T, p.prog + 140, 0);
      steerIn = clamp(wrapA(Math.atan2(ax - p.x, az - p.z) - p.h) * 3, -1, 1);
    } else {
      steerIn = this.steerInput();
      hand = s.input.isDown('down') || s.input.isDown('action');
    }
    p.brake = hand;
    p.steer += (steerIn - p.steer) * Math.min(1, dt * 11);
    const fx = Math.sin(p.h), fz = Math.cos(p.h), rx = fz, rz = -fx;
    let vf = p.vx * fx + p.vz * fz, vr = p.vx * rx + p.vz * rz;
    const maxV = this.maxV * (p.offroad ? 0.5 : 1) * (p.boostT > 0 ? 1.32 : 1);
    if (vf < maxV) vf += 520 * this.sc * dt * (1 - Math.max(0, vf) / maxV * 0.6);
    else vf -= (vf - maxV) * (p.offroad ? 3 : 1.4) * dt;
    if (hand) vf -= 240 * dt;
    // steering + the slide that turns into a drift
    const sf = clamp(vf / 220, -1, 1);
    const wantSlide = (Math.abs(p.steer) > 0.6 && vf > maxV * 0.5) || (hand && vf > 200);
    p.slide = clamp(p.slide + (wantSlide ? 3.6 : -2.6) * dt, 0, 1);
    if (p.spinT > 0) {
      p.spinT -= dt;
      p.h += p.spinDir * 9 * dt * Math.min(1, p.spinT / 0.5 + 0.2);
      vr *= Math.exp(-0.7 * dt);
    } else {
      p.h += p.steer * 2.5 * (1 + p.slide * 0.58) * sf * dt;
      const grip = (10 + (1.5 - 10) * p.slide) * this.grip;
      vr *= Math.exp(-grip * dt);
    }
    vf -= Math.abs(vr) * 0.3 * dt;
    const nfx = Math.sin(p.h), nfz = Math.cos(p.h);
    // keep velocity in world space: rebuild from the old frame, the new heading picks up the slip next step
    p.vx = fx * vf + rx * vr; p.vz = fz * vf + rz * vr;
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.boostT > 0) p.boostT -= dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    // where are we on the track?
    let bi = p.idx, bd = 1e12;
    for (let o = -10; o <= 10; o++) { const i = (p.idx + o + T.N) % T.N, dx = p.x - T.x[i], dz = p.z - T.z[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bi = i; } }
    if (bd > 260 * 260) for (let i = 0; i < T.N; i++) { const dx = p.x - T.x[i], dz = p.z - T.z[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bi = i; } }
    let dI = bi - p.idx; if (dI > T.N / 2) dI -= T.N; if (dI < -T.N / 2) dI += T.N;
    p.acc += dI; p.idx = bi;
    const lat = (p.x - T.x[bi]) * T.nx[bi] + (p.z - T.z[bi]) * T.nz[bi];
    p.prog = p.acc * T.step + (p.x - T.x[bi]) * T.tx[bi] + (p.z - T.z[bi]) * T.tz[bi];
    p.offroad = Math.abs(lat) > T.halfW;
    // the wall
    const lim = T.halfW + RUNOFF - CAR_R * 0.7;
    if (Math.abs(lat) > lim) {
      const sg = Math.sign(lat), push = Math.abs(lat) - lim, nx = T.nx[bi] * sg, nz = T.nz[bi] * sg;
      p.x -= nx * push; p.z -= nz * push;
      const vn = p.vx * nx + p.vz * nz;
      if (vn > 0) {
        p.vx -= nx * vn * 1.35; p.vz -= nz * vn * 1.35;
        const k = vn > 120 ? 0.8 : 0.93; p.vx *= k; p.vz *= k;
        if (vn > 60 && !auto && !p.finished) {
          const [sx, sy] = P(p.x + nx * CAR_R, 8, p.z + nz * CAR_R);
          s.fx.burst(sx, sy, { color: this.theme.wall, count: Math.min(24, vn / 12 | 0), speed: 220 });
          s.sound.play(vn > 200 ? 'hit' : 'metal');
          if (vn > 150) s.fx.shake(Math.min(8, vn / 50), 0.2);
          p.wallHits++;
          if (p.drift > 0 && p.driftT > 0.25) { s.fx.text(sx, sy - 30, 'DRIFT LOST', { color: '#fb7185', size: 20 }); s.resetCombo(); }
          p.drift = 0; p.driftT = 0;
        }
      }
    }
    // drifting
    if (auto) return;
    const spd = Math.hypot(p.vx, p.vz), slip = Math.atan2(p.vx * Math.cos(p.h) - p.vz * Math.sin(p.h), p.vx * nfx + p.vz * nfz);
    p.slip = slip;
    const drifting = p.spinT <= 0 && !p.offroad && spd > 220 && Math.abs(slip) > 0.15;
    if (drifting) {
      p.drift += Math.abs(slip) * spd * dt * 0.06 * (p.boostT > 0 ? 1.5 : 1);
      p.driftT += dt; p.calmT = 0;
      if (p.driftT > 3) s.unlock('drift3s');
      p.squeal -= dt;
      if (p.squeal <= 0 && !s.sound.muted) { p.squeal = 0.1; s.sound.noise({ dur: 0.12, vol: 0.035 + Math.min(0.05, Math.abs(slip) * 0.08), freq: 2300 + Math.abs(slip) * 1600, type: 'bandpass' }); }
      this.tyreMarks(p, s.gold ? '#fde047' : '#ff4fa3', true);
    } else if (p.drift > 0) {
      p.calmT += dt;
      if (p.calmT > 0.3) this.bankDrift();
    }
    if (p.offroad && spd > 150 && Math.random() < dt * 30) this.puff(p.x, p.z, '#5b4a7a', 0.6);
  }

  bankDrift() {
    const p = this.p, s = this.s;
    if (p.driftT >= 0.45 && p.drift >= 3) {
      const pts = Math.round(p.drift) * 10 * (1 + (this.level - 1) * 0.1) | 0;
      const [sx, sy] = P(p.x, 30, p.z);
      s.award(pts, sx, sy - 40, { chain: true, color: '#ff4fa3' });
      s.sound.play('combo', Math.min(6, s.comboCount));
      if (p.driftT > 1.6) s.fx.text(sx, sy - 74, p.driftT > 2.6 ? 'MEGA DRIFT!' : 'GREAT DRIFT!', { color: '#fde047', size: 22 });
      if (p.driftT >= 0.8 && !p.offroad) {           // a good drift fires you out of the bend
        p.boostT = Math.max(p.boostT, Math.min(1.1, p.driftT * 0.4));
        s.fx.text(sx, sy - 100, 'DRIFT BOOST', { color: '#67e8f9', size: 16 });
      }
    }
    p.drift = 0; p.driftT = 0; p.calmT = 0;
  }

  tyreMarks(car, col, player) {
    if (this.s.lowDetail && !player) return;
    const fx = Math.sin(car.h), fz = Math.cos(car.h), rx = fz, rz = -fx;
    const pts = [[-0.9, 0.82], [0.9, 0.82]].map(([w, l]) => [car.x + rx * w * CAR_U - fx * (CAR_HALF - l * CAR_U), car.z + rz * w * CAR_U - fz * (CAR_HALF - l * CAR_U)]);
    if (car.lastMarks && this.t - car.lastMarkT < 0.06) {
      for (let i = 0; i < 2; i++) this.skids.push({ x1: car.lastMarks[i][0], z1: car.lastMarks[i][1], x2: pts[i][0], z2: pts[i][1], t: this.t, c: col });
      if (this.skids.length > (this.s.lowDetail ? 300 : 800)) this.skids.splice(0, 40);
    }
    car.lastMarks = pts; car.lastMarkT = this.t;
    if (Math.random() < (this.s.lowDetail ? 0.15 : 0.45)) this.puff(pts[Math.random() < 0.5 ? 0 : 1][0], pts[0][1], '#d8d4ff', 1);
  }
  puff(x, z, c, a) {
    if (this.smoke.length > (this.s.lowDetail ? 40 : 110)) return;
    this.smoke.push({ x, y: 4, z, vx: (Math.random() - 0.5) * 30, vy: 18 + Math.random() * 20, vz: (Math.random() - 0.5) * 30, life: 0, max: 0.7 + Math.random() * 0.5, r: 8 + Math.random() * 6, c, a });
  }

  updateRival(rv, dt, auto = false) {
    const T = this.T, p = this.p;
    if (rv.spinT > 0) rv.spinT -= dt;
    if (rv.boostT > 0) rv.boostT -= dt;
    // corner speed from the sharpest bend coming up
    let kk = 0, kSign = 0;
    for (let o = 1; o <= 9; o++) { const i = ((Math.floor(rv.d / T.step) + o) % T.N + T.N) % T.N, a = Math.abs(T.k[i]); if (a > kk) { kk = a; kSign = Math.sign(T.k[i]); } }
    const LAT = 1180 * this.sc * this.sc;
    let rb = 1;
    if (!auto && !this.bonus) { const gap = p.prog - rv.d; rb = gap > 400 ? 1 + Math.min(0.07, (gap - 400) / 9000) : gap < -500 ? 1 - Math.min(0.06, (-gap - 500) / 9000) : 1; }
    let target = Math.min(rv.vmax * rb * (rv.boostT > 0 ? 1.25 : 1), Math.sqrt(LAT / Math.max(kk, 1e-4)));
    if (rv.finished) target = Math.min(target, this.maxV * 0.6);
    if (rv.spinT > 0) target = 120;
    rv.v += clamp(target - rv.v, -720 * dt, 380 * this.sc * dt);
    // racing line: drift to the inside of bends, wander on straights, keep out of the player's way
    rv.retarget -= dt;
    const hw = this.T.halfW;
    if (rv.retarget <= 0) { rv.retarget = 1.2 + ((rv.i * 7 + Math.floor(rv.d)) % 13) / 10; rv.wander = (((rv.i * 37 + Math.floor(rv.d / 50)) % 11) / 10 - 0.5) * 0.8; }
    let offT = kk > 0.0022 ? -kSign * 0.5 * hw : (rv.wander || 0) * hw;
    if (!auto) {
      const ahead = p.prog - rv.d;
      if (ahead > 0 && ahead < 110) { const [, , , , nx, nz] = at(T, rv.d); const pl = (p.x - rv.x) * nx + (p.z - rv.z) * nz; if (Math.abs(pl) < 50) offT = clamp(rv.off + (pl > 0 ? -70 : 70), -0.7 * hw, 0.7 * hw); }
    }
    rv.offT = offT;
    rv.off += clamp(rv.offT - rv.off, -70 * dt, 70 * dt);
    rv.d += rv.v * dt;
    const [x, z, h, k] = at(T, rv.d, rv.off);
    const slipT = rv.spinT > 0 ? rv.slip + 8 * dt : clamp(k * rv.v * 0.11, -0.5, 0.5);
    rv.slip += (slipT - rv.slip) * Math.min(1, dt * (rv.spinT > 0 ? 20 : 5));
    rv.x = x; rv.z = z; rv.h = h + rv.slip;
    if (Math.abs(rv.slip) > 0.2 && rv.v > 250) this.tyreMarks(rv, rv.glow, false);
  }

  collide(dt) {
    const p = this.p, s = this.s, T = this.T;
    for (const rv of this.rivals) {
      const dx = p.x - rv.x, dz = p.z - rv.z, d = Math.hypot(dx, dz);
      if (d < CAR_R * 2 && d > 0.01) {
        const nx = dx / d, nz = dz / d, over = CAR_R * 2 - d;
        p.x += nx * over * 0.6; p.z += nz * over * 0.6;
        const [, , , , tnx, tnz] = at(T, rv.d);
        rv.off = clamp(rv.off - (nx * tnx + nz * tnz) * over * 0.4, -T.halfW - RUNOFF + CAR_R, T.halfW + RUNOFF - CAR_R);
        const vn = p.vx * nx + p.vz * nz;
        if (vn < 0) { p.vx -= nx * vn * 1.2; p.vz -= nz * vn * 1.2; }
        // rear-ended them: they get a shove, you lose a bit
        const fwd = p.prog < rv.d;
        if (fwd) { rv.v += 30; p.vx *= 0.94; p.vz *= 0.94; } else rv.v *= 0.96;
        if (p.bumpT <= 0) {
          p.bumpT = 0.35; s.sound.play('metal');
          const [sx, sy] = P((p.x + rv.x) / 2, 10, (p.z + rv.z) / 2);
          s.fx.burst(sx, sy, { color: '#fde68a', count: 10, speed: 180 });
        }
      }
    }
  }

  objects(dt) {
    const p = this.p, s = this.s, T = this.T;
    for (const o of this.oils) {
      const [ox, oz] = at(T, o.d, o.off);
      if (o.hit > 0) o.hit -= dt;
      if (o.hit <= 0 && p.spinT <= 0 && Math.hypot(p.x - ox, p.z - oz) < o.r + 10) {
        o.hit = 1.2; p.spinT = 0.9; p.spinDir = Math.sign(p.slip || p.steer) || 1;
        const [sx, sy] = P(p.x, 20, p.z);
        s.fx.text(sx, sy - 50, 'SPUN OUT!', { color: '#fb7185', size: 24 });
        s.sound.noise({ dur: 0.5, vol: 0.12, freq: 1800, to: 300, type: 'bandpass' });
        p.drift = 0; p.driftT = 0; s.resetCombo();
      }
      for (const rv of this.rivals) if (rv.spinT <= 0 && Math.abs(((rv.d - o.d) % T.L + T.L) % T.L) < 18 && Math.abs(rv.off - o.off) < o.r + 8) rv.spinT = 0.7;
    }
    for (const b of this.boosts) {
      if (b.cool > 0) b.cool -= dt;
      const [bx, bz] = at(T, b.d, b.off);
      if (b.cool <= 0 && Math.hypot(p.x - bx, p.z - bz) < 40) {
        b.cool = 1; p.boostT = 1.4;
        const f = 140; p.vx += Math.sin(p.h) * f; p.vz += Math.cos(p.h) * f;
        const [sx, sy] = P(p.x, 20, p.z);
        s.fx.text(sx, sy - 50, 'BOOST!', { color: '#67e8f9', size: 26 });
        s.sound.play('powerup');
      }
      for (const rv of this.rivals) if (Math.abs(((rv.d - b.d) % T.L + T.L) % T.L) < 14 && Math.abs(rv.off - b.off) < 40) rv.boostT = 1.1;
    }
    let left = 0;
    for (const c of this.coins) {
      if (c.got) continue;
      left++;
      const [cx, cz] = at(T, c.d, c.off);
      if (Math.hypot(p.x - cx, p.z - cz) < 30) {
        c.got = true; this.coinsGot++; left--;
        const [sx, sy] = P(cx, 14, cz);
        if (this.bonus) s.award(25 * this.level, sx, sy - 16, { chain: true, color: '#fde047' });
        else s.award(15 * this.level, sx, sy - 16, { color: '#fde047' });
        s.sound.play('coin', Math.min(10, s.comboCount));
        s.fx.burst(sx, sy, { color: '#fde047', count: 8, speed: 120 });
      }
    }
    if (this.bonus && left === 0 && this.coins.length) {
      for (const c of this.coins) c.got = false;
      s.fx.text(W / 2, H * 0.3, 'ALL COINS! +BONUS', { color: '#fde047', size: 28 });
      s.award(500 * this.level, W / 2, H * 0.36);
    }
  }

  raceLogic() {
    const p = this.p, s = this.s, T = this.T;
    if (this.bonus) return;
    // laps
    const lapDone = Math.max(0, Math.floor(p.prog / T.L));
    if (!p.finished && lapDone > p.lapDone) {
      p.lapDone = lapDone; p.passed.clear();
      if (lapDone >= LAPS) return this.finish();
      s.award(80 * this.level, W / 2, H * 0.3);
      s.fx.text(W / 2, H * 0.24, lapDone === LAPS - 1 ? 'FINAL LAP!' : `LAP ${lapDone + 1} / ${LAPS}`, { color: this.theme.edge, size: 34, life: 1.2 });
      s.sound.play('golden');
    }
    // wrong way
    if (!p.finished) { p.wrongT = p.prog < p.lastProg - 0.5 ? p.wrongT + 1 / 120 : Math.max(0, p.wrongT - 1 / 60); }
    p.lastProg = p.prog;
    // overtakes + rivals finishing
    for (const rv of this.rivals) {
      if (!rv.finished && rv.d >= LAPS * T.L) { rv.finished = true; this.finishedRivals++; }
      const ahead = rv.d > p.prog;
      if (rv.ahead && !ahead && !p.finished && !rv.finished && this.raceT > 1.5 && !p.passed.has(rv.i)) {
        p.passed.add(rv.i);
        const [sx, sy] = P(p.x, 30, p.z);
        s.award(50 * this.level, sx, sy - 60, { chain: true, color: rv.glow });
        s.fx.text(sx, sy - 90, `PASSED ${rv.name}!`, { color: rv.glow, size: 18 });
        s.sound.play('pass');
        if (p.passed.size >= 3) s.unlock('hattrick');
      }
      rv.ahead = ahead;
    }
    // can you still qualify?
    if (!p.finished && !this.result && this.finishedRivals >= need(this.level)) {
      this.result = 'fail';
      if (p.drift > 0) this.bankDrift();
      s.fx.text(W / 2, H * 0.3, 'TOO SLOW!', { color: '#fb7185', size: 44, life: 1.4 });
      s.fx.text(W / 2, H * 0.38, need(this.level) === 1 ? 'You had to win' : `You needed top ${need(this.level)}`, { color: '#fff', size: 20, life: 1.4 });
      this.after(1.3, () => s.hurt());
    }
  }

  finish() {
    const p = this.p, s = this.s;
    p.finished = true;
    if (p.drift > 0) this.bankDrift();
    p.place = this.finishedRivals + 1;
    const ok = p.place <= need(this.level);
    s.fx.text(W / 2, H * 0.26, `${PLACES[p.place - 1]} PLACE!`, { color: ok ? '#a3e635' : '#fb7185', size: 46, life: 1.6 });
    if (!ok) {
      if (this.result) return;
      this.result = 'fail';
      s.fx.text(W / 2, H * 0.34, `You needed top ${need(this.level)}`, { color: '#fff', size: 20, life: 1.4 });
      this.after(1.3, () => s.hurt());
      return;
    }
    this.result = 'win';
    s.award([600, 350, 180, 0][p.place - 1] * this.level, W / 2, H * 0.34);
    if (p.place === 1) { s.unlock('winner'); if (p.wallHits === 0) s.unlock('clean'); }
    this.after(1.4, () => s.completeLevel());
  }

  particles(dt) {
    for (const m of this.smoke) { m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.r += 16 * dt; }
    this.smoke = this.smoke.filter((m) => m.life < m.max);
    if (this.skids.length && this.t - this.skids[0].t > 5) this.skids.splice(0, 20);
  }

  updateCamera(dt) {
    const p = this.p;
    this.follow(p.x, p.z, p.vx, p.vz, dt);
  }
  follow(x, z, vx, vz, dt) {
    const k = Math.min(1, dt * 4.5);
    cam.x += (x + vx * 0.42 - cam.x) * k;
    cam.z += (z + vz * 0.42 - cam.z) * k;
    cam.d += (1000 + Math.hypot(vx, vz) * 0.18 - cam.d) * Math.min(1, dt * 2);
  }

  // ── Drawing ─────────────────────────────────────────────────
  render(ctx) {
    const T = this.T, th = this.theme, lo = this.s.lowDetail, N = T.N;
    // backdrop + neon floor grid
    ctx.fillStyle = th.bg[0]; ctx.fillRect(0, 0, W, H);
    const c0 = ground(0, 0), c1 = ground(W, 0), c2 = ground(0, H), c3 = ground(W, H);
    const x0 = Math.min(c0[0], c2[0]), x1 = Math.max(c1[0], c3[0]), z0 = Math.min(c2[1], c3[1]), z1 = Math.max(c0[1], c1[1]);
    const glow = ctx.createLinearGradient(0, 0, 0, H); glow.addColorStop(0, th.bg[0]); glow.addColorStop(1, th.bg[1]);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = hexA(th.grid, 0.28); ctx.lineWidth = 1;
    ctx.beginPath();
    const G = 160;
    for (let gx = Math.floor(x0 / G) * G; gx <= x1; gx += G) { const a = P(gx, 0, z0), b = P(gx, 0, z1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let gz = Math.floor(z0 / G) * G; gz <= z1; gz += G) { const a = P(x0, 0, gz), b = P(x1, 0, gz); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();

    // which track samples are on screen
    const ex = 320;
    if (!this.vis || this.vis.length < N) this.vis = new Uint8Array(N);
    const vis = this.vis;
    if (!this.scr || this.scr.n !== N) this.scr = { n: N, a: Array.from({ length: 10 }, () => new Float32Array(N)), k: new Float32Array(N) };
    const [lx, ly, rx, ry, wlx, wly, wrx, wry, tly, try_] = this.scr.a, ks = this.scr.k;
    const hw = T.halfW, ww = hw + RUNOFF;
    for (let i = 0; i < N; i++) {
      const x = T.x[i], z = T.z[i];
      vis[i] = x > x0 - ex && x < x1 + ex && z > z0 - ex && z < z1 + ex ? 1 : 0;
      if (!vis[i]) continue;
      const nx = T.nx[i], nz = T.nz[i];
      let q = P(x - nx * hw, 0, z - nz * hw); lx[i] = q[0]; ly[i] = q[1]; ks[i] = q[2];
      q = P(x + nx * hw, 0, z + nz * hw); rx[i] = q[0]; ry[i] = q[1];
      q = P(x - nx * ww, 0, z - nz * ww); wlx[i] = q[0]; wly[i] = q[1]; tly[i] = q[1] - WALL_H * CT * q[2];
      q = P(x + nx * ww, 0, z + nz * ww); wrx[i] = q[0]; wry[i] = q[1]; try_[i] = q[1] - WALL_H * CT * q[2];
    }
    const seg = (fn) => { for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (vis[i] && vis[j]) fn(i, j); } };
    const quad = (ax, ay, bx, by, cx, cy, dx, dy) => { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); };
    // run-off, then the asphalt in alternating bands
    ctx.fillStyle = th.runoff; ctx.beginPath(); seg((i, j) => quad(wlx[i], wly[i], wlx[j], wly[j], wrx[j], wry[j], wrx[i], wry[i])); ctx.fill();
    ctx.lineWidth = 1;
    for (const band of [0, 1]) {
      ctx.fillStyle = ctx.strokeStyle = band ? th.road2 : th.road;
      ctx.beginPath(); seg((i, j) => { if (((i >> 2) & 1) === band) quad(lx[i], ly[i], lx[j], ly[j], rx[j], ry[j], rx[i], ry[i]); }); ctx.fill(); ctx.stroke();
    }
    // kerbs on the bends
    for (const band of [0, 1]) {
      ctx.fillStyle = th.kerb[band]; ctx.beginPath();
      seg((i, j) => {
        if ((i & 1) !== band || Math.abs(T.k[i]) < 0.0026) return;
        for (const sg of [-1, 1]) {
          const a = P(T.x[i] + T.nx[i] * sg * (hw + 13), 0, T.z[i] + T.nz[i] * sg * (hw + 13)), b = P(T.x[j] + T.nx[j] * sg * (hw + 13), 0, T.z[j] + T.nz[j] * sg * (hw + 13));
          if (sg < 0) quad(lx[i], ly[i], lx[j], ly[j], b[0], b[1], a[0], a[1]); else quad(rx[i], ry[i], rx[j], ry[j], b[0], b[1], a[0], a[1]);
        }
      });
      ctx.fill();
    }
    // start / finish chequers
    if (vis[0]) {
      const cols = 10, rows = 2, dep = 14;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#f8fafc' : '#0b0b14';
        const o0 = -hw + c * hw * 2 / cols, o1 = o0 + hw * 2 / cols, d0 = r * dep - dep, d1 = d0 + dep;
        const pt = (o, d) => P(T.x[0] + T.nx[0] * o + T.tx[0] * d, 0, T.z[0] + T.nz[0] * o + T.tz[0] * d);
        const a = pt(o0, d0), b = pt(o1, d0), cc = pt(o1, d1), dd = pt(o0, d1);
        ctx.beginPath(); quad(a[0], a[1], b[0], b[1], cc[0], cc[1], dd[0], dd[1]); ctx.fill();
      }
    }
    // neon tyre trails
    if (this.skids.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const byCol = new Map();
      for (const sk of this.skids) { const age = this.t - sk.t; const b = Math.min(3, age / 1.4 | 0); const key = sk.c + b; if (!byCol.has(key)) byCol.set(key, { c: sk.c, b, list: [] }); byCol.get(key).list.push(sk); }
      for (const { c, b, list } of byCol.values()) {
        ctx.strokeStyle = hexA(c, [0.5, 0.32, 0.18, 0.08][b]); ctx.lineWidth = 3.2;
        ctx.beginPath();
        for (const sk of list) { const a = P(sk.x1, 0, sk.z1), q = P(sk.x2, 0, sk.z2); ctx.moveTo(a[0], a[1]); ctx.lineTo(q[0], q[1]); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // edge lines + wall faces + glowing wall tops
    const runs = (ax, ay, fn) => { ctx.beginPath(); let open = false; for (let i = 0; i <= N; i++) { const ii = i % N; if (vis[ii]) { if (open) ctx.lineTo(ax[ii], ay[ii]); else { ctx.moveTo(ax[ii], ay[ii]); open = true; } } else open = false; } fn(); };
    ctx.save(); ctx.lineJoin = 'round';
    if (!lo) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(th.edge, 0.18); ctx.lineWidth = 9; runs(lx, ly, () => ctx.stroke()); runs(rx, ry, () => ctx.stroke()); ctx.globalCompositeOperation = 'source-over'; }
    ctx.strokeStyle = th.edge; ctx.lineWidth = 2.2; runs(lx, ly, () => ctx.stroke()); runs(rx, ry, () => ctx.stroke());
    ctx.restore();
    this.drawWalls(ctx, (i) => true);
    // flat things on the track
    this.drawPads(ctx); this.drawOil(ctx); this.drawCoins(ctx);

    // standing things, far → near
    const items = [];
    const p = this.p;
    for (const rv of this.rivals) items.push({ dep: P(rv.x, 0, rv.z)[3], draw: () => this.drawRacer(ctx, rv, palette(rv.paint, { stripe: rv.stripe, glass: '#0b1222' }), rv.glow, { brake: rv.spinT > 0 }, 0, rv.name) });
    const gold = this.s.gold;
    if (this.s.state !== 'title') items.push({ dep: P(p.x, 0, p.z)[3], draw: () => this.drawRacer(ctx, p, palette(gold ? '#fbbf24' : '#f43f5e', { stripe: gold ? '#fff7ed' : '#f8fafc', glass: '#140a1a', dark: gold ? '#78350f' : '#111827' }), gold ? '#fde047' : '#ff4fa3', { brake: p.brake }, -p.steer * 0.07, null) });
    if (vis[0]) items.push({ dep: P(T.x[0], 40, T.z[0])[3], draw: () => this.drawGantry(ctx) });
    for (const sg of this.signs) { if (sg.x > x0 - 200 && sg.x < x1 + 200 && sg.z > z0 - 200 && sg.z < z1 + 200) items.push({ dep: P(sg.x, 40, sg.z)[3], draw: () => this.drawSign(ctx, sg) }); }
    items.sort((a, b) => b.dep - a.dep);
    for (const it of items) it.draw();
    // walls nearer than the cars get drawn again on top of them
    const cars = [p, ...this.rivals];
    this.drawWalls(ctx, (i, side) => { const inward = -side * T.nz[i]; if (inward < 0.15) return false; for (const c of cars) if (Math.abs(c.x - T.x[i]) < 150 && Math.abs(c.z - T.z[i]) < 150) return true; return false; }, true);
    // smoke
    for (const m of this.smoke) {
      const q = P(m.x, m.y, m.z), a = (1 - m.life / m.max) * 0.32 * m.a;
      if (q[2] <= 0) continue;
      ctx.fillStyle = hexA(m.c, a); ctx.beginPath(); ctx.arc(q[0], q[1], m.r * q[2], 0, TAU); ctx.fill();
    }
    this.drawHud(ctx);
  }

  drawWalls(ctx, want, nearOnly = false) {
    const T = this.T, th = this.theme, N = T.N, vis = this.vis, [, , , , wlx, wly, wrx, wry, tly, try_] = this.scr.a;
    const sides = [[-1, wlx, wly, tly], [1, wrx, wry, try_]];
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = th.face; ctx.beginPath();
    for (const [side, xs, ys, ts] of sides) for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (vis[i] && vis[j] && want(i, side)) { ctx.moveTo(xs[i], ys[i]); ctx.lineTo(xs[j], ys[j]); ctx.lineTo(xs[j], ts[j]); ctx.lineTo(xs[i], ts[i]); ctx.closePath(); } }
    ctx.fill();
    // chevrons on the outside wall of tight bends
    if (!nearOnly) {
      ctx.strokeStyle = th.kerb[0]; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < N; i += 2) {
        const j = (i + 1) % N, k = T.k[i];
        if (!vis[i] || !vis[j] || Math.abs(k) < 0.0034) continue;
        const [, xs, ys, ts] = k > 0 ? sides[0] : sides[1];
        ctx.moveTo(xs[i], ts[i] + 2); ctx.lineTo(xs[j], (ys[j] + ts[j]) / 2); ctx.lineTo(xs[i], ys[i] - 2);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = th.wall; ctx.lineWidth = 2.4; ctx.beginPath();
    for (const [side, xs, , ts] of sides) for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (vis[i] && vis[j] && want(i, side)) { ctx.moveTo(xs[i], ts[i]); ctx.lineTo(xs[j], ts[j]); } }
    ctx.stroke();
    if (!this.s.lowDetail && !nearOnly) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(th.wall, 0.22); ctx.lineWidth = 8; ctx.stroke(); }
    ctx.restore();
  }

  drawPads(ctx) {
    const T = this.T;
    for (const b of this.boosts) {
      const [x, z, , , nx, nz] = at(T, b.d, b.off), tx = -nz, tz = nx;
      const pt = (o, d) => P(x + nx * o + tx * d, 1, z + nz * o + tz * d);
      const cc = pt(0, 0); if (cc[2] <= 0 || cc[0] < -80 || cc[0] > W + 80 || cc[1] < -80 || cc[1] > H + 80) continue;
      const a = pt(-30, -24), q = pt(30, -24), c = pt(30, 24), d = pt(-30, 24);
      ctx.fillStyle = 'rgba(34,211,238,0.22)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.stroke();
      for (let r = 0; r < 3; r++) {
        const ph = ((this.t * 2.4 + r / 3) % 1), dd = -16 + ph * 32;
        ctx.globalAlpha = Math.sin(ph * Math.PI); ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 3;
        const l = pt(-18, dd - 8), m = pt(0, dd + 4), rr = pt(18, dd - 8);
        ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(m[0], m[1]); ctx.lineTo(rr[0], rr[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  drawOil(ctx) {
    const T = this.T;
    for (const o of this.oils) {
      const [x, z] = at(T, o.d, o.off);
      for (const [bx, bz, s] of o.blobs) {
        const q = P(x + bx, 0, z + bz), r = o.r * s * q[2];
        if (q[2] <= 0 || q[0] < -60 || q[0] > W + 60 || q[1] < -60 || q[1] > H + 60) continue;
        ctx.fillStyle = 'rgba(3,2,8,0.92)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], r, r * ST, 0, 0, TAU); ctx.fill();
        const g = ctx.createLinearGradient(q[0] - r, q[1], q[0] + r, q[1]);
        g.addColorStop(0, 'rgba(244,114,182,0.5)'); g.addColorStop(0.5, 'rgba(56,189,248,0.5)'); g.addColorStop(1, 'rgba(163,230,53,0.5)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(q[0] - r * 0.15, q[1] - r * 0.1, r * 0.6, r * 0.6 * ST, 0, 0.3, 2.6); ctx.stroke();
      }
    }
  }
  drawCoins(ctx) {
    const T = this.T, lo = this.s.lowDetail;
    for (const c of this.coins) {
      if (c.got) continue;
      const [x, z] = at(T, c.d, c.off), bob = Math.sin(this.t * 4 + c.d) * 3, q = P(x, 14 + bob, z);
      if (q[2] <= 0 || q[0] < -30 || q[0] > W + 30 || q[1] < -30 || q[1] > H + 30) continue;
      const r = 10 * q[2], sp = Math.abs(Math.cos(this.t * 3 + c.d * 0.02));
      if (!lo) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, q[0], q[1], r * 2.6, '#fbbf24', 0.45); ctx.restore(); }
      ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.ellipse(q[0], q[1], Math.max(1.5, r * sp), r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.ellipse(q[0] - r * 0.12 * sp, q[1], Math.max(1, r * 0.8 * sp), r * 0.8, 0, 0, TAU); ctx.fill();
    }
  }

  drawRacer(ctx, car, pal, glowCol, lights, roll, name) {
    const fx = Math.sin(car.h), fz = Math.cos(car.h), lo = this.s.lowDetail;
    const c = P(car.x, 0, car.z), rear = P(car.x - fx * CAR_HALF, 0, car.z - fz * CAR_HALF), front = P(car.x + fx * CAR_HALF, 0, car.z + fz * CAR_HALF);
    if (c[2] <= 0 || rear[2] <= 0 || front[2] <= 0 || c[0] < -80 || c[0] > W + 80 || c[1] < -80 || c[1] > H + 80) return;
    const k = c[2];
    // shadow + underglow
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(c[0] + 3 * k, c[1] + 3 * k, 24 * k, 24 * k * ST, 0, 0, TAU); ctx.fill();
    if (!lo) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(c[0], c[1]); ctx.scale(1, ST); glowDot(ctx, 0, 0, 52 * k, glowCol, 0.5); ctx.restore(); }
    const yaw = Math.atan2(front[0] - rear[0], -(front[1] - rear[1]) / ST);
    drawCar(ctx, SPORTS, { x: rear[0], y: rear[1], ppu: CAR_U * rear[2], pal, yaw, pitch: TILT, roll, amb: 0.5, lights, halo: lo ? 0 : 0.9,
      glow: (g, x, y, r, col, a) => { g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, x, y, r * 1.6, col, a); g.restore(); } });
    if (name) {
      ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(name, c[0] + 1, c[1] - 30 * k + 1);
      ctx.fillStyle = glowCol; ctx.fillText(name, c[0], c[1] - 30 * k);
    }
  }

  /** draw text on a vertical panel standing in the world: corners (bottom-left, bottom-right, top-left) in screen space */
  panelText(ctx, bl, br, tl, text, col, wpx, hpx) {
    ctx.save();
    ctx.transform((br[0] - bl[0]) / wpx, (br[1] - bl[1]) / wpx, (bl[0] - tl[0]) / hpx, (bl[1] - tl[1]) / hpx, tl[0], tl[1]);
    ctx.font = `900 ${hpx * 0.62}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.fillText(text, wpx / 2, hpx / 2 + 1, wpx * 0.9);
    ctx.restore();
  }
  drawGantry(ctx) {
    const T = this.T, th = this.theme, ww = T.halfW + RUNOFF - 4, HT = 64, HB = 46;
    let a = [T.x[0] - T.nx[0] * ww, T.z[0] - T.nz[0] * ww], b = [T.x[0] + T.nx[0] * ww, T.z[0] + T.nz[0] * ww];
    if (P(b[0], 0, b[1])[0] < P(a[0], 0, a[1])[0]) [a, b] = [b, a];
    const pa0 = P(a[0], 0, a[1]), pa1 = P(a[0], HT, a[1]), pb0 = P(b[0], 0, b[1]), pb1 = P(b[0], HT, b[1]), pab = P(a[0], HB, a[1]), pbb = P(b[0], HB, b[1]);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 5 * pa0[2]; ctx.beginPath(); ctx.moveTo(pa0[0], pa0[1]); ctx.lineTo(pa1[0], pa1[1]); ctx.moveTo(pb0[0], pb0[1]); ctx.lineTo(pb1[0], pb1[1]); ctx.stroke();
    ctx.fillStyle = 'rgba(8,6,20,0.92)'; ctx.beginPath(); ctx.moveTo(pab[0], pab[1]); ctx.lineTo(pbb[0], pbb[1]); ctx.lineTo(pb1[0], pb1[1]); ctx.lineTo(pa1[0], pa1[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = th.edge; ctx.lineWidth = 2; ctx.stroke();
    const lap = this.p.lapDone, txt = this.bonus ? '★ COIN RUSH ★' : lap >= LAPS - 1 && this.raceT > 0 ? 'FINAL LAP' : 'NEON DRIFT';
    this.panelText(ctx, pab, pbb, pa1, txt, th.kerb[0], 240, 30);
  }
  drawSign(ctx, sg) {
    let ax = sg.x - sg.tx * 48, az = sg.z - sg.tz * 48, bx = sg.x + sg.tx * 48, bz = sg.z + sg.tz * 48;
    if (P(bx, 0, bz)[0] < P(ax, 0, az)[0]) [ax, az, bx, bz] = [bx, bz, ax, az];
    const bl = P(ax, 30, az), br = P(bx, 30, bz), tl = P(ax, 72, az), tr = P(bx, 72, bz), g0 = P(sg.x, 0, sg.z), g1 = P(sg.x, 30, sg.z);
    if (g0[2] <= 0 || tl[2] <= 0 || g0[0] < -120 || g0[0] > W + 120 || g0[1] < -160 || g0[1] > H + 60) return;
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 4 * g0[2]; ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
    ctx.fillStyle = 'rgba(6,4,16,0.9)'; ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(tr[0], tr[1]); ctx.lineTo(tl[0], tl[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = sg.col; ctx.lineWidth = 2; ctx.stroke();
    if (!this.s.lowDetail) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(sg.col, 0.25); ctx.lineWidth = 7; ctx.stroke(); ctx.restore(); }
    const flick = Math.sin(this.t * 13 + sg.x) > 0.96 ? 0.4 : 1;
    ctx.globalAlpha = flick; this.panelText(ctx, bl, br, tl, sg.text, sg.col, 120, 50); ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    const s = this.s, p = this.p, th = this.theme;
    ctx.save();
    // minimap
    const mm = this.mm, mx = W - mm.S - 10, my = 10;
    ctx.drawImage(this.mmCanvas, mx, my, mm.S, mm.S);
    for (const rv of this.rivals) { const [a, b] = mm.f(rv.x, rv.z); ctx.fillStyle = rv.glow; ctx.beginPath(); ctx.arc(mx + a, my + b, 3.2, 0, TAU); ctx.fill(); }
    if (s.state !== 'title') { const [a, b] = mm.f(p.x, p.z); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + a, my + b, 4.6, 0, TAU); ctx.fill(); ctx.fillStyle = s.gold ? '#fbbf24' : '#ff4fa3'; ctx.beginPath(); ctx.arc(mx + a, my + b, 3, 0, TAU); ctx.fill(); }
    if (s.state === 'title') { ctx.restore(); return; }
    ctx.textBaseline = 'alphabetic';
    if (this.bonus) {
      progressBar(ctx, 12, 12, W - mm.S - 34, 20, s.bonusLeft / 25, '#fbbf24', `★ COIN RUSH · ${this.coinsGot} coins · ${Math.ceil(s.bonusLeft)}s`);
    } else {
      // position
      const place = p.finished ? p.place : 1 + this.rivals.filter((rv) => (rv.finished ? true : rv.d > p.prog)).length;
      const ok = place <= need(this.level);
      ctx.fillStyle = 'rgba(5,3,15,0.66)'; roundRect(ctx, 10, 10, 128, 74, 12); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '900 34px system-ui'; ctx.fillStyle = ok ? '#a3e635' : '#fb7185'; ctx.fillText(PLACES[place - 1], 20, 46);
      ctx.font = '800 14px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText('/ 4', 82, 46);
      ctx.font = '700 11px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(need(this.level) === 1 ? 'MUST WIN' : `NEED TOP ${need(this.level)}`, 20, 64);
      ctx.fillStyle = th.edge; ctx.font = '800 12px system-ui'; ctx.fillText(`LAP ${Math.min(LAPS, p.lapDone + 1)}/${LAPS}`, 20, 78);
      const tt = this.raceT; ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.floor(tt / 60)}:${(tt % 60).toFixed(1).padStart(4, '0')}`, 130, 78);
    }
    // live drift counter
    if (p.drift > 1 && p.driftT > 0.25) {
      const [sx, sy] = P(p.x, 0, p.z), a = Math.min(1, p.driftT * 3);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = '900 13px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText('DRIFT', sx, sy - 88);
      ctx.font = '900 24px system-ui'; ctx.fillStyle = s.gold ? '#fde047' : '#ff4fa3';
      ctx.fillText(`${Math.round(p.drift) * 10}${s.multiplier > 1 ? ` ×${s.multiplier}` : ''}`, sx, sy - 64);
      ctx.globalAlpha = 1;
    }
    // speed
    const spd = Math.hypot(p.vx, p.vz), f = clamp(spd / (this.maxV * 1.3), 0, 1);
    ctx.fillStyle = 'rgba(5,3,15,0.6)'; roundRect(ctx, 10, H - 40, 140, 28, 10); ctx.fill();
    progressBar(ctx, 18, H - 31, 84, 10, f, p.boostT > 0 ? '#67e8f9' : th.edge, '');
    ctx.textAlign = 'right'; ctx.font = '900 14px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(spd * 0.4)}`, 142, H - 20);
    // countdown
    if (this.count > 0) {
      const n = Math.ceil(this.count / 0.7), ph = (this.count / 0.7) % 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${80 + ph * 30}px system-ui`; ctx.globalAlpha = 0.4 + ph * 0.6;
      ctx.fillStyle = ['#a3e635', '#fde047', '#fb7185'][n - 1] || '#fff'; ctx.fillText(String(n), W / 2, H * 0.36);
      ctx.globalAlpha = 1;
    }
    if (p.wrongT > 1 && !p.finished) {
      ctx.textAlign = 'center'; ctx.font = '900 30px system-ui'; ctx.fillStyle = Math.sin(this.t * 10) > 0 ? '#fb7185' : '#fff';
      ctx.fillText('WRONG WAY!', W / 2, H * 0.3);
    }
    ctx.restore();
  }
}

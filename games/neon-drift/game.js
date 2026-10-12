// ─────────────────────────────────────────────────────────────
//  NEON DRIFT 3D — game 21 (Zone 4 · Ultra)
//  A neon circuit racer seen from the DRIVER'S SEAT by default: the cockpit
//  frame, a turning wheel and a rear-view mirror stay put while the world
//  rolls, bobs and swings round you as the tail steps out (C / the VIEW button
//  switches to the chase cam). The track is a dark glass floor laid with a
//  glowing grid, with light pulses racing down it towards you, and the road is
//  drawn strip by strip from the track's real curvature and a rolling hill
//  profile, with a synthwave sky, a city skyline that pans as you corner,
//  light pillars, holo billboards and neon arches flying past. The cars are
//  lit 3D models (assets/js/car-models.js, shared with Turbo Rush 3D), so
//  when the tail steps out you watch your car slide sideways down the road.
//
//  Three laps against five rivals. Hold a turn at speed and the tail steps
//  out: that's a DRIFT. Drift points bank when you straighten up, and every
//  drift you chain inside the combo window raises the multiplier. Hit a wall hard
//  and the drift is lost. Overtakes, laps and your finishing place score too.
//
//    L1 top 3 to qualify   L2 oil slicks   L3 top 2   L4 ⚡ boost pads
//    L7+ only a win counts  L8, L14, L20 black ice (less grip)
//  Every 5th level: ★ NEON COIN RUSH — no rivals, grab the coins.
//  At the start of a run you tune the car radio: each station plays its own
//  original synthwave track (synthesised live) and picks the
//  colour scheme for the run (purely cosmetic).
//  Each race track and its hills are built from the seeded RNG, so the Daily
//  Challenge circuit is the same for everyone.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { SPORTS, drawCar, palette, rgb } from '../../assets/js/car-models.js';
import { tilt } from '../../assets/js/tilt.js';

const ID = 'neon-drift';
const W = 480, H = 720;
const TAU = Math.PI * 2;
// chase camera
const F = 450;                       // focal length (px)
const HZ = Math.round(H * 0.4);      // horizon line
const CAM_H = 95;                    // camera height above the road
const CAMB = 175;                    // camera distance behind the car
const NEAR = 22;
// cockpit camera (the default view): eye height above the road, and how far behind the car's centre the driver sits
const CP_H = 36;
const CP_BACK = 6;
const PW = Math.round(TAU * F);      // width of a full 360° sky panorama
const MAXN = 200;                    // max road samples drawn
// track
const STEP = 24;                     // track sample spacing (world units)
const RUNOFF = 34;                   // run-off strip between the track edge and the wall
const WALL_H = 22;
const CAR_U = 15;                    // world units per car-model unit (car ≈ 30 wide, 58 long)
const BOT_EASE = 0.97;                // rivals' top speed scale (dialled back ~10% overall with the catch-up and boost odds)
const CAR_R = 22;                    // collision radius
const CAR_HALF = SPORTS.len * CAR_U / 2;
const LAPS = 3;
const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const wrapA = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const mod = (a, n) => ((a % n) + n) % n;
const need = (l) => (l <= 2 ? 3 : l <= 6 ? 2 : 1);
const isIce = (l) => l >= 8 && l % 6 === 2;
const needText = (l) => (need(l) === 1 ? 'Win the race.' : `Top ${need(l)} to qualify.`);

const RIVALS = [
  { name: 'VOLT',  paint: '#22d3ee', stripe: '#0e7490', glow: '#22d3ee' },
  { name: 'TOXIN', paint: '#a3e635', stripe: '#365314', glow: '#a3e635' },
  { name: 'NOVA',  paint: '#a78bfa', stripe: '#4c1d95', glow: '#c084fc' },
  { name: 'BLAZE', paint: '#fb923c', stripe: '#7c2d12', glow: '#fb923c' },
  { name: 'FROST', paint: '#e0f2fe', stripe: '#0369a1', glow: '#7dd3fc' },
];
const THEMES = {
  synth: { key: 'synth', sky: ['#07021a', '#2a0845', '#8a1f72'], haze: '#3a1050', sun: ['#fde047', '#ff4fa3'], city: ['#2a0f45', '#12061f'], gnd: ['#0c0520', '#120829'], grid: '#c026d3',
    road: '#1c1733', road2: '#231c40', runoff: '#120a24', edge: '#22d3ee', kerb: ['#f472b6', '#f8fafc'], wall: '#f472b6', face: '#2a1440', lane: '#a78bfa', sign: ['#22d3ee', '#f472b6', '#fde047'] },
  toxic: { key: 'toxic', sky: ['#010805', '#06301a', '#2a7a2a'], haze: '#0f3a1c', sun: ['#ecfccb', '#a3e635'], city: ['#0d2e18', '#04140a'], gnd: ['#03110a', '#061a0f'], grid: '#22c55e',
    road: '#15201b', road2: '#1b2922', runoff: '#0a150f', edge: '#a3e635', kerb: ['#a855f7', '#ecfccb'], wall: '#a855f7', face: '#1d1430', lane: '#86efac', sign: ['#a3e635', '#c084fc', '#22d3ee'] },
  ember: { key: 'ember', sky: ['#0d0402', '#3d0f06', '#b4400f'], haze: '#4a1608', sun: ['#fef3c7', '#f97316'], city: ['#3a1208', '#160603'], gnd: ['#120604', '#1a0906'], grid: '#ea580c',
    road: '#211a20', road2: '#2a2028', runoff: '#170e10', edge: '#fb923c', kerb: ['#38bdf8', '#fff7ed'], wall: '#38bdf8', face: '#0f2030', lane: '#fdba74', sign: ['#fb923c', '#38bdf8', '#fde047'] },
  ice:   { key: 'ice', sky: ['#01060f', '#0a2440', '#2f78a8'], haze: '#123456', sun: ['#ffffff', '#7dd3fc'], city: ['#12304f', '#06142a'], gnd: ['#07111f', '#0b1828'], grid: '#38bdf8',
    road: '#1b2638', road2: '#22304a', runoff: '#0f1828', edge: '#e0f2fe', kerb: ['#38bdf8', '#ffffff'], wall: '#7dd3fc', face: '#12263a', lane: '#bae6fd', sign: ['#7dd3fc', '#e0f2fe', '#f0abfc'] },
  gold:  { key: 'gold', sky: ['#0c0601', '#3a2205', '#a8740c'], haze: '#3d2a08', sun: ['#fff7ed', '#fbbf24'], city: ['#3a2808', '#1a1004'], gnd: ['#140c03', '#1c1206'], grid: '#eab308',
    road: '#2a2112', road2: '#342818', runoff: '#1a1208', edge: '#fde047', kerb: ['#fbbf24', '#fff7ed'], wall: '#fbbf24', face: '#33240a', lane: '#fde68a', sign: ['#fde047', '#fbbf24', '#fff7ed'] },
};
// each station plays its own original synthwave track (synthesised live — see audio.js 'synth' kit)
const STATIONS = [
  { name: 'SYNTH FM', freq: 88.1, theme: 'synth',
    music: { bpm: 124, style: 'outrun', lead: 'sawtooth', kit: 'synth', arp: [0, 1, 2, 4, 2, 1, 3, 1], oct: [12, 12, 12, 12, 12, 12, 12, 12], hook: [2, 1, 0, 1, 4, 2, 1, null] } },
  { name: 'TOXIC WAVE', freq: 94.7, theme: 'toxic',
    music: { bpm: 134, style: 'toxic', lead: 'square', kit: 'synth', arp: [0, 2, 4, 2, 1, 3, 4, 3], oct: [12, 12, 12, 12, 12, 12, 24, 12], hook: [0, null, 2, 1, 0, null, 4, 2] } },
  { name: 'EMBER RADIO', freq: 101.3, theme: 'ember',
    music: { bpm: 112, style: 'neon', lead: 'triangle', kit: 'synth', arp: [0, 1, 2, 3, 4, 3, 2, 1], oct: [12, 12, 12, 12, 12, 12, 12, 12], hook: [4, 2, 3, 1, 2, 0, 1, null] } },
];
/** the def's music object — the engine (re)starts music from it, so switching station rewrites it in place */
const MUSIC = { ...STATIONS[0].music };
const SIGNS = ['NEON', 'DRIFT', 'TC', 'ULTRA', 'TURBO', 'GO!', 'ZONE 4', 'FULL SEND'];
const TUNE_TIME = 7;

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 3.2,
  comboStep: 1,
  maxMultiplier: 6,
  bonusTime: 25,
  detail: true,
  music: MUSIC,
  levelInfo: (l, b) => b ? 'NEON COIN RUSH — no rivals. Drift between the coins!'
    : l === 1 ? 'Finish in the top 3. Hold a turn at full speed to DRIFT — drifting charges your ⚡ BOOST: fire it with ↑ / W or the BOOST button. Drift into a rival to spin them out!'
    : l === 2 ? 'Oil on a corner! Hit it and you spin out — take the bend wide. Top 3 to qualify.'
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
  return { N, step, L: N * step, x, z, tx, tz, nx, nz, ang, k, halfW, y: new Float32Array(N) };
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
  let T = null;
  for (let tries = 0; tries < 40 && !T; tries++) {
    const R = 980 + n * 32, ctrl = [];
    for (let i = 0; i < n; i++) {
      const a = (i + rng.range(-0.28, 0.28)) / n * TAU, r = R * (1 + rng.range(-vari, vari));
      ctrl.push([Math.cos(a) * r, Math.sin(a) * r * 1.12]);
    }
    if (rng.chance(0.5)) ctrl.reverse();
    const c = sampleTrack(ctrl, halfW);
    if (validTrack(c)) T = rotateToStraight(c);
    vari *= 0.9;
  }
  if (!T) T = rotateToStraight(sampleTrack(Array.from({ length: 10 }, (_, i) => [Math.cos(i / 10 * TAU) * 1200, Math.sin(i / 10 * TAU) * 900]), halfW));
  // rolling hills: two looping sine waves, flattened around the start line
  const amp = bonus ? 30 : Math.min(110, 18 + level * 7);
  const f1 = rng.int(2, 3), f2 = rng.int(4, 6), p1 = rng.range(0, TAU), p2 = rng.range(0, TAU);
  for (let i = 0; i < T.N; i++) {
    const d = i * T.step, u = d / T.L * TAU, ds = Math.min(d, T.L - d), fl = ds > 700 ? 1 : (ds / 700) ** 2 * (3 - 2 * ds / 700);
    T.y[i] = amp * (0.62 * Math.sin(f1 * u + p1) + 0.38 * Math.sin(f2 * u + p2)) * fl;
  }
  return T;
}
/** position on the track at distance d with a sideways offset: [x, z, heading, curvature, nx, nz] */
function at(T, d, off = 0) {
  const dd = mod(d, T.L), fi = dd / T.step, i = Math.floor(fi) % T.N, j = (i + 1) % T.N, f = fi - Math.floor(fi);
  const nx = T.nx[i] + (T.nx[j] - T.nx[i]) * f, nz = T.nz[i] + (T.nz[j] - T.nz[i]) * f;
  return [T.x[i] + (T.x[j] - T.x[i]) * f + nx * off, T.z[i] + (T.z[j] - T.z[i]) * f + nz * off, T.ang[i] + wrapA(T.ang[j] - T.ang[i]) * f, T.k[i], nx, nz];
}
function elev(T, d) {
  const fi = mod(d, T.L) / T.step, i = Math.floor(fi) % T.N, f = fi - Math.floor(fi);
  return T.y[i] + (T.y[(i + 1) % T.N] - T.y[i]) * f;
}

// ── Colour helpers ─────────────────────────────────────────────
function glowDot(ctx, x, y, r, col, a) {
  if (r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
/** blend two hex colours (t 0..1) → 'rgb(...)' */
function mixHex(a, b, t) { const x = rgb(a), y = rgb(b); return `rgb(${x[0] + (y[0] - x[0]) * t | 0},${x[1] + (y[1] - x[1]) * t | 0},${x[2] + (y[2] - x[2]) * t | 0})`; }
const BOOST_MIN = 0.25;              // you need at least a quarter of the meter to fire the boost
function darken(h, f) { const c = rgb(h); return `rgb(${c[0] * f | 0},${c[1] * f | 0},${c[2] * f | 0})`; }
function hexA(h, a) { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const fogCache = new Map();
/** blend a colour towards the horizon haze (f 0..1, quantised so the strings are cached) */
function fogMix(hex, haze, f) {
  const q = Math.min(12, Math.round(f * 12));
  if (!q) return hex;
  const key = hex + haze + q;
  let s = fogCache.get(key);
  if (!s) {
    const a = rgb(hex), b = rgb(haze), t = q / 12;
    s = `rgb(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0})`;
    fogCache.set(key, s);
  }
  return s;
}
const fogAt = (z) => clamp((z - 900) / 3000, 0, 0.9);

// ── Sky art (built once per theme, cached) ─────────────────────
const skyCache = new Map();
function seeded(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
function skyArt(th) {
  let a = skyCache.get(th.key);
  if (a) return a;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // far skyline: tall hazy towers with lit windows
  const far = mk(PW, 130), g = far.getContext('2d'), r = seeded(7);
  for (let x = 0; x < PW;) {
    const w = 16 + r() * 44, hh = 26 + Math.pow(r(), 1.6) * 100;
    g.fillStyle = th.city[0]; g.fillRect(x, 130 - hh, w, hh);
    if (r() < 0.25) { g.fillRect(x + w / 2 - 1, 130 - hh - 14, 2, 14); g.fillStyle = '#ff3355'; g.fillRect(x + w / 2 - 1.5, 130 - hh - 16, 3, 3); }
    g.fillStyle = hexA(th.lane, 0.55);
    for (let wy = 130 - hh + 5; wy < 126; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (r() < 0.16) g.fillRect(wx, wy, 2, 2);
    x += w + r() * 3;
  }
  // near skyline: low dark blocks with neon roof lines, scrolls faster
  const PW2 = Math.round(PW * 1.3), near = mk(PW2, 80), h2 = near.getContext('2d'), r2 = seeded(31);
  for (let x = 0; x < PW2;) {
    const w = 30 + r2() * 70, hh = 12 + r2() * 46;
    h2.fillStyle = th.city[1]; h2.fillRect(x, 80 - hh, w, hh);
    if (r2() < 0.45) { h2.fillStyle = hexA(r2() < 0.5 ? th.kerb[0] : th.edge, 0.7); h2.fillRect(x, 80 - hh, w, 1.5); }
    h2.fillStyle = hexA(th.edge, 0.45);
    for (let wy = 80 - hh + 4; wy < 78; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) if (r2() < 0.1) h2.fillRect(wx, wy, 3, 2);
    x += w + r2() * 10;
  }
  // the striped synthwave sun
  const R = 74, sun = mk(R * 2, R * 2), sg = sun.getContext('2d');
  const lg = sg.createLinearGradient(0, 0, 0, R * 2); lg.addColorStop(0, th.sun[0]); lg.addColorStop(1, th.sun[1]);
  sg.fillStyle = lg; sg.beginPath(); sg.arc(R, R, R, 0, TAU); sg.fill();
  sg.globalCompositeOperation = 'destination-out';
  for (let i = 0, y = R * 0.9; y < R * 2; i++) { const t = 2 + i * 1.6; sg.fillRect(0, y, R * 2, t); y += t + 9 - i; }
  // stars across the whole panorama
  const rs = seeded(99), stars = Array.from({ length: 90 }, () => [rs() * PW, rs() * (HZ - 70), rs() < 0.15 ? 2 : 1, rs() * TAU]);
  a = { far, near, PW2, sun, R, stars };
  skyCache.set(th.key, a);
  return a;
}

class NeonDrift {
  constructor(s) {
    this.s = s; this.t = 0; this.touch = 0;
    this.station = 0;
    try { const v = +localStorage.getItem('nd-station'); if (v >= 0 && v < STATIONS.length) this.station = v | 0; } catch (e) { /* storage blocked */ }
    Object.assign(MUSIC, STATIONS[this.station].music);
    this.sfx = null;                // continuous sounds (squeal, engine, afterburner), made on first use
    this.cam = { s: 0, lat: 0, lz: 0, yaw: 0, y: CAM_H, py: 0, roll: 0, bobX: 0, bobY: 0, init: false, cockpit: false };
    // camera: cockpit (default) or chase cam — C on a keyboard, the VIEW button on touch
    this.view = 'cockpit';
    try { if (localStorage.getItem('nd-view') === 'chase') this.view = 'chase'; } catch (e) { /* storage blocked */ }
    addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat && !(e.target instanceof HTMLInputElement)) this.toggleView(); });
    this.v = { X: new Float32Array(MAXN + 1), Z: new Float32Array(MAXN + 1), Y: new Float32Array(MAXN + 1), TH: new Float32Array(MAXN + 1), CO: new Float32Array(MAXN + 1), SI: new Float32Array(MAXN + 1),
      CY: new Float32Array(MAXN + 1), PX: new Float32Array((MAXN + 1) * 8), PY: new Float32Array((MAXN + 1) * 8), PS: new Float32Array((MAXN + 1) * 8), OK: new Uint8Array((MAXN + 1) * 8),
      n: 0, i0: 0, bk: Array.from({ length: MAXN + 1 }, () => []), sk: Array.from({ length: MAXN + 1 }, () => []) };
    this.q = new Float32Array(7);
    this.needTune = true; this.tuneT = 0; this.dialF = STATIONS[this.station].freq;
    // tilt steering (phones): gamma = left/right lean, calibrated to however the player holds the phone
    this.tiltFrac = 0; this.handTouch = false;
    this.tiltDev = tilt();          // shared phone-tilt reader (asks iOS for permission on a real tap)
    try { if (new URLSearchParams(location.search).has('nddebug')) window.__nd = this; } catch (e) { /* no window */ }   // test hook
    this.startLevel(1, false);      // the attract-mode race behind the title screen
    this.needTune = true; this.tuneT = 0;
  }
  reset() { this.needTune = true; }

  // ── Tilt steering (same feel as Turbo Rush 3D) ──────────────
  get tiltOn() { return this.tiltDev.on; }
  get needTiltPermission() { return this.tiltDev.need; }
  calibrateTilt() { this.tiltDev.calibrate(); }
  /** -1..1 from the phone's lean: ±3° dead zone, full lock at ±20°, gentle near the middle */
  tiltSteer() { return (this.tiltFrac = this.tiltDev.steer(3, 24, 1.5)); }

  themeFor(level, bonus) { return bonus ? THEMES.gold : isIce(level) ? THEMES.ice : THEMES[STATIONS[this.station].theme]; }

  // ── Level setup ─────────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.calibrateTilt();
    this.T = buildTrack(r, level, bonus);
    this.theme = this.themeFor(level, bonus);
    this.voidCol = darken(this.theme.road, 0.42);
    this.grip = isIce(level) ? 0.62 : 1;
    this.sc = Math.min(1.22, s.speed(0.022));
    this.maxV = 600 * this.sc;
    const T = this.T, hw = T.halfW, WW = hw + RUNOFF;
    const straight = (i) => { let m = 0; for (let d = -3; d <= 3; d++) m = Math.max(m, Math.abs(T.k[(i + d + T.N) % T.N])); return m < 0.0016; };
    const pick = (lo, hi, test) => { for (let k = 0; k < 60; k++) { const i = r.int(Math.floor(T.N * lo), Math.floor(T.N * hi)); if (!test || test(i)) return i; } return r.int(Math.floor(T.N * lo), Math.floor(T.N * hi)); };
    // ⚡ boost pads on straights
    this.boosts = [];
    const nb = bonus ? 3 : level >= 4 ? 2 + (level >= 9 ? 1 : 0) : 0;
    for (let i = 0; i < nb; i++) this.boosts.push({ d: pick(0.1 + i / nb * 0.85, 0.1 + (i + 1) / nb * 0.85, straight) * T.step, off: r.range(-0.4, 0.4) * hw, cool: 0 });
    // oil slicks
    this.oils = [];
    // only on corners: 1 corner (L2-5), 2 (L6-11), 3 at most (L12+) — the sharpest bends, well apart, never near the start
    const no = bonus || level < 2 ? 0 : level < 6 ? 1 : level < 12 ? 2 : 3;
    const bends = [];
    for (let i = 0; i < T.N; i++) {
      const a = Math.abs(T.k[i]);
      if (a > 0.002 && a >= Math.abs(T.k[(i + 1) % T.N]) && a >= Math.abs(T.k[(i - 1 + T.N) % T.N]) && i > T.N * 0.1 && i < T.N * 0.94) bends.push(i);
    }
    bends.sort((a, b) => Math.abs(T.k[b]) - Math.abs(T.k[a]));
    const used = [];
    for (const i of bends) {
      if (used.length >= no) break;
      if (used.some((j) => Math.min(Math.abs(i - j), T.N - Math.abs(i - j)) < T.N / 6)) continue;
      used.push(i);
      // just before the apex, on the outside half (where a drift swings wide) — tighten your line to miss it
      const side = -Math.sign(T.k[i]);
      this.oils.push({ d: (i - 2) * T.step, off: side * r.range(0.2, 0.5) * hw, r: 30, blobs: [[0, 0, 1], [r.range(-14, 14), r.range(-12, 12), 0.7], [r.range(-16, 16), r.range(-14, 14), 0.55]] });
    }
    // coins
    this.coins = []; this.lines = [];
    if (bonus) {
      for (let d = 260; d < T.L - 120; d += 300) for (let c = 0; c < 5; c++) { const dd = d + c * 42; this.coins.push({ d: dd, off: Math.sin(dd / 260) * 0.55 * hw, got: false, big: true }); }
    } else {
      // racing-line coins: a trail of small coins through the sharpest corners — wide on the way in, clipping
      // the inside at the apex, wide on the way out. Follow it and you've drifted the perfect line.
      const nl = level < 4 ? 3 : 4, near = (i, j, gap) => Math.min(Math.abs(i - j), T.N - Math.abs(i - j)) < gap;
      const corners = [];
      for (let i = Math.floor(T.N * 0.08); i < T.N * 0.95; i++) {
        const a = Math.abs(T.k[i]);
        if (a > 0.0015 && a >= Math.abs(T.k[(i + 1) % T.N]) && a >= Math.abs(T.k[i - 1])) corners.push(i);
      }
      corners.sort((a, b) => Math.abs(T.k[b]) - Math.abs(T.k[a]));
      const addLine = (i, oily) => {
        const a = Math.abs(T.k[i]);
        let ia = i, ib = i;
        while (ia > i - 12 && Math.abs(T.k[(ia - 1 + T.N) % T.N]) > a * 0.35) ia--;
        while (ib < i + 12 && Math.abs(T.k[(ib + 1) % T.N]) > a * 0.35) ib++;
        const m = Math.min(10, Math.max(i - ia, ib - i) + 3), inside = Math.sign(T.k[i]);   // +k bends towards +offset
        const len = 2 * m * T.step, nc = clamp(Math.round(len / 38), 7, 11);
        const ln = { i, n: nc, got: 0, done: false, end: (i - m) * T.step + len + 20 };
        this.lines.push(ln);
        for (let c = 0; c < nc; c++) {
          const u = c / (nc - 1);
          // a drift arc: turn in tight on the inside, let the slide carry you across the apex and out wide on the
          // exit — where a well-held drift naturally goes. Oily corner (the slick lies on the outside before the
          // apex): hold the inside longer, then let it run out after the slick.
          const e = u * u * (3 - 2 * u), lead = Math.min(1, u / 0.22);    // the first coins lead you across from mid-road
          const arc = oily ? 0.5 - 0.75 * Math.pow(u, 1.6) : 0.5 - 1.0 * e;
          const off = inside * (0.12 + (arc - 0.12) * lead * (2 - lead)) * hw;
          this.coins.push({ d: (i - m) * T.step + u * len, off, got: false, line: ln });
        }
      };
      const spaced = (i) => !this.lines.some((ln) => near(i, ln.i, T.N / 9));
      for (const i of corners) {
        if (this.lines.length >= nl) break;
        if (!used.some((j) => near(i, j, T.N / 12)) && spaced(i)) addLine(i, false);
      }
      // short of lines? use the oil corners too
      for (const i of used) if (this.lines.length < 3 && spaced(i)) addLine(i, true);
      // plus a couple of loose coin snakes on the straights
      for (let l = 0; l < 2; l++) {
        const d0 = pick(0.15 + l * 0.4, 0.45 + l * 0.4, (i) => straight(i) && !this.lines.some((ln) => near(i, ln.i, T.N / 12))) * T.step, ph = r.range(0, TAU);
        for (let c = 0; c < 5; c++) this.coins.push({ d: d0 + c * 44, off: Math.sin(ph + c * 0.7) * 0.5 * hw, got: false });
      }
    }
    // roadside scenery (cosmetic; a fixed pattern so it doesn't touch the RNG)
    this.deco = [];
    for (let d = 100, n = 0; d < T.L - 60; d += 200, n++) for (const side of [-1, 1]) this.deco.push({ kind: 'pillar', d: d + (side > 0 ? 100 : 0), off: side * (WW + 26), n });
    for (let d = 320, n = 0; d < T.L - 260; d += 640, n++) this.deco.push({ kind: 'board', d, off: (n % 2 ? 1 : -1) * (WW + 84), n });
    for (let d = 900, n = 0; d < T.L - 500; d += 1150, n++) {
      const i = Math.round(d / T.step) % T.N;
      if (Math.abs(T.k[i]) < 0.0022) this.deco.push({ kind: 'arch', d, off: 0, n });
    }
    this.deco.push({ kind: 'gantry', d: 0, off: 0, n: 0 });
    this.sunYaw = T.ang[0] + 0.12;
    this.gridOffs = [-2 / 3, -1 / 3, 0, 1 / 3, 2 / 3].map((f) => f * hw);
    this.buildMinimap();
    this.resetRace();
    if (this.needTune && !bonus && !isIce(level)) { this.needTune = false; this.tuneT = TUNE_TIME; this.dialF = STATIONS[this.station].freq; }
    else this.tuneT = 0;
  }

  resetRace() {
    const T = this.T, hw = T.halfW;
    this.timers = []; this.skids = []; this.smoke = []; this.result = null;
    this.count = this.bonus ? 0 : 2.1; this.lastCount = 4;
    this.raceT = 0; this.finishedRivals = 0;
    const p0 = -235, [x, z, h] = at(T, p0, 0.38 * hw);   // a car length further back than the rival ahead, so the cockpit view isn't filled by its bumper
    this.p = { x, z, h, vx: 0, vz: 0, steer: 0, slide: 0, spinT: 0, spinDir: 1, boostT: 0, idx: ((Math.round(p0 / T.step) % T.N) + T.N) % T.N,
      acc: Math.round(p0 / T.step), prog: p0, lat: 0.38 * hw, lapDone: 0, wallHits: 0, drift: 0, driftT: 0, calmT: 0, offroad: false, finished: false, place: 0,
      passed: new Set(), wrongT: 0, lastProg: p0, squeal: 0, bumpT: 0, brake: false, slip: 0, charge: 0, boostMax: 1, ghostT: 0, fullShown: false };
    this.rivals = this.bonus ? [] : RIVALS.map((R, i) => {
      const d = -40 - Math.floor(i / 2) * 70, off = (i % 2 ? 0.38 : -0.38) * hw;   // rows of two; the player starts behind car 3
      const [rx, rz, rh] = at(T, d, off);
      return { ...R, i, d, off, offT: off, v: 0, x: rx, z: rz, h: rh, slip: 0, spinT: 0, boostT: 0, finished: false, retarget: 1 + i * 0.4,
        vmax: this.maxV * BOT_EASE * (0.83 + 0.02 * ((i * 3) % 5) + Math.min(0.08, (this.level - 1) * 0.01)), ahead: true, wasBend: false };
    });
    for (const o of this.oils) o.hit = 0;
    for (const b of this.boosts) b.cool = 0;
    for (const c of this.coins) c.got = false;
    for (const ln of this.lines || []) { ln.got = 0; ln.done = false; }
    this.coinsGot = 0;
    this.cam.init = false;
    this.updateCamera(0);
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

  // ── The car radio (pick the run's colour scheme) ────────────
  setStation(i) {
    i = mod(i, STATIONS.length);
    if (i === this.station) return;
    this.station = i;
    // retune: the new station's track takes over (with a burst of static from the dial)
    Object.assign(MUSIC, STATIONS[i].music);
    const snd = this.s.sound;
    if (snd.musicPlaying) { snd.startMusic(MUSIC); snd.setTempo(MUSIC.bpm * Math.min(1.45, 1 + (this.level - 1) * 0.025)); }
    this.theme = this.themeFor(this.level, this.bonus);
    this.voidCol = darken(this.theme.road, 0.42);
    this.buildMinimap();
    this.s.sound.play('click');
    if (!this.s.sound.muted) this.s.sound.noise({ dur: 0.18, vol: 0.05, freq: 3200, type: 'bandpass' });
  }
  confirmTune() {
    this.tuneT = 0;
    this.calibrateTilt();
    try { localStorage.setItem('nd-station', String(this.station)); } catch (e) { /* storage blocked */ }
    this.s.sound.play('powerup');
    this.s.fx.text(W / 2, H * 0.3, `📻 ${STATIONS[this.station].name}`, { color: this.theme.edge, size: 26, life: 1 });
  }
  toggleView() {
    this.view = this.view === 'cockpit' ? 'chase' : 'cockpit';
    try { localStorage.setItem('nd-view', this.view); } catch (e) { /* storage blocked */ }
    this.s.sound.play('click');
    if (this.s.state === 'playing') this.s.fx.text(W / 2, H * 0.2, this.view === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE CAM', { color: this.theme.edge, size: 22, life: 0.9 });
    this.cam.init = false;
    this.updateCamera(0);
  }
  boostButton() { return { x: 10, y: H - 46, w: 100, h: 34 }; }
  /** fire the drift-charged boost: the whole meter goes in one burst (longer the fuller it was) */
  fireBoost() {
    const p = this.p, s = this.s;
    if (this.count > 0 || this.tuneT > 0 || p.finished || p.spinT > 0 || s.state !== 'playing') return;
    if (p.charge < BOOST_MIN) {
      if (p.boostT <= 0) { s.sound.play('click'); s.fx.text(W / 2, H * 0.24, 'DRIFT TO CHARGE ⚡', { color: '#94a3b8', size: 16, life: 0.7 }); }
      return;
    }
    const dur = 0.6 + p.charge * 1.7;
    p.boostT = Math.max(p.boostT, dur); p.boostMax = Math.max(p.boostT, 0.1);
    const f = 90 + 110 * p.charge; p.vx += Math.sin(p.h) * f; p.vz += Math.cos(p.h) * f;
    const full = p.charge >= 0.999;
    p.charge = 0; p.fullShown = false;
    p.ghostT = Math.max(p.ghostT, 2);          // boosting phases you through rival cars for 2 s
    s.fx.text(W / 2, H * 0.24, full ? 'FULL BOOST!' : 'BOOST!', { color: '#67e8f9', size: full ? 34 : 28, life: 0.8 });
    s.fx.shake(full ? 5 : 3, 0.25);
    s.fx.flash('#67e8f9', full ? 0.22 : 0.12);
    this.boostSound(full);
    if (full) s.unlock('fullboost');
  }
  /** the boost going off: a rushing whoosh, a low thump, a zap and a spray of electric crackles */
  boostSound(full) {
    const snd = this.s.sound;
    if (snd.muted) return;
    snd.noise({ dur: full ? 0.9 : 0.7, vol: 0.16, freq: 350, to: 3800, type: 'bandpass' });
    snd.tone({ freq: 95, to: 38, dur: 0.35, type: 'sine', vol: 0.3 });
    snd.tone({ freq: 1400, to: 180, dur: 0.18, type: 'sawtooth', vol: 0.06 });
    const n = full ? 18 : 11;
    for (let i = 0; i < n; i++) {
      const d = Math.random() * (full ? 0.7 : 0.5);
      snd.noise({ dur: 0.02 + Math.random() * 0.025, vol: 0.05 + Math.random() * 0.08, freq: 3500 + Math.random() * 5000, type: 'highpass', delay: d, pan: Math.random() * 1.4 - 0.7 });
    }
    if (full) [0, 7, 12, 19].forEach((st, i) => snd.tone({ freq: snd.note(76 + st), dur: 0.1, type: 'square', vol: 0.05, delay: 0.05 + i * 0.045 }));
  }

  /** continuous car sounds, steered every frame: engine drone (follows the rev counter), tyre squeal that climbs
   *  in pitch the longer a drift holds, and the afterburner roar while boosting */
  carAudio() {
    const snd = this.s.sound, p = this.p;
    if (snd.muted || this.s.state !== 'playing' || this.tuneT > 0) return;
    if (!this.sfx) this.sfx = {
      engine: snd.voice({ type: 'sawtooth', filter: 'lowpass', q: 3 }),
      engine2: snd.voice({ type: 'square', filter: 'lowpass', q: 1 }),
      squeal: snd.voice({ type: 'sawtooth', noise: true, filter: 'bandpass', q: 9 }),
      roar: snd.voice({ type: null, noise: true, filter: 'lowpass', q: 1 }),
    };
    const spd = Math.hypot(p.vx, p.vz), f = clamp(spd / (this.maxV * 1.32), 0, 0.999);
    const gear = Math.floor(f * 6), rev = this.count > 0 ? 0.15 + 0.2 * Math.abs(Math.sin(this.t * 6)) : 0.25 + 0.75 * (f * 6 - gear) + (p.drifting ? 0.12 : 0);
    const hz = 46 + rev * 95 + gear * 6;
    const loud = this.cam.cockpit ? 1 : 0.7;
    this.sfx.engine.set({ freq: hz, vol: 0.032 * loud, cutoff: 380 + rev * 900 + (p.boostT > 0 ? 500 : 0) });
    this.sfx.engine2.set({ freq: hz * 2.01, vol: 0.01 * loud, cutoff: 700 + rev * 600 });
    // squeal: rises from ~900 Hz to ~2.6 kHz over a long drift, wobbling a little
    const sl = Math.abs(p.slip || 0), sq = p.drifting ? Math.min(1, p.driftT / 3) : 0;
    const sqHz = 900 + sq * 1500 + sl * 400 + Math.sin(this.t * 31) * 40;
    this.sfx.squeal.set({ freq: sqHz * 0.5, cutoff: sqHz, vol: p.drifting ? 0.03 + 0.03 * sq + Math.min(0.03, sl * 0.05) : 0 });
    // afterburner
    this.sfx.roar.set({ cutoff: 700 + 500 * Math.random(), vol: p.boostT > 0 ? 0.07 * Math.min(1, p.boostT / 0.4) : 0 });
  }

  /** underglow / meter colour: pink when empty → violet → cyan when full (gold run: amber → yellow) */
  chargeCol(c) {
    if (this.s.gold) return mixHex('#f59e0b', '#fef08a', c);
    return c < 0.5 ? mixHex('#ff4fa3', '#a78bfa', c * 2) : mixHex('#a78bfa', '#22d3ee', (c - 0.5) * 2);
  }
  viewButton() { return { x: W - 100, y: H - 46, w: 90, h: 34 }; }
  tuneButtons() { return STATIONS.map((_, i) => ({ x: 52 + i * 128, y: 352, w: 120, h: 74 })); }

  // ── Input ───────────────────────────────────────────────────
  /** touch: with tilt on, the screen edges still steer and the middle is the handbrake */
  touchAt(x) {
    // without tilt: press further out for a sharper turn, nearer the middle for a gentle one
    if (!this.tiltOn) { const d = (x - W / 2) / (W * 0.36); this.touch = Math.sign(d) * clamp(0.45 + Math.abs(d) * 0.55, 0.45, 1); this.handTouch = false; return; }
    this.touch = x < W * 0.2 ? -1 : x > W * 0.8 ? 1 : 0;
    this.handTouch = this.touch === 0;
  }
  onAction(a, x, y) {
    if (this.tuneT > 0) {
      if (a === 'left') this.setStation(this.station - 1);
      else if (a === 'right') this.setStation(this.station + 1);
      else if (a === 'action' || a === 'up') this.confirmTune();
      else if (a === 'press') {
        const b = this.tuneButtons().findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
        if (b >= 0) { this.setStation(b); this.confirmTune(); }
      }
      return;
    }
    if (a === 'up' && !this.s.input.pointer.down) { this.fireBoost(); return; }
    if (a === 'press') {
      const b = this.viewButton(), bb = this.boostButton();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this.toggleView(); this.viewPress = true; return; }
      if (x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h) { this.fireBoost(); this.viewPress = true; return; }
      this.touchAt(x);
    }
    else if (a === 'release' && this.viewPress) { this.viewPress = false; this.touch = 0; this.handTouch = false; }
    else if (a === 'release') { this.touch = 0; this.handTouch = false; }
  }
  onPointerMove(x, y, down) { if (down && this.tuneT <= 0 && !this.viewPress) this.touchAt(x); }
  onLifeLost() { this.touch = 0; this.handTouch = false; this.resetRace(); }

  after(t, fn) { this.timers.push({ t, fn }); }

  /** screen position of a point on the track (for floating text etc.) */
  scr(d, off, h = 0) { const q = this.proj(d, off, h); return q ? [q[0], q[1] + this.cam.py] : [W / 2, H * 0.55]; }

  // ── Simulation ──────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); if (this.s.state !== 'playing') return; } }
    this.timers = this.timers.filter((tm) => !tm.done);
    this.dialF += (STATIONS[this.station].freq - this.dialF) * Math.min(1, dt * 9);
    if (this.tuneT > 0) {
      this.tuneT -= dt;
      if (this.tuneT <= 0) this.confirmTune();
      this.updateCamera(dt);
      return;
    }
    if (this.count > 0) {
      const before = Math.ceil(this.count / 0.7);
      this.count -= dt;
      const now = Math.ceil(this.count / 0.7);
      if (this.count <= 0) { this.s.sound.play('go'); this.s.fx.text(W / 2, H * 0.3, 'GO!', { color: this.theme.edge, size: 64, life: 0.8 }); }
      else if (now !== before) this.s.sound.play('tick');
      this.updateCamera(dt);
      this.carAudio();                 // revving on the line
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
    this.carAudio();
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
      this.updateCamera(dt);
    }
  }

  steerInput() {
    const i = this.s.input;
    return clamp((i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0) + this.touch + this.tiltSteer(), -1, 1);
  }

  updatePlayer(dt, auto = false) {
    const p = this.p, T = this.T, s = this.s;
    let steerIn = 0, hand = false;
    if (auto || p.finished) {
      const [ax, az] = at(T, p.prog + 140, 0);
      steerIn = clamp(wrapA(Math.atan2(ax - p.x, az - p.z) - p.h) * 3, -1, 1);
    } else {
      steerIn = this.steerInput();
      hand = s.input.isDown('down') || s.input.isDown('action') || this.handTouch;
    }
    p.brake = hand;
    // ease the wheel: turning in builds over ~0.2 s, letting go returns a little faster (keyboard taps don't snap)
    const steerRate = Math.abs(steerIn) > Math.abs(p.steer) && Math.sign(steerIn) === Math.sign(p.steer || steerIn) ? 6.5 : 9;
    p.steer += (steerIn - p.steer) * Math.min(1, dt * steerRate);
    p.lockT = Math.abs(p.steer) > 0.6 ? (p.lockT || 0) + dt : 0;
    const fx = Math.sin(p.h), fz = Math.cos(p.h), rx = fz, rz = -fx;
    let vf = p.vx * fx + p.vz * fz, vr = p.vx * rx + p.vz * rz;
    const maxV = this.maxV * (p.offroad ? 0.66 : 1) * (p.boostT > 0 ? 1.32 : 1);
    if (vf < maxV) vf += 520 * this.sc * dt * (1 - Math.max(0, vf) / maxV * 0.6);
    else vf -= (vf - maxV) * (p.offroad ? 3 : 1.4) * dt;
    if (hand) vf -= 240 * dt;
    // steering + the slide that turns into a drift
    const sf = clamp(vf / 220, -1, 1);
    // a drift needs full lock held for a moment at speed (or the handbrake) — not just any firm turn
    const wantSlide = (p.lockT > 0.12 && vf > maxV * 0.5) || (hand && vf > 200);
    p.slide = clamp(p.slide + (wantSlide ? 2.6 : -2.2) * dt, 0, 1);
    const sl = p.slide * p.slide * (3 - 2 * p.slide);          // smoothstep: the tail eases out and back in
    if (p.spinT > 0) {
      p.spinT -= dt;
      p.h += p.spinDir * 9 * dt * Math.min(1, p.spinT / 0.5 + 0.2);
      vr *= Math.exp(-0.7 * dt);
    } else {
      p.h += p.steer * 2.2 * (1 + sl * 0.62) * sf * dt;
      let grip = (10 + (2 - 10) * sl) * this.grip;
      // D. hold the angle: past ~40° of slide the tyres bite progressively, so a drift settles into a long arc
      //    instead of snapping round into a spin
      const slipNow = Math.abs(Math.atan2(vr, Math.max(1, Math.abs(vf))));
      if (slipNow > 0.7) grip += (slipNow - 0.7) * 14;
      vr *= Math.exp(-grip * dt);
      // Steering assist (makes it forgiving on keys, touch and tilt): a gentle hand on the wheel that
      // lines the car up with the track and, near the edge, eases it back towards the middle.
      // It never fights a deliberate drift much, and it's strongest when you're not steering.
      if (!auto && !p.finished) {
        const th = Math.atan2(T.tx[p.idx], T.tz[p.idx]);
        const edge = clamp((Math.abs(p.lat) - T.halfW * 0.55) / (T.halfW * 0.6), 0, 1);
        const want = th - Math.sign(p.lat) * edge * 0.3;
        const e = wrapA(want - p.h);
        if (Math.abs(e) < 0.9) {
          const k = (Math.abs(steerIn) < 0.1 ? 2.2 : 0.9) * (1 - sl * 0.7) + edge * 1.4;
          p.h += clamp(e, -0.4, 0.4) * k * dt;
        }
      }
    }
    vf -= Math.abs(vr) * 0.3 * dt;
    const nfx = Math.sin(p.h), nfz = Math.cos(p.h);
    // keep velocity in world space: rebuild from the old frame, the new heading picks up the slip next step
    p.vx = fx * vf + rx * vr; p.vz = fz * vf + rz * vr;
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.boostT > 0) p.boostT -= dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    if (p.ghostT > 0) p.ghostT -= dt;
    // where are we on the track?
    let bi = p.idx, bd = 1e12;
    for (let o = -10; o <= 10; o++) { const i = (p.idx + o + T.N) % T.N, dx = p.x - T.x[i], dz = p.z - T.z[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bi = i; } }
    if (bd > 260 * 260) for (let i = 0; i < T.N; i++) { const dx = p.x - T.x[i], dz = p.z - T.z[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bi = i; } }
    let dI = bi - p.idx; if (dI > T.N / 2) dI -= T.N; if (dI < -T.N / 2) dI += T.N;
    p.acc += dI; p.idx = bi;
    const lat = (p.x - T.x[bi]) * T.nx[bi] + (p.z - T.z[bi]) * T.nz[bi];
    p.prog = p.acc * T.step + (p.x - T.x[bi]) * T.tx[bi] + (p.z - T.z[bi]) * T.tz[bi];
    p.lat = lat;
    p.offroad = Math.abs(lat) > T.halfW;
    // the wall
    // the wall stops the car's body, not its centre: a car angled into the wall reaches further sideways
    const rel = wrapA(p.h - Math.atan2(T.tx[bi], T.tz[bi]));
    const reach = Math.min(CAR_HALF, 15 * Math.abs(Math.cos(rel)) + CAR_HALF * Math.abs(Math.sin(rel)));
    const lim = T.halfW + RUNOFF - reach - 1;
    if (Math.abs(lat) > lim) {
      const sg = Math.sign(lat), push = Math.abs(lat) - lim, nx = T.nx[bi] * sg, nz = T.nz[bi] * sg;
      p.x -= nx * push; p.z -= nz * push; p.lat -= sg * push;
      const vn = p.vx * nx + p.vz * nz;
      if (vn > 0) {
        p.vx -= nx * vn * 1.35; p.vz -= nz * vn * 1.35;
        // glancing touches only scrub a little speed; a head-on hit still costs
        const k = vn > 220 ? 0.82 : vn > 120 ? 0.9 : 0.97; p.vx *= k; p.vz *= k;
        p.h += clamp(wrapA(Math.atan2(T.tx[bi], T.tz[bi]) - p.h), -0.25, 0.25) * 0.6;   // turned back along the wall
        if (vn > 100 && !auto && !p.finished) {
          const [sx, sy] = this.scr(p.prog, p.lat + sg * CAR_R, 10);
          s.fx.burst(sx, sy, { color: this.theme.wall, count: Math.min(24, vn / 12 | 0), speed: 220 });
          s.sound.play(vn > 200 ? 'hit' : 'metal');
          if (vn > 150) s.fx.shake(Math.min(8, vn / 50), 0.2);
          p.wallHits++;
          if (vn > 150) {                                   // a real knock ends the drift; a scrape doesn't
            if (p.drift > 0 && p.driftT > 0.25) { s.fx.text(sx, sy - 40, 'DRIFT LOST', { color: '#fb7185', size: 20 }); s.resetCombo(); }
            p.drift = 0; p.driftT = 0;
          }
        }
      }
    }
    // drifting
    if (auto) return;
    const spd = Math.hypot(p.vx, p.vz), slip = Math.atan2(p.vx * Math.cos(p.h) - p.vz * Math.sin(p.h), p.vx * nfx + p.vz * nfz);
    p.slip = slip;
    const drifting = p.spinT <= 0 && !p.offroad && spd > 220 && Math.abs(slip) > (p.drifting ? 0.1 : 0.15);
    p.drifting = drifting;
    if (drifting) {
      p.drift += Math.abs(slip) * spd * dt * 0.06 * (p.boostT > 0 ? 1.5 : 1);
      p.driftT += dt; p.calmT = 0;
      // drifting charges the boost meter (not while the boost is burning)
      if (p.boostT <= 0) {
        const seg0 = Math.floor(p.charge * 10);
        p.charge = Math.min(1, p.charge + Math.abs(slip) * spd * dt * 0.003);
        const seg1 = Math.floor(p.charge * 10);
        if (seg1 > seg0 && seg1 < 10 && !s.sound.muted) s.sound.tone({ freq: s.sound.note(76 + seg1 * 2), dur: 0.07, type: 'triangle', vol: 0.06 });
        if (p.charge >= 1 && !p.fullShown) {
          p.fullShown = true;
          const mob = matchMedia('(pointer: coarse)').matches;
          s.fx.text(W / 2, H * 0.2, mob ? 'BOOST FULL — TAP ⚡ BOOST' : 'BOOST FULL — PRESS ↑', { color: '#22d3ee', size: 20, life: 1.2 });
          s.sound.play('golden');
        }
      }
      if (p.driftT > 3) s.unlock('drift3s');
      this.tyreMarks(p, s.gold ? '#fde047' : '#ff4fa3', true);
    } else if (p.drift > 0) {
      p.calmT += dt;
      if (p.calmT > 0.3) this.bankDrift();
    }
    if (p.offroad && spd > 150 && Math.random() < dt * 30) this.puff(p.prog - CAR_HALF, p.lat, '#5b4a7a', 0.6);
  }

  bankDrift() {
    const p = this.p, s = this.s;
    if (p.driftT >= 0.45 && p.drift >= 3) {
      const pts = Math.round(p.drift) * 10 * (1 + (this.level - 1) * 0.1) | 0;
      const [sx, sy] = this.scr(p.prog, p.lat, 40);
      s.award(pts, sx, sy - 40, { chain: true, color: '#ff4fa3' });
      s.sound.play('combo', Math.min(6, s.comboCount));
      if (p.driftT > 1.6) s.fx.text(sx, sy - 74, p.driftT > 2.6 ? 'MEGA DRIFT!' : 'GREAT DRIFT!', { color: '#fde047', size: 22 });
      if (p.driftT >= 0.8 && !p.offroad) {           // a good drift tops the meter up a little extra
        p.charge = Math.min(1, p.charge + Math.min(0.12, p.driftT * 0.04));
      }
    }
    p.drift = 0; p.driftT = 0; p.calmT = 0;
  }

  /** tyre trails, stored in track space (distance, offset) so the road renderer can lay them on the asphalt */
  tyreMarks(car, col, player) {
    if (this.s.lowDetail && !player) return;
    const T = this.T;
    const d = player ? car.prog : car.d, off = player ? car.lat : car.off;
    const rel = player ? wrapA(car.h - at(T, d)[2]) : car.slip;
    const cr = Math.cos(rel), sr = Math.sin(rel), back = CAR_HALF - 0.82 * CAR_U;
    const pts = [-0.9, 0.9].map((w) => [d - sr * w * CAR_U - cr * back, off + cr * w * CAR_U - sr * back]);
    if (car.lastMarks && this.t - car.lastMarkT < 0.06) {
      for (let i = 0; i < 2; i++) this.skids.push({ d1: car.lastMarks[i][0], o1: car.lastMarks[i][1], d2: pts[i][0], o2: pts[i][1], t: this.t, c: col });
      if (this.skids.length > (this.s.lowDetail ? 300 : 800)) this.skids.splice(0, 40);
    }
    car.lastMarks = pts; car.lastMarkT = this.t;
    if (Math.random() < (this.s.lowDetail ? 0.15 : 0.45)) { const w = pts[Math.random() < 0.5 ? 0 : 1]; this.puff(w[0], w[1], '#d8d4ff', 1); }
  }
  puff(d, off, c, a) {
    if (this.smoke.length > (this.s.lowDetail ? 40 : 110)) return;
    this.smoke.push({ d, off, y: 4, vd: (Math.random() - 0.5) * 30, vo: (Math.random() - 0.5) * 30, vy: 18 + Math.random() * 20, life: 0, max: 0.7 + Math.random() * 0.5, r: 8 + Math.random() * 6, c, a });
  }

  updateRival(rv, dt, auto = false) {
    const T = this.T, p = this.p;
    if (rv.spinT > 0) rv.spinT -= dt;
    if (rv.boostT > 0) rv.boostT -= dt;
    // corner speed from the sharpest bend coming up
    let kk = 0, kSign = 0;
    for (let o = 1; o <= 9; o++) { const i = ((Math.floor(rv.d / T.step) + o) % T.N + T.N) % T.N, a = Math.abs(T.k[i]); if (a > kk) { kk = a; kSign = Math.sign(T.k[i]); } }
    let rb = 1;
    const gap = p.prog - rv.d;                       // > 0: the player is ahead of this car
    if (!auto && !this.bonus && !p.finished) {
      // the pack hunts a leader down: the further ahead you get, the harder they push (more so on later levels)
      const maxCatch = 0.9 * Math.min(0.26, 0.15 + 0.015 * this.level);
      if (gap > 80) { const u = clamp((gap - 80) / 1000, 0, 1); rb = 1 + maxCatch * u * u * (3 - 2 * u); }
      else if (gap < -700) rb = 1 - Math.min(0.05, (-gap - 700) / 8000);
    }
    const LAT = 1180 * this.sc * this.sc * rb * rb;    // pushing harder means braver cornering too
    // they drift-boost out of bends as well (more often on later levels)
    const bend = kk > 0.0028;
    if (rv.wasBend && kk < 0.0015 && rv.spinT <= 0 && !auto && Math.random() < 0.9 * Math.min(0.85, 0.15 + 0.08 * this.level)) rv.boostT = Math.max(rv.boostT, 0.8);
    if (bend) rv.wasBend = true; else if (kk < 0.0015) rv.wasBend = false;
    let target = Math.min(rv.vmax * rb * (rv.boostT > 0 ? 1.25 : 1), Math.sqrt(LAT / Math.max(kk, 1e-4)));
    if (rv.finished) target = Math.min(target, this.maxV * 0.6);
    if (rv.spinT > 0) target = 120;
    rv.v += clamp(target - rv.v, -720 * dt, 380 * this.sc * dt);
    // racing line: drift to the inside of bends, wander on straights, keep out of the player's way
    rv.retarget -= dt;
    const hw = this.T.halfW;
    if (rv.retarget <= 0) { rv.retarget = 1.2 + ((rv.i * 7 + Math.floor(rv.d)) % 13) / 10; rv.wander = (((rv.i * 37 + Math.floor(rv.d / 50)) % 11) / 10 - 0.5) * 0.8; }
    let offT = kk > 0.0022 ? -kSign * 0.5 * hw : (rv.wander || 0) * hw;
    let lane = 70;
    if (!auto) {
      const ahead = p.prog - rv.d;
      if (ahead > 0 && ahead < 110) { const [, , , , nx, nz] = at(T, rv.d); const pl = (p.x - rv.x) * nx + (p.z - rv.z) * nz; if (Math.abs(pl) < 50) offT = clamp(rv.off + (pl > 0 ? -70 : 70), -0.7 * hw, 0.7 * hw); }
      // defend: from level 3, a car just ahead of you on a straight moves across to cover your line
      else if (this.level >= 3 && ahead < -25 && ahead > -200 && kk < 0.0022 && rv.spinT <= 0 && p.ghostT <= 0) {
        offT = clamp(p.lat, -0.7 * hw, 0.7 * hw); lane = 55 + this.level * 4;
      }
    }
    rv.offT = offT;
    rv.off += clamp(rv.offT - rv.off, -lane * dt, lane * dt);
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
      if (d < CAR_R * 2 && d > 0.01 && p.ghostT > 0) continue;      // ghosting: drive straight through
      if (d < CAR_R * 2 && d > 0.01 && (p.drifting || p.slide > 0.5) && rv.spinT <= 0 && !rv.finished) {
        // swung the tail into them: THEY spin, you keep going
        rv.spinT = 1.1; rv.v *= 0.65;
        p.ghostT = 1.2;
        const nx = dx / d, nz = dz / d; p.x += nx * (CAR_R * 2 - d) * 0.5; p.z += nz * (CAR_R * 2 - d) * 0.5;
        const [sx, sy] = this.scr((p.prog + rv.d) / 2, (p.lat + rv.off) / 2, 20);
        s.award(120 * this.level, sx, sy - 30, { chain: true, color: rv.glow });
        s.fx.text(sx, sy - 64, `SPUN ${rv.name}!`, { color: rv.glow, size: 22 });
        s.fx.burst(sx, sy, { color: rv.glow, count: 22, speed: 260 });
        s.fx.shake(4, 0.2);
        s.sound.play('hit');
        if (!s.sound.muted) s.sound.noise({ dur: 0.45, vol: 0.1, freq: 2600, to: 500, type: 'bandpass' });
        p.charge = Math.min(1, p.charge + 0.15);
        s.unlock('spinout');
        continue;
      }
      if (d < CAR_R * 2 && d > 0.01) {
        const nx = dx / d, nz = dz / d, over = CAR_R * 2 - d;
        p.x += nx * over * 0.6; p.z += nz * over * 0.6;
        const [, , , , tnx, tnz] = at(T, rv.d);
        rv.off = clamp(rv.off - (nx * tnx + nz * tnz) * over * 0.4, -T.halfW - RUNOFF + CAR_R, T.halfW + RUNOFF - CAR_R);
        // only take away the speed you were closing on them with (not your whole speed), so a nudge from behind
        // leaves you running at their pace instead of stopping you dead
        const rh = at(T, rv.d)[2], rvx = Math.sin(rh) * rv.v, rvz = Math.cos(rh) * rv.v;
        const vn = (p.vx - rvx) * nx + (p.vz - rvz) * nz;
        if (vn < 0) { p.vx -= nx * vn * 1.05; p.vz -= nz * vn * 1.05; }
        const fwd = p.prog < rv.d;
        if (p.bumpT <= 0) {
          // rear-ended them: they get a shove, you lose a little — once per knock, not every frame you touch
          if (fwd) { rv.v += 30; p.vx *= 0.97; p.vz *= 0.97; } else rv.v *= 0.96;
          p.bumpT = 0.35; s.sound.play('metal');
          const [sx, sy] = this.scr((p.prog + rv.d) / 2, (p.lat + rv.off) / 2, 12);
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
        const [sx, sy] = this.scr(p.prog, p.lat, 40);
        s.fx.text(sx, sy - 50, 'SPUN OUT!', { color: '#fb7185', size: 24 });
        s.sound.noise({ dur: 0.5, vol: 0.12, freq: 1800, to: 300, type: 'bandpass' });
        p.drift = 0; p.driftT = 0; s.resetCombo();
        p.charge *= 0.6;                              // spinning out spills some of the boost
      }
      for (const rv of this.rivals) if (rv.spinT <= 0 && Math.abs(((rv.d - o.d) % T.L + T.L) % T.L) < 18 && Math.abs(rv.off - o.off) < o.r + 8) rv.spinT = 0.7;
    }
    for (const b of this.boosts) {
      if (b.cool > 0) b.cool -= dt;
      const [bx, bz] = at(T, b.d, b.off);
      if (b.cool <= 0 && Math.hypot(p.x - bx, p.z - bz) < 40) {
        b.cool = 1; p.boostT = Math.max(p.boostT, 1.4); p.boostMax = Math.max(p.boostT, 1.4);
        const f = 140; p.vx += Math.sin(p.h) * f; p.vz += Math.cos(p.h) * f;
        const [sx, sy] = this.scr(p.prog, p.lat, 40);
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
      if (Math.hypot(p.x - cx, p.z - cz) < (c.line ? 34 : 30)) {
        c.got = true; this.coinsGot++; left--;
        const [sx, sy] = this.scr(c.d, c.off, 16);
        if (this.bonus) s.award(25 * this.level, sx, sy - 16, { chain: true, color: '#fde047' });
        else s.award((c.line ? 10 : 15) * this.level, sx, sy - 16, { color: '#fde047' });
        s.sound.play('coin', Math.min(10, c.line ? c.line.got : s.comboCount));
        s.fx.burst(sx, sy, { color: c.line ? '#67e8f9' : '#fde047', count: c.line ? 5 : 8, speed: 120 });
        if (c.line) c.line.got++;
      }
    }
    // a corner trail is judged once you're past its last coin: all of it = perfect, all but one or two = great
    if (!this.bonus) {
      const pr = p.prog - p.lapDone * T.L;
      for (const ln of this.lines) {
        if (ln.done || pr < ln.end || pr > ln.end + 400) continue;
        ln.done = true;
        const miss = ln.n - ln.got;
        if (miss > 2) continue;
        const perfect = miss === 0;
        s.fx.text(W / 2, H * 0.27, perfect ? 'PERFECT LINE!' : 'GREAT LINE!', { color: '#67e8f9', size: perfect ? 30 : 24, life: 1.1 });
        s.award((perfect ? 150 : 60) * this.level, W / 2, H * 0.33, { color: '#67e8f9' });
        if (p.boostT <= 0) p.charge = Math.min(1, p.charge + (perfect ? 0.3 : 0.12));
        s.sound.play(perfect ? 'golden' : 'coin', 6);
        if (perfect) s.unlock('perfectline');
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
      for (const c of this.coins) if (c.line) c.got = false;
      for (const ln of this.lines || []) { ln.got = 0; ln.done = false; }
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
        const [sx, sy] = this.scr(p.prog, p.lat, 40);
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
    s.award(([600, 350, 180][p.place - 1] || 0) * this.level, W / 2, H * 0.34);
    if (p.place === 1) { s.unlock('winner'); if (p.wallHits === 0) s.unlock('clean'); }
    this.after(1.4, () => s.completeLevel());
  }

  particles(dt) {
    for (const m of this.smoke) { m.life += dt; m.d += m.vd * dt; m.off += m.vo * dt; m.y += m.vy * dt; m.r += 16 * dt; }
    this.smoke = this.smoke.filter((m) => m.life < m.max);
    if (this.skids.length && this.t - this.skids[0].t > 5) this.skids.splice(0, 20);
  }

  // ── Chase camera ────────────────────────────────────────────
  updateCamera(dt) {
    const c = this.cam, T = this.T, st = this.s.state, p = this.p;
    const cockpit = this.view === 'cockpit' && st !== 'title';
    if (cockpit !== c.cockpit) { c.cockpit = cockpit; c.init = false; }
    let d, lat;
    if (st === 'title' && this.rivals.length) { const rv = this.rivals[2]; d = rv.d; lat = rv.off; }
    else { d = p.prog; lat = p.lat; }
    const k = Math.min(1, dt * 8);
    if (cockpit) {
      // the driver's eyes: look where the car points (so a drift swings the world round you), but never so far
      // off the road's line that it leaves the view
      const trk = at(T, d)[2];
      const yaw = trk + 0.75 * Math.tanh(wrapA(p.h - trk) / 0.75);      // a soft limit, not a hard stop
      c.s = d - CP_BACK;
      const ty = elev(T, d) + CP_H;
      // look up a climb / down a dip (the whole world is shifted on screen)
      const slope = (elev(T, d + 160) - elev(T, d - 20)) / 180;
      const tpy = clamp(slope * F * 0.6, -70, 70);
      // body roll into the turn, head bob on kerbs, grass, knocks and while the tail is out
      const spd = Math.hypot(p.vx, p.vz), kerb = Math.abs(p.lat) > T.halfW - 10 && spd > 120;
      // rumble (kerbs, grass) is a fast buzz; a drift is a slow sway; knocks are a short jolt
      const rumble = p.offroad ? 2.2 : kerb ? 1.4 : 0, sway = (p.drifting ? 1.4 : 0) + (p.spinT > 0 ? 2 : 0), jolt = p.bumpT > 0 ? 3 * p.bumpT / 0.35 : 0;
      const troll = -p.steer * 0.03 - clamp(p.slip || 0, -0.6, 0.6) * 0.05;
      if (!c.init || dt <= 0) { c.yaw = yaw; c.y = ty; c.py = tpy; c.roll = troll; c.bobX = c.bobY = 0; c.rumble = c.sway = 0; c.init = true; }
      else {
        c.yaw = wrapA(c.yaw + wrapA(yaw - c.yaw) * Math.min(1, dt * 8));
        c.y += (ty - c.y) * Math.min(1, dt * 12);
        c.py += (tpy - c.py) * Math.min(1, dt * 4);
        c.roll += (troll - c.roll) * Math.min(1, dt * 4);
        c.rumble += (rumble - c.rumble) * Math.min(1, dt * 10);
        c.sway += (sway - c.sway) * Math.min(1, dt * 3);
        const t = this.t, v = spd / Math.max(1, this.maxV);
        // layered sines = smooth "noise": no frame-to-frame jitter
        c.bobX = c.rumble * (0.6 * Math.sin(t * 47) + 0.4 * Math.sin(t * 71 + 1.3)) + c.sway * Math.sin(t * 2.3) * 1.2 + jolt * Math.sin(t * 38);
        c.bobY = c.rumble * (0.6 * Math.sin(t * 53 + 0.7) + 0.4 * Math.sin(t * 89)) + c.sway * Math.sin(t * 3.1 + 0.5) * 0.8 + jolt * Math.sin(t * 43 + 2)
          + Math.sin(t * 9) * 0.5 * v;
      }
      // put the eye at the car's real sideways position (across the road, as seen along the view direction)
      const th0 = clamp(wrapA(trk - c.yaw), -1.25, 1.25);
      c.lat = lat * Math.cos(th0); c.lz = -lat * Math.sin(th0);
    } else {
      const yaw = at(T, d + 40)[2], ty = Math.max(elev(T, d - CAMB), elev(T, d)) + CAM_H;
      if (!c.init || dt <= 0) { c.yaw = yaw; c.lat = lat * 0.88; c.y = ty; c.init = true; }
      else {
        c.yaw = wrapA(c.yaw + wrapA(yaw - c.yaw) * Math.min(1, dt * 7));
        c.lat += (lat * 0.88 - c.lat) * Math.min(1, dt * 6);
        c.y += (ty - c.y) * k;
      }
      c.s = d - CAMB; c.lz = 0; c.py = 0; c.roll = 0; c.bobX = c.bobY = 0;
    }
    this.buildView();
  }

  /** lay the road out ahead of the camera: per sample a local position (x across, z ahead, y up) */
  buildView() {
    const T = this.T, c = this.cam, v = this.v, N = T.N;
    const n = this.s.lowDetail ? 110 : 165;
    const i0 = Math.floor(c.s / T.step);
    v.n = n; v.i0 = i0;
    let x = 0, z = 0;
    for (let k = 0; k <= n; k++) {
      const ii = mod(i0 + k, N), th = clamp(wrapA(T.ang[ii] - c.yaw), -1.25, 1.25);
      if (k === 0) { const back = c.s - i0 * T.step; x = -Math.sin(th) * back; z = -Math.max(0.35, Math.cos(th)) * back; }
      else { const tm = (v.TH[k - 1] + th) / 2; x += Math.sin(tm) * T.step; z += Math.max(0.35, Math.cos(tm)) * T.step; }
      v.X[k] = x; v.Z[k] = z - c.lz; v.Y[k] = T.y[ii]; v.TH[k] = th; v.CO[k] = Math.cos(th); v.SI[k] = Math.sin(th);
      v.CY[k] = v.Z[k] > NEAR ? HZ + (c.y - T.y[ii]) * F / v.Z[k] : 1e6;
    }
  }

  /** project a track point (distance d, sideways offset, height) → [sx, sy, scale, depth, roadAngle, k, groundY] or null */
  proj(d, off, h = 0) {
    const T = this.T, c = this.cam, v = this.v;
    let rel = mod(d - c.s, T.L); if (rel > T.L - 400) rel -= T.L;
    const kf = (c.s + rel - v.i0 * T.step) / T.step, k = Math.floor(kf);
    if (k < 0 || k >= v.n) return null;
    const f = kf - k, k1 = k + 1;
    const th = v.TH[k] + (v.TH[k1] - v.TH[k]) * f;
    const X = v.X[k] + (v.X[k1] - v.X[k]) * f, Z = v.Z[k] + (v.Z[k1] - v.Z[k]) * f, Y = v.Y[k] + (v.Y[k1] - v.Y[k]) * f;
    const pz = Z - off * Math.sin(th);
    if (pz < NEAR) return null;
    const sc = F / pz, q = this.q;
    q[0] = W / 2 + (X + off * Math.cos(th) - c.lat) * sc; q[1] = HZ + (c.y - Y - h) * sc; q[2] = sc; q[3] = pz; q[4] = th; q[5] = k; q[6] = Y;
    return q;
  }
  /** like proj() but returns a fresh [sx, sy, scale] (safe to hold several at once) */
  pp(d, off, h = 0) { const q = this.proj(d, off, h); return q ? [q[0], q[1], q[2]] : null; }
  /** which road segment (bucket) a distance falls in, or -1 */
  kOf(d) {
    const T = this.T, c = this.cam, v = this.v;
    let rel = mod(d - c.s, T.L); if (rel > T.L - 400) rel -= T.L;
    const k = Math.floor((c.s + rel - v.i0 * T.step) / T.step);
    return k >= 0 && k < v.n ? k : -1;
  }

  // ── Drawing ─────────────────────────────────────────────────
  render(ctx) {
    const T = this.T, th = this.theme, lo = this.s.lowDetail, c = this.cam, v = this.v, n = v.n, N = T.N;
    if (!v.n) this.buildView();
    const cockpit = c.cockpit;
    // cockpit: the world tilts and bobs with the car (the cockpit frame is drawn on top, steady)
    ctx.save();
    if (cockpit) {
      ctx.fillStyle = th.sky[0]; ctx.fillRect(0, 0, W, HZ);
      ctx.fillStyle = th.gnd[0]; ctx.fillRect(0, HZ, W, H - HZ);
      ctx.translate(W / 2 + c.bobX, HZ + c.bobY); ctx.rotate(c.roll); ctx.scale(1.04, 1.04); ctx.translate(-W / 2, -HZ + c.py);
    }
    this.drawSky(ctx);
    const hw = T.halfW, WW = hw + RUNOFF;
    const OFFS = [-WW, -hw - 12, -hw, -hw / 3, hw / 3, hw, hw + 12, WW];
    // project the road's cross-section points for every sample
    for (let k = 0; k <= n; k++) {
      const co = v.CO[k], si = v.SI[k];
      for (let j = 0; j < 8; j++) {
        const o = OFFS[j], pz = v.Z[k] - o * si, idx = k * 8 + j;
        if (pz < NEAR) { v.OK[idx] = 0; continue; }
        const sc = F / pz;
        v.OK[idx] = 1; v.PS[idx] = sc;
        v.PX[idx] = W / 2 + (v.X[k] + o * co - c.lat) * sc;
        v.PY[idx] = HZ + (c.y - v.Y[k]) * sc;
      }
    }
    // sort everything that stands on the road into its segment
    for (let k = 0; k <= n; k++) { v.bk[k].length = 0; v.sk[k].length = 0; }
    const add = (d, z, fn) => { const k = this.kOf(d); if (k >= 0) v.bk[k].push({ z, fn }); };
    const p = this.p, st = this.s.state, gold = this.s.gold;
    for (const rv of this.rivals) add(rv.d - CAR_HALF - 14, rv.d, () => this.drawRacer(ctx, { d: rv.d, off: rv.off, h: rv.h, pal: palette(rv.paint, { stripe: rv.stripe, glass: '#0b1222' }), glow: rv.glow, lights: { brake: rv.spinT > 0 }, roll: -rv.slip * 0.12, name: rv.name, boost: rv.boostT > 0 }));
    if (st !== 'title' && !cockpit) add(p.prog - CAR_HALF - 14, p.prog, () => this.drawRacer(ctx, { d: p.prog, off: p.lat, h: p.h, pal: palette(gold ? '#fbbf24' : '#f43f5e', { stripe: gold ? '#fff7ed' : '#f8fafc', glass: '#140a1a', dark: gold ? '#78350f' : '#111827' }),
      glow: this.chargeCol(p.charge), ghost: p.ghostT > 0, lights: { brake: p.brake }, roll: -p.steer * 0.06 - (p.slip || 0) * 0.08, name: null, boost: p.boostT > 0, player: true }));
    for (const dc of this.deco) {
      if (lo && dc.kind === 'pillar' && dc.n % 2) continue;
      add(dc.d, dc.d - 0.5, () => this.drawDeco(ctx, dc));
    }
    for (const o of this.oils) add(o.d - o.r, o.d + 1e5, () => this.drawOil(ctx, o));
    for (const b of this.boosts) add(b.d - 26, b.d + 1e5, () => this.drawPad(ctx, b));
    for (const cn of this.coins) if (!cn.got) add(cn.d, cn.d, () => this.drawCoin(ctx, cn));
    for (const m of this.smoke) add(m.d, m.d - 1, () => this.drawSmoke(ctx, m));
    for (const sk of this.skids) { const k = this.kOf(Math.max(sk.d1, sk.d2)); if (k >= 0) v.sk[k].push(sk); }

    // the road, far → near, so hills and crests hide what's behind them
    const tick = Math.floor(this.t * 7);
    const P = (k, j) => k * 8 + j;
    const quad = (ia, ib, ic, id) => { ctx.beginPath(); ctx.moveTo(v.PX[ia], v.PY[ia]); ctx.lineTo(v.PX[ib], v.PY[ib]); ctx.lineTo(v.PX[ic], v.PY[ic]); ctx.lineTo(v.PX[id], v.PY[id]); ctx.closePath(); ctx.fill(); };
    // a point on the road in camera space: row k, sideways offset o, height h → [x across, y down from the eye, z ahead]
    const cpt = (k, o, h = 0) => [v.X[k] + o * v.CO[k] - c.lat, c.y - v.Y[k] - h, v.Z[k] - o * v.SI[k]];
    // fill a polygon given in camera space, cut at the near plane (so a surface right in front of the
    // lens is trimmed, never dropped whole — that's what made corners and walls vanish)
    const CLIP = [];
    const cfill = (pts) => {
      let any = false; for (const q of pts) if (q[2] >= NEAR) { any = true; break; }
      if (!any) return;
      CLIP.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], ina = a[2] >= NEAR, inb = b[2] >= NEAR;
        if (ina) CLIP.push(a);
        if (ina !== inb) { const t = (NEAR - a[2]) / (b[2] - a[2]); CLIP.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
      }
      if (CLIP.length < 3) return;
      ctx.beginPath();
      for (let i = 0; i < CLIP.length; i++) {
        const q = CLIP[i], sc = F / q[2], x = clamp(W / 2 + q[0] * sc, -4 * W, 5 * W), y = clamp(HZ + q[1] * sc, -4 * H, 5 * H);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    };
    const band = (k, j1, j2) => {
      const a = P(k, j1), b = P(k, j2), cc = P(k + 1, j2), d = P(k + 1, j1);
      if (v.OK[a] && v.OK[b] && v.OK[cc] && v.OK[d]) quad(a, b, cc, d);
      else cfill([cpt(k, OFFS[j1]), cpt(k, OFFS[j2]), cpt(k + 1, OFFS[j2]), cpt(k + 1, OFFS[j1])]);
    };
    const strip = (k, j, w) => {   // a thin line of constant world width along the road at cross-point j
      const a = P(k, j), b = P(k + 1, j);
      if (!v.OK[a] || !v.OK[b]) { const o = OFFS[j]; cfill([cpt(k, o - w), cpt(k, o + w), cpt(k + 1, o + w), cpt(k + 1, o - w)]); return; }
      const wa = w * v.PS[a], wb = w * v.PS[b];
      ctx.beginPath(); ctx.moveTo(v.PX[a] - wa, v.PY[a]); ctx.lineTo(v.PX[a] + wa, v.PY[a]); ctx.lineTo(v.PX[b] + wb, v.PY[b]); ctx.lineTo(v.PX[b] - wb, v.PY[b]); ctx.closePath(); ctx.fill();
    };
    const ostrip = (k, o, w) => {   // like strip() but at any sideways offset o
      const za = v.Z[k] - o * v.SI[k], zb = v.Z[k + 1] - o * v.SI[k + 1];
      if (za < NEAR || zb < NEAR) { cfill([cpt(k, o - w), cpt(k, o + w), cpt(k + 1, o + w), cpt(k + 1, o - w)]); return; }
      const sa = F / za, sb = F / zb;
      const xa = W / 2 + (v.X[k] + o * v.CO[k] - c.lat) * sa, ya = HZ + (c.y - v.Y[k]) * sa;
      const xb = W / 2 + (v.X[k + 1] + o * v.CO[k + 1] - c.lat) * sb, yb = HZ + (c.y - v.Y[k + 1]) * sb;
      const wa = Math.max(0.5, w * sa), wb = Math.max(0.5, w * sb);
      ctx.beginPath(); ctx.moveTo(xa - wa, ya); ctx.lineTo(xa + wa, ya); ctx.lineTo(xb + wb, yb); ctx.lineTo(xb - wb, yb); ctx.closePath(); ctx.fill();
    };
    const GOFF = [70, 170, 300, 460, 660, 900];
    for (let k = n - 1; k >= 0; k--) {
      const a = v.i0 + k, ii = mod(a, N), k1 = k + 1, yn = v.CY[k], yf = v.CY[k1];
      const inFront = v.Z[k] > NEAR && v.Z[k1] > NEAR;
      // a row the near plane cuts through: draw whatever part of it is in front of the lens
      let straddle = false;
      if (!inFront && k < 12) for (let j = 0; j < 8; j++) if (v.OK[P(k, j)] || v.OK[P(k1, j)]) { straddle = true; break; }
      if ((inFront && yf < yn && yf < H + 40) || straddle) {
        const fg = fogAt(Math.max(NEAR, v.Z[k])), hz = th.haze;
        // ground band + neon floor grid
        ctx.fillStyle = fogMix(th.gnd[(a >> 2) & 1], hz, fg);
        if (inFront) ctx.fillRect(0, Math.floor(yf), W, Math.ceil(yn - yf) + 1);
        if (!lo && inFront) {
          ctx.strokeStyle = hexA(th.grid, 0.42 * (1 - fg)); ctx.lineWidth = 1; ctx.beginPath();
          for (const g of GOFF) for (const sg of [-1, 1]) {
            const o = sg * (WW + g), zn = v.Z[k] - o * v.SI[k], zf = v.Z[k1] - o * v.SI[k1];
            if (zn < NEAR || zf < NEAR) continue;
            ctx.moveTo(W / 2 + (v.X[k] + o * v.CO[k] - c.lat) * F / zn, HZ + (c.y - v.Y[k]) * F / zn);
            ctx.lineTo(W / 2 + (v.X[k1] + o * v.CO[k1] - c.lat) * F / zf, HZ + (c.y - v.Y[k1]) * F / zf);
          }
          ctx.stroke();
        }
        if ((a & 3) === 0 && inFront) { ctx.fillStyle = hexA(th.grid, 0.5 * (1 - fg)); ctx.fillRect(0, yn - 0.5, W, Math.max(1, v.PS[P(k, 2)] * 1.6)); }
        // run-off and the track itself: a dark glass floor with a glowing neon grid, no asphalt
        ctx.fillStyle = fogMix(th.runoff, hz, fg); band(k, 0, 7);
        ctx.fillStyle = fogMix(this.voidCol, hz, fg); band(k, 2, 5);
        // kerbs: chasing neon blocks
        const kc = fogMix(((a >> 1) + tick) & 1 ? th.kerb[0] : th.face, hz, fg);
        ctx.fillStyle = kc; band(k, 1, 2); band(k, 5, 6);
        // grid: lines along the track, plus cross lines with light pulses racing towards you
        if (fg < 0.85) {
          const u = mod(a * T.step + this.t * 760, 960) / 960, pulse = u < 0.14 ? 1 - u / 0.14 : 0;
          ctx.fillStyle = hexA(th.lane, (0.5 + 0.4 * pulse) * (1 - fg));
          for (let gi = lo ? 1 : 0; gi < 5; gi += lo ? 2 : 1) ostrip(k, this.gridOffs[gi], 1.4);
          if ((a & 1) === 0) {
            const ia = P(k, 2), ib = P(k, 5);
            if (v.OK[ia] && v.OK[ib]) {
              ctx.strokeStyle = hexA(pulse > 0 ? th.edge : th.lane, (0.42 + 0.55 * pulse) * (1 - fg));
              ctx.lineWidth = Math.max(0.9, (2 + pulse * 2.6) * v.PS[ia]);
              ctx.beginPath(); ctx.moveTo(v.PX[ia], v.PY[ia]); ctx.lineTo(v.PX[ib], v.PY[ib]); ctx.stroke();
            }
          }
        }
        // start / finish chequers
        if (ii === 0) this.drawChequers(ctx, k, OFFS, hw);
        // glowing edge lines
        if (!lo) { ctx.fillStyle = hexA(th.edge, 0.2 * (1 - fg)); strip(k, 2, 7); strip(k, 5, 7); }
        ctx.fillStyle = fogMix(th.edge, hz, fg * 0.6); strip(k, 2, 1.8); strip(k, 5, 1.8);
        // tyre trails on this stretch
        if (v.sk[k].length) this.drawSkids(ctx, v.sk[k]);
        // walls: chevron-striped on the outside of tight bends
        const tight = Math.abs(T.k[ii]) > 0.0034, outside = T.k[ii] > 0 ? 0 : 7;
        for (const j of [0, 7]) {
          const ia = P(k, j), ib = P(k1, j);
          if (!v.OK[ia] || !v.OK[ib]) {
            // the wall right beside / in front of you: clip it at the lens instead of letting it vanish
            const o = OFFS[j];
            ctx.fillStyle = fogMix(tight && j === outside && (a & 1) ? th.kerb[0] : th.face, hz, fg);
            cfill([cpt(k, o), cpt(k1, o), cpt(k1, o, WALL_H), cpt(k, o, WALL_H)]);
            ctx.fillStyle = fogMix(th.wall, hz, fg * 0.6);
            cfill([cpt(k, o, WALL_H - 2.6), cpt(k1, o, WALL_H - 2.6), cpt(k1, o, WALL_H + 2.6), cpt(k, o, WALL_H + 2.6)]);
            continue;
          }
          const ta = v.PY[ia] - WALL_H * v.PS[ia], tb = v.PY[ib] - WALL_H * v.PS[ib];
          ctx.fillStyle = fogMix(tight && j === outside && (a & 1) ? th.kerb[0] : th.face, hz, fg);
          ctx.beginPath(); ctx.moveTo(v.PX[ia], v.PY[ia]); ctx.lineTo(v.PX[ib], v.PY[ib]); ctx.lineTo(v.PX[ib], tb); ctx.lineTo(v.PX[ia], ta); ctx.closePath(); ctx.fill();
          ctx.fillStyle = fogMix(th.wall, hz, fg * 0.6);
          const wa = Math.max(1, 2.6 * v.PS[ia]), wb = Math.max(1, 2.6 * v.PS[ib]);
          ctx.beginPath(); ctx.moveTo(v.PX[ia], ta - wa); ctx.lineTo(v.PX[ib], tb - wb); ctx.lineTo(v.PX[ib], tb + wb); ctx.lineTo(v.PX[ia], ta + wa); ctx.closePath(); ctx.fill();
        }
      }
      // things standing on this stretch, far → near
      const items = v.bk[k];
      if (items.length) { if (items.length > 1) items.sort((x, y) => y.z - x.z); for (const it of items) it.fn(); }
    }
    this.drawSpeedLines(ctx);
    if (cockpit && st !== 'title' && !lo) {
      const ch = p.charge, pulse = ch >= 1 ? 0.12 * Math.sin(this.t * 8) : 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(W / 2, 470); ctx.scale(2.6, 0.55);
      glowDot(ctx, 0, 0, 120, p.boostT > 0 ? '#67e8f9' : this.chargeCol(ch), 0.18 + 0.32 * ch + pulse + (p.boostT > 0 ? 0.25 : 0));
      ctx.restore();
    }
    ctx.restore();
    if (cockpit) this.drawCockpit(ctx);
    this.drawHud(ctx);
    if (this.tuneT > 0) this.drawTuner(ctx);
  }

  /** streaks flying out of the vanishing point when you're boosting (and faintly at top speed) */
  drawSpeedLines(ctx) {
    const p = this.p, st = this.s.state;
    if (st === 'title' || this.count > 0 || this.tuneT > 0) return;
    const spd = Math.hypot(p.vx, p.vz);
    const inten = p.boostT > 0 ? 1 : clamp((spd / this.maxV - 0.9) * 4, 0, 0.35);
    if (inten <= 0.02) return;
    const n = Math.round((this.s.lowDetail ? 12 : 26) * inten), cx = W / 2, cy = HZ + 10;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r0 = 70 + Math.random() * 120, len = 60 + Math.random() * 200 * inten;
      const ca = Math.cos(a), sa = Math.sin(a) * 1.25;
      ctx.strokeStyle = hexA(Math.random() < 0.3 ? this.theme.edge : '#e0f2fe', 0.18 + 0.32 * inten);
      ctx.lineWidth = 1 + Math.random() * 1.8 * inten;
      ctx.beginPath(); ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len)); ctx.stroke();
    }
    ctx.restore();
  }

  drawSky(ctx) {
    const th = this.theme, c = this.cam, art = skyArt(th);
    const g = ctx.createLinearGradient(0, 0, 0, HZ);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.62, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HZ + 2);
    // stars pan with the camera
    const off = mod(c.yaw * F - W / 2, PW);
    ctx.fillStyle = '#fff';
    for (const [sx, sy, r, ph] of art.stars) {
      const x = mod(sx - off, PW); if (x > W) continue;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.t * 2 + ph); ctx.fillRect(x, sy, r, r);
    }
    ctx.globalAlpha = 1;
    // the sun sits in a fixed direction: drive towards it and it rises into view
    const rel = wrapA(this.sunYaw - c.yaw);
    if (Math.abs(rel) < 0.9) {
      const sx = W / 2 + rel * F, sy = HZ - 30;
      if (!this.s.lowDetail) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, sx, sy, art.R * 2.4, th.sun[1], 0.35); ctx.restore(); }
      ctx.drawImage(art.sun, sx - art.R, sy - art.R);
    }
    // skylines: far (true bearing) then near (pans faster for parallax)
    const pan = (img, pw, start, y, hgt) => {
      const sx = mod(start, pw), w1 = Math.min(W, pw - sx);
      ctx.drawImage(img, sx, 0, w1, hgt, 0, y, w1, hgt);
      if (w1 < W) ctx.drawImage(img, 0, 0, W - w1, hgt, w1, y, W - w1, hgt);
    };
    pan(art.far, PW, c.yaw * F - W / 2, HZ - 128, 130);
    pan(art.near, art.PW2, c.yaw * F * 1.3 - W / 2, HZ - 78, 80);
    // horizon glow
    const hg = ctx.createLinearGradient(0, HZ - 26, 0, HZ + 6);
    hg.addColorStop(0, hexA(th.sky[2], 0)); hg.addColorStop(1, hexA(th.sky[2], 0.55));
    ctx.fillStyle = hg; ctx.fillRect(0, HZ - 26, W, 32);
    ctx.fillStyle = th.gnd[0]; ctx.fillRect(0, HZ + 2, W, H - HZ);
  }

  drawChequers(ctx, k, OFFS, hw) {
    const v = this.v, c = this.cam, cols = 10;
    for (let r = 0; r < 2; r++) for (let col = 0; col < cols; col++) {
      ctx.fillStyle = (r + col) % 2 ? '#f8fafc' : '#0b0b14';
      const o0 = -hw + col * hw * 2 / cols, o1 = o0 + hw * 2 / cols;
      const pt = (o, f) => {   // point at fraction f of the way along segment k, offset o
        const X = v.X[k] + (v.X[k + 1] - v.X[k]) * f, Z = v.Z[k] + (v.Z[k + 1] - v.Z[k]) * f, Y = v.Y[k] + (v.Y[k + 1] - v.Y[k]) * f;
        const sc = F / Math.max(NEAR, Z - o * v.SI[k]);
        return [W / 2 + (X + o * v.CO[k] - c.lat) * sc, HZ + (c.y - Y) * sc];
      };
      const f0 = r * 0.5, f1 = f0 + 0.5;
      const a = pt(o0, f0), b = pt(o1, f0), cc = pt(o1, f1), d = pt(o0, f1);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    }
  }

  drawSkids(ctx, list) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'butt';
    for (const sk of list) {
      const a = this.proj(sk.d1, sk.o1); if (!a) continue;
      const ax = a[0], ay = a[1], w = a[2];
      const b = this.proj(sk.d2, sk.o2); if (!b) continue;
      const age = this.t - sk.t;
      ctx.strokeStyle = hexA(sk.c, [0.55, 0.36, 0.2, 0.09][Math.min(3, age / 1.3 | 0)]);
      ctx.lineWidth = clamp(3.4 * (w + b[2]) / 2, 1, 16);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.restore();
  }

  drawRacer(ctx, o) {
    const T = this.T, lo = this.s.lowDetail, c = this.cam;
    const rel = wrapA(o.h - at(T, o.d)[2]);
    const qc = this.proj(o.d, o.off, 0); if (!qc) return;
    const cx = qc[0], cy = qc[1], csc = qc[2], cz = qc[3], gy = qc[6];
    if (cx < -160 || cx > W + 160 || cy < HZ - 200 || cy > H + 200) return;
    const fog = fogAt(cz);
    if (o.ghost) ctx.globalAlpha = this.p.ghostT > 0.5 || Math.sin(this.t * 40) > 0 ? 0.45 : 0.85;
    // shadow + underglow
    const squash = clamp((c.y - gy) / cz, 0.12, 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(cx, cy, 19 * csc, 33 * csc * squash + 1, 0, 0, TAU); ctx.fill();
    if (!lo) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.scale(1, squash * 1.3 + 0.1); glowDot(ctx, 0, 0, 44 * csc * (o.player ? 1 + 0.35 * this.p.charge : 1), o.glow, (o.player ? 0.55 + 0.3 * this.p.charge : 0.45) * (1 - fog)); ctx.restore(); }
    const qr = this.proj(o.d - Math.cos(rel) * CAR_HALF, o.off - Math.sin(rel) * CAR_HALF, 0); if (!qr) return;
    const rx = qr[0], ry = qr[1], rsc = qr[2], rz = qr[3], rth = qr[4], ry0 = qr[6];
    const view = Math.atan((rx - W / 2) / F);
    const yaw = rel + rth - view;
    const pitch = clamp(0.72 * Math.atan2(c.y - ry0, rz), 0.06, 0.9);
    const glow = (g, x, y, r, col, a) => { g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, x, y, r * 1.6, col, a); g.restore(); };
    const TT = drawCar(ctx, SPORTS, { x: rx, y: ry, ppu: CAR_U * rsc, pal: o.pal, yaw, pitch, roll: o.roll, persp: Math.min(0.2, CAR_U / rz), amb: 0.55, lights: o.lights,
      halo: lo ? 0 : 0.9, fog: fog > 0 ? [rgb(this.theme.haze), fog] : null, glow });
    // exhausts: flare on boost, glow hot while drifting
    const p = this.p;
    if (o.boost || (o.player && p.drifting)) {
      const ppu = CAR_U * rsc;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const e of SPORTS.exhaust) {
        const [ex, ey] = TT(...e);
        if (o.boost) {
          const len = ppu * (0.55 + Math.random() * 0.4);
          const fg = ctx.createLinearGradient(ex, ey, ex, ey + len);
          fg.addColorStop(0, 'rgba(224,242,254,.95)'); fg.addColorStop(0.4, 'rgba(56,189,248,.75)'); fg.addColorStop(1, 'rgba(56,189,248,0)');
          ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(ex - ppu * 0.12, ey); ctx.lineTo(ex, ey + len); ctx.lineTo(ex + ppu * 0.12, ey); ctx.fill();
        }
        if (o.player && p.drifting) glowDot(ctx, ex, ey, ppu * (0.32 + Math.random() * 0.12), this.s.gold ? '#fde047' : '#ff4fa3', 0.85);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (o.player) this.playerScr = [cx, ry - CAR_U * rsc * 1.5];
    if (o.name && cz < 2200) {
      const ny = ry - CAR_U * rsc * 1.6 - 6;
      ctx.font = `800 ${Math.round(clamp(rsc * 26, 9, 13))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.globalAlpha = 1 - fog;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(o.name, cx + 1, ny + 1);
      ctx.fillStyle = o.glow; ctx.fillText(o.name, cx, ny);
      ctx.globalAlpha = 1;
    }
  }

  /** text on a panel standing in the world: corners (bottom-left, bottom-right, top-left) in screen space */
  panelText(ctx, bl, br, tl, text, col, wpx, hpx) {
    ctx.save();
    ctx.transform((br[0] - bl[0]) / wpx, (br[1] - bl[1]) / wpx, (bl[0] - tl[0]) / hpx, (bl[1] - tl[1]) / hpx, tl[0], tl[1]);
    ctx.font = `900 ${hpx * 0.62}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.fillText(text, wpx / 2, hpx / 2 + 1, wpx * 0.9);
    ctx.restore();
  }
  boardText(dc) {
    const s = this.s, n = dc.n, phase = Math.floor(this.t / 2.5 + n) % 4;
    if (phase === 0 && s.multiplier > 1) return `COMBO ×${s.multiplier}`;
    if (phase === 1 && this.rivals.length) { const rv = this.rivals[n % 3]; return [`${rv.name}: CATCH ME`, `${rv.name} RULES`, `BEAT ${rv.name}`][n % 3]; }
    if (phase === 2 && !this.bonus) return `LAP ${Math.min(LAPS, this.p.lapDone + 1)}/${LAPS}`;
    return SIGNS[(n + this.level) % SIGNS.length];
  }

  drawDeco(ctx, dc) {
    const th = this.theme, lo = this.s.lowDetail, hw = this.T.halfW, WW = hw + RUNOFF;
    const ground = this.proj(dc.d, dc.off, 0); if (!ground) return;
    const gx = ground[0], gy = ground[1], sc = ground[2], fg = fogAt(ground[3]);
    if (dc.kind === 'pillar') {
      if (gx < -40 || gx > W + 40) return;
      const top = gy - 150 * sc, col = th.sign[dc.n % 3], w = Math.max(1, 3 * sc);
      if (!lo) { ctx.fillStyle = hexA(col, 0.16 * (1 - fg)); ctx.fillRect(gx - w * 4, top, w * 8, gy - top); }
      ctx.fillStyle = fogMix(col, th.haze, fg * 0.7); ctx.fillRect(gx - w, top, w * 2, gy - top);
      ctx.fillStyle = fogMix('#ffffff', th.haze, fg); ctx.fillRect(gx - w * 1.6, top - w * 2, w * 3.2, w * 2.4);
      return;
    }
    if (dc.kind === 'board') {
      const bl = this.pp(dc.d, dc.off - 62, 48), br = this.pp(dc.d, dc.off + 62, 48), tl = this.pp(dc.d, dc.off - 62, 112), tr = this.pp(dc.d, dc.off + 62, 112);
      if (!bl || !br || !tl || !tr || Math.max(br[0], tr[0]) < -10 || Math.min(bl[0], tl[0]) > W + 10) return;
      const col = th.sign[dc.n % 3];
      ctx.strokeStyle = fogMix('#1e293b', th.haze, fg); ctx.lineWidth = Math.max(1, 5 * sc);
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, (bl[1] + br[1]) / 2); ctx.stroke();
      ctx.globalAlpha = 1 - fg * 0.8;
      ctx.fillStyle = hexA(col, 0.12); ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(tr[0], tr[1]); ctx.lineTo(tl[0], tl[1]); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(6,4,16,0.55)'; ctx.fill();
      // holo scanlines
      if (!lo && sc > 0.25) {
        ctx.fillStyle = hexA(col, 0.12);
        const hh = bl[1] - tl[1], off = (this.t * 30) % 6;
        for (let y = off; y < hh; y += 6) ctx.fillRect(tl[0], tl[1] + y, tr[0] - tl[0], 1.2);
      }
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 2.4 * sc * 3);
      ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(tr[0], tr[1]); ctx.lineTo(tl[0], tl[1]); ctx.closePath(); ctx.stroke();
      const flick = Math.sin(this.t * 13 + dc.n * 7) > 0.95 ? 0.35 : 1;
      ctx.globalAlpha = (1 - fg * 0.8) * flick;
      this.panelText(ctx, bl, br, tl, this.boardText(dc), col, 124, 64);
      ctx.globalAlpha = 1;
      return;
    }
    // arches (torii-style neon gateways) and the start/finish gantry span the whole road
    const gantry = dc.kind === 'gantry', HT = gantry ? 112 : 158, w = gantry ? WW - 4 : WW + 8;
    const pts = [[-w, 0], [-w, HT], [w, 0], [w, HT]].map(([o, h]) => this.pp(dc.d, o, h));
    if (pts.some((q) => !q)) return;
    const [l0, l1, r0, r1] = pts;
    const col = gantry ? th.edge : th.sign[dc.n % 3], post = Math.max(1.5, 7 * sc);
    ctx.globalAlpha = 1 - fg * 0.7;
    ctx.strokeStyle = fogMix(th.face, th.haze, fg); ctx.lineCap = 'round'; ctx.lineWidth = post * 1.6;
    ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, post * 0.35);
    ctx.stroke();
    if (gantry) {
      const b0 = this.pp(dc.d, -w, HT - 34), b1 = this.pp(dc.d, w, HT - 34);
      if (b0 && b1) {
        const bl = [b0[0], b0[1]], br = [b1[0], b1[1]];
        ctx.fillStyle = 'rgba(8,6,20,0.92)'; ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(r1[0], r1[1]); ctx.lineTo(l1[0], l1[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = th.edge; ctx.lineWidth = Math.max(1, 2.2 * sc * 3); ctx.stroke();
        const lap = this.p.lapDone, txt = this.bonus ? '★ COIN RUSH ★' : lap >= LAPS - 1 && this.raceT > 0 ? 'FINAL LAP' : 'NEON DRIFT';
        this.panelText(ctx, bl, br, l1, txt, th.kerb[0], 260, 34);
      }
    } else {
      // two cross beams, the top one overhanging the posts
      const t0 = this.pp(dc.d, -w - 26, HT + 6), t1 = this.pp(dc.d, w + 26, HT + 6), m0 = this.pp(dc.d, -w, HT - 28), m1 = this.pp(dc.d, w, HT - 28);
      if (t0 && t1 && m0 && m1) {
        ctx.strokeStyle = fogMix(th.face, th.haze, fg); ctx.lineWidth = post * 1.4;
        ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
        if (!lo) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(col, 0.3); ctx.lineWidth = post * 2.2; ctx.stroke(); ctx.restore(); }
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, post * 0.4); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }

  drawPad(ctx, b) {
    const P2 = [[-24, -30], [-24, 30], [24, 30], [24, -30]].map(([dd, oo]) => this.pp(b.d + dd, b.off + oo, 1));
    if (P2.some((q) => !q)) return;
    ctx.fillStyle = 'rgba(34,211,238,0.25)'; ctx.beginPath(); P2.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.stroke();
    for (let r = 0; r < 3; r++) {
      const ph = (this.t * 2.4 + r / 3) % 1, dd = -16 + ph * 32;
      // proj() reuses one scratch array, so copy each point out before the next call
      const l = this.proj(b.d + dd - 8, b.off - 18, 1); if (!l) continue; const L2 = [l[0], l[1]];
      const rr = this.proj(b.d + dd - 8, b.off + 18, 1); if (!rr) continue; const R2 = [rr[0], rr[1]];
      const M = this.proj(b.d + dd + 4, b.off, 1); if (!M) continue;
      ctx.globalAlpha = Math.sin(ph * Math.PI); ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = Math.max(1.5, 3 * M[2] * 2);
      ctx.beginPath(); ctx.moveTo(L2[0], L2[1]); ctx.lineTo(M[0], M[1]); ctx.lineTo(R2[0], R2[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawOil(ctx, o) {
    const c = this.cam;
    for (const [bx, bz, s] of o.blobs) {
      const q = this.proj(o.d + bz, o.off + bx, 0); if (!q) continue;
      const r = o.r * s * q[2], sq = clamp((c.y - q[6]) / q[3], 0.08, 1);
      if (q[0] < -80 || q[0] > W + 80) continue;
      ctx.fillStyle = 'rgba(3,2,8,0.92)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], r, r * sq, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(q[0] - r, q[1], q[0] + r, q[1]);
      g.addColorStop(0, 'rgba(244,114,182,0.55)'); g.addColorStop(0.5, 'rgba(56,189,248,0.55)'); g.addColorStop(1, 'rgba(163,230,53,0.55)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(q[0] - r * 0.15, q[1] - r * sq * 0.1, r * 0.6, r * 0.6 * sq, 0, 0.3, 2.6); ctx.stroke();
    }
  }
  drawCoin(ctx, cn) {
    const bob = Math.sin(this.t * 4 + cn.d) * 3, q = this.proj(cn.d, cn.off, 16 + bob);
    if (!q || q[0] < -30 || q[0] > W + 30) return;
    // a coin you've missed fades out before it reaches the lens instead of filling the windscreen
    const fade = clamp((q[3] - 60) / 110, 0, 1);
    if (fade <= 0) return;
    const r = (cn.big ? 11 : 7) * q[2], sp = Math.abs(Math.cos(this.t * 3 + cn.d * 0.02));
    ctx.save(); ctx.globalAlpha = fade;
    if (!this.s.lowDetail) { ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, q[0], q[1], Math.min(r * (cn.line ? 3.2 : 2.6), 90), cn.line ? '#22d3ee' : '#fbbf24', (cn.line ? 0.6 : 0.45) * fade); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade; }
    // trail coins: a cyan rim so the line through the corner reads at a glance
    ctx.fillStyle = cn.line ? '#22d3ee' : '#b45309'; ctx.beginPath(); ctx.ellipse(q[0], q[1], Math.max(1.5, r * sp), r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.ellipse(q[0] - r * 0.12 * sp, q[1], Math.max(1, r * 0.72 * sp), r * 0.72, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawSmoke(ctx, m) {
    const q = this.proj(m.d, m.off, m.y); if (!q || q[3] < 110) return;
    const near = Math.min(1, (q[3] - 110) / 120);   // fade puffs out as they reach the camera
    ctx.fillStyle = hexA(m.c, (1 - m.life / m.max) * 0.3 * m.a * near); ctx.beginPath(); ctx.arc(q[0], q[1], Math.min(46, m.r * q[2]), 0, TAU); ctx.fill();
  }

  // ── The cockpit (drawn steady on top of the moving world) ────
  drawCockpit(ctx) {
    const p = this.p, th = this.theme, s = this.s, lo = this.s.lowDetail, c = this.cam;
    const neonA = s.gold ? '#fde047' : th.edge, neonB = s.gold ? '#fbbf24' : th.kerb[0];
    const body = '#07040f', body2 = '#120a22';
    const glowLine = (col, w, blur) => {
      if (!lo) { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.restore(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
    };
    ctx.save();
    ctx.translate(c.bobX * 0.3, c.bobY * 0.35);      // the cabin shakes a little less than your head
    // the windscreen: one wide curved pane, edge to edge — the roof bows up in the middle, the dash dips
    // below it, the corners are rounded and the side pillars are just a slim rim
    const glass = () => {
      const lt = 10, lb = 5, rt = W - 10, rb = W - 5, top = 150, topC = 108, bot = 462, botC = 520, r = 30;
      ctx.moveTo(lt + r, top);
      ctx.quadraticCurveTo(W / 2, 2 * topC - top, rt - r, top);
      ctx.quadraticCurveTo(rt, top, rt + (rb - rt) * 0.06, top + r);
      ctx.lineTo(rb, bot - r);
      ctx.quadraticCurveTo(rb, bot, rb - r, bot + 4);
      ctx.quadraticCurveTo(W / 2, 2 * botC - bot, lb + r, bot + 4);
      ctx.quadraticCurveTo(lb, bot, lb, bot - r);
      ctx.lineTo(lt + (lb - lt) * 0.06, top + r);
      ctx.quadraticCurveTo(lt, top, lt + r, top);
      ctx.closePath();
    };
    // a faint sheen across the glass
    if (!lo) {
      ctx.save(); ctx.beginPath(); glass(); ctx.clip();
      const sh = ctx.createLinearGradient(0, 60, W, 420);
      sh.addColorStop(0.18, 'rgba(255,255,255,0)'); sh.addColorStop(0.3, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.38, 'rgba(255,255,255,0)');
      sh.addColorStop(0.62, 'rgba(255,255,255,0)'); sh.addColorStop(0.68, 'rgba(255,255,255,0.03)'); sh.addColorStop(0.74, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // the body around the glass
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.rect(-30, -30, W + 60, H + 60); glass(); ctx.fill('evenodd');
    ctx.beginPath(); glass(); glowLine(p.ghostT > 0 && (p.ghostT > 0.5 || Math.sin(this.t * 30) > 0) ? '#f8fafc' : neonA, 2.2, 14);
    // rear-view mirror, hanging from the roof
    this.drawMirror(ctx, neonA);
    // dashboard with a raised instrument binnacle in the middle
    const dash = () => {
      ctx.beginPath();
      ctx.moveTo(-10, 466); ctx.quadraticCurveTo(W * 0.15, 486, W * 0.27, 516);
      ctx.bezierCurveTo(W * 0.31, 476, W * 0.69, 476, W * 0.73, 516);
      ctx.quadraticCurveTo(W * 0.85, 486, W + 10, 466);
    };
    const dg = ctx.createLinearGradient(0, 466, 0, H);
    dg.addColorStop(0, body2); dg.addColorStop(1, body);
    ctx.fillStyle = dg; dash(); ctx.lineTo(W + 10, H + 10); ctx.lineTo(-10, H + 10); ctx.closePath(); ctx.fill();
    dash(); glowLine(neonB, 2.4, 14);
    this.drawGauges(ctx, neonA, neonB);
    this.drawWheel(ctx, neonA, neonB);
    ctx.restore();
  }

  /** the instruments: rev counter + gear (left pod), drift meter + combo (right pod), speed and boost bar (binnacle) */
  drawGauges(ctx, neonA, neonB) {
    const p = this.p, s = this.s, lo = s.lowDetail, dt = Math.min(0.05, this.t - (this.gaugeT ?? this.t));
    this.gaugeT = this.t;
    const spd = Math.hypot(p.vx, p.vz), kmh = Math.round(spd * 0.4);
    const pink = s.gold ? '#fde047' : '#ff4fa3', cyan = '#67e8f9';
    const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;   // dials sweep 270°, from bottom-left round to bottom-right
    const glowOn = (col, b) => { if (!lo) { ctx.shadowColor = col; ctx.shadowBlur = b; } };
    const glowOff = () => { ctx.shadowBlur = 0; };
    const pod = (cx, cy, r, ring) => {
      ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = hexA(ring, 0.55); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r - 4, A0, A0 + SW); ctx.stroke();
    };
    const ticks = (cx, cy, r, n, col, red) => {
      for (let i = 0; i <= n; i++) {
        const f = i / n, a = A0 + f * SW, big = i % 2 === 0, r0 = r - (big ? 11 : 7);
        ctx.strokeStyle = red != null && f >= red ? '#fb7185' : col; ctx.lineWidth = big ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2)); ctx.stroke();
      }
    };
    const needle = (cx, cy, r, a, col) => {
      glowOn(col, 8);
      ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8); ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); ctx.stroke();
      glowOff(); ctx.lineCap = 'butt';
      ctx.fillStyle = '#1a1230'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
    };
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    // ── left pod: rev counter with a gear readout (six "gears" spread over the speed range) ──
    const top = this.maxV * 1.32, f = clamp(spd / top, 0, 0.999), gear = this.count > 0 || spd < 20 ? 0 : Math.floor(f * 6) + 1;
    let rpmT = gear === 0 ? 0.12 + (this.count > 0 ? 0.25 + 0.15 * Math.sin(this.t * 22) : 0) : 0.28 + 0.68 * (f * 6 - (gear - 1));
    if (p.drifting) rpmT = Math.min(0.98, rpmT + 0.12);          // wheelspin as the tail steps out
    this.rpm = this.rpm == null ? rpmT : this.rpm + (rpmT - this.rpm) * Math.min(1, dt * 14);
    const LX = 66, LY = 556, LR = 48;
    pod(LX, LY, LR, neonA);
    ticks(LX, LY, LR, 16, hexA(neonA, 0.8), 0.82);
    ctx.strokeStyle = this.rpm > 0.82 ? '#fb7185' : neonA; ctx.lineWidth = 4;
    glowOn(ctx.strokeStyle, 10); ctx.beginPath(); ctx.arc(LX, LY, LR - 4, A0, A0 + SW * this.rpm); ctx.stroke(); glowOff();
    ctx.font = '900 22px system-ui'; ctx.fillStyle = this.rpm > 0.9 ? '#fb7185' : '#f8fafc'; ctx.fillText(gear === 0 ? 'N' : String(gear), LX, LY + 30);
    ctx.font = '800 8px system-ui'; ctx.fillStyle = hexA(neonA, 0.8); ctx.fillText('RPM ×1000', LX, LY - 16);
    needle(LX, LY, LR, A0 + SW * this.rpm, this.rpm > 0.82 ? '#fb7185' : '#f8fafc');

    // ── right pod: drift meter — needle shows the slide angle, the arc fills with the drift you're building ──
    const RX = W - 66, RY = 556, RR = 48, slip = clamp(p.slip || 0, -0.9, 0.9);
    const charge = p.drift > 0 ? clamp(p.drift / 60, 0, 1) : 0;
    this.driftArc = this.driftArc == null ? charge : this.driftArc + (charge - this.driftArc) * Math.min(1, dt * 10);
    pod(RX, RY, RR, pink);
    ticks(RX, RY, RR, 12, hexA(pink, 0.75));
    if (this.driftArc > 0.01) {
      ctx.strokeStyle = this.driftArc >= 1 ? '#fde047' : pink; ctx.lineWidth = 4;
      glowOn(ctx.strokeStyle, 12); ctx.beginPath(); ctx.arc(RX, RY, RR - 4, A0, A0 + SW * this.driftArc); ctx.stroke(); glowOff();
    }
    const mult = s.multiplier || 1, hot = p.drifting;
    ctx.font = `900 ${mult > 1 ? 20 : 16}px system-ui`; ctx.fillStyle = mult > 1 ? pink : '#cbd5e1';
    if (hot) glowOn(pink, 12);
    ctx.fillText(`×${mult}`, RX, RY + 30); glowOff();
    ctx.font = '800 8px system-ui'; ctx.fillStyle = hexA(pink, 0.85); ctx.fillText(hot ? 'DRIFTING' : 'DRIFT', RX, RY - 16);
    // slide angle: straight up = no slide, swings left/right with the tail
    needle(RX, RY, RR, -Math.PI / 2 + slip * 1.6, hot ? pink : '#f8fafc');

    // ── binnacle: digital speed and the boost bar ──
    ctx.font = '900 26px system-ui'; ctx.fillStyle = p.boostT > 0 ? cyan : '#f8fafc';
    glowOn(neonA, 10); ctx.textAlign = 'right'; ctx.fillText(String(kmh), W / 2 + 14, 506); glowOff();
    ctx.textAlign = 'left'; ctx.font = '800 10px system-ui'; ctx.fillStyle = hexA(neonA, 0.85); ctx.fillText('KM/H', W / 2 + 18, 506);
    const burning = p.boostT > 0, boostF = burning ? clamp(p.boostT / p.boostMax, 0, 1) : p.charge;
    const segs = 10, bw = 120, bx = W / 2 - bw / 2 + 6, by = 514, sw = bw / segs;
    const ready = !burning && p.charge >= BOOST_MIN, full = !burning && p.charge >= 1;
    for (let i = 0; i < segs; i++) {
      const on = i < Math.ceil(boostF * segs - 0.001);
      const col = burning ? '#e0f2fe' : this.chargeCol((i + 1) / segs);
      ctx.fillStyle = on ? (full && Math.sin(this.t * 10) > 0 ? '#ffffff' : col) : 'rgba(103,232,249,0.12)';
      if (on) glowOn(col, ready || burning ? 10 : 4);
      ctx.fillRect(bx + i * sw + 1, by, sw - 2, 6); glowOff();
    }
    // the minimum you need to fire
    ctx.fillStyle = 'rgba(248,250,252,0.6)'; ctx.fillRect(bx + BOOST_MIN * bw - 0.5, by - 2, 1, 10);
    ctx.textAlign = 'right'; ctx.font = '800 10px system-ui'; ctx.fillStyle = ready || burning ? cyan : hexA(cyan, 0.5);
    ctx.fillText('⚡', bx - 3, by + 7);
  }

  drawWheel(ctx, neonA, neonB) {
    const p = this.p, cx = W / 2, cy = 660, R = 116, lo = this.s.lowDetail;
    const ang = p.steer * 1.7 + (p.spinT > 0 ? Math.sin(this.t * 30) * 0.3 : 0);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    // spokes (left, right, bottom) and hub
    ctx.strokeStyle = '#1a1230'; ctx.lineCap = 'round'; ctx.lineWidth = 20;
    ctx.beginPath();
    for (const a of [-1.3, 1.3]) { ctx.moveTo(0, 0); ctx.lineTo(Math.sin(a) * R, -Math.cos(a) * R); }
    ctx.stroke();
    ctx.fillStyle = '#140c26'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(neonA, 0.7); ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '900 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = neonB; ctx.fillText('TC', 0, -10);
    // rim
    ctx.strokeStyle = '#0d0818'; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#231840'; ctx.lineWidth = 14; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R + 10, 0, TAU);
    if (!lo) { ctx.shadowColor = neonA; ctx.shadowBlur = 10; }
    ctx.strokeStyle = hexA(neonA, 0.8); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.shadowBlur = 0;
    // top-centre marker so you can see how far the wheel is turned
    ctx.strokeStyle = neonB; ctx.lineWidth = 14; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2 - 0.09, -Math.PI / 2 + 0.09); ctx.stroke();
    ctx.restore();
  }

  /** rear-view mirror: a dark glimpse of the road behind with the headlights of anyone chasing you */
  drawMirror(ctx, neonA) {
    const p = this.p, mw = 150, mh = 32, mx = W / 2 - mw / 2, my = 100, hzY = my + 12;
    ctx.fillStyle = '#0d0818'; ctx.fillRect(W / 2 - 3, 80, 6, 24);
    ctx.save();
    roundRect(ctx, mx, my, mw, mh, 9); ctx.fillStyle = '#05030c'; ctx.fill();
    ctx.clip();
    const g = ctx.createLinearGradient(0, my, 0, hzY); g.addColorStop(0, this.theme.sky[0]); g.addColorStop(1, this.theme.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(mx, my, mw, hzY - my);
    ctx.fillStyle = this.voidCol; ctx.beginPath(); ctx.moveTo(W / 2 - 6, hzY); ctx.lineTo(W / 2 + 6, hzY); ctx.lineTo(W / 2 + 60, my + mh); ctx.lineTo(W / 2 - 60, my + mh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(this.theme.edge, 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 6, hzY); ctx.lineTo(W / 2 - 60, my + mh); ctx.moveTo(W / 2 + 6, hzY); ctx.lineTo(W / 2 + 60, my + mh); ctx.stroke();
    const T = this.T;
    for (const rv of this.rivals) {
      let gap = p.prog - rv.d;
      if (gap <= 30 || gap > 900) continue;
      const sc = clamp(90 / gap, 0.08, 1.4);
      const x = W / 2 + clamp((rv.off - p.lat) * sc * 0.5, -mw / 2 + 8, mw / 2 - 8), y = hzY + clamp(sc * 14, 1, mh - 16);
      const sp = Math.max(1.5, 9 * sc), r = Math.max(1, 2.6 * sc);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glowDot(ctx, x, y, sp * 2.2, rv.glow, 0.7);
      ctx.restore();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(x - sp / 2, y, r, 0, TAU); ctx.arc(x + sp / 2, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    roundRect(ctx, mx, my, mw, mh, 9); ctx.strokeStyle = neonA; ctx.lineWidth = 1.6; ctx.stroke();
  }

  drawTuner(ctx) {
    const th = this.theme;
    ctx.save();
    ctx.fillStyle = 'rgba(4,2,12,0.82)'; roundRect(ctx, 34, 214, W - 68, 262, 18); ctx.fill();
    ctx.strokeStyle = th.edge; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '900 22px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText('📻 TUNE THE RADIO', W / 2, 248);
    ctx.font = '700 12px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText('The station sets the colours for this run', W / 2, 268);
    // frequency scale with a sliding needle
    const x0 = 70, x1 = W - 70, fy = 312, fx = (f) => x0 + (f - 86) / (104 - 86) * (x1 - x0);
    ctx.fillStyle = '#120a1e'; roundRect(ctx, x0 - 14, fy - 30, x1 - x0 + 28, 44, 8); ctx.fill();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath();
    for (let f = 86; f <= 104; f += 1) { const x = fx(f), tall = f % 2 === 0; ctx.moveTo(x, fy); ctx.lineTo(x, fy - (tall ? 12 : 6)); }
    ctx.stroke();
    ctx.font = '700 10px system-ui'; ctx.fillStyle = '#94a3b8';
    for (let f = 88; f <= 104; f += 4) ctx.fillText(String(f), fx(f), fy - 16);
    const nx = fx(this.dialF);
    ctx.fillStyle = '#ff2a45'; ctx.fillRect(nx - 1.5, fy - 28, 3, 34);
    glowDot(ctx, nx, fy - 12, 16, '#ff2a45', 0.5);
    // the three presets
    this.tuneButtons().forEach((b, i) => {
      const S = STATIONS[i], T2 = THEMES[S.theme], on = i === this.station;
      ctx.fillStyle = on ? hexA(T2.edge, 0.22) : 'rgba(255,255,255,0.05)'; roundRect(ctx, b.x, b.y, b.w, b.h, 12); ctx.fill();
      ctx.strokeStyle = on ? T2.edge : 'rgba(148,163,184,0.4)'; ctx.lineWidth = on ? 2.5 : 1; ctx.stroke();
      ctx.fillStyle = T2.sky[2]; ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, 5);
      ctx.fillStyle = T2.kerb[0]; ctx.fillRect(b.x + 12, b.y + 17, (b.w - 24) / 2, 3); ctx.fillStyle = T2.edge; ctx.fillRect(b.x + 12 + (b.w - 24) / 2, b.y + 17, (b.w - 24) / 2, 3);
      ctx.font = '900 13px system-ui'; ctx.fillStyle = on ? '#fff' : '#cbd5e1'; ctx.fillText(S.name, b.x + b.w / 2, b.y + 44);
      ctx.font = '700 11px system-ui'; ctx.fillStyle = on ? T2.edge : '#94a3b8'; ctx.fillText(`${S.freq.toFixed(1)} FM`, b.x + b.w / 2, b.y + 61);
    });
    ctx.font = '700 12px system-ui'; ctx.fillStyle = '#e2e8f0';
    ctx.fillText('← → to tune · SPACE or tap a station to race', W / 2, 450);
    progressBar(ctx, 70, 460, W - 140, 6, this.tuneT / TUNE_TIME, th.edge, '');
    ctx.restore();
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
      ctx.font = '800 14px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText(`/ ${this.rivals.length + 1}`, 82, 46);
      ctx.font = '700 11px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(need(this.level) === 1 ? 'MUST WIN' : `NEED TOP ${need(this.level)}`, 20, 64);
      ctx.fillStyle = th.edge; ctx.font = '800 12px system-ui'; ctx.fillText(`LAP ${Math.min(LAPS, p.lapDone + 1)}/${LAPS}`, 20, 78);
      const tt = this.raceT; ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.floor(tt / 60)}:${(tt % 60).toFixed(1).padStart(4, '0')}`, 130, 78);
    }
    // live drift counter above the car
    if (p.drift > 1 && p.driftT > 0.25 && (this.playerScr || this.cam.cockpit)) {
      const [sx, sy] = this.cam.cockpit ? [W / 2, HZ + 60] : this.playerScr, a = Math.min(1, p.driftT * 3);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = '900 13px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText('DRIFT', sx, sy - 34);
      ctx.font = '900 26px system-ui'; ctx.fillStyle = s.gold ? '#fde047' : '#ff4fa3';
      ctx.fillText(`${Math.round(p.drift) * 10}${s.multiplier > 1 ? ` ×${s.multiplier}` : ''}`, sx, sy - 8);
      ctx.globalAlpha = 1;
    }
    // speed (in the cockpit it's on the dash)
    if (!this.cam.cockpit) {
      const spd = Math.hypot(p.vx, p.vz), f = clamp(spd / (this.maxV * 1.3), 0, 1), Y = H - 92;
      ctx.fillStyle = 'rgba(5,3,15,0.6)'; roundRect(ctx, 10, Y, 140, 40, 10); ctx.fill();
      progressBar(ctx, 18, Y + 8, 84, 10, f, p.boostT > 0 ? '#67e8f9' : th.edge, '');
      ctx.textAlign = 'right'; ctx.font = '900 14px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(spd * 0.4)}`, 142, Y + 19);
      const bf = p.boostT > 0 ? clamp(p.boostT / p.boostMax, 0, 1) : p.charge;
      progressBar(ctx, 18, Y + 24, 124, 8, bf, p.boostT > 0 ? '#e0f2fe' : this.chargeCol(p.charge), '');
      ctx.fillStyle = 'rgba(248,250,252,0.6)'; ctx.fillRect(18 + BOOST_MIN * 124, Y + 22, 1, 12);
    }
    // fire-boost button
    if (this.tuneT <= 0 && !this.bonus) {
      const b = this.boostButton(), mob = matchMedia('(pointer: coarse)').matches;
      const burning = p.boostT > 0, ready = !burning && p.charge >= BOOST_MIN, full = p.charge >= 1;
      const col = burning ? '#67e8f9' : this.chargeCol(p.charge);
      ctx.fillStyle = ready ? hexA('#22d3ee', full ? 0.28 + 0.12 * Math.sin(this.t * 8) : 0.16) : 'rgba(5,3,15,0.7)';
      roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
      // the meter fills the button from the left
      if (!burning && p.charge > 0) { ctx.save(); roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.clip(); ctx.fillStyle = hexA('#a78bfa', 0.22); ctx.fillRect(b.x, b.y, b.w * p.charge, b.h); ctx.restore(); }
      ctx.strokeStyle = ready || burning ? col : 'rgba(148,163,184,0.45)'; ctx.lineWidth = ready ? 2 : 1.5;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 12px system-ui';
      ctx.fillStyle = ready || burning ? '#f8fafc' : '#94a3b8';
      ctx.fillText(burning ? '⚡ BOOSTING' : mob ? '⚡ BOOST' : '⚡ BOOST  ↑', b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
    // camera switch
    if (this.tuneT <= 0) {
      const b = this.viewButton(), mob = matchMedia('(pointer: coarse)').matches;
      ctx.fillStyle = 'rgba(5,3,15,0.7)'; roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = hexA(th.edge, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 12px system-ui'; ctx.fillStyle = '#e2e8f0';
      ctx.fillText(mob ? '🎥 VIEW' : '🎥 VIEW  C', b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
    // phone controls: hint for the first few seconds, and a tilt meter while tilt is steering
    const mobile = matchMedia('(pointer: coarse)').matches;
    if (mobile && this.tuneT <= 0 && this.raceT < 6) {
      ctx.textAlign = 'center'; ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.6)';
      ctx.fillText(this.tiltOn ? 'Tilt to steer · hold the middle to drift' : this.needTiltPermission ? 'Tap to enable tilt steering · or hold a side to steer' : 'Hold the left or right side to steer', W / 2, H - 52);
    }
    if (this.tiltOn && this.tuneT <= 0) {
      const bw = 90, bh = 10, bx = W / 2 - bw / 2 + 40, by = H - 31, fr = clamp(this.tiltFrac, -1, 1), fw = Math.abs(fr) * (bw / 2 - 3);
      ctx.fillStyle = 'rgba(5,3,15,0.6)'; roundRect(ctx, bx, by, bw, bh, 5); ctx.fill();
      ctx.fillStyle = Math.abs(fr) > 0.6 ? (s.gold ? '#fde047' : '#ff4fa3') : th.edge;   // pink once you're at drift lock
      if (fw > 0.5) { roundRect(ctx, fr < 0 ? bx + bw / 2 - fw : bx + bw / 2, by + 2, fw, bh - 4, 3); ctx.fill(); }
      ctx.fillStyle = 'rgba(226,232,240,0.8)'; ctx.fillRect(bx + bw / 2 - 1, by + 1, 2, bh - 2);
    }
    // countdown
    if (this.count > 0 && this.tuneT <= 0) {
      const n = Math.ceil(this.count / 0.7), ph = (this.count / 0.7) % 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${80 + ph * 30}px system-ui`; ctx.globalAlpha = 0.4 + ph * 0.6;
      ctx.fillStyle = ['#a3e635', '#fde047', '#fb7185'][n - 1] || '#fff'; ctx.fillText(String(n), W / 2, H * 0.3);
      ctx.globalAlpha = 1;
    }
    if (p.wrongT > 1 && !p.finished) {
      ctx.textAlign = 'center'; ctx.font = '900 30px system-ui'; ctx.fillStyle = Math.sin(this.t * 10) > 0 ? '#fb7185' : '#fff';
      ctx.fillText('WRONG WAY!', W / 2, H * 0.24);
    }
    ctx.restore();
  }
}

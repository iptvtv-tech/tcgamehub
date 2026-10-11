// ─────────────────────────────────────────────────────────────
//  TURBO RUSH — game 13 (Zone 3 · Master)
//  A neon highway racer in classic "pseudo-3D" arcade style, with real
//  lit 3D cars (models.js). Reach the checkpoint before the clock runs out.
//  Weave through traffic: every car you pass scores, skimming close past one
//  is a NEAR MISS combo, and tucking in behind one charges a SLIPSTREAM.
//  Hit a car and you lose a life. Run out of time and you lose a life (+15 s).
//
//    L1 slipstream + near misses   L2 hills         L3 rush hour, tunnels, ⏱ pickups
//    L4 trucks + RIVAL duel        L6 night city, 🛡 shields   L7 lane-changers + 🚧 roadworks
//    L8 rain                       L9 🚨 police from behind (+ rival)   L11 fog
//    L12+ everything, faster, tighter clock.  Rival duels on levels 4, 9, 14…
//  Every 5th level: ★ COIN HIGHWAY — no traffic, no clock, grab the coins.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { SPORTS, SEDAN, SUV, TRUCK, POLICE, drawCar, palette, rgb } from '../../assets/js/car-models.js';

const ID = 'turbo-rush';
const W = 480, H = 720;
const HORIZON = 318;                 // screen y of the road's vanishing point
const SEG = 200;                     // length of one road segment (world units)
const ROAD = 1200;                   // half-width of the road (world units); road runs x = -1..1 (20% wider than v2, cars the same size)
const CW = 1000 / ROAD;              // car widths are given at the old road width; this keeps them the same size on screen
const CAM_H = 1000;                  // camera height
const CAM_DEPTH = 0.84;              // ≈ 100° field of view
const PLAYER_Z = CAM_H * CAM_DEPTH;  // distance from camera to the player's car
const BASE_MAX = 12000;              // top speed at level 1 before scaling (world units / s)
const LANES = [-2 / 3, 0, 2 / 3];
const PLAYER_W = 0.36 * CW;
const VS = 340;                      // vertical projection scale (puts the road under the player's car)
const PLAYER_PX = PLAYER_W * ROAD * (CAM_DEPTH / PLAYER_Z) * W / 2;   // the player's car width on screen
const PLAYER_Y = HORIZON + VS * CAM_H * (CAM_DEPTH / PLAYER_Z);
const TUNNEL_H = 2300, TUNNEL_X = 1.28, WALL_X = 1.95;
const WALL_GAP = 9 * SEG;             // traffic never fills all three lanes inside this stretch, so there's always a way through
const HIT_FRONT = 190, HIT_BACK = 120; // how far ahead / behind your rear bumper a car's rear can be and still touch you

const lerp = (a, b, t) => a + (b - a) * t;
const easeIn = (a, b, t) => a + (b - a) * t * t;
const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a, b, t) => css(mixA(a, b, t));
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

// Colour themes
const THEMES = {
  dusk:  { sky: ['#1e0b3d', '#7c2d6b', '#f97316'], sun: '#fbbf24', grass: ['#1a0f33', '#150c2b'], rumble: ['#f472b6', '#e2e8f0'], road: ['#2a2540', '#262139'], lane: '#e2e8f0', fog: '#3b1d55', city: '#2b1247', glow: '#f472b6',
    scenery: 'palms', mount: ['#3b1260', '#25093f'], ridge: '#f472b6', amb: 0.5, halo: 0.35, leaf: '#3a0f4c', trunk: '#24092f' },
  night: { sky: ['#020617', '#0b1030', '#1e1b4b'], sun: '#e2e8f0', grass: ['#0b0f1f', '#090c1a'], rumble: ['#22d3ee', '#1e293b'], road: ['#161a2e', '#131728'], lane: '#67e8f9', fog: '#0b1030', city: '#0f172a', glow: '#22d3ee',
    scenery: 'city', mount: ['#0d1336', '#080c26'], ridge: '#22d3ee', amb: 0.3, halo: 1, bcols: ['#141b33', '#1a1f3d', '#111827', '#1c1631'], win: ['#67e8f9', '#fde68a', '#f0abfc'] },
  rain:  { sky: ['#0b1220', '#1e293b', '#334155'], sun: null, grass: ['#0f1622', '#0c121c'], rumble: ['#a3e635', '#1e293b'], road: ['#1c2331', '#19202d'], lane: '#cbd5e1', fog: '#1e293b', city: '#111827', glow: '#a3e635',
    scenery: 'city', mount: ['#1a2333', '#121a28'], ridge: null, amb: 0.34, halo: 0.9, wet: true, bcols: ['#1f2937', '#273244', '#1a2230', '#222b3b'], win: ['#fde68a', '#bef264', '#e2e8f0'] },
  fog:   { sky: ['#1f2937', '#4b5563', '#9ca3af'], sun: null, grass: ['#1f2a24', '#1b251f'], rumble: ['#fb7185', '#e5e7eb'], road: ['#2d3340', '#2a303c'], lane: '#f1f5f9', fog: '#8b93a1', city: '#374151', glow: '#fb7185',
    scenery: 'forest', mount: ['#6b7280', '#4b5563'], ridge: null, amb: 0.55, halo: 0.45, leaf: '#1f3b2d', trunk: '#2b211b' },
  gold:  { sky: ['#2a1403', '#7c2d12', '#fbbf24'], sun: '#fde68a', grass: ['#2b1705', '#241304'], rumble: ['#fbbf24', '#fff7ed'], road: ['#3a2a14', '#352612'], lane: '#fde68a', fog: '#7c2d12', city: '#451a03', glow: '#fbbf24',
    scenery: 'palms', mount: ['#7c2d12', '#5a1f0b'], ridge: '#fde68a', amb: 0.55, halo: 0.3, leaf: '#92400e', trunk: '#5a2a0a' },
};
// traffic uses cool colours only, so the player's RED car always stands out
const CAR_COLS = ['#22d3ee', '#a78bfa', '#34d399', '#60a5fa', '#facc15', '#e2e8f0', '#2dd4bf', '#818cf8', '#94a3b8', '#c4b5fd'];
const BILLBOARDS = ['TURBO', 'RUSH', 'QUICK PLAY', 'NEON CITY', 'FAST LANE', 'TC ARCADE', 'NO BRAKES', 'GO GO GO'];
const SIGNS = ['NEON CITY  12', 'CHECKPOINT  →', 'TC HUB  8', 'ARCADE  5', 'SKYLINE  21', 'EXIT  44'];

function themeFor(level, bonus) {
  if (bonus) return 'gold';
  if (level >= 11) return ['fog', 'rain', 'night'][(level - 11) % 3];     // 11 fog · 12 rain · 13 night · 14 fog …
  if (level === 8) return 'rain';
  if (level >= 6) return 'night';
  return 'dusk';
}

runGame({
  id: ID,
  width: W, height: H,
  detail: true,                      // offers the 🖥 Graphics HIGH / LOW switch
  lives: 3,
  comboWindow: 3,
  comboStep: 3,
  maxMultiplier: 6,
  bonusTime: 15,
  music: { bpm: 128, style: 'minor', lead: 'sawtooth', bass: 'drive', arp: [0, 2, 4, 2, 1, 3, 5, 3] },
  levelInfo(level, bonus) {
    if (bonus) return '★ COIN HIGHWAY! No traffic, no clock — grab every coin you can in 15 seconds. Big ★ coins are worth 10.';
    const notes = {
      1: 'Reach the checkpoint before the clock runs out! Steer ← →, ↑ boost, ↓ brake. Skim past cars for NEAR MISS combos, and tuck in behind one to charge a SLIPSTREAM (free nitro).',
      2: 'Hills ahead — you can\'t see what\'s over the top.',
      3: 'Rush hour: more traffic — and tunnels. Grab ⏱ for +3 seconds.',
      4: '🏁 RIVAL DUEL! Beat VIPER to the checkpoint for a big bonus. 🚚 Trucks are wide and slow.',
      6: '🌙 Night in the city. 🛡 Shields soak up one crash.',
      7: '↔️ Some drivers change lanes — they blink first! 🚧 Roadworks close a lane: hit the cones and you lose speed.',
      8: '🌧️ Rain: less grip, the road pulls you wide on bends.',
      9: '🚨 Police come up FROM BEHIND — watch the arrow at the bottom and get out of their lane! VIPER is back too.',
      11: '🌫️ Fog: you can\'t see far. Trust your reflexes.',
    };
    if (notes[level]) return notes[level];
    if (level % 5 === 4) return '🏁 RIVAL DUEL — beat VIPER to the checkpoint!';
    return 'Faster traffic, tighter clock. Keep your foot down!';
  },
  create: (shell) => new TurboRush(shell),
});

// ── Pre-drawn scenery sprites (one set per theme) ─────────────
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/** A sprite's world size → a canvas with the same on-screen shape. */
function spriteCanvas(ww, wh, px = 150) { return canvas(px, Math.round(px * (wh * VS) / (ww * W / 2))); }

function makeSprites(id, th0) {
  const S = {}, th = { leaf: '#1f3b2d', trunk: '#2b211b', ...th0 };
  // palm tree
  {
    const ww = 1700, wh = 2500, c = spriteCanvas(ww, wh, 170), g = c.getContext('2d'), w = c.width, h = c.height;
    const topX = w * 0.58, topY = h * 0.2;
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {                                  // ringed trunk
      const t0 = i / 14, t1 = (i + 1) / 14;
      const x0 = lerp(w * 0.46, topX, t0) + Math.sin(t0 * 3) * w * 0.04, y0 = lerp(h, topY, t0);
      const x1 = lerp(w * 0.46, topX, t1) + Math.sin(t1 * 3) * w * 0.04, y1 = lerp(h, topY, t1);
      g.strokeStyle = i % 2 ? th.trunk : css(mixA(hex(th.trunk), [255, 255, 255], 0.12)); g.lineWidth = lerp(w * 0.08, w * 0.05, t0);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    const leaves = 9;
    for (let i = 0; i < leaves; i++) {
      const a = -Math.PI * 0.95 + (i / (leaves - 1)) * Math.PI * 0.9 + (i % 2 ? 0.08 : -0.05), len = w * (0.42 + (i % 3) * 0.06);
      const ex = topX + Math.cos(a) * len, ey = topY + Math.sin(a) * len * 0.55 + len * 0.45;
      const mx = topX + Math.cos(a) * len * 0.5, my = topY + Math.sin(a) * len * 0.6 - len * 0.12;
      g.strokeStyle = th.leaf; g.lineWidth = 2;
      g.beginPath(); g.moveTo(topX, topY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      for (let k = 1; k <= 12; k++) {                                 // leaflets along the frond
        const t = k / 13, qx = (1 - t) * (1 - t) * topX + 2 * (1 - t) * t * mx + t * t * ex, qy = (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * my + t * t * ey;
        const ll = w * 0.11 * Math.sin(t * Math.PI) + 2;
        g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + Math.cos(a + 1.9) * ll * 0.6, qy + ll); g.moveTo(qx, qy); g.lineTo(qx + Math.cos(a - 1.9) * ll * 0.6, qy + ll * 0.9); g.stroke();
      }
    }
    if (th.ridge) { g.globalCompositeOperation = 'source-atop'; const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, th.ridge + '55'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    S.palm = { img: c, ww, wh };
  }
  // pine tree
  {
    const ww = 1150, wh = 2700, c = spriteCanvas(ww, wh, 120), g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#2b211b'; g.fillRect(w * 0.45, h * 0.82, w * 0.1, h * 0.18);
    const base = hex(th.leaf || '#1f3b2d');
    for (let i = 0; i < 5; i++) {
      const y0 = h * (0.86 - i * 0.16), y1 = y0 - h * 0.3, hw = w * (0.5 - i * 0.08);
      g.fillStyle = css(mixA(base, [0, 0, 0], 0.25 - i * 0.03));
      g.beginPath(); g.moveTo(w / 2 - hw, y0); g.lineTo(w / 2, y1); g.lineTo(w / 2 + hw, y0); g.closePath(); g.fill();
      g.fillStyle = css(mixA(base, [190, 220, 200], 0.12));
      g.beginPath(); g.moveTo(w / 2, y1); g.lineTo(w / 2 + hw, y0); g.lineTo(w / 2 + hw * 0.4, y0 - h * 0.02); g.closePath(); g.fill();
    }
    S.pine = { img: c, ww, wh };
  }
  // rock + bush
  {
    const ww = 950, wh = 420, c = spriteCanvas(ww, wh, 120), g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#4b5563'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.12, h * 0.4); g.lineTo(w * 0.4, h * 0.05); g.lineTo(w * 0.7, h * 0.2); g.lineTo(w * 0.92, h * 0.55); g.lineTo(w, h); g.fill();
    g.fillStyle = '#6b7280'; g.beginPath(); g.moveTo(w * 0.4, h * 0.05); g.lineTo(w * 0.7, h * 0.2); g.lineTo(w * 0.55, h); g.lineTo(w * 0.3, h); g.fill();
    S.rock = { img: c, ww, wh };
    const b = spriteCanvas(800, 380, 110), bg = b.getContext('2d');
    for (let i = 0; i < 7; i++) { bg.fillStyle = i % 2 ? (th.leaf || '#1f3b2d') : css(mixA(hex(th.leaf || '#1f3b2d'), [255, 255, 255], 0.08)); bg.beginPath(); bg.arc(b.width * (0.2 + i * 0.1), b.height * (0.7 - (i % 3) * 0.12), b.width * 0.16, 0, Math.PI * 2); bg.fill(); }
    S.bush = { img: b, ww: 800, wh: 380 };
  }
  // neon billboards
  S.bb = BILLBOARDS.map((txt, i) => {
    const ww = 2100, wh = 1700, c = spriteCanvas(ww, wh, 220), g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#1f2937'; g.fillRect(w * 0.2, h * 0.5, w * 0.04, h * 0.5); g.fillRect(w * 0.76, h * 0.5, w * 0.04, h * 0.5);
    const col = [th.glow, '#22d3ee', '#f472b6', '#a3e635', '#fbbf24'][i % 5];
    g.fillStyle = '#0b0b1a'; roundRect(g, w * 0.04, h * 0.06, w * 0.92, h * 0.48, 6); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.shadowColor = col; g.shadowBlur = 12; roundRect(g, w * 0.06, h * 0.08, w * 0.88, h * 0.44, 5); g.stroke();
    g.fillStyle = col; g.font = `900 ${Math.round(h * 0.2)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, w / 2, h * 0.3, w * 0.8);
    g.shadowBlur = 0; g.fillStyle = '#334155'; g.fillRect(w * 0.1, h * 0.54, w * 0.8, h * 0.03);
    return { img: c, ww, wh };
  });
  return S;
}

/** The sky: a static gradient, plus wide mountain and skyline strips that scroll with the bends. */
function makeSky(th, id, rng) {
  const sky = canvas(W, HORIZON), g = sky.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, HORIZON);
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.6, th.sky[1]); gr.addColorStop(1, th.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, W, HORIZON);
  if (id === 'dusk' || id === 'gold') {                              // long sunset clouds
    for (let i = 0; i < 9; i++) {
      const y = 40 + i * 22 + rng() * 10, x = rng() * W, w = 80 + rng() * 160;
      g.fillStyle = `rgba(255,${id === 'gold' ? 200 : 140},${id === 'gold' ? 120 : 200},${0.06 + rng() * 0.08})`;
      g.beginPath(); g.ellipse(x, y, w, 5 + rng() * 5, 0, 0, Math.PI * 2); g.fill();
    }
  }
  if (id === 'rain') for (let i = 0; i < 14; i++) {                 // heavy clouds
    g.fillStyle = `rgba(15,23,42,${0.25 + rng() * 0.3})`; g.beginPath(); g.ellipse(rng() * W, 20 + rng() * 140, 90 + rng() * 120, 22 + rng() * 20, 0, 0, Math.PI * 2); g.fill();
  }
  // mountains (two layers)
  const MW = W * 2, mh = 150, mount = canvas(MW, mh), mg = mount.getContext('2d');
  const ridge = (amp, base, seed, f) => { const pts = []; for (let x = 0; x <= MW; x += 8) { const t = x / MW * Math.PI * 2; pts.push([x, base - amp * (0.5 + 0.3 * Math.sin(t * 2 + seed) + 0.15 * Math.sin(t * 5 + seed * 2) + 0.08 * Math.sin(t * 11 + seed * 3)) * f]); } return pts; };
  for (const [li, col] of th.mount.entries()) {
    const pts = ridge(li ? 60 : 110, mh, li * 3.1 + 1, 1);
    mg.fillStyle = col; mg.beginPath(); mg.moveTo(0, mh); for (const p of pts) mg.lineTo(...p); mg.lineTo(MW, mh); mg.fill();
    if (th.ridge && li === 0) { mg.strokeStyle = th.ridge; mg.globalAlpha = 0.55; mg.lineWidth = 1.5; mg.beginPath(); pts.forEach((p, i) => (i ? mg.lineTo(...p) : mg.moveTo(...p))); mg.stroke(); mg.globalAlpha = 1; }
    if (id === 'fog') { mg.fillStyle = `rgba(139,147,161,${li ? 0.35 : 0.55})`; mg.fillRect(0, 0, MW, mh); }
  }
  // skyline
  const CW = W * 2, ch = 130, city = canvas(CW, ch), cg = city.getContext('2d');
  let x = 0;
  while (x < CW) {
    const w = 18 + rng() * 26, h = 24 + rng() * (id === 'night' || id === 'rain' ? 100 : 70);
    cg.fillStyle = th.city; cg.fillRect(x, ch - h, w, h);
    if (rng() < 0.25) cg.fillRect(x + w / 2 - 1, ch - h - 12, 2, 12);    // antenna
    if (id !== 'fog') for (let wy = ch - h + 5; wy < ch - 4; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rng() < (id === 'dusk' || id === 'gold' ? 0.12 : 0.3)) { cg.fillStyle = th.glow; cg.globalAlpha = 0.25 + rng() * 0.5; cg.fillRect(wx, wy, 2, 2); cg.globalAlpha = 1; }
    x += w + rng() * 4;
  }
  return { sky, mount, city };
}

class TurboRush {
  constructor(s) {
    this.s = s; this.t = 0;
    this.rain = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 500 }));
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * HORIZON * 0.8, r: Math.random() * 1.3 + 0.3 }));
    this.sprites = {}; this.skies = {};
    this.startLevel(1, false);
  }

  reset() {}

  /** LOW graphics: shorter view, fewer trees, simpler far cars, no glows. */
  applyDetail() { this.lo = this.s.lowDetail; this.drawDist = this.themeId === 'fog' ? 70 : this.lo ? 95 : 150; }
  onDetailChange() { this.applyDetail(); }

  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.themeId = themeFor(level, bonus);
    this.theme = THEMES[this.themeId];
    const th = this.theme;
    this.col = { grass: th.grass.map(hex), rumble: th.rumble.map(hex), road: th.road.map(hex), fog: hex(th.fog) };
    this.spr = this.sprites[this.themeId] ||= makeSprites(this.themeId, th);
    this.sky = this.skies[this.themeId] ||= makeSky(th, this.themeId, mulberry(level * 977 + 13));
    this.maxSpeed = BASE_MAX * 0.78 * s.speed(0.028, 1.45, level) * (bonus ? 1.1 : 1);
    this.grip = this.themeId === 'rain' ? 0.8 : 1;
    this.centrifugal = this.themeId === 'rain' ? 0.42 : 0.3;
    this.applyDetail();
    this.fogDensity = this.themeId === 'fog' ? 6 : this.themeId === 'rain' ? 3 : 2;
    this.feat = {
      tunnels: !bonus && level >= 3, rival: !bonus && level % 5 === 4, closures: !bonus && level >= 7,
      police: !bonus && level >= 9, timePU: !bonus && level >= 3, shieldPU: !bonus && level >= 6,
    };
    this.position = 0; this.speed = 0; this.playerX = 0; this.playerY = 0; this.steer = 0;
    this.skyOff = 0; this.boost = 1; this.boosting = false;
    this.invuln = 0; this.crashFx = 0; this.shakeT = 0;
    this.near = 0; this.nearChain = 0; this.passedCount = 0; this.crashes = 0; this.coinsGot = 0;
    this.draft = 0; this.draftCool = 0; this.drafts = 0; this.shield = false; this.coneCool = 0;
    this.flash = 0; this.nextFlash = r.range(3, 7); this.sirenT = 0;
    this.buildTrack(r);
    this.closures = this.buildClosures(r);
    this.decorate(r);
    this.cars = bonus ? [] : this.buildTraffic(r);
    this.pickups = this.buildPickups(r);
    this.rival = this.feat.rival ? { rival: true, z: PLAYER_Z, x: LANES[2], lane: 2, speed: 0, w: 0.35 * CW, pace: Math.min(0.97, 0.89 + level * 0.004), done: false, boostT: 0 } : null;
    this.police = null; this.policeNext = r.range(7, 12);
    this.levelT = 0; this.rec = []; this.recT = 0;
    this.ghostRun = bonus ? null : loadGhost(s.mode || 'normal', level);
    this.ghost = this.ghostRun ? { ghost: true, z: 0, x: 0, w: 0.35 * CW, kind: 'sports', color: '#e0f2fe' } : null;
    this.ghostDelta = null;
    const avg = Math.min(0.76, 0.62 + level * 0.01);            // average speed the clock expects (fraction of top speed)
    this.timeMax = bonus ? 0 : Math.round(this.finishZ / (this.maxSpeed * avg) + 3 + (this.closures.length ? 2 : 0));
    this.timeLeft = this.timeMax;
    this.done = false;
  }

  // ── Track ──────────────────────────────────────────────────
  buildTrack(r) {
    const L = this.level, segs = [];
    let lastY = 0;
    const add = (enter, hold, leave, curve, y, tunnel = false) => {
      const startY = lastY, endY = startY + y * SEG, total = enter + hold + leave;
      for (let n = 0; n < total; n++) {
        const c = n < enter ? easeIn(0, curve, n / enter) : n < enter + hold ? curve : easeInOut(curve, 0, (n - enter - hold) / leave);
        const yy = easeInOut(startY, endY, (n + 1) / total);
        const i = segs.length;
        segs.push({ i, curve: c, y1: i ? segs[i - 1].y2 : 0, y2: yy, p1: {}, p2: {}, clip: 0, tunnel });
      }
      lastY = endY;
    };
    const secs = this.bonus ? 17 : 38 + Math.min(14, L);
    const want = Math.ceil(this.maxSpeed * 0.9 * secs / SEG);
    add(20, 40, 20, 0, 0);                                      // straight start
    const hills = L >= 2 || this.bonus;
    const curveMax = this.bonus ? 3 : Math.min(6, 2 + L * 0.35);
    let lastTunnel = -999;
    while (segs.length < want) {
      const kind = r.int(0, 9);
      const len = r.pick([25, 40, 55]);
      const curve = (r.chance(0.5) ? -1 : 1) * r.range(1.5, curveMax);
      const hill = hills ? r.pick([0, 20, 40, 60]) * (r.chance(0.5) ? -1 : 1) * (this.bonus ? 0.5 : 1) : 0;
      if (this.feat.tunnels && segs.length - lastTunnel > 260 && segs.length > 120 && segs.length < want - 150 && r.chance(0.3)) {
        add(15, 15, 15, 0, 0);                                   // level out before the portal
        add(r.int(25, 40), r.int(30, 60), r.int(25, 40), curve * 0.6, 0, true);
        lastTunnel = segs.length;
        continue;
      }
      if (kind <= 2) add(len, len, len, 0, hill);
      else if (kind <= 6) add(len, len, len, curve, hill);
      else if (kind === 7) { add(len, len / 2 | 0, len, curve, hill / 2); add(len, len / 2 | 0, len, -curve, -hill / 2); }  // S-bend
      else add(len / 2 | 0, len / 2 | 0, len / 2 | 0, 0, hills ? r.pick([-40, 40]) : 0);                                 // quick hill
    }
    const finishIndex = segs.length + 10;
    add(30, 30, 30, 0, -lastY / SEG);                            // level out for the checkpoint
    add(40, 160, 40, 0, 0);                                      // run-off after the line
    for (let i = 1; i < segs.length; i++) if (segs[i].tunnel && !segs[i - 1].tunnel) segs[i].portal = true;
    this.segs = segs;
    this.finishIndex = finishIndex;
    this.finishZ = finishIndex * SEG;
    this.trackLen = segs.length * SEG;
  }
  segAt(z) { return this.segs[clamp(Math.floor(z / SEG), 0, this.segs.length - 1)]; }

  /** 🚧 Roadworks: one lane closed by cones for a stretch. */
  buildClosures(r) {
    const out = [];
    if (!this.feat.closures) return out;
    const n = this.level >= 12 ? 2 : 1;
    for (let k = 0; k < 40 && out.length < n; k++) {
      const a = r.int(90, this.finishIndex - 90), len = r.int(24, 38);
      if (out.some((c) => Math.abs(c.a - a) < 90)) continue;
      out.push({ a, b: a + len, lane: r.int(0, 2), z0: a * SEG, z1: (a + len) * SEG });
    }
    for (const c of out) for (let i = c.a - 4; i <= c.b; i++) if (this.segs[i]) (this.segs[i].cl ||= []).push(c);
    return out;
  }
  closedAt(lane, z) { return this.closures.find((c) => c.lane === lane && z >= c.z0 - 3 * SEG && z <= c.z1); }

  /** Roadside scenery for this theme. */
  decorate(r) {
    const th = this.theme, kind = th.scenery;
    const run = [0, 0], inWall = [false, false], bh = [0, 0], bc = ['', ''];
    let nextGantry = r.int(50, 80), nextBB = r.int(20, 40);
    for (const seg of this.segs) {
      seg.props = []; seg.wall = [null, null];
      if (seg.tunnel) { run[0] = run[1] = 0; inWall[0] = inWall[1] = false; continue; }
      const nearLine = Math.abs(seg.i - this.finishIndex) < 6;
      seg.lamp = seg.i % 12 === 0;
      if (kind === 'city') {
        for (const side of [0, 1]) {
          if (run[side] <= 0) {
            inWall[side] = !inWall[side] && seg.i > 30;
            run[side] = inWall[side] ? r.int(14, 42) : r.int(5, 14);
            if (inWall[side]) { bh[side] = r.range(2600, 7500); bc[side] = r.pick(th.bcols); }
          }
          if (inWall[side] && !nearLine) seg.wall[side] = { h: bh[side], col: hex(bc[side]), first: run[side] === (seg.wall[side]?.len ?? -1), seed: seg.i * 7 + side };
          run[side]--;
        }
        // the face of each block that looks back at you
        for (const side of [0, 1]) if (seg.wall[side] && !this.segs[seg.i - 1]?.wall?.[side]) seg.wall[side].first = true;
      } else if (kind === 'palms') {
        for (const sd of [-1, 1]) if (r.chance(0.2)) seg.props.push({ k: 'palm', x: sd * r.range(1.5, 3.6) });
        if (r.chance(0.04)) seg.props.push({ k: 'bush', x: r.pick([-1, 1]) * r.range(1.4, 2) });
      } else {
        for (const sd of [-1, 1]) { if (r.chance(0.42)) seg.props.push({ k: 'pine', x: sd * r.range(1.55, 4.5) }); if (r.chance(0.05)) seg.props.push({ k: 'rock', x: sd * r.range(1.45, 2.6) }); if (r.chance(0.12)) seg.props.push({ k: 'bush', x: sd * r.range(1.4, 2.2) }); }
        seg.rail = true;
      }
      if (--nextBB <= 0 && !nearLine) {
        const sd = r.pick([-1, 1]);
        if (!seg.wall[sd < 0 ? 0 : 1]) seg.props.push({ k: 'bb', x: sd * r.range(1.7, 2.4), n: r.int(0, BILLBOARDS.length - 1) });
        nextBB = r.int(25, 50);
      }
      if (--nextGantry <= 0 && seg.i < this.finishIndex - 30) { seg.gantry = r.pick(SIGNS); nextGantry = r.int(60, 100); }
      seg.props.sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
    }
  }

  buildTraffic(r) {
    const L = this.level, cars = [];
    const gap = Math.max(12, 30 - L * 1.5);                      // segments between cars (on average)
    let pairGap = 0;
    const kindFor = (truck) => (truck ? 'truck' : r.chance(0.25) ? 'suv' : r.chance(0.15) ? 'sports' : 'sedan');
    const pickLane = (z, avoid = -1) => {
      let lane = r.int(0, 2);
      for (let k = 0; k < 4 && (lane === avoid || this.closedAt(lane, z) || this.nearClosure(lane, z)); k++) lane = (lane + 1) % 3;
      return lane;
    };
    for (let i = 45; i < this.finishIndex - 10; i += Math.max(6, Math.round(gap * r.range(0.5, 1.5))) + pairGap) {
      pairGap = 0;
      const truck = L >= 4 && r.chance(Math.min(0.3, 0.12 + L * 0.012));
      const lane = pickLane(i * SEG);
      if (this.nearClosure(lane, i * SEG)) continue;
      const kind = kindFor(truck);
      cars.push({
        z: i * SEG, x: LANES[lane], lane, truck, kind,
        w: (truck ? 0.5 : kind === 'suv' ? 0.37 : 0.36) * CW,
        speed: this.maxSpeed * (truck ? r.range(0.2, 0.3) : r.range(0.28, 0.5 + Math.min(0.15, L * 0.01))),
        color: r.pick(CAR_COLS),
        changer: !truck && L >= 7 && r.chance(Math.min(0.35, 0.12 + (L - 7) * 0.03)),
        blink: 0, nextChange: r.range(1.5, 4), scored: false, ahead: true,
      });
      // sometimes a second car side by side (never all three lanes)
      if (L >= 3 && r.chance(Math.min(0.28, 0.08 + L * 0.015))) {
        pairGap = 8;                                             // always room to get round a pair before the next car
        const l2 = (lane + r.int(1, 2)) % 3;
        if (this.nearClosure(l2, i * SEG)) continue;
        cars.push({ z: i * SEG + r.range(-60, 60), x: LANES[l2], lane: l2, truck: false, kind: kindFor(false), w: 0.36 * CW, speed: cars[cars.length - 1].speed, color: r.pick(CAR_COLS), changer: false, blink: 0, nextChange: 99, scored: false, ahead: true });
      }
    }
    return cars;
  }
  /** would moving `car` into `lane` now cut you off, or fill the last open lane? */
  cutsOff(car, lane, pz) {
    if (this.closedAt(car.lane, car.z + 4 * SEG)) return false;     // it has to merge out of roadworks whatever happens
    const dz = car.z - pz, close = Math.max(0, this.speed - car.speed);
    // you'd reach it within ~0.7s (or you're alongside it) and you're in or heading for that lane
    if (dz > -HIT_BACK - 60 && dz < Math.max(3 * SEG, close * 0.7) && Math.abs(this.playerX - LANES[lane]) < 0.55) return true;
    const busy = [false, false, false]; busy[lane] = true;
    for (const o of this.cars) if (o !== car && !o.police && Math.abs(o.z - car.z) < WALL_GAP) busy[o.lane] = true;
    return busy[0] && busy[1] && busy[2];
  }
  /** is a closure in this lane within the stretch where a car starting here would meet it? */
  nearClosure(lane, z) { return this.closures.some((c) => c.lane === lane && z > c.z0 - 40 * SEG && z < c.z1 + 2 * SEG); }

  buildPickups(r) {
    const out = [];
    if (this.bonus) {
      // long ribbons of coins that weave across the lanes, with the odd big ★ coin
      for (let i = 40; i < this.finishIndex; i += 3) {
        const x = Math.sin(i / 23) * 0.66;
        out.push({ z: i * SEG, x, kind: i % 45 === 0 ? 'star' : 'coin' });
      }
      return out;
    }
    const free = (lane, i) => !this.closures.some((c) => c.lane === LANES.indexOf(lane) && i >= c.a - 6 && i <= c.b + 2);
    for (let i = 60; i < this.finishIndex - 20; i += r.int(28, 55)) {
      const nitro = r.chance(0.3);
      let lane = r.pick(LANES);
      if (!free(lane, i)) lane = LANES.find((l) => free(l, i)) ?? lane;
      if (nitro) out.push({ z: i * SEG, x: lane, kind: 'nitro' });
      else for (let k = 0; k < 5; k++) out.push({ z: (i + k * 2) * SEG, x: lane, kind: 'coin' });
    }
    const special = (kind, n) => {
      for (let k = 0; k < n; k++) {
        const i = r.int(Math.floor(this.finishIndex * (k + 0.2) / n), Math.floor(this.finishIndex * (k + 0.8) / n));
        const lane = r.pick(LANES);
        if (i > 60 && i < this.finishIndex - 20 && free(lane, i)) out.push({ z: i * SEG, x: lane, kind });
      }
    };
    if (this.feat.timePU) special('time', 2);
    if (this.feat.shieldPU && r.chance(0.7)) special('shield', 1);
    return out;
  }

  // ── Input ──────────────────────────────────────────────────
  controls() {
    const s = this.s, inp = s.input, p = inp.pointer;
    let left = inp.isDown('left'), right = inp.isDown('right'), boost = inp.isDown('up'), brake = inp.isDown('down');
    if (p.down) {
      if (p.x < W * 0.36) left = true;
      else if (p.x > W * 0.64) right = true;
      else boost = true;
    }
    return { left, right, boost, brake };
  }

  onLifeLost() {
    const pz = this.position + PLAYER_Z;
    this.speed = 0; this.invuln = 2;
    this.playerX = LANES.reduce((a, b) => (Math.abs(b - this.playerX) < Math.abs(a - this.playerX) ? b : a));
    this.cars = this.cars.filter((c) => !c.police && (c.z < pz - 300 || c.z > pz + 26 * SEG));     // clear the road ahead
    this.police = null; this.policeNext = 6;
    if (this.timeLeft <= 0) this.timeLeft = 15;
    else this.timeLeft += 5;                                         // a crash already costs a life — don't lose the checkpoint too
    this.nearChain = 0; this.draft = 0;
  }

  idle(dt) { this.t += dt; }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s, L = this.level;
    this.t += dt;
    if (this.done) return;
    const c = this.controls();
    const max = this.maxSpeed;
    const seg = this.segAt(this.position + PLAYER_Z);
    const pct = this.speed / max;

    // steering + the road pulling you wide on bends
    const dx = dt * (2 + 0.5 * clamp(pct, 0, 1.3)) * Math.min(1, pct + 0.15) * this.grip;   // quicker lane changes the faster you go
    if (c.left) this.playerX -= dx;
    if (c.right) this.playerX += dx;
    this.playerX -= dx * pct * seg.curve * this.centrifugal;
    this.steer = lerp(this.steer || 0, (c.right ? 1 : 0) - (c.left ? 1 : 0), Math.min(1, dt * 10));
    this.braking = c.brake;

    // speed: foot down by default, boost burns nitro
    this.boosting = c.boost && this.boost > 0.02 && !c.brake;
    const top = this.boosting ? max * 1.28 : max;
    if (c.brake) this.speed -= max * 1.2 * dt;
    else if (this.speed < top) this.speed += max / (this.boosting ? 2.5 : 4.2) * dt;
    else this.speed -= max / 3 * dt;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.28);
    else this.boost = Math.min(1, this.boost + dt * 0.035);
    const off = Math.abs(this.playerX) > 1;
    if (off && this.speed > max / 4) this.speed -= max * 0.9 * dt;
    this.speed = clamp(this.speed, 0, max * 1.3);
    const wl = seg.wall?.[0] ? -(WALL_X - 0.3) : -2.2, wr = seg.wall?.[1] ? WALL_X - 0.3 : 2.2;
    if ((this.playerX < wl || this.playerX > wr) && this.speed > 300) {          // scraping along a building
      this.speed *= Math.pow(0.4, dt); this.shakeT = 0.05;
      if (Math.random() < dt * 20) s.fx.burst(W / 2 + (this.playerX < 0 ? -45 : 45), PLAYER_Y - 20, { colors: ['#fde047', '#f97316', '#fff'], count: 3, speed: 160, life: 0.3 });
    }
    this.playerX = clamp(this.playerX, seg.tunnel ? -1.12 : wl, seg.tunnel ? 1.12 : wr);
    if (off && this.speed > 500) { this.shakeT = 0.05; if (Math.random() < dt * 8) s.fx.burst(W / 2 + (this.playerX > 0 ? 40 : -40), H - 70, { colors: ['#94a3b8', '#64748b'], count: 2, speed: 90, life: 0.3 }); }

    this.position += this.speed * dt;
    const pz = this.position + PLAYER_Z;
    this.skyOff += seg.curve * pct * dt * 0.9;
    const ps = this.segAt(pz), pp = (pz % SEG) / SEG;
    this.playerY = lerp(ps.y1, ps.y2, pp);
    this.inTunnel = ps.tunnel;
    this.levelT += dt;
    if (!this.bonus && (this.recT -= dt) <= 0) {                     // record this run (for next time's ghost)
      this.recT += GHOST_DT;
      if (this.rec.length < 2400) this.rec.push([Math.round(clamp(pz / this.finishZ, 0, 1) * 10000), Math.round(this.playerX * 100)]);
    }
    if (this.ghost) {
      const gs = this.ghostRun.s, k = this.levelT / GHOST_DT, i = Math.min(gs.length - 1, Math.floor(k)), j = Math.min(gs.length - 1, i + 1), u = k - Math.floor(k);
      const fr = lerp(gs[i][0], gs[j][0], i === j ? 0 : u) / 10000;
      this.ghost.z = this.levelT >= this.ghostRun.t ? this.finishZ + (this.levelT - this.ghostRun.t) * this.maxSpeed : fr * this.finishZ;
      this.ghost.x = lerp(gs[i][1], gs[j][1], i === j ? 0 : u) / 100;
      // how far ahead or behind your best you are: when did the ghost reach where you are now?
      const me = pz / this.finishZ * 10000;
      let gi = 0; while (gi < gs.length - 1 && gs[gi + 1][0] < me) gi++;
      const a = gs[gi], b = gs[Math.min(gs.length - 1, gi + 1)], uu = b[0] > a[0] ? clamp((me - a[0]) / (b[0] - a[0]), 0, 1) : 0;
      this.ghostDelta = this.levelT - (gi + uu) * GHOST_DT;
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.coneCool > 0) this.coneCool -= dt;
    if (this.draftCool > 0) this.draftCool -= dt;
    if (this.themeId === 'rain' && (this.nextFlash -= dt) <= 0) { this.flash = 1; this.nextFlash = s.rng.range(5, 11); s.sound.tone({ freq: 70, to: 35, dur: 0.9, type: 'sine', vol: 0.12, delay: 0.25 }); }
    this.flash = Math.max(0, this.flash - dt * 2.2);

    // distance points
    if (!this.bonus) {
      this.distPts = (this.distPts || 0) + this.speed * dt / 60 * (1 + L * 0.1);
      if (this.distPts >= 1) { const n = Math.floor(this.distPts); this.distPts -= n; s.award(n); }
    }

    // clock
    if (this.timeMax) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 5 && Math.ceil(this.timeLeft) !== Math.ceil(this.timeLeft + dt) && this.timeLeft > 0) s.sound.play('tick');
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        s.fx.text(W / 2, HORIZON, 'TIME UP!', { color: '#f87171', size: 44, life: 1.4 });
        s.sound.play('boom');
        s.hurt();
        return;
      }
    }

    this.updatePolice(dt, pz);
    this.updateRival(dt, pz);

    // traffic: everyone drives at their own pace, but slows down rather than hit the car in front — or you
    const sorted = this.cars;
    sorted.sort((a, b) => a.z - b.z);
    for (let i = 0; i < sorted.length; i++) {
      const car = sorted[i];
      car.base ??= car.speed;
      if (car.police) continue;
      let v = car.base;
      for (let j = i + 1; j < sorted.length && sorted[j].z - car.z < SEG * 3; j++) {
        const o = sorted[j];
        if (!o.police && Math.abs(o.x - car.x) < 0.4) v = Math.min(v, o.speed * 0.98);
      }
      // never let traffic block all three lanes at once: the rearmost of the three drops back to open a gap
      const busy = [false, false, false];
      busy[car.lane] = true;
      let slowest = Infinity;
      for (let j = i + 1; j < sorted.length && sorted[j].z - car.z < WALL_GAP; j++) {
        const o = sorted[j];
        if (o.police || o.lane === car.lane) continue;
        busy[o.lane] = true; if (o.to !== undefined && o.blink) busy[o.to] = true;
        slowest = Math.min(slowest, o.speed);
      }
      if (busy[0] && busy[1] && busy[2]) v = Math.min(v, slowest * 0.8);
      const behindYou = pz - car.z;
      if (behindYou > 0 && behindYou < SEG * 4 && Math.abs(car.x - this.playerX) < 0.45) v = Math.min(v, this.speed * 0.9);
      car.braking = v < car.base * 0.92;
      car.speed = v;
    }
    for (const car of sorted) {
      car.z += car.speed * dt;
      if (car.police) continue;
      // merge out of a closed lane (indicate first)
      if (!car.blink && this.closedAt(car.lane, car.z + 14 * SEG)) {
        const opts = [car.lane - 1, car.lane + 1].filter((l) => l >= 0 && l <= 2 && !this.closedAt(l, car.z + 14 * SEG));
        if (opts.length) { car.to = s.rng.pick(opts); car.blink = 0.7; }
      }
      if (car.changer) {
        car.nextChange -= dt;
        if (car.nextChange <= 0 && !car.blink && car.z - pz < 40 * SEG && car.z > pz + 6 * SEG) {
          const opts = [car.lane - 1, car.lane + 1].filter((l) => l >= 0 && l <= 2 && !this.closedAt(l, car.z + 10 * SEG));
          if (opts.length) { car.to = s.rng.pick(opts); car.blink = 0.9; }
          else car.nextChange = 1;
        }
      }
      if (car.blink > 0) {
        car.blink -= dt;
        if (car.blink <= 0) {
          car.blink = 0;
          if (this.cutsOff(car, car.to, pz)) car.nextChange = s.rng.range(1, 2);   // you're coming — wait for you to pass
          else { car.lane = car.to; car.nextChange = s.rng.range(2.5, 5); }
        }
      }
      const tx = LANES[car.lane], vx = (tx - car.x);
      car.x = lerp(car.x, tx, Math.min(1, dt * 2.2));
      car.yawV = clamp(vx * 0.9, -0.3, 0.3);                      // nose turned into the lane change
    }
    sorted.sort((a, b) => a.z - b.z);
    let drafting = null;
    for (const car of sorted) {
      const dz = car.z - pz;
      if (dz > 6 * SEG) break;
      const gapX = Math.abs(car.x - this.playerX), touch = (car.w + PLAYER_W) / 2 * 0.86;
      if (dz > -HIT_BACK && dz < HIT_FRONT && gapX < touch && this.invuln <= 0) {
        this.lastCrash = { dz: Math.round(dz), gapX: +gapX.toFixed(2), px: +this.playerX.toFixed(2), cx: +car.x.toFixed(2), changer: car.changer, truck: car.truck, police: !!car.police };
        if (this.crash(car)) return;
        continue;
      }
      if (!drafting && !car.police && dz > HIT_FRONT && dz < 5.5 * SEG && gapX < 0.2) drafting = car;
      const ahead = car.z > pz, justPassed = car.ahead && !ahead;
      car.ahead = ahead;
      if (justPassed && !car.scored) {
        car.scored = true;
        const x = W / 2 + (car.x - this.playerX) * 150, y = H - 150;
        if (gapX < touch + 0.2 * CW) {
          this.near++; this.nearChain++;
          s.award(40 * L, x, y, { chain: true, color: '#fde047', size: 20 });
          s.fx.text(x, y - 26, this.nearChain >= 3 ? `NEAR MISS ×${this.nearChain}` : 'NEAR MISS!', { color: '#fde047', size: 18 });
          s.sound.tone({ freq: 500 + Math.min(12, this.nearChain) * 60, to: 1100, dur: 0.12, type: 'triangle', vol: 0.06 });
          if (this.nearChain >= 10) s.unlock('nearmiss');
        } else {
          s.award(10 * L, x, y, { chain: true, color: '#a5f3fc', size: 14 });
        }
        this.passedCount++;
      }
    }
    this.cars = sorted.filter((car) => car.z < this.trackLen && !(car.police && car.z > pz + 70 * SEG));

    // slipstream: tuck in behind a car at speed and the draft fills your nitro
    this.drafting = !!drafting && pct > 0.55 && this.draftCool <= 0;
    if (this.drafting) this.draft += dt / (drafting.truck ? 0.75 : 1.05);
    else this.draft = Math.max(0, this.draft - dt * 1.4);
    if (this.draft >= 1) {
      this.draft = 0; this.draftCool = 1.2; this.drafts++;
      this.boost = Math.min(1, this.boost + 0.4);
      s.award(30 * L, W / 2, H - 200, { chain: true, color: '#e0f2fe', size: 16 });
      s.fx.text(W / 2, H - 228, 'SLIPSTREAM! ⚡', { color: '#7dd3fc', size: 20 });
      s.sound.tone({ freq: 300, to: 1200, dur: 0.25, type: 'sawtooth', vol: 0.05 });
      if (this.drafts >= 5) s.unlock('draft');
    }

    // roadworks
    for (const cl of this.closures) {
      if (pz < cl.z0 || pz > cl.z1 || this.coneCool > 0) continue;
      if (Math.abs(this.playerX - LANES[cl.lane]) < 0.44) {
        this.coneCool = 0.6; this.speed *= 0.55; this.nearChain = 0;
        s.fx.burst(W / 2, PLAYER_Y - 30, { colors: ['#f97316', '#fff', '#fb923c'], count: 18, speed: 260, life: 0.6, gravity: 500 });
        s.fx.text(W / 2, PLAYER_Y - 90, '🚧 CONES!', { color: '#fb923c', size: 18 });
        s.fx.shake(5, 0.2); s.sound.play('hit');
      }
    }

    // pickups
    for (const p of this.pickups) {
      if (p.got || Math.abs(p.z - pz) > 120 || Math.abs(p.x - this.playerX) > 0.26 * CW) continue;
      p.got = true;
      if (p.kind === 'nitro') {
        this.boost = 1;
        s.award(25 * L, W / 2, H - 170, { color: '#38bdf8', size: 16 });
        s.fx.text(W / 2, H - 200, '⚡ NITRO', { color: '#38bdf8', size: 20 });
        s.sound.play('powerup');
      } else if (p.kind === 'time') {
        this.timeLeft += 3;
        s.fx.text(W / 2, H - 200, '⏱ +3s', { color: '#86efac', size: 22 });
        s.award(25 * L, W / 2, H - 170, { color: '#86efac', size: 16 });
        s.sound.play('gem', 3);
      } else if (p.kind === 'shield') {
        this.shield = true;
        s.fx.text(W / 2, H - 200, '🛡 SHIELD', { color: '#67e8f9', size: 22 });
        s.sound.play('powerup');
      } else {
        const star = p.kind === 'star';
        this.coinsGot += star ? 10 : 1;
        s.award((this.bonus ? 15 : 5) * L * (star ? 10 : 1), W / 2 + (p.x - this.playerX) * 150, H - 160, { chain: this.bonus, color: '#fde047', size: star ? 22 : 14 });
        s.sound.play(star ? 'golden' : 'coin', Math.min(10, this.coinsGot % 12));
        if (this.bonus && this.coinsGot >= 60) s.unlock('coins');
      }
    }

    // checkpoint
    if (!this.bonus && pz >= this.finishZ) this.finish();
  }

  /** 🚨 A police car comes up from behind in your lane. It locks its lane when it gets close. */
  updatePolice(dt, pz) {
    const s = this.s, max = this.maxSpeed;
    if (!this.feat.police) return;
    if (!this.police) {
      this.policeNext -= dt;
      if (this.policeNext <= 0 && pz < this.finishZ - 50 * SEG && this.speed > max * 0.3) {
        const lane = LANES.reduce((a, b, i) => (Math.abs(b - this.playerX) < Math.abs(LANES[a] - this.playerX) ? i : a), 0);
        this.police = { police: true, kind: 'police', z: pz - 30 * SEG, x: LANES[lane], lane, speed: max, w: 0.36 * CW, color: '#0f172a', ahead: false, scored: true, locked: false, blink: 0 };
        this.cars.push(this.police);
      }
      return;
    }
    const p = this.police, dz = p.z - pz;
    if (dz < 0) p.speed = Math.max(this.speed, max * 0.55) + max * 0.24;
    else p.speed = max * 1.12;
    if (!p.locked && dz > -18 * SEG) p.locked = true;
    if (!p.locked) {
      const lane = LANES.reduce((a, b, i) => (Math.abs(b - this.playerX) < Math.abs(LANES[a] - this.playerX) ? i : a), 0);
      if (lane !== p.lane && !this.closedAt(lane, p.z + 10 * SEG)) p.lane = lane;
    } else if (dz > 0) {
      // once past you it weaves round traffic
      const block = this.cars.find((o) => o !== p && o.z > p.z && o.z - p.z < 4 * SEG && Math.abs(o.x - p.x) < 0.4);
      if (block) { const opts = [p.lane - 1, p.lane + 1].filter((l) => l >= 0 && l <= 2); p.lane = s.rng.pick(opts); }
    }
    p.x = lerp(p.x, LANES[p.lane], Math.min(1, dt * (p.locked ? 4 : 3)));
    if (dz > -40 * SEG && dz < 30 * SEG && (this.sirenT -= dt) <= 0) {
      this.sirenT = 0.38; this.sirenHi = !this.sirenHi;
      s.sound.tone({ freq: this.sirenHi ? 960 : 720, dur: 0.34, type: 'square', vol: dz < 0 ? 0.03 : 0.015 });
    }
    if (dz > 70 * SEG) { this.police = null; this.policeNext = s.rng.range(9, 16) * Math.max(0.6, 1 - (this.level - 9) * 0.04); }
  }

  /** 🏁 VIPER, the rival: races you to the checkpoint and dodges traffic. */
  updateRival(dt, pz) {
    const rv = this.rival, s = this.s, max = this.maxSpeed;
    if (!rv) return;
    let target = max * rv.pace;
    const d = rv.z - pz;
    if (d > 25 * SEG) target *= 0.93;                              // waits a little if you fall behind…
    if (d < -25 * SEG) target *= 1.08;                             // …and catches up if you get away
    const clear = (lane) => {
      let best = 1e9;
      for (const o of this.cars) { const dz = o.z - rv.z; if (dz > -SEG && dz < 9 * SEG && Math.abs(LANES[lane] - o.x) < 0.42) best = Math.min(best, dz); }
      if (this.closedAt(lane, rv.z + 8 * SEG)) best = -1;
      return best;
    };
    const here = clear(rv.lane);
    if (here < 6 * SEG && !rv.moving) {
      const opts = [rv.lane - 1, rv.lane + 1].filter((l) => l >= 0 && l <= 2).map((l) => [l, clear(l)]).sort((a, b) => b[1] - a[1]);
      if (opts.length && opts[0][1] > here + SEG) { rv.lane = opts[0][0]; rv.moving = 0.5; }
      else {
        const blk = this.cars.find((o) => o.z > rv.z && o.z - rv.z < 6 * SEG && Math.abs(o.x - rv.x) < 0.42);
        if (blk) target = Math.min(target, blk.speed);
      }
    }
    if (rv.moving) rv.moving = Math.max(0, rv.moving - dt);
    rv.boostT = d < -10 * SEG && here > 8 * SEG ? 1 : Math.max(0, rv.boostT - dt);
    if (rv.boostT > 0) target *= 1.12;
    rv.speed += (target - rv.speed) * Math.min(1, dt * (rv.speed < target ? 0.55 : 2));
    rv.z += rv.speed * dt;
    const ox = rv.x;
    rv.x = lerp(rv.x, LANES[rv.lane], Math.min(1, dt * 3));
    rv.yawV = clamp((rv.x - ox) / dt * 0.35, -0.3, 0.3);
    // trading paint: bumping VIPER shoves you both apart
    const dzp = rv.z - pz, gx = this.playerX - rv.x;
    if (dzp > -HIT_BACK && dzp < HIT_FRONT && Math.abs(gx) < 0.33 * CW && !this.done) {
      const dir = Math.sign(gx) || 1;
      this.playerX += dir * 0.1; rv.x -= dir * 0.05; this.speed *= 0.92; rv.speed *= 0.95;
      if (!rv.bumpT || this.t - rv.bumpT > 0.4) { rv.bumpT = this.t; s.fx.burst(W / 2 - dir * 40, PLAYER_Y - 30, { colors: ['#fde047', '#fff', '#f97316'], count: 14, speed: 220, life: 0.4 }); s.sound.play('metal'); s.fx.shake(4, 0.15); }
    }
    if (!rv.done && rv.z >= this.finishZ) {
      rv.done = true;
      if (!this.done) { s.fx.text(W / 2, HORIZON + 30, 'VIPER WINS THE DUEL', { color: '#c084fc', size: 24, life: 1.6 }); s.sound.play('lose'); }
    }
  }

  crash(car) {
    const s = this.s;
    if (this.shield) {
      this.shield = false; this.invuln = 1.2; this.speed *= 0.7; this.nearChain = 0;
      s.fx.burst(W / 2, PLAYER_Y - 50, { colors: ['#67e8f9', '#e0f2fe', '#fff', car.color], count: 40, speed: 300, life: 0.7 });
      s.fx.text(W / 2, PLAYER_Y - 120, '🛡 SHIELD SAVED YOU!', { color: '#67e8f9', size: 20 });
      s.fx.shake(6, 0.25); s.sound.play('metal');
      this.cars = this.cars.filter((c) => c !== car);
      if (car === this.police) { this.police = null; this.policeNext = 8; }
      return false;
    }
    this.crashes++; this.nearChain = 0;
    this.speed = 0; this.crashFx = 1;
    s.fx.burst(W / 2, H - 110, { colors: ['#f97316', '#fde047', '#fff', car.color], count: 50, speed: 320, life: 0.8 });
    s.fx.shake(10, 0.4);
    s.sound.play('boom');
    s.hurt();
    return true;
  }

  finish() {
    const s = this.s, L = this.level;
    if (this.done) return;
    this.done = true;
    const secs = Math.floor(this.timeLeft);
    if (secs > 0) s.award(secs * 40 * L, W / 2, HORIZON + 40, { color: '#a5f3fc', size: 24 });
    s.fx.text(W / 2, HORIZON - 10, 'CHECKPOINT!', { color: '#fde047', size: 40, life: 1.4 });
    const mode = s.mode || 'normal', best = this.ghostRun?.t;
    if (!best || this.levelT < best) {
      this.rec.push([10000, Math.round(this.playerX * 100)]);
      saveGhost(mode, L, { t: +this.levelT.toFixed(2), s: this.rec });
      s.fx.text(W / 2, HORIZON + 150, best ? `👻 NEW BEST TIME −${(best - this.levelT).toFixed(1)}s` : '👻 Ghost saved — race it next time!', { color: '#e0f2fe', size: 18, life: 1.8 });
    } else s.fx.text(W / 2, HORIZON + 150, `👻 +${(this.levelT - best).toFixed(1)}s off your best`, { color: '#94a3b8', size: 16, life: 1.8 });
    if (this.rival && !this.rival.done) {
      s.award(1000 * L, W / 2, HORIZON + 80, { color: '#e9d5ff', size: 26 });
      s.fx.text(W / 2, HORIZON + 112, '🏁 YOU BEAT VIPER!', { color: '#c084fc', size: 24, life: 1.6 });
      s.unlock('rival');
    }
    s.fx.confetti(W, H);
    if (this.timeLeft < 2) s.unlock('photo');
    if (this.crashes === 0 && L >= 3) s.unlock('clean');
    s.completeLevel();
  }

  onLevelClear() { if (this.bonus && this.coinsGot >= 60) this.s.unlock('coins'); }

  // ── Draw ───────────────────────────────────────────────────
  project(p, wx, wy, wz, camX, camY, camZ) {
    const cz = Math.max(1, wz - camZ);
    p.scale = CAM_DEPTH / cz;
    p.x = W / 2 + p.scale * (wx - camX) * W / 2;
    p.y = HORIZON + p.scale * (camY - wy) * VS;
    p.w = p.scale * ROAD * W / 2;
  }

  drawSky(ctx) {
    const th = this.theme, t = this.t, sk = this.sky;
    ctx.drawImage(sk.sky, 0, 0);
    if (this.themeId === 'night') for (const st of this.stars) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + st.x); ctx.fillStyle = '#fff'; ctx.fillRect(st.x, st.y, st.r, st.r); }
    ctx.globalAlpha = 1;
    if (th.sun) {
      const sx = (((W / 2 - this.skyOff * 60) % W) + W) % W, night = this.themeId === 'night', sy = HORIZON - (night ? 150 : 70), R = night ? 24 : 62;
      if (night) {
        const halo = ctx.createRadialGradient(sx, sy, R, sx, sy, R * 3); halo.addColorStop(0, 'rgba(226,232,240,.18)'); halo.addColorStop(1, 'rgba(226,232,240,0)');
        ctx.fillStyle = halo; ctx.fillRect(sx - R * 3, sy - R * 3, R * 6, R * 6);
        ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,.55)'; for (const [cx, cy, cr] of [[-7, -5, 5], [6, 4, 4], [-2, 9, 3], [9, -8, 2.5]]) { ctx.beginPath(); ctx.arc(sx + cx, sy + cy, cr, 0, Math.PI * 2); ctx.fill(); }
      } else {
        const glow = ctx.createRadialGradient(sx, sy, R * 0.8, sx, sy, R * 2.2); glow.addColorStop(0, th.sun + '55'); glow.addColorStop(1, th.sun + '00');
        ctx.fillStyle = glow; ctx.fillRect(sx - R * 2.2, sy - R * 2.2, R * 4.4, R * 4.4);
        const sg = ctx.createLinearGradient(0, sy - R, 0, sy + R);
        sg.addColorStop(0, th.sun); sg.addColorStop(1, '#f472b6');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = th.sky[2]; for (let k = 0; k < 6; k++) ctx.fillRect(sx - R, sy + 6 + k * 10, R * 2, 2 + k * 0.7);
      }
    }
    // mountains and skyline scroll with the bends at different speeds
    const tile = (img, f, y) => { const w = img.width, o = (((this.skyOff * f) % w) + w) % w; ctx.drawImage(img, -o, y); ctx.drawImage(img, w - o, y); };
    tile(sk.mount, 40, HORIZON - sk.mount.height + 2);
    tile(sk.city, 140, HORIZON - sk.city.height + 2);
    // a red light on the tallest towers at night
    if ((this.themeId === 'night' || this.themeId === 'rain') && Math.sin(t * 3) > 0) {
      ctx.fillStyle = '#ef4444'; for (let i = 0; i < 6; i++) { const x = ((i * 97 - this.skyOff * 140) % W + W) % W; ctx.fillRect(x, HORIZON - 100 - (i % 3) * 8, 2, 2); }
    }
  }

  render(ctx) {
    const s = this.s, th = this.theme, t = this.t;
    let shx = 0, shy = 0;
    if (this.shakeT > 0) { shx = (Math.random() - 0.5) * 3; shy = (Math.random() - 0.5) * 3; this.shakeT -= 1 / 60; }
    ctx.save(); ctx.translate(shx, shy);
    this.drawSky(ctx);
    ctx.fillStyle = mix(this.col.grass[0], this.col.fog, 0.6); ctx.fillRect(-4, HORIZON, W + 8, H - HORIZON + 4);

    // road: project near → far (to know what's hidden behind hills), then paint far → near
    const base = this.segAt(this.position), basePct = (this.position % SEG) / SEG;
    const camX = this.playerX * ROAD, camY = CAM_H + this.playerY;
    let x = 0, dx = -base.curve * basePct, maxy = H;
    const visible = [];
    for (let n = 0; n < this.drawDist; n++) {
      const seg = this.segs[base.i + n];
      if (!seg) break;
      const z1 = seg.i * SEG, z2 = z1 + SEG;
      this.project(seg.p1, x, seg.y1, z1, camX, camY, this.position);
      this.project(seg.p2, x + dx, seg.y2, z2, camX, camY, this.position);
      seg.dx = dx;
      x += dx; dx += seg.curve;
      seg.fog = 1 - Math.exp(-Math.pow(n / this.drawDist, 2) * this.fogDensity);
      seg.clip = maxy;
      if (z1 - this.position <= CAM_DEPTH || seg.p2.y >= seg.p1.y || seg.p2.y >= maxy) { visible.push(seg); seg.hidden = true; continue; }
      seg.hidden = false;
      visible.push(seg);
      maxy = seg.p2.y;
    }
    // the stretch of road right under the car (can dip below the nearest drawn segment on hills)
    const first = visible.find((sg) => !sg.hidden);
    if (first && first.p1.y < H) {
      const p = first.p1, alt = Math.floor(first.i / 3) % 2, dk = first.tunnel ? 0.45 : 0;
      ctx.fillStyle = mix(this.col.grass[alt], [0, 0, 0], dk); ctx.fillRect(0, p.y, W, H - p.y);
      ctx.fillStyle = mix(this.col.rumble[alt], [0, 0, 0], dk); ctx.fillRect(p.x - p.w * 1.3, p.y, p.w * 2.6, H - p.y);
      ctx.fillStyle = mix(this.col.road[alt], [0, 0, 0], dk); ctx.fillRect(p.x - p.w * 1.15, p.y, p.w * 2.3, H - p.y);
    }
    this.late = [];
    for (let k = visible.length - 1; k >= 0; k--) {
      const seg = visible[k];
      if (!seg.hidden) this.drawSegment(ctx, seg);
      this.drawSprites(ctx, seg);
    }

    // weather and speed effects
    if (this.themeId === 'rain' && !this.inTunnel) {
      ctx.strokeStyle = 'rgba(203,213,225,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < this.rain.length; i += this.lo ? 2 : 1) { const d = this.rain[i]; d.y += d.v / 60; d.x -= this.steer * 2; if (d.y > H) { d.y = -20; d.x = Math.random() * W; } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 16); }
      ctx.stroke();
    }
    if (this.boosting || this.drafting) {
      ctx.strokeStyle = this.boosting ? 'rgba(56,189,248,.45)' : 'rgba(226,232,240,.3)'; ctx.lineWidth = 2; ctx.beginPath();
      const n = this.boosting ? 14 : 8;
      for (let i = 0; i < n; i++) { const a = (i * 2.39 + t * 7) % (Math.PI * 2), r1 = 120 + ((t * 900 + i * 60) % 300); ctx.moveTo(W / 2 + Math.cos(a) * r1, HORIZON + 60 + Math.sin(a) * r1 * 0.6); ctx.lineTo(W / 2 + Math.cos(a) * (r1 + 60), HORIZON + 60 + Math.sin(a) * (r1 + 60) * 0.6); }
      ctx.stroke();
    }

    // headlights at night and in tunnels
    const dark = this.inTunnel || this.themeId === 'night' || this.themeId === 'rain';
    if (dark && !this.lo) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(W / 2, PLAYER_Y - 150); ctx.scale(1, 0.42);
      glow(ctx, 0, 0, 210, '#fef9c3', 0.13);
      ctx.restore();
    }

    // the player's car
    if (!(this.invuln > 0 && !this.shieldFlash && Math.floor(t * 10) % 2)) this.drawPlayer(ctx);
    for (const f of this.late) f();
    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(226,232,240,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    // speed vignette
    const sp = clamp(this.speed / this.maxSpeed - 0.75, 0, 0.55);
    if (sp > 0 && !this.lo) {
      ctx.globalAlpha = sp * 0.8; ctx.drawImage(vignette(), 0, 0); ctx.globalAlpha = 1;
    }
    this.drawHud(ctx);
  }

  drawPlayer(ctx) {
    const s = this.s, t = this.t;
    const bounce = Math.abs(this.playerX) > 1 && this.speed > 500 ? Math.sin(t * 60) * 2 : Math.sin(t * 25) * 0.6 * (this.speed / this.maxSpeed);
    const ppu = PLAYER_PX / 2, gold = s.gold;
    const paint = gold ? '#f59e0b' : '#dc2626';
    const ay = PLAYER_Y + bounce;
    // underglow
    ctx.save(); ctx.translate(W / 2, ay - 6); ctx.scale(1, 0.26); glow(ctx, 0, 0, PLAYER_PX * 0.85, gold ? '#fbbf24' : '#ef4444', 0.55); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(W / 2, ay - 4, PLAYER_PX * 0.55, PLAYER_PX * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    const slip = -this.playerX * 0 + (this.segAt(this.position + PLAYER_Z).curve * (this.speed / this.maxSpeed)) * 0.02;
    const pitch = 0.45 * Math.atan2(CAM_H, PLAYER_Z);
    const T = drawCar(ctx, SPORTS, {
      x: W / 2, y: ay, ppu, pal: palette(paint, { stripe: gold ? '#fff7ed' : '#f8fafc', tail: '#e11d48', dark: gold ? '#78350f' : '#111827' }),
      yaw: this.steer * 0.14 - slip, pitch, roll: -this.steer * 0.05, persp: 0.08,
      amb: this.inTunnel ? 0.3 : this.theme.amb + 0.08, lights: { brake: this.braking, indL: false, indR: false },
      halo: Math.max(0.5, this.inTunnel ? 1 : this.theme.halo), glow,
    });
    // exhaust: blue flames when boosting
    if (this.boosting) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const e of SPORTS.exhaust) {
        const [ex, ey] = T(...e), len = PLAYER_PX * (0.25 + Math.random() * 0.2);
        const fg = ctx.createLinearGradient(ex, ey, ex, ey + len);
        fg.addColorStop(0, 'rgba(224,242,254,.95)'); fg.addColorStop(0.4, 'rgba(56,189,248,.7)'); fg.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(ex - 5, ey); ctx.lineTo(ex, ey + len); ctx.lineTo(ex + 5, ey); ctx.fill();
      }
      ctx.restore();
    }
    if (this.shield) {
      const a = 0.35 + 0.15 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(103,232,249,${a})`; ctx.lineWidth = 3; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(W / 2, ay - PLAYER_PX * 0.45, PLAYER_PX * 0.72, PLAYER_PX * 0.62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    }
    if (gold && Math.sin(t * 3) > 0.8) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W / 2 - PLAYER_PX * 0.2, ay - PLAYER_PX * 0.5, 2, 0, Math.PI * 2); ctx.fill(); }
  }

  drawSegment(ctx, seg) {
    const p1 = seg.p1, p2 = seg.p2, alt = Math.floor(seg.i / 3) % 2, f = seg.fog, fc = this.col.fog;
    const dk = seg.tunnel ? 0.5 : 0;
    const quad = (x1, y1, w1, x2, y2, w2, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.closePath(); ctx.fill();
    };
    const shade = (c) => mix(mixA(c, [0, 0, 0], dk), fc, f);
    ctx.fillStyle = shade(this.col.grass[alt]);
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    const r1 = p1.w / 7, r2 = p2.w / 7;
    quad(p1.x, p1.y, p1.w + r1, p2.x, p2.y, p2.w + r2, shade(this.col.rumble[alt]));
    quad(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, shade(this.col.road[alt]));
    if (seg.tunnel && seg.i % 3 === 0) {                                                 // pools of light under the tunnel lamps
      ctx.globalAlpha = 0.08 * (1 - f); quad(p1.x, p1.y, p1.w * 0.8, p2.x, p2.y, p2.w * 0.8, '#fdba74'); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1 - f;
    const e1 = p1.w / 60, e2 = p2.w / 60;                                               // solid edge lines
    for (const lx of [-0.95, 0.95]) quad(p1.x + p1.w * lx, p1.y, e1, p2.x + p2.w * lx, p2.y, e2, '#e2e8f0');
    if (!alt) {
      const l1 = p1.w / 36, l2 = p2.w / 36;
      for (const lx of [-1 / 3, 1 / 3]) quad(p1.x + p1.w * lx, p1.y, l1, p2.x + p2.w * lx, p2.y, l2, this.theme.lane);
    }
    // wet road: a soft sheen down the middle
    if (this.theme.wet && !seg.tunnel) { ctx.globalAlpha = 0.06 * (1 - f); quad(p1.x, p1.y, p1.w * 0.6, p2.x, p2.y, p2.w * 0.6, '#cbd5e1'); }
    ctx.globalAlpha = 1;
    if (seg.i === this.finishIndex || seg.i === this.finishIndex + 1) {                  // chequered checkpoint line
      const n = 10;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = (k + seg.i) % 2 ? '#fff' : '#111';
        const a1 = p1.x - p1.w + (2 * p1.w / n) * k, a2 = p2.x - p2.w + (2 * p2.w / n) * k;
        ctx.beginPath(); ctx.moveTo(a1, p1.y); ctx.lineTo(a2, p2.y); ctx.lineTo(a2 + 2 * p2.w / n, p2.y); ctx.lineTo(a1 + 2 * p1.w / n, p1.y); ctx.fill();
      }
    }
  }

  /** a vertical wall from road level up to height h, at road-x offset xo, along this segment */
  wallQuad(ctx, seg, xo, h0, h1, col) {
    const p1 = seg.p1, p2 = seg.p2;
    const x1 = p1.x + p1.w * xo, x2 = p2.x + p2.w * xo;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x1, p1.y - p1.scale * h0 * VS); ctx.lineTo(x1, p1.y - p1.scale * h1 * VS); ctx.lineTo(x2, p2.y - p2.scale * h1 * VS); ctx.lineTo(x2, p2.y - p2.scale * h0 * VS);
    ctx.closePath(); ctx.fill();
  }

  drawStructures(ctx, seg) {
    const p1 = seg.p1, p2 = seg.p2, f = seg.fog, fc = this.col.fog, alt = Math.floor(seg.i / 2) % 2;
    if (seg.tunnel) {
      const wall = mix(alt ? [63, 63, 70] : [52, 52, 59], fc, f), ceil = mix([30, 30, 36], fc, f);
      for (const sd of [-1, 1]) this.wallQuad(ctx, seg, sd * TUNNEL_X, 0, TUNNEL_H, wall);
      for (const sd of [-1, 1]) this.wallQuad(ctx, seg, sd * TUNNEL_X, 500, 560, mix([253, 186, 116], fc, f));       // light strip
      // ceiling
      const y1 = p1.y - p1.scale * TUNNEL_H * VS, y2 = p2.y - p2.scale * TUNNEL_H * VS;
      ctx.fillStyle = ceil; ctx.beginPath();
      ctx.moveTo(p1.x - p1.w * TUNNEL_X, y1); ctx.lineTo(p1.x + p1.w * TUNNEL_X, y1); ctx.lineTo(p2.x + p2.w * TUNNEL_X, y2); ctx.lineTo(p2.x - p2.w * TUNNEL_X, y2); ctx.fill();
      if (seg.i % 3 === 0) {
        ctx.fillStyle = mix([255, 237, 213], fc, f); ctx.beginPath();
        ctx.moveTo(p1.x - p1.w * 0.25, y1); ctx.lineTo(p1.x + p1.w * 0.25, y1); ctx.lineTo(p2.x + p2.w * 0.25, y2); ctx.lineTo(p2.x - p2.w * 0.25, y2); ctx.fill();
      }
    }
    if (seg.portal) {                                                                    // the tunnel mouth
      const sc = p1.scale, hT = sc * TUNNEL_H * VS, top = p1.y - sc * TUNNEL_H * 1.7 * VS;
      ctx.fillStyle = mix([82, 82, 91], fc, f);
      ctx.beginPath();
      ctx.rect(p1.x - p1.w * 9, top, p1.w * 18, p1.y - top);
      ctx.rect(p1.x - p1.w * TUNNEL_X, p1.y - hT, p1.w * TUNNEL_X * 2, hT);
      ctx.fill('evenodd');
      ctx.fillStyle = mix([39, 39, 42], fc, f);
      ctx.fillRect(p1.x - p1.w * 9, top, p1.w * 18, (p1.y - top) * 0.08);
      ctx.fillStyle = mix(hex(this.theme.glow), fc, f);
      ctx.fillRect(p1.x - p1.w * TUNNEL_X, p1.y - hT - sc * 140 * VS, p1.w * TUNNEL_X * 2, sc * 60 * VS);
      if (p1.w > 40) { ctx.fillStyle = '#fef3c7'; ctx.font = `900 ${Math.max(8, sc * 260 * VS)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TURBO TUNNEL', p1.x, p1.y - hT - sc * 380 * VS); }
    }
    // city blocks
    for (const [i, sd] of [[0, -1], [1, 1]]) {
      const w = seg.wall?.[i];
      if (!w) continue;
      const baseC = mixA(w.col, [0, 0, 0], 0);
      this.wallQuad(ctx, seg, sd * WALL_X, 0, w.h, mix(baseC, fc, f));
      if (p1.w > 26 && f < 0.7 && !this.lo) {
        // windows: a column per segment, some lit
        const x1 = p1.x + p1.w * sd * WALL_X, x2 = p2.x + p2.w * sd * WALL_X;
        for (let hh = 400, row = 0; hh < w.h - 300; hh += 520, row++) {
          const lit = hash(w.seed * 131 + row * 17) < 0.45, col = lit ? this.theme.win[(w.seed + row) % 3] : '#0b1020';
          ctx.fillStyle = col; ctx.globalAlpha = (1 - f) * (lit ? 0.85 : 0.7);
          const ya1 = p1.y - p1.scale * hh * VS, yb1 = p1.y - p1.scale * (hh + 260) * VS, ya2 = p2.y - p2.scale * hh * VS, yb2 = p2.y - p2.scale * (hh + 260) * VS;
          const u0 = 0.2, u1 = 0.75;
          ctx.beginPath();
          ctx.moveTo(lerp(x1, x2, u0), lerp(ya1, ya2, u0)); ctx.lineTo(lerp(x1, x2, u0), lerp(yb1, yb2, u0)); ctx.lineTo(lerp(x1, x2, u1), lerp(yb1, yb2, u1)); ctx.lineTo(lerp(x1, x2, u1), lerp(ya1, ya2, u1));
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (w.first) {                                                                     // the end of the block that faces you
        const x1 = p1.x + p1.w * sd * WALL_X, top = p1.y - p1.scale * w.h * VS;
        ctx.fillStyle = mix(mixA(baseC, [0, 0, 0], 0.3), fc, f);
        ctx.fillRect(Math.min(x1, x1 + sd * p1.w * 5), top, p1.w * 5, p1.y - top);
        ctx.fillStyle = mix(hex(this.theme.glow), fc, f); ctx.globalAlpha = 0.8;
        ctx.fillRect(Math.min(x1, x1 + sd * p1.w * 5), top, p1.w * 5, Math.max(1, p1.scale * 70 * VS)); ctx.globalAlpha = 1;
        if (p1.w > 20 && f < 0.7 && !this.lo) {
          const wy = p1.scale * VS, ww = p1.w * 0.32;
          for (let hh = 450, row = 0; hh < w.h - 300; hh += 600, row++) for (let c = 0; c < 6; c++) {
            const lit = hash(w.seed * 31 + row * 7 + c) < 0.4;
            ctx.fillStyle = lit ? this.theme.win[(row + c) % 3] : '#0b1020'; ctx.globalAlpha = (1 - f) * (lit ? 0.75 : 0.6);
            ctx.fillRect(x1 + sd * (p1.w * 0.25 + c * p1.w * 0.78) - (sd < 0 ? ww : 0), p1.y - (hh + 300) * wy, ww, 300 * wy);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    // guard rails
    if (seg.rail) for (const sd of [-1, 1]) {
      this.wallQuad(ctx, seg, sd * 1.22, 170, 260, mix([148, 163, 184], fc, f));
      if (seg.i % 2 === 0) { const x = p1.x + p1.w * sd * 1.22; ctx.fillStyle = mix([71, 85, 105], fc, f); ctx.fillRect(x - Math.max(0.5, p1.w / 140), p1.y - p1.scale * 260 * VS, Math.max(1, p1.w / 70), p1.scale * 260 * VS); }
    }
  }

  drawSprites(ctx, seg) {
    const z1 = seg.i * SEG, z2 = z1 + SEG;
    const p1 = seg.p1, p2 = seg.p2;
    if (!p1.scale || p1.scale <= 0) return;
    const f = seg.fog, th = this.theme;
    ctx.save();
    if (seg.clip < p1.y - 1) { ctx.beginPath(); ctx.rect(-10, -10, W + 20, seg.clip + 10); ctx.clip(); }
    this.drawStructures(ctx, seg);
    ctx.globalAlpha = Math.max(0, 1 - f * 1.1);
    // roadside props (outermost first)
    for (const pr of seg.props) {
      if (this.lo && pr.k !== 'bb' && (seg.i + Math.round(pr.x * 3)) % 2) continue;
      const spr = pr.k === 'bb' ? this.spr.bb[pr.n] : this.spr[pr.k];
      const w = p1.scale * spr.ww * W / 2, h = p1.scale * spr.wh * VS;
      if (w < 1) continue;
      const sx = p1.x + p1.w * pr.x;
      if (sx + w < -20 || sx - w > W + 20) continue;
      ctx.drawImage(spr.img, sx - w / 2, p1.y - h, w, h);
    }
    // road-side lamps
    if (seg.lamp) for (const side of [-1, 1]) {
      const sx = p1.x + p1.w * 1.25 * side, h = p1.scale * 1400 * VS;
      ctx.strokeStyle = '#475569'; ctx.lineWidth = Math.max(1, p1.w / 90);
      ctx.beginPath(); ctx.moveTo(sx, p1.y); ctx.lineTo(sx, p1.y - h); ctx.lineTo(sx - side * h * 0.18, p1.y - h); ctx.stroke();
      const r0 = Math.max(1.2, p1.w / 60);
      glow(ctx, sx - side * h * 0.18, p1.y - h, r0 * 4, th.glow, 0.7);
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(sx - side * h * 0.18 - r0, p1.y - h - r0 * 0.6, r0 * 2, r0 * 1.2);
    }
    // overhead gantry sign
    if (seg.gantry) {
      const hh = p1.scale * 2500 * VS, bh = p1.scale * 520 * VS, lx = p1.x - p1.w * 1.3, rx = p1.x + p1.w * 1.3;
      ctx.fillStyle = '#334155';
      ctx.fillRect(lx - p1.w * 0.02, p1.y - hh, p1.w * 0.04, hh); ctx.fillRect(rx - p1.w * 0.02, p1.y - hh, p1.w * 0.04, hh);
      ctx.fillRect(lx, p1.y - hh, rx - lx, p1.scale * 90 * VS);
      ctx.fillStyle = '#065f46'; roundRect(ctx, p1.x - p1.w * 0.75, p1.y - hh + p1.scale * 100 * VS, p1.w * 1.5, bh, Math.max(1, p1.w * 0.03)); ctx.fill();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = Math.max(0.5, p1.w / 120); ctx.stroke();
      if (p1.w > 30) { ctx.fillStyle = '#f8fafc'; ctx.font = `800 ${Math.max(6, bh * 0.42)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(seg.gantry, p1.x, p1.y - hh + p1.scale * 100 * VS + bh / 2, p1.w * 1.4); }
    }
    // roadworks cones and the flashing arrow board
    if (seg.cl) for (const cl of seg.cl) {
      const lx = LANES[cl.lane];
      if (seg.i >= cl.a && seg.i <= cl.b && seg.i % 2 === 0) {
        const taper = clamp((seg.i - cl.a) / 6, 0, 1);
        for (const ex of [-0.33, 0.33]) {
          const cx = p1.x + p1.w * (lx + ex * (ex * (lx || 1) < 0 ? 1 : taper));
          this.drawCone(ctx, cx, p1.y, p1.scale);
        }
        if (seg.i % 4 === 0) this.drawCone(ctx, p1.x + p1.w * lx, p1.y, p1.scale);
      }
      if (seg.i === cl.a - 3) {
        const cx = p1.x + p1.w * lx, bw = p1.scale * 560 * W / 2, bh = p1.scale * 420 * VS;
        ctx.fillStyle = '#111827'; ctx.fillRect(cx - bw / 2, p1.y - bh * 1.4, bw, bh);
        ctx.fillStyle = '#1f2937'; ctx.fillRect(cx - bw * 0.04, p1.y - bh * 0.4, bw * 0.08, bh * 0.4);
        if (Math.floor(this.t * 3) % 2) {
          const dir = cl.lane === 2 ? -1 : cl.lane === 0 ? 1 : (this.closures.indexOf(cl) % 2 ? 1 : -1);
          ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = p1.w > 30 ? 10 : 0;
          for (let k = -1; k <= 1; k++) {
            const ax = cx + k * bw * 0.28, ay = p1.y - bh * 0.9, s2 = bw * 0.12;
            ctx.beginPath(); ctx.moveTo(ax - dir * s2, ay - s2); ctx.lineTo(ax + dir * s2, ay); ctx.lineTo(ax - dir * s2, ay + s2); ctx.lineTo(ax - dir * s2 * 0.4, ay); ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }
    }
    if (seg.i === this.finishIndex - 2) {                                                   // checkpoint gate
      const hh = p1.scale * 2600 * VS;
      ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 16;
      ctx.fillRect(p1.x - p1.w * 1.15, p1.y - hh, p1.w * 0.05, hh); ctx.fillRect(p1.x + p1.w * 1.1, p1.y - hh, p1.w * 0.05, hh);
      ctx.fillRect(p1.x - p1.w * 1.15, p1.y - hh, p1.w * 2.3, hh * 0.13);
      ctx.shadowBlur = 0; ctx.fillStyle = '#1c1917'; ctx.font = `900 ${Math.max(6, hh * 0.1)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CHECKPOINT', p1.x, p1.y - hh * 0.935);
    }
    // pickups on this segment
    for (const p of this.pickups) {
      if (p.got || p.z < z1 || p.z >= z2) continue;
      const k = (p.z - z1) / SEG, sc = lerp(p1.scale, p2.scale, k);
      const px = lerp(p1.x, p2.x, k) + p.x * lerp(p1.w, p2.w, k), py = lerp(p1.y, p2.y, k);
      this.drawPickup(ctx, p, px, py, Math.max(1.5, sc * 90 * W / 2));
    }
    ctx.globalAlpha = 1;
    // traffic (and VIPER) on this segment
    const pz = this.position + PLAYER_Z;
    const list = [...this.cars]; if (this.rival) list.push(this.rival); if (this.ghost) list.push(this.ghost);
    const drawn = [];
    for (const car of list) if (car.z >= z1 && car.z < z2) drawn.push(car);
    drawn.sort((a, b) => b.z - a.z);
    for (const car of drawn) {
      const k = (car.z - z1) / SEG, sc = lerp(p1.scale, p2.scale, k);
      const cx = lerp(p1.x, p2.x, k) + car.x * lerp(p1.w, p2.w, k), cy = lerp(p1.y, p2.y, k);
      const dzCam = car.z - this.position, wy = lerp(seg.y1, seg.y2, k);
      const job = () => this.drawTraffic(ctx, car, cx, cy, sc, dzCam, wy, seg, f);
      if (car.z < pz - 260) continue;                                  // well behind you: out of shot
      if (car.z < pz) this.late.push(job);
      else job();
    }
    ctx.restore();
  }

  drawCone(ctx, x, y, sc) {
    const w = sc * 150 * W / 2, h = sc * 260 * VS;
    if (w < 0.8) return;
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.fill();
    if (w > 3) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(x - w * 0.24, y - h * 0.55, w * 0.48, h * 0.14); ctx.fillStyle = '#7c2d12'; ctx.fillRect(x - w * 0.6, y - h * 0.06, w * 1.2, h * 0.06); }
  }

  drawPickup(ctx, p, px, py, r) {
    const t = this.t;
    if (p.kind === 'coin' || p.kind === 'star') {
      const R = p.kind === 'star' ? r * 1.6 : r, sx = Math.abs(Math.cos(t * 4 + p.z));
      ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.ellipse(px, py - R * 1.6, R * sx + 0.6, R, 0, 0, Math.PI * 2); ctx.fill();
      glow(ctx, px, py - r * 1.8, r * 3, '#fbbf24', 0.55); ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.ellipse(px, py - R * 1.6, R * 0.82 * sx + 0.4, R * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      if (r > 4 && sx > 0.4) { ctx.fillStyle = '#b45309'; ctx.font = `900 ${R}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.kind === 'star' ? '★' : '$', px, py - R * 1.55); }
    } else if (p.kind === 'nitro') {
      ctx.fillStyle = '#0c4a6e'; roundRect(ctx, px - r * 0.75, py - r * 3, r * 1.5, r * 2.5, r * 0.5); ctx.fill();
      glow(ctx, px, py - r * 1.8, r * 3, '#38bdf8', 0.55); ctx.fillStyle = '#38bdf8';
      roundRect(ctx, px - r * 0.6, py - r * 2.85, r * 1.2, r * 2.2, r * 0.4); ctx.fill();
      ctx.fillStyle = '#e0f2fe'; ctx.fillRect(px - r * 0.3, py - r * 3.3, r * 0.6, r * 0.35);
      ctx.font = `900 ${r * 1.2}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0c4a6e'; ctx.fillText('N', px, py - r * 1.75);
    } else if (p.kind === 'time') {
      const y = py - r * 1.9;
      glow(ctx, px, py - r * 1.8, r * 3, '#86efac', 0.55); ctx.fillStyle = '#16a34a';
      ctx.beginPath(); ctx.arc(px, y, r * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0fdf4'; ctx.beginPath(); ctx.arc(px, y, r * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#14532d'; ctx.lineWidth = Math.max(1, r * 0.18); ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - r * 0.6); ctx.moveTo(px, y); ctx.lineTo(px + r * 0.45, y + Math.sin(t * 4) * r * 0.2); ctx.stroke();
    } else if (p.kind === 'shield') {
      const y = py - r * 2;
      glow(ctx, px, py - r * 1.8, r * 3, '#67e8f9', 0.55); ctx.fillStyle = '#0e7490';
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t; ctx.lineTo(px + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); } ctx.fill();
      ctx.fillStyle = '#cffafe'; ctx.font = `900 ${r * 1.3}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', px, y);
    }
    ctx.shadowBlur = 0;
  }

  /** one car on the road, drawn as a lit 3D model (or a simple shape when it's tiny) */
  drawTraffic(ctx, car, cx, cy, sc, dzCam, wy, seg, f) {
    const wpx = sc * car.w * ROAD * W / 2 * 1.02, ppu = wpx / 2;
    if (wpx < 1.5) return;
    const night = this.themeId === 'night' || this.themeId === 'rain' || seg.tunnel;
    const blinkOn = car.blink > 0 && Math.floor(this.t * 8) % 2;
    const siren = car.police ? (Math.floor(this.t * 6) % 2 ? 1 : 2) : 0;
    const fogA = [this.col.fog, Math.min(1, f * 1.05)];
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - f * 0.6);
    if (car.ghost && wpx < 10) { ctx.globalAlpha = 0.45 * (1 - f); ctx.fillStyle = '#bae6fd'; ctx.fillRect(cx - wpx / 2, cy - wpx * 0.5, wpx, wpx * 0.5); ctx.restore(); return; }
    if (wpx < (this.lo ? 26 : 10) && !car.ghost) {
      // tiny and far away: a simple block with its tail lights
      const h = wpx * (car.truck ? 0.9 : 0.5), body = mix(rgb(car.rival ? '#1c1917' : car.truck ? '#d4d4d8' : car.color), this.col.fog, f);
      ctx.fillStyle = body;
      if (car.truck || wpx < 6) ctx.fillRect(cx - wpx / 2, cy - h, wpx, h * 0.92);
      else {
        ctx.beginPath(); ctx.moveTo(cx - wpx / 2, cy - h * 0.12); ctx.lineTo(cx - wpx / 2, cy - h * 0.55); ctx.lineTo(cx - wpx * 0.3, cy - h); ctx.lineTo(cx + wpx * 0.3, cy - h); ctx.lineTo(cx + wpx / 2, cy - h * 0.55); ctx.lineTo(cx + wpx / 2, cy - h * 0.12); ctx.fill();
        ctx.fillStyle = 'rgba(15,23,42,.85)'; ctx.fillRect(cx - wpx * 0.26, cy - h * 0.92, wpx * 0.52, h * 0.3);
        ctx.fillStyle = '#0b0f19'; ctx.fillRect(cx - wpx * 0.48, cy - h * 0.14, wpx * 0.18, h * 0.16); ctx.fillRect(cx + wpx * 0.3, cy - h * 0.14, wpx * 0.18, h * 0.16);
      }
      const lit = car.braking ? '#ff2a45' : '#f43f5e', blink = car.blink > 0 && Math.floor(this.t * 8) % 2;
      ctx.fillStyle = lit; ctx.fillRect(cx - wpx * 0.47, cy - h * (car.truck ? 0.2 : 0.5), wpx * 0.22, Math.max(1, h * 0.14)); ctx.fillRect(cx + wpx * 0.25, cy - h * (car.truck ? 0.2 : 0.5), wpx * 0.22, Math.max(1, h * 0.14));
      if (blink) { ctx.fillStyle = '#fbbf24'; ctx.fillRect(cx + (car.to < car.lane ? -0.5 : 0.42) * wpx, cy - h * 0.42, wpx * 0.08, Math.max(1, h * 0.12)); }
      if (siren) { ctx.fillStyle = siren === 1 ? '#60a5fa' : '#f87171'; ctx.fillRect(cx - 1, cy - h - 2, 2, 2); }
      ctx.restore();
      return;
    }
    // shadow (and wet-road reflections of the tail lights)
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(cx, cy - ppu * 0.05, wpx * 0.56, wpx * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    if ((this.theme.wet || night) && wpx > 14 && !this.lo) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rl = wpx * (this.theme.wet ? 0.6 : 0.22), ra = this.theme.wet ? 0.5 : 0.25;
      for (const sx of [-0.35, 0.35]) { ctx.save(); ctx.translate(cx + sx * wpx, cy + rl * 0.4); ctx.scale(0.25, 1); glow(ctx, 0, 0, rl, '#f43f5e', ra); ctx.restore(); }
      ctx.restore();
    }
    const heading = Math.atan2(seg.dx || 0, SEG) * 0.7;
    const view = Math.atan((cx - W / 2) / (W / 2 * CAM_DEPTH)) * 0.85;
    const slope = Math.atan((seg.y2 - seg.y1) / SEG);
    const pitch = Math.max(0.02, 0.45 * Math.atan2(CAM_H + this.playerY - wy, Math.max(200, dzCam)) - slope * 0.9);
    if (car.ghost) {
      ctx.globalAlpha = 0.3 * Math.max(0, 1 - f);
      drawCar(ctx, SPORTS, { x: cx, y: cy, ppu, pal: palette('#bae6fd', { stripe: '#ffffff', glass: '#0c4a6e', tail: '#7dd3fc', dark: '#38bdf8' }), yaw: Math.atan2(seg.dx || 0, SEG) * 0.7 - Math.atan((cx - W / 2) / (W / 2 * CAM_DEPTH)) * 0.85,
        pitch: Math.max(0.02, 0.45 * Math.atan2(CAM_H + this.playerY - wy, Math.max(200, dzCam))), persp: Math.min(0.08, 200 / Math.max(300, dzCam)), amb: 0.8, alpha: ctx.globalAlpha });
      if (wpx > 18) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#e0f2fe'; ctx.font = `800 ${Math.max(9, Math.min(13, wpx * 0.15))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('👻 BEST', cx, cy - ppu * 1.8); }
      ctx.restore();
      return;
    }
    const mesh = car.rival ? SPORTS : car.police ? POLICE : car.truck ? TRUCK : car.kind === 'suv' ? SUV : car.kind === 'sports' ? SPORTS : SEDAN;
    const pal = car.rival ? palette('#18181b', { stripe: '#fbbf24', tail: '#a855f7', dark: '#0a0a0a' })
      : car.police ? palette('#0f172a', { stripe: '#f8fafc' })
      : car.truck ? palette(car.color, { stripe: '#f8fafc' })
      : palette(car.color);
    if (car.truck) pal[0] = '#d4d4d8', pal[8] = car.color;
    drawCar(ctx, mesh, {
      x: cx, y: cy, ppu, pal, yaw: heading - view + (car.yawV || 0), pitch, roll: 0,
      persp: Math.min(0.08, 200 / Math.max(300, dzCam)), fog: fogA,
      amb: seg.tunnel ? 0.3 : this.theme.amb, halo: this.lo ? 0 : seg.tunnel ? 1 : this.theme.halo, glow,
      lights: { brake: car.braking, indL: blinkOn && car.to < car.lane, indR: blinkOn && car.to > car.lane, siren },
    });
    if (car.rival && wpx > 16) {
      ctx.fillStyle = '#c084fc'; ctx.font = `800 ${Math.max(9, Math.min(14, wpx * 0.16))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('VIPER', cx, cy - ppu * 1.8);
    }
    ctx.restore();
  }

  drawHud(ctx) {
    const s = this.s, t = this.t;
    ctx.fillStyle = 'rgba(3,5,20,.72)'; ctx.fillRect(0, 0, W, 64);
    ctx.save(); ctx.textBaseline = 'middle';
    const prog = clamp((this.position + PLAYER_Z) / this.finishZ, 0, 1);
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 120, 20, s.bonusLeft / 15, '#fbbf24', `★ COIN HIGHWAY · ${this.coinsGot} coins · ${Math.ceil(s.bonusLeft)}s`);
    } else {
      const k = this.timeMax ? this.timeLeft / this.timeMax : 0;
      ctx.textAlign = 'center';
      ctx.font = '900 30px system-ui';
      ctx.fillStyle = this.timeLeft < 6 ? (Math.floor(t * 4) % 2 ? '#f87171' : '#fecaca') : k < 0.3 ? '#fbbf24' : '#f8fafc';
      ctx.fillText(`${Math.max(0, this.timeLeft).toFixed(1)}`, W / 2, 26);
      ctx.font = '700 10px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText('TIME', W / 2, 50);
      ctx.textAlign = 'left'; ctx.font = '800 13px system-ui'; ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`🏁 ${Math.round(prog * 100)}%`, 14, 22);
      progressBar(ctx, 14, 38, 150, 10, prog, '#f97316');
      if (this.rival) {                                                                   // VIPER on the progress bar
        const rp = clamp(this.rival.z / this.finishZ, 0, 1);
        ctx.fillStyle = '#c084fc'; ctx.beginPath(); ctx.arc(14 + 150 * rp, 43, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0b0b1a'; ctx.lineWidth = 1.5; ctx.stroke();
        const ahead = this.rival.z > this.position + PLAYER_Z;
        ctx.font = '800 10px system-ui'; ctx.fillStyle = ahead ? '#c084fc' : '#86efac';
        ctx.fillText(this.rival.done ? 'VIPER WON' : ahead ? 'VIPER AHEAD' : 'YOU LEAD', 14, 57);
      }
      if (this.nearChain >= 2) { ctx.fillStyle = '#fde047'; ctx.font = '800 13px system-ui'; ctx.fillText(`💨 ×${this.nearChain}`, 100, 22); }
      if (this.ghost && this.ghostDelta != null) {
        const d = this.ghostDelta, ahead = d < 0;
        ctx.fillStyle = ahead ? '#86efac' : '#fca5a5'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'left';
        ctx.fillText(`👻 ${ahead ? '−' : '+'}${Math.abs(d).toFixed(1)}s`, this.rival ? 104 : 14, 57);
        const gp = clamp(this.ghost.z / this.finishZ, 0, 1);
        ctx.fillStyle = '#e0f2fe'; ctx.fillRect(14 + 150 * gp - 1, 36, 2, 14);
      }
    }
    // speedometer
    const pct = clamp(this.speed / (this.maxSpeed * 1.3), 0, 1), gx = W - 38, gy = 32, R = 24;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.beginPath(); ctx.arc(gx, gy, R, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    ctx.strokeStyle = this.boosting ? '#38bdf8' : pct > 0.77 ? '#f97316' : '#e2e8f0';
    ctx.beginPath(); ctx.arc(gx, gy, R, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * pct)); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.textAlign = 'center'; ctx.font = '900 15px system-ui'; ctx.fillStyle = this.boosting ? '#38bdf8' : '#f8fafc';
    ctx.fillText(`${Math.round(this.speed / BASE_MAX * 240)}`, gx, gy);
    ctx.font = '700 8px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText('KM/H', gx, gy + 15);
    if (!this.bonus) {
      progressBar(ctx, W - 186, 30, 112, 9, this.boost, this.boost > 0.3 ? '#38bdf8' : '#64748b', '');
      ctx.font = '700 10px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left'; ctx.fillText('NITRO ↑', W - 186, 20);
      progressBar(ctx, W - 186, 45, 112, 5, this.draft, '#e2e8f0', '');
      ctx.font = '700 8px system-ui'; ctx.fillStyle = this.drafting ? '#e0f2fe' : '#64748b'; ctx.fillText('SLIPSTREAM', W - 186, 57);
      if (this.shield) { ctx.font = '16px system-ui'; ctx.textAlign = 'right'; ctx.fillText('🛡', W - 76, 20); }
    }
    // 🚨 police coming up behind you
    const p = this.police, pz = this.position + PLAYER_Z;
    if (p && p.z < pz && p.z > pz - 34 * SEG) {
      const x = clamp(W / 2 + (p.x - this.playerX) * 230, 30, W - 30), y = H - 46, on = Math.floor(t * 8) % 2;
      ctx.fillStyle = on ? '#ef4444' : '#3b82f6'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 18, y + 8); ctx.lineTo(x - 18, y + 8); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '800 12px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(p.locked ? '🚨 MOVE!' : '🚨 POLICE', x, y + 22);
    }
    // touch hint
    ctx.textAlign = 'center'; ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.4)';
    if (s.state === 'playing' && this.position < SEG * 60) ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Hold left / right side to steer · middle to boost' : '← → steer · ↑ boost · ↓ brake', W / 2, H - 10);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.fillText('★ GOLDEN RACER', W / 2, 78); }
    ctx.restore();
  }
}

// ── 👻 Ghost: your best time on each level, replayed as a see-through car ──
const GHOST_DT = 0.25;
const ghostKey = (mode, level) => `turbo-ghost:v1:${mode}:${level}`;
function loadGhost(mode, level) {
  try { const g = JSON.parse(localStorage.getItem(ghostKey(mode, level)) || 'null'); return g && g.t > 0 && Array.isArray(g.s) ? g : null; } catch { return null; }
}
function saveGhost(mode, level, g) { try { localStorage.setItem(ghostKey(mode, level), JSON.stringify(g)); } catch { /* storage full or blocked: no ghost */ } }

/** a soft round glow, pre-drawn once per colour (much cheaper than shadowBlur or a new gradient every frame) */
const GLOWS = new Map();
function glow(ctx, x, y, r, color, alpha = 1) {
  let c = GLOWS.get(color);
  if (!c) {
    c = canvas(64, 64); const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + 'aa'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); GLOWS.set(color, c);
  }
  if (r < 0.5) return;
  const a = ctx.globalAlpha; ctx.globalAlpha = a * alpha; ctx.drawImage(c, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = a;
}
let VIGNETTE = null;
function vignette() {
  if (VIGNETTE) return VIGNETTE;
  VIGNETTE = canvas(W, H); const g = VIGNETTE.getContext('2d');
  const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return VIGNETTE;
}

/** tiny seeded random for the pre-drawn sky (so each level's sky is the same every time) */
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

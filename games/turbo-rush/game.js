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
//  Every 5th level: ★ COIN HIGHWAY — no traffic, no clock, grab the coins
//  (from level 10, every other one is a ★ NIGHT RAIN SPRINT through the tunnels).
//
//  v3 "cockpit" edition: you drive from the DRIVER'S SEAT by default (C / the
//  VIEW button swaps to the old chase cam). The camera borrows Neon Drift 3D's
//  tricks — body roll into bends, head bob on kerbs and knocks, looking up and
//  down hills, a wider view on boost — and the cabin is a red GT: painted
//  A-pillars and bonnet, a carbon dash with an analogue speedo + rev counter,
//  gear readout, nitro gauge and warning lamps, a turning wheel with gloved
//  hands, and a rear-view mirror that shows who's behind you (police, VIPER).
//  Nitro also charges from near misses, clean overtaking streaks and running
//  flat out. Sound: a live engine that changes gear, wind rush, tunnel boom,
//  rain on the roof, tyre squeal, cars whooshing past.
//  The world runs from a midday coast road (L1-2) through a mountain pass at
//  sunset (L3-5) to city freeways under overpasses at dusk (L6-7) and night.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { SPORTS, SEDAN, SUV, TRUCK, POLICE, drawCar, palette, rgb } from '../../assets/js/car-models.js';
import { tilt } from '../../assets/js/tilt.js';
import { TouchWheel } from '../../assets/js/touch-wheel.js';

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
// cockpit camera: eye height above the road, where the driver's eyes sit relative to your rear bumper
// (negative = ahead of it), and how far the horizon is lifted on screen (so more road shows over the dash)
const CP_H = 300, CP_BACK = -120;
// the shorter windscreen: where the horizon sits on screen, and how much the world is scaled down so the same view fits in it
const CP_HZ = 252, CP_SCALE = 0.87;

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
  // L1-2: a coast road at midday — bright sky, the sea on the horizon, palms and crash barriers
  coast: { sky: ['#1d6fd1', '#5aa8ec', '#bfe3fb'], sun: '#fffbe8', day: true, grass: ['#d9c08a', '#cfb47c'], rumble: ['#ef4444', '#f8fafc'], road: ['#4b5160', '#474d5b'], lane: '#f8fafc', fog: '#a9cfe9', city: '#7aa3c4', glow: '#38bdf8',
    scenery: 'palms', sea: ['#0b5ea8', '#2b8fd6'], mount: ['#5f88a8', '#7aa0bc'], ridge: null, amb: 0.95, halo: 0, leaf: '#2f7d32', trunk: '#7c5a3a', rail: true },
  // L3-5: a mountain pass in the late afternoon — warm low sun, red rock, pines, rails and tunnels
  canyon: { sky: ['#3b4f8f', '#d9785a', '#ffc773'], sun: '#ffe0a3', day: true, grass: ['#6b4a2e', '#614229'], rumble: ['#f8fafc', '#dc2626'], road: ['#3b3a40', '#37363c'], lane: '#fde68a', fog: '#d49a72', city: '#8a4a32', glow: '#fb923c',
    scenery: 'forest', mount: ['#9a4a2c', '#6e3420'], ridge: '#ffb37a', amb: 0.8, halo: 0.15, leaf: '#2e4a2a', trunk: '#3b2a1c' },
  // L6-7: the city freeway at dusk
  dusk:  { sky: ['#1e0b3d', '#7c2d6b', '#f97316'], sun: '#fbbf24', grass: ['#1a0f33', '#150c2b'], rumble: ['#f472b6', '#e2e8f0'], road: ['#2a2540', '#262139'], lane: '#e2e8f0', fog: '#3b1d55', city: '#2b1247', glow: '#f472b6',
    scenery: 'city', mount: ['#3b1260', '#25093f'], ridge: '#f472b6', amb: 0.5, halo: 0.5, leaf: '#3a0f4c', trunk: '#24092f', bcols: ['#2a1640', '#331a4d', '#24123a', '#3a1d52'], win: ['#fde68a', '#f9a8d4', '#fdba74'] },
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

/** ★ NIGHT RAIN SPRINT: from level 10, every other Coin Highway runs at night in the rain, through tunnels */
const rainSprint = (level, bonus) => bonus && level >= 10 && level % 10 === 0;
function themeFor(level, bonus) {
  if (bonus) return rainSprint(level, bonus) ? 'rain' : 'gold';
  if (level >= 11) return ['fog', 'rain', 'night'][(level - 11) % 3];     // 11 fog · 12 rain · 13 night · 14 fog …
  if (level === 8) return 'rain';
  if (level >= 9) return 'night';
  if (level >= 6) return 'dusk';                                          // city freeway at dusk
  if (level >= 3) return 'canyon';                                        // mountain pass, late afternoon
  return 'coast';                                                         // coast road at midday
}

runGame({
  id: ID,
  width: W, height: H,
  detail: true,                      // offers the 🖥 Graphics HIGH / LOW switch
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  comboWindow: 3,
  comboStep: 3,
  maxMultiplier: 6,
  bonusTime: 15,
  music: { bpm: 128, style: 'hero', lead: 'sawtooth', kit: 'synth', arp: [0, 2, 4, 2, 1, 3, 5, 3], oct: [12, 12, 12, 12, 12, 12, 24, 12], hook: [0, 2, 1, null, 4, 2, 3, null] },
  levelInfo(level, bonus) {
    if (rainSprint(level, bonus)) return '★ NIGHT RAIN SPRINT! No traffic, no clock — a wet night run through the tunnels. Grab every coin in 15 seconds. Big ★ coins are worth 10.';
    if (bonus) return '★ COIN HIGHWAY! No traffic, no clock — grab every coin you can in 15 seconds. Big ★ coins are worth 10.';
    const notes = {
      1: 'You\'re in the driver\'s seat! Reach the checkpoint before the clock runs out. Steer ← →, hold ↑ for nitro, ↓ brake, C (or 🎥 VIEW) swaps camera. Near misses, clean overtakes, slipstreams and running flat out all fill your nitro.',
      2: 'Hills ahead — you can\'t see what\'s over the top.',
      3: '⛰️ The mountain pass: rush-hour traffic — and tunnels. Grab ⏱ for +3 seconds.',
      4: '🏁 RIVAL DUEL! Beat VIPER to the checkpoint for a big bonus. 🚚 Trucks are wide and slow.',
      6: '🌆 The city freeway at dusk — watch for the overpasses. 🛡 Shields soak up one crash.',
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
  if (th.day) for (let i = 0; i < (id === 'coast' ? 12 : 8); i++) {     // fair-weather clouds, lit from the sun's side
    const cx = rng() * W, cy = 30 + rng() * (HORIZON * 0.5), cw = 40 + rng() * 70;
    for (let k = 0; k < 6; k++) {
      const bx = cx + (k - 2.5) * cw * 0.32, by = cy - Math.sin(k / 5 * Math.PI) * cw * 0.25, br = cw * (0.22 + rng() * 0.14);
      g.fillStyle = id === 'coast' ? `rgba(255,255,255,${0.55 + rng() * 0.3})` : `rgba(255,${200 + rng() * 40 | 0},${170 + rng() * 40 | 0},${0.35 + rng() * 0.25})`;
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
    }
  }
  if (id === 'rain') for (let i = 0; i < 14; i++) {                 // heavy clouds
    g.fillStyle = `rgba(15,23,42,${0.25 + rng() * 0.3})`; g.beginPath(); g.ellipse(rng() * W, 20 + rng() * 140, 90 + rng() * 120, 22 + rng() * 20, 0, 0, Math.PI * 2); g.fill();
  }
  // mountains (two layers)
  const MW = W * 2, mh = 150, mount = canvas(MW, mh), mg = mount.getContext('2d');
  const ridge = (amp, base, seed, f) => { const pts = []; for (let x = 0; x <= MW; x += 8) { const t = x / MW * Math.PI * 2; pts.push([x, base - amp * (0.5 + 0.3 * Math.sin(t * 2 + seed) + 0.15 * Math.sin(t * 5 + seed * 2) + 0.08 * Math.sin(t * 11 + seed * 3)) * f]); } return pts; };
  for (const [li, col] of th.mount.entries()) {
    const pts = ridge((li ? 60 : 110) * (id === 'coast' ? 0.32 : 1), mh, li * 3.1 + 1, 1);
    mg.fillStyle = col; mg.beginPath(); mg.moveTo(0, mh); for (const p of pts) mg.lineTo(...p); mg.lineTo(MW, mh); mg.fill();
    if (th.ridge && li === 0) { mg.strokeStyle = th.ridge; mg.globalAlpha = 0.55; mg.lineWidth = 1.5; mg.beginPath(); pts.forEach((p, i) => (i ? mg.lineTo(...p) : mg.moveTo(...p))); mg.stroke(); mg.globalAlpha = 1; }
    if (id === 'fog') { mg.fillStyle = `rgba(139,147,161,${li ? 0.35 : 0.55})`; mg.fillRect(0, 0, MW, mh); }
  }
  if (th.day) return { sky, mount, city: null };                   // no skyline out on the coast or in the mountains
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
    // ── Camera: the driver's seat (default) or the chase cam — C on a keyboard, the VIEW button on touch ──
    this.view = 'cockpit';
    try { if (localStorage.getItem('tr-view') === 'chase') this.view = 'chase'; } catch { /* storage blocked */ }
    addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat && !(e.target instanceof HTMLInputElement) && this.s.state === 'playing') this.toggleView(); });
    this.cam = { roll: 0, py: 0, bobX: 0, bobY: 0, rumble: 0, jolt: 0, zoom: 1, wheel: 0, wheelV: 0, lean: 0, init: false };
    this.sfx = null;                // continuous sounds (engine, wind, rain, squeal, nitro roar), made on first use
    try { if (new URLSearchParams(location.search).has('trdebug')) window.__tr = this; } catch { /* no window */ }   // test hook
    // ── Tilt steering ──────────────────────────────────────────
    this.tiltDev = tilt();          // shared phone-tilt reader (asks iOS for permission on a real tap)
    // ── Touch wheel: on a phone in the cockpit, drag the steering wheel; hold NITRO with the other thumb.
    //    Tilt then only leans the camera (chase cam keeps side zones + tilt steering).
    this.wheelTouch = new TouchWheel(s, {
      zone: () => ({ x: 96, y: 536, w: W - 192, h: H - 536 + this.drop() }),
      enabled: () => this.cockpit && this.s.state === 'playing',
      holds: { nitro: () => this.nitroButton() },
    });
    this.startLevel(1, false);
  }

  /** the driver's seat is used whenever you're racing (the title screen shows your car from behind) */
  get cockpit() { return this.view === 'cockpit' && this.s.state !== 'title'; }
  toggleView() {
    this.view = this.view === 'cockpit' ? 'chase' : 'cockpit';
    try { localStorage.setItem('tr-view', this.view); } catch { /* storage blocked */ }
    this.s.sound.play('click');
    this.s.fx.text(W / 2, 200, this.view === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE CAM', { color: '#f8fafc', size: 22, life: 0.9 });
    this.cam.init = false;
    this.wheelTouch?.release();
  }
  /** portrait bands: on a tall phone the wheel and buttons hang below the box, at thumb height */
  drop() { const b = this.s.bands?.bottom || 0; return b >= 120 ? Math.min(b - 20, 160) : 0; }
  /** in touch-wheel mode NITRO takes the bottom-right corner (the boosting thumb) and VIEW moves bottom-left */
  viewButton() { const d = this.drop(); return this.wheelMode ? { x: 8, y: H - 44 + d, w: 84, h: 34 } : { x: W - 92, y: H - 44 + d, w: 84, h: 34 }; }
  /** NITRO (hold) — only in touch-wheel mode */
  nitroButton() { const d = this.drop(); return { x: W - 96, y: H - 92 + d, w: 88, h: 82 }; }
  get wheelMode() { return this.wheelTouch.active; }
  onAction(a, x, y) {
    if (a === 'press') {
      const b = this.viewButton();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this.toggleView(); this.btnPress = true; }
    } else if (a === 'release') this.btnPress = false;
  }
  /** fx that would land on the dashboard are lifted into the windscreen in the cockpit */
  fy(y) { return this.cockpit && y > 360 ? y - 210 : y; }

  /** tilt is steering once real sensor readings arrive (see assets/js/tilt.js) */
  get tiltEnabled() { return this.tiltDev.on; }
  get _needsTiltPermission() { return this.tiltDev.need; }

  reset() {}

  /** LOW graphics: shorter view, fewer trees, simpler far cars, no glows. */
  applyDetail() { this.lo = this.s.lowDetail; this.drawDist = this.themeId === 'fog' ? 70 : this.lo ? (this.s.coarse ? 75 : 95) : 150; }   // LOW on a phone draws a shorter road
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
    this.sprint = rainSprint(level, bonus);
    const slick = this.themeId === 'rain' && !bonus;                  // the bonus sprint looks wet but keeps full grip
    this.grip = slick ? 0.8 : 1;
    this.centrifugal = slick ? 0.42 : 0.3;
    this.applyDetail();
    this.fogDensity = this.themeId === 'fog' ? 6 : this.themeId === 'rain' ? 3 : this.theme.day ? 1.6 : 2;
    this.feat = {
      tunnels: (!bonus && level >= 3) || this.sprint, rival: !bonus && level % 5 === 4, closures: !bonus && level >= 7,
      police: !bonus && level >= 9, timePU: !bonus && level >= 3, shieldPU: !bonus && level >= 6,
    };
    this.position = 0; this.speed = 0; this.playerX = 0; this.playerY = 0; this.steer = 0;
    // Re-calibrate tilt neutral each level so players don't have to hold the phone perfectly flat
    this.tiltDev.calibrate();
    this.skyOff = 0; this.boost = 1; this.boosting = false;
    this.invuln = 0; this.crashFx = 0; this.shakeT = 0;
    this.near = 0; this.nearChain = 0; this.passedCount = 0; this.crashes = 0; this.coinsGot = 0;
    this.cleanRun = 0; this.flatT = 0; this.warnT = 0; this.wasBoosting = false; this.gear = 1; this.rpm = 0.2;
    this.drops = []; this.wiperT = 0; this.underT = 0; this.cam.init = false;
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
    const avg = Math.min(0.61, 0.50 + level * 0.01);            // average speed the clock expects (fraction of top speed) — tuned down ~20% for a gentler time limit
    // Easier start (28 Oct 2026): levels 1–5 get a few grace seconds (L1 +5 … L5 +1) —
    // every recorded run in the first month ended before level 6, so the opening clock
    // was the wall. Level 6 onward is unchanged.
    this.timeMax = bonus ? 0 : Math.round(this.finishZ / (this.maxSpeed * avg) + 3 + (this.closures.length ? 2 : 0) + Math.max(0, 6 - level));
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
    let nextGantry = r.int(50, 80), nextBB = r.int(20, 40), nextBridge = r.int(60, 90);
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
        // overpasses: a concrete bridge across the freeway every so often
        if (--nextBridge <= 0 && !nearLine && seg.i > 50 && seg.i < this.finishIndex - 30 && !this.segs.slice(seg.i, seg.i + 4).some((q) => q.tunnel)) {
          seg.overpass = true;
          for (let k = 0; k < 4; k++) this.segs[seg.i + k].under = true;
          nextBridge = r.int(70, 130);
        }
      } else if (kind === 'palms') {
        for (const sd of [-1, 1]) if (r.chance(0.2)) seg.props.push({ k: 'palm', x: sd * r.range(1.5, 3.6) });
        if (r.chance(0.04)) seg.props.push({ k: 'bush', x: r.pick([-1, 1]) * r.range(1.4, 2) });
        if (th.rail) seg.rail = true;
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
    // Segments between cars (on average) — widened ~20% for lighter traffic, and levels
    // 1–4 run lighter still (L1 ×1.24 → L4 ×1.06) so the first runs teach overtaking
    // before the road fills up. From level 5 the old density is back.
    const gap = Math.max(15, 36 - L * 1.5) * (L < 5 ? 1.3 - L * 0.06 : 1);
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
        speed: this.maxSpeed * (truck ? r.range(0.16, 0.24) : r.range(0.22, 0.40 + Math.min(0.12, L * 0.008))),
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
    if (this.wheelMode) {
      // cockpit on a phone: the wheel steers (analogue), NITRO is held, tilt only leans the camera
      this._wheel = this.wheelTouch.value();
      this._tiltFrac = 0;
      this._lean = this.tiltEnabled ? this.tiltDev.steer(2, 25) : 0;
      return { left, right, boost: boost || this.wheelTouch.held('nitro'), brake };
    }
    this._wheel = 0; this._lean = 0;
    if (p.down && !this.btnPress) {
      if (this.tiltEnabled) {
        // Tilt active: any tap in the middle 60% = boost; edges still steer as fallback
        if (p.x < W * 0.2) left = true;
        else if (p.x > W * 0.8) right = true;
        else boost = true;
      } else {
        // No tilt: standard left / middle / right zones
        if (p.x < W * 0.36) left = true;
        else if (p.x > W * 0.64) right = true;
        else boost = true;
      }
    }
    // Tilt steering: gamma is left/right lean in degrees (portrait phone)
    // Dead zone ±3°, full steer at ±20° from calibrated neutral
    if (this.tiltEnabled) {
      const t = this.tiltDev.steer(3, 20);
      if (t < -0.15) left = true;
      if (t > 0.15) right = true;
      // Store tilt fraction for the HUD indicator
      this._tiltFrac = t;
    } else {
      this._tiltFrac = 0;
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
    this.nearChain = 0; this.draft = 0; this.cleanRun = 0;
  }

  idle(dt) { this.t += dt; this.updateCamera(dt); }

  /** nitro from driving well: near misses, clean overtaking streaks, running flat out */
  addBoost(a, label, col) {
    if (this.bonus) return;
    const before = this.boost;
    this.boost = Math.min(1, this.boost + a);
    if (label) this.s.fx.text(W / 2, this.fy(H - 250), label, { color: col, size: 16, life: 0.8 });
    if (this.boost >= 1 && before < 1) {
      this.s.fx.text(W / 2, this.fy(H - 280), 'NITRO FULL — HOLD ↑', { color: '#38bdf8', size: 18, life: 1 });
      this.s.sound.tone({ freq: 880, to: 1760, dur: 0.18, type: 'triangle', vol: 0.06 });
    }
  }
  /** a screen point at the left (-1) or right (1) side of your car — for sparks and dust */
  side(sd) { return this.cockpit ? [sd < 0 ? 46 : W - 46, 396] : [W / 2 + sd * 45, PLAYER_Y - 20]; }

  /** the nitro kicking in: a rushing whoosh, a low thump and a turbo whistle */
  boostSound() {
    const snd = this.s.sound;
    if (snd.muted) return;
    snd.noise({ dur: 0.7, vol: 0.15, freq: 300, to: 3600, type: 'bandpass' });
    snd.tone({ freq: 90, to: 36, dur: 0.32, type: 'sine', vol: 0.28 });
    snd.tone({ freq: 1800, to: 3400, dur: 0.35, type: 'sine', vol: 0.025, delay: 0.05 });
  }
  /** a crash: a heavy thud and the crumple of metal and glass */
  crunch() {
    const snd = this.s.sound;
    if (snd.muted) return;
    snd.tone({ freq: 70, to: 28, dur: 0.5, type: 'sine', vol: 0.4 });
    for (let i = 0; i < 7; i++) snd.noise({ dur: 0.05 + Math.random() * 0.08, vol: 0.12, freq: 500 + Math.random() * 2500, type: 'bandpass', delay: 0.03 + i * 0.045, pan: Math.random() * 1.2 - 0.6 });
    snd.noise({ dur: 0.35, vol: 0.06, freq: 7000, type: 'highpass', delay: 0.12 });        // glass
  }

  /** gears and revs from the speed: six gears spread over the speed range, revs climbing through each */
  gearbox(dt) {
    const f = clamp(this.speed / (this.maxSpeed * 1.3), 0, 0.999);
    const gear = this.speed < 60 ? 1 : Math.floor(f * 6) + 1;
    let target = 0.18 + 0.78 * (f * 6 - (gear - 1));
    if (this.speed < 60) target = 0.12;
    if (this.boosting) target = Math.min(0.99, target + 0.08);
    if (gear !== this.gear) {
      const up = gear > this.gear;
      this.gear = gear;
      if (this.s.state === 'playing' && !this.s.sound.muted) {
        // the clunk of the shift, and the revs drop (or blip on a down-shift)
        this.s.sound.noise({ dur: 0.06, vol: 0.09, freq: 700, type: 'lowpass' });
        this.s.sound.tone({ freq: up ? 140 : 90, to: up ? 70 : 150, dur: 0.08, type: 'triangle', vol: 0.08 });
      }
      this.rpm = up ? Math.max(0.15, this.rpm - 0.5) : Math.min(0.95, this.rpm + 0.3);
    }
    this.rpm += (target - this.rpm) * Math.min(1, dt * 7);
  }

  /** continuous sounds, steered every frame: engine (follows the rev counter, louder and boomier in tunnels),
   *  wind rush with speed, the nitro roar, rain drumming on the roof and the brakes squealing */
  carAudio() {
    const snd = this.s.sound;
    if (snd.muted || this.s.state !== 'playing') return;
    if (!this.sfx) this.sfx = {
      engine: snd.voice({ type: 'sawtooth', filter: 'lowpass', q: 3 }),
      engine2: snd.voice({ type: 'square', filter: 'lowpass', q: 1 }),
      echo: snd.voice({ type: 'sawtooth', filter: 'lowpass', q: 6 }),
      wind: snd.voice({ type: null, noise: true, filter: 'bandpass', q: 0.6 }),
      roar: snd.voice({ type: null, noise: true, filter: 'lowpass', q: 1 }),
      rain: snd.voice({ type: null, noise: true, filter: 'highpass', q: 0.5 }),
      squeal: snd.voice({ type: 'sawtooth', noise: true, filter: 'bandpass', q: 9 }),
    };
    const pct = clamp(this.speed / this.maxSpeed, 0, 1.3), rev = this.rpm, inside = this.inTunnel || this.underT > 0;
    const loud = this.cockpit ? 1 : 0.75;
    const hz = 42 + rev * 100 + this.gear * 7 + (this.boosting ? 14 : 0);
    this.sfx.engine.set({ freq: hz, vol: (0.03 + rev * 0.012) * loud * (inside ? 1.4 : 1), cutoff: 340 + rev * 900 + (this.boosting ? 700 : 0) });
    this.sfx.engine2.set({ freq: hz * 2.01, vol: 0.009 * loud, cutoff: 700 + rev * 600 });
    // tunnels and bridges: a second, slightly detuned engine — the boom of the walls
    this.sfx.echo.set({ freq: hz * 0.995, vol: inside ? 0.022 * loud : 0, cutoff: 500 + rev * 500 });
    this.sfx.wind.set({ cutoff: 500 + pct * 1400, vol: (inside ? 0.012 : 0.03) * pct * pct * (this.cockpit ? 0.8 : 1) });
    this.sfx.roar.set({ cutoff: 600 + 500 * Math.random(), vol: this.boosting ? 0.06 : 0 });
    this.sfx.rain.set({ cutoff: 2500, vol: this.themeId === 'rain' && !inside ? 0.025 : 0 });
    this.sfx.squeal.set({ freq: 700, cutoff: 1500 + Math.sin(this.t * 37) * 120, vol: this.skid ? 0.03 : 0 });
  }

  /** the driver's eyes: roll into bends, bob on kerbs, grass and knocks, look up a climb / down a dip */
  updateCamera(dt) {
    const c = this.cam;
    if (!this.segs) return;
    const pz = this.position + PLAYER_Z, seg = this.segAt(pz), pct = clamp(this.speed / this.maxSpeed, 0, 1.3);
    // look where the road goes: render() measures how far the road ahead sits above (climb) or below (drop) where a
    // flat road would be on screen, and the eyes tilt to keep it in the middle of the windscreen
    const tpy = this.roadTilt || 0;
    const troll = -(this.steer || 0) * 0.035 - seg.curve * pct * 0.012;
    const off = Math.abs(this.playerX) > 1 && this.speed > 500;
    const kerb = Math.abs(this.playerX) > 0.92 && this.speed > 500;
    const rumble = off ? 2.4 : kerb ? 1.2 : 0;
    const zoom = this.boosting ? 1.09 : 1.03 + pct * 0.01;
    // the wheel springs back to centre with a little overshoot
    const k = 60, damp = 11, want = (this.steer || 0) + (this.crashFx > 0 ? Math.sin(this.t * 30) * 0.3 * this.crashFx : 0);
    if (!c.init || dt <= 0) { c.roll = troll; c.py = tpy; c.rumble = rumble; c.zoom = zoom; c.wheel = want; c.wheelV = 0; c.init = true; }
    else {
      c.roll += (troll - c.roll) * Math.min(1, dt * 4);
      c.py += (tpy - c.py) * Math.min(1, dt * 8);
      c.rumble += (rumble - c.rumble) * Math.min(1, dt * 10);
      c.zoom += (zoom - c.zoom) * Math.min(1, dt * 3);
      c.wheelV += ((want - c.wheel) * k - c.wheelV * damp) * dt; c.wheel += c.wheelV * dt;
    }
    c.lean += ((this._lean || 0) - c.lean) * Math.min(1, dt * 6);   // tilt leans your head a touch (touch-wheel mode)
    c.jolt = Math.max(0, c.jolt - dt * 3);
    if (this.crashFx > 0) this.crashFx = Math.max(0, this.crashFx - dt * 1.5);
    const t = this.t;
    // layered sines = smooth "noise": no frame-to-frame jitter
    c.bobX = c.rumble * (0.6 * Math.sin(t * 47) + 0.4 * Math.sin(t * 71 + 1.3)) + c.jolt * 3 * Math.sin(t * 38);
    c.bobY = c.rumble * (0.6 * Math.sin(t * 53 + 0.7) + 0.4 * Math.sin(t * 89)) + c.jolt * 3 * Math.sin(t * 43 + 2) + Math.sin(t * 9) * 0.5 * pct;
  }

  /** rain running up the windscreen (pushed by the airflow) and the wiper sweeping it clear */
  weather(dt) {
    if (this.warnT > 0) this.warnT -= dt;
    if (this.underT > 0) this.underT -= dt;
    const wet = this.themeId === 'rain' && !this.inTunnel && this.underT <= 0;
    const pct = clamp(this.speed / this.maxSpeed, 0, 1.3);
    if (wet && this.drops.length < (this.lo ? 25 : 60) && Math.random() < dt * 40) {
      this.drops.push({ x: 4 + Math.random() * (W - 8), y: 140 + Math.random() * 270, r: 1.5 + Math.random() * 2.8, life: 1 });
    }
    for (const d of this.drops) {
      d.y -= (20 + pct * 120 * (d.r / 3)) * dt;                   // airflow pushes the drops up the glass
      d.x += (d.x - W / 2) * 0.25 * dt * pct;
      if (d.y < 121) d.life = 0;
    }
    // the wiper sweeps every ~1.4 s in the rain
    if (wet || this.wiperT > 0) {
      this.wiperT += dt;
      if (this.wiperT > 1.4) this.wiperT = wet ? 0.0001 : 0;
      const a = this.wiperAngle();
      if (a != null) {
        const cx = W * 0.32, cy = 434;
        for (const d of this.drops) { const da = Math.atan2(d.y - cy, d.x - cx); if (Math.abs(da - a) < 0.12) d.life = 0; }
      }
    }
    this.drops = this.drops.filter((d) => d.life > 0);
  }
  /** the wiper arm's angle (radians, pivot at the bottom-left of the screen), or null when it's parked */
  wiperAngle() {
    const u = this.wiperT / 0.7;
    if (this.wiperT <= 0 || u >= 2) return null;
    const sweep = u < 1 ? u : 2 - u;
    return -Math.PI + 0.12 + sweep * (Math.PI - 0.5);
  }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    this.step(dt);
    this.gearbox(dt);
    this.updateCamera(dt);
    this.weather(dt);
    this.carAudio();
  }

  step(dt) {
    const s = this.s, L = this.level;
    this.t += dt;
    if (this.done) return;
    const c = this.controls();
    const max = this.maxSpeed;
    const seg = this.segAt(this.position + PLAYER_Z);
    const pct = this.speed / max;

    // steering + the road pulling you wide on bends
    const dx = dt * (2 + 0.5 * clamp(pct, 0, 1.3)) * Math.min(1, pct + 0.15) * this.grip;   // quicker lane changes the faster you go
    if (this._wheel) {
      // touch wheel: a gentle curve so small thumb movements make fine corrections
      const w = clamp(this._wheel, -1, 1);
      this.playerX += dx * w * Math.sqrt(Math.abs(w));
      this.steer = lerp(this.steer || 0, w, Math.min(1, dt * 12));
    } else if (this.tiltEnabled && this._tiltFrac) {
      // Analogue tilt: scale dx by how far the phone is tilted; more expressive than binary keys
      const tf = clamp(this._tiltFrac, -1, 1);
      this.playerX += dx * tf * Math.abs(tf);   // square-law for fine control near centre
      this.steer = lerp(this.steer || 0, tf, Math.min(1, dt * 10));
    } else {
      if (c.left) this.playerX -= dx;
      if (c.right) this.playerX += dx;
      this.steer = lerp(this.steer || 0, (c.right ? 1 : 0) - (c.left ? 1 : 0), Math.min(1, dt * 10));
    }
    this.playerX -= dx * pct * seg.curve * this.centrifugal;
    this.braking = c.brake;

    // speed: foot down by default, boost burns nitro
    this.boosting = c.boost && this.boost > 0.02 && !c.brake;
    const top = this.boosting ? max * 1.28 : max;
    if (c.brake) this.speed -= max * 1.2 * dt;
    else if (this.speed < top) this.speed += max / (this.boosting ? 2.5 : 4.2) * dt;
    else this.speed -= max / 3 * dt;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.28);
    else this.boost = Math.min(1, this.boost + dt * 0.035);
    if (this.boosting && !this.wasBoosting && this.boost > 0.12 && this.t - (this.boostSndT || -9) > 0.6) { this.boostSndT = this.t; this.boostSound(); }
    this.wasBoosting = this.boosting;
    // running flat out (without nitro) slowly tops the nitro up too
    if (!this.boosting && !this.bonus && pct > 0.95 && !c.brake) {
      if ((this.flatT += dt) >= 4) { this.flatT = 0; this.addBoost(0.08, 'FLAT OUT ⚡', '#fdba74'); }
    } else this.flatT = Math.max(0, this.flatT - dt * 2);
    // hard braking: tyre smoke (and a squeal — see carAudio)
    this.skid = c.brake && pct > 0.35;
    if (this.skid && Math.random() < dt * 14) {
      if (this.cockpit) s.fx.burst(Math.random() < 0.5 ? 40 : W - 40, 414, { colors: ['#cbd5e1', '#94a3b8', '#e2e8f0'], count: 2, speed: 60, life: 0.7, gravity: -40 });
      else s.fx.burst(W / 2 + (Math.random() < 0.5 ? -1 : 1) * PLAYER_PX * 0.4, this.fy(PLAYER_Y - 4), { colors: ['#cbd5e1', '#94a3b8', '#e2e8f0'], count: 2, speed: 60, life: 0.7, gravity: -40 });
    }
    const off = Math.abs(this.playerX) > 1;
    if (off && this.speed > max / 4) this.speed -= max * 0.9 * dt;
    this.speed = clamp(this.speed, 0, max * 1.3);
    const wl = seg.wall?.[0] ? -(WALL_X - 0.3) : -2.2, wr = seg.wall?.[1] ? WALL_X - 0.3 : 2.2;
    if ((this.playerX < wl || this.playerX > wr) && this.speed > 300) {          // scraping along a building
      this.speed *= Math.pow(0.4, dt); this.shakeT = 0.05; this.cam.jolt = Math.max(this.cam.jolt, 0.4);
      if (Math.random() < dt * 20) s.fx.burst(...this.side(this.playerX < 0 ? -1 : 1), { colors: ['#fde047', '#f97316', '#fff'], count: 3, speed: 160, life: 0.3 });
      if (Math.random() < dt * 6) s.sound.noise({ dur: 0.12, vol: 0.06, freq: 2600, type: 'bandpass', pan: this.playerX < 0 ? -0.7 : 0.7 });
    }
    this.playerX = clamp(this.playerX, seg.tunnel ? -1.12 : wl, seg.tunnel ? 1.12 : wr);
    if (off && this.speed > 500) { this.shakeT = 0.05; if (Math.random() < dt * 8) s.fx.burst(...(this.cockpit ? this.side(this.playerX > 0 ? 1 : -1) : [W / 2 + (this.playerX > 0 ? 40 : -40), H - 70]), { colors: ['#94a3b8', '#64748b'], count: 2, speed: 90, life: 0.3 }); }

    this.position += this.speed * dt;
    const pz = this.position + PLAYER_Z;
    this.skyOff += seg.curve * pct * dt * 0.9;
    const ps = this.segAt(pz), pp = (pz % SEG) / SEG;
    this.playerY = lerp(ps.y1, ps.y2, pp);
    this.inTunnel = ps.tunnel;
    if (ps.under) this.underT = 0.12;
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
        const sd = car.x < this.playerX ? -1 : 1;
        const x = this.cockpit ? clamp(W / 2 + sd * 130, 60, W - 60) : W / 2 + (car.x - this.playerX) * 150, y = this.fy(H - 150);
        // a whoosh as it goes by, on its side, louder the closer you were
        s.sound.noise({ dur: car.truck ? 0.45 : 0.3, vol: clamp(0.11 - gapX * 0.06, 0.025, 0.1), freq: car.truck ? 500 : 900, to: car.truck ? 160 : 260, type: 'bandpass', pan: sd * 0.8 });
        if (gapX < touch + 0.2 * CW) {
          this.near++; this.nearChain++;
          s.award(40 * L, x, y, { chain: true, color: '#fde047', size: 20 });
          s.fx.text(x, y - 26, this.nearChain >= 3 ? `NEAR MISS ×${this.nearChain}` : 'NEAR MISS!', { color: '#fde047', size: 18 });
          s.sound.tone({ freq: 500 + Math.min(12, this.nearChain) * 60, to: 1100, dur: 0.12, type: 'triangle', vol: 0.06 });
          s.sound.noise({ dur: 0.18, vol: 0.07, freq: 6000, to: 2500, type: 'highpass', pan: sd * 0.7 });      // spark sizzle
          s.fx.burst(...this.side(sd), { colors: ['#fde047', '#fff', '#fb923c'], count: 10, speed: 240, life: 0.35 });
          this.addBoost(0.05);
          if (this.nearChain >= 10) s.unlock('nearmiss');
        } else {
          s.award(10 * L, x, y, { chain: true, color: '#a5f3fc', size: 14 });
        }
        this.passedCount++;
        // a clean overtaking streak (no crash, no cones) tops up the nitro every 5 cars
        if (++this.cleanRun % 5 === 0) this.addBoost(0.1, `CLEAN ×${this.cleanRun} ⚡`, '#7dd3fc');
      }
    }
    this.cars = sorted.filter((car) => car.z < this.trackLen && !(car.police && car.z > pz + 70 * SEG));
    // the police car can leave the road here too: let go of it at once, or it stays "on duty"
    // frozen where it left (no new police car for the rest of the life, and a "MOVE!" warning and
    // siren with no car there; found by the benchmark, 30 Oct 2026)
    if (this.police && !this.cars.includes(this.police)) this.policeGone();

    // slipstream: tuck in behind a car at speed and the draft fills your nitro
    this.drafting = !!drafting && pct > 0.55 && this.draftCool <= 0;
    if (this.drafting) this.draft += dt / (drafting.truck ? 0.75 : 1.05);
    else this.draft = Math.max(0, this.draft - dt * 1.4);
    if (this.draft >= 1) {
      this.draft = 0; this.draftCool = 1.2; this.drafts++;
      this.boost = Math.min(1, this.boost + 0.4);
      s.award(30 * L, W / 2, this.fy(H - 200), { chain: true, color: '#e0f2fe', size: 16 });
      s.fx.text(W / 2, this.fy(H - 228), 'SLIPSTREAM! ⚡', { color: '#7dd3fc', size: 20 });
      s.sound.tone({ freq: 300, to: 1200, dur: 0.25, type: 'sawtooth', vol: 0.05 });
      if (this.drafts >= 5) s.unlock('draft');
    }

    // roadworks
    for (const cl of this.closures) {
      if (pz < cl.z0 || pz > cl.z1 || this.coneCool > 0) continue;
      if (Math.abs(this.playerX - LANES[cl.lane]) < 0.44) {
        this.coneCool = 0.6; this.speed *= 0.55; this.nearChain = 0; this.cleanRun = 0; this.cam.jolt = 1;
        s.fx.burst(W / 2, this.fy(PLAYER_Y - 30), { colors: ['#f97316', '#fff', '#fb923c'], count: 18, speed: 260, life: 0.6, gravity: 500 });
        s.fx.text(W / 2, this.fy(PLAYER_Y - 90), '🚧 CONES!', { color: '#fb923c', size: 18 });
        s.fx.shake(5, 0.2); s.sound.play('hit');
      }
    }

    // pickups
    for (const p of this.pickups) {
      if (p.got || Math.abs(p.z - pz) > 120 || Math.abs(p.x - this.playerX) > 0.26 * CW) continue;
      p.got = true;
      if (p.kind === 'nitro') {
        this.boost = 1;
        s.award(25 * L, W / 2, this.fy(H - 170), { color: '#38bdf8', size: 16 });
        s.fx.text(W / 2, this.fy(H - 200), '⚡ NITRO', { color: '#38bdf8', size: 20 });
        s.sound.play('powerup');
      } else if (p.kind === 'time') {
        this.timeLeft += 3;
        s.fx.text(W / 2, this.fy(H - 200), '⏱ +3s', { color: '#86efac', size: 22 });
        s.award(25 * L, W / 2, this.fy(H - 170), { color: '#86efac', size: 16 });
        s.sound.play('gem', 3);
      } else if (p.kind === 'shield') {
        this.shield = true;
        s.fx.text(W / 2, this.fy(H - 200), '🛡 SHIELD', { color: '#67e8f9', size: 22 });
        s.sound.play('powerup');
      } else {
        const star = p.kind === 'star';
        this.coinsGot += star ? 10 : 1;
        s.award((this.bonus ? 15 : 5) * L * (star ? 10 : 1), W / 2 + (p.x - this.playerX) * 150, this.fy(H - 160), { chain: this.bonus, color: '#fde047', size: star ? 22 : 14 });
        s.sound.play(star ? 'golden' : 'coin', Math.min(10, this.coinsGot % 12));
        if (this.bonus && this.coinsGot >= 60) s.unlock('coins');
      }
    }

    // checkpoint
    if (!this.bonus && pz >= this.finishZ) this.finish();
  }

  /** 🚨 A police car comes up from behind in your lane. It locks its lane when it gets close. */
  /** The police car has gone: clear it and time the next one. */
  policeGone() { this.police = null; this.policeNext = this.s.rng.range(9, 16) * Math.max(0.6, 1 - (this.level - 9) * 0.04); }
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
      s.sound.tone({ freq: this.sirenHi ? 960 : 720, dur: 0.34, type: 'square', vol: (dz < 0 ? 0.05 : 0.025) * clamp(1 - Math.abs(dz) / (40 * SEG), 0.15, 1), pan: clamp((p.x - this.playerX) * 0.8, -0.8, 0.8) });
    }
    if (dz > 70 * SEG) this.policeGone();
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
    rv.yawV = dt > 0 ? clamp((rv.x - ox) / dt * 0.35, -0.3, 0.3) : 0;
    // trading paint: bumping VIPER shoves you both apart
    const dzp = rv.z - pz, gx = this.playerX - rv.x;
    if (dzp > -HIT_BACK && dzp < HIT_FRONT && Math.abs(gx) < 0.33 * CW && !this.done) {
      const dir = Math.sign(gx) || 1;
      this.playerX += dir * 0.1; rv.x -= dir * 0.05; this.speed *= 0.92; rv.speed *= 0.95;
      if (!rv.bumpT || this.t - rv.bumpT > 0.4) { rv.bumpT = this.t; s.fx.burst(W / 2 - dir * 40, this.fy(PLAYER_Y - 30), { colors: ['#fde047', '#fff', '#f97316'], count: 14, speed: 220, life: 0.4 }); s.sound.play('metal'); s.fx.shake(4, 0.15); }
    }
    if (!rv.done && rv.z >= this.finishZ) {
      rv.done = true;
      if (!this.done) { s.fx.text(W / 2, HORIZON + 30, 'VIPER WINS THE DUEL', { color: '#c084fc', size: 24, life: 1.6 }); s.sound.play('lose'); }
    }
  }

  crash(car) {
    const s = this.s;
    if (this.shield) {
      this.shield = false; this.invuln = 1.2; this.speed *= 0.7; this.nearChain = 0; this.cleanRun = 0; this.cam.jolt = 1.2;
      s.fx.burst(W / 2, this.fy(PLAYER_Y - 50), { colors: ['#67e8f9', '#e0f2fe', '#fff', car.color], count: 40, speed: 300, life: 0.7 });
      s.fx.text(W / 2, this.fy(PLAYER_Y - 120), '🛡 SHIELD SAVED YOU!', { color: '#67e8f9', size: 20 });
      s.fx.shake(6, 0.25); s.sound.play('metal');
      this.cars = this.cars.filter((c) => c !== car);
      if (car === this.police) { this.police = null; this.policeNext = 8; }
      return false;
    }
    this.crashes++; this.nearChain = 0; this.cleanRun = 0; this.warnT = 7; this.cam.jolt = 2;
    this.speed = 0; this.crashFx = 1;
    this.crunch();
    s.fx.burst(W / 2, this.fy(H - 110), { colors: ['#f97316', '#fde047', '#fff', car.color], count: 50, speed: 320, life: 0.8 });
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
    ctx.drawImage(sk.sky, -60, 0, W + 120, HORIZON);
    if (this.themeId === 'night') for (const st of this.stars) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + st.x); ctx.fillStyle = '#fff'; ctx.fillRect(st.x, st.y, st.r, st.r); }
    ctx.globalAlpha = 1;
    if (th.sun) {
      const sx = (((W / 2 - this.skyOff * 60) % W) + W) % W, night = this.themeId === 'night', sy = HORIZON - (night ? 150 : this.themeId === 'coast' ? 230 : 70), R = night ? 24 : th.day ? (this.themeId === 'coast' ? 22 : 46) : 62;
      // sun/moon glare gradients cached per theme (the sun slides with skyOff, so they
      // are built at the origin and drawn translated)
      this._sunGrads ??= new Map();
      const sunGrad = (key, make) => { let gd = this._sunGrads.get(key); if (!gd) { gd = make(); if (this._sunGrads.size > 10) this._sunGrads.clear(); this._sunGrads.set(key, gd); } return gd; };
      if (th.day) {
        // a real daytime sun: no synthwave stripes, just a hot disc and a wide soft glare
        const glare = sunGrad(`day|${th.sun}|${R}`, () => { const gd = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 5); gd.addColorStop(0, th.sun + 'aa'); gd.addColorStop(1, th.sun + '00'); return gd; });
        ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = glare; ctx.fillRect(-R * 5, -R * 5, R * 10, R * 10); ctx.restore();
        ctx.fillStyle = th.sun; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
      } else if (night) {
        const halo = sunGrad(`night|${R}`, () => { const gd = ctx.createRadialGradient(0, 0, R, 0, 0, R * 3); gd.addColorStop(0, 'rgba(226,232,240,.18)'); gd.addColorStop(1, 'rgba(226,232,240,0)'); return gd; });
        ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = halo; ctx.fillRect(-R * 3, -R * 3, R * 6, R * 6); ctx.restore();
        ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,.55)'; for (const [cx, cy, cr] of [[-7, -5, 5], [6, 4, 4], [-2, 9, 3], [9, -8, 2.5]]) { ctx.beginPath(); ctx.arc(sx + cx, sy + cy, cr, 0, Math.PI * 2); ctx.fill(); }
      } else {
        const glow = sunGrad(`syn|${th.sun}|${R}`, () => { const gd = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.2); gd.addColorStop(0, th.sun + '55'); gd.addColorStop(1, th.sun + '00'); return gd; });
        ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = glow; ctx.fillRect(-R * 2.2, -R * 2.2, R * 4.4, R * 4.4); ctx.restore();
        const sg = ctx.createLinearGradient(0, sy - R, 0, sy + R);
        sg.addColorStop(0, th.sun); sg.addColorStop(1, '#f472b6');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = th.sky[2]; for (let k = 0; k < 6; k++) ctx.fillRect(sx - R, sy + 6 + k * 10, R * 2, 2 + k * 0.7);
      }
    }
    // mountains and skyline scroll with the bends at different speeds
    const tile = (img, f, y) => { const w = img.width, o = (((this.skyOff * f) % w) + w) % w; ctx.drawImage(img, -w - o, y); ctx.drawImage(img, -o, y); ctx.drawImage(img, w - o, y); };
    tile(sk.mount, 40, HORIZON - sk.mount.height + 2);
    if (sk.city) tile(sk.city, 140, HORIZON - sk.city.height + 2);
    if (th.sea) {                                                    // the sea on the horizon, glittering
      const sg = ctx.createLinearGradient(0, HORIZON - 16, 0, HORIZON + 2);
      sg.addColorStop(0, th.sea[0]); sg.addColorStop(1, th.sea[1]);
      ctx.fillStyle = sg; ctx.fillRect(-60, HORIZON - 16, W + 120, 18);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 40; i++) { const x = ((i * 53.7 - this.skyOff * 100) % W + W) % W, y = HORIZON - 14 + (i * 7 % 13); if (Math.sin(t * 3 + i * 1.7) > 0.6) ctx.fillRect(x, y, 3 + (i % 3), 1); }
    }
    // a red light on the tallest towers at night
    if ((this.themeId === 'night' || this.themeId === 'rain') && Math.sin(t * 3) > 0) {
      ctx.fillStyle = '#ef4444'; for (let i = 0; i < 6; i++) { const x = ((i * 97 - this.skyOff * 140) % W + W) % W; ctx.fillRect(x, HORIZON - 100 - (i % 3) * 8, 2, 2); }
    }
  }

  render(ctx) {
    const s = this.s, th = this.theme, t = this.t, cockpit = this.cockpit, c = this.cam;
    let shx = 0, shy = 0;
    if (this.shakeT > 0) { shx = (Math.random() - 0.5) * 3; shy = (Math.random() - 0.5) * 3; this.shakeT -= 1 / 60; }
    ctx.save(); ctx.translate(shx, shy);
    if (cockpit) {
      // the world rolls, bobs and pitches round you; the cabin (drawn after) stays put
      ctx.fillStyle = th.sky[1]; ctx.fillRect(0, 0, W, CP_HZ);
      ctx.fillStyle = mix(this.col.grass[0], this.col.fog, 0.6); ctx.fillRect(0, CP_HZ, W, H - CP_HZ);
      ctx.translate(W / 2 + c.bobX - c.lean * 12, CP_HZ + c.bobY); ctx.rotate(c.roll - c.lean * 0.035); ctx.scale(c.zoom * CP_SCALE, c.zoom * CP_SCALE); ctx.translate(-W / 2, -HORIZON + c.py);
    }
    this.drawSky(ctx);
    ctx.fillStyle = mix(this.col.grass[0], this.col.fog, 0.6); ctx.fillRect(-60, HORIZON, W + 120, H - HORIZON + 120);

    // road: project near → far (to know what's hidden behind hills), then paint far → near
    // the camera: up behind the car (chase), or in the driver's seat at the car itself (cockpit)
    const camZ = cockpit ? this.position + PLAYER_Z - CP_BACK : this.position;
    this.camZ = camZ;
    const base = this.segAt(camZ), basePct = (camZ % SEG) / SEG;
    const camX = this.playerX * ROAD, camY = (cockpit ? CP_H : CAM_H) + this.playerY;
    this.camY = camY;
    let x = 0, dx = -base.curve * basePct, maxy = H + (cockpit ? 200 : 0);
    const visible = [];
    for (let n = 0; n < this.drawDist; n++) {
      const seg = this.segs[base.i + n];
      if (!seg) break;
      const z1 = seg.i * SEG, z2 = z1 + SEG;
      this.project(seg.p1, x, seg.y1, z1, camX, camY, camZ);
      this.project(seg.p2, x + dx, seg.y2, z2, camX, camY, camZ);
      seg.dx = dx;
      x += dx; dx += seg.curve;
      seg.fog = 1 - Math.exp(-Math.pow(n / this.drawDist, 2) * this.fogDensity);
      seg.clip = maxy;
      if (z1 - camZ <= CAM_DEPTH || seg.p2.y >= seg.p1.y || seg.p2.y >= maxy) { visible.push(seg); seg.hidden = true; continue; }
      seg.hidden = false;
      visible.push(seg);
      maxy = seg.p2.y;
    }
    // cockpit: how far is the road 5-14 segments ahead from where a flat road would be? (up = positive)
    if (cockpit) {
      let e = 0, n = 0;
      for (const k of [5, 8, 11, 14]) {
        const sg = this.segs[base.i + k]; if (!sg) continue;
        const d = sg.i * SEG - camZ; if (d <= CAM_DEPTH) continue;
        e += HORIZON + CAM_DEPTH / d * CP_H * VS - sg.p1.y; n++;
      }
      this.roadRaw = n ? e / n : 0; this.roadTilt = n ? clamp(e / n * 0.9, -320, 300) : 0;
    }
    // the stretch of road right under the car (can dip below the nearest drawn segment on hills)
    const first = visible.find((sg) => !sg.hidden);
    if (first && first.p1.y < H + 200) {
      const p = first.p1, alt = Math.floor(first.i / 3) % 2, dk = first.tunnel ? 0.45 : first.under ? 0.4 : 0;
      ctx.fillStyle = mix(this.col.grass[alt], [0, 0, 0], dk); ctx.fillRect(-60, p.y, W + 120, H + 200 - p.y);
      ctx.fillStyle = mix(this.col.rumble[alt], [0, 0, 0], dk); ctx.fillRect(p.x - p.w * 1.3, p.y, p.w * 2.6, H + 200 - p.y);
      ctx.fillStyle = mix(this.col.road[alt], [0, 0, 0], dk); ctx.fillRect(p.x - p.w * 1.15, p.y, p.w * 2.3, H + 200 - p.y);
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
    this.drawSpeedLines(ctx, cockpit ? HORIZON + 10 : HORIZON + 60);

    // headlights at night, in the rain and in tunnels
    const dark = this.inTunnel || this.themeId === 'night' || this.themeId === 'rain' || (this.underT > 0 && !th.day);
    if (dark && !this.lo) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (cockpit) {
        // two beams thrown down the road from just under the bonnet
        for (const sd of [-1, 1]) {
          const gx = ctx.createLinearGradient(0, 560, 0, HORIZON + 6);
          gx.addColorStop(0, 'rgba(254,249,195,0.16)'); gx.addColorStop(1, 'rgba(254,249,195,0)');
          ctx.fillStyle = gx; ctx.beginPath();
          ctx.moveTo(W / 2 + sd * 40, 560); ctx.lineTo(W / 2 + sd * 230, 560); ctx.lineTo(W / 2 + sd * 34, HORIZON + 6); ctx.lineTo(W / 2 + sd * 6, HORIZON + 6); ctx.closePath(); ctx.fill();
        }
      } else {
        ctx.translate(W / 2, PLAYER_Y - 150); ctx.scale(1, 0.42);
        glow(ctx, 0, 0, 210, '#fef9c3', 0.13);
      }
      ctx.restore();
    }

    // the player's car (in the cockpit you're sitting in it)
    if (!cockpit && !(this.invuln > 0 && !this.shieldFlash && Math.floor(t * 10) % 2)) this.drawPlayer(ctx);
    for (const f of this.late) f();
    ctx.restore();
    if (cockpit) this.drawCockpit(ctx);
    if (this.flash > 0) { ctx.fillStyle = `rgba(226,232,240,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    // speed vignette
    const sp = clamp(this.speed / this.maxSpeed - 0.75, 0, 0.55);
    if (sp > 0 && !this.lo && !cockpit) {
      ctx.globalAlpha = sp * 0.8; ctx.drawImage(vignette(), 0, 0); ctx.globalAlpha = 1;
    }
    this.drawHud(ctx);
  }

  /** streaks flying out of the vanishing point on nitro (and faintly in a slipstream or flat out) */
  drawSpeedLines(ctx, cy) {
    const pct = this.speed / this.maxSpeed;
    const inten = this.boosting ? 1 : this.drafting ? 0.45 : clamp((pct - 0.97) * 6, 0, 0.25);
    if (inten <= 0.02 || this.s.state !== 'playing') return;
    const n = Math.round((this.lo ? 12 : 26) * inten), cx = W / 2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r0 = 70 + Math.random() * 120, len = 60 + Math.random() * 200 * inten;
      const ca = Math.cos(a), sa = Math.sin(a) * 0.9;
      ctx.strokeStyle = this.boosting ? (Math.random() < 0.35 ? 'rgba(56,189,248,.5)' : 'rgba(224,242,254,.4)') : 'rgba(226,232,240,.25)';
      ctx.lineWidth = 1 + Math.random() * 1.8 * inten;
      ctx.beginPath(); ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len)); ctx.stroke();
    }
    ctx.restore();
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

  // ── The cockpit ────────────────────────────────────────────
  /** the cabin around you: roof, red A-pillars, bonnet, carbon dash (cached), then the live instruments on top */
  drawCockpit(ctx) {
    const s = this.s, c = this.cam, t = this.t, lo = this.lo, gold = s.gold;
    const paint = gold ? '#f59e0b' : '#dc2626';
    const cab = cockpitArt(paint, gold);
    ctx.save();
    ctx.translate(c.bobX * 0.3, c.bobY * 0.35);              // the cabin shakes a little less than your head
    // rain on the glass, and the wiper
    if (this.drops.length || this.wiperT > 0) {
      ctx.save(); ctx.beginPath(); glassPath(ctx); ctx.clip();
      for (const d of this.drops) {
        ctx.fillStyle = 'rgba(203,213,225,.28)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 1.25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(d.x - d.r * 0.4, d.y - d.r * 0.6, Math.max(1, d.r * 0.5), Math.max(1, d.r * 0.4));
      }
      const a = this.wiperAngle();
      if (a != null) {
        const cx = W * 0.32, cy = 434, L = 300;
        ctx.strokeStyle = '#0b0b0f'; ctx.lineCap = 'round'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#27272a';
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke();
        ctx.lineCap = 'butt';
      }
      ctx.restore();
    }
    // a crash cracks the glass for a moment
    if (this.crashFx > 0.05) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.crashFx * 1.5); ctx.strokeStyle = 'rgba(241,245,249,.85)'; ctx.lineWidth = 1.2;
      const ox = W * 0.62, oy = 290, rr = mulberry(this.crashes * 31 + 7);
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        let x = ox, y = oy, a = i / 9 * Math.PI * 2 + rr() * 0.4;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { const l = 20 + rr() * 40; a += rr() * 0.6 - 0.3; x += Math.cos(a) * l; y += Math.sin(a) * l; ctx.lineTo(x, y); }
      }
      ctx.stroke(); ctx.restore();
    }
    // the cabin itself (pre-drawn), dimmed in tunnels, under bridges and at night
    ctx.drawImage(cab.img, -CAB_PAD, -CAB_PAD);
    const night = this.themeId === 'night' || this.themeId === 'rain' || this.themeId === 'fog';
    const dim = this.inTunnel ? 0.55 : this.underT > 0 ? 0.42 : night ? 0.3 : this.themeId === 'dusk' ? 0.18 : 0;
    this.cabDim = (this.cabDim ?? dim) + (dim - (this.cabDim ?? dim)) * 0.12;
    if (this.cabDim > 0.01) { ctx.globalAlpha = this.cabDim; ctx.drawImage(cab.mask, -CAB_PAD, -CAB_PAD); ctx.globalAlpha = 1; }
    // tunnel lamps sweeping over the bonnet
    if (this.inTunnel && !lo) {
      const u = ((this.position / SEG) % 3) / 3;
      ctx.save(); ctx.beginPath(); glassPath(ctx); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, W / 2, 434 - u * 60, 140, '#fdba74', 0.18 * (1 - u));
      ctx.restore();
    }
    // the glass edge: a cyan glow with a shield, a flicker while you're invulnerable
    if (this.shield || this.invuln > 0) {
      const on = this.shield ? 0.5 + 0.3 * Math.sin(t * 6) : Math.floor(t * 10) % 2 ? 0.7 : 0;
      if (on) { ctx.save(); ctx.beginPath(); glassPath(ctx); ctx.strokeStyle = this.shield ? `rgba(103,232,249,${on})` : `rgba(248,250,252,${on})`; ctx.lineWidth = 4; if (!lo) { ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 16; } ctx.stroke(); ctx.restore(); }
    }
    this.drawMirror(ctx);
    this.drawDials(ctx);
    this.drawWheel(ctx, paint);
    ctx.restore();
  }

  /** rear-view mirror: the road behind, with the lights of anyone coming up on you (police, VIPER) and your own nitro flame */
  drawMirror(ctx) {
    const th = this.theme, mw = 164, mh = 36, mx = W / 2 - mw / 2, my = 70, hzY = my + 13, pz = this.position + PLAYER_Z, t = this.t;
    ctx.fillStyle = '#111114'; ctx.fillRect(W / 2 - 4, 30, 8, 42);
    ctx.save();
    roundRect(ctx, mx, my, mw, mh, 8); ctx.fillStyle = '#05060a'; ctx.fill(); ctx.clip();
    const g = ctx.createLinearGradient(0, my, 0, hzY); g.addColorStop(0, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(mx, my, mw, hzY - my);
    ctx.fillStyle = mix(this.col.grass[0], this.col.fog, 0.3); ctx.fillRect(mx, hzY, mw, my + mh - hzY);
    const road = this.inTunnel ? mix(this.col.road[0], [0, 0, 0], 0.5) : css(this.col.road[0]);
    ctx.fillStyle = road; ctx.beginPath(); ctx.moveTo(W / 2 - 5, hzY); ctx.lineTo(W / 2 + 5, hzY); ctx.lineTo(W / 2 + 70, my + mh); ctx.lineTo(W / 2 - 70, my + mh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(248,250,252,.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.moveTo(W / 2 - 2, hzY); ctx.lineTo(W / 2 - 24, my + mh); ctx.moveTo(W / 2 + 2, hzY); ctx.lineTo(W / 2 + 24, my + mh); ctx.stroke(); ctx.setLineDash([]);
    const dark = this.inTunnel || this.themeId === 'night' || this.themeId === 'rain' || this.themeId === 'fog' || this.themeId === 'dusk';
    const list = this.cars.filter((o) => o.z < pz - 40 && o.z > pz - 45 * SEG);
    if (this.rival && this.rival.z < pz - 40 && this.rival.z > pz - 45 * SEG) list.push(this.rival);
    list.sort((a, b) => a.z - b.z);
    for (const o of list) {
      const gap = pz - o.z, sc = clamp(700 / gap, 0.08, 1.5);
      const x = W / 2 + clamp((o.x - this.playerX) * 90 * sc, -mw / 2 + 6, mw / 2 - 6), y = hzY + clamp(sc * 14, 1, mh - 10);
      const bw = Math.max(2, 26 * sc * (o.truck ? 1.3 : 1)), bh = bw * (o.truck ? 0.8 : 0.5);
      ctx.fillStyle = o.rival ? '#18181b' : o.police ? '#0f172a' : o.truck ? '#d4d4d8' : o.color;
      ctx.fillRect(x - bw / 2, y - bh, bw, bh);
      ctx.fillStyle = 'rgba(15,23,42,.8)'; ctx.fillRect(x - bw * 0.32, y - bh * 0.95, bw * 0.64, bh * 0.35);
      const hl = o.police ? (Math.floor(t * 6) % 2 ? '#60a5fa' : '#f87171') : o.rival ? '#c084fc' : '#fef9c3';
      if (dark || o.police || o.rival) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y - bh * 0.3, bw * 0.9, hl, 0.8); ctx.restore(); }
      ctx.fillStyle = '#fff'; const r = Math.max(0.8, bw * 0.08);
      ctx.fillRect(x - bw * 0.4, y - bh * 0.35, r * 2, r); ctx.fillRect(x + bw * 0.4 - r * 2, y - bh * 0.35, r * 2, r);
      if (o.police) { ctx.fillStyle = Math.floor(t * 6) % 2 ? '#3b82f6' : '#ef4444'; ctx.fillRect(x - bw * 0.2, y - bh - Math.max(1, bw * 0.12), bw * 0.4, Math.max(1, bw * 0.12)); }
    }
    // your own nitro flame, glowing at the bottom of the mirror
    if (this.boosting) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, W / 2 - 30, my + mh, 26, '#38bdf8', 0.7 + Math.random() * 0.3); glow(ctx, W / 2 + 30, my + mh, 26, '#38bdf8', 0.7 + Math.random() * 0.3); ctx.restore(); }
    // glass sheen
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 50, my); ctx.lineTo(mx + 20, my + mh); ctx.lineTo(mx, my + mh); ctx.fill();
    ctx.restore();
    roundRect(ctx, mx, my, mw, mh, 8); ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 3; ctx.stroke();
  }

  /** the instrument cluster: analogue speedo + rev counter, gear, nitro gauge and the warning lamps */
  drawDials(ctx) {
    const s = this.s, t = this.t, lo = this.lo, accent = s.gold ? '#fbbf24' : '#ef4444';
    const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
    const mph = this.speed / BASE_MAX * 149;
    // needles shiver over bumps, kerbs and knocks
    const jitter = (this.cam.rumble * 0.012 + this.cam.jolt * 0.03) * Math.sin(t * 61);
    this.mphN = (this.mphN ?? mph) + (mph - (this.mphN ?? mph)) * 0.25;
    const backlit = (this.cabDim || 0) > 0.15;
    const dial = (cx, cy, r, f, n, label, red, sub) => {
      // face, rings, ticks and numbers are static per theme — rendered once into a sprite
      this._dialFaces ??= new Map();
      const dkey = `${r}|${n}|${label}|${red}|${backlit}|${accent}`;
      let dcv = this._dialFaces.get(dkey);
      if (!dcv) {
        if (this._dialFaces.size > 8) this._dialFaces.clear();
        const pad = r + 3;
        dcv = document.createElement('canvas'); dcv.width = dcv.height = pad * 4;   // 2× for crispness
        const g2 = dcv.getContext('2d'); g2.scale(2, 2); g2.translate(pad, pad);
        const fg = g2.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
        fg.addColorStop(0, '#1f1f26'); fg.addColorStop(1, '#09090c');
        g2.fillStyle = fg; g2.beginPath(); g2.arc(0, 0, r, 0, Math.PI * 2); g2.fill();
        g2.strokeStyle = '#3f3f46'; g2.lineWidth = 3; g2.stroke();
        g2.strokeStyle = '#a1a1aa'; g2.lineWidth = 1; g2.beginPath(); g2.arc(0, 0, r - 2.5, 0, Math.PI * 2); g2.stroke();
        for (let i = 0; i <= n; i++) {
          const u = i / n, a = A0 + u * SW, big = i % 2 === 0, r0 = r - (big ? 11 : 7);
          g2.strokeStyle = red != null && u >= red ? accent : backlit ? '#fef3c7' : '#e4e4e7'; g2.lineWidth = big ? 2 : 1;
          g2.beginPath(); g2.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g2.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); g2.stroke();
          if (big && sub) { g2.fillStyle = red != null && u >= red ? accent : '#d4d4d8'; g2.font = '700 8px system-ui'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(sub(i), Math.cos(a) * (r - 19), Math.sin(a) * (r - 19)); }
        }
        g2.fillStyle = '#a1a1aa'; g2.font = '800 7px system-ui'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(label, 0, r * 0.62);
        this._dialFaces.set(dkey, dcv);
      }
      const pad = r + 3;
      ctx.drawImage(dcv, cx - pad, cy - pad, pad * 2, pad * 2);
      // needle
      const a = A0 + clamp(f + jitter, 0, 1.02) * SW;
      if (!lo) { ctx.shadowColor = accent; ctx.shadowBlur = backlit ? 10 : 5; }
      ctx.strokeStyle = accent; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8); ctx.lineTo(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7)); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineCap = 'butt';
      ctx.fillStyle = '#27272a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#71717a'; ctx.lineWidth = 1; ctx.stroke();
    };
    const SX = W / 2 - 74, TX = W / 2 + 74, DY = 486, R = 50;
    // binnacle glow behind the dials (the car's red ambient light)
    if (!lo) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(W / 2, DY); ctx.scale(2.4, 0.9); glow(ctx, 0, 0, 70, accent, backlit ? 0.22 : 0.12); ctx.restore(); }
    dial(SX, DY, R, this.mphN / 240, 12, 'MPH', null, (i) => String(i * 20));
    dial(TX, DY, R, this.rpm * 0.9, 16, 'RPM ×1000', 0.8, (i) => String(i / 2));
    // digital speed in the speedo
    ctx.font = '900 14px system-ui'; ctx.fillStyle = this.boosting ? '#38bdf8' : '#f4f4f5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(this.mphN)), SX, DY + 18);
    // gear readout in the rev counter
    const redline = this.rpm > 0.88 && this.speed > 100;
    ctx.font = '900 18px system-ui'; ctx.fillStyle = redline && Math.floor(t * 12) % 2 ? accent : '#f4f4f5';
    ctx.fillText(this.speed < 30 && this.s.state !== 'playing' ? 'N' : String(this.gear), TX, DY + 18);
    // shift light
    if (redline) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, TX, DY - 24, 10, accent, 0.9); ctx.restore(); }
    // the nitro gauge between the dials: ten segments, pulsing when full
    if (!this.bonus) {
      const gx = W / 2 - 7, gy = 440, gh = 80, segs = 10, sh = gh / segs, full = this.boost >= 0.999;
      ctx.fillStyle = '#09090c'; roundRect(ctx, gx - 3, gy - 3, 20, gh + 6, 4); ctx.fill();
      for (let i = 0; i < segs; i++) {
        const on = i < Math.round(this.boost * segs), y = gy + gh - (i + 1) * sh;
        const col = this.boosting ? '#e0f2fe' : i >= 7 ? '#38bdf8' : i >= 3 ? '#0ea5e9' : '#0369a1';
        ctx.fillStyle = on ? (full && Math.sin(t * 10) > 0 ? '#ffffff' : col) : 'rgba(56,189,248,.1)';
        if (on && !lo) { ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = full || this.boosting ? 10 : 4; }
        ctx.fillRect(gx, y + 1, 14, sh - 2);
        ctx.shadowBlur = 0;
      }
      ctx.font = '800 9px system-ui'; ctx.fillStyle = this.boost > 0.3 ? '#38bdf8' : '#52525b'; ctx.fillText('N₂O', W / 2, gy + gh + 11);
      // the slipstream charge: a thin bar beside the gauge
      ctx.fillStyle = 'rgba(226,232,240,.12)'; ctx.fillRect(gx + 18, gy, 3, gh);
      ctx.fillStyle = this.drafting ? '#e0f2fe' : '#94a3b8'; ctx.fillRect(gx + 18, gy + gh * (1 - this.draft), 3, gh * this.draft);
    }
    // warning lamps: left of the wheel and right of it
    const pz = this.position + PLAYER_Z, cop = this.police && this.police.z < pz && this.police.z > pz - 34 * SEG;
    const warn = this.warnT > 0 && (this.warnT > 5 || Math.sin(t * 9 + Math.sin(t * 3)) > 0.1);
    const dark = this.inTunnel || this.themeId === 'night' || this.themeId === 'rain' || this.themeId === 'fog' || this.underT > 0;
    const lamps = [
      [34, 570, '🌡', warn, '#f97316'], [66, 570, '🛢', warn && this.warnT < 6, '#ef4444'], [98, 570, '🛡', this.shield, '#67e8f9'], [130, 570, '🚨', cop && Math.floor(t * 6) % 2, '#3b82f6'],
      [W - 130, 570, '⏱', this.timeMax && this.timeLeft < 6 && Math.floor(t * 4) % 2, '#fbbf24'], [W - 98, 570, '💨', this.drafting, '#e0f2fe'], [W - 66, 570, '⚡', this.boosting, '#38bdf8'], [W - 34, 570, '💡', dark, '#a3e635'],
    ];
    ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [x, y, ic, on, col] of lamps) {
      ctx.fillStyle = '#0b0b0e'; roundRect(ctx, x - 13, y - 11, 26, 22, 5); ctx.fill();
      if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 18, col, 0.55); ctx.restore(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; roundRect(ctx, x - 13, y - 11, 26, 22, 5); ctx.stroke(); }
      ctx.globalAlpha = on ? 1 : 0.3; ctx.fillText(ic, x, y + 1); ctx.globalAlpha = 1;
    }
  }

  /** the wheel: flat-bottomed GT rim, three spokes, a red top marker — and your gloved hands on it */
  drawWheel(ctx, paint) {
    const c = this.cam, cx = W / 2, cy = 690 + this.drop(), R = 128, lo = this.lo;
    const ang = clamp(c.wheel, -1.4, 1.4) * 1.5;
    // forearms in a red race suit, reaching up from the bottom corners to the hands
    const hand = (sd) => { const a = -Math.PI / 2 + sd * 1.08 + ang; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R, a]; };
    for (const sd of [-1, 1]) {
      const [hx, hy] = hand(sd), bx = cx + sd * 175, by = H + 30;
      const ag = ctx.createLinearGradient(bx, by, hx, hy); ag.addColorStop(0, '#450a0a'); ag.addColorStop(1, paint);
      ctx.fillStyle = ag; ctx.beginPath();
      ctx.moveTo(bx - 40, by); ctx.lineTo(hx - 17, hy + 8); ctx.lineTo(hx + 17, hy + 8); ctx.lineTo(bx + 40, by); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx + sd * -18, by); ctx.lineTo(hx + sd * -6, hy + 8); ctx.stroke();   // suit stripe
    }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    // spokes: left, right, bottom
    ctx.strokeStyle = '#3f3f46'; ctx.lineCap = 'round'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-R + 8, -6); ctx.moveTo(0, 0); ctx.lineTo(R - 8, -6); ctx.moveTo(0, 0); ctx.lineTo(0, R * 0.6); ctx.stroke();
    ctx.strokeStyle = '#71717a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-34, -6); ctx.lineTo(-R + 14, -10); ctx.moveTo(34, -6); ctx.lineTo(R - 14, -10); ctx.stroke();
    // hub with the TC badge
    const hg = ctx.createRadialGradient(-8, -8, 4, 0, 0, 36); hg.addColorStop(0, '#3f3f46'); hg.addColorStop(1, '#18181b');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#52525b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = paint; ctx.beginPath(); ctx.arc(0, -4, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TC', 0, -3);
    // the rim: leather with a flat bottom
    const rim = () => { ctx.beginPath(); ctx.arc(0, 0, R, Math.PI * 0.62, Math.PI * 2.38); ctx.closePath(); };
    ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = 24; ctx.lineJoin = 'round'; rim(); ctx.stroke();
    ctx.strokeStyle = '#1c1c21'; ctx.lineWidth = 16; rim(); ctx.stroke();
    if (!lo) { ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R - 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    // top-centre marker so you can see how far the wheel is turned
    ctx.strokeStyle = paint; ctx.lineWidth = 16; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2 - 0.08, -Math.PI / 2 + 0.08); ctx.stroke();
    ctx.restore();
    // gloves gripping the rim at quarter to three
    for (const sd of [-1, 1]) {
      const [hx, hy, a] = hand(sd);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(a + Math.PI / 2);
      const gg = ctx.createRadialGradient(-sd * 6, -8, 2, 0, 0, 26); gg.addColorStop(0, '#71717a'); gg.addColorStop(1, '#27272a');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(0, 0, 22, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#18181b'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#18181b'; ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-17, k * 8 - 2); ctx.quadraticCurveTo(0, k * 8 + 2, 17, k * 8 - 2); ctx.stroke(); }    // fingers wrapped round the rim
      ctx.fillStyle = '#18181b'; ctx.beginPath(); ctx.ellipse(sd * 15, -10, 7, 11, sd * 0.5, 0, Math.PI * 2); ctx.fill();               // thumb
      ctx.fillStyle = paint; ctx.fillRect(-14, 18, 28, 7);                                                                         // cuff
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(-14, 18, 28, 2);
      ctx.restore();
    }
  }

  drawSegment(ctx, seg) {
    const p1 = seg.p1, p2 = seg.p2, alt = Math.floor(seg.i / 3) % 2, f = seg.fog, fc = this.col.fog;
    const dk = seg.tunnel ? 0.5 : seg.under ? 0.4 : 0;
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
    if (seg.under) {                                                                     // the underside of an overpass
      const y1 = p1.y - p1.scale * 2150 * VS, y2 = p2.y - p2.scale * 2150 * VS;
      ctx.fillStyle = mix([40, 42, 50], fc, f); ctx.beginPath();
      ctx.moveTo(p1.x - p1.w * 9, y1); ctx.lineTo(p1.x + p1.w * 9, y1); ctx.lineTo(p2.x + p2.w * 9, y2); ctx.lineTo(p2.x - p2.w * 9, y2); ctx.fill();
    }
    if (seg.overpass) {                                                                  // the bridge's face, its rail and its pillars
      const sc = p1.scale, top = p1.y - sc * 2800 * VS, bot = p1.y - sc * 2150 * VS;
      ctx.fillStyle = mix([100, 106, 118], fc, f);
      ctx.fillRect(p1.x - p1.w * 9, top, p1.w * 18, bot - top);
      ctx.fillStyle = mix([70, 75, 86], fc, f);
      ctx.fillRect(p1.x - p1.w * 9, bot - (bot - top) * 0.18, p1.w * 18, (bot - top) * 0.18);
      ctx.fillStyle = mix([148, 163, 184], fc, f);
      ctx.fillRect(p1.x - p1.w * 9, top - sc * 260 * VS, p1.w * 18, Math.max(1, sc * 50 * VS));
      for (let k = -9; k < 9; k += 0.6) ctx.fillRect(p1.x + p1.w * k, top - sc * 260 * VS, Math.max(0.5, p1.w * 0.02), sc * 260 * VS);
      ctx.fillStyle = mix(hex(this.theme.glow), fc, f); ctx.globalAlpha = 0.85;
      ctx.fillRect(p1.x - p1.w * 9, top + (bot - top) * 0.1, p1.w * 18, Math.max(1, sc * 40 * VS)); ctx.globalAlpha = 1;
      ctx.fillStyle = mix([82, 88, 100], fc, f);
      for (const sd of [-1, 1]) ctx.fillRect(p1.x + p1.w * sd * 1.78 - p1.w * 0.07, bot, p1.w * 0.14, p1.y - bot);
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
      if (!th.day) glow(ctx, sx - side * h * 0.18, p1.y - h, r0 * 4, th.glow, 0.7);
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
      if (p.got || p.z < z1 || p.z >= z2 || p.z - this.camZ < 40) continue;
      const k = (p.z - z1) / SEG, sc = lerp(p1.scale, p2.scale, k);
      const px = lerp(p1.x, p2.x, k) + p.x * lerp(p1.w, p2.w, k), py = lerp(p1.y, p2.y, k);
      this.drawPickup(ctx, p, px, py, Math.max(1.5, sc * 90 * W / 2));
    }
    ctx.globalAlpha = 1;
    // traffic (and VIPER) on this segment — bucketed by segment once per frame,
    // instead of copying and scanning the whole car array for every drawn segment
    const pz = this.position + PLAYER_Z;
    if (this._bucketT !== this.t) {
      this._bucketT = this.t;
      const b = this._buckets ??= new Map(); b.clear();
      const push = (car) => { const i = Math.floor(car.z / SEG), a = b.get(i); a ? a.push(car) : b.set(i, [car]); };
      for (const car of this.cars) push(car);
      if (this.rival) push(this.rival);
      if (this.ghost) push(this.ghost);
    }
    const bucket = this._buckets.get(seg.i);
    if (!bucket) { ctx.restore(); return; }
    const drawn = bucket.slice().sort((a, b) => b.z - a.z);
    for (const car of drawn) {
      const k = (car.z - z1) / SEG, sc = lerp(p1.scale, p2.scale, k);
      const cx = lerp(p1.x, p2.x, k) + car.x * lerp(p1.w, p2.w, k), cy = lerp(p1.y, p2.y, k);
      const dzCam = car.z - this.camZ, wy = lerp(seg.y1, seg.y2, k);
      const job = () => this.drawTraffic(ctx, car, cx, cy, sc, dzCam, wy, seg, f);
      if (this.cockpit) { if (dzCam > (car.ghost ? 700 : 60)) job(); continue; }   // in the cockpit: only what's in front of your eyes (your ghost fades out as you reach it)
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
    const pitch = Math.max(0.02, 0.45 * Math.atan2(this.camY - wy, Math.max(200, dzCam)) - slope * 0.9);
    if (car.ghost) {
      ctx.globalAlpha = 0.3 * Math.max(0, 1 - f);
      drawCar(ctx, SPORTS, { x: cx, y: cy, ppu, pal: palette('#bae6fd', { stripe: '#ffffff', glass: '#0c4a6e', tail: '#7dd3fc', dark: '#38bdf8' }), yaw: Math.atan2(seg.dx || 0, SEG) * 0.7 - Math.atan((cx - W / 2) / (W / 2 * CAM_DEPTH)) * 0.85,
        pitch: Math.max(0.02, 0.45 * Math.atan2(this.camY - wy, Math.max(200, dzCam))), persp: Math.min(0.08, 200 / Math.max(300, dzCam)), amb: 0.8, alpha: ctx.globalAlpha });
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
    // speedometer (in the cockpit it's on the dash)
    const pct = clamp(this.speed / (this.maxSpeed * 1.3), 0, 1), gx = W - 38, gy = 32, R = 24;
    if (!this.cockpit) {
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
    } else if (!this.bonus) {
      // cockpit: a small clean-streak / flat-out readout where the gauges used to be
      ctx.textAlign = 'right'; ctx.font = '800 10px system-ui'; ctx.fillStyle = '#94a3b8';
      ctx.fillText(this.gear ? `GEAR ${this.gear}` : '', W - 14, 22);
      if (this.cleanRun >= 2) { ctx.fillStyle = '#7dd3fc'; ctx.fillText(`CLEAN ×${this.cleanRun}`, W - 14, 38); }
      if (this.flatT > 0.5) { ctx.fillStyle = '#fdba74'; ctx.fillText('FLAT OUT', W - 14, 54); }
    }
    // 🚨 police coming up behind you
    const p = this.police, pz = this.position + PLAYER_Z;
    if (p && p.z < pz && p.z > pz - 34 * SEG) {
      const x = clamp(W / 2 + (p.x - this.playerX) * 230, 30, W - 30), y = this.cockpit ? 396 : H - 46, on = Math.floor(t * 8) % 2;
      ctx.fillStyle = on ? '#ef4444' : '#3b82f6'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 18, y + 8); ctx.lineTo(x - 18, y + 8); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '800 12px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(p.locked ? '🚨 MOVE!' : '🚨 POLICE', x, y + 22);
    }
    // touch hint
    ctx.textAlign = 'center'; ctx.font = '600 12px system-ui'; ctx.fillStyle = this.cockpit ? 'rgba(248,250,252,.85)' : 'rgba(226,232,240,.4)';
    const hy = this.cockpit ? 380 : H - 10;
    if (s.state === 'playing' && this.position < SEG * 60) {
      const mobile = this.s.coarse;
      if (this.wheelMode) ctx.fillText('Drag the wheel to steer · hold NITRO to boost', W / 2, hy);
      else if (mobile && this.tiltEnabled) ctx.fillText('Tilt to steer · tap middle to boost', W / 2, hy);
      else if (mobile && this._needsTiltPermission) ctx.fillText('Tap to enable tilt steering · or hold sides to steer', W / 2, hy);
      else if (mobile) ctx.fillText('Hold left / right side to steer · middle to boost', W / 2, hy);
      else ctx.fillText('← → steer · ↑ boost · ↓ brake · C view', W / 2, hy);
    }
    // Tilt steering indicator (shown when tilt is active and playing)
    if (this.tiltEnabled && s.state === 'playing' && !this.wheelMode) {
      const bw = 80, bh = 10, bx = W / 2 - bw / 2, by = H - 28;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, bx, by, bw, bh, 5); ctx.fill();
      const frac = clamp((this._tiltFrac || 0), -1, 1);
      const fillW = Math.abs(frac) * (bw / 2 - 4);
      const fillX = frac < 0 ? bw / 2 - fillW + bx : bw / 2 + bx;
      const tcol = Math.abs(frac) > 0.7 ? '#f97316' : '#22d3ee';
      ctx.fillStyle = tcol;
      ctx.beginPath(); ctx.roundRect(fillX, by + 2, fillW, bh - 4, 3); ctx.fill();
      ctx.fillStyle = 'rgba(226,232,240,0.7)';
      ctx.fillRect(bx + bw / 2 - 1, by + 1, 2, bh - 2);
    }
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★ GOLDEN RACER', W / 2, this.cockpit ? 120 : 78); }
    // camera switch
    if (s.state === 'playing') {
      const b = this.viewButton(), mob = this.s.coarse;
      ctx.fillStyle = 'rgba(3,5,20,.7)'; roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(248,250,252,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 12px system-ui'; ctx.fillStyle = '#e2e8f0';
      ctx.fillText(mob ? '🎥 VIEW' : '🎥 VIEW  C', b.x + b.w / 2, b.y + b.h / 2 + 1);
      if (this.wheelMode) {
        // NITRO: glows while held, the fill shows what's left in the tank
        const n = this.nitroButton(), on = this.boosting, f = clamp(this.boost, 0, 1);
        ctx.fillStyle = on ? 'rgba(14,116,144,.75)' : 'rgba(3,5,20,.7)'; roundRect(ctx, n.x, n.y, n.w, n.h, 14); ctx.fill();
        ctx.save(); roundRect(ctx, n.x, n.y, n.w, n.h, 14); ctx.clip();
        ctx.fillStyle = 'rgba(34,211,238,.22)'; ctx.fillRect(n.x, n.y + n.h * (1 - f), n.w, n.h * f); ctx.restore();
        ctx.strokeStyle = on ? '#67e8f9' : f > 0.05 ? 'rgba(103,232,249,.7)' : 'rgba(248,250,252,.35)'; ctx.lineWidth = on ? 2.5 : 1.5;
        roundRect(ctx, n.x, n.y, n.w, n.h, 14); ctx.stroke();
        ctx.fillStyle = f > 0.05 ? '#f8fafc' : '#94a3b8'; ctx.font = '900 22px system-ui'; ctx.fillText('🔥', n.x + n.w / 2, n.y + n.h / 2 - 10);
        ctx.font = '800 12px system-ui'; ctx.fillText('NITRO', n.x + n.w / 2, n.y + n.h / 2 + 18);
      }
    }
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

// ── The cabin art (pre-drawn once per paint colour) ───────────
const CAB_PAD = 12;
/** the windscreen: a wide pane, slightly bowed at the roof, with the dash curving under it */
function glassPath(g) {
  g.moveTo(14, 130);
  g.quadraticCurveTo(W / 2, 106, W - 14, 130);
  g.lineTo(W - 3, 416);
  g.quadraticCurveTo(W / 2, 460, 3, 416);
  g.closePath();
}
const CABS = new Map();
function cockpitArt(paint, gold) {
  const key = paint;
  if (CABS.has(key)) return CABS.get(key);
  const P = CAB_PAD, img = canvas(W + P * 2, H + P * 2), g = img.getContext('2d');
  g.translate(P, P);
  const pc = hex(paint), light = css(mixA(pc, [255, 255, 255], 0.28)), dark = css(mixA(pc, [0, 0, 0], 0.45)), deep = css(mixA(pc, [0, 0, 0], 0.7));
  // roof lining
  const rg = g.createLinearGradient(0, -P, 0, 150); rg.addColorStop(0, '#15151a'); rg.addColorStop(1, '#2a2a31');
  g.fillStyle = rg; g.fillRect(-P, -P, W + P * 2, 160 + P);
  // sun visors folded up against the roof
  g.fillStyle = '#202027';
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + sd * 96, 92); g.lineTo(W / 2 + sd * 206, 98); g.lineTo(W / 2 + sd * 202, 112); g.lineTo(W / 2 + sd * 100, 106); g.closePath(); g.fill(); }
  // A-pillars in the car's paint, lit along the edge nearest the glass
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? -P : W + P, gx = sd < 0 ? 14 : W - 14, bx = sd < 0 ? 3 : W - 3;
    const pg = g.createLinearGradient(x0, 0, gx, 0); pg.addColorStop(0, deep); pg.addColorStop(0.6, dark); pg.addColorStop(0.92, paint); pg.addColorStop(1, light);
    g.fillStyle = pg; g.beginPath(); g.moveTo(x0, 40); g.lineTo(gx + sd * -10, 112); g.lineTo(gx, 130); g.lineTo(bx, 416); g.lineTo(bx + sd * 6, 434); g.lineTo(x0, 434); g.closePath(); g.fill();
  }
  // the dashboard: carbon fibre with a leather top lip
  const carbon = canvas(8, 8), cg = carbon.getContext('2d');
  cg.fillStyle = '#121216'; cg.fillRect(0, 0, 8, 8);
  cg.fillStyle = '#1d1d23'; cg.fillRect(0, 0, 4, 4); cg.fillRect(4, 4, 4, 4);
  cg.fillStyle = 'rgba(255,255,255,.05)'; cg.fillRect(0, 0, 4, 1); cg.fillRect(4, 4, 4, 1);
  const dashTop = () => { g.moveTo(-P, 410); g.lineTo(6, 416); g.quadraticCurveTo(W / 2, 460, W - 6, 416); g.lineTo(W + P, 410); };
  g.beginPath(); dashTop(); g.lineTo(W + P, H + P); g.lineTo(-P, H + P); g.closePath();
  g.fillStyle = g.createPattern(carbon, 'repeat'); g.fill();
  const shade = g.createLinearGradient(0, 414, 0, H); shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = shade; g.fill();
  g.beginPath(); dashTop(); g.strokeStyle = '#0a0a0c'; g.lineWidth = 10; g.stroke();
  // round air vents at the ends of the dash
  for (const vx of [36, W - 36]) {
    g.fillStyle = '#0a0a0c'; g.beginPath(); g.arc(vx, 494, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#52525b'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = '#27272a'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(vx - 17, 494 + k * 7); g.lineTo(vx + 17, 494 + k * 7); g.stroke(); }
  }
  // the car's red ambient strip along the dash
  g.fillStyle = paint; g.globalAlpha = 0.85; g.fillRect(0, 546, 150, 2); g.fillRect(W - 150, 546, 150, 2); g.globalAlpha = 1;
  // cut out the glass…
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); glassPath(g); g.fill(); g.globalCompositeOperation = 'source-over';
  g.beginPath(); glassPath(g); g.strokeStyle = '#08080a'; g.lineWidth = 5; g.stroke();
  // …and the bonnet seen through it, in your paint with white racing stripes
  g.save(); g.beginPath(); glassPath(g); g.clip();
  const bonnet = () => { g.moveTo(-20, 440); g.quadraticCurveTo(W / 2, 378, W + 20, 440); g.lineTo(W + 20, 484); g.lineTo(-20, 484); g.closePath(); };
  const bg = g.createLinearGradient(0, 404, 0, 464); bg.addColorStop(0, light); bg.addColorStop(0.25, paint); bg.addColorStop(1, dark);
  g.beginPath(); bonnet(); g.fillStyle = bg; g.fill();
  g.fillStyle = gold ? '#fff7ed' : '#f8fafc';
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + sd * 7, 408); g.lineTo(W / 2 + sd * 22, 408); g.lineTo(W / 2 + sd * 46, 484); g.lineTo(W / 2 + sd * 15, 484); g.closePath(); g.fill(); }
  const sh = g.createRadialGradient(W * 0.38, 416, 4, W * 0.38, 416, 120); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.beginPath(); bonnet(); g.fillStyle = sh; g.fill();
  g.beginPath(); g.moveTo(-20, 440); g.quadraticCurveTo(W / 2, 378, W + 20, 440); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.stroke();
  g.restore();
  // the instrument hood over the dials, with red stitching
  const hood = () => { g.moveTo(W / 2 - 150, 549); g.bezierCurveTo(W / 2 - 150, 434, W / 2 - 130, 430, W / 2, 430); g.bezierCurveTo(W / 2 + 130, 430, W / 2 + 150, 434, W / 2 + 150, 549); };
  g.beginPath(); hood(); g.closePath(); g.fillStyle = '#141418'; g.fill();
  g.beginPath(); hood(); g.strokeStyle = '#0a0a0c'; g.lineWidth = 4; g.stroke();
  g.save(); g.translate(0, 5); g.beginPath(); hood(); g.setLineDash([4, 4]); g.strokeStyle = gold ? '#fbbf24' : '#b91c1c'; g.lineWidth = 1.2; g.stroke(); g.restore();
  // the same shape in black, for dimming the cabin in tunnels and at night
  const mask = canvas(img.width, img.height), mg = mask.getContext('2d');
  mg.drawImage(img, 0, 0); mg.globalCompositeOperation = 'source-in'; mg.fillStyle = '#000'; mg.fillRect(0, 0, mask.width, mask.height);
  const art = { img, mask };
  CABS.set(key, art);
  return art;
}

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

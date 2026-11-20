// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — Zone 6 · game 2 (the ice kingdom). Built in sections for review.
//
//  The Iceman climbed out of the volcano (Magma Escape); now he rides a sled down the frozen side
//  of the mountain with an avalanche behind him. You see the slope from behind the sled. Steer
//  between the trees and rocks, tuck for speed, and reach the hut at the bottom. A hit is a
//  tumble: no life lost, but the avalanche gains. Only the avalanche costs a life, and you start
//  again from the flag halfway down.
//
//  Fifteen runs; runs 5 and 10 are crystal rushes with no avalanche.
//
//  Snow ramps throw you into the air: hold ◀ or ▶ to spin, tuck to grab the sled, and let go so you
//  land pointing downhill for a burst of speed (land sideways and you tumble). JUMP hops over
//  rocks. From run 6 there are crevasses: take the ramp at the edge, or jump at the last moment.
//
//  Ice wolves (from run 4) run beside you and lunge after a crouch: swerve into one to knock it
//  down. Yetis (from run 7) throw snow boulders at the ring on the snow; land on a yeti to flatten
//  it. Boulders roll out of the forest from run 11.
//
//  SECTIONS 1–3 (this file so far): the slope in 3D, steering, tucking, the avalanche, trees and
//  rocks, the flag, the hut, phone buttons; the Iceman on his sled (art.js), ramps, tricks, hops,
//  crevasses, crystals; wolves, yetis, boulders. Still to come: ruins, night torches and blizzard
//  runs (4), music and the last badges (5).
//
//  The rules live in world.js (pure, shared with check.mjs, test.mjs and bench.mjs). This file is
//  input, camera, drawing, sound and points.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { SlopeSim, makeSlope, bendAt, HALF, MAX_GAP, BONUS_LEVELS, FINAL_LEVEL } from './world.js';
import { drawIcemanSled, drawIcemanFront, drawSled, drawWolf, drawYeti, PAL } from './art.js';

const ID = 'avalanche-run';
const W = 480, H = 720;
// The slope FALLS AWAY from you: the snow drops faster the further down you look, so about 160 m
// ahead it rolls over a lip and is gone. Past the lip you look out over the valley far below.
// The camera looks DOWN the hill: the level horizon (the far mountains' feet) is high in the picture and
// the lip far below it, and everything between is the drop: the valley floor and the rest of the run.
const SKYLINE = 132;                 // screen y of the far mountains' feet (the true, level horizon)
const HORIZON = 346;                 // where a flat slope would have vanished; the lip sits a little below it
const CAM_H = 5.2;                   // the camera's height above the snow (m): high, looking down the hill
const BACK = 9.5;                    // … and how far behind the sled it rides (m)
const SLED_Y = 608;                  // screen y of the snow under the sled
const F = (SLED_Y - HORIZON) * BACK / CAM_H;   // projection scale: pixels per metre at 1 m from the camera
const LIP = 160;                     // how far ahead the slope rolls over (m)
const DROP = CAM_H / (LIP * LIP);    // the snow at d metres ahead lies DROP·d² below a flat slope
const LIP_Y = HORIZON + 2 * F * CAM_H / LIP;   // screen y of the lip
const FAR = 142;                     // how far down the slope things are drawn (m)
const ARRIVE_T = 1.7;                // seconds at the hut: the Iceman steps off and turns to face you
const PANEL = 96;                    // height of the touch buttons when they sit on the picture

const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

// The time of day changes down the mountain (full themes come with Section 4).
const SKIES = {
  day:   { sky: ['#3f86d8', '#9fd0f5', '#e6f4ff'], snow: ['#dcebf8', '#ffffff'], haze: '#dcecf9', vale: ['#8fb0cf', '#2f5878', '#e6f4ff'], peak: ['#9db7d1', '#c9dcee'], pine: ['#1f5132', '#2f6b43'], shade: 'rgba(60,90,130,0.22)' },
  dusk:  { sky: ['#3b3f7a', '#c9739a', '#ffc38a'], snow: ['#e7cfd8', '#fff1e6'], haze: '#f0cdbf', vale: ['#9a7896', '#3f3560', '#ffd9b8'], peak: ['#7d6590', '#b98aa5'], pine: ['#27413a', '#35584a'], shade: 'rgba(80,50,90,0.25)' },
  night: { sky: ['#070b1f', '#152552', '#2d4a86'], snow: ['#7f95c2', '#c9d8f2'], haze: '#5f78ad', vale: ['#2c3f73', '#0b1533', '#7f95c2'], peak: ['#22305a', '#34497d'], pine: ['#10261f', '#173529'], shade: 'rgba(10,20,50,0.35)' },
};
const skyFor = (level) => (level >= 11 ? SKIES.night : level >= 6 ? SKIES.dusk : SKIES.day);

const LEVEL_INFO = {
  1: 'Steer between the trees and reach the hut. The avalanche is right behind you.',
  2: 'Snow ramps! In the air hold ◀ or ▶ to spin, and let go before you land.',
  3: 'Rocks: JUMP hops over them. Tuck (↓) to go faster, but you steer less.',
  4: 'An ice wolf! It crouches, then lunges. Swerve into it first to knock it down.',
  6: 'Crevasses! Take the ramp at the edge, or JUMP at the last moment.',
  7: 'A yeti! Steer off the ring where its boulder will land. Jump on its head to flatten it.',
  8: 'Wolves hunt in pairs now, and there are two crevasses.',
  9: 'Tuck in the air to grab the sled: a grab is a trick too.',
  11: 'Night run. Boulders roll out of the forest: go ahead of them or behind.',
  13: 'Packs of three. Everything the mountain has.',
  15: 'The long slope. Outrun the mountain.',
};

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  finalLevel: FINAL_LEVEL,
  bonusLevels: BONUS_LEVELS,
  bonusTime: 20,
  winTitle: 'You outran the mountain!',
  comboWindow: 3,
  comboStep: 3,
  maxMultiplier: 5,
  music: { bpm: 138, style: 'minor', lead: 'triangle' },      // the game's own tune comes with Section 5
  levelName: 'Run',
  levelTitle: (level) => `Run ${level}`,
  clearText: 'SAFE IN THE HUT!',
  levelInfo: (level, bonus) => (bonus ? '★ Crystal rush! No avalanche: ramps and crystals for 20 seconds.' : LEVEL_INFO[level] || 'Thicker forest, faster snow.'),
  titleHint: 'A tumble costs you ground, not a life. Only the avalanche can take a life.',
  create: (shell) => new AvalancheRun(shell),
});

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** A snowy pine, painted once per colour set and shape. */
function pineSprite(pine, v) {
  const c = canvas(120, 200), g = c.getContext('2d'), tiers = 3 + (v % 2);
  g.fillStyle = '#4a3423'; g.fillRect(54, 160, 12, 40);
  for (let i = 0; i < tiers; i++) {
    const top = 6 + i * (150 / (tiers + 0.6)), bot = top + 150 / tiers + 22, half = 22 + i * (34 / tiers) + (v === 2 ? 4 : 0);
    g.fillStyle = pine[i % 2]; g.beginPath(); g.moveTo(60, top); g.lineTo(60 + half, bot); g.lineTo(60 - half, bot); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.moveTo(60, top); g.lineTo(60 + half * 0.5, top + (bot - top) * 0.5); g.lineTo(60 + half * 0.2, top + (bot - top) * 0.42);
    g.lineTo(60, top + (bot - top) * 0.56); g.lineTo(60 - half * 0.25, top + (bot - top) * 0.4); g.lineTo(60 - half * 0.5, top + (bot - top) * 0.5); g.closePath(); g.fill();
  }
  return c;
}
/** A boulder with a cap of snow. */
function rockSprite(v) {
  const c = canvas(140, 110), g = c.getContext('2d');
  const pts = v === 0 ? [[8, 104], [20, 46], [58, 14], [104, 28], [132, 104]] : v === 1 ? [[6, 104], [30, 30], [74, 10], [118, 50], [134, 104]] : [[10, 104], [16, 60], [48, 22], [92, 16], [126, 62], [132, 104]];
  g.fillStyle = '#5b6474'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.fillStyle = '#434b5a'; g.beginPath(); g.moveTo(pts[2][0], pts[2][1]); g.lineTo(pts[pts.length - 2][0], pts[pts.length - 2][1]); g.lineTo(pts[pts.length - 1][0], 104); g.lineTo(70, 104); g.closePath(); g.fill();
  g.fillStyle = '#f8fbff'; g.beginPath(); g.moveTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.lineTo(pts[3][0], pts[3][1]); g.lineTo(pts[3][0] - 14, pts[3][1] + 16); g.lineTo(70, pts[2][1] + 22); g.lineTo(pts[1][0] + 12, pts[1][1] + 14); g.closePath(); g.fill();
  return c;
}

class AvalancheRun {
  constructor(s) {
    this.s = s;
    this.t = 0; this.camX = 0; this.flakes = []; this.chunks = [];
    this.sprites = new Map(); this.rocks = [0, 1, 2].map(rockSprite);
    this.touchSeen = false; this.btnOn = { left: false, right: false, tuck: false, jump: false };
    this.layout();
    s.canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !this.touchSeen) { this.touchSeen = true; this.layout(); } });
    // Phones: go by the finger list the phone sends with EVERY touch event, not by matching each press to
    // its lift. iPhones sometimes drop or cancel a lift (a long press at the screen's edge is exactly what
    // holding ◀ is), and a press whose lift never arrives would hold its button down for ever.
    this.fingers = null;                                   // null until the first touch event: then the list of fingers on the canvas
    const sync = (e) => {
      this.syncTouches(Array.from(e.targetTouches, (q) => { const [x, y] = s.input.toLogical(q); return { x, y }; }));
      if (!this.touchSeen) { this.touchSeen = true; this.layout(); }
      if (e.cancelable && s.state === 'playing') e.preventDefault();      // no magnifier, no double-tap zoom, no page scroll under the thumbs
    };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) s.canvas.addEventListener(type, sync, { passive: false });
    const letGo = () => { if (this.fingers) this.fingers = []; };
    addEventListener('blur', letGo); addEventListener('pagehide', letGo);
    document.addEventListener('visibilitychange', letGo);
    for (let i = 0; i < 70; i++) this.flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, v: 0.4 + Math.random() });
    this.startLevel(1, false);
  }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.slope = makeSlope(level, this.s.rng, bonus);
    this.sim = new SlopeSim(this.slope);
    this.sky = bonus ? SKIES.dusk : skyFor(level);
    this.paid = 0; this.camX = this.sim.p.x; this.chunks = []; this.livesAtStart = this.s.lives; this.arrive = 0; this.arrived = false;
  }
  onLifeLost() { this.sim.reset(); this.camX = this.sim.p.x; this.paid = Math.floor(this.sim.p.z / 100); this.chunks = []; }
  onAction() { /* the controls are read each step (keys and touch) */ }

  // ── Layout and input ─────────────────────────────────────────
  touchUI() { return this.s.coarse || this.touchSeen; }
  layout() {
    const band = this.s.bands?.bottom || 0, inBand = band >= 150;
    const cy = inBand ? H + band * 0.5 : H - PANEL / 2, r = inBand ? 46 : 40;
    // kept 30 px clear of the screen's side edges: iPhones start their own swipes there
    const lx = 30 + r, jx = W - 30 - (r + 4);
    this.ctl = { left: { x: lx, y: cy, r }, right: { x: lx + r * 2 + 10, y: cy, r }, tuck: { x: jx - (r + 4) - (r - 4) - 10, y: cy + 8, r: r - 4 }, jump: { x: jx, y: cy - 4, r: r + 4 } };
  }
  onBandsChange() { this.layout(); }
  /** The fingers on the canvas right now, as the phone reports them (see the constructor). */
  syncTouches(list) { this.fingers = list; }
  /** Which buttons fingers rest on: each finger presses the button it is nearest to. */
  buttons() {
    const on = { left: false, right: false, tuck: false, jump: false }, C = this.ctl;
    for (const q of this.fingers || this.s.input.pointers.values()) {
      let best = null, bd = 1e9;
      for (const k of ['left', 'right', 'tuck', 'jump']) { const b = C[k], d = Math.hypot(q.x - b.x, q.y - b.y); if (d < b.r + 24 && d - b.r < bd) { bd = d - b.r; best = k; } }
      if (best) on[best] = true;
    }
    return on;
  }
  readInput() {
    const i = this.s.input, tb = this.btnOn = this.touchUI() ? this.buttons() : { left: false, right: false, tuck: false, jump: false };
    const left = i.isDown('left') || tb.left, right = i.isDown('right') || tb.right;
    return { dir: (right ? 1 : 0) - (left ? 1 : 0), tuck: i.isDown('down') || tb.tuck, jump: i.isDown('up') || i.isDown('action') || tb.jump };
  }

  // ── Play ─────────────────────────────────────────────────────
  update(dt) {
    const s = this.s, sim = this.sim, p = sim.p, L = this.level;
    this.t += dt;
    if (this.arrived) {                                   // at the hut
      this.drift(dt, 4);
      if (this.arrive > 0 && (this.arrive -= dt) <= 0) s.completeLevel();
      return;
    }
    const events = sim.step(this.readInput(), dt);
    this.camX += (p.x - this.camX) * Math.min(1, 9 * dt);
    for (const e of events) {
      if (e.type === 'tumble') {
        s.resetCombo(); s.sound.play('hit'); s.fx.shake(7, 0.25);
        s.fx.text(W / 2, SLED_Y - 120, e.bad ? 'BAD LANDING!' : e.by === 'boulder' ? 'BOULDER!' : 'TUMBLE!', { color: '#fca5a5', size: 26 });
        s.fx.burst(W / 2, SLED_Y - 20, { colors: ['#ffffff', '#dbeafe'], count: 22, speed: 220 });
      } else if (e.type === 'near') {
        s.award(5 * L, W / 2 + (e.o.x > p.x ? 60 : -60), SLED_Y - 70, { chain: true, color: '#7dd3fc', size: 18 });
        s.sound.play('flap', s.comboCount);
      } else if (e.type === 'crystal') {
        s.award(10 * L, W / 2, SLED_Y - 60, { chain: true, color: '#a5f3fc', size: 18 });
        s.sound.play('gem', s.comboCount);
      } else if (e.type === 'howl') {
        s.sound.tone?.({ freq: 420, to: 760, dur: 0.7, type: 'sine', vol: 0.08 });
        s.fx.text(W / 2, 250, e.n > 1 ? 'WOLVES!' : 'A WOLF!', { color: '#e0f2fe', size: 24, life: 1.1 });
      } else if (e.type === 'bite') {
        s.resetCombo(); s.sound.play('hit', 3); s.fx.shake(5, 0.2);
        s.fx.text(W / 2, SLED_Y - 120, 'BITTEN!', { color: '#fca5a5', size: 24 });
      } else if (e.type === 'knock') {
        s.award(40 * L, W / 2 + e.w.side * 70, SLED_Y - 80, { chain: true, color: '#fde047', size: 22 });
        s.sound.play('bounce', 5); s.fx.burst(W / 2 + e.w.side * 60, SLED_Y - 30, { colors: ['#ffffff', '#c9d6e6'], count: 16, speed: 220 });
        if (sim.knocks >= 5) s.unlock('wolves');
      } else if (e.type === 'stomp') {
        s.award(150 * L, W / 2, SLED_Y - 130, { chain: true, color: '#fde047', size: 26 });
        s.fx.text(W / 2, SLED_Y - 170, 'YETI FLATTENED!', { color: '#fef9c3', size: 22, life: 1.2 });
        s.sound.play('boom'); s.fx.shake(6, 0.2); s.unlock('yeti');
      } else if (e.type === 'throw') {
        s.sound.play('flap', 1);
      } else if (e.type === 'thud') {
        s.sound.play('brick', 2);
        const q = this.project(e.b.x, 0.5, e.b.z); if (q) s.fx.burst(q[0], q[1], { colors: ['#ffffff', '#dbeafe'], count: 18, speed: 30 + q[2] * 3 });
      } else if (e.type === 'rumble') {
        s.sound.play('metal', 1); s.fx.text(e.q.side > 0 ? W - 70 : 70, 300, 'BOULDER!', { color: '#fecaca', size: 18, life: 0.9 });
      } else if (e.type === 'launch') {
        s.sound.play('flap', 6); this.airBest = 0;
      } else if (e.type === 'hop') {
        s.sound.play('flap', 2);
      } else if (e.type === 'cleared') {
        s.award(8 * L, W / 2, SLED_Y - 90, { chain: true, color: '#7dd3fc', size: 18 });
      } else if (e.type === 'trick') {
        const pts = (e.spins * 60 + (e.grab ? 40 : 0)) * L, name = `${e.spins >= 3 ? 'TRIPLE SPIN' : e.spins === 2 ? 'DOUBLE SPIN' : e.spins === 1 ? 'SPIN' : ''}${e.spins && e.grab ? ' + ' : ''}${e.grab ? 'GRAB' : ''}`;
        s.award(pts, W / 2, SLED_Y - 110, { chain: true, color: '#fde047', size: 24 });
        s.fx.text(W / 2, SLED_Y - 150, `${name}!  CLEAN LANDING`, { color: '#fef9c3', size: 20, life: 1.2 });
        s.fx.burst(W / 2, SLED_Y - 10, { colors: ['#ffffff', '#fde047'], count: 26, speed: 260 });
        s.sound.play('powerup');
        if (e.spins >= 3) s.unlock('trickster');
      } else if (e.type === 'land') {
        s.fx.burst(W / 2, SLED_Y - 6, { colors: ['#ffffff', '#dbeafe'], count: 12, speed: 160 });
      } else if (e.type === 'fell') {
        s.fx.flash('#0b1b3a'); s.fx.shake(10, 0.4); s.sound.play('boom');
        s.fx.text(W / 2, SLED_Y - 140, 'INTO THE CREVASSE!', { color: '#bae6fd', size: 24 });
        return s.hurt();
      } else if (e.type === 'flag') {
        s.sound.play('powerup'); s.fx.text(W / 2, 230, 'HALFWAY FLAG!', { color: '#fde047', size: 26, life: 1.3 });
      } else if (e.type === 'hut') {
        const lead = Math.round(e.gap);
        s.award(lead * 5 * L, W / 2, 260, { color: '#86efac', size: 24 });
        s.fx.text(W / 2, 220, `${lead} m ahead of the avalanche`, { color: '#e0f2fe', size: 20, life: 1.4 });
        if (sim.tumbles === 0 && s.lives >= this.livesAtStart) { s.award(300 * L, W / 2, 310, { color: '#fde047', size: 22 }); s.unlock('clean'); }
        s.unlock('first');
        if (L >= FINAL_LEVEL) s.unlock('outrun');
        s.sound.play('golden');
        this.arrive = ARRIVE_T; this.arrived = true;      // he steps off and turns round; the run is cleared when that is over
        return;
      } else if (e.type === 'caught') {
        s.fx.flash('#ffffff'); s.fx.shake(12, 0.5); s.sound.play('boom');
        return s.hurt();
      }
    }
    // a little for every 100 m ridden
    const hundreds = Math.floor(p.z / 100);
    if (hundreds > this.paid) { this.paid = hundreds; s.award(10 * L, W - 70, 120, { color: '#e0f2fe', size: 16 }); }
    // the avalanche's breath on your neck
    if (!this.bonus) {
      const near = clamp(1 - sim.gap / 40, 0, 1);
      if (near > 0 && Math.random() < near * 0.5) this.chunks.push({ x: Math.random() * W, y: H + 20, vx: (Math.random() - 0.5) * 120, vy: -(260 + Math.random() * 380) * (0.5 + near), r: 3 + Math.random() * 9, life: 0.9 });
      if (near > 0.55 && Math.random() < 0.08) s.fx.shake(2 + near * 4, 0.15);
    }
    this.drift(dt, p.v);
  }
  idle(dt) { this.t += dt; this.drift(dt, 6); }
  /** Falling snow and flying chunks (for the eye only). */
  drift(dt, v) {
    for (const f of this.flakes) { f.y += (40 + v * 14) * f.v * dt; f.x += Math.sin(this.t * 1.3 + f.r * 9) * 12 * dt; if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; } }
    for (const c of this.chunks) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 300 * dt; c.life -= dt; }
    if (this.chunks.length) this.chunks = this.chunks.filter((c) => c.life > 0);
  }

  // ── Drawing ──────────────────────────────────────────────────
  /** Screen position and scale of a point on the mountain (x across, y up, z down the slope). */
  project(x, y, z) {
    const p = this.sim.p, d = z - (p.z - BACK);
    if (d < 1.2) return null;
    const sc = F / d, bend = this.slope.bend;
    return [W / 2 + (x + bendAt(bend, z) - this.camX - bendAt(bend, p.z)) * sc, HORIZON + (CAM_H + DROP * d * d - y) * sc, sc, d];
  }
  pine(v) {
    const key = this.sky.pine[0] + v;
    if (!this.sprites.has(key)) this.sprites.set(key, pineSprite(this.sky.pine, v));
    return this.sprites.get(key);
  }

  render(ctx) {
    const s = this.s, sim = this.sim, p = sim.p, sky = this.sky, band = s.bands?.bottom || 0;
    const top = -(s.bands?.top || 0), bottom = H + band;
    let g;
    this.drawBackdrop(ctx, top, bottom);
    this.drawSpeedLines(ctx);
    this.drawSnowMarks(ctx);
    for (const c of this.slope.crevasses) this.drawCrevasse(ctx, c);

    // everything standing on the slope, far to near
    const list = [], z0 = p.z - BACK + 1.5, z1 = p.z + FAR, obs = this.slope.obstacles;
    for (let i = sim.i0; i < obs.length && obs[i].z < z1; i++) list.push({ z: obs[i].z, kind: obs[i].kind, o: obs[i] });
    for (let i = sim.i0 - 1; i >= 0 && obs[i].z > z0; i--) list.push({ z: obs[i].z, kind: obs[i].kind, o: obs[i] });
    for (let k = Math.ceil(z0 / 4); k * 4 < z1; k++) for (const side of [-1, 1]) {           // the forest either side
      const h = hash(k * 2 + (side > 0 ? 1 : 0) + 977);
      list.push({ z: k * 4 + h * 2, kind: 'edge', x: side * (HALF + 1.6 + h * 3.5), v: Math.floor(h * 3), r: 0.7 + h * 0.5 });
      if (h > 0.4) list.push({ z: k * 4 + 2 - h, kind: 'edge', x: side * (HALF + 6 + h * 6), v: Math.floor(h * 7) % 3, r: 0.9 });
    }
    for (const c of this.slope.crystals) if (!c.got && c.z > z0 && c.z < z1) list.push({ z: c.z, kind: 'crystal', c });
    for (const rp of this.slope.ramps) if (rp.z > z0 && rp.z < z1) list.push({ z: rp.z - 0.01, kind: 'ramp', rp });
    if (!this.bonus) {
      if (this.slope.flagZ > z0 && this.slope.flagZ < z1) list.push({ z: this.slope.flagZ, kind: 'flag' });
      if (this.slope.len > z0 && this.slope.len < z1 + 40) list.push({ z: this.slope.len + 18, kind: 'hut' });
    }
    for (const w of sim.wolves) if (w.state !== 'gone') list.push({ z: p.z + w.dz + 0.02, kind: 'wolf', w });
    for (const b of sim.boulders) list.push({ z: b.z, kind: 'boulder', b });
    list.push({ z: p.z, kind: 'sled' });
    list.sort((a, b) => b.z - a.z);
    for (const it of list) {
      if (it.kind === 'sled') { this.drawSled(ctx); continue; }
      if (it.kind === 'flag') { this.drawGate(ctx, it.z, '#fde047', 'FLAG'); continue; }
      if (it.kind === 'hut') { this.drawHut(ctx, it.z); continue; }
      if (it.kind === 'crystal') { this.drawCrystal(ctx, it.c); continue; }
      if (it.kind === 'ramp') { this.drawRamp(ctx, it.rp); continue; }
      if (it.kind === 'wolf') { this.drawWolfAt(ctx, it.w); continue; }
      if (it.kind === 'boulder') { this.drawBoulder(ctx, it.b); continue; }
      if (it.kind === 'yeti') { this.drawYetiAt(ctx, it.o); continue; }
      const o = it.o || it, q = this.project(o.x, 0, it.z);
      if (!q) continue;
      const [x, y, sc, d] = q;
      if (x < -160 || x > W + 160) continue;
      ctx.globalAlpha = clamp((FAR - d) / 45, 0, 1);
      ctx.fillStyle = sky.shade; ctx.beginPath(); ctx.ellipse(x + o.r * sc * 0.5, y, o.r * sc * 1.5, o.r * sc * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      if (it.kind === 'rock') { const w = o.r * 2.5 * sc * (o.hit ? 0.6 : 1), hh = w * (o.hit ? 0.45 : 0.78); ctx.drawImage(this.rocks[o.v], x - w / 2, y - hh * 0.96, w, hh); }
      else {
        const hM = 4.2 + o.r * 3.2, hh = hM * sc, w = hh * 0.6;
        if (o.hit) { ctx.save(); ctx.translate(x, y); ctx.rotate((o.v % 2 ? 1 : -1) * 1.45); ctx.globalAlpha *= 0.8; ctx.drawImage(this.pine(o.v), -w * 0.35, -hh * 0.7, w * 0.7, hh * 0.7); ctx.restore(); }   // knocked flat
        else ctx.drawImage(this.pine(o.v), x - w / 2, y - hh, w, hh);
      }
    }
    ctx.globalAlpha = 1;

    // falling snow, then the avalanche's powder when it is close
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const f of this.flakes) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); }
    if (!this.bonus) {
      const near = clamp(1 - sim.gap / 40, 0, 1);
      if (near > 0) {
        g = ctx.createLinearGradient(0, H - 60 - near * 330, 0, bottom);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, `rgba(255,255,255,${0.55 * near})`); g.addColorStop(1, `rgba(255,255,255,${0.95 * near})`);
        ctx.fillStyle = g; ctx.fillRect(0, H - 60 - near * 330, W, bottom - (H - 60 - near * 330));
        for (const side of [0, 1]) {
          g = ctx.createLinearGradient(side ? W : 0, 0, side ? W - 90 * near : 90 * near, 0);
          g.addColorStop(0, `rgba(255,255,255,${0.7 * near})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(side ? W - 90 : 0, LIP_Y, 90, bottom - LIP_Y);
        }
      }
      ctx.fillStyle = '#ffffff';
      for (const c of this.chunks) { ctx.globalAlpha = clamp(c.life * 1.6, 0, 1); ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    this.drawHud(ctx);
    if (this.touchUI()) this.drawButtons(ctx);
  }

  /** The sky, the far range across the valley, and the long drop below you: the valley floor with its
   *  frozen lake and a few lights, and the rest of your own mountainside running down to it. As the run
   *  goes on the valley comes up to meet you. Then the snowfield, from its lip to your feet. */
  drawBackdrop(ctx, top, bottom) {
    const p = this.sim.p, sky = this.sky;
    let g = ctx.createLinearGradient(0, top, 0, SKYLINE);
    g.addColorStop(0, sky.sky[0]); g.addColorStop(0.6, sky.sky[1]); g.addColorStop(1, sky.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, top, W, SKYLINE - top + 2);
    const pan = (bendAt(this.slope.bend, p.z) + this.camX) * 1.4;      // the view slides a little as the slope winds
    const down = Number.isFinite(this.slope.len) ? clamp(p.z / this.slope.len, 0, 1) : 0.5;   // how far down the run you are
    for (let layer = 0; layer < 2; layer++) {                           // the range on the far side of the valley
      ctx.fillStyle = sky.peak[layer]; ctx.beginPath(); ctx.moveTo(0, SKYLINE + 2);
      for (let i = -1; i <= 9; i++) {
        const x = i * 70 - ((pan * (0.3 + layer * 0.3)) % 70) + layer * 30, h = 30 + hash(i * 7 + layer * 131 + Math.floor(pan * (0.3 + layer * 0.3) / 70) * 7) * (48 - layer * 20);
        ctx.lineTo(x, SKYLINE + 2); ctx.lineTo(x + 35, SKYLINE - h + layer * 16);
      }
      ctx.lineTo(W, SKYLINE + 2); ctx.closePath(); ctx.fill();
    }
    // the drop: haze at the far side, deepening towards the valley floor under you
    const depth = LIP_Y - SKYLINE;
    g = ctx.createLinearGradient(0, SKYLINE, 0, LIP_Y);
    g.addColorStop(0, sky.haze); g.addColorStop(0.45, sky.vale[0]); g.addColorStop(1, sky.vale[1]);
    ctx.fillStyle = g; ctx.fillRect(0, SKYLINE, W, depth + 2);
    for (let layer = 0; layer < 4; layer++) {                            // forested ridges stepping down into the valley
      const y0 = SKYLINE + 14 + layer * depth * 0.2, sp = 0.5 + layer * 0.4, step = 52;
      ctx.fillStyle = sky.vale[1]; ctx.globalAlpha = 0.2 + layer * 0.16;
      ctx.beginPath(); ctx.moveTo(0, LIP_Y + 2);
      for (let i = -1; i <= 11; i++) { const k = Math.floor(pan * sp / step) + i, x = i * step - ((pan * sp) % step); ctx.lineTo(x, y0 + hash(k * 13 + layer * 57) * 20 + Math.abs(x - W / 2) * -0.05 * layer); }
      ctx.lineTo(W, LIP_Y + 2); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the valley floor, seen from high above: it rises and widens as you come down the mountain
    const cx = W / 2 - pan * 0.6, fy = SKYLINE + depth * (0.34 - 0.1 * down), sc = 0.8 + 0.5 * down;
    ctx.fillStyle = sky.vale[2]; ctx.globalAlpha = 0.55;                // a frozen lake
    ctx.beginPath(); ctx.ellipse(cx - 70 * sc, fy + 6 * sc, 62 * sc, 9 * sc, -0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 20 * sc, fy + 8 * sc); ctx.bezierCurveTo(cx + 40 * sc, fy + 14 * sc, cx - 10 * sc, fy + 30 * sc, cx + 70 * sc, fy + 44 * sc);   // and the river out of it
    ctx.lineTo(cx + 82 * sc, fy + 41 * sc); ctx.bezierCurveTo(cx + 6 * sc, fy + 28 * sc, cx + 56 * sc, fy + 12 * sc, cx - 14 * sc, fy + 4 * sc); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {                                         // the village by the lake: a few warm windows
      const a = hash(i * 3 + 11), b = hash(i * 5 + 2), x = cx + (20 + a * 70) * sc, y = fy + (-4 + b * 12) * sc;
      ctx.fillStyle = '#3b2a22'; ctx.fillRect(x - 2.2 * sc, y - 2 * sc, 4.4 * sc, 3 * sc);
      ctx.fillStyle = '#ffd166'; ctx.globalAlpha = 0.65 + 0.35 * Math.sin(this.t * 2 + i); ctx.fillRect(x - 0.8 * sc, y - 1.2 * sc, 1.6 * sc, 1.4 * sc); ctx.globalAlpha = 1;
    }
    // the rest of your own mountainside: the run goes on below the lip, far smaller, all the way to the village
    const rx = W / 2 + (cx - W / 2) * 0.5, ry = fy + 20 * sc;
    g = ctx.createLinearGradient(0, ry, 0, LIP_Y); g.addColorStop(0, sky.haze); g.addColorStop(1, sky.snow[0]);
    ctx.fillStyle = g; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(rx - 5, ry); ctx.bezierCurveTo(rx - 30, ry + (LIP_Y - ry) * 0.4, W / 2 - 150, LIP_Y - 30, W / 2 - 200, LIP_Y + 2);
    ctx.lineTo(W / 2 + 200, LIP_Y + 2); ctx.bezierCurveTo(W / 2 + 150, LIP_Y - 30, rx + 30, ry + (LIP_Y - ry) * 0.4, rx + 5, ry); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = sky.pine[0];
    for (let i = 0; i < 46; i++) {                                        // its forest, shrinking with the distance
      const a = hash(i * 7 + 5), k = Math.pow(hash(i * 11 + 9), 0.7), y = ry + (LIP_Y - ry) * k, half = 6 + 190 * k * k, side = i % 2 ? 1 : -1;
      const x = lerp(rx, W / 2, k) + side * (half + a * (10 + 60 * k)), hh = 2 + 12 * k;
      ctx.globalAlpha = 0.35 + 0.5 * k; ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x + hh * 0.35, y); ctx.lineTo(x - hh * 0.35, y); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the snowfield you are on: in shadow where it rolls over, bright at your feet
    g = ctx.createLinearGradient(0, LIP_Y, 0, H);
    g.addColorStop(0, sky.snow[1]); g.addColorStop(0.04, sky.haze); g.addColorStop(0.16, sky.vale[0]); g.addColorStop(0.42, sky.snow[0]); g.addColorStop(1, sky.snow[1]);
    ctx.fillStyle = g; ctx.fillRect(0, LIP_Y, W, bottom - LIP_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(0, LIP_Y - 1.5, W, 3.5);
  }

  /** Streaks of snow rushing past from the middle of the view: more of them the faster you go. */
  drawSpeedLines(ctx) {
    const p = this.sim.p, k = clamp((p.v - 14) / 40, 0, 1);
    if (k <= 0) return;
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    const n = Math.round(10 + k * 34), cx = W / 2, cy = LIP_Y + 30;
    for (let i = 0; i < n; i++) {
      const a = hash(i * 17 + 3) * Math.PI * 2, ph = (this.t * (1.2 + k * 2.6) + hash(i * 5 + 1)) % 1, r0 = 60 + ph * ph * 620, len = (14 + k * 70) * (0.3 + ph);
      const dx = Math.cos(a), dy = Math.sin(a) * 0.8 + 0.25;
      if (cy + dy * r0 < LIP_Y + 6) continue;
      ctx.globalAlpha = (0.1 + k * 0.3) * ph; ctx.lineWidth = 1 + ph * 2;
      ctx.beginPath(); ctx.moveTo(cx + dx * r0, cy + dy * r0); ctx.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Soft marks in the snow that rush towards you: they are what makes the speed visible. */
  drawSnowMarks(ctx) {
    const p = this.sim.p, z0 = p.z - BACK + 2, z1 = p.z + 110;
    ctx.fillStyle = this.sky.shade;
    for (let k = Math.ceil(z0 / 5); k * 5 < z1; k++) for (let j = -4; j <= 4; j++) {
      const h = hash(k * 31 + j * 7 + 5), q = this.project(j * 5.5 + (h - 0.5) * 5, 0, k * 5 + h * 4);
      if (!q || q[0] < -60 || q[0] > W + 60) continue;
      ctx.globalAlpha = clamp((110 - q[3]) / 60, 0, 1) * clamp(q[3] / 30, 0.25, 1) * 0.5;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], (0.7 + h * 0.9) * q[2], (0.1 + h * 0.1) * q[2], 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Two poles and a banner across the slope. */
  drawGate(ctx, z, col, word) {
    const a = this.project(-HALF + 1, 0, z), b = this.project(HALF - 1, 0, z);
    if (!a || !b) return;
    const hh = 5.2 * a[2];
    ctx.globalAlpha = clamp((FAR - a[3]) / 45, 0, 1);
    ctx.fillStyle = '#7c2d12'; ctx.fillRect(a[0] - 0.12 * a[2], a[1] - hh, 0.24 * a[2], hh); ctx.fillRect(b[0] - 0.12 * a[2], b[1] - hh, 0.24 * a[2], hh);
    ctx.fillStyle = col; ctx.fillRect(a[0], a[1] - hh, b[0] - a[0], 1.1 * a[2]);
    if (a[2] > 5) { ctx.fillStyle = '#1f2937'; ctx.font = `800 ${Math.round(0.8 * a[2])}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(word, (a[0] + b[0]) / 2, a[1] - hh + 0.56 * a[2]); }
    ctx.globalAlpha = 1;
  }
  /** The hut at the bottom, with its finish banner. */
  drawHut(ctx, z) {
    if (!this.arrived) this.drawGate(ctx, this.slope.len, '#86efac', 'SAFE');
    const q = this.project(0, 0, z);
    if (!q) return;
    const [x, y, sc] = q, w = 8 * sc, hh = 4.2 * sc;
    ctx.globalAlpha = clamp((FAR + 40 - q[3]) / 45, 0, 1);
    ctx.fillStyle = '#6b4226'; ctx.fillRect(x - w / 2, y - hh, w, hh);
    ctx.fillStyle = '#4a2c17'; for (let i = 1; i < 5; i++) ctx.fillRect(x - w / 2, y - hh + i * hh / 5, w, Math.max(1, 0.08 * sc));
    ctx.fillStyle = '#f8fbff'; ctx.beginPath(); ctx.moveTo(x - w * 0.62, y - hh); ctx.lineTo(x, y - hh - 3.4 * sc); ctx.lineTo(x + w * 0.62, y - hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.fillRect(x - 0.9 * sc, y - 2.9 * sc, 1.8 * sc, 1.5 * sc);
    ctx.fillStyle = '#3b2412'; ctx.fillRect(x + 1.9 * sc, y - 2.6 * sc, 1.5 * sc, 2.6 * sc);
    ctx.globalAlpha = 1;
  }
  drawCrystal(ctx, c) {
    const q = this.project(c.x, (c.y || 0.9) + Math.sin(this.t * 4 + c.z) * 0.15, c.z);
    if (!q) return;
    const [x, y, sc, d] = q, r = 0.34 * sc;
    ctx.globalAlpha = clamp((FAR - d) / 45, 0, 1);
    ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.5); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ecfeff'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x + r * 0.45, y - r * 0.1); ctx.lineTo(x - r * 0.3, y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawWolfAt(ctx, w) {
    const q = this.project(w.x, 0, this.sim.p.z + w.dz);
    if (!q) return;
    const u = q[2] * 1.0 / 40;            // a wolf is about a metre across the haunches here, a little larger than life so it reads
    ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.ellipse(q[0], q[1] + 1, 0.8 * q[2], 0.16 * q[2], 0, 0, Math.PI * 2); ctx.fill();
    if (w.state === 'crouch') { const g = this.s.glowSprite('rgba(239,68,68,0.9)'), r = 1.3 * q[2]; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.t * 30); ctx.drawImage(g, q[0] - w.side * 0.25 * q[2] - r, q[1] - 1.35 * q[2] - r, r * 2, r * 2); ctx.globalAlpha = 1; }
    ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(u, u);
    drawWolf(ctx, { t: this.t + w.side, state: w.state, side: w.side });
    ctx.restore();
  }
  drawYetiAt(ctx, o) {
    const q = this.project(o.x, 0, o.z);
    if (!q) return;
    const u = q[2] * 3.6 / 136;          // a yeti stands 3.6 m tall
    ctx.globalAlpha = clamp((FAR - q[3]) / 45, 0, 1);
    ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.ellipse(q[0], q[1] + 1, 1.5 * q[2], 0.3 * q[2], 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(u, u);
    drawYeti(ctx, { t: this.t + o.z, arm: clamp((o.arm || 0) * 2, 0, 1), flat: o.flat });
    ctx.restore(); ctx.globalAlpha = 1;
  }
  /** A thrown snow boulder (with the ring where it will land) or a rock rolling out of the forest. */
  drawBoulder(ctx, b) {
    const q = this.project(b.x, 0, b.z);
    if (!q) return;
    const [x, y, sc] = q;
    if (b.kind === 'snow' && b.t > 0) {
      const k = 1 - b.t / 1.15;             // 0 at the throw, 1 as it lands
      ctx.strokeStyle = `rgba(239,68,68,${0.5 + 0.5 * k})`; ctx.lineWidth = Math.max(1.5, 0.12 * sc);
      ctx.beginPath(); ctx.ellipse(x, y, (b.r + 0.5) * sc, (b.r + 0.5) * sc * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(239,68,68,${0.12 + 0.25 * k})`; ctx.beginPath(); ctx.ellipse(x, y, (b.r + 0.5) * sc * k, (b.r + 0.5) * sc * 0.26 * k, 0, 0, Math.PI * 2); ctx.fill();
      const f = this.project(lerp(b.x0, b.x, k), 2.5 * (1 - k) + Math.sin(k * Math.PI) * 5, lerp(b.z0, b.z, k));
      if (f) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(f[0], f[1], b.r * f[2], 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#cfe0f0'; ctx.beginPath(); ctx.arc(f[0] + 0.25 * b.r * f[2], f[1] + 0.25 * b.r * f[2], b.r * f[2] * 0.55, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    if (b.t > 0) return;                    // a roller still hidden in the trees
    const r = b.r * sc, roll = b.kind === 'roll';
    ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y, r * 1.3, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = roll ? '#6b7483' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y - r, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = roll ? '#4b5362' : '#cfe0f0'; ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.75, r * 0.6, 0, Math.PI * 2); ctx.fill();
    if (roll) { ctx.strokeStyle = '#e8f1fa'; ctx.lineWidth = Math.max(1, r * 0.14); const a = this.t * 6 * Math.sign(b.vx); ctx.beginPath(); ctx.arc(x, y - r, r * 0.7, a, a + 1.6); ctx.stroke(); }
  }

  /** A crack right across the slope: dark depths, a pale ice wall on the far side, red poles at the near edge. */
  drawCrevasse(ctx, c) {
    const p = this.sim.p;
    if (c.z + c.len < p.z - BACK + 1.6 || c.z > p.z + FAR) return;
    const zn = Math.max(c.z, p.z - BACK + 1.6), a = this.project(-HALF - 12, 0, zn), b = this.project(HALF + 12, 0, zn), e = this.project(-HALF - 12, 0, c.z + c.len), f = this.project(HALF + 12, 0, c.z + c.len);
    if (!a || !e) return;
    ctx.globalAlpha = clamp((FAR - e[3]) / 45, 0, 1);
    const g = ctx.createLinearGradient(0, e[1], 0, a[1]);
    g.addColorStop(0, '#7fb6dd'); g.addColorStop(0.3, '#1e4a7a'); g.addColorStop(1, '#06122a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(f[0], f[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8f6ff'; ctx.fillRect(Math.min(e[0], 0), e[1] - 1, W + 400, Math.max(1.5, 0.25 * e[2]));
    if (c.z > p.z - BACK + 1.6) for (let x = -HALF + 1; x <= HALF - 1; x += 3.5) {
      const q = this.project(x, 0, c.z - 0.4); if (!q) continue;
      ctx.fillStyle = '#ef4444'; ctx.fillRect(q[0] - 0.07 * q[2], q[1] - 1.5 * q[2], 0.14 * q[2], 1.5 * q[2]);
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 1.5 * q[2]); ctx.lineTo(q[0] + 0.7 * q[2], q[1] - 1.25 * q[2]); ctx.lineTo(q[0], q[1] - 1.0 * q[2]); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  /** A wedge of packed snow, 6 m long, with blue stripes up its face and a flag either side of the lip. */
  drawRamp(ctx, rp) {
    const a = this.project(rp.x - rp.w, 0, rp.z - 6), b = this.project(rp.x + rp.w, 0, rp.z - 6), c = this.project(rp.x + rp.w, 1.25, rp.z), d = this.project(rp.x - rp.w, 1.25, rp.z), g0 = this.project(rp.x - rp.w, 0, rp.z), g1 = this.project(rp.x + rp.w, 0, rp.z);
    if (!a || !c || !g0) return;
    ctx.globalAlpha = clamp((FAR - c[3]) / 45, 0, 1);
    ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g1[0] + 1.2 * c[2], g1[1] + 0.1 * c[2]); ctx.lineTo(g0[0] + 1.2 * c[2], g0[1] + 0.1 * c[2]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rp.crev ? '#ef4444' : '#38bdf8'; ctx.lineWidth = Math.max(1, 0.16 * c[2]);
    for (const k of [0.25, 0.5, 0.75]) {              // chevrons pointing up the face
      const m0 = [lerp(a[0], d[0], k - 0.12) , lerp(a[1], d[1], k - 0.12)], m1 = [lerp((a[0] + b[0]) / 2, (c[0] + d[0]) / 2, k + 0.1), lerp((a[1] + b[1]) / 2, (c[1] + d[1]) / 2, k + 0.1)], m2 = [lerp(b[0], c[0], k - 0.12), lerp(b[1], c[1], k - 0.12)];
      ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke();
    }
    ctx.fillStyle = '#bcd7ee'; ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g0[0], g0[1]); ctx.closePath();
    if (g0[1] > d[1] && false) ctx.fill();
    for (const q of [d, c]) { ctx.fillStyle = '#7c2d12'; ctx.fillRect(q[0] - 0.06 * q[2], q[1] - 1.6 * q[2], 0.12 * q[2], 1.6 * q[2]); ctx.fillStyle = rp.crev ? '#ef4444' : '#38bdf8'; ctx.fillRect(q[0], q[1] - 1.6 * q[2], 0.8 * q[2], 0.5 * q[2]); }
    ctx.globalAlpha = 1;
  }

  /** The Iceman on his sled (art.js), with his shadow on the snow under him. */
  drawSled(ctx) {
    const p = this.sim.p, q = this.project(p.x, 0, p.z);
    if (!q) return;
    const [x, y, sc] = q, u = sc / 70 * 1.6, up = p.y * sc, lean = clamp(p.vx / 12.5, -1, 1);   // (drawn a third larger than life, so he reads)
    if (this.arrived) {                                   // at the hut: the sled stands empty and he faces you
      const k = 1 - Math.max(0, this.arrive) / ARRIVE_T, pal = this.s.gold ? PAL.gold : PAL.ice;
      ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.ellipse(x - 46 * u, y + 2, 44 * u, 8 * u, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x - 46 * u, y); ctx.scale(u, u); drawSled(ctx, pal); ctx.restore();
      ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.ellipse(x + 34 * u, y + 2, 34 * u, 7 * u, 0, 0, Math.PI * 2); ctx.fill();
      drawIcemanFront(ctx, x + 34 * u, y, 104 * u, 0.5 + k * 1.5, k, this.s.gold, this.s.glowSprite('rgba(255,255,255,0.9)'));
      return;
    }
    const shrink = 1 / (1 + p.y * 0.25);
    ctx.fillStyle = this.sky.shade; ctx.beginPath(); ctx.ellipse(x, y + 2, 46 * u * shrink, 9 * u * shrink, 0, 0, Math.PI * 2); ctx.fill();
    // snow spray from the runners
    if (p.tumble <= 0 && !p.air) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 6; i++) { const a = hash(i + Math.floor(this.t * 30) * 7); ctx.beginPath(); ctx.arc(x + ((i % 2 ? 1 : -1) * (26 + a * 22) - lean * 26) * u, y + (4 - a * 18) * u, (2 + a * 5) * u, 0, Math.PI * 2); ctx.fill(); } }
    ctx.save(); ctx.translate(x, y - up);
    if (p.tumble > 0) { ctx.translate(0, -26 * u - Math.abs(Math.sin(p.spin)) * 26 * u); ctx.rotate(p.spin); ctx.translate(0, 26 * u); }
    else if (p.air === 'ramp') { const c = Math.cos(p.rot); ctx.rotate(Math.sin(p.rot) * 0.18); ctx.scale(Math.abs(c) < 0.18 ? 0.18 * (c < 0 ? -1 : 1) : c, 1); }
    else ctx.rotate(lean * 0.22);
    if (p.safe > 0 && p.tumble <= 0 && Math.floor(this.t * 14) % 2) ctx.globalAlpha = 0.45;
    ctx.scale(u, u);
    drawIcemanSled(ctx, { t: this.t, lean, tuck: p.tuck && !p.air, grab: p.air === 'ramp' && p.tuck, air: !!p.air, boost: p.boost > 0 }, this.s.gold ? PAL.gold : PAL.ice);
    ctx.restore();
    if (p.boost > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { const a = hash(i + Math.floor(this.t * 20) * 3), lx = x + (a - 0.5) * 150 * u; ctx.beginPath(); ctx.moveTo(lx, y - up - 20 * u); ctx.lineTo(lx, y - up + 60 * u * a + 30); ctx.stroke(); } }
  }

  drawHud(ctx) {
    const sim = this.sim, p = sim.p;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (this.bonus) {
      ctx.fillStyle = 'rgba(8,16,36,0.55)'; roundRect(ctx, W / 2 - 110, 12, 220, 30, 15); ctx.fill();
      ctx.fillStyle = '#a5f3fc'; ctx.font = '800 15px system-ui, sans-serif'; ctx.fillText('★ CRYSTAL RUSH ★', W / 2, 28);
      return;
    }
    // how far ahead of the avalanche you are
    const x0 = 16, w = W - 32, lead = clamp(sim.gap / MAX_GAP, 0, 1), danger = sim.gap < 22;
    ctx.fillStyle = 'rgba(8,16,36,0.55)'; roundRect(ctx, x0, 12, w, 30, 15); ctx.fill();
    ctx.fillStyle = danger && Math.floor(this.t * 6) % 2 ? '#fecaca' : '#ffffff'; roundRect(ctx, x0 + 4, 16, 92 + (w - 190) * (1 - lead), 22, 11); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('AVALANCHE', x0 + 12, 28);
    const sx = x0 + w - 24;
    ctx.fillStyle = this.s.gold ? '#fbbf24' : '#8fd3f0'; ctx.beginPath(); ctx.arc(sx, 27, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = danger ? '#fca5a5' : '#e0f2fe'; ctx.textAlign = 'right'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillText(`${Math.max(0, Math.round(sim.gap))} m`, sx - 14, 28);
    // how far to the hut, with the flag marked
    const frac = clamp(p.z / this.slope.len, 0, 1);
    ctx.fillStyle = 'rgba(8,16,36,0.45)'; roundRect(ctx, x0, 48, w, 8, 4); ctx.fill();
    ctx.fillStyle = '#86efac'; roundRect(ctx, x0, 48, Math.max(8, w * frac), 8, 4); ctx.fill();
    ctx.fillStyle = sim.flagged ? '#86efac' : '#fde047'; ctx.fillRect(x0 + w * (this.slope.flagZ / this.slope.len) - 1.5, 45, 3, 14);
    ctx.fillStyle = '#e0f2fe'; ctx.textAlign = 'left'; ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`Hut ${Math.max(0, Math.round(this.slope.len - p.z))} m`, x0 + 2, 70);
    ctx.textAlign = 'right'; ctx.fillText(`${Math.round(p.v * 3.6)} km/h${p.tuck ? ' · TUCK' : ''}`, x0 + w - 2, 70);
  }

  drawButtons(ctx) {
    const C = this.ctl, on = this.btnOn;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [k, label] of [['left', '◀'], ['right', '▶'], ['tuck', 'TUCK'], ['jump', 'JUMP']]) {
      const b = C[k];
      ctx.fillStyle = on[k] ? 'rgba(56,189,248,0.85)' : 'rgba(30,58,95,0.6)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = k === 'tuck' || k === 'jump' ? `800 ${k === 'jump' ? 17 : 14}px system-ui, sans-serif` : '800 28px system-ui, sans-serif'; ctx.fillText(label, b.x, b.y + 1);
    }
  }
}

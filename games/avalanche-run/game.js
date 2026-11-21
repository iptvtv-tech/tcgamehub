// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — Zone 6 · game 2 (the ice kingdom). Built in sections for review.
//
//  REBUILT SIDE-ON on 21 Nov 2026 (the owner: "make it really look a downhill slope … remove most
//  obstacles and make more jumps and tricks … when the avalanche catches the player it swallows up
//  the entire screen"). You see the mountain from the side. The snow falls away to the right, the
//  Iceman sleds down it, and the avalanche is the white wall on the left of the picture, always.
//
//  Kickers throw the sled into the air: hold ◀ for a backflip or ▶ for a front flip, and let go so
//  the sled levels itself before it lands (a flat landing gives a burst of speed, a crooked one is
//  a tumble). TUCK is faster on the snow and a grab in the air. JUMP hops over rocks and narrow
//  cracks. Wide crevasses have a kicker at the edge.
//
//  A tumble costs ground, never a life. The avalanche or a crevasse costs a life, and you start
//  again from the flag halfway down. Fifteen runs; runs 5 and 10 are crystal rushes.
//
//  The rules live in world.js (pure, shared with check.mjs, test.mjs and bench.mjs). This file is
//  input, camera, drawing, sound and points. Tunes and sounds are in sfx.js.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { SlopeSim, makeSlope, snowAt, gradeAt, MAX_GAP, SLASH_T, YETI_H, BONUS_LEVELS, FINAL_LEVEL } from './world.js';
import { drawIcemanFront, drawYeti, PAL } from './art.js';
import { drawIceman, drawSlashArc } from '../magma-escape/art.js';
import { MUSIC, tuneFor, makeSfx } from './sfx.js';

const ID = 'avalanche-run';
const W = 480, H = 720;
const OX = W * 0.34;                 // where the sled sits across the picture (how far down depends on the picture's height: see Y)
const ARRIVE_T = 1.7;                // seconds at the hut: the Iceman steps off and turns to face you
const SWALLOW_T = 0.6;               // seconds for the avalanche to roll over the whole picture (the engine puts you back 0.9 s after a lost life)
const PANEL = 96;                    // height of the touch buttons when they sit on the picture
const TAU = Math.PI * 2;
const SLASH_KEYS = new Set(['KeyX', 'KeyJ', 'KeyK', 'KeyC']);      // (the same keys as Magma Escape)

const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
/** Smooth hills from the hash: 0..1. */
const hills = (u, seed) => { const i = Math.floor(u), k = (1 - Math.cos((u - i) * Math.PI)) / 2; return lerp(hash(i * 7 + seed), hash(i * 7 + 7 + seed), k); };

// The time of day changes down the mountain.
const SKIES = {
  day:   { sky: ['#2f7fd6', '#8cc8f5', '#dff1ff'], far: ['#a9c6e3', '#c6dbee'], near: ['#7fa6cc', '#9dbfdd'], snow: ['#ffffff', '#cfe1f2', '#9dbcdb'], pine: ['#1f5132', '#2f6b43'], line: '#e8f4ff' },
  dusk:  { sky: ['#32356f', '#c0688f', '#ffc08a'], far: ['#a07a9d', '#c79ab0'], near: ['#6d5587', '#8a6c9c'], snow: ['#fff3ea', '#e6c9d6', '#b493b4'], pine: ['#27413a', '#35584a'], line: '#fff6ee' },
  storm: { sky: ['#56657c', '#8998ae', '#c2ccd9'], far: ['#98a4b6', '#aeb9c8'], near: ['#76839a', '#8b98ad'], snow: ['#eef2f7', '#c4cfdd', '#97a6ba'], pine: ['#22392f', '#2e4a3c'], line: '#f5f8fb' },
  night: { sky: ['#060a1c', '#13224d', '#2b4783'], far: ['#22305a', '#2c3e70'], near: ['#17244a', '#1f2f5c'], snow: ['#c9d8f2', '#8ea3cd', '#5a6fa3'], pine: ['#10261f', '#173529'], line: '#dfe9fb' },
};
const skyFor = (level) => (level === 13 || level === 14 ? SKIES.storm : level >= 11 ? SKIES.night : level >= 6 ? SKIES.dusk : SKIES.day);

const LEVEL_INFO = {
  1: 'Ride the kickers into the air. Hold ◀ to backflip, and let go before you land.',
  2: 'Rocks: JUMP hops over them. Hold TUCK to go faster. Bigger kickers, more air.',
  3: 'A crevasse! The kicker at its edge carries you over. Keep your speed up.',
  4: 'A yeti! Swing your sword at it (SWORD, or X), or land on its head. Cut its snowballs out of the air too.',
  6: 'Cracks in the snow: JUMP them, or you are gone.',
  7: 'Two flips off one kicker score far more than two single flips. Try the huge kickers.',
  9: 'Rocks come in pairs now: jump, land, jump.',
  11: 'Night run. The avalanche is faster than ever.',
  13: 'Storm on the mountain. Land your tricks for speed.',
  15: 'The last run. Outrun the mountain.',
};

let tune = MUSIC.slope;              // the tune of the run in play (sfx.js)

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
  get music() { return tune; },                             // (the engine re-applies this after a pause, so it follows the run's tune)
  levelName: 'Run',
  levelTitle: (level) => `Run ${level}`,
  clearText: 'SAFE IN THE HUT!',
  levelInfo: (level, bonus) => (bonus ? '★ Crystal rush! No avalanche: kickers and crystals for 20 seconds.' : LEVEL_INFO[level] || 'Steeper, faster, and the avalanche with it.'),
  titleHint: 'A tumble costs you ground, not a life. Only the avalanche or a crevasse can take a life.',
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
    this.t = 0; this.flakes = []; this.chunks = []; this.spray = [];
    this.sprites = new Map(); this.rockArt = [0, 1, 2].map(rockSprite);
    this.touchSeen = false; this.btnOn = { left: false, right: false, tuck: false, jump: false, sword: false }; this.swing = false;
    this.layout();
    const playing = () => s.state === 'playing';
    s.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !this.touchSeen) { this.touchSeen = true; this.layout(); }
      if (e.pointerType === 'mouse' && e.button === 0 && playing()) this.swing = true;       // a mouse click swings the sword
    });
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || !SLASH_KEYS.has(e.code) || !playing()) return;
      e.preventDefault(); if (!e.repeat) this.swing = true;
    });
    for (let i = 0; i < 60; i++) this.flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, v: 0.4 + Math.random() });
    this.sfx = makeSfx(s.sound); this.swallowT = SWALLOW_T;
    this.boot = true; this.startLevel(1, false); this.boot = false;      // (the title screen does not start the tune)
  }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.slope = makeSlope(level, this.s.rng, bonus);
    this.sim = new SlopeSim(this.slope);
    this.sky = bonus ? SKIES.dusk : skyFor(level);
    this.storm = !bonus && this.sky === SKIES.storm; this.night = !bonus && this.sky === SKIES.night;
    this.paid = 0; this.chunks = []; this.spray = []; this.livesAtStart = this.s.lives; this.arrive = 0; this.arrived = false;
    this.swallow = -1; this.clearing = 0; this.snapCamera();
    // the run's tune (it starts here on every run but the title screen's)
    tune = tuneFor(level, bonus); this.bpm = 0; this.loopT = 0;
    if (!this.boot && this.s.sound.musicOn) this.s.sound.startMusic(tune);
  }
  onLifeLost() {
    this.sim.reset(); this.paid = Math.floor(this.sim.p.x / 100); this.chunks = []; this.spray = []; this.snapCamera();
    if (this.swallow >= 0) { this.swallow = -1; this.clearing = 1; }     // the white clears off the picture
  }
  onAction() { /* the controls are read each step (keys and touch) */ }
  snapCamera() { const p = this.sim.p; this.cx = p.x; this.cy = p.y; this.zoom = 12.5; }

  // ── Layout and input ─────────────────────────────────────────
  touchUI() { return this.s.coarse || this.touchSeen; }
  layout() {
    const band = this.s.bands?.bottom || 0, inBand = band >= 150;
    const cy = inBand ? H + band * 0.5 : H - PANEL / 2, r = inBand ? 46 : 40;
    // kept 30 px clear of the screen's side edges: iPhones start their own swipes there
    const lx = 30 + r, jx = W - 30 - (r + 4);
    this.ctl = { left: { x: lx, y: cy, r }, right: { x: lx + r * 2 + 10, y: cy, r }, tuck: { x: jx - (r + 4) - (r - 4) - 10, y: cy + 8, r: r - 4 }, jump: { x: jx, y: cy - 4, r: r + 4 } };
    // the sword sits above TUCK and JUMP, between the two, on the bottom of the picture
    this.ctl.sword = { x: jx - r - 2, y: cy - 4 - (r + 4) - (r - 6) - 12, r: r - 6 };
  }
  onBandsChange() { this.layout(); }
  /** Which buttons fingers rest on: each finger presses the button it is nearest to. (The engine keeps
   *  its finger list honest on phones: a finger whose lift was never reported is let go. See touch.js.) */
  buttons() {
    const on = { left: false, right: false, tuck: false, jump: false, sword: false }, C = this.ctl;
    for (const q of this.s.input.pointers.values()) {
      let best = null, bd = 1e9;
      for (const k of ['left', 'right', 'tuck', 'jump', 'sword']) { const b = C[k], d = Math.hypot(q.x - b.x, q.y - b.y); if (d < b.r + 24 && d - b.r < bd) { bd = d - b.r; best = k; } }
      if (best) on[best] = true;
    }
    return on;
  }
  readInput() {
    const i = this.s.input, tb = this.btnOn = this.touchUI() ? this.buttons() : { left: false, right: false, tuck: false, jump: false, sword: false };
    const left = i.isDown('left') || tb.left, right = i.isDown('right') || tb.right;
    const slash = this.swing || tb.sword; this.swing = false;         // (a key or a click is one swing; a finger swings once per press)
    return { dir: (right ? 1 : 0) - (left ? 1 : 0), tuck: i.isDown('down') || tb.tuck, jump: i.isDown('up') || i.isDown('action') || tb.jump, slash };
  }

  // ── Play ─────────────────────────────────────────────────────
  update(dt) {
    const s = this.s, sim = this.sim, p = sim.p, L = this.level;
    this.t += dt;
    if (this.clearing > 0) this.clearing -= dt * 2.2;
    if (this.arrived) {                                   // at the hut
      this.drift(dt);
      if (this.arrive > 0 && (this.arrive -= dt) <= 0) s.completeLevel();
      return;
    }
    const events = sim.step(this.readInput(), dt);
    this.camera(dt);
    const sx = OX, sy = this.Y(p.y) - 30;
    for (const e of events) {
      if (e.type === 'tumble') {
        s.resetCombo(); this.sfx.tumble(); s.fx.shake(7, 0.25);
        s.fx.text(sx + 40, sy - 50, e.bad ? 'BAD LANDING!' : e.by === 'ball' ? 'SNOWBALL!' : e.by === 'yeti' ? 'YETI!' : 'TUMBLE!', { color: '#fca5a5', size: 26 });
        s.fx.burst(sx, sy + 20, { colors: ['#ffffff', '#dbeafe'], count: 22, speed: 220 });
      } else if (e.type === 'crystal') {
        s.award(6 * L, this.X(e.c.x), this.Y(e.c.y) - 14, { chain: true, color: '#a5f3fc', size: 16 });
        this.sfx.crystal(s.comboCount);
      } else if (e.type === 'slash') {
        this.sfx.slash();
      } else if (e.type === 'slain') {
        s.award(150 * L, this.X(e.y.x), this.Y(snowAt(this.slope, e.y.x)) - 60, { chain: true, color: '#fde047', size: 26 });
        s.fx.text(W / 2, 230, 'YETI CUT DOWN!', { color: '#fef9c3', size: 24, life: 1.2 });
        s.fx.burst(this.X(e.y.x), this.Y(snowAt(this.slope, e.y.x)) - 30, { colors: ['#ffffff', '#dbeafe', '#a5f3fc'], count: 30, speed: 280 });
        this.sfx.stomp(); s.fx.shake(6, 0.2);
        if (sim.slain >= 3) s.unlock('wolves');
      } else if (e.type === 'stomp') {
        s.award(200 * L, sx, sy - 40, { chain: true, color: '#fde047', size: 26 });
        s.fx.text(W / 2, 230, 'YETI FLATTENED!', { color: '#fef9c3', size: 24, life: 1.2 });
        this.sfx.stomp(); s.fx.shake(6, 0.2); s.unlock('yeti');
      } else if (e.type === 'parry') {
        s.award(30 * L, this.X(e.b.x), this.Y(e.b.y) - 10, { chain: true, color: '#a5f3fc', size: 18 });
        s.fx.burst(this.X(e.b.x), this.Y(e.b.y), { colors: ['#ffffff', '#dbeafe'], count: 16, speed: 240 }); this.sfx.parry();
      } else if (e.type === 'throw') {
        this.sfx.roar(false); this.sfx.throwIt();
      } else if (e.type === 'thud') {
        this.sfx.thud(); s.fx.burst(this.X(e.b.x), this.Y(e.b.y), { colors: ['#ffffff', '#dbeafe'], count: 10, speed: 120 });
      } else if (e.type === 'launch') {
        this.sfx.launch();
      } else if (e.type === 'hop') {
        this.sfx.hop();
      } else if (e.type === 'cleared') {
        this.sfx.cleared();
        s.award(8 * L, sx, sy - 30, { chain: true, color: '#7dd3fc', size: 18 });
      } else if (e.type === 'trick') {
        const n = e.flips, pts = (n * 80 + n * (n - 1) * 40 + (e.grab ? 40 : 0)) * L, flip = e.back ? 'BACKFLIP' : 'FRONT FLIP';
        const name = `${n >= 4 ? 'QUAD ' + flip : n === 3 ? 'TRIPLE ' + flip : n === 2 ? 'DOUBLE ' + flip : n === 1 ? flip : ''}${n && e.grab ? ' + ' : ''}${e.grab ? 'GRAB' : ''}`;
        s.award(pts, sx, sy - 40, { chain: true, color: '#fde047', size: 24 });
        s.fx.text(W / 2, 230, `${name}!`, { color: '#fef9c3', size: 24, life: 1.2 });
        s.fx.burst(sx, sy + 26, { colors: ['#ffffff', '#fde047'], count: 26, speed: 260 });
        this.sfx.land(); this.sfx.trick(n);
        if (n >= 2) s.unlock('trickster');
        if (n >= 3) s.unlock('giant');
      } else if (e.type === 'land') {
        this.sfx.land();
        s.fx.burst(sx, sy + 28, { colors: ['#ffffff', '#dbeafe'], count: 12, speed: 160 });
      } else if (e.type === 'fell') {
        s.fx.flash('#0b1b3a'); s.fx.shake(10, 0.4); this.sfx.fell();
        s.fx.text(W / 2, 260, 'INTO THE CREVASSE!', { color: '#bae6fd', size: 24 });
        return s.hurt();
      } else if (e.type === 'flag') {
        this.sfx.flag(); s.fx.text(W / 2, 230, 'HALFWAY FLAG!', { color: '#fde047', size: 26, life: 1.3 });
      } else if (e.type === 'hut') {
        s.award(100 * L, W / 2, 260, { color: '#86efac', size: 24 });
        if (sim.tumbles === 0 && s.lives >= this.livesAtStart) { s.award(300 * L, W / 2, 310, { color: '#fde047', size: 22 }); s.unlock('clean'); }
        s.unlock('first');
        if (L >= FINAL_LEVEL) s.unlock('outrun');
        this.sfx.hut();
        this.arrive = ARRIVE_T; this.arrived = true;      // he steps off and turns round; the run is cleared when that is over
        return;
      } else if (e.type === 'caught') {
        this.swallow = 0; s.fx.shake(14, 0.8); this.sfx.caught();      // the avalanche rolls over the whole picture (idle() runs it)
        return s.hurt();
      }
    }
    // a little for every 100 m ridden
    const hundreds = Math.floor(p.x / 100);
    if (hundreds > this.paid) { this.paid = hundreds; s.award(10 * L, W - 70, 120, { color: '#e0f2fe', size: 16 }); }
    this.soundscape(dt);
    // snow off the runners, and the avalanche's breath on your neck
    if (!p.air && p.tumble <= 0 && Math.random() < 0.6) this.spray.push({ x: p.x - 1.2, y: p.y + 0.1, vx: -2 - Math.random() * 5, vy: 1.5 + Math.random() * 4, r: 0.12 + Math.random() * 0.22, life: 0.5 });
    if (!this.bonus) {
      const near = clamp(1 - sim.gap / 12, 0, 1);
      if (near > 0.3 && Math.random() < 0.1) s.fx.shake(1 + near * 4, 0.15);
    }
    this.drift(dt);
  }
  /** The sounds that never stop: runners on the snow, the wind, the avalanche behind you; and the
   *  tune's tempo, which rises as the avalanche closes in. */
  soundscape(dt) {
    const s = this.s, sim = this.sim, p = sim.p, k = clamp(p.v / 40, 0, 1), near = this.bonus ? 0 : clamp(1 - sim.gap / MAX_GAP, 0, 1);
    this.loopT += dt;
    const beat = Math.floor(this.loopT / 0.13), was = Math.floor((this.loopT - dt) / 0.13);
    if (beat === was) return;
    if (!p.air && p.tumble <= 0) this.sfx.runners(k);
    if (beat % 2 === 0 && (p.tuck || p.boost > 0 || p.air)) this.sfx.wind(k);
    if (beat % 3 === 0 && near > 0.05) this.sfx.rumble(near);
    if (this.storm && beat % 9 === 0) this.sfx.blizzard();
    const bpm = tune.bpm * (1 + (this.level - 1) * 0.012) * (1 + 0.2 * near * near);
    if (Math.abs(bpm - this.bpm) > 1.5) { this.bpm = bpm; s.sound.setTempo(bpm); }
  }
  /** Between plays (title, a lost life, banners): the snow keeps falling, and a swallowing avalanche keeps rolling. */
  idle(dt) {
    this.t += dt;
    if (this.swallow >= 0) this.swallow += dt;
    if (this.clearing > 0) this.clearing -= dt * 2.2;
    this.drift(dt);
  }
  /** Falling snow and flying spray (for the eye only). */
  drift(dt) {
    const v = this.sim.p.v;
    for (const f of this.flakes) { f.y += (40 + v * 3) * f.v * dt; f.x -= (20 + v * 9) * f.v * dt; if (f.y > H + 10 || f.x < -10) { if (Math.random() < 0.5) { f.y = -10; f.x = Math.random() * (W + 200); } else { f.x = W + 10; f.y = Math.random() * H; } } }
    for (const c of this.spray) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy -= 14 * dt; c.life -= dt; }
    if (this.spray.length) this.spray = this.spray.filter((c) => c.life > 0);
  }
  /** The camera rides with the sled: it pulls back as the sled speeds up and when it is in the air. */
  camera(dt) {
    const p = this.sim.p, snow = snowAt(this.slope, p.x), up = Math.max(0, p.y - snow);
    const want = clamp(13.2 - (p.v - 14) * 0.11 - Math.min(4.5, up * 0.3), 6.6, 13.2);
    this.zoom += (want - this.zoom) * Math.min(1, 2.5 * dt);
    this.cx = p.x;
    this.cy += (snow + up * 0.55 - this.cy) * Math.min(1, 9 * dt);
  }
  X(x) { return (x - this.cx) * this.zoom + OX; }
  get oy() { return (H + (this.s.bands?.bottom || 0)) * 0.46; }
  Y(y) { return (this.cy - y) * this.zoom + this.oy; }

  // ── Drawing ──────────────────────────────────────────────────
  pine(v) {
    const key = this.sky.pine[0] + v;
    if (!this.sprites.has(key)) this.sprites.set(key, pineSprite(this.sky.pine, v));
    return this.sprites.get(key);
  }

  render(ctx) {
    const s = this.s, sim = this.sim, p = sim.p, sl = this.slope, sky = this.sky, Z = this.zoom;
    const bottom = H + (s.bands?.bottom || 0);
    const x0 = Math.floor(this.cx - OX / Z) - 2, x1 = Math.ceil(this.cx + (W - OX) / Z) + 2;
    let g;
    this.drawBackdrop(ctx, bottom);

    // pines on the ridge behind the run (for the eye only: nothing on the run itself is a tree)
    for (let i = Math.floor((x0 - 6) / 7); i * 7 < x1 + 6; i++) {
      const h = hash(i * 13 + 5); if (h < 0.3) continue;
      const x = i * 7 + h * 5, size = (3.2 + hash(i * 3 + 1) * 2.6) * Z, img = this.pine(i % 3), px = this.X(x), py = this.Y(snowAt(sl, x)) + 6;
      ctx.globalAlpha = 0.55; ctx.drawImage(img, px - size * 0.3, py - size, size * 0.6, size); ctx.globalAlpha = 1;
    }

    // the snow, with the crevasses cut out of it
    const fill = (a, b) => {
      if (b <= a) return;
      g = ctx.createLinearGradient(0, this.Y(snowAt(sl, (a + b) / 2)), 0, this.Y(snowAt(sl, (a + b) / 2)) + 260);
      g.addColorStop(0, sky.snow[0]); g.addColorStop(0.25, sky.snow[1]); g.addColorStop(1, sky.snow[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(this.X(a), bottom + 2);
      for (let x = a; x < b; x += 1) ctx.lineTo(this.X(x), this.Y(snowAt(sl, x)));
      ctx.lineTo(this.X(b), this.Y(snowAt(sl, b))); ctx.lineTo(this.X(b), bottom + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = sky.line; ctx.lineWidth = 3; ctx.beginPath();
      for (let x = a; x < b; x += 1) { const X = this.X(x), Y = this.Y(snowAt(sl, x)); if (x === a) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
      ctx.lineTo(this.X(b), this.Y(snowAt(sl, b))); ctx.stroke();
    };
    let from = x0;
    for (const c of sl.gaps) {
      if (c.x + c.w < x0 || c.x > x1) continue;
      fill(from, c.x); this.drawGap(ctx, c, bottom); from = c.x + c.w;
    }
    fill(from, x1);

    // wind-streaks in the deep snow, parallel to the surface (they slide by, so you feel the speed)
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (const [depth, every, seed] of [[3.2, 9, 1], [7.5, 13, 2], [13, 17, 3], [20, 23, 4]]) {
      for (let i = Math.floor(x0 / every); i * every < x1; i++) {
        const h = hash(i * 11 + seed * 101); if (h < 0.35) continue;
        const a = i * every + h * 3, b = a + 2.5 + h * 4;
        if (sl.gaps.some((c) => b > c.x - 1 && a < c.x + c.w + 1)) continue;
        ctx.beginPath(); ctx.moveTo(this.X(a), this.Y(snowAt(sl, a) - depth)); ctx.lineTo(this.X(b), this.Y(snowAt(sl, b) - depth)); ctx.stroke();
      }
    }
    // the sled's track in the snow behind it
    if (!p.air) { ctx.strokeStyle = 'rgba(120,150,190,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); for (let x = Math.max(x0, p.x - 14); x <= p.x; x += 1) { const X = this.X(x), Y = this.Y(snowAt(sl, x)) + 3; if (x <= Math.max(x0, p.x - 14)) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke(); }

    for (const k of sl.kickers) if (k.x > x0 - 2 && k.x - k.L < x1) this.drawKicker(ctx, k);
    if (sl.flagX > x0 && sl.flagX < x1) this.drawFlag(ctx, sl.flagX, sim.flagged);
    if (!this.bonus && sl.len > x0 - 12 && sl.len < x1 + 12) this.drawHut(ctx, sl.len + 5);
    for (const r of sl.rocks) if (r.x > x0 && r.x < x1) this.drawRock(ctx, r);
    for (const y of sl.yetis) if (y.x > x0 - 3 && y.x < x1 + 3) this.drawYetiAt(ctx, y);
    for (const b of sim.balls) { const X = this.X(b.x), Y = this.Y(b.y), r = 0.75 * Z; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill(); ctx.fillStyle = '#cfe0f0'; ctx.beginPath(); ctx.arc(X + r * 0.25, Y + r * 0.25, r * 0.55, 0, TAU); ctx.fill(); ctx.strokeStyle = '#7f9cc0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke(); }
    for (const c of sl.crystals) if (!c.got && c.x > x0 && c.x < x1) this.drawCrystal(ctx, c);

    ctx.fillStyle = '#ffffff';
    for (const c of this.spray) { ctx.globalAlpha = clamp(c.life * 2.2, 0, 1); ctx.beginPath(); ctx.arc(this.X(c.x), this.Y(c.y), c.r * Z, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    this.drawSled(ctx);
    if (!this.bonus) this.drawAvalanche(ctx, bottom);

    // falling snow, streaming back up the hill
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const f of this.flakes) { ctx.beginPath(); ctx.arc(f.x, f.y * bottom / H, f.r, 0, TAU); ctx.fill(); }
    if (p.boost > 0 || p.tuck) this.drawSpeedLines(ctx);
    if (this.night) {                                      // the dark closes in at the edges of the picture
      g = ctx.createRadialGradient(OX + 60, this.oy, 150, OX + 60, this.oy, 520);
      g.addColorStop(0, 'rgba(4,8,24,0)'); g.addColorStop(1, 'rgba(4,8,24,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, bottom);
    }
    if (this.swallow >= 0 || this.clearing > 0) this.drawSwallow(ctx, bottom);
    this.drawHud(ctx);
    if (this.touchUI()) this.drawButtons(ctx);
  }

  /** The sky and two far ridges. The ridges run downhill like the run itself and slide back up the
   *  hill as you go, so the whole picture says "down". */
  drawBackdrop(ctx, bottom) {
    const sky = this.sky, tilt = this.slope.R.grade * 0.55;
    let g = ctx.createLinearGradient(0, 0, 0, bottom);
    g.addColorStop(0, sky.sky[0]); g.addColorStop(0.55, sky.sky[1]); g.addColorStop(1, sky.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, bottom);
    if (this.night) { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 50; i++) { const a = hash(i * 31 + 3), b = hash(i * 17 + 9); ctx.globalAlpha = 0.3 + 0.6 * hash(i + Math.floor(this.t * 2 + a * 9)); ctx.fillRect(a * W, b * 420, 1.6, 1.6); } ctx.globalAlpha = 1; }
    if (!this.storm) { ctx.fillStyle = this.night ? '#f1f5ff' : this.sky === SKIES.dusk ? '#ffe2b0' : '#fffbe0'; ctx.beginPath(); ctx.arc(W - 86, 96, this.night ? 22 : 30, 0, TAU); ctx.fill(); }
    const ridge = (col, par, base, amp, wave, seed, pines) => {
      const off = this.cx * par * 12;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-10, bottom + 2);
      for (let sx = -10; sx <= W + 10; sx += 10) ctx.lineTo(sx, base + (sx - OX) * tilt - amp * hills((sx + off) / wave, seed) - amp * 0.35 * hills((sx + off) / (wave * 0.31), seed + 40));
      ctx.lineTo(W + 10, bottom + 2); ctx.closePath(); ctx.fill();
      if (!pines) return;
      ctx.fillStyle = this.sky.pine[0]; ctx.globalAlpha = 0.5;
      for (let i = Math.floor((off - 20) / 23); i * 23 < off + W + 20; i++) {
        if (hash(i * 9 + seed) < 0.35) continue;
        const sx = i * 23 - off + hash(i + seed) * 12, y = base + (sx - OX) * tilt - amp * hills((sx + off) / wave, seed) - amp * 0.35 * hills((sx + off) / (wave * 0.31), seed + 40) + 4, h = 12 + hash(i * 5 + seed) * 12;
        ctx.beginPath(); ctx.moveTo(sx, y - h); ctx.lineTo(sx + h * 0.32, y); ctx.lineTo(sx - h * 0.32, y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    ridge(sky.far[1], 0.06, 300, 190, 190, 11, false);
    ridge(sky.far[0], 0.14, 350, 120, 140, 23, false);
    ridge(sky.near[1], 0.3, 400, 90, 110, 37, true);
    ridge(sky.near[0], 0.5, 455, 70, 90, 51, true);
  }

  /** Streaks along the slope when the sled is flying along. */
  drawSpeedLines(ctx) {
    const tilt = this.slope.R.grade;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = hash(i * 11 + Math.floor(this.t * 14) * 5), b = hash(i * 7 + Math.floor(this.t * 14) * 3), x = a * W, y = 120 + b * 420, len = 50 + a * 70;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y - len * tilt); ctx.stroke();
    }
  }

  /** A crevasse or a crack: dark depths between two walls of blue ice, red poles at the near edge. */
  drawGap(ctx, c, bottom) {
    const sl = this.slope, ax = this.X(c.x), ay = this.Y(snowAt(sl, c.x)), bx = this.X(c.x + c.w), by = this.Y(snowAt(sl, c.x + c.w));
    const g = ctx.createLinearGradient(0, ay, 0, ay + 320);
    g.addColorStop(0, '#2c5f96'); g.addColorStop(0.35, '#0f2a52'); g.addColorStop(1, '#040a1c');
    ctx.fillStyle = g; ctx.fillRect(ax - 1, Math.min(ay, by) - 2, bx - ax + 2, bottom - Math.min(ay, by) + 4);
    // the ice walls, catching the light at the top
    ctx.fillStyle = '#7fb6dd'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 7, ay + 26); ctx.lineTo(ax + 3, ay + 90); ctx.lineTo(ax, ay + 150); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 8, by + 30); ctx.lineTo(bx - 3, by + 100); ctx.lineTo(bx, by + 170); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8f6ff'; ctx.fillRect(ax - 2, ay - 2, 4, 5); ctx.fillRect(bx - 2, by - 2, 4, 5);
    // poles and a red flag at the near edge
    for (const d of c.crack ? [1.2] : [1.2, 3.4]) {
      const x = c.x - d, X = this.X(x), Y = this.Y(snowAt(sl, x)), h = 2.6 * this.zoom;
      ctx.fillStyle = '#7c2d12'; ctx.fillRect(X - 1.5, Y - h, 3, h);
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(X, Y - h); ctx.lineTo(X + 14, Y - h + 6); ctx.lineTo(X, Y - h + 12); ctx.closePath(); ctx.fill();
    }
    if (c.crack && c.x - this.sim.p.x > 0 && c.x - this.sim.p.x < 30) {
      this.jumpSign(ctx, ax - 8, ay - 3.4 * this.zoom - 10);
    }
  }
  /** A kicker: packed snow with blue chevrons up its face (red at a crevasse) and a flag at the lip. */
  drawKicker(ctx, k) {
    const sl = this.slope, Z = this.zoom, col = k.big ? '#ef4444' : '#38bdf8';
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, Z * 0.22); ctx.lineCap = 'round';
    for (const u of k.L > 12 ? [0.2, 0.36, 0.52, 0.68, 0.84] : k.L > 9 ? [0.25, 0.45, 0.65, 0.85] : k.L > 7 ? [0.35, 0.6, 0.85] : [0.45, 0.8]) {
      const x = k.x - k.L * (1 - u), X = this.X(x), Y = this.Y(snowAt(sl, x)), a = -Math.atan(gradeAt(sl, x));
      ctx.save(); ctx.translate(X, Y + Z * 0.7); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-Z * 0.45, -Z * 0.3); ctx.lineTo(0, 0); ctx.lineTo(-Z * 0.45, Z * 0.3); ctx.stroke(); ctx.restore();
    }
    const X = this.X(k.x), Y = this.Y(snowAt(sl, k.x)), h = (1.6 + k.L * 0.14) * Z;
    // the lip's drop, in shade
    ctx.fillStyle = 'rgba(70,110,160,0.35)'; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(this.X(k.x + 1), this.Y(snowAt(sl, k.x + 1))); ctx.lineTo(X, this.Y(snowAt(sl, k.x + 1)) + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7c2d12'; ctx.fillRect(X - 1.5, Y - h, 3, h);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(X, Y - h); ctx.lineTo(X + 13, Y - h + 5); ctx.lineTo(X, Y - h + 10); ctx.closePath(); ctx.fill();
  }
  drawFlag(ctx, x, got) {
    const X = this.X(x), Y = this.Y(snowAt(this.slope, x)), h = 5 * this.zoom, wave = Math.sin(this.t * 6) * 3;
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(X - 2, Y - h, 4, h);
    ctx.fillStyle = got ? '#22c55e' : '#fde047'; ctx.beginPath(); ctx.moveTo(X + 2, Y - h); ctx.lineTo(X + 34, Y - h + 9 + wave); ctx.lineTo(X + 2, Y - h + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('½', X + 12, Y - h + 10);
  }
  /** The hut at the bottom: a log cabin with a lit window and smoke from the chimney. */
  drawHut(ctx, x) {
    const Z = this.zoom, X = this.X(x), Y = this.Y(snowAt(this.slope, x)) + 3, w = 9 * Z, h = 5 * Z;
    ctx.fillStyle = '#5b3a22'; ctx.fillRect(X, Y - h, w, h);
    ctx.strokeStyle = '#3f2716'; ctx.lineWidth = 1.5; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(X, Y - h * i / 5); ctx.lineTo(X + w, Y - h * i / 5); ctx.stroke(); }
    ctx.fillStyle = '#7c2d12'; ctx.fillRect(X + w * 0.72, Y - h * 1.75, w * 0.12, h * 0.5);
    ctx.fillStyle = '#f8fbff'; ctx.beginPath(); ctx.moveTo(X - w * 0.12, Y - h); ctx.lineTo(X + w * 0.5, Y - h * 1.75); ctx.lineTo(X + w * 1.12, Y - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fde68a'; ctx.fillRect(X + w * 0.56, Y - h * 0.72, w * 0.26, h * 0.36);
    ctx.fillStyle = '#3f2716'; ctx.fillRect(X + w * 0.14, Y - h * 0.68, w * 0.24, h * 0.68);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 4; i++) { const k = (this.t * 0.5 + i / 4) % 1; ctx.globalAlpha = 0.6 * (1 - k); ctx.beginPath(); ctx.arc(X + w * 0.78 + k * 22, Y - h * 1.8 - k * 46, 5 + k * 9, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    // the finish line
    const fx = this.X(this.slope.len), fy = this.Y(snowAt(this.slope, this.slope.len));
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(fx - 2, fy - 5.5 * Z, 4, 5.5 * Z);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#0f172a' : '#ffffff'; ctx.fillRect(fx + 2 + (i % 3) * 9, fy - 5.5 * Z + Math.floor(i / 3) * 9 + (i > 2 ? 0 : 0), 9, 9); }
  }
  drawRock(ctx, r) {
    const Z = this.zoom, X = this.X(r.x), Y = this.Y(snowAt(this.slope, r.x)) + 5, w = 3.3 * Z, h = 2.1 * Z;
    ctx.globalAlpha = r.hit ? 0.45 : 1;
    ctx.drawImage(this.rockArt[r.v % 3], X - w / 2, Y - h, w, h);
    ctx.globalAlpha = 1;
    if (!r.hit && r.x - this.sim.p.x > 0 && r.x - this.sim.p.x < 30 && this.level <= 3) this.jumpSign(ctx, X, Y - h - 12);
  }
  /** A yeti standing on the run (art.js). Cut down, it is a heap of fur. */
  drawYetiAt(ctx, y) {
    const Z = this.zoom, X = this.X(y.x), Y = this.Y(snowAt(this.slope, y.x)) + 4, u = Z * YETI_H * 1.65 / 116;
    ctx.fillStyle = 'rgba(40,70,120,0.25)'; ctx.beginPath(); ctx.ellipse(X, Y, 1.6 * Z, 0.35 * Z, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(X, Y); ctx.scale(u, u);
    drawYeti(ctx, { t: this.t + y.x, arm: clamp((y.arm || 0) * 2, 0, 1), flat: !!y.down });
    ctx.restore();
    if (!y.down && y.x - this.sim.p.x > 0 && y.x - this.sim.p.x < 32 && this.level <= 7) this.jumpSign(ctx, X, Y - YETI_H * 1.65 * Z - 14, "SWORD!");
  }
  jumpSign(ctx, x, y, word = 'JUMP!') {
    ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.strokeText(word, x, y);
    ctx.fillStyle = '#dc2626'; ctx.fillText(word, x, y);
  }
  drawCrystal(ctx, c) {
    const X = this.X(c.x), Y = this.Y(c.y) + Math.sin(this.t * 4 + c.x) * 2, r = 0.62 * this.zoom;
    ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.moveTo(X, Y - r * 1.35); ctx.lineTo(X + r, Y); ctx.lineTo(X, Y + r * 1.35); ctx.lineTo(X - r, Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cffafe'; ctx.beginPath(); ctx.moveTo(X, Y - r * 1.35); ctx.lineTo(X + r, Y); ctx.lineTo(X, Y - r * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0e7490'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y - r * 1.35); ctx.lineTo(X + r, Y); ctx.lineTo(X, Y + r * 1.35); ctx.lineTo(X - r, Y); ctx.closePath(); ctx.stroke();
  }

  /** The Iceman on his sled, seen from the side. He is Magma Escape's own drawing (imported), so the
   *  two games cannot drift apart; the sled is drawn here. */
  drawSled(ctx) {
    const p = this.sim.p, Z = this.zoom, x = this.X(p.x), y = this.Y(p.y), pal = this.s.gold ? PAL.gold : PAL.ice, u = Z / 12;
    if (this.swallow >= 0) return;                         // (under the snow)
    if (this.arrived) {                                   // at the hut: the sled stands empty and he faces you
      const k = 1 - Math.max(0, this.arrive) / ARRIVE_T;
      ctx.save(); ctx.translate(x - 30 * u, y); ctx.rotate(-p.rot); this.sledShape(ctx, u, pal); ctx.restore();
      drawIcemanFront(ctx, x + 26 * u, y + 2, 54 * u, 0.5 + k * 1.5, k, this.s.gold, this.s.glowSprite('rgba(255,255,255,0.9)'));
      return;
    }
    // his shadow on the snow under him
    const snow = this.Y(snowAt(this.slope, p.x)), up = Math.max(0, snow - y), shrink = 1 / (1 + up / 90);
    if (!this.slope.gaps.some((c) => p.x > c.x && p.x < c.x + c.w)) { ctx.fillStyle = 'rgba(40,70,120,0.25)'; ctx.save(); ctx.translate(x, snow + 2); ctx.rotate(-Math.atan(gradeAt(this.slope, p.x))); ctx.beginPath(); ctx.ellipse(0, 0, 26 * u * shrink, 5 * u * shrink, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.translate(x, y);
    if (p.tumble > 0) { ctx.translate(0, -16 * u); ctx.rotate(p.spin); ctx.translate(0, 16 * u); }
    else ctx.rotate(-p.rot);
    if (p.safe > 0 && p.tumble <= 0 && Math.floor(this.t * 14) % 2) ctx.globalAlpha = 0.45;
    const low = p.tuck ? 0.8 : 1;
    this.sledShape(ctx, u, pal);
    ctx.save(); ctx.translate(-2 * u, -7 * u); ctx.scale(1, low);
    drawIceman(ctx, { x: 0, y: 0, k: 0.86 * u, stage: 3, face: 1, mode: p.air ? (p.vy > 0 ? 'jump' : 'fall') : 'idle', phase: 0, t: this.t, slash: p.atk > 0 ? { kind: 'side', k: 1 - p.atk / SLASH_T } : null, hurt: p.tumble > 0 ? 1 : 0, blinkOut: false, heat: 0, land: 0 }, this.s.gold ? PAL.gold : PAL.ice, null);
    if (p.atk > 0) drawSlashArc(ctx, 0, 0, 1, { slash: { kind: 'side', k: 1 - p.atk / SLASH_T } }, 0.86 * u * 1.5);
    ctx.restore();
    if (p.air && p.grab > 0 && p.tumble <= 0) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, -4 * u, 34 * u, -2.4, -0.7); ctx.stroke(); }
    ctx.restore();
    if (p.boost > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; const c = Math.cos(p.rot), s = -Math.sin(p.rot); for (let i = 0; i < 5; i++) { const a = hash(i + Math.floor(this.t * 20) * 3), o = (a - 0.5) * 36 * u, len = 30 + a * 50; ctx.beginPath(); ctx.moveTo(x - 30 * u * c + o * s, y - 14 * u - 30 * u * s - o * c); ctx.lineTo(x - (30 * u + len) * c + o * s, y - 14 * u - (30 * u + len) * s - o * c); ctx.stroke(); } }
  }
  /** The sled alone: two runners curled up at the front, struts, a plank deck. Drawn at the origin, pointing right. */
  sledShape(ctx, u, pal) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w * u; ctx.stroke(); };
    ctx.beginPath(); ctx.moveTo(-26 * u, -1.5 * u); ctx.lineTo(20 * u, -1.5 * u); ctx.quadraticCurveTo(30 * u, -2 * u, 29 * u, -11 * u); line(5.4, '#05050a'); line(3, pal.runner);
    ctx.beginPath(); for (const sx of [-18, -2, 14]) { ctx.moveTo(sx * u, -2 * u); ctx.lineTo(sx * u, -7 * u); } line(4.6, '#05050a'); line(2.4, pal.runner);
    ctx.fillStyle = pal.deck; ctx.strokeStyle = '#05050a'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.rect(-25 * u, -10.5 * u, 45 * u, 4.5 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.deckLit; ctx.fillRect(-24 * u, -10 * u, 43 * u, 1.6 * u);
  }

  /** How far across the picture the avalanche's front is. It is nearer the sled than its true distance
   *  would put it, so that it is in the picture all the time: at the left edge when it is as far
   *  behind as it ever gets, on the sled's heels when it is about to catch him. */
  frontX() { return OX - 14 - (OX + 10) * Math.pow(clamp(this.sim.gap / (MAX_GAP + this.sim.room), 0, 1), 0.8); }
  /** The avalanche: a wall of billowing snow from the ground to far above the sled, rolling down behind him. */
  drawAvalanche(ctx, bottom) {
    const fx = this.swallow >= 0 ? lerp(this.frontX(), W + 260, clamp(this.swallow / SWALLOW_T, 0, 1) ** 1.5) : this.frontX();
    this.billows(ctx, fx, bottom, 1);
  }
  billows(ctx, fx, bottom, grow) {
    const sl = this.slope, t = this.t, cols = ['#ffffff', '#eef5fc', '#dbe9f6'];
    const groundY = (sx) => this.Y(snowAt(sl, this.cx + (sx - OX) / this.zoom));
    // everything behind the front is under the snow
    ctx.fillStyle = '#f3f8fd'; ctx.beginPath(); ctx.moveTo(-20, bottom + 4); ctx.lineTo(-20, groundY(-20) - 520);
    for (let sx = -20; sx <= fx - 30; sx += 30) ctx.lineTo(sx, groundY(sx) - (190 + (fx - sx) * 0.9) * grow);
    ctx.lineTo(fx - 20, groundY(fx - 20) - 150 * grow); ctx.lineTo(fx - 20, bottom + 4); ctx.closePath(); ctx.fill();
    // the billows, back to front, each one rolling
    for (let col = Math.ceil((fx + 80) / 42); col >= 0; col--) {
      const sx = fx - col * 42, gy = groundY(sx), tall = (170 + col * 38) * grow;
      for (let j = 4; j >= 0; j--) {
        const h = hash(col * 5 + j * 17 + Math.floor(fx / 4000)), r = (34 + h * 22 + (j === 0 ? -8 : 0)) * (0.9 + 0.1 * Math.sin(t * 5 + col * 1.7 + j));
        const x = sx + Math.sin(t * 3.1 + col * 2.3 + j * 1.9) * 7 + j * 5 - (j === 0 ? -16 : 0), y = gy - (j / 4) * tall + Math.cos(t * 2.6 + col + j * 2.2) * 6 - (j === 0 ? 6 : 0);
        ctx.fillStyle = cols[(col + j) % 3]; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(150,180,215,0.28)'; ctx.beginPath(); ctx.arc(x + r * 0.18, y + r * 0.22, r * 0.72, 0.2, 2.6); ctx.fill();
      }
    }
    // … and it buries the mountainside below its front too
    for (let y = groundY(fx) + 50; y < bottom + 60; y += 62) { const h = hash(Math.floor(y / 62) * 7); ctx.fillStyle = cols[Math.floor(y / 62) % 3]; ctx.beginPath(); ctx.arc(fx - 24 + h * 14 + Math.sin(t * 2.4 + y) * 5, y, 46 + h * 14, 0, TAU); ctx.fill(); }
    // lumps of snow thrown out ahead of it
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      const k = (t * (0.7 + hash(i * 3) * 0.6) + hash(i * 13)) % 1, x = fx + 10 + k * (60 + hash(i * 7) * 70), y = groundY(x) - 14 - Math.sin(k * Math.PI) * (40 + hash(i * 19) * 90) * grow;
      ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(x, y, 3 + hash(i * 5) * 7, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  /** Caught: the avalanche rolls over everything, and the whole picture goes white. It clears off again
   *  when you are back on the snow. */
  drawSwallow(ctx, bottom) {
    const k = this.swallow >= 0 ? clamp(this.swallow / SWALLOW_T, 0, 1) : clamp(this.clearing, 0, 1);
    if (this.swallow >= 0) {
      // great rolling heads of snow burst across the picture ahead of the wall
      for (let i = 0; i < 26; i++) {
        const a = hash(i * 29 + 1), b = hash(i * 41 + 7), start = a * 0.55, q = clamp((k - start) / 0.45, 0, 1);
        if (q <= 0) continue;
        const x = -60 + (a * 0.4 + q * 0.9) * (W + 160) * (0.4 + b * 0.6), y = b * bottom + Math.sin(this.t * 3 + i) * 10, r = 30 + q * (150 + a * 90);
        ctx.fillStyle = i % 3 ? '#ffffff' : '#e6f0fa'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(150,180,215,0.22)'; ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.2, r * 0.75, 0.2, 2.6); ctx.fill();
      }
    }
    ctx.fillStyle = `rgba(255,255,255,${this.swallow >= 0 ? clamp((k - 0.45) / 0.5, 0, 1) : k})`; ctx.fillRect(0, 0, W, bottom);
    if (this.swallow >= 0 && k >= 1) {
      ctx.fillStyle = '#64748b'; ctx.font = '800 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BURIED!', W / 2, 300);
    }
  }

  drawHud(ctx) {
    const sim = this.sim, p = sim.p, sl = this.slope;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (this.bonus) {
      ctx.fillStyle = 'rgba(8,16,36,0.55)'; roundRect(ctx, W / 2 - 110, 12, 220, 30, 15); ctx.fill();
      ctx.fillStyle = '#a5f3fc'; ctx.font = '800 15px system-ui, sans-serif'; ctx.fillText('★ CRYSTAL RUSH ★', W / 2, 28);
      return;
    }
    // how far to the hut, with the flag, the avalanche and the sled marked on it
    const x0 = 16, w = W - 32, at = (x) => x0 + w * clamp(x / sl.len, 0, 1), danger = sim.gap < 8;
    ctx.fillStyle = 'rgba(8,16,36,0.55)'; roundRect(ctx, x0, 14, w, 12, 6); ctx.fill();
    ctx.fillStyle = danger && Math.floor(this.t * 6) % 2 ? '#fecaca' : '#ffffff'; roundRect(ctx, x0, 14, Math.max(8, at(sim.az) - x0), 12, 6); ctx.fill();
    ctx.fillStyle = sim.flagged ? '#86efac' : '#fde047'; ctx.fillRect(at(sl.flagX) - 1.5, 10, 3, 20);
    ctx.fillStyle = this.s.gold ? '#fbbf24' : '#38bdf8'; ctx.beginPath(); ctx.arc(at(p.x), 20, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e0f2fe'; ctx.textAlign = 'left'; ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`Hut ${Math.max(0, Math.round(sl.len - p.x))} m`, x0 + 2, 42);
    ctx.textAlign = 'right'; ctx.fillStyle = danger ? '#fca5a5' : '#e0f2fe';
    ctx.fillText(`${Math.round(p.v * 3.6)} km/h${p.tuck && !p.air ? ' · TUCK' : ''}${p.boost > 0 ? ' · BOOST' : ''}`, x0 + w - 2, 42);
  }

  drawButtons(ctx) {
    const C = this.ctl, on = this.btnOn;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [k, label] of [['left', '↺'], ['right', '↻'], ['tuck', 'TUCK'], ['jump', 'JUMP'], ['sword', 'SWORD']]) {
      const b = C[k];
      ctx.fillStyle = on[k] ? 'rgba(56,189,248,0.85)' : 'rgba(30,58,95,0.6)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = k === 'tuck' || k === 'jump' || k === 'sword' ? `800 ${k === 'jump' ? 17 : k === 'sword' ? 12 : 14}px system-ui, sans-serif` : '800 32px system-ui, sans-serif'; ctx.fillText(label, b.x, b.y + 1);
    }
  }
}

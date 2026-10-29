// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — Zone 5 · Beyond, slot 29.
//
//  A side-on space explorer in the spirit of Hollow Knight: every level is a planet, a small
//  connected map. Find the exit beacon, fight what lives there with the energy blade (side,
//  up and pogo down-slashes) and the blaster (fed by blade hits), mind the spikes, and keep
//  your suit's armour plates intact. Upgrades (Section 3) and guardian bosses on every 5th
//  planet (Section 4) build on this.
//
//  The rules live in world.js (pure, shared with check.mjs, which proves every planet fair);
//  the art in art.js. This file is input, camera, drawing, sound and points.
//  Gameplay randomness: one seeded stream per planet, from the run seed (s.rng) and the planet
//  number, so the Daily Challenge gives everyone the same aliens on the same planet.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Sound } from '../../assets/js/audio.js';
import { makeRng, hashString } from '../../assets/js/rng.js';
import { Thumbstick } from '../../assets/js/thumbstick.js';
import { TILE, PH, RUN, ROCK, LEDGE, SPIKE_UP, SPIKE_DOWN, HAZARD_T, SLASH_T, LOADOUT, planetFor, PlanetSim, tileAt } from './world.js';
import { astroPose, drawAstronaut, drawPortrait, drawSlashArc, SUITS, drawCrawler, drawHopper, drawWisp, drawSpitter } from './art.js';

const ID = 'astro-explorer';
const W = 480, H = 720;
const ZOOM = 2;                   // world px → screen px: the explorer is ~62 px tall, Hollow Knight-like on a portrait screen
const PANEL = 150;                // touch strip inside the box when a phone's bottom band is too short
const TAU = Math.PI * 2;
const JUMP_KEYS = new Set(['Space', 'KeyW', 'ArrowUp', 'KeyZ', 'Enter']);
const OWN_KEYS = new Set(['KeyJ', 'KeyK', 'KeyX', 'KeyC', 'KeyZ']);

// One palette per planet. The astronaut's gold visor is a mirror: visorFor() builds its
// reflection from the planet's sky, horizon and ground, so it changes with every planet.
const THEMES = {
  dust: {     // Landing Site
    sky: ['#05071a', '#140f38', '#2a1d55'], far: '#151538', near: '#1d1a4a', planet: ['#8b7fe0', '#3b2f86'],
    rock: ['#3a3466', '#35305f', '#3f396d'], rockHi: '#8f82e6', rockLo: '#211c44', rockIn: '#2b2652',
    ledge: '#7b6dd6', ledgeLo: '#2e2760', moss: '#5eead4', crystal: ['#e9d5ff', '#a78bfa', '#5b21b6'],
  },
  ice: {      // Frost Moon
    sky: ['#020b18', '#08243b', '#0f3d58'], far: '#0b2a40', near: '#11384f', planet: ['#a5f3fc', '#0e7490'],
    rock: ['#2f4f66', '#2a475c', '#355a73'], rockHi: '#a5e9f5', rockLo: '#18303f', rockIn: '#203d50',
    ledge: '#7dd3e8', ledgeLo: '#1f4a5c', moss: '#e0f2fe', crystal: ['#f0fdff', '#67e8f9', '#0e7490'],
  },
  ember: {    // Ember Rock
    sky: ['#120404', '#3a0d06', '#6b1d0a'], far: '#2c0b07', near: '#3d1008', planet: ['#fdba74', '#9a3412'],
    rock: ['#4a2a22', '#43261f', '#523027'], rockHi: '#fb923c', rockLo: '#261410', rockIn: '#351c16',
    ledge: '#ea7a3a', ledgeLo: '#4a1f12', moss: '#fdba74', crystal: ['#fef3c7', '#f97316', '#9a3412'],
  },
  jungle: {   // Spore Jungle
    sky: ['#020d08', '#06261a', '#0c3f2a'], far: '#0a2a1d', near: '#0f3a28', planet: ['#bef264', '#3f6212'],
    rock: ['#2c4a33', '#28432e', '#33543a'], rockHi: '#86efac', rockLo: '#16281b', rockIn: '#1f3a26',
    ledge: '#5fc98a', ledgeLo: '#1d4a2e', moss: '#d9f99d', crystal: ['#ecfccb', '#4ade80', '#166534'],
  },
  desert: {   // Dune World
    sky: ['#120a03', '#3b2410', '#6b4220'], far: '#2e1d0d', near: '#3f2812', planet: ['#fde68a', '#b45309'],
    rock: ['#6b5034', '#634a30', '#75583a'], rockHi: '#fcd34d', rockLo: '#35271a', rockIn: '#4a3824',
    ledge: '#d6a54a', ledgeLo: '#5a3d1a', moss: '#fde68a', crystal: ['#fffbeb', '#fbbf24', '#92400e'],
  },
  nebula: {   // Nebula Reach
    sky: ['#0d0214', '#2e0a3f', '#58125e'], far: '#260b33', near: '#360f45', planet: ['#f9a8d4', '#9d174d'],
    rock: ['#4a2752', '#43234a', '#52305a'], rockHi: '#f0abfc', rockLo: '#25122a', rockIn: '#351a3b',
    ledge: '#d77ad9', ledgeLo: '#4a1f4f', moss: '#f5d0fe', crystal: ['#fdf4ff', '#e879f9', '#86198f'],
  },
};

/** '#rrggbb' mix: t = 0 → a, 1 → b */
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/** The visor's reflection on this planet: deep sky at the top, the horizon glow, the ground below,
 *  warmed by the gold coating (gold = how much; the golden suit's visor is more golden). */
function visorFor(th, gold) {
  const G = '#d4a017';
  return [
    mix(mix(th.sky[0], '#000000', 0.15), G, gold * 0.45),
    mix(th.sky[2], G, gold),
    mix(mix(th.rockHi, '#ffffff', 0.35), G, gold * 0.6),
    mix(mix(th.rock[0], '#000000', 0.3), G, gold * 0.5),
    mix(th.rockHi, G, gold),
  ];
}

const LEVEL_INFO = {
  1: 'Find the exit beacon. Blade the aliens and mind the spikes.',
  2: 'Acid Pods take root, and Spore Toads jump at you.',
  3: 'Red-eyed elites take an extra hit.',
};

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  levelName: 'Planet',
  levelTitle: (level) => `Planet ${level} · ${planetFor(level).name}`,
  bonusLevels: [],                 // guardian planets (every 5th) arrive in Section 4
  comboWindow: 3,
  comboStep: 4,
  maxMultiplier: 5,
  music: { bpm: 92, style: 'cosmic', lead: 'triangle', bass: 'half' },   // placeholder until Section 5's own score
  titleHint: 'Land on strange planets, blade what lives there, and find the exit beacon. Down-slash in mid-air to bounce off aliens and spikes.',
  levelInfo: (level) => LEVEL_INFO[level] || 'A new planet. Stay sharp.',
  create: (shell) => new AstroExplorer(shell),
});

/** Little original sound effects on the shared synth (Section 5 replaces the placeholders). */
const sfx = {
  play(fn) { if (!Sound.muted) try { fn(); } catch { /* audio not ready */ } },
  swish: () => sfx.play(() => { Sound.noise({ dur: 0.09, vol: 0.14, freq: 3200, to: 900, type: 'bandpass' }); Sound.tone({ freq: 540, to: 250, dur: 0.06, type: 'triangle', vol: 0.035 }); }),
  hit: () => sfx.play(() => { Sound.tone({ freq: 230, to: 120, dur: 0.07, type: 'square', vol: 0.08 }); Sound.noise({ dur: 0.06, vol: 0.16, freq: 1800, to: 500 }); }),
  kill: () => sfx.play(() => { Sound.noise({ dur: 0.22, vol: 0.2, freq: 1300, to: 120 }); Sound.tone({ freq: 340, to: 90, dur: 0.18, type: 'sawtooth', vol: 0.06 }); }),
  zap: () => sfx.play(() => { Sound.tone({ freq: 1400, to: 380, dur: 0.09, type: 'square', vol: 0.06 }); Sound.tone({ freq: 2100, to: 700, dur: 0.06, type: 'sine', vol: 0.045 }); }),
  hurt: () => sfx.play(() => { Sound.tone({ freq: 190, to: 70, dur: 0.22, type: 'sawtooth', vol: 0.11 }); Sound.noise({ dur: 0.15, vol: 0.18, freq: 900, to: 200 }); }),
  spit: () => sfx.play(() => Sound.tone({ freq: 300, to: 560, dur: 0.12, type: 'sine', vol: 0.05 })),
  thud: () => sfx.play(() => Sound.noise({ dur: 0.07, vol: 0.09, freq: 500, to: 120 })),
};

class AstroExplorer {
  constructor(s) {
    this.s = s; this.t = 0;
    this.runSeed = s.rng.int(1, 2147483646);
    // cosmetic: starfield, background stars (Math.random is fine for looks)
    this.stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6 }));
    this.parts = []; this.corpses = [];
    this.cam = { x: 0, y: 0, look: 0 };
    this.press = { jump: false, slash: false, shoot: false };
    this.btnPrev = { jump: false, slash: false, shoot: false };
    this.zHeld = false;
    this.anim = { phase: 0, land: 0, hurt: 0, flame: 0, idle: 0, look: { x: 0.6, y: 0 }, aimT: 0 };
    this.pipFlash = [];
    this.stickPos = { x: 92, y: H - PANEL / 2, r: 56 };
    this.stick = new Thumbstick(s, this.stickPos);
    this.btn = {};
    this.layout();
    this.listen();
    this.startLevel(1, false);
  }

  /** A new run: a new seed for its planets (the Daily seed makes this the same for everyone). */
  reset() { this.runSeed = this.s.rng.int(1, 2147483646); }

  startLevel(level) {
    const def = planetFor(level);
    this.level = level;
    this.sim = new PlanetSim(def, level, hashString(`${this.runSeed}:${level}`), LOADOUT);
    this.m = this.sim.m;
    this.themeKey = THEMES[def.theme] ? def.theme : 'dust';
    this.th = THEMES[this.themeKey];
    // the suit's colours on this planet: the mirrored visor reflects the planet's sky and ground
    this.suitC = { ...SUITS.normal, visor: visorFor(this.th, 0.16) };
    this.goldC = { ...SUITS.gold, visor: visorFor(this.th, 0.55) };
    this.parts = []; this.corpses = []; this.pipFlash = [];
    this.hintT = level === 1 ? 11 : 0;
    this.sky = null;
    this.decor = makeDecor(this.m, def.name);
    const vw = W / ZOOM, vh = this.viewH() / ZOOM, p = this.sim.p;
    this.cam.x = clamp(p.x - vw / 2, 0, this.m.w - vw);
    this.cam.y = clamp(p.y - PH / 2 - vh * 0.55, 0, Math.max(0, this.m.h - vh));
    this.cam.look = 0;
  }

  onLifeLost() { this.sim.respawn(); this.parts = []; this.anim.hurt = 0; }

  // ── Layout ───────────────────────────────────────────────────
  touchUI() { return this.s.coarse || this.stick.coarse; }
  inBand() { return (this.s.bands?.bottom || 0) >= 150; }
  viewH() { return this.touchUI() && !this.inBand() ? H - PANEL : H; }
  layout() {
    const band = this.s.bands?.bottom || 0;
    if (band >= 150) {
      const cy = H + band * 0.5;
      Object.assign(this.stickPos, { x: 92, y: cy, r: 56 });
      this.btn = { jump: { x: W - 62, y: cy + 16, r: 40 }, slash: { x: W - 154, y: cy + 26, r: 37 }, shoot: { x: W - 106, y: cy - 50, r: 30 } };
    } else {
      const cy = H - PANEL / 2;
      Object.assign(this.stickPos, { x: 88, y: cy, r: 52 });
      this.btn = { jump: { x: W - 60, y: cy + 14, r: 37 }, slash: { x: W - 146, y: cy + 22, r: 34 }, shoot: { x: W - 102, y: cy - 42, r: 27 } };
    }
  }
  onBandsChange() { this.layout(); this.sky = null; }

  // ── Input ────────────────────────────────────────────────────
  listen() {
    const s = this.s, playing = () => s.state === 'playing';
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const c = e.code;
      if (OWN_KEYS.has(c) && playing()) e.preventDefault();
      if (c === 'KeyZ') this.zHeld = true;
      if (e.repeat || !playing()) return;
      if (c === 'KeyJ' || c === 'KeyX') this.press.slash = true;
      else if (c === 'KeyK' || c === 'KeyC') this.press.shoot = true;
      else if (JUMP_KEYS.has(c)) this.press.jump = true;
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyZ') this.zHeld = false; });
    addEventListener('blur', () => { this.zHeld = false; });
    // mouse: left button = blade, right button = blaster
    s.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !playing()) return;
      if (e.button === 0) this.press.slash = true; else if (e.button === 2) this.press.shoot = true;
    });
  }
  onAction() { /* every control is read directly (keys above, the stick and buttons in readInput) */ }

  touchButtons() {
    const out = { jump: false, slash: false, shoot: false };
    if (!this.touchUI()) return out;
    const skip = this.stick.active?.id;
    for (const [id, q] of this.s.input.pointers) {
      if (id === skip) continue;
      for (const k of ['jump', 'slash', 'shoot']) { const b = this.btn[k]; if (Math.hypot(q.x - b.x, q.y - b.y) < b.r + 12) out[k] = true; }
    }
    return out;
  }

  readInput() {
    const i = this.s.input, tb = this.touchButtons(), st = this.stick.active;
    const sx = st ? st.dx : 0, sy = st ? st.dy : 0;
    const left = i.isDown('left') || sx < -0.32, right = i.isDown('right') || sx > 0.32;
    const up = i.isDown('up') || sy < -0.55, down = i.isDown('down') || sy > 0.55;
    const inp = {
      dir: (right ? 1 : 0) - (left ? 1 : 0),
      aim: up ? -1 : down ? 1 : 0,
      jumpHeld: i.isDown('up') || i.isDown('action') || this.zHeld || tb.jump,
      jumpPress: this.press.jump || (tb.jump && !this.btnPrev.jump),
      slashPress: this.press.slash || (tb.slash && !this.btnPrev.slash),
      shootPress: this.press.shoot || (tb.shoot && !this.btnPrev.shoot),
    };
    this.btnPrev = tb;
    this.press.jump = this.press.slash = this.press.shoot = false;
    return inp;
  }

  // ── Play ─────────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    const inp = this.readInput();
    const ev = this.sim.step(inp);
    for (const e of ev) this.onEvent(e);
    this.animate(dt, inp);
    this.stepParts(dt);
    this.updateCamera(dt, inp);
    if (this.hintT > 0) this.hintT -= dt;
  }
  idle(dt) {
    this.t += dt;
    this.animate(dt, null);
    this.stepParts(dt);
    this.updateCamera(dt, null);
  }

  /** world → screen (box) coordinates, for the engine's floating texts and bursts */
  scr(x, y) { return [(x - this.cam.x) * ZOOM, (y - this.cam.y) * ZOOM]; }
  onScreen(x, y, pad = 40) { const [sx, sy] = this.scr(x, y); return sx > -pad && sx < W + pad && sy > -pad && sy < this.viewH() + pad; }

  onEvent(e) {
    const s = this.s, L = this.level, p = this.sim.p;
    switch (e.type) {
      case 'jump':
        s.sound.play('flap');
        this.puff(p.x - p.face * 6.5, p.y - 12, 7, ['#fde68a', '#fdba74', '#e2e8f0'], 50, 90);
        break;
      case 'land':
        this.anim.land = 1;
        if (e.hard) { sfx.thud(); this.puff(p.x, p.y, 8, [this.th.rockHi, '#cbd5e1'], 70, -20); }
        break;
      case 'slash': sfx.swish(); break;
      case 'hit':
        sfx.hit(); s.fx.shake(1.6, 0.06);
        this.sparks(e.x, e.y, 9, e.by === 'bolt' ? '#a5f3fc' : '#e0f2fe');
        break;
      case 'kill': {
        sfx.kill(); s.fx.shake(3, 0.12);
        const [sx, sy] = this.scr(e.x, e.y), col = FOE_COL[e.foe];
        s.award(e.pts * L, sx, sy - 14, { chain: true, color: '#fde047' });
        s.fx.burst(sx, sy, { color: col, count: 18, speed: 170, life: 0.55 });
        this.sparks(e.x, e.y, 14, col, 140);
        const f = this.sim.foes.find((q) => q.id === e.id);
        if (f) this.corpses.push({ f: { ...f, dead: false }, t: 0 });
        this.grinT = 0.9;
        if (!this.firstKill) { this.firstKill = true; s.unlock('contact'); }
        break;
      }
      case 'pogo':
        s.sound.play('bounce', 4 + e.n * 2);
        this.sparks(p.x, p.y + 14, 8, '#a5f3fc', 120);
        if (e.n >= 3) s.unlock('pogo');
        break;
      case 'clink': s.sound.play('metal'); this.sparks(e.x, e.y, 10, '#e9d5ff', 150); break;
      case 'shoot': sfx.zap(); this.sparks(e.x, e.y, 5, '#a5f3fc', 90); break;
      case 'empty': { s.sound.play('click'); const [sx, sy] = this.scr(e.x, e.y); s.fx.text(clamp(sx, 70, W - 70), sy - 12, 'NO ENERGY', { size: 14, color: '#67e8f9', life: 0.7, rise: 22 }); break; }
      case 'spark': this.sparks(e.x, e.y, 6, '#a5f3fc', 90); break;
      case 'parry': s.sound.play('metal'); this.sparks(e.x, e.y, 10, '#d9f99d', 130); break;
      case 'splat': if (this.onScreen(e.x, e.y)) this.sparks(e.x, e.y, 7, '#a3e635', 80); break;
      case 'spit': if (this.onScreen(e.x, e.y)) sfx.spit(); break;
      case 'hurt':
        sfx.hurt(); s.fx.shake(5, 0.22); s.fx.flash('#ff3355', 0.16);
        this.anim.hurt = 1; this.pipFlash[e.pips] = 0.6;
        this.sparks(e.x, e.y, 12, '#fecdd3', 150);
        break;
      case 'spike':
        sfx.hurt(); s.fx.shake(6, 0.22); s.fx.flash('#ff3355', 0.18);
        this.anim.hurt = 1; this.pipFlash[e.pips] = 0.6;
        this.sparks(e.x, e.y, 14, '#e9d5ff', 160);
        break;
      case 'return': this.ring(e.x, e.y - PH / 2, '#a5f3fc'); break;
      case 'dust': {
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(10 * L, sx, sy - 12, { chain: true, color: '#fde047', size: 16 });
        s.sound.play('gem', s.comboCount);
        s.fx.burst(sx, sy, { color: '#fde047', count: 8, speed: 90, life: 0.45 });
        if (e.all) { s.award(150 * L, W / 2, this.viewH() * 0.3, { color: '#fde047', size: 22 }); s.fx.text(W / 2, this.viewH() * 0.3 - 30, 'ALL STAR DUST!', { color: '#fde047', size: 20, life: 1.4 }); }
        break;
      }
      case 'orb': s.sound.play('eat', 6); this.sparks(e.x, e.y, 6, '#67e8f9', 70); break;
      case 'repair': { s.sound.play('life'); const [sx, sy] = this.scr(e.x, e.y); s.fx.text(sx, sy - 16, '+1 ARMOUR', { size: 15, color: '#86efac', life: 0.9, rise: 26 }); break; }
      case 'exit': {
        s.sound.play('powerup');
        const [sx, sy] = this.scr(e.x, e.y - 30);
        s.award(100 * L, sx, sy, { color: '#c4b5fd' });
        if (e.clean) { s.award(200 * L, W / 2, this.viewH() * 0.36, { color: '#86efac', size: 22 }); s.fx.text(W / 2, this.viewH() * 0.36 - 28, 'UNTOUCHED!', { color: '#86efac', size: 20, life: 1.4 }); s.unlock('untouched'); }
        if (L === 1) s.unlock('landing');
        this.ring(e.x, e.y - 30, '#c4b5fd');
        s.completeLevel();
        break;
      }
      case 'dead': s.hurt(); break;
    }
  }

  // ── Cosmetic animation ──────────────────────────────────────
  animate(dt, inp) {
    const p = this.sim.p, A = this.anim;
    A.land = Math.max(0, A.land - dt / 0.14);
    A.hurt = Math.max(0, A.hurt - dt / 0.4);
    A.flame = !p.ground && p.vy < -140 ? Math.min(1, A.flame + dt * 10) : Math.max(0, A.flame - dt * 6);
    if (p.ground && Math.abs(p.vx) > 8) {
      const before = Math.floor(A.phase / Math.PI);
      A.phase += Math.abs(p.vx) * dt * (TAU / 64);
      if (Math.floor(A.phase / Math.PI) !== before && Math.abs(p.vx) > 90) this.puff(p.x - p.face * 3, p.y, 2, [this.th.rockHi], 25, -10);   // footfall dust
    }
    A.idle = p.ground && Math.abs(p.vx) < 5 && !p.atk && !p.shoot ? A.idle + dt : 0;
    // head: turns towards the nearest alien in view, else ahead (the visor's shine follows)
    let best = 170, tx = 0.6, ty = 0;
    for (const f of this.sim.foes) {
      if (f.dead) continue;
      const dx = f.x - p.x, dy = (f.y - 8) - (p.y - 24), d = Math.hypot(dx, dy);
      if (d < best) { best = d; tx = (dx * p.face) / d; ty = dy / d; }
    }
    A.look.x += (tx - A.look.x) * Math.min(1, dt * 8); A.look.y += (ty - A.look.y) * Math.min(1, dt * 8);
    for (let i = 0; i < this.pipFlash.length; i++) if (this.pipFlash[i] > 0) this.pipFlash[i] -= dt;
    if (this.grinT > 0) this.grinT -= dt;
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 0.35);
    // hold up/down while standing still to look around (moves the camera)
    if (inp && p.ground && Math.abs(p.vx) < 10 && inp.aim && !inp.dir) A.aimT += dt; else A.aimT = 0;
  }

  updateCamera(dt, inp) {
    const p = this.sim.p, m = this.m, vw = W / ZOOM, vh = this.viewH() / ZOOM;
    const lookWant = this.anim.aimT > 0.45 ? inp.aim * 80 : 0;
    this.cam.look += (lookWant - this.cam.look) * Math.min(1, dt * 4);
    const tx = clamp(p.x + p.face * 34 - vw / 2, 0, Math.max(0, m.w - vw));
    const ty = clamp(p.y - PH / 2 - vh * 0.55 + this.cam.look, 0, Math.max(0, m.h - vh));
    const k = 1 - Math.exp(-dt * 7);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  pose() {
    const p = this.sim.p, A = this.anim;
    const mode = p.ground ? (Math.abs(p.vx) > 12 ? 'run' : 'idle') : p.vy < 0 ? 'jump' : 'fall';
    const idleLook = A.idle > 4 ? Math.sin((A.idle - 4) * 0.8) * Math.min(1, (A.idle - 4) * 0.8) : 0;
    const st = { mode, t: this.t, phase: A.phase, run: Math.min(1, Math.abs(p.vx) / RUN), vy: p.vy, flame: A.flame, land: A.land,
      hurt: p.dead ? 1 : A.hurt, idleLook, look: idleLook ? null : A.look };
    if (p.atk) st.slash = { kind: p.atk.kind, k: p.atk.t / SLASH_T };
    else if (p.shoot) st.shoot = { dir: p.shoot.dir, k: p.shoot.t / 0.3 };
    return astroPose(st);
  }

  // world-space particles (cosmetic)
  puff(x, y, n, cols, sp, up) {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: -Math.random() * Math.abs(up) * Math.sign(up || 1), life: 0.35 + Math.random() * 0.25, max: 0.6, size: 1 + Math.random() * 1.6, color: cols[i % cols.length], grav: up > 0 ? 160 : -40, drag: 3 });
    this.capParts();
  }
  sparks(x, y, n, col, sp = 110) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.25, max: 0.5, size: 0.8 + Math.random() * 1.2, color: col, grav: 240, drag: 2.5 }); }
    this.capParts();
  }
  ring(x, y, col) { this.parts.push({ ring: true, x, y, life: 0.45, max: 0.45, color: col }); }
  capParts() { if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420); }
  stepParts(dt) {
    for (const q of this.parts) {
      q.life -= dt;
      if (q.ring) continue;
      q.vx -= q.vx * q.drag * dt; q.vy += q.grav * dt - q.vy * q.drag * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
  }

  // ── Drawing ──────────────────────────────────────────────────
  render(ctx) {
    const vh = this.viewH();
    const cx = Math.round(this.cam.x * ZOOM) / ZOOM, cy = Math.round(this.cam.y * ZOOM) / ZOOM;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, vh); ctx.clip();
    this.drawSky(ctx, vh, cx, cy);
    ctx.scale(ZOOM, ZOOM); ctx.translate(-cx, -cy);
    const view = { x0: cx - 30, y0: cy - 30, x1: cx + W / ZOOM + 30, y1: cy + vh / ZOOM + 30 };
    this.drawTiles(ctx, cx, cy, vh);
    this.drawDecor(ctx, view);
    this.drawExit(ctx);
    this.drawDust(ctx, view);
    this.drawDrops(ctx);
    this.drawFoes(ctx, view);
    this.drawPlayer(ctx);
    this.drawShots(ctx);
    this.drawParts(ctx);
    ctx.restore();
    this.drawHud(ctx, vh);
    if (this.touchUI()) this.drawTouch(ctx);
  }

  drawSky(ctx, vh, cx, cy) {
    const th = this.th;
    if (!this.sky || this.sky.vh !== vh) {
      const g = ctx.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, th.sky[0]); g.addColorStop(0.6, th.sky[1]); g.addColorStop(1, th.sky[2]);
      this.sky = { vh, g };
    }
    ctx.fillStyle = this.sky.g; ctx.fillRect(0, 0, W, vh);
    for (const st of this.stars) {
      ctx.globalAlpha = 0.3 + 0.35 * Math.sin(this.t * 1.3 + st.tw);
      ctx.fillStyle = '#e0e7ff';
      const sx = ((st.x - cx * st.z * 0.12) % W + W) % W, sy = ((st.y - cy * st.z * 0.08) % vh + vh) % vh;
      ctx.fillRect(sx, sy, st.z > 0.75 ? 2 : 1, st.z > 0.75 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    // a ringed planet hanging in the sky
    const px = W * 0.74 - cx * 0.05, py = vh * 0.2 - cy * 0.03, r = 46;
    const pg = ctx.createRadialGradient(px - 14, py - 16, 4, px, py, r);
    pg.addColorStop(0, th.planet[0]); pg.addColorStop(1, th.planet[1]);
    ctx.globalAlpha = 0.55; ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(221,214,254,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(px, py, r * 1.65, r * 0.32, -0.25, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    this.ridge(ctx, th.far, cx * 0.22, vh * 0.58, 52, 0.010, 1.3, vh);
    this.ridge(ctx, th.near, cx * 0.42, vh * 0.74, 40, 0.016, 4.1, vh);
  }
  ridge(ctx, col, off, base, amp, freq, seed, vh) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, vh);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base + Math.sin((x + off) * freq + seed) * amp * 0.5 + Math.sin((x + off) * freq * 2.7 + seed * 2) * amp * 0.25);
    ctx.lineTo(W, vh); ctx.fill();
  }

  drawTiles(ctx, cx, cy, vh) {
    const m = this.m, th = this.th;
    const c0 = Math.max(0, Math.floor(cx / TILE)), c1 = Math.min(m.C - 1, Math.floor((cx + W / ZOOM) / TILE));
    const r0 = Math.max(0, Math.floor(cy / TILE)), r1 = Math.min(m.R - 1, Math.floor((cy + vh / ZOOM) / TILE));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = m.t[r * m.C + c];
      if (!k) continue;
      const x = c * TILE, y = r * TILE;
      if (k === ROCK) {
        const h = hash2(c, r);
        const exposed = tileAt(m, c, r - 1) !== ROCK, inner = !exposed && tileAt(m, c - 1, r) === ROCK && tileAt(m, c + 1, r) === ROCK && tileAt(m, c, r + 1) === ROCK;
        ctx.fillStyle = inner ? th.rockIn : th.rock[h % 3]; ctx.fillRect(x, y, TILE, TILE);
        if (!inner) {
          ctx.fillStyle = 'rgba(0,0,0,.16)'; if (h & 8) ctx.fillRect(x + 4, y + 9, 7, 5); if (h & 16) ctx.fillRect(x + 13, y + 15, 6, 4);
          if (tileAt(m, c - 1, r) !== ROCK) { ctx.fillStyle = th.rockLo; ctx.fillRect(x, y, 3, TILE); }
          if (tileAt(m, c + 1, r) !== ROCK) { ctx.fillStyle = th.rockLo; ctx.fillRect(x + TILE - 3, y, 3, TILE); }
          if (tileAt(m, c, r + 1) !== ROCK) { ctx.fillStyle = th.rockLo; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
        }
        if (exposed) {
          ctx.fillStyle = th.rockHi; ctx.fillRect(x, y, TILE, 3.5);
          ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, TILE, 1.2);
        }
      } else if (k === LEDGE) {
        ctx.fillStyle = th.ledgeLo; ctx.fillRect(x + 1, y + 3, TILE - 2, 4);
        ctx.fillStyle = th.ledge; ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, TILE, 1);
        if (tileAt(m, c - 1, r) !== LEDGE || (c & 1)) { ctx.fillStyle = th.ledgeLo; ctx.fillRect(x + 3, y + 7, 2, 4); ctx.fillRect(x + TILE - 5, y + 7, 2, 4); }
      } else {
        this.drawSpikes(ctx, x, y, k === SPIKE_UP);
      }
    }
  }
  /** Crystal spikes: four shapes per direction, painted once into small sprites. */
  drawSpikes(ctx, x, y, up) {
    const key = `${this.themeKey}${up ? 'u' : 'd'}${(x / TILE) & 3}`;
    this.spikeCache = this.spikeCache || {};
    let img = this.spikeCache[key];
    if (!img) {
      const S = 4, c = document.createElement('canvas'); c.width = c.height = TILE * S;
      const g2 = c.getContext('2d'); g2.scale(S, S);
      const [hi, mid, lo] = this.th.crystal, v = (x / TILE) & 3;
      for (let i = 0; i < 3; i++) {
        const bx = 2 + i * 7, h = 13 + ((i * 5 + v * 3) % 4);
        const g = g2.createLinearGradient(0, up ? TILE - h : 0, 0, up ? TILE : h);
        g.addColorStop(up ? 0 : 1, hi); g.addColorStop(0.5, mid); g.addColorStop(up ? 1 : 0, lo);
        g2.fillStyle = g; g2.beginPath();
        if (up) { g2.moveTo(bx, TILE); g2.lineTo(bx + 3.5, TILE - h); g2.lineTo(bx + 7, TILE); }
        else { g2.moveTo(bx, 0); g2.lineTo(bx + 3.5, h); g2.lineTo(bx + 7, 0); }
        g2.fill();
        g2.strokeStyle = 'rgba(255,255,255,.45)'; g2.lineWidth = 0.6;
        g2.beginPath(); g2.moveTo(bx + 3.5, up ? TILE - h : h); g2.lineTo(bx + 1.6, up ? TILE - 2 : 2); g2.stroke();
      }
      img = this.spikeCache[key] = c;
    }
    ctx.drawImage(img, x, y, TILE, TILE);
  }

  drawDecor(ctx, v) {
    const th = this.th;
    for (const d of this.decor) {
      if (d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
      if (d.kind === 'moss') {
        ctx.strokeStyle = th.moss; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < d.n; i++) {
          const bx = d.x + i * 3, sway = Math.sin(this.t * 1.6 + d.x * 0.1 + i) * 1.2, h = 3 + ((i * 7 + d.x) % 4);
          ctx.beginPath(); ctx.moveTo(bx, d.y); ctx.quadraticCurveTo(bx + sway * 0.5, d.y - h * 0.6, bx + sway, d.y - h); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        const [hi, mid] = th.crystal;
        ctx.fillStyle = mid; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(d.x - 3, d.y); ctx.lineTo(d.x - 1, d.y - d.h); ctx.lineTo(d.x + 1.5, d.y); ctx.fill();
        ctx.beginPath(); ctx.moveTo(d.x + 0.5, d.y); ctx.lineTo(d.x + 3.5, d.y - d.h * 0.65); ctx.lineTo(d.x + 5, d.y); ctx.fill();
        ctx.fillStyle = hi; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 2 + d.x);
        ctx.beginPath(); ctx.moveTo(d.x - 1, d.y - d.h); ctx.lineTo(d.x - 0.2, d.y - d.h * 0.4); ctx.lineTo(d.x - 1.8, d.y - d.h * 0.4); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawExit(ctx) {
    const e = this.m.exit, x = e.x, y = e.y, t = this.t, s = this.s;
    // light column
    const g = ctx.createLinearGradient(0, y - 120, 0, y);
    g.addColorStop(0, 'rgba(196,181,253,0)'); g.addColorStop(1, `rgba(196,181,253,${0.22 + 0.08 * Math.sin(t * 3)})`);
    ctx.fillStyle = g; ctx.fillRect(x - 9, y - 120, 18, 120);
    const gs = s.glowSprite('rgba(167,139,250,.7)');
    ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3); ctx.drawImage(gs, x - 30, y - 62, 60, 60); ctx.globalAlpha = 1;
    // beacon mast + dish
    ctx.fillStyle = '#2e1065'; roundRect(ctx, x - 7, y - 6, 14, 6, 2); ctx.fill();
    ctx.fillStyle = '#4c1d95'; ctx.fillRect(x - 2.5, y - 40, 5, 34);
    ctx.fillStyle = '#7c3aed'; ctx.fillRect(x - 2.5, y - 40, 1.5, 34);
    ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y - 30, 7, -2.6, -0.55); ctx.stroke();
    ctx.fillStyle = `rgba(237,233,254,${0.65 + 0.35 * Math.sin(t * 5)})`; ctx.beginPath(); ctx.arc(x, y - 44, 4, 0, TAU); ctx.fill();
  }

  drawDust(ctx, v) {
    const m = this.m, gs = this.s.glowSprite('rgba(253,224,71,.55)');
    for (let i = 0; i < m.dust.length; i++) {
      if (this.sim.taken[i]) continue;
      const d = m.dust[i], x = d.x, y = d.y + Math.sin(this.t * 3 + i) * 2;
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      ctx.drawImage(gs, x - 11, y - 11, 22, 22);
      ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(x, y - 5.5); ctx.lineTo(x + 4.2, y); ctx.lineTo(x, y + 5.5); ctx.lineTo(x - 4.2, y); ctx.fill();
      ctx.fillStyle = '#fffbeb'; ctx.beginPath(); ctx.moveTo(x, y - 3.5); ctx.lineTo(x + 1.5, y); ctx.lineTo(x, y + 0.5); ctx.lineTo(x - 1.5, y); ctx.fill();
    }
  }

  drawDrops(ctx) {
    const gs = this.s.glowSprite('rgba(103,232,249,.6)');
    for (const d of this.sim.drops) {
      if (d.t > 9 && Math.floor(d.t * 8) % 2) continue;      // blinks before it fades
      const x = d.x, y = d.y - 4;
      if (d.kind === 'orb') {
        ctx.drawImage(gs, x - 9, y - 9, 18, 18);
        ctx.fillStyle = '#a5f3fc'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ecfeff'; ctx.beginPath(); ctx.arc(x - 0.7, y - 0.7, 1, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(8,12,28,.6)'; roundRect(ctx, x - 5, y - 5, 10, 10, 2.4); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; roundRect(ctx, x - 4.3, y - 4.3, 8.6, 8.6, 2); ctx.fill();
        ctx.fillStyle = '#16a34a'; ctx.fillRect(x - 1, y - 3, 2, 6); ctx.fillRect(x - 3, y - 1, 6, 2);
      }
    }
  }

  drawFoes(ctx, v) {
    const glow = this.s.glowSprite('rgba(34,211,238,.5)'), eliteGlow = this.s.glowSprite('rgba(248,113,113,.5)');
    const one = (f, white) => {
      if (f.kind === 'crawler') drawCrawler(ctx, f, this.t + f.phase * 7, white);
      else if (f.kind === 'hopper') drawHopper(ctx, f, this.t, white);
      else if (f.kind === 'wisp') drawWisp(ctx, f, this.t, white, f.elite ? eliteGlow : glow);
      else drawSpitter(ctx, f, this.t, white);
    };
    for (const f of this.sim.foes) {
      if (f.dead || f.x < v.x0 || f.x > v.x1 || f.y < v.y0 - 20 || f.y > v.y1 + 20) continue;
      one(f, f.hurtT > 0.07);
    }
    for (const c of this.corpses) {                       // a quick white pop as an alien goes
      const k = c.t / 0.35;
      ctx.save(); ctx.globalAlpha = 1 - k;
      ctx.translate(c.f.x, c.f.y - 8); ctx.scale(1 + k * 0.5, 1 - k * 0.6); ctx.translate(-c.f.x, -(c.f.y - 8));
      one(c.f, true); ctx.restore();
    }
  }

  drawPlayer(ctx) {
    const s = this.s, p = this.sim.p;
    let alpha = 1;
    if (p.hazard > 0) { const k = p.hazard / HAZARD_T; alpha = k > 0.5 ? (k - 0.5) * 2 : 1 - k * 2; }
    if (p.inv > 0 && !p.hazard && Math.floor(this.t * 14) % 2 === 0) alpha *= 0.4;
    const C = this.anim.hurt > 0.7 ? SUITS.flash : s.gold ? this.goldC : this.suitC;
    // helmet lamps throw a soft light ahead
    const lg = s.glowSprite('rgba(254,243,199,.22)');
    ctx.globalAlpha = 0.8 * alpha; ctx.drawImage(lg, p.x + p.face * 14 - 22, p.y - 52, 44, 44); ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(p.face, 1);
    ctx.globalAlpha = alpha;
    drawAstronaut(ctx, this.pose(), C, { lamp: 1, led: Math.floor(this.t * 2) % 2 === 0 });
    if (p.atk) drawSlashArc(ctx, p.atk.kind, p.atk.t / SLASH_T, C);
    ctx.restore();
  }

  drawShots(ctx) {
    ctx.lineCap = 'round';
    for (const b of this.sim.bolts) {
      const l = 9, dx = Math.sign(b.vx), dy = Math.sign(b.vy);
      ctx.strokeStyle = 'rgba(34,211,238,.35)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(b.x - dx * l, b.y - dy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#a5f3fc'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; ctx.stroke();
    }
    for (const g of this.sim.globs) {
      ctx.fillStyle = 'rgba(163,230,53,.35)'; ctx.beginPath(); ctx.arc(g.x, g.y, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a3e635'; ctx.beginPath(); ctx.arc(g.x, g.y, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ecfccb'; ctx.beginPath(); ctx.arc(g.x - 1.2, g.y - 1.2, 1.3, 0, TAU); ctx.fill();
    }
  }

  drawParts(ctx) {
    for (const q of this.parts) {
      const a = Math.max(0, q.life / q.max);
      if (q.ring) {
        ctx.strokeStyle = q.color; ctx.globalAlpha = a; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, 6 + (1 - a) * 22, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.globalAlpha = a; ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, vh) {
    const s = this.s, p = this.sim.p, lo = this.sim.lo;
    ctx.save();
    // the explorer's helmet: the visor flashes red when hit, cracks on the last plate, glints after a kill
    const A = this.anim, hurt = A.hurt > 0 || p.hazard > 0;
    const P = { tilt: 0, look: { x: A.look.x, y: A.look.y }, visorFlash: p.dead ? 0.5 : hurt ? Math.max(0.4, A.hurt) : 0,
      crack: p.pips <= 1, glint: this.grinT > 0 ? Math.min(1, this.grinT / 0.5) : 0, visorBlade: p.atk ? 1 - p.atk.t / SLASH_T : 0 };
    const ringCol = hurt ? '#fb7185' : s.gold ? '#fbbf24' : p.pips <= 1 ? '#fda4af' : '#67e8f9';
    ctx.fillStyle = 'rgba(2,6,23,.72)'; ctx.beginPath(); ctx.arc(34, 34, 25, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(34, 34, 23, 0, TAU); ctx.clip();
    ctx.fillStyle = this.th.sky[1]; ctx.fillRect(9, 9, 50, 50);
    ctx.translate(33 + (hurt ? Math.sin(this.t * 70) * 1.2 : 0), 33); ctx.scale(3.7, 3.7);
    drawPortrait(ctx, P, s.gold ? this.goldC : this.suitC);
    ctx.restore();
    ctx.strokeStyle = ringCol; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(34, 34, 24, 0, TAU); ctx.stroke();
    // suit armour plates
    for (let i = 0; i < lo.pips; i++) {
      const x = 66 + i * 23, y = 11, full = i < p.pips, fl = this.pipFlash[i] > 0;
      plate(ctx, x + (fl ? Math.sin(this.t * 60) * 1.5 : 0), y, full, fl, s.gold);
    }
    // blaster energy cells
    for (let i = 0; i < lo.energy; i++) {
      const x = 67 + i * 12, y = 40, on = i < p.energy;
      ctx.fillStyle = 'rgba(2,6,23,.7)'; roundRect(ctx, x - 1, y - 1, 10, 8, 2); ctx.fill();
      ctx.fillStyle = on ? '#22d3ee' : 'rgba(34,211,238,.14)'; roundRect(ctx, x, y, 8, 6, 1.5); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(236,254,255,.7)'; ctx.fillRect(x + 1, y + 1, 6, 1.2); }
    }
    // star dust
    ctx.font = '800 13px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2,6,23,.55)'; roundRect(ctx, W - 84, 10, 72, 22, 11); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.fillText(`✦ ${this.sim.dustGot}/${this.m.dust.length}`, W - 20, 21.5);
    // first-planet control hints
    if (this.hintT > 0) {
      ctx.globalAlpha = Math.min(1, this.hintT / 1.5);
      ctx.textAlign = 'center'; ctx.font = '700 12px system-ui';
      const lines = this.touchUI()
        ? ['Stick: run and aim · JUMP · BLADE · BLAST', 'Stick down + BLADE in mid-air: bounce off aliens and spikes']
        : ['A/D or ←→ run · Space/W jump · J or X blade · K or C blaster', 'Hold ↑ or ↓ to aim · ↓ + blade in mid-air bounces off aliens and spikes'];
      lines.forEach((l, i) => {
        const y = vh - 44 + i * 19, w = ctx.measureText(l).width + 18;
        ctx.fillStyle = 'rgba(2,6,23,.62)'; roundRect(ctx, W / 2 - w / 2, y - 9, w, 18, 9); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; ctx.fillText(l, W / 2, y + 0.5);
      });
    }
    if (s.gold) { ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.font = '800 10px system-ui'; ctx.fillStyle = '#fbbf24'; ctx.fillText('★ GOLDEN EXPLORER', 66, 56); }
    ctx.restore();
  }

  drawTouch(ctx) {
    const tb = this.btnPrev, K = this.stickPos, st = this.stick.active, p = this.sim.p;
    ctx.save();
    if (!this.inBand()) {
      ctx.fillStyle = 'rgba(6,8,26,.92)'; ctx.fillRect(0, H - PANEL, W, PANEL);
      ctx.fillStyle = 'rgba(167,139,250,.45)'; ctx.fillRect(0, H - PANEL, W, 2);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // the roller-ball stick (as in Crown Heist)
    ctx.fillStyle = '#1c1917'; ctx.strokeStyle = '#44403c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(K.x, K.y, K.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(214,211,209,.38)'; ctx.font = '700 11px system-ui';
    ctx.fillText('▲', K.x, K.y - K.r + 12); ctx.fillText('▼', K.x, K.y + K.r - 12); ctx.fillText('◀', K.x - K.r + 12, K.y); ctx.fillText('▶', K.x + K.r - 12, K.y);
    const kx = K.x + (st?.dx || 0) * K.r * 0.62, ky = K.y + (st?.dy || 0) * K.r * 0.62;
    const kg = ctx.createRadialGradient(kx - 6, ky - 6, 2, kx, ky, 26); kg.addColorStop(0, '#78716c'); kg.addColorStop(1, '#292524');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(kx, ky, 23, 0, TAU); ctx.fill();
    // buttons
    const button = (k, label, col, icon) => {
      const b = this.btn[k], on = tb[k];
      ctx.fillStyle = on ? col[1] : col[0]; ctx.strokeStyle = col[1]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      icon(b.x, b.y - b.r * 0.2, b.r);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${b.r > 33 ? 10.5 : 9.5}px system-ui`; ctx.fillText(label, b.x, b.y + b.r * 0.45);
    };
    button('jump', 'JUMP', ['#1e1b4b', '#a78bfa'], (x, y, r) => {
      ctx.strokeStyle = '#ede9fe'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x - r * 0.28, y + r * 0.08); ctx.lineTo(x, y - r * 0.22); ctx.lineTo(x + r * 0.28, y + r * 0.08); ctx.stroke();
    });
    button('slash', 'BLADE', ['#083344', '#22d3ee'], (x, y, r) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(103,232,249,.5)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + r * 0.22); ctx.lineTo(x + r * 0.32, y - r * 0.38); ctx.stroke();
      ctx.strokeStyle = '#ecfeff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x - r * 0.42, y + r * 0.34); ctx.lineTo(x - r * 0.3, y + r * 0.22); ctx.stroke();
    });
    button('shoot', 'BLAST', ['#0c2a33', '#67e8f9'], (x, y, r) => {
      ctx.fillStyle = '#ecfeff'; ctx.beginPath();
      ctx.moveTo(x + r * 0.08, y - r * 0.4); ctx.lineTo(x - r * 0.22, y + r * 0.04); ctx.lineTo(x - 0.5, y + r * 0.04); ctx.lineTo(x - r * 0.1, y + r * 0.4); ctx.lineTo(x + r * 0.24, y - r * 0.08); ctx.lineTo(x + 0.5, y - r * 0.08); ctx.closePath(); ctx.fill();
    });
    // energy badge on BLAST
    const b = this.btn.shoot;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x + b.r * 0.74, b.y - b.r * 0.74, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = p.energy ? '#67e8f9' : '#64748b'; ctx.font = '900 11px system-ui'; ctx.fillText(p.energy, b.x + b.r * 0.74, b.y - b.r * 0.74 + 0.5);
    ctx.restore();
  }
}

const FOE_COL = { crawler: '#c084fc', hopper: '#fb923c', wisp: '#67e8f9', pod: '#a3e635' };

/** Suit armour plate icon for the HUD. */
function plate(ctx, x, y, full, flash, gold) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(0, 2.5); ctx.quadraticCurveTo(0, 0, 3, 0); ctx.lineTo(15, 0); ctx.quadraticCurveTo(18, 0, 18, 2.5);
  ctx.lineTo(18, 10); ctx.quadraticCurveTo(18, 16, 9, 20); ctx.quadraticCurveTo(0, 16, 0, 10); ctx.closePath();
  ctx.fillStyle = 'rgba(2,6,23,.7)'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,6,23,.7)'; ctx.stroke();
  if (full) {
    const g = ctx.createLinearGradient(0, 0, 18, 20); g.addColorStop(0, gold ? '#fef3c7' : '#ffffff'); g.addColorStop(1, gold ? '#f59e0b' : '#94a3b8');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = gold ? '#b45309' : '#22d3ee'; ctx.fillRect(5, 6, 8, 2.2);
  } else {
    ctx.fillStyle = flash ? 'rgba(251,113,133,.85)' : 'rgba(30,41,59,.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,.55)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

/** Cosmetic decoration: glowing moss and crystals on exposed rock tops (fixed per planet). */
function makeDecor(m, name) {
  const r = makeRng(hashString('decor:' + name)), out = [];
  for (let row = 1; row < m.R; row++) for (let c = 0; c < m.C; c++) {
    if (tileAt(m, c, row) !== ROCK || tileAt(m, c, row - 1) !== 0) continue;
    const roll = r.next();
    if (roll < 0.22) out.push({ kind: 'moss', x: c * TILE + 3 + r.int(0, 8), y: row * TILE, n: r.int(2, 4) });
    else if (roll < 0.3) out.push({ kind: 'crystal', x: c * TILE + 5 + r.int(0, 12), y: row * TILE, h: r.int(6, 11) });
  }
  return out;
}

const hash2 = (c, r) => ((c * 73856093) ^ (r * 19349663)) >>> 0;

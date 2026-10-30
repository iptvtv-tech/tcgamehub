// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — Zone 6 · game 1 (the lava kingdom). Built in sections for review.
//
//  You are the Iceman, made of ice, inside an erupting volcano. Climb the shaft to the vent of
//  cold air at the top while the lava rises below — slowly, so there is time to fight the magma
//  embers that drip from above. Your size is your health: every burn melts you smaller (Full →
//  Drips → Cracks → Small), and a smaller Iceman jumps lower. Melt away completely and you lose
//  a heart; the level starts again. Ice crystals freeze you back up.
//
//  Controls on a phone: ◀ ▶ under the left thumb, JUMP and SLASH under the right (hold JUMP for a
//  higher jump). SLASH while falling, with no arrow held, is a jump-stab; while rising, an
//  up-strike. On a keyboard, ↓ + slash in mid-air is a
//  jump-stab that bounces off what it hits; ▲ + SLASH strikes upward.
//
//  Fifteen levels: twelve climbs (six shafts, each twice), the mini-bosses — the Magma Golem on
//  level 5 and the Cinder Drake on level 10 — and the final boss, the Volcano Lord on level 15.
//  Boss rules live in boss.js, their art in bossart.js. Badges: golem / drake / lord (bosses),
//  pogo3, crystals, frozen, plus the automatic level10 and score10k.
//
//  The rules live in world.js (pure, shared with check.mjs and the test bots); the art in art.js
//  and scene.js. This file is input, camera, drawing, sound and points.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Sound } from '../../assets/js/audio.js';
import { hashString } from '../../assets/js/rng.js';
import { ShaftSim, TILE, STAGES, sizeIdx, SLASH_T, EMBER_WARN, CRYSTAL_PTS, POGO_PTS, SHOT_PTS, ROCK_PTS, FOES } from './world.js';
import { mapFor, nameFor } from './levels.js';
import { BOSS_HIT_PTS, bossDazed, PILLAR_H, PILLAR_HW, PILLAR_WARN } from './boss.js';
import { drawGolem, drawDrake, drawLord, drawLeapShadow, drawPillar, drawWave, drawBoulder, drawVentSeal } from './bossart.js';
import { drawIceman, drawPuddle, drawSlashArc, drawEmber, drawDripWarn, drawCrystal, drawSpitter, drawBat, drawBrute, drawShot, drawRock, drawRockShadow, PAL } from './art.js';
import { makeScene, drawBackdrop, drawMiddle, drawShaft, drawVent, drawLava, drawForeground } from './scene.js';

const ID = 'magma-escape';
const W = 480, H = 720;
const PANEL = 150;                 // touch strip inside the box when a phone's bottom band is too short
const TAU = Math.PI * 2;
const SLASH_KEYS = new Set(['KeyX', 'KeyJ', 'KeyK', 'KeyC']);

// Original music: Phrygian dread inside the volcano (assets/js/audio.js progression 'magma').
const MUSIC = { bpm: 92, style: 'magma', lead: 'triangle', arp: [0, 1, 2, 1, 4, 2, 1, 2], oct: [12, 12, 12, 12, 12, 12, 24, 12], bass: 'half' };

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  finalLevel: 15,
  winTitle: 'You climbed out of the volcano!',
  bonusLevels: [],                 // levels 5 and 10 are mini-bosses, 15 the Volcano Lord
  comboWindow: 2.5,
  comboStep: 3,
  maxMultiplier: 5,
  music: MUSIC,
  levelTitle: (level) => `Level ${level} · ${nameFor(level)}`,
  levelInfo: (level) => LEVEL_INFO[level] || 'The lava rises faster, and more drips from above.',
  titleHint: 'Three fire bosses guard the way up: the Magma Golem, the Cinder Drake and the Volcano Lord himself.',
  create: (shell) => new MagmaEscape(shell),
});

/** What's new on each level (shown under the level banner). */
const LEVEL_INFO = {
  1: 'Climb to the cold air at the top. The lava is coming.',
  2: 'Embers drip from above. Slash them before they hop at you.',
  3: 'Spitters sit tight and lob fireballs. Slash the fireballs too.',
  4: 'Rocks fall from the dark. Watch for their shadow and step aside.',
  5: 'BOSS: the Magma Golem. Jump its shockwaves, and strike while its fists are stuck.',
  6: 'Cinder bats: they hover, screech, then dive. Move when they screech.',
  7: 'The Throat: a long, narrow climb. Keep moving.',
  8: 'Magma brutes take two hits. A jump-stab is safest.',
  10: 'BOSS: the Cinder Drake. Run when it screeches, and strike while it lies dazed.',
  11: 'Back through the gallery, and the lava is faster now.',
  15: 'FINAL BOSS: the Volcano Lord, on his throne in the crater. Three phases. Learn each one.',
};

/** Original sound effects on the shared synth (no audio files). */
const sfx = {
  play(fn) { if (!Sound.muted) try { fn(); } catch { /* audio not ready */ } },
  // the ice blade: a glassy hiss
  swish: () => sfx.play(() => { Sound.noise({ dur: 0.12, vol: 0.12, freq: 5200, to: 1400, type: 'bandpass' }); Sound.tone({ freq: 1500, to: 620, dur: 0.09, type: 'triangle', vol: 0.03 }); }),
  jump: () => sfx.play(() => { Sound.noise({ dur: 0.08, vol: 0.05, freq: 2400, to: 4200, type: 'bandpass' }); Sound.tone({ freq: 420, to: 660, dur: 0.07, type: 'sine', vol: 0.04 }); }),
  step: () => sfx.play(() => Sound.noise({ dur: 0.03, vol: 0.03, freq: 1800, to: 900 })),
  thud: () => sfx.play(() => Sound.noise({ dur: 0.09, vol: 0.1, freq: 520, to: 120 })),
  // an ember shattered: a crunch and a puff of steam
  kill: () => sfx.play(() => { Sound.noise({ dur: 0.2, vol: 0.16, freq: 3000, to: 420 }); Sound.noise({ dur: 0.3, vol: 0.07, freq: 6000, to: 3000, type: 'highpass', delay: 0.04 }); Sound.tone({ freq: 300, to: 90, dur: 0.15, type: 'square', vol: 0.05 }); }),
  // into the lava: a big hiss and the alarm
  burn: () => sfx.play(() => { Sound.noise({ dur: 0.55, vol: 0.2, freq: 6000, to: 1500, type: 'highpass' }); Sound.tone({ freq: 180, to: 60, dur: 0.3, type: 'sawtooth', vol: 0.08 }); Sound.tone({ freq: 880, dur: 0.07, type: 'square', vol: 0.04, delay: 0.06 }); Sound.tone({ freq: 660, dur: 0.09, type: 'square', vol: 0.04, delay: 0.15 }); }),
  hurt: () => sfx.play(() => { Sound.noise({ dur: 0.14, vol: 0.16, freq: 1400, to: 300 }); Sound.noise({ dur: 0.22, vol: 0.06, freq: 6000, type: 'highpass' }); }),
  // a size lost: ice cracking
  crack: () => sfx.play(() => { Sound.noise({ dur: 0.12, vol: 0.2, freq: 4200, to: 1200 }); Sound.tone({ freq: 1250, to: 300, dur: 0.12, type: 'triangle', vol: 0.05 }); }),
  freeze: () => sfx.play(() => [0, 4, 7, 12].forEach((n, i) => Sound.tone({ freq: Sound.note(76 + n), dur: 0.14, type: 'sine', vol: 0.08, delay: i * 0.05 }))),
  chime: () => sfx.play(() => [0, 7, 12].forEach((n, i) => Sound.tone({ freq: Sound.note(84 + n), dur: 0.18, type: 'triangle', vol: 0.07, delay: i * 0.045 }))),
  melt: () => sfx.play(() => { Sound.noise({ dur: 0.9, vol: 0.18, freq: 5000, to: 700, type: 'highpass' }); Sound.tone({ freq: 520, to: 90, dur: 0.8, type: 'sine', vol: 0.08 }); }),
  exit: () => sfx.play(() => { Sound.noise({ dur: 0.6, vol: 0.06, freq: 1200, to: 3000, type: 'bandpass' }); [0, 5, 9, 14].forEach((n, i) => Sound.tone({ freq: Sound.note(79 + n), dur: 0.2, type: 'sine', vol: 0.07, delay: i * 0.06 })); }),
  plop: () => sfx.play(() => Sound.tone({ freq: 160, to: 90, dur: 0.08, type: 'sine', vol: 0.06 })),
  drip: () => sfx.play(() => Sound.tone({ freq: 700, to: 280, dur: 0.12, type: 'sine', vol: 0.03 })),
  hop: () => sfx.play(() => Sound.tone({ freq: 200, to: 420, dur: 0.1, type: 'triangle', vol: 0.04 })),
  sizzle: () => sfx.play(() => Sound.noise({ dur: 0.25, vol: 0.06, freq: 6000, to: 2500, type: 'highpass' })),
  spit: () => sfx.play(() => { Sound.noise({ dur: 0.14, vol: 0.09, freq: 900, to: 2400, type: 'bandpass' }); Sound.tone({ freq: 160, to: 320, dur: 0.12, type: 'sawtooth', vol: 0.04 }); }),
  swell: () => sfx.play(() => Sound.tone({ freq: 120, to: 260, dur: 0.45, type: 'triangle', vol: 0.04 })),
  screech: () => sfx.play(() => { Sound.tone({ freq: 1400, to: 2300, dur: 0.22, type: 'sawtooth', vol: 0.035 }); Sound.tone({ freq: 1900, to: 1500, dur: 0.22, type: 'square', vol: 0.02 }); }),
  clang: () => sfx.play(() => { Sound.tone({ freq: 220, to: 140, dur: 0.12, type: 'square', vol: 0.07 }); Sound.noise({ dur: 0.1, vol: 0.12, freq: 2000, to: 600 }); }),
  smash: () => sfx.play(() => { Sound.noise({ dur: 0.16, vol: 0.14, freq: 2600, to: 500 }); Sound.tone({ freq: 900, to: 300, dur: 0.1, type: 'triangle', vol: 0.04 }); }),
  rumble: () => sfx.play(() => Sound.noise({ dur: 0.5, vol: 0.1, freq: 400, to: 90 })),
  // the bosses
  roar: (lo = 1) => sfx.play(() => { Sound.tone({ freq: 95 * lo, to: 55 * lo, dur: 0.9, type: 'sawtooth', vol: 0.12 }); Sound.tone({ freq: 142 * lo, to: 80 * lo, dur: 0.8, type: 'square', vol: 0.05 }); Sound.noise({ dur: 0.9, vol: 0.14, freq: 700, to: 160, type: 'bandpass' }); }),
  windup: () => sfx.play(() => { Sound.tone({ freq: 70, to: 140, dur: 0.6, type: 'sawtooth', vol: 0.06 }); Sound.noise({ dur: 0.6, vol: 0.05, freq: 300, to: 900, type: 'bandpass' }); }),
  slam: () => sfx.play(() => { Sound.tone({ freq: 90, to: 32, dur: 0.6, type: 'sine', vol: 0.3 }); Sound.noise({ dur: 0.55, vol: 0.28, freq: 900, to: 80 }); Sound.noise({ dur: 0.3, vol: 0.1, freq: 3000, to: 900, delay: 0.05 }); }),
  hurl: () => sfx.play(() => { Sound.noise({ dur: 0.3, vol: 0.12, freq: 400, to: 1400, type: 'bandpass' }); Sound.tone({ freq: 110, to: 70, dur: 0.25, type: 'square', vol: 0.06 }); }),
  bosshit: () => sfx.play(() => { Sound.noise({ dur: 0.25, vol: 0.2, freq: 3400, to: 500 }); Sound.tone({ freq: 160, to: 60, dur: 0.3, type: 'sawtooth', vol: 0.1 }); [0, 7].forEach((n, i) => Sound.tone({ freq: Sound.note(88 + n), dur: 0.1, type: 'triangle', vol: 0.05, delay: i * 0.04 })); }),
  rage: () => sfx.play(() => { sfx.roar(1.25); Sound.noise({ dur: 1.0, vol: 0.1, freq: 200, to: 60, delay: 0.1 }); }),
  inhale: () => sfx.play(() => Sound.noise({ dur: 0.65, vol: 0.1, freq: 500, to: 2600, type: 'bandpass' })),
  breath: () => sfx.play(() => { Sound.noise({ dur: 0.5, vol: 0.18, freq: 2200, to: 400, type: 'bandpass' }); Sound.tone({ freq: 140, to: 70, dur: 0.4, type: 'sawtooth', vol: 0.06 }); }),
  rear: () => sfx.play(() => { Sound.tone({ freq: 900, to: 1700, dur: 0.5, type: 'sawtooth', vol: 0.05 }); Sound.tone({ freq: 1250, to: 1000, dur: 0.5, type: 'square', vol: 0.03 }); }),
  dive: () => sfx.play(() => Sound.noise({ dur: 0.7, vol: 0.12, freq: 600, to: 3200, type: 'bandpass' })),
  bossdown: () => sfx.play(() => { Sound.tone({ freq: 120, to: 30, dur: 1.4, type: 'sawtooth', vol: 0.12 }); Sound.noise({ dur: 1.5, vol: 0.22, freq: 1200, to: 60 }); [0, 4, 7, 12, 16].forEach((n, i) => Sound.tone({ freq: Sound.note(72 + n), dur: 0.3, type: 'triangle', vol: 0.07, delay: 0.5 + i * 0.09 })); }),
  crouch: () => sfx.play(() => Sound.tone({ freq: 60, to: 120, dur: 0.45, type: 'sawtooth', vol: 0.07 })),
  leap: () => sfx.play(() => { Sound.noise({ dur: 0.5, vol: 0.16, freq: 300, to: 2400, type: 'bandpass' }); Sound.tone({ freq: 90, to: 260, dur: 0.4, type: 'square', vol: 0.05 }); }),
  lock: () => sfx.play(() => [0, 1, 2].forEach((i) => Sound.tone({ freq: 980, dur: 0.07, type: 'square', vol: 0.04, delay: i * 0.1 }))),
  quake: () => sfx.play(() => { Sound.tone({ freq: 70, to: 24, dur: 0.9, type: 'sine', vol: 0.36 }); Sound.noise({ dur: 0.8, vol: 0.32, freq: 700, to: 50 }); Sound.noise({ dur: 0.4, vol: 0.12, freq: 3200, to: 800, delay: 0.06 }); }),
  summon: () => sfx.play(() => { Sound.tone({ freq: 110, to: 330, dur: 0.7, type: 'sawtooth', vol: 0.06 }); Sound.noise({ dur: 0.7, vol: 0.08, freq: 600, to: 2400, type: 'bandpass' }); }),
  erupt: () => sfx.play(() => { Sound.noise({ dur: 0.6, vol: 0.2, freq: 1800, to: 300 }); Sound.tone({ freq: 120, to: 60, dur: 0.5, type: 'sawtooth', vol: 0.07 }); }),
  victory: () => sfx.play(() => [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => Sound.tone({ freq: Sound.note(72 + n), dur: 0.24, type: i < 4 ? 'triangle' : 'sine', vol: 0.08, delay: 1.1 + i * 0.12 }))),
  vent: () => sfx.play(() => { Sound.noise({ dur: 0.5, vol: 0.18, freq: 2600, to: 400 }); Sound.noise({ dur: 1.2, vol: 0.06, freq: 1600, to: 4000, type: 'bandpass', delay: 0.2 }); }),
  crash: () => sfx.play(() => { Sound.noise({ dur: 0.3, vol: 0.18, freq: 900, to: 120 }); Sound.tone({ freq: 110, to: 50, dur: 0.25, type: 'sine', vol: 0.12 }); }),
};

class MagmaEscape {
  constructor(s) {
    this.s = s; this.t = 0;
    this.runSeed = s.rng.int(1, 2147483646);
    this.parts = [];
    this.cam = { y: 0 };
    this.press = { slash: false };
    this.prev = { jump: false, slash: false };
    this.btnOn = { left: false, right: false, jump: false, slash: false };
    this.slashLit = false; this.zHeld = false; this.touchSeen = false;
    this.anim = { phase: 0, land: 0, hurt: 0, k: 1, dead: 0, flash: 0 };
    this.ctl = {};
    this.layout();
    this.listen();
    this.startLevel(1);
  }

  /** A new run: a new seed for its embers (the Daily seed makes this the same for everyone). */
  reset() { this.runSeed = this.s.rng.int(1, 2147483646); }

  startLevel(level) {
    this.level = level;
    this.m = mapFor(level);
    this.sim = new ShaftSim(this.m, level, hashString(`${this.runSeed}:${level}`));
    this.scene = makeScene(this.m, W);
    this.parts = [];
    Object.assign(this.anim, { k: this.sim.p.k, dead: 0, hurt: 0, land: 0, flash: 0 });
    this.hintT = level === 1 || this.sim.boss ? 10 : 0;
    this.snapCamera();
  }

  /** A heart lost: the level starts again, full size, the lava back in its pool. */
  onLifeLost() {
    this.sim.reset(); this.parts = [];
    Object.assign(this.anim, { k: this.sim.p.k, dead: 0, hurt: 0, flash: 0 });
    this.snapCamera();
  }
  onAction() { /* every control is read directly (keys and touch in readInput) */ }

  // ── Layout ───────────────────────────────────────────────────
  touchUI() { return this.s.coarse || this.touchSeen; }
  inBand() { return (this.s.bands?.bottom || 0) >= 150; }
  viewH() { return this.touchUI() && !this.inBand() ? H - PANEL : H; }
  layout() {
    const band = this.s.bands?.bottom || 0, inBand = band >= 150;
    const cy = inBand ? H + band * 0.5 : H - PANEL / 2;
    const r = inBand ? 44 : 40;
    // left thumb: ◀ ▶ side by side; right thumb: SLASH, and JUMP (the biggest) at the edge
    this.ctl = {
      left: { x: 58, y: cy, r }, right: { x: 58 + r * 2 + 16, y: cy, r },
      slash: { x: W - 58 - (r + 6) * 2 - 14, y: cy + 10, r: r - 2 }, jump: { x: W - 58, y: cy - 4, r: r + 6 },
    };
  }
  onBandsChange() { this.layout(); }

  // ── Input ────────────────────────────────────────────────────
  listen() {
    const s = this.s, playing = () => s.state === 'playing';
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((SLASH_KEYS.has(e.code) || e.code === 'KeyZ') && playing()) e.preventDefault();
      if (e.code === 'KeyZ') this.zHeld = true;
      if (e.repeat || !playing()) return;
      if (SLASH_KEYS.has(e.code)) this.press.slash = true;
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyZ') this.zHeld = false; });
    addEventListener('blur', () => { this.zHeld = false; });
    // a mouse click is a slash; touches are read each frame from the buttons they rest on
    s.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !this.touchSeen) { this.touchSeen = true; this.layout(); }
      if (e.pointerType === 'mouse' && e.button === 0 && playing()) this.press.slash = true;
    });
  }

  /** Which buttons fingers rest on. Each finger presses the one button it's nearest to (with a
   *  generous margin), so a thumb can slide from ◀ to ▶ or from SLASH to JUMP without lifting. */
  buttons() {
    const on = { left: false, right: false, jump: false, slash: false }, C = this.ctl;
    for (const q of this.s.input.pointers.values()) {
      let best = null, bd = 1e9;
      for (const k of ['left', 'right', 'jump', 'slash']) { const b = C[k], d = Math.hypot(q.x - b.x, q.y - b.y); if (d < b.r + 22 && d - b.r < bd) { bd = d - b.r; best = k; } }
      if (best) on[best] = true;
    }
    return on;
  }

  readInput() {
    const i = this.s.input, touch = this.touchUI();
    const tb = this.btnOn = touch ? this.buttons() : { left: false, right: false, jump: false, slash: false };
    const slashTouch = tb.slash;
    const left = i.isDown('left') || tb.left, right = i.isDown('right') || tb.right;
    const up = i.isDown('up') || i.isDown('action') || this.zHeld || tb.jump;
    const p = this.sim.p, aim = touch && !left && !right && !p.ground;     // touch: the slash aims with the fall
    const inp = {
      dir: (right ? 1 : 0) - (left ? 1 : 0),
      jumpHeld: up, jumpPress: up && !this.prev.jump,
      up: i.isDown('up') || (aim && p.vy < 0),
      down: i.isDown('down') || (aim && p.vy >= 0),
      slashPress: this.press.slash || (slashTouch && !this.prev.slash),
    };
    this.prev.jump = up; this.prev.slash = slashTouch; 
    this.press.slash = false;
    return inp;
  }

  // ── Play ─────────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    const ev = this.sim.step(this.readInput());
    for (const e of ev) this.onEvent(e);
    this.animate(dt);
    this.stepParts(dt);
    this.updateCamera(dt);
    if (this.hintT > 0) this.hintT -= dt;
    if (this.bossBarHit > 0) this.bossBarHit -= dt * 4;
  }
  idle(dt) {
    this.t += dt;
    this.animate(dt);
    this.stepParts(dt);
    this.updateCamera(dt);
  }

  /** world → screen coordinates (the shaft is the screen's width, so only y moves) */
  scr(x, y) { return [x, y - this.cam.y]; }
  near(y) { const sy = y - this.cam.y; return sy > -80 && sy < this.viewH() + 80; }

  onEvent(e) {
    const s = this.s, L = this.level, p = this.sim.p, vh = this.viewH();
    switch (e.type) {
      case 'jump': sfx.jump(); this.puff(p.x, p.y, 6, ['#cfe8f5', '#8a8098'], 60, -30); break;
      case 'land':
        this.anim.land = 1;
        if (e.hard) { sfx.thud(); this.puff(p.x, p.y, 8, ['#8a8098', '#cfe8f5'], 80, -30); } else sfx.step();
        break;
      case 'slash': sfx.swish(); break;
      case 'kill': {
        sfx.kill(); s.fx.shake(3, 0.12);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award((e.pts || 50) * L, sx, sy - 14, { chain: true, color: '#ffb060' });
        s.fx.burst(sx, sy, { colors: ['#ff7a1a', '#ffb060', '#ffd9a0'], count: 16, speed: 170, life: 0.5 });
        this.shards(e.x, e.y, 9, '#07060a'); this.steam(e.x, e.y, 8);
        break;
      }
      case 'pogo': {
        s.sound.play('bounce', 4 + e.n * 2);
        if (e.n >= 3) s.unlock('pogo3');
        const [sx, sy] = this.scr(p.x, p.y);
        s.award(POGO_PTS * L, sx, sy + 8, { color: '#cfe8f5', size: 14 });
        this.sparks(p.x, p.y + 10, 10, '#cfe8f5', 130);
        break;
      }
      case 'burn':
        sfx.burn(); s.fx.shake(6, 0.25); s.fx.flash('#ff7a1a', 0.16);
        this.anim.hurt = 1; this.anim.flash = 1; s.resetCombo();
        this.steam(e.x, this.sim.lava.y, 16); this.sparks(e.x, this.sim.lava.y, 12, '#ffb060', 160);
        break;
      case 'hurt':
        sfx.hurt(); s.fx.shake(4, 0.18);
        this.anim.hurt = 1; this.anim.flash = 1; s.resetCombo();
        this.sparks(e.x, e.y, 12, '#ffb060', 140); this.steam(e.x, e.y, 6);
        break;
      case 'stage': {
        const [sx, sy] = this.scr(p.x, p.y - 60 * p.k);
        if (e.to < e.from) {
          sfx.crack();
          s.fx.text(clamp(sx, 118, W - 118), sy, e.to === 0 ? 'TOO SMALL! FIND ICE!' : `MELTING · ${STAGES[e.to].name.toUpperCase()}`, { color: '#ffb060', size: 17, life: 1.2, rise: 26 });
          this.drops(p.x, p.y - 20, 10);
        } else {
          sfx.freeze();
          s.fx.text(clamp(sx, 100, W - 100), sy, 'FROZEN BACK UP!', { color: '#cfe8f5', size: 17, life: 1.1, rise: 26 });
          this.ring(p.x, p.y - 26, '#cfe8f5');
        }
        break;
      }
      case 'melt':
        sfx.melt(); this.anim.dead = 0.001;
        this.steam(p.x, p.y - 10, 24); this.drops(p.x, p.y - 20, 16);
        s.hurt();
        break;
      case 'crystal': {
        sfx.chime();
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(CRYSTAL_PTS * L, sx, sy - 16, { chain: true, color: '#cfe8f5', size: 16 });
        s.fx.burst(sx, sy, { colors: ['#cfe8f5', '#8fd3f0', '#ffffff'], count: 14, speed: 120, life: 0.5 });
        this.ring(e.x, e.y, '#8fd3f0');
        if (e.all) { s.unlock('crystals'); s.award(150 * L, W / 2, vh * 0.3, { color: '#cfe8f5', size: 22 }); s.fx.text(W / 2, vh * 0.3 - 30, 'EVERY CRYSTAL!', { color: '#cfe8f5', size: 20, life: 1.4 }); }
        break;
      }
      case 'exit': {
        sfx.exit();
        if (sizeIdx(p) === 3) s.unlock('frozen');
        const bonus = Math.round(e.hp) * 2 * L;
        if (bonus > 0) { s.award(bonus, W / 2, vh * 0.36, { color: '#cfe8f5', size: 22 }); s.fx.text(W / 2, vh * 0.36 - 30, `SIZE BONUS · ${STAGES[sizeIdx(p)].name.toUpperCase()}`, { color: '#cfe8f5', size: 18, life: 1.4 }); }
        this.ring(p.x, p.y - 30, '#cfe8f5');
        s.completeLevel();
        break;
      }
      case 'drip': if (this.near(e.y + 200)) sfx.drip(); break;
      case 'plop': if (this.near(e.y)) { sfx.plop(); this.sparks(e.x, e.y, 6, '#ff9a3c', 70); } break;
      case 'hop': if (this.near(e.y)) sfx.hop(); break;
      case 'sizzle': if (this.near(e.y)) { sfx.sizzle(); this.steam(e.x, e.y, 6); } break;
      case 'crack': sfx.clang(); s.fx.shake(2, 0.08); this.sparks(e.x, e.y, 10, '#ffd9a0', 140); this.shards(e.x, e.y, 4, '#07060a'); break;
      case 'swell': if (this.near(e.y)) sfx.swell(); break;
      case 'spit': if (this.near(e.y)) sfx.spit(); this.sparks(e.x, e.y, 5, '#ffb060', 70); break;
      case 'screech': if (this.near(e.y)) sfx.screech(); break;
      case 'smash': {
        sfx.smash(); this.sparks(e.x, e.y, 10, e.what === 'rock' ? '#8a8098' : '#ffb060', 140);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award((e.what === 'rock' ? ROCK_PTS : SHOT_PTS) * L, sx, sy - 10, { chain: true, color: '#cfe8f5', size: 14 });
        break;
      }
      case 'fizzle': if (this.near(e.y)) { this.steam(e.x, e.y, 3); this.sparks(e.x, e.y, 5, '#ff9a3c', 60); } break;
      case 'rockwarn': if (this.near(e.y)) sfx.rumble(); break;
      // the bosses
      case 'roar': sfx.roar(e.kind === 'drake' ? 1.6 : e.kind === 'lord' ? 0.75 : 1); s.fx.shake(e.kind === 'drake' ? 3 : e.kind === 'lord' ? 8 : 5, e.kind === 'lord' ? 0.9 : 0.5); break;
      case 'crouch': sfx.crouch(); break;
      case 'leap': sfx.leap(); s.fx.shake(4, 0.2); this.puff(e.x, e.y, 16, ['#8a8098', '#3a3446'], 220, -80); this.sparks(e.x, e.y, 12, '#ffb060', 200); break;
      case 'lock': sfx.lock(); break;
      case 'quake': sfx.quake(); s.fx.shake(12, 0.5); this.shards(e.x, e.y - 4, 18, '#1a1220'); this.sparks(e.x, e.y - 2, 24, '#ffb060', 260); this.puff(e.x, e.y, 20, ['#8a8098', '#3a3446'], 260, -70); break;
      case 'summon': sfx.summon(); break;
      case 'marks': break;
      case 'erupt': sfx.erupt(); s.fx.shake(3, 0.15); this.sparks(e.x, e.y - 20, 10, '#ffd9a0', 200); break;
      case 'windup': sfx.windup(); break;
      case 'slam': sfx.slam(); s.fx.shake(9, 0.35); this.shards(e.x, e.y - 4, 12, '#1a1220'); this.sparks(e.x, e.y - 2, 18, '#ffb060', 220); this.puff(e.x, e.y, 14, ['#8a8098', '#3a3446'], 200, -60); break;
      case 'unstick': this.puff(e.x, e.y, 8, ['#8a8098', '#3a3446'], 120, -50); break;
      case 'heave': sfx.windup(); break;
      case 'hurl': sfx.hurl(); break;
      case 'inhale': sfx.inhale(); break;
      case 'breath': sfx.breath(); this.sparks(e.x, e.y, 14, '#ffb060', 160); break;
      case 'rear': sfx.rear(); break;
      case 'dive': sfx.dive(); break;
      case 'crashdown': sfx.slam(); s.fx.shake(7, 0.3); this.shards(e.x, e.y - 4, 10, '#1a1220'); this.sparks(e.x, e.y - 4, 14, '#ffb060', 200); this.puff(e.x, e.y, 12, ['#8a8098', '#3a3446'], 180, -60); break;
      case 'recover': break;
      case 'clang': sfx.clang(); this.sparks(e.x, e.y, 10, '#cfe8f5', 150); { const [sx, sy] = this.scr(e.x, e.y); s.fx.text(sx, sy - 10, 'CLANG!', { color: '#8a8098', size: 13, life: 0.6, rise: 18 }); } break;
      case 'bosshit': {
        sfx.bosshit(); s.fx.shake(5, 0.18);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(BOSS_HIT_PTS * L, sx, sy - 20, { chain: true, color: '#ffd9a0', size: 18 });
        s.fx.burst(sx, sy, { colors: ['#fff3d6', '#ffb060', '#ff7a1a'], count: 22, speed: 220, life: 0.55 });
        this.shards(e.x, e.y, 10, '#07060a'); this.steam(e.x, e.y, 10);
        this.bossBarHit = 1;
        break;
      }
      case 'rage': {
        sfx.rage(); s.fx.shake(6, 0.6); s.fx.flash('#ff7a1a', 0.2);
        const RAGE = {
          golem: ['THE GOLEM IS ENRAGED!', 'The ice crystals grew back'],
          drake: ['THE DRAKE IS ENRAGED!', 'The ice crystals grew back'],
          lord2: ['THE VOLCANO LORD TAKES TO THE AIR!', 'Watch his shadow. Only his landings stagger him now'],
          lord3: ['THE VOLCANO LORD CALLS THE FIRE!', 'Stand between the pillars. The ice grew back'],
        }[e.kind === 'lord' ? `lord${e.phase}` : e.kind];
        s.fx.text(W / 2, vh * 0.28, RAGE[0], { color: '#ffb060', size: e.kind === 'lord' ? 18 : 20, life: 2 });
        s.fx.text(W / 2, vh * 0.28 + 28, RAGE[1], { color: '#cfe8f5', size: 13, life: 2 });
        for (const c of this.sim.crystals) this.ring(c.x, c.y, '#8fd3f0');
        break;
      }
      case 'bossdown': {
        sfx.bossdown(); s.fx.shake(10, 0.9); s.fx.flash('#ffd9a0', 0.3);
        s.unlock(e.kind);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(e.pts * L, sx, sy - 30, { color: '#ffd9a0', size: 26 });
        s.fx.burst(sx, sy, { colors: ['#fff3d6', '#ffb060', '#ff7a1a', '#8a8098'], count: 40, speed: 300, life: 0.9 });
        this.shards(e.x, e.y, 24, '#07060a'); this.steam(e.x, e.y, 20);
        s.fx.text(W / 2, vh * 0.3, `${this.sim.boss.name} DEFEATED!`, { color: '#ffd9a0', size: 22, life: 2 });
        if (e.kind === 'lord') { sfx.victory(); s.fx.text(W / 2, vh * 0.3 + 30, 'The volcano falls quiet…', { color: '#cfe8f5', size: 15, life: 2.4 }); }
        break;
      }
      case 'bossgone': {
        sfx.vent(); s.fx.shake(4, 0.3);
        const m = this.m, ex = m.exit.x, oy = TILE * 1.5;
        this.shards(ex, oy, 16, '#0d0a12'); this.sparks(ex, oy, 16, '#ffb060', 200); this.steam(ex, oy + 20, 12);
        s.fx.text(W / 2, vh * 0.3 + 32, 'THE VENT IS OPEN — CLIMB OUT!', { color: '#cfe8f5', size: 17, life: 2.2 });
        break;
      }
      case 'crash': if (this.near(e.y)) { sfx.crash(); s.fx.shake(2.5, 0.1); this.shards(e.x, e.y - 4, 8, '#1a1220'); this.puff(e.x, e.y, 8, ['#8a8098', '#3a3446'], 90, -40); } break;
    }
  }

  animate(dt) {
    const p = this.sim.p, A = this.anim;
    A.k += (p.k - A.k) * Math.min(1, dt * 7);          // the body eases to its new size
    if (p.ground && Math.abs(p.vx) > 12) A.phase += (dt * Math.abs(p.vx)) / 14;
    A.land = Math.max(0, A.land - dt * 5);
    A.hurt = Math.max(0, A.hurt - dt * 3);
    A.flash = Math.max(0, A.flash - dt * 2.5);
    if (p.dead) A.dead += dt;
    // melting: drops fall off him, more the smaller he gets
    const st = sizeIdx(p);
    if (!p.dead && st < 3 && Math.random() < dt * (3 - st) * 1.6) this.drops(p.x + (Math.random() - 0.5) * 14 * p.k, p.y - 26 * p.k, 1);
    // the lava's heat: a wisp of steam off him when it's close
    if (!p.dead && this.sim.lava.y - p.y < 90 && Math.random() < dt * 8) this.steam(p.x, p.y - 20 * p.k, 1);
  }

  snapCamera() { this.cam.y = this.camTarget(); }
  camTarget() {
    const p = this.sim.p, vh = this.viewH();
    return clamp(p.y - vh * 0.6 - (p.vy < -250 ? 40 : 0), 0, Math.max(0, this.m.h - vh));
  }
  updateCamera(dt) { this.cam.y += (this.camTarget() - this.cam.y) * (1 - Math.exp(-dt * 5.5)); }

  // world-space particles (cosmetic)
  puff(x, y, n, cols, sp, up) {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: up * Math.random(), life: 0.35 + Math.random() * 0.25, max: 0.6, size: 1 + Math.random() * 1.8, color: cols[i % cols.length], grav: 60, drag: 3 });
    this.capParts();
  }
  sparks(x, y, n, col, sp = 110) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.25, max: 0.5, size: 0.9 + Math.random() * 1.3, color: col, grav: 260, drag: 2.5 }); }
    this.capParts();
  }
  shards(x, y, n, col) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 200, life: 0.6 + Math.random() * 0.3, max: 0.9, size: 2 + Math.random() * 2.5, color: col, grav: 700, drag: 0.6, rim: true });
    this.capParts();
  }
  steam(x, y, n) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 60, life: 0.7 + Math.random() * 0.5, max: 1.2, size: 4 + Math.random() * 5, color: '#c8c0d0', grav: -20, drag: 1.5, puff: true });
    this.capParts();
  }
  drops(x, y, n) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 12, y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, life: 0.6 + Math.random() * 0.3, max: 0.9, size: 1.6 + Math.random() * 1.2, color: '#8fd3f0', grav: 620, drag: 0.5, drop: true });
    this.capParts();
  }
  ring(x, y, col) { this.parts.push({ ring: true, x, y, life: 0.45, max: 0.45, color: col }); }
  capParts() { if (this.parts.length > 380) this.parts.splice(0, this.parts.length - 380); }
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
    const s = this.s, sim = this.sim, m = this.m, vh = this.viewH(), t = this.t;
    const camY = Math.round(this.cam.y), glow = (c) => s.glowSprite(c);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, vh); ctx.clip();
    drawBackdrop(ctx, this.scene, W, vh, Math.max(0, m.h - vh - camY), t, glow);
    drawMiddle(ctx, this.scene, W, vh, camY, t);
    ctx.save(); ctx.translate(0, -camY);
    drawShaft(ctx, this.scene, m, camY, vh, sim.lava.y, t);
    const boss = sim.boss;
    if (sim.ventOpen() && !(boss && !boss.gone)) drawVent(ctx, this.scene, m, camY, vh, t, glow);
    else drawVentSeal(ctx, m, t, TILE);
    const cg = glow('rgba(143,211,240,0.75)');
    for (const c of sim.crystals) if (!c.got && this.near(c.y)) drawCrystal(ctx, c.x, c.y, t, cg);
    const eg = glow('rgba(255,122,26,0.8)');
    for (const b of sim.rocks) if (!b.dead && this.near(b.land)) drawRockShadow(ctx, b, t);
    for (const e of sim.embers) {
      if (e.dead || e.state === 'warn' || !this.near(e.y)) continue;
      const k = e.kind || 'ember';
      if (k === 'spitter') drawSpitter(ctx, e, e.x, e.y, t, eg);
      else if (k === 'bat') drawBat(ctx, e, e.x, e.y, t, eg);
      else if (k === 'brute') drawBrute(ctx, e, e.x, e.y, t, eg);
      else drawEmber(ctx, e, e.x, e.y, t, eg);
    }
    const pg = glow('rgba(255,122,26,0.8)');
    for (const q of sim.pillars) if (!q.dead && q.warn > 0) drawPillar(ctx, q, t, pg, PILLAR_H, PILLAR_HW, PILLAR_WARN);
    if (boss && !boss.gone) {
      const bg = glow(bossDazed(boss) ? 'rgba(255,217,160,0.85)' : 'rgba(255,122,26,0.7)');
      if (boss.kind === 'lord' && (boss.state === 'hunt' || boss.state === 'fall')) drawLeapShadow(ctx, boss, t);
      if (boss.kind === 'golem') drawGolem(ctx, boss, t, bg);
      else if (boss.kind === 'drake') drawDrake(ctx, boss, t, bg);
      else if (boss.state !== 'hunt') drawLord(ctx, boss, t, bg);
    }
    for (const q of sim.pillars) if (!q.dead && q.warn <= 0) drawPillar(ctx, q, t, pg, PILLAR_H, PILLAR_HW, PILLAR_WARN);
    for (const w of sim.waves) if (!w.dead) drawWave(ctx, w, t, eg);
    const sg = glow('rgba(255,154,60,0.85)');
    for (const b of sim.shots) if (!b.dead && this.near(b.y)) (b.big ? drawBoulder : drawShot)(ctx, b, sg);
    for (const b of sim.rocks) if (!b.dead && b.warn <= 0 && this.near(b.y)) drawRock(ctx, b);
    this.drawPlayer(ctx);
    this.drawParts(ctx);
    ctx.restore();
    // a bead of magma gathers where the next ember will drip
    for (const e of sim.embers) {
      if (e.dead || e.state !== 'warn') continue;
      ctx.save(); ctx.translate(0, Math.max(0, e.y - camY)); drawDripWarn(ctx, e.x, 1 - e.t / EMBER_WARN, t); ctx.restore();
    }
    drawLava(ctx, this.scene, sim.lava.y - camY, W, vh, t);
    drawForeground(ctx, this.scene, W, vh, camY, t, sim.lava.y - camY);
    if (this.anim.flash > 0) { ctx.fillStyle = `rgba(255,90,20,${(0.22 * this.anim.flash).toFixed(3)})`; ctx.fillRect(0, 0, W, vh); }
    ctx.restore();
    this.drawHud(ctx, vh);
    if (this.hintT > 0 && s.state === 'playing') this.drawHint(ctx, vh);
    if (this.touchUI()) this.drawTouch(ctx);
  }

  drawPlayer(ctx) {
    const p = this.sim.p, A = this.anim, pal = this.s.gold ? PAL.gold : PAL.ice;
    if (p.dead) { drawPuddle(ctx, p.x, p.y, A.k, A.dead, pal); return; }
    const mode = p.ground ? (Math.abs(p.vx) > 12 ? 'run' : 'idle') : p.vy < 0 ? 'jump' : 'fall';
    const st = {
      x: p.x, y: p.y, k: A.k, stage: sizeIdx(p), face: p.face, mode, phase: A.phase, t: this.t,
      slash: p.atk ? { kind: p.atk.kind, k: p.atk.t / SLASH_T } : null,
      hurt: A.hurt, blinkOut: p.inv > 0 && p.inv < 0.85 && Math.floor(this.t * 14) % 2 === 0,
      heat: clamp(1 - (this.sim.lava.y - p.y) / 260, 0, 1), land: A.land,
    };
    drawIceman(ctx, st, pal, this.s.glowSprite('rgba(255,255,255,0.9)'));
    drawSlashArc(ctx, p.x, p.y, p.face, st, A.k);
  }

  drawParts(ctx) {
    ctx.save();
    for (const q of this.parts) {
      const k = Math.max(0, q.life / q.max);
      if (q.ring) {
        ctx.globalAlpha = k; ctx.strokeStyle = q.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q.x, q.y, 34 * (1.2 - k), 0, TAU); ctx.stroke();
        continue;
      }
      if (q.puff) { ctx.globalAlpha = k * 0.28; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.6 - k), 0, TAU); ctx.fill(); continue; }
      ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = q.color;
      if (q.drop) { ctx.beginPath(); ctx.ellipse(q.x, q.y, q.size * 0.7, q.size, 0, 0, TAU); ctx.fill(); continue; }
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      if (q.rim) { ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 0.8; ctx.strokeRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); }
    }
    ctx.restore();
  }

  drawHud(ctx, vh) {
    const p = this.sim.p, m = this.m, hurt = this.anim.hurt;
    ctx.save();
    ctx.textBaseline = 'middle';
    // size: four segments of ice, one per stage
    const x = 12, y = 10, bw = 112;
    ctx.fillStyle = 'rgba(5,5,10,.62)'; roundRect(ctx, x, y, 214, 30, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(138,128,152,.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = '#8a8098'; ctx.textAlign = 'left';
    ctx.fillText('SIZE', x + 10, y + 15.5);
    for (let i = 0; i < 4; i++) {
      const sx = x + 44 + i * (bw / 4), f = clamp((p.hp - i * 25) / 25, 0, 1);
      ctx.fillStyle = '#1a1622'; roundRect(ctx, sx, y + 9, bw / 4 - 4, 12, 3); ctx.fill();
      if (f > 0) { ctx.fillStyle = hurt > 0.3 && i === Math.floor(p.hp / 25) ? '#ff9a3c' : '#cfe8f5'; roundRect(ctx, sx, y + 9, (bw / 4 - 4) * f, 12, 3); ctx.fill(); }
    }
    ctx.font = '800 11px system-ui, sans-serif'; ctx.fillStyle = p.dead ? '#ff9a3c' : sizeIdx(p) === 0 ? '#ffb060' : '#cfe8f5';
    ctx.fillText(p.dead ? 'MELTED' : STAGES[sizeIdx(p)].name.toUpperCase(), x + 44 + bw + 6, y + 15.5);
    if (this.sim.boss && !this.sim.boss.gone) { this.drawBossBar(ctx); ctx.restore(); return; }
    // the climb: the vent at the top, the Iceman, and the lava coming up behind him
    const top = 60, bot = vh - 28, X = W - 13, span = m.spawn.y + 60 - m.exit.y;
    const at = (wy) => clamp(top + ((wy - m.exit.y) / span) * (bot - top), top, bot);
    ctx.fillStyle = 'rgba(5,5,10,.55)'; roundRect(ctx, X - 5, top - 10, 10, bot - top + 20, 5); ctx.fill();
    const ly = at(this.sim.lava.y);
    ctx.fillStyle = '#ff7a1a'; roundRect(ctx, X - 3, ly, 6, bot - ly + 6, 3); ctx.fill();
    ctx.fillStyle = '#cfe8f5'; ctx.beginPath(); ctx.moveTo(X, top - 8); ctx.lineTo(X + 5, top - 2); ctx.lineTo(X, top + 4); ctx.lineTo(X - 5, top - 2); ctx.closePath(); ctx.fill();
    const py = at(p.y);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#05050a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, py, 5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** The boss's health, beside the size meter: one segment per hit, pale while it's dazed. */
  drawBossBar(ctx) {
    const b = this.sim.boss, x = 234, y = 10, w = W - x - 12, hit = this.bossBarHit || 0, dz = bossDazed(b);
    ctx.fillStyle = 'rgba(5,5,10,.66)'; roundRect(ctx, x, y, w, 30, 9); ctx.fill();
    ctx.strokeStyle = dz ? 'rgba(255,217,160,.9)' : 'rgba(255,122,26,.5)'; ctx.lineWidth = dz ? 2 : 1.2; ctx.stroke();
    ctx.font = '900 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = dz && Math.floor(this.t * 6) % 2 ? '#fff3d6' : '#ffb060';
    ctx.fillText(dz ? 'DAZED! HIT IT' : b.kind === 'lord' ? `LORD · ${'I'.repeat(b.phase)}` : b.name, x + 9, y + 15.5);
    const bx = x + 92, bw = w - 100, seg = bw / b.max;
    for (let i = 0; i < b.max; i++) {
      const on = i < b.hp;
      ctx.fillStyle = on ? (dz ? '#ffd9a0' : '#ff7a1a') : '#1a1622';
      if (on && i === b.hp - 1 && hit > 0) ctx.fillStyle = '#ffffff';
      roundRect(ctx, bx + i * seg, y + 9, seg - 2.5, 12, 3); ctx.fill();
    }
  }

  drawHint(ctx, vh) {
    const a = clamp(Math.min(this.hintT / 1.2, (10 - this.hintT) * 2), 0, 1);
    const touch = this.touchUI();
    const boss = this.sim.boss;
    const lines = boss
      ? ({
        golem: ['Your blade only hurts it while it is DAZED (glowing white).', 'Get close so it slams, JUMP the shockwave, then strike its stuck fists.'],
        drake: ['Your blade only hurts it while it is DAZED (glowing white).', 'When it screeches, RUN — it dives, crashes, and lies dazed. Then strike.'],
        lord: ['The Volcano Lord: strike only while he is DAZED (glowing white).', 'Get close so he pounds the floor, JUMP the shockwave, then strike.'],
      })[boss.kind]
      : touch
      ? ['◀ ▶ move · JUMP (hold to jump higher) · SLASH', 'SLASH while falling: jump-stab · while rising: strike up']
      : ['← → move · ↑ / Space jump · X or J slash (or click)', '↓ + slash in the air: jump-stab · ↑ + slash: strike up'];
    ctx.save(); ctx.globalAlpha = a;
    const y = vh - 78;
    ctx.fillStyle = 'rgba(5,5,10,.72)'; roundRect(ctx, 24, y, W - 48, 54, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(207,232,245,.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e0d8ea';
    ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText(lines[0], W / 2, y + 17);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#a89eba'; ctx.fillText(lines[1], W / 2, y + 37);
    ctx.restore();
  }

  drawTouch(ctx) {
    const C = this.ctl, on = this.btnOn;
    ctx.save();
    if (!this.inBand()) {
      ctx.fillStyle = 'rgba(6,5,10,.94)'; ctx.fillRect(0, H - PANEL, W, PANEL);
      ctx.fillStyle = 'rgba(138,128,152,.5)'; ctx.fillRect(0, H - PANEL, W, 1.5);
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // a stone button; lit with cold light while pressed
    const button = (b, lit, edge) => {
      if (lit) { ctx.globalAlpha = 0.55; ctx.drawImage(this.s.glowSprite('rgba(207,232,245,0.7)'), b.x - b.r * 1.6, b.y - b.r * 1.6, b.r * 3.2, b.r * 3.2); ctx.globalAlpha = 1; }
      ctx.fillStyle = lit ? 'rgba(207,232,245,.32)' : 'rgba(21,18,28,.85)'; ctx.strokeStyle = lit ? '#ffffff' : edge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    };
    for (const [k, d] of [['left', -1], ['right', 1]]) {
      const b = C[k]; button(b, on[k], 'rgba(138,128,152,.75)');
      ctx.fillStyle = on[k] ? '#ffffff' : '#c8c0d0';
      ctx.beginPath(); ctx.moveTo(b.x + d * b.r * 0.38, b.y); ctx.lineTo(b.x - d * b.r * 0.22, b.y - b.r * 0.34); ctx.lineTo(b.x - d * b.r * 0.22, b.y + b.r * 0.34); ctx.closePath(); ctx.fill();
    }
    // JUMP: an icy chevron
    { const b = C.jump; button(b, on.jump, 'rgba(207,232,245,.7)');
      ctx.strokeStyle = on.jump ? '#ffffff' : '#cfe8f5'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(b.x - b.r * 0.3, b.y + b.r * 0.02); ctx.lineTo(b.x, b.y - b.r * 0.3); ctx.lineTo(b.x + b.r * 0.3, b.y + b.r * 0.02); ctx.stroke();
      ctx.fillStyle = '#e0d8ea'; ctx.font = '800 11px system-ui, sans-serif'; ctx.fillText('JUMP', b.x, b.y + b.r * 0.5); }
    // SLASH: the ice blade
    { const b = C.slash; button(b, on.slash, 'rgba(207,232,245,.6)');
      ctx.save(); ctx.translate(b.x - 2, b.y - 6); ctx.rotate(-0.75); const r = b.r / 52;
      ctx.beginPath(); ctx.moveTo(-26 * r, -4 * r); ctx.lineTo(30 * r, 0); ctx.lineTo(-24 * r, 6 * r); ctx.closePath();
      ctx.fillStyle = '#f2fbff'; ctx.fill(); ctx.strokeStyle = '#05050a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-32 * r, 1 * r); ctx.lineTo(-26 * r, -6 * r); ctx.lineTo(-20 * r, 1 * r); ctx.lineTo(-26 * r, 8 * r); ctx.closePath(); ctx.fillStyle = '#8fd3f0'; ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#e0d8ea'; ctx.font = '800 11px system-ui, sans-serif'; ctx.fillText('SLASH', b.x, b.y + b.r * 0.55); }
    ctx.restore();
  }
}

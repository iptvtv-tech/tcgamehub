// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — Zone 6 · game 6, its Legends game (the Inferno Crystal). Built in sections
//  for review (see the project brief, claude/inferno-vault-brief.md). Section 1: break in.
//
//  The Fire King has locked the Inferno Crystal in a vault deep inside the volcano. You are the
//  Iceman: work your way down through the vault's floors to the vault door at the bottom.
//  Heat is the enemy. The fire guards' lanterns melt you, and if one finds you it throws
//  fireballs. Hide in the shadow of the alcoves, slip past, or slash a guard from BEHIND to put
//  it out (from the front your blade bounces off its flame). Lava burns. Frost shards freeze
//  you back up a size; fire opals are the loot. Get through a level unseen for the Ghost bonus.
//
//  Controls (as in Magma Escape): ← → move, ↑ or Space jump (hold for higher), X / J / click
//  slash. Phone: ◀ ▶ under the left thumb, JUMP and SLASH under the right.
//
//  The rules live in world.js (pure, shared with check.mjs and the bots); the vault's art in
//  art.js; the Iceman's own drawing is Magma Escape's (../magma-escape/art.js).
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Sound } from '../../assets/js/audio.js';
import { VaultSim, TILE, STAGES, sizeIdx, SLASH_T, bodyH, OPAL_PTS, SHARD_PTS, TAKEDOWN_PTS } from './world.js';
import { mapFor, nameFor } from './levels.js';
import { drawIceman, drawPuddle, drawSlashArc, drawCrystal, drawShot, PAL } from '../magma-escape/art.js';
import { paintMap, drawBackdrop, drawLavaTiles, drawDoor, drawOpal, drawBeam, drawGuard, drawGuardSmoke } from './art.js';

const ID = 'inferno-vault';
const W = 480, H = 720;
const PANEL = 150;                 // touch strip inside the box when a phone's bottom band is too short
const TAU = Math.PI * 2;
const SLASH_KEYS = new Set(['KeyX', 'KeyJ', 'KeyK', 'KeyC']);

// Original music: a creeping heist in a minor key with a flat second (assets/js/audio.js 'heist').
const MUSIC = { bpm: 86, style: 'heist', lead: 'triangle', arp: [0, 2, 1, 2, 0, 2, 1, 3], oct: [12, 12, 12, 12, 12, 24, 12, 12], bass: 'half' };

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  finalLevel: 15,
  winTitle: 'You broke into the Inferno Vault!',
  bonusLevels: [],
  comboWindow: 2.5,
  comboStep: 3,
  maxMultiplier: 5,
  music: MUSIC,
  levelTitle: (level) => `Level ${level} · ${nameFor(level)}`,
  levelInfo: (level) => LEVEL_INFO[level] || 'Deeper into the vault. The guards walk faster down here.',
  titleHint: 'The Fire King keeps the Inferno Crystal in a vault deep inside the volcano. His guards carry fire.',
  create: (shell) => new InfernoVault(shell),
});

/** What's new on each level (shown under the level banner). */
const LEVEL_INFO = {
  1: 'Work your way down to the vault door at the bottom. Jump the lava.',
  2: 'A fire guard. Its lantern melts you: hide in the dark alcoves until it passes.',
  3: 'Slash a guard from behind to put it out. From the front, your blade bounces off.',
  4: 'The Crucible: a sea of lava. Use the stone ledges.',
  5: 'Three guards. Get through without being seen for the Ghost bonus.',
};

/** Original sound effects on the shared synth (no audio files). */
const sfx = {
  play(fn) { if (!Sound.muted) try { fn(); } catch { /* audio not ready */ } },
  swish: () => sfx.play(() => { Sound.noise({ dur: 0.12, vol: 0.12, freq: 5200, to: 1400, type: 'bandpass' }); Sound.tone({ freq: 1500, to: 620, dur: 0.09, type: 'triangle', vol: 0.03 }); }),
  jump: () => sfx.play(() => { Sound.noise({ dur: 0.08, vol: 0.05, freq: 2400, to: 4200, type: 'bandpass' }); Sound.tone({ freq: 420, to: 660, dur: 0.07, type: 'sine', vol: 0.04 }); }),
  step: () => sfx.play(() => Sound.noise({ dur: 0.05, vol: 0.04, freq: 1800, to: 900, type: 'bandpass' })),
  thud: () => sfx.play(() => { Sound.noise({ dur: 0.12, vol: 0.09, freq: 700, to: 200 }); Sound.tone({ freq: 140, to: 80, dur: 0.1, type: 'sine', vol: 0.06 }); }),
  burn: () => sfx.play(() => { Sound.noise({ dur: 0.45, vol: 0.18, freq: 5000, to: 900, type: 'highpass' }); Sound.tone({ freq: 300, to: 120, dur: 0.3, type: 'sawtooth', vol: 0.05 }); }),
  hurt: () => sfx.play(() => { Sound.noise({ dur: 0.2, vol: 0.12, freq: 3000, to: 700 }); Sound.tone({ freq: 520, to: 200, dur: 0.18, type: 'square', vol: 0.04 }); }),
  crack: () => sfx.play(() => { Sound.noise({ dur: 0.14, vol: 0.12, freq: 4200, to: 1200 }); Sound.tone({ freq: 1800, to: 900, dur: 0.08, type: 'square', vol: 0.03 }); }),
  freeze: () => sfx.play(() => [0, 4, 7].forEach((n, i) => Sound.tone({ freq: Sound.note(84 + n), dur: 0.12, type: 'triangle', vol: 0.05, delay: i * 0.05 }))),
  melt: () => sfx.play(() => { Sound.noise({ dur: 0.9, vol: 0.14, freq: 4000, to: 500, type: 'highpass' }); Sound.tone({ freq: 500, to: 90, dur: 0.8, type: 'sine', vol: 0.06 }); }),
  chime: () => sfx.play(() => [0, 7, 12].forEach((n, i) => Sound.tone({ freq: Sound.note(88 + n), dur: 0.12, type: 'sine', vol: 0.05, delay: i * 0.04 }))),
  opal: () => sfx.play(() => [0, 5, 9].forEach((n, i) => Sound.tone({ freq: Sound.note(76 + n), dur: 0.1, type: 'triangle', vol: 0.06, delay: i * 0.05 }))),
  spotted: () => sfx.play(() => { Sound.tone({ freq: 880, to: 1320, dur: 0.14, type: 'square', vol: 0.05 }); Sound.tone({ freq: 1320, dur: 0.12, type: 'square', vol: 0.04, delay: 0.16 }); }),
  throw: () => sfx.play(() => { Sound.noise({ dur: 0.22, vol: 0.09, freq: 900, to: 2600, type: 'bandpass' }); Sound.tone({ freq: 180, to: 360, dur: 0.15, type: 'sawtooth', vol: 0.04 }); }),
  smash: () => sfx.play(() => { Sound.noise({ dur: 0.16, vol: 0.12, freq: 2600, to: 500 }); Sound.tone({ freq: 900, to: 300, dur: 0.1, type: 'triangle', vol: 0.04 }); }),
  splash: () => sfx.play(() => Sound.noise({ dur: 0.18, vol: 0.06, freq: 1600, to: 400 })),
  takedown: () => sfx.play(() => { Sound.noise({ dur: 0.5, vol: 0.16, freq: 5000, to: 600, type: 'highpass' }); Sound.tone({ freq: 220, to: 90, dur: 0.4, type: 'sine', vol: 0.07 }); [0, 3, 7].forEach((n, i) => Sound.tone({ freq: Sound.note(69 + n), dur: 0.12, type: 'triangle', vol: 0.05, delay: 0.12 + i * 0.06 })); }),
  parry: () => sfx.play(() => { Sound.tone({ freq: 240, to: 160, dur: 0.12, type: 'square', vol: 0.06 }); Sound.noise({ dur: 0.18, vol: 0.12, freq: 3200, to: 900, type: 'highpass' }); }),
  sizzle: () => sfx.play(() => Sound.noise({ dur: 0.16, vol: 0.04, freq: 6000, to: 2500, type: 'highpass' })),
  door: () => sfx.play(() => { Sound.tone({ freq: 80, to: 50, dur: 0.6, type: 'sawtooth', vol: 0.08 }); Sound.noise({ dur: 0.6, vol: 0.1, freq: 500, to: 120 }); [0, 4, 7, 12].forEach((n, i) => Sound.tone({ freq: Sound.note(72 + n), dur: 0.18, type: 'triangle', vol: 0.06, delay: 0.45 + i * 0.08 })); }),
};

class InfernoVault {
  constructor(s) {
    this.s = s; this.t = 0;
    this.parts = [];
    this.cam = { y: 0 };
    this.press = { slash: false };
    this.prev = { jump: false, slash: false };
    this.btnOn = { left: false, right: false, jump: false, slash: false };
    this.zHeld = false; this.touchSeen = false;
    this.anim = { phase: 0, land: 0, hurt: 0, k: 1, dead: 0, flash: 0, walk: new Map() };
    this.ctl = {};
    this.mapCv = null;
    this.layout();
    this.listen();
    this.startLevel(1);
  }

  startLevel(level) {
    this.level = level;
    this.m = mapFor(level);
    this.sim = new VaultSim(this.m, level);
    this.mapCv = null;
    this.parts = [];
    Object.assign(this.anim, { k: this.sim.p.k, dead: 0, hurt: 0, land: 0, flash: 0, walk: new Map() });
    this.hintT = level <= 3 ? 10 : 0;
    this.spottedOnce = false;
    this.snapCamera();
  }

  /** A heart lost: the level starts again, full size, every guard back on patrol. */
  onLifeLost() {
    this.sim.reset(); this.parts = [];
    Object.assign(this.anim, { k: this.sim.p.k, dead: 0, hurt: 0, flash: 0 });
    this.spottedOnce = false;
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
    // left thumb: ◀ ▶; right thumb: SLASH, and JUMP (the biggest) at the edge — 30 px clear of the sides
    const lx = 30 + r, jx = W - 30 - (r + 6);
    this.ctl = {
      left: { x: lx, y: cy, r }, right: { x: lx + r * 2 + 16, y: cy, r },
      slash: { x: jx - (r + 6) * 2 - 14, y: cy + 10, r: r - 2 }, jump: { x: jx, y: cy - 4, r: r + 6 },
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
    s.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !this.touchSeen) { this.touchSeen = true; this.layout(); }
      if (e.pointerType === 'mouse' && e.button === 0 && playing()) this.press.slash = true;
    });
  }

  /** Which buttons fingers rest on (each finger presses the button it's nearest to, with a margin). */
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
    const left = i.isDown('left') || tb.left, right = i.isDown('right') || tb.right;
    const up = i.isDown('up') || i.isDown('action') || this.zHeld || tb.jump;
    const p = this.sim.p, aim = touch && !left && !right && !p.ground;
    const inp = {
      dir: (right ? 1 : 0) - (left ? 1 : 0),
      jumpHeld: up, jumpPress: up && !this.prev.jump,
      up: i.isDown('up') || (aim && p.vy < 0),
      down: i.isDown('down') || (aim && p.vy >= 0),
      slashPress: this.press.slash || (tb.slash && !this.prev.slash),
    };
    this.prev.jump = up; this.prev.slash = tb.slash;
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
  }
  idle(dt) {
    this.t += dt;
    this.animate(dt);
    this.stepParts(dt);
    this.updateCamera(dt);
  }

  scr(x, y) { return [x, y - this.cam.y]; }
  near(y) { const sy = y - this.cam.y; return sy > -100 && sy < this.viewH() + 100; }

  onEvent(e) {
    const s = this.s, L = this.level, p = this.sim.p, vh = this.viewH();
    switch (e.type) {
      case 'jump': sfx.jump(); this.puff(p.x, p.y, 6, ['#cfe8f5', '#8a8098'], 60, -30); break;
      case 'land':
        this.anim.land = 1;
        if (e.hard) { sfx.thud(); this.puff(p.x, p.y, 8, ['#8a8098', '#cfe8f5'], 80, -30); } else sfx.step();
        break;
      case 'slash': sfx.swish(); break;
      case 'smash': {
        sfx.smash();
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(e.pts * L, sx, sy - 10, { chain: true, color: '#ffb060', size: 14 });
        this.sparks(e.x, e.y, 12, '#ffb060', 150); this.steam(e.x, e.y, 5);
        break;
      }
      case 'takedown': {
        sfx.takedown(); s.fx.shake(3, 0.14); s.unlock('takedown');
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(TAKEDOWN_PTS * L, sx, sy - 20, { chain: true, color: '#cfe8f5' });
        s.fx.text(sx, sy - 44, 'PUT OUT!', { color: '#cfe8f5', size: 16, life: 1 });
        this.steam(e.x, e.y, 18); this.sparks(e.x, e.y, 10, '#ff9a3c', 120);
        break;
      }
      case 'parry': sfx.parry(); s.fx.shake(2, 0.1); this.sparks(e.x, e.y, 14, '#ffd27a', 180); break;
      case 'spotted': {
        sfx.spotted(); s.resetCombo();
        const [sx, sy] = this.scr(e.x, e.y);
        if (!this.spottedOnce) { this.spottedOnce = true; s.fx.text(clamp(sx, 90, W - 90), sy - 18, 'SEEN!', { color: '#ff5a2a', size: 18, life: 1 }); }
        break;
      }
      case 'throw': if (this.near(e.y)) sfx.throw(); break;
      case 'splash': if (this.near(e.y)) { sfx.splash(); this.sparks(e.x, e.y, 8, '#ff9a3c', 90); } break;
      case 'heat': if (Math.random() < 0.6) { sfx.sizzle(); this.steam(e.x, e.y, 2); this.drops(e.x, e.y + 6, 1); } break;
      case 'burn':
        sfx.burn(); s.fx.shake(6, 0.25); s.fx.flash('#ff7a1a', 0.16);
        this.anim.hurt = 1; this.anim.flash = 1; s.resetCombo();
        this.steam(e.x, e.y + 20, 16); this.sparks(e.x, e.y + 20, 12, '#ffb060', 160);
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
      case 'shard': {
        sfx.chime();
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(SHARD_PTS * L, sx, sy - 16, { chain: true, color: '#cfe8f5', size: 16 });
        s.fx.burst(sx, sy, { colors: ['#cfe8f5', '#8fd3f0', '#ffffff'], count: 14, speed: 120, life: 0.5 });
        this.ring(e.x, e.y, '#8fd3f0');
        break;
      }
      case 'opal': {
        sfx.opal();
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(OPAL_PTS * L, sx, sy - 16, { chain: true, color: '#ffb060', size: 16 });
        s.fx.burst(sx, sy, { colors: ['#ffd27a', '#ff7a1a', '#ffffff'], count: 12, speed: 110, life: 0.45 });
        if (e.all) { s.unlock('opals'); s.award(150 * L, W / 2, vh * 0.3, { color: '#ffd27a', size: 22 }); s.fx.text(W / 2, vh * 0.3 - 30, 'EVERY OPAL!', { color: '#ffd27a', size: 20, life: 1.4 }); }
        break;
      }
      case 'exit': {
        sfx.door();
        if (sizeIdx(p) === 3) s.unlock('frozen');
        s.award(100 * L, W / 2, vh * 0.32, { color: '#ffd27a', size: 20 });
        if (e.ghost) {
          s.unlock('ghost');
          s.award(250 * L, W / 2, vh * 0.4, { color: '#cfe8f5', size: 22 });
          s.fx.text(W / 2, vh * 0.4 - 30, 'GHOST! NEVER SEEN', { color: '#cfe8f5', size: 19, life: 1.6 });
        }
        const bonus = Math.round(e.hp) * 2 * L;
        if (bonus > 0) s.award(bonus, W / 2, vh * 0.48, { color: '#cfe8f5', size: 18 });
        this.ring(p.x, p.y - 30, '#ffd27a');
        s.completeLevel();
        break;
      }
    }
  }

  animate(dt) {
    const p = this.sim.p, A = this.anim;
    A.k += (p.k - A.k) * Math.min(1, dt * 7);
    if (p.ground && Math.abs(p.vx) > 12) A.phase += (dt * Math.abs(p.vx)) / 14;
    A.land = Math.max(0, A.land - dt * 5);
    A.hurt = Math.max(0, A.hurt - dt * 3);
    A.flash = Math.max(0, A.flash - dt * 2.5);
    if (p.dead) A.dead += dt;
    for (const g of this.sim.guards) if (g.state === 'patrol') A.walk.set(g.id, (A.walk.get(g.id) || 0) + dt * 6);
    const st = sizeIdx(p);
    if (!p.dead && st < 3 && Math.random() < dt * (3 - st) * 1.6) this.drops(p.x + (Math.random() - 0.5) * 14 * p.k, p.y - 26 * p.k, 1);
  }

  snapCamera() { this.cam.y = this.camTarget(); }
  camTarget() {
    const p = this.sim.p, vh = this.viewH();
    // he goes down: keep him in the upper half, so the floor below is in view
    return clamp(p.y - vh * 0.42, 0, Math.max(0, this.m.h - vh));
  }
  updateCamera(dt) { this.cam.y += (this.camTarget() - this.cam.y) * (1 - Math.exp(-dt * 5)); }

  // world-space particles (cosmetic)
  puff(x, y, n, cols, sp, up) {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: up * Math.random(), life: 0.35 + Math.random() * 0.25, max: 0.6, size: 1 + Math.random() * 1.8, color: cols[i % cols.length], grav: 60, drag: 3 });
    this.capParts();
  }
  sparks(x, y, n, col, sp = 110) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.25, max: 0.5, size: 0.9 + Math.random() * 1.3, color: col, grav: 260, drag: 2.5 }); }
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
    const scale = Math.min(2.5, Math.max(1, Math.round((ctx.canvas.width / W) * 4) / 4));   // device pixels per game pixel
    if (!this.mapCv || this.mapScale !== scale) { this.mapCv = paintMap(m, scale); this.mapScale = scale; }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, vh); ctx.clip();
    drawBackdrop(ctx, W, vh, camY, t);
    ctx.save(); ctx.translate(0, -camY);
    // the stone, drawn once per level
    const sy0 = Math.max(0, camY), sh = Math.min(m.h - sy0, vh + 2);
    if (sh > 0) ctx.drawImage(this.mapCv, 0, sy0 * scale, m.w * scale, sh * scale, 0, sy0, m.w, sh);
    const r0 = Math.floor(camY / TILE) - 1, r1 = Math.ceil((camY + vh) / TILE) + 1;
    drawLavaTiles(ctx, m, r0, r1, t, glow('rgba(255,122,26,0.85)'));
    drawDoor(ctx, m.exit, t, glow('rgba(255,150,60,0.6)'), sim.done ? 1 : 0);
    const og = glow('rgba(255,110,40,0.8)');
    for (const o of sim.opals) if (!o.got && this.near(o.y)) drawOpal(ctx, o.x, o.y, t, og);
    const cg = glow('rgba(143,211,240,0.75)');
    for (const c of sim.shards) if (!c.got && this.near(c.y)) drawCrystal(ctx, c.x, c.y, t, cg);
    // lantern beams under everything that moves
    const alarmed = sim.guards.some((g) => g.state === 'alert' || g.state === 'hunt');
    for (const g of sim.guards) if (this.near(g.y)) drawBeam(ctx, g, t, g.state === 'alert' || g.state === 'hunt');
    const gg = glow('rgba(255,122,26,0.75)');
    for (const g of sim.guards) {
      if (!this.near(g.y)) continue;
      drawGuard(ctx, g, t, gg, this.anim.walk.get(g.id) || 0);
      if (g.state === 'down') drawGuardSmoke(ctx, g, t);
    }
    const sg = glow('rgba(255,154,60,0.85)');
    for (const b of sim.shots) if (!b.dead && this.near(b.y)) drawShot(ctx, b, sg);
    this.drawPlayer(ctx);
    this.drawParts(ctx);
    ctx.restore();
    if (alarmed) { ctx.fillStyle = `rgba(255,60,20,${(0.05 + 0.03 * Math.sin(t * 6)).toFixed(3)})`; ctx.fillRect(0, 0, W, vh); }
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
      heat: 0, land: A.land,
    };
    if (p.hidden) ctx.globalAlpha = 0.55;              // in an alcove's shadow
    drawIceman(ctx, st, pal, this.s.glowSprite('rgba(255,255,255,0.9)'));
    ctx.globalAlpha = 1;
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
    }
    ctx.restore();
  }

  drawHud(ctx, vh) {
    const sim = this.sim, p = sim.p, m = this.m, hurt = this.anim.hurt;
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
    // stealth: hidden / unseen so far / seen
    const bx = 234, bwd = W - bx - 12;
    ctx.fillStyle = 'rgba(5,5,10,.62)'; roundRect(ctx, bx, y, bwd, 30, 9); ctx.fill();
    const seenNow = sim.guards.some((g) => g.state === 'alert' || (g.state === 'hunt' && g.lost === 0));
    const [txt, col] = p.hidden ? ['● HIDDEN', '#8fd3f0'] : seenNow ? ['● SEEN!', '#ff5a2a'] : sim.seen ? ['○ GHOST LOST', '#a89eba'] : ['○ UNSEEN', '#cfe8f5'];
    ctx.font = '900 11px system-ui, sans-serif'; ctx.fillStyle = col; ctx.textAlign = 'left';
    ctx.fillText(txt, bx + 10, y + 15.5);
    const got = sim.opals.filter((o) => o.got).length;
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffb060';
    ctx.fillText(`◆ ${got}/${sim.opals.length}`, bx + bwd - 10, y + 15.5);
    // the way down: the Iceman between the top of the vault and its door
    const top = 60, bot = vh - 28, X = W - 13, span = Math.max(1, m.exit.y - m.spawn.y);
    const at = (wy) => clamp(top + ((wy - m.spawn.y) / span) * (bot - top), top, bot);
    ctx.fillStyle = 'rgba(5,5,10,.55)'; roundRect(ctx, X - 5, top - 10, 10, bot - top + 20, 5); ctx.fill();
    ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(X, bot + 2, 5, 0, TAU); ctx.fill();
    const py = at(p.y);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#05050a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, py, 5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawHint(ctx, vh) {
    const a = clamp(Math.min(this.hintT / 1.2, (10 - this.hintT) * 2), 0, 1);
    const touch = this.touchUI(), L = this.level;
    const lines = L === 1
      ? (touch ? ['◀ ▶ move · JUMP (hold to jump higher) · SLASH', 'Down to the vault door. Lava burns: jump it.'] : ['← → move · ↑ / Space jump · X or J slash (or click)', 'Down to the vault door. Lava burns: jump it.'])
      : L === 2 ? ['A lantern beam melts you, and the guard throws fire.', 'Stand in a dark alcove: you are hidden there.']
      : ['Slash a guard from BEHIND to put it out.', 'From the front, the blade bounces off its flame.'];
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
    { const b = C.jump; button(b, on.jump, 'rgba(207,232,245,.7)');
      ctx.strokeStyle = on.jump ? '#ffffff' : '#cfe8f5'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(b.x - b.r * 0.3, b.y + b.r * 0.02); ctx.lineTo(b.x, b.y - b.r * 0.3); ctx.lineTo(b.x + b.r * 0.3, b.y + b.r * 0.02); ctx.stroke();
      ctx.fillStyle = '#e0d8ea'; ctx.font = '800 11px system-ui, sans-serif'; ctx.fillText('JUMP', b.x, b.y + b.r * 0.5); }
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

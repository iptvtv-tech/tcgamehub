// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — Zone 6 · game 6, its Legends game (the Inferno Crystal). Built in sections
//  for review (see the project brief, claude/inferno-vault-brief.md). Section 1: break in; section 2: the Freeze.
//
//  The Fire King has locked the Inferno Crystal in a vault deep inside the volcano. You are the
//  Iceman: work your way down through the vault's floors to the vault door at the bottom.
//  Heat is the enemy. The fire guards' lanterns melt you, and if one finds you it throws
//  fireballs. Hide in the shadow of the alcoves, slip past, or slash a guard from BEHIND to put
//  it out (from the front your blade bounces off its flame). Lava burns. Frost shards freeze
//  you back up a size; fire opals are the loot. Get through a level unseen for the Ghost bonus.
//
//  Section 2 (levels 6–10): the FREEZE. A blast of cold in front of him (↑ + FREEZE: above him)
//  turns a lava pool into an ice bridge for a few seconds, a fire guard into an ice statue that
//  one slash shatters, stops a flame jet and puts out a heat lamp. Each freeze costs a little ice.
//
//  Section 3 (levels 11–15): the deep vault. Cold vents freeze him back up; the ember key opens
//  the level's iron gates and hatches and unlocks the vault door; a guard that sees him rings the
//  alarm (every guard on that floor turns on him, and the vault heats up); brutes must be frozen
//  before the blade can shatter them; sentinels stand still and turn round now and then.
//
//  Section 4 (Legends): finish all 15 levels from level 1 without losing a life and the secret
//  level 16 opens, The Heart of the Vault. At its bottom the Inferno Crystal rests on an altar:
//  take it (legendFound) and the vault freezes over. It is Zone 6's Frost Crystal.
//
//  Controls (as in Magma Escape): ← → move, ↑ or Space jump (hold for higher), X / J / click
//  slash, F / L freeze (from level 6). Phone: ◀ ▶ under the left thumb, SLASH, FREEZE and JUMP
//  under the right.
//
//  The rules live in world.js (pure, shared with check.mjs and the bots); the vault's art in
//  art.js; the Iceman's own drawing is Magma Escape's (../magma-escape/art.js).
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Sound } from '../../assets/js/audio.js';
import { VaultSim, TILE, STAGES, sizeIdx, SLASH_T, bodyH, OPAL_PTS, SHARD_PTS, TAKEDOWN_PTS, FREEZE_COST, FREEZE_CD, KEY_PTS, ALARM_FROM, jetState, tileAtPx } from './world.js';
import { mapFor, nameFor } from './levels.js';
import { drawIceman, drawPuddle, drawSlashArc, drawCrystal, drawShot, PAL } from '../magma-escape/art.js';
import { preloadCrystal, drawCrystal as drawZoneCrystal } from '../../assets/js/eggs.js';
import { paintMap, drawBackdrop, drawLavaTiles, drawDoor, drawOpal, drawBeam, drawGuard, drawGuardSmoke, drawIce, drawJet, drawLamp, drawLampLight, drawVent, drawKey, drawGates } from './art.js';

const ID = 'inferno-vault';
const SECRET = 16, ZONE = 6;                // the secret level, and the zone whose Frost Crystal it holds
const W = 480, H = 720;
const PANEL = 150;                 // touch strip inside the box when a phone's bottom band is too short
const TAU = Math.PI * 2;
const SLASH_KEYS = new Set(['KeyX', 'KeyJ', 'KeyK', 'KeyC']);
const FREEZE_KEYS = new Set(['KeyF', 'KeyL']);

// Original music: a creeping heist in a minor key with a flat second (assets/js/audio.js 'heist').
const MUSIC = { bpm: 86, style: 'heist', lead: 'triangle', arp: [0, 2, 1, 2, 0, 2, 1, 3], oct: [12, 12, 12, 12, 12, 24, 12, 12], bass: 'half' };

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  finalLevel: 15,
  secretLevel: SECRET,
  secretTitle: '★ THE HEART OF THE VAULT ★',
  legendBadge: 'crystal',
  legendRevealDelay: 6.5,
  legendLore: 'At the very heart of the Fire King\'s vault: fire, sealed in ice.',
  legendLine: () => 'all 16 levels · not a single life lost',
  sealedHint: 'Something still burns at the heart of the vault… perhaps for an Iceman who never melts?',
  sealedHintCheckpoint: 'Legends say the heart of the vault only opens for an Iceman who starts from level 1…',
  winTitle: 'You broke into the Inferno Vault!',
  bonusLevels: [],
  comboWindow: 2.5,
  comboStep: 3,
  maxMultiplier: 5,
  music: MUSIC,
  levelTitle: (level) => (level === SECRET ? '★ THE HEART OF THE VAULT ★' : `Level ${level} · ${nameFor(level)}`),
  levelInfo: (level) => LEVEL_INFO[level] || 'Deeper into the vault. The guards walk faster down here.',
  titleHint: 'The Fire King keeps the Inferno Crystal in a vault deep inside the volcano. Legends say only an Iceman who never melts reaches its heart…',
  create: (shell) => new InfernoVault(shell),
});

/** What's new on each level (shown under the level banner). */
const LEVEL_INFO = {
  1: 'Work your way down to the vault door at the bottom. Jump the lava.',
  2: 'A fire guard. Its lantern melts you: hide in the dark alcoves until it passes.',
  3: 'Slash a guard from behind to put it out. From the front, your blade bounces off.',
  4: 'The Crucible: a sea of lava. Use the stone ledges.',
  5: 'Three guards. Get through without being seen for the Ghost bonus.',
  6: 'NEW: FREEZE (F, or the ❄ button). Freeze a lava pool into an ice bridge, then cross before it melts.',
  7: 'Flame jets roar up from the floor. Wait for the fire to die down, or freeze the vent.',
  8: 'Heat lamps swing on their chains. Stay out of their light, or freeze one out with ↑ + FREEZE.',
  9: 'Freeze a guard into an ice statue: it can\'t see you, and one slash shatters it.',
  10: 'The Furnace: lava, fire, lamps and guards. Every freeze costs you a little ice.',
  11: 'The deep vault. Find the ember key: it opens the hatch and the vault door. Cold vents freeze you back up.',
  12: 'Sentinels stand guard and turn round now and then. Slip behind one while its back is turned.',
  13: 'Brutes are too hot for your blade. Freeze one from behind, then shatter it.',
  14: 'Three guards on one floor. If one sees you, the alarm rings and they all turn on you.',
  15: 'The Fire King\'s Door. Everything the vault has stands between you and the Inferno Crystal.',
  16: 'You never melted once. The Inferno Crystal rests at the heart of the vault: take it.',
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
  freeze: () => sfx.play(() => { Sound.noise({ dur: 0.35, vol: 0.12, freq: 7000, to: 2200, type: 'bandpass' }); [0, 3, 7].forEach((n, i) => Sound.tone({ freq: Sound.note(91 + n), dur: 0.16, type: 'sine', vol: 0.04, delay: i * 0.03 })); }),
  iceUp: () => sfx.play(() => { Sound.noise({ dur: 0.25, vol: 0.08, freq: 3000, to: 6000, type: 'highpass' }); Sound.tone({ freq: 1200, to: 1800, dur: 0.2, type: 'triangle', vol: 0.03 }); }),
  creak: () => sfx.play(() => { Sound.noise({ dur: 0.2, vol: 0.06, freq: 2500, to: 1200 }); Sound.tone({ freq: 700, to: 500, dur: 0.15, type: 'square', vol: 0.02 }); }),
  thaw: () => sfx.play(() => Sound.noise({ dur: 0.5, vol: 0.08, freq: 5200, to: 1500, type: 'highpass' })),
  statue: () => sfx.play(() => { Sound.noise({ dur: 0.4, vol: 0.12, freq: 6000, to: 1800 }); [0, 5, 10].forEach((n, i) => Sound.tone({ freq: Sound.note(88 + n), dur: 0.14, type: 'triangle', vol: 0.05, delay: i * 0.05 })); }),
  shatter: () => sfx.play(() => { Sound.noise({ dur: 0.45, vol: 0.18, freq: 8000, to: 2000, type: 'highpass' }); [12, 7, 3, 0].forEach((n, i) => Sound.tone({ freq: Sound.note(84 + n), dur: 0.1, type: 'square', vol: 0.03, delay: i * 0.04 })); }),
  roar: () => sfx.play(() => { Sound.noise({ dur: 0.7, vol: 0.1, freq: 600, to: 1600, type: 'bandpass' }); Sound.tone({ freq: 90, to: 140, dur: 0.5, type: 'sawtooth', vol: 0.03 }); }),
  fizzle: () => sfx.play(() => Sound.noise({ dur: 0.3, vol: 0.07, freq: 4000, to: 900, type: 'highpass' })),
  cold: () => sfx.play(() => Sound.tone({ freq: 300, to: 220, dur: 0.12, type: 'square', vol: 0.04 })),
  key: () => sfx.play(() => { [0, 4, 7, 12, 16].forEach((n, i) => Sound.tone({ freq: Sound.note(76 + n), dur: 0.14, type: 'triangle', vol: 0.06, delay: i * 0.06 })); Sound.noise({ dur: 0.2, vol: 0.05, freq: 2000, to: 800, delay: 0.1 }); }),
  gates: () => sfx.play(() => { Sound.noise({ dur: 0.9, vol: 0.09, freq: 400, to: 150 }); Sound.tone({ freq: 70, to: 55, dur: 0.8, type: 'sawtooth', vol: 0.05 }); }),
  locked: () => sfx.play(() => { Sound.tone({ freq: 160, to: 120, dur: 0.12, type: 'square', vol: 0.06 }); Sound.noise({ dur: 0.1, vol: 0.06, freq: 1200, to: 500 }); }),
  chill: () => sfx.play(() => Sound.noise({ dur: 0.25, vol: 0.03, freq: 5000, to: 7000, type: 'bandpass' })),
  alarm: () => sfx.play(() => { for (let i = 0; i < 4; i++) { Sound.tone({ freq: 880, dur: 0.16, type: 'square', vol: 0.05, delay: i * 0.32 }); Sound.tone({ freq: 660, dur: 0.16, type: 'square', vol: 0.05, delay: i * 0.32 + 0.16 }); } }),
  door: () => sfx.play(() => { Sound.tone({ freq: 80, to: 50, dur: 0.6, type: 'sawtooth', vol: 0.08 }); Sound.noise({ dur: 0.6, vol: 0.1, freq: 500, to: 120 }); [0, 4, 7, 12].forEach((n, i) => Sound.tone({ freq: Sound.note(72 + n), dur: 0.18, type: 'triangle', vol: 0.06, delay: 0.45 + i * 0.08 })); }),
};

class InfernoVault {
  constructor(s) {
    this.s = s; this.t = 0;
    this.parts = [];
    this.cam = { y: 0 };
    this.press = { slash: false, freeze: false };
    this.prev = { jump: false, slash: false, freeze: false };
    this.btnOn = { left: false, right: false, jump: false, slash: false, freeze: false };
    this.zHeld = false; this.touchSeen = false;
    this.anim = { phase: 0, land: 0, hurt: 0, k: 1, dead: 0, flash: 0, walk: new Map() };
    this.ctl = {};
    this.mapCv = null;
    this.layout();
    this.listen();
    this.startLevel(1);
  }

  startLevel(level) {
    this.level = level; this.finale = null;
    if (level >= SECRET - 1) preloadCrystal(ZONE);
    this.m = mapFor(level);
    this.sim = new VaultSim(this.m, level);
    this.mapCv = null;
    this.parts = [];
    Object.assign(this.anim, { k: this.sim.p.k, dead: 0, hurt: 0, land: 0, flash: 0, walk: new Map() });
    this.hintT = level <= 3 || (level >= 6 && level <= 9) || (level >= 11 && level <= 13) ? 10 : 0;
    this.chilling = 0;
    this.spottedOnce = false; this.onIce = false;
    this.layout();
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
    const frz = !!this.sim?.canFreeze;
    const r = frz ? (inBand ? 40 : 37) : (inBand ? 44 : 40);
    // left thumb: ◀ ▶; right thumb: SLASH, (FREEZE,) and JUMP (the biggest) at the edge — 30 px clear of the sides
    const lx = 30 + r, jx = W - 30 - (r + 6);
    this.ctl = {
      left: { x: lx, y: cy, r }, right: { x: lx + r * 2 + 14, y: cy, r },
      jump: { x: jx, y: cy - 4, r: r + 6 },
    };
    if (frz) {
      const fr = r - 8;
      this.ctl.freeze = { x: jx - (r + 6) - fr - 10, y: cy - r * 0.55, r: fr };
      this.ctl.slash = { x: this.ctl.freeze.x - fr - (r - 4) - 6, y: cy + 14, r: r - 4 };
    } else this.ctl.slash = { x: jx - (r + 6) * 2 - 14, y: cy + 10, r: r - 2 };
  }
  onBandsChange() { this.layout(); }

  // ── Input ────────────────────────────────────────────────────
  listen() {
    const s = this.s, playing = () => s.state === 'playing';
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((SLASH_KEYS.has(e.code) || FREEZE_KEYS.has(e.code) || e.code === 'KeyZ') && playing()) e.preventDefault();
      if (e.code === 'KeyZ') this.zHeld = true;
      if (e.repeat || !playing()) return;
      if (SLASH_KEYS.has(e.code)) this.press.slash = true;
      if (FREEZE_KEYS.has(e.code)) this.press.freeze = true;
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
    const on = { left: false, right: false, jump: false, slash: false, freeze: false }, C = this.ctl;
    const keys = C.freeze ? ['left', 'right', 'jump', 'slash', 'freeze'] : ['left', 'right', 'jump', 'slash'];
    for (const q of this.s.input.pointers.values()) {
      let best = null, bd = 1e9;
      for (const k of keys) { const b = C[k], d = Math.hypot(q.x - b.x, q.y - b.y); if (d < b.r + 22 && d - b.r < bd) { bd = d - b.r; best = k; } }
      if (best) on[best] = true;
    }
    return on;
  }

  readInput() {
    const i = this.s.input, touch = this.touchUI();
    const tb = this.btnOn = touch ? this.buttons() : { left: false, right: false, jump: false, slash: false, freeze: false };
    const left = i.isDown('left') || tb.left, right = i.isDown('right') || tb.right;
    const up = i.isDown('up') || i.isDown('action') || this.zHeld || tb.jump;
    const p = this.sim.p, aim = touch && !left && !right && !p.ground;
    const inp = {
      dir: (right ? 1 : 0) - (left ? 1 : 0),
      jumpHeld: up, jumpPress: up && !this.prev.jump,
      up: i.isDown('up') || (aim && p.vy < 0),
      down: i.isDown('down') || (aim && p.vy >= 0),
      slashPress: this.press.slash || (tb.slash && !this.prev.slash),
      freezePress: this.press.freeze || (tb.freeze && !this.prev.freeze),
    };
    this.prev.jump = up; this.prev.slash = tb.slash; this.prev.freeze = tb.freeze;
    this.press.slash = false; this.press.freeze = false;
    return inp;
  }

  // ── Play ─────────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    const ev = this.sim.step(this.readInput());
    for (const e of ev) this.onEvent(e);
    // standing on his own ice bridge (the Cold Crossing badge)
    const p = this.sim.p;
    if (!this.onIce && p.ground && this.sim.ice.length) {
      const i = Math.floor(p.y / TILE + 0.01) * this.m.C + Math.floor(p.x / TILE);
      if (this.sim.ice.some((e) => e.i === i)) { this.onIce = true; this.s.unlock('bridge'); }
    }
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
    if (this.finale) this.stepFinale(dt);
  }

  // ── Level 16: the Inferno Crystal ────────────────────────────
  startFinale() {
    const s = this.s, d = this.m.exit;
    this.finale = { t: 0, note: 0, nextNote: 0.9, sparkT: 0, x: d.x, y: d.y };
    s.award(5000, W / 2, this.viewH() * 0.26, { color: '#ffd27a', size: 30 });
    s.fx.flash('#ffe2a8', 0.65); s.fx.shake(5, 0.4);
    sfx.statue(); sfx.key();
    this.ring(d.x, d.y - 60, '#ffd27a'); this.ring(d.x, d.y - 60, '#cfe8f5');
    s.legendFound();
  }
  stepFinale(dt) {
    const f = this.finale, p = this.sim.p;
    f.t += dt;
    // a slow, rising tune in the vault's own key, sung by the ice
    const tune = [69, 72, 76, 81, 79, 76, 77, 81, 84, 88, 86, 84, 81, 84, 88, 93];
    f.nextNote -= dt;
    if (f.nextNote <= 0 && f.note < 32) {
      const n = tune[f.note % tune.length];
      sfx.play(() => { Sound.tone({ freq: Sound.note(n), dur: 1.0, type: 'sine', vol: 0.1 }); Sound.tone({ freq: Sound.note(n - 12), dur: 0.7, type: 'triangle', vol: 0.04 }); });
      f.note++; f.nextNote = f.note % 4 === 3 ? 0.7 : 0.34;
    }
    f.sparkT -= dt;
    if (f.sparkT <= 0) {
      f.sparkT = 0.05;
      const a = Math.random() * TAU, r = 20 + Math.random() * 90, h = bodyH(p.k);
      this.parts.push({ x: p.x + Math.cos(a) * r, y: p.y - h - 40 + Math.sin(a) * r * 0.7, vx: 0, vy: -20, life: 0.9, max: 0.9, size: 1.5 + Math.random() * 2, color: Math.random() < 0.5 ? '#ffd27a' : '#cfe8f5', grav: -10, drag: 1 });
      this.capParts();
    }
  }
  /** The altar at the heart of the vault, with the Inferno Crystal floating over it (until he takes it). */
  drawAltar(ctx, d, t, glow) {
    const x = d.x, y = d.y;
    ctx.save();
    ctx.fillStyle = '#2b2226'; ctx.strokeStyle = '#07050a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.lineTo(x - 18, y - 12); ctx.lineTo(x + 18, y - 12); ctx.lineTo(x + 26, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a2e30'; ctx.fillRect(x - 12, y - 30, 24, 18); ctx.strokeRect(x - 12, y - 30, 24, 18);
    ctx.fillStyle = '#4a3c3a'; ctx.fillRect(x - 18, y - 36, 36, 6); ctx.strokeRect(x - 18, y - 36, 36, 6);
    ctx.fillStyle = '#ff9a3c'; ctx.fillRect(x - 8, y - 24, 16, 2);
    if (!this.finale) {
      const bob = Math.sin(t * 2) * 4;
      if (glow) { ctx.globalAlpha = 0.8 + Math.sin(t * 3) * 0.15; ctx.drawImage(glow, x - 60, y - 130 + bob, 120, 120); ctx.globalAlpha = 1; }
      drawZoneCrystal(ctx, x, y - 70 + bob, 54, ZONE);
    }
    ctx.restore();
  }
  /** Where the crystal is held up in the finale, and how far the reveal has got (0..1). */
  finalePos() {
    const f = this.finale, p = this.sim.p, k = Math.min(1, f.t / 1.2);
    return { k, x: p.x, y: p.y - bodyH(p.k) - 34 - k * 26 };
  }
  /** The finale, behind the Iceman: the lava freezing over, outward from him, and the crystal's rays. */
  drawFinaleBack(ctx) {
    const f = this.finale, m = this.sim.m, { k, x, y } = this.finalePos();
    // the lava freezing, outward from him
    const R = f.t * 170;
    ctx.save();
    for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) {
      if (m.t[r * m.C + c] !== 3) continue;
      const tx = c * TILE + TILE / 2, ty = r * TILE + TILE / 2, d = Math.hypot(tx - x, ty - y);
      if (d > R) continue;
      ctx.globalAlpha = Math.min(0.9, (R - d) / 120);
      ctx.fillStyle = '#bfe6f7'; ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      ctx.strokeStyle = '#f2fbff'; ctx.lineWidth = 1; ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2);
    }
    ctx.globalAlpha = 1;
    // rays
    ctx.translate(x, y);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12 + Math.sin(f.t * 0.4) * 0.01);
      ctx.fillStyle = i % 2 ? `rgba(255,210,122,${(0.16 * k).toFixed(3)})` : `rgba(207,232,245,${(0.2 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -220 * k); ctx.lineTo(10, -220 * k); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  /** The finale, in front: the Inferno Crystal held up over his head. */
  drawFinaleFront(ctx, glow) {
    const { k, x, y } = this.finalePos();
    if (glow) { ctx.globalAlpha = 0.9; ctx.drawImage(glow, x - 70, y - 70, 140, 140); ctx.globalAlpha = 1; }
    drawZoneCrystal(ctx, x, y, 50 + k * 22, ZONE);
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
          if (this.chilling > 0) s.unlock('chill');
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
      case 'freeze': {
        sfx.freeze(); this.anim.blast = { box: e.box, t: 0.35, up: e.up, dir: e.dir };
        const b = e.box;
        for (let i = 0; i < 26; i++) {
          const x = b[0] + Math.random() * (b[2] - b[0]), y = b[1] + Math.random() * (b[3] - b[1]);
          this.parts.push({ x, y, vx: (e.up ? 0 : e.dir * 40) + (Math.random() - 0.5) * 30, vy: e.up ? -30 - Math.random() * 40 : (Math.random() - 0.5) * 30, life: 0.4 + Math.random() * 0.4, max: 0.8, size: 1 + Math.random() * 2, color: i % 3 ? '#cfe8f5' : '#ffffff', grav: 0, drag: 2 });
        }
        this.capParts();
        break;
      }
      case 'cold': {
        sfx.cold();
        const [sx, sy] = this.scr(e.x, e.y);
        s.fx.text(clamp(sx, 110, W - 110), sy - 10, 'TOO LITTLE ICE TO FREEZE', { color: '#ffb060', size: 14, life: 1 });
        break;
      }
      case 'ice': {
        sfx.iceUp();
        for (const i of e.tiles) { const x = (i % this.m.C) * TILE + TILE / 2, y = Math.floor(i / this.m.C) * TILE; this.steam(x, y, 2); this.sparks(x, y, 3, '#cfe8f5', 70); }
        break;
      }
      case 'crack': if (this.near(Math.floor(e.i / this.m.C) * TILE)) sfx.creak(); break;
      case 'thaw': if (this.near(e.y)) { sfx.thaw(); this.steam(e.x, e.y, 3); } break;
      case 'statue': {
        sfx.statue(); s.unlock('statue');
        const [sx, sy] = this.scr(e.x, e.y);
        s.fx.text(sx, sy - 40, 'FROZEN!', { color: '#cfe8f5', size: 16, life: 1 });
        this.ring(e.x, e.y, '#cfe8f5'); this.sparks(e.x, e.y, 10, '#ffffff', 90);
        break;
      }
      case 'shatter': {
        sfx.shatter(); s.fx.shake(3, 0.14); s.unlock('shatter');
        if (e.kind === 'brute') s.unlock('brute');
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(e.pts * L, sx, sy - 20, { chain: true, color: '#cfe8f5' });
        s.fx.text(sx, sy - 44, 'SHATTERED!', { color: '#cfe8f5', size: 16, life: 1 });
        this.sparks(e.x, e.y, 24, '#cfe8f5', 220); this.sparks(e.x, e.y, 10, '#ffffff', 160); this.steam(e.x, e.y, 8);
        break;
      }
      case 'thawGuard': if (this.near(e.y)) { sfx.thaw(); this.steam(e.x, e.y, 10); } break;
      case 'jet': if (this.near(e.y) && Math.abs(e.y - p.y) < 200) sfx.roar(); break;
      case 'jetFrozen': case 'lampOut': sfx.iceUp(); this.sparks(e.x, e.y - 8, 10, '#cfe8f5', 90); this.steam(e.x, e.y - 8, 4); break;
      case 'lampOn': break;
      case 'fizz': sfx.fizzle(); this.steam(e.x, e.y, 4); break;
      case 'key': {
        sfx.key(); s.unlock('unlock');
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(KEY_PTS * L, sx, sy - 16, { color: '#ffb060', size: 18 });
        s.fx.text(clamp(sx, 150, W - 150), sy - 40, e.gates ? 'THE EMBER KEY! THE GATES OPEN' : 'THE EMBER KEY!', { color: '#ffd27a', size: 16, life: 1.4 });
        this.sparks(e.x, e.y, 16, '#ffb060', 140); this.ring(e.x, e.y, '#ffd27a');
        if (e.gates) { sfx.gates(); s.fx.shake(2, 0.3); for (const i of this.m.gates) { const x = (i % this.m.C) * TILE + 12, y = Math.floor(i / this.m.C) * TILE + 12; this.puff(x, y, 3, ['#8a8098', '#5a4a46'], 60, -20); } }
        break;
      }
      case 'locked': {
        sfx.locked();
        const [sx, sy] = this.scr(e.x, e.y - 70);
        s.fx.text(clamp(sx, 135, W - 135), sy, 'LOCKED · FIND THE EMBER KEY', { color: '#ffb060', size: 14, life: 1.2 });
        break;
      }
      case 'chill': this.chilling = 0.4; sfx.chill(); this.drops(e.x, e.y - 30, 0); this.sparks(p.x, p.y - 20, 2, '#cfe8f5', 40); break;
      case 'alarm': {
        sfx.alarm(); s.fx.shake(4, 0.3); s.fx.flash('#ff3a1a', 0.2);
        s.fx.text(W / 2, vh * 0.22, 'ALARM!', { color: '#ff5a2a', size: 24, life: 1.6 });
        break;
      }
      case 'alarmOff': break;
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
        if (this.level === SECRET) this.startFinale();
        else s.completeLevel();
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
    if (A.blast && (A.blast.t -= dt) <= 0) A.blast = null;
    if (this.chilling > 0) this.chilling -= dt;
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
    drawLavaTiles(ctx, sim.m, r0, r1, t, glow('rgba(255,122,26,0.85)'));
    if (sim.ice.length) drawIce(ctx, sim.m, sim.ice, t);
    if (!sim.keyGot) drawGates(ctx, m, r0, r1, t);
    if (m.heart) this.drawAltar(ctx, m.exit, t, glow('rgba(255,150,60,0.75)'));
    else drawDoor(ctx, m.exit, t, glow('rgba(255,150,60,0.6)'), sim.done ? 1 : 0, !sim.keyGot);
    const vg = glow('rgba(143,211,240,0.6)');
    for (const v of m.vents) if (this.near(v.y)) drawVent(ctx, v, t, vg);
    if (m.key && !sim.keyGot && this.near(m.key.y)) drawKey(ctx, m.key, t, glow('rgba(255,150,60,0.85)'));
    for (const l of sim.lamps) if (this.near(l.y + 80)) drawLampLight(ctx, l, sim.t);
    const jg = glow('rgba(255,110,30,0.85)');
    for (const j of sim.jets) if (this.near(j.y)) drawJet(ctx, j, jetState(j, sim.t), sim.t, jg);
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
    const lg = glow('rgba(255,190,100,0.8)');
    for (const l of sim.lamps) if (this.near(l.y)) drawLamp(ctx, l, sim.t, lg);
    if (this.finale) this.drawFinaleBack(ctx);
    this.drawPlayer(ctx);
    if (this.anim.blast) this.drawBlast(ctx, this.anim.blast);
    if (this.finale) this.drawFinaleFront(ctx, glow('rgba(255,220,160,0.9)'));
    this.drawParts(ctx);
    ctx.restore();
    if (sim.alarmT > 0) { ctx.fillStyle = `rgba(255,40,10,${(0.1 + 0.07 * Math.sin(t * 10)).toFixed(3)})`; ctx.fillRect(0, 0, W, vh); }
    else if (alarmed) { ctx.fillStyle = `rgba(255,60,20,${(0.05 + 0.03 * Math.sin(t * 6)).toFixed(3)})`; ctx.fillRect(0, 0, W, vh); }
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

  /** The cold of a freeze, for a moment: a pale wash over the box it reached. */
  drawBlast(ctx, b) {
    const k = b.t / 0.35, [x0, y0, x1, y1] = b.box;
    ctx.save();
    const g = b.up ? ctx.createLinearGradient(0, y1, 0, y0) : ctx.createLinearGradient(b.dir > 0 ? x0 : x1, 0, b.dir > 0 ? x1 : x0, 0);
    g.addColorStop(0, `rgba(230,247,255,${(0.55 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(143,211,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (b.up) { const cx = (x0 + x1) / 2; ctx.moveTo(cx - 8, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(cx + 8, y1); }
    else { const sx = b.dir > 0 ? x0 : x1, ex = b.dir > 0 ? x1 : x0, my = (y0 + y1) / 2 - 6; ctx.moveTo(sx, my - 8); ctx.lineTo(ex, y0); ctx.lineTo(ex, y1); ctx.lineTo(sx, my + 8); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
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
    const [txt, col] = sim.alarmT > 0 ? [`● ALARM ${Math.ceil(sim.alarmT)}`, Math.floor(this.t * 4) % 2 ? '#ff5a2a' : '#ffd27a'] : p.hidden ? ['● HIDDEN', '#8fd3f0'] : seenNow ? ['● SEEN!', '#ff5a2a'] : sim.seen ? ['○ GHOST LOST', '#a89eba'] : ['○ UNSEEN', '#cfe8f5'];
    ctx.font = '900 11px system-ui, sans-serif'; ctx.fillStyle = col; ctx.textAlign = 'left';
    ctx.fillText(txt, bx + 10, y + 15.5);
    const got = sim.opals.filter((o) => o.got).length;
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffb060';
    ctx.fillText(`◆ ${got}/${sim.opals.length}`, bx + bwd - 10, y + 15.5);
    if (m.key) {                                          // the ember key: still to find, or found
      ctx.fillStyle = sim.keyGot ? '#ffd27a' : '#6a6478';
      ctx.fillText(sim.keyGot ? 'KEY ✓' : 'KEY', bx + bwd - 58, y + 15.5);
    }
    // the freeze: ready, cooling down, or too little ice (keyboards; phones see it on the button)
    if (sim.canFreeze && !this.touchUI()) {
      const ready = p.frzCD <= 0 && p.hp > FREEZE_COST, cool = clamp(1 - p.frzCD / FREEZE_CD, 0, 1);
      ctx.fillStyle = 'rgba(5,5,10,.62)'; roundRect(ctx, x, y + 36, 104, 24, 8); ctx.fill();
      ctx.fillStyle = 'rgba(143,211,240,.25)'; roundRect(ctx, x, y + 36, 104 * cool, 24, 8); ctx.fill();
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = ready ? '#cfe8f5' : '#6a6478';
      ctx.fillText(p.hp > FREEZE_COST ? '❄ FREEZE · F' : '❄ TOO LITTLE ICE', x + 9, y + 48.5);
    }
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
      : L === 3 ? ['Slash a guard from BEHIND to put it out.', 'From the front, the blade bounces off its flame.']
      : L === 6 ? [touch ? 'NEW: ❄ FREEZE — face a lava pool and tap it.' : 'NEW: F (or L) to FREEZE — face a lava pool and press it.', 'It turns to ice for a few seconds. Each freeze costs a little ice.']
      : L === 7 ? ['Flame jets roar up from the floor now and then.', 'Wait for the fire to die down, or freeze the vent.']
      : L === 8 ? ['Heat lamps melt you while their light is on you.', touch ? 'Hold ▲ (JUMP) and tap ❄ to freeze a lamp above you.' : 'Hold ↑ and press F to freeze a lamp above you.']
      : L === 9 ? ['Freeze a guard into an ice statue: it can\'t see you.', 'One slash from any side shatters it.']
      : L === 11 ? ['Take the ember key: it opens the hatch and the vault door.', 'Blue mist is a cold vent: stand in it to freeze back up.']
      : L === 12 ? ['Down here a guard that sees you rings the ALARM:', 'every guard on that floor turns on you, and the vault heats up.']
      : ['Brutes are too hot for your blade.', 'Freeze one from behind, then shatter it.'];
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
    if (C.freeze) {
      const b = C.freeze, p = this.sim.p, ready = p.frzCD <= 0 && p.hp > FREEZE_COST;
      button(b, on.freeze, ready ? 'rgba(143,211,240,.9)' : 'rgba(138,128,152,.45)');
      if (!ready && p.hp > FREEZE_COST) {                       // cooling down: a sweep around the rim
        ctx.strokeStyle = 'rgba(143,211,240,.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - p.frzCD / FREEZE_CD, 0, 1)); ctx.stroke();
      }
      ctx.save(); ctx.translate(b.x, b.y - 4); ctx.strokeStyle = ready ? '#e8f7ff' : '#6a6478'; ctx.lineWidth = 2.6;
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-b.r * 0.38, 0); ctx.lineTo(b.r * 0.38, 0); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#e0d8ea'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillText('FREEZE', b.x, b.y + b.r * 0.6);
    }
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

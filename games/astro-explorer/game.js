// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — Zone 5 · Beyond, slot 29.
//
//  A side-on space explorer in the spirit of Hollow Knight: every level is a planet, a small
//  connected map. Find the exit beacon, fight what lives there with the energy blade (side,
//  up and pogo down-slashes) and the blaster (fed by blade hits), mind the spikes, and keep
//  your suit's armour plates intact. Each planet has an ability capsule (double jump, dash,
//  wall-cling, in that order) and a rest beacon: a checkpoint with a star-dust shop for armour
//  plates and blade/blaster tiers. Stand still and hold ↓ to turn energy into armour. Every 5th
//  planet is a guardian's lair (Mite Matriarch, Storm Jelly, Magma Wyrm, then round again, harder),
//  and the one after it is a treasure vault: the engine's 20-second bonus round.
//
//  The rules live in world.js (pure, shared with check.mjs, which proves every planet fair);
//  the art in art.js. This file is input, camera, drawing, the shop, sound and points.
//  Gameplay randomness: one seeded stream per planet, from the run seed (s.rng) and the planet
//  number, so the Daily Challenge gives everyone the same aliens on the same planet.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Sound } from '../../assets/js/audio.js';
import { makeRng, hashString } from '../../assets/js/rng.js';
import { Thumbstick } from '../../assets/js/thumbstick.js';
import { TILE, PH, RUN, ROCK, LEDGE, SPIKE_UP, SPIKE_DOWN, HAZARD_T, SLASH_T, DASH_T, FOCUS_COST, planetFor, stageFor, BONUS_LEVELS, PlanetSim, tileAt,
  newRun, loadoutFor, SHOP, ABILITIES, ABILITY_INFO, EXIT_RISE } from './world.js';
import { GUARDIANS } from './guardians.js';
import { astroPose, drawAstronaut, drawPortrait, drawSlashArc, SUITS, drawCrawler, drawHopper, drawWisp, drawSpitter,
  drawCapsule, drawBeacon, drawAbilityIcon, abilityColor } from './art.js';
import { drawMatriarch, drawJelly, drawWyrm, drawWyrmWake, drawBossShot, drawGate, drawChest } from './guardian-art.js';

const ID = 'astro-explorer';
const W = 480, H = 720;
const ZOOM = 2;                   // world px → screen px: the explorer is ~62 px tall, Hollow Knight-like on a portrait screen
const ZOOM_WIDE = 1.5;            // the treasure vault; a guardian's lair zooms to fit its arena plus a wall tile each side (startLevel)
const PANEL = 150;                // touch strip inside the box when a phone's bottom band is too short
const TAU = Math.PI * 2;
const JUMP_KEYS = new Set(['Space', 'KeyW', 'ArrowUp', 'KeyZ', 'Enter']);
const DASH_KEYS = new Set(['KeyL', 'ShiftLeft', 'ShiftRight', 'KeyV']);
const OWN_KEYS = new Set(['KeyJ', 'KeyK', 'KeyX', 'KeyC', 'KeyZ', 'KeyL', 'KeyV', 'ShiftLeft', 'ShiftRight']);

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
  vault: {    // a guardian's treasure vault
    sky: ['#0f0802', '#2a1606', '#4a2a0a'], far: '#24140a', near: '#33200e', planet: ['#fde68a', '#b45309'],
    rock: ['#5c3d1a', '#553816', '#664520'], rockHi: '#facc15', rockLo: '#2e1d0b', rockIn: '#3f2a12',
    ledge: '#eab308', ledgeLo: '#5a3d0a', moss: '#fde047', crystal: ['#fefce8', '#facc15', '#a16207'],
  },
};
/** the dash's afterimages: a cool, see-through suit */
const GHOST = { ...SUITS.flash, suit: '#a5f3fc', light: '#ecfeff', shade: '#67e8f9', far: '#22d3ee', joint: '#0891b2', trim: '#0e7490', pack: '#a5f3fc', packShade: '#22d3ee',
  stripe: '#67e8f9', rim: '#67e8f9', boot: '#a5f3fc', sole: '#0e7490', glove: '#cffafe', tips: '#0891b2', visor: ['#0e7490', '#22d3ee', '#ecfeff', '#0891b2', '#67e8f9'], line: 'rgba(8,51,68,.35)' };

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

// Original music (assets/js/audio.js progressions 'explorer', 'guardian', 'treasure'): a lonely,
// echoing arpeggio for the planets; the synth kit's drums and saw bass for a guardian fight; a
// quick bright run for the vault. The engine re-applies def.music after a pause, so it's a getter.
const MUSIC = {
  explore: { bpm: 84, style: 'explorer', lead: 'triangle', arp: [0, 2, 4, 2, 1, 2, 3, 1], oct: [12, 12, 12, 24, 12, 12, 24, 12], bass: 'half' },
  guardian: { bpm: 148, style: 'guardian', lead: 'sawtooth', kit: 'synth', arp: [0, 1, 2, 3, 2, 1, 4, 1], oct: [12, 12, 12, 12, 24, 12, 12, 12],
    hook: [3, null, 4, 3, 2, null, 1, 0, 3, null, 4, 5, 4, null, 3, null] },
  vault: { bpm: 150, style: 'treasure', lead: 'square', arp: [0, 1, 2, 3, 4, 3, 2, 1], oct: [12, 12, 12, 12, 12, 12, 12, 12], bass: 'drive' },
};
let tune = MUSIC.explore;
/** Switch the running music (the tempo still climbs a little with each planet, as the engine does). */
function playTune(t, level) {
  tune = t;
  if (!Sound.musicOn) return;
  Sound.startMusic(t);
  Sound.setTempo(t.bpm * Math.min(1.45, 1 + (level - 1) * 0.025));
}

const LEVEL_INFO = {
  1: 'Find the exit beacon. Blade the aliens and mind the spikes.',
  2: 'Icicles hang low in the hall, and Spore Toads jump at you.',
  3: 'Climb the chimney. Red-eyed elites take an extra hit.',
};
/** Each planet's own warning, after the first time round. */
const PLANET_INFO = {
  'Landing Site': 'Back where it began. That high shelf is in reach now.',
  'Frost Moon': 'Icicles hang low in the hall: keep your jumps short.',
  'Ember Rock': 'Cross the lava field, then up the chimney.',
  'Spore Jungle': 'Acid Pods on every ceiling. Keep moving.',
  'Dune World': 'The cavern floor is quicksand crystal. Stay on the sandstone.',
  'Nebula Reach': 'Five corridors down, and every drop is one way.',
};

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  levelName: 'Planet',
  clearText: 'PLANET CLEAR!',
  levelTitle: (level) => { const st = stageFor(level); return st.kind === 'arena' ? `Planet ${level} · Guardian` : `Planet ${level} · ${st.name}`; },
  bonusLevels: BONUS_LEVELS,       // the treasure vault after each guardian: 6, 11, 16…
  bonusTime: 20,
  comboWindow: 3,
  comboStep: 4,
  maxMultiplier: 5,
  get music() { return tune; },
  titleHint: 'Land on strange planets, blade what lives there, and find the exit beacon. Capsules give you new moves; rest beacons sell upgrades for star dust.',
  levelInfo: (level) => {
    const st = stageFor(level);
    if (st.kind === 'arena') return `The ${GUARDIANS[st.boss].name} waits beyond the gate.${st.tier ? ' It has grown stronger.' : ''} Rest at the beacon first.`;
    if (st.kind === 'vault') return 'The guardian’s treasure vault: grab the star dust and smash the chests in 20 seconds!';
    return LEVEL_INFO[level] || PLANET_INFO[st.name] || 'A new planet. Stay sharp.';
  },
  create: (shell) => new AstroExplorer(shell),
});

/** Original sound effects on the shared synth (no audio files). */
const sfx = {
  play(fn) { if (!Sound.muted) try { fn(); } catch { /* audio not ready */ } },
  // the energy blade: a bright hiss over a quick rising hum
  swish: () => sfx.play(() => { Sound.noise({ dur: 0.1, vol: 0.13, freq: 3600, to: 1000, type: 'bandpass' }); Sound.tone({ freq: 320, to: 760, dur: 0.08, type: 'sine', vol: 0.05 }); Sound.tone({ freq: 640, to: 1500, dur: 0.06, type: 'triangle', vol: 0.02 }); }),
  hit: () => sfx.play(() => { Sound.tone({ freq: 240, to: 110, dur: 0.08, type: 'square', vol: 0.08 }); Sound.noise({ dur: 0.07, vol: 0.18, freq: 2200, to: 500 }); }),
  kill: () => sfx.play(() => { Sound.noise({ dur: 0.24, vol: 0.2, freq: 1500, to: 110 }); Sound.tone({ freq: 520, to: 90, dur: 0.2, type: 'sawtooth', vol: 0.05 }); Sound.tone({ freq: 1040, to: 260, dur: 0.12, type: 'sine', vol: 0.04, delay: 0.03 }); }),
  // the blaster: a short laser chirp
  zap: () => sfx.play(() => { Sound.tone({ freq: 1700, to: 340, dur: 0.1, type: 'square', vol: 0.05 }); Sound.tone({ freq: 2600, to: 900, dur: 0.07, type: 'sine', vol: 0.04 }); }),
  // a hit on the suit: a crunch and the suit's two-tone alarm
  hurt: () => sfx.play(() => { Sound.noise({ dur: 0.16, vol: 0.2, freq: 1100, to: 200 }); Sound.tone({ freq: 880, dur: 0.07, type: 'square', vol: 0.05, delay: 0.04 }); Sound.tone({ freq: 660, dur: 0.09, type: 'square', vol: 0.05, delay: 0.12 }); }),
  spit: () => sfx.play(() => { Sound.tone({ freq: 280, to: 600, dur: 0.12, type: 'sine', vol: 0.05 }); Sound.noise({ dur: 0.06, vol: 0.05, freq: 1800, type: 'highpass' }); }),
  thud: () => sfx.play(() => Sound.noise({ dur: 0.08, vol: 0.1, freq: 520, to: 110 })),
  step: () => sfx.play(() => Sound.noise({ dur: 0.035, vol: 0.035, freq: 900, to: 300 })),
  // the jetpack's second burst
  burst: () => sfx.play(() => { Sound.noise({ dur: 0.2, vol: 0.17, freq: 700, to: 2800, type: 'bandpass' }); Sound.tone({ freq: 220, to: 480, dur: 0.14, type: 'triangle', vol: 0.05 }); }),
  dash: () => sfx.play(() => { Sound.noise({ dur: 0.22, vol: 0.18, freq: 3000, to: 450, type: 'bandpass' }); Sound.tone({ freq: 760, to: 260, dur: 0.16, type: 'sawtooth', vol: 0.025 }); }),
  grab: () => sfx.play(() => { Sound.tone({ freq: 440, to: 300, dur: 0.05, type: 'square', vol: 0.05 }); Sound.noise({ dur: 0.05, vol: 0.08, freq: 2400, type: 'highpass' }); }),
  scrape: () => sfx.play(() => Sound.noise({ dur: 0.06, vol: 0.04, freq: 3400, to: 2200, type: 'bandpass' })),
  // the energy heal: a rising shimmer, then a chord as the plate locks in
  charge: () => sfx.play(() => { Sound.tone({ freq: 220, to: 660, dur: 0.85, type: 'sine', vol: 0.05 }); Sound.tone({ freq: 330, to: 990, dur: 0.85, type: 'triangle', vol: 0.02 }); }),
  heal: () => sfx.play(() => [0, 7, 12, 16].forEach((n, i) => Sound.tone({ freq: Sound.note(72 + n), dur: 0.16, type: 'sine', vol: 0.1, delay: i * 0.05 }))),
  beep: () => sfx.play(() => { Sound.tone({ freq: 1320, dur: 0.05, type: 'sine', vol: 0.035 }); Sound.tone({ freq: 990, dur: 0.06, type: 'sine', vol: 0.03, delay: 0.09 }); }),
  crack: () => sfx.play(() => { Sound.noise({ dur: 0.1, vol: 0.2, freq: 700, to: 200 }); Sound.tone({ freq: 140, to: 90, dur: 0.08, type: 'square', vol: 0.05 }); }),
  rumble: () => sfx.play(() => { Sound.noise({ dur: 0.45, vol: 0.32, freq: 600, to: 60 }); Sound.tone({ freq: 90, to: 40, dur: 0.35, type: 'sine', vol: 0.2 }); }),
  buy: () => sfx.play(() => [0, 4, 7, 12, 16].forEach((n, i) => Sound.tone({ freq: Sound.note(72 + n), dur: 0.1, type: 'triangle', vol: 0.1, delay: i * 0.04 }))),
  nope: () => sfx.play(() => Sound.tone({ freq: 160, to: 120, dur: 0.14, type: 'square', vol: 0.07 })),
  ui: () => sfx.play(() => Sound.tone({ freq: 880, dur: 0.035, type: 'triangle', vol: 0.06 })),
  // the guardians
  gate: () => sfx.play(() => { Sound.noise({ dur: 0.35, vol: 0.3, freq: 400, to: 80 }); Sound.tone({ freq: 70, to: 45, dur: 0.4, type: 'square', vol: 0.12 }); }),
  roar: () => sfx.play(() => { Sound.tone({ freq: 110, to: 70, dur: 0.9, type: 'sawtooth', vol: 0.14 }); Sound.tone({ freq: 165, to: 98, dur: 0.8, type: 'square', vol: 0.06 }); Sound.noise({ dur: 0.8, vol: 0.14, freq: 700, to: 180 }); }),
  shriek: () => sfx.play(() => { Sound.tone({ freq: 900, to: 1500, dur: 0.5, type: 'sawtooth', vol: 0.05 }); Sound.tone({ freq: 1300, to: 900, dur: 0.5, type: 'square', vol: 0.03 }); }),
  rise: () => sfx.play(() => Sound.tone({ freq: 180, to: 520, dur: 0.5, type: 'triangle', vol: 0.07 })),
  thunder: () => sfx.play(() => { Sound.noise({ dur: 0.5, vol: 0.38, freq: 3000, to: 120 }); Sound.tone({ freq: 90, to: 40, dur: 0.4, type: 'sine', vol: 0.2 }); }),
  volley: () => sfx.play(() => { for (let i = 0; i < 3; i++) Sound.tone({ freq: 700 - i * 120, to: 300, dur: 0.12, type: 'square', vol: 0.04, delay: i * 0.03 }); }),
  boom: () => sfx.play(() => { Sound.noise({ dur: 0.7, vol: 0.45, freq: 1200, to: 50 }); Sound.tone({ freq: 140, to: 35, dur: 0.6, type: 'sine', vol: 0.32 }); }),
  clunk: () => sfx.play(() => { Sound.tone({ freq: 260, to: 180, dur: 0.07, type: 'square', vol: 0.07 }); Sound.noise({ dur: 0.05, vol: 0.1, freq: 2600, type: 'highpass' }); }),
  sizzle: () => sfx.play(() => Sound.noise({ dur: 0.25, vol: 0.1, freq: 5000, to: 2000, type: 'highpass' })),
};

class AstroExplorer {
  constructor(s) {
    this.s = s; this.t = 0;
    this.runSeed = s.rng.int(1, 2147483646);
    this.run = newRun();
    // cosmetic: starfield, background stars (Math.random is fine for looks)
    this.stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6 }));
    this.parts = []; this.corpses = []; this.trail = [];
    this.cam = { x: 0, y: 0, look: 0 };
    this.press = { jump: false, slash: false, shoot: false, dash: false };
    this.btnPrev = { jump: false, slash: false, shoot: false, dash: false };
    this.zHeld = false; this.downPrev = false;
    this.anim = { phase: 0, land: 0, hurt: 0, flame: 0, idle: 0, look: { x: 0.6, y: 0 }, aimT: 0, still: 0 };
    this.pipFlash = [];
    this.shop = null; this.banner = null; this.tip = null; this.tips = {};
    this.stickPos = { x: 92, y: H - PANEL / 2, r: 56 };
    this.stick = new Thumbstick(s, this.stickPos);
    this.btn = {};
    this.layout();
    this.listen();
    this.boot = true; this.startLevel(1, false); this.boot = false;
  }

  /** A new run: a new seed for its planets (the Daily seed makes this the same for everyone), and no upgrades. */
  reset() { this.runSeed = this.s.rng.int(1, 2147483646); this.run = newRun(); this.tips = {}; tune = MUSIC.explore; }

  startLevel(level) {
    const st = stageFor(level), def = st.def;
    this.level = level; this.stage = st;
    this.sim = new PlanetSim(def, level, hashString(`${this.runSeed}:${level}`), loadoutFor(this.run));
    this.m = this.sim.m;
    // a lair frames its arena plus one tile each side, so the gate is in view when it slams shut
    this.zoom = st.kind === 'explore' ? ZOOM : st.kind === 'arena' ? W / (this.m.arena.x1 - this.m.arena.x0 + 2 * TILE) : ZOOM_WIDE;
    this.themeKey = THEMES[def.theme] ? def.theme : 'dust';
    this.th = THEMES[this.themeKey];
    // the suit's colours on this planet: the mirrored visor reflects the planet's sky and ground
    this.suitC = { ...SUITS.normal, visor: visorFor(this.th, 0.16) };
    this.goldC = { ...SUITS.gold, visor: visorFor(this.th, 0.55) };
    this.parts = []; this.corpses = []; this.pipFlash = []; this.trail = [];
    this.shop = null; this.banner = null; this.tip = null;
    this.hintT = level === 1 ? 11 : 0;
    this.sky = null;
    // every run start comes through here too (the engine starts the music just before), so always switch tunes;
    // only the very first call, on the title screen, just picks the tune without starting the music
    const t = st.kind === 'vault' ? MUSIC.vault : MUSIC.explore;
    if (this.boot) tune = t; else playTune(t, level);
    this.beaconK = 0; this.exitK = this.sim.exitOpen ? 1 : 0; this.gateK = 1; this.title = null; this.bossBar = 0; this.gateSet = null;
    this.decor = makeDecor(this.m, def.name);
    this.snapCamera();
  }

  onLifeLost() {
    const fighting = this.sim.fight === 'on';
    this.sim.respawn(); this.parts = []; this.trail = []; this.anim.hurt = 0; this.shop = null; this.title = null; this.snapCamera();
    if (fighting) playTune(MUSIC.explore, this.level);              // the guardian waits again; so does its music
  }

  snapCamera() {
    const vw = W / this.zoom, vh = this.viewH() / this.zoom, p = this.sim.p;
    this.cam.x = clamp(p.x - vw / 2, 0, Math.max(0, this.m.w - vw));
    this.cam.y = clamp(p.y - PH / 2 - vh * 0.55, 0, Math.max(0, this.m.h - vh));
    this.cam.look = 0;
  }

  // ── Layout ───────────────────────────────────────────────────
  touchUI() { return this.s.coarse || this.stick.coarse; }
  inBand() { return (this.s.bands?.bottom || 0) >= 150; }
  viewH() { return this.touchUI() && !this.inBand() ? H - PANEL : H; }
  layout() {
    const band = this.s.bands?.bottom || 0;
    // the stick on the left; JUMP big at the bottom right, BLADE to its left, BLAST above them, DASH top right
    const cy = band >= 150 ? H + band * 0.5 : H - PANEL / 2;
    Object.assign(this.stickPos, { x: band >= 150 ? 92 : 88, y: cy, r: band >= 150 ? 56 : 52 });
    this.btn = {
      jump: { x: W - 60, y: cy + 22, r: 38 }, slash: { x: W - 150, y: cy + 28, r: 35 },
      shoot: { x: W - 112, y: cy - 40, r: 28 }, dash: { x: W - 42, y: cy - 44, r: 26 },
    };
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
      if (this.shop) { this.shopKey(c); return; }
      if (c === 'KeyJ' || c === 'KeyX') this.press.slash = true;
      else if (c === 'KeyK' || c === 'KeyC') this.press.shoot = true;
      else if (DASH_KEYS.has(c)) this.press.dash = true;
      else if (JUMP_KEYS.has(c)) this.press.jump = true;
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyZ') this.zHeld = false; });
    addEventListener('blur', () => { this.zHeld = false; });
    // mouse: left button = blade, right = blaster, middle = dash; taps on the shop and the beacon bubble
    s.canvas.addEventListener('pointerdown', (e) => {
      if (!playing()) return;
      const [x, y] = s.input.toLogical(e);
      if (this.shop) { this.shopTap(x, y); return; }
      if (this.beaconBubble && Math.hypot(x - this.beaconBubble.x, y - this.beaconBubble.y) < 34) { this.openShop(); return; }
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) this.press.slash = true; else if (e.button === 2) this.press.shoot = true; else if (e.button === 1) { this.press.dash = true; e.preventDefault(); }
    });
  }
  onAction() { /* every control is read directly (keys above, the stick and buttons in readInput) */ }

  touchButtons() {
    const out = { jump: false, slash: false, shoot: false, dash: false };
    if (!this.touchUI()) return out;
    const skip = this.stick.active?.id, keys = this.sim.ab.dash ? ['jump', 'slash', 'shoot', 'dash'] : ['jump', 'slash', 'shoot'];
    for (const [id, q] of this.s.input.pointers) {
      if (id === skip) continue;
      let best = null, bd = 1e9;                    // each finger presses the one button it's nearest to
      for (const k of keys) { const b = this.btn[k], d = Math.hypot(q.x - b.x, q.y - b.y); if (d < b.r + 12 && d - b.r < bd) { bd = d - b.r; best = k; } }
      if (best) out[best] = true;
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
      dashPress: this.press.dash || (tb.dash && !this.btnPrev.dash),
      downPress: down && !this.downPrev,
    };
    this.btnPrev = tb; this.downPrev = down;
    this.press.jump = this.press.slash = this.press.shoot = this.press.dash = false;
    return inp;
  }

  // ── Play ─────────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    if (this.shop) {                                  // shopping: the planet holds still
      this.shop.t += dt;
      if (this.shop.flashT > 0) this.shop.flashT -= dt;
      this.readInput();
      this.animate(dt, null); this.stepParts(dt);
      return;
    }
    const inp = this.readInput();
    if (inp.downPress && this.sim.atBeacon()) { this.openShop(); return; }
    const ev = this.sim.step(inp);
    for (const e of ev) this.onEvent(e);
    this.animate(dt, inp);
    this.stepParts(dt);
    this.updateCamera(dt, inp);
    this.coach(dt);
    if (this.hintT > 0) this.hintT -= dt;
    if (this.banner && (this.banner.t += dt) > 4.2) this.banner = null;
    if (this.tip && (this.tip.t -= dt) <= 0) this.tip = null;
  }
  idle(dt) {
    this.t += dt;
    this.animate(dt, null);
    this.stepParts(dt);
    if (!this.shop) this.updateCamera(dt, null);
    if (this.banner && (this.banner.t += dt) > 4.2) this.banner = null;
  }

  /** One-off tips, the first time they'd help in a run. */
  coach(dt) {
    const p = this.sim.p, lo = this.sim.lo;
    this.anim.still = p.ground && Math.abs(p.vx) < 5 && !p.atk ? this.anim.still + dt : 0;
    if (!this.tips.heal && p.pips < lo.pips && p.energy >= FOCUS_COST && this.anim.still > 1.2 && !this.sim.atBeacon()) {
      this.tips.heal = true;
      this.showTip(this.touchUI() ? 'Hold the stick down, standing still, to turn 3 energy into armour' : 'Hold ↓ standing still to turn 3 energy into an armour plate');
    }
  }
  showTip(text) { this.tip = { text, t: 5 }; }

  /** world → screen (box) coordinates, for the engine's floating texts and bursts */
  scr(x, y) { return [(x - this.cam.x) * this.zoom, (y - this.cam.y) * this.zoom]; }
  onScreen(x, y, pad = 40) { const [sx, sy] = this.scr(x, y); return sx > -pad && sx < W + pad && sy > -pad && sy < this.viewH() + pad; }

  onEvent(e) {
    const s = this.s, L = this.level, p = this.sim.p;
    switch (e.type) {
      case 'jump':
        s.sound.play('flap');
        this.puff(p.x - p.face * 6.5, p.y - 12, 7, ['#fde68a', '#fdba74', '#e2e8f0'], 50, 90);
        break;
      case 'djump':                                   // the second thruster burst
        sfx.burst(); this.anim.flame = 1;
        this.ring(p.x, p.y + 2, '#fdba74');
        this.puff(p.x, p.y - 4, 12, ['#fde68a', '#fb923c', '#fff7ed'], 90, 140);
        break;
      case 'walljump':
        s.sound.play('flap'); this.anim.flame = 1;
        this.puff(p.x + e.side * 8, p.y - 14, 8, [this.th.rockHi, '#e2e8f0'], 60, 60);
        break;
      case 'dash':
        sfx.dash(); this.trail = [];
        this.puff(p.x - e.dir * 10, p.y - 16, 10, ['#a5f3fc', '#ecfeff', '#22d3ee'], 70, -10);
        break;
      case 'cling': sfx.grab(); this.puff(p.x + e.side * 8, p.y - 18, 5, [this.th.rockHi], 30, -10); break;
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
        if (e.pts) s.award(e.pts * L, sx, sy - 14, { chain: true, color: '#fde047' });       // a guardian's minions score nothing
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
      case 'focus': sfx.charge(); break;
      case 'heal': {
        sfx.heal(); this.pipFlash[e.pips - 1] = -0.6;            // negative: the plate glows green as it fills
        const [sx, sy] = this.scr(e.x, e.y);
        s.fx.text(sx, sy - 26, '+1 ARMOUR', { size: 15, color: '#86efac', life: 0.9, rise: 26 });
        this.ring(e.x, e.y, '#86efac'); this.sparks(e.x, e.y, 14, '#bbf7d0', 110);
        break;
      }
      case 'dust': {
        this.run.wallet++; this.run.dust++;
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(10 * (this.sim.kind === 'vault' ? VL(L) : L), sx, sy - 12, { chain: true, color: '#fde047', size: 16 });
        s.sound.play('gem', s.comboCount);
        s.fx.burst(sx, sy, { color: '#fde047', count: 8, speed: 90, life: 0.45 });
        if (e.all && this.sim.kind !== 'vault') { s.award(150 * L, W / 2, this.viewH() * 0.3, { color: '#fde047', size: 22 }); s.fx.text(W / 2, this.viewH() * 0.3 - 30, 'ALL STAR DUST!', { color: '#fde047', size: 20, life: 1.4 }); }
        break;
      }
      case 'dustdrop': {
        this.run.wallet++; this.run.dust++;
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(10 * (this.sim.kind === 'vault' ? VL(L) : L), sx, sy - 10, { chain: true, color: '#fde047', size: 14 });
        if (!e.quiet) s.sound.play('gem', s.comboCount);           // dust swept up at the exit chimes once
        break;
      }
      case 'orb': s.sound.play('eat', 6); this.sparks(e.x, e.y, 6, '#67e8f9', 70); break;
      case 'repair': { s.sound.play('life'); const [sx, sy] = this.scr(e.x, e.y); s.fx.text(sx, sy - 16, '+1 ARMOUR', { size: 15, color: '#86efac', life: 0.9, rise: 26 }); break; }
      case 'beacon': {
        s.sound.play('powerup'); this.ring(e.x, e.y - 48, '#5eead4'); this.ring(e.x, e.y - 20, '#99f6e4');
        const [sx, sy] = this.scr(e.x, e.y - 70);
        s.fx.text(clamp(sx, 110, W - 110), sy - 24, 'BEACON LIT', { size: 20, color: '#5eead4', life: 1.4, rise: 18 });
        s.fx.text(clamp(sx, 110, W - 110), sy - 2, 'suit repaired', { size: 13, color: '#ccfbf1', life: 1.5, rise: 18 });
        break;
      }
      case 'capsule': {
        const [sx, sy] = this.scr(e.x, e.y);
        if (e.kind === 'cache') {
          this.run.wallet += 10; this.run.dust += 10;
          s.sound.play('golden');
          s.award(100 * L, sx, sy - 16, { color: '#fde047' });
          s.fx.text(clamp(sx, 110, W - 110), sy - 44, '+10 STAR DUST', { size: 18, color: '#fde047', life: 1.3, rise: 20 });
        } else {
          this.run.abil = this.sim.lo.abil;
          if (this.run.abil >= ABILITIES.length) s.unlock('kit');
          s.sound.play('achieve'); s.fx.flash('#ffffff', 0.2); s.fx.shake(3, 0.2);
          s.award(250 * L, sx, sy - 16, { color: abilityColor(e.kind)[1] });
          this.banner = { kind: e.kind, title: ABILITY_INFO[e.kind].name, line: this.abilityHow(e.kind), t: 0 };
        }
        this.ring(e.x, e.y, abilityColor(e.kind)[1]); this.sparks(e.x, e.y, 22, abilityColor(e.kind)[0], 170);
        break;
      }
      case 'crack':
        sfx.crack(); s.fx.shake(1.8, 0.08);
        this.sparks(e.x, e.y, 8, this.th.rockHi, 120);
        break;
      case 'break': {
        sfx.rumble(); s.fx.shake(5, 0.25);
        for (const [c, r] of e.tiles) this.rubble(c * TILE + TILE / 2, r * TILE + TILE / 2);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(50 * L, sx, sy - 10, { color: '#e9d5ff' });
        s.fx.text(clamp(sx, 90, W - 90), sy - 36, 'SECRET!', { size: 18, color: '#e9d5ff', life: 1.2, rise: 20 });
        s.unlock('secret');
        break;
      }
      // ── the guardian's lair
      case 'fight': {
        sfx.gate(); s.fx.shake(5, 0.3); this.gateK = 0;
        playTune(MUSIC.guardian, L);
        const G = GUARDIANS[e.kind];
        this.title = { name: G.name, sub: G.sub, t: 0 };
        break;
      }
      case 'roar': sfx.roar(); s.fx.shake(4, 0.6); this.ring(e.x, e.y, '#fecdd3'); break;
      case 'phase2': sfx.roar(); s.fx.shake(6, 0.5); s.fx.flash('#f43f5e', 0.12); this.ring(e.x, e.y - 10, '#fb7185'); this.ring(e.x, e.y - 10, '#fde68a'); break;
      case 'boss-tele':
        if (e.move === 'brood') sfx.shriek();
        else if (e.move === 'storm' || e.move === 'ring') sfx.rise();
        else if (e.move === 'erupt' || e.move === 'arc' || e.move === 'spit') { sfx.rumble(); s.fx.shake(2, 0.4); }
        else sfx.rise();
        break;
      case 'boss-charge': case 'boss-leap': sfx.dash(); break;
      case 'boss-slam':
        sfx.thud(); s.sound.play('boom'); s.fx.shake(e.big ? 7 : 4, 0.3);
        this.puff(e.x, e.y, 16, [this.th.rockHi, '#e2e8f0', this.th.rock[0]], 160, 90);
        break;
      case 'boss-brood': this.puff(this.m.arena.x0 + 30, this.m.arena.ceilY + 6, 8, [this.th.rockHi], 200, -60); this.puff(this.m.arena.x1 - 30, this.m.arena.ceilY + 6, 8, [this.th.rockHi], 200, -60); break;
      case 'boss-ring': sfx.volley(); this.ring(e.x, e.y, '#a5f3fc'); break;
      case 'boss-zap': sfx.thunder(); s.fx.flash('#cffafe', 0.18); s.fx.shake(4, 0.25); break;
      case 'boss-erupt':
        sfx.boom(); s.fx.shake(e.small ? 3 : 6, 0.3);
        for (let i = 0; i < (e.small ? 6 : 12); i++) this.parts.push({ x: e.x + (Math.random() - 0.5) * 24, y: e.y - 2, vx: (Math.random() - 0.5) * 240, vy: -120 - Math.random() * 260, life: 0.7 + Math.random() * 0.4, max: 1.1, size: 2 + Math.random() * 3, color: Math.random() < 0.4 ? '#fb923c' : this.th.rock[i % 3], grav: 800, drag: 0.5 });
        break;
      case 'boss-dive': this.puff(e.x, e.y, 10, ['#fb923c', this.th.rockHi], 150, 70); sfx.thud(); break;
      case 'boss-spit': sfx.spit(); break;
      case 'splat-big': sfx.sizzle(); this.sparks(e.x, e.y - 2, 8, '#fdba74', 110); break;
      case 'orb-pop': if (this.onScreen(e.x, e.y)) this.sparks(e.x, e.y, 4, '#a5f3fc', 60); break;
      case 'boss-hit':
        sfx.hit(); s.fx.shake(2, 0.07); this.bossBar = 0.25;
        this.sparks(e.x, e.y, 10, e.by === 'bolt' ? '#a5f3fc' : '#ffffff', 150);
        break;
      case 'boss-kill': {
        sfx.boom(); s.fx.shake(10, 0.6); s.fx.flash('#ffffff', 0.35);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(GUARDIANS[e.kind].pts * L, clamp(sx, 90, W - 90), sy - 30, { color: '#fde047', size: 26 });
        s.fx.text(W / 2, this.viewH() * 0.3, 'GUARDIAN DEFEATED!', { color: '#fde047', size: 28, life: 2.2, rise: 16 });
        s.unlock('guardian');
        this.title = null;
        break;
      }
      case 'boss-pop': s.sound.play('hit'); this.sparks(e.x, e.y, 14, Math.random() < 0.5 ? '#fde68a' : '#fb7185', 170); this.ring(e.x, e.y, '#fecdd3'); s.fx.shake(3, 0.12); break;
      case 'boss-dead':
        sfx.boom(); s.fx.shake(8, 0.5); this.gateK = 0.001;
        playTune(MUSIC.explore, L);
        for (let i = 0; i < 4; i++) this.ring(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 20, ['#fde68a', '#fb7185', '#c4b5fd', '#a5f3fc'][i]);
        this.sparks(e.x, e.y, 40, '#fde68a', 260);
        break;
      case 'pop': this.sparks(e.x, e.y, 10, FOE_COL[e.foe] || '#fff', 120); break;
      // ── the treasure vault
      case 'chest-hit': sfx.clunk(); this.sparks(e.x, e.y, 6, '#fde68a', 100); break;
      case 'chest': {
        s.sound.play('golden'); s.fx.shake(3, 0.15);
        const [sx, sy] = this.scr(e.x, e.y);
        s.award(50 * VL(L), sx, sy - 20, { color: '#fde047' });
        this.sparks(e.x, e.y, 18, '#fde047', 160); this.ring(e.x, e.y, '#fde68a');
        break;
      }
      case 'vault-clear':
        s.sound.play('highscore');
        s.award(300 * VL(L), W / 2, this.viewH() * 0.34, { color: '#fde047', size: 26 });
        s.fx.text(W / 2, this.viewH() * 0.34 - 32, 'VAULT CLEARED!', { color: '#fde047', size: 26, life: 1.6 });
        s.unlock('vault');
        s.completeLevel();
        break;
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

  abilityHow(kind) {
    if (!this.touchUI()) return ABILITY_INFO[kind].how;
    return { double: 'Tap JUMP again in mid-air for a second thruster burst.', dash: 'Tap DASH for a quick burst. Once more in mid-air.', cling: 'Push into a wall in mid-air to grab it, then JUMP to kick off.' }[kind];
  }

  // ── The rest beacon's shop ──────────────────────────────────
  openShop() {
    if (this.shop || !this.sim.atBeacon()) return;
    this.sim.rest();
    this.s.fx.clear();                                // no floating scores over the shop
    this.shop = { sel: 0, t: 0, flash: -1, flashT: 0, nope: -1 };
    sfx.ui();
  }
  closeShop() { this.shop = null; this.press.jump = this.press.slash = this.press.shoot = this.press.dash = false; sfx.ui(); }
  shopKey(c) {
    const sh = this.shop, n = SHOP.length + 1;           // the items, then LEAVE
    if (c === 'ArrowUp' || c === 'KeyW') { sh.sel = (sh.sel + n - 1) % n; sfx.ui(); }
    else if (c === 'ArrowDown' || c === 'KeyS') { sh.sel = (sh.sel + 1) % n; sfx.ui(); }
    else if (c === 'Space' || c === 'Enter' || c === 'KeyJ' || c === 'KeyX' || c === 'KeyZ') { if (sh.sel === SHOP.length) this.closeShop(); else this.buy(sh.sel); }
    else if (c === 'KeyK' || c === 'KeyC' || c === 'Backspace' || c === 'KeyQ') this.closeShop();
  }
  shopTap(x, y) {
    const R = this.shopRects();
    if (inRect(x, y, R.leave)) { this.closeShop(); return; }
    R.rows.forEach((r, i) => { if (inRect(x, y, r)) { this.shop.sel = i; this.buy(i); } });
  }
  buy(i) {
    const it = SHOP[i], tier = this.run[it.id], sh = this.shop;
    if (tier >= it.costs.length) { sfx.nope(); sh.nope = i; sh.flashT = 0.4; return; }
    const cost = it.costs[tier];
    if (this.run.wallet < cost) { sfx.nope(); sh.nope = i; sh.flashT = 0.4; return; }
    this.run.wallet -= cost; this.run[it.id]++;
    this.sim.setLoadout(loadoutFor(this.run));
    if (it.id !== 'plate' && this.run[it.id] >= it.costs.length) this.s.unlock('maxed');
    sfx.buy(); sh.flash = i; sh.flashT = 0.5; sh.nope = -1;
  }
  shopRects() {
    const vh = this.viewH(), w = 404, rowH = 76, h = 92 + SHOP.length * rowH + 84, x = (W - w) / 2, y = Math.max(12, (vh - h) / 2);
    return { x, y, w, h, rows: SHOP.map((_, i) => ({ x: x + 14, y: y + 82 + i * rowH, w: w - 28, h: rowH - 8 })), leave: { x: W / 2 - 84, y: y + h - 76, w: 168, h: 42 } };
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
      if (Math.floor(A.phase / Math.PI) !== before && Math.abs(p.vx) > 90) { this.puff(p.x - p.face * 3, p.y, 2, [this.th.rockHi], 25, -10); if (!this.shop) sfx.step(); }   // footfall dust
    }
    A.idle = p.ground && Math.abs(p.vx) < 5 && !p.atk && !p.shoot && !p.focus ? A.idle + dt : 0;
    // head: turns towards the nearest alien in view, else ahead (the visor's shine follows)
    let best = 170, tx = 0.6, ty = 0;
    for (const f of this.sim.foes) {
      if (f.dead) continue;
      const dx = f.x - p.x, dy = (f.y - 8) - (p.y - 24), d = Math.hypot(dx, dy);
      if (d < best) { best = d; tx = (dx * p.face) / d; ty = dy / d; }
    }
    A.look.x += (tx - A.look.x) * Math.min(1, dt * 8); A.look.y += (ty - A.look.y) * Math.min(1, dt * 8);
    for (let i = 0; i < this.pipFlash.length; i++) {          // > 0: a plate just lost (red); < 0: one just healed (green)
      const f = this.pipFlash[i] || 0;
      this.pipFlash[i] = Math.abs(f) <= dt ? 0 : f - Math.sign(f) * dt;
    }
    if (this.grinT > 0) this.grinT -= dt;
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 0.35);
    // dash afterimages, wall-slide sparks, the heal's gathering light
    if (p.dashT > 0 && !this.shop && (this.trailN = (this.trailN || 0) + 1) % 3 === 0) this.trail.push({ x: p.x, y: p.y, face: p.face, t: 0 });
    for (const g of this.trail) g.t += dt;
    this.trail = this.trail.filter((g) => g.t < 0.22);
    if (p.cling && p.vy > 20 && !this.shop) {
      if (Math.random() < dt * 30) this.sparks(p.x + p.cling * 8, p.y - 4 - Math.random() * 18, 1, '#fde68a', 40);
      if ((this.scrapeT = (this.scrapeT || 0) - dt) <= 0) { sfx.scrape(); this.scrapeT = 0.09; }
    }
    if (p.focus > 0 && !this.shop && Math.random() < dt * 40) {
      const a = Math.random() * TAU, r = 22 + Math.random() * 10;
      this.parts.push({ x: p.x + Math.cos(a) * r, y: p.y - 15 + Math.sin(a) * r, vx: -Math.cos(a) * r * 3, vy: -Math.sin(a) * r * 3, life: 0.3, max: 0.3, size: 1.4, color: '#86efac', grav: 0, drag: 0 });
    }
    this.beaconK = this.sim.beaconLit ? Math.min(1, this.beaconK + dt * 2) : 0;
    // one plate left: the suit beeps softly
    if (inp && p.pips === 1 && !p.dead && (this.beepT = (this.beepT ?? 0.5) - dt) <= 0) { sfx.beep(); this.beepT = 1.7; }
    else if (p.pips !== 1) this.beepT = 0.5;
    if (this.sim.exitOpen) this.exitK = Math.min(1, this.exitK + dt * (this.sim.kind === 'arena' ? 1 / EXIT_RISE : 10));
    if (this.sim.kind === 'arena') this.gateK = this.sim.fight === 'on' ? Math.max(0, this.gateK - dt * 6) : Math.min(1, this.gateK + dt * 2);
    if (this.bossBar > 0) this.bossBar -= dt;
    if (this.title && (this.title.t += dt) > 3) this.title = null;
    // hold up/down while standing still to look around (moves the camera)
    if (inp && p.ground && Math.abs(p.vx) < 10 && inp.aim && !inp.dir && !(inp.aim > 0 && (p.focus > 0 || p.focusHold > 0))) A.aimT += dt; else A.aimT = 0;
  }

  updateCamera(dt, inp) {
    const p = this.sim.p, m = this.m, vw = W / this.zoom, vh = this.viewH() / this.zoom;
    const lookWant = this.anim.aimT > 0.45 ? inp.aim * 80 : 0;
    this.cam.look += (lookWant - this.cam.look) * Math.min(1, dt * 4);
    const ahead = p.dashT > 0 ? 60 : 34;
    let tx = clamp(p.x + p.face * ahead - vw / 2, 0, Math.max(0, m.w - vw));
    let ty = clamp(p.y - PH / 2 - vh * 0.55 + this.cam.look, 0, Math.max(0, m.h - vh));
    if (this.sim.kind === 'arena' && (this.sim.fight === 'on' || p.x > m.arena.x0)) {     // a guardian fight: the whole arena in view
      const a = m.arena;
      tx = clamp((a.x0 + a.x1) / 2 - vw / 2, 0, Math.max(0, m.w - vw));
      ty = clamp((a.ceilY + a.floorY) / 2 - vh / 2 + 8, 0, Math.max(0, m.h - vh));
    }
    const k = 1 - Math.exp(-dt * (this.sim.fight === 'on' ? 5 : 7));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  pose() {
    const p = this.sim.p, A = this.anim;
    const mode = p.ground ? (Math.abs(p.vx) > 12 ? 'run' : 'idle') : p.vy < 0 ? 'jump' : 'fall';
    const idleLook = A.idle > 4 ? Math.sin((A.idle - 4) * 0.8) * Math.min(1, (A.idle - 4) * 0.8) : 0;
    const st = { mode, t: this.t, phase: A.phase, run: Math.min(1, Math.abs(p.vx) / RUN), vy: p.vy, flame: A.flame, land: A.land,
      hurt: p.dead ? 1 : A.hurt, idleLook, look: idleLook ? null : A.look };
    if (p.dashT > 0) st.dash = { k: 1 - p.dashT / DASH_T };
    else if (p.cling && !p.atk && !p.shoot) st.cling = true;
    else if (p.focus > 0 || p.focusHold > 0.12) st.focus = Math.max(0.05, p.focus);
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
  rubble(x, y) {
    const th = this.th;
    for (let i = 0; i < 9; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 220, vy: -60 - Math.random() * 200, life: 0.6 + Math.random() * 0.4, max: 1, size: 2 + Math.random() * 3, color: th.rock[i % 3], grav: 700, drag: 0.6 });
    this.sparks(x, y, 6, th.rockHi, 130);
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
    const cx = Math.round(this.cam.x * this.zoom) / this.zoom, cy = Math.round(this.cam.y * this.zoom) / this.zoom;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, vh); ctx.clip();
    this.drawSky(ctx, vh, cx, cy);
    ctx.scale(this.zoom, this.zoom); ctx.translate(-cx, -cy);
    const view = { x0: cx - 30, y0: cy - 30, x1: cx + W / this.zoom + 30, y1: cy + vh / this.zoom + 30 };
    this.drawTiles(ctx, cx, cy, vh);
    if (this.sim.boss?.kind === 'wyrm') drawWyrmWake(ctx, this.sim.boss, this.t, this.m.arena.floorY);
    this.drawCracks(ctx, view);
    this.drawDecor(ctx, view);
    this.drawLander(ctx, view);
    this.drawExit(ctx);
    this.drawRestBeacon(ctx, view);
    this.drawCapsuleProp(ctx, view);
    for (const c of this.sim.chests) drawChest(ctx, c, this.t);
    this.drawDust(ctx, view);
    this.drawDrops(ctx);
    this.drawFoes(ctx, view);
    this.drawBoss(ctx);
    this.drawPlayer(ctx);
    this.drawShots(ctx);
    for (const sh of this.sim.bossShots) drawBossShot(ctx, sh, this.t, this.m.arena);
    this.drawGates(ctx);
    this.drawParts(ctx);
    ctx.restore();
    this.drawPrompt(ctx);
    this.drawHud(ctx, vh);
    this.drawBossHud(ctx, vh);
    if (this.touchUI()) this.drawTouch(ctx);
    if (this.shop) this.drawShop(ctx);
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
    const c0 = Math.max(0, Math.floor(cx / TILE)), c1 = Math.min(m.C - 1, Math.floor((cx + W / this.zoom) / TILE));
    const r0 = Math.max(0, Math.floor(cy / TILE)), r1 = Math.min(m.R - 1, Math.floor((cy + vh / this.zoom) / TILE));
    const gates = this.gateSet || (this.gateSet = new Set(m.gates.map(([c, r]) => r * m.C + c)));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = m.t[r * m.C + c];
      if (!k || gates.has(r * m.C + c)) continue;
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

  /** Cracked rock: a seam of fractures (deeper after the first blow) with a faint glow from the hollow behind. */
  drawCracks(ctx, v) {
    for (const k of this.m.cracks) {
      if (k.open) continue;
      for (const [c, r] of k.tiles) {
        const x = c * TILE, y = r * TILE;
        if (x < v.x0 - TILE || x > v.x1 || y < v.y0 - TILE || y > v.y1) continue;
        const h = hash2(c, r), deep = k.hp < 2;
        ctx.strokeStyle = 'rgba(8,6,20,.75)'; ctx.lineWidth = deep ? 1.6 : 1.1; ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(x + 6 + (h % 5), y); ctx.lineTo(x + 11, y + 8); ctx.lineTo(x + 7 + ((h >> 3) % 4), y + 14); ctx.lineTo(x + 13, y + TILE);
        ctx.moveTo(x + 11, y + 8); ctx.lineTo(x + TILE, y + 6 + ((h >> 5) % 6));
        ctx.moveTo(x + 7 + ((h >> 3) % 4), y + 14); ctx.lineTo(x, y + 17);
        if (deep) { ctx.moveTo(x + 13, y + TILE); ctx.lineTo(x + 19, y + 15); ctx.lineTo(x + TILE, y + 18); }
        ctx.stroke();
        ctx.strokeStyle = `rgba(233,213,255,${0.18 + 0.12 * Math.sin(this.t * 2 + c)})`; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x + 11.6, y + 8.4); ctx.lineTo(x + 7.6 + ((h >> 3) % 4), y + 14.4); ctx.stroke();
      }
    }
  }

  drawDecor(ctx, v) {
    const th = this.th;
    for (const d of this.decor) {
      if (d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
      if (d.crack && this.m.t[Math.floor(d.y / TILE) * this.m.C + Math.floor(d.x / TILE)] !== ROCK) continue;   // its rock broke away
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
    if (!this.m.exit || this.exitK <= 0) return;
    if (this.exitK < 1) {                                // a lair's exit rises out of the floor once the guardian falls
      ctx.save(); ctx.beginPath(); ctx.rect(this.m.exit.x - 40, this.m.exit.y - 140, 80, 140); ctx.clip();
      ctx.translate(0, (1 - this.exitK) * 48); ctx.globalAlpha = this.exitK;
      this.drawExitBeacon(ctx); ctx.restore(); return;
    }
    this.drawExitBeacon(ctx);
  }
  drawExitBeacon(ctx) {
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

  drawRestBeacon(ctx, v) {
    const b = this.m.beacon;
    if (!b || b.x < v.x0 - 40 || b.x > v.x1 + 40 || b.y < v.y0 - 40 || b.y > v.y1 + 160) return;
    drawBeacon(ctx, b.x, b.y, this.t, this.beaconK, this.s.glowSprite('rgba(94,234,212,.6)'));
  }
  drawCapsuleProp(ctx, v) {
    const c = this.m.capsule;
    if (!c || this.sim.capTaken || c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) return;
    const kind = this.sim.capKind;
    drawCapsule(ctx, kind, c.x, c.y, this.t, this.s.glowSprite(hexA(abilityColor(kind)[1], 0.55)));
  }

  /** The landing pod the explorer arrived in, parked beside the spawn of every explore planet. */
  drawLander(ctx, v) {
    if (this.sim.kind !== 'explore') return;
    const sp = this.m.spawn, x = sp.x - 30, y = sp.y;
    if (x < v.x0 - 40 || x > v.x1 + 40 || y < v.y0 - 40 || y > v.y1 + 40) return;
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-14, 0); ctx.moveTo(9, -10); ctx.lineTo(14, 0); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.fillRect(-17, -1.5, 6, 1.5); ctx.fillRect(11, -1.5, 6, 1.5);
    const g = ctx.createLinearGradient(-12, 0, 12, 0); g.addColorStop(0, '#94a3b8'); g.addColorStop(0.5, '#f1f5f9'); g.addColorStop(1, '#94a3b8');
    ctx.fillStyle = 'rgba(8,10,26,.6)'; ctx.beginPath(); ctx.moveTo(-13, -8); ctx.quadraticCurveTo(-13, -30, 0, -34); ctx.quadraticCurveTo(13, -30, 13, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-12, -8); ctx.quadraticCurveTo(-12, -29, 0, -33); ctx.quadraticCurveTo(12, -29, 12, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d63b3b'; ctx.fillRect(-12, -14, 24, 2.2);
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, -23, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(56,189,248,${0.55 + 0.25 * Math.sin(this.t * 2)})`; ctx.beginPath(); ctx.arc(0, -23, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#64748b'; ctx.fillRect(-7, -9, 14, 3);
    ctx.fillStyle = Math.floor(this.t * 1.5) % 2 ? '#4ade80' : '#166534'; ctx.fillRect(7, -12, 2, 2);
    ctx.restore();
  }

  drawBoss(ctx) {
    const g = this.sim.boss;
    if (!g || g.dead) return;
    if (g.kind === 'matriarch') drawMatriarch(ctx, g, this.t);
    else if (g.kind === 'jelly') drawJelly(ctx, g, this.t, this.s.glowSprite(g.phase2 ? 'rgba(192,132,252,.5)' : 'rgba(34,211,238,.45)'));
    else drawWyrm(ctx, g, this.t, this.m.arena.floorY);
  }
  drawGates(ctx) {
    if (this.sim.kind !== 'arena' || this.gateK >= 1) return;
    const cols = new Map();
    for (const [c, r] of this.m.gates) { const q = cols.get(c) || [r, r]; cols.set(c, [Math.min(q[0], r), Math.max(q[1], r)]); }
    for (const [c, [r0, r1]] of cols) drawGate(ctx, c * TILE, r0 * TILE, (r1 - r0 + 1) * TILE, this.t, this.gateK);
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
    const gs = this.s.glowSprite('rgba(103,232,249,.6)'), gd = this.s.glowSprite('rgba(253,224,71,.55)');
    for (const d of this.sim.drops) {
      if (d.kind !== 'dust' && d.t > 9 && Math.floor(d.t * 8) % 2) continue;      // blinks before it fades
      const x = d.x, y = d.y - 4;
      if (d.kind === 'orb') {
        ctx.drawImage(gs, x - 9, y - 9, 18, 18);
        ctx.fillStyle = '#a5f3fc'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ecfeff'; ctx.beginPath(); ctx.arc(x - 0.7, y - 0.7, 1, 0, TAU); ctx.fill();
      } else if (d.kind === 'dust') {
        ctx.drawImage(gd, x - 8, y - 8, 16, 16);
        ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(x, y - 3.8); ctx.lineTo(x + 2.9, y); ctx.lineTo(x, y + 3.8); ctx.lineTo(x - 2.9, y); ctx.fill();
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
    const P = this.pose();
    // dash afterimages
    for (const g of this.trail) {
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - g.t / 0.22) * alpha;
      ctx.translate(g.x, g.y); ctx.scale(g.face, 1);
      drawAstronaut(ctx, P, GHOST, {});
      ctx.restore();
    }
    // the energy heal: a green glow gathering round the suit
    if (p.focus > 0) {
      const fg = s.glowSprite('rgba(134,239,172,.6)');
      ctx.globalAlpha = 0.35 + 0.55 * p.focus; ctx.drawImage(fg, p.x - 26, p.y - 42, 52, 52); ctx.globalAlpha = 1;
    }
    // helmet lamps throw a soft light ahead
    const lg = s.glowSprite('rgba(254,243,199,.22)');
    ctx.globalAlpha = 0.8 * alpha; ctx.drawImage(lg, p.x + p.face * 14 - 22, p.y - 52, 44, 44); ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(p.cling && !p.atk && !p.shoot ? p.cling : p.face, 1);   // clinging: he faces the wall, and turns to swing
    ctx.globalAlpha = alpha;
    drawAstronaut(ctx, P, C, { lamp: 1, led: Math.floor(this.t * 2) % 2 === 0 });
    if (p.atk) drawSlashArc(ctx, p.atk.kind, p.atk.t / SLASH_T, C, this.sim.lo.reach);
    ctx.restore();
    // the heal's ring, filling as the energy flows into the plate
    if (p.focus > 0) {
      ctx.strokeStyle = 'rgba(134,239,172,.9)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x, p.y - 15, 21, -Math.PI / 2, -Math.PI / 2 + TAU * p.focus); ctx.stroke();
    }
  }

  drawShots(ctx) {
    ctx.lineCap = 'round';
    const big = this.sim.lo.blaster > 1;
    for (const b of this.sim.bolts) {
      const l = big ? 12 : 9, dx = Math.sign(b.vx), dy = Math.sign(b.vy);
      ctx.strokeStyle = this.sim.lo.pierce ? 'rgba(232,121,249,.4)' : 'rgba(34,211,238,.35)'; ctx.lineWidth = big ? 6.5 : 5;
      ctx.beginPath(); ctx.moveTo(b.x - dx * l, b.y - dy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = this.sim.lo.pierce ? '#f5d0fe' : '#a5f3fc'; ctx.lineWidth = big ? 2.8 : 2.2; ctx.stroke();
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

  /** "↓ SHOP" over the lit rest beacon while you stand in its light (a tap target on touch screens). */
  drawPrompt(ctx) {
    this.beaconBubble = null;
    if (this.shop || !this.sim.atBeacon() || this.s.state !== 'playing') return;
    const b = this.m.beacon, [sx, sy0] = this.scr(b.x, b.y - 66), sy = sy0 + Math.sin(this.t * 3) * 2.5;
    const label = this.touchUI() ? 'TAP · SHOP' : '↓  SHOP';
    ctx.save();
    ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 26;
    ctx.fillStyle = 'rgba(4,47,46,.88)'; roundRect(ctx, sx - w / 2, sy - 14, w, 28, 14); ctx.fill();
    ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#ccfbf1'; ctx.fillText(label, sx, sy + 0.5);
    ctx.restore();
    this.beaconBubble = { x: sx, y: sy };
  }

  drawHud(ctx, vh) {
    const s = this.s, p = this.sim.p, lo = this.sim.lo;
    ctx.save();
    // the explorer's helmet: the visor flashes red when hit, cracks on the last plate, glints after a kill
    const A = this.anim, hurt = A.hurt > 0 || p.hazard > 0;
    const P = { tilt: 0, look: { x: A.look.x, y: A.look.y }, visorFlash: p.dead ? 0.5 : hurt ? Math.max(0.4, A.hurt) : 0,
      crack: p.pips <= 1, glint: this.grinT > 0 ? Math.min(1, this.grinT / 0.5) : 0, visorBlade: p.atk ? 1 - p.atk.t / SLASH_T : p.focus * 0.8 };
    const ringCol = hurt ? '#fb7185' : p.focus > 0 ? '#86efac' : s.gold ? '#fbbf24' : p.pips <= 1 ? '#fda4af' : '#67e8f9';
    ctx.fillStyle = 'rgba(2,6,23,.72)'; ctx.beginPath(); ctx.arc(34, 34, 25, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(34, 34, 23, 0, TAU); ctx.clip();
    ctx.fillStyle = this.th.sky[1]; ctx.fillRect(9, 9, 50, 50);
    ctx.translate(33 + (hurt ? Math.sin(this.t * 70) * 1.2 : 0), 33); ctx.scale(3.7, 3.7);
    drawPortrait(ctx, P, s.gold ? this.goldC : this.suitC);
    ctx.restore();
    ctx.strokeStyle = ringCol; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(34, 34, 24, 0, TAU); ctx.stroke();
    if (p.focus > 0) { ctx.strokeStyle = '#86efac'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(34, 34, 27.5, -Math.PI / 2, -Math.PI / 2 + TAU * p.focus); ctx.stroke(); }
    // suit armour plates
    for (let i = 0; i < lo.pips; i++) {
      const x = 66 + i * 23, y = 11, full = i < p.pips, fl = this.pipFlash[i] || 0;
      plate(ctx, x + (fl > 0 ? Math.sin(this.t * 60) * 1.5 : 0), y, full, fl > 0, s.gold, fl < 0);
    }
    // blaster energy cells (the three a heal would use pulse while you hold ↓)
    for (let i = 0; i < lo.energy; i++) {
      const x = 67 + i * 12, y = 40, on = i < p.energy, spend = p.focus > 0 && i >= p.energy - FOCUS_COST && on;
      ctx.fillStyle = 'rgba(2,6,23,.7)'; roundRect(ctx, x - 1, y - 1, 10, 8, 2); ctx.fill();
      ctx.fillStyle = spend ? `rgba(134,239,172,${0.6 + 0.4 * Math.sin(this.t * 20)})` : on ? '#22d3ee' : 'rgba(34,211,238,.14)'; roundRect(ctx, x, y, 8, 6, 1.5); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(236,254,255,.7)'; ctx.fillRect(x + 1, y + 1, 6, 1.2); }
    }
    // star dust: the run's wallet (what the shop takes), and this planet's count
    ctx.font = '800 14px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2,6,23,.6)'; roundRect(ctx, W - 92, 9, 80, 24, 12); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.fillText(`✦ ${this.run.wallet}`, W - 22, 21.5);
    ctx.font = '700 10.5px system-ui'; ctx.fillStyle = 'rgba(254,240,138,.75)';
    if (this.m.dust.length) ctx.fillText(`${this.sim.dustGot}/${this.m.dust.length} here`, W - 18, 42);
    // abilities found this run
    ABILITIES.forEach((k, i) => {
      const have = this.sim.ab[k], x = W - 82 + i * 22, y = 60;
      ctx.fillStyle = have ? 'rgba(2,6,23,.65)' : 'rgba(2,6,23,.35)'; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = have ? abilityColor(k)[1] : 'rgba(148,163,184,.25)'; ctx.lineWidth = 1.4; ctx.stroke();
      if (have) drawAbilityIcon(ctx, k, x, y, 11, abilityColor(k)[0]);
    });
    // first-planet control hints
    if (this.hintT > 0) {
      ctx.globalAlpha = Math.min(1, this.hintT / 1.5);
      ctx.textAlign = 'center'; ctx.font = '700 12px system-ui';
      const lines = this.touchUI()
        ? ['Stick: run and aim · JUMP · BLADE · BLAST', 'Stick down + BLADE in mid-air: bounce off aliens and spikes']
        : ['A/D or ←→ run · Space/W jump · J or X blade · K or C blaster', 'Hold ↑ or ↓ to aim · ↓ + blade in mid-air bounces off aliens and spikes'];
      lines.forEach((l, i) => this.pill(ctx, l, vh - 44 + i * 19));
      ctx.globalAlpha = 1;
    }
    if (this.tip) { ctx.globalAlpha = Math.min(1, this.tip.t / 0.6); ctx.textAlign = 'center'; ctx.font = '700 12.5px system-ui'; this.pill(ctx, this.tip.text, this.hintT > 0 ? vh - 72 : this.sim.fight === 'on' ? vh - 62 : vh - 34, 'rgba(6,78,59,.88)'); ctx.globalAlpha = 1; }
    if (this.banner && !this.shop) this.drawBanner(ctx, vh);
    if (s.gold) { ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.font = '800 10px system-ui'; ctx.fillStyle = '#fbbf24'; ctx.fillText('★ GOLDEN EXPLORER', 66, 56); }
    ctx.restore();
  }
  /** The guardian's name across the screen as the fight starts, and its health bar while it lasts. */
  drawBossHud(ctx, vh) {
    const g = this.sim.boss;
    if (!g) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (this.title) {
      const tt = this.title.t, k = Math.min(1, tt / 0.4, (3 - tt) / 0.6);
      if (k > 0) {
        ctx.globalAlpha = k;
        const y = vh * 0.4;
        ctx.fillStyle = 'rgba(2,6,23,.55)'; ctx.fillRect(0, y - 44, W, 88);
        ctx.fillStyle = '#fecdd3'; ctx.font = '700 12px system-ui'; ctx.fillText('GUARDIAN', W / 2, y - 26);
        ctx.font = '900 34px system-ui'; ctx.fillStyle = '#fff';
        ctx.save(); ctx.translate(W / 2, y + 2); ctx.scale(1 + 0.04 * (1 - k), 1); ctx.fillText(this.title.name.toUpperCase(), 0, 0); ctx.restore();
        ctx.font = 'italic 600 13px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(this.title.sub, W / 2, y + 30);
        ctx.globalAlpha = 1;
      }
    }
    if (this.sim.fight === 'on' && g.state !== 'sleep') {
      const w = 300, x = (W - w) / 2, y = vh - 30, k = g.hp / g.max;
      ctx.fillStyle = 'rgba(2,6,23,.75)'; roundRect(ctx, x - 4, y - 4, w + 8, 16, 8); ctx.fill();
      const col = g.phase2 ? '#fb7185' : '#f43f5e';
      ctx.fillStyle = 'rgba(244,63,94,.18)'; roundRect(ctx, x, y, w, 8, 4); ctx.fill();
      ctx.fillStyle = this.bossBar > 0 ? '#ffffff' : col; roundRect(ctx, x, y, Math.max(0, w * k), 8, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 2, y + 1, Math.max(0, w * k - 4), 1.5);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + w / 2 - 0.5, y - 2, 1, 12);      // the half-way mark: its second phase
      ctx.font = '800 11px system-ui'; ctx.fillStyle = '#fecdd3'; ctx.fillText(GUARDIANS[g.kind].name.toUpperCase(), W / 2, y - 12);
    }
    ctx.restore();
  }

  pill(ctx, text, y, bg = 'rgba(2,6,23,.62)') {
    const w = Math.min(W - 16, ctx.measureText(text).width + 18);
    ctx.fillStyle = bg; roundRect(ctx, W / 2 - w / 2, y - 9.5, w, 19, 9.5); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.fillText(text, W / 2, y + 0.5, W - 28);
  }

  /** New ability: a card across the top of the view for a few seconds. */
  drawBanner(ctx, vh) {
    const b = this.banner, k = Math.min(1, b.t / 0.25, (4.2 - b.t) / 0.5), [hi, mid] = abilityColor(b.kind);
    const y = Math.max(86, vh * 0.17), w = 400, h = 76, x = (W - w) / 2;
    ctx.save(); ctx.globalAlpha = Math.max(0, k);
    ctx.translate(W / 2, y + h / 2); ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); ctx.translate(-W / 2, -(y + h / 2));
    ctx.fillStyle = 'rgba(2,6,23,.86)'; roundRect(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = mid; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.arc(x + 40, y + h / 2, 25, 0, TAU); ctx.fill();
    ctx.strokeStyle = mid; ctx.lineWidth = 2; ctx.stroke();
    drawAbilityIcon(ctx, b.kind, x + 40, y + h / 2, 26, hi);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '800 10.5px system-ui'; ctx.fillStyle = mid; ctx.fillText('NEW ABILITY', x + 78, y + 18);
    ctx.font = '900 21px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(b.title.toUpperCase(), x + 78, y + 38);
    ctx.font = '600 12px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(b.line, x + 78, y + 59, w - 92);
    ctx.restore();
  }

  drawShop(ctx) {
    const R = this.shopRects(), sh = this.shop, run = this.run, k = Math.min(1, sh.t / 0.18);
    ctx.save();
    ctx.fillStyle = `rgba(2,6,23,${0.55 * k})`; ctx.fillRect(0, 0, W, this.viewH());
    ctx.globalAlpha = k;
    ctx.translate(W / 2, R.y + R.h / 2); ctx.scale(0.94 + 0.06 * k, 0.94 + 0.06 * k); ctx.translate(-W / 2, -(R.y + R.h / 2));
    ctx.fillStyle = 'rgba(6,16,32,.96)'; roundRect(ctx, R.x, R.y, R.w, R.h, 18); ctx.fill();
    ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '900 20px system-ui'; ctx.fillStyle = '#ccfbf1'; ctx.fillText('REST BEACON', R.x + 20, R.y + 28);
    ctx.font = '600 12px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText('Suit repaired. Upgrades last until this run ends.', R.x + 20, R.y + 52);
    ctx.textAlign = 'right'; ctx.font = '800 16px system-ui'; ctx.fillStyle = '#fde047'; ctx.fillText(`✦ ${run.wallet}`, R.x + R.w - 20, R.y + 28);
    SHOP.forEach((it, i) => {
      const r = R.rows[i], tier = run[it.id], max = tier >= it.costs.length, cost = it.costs[tier], afford = !max && run.wallet >= cost;
      const sel = sh.sel === i && !this.touchUI(), flash = sh.flash === i && sh.flashT > 0, nope = sh.nope === i && sh.flashT > 0;
      const shake = nope ? Math.sin(sh.flashT * 80) * 3 : 0;
      ctx.save(); ctx.translate(shake, 0);
      ctx.fillStyle = flash ? 'rgba(94,234,212,.22)' : 'rgba(255,255,255,.04)'; roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill();
      ctx.strokeStyle = sel ? '#5eead4' : 'rgba(148,163,184,.22)'; ctx.lineWidth = sel ? 2 : 1; ctx.stroke();
      const col = { plate: '#e2e8f0', blade: '#67e8f9', blaster: '#f0abfc' }[it.id];
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(r.x + 32, r.y + r.h / 2, 21, 0, TAU); ctx.fill();
      drawAbilityIcon(ctx, it.id, r.x + 32, r.y + r.h / 2, 22, col);
      ctx.textAlign = 'left'; ctx.font = '800 15px system-ui'; ctx.fillStyle = '#f8fafc'; ctx.fillText(it.name, r.x + 64, r.y + 19);
      for (let d = 0; d <= it.costs.length; d++) {
        ctx.fillStyle = d <= tier ? col : 'rgba(148,163,184,.3)'; ctx.beginPath(); ctx.arc(r.x + 70 + d * 13, r.y + 37, 4, 0, TAU); ctx.fill();
      }
      ctx.font = '600 11.5px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText(max ? 'Fully upgraded' : it.lines[tier], r.x + 64, r.y + 55, r.w - 170);
      const bx = r.x + r.w - 92, by = r.y + 14, bw = 80, bh = r.h - 28;
      ctx.fillStyle = max ? 'rgba(148,163,184,.12)' : afford ? 'rgba(250,204,21,.18)' : 'rgba(248,113,113,.1)'; roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
      ctx.strokeStyle = max ? 'rgba(148,163,184,.3)' : afford ? '#facc15' : 'rgba(248,113,113,.45)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '800 14px system-ui'; ctx.fillStyle = max ? '#94a3b8' : afford ? '#fde047' : '#fca5a5';
      ctx.fillText(max ? 'MAX' : `✦ ${cost}`, bx + bw / 2, by + bh / 2 + 0.5);
      ctx.restore();
    });
    const L = R.leave, selL = sh.sel === SHOP.length && !this.touchUI();
    ctx.fillStyle = selL ? 'rgba(94,234,212,.25)' : 'rgba(94,234,212,.1)'; roundRect(ctx, L.x, L.y, L.w, L.h, 21); ctx.fill();
    ctx.strokeStyle = '#5eead4'; ctx.lineWidth = selL ? 2.2 : 1.4; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '800 15px system-ui'; ctx.fillStyle = '#ccfbf1'; ctx.fillText('LEAVE', W / 2, L.y + L.h / 2 + 0.5);
    ctx.font = '600 10.5px system-ui'; ctx.fillStyle = '#64748b';
    ctx.fillText(this.touchUI() ? 'Tap a price to buy' : '↑ ↓ choose · Space buy · K leave', W / 2, R.y + R.h - 17);
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
    if (this.sim.ab.dash) button('dash', 'DASH', ['#042f2e', '#2dd4bf'], (x, y, r) => drawAbilityIcon(ctx, 'dash', x, y, r * 0.78, '#ccfbf1'));
    // energy badge on BLAST
    const b = this.btn.shoot;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.78, b.y - b.r * 0.7, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = p.energy ? '#67e8f9' : '#64748b'; ctx.font = '900 11px system-ui'; ctx.fillText(p.energy, b.x - b.r * 0.78, b.y - b.r * 0.7 + 0.5);
    ctx.restore();
  }
}

const FOE_COL = { crawler: '#c084fc', hopper: '#fb923c', wisp: '#67e8f9', pod: '#a3e635' };
/** A vault's points stop growing past planet 30: a 20-second rush taken from a high checkpoint must stay well
 *  inside the leaderboard's 5,000-points-a-second limit (supabase/zone5.sql), combos and all. */
const VL = (level) => Math.min(level, 30);
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** '#rrggbb' + alpha → 'rgba(…)' for glow sprites */
const hexA = (h, a) => `rgba(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')},${a})`;

/** Suit armour plate icon for the HUD. */
function plate(ctx, x, y, full, flash, gold, heal) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(0, 2.5); ctx.quadraticCurveTo(0, 0, 3, 0); ctx.lineTo(15, 0); ctx.quadraticCurveTo(18, 0, 18, 2.5);
  ctx.lineTo(18, 10); ctx.quadraticCurveTo(18, 16, 9, 20); ctx.quadraticCurveTo(0, 16, 0, 10); ctx.closePath();
  ctx.fillStyle = 'rgba(2,6,23,.7)'; ctx.lineWidth = 3; ctx.strokeStyle = heal ? 'rgba(134,239,172,.9)' : 'rgba(2,6,23,.7)'; ctx.stroke();
  if (full) {
    const g = ctx.createLinearGradient(0, 0, 18, 20); g.addColorStop(0, heal ? '#dcfce7' : gold ? '#fef3c7' : '#ffffff'); g.addColorStop(1, heal ? '#22c55e' : gold ? '#f59e0b' : '#94a3b8');
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
  const cracked = new Set(m.cracks.flatMap((k) => k.tiles.map(([c, rr]) => c + ',' + rr)));
  for (let row = 1; row < m.R; row++) for (let c = 0; c < m.C; c++) {
    if (tileAt(m, c, row) !== ROCK || tileAt(m, c, row - 1) !== 0) continue;
    const roll = r.next(), crack = cracked.has(c + ',' + row);
    if (roll < 0.22) out.push({ kind: 'moss', x: c * TILE + 3 + r.int(0, 8), y: row * TILE, n: r.int(2, 4), crack });
    else if (roll < 0.3) out.push({ kind: 'crystal', x: c * TILE + 5 + r.int(0, 12), y: row * TILE, h: r.int(6, 11), crack });
  }
  return out;
}

const hash2 = (c, r) => ((c * 73856093) ^ (r * 19349663)) >>> 0;

// ─────────────────────────────────────────────────────────────
//  VOID BREAKER — game 23 (Zone 4 · Ultra)
//  A first-person 3D wave shooter. You stand at the centre of a round arena of
//  glowing hexagon tiles floating over the void. A swirling rift hangs in the
//  sky and geometric invaders pour out of it from every side. Turn, aim and
//  break them before they reach you — light-trail shots, shattering enemies,
//  a radar for what's behind you, and a BOSS every 5th wave.
//
//    shard (tetra) · block (cube, 4 hits) L2 · darter (zigzag) L3
//    splitter → 3 shards L6 · gunner rings that orbit and shoot L7
//    phaser (blinks closer) L8 · warden (pulsing shield) L11 · swarms L12
//  Bosses: L4 THE MONOLITH (hit the core when the armour opens)
//          L9 THE HALO (six nodes, then the core) · L14 THE PRISM TITAN
//          then Mk II versions.
//  Power-ups (shoot them): twin · spread · rapid · shield · nova · chrono.
//  NOVA (↑ / W): a shockwave that clears the arena. ↓ / S: spin round 180°.
//  Every 5th level: ★ STAR SHOWER — shoot the golden stars, nothing can hurt you.
//
//  Drawn on the GPU (gl.js): bloom, a baked nebula sky with a live black hole,
//  a lit hex floor, glowing-edged meshes, light trails and shattering shards.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, roundRect, clamp } from '../../assets/js/engine.js';
import { VoidGL, V3, model, xform, meshTris } from './gl.js';

const ID = 'void-breaker';
const W = 480, H = 720, TAU = Math.PI * 2;
const ARENA = 26, EYE = [0, 1.7, 0], FOV = 1.22;
const SHOT_SPEED = 100;
const BPM = 146;

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const THEMES = [
  { name: 'Violet Rift',  nebA: [0.35, 0.12, 0.6], nebB: [0.08, 0.25, 0.65], nebC: [0.9, 0.25, 0.55], band: [0.3, 1, 0.2],  vortex: [0.6, 0.32, 0.75], vortexA: [1.0, 0.6, 0.3], vortexB: [0.6, 0.2, 1.0], floor: [0.35, 0.5, 1.0], floor2: [0.75, 0.3, 1.0], hud: '#a78bfa', pyl: [0.1, 0.09, 0.18] },
  { name: 'Ion Storm',    nebA: [0.05, 0.35, 0.55], nebB: [0.08, 0.55, 0.45], nebC: [0.25, 0.8, 1.0], band: [-0.4, 1, 0.3], vortex: [-0.75, 0.3, 0.6], vortexA: [0.65, 1.0, 1.0], vortexB: [0.1, 0.4, 1.0], floor: [0.2, 0.9, 0.95], floor2: [0.1, 0.5, 1.0], hud: '#22d3ee', pyl: [0.06, 0.12, 0.16] },
  { name: 'Crimson Void', nebA: [0.6, 0.08, 0.12], nebB: [0.45, 0.15, 0.05], nebC: [1.0, 0.4, 0.2], band: [0.2, 1, -0.5], vortex: [0.2, 0.3, -1], vortexA: [1, 0.8, 0.45], vortexB: [1, 0.2, 0.1], floor: [1.0, 0.35, 0.3], floor2: [1.0, 0.6, 0.2], hud: '#fb7185', pyl: [0.16, 0.07, 0.08] },
];
const GOLD_THEME = { name: 'Star Shower', nebA: [0.5, 0.35, 0.05], nebB: [0.55, 0.2, 0.05], nebC: [1, 0.85, 0.4], band: [0, 1, 0.4], vortex: [0, 0.35, 1], vortexA: [1, 0.95, 0.65], vortexB: [1, 0.6, 0.1], floor: [1, 0.78, 0.3], floor2: [1, 0.55, 0.1], hud: '#fbbf24', pyl: [0.18, 0.13, 0.05] };

const TYPES = {
  shard:    { mesh: 'tetra',  hp: 1, spd: 5.2, size: 1.0, col: '#22d3ee', pts: 50,  dmg: 12, from: 1 },
  block:    { mesh: 'cube',   hp: 4, spd: 3.4, size: 1.5, col: '#a78bfa', pts: 120, dmg: 20, from: 2 },
  darter:   { mesh: 'dart',   hp: 1, spd: 9.0, size: 0.9, col: '#f472b6', pts: 90,  dmg: 10, from: 3 },
  splitter: { mesh: 'ico',    hp: 3, spd: 4.0, size: 1.5, col: '#fbbf24', pts: 150, dmg: 18, from: 6 },
  gunner:   { mesh: 'torus',  hp: 3, spd: 4.2, size: 1.7, col: '#34d399', pts: 160, dmg: 15, from: 7 },
  phaser:   { mesh: 'star',   hp: 2, spd: 4.5, size: 1.2, col: '#f87171', pts: 140, dmg: 16, from: 8 },
  warden:   { mesh: 'dodeca', hp: 7, spd: 3.0, size: 1.6, col: '#60a5fa', pts: 220, dmg: 24, from: 11 },
  swarm:    { mesh: 'tetra',  hp: 1, spd: 7.5, size: 0.6, col: '#fde047', pts: 40,  dmg: 6,  from: 12 },
};
for (const t of Object.values(TYPES)) { t.rgb = hex(t.col); t.size *= 1.35; }
const PICKUPS = {
  twin:   { col: '#22d3ee', label: 'TWIN BEAMS', icon: '⫴' },
  spread: { col: '#f472b6', label: 'SPREAD SHOT', icon: '⋔' },
  rapid:  { col: '#fde047', label: 'RAPID FIRE', icon: '»' },
  shield: { col: '#4ade80', label: '+35 SHIELD', icon: '+' },
  nova:   { col: '#ffffff', label: '+1 NOVA', icon: '✺' },
  chrono: { col: '#93c5fd', label: 'SLOW TIME', icon: '◷' },
};
for (const p of Object.values(PICKUPS)) p.rgb = hex(p.col);
const BOSSES = ['monolith', 'halo', 'titan'];
const BOSS_NAME = { monolith: 'THE MONOLITH', halo: 'THE HALO', titan: 'THE PRISM TITAN' };
const isBossLevel = (l) => l % 5 === 4;
const bossOf = (l) => BOSSES[Math.floor((l - 4) / 5) % 3];
const bossMk = (l) => Math.floor((l - 4) / 15);

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  detail: true,                // 🖥 Graphics HIGH / LOW (LOW = smaller picture, lighter bloom, fewer sparks)
  comboWindow: 2.5,
  comboStep: 4,
  maxMultiplier: 6,
  bonusTime: 20,
  music: { bpm: BPM, style: 'hero', lead: 'sawtooth', arp: [0, 2, 4, 2, 1, 3, 4, 3], oct: [12, 12, 24, 12, 12, 24, 12, 12], bass: 'drive' },
  levelTitle: (l) => (isBossLevel(l) ? `Wave ${l} · BOSS` : `Wave ${l}`),
  levelName: 'Wave',
  clearText: 'WAVE CLEARED!',
  levelInfo(level, bonus) {
    if (bonus) return '★ STAR SHOWER! Golden stars stream round the arena — shoot as many as you can. Nothing can hurt you.';
    if (isBossLevel(level)) {
      const b = bossOf(level), mk = bossMk(level) ? ' MK II' : '';
      return { monolith: `⚠ BOSS: THE MONOLITH${mk}. Its core only shows when the armour opens — hit it then! ↑ / W fires a NOVA.`,
        halo: `⚠ BOSS: THE HALO${mk}. Break its six glowing nodes, then the core inside the ring.`,
        titan: `⚠ BOSS: THE PRISM TITAN${mk}. It charges in and sprays crystal fire — keep moving your aim!` }[b];
    }
    const notes = {
      1: 'Turn: mouse (click to lock) or ← → · Fire: hold click or Space · Phones: drag to turn, hold to fire. Break the invaders before they reach you!',
      2: '▣ Blocks take 4 hits. ↓ / S spins you round 180° — keep an eye on the radar!',
      3: '◆ Darters zigzag in fast. Shoot the power-ups they drop!',
      6: '⬢ Splitters burst into shards when they break.',
      7: '◎ Gunner rings orbit and fire orbs — shoot the orbs down too.',
      8: '✦ Phasers blink closer in a flash.',
      11: '⬟ Wardens pulse a shield — fire between the pulses.',
      12: '▲ Swarms! Small, fast and many.',
    };
    return notes[level] || 'More of them, faster, from every side.';
  },
  create: (shell) => new VoidBreaker(shell),
});

/** does the segment a→b pass within r of point c? returns the distance along it (0..1) or -1 */
function segHit(a, b, c, r) {
  const d = V3.sub(b, a), f = V3.sub(a, c), dd = V3.dot(d, d);
  const t = clamp(-V3.dot(f, d) / (dd || 1), 0, 1);
  const p = V3.add(a, V3.mul(d, t));
  return V3.len(V3.sub(p, c)) < r ? t : -1;
}
const flat = (p) => Math.hypot(p[0], p[2]);

class VoidBreaker {
  constructor(s) {
    this.s = s; this.t = 0;
    try { if (VoidGL.supported()) this.gl = new VoidGL(); } catch (e) { console.warn('Void Breaker: WebGL failed', e); this.gl = null; }
    this.yaw = 0; this.pitch = 0.06; this.turnV = 0;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.setupMouse();
    this.reset();
    this.startLevel(1, false);
  }

  reset() { this.novas = 1; this.hp = 100; this.power = {}; this.perks = { maxHp: 100, armour: 0, chrono: 0 }; }

  // ── Between-wave upgrade panel ─────────────────────────────
  static UPGRADE_POOL = [
    { id: 'heal',      icon: '❤️',  col: '#4ade80', name: 'Repair Field',    desc: 'Restore 30 shield now',       apply(g) { g.hp = Math.min(g.perks.maxHp, g.hp + 30); } },
    { id: 'maxhp',     icon: '🛡️',  col: '#86efac', name: 'Hull Plating',    desc: '+20 max shield (this run)',  apply(g) { g.perks.maxHp += 20; g.hp = Math.min(g.perks.maxHp, g.hp + 20); } },
    { id: 'nova',      icon: '✺',   col: '#ffffff', name: 'Nova Core',       desc: '+2 Nova charges (max 3)',     apply(g) { g.novas = Math.min(3, g.novas + 2); } },
    { id: 'armour',    icon: '⬡',   col: '#60a5fa', name: 'Energy Armour',   desc: 'Take 20% less damage',        apply(g) { g.perks.armour += 0.2; } },
    { id: 'twin30',    icon: '⫴',   col: '#22d3ee', name: 'Twin Beams',      desc: 'Twin beams for 30s',          apply(g) { g.power.twin = 30; } },
    { id: 'rapid30',   icon: '»',   col: '#fde047', name: 'Rapid Fire',      desc: 'Rapid fire for 30s',          apply(g) { g.power.rapid = 30; } },
    { id: 'spread30',  icon: '⋔',   col: '#f472b6', name: 'Spread Shot',     desc: 'Spread shot for 30s',         apply(g) { g.power.spread = 30; } },
    { id: 'chrono30',  icon: '◷',   col: '#93c5fd', name: 'Chrono Field',    desc: 'Slow time for 12s',           apply(g) { g.perks.chrono = 12; } },
  ];

  pickUpgrades(n = 3) {
    const pool = [...VoidBreaker.UPGRADE_POOL];
    // Don't offer armour past 40% reduction
    const filtered = pool.filter((u) => (u.id !== 'armour' || this.perks.armour < 0.4) && (u.id !== 'nova' || this.novas < 3) && (u.id !== 'heal' || this.hp < this.perks.maxHp));
    const out = [];
    while (out.length < n && filtered.length) {
      const i = Math.floor(this.s.rng.next() * filtered.length);
      out.push(filtered.splice(i, 1)[0]);
    }
    return out;
  }

  startUpgrade() {
    this.upgradePhase = { opts: this.pickUpgrades(), hover: 1, chosen: -1, t: 0 };
    // a locked mouse can't point at the cards: let it go without pausing the game
    if (document.pointerLockElement) { this.quietUnlock = true; this.releaseMouse(); }
  }
  applyUpgrade(idx) {
    const up = this.upgradePhase.opts[idx];
    if (!up) return;
    up.apply(this);
    this.upgradePhase.chosen = idx;
    this.upgradePhase.t = 0;
    this.s.sound.play('powerup');
  }

  // ── Mouse look (pointer lock) ───────────────────────────────
  setupMouse() {
    const cv = this.s.canvas, playing = () => this.s.state === 'playing';
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') { this.coarse = true; return; }
      if (playing() && document.pointerLockElement !== cv && cv.requestPointerLock) { try { const p = cv.requestPointerLock(); p?.catch?.(() => {}); } catch { /* ignore */ } }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== cv || !playing()) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch = clamp(this.pitch - e.movementY * 0.0022, -0.5, 0.75);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === cv;
      if (!locked && this.wasLocked && playing() && !this.quietUnlock) this.s.togglePause();
      if (!locked) this.quietUnlock = false;
      this.wasLocked = locked;
    });
  }
  releaseMouse() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  // ── Level setup ────────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.theme = bonus ? GOLD_THEME : THEMES[Math.floor((level - 1) / 1) % 3];
    this.sc = s.speed(0.035, 1.9);
    this.enemies = []; this.orbs = []; this.shots = []; this.parts = []; this.debris = []; this.portals = []; this.booms = []; this.pickups = []; this.stars = [];
    this.spawned = 0; this.spawnT = 1.2; this.killedWave = 0;
    this.total = bonus ? 0 : isBossLevel(level) ? 0 : Math.min(75, 12 + level * 3);
    this.maxAlive = Math.min(22, 6 + level);
    this.tookDamage = false; this.novaR = 0; this.novaKills = 0; this.hurtT = 0; this.flashT = 0; this.invuln = 0;
    this.slowT = this.perks?.chrono || 0; if (this.perks) this.perks.chrono = 0; this.fireCD = 0; this.recoil = 0; this.hitMark = 0; this.streak = []; this.quickTurn = 0;
    this.starsHit = 0; this.starT = 0; this.cometT = 3;
    this.boss = null; this.introT = 0; this.after = 0; this.slowmo = 0; this.novaFlash = 0;
    if (isBossLevel(level) && !bonus) this.makeBoss(bossOf(level), bossMk(level));
  }

  // ── Input ──────────────────────────────────────────────────
  buttons() { return this.coarse ? { nova: { x: W - 64, y: H - 74, r: 34 }, turn: { x: 64, y: H - 74, r: 30 } } : {}; }
  onAction(a, x, y) {
    const s = this.s;
    // Upgrade panel intercepts taps
    if (this.upgradePhase && this.upgradePhase.chosen < 0) {
      if (a === 'press' || a === 'tap') {
        const upCards = this._upgradeCardRects;
        if (upCards) for (let i = 0; i < upCards.length; i++) {
          const r = upCards[i];
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.applyUpgrade(i); return; }
        }
        return;
      }
      const up = this.upgradePhase, n = up.opts.length;
      if (a === 'left') up.hover = (up.hover + n - 1) % n;
      if (a === 'right') up.hover = (up.hover + 1) % n;
      if (a === 'action') this.applyUpgrade(clamp(up.hover, 0, n - 1));   // Space / Enter picks the highlighted card
      return;
    }
    if (a === 'press') {
      this.drag = null; this.onButton = false;
      const b = this.buttons();
      if (b.nova && Math.hypot(x - b.nova.x, y - b.nova.y) < b.nova.r + 8) { this.onButton = true; this.nova(); return; }
      if (b.turn && Math.hypot(x - b.turn.x, y - b.turn.y) < b.turn.r + 8) { this.onButton = true; this.spinRound(); return; }
      this.drag = { x, y };
      return;
    }
    if (a === 'release') { this.drag = null; this.onButton = false; return; }
    if (a === 'up' && s.input.isDown('up')) this.nova();
    if (a === 'down' && s.input.isDown('down')) this.spinRound();
  }
  onPointerMove(x, y, down) {
    if (!down || !this.drag || document.pointerLockElement) return;
    const k = this.coarse ? 0.0095 : 0.006;
    this.yaw -= (x - this.drag.x) * k;
    this.pitch = clamp(this.pitch - (y - this.drag.y) * k * 0.7, -0.5, 0.75);
    this.drag.x = x; this.drag.y = y;
  }
  spinRound() { if (this.quickTurn <= 0) { this.quickTurn = 0.28; this.qtFrom = this.yaw; this.s.sound.noise({ dur: 0.2, vol: 0.06, freq: 1200, to: 400, type: 'bandpass' }); } }
  firing() {
    const s = this.s, p = s.input.pointer;
    return s.input.isDown('action') || (p.down && !this.onButton);
  }

  // ── Camera helpers ─────────────────────────────────────────
  basis() {
    const f = [Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)];
    const R = V3.norm(V3.cross(f, [0, 1, 0])), U = V3.cross(R, f);
    return { f, R, U };
  }
  /** world → logical screen [x, y, depth] (null if behind) */
  project(p) {
    const { f, R, U } = this.B || this.basis(), d = V3.sub(p, EYE), z = V3.dot(d, f);
    if (z < 0.1) return null;
    const ty = Math.tan(FOV / 2), tx = ty * W / H;
    return [W / 2 + V3.dot(d, R) / z / tx * W / 2, H / 2 - V3.dot(d, U) / z / ty * H / 2, z];
  }
  muzzle(side = 0) { const { f, R, U } = this.B; return V3.add(EYE, V3.add(V3.mul(f, 0.75), V3.add(V3.mul(R, 0.2 + side), V3.mul(U, -0.22)))); }

  // ── Spawning ───────────────────────────────────────────────
  pickType() {
    const r = this.s.rng, L = this.level;
    const pool = Object.entries(TYPES).filter(([, t]) => t.from <= L);
    const w = pool.map(([k, t]) => (k === 'shard' ? 3 : t.from === L ? 2.5 : 1.2));
    let x = r.range(0, w.reduce((a, b) => a + b, 0));
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i][0]; }
    return 'shard';
  }
  spawn(kind, at) {
    const r = this.s.rng, T = TYPES[kind];
    let pos = at;
    if (!pos) {
      const spread = this.level === 1 ? 1.0 : this.level === 2 ? 1.7 : Math.PI;
      const a = this.yaw + r.range(-spread, spread), d = r.range(56, 72);
      pos = [Math.sin(a) * d, r.range(2.5, 13), Math.cos(a) * d];
    }
    const e = { kind, T, pos, vel: [0, 0, 0], hp: Math.ceil(T.hp * (this.level >= 13 ? 1.4 : 1)), rot: [r.range(0, TAU), r.range(0, TAU), 0], spin: [r.range(-2, 2), r.range(-2, 2)], grow: 0, flash: 0, t: r.range(0, 10), ph: r.range(0, TAU), fireT: r.range(1.5, 3), blinkT: r.range(1.8, 2.6), alpha: 1, orbitDir: r.chance(0.5) ? 1 : -1, last: pos.slice() };
    e.maxHp = e.hp;
    this.enemies.push(e);
    this.portals.push({ p: pos.slice(), t: 0, life: 0.7, col: T.rgb });
    return e;
  }
  spawnWave(dt) {
    if (this.spawned >= this.total) return;
    const alive = this.enemies.length;
    this.spawnT -= dt;
    if (this.spawnT > 0 || alive >= this.maxAlive) return;
    const r = this.s.rng, kind = this.pickType();
    if (kind === 'swarm') {
      const a = this.yaw + r.range(-Math.PI, Math.PI), base = [Math.sin(a) * 64, r.range(4, 10), Math.cos(a) * 64];
      for (let k = 0; k < 6 && this.spawned < this.total; k++) { this.spawn('swarm', V3.add(base, [r.range(-3, 3), r.range(-2, 2), r.range(-3, 3)])); this.spawned++; }
    } else {
      const pack = Math.min(this.total - this.spawned, this.level < 3 ? 1 : r.int(1, Math.min(3, 1 + Math.floor(this.level / 4))));
      for (let k = 0; k < pack; k++) { this.spawn(kind); this.spawned++; }
    }
    this.spawnT = Math.max(0.45, 1.9 - this.level * 0.08) * (this.level < 3 ? 1.4 : 1);
    this.s.sound.tone({ freq: 180, to: 560, dur: 0.25, type: 'sine', vol: 0.04 });
  }

  // ── Bosses ─────────────────────────────────────────────────
  makeBoss(kind, mk) {
    const k = 1 + mk * 0.6;
    const b = { kind, mk, t: 0, ang: this.yaw, fireT: 3, spawnT: 6, dying: 0, flash: 0, ry: 0, rx: 0, open: 0 };
    if (kind === 'monolith') { b.coreHp = b.maxHp = Math.round(60 * k); }
    if (kind === 'halo') { b.nodes = Array.from({ length: 6 }, (_, i) => ({ hp: Math.round(10 * k), max: Math.round(10 * k), flash: 0, fireT: 1 + i * 0.6 })); b.coreHp = Math.round(45 * k); b.maxHp = b.coreHp + 6 * Math.round(10 * k); b.spin = 0; }
    if (kind === 'titan') { b.coreHp = b.maxHp = Math.round(150 * k); b.charge = 0; b.chargeT = 9; }
    b.fireK = mk ? 0.7 : 1;
    this.boss = b; this.introT = 2.4;
    this.bossPos(0);
  }
  bossHp() { const b = this.boss; if (!b) return 0; return b.coreHp + (b.nodes ? b.nodes.reduce((a, n) => a + Math.max(0, n.hp), 0) : 0); }
  bossPos(dt) {
    const b = this.boss;
    if (b.kind === 'monolith') { b.ang += 0.07 * dt; b.pos = [Math.sin(b.ang) * 34, 9 + Math.sin(b.t * 0.8) * 1.2, Math.cos(b.ang) * 34]; b.ry += 0.4 * dt; b.rx += 0.25 * dt; }
    if (b.kind === 'halo') { b.ang -= 0.05 * dt; b.pos = [Math.sin(b.ang) * 36, 11 + Math.sin(b.t * 0.6) * 1.5, Math.cos(b.ang) * 36]; b.spin += (b.nodes.every((n) => n.hp <= 0) ? 1.4 : 0.5) * dt; }
    if (b.kind === 'titan') {
      b.ang += 0.09 * dt; b.chargeT -= dt;
      if (b.chargeT <= 0) { b.charge = 5.5; b.chargeT = 9.5; this.s.fx.text(W / 2, 140, 'IT\'S CHARGING!', { color: '#fb7185', size: 26 }); }
      if (b.charge > 0) b.charge -= dt;
      const c = b.charge > 0 ? Math.sin(Math.min(1, (5.5 - b.charge) / 2, b.charge / 2) * Math.PI / 2) : 0;
      const R = 30 - c * 15;
      b.pos = [Math.sin(b.ang) * R, 10 + Math.sin(b.t) * 1.5 - c * 3, Math.cos(b.ang) * R]; b.ry += 0.5 * dt; b.rx += 0.33 * dt;
    }
  }
  /** monolith armour opening: 0 closed … 1 open */
  monoOpen(t) { const c = t % 8.6; return c < 4.6 ? 0 : c < 5.2 ? (c - 4.6) / 0.6 : c < 8 ? 1 : 1 - (c - 8) / 0.6; }
  /** everything about the boss you can shoot: [{p, r, hit(dmg, at)}] */
  bossTargets() {
    const b = this.boss, out = [];
    if (!b || b.dying) return out;
    const vuln = this.introT <= 0;
    if (b.kind === 'monolith') {
      const M = model(b.pos, b.ry, b.rx, 0, 1), d = 1.45 + b.open * 2.6;
      for (const c of [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]]) out.push({ p: xform(M, c[0] * d, c[1] * d, c[2] * d), r: 1.7, armour: true });
      out.push({ p: b.pos, r: 2.0, core: true, open: b.open > 0.6 && vuln });
    } else if (b.kind === 'halo') {
      const M = model(b.pos, Math.atan2(-b.pos[0], -b.pos[2]), Math.PI / 2, 0, 1);
      b.nodes.forEach((n, i) => { if (n.hp > 0) { const a = b.spin + i / 6 * TAU; out.push({ p: xform(M, Math.cos(a) * 7, 2.3, Math.sin(a) * 7), r: 2.0, node: n }); } });
      out.push({ p: b.pos, r: 2.4, core: true, open: b.nodes.every((n) => n.hp <= 0) && vuln });
    } else out.push({ p: b.pos, r: 4.4, core: true, open: vuln });
    return out;
  }
  hitBoss(tg, dmg, at) {
    const b = this.boss, s = this.s;
    if (tg.armour || (tg.core && !tg.open)) {
      this.spark(at, [0.8, 0.85, 1], 6); if (Math.random() < 0.3) s.sound.play('metal');
      return;
    }
    if (tg.node) { tg.node.hp -= dmg; tg.node.flash = 0.1; if (tg.node.hp <= 0) { this.boom(tg.p, [1, 0.6, 0.3], 1.6); s.award(400 * this.level, ...this.scr(tg.p), { color: '#fde047' }); s.fx.text(W / 2, 170, 'NODE DOWN!', { color: '#fde047', size: 24 }); if (b.nodes.every((n) => n.hp <= 0)) s.fx.text(W / 2, 200, 'THE CORE IS OPEN!', { color: '#fb7185', size: 28 }); } }
    else { b.coreHp -= dmg; b.flash = 0.08; }
    this.spark(at, [1, 0.8, 0.5], 4); this.hitMark = 0.15;
    if (b.coreHp <= 0 && !b.dying) this.killBoss();
  }
  killBoss() {
    const b = this.boss, s = this.s;
    b.dying = 2.2; this.slowmo = 1.1;
    s.unlock(b.kind); this.novas = Math.min(3, this.novas + 1);
    s.award(2500 * this.level, W / 2, 220, { color: '#fde047', size: 34 });
    s.fx.text(W / 2, 180, `${BOSS_NAME[b.kind]} DESTROYED!`, { color: '#fde047', size: 30, life: 2 });
    s.sound.play('boom'); s.fx.shake(14, 0.8); s.fx.flash('#ffffff', 0.3);
    for (const e of this.enemies) this.kill(e, false);
    this.orbs = [];
  }
  updateBoss(dt) {
    const b = this.boss, s = this.s;
    if (!b) return;
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;
    this.bossPos(dt);
    if (b.kind === 'monolith') b.open = this.monoOpen(b.t);
    if (b.dying) {
      b.dying -= dt;
      if (Math.random() < dt * 14) this.boom(V3.add(b.pos, [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9]), [1, 0.7, 0.3], 2.2);
      if (b.dying <= 0) {
        this.boom(b.pos, [1, 0.9, 0.7], 5); this.shatter(b.kind === 'halo' ? 'torus' : b.kind === 'monolith' ? 'cube' : 'ico', model(b.pos, b.ry, b.rx, 0, b.kind === 'titan' ? 5 : b.kind === 'halo' ? 7 : 4), [1, 0.8, 0.4], 60, b.pos);
        this.boss = null; this.after = 1.6;
      }
      return;
    }
    if (this.introT > 0) return;
    for (const n of b.nodes || []) if (n.flash > 0) n.flash -= dt;
    const aim = (from, spread = 0, speed = 10) => {
      const d = V3.norm(V3.sub(V3.add(EYE, [0, -0.3, 0]), from)), side = V3.norm(V3.cross(d, [0, 1, 0]));
      const dd = V3.norm(V3.add(d, V3.mul(side, spread)));
      this.orbs.push({ p: from.slice(), v: V3.mul(dd, speed * this.sc), life: 9, hp: 1 });
    };
    const phase2 = b.coreHp < b.maxHp * 0.5;
    b.fireT -= dt; b.spawnT -= dt;
    if (b.kind === 'monolith') {
      if (b.open < 0.1 && b.fireT <= 0) { b.fireT = 3.2 * b.fireK; for (let k = -2; k <= 2; k++) aim(b.pos, k * 0.12); s.sound.tone({ freq: 300, to: 140, dur: 0.3, type: 'square', vol: 0.06 }); }
      if (b.spawnT <= 0 && this.enemies.length < 6) { b.spawnT = 6; for (let k = 0; k < 2; k++) this.spawn('shard', V3.add(b.pos, [k * 3 - 1.5, -2, 0])); }
    } else if (b.kind === 'halo') {
      const M = model(b.pos, Math.atan2(-b.pos[0], -b.pos[2]), Math.PI / 2, 0, 1);
      b.nodes.forEach((n, i) => { if (n.hp <= 0) return; n.fireT -= dt; if (n.fireT <= 0) { n.fireT = 3.6 * b.fireK; const a = b.spin + i / 6 * TAU; aim(xform(M, Math.cos(a) * 7, 2.3, Math.sin(a) * 7), 0, 9); } });
      if (b.nodes.every((n) => n.hp <= 0) && b.fireT <= 0) { b.fireT = 2.4 * b.fireK; for (let k = 0; k < 10; k++) aim(b.pos, (k - 4.5) * 0.11, 9); s.sound.tone({ freq: 500, to: 200, dur: 0.3, type: 'sawtooth', vol: 0.05 }); }
    } else {
      if (b.fireT <= 0) { b.fireT = (phase2 ? 1.3 : 2.2) * b.fireK; const off = Math.sin(b.t * 1.7) * 0.3; for (let k = 0; k < 8; k++) aim(b.pos, (k - 3.5) * 0.1 + off, 11); s.sound.tone({ freq: 260, to: 120, dur: 0.3, type: 'square', vol: 0.06 }); }
      if (phase2 && b.spawnT <= 0 && this.enemies.length < 8) { b.spawnT = 7; for (let k = 0; k < 3; k++) this.spawn('darter', V3.add(b.pos, [k * 3 - 3, 0, 0])); }
    }
    // a little help: trickle of minions
    if (!this.boss.minT) this.boss.minT = 4;
    this.boss.minT -= dt;
    if (this.boss.minT <= 0 && this.enemies.length < 4) { this.boss.minT = 4.5; this.spawn(this.s.rng.chance(0.5) ? 'shard' : 'darter'); }
  }

  // ── The frame ──────────────────────────────────────────────
  idle(dt) {
    this.t += dt;
    if (this.s.state === 'title') {
      this.yaw += 0.12 * dt;
      if (this.enemies.length < 6) {                          // attract mode: a few invaders circling (cosmetic, no daily-seed use)
        const n = this.enemies.length, kind = ['shard', 'block', 'darter', 'gunner', 'splitter', 'warden'][n], a = n * 1.05;
        this.enemies.push({ kind, T: TYPES[kind], pos: [Math.sin(a) * 22, 4 + n, Math.cos(a) * 22], vel: [0, 0, 0], hp: 1, maxHp: 1, rot: [a, a, 0], spin: [0.8, 1.1], grow: 0, flash: 0, t: 0, ph: a, alpha: 1, demo: true });
      }
      for (const e of this.enemies) { e.t += dt; e.grow = Math.min(1, e.grow + dt * 2); e.rot[0] += e.spin[0] * dt; e.rot[1] += e.spin[1] * dt; const a = Math.atan2(e.pos[0], e.pos[2]) + 0.15 * dt, r = flat(e.pos); e.pos = [Math.sin(a) * r, e.pos[1], Math.cos(a) * r]; }
    }
    this.updateFx(dt);
  }

  update(rdt) {
    const s = this.s;
    if (this.slowmo > 0) this.slowmo -= rdt;
    const dt = rdt * (this.slowmo > 0 ? 0.35 : 1);
    const wdt = dt * (this.slowT > 0 ? 0.4 : 1);          // the world (enemies, orbs) under SLOW TIME
    this.t += dt;
    this.B = this.basis();
    // turning
    const turn = (s.input.isDown('left') ? 1 : 0) - (s.input.isDown('right') ? 1 : 0);
    this.turnV += (turn * 2.5 - this.turnV) * Math.min(1, rdt * 10);
    this.yaw += this.turnV * rdt;
    if (this.quickTurn > 0) { this.quickTurn -= rdt; const k = 1 - Math.max(0, this.quickTurn) / 0.28; this.yaw = this.qtFrom + Math.PI * (k * k * (3 - 2 * k)); }
    // boss intro: the camera swings round to face it
    if (this.introT > 0 && this.boss) {
      this.introT -= rdt;
      const want = Math.atan2(this.boss.pos[0], this.boss.pos[2]);
      let d = ((want - this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
      this.yaw += d * Math.min(1, rdt * 4);
      if (this.introT > 2.2) { s.sound.tone({ freq: 440, dur: 0.18, type: 'square', vol: 0.08 }); s.sound.tone({ freq: 330, dur: 0.18, type: 'square', vol: 0.08, delay: 0.25 }); s.sound.tone({ freq: 440, dur: 0.18, type: 'square', vol: 0.08, delay: 0.5 }); this.introT = 2.2; }
    }
    this.B = this.basis();
    // timers
    for (const k of Object.keys(this.power)) { this.power[k] -= rdt; if (this.power[k] <= 0) delete this.power[k]; }
    if (this.slowT > 0) this.slowT -= rdt;
    if (this.invuln > 0) this.invuln -= rdt;
    if (this.hurtT > 0) this.hurtT -= rdt;
    if (this.hitMark > 0) this.hitMark -= rdt;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - rdt * 9);
    // fire
    this.fireCD -= rdt;
    if (this.firing() && this.fireCD <= 0 && this.introT <= 0) this.fire();
    // nova shockwave
    if (this.novaR > 0) {
      this.novaR += rdt * 70;
      for (const e of this.enemies) if (!e.dead && flat(e.pos) < this.novaR) { this.kill(e, true); this.novaKills++; }
      this.orbs = this.orbs.filter((o) => flat(o.p) > this.novaR);
      if (this.boss && !this.boss.novaHit && flat(this.boss.pos) < this.novaR) { this.boss.novaHit = true; if (this.introT <= 0) { this.boss.coreHp -= Math.round(this.boss.maxHp * 0.1); this.boss.flash = 0.2; if (this.boss.coreHp <= 0) this.killBoss(); } }
      if (this.novaR > 70) { this.novaR = 0; if (this.novaKills >= 8) s.unlock('nova8'); }
    }

    if (this.bonus) this.updateStars(wdt);
    else {
      this.spawnWave(wdt);
      this.updateBoss(wdt);
    }
    this.updateEnemies(wdt);
    this.updateOrbs(wdt);
    this.updateShots(dt);
    this.updatePickups(wdt);
    this.updateFx(dt);
    // kill streak callouts
    this.streak = this.streak.filter((t) => this.t - t < 1.4);

    // wave over?
    if (this.upgradePhase) {
      const up = this.upgradePhase;
      up.t += dt;
      if (up.chosen >= 0 && up.t > 0.7) { this.upgradePhase = null; s.completeLevel(); }
      return;
    }
    if (this.after > 0) { this.after -= rdt; if (this.after <= 0) { this.startUpgrade(); } return; }
    if (!this.bonus && !this.boss && !isBossLevel(this.level) && this.spawned >= this.total && !this.enemies.length) { this.after = 0.9; }
  }

  fire() {
    const s = this.s, B = this.B;
    const rapid = this.power.rapid > 0, spread = this.power.spread > 0, twin = this.power.twin > 0;
    this.fireCD = rapid ? 1 / 13 : 1 / 6.5;
    // aim assist: lean the shot towards the target nearest the crosshair
    let aimDir = B.f, best = this.coarse ? 0.11 : 0.05;
    for (const t of this.targets()) {
      const d = V3.sub(t.p, EYE), dist = V3.len(d);
      const lead = t.v ? V3.add(t.p, V3.mul(t.v, dist / SHOT_SPEED)) : t.p;
      const ld = V3.norm(V3.sub(lead, EYE)), ang = Math.acos(clamp(V3.dot(ld, B.f), -1, 1));
      if (ang < best) { best = ang; aimDir = ld; }
    }
    const dirs = spread ? [-2, -1, 0, 1, 2].map((k) => V3.norm(V3.add(aimDir, V3.mul(B.R, k * 0.07)))) : [aimDir];
    const sides = twin ? [-0.16, 0.16] : [0];
    const col = spread ? [1, 0.45, 0.8] : rapid ? [1, 0.9, 0.35] : twin ? [0.4, 0.95, 1] : s.gold ? [1, 0.82, 0.3] : [0.55, 0.85, 1];
    for (const sd of sides) for (const d of dirs) {
      const m = this.muzzle(sd), target = V3.add(EYE, V3.mul(d, 60)), dir = V3.norm(V3.sub(target, m));
      this.shots.push({ p: m, d: dir, life: 1.0, age: 0, col, dmg: 1 });
    }
    this.recoil = 1;
    s.sound.tone({ freq: rapid ? 1700 : 1300, to: 260, dur: 0.07, type: 'sawtooth', vol: 0.035 });
    s.sound.noise({ dur: 0.05, vol: 0.03, freq: 5000, type: 'highpass' });
  }

  /** everything a shot can hit */
  targets() {
    const out = [];
    for (const e of this.enemies) if (!e.dead && e.grow > 0.4) out.push({ p: e.pos, v: e.vel, r: e.T.size * 0.95, e });
    for (const o of this.orbs) out.push({ p: o.p, v: o.v, r: 0.55, o });
    for (const pk of this.pickups) out.push({ p: pk.p, r: 1.0, pk });
    for (const st of this.stars) out.push({ p: st.p, r: st.comet ? 2.2 : 1.2, st });
    for (const tg of this.bossTargets()) out.push({ ...tg, boss: tg });
    return out;
  }

  updateShots(dt) {
    const s = this.s;
    const tg = this.targets();
    for (const sh of this.shots) {
      const a = sh.p, b = V3.add(a, V3.mul(sh.d, SHOT_SPEED * dt));
      let hit = null, ht = 2;
      for (const t of tg) { if (t.gone) continue; const k = segHit(a, b, t.p, t.r); if (k >= 0 && k < ht) { ht = k; hit = t; } }
      sh.age += dt; sh.life -= dt;
      if (hit) {
        const at = V3.add(a, V3.mul(V3.sub(b, a), ht));
        sh.life = 0;
        if (hit.e) this.damage(hit.e, sh.dmg, at);
        else if (hit.o) { hit.gone = true; hit.o.dead = true; this.spark(at, [1, 0.3, 0.6], 8); s.award(10 * this.level, ...this.scr(at), { color: '#f9a8d4', size: 14 }); }
        else if (hit.pk) { hit.gone = true; this.collect(hit.pk); }
        else if (hit.st) { hit.gone = true; this.hitStar(hit.st); }
        else if (hit.boss) this.hitBoss(hit.boss, sh.dmg, at);
      } else sh.p = b;
      if (sh.p[1] < 0 && flat(sh.p) < ARENA) { this.spark([sh.p[0], 0.05, sh.p[2]], sh.col, 5); sh.life = 0; }
    }
    this.orbs = this.orbs.filter((o) => !o.dead);
    this.shots = this.shots.filter((sh) => sh.life > 0);
  }

  damage(e, dmg, at) {
    const s = this.s;
    if (e.kind === 'warden' && this.wardenShield(e)) { this.spark(at, [0.6, 0.8, 1], 6); if (Math.random() < 0.3) s.sound.play('metal'); return; }
    e.hp -= dmg; e.flash = 0.08; this.hitMark = 0.15;
    this.spark(at, e.T.rgb, 5);
    s.sound.tone({ freq: 900, dur: 0.03, type: 'square', vol: 0.03 });
    if (e.hp <= 0) this.kill(e, true);
  }
  wardenShield(e) { return (e.t % 3.2) < 2; }

  kill(e, scored) {
    const s = this.s, r = s.rng;
    if (e.dead) return;
    e.dead = true;
    this.shatter(e.T.mesh, model(e.pos, e.rot[0], e.rot[1], 0, e.T.size), e.T.rgb, 24, e.pos);
    this.boom(e.pos, e.T.rgb, e.T.size);
    if (scored && !e.demo) {
      this.killedWave++;
      const [sx, sy] = this.scr(e.pos);
      s.award(Math.round(e.T.pts * (1 + (this.level - 1) * 0.1)), sx, sy - 20, { chain: true, color: e.T.col });
      this.streak.push(this.t);
      const n = this.streak.length;
      if (n >= 2) s.fx.text(W / 2, 250, n >= 5 ? 'RAMPAGE!' : n === 4 ? 'QUAD BREAK!' : n === 3 ? 'TRIPLE BREAK!' : 'DOUBLE BREAK!', { color: ['#67e8f9', '#f0abfc', '#fde047', '#fb7185'][Math.min(3, n - 2)], size: 20 + n * 3, life: 0.8 });
      s.sound.noise({ dur: 0.28, vol: 0.16, freq: 2600, to: 180, type: 'bandpass' });
      s.sound.tone({ freq: 240 + Math.min(10, s.comboCount) * 40, to: 60, dur: 0.25, type: 'triangle', vol: 0.12 });
      s.fx.shake(2.5, 0.12);
      if (e.kind === 'splitter') for (let k = 0; k < 3; k++) { const c = this.spawn('shard', V3.add(e.pos, [r.range(-1.5, 1.5), r.range(-1, 1), r.range(-1.5, 1.5)])); c.grow = 0.8; this.portals.pop(); }
      if (!this.bonus && r.chance(this.level < 3 ? 0.06 : 0.08)) this.dropPickup(e.pos);
    }
  }

  dropPickup(p) {
    const r = this.s.rng, kinds = Object.keys(PICKUPS).filter((k) => k !== 'nova' || this.novas < 3).filter((k) => k !== 'shield' || this.hp < this.perks.maxHp - 10);
    this.pickups.push({ type: r.pick(kinds), p: p.slice(), t: 0, life: 12 });
  }
  collect(pk) {
    const s = this.s, P = PICKUPS[pk.type];
    pk.dead = true;
    if (pk.type === 'shield') this.hp = Math.min(this.perks.maxHp, this.hp + 35);
    else if (pk.type === 'nova') this.novas = Math.min(3, this.novas + 1);
    else if (pk.type === 'chrono') this.slowT = 5;
    else this.power[pk.type] = pk.type === 'twin' ? 12 : 10;
    s.sound.play('powerup'); s.fx.text(W / 2, H * 0.62, P.label, { color: P.col, size: 26, life: 1.1 });
    this.boom(pk.p, P.rgb, 1.2); this.portals.push({ p: pk.p.slice(), t: 0, life: 0.5, col: P.rgb });
  }

  nova() {
    const s = this.s;
    if (s.state !== 'playing' || this.novas <= 0 || this.novaR > 0) return;
    this.novas--; this.novaR = 0.5; this.novaKills = 0; this.novaFlash = 0.6;
    s.sound.play('boom'); s.sound.play('powerup'); s.fx.flash('#e0f2fe', 0.3); s.fx.shake(8, 0.4);
    s.fx.text(W / 2, H * 0.4, 'NOVA!', { color: '#e0f2fe', size: 48, life: 1 });
    if (this.boss) this.boss.novaHit = false;
  }

  updateEnemies(dt) {
    const s = this.s, target = [0, 1.4, 0];
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt; e.grow = Math.min(1, e.grow + dt * 1.8);
      if (e.flash > 0) e.flash -= dt;
      e.rot[0] += e.spin[0] * dt; e.rot[1] += e.spin[1] * dt;
      e.last = e.pos.slice();
      const to = V3.sub(target, e.pos), dist = V3.len(to), dir = V3.mul(to, 1 / (dist || 1)), spd = e.T.spd * this.sc;
      let v = V3.mul(dir, spd);
      const side = V3.norm(V3.cross(dir, [0, 1, 0]));
      if (e.kind === 'darter') v = V3.add(v, V3.mul(side, Math.sin(e.t * 3.2 + e.ph) * 8 * this.sc));
      if (e.kind === 'swarm') v = V3.add(v, V3.add(V3.mul(side, Math.sin(e.t * 4 + e.ph) * 4), [0, Math.cos(e.t * 3 + e.ph) * 2, 0]));
      if (e.kind === 'gunner') {
        const rr = flat(e.pos);
        if (rr < 16) { v = V3.mul(side, spd * 1.4 * e.orbitDir); v[1] = (5 - e.pos[1]) * 0.8; if (rr < 14) v = V3.add(v, V3.mul(dir, -2)); }
        e.fireT -= dt;
        if (e.fireT <= 0 && rr < 30 && e.grow >= 1) { e.fireT = 2.8 / this.sc; const d = V3.norm(V3.sub(EYE, e.pos)); this.orbs.push({ p: e.pos.slice(), v: V3.mul(d, 9 * this.sc), life: 8 }); s.sound.tone({ freq: 700, to: 300, dur: 0.12, type: 'square', vol: 0.03 }); }
      }
      if (e.kind === 'phaser') {
        e.blinkT -= dt; e.alpha = clamp(e.blinkT / 0.4, 0.25, 1);
        if (e.blinkT <= 0) { e.blinkT = 2.2; this.portals.push({ p: e.pos.slice(), t: 0, life: 0.5, col: e.T.rgb }); e.pos = V3.add(e.pos, V3.mul(dir, Math.min(dist - 5, 8))); this.portals.push({ p: e.pos.slice(), t: 0, life: 0.5, col: e.T.rgb }); s.sound.tone({ freq: 1600, to: 400, dur: 0.12, type: 'sine', vol: 0.04 }); }
      }
      // keep them above the floor once they're over the arena
      if (flat(e.pos) < ARENA + 2 && e.pos[1] < 1.2) v[1] = Math.max(v[1], 2);
      e.vel = v;
      e.pos = V3.add(e.pos, V3.mul(v, dt * (e.grow < 1 ? 0.3 : 1)));
      // reached you
      if (flat(e.pos) < 2.1 && Math.abs(e.pos[1] - 1.5) < 2.6) { this.kill(e, false); this.hurtPlayer(e.T.dmg); }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }
  updateOrbs(dt) {
    for (const o of this.orbs) {
      o.p = V3.add(o.p, V3.mul(o.v, dt)); o.life -= dt;
      if (V3.len(V3.sub(o.p, EYE)) < 1.3) { o.dead = true; this.hurtPlayer(8); this.spark(o.p, [1, 0.3, 0.6], 10); }
      if (o.life <= 0) o.dead = true;
    }
    this.orbs = this.orbs.filter((o) => !o.dead);
  }
  updatePickups(dt) {
    for (const pk of this.pickups) {
      pk.t += dt; pk.life -= dt;
      const to = V3.sub([0, 1.6, 0], pk.p), d = V3.len(to);
      pk.p = V3.add(pk.p, V3.mul(to, Math.min(1, dt * 2.2 / Math.max(1, d)) * (pk.t > 1 ? 1 : 0.2)));
      if (d < 3) this.collect(pk);
      if (pk.life <= 0) pk.dead = true;
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead);
  }

  hurtPlayer(dmg) {
    const s = this.s;
    if (this.invuln > 0 || this.bonus || s.state !== 'playing') return;
    this.hp -= dmg * (1 - Math.min(0.6, this.perks?.armour || 0)); this.tookDamage = true; this.hurtT = 0.5;   // Energy Armour
    s.resetCombo(); s.sound.play('hit'); s.fx.shake(7, 0.3); s.fx.flash('#ff2244', 0.28);
    if (this.hp <= 0) { this.hp = 0; s.hurt(); }
  }
  onLifeLost() {
    this.hp = this.perks.maxHp; this.invuln = 2.5; this.orbs = []; this.power = {};
    for (const e of this.enemies) if (flat(e.pos) < 24) this.kill(e, false);
    if (this.boss) this.introT = 0;
  }
  onGameOver() { this.releaseMouse(); }
  onLevelClear() {
    if (!this.bonus && !this.tookDamage && this.level >= 3) this.s.unlock('untouched');
    if (this.bonus && this.starsHit >= 60) this.s.unlock('stars');
  }

  // ── Star Shower (bonus) ────────────────────────────────────
  updateStars(dt) {
    const s = this.s, r = s.rng;
    this.starT -= dt; this.cometT -= dt;
    if (this.starT <= 0) {
      this.starT = 0.9;
      const a0 = r.range(0, TAU), dir = r.chance(0.5) ? 1 : -1, rad = r.range(14, 24), h = r.range(2, 9);
      for (let k = 0; k < 5; k++) this.stars.push({ a: a0 - dir * k * 0.16, rad, h: h + Math.sin(k) * 0.6, dir, w: r.range(0.35, 0.5), trav: 0, p: [0, 0, 0], spin: r.range(0, TAU) });
    }
    if (this.cometT <= 0) { this.cometT = 4; const a = r.range(0, TAU); this.stars.push({ a, rad: 30, h: 12, dir: r.chance(0.5) ? 1 : -1, w: 0.7, trav: 0, p: [0, 0, 0], spin: 0, comet: true }); }
    for (const st of this.stars) {
      st.a += st.dir * st.w * dt; st.trav += st.w * dt; st.spin += dt * 3;
      st.p = [Math.sin(st.a) * st.rad, st.h + Math.sin(st.a * 3) * 1.2, Math.cos(st.a) * st.rad];
      if (st.trav > 5) st.dead = true;
    }
    this.stars = this.stars.filter((st) => !st.dead);
  }
  hitStar(st) {
    const s = this.s;
    st.dead = true; this.starsHit++;
    const [sx, sy] = this.scr(st.p);
    s.award((st.comet ? 300 : 30) * this.level, sx, sy - 16, { chain: true, color: '#fde047', size: st.comet ? 30 : 18 });
    this.boom(st.p, [1, 0.85, 0.3], st.comet ? 3 : 1);
    s.sound.play('coin', Math.min(10, s.comboCount));
    if (st.comet) { s.fx.text(W / 2, 200, 'COMET!', { color: '#fde047', size: 32 }); s.sound.play('golden'); }
    this.stars = this.stars.filter((x) => !x.dead);
  }

  // ── Effects ────────────────────────────────────────────────
  spark(p, col, n) {
    const cap = this.s.lowDetail ? 250 : 650;
    for (let i = 0; i < n && this.parts.length < cap; i++) {
      const v = V3.mul(V3.norm([Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5]), 4 + Math.random() * 10);
      this.parts.push({ p: p.slice(), v, life: 0.35 + Math.random() * 0.35, max: 0.7, size: 0.12 + Math.random() * 0.12, col, kind: 0, grav: -9 });
    }
  }
  boom(p, col, size) {
    this.booms.push({ p: p.slice(), t: 0, life: 0.55 + size * 0.1, col, size });
    this.spark(p, col, Math.round(10 + size * 8));
    for (let i = 0; i < 6 * size && this.parts.length < 650; i++) {
      const v = V3.mul(V3.norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]), 1 + Math.random() * 3);
      this.parts.push({ p: p.slice(), v, life: 1 + Math.random(), max: 2, size: 0.5 + Math.random() * size * 0.4, col: V3.mul(col, 0.5), kind: 0, grav: 0.5 });
    }
  }
  /** break a mesh into glowing triangles that tumble away */
  shatter(mesh, m, col, max, centre) {
    if (this.s.lowDetail) max = Math.min(max, 12);
    for (const tri of meshTris(mesh, m, max)) {
      const c = V3.mul(V3.add(V3.add(tri[0], tri[1]), tri[2]), 1 / 3);
      const out = V3.norm(V3.sub(c, centre));
      this.debris.push({ c, off: tri.map((q) => V3.sub(q, c)), v: V3.add(V3.mul(out, 4 + Math.random() * 8), [0, Math.random() * 4, 0]), axis: V3.norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]), w: (Math.random() - 0.5) * 14, life: 1.1 + Math.random() * 0.6, max: 1.7, col });
    }
    if (this.debris.length > 500) this.debris.splice(0, this.debris.length - 500);
  }
  updateFx(dt) {
    for (const p of this.parts) { p.life -= dt; p.v[1] += p.grav * dt; p.p = V3.add(p.p, V3.mul(p.v, dt)); p.v = V3.mul(p.v, 1 - dt * 1.5); }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const d of this.debris) {
      d.life -= dt; d.v[1] -= 6 * dt; d.c = V3.add(d.c, V3.mul(d.v, dt));
      const a = d.w * dt, c = Math.cos(a), s = Math.sin(a), k = d.axis;
      d.off = d.off.map((v) => V3.add(V3.add(V3.mul(v, c), V3.mul(V3.cross(k, v), s)), V3.mul(k, V3.dot(k, v) * (1 - c))));   // Rodrigues
    }
    this.debris = this.debris.filter((d) => d.life > 0);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < b.life);
    for (const p of this.portals) p.t += dt;
    this.portals = this.portals.filter((p) => p.t < p.life);
    if (this.novaFlash > 0) this.novaFlash -= dt;
  }
  scr(p) { const q = this.project(p); return q ? [q[0], q[1]] : [W / 2, H / 2]; }

  // ── Drawing ────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, lo = s.lowDetail;
    this.B = this.basis();
    if (!['playing', 'banner', 'clear', 'dying'].includes(s.state) && document.pointerLockElement) this.releaseMouse();
    if (!this.gl) return this.noGL(ctx);
    const th = this.theme, t = this.t;
    const lights = [];
    for (const b of this.booms) { const k = 1 - b.t / b.life; lights.push([b.p[0], b.p[1], b.p[2], 8 + b.size * 6, ...V3.mul(b.col, 2.2 * k)]); }
    if (this.boss && (this.boss.kind !== 'monolith' || this.boss.open > 0.3)) lights.push([...this.boss.pos, 22, ...(this.boss.kind === 'titan' ? [0.9, 0.4, 1] : [1, 0.6, 0.3])]);
    const near = [...this.shots].sort((a, b) => a.age - b.age).slice(0, 5);
    for (const sh of near) lights.push([sh.p[0], sh.p[1], sh.p[2], 5, ...V3.mul(sh.col, 0.55)]);
    for (const pk of this.pickups) lights.push([...pk.p, 6, ...V3.mul(PICKUPS[pk.type].rgb, 0.8)]);
    lights.sort((a, b) => (b[4] + b[5] + b[6]) - (a[4] + a[5] + a[6]));

    // solid meshes
    const solids = [];
    for (const e of this.enemies) {
      const g = e.grow, sz = e.T.size * (0.2 + 0.8 * g);
      solids.push({ mesh: e.T.mesh, m: model(e.pos, e.rot[0], e.rot[1], 0, sz), color: V3.mul(e.T.rgb, 0.55), edge: V3.add(V3.mul(e.T.rgb, 0.9), [0.35, 0.35, 0.35]), emis: 0.9 + 0.3 * Math.sin(t * 6 + e.ph), flash: e.flash > 0 ? 0.8 : 0, alpha: Math.min(e.alpha, g), edgeW: 0.08 });
      if (e.kind === 'warden' && this.wardenShield(e)) solids.push({ mesh: 'ico', m: model(e.pos, t, t * 0.7, 0, e.T.size * 1.7), color: [0.2, 0.4, 0.9], edge: [0.6, 0.8, 1], emis: 0.3, alpha: 0.28, edgeW: 0.04 });
    }
    for (const pk of this.pickups) solids.push({ mesh: 'octa', m: model(pk.p, pk.t * 2.5, 0.4, 0, 0.75 + 0.1 * Math.sin(pk.t * 6)), color: V3.mul(PICKUPS[pk.type].rgb, 0.6), edge: PICKUPS[pk.type].rgb, emis: 0.6, flash: pk.life < 3 && Math.sin(pk.t * 20) > 0 ? 0.5 : 0 });
    for (const st of this.stars) solids.push({ mesh: st.comet ? 'ico' : 'star', m: model(st.p, st.spin, st.spin * 0.6, 0, st.comet ? 1.8 : 0.85), color: [0.9, 0.65, 0.15], edge: [1, 0.95, 0.6], emis: 0.6 });
    if (this.boss) this.bossSolids(solids);
    const statics = [
      { mesh: 'pylons', m: model([0, 0, 0]), color: th.pyl, edge: V3.mul(th.floor, 0.8), emis: 0, edgeW: 0.025 },
      { mesh: 'pylonGlow', m: model([0, 0, 0]), color: th.floor2, edge: [1, 1, 1], emis: 1.4 + 0.4 * Math.sin(t * 3), edgeW: 0.05 },
      { mesh: 'rocks', m: model([0, 0, 0], t * 0.015), color: [0.09, 0.08, 0.11], edge: [0.13, 0.12, 0.16], emis: 0, edgeW: 0.02, rim: 0.12 },
    ];
    // the arm cannon (view space)
    const sway = this.turnV * 0.02, bob = Math.sin(t * 2) * 0.006;
    const gm = model([0.15 - sway, -0.15 + bob, -0.58 + this.recoil * 0.03], 0.2 + sway, 0.05 + this.recoil * 0.06, -0.08, 0.5);
    const pw = this.power, gold = s.gold;
    const coil = pw.spread ? [1, 0.45, 0.8] : pw.rapid ? [1, 0.9, 0.35] : pw.twin ? [0.4, 0.95, 1] : gold ? [1, 0.85, 0.35] : V3.mul(th.floor, 1);
    const gun = s.state === 'title' ? null : {
      body: { mesh: 'gun', m: gm, color: gold ? [0.7, 0.5, 0.14] : [0.13, 0.14, 0.2], edge: gold ? [1, 0.85, 0.45] : V3.mul(th.floor, 0.75), emis: 0, edgeW: 0.035, rim: 0.15 },
      coils: { mesh: 'coils', m: gm, color: coil, edge: [1, 1, 1], emis: 1.15 + this.recoil * 1.4, edgeW: 0.06, rim: 0.3 },
      fx: (R) => { if (this.recoil > 0.55) { const mz = xform(gm, 0, 0, -0.5); R.sprite(mz, 0.022 + this.recoil * 0.02, coil, 0.9, 3, t * 9); R.sprite(mz, 0.03, coil, 0.35, 0); } },
    };
    const k = s.lowDetail ? 0.55 : 0.85, sc = s.scale || 1;
    let w = Math.round(W * sc * k), h = Math.round(H * sc * k);
    const cap = lo ? 420 : 760; if (w > cap) { h = Math.round(h * cap / w); w = cap; }
    const beat = Math.exp(-(((t * BPM / 60) % 1)) * 5);
    const img = this.gl.render({
      t, theme: th, skySize: lo ? 384 : 768, cam: { pos: EYE, yaw: this.yaw, pitch: this.pitch, fov: FOV },
      lights: lights.slice(0, 8), statics, solids, gun, nova: this.novaR, beat, hurt: this.hurtT > 0 ? this.hurtT * 2 : 0,
      fx: (R) => this.drawFx(R, lo),
      post: { bloom: lo ? 0.55 : 0.7, lo, chroma: (this.hurtT > 0 ? this.hurtT * 0.03 : 0) + (this.novaFlash > 0 ? this.novaFlash * 0.02 : 0) + (this.slowT > 0 ? 0.004 : 0),
        flash: (this.novaFlash > 0 ? this.novaFlash * 0.4 : 0), flashCol: [0.85, 0.92, 1], vig: 1.25 + (this.hp < 30 && s.state === 'playing' ? 0.6 + 0.4 * Math.sin(t * 8) : 0), thr: 0.62 },
    }, w, h);
    if (img) ctx.drawImage(img, 0, 0, W, H);
    this.drawHud(ctx);
  }

  bossSolids(out) {
    const b = this.boss, t = this.t, fl = b.flash > 0 ? 0.7 : 0, mk = b.mk ? [1, 0.4, 0.4] : null;
    if (b.kind === 'monolith') {
      const M = model(b.pos, b.ry, b.rx, 0, 1), d = 1.45 + b.open * 2.6;
      for (const c of [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]]) out.push({ mesh: 'cube', m: model(xform(M, c[0] * d, c[1] * d, c[2] * d), b.ry, b.rx, 0, 2.3), color: [0.14, 0.12, 0.2], edge: mk || [0.75, 0.55, 1], emis: 0.05, edgeW: 0.04 });
      out.push({ mesh: 'ico', m: model(b.pos, t, t * 0.6, 0, 1.6 + 0.2 * Math.sin(t * 8)), color: [1, 0.55, 0.2], edge: [1, 0.95, 0.7], emis: 0.8 + b.open, flash: fl });
    } else if (b.kind === 'halo') {
      const ry = Math.atan2(-b.pos[0], -b.pos[2]), M = model(b.pos, ry, Math.PI / 2, 0, 1);
      out.push({ mesh: 'torus', m: model(b.pos, ry, Math.PI / 2, 0, 7), color: [0.12, 0.2, 0.22], edge: mk || [0.3, 1, 0.8], emis: 0.1, edgeW: 0.05 });
      b.nodes.forEach((n, i) => { if (n.hp <= 0) return; const a = b.spin + i / 6 * TAU; out.push({ mesh: 'octa', m: model(xform(M, Math.cos(a) * 7, 2.3, Math.sin(a) * 7), t * 2, 0, 0, 1.9), color: [0.2, 0.9, 0.6], edge: [0.85, 1, 0.9], emis: 1.1, flash: n.flash > 0 ? 0.8 : 0 }); });
      const open = b.nodes.every((n) => n.hp <= 0);
      out.push({ mesh: 'dodeca', m: model(b.pos, t * 0.8, t * 0.5, 0, 2.2), color: open ? [1, 0.3, 0.4] : [0.3, 0.5, 0.6], edge: [1, 0.9, 0.9], emis: open ? 0.9 : 0.2, flash: fl });
      if (!open) out.push({ mesh: 'ico', m: model(b.pos, t, 0, 0, 3.4), color: [0.2, 0.6, 0.7], edge: [0.6, 1, 0.9], emis: 0.3, alpha: 0.25, edgeW: 0.03 });
    } else {
      const p2 = b.coreHp < b.maxHp * 0.5;
      out.push({ mesh: 'ico', m: model(b.pos, b.ry, b.rx, 0, 5), color: p2 ? [0.5, 0.1, 0.25] : [0.25, 0.12, 0.45], edge: mk || (p2 ? [1, 0.4, 0.6] : [0.8, 0.6, 1]), emis: 0.25 + 0.15 * Math.sin(t * 5), flash: fl, edgeW: 0.035 });
      out.push({ mesh: 'star', m: model(b.pos, -b.ry * 1.6, b.rx, 0, 2.2), color: [1, 0.8, 1], edge: [1, 1, 1], emis: 1 });
    }
  }

  drawFx(R, lo) {
    const t = this.t, th = this.theme;
    // energy beams from the pylon tops
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + Math.PI / 8, x = Math.sin(a) * 29.5, z = Math.cos(a) * 29.5;
      R.trail([x, 10.5, z], [x, 90, z], 0.45 + 0.15 * Math.sin(t * 3 + i), th.floor2, 0.35);
      R.sprite([x, 10.8, z], 1.6, th.floor2, 0.9, 0);
    }
    // spawn portals
    for (const p of this.portals) {
      const k = p.t / p.life, toCam = V3.norm(V3.sub(EYE, p.p));
      R.flatRing(p.p, toCam, 0.6 + k * 3, p.col, 1.4 * (1 - k));
      R.sprite(p.p, 2.5 * (1 - k), p.col, 1.2 * (1 - k), 3, k * 2);
      R.trail(V3.add(p.p, [0, -6 * (1 - k), 0]), V3.add(p.p, [0, 6, 0]), 0.3, p.col, 0.6 * (1 - k));
    }
    // enemies: core glow + light trail behind them
    for (const e of this.enemies) {
      const a = Math.min(e.alpha, e.grow);
      R.sprite(e.pos, e.T.size * 2.2, e.T.rgb, 0.6 * a, 0);
      const tail = V3.sub(e.pos, V3.mul(e.vel, 0.35));
      if (V3.len(e.vel) > 1) R.trail(tail, e.pos, e.T.size * 0.35, e.T.rgb, 0.45 * a);
    }
    // boss glow
    if (this.boss) {
      const b = this.boss;
      R.sprite(b.pos, b.kind === 'titan' ? 9 : 6, b.kind === 'titan' ? [0.7, 0.3, 1] : [1, 0.55, 0.25], b.kind === 'monolith' ? 0.2 + b.open * 0.8 : 0.6, 0);
      if (b.kind === 'titan' && b.charge > 0) R.flatRing(b.pos, V3.norm(V3.sub(EYE, b.pos)), 7 + Math.sin(t * 20), [1, 0.3, 0.4], 1.4);
    }
    // shots: light trails with a bright head
    for (const sh of this.shots) {
      const len = Math.min(9, sh.age * SHOT_SPEED), tail = V3.sub(sh.p, V3.mul(sh.d, len));
      const w = 0.04 + Math.min(0.13, sh.age * 0.9);
      R.trail(tail, sh.p, w, sh.col, 1.6);
      R.sprite(sh.p, w * 2.8, sh.col, 1.0, 0);
    }
    // enemy orbs
    for (const o of this.orbs) {
      R.sprite(o.p, 0.9, [1, 0.2, 0.55], 1.2, 0); R.sprite(o.p, 0.45, [1, 0.9, 0.95], 1.0, 0);
      R.trail(V3.sub(o.p, V3.mul(o.v, 0.12)), o.p, 0.22, [1, 0.25, 0.6], 0.8);
    }
    // pickups + stars
    for (const pk of this.pickups) { const c = PICKUPS[pk.type].rgb; R.sprite(pk.p, 2.2, c, 0.7, 0); R.flatRing(pk.p, V3.norm(V3.sub(EYE, pk.p)), 1.3 + 0.2 * Math.sin(pk.t * 5), c, 1); }
    for (const st of this.stars) { R.sprite(st.p, st.comet ? 6 : 2.2, [1, 0.8, 0.3], 0.7, 0); R.sprite(st.p, st.comet ? 3 : 1.4, [1, 0.95, 0.7], 0.8, 3, st.spin); }
    // explosions: flash, sparkle, and a shock ring
    for (const b of this.booms) {
      const k = b.t / b.life;
      R.sprite(b.p, b.size * (2 + k * 5), b.col, 1.6 * (1 - k) * (1 - k), 0);
      R.sprite(b.p, b.size * 3 * (1 - k), [1, 1, 1], 1.2 * (1 - k), 3, k);
      R.flatRing(b.p, V3.norm(V3.sub(EYE, b.p)), b.size * (1 + k * 4), b.col, 1.3 * (1 - k));
      if (b.p[1] < 8 && flat(b.p) < ARENA) R.flatRing([b.p[0], 0.06, b.p[2]], [0, 1, 0], b.size * (1 + k * 6), b.col, 0.9 * (1 - k));
    }
    // sparks and smoke
    for (const p of this.parts) R.sprite(p.p, p.size, p.col, Math.min(1, p.life / p.max * 2), p.kind);
    // shattered triangles
    for (const d of this.debris) { const a = Math.min(1, d.life / 0.6); R.tri(V3.add(d.c, d.off[0]), V3.add(d.c, d.off[1]), V3.add(d.c, d.off[2]), d.col, a * 1.2); }
    // the nova: rings of light racing outwards
    if (this.novaR > 0) for (const hh of [0.3, 2, 5]) R.flatRing([0, hh, 0], [0, 1, 0], this.novaR, [0.8, 0.9, 1], 1.6 * (1 - this.novaR / 70));
  }

  noGL(ctx) {
    ctx.fillStyle = '#05030f'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Void Breaker needs WebGL 3D graphics,', W / 2, H / 2 - 14);
    ctx.fillText('which this browser has switched off.', W / 2, H / 2 + 14);
  }

  drawHud(ctx) {
    const s = this.s, th = this.theme, t = this.t;
    if (s.state === 'title') return;
    ctx.save();
    // boss intro letterbox
    if (this.introT > 0 && this.boss) {
      const k = Math.min(1, (2.4 - this.introT) * 3, this.introT * 3);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 70 * k); ctx.fillRect(0, H - 70 * k, W, 70 * k);
      ctx.textAlign = 'center'; ctx.globalAlpha = k;
      ctx.font = '900 16px system-ui'; ctx.fillStyle = Math.sin(t * 12) > 0 ? '#fb7185' : '#fff'; ctx.fillText('⚠  W A R N I N G  ⚠', W / 2, H * 0.3);
      ctx.font = '900 40px system-ui'; ctx.fillStyle = '#fde047'; ctx.fillText(BOSS_NAME[this.boss.kind] + (this.boss.mk ? ' II' : ''), W / 2, H * 0.3 + 46);
      ctx.restore(); return;
    }
    // top bar
    ctx.fillStyle = 'rgba(3,2,12,.6)'; ctx.fillRect(0, 0, W, 46);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (this.bonus) progressBar(ctx, 14, 13, W - 28, 20, s.bonusLeft / 20, '#fbbf24', `★ STAR SHOWER · ${this.starsHit} stars · ${Math.ceil(s.bonusLeft)}s`);
    else {
      ctx.font = '900 13px system-ui'; ctx.fillStyle = th.hud;
      ctx.fillText(this.boss ? 'BOSS' : `${Math.max(0, this.total - this.killedWave)} LEFT`, 14, 23);
      const hpk = this.hp / this.perks.maxHp, hpc = hpk > 0.5 ? '#4ade80' : hpk > 0.25 ? '#fbbf24' : '#f87171';
      progressBar(ctx, 96, 13, 230, 20, this.hp / this.perks.maxHp, hpc, `SHIELD ${Math.ceil(this.hp)}${this.perks.maxHp > 100 ? ' / ' + this.perks.maxHp : ''}`);
      ctx.textAlign = 'right'; ctx.font = '900 13px system-ui'; ctx.fillStyle = '#e0f2fe'; ctx.fillText('NOVA', W - 66, 23);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(W - 52 + i * 16, 23, 5.5, 0, TAU); ctx.fillStyle = i < this.novas ? '#e0f2fe' : 'rgba(224,242,254,.15)'; ctx.fill(); }
    }
    // boss bar
    if (this.boss && !this.boss.dying) {
      ctx.textAlign = 'center'; ctx.font = '900 12px system-ui'; ctx.fillStyle = '#fde047';
      ctx.fillText(BOSS_NAME[this.boss.kind] + (this.boss.mk ? ' II' : ''), W / 2, 60);
      progressBar(ctx, 40, 68, W - 80, 12, this.bossHp() / this.boss.maxHp, '#fb7185', '');
    }
    // crosshair
    const cx = W / 2, cy = H / 2, hm = this.hitMark > 0, g = 7 + (this.recoil * 3);
    ctx.strokeStyle = hm ? '#fde047' : 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.beginPath();
    if (hm) { ctx.moveTo(cx - 10, cy - 10); ctx.lineTo(cx - 5, cy - 5); ctx.moveTo(cx + 10, cy - 10); ctx.lineTo(cx + 5, cy - 5); ctx.moveTo(cx - 10, cy + 10); ctx.lineTo(cx - 5, cy + 5); ctx.moveTo(cx + 10, cy + 10); ctx.lineTo(cx + 5, cy + 5); }
    ctx.moveTo(cx - g - 7, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + 7, cy); ctx.moveTo(cx, cy - g - 7); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + 7);
    ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
    // threat arrows round the edge for close enemies you can't see
    for (const e of this.enemies) {
      const d = flat(e.pos); if (d > 18 || e.demo) continue;
      const q = this.project(e.pos); if (q && q[0] > 0 && q[0] < W && q[1] > 50 && q[1] < H - 120) continue;
      const rel = this.relAngle(e.pos), ax = cx + Math.sin(rel) * 150, ay = cy - Math.cos(rel) * 150;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(rel);
      ctx.fillStyle = `rgba(248,113,113,${0.6 + 0.4 * Math.sin(t * 14)})`; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 4); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    this.drawRadar(ctx);
    // active power-ups
    const tags = Object.entries(this.power).map(([k, v]) => `${PICKUPS[k].label} ${Math.ceil(v)}s`);
    if (this.slowT > 0) tags.push(`SLOW TIME ${Math.ceil(this.slowT)}s`);
    ctx.textAlign = 'center'; ctx.font = '800 12px system-ui';
    tags.forEach((tg, i) => { ctx.fillStyle = 'rgba(0,0,0,.45)'; const w2 = ctx.measureText(tg).width + 16; roundRect(ctx, cx - w2 / 2, H - 172 - i * 22, w2, 18, 9); ctx.fill(); ctx.fillStyle = '#e0f2fe'; ctx.fillText(tg, cx, H - 162 - i * 22); });
    // touch buttons
    const bt = this.buttons();
    if (bt.nova) {
      for (const [k, b] of Object.entries(bt)) {
        ctx.globalAlpha = k === 'nova' && this.novas <= 0 ? 0.35 : 0.85;
        ctx.fillStyle = 'rgba(10,8,30,.55)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = k === 'nova' ? '#e0f2fe' : th.hud; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `900 ${k === 'nova' ? 13 : 20}px system-ui`; ctx.textBaseline = 'middle';
        ctx.fillText(k === 'nova' ? `NOVA ${this.novas}` : '⟲', b.x, b.y + 1);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic'; ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.5)';
    ctx.fillText(this.coarse ? 'Drag to turn · hold to fire' : document.pointerLockElement ? 'Mouse to aim · hold click / Space to fire · ↑ nova · ↓ turn round' : 'Click the view to lock the mouse · ← → turn · Space fire', cx, H - 8);
    // low-shield heartbeat
    if (this.hp < 30 && !this.bonus) {
      const a = 0.18 + 0.12 * Math.sin(t * 8), gr = ctx.createRadialGradient(cx, cy, H * 0.25, cx, cy, H * 0.7);
      gr.addColorStop(0, 'rgba(255,0,40,0)'); gr.addColorStop(1, `rgba(255,0,40,${a})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // Between-wave upgrade panel
    if (this.upgradePhase) this.drawUpgradePanel(ctx);
  }

  drawUpgradePanel(ctx) {
    const up = this.upgradePhase, th = this.theme;
    const fade = Math.min(1, up.t * 3);
    ctx.save();
    ctx.globalAlpha = fade;
    // Dimmed backdrop
    ctx.fillStyle = 'rgba(5,4,18,.82)';
    ctx.fillRect(0, 0, W, H);
    // Header
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 26px system-ui';
    ctx.fillStyle = th.hud;
    ctx.shadowColor = th.hud; ctx.shadowBlur = 20;
    ctx.fillText('WAVE CLEARED', W / 2, 120);
    ctx.shadowBlur = 0;
    ctx.font = '600 14px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.7)';
    ctx.fillText(this.coarse ? 'Tap an upgrade' : 'Choose your upgrade  ·  ← → then Space, or click', W / 2, 150);

    // Cards
    const cw = 130, ch = 160, gap = 10, total = up.opts.length;
    const startX = (W - (cw * total + gap * (total - 1))) / 2;
    this._upgradeCardRects = [];
    up.opts.forEach((opt, i) => {
      const cx0 = startX + i * (cw + gap), cy0 = 180;
      const chosen = up.chosen === i, hot = up.chosen < 0 && up.hover === i;
      const rect = { x: cx0, y: cy0, w: cw, h: ch };
      this._upgradeCardRects.push(rect);
      // card bg
      ctx.fillStyle = chosen ? opt.col + '44' : 'rgba(14,12,40,.9)';
      ctx.strokeStyle = chosen || hot ? opt.col : opt.col + '88';
      ctx.lineWidth = chosen ? 3 : hot ? 2.5 : 1.5;
      roundRect(ctx, cx0, cy0, cw, ch, 14); ctx.fill(); ctx.stroke();
      // icon
      ctx.font = '32px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = opt.col;   // (was still the card's dark fill: the icons didn't show)
      ctx.fillText(opt.icon, cx0 + cw / 2, cy0 + 44);
      // name
      ctx.font = '700 13px system-ui'; ctx.fillStyle = opt.col;
      ctx.shadowColor = opt.col; ctx.shadowBlur = chosen ? 12 : 0;
      ctx.fillText(opt.name, cx0 + cw / 2, cy0 + 78);
      ctx.shadowBlur = 0;
      // desc (word-wrap to 2 lines)
      ctx.font = '500 11px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.75)';
      const words = opt.desc.split(' '), lines = [];
      let line = '';
      for (const w of words) {
        const t2 = line ? line + ' ' + w : w;
        if (ctx.measureText(t2).width > cw - 16) { lines.push(line); line = w; } else line = t2;
      }
      lines.push(line);
      lines.forEach((l, li) => ctx.fillText(l, cx0 + cw / 2, cy0 + 102 + li * 16));
      // chosen checkmark
      if (chosen) { ctx.font = '900 20px system-ui'; ctx.fillStyle = opt.col; ctx.fillText('✓', cx0 + cw / 2, cy0 + ch - 18); }
    });
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
  /** angle of a point round from where you're facing (0 = ahead, + = to the right) */
  relAngle(p) { const { f, R } = this.B; const d = [p[0], 0, p[2]]; return Math.atan2(V3.dot(d, R), V3.dot(d, [f[0], 0, f[2]])); }
  drawRadar(ctx) {
    const rx = W / 2, ry = H - 70, rr = 50, t = this.t;
    ctx.save();
    ctx.fillStyle = 'rgba(5,4,20,.6)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,.35)'; ctx.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(rx, ry, rr * k, 0, TAU); ctx.stroke(); }
    // what you can see
    const half = Math.atan(Math.tan(FOV / 2) * W / H);
    ctx.fillStyle = 'rgba(224,242,254,.08)'; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.arc(rx, ry, rr, -Math.PI / 2 - half, -Math.PI / 2 + half); ctx.closePath(); ctx.fill();
    // sweep
    const sw = (t * 2.2) % TAU; ctx.strokeStyle = 'rgba(103,232,249,.35)'; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(sw) * rr, ry + Math.sin(sw) * rr); ctx.stroke();
    const dot = (p, col, sz) => { const a = this.relAngle(p), d = Math.min(1, flat(p) / 60) * rr; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rx + Math.sin(a) * d, ry - Math.cos(a) * d, sz, 0, TAU); ctx.fill(); };
    for (const e of this.enemies) dot(e.pos, e.T.col, e.T.size > 1.4 ? 3.2 : 2.4);
    for (const o of this.orbs) dot(o.p, '#fb7185', 1.4);
    for (const pk of this.pickups) dot(pk.p, PICKUPS[pk.type].col, 3);
    if (this.boss) dot(this.boss.pos, Math.sin(t * 8) > 0 ? '#fde047' : '#fb7185', 5.5);
    // arena edge + you
    ctx.strokeStyle = 'rgba(167,139,250,.5)'; ctx.beginPath(); ctx.arc(rx, ry, rr * ARENA / 60, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(rx, ry - 5); ctx.lineTo(rx + 4, ry + 4); ctx.lineTo(rx - 4, ry + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

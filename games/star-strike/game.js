// ─────────────────────────────────────────────────────────────
//  STAR STRIKE 3D — game 16 (Zone 3 · Master)            v2
//  Fly a starfighter down a neon space corridor. Everything is real 3D:
//  detailed low-poly models (see models.js) are lit and projected live.
//
//  WEAPONS — power-up capsules drift towards you once they're close, and
//  shooting one collects it too. Grab the same gun again to level it up (max 3).
//    ⚡ Spread (more shots)  🔮 Plasma (heavy bolts that go through enemies)
//    🚀 Homing missiles      🛰️ Wingman drone     🛡️ Shield    💣 Bomb
//
//  ENEMIES — interceptors, swarmer chains, asteroids, crystals that split,
//  mines, shield cruisers, mine layers, phantoms that cloak, kamikaze divers,
//  turrets and laser-fence sentinels.
//  BOSSES (sectors 4, 9, 14 … then round again, tougher):
//    Mothership · Hydra serpent · Star Fortress
//  Every 5th sector: ★ RING RUN bonus.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import * as M from './models.js';

const ID = 'star-strike';
const W = 480, H = 720;
const F = 300;                 // focal length (pixels)
const HORIZ = 272;             // screen y of the vanishing point
const SHIP_Z = 4.5;            // the ship's distance from the camera
const XMAX = 3, YMAX = 2;      // how far the ship can fly from the centre
const TUN = { x: 6, y: 4.2, step: 6 };

// ── lighting ─────────────────────────────────────────────────
const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((c) => c / n); };
const LIGHT = norm([-0.5, 0.8, -0.6]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);   // light + view direction, for the shine
const hexCache = new Map();
const rgb = (h) => { if (!hexCache.has(h)) hexCache.set(h, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); return hexCache.get(h); };
function rot(v, rx, ry, rz) {
  let [x, y, z] = v, t;
  if (ry) { t = x * Math.cos(ry) + z * Math.sin(ry); z = -x * Math.sin(ry) + z * Math.cos(ry); x = t; }
  if (rx) { t = y * Math.cos(rx) - z * Math.sin(rx); z = y * Math.sin(rx) + z * Math.cos(rx); y = t; }
  if (rz) { t = x * Math.cos(rz) - y * Math.sin(rz); y = x * Math.sin(rz) + y * Math.cos(rz); x = t; }
  return [x, y, z];
}

// colour sets: [hull, trim, glass, glow]
const PAL = {
  player: ['#dbe4f0', '#38bdf8', '#1e3a8a', '#67e8f9'],
  gold: ['#fbbf24', '#f59e0b', '#7c2d12', '#fef08a'],
  fighter: ['#4d7c0f', '#bef264', '#7f1d1d', '#a3e635'],
  swarm: ['#9a3412', '#fdba74', '#000000', '#fde047'],
  cruiser: ['#4c1d95', '#a78bfa', '#0e7490', '#c4b5fd'],
  pod: ['#334155', '#64748b', '#000000', '#22d3ee'],
  crystal: ['#0e7490', '#67e8f9', '#000000', '#a5f3fc'],
  layer: ['#7c2d12', '#f97316', '#000000', '#fbbf24'],
  pylon: ['#1f2937', '#ef4444', '#000000', '#f87171'],
  phantom: ['#312e81', '#818cf8', '#c7d2fe', '#a78bfa'],
  diver: ['#9a3412', '#fb923c', '#000000', '#fde047'],
  turret: ['#1e3a8a', '#60a5fa', '#bfdbfe', '#93c5fd'],
  mine: ['#7f1d1d', '#f87171', '#000000', '#fecaca'],
  rock: ['#78716c', '#a8a29e', '#000000', '#fde68a'],
  rockBig: ['#57534e', '#78716c', '#000000', '#fde68a'],
  mother: ['#64748b', '#f43f5e', '#7dd3fc', '#fde047'],
  hydra: ['#14532d', '#22c55e', '#000000', '#f43f5e'],
  fortress: ['#3f3f46', '#a1a1aa', '#000000', '#f59e0b'],
  plate: ['#0369a1', '#38bdf8', '#000000', '#7dd3fc'],
};
const WEAPONS = {
  laser: { name: 'Laser', icon: '🔫', col: '#4ade80' },
  spread: { name: 'Spread', icon: '⚡', col: '#fde047' },
  plasma: { name: 'Plasma', icon: '🔮', col: '#e879f9' },
};
const PICKUP = {
  spread: { col: '#fde047', letter: 'S', label: '⚡ SPREAD SHOT' },
  plasma: { col: '#e879f9', letter: 'P', label: '🔮 PLASMA CANNON' },
  homing: { col: '#fb923c', letter: 'H', label: '🚀 HOMING MISSILES' },
  drone: { col: '#a5f3fc', letter: 'W', label: '🛰️ WINGMAN DRONE' },
  shield: { col: '#67e8f9', letter: '🛡', label: '🛡️ SHIELD' },
  bomb: { col: '#f472b6', letter: 'B', label: '💣 +1 BOMB' },
};
// hit boxes [half-width, half-height] for things you can shoot
const BOX = { fighter: [0.95, 0.6], swarm: [0.6, 0.6], cruiser: [1.5, 0.7], pod: [0.55, 0.55], splitter: [0.6, 0.95], shard: [0.45, 0.45], layer: [1.6, 0.5], pylon: [0.55, 1.6], phantom: [1.1, 0.45], diver: [0.65, 0.65], turret: [0.75, 0.75], mine: [0.75, 0.75], seg: [0.65, 0.65], head: [1.1, 0.9], core: [1.5, 1.5], gun: [0.6, 0.6], mother: [2.4, 1.1], pickup: [0.7, 0.7] };
const SHOOTABLE = new Set([...Object.keys(BOX), 'rock']);
const BOSS_KINDS = new Set(['mother', 'head', 'core']);
const BOSSES = ['mother', 'hydra', 'fortress'];

runGame({
  id: ID,
  detail: true,                      // offers the 🖥 Graphics HIGH / LOW switch
  width: W, height: H,
  lives: 3,
  comboWindow: 2.2,
  comboStep: 4,
  maxMultiplier: 5,
  bonusTime: 15,
  music: { bpm: 150, style: 'hero', lead: 'sawtooth', arp: [0, 1, 2, 4, 2, 1, 3, 1], oct: [12, 12, 12, 12, 24, 12, 12, 12], bass: 'drive' },
  levelInfo(level, bonus) {
    if (bonus) return '★ RING RUN! Fly through as many golden rings as you can — nothing can hurt you.';
    const notes = {
      1: 'Fly: arrows / WASD / mouse / drag. Fire: hold Space / mouse (touch fires by itself). 💣 B. Power-ups drift to you — or just shoot them!',
      2: '💎 Crystals split into shards when you break them.',
      3: '💥 Space mines — shoot them before they reach you.',
      6: '🚧 Laser gates, and 🛡️ shield cruisers — knock out their two shield pods first.',
      7: '🎯 Kamikaze divers lock on, and mine layers sow mines as they cross.',
      8: '👻 Phantoms cloak — shoot them while they\'re visible. Turrets now aim.',
      11: '⚡ Laser fences sweep the tunnel — fly over or under, or shoot a pylon.',
    };
    if (level % 5 === 4) {
      const b = BOSSES[Math.floor(level / 5) % 3];
      return { mother: '⚠️ MOTHERSHIP sector! Survive, then take it down.', hydra: '⚠️ HYDRA sector! Break its armoured tail before its head will crack.', fortress: '⚠️ STAR FORTRESS sector! Shoot through the gaps in its spinning shields.' }[b];
    }
    return notes[level] || 'Denser waves, faster enemies. Stay sharp!';
  },
  create: (shell) => new StarStrike(shell),
});

class StarStrike {
  constructor(s) {
    this.s = s; this.t = 0;
    this.ship = { x: 0, y: -0.6, bank: 0, pitch: 0 };
    this.stars = Array.from({ length: 110 }, () => this.newStar(true));
    this.rocks = Array.from({ length: 5 }, (_, i) => M.rock(i + 1));
    this.sky = this.makeSky();
    this.resetKit();
    addEventListener('keydown', (e) => { if (e.code === 'KeyB' && this.s.state === 'playing') this.bomb(); });
    this.startLevel(1, false);
  }
  newStar(anyZ) { return { x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 20, z: anyZ ? Math.random() * 90 + 2 : 90 }; }
  resetKit() { this.bombs = 1; this.weapon = { type: 'laser', lvl: 1, t: 0 }; this.homing = 0; this.drone = 0; this.shield = false; }
  reset() { this.resetKit(); }

  /** A starfield, galaxy band and ringed planet painted once onto an off-screen canvas. */
  makeSky() {
    const c = document.createElement('canvas'); c.width = W + 120; c.height = H + 80;
    const g = c.getContext('2d'), r = (a, b) => a + Math.random() * (b - a);
    g.fillStyle = '#030210'; g.fillRect(0, 0, c.width, c.height);
    // galaxy band
    g.save(); g.translate(c.width / 2, HORIZ - 30); g.rotate(-0.35);
    for (let i = 0; i < 260; i++) {
      const x = r(-420, 420), y = r(-40, 40) * (1 - Math.abs(x) / 520), rad = r(10, 46);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const hue = [[124, 58, 237], [14, 116, 144], [190, 24, 93], [30, 64, 175]][i % 4];
      gr.addColorStop(0, `rgba(${hue},${r(0.04, 0.11)})`); gr.addColorStop(1, `rgba(${hue},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 900; i++) { const x = r(-420, 420); g.fillStyle = `rgba(255,255,255,${r(0.1, 0.6)})`; g.fillRect(x, r(-30, 30) * (1 - Math.abs(x) / 480), 1, 1); }
    g.restore();
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(226,232,240,${r(0.15, 0.9)})`; const s = Math.random() < 0.08 ? 2 : 1; g.fillRect(r(0, c.width), r(0, c.height), s, s); }
    // ringed planet
    const px = c.width * 0.8, py = 120, pr = 46;
    const pg = g.createRadialGradient(px - 16, py - 18, 4, px, py, pr);
    pg.addColorStop(0, '#fcd5ce'); pg.addColorStop(0.45, '#b45309'); pg.addColorStop(1, '#1c0a03');
    g.strokeStyle = 'rgba(253,230,138,.35)'; g.lineWidth = 5; g.beginPath(); g.ellipse(px, py, pr * 2, pr * 0.42, -0.25, Math.PI, Math.PI * 2); g.stroke();
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 4; for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(px, py + k * 12, pr * 0.98, 4, 0, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = 'rgba(253,230,138,.5)'; g.lineWidth = 5; g.beginPath(); g.ellipse(px, py, pr * 2, pr * 0.42, -0.25, 0, Math.PI); g.stroke();
    return c;
  }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.speed = 24 * s.speed(0.03, 1.6);
    this.sectorT = 0;
    this.sectorLen = bonus ? 99 : 40 + Math.min(20, level * 1.4);
    this.bossLevel = !bonus && level % 5 === 4;
    this.bossType = BOSSES[Math.floor(level / 5) % 3];
    this.boss = null; this.bossDead = false; this.finishSoon = 0;
    this.ents = []; this.shots = []; this.bolts = []; this.missiles = []; this.debris = []; this.trail = [];
    this.waveT = 1.5; this.fireT = 0; this.homeT = 0; this.droneT = 0;
    this.invuln = 1.5; this.kills = 0; this.hitsTaken = 0; this.shotsFired = 0; this.shotsHit = 0; this.rings = 0;
    this.travel = 0; this.done = false; this.chains = new Map(); this.hydraHist = [];
    this.theme = bonus ? '#fbbf24' : this.bossLevel ? '#f43f5e' : level >= 11 ? '#f97316' : level >= 6 ? '#e879f9' : '#22d3ee';
  }

  // ── Input ──────────────────────────────────────────────────
  onPointerMove(x, y) { this.aim = { x: clamp((x - W / 2) / (W / 2) * XMAX * 1.1, -XMAX, XMAX), y: clamp(-(y - 470) / 90 * YMAX, -YMAX, YMAX) }; }
  onAction(a, x, y) {
    if (a === 'press') {
      if (Math.hypot(x - (W - 44), y - (H - 60)) < 30) { this.bomb(); return; }
      this.onPointerMove(x, y);
    }
  }
  onLifeLost() {
    this.invuln = 2.2; this.bolts = []; this.shield = false;
    // losing a life costs one weapon level
    if (this.weapon.lvl > 1) this.weapon.lvl--; else this.weapon = { type: 'laser', lvl: 1, t: 0 };
    this.ents = this.ents.filter((e) => e.z > 30 || e.boss || e.kind === 'pickup');
    this.bombs = Math.max(this.bombs, 1);
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; this.moveStars(dt, 10); this.updateDebris(dt); }
  moveStars(dt, v) { for (const st of this.stars) { st.z -= v * dt * 1.8; if (st.z < 1) Object.assign(st, this.newStar(false)); } }

  update(dt) {
    const s = this.s, sh = this.ship, inp = s.input;
    this.t += dt; this.travel += this.speed * dt;
    this.moveStars(dt, this.speed);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.weapon.t > 0 && (this.weapon.t -= dt) <= 0) { this.weapon = { type: 'laser', lvl: 1, t: 0 }; s.fx.text(W / 2, H - 120, 'Power-up ran out', { color: '#94a3b8', size: 14 }); }
    if (this.homing > 0) this.homing -= dt;
    if (this.drone > 0) this.drone -= dt;

    // steering
    let vx = 0, vy = 0;
    if (inp.isDown('left')) vx -= 1; if (inp.isDown('right')) vx += 1;
    if (inp.isDown('up')) vy += 1; if (inp.isDown('down')) vy -= 1;
    const px = sh.x, py = sh.y;
    if (vx || vy) { sh.x += vx * 7 * dt; sh.y += vy * 5.5 * dt; this.aim = null; }
    else if (this.aim) { sh.x += clamp(this.aim.x - sh.x, -9 * dt, 9 * dt); sh.y += clamp(this.aim.y - sh.y, -7 * dt, 7 * dt); }
    sh.x = clamp(sh.x, -XMAX, XMAX); sh.y = clamp(sh.y, -YMAX, YMAX);
    if (dt > 0) {
      sh.bank += (clamp(-(sh.x - px) / dt * 0.12, -0.7, 0.7) - sh.bank) * Math.min(1, dt * 8);
      sh.pitch += (clamp((sh.y - py) / dt * 0.08, -0.4, 0.4) - sh.pitch) * Math.min(1, dt * 8);
    }

    // firing
    this.fireT -= dt; this.homeT -= dt; this.droneT -= dt;
    const firing = inp.isDown('action') || (inp.pointer.down && inp.pointer.y < H - 110) || (inp.pointer.down && Math.hypot(inp.pointer.x - (W - 44), inp.pointer.y - (H - 60)) > 30 && inp.pointer.y >= H - 110);
    if (firing && !this.bonus) {
      if (this.fireT <= 0) this.fire();
      if (this.homing > 0 && this.homeT <= 0) this.launchMissiles();
    }
    if (this.drone > 0 && this.droneT <= 0 && !this.bonus) this.droneFire();

    // engine trail
    for (const d of [-0.42, 0.42]) this.trail.push({ x: sh.x + d * Math.cos(sh.bank), y: sh.y - 0.06 - d * Math.sin(sh.bank), z: SHIP_Z - 0.85, life: 0.3 });
    for (const p of this.trail) { p.life -= dt; p.z -= this.speed * 0.35 * dt; }
    this.trail = this.trail.filter((p) => p.life > 0);

    // sector clock + waves
    if (!this.done) {
      this.sectorT += dt;
      if (this.bonus) this.bonusSpawns(dt);
      else if (this.sectorT < this.sectorLen) { this.waveT -= dt; if (this.waveT <= 0) this.spawnWave(); }
      else if (this.bossLevel && !this.boss && !this.bossDead) this.spawnBoss();
      else if (!this.bossLevel && this.ents.every((e) => e.z < SHIP_Z - 2 || e.kind === 'pickup')) this.finish();
    }

    this.updateShots(dt);
    this.updateMissiles(dt);
    this.updateEnts(dt);
    this.updateBolts(dt);
    this.updateDebris(dt);
  }

  // ── Your guns ──────────────────────────────────────────────
  fire() {
    const s = this.s, sh = this.ship, { type, lvl } = this.weapon;
    const shot = (x, vx, o = {}) => this.shots.push({ x: sh.x + x, y: sh.y - 0.05, z: SHIP_Z + 0.6, vx, vy: 0, dmg: 1, col: WEAPONS[type].col, ...o });
    if (type === 'laser') {
      this.fireT = lvl >= 2 ? 0.11 : 0.14;
      shot(-0.55, -0.1); shot(0.55, 0.1); if (lvl >= 3) shot(0, 0);
      s.sound.tone({ freq: 1400, to: 380, dur: 0.07, type: 'square', vol: 0.025 });
    } else if (type === 'spread') {
      this.fireT = lvl >= 3 ? 0.12 : 0.15;
      const n = 1 + lvl * 2;
      for (let i = 0; i < n; i++) { const k = i - (n - 1) / 2; shot(k * 0.25, k * 0.55); }
      s.sound.tone({ freq: 1100, to: 500, dur: 0.06, type: 'square', vol: 0.03 });
    } else {
      this.fireT = lvl >= 3 ? 0.2 : 0.26;
      const o = { dmg: lvl >= 3 ? 4 : 3, pierce: true, hit: new Set(), big: true };
      if (lvl === 1) shot(0, 0, o); else { shot(-0.4, -0.05, o); shot(0.4, 0.05, { ...o, hit: new Set() }); }
      s.sound.tone({ freq: 300, to: 120, dur: 0.14, type: 'sawtooth', vol: 0.05 });
    }
    this.shotsFired++;
  }
  launchMissiles() {
    const sh = this.ship;
    this.homeT = 0.55;
    for (const d of [-0.9, 0.9]) this.missiles.push({ x: sh.x + d, y: sh.y - 0.1, z: SHIP_Z + 0.4, vx: d * 4, vy: 2, vz: 30, life: 3, target: null });
    this.s.sound.noise({ dur: 0.15, vol: 0.06, freq: 2500, to: 600, type: 'bandpass' });
  }
  droneFire() {
    const p = this.dronePos();
    this.droneT = 0.2;
    this.shots.push({ x: p[0], y: p[1], z: SHIP_Z + 0.3, vx: 0, vy: 0, dmg: 1, col: '#a5f3fc' });
  }
  dronePos() { const a = this.t * 2.2, sh = this.ship; return [sh.x + Math.cos(a) * 1.25, sh.y + 0.45 + Math.sin(a * 2) * 0.12, SHIP_Z + Math.sin(a) * 0.4]; }

  bomb() {
    const s = this.s;
    if (this.bombs <= 0 || this.bonus || s.state !== 'playing') return;
    this.bombs--;
    s.fx.flash('#e0f2fe', 0.5); s.fx.shake(10, 0.4); s.sound.play('boom');
    s.sound.tone({ freq: 60, to: 30, dur: 0.8, type: 'sawtooth', vol: 0.15 });
    s.fx.ring(W / 2, HORIZ + 120, { color: '#e0f2fe', radius: 320, life: 0.6, width: 6 });
    this.bolts = [];
    for (const e of this.ents) {
      if (!SHOOTABLE.has(e.kind) || e.kind === 'pickup') continue;
      if (e.boss || e.kind === 'seg' || e.kind === 'gun') { this.damage(e, 12, true); continue; }
      if (e.z < 70) this.destroy(e, true);
    }
  }

  // ── Spawning ───────────────────────────────────────────────
  spawnWave() {
    const s = this.s, r = s.rng, L = this.level;
    this.waveT = Math.max(0.7, 1.55 - L * 0.06) * r.range(0.8, 1.2);
    const pool = ['fighters', 'fighters', 'asteroids', 'swarm'];
    if (L >= 2) pool.push('crystals');
    if (L >= 3) pool.push('mines');
    if (L >= 6) pool.push('gate', 'cruiser');
    if (L >= 7) pool.push('divers', 'layer');
    if (L >= 8) pool.push('turret', 'phantoms');
    if (L >= 11) pool.push('sentinel');
    const kind = r.pick(pool), z = 95;
    if (kind === 'fighters') {
      const n = Math.min(6, 3 + Math.floor(L / 3)), cx = r.range(-2, 2), cy = r.range(-1.2, 1.2), shape = r.int(0, 2);
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        const ox = shape === 0 ? k * 1.4 : shape === 1 ? Math.cos(i / n * 6.28) * 1.8 : k * 1.2;
        const oy = shape === 0 ? -Math.abs(k) * 0.6 : shape === 1 ? Math.sin(i / n * 6.28) * 1.2 : 0;
        this.ents.push({ kind: 'fighter', x: cx + ox, y: cy + oy, z: z + Math.abs(k) * 2, hp: L >= 6 ? 2 : 1, hold: r.range(14, 22), phase: r.range(0, 6), fireT: r.range(1.2, 3), holdT: r.range(4, 7) });
      }
    } else if (kind === 'swarm') {
      const n = Math.min(9, 5 + Math.floor(L / 4)), id = Symbol('chain'), cx = r.range(-1.5, 1.5), cy = r.range(-0.8, 0.8), A = r.range(1.2, 2.2), ph = r.range(0, 6);
      this.chains.set(id, { n, killed: 0 });
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'swarm', chain: id, cx, cy, A, ph: ph - i * 0.45, x: cx, y: cy, z: z + i * 3.2, hp: 1, spin: 0 });
    } else if (kind === 'asteroids') {
      const n = Math.min(8, 3 + Math.floor(L / 2));
      for (let i = 0; i < n; i++) {
        const big = r.chance(0.4);
        this.ents.push({ kind: 'rock', x: r.range(-XMAX - 0.5, XMAX + 0.5), y: r.range(-YMAX - 0.3, YMAX + 0.3), z: z + i * 5, size: big ? r.range(1.1, 1.5) : r.range(0.5, 0.8), hp: big ? 3 : 1, spin: [r.range(-2, 2), r.range(-2, 2)], rx: 0, ry: 0, mesh: r.int(0, 4), big, drift: [r.range(-0.6, 0.6), r.range(-0.4, 0.4)] });
      }
    } else if (kind === 'crystals') {
      const n = Math.min(3, 1 + Math.floor(L / 5));
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'splitter', x: r.range(-XMAX + 0.5, XMAX - 0.5), y: r.range(-YMAX + 0.4, YMAX - 0.4), z: z + i * 8, hp: 2, ry: r.range(0, 6) });
    } else if (kind === 'mines') {
      const n = Math.min(5, 1 + Math.floor(L / 3));
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'mine', x: r.range(-XMAX, XMAX), y: r.range(-YMAX, YMAX), z: z + i * 7, hp: 1, ry: 0 });
    } else if (kind === 'gate') {
      this.ents.push({ kind: 'gate', z, gx: r.range(-XMAX + 1, XMAX - 1), gy: r.range(-YMAX + 0.6, YMAX - 0.6), gw: Math.max(1.9, 2.7 - L * 0.05), gh: Math.max(1.35, 1.85 - L * 0.03), passed: false });
    } else if (kind === 'cruiser') {
      const c = { kind: 'cruiser', x: r.range(-1.2, 1.2), y: r.range(0.2, 1.2), z, hp: 10, hold: r.range(24, 30), holdT: 8, fireT: 1.5, phase: 0 };
      this.ents.push(c);
      for (const ox of [-1.75, 1.75]) this.ents.push({ kind: 'pod', parent: c, ox, x: c.x + ox, y: c.y, z, hp: 4 });
    } else if (kind === 'divers') {
      const n = Math.min(4, 1 + Math.floor((L - 5) / 2));
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'diver', x: r.range(-XMAX, XMAX), y: r.range(-YMAX, YMAX), z: z + i * 6, hp: 1 });
    } else if (kind === 'layer') {
      const dir = r.pick([-1, 1]);
      this.ents.push({ kind: 'layer', dir, x: -dir * (XMAX + 2.5), y: r.range(-0.5, 1.5), z: 40, hp: 4, dropT: 0.6 });
    } else if (kind === 'turret') {
      this.ents.push({ kind: 'turret', x: r.pick([-TUN.x + 0.8, TUN.x - 0.8]), y: r.range(-2.5, 2.5), z, hp: 3, fireT: 0.8 });
    } else if (kind === 'phantoms') {
      const n = Math.min(3, 1 + Math.floor((L - 6) / 3));
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'phantom', x: r.range(-2, 2), y: r.range(-1, 1.4), z: z + i * 5, hp: 2, hold: r.range(16, 24), holdT: r.range(6, 8), phase: r.range(0, 6), fireT: 2 });
    } else if (kind === 'sentinel') {
      const link = { alive: 2, phase: r.range(0, 6), spd: r.range(1.4, 2.2) + L * 0.02 };
      for (const sx of [-1, 1]) this.ents.push({ kind: 'pylon', link, x: sx * (XMAX + 0.9), y: 0, z, hp: 4 });
      this.ents.push({ kind: 'fence', link, z });
    }
    // floating power-ups now and then
    if (r.chance(0.12)) this.dropPickup(r.range(-XMAX + 0.5, XMAX - 0.5), r.range(-YMAX + 0.4, YMAX - 0.4), z + 10);
  }
  dropPickup(x, y, z, type) {
    const r = this.s.rng;
    type ||= r.pick(['spread', 'spread', 'spread', 'plasma', 'plasma', 'homing', 'homing', 'drone', 'shield', 'shield', 'bomb']);
    this.ents.push({ kind: 'pickup', type, x, y, z: Math.max(z, 20), hp: 1, spin: r.range(0, 6) });
  }

  bonusSpawns(dt) {
    const r = this.s.rng;
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = 0.45;
      const k = this.sectorT;
      this.ents.push({ kind: 'ring', x: Math.sin(k * 0.9) * 2.4, y: Math.cos(k * 0.7) * 1.4, z: 95 });
      if (r.chance(0.25)) this.ents.push({ kind: 'ring', x: r.range(-XMAX, XMAX), y: r.range(-YMAX, YMAX), z: 105 });
    }
  }

  spawnBoss() {
    const s = this.s, L = this.level, round = Math.floor(L / 15);
    const name = { mother: 'MOTHERSHIP', hydra: 'HYDRA', fortress: 'STAR FORTRESS' }[this.bossType];
    if (this.bossType === 'mother') {
      const hp = 70 + L * 10;
      this.boss = { kind: 'mother', boss: true, x: 0, y: 0.6, z: 95, targetZ: 30, hp, max: hp, ry: 0, fireT: 2, pattern: 0, patT: 0, swarmT: 6 };
      this.ents.push(this.boss);
    } else if (this.bossType === 'hydra') {
      const hp = 60 + L * 6;
      this.boss = { kind: 'head', boss: true, x: 0, y: 0, z: 95, hp, max: hp, patT: 0, fireT: 2.5, armour: true };
      this.ents.push(this.boss);
      const n = 8 + round * 2;
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'seg', i: i + 1, x: 0, y: 0, z: 100 + i, hp: 5 + round * 2, fireT: 2 + i * 0.4 });
      this.hydraSegs = n;
    } else {
      const hp = 90 + L * 8;
      this.boss = { kind: 'core', boss: true, x: 0, y: 0.5, z: 95, targetZ: 32, hp, max: hp, spin: 0, fireT: 2.5, pattern: 0 };
      for (let i = 0; i < 4; i++) this.ents.push({ kind: 'plate', i, x: 0, y: 0, z: 95 });
      for (let i = 0; i < 4; i++) this.ents.push({ kind: 'gun', i, x: 0, y: 0, z: 95, hp: 8 + round * 3, fireT: 1.5 + i * 0.5 });
      this.ents.push(this.boss);
    }
    s.fx.text(W / 2, HORIZ - 40, `⚠️ ${name}!`, { color: '#f43f5e', size: 34, life: 1.6 });
    s.sound.tone({ freq: 90, to: 60, dur: 1.2, type: 'sawtooth', vol: 0.12 });
  }

  // ── Movement & collisions ──────────────────────────────────
  updateShots(dt) {
    for (const sh of this.shots) {
      sh.z += (sh.big ? 70 : 90) * dt; sh.x += sh.vx * dt * 3; sh.y += sh.vy * dt * 3;
      for (const e of this.ents) {
        if (e.dead || !SHOOTABLE.has(e.kind) || (sh.hit && sh.hit.has(e))) continue;
        if (e.kind === 'phantom' && this.cloak(e) < 0.35) continue;
        const [bw, bh] = e.kind === 'rock' ? [e.size, e.size] : BOX[e.kind];
        const dz = e.boss || e.kind === 'seg' || e.kind === 'gun' ? 2.5 : 1.8;
        if (Math.abs(sh.x - e.x) < bw + (sh.big ? 0.25 : 0) && Math.abs(sh.y - e.y) < bh + (sh.big ? 0.25 : 0) && Math.abs(sh.z - e.z) < dz) {
          if (e.kind === 'pickup') { this.collect(e, true); sh.dead = true; break; }
          this.shotsHit++;
          if (sh.pierce) sh.hit.add(e); else sh.dead = true;
          this.damage(e, sh.dmg);
          if (!sh.pierce) break;
        }
      }
      // fortress shield plates block shots
      if (!sh.dead && this.bossType === 'fortress' && this.boss) for (const p of this.ents) {
        if (p.kind !== 'plate' || Math.abs(sh.z - p.z) > 1.5) continue;
        if (Math.abs(sh.x - p.x) < 0.95 && Math.abs(sh.y - p.y) < 0.55) { sh.dead = true; this.spark(sh, '#7dd3fc'); break; }
      }
    }
    this.shots = this.shots.filter((sh) => !sh.dead && sh.z < 110);
  }

  updateMissiles(dt) {
    for (const m of this.missiles) {
      m.life -= dt;
      if (!m.target || m.target.dead) {
        let best = null, bd = 1e9;
        for (const e of this.ents) { if (e.dead || !SHOOTABLE.has(e.kind) || e.kind === 'pickup' || e.z < m.z) continue; const d = Math.hypot(e.x - m.x, e.y - m.y) + (e.z - m.z) * 0.15; if (d < bd) { bd = d; best = e; } }
        m.target = best;
      }
      if (m.target) {
        const e = m.target, dx = e.x - m.x, dy = e.y - m.y, dz = e.z - m.z, d = Math.hypot(dx, dy, dz) || 1;
        m.vx += (dx / d * 45 - m.vx) * Math.min(1, dt * 4); m.vy += (dy / d * 45 - m.vy) * Math.min(1, dt * 4); m.vz += (dz / d * 55 - m.vz) * Math.min(1, dt * 3);
        const [bw, bh] = e.kind === 'rock' ? [e.size, e.size] : BOX[e.kind] || [1, 1];
        if (Math.abs(dx) < bw && Math.abs(dy) < bh && Math.abs(dz) < 2) { m.dead = true; this.damage(e, 2); this.s.fx.burst(...this.proj(e.x, e.y, e.z).slice(0, 2), { colors: ['#fb923c', '#fde047'], count: 10, speed: 140, life: 0.4 }); }
      } else m.vz = Math.max(m.vz, 50);
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    }
    this.missiles = this.missiles.filter((m) => !m.dead && m.life > 0 && m.z < 110);
  }

  spark(p, col) {
    const [sx, sy, k] = this.proj(p.x, p.y, p.z);
    if (k > 0) this.s.fx.burst(sx, sy, { colors: [col, '#fff'], count: 5, speed: 90, life: 0.25, size: 2 });
    this.s.sound.tone({ freq: 1800, to: 900, dur: 0.04, type: 'triangle', vol: 0.03 });
  }

  damage(e, n, bomb = false) {
    const s = this.s;
    if (e.kind === 'cruiser' && this.ents.some((p) => p.kind === 'pod' && p.parent === e && !p.dead)) { this.spark(e, '#c4b5fd'); return; }
    if (e.kind === 'head' && e.armour) { this.spark(e, '#86efac'); return; }
    e.hp -= n; e.flash = 0.12;
    if (e.hp <= 0) this.destroy(e, bomb);
    else s.sound.tone({ freq: 300, to: 200, dur: 0.04, type: 'square', vol: 0.03 });
  }

  destroy(e, byBomb) {
    const s = this.s, L = this.level;
    if (e.dead) return;
    e.dead = true;
    const [sx, sy, sc] = this.proj(e.x, e.y, e.z);
    const pts = { fighter: 100, swarm: 60, rock: e.big ? 150 : 50, splitter: 120, shard: 40, mine: 80, diver: 120, turret: 200, cruiser: 600, pod: 150, layer: 350, pylon: 250, phantom: 300, seg: 300, gun: 400, mother: 5000, head: 6000, core: 7000 }[e.kind] || 50;
    if (sc > 0) {
      s.award(pts * L, sx, sy - 20, { chain: !byBomb && !e.boss, color: '#fde047', size: e.boss ? 30 : 16 });
      s.fx.burst(sx, sy, { colors: [(PAL[e.kind] || PAL.rock)[3], '#fde047', '#fff'], count: e.boss ? 90 : 16, speed: e.boss ? 420 : 200 * Math.min(2, sc / 40), life: 0.6 });
      s.fx.ring(sx, sy, { color: '#fde68a', radius: Math.min(160, sc * (e.boss ? 4 : 1.4)), life: 0.4, width: 2 });
    }
    this.blowUp(e);
    s.sound.noise({ dur: e.boss ? 1 : 0.25, vol: e.boss ? 0.4 : 0.15, freq: 1200, to: 80 });
    s.sound.tone({ freq: 160, to: 40, dur: 0.2, type: 'sawtooth', vol: 0.05 });
    this.kills++;
    const r = s.rng;
    switch (e.kind) {
      case 'fighter': if (r.chance(0.08)) this.dropPickup(e.x, e.y, e.z); break;
      case 'swarm': {
        const c = this.chains.get(e.chain);
        if (c && ++c.killed === c.n && !byBomb) {
          s.award(500 * L, sx, sy - 40, { color: '#fdba74', size: 20 });
          s.fx.text(W / 2, HORIZ - 20, 'WHOLE SWARM! +POWER-UP', { color: '#fdba74', size: 20 });
          s.unlock('chain');
          this.dropPickup(e.x, e.y, e.z);
        }
        break;
      }
      case 'splitter':
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + r.range(0, 1); this.ents.push({ kind: 'shard', x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 1.6, hp: 1, ry: 0 }); }
        break;
      case 'cruiser': this.dropPickup(e.x, e.y, e.z); break;
      case 'layer': this.dropPickup(e.x, e.y, e.z); break;
      case 'pylon': e.link.alive--; break;
      case 'seg': {
        this.hydraSegs--;
        if (this.boss && this.boss.armour && this.hydraSegs <= Math.ceil(this.ents.filter((x) => x.kind === 'seg').length / 2)) { this.boss.armour = false; s.fx.text(W / 2, HORIZ - 60, 'ARMOUR CRACKED! Hit the head!', { color: '#86efac', size: 20, life: 1.6 }); }
        break;
      }
    }
    if (e.boss) {
      this.bossDead = true; this.boss = null;
      for (const x of this.ents) if (['seg', 'gun', 'plate'].includes(x.kind) && !x.dead) { x.dead = true; this.blowUp(x); }
      s.fx.flash('#fde047', 0.5); s.fx.shake(14, 0.8);
      s.unlock({ mother: 'boss', head: 'hydra', core: 'fortress' }[e.kind]);
      s.fx.text(W / 2, HORIZ - 60, `${{ mother: 'MOTHERSHIP', head: 'HYDRA', core: 'STAR FORTRESS' }[e.kind]} DESTROYED!`, { color: '#fde047', size: 24, life: 1.8 });
      for (let i = 0; i < 3; i++) this.dropPickup(e.x + (i - 1) * 1.6, e.y, e.z);
      this.finishSoon = 2.5;
    }
  }

  /** Bits of hull fly apart in 3D. */
  blowUp(e) {
    const r = this.s.rng, pal = PAL[e.kind] || PAL.rock, n = e.boss ? 40 : ['rock', 'cruiser', 'layer', 'seg', 'gun'].includes(e.kind) ? 14 : 8;
    for (let i = 0; i < n; i++) this.debris.push({ x: e.x, y: e.y, z: e.z, vx: r.range(-5, 5), vy: r.range(-4, 5), vz: r.range(-6, 6), life: r.range(0.5, 1.1), max: 1.1, col: pal[r.int(0, 1)], size: r.range(0.08, e.boss ? 0.5 : 0.22), rot: r.range(0, 6), vr: r.range(-10, 10) });
    const cap = this.s.lowDetail ? 70 : 260;
    if (this.debris.length > cap) this.debris.splice(0, this.debris.length - cap);
  }
  updateDebris(dt) {
    for (const d of this.debris) { d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt - (this.bonus ? 0 : this.speed * 0.3 * dt); d.rot += d.vr * dt; d.vy -= 3 * dt; }
    this.debris = this.debris.filter((d) => d.life > 0 && d.z > 0.6);
  }

  cloak(e) { return (Math.sin(e.phase * 1.4) + 1) / 2; }

  updateEnts(dt) {
    const s = this.s, sh = this.ship, L = this.level, v = this.speed, r = s.rng;
    if (this.finishSoon > 0 && (this.finishSoon -= dt) <= 0) this.finish();
    if (this.boss?.kind === 'head') { this.hydraHist.unshift([this.boss.x, this.boss.y, this.boss.z]); if (this.hydraHist.length > 400) this.hydraHist.length = 400; }
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      switch (e.kind) {
        case 'fighter':
        case 'phantom': {
          e.phase += dt;
          if (e.holdT > 0 && e.z <= e.hold) { e.z = e.hold; e.holdT -= dt; e.x += Math.sin(e.phase * 1.3) * dt * 1.5; e.y += Math.cos(e.phase * 1.1) * dt; }
          else e.z -= (e.holdT > 0 ? v * 0.9 : v * 0.8) * dt;
          e.fireT -= dt;
          const canShoot = e.kind === 'fighter' || this.cloak(e) > 0.6;
          if (e.fireT <= 0 && canShoot && e.z < 60 && e.z > 10) { e.fireT = Math.max(1.0, 2.6 - L * 0.1) * r.range(0.8, 1.3); this.enemyShot(e, L >= 4 && r.chance(0.3)); }
          break;
        }
        case 'swarm': {
          e.z -= v * 1.05 * dt; e.ph += dt * 2.2; e.spin += dt * 8;
          e.x = e.cx + Math.sin(e.ph) * e.A; e.y = e.cy + Math.cos(e.ph * 0.8) * e.A * 0.55;
          break;
        }
        case 'rock': e.z -= v * dt; e.rx += e.spin[0] * dt; e.ry += e.spin[1] * dt; e.x += e.drift[0] * dt; e.y += e.drift[1] * dt; break;
        case 'splitter': e.z -= v * 0.9 * dt; e.ry += dt * 2; break;
        case 'shard': e.z -= v * 1.15 * dt; e.ry += dt * 9; e.x += e.vx * dt; e.y += e.vy * dt; e.vx += clamp(sh.x - e.x, -1, 1) * dt * 2; e.vy += clamp(sh.y - e.y, -1, 1) * dt * 2; break;
        case 'mine': e.z -= v * dt; e.ry += dt * 3; break;
        case 'gate': case 'fence': e.z -= v * dt; break;
        case 'pylon': e.z -= v * dt; break;
        case 'ring': e.z -= v * 1.1 * dt; break;
        case 'pickup': {
          e.spin += dt * 3;
          e.z -= v * 0.75 * dt;
          if (e.z < 34) { e.magnet = true; e.x += clamp(sh.x - e.x, -6 * dt, 6 * dt); e.y += clamp(sh.y - e.y, -5 * dt, 5 * dt); }
          break;
        }
        case 'diver':
          e.z -= v * 1.25 * dt;
          if (e.z < 40) { e.x += clamp(sh.x - e.x, -2.2 * dt, 2.2 * dt); e.y += clamp(sh.y - e.y, -1.8 * dt, 1.8 * dt); }
          break;
        case 'turret':
          e.z -= v * dt; e.fireT -= dt;
          if (e.fireT <= 0 && e.z < 70 && e.z > 12) { e.fireT = 1.2; this.enemyShot(e, true); }
          break;
        case 'cruiser': {
          e.phase += dt;
          if (e.holdT > 0 && e.z <= e.hold) { e.z = e.hold; e.holdT -= dt; e.x += Math.sin(e.phase * 0.6) * dt * 0.8; }
          else e.z -= v * (e.holdT > 0 ? 0.7 : 0.6) * dt;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.z < 60 && e.z > 10) { e.fireT = Math.max(1.1, 2.2 - L * 0.05); for (const d of [-0.6, 0, 0.6]) this.enemyShot({ x: e.x + d, y: e.y, z: e.z }, false, d * 1.5); }
          break;
        }
        case 'pod': if (e.parent.dead) { this.destroy(e, true); break; } e.x = e.parent.x + e.ox; e.y = e.parent.y; e.z = e.parent.z; break;
        case 'layer': {
          e.z -= v * 0.25 * dt; e.x += e.dir * 2.6 * dt;
          e.dropT -= dt;
          if (e.dropT <= 0 && Math.abs(e.x) < XMAX + 0.5) { e.dropT = Math.max(0.45, 0.8 - L * 0.01); this.ents.push({ kind: 'mine', x: e.x, y: e.y - 0.3, z: e.z, hp: 1, ry: 0 }); s.sound.tone({ freq: 220, dur: 0.06, type: 'square', vol: 0.03 }); }
          if (Math.abs(e.x) > XMAX + 3) e.dead = true;
          break;
        }
        case 'mother': {
          if (e.z > e.targetZ) e.z -= 12 * dt;
          e.ry += dt * 0.8; e.patT += dt;
          e.x = Math.sin(e.patT * 0.6) * 2.2; e.y = 0.8 + Math.sin(e.patT * 0.9) * 0.8;
          e.fireT -= dt; e.swarmT -= dt;
          if (e.swarmT <= 0 && e.z <= e.targetZ + 1) {
            e.swarmT = 8; const id = Symbol('chain'); this.chains.set(id, { n: 5, killed: 0 });
            for (let i = 0; i < 5; i++) this.ents.push({ kind: 'swarm', chain: id, cx: e.x, cy: e.y, A: 1.6, ph: -i * 0.45, x: e.x, y: e.y, z: e.z + i * 2, hp: 1, spin: 0 });
          }
          if (e.fireT <= 0 && e.z <= e.targetZ + 1) {
            const n = 3 + Math.min(4, Math.floor(L / 4)), rage = e.hp < e.max / 2;
            e.fireT = rage ? 0.9 : 1.4; e.pattern = (e.pattern + 1) % 3;
            if (e.pattern === 0) for (let i = 0; i < n; i++) this.enemyShot({ x: e.x + (i - (n - 1) / 2) * 1.2, y: e.y - 0.5, z: e.z }, false, (i - (n - 1) / 2) * 0.9);
            else if (e.pattern === 1) for (let i = 0; i < 3; i++) this.enemyShot({ x: e.x, y: e.y - 0.5, z: e.z }, true, 0, i * 0.15);
            else for (let i = 0; i < n + 2; i++) { const a = i / (n + 2) * Math.PI * 2; this.enemyShot({ x: e.x + Math.cos(a) * 2, y: e.y + Math.sin(a) * 0.8, z: e.z }, false, Math.cos(a) * 1.4, 0, Math.sin(a) * 1.1); }
            s.sound.tone({ freq: 220, to: 110, dur: 0.18, type: 'sawtooth', vol: 0.06 });
          }
          break;
        }
        case 'head': {
          e.patT += dt;
          const tz = 34 + Math.sin(e.patT * 0.5) * 5;
          e.z += (Math.max(tz, e.z > 40 ? e.z - 14 * dt : tz) - e.z) * Math.min(1, dt * 2);
          e.x = Math.sin(e.patT * 0.8) * 2.4; e.y = 0.3 + Math.cos(e.patT * 1.1) * 1.3;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.z < 42) {
            e.fireT = e.armour ? 2.0 : 1.2;
            for (const d of [-0.8, 0, 0.8]) this.enemyShot({ x: e.x, y: e.y, z: e.z - 1 }, d === 0, d * 1.2);
            s.sound.tone({ freq: 160, to: 80, dur: 0.25, type: 'sawtooth', vol: 0.07 });
          }
          break;
        }
        case 'seg': {
          const h = this.hydraHist[Math.min(this.hydraHist.length - 1, e.i * 9)];
          if (h) { e.x += (h[0] - e.x) * Math.min(1, dt * 10); e.y += (h[1] - e.y) * Math.min(1, dt * 10); e.z += (h[2] + e.i * 1.1 - e.z) * Math.min(1, dt * 10); }
          e.fireT -= dt;
          if (e.fireT <= 0 && e.z < 50) { e.fireT = r.range(3, 5.5); this.enemyShot(e, r.chance(0.4)); }
          break;
        }
        case 'core': {
          if (e.z > e.targetZ) e.z -= 12 * dt;
          e.spin += dt * (e.hp < e.max / 2 ? 1.25 : 0.8);
          e.y = 0.5 + Math.sin(this.t * 0.7) * 0.4;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.z <= e.targetZ + 1) {
            e.fireT = e.hp < e.max / 2 ? 1.3 : 1.9; e.pattern = (e.pattern + 1) % 2;
            const n = 8;
            if (e.pattern === 0) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + e.spin; this.enemyShot({ x: e.x, y: e.y, z: e.z }, false, Math.cos(a) * 1.8, 0, Math.sin(a) * 1.3); }
            else this.enemyShot({ x: e.x, y: e.y, z: e.z }, true);
            s.sound.tone({ freq: 180, to: 90, dur: 0.2, type: 'sawtooth', vol: 0.06 });
          }
          break;
        }
        case 'plate': case 'gun': {
          const c = this.boss || { x: 0, y: 0.5, z: e.z, spin: 0 };
          const rad = e.kind === 'plate' ? 2.0 : 3.1, a = (e.kind === 'plate' ? c.spin * 1.6 : c.spin * 0.35 + Math.PI / 4) + e.i * Math.PI / 2;
          e.x = c.x + Math.cos(a) * rad; e.y = c.y + Math.sin(a) * rad * 0.75; e.z = c.z; e.a = a;
          if (e.kind === 'gun') { e.fireT -= dt; if (e.fireT <= 0 && e.z < 40) { e.fireT = r.range(1.6, 2.6); this.enemyShot(e, true); } }
          break;
        }
      }
      // reaching the ship's depth
      if (!e.boss && !['seg', 'gun', 'plate', 'pod'].includes(e.kind) && e.z < SHIP_Z + 0.8 && e.z > SHIP_Z - 1.5 && !e.checked) {
        e.checked = true;
        this.checkPass(e);
      }
    }
    this.ents = this.ents.filter((e) => !e.dead && e.z > -2);
  }

  collect(e, shot = false) {
    const s = this.s;
    if (e.dead) return;
    e.dead = true;
    const P = PICKUP[e.type];
    s.sound.play('powerup');
    let label = P.label;
    if (e.type === 'spread' || e.type === 'plasma') {
      const w = this.weapon;
      if (w.type === e.type) w.lvl = Math.min(3, w.lvl + 1);
      else { w.lvl = Math.max(1, w.lvl - (w.type === 'laser' ? 0 : 1)); w.type = e.type; }
      w.t = 20;
      label += ` LV${w.lvl}`;
      if (w.lvl >= 3) s.unlock('maxed');
    } else if (e.type === 'homing') this.homing = 18;
    else if (e.type === 'drone') this.drone = 22;
    else if (e.type === 'shield') this.shield = true;
    else this.bombs = Math.min(5, this.bombs + 1);
    s.award(100 * this.level, undefined);
    s.fx.text(W / 2, HORIZ + 80, label + (shot ? ' (shot!)' : ''), { color: P.col, size: 22 });
    const [sx, sy, k] = this.proj(e.x, e.y, e.z);
    if (k > 0) s.fx.ring(sx, sy, { color: P.col, radius: 60, life: 0.4, width: 3 });
  }

  checkPass(e) {
    const s = this.s, sh = this.ship, dx = Math.abs(e.x - sh.x), dy = Math.abs(e.y - sh.y);
    if (e.kind === 'ring') {
      if (dx < 0.9 && dy < 0.9) {
        this.rings++; e.dead = true;
        s.award(200 * this.level, W / 2, HORIZ + 120, { chain: true, color: '#fde047', size: 16 });
        s.sound.tone({ freq: 880 + (this.rings % 8) * 60, dur: 0.12, type: 'sine', vol: 0.08 });
        if (this.rings >= 30) s.unlock('rings');
      }
      return;
    }
    if (e.kind === 'pickup') { if (dx < 1.6 && dy < 1.3) this.collect(e); return; }
    if (e.kind === 'gate') {
      const inGap = Math.abs(sh.x - e.gx) < e.gw / 2 - 0.3 && Math.abs(sh.y - e.gy) < e.gh / 2 - 0.2;
      if (inGap) { s.award(150 * this.level, W / 2, HORIZ + 100, { chain: true, color: '#4ade80', size: 18 }); s.sound.tone({ freq: 700, to: 1400, dur: 0.12, type: 'triangle', vol: 0.07 }); }
      else this.hit('gate');
      return;
    }
    if (e.kind === 'fence') {
      if (e.link.alive < 2) return;
      if (Math.abs(sh.y - this.fenceY(e.link)) < 0.38) this.hit('fence');
      else { s.award(200 * this.level, W / 2, HORIZ + 100, { chain: true, color: '#f87171', size: 16 }); s.sound.tone({ freq: 600, to: 1200, dur: 0.1, type: 'triangle', vol: 0.06 }); }
      return;
    }
    if (e.kind === 'pylon') return;
    if (e.kind === 'phantom' && this.cloak(e) < 0.2) return;
    const size = e.kind === 'rock' ? e.size + 0.45 : e.kind === 'mine' ? 1.1 : e.kind === 'cruiser' || e.kind === 'layer' ? 1.6 : 0.9;
    if (dx < size && dy < size * 0.8) this.hit(e);
  }
  fenceY(link) { return Math.sin(this.t * link.spd + link.phase) * (YMAX - 0.2); }

  enemyShot(e, aimed = false, ox = 0, delay = 0, oy = 0) {
    const sh = this.ship, spd = 26 + this.level * 0.8;
    const tx = aimed ? sh.x : e.x + ox + (sh.x - e.x) * 0.5, ty = aimed ? sh.y : e.y + oy + (sh.y - e.y) * 0.5;
    const t = Math.max(0.3, (e.z - SHIP_Z) / spd);
    this.bolts.push({ x: e.x, y: e.y, z: e.z, vx: (tx - e.x) / t, vy: (ty - e.y) / t, vz: -spd, wait: delay });
    this.s.sound.tone({ freq: 520, to: 260, dur: 0.08, type: 'triangle', vol: 0.03 });
  }

  updateBolts(dt) {
    const sh = this.ship;
    for (const b of this.bolts) {
      if (b.wait > 0) { b.wait -= dt; continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (!b.checked && b.z < SHIP_Z + 0.3) {
        b.checked = true;
        if (Math.abs(b.x - sh.x) < 0.75 && Math.abs(b.y - sh.y) < 0.45) { b.dead = true; this.hit('bolt'); }
      }
    }
    this.bolts = this.bolts.filter((b) => !b.dead && b.z > 0.5);
  }

  hit(what) {
    const s = this.s;
    if (this.invuln > 0 || this.bonus || this.done) return;
    if (this.shield) {
      this.shield = false; this.invuln = 1.2;
      s.fx.text(W / 2, HORIZ + 150, '🛡️ SHIELD SAVED YOU', { color: '#a5f3fc', size: 20 });
      s.sound.play('metal');
      return;
    }
    this.hitsTaken++;
    const [sx, sy] = this.proj(this.ship.x, this.ship.y, SHIP_Z);
    s.fx.burst(sx, sy, { colors: ['#fb923c', '#fde047', '#fff'], count: 50, speed: 320, life: 0.8 });
    this.blowUp({ kind: 'player', x: this.ship.x, y: this.ship.y, z: SHIP_Z + 1 });
    s.fx.shake(12, 0.5); s.sound.play('boom');
    s.hurt();
  }

  finish() {
    const s = this.s, L = this.level;
    if (this.done || s.state !== 'playing') return;
    this.done = true;
    const acc = this.shotsFired ? Math.min(1, this.shotsHit / this.shotsFired) : 0;
    s.award(Math.round(acc * 100) * 20 * L, W / 2, HORIZ, { color: '#a5f3fc', size: 22 });
    s.fx.text(W / 2, HORIZ - 40, `SECTOR CLEAR · accuracy ${Math.round(acc * 100)}%`, { color: '#a5f3fc', size: 20, life: 1.5 });
    if (this.hitsTaken === 0 && L >= 3) s.unlock('ace');
    s.completeLevel();
  }

  onLevelClear() { if (this.bonus && this.rings >= 30) this.s.unlock('rings'); }

  // ── Projection & drawing ───────────────────────────────────
  cam() { return [this.ship.x * 0.55, this.ship.y * 0.5 + 3.0]; }
  proj(x, y, z) {
    const [cx, cy] = this.cam();
    if (z < 0.3) return [0, 0, -1];
    const k = F / z;
    return [W / 2 + (x - cx) * k, HORIZ - (y - cy) * k, k];
  }

  /** Draw a model: per-face shading with a specular shine; glow faces are lit up. */
  drawMesh(ctx, mesh, pos, rotv, scale, pal, { flash = false, alpha = 1, glow = true } = {}) {
    const [cx, cy] = this.cam(), fogC = rgb(this.theme);
    const pts = mesh.v.map((v) => {
      const r = rot(v, rotv[0], rotv[1], rotv[2]);
      return { w: [pos[0] + r[0] * scale, pos[1] + r[1] * scale, pos[2] + r[2] * scale], r };
    });
    if (pts.some((p) => p.w[2] < 0.4)) return;
    const scr = pts.map((p) => { const k = F / p.w[2]; return [W / 2 + (p.w[0] - cx) * k, HORIZ - (p.w[1] - cy) * k]; });
    const faces = mesh.f.map((f) => {
      const a = pts[f[0]].r, b = pts[f[1]].r, c = pts[f[2]].r;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
      const dif = Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const spec = Math.pow(Math.abs(n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 22);
      return { f, z: (pts[f[0]].w[2] + pts[f[1]].w[2] + pts[f[2]].w[2]) / 3, dif, spec };
    }).sort((p, q) => q.z - p.z);
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
    for (const fc of faces) {
      const mat = fc.f[3] || 0, base = rgb(pal[mat]);
      const fog = clamp((fc.z - 30) / 75, 0, 0.8);
      let col;
      if (flash) col = [255, 255, 255];
      else if (mat === 3) col = base;
      else {
        const k = (mat === 2 ? 0.45 : 0.25) + 0.75 * fc.dif, sp = fc.spec * (mat === 2 ? 1.1 : 0.55) * 255;
        col = base.map((c) => Math.min(255, c * k + sp));
      }
      col = col.map((c, i) => Math.round(c * (1 - fog) + (fogC[i] * 0.12 + 6) * fog));
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.strokeStyle = ctx.fillStyle;
      if (mat === 3 && glow && !flash && !this.s.lowDetail) { ctx.shadowColor = pal[3]; ctx.shadowBlur = 10; } else ctx.shadowBlur = 0;
      ctx.beginPath();
      const [p0, p1, p2] = [scr[fc.f[0]], scr[fc.f[1]], scr[fc.f[2]]];
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
      ctx.fill(); ctx.lineWidth = 0.7; ctx.stroke();
    }
    ctx.restore();
  }

  render(ctx) {
    const t = this.t, sh = this.ship;
    // backdrop: painted sky with a little parallax, then a nebula tint for the sector
    ctx.drawImage(this.sky, -60 - sh.x * 6, -40 + sh.y * 4);
    const nx = W / 2 + Math.sin(t * 0.1) * 60, ng = ctx.createRadialGradient(nx, HORIZ - 40, 5, nx, HORIZ - 40, 260);
    ng.addColorStop(0, this.theme + '30'); ng.addColorStop(1, this.theme + '00');
    ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, HORIZ, 2, W / 2, HORIZ, 60);
    vg.addColorStop(0, this.bonus ? 'rgba(253,230,138,.45)' : 'rgba(224,242,254,.3)'); vg.addColorStop(1, 'rgba(224,242,254,0)');
    ctx.fillStyle = vg; ctx.fillRect(W / 2 - 60, HORIZ - 60, 120, 120);
    // star streaks
    for (const st of this.stars) {
      const a = this.proj(st.x, st.y, st.z), b = this.proj(st.x, st.y, st.z + 1.5 + this.speed * 0.05);
      if (a[2] < 0) continue;
      ctx.strokeStyle = `rgba(226,232,240,${clamp(1 - st.z / 90, 0.1, 0.9)})`; ctx.lineWidth = clamp(a[2] / 60, 0.5, 2.5);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    this.drawTunnel(ctx);

    // everything in the world, far to near
    const items = [...this.ents.filter((e) => !e.dead), ...this.bolts.map((b) => ({ kind: 'bolt', ...b })), ...this.shots.map((x) => ({ kind: 'shot', ...x })), ...this.missiles.map((x) => ({ kind: 'missile', ...x })), ...this.debris.map((x) => ({ kind: 'debris', ...x }))];
    items.push({ kind: 'player', z: SHIP_Z });
    if (this.drone > 0) { const p = this.dronePos(); items.push({ kind: 'drone', x: p[0], y: p[1], z: p[2] }); }
    items.sort((a, b) => b.z - a.z);
    for (const e of items) this.drawEnt(ctx, e);
    this.drawTrail(ctx);
    this.drawHud(ctx);
  }

  drawTrail(ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const col = this.s.gold ? '253,224,71' : '56,189,248';
    for (const p of this.trail) {
      const [sx, sy, k] = this.proj(p.x, p.y, p.z); if (k < 0) continue;
      const a = p.life / 0.3, rad = Math.max(0.8, k * 0.055 * a);
      ctx.fillStyle = `rgba(${col},${0.3 * a})`; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawTunnel(ctx) {
    const off = this.travel % TUN.step, col = this.theme;
    ctx.save(); ctx.lineWidth = 1.2;
    const P = (x, y, z) => this.proj(x, y, z);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.22;
    for (const [x, y] of [[-TUN.x, -TUN.y], [TUN.x, -TUN.y], [TUN.x, TUN.y], [-TUN.x, TUN.y], [-TUN.x / 3, -TUN.y], [TUN.x / 3, -TUN.y], [-TUN.x / 3, TUN.y], [TUN.x / 3, TUN.y]]) {
      const a = P(x, y, 1), b = P(x, y, 100);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // frames rushing towards you, with corner lights; every other frame is a solid "rib"
    let i = 0;
    for (let z = 100 - off; z > 1; z -= TUN.step, i++) {
      const a = P(-TUN.x, TUN.y, z), b = P(TUN.x, -TUN.y, z), near = clamp(0.55 - z / 180, 0.04, 0.55);
      ctx.globalAlpha = near; ctx.lineWidth = (i + Math.floor(this.travel / TUN.step)) % 2 ? 1 : 2.4;
      ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      ctx.globalAlpha = near * 1.6; ctx.fillStyle = '#fff';
      const lr = Math.max(1, F / z * 0.07);
      for (const [x, y] of [[a[0], a[1]], [b[0], a[1]], [a[0], b[1]], [b[0], b[1]]]) { ctx.beginPath(); ctx.arc(x, y, lr, 0, Math.PI * 2); ctx.fill(); }
    }
    // floor lane markers
    ctx.globalAlpha = 0.3; ctx.fillStyle = col;
    for (let z = 100 - (this.travel * 2 % 12); z > 9; z -= 12) { const p1 = P(-0.15, -TUN.y, z), p2 = P(0.15, -TUN.y, z + 3); ctx.fillRect(p1[0], p2[1], p2[0] - p1[0], Math.max(1, p1[1] - p2[1])); }
    ctx.restore();
  }

  drawEnt(ctx, e) {
    const s = this.s, t = this.t;
    const [sx, sy, k] = e.kind === 'player' ? [0, 0, 1] : this.proj(e.x, e.y, e.z);
    if (k < 0) return;
    const fl = e.flash > 0;
    switch (e.kind) {
      case 'player': {
        const sh = this.ship;
        if (this.invuln > 0 && Math.floor(t * 12) % 2) return;
        this.drawMesh(ctx, M.SHIP, [sh.x, sh.y, SHIP_Z], [sh.pitch, 0, sh.bank], 0.62, s.gold ? PAL.gold : PAL.player);
        if (this.shield) {
          const [ex, ey, ek] = this.proj(sh.x, sh.y, SHIP_Z);
          const g = ctx.createRadialGradient(ex, ey, ek * 0.4, ex, ey, ek * 1.1);
          g.addColorStop(0, 'rgba(103,232,249,0)'); g.addColorStop(0.85, `rgba(103,232,249,${0.18 + 0.1 * Math.sin(t * 6)})`); g.addColorStop(1, 'rgba(165,243,252,.55)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ex, ey, ek * 1.1, ek * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'drone': this.drawMesh(ctx, M.DRONE, [e.x, e.y, e.z], [0, 0, Math.sin(t * 3) * 0.3], 0.7, PAL.turret); break;
      case 'fighter': this.drawMesh(ctx, M.INTERCEPTOR, [e.x, e.y, e.z], [0.15, Math.sin(e.phase) * 0.3, Math.sin(e.phase * 1.3) * 0.4], 0.8, PAL.fighter, { flash: fl }); break;
      case 'phantom': {
        const c = this.cloak(e);
        this.drawMesh(ctx, M.PHANTOM, [e.x, e.y, e.z], [0.15, Math.sin(e.phase) * 0.3, Math.sin(e.phase * 1.3) * 0.4], 0.85, PAL.phantom, { flash: fl, alpha: 0.12 + 0.88 * c });
        if (c < 0.35) { ctx.strokeStyle = `rgba(167,139,250,${0.4 - c})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, k * 1.1, k * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
        break;
      }
      case 'swarm': this.drawMesh(ctx, M.SWARMER, [e.x, e.y, e.z], [0, 0, e.spin], 0.9, PAL.swarm, { flash: fl }); break;
      case 'cruiser': {
        this.drawMesh(ctx, M.CRUISER, [e.x, e.y, e.z], [0.12, 0, Math.sin(e.phase * 0.6) * 0.15], 1.0, PAL.cruiser, { flash: fl });
        if (this.ents.some((p) => p.kind === 'pod' && p.parent === e && !p.dead)) {
          // hexagonal energy shield in front of the hull
          const [hx, hy, hk] = this.proj(e.x, e.y, e.z - 1.6); if (hk < 0) break;
          ctx.save(); ctx.strokeStyle = `rgba(196,181,253,${0.35 + 0.15 * Math.sin(t * 5)})`; ctx.fillStyle = 'rgba(167,139,250,.08)'; ctx.lineWidth = Math.max(1, hk * 0.03);
          const R = hk * 1.3; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; ctx.lineTo(hx + Math.cos(a) * R, hy + Math.sin(a) * R * 0.55); } ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'pod': this.drawMesh(ctx, M.POD, [e.x, e.y, e.z], [t * 1.5, 0, 0], 0.9, PAL.pod, { flash: fl }); break;
      case 'splitter': this.drawMesh(ctx, M.CRYSTAL, [e.x, e.y, e.z], [0.3, e.ry, 0], 1.1, PAL.crystal, { flash: fl }); break;
      case 'shard': this.drawMesh(ctx, M.SHARD, [e.x, e.y, e.z], [e.ry, e.ry * 0.7, 0], 0.9, PAL.crystal, { flash: fl }); break;
      case 'layer': this.drawMesh(ctx, M.LAYER, [e.x, e.y, e.z], [0.25, e.dir * 0.4, -e.dir * 0.2], 1.0, PAL.layer, { flash: fl }); break;
      case 'diver': this.drawMesh(ctx, M.DIVER, [e.x, e.y, e.z], [0, 0, t * 6], 0.9, PAL.diver, { flash: fl }); break;
      case 'rock': this.drawMesh(ctx, this.rocks[e.mesh], [e.x, e.y, e.z], [e.rx, e.ry, 0], e.size, e.big ? PAL.rockBig : PAL.rock, { flash: fl }); break;
      case 'mine': this.drawMesh(ctx, M.MINE, [e.x, e.y, e.z], [t * 2, e.ry, 0], 1.0, PAL.mine, { flash: fl || Math.sin(t * 10) > 0.6 }); break;
      case 'turret': this.drawMesh(ctx, M.TURRET, [e.x, e.y, e.z], [0, Math.atan2(this.ship.x - e.x, e.z) * 0.6, 0], 1.1, PAL.turret, { flash: fl }); break;
      case 'pylon': this.drawMesh(ctx, M.PYLON, [e.x, e.y, e.z], [0, t, 0], 1.2, PAL.pylon, { flash: fl }); break;
      case 'fence': {
        if (e.link.alive < 2) break;
        const fy = this.fenceY(e.link), a = this.proj(-XMAX - 0.9, fy, e.z), b = this.proj(XMAX + 0.9, fy, e.z);
        if (a[2] < 0) break;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(248,113,113,.35)'; ctx.lineWidth = Math.max(3, a[2] * 0.5); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.strokeStyle = '#fee2e2'; ctx.lineWidth = Math.max(1, a[2] * 0.08); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'mother': {
        this.drawMesh(ctx, M.MOTHER, [e.x, e.y, e.z], [0.28, e.ry, 0], 1.55, e.hp < e.max / 2 ? ['#7f1d1d', '#f43f5e', '#7dd3fc', '#fde047'] : PAL.mother, { flash: fl });
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2 + e.ry, [lx, ly, lk] = this.proj(e.x + Math.cos(a) * 3.6, e.y - 0.1, e.z + Math.sin(a) * 3.6 * 0.4);
          if (lk < 0) continue;
          ctx.fillStyle = (i + Math.floor(t * 8)) % 3 ? '#fde047' : '#f43f5e'; ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, lk * 0.08), 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'head': this.drawMesh(ctx, M.HYDRA_HEAD, [e.x, e.y, e.z], [Math.sin(e.patT * 2) * 0.15, Math.cos(e.patT * 0.8) * 0.3, 0], 1.25, e.armour ? ['#14532d', '#475569', '#000000', '#f43f5e'] : PAL.hydra, { flash: fl }); break;
      case 'seg': this.drawMesh(ctx, M.HYDRA_SEG, [e.x, e.y, e.z], [0, 0, t + e.i], 1.05, PAL.hydra, { flash: fl }); break;
      case 'core': this.drawMesh(ctx, M.CORE, [e.x, e.y, e.z], [0, 0, e.spin], 1.0, e.hp < e.max / 2 ? ['#450a0a', '#f87171', '#000000', '#fbbf24'] : PAL.fortress, { flash: fl }); break;
      case 'plate': this.drawMesh(ctx, M.PLATE, [e.x, e.y, e.z], [0, 0, e.a + Math.PI / 2], 1.1, PAL.plate, { alpha: 0.85 }); break;
      case 'gun': this.drawMesh(ctx, M.TURRET, [e.x, e.y, e.z], [0, 0, e.a], 0.85, PAL.fortress, { flash: fl }); break;
      case 'gate': {
        const a = this.proj(-TUN.x, TUN.y, e.z), b = this.proj(TUN.x, -TUN.y, e.z);
        const g1 = this.proj(e.gx - e.gw / 2, e.gy + e.gh / 2, e.z), g2 = this.proj(e.gx + e.gw / 2, e.gy - e.gh / 2, e.z);
        ctx.save();
        ctx.fillStyle = `rgba(244,63,94,${clamp(0.55 - e.z / 200, 0.1, 0.4)})`;
        ctx.beginPath(); ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.rect(g2[0], g1[1], g1[0] - g2[0], g2[1] - g1[1]); ctx.fill('evenodd');
        ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        for (let y = a[1]; y < b[1]; y += Math.max(4, k * 0.35)) { ctx.beginPath(); ctx.moveTo(a[0], y); ctx.lineTo(b[0], y); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3; ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12;
        ctx.strokeRect(g1[0], g1[1], g2[0] - g1[0], g2[1] - g1[1]);
        ctx.restore();
        break;
      }
      case 'ring': {
        ctx.save(); ctx.shadowColor = '#fde047'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#b45309'; ctx.lineWidth = Math.max(2.5, k * 0.2); ctx.beginPath(); ctx.ellipse(sx, sy, k * 0.9, k * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = Math.max(1.2, k * 0.09); ctx.beginPath(); ctx.ellipse(sx, sy - k * 0.02, k * 0.9, k * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'pickup': {
        const P = PICKUP[e.type];
        if (e.magnet) { const [px, py] = this.proj(this.ship.x, this.ship.y, SHIP_Z); ctx.save(); ctx.strokeStyle = P.col; ctx.globalAlpha = 0.25; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke(); ctx.restore(); }
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, k * 1.0);
        halo.addColorStop(0, P.col + 'aa'); halo.addColorStop(1, P.col + '00');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, k * 1.0, 0, Math.PI * 2); ctx.fill();
        this.drawMesh(ctx, M.CAPSULE, [e.x, e.y, e.z], [0, e.spin, 0.4], 1.25, ['#e2e8f0', P.col, '#000000', P.col]);
        ctx.fillStyle = '#0f172a'; ctx.font = `900 ${Math.max(7, k * 0.32)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(P.letter, sx, sy + 1);
        break;
      }
      case 'bolt': {
        if (e.wait > 0) return;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(3, k * 0.3));
        g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#f472b6'); g.addColorStop(1, 'rgba(244,63,94,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, k * 0.3), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'shot': {
        const [bx, by] = this.proj(e.x, e.y, e.z + (e.big ? 1.5 : 2.5));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = e.col; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(2, k * (e.big ? 0.32 : 0.12));
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(1, k * (e.big ? 0.12 : 0.04));
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'missile': {
        const [bx, by] = this.proj(e.x - e.vx * 0.02, e.y - e.vy * 0.02, e.z - e.vz * 0.02);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fb923c'; ctx.lineWidth = Math.max(2, k * 0.12); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = '#fff7ed'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, k * 0.06), 0, Math.PI * 2); ctx.fill(); ctx.restore();
        break;
      }
      case 'debris': {
        const r = Math.max(1, k * e.size), a = e.life / e.max;
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = e.col; ctx.translate(sx, sy); ctx.rotate(e.rot);
        ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.6, r * 0.7); ctx.lineTo(-r * 0.4, -r * 0.8); ctx.closePath(); ctx.fill();
        if (a > 0.6) { ctx.fillStyle = 'rgba(253,186,116,.7)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        break;
      }
    }
  }

  drawHud(ctx) {
    const s = this.s, w = this.weapon;
    ctx.fillStyle = 'rgba(3,5,20,.72)'; ctx.fillRect(0, 0, W, 44);
    const boss = this.boss;
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ RING RUN · ${this.rings} rings · ${Math.ceil(s.bonusLeft)}s`);
    else if (boss) {
      const name = { mother: 'MOTHERSHIP', head: boss.armour ? 'HYDRA · break its tail!' : 'HYDRA', core: 'STAR FORTRESS' }[boss.kind];
      progressBar(ctx, 14, 12, W - 28, 20, boss.hp / boss.max, '#f43f5e', `⚠️ ${name} ${Math.ceil(boss.hp / boss.max * 100)}%`);
    } else progressBar(ctx, 14, 12, W - 28, 20, clamp(this.sectorT / this.sectorLen, 0, 1), this.theme, this.sectorT >= this.sectorLen && this.bossLevel ? 'Boss incoming…' : `Sector ${this.level} · ${this.kills} kills`);
    if (this.bonus) return;
    // weapon panel
    const WP = WEAPONS[w.type];
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,20,.65)'; roundRect(ctx, 10, H - 92, 178, 62, 12); ctx.fill();
    ctx.strokeStyle = WP.col + '88'; ctx.lineWidth = 1.5; roundRect(ctx, 10, H - 92, 178, 62, 12); ctx.stroke();
    ctx.font = '800 14px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = WP.col;
    ctx.fillText(`${WP.icon} ${WP.name}`, 20, H - 76);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < w.lvl ? WP.col : 'rgba(255,255,255,.15)'; roundRect(ctx, 124 + i * 20, H - 82, 16, 10, 3); ctx.fill(); }
    if (w.t > 0) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(20, H - 64, 158, 4); ctx.fillStyle = WP.col; ctx.fillRect(20, H - 64, 158 * clamp(w.t / 20, 0, 1), 4); }
    ctx.font = '700 11px system-ui'; ctx.fillStyle = '#e2e8f0';
    const extras = [this.homing > 0 ? `🚀${Math.ceil(this.homing)}` : '', this.drone > 0 ? `🛰️${Math.ceil(this.drone)}` : '', this.shield ? '🛡️' : ''].filter(Boolean).join('  ');
    ctx.fillText(extras || 'Shoot or fly into capsules', 20, H - 45);
    ctx.restore();
    // bomb button
    ctx.save();
    ctx.globalAlpha = this.bombs ? 0.9 : 0.35;
    ctx.fillStyle = '#831843'; ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W - 44, H - 60, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`💣${this.bombs}`, W - 44, H - 60);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.45)';
    if (s.state === 'playing' && this.sectorT < 6) ctx.fillText(this.s.coarse ? 'Drag to fly · you fire automatically · 💣 button' : 'Arrows / mouse to fly · Space / click to fire · B bomb', W / 2, H - 14);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.fillText('★ GOLDEN FIGHTER', W / 2, 60); }
  }
}

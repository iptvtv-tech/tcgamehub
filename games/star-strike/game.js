// ─────────────────────────────────────────────────────────────
//  STAR STRIKE 3D — game 16 (Zone 3 · Master)
//  Fly a starfighter down a neon space corridor. Everything is real 3D:
//  low-poly models (ship, fighters, asteroids, mines, the mothership) are
//  lit and projected live — no images. Clear each sector; every 5th-minus-one
//  sector (4, 9, 14…) ends with a MOTHERSHIP boss.
//    L1 fighters + asteroids   L3 mines   L4 boss   L5 ★ RING RUN bonus
//    L6 laser gates (fly through the gap)   L7 kamikaze divers   L8+ turrets that aim
//  One hit = one life (the 🛡️ shield power-up saves you once). 💣 bombs clear the sky.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'star-strike';
const W = 480, H = 720;
const F = 300;                 // focal length (pixels)
const HORIZ = 272;             // screen y of the vanishing point
const SHIP_Z = 4.5;            // the ship's distance from the camera
const XMAX = 3, YMAX = 2;      // how far the ship can fly from the centre
const TUN = { x: 6, y: 4.2, step: 6 };

// ── Tiny 3D mesh renderer ────────────────────────────────────
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rot(v, rx, ry, rz) {
  let [x, y, z] = v, t;
  if (ry) { t = x * Math.cos(ry) + z * Math.sin(ry); z = -x * Math.sin(ry) + z * Math.cos(ry); x = t; }
  if (rx) { t = y * Math.cos(rx) - z * Math.sin(rx); z = y * Math.sin(rx) + z * Math.cos(rx); y = t; }
  if (rz) { t = x * Math.cos(rz) - y * Math.sin(rz); y = x * Math.sin(rz) + y * Math.cos(rz); x = t; }
  return [x, y, z];
}
const LIGHT = (() => { const l = [-0.5, 0.8, -0.6], n = Math.hypot(...l); return l.map((v) => v / n); })();

// ship: nose points +z (away from the camera)
const SHIP = {
  v: [[0, 0, 1.3], [0, 0.26, 0.15], [-1.15, -0.05, -0.45], [1.15, -0.05, -0.45], [0, 0.2, -0.6], [0, -0.2, -0.5], [-0.38, 0.02, -0.72], [0.38, 0.02, -0.72], [-1.2, 0.35, -0.7], [1.2, 0.35, -0.7]],
  f: [[0, 1, 2], [0, 3, 1], [0, 2, 5], [0, 5, 3], [1, 4, 2], [1, 3, 4], [2, 4, 6], [3, 7, 4], [2, 6, 5], [3, 5, 7], [4, 7, 6], [5, 6, 7], [2, 8, 6], [3, 7, 9]],
};
// enemy fighter: nose points -z (towards the player)
const FIGHTER = {
  v: [[0, 0, -1.1], [-0.95, 0, 0.35], [0.95, 0, 0.35], [0, 0.34, 0.3], [0, -0.28, 0.3], [0, 0, 0.8], [-0.6, 0.5, 0.6], [0.6, 0.5, 0.6]],
  f: [[0, 1, 3], [0, 3, 2], [0, 4, 1], [0, 2, 4], [1, 5, 3], [3, 5, 2], [1, 4, 5], [2, 5, 4], [1, 3, 6], [2, 7, 3]],
};
const DIVER = {
  v: [[0, 0, -1.3], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 0.5, 0.5], [0, -0.5, 0.5]],
  f: [[0, 1, 3], [0, 3, 2], [0, 2, 4], [0, 4, 1], [1, 4, 2], [1, 2, 3]],
};
function icosa(seed) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((p, i) => { const n = Math.hypot(...p), j = 0.78 + ((Math.sin(seed * 12.9 + i * 78.2) + 1) / 2) * 0.35; return p.map((c) => c / n * j); });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
}
function saucer(n = 12) {
  const v = [[0, 0.75, 0], [0, -0.45, 0]];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; v.push([Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2]); }
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; v.push([Math.cos(a) * 1.1, 0.42, Math.sin(a) * 1.1]); }
  const f = [];
  for (let i = 0; i < n; i++) {
    const a = 2 + i, b = 2 + (i + 1) % n, c = 2 + n + i;
    f.push([1, b, a], [a, b, c], [c, b, 2 + n + (i + 1) % n], [0, c, 2 + n + (i + 1) % n]);
  }
  return { v, f };
}
const MOTHER = saucer(12);
const MINE = (() => {
  const v = [[0, 0.5, 0], [0, -0.5, 0], [0.5, 0, 0], [-0.5, 0, 0], [0, 0, 0.5], [0, 0, -0.5]];
  const f = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]];
  return { v, f };
})();

runGame({
  id: ID,
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
      1: 'Fly: arrows / WASD (or mouse / drag). Fire: hold Space / mouse / touch. 💣 Bomb: B or the button. One hit costs a life!',
      2: 'Big asteroids take 3 hits. Fighters shoot back!',
      3: '💥 Space mines — shoot them before they reach you.',
      4: '⚠️ MOTHERSHIP ahead. Survive the sector, then take it down!',
      6: '🚧 Laser gates: fly through the green gap.',
      7: '🎯 Kamikaze divers lock on to you — keep moving!',
      8: 'Turrets now aim where you are.',
    };
    if (level % 5 === 4) return `⚠️ MOTHERSHIP sector! ${notes[level] || 'It gets tougher every time.'}`;
    return notes[level] || 'Denser waves, faster enemies. Stay sharp!';
  },
  create: (shell) => new StarStrike(shell),
});

class StarStrike {
  constructor(s) {
    this.s = s; this.t = 0;
    this.ship = { x: 0, y: -0.6, bank: 0, pitch: 0 };
    this.stars = Array.from({ length: 90 }, () => this.newStar(true));
    this.astMeshes = Array.from({ length: 5 }, (_, i) => icosa(i + 1));
    this.bombs = 1;
    addEventListener('keydown', (e) => { if (e.code === 'KeyB' && this.s.state === 'playing') this.bomb(); });
    this.startLevel(1, false);
  }
  newStar(anyZ) { return { x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 20, z: anyZ ? Math.random() * 90 + 2 : 90 }; }

  reset() { this.bombs = 1; }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.speed = 24 * s.speed(0.03, 1.6);
    this.sectorT = 0;
    this.sectorLen = bonus ? 99 : 38 + Math.min(20, level * 1.4);
    this.bossLevel = !bonus && level % 5 === 4;
    this.boss = null; this.bossDead = false; this.finishSoon = 0;
    this.ents = []; this.shots = []; this.bolts = [];
    this.waveT = 1.5; this.fireT = 0; this.twin = 0; this.shield = this.shield || false;
    this.invuln = 1.5; this.kills = 0; this.hitsTaken = 0; this.shotsFired = 0; this.shotsHit = 0; this.rings = 0;
    this.travel = 0; this.done = false;
    this.theme = bonus ? '#fbbf24' : this.bossLevel ? '#f43f5e' : level >= 6 ? '#e879f9' : '#22d3ee';
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
    this.ents = this.ents.filter((e) => e.z > 30 || e.kind === 'boss');
    this.bombs = Math.max(this.bombs, 1);
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; this.moveStars(dt, 10); }

  moveStars(dt, v) {
    for (const st of this.stars) { st.z -= v * dt * 1.8; if (st.z < 1) Object.assign(st, this.newStar(false)); }
  }

  update(dt) {
    const s = this.s, sh = this.ship, inp = s.input, L = this.level;
    this.t += dt; this.travel += this.speed * dt;
    this.moveStars(dt, this.speed);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.twin > 0) this.twin -= dt;

    // steering
    let vx = 0, vy = 0;
    if (inp.isDown('left')) vx -= 1; if (inp.isDown('right')) vx += 1;
    if (inp.isDown('up')) vy += 1; if (inp.isDown('down')) vy -= 1;
    const px = sh.x, py = sh.y;
    if (vx || vy) { sh.x += vx * 7 * dt; sh.y += vy * 5.5 * dt; this.aim = null; }
    else if (this.aim) { sh.x += clamp(this.aim.x - sh.x, -9 * dt, 9 * dt); sh.y += clamp(this.aim.y - sh.y, -7 * dt, 7 * dt); }
    sh.x = clamp(sh.x, -XMAX, XMAX); sh.y = clamp(sh.y, -YMAX, YMAX);
    sh.bank += (clamp(-(sh.x - px) / dt * 0.12, -0.7, 0.7) - sh.bank) * Math.min(1, dt * 8);
    sh.pitch += (clamp((sh.y - py) / dt * 0.08, -0.4, 0.4) - sh.pitch) * Math.min(1, dt * 8);

    // firing
    this.fireT -= dt;
    const firing = inp.isDown('action') || (inp.pointer.down && inp.pointer.y < H - 110) || (inp.pointer.down && Math.hypot(inp.pointer.x - (W - 44), inp.pointer.y - (H - 60)) > 30 && inp.pointer.y >= H - 110);
    if (firing && this.fireT <= 0 && !this.bonus) this.fire();

    // sector clock + waves
    if (!this.done) {
      this.sectorT += dt;
      if (this.bonus) this.bonusSpawns(dt);
      else if (this.sectorT < this.sectorLen) { this.waveT -= dt; if (this.waveT <= 0) this.spawnWave(); }
      else if (this.bossLevel && !this.boss && !this.bossDead) this.spawnBoss();
      else if (!this.bossLevel && this.ents.every((e) => e.z < SHIP_Z - 2 || e.kind === 'pickup')) this.finish();
    }

    this.updateShots(dt);
    this.updateEnts(dt);
    this.updateBolts(dt);
  }

  fire() {
    const s = this.s, sh = this.ship;
    this.fireT = 0.14;
    const guns = this.twin > 0 ? [-0.9, -0.3, 0.3, 0.9] : [-0.55, 0.55];
    for (const gx of guns) this.shots.push({ x: sh.x + gx, y: sh.y - 0.05, z: SHIP_Z + 0.6, vx: gx * (this.twin > 0 ? 0.6 : 0.2) });
    this.shotsFired++;
    s.sound.tone({ freq: 1400, to: 380, dur: 0.07, type: 'square', vol: 0.025 });
  }

  bomb() {
    const s = this.s;
    if (this.bombs <= 0 || this.bonus || s.state !== 'playing') return;
    this.bombs--;
    s.fx.flash('#e0f2fe', 0.5); s.fx.shake(10, 0.4); s.sound.play('boom');
    s.sound.tone({ freq: 60, to: 30, dur: 0.8, type: 'sawtooth', vol: 0.15 });
    this.bolts = [];
    for (const e of this.ents) {
      if (e.kind === 'pickup' || e.kind === 'gate' || e.kind === 'ring') continue;
      if (e.kind === 'boss') { this.damage(e, 12); continue; }
      if (e.z < 70) this.destroy(e, true);
    }
  }

  // ── Spawning ───────────────────────────────────────────────
  spawnWave() {
    const s = this.s, r = s.rng, L = this.level;
    this.waveT = Math.max(0.7, 1.55 - L * 0.06) * r.range(0.8, 1.2);
    const pool = ['fighters', 'fighters', 'asteroids', 'asteroids'];
    if (L >= 3) pool.push('mines');
    if (L >= 6) pool.push('gate');
    if (L >= 7) pool.push('divers');
    if (L >= 8) pool.push('turret');
    const kind = r.pick(pool);
    const z = 95;
    if (kind === 'fighters') {
      const n = Math.min(6, 3 + Math.floor(L / 3)), cx = r.range(-2, 2), cy = r.range(-1.2, 1.2), shape = r.int(0, 2);
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        const ox = shape === 0 ? k * 1.4 : shape === 1 ? Math.cos(i / n * 6.28) * 1.8 : k * 1.2;
        const oy = shape === 0 ? -Math.abs(k) * 0.6 : shape === 1 ? Math.sin(i / n * 6.28) * 1.2 : 0;
        this.ents.push({ kind: 'fighter', x: cx + ox, y: cy + oy, z: z + Math.abs(k) * 2, hp: L >= 6 ? 2 : 1, hold: r.range(14, 22), phase: r.range(0, 6), fireT: r.range(1.2, 3), col: '#a3e635', holdT: r.range(4, 7) });
      }
    } else if (kind === 'asteroids') {
      const n = Math.min(8, 3 + Math.floor(L / 2));
      for (let i = 0; i < n; i++) {
        const big = r.chance(0.4);
        this.ents.push({ kind: 'rock', x: r.range(-XMAX - 0.5, XMAX + 0.5), y: r.range(-YMAX - 0.3, YMAX + 0.3), z: z + i * 5, size: big ? r.range(1.1, 1.5) : r.range(0.5, 0.8), hp: big ? 3 : 1, spin: [r.range(-2, 2), r.range(-2, 2)], rx: 0, ry: 0, mesh: r.int(0, 4), col: big ? '#a8a29e' : '#d6d3d1', drift: [r.range(-0.6, 0.6), r.range(-0.4, 0.4)] });
      }
    } else if (kind === 'mines') {
      const n = Math.min(5, 1 + Math.floor(L / 3));
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'mine', x: r.range(-XMAX, XMAX), y: r.range(-YMAX, YMAX), z: z + i * 7, hp: 1, col: '#f87171', ry: 0 });
    } else if (kind === 'gate') {
      this.ents.push({ kind: 'gate', z, gx: r.range(-XMAX + 1, XMAX - 1), gy: r.range(-YMAX + 0.6, YMAX - 0.6), gw: Math.max(1.9, 2.7 - L * 0.05), gh: Math.max(1.35, 1.85 - L * 0.03), passed: false });
    } else if (kind === 'divers') {
      const n = Math.min(4, 1 + Math.floor((L - 5) / 2));
      for (let i = 0; i < n; i++) this.ents.push({ kind: 'diver', x: r.range(-XMAX, XMAX), y: r.range(-YMAX, YMAX), z: z + i * 6, hp: 1, col: '#fb923c', lock: false });
    } else if (kind === 'turret') {
      this.ents.push({ kind: 'turret', x: r.pick([-TUN.x + 0.8, TUN.x - 0.8]), y: r.range(-2.5, 2.5), z, hp: 3, col: '#60a5fa', fireT: 0.8 });
    }
    // power-ups now and then
    if (r.chance(0.12)) this.ents.push({ kind: 'pickup', type: r.pick(['twin', 'twin', 'shield', 'bomb']), x: r.range(-XMAX + 0.5, XMAX - 0.5), y: r.range(-YMAX + 0.4, YMAX - 0.4), z: z + 10 });
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
    const L = this.level, hp = 70 + L * 10;
    this.boss = { kind: 'boss', x: 0, y: 0.6, z: 95, targetZ: 30, hp, max: hp, col: '#f43f5e', ry: 0, fireT: 2, pattern: 0, patT: 0 };
    this.ents.push(this.boss);
    this.s.fx.text(W / 2, HORIZ - 40, '⚠️ MOTHERSHIP!', { color: '#f43f5e', size: 34, life: 1.6 });
    this.s.sound.tone({ freq: 90, to: 60, dur: 1.2, type: 'sawtooth', vol: 0.12 });
  }

  // ── Movement & collisions ──────────────────────────────────
  updateShots(dt) {
    for (const sh of this.shots) {
      sh.z += 90 * dt; sh.x += sh.vx * dt * 3;
      for (const e of this.ents) {
        if (e.dead || !['fighter', 'rock', 'mine', 'diver', 'turret', 'boss'].includes(e.kind)) continue;
        const size = e.kind === 'boss' ? 2.3 : e.kind === 'rock' ? e.size : 0.9;
        const hy = e.kind === 'boss' ? 1.4 : size;
        if (Math.abs(sh.x - e.x) < size && Math.abs(sh.y - e.y) < hy && Math.abs(sh.z - e.z) < (e.kind === 'boss' ? 2.5 : 1.8)) {
          sh.dead = true; this.shotsHit++;
          this.damage(e, 1);
          break;
        }
      }
    }
    this.shots = this.shots.filter((sh) => !sh.dead && sh.z < 110);
  }

  damage(e, n) {
    const s = this.s;
    e.hp -= n; e.flash = 0.12;
    if (e.hp <= 0) this.destroy(e, false);
    else s.sound.tone({ freq: 300, to: 200, dur: 0.04, type: 'square', vol: 0.03 });
  }

  destroy(e, byBomb) {
    const s = this.s, L = this.level;
    if (e.dead) return;
    e.dead = true;
    const [sx, sy, sc] = this.proj(e.x, e.y, e.z);
    const pts = { fighter: 100, rock: e.size > 1 ? 150 : 50, mine: 80, diver: 120, turret: 200, boss: 5000 }[e.kind] || 50;
    if (sc > 0) {
      s.award(pts * L, sx, sy - 20, { chain: !byBomb && e.kind !== 'boss', color: '#fde047', size: e.kind === 'boss' ? 30 : 16 });
      s.fx.burst(sx, sy, { colors: [e.col || '#fff', '#fde047', '#fff'], count: e.kind === 'boss' ? 90 : 18, speed: e.kind === 'boss' ? 420 : 200 * Math.min(2, sc / 40), life: 0.6 });
    }
    s.sound.noise({ dur: e.kind === 'boss' ? 1 : 0.25, vol: e.kind === 'boss' ? 0.4 : 0.15, freq: 1200, to: 80 });
    s.sound.tone({ freq: 160, to: 40, dur: 0.2, type: 'sawtooth', vol: 0.05 });
    this.kills++;
    if (e.kind === 'fighter' && s.rng.chance(0.07)) this.ents.push({ kind: 'pickup', type: s.rng.pick(['twin', 'shield', 'bomb']), x: e.x, y: e.y, z: e.z });
    if (e.kind === 'boss') {
      this.bossDead = true; this.boss = null;
      s.fx.flash('#fde047', 0.5); s.fx.shake(14, 0.8); s.unlock('boss');
      s.fx.text(W / 2, HORIZ - 60, 'MOTHERSHIP DESTROYED!', { color: '#fde047', size: 26, life: 1.8 });
      this.finishSoon = 1.5;
    }
  }

  updateEnts(dt) {
    const s = this.s, sh = this.ship, L = this.level, v = this.speed;
    if (this.finishSoon > 0 && (this.finishSoon -= dt) <= 0) this.finish();
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      switch (e.kind) {
        case 'fighter': {
          // fly in, hover ahead of you strafing and shooting, then peel away past you
          e.phase += dt;
          if (e.holdT > 0 && e.z <= e.hold) { e.z = e.hold; e.holdT -= dt; e.x += Math.sin(e.phase * 1.3) * dt * 1.5; e.y += Math.cos(e.phase * 1.1) * dt; }
          else e.z -= (e.holdT > 0 ? v * 0.9 : v * 0.8) * dt;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.z < 60 && e.z > 10) { e.fireT = Math.max(1.0, 2.6 - L * 0.1) * s.rng.range(0.8, 1.3); this.enemyShot(e, L >= 4 && s.rng.chance(0.3)); }
          break;
        }
        case 'rock': e.z -= v * dt; e.rx += e.spin[0] * dt; e.ry += e.spin[1] * dt; e.x += e.drift[0] * dt; e.y += e.drift[1] * dt; break;
        case 'mine': e.z -= v * dt; e.ry += dt * 3; break;
        case 'gate': e.z -= v * dt; break;
        case 'ring': e.z -= v * 1.1 * dt; break;
        case 'pickup': e.z -= v * 0.8 * dt; break;
        case 'diver':
          e.z -= v * 1.25 * dt;
          if (e.z < 40) { e.x += clamp(sh.x - e.x, -2.2 * dt, 2.2 * dt); e.y += clamp(sh.y - e.y, -1.8 * dt, 1.8 * dt); }
          break;
        case 'turret':
          e.z -= v * dt;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.z < 70 && e.z > 12) { e.fireT = 1.2; this.enemyShot(e, true); }
          break;
        case 'boss': {
          if (e.z > e.targetZ) e.z -= 12 * dt;
          e.ry += dt * 0.8; e.patT += dt;
          e.x = Math.sin(e.patT * 0.6) * 2.2; e.y = 0.8 + Math.sin(e.patT * 0.9) * 0.8;
          e.fireT -= dt;
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
      }
      // reaching the ship's depth
      if (e.kind !== 'boss' && e.z < SHIP_Z + 0.8 && e.z > SHIP_Z - 1.5 && !e.checked) {
        e.checked = true;
        this.checkPass(e);
      }
    }
    this.ents = this.ents.filter((e) => !e.dead && e.z > -2);
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
    if (e.kind === 'pickup') {
      if (dx < 1 && dy < 0.9) {
        e.dead = true;
        s.sound.play('powerup');
        const label = { twin: '⚡ TWIN LASERS!', shield: '🛡️ SHIELD!', bomb: '💣 +1 BOMB' }[e.type];
        s.fx.text(W / 2, HORIZ + 80, label, { color: '#a5f3fc', size: 22 });
        if (e.type === 'twin') this.twin = 10; else if (e.type === 'shield') this.shield = true; else this.bombs++;
      }
      return;
    }
    if (e.kind === 'gate') {
      const inGap = Math.abs(sh.x - e.gx) < e.gw / 2 - 0.3 && Math.abs(sh.y - e.gy) < e.gh / 2 - 0.2;
      if (inGap) { s.award(150 * this.level, W / 2, HORIZ + 100, { chain: true, color: '#4ade80', size: 18 }); s.sound.tone({ freq: 700, to: 1400, dur: 0.12, type: 'triangle', vol: 0.07 }); }
      else this.hit('gate');
      return;
    }
    const size = e.kind === 'rock' ? e.size + 0.45 : e.kind === 'mine' ? 1.1 : 0.9;
    if (dx < size && dy < size * 0.8) this.hit(e);
  }

  enemyShot(e, aimed = false, ox = 0, delay = 0, oy = 0) {
    const sh = this.ship, spd = 26 + this.level * 0.8;
    const tx = aimed ? sh.x : e.x + ox + (sh.x - e.x) * 0.5, ty = aimed ? sh.y : e.y + oy + (sh.y - e.y) * 0.5;
    const t = (e.z - SHIP_Z) / spd;
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
    s.fx.shake(12, 0.5); s.sound.play('boom');
    s.hurt();
  }

  finish() {
    const s = this.s, L = this.level;
    if (this.done || s.state !== 'playing') return;
    this.done = true;
    const acc = this.shotsFired ? this.shotsHit / this.shotsFired : 0;
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

  drawMesh(ctx, mesh, pos, rotv, scale, color, { glow = null, flash = false, alpha = 1 } = {}) {
    const [cx, cy] = this.cam(), base = hex(color);
    const pts = mesh.v.map((v) => {
      const r = rot(v, rotv[0], rotv[1], rotv[2]);
      const wx = pos[0] + r[0] * scale, wy = pos[1] + r[1] * scale, wz = pos[2] + r[2] * scale;
      return { w: [wx, wy, wz], r };
    });
    if (pts.some((p) => p.w[2] < 0.4)) return;
    const faces = mesh.f.map((f) => {
      const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
      const u = [b.r[0] - a.r[0], b.r[1] - a.r[1], b.r[2] - a.r[2]], v = [c.r[0] - a.r[0], c.r[1] - a.r[1], c.r[2] - a.r[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nl = Math.hypot(...n) || 1;
      const lit = Math.abs((n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl);
      return { f, z: (a.w[2] + b.w[2] + c.w[2]) / 3, lit };
    }).sort((p, q) => q.z - p.z);
    ctx.save(); ctx.globalAlpha = alpha;
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
    for (const fc of faces) {
      const k = flash ? 1 : 0.28 + 0.72 * fc.lit;
      const fog = clamp((fc.z - 30) / 70, 0, 0.85);
      const col = base.map((c, i) => Math.round((flash ? 255 : c * k) * (1 - fog) + [8, 6, 30][i] * fog));
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      fc.f.forEach((i, j) => {
        const w = pts[i].w, kz = F / w[2];
        const sx = W / 2 + (w[0] - cx) * kz, sy = HORIZ - (w[1] - cy) * kz;
        j ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke();
    }
    ctx.restore();
  }

  render(ctx) {
    const s = this.s, t = this.t, sh = this.ship;
    // deep space
    const g = ctx.createRadialGradient(W / 2, HORIZ, 10, W / 2, HORIZ, 520);
    g.addColorStop(0, this.bonus ? '#3b2604' : '#16103a'); g.addColorStop(1, '#030210');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // nebula glow
    const nx = W / 2 + Math.sin(t * 0.1) * 60, ng = ctx.createRadialGradient(nx, HORIZ - 40, 5, nx, HORIZ - 40, 190);
    ng.addColorStop(0, this.theme + '33'); ng.addColorStop(1, this.theme + '00');
    ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
    // star streaks
    for (const st of this.stars) {
      const a = this.proj(st.x, st.y, st.z), b = this.proj(st.x, st.y, st.z + 1.5 + this.speed * 0.05);
      if (a[2] < 0) continue;
      ctx.strokeStyle = `rgba(226,232,240,${clamp(1 - st.z / 90, 0.1, 0.9)})`; ctx.lineWidth = clamp(a[2] / 60, 0.5, 2.5);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    this.drawTunnel(ctx);

    // everything in the world, far to near
    const items = [...this.ents.filter((e) => !e.dead), ...this.bolts.map((b) => ({ kind: 'bolt', ...b })), ...this.shots.map((x) => ({ kind: 'shot', ...x }))];
    items.push({ kind: 'player', z: SHIP_Z });
    items.sort((a, b) => b.z - a.z);
    for (const e of items) this.drawEnt(ctx, e);

    this.drawHud(ctx);
  }

  drawTunnel(ctx) {
    const off = this.travel % TUN.step, col = this.theme;
    ctx.save(); ctx.lineWidth = 1.2;
    const corner = (x, y, z) => this.proj(x, y, z);
    // long corner lines
    ctx.strokeStyle = col; ctx.globalAlpha = 0.25;
    for (const [x, y] of [[-TUN.x, -TUN.y], [TUN.x, -TUN.y], [TUN.x, TUN.y], [-TUN.x, TUN.y], [-TUN.x / 3, -TUN.y], [TUN.x / 3, -TUN.y]]) {
      const a = corner(x, y, 1), b = corner(x, y, 100);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // frames rushing towards you
    for (let z = 100 - off; z > 1; z -= TUN.step) {
      const a = corner(-TUN.x, TUN.y, z), b = corner(TUN.x, -TUN.y, z);
      ctx.globalAlpha = clamp(0.55 - z / 180, 0.04, 0.55);
      ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    }
    ctx.restore();
  }

  drawEnt(ctx, e) {
    const s = this.s, t = this.t;
    const [sx, sy, k] = e.kind === 'player' ? [0, 0, 1] : this.proj(e.x, e.y, e.z);
    if (k < 0) return;
    switch (e.kind) {
      case 'player': {
        const sh = this.ship;
        if (this.invuln > 0 && Math.floor(t * 12) % 2) return;
        const col = s.gold ? '#fbbf24' : '#e2e8f0';
        this.drawMesh(ctx, SHIP, [sh.x, sh.y, SHIP_Z], [sh.pitch, 0, sh.bank], 0.62, col, { glow: s.gold ? '#fbbf24' : '#38bdf8' });
        // engine glow
        const [ex, ey, ek] = this.proj(sh.x, sh.y + 0.02, SHIP_Z - 0.5);
        ctx.fillStyle = 'rgba(56,189,248,.8)'; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 16;
        for (const d of [-0.24, 0.24]) { const [gx] = this.proj(sh.x + d * Math.cos(sh.bank), sh.y, SHIP_Z - 0.5); ctx.beginPath(); ctx.arc(gx, ey, ek * 0.09 * (1 + Math.random() * 0.4), 0, Math.PI * 2); ctx.fill(); }
        ctx.shadowBlur = 0;
        if (this.shield) { ctx.strokeStyle = `rgba(165,243,252,${0.5 + 0.3 * Math.sin(t * 6)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(ex, ey - 6, ek * 1.0, ek * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); }
        break;
      }
      case 'fighter': this.drawMesh(ctx, FIGHTER, [e.x, e.y, e.z], [0.15, Math.sin(e.phase) * 0.3, Math.sin(e.phase * 1.3) * 0.4], 0.62, e.col, { flash: e.flash > 0 }); break;
      case 'diver': this.drawMesh(ctx, DIVER, [e.x, e.y, e.z], [0, 0, t * 6], 0.7, e.col, { flash: e.flash > 0, glow: '#fb923c' }); break;
      case 'rock': this.drawMesh(ctx, this.astMeshes[e.mesh], [e.x, e.y, e.z], [e.rx, e.ry, 0], e.size, e.col, { flash: e.flash > 0 }); break;
      case 'mine': {
        this.drawMesh(ctx, MINE, [e.x, e.y, e.z], [t * 2, e.ry, 0], 1.1, e.col, { flash: e.flash > 0 || Math.sin(t * 10) > 0.6, glow: '#f87171' });
        break;
      }
      case 'turret': this.drawMesh(ctx, MINE, [e.x, e.y, e.z], [0, t, 0.785], 1.3, e.col, { flash: e.flash > 0, glow: '#60a5fa' }); break;
      case 'boss': {
        this.drawMesh(ctx, MOTHER, [e.x, e.y, e.z], [0.25, e.ry, 0], 1.6, e.hp < e.max / 2 ? '#fb7185' : '#94a3b8', { flash: e.flash > 0, glow: '#f43f5e' });
        // ring of lights
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2 + e.ry, [lx, ly, lk] = this.proj(e.x + Math.cos(a) * 3.3, e.y - 0.1, e.z + Math.sin(a) * 3.3 * 0.4);
          if (lk < 0) continue;
          ctx.fillStyle = (i + Math.floor(t * 8)) % 3 ? '#fde047' : '#f43f5e'; ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, lk * 0.08), 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
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
        ctx.strokeStyle = '#fbbf24'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 14; ctx.lineWidth = Math.max(1.5, k * 0.12);
        ctx.beginPath(); ctx.ellipse(sx, sy, k * 0.9, k * 0.9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        break;
      }
      case 'pickup': {
        const col = { twin: '#38bdf8', shield: '#a5f3fc', bomb: '#f472b6' }[e.type];
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 3);
        roundRect(ctx, -k * 0.35, -k * 0.35, k * 0.7, k * 0.7, k * 0.12); ctx.fill(); ctx.restore(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#0f172a'; ctx.font = `900 ${Math.max(6, k * 0.4)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText({ twin: 'T', shield: 'S', bomb: 'B' }[e.type], sx, sy + 1);
        break;
      }
      case 'bolt': {
        if (e.wait > 0) return;
        ctx.fillStyle = '#f472b6'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, k * 0.14), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        break;
      }
      case 'shot': {
        const [bx, by] = this.proj(e.x, e.y, e.z + 2.5);
        ctx.strokeStyle = this.twin > 0 ? '#fde047' : '#4ade80'; ctx.lineWidth = Math.max(1, k * 0.05); ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke(); ctx.shadowBlur = 0;
        break;
      }
    }
  }

  drawHud(ctx) {
    const s = this.s;
    ctx.fillStyle = 'rgba(3,5,20,.72)'; ctx.fillRect(0, 0, W, 44);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ RING RUN · ${this.rings} rings · ${Math.ceil(s.bonusLeft)}s`);
    else if (this.boss) progressBar(ctx, 14, 12, W - 28, 20, this.boss.hp / this.boss.max, '#f43f5e', `⚠️ MOTHERSHIP ${Math.ceil(this.boss.hp / this.boss.max * 100)}%`);
    else progressBar(ctx, 14, 12, W - 28, 20, clamp(this.sectorT / this.sectorLen, 0, 1), this.theme, this.sectorT >= this.sectorLen && this.bossLevel ? 'Mothership incoming…' : `Sector ${this.level} · ${this.kills} kills`);
    // bombs button + status
    if (!this.bonus) {
      ctx.save();
      ctx.globalAlpha = this.bombs ? 0.9 : 0.35;
      ctx.fillStyle = '#831843'; ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W - 44, H - 60, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`💣${this.bombs}`, W - 44, H - 60);
      ctx.restore();
      ctx.font = '700 12px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#a5f3fc';
      const tags = [this.twin > 0 ? `⚡ Twin ${Math.ceil(this.twin)}s` : '', this.shield ? '🛡️ Shield' : ''].filter(Boolean).join('   ');
      ctx.fillText(tags, 14, H - 56);
    }
    ctx.textAlign = 'center'; ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.45)';
    if (s.state === 'playing' && this.sectorT < 6) ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Drag to fly · you fire automatically · 💣 button' : 'Arrows / mouse to fly · Space / click to fire · B bomb', W / 2, H - 14);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.fillText('★ GOLDEN FIGHTER', W / 2, 60); }
  }
}

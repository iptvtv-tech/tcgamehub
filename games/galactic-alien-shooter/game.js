// ─────────────────────────────────────────────────────────────
//  GALACTIC ALIEN SHOOTER — formation space shooter (v2)
//  An alien fleet flies in, lines up, then peels off to dive at you.
//
//  ENEMY SHIPS (each has its own weapon)
//   Scout    small arrowhead  · aimed pellets
//   Gunship  wide swept wing  · 3-way spread
//   Bomber   heavy hex hull   · bombs that burst into shrapnel (shoot them!)
//   Lancer   thin needle      · stops, charges, fires a laser line
//   Carrier  saucer           · abduction beam (steals your ship) + homing mines
//   Dreadnought (boss, levels 9, 19, 29…) · spreads, twin lasers, launches scouts
//
//  YOUR WEAPONS (capsules dropped by destroyed ships, power 1 → 3)
//   B Blaster  rapid bolts, spreads wider with power
//   L Laser    hitscan beam — RARE (one red carrier every 5 levels), lasts 7 s
//   R Rockets  homing rockets with splash damage + a light cannon, lasts 10 s
//   S Shield   soaks one hit        1UP  very rare drop (and at 100k / 300k / 600k)
//
//  Every 5th level: ★ STAR RUN bonus (can't be hit, 15 s, hit all 40 = PERFECT)
//  Golden Starfighter: Legends only (see assets/js/legends.js)
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'galactic-alien-shooter';

const W = 480, H = 720;
const PY = H - 74;                 // player row
const HUD_H = 44;
const SHIP_R = 14, TWIN = 15;      // hit radius, half-gap of the twin fighter
const YMIN = 330;                  // how high up the screen your ship can fly
const GRID_DX = 40, GRID_DY = 36, GRID_TOP = 96;
const TAU = Math.PI * 2;

const TYPES = {
  scout:   { r: 14, hp: 1, form: 10, dive: 20, color: '#a3e635', drop: 0.01 },
  gunship: { r: 16, hp: 1, form: 16, dive: 32, color: '#fb923c', drop: 0.015 },
  bomber:  { r: 17, hp: 2, form: 24, dive: 50, color: '#c084fc', drop: 0.04 },
  lancer:  { r: 14, hp: 1, form: 20, dive: 45, color: '#f472b6', drop: 0.025 },
  carrier: { r: 20, hp: 3, form: 30, dive: 90, color: '#22d3ee', drop: 0.07 },
  shard:   { r: 9,  hp: 1, form: 12, dive: 12, color: '#bef264', drop: 0 },
};

const WEAPONS = {
  blaster: { name: 'BLASTER', color: '#38bdf8', letter: 'B' },
  laser:   { name: 'LASER',   color: '#f43f5e', letter: 'L' },
  rockets: { name: 'ROCKETS', color: '#fb923c', letter: 'R' },
};
const PICKUPS = {
  ...WEAPONS,
  shield: { name: 'SHIELD', color: '#60a5fa', letter: 'S' },
  life:   { name: '1UP',    color: '#4ade80', letter: '1UP' },
};

const BEAM = { grow: 0.5, hold: 1.9, shrink: 0.5 };
const LANCE = { charge: 0.75, fire: 0.4 };
const LIFE_AT = [100000, 300000, 600000];
const WEAPON_TIME = { laser: 7, rockets: 10 };   // seconds before a special weapon runs out
const MAX_LIVES = 5;

const isBoss = (level) => level % 10 === 9;

// Four different bosses, one after another (levels 9, 19, 29, 39). After that they come round again, tougher.
const BOSSES = [
  { kind: 'dreadnought', name: 'DREADNOUGHT', hue: 345, hp: 100, color: '#fb923c',
    attacks: ['fan', 'twin', 'launch', 'aimed', 'fan', 'twin'],
    hint: 'Watch for the warning lines — its twin lasers fire straight down.' },
  { kind: 'hive', name: 'HIVE MOTHER', hue: 95, hp: 125, color: '#a3e635',
    attacks: ['spiral', 'swarm', 'mines', 'ring', 'spiral', 'aimed'],
    hint: 'Spinning bullet spirals and a swarm of splitters. Keep moving!' },
  { kind: 'warden', name: 'IRON WARDEN', hue: 215, hp: 150, color: '#60a5fa',
    attacks: ['lanes', 'missiles', 'carpet', 'fan', 'lanes', 'missiles'],
    hint: 'Laser gates, homing missiles and carpet bombs. Find the gap!' },
  { kind: 'eclipse', name: 'ECLIPSE', hue: 300, hp: 175, color: '#f472b6',
    attacks: ['sweep', 'ring', 'missiles', 'spiral', 'lanes', 'swarm'],
    hint: 'Its giant laser SWEEPS across the screen. Everything at once — good luck!' },
];
function bossFor(level) {
  const tier = Math.floor(level / 10) + 1;
  const B = BOSSES[(tier - 1) % BOSSES.length];
  const round = Math.floor((tier - 1) / BOSSES.length);
  return { ...B, round, title: round ? `${B.name} Mk ${round + 1}` : `the ${B.name}` };
}

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 1.6,
  comboStep: 4,
  maxMultiplier: 6,
  bonusTime: 15,
  // its own tune: E-minor space march, rising arpeggio, driving octave bass (not the Astro Blaster loop)
  music: { bpm: 150, style: 'cosmic', lead: 'triangle', arp: [0, 1, 2, 3, 2, 1, 4, 3], oct: [12, 12, 12, 12, 12, 12, 12, 12], bass: 'drive' },
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * (isBoss(level) ? 300 : 120)),
  levelInfo(level, bonus) {
    if (bonus) return '★ STAR RUN! Bonus round — you can\'t be hit. Shoot all 40 for a PERFECT ✨';
    if (isBoss(level)) { const B = bossFor(level); return `☠️ BOSS: ${B.title}! ${B.hint}`; }
    const notes = {
      1: 'Fly anywhere in the lower half: mouse / arrows. Hold SPACE or the mouse button to fire. Capsules: B blaster · R rockets · L laser (rare!) — rockets & laser run out',
      2: 'Scouts shoot back now! 🔴 A red-glowing carrier holds the rare LASER — shoot it down and catch the L!',
      3: '🛸 Carriers fire an ABDUCTION BEAM! Lose a ship? Shoot that carrier as it dives to win it back as a TWIN FIGHTER. The fleet fires from formation now too.',
      4: 'Gunships fire 3-way spreads · Bombers drop bombs that burst — shoot the bombs!',
      6: '⚡ LANCERS charge a laser — see the warning line? Get out of the way! The fleet starts firing from formation too.',
      7: '💥 Glowing scouts SPLIT into three mid-dive!',
      8: 'Carriers dive with escorts and drop homing mines. Down the whole squad for a bonus!',
      11: 'The whole fleet fires from formation now — and faster. Good luck, pilot!',
    };
    return notes[level] || 'Clear the whole fleet · faster!';
  },
  create: (shell) => new AlienShooter(shell),
});

// ── Path helpers ─────────────────────────────────────────────
function loop(cx, cy, r, a0, turns, dir, n = 16) {
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + dir * turns * TAU * (i / n);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// Entry paths (s = -1 from the left, +1 from the right). Each ends near the formation; the ship then homes in on its slot.
const ENTRY = [
  (s) => [[W / 2 + s * 40, -30], [W / 2 + s * 80, 140], [W / 2 + s * 120, 300],
    ...loop(W / 2 + s * 40, 300, 80, s > 0 ? 0 : Math.PI, 1, s), [W / 2 + s * 60, 230]],
  (s) => [[s > 0 ? W + 30 : -30, 560], [W / 2 + s * 130, 500], [W / 2 + s * 40, 450],
    ...loop(W / 2 - s * 20, 390, 60, Math.PI / 2, 1, -s, 14), [W / 2, 300]],
];

// Star Run fly-through paths
const RUN = [
  (s) => [[W / 2 + s * 30, -30], [W / 2 + s * 70, 150], [W / 2 + s * 100, 300],
    ...loop(W / 2 + s * 20, 300, 80, s > 0 ? 0 : Math.PI, 1, s), [W / 2 - s * 120, 200], [W / 2 - s * (W / 2 + 60), 120]],
  (s) => [[s > 0 ? W + 30 : -30, 460], [W / 2 + s * 150, 380], [W / 2 + s * 60, 290], [W / 2 - s * 40, 230],
    [W / 2 - s * 140, 180], [W / 2 - s * 190, 250], [W / 2 - s * 120, 330], [W / 2, 340], [W / 2 + s * 150, 250], [s > 0 ? W + 40 : -40, 90]],
  (s) => [[W / 2 + s * 200, -30], [W / 2 + s * 60, 110], [W / 2 + s * 170, 210], [W / 2 + s * 50, 310], [W / 2 + s * 160, 410],
    [W / 2 - s * 40, 470], [W / 2 - s * 180, 380], [-s * 60 + (s > 0 ? 0 : W), 250]],
  (s) => [[W / 2, -30], [W / 2, 160], ...loop(W / 2 - s * 70, 250, 70, s > 0 ? 0 : Math.PI, 1, -s),
    ...loop(W / 2 + s * 70, 250, 70, s > 0 ? Math.PI : 0, 1, s), [W / 2, 160], [W / 2 + s * 30, -40]],
  (s) => [[s > 0 ? W + 30 : -30, 120], [W / 2 + s * 120, 170], ...loop(W / 2, 260, 110, s > 0 ? -Math.PI / 4 : Math.PI + Math.PI / 4, 1.1, s, 20),
    [W / 2 - s * 160, 380], [s > 0 ? -40 : W + 40, 470]],
];

function formationFor(level) {
  const list = [];
  const carriers = level <= 2 ? [4, 5] : [3, 4, 5, 6];
  for (const c of carriers) list.push({ type: 'carrier', row: 0, col: c });
  for (let c = 1; c <= 8; c++) list.push({ type: 'gunship', row: 1, col: c });
  if (level >= 4) {
    for (let c = 1; c <= 8; c++) list.push({ type: level >= 6 && c % 2 === 0 ? 'lancer' : 'bomber', row: 2, col: c });
  } else if (level >= 2) {
    for (let c = 1; c <= 8; c++) list.push({ type: 'gunship', row: 2, col: c });
  }
  const scoutRows = level <= 2 ? [3] : [3, 4];
  for (const r of scoutRows) for (let c = 0; c <= 9; c++) list.push({ type: 'scout', row: r, col: c });
  return list;
}

class AlienShooter {
  constructor(s) {
    this.s = s; this.t = 0; this.idN = 0;
    // Cosmetic starfield (Math.random is fine for scenery)
    const pal = ['#fff', '#fde047', '#f472b6', '#22d3ee', '#a78bfa', '#4ade80', '#fb923c'];
    this.stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: Math.random(), c: pal[(Math.random() * pal.length) | 0], ph: Math.random() * TAU,
    }));
    this.nebulas = Array.from({ length: 4 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, r: 170 + Math.random() * 150, hue: [265, 200, 320, 180][i] }));
    this.meteor = null;
    this.ship = { x: W / 2, tx: W / 2, tilt: 0 };
    this.reset();
    this.startLevel(1, false);
  }

  get power() { return this.pw[this.weapon]; }

  // Golden ship: Legends only (unlocked via the Hall of Legends; the menu has an ON/OFF switch).
  get golden() { return this.s.gold; }

  reset() {
    this.ship.x = this.ship.tx = W / 2; this.ship.y = this.ship.ty = PY;
    this.dual = false; this.invuln = 0; this.dead = false;
    this.capture = null; this.rescue = null; this.shipHidden = false;
    this.weapon = 'blaster'; this.pw = { blaster: 1, laser: 1, rockets: 1 }; this.weaponT = 0; this.shield = false;
    this.laserBlocks = {};
    this.lifeIdx = 0; this.lifeDropped = false; this.sinceDrop = 0;
    this.runShots = 0; this.runHits = 0;
  }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.speedK = s.speed(0.065, 2.2, level);
    this.aliens = []; this.bullets = []; this.enemyShots = []; this.pickups = [];
    this.waveQ = []; this.formT = 0; this.arrived = false;
    this.diveT = 2.5; this.formFireT = 3; this.fireT = 0; this.rocketT = 0; this.laserT = 0; this.laserVis = [];
    this.hasFired = this.hasFired && level > 1;
    this.shots = 0; this.hits = 0;
    this.capture = null; this.rescue = null; this.shipHidden = false;
    this.beamCarrier = null;
    this.boss = null; this.bossDeadT = 0; this.timers = []; this.lanes = [];
    this.bonusHits = 0; this.bonusTotal = 0; this.perfectDone = false;

    if (bonus) {
      // 5 groups of 8, each as two mirrored streams
      const types = ['scout', 'gunship', 'lancer', 'carrier', 'bomber'];
      this.bonusTotal = 40;
      for (let g = 0; g < 5; g++) {
        const members = [];
        for (let k = 0; k < 8; k++) {
          const side = k % 2 ? 1 : -1;
          const a = this.makeAlien(types[g], -1, -1);
          a.hp = a.maxHp = 1;
          members.push({ a, path: RUN[g](side), delay: Math.floor(k / 2) * 0.17 });
        }
        this.waveQ.push({ t: 0.4 + g * 2.1, members });
      }
      return;
    }

    if (isBoss(level)) {
      const tier = Math.floor(level / 10) + 1;
      const B = bossFor(level);
      const hp = Math.round(B.hp * (1 + B.round * 0.5) + (tier - 1) * 15);
      this.boss = { ...B, x: W / 2, y: -120, hp, maxHp: hp, tier, t: 0, enter: true, atkT: 2.2, atk: 0, flash: 0, hold: 0,
        lasers: null, spiral: null, moveT: 0, tx: W / 2 };
      this.lanes = [];
      this.arrived = true;
      return;
    }

    const slots = formationFor(level);
    // one carrier per 5-level block (from level 2) carries the rare LASER
    const block = Math.floor((level - 1) / 5);
    const laserHere = level >= 2 && !this.laserBlocks[block];
    const chunks = [];
    for (let i = 0; i < slots.length; i += 8) chunks.push(slots.slice(i, i + 8));
    const gap = 1.9 / Math.sqrt(this.speedK);
    chunks.forEach((chunk, i) => {
      const pathFn = ENTRY[i % 2];
      const side = Math.floor(i / 2) % 2 ? 1 : -1;
      const members = chunk.map((sl, k) => {
        const a = this.makeAlien(sl.type, sl.row, sl.col);
        a.split = level >= 7 && sl.type === 'scout' && s.rng.chance(Math.min(0.45, 0.2 + (level - 7) * 0.04));
        if (laserHere && sl.type === 'carrier' && sl.col === 4) a.laserCarrier = true;
        return { a, path: pathFn(k % 2 && i % 2 ? -side : side), delay: k * 0.13 };
      });
      this.waveQ.push({ t: 0.5 + i * gap, members });
    });
  }

  makeAlien(type, row, col) {
    const T = TYPES[type];
    return {
      id: this.idN++, type, row, col, r: T.r, hp: T.hp, maxHp: T.hp, x: -100, y: -100,
      state: 'wait', path: null, pi: 0, heading: Math.PI / 2, flash: 0, dead: false,
      captive: false, split: false, shotsAt: [], diveTime: 0,
    };
  }

  // ── Formation geometry ─────────────────────────────────────
  slot(a) {
    if (a.col < 0) return { x: this.boss ? this.boss.x : W / 2, y: -40 };
    const breathe = this.arrived ? 1 + Math.sin(this.formT * 1.7) * 0.07 : 1;
    const sway = this.arrived ? 0 : Math.sin(this.t * 0.9) * 26;
    return {
      x: W / 2 + (a.col - 4.5) * GRID_DX * breathe + sway,
      y: GRID_TOP + a.row * GRID_DY * (0.6 + breathe * 0.4),
    };
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x, y) {
    if (a === 'press') this.drag = { px: x, py: y, sx: this.ship.tx, sy: this.ship.ty };
    if (a === 'release') this.drag = null;
  }
  onPointerMove(x, y, down) {
    if (down && this.drag) {
      this.ship.tx = this.drag.sx + (x - this.drag.px) * 1.3;
      this.ship.ty = this.drag.sy + (y - this.drag.py) * 1.3;
    } else if (!down) { this.ship.tx = x; this.ship.ty = y; }
  }

  idle(dt) { this.t += dt; this.cosmetic(dt); }

  cosmetic(dt) {
    if (!this.meteor && Math.random() < dt * 0.15) this.meteor = { x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 300, vy: 520, life: 1.4 };
    if (this.meteor) { const m = this.meteor; m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt; if (m.life <= 0) this.meteor = null; }
  }

  shipXs() { return this.dual ? [this.ship.x - TWIN, this.ship.x + TWIN] : [this.ship.x]; }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s, sh = this.ship, L = this.level;
    this.t += dt; this.formT += dt;
    this.cosmetic(dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.laserVis = [];
    this.tickTimers(dt);
    if (this.weapon !== 'blaster') {
      this.weaponT -= dt;
      if (this.weaponT <= 0) {
        const info = WEAPONS[this.weapon];
        this.pw[this.weapon] = 1; this.weapon = 'blaster'; this.weaponT = 0;
        s.fx.text(this.ship.x, this.ship.y - 50, `${info.name} OFFLINE`, { color: info.color, size: 18 });
        s.sound.tone({ freq: 700, to: 150, dur: 0.35, type: 'square', vol: 0.05 });
      }
    }

    // Player
    if (!this.capture) {
      const kx = (s.input.isDown('right') ? 1 : 0) - (s.input.isDown('left') ? 1 : 0);
      const ky = (s.input.isDown('down') ? 1 : 0) - (s.input.isDown('up') ? 1 : 0);
      if (kx) { sh.tx = sh.x + kx * 1600 * dt; this.drag = null; }
      if (ky) { sh.ty = sh.y + ky * 1100 * dt; this.drag = null; }
      const edge = this.dual ? 24 + TWIN : 24;
      sh.tx = clamp(sh.tx, edge, W - edge);
      sh.ty = clamp(sh.ty, YMIN, PY);
      const px = sh.x;
      sh.x += (sh.tx - sh.x) * Math.min(1, dt * 16);
      sh.y += (sh.ty - sh.y) * Math.min(1, dt * 14);
      sh.vx = (sh.x - px) / dt;
      sh.tilt = clamp(sh.vx / 1100, -0.35, 0.35);

      const trigger = s.input.isDown('action') || s.input.pointer.down;
      if (trigger && !this.shipHidden) { this.hasFired = true; this.fire(dt); }
      else { this.fireT -= dt; this.rocketT -= dt; this.laserT = 0; }
    }
    if (this.updateBullets(dt)) return;

    // Release entry waves
    for (const w of this.waveQ) {
      if (w.done) continue;
      w.t -= dt;
      if (w.t <= 0) {
        w.done = true;
        for (const m of w.members) {
          const a = m.a;
          a.path = m.path; a.pi = 1; a.x = m.path[0][0]; a.y = m.path[0][1]; a.delay = m.delay;
          a.state = 'wait';
          this.aliens.push(a);
        }
      }
    }

    // Alien ships
    const entrySpeed = 300 * Math.min(1.5, Math.sqrt(this.speedK));
    const diveSpeed = 200 * this.speedK;
    for (const a of this.aliens) {
      if (a.dead) continue;
      a.flash = Math.max(0, a.flash - dt * 6);
      const ox = a.x, oy = a.y;
      if (a.state === 'wait') { a.delay -= dt; if (a.delay <= 0) a.state = this.bonus ? 'fly' : 'enter'; else continue; }

      if (a.state === 'enter' && this.follow(a, dt, entrySpeed)) a.state = 'home';
      else if (a.state === 'fly' && this.follow(a, dt, 320)) { a.dead = true; a.escaped = true; continue; }
      else if (a.state === 'home' || a.state === 'return') {
        const p = this.slot(a), dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
        const v = (a.state === 'home' ? entrySpeed : diveSpeed * 0.9) * dt;
        if (d <= v + 0.5) {
          a.x = p.x; a.y = p.y;
          if (a.col < 0) { a.dead = true; a.escaped = true; continue; }   // boss-launched scouts go home to the boss
          a.state = 'form';
        } else { a.x += dx / d * v; a.y += dy / d * v; }
      } else if (a.state === 'form') {
        const p = this.slot(a); a.x = p.x; a.y = p.y;
      } else if (a.state === 'dive') {
        a.diveTime += dt;
        if (this.follow(a, dt, diveSpeed * (a.type === 'shard' ? 1.3 : a.lanceRun ? 1.9 : 1))) {
          if (a.type === 'shard') { a.dead = true; a.escaped = true; continue; }
          if (a.beamDive) { a.state = 'beam'; a.beamT = 0; this.beamCarrier = a; }
          else if (a.lancePath) { a.state = 'lance'; a.lanceT = 0; a.lancePath = false; }
          else { a.state = 'return'; a.lanceRun = false; a.x = this.slot(a).x; a.y = -30; }
        }
        while (a.shotsAt.length && a.diveTime >= a.shotsAt[0]) {
          a.shotsAt.shift();
          if (a.y < this.ship.y - 100 && a.y > 0) this.enemyFire(a);
        }
        if (a.split && a.y > H * 0.36) this.splitAlien(a);
      } else if (a.state === 'beam') {
        this.updateBeam(a, dt);
      } else if (a.state === 'lance') {
        if (this.updateLance(a, dt)) return;
      }

      // heading for drawing
      const mx = a.x - ox, my = a.y - oy;
      const target = a.state === 'form' || a.state === 'beam' || a.state === 'lance' ? Math.PI / 2 : (mx * mx + my * my > 0.01 ? Math.atan2(my, mx) : a.heading);
      let d = target - a.heading; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      a.heading += d * Math.min(1, dt * 12);

      // collisions with the player (diving ships only; bonus rounds are safe)
      if (!this.bonus && (a.state === 'dive' || a.state === 'return') && !this.invuln && !this.capture && !this.shipHidden) {
        const hitX = this.touchesShip(a.x, a.y, a.r * 0.9);
        if (hitX !== null) { this.killAlien(a, false); if (this.crash(hitX)) return; }
      }
    }
    this.aliens = this.aliens.filter((a) => !a.dead);

    // Boss
    if (this.boss && this.updateBoss(dt)) return;

    // Formation arrival + dives + formation fire
    if (!this.bonus) {
      const alive = this.aliens.filter((a) => !a.dead);
      if (!this.arrived && this.waveQ.every((w) => w.done) && alive.every((a) => a.state !== 'wait' && a.state !== 'enter' && a.state !== 'home')) {
        this.arrived = true; this.formT = 0;
      }
      // from level 3 the fleet starts diving while the rest are still flying in
      if ((this.arrived || (L >= 3 && this.formT > 3)) && !this.boss) {
        this.diveT -= dt;
        if (this.diveT <= 0) {
          let gap = L === 1 ? 3.6 : Math.max(0.45, 2.4 / this.speedK - L * 0.04);
          if (alive.length <= 6) gap *= 0.55;
          this.diveT = gap * s.rng.range(0.7, 1.3);
          this.startDive();
        }
        if (L >= 3) {
          this.formFireT -= dt;
          if (this.formFireT <= 0) {
            this.formFireT = Math.max(0.45, (L >= 11 ? 1.8 : L >= 6 ? 2.6 : 3.6) / this.speedK) * s.rng.range(0.7, 1.3);
            const inForm = alive.filter((a) => a.state === 'form' && !a.captive);
            if (inForm.length) this.pellet(s.rng.pick(inForm), 0, 0.85);
            if (inForm.length > 1 && L >= 8) this.pellet(s.rng.pick(inForm), 0, 0.85);
          }
        }
      }
      if (this.boss) {
        if (this.bossDeadT > 0) { this.bossDeadT -= dt; if (this.bossDeadT <= 0) { this.levelDone(); return; } }
      } else if (this.waveQ.every((w) => w.done) && alive.length === 0 && !this.capture && !this.rescue) { this.levelDone(); return; }
    } else if (this.waveQ.every((w) => w.done) && this.aliens.every((a) => a.dead)) {
      // Star Run: finish early when every ship is shot or gone
      this.awardPerfect();
      s.completeLevel();
      return;
    }

    if (this.updateEnemyShots(dt)) return;
    this.updatePickups(dt);

    // Abduction animation (ship pulled up into the beam)
    if (this.capture) {
      const c = this.capture; c.t += dt;
      const k = Math.min(1, c.t / 1.3);
      c.x = c.sx + (c.q.x - c.sx) * k; c.y = c.sy + (c.q.y + 32 - c.sy) * k; c.spin += dt * 9;
      if (c.q.dead) { this.capture = null; this.invuln = 1.5; return; }
      if (c.t >= 1.5) {
        c.q.captive = true; c.q.state = 'return'; c.q.beamDive = false;
        this.beamCarrier = null; this.capture = null; this.shipHidden = true;
        s.fx.text(W / 2, H * 0.45, 'SHIP ABDUCTED!', { color: '#f43f5e', size: 28, life: 1.4 });
        if (s.lives <= 1) this.dead = true;
        s.hurt();
        return;
      }
    }

    // Rescued ship floating down to dock
    if (this.rescue) {
      const r = this.rescue; r.spin += dt * 10;
      const tx = sh.x + TWIN, ty = sh.y;
      const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy), v = 330 * dt;
      if (d <= v) {
        this.rescue = null; this.dual = true;
        sh.x = clamp(sh.x - TWIN, 24 + TWIN, W - 24 - TWIN); sh.tx = sh.x;
        s.sound.play('powerup'); s.unlock('rescue');
        s.fx.text(sh.x, sh.y - 50, 'TWIN FIGHTER!', { color: '#22d3ee', size: 26, life: 1.3 });
        s.fx.ring(sh.x, sh.y, { color: '#22d3ee', radius: 70, width: 5 });
        s.fx.burst(sh.x, sh.y, { colors: ['#22d3ee', '#fff', '#a78bfa'], count: 40, speed: 260 });
      } else { r.x += dx / d * v; r.y += dy / d * v; }
    }

    // Extra lives: only at 100k, 300k and 600k
    if (this.lifeIdx < LIFE_AT.length && s.score >= LIFE_AT[this.lifeIdx]) {
      this.lifeIdx++;
      this.gainLife();
    }

    // Engine exhaust
    if (!this.shipHidden && !this.capture && Math.random() < 0.7) {
      for (const x of this.shipXs()) s.fx.burst(x + (Math.random() - 0.5) * 4, sh.y + 17, { colors: this.golden ? ['#fde047', '#fbbf24', '#fff'] : ['#22d3ee', '#a78bfa', '#f472b6'], count: 1, speed: 80, life: 0.3, size: 2.5, angle: Math.PI / 2, spread: 0.4 });
    }
  }

  gainLife() {
    const s = this.s;
    s.sound.play('life');
    if (s.lives < MAX_LIVES) {
      s.lives++; s.updateHud?.();
      s.fx.text(W / 2, H * 0.36, '1UP!', { color: '#4ade80', size: 34, life: 1.2 });
    } else {
      s.award(1000 * this.level, W / 2, H * 0.36, { color: '#4ade80', size: 24 });
    }
  }

  // ── Player weapons ─────────────────────────────────────────
  fire(dt) {
    const s = this.s, P = this.power, xs = this.shipXs();
    this.fireT -= dt; this.rocketT -= dt;
    if (this.weapon === 'laser') {
      this.laserTargets(xs);
      this.laserT -= dt;
      if (this.laserT <= 0) {
        this.laserT = [0.2, 0.16, 0.13][P - 1];
        this.laserTick();
      }
      return;
    }
    const bolts = this.bullets.filter((b) => b.kind === 'bolt').length;
    const cap = xs.length * (this.weapon === 'blaster' ? [3, 6, 9][P - 1] : 3);
    if (this.fireT <= 0 && bolts < cap) {
      const bolt = (x, vx = 0) => this.bullets.push({ kind: 'bolt', x, y: this.ship.y - 20, vx, vy: -700, r: 4, dmg: 1 });
      if (this.weapon === 'blaster') {
        this.fireT = [0.2, 0.18, 0.17][P - 1];
        for (const x of xs) {
          if (P === 1) bolt(x);
          else if (P === 2) { bolt(x - 6); bolt(x + 6); }
          else { bolt(x); bolt(x - 5, -170); bolt(x + 5, 170); }
        }
        const n = xs.length * P; this.shots += n; this.runShots += n;
        s.sound.tone({ freq: 1800, to: 700, dur: 0.05, type: 'square', vol: 0.03 });
      } else {
        this.fireT = 0.28;
        for (const x of xs) bolt(x);
        this.shots += xs.length; this.runShots += xs.length;
        s.sound.tone({ freq: 1500, to: 800, dur: 0.04, type: 'square', vol: 0.02 });
      }
    }
    if (this.weapon === 'rockets' && this.rocketT <= 0) {
      this.rocketT = [0.7, 0.58, 0.5][P - 1];
      const per = [1, 2, 3][P - 1];
      for (const x of xs) {
        for (let i = 0; i < per; i++) {
          const side = per === 1 ? 0 : per === 2 ? (i ? 1 : -1) : i - 1;
          const ang = -Math.PI / 2 + side * 0.55;
          this.bullets.push({ kind: 'rocket', x: x + side * 10, y: this.ship.y - 10, ang, sp: 240, r: 6, dmg: 2, life: 2.6 });
        }
      }
      const n = xs.length * per; this.shots += n; this.runShots += n;
      s.sound.noise({ dur: 0.18, vol: 0.06, freq: 900, to: 300 });
    }
  }

  /** Everything the laser beam touches this frame (also drives the drawing). */
  laserTargets(xs) {
    const P = this.power, w = [5, 8, 12][P - 1], maxHits = [1, 2, 99][P - 1], sy = this.ship.y;
    this.laserHits = [];
    for (const x of xs) {
      const list = this.aliens.filter((a) => !a.dead && a.state !== 'wait' && a.y > HUD_H && a.y < sy - 16 && Math.abs(a.x - x) < a.r * 0.8 + w);
      list.sort((p, q) => q.y - p.y);
      const hits = list.slice(0, maxHits);
      let top = HUD_H;
      if (list.length > maxHits) top = hits[hits.length - 1].y;
      const b = this.boss;
      if (b && !b.enter && b.hp > 0 && Math.abs(b.x - x) < 76 && top < b.y + 26) { top = b.y + 26; this.laserHits.push({ boss: true }); }
      for (const a of hits) if (a.y > top - 1) this.laserHits.push({ a });
      for (const e of this.enemyShots) if (e.shootable && !e.gone && Math.abs(e.x - x) < w + e.r && e.y > top && e.y < sy) this.laserHits.push({ e });
      this.laserVis.push({ x, top, w, y0: sy - 20 });
    }
  }

  laserTick() {
    const s = this.s;
    let hit = false;
    for (const h of this.laserHits) {
      if (h.boss) { this.hitBoss(1); hit = true; }
      else if (h.a && !h.a.dead) { this.hitAlien(h.a, 1); hit = true; }
      else if (h.e && !h.e.gone) this.shootProjectile(h.e);
    }
    this.shots++; this.runShots++;
    if (hit) { this.hits++; this.runHits++; }
    s.sound.tone({ freq: 160 + this.power * 40, to: 120, dur: 0.09, type: 'sawtooth', vol: 0.025 });
  }

  /** Returns true if the game should stop updating this frame. */
  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.kind === 'rocket') {
        b.life -= dt;
        b.sp = Math.min(560, b.sp + 700 * dt);
        const tgt = this.rocketTarget(b);
        if (tgt) {
          const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let d = want - b.ang; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
          b.ang += clamp(d, -5 * dt, 5 * dt);
        }
        b.x += Math.cos(b.ang) * b.sp * dt; b.y += Math.sin(b.ang) * b.sp * dt;
        if (b.life <= 0) b.hit = true;
        if (Math.random() < 0.8) this.s.fx.burst(b.x, b.y, { colors: ['#fdba74', '#fef08a'], count: 1, speed: 40, life: 0.25, size: 2 });
      } else { b.x += b.vx * dt; b.y += b.vy * dt; }
      if (b.hit) continue;
      // vs enemy projectiles (bombs and mines can be shot down)
      for (const e of this.enemyShots) {
        if (!e.shootable || e.gone) continue;
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (b.r + e.r) ** 2) { b.hit = true; this.shootProjectile(e); if (b.kind === 'rocket') this.splash(b); break; }
      }
      if (b.hit) continue;
      // vs boss
      const bs = this.boss;
      if (bs && !bs.enter && bs.hp > 0 && ((b.x - bs.x) / 74) ** 2 + ((b.y - bs.y) / 30) ** 2 < 1) {
        b.hit = true; this.hits++; this.runHits++;
        this.hitBoss(b.dmg);
        if (b.kind === 'rocket') this.splash(b);
        continue;
      }
      // vs ships
      for (const a of this.aliens) {
        if (a.dead || a.state === 'wait') continue;
        if (a.captive && (b.x - a.x) ** 2 + (b.y - (a.y - 32)) ** 2 < 14 ** 2) { b.hit = true; this.shootCaptive(a); break; }
        if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 < (a.r + b.r) ** 2) {
          b.hit = true; this.hits++; this.runHits++;
          this.hitAlien(a, b.dmg);
          if (b.kind === 'rocket') this.splash(b, a);
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.hit && b.y > HUD_H - 30 && b.y < H + 20 && b.x > -20 && b.x < W + 20);
    return false;
  }

  rocketTarget(b) {
    if (b.target && !b.target.dead && b.target.state !== 'wait') return b.target;
    let best = null, bd = Infinity;
    for (const a of this.aliens) {
      if (a.dead || a.state === 'wait' || a.y > b.y - 10 || a.y < HUD_H) continue;
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 * 0.5;
      if (d < bd) { bd = d; best = a; }
    }
    if (!best && this.boss && !this.boss.enter && this.boss.hp > 0) return this.boss;
    b.target = best;
    return best;
  }

  splash(b, direct) {
    const s = this.s;
    s.fx.ring(b.x, b.y, { color: '#fb923c', radius: 46, life: 0.3, width: 3 });
    s.fx.burst(b.x, b.y, { colors: ['#fb923c', '#fde047', '#fff'], count: 14, speed: 180, life: 0.4 });
    s.sound.noise({ dur: 0.2, vol: 0.1, freq: 700, to: 120 });
    for (const a of this.aliens) {
      if (a === direct || a.dead || a.state === 'wait') continue;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (46 + a.r) ** 2) this.hitAlien(a, 1);
    }
  }

  // ── Movement helpers ───────────────────────────────────────
  follow(a, dt, speed) {
    let move = speed * dt;
    while (move > 0 && a.pi < a.path.length) {
      const [tx, ty] = a.path[a.pi];
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d <= move) { a.x = tx; a.y = ty; move -= d; a.pi++; }
      else { a.x += dx / d * move; a.y += dy / d * move; move = 0; }
    }
    return a.pi >= a.path.length;
  }

  /** Returns the x of the ship that was touched, or null. */
  touchesShip(x, y, r) {
    for (const sx of this.shipXs()) if ((x - sx) ** 2 + (y - this.ship.y) ** 2 < (r + SHIP_R) ** 2) return sx;
    return null;
  }

  // ── Dives ──────────────────────────────────────────────────
  divePath(a, px, offX = 0, offY = 0) {
    const r = this.s.rng;
    const sd = a.x < W / 2 ? -1 : 1;
    const pts = loop(a.x + sd * 26, a.y, 26, sd > 0 ? Math.PI : 0, 0.5, sd, 8);
    const aim = clamp(px + r.range(-40, 40), 30, W - 30);
    const wig = a.type === 'scout' ? 60 : 90;
    pts.push([(pts[pts.length - 1][0] + aim) / 2, H * 0.34]);
    pts.push([aim + sd * wig * 0.5, H * 0.55]);
    pts.push([aim - sd * wig * 0.4, H * 0.72]);
    pts.push([aim - sd * wig, PY + 10]);
    pts.push([aim - sd * wig * 1.6, H + 40]);
    return pts.map(([x, y]) => [x + offX, y + offY]);
  }

  startDive() {
    const s = this.s, L = this.level;
    const inForm = this.aliens.filter((a) => !a.dead && a.state === 'form');
    const diving = this.aliens.filter((a) => !a.dead && (a.state === 'dive' || a.state === 'beam' || a.state === 'lance')).length;
    const maxDivers = L === 1 ? 1 : Math.min(7, 1 + Math.ceil(L / 2));
    if (!inForm.length || diving >= maxDivers) return;

    // Carriers holding your ship love to dive — giving you the chance to rescue it
    const captiveQ = inForm.find((a) => a.captive);
    let a;
    if (captiveQ && s.rng.chance(0.5)) a = captiveQ;
    else {
      const carriers = inForm.filter((q) => q.type === 'carrier');
      if (L >= 3 && carriers.length && s.rng.chance(0.3)) a = s.rng.pick(carriers);
      else a = s.rng.pick(inForm);
    }
    const px = this.ship.x;
    const sd = a.x < W / 2 ? -1 : 1;
    const anyCaptive = this.aliens.some((q) => !q.dead && q.captive);
    const canBeam = L >= 3 && a.type === 'carrier' && !a.captive && !this.dual && !anyCaptive && !this.beamCarrier && !this.capture && !this.rescue && s.rng.chance(0.5);

    a.state = 'dive'; a.pi = 0; a.diveTime = 0; a.beamDive = canBeam; a.lancePath = false;
    if (canBeam) {
      a.path = [...loop(a.x + sd * 26, a.y, 26, sd > 0 ? Math.PI : 0, 0.5, sd, 8), [clamp(px, 40, W - 40), H * 0.3], [clamp(px, 40, W - 40), H * 0.5]];
      this.beamCarrier = a;
      return;
    }
    if (a.type === 'lancer' && L >= 6) {
      // Fly to a spot above the player, stop, charge, fire
      const aim = clamp(px + s.rng.range(-30, 30), 30, W - 30);
      a.path = [...loop(a.x + sd * 26, a.y, 26, sd > 0 ? Math.PI : 0, 0.5, sd, 8), [(a.x + aim) / 2, H * 0.3], [aim, H * s.rng.range(0.36, 0.46)]];
      a.lancePath = true; a.shotsAt = [];
      s.sound.tone({ freq: 900, to: 400, dur: 0.3, type: 'triangle', vol: 0.05 });
      return;
    }
    a.path = this.divePath(a, px);
    this.planShots(a);

    // Escorts (L8+): a carrier dives with up to two gunships
    if (a.type === 'carrier' && L >= 8) {
      const escorts = inForm.filter((e) => e.type === 'gunship' && e.row === 1 && Math.abs(e.col - a.col) <= 2 && e !== a)
        .sort((p, q) => Math.abs(p.col - a.col) - Math.abs(q.col - a.col)).slice(0, 2);
      const squad = { size: escorts.length + 1, killed: 0 };
      a.squad = squad;
      escorts.forEach((e, i) => {
        e.state = 'dive'; e.pi = 0; e.diveTime = 0; e.beamDive = false; e.lancePath = false; e.squad = squad;
        e.path = a.path.map(([x, y]) => [x + (i ? 28 : -28), y + 22]);
        e.x = a.x + (i ? 28 : -28); e.y = a.y + 22;
        this.planShots(e);
      });
    }
    s.sound.tone({ freq: 700, to: 250, dur: 0.35, type: 'triangle', vol: 0.05 });
  }

  /** When (seconds into its dive) a ship fires, depending on its class and the level. */
  planShots(a) {
    const L = this.level, r = this.s.rng;
    a.shotsAt = [];
    const armed = { scout: 2, shard: 99, gunship: 3, bomber: 3, carrier: 6, lancer: 99 }[a.type];
    if (L < armed) return;
    if (!r.chance(Math.min(1, 0.75 + (L - armed) * 0.08))) return;
    const n = a.type === 'bomber' ? (L >= 12 ? 2 : 1) : L >= 14 ? 3 : L >= 6 ? 2 : 1;
    for (let i = 0; i < n; i++) a.shotsAt.push(0.35 + i * 0.3 + r.range(0, 0.3));
  }

  shotSpeed() { return 290 * Math.min(1.5, Math.sqrt(this.speedK)); }

  pellet(a, spread = 0, k = 1) {
    const sh = this.ship, vy = this.shotSpeed() * k;
    const tt = Math.max(0.3, (sh.y - a.y) / vy);
    // from level 3, shots lead a moving target (more so on later levels)
    const lead = this.level >= 3 ? Math.min(0.9, 0.35 + this.level * 0.04) * this.s.rng.range(0.5, 1.1) : 0;
    const aimX = clamp(sh.x + (sh.vx || 0) * tt * lead, 20, W - 20);
    const vx = clamp((aimX - a.x) / tt, -170, 170);
    const ang = Math.atan2(vy, vx) + spread, sp = Math.hypot(vx, vy);
    this.enemyShots.push({ kind: 'pellet', x: a.x, y: a.y + 10, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 4 });
  }

  enemyFire(a) {
    const s = this.s;
    if (a.type === 'gunship') {
      for (const sp of [-0.3, 0, 0.3]) this.pellet(a, sp);
      s.sound.tone({ freq: 420, to: 900, dur: 0.1, type: 'sawtooth', vol: 0.045 });
    } else if (a.type === 'bomber') {
      this.enemyShots.push({ kind: 'bomb', x: a.x, y: a.y + 12, vx: 0, vy: 150 * Math.sqrt(this.speedK), r: 8, shootable: true, burstY: Math.max(a.y + 80, this.ship.y - s.rng.range(90, 170)), t: 0 });
      s.sound.tone({ freq: 200, to: 90, dur: 0.25, type: 'square', vol: 0.05 });
    } else if (a.type === 'carrier') {
      this.enemyShots.push({ kind: 'mine', x: a.x, y: a.y + 14, vx: 0, vy: 90, r: 8, shootable: true, life: 5, t: 0 });
      s.sound.tone({ freq: 300, to: 600, dur: 0.2, type: 'sine', vol: 0.05 });
    } else {
      this.pellet(a);
      s.sound.tone({ freq: 500, to: 1100, dur: 0.08, type: 'sawtooth', vol: 0.04 });
    }
  }

  /** Returns true if the game should stop updating this frame. */
  updateEnemyShots(dt) {
    const s = this.s, sh = this.ship;
    const add = [];
    for (const e of this.enemyShots) {
      if (e.gone) continue;
      e.t = (e.t || 0) + dt;
      if (e.kind === 'mine' || e.kind === 'missile') {
        e.life -= dt;
        const m = e.kind === 'missile';
        const want = Math.atan2(sh.y - e.y, sh.x - e.x), cur = Math.atan2(e.vy, e.vx);
        let d = want - cur; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
        const turn = m && e.t > 1.6 ? 0.3 : m ? 2.6 : 1.6;     // missiles stop steering after 1.6 s
        const na = cur + clamp(d, -turn * dt, turn * dt), sp = Math.min(m ? 250 : 150, Math.hypot(e.vx, e.vy) + (m ? 160 : 30) * dt);
        e.vx = Math.cos(na) * sp; e.vy = Math.sin(na) * sp;
        if (e.life <= 0 || e.y > H + 10) { e.gone = true; s.fx.burst(e.x, e.y, { colors: ['#67e8f9', '#fff'], count: 10, speed: 120, life: 0.3 }); continue; }
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.kind === 'bomb' && e.y >= e.burstY) {
        e.gone = true;
        s.sound.noise({ dur: 0.22, vol: 0.12, freq: 900, to: 150 });
        s.fx.burst(e.x, e.y, { colors: ['#e9d5ff', '#c084fc', '#fff'], count: 18, speed: 200, life: 0.35 });
        const n = 8, sp = 170 * Math.min(1.3, Math.sqrt(this.speedK));
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU + 0.2;
          add.push({ kind: 'shrap', x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 3 });
        }
        continue;
      }
      if (!this.invuln && !this.capture && !this.shipHidden) {
        const hitX = this.touchesShip(e.x, e.y, e.r * 0.8);
        if (hitX !== null) { e.gone = true; if (this.crash(hitX)) return true; }
      }
    }
    this.enemyShots = this.enemyShots.concat(add).filter((e) => !e.gone && e.y < H + 20 && e.y > -30 && e.x > -20 && e.x < W + 20);
    return false;
  }

  shootProjectile(e) {
    const s = this.s;
    e.gone = true;
    s.award((e.kind === 'bomb' ? 25 : 30) * this.level, e.x, e.y, { color: e.kind === 'mine' ? '#67e8f9' : '#e9d5ff', size: 14 });
    s.fx.burst(e.x, e.y, { colors: ['#fff', e.kind === 'mine' ? '#67e8f9' : '#c084fc'], count: 14, speed: 160, life: 0.35 });
    s.sound.play('coin');
  }

  splitAlien(a) {
    const s = this.s;
    a.split = false; a.dead = true;
    s.sound.tone({ freq: 400, to: 1600, dur: 0.18, type: 'square', vol: 0.06 });
    s.fx.ring(a.x, a.y, { color: '#bef264', radius: 36 });
    s.fx.text(a.x, a.y - 20, 'SPLIT!', { color: '#bef264', size: 18 });
    const trio = { size: 3, killed: 0 };
    for (const dx of [-1, 0, 1]) {
      const sh = this.makeAlien('shard', -1, -1);
      sh.x = a.x; sh.y = a.y; sh.state = 'dive'; sh.pi = 0; sh.trio = trio;
      const tx = clamp(this.ship.x + dx * 110, 20, W - 20);
      sh.path = [[a.x + dx * 60, a.y + 60], [tx, Math.max(a.y + 90, this.ship.y - 40)], [tx + dx * 40, H + 30]];
      this.aliens.push(sh);
    }
  }

  // ── Carrier abduction beam ─────────────────────────────────
  updateBeam(q, dt) {
    const s = this.s;
    q.beamT += dt;
    const total = BEAM.grow + BEAM.hold + BEAM.shrink;
    if (Math.floor(q.beamT * 8) !== Math.floor((q.beamT - dt) * 8)) s.sound.tone({ freq: 220 + (Math.floor(q.beamT * 8) % 4) * 60, dur: 0.12, type: 'sine', vol: 0.05 });
    const full = q.beamT > BEAM.grow && q.beamT < BEAM.grow + BEAM.hold;
    if (full && !this.capture && !this.invuln && !this.dual && !this.shipHidden && Math.abs(this.ship.x - q.x) < 30 && this.ship.y > q.y + 20) {
      if (this.shield) {
        // the shield blocks the beam once
        this.shield = false; this.invuln = 1.2;
        s.sound.play('metal'); s.fx.ring(this.ship.x, this.ship.y, { color: '#60a5fa', radius: 60 });
        s.fx.text(this.ship.x, this.ship.y - 50, 'Shield blocked it!', { color: '#93c5fd', size: 18 });
      } else {
        this.capture = { q, t: 0, sx: this.ship.x, sy: this.ship.y, x: this.ship.x, y: this.ship.y, spin: 0 };
        this.bullets = [];
        s.sound.tone({ freq: 900, to: 200, dur: 1.2, type: 'triangle', vol: 0.08 });
      }
    }
    if (q.beamT >= total && !this.capture) { q.state = 'return'; q.beamDive = false; this.beamCarrier = null; }
  }

  beamFrac(q) {
    const t = q.beamT;
    if (t < BEAM.grow) return t / BEAM.grow;
    if (t < BEAM.grow + BEAM.hold) return 1;
    if (this.capture?.q === q) return 1;
    return Math.max(0, 1 - (t - BEAM.grow - BEAM.hold) / BEAM.shrink);
  }

  // ── Lancer laser ───────────────────────────────────────────
  /** Returns true if the game should stop updating this frame. */
  updateLance(a, dt) {
    const s = this.s, prev = a.lanceT;
    a.lanceT += dt;
    if (prev < LANCE.charge && a.lanceT >= LANCE.charge) {
      s.sound.tone({ freq: 1400, to: 200, dur: LANCE.fire, type: 'sawtooth', vol: 0.06 });
      s.fx.shake(3, 0.15);
    } else if (a.lanceT < LANCE.charge && Math.floor(a.lanceT * 10) !== Math.floor(prev * 10)) {
      s.sound.tone({ freq: 500 + a.lanceT * 1200, dur: 0.05, type: 'square', vol: 0.025 });
    }
    const firing = a.lanceT >= LANCE.charge && a.lanceT < LANCE.charge + LANCE.fire;
    if (firing && !this.invuln && !this.capture && !this.shipHidden) {
      for (const sx of this.shipXs()) {
        if (this.ship.y > a.y && Math.abs(sx - a.x) < 7 + SHIP_R * 0.75) { if (this.crash(sx)) return true; break; }
      }
    }
    if (a.lanceT >= LANCE.charge + LANCE.fire) {
      a.state = 'dive'; a.pi = 0; a.lanceRun = true;
      a.path = [[a.x, H + 40]];
    }
    return false;
  }

  // ── Bosses ─────────────────────────────────────────────────
  /** Returns true if the game should stop updating this frame. */
  updateBoss(dt) {
    const s = this.s, b = this.boss;
    b.flash = Math.max(0, b.flash - dt * 5);
    if (this.updateLanes(dt)) return true;
    if (b.hp <= 0) return false;
    b.t += dt;
    const rage = b.hp < b.maxHp * 0.5 ? 1.35 : 1;
    const hard = 1 + (b.tier - 1) * 0.12;                // every boss level is harder than the last
    const sk = Math.min(1.5, Math.sqrt(this.speedK)) * (1 + b.round * 0.1);
    if (b.enter) {
      b.y += 80 * dt;
      if (b.y >= 150) { b.y = 150; b.enter = false; s.sound.play('boom'); s.fx.shake(6, 0.3); }
      return false;
    }

    // Movement: each boss moves its own way
    if (b.hold > 0) b.hold -= dt;
    else b.moveT += dt * rage;
    const m = b.moveT;
    if (b.kind === 'dreadnought') { b.x = W / 2 + Math.sin(m * 0.7 * sk) * 140; b.y = 150 + Math.sin(b.t * 1.3) * 8; }
    else if (b.kind === 'hive') { b.x = W / 2 + Math.sin(m * 0.5 * sk) * 130; b.y = 160 + Math.sin(m * 1.0 * sk) * 40; }
    else if (b.kind === 'warden') {
      if (Math.abs(b.tx - b.x) < 4 && b.hold <= 0) b.tx = s.rng.range(110, W - 110);
      if (b.hold <= 0) b.x += clamp(b.tx - b.x, -120 * dt * sk, 120 * dt * sk);
      b.y = 140 + Math.sin(b.t * 0.8) * 5;
    } else { b.x = W / 2 + Math.sin(m * 1.1 * sk) * 160; b.y = 150 + Math.cos(m * 2.2 * sk) * 18; }

    // Lasers fixed to the boss (twin cannons / sweeping beam)
    if (b.lasers) {
      const L = b.lasers, prev = L.t;
      L.t += dt;
      if (prev < L.charge && L.t >= L.charge) { s.sound.tone({ freq: 1200, to: 150, dur: L.dur, type: 'sawtooth', vol: 0.07 }); s.fx.shake(5, 0.3); }
      if (L.t >= L.charge && L.t < L.charge + L.dur && !this.invuln && !this.capture && !this.shipHidden) {
        const hitX = this.shipXs().find((sx) => L.offs.some((off) => Math.abs(sx - (b.x + off)) < L.w + SHIP_R * 0.75));
        if (hitX !== undefined && this.crash(hitX)) return true;
      }
      if (L.t >= L.charge + L.dur) b.lasers = null;
    }

    // Bullet spiral
    if (b.spiral) {
      const sp = b.spiral;
      sp.t += dt; sp.next -= dt;
      while (sp.next <= 0 && sp.t < sp.dur) {
        sp.next += sp.gap;
        sp.ang += sp.turn;
        for (let k = 0; k < sp.arms; k++) {
          const ang = sp.ang + k * TAU / sp.arms;
          if (Math.sin(ang) < -0.2) continue;               // don't waste bullets upwards
          this.enemyShots.push({ kind: 'pellet', x: b.x, y: b.y + 10, vx: Math.cos(ang) * sp.v, vy: Math.sin(ang) * sp.v, r: 4 });
        }
      }
      if (sp.t >= sp.dur) b.spiral = null;
    }

    b.atkT -= dt * rage * hard;
    if (b.atkT <= 0 && !b.lasers && !b.spiral) {
      const atk = b.attacks[b.atk % b.attacks.length];
      b.atk++;
      b.atkT = Math.max(0.9, 2.3 / sk);
      this.bossAttack(b, atk, sk);
      // later bosses (and later rounds) double up: a quick extra volley on top
      if (b.tier >= 3 && s.rng.chance(0.25 + b.round * 0.2)) this.later(0.5, () => { if (this.boss?.hp > 0) this.bossAttack(this.boss, 'aimed', sk); });
    }
    return false;
  }

  bossAttack(b, atk, sk) {
    const s = this.s, extra = b.tier - 1 + b.round * 2;
    const pellet = (x, y, ang, v) => this.enemyShots.push({ kind: 'pellet', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: 4 });
    if (atk === 'fan') {
      const n = 7 + extra * 2, v = 200 * sk;
      for (let i = 0; i < n; i++) pellet(b.x, b.y + 28, Math.PI / 2 + (i / (n - 1) - 0.5) * 1.6, v);
      s.sound.tone({ freq: 300, to: 900, dur: 0.18, type: 'sawtooth', vol: 0.06 });
    } else if (atk === 'aimed') {
      const n = 3 + Math.min(4, extra);
      for (let i = 0; i < n; i++) this.later(i * 0.15, () => { if (this.boss?.hp > 0) this.pellet({ x: this.boss.x, y: this.boss.y + 20 }, 0, 1.25); });
      s.sound.tone({ freq: 600, to: 1200, dur: 0.1, type: 'square', vol: 0.05 });
    } else if (atk === 'ring') {
      const n = 18 + extra * 3, v = 170 * sk, off = s.rng.range(0, TAU);
      for (let i = 0; i < n; i++) { const ang = off + i * TAU / n; if (Math.sin(ang) > -0.3) pellet(b.x, b.y, ang, v); }
      s.sound.noise({ dur: 0.3, vol: 0.12, freq: 1600, to: 200 });
    } else if (atk === 'spiral') {
      b.spiral = { t: 0, dur: 2 + extra * 0.3, next: 0, gap: Math.max(0.06, 0.11 - extra * 0.01), ang: 0, turn: 0.33 * (s.rng.chance(0.5) ? 1 : -1), arms: 2 + Math.min(2, Math.floor(extra / 2)), v: 180 * sk };
      b.hold = b.spiral.dur;
      s.sound.tone({ freq: 200, to: 800, dur: 0.5, type: 'triangle', vol: 0.06 });
    } else if (atk === 'twin') {
      const offs = extra >= 2 ? [-58, 0, 58] : [-58, 58];
      b.lasers = { t: 0, charge: Math.max(0.6, 0.9 - extra * 0.05), dur: 0.7, offs, w: 9 };
      b.hold = b.lasers.charge + b.lasers.dur;
    } else if (atk === 'sweep') {
      // one fat beam; the boss keeps flying, so it sweeps across the screen
      b.lasers = { t: 0, charge: 0.8, dur: 1.6 + extra * 0.2, offs: [0], w: 13 };
    } else if (atk === 'launch' || atk === 'swarm') {
      const n = 2 + Math.min(4, extra) + (atk === 'swarm' ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = this.makeAlien(atk === 'swarm' ? 'scout' : 'scout', -1, -1);
        a.x = b.x + (i - (n - 1) / 2) * 30; a.y = b.y + 20; a.state = 'dive'; a.pi = 0; a.diveTime = 0;
        a.split = atk === 'swarm';
        a.path = this.divePath(a, this.ship.x + (i - (n - 1) / 2) * 60);
        this.planShots(a);
        this.aliens.push(a);
      }
      s.sound.tone({ freq: 250, to: 700, dur: 0.3, type: 'triangle', vol: 0.06 });
    } else if (atk === 'mines') {
      const n = 2 + Math.min(3, extra);
      for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * 40; this.enemyShots.push({ kind: 'mine', x: b.x + off, y: b.y + 24, vx: off * 1.5, vy: 80, r: 8, shootable: true, life: 5, t: 0 }); }
      s.sound.tone({ freq: 300, to: 600, dur: 0.2, type: 'sine', vol: 0.05 });
    } else if (atk === 'missiles') {
      const n = 2 + Math.min(3, extra);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        this.enemyShots.push({ kind: 'missile', x: b.x + side * 50, y: b.y + 20, vx: side * 140, vy: 40, r: 6, shootable: true, life: 3.4, t: 0 });
      }
      s.sound.noise({ dur: 0.35, vol: 0.1, freq: 600, to: 200 });
    } else if (atk === 'carpet') {
      const n = 5 + Math.min(3, extra);
      for (let i = 0; i < n; i++) {
        const x = 40 + (W - 80) * (i + 0.5) / n;
        this.later(i * 0.12, () => this.enemyShots.push({ kind: 'bomb', x, y: 60, vx: 0, vy: 150 * sk, r: 8, shootable: true, burstY: this.ship.y - s.rng.range(60, 150), t: 0 }));
      }
      s.sound.tone({ freq: 200, to: 90, dur: 0.4, type: 'square', vol: 0.06 });
    } else if (atk === 'lanes') {
      // laser gates at fixed spots across the screen — leave one gap
      const n = 4 + Math.min(2, extra), gap = s.rng.int(0, n - 1);
      for (let i = 0; i < n; i++) if (i !== gap) this.lanes.push({ x: 30 + (W - 60) * (i + 0.5) / n, t: 0, charge: Math.max(0.75, 1.1 - extra * 0.06), dur: 0.6, w: (W - 60) / n * 0.18 });
      s.sound.tone({ freq: 900, to: 300, dur: 0.4, type: 'square', vol: 0.05 });
    }
  }

  /** Laser gates (not tied to the boss). Returns true if the game should stop updating this frame. */
  updateLanes(dt) {
    const s = this.s;
    for (const ln of this.lanes) {
      const prev = ln.t; ln.t += dt;
      if (prev < ln.charge && ln.t >= ln.charge) { s.sound.tone({ freq: 1400, to: 200, dur: ln.dur, type: 'sawtooth', vol: 0.05 }); s.fx.shake(3, 0.2); }
      if (ln.t >= ln.charge && ln.t < ln.charge + ln.dur && !this.invuln && !this.capture && !this.shipHidden) {
        const hitX = this.shipXs().find((sx) => Math.abs(sx - ln.x) < ln.w + SHIP_R * 0.7);
        if (hitX !== undefined) { ln.t = 99; if (this.crash(hitX)) return true; }
      }
    }
    this.lanes = this.lanes.filter((ln) => ln.t < ln.charge + ln.dur);
    return false;
  }

  later(delay, fn) { (this.timers ||= []).push({ t: delay, fn }); }

  hitBoss(dmg) {
    const s = this.s, b = this.boss;
    if (!b || b.hp <= 0 || b.enter) return;
    b.hp -= dmg; b.flash = 1;
    s.sound.play('metal');
    s.fx.burst(b.x + s.rng.range(-50, 50), b.y + 20, { colors: ['#fca5a5', '#fff'], count: 5, speed: 120, life: 0.25 });
    if (b.hp > 0) {
      if (Math.floor((b.hp + dmg) / 10) !== Math.floor(b.hp / 10)) s.award(20 * this.level, b.x, b.y + 30, { color: '#fca5a5', size: 14 });
      return;
    }
    // Destroyed!
    b.hp = 0; b.lasers = null; b.spiral = null; this.lanes = [];
    this.bossDeadT = 2.2;
    s.award(250 * this.level, b.x, b.y, { color: '#fde047', size: 32 });
    s.fx.text(W / 2, H * 0.4, `${b.name} DESTROYED!`, { color: '#fde047', size: 28, life: 2, rise: 10 });
    s.unlock('boss');
    s.sound.play('boom'); s.sound.play('golden');
    s.fx.shake(14, 0.8); s.fx.flash('#fde047');
    for (let i = 0; i < 6; i++) {
      this.later(i * 0.25, () => {
        const x = b.x + s.rng.range(-70, 70), y = b.y + s.rng.range(-20, 25);
        s.fx.burst(x, y, { colors: ['#f43f5e', '#fde047', '#fb923c', '#fff'], count: 40, speed: 300, life: 0.8 });
        s.fx.ring(x, y, { color: '#fb923c', radius: 70 });
        s.sound.noise({ dur: 0.4, vol: 0.18, freq: 1200, to: 80 });
      });
    }
    for (const a of this.aliens) if (!a.dead) this.killAlien(a, false);
    this.enemyShots = [];
  }

  // ── Pickups ────────────────────────────────────────────────
  maybeDrop(a) {
    const s = this.s, r = s.rng, T = TYPES[a.type];
    this.sinceDrop++;
    let kind = null;
    const diving = a.state !== 'form' && a.state !== 'home' && a.state !== 'enter';
    if (a.type === 'carrier' && diving && this.level >= 6 && !this.lifeDropped && r.chance(0.05)) {
      kind = 'life'; this.lifeDropped = true;
    } else if (a.laserCarrier) {
      // the laser is scarce: one red-glowing carrier carries it, once in every 5 levels
      kind = 'laser'; this.laserBlocks[Math.floor((this.level - 1) / 5)] = true;
    } else if (r.chance(T.drop) || (this.sinceDrop >= 90 && T.drop > 0)) {
      kind = r.chance(0.1) ? 'shield' : r.chance(0.65) ? 'blaster' : 'rockets';
    }
    if (!kind) return;
    this.sinceDrop = 0;
    this.pickups.push({ kind, x: a.x, y: a.y, vy: 110, t: 0 });
  }

  updatePickups(dt) {
    const s = this.s;
    for (const p of this.pickups) {
      p.t += dt; p.y += p.vy * dt; p.x += Math.sin(p.t * 3) * 20 * dt;
      if (this.shipHidden || this.capture) continue;
      for (const sx of this.shipXs()) {
        if ((p.x - sx) ** 2 + (p.y - this.ship.y) ** 2 < 30 ** 2) { p.got = true; this.collect(p); break; }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.got && p.y < H + 30);
  }

  collect(p) {
    const s = this.s, L = this.level, x = p.x, y = this.ship.y - 40, info = PICKUPS[p.kind];
    s.fx.ring(p.x, p.y, { color: info.color, radius: 44 });
    s.fx.burst(p.x, p.y, { colors: [info.color, '#fff'], count: 24, speed: 200 });
    if (p.kind === 'life') { this.gainLife(); return; }
    s.sound.play('powerup');
    if (p.kind === 'shield') {
      if (this.shield) s.award(300 * L, x, y, { color: info.color, size: 18 });
      else s.fx.text(x, y, 'SHIELD!', { color: info.color, size: 22 });
      this.shield = true;
      return;
    }
    const pw = this.pw, k = p.kind;
    if (pw[k] < 3 && (k === this.weapon || k === 'blaster')) {
      // same weapon (or a blaster capsule while a special is running) → more power
      pw[k]++;
      s.fx.text(x, y, `${info.name} ${'▮'.repeat(pw[k])}`, { color: info.color, size: 22 });
      if (pw[k] === 3) { s.unlock('maxed'); s.fx.text(x, y - 30, 'FULLY LOADED!', { color: '#fde047', size: 20 }); }
    } else if (k === this.weapon || k === 'blaster') {
      s.award(500 * L, x, y, { color: info.color, size: 20 });
    } else {
      // switch to a special weapon (the other special is lost)
      if (this.weapon !== 'blaster') pw[this.weapon] = 1;
      this.weapon = k;
      if (k === 'laser') pw.laser = 2;          // rare, so it arrives strong
      s.fx.text(x, y, `${info.name}!  ${WEAPON_TIME[k]}s`, { color: info.color, size: 24 });
    }
    if (k === this.weapon && WEAPON_TIME[k]) this.weaponT = WEAPON_TIME[k];
  }

  // ── Hits and scoring ───────────────────────────────────────
  hitAlien(a, dmg = 1) {
    const s = this.s;
    if (a.dead) return;
    a.hp -= dmg; a.flash = 1;
    if (a.hp > 0) {
      s.sound.play('metal');
      s.fx.burst(a.x, a.y, { colors: ['#a78bfa', '#fff'], count: 8, speed: 120, life: 0.3 });
      return;
    }
    this.killAlien(a, true);
  }

  killAlien(a, byPlayer) {
    const s = this.s, L = this.level, T = TYPES[a.type];
    if (a.dead) return;
    a.dead = true;
    const inForm = a.state === 'form' || a.state === 'home' || a.state === 'enter';
    const color = T.color;

    if (this.beamCarrier === a) this.beamCarrier = null;

    if (byPlayer) {
      let base;
      if (this.bonus) { base = 8; this.bonusHits++; }
      else base = inForm ? T.form : T.dive;
      s.award(base * L, a.x, a.y - a.r, { chain: true, color, size: inForm ? 16 : 20 });
    }
    s.sound.play('brick', Math.min(16, s.comboCount));
    s.sound.noise({ dur: 0.16, vol: 0.16, freq: 1800, to: 200 });
    const big = a.type === 'carrier' || a.type === 'bomber';
    s.fx.burst(a.x, a.y, { colors: [color, '#fff', '#fde047'], count: big ? 34 : 18, speed: big ? 280 : 200, life: 0.6 });
    s.fx.ring(a.x, a.y, { color, radius: a.r * 2.2, life: 0.35, width: 2 });
    if (big) s.fx.shake(4, 0.2);

    if (!byPlayer || this.bonus) return;
    this.maybeDrop(a);

    // Abducted ship: rescue it if the carrier was out of formation
    if (a.captive) {
      a.captive = false;
      if (!inForm && !this.capture && !this.dual && !this.shipHidden) {
        this.rescue = { x: a.x, y: a.y - 32, spin: 0 };
        s.fx.text(a.x, a.y - 60, 'RESCUED!', { color: '#22d3ee', size: 24 });
      } else {
        s.fx.text(a.x, a.y - 50, 'Ship lost…', { color: '#fb7185', size: 18 });
        s.fx.burst(a.x, a.y - 32, { colors: ['#fb7185', '#fff'], count: 20, speed: 200 });
      }
    }
    // Squad (carrier + escorts) bonus — and a guaranteed capsule
    if (a.squad && !inForm) {
      a.squad.killed++;
      if (a.squad.size >= 3 && a.squad.killed === a.squad.size) {
        s.award(300 * L, a.x, a.y - 50, { color: '#fbbf24', size: 26 });
        s.fx.text(a.x, a.y - 80, 'SQUAD BONUS!', { color: '#fbbf24', size: 22 });
        s.sound.play('golden'); s.unlock('squad');
        this.pickups.push({ kind: s.rng.pick(['blaster', 'rockets', 'shield']), x: a.x, y: a.y, vy: 110, t: 0 });
      }
    }
    // Split trio bonus
    if (a.trio) {
      a.trio.killed++;
      if (a.trio.killed === 3) {
        s.award(150 * L, a.x, a.y - 40, { color: '#bef264', size: 22 });
        s.fx.text(a.x, a.y - 70, 'TRIPLE!', { color: '#bef264', size: 20 });
      }
    }
  }

  shootCaptive(q) {
    const s = this.s;
    q.captive = false;
    s.sound.play('hit');
    s.fx.burst(q.x, q.y - 32, { colors: ['#fb7185', '#fff', '#22d3ee'], count: 30, speed: 220 });
    s.fx.text(q.x, q.y - 60, 'Oops! That was yours', { color: '#fb7185', size: 16 });
  }

  levelDone() {
    const s = this.s;
    if (s.state !== 'playing') return;
    const acc = this.shots ? Math.round(this.hits / this.shots * 100) : 0;
    s.fx.text(W / 2, H * 0.62, `Accuracy ${acc}%`, { color: '#a5f3fc', size: 20, life: 1.3, rise: 10 });
    if (this.level >= 2 && this.shots >= 20 && acc >= 75) s.unlock('sharp');
    s.completeLevel();
  }

  awardPerfect() {
    const s = this.s;
    if (this.perfectDone) return;
    this.perfectDone = true;
    const n = this.bonusHits;
    if (n >= this.bonusTotal) {
      s.award(500 * this.level, W / 2, H * 0.34, { color: '#fde047', size: 30 });
      s.fx.text(W / 2, H * 0.28, 'PERFECT!', { color: '#fde047', size: 44, life: 1.6, rise: 10 });
      s.sound.play('golden');
      s.unlock('perfect');
    } else {
      s.fx.text(W / 2, H * 0.3, `Hits ${n} / ${this.bonusTotal}`, { color: '#c4b5fd', size: 30, life: 1.4, rise: 10 });
    }
  }

  onLevelClear() { if (this.bonus) this.awardPerfect(); }

  /** Returns true if the game should stop updating this frame. */
  crash(hitX) {
    const s = this.s;
    if (this.shield) {
      this.shield = false; this.invuln = 1.2;
      s.sound.play('metal'); s.fx.shake(5, 0.2);
      s.fx.ring(this.ship.x, this.ship.y, { color: '#60a5fa', radius: 70, width: 5 });
      s.fx.burst(this.ship.x, this.ship.y, { colors: ['#60a5fa', '#bfdbfe', '#fff'], count: 30, speed: 240 });
      s.fx.text(this.ship.x, this.ship.y - 50, 'Shield down!', { color: '#93c5fd', size: 20 });
      return false;
    }
    s.fx.burst(hitX, this.ship.y, { colors: ['#f472b6', '#22d3ee', '#fde047', '#fff'], count: 60, speed: 320, life: 0.9 });
    s.fx.ring(hitX, this.ship.y, { color: '#f472b6', radius: 80 });
    if (this.dual) {
      // lose one half of the twin fighter instead of a life
      this.dual = false; this.invuln = 1.3;
      this.ship.x = this.ship.tx = hitX < this.ship.x ? this.ship.x + TWIN : this.ship.x - TWIN;
      s.sound.play('hit'); s.fx.shake(8, 0.3);
      s.fx.text(this.ship.x, this.ship.y - 50, 'Wing lost!', { color: '#fb7185', size: 20 });
      s.resetCombo();
      return false;
    }
    s.sound.play('boom');
    if (s.lives <= 1) this.dead = true;
    s.hurt();
    return true;
  }

  onLifeLost() {
    this.enemyShots = []; this.bullets = []; this.pickups = [];
    this.aliens = this.aliens.filter((a) => a.type !== 'shard' && a.col >= 0);
    for (const a of this.aliens) {
      if (a.dead) continue;
      if (a.state === 'dive' || a.state === 'beam' || a.state === 'lance') {
        a.state = 'return'; a.beamDive = false; a.lancePath = false; a.lanceRun = false; a.x = this.slot(a).x; a.y = -30;
      }
    }
    if (this.boss) { this.boss.lasers = null; this.boss.spiral = null; this.boss.atkT = 2.5; }
    this.lanes = [];
    this.beamCarrier = null; this.capture = null; this.rescue = null;
    this.shipHidden = false; this.dual = false; this.shield = false;
    // special weapons are lost; the blaster drops one power level
    this.weapon = 'blaster'; this.weaponT = 0;
    this.pw = { blaster: Math.max(1, this.pw.blaster - 1), laser: 1, rockets: 1 };
    this.ship.x = this.ship.tx = W / 2; this.ship.y = this.ship.ty = PY;
    this.invuln = 2.2; this.diveT = 1.5;
  }

  // Delayed effects (boss explosions etc.) run on the game clock
  tickTimers(dt) {
    if (!this.timers?.length) return;
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); } }
    this.timers = this.timers.filter((tm) => !tm.done);
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const t = this.t, s = this.s;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#1e0b3a'); g.addColorStop(1, '#3b0a3a'); }
    else if (this.boss) { g.addColorStop(0, '#12020a'); g.addColorStop(0.6, '#1a0616'); g.addColorStop(1, '#150a2e'); }
    else { g.addColorStop(0, '#02030d'); g.addColorStop(0.6, '#07092a'); g.addColorStop(1, '#120a2e'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebulas) {
      const y = ((n.y + t * 6) % (H + 400)) - 200;
      const ng = ctx.createRadialGradient(n.x, y, 0, n.x, y, n.r);
      const hue = this.bonus ? (n.hue + t * 50) % 360 : this.boss ? this.boss.hue : n.hue;
      ng.addColorStop(0, `hsla(${hue}, 90%, 50%, .13)`); ng.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = ng; ctx.fillRect(n.x - n.r, y - n.r, n.r * 2, n.r * 2);
    }
    ctx.restore();

    // Twinkling multicolour starfield
    const moving = s.state === 'playing' ? 1 : 0.35;
    for (const st of this.stars) {
      const y = (st.y + t * (30 + st.z * 160) * moving) % H;
      const tw = 0.5 + Math.sin(t * (2 + st.z * 4) + st.ph) * 0.5;
      ctx.globalAlpha = (0.25 + st.z * 0.75) * (0.4 + tw * 0.6);
      ctx.fillStyle = st.c;
      const sz = 1 + st.z * 1.6;
      ctx.fillRect(st.x, y, sz, sz + (st.z > 0.75 ? st.z * 4 * moving : 0));
    }
    ctx.globalAlpha = 1;
    if (this.meteor) {
      const m = this.meteor;
      ctx.save(); ctx.strokeStyle = 'rgba(186,230,253,.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12); ctx.stroke(); ctx.restore();
    }

    if (this.boss) this.drawBoss(ctx, this.boss, t);
    for (const ln of this.lanes || []) this.drawBeamLine(ctx, ln.x, HUD_H, ln.t < ln.charge, ln.w, t);

    // Abduction beams + lancer lasers (under the ships)
    for (const a of this.aliens) {
      if (a.dead) continue;
      if (a.state === 'beam') this.drawBeam(ctx, a, t);
      if (a.state === 'lance') this.drawLance(ctx, a, t);
    }

    for (const a of this.aliens) {
      if (a.dead || a.state === 'wait') continue;
      if (a.captive) this.drawFighter(ctx, a.x, a.y - 32, Math.PI + Math.sin(t * 3) * 0.1, t, { captive: true });
      this.drawAlien(ctx, a, t);
    }

    this.drawEnemyShots(ctx, t);
    for (const p of this.pickups) this.drawPickup(ctx, p, t);

    // Player shots
    const gold = this.golden;
    for (const lv of this.laserVis) this.drawLaser(ctx, lv, t, gold);
    ctx.save(); ctx.shadowColor = gold ? '#fbbf24' : WEAPONS[this.weapon].color; ctx.shadowBlur = 12;
    ctx.strokeStyle = gold ? '#fef3c7' : '#e0f2fe'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of this.bullets) if (b.kind === 'bolt') { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.018, b.y + 14); }
    ctx.stroke(); ctx.restore();
    for (const b of this.bullets) if (b.kind === 'rocket') this.drawRocket(ctx, b);

    // Player
    if (this.capture) {
      const c = this.capture;
      this.drawFighter(ctx, c.x, c.y, c.spin, t, { captive: c.t > 0.8 });
    } else if (!this.shipHidden && !this.dead && !(this.invuln && Math.floor(t * 14) % 2)) {
      const sh = this.ship;
      for (const x of this.shipXs()) this.drawFighter(ctx, x, sh.y, sh.tilt, t, { flame: true });
      if (this.shield) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rx = this.dual ? 44 : 28;
        ctx.strokeStyle = `rgba(96,165,250,${0.55 + Math.sin(t * 6) * 0.2})`; ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(96,165,250,.12)';
        ctx.beginPath(); ctx.ellipse(sh.x, sh.y, rx, 28, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    if (this.rescue) this.drawFighter(ctx, this.rescue.x, this.rescue.y, this.rescue.spin, t, {});

    // Fire reminder
    if (!this.hasFired && s.state === 'playing' && !this.bonus) {
      ctx.save(); ctx.globalAlpha = 0.65 + Math.sin(t * 6) * 0.3;
      ctx.font = '800 20px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.fillStyle = '#fde047';
      const msg = matchMedia('(pointer: coarse)').matches ? 'Touch & hold to fire' : 'Hold SPACE or mouse button to fire';
      ctx.strokeText(msg, W / 2, H * 0.6); ctx.fillText(msg, W / 2, H * 0.6);
      ctx.restore();
    }

    // HUD strip
    ctx.fillStyle = 'rgba(3,5,20,.78)'; ctx.fillRect(0, 0, W, HUD_H);
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 28, 20, this.s.bonusLeft / 15, '#e879f9', `★ STAR RUN · hits ${this.bonusHits} / ${this.bonusTotal} · ${Math.ceil(this.s.bonusLeft)}s`);
    } else if (this.boss) {
      const b = this.boss;
      progressBar(ctx, 14, 12, W - 28, 20, b.hp / b.maxHp, b.hp < b.maxHp * 0.5 ? '#f43f5e' : b.color, `☠ ${b.name}${b.round ? ` Mk ${b.round + 1}` : ''}`);
    } else {
      const total = formationFor(this.level).length;
      const left = this.aliens.filter((a) => !a.dead && a.type !== 'shard').length + this.waveQ.filter((w) => !w.done).reduce((n, w) => n + w.members.length, 0);
      progressBar(ctx, 14, 12, W - 28, 20, (total - left) / total, '#22d3ee', `Alien fleet ${total - left} / ${total}`);
    }
    // Bottom bar: weapon + power, shield, accuracy
    ctx.save(); ctx.font = '800 12px system-ui'; ctx.textBaseline = 'bottom';
    const wp = WEAPONS[this.weapon];
    ctx.textAlign = 'left'; ctx.fillStyle = wp.color;
    if (this.weapon !== 'blaster') {
      const k = Math.max(0, this.weaponT / WEAPON_TIME[this.weapon]);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(12, H - 30, 150, 5);
      ctx.fillStyle = wp.color; ctx.globalAlpha = this.weaponT < 2.5 && Math.floor(this.t * 8) % 2 ? 0.35 : 1;
      ctx.fillRect(12, H - 30, 150 * k, 5); ctx.globalAlpha = 1;
    }
    ctx.fillText(`${wp.name} ${'▮'.repeat(this.power)}${'▯'.repeat(3 - this.power)}${this.dual ? ' ×2' : ''}${this.shield ? '  +SHIELD' : ''}`, 12, H - 8);
    if (this.shots >= 10 && !this.bonus) {
      ctx.fillStyle = 'rgba(165,243,252,.7)'; ctx.textAlign = 'right';
      ctx.fillText(`Accuracy ${Math.round(this.hits / this.shots * 100)}%`, W - 12, H - 8);
    }
    if (gold) { ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.fillText('★ GOLDEN', W / 2 + 20, H - 8); }
    ctx.restore();
  }

  drawBeam(ctx, q, t) {
    const f = this.beamFrac(q);
    if (f <= 0) return;
    const top = q.y + 10, bot = top + (PY + 34 - top) * f;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createLinearGradient(0, top, 0, bot);
    bg.addColorStop(0, 'rgba(45,212,191,.55)'); bg.addColorStop(1, 'rgba(163,230,53,.2)');
    ctx.fillStyle = bg;
    const hw = (y) => 10 + (y - top) / (PY + 34 - top) * 40;
    ctx.beginPath(); ctx.moveTo(q.x - 10, top); ctx.lineTo(q.x + 10, top); ctx.lineTo(q.x + hw(bot), bot); ctx.lineTo(q.x - hw(bot), bot); ctx.closePath(); ctx.fill();
    // spiralling rings
    for (let i = 0; i < 7; i++) {
      const y = top + ((i / 7 + t * 0.8) % 1) * (bot - top);
      const w = hw(y);
      ctx.strokeStyle = `hsla(${150 + i * 12 + Math.sin(t * 3) * 20}, 100%, 65%, .65)`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(q.x, y, w, 5, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  drawLance(ctx, a, t) {
    ctx.save();
    if (a.lanceT < LANCE.charge) {
      // warning line
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(t * 22));
      ctx.strokeStyle = '#f9a8d4'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y + 16); ctx.lineTo(a.x, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.shadowColor = '#f472b6'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(a.x, a.y + 16, 2 + a.lanceT * 7, 0, TAU); ctx.fill();
    } else {
      const k = 1 - (a.lanceT - LANCE.charge) / LANCE.fire;
      ctx.globalCompositeOperation = 'lighter';
      const w = 7 + k * 5;
      const lg = ctx.createLinearGradient(a.x - w, 0, a.x + w, 0);
      lg.addColorStop(0, 'rgba(244,114,182,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.95)'); lg.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = lg; ctx.fillRect(a.x - w, a.y + 14, w * 2, H);
      ctx.fillStyle = `rgba(244,114,182,${0.35 * k})`; ctx.fillRect(a.x - w * 2, a.y + 14, w * 4, H);
    }
    ctx.restore();
  }

  drawLaser(ctx, lv, t, gold) {
    const c = gold ? '251,191,36' : '244,63,94';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const w = lv.w + Math.sin(t * 60) * 1.5;
    const lg = ctx.createLinearGradient(lv.x - w * 1.8, 0, lv.x + w * 1.8, 0);
    lg.addColorStop(0, `rgba(${c},0)`); lg.addColorStop(0.35, `rgba(${c},.6)`); lg.addColorStop(0.5, 'rgba(255,255,255,.95)'); lg.addColorStop(0.65, `rgba(${c},.6)`); lg.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = lg; ctx.fillRect(lv.x - w * 1.8, lv.top, w * 3.6, lv.y0 - lv.top);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lv.x, lv.y0, w * 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${c},.8)`; ctx.beginPath(); ctx.arc(lv.x, lv.top, w * 1.3 + Math.random() * 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawRocket(ctx, b) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang + Math.PI / 2);
    ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 10;
    ctx.fillStyle = this.golden ? '#fde047' : '#fed7aa';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, -3); ctx.lineTo(3, 6); ctx.lineTo(-3, 6); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ea580c'; ctx.fillRect(-4.5, 3, 2, 4); ctx.fillRect(2.5, 3, 2, 4);
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(0, 11 + Math.random() * 4); ctx.lineTo(2, 6); ctx.fill();
    ctx.restore();
  }

  drawEnemyShots(ctx, t) {
    for (const e of this.enemyShots) {
      ctx.save();
      if (e.kind === 'pellet' || e.kind === 'shrap') {
        ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12; ctx.fillStyle = e.kind === 'shrap' ? '#e9d5ff' : '#fecdd3';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 0.75, e.r * 1.7, Math.atan2(e.vy, e.vx) - Math.PI / 2, 0, TAU); ctx.fill();
      } else if (e.kind === 'bomb') {
        ctx.translate(e.x, e.y); ctx.rotate(e.t * 4);
        ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 14;
        ctx.fillStyle = '#581c87'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = Math.floor(e.t * 8) % 2 ? '#f43f5e' : '#fde047';
        ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e9d5ff';
        for (let i = 0; i < 4; i++) { const a = i * TAU / 4; ctx.fillRect(Math.cos(a) * 8 - 1.5, Math.sin(a) * 8 - 1.5, 3, 3); }
      } else if (e.kind === 'missile') {
        ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2);
        ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 14;
        ctx.fillStyle = '#fecdd3'; ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(3.5, 1); ctx.lineTo(3.5, -7); ctx.lineTo(-3.5, -7); ctx.lineTo(-3.5, 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#be123c'; ctx.fillRect(-5, -8, 3, 5); ctx.fillRect(2, -8, 3, 5);
        ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(0, -13 - Math.random() * 4); ctx.lineTo(2, -7); ctx.fill();
      } else if (e.kind === 'mine') {
        ctx.translate(e.x, e.y); ctx.rotate(e.t * 2);
        ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 16;
        ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.stroke(); }
        ctx.fillStyle = '#0e7490'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = Math.floor(e.t * 6) % 2 ? '#fff' : '#22d3ee'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawPickup(ctx, p, t) {
    const info = PICKUPS[p.kind];
    ctx.save(); ctx.translate(p.x, p.y);
    const pulse = 1 + Math.sin(t * 8 + p.t) * 0.08;
    ctx.scale(pulse, pulse);
    ctx.shadowColor = info.color; ctx.shadowBlur = 18;
    const w = p.kind === 'life' ? 36 : 28, h = 20;
    ctx.fillStyle = 'rgba(8,10,30,.85)';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 10); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = info.color; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.letter, 0, 1);
    ctx.restore();
  }

  // Enemy ships — all drawn nose-down (+y) in local space, then turned to face where they fly.
  drawAlien(ctx, a, t) {
    const T = TYPES[a.type];
    const white = a.flash > 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 8 + a.id);
    ctx.save(); ctx.translate(a.x, a.y);
    if (a.type === 'carrier') {
      // Saucers don't turn; they wobble
      ctx.rotate(Math.sin(t * 2 + a.id) * 0.08);
      if (a.laserCarrier) {
        // carries the rare LASER: red halo + tag
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rg = ctx.createRadialGradient(0, 0, 8, 0, 0, 34 + pulse * 6);
        rg.addColorStop(0, 'rgba(244,63,94,.55)'); rg.addColorStop(1, 'rgba(244,63,94,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('L', 0, 20);
      }
      const hurt = a.hp < a.maxHp;
      const c1 = hurt ? (a.hp === 1 ? '#f87171' : '#fbbf24') : a.laserCarrier ? '#fb7185' : '#2dd4bf', c2 = hurt ? '#7f1d1d' : a.laserCarrier ? '#881337' : '#115e59';
      ctx.shadowColor = c1; ctx.shadowBlur = 16;
      // dome
      const dg = ctx.createRadialGradient(-3, -9, 1, 0, -5, 11);
      dg.addColorStop(0, '#ecfeff'); dg.addColorStop(1, 'rgba(103,232,249,.35)');
      ctx.fillStyle = white ? '#fff' : dg;
      ctx.beginPath(); ctx.ellipse(0, -4, 9, 8, 0, Math.PI, TAU); ctx.fill();
      // hull
      const hg = ctx.createLinearGradient(0, -6, 0, 8);
      hg.addColorStop(0, c1); hg.addColorStop(1, c2);
      ctx.fillStyle = white ? '#fff' : hg;
      ctx.beginPath(); ctx.ellipse(0, 0, 21, 7, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(0, 4, 12, 3, 0, 0, TAU); ctx.fill();
      // chasing lights
      for (let i = 0; i < 6; i++) {
        const on = (Math.floor(t * 8) + i) % 3 === 0;
        ctx.fillStyle = on ? '#fef08a' : 'rgba(254,240,138,.25)';
        ctx.beginPath(); ctx.arc(-15 + i * 6, 1, 1.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.rotate(a.heading - Math.PI / 2);
    if (a.type === 'shard') ctx.rotate(t * 8);
    const glow = a.split ? '#bef264' : T.color;
    ctx.shadowColor = glow; ctx.shadowBlur = a.split ? 14 + pulse * 10 : 10;
    const fill = (c) => { ctx.fillStyle = white ? '#fff' : c; };

    if (a.type === 'scout') {
      // engine glow (rear = -y)
      ctx.fillStyle = `rgba(190,242,100,${0.4 + pulse * 0.4})`; ctx.beginPath(); ctx.ellipse(0, -10, 3, 4 + pulse * 3, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(0, -10, 0, 14);
      g.addColorStop(0, a.split ? '#ecfccb' : '#d9f99d'); g.addColorStop(1, a.split ? '#65a30d' : '#4d7c0f');
      fill(g);
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(12, -8); ctx.lineTo(4, -4); ctx.lineTo(0, -9); ctx.lineTo(-4, -4); ctx.lineTo(-12, -8); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.ellipse(0, 2, 2.5, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fef08a'; ctx.fillRect(-9.5, -7.5, 2, 2); ctx.fillRect(7.5, -7.5, 2, 2);
    } else if (a.type === 'gunship') {
      ctx.fillStyle = `rgba(253,186,116,${0.4 + pulse * 0.4})`;
      for (const x of [-7, 7]) { ctx.beginPath(); ctx.ellipse(x, -9, 2.5, 3 + pulse * 3, 0, 0, TAU); ctx.fill(); }
      const g = ctx.createLinearGradient(-18, 0, 18, 0);
      g.addColorStop(0, '#9a3412'); g.addColorStop(0.5, '#fdba74'); g.addColorStop(1, '#9a3412');
      fill(g);
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(8, 4); ctx.lineTo(18, 8); ctx.lineTo(16, -2); ctx.lineTo(8, -8); ctx.lineTo(-8, -8); ctx.lineTo(-16, -2); ctx.lineTo(-18, 8); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // triple cannons
      ctx.fillStyle = white ? '#fff' : '#fed7aa';
      ctx.fillRect(-1.5, 8, 3, 7); ctx.fillRect(-12, 5, 2.5, 6); ctx.fillRect(9.5, 5, 2.5, 6);
      ctx.fillStyle = '#1c1917'; ctx.beginPath(); ctx.ellipse(0, -1, 4, 3, 0, 0, TAU); ctx.fill();
    } else if (a.type === 'bomber') {
      const hurt = a.hp < a.maxHp;
      ctx.fillStyle = `rgba(216,180,254,${0.4 + pulse * 0.4})`;
      for (const x of [-11, 11]) { ctx.beginPath(); ctx.ellipse(x, -12, 3, 3 + pulse * 3, 0, 0, TAU); ctx.fill(); }
      const g = ctx.createLinearGradient(0, -12, 0, 12);
      g.addColorStop(0, hurt ? '#fca5a5' : '#e9d5ff'); g.addColorStop(1, hurt ? '#7f1d1d' : '#6b21a8');
      fill(g);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const an = Math.PI / 6 + i * TAU / 6; ctx.lineTo(Math.cos(an) * 14, Math.sin(an) * 12); }
      ctx.closePath(); ctx.fill();
      // engine pods
      fill(hurt ? '#991b1b' : '#7e22ce');
      ctx.fillRect(-17, -10, 6, 14); ctx.fillRect(11, -10, 6, 14);
      ctx.shadowBlur = 0;
      // bomb bay
      ctx.fillStyle = `rgba(250,204,21,${0.5 + pulse * 0.5})`; ctx.beginPath(); ctx.arc(0, 4, 3.5, 0, TAU); ctx.fill();
      if (hurt) { ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-1, -1); ctx.lineTo(-4, 3); ctx.stroke(); }
    } else if (a.type === 'lancer') {
      const charging = a.state === 'lance';
      ctx.fillStyle = `rgba(249,168,212,${0.4 + pulse * 0.4})`; ctx.beginPath(); ctx.ellipse(0, -15, 2.5, 3 + pulse * 3, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(-6, 0, 6, 0);
      g.addColorStop(0, '#9d174d'); g.addColorStop(0.5, '#fbcfe8'); g.addColorStop(1, '#9d174d');
      // fins
      fill('#db2777');
      ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-13, -12); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(13, -12); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
      fill(g);
      ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(5, 0); ctx.lineTo(0, -14); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = charging ? 20 : 0; ctx.shadowColor = '#fff';
      ctx.fillStyle = charging ? '#fff' : '#fce7f3'; ctx.beginPath(); ctx.arc(0, 15, charging ? 3 + pulse * 2 : 1.8, 0, TAU); ctx.fill();
    } else if (a.type === 'shard') {
      fill('#bef264');
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawBoss(ctx, b, t) {
    if (b.hp <= 0 && this.bossDeadT < 1.2) return;
    ctx.save(); ctx.translate(b.x, b.y);
    if (b.hp <= 0) { ctx.globalAlpha = Math.max(0, (this.bossDeadT - 1.2)); ctx.translate(Math.sin(t * 60) * 4, 0); }
    const white = b.flash > 0.6;
    const rage = b.hp < b.maxHp * 0.5;
    const charging = b.lasers && b.lasers.t < b.lasers.charge;
    ctx.shadowColor = rage ? '#f43f5e' : b.color; ctx.shadowBlur = 24;
    if (b.kind === 'dreadnought') {
      const wg = ctx.createLinearGradient(-80, 0, 80, 0);
      wg.addColorStop(0, '#7f1d1d'); wg.addColorStop(0.5, rage ? '#f87171' : '#fb923c'); wg.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = white ? '#fff' : wg;
      ctx.beginPath();
      ctx.moveTo(0, 30); ctx.lineTo(30, 18); ctx.lineTo(80, 24); ctx.lineTo(74, 0); ctx.lineTo(40, -18); ctx.lineTo(18, -30);
      ctx.lineTo(-18, -30); ctx.lineTo(-40, -18); ctx.lineTo(-74, 0); ctx.lineTo(-80, 24); ctx.lineTo(-30, 18); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = white ? '#fff' : '#1f2937';
      ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(22, 10); ctx.lineTo(16, -24); ctx.lineTo(-16, -24); ctx.lineTo(-22, 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#374151'; ctx.fillRect(-62, 8, 8, 22); ctx.fillRect(54, 8, 8, 22); ctx.fillRect(-4, 20, 8, 14);
      for (const x of [-58, 0, 58]) {
        ctx.fillStyle = charging ? `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 40)})` : '#fda4af';
        ctx.beginPath(); ctx.arc(x, x ? 31 : 35, charging ? 3 + b.lasers.t * 6 : 3, 0, TAU); ctx.fill();
      }
      this.bossCore(ctx, t, rage, 0, 0, 11);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = (Math.floor(t * 6) + i) % 5 === 0 ? '#fef08a' : 'rgba(254,240,138,.2)';
        ctx.fillRect(-46 + i * 7, 4, 3, 3); ctx.fillRect(34 + i * 7, 4, 3, 3);
      }
    } else if (b.kind === 'hive') {
      // organic disc with pulsing pods
      const g = ctx.createRadialGradient(0, -6, 6, 0, 0, 80);
      g.addColorStop(0, rage ? '#fecaca' : '#ecfccb'); g.addColorStop(0.45, rage ? '#dc2626' : '#65a30d'); g.addColorStop(1, '#1a2e05');
      ctx.fillStyle = white ? '#fff' : g;
      ctx.beginPath(); ctx.ellipse(0, 0, 78, 30, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      for (let i = 0; i < 10; i++) {
        const an = i / 10 * TAU + t * 0.8, px = Math.cos(an) * 60, py = Math.sin(an) * 20;
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
        ctx.fillStyle = white ? '#fff' : `rgba(217,249,157,${0.4 + pulse * 0.6})`;
        ctx.beginPath(); ctx.arc(px, py, 5 + pulse * 2, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(190,242,100,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 44, 16, 0, 0, TAU); ctx.stroke();
      // the eye
      ctx.fillStyle = '#052e16'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 12, 0, 0, TAU); ctx.fill();
      const ex = clamp((this.ship.x - b.x) / 20, -8, 8);
      ctx.fillStyle = rage ? '#f43f5e' : '#fde047'; ctx.beginPath(); ctx.ellipse(ex, 2, 6, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(ex, 2, 2, 7, 0, 0, TAU); ctx.fill();
    } else if (b.kind === 'warden') {
      // armoured hexagon fortress with four turrets
      const g = ctx.createLinearGradient(0, -34, 0, 34);
      g.addColorStop(0, '#dbeafe'); g.addColorStop(0.5, rage ? '#b91c1c' : '#2563eb'); g.addColorStop(1, '#0f172a');
      ctx.fillStyle = white ? '#fff' : g;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.lineTo(Math.cos(an) * 76, Math.sin(an) * 32); }
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.stroke();
      for (const [x, y] of [[-48, -14], [48, -14], [-48, 16], [48, 16]]) {
        ctx.fillStyle = white ? '#fff' : '#1e293b'; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        const an = Math.atan2(this.ship.y - (b.y + y), this.ship.x - (b.x + x));
        ctx.strokeStyle = '#bfdbfe'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * 14, y + Math.sin(an) * 14); ctx.stroke();
      }
      ctx.fillStyle = '#0f172a'; ctx.fillRect(-26, -10, 52, 20);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = (Math.floor(t * 5) + i) % 6 === 0 ? '#38bdf8' : 'rgba(56,189,248,.25)'; ctx.fillRect(-22 + i * 8, -3, 5, 6); }
    } else {
      // eclipse: black disc with blazing corona
      ctx.shadowBlur = 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const an = i / 16 * TAU + t * 1.5, len = 58 + Math.sin(t * 7 + i * 1.7) * 10;
        ctx.strokeStyle = rage ? 'rgba(248,113,113,.55)' : 'rgba(244,114,182,.5)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(Math.cos(an) * 36, Math.sin(an) * 26); ctx.lineTo(Math.cos(an) * len, Math.sin(an) * len * 0.55); ctx.stroke();
      }
      const cg = ctx.createRadialGradient(0, 0, 30, 0, 0, 62);
      cg.addColorStop(0, rage ? 'rgba(254,202,202,.9)' : 'rgba(251,207,232,.9)'); cg.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(0, 0, 62, 40, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = white ? '#fff' : '#0a0512'; ctx.beginPath(); ctx.ellipse(0, 0, 38, 28, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fdf2f8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 38, 28, 0, 0, TAU); ctx.stroke();
      if (charging) { ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 40)})`; ctx.beginPath(); ctx.arc(0, 26, 4 + b.lasers.t * 8, 0, TAU); ctx.fill(); }
    }
    ctx.restore();

    // lasers fixed to the boss
    if (b.lasers) {
      const L = b.lasers;
      ctx.save();
      for (const off of L.offs) this.drawBeamLine(ctx, b.x + off, b.y + 30, L.t < L.charge, L.w, t);
      ctx.restore();
    }
  }

  bossCore(ctx, t, rage, x, y, r) {
    const cg = ctx.createRadialGradient(x, y, 1, x, y, r + 1);
    cg.addColorStop(0, '#fff'); cg.addColorStop(0.4, rage ? '#f43f5e' : '#fde047'); cg.addColorStop(1, 'rgba(244,63,94,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r + Math.sin(t * 6) * 2, 0, TAU); ctx.fill();
  }

  /** A vertical enemy laser: dashed warning line while charging, then the beam. */
  drawBeamLine(ctx, x, top, warning, w0, t) {
    ctx.save();
    if (warning) {
      ctx.globalAlpha = 0.3 + 0.45 * Math.abs(Math.sin(t * 20));
      ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#f43f5e'; ctx.fillRect(x - w0, top, w0 * 2, H);
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const w = w0 + Math.sin(t * 50) * 2;
      const lg = ctx.createLinearGradient(x - w * 2, 0, x + w * 2, 0);
      lg.addColorStop(0, 'rgba(244,63,94,0)'); lg.addColorStop(0.4, 'rgba(244,63,94,.7)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(0.6, 'rgba(244,63,94,.7)'); lg.addColorStop(1, 'rgba(244,63,94,0)');
      ctx.fillStyle = lg; ctx.fillRect(x - w * 2, top, w * 4, H);
    }
    ctx.restore();
  }

  drawFighter(ctx, x, y, rot, t, { flame = false, captive = false } = {}) {
    const gold = this.golden && !captive;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (flame) {
      const f = 9 + Math.sin(t * 50) * 3;
      const fg = ctx.createLinearGradient(0, 12, 0, 16 + f);
      fg.addColorStop(0, gold ? '#fde047' : '#a5f3fc'); fg.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(0, 16 + f); ctx.lineTo(4, 12); ctx.fill();
    }
    const main = captive ? '#fb7185' : gold ? '#fbbf24' : '#f8fafc';
    const accent = captive ? '#9f1239' : gold ? '#b45309' : WEAPONS[this.weapon].color;
    ctx.shadowColor = captive ? '#f43f5e' : gold ? '#fbbf24' : '#22d3ee'; ctx.shadowBlur = gold ? 20 : 12;
    // wings
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-17, 10); ctx.lineTo(-17, 14); ctx.lineTo(-4, 11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(17, 10); ctx.lineTo(17, 14); ctx.lineTo(4, 11); ctx.closePath(); ctx.fill();
    // wing-tip cannons
    ctx.fillStyle = main; ctx.fillRect(-18, 2, 3, 12); ctx.fillRect(15, 2, 3, 12);
    // fuselage
    const bg = ctx.createLinearGradient(-6, 0, 6, 0);
    if (gold) { bg.addColorStop(0, '#b45309'); bg.addColorStop(0.5, '#fef3c7'); bg.addColorStop(1, '#d97706'); }
    else if (captive) { bg.addColorStop(0, '#9f1239'); bg.addColorStop(0.5, '#fecdd3'); bg.addColorStop(1, '#be123c'); }
    else { bg.addColorStop(0, '#94a3b8'); bg.addColorStop(0.5, '#ffffff'); bg.addColorStop(1, '#cbd5e1'); }
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(7, -4, 6, 14); ctx.lineTo(-6, 14); ctx.quadraticCurveTo(-7, -4, 0, -20); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent; ctx.fillRect(-6, 8, 12, 3);
    // cockpit
    ctx.fillStyle = captive ? '#4c0519' : '#0e7490';
    ctx.beginPath(); ctx.ellipse(0, -5, 3, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-1, -7, 1, 2.5, 0, 0, TAU); ctx.fill();
    if (gold) {
      const sp = (t * 1.2) % 3;
      if (sp < 1) { ctx.globalAlpha = Math.sin(sp * Math.PI); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(2, -18); ctx.lineTo(0, -12); ctx.lineTo(-2, -18); ctx.fill(); ctx.globalAlpha = 1; }
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
//  GALACTIC ALIEN SHOOTER — classic formation shooter
//  L1  aliens swoop in and line up; blast them all      L2  aliens start diving at you
//  L3  Queens fire a TRACTOR BEAM that can capture your ship. Shoot that Queen
//      while she's diving to rescue it → DOUBLE FIGHTER (twin fire!)
//  L4  divers shoot back                                  L5  ★ bonus: Challenging Stage
//  L6  glowing drones split into three mid-dive           L7  Queens dive with escorts
//  L8+ faster, more divers, more shots
//  Golden unlock: hit all 40 aliens in a Challenging Stage → GOLDEN STARFIGHTER
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';
import { Store } from '../../assets/js/storage.js';

const ID = 'galactic-alien-shooter';
const W = 480, H = 720;
const PY = H - 74;                 // player row
const SHIP_R = 13, TWIN = 15;      // hit radius, half-gap of the double fighter
const GRID_DX = 40, GRID_DY = 38, GRID_TOP = 100;
const TAU = Math.PI * 2;

const TYPES = {
  drone:   { r: 15, hp: 1, form: 10, dive: 20, color: '#fde047' },
  stinger: { r: 16, hp: 1, form: 16, dive: 32, color: '#fb7185' },
  queen:   { r: 19, hp: 2, form: 30, dive: 80, color: '#34d399' },
  shard:   { r: 9,  hp: 1, form: 12, dive: 12, color: '#f0abfc' },
};

const BEAM = { grow: 0.5, hold: 1.9, shrink: 0.5 };

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 1.6,
  comboStep: 4,
  maxMultiplier: 6,
  bonusTime: 15,
  music: { bpm: 138, style: 'minor', lead: 'square' },
  levelInfo(level, bonus) {
    if (bonus) return 'CHALLENGING STAGE! You can\'t be hit — shoot all 40 for a PERFECT bonus ✨';
    const notes = {
      1: 'Move: mouse / arrows. Hold SPACE or the mouse button to fire!',
      2: 'The aliens start DIVING at you — dodge and blast!',
      3: '👑 Queens use a TRACTOR BEAM! Caught? Shoot that Queen as she dives to win it back for DOUBLE FIRE.',
      4: 'Divers shoot back now!',
      6: '💥 Glowing drones SPLIT into three mid-dive!',
      7: 'Queens dive with an escort — down all three for a SQUAD BONUS!',
    };
    return notes[level] || `Clear the whole swarm · faster!`;
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

// Entry paths (s = -1 from the left, +1 from the right). Each ends near the formation; the alien then homes in on its slot.
const ENTRY = [
  (s) => [[W / 2 + s * 40, -30], [W / 2 + s * 80, 140], [W / 2 + s * 120, 300],
    ...loop(W / 2 + s * 40, 300, 80, s > 0 ? 0 : Math.PI, 1, s), [W / 2 + s * 60, 230]],
  (s) => [[s > 0 ? W + 30 : -30, 560], [W / 2 + s * 130, 500], [W / 2 + s * 40, 450],
    ...loop(W / 2 - s * 20, 390, 60, Math.PI / 2, 1, -s, 14), [W / 2, 300]],
];

// Challenging-stage fly-through paths
const CHALLENGE = [
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
  const queens = level === 1 ? [4, 5] : [3, 4, 5, 6];
  for (const c of queens) list.push({ type: 'queen', row: 0, col: c });
  const stingerRows = level === 1 ? [1] : [1, 2];
  for (const r of stingerRows) for (let c = 1; c <= 8; c++) list.push({ type: 'stinger', row: r, col: c });
  const droneRows = level <= 2 ? [3] : [3, 4];
  for (const r of droneRows) for (let c = 0; c <= 9; c++) list.push({ type: 'drone', row: r, col: c });
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

  // Golden ship: earned here (perfect Challenging Stage) or as a Legend. The menu's ON/OFF switch applies to both.
  get golden() { return this.s.gold || (Store.hasAch(`${ID}:golden`) && Store.setting(`gold:${ID}`) !== false); }

  reset() {
    this.ship.x = this.ship.tx = W / 2;
    this.dual = false; this.invuln = 0; this.dead = false;
    this.capture = null; this.rescue = null; this.shipHidden = false;
    this.nextLife = 20000;
    this.runShots = 0; this.runHits = 0;
  }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.speedK = s.speed(0.065, 2.2, level);
    this.aliens = []; this.bullets = []; this.enemyShots = []; this.shards = [];
    this.waveQ = []; this.formT = 0; this.arrived = false;
    this.diveT = 2.5; this.fireT = 0; this.hasFired = false;
    this.shots = 0; this.hits = 0;
    this.capture = null; this.rescue = null; this.shipHidden = false;
    this.beamQueen = null;
    this.bonusHits = 0; this.bonusTotal = 0; this.perfectDone = false;

    if (bonus) {
      // 5 groups of 8, each as two mirrored streams
      const types = ['drone', 'stinger', 'drone', 'queen', 'stinger'];
      this.bonusTotal = 40;
      for (let g = 0; g < 5; g++) {
        const members = [];
        for (let k = 0; k < 8; k++) {
          const side = k % 2 ? 1 : -1;
          members.push({ a: this.makeAlien(types[g], -1, -1), path: CHALLENGE[g](side), delay: Math.floor(k / 2) * 0.17 });
        }
        this.waveQ.push({ t: 0.4 + g * 2.1, members });
      }
      return;
    }

    const slots = formationFor(level);
    const chunks = [];
    for (let i = 0; i < slots.length; i += 8) chunks.push(slots.slice(i, i + 8));
    const gap = 1.9 / Math.sqrt(this.speedK);
    chunks.forEach((chunk, i) => {
      const pathFn = ENTRY[i % 2];
      const side = Math.floor(i / 2) % 2 ? 1 : -1;
      const members = chunk.map((sl, k) => {
        const a = this.makeAlien(sl.type, sl.row, sl.col);
        a.split = level >= 6 && sl.type === 'drone' && s.rng.chance(Math.min(0.45, 0.2 + (level - 6) * 0.04));
        return { a, path: pathFn(k % 2 && i % 2 ? -side : side), delay: k * 0.13 };
      });
      this.waveQ.push({ t: 0.5 + i * gap, members });
    });
  }

  makeAlien(type, row, col) {
    const T = TYPES[type];
    return {
      id: this.idN++, type, row, col, r: T.r, hp: T.hp, x: -100, y: -100,
      state: 'wait', path: null, pi: 0, heading: Math.PI / 2, flash: 0, dead: false,
      captive: false, split: false, shotsAt: [], diveTime: 0,
    };
  }

  // ── Formation geometry ─────────────────────────────────────
  slot(a) {
    const breathe = this.arrived ? 1 + Math.sin(this.formT * 1.7) * 0.07 : 1;
    const sway = this.arrived ? 0 : Math.sin(this.t * 0.9) * 26;
    return {
      x: W / 2 + (a.col - 4.5) * GRID_DX * breathe + sway,
      y: GRID_TOP + a.row * GRID_DY * (0.6 + breathe * 0.4),
    };
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x) {
    if (a === 'press') this.drag = { px: x, sx: this.ship.tx };
    if (a === 'release') this.drag = null;
  }
  onPointerMove(x, y, down) {
    if (down && this.drag) this.ship.tx = this.drag.sx + (x - this.drag.px) * 1.3;
    else if (!down) this.ship.tx = x;
  }

  idle(dt) { this.t += dt; this.cosmetic(dt); }

  cosmetic(dt) {
    if (!this.meteor && Math.random() < dt * 0.15) this.meteor = { x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 300, vy: 520, life: 1.4 };
    if (this.meteor) { const m = this.meteor; m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt; if (m.life <= 0) this.meteor = null; }
  }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s, sh = this.ship, L = this.level;
    this.t += dt; this.formT += dt;
    this.cosmetic(dt);
    this.invuln = Math.max(0, this.invuln - dt);

    // Player
    if (!this.capture) {
      const kx = (s.input.isDown('right') ? 1 : 0) - (s.input.isDown('left') ? 1 : 0);
      if (kx) { sh.tx = sh.x + kx * 1600 * dt; this.drag = null; }
      const edge = this.dual ? 24 + TWIN : 24;
      sh.tx = clamp(sh.tx, edge, W - edge);
      const px = sh.x;
      sh.x += (sh.tx - sh.x) * Math.min(1, dt * 16);
      sh.tilt = clamp((sh.x - px) / dt / 1100, -0.35, 0.35);

      this.fireT -= dt;
      const trigger = s.input.isDown('action') || s.input.pointer.down;
      const maxShots = this.dual ? 8 : 4;
      if (trigger && this.fireT <= 0 && this.bullets.length < maxShots && !this.shipHidden) {
        this.hasFired = true;
        this.fireT = 0.16;
        const xs = this.dual ? [sh.x - TWIN, sh.x + TWIN] : [sh.x];
        for (const x of xs) this.bullets.push({ x, y: PY - 20, vy: -780 });
        this.shots += xs.length; this.runShots += xs.length;
        s.sound.tone({ freq: 1800, to: 700, dur: 0.05, type: 'square', vol: 0.03 });
      }
    }
    for (const b of this.bullets) b.y += b.vy * dt;
    this.bullets = this.bullets.filter((b) => b.y > -20 && !b.hit);

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

    // Aliens
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
        if (d <= v + 0.5) { a.x = p.x; a.y = p.y; a.state = 'form'; }
        else { a.x += dx / d * v; a.y += dy / d * v; }
      } else if (a.state === 'form') {
        const p = this.slot(a); a.x = p.x; a.y = p.y;
      } else if (a.state === 'dive') {
        a.diveTime += dt;
        if (this.follow(a, dt, diveSpeed * (a.type === 'shard' ? 1.3 : 1))) {
          if (a.type === 'shard') { a.dead = true; a.escaped = true; continue; }
          if (a.beamDive) { a.state = 'beam'; a.beamT = 0; this.beamQueen = a; }
          else { a.state = 'return'; a.x = this.slot(a).x; a.y = -30; }
        }
        // enemy fire
        while (a.shotsAt.length && a.diveTime >= a.shotsAt[0]) {
          a.shotsAt.shift();
          if (a.y < PY - 140 && a.y > 0) this.enemyFire(a);
        }
        // splitters burst into three
        if (a.split && a.y > H * 0.36) this.splitAlien(a);
      } else if (a.state === 'beam') {
        this.updateBeam(a, dt);
      }

      // heading for drawing
      const mx = a.x - ox, my = a.y - oy;
      const target = a.state === 'form' || a.state === 'beam' ? Math.PI / 2 : (mx * mx + my * my > 0.01 ? Math.atan2(my, mx) : a.heading);
      let d = target - a.heading; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      a.heading += d * Math.min(1, dt * 12);

      // collisions with the player (diving aliens only; bonus rounds are safe)
      if (!this.bonus && (a.state === 'dive' || a.state === 'return') && !this.invuln && !this.capture && !this.shipHidden) {
        const hitX = this.touchesShip(a.x, a.y, a.r * 0.8);
        if (hitX !== null) { this.killAlien(a, false); if (this.crash(hitX)) return; }
      }
    }
    this.aliens = this.aliens.filter((a) => !a.dead);

    // Bullets vs aliens
    for (const b of this.bullets) {
      if (b.hit) continue;
      for (const a of this.aliens) {
        if (a.dead || a.state === 'wait') continue;
        if (a.captive && (b.x - a.x) ** 2 + (b.y - (a.y - 32)) ** 2 < 14 ** 2) { b.hit = true; this.shootCaptive(a); break; }
        if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 < (a.r + 4) ** 2) { b.hit = true; this.hitAlien(a); break; }
      }
    }

    // Formation arrival + dives
    if (!this.bonus) {
      const alive = this.aliens.filter((a) => !a.dead);
      if (!this.arrived && this.waveQ.every((w) => w.done) && alive.every((a) => a.state !== 'wait' && a.state !== 'enter' && a.state !== 'home')) {
        this.arrived = true; this.formT = 0;
      }
      if (this.arrived && L >= 1) {
        this.diveT -= dt;
        if (this.diveT <= 0) {
          let gap = L === 1 ? 4.2 : Math.max(0.5, 2.7 / this.speedK - L * 0.04);
          if (alive.length <= 6) gap *= 0.55;
          this.diveT = gap * this.s.rng.range(0.7, 1.3);
          this.startDive();
        }
      }
      if (this.waveQ.every((w) => w.done) && alive.length === 0 && !this.capture && !this.rescue) this.levelDone();
    } else {
      // Challenging stage: finish early when every alien is shot or gone
      if (this.waveQ.every((w) => w.done) && this.aliens.every((a) => a.dead)) {
        this.awardPerfect();
        s.completeLevel();
        return;
      }
    }

    // Enemy shots
    for (const e of this.enemyShots) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (!this.invuln && !this.capture && !this.shipHidden && !e.gone) {
        const hitX = this.touchesShip(e.x, e.y, 4);
        if (hitX !== null) { e.gone = true; if (this.crash(hitX)) return; }
      }
    }
    this.enemyShots = this.enemyShots.filter((e) => !e.gone && e.y < H + 20 && e.x > -20 && e.x < W + 20);

    // Capture animation (ship pulled up into the beam)
    if (this.capture) {
      const c = this.capture; c.t += dt;
      const k = Math.min(1, c.t / 1.3);
      c.x = c.sx + (c.q.x - c.sx) * k; c.y = PY + (c.q.y + 32 - PY) * k; c.spin += dt * 9;
      if (c.q.dead) { this.capture = null; this.invuln = 1.5; return; }
      if (c.t >= 1.5) {
        c.q.captive = true; c.q.state = 'return'; c.q.beamDive = false;
        this.beamQueen = null; this.capture = null; this.shipHidden = true;
        s.fx.text(W / 2, H * 0.45, 'FIGHTER CAPTURED', { color: '#f43f5e', size: 28, life: 1.4 });
        if (s.lives <= 1) this.dead = true;
        s.hurt();
        return;
      }
    }

    // Rescued ship floating down to dock
    if (this.rescue) {
      const r = this.rescue; r.spin += dt * 10;
      const tx = sh.x + TWIN, ty = PY;
      const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy), v = 330 * dt;
      if (d <= v) {
        this.rescue = null; this.dual = true;
        sh.x = clamp(sh.x - TWIN, 24 + TWIN, W - 24 - TWIN); sh.tx = sh.x;
        s.sound.play('powerup'); s.unlock('rescue');
        s.fx.text(sh.x, PY - 50, 'DOUBLE FIGHTER!', { color: '#22d3ee', size: 26, life: 1.3 });
        s.fx.ring(sh.x, PY, { color: '#22d3ee', radius: 70, width: 5 });
        s.fx.burst(sh.x, PY, { colors: ['#22d3ee', '#fff', '#a78bfa'], count: 40, speed: 260 });
      } else { r.x += dx / d * v; r.y += dy / d * v; }
    }

    // Extra lives
    if (s.score >= this.nextLife) {
      this.nextLife = this.nextLife < 20001 ? 60000 : this.nextLife + 60000;
      if (s.lives < 5) {
        s.lives++; s.updateHud?.();
        s.sound.play('life');
        s.fx.text(W / 2, H * 0.36, '1UP!', { color: '#4ade80', size: 34, life: 1.2 });
      }
    }

    // Engine exhaust
    if (!this.shipHidden && !this.capture && Math.random() < 0.7) {
      const xs = this.dual ? [sh.x - TWIN, sh.x + TWIN] : [sh.x];
      for (const x of xs) s.fx.burst(x + (Math.random() - 0.5) * 4, PY + 17, { colors: this.golden ? ['#fde047', '#fbbf24', '#fff'] : ['#22d3ee', '#a78bfa', '#f472b6'], count: 1, speed: 80, life: 0.3, size: 2.5, angle: Math.PI / 2, spread: 0.4 });
    }
  }

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
    const xs = this.dual ? [this.ship.x - TWIN, this.ship.x + TWIN] : [this.ship.x];
    for (const sx of xs) if ((x - sx) ** 2 + (y - PY) ** 2 < (r + SHIP_R) ** 2) return sx;
    return null;
  }

  // ── Dives ──────────────────────────────────────────────────
  divePath(a, px, offX = 0, offY = 0) {
    const r = this.s.rng;
    const sd = a.x < W / 2 ? -1 : 1;
    const pts = loop(a.x + sd * 26, a.y, 26, sd > 0 ? Math.PI : 0, 0.5, sd, 8);
    const aim = clamp(px + r.range(-40, 40), 30, W - 30);
    const wig = a.type === 'drone' ? 60 : 90;
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
    const diving = this.aliens.filter((a) => !a.dead && (a.state === 'dive' || a.state === 'beam')).length;
    const maxDivers = L === 1 ? 1 : Math.min(6, 1 + Math.floor(L / 2));
    if (!inForm.length || diving >= maxDivers) return;

    // Queens carrying a captured fighter love to dive — giving you the chance to rescue it
    const captiveQ = inForm.find((a) => a.captive);
    let a;
    if (captiveQ && s.rng.chance(0.5)) a = captiveQ;
    else {
      const queens = inForm.filter((q) => q.type === 'queen');
      if (L >= 3 && queens.length && s.rng.chance(0.3)) a = s.rng.pick(queens);
      else a = s.rng.pick(inForm);
    }
    const px = this.ship.x;
    const anyCaptive = this.aliens.some((q) => !q.dead && q.captive);
    const canBeam = L >= 3 && a.type === 'queen' && !a.captive && !this.dual && !anyCaptive && !this.beamQueen && !this.capture && !this.rescue && s.rng.chance(0.5);

    a.state = 'dive'; a.pi = 0; a.diveTime = 0; a.beamDive = canBeam;
    if (canBeam) {
      const sd = a.x < W / 2 ? -1 : 1;
      a.path = [...loop(a.x + sd * 26, a.y, 26, sd > 0 ? Math.PI : 0, 0.5, sd, 8), [clamp(px, 40, W - 40), H * 0.3], [clamp(px, 40, W - 40), H * 0.5]];
      this.beamQueen = a;
      return;
    }
    a.path = this.divePath(a, px);
    this.planShots(a);

    // Escorts (L7+): a Queen dives with up to two stingers
    if (a.type === 'queen' && L >= 7) {
      const escorts = inForm.filter((e) => e.type === 'stinger' && e.row === 1 && Math.abs(e.col - a.col) <= 2 && e !== a)
        .sort((p, q) => Math.abs(p.col - a.col) - Math.abs(q.col - a.col)).slice(0, 2);
      const squad = { size: escorts.length + 1, killed: 0 };
      a.squad = squad;
      escorts.forEach((e, i) => {
        e.state = 'dive'; e.pi = 0; e.diveTime = 0; e.beamDive = false; e.squad = squad;
        e.path = a.path.map(([x, y]) => [x + (i ? 28 : -28), y + 22]);
        e.x = a.x + (i ? 28 : -28); e.y = a.y + 22;
        this.planShots(e);
      });
    }
    s.sound.tone({ freq: 700, to: 250, dur: 0.35, type: 'triangle', vol: 0.05 });
  }

  planShots(a) {
    const L = this.level;
    a.shotsAt = [];
    if (L < 4) return;
    const n = L >= 8 ? 2 : 1;
    if (!this.s.rng.chance(Math.min(0.85, 0.4 + (L - 4) * 0.07))) return;
    for (let i = 0; i < n; i++) a.shotsAt.push(0.55 + i * 0.28 + this.s.rng.range(0, 0.3));
  }

  enemyFire(a) {
    const sh = this.ship;
    const vy = 260 * Math.min(1.5, Math.sqrt(this.speedK));
    const tt = (PY - a.y) / vy;
    const vx = clamp((sh.x - a.x) / tt, -120, 120);
    this.enemyShots.push({ x: a.x, y: a.y + 10, vx, vy });
    this.s.sound.tone({ freq: 500, to: 1100, dur: 0.08, type: 'sawtooth', vol: 0.04 });
  }

  splitAlien(a) {
    const s = this.s;
    a.split = false; a.dead = true;
    s.sound.tone({ freq: 400, to: 1600, dur: 0.18, type: 'square', vol: 0.06 });
    s.fx.ring(a.x, a.y, { color: '#f0abfc', radius: 36 });
    s.fx.text(a.x, a.y - 20, 'SPLIT!', { color: '#f0abfc', size: 18 });
    const trio = { size: 3, killed: 0 };
    for (const dx of [-1, 0, 1]) {
      const sh = this.makeAlien('shard', -1, -1);
      sh.x = a.x; sh.y = a.y; sh.state = 'dive'; sh.pi = 0; sh.trio = trio;
      const tx = clamp(this.ship.x + dx * 110, 20, W - 20);
      sh.path = [[a.x + dx * 60, a.y + 60], [tx, PY - 60], [tx + dx * 40, H + 30]];
      this.aliens.push(sh);
    }
  }

  updateBeam(q, dt) {
    const s = this.s;
    q.beamT += dt;
    const total = BEAM.grow + BEAM.hold + BEAM.shrink;
    if (Math.floor(q.beamT * 8) !== Math.floor((q.beamT - dt) * 8)) s.sound.tone({ freq: 220 + (Math.floor(q.beamT * 8) % 4) * 60, dur: 0.12, type: 'sine', vol: 0.05 });
    const full = q.beamT > BEAM.grow && q.beamT < BEAM.grow + BEAM.hold;
    if (full && !this.capture && !this.invuln && !this.dual && !this.shipHidden && Math.abs(this.ship.x - q.x) < 30) {
      this.capture = { q, t: 0, sx: this.ship.x, x: this.ship.x, y: PY, spin: 0 };
      this.bullets = [];
      s.sound.tone({ freq: 900, to: 200, dur: 1.2, type: 'triangle', vol: 0.08 });
    }
    if (q.beamT >= total && !this.capture) { q.state = 'return'; q.beamDive = false; this.beamQueen = null; }
  }

  beamFrac(q) {
    const t = q.beamT;
    if (t < BEAM.grow) return t / BEAM.grow;
    if (t < BEAM.grow + BEAM.hold) return 1;
    if (this.capture?.q === q) return 1;
    return Math.max(0, 1 - (t - BEAM.grow - BEAM.hold) / BEAM.shrink);
  }

  // ── Hits and scoring ───────────────────────────────────────
  hitAlien(a) {
    const s = this.s;
    this.hits++; this.runHits++;
    a.hp--; a.flash = 1;
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
    const color = a.type === 'queen' ? '#34d399' : T.color;

    if (this.beamQueen === a) this.beamQueen = null;

    if (byPlayer) {
      let base;
      if (this.bonus) { base = 20; this.bonusHits++; }
      else base = inForm ? T.form : T.dive;
      s.award(base * L, a.x, a.y - a.r, { chain: true, color, size: inForm ? 16 : 20 });
    }
    s.sound.play('brick', Math.min(16, s.comboCount));
    s.sound.noise({ dur: 0.16, vol: 0.16, freq: 1800, to: 200 });
    s.fx.burst(a.x, a.y, { colors: [color, '#fff', '#22d3ee'], count: a.type === 'queen' ? 34 : 18, speed: a.type === 'queen' ? 280 : 200, life: 0.6 });
    s.fx.ring(a.x, a.y, { color, radius: a.r * 2.2, life: 0.35, width: 2 });
    if (a.type === 'queen') s.fx.shake(5, 0.2);

    if (!byPlayer || this.bonus) return;

    // Captured fighter: rescue it if the Queen was out of formation
    if (a.captive) {
      a.captive = false;
      if (!inForm && !this.capture && !this.dual && !this.shipHidden) {
        this.rescue = { x: a.x, y: a.y - 32, spin: 0 };
        s.fx.text(a.x, a.y - 60, 'RESCUED!', { color: '#22d3ee', size: 24 });
      } else {
        s.fx.text(a.x, a.y - 50, 'Fighter lost…', { color: '#fb7185', size: 18 });
        s.fx.burst(a.x, a.y - 32, { colors: ['#fb7185', '#fff'], count: 20, speed: 200 });
      }
    }
    // Squad (queen + escorts) bonus
    if (a.squad && !inForm) {
      a.squad.killed++;
      if (a.squad.size >= 3 && a.squad.killed === a.squad.size) {
        s.award(300 * L, a.x, a.y - 50, { color: '#fbbf24', size: 26 });
        s.fx.text(a.x, a.y - 80, 'SQUAD BONUS!', { color: '#fbbf24', size: 22 });
        s.sound.play('golden'); s.unlock('squad');
      }
    }
    // Split trio bonus
    if (a.trio) {
      a.trio.killed++;
      if (a.trio.killed === 3) {
        s.award(150 * L, a.x, a.y - 40, { color: '#f0abfc', size: 22 });
        s.fx.text(a.x, a.y - 70, 'TRIPLE!', { color: '#f0abfc', size: 20 });
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
      const wasGolden = this.golden;
      s.unlock('golden');
      if (!wasGolden && this.golden) s.fx.text(W / 2, H * 0.68, '✨ GOLDEN STARFIGHTER UNLOCKED ✨', { color: '#fbbf24', size: 20, life: 2.2, rise: 10 });
    } else {
      s.fx.text(W / 2, H * 0.3, `Hits ${n} / ${this.bonusTotal}`, { color: '#c4b5fd', size: 30, life: 1.4, rise: 10 });
    }
  }

  onLevelClear() { if (this.bonus) this.awardPerfect(); }

  /** Returns true if the game should stop updating this frame. */
  crash(hitX) {
    const s = this.s;
    s.fx.burst(hitX, PY, { colors: ['#f472b6', '#22d3ee', '#fde047', '#fff'], count: 60, speed: 320, life: 0.9 });
    s.fx.ring(hitX, PY, { color: '#f472b6', radius: 80 });
    if (this.dual) {
      // lose one half of the double fighter instead of a life
      this.dual = false; this.invuln = 1.3;
      this.ship.x = this.ship.tx = hitX < this.ship.x ? this.ship.x + TWIN : this.ship.x - TWIN;
      s.sound.play('hit'); s.fx.shake(8, 0.3);
      s.fx.text(this.ship.x, PY - 50, 'Wing lost!', { color: '#fb7185', size: 20 });
      s.resetCombo();
      return false;
    }
    s.sound.play('boom');
    if (s.lives <= 1) this.dead = true;
    s.hurt();
    return true;
  }

  onLifeLost() {
    this.enemyShots = []; this.bullets = [];
    this.aliens = this.aliens.filter((a) => a.type !== 'shard');
    for (const a of this.aliens) {
      if (a.dead) continue;
      if (a.state === 'dive' || a.state === 'beam') { a.state = 'return'; a.beamDive = false; a.x = this.slot(a).x; a.y = -30; }
    }
    this.beamQueen = null; this.capture = null; this.rescue = null;
    this.shipHidden = false; this.dual = false;
    this.ship.x = this.ship.tx = W / 2;
    this.invuln = 2.2; this.diveT = 1.5;
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const t = this.t, s = this.s;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#1e0b3a'); g.addColorStop(1, '#3b0a3a'); }
    else { g.addColorStop(0, '#02030d'); g.addColorStop(0.6, '#07092a'); g.addColorStop(1, '#120a2e'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebulas) {
      const y = ((n.y + t * 6) % (H + 400)) - 200;
      const ng = ctx.createRadialGradient(n.x, y, 0, n.x, y, n.r);
      ng.addColorStop(0, `hsla(${this.bonus ? (n.hue + t * 50) % 360 : n.hue}, 90%, 50%, .13)`); ng.addColorStop(1, 'hsla(0,0%,0%,0)');
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

    // Tractor beam (under the aliens)
    for (const a of this.aliens) if (!a.dead && a.state === 'beam') this.drawBeam(ctx, a, t);

    // Aliens
    for (const a of this.aliens) {
      if (a.dead || a.state === 'wait') continue;
      if (a.captive) this.drawFighter(ctx, a.x, a.y - 32, Math.PI + Math.sin(t * 3) * 0.1, t, { captive: true });
      this.drawAlien(ctx, a, t);
    }

    // Enemy shots
    for (const e of this.enemyShots) {
      ctx.save(); ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#fecdd3';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 3, 7, Math.atan2(e.vy, e.vx) - Math.PI / 2, 0, TAU); ctx.fill(); ctx.restore();
    }

    // Player bullets
    const gold = this.golden;
    ctx.save(); ctx.shadowColor = gold ? '#fbbf24' : '#22d3ee'; ctx.shadowBlur = 12;
    ctx.strokeStyle = gold ? '#fef3c7' : '#e0f2fe'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of this.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 14); }
    ctx.stroke(); ctx.restore();

    // Player
    if (this.capture) {
      const c = this.capture;
      this.drawFighter(ctx, c.x, c.y, c.spin, t, { captive: c.t > 0.8 });
    } else if (!this.shipHidden && !this.dead && !(this.invuln && Math.floor(t * 14) % 2)) {
      const sh = this.ship;
      if (this.dual) {
        this.drawFighter(ctx, sh.x - TWIN, PY, sh.tilt, t, { flame: true });
        this.drawFighter(ctx, sh.x + TWIN, PY, sh.tilt, t, { flame: true });
      } else this.drawFighter(ctx, sh.x, PY, sh.tilt, t, { flame: true });
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
    ctx.fillStyle = 'rgba(3,5,20,.78)'; ctx.fillRect(0, 0, W, 44);
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 28, 20, this.s.bonusLeft / 15, '#e879f9', `★ CHALLENGING STAGE · hits ${this.bonusHits} / ${this.bonusTotal} · ${Math.ceil(this.s.bonusLeft)}s`);
    } else {
      const total = formationFor(this.level).length;
      const left = this.aliens.filter((a) => !a.dead && a.type !== 'shard').length + this.waveQ.filter((w) => !w.done).reduce((n, w) => n + w.members.length, 0);
      progressBar(ctx, 14, 12, W - 28, 20, (total - left) / total, '#22d3ee', `Aliens ${total - left} / ${total}`);
    }
    ctx.save(); ctx.font = '700 12px system-ui'; ctx.textBaseline = 'bottom';
    if (this.dual) { ctx.fillStyle = '#22d3ee'; ctx.textAlign = 'left'; ctx.fillText('⚡ DOUBLE FIGHTER', 12, H - 8); }
    if (this.shots >= 10 && !this.bonus) {
      ctx.fillStyle = 'rgba(165,243,252,.7)'; ctx.textAlign = 'right';
      ctx.fillText(`Accuracy ${Math.round(this.hits / this.shots * 100)}%`, W - 12, H - 8);
    }
    if (gold) { ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.fillText('★ GOLDEN STARFIGHTER', W / 2, H - 8); }
    ctx.restore();
  }

  drawBeam(ctx, q, t) {
    const f = this.beamFrac(q);
    if (f <= 0) return;
    const top = q.y + 16, bot = top + (PY + 34 - top) * f;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createLinearGradient(0, top, 0, bot);
    bg.addColorStop(0, 'rgba(129,140,248,.55)'); bg.addColorStop(1, 'rgba(34,211,238,.25)');
    ctx.fillStyle = bg;
    const hw = (y) => 10 + (y - top) / (PY + 34 - top) * 40;
    ctx.beginPath(); ctx.moveTo(q.x - 10, top); ctx.lineTo(q.x + 10, top); ctx.lineTo(q.x + hw(bot), bot); ctx.lineTo(q.x - hw(bot), bot); ctx.closePath(); ctx.fill();
    // scanning bands
    for (let i = 0; i < 8; i++) {
      const y = top + ((i / 8 + t * 0.9) % 1) * (bot - top);
      const w = hw(y);
      ctx.strokeStyle = `hsla(${200 + i * 20 + t * 120}, 100%, 70%, .7)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(q.x - w, y); ctx.quadraticCurveTo(q.x, y + 8, q.x + w, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawAlien(ctx, a, t) {
    const flap = a.state === 'form' ? Math.sin(t * 4 + a.col) : Math.sin(t * 14 + a.id);
    const rot = a.heading + Math.PI / 2 + Math.PI; // sprite drawn facing up; turn to face travel direction (formation → down)
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(rot);
    const white = a.flash > 0;
    if (a.type === 'drone') {
      const glow = a.split ? '#f0abfc' : '#fde047';
      ctx.shadowColor = glow; ctx.shadowBlur = a.split ? 16 + Math.sin(t * 10) * 6 : 10;
      // wings
      ctx.fillStyle = 'rgba(125,211,252,.75)';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 9, 2, 9, 4 + flap * 2.5, sd * (0.5 + flap * 0.25), 0, TAU); ctx.fill(); }
      // body
      const bg = ctx.createLinearGradient(0, -12, 0, 12);
      bg.addColorStop(0, a.split ? '#f5d0fe' : '#fef08a'); bg.addColorStop(1, a.split ? '#c026d3' : '#f59e0b');
      ctx.fillStyle = white ? '#fff' : bg;
      ctx.beginPath(); ctx.ellipse(0, 3, 7, 10, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2;
      for (const y of [3, 8]) { ctx.beginPath(); ctx.moveTo(-6, y); ctx.lineTo(6, y); ctx.stroke(); }
      // head
      ctx.fillStyle = white ? '#fff' : '#ef4444';
      ctx.beginPath(); ctx.arc(0, -9, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -11, 2, 2); ctx.fillRect(1, -11, 2, 2);
      ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-2, -13); ctx.lineTo(-5, -17); ctx.moveTo(2, -13); ctx.lineTo(5, -17); ctx.stroke();
    } else if (a.type === 'stinger') {
      ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 12;
      for (const sd of [-1, 1]) {
        const wg = ctx.createLinearGradient(0, 0, sd * 18, 0);
        wg.addColorStop(0, '#be123c'); wg.addColorStop(1, '#60a5fa');
        ctx.fillStyle = white ? '#fff' : wg;
        ctx.beginPath(); ctx.moveTo(sd * 3, -6); ctx.lineTo(sd * (17 + flap * 2), -10 - flap * 4); ctx.lineTo(sd * (15 + flap), 8); ctx.lineTo(sd * 3, 6); ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = white ? '#fff' : '#e0e7ff';
      ctx.beginPath(); ctx.ellipse(0, 1, 4.5, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1d4ed8'; ctx.beginPath(); ctx.ellipse(0, 4, 3, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#fb7185';
      ctx.beginPath(); ctx.arc(0, -9, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-3, -12); ctx.quadraticCurveTo(-6, -17, -2, -19); ctx.moveTo(3, -12); ctx.quadraticCurveTo(6, -17, 2, -19); ctx.stroke();
    } else if (a.type === 'queen') {
      const hurt = a.hp < 2;
      const c1 = hurt ? '#c084fc' : '#34d399', c2 = hurt ? '#6d28d9' : '#047857';
      ctx.shadowColor = c1; ctx.shadowBlur = 18;
      for (const sd of [-1, 1]) {
        ctx.fillStyle = white ? '#fff' : hurt ? 'rgba(167,139,250,.85)' : 'rgba(45,212,191,.85)';
        ctx.beginPath(); ctx.moveTo(sd * 6, -2); ctx.quadraticCurveTo(sd * (24 + flap * 3), -16 - flap * 5, sd * (22 + flap * 2), 6); ctx.quadraticCurveTo(sd * 14, 12, sd * 6, 8); ctx.closePath(); ctx.fill();
      }
      const hg = ctx.createRadialGradient(-3, -6, 1, 0, 0, 14);
      hg.addColorStop(0, hurt ? '#f5d0fe' : '#bbf7d0'); hg.addColorStop(0.5, c1); hg.addColorStop(1, c2);
      ctx.fillStyle = white ? '#fff' : hg;
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      // crown
      ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-6, -19); ctx.lineTo(-3, -12); ctx.lineTo(0, -21); ctx.lineTo(3, -12); ctx.lineTo(6, -19); ctx.lineTo(8, -10); ctx.closePath(); ctx.fill();
      // eyes
      ctx.fillStyle = '#fef08a'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(-4, -3, 2.5, 3.5, 0.3, 0, TAU); ctx.ellipse(4, -3, 2.5, 3.5, -0.3, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(0, 9); ctx.lineTo(5, 6); ctx.stroke();
    } else if (a.type === 'shard') {
      ctx.rotate(t * 8);
      ctx.shadowColor = '#f0abfc'; ctx.shadowBlur = 14; ctx.fillStyle = white ? '#fff' : '#f0abfc';
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
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
    const accent = captive ? '#9f1239' : gold ? '#b45309' : '#ef4444';
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


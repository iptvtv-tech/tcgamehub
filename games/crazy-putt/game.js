// ─────────────────────────────────────────────────────────────
//  CRAZY PUTT — crazy golf with hidden traps
//  Aim with the mouse / finger (or ← →), HOLD to build power, RELEASE to putt.
//  Every hole looks easy… but some grass hides a trap you only see when you hit it:
//    • hidden sand (ball stops dead)       • trapdoors (back to the tee, +1 stroke)
//    • sneaky speed pads (ball shoots off)  • fake holes (BOING! – spits the ball out)
//  Visible hazards: water, sand, bumpers, windmills, sliding blockers, conveyors.
//  Hole-in-one = huge bonus.  Every 5th level: Hole-in-One Frenzy bonus round.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const W = 480, H = 720, TOP = 44;
const R = 7;            // ball radius
const CUP_R = 11;       // hole radius
const MAX_SPEED = 900;  // fastest putt (px/s)
const CHARGE_TIME = 1.15; // seconds of holding for full power

const THEMES = [
  { name: 'park',  bg: ['#7dd3fc', '#bbf7d0'], deco: '#fef08a', green: ['#22c55e', '#16a34a'], border: '#92400e', borderHi: '#b45309', flag: '#ef4444' },
  { name: 'candy', bg: ['#fbcfe8', '#f9a8d4'], deco: '#fff',    green: ['#34d399', '#10b981'], border: '#db2777', borderHi: '#f472b6', flag: '#8b5cf6' },
  { name: 'beach', bg: ['#fde68a', '#fcd34d'], deco: '#38bdf8', green: ['#4ade80', '#22c55e'], border: '#a16207', borderHi: '#ca8a04', flag: '#f97316' },
  { name: 'neon',  bg: ['#1e1b4b', '#0f172a'], deco: '#a78bfa', green: ['#059669', '#047857'], border: '#22d3ee', borderHi: '#67e8f9', flag: '#f472b6' },
];
const BONUS_THEME = { name: 'gold', bg: ['#f59e0b', '#fbbf24'], deco: '#fff', green: ['#16a34a', '#15803d'], border: '#fde047', borderHi: '#fef9c3', flag: '#fde047' };

const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

// Hand-made hole shapes. Levels cycle through them (sometimes mirrored) and add traps on top.
const LAYOUTS = [
  { name: 'The Straight', par: 2, poly: rect(110, 110, 370, 670), tee: [240, 610], cup: [240, 170] },
  { name: 'Dog Leg', par: 3, poly: [[60, 100], [420, 100], [420, 360], [210, 360], [210, 680], [60, 680]], tee: [135, 620], cup: [340, 180] },
  { name: 'Treasure Island', par: 2, poly: rect(70, 100, 410, 680), water: [{ x: 70, y: 340, w: 140, h: 100 }, { x: 270, y: 340, w: 140, h: 100 }], tee: [240, 620], cup: [240, 170] },
  { name: 'Zig Zag', par: 3, poly: rect(60, 100, 420, 680), blocks: [{ x: 60, y: 470, w: 250, h: 18 }, { x: 170, y: 290, w: 250, h: 18 }], tee: [120, 620], cup: [310, 175] },
  { name: 'Pinball Alley', par: 2, poly: rect(70, 100, 410, 680), bumpers: [[170, 380, 22], [310, 380, 22], [240, 290, 20], [240, 480, 18]], tee: [240, 620], cup: [240, 165] },
  { name: 'The Windmill', par: 3, poly: rect(150, 100, 330, 680), windmill: [240, 390, 80], tee: [240, 630], cup: [240, 170] },
  { name: 'Round the Rock', par: 3, poly: rect(60, 100, 420, 680), blocks: [{ x: 170, y: 300, w: 140, h: 180 }], water: [{ x: 60, y: 330, w: 70, h: 120 }], tee: [240, 630], cup: [240, 165] },
  { name: 'The Funnel', par: 2, poly: [[50, 680], [430, 680], [330, 100], [150, 100]], sand: [{ x: 200, y: 260, w: 80, h: 40 }], tee: [240, 630], cup: [240, 150] },
];

runGame({
  id: 'crazy-putt',
  width: W,
  height: H,
  lives: 3,
  comboWindow: 0,     // combo carries on while you keep scoring par or better
  comboStep: 2,
  maxMultiplier: 5,
  bonusTime: 25,
  music: { bpm: 100, style: 'major', lead: 'triangle' },
  levelInfo(level, bonus) {
    if (bonus) return 'Hole-in-One Frenzy! Sink as many as you can — smaller holes score more!';
    const L = LAYOUTS[(level - 1) % LAYOUTS.length];
    const notes = {
      1: 'Aim with mouse or finger · HOLD to power up · RELEASE to putt',
      3: 'Watch your step… some of the grass isn\'t what it seems.',
      4: 'Sliding blockers! Time your putt.',
      6: 'Two holes? One of them is a fake…',
      7: 'Conveyor belts push the ball around.',
    };
    return `${L.name} · Par ${L.par}` + (notes[level] ? ` — ${notes[level]}` : '');
  },
  levelClearPoints: (level) => level * 50,
  create: (shell) => new CrazyPutt(shell),
});

class CrazyPutt {
  constructor(s) {
    this.s = s; this.t = 0;
    this.deco = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: TOP + Math.random() * (H - TOP), r: 2 + Math.random() * 4, p: Math.random() * 6 }));
    this.aces = 0;
    this.startLevel(1, false);
  }
  reset() { this.aces = 0; }

  // ── Build a hole ───────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s, rng = s.rng;
    this.level = level; this.bonus = bonus;
    this.theme = bonus ? BONUS_THEME : THEMES[Math.floor(((level - 1) % 20) / 5)];
    this.strokes = 0; this.sinking = null; this.charging = null; this.power = 0;
    this.walls = []; this.blocks = []; this.water = []; this.sand = []; this.bumpers = [];
    this.traps = []; this.conveyors = []; this.movers = []; this.windmill = null; this.decoy = null;
    this.bonusCups = null; this.bonusSunk = 0;
    this.trail = [];

    if (bonus) {
      this.poly = rect(50, 90, 430, 690);
      this.tee = [240, 640]; this.par = 1; this.maxStrokes = Infinity;
      this.cup = null;
      this.bonusCups = [
        { x: 240, y: 150, r: 8, val: 150, color: '#fde047' },
        { x: 120, y: 210, r: 13, val: 60, color: '#fff' }, { x: 360, y: 210, r: 13, val: 60, color: '#fff' },
        { x: 240, y: 330, r: 16, val: 30, color: '#fff' },
        { x: 140, y: 440, r: 11, val: 90, color: '#fff' }, { x: 340, y: 440, r: 11, val: 90, color: '#fff' },
      ];
      this.bumpers = [{ x: 170, y: 300, r: 14 }, { x: 310, y: 300, r: 14 }];
    } else {
      const lay = LAYOUTS[(level - 1) % LAYOUTS.length];
      const mirror = level > LAYOUTS.length ? rng.chance(0.5) : false;
      const mx = (x) => (mirror ? W - x : x);
      const mr = (r) => ({ x: mirror ? W - r.x - r.w : r.x, y: r.y, w: r.w, h: r.h });
      this.layoutName = lay.name;
      this.poly = lay.poly.map(([x, y]) => [mx(x), y]);
      this.tee = [mx(lay.tee[0]), lay.tee[1]];
      this.cup = { x: mx(lay.cup[0]), y: lay.cup[1] };
      this.par = lay.par;
      this.maxStrokes = lay.par + 3;
      this.blocks = (lay.blocks || []).map(mr);
      this.water = (lay.water || []).map(mr);
      this.sand = (lay.sand || []).map((r) => ({ ...mr(r), hidden: false, revealed: true }));
      this.bumpers = (lay.bumpers || []).map(([x, y, r]) => ({ x: mx(x), y, r, hit: 0 }));
      this.buildWalls();
      if (lay.windmill) this.windmill = { x: mx(lay.windmill[0]), y: lay.windmill[1], len: lay.windmill[2], a: rng.range(0, 6.28), spd: Math.min(3.2, 1.2 + level * 0.08) };

      // Sliding blocker (from level 4)
      if (level >= 4 && !lay.windmill && rng.chance(0.6)) {
        const y = lerpN(this.tee[1], this.cup.y, rng.range(0.35, 0.6));
        const [minX, maxX] = this.spanAt(y);
        if (maxX - minX > 120) this.movers.push({ y, minX: minX + 6, maxX: maxX - 76, w: 70, h: 14, x: minX + 6, spd: 70 + level * 6, dir: 1 });
      }
      // Conveyor belt (from level 7)
      if (level >= 7 && rng.chance(0.7)) {
        const y = lerpN(this.tee[1], this.cup.y, rng.range(0.25, 0.45));
        const [minX, maxX] = this.spanAt(y);
        this.conveyors.push({ x: minX + 4, y: y - 22, w: maxX - minX - 8, h: 44, dx: rng.chance(0.5) ? 1 : -1, dy: 0 });
      }
      // Fake hole (from level 6)
      if (level >= 6) {
        const p = this.trapSpot(0.45, 0.8, 70);
        if (p) { this.decoy = { x: p[0], y: p[1], revealed: false }; if (rng.chance(0.5)) [this.decoy.x, this.decoy.y, this.cup.x, this.cup.y] = [this.cup.x, this.cup.y, this.decoy.x, this.decoy.y]; }
      }
      // Hidden traps — right where you'd naturally putt
      const kinds = ['sand'];
      if (level >= 3) kinds.push('trapdoor', 'trapdoor');
      if (level >= 5) kinds.push('speed');
      const n = Math.min(7, 1 + Math.floor(level / 2));
      for (let i = 0; i < n; i++) {
        const p = this.trapSpot(0.18, 0.85, 45);
        if (!p) continue;
        const kind = rng.pick(kinds);
        if (kind === 'sand') this.sand.push({ x: p[0] - 26, y: p[1] - 18, w: 52, h: 36, hidden: true, revealed: false });
        else this.traps.push({ kind, x: p[0] - 14, y: p[1] - 14, w: 28, h: 28, revealed: false, used: 0 });
      }
    }

    this.buildWalls();
    this.placeBall(this.tee[0], this.tee[1]);
    this.aim = -Math.PI / 2;
    if (this.cup) this.aim = Math.atan2(this.cup.y - this.tee[1], this.cup.x - this.tee[0]);
  }

  buildWalls() {
    const segs = [];
    this.poly.forEach((p, i) => segs.push([p, this.poly[(i + 1) % this.poly.length]]));
    for (const b of this.blocks) rect(b.x, b.y, b.x + b.w, b.y + b.h).forEach((p, i, a) => segs.push([p, a[(i + 1) % 4]]));
    this.walls = segs;
  }

  // x-range of the course at height y (for placing things)
  spanAt(y) {
    const xs = [];
    this.poly.forEach((a, i) => {
      const b = this.poly[(i + 1) % this.poly.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    });
    xs.sort((p, q) => p - q);
    return xs.length >= 2 ? [xs[0], xs[xs.length - 1]] : [100, 380];
  }

  // Pick a spot on grass near the natural tee→cup line, clear of everything else
  trapSpot(t0, t1, spread) {
    const rng = this.s.rng;
    for (let i = 0; i < 60; i++) {
      const t = rng.range(t0, t1);
      const x = lerpN(this.tee[0], this.cup.x, t) + rng.range(-spread, spread);
      const y = lerpN(this.tee[1], this.cup.y, t) + rng.range(-spread * 0.5, spread * 0.5);
      if (!this.onGrass(x, y, 30)) continue;
      if (dist(x, y, this.tee[0], this.tee[1]) < 60 || dist(x, y, this.cup.x, this.cup.y) < 45) continue;
      if (this.traps.some((q) => dist(x, y, q.x + 14, q.y + 14) < 50)) continue;
      if (this.sand.some((q) => inRect(x, y, q, 28))) continue;
      if (this.decoy && dist(x, y, this.decoy.x, this.decoy.y) < 45) continue;
      return [x, y];
    }
    return null;
  }
  onGrass(x, y, pad = 0) {
    if (!pointInPoly(x, y, this.poly)) return false;
    for (const [a, b] of this.walls) if (segDist(x, y, a, b) < pad) return false;
    if (this.water.some((w) => inRect(x, y, w, pad))) return false;
    if (this.blocks.some((w) => inRect(x, y, w, pad))) return false;
    if (this.bumpers.some((b) => dist(x, y, b.x, b.y) < b.r + pad)) return false;
    if (this.windmill && dist(x, y, this.windmill.x, this.windmill.y) < this.windmill.len + 10) return false;
    return true;
  }

  placeBall(x, y) {
    this.ball = { x, y, vx: 0, vy: 0, moving: false, z: 0 };
    this.lastRest = [x, y];
    this.trail = [];
  }

  // ── Input ──────────────────────────────────────────────────
  canShoot() { return !this.ball.moving && !this.sinking && this.s.state === 'playing'; }
  aimAt(x, y) { this.aim = Math.atan2(y - this.ball.y, x - this.ball.x); }

  onAction(a, x, y) {
    if (a === 'press' && this.canShoot()) { this.aimAt(x, y); this.charging = 'pointer'; this.power = 0; }
    if (a === 'release' && this.charging === 'pointer') this.shoot();
    if (a === 'action' && this.canShoot() && !this.charging) { this.charging = 'key'; this.power = 0; }
  }
  onPointerMove(x, y) {
    if (!this.ball.moving && dist(x, y, this.ball.x, this.ball.y) > 4) this.aimAt(x, y);
  }

  shoot() {
    const s = this.s;
    const p = this.power;
    this.charging = null; this.power = 0;
    if (!this.canShoot() || p < 0.04) return;
    const sp = 40 + p * (MAX_SPEED - 40);
    this.ball.vx = Math.cos(this.aim) * sp; this.ball.vy = Math.sin(this.aim) * sp;
    this.ball.moving = true;
    this.lastRest = [this.ball.x, this.ball.y];
    if (!this.bonus) this.strokes++;
    s.sound.noise({ dur: 0.05, vol: 0.35 + p * 0.3, freq: 3000, type: 'bandpass' });
    s.sound.tone({ freq: 320 + p * 200, to: 120, dur: 0.08, type: 'triangle', vol: 0.2 });
    s.fx.burst(this.ball.x, this.ball.y, { colors: ['#fff', '#bbf7d0'], count: 6 + p * 10, speed: 90, life: 0.3, angle: this.aim + Math.PI, spread: 1.2 });
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; if (this.windmill) this.windmill.a += this.windmill.spd * dt * 0.3; }

  update(dt) {
    const s = this.s, b = this.ball;
    this.t += dt;

    // Moving parts
    if (this.windmill) this.windmill.a += this.windmill.spd * dt;
    for (const m of this.movers) {
      m.x += m.spd * m.dir * dt;
      if (m.x < m.minX) { m.x = m.minX; m.dir = 1; }
      if (m.x > m.maxX) { m.x = m.maxX; m.dir = -1; }
    }
    for (const bp of this.bumpers) bp.hit = Math.max(0, (bp.hit || 0) - dt * 4);

    // Aiming & power
    if (!b.moving && !this.sinking) {
      const turn = (s.input.isDown('right') ? 1 : 0) - (s.input.isDown('left') ? 1 : 0);
      this.aim += turn * 1.8 * dt;
      if (this.charging) {
        const before = this.power;
        this.power = Math.min(1, this.power + dt / CHARGE_TIME);
        if (Math.floor(before * 8) !== Math.floor(this.power * 8)) s.sound.tone({ freq: 300 + this.power * 700, dur: 0.04, type: 'square', vol: 0.04 });
        if (this.charging === 'key' && !s.input.isDown('action')) this.shoot();
      }
    }

    // Sinking animation
    if (this.sinking) {
      const k = this.sinking;
      k.t += dt;
      b.x += (k.x - b.x) * Math.min(1, dt * 14); b.y += (k.y - b.y) * Math.min(1, dt * 14);
      b.z = Math.min(1, k.t / 0.3);
      if (k.t > 0.35) { this.sinking = null; k.done(); }
      return;
    }
    if (!b.moving) {
      // resting on a conveyor still moves you
      if (this.conveyors.some((c) => inRect(b.x, b.y, c))) b.moving = true;
      else return;
    }

    // Physics (2 sub-steps for solid collisions)
    for (let step = 0; step < 2 && b.moving; step++) this.physics(dt / 2);
  }

  physics(dt) {
    const s = this.s, b = this.ball;
    // Surface
    let decel = 95, drag = 0.55;
    const inSand = this.sand.find((z) => inRect(b.x, b.y, z));
    if (inSand) {
      decel = 900; drag = 2.2;
      if (inSand.hidden && !inSand.revealed) this.reveal(inSand, 'HIDDEN SAND!', '#fbbf24');
    }
    for (const c of this.conveyors) if (inRect(b.x, b.y, c)) { b.vx += c.dx * 260 * dt; b.vy += c.dy * 260 * dt; decel = 20; }
    let sp = Math.hypot(b.vx, b.vy);
    const nsp = Math.max(0, sp - (decel + drag * sp) * dt);
    if (sp > 0) { b.vx *= nsp / sp; b.vy *= nsp / sp; }
    sp = nsp;

    b.x += b.vx * dt; b.y += b.vy * dt;
    this.trail.push([b.x, b.y]); if (this.trail.length > 14) this.trail.shift();

    // Walls, blockers, windmill
    let hit = 0;
    for (const [a, c] of this.walls) hit = Math.max(hit, collideSeg(b, a, c, 0.72));
    for (const m of this.movers) rect(m.x, m.y - m.h / 2, m.x + m.w, m.y + m.h / 2).forEach((p, i, arr) => { hit = Math.max(hit, collideSeg(b, p, arr[(i + 1) % 4], 0.8)); });
    if (this.windmill) {
      const wm = this.windmill;
      for (let k = 0; k < 4; k++) {
        const ang = wm.a + k * Math.PI / 2;
        const tip = [wm.x + Math.cos(ang) * wm.len, wm.y + Math.sin(ang) * wm.len];
        const h = collideSeg(b, [wm.x, wm.y], tip, 0.9);
        if (h) { // blades also swat the ball along
          b.vx += -Math.sin(ang) * wm.spd * 40; b.vy += Math.cos(ang) * wm.spd * 40;
          hit = Math.max(hit, h);
        }
      }
    }
    if (hit > 60) s.sound.play('bounce', Math.min(8, hit / 80));

    // Bumpers
    for (const bp of this.bumpers) {
      const d = dist(b.x, b.y, bp.x, bp.y);
      if (d < bp.r + R && d > 0) {
        const nx = (b.x - bp.x) / d, ny = (b.y - bp.y) / d;
        b.x = bp.x + nx * (bp.r + R); b.y = bp.y + ny * (bp.r + R);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny;
          const k = Math.min(MAX_SPEED, Math.hypot(b.vx, b.vy) * 1.15 + 60) / Math.max(1, Math.hypot(b.vx, b.vy));
          b.vx *= k; b.vy *= k;
          bp.hit = 1;
          s.sound.play('bounce', 12); s.fx.ring(bp.x, bp.y, { color: '#f472b6', radius: bp.r + 16, life: 0.25 });
        }
      }
    }

    // Hidden traps
    for (const tr of this.traps) {
      if (!inRect(b.x, b.y, tr)) { tr.inside = false; continue; }
      if (tr.kind === 'trapdoor') {
        this.reveal(tr, 'TRAPDOOR! +1', '#fb7185');
        s.unlock('trapped');
        s.sound.tone({ freq: 700, to: 90, dur: 0.6, type: 'sawtooth', vol: 0.12 });
        s.fx.shake(5, 0.2);
        this.penalty(this.tee);
        return;
      }
      if (tr.kind === 'speed' && !tr.inside) {
        tr.inside = true;
        this.reveal(tr, 'SPEED PAD!', '#fb923c');
        const k = Math.max(sp * 1.9, 620) / Math.max(1, sp);
        b.vx *= k; b.vy *= k;
        s.sound.tone({ freq: 300, to: 1600, dur: 0.25, type: 'sawtooth', vol: 0.1 });
      }
    }

    // Water
    if (this.water.some((w) => inRect(b.x, b.y, w))) {
      s.sound.noise({ dur: 0.5, vol: 0.4, freq: 900, to: 200 });
      s.fx.burst(b.x, b.y, { colors: ['#38bdf8', '#e0f2fe', '#fff'], count: 30, speed: 200, life: 0.6, gravity: 300 });
      s.fx.ring(b.x, b.y, { color: '#7dd3fc', radius: 30 });
      s.fx.text(b.x, b.y - 20, this.bonus ? 'SPLASH!' : 'SPLASH! +1', { color: '#7dd3fc', size: 22 });
      this.penalty(this.lastRest);
      return;
    }

    // Fake hole
    if (this.decoy && dist(b.x, b.y, this.decoy.x, this.decoy.y) < CUP_R) {
      const dcy = this.decoy;
      if (!dcy.revealed) { dcy.revealed = true; s.unlock('fake'); }
      s.fx.text(dcy.x, dcy.y - 24, 'BOING! FAKE HOLE!', { color: '#f472b6', size: 22, life: 1.2 });
      s.sound.tone({ freq: 180, to: 900, dur: 0.18, type: 'square', vol: 0.12 });
      s.sound.tone({ freq: 900, to: 300, dur: 0.2, type: 'square', vol: 0.1, delay: 0.18 });
      const a = s.rng.range(0, Math.PI * 2);
      b.x = dcy.x + Math.cos(a) * (CUP_R + 2); b.y = dcy.y + Math.sin(a) * (CUP_R + 2);
      b.vx = Math.cos(a) * 380; b.vy = Math.sin(a) * 380;
      s.fx.ring(dcy.x, dcy.y, { color: '#f472b6', radius: 36 });
    }

    // The cup(s)
    const cups = this.bonus ? this.bonusCups : [{ x: this.cup.x, y: this.cup.y, r: CUP_R }];
    for (const c of cups) {
      const d = dist(b.x, b.y, c.x, c.y);
      if (d < c.r + 6 && sp < 160 && d > 0) { b.vx += (c.x - b.x) / d * 260 * dt; b.vy += (c.y - b.y) / d * 260 * dt; } // gentle pull at the lip
      if (d < c.r) {
        if (sp < 430) return this.sink(c);
        // too fast: lip out
        const a = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 0.9;
        b.vx = Math.cos(a) * sp * 0.75; b.vy = Math.sin(a) * sp * 0.75;
        s.sound.play('metal');
        s.fx.text(c.x, c.y - 20, 'Lipped out!', { color: '#fff', size: 16 });
      }
    }

    // Stopped?
    if (Math.hypot(b.vx, b.vy) < 6 && !this.conveyors.some((c) => inRect(b.x, b.y, c))) {
      b.vx = b.vy = 0; b.moving = false; this.trail = [];
      this.lastRest = [b.x, b.y];
      this.afterStop();
    }
  }

  reveal(obj, text, color) {
    if (obj.revealed) return;
    obj.revealed = true;
    const x = obj.x + (obj.w || 0) / 2, y = obj.y + (obj.h || 0) / 2;
    this.s.fx.text(x, y - 26, text, { color, size: 22, life: 1.2 });
    this.s.fx.flash(color, 0.18);
    this.s.fx.burst(x, y, { color, count: 16, speed: 140, life: 0.5 });
    this.s.sound.play('hit');
  }

  penalty(to) {
    const b = this.ball;
    if (!this.bonus) this.strokes++;
    b.vx = b.vy = 0; b.moving = false;
    this.placeBall(to[0], to[1]);
    this.afterStop();
  }

  afterStop() {
    const s = this.s;
    if (this.bonus) {
      s.resetCombo();
      if (dist(this.ball.x, this.ball.y, this.tee[0], this.tee[1]) > 2) {
        this.placeBall(this.tee[0], this.tee[1]);
        s.sound.play('click');
      }
      return;
    }
    if (this.strokes >= this.maxStrokes) {
      s.fx.text(W / 2, H * 0.45, 'Out of strokes!', { color: '#fb7185', size: 30, life: 1.3 });
      s.hurt();
    }
  }

  onLifeLost() {
    this.strokes = 0; this.charging = null; this.power = 0; this.sinking = null;
    this.placeBall(this.tee[0], this.tee[1]);
  }

  sink(c) {
    const s = this.s, b = this.ball, L = this.level;
    b.vx = b.vy = 0; b.moving = false;
    s.sound.play('coin', 6);
    s.sound.tone({ freq: 180, to: 90, dur: 0.15, type: 'sine', vol: 0.3, delay: 0.1 });
    this.sinking = { x: c.x, y: c.y, t: 0, done: () => {
      if (this.bonus) {
        this.bonusSunk++;
        s.award(c.val * L, c.x, c.y - 24, { chain: true, color: c.color === '#fff' ? '#fde047' : '#fff', size: c.val >= 150 ? 30 : 22 });
        s.fx.burst(c.x, c.y, { colors: ['#fde047', '#fff', '#f472b6', '#22d3ee'], count: 26, speed: 220, life: 0.7 });
        if (c.val >= 150) s.sound.play('golden');
        this.placeBall(this.tee[0], this.tee[1]);
        return;
      }
      const diff = this.strokes - this.par;
      let label, base, color;
      if (this.strokes === 1) { label = 'HOLE IN ONE!'; base = 1000; color = '#fde047'; }
      else if (diff <= -2) { label = 'EAGLE!'; base = 500; color = '#a3e635'; }
      else if (diff === -1) { label = 'BIRDIE!'; base = 300; color = '#22d3ee'; }
      else if (diff === 0) { label = 'PAR'; base = 200; color = '#fff'; }
      else if (diff === 1) { label = 'BOGEY'; base = 100; color = '#fdba74'; }
      else if (diff === 2) { label = 'DOUBLE BOGEY'; base = 50; color = '#fdba74'; }
      else { label = `+${diff}`; base = 25; color = '#fda4af'; }
      if (diff > 0) s.resetCombo();
      const pts = s.award(base * L, c.x, c.y + 34, { chain: diff <= 0, color, size: 22 });
      s.fx.text(W / 2, H * 0.34, label, { color, size: this.strokes === 1 ? 52 : 40, life: 1.6, rise: 18 });
      if (this.strokes === 1) {
        this.aces++;
        s.unlock('ace');
        if (this.aces >= 3) s.unlock('ace3');
        s.sound.play('highscore');
        s.fx.flash('#fde047', 0.4); s.fx.shake(8, 0.4);
        for (let i = 0; i < 5; i++) s.fx.burst(c.x, c.y, { colors: ['#fde047', '#f472b6', '#22d3ee', '#a3e635', '#fff'], count: 30, speed: 260 + i * 60, life: 1.2 });
      }
      if (diff < 0) s.unlock('birdie');
      void pts;
      s.completeLevel();
    } };
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const th = this.theme, t = this.t;
    // Surroundings
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const d of this.deco) {
      ctx.globalAlpha = th.name === 'neon' ? 0.5 + Math.sin(t * 2 + d.p) * 0.4 : 0.55;
      ctx.fillStyle = th.deco; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Course border + green
    ctx.save();
    ctx.lineJoin = 'round';
    tracePoly(ctx, this.poly);
    ctx.shadowColor = th.name === 'neon' ? th.border : 'rgba(0,0,0,.35)'; ctx.shadowBlur = th.name === 'neon' ? 18 : 12; ctx.shadowOffsetY = th.name === 'neon' ? 0 : 5;
    ctx.strokeStyle = th.border; ctx.lineWidth = 16; ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = th.borderHi; ctx.lineWidth = 5; ctx.stroke();
    ctx.clip();
    const gg = ctx.createLinearGradient(0, TOP, 0, H);
    gg.addColorStop(0, th.green[0]); gg.addColorStop(1, th.green[1]);
    ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; // mowing stripes
    for (let y = TOP; y < H; y += 56) ctx.fillRect(0, y, W, 28);

    // Hidden traps: almost invisible until found (sharp eyes can just about spot them!)
    for (const z of this.sand) if (z.hidden && !z.revealed) { ctx.fillStyle = 'rgba(0,0,0,.02)'; roundRect(ctx, z.x, z.y, z.w, z.h, 16); ctx.fill(); }
    for (const tr of this.traps) if (!tr.revealed) { ctx.fillStyle = 'rgba(0,0,0,.02)'; roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 4); ctx.fill(); }

    // Water
    for (const w of this.water) {
      const wg = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
      wg.addColorStop(0, '#38bdf8'); wg.addColorStop(1, '#0284c7');
      ctx.fillStyle = wg; roundRect(ctx, w.x, w.y, w.w, w.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let x = w.x + 8; x < w.x + w.w - 8; x += 6) ctx.lineTo(x, w.y + 22 + k * 28 + Math.sin(x * 0.1 + t * 3 + k) * 3);
        ctx.stroke();
      }
    }
    // Sand (visible + revealed)
    for (const z of this.sand) {
      if (z.hidden && !z.revealed) continue;
      ctx.fillStyle = '#fcd34d'; roundRect(ctx, z.x, z.y, z.w, z.h, 16); ctx.fill();
      ctx.fillStyle = '#d97706';
      for (let k = 0; k < 10; k++) { ctx.beginPath(); ctx.arc(z.x + 8 + ((k * 37) % (z.w - 14)), z.y + 8 + ((k * 23) % (z.h - 14)), 1.4, 0, 7); ctx.fill(); }
    }
    // Conveyors
    for (const c of this.conveyors) {
      ctx.fillStyle = 'rgba(30,41,59,.55)'; roundRect(ctx, c.x, c.y, c.w, c.h, 8); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
      ctx.strokeStyle = 'rgba(253,224,71,.8)'; ctx.lineWidth = 4;
      const off = (t * 60 * c.dx) % 30;
      for (let x = c.x - 30 + off; x < c.x + c.w + 30; x += 30) {
        ctx.beginPath(); ctx.moveTo(x - 6 * c.dx, c.y + 12); ctx.lineTo(x + 6 * c.dx, c.y + c.h / 2); ctx.lineTo(x - 6 * c.dx, c.y + c.h - 12); ctx.stroke();
      }
      ctx.restore();
    }
    // Revealed traps
    for (const tr of this.traps) {
      if (!tr.revealed) continue;
      if (tr.kind === 'trapdoor') {
        ctx.fillStyle = '#1c1917'; roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 4); ctx.fill();
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3; ctx.strokeRect(tr.x + 2, tr.y + 2, tr.w - 4, tr.h - 4);
        ctx.fillStyle = '#fb7185'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', tr.x + tr.w / 2, tr.y + tr.h / 2 + 1);
      } else {
        ctx.fillStyle = '#fb923c'; roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('»', tr.x + tr.w / 2, tr.y + tr.h / 2 + 1);
      }
    }
    // Blocks (inner walls)
    for (const bl of this.blocks) {
      ctx.fillStyle = th.border; roundRect(ctx, bl.x, bl.y, bl.w, bl.h, 6); ctx.fill();
      ctx.fillStyle = th.borderHi; roundRect(ctx, bl.x + 3, bl.y + 3, bl.w - 6, Math.min(6, bl.h - 6), 3); ctx.fill();
    }
    ctx.restore();

    // Holes (the real one, the fake one, bonus cups)
    const cups = this.bonus ? this.bonusCups : [this.cup];
    if (this.decoy) cups.push({ ...this.decoy, fake: true });
    for (const c of cups) this.drawCup(ctx, c, t);

    // Bumpers
    for (const bp of this.bumpers) {
      ctx.save(); ctx.shadowColor = '#f472b6'; ctx.shadowBlur = 10 + (bp.hit || 0) * 20;
      const bg = ctx.createRadialGradient(bp.x - bp.r * 0.3, bp.y - bp.r * 0.3, 2, bp.x, bp.y, bp.r);
      bg.addColorStop(0, '#fbcfe8'); bg.addColorStop(1, '#db2777');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r * (1 + (bp.hit || 0) * 0.15), 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r * 0.55, 0, 7); ctx.stroke();
      ctx.restore();
    }
    // Sliding blockers
    for (const m of this.movers) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
      const mg = ctx.createLinearGradient(m.x, 0, m.x + m.w, 0);
      mg.addColorStop(0, '#f472b6'); mg.addColorStop(0.5, '#a78bfa'); mg.addColorStop(1, '#22d3ee');
      ctx.fillStyle = mg; roundRect(ctx, m.x, m.y - m.h / 2, m.w, m.h, 7); ctx.fill(); ctx.restore();
    }
    // Windmill
    if (this.windmill) {
      const wm = this.windmill;
      ctx.save(); ctx.translate(wm.x, wm.y);
      ctx.fillStyle = '#b91c1c'; roundRect(ctx, -16, -16, 32, 32, 6); ctx.fill();
      ctx.rotate(wm.a);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k % 2 ? '#fff' : '#fde047';
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(wm.len, -9); ctx.lineTo(wm.len, 9); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.rotate(Math.PI / 2);
      }
      ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
      ctx.restore();
    }
    // Tee marker
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(this.tee[0], this.tee[1], 12, 0, 7); ctx.fill();

    this.drawAim(ctx);
    this.drawBall(ctx);

    // HUD strip
    ctx.fillStyle = 'rgba(11,11,26,.8)'; ctx.fillRect(0, 0, W, TOP);
    ctx.textBaseline = 'middle'; ctx.font = '700 15px system-ui';
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 28, 20, this.s.bonusLeft / 25, '#b45309', `★ HOLE-IN-ONE FRENZY · ${this.bonusSunk} sunk · ${Math.ceil(this.s.bonusLeft)}s`);
    } else {
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      ctx.fillText(`Hole ${this.level} · Par ${this.par}`, 14, TOP / 2);
      ctx.textAlign = 'right';
      const left = this.maxStrokes - this.strokes;
      ctx.fillStyle = left <= 1 ? '#fb7185' : '#fde047';
      ctx.fillText(`Strokes ${this.strokes} / ${this.maxStrokes}`, W - 14, TOP / 2);
      // golf balls for remaining strokes
      for (let i = 0; i < this.maxStrokes; i++) {
        ctx.fillStyle = i < this.strokes ? 'rgba(255,255,255,.2)' : '#fff';
        ctx.beginPath(); ctx.arc(W / 2 - (this.maxStrokes - 1) * 7 + i * 14, TOP / 2, 4.5, 0, 7); ctx.fill();
      }
    }
  }

  drawCup(ctx, c, t) {
    const r = c.r || CUP_R;
    const fake = c.fake;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, r + 4, r + 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b0b0b'; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 2; ctx.stroke();
    if (fake && c.revealed) {
      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(c.x - 7, c.y - 7); ctx.lineTo(c.x + 7, c.y + 7); ctx.moveTo(c.x + 7, c.y - 7); ctx.lineTo(c.x - 7, c.y + 7); ctx.stroke();
    }
    // flag
    if (!this.bonus || c.val >= 150) {
      const pole = 46, wave = Math.sin(t * 4 + c.x) * 3;
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - pole); ctx.stroke();
      ctx.fillStyle = fake && c.revealed ? '#64748b' : this.theme.flag;
      ctx.beginPath(); ctx.moveTo(c.x, c.y - pole); ctx.quadraticCurveTo(c.x + 14, c.y - pole + 4 + wave, c.x + 26, c.y - pole + 7 + wave); ctx.lineTo(c.x, c.y - pole + 17); ctx.closePath(); ctx.fill();
    } else if (this.bonus) {
      ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.val, c.x, c.y - r - 10);
    }
    if (this.bonus && c.val >= 150) { ctx.fillStyle = '#fde047'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(c.val, c.x - 14, c.y - r - 6); }
    ctx.restore();
  }

  drawAim(ctx) {
    if (this.ball.moving || this.sinking || !['playing', 'banner'].includes(this.s.state)) return;
    const b = this.ball, p = this.power;
    const len = 50 + p * 170;
    const col = p < 0.5 ? `hsl(${120 - p * 120} 90% 55%)` : `hsl(${60 - (p - 0.5) * 120} 95% 55%)`;
    ctx.save();
    ctx.setLineDash([2, 9]); ctx.lineDashOffset = -this.t * 30; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(this.aim) * len, b.y + Math.sin(this.aim) * len); ctx.stroke();
    ctx.strokeStyle = this.charging ? col : '#fff'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(this.aim) * len, b.y + Math.sin(this.aim) * len); ctx.stroke();
    ctx.setLineDash([]);
    // arrow head
    const hx = b.x + Math.cos(this.aim) * (len + 6), hy = b.y + Math.sin(this.aim) * (len + 6);
    ctx.fillStyle = this.charging ? col : '#fff';
    ctx.translate(hx, hy); ctx.rotate(this.aim);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    // power meter
    if (this.charging) {
      const mx = clamp(b.x - 40, 8, W - 88), my = clamp(b.y + 22, TOP + 6, H - 20);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRect(ctx, mx, my, 80, 12, 6); ctx.fill();
      const pg = ctx.createLinearGradient(mx, 0, mx + 80, 0);
      pg.addColorStop(0, '#4ade80'); pg.addColorStop(0.5, '#fde047'); pg.addColorStop(1, '#ef4444');
      ctx.fillStyle = pg; roundRect(ctx, mx, my, Math.max(12, 80 * p), 12, 6); ctx.fill();
      if (p >= 1 && Math.floor(this.t * 10) % 2) { ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MAX', mx + 40, my + 6.5); }
      ctx.restore();
    } else if (this.s.state === 'playing' && this.strokes === 0 && this.level === 1 && !this.bonus) {
      ctx.save(); ctx.globalAlpha = 0.65 + Math.sin(this.t * 5) * 0.3;
      ctx.font = '800 17px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.fillStyle = '#fff';
      const msg = matchMedia('(pointer: coarse)').matches ? 'Touch where to aim · hold · release' : 'Point to aim · HOLD click or Space · release';
      ctx.strokeText(msg, W / 2, b.y + 44); ctx.fillText(msg, W / 2, b.y + 44);
      ctx.restore();
    }
  }

  drawBall(ctx) {
    const b = this.ball;
    for (let i = 0; i < this.trail.length; i++) {
      ctx.globalAlpha = i / this.trail.length * 0.35; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.trail[i][0], this.trail[i][1], R * (i / this.trail.length), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sc = 1 - b.z * 0.7;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 3, R * sc, R * 0.8 * sc, 0, 0, 7); ctx.fill();
    const bg = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, R * sc);
    bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(b.x, b.y, R * sc, 0, 7); ctx.fill();
  }
}

// ── Geometry helpers ───────────────────────────────────────────
function lerpN(a, b, t) { return a + (b - a) * t; }
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function inRect(x, y, r, pad = 0) { return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad; }
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}
/** Bounce the ball off segment a→b. Returns the impact speed (0 if no hit). */
function collideSeg(ball, a, b, restitution) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((ball.x - a[0]) * dx + (ball.y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const px = a[0] + dx * t, py = a[1] + dy * t;
  let nx = ball.x - px, ny = ball.y - py;
  const d = Math.hypot(nx, ny);
  if (d >= R || d === 0) return 0;
  nx /= d; ny /= d;
  ball.x = px + nx * R; ball.y = py + ny * R;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return 0;
  ball.vx -= (1 + restitution) * vn * nx; ball.vy -= (1 + restitution) * vn * ny;
  return -vn;
}
function tracePoly(ctx, poly) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

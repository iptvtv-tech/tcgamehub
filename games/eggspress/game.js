// ─────────────────────────────────────────────────────────────
//  EGGSPRESS 3D — game 20 (Zone 4 · Ultra)
//  Deliver one very loose egg, sitting in a shallow cup on your truck's roof,
//  across the hills to the farm. Real physics: hard landings crack the egg
//  (3 cracks = SPLAT), and if it falls off it's gone. Lose an egg and you
//  lose a life — you restart from the checkpoint flag with a fresh one.
//
//  Each delivery is a longer, harder road:
//    D1 rolling hills + rocky bumps   D2 ramps & jumps   D3 bouncy mushrooms
//    D4 low-gravity moon patches      D6 chasms to jump  D7 gusts of wind
//    D8 oil slicks (no grip)          … and the hills grow taller every time.
//  Every 5th delivery: ★ GOLDEN EGG RUN — 20 s, the egg can't break, grab the gold.
//  Golden character: the Golden Egg Truck (unlocked by the Golden Crown).
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { Store } from '../../assets/js/storage.js';
import * as S from './scene3d.js';

const W = 800, H = 450;
const STEP = 10;                 // terrain sample spacing (px)
const PX_PER_M = 20;             // 20 px = 1 metre
const G = 980;                   // gravity (px/s²)
const TAU = Math.PI * 2;

// Truck
const M = 1, INERTIA = 1700;
const MOUNTS = [[-31, 10], [31, 10]];
const REST = 20, WR = 14, RAY = REST + WR;
const K_SPRING = 72, K_DAMP = 4.5;
const HULL = [[-45, -12], [45, -12], [-46, 10], [46, 10], [0, -13], [-17, -20], [17, -20], [-31, 32], [31, 32], [44, 0], [-44, 0], [42, -27], [22, -27]];

// Egg (long axis vertical)
const EA = 11.5, EB = 15;
const EGG_M = 1, EGG_I = EGG_M * (EA * EA + EB * EB) / 4;

// Cup + roof, in truck-local coords. Each segment: p0, p1, normal (towards the egg side)
const CUP = [
  { p0: [-15, -15.5], p1: [0, -15], n: null },
  { p0: [0, -15], p1: [15, -15.5], n: null },
  { p0: [-16, -20], p1: [-16, -14], n: [1, 0] },
  { p0: [16, -14], p1: [16, -20], n: [-1, 0] },
  { p0: [-46, -12], p1: [-16, -12], n: [0, -1] },
  { p0: [16, -12], p1: [20, -12], n: [0, -1] },
  { p0: [20, -27], p1: [44, -27], n: [0, -1] },
  { p0: [20, -12], p1: [20, -27], n: [-1, 0] },
];
for (const c of CUP) {
  const dx = c.p1[0] - c.p0[0], dy = c.p1[1] - c.p0[1], L = Math.hypot(dx, dy);
  c.len = L; c.u = [dx / L, dy / L];
  if (!c.n) c.n = [dy / L, -dx / L];
}
const EGG_PTS = (() => {
  const pts = [];
  for (let i = 0; i < 18; i++) { const t = i / 18 * TAU, sn = Math.sin(t); pts.push([EA * Math.cos(t) * (sn < 0 ? 1 - 0.2 * -sn : 1), EB * sn]); }
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [x, y - cy]);
})();

const THEMES = {
  meadow: { name: 'Meadow Hills', sky: ['#38bdf8', '#e0f2fe'], far: '#93c5fd', mid: '#4ade80', grass: '#22c55e', road: '#a16207', dirt: ['#92400e', '#451a03'], sun: '#fde047', tree: ['#15803d', '#713f12', '#166534'], fog: '#e0f2fe' },
  autumn: { name: 'Autumn Ridge', sky: ['#fb923c', '#fef3c7'], far: '#fca5a5', mid: '#f59e0b', grass: '#ea580c', road: '#78350f', dirt: ['#7c2d12', '#431407'], sun: '#fef9c3', tree: ['#dc2626', '#713f12', '#f59e0b'], fog: '#fde68a' },
  sunset: { name: 'Sunset Valley', sky: ['#6d28d9', '#fb7185'], far: '#a78bfa', mid: '#be185d', grass: '#db2777', road: '#581c87', dirt: ['#6b21a8', '#2e1065'], sun: '#fde047', tree: ['#831843', '#3b0764', '#be185d'], fog: '#f9a8d4' },
  night: { name: 'Midnight Road', sky: ['#020617', '#1e3a8a'], far: '#1e293b', mid: '#0f766e', grass: '#14b8a6', road: '#134e4a', dirt: ['#115e59', '#042f2e'], sun: '#f8fafc', tree: ['#064e3b', '#022c22', '#0f766e'], fog: '#1e3a8a', stars: true },
  candy: { name: 'Candy Canyon', sky: ['#e879f9', '#fef08a'], far: '#f9a8d4', mid: '#fbbf24', grass: '#facc15', road: '#c2410c', dirt: ['#d97706', '#9a3412'], sun: '#fff', tree: ['#ec4899', '#9d174d', '#f472b6'], fog: '#fde68a' },
  moon: { name: 'Moon Dunes', sky: ['#0b0420', '#3b0764'], far: '#4c1d95', mid: '#6d28d9', grass: '#a78bfa', road: '#4c1d95', dirt: ['#4c1d95', '#1e1b4b'], sun: '#e9d5ff', tree: ['#581c87', '#2e1065', '#7e22ce'], fog: '#3b0764', stars: true },
  gold: { name: 'Golden Egg Run', sky: ['#f59e0b', '#fef9c3'], far: '#fcd34d', mid: '#fbbf24', grass: '#eab308', road: '#a16207', dirt: ['#b45309', '#78350f'], sun: '#fff', tree: ['#ca8a04', '#713f12', '#facc15'], fog: '#fef3c7' },
};
const THEME_ORDER = ['meadow', 'autumn', 'sunset', 'night', 'candy', 'moon'];

runGame({
  id: 'eggspress',
  width: W, height: H,
  lives: 3,
  comboWindow: 3,
  comboStep: 4,
  maxMultiplier: 5,
  bonusTime: 20,
  levelName: 'Delivery',
  clearText: 'DELIVERED!',
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 100),
  music: { bpm: 118, style: 'major', lead: 'triangle', arp: [0, 2, 1, 2, 0, 3, 1, 2] },
  levelInfo(level, bonus) {
    if (bonus) return '★ GOLDEN EGG RUN! The egg can\'t break — grab all the gold you can in 20 seconds.';
    const notes = {
      1: 'Hold → (or the right side) to drive, ← to brake. In the air, → tips back and ← tips forward. Get the egg to the farm!',
      2: '🛫 Ramps! Land on both wheels or the egg cracks.',
      3: '🍄 Bouncy mushrooms launch you sky-high.',
      4: '🌙 Moon patches: low gravity — easy does it.',
      6: '🕳️ Chasms! Hit the ramp at speed to jump them.',
      7: '💨 Gusts of wind push the egg about.',
      8: '🛢️ Oil slicks — no grip on the black patches.',
    };
    return notes[level] || 'A longer road with taller hills. Steady hands!';
  },
  create: (shell) => new Eggspress(shell),
});

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

class Eggspress {
  constructor(s) {
    this.s = s; this.t = 0;
    this.cam3 = new S.Cam(W, H);
    this.clouds = Array.from({ length: 10 }, () => ({ x: Math.random() * 3000, y: 20 + Math.random() * 110, s: 0.6 + Math.random() * 0.8 }));
    this.stars = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.6, z: Math.random() }));
    this.dust = []; this.streaks = [];
    this.reset();
    this.startLevel(1, false);
  }
  reset() { this.coinsRun = 0; }

  // ── The road ───────────────────────────────────────────────
  startLevel(level, bonus) {
    const r = this.s.rng;
    this.level = level; this.bonus = bonus;
    this.d = clamp((level - 1) / 13, 0, 1);
    this.themeKey = bonus ? 'gold' : THEME_ORDER[(level - 1) % THEME_ORDER.length];
    this.goalX = bonus ? 1e9 : (380 + level * 55) * PX_PER_M;
    this.checkX = this.goalX * 0.5; this.respawnX = 60; this.flagged = false;
    this.X0 = -1600; this.Hs = []; this.genX = this.X0;
    this.f = [r.range(0.0022, 0.003), r.range(0.0055, 0.0068), r.range(0.012, 0.015), r.range(0.0008, 0.0011)];
    this.p = [r.range(0, TAU), r.range(0, TAU), r.range(0, TAU), r.range(0, TAU)];
    this.coins = []; this.mushrooms = []; this.lowG = []; this.bumps = []; this.ramps = []; this.gaps = []; this.winds = []; this.oils = []; this.props = [];
    const L = level, B = bonus;
    this.next = {
      bump: 40 * PX_PER_M, ramp: (B ? 30 : L >= 2 ? 90 : 1e9) * PX_PER_M, mush: (B ? 60 : L >= 3 ? 140 : 1e9) * PX_PER_M,
      lowG: (L >= 4 && !B ? 160 : 1e9) * PX_PER_M, gap: (L >= 6 && !B ? 120 : 1e9) * PX_PER_M,
      wind: (L >= 7 && !B ? 100 : 1e9) * PX_PER_M, oil: (L >= 8 && !B ? 80 : 1e9) * PX_PER_M, coin: 500, prop: this.X0,
    };
    this.maxX = 0; this.distPaid = 0; this.time = 0; this.cracksLevel = 0; this.livesAtStart = this.s.lives; this.delivered = false;
    this.ensure(3000);
    this.spawn(60);
  }

  ensure(x) { while (this.genX < x + 2600) this.genChunk(); }

  placeFeatures(upto) {
    const r = this.s.rng, n = this.next, d = this.d, B = this.bonus;
    const clear = (x, pad) => !this.ramps.some((q) => Math.abs(q.x - x) < pad) && !this.gaps.some((q) => x > q.x0 - pad - 400 && x < q.x1 + pad) && !this.bumps.some((q) => x > q.x0 - pad && x < q.x1 + pad);
    while (n.bump < upto) {
      if (n.bump < this.goalX - 600) this.bumps.push({ x0: n.bump, x1: n.bump + r.range(360, 560 + d * 300), k: 0.75 + d * 0.55 });
      n.bump += r.range(2600 - d * 1200, 4200 - d * 1800) * (this.level === 1 ? 1.4 : 1);
    }
    while (n.gap < upto) {
      // a chasm: a launch ramp, then a gap you have to clear
      const x = n.gap;
      if (!this.ramps.some((q) => Math.abs(q.x - x) < 1400) && !this.gaps.some((q) => Math.abs(q.x0 - x) < 2000) && x < this.goalX - 1400 && Math.abs(x - this.checkX) > 1200) {
        const w = 90 + d * 45 + r.range(0, 15);
        this.ramps.push({ x, h: 60 + d * 25, gap: true, w });
        this.gaps.push({ x0: x, x1: x + w });
      }
      n.gap += r.range(3600 - d * 900, 5200 - d * 1200);
    }
    while (n.ramp < upto) {
      if (!this.bumps.some((b) => n.ramp > b.x0 - 300 && n.ramp < b.x1 + 400) && !this.ramps.some((q) => q.gap && n.ramp > q.x - 1400 && n.ramp < q.x + q.w + 900) && n.ramp < this.goalX - 800) this.ramps.push({ x: n.ramp, h: 65 + d * 60 });
      n.ramp += B ? r.range(1100, 1500) : r.range(2400 - d * 900, 3800 - d * 1500);
    }
    while (n.lowG < upto) { this.lowG.push({ x0: n.lowG, x1: n.lowG + r.range(700, 1100) }); n.lowG += r.range(4000, 6500); }
    while (n.wind < upto) { this.winds.push({ x0: n.wind, x1: n.wind + r.range(600, 1000), f: r.pick([-1, 1]) * (260 + d * 160) }); n.wind += r.range(2600, 4200); }
    while (n.oil < upto) {
      // oil only on flat or downhill road — an oily climb would be impossible
      const x = n.oil, len = r.range(160, 260), up = (this.baseHeight(x + len) - this.baseHeight(x)) / len;
      if (clear(x, 200) && up > -0.08) this.oils.push({ x0: x, x1: x + len });
      n.oil += r.range(1600, 2800);
    }
  }

  baseHeight(x) {
    const f = this.f, p = this.p, m = x / PX_PER_M, d = this.d;
    const amp = Math.min(180, 50 + d * 100 + m * 0.05);
    // calm, flat ground for a good run-up before each chasm and after its landing
    let calm = 0;
    for (const rp of this.ramps) if (rp.gap) { const u = x - rp.x; calm = Math.max(calm, clamp(Math.min((u + 1150) / 350, (rp.w + 760 - u) / 300), 0, 1)); }
    const ramp = clamp((x - 200) / 400, 0, 1) * (1 - calm);
    let y = 300 + ramp * (amp * Math.sin(x * f[0] + p[0]) + amp * 0.45 * Math.sin(x * f[1] + p[1])
      + amp * 0.2 * clamp((m - 20) / 100, 0, 1) * Math.sin(x * f[2] + p[2]) + amp * 0.9 * Math.sin(x * f[3] + p[3]));
    if (d > 0.5) y += (d - 0.5) * 2 * amp * 0.45 * Math.sin(x * 0.009 + p[2]) ** 3;
    for (const b of this.bumps) if (x > b.x0 && x < b.x1) {
      const w = Math.sin((x - b.x0) / (b.x1 - b.x0) * Math.PI) * b.k * (1 - calm);
      y += w * (5 * Math.sin(x * 0.085) + 3 * Math.sin(x * 0.19 + 1) + 2 * Math.sin(x * 0.31));
    }
    for (const rp of this.ramps) {
      const u = x - rp.x;
      if (rp.gap) {
        // chasm: a kicker that launches you up, the gap, then a landing slope on the far side
        if (u > -320 && u <= 0) y -= rp.h * ((u + 320) / 320) ** 1.7;
        else if (u > rp.w && u <= rp.w + 380) y -= rp.h * 0.8 * (0.5 + 0.5 * Math.cos((u - rp.w) / 380 * Math.PI));
      } else if (u > -200 && u <= 0) y -= rp.h * ((u + 200) / 200) ** 2;          // the kicker
      else if (u > 0 && u <= 280) y -= rp.h * (0.5 + 0.5 * Math.cos(u / 280 * Math.PI));   // a landing slope: jump it fast, or roll down it slowly
    }
    // flatten the farm yard at the end of the road
    const g = x - (this.goalX - 300);
    if (g > 0) y = y * Math.max(0, 1 - g / 300) + this.yardY * Math.min(1, g / 300);
    return y;
  }

  genChunk() {
    const r = this.s.rng, a = this.genX, b = a + 2000;
    this.placeFeatures(b + 1500);
    if (this.yardY === undefined || this.genX === this.X0) this.yardY = 300;
    const Hs = this.Hs;
    for (let x = a; x < b; x += STEP) {
      let y = this.baseHeight(x);
      const free = this.ramps.some((rp) => x > rp.x - 10 && x < rp.x + (rp.gap ? rp.w + 400 : 300));
      if (Hs.length && !free) {
        const maxD = (0.6 + this.d * 0.18) * STEP, prev = Hs[Hs.length - 1];
        if (prev < 1500) y = clamp(y, prev - maxD, prev + maxD);
      }
      if (this.gaps.some((gp) => x >= gp.x0 && x < gp.x1)) y = 3000;      // the chasm
      Hs.push(y);
    }
    this.genX = b;
    // coins
    const n = this.next;
    while (n.coin < b - 300) {
      const count = this.bonus ? r.int(6, 9) : r.int(4, 7);
      const air = this.ramps.find((rp) => n.coin > rp.x - 20 && n.coin < rp.x + 300);
      for (let k = 0; k < count; k++) {
        const cx = n.coin + k * 52, arc = Math.sin(k / Math.max(1, count - 1) * Math.PI);
        const gy = this.ground(cx); if (gy > 1500) continue;
        const lift = air ? 110 + arc * 60 : 48 + arc * 34;
        this.coins.push({ x: cx, y: gy - lift, got: false, spin: r.range(0, TAU) });
      }
      n.coin = (air ? air.x + 420 : n.coin) + (this.bonus ? r.range(300, 520) : r.range(650, 1050));
    }
    while (n.mush < b - 300) {
      const x = n.mush;
      if (!this.ramps.some((rp) => Math.abs(rp.x - x) < 500) && !this.gaps.some((q) => x > q.x0 - 600 && x < q.x1 + 200) && !this.bumps.some((q) => x > q.x0 - 100 && x < q.x1 + 100) && Math.abs(this.slope(x)) < 0.35 && x < this.goalX - 600) this.mushrooms.push({ x, cd: 0 });
      n.mush += this.bonus ? r.range(900, 1400) : r.range(1400, 2400);
    }
    // scenery: trees and rocks behind the road, posts and tufts in front
    while (n.prop < b) {
      const x = n.prop;
      if (this.ground(x) < 1500) this.props.push({ x, z: r.range(S.RW + 60, 520), kind: r.chance(0.55) ? 'pine' : r.chance(0.7) ? 'oak' : 'rock', s: r.range(0.8, 1.4), c: r.int(0, 2) });
      if (r.chance(0.25) && this.ground(x) < 1500) this.props.push({ x: x + 40, z: -S.RW - r.range(30, 70), kind: r.chance(0.5) ? 'rock' : 'pine', s: r.range(0.5, 0.8), c: r.int(0, 2) });
      n.prop += r.range(70, 170);
    }
    const behind = (this.car?.x ?? 0) - 3000;
    this.coins = this.coins.filter((c) => c.x > behind);
    this.props = this.props.filter((c) => c.x > behind - 600);
  }

  ground(x) {
    const i = (x - this.X0) / STEP, a = Math.floor(i);
    if (a < 0) return this.Hs[0];
    if (a >= this.Hs.length - 1) return this.Hs[this.Hs.length - 1];
    const k = i - a;
    return this.Hs[a] * (1 - k) + this.Hs[a + 1] * k;
  }
  slope(x) { return (this.ground(x + 6) - this.ground(x - 6)) / 12; }
  normal(x) { const d = clamp(this.slope(x), -8, 8), l = Math.hypot(d, 1); return [d / l, -1 / l]; }
  gravity(x) { return this.lowG.some((z) => x > z.x0 && x < z.x1) ? G * 0.42 : G; }
  windAt(x) { const w = this.winds.find((z) => x > z.x0 && x < z.x1); return w ? w.f * Math.sin(Math.min(1, (x - w.x0) / 200, (w.x1 - x) / 200) * Math.PI / 2) : 0; }
  oily(x) { return this.oils.some((z) => x > z.x0 && x < z.x1); }
  get T() { return THEMES[this.themeKey]; }

  spawn(x) {
    while (this.ground(x) > 1500) x -= 40;
    const a = Math.atan(this.slope(x));
    this.car = { x, y: this.ground(x) - 30, vx: 0, vy: 0, a, w: 0, wheels: MOUNTS.map(() => ({ x: 0, y: 0, rot: 0, on: false })), air: 0, launched: false, overGap: false };
    const [ox, oy] = this.toWorld(0, -17 - EB);
    this.egg = { x: ox, y: oy, vx: 0, vy: 0, a, w: 0, cracks: 0, alive: true, crackCd: 0, splat: null, crackSeeds: [] };
    this.stuckT = 0;
    this.cam = this.cam || { x: 0, y: 0 };
    this.cam.x = x + 120; this.cam.y = this.car.y - 110;
    this.updateWheels();
  }
  updateWheels() {
    const c = this.car, dx = -Math.sin(c.a), dy = Math.cos(c.a);
    MOUNTS.forEach(([lx, ly], i) => { const [mx, my] = this.toWorld(lx, ly); c.wheels[i].x = mx + dx * REST; c.wheels[i].y = my + dy * REST; });
  }
  toWorld(lx, ly, c = this.car) { const cs = Math.cos(c.a), sn = Math.sin(c.a); return [c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs]; }
  toLocal(wx, wy, c = this.car) { const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = wx - c.x, dy = wy - c.y; return [dx * cs + dy * sn, -dx * sn + dy * cs]; }

  // ── Input ──────────────────────────────────────────────────
  throttle() {
    if (this.delivered) return -0.4;
    const i = this.s.input;
    let th = 0;
    if (i.isDown('right') || i.isDown('up') || i.isDown('action')) th += 1;
    if (i.isDown('left') || i.isDown('down')) th -= 1;
    if (i.pointer.down) th += i.pointer.x > W * 0.45 ? 1 : -1;
    return clamp(th, -1, 1);
  }

  onLifeLost() { this.spawn(this.respawnX); this.dust = []; }
  idle(dt) { this.t += dt; this.tickDust(dt); if (this.egg?.splat) this.egg.splat.t += dt; }

  // ── Physics ────────────────────────────────────────────────
  update(dt) {
    const s = this.s, L = this.level;
    this.t += dt; this.time += dt;
    const th = this.throttle();
    const sub = 2, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      this.stepCar(h, th);
      if (this.bonus) this.glueEgg(); else if (this.stepEgg(h)) return;
    }
    const c = this.car;

    // camera: a little ahead of the truck and above it
    const lookX = clamp(c.vx * 0.3, -50, 160);
    this.cam.x += (c.x + 120 + lookX - this.cam.x) * Math.min(1, dt * 4);
    this.cam.y += (Math.min(c.y, 1400) - 110 - this.cam.y) * Math.min(1, dt * 3.5);
    this.ensure(c.x);

    // fell into a chasm
    const gp = this.gaps.find((q) => c.x > q.x0 - 30 && c.x < q.x1 + 30);
    if (gp) { c.overGap = true; if (c.y > this.ground(gp.x0 - 15) + 200 && this.egg.alive && !this.bonus) { s.fx.text(W / 2, H * 0.3, 'INTO THE CHASM!', { color: '#fca5a5', size: 28 }); this.breakEgg(this.egg.x, this.egg.y, true); return; } }
    else if (c.overGap) {
      c.overGap = false;
      if (this.egg.alive && !this.bonus && c.wheels.some((w) => w.on)) { s.award(300 * L, W / 2, H * 0.28, { chain: true, color: '#a5f3fc', size: 22 }); s.fx.text(W / 2, H * 0.2, 'CHASM JUMPED!', { color: '#a5f3fc', size: 26 }); s.sound.play('golden'); s.unlock('gap'); }
    }

    // distance points, checkpoint and the farm
    if (c.x > this.maxX) this.maxX = c.x;
    while (this.maxX - this.distPaid >= 10 * PX_PER_M) { this.distPaid += 10 * PX_PER_M; s.award(10 * L); }
    if (!this.bonus && !this.flagged && c.x >= this.checkX) {
      this.flagged = true; this.respawnX = this.checkX + 20;
      s.fx.text(W / 2, H * 0.24, '🚩 CHECKPOINT', { color: '#fff', size: 26, life: 1.2 }); s.sound.play('go');
    }
    if (!this.bonus && !this.delivered && c.x >= this.goalX && this.egg.alive) this.deliver();

    // coins
    for (const cn of this.coins) {
      if (cn.got || Math.abs(cn.x - c.x) > 90) continue;
      const near = (cn.x - c.x) ** 2 + (cn.y - (c.y - 10)) ** 2 < 48 ** 2 || (cn.x - this.egg.x) ** 2 + (cn.y - this.egg.y) ** 2 < 28 ** 2;
      if (!near) continue;
      cn.got = true; this.coinsRun++;
      const [sx, sy] = this.scr(cn.x, cn.y);
      s.award((this.bonus ? 30 : 20) * L, sx, sy - 18, { chain: true, color: '#fde047', size: 18 });
      s.sound.play('coin', s.comboCount);
      s.fx.burst(sx, sy, { colors: ['#fde047', '#fff7ae'], count: 10, speed: 140, life: 0.4 });
      if (this.coinsRun >= 50) s.unlock('coins50');
    }

    // mushrooms
    for (const m of this.mushrooms) {
      m.cd = Math.max(0, m.cd - dt); m.squash = Math.max(0, (m.squash || 0) - dt * 4);
      if (m.cd > 0) continue;
      if (c.wheels.some((wh) => wh.on && Math.abs(wh.x - m.x) < 26)) {
        m.cd = 1.2; m.squash = 1;
        const boost = -720 - Math.max(0, c.vy);
        c.vy += boost; this.egg.vy += boost; c.launched = true;
        s.sound.play('bounce', 8); s.sound.tone({ freq: 200, to: 900, dur: 0.25, type: 'sine', vol: 0.15 });
        const [sx, sy] = this.scr(m.x, this.ground(m.x) - 40);
        s.fx.text(sx, sy - 40, 'BOING!', { color: '#fb7185', size: 26 });
        s.fx.burst(sx, sy, { colors: ['#fb7185', '#fff'], count: 18, speed: 200 });
      }
    }

    // stuck on the roof → the egg's done for
    const upside = Math.cos(c.a) < -0.2;
    this.stuckT = upside && Math.hypot(c.vx, c.vy) < 60 ? this.stuckT + dt : 0;
    if (this.stuckT > 1.5 && this.egg.alive && !this.bonus) { this.breakEgg(this.egg.x, this.egg.y + EB); return; }

    // wind streaks
    const wnd = this.windAt(c.x);
    if (wnd && Math.random() < 0.6) this.streaks.push({ x: this.cam.x + (wnd > 0 ? -500 : 500) + Math.random() * 100, y: this.cam.y - 150 + Math.random() * 260, z: -200 + Math.random() * 500, vx: wnd * 2.4, life: 1.2 });
    for (const st of this.streaks) { st.x += st.vx * dt; st.life -= dt; }
    this.streaks = this.streaks.filter((st) => st.life > 0);

    this.egg.crackCd = Math.max(0, this.egg.crackCd - dt);
    this.tickDust(dt);
  }

  stepCar(dt, th) {
    const c = this.car, s = this.s;
    const g = this.gravity(c.x);
    let fx = 0, fy = M * g, tq = 0;
    const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = -sn, dy = cs;
    let onCount = 0;
    const springTq = [], vmax = 560;
    fx += this.windAt(c.x) * 0.12;

    MOUNTS.forEach(([lx, ly], i) => {
      const [mx, my] = this.toWorld(lx, ly);
      const rx = mx - c.x, ry = my - c.y;
      const vmx = c.vx - c.w * ry, vmy = c.vy + c.w * rx;
      const wh = c.wheels[i];
      const below = (t) => my + dy * t >= this.ground(mx + dx * t);
      let t = RAY;
      wh.on = false;
      if (below(RAY)) {
        let lo = 0, hi = RAY;
        if (below(0)) hi = 0;
        else for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; }
        t = hi; wh.on = true; onCount++;
        const comp = RAY - t;
        const Fs = Math.max(0, (g / G) * (K_SPRING * comp + K_DAMP * (vmx * dx + vmy * dy)));
        let Fx = -dx * Fs, Fy = -dy * Fs;
        const px = mx + dx * t, py = my + dy * t;
        const sl = clamp(this.slope(px), -6, 6), tl = Math.hypot(1, sl), tx = 1 / tl, ty = sl / tl;
        const vt = vmx * tx + vmy * ty;
        let F;
        if (th > 0) F = 540 * th * Math.max(0, 1 - vt / vmax);
        else if (th < 0) F = vt > 25 ? -430 * -th : -260 * -th * Math.max(0, 1 + vt / 180);
        else F = -Math.sign(vt) * Math.min(45, Math.abs(vt) * 2);
        const lim = (1.25 * Fs + 40) * (this.oily(px) ? 0.2 : 1);
        F = clamp(F, -lim, lim);
        Fx += tx * F; Fy += ty * F;
        const arx = px - c.x, ary = py - c.y;
        fx += Fx; fy += Fy;
        springTq.push(cross(rx, ry, -dx * Fs, -dy * Fs)); tq += 0.5 * cross(arx, ary, tx * F, ty * F);
        wh.vt = vt;
        if (th !== 0 && Math.random() < 0.35 * Math.abs(th) && Math.abs(vt) > 40) this.puff(px, py - 3, th, this.oily(px));
      }
      const ext = Math.min(REST, t - WR);
      wh.x = mx + dx * ext; wh.y = my + dy * ext;
      wh.rot += (wh.on ? wh.vt : (wh.vt || 0) * 0.99) / WR * dt;
      if (!wh.on && th) wh.vt = clamp((wh.vt || 0) + th * 900 * dt, -300, vmax);
    });

    for (const st of springTq) tq += st * (onCount === 1 ? 0.55 : 1);
    c.vx += fx / M * dt; c.vy += fy / M * dt;
    c.w += tq / INERTIA * dt;
    if (!onCount) c.w -= th * 3.6 * dt;
    c.w *= 1 - (onCount ? 1.6 : 0.35) * dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.w * dt;

    for (let it = 0; it < 2; it++) {
      for (const [lx, ly] of HULL) {
        const [px, py] = this.toWorld(lx, ly);
        const gy = this.ground(px);
        if (py <= gy) continue;
        const [nx, ny] = this.normal(px);
        const depth = Math.min(30, (py - gy) * -ny);
        const rx = px - c.x, ry = py - c.y;
        const vpx = c.vx - c.w * ry, vpy = c.vy + c.w * rx;
        const vn = vpx * nx + vpy * ny;
        if (vn < 0) {
          const rn = cross(rx, ry, nx, ny);
          const j = -(1.15) * vn / (1 / M + rn * rn / INERTIA);
          c.vx += nx * j / M; c.vy += ny * j / M; c.w += rn * j / INERTIA;
          const tx = -ny, ty = nx;
          const vt = (c.vx - c.w * ry) * tx + (c.vy + c.w * rx) * ty;
          const rt = cross(rx, ry, tx, ty);
          let jt = -vt / (1 / M + rt * rt / INERTIA);
          jt = clamp(jt, -0.15 * j, 0.15 * j);
          c.vx += tx * jt / M; c.vy += ty * jt / M; c.w += rt * jt / INERTIA;
          if (vn < -260 && it === 0) { s.sound.play('hit'); s.fx.shake(4, 0.15); }
        }
        c.x += nx * depth * 0.5; c.y += ny * depth * 0.5;
      }
    }

    if (onCount === 0) c.air += dt;
    else {
      if (c.air > 0.9 && this.egg.alive && !this.bonus) {
        const [ex, ey] = this.toLocal(this.egg.x, this.egg.y);
        if (Math.abs(ex) < 30 && ey < -10 && ey > -60) {
          const pts = Math.round(c.air * 80) * this.level;
          s.award(pts, W * 0.5, H * 0.3, { chain: true, color: '#38bdf8', size: 24 });
          s.fx.text(W * 0.5, H * 0.22, `BIG AIR ${c.air.toFixed(1)}s!`, { color: '#38bdf8', size: 26 });
          s.sound.play('golden');
          if (c.air >= 1.5) s.unlock('air');
          if (c.launched) s.unlock('bounce');
        }
      }
      if (c.air > 0.3) for (const wh of c.wheels) if (wh.on) for (let i = 0; i < 5; i++) this.puff(wh.x, wh.y + WR - 2, 0);
      c.air = 0; c.launched = false;
    }
  }

  glueEgg() {
    const e = this.egg, c = this.car;
    const [x, y] = this.toWorld(0, -17 - EB);
    e.vx = (x - e.x) * 120; e.vy = (y - e.y) * 120;
    e.x = x; e.y = y; e.a = c.a; e.w = c.w;
  }

  /** Returns true if the egg broke this step. */
  stepEgg(dt) {
    const e = this.egg, c = this.car, s = this.s;
    if (!e.alive) return false;
    e.vy += this.gravity(e.x) * dt;
    e.vx += this.windAt(e.x) * dt;
    e.w *= 1 - 0.6 * dt;
    e.x += e.vx * dt; e.y += e.vy * dt; e.a += e.w * dt;
    const cs = Math.cos(e.a), sn = Math.sin(e.a);
    const near = (e.x - c.x) ** 2 + (e.y - c.y) ** 2 < 120 ** 2;
    let impact = 0;
    for (let it = 0; it < 2; it++) {
      for (const [lx, ly] of EGG_PTS) {
        const px = e.x + lx * cs - ly * sn, py = e.y + lx * sn + ly * cs;
        if (py > this.ground(px)) { this.breakEgg(px, this.ground(px)); return true; }
        if (!near) continue;
        const [qx, qy] = this.toLocal(px, py);
        for (const seg of CUP) {
          const ux = qx - seg.p0[0], uy = qy - seg.p0[1];
          const along = ux * seg.u[0] + uy * seg.u[1];
          if (along < -1 || along > seg.len + 1) continue;
          const d = ux * seg.n[0] + uy * seg.n[1];
          if (d >= 0 || d < -9) continue;
          const ccs = Math.cos(c.a), csn = Math.sin(c.a);
          const nx = seg.n[0] * ccs - seg.n[1] * csn, ny = seg.n[0] * csn + seg.n[1] * ccs;
          const rcx = px - c.x, rcy = py - c.y;
          const svx = c.vx - c.w * rcy, svy = c.vy + c.w * rcx;
          const rex = px - e.x, rey = py - e.y;
          let vrx = e.vx - e.w * rey - svx, vry = e.vy + e.w * rex - svy;
          const vn = vrx * nx + vry * ny;
          if (vn < 0) {
            if (-vn > impact) impact = -vn;
            const rn = cross(rex, rey, nx, ny);
            const j = -(1 + (vn < -50 ? 0.4 : 0)) * vn / (1 / EGG_M + rn * rn / EGG_I);
            e.vx += nx * j / EGG_M; e.vy += ny * j / EGG_M; e.w += rn * j / EGG_I;
            vrx = e.vx - e.w * rey - svx; vry = e.vy + e.w * rex - svy;
            const tx = -ny, ty = nx, vt = vrx * tx + vry * ty;
            const rt = cross(rex, rey, tx, ty);
            let jt = -vt / (1 / EGG_M + rt * rt / EGG_I);
            jt = clamp(jt, -0.25 * j, 0.25 * j);
            e.vx += tx * jt / EGG_M; e.vy += ty * jt / EGG_M; e.w += rt * jt / EGG_I;
          }
          e.x += nx * -d * 0.35; e.y += ny * -d * 0.35;
        }
      }
    }
    // fell off and dropped far behind / below the truck
    if (Math.hypot(e.x - c.x, e.y - c.y) > 600) { this.breakEgg(e.x, e.y, true); return true; }
    const crackSpeed = 205 - this.d * 25;
    if (impact > crackSpeed && e.crackCd <= 0) {
      e.crackCd = 0.35;
      e.cracks++; this.cracksLevel++;
      e.crackSeeds.push(Math.random() * 2 - 1);
      s.sound.play('metal'); s.sound.noise({ dur: 0.12, vol: 0.25, freq: 3000, type: 'highpass' });
      const [sx, sy] = this.scr(e.x, e.y);
      s.fx.text(sx, sy - 40, e.cracks >= 3 ? 'CRACK!!!' : 'Crack!', { color: '#fef3c7', size: 20 });
      s.fx.shake(3, 0.12);
      if (e.cracks >= 3) { this.breakEgg(e.x, e.y + EB); return true; }
    }
    return false;
  }

  breakEgg(x, y, lost = false) {
    const e = this.egg, s = this.s;
    if (!e.alive) return;
    e.alive = false;
    e.splat = { x, y: lost ? y : Math.min(y, this.ground(x)), t: 0, lost };
    const [sx, sy] = this.scr(x, y);
    s.sound.play('hit'); s.sound.noise({ dur: 0.3, vol: 0.4, freq: 2500, to: 300 });
    s.fx.burst(sx, sy, { colors: s.gold ? ['#fde047', '#fbbf24', '#fff'] : ['#fffbeb', '#fef3c7', '#fde68a'], count: 26, speed: 260, life: 0.8, gravity: 600 });
    s.fx.burst(sx, sy, { colors: ['#facc15', '#f59e0b'], count: 16, speed: 140, life: 0.7, gravity: 500 });
    s.fx.text(sx, Math.min(sy, H - 60) - 40, 'SPLAT!', { color: '#facc15', size: 30 });
    s.hurt();
  }

  deliver() {
    const s = this.s, L = this.level;
    this.delivered = true;
    const par = this.goalX / PX_PER_M / 13, spare = Math.max(0, Math.floor(par - this.time));
    s.award(500 * L, W / 2, H * 0.36, { color: '#fde047', size: 26 });
    if (spare) s.award(spare * 15 * L, W / 2, H * 0.44, { color: '#86efac', size: 20 });
    const perfect = this.egg.cracks === 0 && s.lives >= this.livesAtStart;
    if (perfect) { s.award(1000 * L, W / 2, H * 0.52, { color: '#fef3c7', size: 22 }); if (L >= 3) s.unlock('clean'); }
    s.fx.text(W / 2, H * 0.24, perfect ? 'PERFECT DELIVERY! 🥚✨' : 'DELIVERED! 🥚', { color: '#fff', size: 34, life: 1.5 });
    s.sound.play('levelup');
    setTimeout(() => {}, 0);
    s.completeLevel();
  }

  onLevelClear() {}

  puff(x, y, dir, oil = false) {
    if (this.dust.length > 160) return;
    const col = oil ? '#111827' : this.T.dirt[0];
    this.dust.push({ x, y, z: (Math.random() - 0.5) * 40, vx: -dir * (60 + Math.random() * 80) + (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 50, life: 0.5 + Math.random() * 0.3, max: 0.8, r: 3 + Math.random() * 4, col });
  }
  tickDust(dt) {
    for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 60 * dt; d.life -= dt; d.r += dt * 8; }
    this.dust = this.dust.filter((d) => d.life > 0);
  }

  // ── Drawing ────────────────────────────────────────────────
  /** screen position of a world point on the road's centre line */
  scr(x, y, z = 0) { const c = this.cam3; c.x = this.cam.x; c.y = this.cam.y; const p = c.p(x, y, z); return p || [W / 2, H / 2, 1]; }

  render(ctx) {
    const T = this.T, cam = this.cam3, t = this.t;
    cam.x = this.cam.x; cam.y = this.cam.y;
    const fog = S.rgb(T.fog);
    // sky
    const sg = ctx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, T.sky[0]); sg.addColorStop(1, T.sky[1]);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    if (T.stars) for (const st of this.stars) { ctx.globalAlpha = 0.3 + st.z * 0.6 * (0.6 + 0.4 * Math.sin(t * 2 + st.x)); ctx.fillStyle = '#fff'; ctx.fillRect(((st.x - this.cam.x * 0.01 * st.z) % W + W) % W, st.y, 1.5, 1.5); }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.shadowColor = T.sun; ctx.shadowBlur = 50; ctx.fillStyle = T.sun;
    ctx.beginPath(); ctx.arc(W * 0.8, 70, T.stars ? 24 : 32, 0, TAU); ctx.fill(); ctx.restore();
    if (!T.stars) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const cl of this.clouds) {
        const x = ((cl.x - this.cam.x * 0.08 - t * 6) % 3000 + 3000) % 3000 - 200;
        if (x > W + 100) continue;
        ctx.beginPath(); ctx.ellipse(x, cl.y, 44 * cl.s, 15 * cl.s, 0, 0, TAU); ctx.ellipse(x + 24 * cl.s, cl.y - 10 * cl.s, 28 * cl.s, 15 * cl.s, 0, 0, TAU); ctx.ellipse(x - 22 * cl.s, cl.y - 4 * cl.s, 22 * cl.s, 12 * cl.s, 0, 0, TAU); ctx.fill();
      }
    }
    // far mountains at real depth (they slide by slowly because they're far away)
    this.mountains(ctx, 5200, 0.0009, 520, T.far, 0.55, fog);
    this.mountains(ctx, 2600, 0.0017, 300, T.mid, 0.3, fog);

    // the land: back field → props behind → road → truck → front verge & cliff face
    const x0 = this.cam.x - 1100, x1 = this.cam.x + 1200;
    this.drawField(ctx, x0, x1, S.RW, 560, fog);
    const behind = this.props.filter((p) => p.z > 0 && p.x > x0 - 200 && p.x < x1 + 200).sort((a, b) => b.z - a.z);
    for (const p of behind) this.drawProp(ctx, p, fog);
    this.drawFarm(ctx, fog);
    this.drawRoad(ctx, x0, x1);
    this.drawWorldThings(ctx);
    this.drawFront(ctx, x0, x1);
    for (const p of this.props.filter((q) => q.z < 0 && q.x > x0 && q.x < x1)) this.drawProp(ctx, p, null);
    // wind streaks
    if (this.streaks.length) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      for (const st of this.streaks) { const a = cam.p(st.x, st.y, st.z), b = cam.p(st.x - Math.sign(st.vx) * 60, st.y, st.z); if (!a || !b) continue; ctx.globalAlpha = Math.min(1, st.life); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.restore();
    }
    this.drawHud(ctx);
  }

  mountains(ctx, z, freq, amp, col, haze, fog) {
    const cam = this.cam3, c = S.mix(S.rgb(col), fog, haze);
    const k = cam.f / (z - cam.z), span = W / k;
    const baseY = 330;
    ctx.fillStyle = S.css(c); ctx.beginPath();
    const xa = cam.x - span / 2 - 200, xb = cam.x + span / 2 + 200, st = span / 60;
    let first = true;
    for (let x = xa; x <= xb; x += st) {
      const y = baseY - amp * (0.55 + 0.3 * Math.sin(x * freq + z) + 0.15 * Math.sin(x * freq * 3.1 + 1.3 * z)) - 40;
      const p = cam.p(x, y, z); if (!p) continue;
      if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.lineTo(W + 10, H + 10); ctx.lineTo(-10, H + 10); ctx.closePath(); ctx.fill();
  }

  /** the meadow behind the road */
  drawField(ctx, x0, x1, za, zb, fog) {
    const cam = this.cam3, T = this.T, g = S.rgb(T.grass);
    const step = STEP * 3;
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
      const ya = this.ground(x), yb = this.ground(x + step);
      if (ya > 1500 || yb > 1500) continue;
      const pa = cam.p(x, ya, zb), pb = cam.p(x + step, yb, zb), pc = cam.p(x + step, yb, za), pd = cam.p(x, ya, za);
      if (!pa || !pd) continue;
      const sl = (yb - ya) / step, lit = clamp(0.85 - sl * 0.6, 0.55, 1.15);
      const c = S.mix(g.map((v) => Math.min(255, v * lit)), fog, 0.12);
      ctx.fillStyle = ctx.strokeStyle = S.css(c);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.lineTo(pc[0], pc[1]); ctx.lineTo(pd[0], pd[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      // the far edge drops down as a hillside
      const pe = cam.p(x, ya + 400, zb), pf = cam.p(x + step, yb + 400, zb);
      ctx.fillStyle = S.css(S.mix(c, fog, 0.25)); ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.lineTo(pf[0], pf[1]); ctx.lineTo(pe[0], pe[1]); ctx.fill();
    }
  }

  drawRoad(ctx, x0, x1) {
    const cam = this.cam3, T = this.T, road = S.rgb(T.road);
    for (let x = Math.floor(x0 / STEP) * STEP; x < x1; x += STEP) {
      const ya = this.ground(x), yb = this.ground(x + STEP);
      if (ya > 1500 || yb > 1500) continue;
      const pa = cam.p(x, ya, S.RW), pb = cam.p(x + STEP, yb, S.RW), pc = cam.p(x + STEP, yb, -S.RW), pd = cam.p(x, ya, -S.RW);
      if (!pa || !pd) continue;
      const sl = (yb - ya) / STEP, lit = clamp(0.95 - sl * 0.5, 0.6, 1.2);
      let c = road.map((v) => Math.min(255, v * lit));
      if (this.oily(x)) c = [24, 24, 32];
      if (this.lowG.some((z) => x > z.x0 && x < z.x1)) c = S.mix(c, [167, 139, 250], 0.35);
      if ((Math.floor(x / 40) & 1) === 0) c = c.map((v) => Math.min(255, v + 6));
      ctx.fillStyle = ctx.strokeStyle = S.css(c);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.lineTo(pc[0], pc[1]); ctx.lineTo(pd[0], pd[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      // wheel ruts
      for (const zz of [-24, 24]) { const r1 = cam.p(x, ya, zz), r2 = cam.p(x + STEP, yb, zz); ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r1[0], r1[1]); ctx.lineTo(r2[0], r2[1]); ctx.stroke(); }
      ctx.lineWidth = 1;
    }
    // chasms: dark pits with rocky walls
    for (const gp of this.gaps) {
      if (gp.x1 < x0 || gp.x0 > x1) continue;
      const ya = this.ground(gp.x0 - STEP), yb = this.ground(gp.x1 + 1);
      const a1 = cam.p(gp.x0, ya, S.RW + 300), a2 = cam.p(gp.x1, yb, S.RW + 300), a3 = cam.p(gp.x1, yb, -S.RW), a4 = cam.p(gp.x0, ya, -S.RW);
      const b4 = cam.p(gp.x0, ya + 600, -S.RW), b3 = cam.p(gp.x1, yb + 600, -S.RW);
      if (!a1 || !b4) continue;
      const g = ctx.createLinearGradient(0, Math.min(a1[1], a2[1]), 0, H);
      g.addColorStop(0, '#1c1917'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.lineTo(a3[0], a3[1]); ctx.lineTo(b3[0], b3[1]); ctx.lineTo(b4[0], b4[1]); ctx.lineTo(a4[0], a4[1]); ctx.closePath(); ctx.fill();
      // far wall of the chasm, lit
      const w1 = cam.p(gp.x1, yb, S.RW), w2 = cam.p(gp.x1, yb + 300, S.RW), w3 = cam.p(gp.x1, yb + 300, -S.RW);
      ctx.fillStyle = S.css(S.rgb(this.T.dirt[0])); ctx.beginPath(); ctx.moveTo(w1[0], w1[1]); ctx.lineTo(a3[0], a3[1]); ctx.lineTo(w3[0], w3[1]); ctx.lineTo(w2[0], w2[1]); ctx.fill();
      // warning stripes on the launch ramp lip
      const l1 = cam.p(gp.x0 - 6, ya, -S.RW), l2 = cam.p(gp.x0 - 6, ya, S.RW);
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 4; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l2[0], l2[1]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    }
  }

  /** front grass verge and the cut-away cliff face of the hill */
  drawFront(ctx, x0, x1) {
    const cam = this.cam3, T = this.T, g = S.rgb(T.grass), d0 = S.rgb(T.dirt[0]), d1 = S.rgb(T.dirt[1]);
    const zf = -S.RW - 90;
    for (let x = Math.floor(x0 / STEP) * STEP; x < x1; x += STEP) {
      const ya = this.ground(x), yb = this.ground(x + STEP);
      if (ya > 1500 || yb > 1500) continue;
      const pa = cam.p(x, ya, -S.RW), pb = cam.p(x + STEP, yb, -S.RW), pc = cam.p(x + STEP, yb, zf), pd = cam.p(x, ya, zf);
      if (!pa || !pd) continue;
      const sl = (yb - ya) / STEP, lit = clamp(1 - sl * 0.5, 0.7, 1.2);
      ctx.fillStyle = ctx.strokeStyle = S.css(g.map((v) => Math.min(255, v * lit)));
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.lineTo(pc[0], pc[1]); ctx.lineTo(pd[0], pd[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      // cliff face with strata
      const pe = cam.p(x, ya + 420, zf), pf = cam.p(x + STEP, yb + 420, zf);
      const gr = ctx.createLinearGradient(0, pd[1], 0, pd[1] + 220);
      gr.addColorStop(0, S.css(d0)); gr.addColorStop(1, S.css(d1));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(pd[0], pd[1]); ctx.lineTo(pc[0], pc[1]); ctx.lineTo(pf[0], pf[1]); ctx.lineTo(pe[0], pe[1]); ctx.closePath(); ctx.fill();
      if ((Math.floor(x / STEP) % 7) === 0) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(pd[0], pd[1] + 30 + (x % 23), pc[0] - pd[0] + 1, 5); }
    }
  }

  drawProp(ctx, p, fog) {
    const cam = this.cam3, T = this.T, y = this.ground(p.x);
    if (y > 1500) return;
    const haze = fog ? S.mix(S.rgb(T.fog), S.rgb(T.fog), 0) : null;
    const f = fog ? [haze, clamp((p.z - 100) / 900, 0, 0.45)] : null;
    if (p.kind === 'rock') S.drawMesh(ctx, cam, S.ROCK, [p.x, y + 4, p.z], 0, ['#78716c', '#57534e'], { scale: p.s, fog: f });
    else S.drawMesh(ctx, cam, p.kind === 'pine' ? S.PINE : S.OAK, [p.x, y + 2, p.z], 0, [T.tree[p.c === 2 ? 2 : 0], T.tree[1], T.tree[2]], { scale: p.s, fog: f });
  }

  drawFarm(ctx, fog) {
    if (this.bonus) return;
    const cam = this.cam3, gx = this.goalX;
    if (Math.abs(gx - this.cam.x) > 1600) return;
    const y = this.ground(gx + 120);
    S.drawMesh(ctx, cam, S.BARN, [gx + 140, y + 2, S.RW + 140], 0, ['#b91c1c', '#7f1d1d', '#451a03', '#f8fafc']);
    // finish arch over the road
    for (const z of [-S.RW - 10, S.RW + 10]) S.drawMesh(ctx, cam, S.POST, [gx, this.ground(gx) + 2, z], 0, ['#f8fafc']);
    const a = cam.p(gx, this.ground(gx) - 118, -S.RW - 10), b = cam.p(gx, this.ground(gx) - 90, S.RW + 10);
    if (a && b) {
      ctx.fillStyle = '#16a34a'; ctx.fillRect(a[0] - 3, a[1], 6, b[1] - a[1] + 14);
      ctx.save(); ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 6); ctx.fillStyle = '#16a34a'; roundRect(ctx, -80, -16, 160, 30, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🥚 EGG DROP-OFF', 0, 0); ctx.restore();
    }
  }

  drawWorldThings(ctx) {
    const cam = this.cam3, s = this.s, t = this.t, T = this.T;
    // checkpoint flag
    if (!this.bonus && Math.abs(this.checkX - this.cam.x) < 1200) {
      const y = this.ground(this.checkX), base = cam.p(this.checkX, y, -S.RW - 14), top = cam.p(this.checkX, y - 110, -S.RW - 14);
      if (base && top) {
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
        ctx.fillStyle = this.flagged ? '#22c55e' : '#ef4444'; ctx.beginPath(); ctx.moveTo(top[0], top[1]);
        for (let i = 0; i <= 6; i++) ctx.lineTo(top[0] + i * 7, top[1] + Math.sin(t * 6 + i) * 3); ctx.lineTo(top[0] + 42, top[1] + 24); ctx.lineTo(top[0], top[1] + 24); ctx.fill();
      }
    }
    // mushrooms
    for (const m of this.mushrooms) {
      if (Math.abs(m.x - this.cam.x) > 1100) continue;
      const sq = 1 - (m.squash || 0) * 0.35;
      S.drawMesh(ctx, cam, S.MUSHROOM, [m.x, this.ground(m.x) + 2, 0], 0, ['#ef4444', '#fef3c7', '#ffffff'], { scale: 1.2 * sq });
    }
    // coins (spinning 3D discs)
    for (const cn of this.coins) {
      if (cn.got || Math.abs(cn.x - this.cam.x) > 1100) continue;
      const p = cam.p(cn.x, cn.y, 0); if (!p) continue;
      const r = 11 * p[2], sx = Math.max(0.15, Math.abs(Math.cos(t * 3 + cn.spin)));
      ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.ellipse(p[0] + 1.5, p[1], r * sx, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * sx, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.ellipse(p[0] - r * sx * 0.3, p[1] - r * 0.3, r * sx * 0.3, r * 0.3, 0, 0, TAU); ctx.fill();
    }
    // dust
    for (const d of this.dust) { const p = cam.p(d.x, d.y, d.z); if (!p) continue; ctx.globalAlpha = d.life / d.max * 0.6; ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(p[0], p[1], d.r * p[2], 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    // the truck: far wheels, body, egg, near wheels
    const c = this.car, gold = s.gold;
    const paint = gold ? ['#fbbf24', '#78350f', '#fef3c7', '#fff7ae', '#fde68a'] : ['#f97316', '#1f2937', '#bae6fd', '#fde047', '#e5e7eb'];
    const wheelPal = ['#111827', '#1f2937', '#000', '#000', gold ? '#fde047' : '#cbd5e1', '#374151', '#64748b'];
    for (const wh of c.wheels) S.drawMesh(ctx, cam, S.WHEEL, [wh.x, wh.y, 23], wh.rot, wheelPal);
    // shadow under the truck
    const sp = cam.p(c.x, this.ground(c.x), 0);
    if (sp && this.ground(c.x) < 1500) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(sp[0], sp[1], 52 * sp[2], 9 * sp[2], 0, 0, TAU); ctx.fill(); }
    S.drawMesh(ctx, cam, S.TRUCK, [c.x, c.y, 0], c.a, paint);
    this.drawEgg(ctx);
    for (const wh of c.wheels) S.drawMesh(ctx, cam, S.WHEEL, [wh.x, wh.y, -23], wh.rot, wheelPal);
  }

  drawEgg(ctx) {
    const e = this.egg, cam = this.cam3, s = this.s;
    if (e.alive) {
      const gold = this.bonus || s.gold;
      S.drawMesh(ctx, cam, S.EGG, [e.x, e.y, 0], e.a, [gold ? '#facc15' : '#fff7ed'], { amb: 0.62 });
      const p = cam.p(e.x, e.y, -11);
      if (p && e.cracks) {
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(e.a); ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.4;
        e.crackSeeds.forEach((sd, i) => { const k = p[2]; ctx.beginPath(); ctx.moveTo(sd * 6 * k, (-12 + i * 6) * k); ctx.lineTo((sd * 6 + 4) * k, (-8 + i * 6) * k); ctx.lineTo((sd * 6 - 2) * k, (-3 + i * 6) * k); ctx.lineTo((sd * 6 + 3) * k, (2 + i * 6) * k); ctx.stroke(); });
        ctx.restore();
      }
    } else if (e.splat && !e.splat.lost) {
      const p = cam.p(e.splat.x, e.splat.y, 0); if (!p) return;
      const k = p[2], gr = Math.min(1, e.splat.t * 3 + 0.4);
      ctx.fillStyle = '#fffbeb'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 34 * k * gr, 7 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(p[0] + 3 * k, p[1] - 2 * k, 11 * k, 5 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fef3c7'; for (const d of [-26, -14, 18, 28]) { ctx.beginPath(); ctx.moveTo(p[0] + d * k, p[1]); ctx.lineTo(p[0] + d * 0.8 * k, p[1] - 9 * k); ctx.lineTo(p[0] + (d + 5) * k, p[1]); ctx.fill(); }
    }
  }

  drawHud(ctx) {
    const s = this.s, e = this.egg;
    ctx.save();
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 20, '#fbbf24', `★ GOLDEN EGG RUN · ${Math.ceil(s.bonusLeft)}s`);
    else {
      const frac = clamp(this.maxX / this.goalX, 0, 1), m = Math.max(0, Math.round((this.goalX - this.car.x) / PX_PER_M));
      progressBar(ctx, 14, 12, W - 200, 20, frac, '#4ade80', this.delivered ? 'Delivered!' : `🚚 ${m} m to the farm`);
      // checkpoint tick on the bar
      ctx.fillStyle = this.flagged ? '#22c55e' : '#fff'; ctx.fillRect(14 + (W - 200) * 0.5 - 1, 9, 3, 26);
      // the egg's condition
      ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, W - 176, 8, 162, 28, 14); ctx.fill();
      ctx.font = '800 14px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText('Egg', W - 164, 22);
      for (let i = 0; i < 3; i++) {
        const cx = W - 116 + i * 30, broken = i < (e.alive ? e.cracks : 3);
        ctx.fillStyle = broken ? '#7f1d1d' : s.gold ? '#facc15' : '#fff7ed';
        ctx.beginPath(); ctx.ellipse(cx, 22, 8, 10, 0, 0, TAU); ctx.fill();
        if (broken) { ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 5, 18); ctx.lineTo(cx, 23); ctx.lineTo(cx - 2, 26); ctx.lineTo(cx + 4, 30); ctx.stroke(); }
      }
    }
    const hint = matchMedia('(pointer: coarse)').matches ? 'Hold right side: drive · left side: brake' : '→ drive · ← brake · in the air → tips back, ← tips forward';
    if (this.time < 6) { ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(hint, W / 2, H - 16); }
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'right'; ctx.fillText('★ GOLDEN EGG TRUCK', W - 14, 50); }
    ctx.restore();
  }
}
void Store;

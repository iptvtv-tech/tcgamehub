// ─────────────────────────────────────────────────────────────
//  TURBO RUSH — game 13 (Zone 3 · Master)
//  A neon highway racer drawn in classic "pseudo-3D" arcade style.
//  Reach the checkpoint before the clock runs out. Weave through traffic:
//  every car you pass scores, skimming close past one is a NEAR MISS combo.
//  Hit a car and you lose a life. Run out of time and you lose a life (+15 s).
//
//    L1 gentle curves      L2 hills          L3 more traffic     L4 trucks
//    L6 night              L7 lane-changers (they blink first)   L8 rain (less grip)
//    L11 fog               L12+ everything, faster, tighter clock
//  Every 5th level: ★ COIN HIGHWAY — no traffic, no clock, grab the coins.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'turbo-rush';
const W = 480, H = 720;
const HORIZON = 318;                 // screen y of the road's vanishing point
const SEG = 200;                     // length of one road segment (world units)
const ROAD = 1000;                   // half-width of the road (world units); road runs x = -1..1
const CAM_H = 1000;                  // camera height
const CAM_DEPTH = 0.84;              // ≈ 100° field of view
const PLAYER_Z = CAM_H * CAM_DEPTH;  // distance from camera to the player's car
const BASE_MAX = 12000;              // top speed at level 1 before scaling (world units / s)
const LANES = [-2 / 3, 0, 2 / 3];
const PLAYER_W = 0.36;
const VS = 340;                      // vertical projection scale (puts the road under the player's car)
const PLAYER_PX = PLAYER_W * ROAD * (CAM_DEPTH / PLAYER_Z) * W / 2;   // the player's car width on screen

const lerp = (a, b, t) => a + (b - a) * t;
const easeIn = (a, b, t) => a + (b - a) * t * t;
const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

// Colour themes
const THEMES = {
  dusk:  { sky: ['#1e0b3d', '#7c2d6b', '#f97316'], sun: '#fbbf24', grass: ['#1a0f33', '#150c2b'], rumble: ['#f472b6', '#e2e8f0'], road: ['#2a2540', '#262139'], lane: '#e2e8f0', fog: '#3b1d55', city: '#2b1247', glow: '#f472b6' },
  night: { sky: ['#020617', '#0b1030', '#1e1b4b'], sun: '#e2e8f0', grass: ['#070b1c', '#050817'], rumble: ['#22d3ee', '#1e293b'], road: ['#161a2e', '#131728'], lane: '#67e8f9', fog: '#0b1030', city: '#0f172a', glow: '#22d3ee' },
  rain:  { sky: ['#0b1220', '#1e293b', '#334155'], sun: null, grass: ['#0d1a1a', '#0b1616'], rumble: ['#a3e635', '#1e293b'], road: ['#1c2331', '#19202d'], lane: '#cbd5e1', fog: '#1e293b', city: '#111827', glow: '#a3e635' },
  fog:   { sky: ['#1f2937', '#4b5563', '#9ca3af'], sun: null, grass: ['#1f2a24', '#1b251f'], rumble: ['#fb7185', '#e5e7eb'], road: ['#2d3340', '#2a303c'], lane: '#f1f5f9', fog: '#8b93a1', city: '#374151', glow: '#fb7185' },
  gold:  { sky: ['#2a1403', '#7c2d12', '#fbbf24'], sun: '#fde68a', grass: ['#2b1705', '#241304'], rumble: ['#fbbf24', '#fff7ed'], road: ['#3a2a14', '#352612'], lane: '#fde68a', fog: '#7c2d12', city: '#451a03', glow: '#fbbf24' },
};
const CAR_COLS = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#facc15', '#fb923c', '#e879f9'];

function themeFor(level, bonus) {
  if (bonus) return 'gold';
  if (level >= 11) return ['fog', 'rain', 'night'][(level - 11) % 3];     // 11 fog · 12 rain · 13 night · 14 fog …
  if (level === 8) return 'rain';
  if (level >= 6) return 'night';
  return 'dusk';
}

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 3,
  comboStep: 3,
  maxMultiplier: 6,
  bonusTime: 15,
  music: { bpm: 128, style: 'minor', lead: 'sawtooth', bass: 'drive', arp: [0, 2, 4, 2, 1, 3, 5, 3] },
  levelInfo(level, bonus) {
    if (bonus) return '★ COIN HIGHWAY! No traffic, no clock — grab every coin you can in 15 seconds.';
    const notes = {
      1: 'Reach the checkpoint before the clock runs out! Steer ← →, ↑ boost, ↓ brake. Skim past cars for NEAR MISS combos — but don\'t touch them.',
      2: 'Hills ahead — you can\'t see what\'s over the top.',
      3: 'Rush hour: more traffic.',
      4: '🚚 Trucks: wide and slow. Plan your gap early.',
      6: '🌙 Night drive. Watch for tail lights.',
      7: '↔️ Some drivers change lanes — they blink first!',
      8: '🌧️ Rain: less grip, the road pulls you wide on bends.',
      11: '🌫️ Fog: you can\'t see far. Trust your reflexes.',
    };
    return notes[level] || 'Faster traffic, tighter clock. Keep your foot down!';
  },
  create: (shell) => new TurboRush(shell),
});

class TurboRush {
  constructor(s) {
    this.s = s; this.t = 0;
    this.rain = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 500 }));
    this.stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * HORIZON * 0.8, r: Math.random() * 1.3 + 0.3 }));
    this.city = Array.from({ length: 36 }, (_, i) => ({ x: i * 34, h: 20 + ((i * 53) % 70), w: 26 + ((i * 17) % 14) }));
    this.startLevel(1, false);
  }

  reset() {}

  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.themeId = themeFor(level, bonus);
    this.theme = THEMES[this.themeId];
    this.col = { grass: this.theme.grass.map(hex), rumble: this.theme.rumble.map(hex), road: this.theme.road.map(hex), fog: hex(this.theme.fog) };
    this.maxSpeed = BASE_MAX * 0.78 * s.speed(0.028, 1.45, level) * (bonus ? 1.1 : 1);
    this.grip = this.themeId === 'rain' ? 0.8 : 1;
    this.centrifugal = this.themeId === 'rain' ? 0.42 : 0.3;
    this.drawDist = this.themeId === 'fog' ? 70 : 150;
    this.fogDensity = this.themeId === 'fog' ? 6 : this.themeId === 'rain' ? 3 : 2;
    this.position = 0; this.speed = 0; this.playerX = 0; this.playerY = 0;
    this.skyOff = 0; this.boost = 1; this.boosting = false;
    this.invuln = 0; this.crashFx = 0; this.shakeT = 0;
    this.near = 0; this.nearChain = 0; this.passedCount = 0; this.crashes = 0; this.coinsGot = 0;
    this.buildTrack(r);
    this.cars = bonus ? [] : this.buildTraffic(r);
    this.pickups = this.buildPickups(r);
    const avg = Math.min(0.76, 0.62 + level * 0.01);            // average speed the clock expects (fraction of top speed)
    this.timeMax = bonus ? 0 : Math.round(this.finishZ / (this.maxSpeed * avg) + 3);
    this.timeLeft = this.timeMax;
    this.done = false;
  }

  // ── Track ──────────────────────────────────────────────────
  buildTrack(r) {
    const L = this.level, segs = [];
    let lastY = 0;
    const add = (enter, hold, leave, curve, y) => {
      const startY = lastY, endY = startY + y * SEG, total = enter + hold + leave;
      for (let n = 0; n < total; n++) {
        const c = n < enter ? easeIn(0, curve, n / enter) : n < enter + hold ? curve : easeInOut(curve, 0, (n - enter - hold) / leave);
        const yy = easeInOut(startY, endY, (n + 1) / total);
        const i = segs.length;
        segs.push({ i, curve: c, y1: i ? segs[i - 1].y2 : 0, y2: yy, p1: {}, p2: {}, clip: 0 });
      }
      lastY = endY;
    };
    const secs = this.bonus ? 17 : 38 + Math.min(14, L);
    const want = Math.ceil(this.maxSpeed * 0.9 * secs / SEG);
    add(20, 40, 20, 0, 0);                                      // straight start
    const hills = L >= 2 || this.bonus;
    const curveMax = this.bonus ? 3 : Math.min(6, 2 + L * 0.35);
    while (segs.length < want) {
      const kind = r.int(0, 9);
      const len = r.pick([25, 40, 55]);
      const curve = (r.chance(0.5) ? -1 : 1) * r.range(1.5, curveMax);
      const hill = hills ? r.pick([0, 20, 40, 60]) * (r.chance(0.5) ? -1 : 1) * (this.bonus ? 0.5 : 1) : 0;
      if (kind <= 2) add(len, len, len, 0, hill);
      else if (kind <= 6) add(len, len, len, curve, hill);
      else if (kind === 7) { add(len, len / 2 | 0, len, curve, hill / 2); add(len, len / 2 | 0, len, -curve, -hill / 2); }  // S-bend
      else add(len / 2 | 0, len / 2 | 0, len / 2 | 0, 0, hills ? r.pick([-40, 40]) : 0);                                 // quick hill
    }
    const finishIndex = segs.length + 10;
    add(30, 30, 30, 0, -lastY / SEG);                            // level out for the checkpoint
    add(40, 160, 40, 0, 0);                                      // run-off after the line
    this.segs = segs;
    this.finishIndex = finishIndex;
    this.finishZ = finishIndex * SEG;
    this.trackLen = segs.length * SEG;
  }
  segAt(z) { return this.segs[clamp(Math.floor(z / SEG), 0, this.segs.length - 1)]; }

  buildTraffic(r) {
    const L = this.level, cars = [];
    const gap = Math.max(12, 30 - L * 1.5);                      // segments between cars (on average)
    let pairGap = 0;
    for (let i = 45; i < this.finishIndex - 10; i += Math.max(6, Math.round(gap * r.range(0.5, 1.5))) + pairGap) {
      pairGap = 0;
      const truck = L >= 4 && r.chance(Math.min(0.3, 0.12 + L * 0.012));
      const lane = r.int(0, 2);
      cars.push({
        z: i * SEG, x: LANES[lane], lane, truck,
        w: truck ? 0.5 : 0.36,
        speed: this.maxSpeed * (truck ? r.range(0.2, 0.3) : r.range(0.28, 0.5 + Math.min(0.15, L * 0.01))),
        color: this.s.rng.pick(CAR_COLS),
        changer: !truck && L >= 7 && r.chance(Math.min(0.35, 0.12 + (L - 7) * 0.03)),
        blink: 0, nextChange: r.range(1.5, 4), scored: false, ahead: true,
      });
      // sometimes a second car side by side (never all three lanes)
      if (L >= 3 && r.chance(Math.min(0.28, 0.08 + L * 0.015))) {
        pairGap = 8;                                             // always room to get round a pair before the next car
        const l2 = (lane + r.int(1, 2)) % 3;
        cars.push({ z: i * SEG + r.range(-60, 60), x: LANES[l2], lane: l2, truck: false, w: 0.36, speed: cars[cars.length - 1].speed, color: r.pick(CAR_COLS), changer: false, blink: 0, nextChange: 99, scored: false, ahead: true });
      }
    }
    return cars;
  }

  buildPickups(r) {
    const out = [];
    if (this.bonus) {
      // long ribbons of coins that weave across the lanes
      for (let i = 40; i < this.finishIndex; i += 3) {
        const x = Math.sin(i / 23) * 0.66;
        out.push({ z: i * SEG, x, kind: 'coin' });
      }
      return out;
    }
    for (let i = 60; i < this.finishIndex - 20; i += r.int(28, 55)) {
      const nitro = r.chance(0.3);
      const lane = r.pick(LANES);
      if (nitro) out.push({ z: i * SEG, x: lane, kind: 'nitro' });
      else for (let k = 0; k < 5; k++) out.push({ z: (i + k * 2) * SEG, x: lane, kind: 'coin' });
    }
    return out;
  }

  // ── Input ──────────────────────────────────────────────────
  controls() {
    const s = this.s, inp = s.input, p = inp.pointer;
    let left = inp.isDown('left'), right = inp.isDown('right'), boost = inp.isDown('up'), brake = inp.isDown('down');
    if (p.down) {
      if (p.x < W * 0.36) left = true;
      else if (p.x > W * 0.64) right = true;
      else boost = true;
    }
    return { left, right, boost, brake };
  }

  onLifeLost() {
    const pz = this.position + PLAYER_Z;
    this.speed = 0; this.invuln = 2;
    this.playerX = LANES.reduce((a, b) => (Math.abs(b - this.playerX) < Math.abs(a - this.playerX) ? b : a));
    this.cars = this.cars.filter((c) => c.z < pz - 300 || c.z > pz + 26 * SEG);      // clear the road ahead
    if (this.timeLeft <= 0) this.timeLeft = 15;
    else this.timeLeft += 5;                                         // a crash already costs a life — don't lose the checkpoint too
    this.nearChain = 0;
  }

  idle(dt) { this.t += dt; }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s, L = this.level;
    this.t += dt;
    if (this.done) return;
    const c = this.controls();
    const max = this.maxSpeed;
    const seg = this.segAt(this.position + PLAYER_Z);
    const pct = this.speed / max;

    // steering + the road pulling you wide on bends
    const dx = dt * 2 * Math.min(1, pct + 0.15) * this.grip;
    if (c.left) this.playerX -= dx;
    if (c.right) this.playerX += dx;
    this.playerX -= dx * pct * seg.curve * this.centrifugal;
    this.steer = lerp(this.steer || 0, (c.right ? 1 : 0) - (c.left ? 1 : 0), Math.min(1, dt * 10));

    // speed: foot down by default, boost burns nitro
    this.boosting = c.boost && this.boost > 0.02 && !c.brake;
    const top = this.boosting ? max * 1.28 : max;
    if (c.brake) this.speed -= max * 1.2 * dt;
    else if (this.speed < top) this.speed += max / (this.boosting ? 2.5 : 4.2) * dt;
    else this.speed -= max / 3 * dt;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.28);
    else this.boost = Math.min(1, this.boost + dt * 0.035);
    const off = Math.abs(this.playerX) > 1;
    if (off && this.speed > max / 4) this.speed -= max * 0.9 * dt;
    this.speed = clamp(this.speed, 0, max * 1.3);
    this.playerX = clamp(this.playerX, -2.2, 2.2);
    if (off && this.speed > 500) { this.shakeT = 0.05; if (Math.random() < dt * 8) s.fx.burst(W / 2 + (this.playerX > 0 ? 40 : -40), H - 70, { colors: ['#94a3b8', '#64748b'], count: 2, speed: 90, life: 0.3 }); }

    this.position += this.speed * dt;
    const pz = this.position + PLAYER_Z;
    this.skyOff += seg.curve * pct * dt * 0.9;
    const ps = this.segAt(pz), pp = (pz % SEG) / SEG;
    this.playerY = lerp(ps.y1, ps.y2, pp);
    if (this.invuln > 0) this.invuln -= dt;

    // distance points
    if (!this.bonus) {
      this.distPts = (this.distPts || 0) + this.speed * dt / 60 * (1 + L * 0.1);
      if (this.distPts >= 1) { const n = Math.floor(this.distPts); this.distPts -= n; s.award(n); }
    }

    // clock
    if (this.timeMax) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 5 && Math.ceil(this.timeLeft) !== Math.ceil(this.timeLeft + dt) && this.timeLeft > 0) s.sound.play('tick');
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        s.fx.text(W / 2, HORIZON, 'TIME UP!', { color: '#f87171', size: 44, life: 1.4 });
        s.sound.play('boom');
        s.hurt();
        return;
      }
    }

    // traffic: everyone drives at their own pace, but slows down rather than hit the car in front — or you
    const sorted = this.cars;
    sorted.sort((a, b) => a.z - b.z);
    for (let i = 0; i < sorted.length; i++) {
      const car = sorted[i];
      car.base ??= car.speed;
      let v = car.base;
      for (let j = i + 1; j < sorted.length && sorted[j].z - car.z < SEG * 3; j++) {
        const o = sorted[j];
        if (Math.abs(o.x - car.x) < 0.4) v = Math.min(v, o.speed * 0.98);
      }
      const behindYou = pz - car.z;
      if (behindYou > 0 && behindYou < SEG * 4 && Math.abs(car.x - this.playerX) < 0.45) v = Math.min(v, this.speed * 0.9);
      car.speed = v;
    }
    for (const car of sorted) {
      car.z += car.speed * dt;
      if (car.changer) {
        car.nextChange -= dt;
        if (car.nextChange <= 0 && !car.blink && car.z - pz < 40 * SEG && car.z > pz + 6 * SEG) {
          const opts = [car.lane - 1, car.lane + 1].filter((l) => l >= 0 && l <= 2);
          car.to = s.rng.pick(opts); car.blink = 0.9;
        }
        if (car.blink > 0) {
          car.blink -= dt;
          if (car.blink <= 0) { car.blink = 0; car.lane = car.to; car.nextChange = s.rng.range(2.5, 5); }
        }
        car.x = lerp(car.x, LANES[car.lane], Math.min(1, dt * 2.2));
      }
    }
    sorted.sort((a, b) => a.z - b.z);
    for (const car of sorted) {
      const dz = car.z - pz;
      if (dz > 3 * SEG) break;
      const gapX = Math.abs(car.x - this.playerX), touch = (car.w + PLAYER_W) / 2 * 0.86;
      if (dz > -60 && dz < (car.truck ? 190 : 140) && gapX < touch && this.invuln <= 0) { this.lastCrash = { dz: Math.round(dz), gapX: +gapX.toFixed(2), px: +this.playerX.toFixed(2), cx: +car.x.toFixed(2), changer: car.changer, truck: car.truck }; this.crash(car); return; }
      const ahead = car.z > pz, justPassed = car.ahead && !ahead;
      car.ahead = ahead;
      if (justPassed && !car.scored) {
        car.scored = true;
        const x = W / 2 + (car.x - this.playerX) * 150, y = H - 150;
        if (gapX < touch + 0.2) {
          this.near++; this.nearChain++;
          s.award(40 * L, x, y, { chain: true, color: '#fde047', size: 20 });
          s.fx.text(x, y - 26, this.nearChain >= 3 ? `NEAR MISS ×${this.nearChain}` : 'NEAR MISS!', { color: '#fde047', size: 18 });
          s.sound.tone({ freq: 500 + Math.min(12, this.nearChain) * 60, to: 1100, dur: 0.12, type: 'triangle', vol: 0.06 });
          if (this.nearChain >= 10) s.unlock('nearmiss');
        } else {
          s.award(10 * L, x, y, { chain: true, color: '#a5f3fc', size: 14 });
        }
        this.passedCount++;
      }
    }
    // a car overtaking YOU breaks the near-miss chain
    this.cars = sorted.filter((car) => car.z < this.trackLen);

    // pickups
    for (const p of this.pickups) {
      if (p.got || Math.abs(p.z - pz) > 120 || Math.abs(p.x - this.playerX) > 0.26) continue;
      p.got = true;
      if (p.kind === 'nitro') {
        this.boost = 1;
        s.award(25 * L, W / 2, H - 170, { color: '#38bdf8', size: 16 });
        s.fx.text(W / 2, H - 200, '⚡ NITRO', { color: '#38bdf8', size: 20 });
        s.sound.play('powerup');
      } else {
        this.coinsGot++;
        s.award((this.bonus ? 15 : 5) * L, W / 2 + (p.x - this.playerX) * 150, H - 160, { chain: this.bonus, color: '#fde047', size: 14 });
        s.sound.play('coin', Math.min(10, this.coinsGot % 12));
        if (this.bonus && this.coinsGot >= 60) s.unlock('coins');
      }
    }

    // checkpoint
    if (!this.bonus && pz >= this.finishZ) this.finish();
  }

  crash(car) {
    const s = this.s;
    this.crashes++; this.nearChain = 0;
    this.speed = 0; this.crashFx = 1;
    s.fx.burst(W / 2, H - 110, { colors: ['#f97316', '#fde047', '#fff', car.color], count: 50, speed: 320, life: 0.8 });
    s.fx.shake(10, 0.4);
    s.sound.play('boom');
    s.hurt();
  }

  finish() {
    const s = this.s, L = this.level;
    if (this.done) return;
    this.done = true;
    const secs = Math.floor(this.timeLeft);
    if (secs > 0) s.award(secs * 40 * L, W / 2, HORIZON + 40, { color: '#a5f3fc', size: 24 });
    s.fx.text(W / 2, HORIZON - 10, 'CHECKPOINT!', { color: '#fde047', size: 40, life: 1.4 });
    s.fx.confetti(W, H);
    if (this.timeLeft < 2) s.unlock('photo');
    if (this.crashes === 0 && L >= 3) s.unlock('clean');
    s.completeLevel();
  }

  onLevelClear() { if (this.bonus && this.coinsGot >= 60) this.s.unlock('coins'); }

  // ── Draw ───────────────────────────────────────────────────
  project(p, wx, wy, wz, camX, camY, camZ) {
    const cz = Math.max(1, wz - camZ);
    p.scale = CAM_DEPTH / cz;
    p.x = W / 2 + p.scale * (wx - camX) * W / 2;
    p.y = HORIZON + p.scale * (camY - wy) * VS;
    p.w = p.scale * ROAD * W / 2;
  }

  render(ctx) {
    const s = this.s, th = this.theme, t = this.t;
    let shx = 0, shy = 0;
    if (this.shakeT > 0) { shx = (Math.random() - 0.5) * 3; shy = (Math.random() - 0.5) * 3; this.shakeT -= 1 / 60; }
    ctx.save(); ctx.translate(shx, shy);

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.6, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(-4, -4, W + 8, HORIZON + 8);
    if (this.themeId === 'night') for (const st of this.stars) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + st.x); ctx.fillStyle = '#fff'; ctx.fillRect(st.x, st.y, st.r, st.r); }
    ctx.globalAlpha = 1;
    if (th.sun) {
      const sx = W / 2 - this.skyOff * 60 % W, sy = HORIZON - 70;
      const sg = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
      sg.addColorStop(0, th.sun); sg.addColorStop(1, this.themeId === 'night' ? '#94a3b8' : '#f472b6');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(((sx % W) + W) % W, sy, this.themeId === 'night' ? 26 : 62, 0, Math.PI * 2); ctx.fill();
      if (this.themeId !== 'night') { ctx.fillStyle = th.sky[2]; for (let k = 0; k < 5; k++) ctx.fillRect(0, sy + 8 + k * 11, W, 3 + k * 0.6); }
    }
    // skyline (parallax with the bends)
    ctx.fillStyle = th.city;
    const off = ((this.skyOff * 140) % (36 * 34) + 36 * 34) % (36 * 34);
    for (const b of this.city) {
      let x = b.x - off; if (x < -40) x += 36 * 34;
      ctx.fillRect(x, HORIZON - b.h, b.w, b.h + 2);
      if (this.themeId === 'night' || this.themeId === 'dusk') {
        ctx.fillStyle = th.glow; ctx.globalAlpha = 0.5;
        for (let wy = HORIZON - b.h + 6; wy < HORIZON - 4; wy += 9) if ((b.x + wy) % 3 === 0) ctx.fillRect(x + 5, wy, 3, 3);
        ctx.globalAlpha = 1; ctx.fillStyle = th.city;
      }
    }
    ctx.fillStyle = mix(this.col.grass[0], this.col.fog, 0.6); ctx.fillRect(-4, HORIZON, W + 8, H - HORIZON + 4);

    // road, far to near is painter's order but we project near → far to know clipping
    const base = this.segAt(this.position), basePct = (this.position % SEG) / SEG;
    const camX = this.playerX * ROAD, camY = CAM_H + this.playerY;
    let x = 0, dx = -base.curve * basePct, maxy = H;
    const visible = [];
    for (let n = 0; n < this.drawDist; n++) {
      const seg = this.segs[base.i + n];
      if (!seg) break;
      const z1 = seg.i * SEG, z2 = z1 + SEG;
      this.project(seg.p1, x, seg.y1, z1, camX, camY, this.position);
      this.project(seg.p2, x + dx, seg.y2, z2, camX, camY, this.position);
      x += dx; dx += seg.curve;
      seg.fog = 1 - Math.exp(-Math.pow(n / this.drawDist, 2) * this.fogDensity);
      seg.clip = maxy;
      if (z1 - this.position <= CAM_DEPTH || seg.p2.y >= seg.p1.y || seg.p2.y >= maxy) { visible.push(seg); seg.hidden = true; continue; }
      seg.hidden = false;
      visible.push(seg);
      maxy = seg.p2.y;
    }
    // the stretch of road right under the car (can dip below the nearest drawn segment on hills)
    const first = visible.find((sg) => !sg.hidden);
    if (first && first.p1.y < H) {
      const p = first.p1, alt = Math.floor(first.i / 3) % 2;
      ctx.fillStyle = mix(this.col.grass[alt], this.col.fog, 0); ctx.fillRect(0, p.y, W, H - p.y);
      ctx.fillStyle = mix(this.col.rumble[alt], this.col.fog, 0); ctx.fillRect(p.x - p.w * 1.3, p.y, p.w * 2.6, H - p.y);
      ctx.fillStyle = mix(this.col.road[alt], this.col.fog, 0); ctx.fillRect(p.x - p.w * 1.15, p.y, p.w * 2.3, H - p.y);
    }
    for (let k = visible.length - 1; k >= 0; k--) {
      const seg = visible[k];
      if (!seg.hidden) this.drawSegment(ctx, seg);
      this.drawSprites(ctx, seg);
    }

    // rain / speed lines
    if (this.themeId === 'rain') {
      ctx.strokeStyle = 'rgba(203,213,225,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const d of this.rain) { d.y += d.v / 60; d.x -= this.steer * 2; if (d.y > H) { d.y = -20; d.x = Math.random() * W; } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 16); }
      ctx.stroke();
    }
    if (this.boosting) {
      ctx.strokeStyle = 'rgba(56,189,248,.45)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 14; i++) { const a = (i * 2.39 + t * 7) % (Math.PI * 2), r1 = 120 + ((t * 900 + i * 60) % 300); ctx.moveTo(W / 2 + Math.cos(a) * r1, HORIZON + 60 + Math.sin(a) * r1 * 0.6); ctx.lineTo(W / 2 + Math.cos(a) * (r1 + 60), HORIZON + 60 + Math.sin(a) * (r1 + 60) * 0.6); }
      ctx.stroke();
    }

    // the player's car
    if (!(this.invuln > 0 && Math.floor(t * 10) % 2)) {
      const bounce = Math.abs(this.playerX) > 1 && this.speed > 500 ? Math.sin(t * 60) * 2 : Math.sin(t * 25) * 0.6 * (this.speed / this.maxSpeed);
      this.drawCar(ctx, W / 2, HORIZON + VS * CAM_H * (CAM_DEPTH / PLAYER_Z) + bounce, PLAYER_PX, s.gold ? '#fbbf24' : '#f97316', { player: true, tilt: this.steer * 0.05, gold: s.gold });
    }
    ctx.restore();
    this.drawHud(ctx);
  }

  drawSegment(ctx, seg) {
    const p1 = seg.p1, p2 = seg.p2, alt = Math.floor(seg.i / 3) % 2, f = seg.fog, fc = this.col.fog;
    const quad = (x1, y1, w1, x2, y2, w2, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = mix(this.col.grass[alt], fc, f);
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    const r1 = p1.w / 7, r2 = p2.w / 7;
    quad(p1.x, p1.y, p1.w + r1, p2.x, p2.y, p2.w + r2, mix(this.col.rumble[alt], fc, f));
    quad(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, mix(this.col.road[alt], fc, f));
    if (!alt) {
      const l1 = p1.w / 36, l2 = p2.w / 36;
      ctx.globalAlpha = 1 - f;
      for (const lx of [-1 / 3, 1 / 3]) quad(p1.x + p1.w * lx, p1.y, l1, p2.x + p2.w * lx, p2.y, l2, this.theme.lane);
      ctx.globalAlpha = 1;
    }
    if (seg.i === this.finishIndex || seg.i === this.finishIndex + 1) {                  // chequered checkpoint line
      const n = 10;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = (k + seg.i) % 2 ? '#fff' : '#111';
        const a1 = p1.x - p1.w + (2 * p1.w / n) * k, a2 = p2.x - p2.w + (2 * p2.w / n) * k;
        ctx.beginPath(); ctx.moveTo(a1, p1.y); ctx.lineTo(a2, p2.y); ctx.lineTo(a2 + 2 * p2.w / n, p2.y); ctx.lineTo(a1 + 2 * p1.w / n, p1.y); ctx.fill();
      }
    }
  }

  drawSprites(ctx, seg) {
    const z1 = seg.i * SEG, z2 = z1 + SEG;
    const p1 = seg.p1;
    if (!p1.scale || p1.scale <= 0) return;
    const f = seg.fog;
    ctx.save();
    ctx.beginPath(); ctx.rect(-10, -10, W + 20, seg.clip + 10); ctx.clip();
    ctx.globalAlpha = Math.max(0, 1 - f * 1.1);
    // road-side lamps and gates
    if (seg.i % 12 === 0) for (const side of [-1, 1]) {
      const sx = p1.x + p1.w * 1.25 * side, h = p1.scale * 1400 * VS;
      ctx.strokeStyle = '#475569'; ctx.lineWidth = Math.max(1, p1.w / 90);
      ctx.beginPath(); ctx.moveTo(sx, p1.y); ctx.lineTo(sx, p1.y - h); ctx.lineTo(sx - side * h * 0.18, p1.y - h); ctx.stroke();
      ctx.fillStyle = this.theme.glow; ctx.shadowColor = this.theme.glow; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(sx - side * h * 0.18, p1.y - h, Math.max(1.2, p1.w / 60), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    if (seg.i === this.finishIndex - 2) {                                                   // checkpoint gate
      const hh = p1.scale * 2600 * VS;
      ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 16;
      ctx.fillRect(p1.x - p1.w * 1.15, p1.y - hh, p1.w * 0.05, hh); ctx.fillRect(p1.x + p1.w * 1.1, p1.y - hh, p1.w * 0.05, hh);
      ctx.fillRect(p1.x - p1.w * 1.15, p1.y - hh, p1.w * 2.3, hh * 0.13);
      ctx.shadowBlur = 0; ctx.fillStyle = '#1c1917'; ctx.font = `900 ${Math.max(6, hh * 0.1)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CHECKPOINT', p1.x, p1.y - hh * 0.935);
    }
    // pickups on this segment
    for (const p of this.pickups) {
      if (p.got || p.z < z1 || p.z >= z2) continue;
      const k = (p.z - z1) / SEG, sc = lerp(p1.scale, seg.p2.scale, k);
      const px = lerp(p1.x, seg.p2.x, k) + p.x * lerp(p1.w, seg.p2.w, k), py = lerp(p1.y, seg.p2.y, k);
      const r = Math.max(1.5, sc * 90 * W / 2);
      if (p.kind === 'coin') {
        ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(px, py - r * 1.6, r * Math.abs(Math.cos(this.t * 4 + p.z)), r, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#38bdf8'; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 14;
        roundRect(ctx, px - r * 0.7, py - r * 3, r * 1.4, r * 2.4, r * 0.4); ctx.fill();
        ctx.fillStyle = '#e0f2fe'; ctx.font = `900 ${r * 1.3}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', px, py - r * 1.8);
      }
      ctx.shadowBlur = 0;
    }
    // traffic on this segment
    for (const car of this.cars) {
      if (car.z < z1 || car.z >= z2) continue;
      const k = (car.z - z1) / SEG, sc = lerp(p1.scale, seg.p2.scale, k);
      const cx = lerp(p1.x, seg.p2.x, k) + car.x * lerp(p1.w, seg.p2.w, k), cy = lerp(p1.y, seg.p2.y, k);
      this.drawCar(ctx, cx, cy, sc * car.w * ROAD * W / 2 * 1.02, car.color, { truck: car.truck, blink: car.blink > 0 ? (car.to < car.lane ? -1 : 1) : 0 });
    }
    ctx.restore();
  }

  /** Neon car seen from behind. (x, y) = centre of the rear bumper at road level, w = width in pixels. */
  drawCar(ctx, x, y, w, color, { player = false, truck = false, blink = 0, tilt = 0, gold = false } = {}) {
    if (w < 2) return;
    const h = truck ? w * 0.95 : w * 0.46;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.55, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (truck) {
      ctx.fillStyle = '#cbd5e1'; roundRect(ctx, -w / 2, -h, w, h * 0.92, w * 0.05); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-w / 2, -h * 0.34, w, h * 0.1);
      ctx.fillStyle = '#334155'; ctx.fillRect(-w * 0.02, -h * 0.9, w * 0.04, h * 0.8);
    } else {
      // body
      const grad = ctx.createLinearGradient(0, -h, 0, 0);
      grad.addColorStop(0, color); grad.addColorStop(1, gold ? '#b45309' : '#0f172a');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.12); ctx.lineTo(-w / 2, -h * 0.55); ctx.lineTo(-w * 0.34, -h * 0.62);
      ctx.lineTo(-w * 0.26, -h); ctx.lineTo(w * 0.26, -h); ctx.lineTo(w * 0.34, -h * 0.62); ctx.lineTo(w / 2, -h * 0.55); ctx.lineTo(w / 2, -h * 0.12);
      ctx.closePath(); ctx.fill();
      // rear window
      ctx.fillStyle = 'rgba(15,23,42,.85)';
      ctx.beginPath(); ctx.moveTo(-w * 0.22, -h * 0.93); ctx.lineTo(w * 0.22, -h * 0.93); ctx.lineTo(w * 0.29, -h * 0.66); ctx.lineTo(-w * 0.29, -h * 0.66); ctx.closePath(); ctx.fill();
      // neon edge
      if (w > 18) { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, w / 60); ctx.shadowColor = color; ctx.shadowBlur = player ? 14 : 6; ctx.stroke(); ctx.shadowBlur = 0; }
    }
    // tail lights
    const lit = player && this.s.input.isDown('down') ? '#ff1f3d' : '#f43f5e';
    ctx.fillStyle = lit; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = w > 20 ? 12 : 4;
    ctx.fillRect(-w * 0.46, -h * (truck ? 0.2 : 0.45), w * 0.2, Math.max(1, h * (truck ? 0.06 : 0.12)));
    ctx.fillRect(w * 0.26, -h * (truck ? 0.2 : 0.45), w * 0.2, Math.max(1, h * (truck ? 0.06 : 0.12)));
    // indicator: blinking before a lane change
    if (blink && Math.floor(this.t * 8) % 2) {
      ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(blink * w * 0.5, -h * 0.4, Math.max(1.5, w * 0.07), 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // wheels
    ctx.fillStyle = '#020617';
    ctx.fillRect(-w * 0.48, -h * 0.13, w * 0.18, h * 0.16); ctx.fillRect(w * 0.3, -h * 0.13, w * 0.18, h * 0.16);
    if (player && this.boosting) {                                // exhaust flames
      ctx.fillStyle = Math.random() < 0.5 ? '#38bdf8' : '#e0f2fe'; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 16;
      for (const sx of [-0.18, 0.18]) { ctx.beginPath(); ctx.moveTo(w * sx - w * 0.04, -h * 0.1); ctx.lineTo(w * sx, h * 0.25 + Math.random() * h * 0.2); ctx.lineTo(w * sx + w * 0.04, -h * 0.1); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    if (gold && Math.sin(this.t * 3) > 0.8) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-w * 0.2, -h * 0.85, w * 0.025, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  drawHud(ctx) {
    const s = this.s;
    ctx.fillStyle = 'rgba(3,5,20,.72)'; ctx.fillRect(0, 0, W, 64);
    ctx.save(); ctx.textBaseline = 'middle';
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ COIN HIGHWAY · ${this.coinsGot} coins · ${Math.ceil(s.bonusLeft)}s`);
    } else {
      const k = this.timeMax ? this.timeLeft / this.timeMax : 0;
      ctx.textAlign = 'center';
      ctx.font = '900 30px system-ui';
      ctx.fillStyle = this.timeLeft < 6 ? (Math.floor(this.t * 4) % 2 ? '#f87171' : '#fecaca') : k < 0.3 ? '#fbbf24' : '#f8fafc';
      ctx.fillText(`${Math.max(0, this.timeLeft).toFixed(1)}`, W / 2, 26);
      ctx.font = '700 10px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText('TIME', W / 2, 50);
      const prog = clamp((this.position + PLAYER_Z) / this.finishZ, 0, 1);
      ctx.textAlign = 'left'; ctx.font = '800 13px system-ui'; ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`🏁 ${Math.round(prog * 100)}%`, 14, 22);
      progressBar(ctx, 14, 38, 150, 10, prog, '#f97316');
      if (this.nearChain >= 2) { ctx.fillStyle = '#fde047'; ctx.fillText(`💨 ×${this.nearChain}`, 100, 22); }
    }
    // speed + nitro
    ctx.textAlign = 'right'; ctx.font = '900 20px system-ui'; ctx.fillStyle = this.boosting ? '#38bdf8' : '#e2e8f0';
    ctx.fillText(`${Math.round(this.speed / BASE_MAX * 240)}`, W - 50, this.bonus ? 50 : 24);
    ctx.font = '700 10px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.fillText('KM/H', W - 14, this.bonus ? 50 : 24);
    if (!this.bonus) progressBar(ctx, W - 164, 38, 150, 10, this.boost, this.boost > 0.3 ? '#38bdf8' : '#64748b', '');
    if (!this.bonus) { ctx.font = '700 10px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right'; ctx.fillText('NITRO ↑', W - 168, 43); }
    // touch hint
    ctx.textAlign = 'center'; ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.4)';
    if (s.state === 'playing' && this.position < SEG * 60) ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Hold left / right side to steer · middle to boost' : '← → steer · ↑ boost · ↓ brake', W / 2, H - 10);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.fillText('★ GOLDEN RACER', W / 2, 78); }
    ctx.restore();
  }
}

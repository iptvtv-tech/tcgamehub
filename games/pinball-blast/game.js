// ─────────────────────────────────────────────────────────────
//  PINBALL BLAST EXTREME — game 15 (Zone 3 · Master)
//  A full neon pinball table: flippers, plunger, pop bumpers, slingshots,
//  a drop-target bank, a kick-out saucer, N·E·O·N rollover lanes, a spinner,
//  and a UFO that patrols the top of the table. Classic electro-mechanical
//  sounds (chime bells, pops, knocker) are synthesised live.
//
//  Each level is a MISSION against the clock — run out of time and you lose a ball.
//  Two saucer shots LOCK balls and start MULTIBALL (UFO hits = JACKPOTS).
//    L1–3 centre post + kickback save you      L4+ post gone, ball save shrinks
//    L6+  BLACK HOLES open and swallow balls    L7+ faster ball, harder slings
//    L8+  a roaming bumper                      L10+ no ball save at all
//  Every 5th level: ★ MULTIBALL FRENZY — 3 balls, 15 s, drains don't count.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'pinball-blast';
const UFO_Y = 206;
const SPINNER = { x1: 22, x2: 60, y: 266 };
const POST = { x: 220, y: 682, r: 5 };
const W = 480, H = 720;
const R = 9;                                  // ball radius
const LANE_X = 442, LANE_Y = 660;             // plunger rest spot
const TAU = Math.PI * 2;

// ── Table geometry ───────────────────────────────────────────
const WALLS = [];                             // [x1, y1, x2, y2, bounce]
const wall = (pts, e = 0.45) => { for (let i = 0; i < pts.length - 1; i++) WALLS.push([...pts[i], ...pts[i + 1], e]); };
// outer shell with an elliptical top
const arc = [];
for (let i = 0; i <= 28; i++) { const t = Math.PI - (i / 28) * Math.PI; arc.push([240 + Math.cos(t) * 220, 232 - Math.sin(t) * 172]); }
wall([[20, 740], [20, 232], ...arc.slice(1, -1), [460, 232], [460, 740]]);
wall([[424, 740], [424, 262]]);                                   // shooter-lane divider
wall([[62, 470], [62, 582], [137, 627]], 0.3);                    // left inlane guide
wall([[378, 470], [378, 582], [303, 627]], 0.3);                  // right inlane guide
// top lane dividers
for (const x of [130, 175, 220, 265, 310]) wall([[x, 116], [x, 152]], 0.3);
const LANES = [152, 197, 242, 287];
// slingshots: [A, B, C] — the A→C face kicks
const SLINGS = [
  { a: [96, 470], b: [96, 556], c: [134, 584], dir: 1 },
  { a: [344, 470], b: [344, 556], c: [306, 584], dir: -1 },
];
for (const sl of SLINGS) wall([sl.a, sl.b, sl.c], 0.3);
const BUMPERS = [{ x: 160, y: 262, r: 24 }, { x: 282, y: 262, r: 24 }, { x: 221, y: 338, r: 24 }];
const TARGETS = [0, 1, 2, 3, 4].map((i) => ({ x: 408, y: 300 + i * 27, h: 22 }));
const SAUCER = { x: 76, y: 322, r: 14 };
const GATE = [424, 262, 458, 214];

const MISSIONS = {
  lanes:   { label: 'Light N·E·O·N', icon: '💡', short: 'NEON' },
  targets: { label: 'Drop target banks', icon: '🎯', short: 'Banks' },
  bumpers: { label: 'Pop bumpers', icon: '💥', short: 'Pops' },
  saucer:  { label: 'Saucer shots', icon: '🕳️', short: 'Saucer' },
  ufo:     { label: 'Hit the UFO', icon: '🛸', short: 'UFO' },
  spinner: { label: 'Spin the spinner', icon: '🌀', short: 'Spins' },
};
function missionsFor(level, rng) {
  const fixed = { 1: ['bumpers'], 2: ['targets'], 3: ['ufo'], 4: ['spinner', 'bumpers'], 6: ['lanes', 'ufo'], 7: ['targets', 'spinner'], 8: ['saucer', 'ufo'], 9: ['bumpers', 'targets', 'ufo'] };
  let list = fixed[level];
  if (!list) { const all = Object.keys(MISSIONS); while (all.length > 3) all.splice(rng.int(0, all.length - 1), 1); list = all; }
  const need = { lanes: 1 + Math.floor(level / 8), targets: 1 + Math.floor(level / 7), bumpers: 15 + level * 3, saucer: 1 + Math.floor(level / 4), ufo: 2 + Math.floor(level / 3), spinner: 25 + level * 4 };
  return list.map((id) => ({ id, need: need[id], have: 0 }));
}

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 2.5,
  comboStep: 4,
  maxMultiplier: 4,
  bonusTime: 15,
  music: { bpm: 144, style: 'major', lead: 'sawtooth', arp: [0, 1, 2, 4, 2, 1, 3, 2], oct: [12, 12, 12, 12, 24, 12, 12, 12], bass: 'drive' },
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 500),
  levelInfo(level, bonus) {
    if (bonus) return '★ MULTIBALL FRENZY! Three balls, 15 seconds, and drains don\'t count. Smash everything!';
    const m = missionsFor(level, { int: () => 0 }).map((x) => MISSIONS[x.id].label).join(' + ');
    const extra = { 3: '🛸 A UFO patrols the top of the table.', 4: 'The centre post and kickback are gone, and ball save is short!', 6: '🕳️ BLACK HOLES open up — keep the ball away!', 7: 'Faster ball, harder slingshots.', 8: 'One bumper roams the table.', 10: 'No ball save at all. Good luck.' }[level] || '';
    if (level === 1) return `Flippers: ← → (or A / D, or tap left/right). Hold SPACE (or touch) to launch. Beat the clock! Mission: ${m}`;
    return level >= 11 ? 'Three objectives at once — beat the clock!' : `${extra} Mission: ${m} — beat the clock!`;
  },
  create: (shell) => new Pinball(shell),
});

class Pinball {
  constructor(s) {
    this.s = s; this.t = 0;
    this.flippers = [
      { px: 140, py: 640, side: 1, a: 0.5, prev: null, key: 'left' },
      { px: 300, py: 640, side: -1, a: 0.5, prev: null, key: 'right' },
    ];
    this.lights = Array.from({ length: 14 }, (_, i) => ({ ph: i * 0.45 }));
    this.startLevel(1, false);
  }

  reset() { this.extraGiven = false; }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.grav = 860 * Math.min(1.5, s.speed(0.035));
    this.flen = 68;
    this.slingKick = 420 + Math.min(110, level * 8);
    this.saveTime = bonus ? 99 : level <= 3 ? 5 : level <= 9 ? 2.5 : 0;
    this.post = bonus || level <= 3;
    // outlane pinches: closed early on, then a gap opens by the outer wall (ball = 18 px)
    //   the low end of each pinch overhangs its inlane guide, so a ball rolling off it is fed to the flipper;
    //   only a ball hugging the outer wall can slip through the gap next to the wall.
    const gap = bonus || level <= 3 ? 0 : level <= 6 ? 20 : 24;
    this.pinchWalls = [[20 + gap, 426, 68, 462, 0.3], [424 - gap, 426, 372, 462, 0.3]];
    this.kickback = !bonus && level <= 3;
    this.holes = !bonus && level >= 6;
    this.hole = null; this.holeT = 6;
    this.roam = !bonus && level >= 8;
    this.ufo = { x: 220, dir: 1, speed: 55 + level * 5, flash: 0, cool: 0 };
    this.spin = 0; this.spinA = 0; this.spinTick = 0;
    this.locks = 0; this.multiball = false;
    this.mTimeMax = bonus ? 0 : Math.max(45, 100 - level * 4);
    this.mTime = this.mTimeMax;
    this.missions = bonus ? [] : missionsFor(level, s.rng);
    this.lanesLit = [false, false, false, false];
    this.targetsDown = [false, false, false, false, false];
    this.bumperFlash = [0, 0, 0]; this.slingFlash = [0, 0];
    this.balls = [];
    this.gateOpen = true;
    this.frenzyJackpots = 0;
    this.bumpers = BUMPERS.map((b) => ({ ...b, x0: b.x }));
    this.newBall();
    if (bonus) { for (let i = 0; i < 2; i++) this.addBall(LANE_X, 300 + i * 40, -60 - i * 40, -300); this.launchBall(this.balls[0], 1); }
  }

  newBall() {
    this.balls = this.balls.filter((b) => b.inPlay);
    this.plungerBall = { x: LANE_X, y: LANE_Y, vx: 0, vy: 0, inPlay: false, saveUntil: 0, stuck: 0 };
    this.balls.push(this.plungerBall);
    this.charge = 0; this.charging = false;
    this.gateOpen = true;
  }
  addBall(x, y, vx, vy) {
    const b = { x, y, vx, vy, inPlay: true, saveUntil: this.t + this.saveTime, stuck: 0 };
    this.balls.push(b);
    return b;
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x) {
    if (a === 'press' && x !== undefined) this.pointerX = x;
    if (a === 'up') this.nudge();
  }
  onPointerMove(x) { this.pointerX = x; }

  flipperDown(f) {
    const inp = this.s.input;
    if (inp.isDown(f.key)) return true;
    if (inp.pointer.down && !this.plungerBall) return f.side > 0 ? this.pointerX < W / 2 : this.pointerX >= W / 2;
    return false;
  }

  nudge() {
    // a gentle table nudge (up arrow / W). Too many in a row = TILT.
    const s = this.s;
    this.nudges = (this.nudges || 0) + 1;
    this.nudgeT = 2;
    if (this.nudges > 3) { s.fx.text(W / 2, H * 0.45, 'TILT!', { color: '#f87171', size: 44, life: 1.2 }); this.tilted = 2; this.nudges = 0; return; }
    for (const b of this.balls) if (b.inPlay) { b.vy -= 160; b.vx += (Math.random() - 0.5) * 120; }
    s.fx.shake(4, 0.15);
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; this.animate(dt); }
  animate(dt) {
    for (let i = 0; i < 3; i++) this.bumperFlash[i] = Math.max(0, this.bumperFlash[i] - dt * 5);
    // the UFO patrols; one bumper roams from level 8
    const u = this.ufo;
    if (u) {
      u.x += u.dir * u.speed * dt; if (u.x > 330) { u.x = 330; u.dir = -1; } if (u.x < 110) { u.x = 110; u.dir = 1; }
      u.flash = Math.max(0, u.flash - dt * 3); u.cool = Math.max(0, u.cool - dt);
    }
    if (this.roam && this.bumpers) this.bumpers[2].x = this.bumpers[2].x0 + Math.sin(this.t * 1.3) * 48;
    this.spinA += this.spin * dt; this.spin *= Math.pow(0.2, dt);
    for (let i = 0; i < 2; i++) this.slingFlash[i] = Math.max(0, this.slingFlash[i] - dt * 6);
    if (this.nudgeT > 0) { this.nudgeT -= dt; if (this.nudgeT <= 0) this.nudges = 0; }
    if (this.tilted > 0) this.tilted -= dt;
  }

  update(dt) {
    const s = this.s;
    this.t += dt;
    this.animate(dt);

    // Plunger
    const pb = this.plungerBall;
    if (pb) {
      const held = s.input.isDown('action') || s.input.isDown('down') || s.input.pointer.down;
      if (held) {
        if (!this.charging) s.sound.tone({ freq: 90, to: 260, dur: 0.9, type: 'sawtooth', vol: 0.035 });
        this.charging = true; this.charge = Math.min(1, this.charge + dt * 1.1);
      } else if (this.charging) {
        this.launchBall(pb, this.charge);
      }
    }

    // mission clock (only while a ball is in play)
    if (this.mTimeMax && !this.plungerBall && this.balls.some((b) => b.inPlay)) {
      this.mTime -= dt;
      if (this.mTime <= 10 && Math.ceil(this.mTime) !== Math.ceil(this.mTime + dt)) s.sound.play('tick');
      if (this.mTime <= 0) {
        this.mTime = 0;
        s.fx.text(W / 2, H * 0.45, 'TIME UP!', { color: '#f87171', size: 40, life: 1.3 });
        this.knocker(); s.hurt();
        return;
      }
    }
    // black holes open up from level 6
    if (this.holes && !this.plungerBall) {
      if (this.hole) { this.hole.t -= dt; if (this.hole.t <= 0) this.hole = null; }
      else if ((this.holeT -= dt) <= 0) {
        this.holeT = Math.max(9, 18 - this.level * 0.4);
        this.hole = { x: s.rng.range(110, 330), y: s.rng.range(380, 500), t: 4 };
        s.sound.tone({ freq: 300, to: 60, dur: 0.6, type: 'sawtooth', vol: 0.06 });
      }
    }

    // Flippers
    for (const f of this.flippers) {
      const up = this.tilted > 0 ? false : this.flipperDown(f);
      const target = up ? -0.45 : 0.5;
      if (up && !f.wasUp) { s.sound.noise({ dur: 0.05, vol: 0.12, freq: 2500, type: 'highpass' }); s.sound.tone({ freq: 90, to: 60, dur: 0.06, type: 'square', vol: 0.05 }); }
      if (up && !f.wasUp && !this.bonus) this.laneChange(f.side);
      f.wasUp = up;
      f.target = target;
    }

    // Physics in small sub-steps
    const N = 8, h = dt / N;
    for (let k = 0; k < N; k++) {
      for (const f of this.flippers) {
        f.prev = this.tip(f);
        const sp = f.target < f.a ? 26 : 14;
        f.a += clamp(f.target - f.a, -sp * h, sp * h);
      }
      for (const b of this.balls) if (b.inPlay) this.stepBall(b, h);
      this.ballPairs();
    }

    // Drains and stuck balls
    for (const b of this.balls) {
      if (!b.inPlay) continue;
      if (b.y > H + 30) { b.inPlay = false; b.drained = true; }
      const sp = Math.hypot(b.vx, b.vy);
      b.stuck = sp < 12 && !b.held && !this.flippers.some((f) => f.wasUp) ? b.stuck + dt : 0;
      if (b.stuck > 3) { b.vy = -250; b.vx = (Math.random() - 0.5) * 300; b.stuck = 0; }
      if (b.held) {
        b.held -= dt; b.x = SAUCER.x; b.y = SAUCER.y; b.vx = b.vy = 0;
        if (b.held <= 0) { b.held = 0; b.vx = 330; b.vy = 200; s.sound.noise({ dur: 0.15, vol: 0.2, freq: 400, to: 80 }); s.sound.tone({ freq: 70, dur: 0.12, type: 'square', vol: 0.1 }); }
      }
      if (!this.gateOpen || b.x > 424) continue;
      if (b.y < 400) this.gateOpen = false;        // ball is in the playfield: close the lane
    }
    const drained = this.balls.filter((b) => b.drained);
    if (drained.length) {
      this.balls = this.balls.filter((b) => !b.drained);
      for (const b of drained) {
        if (this.bonus || this.t < b.saveUntil || (this.multiball && this.balls.some((o) => o.inPlay))) {
          if (!this.bonus && this.multiball && this.t >= b.saveUntil) continue;          // multiball: a lost ball is just gone
          // ball save: straight back into play
          s.fx.text(W / 2, H * 0.55, 'BALL SAVED!', { color: '#4ade80', size: 26 });
          s.sound.play('powerup');
          const nb = this.addBall(LANE_X, 560, 0, 0);
          this.launchBall(nb, 0.85);
          nb.saveUntil = 0;                                   // one save per ball
        }
      }
      if (this.multiball && this.balls.filter((b) => b.inPlay).length <= 1) { this.multiball = false; s.fx.text(W / 2, H * 0.5, 'MULTIBALL OVER', { color: '#94a3b8', size: 20 }); }
      if (!this.balls.some((b) => b.inPlay) && !this.plungerBall) {
        // last ball gone
        [392, 330, 262, 196].forEach((f, i) => s.sound.tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.09, delay: i * 0.16 }));
        s.fx.text(W / 2, H * 0.5, 'DRAIN', { color: '#f87171', size: 36, life: 1.1 });
        s.hurt();
        return;
      }
    }
  }

  launchBall(b, power) {
    const s = this.s;
    b.inPlay = true; b.x = LANE_X; b.vx = 0;
    b.vy = -(900 + power * 700);
    b.saveUntil = this.t + this.saveTime;
    if (b === this.plungerBall) this.plungerBall = null;
    this.charging = false; this.charge = 0; this.gateOpen = true;
    s.sound.noise({ dur: 0.12, vol: 0.18, freq: 800, to: 150 });
    s.sound.tone({ freq: 140, to: 60, dur: 0.1, type: 'square', vol: 0.08 });
    if (power > 0.97 && !this.bonus) { s.fx.text(LANE_X - 30, 560, 'SKILL SHOT!', { color: '#fde047', size: 16 }); this.score(2000, LANE_X - 30, 540, 1000); s.unlock('skill'); }
  }

  tip(f) { return [f.px + f.side * Math.cos(f.a) * this.flen, f.py + Math.sin(f.a) * this.flen]; }

  stepBall(b, h) {
    if (b.held) return;
    b.vy += this.grav * h;
    const py = b.y;
    b.x += b.vx * h; b.y += b.vy * h;
    // black hole: pulls the ball in… and swallows it
    if (this.hole) {
      const dx = this.hole.x - b.x, dy = this.hole.y - b.y, d = Math.hypot(dx, dy);
      const grow = Math.min(1, (4 - this.hole.t) * 2);          // it takes half a second to open fully
      if (d < 90 * grow) { const f = 800 * (1 - d / 90); b.vx += dx / d * f * h; b.vy += dy / d * f * h; }
      if (d < 12 * grow && b.inPlay) {
        b.inPlay = false; b.drained = true;
        this.s.sound.tone({ freq: 600, to: 40, dur: 0.5, type: 'sine', vol: 0.12 });
        this.s.fx.burst(this.hole.x, this.hole.y, { colors: ['#a855f7', '#000', '#fff'], count: 24, speed: 140, life: 0.5 });
        this.hole = null;
        return;
      }
    }
    // orbit diverter: a ball coming DOWN the far-left lane is kicked back into the table
    if (b.vy > 0 && b.x < 64 && py < 300 && b.y >= 300) {
      b.vx = 330; b.vy = Math.min(b.vy * 0.3, 200);                // lob it back towards the middle of the table
      this.divFlash = 1;
      this.s.sound.tone({ freq: 420, to: 200, dur: 0.05, type: 'square', vol: 0.05 });
    }
    // spinner in the left lane
    if (b.x > SPINNER.x1 && b.x < SPINNER.x2 && (py - SPINNER.y) * (b.y - SPINNER.y) < 0) {
      const n = 1 + Math.round(Math.abs(b.vy) / 90);
      this.spin += n * 10;
      this.score(20 * n, 70, SPINNER.y - 10, 10);
      this.progress('spinner', n);
    }
    // centre post (early levels) nudges balls away from the middle drain
    if (this.post) {
      const dx = b.x - POST.x, dy = b.y - POST.y, d = Math.hypot(dx, dy);
      if (d < POST.r + R && d > 0) {
        const nx = dx / d || (Math.random() - 0.5), ny = dy / d;
        b.x = POST.x + nx * (POST.r + R); b.y = POST.y + ny * (POST.r + R);
        const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; }
        b.vx += (b.x < POST.x ? -60 : 60);
      }
    }
    // kickback in the left outlane
    if (this.kickback && b.x < 60 && b.y > 600 && b.vy > 0) {
      b.vy = -1250; b.vx = 30; this.kickback = false;
      this.knocker(); this.s.fx.text(90, 590, 'KICKBACK!', { color: '#4ade80', size: 18 });
    }
    for (const w of this.pinchWalls) this.hitSeg(b, w[0], w[1], w[2], w[3], w[4]);
    // UFO
    const u = this.ufo;
    if (u) {
      const dx = b.x - u.x, dy = b.y - UFO_Y, d = Math.hypot(dx, dy * 1.6);
      if (d < 28 + R && d > 0) {
        const nx = dx / Math.hypot(dx, dy), ny = dy / Math.hypot(dx, dy);
        b.x = u.x + nx * (28 + R); b.y = UFO_Y + ny * (16 + R);
        const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
        if (u.cool <= 0) this.ufoHit(u);
      }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 2300) { b.vx *= 2300 / sp; b.vy *= 2300 / sp; }

    for (const w of WALLS) this.hitSeg(b, w[0], w[1], w[2], w[3], w[4]);
    if (!this.gateOpen) this.hitSeg(b, ...GATE, 0.3);

    // slingshots
    SLINGS.forEach((sl, i) => {
      const hit = this.hitSeg(b, sl.a[0], sl.a[1], sl.c[0], sl.c[1], 0.3);
      if (hit && hit.speed > 70) {
        const nx = hit.nx, ny = hit.ny;
        b.vx += nx * this.slingKick; b.vy += ny * this.slingKick;
        this.slingFlash[i] = 1;
        this.s.sound.noise({ dur: 0.06, vol: 0.12, freq: 1800, type: 'highpass' });
        this.s.sound.tone({ freq: 320, to: 120, dur: 0.06, type: 'square', vol: 0.06 });
        this.score(10, b.x, b.y - 16);
      }
    });

    // bumpers
    this.bumpers.forEach((bu, i) => {
      const dx = b.x - bu.x, dy = b.y - bu.y, d = Math.hypot(dx, dy);
      if (d < bu.r + R && d > 0) {
        const nx = dx / d, ny = dy / d;
        b.x = bu.x + nx * (bu.r + R); b.y = bu.y + ny * (bu.r + R);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
        const kick = 560 + this.level * 8;
        b.vx += nx * kick * 0.6; b.vy += ny * kick * 0.6;
        const s2 = Math.hypot(b.vx, b.vy); if (s2 < kick) { b.vx *= kick / s2; b.vy *= kick / s2; }
        if (this.bumperFlash[i] < 0.6) this.bumperHit(i, bu);
        this.bumperFlash[i] = 1;
      }
    });

    // drop targets (vertical bank on the right)
    TARGETS.forEach((tg, i) => {
      if (this.targetsDown[i]) return;
      const hit = this.hitSeg(b, tg.x - 4, tg.y, tg.x - 4, tg.y + tg.h, 0.35);
      if (hit && hit.speed > 40) this.targetHit(i, tg);
    });
    // target backing wall once a target is down
    this.hitSeg(b, 418, 294, 418, 440, 0.3);

    // saucer
    const sdx = b.x - SAUCER.x, sdy = b.y - SAUCER.y;
    if (!b.held && !b.saucerCool && Math.hypot(sdx, sdy) < 11 && Math.hypot(b.vx, b.vy) < 1100) this.saucerHit(b);
    if (b.saucerCool) b.saucerCool = Math.max(0, b.saucerCool - h);

    // flippers
    for (const f of this.flippers) this.hitFlipper(b, f, h);

    // top lanes (rollovers)
    if (b.vy > 0 && b.y > 128 && b.y < 140) {
      LANES.forEach((lx, i) => { if (Math.abs(b.x - lx) < 18 && !b.laneCool) { b.laneCool = 0.4; this.laneHit(i); } });
    }
    if (b.laneCool) b.laneCool = Math.max(0, b.laneCool - h);
  }

  /** Circle vs segment. Returns contact info when the ball is pushed out. */
  hitSeg(b, x1, y1, x2, y2, e) {
    const vx = x2 - x1, vy = y2 - y1, len2 = vx * vx + vy * vy;
    let t = ((b.x - x1) * vx + (b.y - y1) * vy) / len2; t = clamp(t, 0, 1);
    const cx = x1 + vx * t, cy = y1 + vy * t;
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    if (d >= R || d === 0) return null;
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * R; b.y = cy + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return { nx, ny, speed: 0 };
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    // a little friction along the wall
    b.vx *= 0.995; b.vy *= 0.995;
    return { nx, ny, speed: -vn };
  }

  hitFlipper(b, f, h) {
    const [tx, ty] = this.tip(f);
    const vx = tx - f.px, vy = ty - f.py, len2 = vx * vx + vy * vy;
    let t = ((b.x - f.px) * vx + (b.y - f.py) * vy) / len2; t = clamp(t, 0, 1);
    const rad = 8 - 3 * t;                          // flipper tapers towards the tip
    const cx = f.px + vx * t, cy = f.py + vy * t;
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    if (d >= R + rad || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * (R + rad); b.y = cy + ny * (R + rad);
    // flipper surface velocity at the contact point
    const [px, py] = f.prev || [tx, ty];
    const svx = ((tx - px) / h) * t, svy = ((ty - py) / h) * t;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = 0.35;
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
      if (-vn > 500) this.s.sound.tone({ freq: 160, to: 80, dur: 0.05, type: 'square', vol: 0.04 });
    }
  }

  ballPairs() {
    const bs = this.balls.filter((b) => b.inPlay && !b.held);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], c = bs[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 2 * R && d > 0) {
        const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2;
        a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) { a.vx += rv * nx; a.vy += rv * ny; c.vx -= rv * nx; c.vy -= rv * ny; }
      }
    }
  }

  // ── Scoring & sounds (electro-mechanical style) ───────────
  chime(value) {
    const s = this.s;
    // three chime bells like an old EM machine: 10s, 100s, 1000s
    const f = value >= 1000 ? 784 : value >= 100 ? 1046 : 1568;
    s.sound.tone({ freq: f, dur: 0.7, type: 'sine', vol: 0.09 });
    s.sound.tone({ freq: f * 2.01, dur: 0.25, type: 'sine', vol: 0.025 });
  }
  score(base, x, y, chimeVal = base, chain = false) {
    const s = this.s, pts = Math.round(base * (1 + (this.level - 1) * 0.15) * (this.bonus ? 2 : 1));
    s.award(pts, x, y, { chain, color: '#fde047', size: pts >= 1000 ? 20 : 14 });
    this.chime(chimeVal);
  }
  knocker() {
    const s = this.s;
    s.sound.noise({ dur: 0.25, vol: 0.35, freq: 300, to: 40 });
    s.sound.tone({ freq: 55, dur: 0.25, type: 'square', vol: 0.15 });
  }

  bumperHit(i, bu) {
    const s = this.s;
    s.sound.tone({ freq: 220, to: 90, dur: 0.09, type: 'square', vol: 0.09 });
    s.sound.noise({ dur: 0.08, vol: 0.15, freq: 1200, to: 200 });
    s.fx.burst(bu.x, bu.y, { colors: ['#f472b6', '#fde047', '#fff'], count: 10, speed: 180, life: 0.35 });
    this.score(100, bu.x, bu.y - 30, 100, true);
    this.progress('bumpers', 1);
  }

  targetHit(i, tg) {
    const s = this.s;
    this.targetsDown[i] = true;
    s.sound.tone({ freq: 130, to: 60, dur: 0.08, type: 'square', vol: 0.1 });
    s.sound.noise({ dur: 0.07, vol: 0.12, freq: 700 });
    s.fx.burst(tg.x, tg.y + 11, { colors: ['#22d3ee', '#fff'], count: 10, speed: 140, life: 0.35 });
    this.score(500, tg.x - 30, tg.y, 100, true);
    if (this.targetsDown.every(Boolean)) {
      this.score(5000, 330, 360, 1000);
      s.fx.text(330, 330, 'BANK DOWN!', { color: '#22d3ee', size: 22 }); s.unlock('bank');
      this.knocker();
      this.progress('targets', 1);
      this.later(0.8, () => { this.targetsDown = [false, false, false, false, false]; this.s.sound.tone({ freq: 400, to: 800, dur: 0.2, type: 'triangle', vol: 0.05 }); });
    }
  }

  laneHit(i) {
    const s = this.s;
    s.sound.tone({ freq: 2093, dur: 0.12, type: 'triangle', vol: 0.07 });
    if (this.lanesLit[i]) { this.score(100, LANES[i], 170, 100); return; }
    this.lanesLit[i] = true;
    this.score(500, LANES[i], 170, 100, true);
    if (this.lanesLit.every(Boolean)) {
      this.score(5000, 220, 200, 1000);
      s.fx.text(220, 190, 'N·E·O·N!', { color: '#f472b6', size: 26 }); s.unlock('neon');
      this.knocker();
      this.progress('lanes', 1);
      this.later(0.8, () => { this.lanesLit = [false, false, false, false]; });
    }
  }
  // flippers also rotate the lit lanes (classic "lane change")
  laneChange(dir) { const l = this.lanesLit; this.lanesLit = dir > 0 ? [l[3], l[0], l[1], l[2]] : [l[1], l[2], l[3], l[0]]; }

  saucerHit(b) {
    const s = this.s;
    b.held = 1.1; b.saucerCool = 1.8;
    s.sound.noise({ dur: 0.1, vol: 0.2, freq: 500, to: 80 });
    this.score(3000, SAUCER.x + 30, SAUCER.y - 20, 1000, true);
    s.fx.ring(SAUCER.x, SAUCER.y, { color: '#fde047', radius: 40 });
    if (!this.bonus && !this.multiball) {
      this.locks++;
      if (this.level <= 3) this.kickback = true;                // saucer relights the kickback early on
      if (this.locks >= 2) this.startMultiball();
      else s.fx.text(SAUCER.x + 50, SAUCER.y + 20, 'BALL LOCKED 1/2', { color: '#a5f3fc', size: 16 });
    }
    this.progress('saucer', 1);
    if (this.bonus) { this.frenzyJackpots++; if (this.frenzyJackpots >= 3) s.unlock('frenzy'); }
  }

  startMultiball() {
    const s = this.s;
    this.locks = 0; this.multiball = true;
    s.fx.text(W / 2, H * 0.42, 'MULTIBALL!', { color: '#f472b6', size: 40, life: 1.6 });
    s.fx.flash('#f472b6', 0.25); this.knocker(); s.sound.play('bonus'); s.unlock('multiball');
    for (let i = 0; i < 2; i++) this.later(0.3 + i * 0.6, () => { const nb = this.addBall(LANE_X, 560, 0, 0); nb.saveUntil = this.t + 3; this.launchBall(nb, 0.8); });
  }

  ufoHit(u) {
    const s = this.s;
    u.cool = 0.35; u.flash = 1;
    s.sound.tone({ freq: 880, to: 220, dur: 0.18, type: 'square', vol: 0.07 });
    s.sound.tone({ freq: 1320, to: 660, dur: 0.12, type: 'sine', vol: 0.05, delay: 0.05 });
    s.fx.burst(u.x, UFO_Y, { colors: ['#4ade80', '#a5f3fc', '#fff'], count: 12, speed: 170, life: 0.4 });
    if (this.multiball || this.bonus) {
      this.score(5000, u.x, UFO_Y - 30, 1000, true);
      s.fx.text(u.x, UFO_Y - 50, 'JACKPOT!', { color: '#fde047', size: 24 }); s.unlock('jackpot');
    } else this.score(750, u.x, UFO_Y - 26, 100, true);
    this.progress('ufo', 1);
  }

  progress(id, n) {
    const s = this.s;
    if (this.bonus) return;
    const m = this.missions.find((x) => x.id === id);
    if (!m || m.have >= m.need) return;
    m.have = Math.min(m.need, m.have + n);
    if (m.have >= m.need) {
      s.fx.text(W / 2, H * 0.36, `${MISSIONS[id].label} ✔`, { color: '#4ade80', size: 22, life: 1.4 });
      s.sound.play('levelup');
    }
    if (this.missions.every((x) => x.have >= x.need)) {
      this.knocker();
      this.score(10000, W / 2, H * 0.3, 1000);
      s.fx.text(W / 2, H * 0.25, 'MISSION COMPLETE!', { color: '#fde047', size: 32, life: 1.8 });
      if (s.lives === 3 && this.level >= 3) s.unlock('allballs');
      this.balls = [];
      this.plungerBall = null;
      s.completeLevel();
    }
  }

  later(t, fn) { setTimeout(() => { if (this.s.state === 'playing' || this.s.state === 'banner') fn(); }, t * 1000); }

  onLifeLost() { this.balls = []; this.multiball = false; this.hole = null; if (this.mTime <= 0) this.mTime = Math.min(this.mTimeMax, 40); this.newBall(); }
  onLevelClear() {}

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t;
    // cabinet background
    ctx.fillStyle = '#05030f'; ctx.fillRect(0, 0, W, H);
    // playfield
    ctx.save();
    ctx.beginPath(); ctx.moveTo(20, 740); ctx.lineTo(20, 232);
    for (const [x, y] of arc) ctx.lineTo(x, y);
    ctx.lineTo(460, 740); ctx.closePath();
    const pg = ctx.createLinearGradient(0, 60, 0, H);
    pg.addColorStop(0, this.bonus ? '#3b0a3a' : '#0b1a4a'); pg.addColorStop(1, this.bonus ? '#1e0b3a' : '#140a2e');
    ctx.fillStyle = pg; ctx.fill();
    ctx.clip();
    // star art
    for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(t * 2 + i)})`; ctx.fillRect((i * 97) % 400 + 30, (i * 61) % 560 + 90, 2, 2); }
    // centre art
    ctx.save(); ctx.globalAlpha = 0.14; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#f472b6';
    ctx.fillText('PINBALL', 220, 470); ctx.fillStyle = '#22d3ee'; ctx.fillText('BLAST', 220, 520); ctx.restore();
    // insert lights (chasing arrows)
    for (let i = 0; i < 5; i++) {
      const on = (Math.floor(t * 6) + i) % 5 === 0;
      ctx.fillStyle = on ? '#fde047' : 'rgba(253,224,71,.18)';
      const y = 560 - i * 22;
      ctx.beginPath(); ctx.moveTo(220, y - 8); ctx.lineTo(230, y + 4); ctx.lineTo(210, y + 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // shooter lane
    ctx.fillStyle = '#0a0f2a'; ctx.fillRect(425, 262, 34, 480);

    // walls
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10;
    ctx.beginPath(); for (const w of WALLS) { ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); }
    for (const w of this.pinchWalls) { ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); }
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (!this.gateOpen) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(GATE[0], GATE[1]); ctx.lineTo(GATE[2], GATE[3]); ctx.stroke(); }

    // top lanes
    'NEON'.split('').forEach((ch, i) => {
      const x = LANES[i], lit = this.lanesLit[i];
      ctx.fillStyle = lit ? '#f472b6' : 'rgba(244,114,182,.18)';
      ctx.shadowColor = '#f472b6'; ctx.shadowBlur = lit ? 16 : 0;
      ctx.beginPath(); ctx.arc(x, 172, 10, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = lit ? '#fff' : 'rgba(255,255,255,.5)'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(ch, x, 176);
    });

    // slingshots
    SLINGS.forEach((sl, i) => {
      ctx.fillStyle = this.slingFlash[i] > 0 ? '#fde047' : '#1e293b';
      ctx.beginPath(); ctx.moveTo(...sl.a); ctx.lineTo(...sl.b); ctx.lineTo(...sl.c); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(...sl.a); ctx.lineTo(...sl.c); ctx.stroke();
    });

    // black hole
    if (this.hole) {
      const hl = this.hole, k = Math.min(1, (4 - hl.t) * 2, hl.t * 2);
      ctx.save(); ctx.translate(hl.x, hl.y);
      const hg = ctx.createRadialGradient(0, 0, 2, 0, 0, 60 * k);
      hg.addColorStop(0, '#000'); hg.addColorStop(0.35, 'rgba(88,28,135,.9)'); hg.addColorStop(1, 'rgba(88,28,135,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 60 * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(216,180,254,.7)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, (14 + i * 12) * k, t * (4 - i) + i, t * (4 - i) + i + 2.2); ctx.stroke(); }
      ctx.restore();
    }

    // orbit diverter
    this.divFlash = Math.max(0, (this.divFlash || 0) - 0.05);
    ctx.strokeStyle = this.divFlash > 0 ? '#fde047' : '#f472b6'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(24, 292); ctx.lineTo(56, 306); ctx.stroke();

    // spinner (left lane)
    ctx.save(); ctx.translate((SPINNER.x1 + SPINNER.x2) / 2, SPINNER.y);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.stroke();
    const sh = Math.cos(this.spinA) * 9;
    ctx.fillStyle = this.spin > 20 ? '#fde047' : '#e2e8f0'; ctx.fillRect(-15, -Math.abs(sh), 30, Math.max(2, Math.abs(sh) * 2));
    ctx.restore();

    // UFO
    if (this.ufo) {
      const u = this.ufo, bob = Math.sin(t * 4) * 3;
      ctx.save(); ctx.translate(u.x, UFO_Y + bob);
      ctx.fillStyle = 'rgba(74,222,128,.14)'; ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(10, 8); ctx.lineTo(22, 40); ctx.lineTo(-22, 40); ctx.fill();
      ctx.fillStyle = u.flash > 0 ? '#fde047' : '#94a3b8'; ctx.shadowColor = this.multiball ? '#fde047' : '#4ade80'; ctx.shadowBlur = 14 + u.flash * 20;
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a5f3fc'; ctx.beginPath(); ctx.ellipse(0, -6, 11, 9, 0, Math.PI, 0); ctx.fill(); ctx.shadowBlur = 0;
      for (let i = -2; i <= 2; i++) { ctx.fillStyle = (Math.floor(t * 8) + i) % 2 ? '#f472b6' : '#fde047'; ctx.beginPath(); ctx.arc(i * 9, 2, 2, 0, TAU); ctx.fill(); }
      if (this.multiball) { ctx.fillStyle = '#fde047'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('JACKPOT', 0, -18); }
      ctx.restore();
    }

    // centre post + kickback light
    if (this.post) { ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(POST.x, POST.y, POST.r, 0, TAU); ctx.fill(); }
    if (this.kickback || (!this.bonus && this.level <= 3)) {
      ctx.fillStyle = this.kickback ? `rgba(74,222,128,${0.6 + 0.4 * Math.sin(t * 6)})` : 'rgba(74,222,128,.15)';
      ctx.beginPath(); ctx.moveTo(40, 640); ctx.lineTo(50, 624); ctx.lineTo(30, 624); ctx.closePath(); ctx.fill();
    }

    // bumpers
    this.bumpers.forEach((bu, i) => {
      const f = this.bumperFlash[i];
      ctx.save(); ctx.translate(bu.x, bu.y);
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, 0, bu.r + 3, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, bu.r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, f > 0 ? '#fde047' : ['#f472b6', '#22d3ee', '#a3e635'][i]); g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g; ctx.shadowColor = ['#f472b6', '#22d3ee', '#a3e635'][i]; ctx.shadowBlur = 10 + f * 24;
      ctx.beginPath(); ctx.arc(0, 0, bu.r - 2 + f * 3, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('100', 0, 4);
      ctx.restore();
    });

    // drop targets
    TARGETS.forEach((tg, i) => {
      if (this.targetsDown[i]) { ctx.fillStyle = 'rgba(34,211,238,.15)'; ctx.fillRect(tg.x - 5, tg.y, 10, tg.h); return; }
      ctx.fillStyle = '#22d3ee'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 10;
      roundRect(ctx, tg.x - 6, tg.y, 12, tg.h, 3); ctx.fill(); ctx.shadowBlur = 0;
    });

    // saucer
    ctx.save(); ctx.translate(SAUCER.x, SAUCER.y);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, SAUCER.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(253,224,71,${0.5 + 0.5 * Math.sin(t * 5)})`; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();

    // flippers
    for (const f of this.flippers) {
      const [tx, ty] = this.tip(f);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(f.px, f.py, 4, 0, TAU); ctx.fill();
    }

    // plunger
    const pull = this.charging ? this.charge * 40 : 0;
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(LANE_X - 6, LANE_Y + R + 2 + pull, 12, 50);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(LANE_X - 10, LANE_Y + R + 2 + pull, 20, 6);

    // balls
    for (const b of this.balls) {
      const y = b === this.plungerBall ? b.y + pull : b.y;
      const g = ctx.createRadialGradient(b.x - 3, y - 3, 1, b.x, y, R);
      if (s.gold) { g.addColorStop(0, '#fffbeb'); g.addColorStop(0.5, '#fbbf24'); g.addColorStop(1, '#92400e'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#cbd5e1'); g.addColorStop(1, '#475569'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, y, R, 0, TAU); ctx.fill();
    }

    // HUD: missions
    ctx.fillStyle = 'rgba(3,5,20,.8)'; ctx.fillRect(0, 0, W, 44);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#e879f9', `★ MULTIBALL FRENZY · ${Math.ceil(s.bonusLeft)}s`);
    else {
      const n = this.missions.length, w = (W - 28 - (n - 1) * 8) / n;
      this.missions.forEach((m, i) => {
        progressBar(ctx, 14 + i * (w + 8), 12, w, 20, m.have / m.need, m.have >= m.need ? '#4ade80' : '#fbbf24',
          `${MISSIONS[m.id].icon} ${MISSIONS[m.id].short} ${m.have}/${m.need}`);
      });
    }
    if (!this.bonus) {
      ctx.fillStyle = 'rgba(3,5,20,.65)'; ctx.fillRect(0, 44, W, 20);
      ctx.font = '800 12px system-ui'; ctx.textAlign = 'left';
      ctx.fillStyle = this.mTime < 10 ? (Math.floor(t * 4) % 2 ? '#f87171' : '#fecaca') : '#e2e8f0';
      ctx.fillText(`⏱ ${Math.ceil(this.mTime)}s`, 14, 58);
      progressBar(ctx, 70, 49, 150, 8, this.mTime / this.mTimeMax, this.mTime < 10 ? '#f87171' : '#38bdf8');
      ctx.textAlign = 'right'; ctx.fillStyle = this.multiball ? '#f472b6' : '#a5f3fc';
      ctx.fillText(this.multiball ? '★ MULTIBALL — hit the UFO for JACKPOTS' : `🔒 Locks ${this.locks}/2`, W - 14, 58);
    }
    if (this.plungerBall && s.state === 'playing') {
      ctx.save(); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5); ctx.fillStyle = '#fde047'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Touch & hold, then let go to launch' : 'Hold SPACE, then let go to launch', 220, 690);
      ctx.restore();
      if (this.charging) { ctx.fillStyle = '#fde047'; ctx.fillRect(430, 700 - this.charge * 80, 6, this.charge * 80); }
    }
    if (this.tilted > 0) { ctx.fillStyle = '#f87171'; ctx.font = '900 40px system-ui'; ctx.textAlign = 'center'; ctx.fillText('TILT', 220, 360); }
    if (this.balls.some((b) => b.inPlay && this.t < b.saveUntil) && !this.bonus) {
      ctx.fillStyle = `rgba(74,222,128,${0.5 + 0.5 * Math.sin(t * 8)})`; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BALL SAVE', 220, 710);
    }
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText('★ GOLDEN BALL', 26, 80); }
  }
}

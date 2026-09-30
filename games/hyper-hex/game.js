// ─────────────────────────────────────────────────────────────
//  HYPER HEX — game 10 (Zone 2 · Extreme)
//  You're a tiny arrow circling the core. Hexagon walls close in from every
//  side, each with a gap. Slip through the gaps while the whole world spins.
//  Survive the clock to clear the level. One touch = a life lost, and the
//  level clock starts again.
//
//  L1 learn it (20 s) · L3 the spin starts reversing · L4 spiral staircases
//  L6 double gaps get narrower patterns · L8 faster everything · up to 60 s a level
//  Every 5th level: ★ GEM RUSH — walls turn to ghosts, grab the gems for 15 s
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'hyper-hex';
const W = 480, H = 720;
const CX = W / 2, CY = 390;
const SIDES = 6, SEG = (Math.PI * 2) / SIDES;
const CORE = 56;              // radius of the centre hexagon
const RP = 86;                // radius the player orbits at
const TAU = Math.PI * 2;
const goalFor = (level) => Math.min(60, 20 + (level - 1) * 4);

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 0,
  comboStep: 6,
  maxMultiplier: 5,
  bonusTime: 15,
  music: { bpm: 152, style: 'minor', lead: 'sawtooth', arp: [0, 3, 1, 4, 2, 4, 1, 3], oct: [12, 12, 12, 12, 24, 12, 12, 12], bass: 'drive' },
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 200),
  levelInfo(level, bonus) {
    if (bonus) return '★ GEM RUSH! The walls are ghosts — grab every gem you can in 15 seconds.';
    const notes = {
      1: `Hold ← → (or A / D, or press the left / right half of the screen) to circle the core. Slip through the gaps and survive ${goalFor(1)} s!`,
      2: 'Walls come in pairs now. Plan your next move early.',
      3: '🌀 The world starts spinning the other way without warning.',
      4: '🌀 SPIRALS: follow the staircase round the core.',
      6: 'Tighter patterns — sometimes the only way out is the long way round.',
      8: 'HYPER SPEED. Everything is faster.',
    };
    return notes[level] || `Survive ${goalFor(level)} seconds. Faster!`;
  },
  create: (shell) => new HyperHex(shell),
});

const sectorOf = (a) => Math.floor((((a % TAU) + TAU) % TAU) / SEG) % SIDES;

class HyperHex {
  constructor(s) {
    this.s = s; this.t = 0;
    this.angle = -Math.PI / 2 + SEG / 2;
    this.rot = 0; this.rotSpeed = 0.6; this.pulse = 0; this.hue = 190;
    this.startLevel(1, false);
  }

  reset() { this.angle = -Math.PI / 2 + SEG / 2; }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.goal = goalFor(level);
    this.wallSpeed = Math.min(600, 200 * s.speed(0.06));    // gentle start, ~70% faster by level 10
    this.moveSpeed = Math.min(10.5, 6.6 * s.speed(0.025));
    this.baseSpin = Math.min(3.2, 0.3 + level * 0.14);
    this.hue = (190 + level * 37) % 360;
    this.restart();
  }

  restart() {
    this.walls = []; this.gems = [];
    this.clock = 0;
    this.nextSpawn = 0.6;
    this.spinDir = 1; this.spinT = 3 + this.s.rng.range(0, 2);
    this.gemCount = 0; this.ringsPassed = 0;
    this.livesAtStart = this.s.lives;
    this.hitFlash = 0;
  }

  // ── Patterns (all distances in "rings"; one ring = spacing px) ──
  spawnPattern() {
    const r = this.s.rng, L = this.level;
    // rings are spaced in TIME so every pattern stays possible at any speed
    const spacing = this.wallSpeed * Math.max(0.47, 0.85 - L * 0.025);
    const th = 22 + Math.min(10, L);
    const off = r.int(0, SIDES - 1);
    const mir = r.chance(0.5) ? 1 : -1;
    const side = (k) => ((off + mir * k) % SIDES + SIDES) % SIDES;
    const start = 560;
    const add = (sides, ring, thick = th) => { for (const k of sides) this.walls.push({ side: side(k), d: start + ring * spacing, th: thick, passed: false, ring: this.ringId }); this.ringId++; };
    this.ringId = this.ringId || 0;
    const pool = ['solo', 'solo', 'alt'];
    if (L >= 2) pool.push('pair', 'alt');
    if (L >= 4) pool.push('spiral', 'spiral');
    if (L >= 6) pool.push('tunnel', 'double', 'zig');
    if (L >= 9) pool.push('spiral', 'zig', 'tunnel');
    const kind = this.bonus ? r.pick(['solo', 'alt', 'spiral']) : r.pick(pool);
    let rings = 1;
    if (kind === 'solo') add([1, 2, 3, 4, 5], 0);
    else if (kind === 'alt') { add([0, 2, 4], 0); add([1, 3, 5], 1); rings = 2; }
    else if (kind === 'pair') { add([1, 2, 3, 4, 5], 0); add([0, 1, 2, 4, 5], 1.2); rings = 2.2; }
    else if (kind === 'double') { add([1, 2, 4, 5], 0); add([0, 1, 3, 4], 1); add([1, 2, 4, 5], 2); rings = 3; }
    else if (kind === 'spiral') {
      const n = 4 + Math.min(4, Math.floor(L / 3));
      for (let i = 0; i < n; i++) add([0, 1, 2, 3, 4, 5].filter((k) => k !== i % SIDES && k !== (i + 1) % SIDES), i * 0.55);
      rings = n * 0.55 + 0.5;
    } else if (kind === 'zig') {
      for (let i = 0; i < 4; i++) add(i % 2 ? [3, 4, 5, 0] : [0, 1, 2, 3], i * 0.8);
      rings = 3.6;
    } else if (kind === 'tunnel') {
      // a long wall on one side, with gates you have to weave between
      this.walls.push({ side: side(0), d: start, th: spacing * 3.2, passed: false, ring: this.ringId++ });
      add([2, 3, 4], 0.4); add([1, 2, 5], 1.4); add([2, 3, 4], 2.4);
      rings = 3.6;
    }
    return rings * spacing / this.wallSpeed + (this.bonus ? 0.2 : Math.max(0.15, 0.55 - L * 0.02));
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; this.rot += dt * 0.4; this.pulse = Math.max(0, this.pulse - dt * 3); }

  hits(angle, which) {
    const sec = sectorOf(angle);
    for (const w of this.walls) {
      if (w.side !== sec) continue;
      if (w.d <= RP + 5 && w.d + w.th >= RP - 5) return which ? w : true;
    }
    return null;
  }

  update(dt) {
    const s = this.s, L = this.level;
    this.t += dt; this.clock += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.pulse = Math.max(0, this.pulse - dt * 3);

    // world spin (visual) — reverses without warning from level 3
    this.spinT -= dt;
    if (this.spinT <= 0 && L >= 3) { this.spinDir = -this.spinDir; this.spinT = s.rng.range(2, 5); }
    this.rot += dt * this.baseSpin * this.spinDir * (1 + 0.25 * Math.sin(this.t * 0.7));

    // player
    const dir = (s.input.isDown('right') ? 1 : 0) - (s.input.isDown('left') ? 1 : 0)
      + (s.input.pointer.down ? (s.input.pointer.x > W / 2 ? 1 : -1) : 0);
    if (dir) {
      const na = this.angle + Math.sign(dir) * this.moveSpeed * dt;
      // walls block you from the side (you only crash if one hits you head-on)
      if (this.bonus || !this.hits(na)) this.angle = na;
    }

    // walls move in
    for (const w of this.walls) {
      w.d -= this.wallSpeed * dt;
      if (!w.passed && w.d + w.th < RP - 6) {
        w.passed = true;
        if (!this.bonus && !this.walls.some((o) => o !== w && o.ring === w.ring && !o.passed)) {
          this.ringsPassed++;
          s.award(5 * L, CX, CY - 150, { chain: true, color: `hsl(${this.hue},90%,70%)`, size: 14 });
        }
      }
    }
    this.walls = this.walls.filter((w) => w.d + w.th > CORE - 4);

    // crash?
    if (!this.bonus && this.hits(this.angle)) {
      s.sound.play('boom'); s.fx.shake(10, 0.4);
      const px = CX + Math.cos(this.angle + this.rot) * RP, py = CY + Math.sin(this.angle + this.rot) * RP;
      s.fx.burst(px, py, { colors: ['#fff', `hsl(${this.hue},90%,65%)`], count: 40, speed: 260 });
      this.hitFlash = 1;
      s.resetCombo();
      s.hurt();
      return;
    }

    // spawn
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) this.nextSpawn = this.spawnPattern();

    // gems: rare in normal levels, everywhere in Gem Rush
    if ((this.bonus && s.rng.chance(dt * 2.2)) || (!this.bonus && L >= 2 && s.rng.chance(dt * 0.12))) {
      this.gems.push({ a: s.rng.range(0, TAU), d: 560, spin: 0 });
    }
    for (const g of this.gems) {
      g.d -= this.wallSpeed * dt * 0.8; g.spin += dt * 4;
      if (!g.got && Math.abs(g.d - RP) < 12) {
        let da = ((g.a - this.angle) % TAU + TAU * 1.5) % TAU - Math.PI;
        if (Math.abs(da) < 0.3) {
          g.got = true; this.gemCount++;
          const px = CX + Math.cos(this.angle + this.rot) * RP, py = CY + Math.sin(this.angle + this.rot) * RP;
          s.award((this.bonus ? 25 : 40) * L, px, py - 20, { chain: true, color: '#fde047', size: 18 });
          s.sound.play('gem');
          s.fx.burst(px, py, { colors: ['#fde047', '#fff'], count: 12, speed: 150 });
          if (this.bonus && this.gemCount >= 20) s.unlock('gems');
        }
      }
    }
    this.gems = this.gems.filter((g) => !g.got && g.d > CORE);

    // beat pulse
    const beat = 60 / 152;
    if (Math.floor(this.t / beat) !== Math.floor((this.t - dt) / beat)) this.pulse = 1;

    // clock
    if (!this.bonus && this.clock >= this.goal) {
      s.fx.text(W / 2, 170, 'SURVIVED!', { color: '#fde047', size: 38, life: 1.4 });
      if (s.lives === this.livesAtStart && L >= 3) s.unlock('nohit');
      if (this.goal >= 60) s.unlock('survive60');
      s.completeLevel();
    }
  }

  onLifeLost() { this.restart(); }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t;
    const hue = this.bonus ? (t * 60) % 360 : this.hue;
    const zoom = 1;                       // no beat zoom — keeps the core steady and easy to see
    ctx.fillStyle = `hsl(${hue}, 45%, 8%)`; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(zoom, zoom); ctx.rotate(this.rot);
    // alternating background sectors
    for (let k = 0; k < SIDES; k++) {
      ctx.fillStyle = k % 2 ? `hsl(${hue}, 50%, 12%)` : `hsl(${hue}, 45%, 17%)`;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(k * SEG) * 900, Math.sin(k * SEG) * 900);
      ctx.lineTo(Math.cos((k + 1) * SEG) * 900, Math.sin((k + 1) * SEG) * 900);
      ctx.closePath(); ctx.fill();
    }
    // walls (drawn as trapezoid slices of a hexagon)
    ctx.fillStyle = this.bonus ? 'rgba(255,255,255,.18)' : `hsl(${hue}, 95%, ${62 + this.pulse * 4}%)`;
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`; ctx.shadowBlur = this.bonus ? 0 : 12;
    for (const w of this.walls) {
      const r1 = Math.max(CORE, w.d), r2 = Math.max(CORE, w.d + w.th);
      if (r2 <= r1) continue;
      const a1 = w.side * SEG, a2 = (w.side + 1) * SEG;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1); ctx.lineTo(Math.cos(a2) * r1, Math.sin(a2) * r1);
      ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2); ctx.lineTo(Math.cos(a1) * r2, Math.sin(a1) * r2);
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // gems
    for (const g of this.gems) {
      ctx.save(); ctx.translate(Math.cos(g.a) * g.d, Math.sin(g.a) * g.d); ctx.rotate(g.spin);
      ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // core hexagon
    const cr = CORE - 6 + this.pulse * 1.5;
    ctx.fillStyle = `hsl(${hue}, 45%, 10%)`; ctx.strokeStyle = `hsl(${hue}, 95%, 65%)`; ctx.lineWidth = 5;
    ctx.beginPath(); for (let k = 0; k <= SIDES; k++) { const a = k * SEG; ctx.lineTo(Math.cos(a) * cr, Math.sin(a) * cr); } ctx.closePath(); ctx.fill(); ctx.stroke();
    // player arrow
    ctx.save(); ctx.rotate(this.angle); ctx.translate(RP, 0);
    ctx.fillStyle = s.gold ? '#fbbf24' : this.hitFlash > 0 ? '#f87171' : '#ffffff';
    ctx.shadowColor = s.gold ? '#fbbf24' : '#fff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();

    // HUD
    ctx.fillStyle = 'rgba(3,5,20,.7)'; ctx.fillRect(0, 0, W, 44);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fde047', `★ GEM RUSH · ${this.gemCount} gems · ${Math.ceil(s.bonusLeft)}s`);
    else progressBar(ctx, 14, 12, W - 28, 20, clamp(this.clock / this.goal, 0, 1), `hsl(${hue},90%,60%)`, `Survive ${Math.max(0, this.goal - this.clock).toFixed(1)} s`);
    ctx.save(); ctx.font = '900 30px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)';
    if (!this.bonus) ctx.fillText(this.clock.toFixed(2), W / 2, 86);
    ctx.font = '700 12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Hold the left or right side of the screen' : 'Hold ← / → (or A / D)', W / 2, H - 16);
    ctx.restore();
  }
}

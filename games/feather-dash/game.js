// ─────────────────────────────────────────────────────────────
//  FEATHER DASH — endless flyer
//  L1-2  wide gaps, slow         L3  pillars start to sway
//  L4    golden-feather shields  L5  ★ bonus: golden sky seed rush
//  L6    hawks swoop in          L7+ narrower, faster, more hawks
//  Scenery changes every 5 levels: day → sunset → night → aurora
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const W = 480, H = 720, GROUND = 650, BIRD_X = 130, R = 15;
const GRAVITY = 1350, FLAP = -410, MAX_FALL = 560, PILLAR_W = 72;

const THEMES = [
  { name: 'day',    sky: ['#38bdf8', '#bae6fd'], far: '#7dd3fc', hill: '#4ade80', hill2: '#22c55e', ground: '#a16207', grass: '#65a30d', pillar: ['#16a34a', '#15803d'], cap: '#22c55e', body: '#f97316' },
  { name: 'sunset', sky: ['#7c3aed', '#fb923c'], far: '#c084fc', hill: '#be185d', hill2: '#9d174d', ground: '#7c2d12', grass: '#c2410c', pillar: ['#b45309', '#92400e'], cap: '#f59e0b', body: '#22d3ee' },
  { name: 'night',  sky: ['#020617', '#312e81'], far: '#1e1b4b', hill: '#1e3a8a', hill2: '#172554', ground: '#1e293b', grass: '#334155', pillar: ['#0d9488', '#115e59'], cap: '#2dd4bf', body: '#fbbf24' },
  { name: 'aurora', sky: ['#020617', '#134e4a'], far: '#0f766e', hill: '#064e3b', hill2: '#022c22', ground: '#1c1917', grass: '#14532d', pillar: ['#7c3aed', '#5b21b6'], cap: '#c4b5fd', body: '#f472b6' },
];
const BONUS_THEME = { name: 'gold', sky: ['#f59e0b', '#fef3c7'], far: '#fcd34d', hill: '#fbbf24', hill2: '#f59e0b', ground: '#b45309', grass: '#d97706', pillar: ['#fff', '#fff'], cap: '#fff', body: '#f97316' };

const need = (level) => 6 + level;

runGame({
  id: 'feather-dash',
  width: W,
  height: H,
  lives: 1,
  comboWindow: 0,      // combo lasts until you miss a seed
  comboStep: 4,
  maxMultiplier: 5,
  bonusTime: 15,
  music: { bpm: 124, style: 'major', lead: 'triangle' },
  levelInfo(level, bonus) {
    if (bonus) return 'Golden sky! You can\'t crash — collect the seeds!';
    const notes = {
      1: 'Tap, click or press Space to flap.',
      2: 'Collect seeds in a row for a combo.',
      3: 'The pillars are starting to sway…',
      4: 'Golden feathers give you a shield!',
      6: 'Sunset hawks! Watch for the ⚠ warning.',
      11: 'Night falls — stay sharp!',
      16: 'The northern lights…',
    };
    return notes[level] || `Pass ${need(level)} pillars · faster!`;
  },
  create: (shell) => new FeatherDash(shell),
});

class FeatherDash {
  constructor(s) {
    this.s = s;
    this.t = 0; this.scrollX = 0;
    // Cosmetic scenery uses Math.random (doesn't affect the daily seed)
    this.clouds = Array.from({ length: 6 }, () => ({ x: Math.random() * W, y: 40 + Math.random() * 260, s: 0.6 + Math.random() * 0.8 }));
    this.stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * 420, r: Math.random() * 1.6 + 0.3, p: Math.random() * 6 }));
    this.mount = Array.from({ length: 12 }, (_, i) => 360 + Math.sin(i * 1.7) * 50 + Math.random() * 40);
    this.reset();
    this.startLevel(1, false);
  }

  reset() {
    this.bird = { y: H * 0.42, vy: 0, rot: 0, wing: 0 };
    this.shield = false; this.invuln = 0; this.dead = false;
    this.seedsRun = 0;
  }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.theme = bonus ? BONUS_THEME : THEMES[Math.floor(((level - 1) % 20) / 5)];
    this.scroll = 150 * this.s.speed(0.06, 2.1, level);
    this.gap = Math.max(148, 245 - (level - 1) * 8);
    this.spacing = Math.max(215, 285 - level * 4);
    this.pillars = []; this.seeds = []; this.items = []; this.hawks = [];
    this.spawned = 0; this.passed = 0; this.need = need(level);
    this.lastGapY = H * 0.45;
    this.bird.vy = 0; this.hover = true; this.hoverBase = this.bird.y = clamp(this.bird.y, 120, GROUND - 120);
    this.waveT = 0;
  }

  onAction(a) {
    if (a === 'press' || a === 'action' || a === 'up') this.flap();
  }
  flap() {
    this.hover = false;
    this.bird.vy = FLAP;
    this.bird.wing = 1;
    this.s.sound.play('flap');
    this.s.fx.burst(BIRD_X - 10, this.bird.y + 6, { color: '#ffffffaa', count: 4, speed: 60, life: 0.4, size: 3, angle: Math.PI * 0.7, spread: 1 });
  }

  // ── Spawning ───────────────────────────────────────────────
  spawnPillar() {
    const r = this.s.rng, L = this.level;
    const margin = 70;
    const lo = margin + this.gap / 2, hi = GROUND - margin - this.gap / 2;
    const maxJump = 170 + L * 8;
    const gapY = clamp(r.range(lo, hi), this.lastGapY - maxJump, this.lastGapY + maxJump);
    this.lastGapY = gapY;
    const moving = L >= 3 && r.chance(Math.min(0.75, 0.25 + (L - 3) * 0.08));
    const p = {
      x: W + 20, base: gapY, gapY, gap: this.gap, passed: false,
      amp: moving ? Math.min(75, 30 + L * 4) : 0, spd: r.range(1.4, 2.4), ph: r.range(0, 6.28),
      seeds: [-24, 0, 24].map((dx) => ({ dx, taken: false })),
    };
    p.amp = Math.min(p.amp, p.base - lo + 20, hi - p.base + 20);
    this.pillars.push(p);
    this.spawned++;

    // Seeds halfway to the next pillar
    if (L >= 2 && r.chance(0.6)) this.seeds.push({ x: p.x + PILLAR_W / 2 + this.spacing / 2, y: gapY + r.range(-60, 60), taken: false });
    // Golden feather shield
    if (L >= 4 && !this.shield && r.chance(0.14)) this.items.push({ x: p.x + PILLAR_W / 2 + this.spacing / 2, y: gapY, taken: false });
    // Hawk
    if (L >= 6 && r.chance(Math.min(0.55, 0.18 + (L - 6) * 0.06))) {
      this.hawks.push({ x: W + 50, y: r.range(90, GROUND - 90), warn: 0.9, vx: this.scroll * 0.9 + 60, ph: r.range(0, 6) });
    }
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) {
    this.t += dt;
    if (this.hover && !this.dead) { this.bird.y = this.hoverBase + Math.sin(this.t * 4) * 8; this.bird.wing = (this.bird.wing + dt * 3) % 1; }
    if (this.dead && this.bird.y < GROUND - R) { this.bird.vy = Math.min(this.bird.vy + GRAVITY * dt, MAX_FALL * 1.4); this.bird.y = Math.min(GROUND - R, this.bird.y + this.bird.vy * dt); this.bird.rot = Math.min(1.5, this.bird.rot + dt * 5); }
    this.scrollX += (this.dead ? 0 : 30) * dt;
  }

  update(dt) {
    const s = this.s, b = this.bird, L = this.level;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    const sp = this.hover ? this.scroll * 0.4 : this.scroll;
    this.scrollX += sp * dt;

    // Bird physics
    if (this.hover) {
      b.y = this.hoverBase + Math.sin(this.t * 4) * 8; b.vy = 0;
    } else {
      b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
      b.y += b.vy * dt;
    }
    b.rot = clamp(b.vy / 700, -0.5, 1.1);
    b.wing = b.wing > 0 ? b.wing - dt * 4 : 0;
    if (b.y < R + 4) { b.y = R + 4; b.vy = Math.max(0, b.vy); }
    if (b.y + R >= GROUND) {
      if (this.bonus) { b.y = GROUND - R; b.vy = FLAP * 1.05; s.sound.play('bounce', 5); }
      else if (!this.hurt()) return;
    }

    if (this.bonus) return this.updateBonus(dt, sp);

    // Pillars
    const last = this.pillars[this.pillars.length - 1];
    if (!this.hover && this.spawned < this.need && (!last || last.x < W - this.spacing)) this.spawnPillar();
    for (const p of this.pillars) {
      p.x -= sp * dt;
      if (p.amp) p.gapY = p.base + Math.sin(this.t * p.spd + p.ph) * p.amp;
      // seeds inside the gap
      for (const sd of p.seeds) {
        if (sd.taken) continue;
        const sx = p.x + PILLAR_W / 2 + sd.dx, sy = p.gapY;
        if (Math.hypot(sx - BIRD_X, sy - b.y) < R + 12) { sd.taken = true; this.takeSeed(sx, sy); }
        else if (sx < BIRD_X - 30) { sd.taken = true; s.resetCombo(); }
      }
      if (!p.passed && p.x + PILLAR_W < BIRD_X - R) {
        p.passed = true; this.passed++;
        s.award(10 * L, BIRD_X, b.y - 34, { color: '#fff', size: 16 });
        s.sound.play('pass');
        if (this.passed >= this.need) return s.completeLevel();
      }
      if (!this.invuln) {
        const top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
        if (circleRect(BIRD_X, b.y, R - 2, p.x, -50, PILLAR_W, top + 50) || circleRect(BIRD_X, b.y, R - 2, p.x, bot, PILLAR_W, GROUND - bot)) {
          if (!this.hurt()) return;
        }
      }
    }
    this.pillars = this.pillars.filter((p) => p.x > -PILLAR_W - 10);

    // Loose seeds
    for (const sd of this.seeds) {
      sd.x -= sp * dt;
      if (sd.taken) continue;
      if (Math.hypot(sd.x - BIRD_X, sd.y - b.y) < R + 12) { sd.taken = true; this.takeSeed(sd.x, sd.y); }
      else if (sd.x < BIRD_X - 30) { sd.taken = true; s.resetCombo(); }
    }
    this.seeds = this.seeds.filter((sd) => sd.x > -20);

    // Shield feathers
    for (const it of this.items) {
      it.x -= sp * dt;
      if (!it.taken && Math.hypot(it.x - BIRD_X, it.y + Math.sin(this.t * 3) * 10 - b.y) < R + 16) {
        it.taken = true; this.shield = true;
        s.sound.play('powerup'); s.unlock('shield');
        s.award(25 * L, it.x, it.y - 20, { color: '#fbbf24' });
        s.fx.ring(BIRD_X, b.y, { color: '#fbbf24', radius: 50 });
      }
    }
    this.items = this.items.filter((it) => it.x > -30 && !it.taken);

    // Hawks
    for (const hk of this.hawks) {
      if (hk.warn > 0) { hk.warn -= dt; continue; }
      hk.x -= hk.vx * dt;
      hk.y += Math.sin(this.t * 3 + hk.ph) * 40 * dt;
      if (!this.invuln && Math.hypot(hk.x - BIRD_X, hk.y - b.y) < R + 14) { if (!this.hurt()) return; }
    }
    this.hawks = this.hawks.filter((hk) => hk.x > -60);
  }

  updateBonus(dt, sp) {
    const s = this.s, b = this.bird;
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = 0.16;
      const y = H * 0.45 + Math.sin(this.t * 1.9) * 190 + Math.sin(this.t * 5.3) * 30;
      const big = s.rng.chance(0.08);
      this.seeds.push({ x: W + 20, y: clamp(y, 60, GROUND - 60), taken: false, big });
    }
    for (const sd of this.seeds) {
      sd.x -= sp * 1.2 * dt;
      if (!sd.taken && Math.hypot(sd.x - BIRD_X, sd.y - b.y) < R + (sd.big ? 20 : 14)) {
        sd.taken = true;
        if (sd.big) { s.award(60 * this.level, sd.x, sd.y - 16, { chain: true, color: '#fff', size: 26 }); s.sound.play('golden'); s.fx.ring(sd.x, sd.y, { color: '#fff', radius: 40 }); }
        else this.takeSeed(sd.x, sd.y, 15);
      }
    }
    this.seeds = this.seeds.filter((sd) => sd.x > -20 && !sd.taken);
    if (Math.random() < 0.5) s.fx.burst(BIRD_X - 14, b.y, { colors: ['#fde68a', '#fff'], count: 1, speed: 40, life: 0.5, size: 3, angle: Math.PI, spread: 0.8 });
  }

  takeSeed(x, y, base = 5) {
    const s = this.s;
    this.seedsRun++;
    if (this.seedsRun >= 50) s.unlock('seeds50');
    s.award(base * this.level, x, y - 16, { chain: true, color: '#fde047', size: 16 });
    s.sound.play('coin', Math.min(8, s.comboCount));
    s.fx.burst(x, y, { colors: ['#fde047', '#fbbf24', '#fff'], count: 8, speed: 120, life: 0.4 });
  }

  /** Returns true if the bird survives (shield). */
  hurt() {
    const s = this.s, b = this.bird;
    if (this.shield) {
      this.shield = false; this.invuln = 1.3;
      b.vy = FLAP * 0.8;
      if (b.y + R >= GROUND) b.y = GROUND - R - 1;
      s.sound.play('metal'); s.unlock('saved');
      s.fx.ring(BIRD_X, b.y, { color: '#fbbf24', radius: 70, width: 5 });
      s.fx.burst(BIRD_X, b.y, { colors: ['#fbbf24', '#fff'], count: 30, speed: 260 });
      s.fx.shake(5, 0.2);
      return true;
    }
    this.dead = true;
    s.fx.burst(BIRD_X, b.y, { colors: [this.theme.body, '#fff', '#fde68a'], count: 40, speed: 260, life: 0.8 });
    b.vy = -200;
    s.hurt();
    return false;
  }

  onLifeLost() {
    this.dead = false; this.invuln = 1.5;
    this.bird.y = H * 0.42; this.bird.vy = 0; this.bird.rot = 0;
    this.hover = true; this.hoverBase = this.bird.y;
    this.hawks = [];
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const th = this.theme, t = this.t, sx = this.scrollX;

    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    if (th.name === 'night' || th.name === 'aurora') {
      for (const st of this.stars) { ctx.globalAlpha = 0.5 + Math.sin(t * 2 + st.p) * 0.4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (th.name === 'aurora') {
      for (let k = 0; k < 3; k++) {
        ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = ['#34d399', '#22d3ee', '#a78bfa'][k];
        ctx.beginPath(); ctx.moveTo(0, 120 + k * 40);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 120 + k * 40 + Math.sin(x * 0.012 + t * 0.6 + k) * 40);
        for (let x = W; x >= 0; x -= 20) ctx.lineTo(x, 190 + k * 40 + Math.sin(x * 0.01 + t * 0.5 + k * 2) * 30);
        ctx.fill(); ctx.restore();
      }
    }
    if (th.name === 'gold') {
      ctx.save(); ctx.translate(W / 2, 160); ctx.rotate(t * 0.3); ctx.fillStyle = 'rgba(255,255,255,.22)';
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -700); ctx.lineTo(40, -700); ctx.fill(); }
      ctx.restore();
    }
    // Sun / moon
    ctx.save();
    const moon = th.name === 'night' || th.name === 'aurora';
    ctx.shadowColor = moon ? '#e0e7ff' : '#fde68a'; ctx.shadowBlur = 40;
    ctx.fillStyle = moon ? '#e0e7ff' : th.name === 'sunset' ? '#fdba74' : '#fef08a';
    ctx.beginPath(); ctx.arc(W - 100, th.name === 'sunset' ? 330 : 120, moon ? 34 : 46, 0, 7); ctx.fill();
    if (moon) { ctx.shadowBlur = 0; ctx.fillStyle = th.sky[0]; ctx.beginPath(); ctx.arc(W - 86, 110, 30, 0, 7); ctx.fill(); }
    ctx.restore();

    // Far mountains
    ctx.fillStyle = th.far; ctx.globalAlpha = 0.7;
    this.layer(ctx, sx * 0.15, 120, (i) => this.mount[i % this.mount.length], 470);
    ctx.globalAlpha = 1;
    // Clouds
    ctx.fillStyle = moon ? 'rgba(148,163,184,.25)' : 'rgba(255,255,255,.85)';
    for (const c of this.clouds) {
      const x = ((c.x - sx * 0.3 * c.s) % (W + 160) + W + 160) % (W + 160) - 80;
      cloud(ctx, x, c.y, 26 * c.s);
    }
    // Hills
    ctx.fillStyle = th.hill;
    this.layer(ctx, sx * 0.45, 90, (i) => 520 + Math.sin(i * 2.3) * 30, 560);
    ctx.fillStyle = th.hill2;
    this.layer(ctx, sx * 0.7, 70, (i) => 580 + Math.sin(i * 1.3 + 1) * 22, GROUND);

    // Pillars
    for (const p of this.pillars) {
      const top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
      this.pillar(ctx, p.x, -10, PILLAR_W, top + 10, true);
      this.pillar(ctx, p.x, bot, PILLAR_W, GROUND - bot, false);
      for (const sd of p.seeds) if (!sd.taken) seed(ctx, p.x + PILLAR_W / 2 + sd.dx, p.gapY, t);
    }
    for (const sd of this.seeds) if (!sd.taken) seed(ctx, sd.x, sd.y, t, sd.big);
    for (const it of this.items) feather(ctx, it.x, it.y + Math.sin(t * 3) * 10, t);

    // Hawks + warnings
    for (const hk of this.hawks) {
      if (hk.warn > 0) {
        if (Math.floor(t * 8) % 2) { ctx.font = '700 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fb7185'; ctx.fillText('⚠', W - 24, hk.y); }
      } else hawk(ctx, hk.x, hk.y, t);
    }

    // Ground
    ctx.fillStyle = th.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = th.grass; ctx.fillRect(0, GROUND, W, 12);
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    for (let x = -((sx) % 40); x < W; x += 40) ctx.fillRect(x, GROUND + 22, 20, 6);

    // Bird
    this.drawBird(ctx);

    // Progress
    if (this.bonus) progressBar(ctx, 16, 14, W - 32, 18, this.s.bonusLeft / 15, '#b45309', `★ GOLDEN SKY · ${Math.ceil(this.s.bonusLeft)}s`);
    else progressBar(ctx, 16, 14, W - 32, 18, this.passed / this.need, this.theme.cap, `Pillars ${this.passed} / ${this.need}`);

    if (this.hover && this.s.state === 'playing') {
      ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3;
      ctx.font = '700 22px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 4;
      ctx.strokeText('Tap / Space to flap', W / 2, H * 0.62); ctx.fillText('Tap / Space to flap', W / 2, H * 0.62);
      ctx.restore();
    }
  }

  layer(ctx, offset, step, heightAt, bottom) {
    const start = Math.floor(offset / step);
    ctx.beginPath(); ctx.moveTo(0, bottom);
    for (let i = start - 1; i <= start + Math.ceil(W / step) + 1; i++) {
      const x = i * step - offset;
      ctx.lineTo(x, heightAt(((i % 1000) + 1000) % 1000));
    }
    ctx.lineTo(W, bottom); ctx.closePath(); ctx.fill();
  }

  pillar(ctx, x, y, w, h, isTop) {
    if (h <= 0) return;
    const th = this.theme;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, th.pillar[1]); g.addColorStop(0.35, th.pillar[0]); g.addColorStop(1, th.pillar[1]);
    ctx.fillStyle = g; ctx.fillRect(x + 4, y, w - 8, h);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 12, y, 6, h);
    const capY = isTop ? y + h - 22 : y;
    ctx.fillStyle = th.cap; roundRect(ctx, x - 2, capY, w + 4, 22, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x + 4, capY + 4, w - 8, 4);
  }

  drawBird(ctx) {
    const b = this.bird, t = this.t;
    if (this.invuln && Math.floor(t * 14) % 2) return;
    ctx.save();
    ctx.translate(BIRD_X, b.y); ctx.rotate(b.rot);
    if (this.shield) {
      ctx.save(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.3;
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, R + 9, 0, 7); ctx.stroke(); ctx.restore();
    }
    const body = this.theme.body;
    // tail
    ctx.fillStyle = shade(body, -30);
    ctx.beginPath(); ctx.moveTo(-R + 2, -2); ctx.lineTo(-R - 12, -9); ctx.lineTo(-R - 10, 6); ctx.closePath(); ctx.fill();
    // body
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, R + 3, R, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.ellipse(3, 6, R - 3, R - 8, 0, 0, 7); ctx.fill();
    // wing
    const flapA = this.dead ? 0.3 : this.hover ? Math.sin(t * 16) * 0.7 : b.wing > 0 ? -1.1 * b.wing + Math.sin(t * 30) * 0.2 : Math.sin(t * 10) * 0.25;
    ctx.save(); ctx.translate(-3, 0); ctx.rotate(flapA);
    ctx.fillStyle = shade(body, -40); ctx.beginPath(); ctx.ellipse(-4, -2, 11, 7, -0.3, 0, 7); ctx.fill();
    ctx.restore();
    // eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, -5, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b0b1a';
    if (this.dead) { ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('x', 8.5, -4.5); }
    else { ctx.beginPath(); ctx.arc(9.5, -5, 2.6, 0, 7); ctx.fill(); }
    // beak
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(R + 1, -3); ctx.lineTo(R + 11, 1); ctx.lineTo(R + 1, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ── Drawing helpers ────────────────────────────────────────────
function circleRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
function cloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7); ctx.arc(x + r * 1.1, y - r * 0.4, r * 1.2, 0, 7); ctx.arc(x + r * 2.3, y, r * 0.9, 0, 7);
  ctx.fill();
}
function seed(ctx, x, y, t, big = false) {
  const r = big ? 12 : 7;
  ctx.save(); ctx.translate(x, y + Math.sin(t * 5 + x * 0.05) * 3);
  ctx.shadowColor = '#fde047'; ctx.shadowBlur = big ? 22 : 10;
  ctx.fillStyle = big ? '#fff' : '#fde047';
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r, 0.4, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = big ? '#fbbf24' : '#a16207';
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.25, r * 0.6, 0.4, 0, 7); ctx.fill();
  ctx.restore();
}
function feather(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.3 + 0.5);
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20;
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 20, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 24); ctx.stroke();
  ctx.restore();
}
function hawk(ctx, x, y, t) {
  const w = Math.sin(t * 14) * 12;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#44403c';
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(8, -8 - w, 26, -4 - w * 1.4); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(8, 8 + w, 26, 4 + w * 1.4); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(-15, -2); ctx.lineTo(-24, 2); ctx.lineTo(-15, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-9, -2, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(-9.5, -2, 1.6, 0, 7); ctx.fill();
  ctx.restore();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => clamp(v + amt, 0, 255);
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

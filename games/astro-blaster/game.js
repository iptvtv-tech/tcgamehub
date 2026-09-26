// ─────────────────────────────────────────────────────────────
//  ASTRO BLASTER — space shooter
//  L1  slow rocks, hold to fire          L2  ⚡ SHOCK asteroids: shoot one and it goes off
//                                          with a bang, a white flash and a shockwave
//                                          that sets off everything nearby (chain reactions!)
//  L3  power-ups (spread, rapid, shield) L4  big rocks split into smaller ones
//  L5  ★ bonus: crystal storm            L6  comets streak across
//  L7  UFOs that shoot back              L8+ faster, busier, more shock rocks
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const W = 480, H = 720;
const SHIP_R = 13, SHOCK_RADIUS = 150;
const SIZES = { 3: { r: 40, hp: 3 }, 2: { r: 26, hp: 2 }, 1: { r: 15, hp: 1 } };
const POWERS = {
  spread: { label: 'S', color: '#a78bfa', name: 'Spread shot' },
  rapid:  { label: 'R', color: '#22d3ee', name: 'Rapid fire' },
  shield: { label: '◈', color: '#4ade80', name: 'Shield' },
};

const need = (level) => 12 + level * 3;

runGame({
  id: 'astro-blaster',
  width: W,
  height: H,
  lives: 3,
  comboWindow: 1.6,   // keep blasting within 1.6s to build the combo
  comboStep: 4,
  maxMultiplier: 6,
  bonusTime: 15,
  music: { bpm: 132, style: 'minor', lead: 'sawtooth' },
  levelInfo(level, bonus) {
    if (bonus) return 'Crystal storm! You can\'t be hit — grab every crystal!';
    const notes = {
      1: 'Move with mouse / arrows. Hold SPACE or the mouse button to fire!',
      2: '⚡ Glowing SHOCK asteroids! Shoot one to blow up everything near it.',
      3: 'Power-ups drop from big rocks — catch them!',
      4: 'Big rocks split into smaller ones.',
      6: 'Comets incoming — they\'re fast!',
      7: 'UFOs! They shoot back.',
    };
    return notes[level] || `Blast ${need(level)} asteroids · faster!`;
  },
  create: (shell) => new AstroBlaster(shell),
});

class AstroBlaster {
  constructor(s) {
    this.s = s; this.t = 0;
    // Cosmetic background (Math.random is fine for scenery)
    this.stars = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() }));
    this.nebulas = Array.from({ length: 4 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, r: 160 + Math.random() * 140, hue: [280, 190, 330, 220][i] }));
    this.ship = { x: W / 2, y: H - 110, tx: W / 2, ty: H - 110, tilt: 0 };
    this.reset();
    this.startLevel(1, false);
  }

  reset() {
    this.ship.x = this.ship.tx = W / 2; this.ship.y = this.ship.ty = H - 110;
    this.shield = false; this.invuln = 0; this.dead = false;
    this.spreadT = 0; this.rapidT = 0;
  }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.rocks = []; this.bullets = []; this.enemyShots = []; this.caps = []; this.waves = []; this.pending = [];
    this.ufo = null; this.ufoT = 8;
    this.kills = 0; this.need = need(level);
    this.spawnT = 0.6; this.cometT = 5; this.fireT = 0;
    this.speedK = this.s.speed(0.065, 2.2, level);
    this.shockChance = level >= 2 ? Math.min(0.2, 0.08 + (level - 2) * 0.02) : 0;
    this.gemsGot = 0;
    this.hasFired = false;
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x, y) {
    if (a === 'press') this.drag = { px: x, py: y, sx: this.ship.tx, sy: this.ship.ty };
    if (a === 'release') this.drag = null;
  }
  onPointerMove(x, y, down) {
    if (down && this.drag) {
      this.ship.tx = this.drag.sx + (x - this.drag.px) * 1.25;
      this.ship.ty = this.drag.sy + (y - this.drag.py) * 1.25;
    } else if (!down) { this.ship.tx = x; this.ship.ty = y; }
  }

  // ── Spawning ───────────────────────────────────────────────
  spawnRock() {
    const r = this.s.rng, L = this.level;
    let size = 1;
    const roll = r.next();
    if (L >= 4) size = roll < 0.3 ? 3 : roll < 0.7 ? 2 : 1;
    else size = roll < 0.5 ? 2 : 1;
    const shock = r.chance(this.shockChance);
    if (shock) size = 2;
    this.addRock(r.range(30, W - 30), -50, size, shock ? 'shock' : 'rock', r.range(-40, 40), r.range(70, 130) * this.speedK);
  }
  addRock(x, y, size, type, vx, vy) {
    const r = this.s.rng, S = SIZES[size];
    const verts = 9 + size * 2;
    this.rocks.push({
      x, y, vx, vy, size, type, r: S.r, hp: type === 'shock' ? 1 : S.hp,
      rot: r.range(0, 6.28), vr: r.range(-1.5, 1.5), hue: r.int(0, 359), flash: 0,
      shape: Array.from({ length: verts }, () => r.range(0.78, 1.08)),
      craters: Array.from({ length: size + 1 }, () => ({ a: r.range(0, 6.28), d: r.range(0.2, 0.55), s: r.range(0.12, 0.22) })),
    });
  }
  spawnGem() {
    const r = this.s.rng;
    this.rocks.push({ x: r.range(30, W - 30), y: -20, vx: r.range(-30, 30), vy: r.range(160, 260), size: 1, type: 'gem', r: 14, hp: 1, rot: 0, vr: r.range(-3, 3), hue: r.int(0, 359), flash: 0, shape: [], craters: [] });
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; }

  update(dt) {
    const s = this.s, sh = this.ship, L = this.level;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.spreadT = Math.max(0, this.spreadT - dt);
    this.rapidT = Math.max(0, this.rapidT - dt);

    // Ship movement
    const kx = (s.input.isDown('right') ? 1 : 0) - (s.input.isDown('left') ? 1 : 0);
    const ky = (s.input.isDown('down') ? 1 : 0) - (s.input.isDown('up') ? 1 : 0);
    if (kx || ky) { sh.tx = sh.x + kx * 440 * dt * 4; sh.ty = sh.y + ky * 440 * dt * 4; this.drag = null; }
    sh.tx = clamp(sh.tx, 24, W - 24); sh.ty = clamp(sh.ty, H * 0.42, H - 40);
    const px = sh.x;
    sh.x += (sh.tx - sh.x) * Math.min(1, dt * 14);
    sh.y += (sh.ty - sh.y) * Math.min(1, dt * 14);
    sh.tilt = clamp((sh.x - px) / dt / 900, -0.45, 0.45);

    // Fire while Space or the mouse button (or a finger on touch screens) is held down
    this.fireT -= dt;
    const trigger = s.input.isDown('action') || s.input.pointer.down;
    if (trigger && this.fireT <= 0) {
      this.hasFired = true;
      this.fireT = this.rapidT > 0 ? 0.09 : 0.2;
      const shots = this.spreadT > 0 ? [-0.22, 0, 0.22] : [0];
      for (const a of shots) this.bullets.push({ x: sh.x + Math.sin(a) * 6, y: sh.y - 20, vx: Math.sin(a) * 720, vy: -Math.cos(a) * 720 });
      s.sound.tone({ freq: 1400, to: 500, dur: 0.06, type: 'square', vol: 0.03 });
    }
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    this.bullets = this.bullets.filter((b) => b.y > -20 && b.x > -20 && b.x < W + 20 && !b.hit);

    // Spawning
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.bonus) { this.spawnT = 0.12; this.spawnGem(); if (s.rng.chance(0.07)) this.addRock(s.rng.range(40, W - 40), -40, 2, 'shock', 0, 150); }
      else { this.spawnT = Math.max(0.28, 1.15 / this.speedK); this.spawnRock(); }
    }
    if (!this.bonus && L >= 6) {
      this.cometT -= dt;
      if (this.cometT <= 0) {
        this.cometT = Math.max(2.5, 7 - L * 0.25);
        const fromLeft = s.rng.chance(0.5);
        this.rocks.push({ x: fromLeft ? -20 : W + 20, y: s.rng.range(40, 260), vx: (fromLeft ? 1 : -1) * 330 * this.speedK, vy: 170 * this.speedK, size: 1, type: 'comet', r: 11, hp: 1, rot: 0, vr: 0, hue: 190, flash: 0, shape: [], craters: [], trail: [] });
      }
    }
    if (!this.bonus && L >= 7 && !this.ufo) {
      this.ufoT -= dt;
      if (this.ufoT <= 0) {
        const fromLeft = s.rng.chance(0.5);
        this.ufo = { x: fromLeft ? -40 : W + 40, y: 110 + s.rng.range(0, 60), vx: (fromLeft ? 1 : -1) * 90, hp: 5, shootT: 1.2, flash: 0 };
      }
    }

    // Rocks
    for (const k of this.rocks) {
      k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.vr * dt; k.flash = Math.max(0, k.flash - dt * 5);
      if (k.type !== 'comet' && (k.x < k.r || k.x > W - k.r)) { k.vx = Math.abs(k.vx) * (k.x < k.r ? 1 : -1); }
      if (k.trail) { k.trail.push([k.x, k.y]); if (k.trail.length > 14) k.trail.shift(); }
      // bullets
      for (const b of this.bullets) {
        if (b.hit || k.dead) continue;
        if ((b.x - k.x) ** 2 + (b.y - k.y) ** 2 < (k.r + 3) ** 2) { b.hit = true; this.hitRock(k); }
      }
      // ship
      if (!k.dead && (k.x - sh.x) ** 2 + (k.y - sh.y) ** 2 < (k.r * 0.82 + SHIP_R) ** 2) {
        if (k.type === 'gem') this.kill(k);
        else if (!this.bonus && !this.invuln) { if (this.crash(k)) return; }
      }
      if (k.y > H + 60 || k.x < -80 || k.x > W + 80) { k.dead = true; if (k.type !== 'comet' && k.type !== 'gem') s.resetCombo(); }
    }
    this.rocks = this.rocks.filter((k) => !k.dead);

    // Shockwaves + chain reactions
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < 0.5);
    for (const p of this.pending) p.t -= dt;
    const go = this.pending.filter((p) => p.t <= 0);
    this.pending = this.pending.filter((p) => p.t > 0);
    go.forEach((p) => this.shockwave(p.x, p.y, p.depth));

    // UFO
    if (this.ufo) {
      const u = this.ufo;
      u.x += u.vx * dt; u.flash = Math.max(0, u.flash - dt * 5);
      u.shootT -= dt;
      if (u.shootT <= 0 && u.x > 20 && u.x < W - 20) {
        u.shootT = Math.max(0.8, 1.6 - L * 0.04);
        const a = Math.atan2(sh.y - u.y, sh.x - u.x);
        this.enemyShots.push({ x: u.x, y: u.y + 10, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230 });
        s.sound.tone({ freq: 300, to: 900, dur: 0.12, type: 'sawtooth', vol: 0.06 });
      }
      for (const b of this.bullets) {
        if (!b.hit && Math.abs(b.x - u.x) < 30 && Math.abs(b.y - u.y) < 16) { b.hit = true; this.hitUfo(); if (!this.ufo) break; }
      }
      if (this.ufo && (u.x < -60 || u.x > W + 60)) { this.ufo = null; this.ufoT = 9; }
    }
    for (const e of this.enemyShots) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (!this.invuln && !e.gone && (e.x - sh.x) ** 2 + (e.y - sh.y) ** 2 < (SHIP_R + 5) ** 2) { e.gone = true; if (this.crash(e)) return; }
    }
    this.enemyShots = this.enemyShots.filter((e) => !e.gone && e.y < H + 20 && e.y > -20 && e.x > -20 && e.x < W + 20);

    // Power-ups
    for (const c of this.caps) {
      c.y += 130 * dt;
      if ((c.x - sh.x) ** 2 + (c.y - sh.y) ** 2 < 30 ** 2) { c.got = true; this.power(c.type); }
    }
    this.caps = this.caps.filter((c) => !c.got && c.y < H + 20);

    // Engine exhaust
    if (Math.random() < 0.7) s.fx.burst(sh.x + (Math.random() - 0.5) * 6, sh.y + 18, { colors: ['#fb923c', '#fde047', '#f472b6'], count: 1, speed: 90, life: 0.35, size: 3, angle: Math.PI / 2, spread: 0.5 });
  }

  hitRock(k) {
    const s = this.s;
    k.hp--; k.flash = 1;
    if (k.hp > 0) { s.sound.play('brick', 0); s.fx.burst(k.x, k.y, { color: `hsl(${k.hue} 80% 70%)`, count: 4, speed: 80, life: 0.25 }); return; }
    this.kill(k);
  }

  /** Destroy a rock (by bullet or shockwave). */
  kill(k, fromShock = false, depth = 0) {
    const s = this.s, L = this.level;
    if (k.dead) return;
    k.dead = true;
    const color = k.type === 'shock' ? '#fde047' : k.type === 'comet' ? '#67e8f9' : `hsl(${k.hue} 90% 65%)`;

    if (k.type === 'gem') {
      this.gemsGot++;
      s.award(20 * L, k.x, k.y - 14, { chain: true, color, size: 16 });
      s.sound.play('gem', this.gemsGot);
      s.fx.burst(k.x, k.y, { colors: [color, '#fff'], count: 10, speed: 160, life: 0.4 });
      return;
    }
    const base = k.type === 'comet' ? 50 : k.type === 'shock' ? 40 : { 3: 30, 2: 20, 1: 10 }[k.size];
    s.award(base * L, k.x, k.y - k.r, { chain: true, color, size: fromShock ? 14 : 18 });
    if (!this.bonus) {
      this.kills++;
      if (fromShock) this.shockKills++;
    }
    s.sound.play('brick', Math.min(16, s.comboCount));
    s.sound.noise({ dur: 0.18, vol: 0.18, freq: 1600, to: 200 });
    s.fx.burst(k.x, k.y, { colors: [color, '#fff', `hsl(${(k.hue + 40) % 360} 90% 60%)`], count: 10 + k.size * 8, speed: 140 + k.size * 50, life: 0.6 });

    // Big rocks split
    if (k.type === 'rock' && k.size > 1 && L >= 4 && !fromShock) {
      for (const dir of [-1, 1]) this.addRock(k.x + dir * 8, k.y, k.size - 1, 'rock', dir * 90 + k.vx * 0.5, Math.max(60, k.vy * 0.9));
    }
    // Power-up drop
    if (k.size === 3 || (L >= 3 && k.size === 2 && s.rng.chance(0.3))) {
      if (L >= 3 && !this.bonus && s.rng.chance(k.size === 3 ? 0.3 : 0.15)) this.caps.push({ x: k.x, y: k.y, type: s.rng.pick(['spread', 'rapid', 'shield']) });
    }
    // ⚡ SHOCK asteroid: bang + flash + shockwave
    if (k.type === 'shock') this.shockwave(k.x, k.y, depth);

    if (!this.bonus && this.kills >= this.need) s.completeLevel();
  }

  shockwave(x, y, depth = 0) {
    const s = this.s;
    s.unlock('shock');
    // the bang
    s.sound.play('boom');
    s.sound.tone({ freq: 2400, to: 80, dur: 0.35, type: 'sawtooth', vol: 0.14 });
    s.sound.noise({ dur: 0.08, vol: 0.5, freq: 8000, type: 'highpass' });
    // the flash
    s.fx.flash(depth ? '#fef9c3' : '#ffffff', depth ? 0.35 : 0.7);
    s.fx.shake(14 + depth * 2, 0.4);
    s.fx.ring(x, y, { color: '#fde047', radius: SHOCK_RADIUS, life: 0.5, width: 8 });
    s.fx.ring(x, y, { color: '#f472b6', radius: SHOCK_RADIUS * 0.7, life: 0.4, width: 4 });
    s.fx.burst(x, y, { colors: ['#fff', '#fde047', '#fb923c', '#f472b6', '#22d3ee'], count: 70, speed: 460, life: 0.8, size: 4 });
    s.fx.text(x, y - 30, depth ? 'CHAIN!' : 'SHOCK!', { color: '#fde047', size: 30, life: 0.9 });
    this.waves.push({ x, y, t: 0 });
    // blast everything nearby
    if (depth === 0) this.shockKills = 0;
    for (const k of this.rocks) {
      if (k.dead || k.type === 'gem') continue;
      if ((k.x - x) ** 2 + (k.y - y) ** 2 > SHOCK_RADIUS ** 2) continue;
      if (k.type === 'shock') { k.dead = true; this.kills += this.bonus ? 0 : 1; s.award(40 * this.level, k.x, k.y, { chain: true, color: '#fde047' }); this.pending.push({ x: k.x, y: k.y, t: 0.14, depth: depth + 1 }); }
      else this.kill(k, true, depth);
    }
    if (this.ufo && (this.ufo.x - x) ** 2 + (this.ufo.y - y) ** 2 < SHOCK_RADIUS ** 2) this.destroyUfo();
    this.enemyShots = this.enemyShots.filter((e) => (e.x - x) ** 2 + (e.y - y) ** 2 > SHOCK_RADIUS ** 2);
    if (this.shockKills >= 5) s.unlock('shock5');
    if (!this.bonus && this.kills >= this.need) s.completeLevel();
  }

  hitUfo() {
    const u = this.ufo; u.hp--; u.flash = 1;
    this.s.sound.play('metal');
    if (u.hp <= 0) this.destroyUfo();
  }
  destroyUfo() {
    const s = this.s, u = this.ufo; if (!u) return;
    this.ufo = null; this.ufoT = 10;
    s.award(200 * this.level, u.x, u.y - 20, { chain: true, color: '#4ade80', size: 26 });
    s.sound.play('boom'); s.fx.shake(8, 0.3);
    s.fx.burst(u.x, u.y, { colors: ['#4ade80', '#a3e635', '#fff'], count: 50, speed: 320, life: 0.8 });
    s.unlock('ufo');
  }

  power(type) {
    const s = this.s, sh = this.ship;
    s.sound.play('powerup');
    s.fx.text(sh.x, sh.y - 40, POWERS[type].name + '!', { color: POWERS[type].color, size: 18 });
    s.fx.ring(sh.x, sh.y, { color: POWERS[type].color, radius: 50 });
    if (type === 'spread') this.spreadT = 10;
    if (type === 'rapid') this.rapidT = 10;
    if (type === 'shield') this.shield = true;
  }

  /** Returns true if the game should stop updating this frame. */
  crash(obj) {
    const s = this.s, sh = this.ship;
    if (this.shield) {
      this.shield = false; this.invuln = 1.2;
      if (obj.r) obj.dead = true;
      s.sound.play('metal'); s.fx.ring(sh.x, sh.y, { color: '#4ade80', radius: 60, width: 5 });
      s.fx.burst(sh.x, sh.y, { colors: ['#4ade80', '#fff'], count: 24, speed: 220 });
      return false;
    }
    s.fx.burst(sh.x, sh.y, { colors: ['#f472b6', '#22d3ee', '#fde047', '#fff'], count: 60, speed: 320, life: 0.9 });
    s.fx.ring(sh.x, sh.y, { color: '#f472b6', radius: 80 });
    if (s.lives <= 1) this.dead = true;
    s.hurt();
    return true;
  }
  onLifeLost() {
    // clear the area around the ship and give a moment of safety
    this.rocks = this.rocks.filter((k) => (k.x - this.ship.x) ** 2 + (k.y - this.ship.y) ** 2 > 200 ** 2);
    this.enemyShots = [];
    this.invuln = 2.2;
    this.spreadT = this.rapidT = 0;
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const t = this.t;
    // Space
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#2e1065'); g.addColorStop(1, '#0c0a2a'); }
    else { g.addColorStop(0, '#050816'); g.addColorStop(1, '#0b1033'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebulas) {
      const y = ((n.y + t * 8) % (H + 400)) - 200;
      const ng = ctx.createRadialGradient(n.x, y, 0, n.x, y, n.r);
      ng.addColorStop(0, `hsla(${this.bonus ? (n.hue + t * 40) % 360 : n.hue}, 90%, 50%, .16)`); ng.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = ng; ctx.fillRect(n.x - n.r, y - n.r, n.r * 2, n.r * 2);
    }
    ctx.restore();
    for (const st of this.stars) {
      const y = (st.y + t * (20 + st.z * 110) * (this.s.state === 'playing' ? 1 : 0.3)) % H;
      ctx.globalAlpha = 0.3 + st.z * 0.7; ctx.fillStyle = st.z > 0.85 ? '#bae6fd' : '#fff';
      ctx.fillRect(st.x, y, 1 + st.z * 1.5, 1 + st.z * 1.5 + (st.z > 0.7 ? st.z * 3 : 0));
    }
    ctx.globalAlpha = 1;

    // Shockwave distortion rings
    for (const w of this.waves) {
      const k = w.t / 0.5;
      ctx.save(); ctx.globalAlpha = (1 - k) * 0.5;
      const rg = ctx.createRadialGradient(w.x, w.y, SHOCK_RADIUS * k * 0.6, w.x, w.y, SHOCK_RADIUS * k + 1);
      rg.addColorStop(0, 'rgba(253,224,71,0)'); rg.addColorStop(0.8, 'rgba(253,224,71,.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(w.x, w.y, SHOCK_RADIUS * k + 1, 0, 7); ctx.fill(); ctx.restore();
    }

    // Rocks
    for (const k of this.rocks) this.drawRock(ctx, k, t);

    // Power-up capsules
    for (const c of this.caps) {
      const pw = POWERS[c.type];
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.sin(t * 4) * 0.2);
      ctx.shadowColor = pw.color; ctx.shadowBlur = 16; ctx.fillStyle = pw.color;
      roundRect(ctx, -16, -16, 32, 32, 9); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#0b0b1a'; ctx.font = '800 17px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pw.label, 0, 1); ctx.restore();
    }

    // UFO
    if (this.ufo) {
      const u = this.ufo;
      ctx.save(); ctx.translate(u.x, u.y);
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 18;
      ctx.fillStyle = u.flash ? '#fff' : '#94a3b8'; ctx.beginPath(); ctx.ellipse(0, 4, 30, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(134,239,172,.8)'; ctx.beginPath(); ctx.ellipse(0, -3, 14, 11, 0, Math.PI, 0); ctx.fill();
      ctx.shadowBlur = 0;
      for (let i = -2; i <= 2; i++) { ctx.fillStyle = Math.floor(t * 8 + i) % 2 ? '#fde047' : '#f472b6'; ctx.beginPath(); ctx.arc(i * 11, 6, 2.5, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    for (const e of this.enemyShots) {
      ctx.save(); ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12; ctx.fillStyle = '#fda4af';
      ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, 7); ctx.fill(); ctx.restore();
    }

    // Bullets
    ctx.save(); ctx.shadowColor = this.rapidT > 0 ? '#22d3ee' : '#f0abfc'; ctx.shadowBlur = 10;
    ctx.strokeStyle = this.spreadT > 0 ? '#c4b5fd' : this.rapidT > 0 ? '#a5f3fc' : '#f5d0fe'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of this.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018); }
    ctx.stroke(); ctx.restore();

    this.drawShip(ctx, t);

    // Reminder until the player fires for the first time this level
    if (!this.hasFired && this.s.state === 'playing') {
      ctx.save(); ctx.globalAlpha = 0.65 + Math.sin(t * 6) * 0.3;
      ctx.font = '800 20px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.fillStyle = '#fde047';
      const msg = matchMedia('(pointer: coarse)').matches ? 'Touch & hold to fire' : 'Hold SPACE or mouse button to fire';
      ctx.strokeText(msg, W / 2, H * 0.62); ctx.fillText(msg, W / 2, H * 0.62);
      ctx.restore();
    }

    // HUD strip
    ctx.fillStyle = 'rgba(5,8,22,.75)'; ctx.fillRect(0, 0, W, 44);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, this.s.bonusLeft / 15, '#a855f7', `★ CRYSTAL STORM · ${this.gemsGot} crystals · ${Math.ceil(this.s.bonusLeft)}s`);
    else progressBar(ctx, 14, 12, W - 28, 20, this.kills / this.need, '#f472b6', `Asteroids ${Math.min(this.kills, this.need)} / ${this.need}`);
    let px = 14;
    for (const [k, v] of [['spread', this.spreadT], ['rapid', this.rapidT]]) {
      if (v <= 0) continue;
      progressBar(ctx, px, H - 18, 70, 10, v / 10, POWERS[k].color); px += 80;
    }
  }

  drawRock(ctx, k, t) {
    ctx.save(); ctx.translate(k.x, k.y);
    if (k.type === 'gem') {
      ctx.rotate(k.rot);
      ctx.shadowColor = `hsl(${k.hue} 95% 60%)`; ctx.shadowBlur = 16;
      ctx.fillStyle = `hsl(${k.hue} 95% 65%)`;
      ctx.beginPath(); ctx.moveTo(0, -k.r); ctx.lineTo(k.r * 0.7, 0); ctx.lineTo(0, k.r); ctx.lineTo(-k.r * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(0, -k.r); ctx.lineTo(k.r * 0.7, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    if (k.type === 'comet') {
      ctx.restore();
      ctx.save(); ctx.lineCap = 'round';
      k.trail.forEach(([x, y], i) => { ctx.globalAlpha = i / k.trail.length * 0.6; ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = i * 0.8; if (i) { ctx.beginPath(); ctx.moveTo(k.trail[i - 1][0], k.trail[i - 1][1]); ctx.lineTo(x, y); ctx.stroke(); } });
      ctx.globalAlpha = 1; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 20; ctx.fillStyle = '#ecfeff';
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, 7); ctx.fill(); ctx.restore(); return;
    }
    ctx.rotate(k.rot);
    const shock = k.type === 'shock';
    const pulse = shock ? 0.5 + Math.sin(t * 9 + k.hue) * 0.5 : 0;
    if (shock) { ctx.shadowColor = '#fde047'; ctx.shadowBlur = 18 + pulse * 18; }
    // body
    const bg = ctx.createRadialGradient(-k.r * 0.3, -k.r * 0.3, 2, 0, 0, k.r);
    if (shock) { bg.addColorStop(0, '#fef08a'); bg.addColorStop(0.5, '#f97316'); bg.addColorStop(1, '#7c2d12'); }
    else { bg.addColorStop(0, `hsl(${k.hue} 60% 62%)`); bg.addColorStop(1, `hsl(${k.hue} 55% 26%)`); }
    ctx.fillStyle = k.flash ? '#fff' : bg;
    ctx.beginPath();
    k.shape.forEach((m, i) => { const a = i / k.shape.length * Math.PI * 2; ctx.lineTo(Math.cos(a) * k.r * m, Math.sin(a) * k.r * m); });
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shock ? '#fde047' : `hsl(${k.hue} 80% 72%)`; ctx.lineWidth = 2; ctx.stroke();
    // craters
    for (const c of k.craters) {
      ctx.fillStyle = shock ? 'rgba(124,45,18,.5)' : `hsla(${k.hue} 50% 15% / .45)`;
      ctx.beginPath(); ctx.arc(Math.cos(c.a) * k.r * c.d, Math.sin(c.a) * k.r * c.d, k.r * c.s, 0, 7); ctx.fill();
    }
    // glowing cracks + lightning on shock rocks
    if (shock) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-k.r * 0.6, -k.r * 0.2); ctx.lineTo(-k.r * 0.1, k.r * 0.1); ctx.lineTo(0, -k.r * 0.4); ctx.lineTo(k.r * 0.5, k.r * 0.2); ctx.stroke();
      ctx.rotate(-k.rot);
      ctx.font = `800 ${k.r * 0.9}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText('⚡', 0, 2);
      if (Math.random() < 0.25) {
        ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 1.5; ctx.beginPath();
        const a = Math.random() * 6.28; let x = Math.cos(a) * k.r, y = Math.sin(a) * k.r; ctx.moveTo(x, y);
        for (let i = 0; i < 3; i++) { x += Math.cos(a) * 7 + (Math.random() - 0.5) * 10; y += Math.sin(a) * 7 + (Math.random() - 0.5) * 10; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawShip(ctx, t) {
    const sh = this.ship;
    if (this.invuln && Math.floor(t * 14) % 2) return;
    if (this.dead) return;
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.tilt);
    if (this.shield) {
      ctx.save(); ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3; ctx.globalAlpha = 0.55 + Math.sin(t * 8) * 0.3;
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.stroke(); ctx.restore();
    }
    // flame
    const f = 10 + Math.sin(t * 50) * 4;
    const fg = ctx.createLinearGradient(0, 12, 0, 16 + f);
    fg.addColorStop(0, '#fde047'); fg.addColorStop(1, 'rgba(244,114,182,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(0, 16 + f); ctx.lineTo(6, 12); ctx.fill();
    // wings
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-20, 14); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(20, 14); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
    // body
    const bg = ctx.createLinearGradient(-8, 0, 8, 0);
    bg.addColorStop(0, '#22d3ee'); bg.addColorStop(0.5, '#e0f2fe'); bg.addColorStop(1, '#f472b6');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.quadraticCurveTo(10, -2, 8, 14); ctx.lineTo(-8, 14); ctx.quadraticCurveTo(-10, -2, 0, -22); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b1033'; ctx.beginPath(); ctx.ellipse(0, -6, 3.5, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-1, -8, 1.2, 3, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
}

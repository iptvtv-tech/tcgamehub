// ─────────────────────────────────────────────────────────────
//  TOWER TOPPLE — game 9 (Zone 2 · Expert)
//  A crane swings each new floor over your tower. Tap to drop it.
//  Land it off-centre and the tower starts to lean and sway… lean too far
//  and the top of the tower TOPPLES. Real balance: the weight of every floor
//  above must sit over the floor below it.
//
//  L1 learn it · L3 WIND pushes falling floors · L4 floors come in different widths
//  L6 the crane bobs up and down · L8 EARTHQUAKE: the ground sways · L10 heavy steel floors
//  Every 5th level: ★ GOLDEN RUSH — stack golden floors for 15 s, nothing can topple
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'tower-topple';
const W = 480, H = 720;
const BH = 40;                 // floor height
const GY = 640;                // ground (world y)
const HOOK_Y = 120;            // crane hook (screen y)
const BASE_W = 150;
const PALETTE = ['#f472b6', '#22d3ee', '#a3e635', '#fbbf24', '#a78bfa', '#fb923c', '#34d399', '#60a5fa'];

const goalFor = (level) => Math.min(30, 8 + (level - 1) * 2);

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 0,
  comboStep: 3,
  maxMultiplier: 5,
  bonusTime: 15,
  music: { bpm: 112, style: 'major', lead: 'triangle', arp: [0, 2, 4, 2, 1, 2, 3, 2], oct: [12, 12, 12, 12, 12, 12, 12, 12] },
  levelInfo(level, bonus) {
    if (bonus) return '★ GOLDEN RUSH! Stack as many golden floors as you can in 15 seconds — nothing topples.';
    const notes = {
      1: `Tap / click / SPACE to drop. Build ${goalFor(1)} floors. Off-centre floors make the tower lean — too far and it TOPPLES!`,
      2: 'PERFECT drops (dead centre) chain your combo.',
      3: '💨 WIND! Watch the arrow — it pushes floors as they fall.',
      4: 'Floors now come in different widths.',
      6: 'The crane bobs up and down. Time it right!',
      8: '🌋 EARTHQUAKE: the ground sways the whole tower.',
      10: '🏗️ Heavy steel floors weigh double — balance matters even more.',
    };
    return notes[level] || `Build ${goalFor(level)} floors — windier and faster!`;
  },
  create: (shell) => new TowerTopple(shell),
});

class TowerTopple {
  constructor(s) {
    this.s = s; this.t = 0;
    this.clouds = Array.from({ length: 7 }, () => ({ x: Math.random() * W, y: Math.random() * 2000, w: 60 + Math.random() * 90, v: 6 + Math.random() * 14 }));
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * 1400, r: Math.random() * 1.4 + 0.3 }));
    this.skyline = Array.from({ length: 14 }, (_, i) => ({ x: i * 36 - 10, w: 30 + Math.random() * 14, h: 40 + Math.random() * 90 }));
    this.startLevel(1, false);
  }

  reset() { this.perfectRun = 0; }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.goal = bonus ? 999 : goalFor(level);
    this.floors = [];
    this.debris = [];
    this.camY = 0;
    this.swing = { ph: 0, speed: Math.min(3.1, 1.55 * s.speed(0.05)), amp: 150 };
    this.quake = level >= 8 && !bonus ? Math.min(14, 5 + (level - 8) * 1.2) : 0;
    this.livesAtStart = s.lives;
    this.rushCount = 0; this.perfectRun = 0; this.windLanded = 0;
    this.nextBlock();
  }

  // ── Blocks ─────────────────────────────────────────────────
  nextBlock() {
    const r = this.s.rng, L = this.level;
    let w = 120;
    if (this.bonus) w = 150;
    else if (L >= 4) w = r.pick(L >= 10 ? [70, 90, 110, 130] : [90, 105, 120, 135]);
    const heavy = !this.bonus && L >= 10 && r.chance(0.3);
    this.wind = !this.bonus && L >= 3 ? r.range(-1, 1) * Math.min(150, 50 + (L - 3) * 10) : 0;
    this.hang = { w, heavy, color: heavy ? '#94a3b8' : PALETTE[this.floors.length % PALETTE.length] };
    this.fall = null;
  }

  /** Sideways sway of the tower at floor i (screen x offset). */
  sway(i) {
    const n = Math.max(1, this.floors.length);
    const lean = Math.abs(this.com(0) - W / 2);
    const amp = clamp(lean * 0.35 + n * 0.25, 0, 38) + this.quake;
    return amp * Math.sin(this.t * 1.7) * ((i + 1) / (n + 1)) + (this.quake ? this.quake * 0.6 * Math.sin(this.t * 5.3) : 0);
  }

  /** Centre of mass of floors i..top (tower frame). */
  com(i) {
    let m = 0, mx = 0;
    for (let k = i; k < this.floors.length; k++) { const f = this.floors[k], wt = f.w * (f.heavy ? 2 : 1); m += wt; mx += wt * f.x; }
    return m ? mx / m : W / 2;
  }

  topY() { return GY - BH * this.floors.length; }          // world y of the top surface

  // ── Input ──────────────────────────────────────────────────
  onAction(a) { if (a === 'action' || a === 'press' || a === 'down') this.drop(); }

  drop() {
    if (!this.hang || this.fall) return;
    const x = this.hookX();
    this.fall = { x, y: this.hookY() + 14 + BH / 2 + this.camY, vy: 0, vx: 0, ...this.hang };
    this.hang = null;
    this.s.sound.tone({ freq: 500, to: 200, dur: 0.15, type: 'triangle', vol: 0.06 });
  }

  hookX() { return W / 2 + Math.sin(this.swing.ph) * this.swing.amp; }
  hookY() { return HOOK_Y + (this.level >= 6 && !this.bonus ? Math.sin(this.swing.ph * 2) * 26 : 0); }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; this.swing.ph += dt * 0.8; this.animate(dt); }

  animate(dt) {
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > W + 100) c.x = -140; }
    for (const d of this.debris) { d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; }
    this.debris = this.debris.filter((d) => d.y < this.camY + H + 200);
    // camera follows the top of the tower
    const want = Math.min(0, this.topY() - 380);
    this.camY += (want - this.camY) * Math.min(1, dt * 3);
  }

  update(dt) {
    const s = this.s;
    this.t += dt;
    this.swing.ph += dt * this.swing.speed;
    this.animate(dt);

    const f = this.fall;
    if (!f) return;
    f.vy += 1500 * dt;
    f.vx += (this.wind - f.vx) * Math.min(1, dt * 2.5);
    f.y += f.vy * dt; f.x += f.vx * dt;
    const surface = this.topY() - BH / 2;                    // world y where the block's centre rests
    if (f.y < surface) return;

    // Landed on the top floor (or the foundation)
    const n = this.floors.length;
    const below = n ? this.floors[n - 1] : { x: W / 2, w: BASE_W };
    const belowX = below.x + (n ? this.sway(n - 1) : 0);
    const off = f.x - belowX;
    const reach = (f.w + below.w) / 2;
    this.fall = null;

    if (Math.abs(off) >= reach - 3 || (!this.bonus && Math.abs(off) > below.w / 2)) {
      // missed completely, or its middle hangs over the edge → it tips off
      this.debris.push({ x: f.x, y: surface, w: f.w, color: f.color, vx: Math.sign(off || 1) * 120, vy: -80, rot: 0, vr: Math.sign(off || 1) * 4 });
      s.sound.play('hit'); s.fx.shake(5, 0.25);
      s.fx.text(f.x, surface - this.camY - 30, Math.abs(off) >= reach - 3 ? 'MISSED!' : 'TIPPED OFF!', { color: '#f87171', size: 24 });
      s.resetCombo(); this.perfectRun = 0;
      if (this.bonus) { this.nextBlock(); return; }
      this.nextBlock();
      s.hurt();
      return;
    }

    const perfect = Math.abs(off) <= 5 || (this.bonus && Math.abs(off) <= 14);
    const x = (perfect ? belowX : f.x) - this.sway(n);        // store in tower frame
    this.floors.push({ x, w: f.w, heavy: f.heavy, color: this.bonus || s.gold ? '#fbbf24' : f.color, lit: Math.random() });
    const sx = f.x, sy = surface - this.camY;
    const L = this.level;
    s.sound.play('brick', Math.min(12, s.comboCount));
    s.sound.noise({ dur: 0.12, vol: 0.12, freq: 600, to: 120 });
    s.fx.burst(sx, sy + BH / 2, { colors: ['#e2e8f0', '#94a3b8'], count: 10, speed: 120, life: 0.4, angle: -Math.PI / 2, spread: 2.4 });
    if (perfect) {
      this.perfectRun++;
      s.award((this.bonus ? 20 : 25) * L, sx, sy - 10, { chain: true, color: '#fde047', size: 22 });
      s.fx.text(sx, sy - 40, this.perfectRun >= 3 ? `PERFECT ×${this.perfectRun}` : 'PERFECT!', { color: '#fde047', size: 20 });
      s.fx.ring(sx, sy + BH / 2, { color: '#fde047', radius: f.w * 0.6 });
      s.sound.play('coin');
      if (this.perfectRun >= 5) s.unlock('perfect5');
    } else {
      this.perfectRun = 0;
      s.resetCombo();
      s.award(10 * L, sx, sy - 10, { color: '#e2e8f0', size: 16 });
    }
    if (this.wind && Math.abs(this.wind) > 60) { this.windLanded = (this.windLanded || 0) + 1; if (this.windLanded >= 10) s.unlock('windy'); }
    if (this.bonus) { this.rushCount++; if (this.rushCount >= 12) s.unlock('rush'); }
    if (this.floors.length >= 25) s.unlock('tall');

    // Balance check: every group of floors must sit over the floor below it
    if (!this.bonus) {
      for (let i = this.floors.length - 1; i >= 0; i--) {
        const sup = i ? this.floors[i - 1] : { x: W / 2, w: BASE_W };
        const c = this.com(i);
        if (Math.abs(c - sup.x) > sup.w / 2) { this.topple(i, Math.sign(c - sup.x)); return; }
      }
    }

    if (this.floors.length >= this.goal) { this.levelDone(); return; }
    this.nextBlock();
  }

  topple(i, dir) {
    const s = this.s;
    const falling = this.floors.splice(i);
    falling.forEach((f, k) => {
      const wy = GY - BH * (i + k) - BH / 2;
      this.debris.push({ x: f.x + this.sway(i + k), y: wy, w: f.w, color: f.color, heavy: f.heavy, vx: dir * (80 + k * 40), vy: -60 - k * 10, rot: 0, vr: dir * (1.5 + k * 0.4) });
    });
    s.sound.play('boom'); s.sound.noise({ dur: 0.9, vol: 0.25, freq: 900, to: 60 });
    s.fx.shake(12, 0.6);
    s.fx.text(W / 2, H * 0.4, 'TIMBER!', { color: '#f87171', size: 40, life: 1.4 });
    s.resetCombo(); this.perfectRun = 0;
    this.nextBlock();
    s.hurt();
  }

  levelDone() {
    const s = this.s;
    s.fx.text(W / 2, H * 0.3, 'TOPPED OUT!', { color: '#4ade80', size: 36, life: 1.4, rise: 10 });
    s.fx.confetti?.(W, H);
    if (s.lives === this.livesAtStart && this.level >= 3) s.unlock('nomiss');
    s.completeLevel();
  }

  onLifeLost() { this.fall = null; if (!this.hang) this.nextBlock(); }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t, cam = this.camY;
    const alt = clamp(-cam / 1400, 0, 1);                      // 0 at the ground → 1 high in the sky
    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const topC = this.bonus ? [60, 30, 90] : mix([56, 189, 248], [10, 8, 40], alt);
    const botC = this.bonus ? [251, 146, 60] : mix([186, 230, 253], [49, 46, 129], alt);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${topC})`); g.addColorStop(1, `rgb(${botC})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stars appear higher up
    if (alt > 0.3) {
      ctx.fillStyle = '#fff';
      for (const st of this.stars) { const y = (st.y + cam * 0.2) % 1400; if (y < H) { ctx.globalAlpha = (alt - 0.3) * 1.4; ctx.fillRect(st.x, y, st.r, st.r); } }
      ctx.globalAlpha = 1;
    }
    // clouds (parallax)
    for (const c of this.clouds) {
      const y = ((c.y - cam * 0.5) % 2000 + 2000) % 2000 - 300;
      if (y < -60 || y > H) continue;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.ellipse(c.x, y, c.w / 2, 14, 0, 0, Math.PI * 2); ctx.ellipse(c.x + c.w * 0.2, y - 10, c.w / 3, 14, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save(); ctx.translate(0, -cam);
    // city skyline + ground
    for (const b of this.skyline) { ctx.fillStyle = 'rgba(30,41,59,.55)'; ctx.fillRect(b.x, GY - b.h, b.w, b.h); }
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, GY, W, 400);
    ctx.fillStyle = '#334155'; ctx.fillRect(0, GY, W, 8);
    // foundation
    const q = this.quake ? this.quake * 0.6 * Math.sin(t * 5.3) : 0;
    ctx.fillStyle = '#475569'; roundRect(ctx, W / 2 - BASE_W / 2 + q, GY - 6, BASE_W, 16, 4); ctx.fill();

    // tower
    this.floors.forEach((f, i) => this.drawFloor(ctx, f.x + this.sway(i), GY - BH * i - BH / 2, f.w, f.color, f.heavy, i, f.lit));
    // debris
    for (const d of this.debris) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      this.drawFloor(ctx, 0, 0, d.w, d.color, d.heavy, 0, 0.5, true);
      ctx.restore();
    }
    // falling block
    if (this.fall) this.drawFloor(ctx, this.fall.x, this.fall.y, this.fall.w, this.bonus || s.gold ? '#fbbf24' : this.fall.color, this.fall.heavy, 0, 0.3);
    ctx.restore();

    // goal line
    if (!this.bonus) {
      const gy = GY - BH * this.goal - cam;
      if (gy > 50 && gy < H) {
        ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#4ade80'; ctx.font = '800 13px system-ui'; ctx.fillText('🏁 TOP', 8, gy - 6);
      }
    }

    // crane
    const hx = this.hookX(), hy = this.hookY();
    ctx.fillStyle = '#facc15'; ctx.fillRect(0, 56, W, 10);
    for (let x = 0; x < W; x += 24) { ctx.strokeStyle = '#a16207'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 56); ctx.lineTo(x + 12, 66); ctx.lineTo(x + 24, 56); ctx.stroke(); }
    ctx.fillStyle = '#334155'; ctx.fillRect(hx - 14, 62, 28, 10);
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, 70); ctx.lineTo(hx, hy); ctx.stroke();
    if (this.hang) {
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - this.hang.w / 2 + 6, hy + 14); ctx.moveTo(hx, hy); ctx.lineTo(hx + this.hang.w / 2 - 6, hy + 14); ctx.stroke();
      this.drawFloor(ctx, hx, hy + 14 + BH / 2, this.hang.w, this.bonus || s.gold ? '#fbbf24' : this.hang.color, this.hang.heavy, 0, 0.3);
      // drop guide
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
      ctx.fillRect(hx - this.hang.w / 2, hy + 14 + BH, this.hang.w, Math.max(0, this.topY() - cam - (hy + 14 + BH)));
      ctx.restore();
    }

    // wind arrow
    if (this.wind) {
      const k = this.wind / 150;
      ctx.save(); ctx.translate(W - 70, 100); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('WIND', 0, -14);
      ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      const len = 12 + Math.abs(k) * 36, d = Math.sign(k);
      ctx.beginPath(); ctx.moveTo(-len / 2 * d, 0); ctx.lineTo(len / 2 * d, 0); ctx.lineTo(len / 2 * d - 8 * d, -6); ctx.moveTo(len / 2 * d, 0); ctx.lineTo(len / 2 * d - 8 * d, 6); ctx.stroke();
      ctx.restore();
    }

    // HUD
    ctx.fillStyle = 'rgba(3,5,20,.7)'; ctx.fillRect(0, 0, W, 44);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ GOLDEN RUSH · ${this.rushCount} floors · ${Math.ceil(s.bonusLeft)}s`);
    else progressBar(ctx, 14, 12, W - 28, 20, this.floors.length / this.goal, '#4ade80', `Floors ${this.floors.length} / ${this.goal}`);
    if (!this.bonus && this.floors.length > 1) {
      // lean meter
      const lean = this.com(0) - W / 2;
      ctx.save(); ctx.translate(W / 2, H - 22);
      ctx.fillStyle = 'rgba(3,5,20,.6)'; roundRect(ctx, -90, -10, 180, 20, 10); ctx.fill();
      const k = clamp(lean / (BASE_W / 2), -1, 1);
      ctx.fillStyle = Math.abs(k) > 0.7 ? '#f87171' : Math.abs(k) > 0.4 ? '#fbbf24' : '#4ade80';
      ctx.beginPath(); ctx.arc(k * 80, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('LEAN', 0, 4);
      ctx.restore();
    }
  }

  drawFloor(ctx, x, y, w, color, heavy, i, lit, debris) {
    ctx.save();
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, shade(color, -0.25)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = g;
    roundRect(ctx, x - w / 2, y - BH / 2, w, BH, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - w / 2, y + BH / 2 - 5, w, 5);
    if (heavy) {
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
      ctx.beginPath(); for (let k = -w / 2 + 8; k < w / 2 - 8; k += 16) { ctx.moveTo(x + k, y - BH / 2 + 4); ctx.lineTo(x + k + 16, y + BH / 2 - 6); } ctx.stroke();
    } else {
      // windows
      const cols = Math.max(2, Math.floor(w / 22));
      for (let c = 0; c < cols; c++) {
        const wx = x - w / 2 + (c + 0.5) * (w / cols) - 5;
        const on = ((i * 7 + c * 3 + Math.floor(lit * 10)) % 5) > 1;
        ctx.fillStyle = on ? 'rgba(254,249,195,.9)' : 'rgba(15,23,42,.45)';
        ctx.fillRect(wx, y - 9, 10, 14);
      }
    }
    if (debris) { ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; roundRect(ctx, x - w / 2, y - BH / 2, w, BH, 4); ctx.stroke(); }
    ctx.restore();
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(clamp(v + (k < 0 ? v * k : (255 - v) * k), 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

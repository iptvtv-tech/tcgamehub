// ─────────────────────────────────────────────────────────────
//  SNAKE ESCAPE PUZZLE — game 7 (Zone 2 · Expert)
//  Snakes are knotted together in a square. Tap a snake and it slides out
//  head-first… but only if nothing is in its way. Tap a blocked snake and
//  it bonks into the one in front — that costs a life.
//
//  L1–3  learn it (5×5 → 6×6)          L4+  a countdown clock
//  L6+   rocks that never move          bigger, longer, tighter knots every level (up to 12×12)
//  Every 5th level: ★ STAMPEDE bonus — clear as many snakes as you can in 15 s, no lives lost
//
//  Every puzzle is built so it can always be solved: snakes are placed one at a
//  time and each new snake's escape path is clear of the snakes already there,
//  so removing them newest-first always works (players have to find that order).
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'snake-escape-puzzle';
const W = 480, H = 720;
const BOARD = 440, BX = (W - BOARD) / 2, BY = 112;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const ROCK = -2;
const COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#60a5fa', '#e879f9'];

// Level settings
function spec(level, bonus) {
  if (bonus) return { n: 7, fill: 0.72, maxLen: 4, rocks: 0, timed: false };
  const n = Math.min(12, 5 + Math.floor(level * 0.5));
  return {
    n,
    fill: Math.min(0.93, 0.62 + level * 0.025),
    maxLen: Math.min(10, 3 + Math.floor(level / 2)),
    rocks: level >= 6 ? 1 + Math.floor(n * n * 0.035) : 0,
    timed: level >= 4,
  };
}

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 2.2,
  comboStep: 3,
  maxMultiplier: 5,
  bonusTime: 15,
  music: { bpm: 104, style: 'dream', lead: 'sine', arp: [0, 2, 1, 3, 0, 2, 1, 4], oct: [12, 12, 12, 12, 12, 12, 12, 12] },
  levelInfo(level, bonus) {
    if (bonus) return '★ STAMPEDE! Free as many snakes as you can in 15 seconds — wrong taps don\'t cost lives here.';
    const notes = {
      1: 'Tap a snake to send it out HEAD-first. If another snake is in the way it bonks — and you lose a life!',
      2: 'Bigger knot. Look for the snakes with a clear path to the edge first.',
      3: 'Find the right order — some snakes only get free after others leave.',
      4: '⏱️ Beat the clock! Run out of time and you lose a life.',
      6: '🪨 Rocks never move — no snake can escape through one.',
      8: 'Longer snakes, tighter knots…',
      11: '10×10 — only the calmest heads get out of this one.',
    };
    return notes[level] || 'Bigger and tighter. Think before you tap!';
  },
  create: (shell) => new SnakeEscape(shell),
});

class SnakeEscape {
  constructor(s) {
    this.s = s; this.t = 0;
    this.hover = null; this.cursor = null;
    this.bgDots = Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.4, ph: Math.random() * 6 }));
    this.startLevel(1, false);
  }

  reset() { this.bonusCount = 0; }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.sp = spec(level, bonus);
    this.mistakes = 0; this.bonusCount = 0;
    this.build();
  }

  // ── Puzzle generator ───────────────────────────────────────
  build() {
    const r = this.s.rng, { n, fill, maxLen, rocks } = this.sp;
    let best = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const p = this.generate(n, fill, maxLen, rocks, r);
      if (!best || p.score > best.score) best = p;
      if (p.filled >= fill * 0.92 && p.locked >= p.snakes.length * 0.4) break;
    }
    this.n = best.n; this.cell = BOARD / best.n;
    this.occ = best.occ; this.snakes = best.snakes; this.rocks = best.rocks;
    this.total = this.snakes.length;
    this.timeMax = this.sp.timed ? Math.round((12 + this.total * 2.4) / this.s.speed(0.035)) : 0;
    this.timeLeft = this.timeMax;
    this.moving = [];
  }

  generate(n, fill, maxLen, rockCount, r) {
    const occ = Array.from({ length: n }, () => new Array(n).fill(-1));
    const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
    const rocks = [];
    for (let i = 0; i < rockCount * 4 && rocks.length < rockCount; i++) {
      const x = r.int(1, n - 2), y = r.int(1, n - 2);
      if (occ[y][x] === -1) { occ[y][x] = ROCK; rocks.push([x, y]); }
    }
    const snakes = [];
    let filled = rocks.length;
    const target = Math.floor(n * n * fill);
    const rayOf = new Map();                          // cell → how many placed snakes need it to escape
    // One candidate snake, or null. Its escape ray must be clear of everything already placed.
    const candidate = () => {
      const hx = r.int(0, n - 1), hy = r.int(0, n - 1);
      if (occ[hy][hx] !== -1) return null;
      const d = r.int(0, 3), [dx, dy] = DIRS[d];
      const ray = [];
      let x = hx + dx, y = hy + dy;
      while (inside(x, y)) { if (occ[y][x] !== -1) return null; ray.push(x + ',' + y); x += dx; y += dy; }
      const rayset = new Set(ray);
      const want = r.int(2, maxLen);
      const body = [[hx, hy]];
      const used = new Set([hx + ',' + hy]);
      for (let k = 1; k < want; k++) {
        const [tx, ty] = body[body.length - 1];
        const opts = DIRS.map(([ex, ey]) => [tx + ex, ty + ey]).filter(([ax, ay]) =>
          inside(ax, ay) && occ[ay][ax] === -1 && !used.has(ax + ',' + ay) && !rayset.has(ax + ',' + ay));
        if (!opts.length) break;
        // lean towards cells that sit in other snakes' escape paths (that's what makes a knot)
        opts.sort((p, q) => (rayOf.get(q[0] + ',' + q[1]) || 0) - (rayOf.get(p[0] + ',' + p[1]) || 0));
        const c = r.chance(0.6) ? opts[0] : r.pick(opts);
        body.push(c); used.add(c[0] + ',' + c[1]);
      }
      if (body.length < 2) return null;
      const blocks = body.reduce((a, [bx, by]) => a + (rayOf.get(bx + ',' + by) || 0), 0);
      return { body, d, ray, score: blocks * 2 + body.length };
    };
    for (let tries = 0; tries < 400 && filled < target; tries++) {
      let best = null;
      for (let k = 0; k < 14; k++) { const c = candidate(); if (c && (!best || c.score > best.score)) best = c; }
      if (!best) continue;
      const id = snakes.length;
      for (const [bx, by] of best.body) occ[by][bx] = id;
      for (const cell of best.ray) rayOf.set(cell, (rayOf.get(cell) || 0) + 1);
      snakes.push({ id, body: best.body, d: best.d, color: COLORS[id % COLORS.length], alive: true, bump: null, ph: r.range(0, 6) });
      filled += best.body.length;
    }
    // how many start blocked (a good puzzle has plenty)
    const tmp = { n, occ, snakes };
    const locked = snakes.filter((sn) => this.blockedAt(sn, tmp) >= 0).length;
    return { n, occ, snakes, rocks, filled: filled / (n * n), locked, score: filled + locked * 3 };
  }

  /** Distance to the first thing in a snake's way, or -1 if its path is clear. */
  blockedAt(sn, b = this) {
    const [dx, dy] = DIRS[sn.d];
    let [x, y] = sn.body[0], k = 0;
    for (;;) {
      x += dx; y += dy; k++;
      if (x < 0 || y < 0 || x >= b.n || y >= b.n) return -1;
      const o = b.occ[y][x];
      if (o !== -1 && o !== sn.id) return k;
    }
  }

  // ── Input ──────────────────────────────────────────────────
  cellAt(x, y) {
    const cx = Math.floor((x - BX) / this.cell), cy = Math.floor((y - BY) / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.n || cy >= this.n) return null;
    return [cx, cy];
  }
  snakeAt(c) {
    if (!c) return null;
    const o = this.occ[c[1]][c[0]];
    return o >= 0 ? this.snakes[o] : null;
  }
  onPointerMove(x, y) { this.hover = this.snakeAt(this.cellAt(x, y)); this.cursor = null; }
  onAction(a, x, y) {
    if (a === 'press') { this.tap(this.snakeAt(this.cellAt(x, y))); return; }
    // keyboard: move a cursor, Space/Enter taps
    const moves = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    if (moves[a]) {
      if (!this.cursor) this.cursor = [Math.floor(this.n / 2), Math.floor(this.n / 2)];
      this.cursor = [clamp(this.cursor[0] + moves[a][0], 0, this.n - 1), clamp(this.cursor[1] + moves[a][1], 0, this.n - 1)];
      this.hover = this.snakeAt(this.cursor);
    }
    if (a === 'action' && this.cursor) this.tap(this.snakeAt(this.cursor));
  }

  tap(sn) {
    const s = this.s;
    if (!sn || !sn.alive || sn.leaving || sn.bump || this.pendingHurt > 0) return;
    const k = this.blockedAt(sn);
    if (k < 0) this.escape(sn);
    else {
      // bonk! slide up to the blocker and back
      sn.bump = { t: 0, dist: k - 0.62 };
      s.sound.play('hit');
      s.fx.shake(5, 0.2);
      const [hx, hy] = sn.body[0], [dx, dy] = DIRS[sn.d];
      const bx = BX + (hx + dx * k + 0.5) * this.cell, by = BY + (hy + dy * k + 0.5) * this.cell;
      s.fx.burst(bx, by, { colors: ['#f87171', '#fff'], count: 16, speed: 160, life: 0.4 });
      s.resetCombo();
      if (this.bonus) { s.fx.text(bx, by - 20, 'Blocked!', { color: '#fca5a5', size: 16 }); return; }
      this.mistakes++;
      s.fx.text(bx, by - 20, 'BONK!', { color: '#f87171', size: 24 });
      this.pendingHurt = 0.35;             // lose the life once the bonk animation lands
    }
  }

  escape(sn) {
    const s = this.s, L = this.level;
    // build the slide path: tail → head, then straight on until the whole snake is off the board
    const [dx, dy] = DIRS[sn.d];
    const path = sn.body.slice().reverse();
    let [x, y] = sn.body[0];
    for (let i = 0; i < this.n + sn.body.length + 1; i++) { x += dx; y += dy; path.push([x, y]); }
    sn.leaving = { path, p: 0, v: 14 + sn.body.length };
    for (const [bx, by] of sn.body) this.occ[by][bx] = -1;
    this.moving.push(sn);
    const [hx, hy] = sn.body[0];
    const px = BX + (hx + 0.5) * this.cell, py = BY + (hy + 0.5) * this.cell;
    const base = this.bonus ? 5 : 5 + sn.body.length * 3;
    s.award(base * L, px, py - 14, { chain: true, color: this.color(sn), size: 18 });
    s.sound.play('eat', Math.min(12, s.comboCount));
    s.sound.tone({ freq: 300, to: 900, dur: 0.18, type: 'triangle', vol: 0.06 });
    if (this.bonus) this.bonusCount++;
  }

  color(sn) { return this.s.gold ? ['#fde047', '#fbbf24', '#f59e0b', '#fcd34d'][sn.id % 4] : sn.color; }

  onLifeLost() { this.pendingHurt = 0; for (const sn of this.snakes) sn.bump = null; }

  idle(dt) { this.t += dt; this.animate(dt); }

  animate(dt) {
    for (const sn of this.snakes) {
      if (sn.bump) { sn.bump.t += dt; if (sn.bump.t > 0.5) sn.bump = null; }
    }
    for (const sn of this.moving) {
      const lv = sn.leaving;
      lv.p += lv.v * dt; lv.v += 30 * dt;
      if (lv.p >= lv.path.length - sn.body.length) sn.alive = false;
    }
    this.moving = this.moving.filter((sn) => sn.alive);
  }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s, L = this.level;
    this.t += dt;
    this.animate(dt);

    if (this.pendingHurt > 0) {
      this.pendingHurt -= dt;
      if (this.pendingHurt <= 0) { s.sound.play('boom'); s.hurt(); return; }
    }

    // clock
    if (this.timeMax && !this.bonus) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 5 && Math.ceil(this.timeLeft) !== Math.ceil(this.timeLeft + dt)) s.sound.play('tick');
      if (this.timeLeft <= 0) {
        s.fx.text(W / 2, BY + BOARD / 2, 'TIME UP!', { color: '#f87171', size: 40, life: 1.4 });
        s.sound.play('boom');
        this.build();                     // a fresh knot for the next try
        s.hurt();
        return;
      }
    }

    // all snakes out?
    if (this.snakes.every((sn) => !sn.alive || sn.leaving) && !this.moving.length) {
      if (this.bonus) {
        // Stampede: a fresh herd straight away
        s.fx.text(W / 2, BY + BOARD / 2, 'NEXT HERD!', { color: '#fde047', size: 30 });
        s.sound.play('powerup');
        this.build();
        if (this.bonusCount >= 20) s.unlock('stampede');
        return;
      }
      this.clearLevel();
    }
  }

  clearLevel() {
    const s = this.s, L = this.level;
    if (s.state !== 'playing') return;
    if (this.timeMax) {
      const bonus = Math.floor(this.timeLeft) * 10 * L;
      if (bonus > 0) s.award(bonus, W / 2, BY + BOARD + 40, { color: '#a5f3fc', size: 22 });
      if (this.timeLeft >= this.timeMax / 2) s.unlock('quick');
    }
    if (this.mistakes === 0 && L >= 3) {
      s.award(100 * L, W / 2, BY + BOARD / 2, { color: '#fde047', size: 26 });
      s.fx.text(W / 2, BY + BOARD / 2 - 40, 'CLEAN ESCAPE!', { color: '#fde047', size: 28, life: 1.3 });
      s.unlock('clean');
    }
    if (this.n >= 10) s.unlock('giant');
    s.completeLevel();
  }

  onLevelClear() { if (this.bonus && this.bonusCount >= 20) this.s.unlock('stampede'); }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t, c = this.cell;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#2a0b3a'); g.addColorStop(1, '#0b1a3a'); }
    else { g.addColorStop(0, '#07131a'); g.addColorStop(1, '#10081f'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const d of this.bgDots) {
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + d.ph);
      ctx.fillStyle = '#5eead4'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // board
    ctx.save();
    ctx.shadowColor = this.bonus ? '#e879f9' : '#14b8a6'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#0c1424'; roundRect(ctx, BX - 8, BY - 8, BOARD + 16, BOARD + 16, 18); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = this.bonus ? 'rgba(232,121,249,.5)' : 'rgba(45,212,191,.35)'; ctx.lineWidth = 2;
    roundRect(ctx, BX - 8, BY - 8, BOARD + 16, BOARD + 16, 18); ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,.18)';
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) {
      ctx.beginPath(); ctx.arc(BX + (x + 0.5) * c, BY + (y + 0.5) * c, Math.max(1.5, c * 0.05), 0, Math.PI * 2); ctx.fill();
    }
    // rocks
    for (const [x, y] of this.rocks) {
      const cx = BX + (x + 0.5) * c, cy = BY + (y + 0.5) * c, r = c * 0.42;
      const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 1, cx, cy, r);
      rg.addColorStop(0, '#cbd5e1'); rg.addColorStop(1, '#334155');
      ctx.fillStyle = rg;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, rr = r * (0.82 + ((x * 7 + y * 3 + i * 5) % 5) * 0.05); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }

    // hovered snake: faint arrow along its escape line
    const hv = this.hover;
    if (hv && hv.alive && !hv.leaving && s.state === 'playing') {
      const [hx, hy] = hv.body[0], [dx, dy] = DIRS[hv.d];
      ctx.save(); ctx.strokeStyle = this.color(hv); ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(BX + (hx + 0.5) * c, BY + (hy + 0.5) * c);
      let ex = hx, ey = hy; while (ex >= 0 && ey >= 0 && ex < this.n && ey < this.n) { ex += dx; ey += dy; }
      ctx.lineTo(BX + (ex + 0.5) * c, BY + (ey + 0.5) * c); ctx.stroke(); ctx.restore();
    }

    // snakes (clip leaving snakes to a slightly larger area so they slide out of view)
    for (const sn of this.snakes) if (sn.alive) this.drawSnake(ctx, sn, t);

    // keyboard cursor
    if (this.cursor) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      roundRect(ctx, BX + this.cursor[0] * c + 2, BY + this.cursor[1] * c + 2, c - 4, c - 4, 6); ctx.stroke();
    }

    // HUD
    ctx.fillStyle = 'rgba(3,5,20,.7)'; ctx.fillRect(0, 0, W, 44);
    const left = this.snakes.filter((sn) => sn.alive && !sn.leaving).length;
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#e879f9', `★ STAMPEDE · ${this.bonusCount} freed · ${Math.ceil(s.bonusLeft)}s`);
    else progressBar(ctx, 14, 12, W - 28, 20, 1 - left / this.total, '#2dd4bf', `Snakes free ${this.total - left} / ${this.total} · ${this.n}×${this.n}`);
    if (this.timeMax && !this.bonus) {
      const k = Math.max(0, this.timeLeft / this.timeMax);
      const col = k < 0.25 ? '#f87171' : k < 0.5 ? '#fbbf24' : '#a5f3fc';
      progressBar(ctx, BX, BY + BOARD + 22, BOARD, 16, k, col, `⏱ ${Math.ceil(Math.max(0, this.timeLeft))}s`);
    }
    ctx.save(); ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(165,243,252,.65)';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Tap a snake to set it free' : 'Click a snake to set it free · or use arrows + Space', W / 2, H - 30);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.fillText('★ GOLDEN SNAKES', W / 2, H - 12); }
    ctx.restore();
  }

  /** Points along the snake from tail to head (in pixels), taking slide/bonk into account. */
  snakePoints(sn) {
    const c = this.cell, len = sn.body.length;
    const px = ([x, y]) => [BX + (x + 0.5) * c, BY + (y + 0.5) * c];
    if (sn.leaving) {
      const { path, p } = sn.leaving;
      const at = (q) => {
        const i = Math.min(path.length - 2, Math.floor(q)), f = q - i;
        const a = px(path[i]), b = px(path[i + 1]);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      };
      const pts = [at(p)];
      for (let i = Math.ceil(p); i < p + len - 1; i++) if (i > p) pts.push(px(path[i]));
      pts.push(at(p + len - 1));
      return pts;
    }
    const pts = sn.body.slice().reverse().map(px);
    if (sn.bump) {
      // head pushes forward then snaps back
      const k = sn.bump.t < 0.18 ? sn.bump.t / 0.18 : Math.max(0, 1 - (sn.bump.t - 0.18) / 0.3);
      const [dx, dy] = DIRS[sn.d];
      const h = pts[pts.length - 1];
      pts.push([h[0] + dx * c * sn.bump.dist * k, h[1] + dy * c * sn.bump.dist * k]);
    }
    return pts;
  }

  drawSnake(ctx, sn, t) {
    const c = this.cell, col = this.color(sn);
    const pts = this.snakePoints(sn);
    const hot = this.hover === sn && !sn.leaving;
    ctx.save();
    ctx.beginPath(); ctx.rect(BX - 6, BY - 6, BOARD + 12, BOARD + 12); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = col; ctx.shadowBlur = hot ? 22 : 10;
    ctx.strokeStyle = sn.bump ? '#f87171' : col; ctx.lineWidth = c * 0.62;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.shadowBlur = 0;
    // belly stripe
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = c * 0.16;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // head
    const [hx, hy] = pts[pts.length - 1];
    const [dx, dy] = DIRS[sn.d];
    ctx.fillStyle = sn.bump ? '#f87171' : col;
    ctx.beginPath(); ctx.arc(hx, hy, c * 0.36, 0, Math.PI * 2); ctx.fill();
    // arrow nose so the direction is always readable
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.moveTo(hx + dx * c * 0.44, hy + dy * c * 0.44);
    ctx.lineTo(hx + dx * c * 0.2 - dy * c * 0.14, hy + dy * c * 0.2 + dx * c * 0.14);
    ctx.lineTo(hx + dx * c * 0.2 + dy * c * 0.14, hy + dy * c * 0.2 - dx * c * 0.14);
    ctx.closePath(); ctx.fill();
    // eyes
    for (const side of [-1, 1]) {
      const ex = hx - dx * c * 0.04 + -dy * side * c * 0.17, ey = hy - dy * c * 0.04 + dx * side * c * 0.17;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, c * 0.085, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(ex + dx * c * 0.03, ey + dy * c * 0.03, c * 0.045, 0, Math.PI * 2); ctx.fill();
    }
    // tongue flick
    if (Math.sin(t * 3 + sn.ph) > 0.85 || sn.leaving) {
      ctx.strokeStyle = '#fb7185'; ctx.lineWidth = Math.max(1.5, c * 0.04);
      const tx = hx + dx * c * 0.5, ty = hy + dy * c * 0.5;
      ctx.beginPath(); ctx.moveTo(hx + dx * c * 0.36, hy + dy * c * 0.36); ctx.lineTo(tx, ty);
      ctx.lineTo(tx + dx * c * 0.08 - dy * c * 0.07, ty + dy * c * 0.08 + dx * c * 0.07);
      ctx.moveTo(tx, ty); ctx.lineTo(tx + dx * c * 0.08 + dy * c * 0.07, ty + dy * c * 0.08 - dx * c * 0.07); ctx.stroke();
    }
    if (this.s.gold && Math.sin(t * 2 + sn.id) > 0.9) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], c * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

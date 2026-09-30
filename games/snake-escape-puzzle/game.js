// ─────────────────────────────────────────────────────────────
//  SNAKE ESCAPE PUZZLE — game 7 (Zone 2 · Expert)
//  A knot of snakes on a square board. Tap a snake and it slithers forward —
//  along its own body and out through its head — until something is in the way.
//  If nothing is, it leaves the board. Clear every snake within the move limit.
//
//  The catch: stopping halfway is sometimes exactly what you need, and sometimes
//  it jams two snakes against each other for good. Every snake blocks another.
//
//  Every puzzle is pre-built and solved exhaustively by tools/gen-snake-puzzles.mjs,
//  so each one is solvable and we know the fewest moves ("par") it takes.
//    L1–4  learn it (5×5 → 6×6, 2 spare moves)     L5+  1 spare move, rocks from L6
//    L12+  a clock (restarting doesn't reset it)    L30+ 9×9 and NO spare moves
//    L41+  the hard puzzles come back rotated and mirrored
//  Stuck or out of moves = lose a life. ↺ Restart (or R) is always free.
//  Every 5th level: ★ STAMPEDE bonus — the classic rules, free as many as you can in 15 s.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { makeBoard, occupancy, slide, reach, exitOffset, cleared } from './rules.js';
import { PUZZLES } from './puzzles.js';

const ID = 'snake-escape-puzzle';
const W = 480, H = 720;
const BOARD = 440, BX = (W - BOARD) / 2, BY = 112;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const ROCK = -2;
const COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#60a5fa', '#e879f9', '#facc15', '#2dd4bf', '#c084fc'];
const RESTART = { x: W / 2 - 80, y: BY + BOARD + 50, w: 160, h: 38 };

// spare moves on top of the fewest possible
const slackFor = (L) => (L <= 4 ? 2 : L <= 29 ? 1 : 0);

// ── Puzzle set: levels 1–40 are hand-checked; after that the hardest come back transformed ──
const KEYS = Object.keys(PUZZLES).map(Number).sort((a, b) => a - b);
function transform(p, t) {
  const n = p.n, rot = t % 4, mir = t >= 4;
  const pt = ([x, y]) => {
    if (mir) x = n - 1 - x;
    for (let r = 0; r < rot; r++) [x, y] = [n - 1 - y, x];
    return [x, y];
  };
  const dir = (d) => {
    if (mir && d % 2 === 0) d = 2 - d;
    return (d + rot) % 4;
  };
  return { n, opt: p.opt, rocks: (p.rocks || []).map(pt), snakes: p.snakes.map((s) => ({ body: s.body.map(pt), d: dir(s.d) })) };
}
function puzzleFor(L) {
  if (PUZZLES[L]) return PUZZLES[L];
  const pool = KEYS.filter((k) => k >= 21).length ? KEYS.filter((k) => k >= 21) : KEYS;
  if (L <= 40) { const k = KEYS.filter((q) => q <= L).pop() ?? KEYS[0]; return transform(PUZZLES[k], 1); }
  const i = L - 41;
  return transform(PUZZLES[pool[i % pool.length]], 1 + Math.floor(i / pool.length) % 7);
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
    if (bonus) return '★ STAMPEDE! Classic rules: a snake only moves if its way out is clear. Free as many as you can in 15 seconds!';
    const notes = {
      1: 'Tap a snake: it slithers forward — along its body, out through its head — until something is in the way. Get them all off the board!',
      2: 'A snake stops right where it gets blocked. That can be useful…',
      3: 'Moves are limited! One snake parked in the wrong place can jam the board. ↺ Restart (or R) is free — getting stuck costs a life.',
      4: 'Sometimes you must slide a snake only part of the way first. Plan the order!',
      6: '🪨 Rocks never move. Only ONE spare move from now on.',
      12: '⏱️ The clock starts ticking from here — and restarting doesn\'t reset it.',
      21: '8×8 knots. Every snake is in somebody\'s way.',
      31: '9×9 — and no spare moves at all. Only the perfect solution works.',
      41: 'The hardest knots return… turned and mirrored. Good luck!',
    };
    return notes[level] || 'Think first, tap second. Every move counts.';
  },
  create: (shell) => new SnakeEscape(shell),
});

class SnakeEscape {
  constructor(s) {
    this.s = s; this.t = 0;
    this.hover = null; this.cursor = null; this.overRestart = false;
    this.bgDots = Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.4, ph: Math.random() * 6 }));
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyR' || e.repeat || e.target instanceof HTMLInputElement) return;
      if (this.s.state === 'playing' && !this.bonus) { e.preventDefault(); this.restartBoard(true); }
    });
    this.startLevel(1, false);
  }

  reset() { this.bonusCount = 0; }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.bonusCount = 0; this.restarts = 0; this.fails = 0;
    this.moving = []; this.pendingHurt = 0; this.pendingFail = 0;
    if (bonus) this.buildStampede();
    else this.loadPuzzle();
  }

  // ── Puzzle mode ────────────────────────────────────────────
  loadPuzzle() {
    const P = puzzleFor(this.level);
    this.P = P;
    this.B = makeBoard(P);
    this.n = P.n; this.cell = BOARD / P.n;
    this.rocks = P.rocks || [];
    this.par = P.opt;
    this.limit = P.opt + slackFor(this.level);
    this.total = P.snakes.length;
    this.timeMax = this.level >= 12 ? 30 + P.opt * 6 : 0;
    this.timeLeft = this.timeMax;
    this.snakes = this.B.snakes.map((sn, i) => ({
      id: i, body: sn.body, d: sn.d, len: sn.len, color: COLORS[i % COLORS.length], ph: Math.random() * 6,
      track: this.trackOf(sn), alive: true, vis: 0, v: 0, bump: null,
    }));
    this.restartBoard(false);
  }

  /** Grid cells along a snake's whole route, continuing past the edge so it can slide out of view. */
  trackOf(sn) {
    const out = [];
    const [dx, dy] = DIRS[sn.d];
    let last = null, k = 0;
    for (const c of sn.path) {
      if (c) { out.push(c); last = c; } else { k++; out.push([last[0] + dx * k, last[1] + dy * k]); }
    }
    for (let j = 0; j < 3; j++) { k++; out.push([last[0] + dx * k, last[1] + dy * k]); }
    return out;
  }

  restartBoard(byPlayer) {
    if (byPlayer) {
      if (this.moves === 0 || this.busy()) return;
      this.restarts++;
      this.s.sound.play('click');
      this.s.fx.text(W / 2, BY + BOARD / 2, '↺ RESTART', { color: '#a5f3fc', size: 26, life: 0.8 });
    }
    this.st = new Array(this.snakes.length).fill(0);
    this.moves = 0;
    for (const sn of this.snakes) { sn.alive = true; sn.vis = 0; sn.v = 0; sn.bump = null; }
    this.refreshOcc();
  }

  refreshOcc() { this.occ = occupancy(this.B, this.st); }
  busy() { return this.snakes.some((sn) => sn.alive && Math.abs(sn.vis - this.st[sn.id]) > 1e-3) || this.pendingFail > 0 || this.pendingHurt > 0; }

  // ── Stampede bonus (classic rules) ─────────────────────────
  buildStampede() {
    const r = this.s.rng, n = 7;
    let best = null;
    for (let a = 0; a < 3; a++) { const p = this.generate(n, 0.72, 4, r); if (!best || p.filled > best.filled) best = p; }
    this.n = n; this.cell = BOARD / n;
    this.grid = best.occ; this.snakes = best.snakes; this.rocks = [];
    this.total = this.snakes.length; this.timeMax = 0;
  }

  /** Snakes placed one by one, each new one's way out clear — so newest-first always works. */
  generate(n, fill, maxLen, r) {
    const occ = Array.from({ length: n }, () => new Array(n).fill(-1));
    const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
    const snakes = [];
    let filled = 0;
    const target = Math.floor(n * n * fill);
    for (let tries = 0; tries < 600 && filled < target; tries++) {
      const hx = r.int(0, n - 1), hy = r.int(0, n - 1);
      if (occ[hy][hx] !== -1) continue;
      const d = r.int(0, 3), [dx, dy] = DIRS[d];
      const ray = new Set(); let ok = true, x = hx + dx, y = hy + dy;
      while (inside(x, y)) { if (occ[y][x] !== -1) { ok = false; break; } ray.add(x + ',' + y); x += dx; y += dy; }
      if (!ok) continue;
      const want = r.int(2, maxLen), body = [[hx, hy]], used = new Set([hx + ',' + hy]);
      for (let k = 1; k < want; k++) {
        const [tx, ty] = body[body.length - 1];
        const opts = DIRS.map(([ex, ey]) => [tx + ex, ty + ey]).filter(([ax, ay]) => inside(ax, ay) && occ[ay][ax] === -1 && !used.has(ax + ',' + ay) && !ray.has(ax + ',' + ay));
        if (!opts.length) break;
        const c = r.pick(opts); body.push(c); used.add(c[0] + ',' + c[1]);
      }
      if (body.length < 2) continue;
      const id = snakes.length;
      for (const [bx, by] of body) occ[by][bx] = id;
      snakes.push({ id, body, d, len: body.length, color: COLORS[id % COLORS.length], alive: true, bump: null, ph: r.range(0, 6) });
      filled += body.length;
    }
    return { occ, snakes, filled };
  }

  /** Stampede: distance to the first thing in a snake's way, or -1 if its path is clear. */
  blockedAt(sn) {
    const [dx, dy] = DIRS[sn.d];
    let [x, y] = sn.body[0], k = 0;
    for (;;) {
      x += dx; y += dy; k++;
      if (x < 0 || y < 0 || x >= this.n || y >= this.n) return -1;
      const o = this.grid[y][x];
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
    const o = this.bonus ? this.grid[c[1]][c[0]] : this.occ[c[1] * this.n + c[0]];
    return o >= 0 ? this.snakes[o] : null;
  }
  inRestart(x, y) { return !this.bonus && x >= RESTART.x && x <= RESTART.x + RESTART.w && y >= RESTART.y && y <= RESTART.y + RESTART.h; }
  onPointerMove(x, y) { this.hover = this.snakeAt(this.cellAt(x, y)); this.overRestart = this.inRestart(x, y); this.cursor = null; }
  onAction(a, x, y) {
    if (a === 'press') {
      if (this.inRestart(x, y)) { this.restartBoard(true); return; }
      this.tap(this.snakeAt(this.cellAt(x, y)));
      return;
    }
    const moves = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    if (moves[a]) {
      if (!this.cursor) this.cursor = [Math.floor(this.n / 2), Math.floor(this.n / 2)];
      this.cursor = [clamp(this.cursor[0] + moves[a][0], 0, this.n - 1), clamp(this.cursor[1] + moves[a][1], 0, this.n - 1)];
      this.hover = this.snakeAt(this.cursor);
    }
    if (a === 'action' && this.cursor) this.tap(this.snakeAt(this.cursor));
  }

  tap(sn) {
    if (!sn || !sn.alive) return;
    if (this.bonus) return this.tapStampede(sn);
    if (this.busy()) return;
    const s = this.s, i = sn.id;
    const ns = slide(this.B, this.st, i);
    if (!ns) { this.bonk(sn, 1, 'Blocked'); return; }
    this.st = ns; this.moves++;
    sn.v = 6;
    this.refreshOcc();
    const out = ns[i] >= exitOffset(this.B.snakes[i]);
    const [hx, hy] = this.track(sn, sn.vis + sn.len - 1);
    if (out) {
      s.award((5 + sn.len * 3) * this.level, hx, hy - 14, { chain: true, color: this.color(sn), size: 18 });
      s.sound.play('eat', Math.min(12, s.comboCount));
      s.sound.tone({ freq: 300, to: 900, dur: 0.18, type: 'triangle', vol: 0.06 });
    } else {
      s.sound.tone({ freq: 260, to: 420, dur: 0.12, type: 'triangle', vol: 0.05 });
    }
  }

  tapStampede(sn) {
    const s = this.s;
    if (sn.leaving || sn.bump) return;
    const k = this.blockedAt(sn);
    if (k >= 0) { this.bonk(sn, k, 'Blocked!'); return; }
    const [dx, dy] = DIRS[sn.d];
    const path = sn.body.slice().reverse();
    let [x, y] = sn.body[0];
    for (let i = 0; i < this.n + sn.len + 1; i++) { x += dx; y += dy; path.push([x, y]); }
    sn.leaving = { path, p: 0, v: 14 + sn.len };
    for (const [bx, by] of sn.body) this.grid[by][bx] = -1;
    this.moving.push(sn);
    const [hx, hy] = sn.body[0];
    s.award(5 * this.level, BX + (hx + 0.5) * this.cell, BY + (hy + 0.5) * this.cell - 14, { chain: true, color: this.color(sn), size: 18 });
    s.sound.play('eat', Math.min(12, s.comboCount));
    this.bonusCount++;
    if (this.bonusCount >= 20) s.unlock('stampede');
  }

  bonk(sn, k, label) {
    const s = this.s;
    sn.bump = { t: 0, dist: Math.max(0.2, k - 0.62) };
    s.sound.play('hit'); s.fx.shake(4, 0.15);
    const pts = this.snakePoints(sn), [hx, hy] = pts[pts.length - 1];
    s.fx.text(hx, hy - 22, label, { color: '#fca5a5', size: 16 });
  }

  color(sn) { return this.s.gold ? ['#fde047', '#fbbf24', '#f59e0b', '#fcd34d'][sn.id % 4] : sn.color; }

  onLifeLost() {
    this.pendingHurt = 0; this.pendingFail = 0;
    if (this.bonus) { for (const sn of this.snakes) sn.bump = null; return; }
    this.timeLeft = this.timeMax;
    this.restartBoard(false);
  }

  idle(dt) { this.t += dt; this.animate(dt); }

  animate(dt) {
    for (const sn of this.snakes) if (sn.bump) { sn.bump.t += dt; if (sn.bump.t > 0.5) sn.bump = null; }
    if (this.bonus) {
      for (const sn of this.moving) {
        const lv = sn.leaving;
        lv.p += lv.v * dt; lv.v += 30 * dt;
        if (lv.p >= lv.path.length - sn.len) sn.alive = false;
      }
      this.moving = this.moving.filter((sn) => sn.alive);
      return;
    }
    for (const sn of this.snakes) {
      if (!sn.alive) continue;
      const goal = this.st[sn.id];
      if (sn.vis < goal) {
        sn.v = Math.min(22, sn.v + 40 * dt);
        sn.vis = Math.min(goal, sn.vis + sn.v * dt);
        if (sn.vis >= goal) { sn.v = 0; if (goal >= exitOffset(this.B.snakes[sn.id])) sn.alive = false; }
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s;
    this.t += dt;
    this.animate(dt);

    if (this.bonus) {
      if (this.snakes.every((sn) => !sn.alive || sn.leaving) && !this.moving.length) {
        s.fx.text(W / 2, BY + BOARD / 2, 'NEXT HERD!', { color: '#fde047', size: 30 });
        s.sound.play('powerup');
        this.buildStampede();
      }
      return;
    }

    if (this.pendingFail > 0) {
      this.pendingFail -= dt;
      if (this.pendingFail <= 0) { this.fails++; s.sound.play('boom'); s.hurt(); }
      return;
    }

    if (this.timeMax) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 5 && Math.ceil(this.timeLeft) !== Math.ceil(this.timeLeft + dt)) s.sound.play('tick');
      if (this.timeLeft <= 0) {
        s.fx.text(W / 2, BY + BOARD / 2, 'TIME UP!', { color: '#f87171', size: 40, life: 1.4 });
        this.pendingFail = 0.01;
        return;
      }
    }

    if (this.busy()) return;
    if (cleared(this.B, this.st)) { this.clearLevel(); return; }
    const canMove = this.snakes.some((sn) => sn.alive && reach(this.B, this.st, sn.id, this.occ) > 0);
    if (!canMove || this.moves >= this.limit) {
      s.fx.text(W / 2, BY + BOARD / 2, canMove ? 'OUT OF MOVES!' : 'STUCK!', { color: '#f87171', size: 36, life: 1.4 });
      s.fx.shake(6, 0.25);
      this.pendingFail = 0.7;
    }
  }

  clearLevel() {
    const s = this.s, L = this.level;
    if (s.state !== 'playing') return;
    const spare = this.limit - this.moves;
    if (spare > 0) s.award(spare * 60 * L, W / 2, BY + BOARD + 20, { color: '#a5f3fc', size: 20 });
    if (this.timeMax) {
      const bonus = Math.floor(this.timeLeft) * 8 * L;
      if (bonus > 0) s.award(bonus, W / 2, BY + BOARD + 44, { color: '#a5f3fc', size: 20 });
      if (this.timeLeft >= this.timeMax / 2) s.unlock('quick');
    }
    if (this.moves === this.par && this.fails === 0) {
      s.award(100 * L, W / 2, BY + BOARD / 2, { color: '#fde047', size: 26 });
      s.fx.text(W / 2, BY + BOARD / 2 - 40, 'PERFECT SOLVE!', { color: '#fde047', size: 28, life: 1.3 });
      if (L >= 3) s.unlock('clean');
    }
    if (this.n >= 9) s.unlock('giant');
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
    for (const [x, y] of this.rocks) {
      const cx = BX + (x + 0.5) * c, cy = BY + (y + 0.5) * c, r = c * 0.42;
      const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 1, cx, cy, r);
      rg.addColorStop(0, '#cbd5e1'); rg.addColorStop(1, '#334155');
      ctx.fillStyle = rg;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, rr = r * (0.82 + ((x * 7 + y * 3 + i * 5) % 5) * 0.05); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }

    // helper for the first levels: the hovered snake's way out
    const hv = this.hover;
    if (hv && hv.alive && s.state === 'playing' && (this.bonus ? !hv.leaving : this.level <= 3 && !this.busy())) {
      ctx.save(); ctx.strokeStyle = this.color(hv); ctx.globalAlpha = 0.4; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath();
      if (this.bonus) {
        const [hx, hy] = hv.body[0], [dx, dy] = DIRS[hv.d];
        ctx.moveTo(BX + (hx + 0.5) * c, BY + (hy + 0.5) * c);
        let ex = hx, ey = hy; while (ex >= 0 && ey >= 0 && ex < this.n && ey < this.n) { ex += dx; ey += dy; }
        ctx.lineTo(BX + (ex + 0.5) * c, BY + (ey + 0.5) * c);
      } else {
        const from = this.st[hv.id] + hv.len - 1, to = this.B.snakes[hv.id].onBoard;
        for (let k = from; k <= to && k < hv.track.length; k++) {
          const [x, y] = hv.track[k], px = BX + (x + 0.5) * c, py = BY + (y + 0.5) * c;
          k === from ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
      }
      ctx.stroke(); ctx.restore();
    }

    for (const sn of this.snakes) if (sn.alive) this.drawSnake(ctx, sn, t);

    if (this.cursor) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      roundRect(ctx, BX + this.cursor[0] * c + 2, BY + this.cursor[1] * c + 2, c - 4, c - 4, 6); ctx.stroke();
    }

    // HUD
    ctx.fillStyle = 'rgba(3,5,20,.7)'; ctx.fillRect(0, 0, W, 44);
    const coarse = matchMedia('(pointer: coarse)').matches;
    ctx.save(); ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(165,243,252,.65)';
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#e879f9', `★ STAMPEDE · ${this.bonusCount} freed · ${Math.ceil(s.bonusLeft)}s`);
      ctx.fillText(coarse ? 'Tap a snake with a clear way out' : 'Click a snake with a clear way out · or arrows + Space', W / 2, H - 30);
    } else {
      const left = this.snakes.filter((sn) => sn.alive).length;
      progressBar(ctx, 14, 12, W - 28, 20, 1 - left / this.total, '#2dd4bf', `Snakes out ${this.total - left} / ${this.total} · ${this.n}×${this.n}`);
      // moves
      const movesLeft = this.limit - this.moves;
      ctx.font = '800 20px system-ui';
      ctx.fillStyle = movesLeft <= 1 ? '#f87171' : movesLeft <= 3 ? '#fbbf24' : '#e2e8f0';
      ctx.fillText(`Moves ${this.moves} / ${this.limit}`, W / 2, 76);
      ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(165,243,252,.6)';
      ctx.fillText(`Perfect solve: ${this.par} moves${slackFor(this.level) ? ` · ${slackFor(this.level)} spare` : ' · no spare moves'}`, W / 2, 96);
      if (this.timeMax) {
        const k = Math.max(0, this.timeLeft / this.timeMax);
        const col = k < 0.25 ? '#f87171' : k < 0.5 ? '#fbbf24' : '#a5f3fc';
        progressBar(ctx, BX, BY + BOARD + 18, BOARD, 16, k, col, `⏱ ${Math.ceil(Math.max(0, this.timeLeft))}s`);
      }
      // restart button
      const on = this.moves > 0 && !this.busy();
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.fillStyle = this.overRestart && on ? '#134e4a' : '#0f2a33';
      roundRect(ctx, RESTART.x, RESTART.y, RESTART.w, RESTART.h, 19); ctx.fill();
      ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 2; roundRect(ctx, RESTART.x, RESTART.y, RESTART.w, RESTART.h, 19); ctx.stroke();
      ctx.fillStyle = '#ccfbf1'; ctx.font = '800 15px system-ui';
      ctx.fillText(coarse ? '↺ Restart (free)' : '↺ Restart  ·  R', W / 2, RESTART.y + 25);
      ctx.globalAlpha = 1;
      ctx.font = '700 13px system-ui'; ctx.fillStyle = 'rgba(165,243,252,.65)';
      ctx.fillText(coarse ? 'Tap a snake — it slides until something blocks it' : 'Click a snake — it slides until blocked · arrows + Space', W / 2, H - 30);
    }
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 13px system-ui'; ctx.fillText('★ GOLDEN SNAKES', W / 2, H - 12); }
    ctx.restore();
  }

  /** Pixel point at a (fractional) position along a puzzle snake's track. */
  track(sn, q) {
    const c = this.cell, tr = sn.track;
    const i = Math.max(0, Math.min(tr.length - 2, Math.floor(q))), f = q - i;
    const a = tr[i], b = tr[i + 1];
    return [BX + (a[0] + (b[0] - a[0]) * f + 0.5) * c, BY + (a[1] + (b[1] - a[1]) * f + 0.5) * c];
  }

  /** Points along the snake from tail to head (in pixels), plus the way the head is facing. */
  snakePoints(sn) {
    const c = this.cell, len = sn.len;
    const px = ([x, y]) => [BX + (x + 0.5) * c, BY + (y + 0.5) * c];
    let pts, dir;
    if (!this.bonus) {
      const p = sn.vis;
      pts = [this.track(sn, p)];
      for (let i = Math.floor(p) + 1; i < p + len - 1; i++) pts.push(px(sn.track[i]));
      pts.push(this.track(sn, p + len - 1));
      const hi = Math.min(sn.track.length - 2, Math.floor(p + len - 1));
      dir = [sn.track[hi + 1][0] - sn.track[hi][0], sn.track[hi + 1][1] - sn.track[hi][1]];
    } else if (sn.leaving) {
      const { path, p } = sn.leaving;
      const at = (q) => {
        const i = Math.min(path.length - 2, Math.floor(q)), f = q - i;
        const a = px(path[i]), b = px(path[i + 1]);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      };
      pts = [at(p)];
      for (let i = Math.ceil(p); i < p + len - 1; i++) if (i > p) pts.push(px(path[i]));
      pts.push(at(p + len - 1));
      dir = DIRS[sn.d];
    } else {
      pts = sn.body.slice().reverse().map(px);
      dir = DIRS[sn.d];
    }
    if (sn.bump) {
      const k = sn.bump.t < 0.18 ? sn.bump.t / 0.18 : Math.max(0, 1 - (sn.bump.t - 0.18) / 0.3);
      const h = pts[pts.length - 1];
      pts.push([h[0] + dir[0] * c * sn.bump.dist * k, h[1] + dir[1] * c * sn.bump.dist * k]);
    }
    pts.dir = dir;
    return pts;
  }

  drawSnake(ctx, sn, t) {
    const c = this.cell, col = this.color(sn);
    const pts = this.snakePoints(sn);
    const hot = this.hover === sn;
    ctx.save();
    ctx.beginPath(); ctx.rect(BX - 6, BY - 6, BOARD + 12, BOARD + 12); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = col; ctx.shadowBlur = hot ? 22 : 10;
    ctx.strokeStyle = sn.bump ? '#f87171' : col; ctx.lineWidth = c * 0.62;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = c * 0.16;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // head
    const [hx, hy] = pts[pts.length - 1];
    const [dx, dy] = pts.dir;
    ctx.fillStyle = sn.bump ? '#f87171' : col;
    ctx.beginPath(); ctx.arc(hx, hy, c * 0.36, 0, Math.PI * 2); ctx.fill();
    // arrow nose: which way it will go next
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.moveTo(hx + dx * c * 0.44, hy + dy * c * 0.44);
    ctx.lineTo(hx + dx * c * 0.2 - dy * c * 0.14, hy + dy * c * 0.2 + dx * c * 0.14);
    ctx.lineTo(hx + dx * c * 0.2 + dy * c * 0.14, hy + dy * c * 0.2 - dx * c * 0.14);
    ctx.closePath(); ctx.fill();
    for (const side of [-1, 1]) {
      const ex = hx - dx * c * 0.04 + -dy * side * c * 0.17, ey = hy - dy * c * 0.04 + dx * side * c * 0.17;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, c * 0.085, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(ex + dx * c * 0.03, ey + dy * c * 0.03, c * 0.045, 0, Math.PI * 2); ctx.fill();
    }
    if (Math.sin(t * 3 + sn.ph) > 0.85 || sn.leaving || sn.v > 0) {
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

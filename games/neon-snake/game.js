// ─────────────────────────────────────────────────────────────
//  NEON SNAKE
//  L1  gentle, edges wrap          L2  golden fruit appears
//  L3  blocks                      L4  walls become solid
//  L5  ★ bonus: gem feast           L6  portals
//  L7  sparks (moving hazards)     L8+ more of everything, faster
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar } from '../../assets/js/engine.js';

const COLS = 20, ROWS = 20, CELL = 30, TOP = 40;
const W = COLS * CELL, H = TOP + ROWS * CELL;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const cx = (x) => x * CELL + CELL / 2;
const cy = (y) => TOP + y * CELL + CELL / 2;

const target = (level) => 5 + level;

runGame({
  id: 'neon-snake',
  width: W,
  height: H,
  extend: { maxH: 1250, topShare: 0 },   // tall phone screens: an arrow pad goes under the board
  lives: 3,
  comboWindow: 3.5,   // eat again within 3.5s to keep the combo going
  comboStep: 3,       // every 3 quick bites raises the multiplier
  maxMultiplier: 5,
  bonusTime: 15,
  music: { bpm: 116, style: 'minor', lead: 'square' },
  levelInfo(level, bonus) {
    if (bonus) return 'You can\'t crash — gobble every gem you can!';
    const notes = {
      1: 'Eat the glowing fruit. Arrow keys or swipe.',
      2: 'Golden fruit! Grab it before it fades.',
      3: 'Watch out for the blocks! 🫐 Berry clusters give 1.5× points.',
      4: 'Careful — the walls are solid now!',
      5: '⭐ Star fruit appears — worth 2.5× more!',
      6: 'Portals! In one side, out the other.',
      7: 'Sparks! Don\'t let one touch your head.',
    };
    return notes[level] || `Eat ${target(level)} fruit · faster!`;
  },
  create: (shell) => new NeonSnake(shell),
});

class NeonSnake {
  constructor(s) {
    this.s = s;
    this.t = 0;
    this.startLevel(1, false);
  }

  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus; this.dead = false;
    this.solid = !bonus && level >= 4;
    this.stepTime = Math.max(0.055, 0.165 / s.speed(0.07, 3, level)) * (bonus ? 0.85 : 1);
    this.moveT = 0;
    const my = Math.floor(ROWS / 2);
    this.snake = [{ x: 5, y: my }, { x: 4, y: my }, { x: 3, y: my }, { x: 2, y: my }];
    this.dir = 'right'; this.queue = [];
    this.grow = 0; this.eaten = 0; this.need = target(level);
    this.obstacles = new Set(); this.portals = null; this.sparks = [];
    this.foods = []; this.golden = null; this.gems = []; this.gemsEaten = 0;

    if (bonus) {
      for (let i = 0; i < 8; i++) this.spawnGem();
      return;
    }
    if (level >= 3) {
      const clusters = Math.min(14, 2 + (level - 3) * 2);
      for (let c = 0; c < clusters; c++) {
        const len = r.int(1, 3), horiz = r.chance(0.5);
        const x0 = r.int(1, COLS - 2), y0 = r.int(1, ROWS - 2);
        for (let i = 0; i < len; i++) {
          const x = x0 + (horiz ? i : 0), y = y0 + (horiz ? 0 : i);
          if (x >= COLS || y >= ROWS) continue;
          if (Math.abs(y - my) <= 1 && x <= 12) continue; // keep the starting lane clear
          this.obstacles.add(y * COLS + x);
        }
      }
    }
    if (level >= 6) {
      const a = this.freeCell(), b = this.freeCell({ farFrom: a, min: 9 });
      this.portals = [a, b];
    }
    if (level >= 7) {
      const n = Math.min(4, 1 + Math.floor((level - 7) / 3));
      for (let i = 0; i < n; i++) {
        const c = this.freeCell({ farFrom: this.snake[0], min: 8 });
        this.sparks.push({ ...c, dx: r.chance(0.5) ? 1 : -1, dy: r.chance(0.5) ? 1 : -1, t: 0 });
      }
    }
    this.spawnFood();
  }

  // ── Grid helpers ───────────────────────────────────────────
  blocked(x, y) {
    if (this.obstacles.has(y * COLS + x)) return true;
    if (this.snake.some((p) => p.x === x && p.y === y)) return true;
    if (this.portals && this.portals.some((p) => p.x === x && p.y === y)) return true;
    if (this.foods.some((p) => p.x === x && p.y === y)) return true;
    if (this.gems.some((p) => p.x === x && p.y === y)) return true;
    if (this.golden && this.golden.x === x && this.golden.y === y) return true;
    return false;
  }
  /** Cells the snake can actually reach from its head, walking round the obstacles
   *  (the body and pickups move, so only walls count). Stops food spawning walled in
   *  on solid-wall levels. */
  reachableCells() {
    const head = this.snake?.[0];
    if (!head) return null;
    const seen = new Uint8Array(COLS * ROWS), q = [head.y * COLS + head.x];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x + dx, ny = y + dy;
        if (this.solid) { if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue; }
        else { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
        const j = ny * COLS + nx;
        if (seen[j] || this.obstacles.has(j)) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return seen;
  }

  freeCell({ farFrom = this.snake[0], min = 3 } = {}) {
    const r = this.s.rng;
    const reach = this.reachableCells();
    for (let i = 0; i < 400; i++) {
      const x = r.int(0, COLS - 1), y = r.int(0, ROWS - 1);
      if (this.blocked(x, y)) continue;
      if (reach && !reach[y * COLS + x]) continue;
      if (farFrom && Math.abs(farFrom.x - x) + Math.abs(farFrom.y - y) < min) continue;
      return { x, y };
    }
    return { x: 0, y: 0 };
  }
  spawnFood() {
    const c = this.freeCell(), r = this.s.rng;
    // Fruit variety: from level 3 occasionally spawn a star (2×) or berry (1.5×) fruit
    let type = 'normal', pts = 10;
    if (this.level >= 5 && r.chance(0.15)) { type = 'star';  pts = 25; }
    else if (this.level >= 3 && r.chance(0.22)) { type = 'berry'; pts = 15; }
    this.foods.push({ ...c, hue: r.int(0, 359), born: this.t, type, pts });
  }
  spawnGem() { const c = this.freeCell({ min: 2 }); this.gems.push({ ...c, hue: this.s.rng.int(0, 359), born: this.t }); }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x, y) {
    if (a === 'press' && x !== undefined) { const d = this.padAt(x, y); this.padFinger = d; if (d) this.padTurn(d); return; }
    if (a === 'release') { this.padFinger = null; return; }
    if (DIRS[a] && this.padFinger) return;          // a thumb sliding over the pad steers with the arrows, not as a swipe
    this.turn(a);
  }
  onPointerMove(x, y, down) {
    if (!down || !this.padFinger) return;
    const d = this.padAt(x, y);
    if (d && d !== this.padFinger) { this.padFinger = d; this.padTurn(d); }
  }
  padTurn(d) { this.padHit = { d, at: this.t }; this.turn(d); }
  turn(a) {
    if (!DIRS[a]) return;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (a === last || a === OPP[last]) return;
    if (this.queue.length < 3) this.queue.push(a);
  }

  // ── Touch arrow pad (only on tall phone screens, in the band under the board) ──
  pad() {
    const b = this.s.bands?.bottom || 0;
    if (b < 180) return null;
    const cy = H + Math.min(b * 0.46, 250), gap = Math.min(104, b * 0.22), r = Math.min(46, gap * 0.46);
    return { cx: W / 2, cy, gap, r };
  }
  padAt(x, y) {
    const P = this.pad();
    if (!P) return null;
    const dx = x - P.cx, dy = y - P.cy;
    if (Math.hypot(dx, dy) > P.gap + P.r + 18 || Math.hypot(dx, dy) < 14) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  drawPad(ctx) {
    const P = this.pad();
    if (!P) return;
    const hit = this.padHit && this.t - this.padHit.at < 0.18 ? this.padHit.d : null;
    for (const d of ['up', 'down', 'left', 'right']) {
      const [dx, dy] = DIRS[d], x = P.cx + dx * P.gap, y = P.cy + dy * P.gap, on = hit === d;
      ctx.fillStyle = on ? 'rgba(34,211,238,.32)' : 'rgba(255,255,255,.07)';
      roundRect(ctx, x - P.r, y - P.r, P.r * 2, P.r * 2, 18); ctx.fill();
      ctx.strokeStyle = on ? '#22d3ee' : 'rgba(255,255,255,.22)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = on ? '#fff' : '#cbd5e1';
      const k = P.r * 0.42;
      ctx.beginPath();
      ctx.moveTo(x + dx * k, y + dy * k);
      ctx.lineTo(x - dx * k * 0.6 + dy * k * 0.9, y - dy * k * 0.6 + dx * k * 0.9);
      ctx.lineTo(x - dx * k * 0.6 - dy * k * 0.9, y - dy * k * 0.6 - dx * k * 0.9);
      ctx.closePath(); ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '600 17px system-ui'; ctx.fillStyle = 'rgba(203,213,225,.55)';
    ctx.fillText('Tap an arrow to turn · swipes work too', W / 2, P.cy + P.gap + P.r + 42);
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; }

  update(dt) {
    this.t += dt;
    if (this.golden) {
      this.golden.ttl -= dt;
      if (this.golden.ttl <= 0) { this.s.fx.burst(cx(this.golden.x), cy(this.golden.y), { color: '#fbbf24', count: 8, speed: 60 }); this.golden = null; }
    }
    for (const sp of this.sparks) {
      sp.t += dt;
      if (sp.t >= this.stepTime * 1.7) { sp.t = 0; this.moveSpark(sp); }
    }
    if (this.s.state !== 'playing') return;
    this.moveT += dt;
    while (this.moveT >= this.stepTime) {
      this.moveT -= this.stepTime;
      this.step();
      if (this.s.state !== 'playing') break;
    }
  }

  moveSpark(sp) {
    let nx = sp.x + sp.dx, ny = sp.y + sp.dy;
    const bad = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || this.obstacles.has(y * COLS + x);
    if (bad(nx, sp.y)) { sp.dx *= -1; nx = sp.x + sp.dx; }
    if (bad(sp.x, ny)) { sp.dy *= -1; ny = sp.y + sp.dy; }
    if (bad(nx, ny)) { sp.dx *= -1; sp.dy *= -1; return; }
    sp.x = nx; sp.y = ny;
    const h = this.snake[0];
    if (!this.bonus && h.x === sp.x && h.y === sp.y) this.crash();
  }

  step() {
    const s = this.s;
    if (this.queue.length) this.dir = this.queue.shift();
    const [dx, dy] = DIRS[this.dir];
    const head = this.snake[0];
    let nx = head.x + dx, ny = head.y + dy;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      if (this.solid) return this.crash();
      nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS;
    }
    if (this.portals) {
      const [a, b] = this.portals;
      const hit = nx === a.x && ny === a.y ? b : nx === b.x && ny === b.y ? a : null;
      if (hit) {
        s.fx.ring(cx(nx), cy(ny), { color: '#60a5fa', radius: 40 });
        nx = hit.x + dx; ny = hit.y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
          if (this.solid) return this.crash();
          nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS;
        }
        s.fx.ring(cx(hit.x), cy(hit.y), { color: '#fb923c', radius: 40 });
        s.sound.play('gem', 3);
        s.unlock('portal');
      }
    }
    if (!this.bonus) {
      if (this.obstacles.has(ny * COLS + nx)) return this.crash(nx, ny);
      const checkLen = this.snake.length - (this.grow > 0 ? 0 : 1);
      for (let i = 0; i < checkLen; i++) if (this.snake[i].x === nx && this.snake[i].y === ny) return this.crash(nx, ny);
      if (this.sparks.some((sp) => sp.x === nx && sp.y === ny)) return this.crash(nx, ny);
    }

    this.snake.unshift({ x: nx, y: ny });
    if (this.grow > 0) this.grow--; else this.snake.pop();

    // Eat things
    const fi = this.foods.findIndex((f) => f.x === nx && f.y === ny);
    if (fi >= 0) {
      const f = this.foods.splice(fi, 1)[0];
      const color = `hsl(${f.hue} 95% 65%)`;
      const pts = (f.pts || 10) * this.level;
      s.award(pts, cx(nx), cy(ny) - 10, { chain: true, color, size: f.type === 'star' ? 26 : undefined });
      s.sound.play('eat', s.comboCount);
      s.fx.burst(cx(nx), cy(ny), { color, count: 18, speed: 200 });
      this.grow += 1;
      this.eaten++;
      if (this.eaten >= this.need) return s.completeLevel();
      this.spawnFood();
      if (this.level >= 2 && !this.golden && s.rng.chance(0.3)) {
        const c = this.freeCell({ min: 4 });
        this.golden = { ...c, ttl: 6, max: 6 };
      }
    }
    if (this.golden && this.golden.x === nx && this.golden.y === ny) {
      s.award(50 * this.level, cx(nx), cy(ny) - 10, { chain: true, color: '#fbbf24', size: 26 });
      s.sound.play('golden');
      s.fx.burst(cx(nx), cy(ny), { colors: ['#fbbf24', '#fde68a', '#fff'], count: 34, speed: 280 });
      s.fx.ring(cx(nx), cy(ny), { color: '#fbbf24', radius: 60 });
      s.unlock('golden');
      this.grow += 1;
      this.golden = null;
    }
    const gi = this.gems.findIndex((g) => g.x === nx && g.y === ny);
    if (gi >= 0) {
      const g = this.gems.splice(gi, 1)[0];
      const color = `hsl(${g.hue} 95% 70%)`;
      s.award(20 * this.level, cx(nx), cy(ny) - 10, { chain: true, color });
      s.sound.play('gem', this.gemsEaten);
      s.fx.burst(cx(nx), cy(ny), { color, count: 14, speed: 180 });
      this.gemsEaten++;
      if (this.gemsEaten >= 15) s.unlock('feast');
      this.spawnGem();
    }
  }

  /** Back to the starting lane after a crash — food eaten this level still counts. */
  onLifeLost() {
    const my = Math.floor(ROWS / 2);
    this.dead = false; this.moveT = 0; this.grow = 0;
    this.snake = [{ x: 5, y: my }, { x: 4, y: my }, { x: 3, y: my }, { x: 2, y: my }];
    this.dir = 'right'; this.queue = [];
    const onBody = (p) => this.snake.some((q) => q.x === p.x && q.y === p.y);
    // anything that landed on the fresh snake, and any spark close to its head, gets moved somewhere safe
    this.foods = this.foods.map((f) => (onBody(f) ? { ...f, ...this.freeCell() } : f));
    this.gems = this.gems.map((g) => (onBody(g) ? { ...g, ...this.freeCell() } : g));
    if (this.golden && onBody(this.golden)) this.golden = { ...this.golden, ...this.freeCell() };
    for (const sp of this.sparks) {
      if (Math.abs(sp.x - 5) + Math.abs(sp.y - my) < 8) { const c = this.freeCell({ farFrom: this.snake[0], min: 8 }); sp.x = c.x; sp.y = c.y; }
    }
  }

  crash() {
    this.dead = true;
    const h = this.snake[0];
    this.s.fx.burst(cx(h.x), cy(h.y), { colors: ['#f472b6', '#22d3ee', '#fff'], count: 60, speed: 320, life: 0.9 });
    this.s.hurt();
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const t = this.t;
    // background
    if (this.bonus) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.8);
      g.addColorStop(0, '#3b1a5c'); g.addColorStop(1, '#120826');
      ctx.fillStyle = g;
    } else ctx.fillStyle = '#070716';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = this.bonus ? 'rgba(251,191,36,.08)' : 'rgba(99,102,241,.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * CELL + 0.5, TOP); ctx.lineTo(x * CELL + 0.5, H); }
    for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, TOP + y * CELL + 0.5); ctx.lineTo(W, TOP + y * CELL + 0.5); }
    ctx.stroke();

    // border
    ctx.save();
    if (this.solid) {
      ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 4; ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 14;
    } else {
      ctx.strokeStyle = 'rgba(34,211,238,.45)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 20;
    }
    ctx.strokeRect(2, TOP + 2, W - 4, H - TOP - 4);
    ctx.restore();

    // obstacles — fixed for the whole level, so painted once into a cached layer
    if (this.obstacles.size) this.s.layer(ctx, `obs|${this.level}|${this.bonus}`, (c) => {
      c.shadowColor = '#a78bfa'; c.shadowBlur = 10;
      for (const k of this.obstacles) {
        const x = (k % COLS) * CELL, y = TOP + Math.floor(k / COLS) * CELL;
        const g = c.createLinearGradient(x, y, x + CELL, y + CELL);
        g.addColorStop(0, '#7c3aed'); g.addColorStop(1, '#4c1d95');
        c.fillStyle = g; roundRect(c, x + 2, y + 2, CELL - 4, CELL - 4, 6); c.fill();
        c.strokeStyle = '#c4b5fd'; c.lineWidth = 1.5; c.stroke();
      }
    });

    // portals
    if (this.portals) this.portals.forEach((p, i) => {
      const color = i ? '#fb923c' : '#60a5fa';
      ctx.save(); ctx.translate(cx(p.x), cy(p.y));
      ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.strokeStyle = color; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.arc(0, 0, 5 + k * 4.5, t * (3 + k) * (k % 2 ? -1 : 1), t * (3 + k) * (k % 2 ? -1 : 1) + Math.PI * 1.3); ctx.stroke();
      }
      ctx.restore();
    });

    // food
    for (const f of this.foods) {
      const pulse = 1 + Math.sin(t * 6 + f.hue) * 0.12;
      const born = Math.max(0, Math.min(1, (t - f.born) * 5));
      const fr = Math.max(1.5, CELL * 0.33 * pulse * born);
      const hcol = `hsl(${f.hue} 95% 60%)`;
      ctx.save(); ctx.translate(cx(f.x), cy(f.y));
      ctx.shadowColor = hcol; ctx.shadowBlur = 18;
      if (f.type === 'star') {
        // Star fruit: golden star shape, pulsing faster
        ctx.rotate(t * 2); ctx.fillStyle = `hsl(${f.hue} 95% 65%)`;
        star(ctx, 5, fr * 1.15, fr * 0.48); ctx.fill();
        // small glow ring
        ctx.shadowBlur = 24; ctx.strokeStyle = `hsl(${f.hue} 100% 80%)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, fr * 1.3, 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'berry') {
        // Berry: cluster of 3 small circles
        ctx.shadowBlur = 14;
        const rr = fr * 0.62;
        const berryColors = [`hsl(${f.hue} 95% 65%)`, `hsl(${(f.hue+35)%360} 95% 65%)`, `hsl(${(f.hue+70)%360} 95% 60%)`];
        for (let b = 0; b < 3; b++) {
          const ba = (b / 3) * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = berryColors[b];
          ctx.beginPath(); ctx.arc(Math.cos(ba) * rr * 0.75, Math.sin(ba) * rr * 0.75, rr, 0, Math.PI * 2); ctx.fill();
        }
        // stem
        ctx.shadowBlur = 0; ctx.fillStyle = '#4ade80';
        ctx.beginPath(); ctx.ellipse(fr * 0.2, -fr * 1.2, fr * 0.35, fr * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // Normal fruit: glowing circle
        const g = ctx.createRadialGradient(-fr / 3, -fr / 3, 1, 0, 0, fr);
        g.addColorStop(0, '#fff'); g.addColorStop(0.35, `hsl(${f.hue} 95% 70%)`); g.addColorStop(1, `hsl(${f.hue} 90% 45%)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, fr, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#4ade80';
        ctx.beginPath(); ctx.ellipse(fr * 0.35, -fr * 1.05, fr * 0.45, fr * 0.22, -0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // golden fruit
    if (this.golden) {
      const gd = this.golden;
      ctx.save(); ctx.translate(cx(gd.x), cy(gd.y));
      ctx.strokeStyle = 'rgba(251,191,36,.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, CELL * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (gd.ttl / gd.max)); ctx.stroke();
      ctx.rotate(t * 2);
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20; ctx.fillStyle = gd.ttl < 1.5 && Math.floor(t * 8) % 2 ? '#fde68a' : '#fbbf24';
      star(ctx, 5, CELL * 0.45, CELL * 0.2); ctx.fill();
      ctx.restore();
    }

    // gems (bonus)
    for (const g of this.gems) {
      const born = Math.max(0.05, Math.min(1, (t - g.born) * 5));
      const r = CELL * 0.38 * born;
      ctx.save(); ctx.translate(cx(g.x), cy(g.y) + Math.sin(t * 4 + g.hue) * 2);
      ctx.shadowColor = `hsl(${g.hue} 95% 60%)`; ctx.shadowBlur = 16;
      ctx.fillStyle = `hsl(${g.hue} 95% 62%)`;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // sparks
    for (const sp of this.sparks) {
      ctx.save(); ctx.translate(cx(sp.x), cy(sp.y)); ctx.rotate(t * 8);
      ctx.shadowColor = '#fde047'; ctx.shadowBlur = 18; ctx.fillStyle = '#fde047';
      star(ctx, 6, CELL * 0.45 + Math.sin(t * 30) * 2, CELL * 0.15); ctx.fill();
      ctx.restore();
    }

    // snake
    const n = this.snake.length;
    ctx.save();
    for (let i = n - 1; i >= 0; i--) {
      const p = this.snake[i];
      const hue = (t * 70 + i * 14) % 360;
      const color = this.dead ? `hsl(0 0% ${40 + (i % 2) * 8}%)`
        : this.s.gold ? `hsl(${44 + Math.sin(t * 4 - i * 0.5) * 6} 95% ${52 + Math.sin(t * 5 - i * 0.7) * 14}%)` // ✨ Legend: golden snake
        : `hsl(${hue} 95% 60%)`;
      const inset = i === 0 ? 1.5 : 2.5 + Math.min(3, i * 0.15);
      // glow only near the head — a long snake was one shadowBlur pass per segment per frame
      ctx.shadowColor = color; ctx.shadowBlur = this.dead || i >= 6 ? 0 : 12;
      ctx.fillStyle = color;
      roundRect(ctx, p.x * CELL + inset, TOP + p.y * CELL + inset, CELL - inset * 2, CELL - inset * 2, i === 0 ? 9 : 7);
      ctx.fill();
    }
    ctx.restore();
    // eyes
    const h = this.snake[0];
    if (h) {
      const [dx, dy] = DIRS[this.dir];
      const ex = cx(h.x) + dx * 5, ey = cy(h.y) + dy * 5;
      const px = -dy * 6, py = dx * 6;
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + px * sgn, ey + py * sgn, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b0b1a';
        if (this.dead) { ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('x', ex + px * sgn, ey + py * sgn); }
        else { ctx.beginPath(); ctx.arc(ex + px * sgn + dx * 1.6, ey + py * sgn + dy * 1.6, 2.1, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    // top strip
    ctx.fillStyle = 'rgba(7,7,22,.9)'; ctx.fillRect(0, 0, W, TOP);
    if (this.bonus) {
      progressBar(ctx, 14, 10, W - 28, 20, this.s.bonusLeft / 15, '#fbbf24', `★ BONUS · ${this.gemsEaten} gems · ${Math.ceil(this.s.bonusLeft)}s`);
    } else {
      progressBar(ctx, 14, 10, W - 28, 20, this.eaten / this.need, '#22d3ee', `Fruit ${this.eaten} / ${this.need}`);
    }
    this.drawPad(ctx);
  }
}

function star(ctx, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

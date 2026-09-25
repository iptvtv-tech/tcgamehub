// ─────────────────────────────────────────────────────────────
//  PRISM BREAKER — brick breaker with combos and power-ups
//  L1-2  few rows, slow ball          L3  tough bricks (2 hits)
//  L4    fire-ball power-up           L5  ★ bonus: piñata party (can't lose the ball)
//  L6    steel bricks (unbreakable)   L7  explosive bricks
//  L8+   3-hit bricks, more rows, faster ball
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const W = 480, H = 720, TOP = 44;
const COLS = 8, BW = 51, BH = 22, GAP = 5, BX0 = (W - (COLS * BW + (COLS - 1) * GAP)) / 2, BY0 = TOP + 40;
const PY = 668, PH = 14, BALL_R = 7;

const POWERS = {
  wide:  { label: 'W', color: '#22d3ee', name: 'Wide paddle' },
  multi: { label: 'M', color: '#a78bfa', name: 'Multi-ball' },
  slow:  { label: 'S', color: '#4ade80', name: 'Slow-mo' },
  fire:  { label: 'F', color: '#fb923c', name: 'Fire ball' },
  life:  { label: '♥', color: '#fb7185', name: 'Extra life' },
};

const INVADER = ['..#..#..', '...##...', '..####..', '.##..##.', '########', '#.####.#', '#.#..#.#', '...##...'];
const HEART = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
const PATTERNS = {
  full: () => true,
  pyramid: (c, r, rows) => Math.abs(c - 3.5) <= (r + 1) * (4 / rows) + 0.1,
  checker: (c, r) => (c + r) % 2 === 0,
  stripes: (c, r) => r % 2 === 0,
  diamond: (c, r, rows) => Math.abs(c - 3.5) / 4 + Math.abs(r - (rows - 1) / 2) / (rows / 2) <= 1.05,
  frame: (c, r, rows) => r === 0 || r === rows - 1 || c === 0 || c === COLS - 1 || (r === Math.floor(rows / 2) && c > 1 && c < 6),
  columns: (c) => c % 3 !== 2,
  zigzag: (c, r) => (r + Math.floor(c / 2)) % 3 !== 0,
  invader: (c, r) => INVADER[r]?.[c] === '#',
  heart: (c, r) => HEART[r]?.[c] === '#',
};

runGame({
  id: 'prism-breaker',
  width: W,
  height: H,
  lives: 3,
  comboWindow: 0,   // combo lasts until the ball touches the paddle
  comboStep: 4,
  maxMultiplier: 6,
  bonusTime: 20,
  music: { bpm: 104, style: 'dream', lead: 'square' },
  levelInfo(level, bonus) {
    if (bonus) return 'Piñata party! The floor is shielded — smash the gold!';
    const notes = {
      1: 'Move with mouse, finger or ← →. Tap / Space to launch.',
      2: 'Catch falling capsules for power-ups!',
      3: 'Dark bricks need two hits.',
      4: 'Look out for the Fire ball power-up.',
      6: 'Steel bricks can\'t be broken — bounce around them.',
      7: 'Explosive bricks blow up their neighbours!',
    };
    return notes[level] || 'Clear every brick!';
  },
  create: (shell) => new PrismBreaker(shell),
});

class PrismBreaker {
  constructor(s) {
    this.s = s; this.t = 0;
    this.bg = Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 20 + 8, r: Math.random() * 1.5 + 0.3 }));
    this.paddle = { x: W / 2, w: 96, target: W / 2 };
    this.startLevel(1, false);
  }

  reset() { this.paddle.x = this.paddle.target = W / 2; }

  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.baseSpeed = 330 * s.speed(0.06, 1.9, level);
    this.bricks = [];
    this.caps = [];
    this.wideT = 0; this.slowT = 0; this.fireT = 0;
    this.lostThisLevel = false;
    this.idleLaunch = 4;

    if (bonus) {
      const rows = 6;
      for (let row = 0; row < rows; row++) for (let c = 0; c < COLS; c++) this.addBrick(c, row, 'gold', 1, 45);
    } else {
      const rows = Math.min(10, 4 + Math.floor(level / 2));
      const names = Object.keys(PATTERNS).filter((k) => k !== 'full');
      const pat = level === 1 ? 'full' : level === 2 ? 'pyramid' : r.pick(names);
      const fn = PATTERNS[pat];
      const usedRows = pat === 'invader' ? INVADER.length : pat === 'heart' ? HEART.length : rows;
      const toughP = level >= 3 ? Math.min(0.45, 0.12 + (level - 3) * 0.05) : 0;
      const boomP = level >= 7 ? 0.07 : 0;
      for (let row = 0; row < usedRows; row++) {
        for (let c = 0; c < COLS; c++) {
          if (!fn(c, row, usedRows)) continue;
          const hue = (row * 360 / usedRows + level * 25) % 360;
          if (r.chance(boomP)) this.addBrick(c, row, 'boom', 1, hue);
          else if (r.chance(toughP)) this.addBrick(c, row, 'tough', level >= 8 && r.chance(0.35) ? 3 : 2, hue);
          else this.addBrick(c, row, 'normal', 1, hue);
        }
      }
      if (level >= 6) {
        const n = Math.min(6, level - 5);
        const pool = this.bricks.filter((b) => b.type === 'normal');
        for (let i = 0; i < n && pool.length > 4; i++) {
          const b = pool.splice(r.int(0, pool.length - 1), 1)[0];
          b.type = 'steel'; b.hp = b.maxHp = Infinity;
        }
      }
    }
    this.total = this.breakable();
    this.balls = [this.newBall()];
  }

  addBrick(c, row, type, hp, hue) {
    this.bricks.push({ x: BX0 + c * (BW + GAP), y: BY0 + row * (BH + GAP), w: BW, h: BH, type, hp, maxHp: hp, hue, alive: true, flash: 0 });
  }
  breakable() { return this.bricks.filter((b) => b.alive && b.type !== 'steel').length; }
  newBall() { return { x: this.paddle.x, y: PY - BALL_R - 1, vx: 0, vy: 0, stuck: true, trail: [] }; }
  get pw() { return this.wideT > 0 ? 150 : 96; }
  get speedMul() { return this.slowT > 0 ? 0.65 : 1; }

  // ── Input ──────────────────────────────────────────────────
  onAction(a) {
    if (a === 'action' || a === 'tap' || a === 'up') this.launch();
  }
  onPointerMove(x) { this.paddle.target = x; this.pointerMode = true; }

  launch() {
    let any = false;
    for (const b of this.balls) {
      if (!b.stuck) continue;
      any = true;
      const a = (this.s.rng.range(-0.35, 0.35));
      b.stuck = false;
      b.vx = Math.sin(a) * this.baseSpeed; b.vy = -Math.cos(a) * this.baseSpeed;
    }
    if (any) {
      this.s.sound.play('bounce', 7);
      if (this.bonus && this.balls.length === 1) this.spawnMulti(2);
    }
  }

  spawnMulti(n) {
    const src = this.balls.find((b) => !b.stuck) || this.balls[0];
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(src.vx, src.vy) || this.baseSpeed;
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7 + 0.35;
      this.balls.push({ x: src.x, y: src.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, stuck: false, trail: [] });
    }
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; }

  update(dt) {
    const s = this.s, p = this.paddle;
    this.t += dt;
    this.wideT = Math.max(0, this.wideT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.fireT = Math.max(0, this.fireT - dt);

    // Paddle
    if (s.input.isDown('left')) { p.target = p.x - 720 * dt; this.pointerMode = false; }
    if (s.input.isDown('right')) { p.target = p.x + 720 * dt; this.pointerMode = false; }
    const half = this.pw / 2;
    p.target = clamp(p.target, half, W - half);
    p.x += (p.target - p.x) * Math.min(1, dt * (this.pointerMode ? 25 : 60));
    p.x = clamp(p.x, half, W - half);

    // Auto-launch if the player waits
    if (this.balls.some((b) => b.stuck)) { this.idleLaunch -= dt; if (this.idleLaunch <= 0) { this.launch(); this.idleLaunch = 4; } }

    // Balls
    for (const b of this.balls) {
      if (b.stuck) { b.x = p.x; b.y = PY - BALL_R - 1; continue; }
      b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
      const m = this.speedMul;
      b.x += b.vx * dt * m; b.y += b.vy * dt * m;
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); this.wallBounce(b); }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); this.wallBounce(b); }
      if (b.y < TOP + BALL_R) { b.y = TOP + BALL_R; b.vy = Math.abs(b.vy); this.wallBounce(b); }

      // Paddle
      if (b.vy > 0 && b.y + BALL_R >= PY && b.y - BALL_R <= PY + PH && b.x >= p.x - half - BALL_R && b.x <= p.x + half + BALL_R) {
        const off = clamp((b.x - p.x) / half, -1, 1);
        const a = off * 1.05;
        const sp = Math.min(this.baseSpeed * 1.2, Math.hypot(b.vx, b.vy) * 1.01);
        b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
        b.y = PY - BALL_R;
        s.resetCombo();
        s.sound.play('bounce');
        s.fx.burst(b.x, PY, { color: '#f0abfc', count: 5, speed: 90, life: 0.3, angle: -Math.PI / 2, spread: 2 });
      }
      // Floor
      if (this.bonus && b.y + BALL_R > PY + 34) { b.y = PY + 34 - BALL_R; b.vy = -Math.abs(b.vy); s.sound.play('bounce', 3); }
      if (b.y - BALL_R > H) b.lost = true;

      // Bricks
      const fire = this.fireT > 0;
      for (const br of this.bricks) {
        if (!br.alive) continue;
        const nx = clamp(b.x, br.x, br.x + br.w), ny = clamp(b.y, br.y, br.y + br.h);
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
        if (fire && br.type !== 'steel') { this.hitBrick(br, true); continue; }
        if (dx === 0 && dy === 0) { b.vy = -b.vy; }
        else if (Math.abs(dx) > Math.abs(dy)) { b.vx = Math.sign(dx) * Math.abs(b.vx); b.x = nx + Math.sign(dx) * BALL_R; }
        else { b.vy = Math.sign(dy) * Math.abs(b.vy); b.y = ny + Math.sign(dy) * BALL_R; }
        this.hitBrick(br);
        break;
      }
      // Never let the ball get stuck travelling almost horizontally
      const sp = Math.hypot(b.vx, b.vy);
      if (Math.abs(b.vy) < sp * 0.28) { b.vy = Math.sign(b.vy || -1) * sp * 0.28; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }
    }
    if (s.state !== 'playing') return;
    this.balls = this.balls.filter((b) => !b.lost);
    if (this.balls.length === 0) {
      this.lostThisLevel = true;
      s.fx.flash('#fb7185', 0.25);
      s.hurt();
      return;
    }

    // Power-up capsules
    for (const c of this.caps) {
      c.y += 170 * dt;
      if (c.y + 10 >= PY && c.y - 10 <= PY + PH && Math.abs(c.x - p.x) < half + 18) { c.got = true; this.power(c.type); }
    }
    this.caps = this.caps.filter((c) => !c.got && c.y < H + 20);
    for (const br of this.bricks) br.flash = Math.max(0, br.flash - dt * 4);
  }

  wallBounce(b) {
    // A tiny random nudge stops endless loops between walls and steel bricks
    const a = (Math.random() - 0.5) * 0.06, c = Math.cos(a), sn = Math.sin(a);
    const vx = b.vx * c - b.vy * sn, vy = b.vx * sn + b.vy * c;
    b.vx = vx; b.vy = vy;
    this.s.sound.play('bounce', -5);
  }

  hitBrick(br, fire = false) {
    const s = this.s, L = this.level;
    const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
    if (br.type === 'steel') {
      br.flash = 1; s.sound.play('metal');
      s.fx.burst(cx, cy, { color: '#e2e8f0', count: 5, speed: 100, life: 0.25 });
      return;
    }
    br.hp -= fire ? br.hp : 1;
    if (br.hp > 0) {
      br.flash = 1; s.sound.play('brick', 0);
      s.fx.burst(cx, cy, { color: `hsl(${br.hue} 80% 70%)`, count: 6, speed: 90, life: 0.3 });
      return;
    }
    this.destroy(br);
  }

  destroy(br) {
    const s = this.s, L = this.level;
    if (!br.alive) return;
    br.alive = false;
    const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
    const base = br.type === 'gold' ? 30 : br.type === 'tough' ? 20 : br.type === 'boom' ? 25 : 10;
    const color = br.type === 'gold' ? '#fbbf24' : `hsl(${br.hue} 95% 65%)`;
    s.award(base * L, cx, cy, { chain: true, color, size: 16 });
    if (s.comboCount >= 10) s.unlock('chain10');
    s.sound.play(br.type === 'gold' ? 'coin' : 'brick', Math.min(18, s.comboCount));
    s.fx.burst(cx, cy, { colors: [color, '#fff'], count: 14, speed: 180, life: 0.5, gravity: 300 });

    if (br.type === 'boom') {
      s.sound.play('boom'); s.fx.shake(9, 0.3); s.fx.ring(cx, cy, { color: '#fb923c', radius: 90, width: 6 });
      s.fx.burst(cx, cy, { colors: ['#fb923c', '#fde047', '#ef4444'], count: 40, speed: 320, life: 0.7 });
      s.unlock('boom');
      for (const o of this.bricks) {
        if (!o.alive || o.type === 'steel') continue;
        if (Math.abs(o.x - br.x) <= BW + GAP + 1 && Math.abs(o.y - br.y) <= BH + GAP + 1) this.destroy(o);
      }
    }
    // Power-up drop
    if (!this.bonus && s.rng.chance(0.13)) {
      const pool = ['wide', 'wide', 'wide', 'slow', 'slow'];
      if (L >= 2) pool.push('multi', 'multi');
      if (L >= 4) pool.push('fire');
      if (L >= 3 && s.rng.chance(0.3)) pool.push('life');
      this.caps.push({ x: cx, y: cy, type: s.rng.pick(pool) });
    }
    if (this.breakable() === 0) {
      if (this.bonus) s.award(500 * L, W / 2, H * 0.6, { color: '#fbbf24', size: 30 });
      s.completeLevel();
    }
  }

  power(type) {
    const s = this.s, p = this.paddle;
    s.sound.play(type === 'life' ? 'life' : 'powerup');
    s.fx.text(p.x, PY - 30, POWERS[type].name + '!', { color: POWERS[type].color, size: 18 });
    s.fx.ring(p.x, PY, { color: POWERS[type].color, radius: 60 });
    if (type === 'wide') this.wideT = 12;
    if (type === 'slow') this.slowT = 8;
    if (type === 'fire') this.fireT = 7;
    if (type === 'life') { s.lives = Math.min(5, s.lives + 1); s.updateHud(); }
    if (type === 'multi') { this.spawnMulti(2); s.unlock('multi'); }
  }

  onLevelClear() {
    if (!this.bonus && this.level >= 3 && !this.lostThisLevel) this.s.unlock('flawless');
    for (const b of this.balls) { b.vx *= 0.2; b.vy *= 0.2; }
  }
  onLifeLost() {
    this.balls = [this.newBall()];
    this.caps = []; this.wideT = this.slowT = this.fireT = 0;
    this.idleLaunch = 4;
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const t = this.t;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#451a03'); g.addColorStop(1, '#1c0a00'); }
    else { g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#0b0b1a'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = this.bonus ? '#fbbf24' : '#c7d2fe';
    for (const st of this.bg) {
      const y = (st.y + t * st.s) % H;
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(st.x, y, st.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bricks
    for (const br of this.bricks) if (br.alive) this.drawBrick(ctx, br, t);

    // Capsules
    for (const c of this.caps) {
      const pw = POWERS[c.type];
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.shadowColor = pw.color; ctx.shadowBlur = 14;
      ctx.fillStyle = pw.color; roundRect(ctx, -18, -10, 36, 20, 10); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, -14, -8, 28, 6, 3); ctx.fill();
      ctx.fillStyle = '#0b0b1a'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pw.label, 0, 1);
      ctx.restore();
    }

    // Floor shield (bonus)
    if (this.bonus) {
      ctx.save(); ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16; ctx.strokeStyle = `rgba(251,191,36,${0.6 + Math.sin(t * 6) * 0.3})`;
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, PY + 34); ctx.lineTo(W, PY + 34); ctx.stroke(); ctx.restore();
    }

    // Paddle
    const p = this.paddle, pw = this.pw;
    ctx.save();
    const pg = ctx.createLinearGradient(p.x - pw / 2, 0, p.x + pw / 2, 0);
    pg.addColorStop(0, '#f472b6'); pg.addColorStop(0.5, '#a78bfa'); pg.addColorStop(1, '#22d3ee');
    ctx.shadowColor = this.fireT > 0 ? '#fb923c' : '#c084fc'; ctx.shadowBlur = 20;
    ctx.fillStyle = pg; roundRect(ctx, p.x - pw / 2, PY, pw, PH, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.4)'; roundRect(ctx, p.x - pw / 2 + 6, PY + 2, pw - 12, 4, 2); ctx.fill();
    ctx.restore();

    // Balls
    const fire = this.fireT > 0;
    for (const b of this.balls) {
      b.trail.forEach(([x, y], i) => {
        ctx.globalAlpha = (i / b.trail.length) * 0.4;
        ctx.fillStyle = fire ? '#fb923c' : '#a5f3fc';
        ctx.beginPath(); ctx.arc(x, y, BALL_R * (i / b.trail.length), 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.save(); ctx.shadowColor = fire ? '#fb923c' : '#a5f3fc'; ctx.shadowBlur = 18;
      ctx.fillStyle = fire ? '#fed7aa' : '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, 7); ctx.fill(); ctx.restore();
    }

    // Launch hint
    if (this.balls.some((b) => b.stuck) && this.s.state === 'playing') {
      ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3;
      ctx.font = '700 20px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('Tap / Space to launch', W / 2, PY - 60); ctx.restore();
    }

    // Power timers
    let px = 14;
    for (const [k, v, max] of [['wide', this.wideT, 12], ['slow', this.slowT, 8], ['fire', this.fireT, 7]]) {
      if (v <= 0) continue;
      progressBar(ctx, px, H - 18, 70, 10, v / max, POWERS[k].color);
      px += 80;
    }

    // Top strip
    ctx.fillStyle = 'rgba(11,11,26,.85)'; ctx.fillRect(0, 0, W, TOP);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, this.s.bonusLeft / 20, '#fbbf24', `★ PIÑATA PARTY · ${Math.ceil(this.s.bonusLeft)}s`);
    else { const left = this.breakable(); progressBar(ctx, 14, 12, W - 28, 20, 1 - left / this.total, '#f472b6', `Bricks left: ${left}`); }
  }

  drawBrick(ctx, br, t) {
    const { x, y, w, h } = br;
    ctx.save();
    let top, bot;
    if (br.type === 'steel') { top = '#e2e8f0'; bot = '#64748b'; }
    else if (br.type === 'gold') { top = '#fde68a'; bot = '#d97706'; }
    else if (br.type === 'boom') { const k = 0.5 + Math.sin(t * 8) * 0.5; top = `rgb(255,${120 + k * 80},60)`; bot = '#b91c1c'; }
    else if (br.type === 'tough') { const l = 30 + (br.hp / br.maxHp) * 12; top = `hsl(${br.hue} 70% ${l + 15}%)`; bot = `hsl(${br.hue} 75% ${l - 8}%)`; }
    else { top = `hsl(${br.hue} 95% 70%)`; bot = `hsl(${br.hue} 85% 48%)`; }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.shadowColor = br.type === 'steel' ? 'transparent' : bot; ctx.shadowBlur = 8;
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 5); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, x + 4, y + 3, w - 8, 4, 2); ctx.fill();
    if (br.flash > 0) { ctx.globalAlpha = br.flash; ctx.fillStyle = '#fff'; roundRect(ctx, x, y, w, h, 5); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (br.type === 'steel') { ctx.fillStyle = '#475569'; for (const dx of [6, w - 6]) { ctx.beginPath(); ctx.arc(x + dx, y + h / 2, 2, 0, 7); ctx.fill(); } }
    if (br.type === 'boom') { ctx.fillStyle = '#fff'; ctx.fillText('✸', x + w / 2, y + h / 2 + 1); }
    if (br.type === 'gold') { ctx.fillStyle = '#92400e'; ctx.fillText('$', x + w / 2, y + h / 2 + 1); }
    if (br.type === 'tough' && br.hp < br.maxHp) {
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.45, y + h * 0.5); ctx.lineTo(x + w * 0.38, y + h);
      if (br.maxHp - br.hp > 1) { ctx.moveTo(x + w * 0.7, y); ctx.lineTo(x + w * 0.6, y + h * 0.6); ctx.lineTo(x + w * 0.72, y + h); }
      ctx.stroke();
    } else if (br.type === 'tough') { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(br.hp, x + w / 2, y + h / 2 + 1); }
    ctx.restore();
  }
}

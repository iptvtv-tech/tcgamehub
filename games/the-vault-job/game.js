// ─────────────────────────────────────────────────────────────
//  THE VAULT JOB — a stealth heist through a museum at night.
//  15 levels (+ bonus rounds on 5 and 10). Finish all 15 from level 1 without
//  losing a life and a secret 16th level opens: THE VAULT… and what's inside.
//  This is a "Legend game" — see assets/js/legends.js.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar } from '../../assets/js/engine.js';
import { LEVELS, giftShop } from './levels.js';
import { TICK, PLAYER_EVERY, COLS, ROWS, DIRS, parseLevel, walkable, isHide, watcherAt, laserOn, vision, caught } from './sim.js';

const T = 32, W = COLS * T, TOP = 44, OY = TOP + 4, H = OY + ROWS * T + 4;
const cx = (x) => x * T + T / 2;
const cy = (y) => OY + y * T + T / 2;
const S = (b) => atob(b); // a few secrets are stored scrambled so a quick peek at the code doesn't spoil them
const EGG_TEXT = S('VEMgTEVHRU5EUw=='); // engraved around the egg

const levelDef = (level) => (level === 5 || level === 10 ? giftShop(level) : LEVELS[level]);

const THEMES = [
  { floor: ['#1e293b', '#233246'], wall: '#334155', top: '#526076', glow: '#22d3ee' },   // 1–4  the lobby
  { floor: ['#221a33', '#291f3e'], wall: '#3b2f5c', top: '#5b4a88', glow: '#a78bfa' },   // 6–9  east wing
  { floor: ['#2a1a1c', '#321f22'], wall: '#4a2626', top: '#6b3737', glow: '#fb7185' },   // 11–15 private collection
];
const VAULT_THEME = { floor: ['#1c1606', '#241d09'], wall: '#4a3a0e', top: '#7a6118', glow: '#fbbf24' };
const SHOP_THEME = { floor: ['#12303a', '#163844'], wall: '#1f4d5c', top: '#2f6f82', glow: '#fde047' };

runGame({
  id: 'the-vault-job',
  width: W,
  height: H,
  lives: 3,
  finalLevel: 15,
  secretLevel: 16,
  bonusLevels: [5, 10],
  bonusTime: 15,
  comboWindow: 4,
  comboStep: 2,
  maxMultiplier: 5,
  music: { bpm: 88, style: 'dream', lead: 'triangle' },
  winTitle: 'You escaped!',
  titleHint: 'Legends say a flawless thief finds something special…',
  sealedHint: 'The vault stays sealed… perhaps a more careful thief?',
  sealedHintCheckpoint: 'Legends say the vault only opens for thieves who start at the very beginning…',
  secretTitle: `★ ${S('VEhFIFZBVUxU')} ★`,
  legendBadge: 'egg',
  legendRevealDelay: 7.5,
  levelInfo(level, bonus) {
    const d = levelDef(level);
    return bonus ? d.tip : `${d.name} — ${d.tip}`;
  },
  create: (shell) => new VaultJob(shell),
});

class VaultJob {
  constructor(s) {
    this.s = s; this.t = 0;
    this.startLevel(1, false);
  }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus; this.secret = level === 16;
    this.def = levelDef(level);
    this.L = parseLevel(this.def);
    this.grid = this.L.grid.map((r) => r.slice());
    this.theme = this.secret ? VAULT_THEME : bonus ? SHOP_THEME : THEMES[Math.min(2, Math.floor((level - 1) / 5))];
    this.tick = 0; this.acc = 0; this.cool = 0; this.queue = null;
    const [sx, sy] = this.L.start;
    this.p = { x: sx, y: sy, fx: sx, fy: sy, k: 1, face: 'up' };
    this.taken = 0; this.total = this.L.treasures.length;
    this.alarm = null; this.finale = null; this.shadowDone = false;
    this.exhibits = {};
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a) { if (DIRS[a]) this.queue = a; }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) {
    this.t += dt;
    if (this.finale) this.updateFinale(dt);
  }

  update(dt) {
    this.t += dt;
    this.p.k = Math.min(1, this.p.k + dt / (TICK * PLAYER_EVERY));
    if (this.alarm) {
      this.alarm.t += dt;
      if (this.secret && this.alarm.t > 1.4) this.resetToStart(); // in the vault you just start the room again
      return;
    }
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.step();
      if (this.s.state !== 'playing' || this.alarm || this.finale) break;
    }
  }

  step() {
    const s = this.s, p = this.p, L = this.L;
    this.tick++;
    if (this.cool > 0) this.cool--;
    let dir = this.queue;
    if (!dir) for (const d of ['up', 'down', 'left', 'right']) if (s.input.isDown(d)) dir = d;
    let prev = null;
    if (dir && this.cool === 0) {
      this.queue = null;
      p.face = dir;
      const [dx, dy] = DIRS[dir];
      const nx = p.x + dx, ny = p.y + dy;
      if (walkable(L, nx, ny)) {
        prev = [p.x, p.y];
        p.fx = p.x; p.fy = p.y; p.x = nx; p.y = ny; p.k = 0;
        this.cool = PLAYER_EVERY;
        s.sound.tone({ freq: 180 + Math.random() * 30, dur: 0.035, type: 'triangle', vol: 0.05 });
        this.arrive();
        if (this.finale || s.state !== 'playing') return;
      }
    }
    if (this.bonus) return;
    const who = caught(L, this.tick, p.x, p.y, prev);
    if (who) return this.getCaught(who);
    // "In the Shadows": hidden while a guard is right next to you
    if (!this.shadowDone && isHide(L, p.x, p.y)) {
      for (const w of L.watchers) {
        if (w.type === 'camera') continue;
        const st = watcherAt(w, this.tick);
        if (Math.abs(st.x - p.x) + Math.abs(st.y - p.y) === 1) { this.shadowDone = true; s.unlock('shadow'); s.fx.text(cx(p.x), cy(p.y) - 22, 'Shhh…', { color: '#a3e635', size: 16 }); break; }
      }
    }
  }

  arrive() {
    const s = this.s, p = this.p, ch = this.grid[p.y][p.x];
    if (ch === '$') {
      this.grid[p.y][p.x] = '.';
      this.taken++;
      s.award((this.secret ? 250 : 100) * this.level, cx(p.x), cy(p.y) - 18, { chain: true, color: '#fde047', size: 20 });
      s.sound.play('golden');
      s.fx.burst(cx(p.x), cy(p.y), { colors: ['#fde047', '#fff', '#fbbf24'], count: 22, speed: 180, life: 0.6 });
      if (this.taken === this.total && this.total > 1 && !this.bonus) { s.unlock('greedy'); s.fx.text(W / 2, H * 0.3, 'CLEAN SWEEP!', { color: '#fde047', size: 28 }); }
    } else if (ch === 'o') {
      this.grid[p.y][p.x] = '.';
      s.award(10 * this.level, cx(p.x), cy(p.y) - 14, { chain: true, color: '#fde047', size: 14 });
      s.sound.play('coin', Math.min(10, s.comboCount));
      s.fx.burst(cx(p.x), cy(p.y), { colors: ['#fde047', '#fff'], count: 6, speed: 100, life: 0.35 });
    } else if (ch === 'E' && !this.secret && !this.bonus) {
      if (this.level === 15) s.unlock('escape');
      s.sound.tone({ freq: 520, to: 1040, dur: 0.25, type: 'triangle', vol: 0.12 });
      s.completeLevel();
    } else if (ch === 'V' && this.secret) {
      this.startFinale();
    }
  }

  getCaught(who) {
    const s = this.s;
    this.alarm = { t: 0, who };
    for (let i = 0; i < 3; i++) s.sound.tone({ freq: 620, to: 1250, dur: 0.22, type: 'sawtooth', vol: 0.11, delay: i * 0.27 });
    s.fx.flash('#ef4444', 0.3);
    s.fx.text(cx(this.p.x), cy(this.p.y) - 26, who === 'laser' ? 'ALARM!' : 'CAUGHT!', { color: '#fb7185', size: 24, life: 1.2 });
    if (!this.secret) s.hurt();
  }

  resetToStart() {
    const [sx, sy] = this.L.start;
    Object.assign(this.p, { x: sx, y: sy, fx: sx, fy: sy, k: 1 });
    this.tick = 0; this.acc = 0; this.cool = 0; this.queue = null; this.alarm = null;
    if (this.secret) this.s.fx.text(W / 2, H * 0.45, 'Try again…', { color: '#fde68a', size: 24 });
  }
  onLifeLost() { this.resetToStart(); }

  // ── The finale ─────────────────────────────────────────────
  startFinale() {
    const s = this.s;
    this.finale = { t: 0, note: 0, nextNote: 1.4, sparkT: 0 };
    s.sound.noise({ dur: 0.6, vol: 0.35, freq: 6000, type: 'highpass' }); // glass
    s.sound.play('powerup');
    s.legendFound();
  }

  updateFinale(dt) {
    const f = this.finale, s = this.s;
    f.t += dt;
    // A little music box tune
    const tune = [76, 79, 84, 83, 79, 76, 74, 76, 79, 72, 74, 76, 79, 81, 79, 76];
    f.nextNote -= dt;
    if (f.nextNote <= 0) {
      const n = tune[f.note % tune.length];
      s.sound.tone({ freq: s.sound.note(n), dur: 1.1, type: 'sine', vol: 0.13 });
      s.sound.tone({ freq: s.sound.note(n + 12), dur: 0.5, type: 'triangle', vol: 0.03 });
      f.note++;
      f.nextNote = f.note % 4 === 3 ? 0.7 : 0.38;
    }
    f.sparkT -= dt;
    if (f.t > 2.2 && f.sparkT <= 0) {
      f.sparkT = 0.12;
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 50;
      s.fx.burst(W / 2 + Math.cos(a) * r, H * 0.3 + Math.sin(a) * r * 1.2, { colors: ['#fde68a', '#fff'], count: 2, speed: 30, life: 0.8, size: 3 });
    }
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const th = this.theme, t = this.t, L = this.L;
    ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, H);

    // Floor + walls
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = this.grid[y][x], X = x * T, Y = OY + y * T;
      if (ch === '#') {
        ctx.fillStyle = th.wall; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = th.top; ctx.fillRect(X, Y, T, 5);
        continue;
      }
      ctx.fillStyle = th.floor[(x + y) % 2]; ctx.fillRect(X, Y, T, T);
    }
    // Things on the floor
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = this.grid[y][x];
      if (ch === 'P') this.drawExhibit(ctx, x, y);
      else if (ch === 'H') this.drawHide(ctx, x, y);
      else if (ch === '$') this.drawTreasure(ctx, x, y, t);
      else if (ch === 'o') this.drawCoin(ctx, x, y, t);
      else if (ch === 'E') this.drawExit(ctx, x, y, t);
      else if (ch === 'V' && !this.finale) this.drawCase(ctx, cx(x), cy(y), 0.55, 0, t);
    }
    // Lasers
    for (const l of L.lasers) {
      const on = laserOn(l, this.tick);
      for (const [x, y] of l.tiles) {
        const vert = this.grid[y - 1]?.[x] === '=' || this.grid[y + 1]?.[x] === '=';
        const X = cx(x), Y = cy(y);
        ctx.save();
        if (on) { ctx.strokeStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10; ctx.lineWidth = 3; }
        else { ctx.strokeStyle = 'rgba(239,68,68,.25)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.5; }
        ctx.beginPath();
        if (vert) { ctx.moveTo(X, Y - T / 2); ctx.lineTo(X, Y + T / 2); } else { ctx.moveTo(X - T / 2, Y); ctx.lineTo(X + T / 2, Y); }
        ctx.stroke(); ctx.restore();
      }
    }

    // Night-time darkness, lit around the thief
    const [pxp, pyp] = this.playerPos();
    const dark = ctx.createRadialGradient(pxp, pyp, 60, pxp, pyp, 330);
    dark.addColorStop(0, 'rgba(2,3,12,0)'); dark.addColorStop(1, this.bonus ? 'rgba(2,3,12,.2)' : 'rgba(2,3,12,.62)');
    ctx.fillStyle = dark; ctx.fillRect(0, OY, W, ROWS * T);

    // Torch beams and camera beams (drawn over the darkness so you can always see them)
    if (!this.finale) for (const w of L.watchers) {
      const st = watcherAt(w, this.tick);
      const blink = st.turning && Math.floor(t * 8) % 2;
      const col = w.type === 'camera' ? '239,68,68' : w.type === 'dog' ? '251,146,60' : '253,224,71';
      ctx.fillStyle = `rgba(${col},${blink ? 0.12 : 0.26})`;
      for (const [vx, vy] of vision(L, w, st)) ctx.fillRect(vx * T + 1, OY + vy * T + 1, T - 2, T - 2);
    }
    // Guards, dogs, cameras
    for (const w of L.watchers) this.drawWatcher(ctx, w, t);

    this.drawThief(ctx, t);

    // Alarm glow (gentle, not flashing)
    if (this.alarm) {
      ctx.fillStyle = `rgba(239,68,68,${0.1 + Math.sin(this.alarm.t * 6) * 0.05})`;
      ctx.fillRect(0, OY, W, ROWS * T);
      if (this.alarm.who && this.alarm.who !== 'laser') {
        const st = watcherAt(this.alarm.who, this.tick);
        ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fb7185';
        ctx.fillText('!', cx(st.x), cy(st.y) - 20);
      }
    }

    if (this.finale) this.drawFinale(ctx, t);

    // HUD strip
    ctx.fillStyle = 'rgba(5,6,13,.9)'; ctx.fillRect(0, 0, W, TOP);
    if (this.bonus) {
      progressBar(ctx, 14, 12, W - 28, 20, this.s.bonusLeft / 15, '#b45309', `★ GIFT SHOP · grab the coins! · ${Math.ceil(this.s.bonusLeft)}s`);
    } else {
      ctx.textBaseline = 'middle'; ctx.font = '700 15px system-ui';
      ctx.textAlign = 'left'; ctx.fillStyle = th.glow;
      ctx.fillText(this.secret ? '??? · The Vault' : `${this.level} · ${this.def.name}`, 14, TOP / 2);
      ctx.textAlign = 'right'; ctx.fillStyle = '#fde047';
      ctx.fillText(`💰 ${this.taken} / ${this.total}`, W - 14, TOP / 2);
    }
  }

  playerPos() {
    const p = this.p, e = 1 - Math.pow(1 - p.k, 3);
    return [cx(p.fx + (p.x - p.fx) * e), cy(p.fy + (p.y - p.fy) * e)];
  }

  drawThief(ctx, t) {
    if (this.finale && this.finale.t > 0.8) return;
    const [x, y] = this.playerPos();
    const hidden = isHide(this.L, this.p.x, this.p.y);
    const gold = this.s.gold;
    ctx.save();
    ctx.globalAlpha = hidden ? 0.45 : 1;
    ctx.translate(x, y + Math.sin(t * 10) * (this.p.k < 1 ? 1.5 : 0));
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 11, 10, 4, 0, 0, 7); ctx.fill();
    // body with stripes
    ctx.fillStyle = gold ? '#fbbf24' : '#111827'; ctx.beginPath(); ctx.arc(0, 2, 10, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 2, 10, 0, 7); ctx.clip();
    ctx.fillStyle = gold ? '#fef3c7' : '#e5e7eb';
    for (let k = -8; k <= 12; k += 6) ctx.fillRect(-10, k, 20, 2.5);
    ctx.restore();
    // head + mask
    ctx.fillStyle = '#f5c9a0'; ctx.beginPath(); ctx.arc(0, -8, 7, 0, 7); ctx.fill();
    ctx.fillStyle = gold ? '#b45309' : '#0b0b0b'; ctx.fillRect(-7, -10, 14, 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(-4.5, -9.3, 2.5, 2); ctx.fillRect(2, -9.3, 2.5, 2);
    ctx.fillStyle = gold ? '#d97706' : '#1f2937'; ctx.beginPath(); ctx.arc(0, -11, 7, Math.PI, 0); ctx.fill(); // beanie
    // loot bag
    ctx.fillStyle = gold ? '#fde68a' : '#a16207'; ctx.beginPath(); ctx.arc(9, 6, 5, 0, 7); ctx.fill();
    ctx.restore();
    if (hidden) { ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#a3e635'; ctx.fillText('hidden', x, y - 22); }
  }

  drawWatcher(ctx, w, t) {
    const st = watcherAt(w, this.tick);
    const e = st.f;
    const x = cx(st.x + (st.nx - st.x) * e), y = cy(st.y + (st.ny - st.y) * e);
    const [dx, dy] = DIRS[st.dir];
    ctx.save(); ctx.translate(x, y);
    if (w.type === 'camera') {
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = '#9ca3af'; roundRect(ctx, -6, -7, 16, 14, 3); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.fillRect(8, -4, 6, 8);
      ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ef4444' : '#7f1d1d'; ctx.beginPath(); ctx.arc(-1, 0, 2.5, 0, 7); ctx.fill();
    } else if (w.type === 'dog') {
      ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.ellipse(0, -2, 7, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.arc(0, 9, 6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-5, 11, 2, 4, 0.5, 0, 7); ctx.ellipse(5, 11, 2, 4, -0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(Math.sin(t * 16) * 4, -18); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 11, 10, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(0, 2, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(-3, 0, 1.6, 0, 7); ctx.fill(); // badge
      ctx.fillStyle = '#e0ac80'; ctx.beginPath(); ctx.arc(0, -8, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#1e293b'; ctx.fillRect(-8, -14, 16, 4); ctx.fillRect(-5, -17, 10, 4); // cap
      ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(dx * 11, 2 + dy * 11, 3.5, 0, 7); ctx.fill(); // torch
    }
    ctx.restore();
    if (st.turning && w.type !== 'camera') { ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a'; ctx.fillText('?', x, y - 22); }
  }

  drawExhibit(ctx, x, y) {
    const X = cx(x), Y = cy(y), kind = (x * 7 + y * 13) % 5;
    ctx.fillStyle = '#6b7280'; roundRect(ctx, X - 13, Y - 2, 26, 15, 3); ctx.fill();  // plinth
    ctx.fillStyle = '#9ca3af'; ctx.fillRect(X - 13, Y - 2, 26, 3);
    ctx.save(); ctx.translate(X, Y - 6);
    if (this.level === 8) { // dinosaur bones
      ctx.strokeStyle = '#f5f5dc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(9, -4); ctx.moveTo(-6, -4); ctx.lineTo(-4, 4); ctx.moveTo(0, -6); ctx.lineTo(2, 2); ctx.moveTo(5, -7); ctx.lineTo(7, 0); ctx.stroke();
    } else if (kind === 0) { ctx.fillStyle = '#0ea5e9'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 8, 0, 0, 7); ctx.fill(); ctx.fillRect(-3, -12, 6, 5); }       // vase
    else if (kind === 1) { ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.arc(0, -3, 6, 0, 7); ctx.fill(); ctx.fillRect(-7, 2, 14, 5); }                     // bust
    else if (kind === 2) { ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, -2); ctx.lineTo(0, 6); ctx.lineTo(-7, -2); ctx.fill(); } // crystal
    else if (kind === 3) { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(0, -9); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill(); }   // pyramid
    else { ctx.fillStyle = '#b91c1c'; roundRect(ctx, -8, -8, 16, 13, 2); ctx.fill(); ctx.fillStyle = '#fbbf24'; ctx.fillRect(-6, -6, 12, 9); }                 // painting
    ctx.restore();
  }

  drawHide(ctx, x, y) {
    const X = cx(x), Y = cy(y);
    if ((x + y) % 2) { // potted plant
      ctx.fillStyle = '#92400e'; roundRect(ctx, X - 7, Y + 3, 14, 11, 3); ctx.fill();
      ctx.fillStyle = '#16a34a';
      for (const [ox, oy, r] of [[-6, -2, 7], [6, -2, 7], [0, -8, 8], [0, 0, 7]]) { ctx.beginPath(); ctx.arc(X + ox, Y + oy, r, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(X - 2, Y - 9, 4, 0, 7); ctx.fill();
    } else { // suit of armour
      ctx.fillStyle = '#9ca3af'; roundRect(ctx, X - 8, Y - 6, 16, 20, 4); ctx.fill();
      ctx.fillStyle = '#d1d5db'; ctx.beginPath(); ctx.arc(X, Y - 10, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#374151'; ctx.fillRect(X - 5, Y - 11, 10, 2);
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X + 11, Y - 14); ctx.lineTo(X + 11, Y + 14); ctx.stroke();
    }
  }

  drawTreasure(ctx, x, y, t) {
    const X = cx(x), Y = cy(y) + Math.sin(t * 3 + x) * 2;
    ctx.save(); ctx.shadowColor = '#fde047'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.moveTo(X - 9, Y + 5); ctx.lineTo(X - 9, Y - 4); ctx.lineTo(X - 4, Y); ctx.lineTo(X, Y - 8); ctx.lineTo(X + 4, Y); ctx.lineTo(X + 9, Y - 4); ctx.lineTo(X + 9, Y + 5); ctx.closePath(); ctx.fill(); // crown
    ctx.shadowBlur = 0; ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(X, Y + 1, 2, 0, 7); ctx.fill();
    ctx.restore();
  }
  drawCoin(ctx, x, y, t) {
    const X = cx(x), Y = cy(y), w = Math.abs(Math.cos(t * 3 + x * 0.7 + y)) * 6 + 1;
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(X, Y, w, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(X - 1, Y - 1, w * 0.5, 3, 0, 0, 7); ctx.fill();
  }
  drawExit(ctx, x, y, t) {
    const X = x * T, Y = OY + y * T;
    ctx.save(); ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12 + Math.sin(t * 4) * 6;
    ctx.fillStyle = '#166534'; roundRect(ctx, X + 4, Y + 3, T - 8, T - 6, 4); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#4ade80'; ctx.font = '800 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', X + T / 2, Y + T / 2);
  }

  /** The display case. open: 0 (closed) → 1 (lid fully open) */
  drawCase(ctx, x, y, scale, open, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#3f2d0c'; roundRect(ctx, -34, 18, 68, 30, 6); ctx.fill();          // pedestal
    ctx.fillStyle = '#7a6118'; ctx.fillRect(-34, 18, 68, 5);
    ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.2;                          // golden glow inside
    const g = ctx.createRadialGradient(0, -4, 2, 0, -4, 34); g.addColorStop(0, '#fde68a'); g.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = g; ctx.fillRect(-30, -40, 60, 58); ctx.restore();
    ctx.strokeStyle = 'rgba(224,242,254,.85)'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(186,230,253,.12)';
    roundRect(ctx, -28, -34, 56, 52, 4); ctx.fill(); ctx.stroke();                     // glass
    ctx.save(); ctx.translate(-30, -36); ctx.rotate(-open * 1.9);                        // lid
    ctx.fillStyle = '#a16207'; ctx.fillRect(0, -3, 60, 6); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-22, -28, 5, 36);
    ctx.restore();
  }

  drawFinale(ctx, t) {
    const f = this.finale, k = f.t;
    ctx.fillStyle = `rgba(3,3,8,${Math.min(0.82, k * 0.6)})`; ctx.fillRect(0, 0, W, H);
    const caseY = H * 0.74, eggY = H * 0.3;
    // spotlight
    ctx.save(); ctx.globalAlpha = Math.min(1, k) * 0.35;
    const sg = ctx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, 'rgba(254,243,199,.9)'); sg.addColorStop(1, 'rgba(254,243,199,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(W / 2 - 30, 0); ctx.lineTo(W / 2 + 30, 0); ctx.lineTo(W / 2 + 120, H); ctx.lineTo(W / 2 - 120, H); ctx.fill();
    ctx.restore();
    const open = Math.min(1, Math.max(0, (k - 0.4) / 0.8));
    this.drawCase(ctx, W / 2, caseY, 1.25, open, t);
    // the egg rises out of the case
    const rise = Math.min(1, Math.max(0, (k - 1.1) / 2.2));
    const e = 1 - Math.pow(1 - rise, 3);
    // once the Legend panel appears, the egg floats up out of its way
    const up = Math.min(1, Math.max(0, (k - 7.3) / 0.8)), ue = up * up * (3 - 2 * up);
    const ey = caseY - 10 + (eggY - caseY + 10) * e + (TOP + 66 - eggY) * ue;
    const size = (0.32 + 0.68 * e) * (1 - 0.35 * ue);
    if (k > 1.1) {
      if (rise > 0.6) this.drawRays(ctx, W / 2, ey, t, (rise - 0.6) / 0.4);
      drawGoldenEgg(ctx, W / 2, ey, 66 * size, t * 0.8);
    }
    if (k > 3.4 && ue < 1) {
      ctx.save(); ctx.globalAlpha = Math.min(1, (k - 3.4) / 0.8) * (1 - ue);
      ctx.textAlign = 'center'; ctx.font = '800 26px system-ui'; ctx.fillStyle = '#fde68a';
      ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 16;
      ctx.fillText(S('VEhFIEdPTERFTiBFR0c='), W / 2, eggY + 66 * 1.05 + 34);
      ctx.restore();
    }
  }

  drawRays(ctx, x, y, t, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.25); ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = '#fde68a';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -260); ctx.lineTo(18, -260); ctx.fill(); }
    ctx.restore();
  }
}

/** A golden egg with the initials engraved in a band that spins around it. */
function drawGoldenEgg(ctx, x, y, rx, rot) {
  const ryT = rx * 1.32, ryB = rx * 1.05;
  const eggPath = () => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ryB, 0, 0, Math.PI);
    ctx.ellipse(x, y, rx, ryT, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 40;
  eggPath();
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ryT * 0.35, rx * 0.08, x, y, rx * 1.55);
  g.addColorStop(0, '#fffbe6'); g.addColorStop(0.22, '#fde68a'); g.addColorStop(0.55, '#fbbf24'); g.addColorStop(0.85, '#b45309'); g.addColorStop(1, '#78350f');
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  // engraved band
  const bandY = y + ryB * 0.04;
  ctx.strokeStyle = 'rgba(120,53,15,.8)'; ctx.lineWidth = Math.max(1, rx * 0.035);
  for (const off of [-rx * 0.26, rx * 0.26]) { ctx.beginPath(); ctx.ellipse(x, bandY + off, rx, rx * 0.1, 0, 0, Math.PI); ctx.stroke(); }
  // the engraving, travelling around the egg (written twice so the whole phrase is always in view)
  const items = [...`${EGG_TEXT} ✦ ${EGG_TEXT} ✦ `];
  const n = items.length;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const depth = Math.cos(a);
    if (depth <= 0.04 || items[i] === ' ') continue;
    const lx = x + Math.sin(a) * rx * 0.93;
    ctx.save();
    ctx.translate(lx, bandY);
    ctx.scale(depth, 1);
    ctx.globalAlpha = 0.35 + 0.65 * depth;
    const fs = items[i] === '✦' ? rx * 0.17 : rx * 0.25;
    ctx.font = `900 ${fs}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = '#fff7cc'; ctx.fillText(items[i], 0, -1);          // highlight
    ctx.fillStyle = '#7c2d12'; ctx.fillText(items[i], 0.8, 0.8);       // engraving
    ctx.restore();
  }
  // shine
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - rx * 0.38, y - ryT * 0.42, rx * 0.16, ryT * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // rim
  ctx.save(); eggPath(); ctx.strokeStyle = 'rgba(255,247,204,.6)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
}

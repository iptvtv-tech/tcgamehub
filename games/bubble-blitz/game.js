// ─────────────────────────────────────────────────────────────
//  BUBBLE BLITZ 3D — game 14 (Zone 3 · Master)
//  The rules below run on a flat 480 × 720 board exactly as the 2D game did;
//  scene3d.js stands the board up as a tilted 3D table (lit sphere bubbles,
//  solid ceiling and rails, a 3D launcher) and maps the mouse / finger back
//  onto the board, so aiming works on the 3D view.
//  Blow coloured bubbles up from the launcher. They stick to the ceiling and to
//  each other. Make a group of 3+ of one colour and it POPS — anything left
//  hanging falls for double points. Quick play: the ceiling drops every few shots
//  and the launcher fires by itself if you dither.
//
//  Some bubbles sparkle: they hide a surprise. Pop one to find out what it is —
//    bonuses 💣 bomb · ⚡ lightning row · 🌈 rainbow shots · ⭐ star · ❄️ freeze · 🎯 laser sight
//    traps   🪨 stone · ⬇️ ceiling drop · 🌀 shuffle · ☠️ skull row · 🌫️ fog
//  Knock a sparkly bubble DOWN instead of popping it and you keep a bonus / defuse a trap.
//  Every 5th level: ★ BUBBLE BONANZA — rainbow shots, the board keeps coming, no way to lose.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';
import * as S from './scene3d.js';

const ID = 'bubble-blitz';
const W = 480, H = 720;
const R = 19, D = R * 2, COLS = 12;
const LEFT = (W - COLS * D) / 2;
const ROWH = R * Math.sqrt(3);
const TOP0 = 66;
const DANGER = H - 158;
const GUN_X = W / 2, GUN_Y = H - 84;
const NEXT_X = 150, NEXT_Y = H - 52;
const SHOT_SPEED = 1150;
const COLORS = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];
const SHADES = ['#9f1239', '#a16207', '#15803d', '#1d4ed8', '#6b21a8', '#c2410c'];

const BONUSES = ['bomb', 'bolt', 'rainbow', 'star', 'freeze', 'sight'];
const TRAPS = ['stone', 'drop', 'shuffle', 'skull', 'fog'];
const ICON = { bomb: '💣', bolt: '⚡', rainbow: '🌈', star: '⭐', freeze: '❄️', sight: '🎯', stone: '🪨', drop: '⬇️', shuffle: '🌀', skull: '☠️', fog: '🌫️' };
const LABEL = { bomb: 'BOMB!', bolt: 'LIGHTNING!', rainbow: 'RAINBOW SHOTS!', star: 'STAR!', freeze: 'FREEZE!', sight: 'LASER SIGHT!', stone: 'STONE TRAP!', drop: 'CEILING DROP!', shuffle: 'SHUFFLE!', skull: 'SKULL ROW!', fog: 'FOG!' };

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  detail: true,                // offers the 🖥 Graphics HIGH / LOW switch (LOW skips shadows, stars and the table grid)
  comboWindow: 0,            // the combo keeps going as long as every shot pops something
  comboStep: 2,
  maxMultiplier: 6,
  bonusTime: 15,
  music: { bpm: 138, style: 'bubbly', lead: 'sine', arp: [0, 2, 4, 2, 3, 1, 5, 2], oct: [12, 12, 12, 24, 12, 12, 24, 12], bass: 'half' },
  levelInfo(level, bonus) {
    if (bonus) return '★ BUBBLE BONANZA! Every shot is a rainbow, the board keeps coming — pop as many as you can!';
    const notes = {
      1: 'Aim and fire (mouse, finger drag or ← →, Space). Match 3 of a colour to POP them. The ceiling drops every few shots and the launcher won\'t wait — clear the board!',
      2: '✨ Sparkly bubbles hide a bonus… or a trap — knock them DOWN to keep bonuses and defuse traps. 🪨 Stones can\'t be matched: drop them or blow them up.',
      3: 'Bounce shots off the walls to reach tricky spots.',
      4: '⏫ New rows now push in on a timer (pink bar at the top) — and the aim line is shorter!',
      6: 'Six colours now. Keep your cool!',
      8: 'The aim line is tiny now. Trust your angles!',
    };
    return notes[level] || 'Faster ceiling, more traps. Pop quick!';
  },
  create: (shell) => new BubbleBlitz(shell),
});

class BubbleBlitz {
  constructor(s) {
    this.s = s; this.t = 0;
    this.aim = Math.PI / 2;
    this.cam = new S.TableCam(W, H, { pivot: GUN_Y });
    this.spr = COLORS.map((c, i) => S.bubbleSprite(c, SHADES[i]));
    this.stoneSpr = S.stoneSprite(); this.shadeSpr = S.shadingSprite();
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.45, r: Math.random() * 1.3 + 0.3, p: Math.random() * 6 }));
    this.floaters = Array.from({ length: 18 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 6 + Math.random() * 22, v: 8 + Math.random() * 18, h: Math.floor(Math.random() * 6) }));
    this.startLevel(1, false);
  }

  reset() { this.found = 0; }

  // ── Level setup ───────────────────────────────────────────
  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.found ??= 0;
    this.nColors = bonus ? 3 : Math.min(6, 5 + Math.floor(level / 6));
    this.dropEvery = bonus ? 99 : Math.max(3, 6 - Math.floor(level / 3));
    this.clockMax = bonus ? 99 : Math.max(2.5, 5 - level * 0.15);
    this.guideLen = level >= 8 ? 150 : level >= 4 ? 240 : 9999;
    this.pushEvery = bonus || level < 4 ? 0 : Math.max(8, 20 - level * 0.8);   // a new row pushes in on a timer
    this.livesAtStart = this.s.lives;
    this.buildBoard();
  }

  buildBoard() {
    const r = this.s.rng, L = this.level;
    this.par = 0; this.drops = 0;
    this.grid = [];
    this.shot = null; this.popping = []; this.falling = []; this.clearing = 0; this.failing = 0;
    this.shotsLeft = this.dropEvery; this.clock = this.clockMax; this.pushT = 0;
    this.rainbowShots = 0; this.freeze = 0; this.sight = 0; this.fog = 0;
    this.popsBonus = 0;
    const rows = this.bonus ? 8 : Math.min(11, 6 + Math.floor(L / 2));
    const secretChance = this.bonus ? 0 : L === 1 ? 0 : Math.min(0.11, 0.06 + L * 0.004);
    const trapChance = Math.min(0.55, 0.35 + L * 0.02);
    for (let row = 0; row < rows; row++) {
      const line = [];
      for (let c = 0; c < this.ncols(row); c++) {
        // clusters: often copy a neighbour's colour so there are groups to find
        let k = r.int(0, this.nColors - 1);
        const left = line[c - 1], up = this.grid[row - 1]?.[c];
        if (left && !left.stone && r.chance(0.3)) k = left.c;
        else if (up && !up.stone && r.chance(0.25)) k = up.c;
        const cell = { c: k, stone: false, secret: null };
        if (r.chance(secretChance)) cell.secret = r.chance(trapChance) ? r.pick(TRAPS) : r.pick(BONUSES);
        line.push(cell);
      }
      this.grid.push(line);
    }
    if (!this.bonus && L >= 2) {                                   // stones mixed in
      const n = Math.min(9, 1 + Math.floor(L / 2));
      for (let i = 0; i < n; i++) {
        const row = r.int(1, rows - 1), c = r.int(0, this.ncols(row) - 1);
        const cell = this.grid[row][c]; if (cell) { cell.stone = true; cell.secret = null; }
      }
    }
    this.total = this.countColoured();
    this.cur = this.pickColour(); this.next = this.pickColour();
  }

  // ── Grid helpers ──────────────────────────────────────────
  get top() { return TOP0 + this.drops * ROWH; }
  offset(row) { return ((row + this.par) & 1) === 1; }
  ncols(row) { return this.offset(row) ? COLS - 1 : COLS; }
  xy(row, c) { return [LEFT + R + c * D + (this.offset(row) ? R : 0), this.top + R + row * ROWH]; }
  at(row, c) { return this.grid[row]?.[c] || null; }
  neighbours(row, c) {
    const o = this.offset(row);
    const list = o
      ? [[row, c - 1], [row, c + 1], [row - 1, c], [row - 1, c + 1], [row + 1, c], [row + 1, c + 1]]
      : [[row, c - 1], [row, c + 1], [row - 1, c - 1], [row - 1, c], [row + 1, c - 1], [row + 1, c]];
    return list.filter(([rr, cc]) => rr >= 0 && cc >= 0 && cc < this.ncols(rr));
  }
  cells() {
    const out = [];
    this.grid.forEach((line, row) => line.forEach((cell, c) => { if (cell) out.push([row, c, cell]); }));
    return out;
  }
  countColoured() { return this.cells().filter(([, , b]) => !b.stone).length; }
  pickColour() {
    const present = [...new Set(this.cells().filter(([, , b]) => !b.stone).map(([, , b]) => b.c))];
    const pool = present.length ? present : [...Array(this.nColors).keys()];
    return this.s.rng.pick(pool);
  }

  // ── Input ─────────────────────────────────────────────────
  setAimFrom(x, y) {
    const a = Math.atan2(GUN_Y - y, x - GUN_X);
    this.aim = clamp(a, 0.12, Math.PI - 0.12);
  }
  /** screen point → the board point under it (at bubble-centre height, where shots fly) */
  toBoard(x, y) { return this.cam.unproject(x, y, R); }
  /** board point → screen point, for score pop-ups and particles */
  sp(x, y) { const q = this.cam.at(x, y, R); return [q[0], q[1]]; }
  onPointerMove(x, y) { [x, y] = this.toBoard(x, y); if (y < GUN_Y + 10) this.setAimFrom(x, y); }
  onAction(a, x, y) {
    const s = this.s;
    const sx = x, sy = y;
    if (x != null) [x, y] = this.toBoard(x, y);
    if (a === 'press') { const nb = this.cam.at(NEXT_X, NEXT_Y, 8 + R * 0.8); if (Math.hypot(sx - nb[0], sy - nb[1]) < 32) { this.swap(); this.swapTap = true; return; } this.swapTap = false; if (y < GUN_Y + 10) this.setAimFrom(x, y); return; }
    if (a === 'release') { if (this.swapTap) { this.swapTap = false; return; } if (y < GUN_Y + 30) { this.setAimFrom(x, y); this.fire(); } return; }
    if (a === 'action') this.fire();
    if (a === 'up' && !s.input.pointer.down) this.swap();
  }
  swap() {
    if (this.bonus || this.shot) return;
    [this.cur, this.next] = [this.next, this.cur];
    this.s.sound.tone({ freq: 520, to: 700, dur: 0.06, type: 'sine', vol: 0.06 });
  }

  fire() {
    const s = this.s;
    if (this.shot || this.clearing || this.failing || s.state !== 'playing') return;
    const rainbow = this.bonus || this.rainbowShots > 0;
    if (!this.bonus && this.rainbowShots > 0) this.rainbowShots--;
    this.shot = { x: GUN_X, y: GUN_Y, vx: Math.cos(this.aim) * SHOT_SPEED, vy: -Math.sin(this.aim) * SHOT_SPEED, c: this.cur, rainbow, bounces: 0 };
    this.cur = this.next; this.next = this.pickColour();
    this.clock = this.clockMax;
    if (this.sight > 0) this.sight--;
    if (this.fog > 0) this.fog--;
    s.sound.tone({ freq: 300, to: 620, dur: 0.09, type: 'sine', vol: 0.09 });
    s.sound.noise({ dur: 0.06, vol: 0.05, freq: 3000, type: 'highpass' });
  }

  onLifeLost() { this.buildBoard(); }

  idle(dt) { this.t += dt; this.animate(dt); }

  // ── Update ────────────────────────────────────────────────
  update(dt) {
    const s = this.s;
    this.t += dt;
    this.animate(dt);
    if (s.input.isDown('left')) this.aim = clamp(this.aim + 2.2 * dt, 0.12, Math.PI - 0.12);
    if (s.input.isDown('right')) this.aim = clamp(this.aim - 2.2 * dt, 0.12, Math.PI - 0.12);

    if (this.failing > 0) { this.failing -= dt; if (this.failing <= 0) { s.sound.play('boom'); s.hurt(); } return; }
    if (this.clearing > 0) { this.clearing -= dt; if (this.clearing <= 0) this.finishLevel(); return; }
    if (this.freeze > 0) this.freeze -= dt;

    // the launcher gets impatient
    if (!this.shot && !this.bonus && this.freeze <= 0) {
      this.clock -= dt;
      if (this.clock <= 1.5 && Math.ceil(this.clock * 2) !== Math.ceil((this.clock + dt) * 2)) s.sound.play('tick');
      if (this.clock <= 0) this.fire();
    }

    // from level 3 a new row pushes in on a timer
    if (this.pushEvery && this.freeze <= 0) {
      this.pushT += dt;
      if (this.pushT >= this.pushEvery - 2 && Math.ceil(this.pushT) !== Math.ceil(this.pushT - dt)) s.sound.tone({ freq: 180, dur: 0.05, type: 'square', vol: 0.05 });
      if (this.pushT >= this.pushEvery) {
        this.pushT = 0; this.pushRow();
        s.fx.shake(4, 0.2);
        s.sound.tone({ freq: 140, to: 80, dur: 0.2, type: 'sawtooth', vol: 0.1 });
      }
    }

    // bonus: new rows keep coming
    if (this.bonus) {
      this.pushT = (this.pushT || 0) + dt;
      if (this.pushT > 2.2) { this.pushT = 0; this.pushRow(); }
    }

    if (this.shot) this.moveShot(dt);
  }

  animate(dt) {
    for (const f of this.floaters) { f.y -= f.v * dt; if (f.y < -40) { f.y = H + 40; f.x = Math.random() * W; } }
    for (const p of this.popping) p.t += dt;
    this.popping = this.popping.filter((p) => p.t < 0.25);
    for (const f of this.falling) { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    this.falling = this.falling.filter((f) => f.y < H + 40);
  }

  moveShot(dt) {
    const s = this.s, sh = this.shot;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      sh.x += sh.vx * dt / steps; sh.y += sh.vy * dt / steps;
      if (sh.x < LEFT + R) { sh.x = LEFT + R; sh.vx = Math.abs(sh.vx); sh.bounces++; s.sound.tone({ freq: 900, dur: 0.02, type: 'triangle', vol: 0.05 }); }
      if (sh.x > W - LEFT - R) { sh.x = W - LEFT - R; sh.vx = -Math.abs(sh.vx); sh.bounces++; s.sound.tone({ freq: 900, dur: 0.02, type: 'triangle', vol: 0.05 }); }
      if (sh.y - R <= this.top) return this.land();
      for (const [row, c] of this.cells()) {
        const [bx, by] = this.xy(row, c);
        if (Math.abs(by - sh.y) > D) continue;
        if ((bx - sh.x) ** 2 + (by - sh.y) ** 2 < (D * 0.86) ** 2) return this.land();
      }
    }
  }

  /** The flying bubble sticks: snap it into the nearest free cell. */
  land() {
    const s = this.s, sh = this.shot;
    this.shot = null;
    let best = null, bd = 1e9;
    const approxRow = Math.max(0, Math.round((sh.y - this.top - R) / ROWH));
    for (let spread = 1; spread <= 4 && !best; spread += 3)
    for (let row = Math.max(0, approxRow - spread); row <= approxRow + spread; row++) {
      for (let c = 0; c < this.ncols(row); c++) {
        if (this.at(row, c)) continue;
        if (row > 0 && !this.neighbours(row, c).some(([rr, cc]) => this.at(rr, cc))) continue;
        const [x, y] = this.xy(row, c), d = (x - sh.x) ** 2 + (y - sh.y) ** 2;
        if (d < bd) { bd = d; best = [row, c]; }
      }
    }
    if (!best) return;
    const [row, c] = best;
    while (this.grid.length <= row) this.grid.push([]);
    let colour = sh.c;
    if (sh.rainbow) colour = this.bestColourAt(row, c) ?? sh.c;
    this.grid[row][c] = { c: colour, stone: false, secret: null };
    s.sound.tone({ freq: 240, to: 170, dur: 0.06, type: 'sine', vol: 0.08 });
    this.resolve(row, c, sh);
  }

  bestColourAt(row, c) {
    let best = null, size = 0;
    for (const [rr, cc] of this.neighbours(row, c)) {
      const b = this.at(rr, cc);
      if (!b || b.stone) continue;
      this.grid[row][c] = { c: b.c, stone: false, secret: null };
      const n = this.group(row, c).length;
      if (n > size) { size = n; best = b.c; }
    }
    return best;
  }

  group(row, c) {
    const start = this.at(row, c); if (!start || start.stone) return [];
    const seen = new Set([row + ',' + c]), out = [[row, c]], q = [[row, c]];
    while (q.length) {
      const [rr, cc] = q.pop();
      for (const [nr, nc] of this.neighbours(rr, cc)) {
        const b = this.at(nr, nc), k = nr + ',' + nc;
        if (!b || b.stone || b.c !== start.c || seen.has(k)) continue;
        seen.add(k); out.push([nr, nc]); q.push([nr, nc]);
      }
    }
    return out;
  }

  resolve(row, c, sh) {
    const s = this.s, L = this.level;
    const grp = this.group(row, c);
    let popped = 0;
    if (grp.length >= 3) {
      const effects = [];
      popped += this.pop(grp, effects);
      // secrets found in popped bubbles go off (and can set off more)
      for (let guard = 0; effects.length && guard < 30; guard++) popped += this.trigger(effects.shift(), effects);
      const [x, y] = this.sp(...this.xy(row, c));
      s.award(popped * 10 * L, x, y - 10, { chain: true, color: COLORS[grp.length ? this.popColour : 0] || '#fff', size: 20 });
      if (sh.bounces > 0) s.unlock('bank');
      if (this.bonus) { this.popsBonus += popped; if (this.popsBonus >= 100) s.unlock('bonanza'); }
    } else {
      s.resetCombo();
      if (!this.bonus && this.freeze <= 0) this.shotsLeft--;
    }
    const dropped = this.dropFloating();
    if (dropped >= 10) s.unlock('bigdrop');

    if (this.countColoured() === 0 && !this.bonus) {
      this.clearing = 0.7;
      s.fx.text(W / 2, H / 2 - 40, 'BOARD CLEAR!', { color: '#fde047', size: 38, life: 1.4 });
      s.fx.confetti(W, H);
      return;
    }
    if (!this.bonus && this.shotsLeft <= 0) this.dropCeiling();
    if (this.bonus && this.countColoured() < 12) { this.pushRow(); this.pushRow(); }
    this.checkDanger();
  }

  pop(list, effects) {
    let n = 0;
    for (const [row, c] of list) {
      const b = this.at(row, c); if (!b) continue;
      const [x, y] = this.xy(row, c);
      this.popColour = b.c;
      const pcol = b.stone ? '#94a3b8' : COLORS[b.c];
      // 3D pop particles: 8 droplets arc outward in board-space, projected onto the 3D table
      const dropsArr = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return { dx: Math.cos(a) * R * 0.85, dy: Math.sin(a) * R * 0.85, vr: 0.8 + Math.random() * 0.6, vh: R * (0.4 + Math.random() * 0.4) };
      });
      this.popping.push({ x, y, col: pcol, t: 0, drops: dropsArr });
      this.s.fx.burst(...this.sp(x, y), { colors: [pcol, '#fff'], count: 7, speed: 160, life: 0.35, size: 2.5 });
      if (b.secret) effects.push({ kind: b.secret, row, c });
      this.grid[row][c] = null;
      n++;
    }
    this.popSound(n);
    return n;
  }

  /** A little run of bubbly pops, rising in pitch. */
  popSound(n) {
    const snd = this.s.sound;
    for (let i = 0; i < Math.min(n, 10); i++) {
      const f = 520 + i * 70 + Math.random() * 80;
      snd.tone({ freq: f, to: f * 2.2, dur: 0.05, type: 'sine', vol: 0.1, delay: i * 0.035 });
      snd.noise({ dur: 0.03, vol: 0.05, freq: 4000, type: 'highpass', delay: i * 0.035 });
    }
  }

  trigger(e, effects) {
    const s = this.s, L = this.level, [x, y] = this.xy(e.row, e.c), [px, py] = this.sp(x, y);
    const bonus = BONUSES.includes(e.kind);
    s.fx.text(clamp(px, 95, W - 95), py - 24, `${ICON[e.kind]} ${LABEL[e.kind]}`, { color: bonus ? '#fde047' : '#fca5a5', size: 18, life: 1.2 });
    if (bonus) { this.found = (this.found || 0) + 1; if (this.found >= 8) s.unlock('treasure'); s.sound.play('powerup'); }
    else { s.sound.play('hit'); s.fx.shake(5, 0.2); }
    let n = 0;
    switch (e.kind) {
      case 'bomb': {
        const list = this.cells().filter(([rr, cc]) => { const [bx, by] = this.xy(rr, cc); return Math.hypot(bx - x, by - y) < D * 2.1; }).map(([rr, cc]) => [rr, cc]);
        s.fx.ring(px, py, { color: '#fb923c', radius: D * 2.2 * this.cam.at(x, y, R)[2], width: 4 }); s.sound.play('boom');
        n = this.pop(list, effects); break;
      }
      case 'bolt': {
        const list = (this.grid[e.row] || []).map((b, cc) => (b ? [e.row, cc] : null)).filter(Boolean);
        s.fx.flash('#e0f2fe', 0.3);
        n = this.pop(list, effects); break;
      }
      case 'rainbow': this.rainbowShots += 2; break;
      case 'star': s.award(250 * L, px, py, { color: '#fde047', size: 22 }); break;
      case 'freeze': this.freeze = 8; break;
      case 'sight': this.sight = 6; break;
      case 'stone': {
        const near = this.cells().filter(([, , b]) => !b.stone).map(([rr, cc, b]) => { const [bx, by] = this.xy(rr, cc); return { b, d: Math.hypot(bx - x, by - y) }; }).sort((a, b) => a.d - b.d).slice(0, 3);
        for (const { b } of near) { b.stone = true; b.secret = null; }
        break;
      }
      case 'drop': this.dropCeiling(); break;
      case 'shuffle':
        for (const [rr, cc, b] of this.cells()) { const [bx, by] = this.xy(rr, cc); if (!b.stone && Math.hypot(bx - x, by - y) < D * 3) b.c = s.rng.int(0, this.nColors - 1); }
        break;
      case 'skull': this.pushRow(); break;
      case 'fog': this.fog = 4; break;
    }
    return n;
  }

  /** Anything no longer hanging from the ceiling falls. Falling secrets: bonuses kept, traps defused. */
  dropFloating() {
    const s = this.s, L = this.level;
    const seen = new Set(), q = [];
    (this.grid[0] || []).forEach((b, c) => { if (b) { seen.add('0,' + c); q.push([0, c]); } });
    while (q.length) {
      const [rr, cc] = q.pop();
      for (const [nr, nc] of this.neighbours(rr, cc)) {
        const k = nr + ',' + nc;
        if (this.at(nr, nc) && !seen.has(k)) { seen.add(k); q.push([nr, nc]); }
      }
    }
    let n = 0;
    for (const [row, c, b] of this.cells()) {
      if (seen.has(row + ',' + c)) continue;
      const [x, y] = this.xy(row, c), [px, py] = this.sp(x, y);
      this.falling.push({ x, y, vx: s.rng.range(-60, 60), vy: s.rng.range(-120, 0), col: b.stone ? '#94a3b8' : COLORS[b.c], stone: b.stone });
      if (b.secret) {
        if (BONUSES.includes(b.secret)) {
          s.fx.text(clamp(px, 70, W - 70), py, `${ICON[b.secret]} KEPT!`, { color: '#fde047', size: 16 });
          this.found = (this.found || 0) + 1; if (this.found >= 8) s.unlock('treasure');
          if (b.secret === 'star') s.award(250 * L, px, py - 20, { color: '#fde047' });
          else if (b.secret === 'rainbow') this.rainbowShots += 2;
          else if (b.secret === 'freeze') this.freeze = 8;
          else if (b.secret === 'sight') this.sight = 6;
          else s.award(100 * L, px, py - 20, { color: '#fde047' });          // bomb / lightning: cashed in for points
        } else s.fx.text(clamp(px, 80, W - 80), py, `${ICON[b.secret]} DEFUSED`, { color: '#a7f3d0', size: 14 });
      }
      this.grid[row][c] = null;
      n++;
    }
    if (n) {
      s.award(Math.round(n * 20 * L * Math.min(2.5, 1 + Math.floor(n / 5) * 0.5)), W / 2, this.sp(W / 2, this.top + 120)[1], { color: '#a5f3fc', size: 22 });
      [0, 3, 7, 12].forEach((st, i) => s.sound.tone({ freq: s.sound.note(76 - st), dur: 0.08, type: 'triangle', vol: 0.07, delay: i * 0.05 }));
      if (n >= 5) s.fx.text(W / 2, this.sp(W / 2, this.top + 90)[1], `${n} DROPPED!`, { color: '#a5f3fc', size: 24 });
    }
    while (this.grid.length && this.grid[this.grid.length - 1].every((b) => !b)) this.grid.pop();
    return n;
  }

  dropCeiling() {
    const s = this.s;
    this.drops++; this.shotsLeft = this.dropEvery;
    s.fx.shake(6, 0.25);
    s.sound.tone({ freq: 120, to: 70, dur: 0.25, type: 'sawtooth', vol: 0.12 });
    this.checkDanger();
  }

  /** Add a fresh row at the top, pushing everything down one row. */
  pushRow() {
    this.par ^= 1;
    const line = [];
    for (let c = 0; c < this.ncols(0); c++) line.push({ c: this.pickColour(), stone: false, secret: null });
    this.grid.unshift(line);
    if (this.bonus) {
      // no way to lose in the bonus round: the bottom rows just melt away
      while (this.grid.length && this.xy(this.grid.length - 1, 0)[1] + R > DANGER - ROWH) {
        const row = this.grid.length - 1;
        for (const b of this.grid[row]) if (b) this.popping.push({ x: this.xy(row, 0)[0], y: this.xy(row, 0)[1], col: COLORS[b.c], t: 0 });
        this.grid.pop();
      }
    }
    this.checkDanger();
  }

  checkDanger() {
    if (this.bonus || this.failing) return;
    for (const [row] of this.cells()) {
      if (this.xy(row, 0)[1] + R > DANGER) {
        this.failing = 0.6;
        this.s.fx.text(W / 2, this.sp(W / 2, DANGER)[1] - 40, 'TOO LOW!', { color: '#f87171', size: 36, life: 1.2 });
        return;
      }
    }
  }

  finishLevel() {
    const s = this.s, L = this.level;
    s.award(Math.max(0, 8 - this.drops) * 60 * L, W / 2, H / 2, { color: '#a5f3fc', size: 24 });
    if (L >= 3 && s.lives >= this.livesAtStart) s.unlock('flawless');
    s.completeLevel();
  }

  onLevelClear() { if (this.bonus && this.popsBonus >= 100) this.s.unlock('bonanza'); }

  // ── Draw (3D) ─────────────────────────────────────────────
  //  Board (x, y) → cam.at(x, y, height) → screen. Far things are drawn first.
  render(ctx) {
    const s = this.s, cam = this.cam, lo = s.lowDetail;
    this.drawBackdrop(ctx, lo);
    this.drawTable(ctx, lo);
    this.drawWalls(ctx);

    // bubbles: shadows on the table first, then the spheres (top rows are farthest away)
    const cells = this.cells();
    if (!lo) for (const [row, c] of cells) this.drawShadow(ctx, ...this.xy(row, c), R);
    for (const [row, c, b] of cells) { const [x, y] = this.xy(row, c); this.drawBubble(ctx, x, y, R, b); }
    for (const p of this.popping) {
      const k = p.t / 0.25, [px, py, sc] = cam.at(p.x, p.y, R);
      // outer expanding ring
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.col; ctx.lineWidth = 3 * sc;
      ctx.beginPath(); ctx.arc(px, py, R * sc * (1 + k * 0.7), 0, Math.PI * 2); ctx.stroke();
      // inner flash (bright fill fading fast)
      if (k < 0.35) {
        ctx.globalAlpha = (1 - k / 0.35) * 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(px, py, R * sc * (0.6 - k * 0.8), 0, Math.PI * 2); ctx.fill();
      }
      // 3D arc droplets: project each droplet using height arc so they appear to lift off the table
      if (!lo && p.drops) {
        for (const d of p.drops) {
          const spread = k * d.vr;
          const height = R + d.vh * Math.sin(k * Math.PI); // arc up then back down
          const [dpx, dpy, dsc] = cam.at(p.x + d.dx * spread, p.y + d.dy * spread, height * (1 - k));
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(dpx, dpy, Math.max(1, 2.5 * dsc), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    for (const f of this.falling) if (f.y < GUN_Y) this.drawBubble(ctx, f.x, f.y, R, { c: COLORS.indexOf(f.col), stone: f.stone });

    // aim guide
    if (s.state === 'playing' && !this.shot && this.fog <= 0) this.drawGuide(ctx);

    // flying shot
    if (this.shot) {
      if (!lo) this.drawShadow(ctx, this.shot.x, this.shot.y, R);
      this.drawBubble(ctx, this.shot.x, this.shot.y, R, { c: this.shot.c, rainbow: this.shot.rainbow });
    }

    this.drawLauncher(ctx);
    for (const f of this.falling) if (f.y >= GUN_Y) this.drawBubble(ctx, f.x, f.y, R, { c: COLORS.indexOf(f.col), stone: f.stone });
    this.drawHud(ctx);
  }

  drawBackdrop(ctx, lo) {
    const t = this.t;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#2e0657'); g.addColorStop(0.5, '#5b1a4a'); g.addColorStop(1, '#7c2d12'); }
    else { g.addColorStop(0, '#050a2e'); g.addColorStop(0.5, '#0c1445'); g.addColorStop(1, '#3b0f5c'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!lo) {
      for (const st of this.stars) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + st.p); ctx.fillStyle = '#e0f2fe'; ctx.fillRect(st.x, st.y, st.r, st.r); }
      // a far-off glowing bubble planet
      const px = W * 0.8, py = 44, pr = 60;
      const pg = ctx.createRadialGradient(px - 18, py - 20, 4, px, py, pr);
      pg.addColorStop(0, this.bonus ? '#fdba74' : '#a5b4fc'); pg.addColorStop(0.6, this.bonus ? '#9a3412' : '#4338ca'); pg.addColorStop(1, 'rgba(30,27,75,0)');
      ctx.globalAlpha = 0.55; ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of this.floaters) {
      ctx.globalAlpha = 0.07; ctx.strokeStyle = COLORS[f.h]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x + Math.sin(t + f.r) * 6, f.y * 0.5, f.r * 0.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The table top: a sheet of dark glass leaning back, with the bubble grid etched into it. */
  drawTable(ctx, lo) {
    const cam = this.cam, x0 = LEFT - 14, x1 = W - LEFT + 14, y0 = TOP0 - 26, y1 = H + 80;
    const c = [cam.at(x0, y0), cam.at(x1, y0), cam.at(x1, y1), cam.at(x0, y1)];
    const g = ctx.createLinearGradient(0, c[0][1], 0, H);
    if (this.bonus) { g.addColorStop(0, '#2a0b3d'); g.addColorStop(1, '#4a1d1a'); }
    else { g.addColorStop(0, '#0d1236'); g.addColorStop(0.7, '#1c1550'); g.addColorStop(1, '#2a1252'); }
    ctx.fillStyle = g; ctx.beginPath(); c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    if (!lo) {
      // soft reflection band
      const r0 = cam.at(x0, 300), r1 = cam.at(x1, 300), r2 = cam.at(x1, 420), r3 = cam.at(x0, 420);
      const rg = ctx.createLinearGradient(0, r0[1], 0, r2[1]);
      rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.5, 'rgba(165,180,252,.05)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.lineTo(r2[0], r2[1]); ctx.lineTo(r3[0], r3[1]); ctx.closePath(); ctx.fill();
      // the grid: a dimple where every bubble could sit
      ctx.fillStyle = 'rgba(165,180,252,.10)';
      for (let row = 0; this.xy(row, 0)[1] < DANGER; row++) {
        for (let col = 0; col < this.ncols(row); col++) {
          if (this.at(row, col)) continue;
          const [x, y] = this.xy(row, col), [px, py, k] = cam.at(x, y);
          ctx.beginPath(); ctx.ellipse(px, py, 3 * k, 2.2 * k, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // the danger line, painted on the glass
    const low = this.cells().reduce((m, [row]) => Math.max(m, this.xy(row, 0)[1] + R), 0);
    const warn = !this.bonus && low > DANGER - ROWH * 2;
    const a = cam.at(LEFT, DANGER), b = cam.at(W - LEFT, DANGER);
    ctx.strokeStyle = warn ? `rgba(248,113,113,${0.5 + 0.5 * Math.sin(this.t * 10)})` : 'rgba(248,113,113,.4)';
    ctx.setLineDash([8, 8]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    if (warn) {
      const z = cam.at(LEFT, DANGER + 60);
      const wg = ctx.createLinearGradient(0, a[1], 0, z[1]);
      wg.addColorStop(0, `rgba(248,113,113,${0.12 + 0.08 * Math.sin(this.t * 10)})`); wg.addColorStop(1, 'rgba(248,113,113,0)');
      ctx.fillStyle = wg; ctx.fillRect(0, a[1], W, z[1] - a[1]);
    }
  }

  /** The ceiling block (it slides down when the ceiling drops) and the two side rails — solid lit 3D shapes. */
  drawWalls(ctx) {
    const cam = this.cam, top = this.top, x0 = LEFT - 14, x1 = W - LEFT + 14;
    const xf = ([x, y, z]) => cam.world(x, z, -y);       // mesh coords: x across, y = −height, z = board y
    const ceil = S.mk();
    S.box(ceil, [x0, -R * 2.4, TOP0 - 26], [x1, 0, top], 0, 1, 2);
    S.box(ceil, [x0, -R * 1.25, top - 1], [x1, -R * 0.95, top + 1.5], 3, 3, 3);        // glowing strip
    for (let x = LEFT + 14; x < W - LEFT; x += 40) S.box(ceil, [x - 3, -R * 2.1, top], [x + 3, -R * 1.6, top + 2.5], 4, 4, 4);   // rivets
    const rails = S.mk();
    S.box(rails, [x0, -R * 2.2, TOP0 - 26], [LEFT - 3, 0, H + 80], 0, 1, 2);
    S.box(rails, [W - LEFT + 3, -R * 2.2, TOP0 - 26], [x1, 0, H + 80], 0, 1, 2);
    const k = this.pushEvery ? clamp(this.pushT / this.pushEvery, 0, 1) : 0;
    const strip = this.freeze > 0 ? '#7dd3fc' : this.pushEvery && k > 0.8 ? '#f87171' : this.bonus ? '#f472b6' : '#a78bfa';
    const pal = this.bonus ? ['#6b2160', '#8a3468', '#3b0d33', strip, '#fbcfe8'] : ['#38425f', '#4b587d', '#1e2541', strip, '#cbd5e1'];
    S.drawMeshes(ctx, cam, [{ mesh: ceil, xf, pal }, { mesh: rails, xf, pal }]);
  }

  /** Soft contact shadow on the table under a bubble (the light is up-left, so it falls down-right). */
  drawShadow(ctx, x, y, r) {
    const cam = this.cam, sx = x + r * 0.35, sy = y + r * 0.3;
    const [px, py, k] = cam.at(sx, sy), up = cam.at(sx, sy - r)[1], dn = cam.at(sx, sy + r)[1];
    ctx.fillStyle = 'rgba(0,0,10,.35)';
    ctx.beginPath(); ctx.ellipse(px, py, r * k * 0.95, Math.max(1, (dn - up) / 2 * 0.95), 0, 0, Math.PI * 2); ctx.fill();
  }

  drawGuide(ctx) {
    const cam = this.cam, max = this.sight > 0 ? 9999 : this.guideLen;
    let x = GUN_X, y = GUN_Y, vx = Math.cos(this.aim), vy = -Math.sin(this.aim), len = 0;
    ctx.fillStyle = this.sight > 0 ? 'rgba(248,113,113,.95)' : 'rgba(255,255,255,.6)';
    const cells = this.cells().map(([row, c]) => this.xy(row, c));
    for (let i = 0; i < 400 && len < max; i++) {
      x += vx * 6; y += vy * 6; len += 6;
      if (x < LEFT + R) { x = LEFT + R; vx = -vx; }
      if (x > W - LEFT - R) { x = W - LEFT - R; vx = -vx; }
      if (y - R <= this.top || cells.some(([bx, by]) => (bx - x) ** 2 + (by - y) ** 2 < (D * 0.86) ** 2)) break;
      if (i % 3 === 0 && i > 5) { const [px, py, k] = cam.at(x, y, R); ctx.beginPath(); ctx.arc(px, py, 2.6 * k, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  drawLauncher(ctx) {
    const s = this.s, cam = this.cam, gold = s.gold;
    const k = clamp(this.clock / this.clockMax, 0, 1);
    const clockCol = this.bonus ? '#f472b6' : this.freeze > 0 ? '#7dd3fc' : k < 0.3 ? '#f87171' : '#fde047';
    const pal = gold ? ['#b45309', '#78350f', '#fde68a', clockCol] : ['#334155', '#0f172a', '#94a3b8', clockCol];
    const barrelPal = gold ? ['#d97706', '#78350f', '#fef3c7', '#fde047'] : ['#64748b', '#1e293b', '#e2e8f0', '#38bdf8'];
    const at = (gx, gy, rot = 0) => { const c = Math.cos(rot), sn = Math.sin(rot); return ([x, y, z]) => cam.world(gx + x * c - z * sn, gy + x * sn + z * c, -y); };
    const items = [
      { mesh: S.TURRET, xf: at(GUN_X, GUN_Y), pal },
      { mesh: S.BARREL, xf: at(GUN_X, GUN_Y, Math.PI / 2 - this.aim), pal: barrelPal },
    ];
    if (!this.bonus) items.push({ mesh: S.PEDESTAL, xf: at(NEXT_X, NEXT_Y), pal: gold ? ['#92400e', '#451a03', '#fbbf24'] : ['#1e293b', '#0b1020', '#64748b'] });
    S.drawMeshes(ctx, cam, items);

    // shot clock: a ring of light around the hub
    if (!this.bonus) {
      const sweep = Math.PI * 2 * (this.freeze > 0 ? 1 : k);
      ctx.strokeStyle = clockCol; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = -Math.PI / 2 + sweep * i / 40, [px, py] = cam.at(GUN_X + Math.cos(a) * (R + 9), GUN_Y + Math.sin(a) * (R + 9), 22.5);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    // loaded bubble sits in the hub
    if (!this.shot) this.drawBubble(ctx, GUN_X, GUN_Y, R, { c: this.cur, rainbow: this.bonus || this.rainbowShots > 0 }, 30);

    // next bubble on its stand
    if (!this.bonus) {
      const [lx, ly, lk] = cam.at(NEXT_X, NEXT_Y, 8 + R * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('NEXT ⇄', lx, ly - R * 0.8 * lk - 8);
      if (this.fog > 0) {
        const [px, py, pk] = cam.at(NEXT_X, NEXT_Y, 8 + R * 0.8);
        ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(px, py, R * 0.8 * pk, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; ctx.font = '900 16px system-ui'; ctx.textBaseline = 'middle'; ctx.fillText('?', px, py + 1); ctx.textBaseline = 'alphabetic';
      } else this.drawBubble(ctx, NEXT_X, NEXT_Y, R * 0.8, { c: this.next }, 8 + R * 0.8);
    }
    if (gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★ GOLDEN LAUNCHER', GUN_X, H - 26); }
  }

  /** A bubble on the board at (x, y), its centre `h` above the table (default: resting on it). */
  drawBubble(ctx, x, y, r, b, h = r) {
    const [px, py, k] = this.cam.at(x, y, h), rr = r * k;
    if (b.stone) {
      ctx.drawImage(this.stoneSpr, px - rr, py - rr, rr * 2, rr * 2);
      ctx.strokeStyle = 'rgba(15,23,42,.6)'; ctx.lineWidth = 1.5 * k;
      ctx.beginPath(); ctx.moveTo(px - rr * 0.4, py - rr * 0.2); ctx.lineTo(px, py + rr * 0.1); ctx.lineTo(px + rr * 0.2, py + rr * 0.5); ctx.moveTo(px, py + rr * 0.1); ctx.lineTo(px + rr * 0.45, py - rr * 0.15); ctx.stroke();
      return;
    }
    if (b.rainbow) {
      const rg = ctx.createConicGradient ? ctx.createConicGradient(this.t * 4, px, py) : null;
      if (rg) { COLORS.forEach((col, i) => rg.addColorStop(i / COLORS.length, col)); rg.addColorStop(1, COLORS[0]); ctx.fillStyle = rg; }
      else ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, rr * 0.98, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(this.shadeSpr, px - rr, py - rr, rr * 2, rr * 2);
    } else ctx.drawImage(this.spr[b.c < 0 ? 0 : b.c], px - rr, py - rr, rr * 2, rr * 2);
    // a hidden surprise: an occasional sparkle
    if (b.secret) {
      const ph = (this.t * 1.3 + (x * 7 + y * 3) % 10 / 10) % 2;
      if (ph < 0.5) {
        const a = Math.sin(ph / 0.5 * Math.PI), sx = px + rr * 0.35, sy = py - rr * 0.3, sz = rr * 0.5 * a;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz * 0.25, sy - sz * 0.25); ctx.lineTo(sx + sz, sy); ctx.lineTo(sx + sz * 0.25, sy + sz * 0.25);
        ctx.lineTo(sx, sy + sz); ctx.lineTo(sx - sz * 0.25, sy + sz * 0.25); ctx.lineTo(sx - sz, sy); ctx.lineTo(sx - sz * 0.25, sy - sz * 0.25); ctx.closePath(); ctx.fill();
      }
    }
    if (this.s.gold && b.c >= 0 && !b.rainbow && Math.sin(this.t * 2 + x) > 0.97) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(px + rr * 0.3, py + rr * 0.3, 2 * k, 0, Math.PI * 2); ctx.fill(); }
  }

  drawHud(ctx) {
    const s = this.s;
    ctx.fillStyle = 'rgba(3,5,20,.72)'; ctx.fillRect(0, 0, W, 46);
    if (this.bonus) {
      progressBar(ctx, 14, 13, W - 28, 20, s.bonusLeft / 15, '#f472b6', `★ BUBBLE BONANZA · ${this.popsBonus} popped · ${Math.ceil(s.bonusLeft)}s`);
      return;
    }
    const left = this.countColoured();
    progressBar(ctx, 14, 13, 200, 20, 1 - left / Math.max(1, this.total), '#22c55e', `Bubbles left ${left}`);
    if (this.pushEvery) {                                           // new-row timer, just under the HUD
      const k = clamp(this.pushT / this.pushEvery, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 46, W, 4);
      ctx.fillStyle = this.freeze > 0 ? '#7dd3fc' : k > 0.8 ? '#f87171' : '#f472b6'; ctx.fillRect(0, 46, W * k, 4);
    }
    // shots until the ceiling drops
    ctx.save(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '700 12px system-ui'; ctx.fillStyle = '#cbd5e1';
    ctx.fillText(this.freeze > 0 ? `❄️ ${Math.ceil(this.freeze)}s` : 'Ceiling', W - 14 - this.dropEvery * 14, 23);
    for (let i = 0; i < this.dropEvery; i++) {
      ctx.fillStyle = i < this.shotsLeft ? '#fde047' : '#475569';
      ctx.beginPath(); ctx.arc(W - 20 - i * 14, 23, 5, 0, Math.PI * 2); ctx.fill();
    }
    // active bonuses under the launcher row
    const tags = [];
    if (this.rainbowShots > 0) tags.push(`🌈 ×${this.rainbowShots}`);
    if (this.sight > 0) tags.push(`🎯 ${this.sight}`);
    if (this.fog > 0) tags.push(`🌫️ ${this.fog}`);
    ctx.textAlign = 'right'; ctx.font = '700 13px system-ui'; ctx.fillStyle = '#e2e8f0';
    ctx.fillText(tags.join('   '), W - 16, H - 40);
    ctx.textAlign = 'center'; ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.45)';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Drag to aim · let go to fire · tap NEXT to swap' : 'Aim with the mouse · click to fire · ← → + Space · ↑ swap', W / 2, H - 12);
    ctx.restore();
  }
}

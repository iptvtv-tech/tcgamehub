// ─────────────────────────────────────────────────────────────
//  BUBBLE BLITZ — game 14 (Zone 3 · Master)
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
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

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
  onPointerMove(x, y) { if (y < GUN_Y + 10) this.setAimFrom(x, y); }
  onAction(a, x, y) {
    const s = this.s;
    if (a === 'press') { if (Math.hypot(x - NEXT_X, y - NEXT_Y) < 30) { this.swap(); this.swapTap = true; return; } this.swapTap = false; if (y < GUN_Y + 10) this.setAimFrom(x, y); return; }
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
      const [x, y] = this.xy(row, c);
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
      this.popping.push({ x, y, col: b.stone ? '#94a3b8' : COLORS[b.c], t: 0 });
      this.s.fx.burst(x, y, { colors: [b.stone ? '#94a3b8' : COLORS[b.c], '#fff'], count: 7, speed: 160, life: 0.35, size: 2.5 });
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
    const s = this.s, L = this.level, [x, y] = this.xy(e.row, e.c);
    const bonus = BONUSES.includes(e.kind);
    s.fx.text(clamp(x, 95, W - 95), y - 24, `${ICON[e.kind]} ${LABEL[e.kind]}`, { color: bonus ? '#fde047' : '#fca5a5', size: 18, life: 1.2 });
    if (bonus) { this.found = (this.found || 0) + 1; if (this.found >= 8) s.unlock('treasure'); s.sound.play('powerup'); }
    else { s.sound.play('hit'); s.fx.shake(5, 0.2); }
    let n = 0;
    switch (e.kind) {
      case 'bomb': {
        const list = this.cells().filter(([rr, cc]) => { const [bx, by] = this.xy(rr, cc); return Math.hypot(bx - x, by - y) < D * 2.1; }).map(([rr, cc]) => [rr, cc]);
        s.fx.ring(x, y, { color: '#fb923c', radius: D * 2.2, width: 4 }); s.sound.play('boom');
        n = this.pop(list, effects); break;
      }
      case 'bolt': {
        const list = (this.grid[e.row] || []).map((b, cc) => (b ? [e.row, cc] : null)).filter(Boolean);
        s.fx.flash('#e0f2fe', 0.3);
        n = this.pop(list, effects); break;
      }
      case 'rainbow': this.rainbowShots += 2; break;
      case 'star': s.award(250 * L, x, y, { color: '#fde047', size: 22 }); break;
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
      const [x, y] = this.xy(row, c);
      this.falling.push({ x, y, vx: s.rng.range(-60, 60), vy: s.rng.range(-120, 0), col: b.stone ? '#94a3b8' : COLORS[b.c], stone: b.stone });
      if (b.secret) {
        if (BONUSES.includes(b.secret)) {
          s.fx.text(clamp(x, 70, W - 70), y, `${ICON[b.secret]} KEPT!`, { color: '#fde047', size: 16 });
          this.found = (this.found || 0) + 1; if (this.found >= 8) s.unlock('treasure');
          if (b.secret === 'star') s.award(250 * L, x, y - 20, { color: '#fde047' });
          else if (b.secret === 'rainbow') this.rainbowShots += 2;
          else if (b.secret === 'freeze') this.freeze = 8;
          else if (b.secret === 'sight') this.sight = 6;
          else s.award(100 * L, x, y - 20, { color: '#fde047' });          // bomb / lightning: cashed in for points
        } else s.fx.text(clamp(x, 80, W - 80), y, `${ICON[b.secret]} DEFUSED`, { color: '#a7f3d0', size: 14 });
      }
      this.grid[row][c] = null;
      n++;
    }
    if (n) {
      s.award(Math.round(n * 20 * L * Math.min(2.5, 1 + Math.floor(n / 5) * 0.5)), W / 2, this.top + 120, { color: '#a5f3fc', size: 22 });
      [0, 3, 7, 12].forEach((st, i) => s.sound.tone({ freq: s.sound.note(76 - st), dur: 0.08, type: 'triangle', vol: 0.07, delay: i * 0.05 }));
      if (n >= 5) s.fx.text(W / 2, this.top + 90, `${n} DROPPED!`, { color: '#a5f3fc', size: 24 });
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
        this.s.fx.text(W / 2, DANGER - 40, 'TOO LOW!', { color: '#f87171', size: 36, life: 1.2 });
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

  // ── Draw ──────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#3b0764'); g.addColorStop(1, '#7c2d12'); }
    else { g.addColorStop(0, '#0c1445'); g.addColorStop(1, '#3b0f5c'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const f of this.floaters) {
      ctx.globalAlpha = 0.08; ctx.strokeStyle = COLORS[f.h]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x + Math.sin(t + f.r) * 6, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // walls, ceiling and the danger line
    ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(LEFT, this.top, COLS * D, DANGER - this.top);
    const cg = ctx.createLinearGradient(0, this.top - 14, 0, this.top);
    cg.addColorStop(0, '#475569'); cg.addColorStop(1, '#94a3b8');
    ctx.fillStyle = cg; ctx.fillRect(LEFT - 6, TOP0 - 14, COLS * D + 12, this.top - TOP0 + 14);
    ctx.fillStyle = '#1e293b';
    for (let x = LEFT + 14; x < W - LEFT; x += 40) { ctx.beginPath(); ctx.arc(x, this.top - 7, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#64748b'; ctx.fillRect(LEFT - 6, TOP0 - 14, 4, H); ctx.fillRect(W - LEFT + 2, TOP0 - 14, 4, H);
    const low = this.cells().reduce((m, [row]) => Math.max(m, this.xy(row, 0)[1] + R), 0);
    const warn = !this.bonus && low > DANGER - ROWH * 2;
    ctx.strokeStyle = warn ? `rgba(248,113,113,${0.5 + 0.5 * Math.sin(t * 10)})` : 'rgba(248,113,113,.35)';
    ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(LEFT, DANGER); ctx.lineTo(W - LEFT, DANGER); ctx.stroke(); ctx.setLineDash([]);

    // bubbles
    for (const [row, c, b] of this.cells()) { const [x, y] = this.xy(row, c); this.drawBubble(ctx, x, y, R, b); }
    for (const p of this.popping) {
      const k = p.t / 0.25;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * (1 + k * 0.7), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const f of this.falling) this.drawBubble(ctx, f.x, f.y, R, { c: COLORS.indexOf(f.col), stone: f.stone });

    // aim guide
    if (s.state === 'playing' && !this.shot && this.fog <= 0) this.drawGuide(ctx);

    // flying shot
    if (this.shot) this.drawBubble(ctx, this.shot.x, this.shot.y, R, { c: this.shot.c, rainbow: this.shot.rainbow });

    this.drawLauncher(ctx);
    this.drawHud(ctx);
  }

  drawGuide(ctx) {
    const max = this.sight > 0 ? 9999 : this.guideLen;
    let x = GUN_X, y = GUN_Y, vx = Math.cos(this.aim), vy = -Math.sin(this.aim), len = 0;
    ctx.fillStyle = this.sight > 0 ? 'rgba(248,113,113,.9)' : 'rgba(255,255,255,.55)';
    const cells = this.cells().map(([row, c]) => this.xy(row, c));
    for (let i = 0; i < 400 && len < max; i++) {
      x += vx * 6; y += vy * 6; len += 6;
      if (x < LEFT + R) { x = LEFT + R; vx = -vx; }
      if (x > W - LEFT - R) { x = W - LEFT - R; vx = -vx; }
      if (y - R <= this.top || cells.some(([bx, by]) => (bx - x) ** 2 + (by - y) ** 2 < (D * 0.86) ** 2)) break;
      if (i % 3 === 0 && i > 5) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  drawLauncher(ctx) {
    const s = this.s, gold = s.gold;
    // base
    ctx.save();
    ctx.fillStyle = gold ? '#b45309' : '#1e293b';
    ctx.beginPath(); ctx.arc(GUN_X, GUN_Y + 34, 46, Math.PI, 0); ctx.fill();
    // barrel
    ctx.translate(GUN_X, GUN_Y); ctx.rotate(-this.aim + Math.PI / 2);
    const bg = ctx.createLinearGradient(-14, 0, 14, 0);
    bg.addColorStop(0, gold ? '#92400e' : '#334155'); bg.addColorStop(0.5, gold ? '#fde68a' : '#94a3b8'); bg.addColorStop(1, gold ? '#92400e' : '#334155');
    ctx.fillStyle = bg; roundRect(ctx, -13, -58, 26, 58, 8); ctx.fill();
    ctx.fillStyle = gold ? '#fbbf24' : '#cbd5e1'; ctx.fillRect(-15, -62, 30, 8);
    ctx.restore();
    // loaded bubble + shot clock ring
    if (!this.shot) this.drawBubble(ctx, GUN_X, GUN_Y, R, { c: this.cur, rainbow: this.bonus || this.rainbowShots > 0 });
    if (!this.bonus) {
      const k = clamp(this.clock / this.clockMax, 0, 1);
      ctx.strokeStyle = this.freeze > 0 ? '#7dd3fc' : k < 0.3 ? '#f87171' : '#fde047'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(GUN_X, GUN_Y, R + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.freeze > 0 ? 1 : k)); ctx.stroke();
    }
    // next bubble
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.bonus ? '' : 'NEXT ⇄', NEXT_X, NEXT_Y - 26);
    if (!this.bonus) {
      if (this.fog > 0) { ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(NEXT_X, NEXT_Y, R * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e2e8f0'; ctx.font = '900 16px system-ui'; ctx.textBaseline = 'middle'; ctx.fillText('?', NEXT_X, NEXT_Y + 1); ctx.textBaseline = 'alphabetic'; }
      else this.drawBubble(ctx, NEXT_X, NEXT_Y, R * 0.8, { c: this.next });
    }
    if (gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 11px system-ui'; ctx.fillText('★ GOLDEN LAUNCHER', GUN_X, H - 8); }
  }

  drawBubble(ctx, x, y, r, b) {
    ctx.save();
    if (b.stone) {
      const sg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 2, x, y, r);
      sg.addColorStop(0, '#cbd5e1'); sg.addColorStop(1, '#475569');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 0.2); ctx.lineTo(x, y + r * 0.1); ctx.lineTo(x + r * 0.2, y + r * 0.5); ctx.moveTo(x, y + r * 0.1); ctx.lineTo(x + r * 0.45, y - r * 0.15); ctx.stroke();
      ctx.restore(); return;
    }
    if (b.rainbow) {
      const rg = ctx.createConicGradient ? ctx.createConicGradient(this.t * 4, x, y) : null;
      if (rg) { COLORS.forEach((col, i) => rg.addColorStop(i / COLORS.length, col)); rg.addColorStop(1, COLORS[0]); ctx.fillStyle = rg; }
      else ctx.fillStyle = '#fff';
    } else {
      const k = b.c < 0 ? 0 : b.c;
      const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, COLORS[k]); gr.addColorStop(1, SHADES[k]);
      ctx.fillStyle = gr;
    }
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
    // a hidden surprise: an occasional sparkle
    if (b.secret) {
      const ph = (this.t * 1.3 + (x * 7 + y * 3) % 10 / 10) % 2;
      if (ph < 0.5) {
        const a = Math.sin(ph / 0.5 * Math.PI), sx = x + r * 0.35, sy = y - r * 0.3, sz = r * 0.5 * a;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz * 0.25, sy - sz * 0.25); ctx.lineTo(sx + sz, sy); ctx.lineTo(sx + sz * 0.25, sy + sz * 0.25);
        ctx.lineTo(sx, sy + sz); ctx.lineTo(sx - sz * 0.25, sy + sz * 0.25); ctx.lineTo(sx - sz, sy); ctx.lineTo(sx - sz * 0.25, sy - sz * 0.25); ctx.closePath(); ctx.fill();
      }
    }
    if (this.s.gold && b.c >= 0 && !b.rainbow && Math.sin(this.t * 2 + x) > 0.97) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
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

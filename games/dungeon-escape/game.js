// ─────────────────────────────────────────────────────────────
//  DUNGEON ESCAPE 3D — game 17 (Zone 3 · Master)
//  First-person maze escape. A new maze every level: find the keys, reach the
//  golden stairs — before your torch burns out and before the ghouls catch you.
//  Your torch light shrinks as the fuel runs down; grab spare torches.
//  ⚡ FLASH (Space) stuns ghouls in front of you for a few seconds.
//    L1 1 key, 1 ghoul   L3 spike traps, 2 keys   L7 3 keys   bigger mazes, more & faster ghouls
//  Every 5th level: ★ TREASURE VAULT — 15 s to scoop up gold, nothing can hurt you.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';
import { Raycaster, makeTextures, makeSprites, tryMove, canSee } from '../../assets/js/raycast.js';

const ID = 'dungeon-escape';
const W = 480, H = 720;
const VIEW = { x: 0, y: 44, w: 480, h: 500 };
const PANEL_Y = VIEW.y + VIEW.h;

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 4,
  comboStep: 3,
  maxMultiplier: 4,
  bonusTime: 15,
  music: { bpm: 118, style: 'chase', lead: 'square', arp: [0, 2, 1, 2, 0, 3, 1, 2], oct: [12, 12, 12, 12, 12, 12, 12, 12], bass: 'half' },
  levelInfo(level, bonus) {
    if (bonus) return '★ TREASURE VAULT! Scoop up as much gold as you can in 15 seconds.';
    const notes = {
      1: 'Walk: ↑ ↓ · Turn: ← → (touch: hold left/right side to turn, middle to walk). Find the 🔑 key, then the golden stairs. Don\'t let your torch go out!',
      2: 'Ghouls wander the halls… and hunt you when they see you. ⚡ Space = FLASH to stun them.',
      3: '🔺 Spike traps! Cross when the spikes are down. Two keys now.',
      5: '',
      7: 'Three keys, and the ghouls are getting faster.',
    };
    return notes[level] || 'Bigger maze, more ghouls. Keep moving!';
  },
  create: (shell) => new DungeonEscape(shell),
});

class DungeonEscape {
  constructor(s) {
    this.s = s; this.t = 0;
    this.rc = new Raycaster({ ...VIEW, cols: 160 });
    this.tex = makeTextures(); this.spr = makeSprites();
    this.startLevel(1, false);
  }

  reset() {}

  // ── Maze ───────────────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.flashes = 2; this.flashT = 0; this.flashUsed = false; this.hurtT = 0;
    this.keysHave = 0; this.coins = 0; this.livesAtStart = s.lives; this.done = 0; this.flashCharge = 0;
    if (bonus) return this.buildVault();
    const n = Math.min(11, 4 + Math.floor(level / 2));
    this.buildMaze(n, n, r);
    this.keysNeed = level <= 2 ? 1 : level <= 6 ? 2 : 3;
    const cells = this.floorCellsByDistance();
    const far = cells.filter((c) => c.d > cells[cells.length - 1].d * 0.45);
    const exitC = cells[cells.length - 1];
    this.items = [{ kind: 'exit', x: exitC.x + 0.5, y: exitC.y + 0.5 }];
    const used = new Set([exitC.x + ',' + exitC.y, '1,1']);
    const pickFar = (minD) => {
      for (let tries = 0; tries < 200; tries++) {
        const c = r.pick(far); const k = c.x + ',' + c.y;
        if (used.has(k) || c.d < minD) continue;
        if ([...used].some((u) => { const [ux, uy] = u.split(',').map(Number); return Math.abs(ux - c.x) + Math.abs(uy - c.y) < 4; })) continue;
        used.add(k); return c;
      }
      const c = r.pick(far); used.add(c.x + ',' + c.y); return c;
    };
    for (let i = 0; i < this.keysNeed; i++) { const c = pickFar(6); this.items.push({ kind: 'key', x: c.x + 0.5, y: c.y + 0.5 }); }
    const torches = 1 + Math.floor(n / 3);
    for (let i = 0; i < torches; i++) { const c = r.pick(cells.filter((q) => q.d > 5)); this.items.push({ kind: 'torch', x: c.x + 0.5, y: c.y + 0.5 }); }
    for (let i = 0; i < n * 2; i++) { const c = r.pick(cells.filter((q) => q.d > 2)); this.items.push({ kind: 'coin', x: c.x + 0.5 + r.range(-0.2, 0.2), y: c.y + 0.5 + r.range(-0.2, 0.2) }); }
    // spike traps sit in corridors (cells with exactly two open neighbours in a line)
    this.spikes = [];
    if (level >= 3) {
      const corridors = cells.filter((c) => c.d > 3 && !used.has(c.x + ',' + c.y) && ((this.open(c.x - 1, c.y) && this.open(c.x + 1, c.y) && !this.open(c.x, c.y - 1) && !this.open(c.x, c.y + 1)) || (this.open(c.x, c.y - 1) && this.open(c.x, c.y + 1) && !this.open(c.x - 1, c.y) && !this.open(c.x + 1, c.y))));
      const nS = Math.min(10, 2 + level);
      for (let i = 0; i < nS && corridors.length; i++) { const c = corridors.splice(r.int(0, corridors.length - 1), 1)[0]; this.spikes.push({ x: c.x, y: c.y, phase: r.range(0, 3) }); }
    }
    // ghouls start far from you
    this.ghouls = [];
    const nG = Math.min(7, level === 1 ? 1 : 1 + Math.floor(level / 2));
    for (let i = 0; i < nG; i++) { const c = r.pick(cells.filter((q) => q.d > Math.max(6, cells[cells.length - 1].d * 0.4))); this.ghouls.push(this.newGhoul(c)); }
    this.fuelMax = Math.round(40 + n * n * 1.1);
    this.fuel = this.fuelMax;
    this.placePlayer();
  }

  newGhoul(c) { return { x: c.x + 0.5, y: c.y + 0.5, home: c, tx: c.x, ty: c.y, stun: 0, hunting: false, growlT: 0 }; }

  buildMaze(cw, ch, r) {
    const gw = cw * 2 + 1, gh = ch * 2 + 1;
    const g = Array.from({ length: gh }, () => new Array(gw).fill(2));
    const seen = new Set(), stack = [[0, 0]];
    seen.add('0,0'); g[1][1] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !seen.has(x + ',' + y));
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = nb[Math.floor(r.next() * nb.length)];
      g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0; g[ny * 2 + 1][nx * 2 + 1] = 0;
      seen.add(nx + ',' + ny); stack.push([nx, ny]);
    }
    // knock out a few extra walls so there are loops to escape round
    const loops = Math.floor(cw * ch * 0.14);
    for (let i = 0; i < loops; i++) {
      const x = 1 + Math.floor(r.next() * (gw - 2)), y = 1 + Math.floor(r.next() * (gh - 2));
      if (g[y][x] && ((x % 2 === 0 && y % 2 === 1) || (x % 2 === 1 && y % 2 === 0))) g[y][x] = 0;
    }
    // wall textures: mostly stone, some moss and brick
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (g[y][x]) { const q = r.next(); g[y][x] = q < 0.18 ? 3 : q < 0.3 ? 1 : 2; }
    this.map = g; this.gw = gw; this.gh = gh;
    this.seen = Array.from({ length: gh }, () => new Array(gw).fill(false));
  }

  buildVault() {
    const r = this.s.rng, n = 11;
    this.map = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (x === 0 || y === 0 || x === n - 1 || y === n - 1 ? 1 : 0)));
    for (const [x, y] of [[3, 3], [7, 3], [3, 7], [7, 7], [5, 5]]) this.map[y][x] = 13;
    this.gw = n; this.gh = n;
    this.seen = Array.from({ length: n }, () => new Array(n).fill(true));
    this.items = [];
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) if (!this.map[y][x] && !(x === 1 && y === 1)) for (let k = 0; k < 2; k++) this.items.push({ kind: 'coin', x: x + 0.3 + r.range(0, 0.4), y: y + 0.3 + r.range(0, 0.4) });
    for (let i = 0; i < 3; i++) this.items.push({ kind: 'chest', x: r.int(2, n - 3) + 0.5, y: r.int(2, n - 3) + 0.5 });
    this.ghouls = []; this.spikes = []; this.keysNeed = 0;
    this.fuel = this.fuelMax = 99;
    this.placePlayer();
  }

  placePlayer() {
    this.p = { x: 1.5, y: 1.5, a: this.open(2, 1) ? 0 : Math.PI / 2, walk: 0 };
  }

  open(x, y) { return x >= 0 && y >= 0 && x < this.gw && y < this.gh && !this.map[y][x]; }
  solid = (x, y) => !this.open(x, y);

  floorCellsByDistance(fx = 1, fy = 1) {
    const d = new Map([[fx + ',' + fy, 0]]), q = [[fx, fy]], out = [];
    while (q.length) {
      const [x, y] = q.shift(), k = d.get(x + ',' + y);
      out.push({ x, y, d: k });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (this.open(nx, ny) && !d.has(nx + ',' + ny)) { d.set(nx + ',' + ny, k + 1); q.push([nx, ny]); } }
    }
    return out;
  }

  /** Next cell on the shortest path from (ax,ay) towards (bx,by). */
  stepToward(ax, ay, bx, by) {
    const key = (x, y) => x + ',' + y, prev = new Map([[key(bx, by), null]]), q = [[bx, by]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === ax && y === ay) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (this.open(nx, ny) && !prev.has(key(nx, ny))) { prev.set(key(nx, ny), [x, y]); q.push([nx, ny]); } }
    }
    return prev.get(key(ax, ay)) || [ax, ay];
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x, y) {
    if (a === 'action') this.flash();
    if (a === 'press' && Math.hypot(x - (W - 58), y - (PANEL_Y + 88)) < 40) this.flash();
  }
  controls() {
    const inp = this.s.input, p = inp.pointer;
    let fwd = inp.isDown('up') ? 1 : 0, back = inp.isDown('down'), turn = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
    if (p.down && p.y >= VIEW.y && p.y < PANEL_Y) {
      if (p.x < W * 0.3) turn = -1; else if (p.x > W * 0.7) turn = 1; else fwd = 1;
      if (p.x < W * 0.3 || p.x > W * 0.7) fwd = p.y < VIEW.y + VIEW.h * 0.55 ? 1 : fwd;   // upper corners: walk while turning
    }
    if (p.down && p.y >= PANEL_Y && Math.abs(p.x - W / 2) < 70) back = true;
    return { fwd, back, turn };
  }

  flash() {
    const s = this.s, p = this.p;
    if (this.bonus || this.flashes <= 0 || this.flashT > 0) return;
    this.flashes--; this.flashT = 0.35; this.flashUsed = true;
    s.sound.tone({ freq: 2000, to: 300, dur: 0.3, type: 'sawtooth', vol: 0.07 }); s.sound.noise({ dur: 0.2, vol: 0.12, freq: 6000, type: 'highpass' });
    for (const g of this.ghouls) {
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d < 6.5 && Math.abs(da) < 0.8 && canSee(this.solid, p.x, p.y, g.x, g.y)) {
        g.stun = 3.5; g.hunting = false;
        s.award(100 * this.level, W / 2, VIEW.y + 120, { chain: true, color: '#e0f2fe', size: 18 });
      }
    }
  }

  onLifeLost() {
    this.placePlayer();
    this.hurtT = 0;
    if (this.fuel < 25) this.fuel = Math.min(this.fuelMax, 30);
    // ghouls go back to their lairs
    for (const g of this.ghouls) { g.x = g.home.x + 0.5; g.y = g.home.y + 0.5; g.tx = g.home.x; g.ty = g.home.y; g.hunting = false; g.stun = 1.5; }
  }

  idle(dt) { this.t += dt; }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s, p = this.p, L = this.level;
    this.t += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) s.hurt(); return; }

    // walking
    const c = this.controls();
    p.a += c.turn * 2.5 * dt;
    const sp = 2.7 * dt * ((c.fwd ? 1 : 0) - (c.back ? 0.7 : 0));
    if (sp) { tryMove(this.solid, p, Math.cos(p.a) * sp, Math.sin(p.a) * sp, 0.22); p.walk += dt * 9; if (Math.floor(p.walk / Math.PI) !== Math.floor((p.walk - dt * 9) / Math.PI)) s.sound.noise({ dur: 0.04, vol: 0.04, freq: 500, type: 'lowpass' }); }
    // what you've seen goes on the map
    const px = Math.floor(p.x), py = Math.floor(p.y);
    for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) if (y >= 0 && x >= 0 && y < this.gh && x < this.gw) this.seen[y][x] = true;

    // torch
    if (!this.bonus) {
      this.fuel -= dt;
      if (this.fuel <= 10 && Math.ceil(this.fuel) !== Math.ceil(this.fuel + dt) && this.fuel > 0) s.sound.play('tick');
      if (this.fuel <= 0) {
        this.fuel = 0;
        s.fx.text(W / 2, VIEW.y + 180, 'YOUR TORCH WENT OUT…', { color: '#f87171', size: 26, life: 1.4 });
        s.sound.play('lose'); this.hurtT = 0.8; return;
      }
    }
    // a flash recharges slowly
    this.flashCharge = (this.flashCharge || 0) + dt;
    if (this.flashCharge > 14 && this.flashes < 2) { this.flashes++; this.flashCharge = 0; }

    // items
    for (const it of this.items) {
      if (it.got || Math.hypot(it.x - p.x, it.y - p.y) > 0.5) continue;
      if (it.kind === 'coin') { it.got = true; this.coins++; s.award((this.bonus ? 15 : 20) * L, W / 2, VIEW.y + 260, { chain: this.bonus, color: '#fde047', size: 14 }); s.sound.play('coin', this.coins % 8); if (this.bonus && this.coins >= 100) s.unlock('hoard'); }
      else if (it.kind === 'chest') { it.got = true; s.award(500 * L, W / 2, VIEW.y + 240, { color: '#fde047', size: 22 }); s.sound.play('powerup'); }
      else if (it.kind === 'key') { it.got = true; this.keysHave++; s.award(300 * L, W / 2, VIEW.y + 220, { chain: true, color: '#fbbf24', size: 20 }); s.fx.text(W / 2, VIEW.y + 180, this.keysHave >= this.keysNeed ? '🔑 ALL KEYS! Find the golden stairs!' : `🔑 KEY ${this.keysHave} / ${this.keysNeed}`, { color: '#fbbf24', size: 22 }); [0, 4, 7, 12].forEach((st, i) => s.sound.tone({ freq: s.sound.note(84 + st), dur: 0.1, type: 'triangle', vol: 0.07, delay: i * 0.05 })); }
      else if (it.kind === 'torch') { it.got = true; this.fuel = Math.min(this.fuelMax, this.fuel + 20); s.award(50 * L, W / 2, VIEW.y + 240, { color: '#fb923c', size: 16 }); s.fx.text(W / 2, VIEW.y + 200, '🔥 +20s TORCH', { color: '#fb923c', size: 20 }); s.sound.noise({ dur: 0.3, vol: 0.12, freq: 900, type: 'bandpass' }); }
      else if (it.kind === 'exit') {
        if (this.keysHave >= this.keysNeed) return this.escape();
        if (!this.exitWarn || this.t - this.exitWarn > 2) { this.exitWarn = this.t; s.fx.text(W / 2, VIEW.y + 200, `🔒 Need ${this.keysNeed - this.keysHave} more key${this.keysNeed - this.keysHave > 1 ? 's' : ''}`, { color: '#fca5a5', size: 20 }); s.sound.tone({ freq: 160, dur: 0.15, type: 'square', vol: 0.06 }); }
      }
    }

    // spikes
    for (const sp2 of this.spikes) {
      sp2.up = ((this.t + sp2.phase) % 2.8) < 1.1;
      if (sp2.up && !sp2.wasUp && Math.hypot(sp2.x + 0.5 - p.x, sp2.y + 0.5 - p.y) < 5) s.sound.tone({ freq: 900, to: 400, dur: 0.06, type: 'square', vol: 0.04 });
      sp2.wasUp = sp2.up;
      if (sp2.up && px === sp2.x && py === sp2.y) { s.fx.flash('#ef4444', 0.4); s.fx.text(W / 2, VIEW.y + 200, 'SPIKES!', { color: '#f87171', size: 30 }); s.sound.play('hit'); this.hurtT = 0.5; return; }
    }

    // ghouls
    let nearest = 99;
    const gSpeed = Math.min(2.4, 1.35 + L * 0.07);
    for (const g of this.ghouls) {
      if (g.stun > 0) { g.stun -= dt; continue; }
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      const sees = d < 7.5 && canSee(this.solid, g.x, g.y, p.x, p.y);
      if (sees && !g.hunting) { g.hunting = true; s.sound.tone({ freq: 140, to: 70, dur: 0.5, type: 'sawtooth', vol: 0.08 }); }
      if (g.hunting && d > 11) g.hunting = false;
      const gx = Math.floor(g.x), gy = Math.floor(g.y);
      // pick the next cell: towards you when hunting, otherwise wander
      if (Math.hypot(g.tx + 0.5 - g.x, g.ty + 0.5 - g.y) < 0.08) {
        if (g.hunting) [g.tx, g.ty] = this.stepToward(gx, gy, px, py);
        else {
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [gx + dx, gy + dy]).filter(([x, y]) => this.open(x, y));
          const pick = opts.filter(([x, y]) => x !== g.lx || y !== g.ly);
          [g.tx, g.ty] = s.rng.pick(pick.length ? pick : opts);
          g.lx = gx; g.ly = gy;
        }
      }
      const v = (g.hunting ? gSpeed : gSpeed * 0.55) * dt, dx = g.tx + 0.5 - g.x, dy = g.ty + 0.5 - g.y, dl = Math.hypot(dx, dy) || 1;
      g.x += dx / dl * Math.min(v, dl); g.y += dy / dl * Math.min(v, dl);
      if (d < nearest) nearest = d;
      if (d < 0.5) {
        s.fx.flash('#16a34a', 0.5); s.fx.shake(10, 0.4);
        s.fx.text(W / 2, VIEW.y + 200, 'CAUGHT!', { color: '#86efac', size: 34 });
        s.sound.noise({ dur: 0.6, vol: 0.3, freq: 700, to: 100 }); s.sound.tone({ freq: 90, to: 40, dur: 0.6, type: 'sawtooth', vol: 0.15 });
        this.hurtT = 0.7; return;
      }
    }
    // heartbeat when something is close
    this.beatT = (this.beatT || 0) - dt;
    if (nearest < 6 && this.beatT <= 0) {
      this.beatT = 0.3 + nearest * 0.12;
      s.sound.tone({ freq: 60, to: 40, dur: 0.12, type: 'sine', vol: 0.18 }); s.sound.tone({ freq: 55, to: 38, dur: 0.1, type: 'sine', vol: 0.12, delay: 0.14 });
    }
    this.nearest = nearest;
  }

  escape() {
    const s = this.s, L = this.level;
    if (this.done === L || s.state !== 'playing') return;
    this.done = L;
    s.award(500 * L + Math.floor(this.fuel) * 8 * L, W / 2, VIEW.y + 200, { color: '#fde047', size: 26 });
    s.fx.text(W / 2, VIEW.y + 150, 'ESCAPED!', { color: '#fde047', size: 40, life: 1.4 });
    if (this.fuel > this.fuelMax / 2) s.unlock('speedrun');
    if (L >= 3 && !this.flashUsed) s.unlock('nostun');
    if (L >= 3 && s.lives >= this.livesAtStart) s.unlock('untouched');
    s.completeLevel();
  }

  onLevelClear() { if (this.bonus && this.coins >= 100) this.s.unlock('hoard'); }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, p = this.p, t = this.t;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    const light = this.bonus ? 9 : 2.2 + 4.8 * Math.min(1, this.fuel / 30) + Math.sin(t * 13) * 0.12;
    const sprites = [];
    for (const it of this.items) {
      if (it.got) continue;
      const img = { coin: this.spr.coin, key: this.spr.key, torch: this.spr.torch, exit: this.spr.stairs, chest: this.spr.chest }[it.kind];
      sprites.push({ x: it.x, y: it.y, img, scale: it.kind === 'coin' ? 0.6 : it.kind === 'exit' ? 1 : 0.55, lift: it.kind === 'key' ? 0.08 + Math.sin(t * 3) * 0.04 : 0, glow: it.kind !== 'coin' });
    }
    for (const sp of this.spikes) sprites.push({ x: sp.x + 0.5, y: sp.y + 0.5, img: sp.up ? this.spr.spikes : this.spr.spikesdown, scale: 0.9 });
    for (const g of this.ghouls) sprites.push({ x: g.x, y: g.y, img: this.spr.ghoul, scale: 0.85, alpha: g.stun > 0 ? 0.45 + 0.3 * Math.sin(t * 20) : 1, lift: Math.sin(t * 4 + g.home.x) * 0.03 });
    const bob = Math.sin(p.walk) * 5;
    this.rc.render(ctx, (x, y) => (x < 0 || y < 0 || x >= this.gw || y >= this.gh ? 2 : this.map[y][x]), p, {
      tex: this.tex, light, sprites, bob,
      ceil: [this.bonus ? '#422006' : '#1c1917'], floor: [this.bonus ? '#78350f' : '#3f3a36'],
    });
    // torchlight glow & hurt flash
    const tg = ctx.createRadialGradient(W / 2, PANEL_Y, 30, W / 2, PANEL_Y, 360);
    tg.addColorStop(0, 'rgba(251,146,60,.14)'); tg.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, VIEW.y, W, VIEW.h);
    if (this.flashT > 0) { ctx.fillStyle = `rgba(224,242,254,${this.flashT * 2})`; ctx.fillRect(0, VIEW.y, W, VIEW.h); }
    if (this.nearest < 3 && !this.bonus) { ctx.fillStyle = `rgba(127,29,29,${(3 - this.nearest) * 0.08 * (0.6 + 0.4 * Math.sin(t * 8))})`; ctx.fillRect(0, VIEW.y, W, VIEW.h); }
    this.drawHand(ctx, bob);
    this.drawPanel(ctx);
  }

  drawHand(ctx, bob) {
    const t = this.t, x = W - 110, y = PANEL_Y - 20 + bob * 1.4;
    ctx.save();
    ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.moveTo(x - 10, y + 30); ctx.lineTo(x + 6, y - 60); ctx.lineTo(x + 20, y - 58); ctx.lineTo(x + 12, y + 30); ctx.fill();
    const f = this.bonus ? 1 : Math.min(1, this.fuel / 25);
    const fg = ctx.createRadialGradient(x + 13, y - 80, 2, x + 13, y - 76, 36 * (0.5 + f * 0.5));
    fg.addColorStop(0, '#fef9c3'); fg.addColorStop(0.4, '#fb923c'); fg.addColorStop(1, 'rgba(234,88,12,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(x + 13, y - 80 + Math.sin(t * 15) * 2, 22 * (0.5 + f * 0.5), 34 * (0.5 + f * 0.5), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.s.gold ? '#fbbf24' : '#d6a57a'; ctx.beginPath(); ctx.ellipse(x + 2, y + 34, 26, 16, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawPanel(ctx) {
    const s = this.s, p = this.p, t = this.t;
    // top HUD
    ctx.fillStyle = 'rgba(3,5,20,.9)'; ctx.fillRect(0, 0, W, VIEW.y);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ TREASURE VAULT · ${this.coins} gold · ${Math.ceil(s.bonusLeft)}s`);
    else {
      const k = this.fuel / this.fuelMax;
      progressBar(ctx, 14, 12, 250, 20, k, k < 0.2 ? '#ef4444' : '#fb923c', `🔥 Torch ${Math.ceil(this.fuel)}s`);
      ctx.font = '800 15px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fbbf24';
      ctx.fillText(`🔑 ${this.keysHave} / ${this.keysNeed}`, W - 14, 23);
    }
    // bottom panel
    ctx.fillStyle = '#0c0a09'; ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
    ctx.fillStyle = '#292524'; ctx.fillRect(0, PANEL_Y, W, 3);
    // minimap (only what you've seen)
    const size = 150, ox = 14, oy = PANEL_Y + 12, cs = size / Math.max(this.gw, this.gh);
    ctx.fillStyle = '#000'; ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    for (let y = 0; y < this.gh; y++) for (let x = 0; x < this.gw; x++) {
      if (!this.seen[y][x]) continue;
      ctx.fillStyle = this.map[y][x] ? '#57534e' : '#1c1917';
      ctx.fillRect(ox + x * cs, oy + y * cs, cs + 0.5, cs + 0.5);
    }
    for (const it of this.items) {
      if (it.got || !this.seen[Math.floor(it.y)]?.[Math.floor(it.x)] || it.kind === 'coin') continue;
      ctx.fillStyle = { key: '#fbbf24', torch: '#fb923c', exit: '#4ade80', chest: '#fbbf24' }[it.kind];
      ctx.beginPath(); ctx.arc(ox + it.x * cs, oy + it.y * cs, Math.max(2, cs * 0.35), 0, Math.PI * 2); ctx.fill();
    }
    if (this.level <= 3 || this.bonus) for (const g of this.ghouls) if (this.seen[Math.floor(g.y)]?.[Math.floor(g.x)]) { ctx.fillStyle = '#22c55e'; ctx.fillRect(ox + g.x * cs - 2, oy + g.y * cs - 2, 4, 4); }
    ctx.save(); ctx.translate(ox + p.x * cs, oy + p.y * cs); ctx.rotate(p.a);
    ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.fill(); ctx.restore();
    // flash button
    ctx.save();
    ctx.globalAlpha = this.flashes ? 1 : 0.35;
    ctx.fillStyle = '#0c4a6e'; ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W - 58, PANEL_Y + 88, 38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0f2fe'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚡ FLASH', W - 58, PANEL_Y + 82); ctx.font = '700 12px system-ui'; ctx.fillText(`${this.flashes} left`, W - 58, PANEL_Y + 100);
    ctx.restore();
    // back button + help
    ctx.fillStyle = '#1c1917'; ctx.strokeStyle = '#44403c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2 + 10, PANEL_Y + 88, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a8a29e'; ctx.font = '800 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText('↓', W / 2 + 10, PANEL_Y + 89);
    ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(214,211,209,.5)';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Hold sides to turn · middle to walk' : '↑ walk · ← → turn · Space flash', W / 2 + 10, PANEL_Y + 140);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.fillText('★ GOLDEN TORCH', W / 2 + 10, PANEL_Y + 30); }
  }
}

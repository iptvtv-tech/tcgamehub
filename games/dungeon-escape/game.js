// ─────────────────────────────────────────────────────────────
//  DUNGEON ESCAPE 3D — game 20 (Zone 4 · Ultra)
//  Drawn with the HD first-person engine (raycast-hd.js + raycast-art.js): real
//  torchlight that shrinks as your fuel runs down, sconces, glowing ghoul eyes.
//  First-person maze escape. A new maze every level: find the keys, reach the
//  golden stairs — before your torch burns out and before the ghouls catch you.
//  Your torch light shrinks as the fuel runs down; grab spare torches.
//  ⚡ FLASH (Space) stuns ghouls in front of you for a few seconds.
//    L1 1 key, 1 ghoul   L3 spike traps, 2 keys   L7 3 keys   bigger mazes, more & faster ghouls
//  Every 5th level: ★ TREASURE VAULT — 15 s to scoop up gold, nothing can hurt you.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';
import { tryMove, canSee } from '../../assets/js/raycast.js';
import { HDRaycaster } from '../../assets/js/raycast-hd.js';
import { makeHDTextures, makeHDSprites, drawTorchHand } from '../../assets/js/raycast-art.js';
import { Thumbstick } from '../../assets/js/thumbstick.js';

const ID = 'dungeon-escape';
const W = 480, H = 720;
const VIEW = { x: 0, y: 44, w: 480, h: 500 };
const PANEL_Y = VIEW.y + VIEW.h;
const STICK = { x: 82, y: PANEL_Y + 88, r: 58 };          // the Crown Heist roller-ball stick
const FLASH_BTN = { x: W - 58, y: PANEL_Y + 88, r: 38 };
const BASE_Y = { stick: STICK.y, flash: FLASH_BTN.y };
/** portrait bands: on a tall phone the stick and flash button drop below the box, at thumb height */
function dropControls(bands) {
  const y = (bands?.bottom || 0) >= 150 ? H + bands.bottom * 0.52 : 0;
  STICK.y = y || BASE_Y.stick; FLASH_BTN.y = y || BASE_Y.flash;
}
const MAP = { x: 166, y: PANEL_Y + 12, s: 140 };

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  detail: true,                 // 🖥 Graphics HIGH / LOW (LOW = a smaller picture)
  comboWindow: 4,
  comboStep: 3,
  maxMultiplier: 4,
  bonusTime: 15,
  music: { bpm: 118, style: 'chase', lead: 'square', arp: [0, 2, 1, 2, 0, 3, 1, 2], oct: [12, 12, 12, 12, 12, 12, 12, 12], bass: 'half' },
  levelInfo(level, bonus) {
    if (bonus) return '★ TREASURE VAULT! Scoop up as much gold as you can in 15 seconds.';
    const notes = {
      1: 'Walk: ↑ ↓ · Turn: ← → (touch: roll the stick, drag the view to look). Find the 🔑 key, then the golden stairs. Don\'t let your torch go out!',
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
    this.rc = new HDRaycaster(VIEW);
    this.stick = new Thumbstick(s, STICK, {
      view: VIEW,
      onLook: (da) => { if (this.p && !this.hurtT) this.p.a += da; },
      claim: (x, y) => Math.hypot(x - FLASH_BTN.x, y - FLASH_BTN.y) < FLASH_BTN.r + 8,
    });
    const art = makeHDTextures();
    this.tex = art.tex; this.floors = art.floors; this.spr = makeHDSprites();
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
    const nG = Math.min(6, level <= 2 ? 1 : 1 + Math.floor(level / 2.5)); // slightly fewer ghouls (~20% reduction)
    for (let i = 0; i < nG; i++) { const c = r.pick(cells.filter((q) => q.d > Math.max(6, cells[cells.length - 1].d * 0.4))); this.ghouls.push(this.newGhoul(c)); }
    this.fuelMax = Math.round(48 + n * n * 1.32); // ~20% more torch fuel
    this.fuel = this.fuelMax;
    this.placePlayer();
    this.setupLight();
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
    this.setupLight();
  }

  // ── Lighting ───────────────────────────────────────────────
  /** Texture ids for the HD engine, a few wall sconces (the maze stays mostly dark — your torch matters), then the light map. */
  setupLight() {
    const HD = { 2: 40, 3: 41, 1: this.bonus ? 1 : 42 };
    this.ids = new Int16Array(this.gw * this.gh);
    for (let y = 0; y < this.gh; y++) for (let x = 0; x < this.gw; x++) { const v = this.map[y][x]; this.ids[y * this.gw + x] = v ? (HD[v] || v) : 0; }
    this.sconces = new Map(); this.sconceLights = [];
    const placed = [];
    const gap = this.bonus ? 3.2 : 5.5;
    for (let y = 1; y < this.gh - 1; y++) for (let x = 1; x < this.gw - 1; x++) {
      if (!this.map[y][x] || this.map[y][x] === 13) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (!this.open(x + dx, y + dy)) continue;
        const lx = x + 0.5 + dx * 0.8, ly = y + 0.5 + dy * 0.8;
        if (placed.some(([ax, ay]) => Math.hypot(ax - lx, ay - ly) < gap) || Math.abs((x * 73856093) ^ (y * 19349663) ^ (dx * 83492791 + dy * 7)) % 100 < 35) continue;   // fixed pattern: doesn't touch the game's random numbers
        placed.push([lx, ly]);
        this.sconces.set(((y * 64 + x) * 4) + (dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3), true);
        this.sconceLights.push({ x: lx, y: ly, r: 1.05, g: 0.52, b: 0.2, rad: this.bonus ? 3.6 : 3 });
      }
    }
    this.relight();
  }
  relight() {
    const lights = [...this.sconceLights];
    for (const it of this.items) {
      if (it.got) continue;
      if (it.kind === 'torch') lights.push({ x: it.x, y: it.y, r: 1.1, g: 0.6, b: 0.25, rad: 2.6 });
      else if (it.kind === 'key') lights.push({ x: it.x, y: it.y, r: 0.6, g: 0.45, b: 0.1, rad: 1.8 });
      else if (it.kind === 'exit') lights.push({ x: it.x, y: it.y, r: 0.6, g: 0.5, b: 0.18, rad: 2.6 });
    }
    this.rc.buildLights(this.gw, this.gh, lights, (x, y) => !this.open(x, y));
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
    if (a === 'press' && Math.hypot(x - FLASH_BTN.x, y - FLASH_BTN.y) < FLASH_BTN.r + 8) { this.flashPress = 0.2; this.flash(); }
  }
  /** Keys plus the roller-ball stick (same feel as Crown Heist). fwd: -1..1, turn: -1..1 */
  controls() {
    const inp = this.s.input, st = this.stick.axes();
    let fwd = (inp.isDown('up') ? 1 : 0) - (inp.isDown('down') ? 1 : 0) + st.fwd;
    let turn = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0) + st.turn;
    return { fwd: clamp(fwd, -1, 1), turn: clamp(turn, -1, 1) };
  }

  flash() {
    const s = this.s, p = this.p;
    if (this.bonus || this.flashes <= 0 || this.flashT > 0) return;
    // only ghouls in the beam count — a stray press with nothing in range keeps the charge
    const hits = this.ghouls.filter((g) => {
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      return d < 6.5 && Math.abs(da) < 0.8 && canSee(this.solid, p.x, p.y, g.x, g.y);
    });
    if (!hits.length) {
      this.flashT = 0.15;
      s.sound.tone({ freq: 500, to: 350, dur: 0.12, type: 'square', vol: 0.04 });
      s.fx.text(W / 2, VIEW.y + 120, 'No ghoul in the beam', { color: '#94a3b8', size: 13, life: 0.8 });
      return;
    }
    this.flashes--; this.flashT = 0.35; this.flashUsed = true;
    s.sound.tone({ freq: 2000, to: 300, dur: 0.3, type: 'sawtooth', vol: 0.07 }); s.sound.noise({ dur: 0.2, vol: 0.12, freq: 6000, type: 'highpass' });
    for (const g of hits) {
      g.stun = 3.5; g.hunting = false;
      s.award(100 * this.level, W / 2, VIEW.y + 120, { chain: true, color: '#e0f2fe', size: 18 });
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
    const sp = 2.7 * dt * (c.fwd < 0 ? c.fwd * 0.7 : c.fwd);   // backing up is slower, as before
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
      else if (it.kind === 'key') { it.got = true; this.relight(); this.keysHave++; s.award(300 * L, W / 2, VIEW.y + 220, { chain: true, color: '#fbbf24', size: 20 }); s.fx.text(W / 2, VIEW.y + 180, this.keysHave >= this.keysNeed ? '🔑 ALL KEYS! Find the golden stairs!' : `🔑 KEY ${this.keysHave} / ${this.keysNeed}`, { color: '#fbbf24', size: 22 }); [0, 4, 7, 12].forEach((st, i) => s.sound.tone({ freq: s.sound.note(84 + st), dur: 0.1, type: 'triangle', vol: 0.07, delay: i * 0.05 })); }
      else if (it.kind === 'torch') { it.got = true; this.relight(); this.fuel = Math.min(this.fuelMax, this.fuel + 20); s.award(50 * L, W / 2, VIEW.y + 240, { color: '#fb923c', size: 16 }); s.fx.text(W / 2, VIEW.y + 200, '🔥 +20s TORCH', { color: '#fb923c', size: 20 }); s.sound.noise({ dur: 0.3, vol: 0.12, freq: 900, type: 'bandpass' }); }
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
    const gSpeed = Math.min(1.92, 1.08 + L * 0.056); // ~20% slower ghouls
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
    const s = this.s, p = this.p, t = this.t, lo = s.lowDetail, spr = this.spr;
    dropControls(s.bands);
    // real time since the last frame for the render-side decays below (was a fixed 1/60; stops while paused)
    const now = performance.now(), rdt = this.s.state === 'playing' ? Math.min(0.05, (now - (this.rtPrev || now)) / 1000) : 0; this.rtPrev = now;
    this.rdt = rdt;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    const fuelK = this.bonus ? 1 : Math.min(1, this.fuel / 30);
    const flick = 0.9 + 0.06 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 17.9 + 2) + 0.03 * Math.sin(t * 31.7);
    const light = this.bonus ? 9 : 2.2 + 4.8 * fuelK + Math.sin(t * 13) * 0.12;
    const sprites = [];
    for (const it of this.items) {
      if (it.got) continue;
      const o = { x: it.x, y: it.y };
      if (it.kind === 'coin') sprites.push({ ...o, ...spr.coin, scale: 0.6, wide: 0.2 + 0.8 * Math.abs(Math.cos(t * 2.6 + it.x * 3)), minLight: 0.3 });
      else if (it.kind === 'key') sprites.push({ ...o, ...spr.key, scale: 0.55, lift: 0.08 + Math.sin(t * 3) * 0.04, minLight: 0.6 });
      else if (it.kind === 'torch') sprites.push({ ...o, ...spr.torch[Math.floor(t * 9 + it.x) % 3], scale: 0.55, minLight: 0.45 });
      else if (it.kind === 'exit') sprites.push({ ...o, ...spr.stairs, scale: 1, minLight: 0.45 });
      else if (it.kind === 'chest') sprites.push({ ...o, ...spr.chest, scale: 0.55, minLight: 0.35 });
    }
    for (const sp of this.spikes) sprites.push({ x: sp.x + 0.5, y: sp.y + 0.5, ...(sp.up ? spr.spikes : spr.spikesdown), scale: 0.9, minLight: 0.25 });
    for (const g of this.ghouls) sprites.push({ x: g.x, y: g.y, ...spr.ghoul, scale: 0.85, minLight: 0.12, alpha: g.stun > 0 ? 0.45 + 0.3 * Math.sin(t * 20) : 1, lift: Math.sin(t * 4 + g.home.x) * 0.03 });
    const bob = Math.sin(p.walk) * 5;
    const sconceBase = this.bonus ? 33 : null, flash = this.flashT > 0 ? this.flashT * 3 : 0;
    this.rc.setRes(lo ? 240 : 360);
    this.rc.render(ctx, { x: p.x, y: p.y, a: p.a, bob }, {
      ids: this.ids, mapW: this.gw, mapH: this.gh, tex: this.tex,
      floor: (this.bonus ? this.floors.treasure : this.floors.crypt).floor, ceil: (this.bonus ? this.floors.treasure : this.floors.crypt).ceil,
      faceTex: (x, y, fx, fy, id) => {
        if (!this.sconces.has(((y * 64 + x) * 4) + (fx === 1 ? 0 : fy === 1 ? 1 : fx === -1 ? 2 : 3))) return id;
        const base = id === 1 ? 33 : id >= 40 && id <= 42 ? 43 + (id - 40) * 3 : sconceBase;
        return base ? base + Math.floor(t * 9 + x * 7 + y * 3) % 3 : id;
      },
      light, fogDist: this.bonus ? 12 : 8, flicker: flick,
      ambient: this.bonus ? [0.12 + flash, 0.085 + flash, 0.05 + flash] : [0.03 + flash, 0.034 + flash, 0.055 + flash],
      fogCol: this.bonus ? [18, 10, 5] : [3, 5, 10],
      torch: (s.gold ? [0.95, 0.8, 0.45] : [0.92, 0.68, 0.46]).map((v) => v * (0.93 + flick * 0.07) * (0.55 + 0.45 * fuelK)),
      sprites,
    });
    if (this.flashT > 0) { ctx.fillStyle = `rgba(224,242,254,${this.flashT * 1.2})`; ctx.fillRect(0, VIEW.y, W, VIEW.h); }
    if (this.nearest < 3 && !this.bonus) { ctx.fillStyle = `rgba(127,29,29,${(3 - this.nearest) * 0.08 * (0.6 + 0.4 * Math.sin(t * 8))})`; ctx.fillRect(0, VIEW.y, W, VIEW.h); }
    drawTorchHand(ctx, VIEW, { t, flick, gold: s.gold, sway: bob * 1.2, size: this.bonus ? 1 : Math.min(1, this.fuel / 25) });
    this.drawVignette(ctx);
    this.drawPanel(ctx);
  }

  drawVignette(ctx) {
    if (!this.vig) {
      const c = document.createElement('canvas'); c.width = VIEW.w; c.height = VIEW.h; const g = c.getContext('2d');
      const gr = g.createRadialGradient(VIEW.w / 2, VIEW.h * 0.52, VIEW.h * 0.28, VIEW.w / 2, VIEW.h * 0.52, VIEW.h * 0.82);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = gr; g.fillRect(0, 0, VIEW.w, VIEW.h);
      this.vig = c;
    }
    ctx.drawImage(this.vig, VIEW.x, VIEW.y);
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
    const size = MAP.s, ox = MAP.x, oy = MAP.y, cs = size / Math.max(this.gw, this.gh);
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
    // the stick (same roller ball as Crown Heist)
    this.stick.draw(ctx);
    // flash button
    if (this.flashPress > 0) this.flashPress -= this.rdt ?? 1 / 60;
    const F = FLASH_BTN;
    ctx.save();
    ctx.globalAlpha = this.flashes ? 1 : 0.35;
    ctx.fillStyle = this.flashPress > 0 ? '#0369a1' : '#0c4a6e'; ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(F.x, F.y, F.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0f2fe'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚡ FLASH', F.x, F.y - 6); ctx.font = '700 12px system-ui'; ctx.fillText(`${this.flashes} left`, F.x, F.y + 12);
    ctx.restore();
    // help
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 10.5px system-ui'; ctx.fillStyle = 'rgba(214,211,209,.5)';
    ctx.fillText(this.stick.coarse ? 'Drag the view to look around' : '↑↓ walk · ← → turn · Space flash', MAP.x + MAP.s / 2, H - 10);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.fillText('★ GOLDEN TORCH', F.x, PANEL_Y + 150); }
  }
}

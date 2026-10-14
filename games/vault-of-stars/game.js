// ─────────────────────────────────────────────────────────────
//  VAULT OF STARS — game 30 (Zone 5 · Beyond · LEGENDS game)
//
//  Top-down, tile by tile, through the sealed vaults of an alien moon. Every vault is
//  drawn by hand and runs on a fixed tick clock (vaults.js), so it plays out exactly the
//  same way every time: laser grids fire on a beat, sentry drones fly fixed routes, drift
//  fields carry you until something stops you, cracked hull plates give way behind you.
//  Grab the key cards, reach the airlock before your oxygen runs out — and beat the par.
//
//  THE EGG: start at vault 1 and clear all 15 without losing a life. Vault 16, the Signal
//  Room, opens — reach the Golden Beacon at its centre to win the Golden Beacon Egg.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Sound } from '../../assets/js/audio.js';
import { FINAL, SECRET, TICK, COLS, ROWS, VAULTS, buildVault, theme, initialState, step, atGoal, allKeys, laserOn, laserLive, droneAt, forcedDir } from './vaults.js';

const ID = 'vault-of-stars';
const W = 480, H = 720;
const T = 32;                                   // px per tile
const MAP = { x: 0, y: 56, w: COLS * T, h: ROWS * T };
const PANEL_Y = MAP.y + MAP.h + 6;             // 542
const PAD = { x: 92, y: PANEL_Y + 88, r: 30, gap: 56 };
const RESTART = { x: W - 58, y: PANEL_Y + 88, r: 30 };
const CALM = { bpm: 96, style: 'cosmic', lead: 'triangle', bass: 'half' };
const BREACH = { bpm: 150, style: 'chase', lead: 'sawtooth', arp: [0, 1, 2, 3, 2, 1, 0, 1], oct: [12, 24, 12, 24, 12, 24, 12, 24], bass: 'drive' };
const KEY_COL = { A: '#f59e0b', B: '#22d3ee', C: '#f472b6' };
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PAR_SLACK = 3;                            // "Speed of Light": within 3 ticks (0.45 s) of par

const THEMES = {
  outer: { floor: '#0c1a2c', floor2: '#0f2236', wall: '#1b3352', wallTop: '#24456b', edge: '#38bdf8', glow: 'rgba(56,189,248,', ice: '#7dd3fc' },
  deep:  { floor: '#0d1028', floor2: '#121636', wall: '#252557', wallTop: '#33337a', edge: '#818cf8', glow: 'rgba(129,140,248,', ice: '#a5b4fc' },
  core:  { floor: '#140b20', floor2: '#1b0f2b', wall: '#3a1b4e', wallTop: '#52276b', edge: '#e879f9', glow: 'rgba(232,121,249,', ice: '#c4b5fd' },
};

const fmtS = (ticks) => (ticks * TICK).toFixed(1);
/** A floating label, kept clear of the screen edges. */
const label = (s, x, y, text, o) => s.fx.text(clamp(x, 90, W - 90), y, text, o);

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  levelName: 'Vault',
  finalLevel: FINAL,
  secretLevel: SECRET,
  bonusLevels: [5, 10],
  bonusTime: 20,
  comboWindow: 1.2,
  comboStep: 3,
  maxMultiplier: 4,
  music: CALM,
  winTitle: 'You escaped the Vault of Stars!',
  wonText: () => 'All 15 vaults cleared',
  titleHint: 'Fifteen sealed vaults on an alien moon. Legends say something deep inside is still sending a signal…',
  sealedHint: 'Deep in the moon, something is still transmitting… perhaps for an explorer who never falls?',
  sealedHintCheckpoint: 'Legends say the signal only reaches explorers who start from vault 1…',
  secretTitle: '★ THE SIGNAL ROOM ★',
  legendBadge: 'beacon',
  legendRevealDelay: 6.5,
  legendLore: 'Something beyond the stars left this here, for the one who could reach it without losing a step.',
  legendLine: () => 'all 16 vaults · not a single life lost',
  levelTitle: (level) => (level === SECRET ? '★ THE SIGNAL ROOM ★' : `Vault ${level}`),
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 150),
  levelInfo(level, bonus) {
    const v = VAULTS[level];
    if (bonus) return `★ ${v.name}! No drones, no lasers — grab every crystal you can in 20 seconds.`;
    return `${v.name} — ${v.tip}  (par ${fmtS(v.par)} s)`;
  },
  create: (shell) => new VaultOfStars(shell),
});

// ── Background stars (cosmetic, fixed so they don't flicker between frames) ──
const STARS = (() => {
  let a = 1234567;
  const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * H, s: r() < 0.12 ? 1.6 : r() < 0.5 ? 1 : 0.6, tw: r() * 6.28 }));
})();

class VaultOfStars {
  constructor(s) {
    this.s = s;
    this.t = 0;
    this.restartAsk = 0;
    this.padDir = null;
    this.layers = null;
    this.startLevel(1, false);
  }

  reset() { this.runRelics = 0; }

  // ── Level setup ────────────────────────────────────────────
  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.v = buildVault(level);
    this.th = THEMES[theme(level)];
    this.collected = new Set();           // relic tiles taken (stay taken if you lose a life)
    this.bonusRelics = 0;
    this.livesAtStart = this.s.lives;
    this.layers = this.drawStatic();
    this.finale = null;
    this.attempt();
  }

  /** (Re)start the vault: everything back where it began — same as every time. */
  attempt() {
    const v = this.v;
    this.st = initialState(v);
    this.prev = { x: this.st.x, y: this.st.y };
    this.acc = 0;
    this.queue = null;
    this.facing = 'down';
    this.o2 = v.o2Ticks;
    this.canisters = new Set();
    this.breachLeft = 0;
    this.breached = false;
    this.slideRun = 0;
    this.trail = [];
    this.done = false;
    this.dead = null;
    this.restartAsk = 0;
    if (Sound.musicOn && this.s.state !== 'title' && this.s.def.music) { Sound.startMusic(CALM); Sound.setTempo(CALM.bpm + (this.level - 1) * 2); }
  }

  // ── Input ─────────────────────────────────────────────────
  onAction(a, x, y) {
    if (DIR_VEC[a]) { this.queue = a; return; }
    if (a === 'action') return this.askRestart();
    if (a === 'press') {
      const d = this.padHit(x, y);
      if (d) { this.padDir = d; this.queue = d; return; }
      if (Math.hypot(x - RESTART.x, y - RESTART.y) < RESTART.r + 8) this.askRestart();
    }
    if (a === 'release') this.padDir = null;
  }
  onPointerMove(x, y, down) { if (down && this.padDir) { const d = this.padHit(x, y); if (d) this.padDir = d; } }
  padHit(x, y) {
    const dx = x - PAD.x, dy = y - PAD.y;
    if (Math.hypot(dx, dy) > PAD.gap + PAD.r + 10 || Math.hypot(dx, dy) < 10) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  heldDir() {
    const i = this.s.input;
    for (const d of ['up', 'down', 'left', 'right']) if (i.isDown(d)) return d;
    return this.padDir;
  }
  /** Space (or ⟲) twice: restart the vault, at the cost of a life — for when a plate gave way behind you. */
  askRestart() {
    if (this.bonus || this.done || this.dead) return;
    if (this.restartAsk > 0) { this.restartAsk = 0; this.die('restart'); return; }
    this.restartAsk = 2.2;
    this.s.sound.play('click');
  }

  // ── The tick clock ─────────────────────────────────────────
  update(dt) {
    this.t += dt;
    if (this.restartAsk > 0) this.restartAsk = Math.max(0, this.restartAsk - dt);
    if (this.done || this.dead) return;
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.tick();
      if (this.done || this.dead || this.s.state !== 'playing') { this.acc = 0; break; }
    }
  }

  tick() {
    const s = this.s, v = this.v;
    const forced = forcedDir(v, this.st);
    let dir = forced ? null : (this.queue || this.heldDir());
    this.queue = null;
    const before = this.st;
    const r = step(v, before, dir);
    this.prev = { x: before.x, y: before.y };
    this.st = r.st;
    const { x, y } = r.st;
    if (r.moved) {
      this.facing = forced || dir || this.facing;
      this.trail.push({ x: before.x, y: before.y, a: 1 });
      if (this.trail.length > 8) this.trail.shift();
      if (r.slid || v.cell[y][x] === '~') {
        this.slideRun++;
        if (this.slideRun >= 8) s.unlock('zerog');
        s.fx.burst(this.px(before.x) + T / 2, this.py(before.y) + T / 2, { colors: [this.th.ice, '#fff'], count: 3, speed: 40, life: 0.35, size: 2 });
      } else this.slideRun = 0;
      if (before.holes !== r.st.holes) this.crumble(before.x, before.y);
    } else this.slideRun = 0;

    // pickups
    const c = v.cell[y][x], k = y * COLS + x;
    if ((c === '*' || c === '$') && !this.collected.has(k)) this.takeRelic(x, y, c === '$');
    if (c === 'o' && !this.canisters.has(k)) {
      this.canisters.add(k);
      this.o2 = Math.min(v.o2Ticks, this.o2 + Math.round(10 / TICK));
      s.sound.play('life');
      label(s, this.px(x) + T / 2, this.py(y), '+10 s O₂', { color: '#4ade80', size: 18 });
    }
    if (r.key) {
      s.sound.play('powerup');
      s.fx.burst(this.px(x) + T / 2, this.py(y) + T / 2, { color: KEY_COL[r.key], count: 24, speed: 120 });
      label(s, this.px(x) + T / 2, this.py(y) - 4, `KEY CARD ${r.key}`, { color: KEY_COL[r.key], size: 18 });
      if (v.breachTicks && r.st.keys === allKeys(v)) this.startBreach();
    }

    if (r.hit) return this.die(r.hit);
    if (atGoal(v, r.st)) return v.beacon ? this.startFinale() : this.escape();

    // oxygen (and the hull breach in vault 15)
    if (!this.bonus) {
      this.o2--;
      if (this.o2 === Math.round(8 / TICK)) s.sound.play('tick');
      if (this.o2 <= 0) return this.die('o2');
    }
    if (this.breachLeft > 0) {
      this.breachLeft--;
      if (this.breachLeft % Math.round(1 / TICK) === 0) s.sound.play('tick');
      if (this.breachLeft <= 0) return this.die('breach');
    }
    // laser warning chirp: a grid next to you is about to fire
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = x + dx, ly = y + dy, g = v.laserAt.get(ly * COLS + lx);
      if (g && !laserOn(v, g, r.st.t) && laserOn(v, g, r.st.t + 1)) { s.sound.tone?.({ freq: 1400, dur: 0.03, type: 'square', vol: 0.03 }); break; }
    }
  }

  takeRelic(x, y, big) {
    const s = this.s;
    this.collected.add(y * COLS + x);
    const pts = (big ? 200 : 50) * (this.bonus ? 1 : 1 + Math.floor(this.level / 4));
    s.award(pts, this.px(x) + T / 2, this.py(y), { chain: true, color: big ? '#fde047' : '#67e8f9' });
    s.sound.play(big ? 'golden' : 'gem', s.comboCount);
    s.fx.burst(this.px(x) + T / 2, this.py(y) + T / 2, { colors: big ? ['#fde047', '#fff'] : ['#67e8f9', '#e0f2fe'], count: big ? 22 : 10, speed: 90, life: 0.5 });
    if (this.bonus && ++this.bonusRelics >= 40) s.unlock('cache');
  }

  crumble(x, y) {
    const s = this.s;
    s.sound.noise?.({ dur: 0.35, vol: 0.18, freq: 700, to: 80 });
    s.fx.burst(this.px(x) + T / 2, this.py(y) + T / 2, { colors: [this.th.wallTop, '#94a3b8', '#475569'], count: 14, speed: 70, life: 0.6, size: 3 });
    s.fx.shake(2, 0.12);
  }

  startBreach() {
    const s = this.s;
    this.breachLeft = this.v.breachTicks;
    this.breached = true;
    s.sound.play('boom');
    s.fx.shake(10, 0.6); s.fx.flash('#ef4444', 0.35);
    s.fx.text(W / 2, MAP.y + 200, 'HULL BREACH!', { color: '#f87171', size: 34, life: 1.6 });
    if (Sound.musicOn) { Sound.startMusic(BREACH); Sound.setTempo(BREACH.bpm); }
  }

  escape() {
    const s = this.s, v = this.v;
    this.done = true;
    const used = this.st.t;
    // oxygen left → bonus points
    const left = Math.max(0, this.o2);
    if (left > 0) s.award(Math.round(left * TICK) * 10, W / 2, MAP.y + 160, { color: '#4ade80', size: 22 });
    if (this.level === 1) s.unlock('contact');
    if (this.level >= 2 && used <= v.par + PAR_SLACK) s.unlock('par');
    if (v.relics.length && v.relics.every((r) => this.collected.has(r.y * COLS + r.x))) s.unlock('relics');
    if (v.dark && s.lives === this.livesAtStart) s.unlock('blackout');
    if (this.breached) s.unlock('breach');
    this.lastTime = used;
    s.fx.text(W / 2, MAP.y + 120, `${fmtS(used)} s  ·  par ${fmtS(v.par)} s`, { color: used <= v.par + PAR_SLACK ? '#fde047' : '#e0f2fe', size: 22, life: 1.5 });
    s.completeLevel();
  }

  die(cause) {
    const s = this.s;
    if (this.dead) return;
    this.dead = cause;
    const cx = this.px(this.st.x) + T / 2, cy = this.py(this.st.y) + T / 2;
    s.fx.burst(cx, cy, { colors: ['#f87171', '#fde68a', '#fff'], count: 34, speed: 160 });
    const msg = { drone: 'Caught by a drone!', laser: 'Laser grid!', o2: 'Out of oxygen!', breach: 'The hull gave way!', restart: 'Vault restarted' }[cause] || 'Ouch!';
    s.fx.text(W / 2, MAP.y + 200, msg, { color: '#fca5a5', size: 26, life: 1.4 });
    if (Sound.musicOn) Sound.stopMusic();
    s.hurt();
  }
  onLifeLost() { this.attempt(); }
  onLevelClear() {}
  onGameOver() { if (Sound.musicOn) Sound.stopMusic(); }

  // ── Vault 16: the Golden Beacon ──────────────────────────────
  startFinale() {
    const s = this.s;
    this.done = true;
    this.finale = { t: 0, note: 0, nextNote: 1.0, sparkT: 0 };
    s.award(5000, W / 2, MAP.y + 180, { color: '#fde047', size: 30 });
    s.sound.noise?.({ dur: 0.6, vol: 0.35, freq: 6000, type: 'highpass' });
    s.sound.play('powerup');
    s.fx.flash('#fde68a', 0.65);
    s.unlock('relics');
    s.legendFound();
  }
  idle(dt) {
    this.t += dt;
    const f = this.finale, s = this.s;
    if (!f) return;
    f.t += dt;
    const tune = [76, 79, 83, 88, 83, 79, 81, 84, 88, 91, 88, 84, 83, 86, 90, 95];
    f.nextNote -= dt;
    if (f.nextNote <= 0) {
      const n = tune[f.note % tune.length];
      s.sound.tone?.({ freq: s.sound.note(n), dur: 1.0, type: 'sine', vol: 0.12 });
      s.sound.tone?.({ freq: s.sound.note(n - 12), dur: 0.6, type: 'triangle', vol: 0.04 });
      f.note++;
      f.nextNote = f.note % 4 === 3 ? 0.7 : 0.34;
    }
    f.sparkT -= dt;
    if (f.t > 0.6 && f.sparkT <= 0) {
      f.sparkT = 0.06;
      const [bx, by] = this.v.beacon, a = Math.random() * Math.PI * 2, rr = 30 + Math.random() * 120;
      s.fx.burst(this.px(bx) + T / 2 + Math.cos(a) * rr, this.py(by) + T / 2 + Math.sin(a) * rr, { colors: ['#fde68a', '#fff', '#6ee7b7'], count: 2, speed: 30, life: 0.9, size: 3 });
    }
  }

  // ── Drawing helpers ─────────────────────────────────────────
  px(x) { return MAP.x + x * T; }
  py(y) { return MAP.y + y * T; }
  frac() { return this.done || this.dead || this.s.state !== 'playing' ? 1 : clamp(this.acc / TICK, 0, 1); }

  /** The walls and floor never change in a vault: draw them once. */
  drawStatic() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = MAP.w; c.height = MAP.h;
    const g = c.getContext('2d'), v = this.v, th = this.th;
    const wall = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || v.cell[y][x] === '#';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = v.cell[y][x], X = x * T, Y = y * T;
        if (ch === '#') continue;
        // floor panel
        g.fillStyle = (x + y) % 2 ? th.floor : th.floor2;
        g.fillRect(X, Y, T, T);
        g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
        g.strokeRect(X + 2.5, Y + 2.5, T - 5, T - 5);
        g.fillStyle = 'rgba(255,255,255,.05)';
        for (const [ox, oy] of [[5, 5], [T - 5, 5], [5, T - 5], [T - 5, T - 5]]) { g.beginPath(); g.arc(X + ox, Y + oy, 1.2, 0, 7); g.fill(); }
      }
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!wall(x, y)) continue;
        const X = x * T, Y = y * T;
        const open = !wall(x, y + 1) || !wall(x, y - 1) || !wall(x + 1, y) || !wall(x - 1, y);
        g.fillStyle = th.wall; g.fillRect(X, Y, T, T);
        if (!open) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X, Y, T, T); continue; }
        g.fillStyle = th.wallTop; g.fillRect(X + 3, Y + 3, T - 6, T - 8);
        // hex rivet pattern
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
        g.beginPath();
        const cx = X + T / 2, cy = Y + T / 2 - 1;
        for (let i = 0; i <= 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); }
        g.stroke();
        // lit edges where the wall meets the floor
        g.strokeStyle = th.edge; g.globalAlpha = 0.55; g.lineWidth = 2;
        g.beginPath();
        if (!wall(x, y + 1)) { g.moveTo(X + 2, Y + T - 1); g.lineTo(X + T - 2, Y + T - 1); }
        if (!wall(x, y - 1)) { g.moveTo(X + 2, Y + 1); g.lineTo(X + T - 2, Y + 1); }
        if (!wall(x + 1, y)) { g.moveTo(X + T - 1, Y + 2); g.lineTo(X + T - 1, Y + T - 2); }
        if (!wall(x - 1, y)) { g.moveTo(X + 1, Y + 2); g.lineTo(X + 1, Y + T - 2); }
        g.stroke(); g.globalAlpha = 1;
        // wall shadow onto the floor below
        if (!wall(x, y + 1)) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(X, Y + T, T, 6); }
      }
    }
    // laser emitters, fixed into the walls on either side of each grid tile
    for (const l of v.lasers) {
      const horiz = wall(l.x - 1, l.y) && wall(l.x + 1, l.y);
      g.fillStyle = '#334155';
      if (horiz) { g.fillRect(l.x * T - 5, l.y * T + 8, 6, T - 16); g.fillRect((l.x + 1) * T - 1, l.y * T + 8, 6, T - 16); }
      else { g.fillRect(l.x * T + 8, l.y * T - 5, T - 16, 6); g.fillRect(l.x * T + 8, (l.y + 1) * T - 1, T - 16, 6); }
    }
    return c;
  }

  // ── Render ──────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, v = this.v, th = this.th, t = this.t, st = this.st, f = this.frac();
    // space
    ctx.fillStyle = '#04060f'; ctx.fillRect(0, 0, W, H);
    const neb = ctx.createRadialGradient(W * 0.75, 120, 10, W * 0.75, 120, 360);
    neb.addColorStop(0, th.glow + '0.16)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
    for (const p of STARS) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + p.tw); ctx.fillStyle = '#fff'; ctx.fillRect(p.x, p.y, p.s, p.s); }
    ctx.globalAlpha = 1;
    if (this.layers) ctx.drawImage(this.layers, MAP.x, MAP.y);

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) this.drawCell(ctx, x, y);
    this.drawGoal(ctx);

    // trail
    for (const p of this.trail) { p.a *= 0.92; ctx.globalAlpha = p.a * 0.18; ctx.fillStyle = s.gold ? '#fbbf24' : th.edge; ctx.fillRect(this.px(p.x) + 9, this.py(p.y) + 9, T - 18, T - 18); }
    ctx.globalAlpha = 1;

    for (const d of v.drones) this.drawDrone(ctx, d, f);
    if (!this.dead) this.drawPlayer(ctx, f);
    if (v.dark) this.drawDark(ctx, f);
    this.drawTop(ctx);
    this.drawPanel(ctx);
    if (this.breachLeft > 0) this.drawBreach(ctx);
  }

  drawCell(ctx, x, y) {
    const v = this.v, st = this.st, c = v.cell[y][x], X = this.px(x), Y = this.py(y), t = this.t, th = this.th, k = y * COLS + x;
    if (c === '#' || c === '.' || c === 'S') {
      if (c === 'S') { ctx.strokeStyle = th.glow + '0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, 11, 0, 7); ctx.stroke(); }
      return;
    }
    if (c === '~') {
      const sh = 0.5 + 0.5 * Math.sin(t * 1.6 + x * 0.8 + y * 0.6);
      ctx.fillStyle = th.ice; ctx.globalAlpha = 0.16 + 0.06 * sh; ctx.fillRect(X + 1, Y + 1, T - 2, T - 2);
      ctx.globalAlpha = 0.45; ctx.strokeStyle = th.ice; ctx.lineWidth = 1; ctx.strokeRect(X + 1.5, Y + 1.5, T - 3, T - 3);
      // drifting motes
      ctx.fillStyle = '#f0f9ff';
      for (let i = 0; i < 3; i++) {
        const ph = (t * (0.25 + i * 0.1) + (x * 0.37 + y * 0.53 + i * 0.31)) % 1;
        ctx.globalAlpha = 0.65 * Math.sin(ph * Math.PI);
        ctx.fillRect(X + 4 + ((i * 11 + x * 7) % 22), Y + 4 + ph * (T - 8), 1.6, 1.6);
      }
      // faint chevrons: "no grip here"
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X + 11, Y + 13); ctx.lineTo(X + 16, Y + 17); ctx.lineTo(X + 21, Y + 13); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    if (c === 'x') {
      const ci = v.crackIndex.get(k), gone = st.holes & (1 << ci);
      if (gone) {
        ctx.fillStyle = '#02030a'; ctx.fillRect(X + 1, Y + 1, T - 2, T - 2);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + i + x); ctx.fillRect(X + 5 + ((i * 11 + x * 5) % 22), Y + 5 + ((i * 7 + y * 9) % 22), 1.4, 1.4); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.strokeRect(X + 1, Y + 1, T - 2, T - 2);
      } else {
        ctx.fillStyle = '#334155'; ctx.globalAlpha = 0.5; ctx.fillRect(X + 2, Y + 2, T - 4, T - 4); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(X + 6, Y + 8); ctx.lineTo(X + 14, Y + 15); ctx.lineTo(X + 11, Y + 24); ctx.moveTo(X + 14, Y + 15); ctx.lineTo(X + 25, Y + 12); ctx.moveTo(X + 20, Y + 13); ctx.lineTo(X + 24, Y + 26); ctx.stroke();
        if (st.x === x && st.y === y) { ctx.fillStyle = 'rgba(248,113,113,.18)'; ctx.fillRect(X + 2, Y + 2, T - 4, T - 4); }
      }
      return;
    }
    if (c === '*' || c === '$') {
      if (this.collected.has(k)) return;
      const bob = Math.sin(t * 3 + x + y) * 2;
      if (c === '$') {
        ctx.save(); ctx.translate(X + T / 2, Y + T / 2 + bob); ctx.rotate(t * 0.8);
        ctx.fillStyle = 'rgba(253,224,71,.25)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
        star(ctx, 0, 0, 10, 4.5, '#fde047', '#fff7cc');
        ctx.restore();
      } else {
        const w = 6 * Math.abs(Math.cos(t * 2 + x));
        ctx.fillStyle = 'rgba(103,232,249,.22)'; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2 + bob, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.moveTo(X + T / 2, Y + 7 + bob); ctx.lineTo(X + T / 2 + w + 1, Y + T / 2 + bob); ctx.lineTo(X + T / 2, Y + T - 7 + bob); ctx.lineTo(X + T / 2 - w - 1, Y + T / 2 + bob); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ecfeff'; ctx.fillRect(X + T / 2 - 1, Y + 11 + bob, 2, 4);
      }
      return;
    }
    if (c === 'o') {
      if (this.canisters.has(k)) return;
      ctx.fillStyle = 'rgba(74,222,128,.2)'; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, 12, 0, 7); ctx.fill();
      roundRect(ctx, X + 10, Y + 6, 12, 20, 5); ctx.fillStyle = '#16a34a'; ctx.fill();
      ctx.fillStyle = '#bbf7d0'; ctx.fillRect(X + 13, Y + 10, 3, 12);
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(X + 13, Y + 3, 6, 4);
      return;
    }
    if ('ABC'.includes(c)) {
      if (st.keys & (1 << v.keyNames.indexOf(c))) return;
      const col = KEY_COL[c], bob = Math.sin(t * 3) * 2;
      ctx.fillStyle = col; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, 14, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      roundRect(ctx, X + 7, Y + 9 + bob, 18, 13, 3); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.fillRect(X + 9, Y + 12 + bob, 6, 3);
      ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0f172a'; ctx.fillText(c, X + 20, Y + 17 + bob);
      return;
    }
    if ('abc'.includes(c)) {
      const K = c.toUpperCase(), open = st.keys & (1 << v.keyNames.indexOf(K)), col = KEY_COL[K];
      const horiz = v.cell[y][x - 1] === '#' && v.cell[y][x + 1] === '#';
      ctx.globalAlpha = open ? 0.18 : 0.75 + 0.15 * Math.sin(t * 8);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const o = 5 + i * 7 + (open ? 0 : Math.sin(t * 6 + i) * 1.5);
        ctx.beginPath();
        if (horiz) { ctx.moveTo(X + 1, Y + o); ctx.lineTo(X + T - 1, Y + o); } else { ctx.moveTo(X + o, Y + 1); ctx.lineTo(X + o, Y + T - 1); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!open) { ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(K, X + T / 2, Y + T / 2); }
      return;
    }
    if ('123'.includes(c)) {
      const live = laserLive(v, x, y, st.t), soon = !live && laserLive(v, x, y, st.t + 1);
      const horiz = v.cell[y][x - 1] === '#' && v.cell[y][x + 1] === '#';
      if (live) {
        ctx.fillStyle = 'rgba(239,68,68,.18)'; ctx.fillRect(X, Y, T, T);
        for (const [w, a] of [[9, 0.25], [4, 0.6], [1.6, 1]]) {
          ctx.strokeStyle = a === 1 ? '#fee2e2' : '#ef4444'; ctx.globalAlpha = a; ctx.lineWidth = w;
          ctx.beginPath();
          for (const o of [10, 22]) { if (horiz) { ctx.moveTo(X - 2, Y + o + Math.sin(t * 40 + o) * 0.6); ctx.lineTo(X + T + 2, Y + o); } else { ctx.moveTo(X + o + Math.sin(t * 40 + o) * 0.6, Y - 2); ctx.lineTo(X + o, Y + T + 2); } }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = soon ? '#f87171' : 'rgba(248,113,113,.28)'; ctx.globalAlpha = soon ? 0.6 + 0.4 * Math.sin(t * 50) : 1; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
        ctx.beginPath();
        for (const o of [10, 22]) { if (horiz) { ctx.moveTo(X, Y + o); ctx.lineTo(X + T, Y + o); } else { ctx.moveTo(X + o, Y); ctx.lineTo(X + o, Y + T); } }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      // emitter lights
      ctx.fillStyle = live ? '#fca5a5' : soon ? '#f87171' : '#7f1d1d';
      if (horiz) { ctx.fillRect(X - 2, Y + 9, 2, 3); ctx.fillRect(X - 2, Y + 21, 2, 3); ctx.fillRect(X + T, Y + 9, 2, 3); ctx.fillRect(X + T, Y + 21, 2, 3); }
      else { ctx.fillRect(X + 9, Y - 2, 3, 2); ctx.fillRect(X + 21, Y - 2, 3, 2); ctx.fillRect(X + 9, Y + T, 3, 2); ctx.fillRect(X + 21, Y + T, 3, 2); }
    }
  }

  drawGoal(ctx) {
    const v = this.v, t = this.t;
    if (v.exit) {
      const [x, y] = v.exit, cx = this.px(x) + T / 2, cy = this.py(y) + T / 2;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
      g.addColorStop(0, 'rgba(74,222,128,.55)'); g.addColorStop(1, 'rgba(74,222,128,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 28, cy - 28, 56, 56);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 1.5);
      ctx.strokeStyle = '#bbf7d0'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 7, 0, 0.9); ctx.stroke(); }
      ctx.restore();
    }
    if (v.beacon) {
      const [x, y] = v.beacon, cx = this.px(x) + T / 2, cy = this.py(y) + T / 2, f = this.finale;
      const pulse = 1 + 0.12 * Math.sin(t * 4) + (f ? Math.min(1.5, f.t * 0.6) : 0);
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60 * pulse);
      g.addColorStop(0, 'rgba(253,230,138,.85)'); g.addColorStop(0.4, 'rgba(110,231,183,.25)'); g.addColorStop(1, 'rgba(110,231,183,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 62 * pulse, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.6);
      ctx.strokeStyle = 'rgba(253,230,138,.5)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(30 * pulse, 0); ctx.stroke(); }
      ctx.restore();
      star(ctx, cx, cy, 13 * pulse, 6 * pulse, '#fde047', '#fffbeb');
    }
  }

  drawDrone(ctx, d, f) {
    const st = this.st, t = this.t;
    const [ax, ay] = droneAt(d, Math.max(0, st.t - 1)), [bx, by] = droneAt(d, st.t);
    const x = this.px(ax + (bx - ax) * f) + T / 2, y = this.py(ay + (by - ay) * f) + T / 2;
    const [nx, ny] = droneAt(d, st.t + d.every);
    const look = Math.atan2(ny - by, nx - bx);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 11, 4, 0, 0, 7); ctx.fill();
    const hover = Math.sin(t * 6 + bx) * 1.5;
    const glow = ctx.createRadialGradient(x, y + hover, 2, x, y + hover, 22);
    glow.addColorStop(0, 'rgba(251,146,60,.35)'); glow.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y + hover, 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(x, y + hover, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + hover, 11, t * 4, t * 4 + 4.4); ctx.stroke();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(x + Math.cos(look) * 4, y + hover + Math.sin(look) * 4, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fee2e2'; ctx.beginPath(); ctx.arc(x + Math.cos(look) * 4.6, y + hover + Math.sin(look) * 4.6 - 1, 1.2, 0, 7); ctx.fill();
  }

  drawPlayer(ctx, f) {
    const s = this.s, st = this.st, p = this.prev, t = this.t;
    const x = this.px(p.x + (st.x - p.x) * f) + T / 2, y = this.py(p.y + (st.y - p.y) * f) + T / 2;
    const [fx, fy] = DIR_VEC[this.facing];
    const gold = s.gold;
    const suit = gold ? '#fbbf24' : '#e2e8f0', suit2 = gold ? '#b45309' : '#94a3b8', visor = gold ? '#fde68a' : '#38bdf8';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 11, 10, 4, 0, 0, 7); ctx.fill();
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 24);
    glow.addColorStop(0, gold ? 'rgba(251,191,36,.35)' : 'rgba(56,189,248,.3)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fill();
    // backpack (behind the facing direction)
    ctx.fillStyle = suit2; roundRect(ctx, x - fx * 7 - 7, y - fy * 7 - 7, 14, 14, 4); ctx.fill();
    // body + helmet
    ctx.fillStyle = suit; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill();
    ctx.strokeStyle = suit2; ctx.lineWidth = 1.5; ctx.stroke();
    // visor towards the facing direction
    ctx.fillStyle = visor; ctx.beginPath(); ctx.ellipse(x + fx * 4, y + fy * 4, fx ? 4 : 7, fy ? 4 : 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x + fx * 4 - 2, y + fy * 4 - 2, 1.6, 0, 7); ctx.fill();
    // drifting: thruster puffs
    if (this.st.slide && this.v.cell[st.y][st.x] === '~' && Math.random() < 0.5) s.fx.burst(x - fx * 12, y - fy * 12, { colors: ['#e0f2fe', this.th.ice], count: 1, speed: 30, life: 0.3, size: 2 });
    void t;
  }

  /** Vaults 11-12: the lights are out — only your helmet lamp, the lasers and the drones' eyes show. */
  drawDark(ctx, f) {
    const st = this.st, p = this.prev;
    if (!this.dark) { this.dark = document.createElement('canvas'); this.dark.width = MAP.w; this.dark.height = MAP.h; }
    const g = this.dark.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, MAP.w, MAP.h);
    g.fillStyle = 'rgba(2,3,10,.94)'; g.fillRect(0, 0, MAP.w, MAP.h);
    g.globalCompositeOperation = 'destination-out';
    const hole = (cx, cy, r) => { const gr = g.createRadialGradient(cx, cy, r * 0.35, cx, cy, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); };
    hole((p.x + (st.x - p.x) * f) * T + T / 2, (p.y + (st.y - p.y) * f) * T + T / 2, T * 2.9);
    const v = this.v;
    if (v.exit) hole(v.exit[0] * T + T / 2, v.exit[1] * T + T / 2, T * 0.9);
    for (const l of v.lasers) if (laserLive(v, l.x, l.y, st.t) || laserLive(v, l.x, l.y, st.t + 1)) hole(l.x * T + T / 2, l.y * T + T / 2, T * 0.8);
    for (const d of v.drones) { const [ax, ay] = droneAt(d, Math.max(0, st.t - 1)), [bx, by] = droneAt(d, st.t); hole((ax + (bx - ax) * f) * T + T / 2, (ay + (by - ay) * f) * T + T / 2, T * 0.55); }
    ctx.drawImage(this.dark, MAP.x, MAP.y);
  }

  drawTop(ctx) {
    const v = this.v, s = this.s, th = this.th;
    ctx.fillStyle = 'rgba(4,6,15,.82)'; ctx.fillRect(0, 0, W, MAP.y - 2);
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = th.edge;
    ctx.fillText(v.secret ? 'THE SIGNAL ROOM' : `VAULT ${this.level} · ${v.name.toUpperCase()}`, 12, 22);
    if (!this.bonus) {
      const tm = this.done && this.lastTime ? this.lastTime : this.st.t;
      ctx.textAlign = 'right'; ctx.font = '600 13px ui-monospace, Menlo, monospace';
      ctx.fillStyle = tm <= v.par + PAR_SLACK ? '#fde047' : '#cbd5e1';
      ctx.fillText(`⏱ ${fmtS(tm)}s`, W - 86, 22);
      ctx.fillStyle = '#94a3b8'; ctx.fillText(`PAR ${fmtS(v.par)}s`, W - 12, 22);
      // oxygen
      const pct = clamp(this.o2 / v.o2Ticks, 0, 1), low = this.o2 * TICK < 8;
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText('O₂', 12, 44);
      roundRect(ctx, 34, 35, W - 100, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
      if (pct > 0) {
        roundRect(ctx, 34, 35, Math.max(10, (W - 100) * pct), 10, 5);
        ctx.fillStyle = low ? (Math.sin(this.t * 14) > 0 ? '#ef4444' : '#7f1d1d') : pct < 0.35 ? '#f59e0b' : '#4ade80'; ctx.fill();
      }
      ctx.fillStyle = low ? '#fca5a5' : '#cbd5e1'; ctx.textAlign = 'right'; ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(`${Math.max(0, Math.ceil(this.o2 * TICK))} s`, W - 12, 45);
    } else {
      ctx.textAlign = 'right'; ctx.font = '600 13px system-ui'; ctx.fillStyle = '#fde047';
      ctx.fillText(`✦ ${this.bonusRelics} crystals`, W - 12, 22);
    }
  }

  drawPanel(ctx) {
    const s = this.s, v = this.v, th = this.th;
    ctx.fillStyle = 'rgba(4,6,15,.72)'; ctx.fillRect(0, PANEL_Y - 4, W, H - PANEL_Y + 4);
    ctx.strokeStyle = th.glow + '0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, PANEL_Y - 4); ctx.lineTo(W, PANEL_Y - 4); ctx.stroke();
    // D-pad
    const held = this.padDir || this.heldDir();
    for (const [d, [dx, dy]] of Object.entries(DIR_VEC)) {
      const cx = PAD.x + dx * PAD.gap * 0.78, cy = PAD.y + dy * PAD.gap * 0.78, on = held === d;
      ctx.fillStyle = on ? th.glow + '0.45)' : 'rgba(255,255,255,.07)';
      roundRect(ctx, cx - 22, cy - 22, 44, 44, 12); ctx.fill();
      ctx.strokeStyle = th.glow + (on ? '0.9)' : '0.35)'); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = on ? '#fff' : '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(cx + dx * 9, cy + dy * 9);
      ctx.lineTo(cx - dx * 5 + dy * 8, cy - dy * 5 + dx * 8);
      ctx.lineTo(cx - dx * 5 - dy * 8, cy - dy * 5 - dx * 8);
      ctx.closePath(); ctx.fill();
    }
    // key cards held
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (v.keyNames.length) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 10px system-ui'; ctx.fillText('KEY CARDS', W / 2 + 22, PANEL_Y + 36);
      v.keyNames.forEach((k, i) => {
        const has = this.st.keys & (1 << i), x = W / 2 + 22 + (i - (v.keyNames.length - 1) / 2) * 34, y = PANEL_Y + 48;
        roundRect(ctx, x - 13, y, 26, 18, 4);
        ctx.fillStyle = has ? KEY_COL[k] : 'rgba(255,255,255,.06)'; ctx.fill();
        ctx.strokeStyle = KEY_COL[k]; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = has ? '#0f172a' : KEY_COL[k]; ctx.font = 'bold 11px system-ui'; ctx.fillText(k, x, y + 13);
      });
    }
    // relics in this vault
    if (v.relics.length && !this.bonus) {
      const got = v.relics.filter((r) => this.collected.has(r.y * COLS + r.x)).length;
      ctx.fillStyle = got === v.relics.length ? '#fde047' : '#94a3b8'; ctx.font = '600 12px system-ui';
      ctx.fillText(`✦ ${got} / ${v.relics.length} crystals`, W / 2 + 22, PANEL_Y + 96);
    }
    ctx.fillStyle = '#64748b'; ctx.font = '11px system-ui';
    ctx.fillText(this.restartAsk > 0 ? '' : 'Arrows, WASD or swipe', W / 2 + 22, PANEL_Y + 122);
    if (!this.bonus) {
      // restart button
      const ask = this.restartAsk > 0;
      ctx.fillStyle = ask ? 'rgba(239,68,68,.35)' : 'rgba(255,255,255,.07)';
      ctx.beginPath(); ctx.arc(RESTART.x, RESTART.y, RESTART.r, 0, 7); ctx.fill();
      ctx.strokeStyle = ask ? '#f87171' : 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = ask ? '#fff' : '#cbd5e1'; ctx.font = '22px system-ui'; ctx.textBaseline = 'middle'; ctx.fillText('⟲', RESTART.x, RESTART.y + 1);
      ctx.textBaseline = 'alphabetic'; ctx.font = '10px system-ui'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('RESTART', RESTART.x, RESTART.y + RESTART.r + 14);
      if (ask) {
        ctx.fillStyle = '#fca5a5'; ctx.font = '600 12px system-ui';
        ctx.fillText('Again to restart the vault (costs a life)', W / 2 + 22, PANEL_Y + 122);
      }
    }
  }

  drawBreach(ctx) {
    const t = this.t, sec = this.breachLeft * TICK;
    ctx.fillStyle = `rgba(239,68,68,${0.08 + 0.06 * Math.sin(t * 10)})`; ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    roundRect(ctx, W / 2 - 110, MAP.y + 8, 220, 34, 10); ctx.fillStyle = 'rgba(69,10,10,.85)'; ctx.fill();
    ctx.fillStyle = '#fecaca'; ctx.font = '800 16px system-ui';
    ctx.fillText(`HULL BREACH · ${sec.toFixed(1)} s`, W / 2, MAP.y + 31);
  }
}

function star(ctx, x, y, r1, r2, fill, hi) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (hi) { ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(x - r2 * 0.3, y - r2 * 0.3, r2 * 0.35, 0, 7); ctx.fill(); }
}

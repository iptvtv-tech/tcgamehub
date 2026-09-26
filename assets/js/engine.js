// ─────────────────────────────────────────────────────────────
//  ARCADE ENGINE — the shared "shell" every game runs inside.
//
//  It gives each game: a crisp auto-scaling canvas, a fixed-step game loop,
//  keyboard/mouse/touch/swipe input, sound, particles & screen shake,
//  levels + bonus rounds, combos, lives, checkpoints, pause, the daily
//  challenge, badges, and the game-over / high-score screen.
//
//  A game only has to describe itself and draw — see games/_template/game.js
// ─────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';
import { GAMES, GLOBAL_ACHIEVEMENTS, gameById } from './games.js';
import { Store } from './storage.js';
import { Sound } from './audio.js';
import { Scores, cleanName, nameProblem } from './scores.js';
import { makeRng, hashString, todayKey } from './rng.js';
import { whatsappLink, WA_ICON } from './site.js';

const STEP = 1 / 120; // physics runs at a fixed 120 updates per second
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('en-GB');

// Started on the next microtask so a game file can call runGame() at the top
// and declare its class further down.
export function runGame(def) { queueMicrotask(() => { window.shell = new Shell(def); }); }

// ── Particles, floating text, rings, shake, flash ───────────────
class FX {
  constructor() { this.clear(); }
  clear() { this.parts = []; this.texts = []; this.rings = []; this.shakeT = 0; this.shakeMag = 0; this.flashA = 0; this.flashColor = '#fff'; }
  burst(x, y, { count = 16, color = '#fff', colors = null, speed = 180, life = 0.6, size = 3, gravity = 0, angle = 0, spread = Math.PI * 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.6 + Math.random() * 0.7), color: colors ? colors[i % colors.length] : color, gravity });
    }
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
  }
  confetti(W, H) {
    const colors = ['#f472b6', '#22d3ee', '#fbbf24', '#a3e635', '#c084fc', '#fb7185'];
    for (let i = 0; i < 4; i++) this.burst(W * (0.2 + i * 0.2), H * 0.45, { count: 22, colors, speed: 420, life: 1.3, size: 4, gravity: 600, angle: -Math.PI / 2, spread: 1.6 });
  }
  text(x, y, str, { color = '#fff', size = 22, life = 0.9, rise = 55 } = {}) { this.texts.push({ x, y, str, color, size, life, max: life, rise }); }
  ring(x, y, { color = '#fff', radius = 40, life = 0.45, width = 3 } = {}) { this.rings.push({ x, y, color, radius, life, max: life, width }); }
  shake(mag = 6, dur = 0.25) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, dur); }
  flash(color = '#fff', a = 0.45) { this.flashColor = color; this.flashA = a; }
  update(dt) {
    for (const p of this.parts) { p.life -= dt; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= t.rise * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT === 0) this.shakeMag = 0;
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
  }
  offset() {
    if (!this.shakeT) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT * 4);
    return [(Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m];
  }
  render(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = r.width;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius * (0.3 + k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      const s = t.size * (k > 0.85 ? 1 + (k - 0.85) * 2 : 1);
      ctx.font = `800 ${s}px system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}

// ── Keyboard, mouse, touch and swipe ────────────────────────────
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'action', Enter: 'action',
};

class Input {
  constructor(shell) {
    this.shell = shell;
    this.down = new Set();
    this.pointer = { x: shell.W / 2, y: shell.H / 2, down: false, used: false };
    this.swipe = null;

    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.down.delete(a); });
    addEventListener('blur', () => this.down.clear());

    const el = shell.canvas;
    el.addEventListener('pointerdown', (e) => this.onPointer(e, 'down'));
    addEventListener('pointermove', (e) => this.onPointer(e, 'move'));
    addEventListener('pointerup', (e) => this.onPointer(e, 'up'));
    addEventListener('pointercancel', () => { this.pointer.down = false; this.swipe = null; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  isDown(action) { return this.down.has(action); }

  onKey(e) {
    const s = this.shell;
    const typing = e.target instanceof HTMLInputElement;
    if (e.code === 'Escape' || (e.code === 'KeyP' && !typing)) { s.togglePause(); e.preventDefault(); return; }
    if (typing) return;
    if (e.code === 'KeyM') { s.toggleMute(); return; }
    const a = KEYMAP[e.code];
    const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
    // On menus, let a focused button/link handle Enter/Space itself.
    if (onControl && !['playing', 'banner', 'clear', 'dying'].includes(s.state)) {
      if (s.state === 'over' && !s.overReady && a === 'action') e.preventDefault(); // avoid instant accidental restart
      return;
    }
    if (a) e.preventDefault();
    if (e.repeat) { if (a) this.down.add(a); return; }
    if (s.state === 'title' && a === 'action') { s.startRun(s.chosenStart); return; }
    if (s.state === 'over' && (a === 'action' || e.code === 'KeyR') && s.overReady) { s.restart(); return; }
    if (!a) return;
    this.down.add(a);
    if (s.state === 'playing') s.game.onAction?.(a);
    else if (s.state === 'banner' && s.def.pressDuringBanner) s.game.onAction?.(a);
  }

  toLogical(e) {
    const r = this.shell.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * this.shell.W, (e.clientY - r.top) / r.height * this.shell.H];
  }

  onPointer(e, type) {
    const s = this.shell, p = this.pointer;
    if (type !== 'down' && !p.down && e.pointerType !== 'mouse') return;
    const [x, y] = this.toLogical(e);
    p.x = x; p.y = y;
    if (type === 'down') {
      e.preventDefault();
      s.canvas.setPointerCapture?.(e.pointerId);
      p.down = true; p.used = true;
      this.swipe = { x, y, t: performance.now(), moved: false };
      Sound.unlock();
      if (s.state === 'playing') s.game.onAction?.('press', x, y);
    } else if (type === 'move') {
      if (s.state === 'playing') s.game.onPointerMove?.(x, y, p.down);
      const sw = this.swipe;
      if (p.down && sw) {
        const dx = x - sw.x, dy = y - sw.y;
        const min = 26 * (s.W / 500);
        if (Math.hypot(dx, dy) > min) {
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          if (s.state === 'playing') s.game.onAction?.(dir);
          this.swipe = { x, y, t: performance.now(), moved: true };
        }
      }
    } else if (type === 'up') {
      const sw = this.swipe;
      p.down = false;
      if (s.state === 'playing') {
        s.game.onAction?.('release', x, y);
        if (sw && !sw.moved && performance.now() - sw.t < 350) s.game.onAction?.('tap', x, y);
      }
      this.swipe = null;
    }
  }
}

// ── The shell ───────────────────────────────────────────────────
class Shell {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.meta = gameById(def.id) || { title: def.title || def.id, tagline: '', controls: '', color: '#22d3ee', achievements: [] };
    this.W = def.width; this.H = def.height;
    const params = new URLSearchParams(location.search);
    this.daily = params.get('daily') === '1';
    this.mode = this.daily ? 'daily' : 'normal';
    this.checkpoints = this.computeCheckpoints();
    const wanted = parseInt(params.get('start'), 10);
    this.chosenStart = this.checkpoints.includes(wanted) ? wanted : 1;

    this.state = 'title';
    this.score = 0; this.level = 1; this.lives = def.lives || 1; this.bonus = false; this.bonusLeft = 0;
    this.comboCount = 0; this.comboTimer = 0; this.multiplier = 1;
    this.time = 0; this.playTime = 0; this.timers = [];
    this.rng = makeRng(hashString(todayKey() + this.id));
    this.sound = Sound;
    this.fx = new FX();

    this.buildDom();
    this.input = new Input(this);
    this.ctx = this.canvas.getContext('2d');
    this.fit();
    new ResizeObserver(() => this.fit()).observe(this.stageEl);

    this.game = def.create(this);
    this.showTitle();

    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); });
    addEventListener('blur', () => this.autoPause());

    this.last = performance.now(); this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ── Helpers games use ────────────────────────────────────────
  /** Difficulty multiplier: grows `perLevel` (7%) each level, capped. */
  speed(perLevel = 0.07, cap = 2.4, level = this.level) { return Math.min(cap, Math.pow(1 + perLevel, level - 1)); }
  isBonusLevel(level) { return level % CONFIG.bonusEvery === 0; }

  /** Add points. With {chain:true} it counts toward the combo and gets multiplied. */
  award(base, x, y, { chain = false, color = '#fff', size = 20 } = {}) {
    if (chain) this.comboHit();
    const pts = Math.round(base * (chain ? this.multiplier : 1));
    this.addScore(pts);
    if (x !== undefined) this.fx.text(x, y, `+${fmt(pts)}`, { color, size });
    return pts;
  }
  addScore(pts) {
    this.score += pts;
    for (const a of this.meta.achievements || []) {
      const m = /^score(\d+)k$/.exec(a.id);
      if (m && this.score >= +m[1] * 1000) this.unlock(a.id);
    }
    this.updateHud();
  }
  comboHit() {
    this.comboCount++;
    this.comboTimer = this.def.comboWindow || 0;
    const m = Math.min(this.def.maxMultiplier || 5, 1 + Math.floor((this.comboCount - 1) / (this.def.comboStep || 3)));
    if (m > this.multiplier) {
      this.multiplier = m;
      this.sound.play('combo', m);
      this.fx.text(this.W / 2, this.H * 0.28, `x${m} COMBO!`, { color: '#fbbf24', size: 34, life: 1.1, rise: 30 });
      this.def.onCombo?.(m);
      for (const a of this.meta.achievements || []) {
        const mm = /^combo(\d+)$/.exec(a.id);
        if (mm && m >= +mm[1]) this.unlock(a.id);
      }
    }
    this.updateHud();
    return this.multiplier;
  }
  resetCombo() {
    if (this.comboCount === 0) return;
    this.comboCount = 0; this.multiplier = 1; this.updateHud();
  }

  /** Call when the player finishes the level (or the engine does, when a bonus timer ends). */
  completeLevel() {
    if (this.state !== 'playing') return;
    this.state = 'clear';
    const pts = this.def.levelClearPoints ? this.def.levelClearPoints(this.level, this.bonus) : this.level * 100;
    this.addScore(pts);
    this.sound.play('levelup');
    this.fx.confetti(this.W, this.H);
    this.fx.text(this.W / 2, this.H * 0.42, this.bonus ? 'BONUS COMPLETE!' : 'LEVEL CLEAR!', { color: '#a3e635', size: 38, life: 1.3, rise: 20 });
    this.fx.text(this.W / 2, this.H * 0.52, `+${fmt(pts)}`, { color: '#fff', size: 28, life: 1.3, rise: 20 });
    this.game.onLevelClear?.();
    this.after(1.3, () => this.beginLevel(this.level + 1));
  }

  /** Call when the player is hit. Loses a life, or ends the game on the last one. */
  hurt() {
    if (this.state !== 'playing') return;
    this.lives--;
    this.resetCombo();
    this.updateHud();
    if (this.lives <= 0) return this.gameOver();
    this.state = 'dying';
    this.sound.play('lose');
    this.fx.shake(8, 0.3); this.fx.flash('#ff3355', 0.35);
    this.after(0.9, () => {
      this.game.onLifeLost?.();
      this.showBanner('Get ready!', `${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`);
      this.state = 'banner';
      this.after(1.1, () => { this.hideBanner(); this.state = 'playing'; });
    });
  }

  /** Unlock one of this game's badges (ids from assets/js/games.js). */
  unlock(id, global = false) {
    const list = global ? GLOBAL_ACHIEVEMENTS : this.meta.achievements || [];
    const a = list.find((x) => x.id === id);
    if (!a) return;
    if (Store.unlockAch(global ? `g:${id}` : `${this.id}:${id}`)) this.toast(a);
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  // ── Run flow ─────────────────────────────────────────────────
  computeCheckpoints() {
    if (this.daily) return [1];
    const max = Store.maxLevel(this.id), list = [1];
    for (let l = CONFIG.bonusEvery + 1; l <= max; l += CONFIG.bonusEvery) list.push(l);
    return list;
  }

  startRun(startLevel = 1) {
    Sound.unlock();
    this.timers = [];
    this.fx.clear();
    this.startLevel = startLevel;
    this.score = 0; this.lives = this.def.lives || 1; this.playTime = 0;
    this.comboCount = 0; this.multiplier = 1;
    const seed = this.daily ? hashString(todayKey() + ':' + this.id) : (Math.random() * 4294967296) >>> 0;
    this.rng = makeRng(seed);
    Store.addPlay(this.id);
    this.unlock('first', true);
    if (GAMES.every((g) => Store.plays(g.id) > 0)) this.unlock('all', true);
    if (Store.totalPlays() >= 10) this.unlock('plays10', true);
    if (Store.totalPlays() >= 50) this.unlock('plays50', true);
    if (this.daily) this.unlock('daily', true);
    this.hideOverlay();
    this.game.reset?.();
    if (Sound.musicOn && this.def.music !== false) Sound.startMusic(this.def.music || {});
    this.beginLevel(startLevel);
  }
  restart() { this.startRun(this.startLevel || 1); }

  beginLevel(level) {
    this.level = level;
    this.bonus = this.isBonusLevel(level);
    this.bonusLeft = this.bonus ? (this.def.bonusTime || 15) : 0;
    this.lastTick = Math.ceil(this.bonusLeft);
    if (this.bonus) this.unlock('bonus', true);
    Store.reachLevel(this.id, level);
    for (const a of this.meta.achievements || []) {
      const m = /^level(\d+)$/.exec(a.id);
      if (m && level >= +m[1]) this.unlock(a.id);
    }
    this.game.startLevel(level, this.bonus);
    this.updateHud();
    const info = this.def.levelInfo ? this.def.levelInfo(level, this.bonus) : '';
    this.showBanner(this.bonus ? '★ BONUS ROUND ★' : `Level ${level}`, info, this.bonus);
    this.sound.play(this.bonus ? 'bonus' : 'go');
    if (this.def.music?.bpm) Sound.setTempo(this.def.music.bpm * Math.min(1.45, 1 + (level - 1) * 0.025));
    this.state = 'banner';
    this.after(this.bonus ? 1.7 : 1.35, () => { this.hideBanner(); this.state = 'playing'; });
  }

  gameOver() {
    this.state = 'dying';
    this.sound.play('die');
    this.fx.shake(12, 0.45); this.fx.flash('#ff3355', 0.5);
    this.game.onGameOver?.();
    this.after(1.0, () => this.showGameOver());
  }

  togglePause() {
    if (this.state === 'paused') return this.resume();
    if (['playing', 'banner', 'clear', 'dying'].includes(this.state)) {
      this.prevState = this.state; this.state = 'paused';
      Sound.stopMusic();
      this.showPause();
    }
  }
  autoPause() { if (['playing', 'banner'].includes(this.state)) this.togglePause(); }
  resume() {
    if (this.state !== 'paused') return;
    this.hideOverlay();
    this.state = this.prevState;
    if (this.state === 'banner') this.bannerEl.hidden = false;
    this.last = performance.now();
    if (Sound.musicOn && this.def.music !== false) Sound.startMusic(this.def.music || {});
  }
  toggleMute() { Sound.setMuted(!Sound.muted); this.updateButtons(); }
  toggleMusic() {
    Sound.setMusic(!Sound.musicOn);
    if (Sound.musicOn && ['playing', 'banner', 'clear'].includes(this.state) && this.def.music !== false) Sound.startMusic(this.def.music || {});
    this.updateButtons();
  }

  // ── Main loop ────────────────────────────────────────────────
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 'paused') { this.draw(); return; }
    this.time += dt;

    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    due.forEach((t) => t.fn());

    if (this.state === 'playing') {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.tick(STEP);
        if (this.state !== 'playing') { this.acc = 0; break; }
      }
    } else {
      this.game.idle?.(dt);
    }
    this.fx.update(dt);
    this.draw();
  }

  tick(dt) {
    this.playTime += dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.resetCombo(); }
    if (this.bonus) {
      this.bonusLeft -= dt;
      const c = Math.ceil(this.bonusLeft);
      if (c !== this.lastTick) { this.lastTick = c; if (c <= 3 && c > 0) this.sound.play('tick'); this.updateHud(); }
      if (this.bonusLeft <= 0) { this.bonusLeft = 0; this.completeLevel(); return; }
    }
    this.game.update(dt);
  }

  draw() {
    const ctx = this.ctx, s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    this.game.render(ctx);
    this.fx.render(ctx);
    ctx.restore();
    if (this.fx.flashA > 0) {
      ctx.globalAlpha = this.fx.flashA; ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
    }
  }

  // ── DOM: HUD, overlays ───────────────────────────────────────
  buildDom() {
    const m = this.meta;
    document.title = `${m.title} · ${CONFIG.siteName}`;
    document.documentElement.style.setProperty('--game-color', m.color || '#22d3ee');
    const app = document.getElementById('app');
    app.innerHTML = `
      <header class="hud">
        <a class="hud-home" href="../../" title="Back to the arcade">←<span> Arcade</span></a>
        <div class="hud-title">${esc(m.title)}${this.daily ? ' <span class="pill daily">Daily</span>' : ''}</div>
        <div class="hud-stats">
          <div class="stat"><small>Level</small><b data-hud="level">1</b></div>
          <div class="stat score"><small>Score</small><b data-hud="score">0</b></div>
          <div class="stat combo" data-hud="combo-wrap"><small>Combo</small><b data-hud="combo">x1</b></div>
          <div class="stat" data-hud="lives-wrap" hidden><small>Lives</small><b data-hud="lives"></b></div>
          <div class="stat timer" data-hud="timer-wrap" hidden><small>Bonus</small><b data-hud="timer">15</b></div>
          <div class="stat best"><small>Best</small><b data-hud="best">0</b></div>
        </div>
        <div class="hud-buttons">
          <button class="icon-btn" data-btn="pause" title="Pause (P)" aria-label="Pause">⏸</button>
          <button class="icon-btn" data-btn="music" title="Music" aria-label="Toggle music">🎵</button>
          <button class="icon-btn" data-btn="mute" title="Sound (M)" aria-label="Toggle sound">🔊</button>
        </div>
      </header>
      <main class="stage">
        <div class="canvas-wrap">
          <canvas aria-label="${esc(m.title)} game"></canvas>
          <div class="banner" hidden><div class="banner-title"></div><div class="banner-sub"></div></div>
          <div class="overlay" hidden></div>
          <div class="toasts" aria-live="polite"></div>
        </div>
      </main>`;
    this.stageEl = app.querySelector('.stage');
    this.wrap = app.querySelector('.canvas-wrap');
    this.canvas = app.querySelector('canvas');
    this.overlayEl = app.querySelector('.overlay');
    this.bannerEl = app.querySelector('.banner');
    this.toastsEl = app.querySelector('.toasts');
    this.hud = {};
    app.querySelectorAll('[data-hud]').forEach((el) => { this.hud[el.dataset.hud] = el; });
    app.querySelector('[data-btn="pause"]').onclick = (e) => { e.currentTarget.blur(); this.togglePause(); };
    app.querySelector('[data-btn="mute"]').onclick = (e) => { e.currentTarget.blur(); this.toggleMute(); };
    app.querySelector('[data-btn="music"]').onclick = (e) => { e.currentTarget.blur(); this.toggleMusic(); };
    this.updateButtons();
  }

  fit() {
    const r = this.stageEl.getBoundingClientRect();
    const k = Math.min(r.width / this.W, r.height / this.H);
    const w = Math.max(1, Math.floor(this.W * k)), h = Math.max(1, Math.floor(this.H * k));
    this.wrap.style.width = w + 'px'; this.wrap.style.height = h + 'px';
    this.wrap.style.fontSize = Math.max(11, Math.min(18, w / 30)) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.scale = this.canvas.width / this.W;
  }

  updateHud() {
    const h = this.hud;
    h.level.textContent = this.bonus ? `${this.level}★` : this.level;
    h.score.textContent = fmt(this.score);
    h.best.textContent = fmt(Math.max(Store.best(this.id), this.state === 'title' ? 0 : this.score));
    h.combo.textContent = `x${this.multiplier}`;
    h['combo-wrap'].classList.toggle('hot', this.multiplier > 1);
    const lives = this.def.lives || 1;
    h['lives-wrap'].hidden = lives <= 1;
    h.lives.textContent = '♥'.repeat(Math.max(0, this.lives));
    h['timer-wrap'].hidden = !this.bonus;
    h.timer.textContent = Math.ceil(this.bonusLeft);
  }
  updateButtons() {
    const q = (b) => document.querySelector(`[data-btn="${b}"]`);
    q('mute').textContent = Sound.muted ? '🔇' : '🔊';
    q('music').classList.toggle('off', !Sound.musicOn);
  }

  showBanner(title, sub = '', gold = false) {
    this.bannerEl.querySelector('.banner-title').textContent = title;
    this.bannerEl.querySelector('.banner-sub').textContent = sub;
    this.bannerEl.classList.toggle('gold', gold);
    this.bannerEl.hidden = false;
    this.bannerEl.style.animation = 'none'; void this.bannerEl.offsetWidth; this.bannerEl.style.animation = '';
  }
  hideBanner() { this.bannerEl.hidden = true; }

  showOverlay(html) {
    this.overlayEl.innerHTML = `<div class="panel">${html}</div>`;
    this.overlayEl.hidden = false;
    return this.overlayEl;
  }
  hideOverlay() { this.overlayEl.hidden = true; this.overlayEl.innerHTML = ''; this.hideBanner(); }

  toast(a) {
    this.sound.play('achieve');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon">${a.icon}</span><span><small>Badge unlocked</small><b>${esc(a.title)}</b></span>`;
    this.toastsEl.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  showTitle() {
    this.state = 'title';
    this.updateHud();
    const m = this.meta;
    const best = Store.best(this.id);
    const cps = this.checkpoints;
    const o = this.showOverlay(`
      <div class="title-art" style="--c:${m.color}">${esc(m.title)}</div>
      ${this.daily ? `<p class="pill daily big">📅 Daily Challenge · ${todayKey()}</p><p class="muted">Same level layout for everyone today. Own leaderboard.</p>` : `<p class="tagline">${esc(m.tagline || '')}</p>`}
      <p class="controls">🎮 ${esc(m.controls || '')}</p>
      ${cps.length > 1 ? `<div class="checkpoints"><small>Start from</small>${cps.map((l) => `<button class="chip${l === this.chosenStart ? ' on' : ''}" data-start="${l}">Level ${l}</button>`).join('')}</div>` : ''}
      <button class="btn primary big" data-act="play">▶ Play</button>
      <p class="muted small">Press <kbd>Enter</kbd> or <kbd>Space</kbd> · <kbd>P</kbd> pause · <kbd>M</kbd> mute</p>
      <div class="title-foot">
        ${best ? `<span>Your best: <b>${fmt(best)}</b></span>` : '<span>No best score yet — go!</span>'}
        <span data-top>…</span>
      </div>
      <p class="small">${this.daily ? `<a href="./">Play normal mode instead</a>` : `<a href="./?daily=1">Try today's Daily Challenge seed →</a>`}</p>
    `);
    o.querySelector('[data-act="play"]').onclick = () => this.startRun(this.chosenStart);
    o.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => {
      this.chosenStart = +b.dataset.start; Sound.play('click');
      o.querySelectorAll('[data-start]').forEach((x) => x.classList.toggle('on', x === b));
    });
    o.querySelector('[data-act="play"]').focus({ preventScroll: true });
    Scores.top(this.id, 'today', this.mode, 1).then((rows) => {
      const el = o.querySelector('[data-top]'); if (!el) return;
      el.innerHTML = rows[0] ? `Today's top: <b>${esc(rows[0].name)}</b> ${fmt(rows[0].score)}` : 'Be first on today\'s board!';
    }).catch(() => { const el = o.querySelector('[data-top]'); if (el) el.textContent = ''; });
  }

  showPause() {
    const o = this.showOverlay(`
      <h2>Paused</h2>
      <p class="muted">Level ${this.level} · Score ${fmt(this.score)}</p>
      <button class="btn primary big" data-act="resume">▶ Resume</button>
      <div class="row"><button class="btn" data-act="restart">↻ Restart</button><a class="btn" href="../../">⌂ Arcade</a></div>`);
    o.querySelector('[data-act="resume"]').onclick = () => this.resume();
    o.querySelector('[data-act="restart"]').onclick = () => { this.state = 'title'; this.restart(); };
    o.querySelector('[data-act="resume"]').focus({ preventScroll: true });
  }

  async showGameOver() {
    this.state = 'over';
    this.overReady = false;
    setTimeout(() => { this.overReady = true; }, 450);
    const score = Math.floor(this.score);
    const prevBest = Store.best(this.id);
    const isPB = Store.submitBest(this.id, score);
    if (isPB && prevBest > 0) this.unlock('pb', true);
    let pbLine;
    if (isPB && score > 0) pbLine = `<p class="pb">🎉 New personal best!</p>`;
    else if (prevBest - score > 0 && prevBest - score <= Math.max(50, prevBest * 0.25)) pbLine = `<p class="near">So close! Only <b>${fmt(prevBest - score)}</b> off your best (${fmt(prevBest)})</p>`;
    else pbLine = `<p class="muted">Your best: ${fmt(prevBest)}</p>`;
    const others = GAMES.filter((g) => g.id !== this.id);
    const boardUrl = `../../leaderboard/?game=${this.id}&period=${this.daily ? 'daily' : 'today'}`;
    const gameUrl = location.origin + location.pathname + (this.daily ? '?daily=1' : '');
    const shareText = score > 0
      ? `🎮 I scored ${fmt(score)} on ${this.meta.title}${this.daily ? " (today's Daily Challenge)" : ''} and reached level ${this.level}! Can you beat me? ${gameUrl}`
      : `🎮 Come play ${this.meta.title} with me, free in your browser: ${gameUrl}`;

    const o = this.showOverlay(`
      <h2 class="over-title">Game Over</h2>
      <div class="final-score">${fmt(score)}</div>
      <p class="muted">Reached level ${this.level}${this.daily ? ' · Daily Challenge' : ''}</p>
      ${pbLine}
      <div class="rank-box" data-rank><span class="muted">Checking the leaderboard…</span></div>
      <button class="btn primary big" data-act="again">↻ Play again</button>
      <a class="btn wa" href="${whatsappLink(shareText)}" target="_blank" rel="noopener">${WA_ICON} Challenge a friend on WhatsApp</a>
      <div class="row">
        <button class="btn" data-act="menu">☰ Menu</button>
        <a class="btn" href="${boardUrl}">🏆 Leaderboard</a>
        <a class="btn" href="../../">⌂ Arcade</a>
      </div>
      <div class="try-more"><small>Try another game</small>
        <div class="mini-cards">${others.map((g) => `<a class="mini-card" href="../${g.id}/" style="--c:${g.color}"><img src="../${g.id}/thumb.svg" alt="" width="44" height="44">${esc(g.title)}</a>`).join('')}</div>
      </div>`);
    const again = o.querySelector('[data-act="again"]');
    again.onclick = () => this.restart();
    o.querySelector('[data-act="menu"]').onclick = () => { this.checkpoints = this.computeCheckpoints(); this.showTitle(); };
    again.focus({ preventScroll: true });

    const box = o.querySelector('[data-rank]');
    let rows;
    try { rows = await Scores.top(this.id, 'today', this.mode, CONFIG.boardSize); }
    catch { box.innerHTML = `<span class="muted">Leaderboard is offline right now.</span>`; return; }
    if (this.state !== 'over' || !box.isConnected) return;
    const rank = 1 + rows.filter((r) => r.score > score).length;
    const qualifies = score > 0 && (rows.length < CONFIG.boardSize || score > rows[rows.length - 1].score);
    if (!qualifies) {
      const cut = rows.length ? rows[rows.length - 1].score : 0;
      const gap = cut - score + 1;
      box.innerHTML = score === 0 ? `<span class="muted">Score some points to get on the board!</span>`
        : `<span class="muted">Top ${CONFIG.boardSize} today needs <b>${fmt(cut + 1)}</b>${gap <= Math.max(100, cut * 0.2) ? ` — just ${fmt(gap)} more!` : ''}</span>`;
      return;
    }
    this.sound.play('highscore');
    box.innerHTML = `
      <p class="rank-msg">${rank === 1 ? '👑 That\'s the <b>#1</b> score today!' : `That's <b>#${rank}</b> today!`} Enter your name:</p>
      <form class="name-form" autocomplete="off">
        <input name="n" maxlength="12" placeholder="Your name" value="${esc(Store.name())}" aria-label="Your name" enterkeyhint="done">
        <button class="btn primary" type="submit">Save</button>
      </form>
      <p class="form-msg" aria-live="polite"></p>`;
    const form = box.querySelector('form'), input = form.n, msg = box.querySelector('.form-msg');
    input.focus({ preventScroll: true }); input.select();
    input.addEventListener('input', () => { const c = cleanName(input.value); if (c !== input.value.trim() || input.value.length > 12) input.value = c; msg.textContent = ''; });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = cleanName(input.value);
      const problem = nameProblem(name);
      if (problem) { msg.textContent = problem; msg.className = 'form-msg err'; return; }
      form.querySelector('button').disabled = true; msg.textContent = 'Saving…'; msg.className = 'form-msg';
      try {
        const r = await Scores.submit({ game: this.id, name, score, level: this.level, durationMs: this.playTime * 1000, mode: this.mode });
        Store.setName(name);
        this.unlock('famous', true);
        box.innerHTML = `<p class="rank-msg saved">✅ Saved! <b>${esc(name)}</b> is <b>#${r.rank}</b> today. <a href="${boardUrl}">See the board →</a></p>`;
        again.focus({ preventScroll: true });
      } catch (err) {
        form.querySelector('button').disabled = false;
        msg.textContent = err.message || 'Could not save — try again.'; msg.className = 'form-msg err';
      }
    };
  }
}

// ── Small drawing helpers games can import ──────────────────────
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function progressBar(ctx, x, y, w, h, frac, color = '#fff', label = '') {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color; roundRect(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2); ctx.fill();
  if (label) {
    ctx.font = `700 ${h * 0.8}px system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  }
  ctx.restore();
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

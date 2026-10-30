// ─────────────────────────────────────────────────────────────
//  HEADLESS GAMES — run a game's real game.js in Node, without a browser.
//
//    import { loadGame } from '../../tools/lib/headless.mjs';
//    const DM = await loadGame('dock-master');
//    const s = DM.start({ seed: 7, level: 6 });   // a shell with the game built at level 6
//    s.run(30);                                    // 30 s of play at the engine's 120 Hz step
//
//  The shell copies the engine's rules that matter for play: the fixed 1/120 s step, lives,
//  hurt() → 2 s → onLifeLost() → back in play, completeLevel(), bonus rounds on a timer, and
//  the seeded s.rng. Drawing, sound, effects, badges and scores are no-ops. It is what the
//  per-game tests (games/<id>/test.mjs) use, so a whole level plays out in milliseconds.
//  Needs Node 20.6 or newer.
// ─────────────────────────────────────────────────────────────
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeRng } from '../../assets/js/rng.js';

register('./engine-hooks.mjs', import.meta.url);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STEP = 1 / 120;          // the engine's fixed update step
const BONUS_EVERY = 5;                // assets/js/config.js bonusEvery

// sound, fx and anything else cosmetic: every property is a function that does nothing
const NOOP = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : NOOP), apply: () => NOOP });

// Some games paint sprites into off-screen canvases while they set up. Headless, a canvas is a
// stand-in whose drawing calls do nothing (the game logic never reads pixels back).
if (typeof globalThis.document === 'undefined') {
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => NOOP, toDataURL: () => '',
    addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }) });
  globalThis.document = { createElement: canvas, body: NOOP, documentElement: { style: {} }, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, getElementById: () => null, hidden: false, pointerLockElement: null };
  globalThis.OffscreenCanvas ??= class { constructor(w, h) { Object.assign(this, canvas(), { width: w, height: h }); } };
}
// window-level listeners (keys, resize) never fire headless; the page has no URL options
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.location ??= { search: '', hash: '', href: 'http://headless/', pathname: '/' };

export class HeadlessShell {
  constructor(def, { seed = 1, lives } = {}) {
    this.def = def; this.id = def.id;
    this.W = def.width; this.H = def.height; this.boxH = def.height;
    this.rng = makeRng(seed);
    this.lives = lives ?? def.lives ?? 3; this.livesLost = 0;
    this.level = 1; this.bonus = false; this.bonusLeft = 0;
    this.state = 'title'; this.score = 0; this.time = 0; this.playTime = 0;
    this.comboCount = 0; this.multiplier = 1;
    this.cleared = 0; this.timers = [];
    // no audio headless: sound.now() is null, as when the game is muted before any tap
    this.sound = new Proxy(NOOP, { get: (_, k) => (k === 'now' ? () => null : NOOP) }); this.fx = NOOP;
    this.input = { isDown: () => false, pointer: { x: 0, y: 0, down: false }, pointers: new Map() };
    this.bands = { top: 0, bottom: 0 }; this.coarse = false; this.lowDetail = false; this.gold = false;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.W; this.canvas.height = this.H;
    this.game = def.create(this);
  }

  // ── engine flow ──
  /** Same difficulty multiplier as engine.js speed(). */
  speed(perLevel = 0.07, cap = 2.4, level = this.level) { return Math.min(cap, Math.pow(1 + perLevel, level - 1)); }
  isBonusLevel(level) {
    const d = this.def;
    if (d.secretLevel && level >= d.secretLevel) return false;
    if (d.bonusLevels) return d.bonusLevels.includes(level);
    return level % BONUS_EVERY === 0;
  }
  beginLevel(level) {
    this.level = level; this.bonus = this.isBonusLevel(level);
    this.bonusLeft = this.bonus ? (this.def.bonusTime || 15) : 0;
    this.game.startLevel(level, this.bonus);
    this.state = 'playing';
  }
  completeLevel() {
    if (this.state !== 'playing') return;
    this.state = 'clear'; this.cleared++;
    this.game.onLevelClear?.();
  }
  hurt() {
    if (this.state !== 'playing') return;
    this.lives--; this.livesLost++; this.resetCombo();
    if (this.lives <= 0) { this.state = 'over'; this.game.onGameOver?.(); return; }
    this.state = 'dying';
    this.after(0.9, () => {               // same timings as engine.js hurt()
      this.game.onLifeLost?.();
      this.state = 'banner';
      this.after(1.1, () => { this.state = 'playing'; });
    });
  }
  after(t, fn) { this.timers.push({ t, fn }); }
  isFlawless() { return this.livesLost === 0; }

  /** One engine step. */
  tick(dt = STEP) {
    this.time += dt;
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    due.forEach((t) => t.fn());
    if (this.state === 'playing') {
      this.playTime += dt;
      if (this.bonus) { this.bonusLeft -= dt; if (this.bonusLeft <= 0) { this.bonusLeft = 0; this.completeLevel(); return; } }
      this.game.update(dt);
    } else this.game.idle?.(dt);
  }
  /** Run up to `seconds` of game time; stop early when until(shell) is true. Returns seconds run. */
  run(seconds, until) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) { this.tick(); if (until?.(this)) return (i + 1) * STEP; }
    return seconds;
  }

  // ── scoring, badges, combos: kept simple, nothing leaves the process ──
  addScore(n) { this.score += n; }
  award(n) { this.score += n * this.multiplier; this.comboCount++; }
  resetCombo() { this.comboCount = 0; this.multiplier = 1; }
  unlock() {} reward() {} toast() {} updateHud() {}
  // ── render caches (games draw nothing headless) ──
  dropLayers() {} layer() {} glowSprite() { return null; }
}

const cache = new Map();
/** Load games/<id>/game.js with the engine stubbed. Returns { def, start(opts) }. */
export async function loadGame(id) {
  if (cache.has(id)) return cache.get(id);
  const before = (globalThis.__headlessDefs ||= []).length;
  await import(pathToFileURL(path.join(ROOT, 'games', id, 'game.js')).href);
  const def = globalThis.__headlessDefs[before];
  if (!def) throw new Error(`${id}: game.js did not call runGame()`);
  const api = {
    def,
    /** A shell with a fresh game at `level` (default 1), ready to play. */
    start({ seed = 1, level = 1, lives } = {}) {
      const s = new HeadlessShell(def, { seed, lives });
      s.beginLevel(level);
      return s;
    },
  };
  cache.set(id, api);
  return api;
}

/** Tiny test helpers shared by games/<id>/test.mjs files. */
export function reporter(name) {
  const fails = [];
  return {
    fail(msg) { fails.push(msg); },
    check(ok, msg) { if (!ok) fails.push(msg); return ok; },
    done(summary = '') {
      if (fails.length) {
        console.log(`✗ ${name}: ${fails.length} problem(s)`);
        for (const f of fails.slice(0, 12)) console.log(`    ${f}`);
        if (fails.length > 12) console.log(`    … and ${fails.length - 12} more`);
        process.exit(1);
      }
      console.log(`✓ ${name}${summary ? ` — ${summary}` : ''}`);
      process.exit(0);
    },
  };
}

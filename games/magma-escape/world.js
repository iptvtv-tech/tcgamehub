// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — the rules (pure: no DOM, no canvas, no sound). Shared by game.js, the level
//  checker (check.mjs) and the test bots (test.mjs, bench.mjs), so they all move exactly as the
//  player does.
//
//  A level is one hand-drawn shaft inside the volcano (levels.js). ShaftSim runs it at the
//  engine's fixed 120 Hz step: the Iceman and his ice blade, the slowly rising lava, the magma
//  embers that drip from above, the ice crystals and the vent at the top (the way out).
//  step(input) returns a list of events (slash, kill, burn, melt…) that game.js turns into
//  sound, particles and points.
//
//  Melting: the Iceman's size is his health (hp 0–100). Lava and embers melt him one stage at a
//  time: Full → Drips → Cracks → Small. A smaller Iceman jumps lower and is a smaller target.
//  At 0 he is a puddle: the game takes a heart (an engine life) and the level starts again at
//  full size. Ice crystals freeze him back up.
//
//  Randomness (where and when embers drip) comes from one stream per level, seeded from the
//  run seed and the level number, so the Daily Challenge is the same for everyone and every
//  retry of a level replays the same embers.
//
//  Tiles:    # rock (solid)    = stone ledge (one-way: jump up through it, land on top)
//  Markers (air underneath):   S start    E the vent (the way out)    * ice crystal
// ─────────────────────────────────────────────────────────────
import { makeRng } from '../../assets/js/rng.js';

export const TILE = 24;
export const COLS = 20;                       // 20 × 24 = 480: the shaft is exactly the screen's width
export const DT = 1 / 120;
export const AIR = 0, ROCK = 1, LEDGE = 2;
export const isFloor = (k) => k === ROCK || k === LEDGE;

// The Iceman's body (centre-x, feet-y) at full size; it shrinks with his size k.
export const PW = 22, PH = 50;
// Movement feel, in screen pixels (the view is 1:1)
export const RUN = 215, ACCEL_G = 2100, ACCEL_A = 1450, FRICTION = 2600;
export const GRAV = 1750, FALL_MUL = 1.4, MAX_FALL = 780;
export const JUMP_FULL = 170, JUMP_SMALL = 140;       // jump height (px) at full size / as the small man
export const JUMP_CUT = 0.45, COYOTE = 0.12, BUFFER = 0.14;
/** Even a quick tap of JUMP lifts him this high (px): enough for any climb in the shafts (4 rows = 96 px). */
export const MIN_JUMP = 112;

// Melting
export const MAX_HP = 100;
/** The four sizes, smallest first. min: hp above which this stage holds; k: body size. */
export const STAGES = [
  { name: 'Small',  min: 0,  k: 0.64 },
  { name: 'Cracks', min: 25, k: 0.78 },
  { name: 'Drips',  min: 50, k: 0.89 },
  { name: 'Full',   min: 75, k: 1 },
];
export const stageOf = (hp) => (hp > 75 ? 3 : hp > 50 ? 2 : hp > 25 ? 1 : 0);
/** The stage his body is at right now (it can lag his hp while a crystal's growth waits for headroom). */
export const sizeIdx = (p) => Math.max(0, STAGES.findIndex((s) => s.k === p.k));
export const K_SMALL = STAGES[0].k;
export const LAVA_DMG = 30, EMBER_DMG = 15, CRYSTAL_HP = 25;
export const INV_T = 1.0, KB_T = 0.18, KB_VX = 250, KB_VY = -330;
export const LAVA_HOP = -820;                 // lava throws him up out of it

// The ice blade
export const SLASH_T = 0.2, SLASH_CD = 0.3, SLASH_ON = [0.015, 0.13], SLASH_BUF = 0.12;
export const REACH = 58;                      // in front of his body at full size; a little less as he shrinks
export const POGO_V = -600;                   // the bounce off a jump-stab hit

// The lava: rises very slowly, so there is time to fight; if it falls a long way behind, it catches up
export const CATCH_GAP = 560, CATCH_V = 70;
export const lavaSpeed = (level) => 6.2 + level * 0.8;

// Magma embers: drip from above, land, crawl at you and hop when close
export const EMBER_HW = 11, EMBER_H = 20;    // a box no wider than a tile, so one can drip down any open column
export const EMBER_WARN = 0.9;                // the glow at the top of the screen before one drips
export const EMBER_GRAV = 1100, EMBER_FALL = 460, EMBER_HOP_V = -420, EMBER_HOP_VX = 130, EMBER_SQUAT = 0.35, EMBER_HOP_CD = 1.8;
export const SPAWN_UP = 470;                  // drips start this far above the Iceman (just above the screen)
export const emberCrawl = (level) => 46 + Math.min(level, 15) * 2;

/**
 * The magma creatures. ember: crawls at you and hops. spitter: sits where it lands and lobs
 * fireballs. bat: a cinder bat that flies (through ledges), hovers, then dives at you. brute: a big
 * ember that takes two hits. Each new one arrives a few levels after the last (levelInfo says so).
 */
export const FOES = {
  ember:   { hp: 1, h: 20, dmg: 15, pts: 50, from: 1 },
  spitter: { hp: 1, h: 22, dmg: 15, pts: 75, from: 3 },
  bat:     { hp: 1, h: 18, dmg: 15, pts: 60, from: 6 },
  brute:   { hp: 2, h: 26, dmg: 20, pts: 120, from: 8 },
};
export const SPIT_EVERY = 2.6, SPIT_AIM = 0.5, SHOT_G = 700, SHOT_DMG = 15, SHOT_PTS = 20;
export const BAT_SPEED = 120, BAT_AIM = 0.45, BAT_DIVE = 300;
// Rock rain: a shadow marks the spot, then a rock drops out of the dark
export const ROCK_WARN = 1.0, ROCK_DMG = 20, ROCK_PTS = 20, ROCK_R = 11;

/** What drips on each level: how often, how many at once, which kinds (weights), and the rock rain. */
export function emberPlan(level) {
  const L = level, open = (k) => L >= FOES[k].from;
  return {
    first: L === 1 ? 4 : 2.5,
    every: Math.max(1.6, 4.8 - (L - 1) * 0.22),
    max: Math.min(6, 2 + Math.floor((L - 1) / 3)),
    mix: { ember: 6, spitter: open('spitter') ? 2 + L * 0.15 : 0, bat: open('bat') ? 2 + (L - 6) * 0.3 : 0, brute: open('brute') ? 1 + (L - 8) * 0.35 : 0 },
    rocks: L >= 4 ? Math.max(3.2, 8 - (L - 4) * 0.45) : 0,       // seconds between rocks (0 = none)
  };
}
export const EMBER_PTS = 50, CRYSTAL_PTS = 25, POGO_PTS = 10;

import { makeBoss, stepBoss, hitBoss } from './boss.js';

// ── The map ──────────────────────────────────────────────────
/** Parse a shaft's rows (top to bottom) into a tile map with its markers. */
export function parseMap(rows, name = '') {
  const R = rows.length, C = rows[0].length;
  if (C !== COLS) throw new Error(`${name}: rows must be ${COLS} wide (got ${C})`);
  const t = new Uint8Array(R * C);
  const m = { name, R, C, w: C * TILE, h: R * TILE, t, spawn: null, exit: null, crystals: [] };
  rows.forEach((row, r) => {
    if (row.length !== C) throw new Error(`${name}: row ${r} is ${row.length} wide`);
    for (let c = 0; c < C; c++) {
      const ch = row[c], cx = c * TILE + TILE / 2;
      if (ch === '#') t[r * C + c] = ROCK;
      else if (ch === '=') t[r * C + c] = LEDGE;
      else if (ch === 'S') m.spawn = { x: cx, y: (r + 1) * TILE };
      else if (ch === 'E') m.exit = { x: cx, y: (r + 1) * TILE };
      else if (ch === '*') m.crystals.push({ x: cx, y: r * TILE + TILE / 2 });
      else if (ch !== '.') throw new Error(`${name}: unknown tile '${ch}' at row ${r}`);
    }
  });
  if (!m.spawn || !m.exit) throw new Error(`${name}: needs an S and an E`);
  m.lavaStart = m.h - TILE * 1.5;       // the pool at the bottom of the shaft
  return m;
}

/** Outside the map counts as rock, so nothing can leave it. */
export const tileAt = (m, c, r) => (c < 0 || r < 0 || c >= m.C || r >= m.R ? ROCK : m.t[r * m.C + c]);
export const tileAtPx = (m, x, y) => tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
export const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Move a box (o.x centre, o.y bottom) by its velocity, axis by axis, against rock.
 * Ledges are one-way: you land on them only when falling onto them from above.
 * Zeroes the blocked velocity and returns { wall, ground, ceil } (one shared object: read it straight away).
 */
const RES = { wall: 0, ground: false, ceil: false };
export function moveBody(o, hw, h, m, dt = DT) {
  const res = RES;
  res.wall = 0; res.ground = false; res.ceil = false;
  o.x += o.vx * dt;
  const top = Math.floor((o.y - h + 0.01) / TILE), bot = Math.floor((o.y - 0.01) / TILE);
  if (o.vx > 0) {
    const c = Math.floor((o.x + hw) / TILE);
    for (let r = top; r <= bot; r++) if (tileAt(m, c, r) === ROCK) { o.x = c * TILE - hw - 0.001; o.vx = 0; res.wall = 1; break; }
  } else if (o.vx < 0) {
    const c = Math.floor((o.x - hw) / TILE);
    for (let r = top; r <= bot; r++) if (tileAt(m, c, r) === ROCK) { o.x = (c + 1) * TILE + hw + 0.001; o.vx = 0; res.wall = -1; break; }
  }
  const prevY = o.y; o.y += o.vy * dt;
  const c0 = Math.floor((o.x - hw + 0.01) / TILE), c1 = Math.floor((o.x + hw - 0.01) / TILE);
  if (o.vy >= 0) {
    const r = Math.floor(o.y / TILE);
    for (let c = c0; c <= c1; c++) {
      const k = tileAt(m, c, r);
      if (k === ROCK || (k === LEDGE && prevY <= r * TILE + 0.5)) { o.y = r * TILE; o.vy = 0; res.ground = true; break; }
    }
  } else {
    const r = Math.floor((o.y - h) / TILE);
    for (let c = c0; c <= c1; c++) if (tileAt(m, c, r) === ROCK) { o.y = (r + 1) * TILE + h + 0.001; o.vy = 0; res.ceil = true; break; }
  }
  return res;
}

// ── The Iceman ───────────────────────────────────────────────
export const halfW = (k) => (PW * k) / 2;
export const bodyH = (k) => PH * k;
/** Jump speed for a body size: the small man jumps JUMP_SMALL px, full size JUMP_FULL. */
export const jumpV = (k) => -Math.sqrt(2 * GRAV * (JUMP_SMALL + (JUMP_FULL - JUMP_SMALL) * Math.max(0, (k - K_SMALL) / (1 - K_SMALL))));
export const playerBox = (p) => { const hw = halfW(p.k); return [p.x - hw, p.y - bodyH(p.k), p.x + hw, p.y]; };

export function makePlayer(m, hp = MAX_HP) {
  return {
    x: m.spawn.x, y: m.spawn.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, jumpHeld: false, jumped: false, air: 0, kbT: 0,
    hp, k: STAGES[stageOf(hp)].k, inv: 0, atk: null, atkCD: 0, slashBuf: 0, dead: false, grow: false, best: m.spawn.y, fallV: 0, pogos: 0,
  };
}

export const EV_JUMP = 1;

/**
 * One 1/120 s movement step. inp = { dir: -1|0|1, jumpPress (edge), jumpHeld }.
 * Returns EV_JUMP when a jump started this tick. check.mjs and the bots search with exactly this.
 */
export function stepPlayer(p, inp, m) {
  const dt = DT;
  let ev = 0;
  const ctrl = !(p.kbT > 0);                 // knocked back: no steering for a moment
  if (p.kbT > 0) p.kbT -= dt;
  p.buffer = inp.jumpPress ? BUFFER : Math.max(0, p.buffer - dt);
  p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
  const dir = ctrl ? inp.dir : 0;
  if (dir) { if (!p.atk) p.face = dir; p.vx = approach(p.vx, dir * RUN, (p.ground ? ACCEL_G : ACCEL_A) * dt); }
  else if (ctrl) p.vx = approach(p.vx, 0, (p.ground ? FRICTION : FRICTION * 0.25) * dt);
  if (ctrl && p.buffer > 0 && p.coyote > 0) {
    p.vy = jumpV(p.k); p.coyote = 0; p.ground = false; p.buffer = 0; p.jumped = true; p.jumpY = p.y; ev |= EV_JUMP;
  }
  // let go early for a shorter jump — but never shorter than MIN_JUMP, so a tap still climbs
  if (!inp.jumpHeld && p.jumpHeld && p.vy < 0 && p.jumped) {
    const risen = (p.jumpY ?? p.y) - p.y, need = Math.max(0, MIN_JUMP - risen), keep = -Math.sqrt(2 * GRAV * need);
    p.vy = Math.max(p.vy, Math.min(p.vy * JUMP_CUT, keep));   // cut short, but never below MIN_JUMP (owner's choice, 30 Oct)
    p.jumped = false;
  }
  p.jumpHeld = !!inp.jumpHeld;
  // gravity, heavier on the way down so jumps feel snappy
  p.vy = Math.min(MAX_FALL, p.vy + GRAV * (p.vy > 0 ? FALL_MUL : 1) * dt);
  const fallV = p.vy;
  const r = moveBody(p, halfW(p.k), bodyH(p.k), m, dt);
  p.ground = r.ground;
  if (p.ground) { if (p.air > 0) p.fallV = fallV; p.jumped = false; }
  p.air = p.ground ? 0 : p.air + dt;
  return ev;
}

/** Does this box overlap rock anywhere? (a crystal's growth must have room) */
export function boxInRock(m, b) {
  const c0 = Math.floor(b[0] / TILE), c1 = Math.floor((b[2] - 0.01) / TILE), r0 = Math.floor(b[1] / TILE), r1 = Math.floor((b[3] - 0.01) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(m, c, r) === ROCK) return true;
  return false;
}

/** Where the blade hits during a swing: the box in front of him, above him, or (in the air) below him. */
export function slashBox(p) {
  const hw = halfW(p.k), h = bodyH(p.k), reach = REACH * (0.72 + 0.28 * p.k), a = p.atk;
  if (a.kind === 'up') return [p.x - hw - 16, p.y - h - reach, p.x + hw + 16, p.y - h * 0.35];
  if (a.kind === 'down') return [p.x - hw - 12, p.y - 8, p.x + hw + 12, p.y + reach * 0.9];
  const f = a.face;
  const x0 = p.x + f * (hw - 4), x1 = p.x + f * (hw + reach);
  return [Math.min(x0, x1), p.y - h - 10, Math.max(x0, x1), p.y + 4];
}

/** The vent at the top: the Iceman's body reaches it. */
export const atExit = (p, m) => Math.abs(p.x - m.exit.x) < 30 && p.y > m.exit.y - 60 && p.y - bodyH(p.k) < m.exit.y;

export const emberBox = (e) => [e.x - EMBER_HW, e.y - FOES[e.kind || 'ember'].h, e.x + EMBER_HW, e.y];
export const shotBox = (b) => { const r = b.r || 7; return [b.x - r, b.y - r, b.x + r, b.y + r]; };

// ── One level ────────────────────────────────────────────────
export class ShaftSim {
  constructor(m, level, seed) {
    this.m = m; this.level = level; this.seed = seed >>> 0;
    // a boss arena: nothing drips on its own (the drake shakes embers loose when it's angry)
    this.plan = m.boss ? { first: 1e9, every: 1e9, max: 2, mix: { ember: 1 }, rocks: 0 } : emberPlan(level);
    this.lavaV = lavaSpeed(level);
    this.crawl = emberCrawl(level);
    this.reset();
  }

  /** The start of the level, and every retry after a lost heart: full size, the lava back in its pool. */
  reset() {
    const m = this.m;
    this.rng = makeRng(this.seed);
    this.p = makePlayer(m);
    this.lava = { y: m.lavaStart, start: m.lavaStart };
    this.embers = []; this.nextId = 1; this.shots = []; this.rocks = []; this.waves = []; this.pillars = [];
    this.boss = makeBoss(m, this.rng);
    this.spawnT = this.plan.first; this.rockT = this.plan.rocks ? this.plan.rocks * 0.7 : 0;
    this.crystals = m.crystals.map((c) => ({ x: c.x, y: c.y, got: false }));
    this.done = false; this.t = 0; this.kills = 0;
    this.ev = [];
  }

  /** One 1/120 s step. inp = { dir, jumpPress, jumpHeld, up, down, slashPress }. Returns this step's events. */
  step(inp) {
    const ev = this.ev = [];
    const p = this.p, m = this.m;
    this.t += DT;
    this.stepLava();
    if (p.dead || this.done) { this.stepEmbers(); this.stepShots(); if (this.boss && !this.boss.gone && (this.boss.dead || p.dead)) stepBoss(this); return ev; }
    if (p.inv > 0) p.inv -= DT;
    if (p.atkCD > 0) p.atkCD -= DT;

    // the blade: a press shortly before it is ready still counts
    p.slashBuf = inp.slashPress ? SLASH_BUF : Math.max(0, p.slashBuf - DT);
    if (p.slashBuf > 0 && p.atkCD <= 0 && !p.atk) {
      const kind = inp.down && !p.ground ? 'down' : inp.up && !inp.dir ? 'up' : 'side';
      p.atk = { kind, t: 0, face: p.face, hit: [] };
      p.atkCD = SLASH_CD; p.slashBuf = 0;
      ev.push({ type: 'slash', kind });
    }

    const wasGround = p.ground;
    if (stepPlayer(p, inp, m) & EV_JUMP) ev.push({ type: 'jump', x: p.x, y: p.y });
    if (p.ground && !wasGround) ev.push({ type: 'land', x: p.x, y: p.y, hard: p.fallV > 520 });
    if (p.y < p.best) p.best = p.y;

    if (p.atk) {
      p.atk.t += DT;
      if (p.atk.t >= SLASH_ON[0] && p.atk.t <= SLASH_ON[1]) this.bladeHits();
      if (p.atk && p.atk.t >= SLASH_T) p.atk = null;
    }

    // a crystal grew him back, but there was no room overhead: grow when there is
    if (p.grow) this.tryGrow();

    // lava: a burn, and up he goes
    if (p.y > this.lava.y + 6) {
      if (p.inv <= 0) this.damage(LAVA_DMG, 'lava', 0);
      else if (p.vy > 0) { p.vy = LAVA_HOP * 0.8; p.ground = false; p.jumped = false; }
      if (p.dead) return ev;
    }

    this.stepEmbers();
    if (p.dead) return ev;
    this.stepShots();
    if (p.dead) return ev;
    this.stepSpawns();
    if (this.boss) { stepBoss(this); if (p.dead) return ev; }

    // ice crystals
    const pb = playerBox(p);
    for (const c of this.crystals) {
      if (c.got || !overlap(pb, [c.x - 11, c.y - 11, c.x + 11, c.y + 11])) continue;
      c.got = true;
      this.heal(CRYSTAL_HP);
      ev.push({ type: 'crystal', x: c.x, y: c.y, hp: p.hp, all: this.crystals.every((q) => q.got) });
    }

    // the vent: the way out
    if (atExit(p, m) && this.ventOpen()) { this.done = true; p.atk = null; ev.push({ type: 'exit', x: p.x, y: p.y, hp: p.hp }); }
    return ev;
  }

  stepLava() {
    const L = this.lava, gap = L.y - this.p.y;
    L.y = Math.max(this.m.lavaCap ?? 0, Math.min(L.y, L.y - (gap > CATCH_GAP ? CATCH_V : this.lavaV) * DT));
  }

  /** The vent is open: always on a climb; in an arena once the boss has fallen. */
  ventOpen() { return !this.boss || this.boss.dead; }

  /** Melt him by n. kind 'lava' throws him up; an ember knocks him away from it (kb = -1 | 1). */
  damage(n, kind, kb) {
    const p = this.p, before = sizeIdx(p);
    p.hp = Math.max(0, p.hp - n);
    p.inv = INV_T; p.atk = null;
    if (kind === 'lava') { p.vy = LAVA_HOP; p.vx *= 0.5; p.kbT = 0.12; }
    else { p.vx = kb * KB_VX; p.vy = KB_VY; p.kbT = KB_T; }
    p.ground = false; p.jumped = false; p.coyote = 0;
    this.ev.push({ type: kind === 'lava' ? 'burn' : 'hurt', x: p.x, y: p.y - bodyH(p.k) / 2, hp: p.hp });
    if (p.hp <= 0) { p.dead = true; p.vx = 0; p.grow = false; this.ev.push({ type: 'melt', x: p.x, y: p.y }); return; }
    const after = Math.min(before, stageOf(p.hp));
    p.grow = stageOf(p.hp) > after;
    if (after !== before) { p.k = STAGES[after].k; this.ev.push({ type: 'stage', from: before, to: after }); }
  }

  heal(n) {
    const p = this.p;
    p.hp = Math.min(MAX_HP, p.hp + n);
    if (stageOf(p.hp) > sizeIdx(p)) p.grow = true;
    this.tryGrow();
  }

  /** Grow to the size his hp gives him, if the bigger body fits where he stands. */
  tryGrow() {
    const p = this.p, to = stageOf(p.hp), from = sizeIdx(p), want = STAGES[to].k;
    if (to <= from) { p.grow = false; return; }
    const hw = halfW(want);
    if (boxInRock(this.m, [p.x - hw, p.y - bodyH(want), p.x + hw, p.y - 0.5])) return;
    p.k = want; p.grow = false;
    this.ev.push({ type: 'stage', from, to });
  }

  bladeHits() {
    const p = this.p, a = p.atk, box = slashBox(p);
    const pogo = () => {
      if (a.kind !== 'down' || p.ground) return;
      p.vy = POGO_V; p.jumped = false; p.ground = false; p.coyote = 0; p.buffer = 0; p.pogos++;
      this.ev.push({ type: 'pogo', x: p.x, y: p.y, n: p.pogos });
    };
    // fireballs and falling rocks shatter on the blade too
    for (const b of [...this.shots, ...this.rocks]) {
      if (b.dead || b.warn > 0 || !overlap(box, shotBox(b))) continue;
      b.dead = true;
      this.ev.push({ type: 'smash', x: b.x, y: b.y, what: b.rock ? 'rock' : 'shot' });
      pogo();
    }
    if (this.boss) hitBoss(this, box);
    for (const e of this.embers) {
      if (e.dead || e.state === 'warn' || a.hit.includes(e.id) || !overlap(box, emberBox(e))) continue;
      a.hit.push(e.id);
      const f = FOES[e.kind || 'ember'];
      if (--e.hp > 0) {                    // a brute: knocked back, cracked, still coming
        e.flash = 0.25; e.vx = 0; e.x += p.face * 6; e.hopCD = Math.max(e.hopCD, 0.8);
        this.ev.push({ type: 'crack', id: e.id, x: e.x, y: e.y - f.h / 2 });
        if (a.kind === 'down' && !p.ground) {
          p.vy = POGO_V; p.jumped = false; p.ground = false; p.coyote = 0; p.buffer = 0; p.pogos++;
          this.ev.push({ type: 'pogo', x: e.x, y: e.y, n: p.pogos });
        }
        continue;
      }
      e.dead = true; this.kills++;
      this.ev.push({ type: 'kill', id: e.id, kind: e.kind, pts: f.pts, x: e.x, y: e.y - f.h / 2, by: a.kind });
      if (a.kind === 'down' && !p.ground) {
        p.vy = POGO_V; p.jumped = false; p.ground = false; p.coyote = 0; p.buffer = 0; p.pogos++;
        this.ev.push({ type: 'pogo', x: e.x, y: e.y, n: p.pogos });
      }
    }
    if (p.ground) p.pogos = 0;
  }

  // ── Embers ─────────────────────────────────────────────────
  stepSpawns() {
    if (this.plan.rocks && (this.rockT -= DT) <= 0) { this.rockT = this.plan.rocks; this.dropRock(); }
    this.spawnT -= DT;
    if (this.spawnT > 0) return;
    this.spawnT = this.plan.every;
    const alive = this.embers.filter((e) => !e.dead).length;
    if (alive >= this.plan.max) return;
    const p = this.p, m = this.m, rng = this.rng;
    const kind = pickKind(this.plan.mix, rng.next());
    const y = Math.max(TILE * 2, p.y - SPAWN_UP);
    const r = Math.floor((y - 1) / TILE);
    // a random column; if it's rock up there, the nearest open one (inside the shaft walls)
    let c = rng.int(1, m.C - 2);
    for (let d = 0; d < m.C; d++) {
      const cc = c + (d % 2 ? -(d + 1) / 2 : d / 2);
      if (cc > 0 && cc < m.C - 1 && tileAt(m, cc, r) === AIR && tileAt(m, cc, r - 1) === AIR) { c = cc; break; }
      if (d === m.C - 1) return;
    }
    const e = { id: this.nextId++, kind, hp: FOES[kind].hp, state: 'warn', t: EMBER_WARN, x: c * TILE + TILE / 2, y, vx: 0, vy: 0, dir: rng.chance(0.5) ? 1 : -1, hopCD: 0.6, dead: false, age: 0, spitT: SPIT_EVERY * 0.6, flash: 0, side: rng.chance(0.5) ? 1 : -1 };
    this.embers.push(e);
    this.ev.push({ type: 'warn', id: e.id, x: e.x, y: e.y });
  }

  stepEmbers() {
    const p = this.p, m = this.m, pb = p.dead ? null : playerBox(p);
    for (const e of this.embers) {
      if (e.dead) continue;
      e.age += DT;
      const kind = e.kind || 'ember', f = FOES[kind];
      if (e.flash > 0) e.flash -= DT;
      if (e.state === 'warn') {
        if ((e.t -= DT) <= 0) { e.state = kind === 'bat' ? 'fly' : 'fall'; e.t = 1.6 + this.rng.next() * 0.8; e.vy = 60; this.ev.push({ type: 'drip', id: e.id, kind, x: e.x, y: e.y }); }
        continue;
      }
      if (e.hopCD > 0) e.hopCD -= DT;
      if (kind === 'bat') this.stepBat(e);
      else if (kind === 'spitter' && e.state === 'perch') this.stepSpitter(e);
      else if (e.state === 'fall' || e.state === 'hop') {
        e.vy = Math.min(EMBER_FALL, e.vy + EMBER_GRAV * DT);
        const r = moveBody(e, EMBER_HW, EMBER_H, m);
        if (r.wall && e.state === 'hop') e.vx = 0;
        if (r.ground) { e.state = kind === 'spitter' ? 'perch' : 'crawl'; e.vx = 0; this.ev.push({ type: 'plop', id: e.id, x: e.x, y: e.y }); }
      } else if (e.state === 'squat') {
        if ((e.t -= DT) <= 0) {
          e.state = 'hop'; e.vy = EMBER_HOP_V * (kind === 'brute' ? 1.15 : 1); e.vx = e.dir * EMBER_HOP_VX; e.hopCD = EMBER_HOP_CD * (kind === 'brute' ? 1.4 : 1);
          this.ev.push({ type: 'hop', id: e.id, x: e.x, y: e.y });
        }
      } else {                                     // crawl: at the Iceman if he's on its level, else to and fro
        const dx = p.x - e.x, dy = p.y - e.y, near = !p.dead && Math.abs(dy) < 40;
        if (near && Math.abs(dx) > 6) e.dir = Math.sign(dx);
        if (near && Math.abs(dx) < 120 && e.hopCD <= 0) { e.state = 'squat'; e.t = EMBER_SQUAT; this.ev.push({ type: 'squat', id: e.id }); continue; }
        // turn at a wall or a ledge's end
        const ax = e.x + e.dir * (EMBER_HW + 2);
        if (tileAtPx(m, ax, e.y - EMBER_H / 2) === ROCK || !isFloor(tileAtPx(m, ax, e.y + 1))) e.dir = -e.dir;
        else e.x += e.dir * this.crawl * (kind === 'brute' ? 0.7 : 1) * DT;
        // the floor went away (it can't, ledges don't move — but be safe): fall
        if (!isFloor(tileAtPx(m, e.x, e.y + 1))) { e.state = 'fall'; e.vy = 0; }
      }
      // lava eats embers; ones left far below stop mattering
      if (e.y - 4 > this.lava.y) { e.dead = true; this.ev.push({ type: 'sizzle', id: e.id, x: e.x, y: this.lava.y }); continue; }
      if (e.y > p.y + 760) { e.dead = true; continue; }
      // touching the Iceman melts him (not while he blinks after a hit)
      if (pb && p.inv <= 0 && overlap(inset(pb, 2), emberBox(e))) {
        this.damage(f.dmg, 'ember', p.x >= e.x ? 1 : -1);
        if (p.dead) return;
      }
    }
    if (this.embers.length > 24) this.embers = this.embers.filter((e) => !e.dead);
  }

  /** A cinder bat: drifts to a spot beside and above him, hovers a moment, then dives at where he was. */
  stepBat(e) {
    const p = this.p;
    if (e.state === 'fly') {
      const tx = Math.max(40, Math.min(this.m.w - 40, p.x + e.side * 90)), ty = p.y - 130 + Math.sin(e.age * 3) * 14;
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1, v = Math.min(BAT_SPEED, d * 3);
      e.x += (dx / d) * v * DT; e.y += (dy / d) * v * DT; e.dir = Math.sign(p.x - e.x) || 1;
      if ((e.t -= DT) <= 0 && !p.dead) { e.state = 'aim'; e.t = BAT_AIM; this.ev.push({ type: 'screech', id: e.id, x: e.x, y: e.y }); }
    } else if (e.state === 'aim') {
      if ((e.t -= DT) <= 0) {
        const dx = p.x - e.x, dy = p.y - bodyH(p.k) * 0.4 - e.y, d = Math.hypot(dx, dy) || 1;
        e.state = 'dive'; e.t = 0.95; e.vx = (dx / d) * BAT_DIVE; e.vy = (dy / d) * BAT_DIVE;
      }
    } else if (e.state === 'dive') {
      e.x += e.vx * DT; e.y += e.vy * DT;
      if ((e.t -= DT) <= 0 || e.x < 30 || e.x > this.m.w - 30) { e.state = 'fly'; e.t = 1.4 + this.rng.next() * 0.9; e.side = -e.side; e.x = Math.max(30, Math.min(this.m.w - 30, e.x)); }
    } else e.state = 'fly';
  }

  /** A spitter: sits still and every few seconds swells and lobs a fireball at him. */
  stepSpitter(e) {
    const p = this.p;
    e.dir = Math.sign(p.x - e.x) || e.dir;
    if (p.dead || Math.abs(p.y - e.y) > 420 || Math.abs(p.x - e.x) > 380) return;
    e.spitT -= DT;
    if (e.spitT > 0) return;
    if (e.spitT > -SPIT_AIM) { if (!e.aiming) { e.aiming = true; this.ev.push({ type: 'swell', id: e.id, x: e.x, y: e.y }); } return; }
    e.aiming = false; e.spitT = SPIT_EVERY;
    const sx = e.x, sy = e.y - 18, tx = p.x, ty = p.y - bodyH(p.k) * 0.5;
    const T = Math.max(0.6, Math.min(1.2, Math.hypot(tx - sx, ty - sy) / 320));
    this.shots.push({ x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T - 0.5 * SHOT_G * T, t: 0, dead: false });
    this.ev.push({ type: 'spit', id: e.id, x: sx, y: sy });
  }

  /** Rock rain: a shadow where it will land, then the rock. */
  dropRock(at = null) {
    const p = this.p, m = this.m, rng = this.rng;
    const y = Math.max(TILE * 2, p.y - SPAWN_UP);
    const x = Math.max(TILE * 1.5, Math.min(m.w - TILE * 1.5, at ?? p.x + rng.range(-110, 110)));
    if (tileAtPx(m, x, y) !== AIR) return;
    let r = Math.floor(y / TILE);
    while (r < m.R && !isFloor(tileAt(m, Math.floor(x / TILE), r))) r++;
    this.rocks.push({ rock: true, x, y, vy: 0, warn: ROCK_WARN, land: r * TILE, dead: false });
    this.ev.push({ type: 'rockwarn', x, y: r * TILE });
  }

  /** Fireballs and falling rocks. */
  stepShots() {
    const p = this.p, m = this.m, pb = p.dead ? null : playerBox(p);
    for (const b of this.shots) {
      if (b.dead) continue;
      b.t += DT; b.vy += SHOT_G * DT; b.x += b.vx * DT; b.y += b.vy * DT;
      if (b.t > 2.5 || b.y > this.lava.y || tileAtPx(m, b.x, b.y) === ROCK || (b.vy > 0 && tileAtPx(m, b.x, b.y) === LEDGE && (b.y % TILE) < 8)) {
        b.dead = true; this.ev.push({ type: 'fizzle', x: b.x, y: b.y }); continue;
      }
      if (pb && p.inv <= 0 && overlap(pb, shotBox(b))) { b.dead = true; this.damage(b.dmg || SHOT_DMG, 'shot', p.x >= b.x ? 1 : -1); if (p.dead) return; }
    }
    for (const b of this.rocks) {
      if (b.dead) continue;
      if (b.warn > 0) { b.warn -= DT; continue; }
      b.vy = Math.min(700, b.vy + 1400 * DT); b.y += b.vy * DT;
      if (b.y + ROCK_R >= b.land || b.y > this.lava.y) { b.dead = true; this.ev.push({ type: 'crash', x: b.x, y: Math.min(b.land, this.lava.y) }); continue; }
      if (pb && p.inv <= 0 && overlap(pb, shotBox(b))) { b.dead = true; this.damage(ROCK_DMG, 'rock', p.x >= b.x ? 1 : -1); if (p.dead) return; }
    }
    if (this.shots.length > 20) this.shots = this.shots.filter((b) => !b.dead);
    if (this.rocks.length > 12) this.rocks = this.rocks.filter((b) => !b.dead);
  }
}
/** A creature kind from the level's weights (u: a 0..1 draw from the level's dice). */
function pickKind(mix, u) {
  const total = Object.values(mix).reduce((a, w) => a + w, 0);
  let x = u * total;
  for (const [k, w] of Object.entries(mix)) { if ((x -= w) < 0 && w > 0) return k; }
  return 'ember';
}
const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];

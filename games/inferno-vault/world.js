// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — the rules (pure: no DOM, no canvas, no sound). Shared by game.js, the level
//  checker (check.mjs) and the test bots (test.mjs, bench.mjs), so they all move exactly as the
//  player does.
//
//  The Fire King keeps the Inferno Crystal in a vault deep inside the volcano. Each level is one
//  hand-drawn stack of vault floors (levels.js): the Iceman breaks in at the top and works his
//  way DOWN, floor by floor, to the vault door at the bottom.
//
//  The Iceman is Magma Escape's own (movement, jump, ice blade and melting are imported from
//  ../magma-escape/world.js), so he feels the same in every Zone 6 game. His size is his health:
//  Full → Drips → Cracks → Small; melted away, he loses a heart and the level starts again.
//
//  Heat is the enemy. Fire guards patrol the floors with a lantern; its beam melts him and, if
//  it finds him, the guard throws fireballs. Shadows (dark alcoves) hide him from the beams.
//  Slash a guard from BEHIND and it goes out (a takedown); from the front the blade bounces off.
//  Lava burns and throws him up. Frost shards freeze him back up; fire opals are the loot.
//
//  From level 6 (section 2) he can FREEZE (F / L, or the phone's FREEZE button), at the cost of a
//  little of his ice: a blast of cold in front of him (or above him, with ↑) turns a lava pool
//  into an ice bridge for a few seconds, a fire guard into an ice statue (one slash shatters it),
//  stops a flame jet, and puts out a heat lamp.
//
//  Tiles:   # rock    = stone ledge (one-way, jump up through it)    ~ lava    : shadow (an alcove)
//  Markers (air): S start   D the vault door   * frost shard   o fire opal
//                 G a fire guard facing right   g … facing left   | where a patrol turns back
//                 ^ a flame jet (a vent in the floor below)   L a heat lamp (hanging from the rock above)
//                 B / b a brute (facing right / left)   W / w a sentinel (stands and turns)
//                 v a cold vent (in the floor below)    k the ember key    X an iron gate or hatch
//  A guard walks its floor between walls, drops, lava, jets, gates and | marks, pausing at each end to turn.
//
//  The deep vault (section 3, levels 11–15): cold vents freeze him back up while he stands in
//  them; the ember key opens every iron gate and hatch (X) on its level, and the vault door stays
//  locked until he has it; a guard that sees him rings the ALARM (every guard on that floor turns
//  on him, and the vault heats up around him for a while); brutes are too hot for the blade
//  (freeze one first, then shatter it); sentinels stand still and turn round now and then.
//  Ice bridges live in the level's own copy of the tiles (sim.m.t), as rock that melts back to
//  lava; the map itself (sim.base) never changes, so the planner and the checker can share it.
// ─────────────────────────────────────────────────────────────
import {
  TILE, COLS, DT, AIR, ROCK, LEDGE, isFloor, moveBody, stepPlayer, makePlayer, playerBox, overlap, halfW, bodyH,
  slashBox, boxInRock, MAX_HP, STAGES, stageOf, sizeIdx, LAVA_DMG, CRYSTAL_HP, INV_T, KB_T, KB_VX, KB_VY, LAVA_HOP,
  SLASH_T, SLASH_CD, SLASH_ON, SLASH_BUF, EV_JUMP,
} from '../magma-escape/world.js';

export { TILE, COLS, DT, AIR, ROCK, LEDGE, isFloor, playerBox, overlap, halfW, bodyH, MAX_HP, STAGES, stageOf, sizeIdx, SLASH_T, stepPlayer, moveBody };
export const LAVA = 3, SHADOW = 4;

// ── Tunables ─────────────────────────────────────────────────
export const SHARD_HP = CRYSTAL_HP;           // a frost shard freezes back a quarter (one size)
export const GUARD_HW = 11, GUARD_H = 46;     // a fire guard's body (centre-x, feet-y)
export const guardSpeed = (level) => 40 + Math.min(level, 15) * 1.5;
export const TURN_T = 1.0;                    // the pause at each end of a patrol
export const BEAM = 156;                      // how far a lantern reaches (6.5 tiles)
export const BEAM_Y = 30;                     // the lantern hangs this high above the guard's feet
export const beamHalf = (d) => 16 + d * 0.22; // the beam widens as it goes (half its height at distance d)
export const BEAM_DPS = 7;                    // melt per second while a beam is on him
export const SPOT_T = 0.55;                   // "!" — then the first fireball
export const THROW_EVERY = 1.3;
export const SEARCH_T = 3.0;                  // a guard that lost sight of him looks this long, then patrols on
export const GUARD_DMG = 25;                  // walking into a guard
export const SHOT_G = 520, SHOT_R = 7, SHOT_DMG = 15, SHOT_LIFE = 3.2, MAX_SHOTS = 6;
export const OPAL_PTS = 40, SHARD_PTS = 25, TAKEDOWN_PTS = 150, SHOT_PTS = 20;

// The Freeze (section 2)
export const FREEZE_FROM = 6;                 // the first level where he can freeze
export const FREEZE_COST = 5;                 // the ice a freeze costs him (a size is 25)
export const FREEZE_CD = 0.55;
export const FREEZE_R = 96;                   // its reach in front of him
export const FREEZE_UP = 120;                 // its reach above him (↑ + FREEZE)
export const ICE_T = 4.5, ICE_WARN = 1.2;     // an ice bridge holds this long, cracking for the last ICE_WARN s
export const POOL_MAX = 8;                    // the most lava tiles one freeze turns to ice
export const STATUE_T = 5;                    // a frozen guard thaws after this long
// Flame jets: a vent in the floor that roars up every JET_P seconds (off, then a sputter, then fire)
export const JET_H = 3 * TILE, JET_HW = 10, JET_DMG = 20, JET_P = 3.0, JET_OFF = 1.6, JET_WARN = 0.45, JET_FROZEN_T = 6;
// The deep vault (section 3)
export const ALARM_FROM = 11, ALARM_T = 8, ALARM_DPS = 2.5;   // the alarm, from level 11: how long, and the heat
export const COLD_HPS = 14, VENT_H = 2 * TILE;                // a cold vent freezes him back up this fast, this high
export const SENTRY_T = 2.6;                                  // a sentinel turns round this often
export const BRUTE_HW = 14, BRUTE_H = 56, BRUTE_DMG = 30, BRUTE_SPEED = 0.75;
export const KEY_PTS = 100;
// Heat lamps: a brazier on a chain that swings, its light sweeping the floor below
export const LAMP_R = 160, LAMP_HALF = 0.2, LAMP_SWING = 0.6, LAMP_P = 5.0, LAMP_CHAIN = 16, LAMP_DPS = 9, LAMP_OUT_T = 6;

// ── The map ──────────────────────────────────────────────────
/** Parse a level's rows (top to bottom) into a tile map with its markers. */
export function parseMap(rows, name = '', opts = {}) {
  const R = rows.length, C = rows[0].length;
  if (C !== COLS) throw new Error(`${name}: rows must be ${COLS} wide (got ${C})`);
  const t = new Uint8Array(R * C), stops = new Set();
  const m = { name, R, C, w: C * TILE, h: R * TILE, t, spawn: null, exit: null, shards: [], opals: [], guards: [], jets: [], lamps: [], vents: [], gates: [], key: null, freeze: !!opts.freeze, heart: !!opts.heart };
  rows.forEach((row, r) => {
    if (row.length !== C) throw new Error(`${name}: row ${r} is ${row.length} wide`);
    for (let c = 0; c < C; c++) {
      const ch = row[c], cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2, feet = (r + 1) * TILE;
      if (ch === '#') t[r * C + c] = ROCK;
      else if (ch === '=') t[r * C + c] = LEDGE;
      else if (ch === '~') t[r * C + c] = LAVA;
      else if (ch === ':') t[r * C + c] = SHADOW;
      else if (ch === 'S') m.spawn = { x: cx, y: feet };
      else if (ch === 'D') m.exit = { x: cx, y: feet };
      else if (ch === '*') m.shards.push({ x: cx, y: cy });
      else if (ch === 'o') m.opals.push({ x: cx, y: cy });
      else if (ch === 'G' || ch === 'g') m.guards.push({ c, r, x: cx, y: feet, face: ch === 'G' ? 1 : -1, kind: 'guard' });
      else if (ch === 'B' || ch === 'b') m.guards.push({ c, r, x: cx, y: feet, face: ch === 'B' ? 1 : -1, kind: 'brute' });
      else if (ch === 'W' || ch === 'w') m.guards.push({ c, r, x: cx, y: feet, face: ch === 'W' ? 1 : -1, kind: 'sentinel' });
      else if (ch === 'v') m.vents.push({ c, r, x: cx, y: feet });
      else if (ch === 'k') { if (m.key) throw new Error(`${name}: one ember key per level`); m.key = { x: cx, y: cy }; }
      else if (ch === 'X') { t[r * C + c] = ROCK; m.gates.push(r * C + c); }
      else if (ch === '|') stops.add(r * C + c);
      else if (ch === '^') { m.jets.push({ c, r, x: cx, y: feet }); stops.add(r * C + c); }
      else if (ch === 'L') m.lamps.push({ c, r, x: cx, y: r * TILE });
      else if (ch !== '.') throw new Error(`${name}: unknown tile '${ch}' at row ${r}`);
    }
  });
  if (!m.spawn || !m.exit) throw new Error(`${name}: needs an S and a D`);
  // each guard's patrol: along its floor, up to a wall, a drop, lava or a | mark
  const gate = new Set(m.gates);
  const walkable = (c, r) => c > 0 && c < C - 1 && !stops.has(r * C + c) && !gate.has((r + 1) * C + c)
    && tileAt(m, c, r) !== ROCK && tileAt(m, c, r) !== LAVA && tileAt(m, c, r - 1) !== ROCK && isFloor(tileAt(m, c, r + 1));
  m.vents.forEach((v, i) => {
    if (!isFloor(tileAt(m, v.c, v.r + 1))) throw new Error(`${name}: the cold vent at col ${v.c}, row ${v.r} has no floor under it`);
    v.id = i + 1;
  });
  m.jets.forEach((j, i) => {
    if (!isFloor(tileAt(m, j.c, j.r + 1))) throw new Error(`${name}: the flame jet at col ${j.c}, row ${j.r} has no floor under it`);
    j.id = i + 1; j.phase = opts.jets?.[i] ?? (i * 1.1) % JET_P;
  });
  m.lamps.forEach((l, i) => {
    if (tileAt(m, l.c, l.r - 1) !== ROCK) throw new Error(`${name}: the heat lamp at col ${l.c}, row ${l.r} has no rock above to hang from`);
    l.id = i + 1; l.phase = opts.lamps?.[i] ?? i * 1.3;
  });
  for (const g of m.guards) {
    if (!walkable(g.c, g.r)) throw new Error(`${name}: the guard at col ${g.c}, row ${g.r} has no floor to stand on`);
    if (g.kind === 'sentinel') { g.x0 = g.x1 = g.x; continue; }   // a sentinel stands its ground
    let l = g.c; while (walkable(l - 1, g.r)) l--;
    let rt = g.c; while (walkable(rt + 1, g.r)) rt++;
    g.x0 = l * TILE + TILE / 2; g.x1 = rt * TILE + TILE / 2;
  }
  return m;
}

/** Outside the map counts as rock, so nothing can leave it. */
export const tileAt = (m, c, r) => (c < 0 || r < 0 || c >= m.C || r >= m.R ? ROCK : m.t[r * m.C + c]);
export const tileAtPx = (m, x, y) => tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE));

/** In an alcove's shadow: both his feet and his head are in shadow tiles. */
export function isHidden(m, p) {
  return tileAtPx(m, p.x, p.y - 8) === SHADOW && tileAtPx(m, p.x, p.y - bodyH(p.k) + 8) === SHADOW;
}
/** Standing in lava (his feet a little way into a lava tile). */
export function inLava(m, p) {
  const hw = halfW(p.k) - 2, r = Math.floor((p.y - 4) / TILE);
  for (const x of [p.x - hw, p.x, p.x + hw]) if (tileAt(m, Math.floor(x / TILE), r) === LAVA) return true;
  return false;
}
/** The vault door: his body reaches it. */
export const atExit = (p, m) => Math.abs(p.x - m.exit.x) < 22 && Math.abs(p.y - m.exit.y) < 6;

export const guardBox = (g) => { const hw = g.hw || GUARD_HW; return [g.x - hw, g.y - (g.h || GUARD_H), g.x + hw, g.y]; };
export const keyBox = (k) => [k.x - 11, k.y - 11, k.x + 11, k.y + 11];
export const ventBoxOf = (v) => [v.x - 12, v.y - VENT_H, v.x + 12, v.y];
/** A guard's body and ways, by kind. */
export const guardKind = (kind) => kind === 'brute' ? { hw: BRUTE_HW, h: BRUTE_H, dmg: BRUTE_DMG, speed: BRUTE_SPEED, turnT: TURN_T }
  : kind === 'sentinel' ? { hw: GUARD_HW, h: GUARD_H, dmg: GUARD_DMG, speed: 0, turnT: SENTRY_T }
  : { hw: GUARD_HW, h: GUARD_H, dmg: GUARD_DMG, speed: 1, turnT: TURN_T };
export const shotBox = (b) => [b.x - SHOT_R, b.y - SHOT_R, b.x + SHOT_R, b.y + SHOT_R];

/** How far a guard's lantern reaches right now: BEAM, or less where rock stands in the way. */
export function beamReach(m, g) {
  const lx = g.x + g.face * 12, ly = g.y - BEAM_Y;
  for (let d = 0; d <= BEAM; d += 6) if (tileAtPx(m, lx + g.face * d, ly) === ROCK) return Math.max(0, d - 4);
  return BEAM;
}
/** The point (x, y) is lit by the guard's lantern (inside the cone, with no rock in between). */
export function inBeam(m, g, x, y, reach = beamReach(m, g)) {
  const lx = g.x + g.face * 12, ly = g.y - BEAM_Y, d = (x - lx) * g.face;
  if (d < -4 || d > reach || Math.abs(y - ly) > beamHalf(Math.max(0, d))) return false;
  for (let i = 1; i < 6; i++) {                           // a wall or floor between them blocks the light
    const k = i / 6;
    if (tileAtPx(m, lx + (x - lx) * k, ly + (y - ly) * k) === ROCK) return false;
  }
  return true;
}
/** The guard can see him: he is in the beam and not hiding in shadow. */
export function sees(m, g, p, reach) {
  if (g.state === 'down' || g.state === 'frozen' || p.dead || isHidden(m, p)) return false;
  const h = bodyH(p.k);
  return inBeam(m, g, p.x, p.y - h * 0.5, reach) || inBeam(m, g, p.x, p.y - h + 6, reach) || inBeam(m, g, p.x, p.y - 6, reach);
}
export const guardActive = (g) => g.state !== 'down' && g.state !== 'frozen';

// ── Section 2: jets, lamps and the freeze ───────────────────
/** Where a flame jet is in its cycle at time t: 'off' | 'warn' | 'on' (or 'frozen'). */
export function jetState(j, t) {
  if (j.frozen > 0) return 'frozen';
  const u = (((t + j.phase) % JET_P) + JET_P) % JET_P;
  return u < JET_OFF ? 'off' : u < JET_OFF + JET_WARN ? 'warn' : 'on';
}
/** The fire of a jet (when on), and its vent (where a freeze stops it). */
export const jetBox = (j) => [j.x - JET_HW, j.y - JET_H, j.x + JET_HW, j.y];
export const ventBox = (j) => [j.x - 12, j.y - 20, j.x + 12, j.y + 2];

/** A heat lamp's swing at time t: its angle from straight down, and where its light comes from. */
export function lampAt(l, t) {
  const a = LAMP_SWING * Math.sin(((t + l.phase) / LAMP_P) * Math.PI * 2);
  return { a, hx: l.x + Math.sin(a) * LAMP_CHAIN, hy: l.y + Math.cos(a) * LAMP_CHAIN };
}
export const lampBox = (l) => [l.x - 16, l.y, l.x + 16, l.y + LAMP_CHAIN + 14];
/** The point (x, y) is in the lamp's light (inside the cone, no rock in between). */
export function inLamp(m, l, t, x, y) {
  if (l.out > 0) return false;
  const { a, hx, hy } = lampAt(l, t), dx = x - hx, dy = y - hy;
  if (dy <= 0 || dx * dx + dy * dy > LAMP_R * LAMP_R) return false;
  if (Math.abs(Math.atan2(dx, dy) - a) > LAMP_HALF) return false;
  for (let i = 1; i < 6; i++) { const k = i / 6; if (tileAtPx(m, hx + dx * k, hy + dy * k) === ROCK) return false; }
  return true;
}
export function litByLamp(m, l, t, p) {
  if (p.dead || isHidden(m, p)) return false;
  const h = bodyH(p.k);
  return inLamp(m, l, t, p.x, p.y - h * 0.5) || inLamp(m, l, t, p.x, p.y - h + 6) || inLamp(m, l, t, p.x, p.y - 6);
}

/** The cold of a freeze: a box in front of him (from his head down into the floor), or above him. */
export function freezeBox(p, dir, up) {
  const hw = halfW(p.k), h = bodyH(p.k);
  if (up) return [p.x - 34, p.y - h - FREEZE_UP, p.x + 34, p.y - h + 10];
  const x0 = p.x + dir * (hw - 2), x1 = p.x + dir * (hw + FREEZE_R);
  return [Math.min(x0, x1), p.y - h - 16, Math.max(x0, x1), p.y + TILE - 2];
}
/** The lava tiles a freeze in `box` turns to ice: every pool it touches, along its row (up to POOL_MAX each),
 *  but never a tile his own body is in. t: the tiles to read (the level's live copy). */
export function lavaToFreeze(m, t, box, p) {
  const C = m.C, out = new Set(), pb = playerBox(p);
  const c0 = Math.max(0, Math.floor(box[0] / TILE)), c1 = Math.min(C - 1, Math.floor(box[2] / TILE));
  const r0 = Math.max(0, Math.floor(box[1] / TILE)), r1 = Math.min(m.R - 1, Math.floor(box[3] / TILE));
  const lava = (c, r) => c >= 0 && c < C && t[r * C + c] === LAVA;
  const clear = (c, r) => !overlap(pb, [c * TILE + 1, r * TILE + 1, (c + 1) * TILE - 1, (r + 1) * TILE - 1]);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!lava(c, r) || out.has(r * C + c)) continue;
    // the whole pool along this row, outward from where the cold hit it
    const pool = [c];
    for (let d = 1; pool.length < POOL_MAX; d++) {
      const l = lava(c - d, r) && !out.has(r * C + c - d), rt = lava(c + d, r) && !out.has(r * C + c + d);
      if (!l && !rt) break;
      if (rt) pool.push(c + d);
      if (l && pool.length < POOL_MAX) pool.push(c - d);
    }
    for (const q of pool) if (clear(q, r)) out.add(r * C + q);
  }
  return [...out];
}

// ── One level ────────────────────────────────────────────────
export class VaultSim {
  constructor(m, level) {
    this.base = m; this.level = level;
    this.gv = guardSpeed(level);
    this.canFreeze = level >= FREEZE_FROM;
    this.reset();
  }

  /** The start of the level, and every retry after a lost heart. */
  reset() {
    const m = this.m = { ...this.base, t: this.base.t.slice() };   // the level's own tiles: ice bridges live here
    this.p = makePlayer(m);
    this.p.hidden = false; this.p.frzCD = 0;
    this.ice = [];
    this.jets = m.jets.map((j) => ({ ...j, frozen: 0, was: 'off' }));
    this.lamps = m.lamps.map((l) => ({ ...l, out: 0 }));
    this.freezes = 0; this.statues = 0;
    this.guards = m.guards.map((g, i) => ({ id: i + 1, kind: g.kind || 'guard', ...guardKind(g.kind), x: g.x, y: g.y, face: g.face, x0: g.x0, x1: g.x1, state: 'patrol', t: 0, throwT: 0, lost: 0, reach: BEAM, saw: false }));
    this.keyGot = !m.key; this.alarmT = 0; this.alarms = 0; this.chillT = 0; this.lockedT = 0;
    this.shots = []; this.nextShot = 1;
    this.shards = m.shards.map((c) => ({ x: c.x, y: c.y, got: false }));
    this.opals = m.opals.map((c) => ({ x: c.x, y: c.y, got: false }));
    this.done = false; this.t = 0; this.seen = false; this.takedowns = 0; this.heatT = 0;
    this.ev = [];
  }

  /** One 1/120 s step. inp = { dir, jumpPress, jumpHeld, up, down, slashPress, freezePress }. Returns this step's events. */
  step(inp) {
    const ev = this.ev = [];
    const p = this.p, m = this.m;
    this.t += DT;
    this.stepIce();
    if (p.dead || this.done) { this.stepGuards(); this.stepShots(); this.stepJets(); this.stepLamps(); return ev; }
    if (p.inv > 0) p.inv -= DT;
    if (p.atkCD > 0) p.atkCD -= DT;
    if (p.frzCD > 0) p.frzCD -= DT;
    if (inp.freezePress) this.freeze(inp);
    if (p.dead) return ev;

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
    p.hidden = isHidden(m, p);

    if (p.atk) {
      p.atk.t += DT;
      if (p.atk.t >= SLASH_ON[0] && p.atk.t <= SLASH_ON[1]) this.bladeHits();
      if (p.atk && p.atk.t >= SLASH_T) p.atk = null;
    }
    if (p.grow) this.tryGrow();

    // lava: a burn, and up he goes
    if (inLava(m, p)) {
      if (p.inv <= 0) this.damage(LAVA_DMG, 'lava', 0);
      else if (p.vy >= 0) { p.vy = LAVA_HOP * 0.8; p.ground = false; p.jumped = false; }
      if (p.dead) return ev;
    }

    this.stepGuards();
    if (p.dead) return ev;
    this.stepShots();
    if (p.dead) return ev;
    this.stepJets();
    if (p.dead) return ev;
    this.stepLamps();
    if (p.dead) return ev;

    // frost shards and fire opals
    const pb = playerBox(p);
    for (const c of this.shards) {
      if (c.got || !overlap(pb, [c.x - 11, c.y - 11, c.x + 11, c.y + 11])) continue;
      c.got = true;
      this.heal(SHARD_HP);
      ev.push({ type: 'shard', x: c.x, y: c.y, hp: p.hp });
    }
    for (const o of this.opals) {
      if (o.got || !overlap(pb, [o.x - 10, o.y - 10, o.x + 10, o.y + 10])) continue;
      o.got = true;
      ev.push({ type: 'opal', x: o.x, y: o.y, all: this.opals.every((q) => q.got) });
    }

    // the ember key: every gate and hatch on the level opens, and so does the vault door
    if (!this.keyGot && overlap(pb, keyBox(m.key))) {
      this.keyGot = true;
      for (const i of m.gates) m.t[i] = AIR;
      ev.push({ type: 'key', x: m.key.x, y: m.key.y, gates: m.gates.length });
    }
    // cold vents freeze him back up
    this.stepVents();
    // the alarm: the vault heats up around him while it rings
    if (this.alarmT > 0) {
      this.alarmT -= DT;
      if (!p.hidden && !p.dead) this.meltBy(ALARM_DPS * DT);
      if (this.alarmT <= 0) ev.push({ type: 'alarmOff' });
      if (p.dead) return ev;
    }
    // the vault door: the way out (locked until he has the key)
    if (this.lockedT > 0) this.lockedT -= DT;
    if (atExit(p, m) && p.ground) {
      if (this.keyGot) { this.done = true; p.atk = null; ev.push({ type: 'exit', x: p.x, y: p.y, hp: p.hp, ghost: !this.seen }); }
      else if (this.lockedT <= 0) { this.lockedT = 2; ev.push({ type: 'locked', x: m.exit.x, y: m.exit.y }); }
    }
    return ev;
  }

  stepVents() {
    const p = this.p;
    if (p.dead || !this.m.vents.length) return;
    const pb = playerBox(p);
    for (const v of this.m.vents) {
      if (!overlap(pb, ventBoxOf(v))) continue;
      if (p.hp < MAX_HP) {
        this.heal(COLD_HPS * DT);
        if ((this.chillT -= DT) <= 0) { this.chillT = 0.25; this.ev.push({ type: 'chill', x: v.x, y: v.y, hp: p.hp }); }
      }
      break;
    }
  }

  // ── Fire guards ────────────────────────────────────────────
  stepGuards() {
    const p = this.p, m = this.m;
    let lit = false;
    for (const g of this.guards) {
      if (g.state === 'down') { g.t += DT; continue; }
      if (g.state === 'frozen') {                       // an ice statue: no light, no flame, until it thaws
        if ((g.t -= DT) <= 0) { g.state = 'patrol'; g.saw = false; g.lost = 0; this.ev.push({ type: 'thawGuard', id: g.id, x: g.x, y: g.y - g.h / 2 }); }
        continue;
      }
      g.reach = beamReach(m, g);
      const see = !this.done && sees(m, g, p, g.reach);
      if (see) lit = true;
      const toward = Math.sign(p.x - g.x) || g.face;
      switch (g.state) {
        case 'patrol': {
          g.x += g.face * this.gv * g.speed * DT;
          if (g.face > 0 && g.x >= g.x1) { g.x = g.x1; g.state = 'turn'; g.t = g.turnT; }
          else if (g.face < 0 && g.x <= g.x0) { g.x = g.x0; g.state = 'turn'; g.t = g.turnT; }
          if (see) this.spot(g);
          break;
        }
        case 'turn': {
          if (see) { this.spot(g); break; }
          if ((g.t -= DT) <= 0) { g.face = -g.face; g.state = 'patrol'; }
          break;
        }
        case 'alert': {                                 // "!" — it has seen him; the first fireball follows
          g.face = toward;
          if ((g.t -= DT) <= 0) { this.throwAt(g); g.state = 'hunt'; g.throwT = THROW_EVERY; g.lost = 0; }
          break;
        }
        case 'hunt': {                                  // stands its ground, throwing while it can see him
          if (see) { g.lost = 0; g.face = toward; if ((g.throwT -= DT) <= 0) { this.throwAt(g); g.throwT = THROW_EVERY; } }
          else if ((g.lost += DT) >= SEARCH_T) { g.state = 'patrol'; g.saw = false; }
          break;
        }
      }
      // walking into a guard burns (not while he hides in an alcove behind its path)
      if (!p.dead && p.inv <= 0 && !p.hidden && overlap(playerBox(p), guardBox(g))) {
        this.damage(g.dmg, 'hurt', toward);
        if (g.state === 'patrol' || g.state === 'turn') this.spot(g);
        if (p.dead) return;
      }
    }
    // the lantern light: a steady melt while a beam is on him
    if (lit && !p.dead) {
      this.meltBy(BEAM_DPS * DT);
      if ((this.heatT -= DT) <= 0) { this.heatT = 0.22; this.ev.push({ type: 'heat', x: p.x, y: p.y - bodyH(p.k) * 0.6 }); }
    }
  }

  spot(g) {
    if (g.state === 'alert' || g.state === 'hunt') return;
    g.state = 'alert'; g.t = SPOT_T; g.saw = true;
    g.face = Math.sign(this.p.x - g.x) || g.face;
    this.seen = true;
    this.ev.push({ type: 'spotted', id: g.id, x: g.x, y: g.y - g.h - 10 });
    // the deep vault: it rings the alarm, and every guard on its floor turns on him
    if (this.level >= ALARM_FROM && this.alarmT <= 0) {
      this.alarmT = ALARM_T; this.alarms++;
      this.ev.push({ type: 'alarm', id: g.id, x: g.x, y: g.y - g.h });
      for (const q of this.guards) {
        if (q === g || !guardActive(q) || Math.abs(q.y - g.y) > 4 || q.state === 'alert' || q.state === 'hunt') continue;
        q.state = 'alert'; q.t = SPOT_T + 0.35; q.saw = true; q.face = Math.sign(this.p.x - q.x) || q.face;
      }
    }
  }

  throwAt(g) {
    const p = this.p;
    if (p.dead || this.shots.filter((b) => !b.dead).length >= MAX_SHOTS) return;
    const x = g.x + g.face * 12, y = g.y - BEAM_Y, tx = p.x, ty = p.y - bodyH(p.k) * 0.55;
    const T = Math.max(0.35, Math.min(0.9, Math.hypot(tx - x, ty - y) / 320));
    this.shots.push({ id: this.nextShot++, x, y, vx: (tx - x) / T, vy: (ty - y) / T - 0.5 * SHOT_G * T, t: 0, dead: false, r: SHOT_R });
    this.ev.push({ type: 'throw', id: g.id, x, y });
  }

  stepShots() {
    const p = this.p, m = this.m;
    for (const b of this.shots) {
      if (b.dead) continue;
      b.t += DT; b.vy += SHOT_G * DT; b.x += b.vx * DT; b.y += b.vy * DT;
      const k = tileAtPx(m, b.x, b.y);
      if (k === ROCK || b.t > SHOT_LIFE || b.y > m.h) { b.dead = true; this.ev.push({ type: 'splash', x: b.x, y: b.y }); continue; }
      if (!p.dead && p.inv <= 0 && overlap(playerBox(p), shotBox(b))) {
        b.dead = true;
        this.damage(SHOT_DMG, 'hurt', Math.sign(b.vx) || 1);
        if (p.dead) return;
      }
    }
    if (this.shots.length > 24) this.shots = this.shots.filter((b) => !b.dead);
  }

  // ── The blade ──────────────────────────────────────────────
  bladeHits() {
    const p = this.p, a = p.atk, box = slashBox(p);
    for (const b of this.shots) {
      if (b.dead || !overlap(box, shotBox(b))) continue;
      b.dead = true;
      this.ev.push({ type: 'smash', x: b.x, y: b.y, pts: SHOT_PTS });
    }
    for (const g of this.guards) {
      if (g.state === 'down' || a.hit.includes(g.id) || !overlap(box, guardBox(g))) continue;
      a.hit.push(g.id);
      if (g.state === 'frozen') {                       // an ice statue shatters, from any side
        g.state = 'down'; g.t = 0; this.takedowns++;
        this.ev.push({ type: 'shatter', id: g.id, kind: g.kind, x: g.x, y: g.y - g.h / 2, pts: g.kind === 'brute' ? TAKEDOWN_PTS * 2 : TAKEDOWN_PTS });
        continue;
      }
      const behind = Math.sign(p.x - g.x) === -g.face;
      if (behind && g.kind !== 'brute' && (g.state === 'patrol' || g.state === 'turn')) {
        g.state = 'down'; g.t = 0; this.takedowns++;
        this.ev.push({ type: 'takedown', id: g.id, x: g.x, y: g.y - g.h / 2, pts: TAKEDOWN_PTS });
      } else {
        // the blade glances off its flame: he is pushed back, and it knows he is there
        p.vx = -Math.sign(g.x - p.x || p.face) * KB_VX * 0.8; p.kbT = KB_T * 0.6;
        this.ev.push({ type: 'parry', id: g.id, kind: g.kind, x: g.x - g.face * 6, y: g.y - g.h * 0.6 });
        this.spot(g);
      }
    }
  }

  // ── The Freeze (section 2) ─────────────────────────────────
  /** FREEZE pressed: a blast of cold in front of him (with ↑ and no ←/→: above him). It costs a little ice. */
  freeze(inp) {
    const p = this.p, m = this.m;
    if (!this.canFreeze || p.frzCD > 0) return;
    if (p.hp <= FREEZE_COST) { p.frzCD = 0.3; this.ev.push({ type: 'cold', x: p.x, y: p.y - bodyH(p.k) }); return; }
    const up = !!inp.up && !inp.dir, dir = inp.dir || p.face;
    if (!up && !p.atk) p.face = dir;
    p.frzCD = FREEZE_CD; this.freezes++;
    const box = freezeBox(p, dir, up);
    this.ev.push({ type: 'freeze', x: p.x, y: p.y - bodyH(p.k) * 0.6, dir, up, box });
    // lava pools → ice bridges (and an ice bridge it touches holds again for the full time)
    const tiles = lavaToFreeze(m, m.t, box, p);
    for (const i of tiles) { m.t[i] = ROCK; this.ice.push({ i, t: ICE_T, warned: false }); }
    for (const e of this.ice) {
      const c = e.i % m.C, r = Math.floor(e.i / m.C);
      if (overlap(box, [c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE])) { e.t = ICE_T; e.warned = false; }
    }
    if (tiles.length) this.ev.push({ type: 'ice', tiles });
    // fire guards → ice statues
    for (const g of this.guards) {
      if (!guardActive(g) || !overlap(box, guardBox(g))) continue;
      g.state = 'frozen'; g.t = STATUE_T; this.statues++;
      this.ev.push({ type: 'statue', id: g.id, kind: g.kind, x: g.x, y: g.y - g.h / 2 });
    }
    // flame jets stop; heat lamps go out; fireballs fizzle
    for (const j of this.jets) if (overlap(box, ventBox(j)) || (jetState(j, this.t) === 'on' && overlap(box, jetBox(j)))) {
      j.frozen = JET_FROZEN_T; this.ev.push({ type: 'jetFrozen', id: j.id, x: j.x, y: j.y });
    }
    for (const l of this.lamps) if (l.out <= 0 && overlap(box, lampBox(l))) { l.out = LAMP_OUT_T; this.ev.push({ type: 'lampOut', id: l.id, x: l.x, y: l.y + 20 }); }
    for (const b of this.shots) if (!b.dead && overlap(box, shotBox(b))) { b.dead = true; this.ev.push({ type: 'fizz', x: b.x, y: b.y }); }
    this.meltBy(FREEZE_COST);
  }

  /** Ice bridges crack, then melt back into lava (under his feet, if he is still on one). */
  stepIce() {
    if (!this.ice.length) return;
    const m = this.m;
    for (const e of this.ice) {
      e.t -= DT;
      if (!e.warned && e.t <= ICE_WARN) { e.warned = true; this.ev.push({ type: 'crack', i: e.i }); }
      if (e.t <= 0) { m.t[e.i] = LAVA; this.ev.push({ type: 'thaw', i: e.i, x: (e.i % m.C) * TILE + TILE / 2, y: Math.floor(e.i / m.C) * TILE }); }
    }
    this.ice = this.ice.filter((e) => e.t > 0);
  }

  stepJets() {
    const p = this.p;
    for (const j of this.jets) {
      if (j.frozen > 0) j.frozen = Math.max(0, j.frozen - DT);
      const st = jetState(j, this.t);
      if (st !== j.was) { if (st === 'on') this.ev.push({ type: 'jet', id: j.id, x: j.x, y: j.y }); j.was = st; }
      if (st === 'on' && !p.dead && p.inv <= 0 && overlap(playerBox(p), jetBox(j))) {
        this.damage(JET_DMG, 'hurt', Math.sign(p.x - j.x) || -p.face);
        if (p.dead) return;
      }
    }
  }

  stepLamps() {
    const p = this.p, m = this.m;
    let lit = false;
    for (const l of this.lamps) {
      if (l.out > 0) { l.out = Math.max(0, l.out - DT); if (l.out === 0) this.ev.push({ type: 'lampOn', id: l.id, x: l.x, y: l.y + 20 }); continue; }
      if (!lit && !this.done && litByLamp(m, l, this.t, p)) lit = true;
    }
    if (lit && !p.dead) {
      this.meltBy(LAMP_DPS * DT);
      if ((this.heatT -= DT) <= 0) { this.heatT = 0.22; this.ev.push({ type: 'heat', x: p.x, y: p.y - bodyH(p.k) * 0.6, lamp: true }); }
    }
  }

  // ── Melting ────────────────────────────────────────────────
  /** Melt him by n with a knock: kind 'lava' throws him up; anything else knocks him away (kb = -1 | 1). */
  damage(n, kind, kb) {
    const p = this.p;
    p.inv = INV_T; p.atk = null;
    if (kind === 'lava') { p.vy = LAVA_HOP; p.vx *= 0.5; p.kbT = 0.12; }
    else { p.vx = kb * KB_VX; p.vy = KB_VY; p.kbT = KB_T; }
    p.ground = false; p.jumped = false; p.coyote = 0;
    this.ev.push({ type: kind === 'lava' ? 'burn' : 'hurt', x: p.x, y: p.y - bodyH(p.k) / 2, hp: Math.max(0, p.hp - n) });
    this.meltBy(n);
  }

  /** Melt him by n, with no knock (the lantern's steady heat). */
  meltBy(n) {
    const p = this.p, before = sizeIdx(p);
    p.hp = Math.max(0, p.hp - n);
    if (p.hp <= 0) { p.dead = true; p.vx = 0; p.grow = false; p.atk = null; this.ev.push({ type: 'melt', x: p.x, y: p.y }); return; }
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
}

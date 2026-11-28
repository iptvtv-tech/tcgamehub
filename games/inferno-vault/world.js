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
//  Tiles:   # rock    = stone ledge (one-way, jump up through it)    ~ lava    : shadow (an alcove)
//  Markers (air): S start   D the vault door   * frost shard   o fire opal
//                 G a fire guard facing right   g … facing left   | where a patrol turns back
//  A guard walks its floor between walls, drops, lava and | marks, pausing at each end to turn.
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

// ── The map ──────────────────────────────────────────────────
/** Parse a level's rows (top to bottom) into a tile map with its markers. */
export function parseMap(rows, name = '') {
  const R = rows.length, C = rows[0].length;
  if (C !== COLS) throw new Error(`${name}: rows must be ${COLS} wide (got ${C})`);
  const t = new Uint8Array(R * C), stops = new Set();
  const m = { name, R, C, w: C * TILE, h: R * TILE, t, spawn: null, exit: null, shards: [], opals: [], guards: [] };
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
      else if (ch === 'G' || ch === 'g') m.guards.push({ c, r, x: cx, y: feet, face: ch === 'G' ? 1 : -1 });
      else if (ch === '|') stops.add(r * C + c);
      else if (ch !== '.') throw new Error(`${name}: unknown tile '${ch}' at row ${r}`);
    }
  });
  if (!m.spawn || !m.exit) throw new Error(`${name}: needs an S and a D`);
  // each guard's patrol: along its floor, up to a wall, a drop, lava or a | mark
  const walkable = (c, r) => c > 0 && c < C - 1 && !stops.has(r * C + c)
    && tileAt(m, c, r) !== ROCK && tileAt(m, c, r) !== LAVA && tileAt(m, c, r - 1) !== ROCK && isFloor(tileAt(m, c, r + 1));
  for (const g of m.guards) {
    if (!walkable(g.c, g.r)) throw new Error(`${name}: the guard at col ${g.c}, row ${g.r} has no floor to stand on`);
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

export const guardBox = (g) => [g.x - GUARD_HW, g.y - GUARD_H, g.x + GUARD_HW, g.y];
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
  if (g.state === 'down' || p.dead || isHidden(m, p)) return false;
  const h = bodyH(p.k);
  return inBeam(m, g, p.x, p.y - h * 0.5, reach) || inBeam(m, g, p.x, p.y - h + 6, reach) || inBeam(m, g, p.x, p.y - 6, reach);
}
export const guardActive = (g) => g.state !== 'down';

// ── One level ────────────────────────────────────────────────
export class VaultSim {
  constructor(m, level) {
    this.m = m; this.level = level;
    this.gv = guardSpeed(level);
    this.reset();
  }

  /** The start of the level, and every retry after a lost heart. */
  reset() {
    const m = this.m;
    this.p = makePlayer(m);
    this.p.hidden = false;
    this.guards = m.guards.map((g, i) => ({ id: i + 1, x: g.x, y: g.y, face: g.face, x0: g.x0, x1: g.x1, state: 'patrol', t: 0, throwT: 0, lost: 0, reach: BEAM, saw: false }));
    this.shots = []; this.nextShot = 1;
    this.shards = m.shards.map((c) => ({ x: c.x, y: c.y, got: false }));
    this.opals = m.opals.map((c) => ({ x: c.x, y: c.y, got: false }));
    this.done = false; this.t = 0; this.seen = false; this.takedowns = 0; this.heatT = 0;
    this.ev = [];
  }

  /** One 1/120 s step. inp = { dir, jumpPress, jumpHeld, up, down, slashPress }. Returns this step's events. */
  step(inp) {
    const ev = this.ev = [];
    const p = this.p, m = this.m;
    this.t += DT;
    if (p.dead || this.done) { this.stepGuards(); this.stepShots(); return ev; }
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

    // the vault door: the way out
    if (atExit(p, m) && p.ground) { this.done = true; p.atk = null; ev.push({ type: 'exit', x: p.x, y: p.y, hp: p.hp, ghost: !this.seen }); }
    return ev;
  }

  // ── Fire guards ────────────────────────────────────────────
  stepGuards() {
    const p = this.p, m = this.m;
    let lit = false;
    for (const g of this.guards) {
      if (g.state === 'down') { g.t += DT; continue; }
      g.reach = beamReach(m, g);
      const see = !this.done && sees(m, g, p, g.reach);
      if (see) lit = true;
      const toward = Math.sign(p.x - g.x) || g.face;
      switch (g.state) {
        case 'patrol': {
          g.x += g.face * this.gv * DT;
          if (g.face > 0 && g.x >= g.x1) { g.x = g.x1; g.state = 'turn'; g.t = TURN_T; }
          else if (g.face < 0 && g.x <= g.x0) { g.x = g.x0; g.state = 'turn'; g.t = TURN_T; }
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
        this.damage(GUARD_DMG, 'hurt', toward);
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
    this.ev.push({ type: 'spotted', id: g.id, x: g.x, y: g.y - GUARD_H - 10 });
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
      const behind = Math.sign(p.x - g.x) === -g.face;
      if (behind && (g.state === 'patrol' || g.state === 'turn')) {
        g.state = 'down'; g.t = 0; this.takedowns++;
        this.ev.push({ type: 'takedown', id: g.id, x: g.x, y: g.y - GUARD_H / 2, pts: TAKEDOWN_PTS });
      } else {
        // the blade glances off its flame: he is pushed back, and it knows he is there
        p.vx = -Math.sign(g.x - p.x || p.face) * KB_VX * 0.8; p.kbT = KB_T * 0.6;
        this.ev.push({ type: 'parry', id: g.id, x: g.x - g.face * 6, y: g.y - GUARD_H * 0.6 });
        this.spot(g);
      }
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

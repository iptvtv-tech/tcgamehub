// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — the rules (pure: no DOM, no canvas, no sound). Shared by game.js and
//  check.mjs, so the checker flies exactly the movement the player does.
//
//  A planet is one hand-drawn tile map. PlanetSim runs it at a fixed 120 Hz step: the
//  astronaut, his energy blade and blaster, suit armour, spikes, star dust, the exit beacon
//  and the aliens. step(input) returns a list of events (hit, kill, hurt…) that game.js turns
//  into sound, particles and points.
//
//  Everything random — which alien sits in each slot, elites, hop timing, drops — comes from
//  one stream per planet, seeded from the run seed and the planet number. So in the Daily
//  Challenge every player meets the same aliens on the same planet, whatever came before.
//
//  Upgrades (Section 3). Abilities come from capsules, always in the same order: double jump,
//  dash, wall-cling. Each planet's capsule holds the next one you don't have yet (with all
//  three it holds a star-dust cache). Rest beacons are mid-planet checkpoints: lighting one
//  repairs the suit, a lost life restarts there, and its shop sells armour plates and blade
//  and blaster tiers for star dust. Standing still and holding ↓ turns 3 energy into a plate.
//  Everything resets when a run ends.
//
//  The levels (Section 4): planets 1–4, 7–9, 12–14… are explore planets (the six hand-drawn maps in
//  turn); every 5th is a guardian's lair (guardians.js); the one after each guardian is a treasure
//  vault, the engine's 20-second bonus round.
//
//  Tiles:   # rock   = one-way ledge (land on it from above)   ^ floor spikes   v ceiling spikes
//           x cracked rock: solid until the blade (or blaster) breaks it open
//           D a lair's gate: open until you step into the arena, then shut until the guardian falls
//  Markers (air underneath):  S spawn   E exit beacon   * star dust   A ability capsule   B rest beacon
//           c ground alien slot   f flying alien slot   t acid pod slot (rooted on the rock beside it)
//           G where the guardian waits   T a treasure chest (vaults)
// ─────────────────────────────────────────────────────────────
import { makeRng } from '../../assets/js/rng.js';
import { MAPS } from './planets.js';
import { GUARDIANS, GUARDIAN_ORDER, makeGuardian, resetGuardian, wakeGuardian, stepGuardian, guardianParts, damageGuardian, stepBossShots, shotBox } from './guardians.js';

export const TILE = 24;
export const DT = 1 / 120;
export const AIR = 0, ROCK = 1, LEDGE = 2, SPIKE_UP = 3, SPIKE_DOWN = 4;
export const isSpike = (k) => k === SPIKE_UP || k === SPIKE_DOWN;
export const isFloor = (k) => k === ROCK || k === LEDGE;

// The astronaut: a box (centre-x, feet-y) and the movement feel
export const PW = 14, PH = 30;
export const RUN = 175, ACCEL_G = 1900, ACCEL_A = 1250, FRICTION = 2300;
export const GRAV = 1500, FALL_MUL = 1.45, MAX_FALL = 640;
export const JUMP_V = -520, JUMP_CUT = 0.45;
export const COYOTE = 0.09, BUFFER = 0.11;
// Abilities: the jetpack's second burst, the dash, and the wall-cling (slide, then kick off)
export const DJ_V = -470;
export const DASH_V = 440, DASH_T = 0.18, DASH_CD = 0.42, DASH_BUF = 0.1;
export const WALL_SLIDE = 62, WJ_VY = -480, WJ_VX = 245, WJ_CLIMB = 140, WJ_LOCK = 0.1, WALL_COY = 0.08;

// Combat
export const SLASH_T = 0.17, SLASH_CD = 0.3, SLASH_ON = [0.012, 0.11];   // swing length, cooldown, frames that hit
export const POGO_V = -440;                                               // bounce off a down-slash hit
export const SHOT_CD = 0.24, BOLT_V = 560, BOLT_LIFE = 0.6;
export const INV_T = 1.1, HAZARD_T = 0.6, KB_T = 0.2;
export const EXIT_RISE = 1.25;                    // a lair's exit rises out of the floor when its guardian falls; it works once it's up
export const FOCUS_COST = 3, FOCUS_DELAY = 0.2, FOCUS_T = 0.85;           // the energy heal: hold ↓, standing still
export const CRACK_HP = 2;

// ── Abilities, upgrades and the shop ─────────────────────────
/** The capsules hand these out in this order. */
export const ABILITIES = ['double', 'dash', 'cling'];
export const ABILITY_INFO = {
  double: { name: 'Double Jump', how: 'Press jump again in mid-air for a second thruster burst.' },
  dash:   { name: 'Dash', how: 'Press L, Shift or V (or DASH) for a quick burst. Once more in mid-air.' },
  cling:  { name: 'Wall Cling', how: 'Push into a wall in mid-air to grab it, then jump to kick off.' },
};
export const NO_AB = Object.freeze({ double: false, dash: false, cling: false });
/** The abilities you have after collecting the first n capsules. */
export const abilSet = (n) => ({ double: n >= 1, dash: n >= 2, cling: n >= 3 });

/** A fresh run: no abilities, no upgrades, an empty star-dust wallet. */
export const newRun = () => ({ abil: 0, wallet: 0, plate: 0, blade: 0, blaster: 0, dust: 0 });
/** What a run's upgrades add up to. */
export function loadoutFor(run) {
  return {
    pips: 3 + run.plate, energy: 6 + run.blaster, abil: run.abil,
    blade: [1, 1.5, 2][run.blade], reach: [0, 4, 7][run.blade],
    blaster: [1, 1.5, 2][run.blaster], pierce: run.blaster >= 2,
  };
}
/** What the explorer starts each run with. */
export const LOADOUT = loadoutFor(newRun());
/** The rest beacon's shop: two tiers of each, prices in star dust. */
export const SHOP = [
  { id: 'plate', name: 'Armour Plate', costs: [15, 30], lines: ['4 armour plates', '5 armour plates'] },
  { id: 'blade', name: 'Energy Blade', costs: [20, 40], lines: ['1.5× damage, longer reach', '2× damage, longest reach'] },
  { id: 'blaster', name: 'Blaster', costs: [15, 30], lines: ['1.5× damage, 7 energy cells', '2× damage, piercing bolts, 8 cells'] },
];

// ── Planets ──────────────────────────────────────────────────
// The maps are designed in planets.js. Each explore planet keeps its own colours (game.js THEMES):
// sky, rock, crystals — and the astronaut's mirrored visor reflects them.
const map = (name) => MAPS[name] || MAPS['Landing Site'];
export const PLANETS = [
  { name: 'Landing Site', theme: 'dust', rows: map('Landing Site') },
  { name: 'Frost Moon', theme: 'ice', rows: map('Frost Moon') },
  { name: 'Ember Rock', theme: 'ember', rows: map('Ember Rock') },
  { name: 'Spore Jungle', theme: 'jungle', rows: map('Spore Jungle') },
  { name: 'Dune World', theme: 'desert', rows: map('Dune World') },
  { name: 'Nebula Reach', theme: 'nebula', rows: map('Nebula Reach') },
];
/** The guardians' lairs (every 5th planet) and the treasure vault (the planet after each guardian). */
export const LAIRS = {
  matriarch: { name: 'Brood Hollow', theme: 'dust', kind: 'arena', boss: 'matriarch', rows: MAPS['Brood Hollow'] },
  jelly: { name: 'Squall Hollow', theme: 'ice', kind: 'arena', boss: 'jelly', rows: MAPS['Squall Hollow'] },
  wyrm: { name: 'Magma Hollow', theme: 'ember', kind: 'arena', boss: 'wyrm', rows: MAPS['Magma Hollow'] },
};
export const VAULT = { name: 'Treasure Vault', theme: 'vault', kind: 'vault', rows: MAPS['Treasure Vault'] };
/** The engine's bonus rounds: the vaults (6, 11, 16…). */
export const BONUS_LEVELS = Array.from({ length: 400 }, (_, i) => 6 + i * 5);

/**
 * What a level is: planets 1–4 explore, 5 a guardian, 6 a treasure vault, 7–9 explore, 10 a guardian…
 * Explore planets take the six maps in turn; guardians take the three in turn (tier = laps round them).
 */
export function stageFor(level) {
  if (level % 5 === 0) {
    const n = level / 5 - 1, boss = GUARDIAN_ORDER[n % GUARDIAN_ORDER.length];
    return { kind: 'arena', boss, tier: Math.floor(n / GUARDIAN_ORDER.length), def: LAIRS[boss], name: GUARDIANS[boss].name };
  }
  if (level > 5 && level % 5 === 1) return { kind: 'vault', def: VAULT, name: VAULT.name };
  const k = (level - 1) - Math.floor((level - 1) / 5) - Math.max(0, Math.floor((level - 2) / 5));
  const def = PLANETS[k % PLANETS.length];
  return { kind: 'explore', def, name: def.name };
}
export const planetFor = (level) => stageFor(level).def;

/**
 * Parse a planet into a tile grid plus its markers. Throws on ragged rows or a missing spawn/exit.
 * opts.openCracks: treat cracked rock as already broken (the checker's view once you've slashed it).
 */
export function parsePlanet(p, opts = {}) {
  const rows = p.rows, R = rows.length, C = rows[0].length;
  const t = new Uint8Array(R * C), dust = [], slots = [], crackAt = [], gates = [], chests = [];
  let spawn = null, exit = null, capsule = null, beacon = null, guard = null;
  for (let r = 0; r < R; r++) {
    if (rows[r].length !== C) throw new Error(`planet "${p.name}": row ${r} is ${rows[r].length} wide, expected ${C}`);
    for (let c = 0; c < C; c++) {
      const ch = rows[r][c];
      t[r * C + c] = ch === '#' ? ROCK : ch === '=' ? LEDGE : ch === '^' ? SPIKE_UP : ch === 'v' ? SPIKE_DOWN : ch === 'x' && !opts.openCracks ? ROCK : AIR;
      if (ch === '*') dust.push({ c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      else if (ch === 'S') spawn = { x: c * TILE + TILE / 2, y: (r + 1) * TILE };
      else if (ch === 'E') exit = { c, r, x: c * TILE + TILE / 2, y: (r + 1) * TILE };
      else if (ch === 'A') capsule = { c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
      else if (ch === 'B') beacon = { c, r, x: c * TILE + TILE / 2, y: (r + 1) * TILE };
      else if (ch === 'x') crackAt.push([c, r]);
      else if (ch === 'D') gates.push([c, r]);
      else if (ch === 'G') guard = { c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
      else if (ch === 'T') chests.push({ c, r, x: c * TILE + TILE / 2, y: (r + 1) * TILE });
      else if (ch === 'c' || ch === 'f' || ch === 't') slots.push({ type: { c: 'ground', f: 'air', t: 'pod' }[ch], c, r });
    }
  }
  if (!spawn || (!exit && p.kind !== 'vault')) throw new Error(`planet "${p.name}" needs an S and an E`);
  if (p.kind === 'arena' && (!guard || !gates.length)) throw new Error(`lair "${p.name}" needs a G and a gate (D)`);
  // cracked rock: touching tiles form one wall that breaks open together
  const cracks = [], seen = new Set();
  for (const [c0, r0] of crackAt) {
    if (seen.has(c0 + ',' + r0)) continue;
    const tiles = [], stack = [[c0, r0]];
    seen.add(c0 + ',' + r0);
    while (stack.length) {
      const [c, r] = stack.pop(); tiles.push([c, r]);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (c + dc) + ',' + (r + dr);
        if (!seen.has(k) && rows[r + dr]?.[c + dc] === 'x') { seen.add(k); stack.push([c + dc, r + dr]); }
      }
    }
    cracks.push({ id: cracks.length, tiles, hp: CRACK_HP, open: !!opts.openCracks });
  }
  const m = { name: p.name, theme: p.theme, kind: p.kind || 'explore', C, R, w: C * TILE, h: R * TILE, t, dust, slots, spawn, exit, capsule, beacon, cracks, gates, chests, guard };
  if (guard) {                                    // the arena: the room round the G, its left wall being the gate
    let fr = guard.r; while (fr < R - 1 && t[(fr + 1) * C + guard.c] !== ROCK) fr++;
    let cr = guard.r; while (cr > 0 && t[(cr - 1) * C + guard.c] !== ROCK) cr--;
    const row = fr, gateCols = new Set(gates.map(([c]) => c));
    let c0 = guard.c; while (c0 > 0 && t[row * C + c0 - 1] !== ROCK && !gateCols.has(c0 - 1)) c0--;
    let c1 = guard.c; while (c1 < C - 1 && t[row * C + c1 + 1] !== ROCK) c1++;
    m.arena = { x0: c0 * TILE, x1: (c1 + 1) * TILE, floorY: (fr + 1) * TILE, ceilY: cr * TILE, gx: guard.x, gy: guard.y };
    if (p.boss === 'matriarch') m.arena.gy = m.arena.floorY;
  }
  return m;
}

/** Outside the map counts as rock, so nothing can leave it. */
export const tileAt = (m, c, r) => (c < 0 || r < 0 || c >= m.C || r >= m.R ? ROCK : m.t[r * m.C + c]);
export const tileAtPx = (m, x, y) => tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE));
const hit4 = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];
const circleBox = (x, y, r, b) => x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3];
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));

/**
 * Move a box (o.x centre, o.y bottom) by its velocity, axis by axis, against rock.
 * oneWay: land on = ledges when falling onto them from above. Zeroes the blocked velocity.
 * Returns { wall, ground, ceil } — one shared object, so read it straight away.
 */
const RES = { wall: 0, ground: false, ceil: false };          // reused: read it before the next moveBody call
export function moveBody(o, hw, h, m, dt, oneWay = true) {
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
      if (k === ROCK || (oneWay && k === LEDGE && prevY <= r * TILE + 0.5)) { o.y = r * TILE; o.vy = 0; res.ground = true; break; }
    }
  } else {
    const r = Math.floor((o.y - h) / TILE);
    for (let c = c0; c <= c1; c++) if (tileAt(m, c, r) === ROCK) { o.y = (r + 1) * TILE + h + 0.001; o.vy = 0; res.ceil = true; break; }
  }
  return res;
}

// ── The astronaut ────────────────────────────────────────────
export function makePlayer(m, lo = LOADOUT, at = m.spawn) {
  return {
    x: at.x, y: at.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, jumpHeld: false, jumped: false, air: 0, kbT: 0,
    airJumps: 1, airDash: true, dashT: 0, dashDir: 1, dashCD: 0, dashBuf: 0, cling: 0, wallSide: 0, wallCoy: 0, wjT: 0,
    pips: lo.pips, energy: lo.energy, inv: 0, atk: null, atkCD: 0, shotCD: 0, slashBuf: 0, shotBuf: 0, shoot: null, hazard: 0, dead: false,
    focus: 0, focusHold: 0, safe: { x: at.x, y: at.y }, pogos: 0, hits: 0,
  };
}

/** Rock right beside the astronaut's body on that side (what the wall-cling grabs). */
export function wallAt(p, m, side) {
  const c = Math.floor((p.x + side * (PW / 2 + 1)) / TILE);
  return tileAt(m, c, Math.floor((p.y - PH + 5) / TILE)) === ROCK && tileAt(m, c, Math.floor((p.y - 5) / TILE)) === ROCK;
}

// stepPlayer's return value: what started this tick
export const EV_JUMP = 1, EV_DJUMP = 2, EV_WALLJUMP = 4, EV_DASH = 8, EV_CLING = 16;

/**
 * One 1/120 s movement step. inp = { dir: -1|0|1, jumpPress (edge), jumpHeld, dashPress (edge) };
 * ab = the abilities you have (abilSet). Returns EV_* flags for what started this tick.
 * check.mjs searches with exactly this function.
 */
export function stepPlayer(p, inp, m, ab = NO_AB) {
  const dt = DT;
  let ev = 0;
  const ctrl = !(p.kbT > 0);                 // knocked back: no steering for a moment
  if (p.kbT > 0) p.kbT -= dt;
  if (p.dashCD > 0) p.dashCD -= dt;
  if (p.wjT > 0) p.wjT -= dt;
  if (p.wallCoy > 0) p.wallCoy -= dt;
  p.buffer = inp.jumpPress ? BUFFER : Math.max(0, p.buffer - dt);
  p.dashBuf = inp.dashPress ? DASH_BUF : Math.max(0, p.dashBuf - dt);
  p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);

  // dash: a short, straight, weightless burst (once more in the air after leaving the ground)
  if (ab.dash && ctrl && p.dashBuf > 0 && p.dashT <= 0 && p.dashCD <= 0 && (p.ground || p.airDash)) {
    const d = p.cling ? -p.cling : inp.dir || p.face;
    p.dashT = DASH_T; p.dashDir = d; p.face = d; p.dashCD = DASH_CD; p.dashBuf = 0;
    if (!p.ground) p.airDash = false;
    p.cling = 0; p.wjT = 0; p.jumped = false;
    ev |= EV_DASH;
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDir * DASH_V; p.vy = 0;
    const r = moveBody(p, PW / 2, PH, m, dt, true);
    p.ground = r.ground;
    if (r.wall) p.dashT = 0;
    if (p.dashT <= 0) { p.dashT = 0; p.vx = r.wall ? 0 : p.dashDir * RUN; }    // out of it at running speed
    if (p.ground) { p.airJumps = 1; p.airDash = true; }
    p.jumpHeld = !!inp.jumpHeld;
    p.air = p.ground ? 0 : p.air + dt;
    return ev;
  }

  // steering (a wall jump's kick holds it off for a moment)
  const lock = p.wjT > 0, dir = ctrl && !lock ? inp.dir : 0;
  if (dir) { if (!p.atk) p.face = dir; p.vx = approach(p.vx, dir * RUN, (p.ground ? ACCEL_G : ACCEL_A) * dt); }
  else if (ctrl && !lock) p.vx = approach(p.vx, 0, (p.ground ? FRICTION : FRICTION * 0.25) * dt);

  // jumps: from the ground (buffered press + coyote time), off a wall, or the second burst
  if (ctrl && p.buffer > 0) {
    if (p.coyote > 0) { p.vy = JUMP_V; p.coyote = 0; p.ground = false; ev |= EV_JUMP; }
    else if (ab.cling && (p.cling || p.wallCoy > 0)) {
      const side = p.cling || p.wallSide, climb = inp.dir === side;       // holding into the wall: a climbing hop
      p.vy = WJ_VY; p.vx = -side * (climb ? WJ_CLIMB : WJ_VX); p.wjT = WJ_LOCK; p.face = -side;
      p.cling = 0; p.wallCoy = 0; ev |= EV_WALLJUMP;
    } else if (ab.double && p.airJumps > 0) { p.vy = DJ_V; p.airJumps = 0; ev |= EV_DJUMP; }
    if (ev) { p.buffer = 0; p.jumped = true; }
  }
  // let go early for a shorter jump
  if (!inp.jumpHeld && p.jumpHeld && p.vy < 0 && p.jumped) { p.vy *= JUMP_CUT; p.jumped = false; }
  p.jumpHeld = !!inp.jumpHeld;

  // gravity, heavier on the way down so jumps feel snappy; clinging to a wall, a slow slide
  if (p.cling) p.vy = Math.min(WALL_SLIDE, p.vy + GRAV * dt);
  else p.vy = Math.min(MAX_FALL, p.vy + GRAV * (p.vy > 0 ? FALL_MUL : 1) * dt);
  const r = moveBody(p, PW / 2, PH, m, dt, true);
  p.ground = r.ground;
  if (p.ground) { p.jumped = false; p.cling = 0; p.wallCoy = 0; p.airJumps = 1; p.airDash = true; }
  else if (ab.cling) {
    if (p.cling) {                            // let go: push away, or the wall ends
      if (inp.dir === -p.cling || !wallAt(p, m, p.cling)) { p.wallSide = p.cling; p.wallCoy = WALL_COY; p.cling = 0; }
      else { p.airJumps = 1; p.airDash = true; p.face = -p.cling; }
    } else if (ctrl && inp.dir && p.vy >= 0 && !lock && wallAt(p, m, inp.dir)) {   // grab: falling while pushing into rock
      p.cling = inp.dir; p.face = -inp.dir; p.airJumps = 1; p.airDash = true; p.jumped = false;
      ev |= EV_CLING;
    }
  }
  p.air = p.ground ? 0 : p.air + dt;
  return ev;
}

/** Does this box touch the sharp part of any spike tile? */
export function boxHitsSpikes(m, x0, y0, x1, y1) {
  const c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE), r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = tileAt(m, c, r);
    if (k === SPIKE_UP) { if (x0 < (c + 1) * TILE - 3 && x1 > c * TILE + 3 && y0 < (r + 1) * TILE && y1 > r * TILE + TILE * 0.4) return true; }
    else if (k === SPIKE_DOWN) { if (x0 < (c + 1) * TILE - 3 && x1 > c * TILE + 3 && y0 < r * TILE + TILE * 0.6 && y1 > r * TILE) return true; }
  }
  return false;
}
export const touchesSpikes = (p, m) => boxHitsSpikes(m, p.x - PW / 2 + 1.5, p.y - PH + 2, p.x + PW / 2 - 1.5, p.y - 0.5);

/** The astronaut's box overlaps the exit beacon. */
export const atExit = (p, m) => Math.abs(p.x - m.exit.x) < TILE * 0.7 && p.y > m.exit.y - TILE * 2 && p.y - PH < m.exit.y;
/** …the rest beacon (to light it), the ability capsule (to take it). */
export const touchesBeacon = (p, m) => !!m.beacon && Math.abs(p.x - m.beacon.x) < 16 && p.y > m.beacon.y - TILE * 2.5 && p.y - PH < m.beacon.y;
export const touchesCapsule = (p, m) => !!m.capsule && Math.abs(p.x - m.capsule.x) < PW / 2 + 9 && m.capsule.y > p.y - PH - 10 && m.capsule.y < p.y + 10;

/** Star dust the astronaut is touching (indices into m.dust). */
export function dustTouched(p, m, taken) {
  const out = [];
  for (let i = 0; i < m.dust.length; i++) {
    if (taken[i]) continue;
    const d = m.dust[i];
    if (Math.abs(p.x - d.x) < PW / 2 + 9 && d.y > p.y - PH - 9 && d.y < p.y + 9) out.push(i);
  }
  return out;
}

/** Where the energy blade hits: [x0, y0, x1, y1] for a side, up or down slash (reach: blade tier). */
export function slashBox(p, kind, face, reach = 0) {
  if (kind === 'up') return [p.x - 16 - reach / 2, p.y - PH - 22 - reach, p.x + 16 + reach / 2, p.y - PH + 6];
  if (kind === 'down') return [p.x - 15 - reach / 2, p.y - 8, p.x + 15 + reach / 2, p.y + 26 + reach];
  return face > 0 ? [p.x + 2, p.y - PH - 3, p.x + 31 + reach, p.y + 1] : [p.x - 31 - reach, p.y - PH - 3, p.x - 2, p.y + 1];
}

/** Clear view between two points (no rock in the way). */
export function lineOfSight(m, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) { const k = i / n; if (tileAtPx(m, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) === ROCK) return false; }
  return true;
}

// ── Aliens ───────────────────────────────────────────────────
export const FOES = {
  crawler: { name: 'Dust Mite', hp: 2, w: 20, h: 12, speed: 36, pts: 50 },
  hopper:  { name: 'Spore Toad', hp: 3, w: 18, h: 16, pts: 70 },
  wisp:    { name: 'Void Wisp', hp: 2, w: 16, h: 16, speed: 72, pts: 60 },
  pod:     { name: 'Acid Pod', hp: 3, w: 18, h: 18, pts: 80, every: 2.6 },
};

/** Feet height of the first floor at or below a marker. */
function floorBelow(m, c, r) {
  for (let rr = r; rr < m.R - 1; rr++) if (isFloor(tileAt(m, c, rr + 1))) return (rr + 1) * TILE;
  return (r + 1) * TILE;
}

/** Root an acid pod on the rock next to its marker (floor first, then ceiling, then walls). */
function mountPod(m, f, c, r) {
  const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2, L = 18;
  if (tileAt(m, c, r + 1) === ROCK) { f.mount = 'floor'; f.anchor = [cx, (r + 1) * TILE]; f.box = [cx - 8, (r + 1) * TILE - L, cx + 8, (r + 1) * TILE]; f.muzzle = [cx, (r + 1) * TILE - 15]; }
  else if (tileAt(m, c, r - 1) === ROCK) { f.mount = 'ceil'; f.anchor = [cx, r * TILE]; f.box = [cx - 8, r * TILE, cx + 8, r * TILE + L]; f.muzzle = [cx, r * TILE + 15]; }
  else if (tileAt(m, c - 1, r) === ROCK) { f.mount = 'left'; f.anchor = [c * TILE, cy]; f.box = [c * TILE, cy - 8, c * TILE + L, cy + 8]; f.muzzle = [c * TILE + 15, cy]; }
  else { f.mount = 'right'; f.anchor = [(c + 1) * TILE, cy]; f.box = [(c + 1) * TILE - L, cy - 8, (c + 1) * TILE, cy + 8]; f.muzzle = [(c + 1) * TILE - 15, cy]; }
  f.x = (f.box[0] + f.box[2]) / 2; f.y = f.box[3];
}

/**
 * Fill the planet's slots from the seeded stream. Every slot draws the same five numbers
 * whatever it becomes, so one slot's choice never shifts another's.
 */
export function spawnFoes(m, level, rng) {
  const out = [];
  const sp = Math.min(1.55, Math.pow(1.04, level - 1));             // pace grows 4% a planet
  const active = Math.min(1, 0.72 + 0.07 * (level - 1));            // share of slots filled
  m.slots.forEach((s, i) => {
    const on = rng.next() < active, kindRoll = rng.next(), eliteRoll = rng.next(), dir = rng.next() < 0.5 ? -1 : 1, phase = rng.next();
    if (!on) return;
    let kind;
    if (s.type === 'ground') kind = level >= 2 && kindRoll < Math.min(0.5, 0.22 + 0.04 * level) ? 'hopper' : 'crawler';
    else if (s.type === 'air') kind = 'wisp';
    else { if (level < 2) return; kind = 'pod'; }                    // planet 1 has no pods yet
    const d = FOES[kind], elite = level >= 3 && eliteRoll < Math.min(0.45, 0.05 * level);
    const hp = d.hp + (elite ? (level >= 8 ? 2 : 1) : 0) + (level >= 10 ? 1 : 0);
    const f = { id: i + 1, kind, x: s.c * TILE + TILE / 2, y: 0, vx: 0, vy: 0, dir, hp, max: hp, elite, sp, phase, t: 0,
      hurtT: 0, kbT: 0, kbv: 0, ground: false, moving: false, dead: false, tele: 0, teleMax: 0.5, cool: 0, hop: 0, crouch: 0, aggro: false };
    if (kind === 'crawler' || kind === 'hopper') f.y = floorBelow(m, s.c, s.r);
    else if (kind === 'wisp') f.y = s.r * TILE + TILE / 2 + d.h / 2;
    else mountPod(m, f, s.c, s.r);
    f.home = { x: f.x, y: f.y, dir };
    resetFoe(f);
    out.push(f);
  });
  return out;
}

function resetFoe(f) {
  f.x = f.home.x; f.y = f.home.y; f.dir = f.home.dir; f.vx = 0; f.vy = 0; f.hp = f.max;
  f.hurtT = 0; f.kbT = 0; f.kbv = 0; f.tele = 0; f.aggro = false; f.crouch = 0;
  f.cool = 1.0 + f.phase * 1.5; f.hop = 0.6 + f.phase; f.t = f.phase * 3;
}

/** The box an alien hurts (and is hurt) with. */
export function foeBox(f) {
  if (f.kind === 'pod') return f.box;
  const d = FOES[f.kind];
  return [f.x - d.w / 2, f.y - d.h, f.x + d.w / 2, f.y];
}

/** One alien's 1/120 s step (exported for check.mjs). */
export function stepFoe(sim, f) {
  const m = sim.m, p = sim.p, d = FOES[f.kind], rng = sim.rng;
  f.t += DT;
  if (f.hurtT > 0) f.hurtT -= DT;
  const hunt = !p.dead && p.hazard <= 0;
  if (f.kind === 'crawler') {
    if (f.kbT > 0) { f.kbT -= DT; f.vx = f.kbv; } else f.vx = f.dir * d.speed * f.sp;
    f.vy = Math.min(MAX_FALL, f.vy + GRAV * DT);
    const r = moveBody(f, d.w / 2, d.h, m, DT, true);
    f.ground = r.ground; f.moving = Math.abs(f.vx) > 1;
    if (f.kbT <= 0) {
      if (r.wall) f.dir = -r.wall;
      else if (f.ground) {                        // turn round at ledges and in front of spikes
        const c = Math.floor((f.x + f.dir * (d.w / 2 + 1)) / TILE);
        if (!isFloor(tileAt(m, c, Math.floor((f.y + 1) / TILE))) || isSpike(tileAt(m, c, Math.floor((f.y - 1) / TILE)))) f.dir = -f.dir;
      }
    }
  } else if (f.kind === 'hopper') {
    if (f.kbT > 0) { f.kbT -= DT; f.vx = f.kbv; }
    if (f.ground && f.kbT <= 0) {
      f.vx = 0;
      const dx = p.x - f.x, near = hunt && Math.abs(dx) < 220 && Math.abs(p.y - f.y) < 150;
      if (near) f.dir = dx < 0 ? -1 : 1;
      f.hop -= DT;
      f.crouch = f.hop < 0.35 ? 1 - Math.max(0, f.hop) / 0.35 : 0;   // squats before it springs
      if (f.hop <= 0) {
        if (near) { f.vy = -390 * Math.sqrt(f.sp); f.vx = f.dir * 125 * f.sp; } else { f.vy = -170; f.vx = 0; }
        f.ground = false; f.crouch = 0;
        f.hop = rng.range(1.0, 1.7) / f.sp;
        sim.ev.push({ type: 'hop', x: f.x, y: f.y, near });
      }
    }
    f.vy = Math.min(MAX_FALL, f.vy + GRAV * DT);
    const r = moveBody(f, d.w / 2, d.h, m, DT, true);
    f.ground = r.ground;
  } else if (f.kind === 'wisp') {
    const cy = f.y - d.h / 2, dx = p.x - f.x, dy = (p.y - PH / 2) - cy, dist = Math.hypot(dx, dy) || 1;
    if (f.kbT > 0) { f.kbT -= DT; f.vx *= 0.97; f.vy *= 0.97; }
    else {
      if (hunt && (dist < 165 || (f.aggro && dist < 300))) {
        f.aggro = true;
        f.vx += (dx / dist) * 300 * f.sp * DT; f.vy += (dy / dist) * 300 * f.sp * DT;
        f.dir = dx < 0 ? -1 : 1;
      } else {                                      // drift back and hover round its home
        f.aggro = false;
        const hx = f.home.x + Math.sin(f.t * 0.8 + f.phase * 6) * 18, hy = f.home.y + Math.sin(f.t * 1.6 + f.phase * 3) * 9;
        f.vx += (hx - f.x) * 2.2 * DT; f.vy += (hy - f.y) * 2.2 * DT;
        f.vx *= 0.985; f.vy *= 0.985;
        if (Math.abs(f.vx) > 4) f.dir = f.vx < 0 ? -1 : 1;
      }
      const v = Math.hypot(f.vx, f.vy), max = (f.aggro ? d.speed : 40) * f.sp;
      if (v > max) { f.vx *= max / v; f.vy *= max / v; }
    }
    f.vy += Math.sin(f.t * 5 + f.phase * 9) * 14 * DT;
    moveBody(f, d.w / 2, d.h, m, DT, false);
  } else {                                          // acid pod: aim, swell, spit
    const [mx, my] = f.muzzle, px = p.x, py = p.y - PH / 2;
    if (f.tele > 0) {
      f.tele -= DT;
      if (f.tele <= 0) {
        const dx = px - mx, dy = py - my, dist = Math.hypot(dx, dy) || 1, v = 150 * Math.sqrt(f.sp);
        sim.globs.push({ x: mx, y: my, vx: (dx / dist) * v, vy: (dy / dist) * v, t: 0, dead: false });
        sim.ev.push({ type: 'spit', x: mx, y: my });
        f.cool = (d.every / f.sp) * rng.range(0.85, 1.15);
      }
    } else if ((f.cool -= DT) <= 0) {
      if (hunt && Math.hypot(px - mx, py - my) < 270 && lineOfSight(m, mx, my, px, py)) { f.tele = f.teleMax; sim.ev.push({ type: 'charge', x: mx, y: my }); }
      else f.cool = 0.3;
    }
  }
  if (f.y > m.h + 40) f.dead = true;                 // fell out of the world (closed maps never allow it)
}

// ── One planet in play ───────────────────────────────────────
export class PlanetSim {
  /** def: a PLANETS entry; seed: this planet's seed; lo: the run's loadout (loadoutFor). */
  constructor(def, level, seed, lo = LOADOUT, opts = {}) {
    this.level = level; this.lo = { ...LOADOUT, ...lo };
    this.ab = abilSet(this.lo.abil);
    this.m = parsePlanet(def, opts);
    this.kind = this.m.kind;
    this.rng = makeRng(seed >>> 0);
    this.foes = spawnFoes(this.m, level, this.rng);
    this.p = makePlayer(this.m, this.lo);
    this.taken = new Array(this.m.dust.length).fill(false);
    this.bolts = []; this.globs = []; this.drops = []; this.bossShots = [];
    this.dustGot = 0; this.kills = 0; this.hits = 0; this.t = 0; this.stop = 0; this.done = false;
    this.beaconLit = false; this.capTaken = false;
    /** What this planet's capsule holds: the next ability you don't have yet, or a star-dust cache. */
    this.capKind = this.lo.abil < ABILITIES.length ? ABILITIES[this.lo.abil] : 'cache';
    this.exitOpen = this.kind === 'explore'; this.exitWait = 0;
    if (this.kind === 'arena') {                    // a guardian's lair: its own seeded stream, so its patterns never depend on your drops
      this.brng = makeRng((seed ^ 0x5bd1e995) >>> 0);
      this.boss = makeGuardian(def.boss, this.m, Math.floor((Math.max(1, level / 5) - 1) / GUARDIAN_ORDER.length));
      this.fight = 'wait';
    }
    this.chests = this.m.chests.map((c, i) => ({ ...c, id: i, hp: 3, open: false, hurtT: 0 }));
    this.cleared = false;
    this.pend = { jump: false, slash: false, shoot: false, dash: false };
    this.ev = [];
  }

  /** A Dust Mite the Matriarch calls down from the ceiling. */
  addMinion(kind, x, y, dir) {
    const d = FOES[kind], hp = d.hp + (this.level >= 10 ? 1 : 0), id = 1000 + (this.minionN = (this.minionN || 0) + 1);
    const f = { id, kind, x, y, vx: 0, vy: 0, dir, hp, max: hp, elite: false, sp: Math.min(1.55, Math.pow(1.04, this.level - 1)), phase: 0.5, t: 0,
      hurtT: 0, kbT: 0, kbv: 0, ground: false, moving: false, dead: false, tele: 0, teleMax: 0.5, cool: 0, hop: 0.8, crouch: 0, aggro: false, minion: true };
    f.home = { x, y, dir };
    this.foes.push(f);
  }
  setGates(closed) { for (const [c, r] of this.m.gates) this.m.t[r * this.m.C + c] = closed ? ROCK : AIR; }

  /** After a lost life: back to the lit rest beacon (or the landing spot) with a fresh suit. Beaten aliens stay beaten. */
  respawn() {
    this.p = makePlayer(this.m, this.lo, this.beaconLit ? this.m.beacon : this.m.spawn);
    this.p.inv = 1.0;                               // a moment's grace after "Get ready!"
    this.bolts = []; this.globs = []; this.bossShots = []; this.drops = this.drops.filter((d) => d.kind === 'dust');
    this.foes = this.foes.filter((f) => !f.minion);
    for (const f of this.foes) if (!f.dead) resetFoe(f);
    // the guardian heals and waits for you again — unless it was already going down: then it finishes dying
    if (this.boss && this.fight === 'on' && this.boss.state !== 'dying') { resetGuardian(this.boss); this.fight = 'wait'; this.setGates(false); }
    this.stop = 0; this.pend = { jump: false, slash: false, shoot: false, dash: false };
  }

  /** The shop sold an upgrade: apply the new loadout (and fill what grew). */
  setLoadout(lo) {
    const p = this.p, old = this.lo;
    this.lo = { ...this.lo, ...lo, abil: this.lo.abil };
    if (this.lo.pips > old.pips) p.pips = this.lo.pips;
    if (this.lo.energy > old.energy) p.energy = this.lo.energy;
  }
  /** Rest at a beacon: every plate and energy cell back. */
  rest() { this.p.pips = this.lo.pips; this.p.energy = this.lo.energy; this.p.focus = 0; }
  /** Standing in the light of the lit rest beacon (↓ opens its shop there). */
  atBeacon() {
    const b = this.m.beacon, p = this.p;
    return !!b && this.beaconLit && p.ground && !p.dead && p.hazard <= 0 && Math.abs(p.x - b.x) < 22 && Math.abs(p.y - b.y) < 2;
  }

  /**
   * Advance 1/120 s. inp = { dir, aim (-1 up, 0, 1 down), jumpPress, jumpHeld, slashPress, shootPress, dashPress }.
   * Returns this tick's events.
   */
  step(inp) {
    const ev = this.ev = [];
    if (this.done || this.p.dead) return ev;
    if (this.stop > 0) {                            // hit-stop: the world freezes for a few frames; presses wait
      this.stop -= DT;
      if (inp.jumpPress) this.pend.jump = true;
      if (inp.slashPress) this.pend.slash = true;
      if (inp.shootPress) this.pend.shoot = true;
      if (inp.dashPress) this.pend.dash = true;
      return ev;
    }
    const I = { dir: inp.dir || 0, aim: inp.aim || 0, jumpHeld: !!inp.jumpHeld,
      jumpPress: !!inp.jumpPress || this.pend.jump, slashPress: !!inp.slashPress || this.pend.slash,
      shootPress: !!inp.shootPress || this.pend.shoot, dashPress: !!inp.dashPress || this.pend.dash };
    this.pend.jump = this.pend.slash = this.pend.shoot = this.pend.dash = false;
    this.t += DT;
    const p = this.p, m = this.m;

    if (p.hazard > 0) {                             // spiked: fade out, back to the last safe ground, fade in
      const before = p.hazard;
      p.hazard -= DT;
      if (before > HAZARD_T / 2 && p.hazard <= HAZARD_T / 2) {
        p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; p.ground = true; p.cling = 0; p.dashT = 0; p.wjT = 0;
        ev.push({ type: 'return', x: p.x, y: p.y });
      }
      if (p.hazard <= 0) { p.hazard = 0; p.inv = Math.max(p.inv, 0.7); }
    } else {
      p.inv = Math.max(0, p.inv - DT); p.atkCD -= DT; p.shotCD -= DT;
      if (p.shoot && (p.shoot.t += DT) > 0.3) p.shoot = null;
      // presses made a moment before the blade/blaster is ready still count (0.12 s buffer)
      p.slashBuf = I.slashPress ? 0.12 : Math.max(0, p.slashBuf - DT);
      p.shotBuf = I.shootPress ? 0.12 : Math.max(0, p.shotBuf - DT);
      if (p.slashBuf > 0 && p.atkCD <= 0) { p.slashBuf = 0; this.slash(I); }
      if (p.shotBuf > 0 && p.shotCD <= 0) { p.shotBuf = 0; this.fire(I); }
      this.focus(I);
      const wasGround = p.ground, vy0 = p.vy;
      const f = stepPlayer(p, I, m, this.ab);
      if (f) {
        if (f & EV_JUMP) ev.push({ type: 'jump', x: p.x, y: p.y });
        if (f & EV_DJUMP) ev.push({ type: 'djump', x: p.x, y: p.y });
        if (f & EV_WALLJUMP) ev.push({ type: 'walljump', x: p.x, y: p.y, side: -p.face });
        if (f & EV_DASH) ev.push({ type: 'dash', x: p.x, y: p.y, dir: p.dashDir });
        if (f & EV_CLING) ev.push({ type: 'cling', x: p.x, y: p.y, side: p.cling });
      }
      if (p.ground && !wasGround) { p.pogos = 0; ev.push({ type: 'land', x: p.x, y: p.y, hard: vy0 > 330 }); }
      if (p.atk) this.stepSlash();
      if (touchesSpikes(p, m) || p.y > m.h + 60) this.spiked();
      else if (p.ground && p.kbT <= 0) this.markSafe();
    }
    if (this.boss) this.stepLair();
    for (const f of this.foes) if (!f.dead) stepFoe(this, f);
    this.stepBolts(); this.stepGlobs(); this.stepDrops();
    for (const c of this.chests) if (c.hurtT > 0) c.hurtT -= DT;
    if (!p.dead && p.hazard <= 0) { this.contact(); this.collect(); }
    return ev;
  }

  /** The lair: step into the arena and the gate slams shut; beat the guardian and it opens, and the exit lights. */
  stepLair() {
    const p = this.p, a = this.m.arena, g = this.boss;
    if (this.exitWait > 0) this.exitWait = Math.max(0, this.exitWait - DT);
    if (this.fight === 'wait' && p.hazard <= 0 && p.x > a.x0 + TILE * 1.6) {
      this.fight = 'on'; this.setGates(true); wakeGuardian(g);
      this.ev.push({ type: 'fight', kind: g.kind, x: g.x, y: g.y });
    }
    if (this.fight === 'on' || g.state === 'dying') stepGuardian(this, g);
    stepBossShots(this);
    for (const e of this.ev) if (e.type === 'boss-dead' && this.fight === 'on') {
      this.fight = 'won'; this.setGates(false); this.exitOpen = true; this.exitWait = EXIT_RISE;
      for (const f of this.foes) if (f.minion && !f.dead) { f.dead = true; this.ev.push({ type: 'pop', x: f.x, y: f.y - 6, foe: f.kind }); }
      this.bossShots = [];
      this.dropDust(14 + 2 * g.tier, e.x, e.y);
      for (let i = 0; i < 3; i++) this.drops.push({ kind: 'orb', x: e.x, y: e.y, vx: this.rng.range(-90, 90), vy: this.rng.range(-300, -180), t: 0, dead: false });
      this.drops.push({ kind: 'kit', x: e.x, y: e.y, vx: 0, vy: -260, t: 0, dead: false });
    }
  }

  /** The energy heal: stand still on the ground and hold ↓ — 3 energy becomes 1 armour plate. */
  focus(I) {
    const p = this.p;
    const can = p.ground && I.aim > 0 && !I.dir && Math.abs(p.vx) < 15 && !p.atk && p.dashT <= 0 && p.kbT <= 0
      && p.energy >= FOCUS_COST && p.pips < this.lo.pips && !this.atBeacon() && !I.jumpPress;
    if (!can) {
      if (p.focus > 0) this.ev.push({ type: 'focus-stop' });
      p.focus = 0; p.focusHold = 0;
      return;
    }
    p.focusHold += DT;
    if (p.focusHold < FOCUS_DELAY) return;
    if (p.focus === 0) this.ev.push({ type: 'focus', x: p.x, y: p.y });
    p.focus += DT / FOCUS_T;
    if (p.focus >= 1) {
      p.energy -= FOCUS_COST; p.pips++; p.focus = 0; p.focusHold = FOCUS_DELAY;     // keep holding: straight into the next
      this.ev.push({ type: 'heal', x: p.x, y: p.y - PH / 2, pips: p.pips });
    }
  }

  markSafe() {
    const p = this.p, m = this.m;
    if (!isFloor(tileAtPx(m, p.x - PW / 2 + 1, p.y + 1)) || !isFloor(tileAtPx(m, p.x + PW / 2 - 1, p.y + 1))) return;
    const rf = Math.floor((p.y - 1) / TILE), c0 = Math.floor((p.x - PW / 2 - TILE) / TILE), c1 = Math.floor((p.x + PW / 2 + TILE) / TILE);
    for (let c = c0; c <= c1; c++) if (isSpike(tileAt(m, c, rf)) || isSpike(tileAt(m, c, rf - 1))) return;
    p.safe.x = p.x; p.safe.y = p.y;
  }

  slash(I) {
    const p = this.p;
    const kind = I.aim < 0 ? 'up' : I.aim > 0 && !p.ground ? 'down' : 'side';
    p.atk = { kind, t: 0, face: p.face, hit: new Set(), pogo: false };
    p.atkCD = SLASH_CD;
    this.ev.push({ type: 'slash', kind });
  }

  stepSlash() {
    const p = this.p, a = p.atk;
    a.t += DT;
    if (a.t >= SLASH_T) { p.atk = null; return; }
    if (a.t < SLASH_ON[0] || a.t > SLASH_ON[1]) return;
    const b = slashBox(p, a.kind, a.face, this.lo.reach);
    for (const f of this.foes) {
      if (f.dead || a.hit.has(f.id) || !hit4(b, foeBox(f))) continue;
      a.hit.add(f.id);
      p.energy = Math.min(this.lo.energy, p.energy + 1);        // blade hits charge the blaster
      this.damageFoe(f, this.lo.blade, a.kind, a.face);
      if (a.kind === 'down') this.pogo(a);
      else if (a.kind === 'side' && p.kbT <= 0) p.vx -= a.face * 70;
    }
    for (const g of this.globs) {
      if (!g.dead && circleBox(g.x, g.y, 5, b)) { g.dead = true; this.ev.push({ type: 'parry', x: g.x, y: g.y }); if (a.kind === 'down') this.pogo(a); }
    }
    if (this.boss && !a.hit.has('boss')) {          // the guardian
      for (const part of guardianParts(this.boss)) {
        if (!part.solid || !hit4(b, part.b)) continue;
        a.hit.add('boss');
        const cx = (Math.max(b[0], part.b[0]) + Math.min(b[2], part.b[2])) / 2, cy = (Math.max(b[1], part.b[1]) + Math.min(b[3], part.b[3])) / 2;
        if (part.weak) this.hitBoss(this.lo.blade, cx, cy, a.kind);
        else { this.ev.push({ type: 'clink', x: cx, y: cy }); this.stop = Math.max(this.stop, 0.03); }
        if (a.kind === 'down') this.pogo(a);
        break;
      }
    }
    for (const c of this.chests) {                  // treasure chests: three blows
      if (c.open || a.hit.has('t' + c.id) || !hit4(b, [c.x - 10, c.y - 17, c.x + 10, c.y])) continue;
      a.hit.add('t' + c.id);
      this.hitChest(c, 1);
      if (a.kind === 'down') this.pogo(a);
    }
    for (const k of this.m.cracks) {                // cracked rock: two blows break it open
      if (k.open || a.hit.has('k' + k.id) || !k.tiles.some(([c, r]) => hit4(b, [c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE]))) continue;
      a.hit.add('k' + k.id);
      this.hitCrack(k, 1, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
      if (a.kind === 'down') this.pogo(a);
    }
    if (a.kind === 'down' && !a.pogo && boxHitsSpikes(this.m, b[0], b[1], b[2], b[3])) {
      this.pogo(a); this.ev.push({ type: 'clink', x: p.x, y: b[3] - 8 });
    }
  }

  hitBoss(dmg, x, y, by) {
    const r = damageGuardian(this, this.boss, dmg);
    if (!r) { this.ev.push({ type: 'clink', x, y }); return; }
    if (by !== 'bolt') this.p.energy = Math.min(this.lo.energy, this.p.energy + 1);    // blade hits charge the blaster, as on aliens
    this.ev.push({ type: r === 'kill' ? 'boss-kill' : 'boss-hit', x, y, by, kind: this.boss.kind, hp: this.boss.hp, max: this.boss.max });
    this.stop = Math.max(this.stop, r === 'kill' ? 0.2 : by === 'bolt' ? 0.02 : 0.05);
  }
  hitChest(c, dmg) {
    c.hp -= dmg; c.hurtT = 0.12;
    if (c.hp > 0) { this.ev.push({ type: 'chest-hit', x: c.x, y: c.y - 8 }); this.stop = Math.max(this.stop, 0.03); return; }
    c.open = true;
    this.dropDust(6, c.x, c.y - 10);
    this.ev.push({ type: 'chest', x: c.x, y: c.y - 8 });
    this.stop = Math.max(this.stop, 0.05);
  }

  hitCrack(k, dmg, x, y) {
    k.hp -= dmg;
    const [c, r] = k.tiles[0];
    if (k.hp > 0) { this.ev.push({ type: 'crack', x, y, c, r }); this.stop = Math.max(this.stop, 0.03); return; }
    k.open = true;
    for (const [tc, tr] of k.tiles) this.m.t[tr * this.m.C + tc] = AIR;
    this.ev.push({ type: 'break', id: k.id, tiles: k.tiles, x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });
    this.stop = Math.max(this.stop, 0.06);
  }

  pogo(a) {
    if (a.pogo) return;
    const p = this.p;
    a.pogo = true;
    p.vy = POGO_V; p.jumped = false; p.ground = false; p.coyote = 0; p.buffer = 0; p.cling = 0;
    p.airJumps = 1; p.airDash = true;               // a bounce gives the second jump and the air dash back
    p.pogos++;
    this.ev.push({ type: 'pogo', x: p.x, y: p.y, n: p.pogos });
  }

  fire(I) {
    const p = this.p;
    if (p.energy < 1) { p.shotCD = 0.3; this.ev.push({ type: 'empty', x: p.x, y: p.y - PH }); return; }
    const dir = I.aim < 0 ? 'up' : I.aim > 0 && !p.ground ? 'down' : 'side';
    p.energy -= 1; p.shotCD = SHOT_CD; p.shoot = { dir, t: 0 };
    const x = p.x + p.face * (dir === 'side' ? 12 : 4), y = dir === 'up' ? p.y - PH - 6 : dir === 'down' ? p.y + 2 : p.y - 18;
    this.bolts.push({ x, y, vx: dir === 'side' ? p.face * BOLT_V : 0, vy: dir === 'up' ? -BOLT_V : dir === 'down' ? BOLT_V : 0, t: 0, dead: false, hit: new Set() });
    if (dir === 'side' && p.kbT <= 0 && p.dashT <= 0) p.vx -= p.face * 45;
    this.ev.push({ type: 'shoot', x, y, dir });
  }

  damageFoe(f, dmg, by, face) {
    const p = this.p;
    f.hp -= dmg; f.hurtT = 0.16;
    const dx = by === 'side' || by === 'bolt' ? face : (Math.sign(f.x - p.x) || face);
    if (f.kind === 'crawler' || f.kind === 'hopper') {
      f.kbT = 0.14; f.kbv = dx * (by === 'bolt' ? 110 : 175);
      if (by === 'up' && f.ground) { f.vy = -150; f.ground = false; }
    } else if (f.kind === 'wisp') {
      f.kbT = 0.24; f.vx = dx * 240; f.vy = by === 'up' ? -240 : by === 'down' ? 240 : -40;
    }
    const b = foeBox(f), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    if (f.hp <= 1e-6) {
      f.dead = true; this.kills++;
      // a guardian's minions are worth nothing (no points, no loot), so stalling a fight to farm them never pays
      this.ev.push({ type: 'kill', id: f.id, x: cx, y: cy, foe: f.kind, elite: f.elite, by, minion: !!f.minion, pts: f.minion ? 0 : Math.round(FOES[f.kind].pts * (f.elite ? 1.5 : 1)) });
      if (!f.minion) this.dropLoot(f, cx, cy);
      this.stop = Math.max(this.stop, 0.07);
    } else {
      this.ev.push({ type: 'hit', x: cx, y: cy, foe: f.kind, by });
      this.stop = Math.max(this.stop, by === 'bolt' ? 0.02 : 0.045);
    }
  }

  dropLoot(f, x, y) {
    const rng = this.rng, n = (rng.next() < 0.65 ? 1 : 0) + (f.elite ? 1 : 0), kit = rng.next() < (f.elite ? 0.25 : 0.08);
    for (let i = 0; i < n; i++) this.drops.push({ kind: 'orb', x, y: y + 4, vx: rng.range(-70, 70), vy: rng.range(-280, -170), t: 0, dead: false });
    if (kit) this.drops.push({ kind: 'kit', x, y: y + 4, vx: rng.range(-40, 40), vy: -250, t: 0, dead: false });
  }
  /** Star dust that bursts out of something (a treasure, a guardian): flies out, then drifts to you. */
  dropDust(n, x, y) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) this.drops.push({ kind: 'dust', x, y, vx: rng.range(-150, 150), vy: rng.range(-330, -160), t: 0, dead: false });
  }

  stepBolts() {
    for (const b of this.bolts) {
      if ((b.t += DT) > BOLT_LIFE) { b.dead = true; continue; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (tileAtPx(this.m, b.x, b.y) === ROCK) {
        b.dead = true; this.ev.push({ type: 'spark', x: b.x, y: b.y });
        const c = Math.floor(b.x / TILE), r = Math.floor(b.y / TILE);
        const k = this.m.cracks.find((q) => !q.open && q.tiles.some(([tc, tr]) => tc === c && tr === r));
        if (k) this.hitCrack(k, 1, b.x, b.y);
        continue;
      }
      if (this.boss && !b.hit.has('boss')) {
        for (const part of guardianParts(this.boss)) {
          const q = part.b;
          if (!part.solid || b.x < q[0] - 2 || b.x > q[2] + 2 || b.y < q[1] - 2 || b.y > q[3] + 2) continue;
          b.hit.add('boss');
          if (part.weak) { this.hitBoss(this.lo.blaster, b.x, b.y, 'bolt'); if (!this.lo.pierce) b.dead = true; }
          else { b.dead = true; this.ev.push({ type: 'spark', x: b.x, y: b.y }); }
          break;
        }
        if (b.dead) continue;
      }
      for (const c of this.chests) {
        if (c.open || b.hit.has('t' + c.id) || b.x < c.x - 11 || b.x > c.x + 11 || b.y < c.y - 18 || b.y > c.y) continue;
        b.hit.add('t' + c.id); b.dead = true; this.hitChest(c, 1); break;
      }
      if (b.dead) continue;
      for (const f of this.foes) {
        if (f.dead || b.hit.has(f.id)) continue;
        const fb = foeBox(f);
        if (b.x > fb[0] - 3 && b.x < fb[2] + 3 && b.y > fb[1] - 3 && b.y < fb[3] + 3) {
          b.hit.add(f.id);
          if (!this.lo.pierce) b.dead = true;
          this.damageFoe(f, this.lo.blaster, 'bolt', Math.sign(b.vx) || this.p.face);
          if (b.dead) break;
        }
      }
      if (b.dead) continue;
      for (const g of this.globs) if (!g.dead && Math.hypot(g.x - b.x, g.y - b.y) < 8) { g.dead = true; if (!this.lo.pierce) b.dead = true; this.ev.push({ type: 'parry', x: g.x, y: g.y }); break; }
    }
    this.bolts = this.bolts.filter((b) => !b.dead);
  }

  stepGlobs() {
    for (const g of this.globs) {
      if ((g.t += DT) > 4) { g.dead = true; continue; }
      g.x += g.vx * DT; g.y += g.vy * DT;
      if (tileAtPx(this.m, g.x, g.y) === ROCK) { g.dead = true; this.ev.push({ type: 'splat', x: g.x, y: g.y }); }
    }
    this.globs = this.globs.filter((g) => !g.dead);
  }

  /** Energy orbs, suit-repair kits and star dust: fall, settle, and drift to the astronaut (orbs and kits only when he needs them). */
  stepDrops() {
    const p = this.p;
    for (const d of this.drops) {
      if (d.kind !== 'dust' && (d.t += DT) > 12) { d.dead = true; continue; }
      if (d.kind === 'dust') d.t += DT;
      const want = d.kind === 'dust' || (d.kind === 'orb' ? p.energy < this.lo.energy : p.pips < this.lo.pips);
      const dx = p.x - d.x, dy = (p.y - PH / 2) - (d.y - 4), dist = Math.hypot(dx, dy) || 1;
      const reach = d.kind === 'dust' ? (d.t > 0.8 ? 1e9 : 0) : 72;
      if (want && !p.dead && p.hazard <= 0 && d.t > 0.35 && dist < reach) {
        const pull = d.kind === 'dust' ? 1500 : 1100;
        d.vx = (d.vx + (dx / dist) * pull * DT) * 0.96; d.vy = (d.vy + (dy / dist) * pull * DT) * 0.96;
        d.x += d.vx * DT; d.y += d.vy * DT;
        continue;
      }
      d.vy = Math.min(420, d.vy + 950 * DT);
      const r = moveBody(d, 4, 8, this.m, DT, true);
      if (r.ground) d.vx *= 0.86;
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  hurt(n, fromX) {
    const p = this.p;
    if (p.inv > 0 || p.hazard > 0 || p.dead) return;
    p.hits++; this.hits++; p.pips -= n; p.inv = INV_T; p.atk = null; p.focus = 0; p.focusHold = 0;
    const d = Math.sign(p.x - fromX) || -p.face;
    p.vx = d * 240; p.vy = -300; p.kbT = KB_T; p.ground = false; p.jumped = false; p.dashT = 0; p.cling = 0; p.wjT = 0;
    this.ev.push({ type: 'hurt', x: p.x, y: p.y - PH / 2, pips: p.pips });
    this.stop = Math.max(this.stop, 0.08);
    if (p.pips <= 0) { p.pips = 0; p.dead = true; this.ev.push({ type: 'dead' }); }
  }

  spiked() {
    const p = this.p;
    p.hits++; this.hits++; p.pips -= 1; p.atk = null; p.shoot = null; p.vx = 0; p.vy = 0; p.kbT = 0; p.focus = 0;
    p.dashT = 0; p.cling = 0; p.wjT = 0;
    this.ev.push({ type: 'spike', x: p.x, y: p.y - PH / 2, pips: p.pips });
    this.stop = Math.max(this.stop, 0.06);
    if (p.pips <= 0) { p.pips = 0; p.dead = true; this.ev.push({ type: 'dead' }); return; }
    p.hazard = HAZARD_T;
  }

  contact() {
    const p = this.p;
    if (p.inv > 0) return;
    const pb = [p.x - PW / 2 + 2, p.y - PH + 3, p.x + PW / 2 - 2, p.y - 1];
    for (const f of this.foes) if (!f.dead && hit4(pb, inset(foeBox(f), 2.5))) { this.hurt(1, f.x); return; }
    if (this.boss && this.fight === 'on') {
      for (const part of guardianParts(this.boss)) if (part.harm && hit4(pb, inset(part.b, 3))) { this.hurt(1, (part.b[0] + part.b[2]) / 2); return; }
      for (const sh of this.bossShots) {
        const q = shotBox(sh);
        if (!q || !hit4(pb, q)) continue;
        if (sh.kind === 'orb' || sh.kind === 'glob') sh.dead = true;
        this.hurt(1, sh.x - (sh.vx || 0) * 0.05);
        return;
      }
    }
    for (const g of this.globs) {
      if (!g.dead && circleBox(g.x, g.y, 4.5, pb)) { g.dead = true; this.ev.push({ type: 'splat', x: g.x, y: g.y }); this.hurt(1, g.x - g.vx); return; }
    }
  }

  collect() {
    const p = this.p, m = this.m;
    for (const i of dustTouched(p, m, this.taken)) {
      this.taken[i] = true; this.dustGot++;
      this.ev.push({ type: 'dust', x: m.dust[i].x, y: m.dust[i].y, all: this.dustGot === m.dust.length });
    }
    for (const d of this.drops) {
      const dx = p.x - d.x, dy = (p.y - PH / 2) - (d.y - 4);
      if (dx * dx + dy * dy > 16 * 16) continue;
      if (d.kind === 'orb' && p.energy < this.lo.energy) { d.dead = true; p.energy++; this.ev.push({ type: 'orb', x: d.x, y: d.y - 4 }); }
      else if (d.kind === 'kit' && p.pips < this.lo.pips) { d.dead = true; p.pips++; this.ev.push({ type: 'repair', x: d.x, y: d.y - 4 }); }
      else if (d.kind === 'dust' && d.t > 0.35) { d.dead = true; this.ev.push({ type: 'dustdrop', x: d.x, y: d.y - 4 }); }
    }
    if (!this.beaconLit && touchesBeacon(p, m)) {
      this.beaconLit = true; this.rest(); p.safe.x = m.beacon.x; p.safe.y = m.beacon.y;
      this.ev.push({ type: 'beacon', x: m.beacon.x, y: m.beacon.y });
    }
    if (!this.capTaken && touchesCapsule(p, m)) {
      this.capTaken = true;
      if (this.capKind !== 'cache') { this.lo.abil++; this.ab = abilSet(this.lo.abil); }
      this.ev.push({ type: 'capsule', kind: this.capKind, x: m.capsule.x, y: m.capsule.y });
    }
    if (!this.done && this.exitOpen && this.exitWait <= 0 && m.exit && atExit(p, m)) {
      this.done = true;
      // star dust still in the air flies into the suit as you leave, so a quick exit never loses any
      let n = 0;
      for (const d of this.drops) if (d.kind === 'dust' && !d.dead) { d.dead = true; this.ev.push({ type: 'dustdrop', x: d.x, y: d.y - 4, quiet: n++ > 0 }); }
      this.ev.push({ type: 'exit', x: m.exit.x, y: m.exit.y, clean: this.hits === 0 });
    }
    if (this.kind === 'vault' && !this.cleared && this.dustGot === m.dust.length && this.chests.every((c) => c.open) && !this.drops.some((d) => d.kind === 'dust')) {
      this.cleared = true; this.ev.push({ type: 'vault-clear', x: p.x, y: p.y });
    }
  }
}

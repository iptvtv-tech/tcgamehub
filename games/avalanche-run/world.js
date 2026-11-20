// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — the rules (pure: no drawing, no sound, no engine). Shared by game.js, the level
//  checker (check.mjs), the game test (test.mjs) and the benchmark bot (bench.mjs).
//
//  The slope is a strip of snow 26 m wide. x runs across it (−HALF … +HALF, 0 = the middle) and z
//  runs down the hill in metres, from the start line (0) to the hut (len). The sled speeds up by
//  itself; you steer, and tuck for more speed and less steering. Behind you comes the avalanche,
//  at a steady pace. Hitting a tree or a rock is a TUMBLE: you lose your speed for a moment and
//  the avalanche gains. Only the avalanche costs a life; you then start again from the flag
//  halfway down (if you had passed it), with the avalanche set back.
//
//  From Section 2: snow RAMPS throw the sled into the air. In the air ◀ ▶ spin it (a trick) and
//  tuck is a grab; let go so the sled points downhill again when it lands and you get a burst of
//  speed, land sideways and you tumble. JUMP is a short hop: it clears rocks, and crevasses if you
//  time it. A CREVASSE (from run 6) is a crack right across the slope: fall in and you lose a
//  life. Every crevasse has a wide ramp on the safe line at its edge. Crystals lie along the safe
//  line and in the air behind the ramps.
//
//  From Section 3, the creatures of the dead kingdom:
//    ICE WOLVES (from run 4) run in from the forest and keep pace beside the sled. A wolf crouches
//    for half a second, then lunges: a bite takes two fifths of your speed (never a tumble, never
//    a life). Swerve into a wolf that is not lunging and it is knocked down.
//    YETIS (from run 7) stand on the slope and throw snow boulders at where you are heading; a
//    ring on the snow shows where each will land a second ahead (it bursts there). A boulder, or the yeti itself,
//    is a tumble. Come down on a yeti from the air and you flatten it and bounce.
//    ROLLING BOULDERS (from run 11) come out of the forest and roll across the slope.
//  None of them can take a life: only the avalanche and the crevasses do.
//
//  Mercy: a tree or rock you crash into stays down for the rest of the run, a wolf pack you have
//  met does not come back after a lost life, and each life lost on a run sets the avalanche 15 m
//  further back at the restart. So a run gets a little kinder every time it beats you.
//
//  Every slope has a SAFE LINE: a winding path the slope maker keeps clear, gentle enough to be
//  steered at full tuck. check.mjs proves a way down for every run without knowing that line.
// ─────────────────────────────────────────────────────────────
export const HALF = 13;              // half the width of the slope (m)
export const PR = 0.55;              // the sled's half-width for bumping into things (m)
export const STEER = 10;             // sideways speed at full steer (m/s)
export const STEER_TUCK = 6;         // … while tucked
export const STEER_ACC = 48;         // how fast the sled answers the steering (m/s²)
export const ACC = 7;                // how fast it picks up speed again on run 1 (m/s²); it grows with the run's speed, so a tumble
                                     // always costs about the same time
export const TUCK = 1.3;             // a tuck is this much faster
export const TUMBLE_T = 0.8;         // seconds of tumbling after a hit (no steering)
export const TUMBLE_V = 4;           // speed left after a hit (m/s)
export const SAFE_T = 1.5;           // seconds after a hit in which nothing else can hit you
export const START_GAP = 55;         // how far behind the avalanche starts, and restarts (m)
export const MERCY_GAP = 15;         // each life lost on a run sets it this much further back at the restart (m)
export const MAX_GAP = 95;           // it never falls further behind than this (m)
export const CAUGHT = 1.5;           // it has you when it is this close (m)
export const CLEAR_START = 45;       // metres after the start line / the flag with nothing in the way
export const SAFE_SLOPE = 0.16;      // the safe line never moves sideways faster than this (m per m)
export const GRAV = 16;               // gravity on the sled in the air (m/s²)
export const HOP_VY = 6;              // a jump's lift-off speed: 0.75 s in the air
export const RAMP_W = 2.3;            // half-width of a snow ramp (m); a crevasse's ramp is wider
export const SPIN = 13;               // how fast the sled spins in the air (rad/s): a full turn in about half a second
export const LAND_OK = 0.95;          // land within this (rad) of pointing downhill, or tumble
export const BOOST_T = 1.8;           // seconds of extra speed after a clean trick landing
export const BOOST = 1.22;            // … and how much
export const ROCK_HOP = 0.45;         // a sled this high (m) clears a rock
export const CREV_CLEAR = 45;         // metres before a crevasse with nothing to hit, right across the slope
export const WOLF_SIDE = 2.6;         // a wolf keeps pace this far to one side of the sled (m)
export const WOLF_CROUCH = 0.55;      // seconds it crouches before a lunge (the warning)
export const WOLF_LUNGE = 0.45;       // seconds a lunge lasts, at 10 m/s sideways
export const BITE = 0.6;              // a bite leaves you this much of your speed (never less than half your cruising speed)
export const BITE_SAFE = 2.5;         // seconds after a bite in which no wolf can bite again
export const KNOCK_VX = 3;            // swerve into a wolf at least this fast (m/s) to knock it down
export const YETI_R = 1.3;            // a yeti's radius (m)
export const THROW_T = 1.15;          // seconds a yeti's boulder is in the air (the ring on the snow shows where it lands)
export const BOULDER_R = 1.1;
export const STOMP_Y = 0.6;           // come down on a yeti from at least this high (m) to flatten it
export const ROLLER_V = 6;            // a rolling boulder's speed across the slope (m/s)
export const BONUS_LEVELS = [5, 10];
export const FINAL_LEVEL = 15;

/** The numbers of one run. */
export function runFor(level) {
  const n = Math.max(1, level);
  const cruise = Math.min(31, 18 * Math.pow(1.038, n - 1));        // m/s without tucking
  return {
    level: n,
    len: 700 + 60 * n,                                              // metres to the hut
    cruise,
    top: cruise * TUCK,                                             // the fastest the sled ever goes
    acc: ACC * cruise / 18,                                         // picking up speed again takes as long on every run
    avalanche: cruise * Math.min(0.94, 0.78 + 0.011 * n),           // the avalanche's steady pace
    perHundred: Math.min(52, 9 + 2.9 * n),                          // trees and rocks per 100 m of slope
    corridor: Math.max(1.7, 2.7 - 0.07 * n),                        // clear snow either side of the safe line, beyond the sled
    rocks: n >= 2 ? Math.min(0.4, 0.1 + 0.03 * n) : 0,              // share of obstacles that are rocks
    ramps: Math.min(6, 1 + Math.floor(n / 2)),                      // snow ramps beside the safe line
    crevasses: n >= 11 ? 3 : n >= 8 ? 2 : n >= 6 ? 1 : 0,           // cracks right across the slope
    crevLen: n >= 11 ? 12 : 10,                                     // … and how wide they are (m)
    packs: n >= 11 ? 3 : n >= 6 ? 2 : n >= 4 ? 1 : 0,               // wolf packs on the run
    packSize: n >= 13 ? 3 : n >= 8 ? 2 : 1,                         // wolves in a pack
    yetis: n >= 11 ? 3 : n >= 8 ? 2 : n >= 7 ? 1 : 0,
    throwEvery: Math.max(1.3, 2.1 - 0.05 * n),                      // seconds between a yeti's throws
    rollers: n >= 11 ? n - 8 : 0,                                   // rolling boulders
  };
}

/** The safe line: knots every 40–70 m, joined by smooth curves no steeper than SAFE_SLOPE. */
function safeLine(len, rng) {
  const knots = [{ z: 0, x: 0 }, { z: CLEAR_START, x: 0 }];
  let z = CLEAR_START, x = 0;
  while (z < len + 80) {
    const dz = rng.range(40, 70), reach = dz * SAFE_SLOPE * 0.62;   // (a smooth-step curve is 1.5× as steep in its middle)
    x = Math.max(-HALF + 3.5, Math.min(HALF - 3.5, x + rng.range(-reach, reach)));
    z += dz; knots.push({ z, x });
  }
  return knots;
}
/** Where the safe line is at z. */
export function lineAt(knots, z) {
  if (z <= knots[0].z) return knots[0].x;
  let i = 1; while (i < knots.length - 1 && knots[i].z < z) i++;
  const a = knots[i - 1], b = knots[i], t = Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z || 1)));
  return a.x + (b.x - a.x) * t * t * (3 - 2 * t);
}

/** How long a ramp throws the sled for, and how fast it leaves the lip. */
export const rampVy = (v) => 9.5 + 0.1 * v;
export const airTime = (vy) => 2 * vy / GRAV;
/** How far a sled leaving a ramp at speed v flies (m). */
export const flight = (v) => v * airTime(rampVy(v));
/** Metres behind a ramp kept clear along its lane: the longest flight of the run (tucked, boosted) and room to land. */
export const rampClear = (R) => flight(R.top * BOOST) + 6;
/** Five crystals along the flight a cruising sled makes off a ramp at (x, z). */
function arc(R, x, z) {
  const vy = rampVy(R.cruise), T = airTime(vy), out = [];
  for (let k = 1; k <= 5; k++) { const t = T * k / 6; out.push({ x, z: z + R.cruise * t, y: 0.9 + 1.1 + vy * t - GRAV / 2 * t * t, got: false }); }
  return out;
}

/** How the slope winds across the mountain (for the eye only: the rules never read it). */
export function bendFor(rng) { return { a: rng.range(5, 9), b: rng.range(2, 4), p: rng.range(0, 6.28), q: rng.range(0, 6.28), k: rng.range(0.010, 0.016), j: rng.range(0.031, 0.043) }; }
export const bendAt = (bend, z) => bend.a * Math.sin(z * bend.k + bend.p) + bend.b * Math.sin(z * bend.j + bend.q);

/** Build one run's slope from the seeded dice. */
export function makeSlope(level, rng, bonus = false) {
  const R = runFor(level), bend = bendFor(rng);
  if (bonus) {
    // a crystal rush: no avalanche, nothing to hit, lines of crystals weaving down an endless slope
    const crystals = []; let x = 0;
    for (let n = 0; n < 430; n++) {                                 // lines of ten, a short gap, the next line somewhere else
      const k = n % 14, z = 30 + n * 3.2;
      if (k === 0) x = Math.max(-HALF + 3, Math.min(HALF - 3, x + rng.range(-7, 7)));
      if (k < 10) crystals.push({ x: x + Math.sin(k * 0.6) * 1.2, z, got: false });
    }
    // a ramp park: a ramp in the middle of every third line
    const ramps = [];
    for (let i = 0; i < crystals.length; i++) { const c = crystals[i]; c.y = 0.9; if (i % 30 === 4) ramps.push({ x: c.x, z: c.z, w: RAMP_W, crev: false }); }
    for (const rp of ramps) {                                        // the crystals behind a ramp hang in its flight
      const far = R.cruise * airTime(rampVy(R.cruise));
      for (let i = crystals.length - 1; i >= 0; i--) { const d = crystals[i].z - rp.z; if (d > 0 && d < far + 2) crystals.splice(i, 1); }
      crystals.push(...arc(R, rp.x, rp.z));
    }
    crystals.sort((a, b) => a.z - b.z);
    return { level, bonus: true, R, len: Infinity, flagZ: Infinity, knots: [{ z: 0, x: 0 }, { z: 1e9, x: 0 }], obstacles: [], crystals, ramps, crevasses: [], packs: [], rollers: [], bend };
  }
  const knots = safeLine(R.len, rng), obstacles = [];
  const flagZ = Math.round(R.len * 0.5);
  // ── crevasses first (they need room), each with a wide ramp on the safe line at its edge
  const crevasses = [], ramps = [];
  const taken = [[-1e9, CLEAR_START + 40], [flagZ - 60, flagZ + CLEAR_START + 30], [R.len - 60, 1e9]];   // stretches no feature may reach into
  const fits = (z, before, after) => taken.every(([a, b]) => z + after < a || z - before > b);
  for (let i = 0, tries = 0; i < R.crevasses && tries < 200; tries++) {
    const z = rng.range(CLEAR_START + 100, R.len - 140);
    if (!fits(z, CREV_CLEAR + 30, R.crevLen + 60)) continue;
    crevasses.push({ z, len: R.crevLen });
    ramps.push({ x: lineAt(knots, z - 1), z: z - 1, w: 3.4, crev: true });
    taken.push([z - CREV_CLEAR - 30, z + R.crevLen + 60]); i++;
  }
  // ── snow ramps a little to one side of the safe line: they are a choice
  for (let i = 0, tries = 0; i < R.ramps && tries < 300; tries++) {
    const z = rng.range(CLEAR_START + 30, R.len - 120);
    if (!fits(z, 25, rampClear(R) + 10)) continue;
    const side = rng.chance(0.5) ? 1 : -1, x = Math.max(-HALF + 3.2, Math.min(HALF - 3.2, lineAt(knots, z) + side * rng.range(2.5, 5)));
    ramps.push({ x, z, w: RAMP_W, crev: false });
    taken.push([z - 25, z + rampClear(R) + 10]); i++;
  }
  ramps.sort((a, b) => a.z - b.z); crevasses.sort((a, b) => a.z - b.z);
  const count = Math.round((R.len - CLEAR_START) / 100 * R.perHundred);
  for (let i = 0; i < count; i++) {
    const rock = rng.chance(R.rocks), r = rock ? rng.range(0.9, 1.3) : rng.range(0.6, 0.9);
    const z = rng.range(CLEAR_START, R.len - 14), x = rng.range(-HALF + 0.8, HALF - 0.8);
    // never on the safe line, never in the clear snow after the flag, never on top of another
    let free = true;
    for (let dz = -2; dz <= 2 && free; dz += 1) if (Math.abs(x - lineAt(knots, z + dz)) < R.corridor + PR + r) free = false;
    if (free && z > flagZ - 4 && z < flagZ + CLEAR_START) free = false;
    // not before or behind a crevasse, not on a ramp, not in the lane where a ramp's flight comes down
    if (free) for (const c of crevasses) if (z > c.z - CREV_CLEAR && z < c.z + c.len + 30) { free = false; break; }
    if (free) for (const rp of ramps) if (z > rp.z - 8 && z < rp.z + rampClear(R) && Math.abs(x - rp.x) < rp.w + PR + r + 0.4) { free = false; break; }
    if (free) for (const o of obstacles) if (Math.abs(o.z - z) < 2.4 && Math.abs(o.x - x) < o.r + r + 0.3) { free = false; break; }
    if (free) obstacles.push({ x, z, r, kind: rock ? 'rock' : 'tree', v: rng.int(0, 2), hit: 0 });
  }
  // ── yetis: off the safe line, never where a ramp's flight lands or before a crevasse (they are obstacles too)
  for (let i = 0, tries = 0; i < R.yetis && tries < 400; tries++) {
    const z = rng.range(CLEAR_START + 120, R.len - 60), x = rng.range(-HALF + 2, HALF - 2);
    let free = Math.abs(x - lineAt(knots, z)) > R.corridor + PR + YETI_R + 1.2 && !(z > flagZ - 130 && z < flagZ + CLEAR_START + 20);
    if (free) for (const c of crevasses) if (z > c.z - CREV_CLEAR - 110 && z < c.z + c.len + 40) { free = false; break; }
    if (free) for (const rp of ramps) if (z > rp.z - 8 && z < rp.z + rampClear(R) && Math.abs(x - rp.x) < rp.w + PR + YETI_R + 0.4) { free = false; break; }
    if (free) for (const o of obstacles) if (o.kind === 'yeti' && Math.abs(o.z - z) < 140) { free = false; break; }
    if (!free) continue;
    for (let k = obstacles.length - 1; k >= 0; k--) { const o = obstacles[k]; if (Math.abs(o.z - z) < 3 && Math.abs(o.x - x) < o.r + YETI_R + 0.5) obstacles.splice(k, 1); }
    obstacles.push({ x, z, r: YETI_R, kind: 'yeti', v: 0, hit: 0, flat: false, next: 0 }); i++;
  }
  obstacles.sort((a, b) => a.z - b.z);
  // ── wolf packs and rolling boulders: where along the run they come out of the forest
  const packs = [], rollers = [];
  const calm = (z, far) => z > CLEAR_START + 60 && z < R.len - 80 && !(z > flagZ - far && z < flagZ + CLEAR_START + 10) && !crevasses.some((c) => z > c.z - far - 30 && z < c.z + c.len + 20);
  for (let i = 0, tries = 0; i < R.packs && tries < 300; tries++) {
    const z = rng.range(CLEAR_START + 60, R.len - 200);
    if (!calm(z, 220) || packs.some((q) => Math.abs(q.z - z) < 260)) continue;
    packs.push({ z, n: R.packSize, side: rng.chance(0.5) ? 1 : -1 }); i++;
  }
  for (let i = 0, tries = 0; i < R.rollers && tries < 300; tries++) {
    const z = rng.range(CLEAR_START + 120, R.len - 60);
    if (!calm(z, 60) || rollers.some((q) => Math.abs(q.z - z) < 70)) continue;
    rollers.push({ z, side: rng.chance(0.5) ? 1 : -1 }); i++;
  }
  packs.sort((a, b) => a.z - b.z); rollers.sort((a, b) => a.z - b.z);
  // ── crystals: a line of seven on the safe line every 110 m or so, and an arc in the air behind each ramp
  const crystals = [];
  for (let z = CLEAR_START + 20; z < R.len - 60; z += rng.range(90, 130)) {
    if (crevasses.some((c) => z > c.z - 30 && z < c.z + c.len + 10)) continue;
    for (let k = 0; k < 7; k++) crystals.push({ x: lineAt(knots, z + k * 3), z: z + k * 3, y: 0.9, got: false });
  }
  for (const rp of ramps) crystals.push(...arc(R, rp.x, rp.z));
  crystals.sort((a, b) => a.z - b.z);
  return { level, bonus: false, R, len: R.len, flagZ, knots, obstacles, crystals, ramps, crevasses, packs, rollers, bend };
}

/** Knock the sled over (a tumble), unless it is still safe from the last one. */
function knockOver(sim, ev, what) {
  const p = sim.p;
  if (p.safe > 0 || p.tumble > 0) return false;
  p.tumble = TUMBLE_T; p.safe = SAFE_T; p.spin = 0; sim.tumbles++;
  if (p.air) { p.air = ''; p.y = 0; p.vy = 0; p.rot = 0; }
  ev.push({ type: 'tumble', by: what });
  return true;
}

/** One run in play. step() moves it by one engine step and returns what happened. */
export class SlopeSim {
  constructor(slope) {
    this.slope = slope; this.R = slope.R;
    this.flagged = false; this.tumbles = 0; this.lost = -1;
    this.reset();
  }
  /** Back to the start line, or to the flag once it has been passed. */
  reset() {
    const s = this.slope, z = this.flagged ? s.flagZ : 0;
    this.p = { x: lineAt(s.knots, z), z, v: this.R.cruise * 0.6, vx: 0, tumble: 0, safe: 0, tuck: false, spin: 0,
      y: 0, vy: 0, air: '', rot: 0, grab: 0, boost: 0, airT: 0, bitten: 0 };
    this.jumpWas = false;
    this.lost++;                       // lives lost on this run so far
    this.az = z - Math.min(MAX_GAP - 5, START_GAP + MERCY_GAP * this.lost);   // the avalanche's front
    this.i0 = 0;                       // first obstacle not yet passed
    while (this.i0 < s.obstacles.length && s.obstacles[this.i0].z < z - 3) this.i0++;
    for (const o of s.obstacles) { o.passed = o.z < z; if (o.kind === 'yeti') { o.flat = false; o.next = 0; o.arm = 0; } }
    this.wolves = []; this.boulders = []; this.knocks = this.knocks || 0; this.wolfTurn = 0;
    for (const q of s.packs) q.out = !!q.met || q.z < z + 40;      // a pack you have met once does not come back after a lost life
    for (const q of s.rollers) q.out = q.z < z + 20;
    for (const c of s.crystals) if (c.z >= z) c.got = false;
    this.done = false; this.t = 0;
  }
  get gap() { return this.p.z - this.az; }

  /** Wolves, yetis' boulders and rolling boulders: one step. */
  creatures(dt, ev) {
    const s = this.slope, R = this.R, p = this.p;
    const crevNear = s.crevasses.some((c) => c.z > p.z - 5 && c.z - p.z < 70);
    this.wolfTurn = Math.max(0, (this.wolfTurn || 0) - dt);
    // ── wolf packs come out of the forest
    for (const q of s.packs) {
      if (q.out || p.z < q.z) continue;
      q.out = q.met = true;
      for (let i = 0; i < q.n; i++) this.wolves.push({ side: i % 2 ? -q.side : q.side, x: (i % 2 ? -q.side : q.side) * (HALF + 3), dz: 16 + i * 5, state: 'in', t: -i * 1.1, lunges: 0, off: 0 });
      ev.push({ type: 'howl', n: q.n });
    }
    for (const w of this.wolves) {
      if (w.state === 'gone') continue;
      w.t += dt;
      const home = Math.max(-HALF - 2, Math.min(HALF + 2, p.x + w.side * WOLF_SIDE));
      const toward = (tx, v) => { const d = tx - w.x, lim = v * dt; w.x += Math.max(-lim, Math.min(lim, d)); };
      if (w.state === 'down' || w.state === 'away') { w.dz -= (w.state === 'down' ? 14 : 5) * dt; w.x += w.side * 6 * dt; if (w.dz < -14 || Math.abs(w.x) > HALF + 5) w.state = 'gone'; continue; }
      if (crevNear || w.lunges >= 2 && w.state === 'run' || this.done) { w.state = 'away'; continue; }
      if (w.state === 'in') { toward(home, 9); w.dz += (0.4 - w.dz) * Math.min(1, 1.6 * dt); if (w.t > 0 && Math.abs(w.x - home) < 0.6 && w.dz < 1.5) { w.state = 'run'; w.t = 0; } }
      else if (w.state === 'run') { toward(home, 5); w.dz += (0.4 - w.dz) * Math.min(1, 3 * dt); if (w.t > (w.lunges ? 1.7 : 1.1) && Math.abs(w.x - home) < 1 && this.wolfTurn <= 0) { w.state = 'crouch'; w.t = 0; this.wolfTurn = WOLF_CROUCH + WOLF_LUNGE + 0.6; } }   // (one wolf of a pack at a time)
      else if (w.state === 'crouch') { if (w.t > WOLF_CROUCH) { w.state = 'lunge'; w.t = 0; w.lunges++; } }
      else if (w.state === 'lunge') { w.x -= w.side * 10 * dt; if (w.t > WOLF_LUNGE) { w.state = 'run'; w.t = 0; } }
      // touching the sled
      const dx = w.x - p.x;
      if (Math.abs(dx) < 1.1 && Math.abs(w.dz) < 1.6 && !p.air && p.tumble <= 0) {
        if (w.state === 'lunge') { if (p.safe <= 0 && p.bitten <= 0) { p.v = Math.max(p.v * BITE, Math.min(p.v, R.cruise * 0.5)); p.bitten = BITE_SAFE; ev.push({ type: 'bite', w }); } w.state = 'run'; w.t = 0; w.x = p.x + w.side * 1.4; }
        else if (p.vx * Math.sign(dx || w.side) > KNOCK_VX) { w.state = 'down'; this.knocks++; ev.push({ type: 'knock', w }); }
        else w.x = p.x + Math.sign(dx || w.side) * 1.1;
      }
    }
    if (this.wolves.length && this.wolves.every((w) => w.state === 'gone')) this.wolves = [];
    // ── yetis throw at where the sled is heading
    const obs = s.obstacles;
    for (let i = this.i0; i < obs.length; i++) {
      const o = obs[i];
      if (o.z > p.z + 115) break;
      if (o.kind !== 'yeti' || o.flat) continue;
      o.arm = Math.max(0, (o.arm || 0) - dt);
      const d = o.z - p.z;
      if (d < p.v * THROW_T + 10 || crevNear || p.air === 'ramp') continue;   // (not at point-blank range, and never at a sled that cannot steer: in the air off a ramp)
      o.next -= dt;
      if (o.next <= 0) {
        o.next = R.throwEvery; o.arm = 0.5;
        const lx = Math.max(-HALF + 1, Math.min(HALF - 1, p.x + p.vx * 0.35)), lz = Math.min(o.z - 6, p.z + Math.max(p.v, 8) * THROW_T);
        this.boulders.push({ kind: 'snow', x0: o.x, z0: o.z, x: lx, z: lz, t: THROW_T, r: BOULDER_R, vx: 0, vz: 0, life: 1 });
        ev.push({ type: 'throw', o });
      }
    }
    // ── rolling boulders come out of the forest
    for (const q of s.rollers) {
      if (q.out || p.z < q.z - 80) continue;
      q.out = true;
      this.boulders.push({ kind: 'roll', x: q.side * (HALF + 1.5), z: q.z, t: 0.5, r: 1.2, vx: -q.side * ROLLER_V, vz: 3, life: 6 });
      ev.push({ type: 'rumble', q });
    }
    // ── boulders in the air, landing, rolling
    for (const b of this.boulders) {
      if (b.t > 0) {                       // a thrown one is still in the air; a roller is still in the trees
        b.t -= dt;
        if (b.t <= 0 && b.kind === 'snow') { ev.push({ type: 'thud', b }); b.life = 0; if (!p.air && Math.abs(b.z - p.z) < 1.3 && Math.abs(b.x - p.x) < b.r + PR) knockOver(this, ev, 'boulder'); }   // it bursts where it lands
        continue;
      }
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      const high = p.air === 'ramp' || p.y > ROCK_HOP;
      if (!high && Math.abs(b.z - p.z) < 0.9 && Math.abs(b.x - p.x) < b.r + PR && knockOver(this, ev, 'boulder')) { p.vx = (p.x >= b.x ? 1 : -1) * 5; b.life = 0; }
      if (Math.abs(b.x) > HALF + 3 || b.z < p.z - 12) b.life = 0;
    }
    if (this.boulders.length) this.boulders = this.boulders.filter((b) => b.life > 0);
  }

  step(inp, dt) {
    const ev = [], s = this.slope, R = this.R, p = this.p;
    if (this.done) return ev;
    this.t += dt;
    p.safe = Math.max(0, p.safe - dt);
    // ── the sled
    const z0 = p.z, jump = !!inp.jump && !this.jumpWas; this.jumpWas = !!inp.jump;
    p.boost = Math.max(0, p.boost - dt); p.bitten = Math.max(0, p.bitten - dt);
    if (p.tumble > 0) {
      p.tumble -= dt; p.spin += dt * 9;
      p.vx *= 1 - 3 * dt; p.v += (TUMBLE_V - p.v) * Math.min(1, 12 * dt);
      p.tuck = false;
    } else if (p.air === 'ramp') {
      // in the air off a ramp: ◀ ▶ spin the sled, tuck is a grab; it flies straight on
      p.rot += (inp.dir || 0) * SPIN * dt; p.vx *= 1 - 4 * dt;
      p.tuck = !!inp.tuck; if (p.tuck) p.grab += dt;
    } else {
      p.tuck = !!inp.tuck;
      const grip = p.air ? 0.5 : 1;
      const want = (inp.dir || 0) * (p.tuck ? STEER_TUCK : STEER) * grip, d = want - p.vx, lim = STEER_ACC * grip * dt;
      p.vx += Math.max(-lim, Math.min(lim, d));
      const top = (p.tuck ? R.top : R.cruise) * (p.boost > 0 ? BOOST : 1);
      if (!p.air) p.v += Math.max(-R.acc * 1.5 * dt, Math.min(R.acc * (p.boost > 0 ? 2.5 : 1) * dt, top - p.v));
      if (jump && !p.air) { p.air = 'hop'; p.vy = HOP_VY; p.airT = 0; ev.push({ type: 'hop' }); }
    }
    p.x += p.vx * dt; p.z += p.v * dt;
    if (p.x > HALF - PR) { p.x = HALF - PR; p.vx = Math.min(0, p.vx); }
    if (p.x < -HALF + PR) { p.x = -HALF + PR; p.vx = Math.max(0, p.vx); }
    // ── ramps: riding over the lip throws the sled up
    if (!p.air && p.tumble <= 0) for (const rp of s.ramps) {
      if (rp.z > p.z) break;
      if (rp.z > z0 && Math.abs(p.x - rp.x) < rp.w) { p.air = 'ramp'; p.vy = rampVy(p.v); p.rot = 0; p.grab = 0; p.airT = 0; p.y = 1.1; ev.push({ type: 'launch', rp }); break; }
    }
    // ── in the air, and coming down
    if (p.air) {
      p.airT += dt; p.vy -= GRAV * dt; p.y += p.vy * dt;
      if (p.y <= 0) {
        const how = p.air, turns = Math.abs(p.rot) / (2 * Math.PI), off = Math.abs(turns - Math.round(turns)) * 2 * Math.PI, spins = Math.round(turns);
        p.y = 0; p.vy = 0; p.air = '';
        if (how === 'ramp' && off > LAND_OK) {
          p.tumble = TUMBLE_T; p.safe = SAFE_T; p.spin = 0; this.tumbles++;
          ev.push({ type: 'tumble', bad: true });
        } else if (how === 'ramp') {
          const grab = p.grab >= 0.4;
          if (spins > 0 || grab) { p.boost = BOOST_T; ev.push({ type: 'trick', spins, grab, air: p.airT }); } else ev.push({ type: 'land', air: p.airT });
        }
        p.rot = 0; p.grab = 0;
      }
    }
    // ── crevasses: on the snow inside one, you are gone
    if (!p.air) for (const c of s.crevasses) {
      if (c.z > p.z) break;
      if (p.z > c.z + 0.3 && p.z < c.z + c.len - 0.3) { this.done = true; ev.push({ type: 'fell', c }); return ev; }
    }
    // ── trees and rocks
    const obs = s.obstacles;
    while (this.i0 < obs.length && obs[this.i0].z < p.z - 3) this.i0++;
    for (let i = this.i0; i < obs.length; i++) {
      const o = obs[i];
      if (o.z > p.z + 3) break;
      const dx = p.x - o.x, dz = p.z - o.z;
      if (o.hit && o.kind !== 'yeti') continue;          // a tree or rock you have crashed into stays down for the rest of the run
      if (o.kind === 'yeti') {
        if (o.flat) continue;
        if (p.air && p.y > STOMP_Y && p.y < 5 && Math.abs(dz) < 1.2 && Math.abs(dx) < o.r + PR) {      // down on its head: flattened, and a bounce
          o.flat = true; o.passed = true; p.air = 'hop'; p.vy = 7; p.rot = 0; p.grab = 0;
          ev.push({ type: 'stomp', o }); continue;
        }
        if (p.air && p.y >= 5) continue;
      }
      const over = o.kind !== 'yeti' && (p.air === 'ramp' || (o.kind === 'rock' && p.y > ROCK_HOP));       // flying over it
      if (over) { if (!o.passed && dz > 0.9) { o.passed = true; if (o.kind === 'rock' && Math.abs(dx) < o.r + PR) ev.push({ type: 'cleared', o }); } continue; }
      if (p.safe <= 0 && Math.abs(dz) < 0.9 && Math.abs(dx) < o.r + PR) {
        p.tumble = TUMBLE_T; p.safe = SAFE_T; p.spin = 0; this.tumbles++;
        p.vx = (dx >= 0 ? 1 : -1) * 5; o.hit = 1;
        if (p.air) { p.air = ''; p.y = 0; p.vy = 0; }
        ev.push({ type: 'tumble', o });
      } else if (!o.passed && dz > 0.9) {
        o.passed = true;
        if (p.tumble <= 0 && p.safe <= 0 && Math.abs(dx) < o.r + PR + 0.9) ev.push({ type: 'near', o });
      }
    }
    // ── crystals
    for (const c of s.crystals) {
      if (c.got || c.z < p.z - 2) continue;
      if (c.z > p.z + 2) break;
      if (Math.abs(c.x - p.x) < 1.3 && Math.abs(c.z - p.z) < 1.4 && Math.abs((c.y || 0.9) - 0.9 - p.y) < 2.2) { c.got = true; ev.push({ type: 'crystal', c }); }
    }
    if (s.bonus) return ev;
    this.creatures(dt, ev);
    // ── the flag, the hut, the avalanche
    if (!this.flagged && p.z >= s.flagZ) { this.flagged = true; ev.push({ type: 'flag' }); }
    if (p.z >= s.len) { this.done = true; ev.push({ type: 'hut', gap: this.gap }); return ev; }
    this.az = Math.max(this.az + R.avalanche * dt, p.z - MAX_GAP);
    if (this.az >= p.z - CAUGHT) { this.done = true; ev.push({ type: 'caught' }); }
    return ev;
  }
}

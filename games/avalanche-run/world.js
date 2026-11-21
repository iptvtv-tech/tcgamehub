// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — the rules (pure: no drawing, no sound, no engine). Shared by game.js, check.mjs,
//  test.mjs and bench.mjs.
//
//  SIDE-ON (rebuilt 21 Nov 2026 at the owner's request: the view from behind the sled never read as
//  downhill and hid the avalanche). You see the mountain from the side: x is metres along the run,
//  y is height (up is positive), and the snow falls away to the right. The sled rides the snow,
//  leaves it at kickers and drops, and flies as a thrown stone does.
//
//    JUMP   a hop: over a rock, over a narrow crack
//    ◀ ▶    in the air: backflip / front flip. Let go and the sled levels itself.
//    TUCK   on the snow: faster. In the air: a grab (a trick).
//
//  Land within LAND_OK of the snow's own angle or it is a tumble. A tumble costs ground, never a
//  life. Only the avalanche or a crevasse costs a life, and you start again from the flag.
//  The avalanche never falls far behind: beyond CHASE metres it keeps pace with the sled.
// ─────────────────────────────────────────────────────────────
export const FINAL_LEVEL = 15;
export const BONUS_LEVELS = [5, 10];

export const GRAV = 20;              // m/s²
export const TAU = Math.PI * 2;
export const HOP = 8.5;              // a jump's push off the snow (m/s, square to the snow)
export const SPIN = 8.6;             // flip speed, radians a second (a full flip in 0.73 s)
export const RIGHTING = 5;           // with the buttons let go, the sled levels itself this fast (rad/s)
export const LAND_OK = 0.8;          // land within this of the snow's angle (about 46°)
export const TUCK = 1.15;            // tucked: this much faster
export const BOOST = 1.22;           // after a landed trick: this much faster …
export const BOOST_T = 1.8;          // … for this long (s)
export const GRAB_T = 0.25;          // hold a grab this long for it to count (s)
export const TUMBLE_T = 0.7;         // seconds of tumbling
export const TUMBLE_V = 0.4;         // … at this share of cruising speed
export const SAFE_T = 1.5;           // nothing can knock you down again for this long
export const START_GAP = 16;         // the avalanche starts this far behind (m)
export const CHASE = 18;             // further behind than this, the avalanche keeps pace with you
export const MAX_GAP = 22;           // … and it is never further behind than this
export const MERCY_GAP = 4;          // each life lost on a run: this much more room at the restart
export const CLEAR_START = 50;       // plain snow after the start line and the flag (m)
export const GAP_CLEAR = 40;         // nothing to trip on for this far before a crevasse
export const KICK_L = 7;             // a kicker's length (m)
export const ROCK_R = 0.9;           // a rock: half its length …
export const ROCK_H = 1.0;           // … and its height (m)
export const REACH = 1.7;            // the sled picks up a crystal this close (m)
export const BACK = 90;              // snow behind the start line, for the eye and the avalanche (m)
export const AHEAD = 140;            // … and past the hut

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** An angle brought into −π..π. */
export const wrap = (a) => { a = (a + Math.PI) % TAU; return (a < 0 ? a + TAU : a) - Math.PI; };

/** What a run asks for. */
export function runFor(level) {
  const n = level, cruise = Math.min(25, 16 * Math.pow(1.032, n - 1));
  return {
    level: n,
    cruise,                                           // m/s along the snow
    top: cruise * TUCK * BOOST * 1.12,                 // the fastest it can ride (tucked, boosted, on a steep pitch)
    acc: cruise * 0.75,                               // picking up speed takes the same time on every run
    len: 850 + 65 * n,                                // metres along to the hut
    avalanche: cruise * (0.88 + 0.014 * n),            // from run 10 it is faster than a sled that only cruises: tuck, and land tricks
    grade: 0.42 + 0.011 * n,                          // how steep (fall per metre along)
    every: 60 - n,                                    // metres between things, about
    rocks: n < 2 ? 0 : Math.min(5, 1 + Math.floor(n / 3)),
    cracks: n < 6 ? 0 : Math.min(3, Math.floor((n - 3) / 3)),            // narrow: jump them
    crevasses: n < 3 ? 0 : Math.min(3, 1 + Math.floor((n - 3) / 4)),     // wide: a kicker at the edge
  };
}

// ── The snow ─────────────────────────────────────────────────
/** Height of the snow at x (as if there were no cracks in it). */
export function snowAt(sl, x) {
  const f = clamp(x + BACK, 0, sl.H.length - 1.001), i = Math.floor(f);
  return lerp(sl.H[i], sl.H[i + 1], f - i);
}
/** Its slope at x (rise per metre along: negative is downhill). */
export function gradeAt(sl, x) {
  const i = Math.floor(clamp(x + BACK, 0, sl.H.length - 1.001));
  return sl.H[i + 1] - sl.H[i];
}
/** How the snow lies around x, taken over the length of the sled (so a kicker's lip is not a cliff to land on). */
export function lieAt(sl, x) { return (snowAt(sl, x + 1.5) - snowAt(sl, x - 1.5)) / 3; }
/** The crevasse or crack x is over, or null. */
export function gapAt(sl, x) {
  for (const c of sl.gaps) if (x > c.x && x < c.x + c.w) return c;
  return null;
}

/** A thrown sled: from (x, y) with speed (vx, vy) until it comes down on the snow. Returns where,
 *  after how long, and whether it came down in a crevasse. `gaps: false` flies as if there were none. */
export function fly(sl, x, y, vx, vy, gaps = true) {
  const dt = 1 / 120, x0 = x; let t = 0, sunk = false;
  while (t < 8) {
    vy -= GRAV * dt; x += vx * dt; y += vy * dt; t += dt;
    const over = gaps && gapAt(sl, x), g = snowAt(sl, x);
    if (over) { if (y < g - 0.2) sunk = true; if (y < g - 3) return { x, t, far: x - x0, fell: true }; continue; }
    if (y <= g) return { x, t, far: x - x0, fell: sunk };
  }
  return { x, t, far: x - x0, fell: true };
}
/** Speed (vx, vy) of a sled riding the snow at x at v m/s, with a hop's push if it jumps there. */
export function launch(sl, x, v, hop = false) {
  const g = gradeAt(sl, x - 0.01), n = Math.hypot(1, g);
  return { vx: v / n + (hop ? HOP * -g / n : 0), vy: v * g / n + (hop ? HOP / n : 0) };
}

/** Build a run. All the dice are the seeded rng's. */
export function makeSlope(level, dice, bonus = false) {
  const rng = dice.next;
  const R = runFor(level), len = bonus ? 1400 : R.len, N = Math.ceil(BACK + len + AHEAD) + 2;
  const H = new Float32Array(N);
  // the pitch rolls: steeper here, easier there (knots every 55 m), and eases off at the hut
  const knots = []; for (let i = 0; i < N / 55 + 3; i++) knots.push(rng() * 2 - 1);
  const pitch = (x) => {
    const f = Math.max(0, (x + BACK) / 55), i = Math.floor(f), k = (1 - Math.cos((f - i) * Math.PI)) / 2;
    let g = R.grade * (1 + 0.34 * lerp(knots[i], knots[i + 1], k));
    if (x > len - 40) g = lerp(g, 0.1, clamp((x - (len - 40)) / 40, 0, 1));
    return g;
  };
  for (let i = 1; i < N; i++) H[i] = H[i - 1] - pitch(i - BACK);
  const sl = { level, bonus, R, len, H, kickers: [], gaps: [], rocks: [], crystals: [], flagX: Math.round(len / 2) };

  // What stands where: mostly kickers; a few crevasses, cracks and rocks, never more than two of
  // those in a row. They are dealt out as the run is laid, so that every one of them finds a place.
  const todo = [];
  if (!bonus) {
    for (let i = 0; i < R.crevasses; i++) todo.push('crevasse');
    for (let i = 0; i < R.cracks; i++) todo.push('crack');
    for (let i = 0; i < R.rocks; i++) todo.push('rock');
    for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; }
  }
  // Placed one after another down the run. A rock, crack or crevasse never stands where a flight
  // off the kicker before it can come down, however fast the sled was (tucked, boosted), and
  // leaves room after that landing to see it and jump.
  const vmax = R.cruise * TUCK * BOOST * 1.12;
  // a kicker is as tall as it takes to throw a cruising sled for `secs` seconds
  const kicker = (x, secs, big) => {
    const snow = []; for (let k = 1; k <= KICK_L; k++) snow.push(H[x - KICK_L + k + BACK]);
    const build = (h) => { for (let k = 1; k <= KICK_L; k++) H[x - KICK_L + k + BACK] = snow[k - 1] + h * (k / KICK_L) ** 2; };
    const air = (v) => { const q = launch(sl, x, v); return fly(sl, x, snowAt(sl, x), q.vx, q.vy, false); };
    let lo = 0.5, hi = 5;
    for (let i = 0; i < 12; i++) { const h = (lo + hi) / 2; build(h); if (air(R.cruise).t < secs) lo = h; else hi = h; }
    const kk = { x, h: hi, big, far: air(vmax).far };
    sl.kickers.push(kk); return kk;
  };
  // where a jump taken at x at full speed comes down
  const hopLands = (at) => { const q = launch(sl, at, vmax, true); return fly(sl, at, snowAt(sl, at), q.vx, q.vy, false).x; };
  const every = bonus ? 40 : R.every;
  let x = CLEAR_START + 14 + rng() * 10, lands = 0, passedFlag = false, inRow = 0, farAvg = vmax * 2;
  for (let i = 0; x < len - 85; i++) {
    // deal them out at random while there is room to spare, and one after another once there is not
    // (after a kicker, a rock, crack or crevasse has to wait for the whole of that kicker's longest flight)
    const each = every * 1.15 + farAvg * 0.5 + 38, room = len - 95 - x - (passedFlag ? 0 : CLEAR_START + 60);
    let kind = 'kicker';
    if (i > 0 && inRow < 2 && todo.length && (room <= (todo.length + 1) * each || rng() < todo.length * each * 1.3 / Math.max(1, room))) kind = todo.pop();
    inRow = kind === 'kicker' ? 0 : inRow + 1;
    if (kind !== 'kicker') x = Math.max(x, lands + (kind === 'crevasse' ? 22 : 15));
    if (!passedFlag && x > sl.flagX - 45) { passedFlag = true; x = Math.max(x, sl.flagX + CLEAR_START + 12 + rng() * 8); }
    if (x >= len - 85) break;
    x = Math.round(x);
    let next = x;
    if (kind === 'rock') {
      sl.rocks.push({ x, v: Math.floor(rng() * 3) });
      const second = Math.round(Math.max(hopLands(x - vmax * 0.3), hopLands(x)) + 20);
      if (level >= 9 && rng() < 0.5 && second < len - 90 && (second < sl.flagX - 45 || x > sl.flagX)) { next = second; sl.rocks.push({ x: next, v: Math.floor(rng() * 3) }); }   // a second, a jump and a landing later
      lands = Math.max(hopLands(next), hopLands(next - vmax * 0.3));
    } else if (kind === 'crack') {
      sl.gaps.push({ x, w: 5 + Math.round(rng() * 2) * 0.5, crack: true });
      lands = hopLands(x) + 4;
    } else {
      const big = kind === 'crevasse', k = kicker(x, (0.95 + 0.02 * level) * (big ? 1.25 : 0.85 + rng() * 0.35), big);
      if (big) {
        // as wide as a slow sled (one that has just tumbled and picked itself up) still clears with room
        const slow = launch(sl, x, R.cruise * 0.7), f = fly(sl, x, snowAt(sl, x), slow.vx, slow.vy, false);
        const gap = { x: x + 1, w: clamp(Math.floor(f.far - 5), 6, 9 + Math.floor(rng() * 5)), crack: false };
        sl.gaps.push(gap); k.gap = gap;
      }
      lands = x + k.far; farAvg = k.far;
    }
    x = next + every * (0.9 + rng() * 0.45);
  }
  sl.gaps.sort((a, b) => a.x - b.x);

  // crystals: an arc along each kicker's flight, a hop's arc over each crack, lines on the snow between
  const arc = (x, v, hop, n) => {
    const q = launch(sl, x, v, hop), f = fly(sl, x, snowAt(sl, x), q.vx, q.vy, false);
    for (let i = 1; i <= n; i++) { const t = f.t * i / (n + 1); sl.crystals.push({ x: x + q.vx * t, y: snowAt(sl, x) + q.vy * t - GRAV * t * t / 2 + 0.9 }); }
  };
  for (const k of sl.kickers) arc(k.x, R.cruise, false, bonus ? 7 : 5);
  for (const c of sl.gaps) if (c.crack) arc(c.x - 1.5, R.cruise, true, 3);
  for (const k of sl.kickers) {                       // a line on the snow leading up to some kickers
    if (!bonus && rng() < 0.5) continue;
    for (let j = 0; j < 4; j++) { const cx = k.x - KICK_L - 5 - j * 3.2; if (cx > 30 && !gapAt(sl, cx) && !sl.rocks.some((r) => Math.abs(r.x - cx) < 6)) sl.crystals.push({ x: cx, y: snowAt(sl, cx) + 0.9 }); }
  }
  for (let k = 0; k < 6; k++) { const x = 20 + k * 4; sl.crystals.push({ x, y: snowAt(sl, x) + 0.9 }); }
  sl.crystals.sort((a, b) => a.x - b.x);
  sl.rocks.sort((a, b) => a.x - b.x);
  return sl;
}

// ── The ride ─────────────────────────────────────────────────
export class SlopeSim {
  constructor(slope) {
    this.sl = slope; this.R = slope.R; this.bonus = slope.bonus;
    this.flagged = false; this.lost = 0; this.tumbles = 0; this.flips = 0; this.t = 0;
    this.p = {}; this.place(0);
  }
  /** Put the sled on the snow at x at cruising speed, the avalanche START_GAP behind (more after lost lives). */
  place(x) {
    const sl = this.sl;
    Object.assign(this.p, { x, y: snowAt(sl, x), v: this.R.cruise, vx: 0, vy: 0, air: false, from: '', airT: 0, rot: Math.atan(gradeAt(sl, x)),
      turned: 0, grab: 0, tumble: 0, safe: 0, boost: 0, tuck: false, sunk: false, buf: 0, spin: 0, g0: null });
    this.room = Math.min(3, this.lost) * MERCY_GAP;
    this.az = x - START_GAP - this.room; this.gap = START_GAP + this.room;
    this.done = false; this.jumpHeld = false;
  }
  /** After a lost life: back to the start line, or the flag once passed. */
  reset() {
    this.lost++;
    this.place(this.flagged ? this.sl.flagX : 0);
  }
  tumbleNow(ev, why) {
    const p = this.p;
    p.tumble = TUMBLE_T; p.safe = TUMBLE_T + SAFE_T; p.boost = 0; p.v = Math.min(p.v, this.R.cruise * TUMBLE_V); p.spin = 0;
    this.tumbles++; ev.push({ type: 'tumble', ...why });
  }

  /** One step. inp = { dir: −1 (◀) | 0 | 1 (▶), tuck, jump }. Returns what happened. */
  step(inp, dt) {
    const ev = [], sl = this.sl, R = this.R, p = this.p;
    if (this.done) return ev;
    this.t += dt;
    if (p.safe > 0) p.safe -= dt;
    if (p.boost > 0) p.boost -= dt;
    if (p.tumble > 0) { p.tumble -= dt; p.spin += dt * 13; }
    if (inp.jump && !this.jumpHeld) p.buf = 0.12; else if (p.buf > 0) p.buf -= dt;      // (a press a moment early still counts)
    this.jumpHeld = !!inp.jump;
    p.tuck = !!inp.tuck && p.tumble <= 0;
    const x0 = p.x;

    if (!p.air) {
      // (over a lip the snow turns down sharply: the sled keeps the heading it had on the way up)
      const here = gradeAt(sl, p.x), lip = p.g0 != null && here < p.g0 - 0.25, g = lip ? p.g0 : here, n = Math.hypot(1, g);
      let want = R.cruise * (p.tuck ? TUCK : 1) * (p.boost > 0 ? BOOST : 1) * clamp(1 + 0.5 * (-g - R.grade), 0.9, 1.12);
      if (p.tumble > 0) want = R.cruise * TUMBLE_V;
      p.v = p.v < want ? Math.min(want, p.v + R.acc * dt) : Math.max(want, p.v - (p.tumble > 0 ? 40 : 12) * dt);
      const vx = p.v / n, vy = p.v * g / n, nx = p.x + vx * dt, over = gapAt(sl, nx), g1 = snowAt(sl, nx);
      if (p.buf > 0 && p.tumble <= 0) {                // a jump
        p.buf = 0; p.air = true; p.from = 'hop'; p.vx = vx + HOP * -g / n; p.vy = vy + HOP / n;
        ev.push({ type: 'hop' });
      } else if (lip || over || p.y + vy * dt - GRAV * dt * dt / 2 - g1 > 0.05) {      // the snow drops away faster than the sled falls
        const k = sl.kickers.find((q) => Math.abs(q.x - p.x) < 1.5);
        p.air = true; p.from = k ? 'kicker' : 'drop'; p.vx = vx; p.vy = vy;
        if (k) ev.push({ type: 'launch', k });
      } else { p.x = nx; p.y = g1; p.rot = Math.atan(gradeAt(sl, nx)); p.g0 = here; }
      if (p.air) { p.g0 = null; p.airT = 0; p.turned = 0; p.grab = 0; p.sunk = false; }
    }
    if (p.air) {
      p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.airT += dt;
      const g = snowAt(sl, p.x), ang = Math.atan(lieAt(sl, p.x));
      if (p.tumble <= 0) {
        if (inp.dir) { const d = -inp.dir * SPIN * dt; p.rot += d; p.turned += d; }
        else { const off = wrap(p.rot - ang); p.rot -= Math.sign(off) * Math.min(Math.abs(off), RIGHTING * dt); }
        if (inp.tuck) p.grab += dt;
      }
      const over = gapAt(sl, p.x);
      if (over) {
        if (p.y < g - 0.2) p.sunk = true;
        if (p.y < g - 3) { this.done = true; ev.push({ type: 'fell', gap: over }); return ev; }
      } else if (p.y <= g) {
        if (p.sunk) { this.done = true; ev.push({ type: 'fell' }); return ev; }
        const n = Math.hypot(1, Math.tan(ang)), along = (p.vx + p.vy * Math.tan(ang)) / n;
        const flips = Math.floor((Math.abs(p.turned) + LAND_OK) / TAU), grab = p.grab >= GRAB_T, off = wrap(p.rot - ang);
        p.air = false; p.y = g; p.v = clamp(along, R.cruise * TUMBLE_V, R.top);
        if (p.tumble > 0) { /* still tumbling: it just comes down */ }
        else if (Math.abs(off) > LAND_OK) this.tumbleNow(ev, { bad: true });
        else if ((flips > 0 || grab) && p.airT > 0.3) {
          p.boost = BOOST_T; this.flips += flips;
          ev.push({ type: 'trick', flips, back: p.turned > 0, grab, airT: p.airT });
        } else if (p.airT > 0.25) ev.push({ type: 'land', airT: p.airT });
        p.rot = ang; p.turned = 0; p.grab = 0;
      }
    }

    // rocks: a tumble on the snow or low over it; cleared in the air
    for (const r of sl.rocks) {
      if (r.x < x0 - 2 || r.hit) continue;
      if (r.x > p.x + 2) break;
      if (Math.abs(p.x - r.x) < ROCK_R + 0.5 && p.y - snowAt(sl, p.x) < ROCK_H) {
        if (p.safe <= 0 && p.tumble <= 0) { r.hit = true; if (p.air) { p.vy = Math.max(p.vy, 3); } this.tumbleNow(ev, { by: 'rock', r }); }
      } else if (!r.passed && p.x > r.x + ROCK_R + 0.5) { r.passed = true; if (p.air) ev.push({ type: 'cleared', r }); }
    }
    for (const c of sl.crystals) {
      if (c.got || c.x < x0 - REACH) continue;
      if (c.x > p.x + REACH) break;
      if (Math.abs(c.y - (p.y + 0.9)) < REACH) { c.got = true; ev.push({ type: 'crystal', c }); }
    }
    if (!this.flagged && p.x >= sl.flagX) { this.flagged = true; ev.push({ type: 'flag' }); }

    // the avalanche: it keeps to its own speed, but never lets you get far ahead
    if (!this.bonus) {
      let av = R.avalanche / Math.hypot(1, R.grade);          // (its speed along the snow, seen from the side)
      if (this.gap > CHASE + this.room) av = Math.max(av, (p.x - x0) / dt);
      this.az = Math.max(this.az + av * dt, p.x - MAX_GAP - this.room);
      this.gap = p.x - this.az;
    }
    if (p.x >= sl.len && !p.air) { this.done = true; ev.push({ type: 'hut', gap: this.gap }); return ev; }
    if (!this.bonus && this.gap <= 0 && p.x < sl.len) { this.done = true; ev.push({ type: 'caught' }); }
    return ev;
  }
}

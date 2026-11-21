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
export const BOOST = 1.3;            // after a landed trick: this much faster …
export const TOP = 1.5;              // however it adds up, never faster than this share of cruising speed
export const BOOST_T = 1.8;          // … for this long (s)
/** The bigger the trick, the bigger the boost: one trick, two (a double flip, or a flip with a superman or a sword spin), three or more. */
export const BOOSTS = [{ k: BOOST, t: BOOST_T }, { k: 1.38, t: 2.6 }, { k: 1.45, t: 3.4 }];
export const RUSH_AFTER = 3;         // tricks landed off this many kickers in a row …
export const RUSH_T = 3.5;           // … is a rush: this long at top speed, and the avalanche thrown as far back as it goes
export const ROCKET_T = 3;           // a rocket: this long at top speed (s)
export const LETTERS = 'SLED';       // four letters hang along every run
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
/** Kickers come in four sizes: how long the kicker is (m), and how long it throws a cruising sled, as a share of the run's usual flight. */
export const KICKS = { small: { L: 6, air: 0.8 }, mid: { L: 8, air: 1.1 }, big: { L: 11, air: 1.7 }, huge: { L: 14, air: 2.35 } };
export const LIP_MAX = 1.25;         // a kicker throws the sled no faster than this share of cruising speed (so no flight is endless)
export const SLASH_T = 0.28;         // a swing of the sword lasts this long (s) …
export const SLASH_COOL = 0.42;      // … and the next can start this long after it began
export const SLASH_REACH = 4;        // it reaches this far ahead of the sled (m)
export const YETI_R = 1.3;           // a yeti: half its width …
export const YETI_H = 2.8;           // … and its height (m)
export const THROW_EVERY = 1.7;      // a yeti throws a snowball this often (s) …
export const THROW_T = 0.95;         // … and it takes this long to reach the sled
export const BALL_R = 1.3;           // a snowball hits the sled this close (m)
export const STOMP_UP = 7;           // landing on a yeti's head bounces the sled up (m/s)
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
  const n = level, cruise = Math.min(28, 18 * Math.pow(1.032, n - 1));
  return {
    level: n,
    cruise,                                           // m/s along the snow
    top: cruise * TOP,                                // the fastest it can ride (tucked, boosted, on a steep pitch)
    acc: cruise * 0.75,                               // picking up speed takes the same time on every run
    len: 950 + 75 * n,                                // metres along to the hut
    avalanche: cruise * (0.88 + 0.014 * n),            // from run 10 it is faster than a sled that only cruises: tuck, and land tricks
    grade: 0.42 + 0.011 * n,                          // how steep (fall per metre along)
    every: 60 - n,                                    // metres between things, about
    rocks: n < 2 ? 0 : Math.min(5, 1 + Math.floor(n / 3)),
    cracks: n < 6 ? 0 : Math.min(3, Math.floor((n - 3) / 3)),            // narrow: jump them
    yetis: n < 4 ? 0 : Math.min(4, 1 + Math.floor((n - 4) / 3)),         // swing the sword, or land on its head
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
/** The pitch of the mountainside itself at x: no kickers, no drops. */
export function pitchAt(sl, x) { return sl.P[Math.floor(clamp(x + BACK, 0, sl.P.length - 1))]; }
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
export function makeSlope(level, dice, bonus = false, squeeze = 0) {
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
  const P = new Float32Array(N);                      // the pitch of the mountainside itself, before anything is built on it
  for (let i = 1; i < N; i++) { P[i] = -pitch(i - BACK); H[i] = H[i - 1] + P[i]; }
  const sl = { level, bonus, R, len, H, P, kickers: [], gaps: [], rocks: [], yetis: [], crystals: [], flagX: Math.round(len / 2) };

  // What stands where: mostly kickers; a few crevasses, cracks and rocks, never more than two of
  // those in a row. They are dealt out as the run is laid, so that every one of them finds a place.
  const todo = [];
  if (!bonus) {
    for (let i = 0; i < R.crevasses; i++) todo.push('crevasse');
    for (let i = 0; i < R.cracks; i++) todo.push('crack');
    for (let i = 0; i < R.rocks; i++) todo.push('rock');
    for (let i = 0; i < R.yetis; i++) todo.push('yeti');
    for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; }
  }
  // Placed one after another down the run. A rock, crack or crevasse never stands where a flight
  // off the kicker before it can come down, however fast the sled was (tucked, boosted), and
  // leaves room after that landing to see it and jump.
  const vmax = R.top;
  // A kicker is as tall as it takes to throw a cruising sled for its size's time in the air, but never
  // so steep that it throws the sled more up than along. Where that is not enough (the big ones), the
  // mountainside steps down behind its lip: a drop, so the sled flies far out over lower snow.
  const kicker = (x, size, big) => {
    const L = KICKS[size].L, secs = (big ? 1.25 : KICKS[size].air) * (0.94 + rng() * 0.12);
    const snow = []; for (let k = 1; k <= L; k++) snow.push(H[x - L + k + BACK]);
    const build = (h) => { for (let k = 1; k <= L; k++) H[x - L + k + BACK] = snow[k - 1] + h * (k / L) ** 2; };
    const air = (v) => { const q = launch(sl, x, v); return fly(sl, x, snowAt(sl, x), q.vx, q.vy, false); };
    const steep = Math.max(0.6, L * (pitch(x) + 0.1) / 2);      // (at this height the lip points a little above level)
    let lo = 0.4, hi = big ? 12 : steep;
    for (let i = 0; i < 14; i++) { const h = (lo + hi) / 2; build(h); if (air(R.cruise).t < secs) lo = h; else hi = h; }
    build(hi);
    let drop = 0;
    if (!big && air(R.cruise).t < secs - 0.03) {
      const rest = H.slice(x + 1 + BACK), lower = (d) => { for (let i = 0; i < rest.length; i++) H[x + 1 + BACK + i] = rest[i] - d; };
      let a0 = 0, a1 = 45;
      for (let i = 0; i < 14; i++) { const d = (a0 + a1) / 2; lower(d); if (air(R.cruise).t < secs) a0 = d; else a1 = d; }
      drop = a1; lower(drop);
    }
    const kk = { x, L, size, h: hi, drop, big, far: air(R.cruise * LIP_MAX).far };
    sl.kickers.push(kk); return kk;
  };
  const sizes = level < 2 ? ['small', 'mid', 'mid', 'big'] : level < 4 ? ['small', 'mid', 'big', 'big'] : ['small', 'mid', 'big', 'big', 'huge'];
  // where a jump taken at x at full speed comes down
  const hopLands = (at) => { const q = launch(sl, at, vmax, true); return fly(sl, at, snowAt(sl, at), q.vx, q.vy, false).x; };
  const every = (bonus ? 40 : R.every) * (1 - 0.15 * squeeze);
  // (the sizes are dealt like cards, so every run has all of them)
  let deck = [];
  const deal = () => { if (!deck.length) { deck = [...sizes]; for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } } return deck.pop(); };
  let x = CLEAR_START + 18 + rng() * 10, lands = 0, ends = 0, passedFlag = false, inRow = 0, farAvg = vmax * 2;
  for (let i = 0; x < len - 85; i++) {
    // deal them out at random while there is room to spare, and one after another once there is not
    // (after a kicker, a rock, crack or crevasse has to wait for the whole of that kicker's longest flight)
    const each = every * 1.15 + farAvg * 0.5 + 55, room = len - 95 - x - (passedFlag ? 0 : CLEAR_START + 60);
    let kind = 'kicker';
    if (i > 0 && inRow < 2 && todo.length && (room <= (todo.length + 1) * each * 1.25 || rng() < todo.length * each * 1.3 / Math.max(1, room))) kind = todo.pop();
    inRow = kind === 'kicker' ? 0 : inRow + 1;
    // (where the run is getting short of room for what is still to come, the kickers are the smaller ones)
    const tight = todo.length && room <= (todo.length + 1) * each * 1.6;
    const size = kind === 'crevasse' ? 'big' : tight ? deal().replace('huge', 'small') : deal();
    if (kind !== 'kicker') x = Math.max(x, lands + (kind === 'crevasse' ? 22 + KICKS.big.L : 15));
    else x = Math.max(x, ends + KICKS[size].L + 6);         // (room for its run-up after the thing before it)
    if (!passedFlag && x > sl.flagX - 45) { passedFlag = true; x = Math.max(x, sl.flagX + CLEAR_START + 18 + rng() * 8); }
    if (x >= len - 85) { if (kind !== 'kicker') todo.push(kind); break; }
    x = Math.round(x);
    let next = x;
    if (kind === 'rock') {
      sl.rocks.push({ x, v: Math.floor(rng() * 3) });
      const second = Math.round(Math.max(hopLands(x - vmax * 0.3), hopLands(x)) + 20);
      if (level >= 9 && rng() < 0.5 && second < len - 90 && (second < sl.flagX - 45 || x > sl.flagX)) { next = second; sl.rocks.push({ x: next, v: Math.floor(rng() * 3) }); }   // a second, a jump and a landing later
      lands = Math.max(hopLands(next), hopLands(next - vmax * 0.3));
    } else if (kind === 'yeti') {
      sl.yetis.push({ x });
      lands = Math.max(hopLands(x), hopLands(x - vmax * 0.3));
    } else if (kind === 'crack') {
      sl.gaps.push({ x, w: 5 + Math.round(rng() * 2) * 0.5, crack: true });
      lands = hopLands(x) + 4;
    } else {
      const big = kind === 'crevasse', k = kicker(x, size, big);
      if (big) {
        // as wide as a slow sled (one that has just tumbled and picked itself up) still clears with room
        const slow = launch(sl, x, R.cruise * 0.7), f = fly(sl, x, snowAt(sl, x), slow.vx, slow.vy, false);
        const gap = { x: x + 1, w: clamp(Math.floor(f.far - 5), 6, 9 + Math.floor(rng() * 5)), crack: false };
        sl.gaps.push(gap); k.gap = gap;
      }
      lands = x + k.far; farAvg = k.far;
    }
    ends = Math.max(next, kind === 'crevasse' ? x + 16 : next) + 2;
    x = next + every * (0.9 + rng() * 0.45);
  }
  // (not everything found a place: lay the run again, a little closer together)
  if (todo.length && squeeze < 3) return makeSlope(level, dice, bonus, squeeze + 1);
  sl.gaps.sort((a, b) => a.x - b.x);

  // crystals: an arc along each kicker's flight, a hop's arc over each crack, lines on the snow between
  const arc = (x, v, hop, n) => {
    const q = launch(sl, x, v, hop), f = fly(sl, x, snowAt(sl, x), q.vx, q.vy, false);
    for (let i = 1; i <= n; i++) { const t = f.t * i / (n + 1); sl.crystals.push({ x: x + q.vx * t, y: snowAt(sl, x) + q.vy * t - GRAV * t * t / 2 + 0.9 }); }
  };
  for (const k of sl.kickers) {
    const from = sl.crystals.length; arc(k.x, R.cruise, false, bonus ? 7 : 5);
    // a golden crystal at the top of the flight off every huge kicker, and off some of the big ones
    if (k.size === 'huge' || (k.size === 'big' && !k.big && rng() < 0.35)) sl.crystals[from + (bonus ? 3 : 2)].gold = true;
  }
  if (!sl.crystals.some((c) => c.gold)) {             // (every run has one at least: over its biggest kicker)
    const k = [...sl.kickers].filter((q) => !q.big).sort((a, b) => b.far - a.far)[0], at = sl.crystals.filter((c) => c.x > k.x && c.x < k.x + k.far);
    if (at.length) at[Math.floor(at.length / 2)].gold = true;
  }
  for (const c of sl.gaps) if (c.crack) arc(c.x - 1.5, R.cruise, true, 3);
  for (const k of sl.kickers) {                       // a line on the snow leading up to some kickers
    if (!bonus && rng() < 0.5) continue;
    for (let j = 0; j < 4; j++) { const cx = k.x - k.L - 5 - j * 3.2; if (cx > 30 && !gapAt(sl, cx) && !sl.rocks.some((r) => Math.abs(r.x - cx) < 6) && !sl.yetis.some((r) => Math.abs(r.x - cx) < 6)) sl.crystals.push({ x: cx, y: snowAt(sl, cx) + 0.9 }); }
  }
  for (let k = 0; k < 6; k++) { const x = 20 + k * 4; sl.crystals.push({ x, y: snowAt(sl, x) + 0.9 }); }
  // things to pick up: rockets on the snow, and the four letters, each in the air just past a kicker's lip
  sl.items = [];
  if (!bonus) {
    const clear = (x) => x > CLEAR_START && Math.abs(x - sl.flagX) > 30 && x < len - 70 && !gapAt(sl, x) && !sl.rocks.some((r) => Math.abs(r.x - x) < 14) && !sl.yetis.some((r) => Math.abs(r.x - x) < 14) && !sl.gaps.some((c) => x > c.x - 40 && x < c.x + c.w + 6);
    const plain = sl.kickers.filter((k) => !k.big);
    for (let n = level < 2 ? 0 : 2 + (level > 8 ? 1 : 0), tries = 0; n > 0 && tries < 60; tries++) {
      const k = plain[Math.floor(rng() * plain.length)], x = k.x - k.L - 16;
      if (!clear(x) || sl.items.some((q) => Math.abs(q.x - x) < 120)) continue;
      sl.items.push({ kind: 'rocket', x, y: snowAt(sl, x) + 1 }); n--;
    }
    for (let i = 0; i < LETTERS.length; i++) {
      const want = len * (0.14 + 0.2 * i), k = plain.filter((q) => !q.letter).sort((a, b) => Math.abs(a.x - want) - Math.abs(b.x - want))[0];
      const q = launch(sl, k.x, R.cruise), f = fly(sl, k.x, snowAt(sl, k.x), q.vx, q.vy, false), t = Math.min(0.3, f.t * 0.25);      // (early in the flight, where a fast sled and a slow one are still close together)
      k.letter = true;
      sl.items.push({ kind: 'letter', ch: LETTERS[i], x: k.x + q.vx * t, y: snowAt(sl, k.x) + q.vy * t - GRAV * t * t / 2 + 1.6 });
    }
    sl.items.sort((a, b) => a.x - b.x);
  }
  sl.crystals.sort((a, b) => a.x - b.x);
  sl.rocks.sort((a, b) => a.x - b.x);
  return sl;
}

// ── The ride ─────────────────────────────────────────────────
export class SlopeSim {
  constructor(slope) {
    this.sl = slope; this.R = slope.R; this.bonus = slope.bonus;
    this.flagged = false; this.lost = 0; this.tumbles = 0; this.flips = 0; this.slain = 0; this.t = 0; this.balls = [];
    this.p = {}; this.place(0);
  }
  /** Put the sled on the snow at x at cruising speed, the avalanche START_GAP behind (more after lost lives). */
  place(x) {
    const sl = this.sl;
    Object.assign(this.p, { x, y: snowAt(sl, x), v: this.R.cruise, vx: 0, vy: 0, air: false, from: '', airT: 0, rot: Math.atan(gradeAt(sl, x)),
      turned: 0, grab: 0, sup: 0, swordSpin: false, tumble: 0, safe: 0, boost: 0, boostK: 1, rush: 0, rocket: 0, streak: 0, tuck: false, sunk: false, buf: 0, spin: 0 });
    this.room = Math.min(3, this.lost) * MERCY_GAP;
    this.az = x - START_GAP - this.room; this.gap = START_GAP + this.room;
    this.done = false; this.jumpHeld = false; this.slashHeld = false; this.balls = []; this.quiet = 1.5;
    Object.assign(this.p, { atk: 0, cool: 0 });
    for (const y of this.sl.yetis) y.wait = 0.25;
  }
  /** After a lost life: back to the start line, or the flag once passed. */
  reset() {
    this.lost++;
    this.place(this.flagged ? this.sl.flagX : 0);
  }
  tumbleNow(ev, why) {
    const p = this.p;
    p.tumble = TUMBLE_T; p.safe = TUMBLE_T + SAFE_T; p.boost = 0; p.rush = 0; p.rocket = 0; p.streak = 0; p.v = Math.min(p.v, this.R.cruise * TUMBLE_V); p.spin = 0;
    this.tumbles++; ev.push({ type: 'tumble', ...why });
  }

  /** Yetis and their snowballs. */
  creatures(dt, ev, x0) {
    const sl = this.sl, p = this.p, up = p.y - snowAt(sl, p.x), swing = p.atk > 0;
    let first = true;                                  // (only the nearest yeti still standing throws: one thing to answer at a time)
    for (const y of sl.yetis) {
      if (y.down || y.x < x0 - 3) continue;
      const d = y.x - p.x, nearest = first; first = false;
      if (d > 110) break;
      // the sword: anything within its reach while it swings
      if (swing && d > -1 && d < SLASH_REACH + YETI_R && up < YETI_H + 1.5) { y.down = true; y.slain = true; this.slain++; ev.push({ type: 'slain', y }); continue; }
      if (Math.abs(d) < YETI_R + 0.5 && up < YETI_H) {
        if (p.air && p.vy < 0 && up > YETI_H * 0.55) {                      // down onto its head
          y.down = true; y.flat = true; p.vy = STOMP_UP; p.turned = 0; p.grab = 0; p.airT = 0; p.from = 'hop'; ev.push({ type: 'stomp', y });
        } else if (p.safe <= 0 && p.tumble <= 0) { y.down = true; this.tumbleNow(ev, { by: 'yeti', y }); }
        else y.down = true;                                                 // (bowled over by a sled that cannot be hurt just now)
        continue;
      }
      // it throws at where the sled will be, unless the sled is flying, down, or only just put back
      y.arm = Math.max(0, (y.arm || 0) - dt);
      // (never so late that the snowball and the yeti arrive together: the sword needs a moment between swings)
      const soon = (p.x - x0) / dt * (THROW_T + 0.65);
      if (!nearest || d < soon || d > soon + 36 || this.quiet > 0 || this.balls.length) continue;
      y.wait -= dt;
      if (y.wait > 0 || p.air || p.tumble > 0 || p.safe > 0) continue;
      y.wait = THROW_EVERY; y.arm = 0.5;
      const bx = y.x - 1, by = snowAt(sl, y.x) + YETI_H, tx = p.x + (p.x - x0) / dt * THROW_T, ty = snowAt(sl, tx) + 1;
      const b = { x: bx, y: by, vx: (tx - bx) / THROW_T, vy: (ty - by) / THROW_T + GRAV * THROW_T / 2 };
      this.balls.push(b); ev.push({ type: 'throw', y, b });
    }
    for (const b of this.balls) {
      b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      const dx = b.x - p.x, dy = b.y - (p.y + 0.9);
      if (swing && dx > -1.5 && dx < SLASH_REACH + 1 && Math.abs(dy) < 3) { b.gone = true; ev.push({ type: 'parry', b }); }
      else if (Math.hypot(dx, dy) < BALL_R) { b.gone = true; if (p.safe <= 0 && p.tumble <= 0) this.tumbleNow(ev, { by: 'ball', b }); else ev.push({ type: 'thud', b }); }
      else if (b.y < snowAt(sl, b.x) || dx < -25) { b.gone = true; ev.push({ type: 'thud', b }); }
    }
    if (this.balls.some((b) => b.gone)) this.balls = this.balls.filter((b) => !b.gone);
  }

  /** One step. inp = { dir: −1 (◀) | 0 | 1 (▶), tuck, jump, slash }. Returns what happened. */
  step(inp, dt) {
    const ev = [], sl = this.sl, R = this.R, p = this.p;
    if (this.done) return ev;
    this.t += dt;
    if (p.safe > 0) p.safe -= dt;
    if (p.boost > 0) p.boost -= dt;
    if (p.rush > 0) p.rush -= dt;
    if (p.rocket > 0) p.rocket -= dt;
    if (p.tumble > 0) { p.tumble -= dt; p.spin += dt * 13; }
    if (inp.jump && !this.jumpHeld) p.buf = 0.12; else if (p.buf > 0) p.buf -= dt;      // (a press a moment early still counts)
    this.jumpHeld = !!inp.jump;
    if (p.atk > 0) p.atk -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (inp.slash && !this.slashHeld && p.cool <= 0 && p.tumble <= 0) { p.atk = SLASH_T; p.cool = SLASH_COOL; if (p.air && p.airT > 0.1) p.swordSpin = true; ev.push({ type: 'slash', spin: p.air && p.airT > 0.1 }); }
    this.slashHeld = !!inp.slash;
    if (this.quiet > 0) this.quiet -= dt;
    p.tuck = !!inp.tuck && p.tumble <= 0;
    const x0 = p.x;

    if (!p.air) {
      // (over a lip the snow turns down sharply: the sled keeps the heading it had on the way up)
      const here = gradeAt(sl, p.x), was = gradeAt(sl, p.x - 0.7), lip = here < was - 0.25, g = lip ? was : here, n = Math.hypot(1, g);
      let want = R.cruise * (p.tuck ? TUCK : 1) * (p.boost > 0 ? p.boostK : 1) * clamp(1 + 0.5 * (-g - R.grade), 0.9, 1.12);
      if (p.rush > 0 || p.rocket > 0) want = R.top;
      want = Math.min(want, R.top);
      if (p.tumble > 0) want = R.cruise * TUMBLE_V;
      p.v = p.v < want ? Math.min(want, p.v + R.acc * dt) : Math.max(want, p.v - (p.tumble > 0 ? 40 : 12) * dt);
      const vx = p.v / n, vy = p.v * g / n, nx = p.x + vx * dt, over = gapAt(sl, nx), g1 = snowAt(sl, nx);
      if (p.buf > 0 && p.tumble <= 0) {                // a jump
        p.buf = 0; p.air = true; p.from = 'hop'; p.vx = vx + HOP * -g / n; p.vy = vy + HOP / n;
        ev.push({ type: 'hop' });
      } else if (lip || over || p.y + vy * dt - GRAV * dt * dt / 2 - g1 > 0.05) {      // the snow drops away faster than the sled falls
        const k = sl.kickers.find((q) => p.x > q.x - q.L && p.x < q.x + 1.5);
        const cap = k ? Math.min(1, R.cruise * LIP_MAX / p.v) : 1;      // (a kicker throws the sled no faster than LIP_MAX)
        p.air = true; p.from = k ? 'kicker' : 'drop'; p.vx = vx * cap; p.vy = vy * cap;
        if (k) ev.push({ type: 'launch', k });
      } else { p.x = nx; p.y = g1; p.rot = Math.atan(gradeAt(sl, nx)); }
      if (p.air) { p.airT = 0; p.turned = 0; p.grab = 0; p.sup = 0; p.swordSpin = false; p.sunk = false; }
    }
    if (p.air) {
      p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.airT += dt;
      // the sled levels itself to the mountainside as a whole; it may land flat to that, or flat to the snow right under it
      const g = snowAt(sl, p.x), ang = Math.atan(pitchAt(sl, p.x)), near = Math.atan(lieAt(sl, p.x));
      if (p.tumble <= 0) {
        if (inp.dir) { const d = -inp.dir * SPIN * dt; p.rot += d; p.turned += d; }
        else { const off = wrap(p.rot - ang); p.rot -= Math.sign(off) * Math.min(Math.abs(off), RIGHTING * dt); }
        if (inp.tuck && inp.jump && p.from !== 'hop') p.sup += dt; else if (inp.tuck) p.grab += dt;      // (TUCK and JUMP together off a kicker: the superman)
      }
      const over = gapAt(sl, p.x);
      if (over) {
        if (p.y < g - 0.2) p.sunk = true;
        if (p.y < g - 3) { this.done = true; ev.push({ type: 'fell', gap: over }); return ev; }
      } else if (p.y <= g) {
        if (p.sunk) { this.done = true; ev.push({ type: 'fell' }); return ev; }
        // (a skip off the snow keeps its speed; a real landing keeps what runs along the snow it lands on)
        const n = Math.hypot(1, Math.tan(near)), along = p.airT < 0.12 ? Math.hypot(p.vx, p.vy) : (p.vx + p.vy * Math.tan(near)) / n;
        const flips = Math.floor((Math.abs(p.turned) + LAND_OK) / TAU), grab = p.grab >= GRAB_T, superman = p.sup >= GRAB_T, off = Math.min(Math.abs(wrap(p.rot - ang)), Math.abs(wrap(p.rot - near)));
        p.air = false; p.y = g; p.v = clamp(along, R.cruise * TUMBLE_V, R.top);
        if (p.tumble > 0 || p.airT < 0.12) { /* still tumbling, or only a skip off the snow: it just comes down */ }
        else if (off > LAND_OK) this.tumbleNow(ev, { bad: true });
        else if (inp.tuck && inp.jump && superman) this.tumbleNow(ev, { bad: true, sup: true });      // still stretched out behind the sled
        else if ((flips > 0 || grab || superman || p.swordSpin) && p.airT > 0.3) {
          const tier = clamp(flips + (superman || p.swordSpin ? 1 : 0), 1, 3), bst = BOOSTS[tier - 1];
          p.boost = bst.t; p.boostK = bst.k; this.flips += flips;
          const trick = { type: 'trick', flips, back: p.turned > 0, grab: grab && !superman, superman, spin: p.swordSpin, tier, airT: p.airT };
          ev.push(trick);
          if (p.from === 'kicker' && ++p.streak >= RUSH_AFTER) {              // tricks off three kickers running
            p.streak = 0; p.rush = RUSH_T; trick.rush = true;
            if (!this.bonus) this.az = Math.min(this.az, p.x - MAX_GAP - this.room);
            ev.push({ type: 'rush' });
          }
        } else if (p.airT > 0.25) { if (p.from === 'kicker') p.streak = 0; ev.push({ type: 'land', airT: p.airT }); }
        p.rot = near; p.turned = 0; p.grab = 0; p.sup = 0; p.swordSpin = false;
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
    this.creatures(dt, ev, x0);
    for (const c of sl.crystals) {
      if (c.got || c.x < x0 - REACH) continue;
      if (c.x > p.x + REACH) break;
      if (Math.abs(c.y - (p.y + 0.9)) < REACH) { c.got = true; ev.push({ type: 'crystal', c }); }
    }
    for (const q of sl.items) {
      if (q.got || q.x < x0 - REACH) continue;
      if (q.x > p.x + REACH) break;
      if (Math.abs(q.y - (p.y + 0.9)) < REACH + 1.3) {
        q.got = true;
        if (q.kind === 'rocket') p.rocket = ROCKET_T;
        ev.push({ type: q.kind, q, all: q.kind === 'letter' && sl.items.every((w) => w.kind !== 'letter' || w.got) });
      }
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

// Benchmark contract for Pinball Blast 3D (see tools/bench.mjs). The bot plays with the keys:
// ← / → flippers, Space held and let go for the plunger. It flips when a ball comes into a
// flipper's reach, and catches a ball that rolls onto a raised flipper (a cradle). From a cradle
// it aims like a pinball player: it lets go, the ball rolls down the flipper, and it flips again
// after a chosen delay — the longer the delay, the further right (left flipper) the shot goes.
// Which delay hits what it learns once per level by trying every delay on a copy of the table
// (the game's own physics, run on a shadow of the game; the real game is never touched), then
// picks the shot that does the most for the missions still open, timing UFO shots against where
// the UFO will be. It reads reversed flippers, a dead flipper and the ghost ball (seen only when
// it flickers) like a player would: late. Lower skill reacts later and less precisely, catches
// less, aims worse and is slower to notice reversed flippers. The mistake: stop flipping until
// the ball drains and costs a life.
const W = 480, H = 720, R = 9, STEP = 1 / 120;
const FL = [{ px: 140, py: 640, side: 1, key: 'left' }, { px: 300, py: 640, side: -1, key: 'right' }];
const FLEN = 68, A_UP = -0.45, A_DOWN = 0.5;
const UFO_Y = 206;
const MISSION_IDS = ['lanes', 'targets', 'bumpers', 'saucer', 'ufo', 'spinner'];

const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());
const NOOP = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : NOOP), apply: () => NOOP });

// ── a shadow of the table: the game's own code on a private copy of its state ──
function shadow(g) {
  const o = Object.create(Object.getPrototypeOf(g));
  Object.assign(o, g);
  const map = new Map();
  o.balls = g.balls.map((b) => { const c = { ...b, limbo: b.limbo && { ...b.limbo } }; map.set(b, c); return c; });
  o.plungerBall = g.plungerBall ? map.get(g.plungerBall) : null;
  o.flippers = g.flippers.map((f) => ({ ...f, prev: f.prev && [...f.prev] }));
  o.missions = g.missions.map((m) => ({ ...m }));
  o.targetsDown = [...g.targetsDown]; o.lanesLit = [...g.lanesLit];
  o.bumperFlash = [...g.bumperFlash]; o.slingFlash = [...g.slingFlash];
  o.bumpers = g.bumpers.map((b) => ({ ...b })); o.ufo = g.ufo && { ...g.ufo };
  o.doors = g.doors.map((d) => ({ ...d }));
  o.magnet = g.magnet && { ...g.magnet, caught: g.magnet.caught && map.get(g.magnet.caught) };
  o.hole = g.hole && { ...g.hole }; o.chaos = g.chaos && { ...g.chaos };
  o.timers = [];
  const ev = [];
  o.ev = ev;
  o.s = {
    input: { down: new Set(), isDown(a) { return this.down.has(a); }, pointer: { x: W / 2, y: H / 2, down: false }, pointers: new Map() },
    rng: { range: (a, b) => (a + b) / 2, int: (a) => a, chance: () => false, pick: (l) => l[0] },
    sound: NOOP, fx: NOOP, award() {}, unlock() {}, lives: 3, speed: () => 1,
    hurt() { ev.push({ id: 'drain', t: o.t }); }, completeLevel() {},
  };
  return o;
}

// ── the shot book: what a cradled ball does for each flip delay, per level and side ──
const books = new Map();
const DELAYS = Array.from({ length: 33 }, (_, i) => 0.06 + i * 0.0125);   // 0.06 … 0.46 s
const REST = [[142.9, 620.2], [297.1, 620.2]];

function book(g, side) {
  const key = `${g.level}|${side}`;
  if (books.has(key)) return books.get(key);
  const shots = [];
  for (const d of DELAYS) {
    const o = shadow(g);
    const f = FL[side];
    o.balls = []; o.plungerBall = null; o.gateOpen = false; o.multiball = false; o.locks = 0;
    o.chaos = null; o.chaosT = 99; o.gx = 0; o.deadFlipper = -1; o.magnet = null; o.hole = null; o.holeT = 99;
    o.doors = []; o.roam = false; o.ufo = null; o.tilted = 0; o.mTimeMax = 0;
    o.bumpers.forEach((b) => { b.x = b.x0; });
    o.targetsDown = [false, false, false, false, false]; o.lanesLit = [false, false, false, false];
    o.missions = MISSION_IDS.map((id) => ({ id, need: 1e9, have: 0 }));
    o.flippers.forEach((fl, i) => { fl.a = i === side ? A_UP : A_DOWN; fl.wasUp = i === side; fl.prev = null; });
    const ball = o.addBall(REST[side][0], REST[side][1], 0, 0); ball.saveUntil = 0;
    o.t = 0;
    const ev = o.ev, path = [];
    o.progress = (id, n) => ev.push({ id, n, t: o.t });
    const th = o.targetHit; o.targetHit = function (i, tg) { ev.push({ id: 'target', i, t: o.t }); th.call(this, i, tg); };
    const lh = o.laneHit; o.laneHit = function (i) { ev.push({ id: 'lane', i, t: o.t }); lh.call(this, i); };
    const inp = o.s.input;
    const total = d + 1.5;
    for (let k = 0; k * STEP < total; k++) {
      const tt = k * STEP;
      if (tt >= d && tt < d + 0.25) inp.down.add(f.key); else inp.down.delete(f.key);
      o.update(STEP);
      const b = o.balls[0];
      if (k % 2 === 0) path.push(b ? [o.t, b.x, b.y] : null);
      if (ev.some((e) => e.id === 'drain')) break;
    }
    shots.push(finishShot({ d }, ev, path, d + 0.3));
  }
  books.set(key, shots);
  return shots;
}

/** A shot counts until the ball is back down at the flippers (from then on the bot plays it):
 *  what it hit on the way, and whether it comes back down the middle (out of the flippers' reach). */
function finishShot(shot, ev, path, after) {
  let back = null;
  let prev = null;
  for (const p of path) { if (!p) break; if (p[0] > after && p[2] > 585) { back = p; break; } prev = p; }
  const tEnd = back ? back[0] : Infinity;
  // where it will cross the flippers' line (y 640), heading on as it comes down
  let x640 = back ? back[1] : 0;
  if (back && prev && back[2] > prev[2]) x640 = back[1] + (back[1] - prev[1]) / (back[2] - prev[2]) * (640 - back[2]);
  shot.ev = ev.filter((e) => e.id !== 'drain' && e.t <= tEnd);
  shot.drained = ev.some((e) => e.id === 'drain' && e.t <= tEnd) || (back && Math.abs(x640 - 220) < 16);
  shot.path = path.filter((p) => p && p[0] <= tEnd);
  shot.back = back;
  return shot;
}

/** The plunger book: what each launch power does in the first 2.5 s (per level). */
const POWERS = Array.from({ length: 29 }, (_, i) => 0.3 + i * 0.025);
function plungeBook(g) {
  const key = `${g.level}|plunge`;
  if (books.has(key)) return books.get(key);
  const shots = [];
  for (const p of POWERS) {
    const o = shadow(g);
    o.chaos = null; o.chaosT = 99; o.gx = 0; o.magnet = null; o.hole = null; o.holeT = 99; o.doors = []; o.roam = false; o.ufo = null; o.mTimeMax = 0;
    o.balls = o.balls.filter((x) => x === o.plungerBall);
    if (!o.plungerBall) break;
    o.targetsDown = [false, false, false, false, false]; o.lanesLit = [false, false, false, false];
    o.missions = MISSION_IDS.map((id) => ({ id, need: 1e9, have: 0 }));
    o.t = 0;
    const ev = o.ev, path = [];
    o.progress = (id, n) => ev.push({ id, n, t: o.t });
    const th = o.targetHit; o.targetHit = function (i, tg) { ev.push({ id: 'target', i, t: o.t }); th.call(this, i, tg); };
    const lh = o.laneHit; o.laneHit = function (i) { ev.push({ id: 'lane', i, t: o.t }); lh.call(this, i); };
    const inp = o.s.input;
    let launched = false, tLaunch = 0;
    for (let k = 0; k < 120 * 4; k++) {
      if (!launched && o.plungerBall && o.charge < p) inp.down.add('action'); else { inp.down.delete('action'); }
      o.update(STEP);
      if (!o.plungerBall && !launched) { launched = true; tLaunch = o.t; }
      const b = o.balls[0];
      if (k % 2 === 0) path.push(b ? [o.t, b.x, b.y] : null);
      if (launched && o.t > 2.5 + p) break;
      if (ev.some((e) => e.id === 'drain')) break;
    }
    shots.push(finishShot({ p }, ev, path, tLaunch + 0.5));
  }
  books.set(key, shots);
  return shots;
}

function segDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2));
  return Math.hypot(px - x1 - vx * t, py - y1 - vy * t);
}

/** Where the UFO will be in t seconds (it patrols 110…330 at its speed). */
function ufoAt(u, t) {
  const span = 220, p = ((u.x - 110) + (u.dir > 0 ? 0 : 2 * span - 2 * (u.x - 110)));
  let q = (p + u.speed * t) % (2 * span); if (q < 0) q += 2 * span;
  return 110 + (q <= span ? q : 2 * span - q);
}

/** How much a shot from the book does for the missions still open (fractions of a mission). */
function shotValue(g, shot) {
  if (shot.drained) return -100;
  let v = 0;
  // the roaming bumper (level 8+): the book was made with it at home; a shot that goes near
  // where it is home, or near where it will really be, won't go as the book says
  if (g.roam) {
    const bu = g.bumpers[2], rr = bu.r + R + 8;
    for (const p of shot.path) {
      const rx = bu.x0 + Math.sin((g.t + p[0]) * 1.3) * 48;
      if ((Math.hypot(p[1] - bu.x0, p[2] - bu.y) < rr || Math.hypot(p[1] - rx, p[2] - bu.y) < rr) && Math.abs(rx - bu.x0) > 6) return -1;
    }
  }
  // a trap door the player has already found (it shows once found): a rolling ball drops in, and
  // can come out of the drain chute
  for (const d of g.doors) {
    if (!d.found) continue;
    let prev = null;
    for (const p of shot.path) {
      if (prev && segDist(d.x, d.y, prev[1], prev[2], p[1], p[2]) < 14) { v -= 30; break; }
      prev = p;
    }
  }
  const open = new Map(g.missions.filter((m) => m.have < m.need).map((m) => [m.id, m]));
  const tally = {};
  const down = [...g.targetsDown], lit = [...g.lanesLit];
  for (const e of shot.ev) {
    if (e.id === 'target') { if (!down[e.i]) { down[e.i] = true; tally.tg = (tally.tg || 0) + 1; } continue; }
    if (e.id === 'lane') { if (!lit[e.i]) { lit[e.i] = true; tally.ln = (tally.ln || 0) + 1; } continue; }
    if (['bumpers', 'saucer', 'spinner'].includes(e.id)) tally[e.id] = (tally[e.id] || 0) + e.n;
  }
  for (const [id, m] of open) {
    const left = m.need - m.have;
    if (id === 'targets') v += (tally.tg || 0) / 5 / left;
    else if (id === 'lanes') v += (tally.ln || 0) / 4 / left;
    else if (id === 'ufo') {
      // does the path cross the UFO's line while the UFO is there?
      if (g.ufo) for (const p of shot.path) {
        if (!p) break;
        if (Math.abs(p[2] - UFO_Y) < 30) { const ux = ufoAt(g.ufo, p[0]); if (Math.hypot(p[1] - ux, (p[2] - UFO_Y) * 1.6) < 28 + R + 4) { v += 1 / left; break; } }
      }
    } else if (tally[id]) v += Math.min(left, tally[id]) / left;
  }
  // a little for any action, and for a long shot (time on the table)
  v += (tally.bumpers || 0) * 0.002 + (shot.back ? Math.min(2, shot.back[0]) * 0.005 : 0.012);
  return v;
}

// ── seeing the ball ──
/** The balls this player can see: a ghost ball only shows when it flickers (the game draws it at
 *  5 % otherwise); between flickers the player guesses from the last look. */
function seen(g, b) {
  const m = b.mem, out = [];
  m.last ??= new WeakMap();
  for (const ball of g.balls) {
    if (!ball.inPlay || ball.limbo) continue;
    const ghost = g.chaos?.kind === 'ghost';
    const flick = Math.sin(g.t * 9 + ball.x * 0.05) > 0.93;
    if (!ghost || flick) { m.last.set(ball, { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, t: g.t, held: ball.held }); out.push(ball); continue; }
    const l = m.last.get(ball);
    if (!l) continue;
    const dt = g.t - l.t;
    out.push({ x: l.x + l.vx * dt, y: l.y + l.vy * dt + 0.5 * g.grav * dt * dt, vx: l.vx, vy: l.vy + g.grav * dt, guess: true, held: l.held });
  }
  return out;
}

/** The ball in the flipper's frame: distance from the pivot and angle (0 = straight out, + = down). */
function rel(f, x, y) {
  const dx = (x - f.px) * f.side, dy = y - f.py;
  return { r: Math.hypot(dx, dy), th: Math.atan2(dy, dx), dx, dy };
}
/** Is the ball (in `lead` s) in this flipper's reach, above its blade? */
function inReach(g, i, ball, lead) {
  const f = FL[i], fl = g.flippers[i];
  const x = ball.x + ball.vx * lead, y = ball.y + ball.vy * lead + 0.5 * g.grav * lead * lead;
  const q = rel(f, x, y);
  if (q.r > FLEN + R + 7 || q.r < 6 || q.dx < -12) return false;
  return q.th > A_UP - 0.5 && q.th < Math.max(fl.a, A_UP) + 0.08 && ball.vy > -250;
}

/** The top lane a ball is about to roll down (it lights it if it's dark), or null. */
const LANES = [152, 197, 242, 287];
function laneAhead(g, balls) {
  for (const ball of balls) {
    if (ball.y > 128 || ball.y < 40) continue;
    // when does it reach the rollover (y 134) going down?
    const a = g.grav / 2, bq = ball.vy, c = ball.y - 134;
    const disc = bq * bq - 4 * a * c;
    if (disc < 0) continue;
    const t = (-bq + Math.sqrt(disc)) / (2 * a);
    if (!(t > 0 && t < 0.35)) continue;
    const x = ball.x + ball.vx * t;
    const i = LANES.findIndex((lx) => Math.abs(x - lx) < 14);
    if (i >= 0) return i;
  }
  return null;
}

/** Which key raises flipper i right now, as far as this player knows. */
function keyFor(g, b, i) {
  const m = b.mem;
  const rev = g.chaos?.kind === 'reverse';
  if (rev !== m.revSeen) { m.revSince ??= b.t; if (b.t - m.revSince > 0.15 + (1 - b.skill) * 1.6) { m.revSeen = rev; m.revSince = null; } } else m.revSince = null;
  return m.revSeen ? FL[1 - i].key : FL[i].key;
}

function bot(g, s, b) {
  const m = b.mem, skill = b.skill;
  const want = new Set();
  // plunger: hold Space to the chosen power, then let go
  if (g.plungerBall) {
    if (m.power == null) {
      // the expert picks the launch that helps the missions most; others guess
      if (b.rand() < skill * skill) {
        const book = plungeBook(g);
        let best = null, bv = -Infinity;
        for (const sh of book) { const v = shotValue(g, sh) + b.rand() * 1e-6; if (v > bv) { bv = v; best = sh; } }
        m.power = best ? best.p + gauss(b.rand) * (1 - skill) * 0.05 : 0.9;
      } else m.power = 0.55 + b.rand() * 0.45;
    }
    if (!m.charging) { m.charging = true; }
    if (g.charge < m.power) want.add('action');
    else { m.power = null; m.charging = false; }
    s.hold([...want]);
    return;
  }
  m.charging = false; m.power = null;
  const balls = seen(g, b);
  const live = g.balls.filter((x) => x.inPlay && !x.limbo);
  const react = 0.012 + (1 - skill) * 0.03;                   // lead the ball by this much (s)
  m.hold ??= [0, 0];
  for (let i = 0; i < 2; i++) {
    if (g.deadFlipper === i) continue;                       // ⚡ glitch: this one does nothing
    let press = false;
    // aimed shot from a cradle in progress
    if (m.aim && m.aim.side === i) {
      const a = m.aim, t = b.t - a.t0;
      if (t < 0) press = true;                               // still holding the cradle
      else if (t >= a.d && t < a.d + 0.25) press = true;
      else if (t >= a.d + 0.25) m.aim = null;
    } else {
      for (const ball of balls) {
        if (ball.held) continue;
        const near = inReach(g, i, ball, react + (ball.guess ? 0.03 : 0));
        if (near) { press = true; break; }
      }
      // catch: raise the flipper before a ball drops onto it from its own side, so it settles in
      // the cradle (a skill: the expert does it every time it can, others now and then)
      if (!press && m.catchOn !== false) for (const ball of balls) {
        if (ball.guess) continue;
        const q = rel(FL[i], ball.x, ball.y), sp = Math.hypot(ball.vx, ball.vy);
        const ix = (ball.x - FL[i].px) * FL[i].side;           // across from the pivot, towards the tip
        const inlane = ix > -80 && ix < 2 && ball.y > 470 && ball.y < 632 && ball.vy > -60 && sp < 900;
        const above = q.dx > 4 && q.dx < FLEN - 6 && q.th < A_UP - 0.25 && q.th > -1.45 && q.r < FLEN + 70 && ball.vy > 0 && sp < 700 && ball.vx * FL[i].side > -260;
        if (inlane || above) {
          m.catchRoll ??= new WeakMap();
          if (!m.catchRoll.has(ball) || b.t - m.catchRoll.get(ball).t > 1.5) m.catchRoll.set(ball, { t: b.t, ok: b.rand() < skill * skill });
          if (m.catchRoll.get(ball).ok) { press = true; break; }
        }
      }
      // keep a cradle: a slow ball resting on a raised flipper
      if (!press && g.flippers[i].wasUp) for (const ball of balls) {
        const q = rel(FL[i], ball.x, ball.y);
        if (q.r < FLEN + R + 4 && q.th < 0.2 && q.th > -1.8 && Math.hypot(ball.vx, ball.vy) < 260) { press = true; break; }
      }
      if (press) m.hold[i] = b.t; else if (b.t - m.hold[i] < 0.06) press = true;   // keep it up a moment
    }
    if (press) want.add(keyFor(g, b, i));
  }
  // nudge: a ball dropping straight down the middle, out of both flippers' reach — bump the table
  // (↑) once; more than three bumps in two seconds would TILT, so at most two
  for (const ball of balls) {
    if (ball.guess || ball.vy < 150 || ball.y < 520 || ball.y > 625) continue;
    const t = (640 - ball.y) / ball.vy, x = ball.x + ball.vx * t;
    if (Math.abs(x - 220) < 8 && (g.nudges || 0) < 2 && b.t - (m.nudgeT ?? -9) > 0.4 && b.rand() < skill * skill) {
      m.nudgeT = b.t; want.add('up');
    }
  }
  // lane change: with the ball up top about to roll down a lit lane, tap a flipper to turn the
  // lit lanes round so an unlit one is under it (each flip moves them one lane)
  if (!want.size && g.missions.some((mi) => mi.id === 'lanes' && mi.have < mi.need) && !g.lanesLit.every(Boolean)
      && balls.every((x) => x.y < 380) && b.rand() < 0.15 + skill ** 3) {
    const lane = laneAhead(g, balls);
    if (lane != null && g.lanesLit[lane]) {
      // fewest taps: left taps turn the lights one way, right taps the other
      let pick = null;
      for (let k = 1; k <= 3 && !pick; k++) {
        if (!g.lanesLit[(lane - k + 4) % 4]) pick = 0; else if (!g.lanesLit[(lane + k) % 4]) pick = 1;
      }
      if (pick != null && g.deadFlipper !== pick) {
        m.tapT ??= -1;
        if (b.t - m.tapT > 2 * STEP && !g.flippers[pick].wasUp) { want.add(keyFor(g, b, pick)); m.tapT = b.t; }
      }
    }
  }
  // a ball at rest in a cradle: plan an aimed shot (one ball in play, nothing else coming)
  if (!m.aim && !['quake', 'magnet'].includes(g.chaos?.kind)) {
    for (const ball of live) {
      if (ball.held) continue;
      const i = [0, 1].find((k) => Math.hypot(ball.x - REST[k][0], ball.y - REST[k][1]) < 3 && Math.hypot(ball.vx, ball.vy) < 8 && g.flippers[k].wasUp && g.deadFlipper !== k);
      if (i == null) continue;
      m.rest ??= b.t;
      if (b.t - m.rest < 0.1 + (1 - skill) * 0.5) break;
      m.rest = null;
      let d;
      if (b.rand() < 0.2 + skill * 0.8) {
        const shots = book(g, i);
        let best = null, bv = -Infinity;
        for (const sh of shots) { const v = shotValue(g, sh) + b.rand() * 1e-6; if (v > bv) { bv = v; best = sh; } }
        d = best.d + gauss(b.rand) * (1 - skill) * 0.05;
      } else d = 0.1 + b.rand() * 0.3;                       // a weaker player often just flips it away
      m.aim = { side: i, t0: b.t + STEP, d: Math.max(0.03, d) };
      break;
    }
  }
  s.hold([...want]);
}

const overCap = new WeakMap();          // per game: steps each ball has spent over the speed cap

export default {
  levels: 20,                                       // endless game: bench levels 1–20
  // missions take the expert ~20 s (level 1) to ~4 min (three missions at once, no ball save,
  // black holes); the clock (45–96 s a ball) ends a ball on purpose and the missions carry over
  limit: (level) => 240 + level * 12,
  // one mission shot (a saucer, the last target of a bank) can take more than a whole mission
  // clock to make; a softlock (a bank that never resets, as on 29 Oct) never moves again
  stuck: 150,
  // mission progress (each mission as a fraction, so they weigh the same)
  progress: (g) => g.missions.reduce((a, m) => a + m.have / m.need, 0),

  invariants(g, s) {
    const fast = overCap.get(g) || new Map();
    for (const ball of g.balls) {
      if (![ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite)) return 'a ball position or speed is not a number';
      if (!ball.inPlay) continue;
      // speed cap 2300: applied every sub-step before the walls, bumpers and flippers, so a kick
      // in the last sub-step can leave a ball a little over it until the next one
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 3000) return `a ball is moving at ${sp.toFixed(0)} px/s (cap 2300)`;
      const n = sp > 2300 + 1e-6 ? (fast.get(ball) || 0) + 1 : 0;
      fast.set(ball, n);
      if (n >= 3) return `a ball has been over the 2300 px/s cap for ${n} steps (${sp.toFixed(0)})`;
      if (ball.y < 730 && (ball.x < 20 + R - 2 || ball.x > 460 - R + 2)) return `a ball went through the side wall at x ${ball.x.toFixed(1)}`;
      if (ball.y < 0) return `a ball left the top of the table at y ${ball.y.toFixed(0)}`;
      if (ball.y < 232 && Math.hypot(ball.x - 240, (ball.y - 232) * 220 / 172) > 220 - R + 3) return `a ball went through the top arch at (${ball.x.toFixed(0)}, ${ball.y.toFixed(0)})`;
      for (const bu of g.bumpers) if (Math.hypot(ball.x - bu.x, ball.y - bu.y) < bu.r + R - 3) return `a ball is inside a pop bumper at (${ball.x.toFixed(0)}, ${ball.y.toFixed(0)})`;
      if (g.ufo && Math.hypot(ball.x - g.ufo.x, (ball.y - UFO_Y) * 1.6) < 28) return `a ball is inside the UFO at (${ball.x.toFixed(0)}, ${ball.y.toFixed(0)})`;
    }
    overCap.set(g, fast);
    for (const mi of g.missions) if (!(mi.have >= 0 && mi.have <= mi.need) || !Number.isFinite(mi.have)) return `mission ${mi.id} at ${mi.have}/${mi.need}`;
    if (!g.bonus && g.missions.length && g.missions.every((mi) => mi.have >= mi.need)) return 'every mission is done but the level goes on';
    if (g.mTimeMax && !(g.mTime >= 0 && g.mTime <= g.mTimeMax + 1e-9)) return `mission clock at ${g.mTime} of ${g.mTimeMax}`;
    for (const f of g.flippers) if (!(f.a >= A_UP - 1e-6 && f.a <= A_DOWN + 1e-6)) return `a flipper is at angle ${f.a}`;
    if (g.balls.length > 6) return `${g.balls.length} balls on the table`;
    if (!g.plungerBall && !g.balls.some((x) => x.inPlay || x.limbo) && !g.bonus) return 'no ball in play and none on the plunger';
    if (g.targetsDown.every(Boolean) && !g.timers?.length) return 'the whole target bank is down and nothing will reset it';
    if (g.lanesLit.every(Boolean) && !g.timers?.length) return 'all four lanes are lit and nothing will reset them';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.lostAt ??= s.livesLost;
    if (s.livesLost > m.lostAt) return true;            // the drain cost a life
    if (g.plungerBall) { bot(g, s, b); return false; }
    // wait for the ball save to run out and multiball to end, then stop flipping
    const live = g.balls.filter((x) => x.inPlay);
    if (g.multiball || live.some((x) => g.t < x.saveUntil)) { bot(g, s, b); return false; }
    // let it go: no flipping, and with the ball dropping down the middle, both flippers held up
    // so it falls between them (with them down, the centre post of levels 1–3 would save it)
    const want = [];
    for (const ball of live) if (Math.abs(ball.x - 220) < 34 && ball.y > 575 && ball.vy > -50) want.push(keyFor(g, b, 0), keyFor(g, b, 1));
    s.hold(want);
    return false;
  },
};

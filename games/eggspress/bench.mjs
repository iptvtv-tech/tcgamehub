// Benchmark contract for Eggspress (see tools/bench.mjs). The bot drives with the keys only: → gas,
// ← brake / reverse (in the air → tips the truck back, ← tips it forward), nothing held = coast.
// It drives like a careful player: a target speed for the road it is on (slower over rocky bumps,
// in moon patches and before a ramp's kicker or a mushroom, a fast run-up before a chasm), gas and
// brake to hold it, easing off when the egg rolls to the back of its cup and off the brake when
// it rolls forward, and in the air it turns the truck to match the slope it will land on.
// Up a steep hill it feathers the gas (full gas throws the egg over the back wall of its cup).
// Like a player who has learned the road, it also thinks ahead with the game's own physics (a copy
// of the truck and egg, stepped by the game's stepCar/stepEgg — the real game is never touched):
//   · before each ramp, chasm, mushroom, moon patch, bumpy stretch, steep climb or drop it tries a
//     handful of approach speeds through it and takes the one that keeps the egg whole;
//   · every ~0.6 s it plays the next ~1.2 s forward, and when that loses or cracks the egg it tries
//     a moment of gas / coast / brake first and takes what works best;
//   · in the air it re-picks every 0.15 s how to hold the truck until it lands;
//   · stalled on a climb, it rolls back for a run-up and takes the hill flat out.
// Lower skill thinks ahead less often and less far (and sometimes not at all), holds speeds that
// are a bit too high, reacts later to the egg rolling, and lines up landings late, so it cracks
// more eggs on the jumps and loses them on the steep hills. The mistake: rock the truck (gas,
// brake, gas…) and slam the brakes at speed until the egg rolls off — a real lost egg and life.
import { STEP } from '../../tools/lib/headless.mjs';

const drove = new WeakMap();

// ── a copy of the physics to think with ──
const NOOP = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : NOOP), apply: () => NOOP });
const QUIET = { sound: NOOP, fx: NOOP, award() {}, unlock() {}, hurt() {}, gold: false, comboCount: 0 };
/** A private copy of the truck and egg on the same road (the road arrays are only read). */
function model(g) {
  const m = Object.create(Object.getPrototypeOf(g));
  Object.assign(m, g);
  m.s = QUIET; m.dust = []; m.cam3 = { p: () => null }; m.cam = { x: 0, y: 0 };
  m.car = { ...g.car, wheels: g.car.wheels.map((w) => ({ ...w })) };
  m.egg = { ...g.egg, crackSeeds: [] };
  m.mcd = g.mushrooms.map((q) => q.cd);
  m.stuck = g.stuckT;
  return m;
}
function clone(m) {
  const n = Object.create(Object.getPrototypeOf(m));
  Object.assign(n, m);
  n.car = { ...m.car, wheels: m.car.wheels.map((w) => ({ ...w })) };
  n.egg = { ...m.egg, crackSeeds: [] }; n.mcd = [...m.mcd]; n.dust = [];
  return n;
}
/** One engine step of the physics, the way update() runs it (two half steps, mushrooms, chasms,
 *  stuck on the roof). Returns true when the egg is lost. */
function mstep(m, th) {
  const h = STEP / 2;
  for (let k = 0; k < 2; k++) { m.stepCar(h, th); if (!m.bonus && m.stepEgg(h)) return true; }
  const c = m.car;
  for (let i = 0; i < m.mushrooms.length; i++) {
    const q = m.mushrooms[i];
    if (Math.abs(q.x - c.x) > 200) continue;
    m.mcd[i] = Math.max(0, m.mcd[i] - STEP);
    if (m.mcd[i] > 0) continue;
    if (c.wheels.some((wh) => wh.on && Math.abs(wh.x - q.x) < 26)) { m.mcd[i] = 1.2; const boost = -720 - Math.max(0, c.vy); c.vy += boost; m.egg.vy += boost; }
  }
  if (m.bonus) return false;
  const gp = m.gaps.find((q) => c.x > q.x0 - 30 && c.x < q.x1 + 30);
  if (gp && c.y > m.ground(gp.x0 - 15) + 200) return true;
  m.stuck = Math.cos(c.a) < -0.2 && Math.hypot(c.vx, c.vy) < 60 ? m.stuck + STEP : 0;
  return m.stuck > 1.5;
}
const eggLocal = (m) => { const c = m.car, cs = Math.cos(c.a), sn = Math.sin(c.a), dx = m.egg.x - c.x, dy = m.egg.y - c.y; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };

// ── driving ──
const PARAMS = (skill) => ({
  vT: 210 + (1 - skill) * 90,            // cruising speed (px/s); a less patient player drives faster
  vLow: 110 + (1 - skill) * 80, vBump: 140 + (1 - skill) * 80, vRamp: 90 + (1 - skill) * 90, vMush: 90 + (1 - skill) * 80,
  vJump: 340, runUp: 900,
  guardBack: 13 + (1 - skill) * 4,       // how far back the egg may roll before it eases off the gas
  guardFwd: 9 + (1 - skill) * 6,
  lead: 0.25, tol: 0.05 + (1 - skill) * 0.12,
});

/** The throttle a careful player gives right now (+1 gas, 0 coast, −1 brake). `over` = a planned
 *  approach speed for the feature ahead. */
function policy(m, P, over, pwm) {
  const c = m.car;
  const on = c.wheels[0].on || c.wheels[1].on;
  const [ex] = eggLocal(m);
  if (on) {
    const cs = Math.cos(c.a), sn = Math.sin(c.a), v = c.vx * cs + c.vy * sn, x = c.x;
    let vT = P.vT;
    if (over && x < over.until) vT = over.v;
    else {
      if (m.lowG.some((z) => x > z.x0 - 200 && x < z.x1)) vT = Math.min(vT, P.vLow);
      if (m.bumps.some((q) => x > q.x0 - 150 && x < q.x1)) vT = Math.min(vT, P.vBump);
      for (const r of m.ramps) {
        const u = r.x - x;
        if (r.gap) { if (u > -60 && u < P.runUp) vT = Math.max(vT, P.vJump); }
        else if (u > -40 && u < 350) vT = Math.min(vT, P.vRamp);
      }
      for (const q of m.mushrooms) if (q.x - x > -40 && q.x - x < 300) vT = Math.min(vT, P.vMush);
    }
    let th = v < vT - 10 ? 1 : v > vT + 25 ? -1 : 0;
    // up a steep hill full gas throws the egg over the back: feather it (the egg sits on the back
    // wall at about −12 px on any climb; past −13 it goes over)
    const grade = -m.slope(x + 20);
    if (th > 0 && grade > 0.3 && pwm) { pwm.a += grade > 0.5 ? 0.6 : 0.7; th = pwm.a >= 1 ? 1 : 0; pwm.a -= th; }
    if (ex < -P.guardBack && th > 0) th = 0;
    if (ex > P.guardFwd && th < 0) th = 0;
    return th;
  }
  // in the air: aim the truck at the slope it will land on
  let x = c.x, y = c.y, vy = c.vy, t = 0;
  while (t < 2.5 && y < m.ground(x) - 28) { t += 0.03; x += c.vx * 0.03; vy += m.gravity(x) * 0.03; y += vy * 0.03; }
  const target = Math.atan(Math.max(-3, Math.min(3, m.slope(x))));
  const pa = c.a + c.w * P.lead;
  return pa > target + P.tol ? 1 : pa < target - P.tol ? -1 : 0;
}

/** How a stretch of driving went in the copy: lost egg ≪ cracks ≪ an unseated egg ≪ distance. */
function score(m, x0, cracks0, lostAt) {
  if (lostAt != null) return -1e6 + lostAt * 1000;
  const c = m.car, [ex, ey] = eggLocal(m);
  let v = (c.x - x0) - 3000 * (m.egg.cracks - cracks0);
  if (Math.abs(ex) > 7) v -= (Math.abs(ex) - 7) * 60;
  if (ey < -34) v -= (-34 - ey) * 40;
  if (Math.cos(c.a) < 0.4) v -= 2000;
  return v;
}
/** Drive the copy with the policy (after `duty` for `first` s, if given) for up to `secs` s or until x passes `toX`. */
function rollout(base, P, over, secs, { duty = null, first = 0, toX = Infinity, untilLanded = false } = {}) {
  const m = clone(base), x0 = m.car.x, c0 = m.egg.cracks, pwm = { a: 0 };
  let acc = 0, t = 0, landed = false;
  for (let i = 0, n = Math.round(secs / STEP); i < n; i++) {
    let th;
    if (untilLanded && !landed && (m.car.wheels[0].on || m.car.wheels[1].on) && t > 0.05) landed = true;
    if (duty != null && (untilLanded ? !landed : t < first)) { acc += duty; th = acc >= 0.5 ? 1 : acc <= -0.5 ? -1 : 0; acc -= th; } else th = policy(m, P, over, pwm);
    if (mstep(m, th)) return { v: score(m, x0, c0, t), m };
    t += STEP;
    if (m.car.x > toX) break;
  }
  return { v: score(m, x0, c0, null), m };
}

/** The road features worth planning an approach for, in order. */
function features(g) {
  const out = [];
  for (const r of g.ramps) out.push({ x: r.x - (r.gap ? 320 : 200), end: r.x + (r.gap ? r.w + 380 : 280), kind: r.gap ? 'chasm' : 'ramp' });
  for (const q of g.mushrooms) out.push({ x: q.x - 30, end: q.x + 30, kind: 'mushroom' });
  for (const z of g.lowG) out.push({ x: z.x0, end: z.x1, kind: 'moon' });
  for (const q of g.bumps) out.push({ x: q.x0, end: q.x1, kind: 'bumps' });
  // steep climbs and drops (over 100 px at a grade of 0.45 or more)
  for (const dir of [-1, 1]) {
    let x0 = null;
    for (let x = Math.max(200, (g.car?.x ?? 0) - 400); x < Math.min(g.genX - 400, g.goalX); x += 10) {
      const steep = g.ground(x) < 1500 && dir * g.slope(x) > 0.45;
      if (steep && x0 == null) x0 = x;
      if (!steep && x0 != null) { if (x - x0 > 100) out.push({ x: x0, end: x, kind: dir < 0 ? 'climb' : 'drop' }); x0 = null; }
    }
  }
  return out.sort((a, b) => a.x - b.x);
}
const SPEEDS = { chasm: [300, 340, 380, 440, 520], ramp: [60, 90, 130, 200, 300, 420], mushroom: [50, 80, 120, 170, 240], moon: [60, 90, 130, 180], bumps: [80, 120, 170, 230], climb: [160, 230, 300, 380, 460, 560], drop: [50, 90, 140, 200] };

function bot(g, s, b) {
  const m = b.mem, c = g.car, P = (m.P ??= PARAMS(b.skill));
  if (!g.egg.alive && !g.bonus) return s.hold([]);
  if (s.livesLost !== (m.lives ?? 0)) { m.lives = s.livesLost; m.over = null; m.planned = new Set(); m.until = null; m.duty = null; m.bestX = null; m.runup = null; m.tries = 0; }
  m.planned ??= new Set();
  const think = b.skill >= 0.9 ? 1 : b.skill * 0.6;          // how often it thinks ahead at all
  // 0. stalled on a climb (no new ground for a while, nose up the hill): roll back down for a run-up,
  //    then take it flat out — each try from further back
  if (m.bestX == null || c.x > m.bestX + 5) { m.bestX = c.x; m.bestT = b.t; }
  const onGround = c.wheels[0].on || c.wheels[1].on;
  if (!g.bonus && !m.runup && b.t - m.bestT > 5 && onGround && g.slope(c.x + 60) < -0.25 && b.rand() < 0.02 + 0.98 * b.skill) {
    m.tries = (m.tries ?? 0) + 1;
    m.runup = { to: c.x - 200 - 200 * Math.min(4, m.tries), t0: b.t };
  }
  if (m.runup) {
    const v = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    // roll / reverse back (gently: no faster than 140 px/s), then go
    if (c.x > m.runup.to && !m.runup.go && b.t - m.runup.t0 < 6) { s.hold(v < -140 ? ['right'] : v > -60 ? ['left'] : []); return; }
    if (!m.runup.go) { m.runup.go = true; m.over = { v: 560, until: m.bestX + 200 }; m.bestT = b.t; }
    if (c.x > m.bestX + 150 || b.t - m.bestT > 5) m.runup = null;
  }
  // 1. an approach for the feature coming up (once per feature)
  if (!g.bonus) {
    if (!m.feats || m.featsAt !== g.genX) { m.feats = features(g); m.featsAt = g.genX; }
    const f = m.runup?.go ? null : m.feats.find((q) => !m.planned.has(q.kind + q.x) && q.x - c.x < 420 && q.end > c.x);   // (not during a run-up charge)
    if (f) {
      m.planned.add(f.kind + f.x);
      if (b.rand() < think) {
        const base = model(g);
        let best = null;
        for (const v of SPEEDS[f.kind]) {
          const over = { v, until: f.end + 60 };
          const r = rollout(base, P, over, b.skill >= 0.9 ? 6 : 3, { toX: f.end + 350 });
          if (!best || r.v > best.v) best = { v: r.v, over };
        }
        m.over = best.over;
      }
    }
    if (m.over && c.x > m.over.until) m.over = null;
  }
  // 2. a look at the next second: if the way it's going loses / cracks the egg, try a moment of gas, coast or brake first
  if (m.until == null || b.t >= m.until) {
    const every = b.skill >= 0.9 ? 0.6 : 1.5;
    m.until = b.t + every;
    m.duty = null;
    if (!g.bonus && b.rand() < think && (onGround || !(m.over && c.x < m.over.until))) {          // (a planned jump is flown as planned)
      // inside a planned stretch (a jump, a mushroom…) look far enough to see the landing
      const base = model(g), H = (m.over && c.x < m.over.until ? 2.5 : 1.2) * (0.4 + 0.6 * b.skill);
      const def = rollout(base, P, m.over, H);
      if (def.v < 40 * H) {
        let best = def.v;
        for (const d of [1, 0.4, 0, -0.4, -1]) { const r = rollout(base, P, m.over, H, { duty: d, first: 0.3 }); if (r.v > best + 1) { best = r.v; m.duty = d; } }
        m.acc = 0; m.t0 = b.t; m.until = b.t + 0.3;           // look again once that moment is over
      }
    }
  }
  // 3. in the air: how to hold the truck for the landing (the egg is loose up there), re-thought every moment
  if (!onGround && !g.bonus) {
    if (m.airAt == null || b.t >= m.airAt) {
      m.airAt = b.t + (b.skill >= 0.9 ? 0.15 : 0.4);
      m.air = null;
      if (b.rand() < think) {
        const base = model(g);
        let best = -Infinity;
        for (const d of b.skill >= 0.9 ? [1, 0.5, 0, -0.5, -1] : [1, 0, -1]) {
          const r = rollout(base, P, m.over, 2.5, { duty: d, untilLanded: true });
          if (r.v > best) { best = r.v; m.air = d; }
        }
        m.airAcc = 0;
      }
    }
  } else m.airAt = null;
  let th;
  if (!onGround && m.air != null && m.airAt != null) { m.airAcc += m.air; th = m.airAcc >= 0.5 ? 1 : m.airAcc <= -0.5 ? -1 : 0; m.airAcc -= th; }
  else if (m.duty != null && b.t - m.t0 < 0.3) { m.acc += m.duty; th = m.acc >= 0.5 ? 1 : m.acc <= -0.5 ? -1 : 0; m.acc -= th; }
  else th = policy(g, P, m.over, (m.pwm ??= { a: 0 }));
  s.hold(th > 0 ? ['right'] : th < 0 ? ['left'] : []);
}

export default {
  wip: 'the bot is not expert-grade yet (loses the egg on fair stretches, and is slow); the road fixes of 30 Oct are covered by games/eggspress/test.mjs',
  levels: 20,
  // delivery L is 380 + 55·L metres (L1 435 m … L19 1425 m); par is the distance at 13 m/s, and a
  // careful run is ~10 m/s: 45 s at L1 to ~150 s at L19, plus a restart from the flag for a lost egg
  limit: (level) => Math.round((380 + 55 * level) / 10 * 1.6 + 40),
  stuck: 30,                    // the truck gets 10 px further with this egg at least every 30 s
  // distance driven with the current egg: the furthest point since the last start / restart
  progress(g, s) {
    let r = drove.get(g);
    if (!r || r.lives !== s.livesLost || r.level !== g.level) drove.set(g, (r = { lives: s.livesLost, level: g.level, best: g.car.x }));
    r.best = Math.max(r.best, g.car.x);
    return s.livesLost * 1e6 + Math.floor(r.best / 10);
  },

  invariants(g, s) {
    const c = g.car, e = g.egg;
    for (const [k, v] of [['truck x', c.x], ['truck y', c.y], ['truck vx', c.vx], ['truck vy', c.vy], ['truck angle', c.a], ['truck spin', c.w], ['egg x', e.x], ['egg y', e.y], ['egg vx', e.vx], ['egg vy', e.vy]]) if (!Number.isFinite(v)) return `${k} is ${v}`;
    if (!g.bonus && !e.alive) return 'the egg is gone but the delivery is still going (no life lost)';
    if (e.cracks < 0 || e.cracks > 2) return `the egg has ${e.cracks} cracks and is still in play (3 = SPLAT)`;
    if (!g.bonus && Math.hypot(e.x - c.x, e.y - c.y) > 600) return `the egg is ${Math.hypot(e.x - c.x, e.y - c.y).toFixed(0)} px from the truck and still counts`;
    // the truck rides on the road: its body is never pushed deep into the ground
    const gy = g.ground(c.x);
    if (gy < 1500 && c.y > gy + 12) return `the truck's centre is ${(c.y - gy).toFixed(0)} px under the road at x ${c.x.toFixed(0)}`;
    if (Math.hypot(c.vx, c.vy) > 3000) return `the truck moves at ${Math.hypot(c.vx, c.vy).toFixed(0)} px/s`;
    if (g.maxX + 1e-6 < c.x) return `furthest point ${g.maxX.toFixed(0)} is behind the truck at ${c.x.toFixed(0)}`;
    if (g.distPaid > g.maxX + 1e-6) return 'distance points paid past the furthest point reached';
    if (!g.bonus && g.flagged !== (g.maxX >= g.checkX)) return `checkpoint flag ${g.flagged} but the furthest point is ${g.maxX.toFixed(0)} (flag at ${g.checkX.toFixed(0)})`;
    if (!g.bonus && g.respawnX !== (g.flagged ? g.checkX + 20 : 60)) return `restart point ${g.respawnX} doesn't match the checkpoint`;
    if (!g.bonus && c.x >= g.goalX && e.alive && !g.delivered) return 'at the farm with the egg but not delivered';
    if (g.mushrooms.some((q) => q.cd < 0 || q.cd > 1.2)) return 'a mushroom cooldown out of range';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.l0 ??= s.livesLost;
    if (s.livesLost > m.l0) return true;                       // the egg is gone: back to driving properly
    const t = (m.mt = (m.mt ?? 0) + STEP), c = g.car, v = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    // rock the truck: 1.7 s of gas, 1.7 s of brake / reverse, over and over; every other 12 s
    // floor it and stamp on the brakes at speed instead — until the egg rolls off
    let k;
    if (Math.floor(t / 12) % 2 === 0) k = Math.floor(t / 1.7) % 2 ? 'left' : 'right';
    else { if (m.slam && v < 30) m.slam = false; else if (!m.slam && v > 450) m.slam = true; k = m.slam ? 'left' : 'right'; }
    s.hold([k]);
    return false;
  },
};

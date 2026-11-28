// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — the test bot, shared by test.mjs and bench.mjs. It plays only through the
//  controls a player has: it holds ◀ ▶ ▲ ▼ (s.hold) and presses SLASH (the game's own press flag).
//
//  Its sense of direction is the route planner (plan.js). Its stealth: before each move it plays
//  the move forward on a copy of the level (the guards walk exactly as they will), and only commits
//  to a move that keeps it out of the lanterns and away from the flames for a moment after. In
//  order of preference:
//    1. a guard on its floor with its back turned, near enough: creep up and put it out
//    2. the move that gets it closest to the door, if it is safe
//    3. stand still, if that is safe (a guard walking away, or hidden in an alcove)
//    4. any safe move: into an alcove, a step back
//    5. nothing is safe (it was seen and the guard is throwing): push on toward the door
//  A worse bot (skill < 1) hesitates between moves, so its predictions go stale, and it tries
//  fewer takedowns.
// ─────────────────────────────────────────────────────────────
import { macroInput, simMacro, graphFor, distHere, MACROS, EXIT } from './plan.js';
import { TILE, ROCK, MAX_HP, STAGES, stageOf, tileAtPx, halfW, bodyH, isHidden, GUARD_HW, MAX_SHOTS } from './world.js';

const STEP = 1 / 120;
const NONE = Object.freeze({ dir: 0, jumpPress: false, jumpHeld: false, up: false, down: false, slashPress: false });
const BAD = new Set(['spotted', 'hurt', 'burn', 'heat', 'melt', 'parry']);

export const newBot = () => ({ plan: null, idle: 0, cache: null });

/** A copy of the level as it is right now, to play forward without touching the real one. */
export function fork(sim) {
  const f = Object.assign(Object.create(Object.getPrototypeOf(sim)), sim);
  const p = sim.p;
  f.p = { ...p, atk: p.atk ? { ...p.atk, hit: [...p.atk.hit] } : null };
  f.guards = sim.guards.map((g) => ({ ...g }));
  f.shots = sim.shots.map((b) => ({ ...b }));
  f.shards = sim.shards.map((c) => ({ ...c }));
  f.opals = sim.opals.map((c) => ({ ...c }));
  f.ev = [];
  return f;
}

/**
 * Play policy(f, i) → input (or null once it is finished) on a copy of the level, then stand still
 * for `tail` seconds. bad: he was seen, burned, hurt or parried on the way.
 */
export function trial(sim, policy, { max = 4, tail = 0.6 } = {}) {
  const f = fork(sim), maxN = Math.round(max / STEP), tailN = Math.round(tail / STEP);
  let end = -1;
  for (let i = 0; i < maxN + tailN + 1; i++) {
    let inp = NONE;
    if (end < 0) { inp = i < maxN ? policy(f, i) : null; if (!inp) { end = i; inp = NONE; } }
    if (end >= 0 && i - end >= tailN) return { bad: false, f };
    for (const e of f.step(inp)) if (BAD.has(e.type)) return { bad: true, why: e.type, at: i * STEP, f };
    if (f.done) return { bad: false, exit: true, f };
  }
  return { bad: false, f };
}

/** A planner move as a policy (the same frames the live bot will play). */
export function macroPolicy(mac) {
  let air = false;
  return (f, i) => {
    const p = f.p;
    if (!p.ground) air = true;
    const done = mac.kind === 'walk' ? (i * STEP >= mac.t || air) && p.ground && Math.abs(p.vx) < 1 : air && p.ground && Math.abs(p.vx) < 1;
    if (done || i > 420 || p.dead) return null;
    return { ...NONE, ...macroInput(mac, i, p, air) };
  };
}
const waitPolicy = (n) => (f, i) => (i < n ? NONE : null);

/** Creep up behind guard `gid` and slash it. */
export function chasePolicy(gid) {
  return (f, i) => {
    const g = f.guards.find((q) => q.id === gid), p = f.p;
    if (!g || g.state === 'down' || p.dead || i > 480) return null;
    const dx = g.x - p.x, side = Math.sign(dx) || p.face, hw = halfW(p.k), d = Math.abs(dx);
    const inp = { ...NONE };
    if (!p.ground) return inp;
    if (d > hw + GUARD_HW + 34) inp.dir = side;                           // close in
    else if (p.face !== side && !p.atk) inp.dir = side;                   // turn to face its back
    if (p.face === side && d < hw + GUARD_HW + 52 && d > hw + GUARD_HW + 2 && !p.atk && p.atkCD <= 0) inp.slashPress = true;
    return inp;
  };
}

/** Every planner move from where he stands, best first (closest to the door, then quickest). */
function rankMoves(m, p, B) {
  const key = `${p.x.toFixed(2)}|${p.y}|${p.k}|${p.face}`;
  if (B.cache?.key === key) return B.cache.moves;
  const g = graphFor(m, p.k), byNode = new Map();
  for (const mac of MACROS) {
    const res = simMacro(m, p, mac);
    if (!res) continue;
    const d = res.exit ? -1 : g.dist.get(res.node) ?? Infinity;
    if (d === Infinity) continue;
    const score = d + res.t * 0.01, k = res.exit ? EXIT : res.node, old = byNode.get(k);
    if (!old || score < old.score) byNode.set(k, { mac, d, score, hidden: isHidden(m, res.p) });
  }
  const moves = [...byNode.values()].sort((a, b) => a.score - b.score);
  B.cache = { key, moves };
  return moves;
}

/** Choose what to do next, standing still on the ground. */
function decide(sim, b, B) {
  const m = sim.m, p = sim.p, skill = b.skill ?? 1, roll = () => (b.rand ? b.rand() : 0.5);
  // 1. a guard on this floor with its back turned: put it out
  for (const g of sim.guards) {
    if ((g.state !== 'patrol' && g.state !== 'turn') || Math.abs(g.y - p.y) > 4 || Math.abs(g.x - p.x) > 280) continue;
    if (Math.sign(p.x - g.x) !== -g.face) continue;
    if (roll() > 0.25 + skill * 0.75) continue;
    const r = trial(sim, chasePolicy(g.id), { max: 4, tail: 0.4 });
    if (!r.bad && r.f.guards.find((q) => q.id === g.id).state === 'down') return { kind: 'chase', gid: g.id, i: 0 };
  }
  // 2. toward the door
  const moves = rankMoves(m, p, B), here = distHere(m, p);
  const tail = 0.5 + 1.7 * skill;                         // he must be able to stand there safely a while after
  if (moves.length && moves[0].d < here && roll() < (1 - skill) * 0.3) return { kind: 'mac', mac: moves[0].mac, i: 0, air: false };   // impatient: just go
  for (const mv of moves.slice(0, 6)) {
    if (mv.d >= here) break;
    if (!trial(sim, macroPolicy(mv.mac), { tail }).bad) return { kind: 'mac', mac: mv.mac, i: 0, air: false };
  }
  // 3. stand still
  if (!trial(sim, waitPolicy(24), { tail: 0.5 + 1.0 * skill }).bad) return { kind: 'wait', n: 24 };
  // 4. any safe move: alcoves first, then the closest to the door
  const tries = [...moves.filter((mv) => mv.hidden), ...moves.filter((mv) => !mv.hidden).slice(0, 40)];
  for (const mv of tries) if (!trial(sim, macroPolicy(mv.mac), { tail: 0.5 }).bad) return { kind: 'mac', mac: mv.mac, i: 0, air: false };
  // 5. nothing is safe: on toward the door, through it
  if (moves.length && moves[0].d < here) return { kind: 'mac', mac: moves[0].mac, i: 0, air: false };
  return null;
}

/** One step of play. s = the (headless) shell, b = { skill, rand(), mem } from the benchmark or the test. */
export function botStep(s, b, mem) {
  const g = s.game, sim = g.sim, p = sim.p, m = sim.m;
  if (!mem.bot || mem.bot.sim !== sim) mem.bot = { ...newBot(), sim };
  const B = mem.bot;
  if (p.dead || sim.done) { s.hold([]); B.plan = null; return; }
  const slow = 1 - (b.skill ?? 1);
  if (sim.t < (B.lastT ?? 0)) { B.plan = null; B.idle = 0; B.cache = null; }     // a fresh start after a lost heart
  B.lastT = sim.t;

  // fireballs in reach in front: slash them (but never into a guard's face)
  const hw = halfW(p.k), h = bodyH(p.k);
  const guardInFront = sim.guards.some((q) => q.state !== 'down' && Math.abs(q.y - p.y) < 30 && (q.x - p.x) * p.face > 0 && Math.abs(q.x - p.x) < hw + 80);
  if (!guardInFront && !p.atk) {
    for (const q of sim.shots) {
      if (q.dead) continue;
      const dx = q.x - p.x, dy = q.y - (p.y - h / 2);
      if (Math.abs(dx) < hw + 52 && Math.abs(dy) < h && (Math.sign(dx) === p.face || Math.abs(dx) < 8) && (!b.rand || b.rand() > slow * 0.6)) { g.press.slash = true; break; }
    }
  }

  // playing a plan (a slower bot starts it a little late)
  const P = B.plan;
  if (P && P.i === 0 && B.idle > 0 && p.ground) { s.hold([]); B.idle--; return; }
  if (P?.kind === 'mac') {
    if (!p.ground) P.air = true;
    const done = P.mac.kind === 'walk' ? (P.i * STEP >= P.mac.t || P.air) && p.ground && Math.abs(p.vx) < 1 : P.air && p.ground && Math.abs(p.vx) < 1;
    if (p.kbT > 0 || p.inv > 0.9 || done || P.i > 420) B.plan = null;
    else {
      const inp = macroInput(P.mac, P.i, p, P.air);
      const keys = [];
      if (inp.dir < 0) keys.push('left'); if (inp.dir > 0) keys.push('right');
      if (inp.jumpHeld) keys.push('up');
      s.hold(keys); P.i++;
      return;
    }
  } else if (P?.kind === 'chase') {
    // check now and then that the guard still has its back turned
    if (P.i % 30 === 29 && trial(sim, chasePolicy(P.gid), { max: 4, tail: 0.3 }).bad) B.plan = null;
    else {
      const inp = chasePolicy(P.gid)(sim, P.i);
      if (!inp) B.plan = null;
      else {
        s.hold(inp.dir < 0 ? ['left'] : inp.dir > 0 ? ['right'] : []);
        if (inp.slashPress) g.press.slash = true;
        P.i++;
        return;
      }
    }
  } else if (P?.kind === 'wait') {
    s.hold([]);
    if (--P.n > 0) return;
    B.plan = null;
  }

  s.hold([]);
  // knocked off course: steer the fall toward the best place to land
  if (!p.ground) {
    if (p.kbT > 0) return;
    if (!B.airT || --B.airT <= 0) {
      B.airT = 12;
      const gr = graphFor(m, p.k);
      let best = 0, bd = Infinity;
      for (const d of [-1, 0, 1]) {
        const r = simMacro(m, p, { kind: 'drop', d1: d, d2: d });
        const dd = !r ? Infinity : r.exit ? -1 : gr.dist.get(r.node) ?? 999;
        if (dd < bd) { bd = dd; best = d; }
      }
      B.airDir = best;
    }
    s.hold(B.airDir < 0 ? ['left'] : B.airDir > 0 ? ['right'] : []);
    return;
  }
  B.airT = 0;
  if (Math.abs(p.vx) > 1 || p.kbT > 0) return;
  if (B.idle > 0) { B.idle--; return; }

  // the routes were planned from the middle of each tile: when no move gets closer from here, step to the middle
  const moves = rankMoves(m, p, B), here = distHere(m, p);
  if (!moves.length || moves[0].d >= here) {
    const cx = Math.floor(p.x / TILE) * TILE + TILE / 2, dx = cx - p.x;
    if (Math.abs(dx) > 0.35 && B.lastCenter !== cx) {
      B.lastCenter = cx;
      s.hold([dx < 0 ? 'left' : 'right']);
      B.plan = { kind: 'mac', mac: { kind: 'walk', d1: Math.sign(dx), t: Math.min(0.12, Math.abs(dx) / 120) }, i: 1, air: false };
      return;
    }
  }
  B.lastCenter = null;

  const plan = decide(sim, b, B);
  if (!plan) { s.hold([(b.rand ? b.rand() : 0.5) < 0.5 ? 'left' : 'right']); return; }
  B.plan = plan;
  // a slower bot reacts late: it sees the moment, then moves a little after it (so its prediction is stale)
  const lag = plan.kind === 'wait' ? 0 : Math.round(slow * 48 * (b.rand ? b.rand() : 0.5));
  if (lag > 0) { B.idle = lag; return; }
  botStep(s, b, mem);                                   // its first frame, now (the prediction starts now)
}

/** The game's rules, checked after every engine step. */
export function rulesBroken(s) {
  const g = s.game, sim = g.sim, p = sim.p, m = sim.m;
  for (const v of [p.x, p.y, p.vx, p.vy, p.hp]) if (!Number.isFinite(v)) return `a number went NaN (x ${p.x}, y ${p.y}, hp ${p.hp})`;
  if (p.x < 0 || p.x > m.w) return `the Iceman left the vault (x ${p.x.toFixed(1)})`;
  const hw = halfW(p.k) - 1, h = bodyH(p.k) - 1;
  for (const [x, y] of [[p.x, p.y - 1], [p.x - hw, p.y - 2], [p.x + hw, p.y - 2], [p.x, p.y - h]]) if (tileAtPx(m, x, y) === ROCK) return `the Iceman is inside rock at (${x.toFixed(0)}, ${y.toFixed(0)})`;
  if (p.hp < 0 || p.hp > MAX_HP) return `hp ${p.hp} out of range`;
  if (!STAGES.some((st) => st.k === p.k)) return `size ${p.k} is not a stage`;
  if (!p.dead && STAGES.findIndex((st) => st.k === p.k) > stageOf(p.hp)) return `body bigger (${p.k}) than his hp allows (${p.hp})`;
  for (const q of sim.guards) {
    if (!Number.isFinite(q.x + q.y)) return `guard ${q.id} went NaN`;
    if (q.x < q.x0 - 1 || q.x > q.x1 + 1) return `guard ${q.id} left its patrol (x ${q.x.toFixed(0)}, ${q.x0}–${q.x1})`;
    if (!['patrol', 'turn', 'alert', 'hunt', 'down'].includes(q.state)) return `guard ${q.id} in an unknown state ${q.state}`;
    if (q.face !== 1 && q.face !== -1) return `guard ${q.id} faces ${q.face}`;
    if (tileAtPx(m, q.x, q.y - 2) === ROCK) return `guard ${q.id} inside rock`;
  }
  const live = sim.shots.filter((q) => !q.dead);
  if (live.length > MAX_SHOTS) return `${live.length} fireballs in the air (max ${MAX_SHOTS})`;
  for (const q of live) if (!Number.isFinite(q.x + q.y)) return 'a fireball went NaN';
  if (sim.done && !p.dead && Math.abs(p.x - m.exit.x) > 30) return 'the level ended away from the vault door';
  return null;
}

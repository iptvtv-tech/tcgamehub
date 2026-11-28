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
//    5. nothing is safe (it was seen and the guard is throwing): on the freeze levels, freeze that
//       guard into a statue and shatter it; otherwise push on toward the door
//  On the freeze levels the planner's moves include "freeze the lava pool in front, walk across";
//  an ice statue (or any guard the bot froze) is shattered like a takedown, from any side.
//  In the deep vault (11–15) it heads for the ember key first (planMap), freezes a brute from
//  behind before it shatters it (the blade alone bounces off a brute), and when it is low on ice it
//  stands in a cold vent until it has frozen back up.
//  A worse bot (skill < 1) hesitates between moves, so its predictions go stale, and it tries
//  fewer takedowns.
// ─────────────────────────────────────────────────────────────
import { macroInput, simMacro, graphFor, MACROS, EXIT, nodeOf, planMap } from './plan.js';
import { TILE, ROCK, LAVA, MAX_HP, STAGES, stageOf, tileAtPx, halfW, bodyH, isHidden, GUARD_HW, MAX_SHOTS, FREEZE_COST, FREEZE_R, ventBoxOf, playerBox, overlap } from './world.js';

const STEP = 1 / 120;
const NONE = Object.freeze({ dir: 0, jumpPress: false, jumpHeld: false, up: false, down: false, slashPress: false, freezePress: false });
const BAD = new Set(['spotted', 'hurt', 'burn', 'heat', 'melt', 'parry']);
const freezeReady = (sim) => sim.canFreeze && sim.p.hp > FREEZE_COST + 1 && sim.p.frzCD <= 0;

export const newBot = () => ({ plan: null, idle: 0, cache: null });

/** A copy of the level as it is right now, to play forward without touching the real one. */
export function fork(sim) {
  const f = Object.assign(Object.create(Object.getPrototypeOf(sim)), sim);
  const p = sim.p;
  f.p = { ...p, atk: p.atk ? { ...p.atk, hit: [...p.atk.hit] } : null };
  f.m = { ...sim.m, t: sim.m.t.slice() };
  f.ice = sim.ice.map((e) => ({ ...e }));
  f.jets = sim.jets.map((j) => ({ ...j }));
  f.lamps = sim.lamps.map((l) => ({ ...l }));
  f.guards = sim.guards.map((g) => ({ ...g }));
  f.shots = sim.shots.map((b) => ({ ...b }));
  f.shards = sim.shards.map((c) => ({ ...c }));
  f.opals = sim.opals.map((c) => ({ ...c }));
  f.ev = [];
  return f;
}

/**
 * Play policy(f, i) → input (or null once it is finished) on a copy of the level, then stand still
 * for `tail` seconds. bad: he was seen, burned, hurt or parried on the way, or a heat lamp melted
 * more than `lamp` of his ice (a lamp only melts him; it tells no one).
 */
export function trial(sim, policy, { max = 4, tail = 0.6, lamp = 2 } = {}) {
  const f = fork(sim), maxN = Math.round(max / STEP), tailN = Math.round(tail / STEP);
  let end = -1, lampHp = 0;
  for (let i = 0; i < maxN + tailN + 1; i++) {
    let inp = NONE;
    if (end < 0) { inp = i < maxN ? policy(f, i) : null; if (!inp) { end = i; inp = NONE; } }
    if (end >= 0 && i - end >= tailN) return { bad: false, f };
    const hp = f.p.hp, ev = f.step(inp);
    for (const e of ev) {
      if (e.type === 'heat' && e.lamp) { lampHp += hp - f.p.hp; if (lampHp > lamp) return { bad: true, why: 'lamp', at: i * STEP, f }; continue; }
      if (BAD.has(e.type)) return { bad: true, why: e.type, at: i * STEP, f };
    }
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
    if (done(mac, i, p, air) || i > 420 || p.dead) return null;
    return { ...NONE, ...macroInput(mac, i, p, air) };
  };
}
/** A move is over once he has done what it asked and stands still (a walk, or a freeze and walk: its time is up). */
const done = (mac, i, p, air) => (mac.kind === 'walk' || mac.kind === 'freeze'
  ? (i * STEP >= mac.t || air) && p.ground && Math.abs(p.vx) < 1
  : air && p.ground && Math.abs(p.vx) < 1);
const waitPolicy = (n) => (f, i) => (i < n ? NONE : null);

/** Walk up to (a hunting) guard `gid`, freeze it into a statue, then shatter it. */
export function statuePolicy(gid) {
  return (f, i) => {
    const g = f.guards.find((q) => q.id === gid), p = f.p;
    if (!g || g.state === 'down' || p.dead || i > 600) return null;
    if (g.state === 'frozen') return chasePolicy(gid)(f, i);
    const dx = g.x - p.x, side = Math.sign(dx) || p.face, hw = halfW(p.k), d = Math.abs(dx);
    const inp = { ...NONE };
    if (!p.ground) return inp;
    if (d > hw + (g.hw || GUARD_HW) + FREEZE_R - 30) inp.dir = side;
    else if (p.frzCD <= 0) { if (p.hp <= FREEZE_COST + 1) return null; inp.dir = side; inp.freezePress = true; }
    return inp;
  };
}

/** Stand in cold vent `vid` until he has frozen back up (or it takes too long). */
export function chillPolicy(vid) {
  return (f, i) => {
    const v = f.m.vents.find((q) => q.id === vid), p = f.p;
    if (!v || p.dead || p.hp >= MAX_HP - 4 || i > 1100) return null;
    if (!p.ground) return { ...NONE };
    const dx = v.x - p.x;
    if (overlap(playerBox(p), ventBoxOf(v)) && Math.abs(dx) < 6) return { ...NONE };
    return { ...NONE, dir: Math.sign(dx) };
  };
}

/** Creep up behind guard `gid` and slash it (on its floor; over a lava pool in between, freeze it first). */
export function chasePolicy(gid) {
  return (f, i) => {
    const g = f.guards.find((q) => q.id === gid), p = f.p;
    if (!g || g.state === 'down' || p.dead || i > 600) return null;
    const dx = g.x - p.x, side = Math.sign(dx) || p.face, hw = halfW(p.k), d = Math.abs(dx);
    const inp = { ...NONE };
    if (!p.ground) return inp;
    // lava between them on this floor: freeze it from its edge, or give up
    const m = f.m, r = Math.round(p.y / TILE), ca = Math.floor(p.x / TILE), cb = Math.floor(g.x / TILE);
    let pool = -1;
    for (let c = ca; c !== cb; c += side) if (m.t[r * m.C + c] === LAVA) { pool = c; break; }
    if (pool >= 0) {
      const edge = side > 0 ? pool * TILE : (pool + 1) * TILE, gap = (edge - p.x) * side - hw;
      if (gap < FREEZE_R - 12) { if (!freezeReady(f)) return f.canFreeze && f.p.hp > FREEZE_COST + 1 ? inp : null; inp.dir = side; inp.freezePress = true; return inp; }
      inp.dir = side; return inp;
    }
    if (d > hw + GUARD_HW + 34) inp.dir = side;                           // close in
    else if (p.face !== side && !p.atk) inp.dir = side;                   // turn to face its back
    if (p.face === side && d < hw + GUARD_HW + 52 && d > hw + GUARD_HW + 2 && !p.atk && p.atkCD <= 0) inp.slashPress = true;
    return inp;
  };
}

/** The planner's distance (in moves) to the door from where he stands, on the map as drawn. */
const planOf = (sim) => planMap(sim.base, sim.keyGot);
const distHere = (sim, p) => { const m = planOf(sim); return graphFor(m, p.k).dist.get(nodeOf(m, p)) ?? Infinity; };
const canFreeze = freezeReady;

/** Every planner move from where he stands, best first (closest to the door, then quickest).
 *  Planned on the map as drawn (sim.base), flown over the level's live tiles (ice bridges). */
function rankMoves(sim, p, B) {
  const m = planOf(sim), frz = canFreeze(sim);
  const key = `${p.x.toFixed(2)}|${p.y}|${p.k}|${p.face}|${frz}|${sim.keyGot}|${sim.ice.map((e) => e.i).join(',')}`;
  if (B.cache?.key === key) return B.cache.moves;
  const g = graphFor(m, p.k), byNode = new Map();
  for (const mac of MACROS) {
    if (mac.kind === 'freeze' && (!frz || !m.freeze)) continue;
    const res = simMacro(m, p, mac, null, sim.m.t);
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

/** Choose what to do next, standing still on the ground. B.waited: seconds spent waiting in a row
 *  (an alcove is always safe to wait in, so the longer it has waited, the shorter it looks ahead
 *  and the more lamp heat it accepts, so it never waits for ever). */
function decide(sim, b, B) {
  const p = sim.p, skill = b.skill ?? 1, roll = () => (b.rand ? b.rand() : 0.5);
  const bold = Math.min(1, (B.waited || 0) / 8), lamp = 2 + bold * 14;
  // 1. a guard on this floor with its back turned (or frozen into a statue): put it out
  for (const g of sim.guards) {
    if ((g.state !== 'patrol' && g.state !== 'turn' && g.state !== 'frozen') || Math.abs(g.y - p.y) > 4 || Math.abs(g.x - p.x) > 330) continue;
    if (g.state !== 'frozen' && Math.sign(p.x - g.x) !== -g.face) continue;
    if (roll() > 0.25 + skill * 0.75) continue;
    if (g.kind === 'brute' && g.state !== 'frozen') {      // the blade bounces off a brute: freeze it from behind first
      if (!canFreeze(sim)) continue;
      const r = trial(sim, statuePolicy(g.id), { max: 6, tail: 0.4, lamp });
      if (!r.bad && r.f.guards.find((q) => q.id === g.id).state === 'down') return { kind: 'statue', gid: g.id, i: 0 };
      continue;
    }
    const r = trial(sim, chasePolicy(g.id), { max: 5, tail: 0.4, lamp });
    if (!r.bad && r.f.guards.find((q) => q.id === g.id).state === 'down') return { kind: 'chase', gid: g.id, i: 0 };
  }
  // low on ice, and a cold vent on this floor: freeze back up
  if (p.hp < 55 && skill > 0.3) {
    for (const v of sim.m.vents) {
      if (Math.abs(v.y - p.y) > 4 || Math.abs(v.x - p.x) > 300) continue;
      const r = trial(sim, chillPolicy(v.id), { max: 9.5, tail: 0.3, lamp });
      if (!r.bad && r.f.p.hp > p.hp + 20) return { kind: 'chill', vid: v.id, i: 0 };
    }
  }
  // 2. toward the door
  const moves = rankMoves(sim, p, B), here = distHere(sim, p);
  const tail = (0.5 + 1.7 * skill) * (1 - 0.6 * bold);    // he must be able to stand there safely a while after
  if (moves.length && moves[0].d < here && roll() < (1 - skill) * 0.3) return { kind: 'mac', mac: moves[0].mac, i: 0, air: false };   // impatient: just go
  for (const mv of moves.slice(0, 6)) {
    if (mv.d >= here) break;
    if (!trial(sim, macroPolicy(mv.mac), { tail, lamp }).bad) return { kind: 'mac', mac: mv.mac, i: 0, air: false };
  }
  // 3. stand still
  if (!trial(sim, waitPolicy(24), { tail: 0.5 + 1.0 * skill, lamp }).bad) return { kind: 'wait', n: 24 };
  // 4. any safe move: alcoves first, then the closest to the door
  const tries = [...moves.filter((mv) => mv.hidden), ...moves.filter((mv) => !mv.hidden).slice(0, 40)];
  for (const mv of tries) if (!trial(sim, macroPolicy(mv.mac), { tail: 0.5, lamp }).bad) return { kind: 'mac', mac: mv.mac, i: 0, air: false };
  // 5. nothing is safe. A guard after him on this floor: freeze it and shatter it (on the freeze levels)
  if (sim.canFreeze && p.hp > FREEZE_COST + 1) {
    const g = sim.guards.filter((q) => (q.state === 'alert' || q.state === 'hunt') && Math.abs(q.y - p.y) < 4 && Math.abs(q.x - p.x) < 260)
      .sort((a, c) => Math.abs(a.x - p.x) - Math.abs(c.x - p.x))[0];
    if (g) return { kind: 'statue', gid: g.id, i: 0 };
  }
  // …or on toward the door, through it
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
    if (p.kbT > 0 || p.inv > 0.9 || done(P.mac, P.i, p, P.air) || P.i > 420) B.plan = null;
    else {
      const inp = macroInput(P.mac, P.i, p, P.air);
      const keys = [];
      if (inp.dir < 0) keys.push('left'); if (inp.dir > 0) keys.push('right');
      if (inp.jumpHeld) keys.push('up');
      if (inp.freezePress) g.press.freeze = true;
      s.hold(keys); P.i++;
      return;
    }
  } else if (P?.kind === 'statue') {
    const inp = statuePolicy(P.gid)(sim, P.i);
    if (!inp) B.plan = null;
    else {
      s.hold(inp.dir < 0 ? ['left'] : inp.dir > 0 ? ['right'] : []);
      if (inp.slashPress) g.press.slash = true;
      if (inp.freezePress) g.press.freeze = true;
      P.i++;
      return;
    }
  } else if (P?.kind === 'chill') {
    if (P.i % 30 === 29 && trial(sim, chillPolicy(P.vid), { max: 9.5, tail: 0.3, lamp: 16 }).bad) B.plan = null;
    else {
      const inp = chillPolicy(P.vid)(sim, P.i);
      if (!inp) B.plan = null;
      else { s.hold(inp.dir < 0 ? ['left'] : inp.dir > 0 ? ['right'] : []); P.i++; return; }
    }
  } else if (P?.kind === 'chase') {
    // check now and then that the guard still has its back turned
    if (P.i % 30 === 29 && trial(sim, chasePolicy(P.gid), { max: 5, tail: 0.3, lamp: 16 }).bad) B.plan = null;
    else {
      const inp = chasePolicy(P.gid)(sim, P.i);
      if (!inp) B.plan = null;
      else {
        s.hold(inp.dir < 0 ? ['left'] : inp.dir > 0 ? ['right'] : []);
        if (inp.slashPress) g.press.slash = true;
        if (inp.freezePress) g.press.freeze = true;
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
      const pm = planOf(sim), gr = graphFor(pm, p.k);
      let best = 0, bd = Infinity;
      for (const d of [-1, 0, 1]) {
        const r = simMacro(pm, p, { kind: 'drop', d1: d, d2: d }, null, m.t);
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
  const moves = rankMoves(sim, p, B), here = distHere(sim, p);
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
  B.waited = plan.kind === 'wait' ? (B.waited || 0) + plan.n * STEP : 0;
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
    if (!['patrol', 'turn', 'alert', 'hunt', 'down', 'frozen'].includes(q.state)) return `guard ${q.id} in an unknown state ${q.state}`;
    if (q.face !== 1 && q.face !== -1) return `guard ${q.id} faces ${q.face}`;
    if (tileAtPx(m, q.x, q.y - 2) === ROCK) return `guard ${q.id} inside rock`;
  }
  const live = sim.shots.filter((q) => !q.dead);
  if (live.length > MAX_SHOTS) return `${live.length} fireballs in the air (max ${MAX_SHOTS})`;
  for (const q of live) if (!Number.isFinite(q.x + q.y)) return 'a fireball went NaN';
  if (sim.done && !p.dead && Math.abs(p.x - m.exit.x) > 30) return 'the level ended away from the vault door';
  return null;
}

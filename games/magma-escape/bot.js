// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — the test bot, shared by test.mjs and bench.mjs. It plays only through the
//  controls a player has: it holds ◀ ▶ ▲ ▼ (s.hold) and presses SLASH (the game's own press flag).
//
//  Climbing: when it stands still it asks the planner (plan.js) for the best move from exactly
//  where it is, then plays that move frame by frame. Fighting: an ember in reach gets slashed,
//  an ember below it in mid-air gets a jump-stab. A hit or a burn throws it off course; it
//  re-plans once it has landed. skill (0..1) makes a worse bot slower to react and sloppier.
// ─────────────────────────────────────────────────────────────
import { bestMove, macroInput, simMacro, graphFor, distHere } from './plan.js';
import { TILE, ROCK, MAX_HP, STAGES, stageOf, tileAtPx, halfW, bodyH } from './world.js';
import { bossDazed, PILLAR_HW } from './boss.js';

export const newBot = () => ({ mac: null, i: 0, air: false, idle: 0, turn: 0 });

/** One step of play. s = the (headless) shell, b = { skill, rand(), mem } from the benchmark or the test. */
export function botStep(s, b, mem) {
  const g = s.game, sim = g.sim, p = sim.p, m = sim.m;
  if (!mem.bot) mem.bot = newBot();
  const B = mem.bot;
  if (p.dead || sim.done) { s.hold([]); return; }
  if (bossStep(s, b, mem)) return;
  const hw = halfW(p.k), h = bodyH(p.k), slow = 1 - (b.skill ?? 1);
  // embers within reach: in front, above, or below while in the air
  let slash = false, down = false, faceTo = 0;
  for (const e of sim.embers) {
    if (e.dead || e.state === 'warn') continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const ahead = Math.sign(dx) === p.face || Math.abs(dx) < 4;
    if (Math.abs(dy) < h + 10 && Math.abs(dx) < hw + 44) { if (ahead) slash = true; else faceTo = Math.sign(dx); }
    else if (!p.ground && dy > 0 && dy < 60 && Math.abs(dx) < hw + 12) { slash = true; down = true; }
  }
  for (const q of [...sim.shots, ...sim.rocks]) {
    if (q.dead || q.warn > 0) continue;
    const dx = q.x - p.x, dy = q.y - (p.y - h / 2);
    if (Math.abs(dx) < hw + 40 && Math.abs(dy) < h + 30 && (Math.sign(dx) === p.face || Math.abs(dx) < 10)) slash = true;
  }
  if (slash && (b.rand ? b.rand() > slow * 0.6 : true)) g.press.slash = true;

  // in the middle of a move: play its next frame (abort if a hit knocked it off course)
  if (B.mac) {
    if (!p.ground) B.air = true;
    const done = B.mac.kind === 'walk' ? (B.i * (1 / 120) >= B.mac.t || B.air) && p.ground && Math.abs(p.vx) < 1 : B.air && p.ground && Math.abs(p.vx) < 1;
    if (p.kbT > 0 || p.inv > 0.9 || done || B.i > 420) B.mac = null;
    else {
      const inp = macroInput(B.mac, B.i, p, B.air);
      const keys = [];
      if (inp.dir < 0) keys.push('left'); if (inp.dir > 0) keys.push('right');
      if (inp.jumpHeld) keys.push('up');
      if (down && !p.ground) keys.push('down');
      s.hold(keys); B.i++;
      return;
    }
  }
  // standing: turn to face an ember behind it, else (once still) pick the next move
  s.hold([]);
  if (faceTo && p.ground) { s.hold([faceTo < 0 ? 'left' : 'right']); return; }
  // thrown off course (a hit, a burn): steer the fall toward the best place to land
  if (!p.ground) {
    if (p.kbT > 0) return;
    if (!B.airT || --B.airT <= 0) {
      B.airT = 12;
      const g = graphFor(m, p.k);
      let best = 0, bd = Infinity;
      for (const d of [-1, 0, 1]) {
        const r = simMacro(m, p, { kind: 'drop', d1: d, d2: d });
        const dd = !r ? Infinity : r.exit ? -1 : g.dist.get(r.node) ?? 999;
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
  // the route was planned from the middle of each tile: when nothing gets closer from here, step to the middle
  if (B.center != null) {
    const dx = B.center - p.x;
    if (Math.abs(dx) > 6) { s.hold([dx < 0 ? 'left' : 'right']); return; }
    if (Math.abs(dx) > 0.35) { if (Math.abs(p.vx) < 1) s.hold([dx < 0 ? 'left' : 'right']); return; }
    B.center = null;
  }
  const mv = bestMove(m, p);
  if (mv && mv.d >= distHere(m, p) - 1e-6 && mv.d >= 0) {
    const cx = Math.floor(p.x / TILE) * TILE + TILE / 2;
    if (Math.abs(cx - p.x) > 0.35 && B.lastCenter !== cx) { B.center = cx; B.lastCenter = cx; return; }
  }
  B.lastCenter = null;
  if (!mv) { s.hold([(b.rand ? b.rand() : 0.5) < 0.5 ? 'left' : 'right']); return; }
  B.mac = mv.mac; B.i = 0; B.air = false;
  B.idle = Math.round(slow * 20 * (b.rand ? b.rand() : 0.5));       // a slower bot hesitates between moves
}

/** The game's rules, checked after every engine step (lastLava: the lava's height a step ago, or null). */
export function rulesBroken(s, lastLava = null) {
  const g = s.game, sim = g.sim, p = sim.p, m = sim.m;
  for (const v of [p.x, p.y, p.vx, p.vy, p.hp, sim.lava.y]) if (!Number.isFinite(v)) return `a number went NaN (x ${p.x}, y ${p.y}, hp ${p.hp})`;
  if (p.x < 0 || p.x > m.w) return `the Iceman left the shaft (x ${p.x.toFixed(1)})`;
  const hw = halfW(p.k) - 1, h = bodyH(p.k) - 1;
  for (const [x, y] of [[p.x, p.y - 1], [p.x - hw, p.y - 2], [p.x + hw, p.y - 2], [p.x, p.y - h]]) if (tileAtPx(m, x, y) === ROCK) return `the Iceman is inside rock at (${x.toFixed(0)}, ${y.toFixed(0)})`;
  if (p.hp < 0 || p.hp > MAX_HP) return `hp ${p.hp} out of range`;
  if (!STAGES.some((st) => st.k === p.k)) return `size ${p.k} is not a stage`;
  if (!p.dead && STAGES.findIndex((st) => st.k === p.k) > stageOf(p.hp)) return `body bigger (${p.k}) than his hp allows (${p.hp})`;
  if (lastLava != null && sim.lava.y > lastLava + 1e-6) return `the lava sank (${lastLava} → ${sim.lava.y})`;
  const alive = sim.embers.filter((e) => !e.dead).length;
  if (alive > sim.plan.max) return `${alive} embers alive (max ${sim.plan.max})`;
  for (const e of sim.embers) if (!e.dead && e.state !== 'warn' && e.kind !== 'bat' && tileAtPx(m, e.x, e.y - 2) === ROCK) return `${e.kind || 'ember'} ${e.id} inside rock`;
  for (const b of [...sim.shots, ...sim.rocks]) if (!b.dead && !Number.isFinite(b.x + b.y)) return 'a fireball or rock went NaN';
  const B = sim.boss;
  if (B) {
    if (!Number.isFinite(B.x + B.y)) return 'the boss went NaN';
    if (B.hp < 0 || B.hp > B.max) return `boss hp ${B.hp} out of range`;
    if (!B.dead && (B.x < B.x0 - 1 || B.x > B.x1 + 1)) return `the ${B.kind} left the arena (x ${B.x.toFixed(0)})`;
    if (sim.done && !B.dead) return 'out through the vent while the boss lived';
  }
  return null;
}

/**
 * A boss arena while the boss lives: fight on the floor. Returns false once the boss has fallen
 * (then botStep climbs to the vent as usual).
 *   Golem: keep ~150 px away, jump its shockwaves, slash boulders, and when its fists are stuck,
 *          run in and slash.
 *   Drake: stay in the middle, slash fireballs; when it rears up to dive, run away from it (toward
 *          the middle: it always hangs on the wall side); when it lies dazed, run in and slash.
 *   Lord:  the golem's plan, plus: when his shadow stops (locked), run out from under it; when
 *          fire-pillar marks glow, stand in a gap between them.
 */
export function bossStep(s, b, mem) {
  const g = s.game, sim = g.sim, p = sim.p, B = sim.boss;
  if (!B || B.dead) return false;
  const M = (mem.boss ||= { jumpT: 0 });
  if (p.dead || B.state === 'intro') { s.hold([]); return true; }
  const hw = halfW(p.k), h = bodyH(p.k), slow = 1 - (b.skill ?? 1);
  const lo = B.x0 + 22, hi = B.x1 - 22, clampX = (x) => Math.max(lo, Math.min(hi, x));
  const keys = [];
  let target = p.x, jump = false, slash = false, faceTo = Math.sign(B.x - p.x) || p.face;

  // in the air off the raft (the lava threw him up): steer back over the floor
  if (!p.ground && (p.x < lo || p.x > hi)) { s.hold([p.x < lo ? 'right' : 'left']); return true; }

  if (B.kind === 'golem' || B.kind === 'lord') {
    if (bossDazed(B)) target = B.x - faceTo * (B.hw + hw + 26);
    else if (B.kind === 'lord' && (B.state === 'hunt' || B.state === 'fall' || B.state === 'air' || B.state === 'crouch')) {
      // a leap: wait while the shadow hunts, run out from under it once it stops
      const danger = (B.state === 'fall' || B.locked) && Math.abs(p.x - B.tx) < B.hw + hw + 46;
      if (danger) {
        let away = Math.sign(p.x - B.tx) || (p.x < (lo + hi) / 2 ? 1 : -1);
        if ((away < 0 && p.x - lo < 70) || (away > 0 && hi - p.x < 70)) away = -away;
        target = clampX(B.tx + away * (B.hw + hw + 90));
      } else target = p.x;
      faceTo = Math.sign(B.tx - p.x) || faceTo;
    }
    else {
      const side = Math.sign(p.x - B.x) || 1;
      let t = B.x + side * 165;
      if (t < lo || t > hi) t = B.x - side * 165;
      if (t < lo || t > hi) t = clampX(B.x + side * 165);
      // don't run through the golem to get there: only switch sides over its head
      target = Math.sign(t - B.x) === side ? t : clampX(B.x + side * 165);
    }
    for (const w of sim.waves) {
      if (w.dead) continue;
      const d = p.x - w.x;
      if (Math.sign(d) === Math.sign(w.vx) && Math.abs(d) < 46 + hw && p.ground) jump = true;
    }
  } else {
    const mid = (B.x0 + B.x1) / 2;
    if (bossDazed(B)) target = B.x - faceTo * (B.hw + hw + 24);
    else if (B.state === 'rear' || B.state === 'dive') {
      let away = Math.sign(p.x - B.x) || (p.x < mid ? 1 : -1);
      if ((away < 0 && p.x - lo < 90) || (away > 0 && hi - p.x < 90)) away = -away;
      target = clampX(p.x + away * 200);
      M.away = away;
    } else target = clampX(mid + (p.x < mid ? -40 : 40));
  }
  // fire pillars: stand in a gap between the marks
  const live = sim.pillars.filter((q) => !q.dead);
  if (live.length) {
    const unsafe = (x) => live.some((q) => Math.abs(x - q.x) < PILLAR_HW + hw + 5);
    if (unsafe(target) || unsafe(p.x)) {
      let best = null;
      for (let x = lo; x <= hi; x += 4) if (!unsafe(x) && (best == null || Math.abs(x - p.x) < Math.abs(best - p.x))) best = x;
      if (best != null) target = best;
    }
  }
  // rocks shaken loose: step out from under their shadows
  for (const q of sim.rocks) if (!q.dead && Math.abs(q.x - p.x) < hw + 16 && Math.abs(q.land - p.y) < 30) target = clampX(p.x + (p.x < q.x ? -70 : 70));

  // threats the blade can meet: fireballs, boulders, embers
  for (const q of sim.shots) {
    if (q.dead) continue;
    const dx = q.x - p.x, dy = q.y - (p.y - h / 2), r = q.r || 7;
    if (Math.abs(dx) < hw + 46 + r && Math.abs(dy) < h + 20 && (Math.sign(dx) === p.face || Math.abs(dx) < 10)) slash = true;
  }
  for (const e of sim.embers) {
    if (e.dead || e.state === 'warn') continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (Math.abs(dy) < h + 10 && Math.abs(dx) < hw + 44) { if (Math.sign(dx) === p.face) slash = true; else faceTo = Math.sign(dx); }
  }
  if (bossDazed(B) && Math.abs(B.x - p.x) < B.hw + hw + 50 && p.face === Math.sign(B.x - p.x) && Math.abs(p.y - B.y) < 60) slash = true;

  // move: toward the target, then turn to face the boss
  const dx = target - p.x;
  if (Math.abs(dx) > 8) keys.push(dx < 0 ? 'left' : 'right');
  else if (p.ground && p.face !== faceTo && Math.abs(p.vx) < 30) keys.push(faceTo < 0 ? 'left' : 'right');
  if (jump || (M.jumpT > 0 && !p.ground)) { keys.push('up'); M.jumpT = jump ? 0.3 : M.jumpT - 1 / 120; }
  else M.jumpT = 0;
  if (slash && (b.rand ? b.rand() > slow * 0.6 : true)) g.press.slash = true;
  s.hold(keys);
  mem.bot = null;                      // after the fight the climb starts fresh
  return true;
}

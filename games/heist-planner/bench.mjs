// Benchmark contract for Heist Planner (see tools/bench.mjs). The museum runs on fixed timetables
// the player can scrub through before pressing GO, so the bot plans like a careful player: the
// hacker walks to a terminal (cameras and lasers go off while she stands there), the muscle
// smashes every locked door, the thief grabs the loot (or the vault prize) — each one a search
// over (tile, step) for a route nobody sees — and the hacker leaves her terminal once nobody
// needs her any more (or, failing that, after a set wait, as tools/check-heist-levels.mjs plans).
// It types the plan in through the controls (tap a crew card, CLEAR, arrow keys for steps, Space
// to wait, tap GO, Space to fast-forward the replay), drawing the screen first so the buttons are
// where the player sees them; it plans within what the planner accepts (no following the muscle
// through a door on the step she smashes it). A lower-skill bot types slower and gets some rules
// wrong on its first tries — guards see a tile less far, you can slip past a guard walking the
// other way, a laser goes off a step sooner, a camera turns a step sooner — and finds out on the
// replay; after an alarm it clears the plan and plans again, more carefully and wary of the step
// that got it caught. Safe Cracker: press Space on the notch (worse timing at lower skill).
// The mistake: rush in and walk the thief (or, if walled in, the muscle / hacker) straight into
// a guard's view, a camera or a live laser.
import { COLS, ROWS, MOVES, tileAt, canWalk, watcherAt, laserOn, vision, spotted, trace } from './sim.js';

const W = 480, TS = 36, BX = (W - COLS * TS) / 2, BY = 52;
const TOP = BY + ROWS * TS + 10;                                 // the planning panel (drawPanel)
const GO = [12 + 3 * 116 + 54, TOP + 64 + 8 + 40 + 22];          // ▶ GO! button centre
const CLEAR = [12 + 2 * 116 + 54, GO[1]];                        // ✖ CLEAR button centre
const KEYS = ['U', 'D', 'L', 'R', 'W'];
const ACTION = { U: 'up', D: 'down', L: 'left', R: 'right', W: 'action' };
const MAX_PLAN = 99, TMAX = 100;

// a canvas context that draws nothing (the screen is drawn only so the buttons exist)
const CTX = new Proxy(function () {}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 0 }) : CTX), set: () => true, apply: () => CTX });
const cardAt = (L, i) => { const n = L.crew.length, tw = (W - 24 - (n - 1) * 8) / n; return [12 + i * (tw + 8) + tw / 2, TOP + 32]; };

// ── How a (possibly sloppy) player reads the rules ─────────────────────────────────────────
/** spotted() as this player reads it: `mode` is a string of the rules it gets wrong ('' = none). */
function seenAs(mode) {
  if (!mode) return spotted;
  const has = (k) => mode.includes(k);
  return (L, t, x, y, prev, hacked, open) => {
    if (!hacked) for (const l of L.lasers) {
      if (!l.set.has(`${x},${y}`)) continue;
      const on = has('blink') && l.off ? ((t + l.offset) % (l.on + l.off)) < l.on - 1 : laserOn(l, t);
      if (on) return 'laser';
    }
    const hidden = tileAt(L, x, y) === 'H';
    for (const w of L.watchers) {
      if (w.type === 'camera' && hacked) continue;
      const st = watcherAt(w, w.type === 'camera' && has('turn') ? t + 1 : t);
      if (w.type === 'guard') {
        if (st.x === x && st.y === y) return 'guard';
        if (prev && !has('swap')) { const b = watcherAt(w, t - 1); if (b.x === x && b.y === y && st.x === prev[0] && st.y === prev[1]) return 'guard'; }
      }
      if (hidden) continue;
      const v = has('short') && w.type === 'guard' ? { vision: w.vision - 1 } : w;
      for (const [vx, vy] of vision(L, v, st, open)) if (vx === x && vy === y) return w.type;
    }
    return null;
  };
}
const MODES = ['short', 'swap', 'blink', 'turn'];

// ── Planning: time-expanded searches, one crew member at a time ──────────────────────────────
/** Earliest route for one member from start at step t0 to a goal, never seen (as `see` reads it)
 *  and avoiding steps it has learnt are watched (`no`: Set of "t,x,y"). Masks track smashed doors
 *  (muscle) or loot taken (thief). Returns { x, y, t, m, path } or null. */
function bfs(L, id, start, t0, goal, ctx, maskOf = () => 0, maskStep = (m) => m) {
  const q = [[start[0], start[1], t0, maskOf(start), '']];
  const seen = new Set([((t0 * ROWS + start[1]) * COLS + start[0]) * 64 + q[0][3]]);
  for (let h = 0; h < q.length; h++) {
    const [x, y, t, m, path] = q[h];
    if (goal(x, y, t, m) && (!ctx.stayFor || stays(L, id, x, y, t, m, ctx))) return { x, y, t, m, path };
    if (t >= TMAX || path.length >= MAX_PLAN) continue;
    for (const k of KEYS) {
      const [dx, dy] = MOVES[k];
      const nx = x + dx, ny = y + dy, nt = t + 1;
      // a door must already be open on the step before (the planner's own check: addMove looks at
      // where everyone is before the step, so it refuses to follow the muscle through on the step she smashes it)
      if ((dx || dy) && !canWalk(L, id, nx, ny, ctx.open(t, m))) continue;
      const nm = maskStep(m, nx, ny);
      if (ctx.no?.has(`${nt},${nx},${ny}`)) continue;
      if (ctx.see(L, nt, nx, ny, [x, y], ctx.hacked(nt, nx, ny), (ctx.seeOpen || ctx.open)(nt, nm))) continue;
      const key = ((nt * ROWS + ny) * COLS + nx) * 64 + nm;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([nx, ny, nt, nm, path + k]);
    }
  }
  return null;
}
function stays(L, id, x, y, t, m, ctx) {
  for (let k = t + 1; k <= t + ctx.stayFor; k++) {
    if (ctx.no?.has(`${k},${x},${y}`)) return false;
    if (ctx.see(L, k, x, y, [x, y], ctx.hacked(k, x, y), (ctx.seeOpen || ctx.open)(k, m))) return false;
  }
  return true;
}
/** Where a member is at every step of its plan (and after it, standing still). */
function track(L, id, start, plan, openAt) {
  const pos = [[...start]];
  let [x, y] = start;
  for (let t = 1; t <= TMAX + 60; t++) {
    const [dx, dy] = MOVES[plan[t - 1] || 'W'];
    if ((dx || dy) && canWalk(L, id, x + dx, y + dy, openAt(t))) { x += dx; y += dy; }
    pos.push([x, y]);
  }
  return pos;
}

/** Plays a plan through the rules as this player reads them: the step and member it fails on. */
function check(L, plans, see) {
  const T = Math.max(1, ...Object.values(plans).map((p) => p.length));
  const fr = trace(L, plans, T);
  const taken = new Set();
  let prize = false;
  for (let t = 1; t <= T; t++) {
    for (const c of fr[t].crew) {
      const p = fr[t - 1].crew.find((q) => q.id === c.id);
      if (see(L, t, c.x, c.y, [p.x, p.y], fr[t].hacked, fr[t].open)) return { step: t, who: c.id, x: c.x, y: c.y };
      if (c.id === 'T' && L.loot.some(([x, y]) => x === c.x && y === c.y)) taken.add(`${c.x},${c.y}`);
      if (c.id === 'T' && L.vault && c.x === L.vault[0] && c.y === L.vault[1] && taken.size === L.loot.length) prize = true;
    }
  }
  if (taken.size < L.loot.length || (L.vault && !prize)) return { step: T, who: 'T', why: 'loot' };
  if (!L.vault && fr[T].crew.some((c) => tileAt(L, c.x, c.y) !== 'E')) return { step: T, who: '?', why: 'left' };
  return null;
}

/** A whole plan for the crew, as this player reads the rules. `no` = { id: Set("t,x,y") }.
 *  First try: the hacker reaches a terminal, the others plan as if she stays there, and she
 *  leaves once nobody needs the cameras off. Then, as tools/check-heist-levels.mjs does: the
 *  hacker waits W steps on the terminal and leaves, and the others plan round her timetable. */
function solve(L, see, no = {}) {
  const who = Object.fromEntries(L.crew.map((c) => [c.id, [c.x, c.y]]));
  const vault = !!L.vault;
  const isExit = (x, y) => vault || tileAt(L, x, y) === 'E';   // the treasury has no vans: the prize ends it
  const doorIdx = new Map(L.doors.map(([x, y], i) => [`${x},${y}`, i]));
  const lootIdx = new Map(L.loot.map(([x, y], i) => [`${x},${y}`, i]));
  const allDoors = (1 << L.doors.length) - 1, allLoot = (1 << L.loot.length) - 1;
  const doorsOf = (m) => new Set(L.doors.filter((_, i) => m & (1 << i)).map(([x, y]) => `${x},${y}`));
  const allOpen = new Set(L.doors.map(([x, y]) => `${x},${y}`));
  const onC = (x, y) => tileAt(L, x, y) === 'C';
  const STAYS = [0, 12, 30, 60];

  /** Muscle then thief, round a known hacked(t). */
  function others(hackedAt, STAY) {
    const plans = {};
    let mpos = null, doorsAt = () => new Set();
    if (who.M) {
      const r = bfs(L, 'M', who.M, 0, (x, y, t, m) => m === allDoors && isExit(x, y),
        { see, hacked: hackedAt, open: (t, m) => doorsOf(m), stayFor: STAY, no: no.M },
        ([x, y]) => (doorIdx.has(`${x},${y}`) ? 1 << doorIdx.get(`${x},${y}`) : 0),
        (m, x, y) => (doorIdx.has(`${x},${y}`) ? m | (1 << doorIdx.get(`${x},${y}`)) : m));
      if (!r) return null;
      plans.M = r.path;
      mpos = track(L, 'M', who.M, plans.M, () => allOpen);
      const opened = new Map();
      mpos.forEach(([x, y], t) => { const k = `${x},${y}`; if (doorIdx.has(k) && !opened.has(k)) opened.set(k, t); });
      doorsAt = (t) => new Set([...opened].filter(([, t0]) => t0 <= t).map(([k]) => k));
    }
    let tpos = null;
    if (who.T) {
      const goal = vault ? (x, y, t, m) => m === allLoot && x === L.vault[0] && y === L.vault[1] : (x, y, t, m) => m === allLoot && isExit(x, y);
      const r = bfs(L, 'T', who.T, 0, goal, { see, hacked: hackedAt, open: (t) => doorsAt(t), stayFor: vault ? 0 : STAY, no: no.T },
        ([x, y]) => (lootIdx.has(`${x},${y}`) ? 1 << lootIdx.get(`${x},${y}`) : 0),
        (m, x, y) => (lootIdx.has(`${x},${y}`) ? m | (1 << lootIdx.get(`${x},${y}`)) : m));
      if (!r) return null;
      plans.T = r.path;
      tpos = track(L, 'T', who.T, plans.T, doorsAt);
    }
    return { plans, mpos, tpos, doorsAt };
  }
  const done = (plans) => {
    for (const c of L.crew) plans[c.id] ??= '';
    return !Object.values(plans).some((p) => p.length > MAX_PLAN) && !check(L, plans, see);
  };

  if (!who.K || !L.terminals.length) {
    for (const STAY of STAYS) { const o = others(() => false, STAY); if (o && done(o.plans)) return o.plans; }
    return null;
  }
  const a = bfs(L, 'K', who.K, 0, onC, { see, hacked: (t, x, y) => onC(x, y), open: () => new Set(), seeOpen: () => allOpen, no: no.K });
  if (!a) return null;
  // A) she stays on the terminal until nobody needs her
  for (const STAY of STAYS) {
    const o = others((t) => t >= a.t, STAY);
    if (!o) continue;
    let need = a.t;
    for (let t = 1; t <= TMAX; t++) for (const pos of [o.tpos, o.mpos]) if (pos && see(L, t, pos[t][0], pos[t][1], pos[t - 1], false, o.doorsAt(t))) need = t;
    for (const extra of vault ? [0] : [0, 4, 10, 20]) {
      const leave = need + extra;
      if (!stays(L, 'K', a.x, a.y, a.t, 0, { see, hacked: () => true, open: () => new Set(), seeOpen: o.doorsAt, stayFor: (vault ? Math.max(a.t, ...Object.values(o.plans).map((p) => p.length)) : leave) - a.t, no: no.K })) continue;
      if (vault) { const plans = { ...o.plans, K: a.path }; if (done(plans)) return plans; continue; }
      const b = bfs(L, 'K', [a.x, a.y], leave, isExit, { see, hacked: (t, x, y) => onC(x, y), open: () => new Set(), seeOpen: o.doorsAt, stayFor: STAY, no: no.K });
      if (!b) continue;
      const plans = { ...o.plans, K: a.path + 'W'.repeat(leave - a.t) + b.path };
      if (done(plans)) return plans;
    }
  }
  // B) she waits W steps, leaves, and the others plan round her
  if (vault) return null;
  for (const STAY of STAYS) {
    for (let w = 0; w < 45; w++) {
      if (!stays(L, 'K', a.x, a.y, a.t, 0, { see, hacked: () => true, open: () => new Set(), seeOpen: () => allOpen, stayFor: w, no: no.K })) break;
      const b = bfs(L, 'K', [a.x, a.y], a.t + w, isExit, { see, hacked: (t, x, y) => onC(x, y), open: () => new Set(), seeOpen: () => allOpen, stayFor: STAY, no: no.K });
      if (!b) continue;
      const K = a.path + 'W'.repeat(w) + b.path;
      const kpos = track(L, 'K', who.K, K, () => new Set());
      const o = others((t) => onC(...kpos[Math.min(t, kpos.length - 1)]), STAY);
      if (!o) continue;
      const plans = { ...o.plans, K };
      if (done(plans)) return plans;
    }
  }
  return null;
}

/** The mistake: walk one of the crew (the thief if it can) straight into the first spot that
 *  is watched, by the real rules. Returns { id, path }. */
function trap(L) {
  for (const id of ['T', 'M', 'K']) {
    const c = L.crew.find((q) => q.id === id);
    if (!c) continue;
    const q = [[c.x, c.y, 0, '', '']], seen = new Set();
    for (let h = 0; h < q.length; h++) {
      const [x, y, t, path, smashed] = q[h];
      if (t >= 60) continue;
      for (const k of KEYS) {
        const [dx, dy] = MOVES[k];
        const nx = x + dx, ny = y + dy, nt = t + 1;
        const open = new Set(smashed ? smashed.split(' ') : []);
        if ((dx || dy) && !canWalk(L, id, nx, ny, open)) continue;
        const now = tileAt(L, nx, ny) === 'D' && !open.has(`${nx},${ny}`) ? (smashed ? `${smashed} ${nx},${ny}` : `${nx},${ny}`) : smashed;
        if ((dx || dy) && spotted(L, nt, nx, ny, [x, y], id === 'K' && tileAt(L, nx, ny) === 'C', new Set(now ? now.split(' ') : []))) return { id, path: path + k };
        const key = `${nx},${ny},${nt},${now}`;
        if (seen.has(key)) continue;
        seen.add(key); q.push([nx, ny, nt, path + k, now]);
      }
    }
  }
  return { id: 'T', path: 'W' };
}

// expert plans are the same for every run of a level: work each out once
const cache = new Map();
function planFor(g, b) {
  const L = g.L, m = b.mem;
  const no = (m.no ??= {});
  const misread = m.misread ?? (1 - b.skill) * 1.2;               // chance it gets each rule wrong this attempt
  const mode = MODES.filter(() => b.rand() < misread).join(' ');
  m.misread = misread * 0.5;                                     // each alarm makes it more careful
  const key = `${g.level}|${mode}|${JSON.stringify(Object.entries(no).map(([k, v]) => [k, [...v].sort()]))}`;
  if (!cache.has(key)) cache.set(key, solve(L, seenAs(mode), no) ?? (mode ? solve(L, spotted, no) : null) ?? solve(L, spotted));
  return cache.get(key);
}

/** The inputs that type this plan in: for each member a tap on its card, CLEAR, then its steps
 *  (hacker and muscle first: the game only lets the others plan through a door once the muscle's
 *  plan has smashed it). */
function opsFor(g, plans) {
  const ops = [];
  const order = [...g.L.crew.entries()].sort(([, p], [, q]) => 'KMT'.indexOf(p.id) - 'KMT'.indexOf(q.id));
  order.forEach(([i, c]) => {
    if (!g.plans[c.id] && !plans[c.id]) return;
    ops.push({ tap: cardAt(g.L, i) }, { tap: CLEAR });
    for (const k of plans[c.id]) ops.push({ key: ACTION[k] });
  });
  ops.push({ tap: GO });
  return ops;
}

/** Work through the queued inputs at the player's pace: one input, then a short pause. */
function drive(g, s, b) {
  const m = b.mem;
  if (s.input.down.size) { s.hold([]); return; }               // let go of the last key first
  if (b.t < (m.wait ?? 0) || !m.ops?.length) return;
  const op = m.ops.shift();
  if (op.key) s.keyDown(op.key);
  else { g.render(CTX); s.tap(op.tap[0], op.tap[1]); }          // the screen is drawn every frame in the real game
  m.wait = b.t + m.pace * (0.6 + b.rand() * 0.8);
}

/** Safe Cracker: press when the dial is on the notch (a worse player's timing is off). */
function crack(g, s, b) {
  const sf = g.safe, m = b.mem;
  if (s.input.down.size) return s.hold([]);
  m.err ??= (b.rand() - 0.5) * (1 - b.skill) * 0.9;
  const d = ((sf.ang - sf.target) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  if (Math.abs(d + m.err) < 0.03 + sf.width * 0.15 * b.skill) { s.keyDown('action'); m.err = null; }
}

export default {
  // jobs 1–15 (5 and 10 are the Safe Cracker bonus) + the secret Royal Treasury (16). The
  // fastest plans are 15–47 steps (tools/check-heist-levels.mjs): studying the map and typing a
  // plan in takes the bot 4–8 s, the replay 0.26 s a step (a third of that fast-forwarded), an
  // alarm 1.6 s + 2 s — the expert needs 6–13 s a job, ~18 s with the mistake
  limit: () => 60,
  stuck: 8,                      // something is typed in or played out several times a second

  // plan steps typed in, then replay steps played; every failed plan moves it on too
  progress(g) {
    if (g.bonus) return g.safe.cracked * 10 + g.safe.tumbler;
    const typed = Object.values(g.plans).reduce((n, p) => n + p.length, 0);
    return g.fails * 1000 + (g.phase === 'plan' ? typed : 500 + (g.run?.i ?? 0));
  },

  invariants(g, s) {
    if (g.bonus) {
      const sf = g.safe;
      if (![sf.ang, sf.speed, sf.target, sf.width].every(Number.isFinite)) return 'the safe dial is not a number';
      if (sf.tumbler < 0 || sf.tumbler > 2 || !Number.isInteger(sf.tumbler)) return `tumbler ${sf.tumbler} (0–2)`;
      if (sf.cracked < 0 || !Number.isInteger(sf.cracked)) return `safes cracked ${sf.cracked}`;
      if (sf.width < 0.22 - 1e-9 || sf.width > 0.42 + 1e-9) return `notch width ${sf.width}`;
      if (Math.abs(sf.speed) > 30) return `dial speed ${sf.speed}`;
      if (s.livesLost) return 'a life was lost in the Safe Cracker bonus';
      return null;
    }
    const L = g.L;
    if (!['plan', 'run', 'alarm'].includes(g.phase)) return `unknown phase ${g.phase}`;
    if (!g.plans[g.sel]) { if (g.plans[g.sel] !== '') return `selected crew ${g.sel} is not in the crew`; }
    for (const c of L.crew) {
      const p = g.plans[c.id];
      if (typeof p !== 'string' || p.length > MAX_PLAN || /[^UDLRW]/.test(p)) return `${c.id}'s plan is "${p}"`;
    }
    for (const w of L.watchers) {
      const st = watcherAt(w, Math.max(0, g.view));
      if (w.type === 'guard' && !canWalk(L, 'M', st.x, st.y, new Set(L.doors.map(([x, y]) => `${x},${y}`)))) return `a guard is in a wall at (${st.x}, ${st.y})`;
    }
    if (g.phase !== 'plan') {
      const r = g.run, fr = r.res.frames;
      if (r.i < 0 || r.i > fr.length - 1) return `replay step ${r.i} of ${fr.length - 1}`;
      if (!r.res.ok && !r.res.fail) return 'a failed plan with no reason';
      const now = fr[r.i], before = fr[Math.max(0, r.i - 1)];
      for (const c of now.crew) {
        if (!canWalk(L, c.id, c.x, c.y, now.open)) return `${c.id} stands on '${tileAt(L, c.x, c.y)}' at (${c.x}, ${c.y}) on step ${r.i}`;
        const p = before.crew.find((q) => q.id === c.id);
        if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) > 1) return `${c.id} jumped from (${p.x}, ${p.y}) to (${c.x}, ${c.y}) on step ${r.i}`;
      }
      if (now.hacked !== now.crew.some((c) => c.id === 'K' && tileAt(L, c.x, c.y) === 'C')) return `step ${r.i}: hacked is ${now.hacked} but the hacker is ${now.hacked ? 'not ' : ''}on a terminal`;
      for (const k of now.loot) if (!before.loot.has(k)) return `loot came back at ${k} on step ${r.i}`;
      for (const k of before.open) if (!now.open.has(k)) return `door ${k} closed again on step ${r.i}`;
      if (r.res.ok) {
        const end = fr[fr.length - 1];
        if (end.loot.size) return 'a plan passed with loot left behind';
        if (!L.vault && end.crew.some((c) => tileAt(L, c.x, c.y) !== 'E')) return 'a plan passed with someone off the vans';
      }
    }
    if (g.secret) { if (s.livesLost) return 'a life was lost in the Royal Treasury (it should only send you back)'; }
    else if (s.livesLost > g.fails || g.fails > s.livesLost + 1) return `${g.fails} failed plans but ${s.livesLost} lives lost`;
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    m.pace ??= 0.06 + (1 - b.skill) * 0.12;                      // seconds per input
    if (g.bonus) return crack(g, s, b);
    if (g.phase === 'run') {                                      // watch the replay (an expert fast-forwards)
      if (!g.fast && b.rand() < b.skill * 0.02) { s.keyDown('action'); return; }
      return s.hold([]);
    }
    if (g.phase !== 'plan') return s.hold([]);
    if (!m.ops) {
      // study the map (and scrub the guards' timetable) first
      m.wait = Math.max(m.wait ?? 0, b.t + 2.2 + (1 - b.skill) * 2);
      m.ops = [];
    }
    if (g.run && g.run !== m.seenRun) {                            // back from an alarm: learn where it went wrong
      m.seenRun = g.run;
      const f = g.run.res.fail, fr = g.run.res.frames[f?.step];
      const c = fr?.crew.find((q) => q.id === f.who);
      if (c && !m.trapped) (m.no[f.who] ??= new Set()).add(`${f.step},${c.x},${c.y}`);
      m.trapped = false;
      m.ops = [];
      m.wait = b.t + 0.8 + (1 - b.skill) * 1.5;
    }
    if (!m.ops.length && b.t >= m.wait) {
      const plans = planFor(g, b);
      if (plans) m.ops = opsFor(g, plans);
    }
    drive(g, s, b);
  },

  mistake(g, s, b) {
    const m = b.mem;
    if (g.bonus) return false;
    m.pace ??= 0.06 + (1 - b.skill) * 0.12;
    m.no ??= {};
    if (g.phase !== 'plan') return g.phase === 'run';
    if (!m.trapped) {                                              // rush in: no studying the guards
      m.trapped = true;
      const plans = Object.fromEntries(g.L.crew.map((c) => [c.id, '']));
      const t = trap(g.L);
      plans[t.id] = t.path;
      m.ops = opsFor(g, plans);
      m.wait = 0;
    }
    drive(g, s, b);
    if (g.phase === 'run') { m.ops = []; return true; }
    return false;
  },
};

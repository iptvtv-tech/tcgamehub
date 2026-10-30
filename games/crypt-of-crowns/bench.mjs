// Benchmark contract for Crypt of Crowns (see tools/bench.mjs). The crypt runs on a fixed
// timetable that a patient player can read (skeletons walk set beats, spikes rise on a rhythm), so
// the bot plans like one: first the order of things to do on the map (which key, door, lever or
// cracked wall next — a search over squares and what is open), then, leg by leg, a search over
// (square, facing, tick) for the earliest route to it that is never caught, and finally to the
// stairs (the crown on the secret level); it re-plans after a catch or when its timing slips. It
// acts only by pressing a key (↑ ↓ ← → or Space) on the tick it wants the next move to start,
// exactly as the engine passes a key press to the game. On a bonus level it runs for the coins.
// Crypts 1 and 2 (and the gold rooms and the vault) have nothing that can catch you, so there the
// mistake is skipped.
// A lower-skill bot misreads the danger now and then — it forgets that a skeleton mid-step fills
// both squares, or thinks the spikes drop a tick earlier — and its timing slips (a move a tick
// late), so it gets caught more in the busy crypts. The mistake: walk into the first skeleton or
// spike trap it can reach.
import { TICK, ACT, DIRS, skelAt, spikeUp, freshState, tryAct, applyAct, jammed } from './sim.js';
import { STEP } from '../../tools/lib/headless.mjs';
import { LEVELS } from './levels.js';

const CMDS = ['fwd', 'back', 'left', 'right', 'search'];
const KEY = { fwd: 'up', back: 'down', left: 'left', right: 'right', search: 'action' };

// ── what the crypt looks like to the planner: inventory as a small number ──
// bits 0–3 keys taken, 4–7 doors opened, 8–11 secrets found, 12 lever L, 13 lever M
const invOf = (st) => {
  let n = 0;
  for (const i of st.keys) n |= 1 << i;
  for (const i of st.doors) n |= 1 << (4 + i);
  for (const i of st.secrets) n |= 1 << (8 + i);
  if (st.levers.L) n |= 1 << 12;
  if (st.levers.M) n |= 1 << 13;
  return n;
};
function stOf(W, inv, cache) {
  let st = cache.get(inv);
  if (st) return st;
  st = freshState();
  W.keys.forEach((k, i) => { if (inv & (1 << i)) { st.keys.add(i); if (k.blue) st.blue++; else st.gold++; } });
  W.doors.forEach((dr, i) => { if (inv & (1 << (4 + i))) { st.doors.add(i); if (dr.blue) st.blue--; else st.gold--; } });
  W.secrets.forEach((_, i) => { if (inv & (1 << (8 + i))) st.secrets.add(i); });
  st.levers.L = !!(inv & (1 << 12)); st.levers.M = !!(inv & (1 << 13));
  cache.set(inv, st);
  return st;
}

const ACTS = ~0xf & 0x3fff;                                      // the door / secret / lever bits
const actBit = (W, r) => (r.type === 'door' ? 1 << (4 + r.i) : r.type === 'secret' ? 1 << (8 + r.i) : r.which === 'L' ? 1 << 12 : 1 << 13);

/**
 * The order of things to do, ignoring the clock: a walk over (square, what's open) to the stairs.
 * Returns the list of states (keys taken, doors / secrets / levers) to reach one after another
 * (the last is the state the stairs are reached in), or null when there's no way out.
 */
function legs(g) {
  const W = g.W, cache = new Map(), goalAt = W.exit || W.crown;
  const p = g.p, inv0 = invOf(g.st);
  const key = (x, y, inv) => (inv * 64 + x) * 64 + y;
  const prev = new Map([[key(p.x, p.y, inv0), null]]);
  const q = [[p.x, p.y, inv0]];
  while (q.length) {
    const [x, y, inv] = q.shift();
    if (x === goalAt.x && y === goalAt.y) {
      const out = [];
      for (let k = key(x, y, inv), last = null; k != null; k = prev.get(k)) { const i = Math.floor(k / 4096); if (i !== last) { out.unshift(i); last = i; } }
      return out.slice(1).length ? out.slice(1) : [inv0];
    }
    const st = stOf(W, inv, cache);
    for (let d = 0; d < 4; d++) {
      for (const cmd of ['fwd', 'search']) {
        const r = tryAct(W, st, x, y, d, cmd);
        let n = null;
        if (r.type === 'move') {
          let ninv = inv; const ki = W.keys.findIndex((k) => k.x === r.to[0] && k.y === r.to[1]); if (ki >= 0) ninv |= 1 << ki;
          n = [r.to[0], r.to[1], ninv];
        } else if (r.type === 'door' || r.type === 'secret' || (r.type === 'lever' && !jammed(W, st, x, y, r.which))) n = [x, y, inv ^ actBit(W, r)];
        if (!n) continue;
        const k = key(...n);
        if (prev.has(k)) continue;
        prev.set(k, key(x, y, inv)); q.push(n);
      }
    }
  }
  return null;
}

/** The timetable, tick by tick (repeats every W.P ticks): squares a skeleton is in, spikes that are up. */
function timetable(W, sloppy) {
  const tt = (W.__tt ||= new Map());
  const key = sloppy ? 1 : 0;
  if (tt.has(key)) return tt.get(key);
  const P = W.P, skel = [], spikes = [];
  for (let T = 0; T < P; T++) {
    const set = new Set();
    for (const s of W.skels) {
      const p = skelAt(s, T);
      set.add(p.from[0] * 64 + p.from[1]);
      if (!sloppy) set.add(p.to[0] * 64 + p.to[1]);        // a sloppy player forgets the square it's stepping into
    }
    skel.push(set);
    const up = new Set();
    for (const sp of W.spikes) if (spikeUp(sp, T) && !(sloppy && spikeUp(sp, T + 1) === false)) up.add(sp.x * 64 + sp.y);   // "it's going down now…"
    spikes.push(up);
  }
  const out = { skel, spikes };
  tt.set(key, out);
  return out;
}
const caughtAt = (tt, P, T, cells, spike) => {
  const k = ((T % P) + P) % P, sk = tt.skel[k];
  for (const [x, y] of cells) if (sk.has(x * 64 + y)) return true;
  return !!spike && tt.spikes[k].has(spike[0] * 64 + spike[1]);
};

/** One planner step: what a command does from (x, y, d, inv) at tick T. Returns the outcome
 *  { x, y, d, inv, ticks, caught, goal } or null when the command does nothing useful. */
function outcome(g, tt, cache, x, y, d, inv, T, cmd, safeWorld, only) {
  const W = g.W, P = W.P;
  const chk = (TT, cells, spike) => !safeWorld && caughtAt(tt, P, TT, cells, spike);
  if (cmd === 'wait') return { x, y, d, inv, ticks: 1, caught: chk(T + 1, [[x, y]], [x, y]) };
  if (cmd === 'left' || cmd === 'right') {
    return { x, y, d: (d + (cmd === 'left' ? 3 : 1)) % 4, inv, ticks: ACT, caught: chk(T + 1, [[x, y]], [x, y]) || chk(T + 2, [[x, y]], [x, y]) };
  }
  const st = stOf(W, inv, cache);
  const r = tryAct(W, st, x, y, d, cmd);
  if (r.type === 'move') {
    const [nx, ny] = r.to;
    const caught = chk(T + 1, [[x, y], [nx, ny]], [x, y]) || chk(T + 2, [[nx, ny]], [nx, ny]);
    let ninv = inv;
    const ki = W.keys.findIndex((q) => q.x === nx && q.y === ny);
    if (ki >= 0) ninv |= 1 << ki;
    const goal = (W.exit && nx === W.exit.x && ny === W.exit.y) || (W.crown && nx === W.crown.x && ny === W.crown.y);
    return { x: nx, y: ny, d, inv: ninv, ticks: ACT, caught, goal };
  }
  if (r.type === 'door' || r.type === 'lever' || r.type === 'secret') {
    if (r.type === 'lever' && jammed(W, st, x, y, r.which)) return null;
    const ninv = inv ^ actBit(W, r);
    if (only != null && (ninv & ACTS) !== only) return null;     // not the door / lever / wall this leg is for
    return { x, y, d, inv: ninv, ticks: ACT, caught: chk(T + 1, [[x, y]], [x, y]) || chk(T + 2, [[x, y]], [x, y]) };
  }
  return null;                                                     // a bump or a locked door: no use planning it
}

/**
 * Earliest route from the player's square at tick T0 (no action in progress) to `goal(state)`.
 * Returns a Map tick → { cmd, x, y, d } of the commands to give (and where the player should be
 * then), or null. With `trap`, the route ends with the first command that gets the player caught.
 */
function route(g, T0, { goal, sloppy = false, trap = false, maxTicks = 2500, only = null, exit = true }) {
  const W = g.W, P = W.P, tt = timetable(W, sloppy), cache = new Map(), safeWorld = g.bonus || g.secret;
  const p = g.p, start = { x: p.x, y: p.y, d: p.d, inv: invOf(g.st), parent: null, T: T0, cmd: null };
  const layers = new Map([[T0, [start]]]);
  const seen = new Set();
  const key = (n, T) => ((((n.inv * 64 + n.x) * 64 + n.y) * 4 + n.d) * P + (T % P));
  seen.add(key(start, T0));
  for (let T = T0; T < T0 + maxTicks; T++) {
    const layer = layers.get(T);
    if (!layer) continue;
    layers.delete(T);
    for (const n of layer) {
      for (const cmd of ['wait', ...CMDS]) {
        const o = outcome(g, tt, cache, n.x, n.y, n.d, n.inv, T, cmd, safeWorld, trap ? null : only);
        if (!o) continue;
        const node = { x: o.x, y: o.y, d: o.d, inv: o.inv, parent: n, T: T + o.ticks, cmd, at: T };
        if (trap) { if (o.caught && cmd !== 'wait') return unwind(node); if (o.caught) continue; }
        else { if (o.caught) continue; if ((exit && o.goal) || goal(node)) return unwind(node); }
        const k = key(node, node.T);
        if (seen.has(k)) continue;
        seen.add(k);
        (layers.get(node.T) ?? layers.set(node.T, []).get(node.T)).push(node);
      }
    }
  }
  return null;
}
function unwind(node) {
  const plan = new Map();
  for (let n = node; n.parent; n = n.parent) plan.set(n.at, { cmd: n.cmd, x: n.parent.x, y: n.parent.y, d: n.parent.d });
  return plan;
}

/** Bonus rooms: the nearest coins (no danger, the clock decides). */
function coinRoute(g, T0) {
  const W = g.W;
  const want = (n) => W.at(n.x, n.y) === 'c' || W.at(n.x, n.y) === 'T' ? !g.taken.has(n.x + ',' + n.y) && n.cmd !== 'left' && n.cmd !== 'right' : false;
  return route(g, T0, { goal: want, maxTicks: 60 });
}

function plan(g, b, trap) {
  const T0 = g.T;
  if (trap) return route(g, T0, { goal: () => false, trap: true, maxTicks: 400 });
  if (g.bonus) return coinRoute(g, T0);
  const sloppy = b.rand() < (1 - b.skill) * 1.2;
  // the next thing to open (or the stairs), then a timed route to it; the whole search if that fails
  const L = legs(g), now = invOf(g.st);
  const has = (inv, t) => (inv & ACTS) === (t & ACTS) && (inv & t & 0xf) === (t & 0xf);
  if (L && !has(now, L[0])) {
    const r = route(g, T0, { goal: (n) => has(n.inv, L[0]), only: L[0] & ACTS, exit: false, sloppy, maxTicks: 900 });
    if (r) return r;
  } else if (L) {
    const r = route(g, T0, { goal: () => false, only: now & ACTS, sloppy, maxTicks: 900 });
    if (r) return r;
  }
  return route(g, T0, { goal: () => false, sloppy });
}

/** Static walking distance to the way out (doors, gates and cracked walls counted as open). */
const fields = new WeakMap();
function field(g) {
  let f = fields.get(g.W);
  if (f) return f;
  const W = g.W, goal = W.exit || W.crown;
  f = new Map();
  if (goal) {
    const open = (x, y) => !'#= tLM'.includes(W.at(x, y));
    const q = [[goal.x, goal.y]]; f.set(goal.x * 64 + goal.y, 0);
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of DIRS) if (open(x + dx, y + dy) && !f.has((x + dx) * 64 + y + dy)) { f.set((x + dx) * 64 + y + dy, f.get(x * 64 + y) + 1); q.push([x + dx, y + dy]); }
    }
  }
  fields.set(g.W, f);
  return f;
}
const best = new WeakMap();

function press(s, cmd) { const k = KEY[cmd]; s.keyUp(k); s.keyDown(k); s.keyUp(k); }

export default {
  // crypts 1–15 (5 and 10 are the 15 s gold rooms) + the Crown Vault (16). The expert's safe routes
  // take 6–49 s and par is about twice the perfect run, so par + 20 s leaves room for a catch (2 s and
  // the walk back from the entrance) and the waits that follow it
  limit: (level) => (LEVELS[level]?.par ? LEVELS[level].par + 20 : 30),
  stuck: 30,                    // the longest safe wait for a gap in the patrols is under ~15 s

  progress(g) {
    const f = field(g), d = f.get(g.p.x * 64 + g.p.y) ?? 99;
    const was = best.get(g);
    const near = was && was.W === g.W ? Math.min(was.near, d) : d;
    best.set(g, { W: g.W, near });
    let seen = 0;
    for (const row of g.seen) for (const v of row) if (v) seen++;
    return 1000 * (g.st.keys.size + g.st.doors.size + g.st.secrets.size) + seen + (99 - near);
  },

  invariants(g, s) {
    const p = g.p, W = g.W, st = g.st;
    if (![p.x, p.y, p.d, g.T].every(Number.isInteger)) return 'the player position, facing or the tick is not a whole number';
    if (p.x < 0 || p.y < 0 || p.x >= W.w || p.y >= W.h) return `the player is off the map at (${p.x}, ${p.y})`;
    if (p.d < 0 || p.d > 3) return `facing ${p.d}`;
    const c = W.at(p.x, p.y);
    if ('#= tLM'.includes(c)) return `the player is inside a wall at (${p.x}, ${p.y}) '${c}'`;
    if ((c === 'D' || c === 'B') && !st.doors.has(W.doors.findIndex((q) => q.x === p.x && q.y === p.y))) return `the player is inside a locked door at (${p.x}, ${p.y})`;
    if (c === '%' && !st.secrets.has(W.secrets.findIndex((q) => q.x === p.x && q.y === p.y))) return `the player is inside a closed secret wall at (${p.x}, ${p.y})`;
    if ((c === 'G' && !st.levers.L) || (c === 'g' && st.levers.L) || (c === 'H' && !st.levers.M) || (c === 'h' && st.levers.M)) {
      if (!g.act || g.act.type !== 'move') return `the player is standing in a shut gate at (${p.x}, ${p.y})`;
    }
    // keys held = keys picked up − doors opened, per colour, never negative
    let gold = 0, blue = 0;
    for (const i of st.keys) if (W.keys[i].blue) blue++; else gold++;
    for (const i of st.doors) if (W.doors[i].blue) blue--; else gold--;
    if (gold !== st.gold || blue !== st.blue) return `keys don't add up: holding ${st.gold} gold / ${st.blue} blue, should be ${gold} / ${blue}`;
    if (st.gold < 0 || st.blue < 0) return 'a negative key count';
    if (g.act && (g.act.n < 0 || g.act.n > (g.act.dur ?? ACT))) return `action ${g.act.type} at step ${g.act.n} of ${g.act.dur}`;
    if (g.act?.type === 'move' && Math.abs(g.act.to[0] - p.x) + Math.abs(g.act.to[1] - p.y) !== 1) return `a step from (${p.x}, ${p.y}) to (${g.act.to}) is not one square`;
    if (!g.caughtFx && (g.acc < -1e-9 || g.acc > TICK + 1e-9)) return `the tick clock is at ${g.acc} s (ticks are ${TICK} s)`;
    // never standing in a skeleton's square or on raised spikes without being caught
    if (!g.bonus && !g.secret && !g.caughtFx && !g.act) {
      for (const sk of W.skels) { const q = skelAt(sk, g.T); if ((q.from[0] === p.x && q.from[1] === p.y) || (q.to[0] === p.x && q.to[1] === p.y)) return `a skeleton is in the player's square (${p.x}, ${p.y}) on tick ${g.T} and nothing happened`; }
      for (const sp of W.spikes) if (sp.x === p.x && sp.y === p.y && spikeUp(sp, g.T)) return `the player stands on raised spikes at (${p.x}, ${p.y}) on tick ${g.T} and nothing happened`;
    }
    for (const sk of W.skels) {
      const q = skelAt(sk, g.T);
      for (const [x, y] of [q.from, q.to]) if ('#= tLM%DBGgHh'.includes(W.at(x, y))) return `a skeleton walks through '${W.at(x, y)}' at (${x}, ${y})`;
    }
    if (g.secret && s.livesLost) return 'a life was lost in the Crown Vault (nothing in it can catch you)';
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    if (s.livesLost !== (m.lives ?? 0)) { m.plan = null; m.lives = s.livesLost; }   // caught: back at the entrance, start over
    if (g.caughtFx || g.done || g.act) return;
    if (!(g.acc + STEP >= TICK)) return;                     // the next tick starts during this frame
    const T = g.T;
    let step = m.plan?.get(T);
    const off = step && (step.x !== g.p.x || step.y !== g.p.y || step.d !== g.p.d);
    if (!m.plan || off || !step) {
      m.plan = plan(g, b, false);
      step = m.plan?.get(T);
    }
    if (!step || step.cmd === 'wait') return;
    // a slower player's timing slips now and then: the move goes a tick late (re-planned after)
    if (b.rand() < (1 - b.skill) * 0.12) { m.plan = null; return; }
    press(s, step.cmd);
  },

  mistake(g, s, b) {
    if (g.bonus || g.secret || (!g.W.skels.length && !g.W.spikes.length)) return true;   // nothing here can catch you
    if (g.caughtFx || g.act || !(g.acc + STEP >= TICK)) return false;
    const r = plan(g, b, true);
    if (!r) return false;
    Object.assign(b.mem, { plan: r, lives: s.livesLost });
    const step = r.get(g.T);
    if (step && step.cmd !== 'wait') press(s, step.cmd);
    return true;
  },
};

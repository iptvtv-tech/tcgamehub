// Benchmark contract for Crown Heist 3D (see tools/bench.mjs). The bot plays like a keyboard player:
// it walks and turns with the arrow keys and uses things with Space (the C / X keys — throw a coin,
// drop smoke — are the game's own throwCoin() / dropSmoke()). It plans on the floor's grid the way a
// player reads the map and the guards: each look it forecasts where every guard will be over the next
// few seconds (patrollers walk their fixed loops, alerted guards head for the crown, searchers turn on
// the spot, the sentry turns slowly) and what each of them can see from there (range, cone, walls —
// the game's own lineClear), then searches over (square, time) for the quickest way to the next goal
// that stays out of sight, waiting in place when that is what it takes. Goals: the crown (stand
// beside the pedestal, face it, Space), the lever if pulling it makes the run shorter, then the
// stairs; on the Treasure Vaults the nearest gold; on the Empty Throne the throne. When a guard is
// on its heels it drops smoke. After the crown it also keeps clear of the Crown Wraith and of the
// falling vault (floor 15), and never steps back onto a floor that is giving way. Lower skill looks
// less often, plans a shorter way ahead, under-reads the guards' range and cone and sometimes
// forgets one guard. The mistake: walk straight into the nearest guard.
//
// 17 Nov 2026: on top of that reactive player there is a planner (bot-plan.mjs): it runs the game's
// own guard code forward on a copy, walks each candidate route through it to see how the guards
// would really react (seeing, chasing, catching; a smoke bomb when one closes in), and lifts the
// crown at the first moment that has a way out that survives. The reactive player takes over when
// no such way is in sight.
//
// 18 Nov 2026: and first of all, every bot plays the way out it has LEARNED for the floor (see
// "the expert" below): the expert to the tick, weaker players with hesitations. The planner and
// the reactive player are what a weaker player falls back on after four tries that went wrong.
import { C, SPEED, bfs } from './floors.js';
import { forecast as clockwork, dangers, route, wantsSmoke, spots, EVERY } from './bot-plan.mjs';
import { findRoute, model as gameCopy, step as copyStep, KEY } from './route-search.mjs';
import { ROUTES } from './routes.js';

// ── the expert: a player who has learned the floor ───────────
// A floor is the same every time, guards and all, so the expert plays a way it has worked out
// beforehand: route-search.mjs tries ways of playing the floor on copies of the game until one
// gets the crown out, and the expert then plays that, key for key. Working a floor out takes from
// a second to twenty minutes, so the ways found are kept in routes.js (written by
// `node games/crown-heist/find-routes.mjs`); a kept way is first played through on a copy of the
// game, and if it no longer gets out (the game has changed) the floor is worked out afresh.
/** Run-length text ⇄ the keys to hold on each engine step. */
export { momentOf };
export const packKeys = (keys) => { const out = []; for (let i = 0; i < keys.length;) { let j = i; while (j < keys.length && keys[j] === keys[i]) j++; out.push(keys[i].toString(36) + (j - i > 1 ? j - i : '')); i = j; } return out.join('.'); };
const unpackKeys = (text) => { const out = []; for (const part of text.split('.')) { const k = parseInt(part[0], 36), n = part.length > 1 ? +part.slice(1) : 1; for (let i = 0; i < n; i++) out.push(k); } return Uint8Array.from(out); };
/** The moment a way starts from: the floor, how far into the try, and where everyone is. (Every try at a
 *  floor starts the same, so a way learned from a fresh start also serves after a catch.) */
const momentOf = (g) => `${g.level}@${g.tryT.toFixed(3)}:${g.p.x.toFixed(2)},${g.p.y.toFixed(2)}:${g.guards.map((o) => `${o.x.toFixed(2)},${o.y.toFixed(2)},${o.state[0]}`).join(';')}`;
const getsOut = (g, keys) => { const m = gameCopy(g); for (let i = 0; i < keys.length; i++) { const r = copyStep(m, keys[i]); if (r) return r === 'out'; } return false; };
export const learned = new Map();                        // moment → keys (or null: no way found), for this run of the benchmark
function learnedWay(g) {
  const at = momentOf(g);
  if (learned.has(at)) return learned.get(at);
  let keys = ROUTES[at] ? unpackKeys(ROUTES[at]) : null;
  if (keys && !getsOut(g, keys)) keys = null;
  if (!keys) { const r = findRoute(g, { weight: 2, budget: 2500000, keep: 40000 }); keys = r.ok ? r.keys : null; }
  learned.set(at, keys);
  return keys;
}


const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// the guards' numbers (game.js GUARD): speeds and eyes
const GUARD = {
  skeleton: { walk: 0.80, alert: 1.08, run: 1.48, range: 4.1, cone: 0.55 },
  knight: { walk: 0.92, alert: 1.24, run: 1.96, range: 5.0, cone: 0.6 },
};
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const cellOf = (p) => [Math.floor(p.x), Math.floor(p.y)];

// ── the map as the bot reads it ──────────────────────────────
function passable(g, x, y) {
  if (!g.walkable(x, y)) return false;
  const cr = g.f.crown;
  if (cr && cr[0] === x && cr[1] === y && g.collapseT < 0) return false;                  // the pedestal
  if (g.has && !g.secret) for (const c of g.cracking.values()) if (c.x === x && c.y === y) return false;   // giving way
  return true;
}
/** BFS distances to goal cells over the live map (cached per map state). */
function field(g, goals, key) {
  const m = (g.__bf ??= new Map()), k = key + '|' + g.mapRev() + '|' + g.has + '|' + (g.leverOn ? 1 : 0) + '|' + [...g.cracking.keys()].join(',');
  let d = m.get(k);
  if (!d) { if (m.size > 40) m.clear(); d = bfs(g.g, goals, (x, y) => passable(g, x, y)); m.set(k, d); }
  return d;
}
/** Wall-blind line of sight between two cell centres, cached per map state. */
function losCache(g) {
  const rev = g.mapRev();
  if (g.__los?.rev !== rev) g.__los = { rev, v: new Int8Array(g.f.w * g.f.h * g.f.w * g.f.h) };
  return g.__los.v;
}

// ── where the guards will be, and what they will see ─────────
/** Positions (and facing) of one guard at times 0, τ, 2τ… as a player would forecast them. */
function forecast(g, gd, n, tau, fields) {
  const out = [];
  if (gd.dead) return out;
  const T = (g.guardT || GUARD)[gd.kind], P = g.p;
  let x = gd.x, y = gd.y, a = gd.a, stun = gd.stun;
  const follow = (tx, ty, speed, t) => {
    // walk along the guard's own BFS field to (tx, ty) for t seconds
    const k = tx + ',' + ty;
    let d = fields.get(k);
    if (!d) { d = bfs(g.g, [[tx, ty]], (xx, yy) => g.guardWalk(xx, yy)); fields.set(k, d); }
    let left = speed * t;
    while (left > 1e-6) {
      const cx = Math.floor(x), cy = Math.floor(y), w = g.f.w, here = d[cy * w + cx];
      let gx = tx + 0.5, gy = ty + 0.5;
      if (here > 0) {
        let best = null;
        for (const [dx, dy] of DIRS) { const v = d[(cy + dy) * w + cx + dx]; if (v >= 0 && v < here && (!best || v < best.v)) best = { v, x: cx + dx, y: cy + dy }; }
        if (!best) return true;
        gx = best.x + 0.5; gy = best.y + 0.5;
      } else if (here < 0) return true;
      const dx = gx - x, dy = gy - y, dd = Math.hypot(dx, dy);
      if (dd < 1e-6) return true;
      a = Math.atan2(dy, dx);
      const s = Math.min(dd, left);
      x += dx / dd * s; y += dy / dd * s; left -= s;
      if (here === 0 && s === dd) return true;
    }
    return false;
  };
  let ri = gd.ri, state = gd.state, look = gd.target, searchT = gd.searchT;
  for (let k = 0; k <= n; k++) {
    const full = state === 'search' || state === 'chase';
    out.push({ x, y, a, full, blind: stun > 0, chase: state === 'chase', range: T.range + (gd.alert ? 1.2 : 0) + (g.has ? 1.0 : 0), cone: T.cone + (gd.alert ? 0.15 : 0) });
    // advance τ seconds
    if (stun > 0) { stun -= tau; if (stun <= 0) { state = 'search'; searchT = 3.5; } continue; }
    if (state === 'chase') { follow(Math.floor(P.x), Math.floor(P.y), T.run, tau); continue; }
    if (state === 'look' && look) { if (follow(look[0], look[1], gd.alert ? T.alert : T.walk * 1.15, tau)) { state = 'search'; searchT = gd.alert ? 4.5 : 3; } continue; }
    if (state === 'search') { searchT -= tau; if (searchT <= 0) state = 'return'; continue; }
    if (gd.sentry) { const [sx, sy] = gd.route[0]; if (Math.hypot(x - sx - 0.5, y - sy - 0.5) > 0.05) follow(sx, sy, T.walk, tau); else a += tau * (gd.alert ? 0.9 : 0.55); continue; }
    // patrol / return: the fixed loop, one square after another
    let left = (gd.alert ? T.alert : T.walk) * tau;
    for (let guard = 0; left > 1e-6 && guard < 8; guard++) {
      const [tx, ty] = gd.route[ri];
      const dx = tx + 0.5 - x, dy = ty + 0.5 - y, dd = Math.hypot(dx, dy);
      if (dd <= left) { x = tx + 0.5; y = ty + 0.5; left -= dd; ri = (ri + 1) % gd.route.length; if (dd > 1e-6) a = Math.atan2(dy, dx); continue; }
      if (dd > 1.6) { follow(tx, ty, left / tau, tau); left = 0; break; }      // off its loop: walking back
      a = Math.atan2(dy, dx); x += dx / dd * left; y += dy / dd * left; left = 0;
    }
  }
  return out;
}

/** For each time step k, the danger of every square: 0 safe, 1 seen, 2 within reach of a guard. */
function dangerMap(g, b, n, tau, sk) {
  const f = g.f, w = f.w, N = w * f.h, D = new Uint8Array((n + 1) * N);
  const fields = (g.__gf ??= { rev: '', m: new Map() });
  if (fields.rev !== g.mapRev()) { fields.rev = g.mapRev(); fields.m = new Map(); }
  const los = losCache(g);
  const rm = sk.rangeMargin, cm = sk.coneMargin;
  for (const gd of g.guards) {
    if (gd.dead || (b.mem.forget === gd.i)) continue;
    const fc = forecast(g, gd, n, tau, fields.m);
    for (let k = 0; k <= n; k++) {
      const q = fc[k];
      if (!q) continue;
      const R = q.range + rm, gx = Math.floor(q.x), gy = Math.floor(q.y), base = k * N;
      const reach = q.chase ? 1.5 + k * tau * 0.6 : 1.25;
      for (let y = Math.max(0, Math.floor(q.y - R)); y <= Math.min(f.h - 1, Math.floor(q.y + R)); y++) {
        for (let x = Math.max(0, Math.floor(q.x - R)); x <= Math.min(w - 1, Math.floor(q.x + R)); x++) {
          const i = y * w + x;
          if (!g.walkable(x, y)) continue;
          const dx = x + 0.5 - q.x, dy = y + 0.5 - q.y, d = Math.hypot(dx, dy);
          if (d < reach) { D[base + i] = 2; continue; }
          if (q.blind || d > R || D[base + i]) continue;
          if (!q.full && d > 1.15 && Math.abs(angDiff(Math.atan2(dy, dx), q.a)) > q.cone + cm) continue;
          if (g.hidden !== undefined && g.g.at(x, y) === C.ALCOVE) continue;          // hidden in an alcove (unless right next to it)
          const li = (gy * w + gx) * N + i;
          let v = los[li];
          if (!v) { v = g.lineClear(gx + 0.5, gy + 0.5, x + 0.5, y + 0.5, false) ? 1 : 2; los[li] = v; }
          if (v === 1 && (!g.smokes.length || g.lineClear(q.x, q.y, x + 0.5, y + 0.5, true))) D[base + i] = 1;
        }
      }
    }
  }
  // the Crown Wraith drifts straight at you (through walls): keep well clear of where it is heading
  const wr = g.wraith;
  if (wr && g.has) {
    for (let k = 0; k <= n; k++) {
      const t = k * tau, wake = Math.max(0, t - Math.max(0, 3 - wr.t)), dx = g.p.x - wr.x, dy = g.p.y - wr.y, dd = Math.hypot(dx, dy) || 1;
      const s = Math.min(dd, g.f.wraithSpeed * wake), qx = wr.x + dx / dd * s, qy = wr.y + dy / dd * s;
      for (let y = Math.max(0, Math.floor(qy - 2)); y <= Math.min(f.h - 1, Math.floor(qy + 2)); y++) for (let x = Math.max(0, Math.floor(qx - 2)); x <= Math.min(w - 1, Math.floor(qx + 2)); x++) {
        if (Math.hypot(x + 0.5 - qx, y + 0.5 - qy) < 1.35) D[k * N + y * w + x] = 2;
      }
    }
  }
  return D;
}

// ── the plan: quickest safe way over (square, time) ──────────
class Heap {
  constructor() { this.a = []; }
  push(c, v) { const a = this.a; a.push([c, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/** Squares the falling vault (floor 15) takes, by time from now (seconds), or null. */
function fallTime(g, i) {
  if (g.collapseT < 0 || !g.f.collapse) return Infinity;
  const d = g.f.collapseDist[i];
  if (d < 0) return Infinity;
  return g.f.collapseDelay + d / g.f.collapseSpeed - g.collapseT;
}

/**
 * Search from the player's square to any of `goals` (cell indices). Returns the list of squares
 * to visit (one per step of τ seconds; a repeat = wait), or null.
 */
function search(g, b, goals, sk, { ignoreDanger = false, D: D0 = null, hold = false } = {}) {
  const f = g.f, w = f.w, N = w * f.h;
  const carry = g.has && !g.secret, tau = 1 / (2 * (carry ? SPEED.carry : SPEED.walk)) * sk.slack;
  const n = sk.horizon;
  const goalSet = new Set(goals);
  const h = field(g, goals.map((i) => [i % w, (i / w) | 0]), 'g' + goals.join(','));
  const [px, py] = cellOf(g.p), start = py * w + px;
  if (h[start] < 0 && !goalSet.has(start)) return null;
  const D = ignoreDanger ? null : D0 || dangerMap(g, b, n, tau, sk);
  // states: (step k, facing 0-3 or 4 = as now, square); turning on the spot takes time (2.5 rad/s,
  // walking on once within ~0.6 rad), so a turn delays the step that follows it
  const S = (n + 1) * 5 * N;
  const buf = (g.__sb ??= {});
  if (buf.S !== S) { buf.S = S; buf.cost = new Float64Array(S); buf.prev = new Int32Array(S); }
  const cost = buf.cost.fill(Infinity), prev = buf.prev.fill(-1);
  const heading = [...DIRS.map(([dx, dy]) => Math.atan2(dy, dx)), g.p.a];
  const turnSteps = heading.map((a0) => DIRS.map(([dx, dy]) => Math.max(0, Math.round((Math.abs(angDiff(Math.atan2(dy, dx), a0)) - 0.6) / 2.5 / tau))));
  const heap = new Heap();
  const st = (k, d, i) => (k * 5 + d) * N + i;
  cost[st(0, 4, start)] = 0; heap.push(0, st(0, 4, start));
  let best = null, bestScore = Infinity;
  const pen = (k, i) => (D ? (D[k * N + i] === 2 ? sk.reachPen : D[k * N + i] === 1 ? sk.seenPen : 0) : 0);
  const relax = (c, from, k2, d2, j, s2c) => { const s2 = st(k2, d2, j); if (s2c < cost[s2]) { cost[s2] = s2c; prev[s2] = from; heap.push(s2c, s2); } };
  while (heap.size) {
    const [c, s] = heap.pop();
    if (c > cost[s]) continue;
    const i = s % N, kd = (s / N) | 0, k = (kd / 5) | 0, d = kd % 5;
    if (goalSet.has(i) && (!hold || k === n)) { if (c < bestScore) { bestScore = c; best = s; } continue; }
    if (k === n) { const sc = c + 2 * h[i] * 1.05; if (h[i] >= 0 && sc < bestScore) { bestScore = sc; best = s; } continue; }
    if (c >= bestScore) continue;
    const x = i % w, y = (i / w) | 0;
    if (fallTime(g, i) < (k + 1) * tau + 0.3) continue;                 // the vault comes down here
    // wait a step
    relax(c, s, k + 1, d, i, c + 1.02 + pen(k + 1, i));
    // or step to a neighbour (turning first if need be)
    for (let di = 0; di < 4; di++) {
      const [dx, dy] = DIRS[di], nx = x + dx, ny = y + dy;
      if (!passable(g, nx, ny)) continue;
      const j = ny * w + nx, ts = turnSteps[d][di], k2 = Math.min(n, k + ts + 2);
      if (fallTime(g, j) < (k2 + 1) * tau + 0.5) continue;
      let nc = c + ts + 2;
      for (let kk = k + 1; kk <= k2; kk++) nc += kk === k2 ? pen(kk, j) : kk === k2 - 1 ? (pen(kk, i) + pen(kk, j)) * 0.5 : pen(kk, i);
      relax(c, s, k2, di, j, nc);
    }
  }
  if (best == null) return null;
  const chain = [];
  for (let s = best; s >= 0; s = prev[s]) chain.push(s);
  chain.reverse();
  // the square to be on at each step of τ from now
  const line = [start];
  for (let q = 1; q < chain.length; q++) {
    const k0 = ((chain[q - 1] / N) | 0) / 5 | 0, k1 = ((chain[q] / N) | 0) / 5 | 0, i0 = chain[q - 1] % N, i1 = chain[q] % N;
    for (let k = k0 + 1; k <= k1; k++) line.push(k === k1 ? i1 : i0);
  }
  return { line, tau, at: g.t, reached: goalSet.has(best % N), n };
}

// ── what to go for next ──────────────────────────────────────
function goalsOf(g, b) {
  const f = g.f, w = f.w, m = b.mem;
  const nb = (cx, cy) => DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => passable(g, x, y) || g.walkable(x, y));
  if (g.secret) return { cells: nb(f.throne[0], f.throne[1]).map(([x, y]) => y * w + x), face: f.throne, act: 'throne' };
  if (g.bonus) {
    const left = f.coins.filter(([x, y]) => !g.taken.has(x + ',' + y)).concat(f.chests.filter(([x, y]) => !g.taken.has('T' + x + ',' + y)));
    return { cells: left.map(([x, y]) => y * w + x), act: 'gold' };
  }
  if (!g.has) return { cells: nb(f.crown[0], f.crown[1]).map(([x, y]) => y * w + x), face: f.crown, act: 'crown' };
  const exit = f.exit[1] * w + f.exit[0];
  if (f.lever && g.gateShut && !g.leverOn && m.leverPlan !== false) {
    const o = [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy];
    if (m.leverPlan == null) {
      const [px, py] = cellOf(g.p);
      const dE = field(g, [f.exit], 'exit')[py * w + px], dO = field(g, [o], 'lever')[py * w + px];
      const open = bfs(g.g, [f.exit], (x, y) => passable(g, x, y) || g.g.at(x, y) === C.GATE)[o[1] * w + o[0]];
      m.leverPlan = dO >= 0 && open >= 0 && (dE < 0 || dO + open + 3 < dE);
    }
    if (m.leverPlan) return { cells: [o[1] * w + o[0]], face: [f.lever.x, f.lever.y], act: 'lever' };
  }
  return { cells: [exit], act: 'exit' };
}

/** Where a coin thrown now at angle a would land (the game's own coin flight, updateThrown). */
function coinLanding(g, a) {
  let x = g.p.x, y = g.p.y, vx = Math.cos(a) * 9, vy = Math.sin(a) * 9, z = 0.5, vz = 1.6;
  const dt = 1 / 120, blocked = (cx, cy) => !g.seeThrough(cx, cy) || (g.g.at(cx, cy) === C.GATE && g.gateClosed());
  for (let i = 0; i < 360; i++) {
    vz -= 6 * dt; z += vz * dt;
    const nx = x + vx * dt, ny = y + vy * dt;
    if (blocked(Math.floor(nx), Math.floor(y))) vx *= -0.35; else x = nx;
    if (blocked(Math.floor(x), Math.floor(ny))) vy *= -0.35; else y = ny;
    if (z <= 0) return [x, y];
  }
  return null;
}
/** A coin throw that draws the guard nearest the goal well away from it (and not past us). */
function lurePlan(g, G, who = null) {
  const w = g.f.w, goals = G.cells.map((i) => [i % w, (i / w) | 0]);
  const dG = bfs(g.g, goals, (x, y) => g.guardWalk(x, y));
  const free = g.guards.filter((gd) => !gd.dead && gd.state !== 'chase' && gd.stun <= 0 && gd.state !== 'look');
  if (!free.length) return null;
  const at = (gd) => dG[Math.floor(gd.y) * w + Math.floor(gd.x)];
  const blocker = who ? free.find((gd) => gd === who) : free.filter((gd) => at(gd) >= 0).sort((a, c) => at(a) - at(c))[0];
  if (!blocker || (!who && at(blocker) > 6)) return null;
  const me = bfs(g.g, [cellOf(g.p)], (x, y) => g.guardWalk(x, y));
  // keep the lured guards off the way out too (the route from the crown)
  const R = g.f.crown ? escapeRoute(g, g.f.crown.map((v, i) => v + (i === 0 ? 1 : 0))) || escapeRoute(g, cellOf(g.p)) : null;
  const dR = R ? bfs(g.g, R.map((i) => [i % w, (i / w) | 0]), (x, y) => g.guardWalk(x, y)) : null;
  const at2 = (gd) => (dR ? dR[Math.floor(gd.y) * w + Math.floor(gd.x)] : 99);
  let best = null;
  for (let k = 0; k < 64; k++) {
    const a = g.p.a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 32);
    const L = coinLanding(g, a);
    if (!L) continue;
    const cx = Math.floor(L[0]), cy = Math.floor(L[1]);
    if (!g.walkable(cx, cy) || Math.hypot(blocker.x - L[0], blocker.y - L[1]) >= 7.4) continue;
    const away = dG[cy * w + cx], fromMe = me[cy * w + cx];
    if (away < 6 || fromMe < 3) continue;
    // the guard's walk there must not come close to us
    const toLure = bfs(g.g, [[cx, cy]], (x, y) => g.guardWalk(x, y)), [px, py] = cellOf(g.p);
    if (toLure[py * w + px] >= 0 && toLure[py * w + px] + me[Math.floor(blocker.y) * w + Math.floor(blocker.x)] <= toLure[Math.floor(blocker.y) * w + Math.floor(blocker.x)] + 2) continue;
    const offRoute = dR ? dR[cy * w + cx] : 10;
    if (offRoute < 3) continue;
    let pulled = 0;
    for (const o of free) if (o !== blocker && Math.hypot(o.x - L[0], o.y - L[1]) < 7.5 && at2(o) > offRoute) pulled++;
    const sc = Math.min(away, 12) + Math.min(offRoute, 10) - pulled * 4 - Math.abs(angDiff(a, g.p.a)) * 0.8;
    if (!best || sc > best.sc) best = { a, sc, t: g.t, L };
  }
  return best;
}

/**
 * Before lifting the crown: would a guard, heading for the pedestal once the alarm goes up, run
 * into us on the way out (or spot us close enough to run us down)? Returns that guard, or null.
 */
function escapeRoute(g, from) {
  const f = g.f, w = f.w, shut = (x, y) => { const v = g.g.at(x, y); return v === C.OPEN || v === C.ALCOVE || v === C.CRACK; };
  const meI = from[1] * w + from[0];
  const toExit = bfs(g.g, [f.exit], shut);
  let route = walkDown(toExit, meI, w);
  if (f.lever) {
    const o = [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy];
    const toO = bfs(g.g, [o], shut), open = bfs(g.g, [f.exit], (x, y) => shut(x, y) || g.g.at(x, y) === C.GATE);
    const a = walkDown(toO, meI, w), c = a && walkDown(open, o[1] * w + o[0], w);
    if (a && c && (!route || a.length + c.length + 3 < route.length)) route = [...a, ...Array(4).fill(a[a.length - 1]), ...c.slice(1)];
  }
  return route;
}
function raceLoser(g, b, sk) {
  const f = g.f, w = f.w, shut = (x, y) => { const v = g.g.at(x, y); return v === C.OPEN || v === C.ALCOVE || v === C.CRACK; };
  const me = cellOf(g.p), meI = me[1] * w + me[0];
  // the way out: straight to the stairs with the gate shut, or via the lever if that is shorter
  const toExit = bfs(g.g, [f.exit], shut);
  let route = walkDown(toExit, meI, w);
  if (f.lever) {
    const o = [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy];
    const toO = bfs(g.g, [o], shut), open = bfs(g.g, [f.exit], (x, y) => shut(x, y) || g.g.at(x, y) === C.GATE);
    const a = walkDown(toO, meI, w), c = a && walkDown(open, o[1] * w + o[0], w);
    if (a && c && (!route || a.length + c.length + 3 < route.length)) route = [...a, ...Array(4).fill(a[a.length - 1]), ...c.slice(1)];
  }
  if (!route) return null;
  let worst = null;
  for (const gd of g.guards) {
    if (gd.dead) continue;
    const T = (g.guardT || GUARD)[gd.kind];
    const toCrown = bfs(g.g, [f.crown], (x, y) => g.guardWalk(x, y) && (g.g.at(x, y) !== C.GATE));
    const gp = walkDown(toCrown, Math.floor(gd.y) * w + Math.floor(gd.x), w) || [Math.floor(gd.y) * w + Math.floor(gd.x)];
    const range = T.range + 1.2 + 1.0, near = gd.kind === 'knight' ? 3.6 : 1.9;
    for (let t = 0; t < route.length / SPEED.carry + 2; t += 0.25) {
      const mi = route[Math.min(route.length - 1, Math.max(0, Math.floor((t - 0.6) * SPEED.carry)))];
      const gi = gp[Math.min(gp.length - 1, Math.floor(t * T.alert))];
      const mx = mi % w + 0.5, my = ((mi / w) | 0) + 0.5, gx = gi % w + 0.5, gy = ((gi / w) | 0) + 0.5, d = Math.hypot(mx - gx, my - gy);
      if (d < 1.6 + sk.raceMargin || (d < near + sk.raceMargin && d < range && g.lineClear(gx, gy, mx, my, false))) {
        if (!worst || t < worst.t) worst = { gd, t };
        break;
      }
    }
  }
  return worst?.gd || null;
}
/** Follow a BFS field downhill from square i to its source: the squares on the way. */
function walkDown(d, i, w) {
  if (d[i] < 0) return null;
  const out = [i];
  while (d[i] > 0) {
    const x = i % w, y = (i / w) | 0;
    let nxt = -1;
    for (const [dx, dy] of DIRS) { const j = (y + dy) * w + x + dx; if (d[j] === d[i] - 1) { nxt = j; break; } }
    if (nxt < 0) return null;
    out.push(i = nxt);
  }
  return out;
}

function skillOf(b, g) {
  const k = b.skill, run = g?.has && !g.secret;
  return {
    horizon: Math.round(8 + 18 * k),          // steps of τ looked ahead
    rangeMargin: -0.8 + 1.0 * k,              // reads the guards' range…
    coneMargin: -0.15 + 0.25 * k,             // …and cone, the expert with room to spare
    // sneaking in, being seen is what matters; with the crown (every guard alerted, the seal
    // ticking) it is getting caught: outrun them
    seenPen: run ? 0.3 + 0.7 * k : 1 + 7 * k, reachPen: 30 + 50 * k,
    look: 0.12 + (1 - k) * 0.5,               // seconds between looks
    slack: 1.1,
    raceMargin: -1 + 1.2 * k,                 // how much room it wants from the guards when it lifts the crown
    grabWait: 6 + 14 * k,                     // seconds it will wait by the crown for the guards to move off
    patience: 4 + (1 - k) * 10,              // seconds getting nowhere before luring a guard away
  };
}

/** Steer towards the centre of square i (arrow keys only). */
function steer(g, s, tx, ty, allowFwd = true) {
  const p = g.p, want = Math.atan2(ty - p.y, tx - p.x), err = angDiff(want, p.a), d = Math.hypot(tx - p.x, ty - p.y);
  const keys = [];
  if (Math.abs(err) > 0.06) keys.push(err > 0 ? 'right' : 'left');
  if (allowFwd && d > 0.06 && Math.abs(err) < (d < 0.5 ? 0.35 : 0.6)) keys.push('up');
  s.hold(keys);
}

function reactive(g, s, b) {
  const m = b.mem, f = g.f, w = f.w;
  if (g.done || g.caughtFx) return s.hold([]);
  if (m.lives !== s.livesLost) { m.lives = s.livesLost; m.plan = null; m.leverPlan = null; m.forget = null; m.byCrown = null; m.lure = null; }
  const sk = skillOf(b, g);
  // smoke when a guard is right on your heels
  if (!g.bonus && !g.secret && g.ammo.smoke > 0 && b.rand() < 0.02 + 0.98 * b.skill) {
    for (const gd of g.guards) {
      if (gd.dead || gd.state !== 'chase' || gd.stun > 0) continue;
      if (Math.hypot(gd.x - g.p.x, gd.y - g.p.y) < 1.7) { g.dropSmoke(); break; }
    }
  }
  const G = goalsOf(g, b);
  if (!G.cells.length) return s.hold([]);
  const [px, py] = cellOf(g.p), here = py * w + px;
  // getting nowhere for a while (a guard parked by the crown): throw a coin to lure it away
  if (!g.bonus && !g.secret) {
    const dGoal = field(g, G.cells.map((i) => [i % w, (i / w) | 0]), 'g' + G.cells.join(','))[here];
    if (m.stallKey !== G.act + s.livesLost || dGoal < m.stallBest) { m.stallKey = G.act + s.livesLost; m.stallBest = dGoal; m.stallT = g.t; }
    if (m.lure && g.t - m.lure.t > 3) m.lure = null;
    if (!m.lure && !g.has && g.ammo.coin > 0 && g.t - m.stallT > sk.patience && g.t - (m.lureT ?? -99) > 6) m.lure = lurePlan(g, G);
    if (m.lure) {
      const err = angDiff(m.lure.a, g.p.a);
      if (Math.abs(err) < 0.03) { g.throwCoin(); m.lure = null; m.lureT = g.t; m.stallT = g.t; m.plan = null; }
      else return s.hold([err > 0 ? 'right' : 'left']);
    }
  }
  // beside the crown: lift it only when no guard would cut off the run out (else lure one away, or wait)
  let hold = false;
  if (G.act === 'crown' && G.cells.includes(here)) {
    m.byCrown ??= g.t;
    const loser = g.t - m.byCrown < sk.grabWait ? raceLoser(g, b, sk) : null;
    if (loser) {
      hold = true;
      if (!m.lure && g.ammo.coin > 0 && g.t - (m.lureT ?? -99) > 4) m.lure = lurePlan(g, G, loser);
      if (m.lure) {
        const err = angDiff(m.lure.a, g.p.a);
        if (Math.abs(err) < 0.03) { g.throwCoin(); m.lure = null; m.lureT = g.t; m.plan = null; }
        else return s.hold([err > 0 ? 'right' : 'left']);
      }
    }
  } else if (G.act !== 'crown') m.byCrown = null;
  // at the goal: face the thing and press Space
  if (!hold && G.face && G.cells.includes(here) && Math.hypot(g.p.x - px - 0.5, g.p.y - py - 0.5) < 0.3) {
    const fx = G.face[0] + 0.5, fy = G.face[1] + 0.5, err = angDiff(Math.atan2(fy - g.p.y, fx - g.p.x), g.p.a);
    if (Math.abs(err) < 0.25) { s.hold([]); s.keyDown('action'); s.keyUp('action'); return; }
    return s.hold([err > 0 ? 'right' : 'left']);
  }
  // where on the plan we are: the step for this square nearest to the schedule
  const P = m.plan;
  let j = -1;
  if (P) {
    const due = Math.round((g.t - P.at) / P.tau);
    for (let d = 0; d <= 6 && j < 0; d++) { if (P.line[due - d] === here) j = due - d; else if (P.line[due + d] === here) j = due + d; }
  }
  // look again every so often: keep the plan while it still looks safe, else plan afresh
  if (!P || j < 0 || g.t >= m.lookAt || m.goalKey !== G.act + G.cells[0] + hold || (!P.reached && P.line.length - j < P.n * 0.5)) {
    m.lookAt = g.t + sk.look * (0.6 + 0.8 * b.rand());
    if (b.skill < 1 && b.rand() < (1 - b.skill) * 0.25) m.forget = g.guards[Math.floor(b.rand() * g.guards.length)]?.i; else if (b.rand() < 0.3) m.forget = null;
    let keep = false;
    const safeWorld = g.bonus || g.secret;
    const carry = g.has && !g.secret, tau = 1 / (2 * (carry ? SPEED.carry : SPEED.walk)) * sk.slack;
    const D = safeWorld ? null : dangerMap(g, b, sk.horizon, tau, sk);
    if (P && j >= 0 && m.goalKey === G.act + G.cells[0] + hold && P.tau === tau && (P.reached || P.line.length - j >= P.n * 0.5)) {
      keep = true;
      const N = g.f.w * g.f.h;
      if (D) for (let k = 1; k <= sk.horizon; k++) { const c = P.line[Math.min(j + k, P.line.length - 1)]; if (D[k * N + c] === 2 || (D[k * N + c] === 1 && !g.has)) { keep = false; break; } }
      if (keep) { P.line = P.line.slice(j); P.at = g.t; j = 0; }
    }
    m.goalKey = G.act + G.cells[0] + hold;
    if (!keep) { m.plan = search(g, b, G.cells, sk, { ignoreDanger: safeWorld, D, hold }); j = 0; }
  }
  const plan = m.plan;
  if (!plan) return steer(g, s, px + 0.5, py + 0.5, true);         // no way on right now: hold the middle of the square
  let q = j + 1;
  while (q < plan.line.length && plan.line[q] === here) q++;
  if (q >= plan.line.length) return steer(g, s, px + 0.5, py + 0.5, true);
  const next = plan.line[q], nx = next % w, ny = (next / w) | 0;
  // the step into the next square starts two steps before we are due there
  if (g.t - plan.at < (q - 2.5) * plan.tau) return steer(g, s, nx + 0.5, ny + 0.5, false);   // wait, turned towards it
  steer(g, s, nx + 0.5, ny + 0.5, true);
}

// ── the plan (bot-plan.mjs): picture the guards, and how they would react to each way through ──
const horizonOf = (g) => Math.min(70, (g.f.seal || 45) + 6);
/** How the escape goes from square `from` once the crown is up: straight to the stairs, or by the lever. */
function wayOut(g, from) {
  const f = g.f, w = f.w, shut = (x, y) => { const v = g.g.at(x, y); return v === C.OPEN || v === C.ALCOVE || v === C.CRACK; };
  const dE = bfs(g.g, [f.exit], shut)[from];
  if (!f.gate || !f.lever || g.leverOn) return { lever: null };
  const o = [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy], oi = o[1] * w + o[0];
  const dO = bfs(g.g, [o], shut)[from], open = bfs(g.g, [f.exit], (x, y) => shut(x, y) || g.g.at(x, y) === C.GATE)[oi];
  return { lever: dO >= 0 && open >= 0 && (dE < 0 || dO + open + 3 < dE) ? oi : null };
}
/**
 * A timed way from where we stand to `goals` that survives the guards as they would really react
 * to it. Starts from the clockwork forecast, walks the candidate through the game's guard code,
 * and where that goes wrong plans again round what the guards did, a few times over.
 * o: { goals, speed, grabAt (s from now, or null), pass, a0, strictFirst }. Returns { path, t0, ok, caught } or null.
 */
function findWay(g, b, o) {
  const f = g.f, w = f.w, N = w * f.h, [px, py] = cellOf(g.p), here = py * w + px, H = horizonOf(g);
  const kg = o.grabAt == null ? (g.has ? 0 : 1e9) : Math.round(o.grabAt / EVERY), k0 = o.grabAt == null ? 0 : kg + 2;
  const extra = { wraith: g.wraith ? { x: g.wraith.x, y: g.wraith.y, speed: f.wraithSpeed, wake: g.has ? Math.max(0, 3 - g.wraith.t) : 3 } : null,
    collapse: f.collapse ? { since: Math.max(0, g.collapseT) } : null };
  let fc = clockwork(g, { horizon: H, grabAt: o.grabAt });
  let bestTry = null;
  for (let round = 0; round < (o.rounds || 4); round++) {
    const D = dangers(g, fc, { kGrab: kg, margin: b.sk.margin, near: [0.8, 1.0, 1.2, 1.4][round], ...extra });
    let r = null;
    if (round === 0 || o.strictFirst) r = route(g, D, fc.K, { from: here, a0: o.a0 ?? g.p.a, k0, goals: o.goals, speed: o.speed, allow: 0, pass: o.pass });
    if (!r) r = route(g, D, fc.K, { from: here, a0: o.a0 ?? g.p.a, k0, goals: o.goals, speed: o.speed, allow: 1, pass: o.pass });
    if (!r) break;
    const path = k0 ? [{ i: here, k: 0 }, ...r.path] : r.path;
    let end = r.kEnd, leverAt = null, whole = true;
    if (o.lever) {
      // by the lever: time to turn and pull it, then on through the open gate to the stairs
      const DWELL = 10, lv = o.lever;
      path.push({ i: lv.cell, k: end + DWELL });
      leverAt = (end + DWELL - 2) * EVERY;
      const r2 = route(g, D, fc.K, { from: lv.cell, a0: lv.a, k0: end + DWELL, goals: lv.goals, speed: o.speed, allow: 1, pass: lv.pass });
      if (r2) { path.push(...r2.path.slice(1)); end = r2.kEnd; } else { whole = false; end += DWELL; }
    }
    // walk it through the guards as they would really react (and keep what they did, to plan round it)
    const again = clockwork(g, { horizon: Math.min(H, (end + 2) * EVERY), grabAt: o.grabAt, leverAt, walk: { path, speed: o.speed, smoke: true, tight: b.sk.tight } });
    // …and once more setting off a quarter of a second late: a plan that only works to the tick is no plan
    const late = again.caught < 0 ? clockwork(g, { horizon: Math.min(H, (end + 4) * EVERY), grabAt: o.grabAt, leverAt: leverAt == null ? null : leverAt + 0.25, walk: { path: path.map((n, idx) => (idx ? { i: n.i, k: n.k + 2 } : n)), speed: o.speed, smoke: true, tight: b.sk.tight } }) : again;
    if (late.caught >= 0 && again.caught < 0) again.caught = late.caught;
    const cand = { path, t0: g.t, ok: whole && again.caught < 0 && (o.unseen ? !again.chased : true), caught: again.caught < 0 && !whole ? end * EVERY : again.caught, kEnd: end, leverAt: leverAt == null ? null : g.t + leverAt };
    if (cand.ok) return cand;
    if (!bestTry || cand.caught > bestTry.caught) bestTry = cand;
    if (again.K < fc.K) { for (let k = 0; k < again.K; k++) for (let i = 0; i < fc.n; i++) { const j = k * fc.n + i; fc.x[j] = again.x[j]; fc.y[j] = again.y[j]; fc.a[j] = again.a[j]; fc.flag[j] = again.flag[j]; }
      // from the catch on, hold the guards where they were: that spot stays dangerous
      for (let k = again.K; k < Math.min(fc.K, again.K + 24); k++) for (let i = 0; i < fc.n; i++) { const j = k * fc.n + i, l = (again.K - 1) * fc.n + i; fc.x[j] = again.x[l]; fc.y[j] = again.y[l]; fc.a[j] = again.a[l]; fc.flag[j] = again.flag[l]; }
    } else {
      for (let k = 0; k < Math.min(again.K, fc.K); k++) for (let i = 0; i < fc.n; i++) { const j = k * fc.n + i; fc.x[j] = again.x[j]; fc.y[j] = again.y[j]; fc.a[j] = again.a[j]; fc.flag[j] = again.flag[j]; }
    }
  }
  return bestTry;
}
/** Walk a timed path. Returns false when we have fallen off it (too late, or somewhere else). */
function follow(g, s, P) {
  const w = g.f.w, [px, py] = cellOf(g.p), here = py * w + px, k = (g.t - P.t0) / EVERY;
  let q = 0;
  while (q < P.path.length - 1 && P.path[q + 1].k <= k) q++;       // the last square we should have reached
  let j = -1;
  for (let d = 0; d <= 3 && j < 0; d++) { if (P.path[q + d]?.i === here) j = q + d; else if (P.path[q - d]?.i === here) j = q - d; }
  if (j < 0) return false;
  // the next different square after where we are, once it is time to set off for it
  let n = j; while (n < P.path.length - 1 && P.path[n + 1].i === here) n++;
  const nxt = P.path[n + 1];
  const stepK = Math.ceil(1 / (g.has && !g.secret ? SPEED.carry : SPEED.walk) / EVERY - 1e-9);
  const sp = spots(g);
  if (!nxt || k < P.path[n].k - 0.5) { steer(g, s, sp.x[here], sp.y[here], true); return true; }   // wait on the square's spot
  const go = k >= nxt.k - stepK - 0.5;
  steer(g, s, sp.x[nxt.i], sp.y[nxt.i], go);
  return k < nxt.k + 8;                                             // far behind: fallen off
}
function faceAndPress(g, s, cell) {
  const err = angDiff(Math.atan2(cell[1] + 0.5 - g.p.y, cell[0] + 0.5 - g.p.x), g.p.a);
  if (Math.abs(err) < 0.25) { s.hold([]); s.keyDown('action'); s.keyUp('action'); return true; }
  s.hold([err > 0 ? 'right' : 'left']);
  return false;
}
/** The rest of plan P from now, as a path timed from this moment. */
function restOf(g, P) {
  const w = g.f.w, [px, py] = cellOf(g.p), here = py * w + px, k = Math.round((g.t - P.t0) / EVERY);
  const out = [{ i: here, k: 0 }];
  for (const n of P.path) if (n.k > k) out.push({ i: n.i, k: n.k - k });
  return out;
}

function bot(g, s, b) {
  const m = b.mem, f = g.f, w = f.w;
  if (g.done || g.caughtFx) return s.hold([]);
  if (g.bonus || g.secret) return reactive(g, s, b);
  {
    // The way it has learned, from the start of each try at the floor. The expert plays it to the
    // tick. A weaker player knows the way too but not the timing: every so often it hesitates
    // (0.1–0.4 s with no key held) and is then that much late for everything after, which the
    // floor forgives or doesn't. After two tries that did not get out it plays on by eye.
    // (a try after a catch reaches the player one engine step in, so a fresh one waits out its first step too:
    // every try then begins from the very same moment)
    if (g.tryT < 1e-9) return s.hold([]);
    if (m.wayLives !== s.livesLost) { m.wayLives = s.livesLost; m.way9 = (m.wayFails ?? 0) < (b.skill >= 0.9 ? 2 : 4) ? learnedWay(g) : null; m.wi = 0; m.pause = 0; if (s.livesLost) m.wayFails = (m.wayFails ?? 0) + (m.wayTried ? 1 : 0); m.wayTried = !!m.way9; }
    if (m.way9) {
      if (m.pause > 0) { m.pause--; return s.hold([]); }
      if (b.skill < 0.9 && b.rand() < (1 - b.skill) * 0.22 / 120) { m.pause = Math.round((0.1 + 0.3 * b.rand()) * 120); return s.hold([]); }
      if (m.wi < m.way9.length) {
        const k = m.way9[m.wi++];
        s.hold([...(k & KEY.up ? ['up'] : []), ...(k & KEY.left ? ['left'] : []), ...(k & KEY.right ? ['right'] : [])]);
        if (k & KEY.use) g.use();
        if (k & KEY.coin) g.throwCoin();
        if (k & KEY.smoke) g.dropSmoke();
        return;
      }
      m.way9 = null;                                           // it did not get out: play on by eye
    }
  }
  if (m.cwLives !== s.livesLost) { m.cwLives = s.livesLost; m.cw = null; m.grab = null; m.way = null; m.waitFrom = null; m.checkAt = 0; m.react = 0; m.holdOff = null; m.away = false; }
  // a weaker player reads the guards with less room to spare, looks again less often and waits less long
  b.sk = { margin: -0.25 + 0.6 * b.skill, grabLook: 6 + 15 * b.skill, patience: 8 + 16 * b.skill, recheck: 0.4 + (1 - b.skill) * 1.5, careless: (1 - b.skill) * 0.5, tight: 0.55 + 0.35 * b.skill };
  const [px, py] = cellOf(g.p), here = py * w + px, centred = Math.hypot(g.p.x - px - 0.5, g.p.y - py - 0.5) < 0.36;
  const pass = (x, y) => passable(g, x, y), exit = f.exit[1] * w + f.exit[0];
  if (wantsSmoke(g) && b.rand() < 0.3 + 0.7 * b.skill) g.dropSmoke();
  if (!g.has && s.livesLost > 0 && g.t < (m.holdOff ??= g.t + ((s.livesLost * 1.7) % 6))) return s.hold([]);   // after a failure: set off at a different moment
  if (g.t < m.react) return reactive(g, s, b);                     // no way through in sight: run, hide, smoke
  const gateOpen = (x, y) => passable(g, x, y) || g.g.at(x, y) === C.GATE;
  const leverLeg = (cell) => ({ cell, a: Math.atan2(f.lever.y - ((cell / w) | 0), f.lever.x - (cell % w)), goals: [exit], pass: gateOpen });
  if (g.has) {
    m.way ??= wayOut(g, here);
    const byLever = m.way.lever != null && !g.leverOn;
    if (byLever && here === m.way.lever) {                          // at the lever: pull it (the plan waits here for that)
      if (!centred) return steer(g, s, px + 0.5, py + 0.5, true);
      faceAndPress(g, s, [f.lever.x, f.lever.y]);
      if (g.leverOn) m.checkAt = 0;
      return;
    }
    // look again every so often: does the plan still hold, the guards being where they now are?
    if (m.cw && g.t >= m.checkAt) {
      m.checkAt = g.t + b.sk.recheck;
      if (m.cw.byLever !== byLever && !(m.cw.byLever && g.leverOn)) m.cw = null;
      else if (b.rand() >= b.sk.careless) {
        const sim = clockwork(g, { horizon: 16, leverAt: byLever && m.cw.leverAt != null ? Math.max(0, m.cw.leverAt - g.t) : null, walk: { path: restOf(g, m.cw), speed: SPEED.carry, smoke: true } });
        if (sim.caught >= 0) m.cw = null;
      }
    }
    if (!m.cw) {
      const P = findWay(g, b, { goals: [byLever ? m.way.lever : exit], speed: SPEED.carry, pass, strictFirst: true, lever: byLever ? leverLeg(m.way.lever) : null });
      m.checkAt = g.t + b.sk.recheck;
      if (!P || (!P.ok && P.caught < 2.5)) { m.react = g.t + 1.0; return reactive(g, s, b); }
      P.byLever = byLever; m.cw = P;
    }
    if (!follow(g, s, m.cw)) { m.cw = null; s.hold([]); }
    return;
  }
  const beside = Math.abs(px - f.crown[0]) + Math.abs(py - f.crown[1]) === 1;
  if (beside && Math.hypot(g.p.x - px - 0.5, g.p.y - py - 0.5) < 0.2 && !m.away) {
    m.waitFrom ??= g.t;
    if (m.grab && g.t >= m.grab.at) { faceAndPress(g, s, f.crown); if (g.has) { m.way = null; m.cw = null; } return; }
    if (!m.grab && g.t >= m.checkAt) {
      m.checkAt = g.t + 3;
      // the first moment to lift the crown that has a way out (to the lever, or the stairs) that survives
      const way = wayOut(g, here), goal = way.lever != null ? way.lever : exit;
      const gateShut = (x, y) => passable(g, x, y) && g.g.at(x, y) !== C.GATE;
      const toFace = Math.atan2(f.crown[1] + 0.5 - g.p.y, f.crown[0] + 0.5 - g.p.x);
      const patient = g.t - m.waitFrom < b.sk.patience;
      let fallback = null;
      for (let d = 0.3; d <= b.sk.grabLook && !m.grab; d += 1.5) {
        const stay = clockwork(g, { horizon: d + 0.2, walk: { path: [{ i: here, k: 0 }], speed: SPEED.walk } });
        if (stay.caught >= 0 || stay.chased) break;               // can't even wait here that long
        const P = findWay(g, b, { goals: [goal], speed: SPEED.carry, grabAt: d, pass: f.gate ? gateShut : pass, a0: toFace, strictFirst: true, rounds: 3, lever: way.lever != null ? leverLeg(way.lever) : null });
        if (P?.ok || (P && b.rand() < b.sk.careless)) m.grab = { at: g.t + d };
        else if (P && (!fallback || P.caught - d > fallback.left)) fallback = { at: g.t + d, left: P.caught - d };
      }
      if (!m.grab) {
        // nothing yet. Step away if standing here would get us seen; lift it anyway when out of patience
        const stay = clockwork(g, { horizon: 4, walk: { path: [{ i: here, k: 0 }], speed: SPEED.walk } });
        if (stay.caught >= 0 || stay.chased) {
          // back into the shadows for a while (the nearest alcove), then come again
          const cells = [];
          for (let y = 0; y < f.h; y++) for (let x = 0; x < w; x++) if (g.g.at(x, y) === C.ALCOVE) cells.push(y * w + x);
          cells.push(f.start[1] * w + f.start[0]);
          const P = findWay(g, b, { goals: cells, speed: SPEED.walk, pass, strictFirst: true, unseen: true, rounds: 2 });
          if (P) { m.cw = P; m.away = true; m.backAt = g.t + P.kEnd * EVERY + 5; }
        } else if (!patient && fallback) m.grab = { at: fallback.at };
      }
    }
    if (!m.away) {                                                  // wait, turned to the crown
      const err = angDiff(Math.atan2(f.crown[1] + 0.5 - g.p.y, f.crown[0] + 0.5 - g.p.x), g.p.a);
      return s.hold(Math.abs(err) > 0.1 ? [err > 0 ? 'right' : 'left'] : []);
    }
  }
  if (!m.away) m.grab = null;
  // the way in (or stepping away from the crown and back): unseen
  if (m.cw && g.t >= m.checkAt) {
    m.checkAt = g.t + b.sk.recheck;
    if (b.rand() >= b.sk.careless) { const sim = clockwork(g, { horizon: 12, walk: { path: restOf(g, m.cw), speed: SPEED.walk } }); if (sim.caught >= 0 || sim.chased) m.cw = null; }
  }
  if (m.away) {                                                   // in the shadows: wait a little, then try again
    if (g.t >= m.backAt) { m.cw = null; m.away = false; m.waitFrom = null; }
    else if (m.cw && here === m.cw.path[m.cw.path.length - 1].i) return steer(g, s, px + 0.5, py + 0.5, true);
  }
  if (!m.cw) {
    const cells = DIRS.map(([dx, dy]) => [f.crown[0] + dx, f.crown[1] + dy]).filter(([x, y]) => passable(g, x, y)).map(([x, y]) => y * w + x);
    const P = findWay(g, b, { goals: cells, speed: SPEED.walk, pass, strictFirst: true, unseen: true });
    m.checkAt = g.t + b.sk.recheck;
    if (m.away) m.backAt = g.t;
    if (!P || (!P.ok && P.caught >= 0 && P.caught < 2.5)) { m.react = g.t + 1.2; return reactive(g, s, b); }
    m.cw = P;
  }
  if (!follow(g, s, m.cw)) { m.cw = null; m.away = false; s.hold([]); }
}

const best = new WeakMap();

export default {
  // floors 1–15 (5 and 10 are 15 s treasure vaults) + the Empty Throne (16). An escape takes
  // ~20–60 s (seal countdowns are 34–59 s); a catch sends you back to the entrance
  limit: (level) => (level === 16 ? 60 : 240),
  stuck: 90,                               // it may wait in the shadows for the right moment to lift the crown

  progress(g, s) {
    if (g.bonus) return g.coinsHere;
    const G = goalsOf(g, { mem: g.__pm ??= {} });
    if (s.livesLost !== g.__pl) { g.__pl = s.livesLost; g.__pm = {}; best.delete(g); }
    const w = g.f.w, [px, py] = cellOf(g.p), d = field(g, G.cells.map((i) => [i % w, (i / w) | 0]), 'g' + G.cells.join(','))[py * w + px];
    const phase = (g.has ? 2 : 0) + (g.leverOn ? 1 : 0) + (g.done ? 4 : 0);
    const was = best.get(g);
    const near = was && was.phase === phase ? Math.min(was.near, d < 0 ? 999 : d) : (d < 0 ? 999 : d);
    best.set(g, { phase, near });
    return s.livesLost * 1e5 + phase * 1e4 + (999 - near);
  },

  invariants(g, s) {
    const p = g.p, f = g.f;
    if (![p.x, p.y, p.a].every(Number.isFinite)) return 'the player position or facing is not a number';
    if (p.x < 0 || p.y < 0 || p.x >= f.w || p.y >= f.h) return `the player is off the map at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
    const [cx, cy] = cellOf(p);
    if (!g.done && !g.caughtFx && !g.walkable(cx, cy)) return `the player is standing inside a ${Object.keys(C).find((k) => C[k] === g.g.at(cx, cy))?.toLowerCase()} square at (${cx}, ${cy})`;
    if (!g.done && !g.caughtFx) {
      // never inside a wall (walls and levers never move; a gate, a pit or rubble can appear next to you)
      for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
        const v = g.g.at(xx, yy);
        if (v !== C.WALL && v !== C.LEVER) continue;
        const nx = Math.max(xx, Math.min(p.x, xx + 1)), ny = Math.max(yy, Math.min(p.y, yy + 1));
        if (Math.hypot(p.x - nx, p.y - ny) < 0.2) return `the player is inside a wall at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
      }
    }
    // speed caps: the player walks at most 2.75 squares a second (strafing adds 2.1 sideways)
    const last = g.__last;
    if (last && last.p === p && !g.done) {
      const v = Math.hypot(p.x - last.x, p.y - last.y) / (s.time - last.t || 1);
      if (v > Math.hypot(SPEED.walk, SPEED.strafe) * 1.01 + 1e-6) return `the player moved at ${v.toFixed(2)} squares/s`;
    }
    g.__last = { p, x: p.x, y: p.y, t: s.time };
    const gl = (g.__gl ??= new WeakMap());
    for (const gd of g.guards) {
      if (![gd.x, gd.y, gd.a, gd.sus].every(Number.isFinite)) return `guard ${gd.i}'s position, facing or suspicion is not a number`;
      if (gd.sus < -1e-9 || gd.sus > 1 + 1e-9) return `guard ${gd.i}'s suspicion is ${gd.sus}`;
      if (gd.dead) continue;
      const gx = Math.floor(gd.x), gy = Math.floor(gd.y);
      if (!g.walkable(gx, gy) && g.g.at(gx, gy) !== C.GATE && g.g.at(gx, gy) !== C.PIT && g.g.at(gx, gy) !== C.RUBBLE) return `a ${gd.kind} is inside a wall at (${gx}, ${gy})`;
      const was = gl.get(gd);
      if (was) {
        const v = Math.hypot(gd.x - was.x, gd.y - was.y) / (s.time - was.t || 1);
        if (v > GUARD[gd.kind].run * 1.01 + 1e-6) return `a ${gd.kind} moved at ${v.toFixed(2)} squares/s (its run is ${GUARD[gd.kind].run})`;
      }
      gl.set(gd, { x: gd.x, y: gd.y, t: s.time });
    }
    if (g.wraith) {
      const wr = g.wraith;
      if (!Number.isFinite(wr.x) || !Number.isFinite(wr.y)) return 'the Wraith position is not a number';
      const was = g.__wr;
      if (was && was.w === wr) { const v = Math.hypot(wr.x - was.x, wr.y - was.y) / (s.time - was.t || 1); if (v > f.wraithSpeed * 1.01 + 1e-6) return `the Wraith moved at ${v.toFixed(2)} (its speed is ${f.wraithSpeed})`; }
      g.__wr = { w: wr, x: wr.x, y: wr.y, t: s.time };
    }
    if (g.has && !g.secret && !g.bonus && !(g.sealT >= 0 && g.sealT <= f.seal + 1e-9)) return `the seal countdown is ${g.sealT} of ${f.seal}`;
    if (!(g.ammo.coin >= 0 && g.ammo.coin <= 6)) return `${g.ammo.coin} coins to throw (0–6)`;
    if (!(g.ammo.smoke >= 0 && g.ammo.smoke <= 3)) return `${g.ammo.smoke} smoke bombs (0–3)`;
    if (g.coinsHere > f.coins.length) return `${g.coinsHere} coins picked up of ${f.coins.length}`;
    if (g.taken.size > f.coins.length + f.chests.length) return `${g.taken.size} pick-ups taken of ${f.coins.length + f.chests.length}`;
    if (f.gate && g.gateShut && !g.leverOn && g.walkable(f.gate.x, f.gate.y)) return 'the portcullis is shut but can be walked through';
    if (g.leverOn && !g.gateShut) return 'the lever is pulled but the portcullis never shut';
    if ((g.bonus || g.secret) && s.livesLost) return 'a life was lost on a floor with nothing that can catch you';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.mLives ??= s.livesLost;
    if (s.livesLost > m.mLives) { m.plan = null; bot(g, s, b); return true; }   // caught: the new try starts on this very step
    if (g.bonus || g.secret) return true;
    if (g.done || g.caughtFx) { s.hold([]); return false; }
    // walk straight at the nearest guard
    const alive = g.guards.filter((gd) => !gd.dead);
    if (!alive.length) { bot(g, s, b); return false; }
    const w = g.f.w, [px, py] = cellOf(g.p);
    let target = null, td = Infinity;
    for (const gd of alive) {
      const d = field(g, [cellOf(gd)], 'm' + cellOf(gd).join(','))[py * w + px];
      if (d >= 0 && d < td) { td = d; target = gd; }
    }
    if (!target) { bot(g, s, b); return false; }
    if (td <= 1) return steer(g, s, target.x, target.y, true);
    const d = field(g, [cellOf(target)], 'm' + cellOf(target).join(','));
    let nx = px, ny = py;
    for (const [dx, dy] of DIRS) { const v = d[(py + dy) * w + px + dx]; if (v >= 0 && v < d[py * w + px]) { nx = px + dx; ny = py + dy; break; } }
    steer(g, s, nx + 0.5, ny + 0.5, true);
    return false;
  },
};

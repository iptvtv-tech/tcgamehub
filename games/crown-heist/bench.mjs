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
import { C, SPEED, bfs } from './floors.js';

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
  const T = GUARD[gd.kind], P = g.p;
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
    const T = GUARD[gd.kind];
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

function bot(g, s, b) {
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

const best = new WeakMap();

export default {
  wip: 'expert bot finishes floors 1-3, the vaults and 16 after a mistake, but mostly not 4-15 yet: it gets caught by the crown (knights alerted by the grab converge on dead-end crown rooms) — needs better grab timing, lures and hiding',
  // floors 1–15 (5 and 10 are 15 s treasure vaults) + the Empty Throne (16). An escape takes
  // ~20–60 s (seal countdowns are 34–59 s); a catch sends you back to the entrance
  limit: (level) => (level === 16 ? 60 : 240),
  stuck: 45,

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
    if (s.livesLost > m.mLives) { m.plan = null; return true; }
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

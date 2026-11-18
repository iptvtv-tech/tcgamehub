// Planning for the Crown Heist benchmark bot (bench.mjs). Not used by the game.
// A guard that has not seen you is clockwork: it walks its loop, and when the crown is lifted it
// walks to the pedestal, looks around, and goes back. So the bot does what a player who has
// watched a floor for a long time does: it runs the guards forward in its head (with the game's
// own guard code, on a copy, the player out of sight), for "I lift the crown now", "…in a second",
// "…in two", and for each looks for a way out, square by square and moment by moment, on which no
// guard ever sees or touches it, waiting in an alcove where that is what it takes. It lifts the
// crown at the first moment that has such a way out, and then walks it to the clock.
import { C, SPEED } from './floors.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const GUARD = {
  skeleton: { range: 4.1, cone: 0.55 },
  knight: { range: 5.0, cone: 0.6 },
};
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const EVERY = 0.125;                        // seconds per planning step
const noop = () => {};
const quiet = { state: 'playing', sound: { play: noop, tone: noop, noise: noop }, award: noop, unlock: noop, fx: { text: noop, flash: noop, shake: noop } };

/** The smoke rule (the same in the bot's head and in its hands): a guard after you within arm's reach, or anyone almost touching. */
export function wantsSmoke(g) {
  if (!(g.ammo.smoke > 0)) return false;
  for (const o of g.guards) {
    if (o.dead || o.stun > 0) continue;
    const d = Math.hypot(o.x - g.p.x, o.y - g.p.y);
    if (d < 0.8 || (d < 1.45 && o.state === 'chase')) return true;
  }
  return false;
}

/**
 * Where in each square the bot stands and walks. Next to a sentry's post it keeps to the far side of
 * the square (a quarter of a square off the middle), as a player does slipping past a guard who
 * stands still: the middle of the square would be within the 1.15 squares at which a guard notices
 * you whichever way it faces. Returns { x, y } Float32Arrays of positions by square.
 */
export function spots(g) {
  const f = g.f;
  if (f.__spots) return f.__spots;
  const w = f.w, N = w * f.h, x = new Float32Array(N), y = new Float32Array(N);
  for (let i = 0; i < N; i++) { x[i] = (i % w) + 0.5; y[i] = ((i / w) | 0) + 0.5; }
  for (const gd of f.guards) {
    if (!gd.sentry) continue;
    const sx = gd.route[0][0] + 0.5, sy = gd.route[0][1] + 0.5;
    for (let i = 0; i < N; i++) {
      const cx = (i % w) + 0.5, cy = ((i / w) | 0) + 0.5, dx = cx - sx, dy = cy - sy, d = Math.hypot(dx, dy);
      if (d < 0.5 || d > 1.7) continue;
      if (Math.abs(dx) > 0.2) x[i] = cx + Math.sign(dx) * 0.26;
      if (Math.abs(dy) > 0.2) y[i] = cy + Math.sign(dy) * 0.26;
    }
  }
  return (f.__spots = { x, y });
}

/** Where the player is at time t (seconds from the path's start) on timed path [{ i, k }]: { x, y, cell, moving }. */
export function whereOn(path, t, w, stepK, sp) {
  const k = t / EVERY;
  let q = 0;
  while (q < path.length - 1 && path[q + 1].k <= k) q++;
  const a = path[q], b = path[Math.min(q + 1, path.length - 1)];
  const ax = sp.x[a.i], ay = sp.y[a.i];
  if (a.i === b.i || q === path.length - 1) return { x: ax, y: ay, cell: a.i, moving: false };
  const from = b.k - stepK;                              // turn on the spot until then, then walk
  if (k <= from) return { x: ax, y: ay, cell: a.i, moving: false };
  const u = Math.min(1, (k - from) / stepK), bx = sp.x[b.i], by = sp.y[b.i];
  return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, cell: u < 0.5 ? a.i : b.i, moving: true };
}

/**
 * Run the guards forward `horizon` seconds with the game's own guard code, on a copy.
 * walk: null (the player stays out of sight: pure clockwork), or { path, speed } — a player walking
 *   that timed path, whom the guards can see, suspect, chase and catch exactly as in the game.
 * grabAt / leverAt: seconds from now at which the crown is lifted / the lever pulled.
 * Returns { K, n, x, y, a, flag (1 dead, 2 blind, 4 alert), kind, caught (seconds, or -1), chased }.
 */
export function forecast(g, { horizon = 60, grabAt = null, leverAt = null, walk = null } = {}) {
  const sh = Object.create(g), w = g.f.w, sp = spots(g);
  sh.guards = g.guards.map((o) => ({ ...o, target: o.target ? [...o.target] : o.target, last: o.last ? [...o.last] : o.last, lost: o.lost ? { ...o.lost } : null }));
  sh.p = walk ? { x: g.p.x, y: g.p.y, a: g.p.a } : { x: -50, y: -50, a: 0 };
  sh.hidden = walk ? g.hidden : false; sh.moving = false; sh.s = quiet; sh.say = noop; sh.spotted = true;
  sh.smokes = walk ? g.smokes.map((q) => ({ ...q })) : []; sh.ammo = { ...g.ammo };
  sh.t = g.t; sh.tryT = g.tryT; sh.has = g.has; sh.gateShut = g.gateShut; sh.leverOn = g.leverOn; sh.caughtFx = null; sh.done = false;
  let caught = -1, now = 0, chased = false;
  sh.die = () => { if (caught < 0) caught = now; };
  sh.startChase = function (o) { chased = true; return g.startChase.call(this, o); };
  if (g.wraith) sh.wraith = { ...g.wraith };
  if (!walk) for (const o of sh.guards) if (o.state === 'chase') { o.state = 'search'; o.searchT = 3.5; o.sus = 0.4; }
  const stepK = walk ? Math.ceil(1 / walk.speed / EVERY - 1e-9) : 0;
  const dt = 1 / 32, per = Math.round(EVERY / dt), K = Math.floor(horizon / EVERY) + 1, n = sh.guards.length;
  const out = { K, n, x: new Float32Array(K * n), y: new Float32Array(K * n), a: new Float32Array(K * n), flag: new Uint8Array(K * n), kind: sh.guards.map((o) => o.kind), caught: -1, chased: false };
  let grabbed = g.has;
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < n; i++) {
      const o = sh.guards[i], j = k * n + i;
      out.x[j] = o.x; out.y[j] = o.y; out.a[j] = o.a;
      out.flag[j] = (o.dead ? 1 : 0) | (o.stun > 0 ? 2 : 0) | (o.alert ? 4 : 0);
    }
    for (let q = 0; q < per; q++) {
      now = k * EVERY + q * dt;
      if (!grabbed && grabAt != null && now >= grabAt) {
        grabbed = true; sh.has = true; if (g.f.gate) sh.gateShut = true;
        for (const o of sh.guards) { if (o.dead) continue; o.alert = true; if (o.state !== 'chase') { o.state = 'look'; o.target = [...g.f.crown]; o.lure = false; } }
        if (sh.wraith) sh.wraith.t = 0;
      }
      if (leverAt != null && now >= leverAt) sh.leverOn = true;
      if (walk) {
        const at = whereOn(walk.path, now, w, stepK, sp);
        sh.p.x = at.x; sh.p.y = at.y; sh.moving = at.moving; sh.hidden = g.g.at(at.cell % w, (at.cell / w) | 0) === C.ALCOVE;
      }
      sh.t += dt; sh.tryT += dt;
      if (walk) { if (walk.smoke && wantsSmoke(sh)) sh.dropSmoke(); sh.updateSmoke(dt); }
      sh.updateGuards(dt);
      if (walk && sh.wraith && grabbed && caught < 0) sh.updateWraith(dt);
      // room for error: in the bot's head a guard within `tight` squares has caught it (the game says 0.55)
      if (walk && walk.tight && caught < 0) for (const o of sh.guards) if (!o.dead && o.stun <= 0 && Math.hypot(o.x - sh.p.x, o.y - sh.p.y) < walk.tight) { caught = now; break; }
      if (caught >= 0) { out.caught = caught; out.chased = chased; out.K = k + 1; return out; }
    }
  }
  out.chased = chased;
  return out;
}

/**
 * For every step and square: 0 safe, 1 a guard would see you there, 2 a guard is too close.
 * has: is the crown held from step kGrab on (guards see further then).
 */
export function dangers(g, fc, { kGrab = 0, margin = 0.35, cone = 0.14, near = 1.15, wraith = null, collapse = null } = {}) {
  const f = g.f, w = f.w, N = w * f.h, D = new Uint8Array(fc.K * N);
  const sp = spots(g);
  const los = (g.__los2 ??= new Int8Array(N * N));        // 0 unknown, 1 clear, 2 blocked (walls never move)
  const rev = g.g;
  const see = (gx, gy, i) => {
    const key = (gy * w + gx) * N + i;
    let v = los[key];
    if (!v) { v = g.lineClear(gx + 0.5, gy + 0.5, (i % w) + 0.5, ((i / w) | 0) + 0.5, false) ? 1 : 2; los[key] = v; }
    return v === 1;
  };
  for (let k = 0; k < fc.K; k++) {
    if (k & 1) { D.copyWithin(k * N, (k - 1) * N, k * N); continue; }   // guards move a sixth of a square in a step: every other step is enough
    const base = k * N, held = k >= kGrab;
    for (let q = 0; q < fc.n; q++) {
      const j = k * fc.n + q, fl = fc.flag[j];
      if (fl & 1) continue;
      const gx = fc.x[j], gy = fc.y[j], ga = fc.a[j], T = GUARD[fc.kind[q]];
      const R = T.range + (fl & 4 ? 1.2 : 0) + (held ? 1.0 : 0) + margin, cn = T.cone + (fl & 4 ? 0.15 : 0) + cone;
      const cgx = Math.floor(gx), cgy = Math.floor(gy);
      for (let y = Math.max(0, Math.floor(gy - R)); y <= Math.min(f.h - 1, Math.floor(gy + R)); y++) for (let x = Math.max(0, Math.floor(gx - R)); x <= Math.min(w - 1, Math.floor(gx + R)); x++) {
        const i = y * w + x, v = rev.at(x, y);
        if (v === C.WALL || v === C.LEVER) continue;
        const dx = sp.x[i] - gx, dy = sp.y[i] - gy, d = Math.hypot(dx, dy);
        if (d < near) { D[base + i] = 2; continue; }
        if (D[base + i] || (fl & 2) || d > R) continue;
        if (v === C.ALCOVE) continue;                                   // hidden in the shadows
        if (d > 1.15 + margin && Math.abs(angDiff(Math.atan2(dy, dx), ga)) > cn) continue;
        if (see(cgx, cgy, i)) D[base + i] = 1;
      }
    }
    if (wraith && held) {
      // the Crown Wraith comes straight for the crown, through walls: nowhere it could have reached by now
      const t = (k - Math.max(kGrab, 0)) * EVERY, reach = Math.max(0, t - wraith.wake) * wraith.speed + 1.0;
      for (let y = Math.max(0, Math.floor(wraith.y - reach)); y <= Math.min(f.h - 1, Math.floor(wraith.y + reach)); y++) for (let x = Math.max(0, Math.floor(wraith.x - reach)); x <= Math.min(w - 1, Math.floor(wraith.x + reach)); x++) {
        if (Math.hypot(x + 0.5 - wraith.x, y + 0.5 - wraith.y) < reach) D[base + y * w + x] = 2;
      }
    }
    if (collapse && held) {
      const t = (k - Math.max(kGrab, 0)) * EVERY + collapse.since;
      for (let i = 0; i < N; i++) { const d = f.collapseDist[i]; if (d >= 0 && f.collapseDelay + d / f.collapseSpeed < t + 0.9) D[base + i] = 2; }
    }
  }
  return D;
}

/**
 * The earliest way from (cell, heading a0) at step k0 to any goal square that never passes a
 * danger above `allow` (0: never seen; 1: may be seen, never touched).
 * Returns { path: [{ i, k }] (square and the step to be standing on it), kEnd } or null.
 */
export function route(g, D, K, { from, a0, k0 = 0, goals, speed, allow = 0, pass, holdUntil = 0 }) {
  const f = g.f, w = f.w, N = w * f.h;
  const stepK = Math.ceil(1 / speed / EVERY - 1e-9);
  const headings = DIRS.map(([dx, dy]) => Math.atan2(dy, dx));
  const turnK = (aFrom, di) => Math.max(0, Math.ceil((Math.abs(angDiff(headings[di], aFrom)) - 0.5) / 2.5 / EVERY));
  const goal = new Uint8Array(N); for (const i of goals) goal[i] = 1;
  const S = K * 5 * N;
  const buf = (g.__rb ??= {});
  if (buf.S !== S) { buf.S = S; buf.prev = new Int32Array(S); }
  const prev = buf.prev.fill(-2);
  const id = (k, d, i) => (k * 5 + d) * N + i;
  const ok = (k, i) => D[k * N + i] <= allow;
  if (k0 >= K - 1) return null;                          // no time left in the forecast
  const start = id(k0, 4, from);
  if (!ok(k0, from) && allow === 0) { /* starting somewhere seen: allowed, we are where we are */ }
  prev[start] = -1;
  // steps are processed in time order, so the first goal reached is the earliest
  const buckets = Array.from({ length: K }, () => []);
  buckets[k0].push(start);
  for (let k = k0; k < K; k++) {
    for (const s of buckets[k]) {
      const i = s % N, d = ((s / N) | 0) % 5;
      if (goal[i] && k >= holdUntil) {
        const path = [];
        for (let q = s; q >= 0; q = prev[q]) path.push({ i: q % N, k: (q / N / 5) | 0 });
        return { path: path.reverse(), kEnd: k };
      }
      if (k + 1 < K && ok(k + 1, i)) { const s2 = id(k + 1, d, i); if (prev[s2] === -2) { prev[s2] = s; buckets[k + 1].push(s2); } }
      const x = i % w, y = (i / w) | 0;
      for (let di = 0; di < 4; di++) {
        const nx = x + DIRS[di][0], ny = y + DIRS[di][1];
        if (!pass(nx, ny)) continue;
        const j = ny * w + nx, tk = turnK(d === 4 ? a0 : headings[d], di), k2 = k + tk + stepK;
        if (k2 >= K) continue;
        let fine = true;
        for (let kk = k + 1; kk <= k2 && fine; kk++) {
          if (kk <= k + tk) fine = ok(kk, i);                       // turning on the spot
          else if (kk < k2) fine = ok(kk, i) && ok(kk, j);          // between the two squares
          else fine = ok(kk, j);
        }
        if (!fine) continue;
        const s2 = id(k2, di, j);
        if (prev[s2] === -2) { prev[s2] = s; buckets[k2].push(s2); }
      }
    }
  }
  return null;
}

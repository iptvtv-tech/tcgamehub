// ─────────────────────────────────────────────────────────────
//  CROWN HEIST — "is there a way to take this crown and get out?"
//  A search over ways of playing a floor, played out on private copies of the whole game with the
//  game's own code (update(): walking, guards, coins, smoke, the Wraith, the falling vault), one
//  engine step at a time, so a way found here is a way that works in the game, key press for key
//  press. The real game is never touched.
//
//  A way is a list of small moves: walk to the next square, wait a quarter of a second, lift the
//  crown / pull the lever, throw a coin one of eight ways, drop smoke. The search tries the moves
//  that get the crown out soonest first (A*), and keeps one line of play for each different
//  situation (where you stand and face, when, what you carry, where every guard is and what it is
//  doing). Being seen and chased is allowed; being caught is not.
//
//  Used by the benchmark's expert bot (bench.mjs) and for looking into a floor nobody can finish.
// ─────────────────────────────────────────────────────────────
import { STEP } from '../../tools/lib/headless.mjs';
import { C, SPEED, bfs } from './floors.js';
import { spots } from './bot-plan.mjs';

const NOOP = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : NOOP), apply: () => NOOP });
const noop = () => {};
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const KEY = { up: 1, left: 2, right: 4, use: 8, coin: 16, smoke: 32 };

/** A private copy of the whole game as it stands (the floor plan and its guard routes are only read). */
export function model(g) {
  const m = Object.create(Object.getPrototypeOf(g));
  Object.assign(m, g);
  m.k = 0;                                                    // keys held this step (KEY bits)
  m.s = { state: 'playing', input: { isDown: (a) => (m.k & (KEY[a] || 0)) !== 0, pointer: {}, pointers: new Map() }, lives: 3, time: 0,
    hurt: noop, award: noop, unlock: noop, addScore: noop, completeLevel: noop, legendFound: noop, finishRun: noop, isFlawless: () => false, fx: NOOP, sound: NOOP };
  m.keys = new Set(); m.stick = null; m.pressed = null;
  m.see = noop; m.say = noop; m.relight = noop; m.heartbeat = noop;
  // gold on the floor is left out: a floor is replayed after a catch with that gold already gone,
  // so a way that counts on picking up coins to throw would not work the second time
  m.taken = new Set([...g.f.coins.map(([x, y]) => x + ',' + y), ...g.f.chests.map(([x, y]) => 'T' + x + ',' + y)]);
  return own(m, g);
}
function own(m, from) {
  m.g = from.g.clone(); m.p = { ...from.p }; m.ammo = { ...from.ammo };
  m.thrown = from.thrown.map((o) => ({ ...o })); m.smokes = from.smokes.map((o) => ({ ...o }));
  m.cracking = new Map([...from.cracking].map(([k, v]) => [k, { ...v }]));
  m.guards = from.guards.map((o) => ({ ...o, target: o.target ? [...o.target] : o.target, last: o.last ? [...o.last] : o.last, lost: o.lost ? { ...o.lost, at: [...o.lost.at] } : o.lost }));
  m.wraith = from.wraith ? { ...from.wraith } : from.wraith;
  return m;
}
export function clone(a) {
  const m = Object.create(Object.getPrototypeOf(a));
  Object.assign(m, a);
  m.k = 0;
  m.s = { ...a.s, input: { isDown: (x) => (m.k & (KEY[x] || 0)) !== 0, pointer: {}, pointers: new Map() } };
  return own(m, a);
}
/** One engine step with these keys. Returns 'caught', 'out' or null. */
export function step(m, keys) {
  m.k = keys;
  if (keys & KEY.use) m.use();
  if (keys & KEY.coin) m.throwCoin();
  if (keys & KEY.smoke) m.dropSmoke();
  m.update(STEP);
  return m.caughtFx ? 'caught' : m.done ? 'out' : null;
}

/** The keys a player holds to walk to a point (turn first, then forward). */
function steerKeys(m, tx, ty) {
  const p = m.p, err = angDiff(Math.atan2(ty - p.y, tx - p.x), p.a), d = Math.hypot(tx - p.x, ty - p.y);
  let k = 0;
  if (Math.abs(err) > 0.06) k |= err > 0 ? KEY.right : KEY.left;
  if (d > 0.06 && Math.abs(err) < (d < 0.5 ? 0.35 : 0.6)) k |= KEY.up;
  return k;
}

/**
 * Find a way from the game as it stands to the stairs with the crown.
 * Returns { ok, keys (Uint8Array: the KEY bits to hold on each engine step), secs, moves (text),
 * tried } or { ok: false, why, tried, best }.
 */
/** Where a way (keys per step) takes the player from the game as it stands: [x, y] every quarter second, as far as it goes. */
export function trail(g, keys) {
  const m = model(g), out = [];
  for (let i = 0; i < keys.length; i++) { if (i % 30 === 0) out.push([m.p.x, m.p.y]); if (step(m, keys[i])) break; }
  return out;
}

/** (guide: a trail to stay close to — a way that worked from a slightly different moment of the same floor.) */
export function findRoute(g, { budget = 250000, weight = 1.4, coins = 2, keep = 60000, guide = null, log = null } = {}) {
  const f = g.f, w = f.w, sp = spots(g);                    // where to stand in each square (the far side from a sentry)
  const open = (x, y) => { const v = g.g.at(x, y); return v === C.OPEN || v === C.ALCOVE || v === C.CRACK; };
  const openGate = (x, y) => open(x, y) || g.g.at(x, y) === C.GATE;
  const crownAdj = DIRS.map(([dx, dy]) => [f.crown[0] + dx, f.crown[1] + dy]).filter(([x, y]) => open(x, y));
  const notCrown = (fn) => (x, y) => fn(x, y) && !(x === f.crown[0] && y === f.crown[1]);
  const dCrown = bfs(g.g, crownAdj, notCrown(open));
  const dExitShut = bfs(g.g, [f.exit], notCrown(open)), dExitOpen = bfs(g.g, [f.exit], notCrown(openGate));
  const leverCell = f.lever ? [f.lever.x + f.lever.fx, f.lever.y + f.lever.fy] : null;
  const dLever = leverCell ? bfs(g.g, [leverCell], notCrown(open)) : null;
  const leverOut = leverCell ? dExitOpen[leverCell[1] * w + leverCell[0]] : -1;
  const INF = 1e6, pos = (v) => (v < 0 ? INF : v);
  /** Squares still to walk with the crown from square i. */
  const after = (i, gateShut, leverOn) => {
    if (!f.gate || !gateShut || leverOn) return pos(dExitOpen[i]);
    return Math.min(pos(dExitShut[i]), dLever && leverOut >= 0 ? pos(dLever[i]) + 1.5 + leverOut : INF);
  };
  const afterGrab = Math.min(...crownAdj.map(([x, y]) => after(y * w + x, !!f.gate, false)));
  const h = (m) => {
    const i = Math.floor(m.p.y) * w + Math.floor(m.p.x);
    return m.has ? after(i, m.gateShut, m.leverOn) / SPEED.carry : pos(dCrown[i]) / SPEED.walk + 0.4 + afterGrab / SPEED.carry;
  };
  const keyOf = (m, t) => {
    let s = `${Math.floor(m.p.x)},${Math.floor(m.p.y)},${Math.round(m.p.a / (Math.PI / 4)) & 7},${Math.round(t * 4)},${m.has ? 1 : 0}${m.leverOn ? 1 : 0}${m.ammo.coin}${m.ammo.smoke}${m.smokes.length}${m.thrown.length}`;
    for (const o of m.guards) s += `|${Math.floor(o.x * 2)},${Math.floor(o.y * 2)}${o.state[0]}${o.alert ? 1 : 0}${o.stun > 0 ? 1 : 0}${o.sus > 0.5 ? 1 : 0}`;
    if (m.wraith) s += `|w${Math.floor(m.wraith.x)},${Math.floor(m.wraith.y)}`;
    // remembered as a 52-bit number, not as text (millions of situations are met on a hard floor)
    let a = 0x811c9dc5, b = 0x1b873593;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b + c, 0x85ebca6b) ^ (b >>> 13); }
    return (a >>> 0) * 1048576 + ((b >>> 0) >>> 12);
  };
  // a heap of nodes { m, t, f, prev, keys (this move's), name }
  const heap = [];
  const push = (n) => { let i = heap.length; heap.push(n); while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= n.f) break; heap[i] = heap[p]; i = p; } heap[i] = n; };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
    return top;
  };
  const seen = new Set();
  const start = { m: model(g), t: 0, prev: null, keys: null, name: '', coins: 0 };
  start.f = weight * h(start.m);
  push(start);
  let tried = 0, best = { t: 0, h: 1e9, has: false, prev: null, keys: null, name: '' }, out = null;
  /** Play a move on a copy of n's game: gen(m, i) gives the keys for its i-th step, or -1 when it is over. */
  const play = (n, name, gen, usedCoin = 0) => {
    const m = clone(n.m), keys = [];
    let res = null;
    for (let i = 0; i < 400; i++) {
      const k = gen(m, i);
      if (k < 0) break;
      keys.push(k);
      res = step(m, k);
      if (res) break;
    }
    tried++;
    if (res === 'caught' || !keys.length) return;
    const t = n.t + keys.length * STEP, node = { m, t, prev: n, keys, name, coins: n.coins + usedCoin };
    if (res === 'out') { out = node; return; }
    const key = keyOf(m, t);
    if (seen.has(key)) return;
    seen.add(key);
    const hh = h(m);
    if (hh >= INF) return;
    node.f = t + weight * hh;
    if (guide) { const q = guide[Math.min(guide.length - 1, Math.round(t * 4))]; node.f += 0.5 * Math.hypot(m.p.x - q[0], m.p.y - q[1]); }
    node.h = hh + (m.has ? 0 : 1000);
    if (node.h < best.h) best = { t, h: node.h, has: m.has, prev: n, keys, name };
    push(node);
  };
  while (heap.length && !out && tried < budget) {
    const n = pop(), m = n.m, cx = Math.floor(m.p.x), cy = Math.floor(m.p.y);
    // walk to a neighbouring square
    for (let d = 0; d < 4 && !out; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!m.walkable(nx, ny) || (nx === f.crown[0] && ny === f.crown[1] && m.collapseT < 0)) continue;
      const tx = sp.x[ny * w + nx], ty = sp.y[ny * w + nx];
      play(n, '→↓←↑'[d], (q, i) => (Math.hypot(q.p.x - tx, q.p.y - ty) < 0.08 ? -1 : i > 300 ? -1 : steerKeys(q, tx, ty)));
    }
    if (out) break;
    // wait
    play(n, '·', (q, i) => (i < 30 ? 0 : -1));
    // lift the crown / pull the lever
    const face = (name, tx, ty) => play(n, name, (q, i) => {
      if (i > 0 && q.__pressed) { q.__pressed = false; return -1; }
      const err = angDiff(Math.atan2(ty - q.p.y, tx - q.p.x), q.p.a);
      if (Math.abs(err) < 0.25) { q.__pressed = true; return KEY.use; }
      return err > 0 ? KEY.right : KEY.left;
    });
    if (!m.has && Math.hypot(f.crown[0] + 0.5 - m.p.x, f.crown[1] + 0.5 - m.p.y) < 1.3) face('CROWN', f.crown[0] + 0.5, f.crown[1] + 0.5);
    if (m.has && f.lever && m.gateShut && !m.leverOn && leverCell && cx === leverCell[0] && cy === leverCell[1]) face('LEVER', f.lever.x + 0.5, f.lever.y + 0.5);
    // throw a coin (when a guard is near enough to hear it land)
    if (m.ammo.coin > 0 && n.coins < coins && m.guards.some((o) => !o.dead && Math.hypot(o.x - m.p.x, o.y - m.p.y) < 13)) {
      for (let a8 = 0; a8 < 8; a8++) {
        const want = a8 * Math.PI / 4;
        play(n, 'coin' + '→↘↓↙←↖↑↗'[a8], (q, i) => {
          if (q.__thrown) { q.__thrown = false; return -1; }
          const err = angDiff(want, q.p.a);
          if (Math.abs(err) < 0.06) { q.__thrown = true; return KEY.coin; }
          return err > 0 ? KEY.right : KEY.left;
        }, 1);
      }
    }
    // smoke, with a guard on your heels
    if (m.ammo.smoke > 0 && m.guards.some((o) => !o.dead && o.stun <= 0 && Math.hypot(o.x - m.p.x, o.y - m.p.y) < (o.state === 'chase' ? 1.9 : 1.0))) play(n, 'SMOKE', (q, i) => (i === 0 ? KEY.smoke : -1));
    n.m = null;                                               // its copies have been made: let the game copy go
    // memory: keep only the most promising open lines
    if (heap.length > keep * 2) { heap.sort((a, b) => a.f - b.f); heap.length = keep; }
    if (log && tried % 20000 < 12) log(`  ${tried} moves tried, ${heap.length} lines open, nearest: ${best.has ? 'crown in hand, ' : ''}${(best.h % 1000).toFixed(1)} s to go at ${best.t.toFixed(1)} s`);
  }
  const line = (node) => { const names = [], parts = []; for (let q = node; q && q.keys; q = q.prev) { names.push(q.name); parts.push(q.keys); } parts.reverse(); return { moves: names.reverse().join(''), keys: Uint8Array.from(parts.flat()) }; };
  if (out) return { ok: true, secs: out.t, tried, ...line(out) };
  return { ok: false, why: heap.length ? `no way found in ${tried} moves tried` : 'every line of play ends in a catch', tried, best: { ...line(best), secs: best.t, has: best.has, togo: best.h % 1000 } };
}

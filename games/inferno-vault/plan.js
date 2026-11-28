// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — the route planner (pure). Adapted from Magma Escape's: it flies the real
//  stepPlayer() (world.js → ../magma-escape/world.js), so what it finds is exactly what a player
//  can do. Lava is a no-go; the goal is the vault door at the bottom.
//
//  check.mjs uses it to prove every level can be crossed from the start to the door at every
//  size, and that every shard and opal can be reached. The bots use it as their sense of
//  direction (bestMove), and add the stealth themselves (bot.js).
//
//  A node is a standing spot: column c on top of floor row r. Moves ("macros") start from rest:
//  a jump (an optional run-up, how long ↑ is held, a change of direction in the air), a walk
//  along the floor, a drop off an edge with steering, or (on the freeze levels, m.freeze) a
//  FREEZE that turns the lava pool in front into an ice bridge, then a walk across it.
//  The graph is built on the map as drawn (lava as lava); a bot standing on a level with ice
//  bridges passes the level's live tiles to simMacro.
// ─────────────────────────────────────────────────────────────
import { TILE, DT, ROCK, isFloor, tileAt, stepPlayer, bodyH, atExit, playerBox, overlap, inLava, STAGES, freezeBox, lavaToFreeze } from './world.js';

export const EXIT = -1;

export const MACROS = (() => {
  const out = [];
  for (const pre of [0, 0.12]) for (const d1 of [-1, 0, 1]) for (const hold of [0.06, 0.16, 0.26, 0.6]) {
    for (const [ts, d2] of [[99, 0], [0.18, -1], [0.18, 0], [0.18, 1], [0.34, -1], [0.34, 0], [0.34, 1]]) {
      if (pre > 0 && d1 === 0) continue;
      if (ts < 99 && d2 === d1) continue;
      out.push({ kind: 'jump', pre, d1, hold, ts, d2 });
    }
  }
  for (const d1 of [-1, 1]) for (const t of [0.05, 0.12, 0.25, 0.45, 0.8]) out.push({ kind: 'walk', d1, t });
  for (const d1 of [-1, 1]) for (const d2 of [-1, 0, 1]) out.push({ kind: 'drop', d1, d2 });
  for (const d1 of [-1, 1]) for (const t of [0.35, 0.7, 1.05, 1.5]) out.push({ kind: 'freeze', d1, t });
  return out;
})();
const WEIGHT = { jump: 1, walk: 0.25, drop: 0.6, freeze: 1.6 };

/** The input a macro gives on its frame i (airborne: he has left the ground at some point). */
export function macroInput(mac, i, p, airborne) {
  const landed = airborne && p.ground;
  if (mac.kind === 'walk') return { dir: i * DT < mac.t && !airborne ? mac.d1 : 0, jumpPress: false, jumpHeld: false };
  if (mac.kind === 'freeze') return { dir: i * DT < mac.t && !airborne ? mac.d1 : 0, jumpPress: false, jumpHeld: false, freezePress: i === 0 };
  if (mac.kind === 'drop') return { dir: landed ? 0 : airborne && p.air > 0.1 ? mac.d2 : mac.d1, jumpPress: false, jumpHeld: false };
  const i0 = Math.round(mac.pre / DT), held = Math.round(mac.hold / DT), air = (i - i0) * DT;
  return {
    dir: landed ? 0 : i < i0 ? mac.d1 : air >= mac.ts ? mac.d2 : mac.d1,
    jumpPress: i === i0, jumpHeld: i >= i0 && i < i0 + held,
  };
}

/** A standing spot: floor at (c, r) with room for a body of size k above it (ledges overhead don't block). */
export function standable(m, c, r, k) {
  if (c <= 0 || c >= m.C - 1 || !isFloor(tileAt(m, c, r))) return false;
  const need = Math.ceil(bodyH(k) / TILE);
  for (let i = 1; i <= need; i++) if (tileAt(m, c, r - i) === ROCK) return false;
  return true;
}
export const nodeId = (m, c, r) => r * m.C + c;
export const nodeOf = (m, p) => nodeId(m, Math.floor(p.x / TILE), Math.round(p.y / TILE));

/**
 * Fly one macro from player state p0 (copied). Returns { exit, node, t, p, items } or null (lava, or never settles).
 * tiles: the level's live tiles (ice bridges), if not the map as drawn. A freeze macro freezes first (null if
 * there is no lava in reach to freeze).
 */
export function simMacro(m, p0, mac, items = null, tiles = null) {
  const p = { ...p0, atk: null, kbT: 0, buffer: 0, coyote: p0.ground ? 0.09 : 0 };
  if (tiles) m = { ...m, t: tiles };
  if (mac.kind === 'freeze') {
    const t = m.t.slice(), ice = lavaToFreeze(m, t, freezeBox(p, mac.d1, false), p);
    if (!ice.length) return null;
    for (const i of ice) t[i] = ROCK;
    m = { ...m, t }; p.face = mac.d1;
  }
  let airborne = false;
  const got = items ? new Set() : null;
  for (let i = 0; i < 420; i++) {
    stepPlayer(p, macroInput(mac, i, p, airborne), m);
    if (!p.ground) airborne = true;
    if (inLava(m, p)) return null;
    if (got) { const b = playerBox(p); items.forEach((q, j) => { if (overlap(b, [q.x - 10, q.y - 10, q.x + 10, q.y + 10])) got.add(j); }); }
    if (p.ground && atExit(p, m)) return { exit: true, node: EXIT, t: i * DT, p, items: got };
    const moved = mac.kind === 'walk' || mac.kind === 'freeze' ? i * DT >= mac.t || airborne : airborne;
    if (moved && p.ground && Math.abs(p.vx) < 1) return { exit: false, node: nodeOf(m, p), t: i * DT, p, items: got };
  }
  return null;
}

/** Everything to collect on a map (shards first, then opals). */
export const itemsOf = (m) => [...m.shards, ...m.opals];

/** The graph for one body size: every standing spot, the moves between them, each spot's distance (in moves) to the door. */
const graphs = new Map();
export function graphFor(m, k) {
  const key = `${m.name}|${k}|${m.freeze ? 'F' : ''}`;
  if (graphs.has(key)) return graphs.get(key);
  const nodes = new Map(), items = itemsOf(m);
  for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) if (standable(m, c, r, k)) nodes.set(nodeId(m, c, r), { c, r, edges: [], items: new Set() });
  for (const [id, n] of nodes) {
    const p0 = { x: n.c * TILE + TILE / 2, y: n.r * TILE, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, jumpHeld: false, jumped: false, air: 0, kbT: 0, k, atk: null };
    const best = new Map();
    for (const mac of MACROS) {
      if (mac.kind === 'freeze' && !m.freeze) continue;
      const res = simMacro(m, p0, mac, items);
      if (!res) continue;
      res.items.forEach((j) => n.items.add(j));
      if (res.node !== EXIT && (res.node === id || !nodes.has(res.node))) continue;
      const w = WEIGHT[mac.kind] + res.t * 0.05, old = best.get(res.node);
      if (!old || w < old.w) best.set(res.node, { to: res.node, w, mac });
    }
    n.edges = [...best.values()];
  }
  const dist = new Map([...nodes.keys()].map((id) => [id, Infinity]));
  const into = new Map([[EXIT, []], ...[...nodes.keys()].map((id) => [id, []])]);
  for (const [id, n] of nodes) for (const e of n.edges) into.get(e.to).push({ from: id, w: e.w });
  const open = [[EXIT, 0]], done = new Set();
  while (open.length) {
    open.sort((a, b) => b[1] - a[1]);
    const [id, d] = open.pop();
    if (done.has(id)) continue;
    done.add(id);
    for (const { from, w } of into.get(id)) if (d + w < dist.get(from)) { dist.set(from, d + w); open.push([from, d + w]); }
  }
  const g = { k, nodes, dist };
  graphs.set(key, g);
  return g;
}

/** Spots reachable from the start (following the moves forward). */
export function reachableFrom(m, g, start) {
  const seen = new Set([start]), q = [start];
  let exit = false;
  while (q.length) {
    const n = g.nodes.get(q.pop());
    if (!n) continue;
    for (const e of n.edges) {
      if (e.to === EXIT) { exit = true; continue; }
      if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
  }
  return { seen, exit };
}

/** The bots' next move from exactly where he stands: the macro that lands closest (in moves) to the door. */
export function bestMove(m, p, filter = null) {
  const g = graphFor(m, p.k);
  let best = null;
  for (const mac of MACROS) {
    if (filter && !filter(mac)) continue;
    if (mac.kind === 'freeze' && !m.freeze) continue;
    const res = simMacro(m, p, mac);
    if (!res) continue;
    const d = res.exit ? -1 : g.dist.get(res.node) ?? Infinity;
    if (d === Infinity) continue;
    const score = d + res.t * 0.01;
    if (!best || score < best.score) best = { mac, to: res.node, d, score, t: res.t, end: res.p };
  }
  return best;
}

export const distHere = (m, p) => graphFor(m, p.k).dist.get(nodeOf(m, p)) ?? Infinity;
export const SIZES = STAGES.map((s) => s.k);

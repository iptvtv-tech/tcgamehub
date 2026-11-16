// Benchmark contract for Vault of Stars (see tools/bench.mjs).
// The vaults are fixed and run on a tick clock, so the bot plans like a careful player: from
// where it stands it searches the game's own rules (vaults.js: lasers, drones, drifting, cracked
// plates, key cards, the hull breach) for the quickest safe route to the airlock, then walks it
// one tick at a time through the arrow keys. A weaker bot hesitates or takes a wrong step now and
// then and has to re-plan; if a cracked plate has cut it off, it restarts the vault (Space twice),
// which costs a life, exactly as the game tells players to.
// The mistake: step into a live laser or a drone; where a vault has neither in reach, the
// Space-twice restart that throws a life away.
import { step, atGoal, allKeys, initialState, walkable, forcedDir, TICK, COLS, ROWS, DIR_LIST } from './vaults.js';

const ACTIONS = [null, ...DIR_LIST];
const seenTiles = new WeakMap();           // game -> tiles stood on in this level (for progress)

/** Quickest safe list of actions from state `from`, or null. `target(st)` says when we are there. */
function plan(v, from, { budget, since0 = -1, target }) {
  const full = allKeys(v);
  const key = (st, since) => `${st.x},${st.y},${st.t % v.cycle},${st.keys},${st.holes},${st.slide || ''},${since}`;
  let frontier = [{ st: from, since: since0, path: null }];
  const seen = new Set([key(from, since0)]);
  for (let n = 0; n < budget && frontier.length; n++) {
    const next = [];
    for (const node of frontier) {
      for (const a of ACTIONS) {
        const r = step(v, node.st, a);
        if (r.hit) continue;
        let since = node.since >= 0 ? node.since + 1 : -1;
        if (v.breachTicks && since < 0 && v.keyNames.length && r.st.keys === full) since = 0;
        if (v.breachTicks && since >= v.breachTicks) continue;            // the breach would win
        const path = { a, prev: node.path };
        if (target(r.st)) { const out = []; for (let p = path; p; p = p.prev) out.unshift(p.a); return out; }
        const k = key(r.st, v.breachTicks ? since : -1);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ st: r.st, since, path });
        if (a === null && r.slid) break;                                  // a drift ignores the keys
      }
    }
    frontier = next;
    if (seen.size > 3e6) return null;
  }
  return null;
}

const goalOf = (v) => (st) => atGoal(v, st) && (!v.keyNames.length || !v.breachTicks || st.keys === allKeys(v));

function restart(g, s, m) {
  // Space, let go, Space again: the game asks twice before it spends a life
  m.rs = (m.rs || 0) + 1;
  s.hold(m.rs % 12 < 6 ? ['action'] : []);
}

export default {
  limit: (level) => 240,
  stuck: 90,

  // key cards first, then new ground covered in this vault
  progress(g) {
    let set = seenTiles.get(g);
    if (!set || set.level !== g.level) { set = new Set(); set.level = g.level; seenTiles.set(g, set); }
    set.add(g.st.y * COLS + g.st.x);
    let keys = 0; for (let k = g.st.keys; k; k >>= 1) keys += k & 1;
    return keys * 1000 + set.size;
  },

  invariants(g) {
    const { x, y, keys } = g.st, v = g.v;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) return `the astronaut is off the map at (${x}, ${y})`;
    if (!walkable(v, g.st, x, y)) return `the astronaut is standing in a wall, a shut door or a hole at (${x}, ${y})`;
    if (keys < 0 || keys > allKeys(v)) return `key cards ${keys} of ${allKeys(v)}`;
    if (!g.bonus && (g.o2 < 0 || g.o2 > v.o2Ticks)) return `oxygen ${g.o2} of ${v.o2Ticks} ticks`;
    if (g.breachLeft < 0 || g.breachLeft > v.breachTicks) return `breach countdown ${g.breachLeft} of ${v.breachTicks}`;
    return null;
  },

  bot(g, s, b) {
    if (g.done || g.dead) return s.hold([]);
    const v = g.v, st = g.st, m = b.mem;
    // still on the plan? (same tick, same place, same key cards and plates)
    const i = m.plan ? st.t - m.t0 : -1;
    const at = m.plan && m.states[i];
    if (!at || at.x !== st.x || at.y !== st.y || at.keys !== st.keys || at.holes !== st.holes) {
      const target = g.bonus
        ? (q) => { const c = v.cell[q.y][q.x]; return (c === '*' || c === '$') && !g.collected.has(q.y * COLS + q.x); }
        : goalOf(v);
      const since0 = g.breachLeft > 0 ? v.breachTicks - g.breachLeft : -1;
      const acts = plan(v, st, { budget: g.bonus ? 60 : Math.max(0, g.o2 - 1), since0, target });
      if (!acts) {
        m.plan = null;
        if (g.bonus) return s.hold([]);                    // every crystal taken: wait for the clock
        return restart(g, s, m);                           // cut off or out of air: start the vault again
      }
      m.rs = 0;
      const states = [st]; let q = st;
      for (const a of acts) { q = step(v, q, a).st; states.push(q); }
      m.plan = acts; m.states = states; m.t0 = st.t; m.slipAt = -1;
    }
    let a = m.plan[st.t - m.t0] ?? null;
    // a weaker bot dithers: once in a while it waits a tick or steps the wrong way (decided once per tick)
    if (m.slipAt !== st.t) {
      m.slipAt = st.t; m.slip = undefined;
      if (b.skill < 1 && !forcedDir(v, st) && b.rand() < (1 - b.skill) * 0.15) m.slip = ACTIONS[Math.floor(b.rand() * ACTIONS.length)];
    }
    if (m.slip !== undefined) a = m.slip;
    s.hold(a ? [a] : []);
  },

  mistake(g, s, b) {
    const m = b.mem;
    if (g.dead || (m.lives0 !== undefined && s.livesLost > m.lives0)) { s.hold([]); return true; }
    m.lives0 ??= s.livesLost;
    if (g.done) return false;
    const bad = ACTIONS.find((a) => step(g.v, g.st, a).hit);
    if (bad !== undefined && !forcedDir(g.v, g.st)) { s.hold(bad ? [bad] : []); m.walking = true; return false; }
    if (m.walking) { s.hold([]); return false; }           // the chance passed this tick; look again
    if (b.t > 6) restart(g, s, m);                         // nothing in reach to walk into: waste a life
    return false;
  },
};

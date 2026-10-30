// Benchmark contract for The Vault Job (see tools/bench.mjs). The museum runs on fixed timetables
// that a patient player can read off the screen (guards walk set routes, beams are drawn, lasers
// blink in rhythm), so the bot plans like one: a search over (tile, tick) for a route that is never
// seen, grabbing each treasure it can reach safely and then walking out (the display case on the
// secret level). It acts only by pressing an arrow key on the tick it wants to step. A lower-skill
// bot misreads the danger now and then — it thinks torch beams are a tile shorter, a laser goes
// off a tick sooner and that it can slip past a guard coming the other way — and gets caught for
// it. The mistake: walk into the first beam or laser it can reach.
import { TICK, DIRS, COLS, ROWS, parseLevel, walkable, isHide, watcherAt, laserOn, vision, caught } from './sim.js';
import { STEP } from '../../tools/lib/headless.mjs';

const MOVES = Object.entries(DIRS);
const key = (x, y) => y * COLS + x;

/** Same rule as sim.js caught(), as a sloppy player reads it (sloppy = 0 is the real rule). */
function seen(L, tick, x, y, prev, sloppy) {
  if (!sloppy) return !!caught(L, tick, x, y, prev);
  for (const l of L.lasers) {
    if (!l.set.has(`${x},${y}`)) continue;
    const ph = (tick + l.offset) % (l.on + l.off);
    if (ph >= 1 && ph < l.on - 1) return true;               // "it's off by now…"
  }
  const hidden = isHide(L, x, y);
  for (const w of L.watchers) {
    const st = watcherAt(w, tick);
    if (w.type !== 'camera' && st.x === x && st.y === y) return true;   // (no check for swapping past one)
    if (hidden) continue;
    for (const [vx, vy] of vision(L, { vision: w.vision - 1 }, st)) if (vx === x && vy === y) return true;
  }
  return false;
}

/**
 * Earliest safe route from (x, y), where the thief may next step on tick T0, to a tile for which
 * goal(x, y) holds. Returns a Map tick → { dir, x, y } (dir null = stand still that tick), or null.
 * With `trap`, the route ends on the first step that gets the thief caught (the mistake).
 */
function route(L, x0, y0, T0, goal, { sloppy = 0, trap = false, maxTicks = 1500 } = {}) {
  const layers = new Map([[T0, new Map([[key(x0, y0), null]])]]);
  for (let T = T0; T < T0 + maxTicks; T++) {
    const layer = layers.get(T);
    if (!layer) continue;
    for (const [k, parent] of layer) {
      const x = k % COLS, y = (k - x) / COLS;
      const opts = [[null, x, y, 1], ...MOVES.filter(([, [dx, dy]]) => walkable(L, x + dx, y + dy)).map(([d, [dx, dy]]) => [d, x + dx, y + dy, 2])];
      for (const [dir, nx, ny, dt] of opts) {
        const bad = seen(L, T, nx, ny, dir ? [x, y] : null, sloppy) || (dt === 2 && seen(L, T + 1, nx, ny, null, sloppy));
        const node = { T, dir, x, y, parent };
        if (trap ? bad && (dir || T > T0 + 4) : !bad && goal(nx, ny) && dir) return unwind(node);
        if (bad) continue;
        const nl = layers.get(T + dt) ?? layers.set(T + dt, new Map()).get(T + dt);
        if (!nl.has(key(nx, ny))) nl.set(key(nx, ny), node);
      }
    }
    layers.delete(T);
  }
  return null;
}
function unwind(node) {
  const plan = new Map();
  for (let n = node; n; n = n.parent) plan.set(n.T, { dir: n.dir, x: n.x, y: n.y });
  return plan;
}

/** Walking distance (ignoring watchers) from every tile to the way out. */
const fields = new WeakMap();
function field(g) {
  let f = fields.get(g.L);
  if (f) return f;
  const L = g.L, goal = L.vault || L.exit;
  f = new Map();
  if (goal) {
    const q = [goal]; f.set(key(...goal), 0);
    while (q.length) {
      const [x, y] = q.shift();
      for (const [, [dx, dy]] of MOVES) if (walkable(L, x + dx, y + dy) && !f.has(key(x + dx, y + dy))) { f.set(key(x + dx, y + dy), f.get(key(x, y)) + 1); q.push([x + dx, y + dy]); }
    }
  }
  fields.set(g.L, f);
  return f;
}

/** The thief's next route: the nearest treasure (or coin, in the gift shop) it can reach unseen, else the way out. */
function plan(g, b, trap) {
  const L = g.L, p = g.p, T0 = g.tick + Math.max(1, g.cool);
  const sloppy = !trap && b.rand() < (1 - b.skill) * 1.3 ? 1 : 0;
  if (trap) return route(L, p.x, p.y, T0, () => false, { trap: true, maxTicks: 400 });
  const loot = g.bonus ? 'o' : '$';
  const want = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (g.grid[y][x] === loot) want.push([x, y]);
  if (want.length && !(b.mem.skip?.size >= want.length)) {
    const skip = (b.mem.skip ??= new Set());
    const r = route(L, p.x, p.y, T0, (x, y) => g.grid[y][x] === loot && !skip.has(key(x, y)), { sloppy, maxTicks: g.bonus ? 60 : 400 });
    if (r) return r;
    for (const [x, y] of want) skip.add(key(x, y));        // none reachable safely right now: leave them
  }
  if (g.bonus) return null;
  const out = L.vault || L.exit;
  return route(L, p.x, p.y, T0, (x, y) => x === out[0] && y === out[1], { sloppy });
}

const best = new WeakMap();   // closest the thief has got to the way out, per level played

export default {
  // levels 1–15 (5 and 10 are the gift shop) + the secret vault (16); the fastest safe routes are
  // 4–10 s (tools/check-vault-levels.mjs) — waits for guards and a caught restart fit in 60 s
  limit: () => 60,
  stuck: 25,                    // the longest safe wait for a gap is ~10 s

  progress(g) {
    const d = field(g).get(key(g.p.x, g.p.y)) ?? 99;
    const was = best.get(g);
    const near = was && was.level === g.level ? Math.min(was.near, d) : d;
    best.set(g, { level: g.level, near });
    return g.taken * 1000 + (99 - near);
  },

  invariants(g, s) {
    const p = g.p, L = g.L;
    if (![p.x, p.y, p.fx, p.fy, p.k].every(Number.isFinite)) return 'the thief position is not a number';
    if (p.x < 0 || p.x >= COLS || p.y < 0 || p.y >= ROWS || !walkable(L, p.x, p.y)) return `the thief is inside a wall at (${p.x}, ${p.y}) '${g.grid[p.y]?.[p.x]}'`;
    if (Math.abs(p.x - p.fx) + Math.abs(p.y - p.fy) > 1) return `the thief jumped from (${p.fx}, ${p.fy}) to (${p.x}, ${p.y})`;
    if (p.k < 0 || p.k > 1) return `step animation at ${p.k}`;
    if (g.cool < 0 || g.cool > 2) return `step cooldown ${g.cool}`;
    let left = 0;
    for (const row of g.grid) for (const ch of row) if (ch === '$') left++;
    if (g.taken + left !== g.total || g.taken < 0) return `treasure doesn't add up: ${g.taken} taken + ${left} left ≠ ${g.total}`;
    if (!g.bonus && !g.alarm && !g.finale && caught(L, g.tick, p.x, p.y)) return `the thief is in plain sight at (${p.x}, ${p.y}) on tick ${g.tick} and no alarm went off`;
    for (const w of L.watchers) {
      const st = watcherAt(w, g.tick);
      if (w.type !== 'camera' && (!walkable(L, st.x, st.y) || isHide(L, st.x, st.y))) return `a ${w.type} is standing on a wall or hiding spot at (${st.x}, ${st.y})`;
    }
    if (g.secret && s.livesLost) return 'a life was lost in the vault (it should only send you back)';
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    if (g.alarm || g.finale || g.tick < (m.tick ?? 0) || s.livesLost !== (m.lives ?? 0)) m.plan = null;   // caught: start over
    m.tick = g.tick; m.lives = s.livesLost;
    if (g.alarm || g.finale) return s.hold([]);
    const ticking = g.acc + STEP >= TICK;                     // the museum ticks during this frame
    if (!ticking) return s.hold([]);
    const T = g.tick + 1;
    let step = m.plan?.get(T);
    const stale = !m.plan || (step && (step.x !== g.p.x || step.y !== g.p.y)) || (!step && g.cool <= 1 && !m.plan.has(T + 1));
    if (stale) {
      if (g.cool > 1) return s.hold([]);                     // mid-step: look again on the next tick
      m.plan = plan(g, b, false);
      step = m.plan?.get(T);
    }
    s.hold(step?.dir && g.cool <= 1 ? [step.dir] : []);
  },

  mistake(g, s, b) {
    if (g.alarm || g.cool > 1 || !(g.acc + STEP >= TICK)) return false;
    const r = plan(g, b, true);
    if (!r) return false;
    Object.assign(b.mem, { plan: r, tick: g.tick, lives: s.livesLost });
    const step = r.get(g.tick + 1);
    s.hold(step?.dir ? [step.dir] : []);
    return true;
  },
};

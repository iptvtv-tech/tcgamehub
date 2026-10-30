// Benchmark contract for Dungeon Escape 3D (see tools/bench.mjs). The bot plays with the keys
// only: ↑ to walk, ↓ to back away, ← → to turn, Space to FLASH. It knows what a player knows: the
// squares it has walked near (the minimap), the keys, torches and stairs it has seen down a
// corridor, the ghouls it can see (and the hunting ones the red edge arrows point at), the spike
// traps' rhythm. It explores to the nearest unexplored edge of the map, picks up keys as soon as
// it knows where they are (and a torch when the fuel is getting short), and heads for the stairs
// once it has them all. Its route steers wide of ghouls (a weighted search over the map); when a
// ghoul is in the way it goes on and FLASHes it in the beam, turns to face one hunting it, or,
// with no flash left, runs (backing away, keeping out of dead ends) to where it gets first. It
// crosses a trap only when the spikes stay down for the whole crossing, never stops on one, and
// detours round two traps side by side whose rhythms leave no moment to cross. On a Treasure
// Vault it runs for the nearest gold.
// Lower skill looks at the map less often, gives ghouls less room, flashes later (and at any
// ghoul), turns round instead of backing away, and now and then misjudges the spikes (goes when
// they are about to rise). The mistake: walk the shortest way into the nearest ghoul, no flash.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPEED = 2.7;
const SPIKE_P = 2.8, SPIKE_UP = 1.1;
const angDiff = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** a line of sight on the grid (same test the game uses) */
function sees(g, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 4);
  for (let i = 1; i < n; i++) { const t = i / n; if (!g.open(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false; }
  return true;
}

/** What the bot knows about: items it has seen, ghouls in view or hunting it. */
function look(g, b) {
  const m = b.mem, p = g.p;
  m.known ??= new Set();
  if (m.level !== g.level) { m.known = new Set(); m.level = g.level; }
  for (const it of g.items) {
    if (it.got || m.known.has(it)) continue;
    const cx = Math.floor(it.x), cy = Math.floor(it.y);
    if (g.seen[cy]?.[cx] || (Math.hypot(it.x - p.x, it.y - p.y) < 9 && sees(g, p.x, p.y, it.x, it.y))) m.known.add(it);
  }
  const ghouls = [];
  for (const q of g.ghouls) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if ((d < 8 && sees(g, p.x, p.y, q.x, q.y)) || (q.hunting && d < 11) || d < 1.6) ghouls.push({ q, d });
  }
  return ghouls;
}

/** Dijkstra from the player's square over open squares; cost(x, y) ≥ 1. Returns { dist, prev }. */
function search(g, sx, sy, cost) {
  const W = g.gw, H = g.gh, N = W * H;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[sy * W + sx] = 0;
  for (;;) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; best = i; }
    if (best < 0) break;
    done[best] = 1;
    const x = best % W, y = (best / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!g.open(nx, ny)) continue;
      const j = ny * W + nx, c = bd + cost(nx, ny);
      if (c < dist[j]) { dist[j] = c; prev[j] = best; }
    }
  }
  return { dist, prev };
}
function pathTo(g, sr, i) {
  const out = [];
  for (let k = i; k >= 0; k = sr.prev[k]) out.unshift([k % g.gw, (k / g.gw) | 0]);
  // never end on a trap: carry on to the square past it (or back off the way you came)
  for (let n = 0; n < 4 && out.length >= 2 && spikeAt(g, ...out[out.length - 1]); n++) {
    const [x, y] = out[out.length - 1], [x0, y0] = out[out.length - 2];
    out.push(g.open(2 * x - x0, 2 * y - y0) ? [2 * x - x0, 2 * y - y0] : [x0, y0]);
  }
  return out;               // starts at the player's square
}

const spikeAt = (g, x, y) => g.spikes.find((sp) => sp.x === x && sp.y === y);

/** What a trap square costs the route: a short wait, or (in a run of traps next to each other
 *  whose rhythms leave no moment to cross at walking pace) a detour if there is one. */
const trapCache = new WeakMap();
function trapCost(g, x, y) {
  let c = trapCache.get(g.spikes);
  if (!c) {
    c = new Map();
    const up = (sp, t) => ((t + sp.phase) % SPIKE_P) < SPIKE_UP;
    const fits = (run) => {
      for (let t0 = 0; t0 < SPIKE_P; t0 += 0.01) {
        let ok = true;
        for (let k = 0; k < run.length && ok; k++) for (let t = t0 + k / SPEED - 0.05; t <= t0 + (k + 1) / SPEED + 0.05; t += 0.02) if (up(run[k], t + SPIKE_P)) { ok = false; break; }
        if (ok) return true;
      }
      return false;
    };
    for (const sp of g.spikes) {
      if (c.has(sp)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let x0 = sp.x, y0 = sp.y;
        while (spikeAt(g, x0 - dx, y0 - dy)) { x0 -= dx; y0 -= dy; }
        const run = [];
        for (let qx = x0, qy = y0; spikeAt(g, qx, qy); qx += dx, qy += dy) run.push(spikeAt(g, qx, qy));
        if (run.length < 2) continue;
        const cost = fits(run) && fits([...run].reverse()) ? 1.5 : 400;
        for (const r of run) c.set(r, Math.max(c.get(r) || 0, cost));
      }
      if (!c.has(sp)) c.set(sp, 1.5);
    }
    trapCache.set(g.spikes, c);
  }
  const sp = spikeAt(g, x, y);
  return sp ? c.get(sp) : 0;
}
const spikeUpAt = (g, sp, t) => ((t + sp.phase) % SPIKE_P) < SPIKE_UP;

/** Walking distance (squares) from a set of squares to every square. */
function bfs(g, sources) {
  const W = g.gw, d = new Float64Array(W * g.gh).fill(Infinity), q = [];
  for (const [x, y] of sources) { d[y * W + x] = 0; q.push(y * W + x); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (g.open(nx, ny) && d[j] === Infinity) { d[j] = d[i] + 1; q.push(j); } }
  }
  return d;
}

/** Choose where to go now and the route there. */
function plan(g, b, ghouls) {
  const m = b.mem, p = g.p, px = Math.floor(p.x), py = Math.floor(p.y), W = g.gw;
  const room = 1 + 2.2 * b.skill;                  // how wide a berth an active ghoul gets
  // a stunned ghoul is still a danger if it wakes before you're well past it
  const danger = ghouls.filter(({ q, d }) => q.stun <= (0.6 + (d + 2) / SPEED) * b.skill + 0.6 * (1 - b.skill));
  const gd = danger.length ? bfs(g, danger.map(({ q }) => [Math.floor(q.x), Math.floor(q.y)])) : null;
  const cost = (x, y) => {
    let c = 1;
    if (gd) { const d = gd[y * W + x]; if (d < room + 1) c += 40 * (room + 1 - d); }
    c += trapCost(g, x, y);                      // a trap costs a short wait (or a detour)
    return c;
  };
  const sr = search(g, px, py, cost);
  const at = (x, y) => sr.dist[y * W + x];
  const known = [...m.known].filter((it) => !it.got);
  let goal = null;
  if (g.bonus) {
    let bd = Infinity;
    for (const it of g.items) if (!it.got) { const d = at(Math.floor(it.x), Math.floor(it.y)); if (d < bd) { bd = d; goal = it; } }
  } else {
    const keys = known.filter((it) => it.kind === 'key');
    const exit = known.find((it) => it.kind === 'exit');
    const torches = known.filter((it) => it.kind === 'torch');
    const near = (list) => list.reduce((a, it) => (at(Math.floor(it.x), Math.floor(it.y)) < (a ? at(Math.floor(a.x), Math.floor(a.y)) : Infinity) ? it : a), null);
    const k = near(keys), tc = near(torches);
    if (tc && g.fuel < 22 + 24 * b.skill && g.fuel < g.fuelMax - 15) goal = tc;
    else if (g.keysHave >= g.keysNeed && exit) goal = exit;
    else if (k) goal = k;
    else if (tc && at(Math.floor(tc.x), Math.floor(tc.y)) < 4 && g.fuel < g.fuelMax - 20) goal = tc;
  }
  let target = goal ? Math.floor(goal.y) * W + Math.floor(goal.x) : -1;
  if (target < 0 || !isFinite(sr.dist[target])) {
    // explore: the nearest open square on the edge of the map it has walked
    let bd = Infinity;
    for (let y = 0; y < g.gh; y++) for (let x = 0; x < W; x++) {
      if (!g.open(x, y) || !g.seen[y][x]) continue;
      const edge = DIRS.some(([dx, dy]) => !g.seen[y + dy]?.[x + dx]);
      if (!edge) continue;
      const d = at(x, y) + (1 - b.skill) * b.rand() * 6;    // a weaker player picks less carefully
      if (d < bd) { bd = d; target = y * W + x; }
    }
  }
  if (target < 0 || !isFinite(sr.dist[target])) return { path: null };
  let path = pathTo(g, sr, target);
  // does the route run into a ghoul before you're past it? (a ghoul covers ~0.7 of your stride)
  if (gd && b.rand() < 0.3 + 0.7 * b.skill) {
    const beam = g.flashes > 0;
    let bad = false;
    for (let k = 1; k < Math.min(path.length, 9); k++) {
      const d = gd[path[k][1] * W + path[k][0]];
      if (d <= k * 0.72 + 1.2) { bad = true; break; }
    }
    const nearest = danger.reduce((a, o) => (!a || o.d < a.d ? o : a), null).q;
    // one hunting you and close: turn and face it, the flash goes off once it is in the beam
    if (beam && nearest.hunting && gd[py * W + px] <= 4 && sees(g, p.x, p.y, nearest.x, nearest.y)) return { path: null, face: nearest };
    if (bad) {
      // a flash in hand: go on by the straight route and flash the ghoul when it's in the beam
      if (beam) return { path: pathTo(g, search(g, px, py, (x, y) => 1 + trapCost(g, x, y)), target) };
      // none: run to the square furthest from the ghouls that you reach well before they do,
      // keeping out of dead ends (a ghoul corners you there)
      const mine = bfs(g, [[px, py]]), pocket = pockets(g);
      let best = -1, bs = -Infinity;
      for (let i = 0; i < mine.length; i++) {
        if (!isFinite(mine[i]) || mine[i] > 16) continue;
        if (gd[i] <= mine[i] * 0.72 + 1.2 && i !== py * W + px) continue;
        const sc = Math.min(gd[i], 12) - 0.25 * mine[i] - (pocket[i] ? 3 + 3 * b.skill : 0);
        if (sc > bs) { bs = sc; best = i; }
      }
      if (best < 0 || best === py * W + px) return { path: null, face: nearest };
      return { path: pathTo(g, search(g, px, py, (x, y) => 1 + (gd[y * W + x] <= mine[y * W + x] * 0.72 + 1.2 ? 60 : 0)), best), back: b.skill > 0.7 };
    }
  }
  return { path };
}

/** Squares in dead-end branches of the maze (prune squares with one way out until none are left). */
const pocketCache = new WeakMap();
function pockets(g) {
  let out = pocketCache.get(g.map);
  if (out) return out;
  const W = g.gw, deg = new Int8Array(W * g.gh);
  out = new Uint8Array(W * g.gh);
  const q = [];
  for (let y = 0; y < g.gh; y++) for (let x = 0; x < W; x++) if (g.open(x, y)) { deg[y * W + x] = DIRS.filter(([dx, dy]) => g.open(x + dx, y + dy)).length; if (deg[y * W + x] <= 1) q.push(y * W + x); }
  while (q.length) {
    const i = q.pop(); if (out[i]) continue; out[i] = 1;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS) { const j = (y + dy) * W + x + dx; if (g.open(x + dx, y + dy) && !out[j] && --deg[j] <= 1) q.push(j); }
  }
  pocketCache.set(g.map, out);
  return out;
}

/** May the bot step onto the trap ahead? (spikes stay down over the whole crossing) */
function spikeClear(g, b, path, i) {
  const p = g.p;
  let j = i;
  while (j < path.length && spikeAt(g, path[j][0], path[j][1])) j++;
  const [nx, ny] = path[i], [cx, cy] = path[i - 1];
  const dx = nx - cx, dy = ny - cy;
  const toEdge = dx ? (dx > 0 ? nx - p.x : p.x - (nx + 1)) : (dy > 0 ? ny - p.y : p.y - (ny + 1));
  const tIn = Math.max(0, toEdge) / SPEED;
  // a careful player leaves a margin; a careless one reads the rhythm a little early now and then
  const slip = b.mem.slip ?? 0;
  const margin = 0.03 + 0.05 * b.skill - slip;
  // the player's middle is in trap k from tIn + (k − i) strides to one stride later
  for (let k = i; k < j; k++) {
    const sp = spikeAt(g, path[k][0], path[k][1]), a = tIn + (k - i) / SPEED, z = a + 1 / SPEED;
    for (let t = a - margin; t <= z + margin; t += 0.02) if (spikeUpAt(g, sp, g.t + Math.max(0, t))) return false;
  }
  return true;
}

function drive(g, s, b, plan, keys) {
  const p = g.p, path = plan?.path;
  if (plan?.face) {
    const da = angDiff(Math.atan2(plan.face.y - p.y, plan.face.x - p.x) - p.a);
    if (Math.abs(da) > 0.08) keys.push(da > 0 ? 'right' : 'left');
    s.hold(keys); return;
  }
  if (!path || !path.length) { s.hold(keys); return; }
  // the next square to head for; skip squares already reached
  let i = 1;
  const px = Math.floor(p.x), py = Math.floor(p.y);
  const here = path.findIndex(([x, y]) => x === px && y === py);
  if (here >= 0) i = here + 1;
  if (i >= path.length) {
    // in the last square: walk to its middle (that's where keys, torches and the stairs sit)
    const [lx, ly] = path[path.length - 1], want = Math.atan2(ly + 0.5 - p.y, lx + 0.5 - p.x), da = angDiff(want - p.a);
    if (Math.hypot(lx + 0.5 - p.x, ly + 0.5 - p.y) > 0.15 && !spikeAt(g, lx, ly)) {
      if (Math.abs(da) > 0.04) keys.push(da > 0 ? 'right' : 'left');
      if (Math.abs(da) < 0.35) keys.push('up');
    }
    s.hold(keys); return;
  }
  const [nx, ny] = path[i];
  const tx = nx + 0.5, ty = ny + 0.5;
  // aim at the middle of the next square, but only once the player is lined up in this one
  const cx = px + 0.5, cy = py + 0.5;
  const off = nx !== px ? Math.abs(p.y - cy) : Math.abs(p.x - cx);
  const ax = off > 0.12 ? (nx !== px ? p.x + (nx - px) * 0.35 : cx) : tx;
  const ay = off > 0.12 ? (ny !== py ? p.y + (ny - py) * 0.35 : cy) : ty;
  const want = Math.atan2(ay - p.y, ax - p.x);
  let da = angDiff(want - p.a);
  // running from a ghoul that's in front: back away (slower, but no time lost turning round)
  const back = plan.back && Math.abs(da) > 1.6 && !spikeAt(g, nx, ny);
  if (back) da = angDiff(want + Math.PI - p.a);
  const turnKey = Math.abs(da) > 0.04 ? (da > 0 ? 'right' : 'left') : null;
  if (turnKey) keys.push(turnKey);
  let go = Math.abs(da) < 0.35;
  if (go && !back && spikeAt(g, nx, ny) && !spikeAt(g, px, py) && !spikeClear(g, b, path, i)) go = false;
  if (go) keys.push(back ? 'down' : 'up');
  s.hold(keys);
}

const nearMem = new WeakMap(), ruleMem = new WeakMap();      // per game: progress and rule-check memory

export default {
  levels: 20,
  // the biggest mazes (from level 14: 23 × 23 squares) take the expert 1–2 minutes to explore
  limit: (level) => 120 + Math.min(11, 4 + Math.floor(level / 2)) * 25,
  stuck: 40,                    // dodging a hunting ghoul round a loop can take a while

  // keys, squares seen and things picked up, plus how close the player has come (walking
  // distance, since the last life lost) to what is left to do: the stairs once the keys are in,
  // else the nearest key it has seen or the nearest unexplored edge of the map
  progress(g, s) {
    if (g.bonus) return g.coins;
    let seen = 0;
    for (const row of g.seen) for (const v of row) if (v) seen++;
    let m = nearMem.get(g); if (!m) nearMem.set(g, (m = { d: 999, key: '' }));
    const goals = [];
    const need = !m.f || m.key !== `${s.livesLost}|${g.keysHave}|${seen}`;
    const ex = g.items.find((it) => it.kind === 'exit');
    if (!need) {} else if (g.keysHave >= g.keysNeed && g.seen[Math.floor(ex.y)][Math.floor(ex.x)]) goals.push([Math.floor(ex.x), Math.floor(ex.y)]);
    else {
      if (g.keysHave < g.keysNeed) for (const it of g.items) if (it.kind === 'key' && !it.got && g.seen[Math.floor(it.y)][Math.floor(it.x)]) goals.push([Math.floor(it.x), Math.floor(it.y)]);
      if (!goals.length) for (let y = 0; y < g.gh; y++) for (let x = 0; x < g.gw; x++) if (g.open(x, y) && g.seen[y][x] && DIRS.some(([dx, dy]) => !g.seen[y + dy]?.[x + dx])) goals.push([x, y]);
    }
    const key = `${s.livesLost}|${g.keysHave}|${seen}`, cell = Math.floor(g.p.y) * g.gw + Math.floor(g.p.x);
    if (m.key !== key) { m.key = key; m.d = 999; m.f = null; }
    if (!m.f && goals.length) m.f = bfs(g, goals);
    if (m.f) m.d = Math.min(m.d, m.f[cell]);
    return 1000 * g.keysHave + seen + g.items.filter((it) => it.got).length * 100 + (999 - m.d) / 1000;
  },

  invariants(g, s) {
    const p = g.p;
    let mem = ruleMem.get(g); if (!mem) ruleMem.set(g, (mem = { lives: s.livesLost }));
    if (![p.x, p.y, p.a, g.fuel].every(Number.isFinite)) return 'the player position, facing or torch fuel is not a number';
    if (!g.open(Math.floor(p.x), Math.floor(p.y))) return `the player is inside a wall at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
    for (const [dx, dy] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) if (!g.open(Math.floor(p.x + dx), Math.floor(p.y + dy))) return `the player overlaps a wall at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
    if (g.fuel < 0 || g.fuel > g.fuelMax + 1e-9) return `torch fuel ${g.fuel.toFixed(1)} is outside 0–${g.fuelMax}`;
    if (g.flashes < 0 || g.flashes > 2) return `${g.flashes} flashes (0–2)`;
    const keys = g.items.filter((it) => it.kind === 'key');
    if (keys.length !== g.keysNeed) return `${keys.length} keys in the maze, ${g.keysNeed} needed`;
    if (g.keysHave !== keys.filter((it) => it.got).length) return `holding ${g.keysHave} keys but ${keys.filter((it) => it.got).length} were picked up`;
    if (g.coins !== g.items.filter((it) => it.kind === 'coin' && it.got).length) return `${g.coins} coins counted, ${g.items.filter((it) => it.kind === 'coin' && it.got).length} picked up`;
    if (!g.bonus && !g.items.some((it) => it.kind === 'exit')) return 'there are no stairs';
    for (const it of g.items) if (!g.open(Math.floor(it.x), Math.floor(it.y))) return `a ${it.kind} is inside a wall`;
    const L = g.level, gSpeed = Math.min(1.92, 1.08 + L * 0.056) * (L < 4 ? 0.85 + (L - 1) * 0.05 : 1);
    const fresh = mem.lives !== s.livesLost || mem.level !== L;
    for (let i = 0; i < g.ghouls.length; i++) {
      const q = g.ghouls[i];
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return 'a ghoul position is not a number';
      if (!g.open(Math.floor(q.x), Math.floor(q.y))) return `a ghoul is inside a wall at (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`;
      const was = mem.gh?.[i];
      if (!fresh && was && Math.hypot(q.x - was[0], q.y - was[1]) > gSpeed / 120 + 1e-6) return `a ghoul moved ${(Math.hypot(q.x - was[0], q.y - was[1]) * 120).toFixed(2)} squares/s (cap ${gSpeed.toFixed(2)})`;
      // the game tests the catch with where the ghoul stood before its step (and you after yours)
      if (!fresh && was && g.hurtT <= 0 && was[2] <= 0 && q.stun <= 0 && Math.hypot(was[0] - p.x, was[1] - p.y) < 0.5) return `a ghoul is on top of the player and nothing happened (ghoul ${was[0].toFixed(3)},${was[1].toFixed(3)} stun ${was[2].toFixed(3)} → ${q.stun.toFixed(3)}, player ${p.x.toFixed(3)},${p.y.toFixed(3)})`;
    }
    if (!fresh && mem.p && Math.hypot(p.x - mem.p[0], p.y - mem.p[1]) > SPEED / 120 + 1e-6) return `the player moved ${(Math.hypot(p.x - mem.p[0], p.y - mem.p[1]) * 120).toFixed(2)} squares/s (cap ${SPEED})`;
    if (g.hurtT <= 0) for (const sp of g.spikes) if (sp.up && Math.floor(p.x) === sp.x && Math.floor(p.y) === sp.y) return `the player stands on raised spikes at (${sp.x}, ${sp.y}) and nothing happened`;
    mem.gh = g.ghouls.map((q) => [q.x, q.y, q.stun]); mem.p = [p.x, p.y]; mem.lives = s.livesLost; mem.level = L;
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    if (g.hurtT > 0) { s.hold([]); return; }
    const ghouls = look(g, b);
    const keys = [];
    // FLASH a ghoul coming at you down the beam (only when it will actually catch something)
    const react = 1.6 + 4.4 * b.skill;
    if (!g.bonus && g.flashes > 0 && g.flashT <= 0) {
      const p = g.p;
      // only a ghoul that's after you or in the way (an expert keeps the flash for those)
      const route = new Set((m.path?.path || []).slice(0, 7).map(([x, y]) => x + ',' + y));
      const threat = (q) => q.hunting || b.skill < 0.7 || DIRS.concat([[0, 0]]).some(([dx, dy]) => route.has((Math.floor(q.x) + dx) + ',' + (Math.floor(q.y) + dy)));
      const hit = ghouls.some(({ q, d }) => q.stun <= 0 && d < Math.min(6.4, react) && threat(q) && Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x) - p.a)) < 0.75 && sees(g, p.x, p.y, q.x, q.y));
      if (hit && b.rand() < 0.2 + 0.8 * b.skill) keys.push('action');
    }
    // re-plan often (an expert ~12 times a second, a weaker player every ~0.3 s)
    const every = 0.08 + (1 - b.skill) * 0.3;
    const px = Math.floor(g.p.x), py = Math.floor(g.p.y);
    const onTrap = spikeAt(g, px, py) && m.path?.path;           // never stop on a trap: carry on across
    if (!onTrap && (!m.path || b.t - (m.at ?? -9) > every || m.cell !== px + ',' + py)) {
      m.path = plan(g, b, ghouls); m.at = b.t; m.cell = px + ',' + py;
      if (m.slipFor !== px + ',' + py) { m.slipFor = px + ',' + py; m.slip = b.rand() < (1 - b.skill) * 0.35 ? 0.1 + b.rand() * 0.25 : 0; }
    }
    drive(g, s, b, m.path, keys);
  },

  mistake(g, s, b) {
    const m = b.mem;
    m.lives0 ??= s.livesLost;
    if (s.livesLost > m.lives0) { s.hold([]); return true; }
    if (g.bonus) return true;
    if (g.hurtT > 0) { s.hold([]); return false; }
    // head for the nearest ghoul by the shortest route, never flashing
    const p = g.p, px = Math.floor(p.x), py = Math.floor(p.y);
    const sr = search(g, px, py, () => 1);
    let best = null, bd = Infinity;
    for (const q of g.ghouls) { const d = sr.dist[Math.floor(q.y) * g.gw + Math.floor(q.x)]; if (d < bd) { bd = d; best = q; } }
    if (!best) return true;
    const path = pathTo(g, sr, Math.floor(best.y) * g.gw + Math.floor(best.x));
    if (path.length < 2) {
      const da = angDiff(Math.atan2(best.y - p.y, best.x - p.x) - p.a);
      s.hold(Math.abs(da) > 0.1 ? [da > 0 ? 'right' : 'left', 'up'] : ['up']);
      return false;
    }
    drive(g, s, { ...b, skill: 1, mem: { slip: 0 } }, { path }, []);
    return false;
  },
};

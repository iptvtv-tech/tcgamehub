// node games/astro-explorer/check.mjs [--show]
// Proves every planet is fair, using the game's own rules (world.js):
//  1. well-formed: spawn and exit on solid footing, spikes rooted in rock, every alien slot valid
//     (ground slots over a floor, flyers with room to hover, pods beside rock), none near the spawn;
//  2. the exit and every star dust can be reached WITHOUT touching a spike — a search flies the
//     astronaut with stepPlayer (run left/right/still × release/press/keep holding/tap jump, in
//     1/15 s moves);
//  3. no soft-locks: from every spot you can stand on, the exit can still be reached;
//  4. the aliens behave: over many seeds and planet numbers, a ghost astronaut walks the route
//     while every alien runs its real AI — none gets wedged in rock or falls out of the world.
import { PLANETS, parsePlanet, makePlayer, stepPlayer, atExit, dustTouched, touchesSpikes, tileAt, PlanetSim, stepFoe, foeBox,
  TILE, DT, PH, ROCK, LEDGE, SPIKE_UP, SPIKE_DOWN, AIR, isFloor } from './world.js';

const SHOW = process.argv.includes('--show');
const HOLD = 8;                                  // ticks per move (1/15 s)
const MOVES = [];                                // [dir, jump]: 0 release · 1 press & hold · 2 keep holding · 3 tap
for (const d of [-1, 0, 1]) for (const j of [0, 1, 2, 3]) MOVES.push([d, j]);
const inputAt = (mv, t) => ({ dir: mv[0], jumpPress: t === 0 && (mv[1] === 1 || mv[1] === 3), jumpHeld: mv[1] === 1 || mv[1] === 2 || (mv[1] === 3 && t < 2) });

const keyOf = (p) => {
  const kx = Math.round(p.x / 4), ky = Math.round(p.y / 4), kvx = Math.round(p.vx / 50) + 4, kvy = Math.round(p.vy / 100) + 7;
  return ((((kx * 256 + ky) * 9 + kvx) * 15 + kvy) * 2 + (p.ground ? 1 : 0)) * 4 + (p.jumpHeld ? 2 : 0) + (p.jumped ? 1 : 0);
};

let bad = 0;
const fail = (msg) => { console.log('  ✗ ' + msg); bad++; };

const checked = new Map();                       // map rows → first planet that used them
for (const pl of PLANETS) {
  if (checked.has(pl.rows)) { console.log(`${pl.name}: same map as ${checked.get(pl.rows)} (only the colours differ) — checked once`); continue; }
  checked.set(pl.rows, pl.name);
  const m = parsePlanet(pl);
  const errs0 = bad;
  console.log(`${pl.name} (${m.C}×${m.R})`);

  // ── 1. well-formed ─────────────────────────────────────────
  const under = (x, y) => tileAt(m, Math.floor(x / TILE), Math.floor((y + 1) / TILE));
  if (!isFloor(under(m.spawn.x, m.spawn.y))) fail('spawn is not standing on rock or a ledge');
  if (!isFloor(under(m.exit.x, m.exit.y))) fail('exit beacon is not standing on rock or a ledge');
  for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) {
    const k = tileAt(m, c, r);
    if (k === SPIKE_UP && tileAt(m, c, r + 1) !== ROCK) fail(`floor spikes at col ${c}, row ${r} have no rock under them`);
    if (k === SPIKE_DOWN && tileAt(m, c, r - 1) !== ROCK) fail(`ceiling spikes at col ${c}, row ${r} have no rock above them`);
  }
  const sc = Math.floor(m.spawn.x / TILE), sr = Math.floor((m.spawn.y - 1) / TILE);
  for (const s of m.slots) {
    const where = `${s.type} slot at col ${s.c}, row ${s.r}`;
    if (Math.hypot(s.c - sc, s.r - sr) < 5) fail(`${where} is within 5 tiles of the spawn`);
    if (s.type === 'ground') {
      let r = s.r; while (r < m.R - 1 && tileAt(m, s.c, r + 1) === AIR) r++;
      if (!isFloor(tileAt(m, s.c, r + 1)) || r - s.r > 1) fail(`${where} has no floor right under it`);
      if (tileAt(m, s.c - 1, r + 1) === AIR && tileAt(m, s.c + 1, r + 1) === AIR) fail(`${where} stands on a single tile`);
    } else if (s.type === 'air') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (tileAt(m, s.c + dc, s.r + dr) !== AIR) fail(`${where} has no room to hover (3×3 air needed)`);
    } else if (![[0, 1], [0, -1], [-1, 0], [1, 0]].some(([dc, dr]) => tileAt(m, s.c + dc, s.r + dr) === ROCK)) fail(`${where} has no rock to root on`);
  }

  // ── 2. search every reachable state (movement only, spikes are off limits) ──
  const start = makePlayer(m);
  for (let i = 0; i < 30; i++) stepPlayer(start, { dir: 0, jumpPress: false, jumpHeld: false }, m);
  const index = new Map([[keyOf(start), 0]]);
  const states = [start], parent = [-1], move = [-1], depth = [0], goal = [];
  let succ = new Int32Array(1 << 20), nSucc = 0;
  const succStart = [0];
  const seenDust = new Array(m.dust.length).fill(false), none = new Array(m.dust.length).fill(false);
  for (let i = 0; i < states.length; i++) {
    const base = states[i];
    for (let mi = 0; mi < MOVES.length; mi++) {
      const p = { ...base };
      let ok = true;
      for (let t = 0; t < HOLD; t++) {
        stepPlayer(p, inputAt(MOVES[mi], t), m);
        if (touchesSpikes(p, m) || p.y > m.h + 50) { ok = false; break; }
        if (t === 3 || t === HOLD - 1) for (const d of dustTouched(p, m, none)) seenDust[d] = true;
      }
      if (!ok) continue;
      const k = keyOf(p);
      let j = index.get(k);
      if (j === undefined) {
        j = states.length; index.set(k, j); states.push(p); parent.push(i); move.push(mi); depth.push(depth[i] + 1);
        if (atExit(p, m)) goal.push(j);
      }
      if (nSucc === succ.length) { const g = new Int32Array(succ.length * 2); g.set(succ); succ = g; }
      succ[nSucc++] = j;
    }
    succStart.push(nSucc);
  }
  const N = states.length;
  if (!goal.length) { fail(`the exit cannot be reached (${N} states searched)`); continue; }
  const best = goal.reduce((a, b) => (depth[b] < depth[a] ? b : a));
  const missing = m.dust.filter((_, i) => !seenDust[i]);
  for (const d of missing) fail(`star dust at col ${d.c}, row ${d.r} cannot be reached`);

  // ── 3. soft-locks: reverse search from the exit over the explored graph ──
  const indeg = new Int32Array(N + 1);
  for (let e = 0; e < nSucc; e++) indeg[succ[e] + 1]++;
  for (let i = 0; i < N; i++) indeg[i + 1] += indeg[i];
  const pred = new Int32Array(nSucc), fillAt = indeg.slice(0, N);
  for (let i = 0; i < N; i++) for (let e = succStart[i]; e < succStart[i + 1]; e++) pred[fillAt[succ[e]]++] = i;
  const can = new Uint8Array(N), queue = [...goal];
  for (const g of goal) can[g] = 1;
  while (queue.length) {
    const j = queue.pop();
    for (let e = indeg[j]; e < indeg[j + 1]; e++) { const i = pred[e]; if (!can[i]) { can[i] = 1; queue.push(i); } }
  }
  const cells = new Map();                          // standing cell → [any state there can reach the exit?]
  for (let i = 0; i < N; i++) {
    const p = states[i];
    if (!p.ground) continue;
    const ck = `${Math.floor(p.x / TILE)},${Math.floor((p.y - 1) / TILE)}`;
    cells.set(ck, (cells.get(ck) || 0) | (can[i] ? 1 : 2));
  }
  const stuck = [...cells].filter(([, v]) => v === 2).map(([k]) => k);
  if (stuck.length) fail(`soft-lock: from ${stuck.length} standing spot(s) the exit can't be reached: ${stuck.slice(0, 8).join(' · ')}`);

  // the route itself, as positions per tick (for the alien test below)
  const route = [];
  { const chain = []; for (let j = best; j > 0; j = parent[j]) chain.push(move[j]); chain.reverse();
    const p = { ...start }; route.push([p.x, p.y]);
    for (const mi of chain) for (let t = 0; t < HOLD; t++) { stepPlayer(p, inputAt(MOVES[mi], t), m); route.push([p.x, p.y]); } }

  // ── 4. aliens: real AI, ghost astronaut walking the route, many seeds × planet numbers ──
  let runs = 0, worst = '';
  const kinds = {};
  for (let level = 1; level <= 12; level++) for (let seed = 1; seed <= 16; seed++) {
    const sim = new PlanetSim(pl, level, seed * 7919 + level);
    runs++;
    for (const f of sim.foes) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    const T = Math.max(route.length, 120 * 25);
    for (let t = 0; t < T; t++) {
      const [x, y] = route[Math.min(route.length - 1, Math.floor(t * route.length / T))];
      sim.p.x = x; sim.p.y = y; sim.p.inv = 1e9; sim.ev = [];
      for (const f of sim.foes) if (!f.dead) stepFoe(sim, f);
      sim.stepGlobs();
      if (t % 30) continue;
      for (const f of sim.foes) {
        if (f.dead) { worst = `${f.kind} fell out of the world (planet ${level}, seed ${seed})`; break; }
        if (f.kind === 'pod') continue;
        const [x0, y0, x1, y1] = foeBox(f);
        for (const [px, py] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) {
          if (tileAt(m, Math.floor(px / TILE), Math.floor(py / TILE)) === ROCK) { worst = `${f.kind} wedged in rock near col ${Math.floor(f.x / TILE)}, row ${Math.floor(f.y / TILE)} (planet ${level}, seed ${seed})`; break; }
        }
      }
      if (worst) break;
    }
    if (worst) break;
  }
  if (worst) fail(worst);

  const secs = ((route.length - 1) * DT).toFixed(1);
  const mix = Object.entries(kinds).map(([k, n]) => `${k} ${(n / runs).toFixed(1)}`).join(', ');
  console.log(`  ${bad === errs0 ? '✓' : '✗'} exit reachable in ≈${secs}s of play · ${m.dust.length - missing.length}/${m.dust.length} star dust reachable · ` +
    `${stuck.length ? stuck.length + ' stuck' : 'no stuck'} spots of ${cells.size} you can stand on · ${N.toLocaleString('en-GB')} states · aliens sane over ${runs} runs (avg per planet: ${mix})`);
  if (SHOW) { const names = MOVES.map(([d, j]) => '←·→'[d + 1] + '-HhT'[j]); const chain = []; for (let j = best; j > 0; j = parent[j]) chain.push(names[move[j]]); console.log('  ' + chain.reverse().join(' ')); }
}
process.exit(bad ? 1 : 0);

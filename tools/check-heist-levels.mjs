// Proves every Heist Planner level has a plan that works.
// Run:  node tools/check-heist-levels.mjs        (add "-v" to print the plans)
// For each level it plans the crew one at a time (hacker → muscle → thief) with a
// time-aware breadth-first search, then plays the whole plan through the real rules.
import { LEVELS } from '../games/heist-planner/levels.js';
import { parseLevel, simulate, spotted, canWalk, tileAt, MOVES } from '../games/heist-planner/sim.js';

const VERBOSE = process.argv.includes('-v');
const TMAX = 90;
const keys = ['U', 'D', 'L', 'R', 'W'];

/** Time-expanded BFS for one crew member. ctx gives hacked(t) and open(t) from already-planned crew. */
function bfs(L, id, start, t0, goal, ctx, maskOf = () => 0, maskStep = (m) => m, maxT = TMAX) {
  const q = [[start[0], start[1], t0, maskOf(start), '']];
  const seen = new Set([`${start[0]},${start[1]},${t0},${q[0][3]}`]);
  while (q.length) {
    const [x, y, t, m, path] = q.shift();
    if (goal(x, y, t, m) && (!ctx.stayFor || safeStay(L, id, x, y, t, m, ctx))) return { x, y, t, m, path };
    if (t >= maxT) continue;
    for (const k of keys) {
      const [dx, dy] = MOVES[k];
      const nx = x + dx, ny = y + dy, nt = t + 1;
      const open = ctx.open(nt, id, m);
      if ((dx || dy) && !canWalk(L, id, nx, ny, open)) continue;
      const nm = maskStep(m, nx, ny);
      const hacked = ctx.hacked(nt, id, nx, ny);
      if (spotted(L, nt, nx, ny, [x, y], hacked, (ctx.seeOpen || ctx.open)(nt, id, nm))) continue;
      const key = `${nx},${ny},${nt},${nm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([nx, ny, nt, nm, path + k]);
    }
  }
  return null;
}

/** Can this member wait on (x,y) from t until ctx.stayUntil without being seen? */
function safeStay(L, id, x, y, t, m, ctx) {
  for (let k = t + 1; k <= t + ctx.stayFor; k++) if (spotted(L, k, x, y, [x, y], ctx.hacked(k, id, x, y), (ctx.seeOpen || ctx.open)(k, id, m))) return false;
  return true;
}

/** Positions over time for a finished plan. */
function track(start, plan, L, id, openFn) {
  const pos = [[...start]];
  let [x, y] = start;
  for (let t = 1; t <= TMAX + 40; t++) {
    const mv = plan[t - 1] || 'W';
    const [dx, dy] = MOVES[mv];
    if ((dx || dy) && canWalk(L, id, x + dx, y + dy, openFn(t))) { x += dx; y += dy; }
    pos.push([x, y]);
  }
  return pos;
}

let lastFail = '';
function solveLevel(L) {
  for (const STAY of [0, 12, 30, 60]) { const r = solveWith(L, STAY); if (r) return r; }
  return null;
}
function solveWith(L, STAY) {
  const who = Object.fromEntries(L.crew.map((c) => [c.id, [c.x, c.y]]));
  const isExit = (x, y) => !L.exits.length || tileAt(L, x, y) === 'E';
  const doorIdx = new Map(L.doors.map(([x, y], i) => [`${x},${y}`, i]));
  const lootIdx = new Map(L.loot.map(([x, y], i) => [`${x},${y}`, i]));
  const allDoors = (1 << L.doors.length) - 1, allLoot = (1 << L.loot.length) - 1;
  const openFromMask = (m) => new Set(L.doors.filter((_, i) => m & (1 << i)).map(([x, y]) => `${x},${y}`));
  const waits = who.K && L.terminals.length ? [...Array(45).keys()] : [null];

  for (const W of waits) {
    const plans = {};
    // 1) hacker: to the terminal, wait W steps there, then to the van
    let hackerPos = null;
    if (who.K) {
      const allOpen = new Set(L.doors.map(([x, y]) => `${x},${y}`));
      const baseCtx = { hacked: (t, id, x, y) => id === 'K' && tileAt(L, x, y) === 'C', open: () => new Set(), seeOpen: () => allOpen };
      let a = L.terminals.length ? bfs(L, 'K', who.K, 0, (x, y) => tileAt(L, x, y) === 'C', baseCtx) : { x: who.K[0], y: who.K[1], t: 0, path: '' };
      if (!a) { lastFail = 'hacker cannot reach a terminal safely'; continue; }
      // she must be able to wait out the W steps on the terminal too
      let okWait = true; for (let k = a.t + 1; k <= a.t + W; k++) if (spotted(L, k, a.x, a.y, [a.x, a.y], true, allOpen)) okWait = false;
      if (!okWait) { lastFail = `hacker seen while waiting at the terminal (wait ${W})`; continue; }
      const b = bfs(L, 'K', [a.x, a.y], a.t + W, (x, y) => isExit(x, y), { ...baseCtx, stayFor: STAY });
      if (!b) { lastFail = `hacker cannot get from terminal to van (wait ${W})`; continue; }
      plans.K = a.path + 'W'.repeat(W) + b.path;
      hackerPos = track(who.K, plans.K, L, 'K', () => new Set());
    }
    const hackedAt = (t) => !!hackerPos && tileAt(L, ...hackerPos[Math.min(t, hackerPos.length - 1)]) === 'C';
    // 2) muscle: smash every door, then to the van
    let doorsAt = () => new Set();
    if (who.M) {
      const ctx = { hacked: (t) => hackedAt(t), open: (t, id, m) => openFromMask(m), stayFor: STAY };
      const r = bfs(L, 'M', who.M, 0, (x, y, t, m) => m === allDoors && isExit(x, y), ctx,
        ([x, y]) => (doorIdx.has(`${x},${y}`) ? 1 << doorIdx.get(`${x},${y}`) : 0),
        (m, x, y) => (doorIdx.has(`${x},${y}`) ? m | (1 << doorIdx.get(`${x},${y}`)) : m), 120);
      if (!r) { lastFail = `muscle stuck (wait ${W})`; continue; }
      plans.M = r.path;
      const mpos = track(who.M, plans.M, L, 'M', () => new Set(L.doors.map(([x, y]) => `${x},${y}`)));
      doorsAt = (t) => { const s = new Set(); for (let k = 0; k <= Math.min(t, mpos.length - 1); k++) { const key = `${mpos[k][0]},${mpos[k][1]}`; if (doorIdx.has(key)) s.add(key); } return s; };
    }
    // 3) thief: grab all the loot (and the vault prize), then to the van
    if (who.T) {
      const ctx = { hacked: (t) => hackedAt(t), open: (t) => doorsAt(t), stayFor: L.vault ? 0 : STAY };
      const goal = L.vault
        ? (x, y, t, m) => m === allLoot && x === L.vault[0] && y === L.vault[1]
        : (x, y, t, m) => m === allLoot && isExit(x, y);
      const r = bfs(L, 'T', who.T, 0, goal, ctx,
        ([x, y]) => (lootIdx.has(`${x},${y}`) ? 1 << lootIdx.get(`${x},${y}`) : 0),
        (m, x, y) => (lootIdx.has(`${x},${y}`) ? m | (1 << lootIdx.get(`${x},${y}`)) : m), 120);
      if (!r) { lastFail = `thief stuck (wait ${W})`; continue; }
      plans.T = r.path;
    }
    const res = simulate(L, plans);
    if (res.ok) return { plans, steps: res.steps, W };
    lastFail = `sim failed: ${JSON.stringify(res.fail)} (wait ${W})`;
  }
  return null;
}

let bad = 0;
const out = {};
for (const [n, def] of Object.entries(LEVELS)) {
  if (def.bonus) { console.log(`L${n.padStart(2)} ${def.name.padEnd(22)} (bonus round)`); continue; }
  let L;
  try { L = parseLevel(def); } catch (e) { console.log(`L${n} ${def.name}: MAP ERROR ${e.message}`); bad++; continue; }
  const r = solveLevel(L);
  if (!r) { console.log(`L${n.padStart(2)} ${def.name.padEnd(22)} ✗ NO SOLUTION FOUND — ${lastFail}`); bad++; continue; }
  console.log(`L${n.padStart(2)} ${def.name.padEnd(22)} ✓ ${r.steps} steps (par ${def.par ?? '-'}) crew ${L.crew.map((c) => c.id).join('')}${r.W !== null ? ` hackerWait=${r.W}` : ''}`);
  out[n] = r.plans;
  if (VERBOSE) for (const [k, p] of Object.entries(r.plans)) console.log(`      ${k}: ${p}`);
}
console.log(bad ? `${bad} LEVEL(S) BROKEN` : 'ALL LEVELS OK');
const ji = process.argv.indexOf('--json');
if (ji > 0) (await import('node:fs')).writeFileSync(process.argv[ji + 1], JSON.stringify(out));
process.exit(bad ? 1 : 0);

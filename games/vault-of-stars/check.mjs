// ─────────────────────────────────────────────────────────────
//  VAULT OF STARS — fairness check.   Run:  node games/vault-of-stars/check.mjs
//
//  For every vault this replays every possible route (with the game's own rules from
//  vaults.js: the tick clock, laser beats, drone routes, drifting, cracked plates, keys)
//  and proves that:
//    • the airlock (or, in vault 16, the Golden Beacon) can be reached
//    • the fastest route uses at most 65% of the oxygen (canisters not counted)
//    • vault 15: after the last key, the airlock can be reached in 75% of the breach countdown
//    • every crystal and star chart can be collected
//    • the start is safe: nothing can hit you in your first 6 ticks if you stand still
//    • a vault with force-field doors really needs its key cards
//    • the PAR written in vaults.js matches the fastest route found here
//  Exit code 1 if any vault fails.
// ─────────────────────────────────────────────────────────────
import { VAULTS, buildVault, initialState, step, atGoal, allKeys, droneAt, laserLive, TICK, COLS, ROWS, DIR_LIST, FINAL, SECRET } from './vaults.js';

const ACTIONS = [null, ...DIR_LIST];
const keyOf = (st, since) => `${st.x},${st.y},${st.t},${st.keys},${st.holes},${st.slide || ''},${since}`;

/** Fastest route to the goal in ticks, or -1. breachLimit = ticks allowed after the last key (0 = no breach). */
function fastest(v, { maxTicks, breachLimit = 0 }) {
  const full = allKeys(v);
  const start = initialState(v);
  let frontier = [{ st: start, since: -1 }];
  const seen = new Set([keyOf({ ...start, t: 0 }, -1)]);
  for (let tick = 0; tick < maxTicks && frontier.length; tick++) {
    const next = [];
    for (const { st, since } of frontier) {
      for (const a of ACTIONS) {
        const r = step(v, st, a);
        if (r.hit) continue;
        let s2 = since >= 0 ? since + 1 : -1;
        if (breachLimit && s2 < 0 && v.keyNames.length && r.st.keys === full) s2 = 0;
        if (breachLimit && s2 > breachLimit) continue;
        if (atGoal(v, r.st) && (!v.keyNames.length || !v.breachTicks || r.st.keys === full)) return tick + 1;
        const k = keyOf({ ...r.st, t: r.st.t % v.cycle }, breachLimit ? s2 : -1);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ st: r.st, since: s2 });
        if (a === null && r.slid) break; // a forced drift is the same whatever you press
      }
    }
    frontier = next;
    if (seen.size > 6e6) throw new Error('state space too big');
  }
  return -1;
}

/** Every tile you can ever stand on (ignoring oxygen), with the game's rules. */
function reachableTiles(v) {
  const start = initialState(v);
  const tiles = new Set([start.y * COLS + start.x]);
  let frontier = [start];
  const seen = new Set([keyOf({ ...start, t: 0 }, -1)]);
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      for (const a of ACTIONS) {
        const r = step(v, st, a);
        if (r.hit) continue;
        tiles.add(r.st.y * COLS + r.st.x);
        const k = keyOf({ ...r.st, t: r.st.t % v.cycle }, -1);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ ...r.st, t: r.st.t % v.cycle });
      }
    }
    frontier = next;
    if (seen.size > 6e6) throw new Error('state space too big');
  }
  return tiles;
}

/** Can the goal be reached if the force-field doors never open? (plain flood fill, hazards ignored) */
function goalWithoutKeys(v) {
  const goal = v.beacon || v.exit;
  const seen = new Set([v.start[1] * COLS + v.start[0]]), q = [v.start];
  while (q.length) {
    const [x, y] = q.pop();
    if (x === goal[0] && y === goal[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = v.cell[ny]?.[nx];
      if (!c || c === '#' || 'abc'.includes(c) || seen.has(ny * COLS + nx)) continue;
      seen.add(ny * COLS + nx); q.push([nx, ny]);
    }
  }
  return false;
}

/** --show N: print vault N with its fastest route (and the moves). */
function show(n) {
  const v = buildVault(n), full = allKeys(v);
  const start = initialState(v);
  let frontier = [{ st: start, since: -1, path: [] }];
  const seen = new Set();
  for (let tick = 0; tick < v.o2Ticks && frontier.length; tick++) {
    const next = [];
    for (const { st, since, path } of frontier) {
      for (const a of ACTIONS) {
        const r = step(v, st, a);
        if (r.hit) continue;
        let s2 = since >= 0 ? since + 1 : -1;
        if (v.breachTicks && s2 < 0 && v.keyNames.length && r.st.keys === full) s2 = 0;
        if (v.breachTicks && s2 > v.breachTicks) continue;
        const p2 = [...path, [r.st.x, r.st.y, a ? a[0].toUpperCase() : r.slid ? '~' : '.']];
        if (atGoal(v, r.st)) {
          const grid = v.cell.map((row) => [...row]);
          for (const [x, y] of p2) if ('.~x'.includes(grid[y][x])) grid[y][x] = '+';
          console.log(grid.map((row) => row.join('')).join('\n'));
          console.log(`\n${tick + 1} ticks: ${p2.map((p) => p[2]).join('')}`);
          return;
        }
        const k = keyOf({ ...r.st, t: r.st.t % v.cycle }, v.breachTicks ? s2 : -1);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ st: r.st, since: s2, path: p2 });
      }
    }
    frontier = next;
  }
  console.log('no route');
}
const si = process.argv.indexOf('--show');
if (si > 0) { show(+process.argv[si + 1]); process.exit(0); }
const only = process.argv.includes('--only') ? +process.argv[process.argv.indexOf('--only') + 1] : 0;

let failed = 0, legendTicks = 0;
const pad = (s, n) => String(s).padEnd(n);
console.log('Vault of Stars — fairness check\n');
for (let n = 1; n <= SECRET; n++) {
  if (only && n !== only) continue;
  const problems = [];
  let v;
  try { v = buildVault(n); } catch (e) { console.log(`✗ ${n}: ${e.message}`); failed++; continue; }
  const notes = [];

  // Start safety: stand still for 6 ticks.
  let st = initialState(v);
  for (let i = 0; i < 6; i++) { const r = step(v, st, null); if (r.hit) { problems.push(`start is hit by a ${r.hit} at tick ${i + 1}`); break; } st = r.st; }
  for (const d of v.drones) for (let t = 0; t <= 6; t++) { const [x, y] = droneAt(d, t); if (Math.abs(x - v.start[0]) + Math.abs(y - v.start[1]) < 3) { problems.push('a drone starts too close'); break; } }
  if (laserLive(v, v.start[0], v.start[1], 0)) problems.push('start is on a laser');

  // Every relic collectable.
  const tiles = reachableTiles(v);
  const missed = v.relics.filter((r) => !tiles.has(r.y * COLS + r.x));
  if (missed.length) problems.push(`can't collect relics at ${missed.map((r) => `${r.x},${r.y}`).join(' ')}`);
  const keysMissed = Object.entries(v.keys).filter(([, [x, y]]) => !tiles.has(y * COLS + x)).map(([k]) => k);
  if (keysMissed.length) problems.push(`can't reach key ${keysMissed.join(',')}`);

  if (v.bonus) {
    notes.push(`${v.relics.length} relics`);
  } else {
    if (v.keyNames.length && goalWithoutKeys(v)) problems.push('the goal can be reached without the key cards');
    const par = fastest(v, { maxTicks: v.o2Ticks, breachLimit: v.breachTicks });
    if (par < 0) problems.push('the goal can NOT be reached in time');
    else {
      if (par > v.o2Ticks * 0.65) problems.push(`fastest route uses ${Math.round(par / v.o2Ticks * 100)}% of the oxygen (max 65%)`);
      if (par !== v.par) problems.push(`par is ${par} ticks — update vaults.js (says ${v.par})`);
      notes.push(`par ${par} ticks = ${(par * TICK).toFixed(2)} s · O₂ ${(v.o2Ticks * TICK).toFixed(0)} s (${Math.round(par / v.o2Ticks * 100)}%)`);
      if (n <= FINAL || n === SECRET) legendTicks += par;
    }
    if (v.breachTicks) {
      const tight = fastest(v, { maxTicks: v.o2Ticks, breachLimit: Math.floor(v.breachTicks * 0.75) });
      if (tight < 0) problems.push('the hull-breach dash needs more than 75% of the countdown');
      else notes.push(`breach dash fits in 75% of ${(v.breachTicks * TICK).toFixed(1)} s`);
    }
  }
  notes.push(`${v.relics.length} relics, cycle ${v.cycle}`);
  if (problems.length) { failed++; console.log(`✗ ${pad(n, 3)}${pad(v.name, 20)} ${problems.join('; ')}`); }
  else console.log(`✓ ${pad(n, 3)}${pad(v.name, 20)} ${notes.join(' · ')}`);
}
const bonusSec = 2 * 20;
console.log(`\nA perfect Legend run (vaults 1–16): about ${Math.round(legendTicks * TICK + bonusSec)} s of play (fastest routes + two 20 s caches).`);
console.log(failed ? `\n${failed} vault(s) failed.` : '\nAll vaults pass.');
process.exit(failed ? 1 : 0);

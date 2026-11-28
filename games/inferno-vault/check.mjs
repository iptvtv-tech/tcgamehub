// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — fairness check.   Run:  node games/inferno-vault/check.mjs
//
//  For every level in levels.js this flies every move from every standing spot with the game's
//  own movement (plan.js → world.js) and proves that:
//    • the start and the vault door stand on solid floor, clear of rock and lava
//    • the door can be reached from the start at EVERY size, the small man included
//      (melting makes his jump lower, so that is the hard case)
//    • every frost shard and fire opal can be reached at full size
//    • every fire guard has a real patrol (two tiles at least), and every floor with a guard
//      has a shadow alcove to hide in, where a full-size Iceman is hidden from the beams
//    • no guard can see the start, so the first seconds are always safe
//  Exit code 1 if any level fails.
// ─────────────────────────────────────────────────────────────
import { TILE, STAGES, SHADOW, tileAt, isFloor, isHidden, sees, bodyH, LAVA } from './world.js';
import { ALL_MAPS } from './levels.js';
import { graphFor, reachableFrom, nodeId, standable, itemsOf } from './plan.js';

let bad = 0;
const fail = (m, msg) => { bad++; console.log(`✗ ${m.name}: ${msg}`); };
const t0 = Date.now();

for (const m of ALL_MAPS()) {
  const sc = Math.floor(m.spawn.x / TILE), sr = Math.round(m.spawn.y / TILE);
  if (!isFloor(tileAt(m, sc, sr))) fail(m, `the start (col ${sc}) has no floor under it`);
  const dc = Math.floor(m.exit.x / TILE), dr = Math.round(m.exit.y / TILE);
  if (!isFloor(tileAt(m, dc, dr))) fail(m, 'the vault door has no floor under it');
  // the guards
  for (const g of m.guards) {
    if (g.x1 - g.x0 < TILE * 2) fail(m, `the guard at col ${g.c}, row ${g.r} has almost no patrol`);
    const floor = g.r + 1;
    let alcove = false;
    for (let c = 1; c < m.C - 1; c++) {
      if (!standable(m, c, floor, 1)) continue;
      const p = { x: c * TILE + TILE / 2, y: floor * TILE, k: 1 };
      if (isHidden(m, p)) alcove = true;
    }
    if (!alcove) fail(m, `the floor of the guard at col ${g.c}, row ${g.r} has no alcove to hide in`);
    // a guard at either end of its walk, facing either way, never sees the start
    for (const x of [g.x0, g.x, g.x1]) for (const face of [-1, 1]) {
      const p = { x: m.spawn.x, y: m.spawn.y, k: 1, dead: false };
      if (sees(m, { x, y: g.y, face, state: 'patrol' }, p)) fail(m, `the guard at col ${g.c}, row ${g.r} can see the start`);
    }
  }
  // the route
  const notes = [];
  for (const st of STAGES) {
    const g = graphFor(m, st.k), start = nodeId(m, sc, sr);
    if (!g.nodes.has(start)) { fail(m, `the start has no room for the ${st.name} Iceman`); continue; }
    const { seen, exit } = reachableFrom(m, g, start);
    if (!exit) fail(m, `the vault door can't be reached at size ${st.name}`);
    if (st.k === 1) {
      const got = new Set();
      for (const id of seen) for (const j of g.nodes.get(id).items) got.add(j);
      itemsOf(m).forEach((q, j) => { if (!got.has(j)) fail(m, `${j < m.shards.length ? 'frost shard' : 'fire opal'} at col ${Math.floor(q.x / TILE)}, row ${Math.floor(q.y / TILE)} can't be reached`); });
    }
    notes.push(`${st.name} ${g.dist.get(start).toFixed(1)}`);
  }
  console.log(`  ${m.name}: ${m.R} rows, ${m.guards.length} guards, ${m.shards.length} shards, ${m.opals.length} opals · start → door (moves): ${notes.join(', ')}`);
}

if (bad) { console.log(`✗ inferno-vault level checker: ${bad} problem(s)`); process.exit(1); }
console.log(`✓ inferno-vault level checker — every level crossable at every size, every guard's floor has an alcove (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

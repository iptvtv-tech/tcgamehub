// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — fairness check.   Run:  node games/magma-escape/check.mjs
//
//  For every shaft in levels.js this flies every move from every standing spot with the game's
//  own movement (plan.js → world.js stepPlayer) and proves that:
//    • the start stands on solid footing, clear of the lava pool and of rock
//    • the vent can be reached from the start at EVERY size, the small man included
//      (melting makes his jump lower, so this is the hard case)
//    • every ice crystal can be reached at full size
//    • the lava pool starts below the start, so the first seconds are safe
//  Exit code 1 if any shaft fails.
// ─────────────────────────────────────────────────────────────
import { TILE, STAGES, tileAt, isFloor } from './world.js';
import { ALL_SHAFTS } from './levels.js';
import { graphFor, reachableFrom, nodeId } from './plan.js';

let bad = 0;
const fail = (m, msg) => { bad++; console.log(`✗ ${m.name}: ${msg}`); };
const t0 = Date.now();

for (const m of ALL_SHAFTS()) {
  const sc = Math.floor(m.spawn.x / TILE), sr = Math.round(m.spawn.y / TILE);
  if (!isFloor(tileAt(m, sc, sr))) fail(m, `the start (col ${sc}) has no floor under it`);
  if (m.spawn.y + 24 > m.lavaStart) fail(m, 'the start is too close to the lava pool');
  if (!isFloor(tileAt(m, Math.floor(m.exit.x / TILE), Math.round(m.exit.y / TILE)))) fail(m, 'the vent has no ledge under it');
  const notes = [];
  for (const st of STAGES) {
    const g = graphFor(m, st.k), start = nodeId(m, sc, sr);
    if (!g.nodes.has(start)) { fail(m, `the start has no room for the ${st.name} Iceman`); continue; }
    const { seen, exit } = reachableFrom(m, g, start);
    if (!exit) fail(m, `the vent can't be reached at size ${st.name}`);
    if (st.k === 1) {
      const got = new Set();
      for (const id of seen) for (const j of g.nodes.get(id).crystals) got.add(j);
      m.crystals.forEach((q, j) => { if (!got.has(j)) fail(m, `crystal ${j + 1} (row ${Math.floor(q.y / TILE)}) can't be reached`); });
    }
    notes.push(`${st.name} ${g.dist.get(start).toFixed(1)} moves`);
  }
  console.log(`  ${m.name}: ${m.R} rows, ${m.crystals.length} crystals · start → vent: ${notes.join(', ')}`);
}

if (bad) { console.log(`✗ magma-escape level checker: ${bad} problem(s)`); process.exit(1); }
console.log(`✓ magma-escape level checker — every shaft climbable at every size (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

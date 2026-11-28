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
//    • no guard can see the start, and no heat lamp ever lights it, so the first seconds are safe
//    • on the freeze levels (6+) the routes may use the FREEZE (an ice bridge over a lava pool);
//      the first of them, The Cold Bridge, can't be crossed without it (it teaches the freeze)
//    • on a level with an ember key (11–15): the key can be reached with the gates shut, at every
//      size, and from anywhere he could be when he takes it, the door can be reached with them open
//  Exit code 1 if any level fails.
// ─────────────────────────────────────────────────────────────
import { TILE, STAGES, SHADOW, tileAt, isFloor, isHidden, sees, bodyH, LAVA, litByLamp, LAMP_P } from './world.js';
import { ALL_MAPS } from './levels.js';
import { graphFor, reachableFrom, nodeId, standable, itemsOf, planMap } from './plan.js';

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
    if (g.kind !== 'sentinel' && g.x1 - g.x0 < TILE * 2) fail(m, `the guard at col ${g.c}, row ${g.r} has almost no patrol`);
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
  // heat lamps never light the start
  for (const l of m.lamps) {
    for (let t = 0; t < LAMP_P; t += 0.05) if (litByLamp(m, { ...l, out: 0 }, t, { x: m.spawn.x, y: m.spawn.y, k: 1, dead: false })) { fail(m, `the heat lamp at col ${l.c} lights the start`); break; }
  }
  // the first freeze level needs the freeze
  if (m.freeze && m === ALL_MAPS().find((q) => q.freeze)) {
    const plain = { ...m, name: `${m.name} (no freeze)`, freeze: false };
    const g = graphFor(plain, 1), { exit } = reachableFrom(plain, g, nodeId(m, sc, sr));
    if (exit) fail(m, 'it can be crossed without the freeze, so it does not teach it');
  }
  // the route
  const notes = [];
  for (const st of STAGES) {
    if (m.key) { keyRoute(m, st, nodeId(m, sc, sr), notes); continue; }
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
  const kinds = ['brute', 'sentinel'].map((k) => [k, m.guards.filter((g) => g.kind === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`);
  console.log(`  ${m.name}: ${m.R} rows, ${m.guards.length} guards${kinds.length ? ` (${kinds.join(', ')})` : ''}${m.jets.length ? `, ${m.jets.length} jets` : ''}${m.lamps.length ? `, ${m.lamps.length} lamps` : ''}${m.vents.length ? `, ${m.vents.length} vents` : ''}${m.key ? ', a key' : ''}, ${m.shards.length} shards, ${m.opals.length} opals · start → ${m.key ? 'key + door' : 'door'} (moves): ${notes.join(', ')}`);
}

/** A level with an ember key: the key first (gates shut), then the door (gates open). */
function keyRoute(m, st, start, notes) {
  const toKey = planMap(m, false), open = planMap(m, true);
  const gk = graphFor(toKey, st.k), go = graphFor(open, st.k);
  if (!gk.nodes.has(start)) { fail(m, `the start has no room for the ${st.name} Iceman`); return; }
  const a = reachableFrom(toKey, gk, start);
  if (!a.exit) fail(m, `the ember key can't be reached at size ${st.name}`);
  for (const id of a.seen) {
    if (m.gates.includes(id)) continue;                  // standing on a hatch: it opens under him
    if (!Number.isFinite(go.dist.get(id))) { fail(m, `after taking the key at col ${id % m.C}, row ${Math.floor(id / m.C)}, the door can't be reached at size ${st.name}`); break; }
  }
  if (st.k === 1) {
    const got = new Set(), b = reachableFrom(open, go, start);
    for (const id of a.seen) for (const j of gk.nodes.get(id).items) got.add(j);
    for (const id of b.seen) for (const j of go.nodes.get(id).items) got.add(j);
    itemsOf(m).forEach((q, j) => { if (!got.has(j)) fail(m, `${j < m.shards.length ? 'frost shard' : 'fire opal'} at col ${Math.floor(q.x / TILE)}, row ${Math.floor(q.y / TILE)} can't be reached`); });
  }
  notes.push(`${st.name} ${gk.dist.get(start).toFixed(1)}+${go.dist.get(start)?.toFixed(1) ?? '?'}`);
}

if (bad) { console.log(`✗ inferno-vault level checker: ${bad} problem(s)`); process.exit(1); }
console.log(`✓ inferno-vault level checker — every level crossable at every size, every guard's floor has an alcove (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

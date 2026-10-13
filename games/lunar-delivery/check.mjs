// ─────────────────────────────────────────────────────────────
//  node games/lunar-delivery/check.mjs
//  Builds 40 random worlds for every level 1–30 and proves each one can be
//  flown: the right number of pads, inside the map, well apart, the ridge line
//  between pads under the flying ceiling, nothing standing on a pad, and enough
//  fuel for every leg (a full tank at the start pad plus the canisters on the
//  way, flown at a steady cruise with the crate hanging, with 20% to spare).
// ─────────────────────────────────────────────────────────────
import { buildWorld, sunShade, deliveriesFor, legFuel, crateKind, PAD_R, LIMIT, PHYS } from './world.js';

let fails = 0, worst = 0, worstAt = '', shadeMs = 0, shadeN = 0;
const fail = (msg) => { fails++; if (fails < 25) console.log('✗ ' + msg); };

for (let level = 1; level <= 30; level++) {
  const bonus = level % 5 === 0;
  for (let k = 0; k < 40; k++) {
    const seed = (Math.imul(1000 + k * 7 + level * 7919, 2654435761 | 0) >>> 0) || 1;
    const W = buildWorld({ level, bonus, seed });
    const tag = `L${level} seed ${seed}`;
    if (k === 0) { const t0 = performance.now(); sunShade(W, [0.7, 0.26, 0.66]); shadeMs += performance.now() - t0; shadeN++; }
    if (bonus) { if (W.pads.length !== 1 || W.dust.length < 60) fail(`${tag}: bonus world wrong (${W.pads.length} pads, ${W.dust.length} stars)`); continue; }
    const want = deliveriesFor(level) + 1;
    if (W.pads.length !== want) { fail(`${tag}: ${W.pads.length} pads, wanted ${want}`); continue; }
    for (const P of W.pads) {
      if (Math.abs(P.x) > LIMIT - 20 || Math.abs(P.z) > LIMIT - 20) fail(`${tag}: pad ${P.name} too near the edge`);
      for (const d of W.domes) if (Math.hypot(d.x - P.x, d.z - P.z) < PAD_R + d.r + 1) fail(`${tag}: a dome sits on ${P.name}`);
      for (const m of W.masts) if (Math.hypot(m.x - P.x, m.z - P.z) < PAD_R + 2) fail(`${tag}: a mast sits on ${P.name}`);
      for (const g of W.geysers) if (Math.hypot(g.x - P.x, g.z - P.z) < PAD_R + 12) fail(`${tag}: a geyser by ${P.name}`);
      if (Math.abs(W.ground(P.cargo.x, P.cargo.z) - P.y) > 0.05) fail(`${tag}: crate spot at ${P.name} not flat`);
    }
    for (let i = 0; i < W.pads.length; i++) for (let j = i + 1; j < W.pads.length; j++) if (Math.hypot(W.pads[i].x - W.pads[j].x, W.pads[i].z - W.pads[j].z) < 100) fail(`${tag}: pads ${i} and ${j} too close`);
    // each leg
    for (let leg = 0; leg < W.pads.length - 1; leg++) {
      const A = W.pads[leg], B = W.pads[leg + 1], kind = crateKind(level, leg);
      const { fuel, cruiseY, D } = legFuel(W.ground, A, B, level, kind);
      if (cruiseY > W.ceiling - 20) fail(`${tag}: leg ${leg} ridge too close to the ceiling (${cruiseY.toFixed(0)} vs ${W.ceiling.toFixed(0)})`);
      const cans = W.fuel.filter((f) => f.leg === leg);
      for (const f of cans) if (f.y < W.ground(f.x, f.z) + 3 || f.y > W.ceiling - 10) fail(`${tag}: a canister is out of reach`);
      const have = 100 + cans.length * PHYS.CAN, ratio = fuel / have;
      if (ratio > worst) { worst = ratio; worstAt = `${tag} leg ${leg} (${D.toFixed(0)} m, ${kind}, ${cans.length} cans)`; }
      if (fuel * 1.2 > have) fail(`${tag}: leg ${leg} needs ${fuel.toFixed(0)}% fuel, has ${have}%`);
    }
  }
}
console.log(`sun shadows: ${(shadeMs / shadeN).toFixed(0)} ms per level`);
console.log(`hungriest leg uses ${(worst * 100).toFixed(0)}% of the fuel on offer — ${worstAt}`);
console.log(fails ? `✗ ${fails} problems` : '✓ every level of 1–30 can be flown (1,200 worlds)');
process.exit(fails ? 1 : 0);

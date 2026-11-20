// node games/avalanche-run/check.mjs [--seeds=40]
// Level checker for Avalanche Run. Slopes are made from seeded dice (world.js makeSlope), so this
// builds every run for a spread of seeds and proves, without knowing the slope maker's safe line:
//   1 · there is a way from the start line to the hut, and from the flag to the hut, that never
//       touches a tree or rock, steering no harder than three quarters of what the sled can at
//       its cruising speed (tucking is a choice: it is for open snow)
//   2 · the first 45 m after the start line and after the flag are clear right across the line
//       you (re)start on, so a restart never begins with a tumble
//   3 · nothing stands on the slope's edge lines or past the hut, and no two obstacles overlap
//   4 · the avalanche is slower than the sled's cruising speed on every run (it can be outrun),
//       and a clean cruise from a restart reaches the hut before it
//   5 · the crystal rushes (runs 5 and 10) have nothing to hit and plenty to collect
//   6 · crevasses: the way down in (1) crosses each one by the ramp at its edge; the 45 m before
//       it are bare right across the slope, so even a sled that has just tumbled is fast enough
//       again for the ramp to carry it over; a timed jump at cruising speed clears it too
//   7 · ramps: the lane behind every ramp is clear for the longest flight the run allows (tucked,
//       boosted) plus room to land, and no flight can come down in a crevasse
//   8 · every crystal is on the slope; the ones on the snow are not inside a tree or rock
//   9 · creatures: every yeti stands clear of the safe line (the way down in (1) treats it as an
//       obstacle), never before a crevasse or where a flight lands; wolf packs and rolling
//       boulders never come out near a crevasse or on the clear snow after the flag; each run
//       has the wolves, yetis and boulders its number calls for
//  10 · the mountain: ice and deep snow lie beside the safe line, never on it, with nothing
//       standing in them; every ruin is one unbroken wall with one gate, on the safe line and
//       wider than its clear snow (the way down in (1) goes through it); frost gusts lie on open
//       snow within reach of the safe line
import { makeRng } from '../../assets/js/rng.js';
import { makeSlope, runFor, lineAt, flight, rampClear, HALF, PR, STEER, TUMBLE_V, PILLAR_R, HOP_VY, GRAV, BOOST, CREV_CLEAR, START_GAP, CLEAR_START, BONUS_LEVELS, FINAL_LEVEL } from './world.js';

const arg = process.argv.find((a) => a.startsWith('--seeds='));
const SEEDS = arg ? +arg.slice(8) : 40;
const DX = 0.25, NX = Math.round((2 * (HALF - PR)) / DX) + 1, xAt = (i) => -HALF + PR + i * DX;
const problems = [];
const fail = (m) => { if (problems.length < 30) problems.push(m); else if (problems.length === 30) problems.push('… and more'); };

/** Can the sled get from (x0, z0) to the hut? A sweep down the slope in short steps: in each step
 *  a spot may be reached from the spot beside it (0.25 m), and the step is as long as a cruising
 *  sled needs to move 0.25 m sideways at three quarters of its steering. */
function wayDown(slope, x0, z0) {
  const R = slope.R, dz = DX / (STEER * 0.75 / R.cruise), reach = 1, near = dz / 2 + 1, obs = slope.obstacles;
  let live = new Uint8Array(NX); live[Math.round((x0 + HALF - PR) / DX)] = 1;
  let oi = 0, ci = 0;
  for (let z = z0; z <= slope.len; z += dz) {
    // a crevasse: only the spots on its ramp get across, and they come down beyond it
    while (ci < slope.crevasses.length && slope.crevasses[ci].z < z0) ci++;
    if (ci < slope.crevasses.length && z >= slope.crevasses[ci].z - 1) {
      const c = slope.crevasses[ci++], rp = slope.ramps.find((r) => r.crev && Math.abs(r.z - c.z) < 2);
      let any = false;
      for (let i = 0; i < NX; i++) { if (live[i] && Math.abs(xAt(i) - rp.x) > rp.w - 0.3) live[i] = 0; any ||= !!live[i]; }
      if (!any) return Math.round(c.z);
      z = c.z + flight(R.cruise);
    }
    while (oi < obs.length && obs[oi].z < z - 3) oi++;
    const next = new Uint8Array(NX);
    let any = false;
    for (let i = 0; i < NX; i++) {
      if (!live[i]) continue;
      for (let j = Math.max(0, i - reach); j <= Math.min(NX - 1, i + reach); j++) {
        if (next[j]) continue;
        const x = xAt(j);
        let free = true;
        for (let k = oi; k < obs.length && obs[k].z < z + 3; k++) { const o = obs[k]; if (Math.abs(o.z - z) < near && Math.abs(o.x - x) < o.r + PR + 0.15) { free = false; break; } }
        if (free) { next[j] = 1; any = true; }
      }
    }
    if (!any) return Math.round(z);                // the sweep died here
    live = next;
  }
  return 0;
}

let slopes = 0, obstacles = 0, narrow = 99, crevs = 0, ramps = 0, yetiN = 0, packN = 0, rollN = 0, short = 0, zoneN = 0, wallN = 0, gustN = 0;
for (let level = 1; level <= FINAL_LEVEL; level++) {
  const R = runFor(level);
  if (BONUS_LEVELS.includes(level)) {
    for (let seed = 1; seed <= 5; seed++) {
      const sl = makeSlope(level, makeRng(seed * 7919 + level * 31), true);
      if (sl.obstacles.length) fail(`run ${level} seed ${seed}: a crystal rush has ${sl.obstacles.length} things to hit`);
      if (sl.crystals.length < 200) fail(`run ${level} seed ${seed}: only ${sl.crystals.length} crystals in the rush`);
      if (sl.crystals.some((c) => Math.abs(c.x) > HALF - PR)) fail(`run ${level} seed ${seed}: a crystal lies off the slope`);
    }
    continue;
  }
  if (R.avalanche >= R.cruise * 0.95) fail(`run ${level}: the avalanche (${R.avalanche.toFixed(1)} m/s) is as fast as the sled cruising (${R.cruise.toFixed(1)} m/s)`);
  // a clean cruise from a restart (60% speed, 55 m ahead) must reach the hut first, from the start and from the flag
  for (const from of [0, Math.round(R.len * 0.5)]) {
    const tSled = (R.len - from) / R.cruise + (R.cruise * 0.4) / R.acc * 0.5, tSnow = (R.len - from + START_GAP - 1.5) / R.avalanche;
    if (tSled >= tSnow) fail(`run ${level}: a clean ride from ${from ? 'the flag' : 'the start'} takes ${tSled.toFixed(1)} s, the avalanche ${tSnow.toFixed(1)} s`);
  }
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sl = makeSlope(level, makeRng(seed * 7919 + level * 31), false), tag = `run ${level} seed ${seed}`;
    slopes++; obstacles += sl.obstacles.length;
    for (const [what, z0] of [['the start line', 0], ['the flag', sl.flagZ]]) {
      const x0 = lineAt(sl.knots, z0);
      const died = wayDown(sl, x0, z0);
      if (died) fail(`${tag}: no way down from ${what}: every line is blocked by z=${died} m (hut at ${sl.len})`);
      const inWay = sl.obstacles.find((o) => o.z >= z0 - 1 && o.z < z0 + CLEAR_START - 1 && Math.abs(o.x - x0) < o.r + PR + 1);
      if (inWay) fail(`${tag}: a ${inWay.kind} stands ${Math.round(inWay.z - z0)} m after ${what}, on the line you start on`);
    }
    for (let i = 0; i < sl.obstacles.length; i++) {
      const o = sl.obstacles[i];
      if (Math.abs(o.x) > HALF + (o.kind === 'pillar' ? 2.6 : 0) || o.z > sl.len - 10 || o.z < 0) fail(`${tag}: a ${o.kind} at (${o.x.toFixed(1)}, ${o.z.toFixed(0)}) is off the slope or in front of the hut`);
      for (let j = i + 1; j < sl.obstacles.length && sl.obstacles[j].z - o.z < 2.4; j++) { const q = sl.obstacles[j]; if (Math.abs(q.x - o.x) < o.r + q.r) fail(`${tag}: two obstacles overlap at z=${o.z.toFixed(0)}`); }
    }
    // crevasses and ramps
    for (const c of sl.crevasses) {
      const inWay = sl.obstacles.find((o) => o.z > c.z - CREV_CLEAR + 1 && o.z < c.z + c.len + flight(R.top * BOOST) - c.len + 4);
      if (inWay && inWay.z < c.z + c.len) fail(`${tag}: a ${inWay.kind} stands ${Math.round(c.z - inWay.z)} m before the crevasse at z=${Math.round(c.z)} (the run-up must be bare)`);
      const rp = sl.ramps.find((r) => r.crev && Math.abs(r.z - c.z) < 2);
      if (!rp) { fail(`${tag}: the crevasse at z=${Math.round(c.z)} has no ramp`); continue; }
      if (Math.abs(rp.x - lineAt(sl.knots, rp.z)) > 0.5) fail(`${tag}: the ramp of the crevasse at z=${Math.round(c.z)} is not on the safe line`);
      // the slowest sled that can arrive: tumbled at the start of the bare run-up, then 45 m of picking up speed
      const slow = Math.min(R.cruise, Math.sqrt(TUMBLE_V * TUMBLE_V + 2 * R.acc * (CREV_CLEAR - 8)));
      if (flight(slow) < c.len + 3) fail(`${tag}: a sled at ${slow.toFixed(0)} m/s flies ${flight(slow).toFixed(0)} m off the ramp; the crevasse is ${c.len} m`);
      if (R.cruise * 2 * HOP_VY / GRAV < c.len + 2) fail(`${tag}: a jump at cruising speed carries ${(R.cruise * 2 * HOP_VY / GRAV).toFixed(0)} m; the crevasse is ${c.len} m`);
      crevs++;
    }
    for (const rp of sl.ramps) {
      const far = rampClear(R);
      const inLane = sl.obstacles.find((o) => o.z > rp.z - 6 && o.z < rp.z + far && Math.abs(o.x - rp.x) < rp.w + PR + o.r);
      if (inLane) fail(`${tag}: a ${inLane.kind} stands in the landing lane of the ramp at z=${Math.round(rp.z)}, ${Math.round(inLane.z - rp.z)} m behind it`);
      if (Math.abs(rp.x) + rp.w > HALF) fail(`${tag}: the ramp at z=${Math.round(rp.z)} hangs over the edge of the slope`);
      for (const c of sl.crevasses) { if (rp.crev && Math.abs(rp.z - c.z) < 2) continue; if (c.z + c.len > rp.z && c.z < rp.z + far) fail(`${tag}: a flight off the ramp at z=${Math.round(rp.z)} can come down in the crevasse at z=${Math.round(c.z)}`); }
      if (rp.z + far > sl.len + 40) fail(`${tag}: the ramp at z=${Math.round(rp.z)} is too close to the hut`);
      ramps++;
    }
    for (const c of sl.crystals) {
      if (Math.abs(c.x) > HALF - PR || c.z < 0 || c.z > sl.len + 5) fail(`${tag}: a crystal at (${c.x.toFixed(1)}, ${c.z.toFixed(0)}) is off the slope`);
      if (c.y <= 1 && sl.obstacles.some((o) => Math.abs(o.z - c.z) < 1 && Math.abs(o.x - c.x) < o.r + PR)) fail(`${tag}: a crystal at z=${c.z.toFixed(0)} sits inside a tree or rock`);
    }
    // creatures
    const yetis = sl.obstacles.filter((o) => o.kind === 'yeti');
    if (yetis.length > R.yetis || sl.packs.length > R.packs || sl.rollers.length > R.rollers) fail(`${tag}: more creatures than the run calls for (${yetis.length} yetis, ${sl.packs.length} packs, ${sl.rollers.length} boulders)`);
    if (R.yetis && !yetis.length && seed <= 3) short++;
    for (const y of yetis) {
      if (Math.abs(y.x - lineAt(sl.knots, y.z)) < R.corridor + PR + y.r + 1) fail(`${tag}: the yeti at z=${Math.round(y.z)} stands ${Math.abs(y.x - lineAt(sl.knots, y.z)).toFixed(1)} m from the safe line`);
      if (sl.crevasses.some((c) => y.z > c.z - CREV_CLEAR - 100 && y.z < c.z + c.len + 30)) fail(`${tag}: the yeti at z=${Math.round(y.z)} can throw at a sled in a crevasse's run-up`);
      yetiN++;
    }
    for (const q of [...sl.packs, ...sl.rollers]) {
      if (sl.crevasses.some((c) => q.z > c.z - 80 && q.z < c.z + c.len + 10)) fail(`${tag}: wolves or a boulder come out at z=${Math.round(q.z)}, right before a crevasse`);
      if (q.z > sl.flagZ - 5 && q.z < sl.flagZ + CLEAR_START) fail(`${tag}: wolves or a boulder come out at z=${Math.round(q.z)}, on the clear snow after the flag`);
      if (q.z < CLEAR_START + 50) fail(`${tag}: wolves or a boulder come out at z=${Math.round(q.z)}, too close to the start`);
    }
    packN += sl.packs.length; rollN += sl.rollers.length;
    // the mountain
    for (const q of sl.zones) {
      for (let d = 0; d <= q.len; d += 2) if (Math.abs(q.x - lineAt(sl.knots, q.z + d)) < R.corridor + PR + q.w) { fail(`${tag}: the ${q.kind === 'ice' ? 'ice patch' : 'drift'} at z=${Math.round(q.z)} lies across the safe line`); break; }
      if (Math.abs(q.x) + q.w > HALF) fail(`${tag}: the ${q.kind} zone at z=${Math.round(q.z)} hangs over the slope's edge`);
      if (sl.obstacles.some((o) => o.z > q.z && o.z < q.z + q.len && Math.abs(o.x - q.x) < q.w)) fail(`${tag}: something stands in the ${q.kind} zone at z=${Math.round(q.z)}`);
      zoneN++;
    }
    for (const w of sl.walls) {
      const row = sl.obstacles.filter((o) => o.kind === 'pillar' && Math.abs(o.z - w.z) < 0.1).map((o) => o.x).sort((a, b) => a - b);
      const gaps = row.slice(1).map((x, i) => [x - row[i], (x + row[i]) / 2]).filter(([d]) => d > PILLAR_R * 2 + 0.6);
      if (gaps.length !== 1) fail(`${tag}: the ruin at z=${Math.round(w.z)} has ${gaps.length} gaps (it should have exactly one gate)`);
      else if (Math.abs(gaps[0][1] - lineAt(sl.knots, w.z)) > 0.3 || gaps[0][0] / 2 - PILLAR_R < R.corridor + PR + 1) fail(`${tag}: the gate of the ruin at z=${Math.round(w.z)} is ${(gaps[0][0] - PILLAR_R * 2).toFixed(1)} m wide, ${Math.abs(gaps[0][1] - lineAt(sl.knots, w.z)).toFixed(1)} m off the safe line`);
      if (row[0] - PILLAR_R > -HALF + PR * 2 || row[row.length - 1] + PILLAR_R < HALF - PR * 2) fail(`${tag}: a sled can slip round the end of the ruin at z=${Math.round(w.z)}`);
      wallN++;
    }
    for (const q of sl.gusts) {
      if (Math.abs(q.x) > HALF - PR || sl.obstacles.some((o) => Math.abs(o.z - q.z) < 4 && Math.abs(o.x - q.x) < o.r + PR + 0.8)) fail(`${tag}: the frost gust at z=${Math.round(q.z)} is off the slope or behind a tree`);
      if (Math.abs(q.x - lineAt(sl.knots, q.z)) > R.corridor + PR + 3) fail(`${tag}: the frost gust at z=${Math.round(q.z)} is too far from the safe line to fetch`);
      gustN++;
    }
    // the tightest gate on the safe line, for the summary
    for (let z = CLEAR_START; z < sl.len; z += 2) {
      const x = lineAt(sl.knots, z);
      for (const o of sl.obstacles) { if (o.z > z + 2) break; if (o.z > z - 2) narrow = Math.min(narrow, Math.abs(o.x - x) - o.r - PR); }
    }
  }
}
if (problems.length) { console.log(`✗ avalanche-run levels: ${problems.length} problem(s)`); for (const p of problems) console.log('    ' + p); process.exit(1); }
console.log(`✓ avalanche-run levels — ${slopes} slopes (${FINAL_LEVEL - BONUS_LEVELS.length} runs × ${SEEDS} seeds, ${obstacles} trees and rocks): a clear way down from the start and from the flag on every one, at cruising speed with a quarter of the steering to spare; restarts begin on clear snow; at least ${narrow.toFixed(1)} m free either side of the sled on the widest line; the avalanche can always be outrun; ${crevs} crevasses each crossed by their ramp after a bare run-up; ${ramps} ramps with a clear landing lane; ${yetiN} yetis, ${packN} wolf packs and ${rollN} rolling boulders, none near a crevasse; ${zoneN} ice and deep-snow patches beside the safe line; ${wallN} ruins each with one gate on it; ${gustN} frost gusts in reach`);

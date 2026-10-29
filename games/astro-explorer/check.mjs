// node games/astro-explorer/check.mjs [--quick] [--only=Name] [--show] [--print=Name] [--maps-json=file] [--dump=file]
// Proves every planet, lair and vault is fair, using the game's own rules (world.js, guardians.js):
//  1. well-formed: spawn, exit and rest beacon on solid footing, spikes rooted in rock, every alien
//     slot valid (ground slots over a floor, flyers with room to hover, pods beside rock), none near
//     the spawn or the beacon;
//  2. reachable WITHOUT touching a spike, for each set of abilities a run can have (none, double
//     jump, + dash, + wall-cling): a search flies the astronaut with stepPlayer itself, choosing a
//     new input every 1/15 s (run left/right/still, press/hold/release/tap jump, dash, push into a
//     wall). With no abilities the exit, the rest beacon and the ability capsule must be reachable;
//     with all three, every star dust. Cracked rock counts as open once the search can reach it
//     with the blade (and it must be reachable without abilities);
//  3. no soft-locks: with every ability set, from every spot you can stand on (cracks broken or
//     not) the exit can still be reached;
//  4. the aliens behave: over many seeds and planet numbers, a ghost astronaut walks the route
//     while every alien runs its real AI — none gets wedged in rock or falls out of the world;
//  5. the guardians: in each lair a test pilot (who can't be hurt) fights the guardian at three
//     tiers over many seeds — it must stay in its arena and go down in reasonable time;
//  6. the vault: every star dust and treasure chest can be reached without abilities.
// --quick searches only "no abilities" and "all three". The searches run on worker threads.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { PLANETS, LAIRS, VAULT, parsePlanet, makePlayer, stepPlayer, atExit, dustTouched, touchesSpikes, touchesBeacon, touchesCapsule, tileAt, PlanetSim,
  stepFoe, foeBox, slashBox, abilSet, ABILITIES, loadoutFor, newRun, TILE, DT, PH, ROCK, SPIKE_UP, SPIKE_DOWN, AIR, isFloor } from './world.js';
import { guardianParts, GUARDIANS } from './guardians.js';

const ALL = [...PLANETS, ...Object.values(LAIRS), VAULT];
const byName = (n) => ALL.find((q) => q.name === n);
const HOLD = 8, HOLD_AIR = 8;                    // ticks per move (1/15 s), standing or in the air
const holdFor = (p) => (p.ground ? HOLD : HOLD_AIR);
const SETS = ['no abilities', 'double jump', 'double jump + dash', 'all three'];

// ── One search: every state reachable from the spawn with abilities `ab` ────
const NF = 20;                                    // fields per stored state (see load/save)
function search(m, ab, want = {}) {
  let cap = 1 << 19, S = new Float64Array(cap * NF), parent = new Int32Array(cap), move = new Int8Array(cap);
  const grow = () => {
    const S2 = new Float64Array(cap * 2 * NF); S2.set(S); S = S2;
    const p2 = new Int32Array(cap * 2); p2.set(parent); parent = p2;
    const m2 = new Int8Array(cap * 2); m2.set(move); move = m2;
    cap *= 2;
  };
  const p = makePlayer(m);
  const B = new Float64Array(NF);                 // the state being expanded
  const restore = () => {
    p.x = B[0]; p.y = B[1]; p.vx = B[2]; p.vy = B[3]; p.coyote = B[4]; p.buffer = B[5]; p.dashT = B[6]; p.dashCD = B[7]; p.dashBuf = B[8];
    p.wallCoy = B[9]; p.wjT = B[10]; p.face = B[11]; p.ground = B[12] === 1; p.jumpHeld = B[13] === 1; p.jumped = B[14] === 1;
    p.airJumps = B[15]; p.airDash = B[16] === 1; p.dashDir = B[17]; p.cling = B[18]; p.wallSide = B[19]; p.kbT = 0;
  };
  const save = (i) => {
    const o = i * NF;
    S[o] = p.x; S[o + 1] = p.y; S[o + 2] = p.vx; S[o + 3] = p.vy; S[o + 4] = p.coyote; S[o + 5] = p.buffer; S[o + 6] = p.dashT; S[o + 7] = p.dashCD;
    S[o + 8] = p.dashBuf; S[o + 9] = p.wallCoy; S[o + 10] = p.wjT; S[o + 11] = p.face; S[o + 12] = p.ground ? 1 : 0; S[o + 13] = p.jumpHeld ? 1 : 0;
    S[o + 14] = p.jumped ? 1 : 0; S[o + 15] = p.airJumps; S[o + 16] = p.airDash ? 1 : 0; S[o + 17] = p.dashDir; S[o + 18] = p.cling; S[o + 19] = p.wallSide;
  };
  // open-addressing hash: state key → index
  let hcap = 1 << 21, hk = new Float64Array(hcap).fill(-1), hv = new Int32Array(hcap), hn = 0;
  const slot = (k, cap2) => ((k % 1048573) * 40503 + Math.floor(k / 1048573) * 9973) % cap2;
  const hget = (k) => { let h = slot(k, hcap); while (hk[h] !== -1) { if (hk[h] === k) return hv[h]; h = (h + 1) & (hcap - 1); } return -1; };
  const hput = (k, v) => {
    if (++hn * 2 > hcap) {                        // rehash at half full
      const ok = hk, ov = hv; hcap *= 2; hk = new Float64Array(hcap).fill(-1); hv = new Int32Array(hcap);
      for (let i = 0; i < ok.length; i++) if (ok[i] !== -1) { let h = slot(ok[i], hcap); while (hk[h] !== -1) h = (h + 1) & (hcap - 1); hk[h] = ok[i]; hv[h] = ov[i]; }
    }
    let h = slot(k, hcap); while (hk[h] !== -1) h = (h + 1) & (hcap - 1); hk[h] = k; hv[h] = v;
  };
  // A state's key = where it is and how it moves (standing: 4 px cells; in the air: 6 px) × 16 + its
  // "spare" flags: 1 a jump still rising on a held button (can be cut short), 2 the second burst
  // unused, 4 the air dash unused, 8 the dash ready. A state with more spare flags can do all
  // a state with fewer can, so a new state is dropped when one that dominates it already exists.
  const Q = (v, q) => Math.round(v / q);
  const base = () => {
    const g = p.ground, kx = g ? Q(p.x, 4) : Q(p.x, 6) + 4096, ky = g ? Q(p.y, 4) : Q(p.y, 6);
    const kvx = Math.max(0, Math.min(18, Q(p.vx, 50) + 9)), kvy = Math.max(0, Math.min(13, Q(p.vy, 100) + 6));
    let k = ((kx * 512 + ky) * 19 + kvx) * 14 + kvy;
    if (ab.dash) k = k * 4 + (p.dashT > 0 ? Math.min(3, Math.ceil(p.dashT / 0.06)) : 0);
    if (ab.cling) k = k * 12 + (p.cling < 0 ? 1 : p.cling > 0 ? 2 : 0) * 4 + (p.wjT > 0 ? 2 : 0) + (p.wallCoy > 0 ? 1 : 0);
    return k;
  };
  const flags = () => (p.jumped && p.jumpHeld && p.vy < 0 ? 1 : 0) + (ab.double && p.airJumps > 0 ? 2 : 0) + (ab.dash && p.airDash ? 4 : 0) + (ab.dash && p.dashCD <= 0.05 ? 8 : 0);
  const USED = 1 | (ab.double ? 2 : 0) | (ab.dash ? 12 : 0);
  const SUPER = [];                                 // for each flag set, the strictly larger ones in use
  for (let f = 0; f < 16; f++) { SUPER.push([]); for (let g = 0; g < 16; g++) if (g !== f && (g & f) === f && (g & ~USED) === 0) SUPER[f].push(g); }
  const key = () => base() * 16 + flags();
  // moves: [dir, jump (0 release · 1 press & hold · 2 keep holding · 3 tap), dash]
  const MV = [];
  for (const d of [-1, 0, 1]) for (const j of [0, 1, 2, 3]) MV.push([d, j, 0]);
  for (const d of [-1, 1]) for (const j of [0, 2]) MV.push([d, j, 1]);
  const inp = { dir: 0, jumpPress: false, jumpHeld: false, dashPress: false };
  const mvList = new Int8Array(MV.length);
  const movesFor = () => {                        // only the choices that can make a difference from here
    let n = 0;
    const cut = p.jumped && p.jumpHeld && p.vy < 0;
    for (let i = 0; i < MV.length; i++) {
      const d = MV[i], j = d[1];
      if (d[2]) { if (ab.dash && p.dashT <= 0 && p.dashCD < 0.1 && (p.ground || p.airDash || p.cling) && (j === 0 || cut)) mvList[n++] = i; continue; }
      if (p.dashT > 0) { if ((j === 0 || j === 1) && (d[0] === 0 || p.dashT <= HOLD * DT)) mvList[n++] = i; continue; }   // steering only counts once the dash ends
      if (p.ground) { if (j !== 2) mvList[n++] = i; continue; }
      if (j === 2) { if (cut) mvList[n++] = i; continue; }
      if (j === 0) { mvList[n++] = i; continue; }
      // a press in the air: lands as a buffered jump, a second burst, or a wall jump (no taps up here:
      // press & hold, then release on a later move, covers them)
      if (j === 1 && (p.vy > 0 || (ab.double && p.airJumps > 0) || (ab.cling && (p.cling || p.wallCoy > 0)))) mvList[n++] = i;
    }
    return n;
  };

  for (let i = 0; i < 30; i++) stepPlayer(p, inp, m, ab);
  save(0); parent[0] = -1; move[0] = -1; hput(key(), 0);
  let N = 1;
  let succ = new Int32Array(1 << 22), nSucc = 0, succStart = new Int32Array(cap + 1);
  const goal = [], seenDust = new Uint8Array(m.dust.length), got = [];
  let beacon = -1, capsule = -1;
  const hittable = new Set();
  // cracked rock within blade reach of a state: the tiles' boxes, grown by the slash's reach
  const crackZones = m.cracks.map((k) => k.tiles.map(([c, r]) => [c * TILE - 31, r * TILE - 26, (c + 1) * TILE + 31, (r + 1) * TILE + PH + 22]));
  for (const t of m.chests) crackZones.push([[t.x - 10 - 31, t.y - 17 - 26, t.x + 10 + 31, t.y + PH + 22]]);   // treasure chests: ids after the cracks
  const dust = m.dust;
  // per tile (where the feet are): is a spike close enough to touch, which star dust is in reach
  const spikeNear = new Uint8Array(m.C * m.R), dustNear = Array.from({ length: m.C * m.R }, () => []);
  for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) {
    for (let rr = r - 2; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) { const k = tileAt(m, cc, rr); if (k === SPIKE_UP || k === SPIKE_DOWN) spikeNear[r * m.C + c] = 1; }
    dust.forEach((d, di) => { if (Math.abs(d.c - c) <= 1 && d.r >= r - 3 && d.r <= r + 1) dustNear[r * m.C + c].push(di); });
  }
  const cellOf = () => { const c = Math.floor(p.x / TILE), r = Math.floor((p.y - 1) / TILE); return c < 0 || r < 0 || c >= m.C || r >= m.R ? -1 : r * m.C + c; };
  for (let i = 0; i < N; i++) {
    for (let f = 0, o = i * NF; f < NF; f++) B[f] = S[o + f];
    restore();
    for (let ci = 0; ci < crackZones.length; ci++) {
      if (hittable.has(ci) || m.cracks[ci]?.open) continue;
      for (const z of crackZones[ci]) if (p.x > z[0] && p.x < z[2] && p.y > z[1] && p.y < z[3]) { hittable.add(ci); break; }
    }
    if (beacon < 0 && m.beacon && touchesBeacon(p, m)) beacon = i;
    if (capsule < 0 && m.capsule && touchesCapsule(p, m)) capsule = i;
    if (succStart.length < N + 2) { const g = new Int32Array(cap + 2); g.set(succStart); succStart = g; }
    succStart[i] = nSucc;
    const nm = movesFor();
    for (let q = 0; q < nm; q++) {
      const mi = mvList[q], mv = MV[mi];
      restore();
      let ok = true;
      got.length = 0;
      const hold = holdFor(p);
      for (let t = 0; t < hold; t++) {
        inp.dir = mv[0]; inp.jumpPress = t === 0 && (mv[1] === 1 || mv[1] === 3); inp.jumpHeld = mv[1] === 1 || mv[1] === 2 || (mv[1] === 3 && t < 2); inp.dashPress = t === 0 && mv[2] === 1;
        stepPlayer(p, inp, m, ab);
        const cell = cellOf();
        if (cell < 0 || (spikeNear[cell] && touchesSpikes(p, m))) { ok = false; break; }
        if ((t & 3) === 3) for (const di of dustNear[cell]) { const d = dust[di]; if (Math.abs(p.x - d.x) < 16 && d.y > p.y - PH - 9 && d.y < p.y + 9) got.push(di); }
      }
      if (!ok) continue;
      for (const d of got) seenDust[d] = 1;      // only dust touched on a move that never meets a spike
      const b0 = base() * 16, fl = flags();
      let j = hget(b0 + fl);
      if (j < 0) for (const g of SUPER[fl]) { j = hget(b0 + g); if (j >= 0) break; }
      if (j < 0) {
        const k = b0 + fl;
        if (N === cap) grow();
        j = N++; save(j); parent[j] = i; move[j] = mi; hput(k, j);
        if (m.exit && atExit(p, m)) goal.push(j);
      }
      if (nSucc === succ.length) { const g = new Int32Array(succ.length * 2); g.set(succ); succ = g; }
      succ[nSucc++] = j;
    }
    if (want.limit && N > want.limit) break;
  }
  if (succStart.length < N + 1) { const g = new Int32Array(N + 1); g.set(succStart); succStart = g; }
  succStart[N] = nSucc;

  // soft-locks: reverse search from the exit over the explored graph
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
  const cells = new Map();                        // standing cell → 1: some state there reaches the exit, 2: one doesn't
  for (let i = 0; i < N; i++) {
    const o = i * NF;
    if (S[o + 12] !== 1) continue;                // standing
    const ck = `${Math.floor(S[o] / TILE)},${Math.floor((S[o + 1] - 1) / TILE)}`;
    cells.set(ck, (cells.get(ck) || 0) | (can[i] ? 1 : 2));
  }
  const stuck = [...cells].filter(([, v]) => v === 2).map(([k]) => k);
  const standing = [...cells.keys()];
  const depth = (j) => { let d = 0; for (; j > 0; j = parent[j]) d++; return d; };
  let best = -1, bestD = 1e9;
  for (const g of goal) { const d = depth(g); if (d < bestD) { bestD = d; best = g; } }
  const chain = [];
  for (let j = best; j > 0; j = parent[j]) chain.push(move[j]);
  chain.reverse();
  return {
    N, goal: goal.length, best: best >= 0 ? chain : null, dust: [...seenDust], stuck, cells: cells.size, standing,
    beacon: beacon >= 0, capsule: capsule >= 0, hittable: [...hittable], MV,
  };
}

// ── The guardian test pilot: can't be hurt, goes for the weak spot with the blade and blaster ──
function fightTest(def, level, seed) {
  const run = newRun(); run.abil = 3;
  const sim = new PlanetSim(def, level, seed, loadoutFor(run));
  const a = sim.m.arena, p = sim.p, g = sim.boss;
  Object.assign(p, { x: a.x0 + 60, y: a.floorY, vx: 0, vy: 0, ground: true });
  const maxT = 240;
  let tick = 0, phase2 = false;
  for (; tick < maxT * 120; tick++) {
    p.inv = 1e9; p.pips = sim.lo.pips; p.hazard = 0;
    const I = { dir: 0, aim: 0, jumpPress: false, jumpHeld: false, slashPress: false, shootPress: false, dashPress: false };
    const weak = guardianParts(g).find((q) => q.weak);
    if (weak) {
      const tx = (weak.b[0] + weak.b[2]) / 2, ty = (weak.b[1] + weak.b[3]) / 2, dx = tx - p.x, dy = ty - (p.y - 15), w = (weak.b[2] - weak.b[0]) / 2;
      if (Math.abs(dx) > w + 14) I.dir = Math.sign(dx);
      else if (Math.abs(dx) < 6) I.dir = Math.sign(p.x - (a.x0 + a.x1) / 2) || 1;
      if (dy < -28) { I.jumpHeld = true; I.jumpPress = p.ground || (!p.ground && p.vy > -60 && p.airJumps > 0); I.aim = -1; }
      else if (dy > 24 && !p.ground) I.aim = 1;
      if (!p.atk) p.face = Math.sign(dx) || p.face;
      if (Math.abs(dx) < w + 34 && Math.abs(dy) < 60) I.slashPress = tick % 8 === 0;
      if (p.energy > 1 && (Math.abs(dy) < 16 || (dy < -40 && Math.abs(dx) < 10))) I.shootPress = tick % 24 === 0;
    } else I.dir = Math.sign((a.x0 + a.x1) / 2 - p.x) * (Math.abs((a.x0 + a.x1) / 2 - p.x) > 40 ? 1 : 0);
    sim.step(I);
    if (g.phase2) phase2 = true;
    if (!g.dead && g.state !== 'sleep' && (g.x < a.x0 - 8 || g.x > a.x1 + 8 || g.y < a.ceilY - 80 || g.y > a.floorY + 90)) return { ok: false, why: `left its arena at (${g.x | 0}, ${g.y | 0}) while "${g.state}"` };
    if (g.dead) return { ok: true, t: tick / 120, phase2, exit: sim.exitOpen && sim.fight === 'won' };
  }
  return { ok: false, why: `still standing after ${maxT}s (health ${g.hp.toFixed(1)}/${g.max}, "${g.state}")` };
}

// ── Workers and modes ────────────────────────────────────────
const arg = (k) => (process.argv.find((x) => x.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const BENCH = arg('bench');
if (isMainThread && BENCH) {                        // node check.mjs --bench=SET [--only=Name]: one search, no workers
  const set = +BENCH, name = arg('only') || PLANETS[0].name;
  const pl = byName(name), t0 = Date.now();
  const r = search(parsePlanet(pl), abilSet(set), {});
  console.log(`${name}, ${SETS[set]}: ${r.N.toLocaleString('en-GB')} states in ${((Date.now() - t0) / 1000).toFixed(1)}s · exit ${r.goal ? 'yes' : 'NO'} · dust ${r.dust.filter(Boolean).length}/${r.dust.length} · beacon ${r.beacon} · capsule ${r.capsule} · cracks ${r.hittable} · stuck ${r.stuck.length}/${r.cells}`);
  process.exit(0);
}
if (isMainThread && (arg('print') || arg('maps-json'))) {
  if (arg('print')) { const pl = byName(arg('print')); if (!pl) { console.log('no map called ' + arg('print')); process.exit(1); } pl.rows.forEach((r, i) => console.log(String(i).padStart(2) + ' ' + r)); }
  if (arg('maps-json')) (await import('node:fs')).writeFileSync(arg('maps-json'), JSON.stringify(Object.fromEntries(ALL.map((q) => [q.name, q.rows]))));
  process.exit(0);
}
if (!isMainThread) {
  const { planet, set, open } = workerData;
  const t0 = Date.now();
  const r = search(parsePlanet(byName(planet), { openCracks: open }), abilSet(set), {});
  parentPort.postMessage({ planet, set, open, r, secs: (Date.now() - t0) / 1000 });
} else if (!BENCH) {
  const SHOW = process.argv.includes('--show'), QUICK = process.argv.includes('--quick'), only = arg('only');
  let bad = 0;
  const fail = (msg) => { console.log('  ✗ ' + msg); bad++; };
  const todo = [], seen = new Set();
  for (const pl of ALL) {
    if (only && pl.name !== only) continue;
    if (seen.has(pl.rows)) continue;
    seen.add(pl.rows); todo.push(pl);
  }
  // explore planets: no abilities with the cracked rock intact, then every ability set with it broken.
  // lairs: no abilities (gate open). The vault: no abilities.
  const SETS_RUN = QUICK ? [0, 3] : [0, 1, 2, 3];
  const jobs = todo.flatMap((pl) => (pl.kind === 'arena' || pl.kind === 'vault') ? [{ planet: pl.name, set: 0, open: false }]
    : [{ planet: pl.name, set: 0, open: false }, ...SETS_RUN.map((set) => ({ planet: pl.name, set, open: true }))]);
  jobs.sort((x, y) => y.set - x.set);              // the big searches first, so the pool stays busy
  const results = new Map();
  await new Promise((done) => {
    let next = 0, running = 0;
    const pump = () => {
      if (next >= jobs.length && !running) return done();
      while (running < Math.max(1, os.cpus().length) && next < jobs.length) {
        const job = jobs[next++]; running++;
        const w = new Worker(new URL(import.meta.url), { workerData: job });
        w.once('message', (r) => results.set(`${r.planet}|${r.set}|${r.open}`, r));
        w.once('error', (e) => { results.set(`${job.planet}|${job.set}|${job.open}`, { error: String(e) }); });
        w.once('exit', () => { running--; pump(); });
      }
    };
    pump();
  });

  for (const pl of todo) {
    const m = parsePlanet(pl), kind = m.kind;
    const errs0 = bad;
    const shared = ALL.filter((q) => q !== pl && q.rows === pl.rows).map((q) => q.name);
    console.log(`${pl.name} (${m.C}×${m.R}${kind === 'explore' ? '' : ', ' + (kind === 'arena' ? GUARDIANS[pl.boss].name + "'s lair" : 'bonus round')})${shared.length ? ` — same map as ${shared.join(', ')} (only the colours differ)` : ''}`);

    // ── 1. well-formed ─────────────────────────────────────────
    const under = (x, y) => tileAt(m, Math.floor(x / TILE), Math.floor((y + 1) / TILE));
    if (!isFloor(under(m.spawn.x, m.spawn.y))) fail('spawn is not standing on rock or a ledge');
    if (m.exit && !isFloor(under(m.exit.x, m.exit.y))) fail('exit beacon is not standing on rock or a ledge');
    if (m.beacon && tileAt(m, m.beacon.c, m.beacon.r + 1) !== ROCK) fail('rest beacon is not standing on rock');
    if (kind !== 'vault' && !m.beacon) fail('no rest beacon (B)');
    if (kind === 'explore' && !m.capsule) fail('no ability capsule (A)');
    for (const t of m.chests) if (!isFloor(tileAt(m, t.c, t.r + 1))) fail(`treasure chest at col ${t.c}, row ${t.r} is not standing on anything`);
    for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) {
      const k = tileAt(m, c, r);
      if (k === SPIKE_UP && tileAt(m, c, r + 1) !== ROCK) fail(`floor spikes at col ${c}, row ${r} have no rock under them`);
      if (k === SPIKE_DOWN && tileAt(m, c, r - 1) !== ROCK) fail(`ceiling spikes at col ${c}, row ${r} have no rock above them`);
    }
    const sc = Math.floor(m.spawn.x / TILE), sr = Math.floor((m.spawn.y - 1) / TILE);
    for (const s of m.slots) {
      const where = `${s.type} slot at col ${s.c}, row ${s.r}`;
      if (Math.hypot(s.c - sc, s.r - sr) < 5) fail(`${where} is within 5 tiles of the spawn`);
      if (m.beacon && Math.hypot(s.c - m.beacon.c, s.r - m.beacon.r) < 5) fail(`${where} is within 5 tiles of the rest beacon`);
      if (s.type === 'ground') {
        let r = s.r; while (r < m.R - 1 && tileAt(m, s.c, r + 1) === AIR) r++;
        if (!isFloor(tileAt(m, s.c, r + 1)) || r - s.r > 1) fail(`${where} has no floor right under it`);
        if (tileAt(m, s.c - 1, r + 1) === AIR && tileAt(m, s.c + 1, r + 1) === AIR) fail(`${where} stands on a single tile`);
      } else if (s.type === 'air') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (tileAt(m, s.c + dc, s.r + dr) !== AIR) fail(`${where} has no room to hover (3×3 air needed)`);
      } else if (![[0, 1], [0, -1], [-1, 0], [1, 0]].some(([dc, dr]) => tileAt(m, s.c + dc, s.r + dr) === ROCK)) fail(`${where} has no rock to root on`);
    }
    if (kind === 'arena') {
      const A = m.arena, wTiles = (A.x1 - A.x0) / TILE;
      if (wTiles > 13.3) fail(`the arena is ${wTiles} tiles wide: more than fits on screen (13)`);
      if ((A.floorY - A.ceilY) / TILE < 8) fail('the arena is under 8 tiles tall');
      if (m.exit && (m.exit.x < A.x0 || m.exit.x > A.x1)) fail('the exit beacon is not inside the arena');
    }

    // ── 2–3. the searches ─────────────────────────────────────
    const lines = [], dustBy = [];
    let route = null;
    const closed = results.get(`${pl.name}|0|false`);
    if (!closed || closed.error) fail(`search with no abilities failed: ${closed?.error || 'no result'}`);
    else {
      const a = closed.r;
      if (m.exit && !a.goal) fail(`with no abilities${m.cracks.length ? ' and the cracked rock intact' : ''}, the exit cannot be reached (${a.N} states searched)`);
      if (m.exit && a.stuck.length) fail(`with no abilities${m.cracks.length ? ' and the cracked rock intact' : ''}: soft-lock — from ${a.stuck.length} standing spot(s) the exit can't be reached: ${a.stuck.slice(0, 8).join(' · ')}`);
      if (m.beacon && !a.beacon) fail('the rest beacon cannot be reached without abilities');
      if (m.capsule && !a.capsule) fail('the ability capsule cannot be reached without abilities');
      m.cracks.forEach((k, ci) => { if (!a.hittable.includes(ci)) fail(`cracked rock at col ${k.tiles[0][0]}, row ${k.tiles[0][1]} can't be reached with the blade without abilities`); });
      m.chests.forEach((t, i) => { if (!a.hittable.includes(m.cracks.length + i)) fail(`treasure chest at col ${t.c}, row ${t.r} can't be reached without abilities`); });
      if (kind === 'vault') m.dust.forEach((d, i) => { if (!a.dust[i]) fail(`vault star dust at col ${d.c}, row ${d.r} can't be reached without abilities`); });
      route = a.best ? { chain: a.best, MV: a.MV } : null;
      lines.push(`${kind === 'explore' ? 'cracked rock intact: ' : 'no abilities: '}${a.dust.filter(Boolean).length}/${m.dust.length} star dust · ${a.N.toLocaleString('en-GB')} states · ${closed.secs.toFixed(0)}s`);
    }
    if (kind === 'explore') {
      for (const set of SETS_RUN) {
        const res = results.get(`${pl.name}|${set}|true`);
        if (!res || res.error) { fail(`search with ${SETS[set]} failed: ${res?.error || 'no result'}`); continue; }
        const a = res.r;
        dustBy[set] = a.dust;
        if (!a.goal) fail(`with ${SETS[set]}: the exit cannot be reached (${a.N} states searched)`);
        if (a.stuck.length) fail(`with ${SETS[set]}: soft-lock — from ${a.stuck.length} standing spot(s) the exit can't be reached: ${a.stuck.slice(0, 8).join(' · ')}`);
        lines.push(`${SETS[set]}: ${a.dust.filter(Boolean).length}/${m.dust.length} star dust · ${a.N.toLocaleString('en-GB')} states · ${res.secs.toFixed(0)}s`);
        if (set === 3) for (let i = 0; i < m.dust.length; i++) if (!a.dust[i]) fail(`star dust at col ${m.dust[i].c}, row ${m.dust[i].r} cannot be reached even with all three abilities`);
      }
      if (!QUICK && dustBy.length === 4) {
        const gated = m.dust.map((d, i) => [d, dustBy.findIndex((ds) => ds[i])]).filter(([, s]) => s > 0);
        if (gated.length) lines.push(`needs ${ABILITIES.map((ab, k) => `${ab}: ${gated.filter(([, s]) => s === k + 1).length}`).join(' · ')}`);
      }
    }

    // ── 4. aliens: real AI, ghost astronaut walking the route, many seeds × planet numbers ──
    let runs = 0, worst = '';
    const kinds = {};
    if (route && m.slots.length) {
      const pts = [];
      const p = makePlayer(m);
      for (let i = 0; i < 30; i++) stepPlayer(p, { dir: 0, jumpPress: false, jumpHeld: false }, m);
      pts.push([p.x, p.y]);
      for (const mi of route.chain) {
        const mv = route.MV[mi], hold = holdFor(p);
        for (let t = 0; t < hold; t++) {
          stepPlayer(p, { dir: mv[0], jumpPress: t === 0 && (mv[1] === 1 || mv[1] === 3), jumpHeld: mv[1] === 1 || mv[1] === 2 || (mv[1] === 3 && t < 2), dashPress: false }, m);
          pts.push([p.x, p.y]);
        }
      }
      if (!atExit(p, m)) fail('the route found by the search does not reach the exit when replayed');
      for (let level = 1; level <= 12; level++) for (let seed = 1; seed <= 16; seed++) {
        const sim = new PlanetSim(pl, level, seed * 7919 + level);
        runs++;
        for (const f of sim.foes) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
        const T = Math.max(pts.length, 120 * 25);
        for (let t = 0; t < T; t++) {
          const [x, y] = pts[Math.min(pts.length - 1, Math.floor(t * pts.length / T))];
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
      lines.unshift(`exit reachable in ≈${((pts.length - 1) * DT).toFixed(1)}s of play with no abilities`);
    }
    const mix = Object.entries(kinds).map(([k, n]) => `${k} ${(n / runs).toFixed(1)}`).join(', ');
    if (runs) lines.push(`aliens sane over ${runs} runs (avg per planet: ${mix})`);

    // ── 5. the guardian ───────────────────────────────────────
    if (kind === 'arena') {
      const n0 = ['matriarch', 'jelly', 'wyrm'].indexOf(pl.boss) + 1, times = [];
      for (const tier of [0, 1, 2]) for (let seed = 1; seed <= 8; seed++) {
        const level = (n0 + tier * 3) * 5;
        const r = fightTest(pl, level, seed * 104729 + level);
        if (!r.ok) { fail(`${GUARDIANS[pl.boss].name}, tier ${tier} (planet ${level}), seed ${seed}: ${r.why}`); break; }
        if (!r.phase2) fail(`${GUARDIANS[pl.boss].name}, planet ${level}: never reached its second phase`);
        if (!r.exit) fail(`${GUARDIANS[pl.boss].name}, planet ${level}: the exit didn't open when it fell`);
        times.push([tier, r.t]);
      }
      const avg = (tr) => { const v = times.filter(([t]) => t === tr).map(([, s]) => s); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(0) + 's' : '–'; };
      lines.push(`test pilot beat the ${GUARDIANS[pl.boss].name} ${times.length}/24 times (avg ${avg(0)} · ${avg(1)} · ${avg(2)} at tiers 0 · 1 · 2)`);
    }
    console.log(`  ${bad === errs0 ? '✓' : '✗'} ` + lines.join('\n    '));
    if (SHOW && route) { const names = route.MV.map(([d, j, ds]) => '←·→'[d + 1] + '-HhT'[j] + (ds ? 'D' : '')); console.log('  ' + route.chain.map((mi) => names[mi]).join(' ')); }
  }
  const DUMP = arg('dump');
  if (DUMP) {                                       // for map previews: what each search could stand on and collect
    const out = {};
    for (const [k, r] of results) if (r.r) { const [pl, set, open] = k.split('|'); (out[pl] ||= {})[open === 'true' ? set : (results.has(`${pl}|0|true`) ? 'closed' : '0')] = { standing: r.r.standing, dust: r.r.dust, stuck: r.r.stuck }; }
    (await import('node:fs')).writeFileSync(DUMP, JSON.stringify(out));
  }
  process.exit(bad ? 1 : 0);
}

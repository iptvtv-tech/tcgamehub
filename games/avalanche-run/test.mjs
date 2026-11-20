// node games/avalanche-run/test.mjs
// Plays the real Avalanche Run headless (tools/lib/headless.mjs) and proves:
//   1 · every run can be finished after a real mistake: the benchmark's rider steers into a tree
//       (a tumble), carries on and reaches the hut, with the rules checked after every step
//       (on the slope, under top speed, the avalanche never ahead of the sled)
//   2 · a tumble costs ground, never a life: straight after one the sled is slow, cannot steer
//       for a moment, and nothing else can knock it down for 1.5 s
//   3 · the avalanche costs exactly one life, and puts you back on clear snow 55 m ahead of it:
//       at the start line, or at the flag once you have passed it
//   4 · a rider who aims at every tree is caught by the avalanche again and again (it is a real
//       threat), and after three lives lost that way a careful rider still reaches the hut
//   5 · the crystal rushes (runs 5 and 10) cannot be lost and end on their timer
//   6 · ramps and tricks: a ramp throws the sled as far as the rules say; one full spin, let go,
//       lands clean with a burst of speed; half a spin lands sideways and is a tumble (no life
//       lost); a grab counts as a trick
//   7 · crevasses: riding into one costs exactly one life; the ramp at its edge carries the sled
//       over; so does a jump at the last moment
//   8 · a jump clears a rock that would otherwise be a tumble (and never a tree)
//   9 · ice wolves: a bite takes speed, never a tumble or a life, and no second bite follows
//       within 2.5 s; steering into a wolf that is not lunging knocks it down; steering away
//       from a crouching wolf dodges its lunge
//  10 · yetis: riding straight on under a thrown boulder is a tumble, stepping off the ring is
//       not; riding into a yeti is a tumble; jumping onto one flattens it and bounces the sled
//  11 · rolling boulders: a tumble if you meet one, clear snow ahead of it and behind it
//  12 · mercy: a tree you crashed into does not knock you down a second time; every life lost on
//       a run puts the avalanche 15 m further back at the restart; a wolf pack does not return
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';
import { HALF, PR, START_GAP, MERCY_GAP, SAFE_T, TUMBLE_V, BITE, BITE_SAFE, lineAt, flight, BONUS_LEVELS, FINAL_LEVEL } from './world.js';

const G = await loadGame('avalanche-run');
const B = (await import('./bench.mjs')).default;
const t = reporter('avalanche-run');

// ── 1 · every run, after a real mistake ──
let runs = 0, tumbles = 0;
for (let level = 1; level <= FINAL_LEVEL; level++) {
  if (BONUS_LEVELS.includes(level)) continue;
  for (const seed of [1, 2]) {
    const r = botPlay(G, B, { level, seed });
    runs++; tumbles += r.shell.game.sim.tumbles;
    t.check(r.cleared, `run ${level} seed ${seed}: ${why(r)}`);
    t.check(r.mistakeMade, `run ${level} seed ${seed}: the rider never managed to hit a tree (no mistake was made)`);
  }
}

// ── 2 · a tumble costs ground, not a life ──
for (const level of [1, 8, 15]) {
  const s = G.start({ seed: 3, level }), g = s.game, b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
  let hit = false;
  for (let i = 0; i < 60 / STEP && !hit; i++) { if (s.state === 'playing') hit = B.mistake(g, s, b); s.tick(); }
  if (!t.check(hit && g.sim.tumbles === 1, `run ${level}: steering at the nearest tree for 60 s never caused a tumble`)) continue;
  t.check(s.livesLost === 0 && s.state === 'playing', `run ${level}: a tumble cost a life`);
  const p = g.sim.p, x0 = p.x;
  s.hold(['left']); s.run(0.3);
  t.check(p.v < TUMBLE_V + 2, `run ${level}: 0.3 s into a tumble the sled still rides at ${p.v.toFixed(1)} m/s`);
  t.check(p.tumble > 0, `run ${level}: the tumble was over after 0.3 s`);
  // for the rest of the safe time nothing else knocks it down, wherever it slides
  s.run(SAFE_T - 0.4);
  t.check(g.sim.tumbles === 1, `run ${level}: a second tumble followed within ${SAFE_T} s of the first`);
  void x0;
}

// ── 3 · the avalanche takes one life and sets you back on clear snow ──
for (const [level, pastFlag] of [[1, false], [6, true], [15, true]]) {
  const s = G.start({ seed: 2, level, unlimited: true }), g = s.game, sim = g.sim, b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
  if (pastFlag) { for (let i = 0; i < 200 / STEP && !sim.flagged; i++) { if (s.state === 'playing') B.bot(g, s, b); s.tick(); } t.check(sim.flagged, `run ${level}: the rider never reached the flag`); }
  // stop steering and let the snow come: tumble into things until it arrives
  const lost0 = s.livesLost;
  for (let i = 0; i < 240 / STEP && s.livesLost === lost0; i++) { if (s.state === 'playing') B.mistake(g, s, b); s.tick(); }
  if (!t.check(s.livesLost === lost0 + 1, `run ${level}: riding into every tree for 240 s, the avalanche never came`)) continue;
  s.hold([]); s.run(4, () => s.state === 'playing');
  const p = g.sim.p, z0 = pastFlag ? g.slope.flagZ : 0;
  t.check(s.state === 'playing' && s.livesLost === lost0 + 1, `run ${level}: after the avalanche the game is ${s.state} with ${s.livesLost - lost0} lives lost (should be playing, 1)`);
  t.check(Math.abs(p.z - z0) < 2 && Math.abs(p.x - lineAt(g.slope.knots, z0)) < 0.5, `run ${level}: restarted at z=${p.z.toFixed(0)}, not at ${pastFlag ? 'the flag' : 'the start line'} (z=${z0})`);
  t.check(g.sim.gap > START_GAP - 3, `run ${level}: restarted only ${g.sim.gap.toFixed(0)} m ahead of the avalanche (should be ${START_GAP})`);
  // and 3 s of riding straight on from there hits nothing
  const before = g.sim.tumbles; s.hold([]); s.run(1.2);
  t.check(g.sim.tumbles === before, `run ${level}: a tree stands right where you restart`);
}

// ── 4 · a rider who aims at every tree is caught again and again, and can still finish afterwards ──
{
  const s = G.start({ seed: 5, level: 9, unlimited: true }), g = s.game, b = { skill: 1, rand: () => 0.5, t: 0, level: 9, mem: {} };
  let bad = null;
  for (let i = 0; i < 600 / STEP && !s.cleared && !bad; i++) {
    if (s.state === 'playing') { if (s.livesLost < 3) B.mistake(g, s, b); else B.bot(g, s, b); }
    s.tick();
    if (s.state === 'playing') bad = B.invariants(g, s);
  }
  t.check(!bad, `run 9, a rider who aims at every tree: rule broken — ${bad}`);
  t.check(s.livesLost >= 3, `run 9: a rider who aims at every tree lost only ${s.livesLost} lives in 600 s (the avalanche is no threat)`);
  t.check(s.cleared === 1, `run 9: after three lives lost to the avalanche, a careful rider could not reach the hut (${s.livesLost} lives lost, z=${g.sim.p.z.toFixed(0)} of ${g.slope.len})`);
}

// ── 5 · the crystal rushes ──
for (const level of BONUS_LEVELS) {
  const s = G.start({ seed: 1, level }), g = s.game, b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
  let bad = null;
  for (let i = 0; i < 40 / STEP && !s.cleared && !bad; i++) { if (s.state === 'playing') B.bot(g, s, b); s.tick(); if (s.state === 'playing') bad = B.invariants(g, s) || (Math.abs(g.sim.p.x) > HALF - PR + 1e-6 ? 'off the slope' : null); }
  t.check(!bad, `run ${level} (crystal rush): rule broken — ${bad}`);
  t.check(s.cleared === 1 && s.livesLost === 0, `run ${level} (crystal rush): ${s.cleared ? '' : 'did not end on its timer; '}${s.livesLost} lives lost`);
  t.check(g.slope.crystals.filter((c) => c.got).length >= 60, `run ${level} (crystal rush): the rider collected only ${g.slope.crystals.filter((c) => c.got).length} crystals in 20 s`);
}

// Put the sled somewhere on the slope at cruising speed (a rules test: the ride there is covered above).
const place = (g, x, z) => { const sim = g.sim, p = sim.p; Object.assign(p, { x, z, v: sim.R.cruise, vx: 0, tumble: 0, safe: 0, y: 0, vy: 0, air: '', rot: 0, grab: 0, boost: 0 }); sim.az = z - START_GAP; sim.i0 = 0; };

// ── 6 · ramps and tricks ──
for (const level of [2, 9, 14]) {
  const fly = (keys, secs) => {            // ride over the first plain ramp; hold `keys` for `secs` once in the air
    const s = G.start({ seed: 4, level }), g = s.game, rp = g.slope.ramps.find((r) => !r.crev);
    place(g, rp.x, rp.z - 6);
    const p = g.sim.p; let t = 0, flew = false, far = 0, top = 0, landed = false;
    for (let i = 0; i < 6 / STEP && !landed; i++) {
      s.hold(p.air === 'ramp' && t < secs ? keys : []);
      s.tick();
      if (p.air === 'ramp') { flew = true; t += STEP; top = Math.max(top, p.y); far = p.z - rp.z; } else if (flew) landed = true;
    }
    s.hold([]); s.run(0.6);
    return { s, g, p, rp, flew, far, top, boost: p.boost, tumbles: g.sim.tumbles };
  };
  const plain = fly([], 0), want = flight(plain.g.sim.R.cruise);
  if (!t.check(plain.flew, `run ${level}: riding over a ramp did not throw the sled`)) continue;
  t.check(Math.abs(plain.far - want) < 3 && plain.top > 3, `run ${level}: the ramp threw the sled ${plain.far.toFixed(0)} m and ${plain.top.toFixed(1)} m high (the rules say ${want.toFixed(0)} m)`);
  t.check(plain.tumbles === 0 && plain.boost === 0 && plain.s.livesLost === 0, `run ${level}: a plain flight ended with ${plain.tumbles} tumbles, boost ${plain.boost.toFixed(1)}`);
  const spin = fly(['right'], 0.49);
  t.check(spin.tumbles === 0 && spin.boost > 0, `run ${level}: one full spin, let go, did not land clean (${spin.tumbles} tumbles, boost ${spin.boost.toFixed(1)})`);
  t.check(spin.p.v > spin.g.sim.R.cruise * 1.05, `run ${level}: 0.6 s after a clean trick landing the sled rides at ${spin.p.v.toFixed(1)} m/s, no faster than cruising (${spin.g.sim.R.cruise.toFixed(1)})`);
  const half = fly(['left'], 0.24);
  t.check(half.tumbles === 1 && half.s.livesLost === 0 && half.boost === 0, `run ${level}: half a spin should land sideways: ${half.tumbles} tumbles, ${half.s.livesLost} lives lost`);
  const grab = fly(['down'], 0.7);
  t.check(grab.tumbles === 0 && grab.boost > 0, `run ${level}: a grab did not count as a trick (${grab.tumbles} tumbles, boost ${grab.boost.toFixed(1)})`);
}

// ── 7 · crevasses ──
for (const level of [6, 11, 15]) {
  const cross = (how) => {
    const s = G.start({ seed: 3, level, unlimited: true }), g = s.game, c = g.slope.crevasses[0], rp = g.slope.ramps.find((r) => r.crev && Math.abs(r.z - c.z) < 2);
    place(g, how === 'ramp' ? rp.x : rp.x + (rp.x > 0 ? -1 : 1) * (rp.w + 2.5), c.z - 25);
    const p = g.sim.p;
    for (let i = 0; i < 5 / STEP && s.livesLost === 0 && p.z < c.z + c.len + 20; i++) { s.hold(how === 'jump' && c.z - p.z < 1.2 && c.z > p.z ? ['up'] : []); s.tick(); }
    return { s, g, p, c };
  };
  const fall = cross('ride');
  t.check(fall.s.livesLost === 1, `run ${level}: riding straight into a crevasse cost ${fall.s.livesLost} lives (should be 1)`);
  fall.s.hold([]); fall.s.run(4, () => fall.s.state === 'playing');
  t.check(fall.s.state === 'playing' && fall.g.sim.p.z < fall.c.z - 40 && fall.g.sim.gap > START_GAP - 3, `run ${level}: after a fall into a crevasse the restart is at z=${fall.g.sim.p.z.toFixed(0)}, ${fall.g.sim.gap.toFixed(0)} m ahead of the avalanche`);
  for (const how of ['ramp', 'jump']) { const r = cross(how); t.check(r.s.livesLost === 0 && r.p.z > r.c.z + r.c.len, `run ${level}: crossing a crevasse by ${how === 'ramp' ? 'its ramp' : 'a jump at the edge'} failed (${r.s.livesLost} lives lost, z=${r.p.z.toFixed(0)}, crevasse ${r.c.z.toFixed(0)}–${(r.c.z + r.c.len).toFixed(0)})`); }
}

// ── 8 · a jump clears a rock, never a tree ──
for (const level of [3, 12]) {
  const over = (kind, jump) => {
    const s = G.start({ seed: 6, level }), g = s.game;
    const o = g.slope.obstacles.find((q) => q.kind === kind && q.z > 80 && !g.slope.obstacles.some((w) => w !== q && Math.abs(w.z - q.z) < 14 && Math.abs(w.x - q.x) < 2.5) && !g.slope.ramps.some((r) => Math.abs(r.z - q.z) < 20));
    place(g, o.x, o.z - 12);
    for (let i = 0; i < 1.2 / STEP && g.sim.p.z < o.z + 2; i++) { s.hold(jump && o.z - g.sim.p.z < 6 && o.z > g.sim.p.z ? ['up'] : []); s.tick(); }
    return g.sim.tumbles;
  };
  t.check(over('rock', false) === 1, `run ${level}: riding straight into a rock was not a tumble`);
  t.check(over('rock', true) === 0, `run ${level}: a jump 6 m before a rock did not clear it`);
  t.check(over('tree', true) === 1, `run ${level}: a jump carried the sled over a tree`);
}

// An empty slope with only the creatures on it (rules tests: everything else is covered above).
const bare = (level, seed, keep = () => false) => {
  const s = G.start({ seed, level, unlimited: true }), g = s.game, sl = g.slope;
  sl.obstacles = sl.obstacles.filter(keep); sl.ramps.length = 0; sl.crevasses.length = 0; sl.crystals.length = 0;
  return { s, g, sim: g.sim, p: g.sim.p, sl };
};

// ── 9 · ice wolves ──
for (const level of [4, 9, 14]) {
  const meet = (steer) => {               // ride to the first pack; steer(w, p) → keys once a wolf is beside the sled
    const { s, g, sim, p, sl } = bare(level, 7);
    sl.rollers.length = 0;
    place(g, 0, sl.packs[0].z - 5);
    const out = { bites: 0, vBefore: 0, vAfter: 0, gapBites: 9, lunges: 0, s, sim };
    let lastBite = -9, was = 0;
    for (let i = 0; i < 14 / STEP; i++) {
      const live = sim.wolves.filter((q) => q.state !== 'gone' && q.state !== 'down' && q.state !== 'away'), w = live.find((q) => q.state === 'crouch' || q.state === 'lunge') || live.find((q) => Math.abs(q.dz) < 1.6) || live[0], v = p.v;
      s.hold(w ? steer(w, p) : []);
      s.tick();
      if (p.bitten > was + 1) { out.bites++; if (out.bites === 1) { out.vBefore = v; out.vAfter = p.v; } out.gapBites = Math.min(out.gapBites, i * STEP - lastBite); lastBite = i * STEP; }
      was = p.bitten;
    }
    out.lunges = sim.wolves.reduce((n, q) => n + q.lunges, 0) + 0;
    return out;
  };
  const still = meet(() => []);
  if (!t.check(still.bites >= 1, `run ${level}: a sled that never steers was not bitten by the wolves in 14 s`)) continue;
  t.check(still.sim.tumbles === 0 && still.s.livesLost === 0, `run ${level}: wolf bites cost ${still.sim.tumbles} tumbles and ${still.s.livesLost} lives (should be none)`);
  t.check(still.vAfter < still.vBefore * 0.75 && still.vAfter >= Math.min(still.vBefore * BITE, still.sim.R.cruise * 0.5) - 0.5, `run ${level}: a bite took the sled from ${still.vBefore.toFixed(1)} to ${still.vAfter.toFixed(1)} m/s`);
  t.check(still.gapBites >= BITE_SAFE - 0.05, `run ${level}: two bites came ${still.gapBites.toFixed(2)} s apart (no bite within ${BITE_SAFE} s of the last)`);
  const knock = meet((w, p) => (w.state !== 'lunge' && Math.abs(w.dz) < 1.6 ? [w.x > p.x ? 'right' : 'left'] : []));
  t.check(knock.sim.knocks >= 1, `run ${level}: steering into the wolves knocked none of them down`);
  const dodge = meet((w, p) => (w.state === 'crouch' || w.state === 'lunge' ? [w.x > p.x ? 'left' : 'right'] : Math.abs(p.x) < 1 ? [] : [p.x > 0 ? 'left' : 'right']));   // away from a crouching wolf, back to the middle between lunges
  t.check(dodge.bites === 0, `run ${level}: steering away from every crouching wolf, the sled was still bitten ${dodge.bites} times`);
}

// ── 10 · yetis ──
for (const level of [7, 12]) {
  const visit = (plan) => {
    const { s, g, sim, p, sl } = bare(level, 9, (o) => o.kind === 'yeti');
    sl.packs.length = 0; sl.rollers.length = 0;
    const o = sl.obstacles[0];
    place(g, plan === 'into' || plan === 'stomp' ? o.x : Math.max(-HALF + 2, Math.min(HALF - 2, o.x + (o.x > 0 ? -5 : 5))), o.z - 75);
    let by = '', thrown = 0;
    const seen = new Set();
    for (let i = 0; i < 6 / STEP && p.z < o.z + 8; i++) {
      const b = sim.boulders.find((q) => q.kind === 'snow' && q.t > 0);
      for (const q of sim.boulders) if (!seen.has(q)) { seen.add(q); thrown++; }
      let keys = [];
      if (plan === 'dodge' && b) keys = [b.x >= p.x ? 'left' : 'right'];
      if (plan === 'into' || plan === 'stomp') { const dx = o.x - p.x; keys = Math.abs(dx) < 0.3 ? [] : [dx > 0 ? 'right' : 'left']; if (b && o.z - p.z > 30) keys = [b.x >= p.x ? 'left' : 'right']; }
      if (plan === 'stomp' && o.z - p.z < p.v * 0.28 && o.z > p.z) keys.push('up');
      const t0 = sim.tumbles;
      s.hold(keys); s.tick();
      if (sim.tumbles > t0 && !by) by = Math.abs(p.z - o.z) < 2.5 ? 'yeti' : 'boulder';
    }
    return { by, thrown, o, sim, p, s };
  };
  const straight = visit('straight');
  if (!t.check(straight.thrown >= 1, `run ${level}: the yeti threw nothing at a sled riding past`)) continue;
  t.check(straight.by === 'boulder', `run ${level}: riding straight on under a yeti's boulders ended with ${straight.by || 'no tumble'}`);
  const dodge = visit('dodge');
  t.check(dodge.sim.tumbles === 0, `run ${level}: stepping off every ring, the sled still tumbled (${dodge.by})`);
  const into = visit('into');
  t.check(into.by === 'yeti' && into.s.livesLost === 0, `run ${level}: riding into a yeti: ${into.by || 'no tumble'}, ${into.s.livesLost} lives lost`);
  const stomp = visit('stomp');
  t.check(stomp.o.flat && stomp.by !== 'yeti', `run ${level}: jumping onto a yeti did not flatten it (${stomp.by || 'no tumble'})`);
}

// ── 11 · rolling boulders ──
{
  let hit = 0, clean = 0;
  for (let x = -10; x <= 10; x += 2) {
    const { s, g, sim, p, sl } = bare(12, 11);
    sl.packs.length = 0; sl.rollers.length = 1;
    place(g, x, sl.rollers[0].z - 100);
    for (let i = 0; i < 6 / STEP && p.z < sl.rollers[0].z + 40; i++) { s.hold([]); s.tick(); }
    if (sim.tumbles) hit++; else clean++;
    t.check(s.livesLost === 0, 'run 12: a rolling boulder cost a life');
  }
  t.check(hit >= 1 && clean >= 4, `run 12: of 11 straight lines past a rolling boulder, ${hit} met it and ${clean} were clear (expected some of each)`);
}

// ── 12 · mercy ──
{
  const s = G.start({ seed: 6, level: 12, unlimited: true }), g = s.game;
  const o = g.slope.obstacles.find((q) => q.kind === 'tree' && q.z > 80 && !g.slope.obstacles.some((w) => w !== q && Math.abs(w.z - q.z) < 14 && Math.abs(w.x - q.x) < 3));
  const ride = () => { place(g, o.x, o.z - 8); const t0 = g.sim.tumbles; for (let i = 0; i < 0.8 / STEP && g.sim.p.z < o.z + 1; i++) { s.hold([]); s.tick(); } return g.sim.tumbles - t0; };
  t.check(ride() === 1, 'run 12: riding into a tree was not a tumble');
  s.run(SAFE_T + 0.2);
  t.check(ride() === 0, 'run 12: a tree that was already crashed into knocked the sled down again');
  // each life lost sets the avalanche further back
  const gaps = [];
  for (let k = 0; k < 3; k++) { g.sim.az = g.sim.p.z - 1; s.hold([]); s.run(1, () => s.livesLost > k); s.run(4, () => s.state === 'playing'); gaps.push(g.sim.gap); }
  t.check(gaps.every((d, k) => Math.abs(d - Math.min(90, START_GAP + MERCY_GAP * (k + 1))) < 3), `run 12: the avalanche restarted ${gaps.map((d) => d.toFixed(0)).join(', ')} m behind after 1, 2, 3 lives lost (should be ${[1, 2, 3].map((k) => Math.min(90, START_GAP + MERCY_GAP * k)).join(', ')})`);
  t.check(g.slope.packs.every((q) => !q.met || q.out), 'run 12: a wolf pack that was met is waiting again after a lost life');
}

t.done(`${runs} runs finished after a real tumble (${tumbles} tumbles in all); a tumble costs ground, not a life; the avalanche costs one life and restarts you on clear snow ${START_GAP} m ahead of it; crystal rushes cannot be lost; ramps throw the sled as the rules say, a full spin lands clean and half a spin tumbles; crevasses cost one life and are crossed by ramp or by a timed jump; a jump clears rocks; wolf bites slow but never tumble, wolves can be knocked down or dodged; yeti boulders can be stepped around and yetis flattened; a run gets kinder each time it beats you`);

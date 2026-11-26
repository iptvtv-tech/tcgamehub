// node games/avalanche-run/test.mjs
// Plays the real Avalanche Run (side-on) headless (tools/lib/headless.mjs) and proves:
//   1 · every run can be finished after a real mistake: the benchmark's rider rides into a rock or
//       lands a jump on its head (a tumble), carries on and reaches the hut, with the rules checked
//       after every step
//   2 · a tumble costs ground, never a life: straight after one the sled is slow, and nothing else
//       can knock it down until 1.5 s after it is up again
//   3 · the avalanche costs exactly one life, and puts you back on plain snow ahead of it: at the
//       start line, or at the flag once you have passed it
//   4 · THE AVALANCHE IS ALWAYS THERE (owner, 21 Nov 2026: "the avalanche doesn't come near the
//       player after 11 levels"): on every run, however well the rider does, it is never more than
//       22 m behind and its front is inside the picture at every step
//   5 · CAUGHT = THE WHOLE PICTURE (owner, 21 Nov 2026: "when the avalanche catches the player it
//       swallows up the entire screen"): being caught starts the swallow, the picture is fully
//       white before you are put back, and it clears once you are
//   6 · the crystal rushes (runs 5 and 10) cannot be lost and end on their timer
//   7 · tricks: a kicker throws the sled; with the buttons let go it lands clean; one backflip or
//       front flip, let go, lands clean with a burst of speed; held upside down it is a tumble (no
//       life lost); a grab counts as a trick
//   8 · crevasses and cracks: a wide crevasse is carried by its kicker; ridden at a crawl it costs
//       exactly one life; a crack costs one life without a jump and none with one
//   9 · rocks: riding into one is a tumble; a jump clears it; a rock you crashed into does not
//       knock you down a second time
//  12 · yetis (from run 4) and the sword: riding into a yeti is a tumble, never a life, and it does
//       not knock you down twice; a swing in reach cuts it down, a swing from far away does not;
//       landing on its head flattens it; a snowball left alone is a tumble, one met with the sword is not
//  13 · a double flip's boost is bigger and longer than a single's; a swing of the sword in the air
//       is a sword spin; TUCK and JUMP held in the air and let go is a superman, held all the way
//       down is a tumble; tricks off three kickers in a row are a rush (top speed, the avalanche
//       thrown back); a rocket gives top speed; every run has a golden crystal; a rider who just
//       rides the kickers picks up all four letters
//  10 · mercy: every life lost on a run gives 4 m more room ahead of the avalanche at the restart
//  14 · ice wolves (from run 8): one joins with a howl, crouches and lunges; left alone the bite
//       bleeds speed — never a tumble, never a life — and no second bite comes within 2.5 s; the
//       sword cuts a crouching or lunging wolf down; a jump at the lunge lets it sail under; at
//       top speed the wolf is outrun; a pack already met does not come back after a lost life
//  11 · phone buttons (bug, 20 Nov 2026: on an iPhone ◀ ▶ "glitch and get stuck"): each finger
//       presses the button nearest to it; a finger that slides from ◀ to ▶ changes over at once;
//       two thumbs work together; and no button sits in the strips at the screen's side edges
//       where iPhones start their own swipes. (A finger whose lift was never reported is let go
//       by the engine for every game: tools/check-touch.mjs.)
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';
import { snowAt, START_GAP, MAX_GAP, MERCY_GAP, SAFE_T, TUMBLE_T, TUMBLE_V, SPIN, TAU, BONUS_LEVELS, FINAL_LEVEL } from './world.js';

const G = await loadGame('avalanche-run');
const B = (await import('./bench.mjs')).default;
const t = reporter('avalanche-run');
const expert = (level) => ({ skill: 1, rand: () => 0.5, t: 0, level, mem: {} });
/** Start a run and keep a list of everything the rules report. */
const begin = (level, seed = 3) => {
  const s = G.start({ seed, level }), g = s.game, events = [], step = g.sim.step.bind(g.sim);
  g.sim.step = (inp, dt) => { const ev = step(inp, dt); events.push(...ev); return ev; };
  return { s, g, sim: g.sim, p: g.sim.p, sl: g.slope, events, saw: (type) => events.filter((e) => e.type === type) };
};

// ── 1 · every run, after a real mistake ──
let runs = 0, tumbles = 0;
for (let level = 1; level <= FINAL_LEVEL; level++) {
  if (BONUS_LEVELS.includes(level)) continue;
  for (const seed of [1, 2]) {
    const r = botPlay(G, B, { level, seed });
    runs++; tumbles += r.shell.game.sim.tumbles;
    t.check(r.cleared, `run ${level} seed ${seed}: ${why(r)}`);
    t.check(r.mistakeMade, `run ${level} seed ${seed}: the rider never managed to tumble (no mistake was made)`);
  }
}

// ── 2 · a tumble costs ground, not a life ──
for (const level of [2, 9, 15]) {
  const { s, sim, p, sl, saw } = begin(level), rock = sl.rocks[0];
  sim.place(rock.x - 12); s.hold([]);
  s.run(3, () => p.tumble > 0);
  if (!t.check(p.tumble > 0 && saw('tumble').length === 1, `run ${level}: riding into a rock was not a tumble`)) continue;
  t.check(s.livesLost === 0, `run ${level}: a tumble cost a life`);
  t.check(p.v <= sim.R.cruise * TUMBLE_V + 1e-6, `run ${level}: just after a tumble the sled still rides at ${p.v.toFixed(1)} m/s`);
  const gap0 = sim.gap;
  s.run(TUMBLE_T + 0.05);
  t.check(sim.gap < gap0 - 2, `run ${level}: a tumble cost no ground (the avalanche was ${gap0.toFixed(1)} m behind, then ${sim.gap.toFixed(1)})`);
  // put a fresh rock right in front of the sled: within the safe time it cannot knock him down again
  sl.rocks.push({ x: p.x + 4, v: 0 }); sl.rocks.sort((a, b) => a.x - b.x);
  s.run(SAFE_T * 0.5);
  t.check(saw('tumble').length === 1, `run ${level}: a second rock knocked the sled down ${(TUMBLE_T + SAFE_T * 0.5).toFixed(1)} s after the first`);
}

// ── 3 · the avalanche costs one life and restarts you ahead of it ──
for (const level of [1, 8, 15]) {
  for (const past of [false, true]) {
    const { s, g, sim, p, sl } = begin(level);
    if (past) { sim.place(sl.flagX + 30); s.run(0.2); }
    const tag = `run ${level}${past ? ' (past the flag)' : ''}`;
    if (past) t.check(sim.flagged, `${tag}: riding past the flag did not count`);
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 3 };            // let it catch him
    s.hold([]); s.run(6, () => s.livesLost > 0);
    t.check(s.livesLost === 1, `${tag}: caught by the avalanche cost ${s.livesLost} lives`);
    sim.R = sl.R;
    s.run(4, () => s.state === 'playing');
    t.check(s.state === 'playing' && Math.abs(g.sim.p.x - (past ? sl.flagX : 0)) < 1, `${tag}: after the avalanche the sled restarts at x=${p.x.toFixed(0)} (${past ? 'the flag is at ' + sl.flagX : 'the start line is at 0'})`);
    t.check(Math.abs(sim.gap - (START_GAP + MERCY_GAP)) < 0.5, `${tag}: at the restart the avalanche is ${sim.gap.toFixed(1)} m behind (${START_GAP + MERCY_GAP} with one life lost)`);
    s.run(1.5);
    t.check(s.livesLost === 1 && sim.tumbles === 0, `${tag}: the restart began with ${sim.tumbles} tumbles, ${s.livesLost} lives lost`);
  }
}

// ── 4 · the avalanche is always there ──
{
  let far = 0, out = 0, steps = 0;
  for (let level = 1; level <= FINAL_LEVEL; level++) {
    if (BONUS_LEVELS.includes(level)) continue;
    const { s, g, sim } = begin(level, 5), b = expert(level);
    for (let i = 0; i < 200 / STEP && !s.cleared; i++) {
      if (s.state === 'playing') B.bot(g, s, b);
      s.tick();
      if (s.state !== 'playing' || sim.done) continue;
      steps++; far = Math.max(far, sim.gap);
      const fx = g.frontX();
      if (!(fx >= -30 && fx < 480 * 0.34)) out++;
    }
    t.check(s.cleared === 1, `run ${level}: the expert rider did not reach the hut`);
  }
  t.check(far <= MAX_GAP + 1e-6, `the avalanche fell ${far.toFixed(1)} m behind an expert rider (it should never be more than ${MAX_GAP})`);
  t.check(out === 0, `the avalanche's front was outside the picture, or ahead of the sled, on ${out} of ${steps} steps`);
}

// ── 5 · caught: it swallows the whole picture ──
for (const level of [1, 12]) {
  const { s, g, sim, sl } = begin(level);
  t.check(g.swallow < 0, `run ${level}: the swallow is running before anything happened`);
  sim.R = { ...sim.R, avalanche: sim.R.cruise * 3 };
  s.hold([]); s.run(6, () => s.livesLost > 0);
  t.check(g.swallow >= 0, `run ${level}: caught by the avalanche, but it does not roll over the picture`);
  let full = 0;                                           // how long the picture is fully white before the restart
  s.run(4, () => { if (g.swallow >= g.swallowT) full += STEP; return g.swallow < 0; });
  t.check(full > 0.05, `run ${level}: the sled was put back before the avalanche had covered the picture`);
  sim.R = sl.R;
  t.check(g.swallow < 0 && g.clearing > 0, `run ${level}: after the restart the white does not clear off the picture`);
  s.run(3, () => s.state === 'playing'); s.run(1);
  t.check(g.clearing <= 0, `run ${level}: a second after play began again the picture is still white`);
}

// ── 6 · the crystal rushes ──
for (const level of BONUS_LEVELS) {
  const { s, g } = begin(level, 1), b = expert(level);
  let bad = null;
  for (let i = 0; i < 40 / STEP && !s.cleared && !bad; i++) { if (s.state === 'playing') B.bot(g, s, b); s.tick(); if (s.state === 'playing') bad = B.invariants(g, s); }
  t.check(!bad, `run ${level} (crystal rush): rule broken — ${bad}`);
  t.check(s.cleared === 1 && s.livesLost === 0, `run ${level} (crystal rush): ${s.cleared ? '' : 'did not end on its timer; '}${s.livesLost} lives lost`);
  const got = g.slope.crystals.filter((c) => c.got).length;
  t.check(got >= 40, `run ${level} (crystal rush): the rider collected only ${got} crystals in 20 s`);
}

// ── 7 · tricks ──
for (const level of [1, 8, 14]) {
  /** Ride the first plain kicker; in the air, keys(p, airT) says what to hold. */
  const jump = (keys, size = 'mid') => {
    const r = begin(level, 4), { s, sim, p, sl } = r, k = sl.kickers.find((q) => !q.big && q.size === size);
    sim.place(k.x - k.L - 8); let flew = false, top = 0, airT = 0;
    for (let i = 0; i < 6 / STEP; i++) {
      s.hold(p.air ? keys(p, airT) : []);
      s.tick();
      if (p.air) { flew = true; airT += STEP; top = Math.max(top, p.y - snowAt(sl, p.x)); } else if (flew) break;
    }
    s.hold([]);
    return { ...r, flew, top, airT, trick: r.saw('trick')[0], boost: p.boost };
  };
  const plain = jump(() => []);
  if (!t.check(plain.flew && plain.top > 1.5, `run ${level}: a kicker threw the sled only ${plain.top.toFixed(1)} m high`)) continue;
  t.check(plain.airT > 0.7, `run ${level}: a cruising sled was in the air for only ${plain.airT.toFixed(2)} s (a flip takes ${(TAU / SPIN).toFixed(2)})`);
  t.check(plain.sim.tumbles === 0 && !plain.trick && plain.boost <= 0 && plain.s.livesLost === 0, `run ${level}: a plain flight ended with ${plain.sim.tumbles} tumbles, boost ${plain.boost.toFixed(1)}`);
  for (const [key, back] of [['left', true], ['right', false]]) {
    const flip = jump((p, a) => (a < TAU / SPIN - 0.03 ? [key] : []));
    t.check(flip.sim.tumbles === 0 && flip.trick && flip.trick.flips === 1 && flip.trick.back === back, `run ${level}: one ${back ? 'backflip' : 'front flip'}, let go, did not land as one clean ${back ? 'backflip' : 'front flip'} (${flip.sim.tumbles} tumbles, ${JSON.stringify(flip.trick || null)})`);
    t.check(flip.boost > 0, `run ${level}: a landed flip gave no burst of speed`);
  }
  const head = jump((p) => [p.turned < Math.PI ? 'left' : p.turned > Math.PI + 0.2 ? 'right' : 'left']);   // held upside down
  t.check(head.sim.tumbles === 1 && head.saw('tumble')[0]?.bad && head.s.livesLost === 0 && !head.trick, `run ${level}: landing upside down: ${head.sim.tumbles} tumbles, ${head.s.livesLost} lives lost`);
  const grab = jump((p, a) => (a < 0.5 ? ['down'] : []));
  // kickers come in sizes: a big one throws the sled for longer than a small one, long enough for two flips
  const small = jump(() => [], 'small'), bigK = jump(() => [], 'big');
  t.check(bigK.airT > small.airT * 1.5, `run ${level}: a big kicker throws the sled for ${bigK.airT.toFixed(2)} s and a small one for ${small.airT.toFixed(2)} s`);
  const two = jump((p, a) => (a < 2 * TAU / SPIN - 0.03 ? ['left'] : []), 'big');
  t.check(two.sim.tumbles === 0 && two.trick?.flips === 2, `run ${level}: two backflips off a big kicker did not land as a double (${two.sim.tumbles} tumbles, ${JSON.stringify(two.trick || null)})`);
  t.check(grab.sim.tumbles === 0 && grab.trick?.grab && grab.trick.flips === 0 && grab.boost > 0, `run ${level}: a grab did not count as a trick (${JSON.stringify(grab.trick || null)})`);
}

// ── 8 · crevasses and cracks ──
for (const level of [3, 9, 15]) {
  const big = (crawl) => {
    const r = begin(level), { s, sim, p, sl } = r, c = sl.gaps.find((q) => !q.crack);
    sim.place(c.x - 20);
    if (crawl) sim.R = { ...sim.R, cruise: sim.R.cruise * 0.15, avalanche: 0 };
    p.v = sim.R.cruise; s.hold([]);
    s.run(25, () => s.livesLost > 0 || (p.x > c.x + c.w + 1 && !p.air));
    return { ...r, c };
  };
  const over = big(false);
  t.check(over.s.livesLost === 0 && over.p.x > over.c.x + over.c.w, `run ${level}: the kicker did not carry a cruising sled over the crevasse at ${over.c.x} (${over.c.w} m)`);
  const fall = big(true);
  t.check(fall.s.livesLost === 1 && fall.saw('fell').length === 1, `run ${level}: a sled at a crawl at the crevasse: ${fall.s.livesLost} lives lost`);
}
for (const level of [6, 12, 15]) {
  const crack = (jumps) => {
    const r = begin(level), { s, sim, p, sl } = r, c = sl.gaps.find((q) => q.crack);
    sim.place(c.x - 15); let pressed = false;
    for (let i = 0; i < 4 / STEP && s.livesLost === 0 && !(p.x > c.x + c.w + 1 && !p.air); i++) {
      const now = jumps && !pressed && c.x - p.x < 1.2; if (now) pressed = true;
      s.hold(now ? ['up'] : []); s.tick();
    }
    return { ...r, c };
  };
  const no = crack(false), yes = crack(true);
  t.check(no.s.livesLost === 1 && no.saw('fell').length === 1, `run ${level}: riding into the crack at ${no.c.x} without a jump cost ${no.s.livesLost} lives`);
  t.check(yes.s.livesLost === 0 && yes.sim.tumbles === 0 && yes.p.x > yes.c.x + yes.c.w, `run ${level}: a jump at the edge did not clear the crack at ${yes.c.x} (${yes.c.w} m)`);
}

// ── 9 · rocks ──
for (const level of [2, 10 + 1, 15]) {
  const rock = (jumps) => {
    const r = begin(level), { s, sim, p, sl } = r, k = sl.rocks[0];
    sim.place(k.x - 15); let pressed = false;
    for (let i = 0; i < 3 / STEP && !(p.x > k.x + 6 && !p.air); i++) {
      const now = jumps && !pressed && k.x - p.x < p.v * 0.3; if (now) pressed = true;
      s.hold(now ? ['up'] : []); s.tick();
    }
    return { ...r, k };
  };
  const hit = rock(false), hop = rock(true);
  t.check(hit.sim.tumbles === 1 && hit.s.livesLost === 0 && hit.k.hit, `run ${level}: riding into a rock: ${hit.sim.tumbles} tumbles, ${hit.s.livesLost} lives lost`);
  t.check(hop.sim.tumbles === 0 && hop.saw('cleared').length === 1, `run ${level}: a jump did not clear the rock at ${hop.k.x} (${hop.sim.tumbles} tumbles)`);
  // the rock he crashed into stays down: ride at it again
  hit.sim.place(hit.k.x - 15); hit.s.hold([]); hit.s.run(1.5);
  t.check(hit.sim.tumbles === 1, `run ${level}: a rock already crashed into knocked the sled down again`);
}

// ── 12 · yetis and the sword ──
for (const level of [4, 9, 15]) {
  /** Ride at the first yeti; act(p, d, sim) returns the keys to hold and may swing the sword. */
  const meet = (act, quietBalls = true) => {
    const r = begin(level), { s, g, sim, p, sl } = r, y = sl.yetis[0];
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 0.8 };            // (this is about the yeti, not the avalanche)
    sim.place(y.x - 30); if (quietBalls) sim.quiet = 99;            // (no snowballs, unless the test is about them)
    for (let i = 0; i < 4 / STEP && !(p.x > y.x + 8 && !p.air); i++) {
      const out = act(p, y.x - p.x, sim) || {};
      if (out.swing) g.swing = true;
      s.hold(out.keys || []); s.tick();
    }
    return { ...r, y };
  };
  const hit = meet(() => ({}));
  t.check(hit.sim.tumbles === 1 && hit.saw('tumble')[0]?.by === 'yeti' && hit.s.livesLost === 0, `run ${level}: riding into a yeti: ${hit.sim.tumbles} tumbles, ${hit.s.livesLost} lives lost`);
  hit.sim.place(hit.y.x - 20); hit.sim.quiet = 99; hit.s.hold([]); hit.s.run(2);
  t.check(hit.sim.tumbles === 1, `run ${level}: a yeti already ridden into knocked the sled down again`);
  const cut = meet((p, d) => ({ swing: d < 6 && d > 0 }));
  t.check(cut.sim.tumbles === 0 && cut.saw('slain').length === 1 && cut.y.down, `run ${level}: a swing of the sword at a yeti in reach did not cut it down (${cut.sim.tumbles} tumbles)`);
  const early = meet((p, d) => ({ swing: d < 26 && d > 24 }));
  t.check(early.saw('slain').length === 0 && early.sim.tumbles === 1, `run ${level}: a swing from 25 m away cut the yeti down`);
  let pressed = false;
  const stomp = meet((p, d) => { const now = !pressed && d < p.v * 0.42; if (now) pressed = true; return { keys: now ? ['up'] : [] }; });
  t.check(stomp.saw('stomp').length === 1 && stomp.sim.tumbles === 0 && stomp.y.flat, `run ${level}: a jump onto a yeti's head did not flatten it (${stomp.sim.tumbles} tumbles, ${stomp.saw('stomp').length} stomps)`);
  // snowballs: one that is left alone knocks the sled down; one cut out of the air does not
  const ball = (parry) => {
    // (a yeti with plain snow before it, so the sled is on the snow when it throws)
    let r, y;
    for (let seed = 1; seed < 300 && !y; seed++) { r = begin(level, seed); const free = (q, list) => !list.some((k) => k.x > q.x - 76 && k.x < q.x); y = r.sl.yetis.find((q) => free(q, r.sl.kickers) && free(q, r.sl.rocks) && free(q, r.sl.gaps) && free(q, r.sl.yetis) && free(q, r.sl.items)); }
    const { s, g, sim, p } = r;
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 0.8 };
    sim.place(y.x - 74); sim.quiet = 0;
    for (let i = 0; i < 3 / STEP && !r.saw('tumble').length && !r.saw('parry').length && p.x < y.x - 8; i++) {
      const b = sim.balls[0];
      if (parry && b && b.x - p.x < 5 && p.cool <= 0) g.swing = true;
      s.hold([]); s.tick();
    }
    return r;
  };
  const left = ball(false), cutIt = ball(true);
  t.check(left.saw('throw').length >= 1, `run ${level}: the yeti never threw a snowball at a sled riding at it`);
  t.check(left.saw('tumble')[0]?.by === 'ball' && left.s.livesLost === 0, `run ${level}: a snowball left alone did not knock the sled down (${left.sim.tumbles} tumbles)`);
  t.check(cutIt.saw('parry').length === 1 && cutIt.sim.tumbles === 0, `run ${level}: a snowball met with the sword still knocked the sled down (${cutIt.sim.tumbles} tumbles, ${cutIt.saw('parry').length} cut)`);
}

// ── 13 · boosts, the rush, more tricks, things to collect ──
for (const level of [3, 8, 14]) {
  /** Ride a kicker of a size from 8 m before its run-up; in the air, act(p, airT) gives the keys, and may swing. */
  const jump = (size, act, setup) => {
    const r = begin(level, 4), { s, g, sim, p, sl } = r, k = sl.kickers.find((q) => !q.big && q.size === size);
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 0.8 };
    sim.place(k.x - k.L - 8); sim.quiet = 99; setup?.(r, k);
    let flew = false, airT = 0;
    for (let i = 0; i < 8 / STEP; i++) {
      const out = p.air ? act(p, airT) || {} : {};
      if (out.swing) g.swing = true;
      s.hold(out.keys || []); s.tick();
      if (p.air) { flew = true; airT += STEP; } else if (flew) break;
    }
    s.hold([]);
    return { ...r, k, trick: r.saw('trick')[0], boost: p.boost, boostK: p.boostK };
  };
  const flipFor = (n) => (p, a) => ({ keys: a < n * TAU / SPIN - 0.03 ? ['left'] : [] });
  const one = jump('big', flipFor(1)), two = jump('big', flipFor(2));
  t.check(one.trick?.tier === 1 && two.trick?.tier === 2 && two.boost > one.boost + 0.5 && two.boostK > one.boostK, `run ${level}: a double flip's boost (${two.boostK} for ${two.boost.toFixed(1)} s) is no bigger than a single's (${one.boostK} for ${one.boost.toFixed(1)} s)`);
  const spin = jump('mid', (p, a) => ({ swing: a > 0.2 && a < 0.25 }));
  t.check(spin.trick?.spin && spin.trick.flips === 0 && spin.sim.tumbles === 0 && spin.boost > 0, `run ${level}: a swing of the sword in the air did not land as a sword spin (${JSON.stringify(spin.trick || null)})`);
  const sup = jump('mid', (p, a) => ({ keys: a < 0.5 ? ['down', 'up'] : [] }));
  t.check(sup.trick?.superman && !sup.trick.grab && sup.sim.tumbles === 0, `run ${level}: TUCK and JUMP held in the air, then let go, did not land as a superman (${JSON.stringify(sup.trick || null)})`);
  const held = jump('mid', () => ({ keys: ['down', 'up'] }));
  t.check(held.sim.tumbles === 1 && held.saw('tumble')[0]?.sup && held.s.livesLost === 0, `run ${level}: a superman held all the way down: ${held.sim.tumbles} tumbles, ${held.s.livesLost} lives lost`);
  const both = jump('big', (p, a) => ({ keys: a < TAU / SPIN - 0.03 ? ['left'] : [], swing: a > 0.2 && a < 0.25 }));
  t.check(both.trick?.tier === 2 && both.trick.flips === 1 && both.trick.spin, `run ${level}: a flip with a sword spin is not a two-trick landing (${JSON.stringify(both.trick || null)})`);
  // a rush: tricks off three kickers in a row
  {
    const r = begin(level, 6), { s, sim, p, sl, saw } = r, fast = sim.R.cruise * 0.8;
    sim.R = { ...sim.R, avalanche: fast }; sl.rocks.length = 0; sl.yetis.length = 0; sl.gaps.length = 0;      // (only the kickers matter here)
    const run = (keysInAir) => { for (let i = 0; i < 60 / STEP && saw('trick').length + saw('land').length < 3 && !sim.done; i++) { s.hold(p.air && p.from === 'kicker' && p.airT < 0.45 ? keysInAir : []); s.tick(); } };
    run(['down']);
    t.check(saw('trick').length === 3 && saw('rush').length === 1, `run ${level}: grabs landed off three kickers in a row gave ${saw('rush').length} rushes (${saw('trick').length} tricks, ${sim.tumbles} tumbles)`);
    t.check(p.rush > 0 && Math.abs(sim.gap - (MAX_GAP + sim.room)) < 0.5, `run ${level}: in a rush the avalanche is ${sim.gap.toFixed(1)} m behind (thrown back to ${MAX_GAP + sim.room})`);
    s.hold([]); s.run(0.6, () => p.air);
    if (!p.air) t.check(p.v > sim.R.cruise * 1.3, `run ${level}: 0.6 s into a rush the sled rides at ${p.v.toFixed(1)} m/s (cruising is ${sim.R.cruise.toFixed(1)})`);
  }
  // a rocket, a golden crystal and the four letters
  {
    const r = begin(level, 6), { s, sim, p, sl, saw } = r, rocket = sl.items.find((q) => q.kind === 'rocket');
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 0.8 };
    sim.place(rocket.x - 6); sim.quiet = 99; s.hold([]); s.run(0.8, () => p.air);
    t.check(rocket.got && saw('rocket').length === 1 && p.rocket > 0, `run ${level}: riding over a rocket did not pick it up`);
    if (!p.air) t.check(p.v > sim.R.cruise * 1.25, `run ${level}: with a rocket the sled rides at ${p.v.toFixed(1)} m/s (cruising is ${sim.R.cruise.toFixed(1)})`);
    t.check(sl.crystals.some((c) => c.gold), `run ${level}: there is no golden crystal on the run`);
  }
  {
    // (the whole run, by the expert rider, who does no tricks: every letter is on a plain flight's way)
    const { s, g, sl, saw } = begin(level, 6), b = expert(level);
    for (let i = 0; i < 200 / STEP && !s.cleared; i++) { if (s.state === 'playing') B.bot(g, s, b); s.tick(); }
    const got = sl.items.filter((q) => q.kind === 'letter' && q.got).length;
    t.check(got === 4 && saw('letter').filter((e) => e.all).length === 1, `run ${level}: a rider who just rides the kickers picked up ${got} of the 4 letters`);
  }
}

// ── 10 · mercy ──
{
  const { s, sim, sl } = begin(12), room = [];
  for (let n = 1; n <= 4; n++) {
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 3 };
    s.hold([]); s.run(6, () => s.livesLost >= n);
    sim.R = sl.R; s.lives = 3;
    s.run(4, () => s.state === 'playing');
    room.push(Math.round(sim.gap));
  }
  t.check(room.join() === [1, 2, 3, 3].map((n) => START_GAP + n * MERCY_GAP).join(), `after 1, 2, 3 and 4 lives lost on a run the avalanche restarts ${room.join(', ')} m behind (${[1, 2, 3, 3].map((n) => START_GAP + n * MERCY_GAP).join(', ')})`);
}

// ── 11 · phone buttons ──
{
  const s = G.start({ seed: 1, level: 1 }), g = s.game, fingers = s.input.pointers;
  g.touchSeen = true; g.layout();
  const C = g.ctl, at = (k) => ({ x: C[k].x, y: C[k].y, t: 0, touch: true });
  const put = (...list) => { fingers.clear(); list.forEach((q, i) => fingers.set(i + 1, q)); return g.readInput(); };
  t.check(put().dir === 0 && !put().jump && !put().tuck, 'with no finger on the screen a button reads as held');
  t.check(put(at('left')).dir === -1, 'a finger on ◀ does not read as ◀');
  t.check(put({ ...at('right'), x: C.right.x - 4, y: C.right.y + 6 }).dir === 1, 'a finger that slid from ◀ onto ▶ does not read as ▶');
  const sw = put(at('sword'));
  t.check(sw.slash && !sw.jump && !sw.tuck && sw.dir === 0, `a finger on SWORD reads as ${JSON.stringify(sw)}`);
  const two = put(at('left'), at('jump'));
  t.check(two.dir === -1 && two.jump && !two.tuck, `two thumbs on ◀ and JUMP read as ${JSON.stringify(two)}`);
  const tk = put(at('right'), at('tuck'));
  t.check(tk.dir === 1 && tk.tuck && !tk.jump, `two thumbs on ▶ and TUCK read as ${JSON.stringify(tk)}`);
  t.check(put({ ...at('left'), x: (C.left.x + C.right.x) / 2 - 1 }).dir === -1, 'a thumb between ◀ and ▶, nearer ◀, does not read as ◀');
  const none = put();                                   // the engine has let a lost finger go
  t.check(none.dir === 0 && !none.jump && !none.tuck && !none.slash, `once the engine lets a finger go the buttons read ${JSON.stringify(none)}`);
  for (const k of ['left', 'right', 'tuck', 'jump', 'sword']) t.check(C[k].x - C[k].r >= 26 && C[k].x + C[k].r <= 480 - 26, `the ${k} button reaches to ${Math.round(Math.min(C[k].x - C[k].r, 480 - C[k].x - C[k].r))} px from the screen's side edge (iPhones start their own swipes inside 26 px)`);
  t.check(C.right.x - C.right.r - (C.left.x + C.left.r) >= 8 && C.jump.x - C.jump.r - (C.tuck.x + C.tuck.r) >= 8 && ['tuck', 'jump'].every((k) => Math.hypot(C.sword.x - C[k].x, C.sword.y - C[k].y) - C.sword.r - C[k].r >= 8), 'two buttons touch or overlap');
}

// ── 14 · ice wolves (from run 8) ──
for (const level of [8, 14]) {
  /** Ride with a wolf on the chase; act(p, w, sim) may hold keys or swing. A slope and a spot
   *  where the wolf's whole hunt plays out over plain snow (no kickers, rocks, cracks or yetis). */
  const chase = (act, secs = 14) => {
    let r, w;
    for (let seed = 1; seed < 300 && !w; seed++) {
      r = begin(level, seed);
      // (clear of anything that tumbles or kills — and of kicker lips in the attack window,
      //  so the hunt is not interrupted by a flight mid-lunge)
      const clear = (a, b) => ![...r.sl.rocks, ...r.sl.yetis].some((q) => q.x > a - 14 && q.x < b) && !r.sl.gaps.some((c) => c.x + c.w > a - 6 && c.x < b);
      w = r.sl.wolves.find((q) => clear(q.at - 25, q.at + 130) && !r.sl.kickers.some((k) => k.x > q.at + 5 && k.x < q.at + 95));
    }
    const { s, g, sim, p } = r;
    sim.R = { ...sim.R, avalanche: sim.R.cruise * 0.75 };           // (this is about the wolf, not the avalanche)
    sim.place(w.at - 20);                                           // (quiet stays at its natural 1.5 s: wolves honour it too)
    for (const q of r.sl.wolves) if (q !== w) q.gone = true;        // (one wolf at a time: this is its test)
    for (let i = 0; i < secs / STEP && !sim.done; i++) {
      if (r.saw('bite').length + r.saw('wolfSlain').length >= 1) break;                 // (at once: the bite's cost is read right here)
      if (r.saw('wolfUnder').length >= 1 && !p.air) break;
      const out = act(p, w, sim) || {};
      if (out.swing) g.swing = true;
      s.hold(out.keys || []); s.tick();
    }
    return { ...r, w };
  };
  // left alone it joins, growls and bites: speed bleeds, never a tumble, never a life
  const bit = chase(() => ({ keys: ['down'] }));
  t.check(bit.saw('howl').length === 1 && bit.saw('growl').length >= 1, `run ${level}: the wolf never joined or never growled`);
  t.check(bit.saw('bite').length === 1, `run ${level}: the wolf never bit a sled that did nothing`);
  t.check(bit.sim.tumbles === 0 && bit.s.livesLost === 0, `run ${level}: a bite cost a tumble or a life`);
  t.check(bit.p.v <= bit.sim.R.cruise * 0.8, `run ${level}: just after a bite the sled still rides at ${bit.p.v.toFixed(1)} m/s`);
  // … and no second bite comes within 2.5 s
  let again = 0;
  for (let i = 0; i < 2.2 / STEP; i++) { bit.s.hold(['down']); bit.s.tick(); again = bit.saw('bite').length; }
  t.check(again === 1, `run ${level}: ${again} bites within 2.2 s of the first`);
  // the sword, swung as it comes, cuts it down
  const cut = chase((p, w) => ({ swing: (w.state === 'crouch' || w.state === 'lunge') && Math.abs(w.wx - p.x) < 5 }));
  t.check(cut.saw('wolfSlain').length === 1 && cut.w.gone && cut.saw('bite').length === 0, `run ${level}: a swing of the sword did not cut the lunging wolf down`);
  // a jump, taken as it springs, lets the lunge sail under
  const hop = chase((p, w) => ({ keys: w.state === 'lunge' ? ['up'] : [] }));
  t.check(hop.saw('wolfUnder').some((e) => e.dodged) && hop.saw('bite').length === 0, `run ${level}: a jump did not dodge the lunge (${hop.saw('bite').length} bites)`);
  // at top speed (a rocket) the wolf cannot keep up and is outrun (its lunge held off: this is a footrace)
  if (level === 8) {                                   // (the footrace needs open road: one level proves the cap rule, which is the same on all)
    const run = chase((p, w, sim) => { sim.p.rocket = 6; w.rest = 99; return { keys: ['down'] }; }, 26);
    t.check(run.saw('wolfLost').length === 1 && run.saw('bite').length === 0, `run ${level}: a sled at top speed did not shake the wolf off (it falls behind — and the avalanche is there)`);
  }
  // a pack already met does not come back after a lost life
  const back = chase(() => ({ keys: ['down'] }));
  back.sim.flagged = true; back.sim.place(back.sl.flagX);
  t.check(back.sl.wolves.filter((q) => q.at < back.sl.flagX).every((q) => q.gone), `run ${level}: a wolf already met came back after a lost life`);
}
{
  const { runFor } = await import('./world.js');
  t.check(runFor(7).wolves === 0 && runFor(8).wolves === 1 && runFor(11).wolves === 2 && runFor(14).wolves === 3, 'the runs do not call for wolves as 0 to run 7, 1 from run 8, 2 from 11, 3 from 14');
}

t.done(`${runs} runs finished after a real tumble (${tumbles} tumbles in all); a tumble costs ground, not a life; the avalanche costs one life and restarts you on plain snow ahead of it; it is never more than ${MAX_GAP} m behind and always in the picture, on every run; caught, it covers the whole picture before you are put back; crystal rushes cannot be lost; flips and grabs land clean with a burst of speed, upside down is a tumble; kickers come in sizes and a big one has room for a double; crevasses, cracks and rocks do what the rules say; a yeti is a tumble to ride into, is cut down by the sword in reach or flattened from above, and its snowballs can be cut out of the air; an ice wolf's bite bleeds speed but never costs a tumble or a life, the sword cuts it down, a jump dodges its lunge, top speed shakes it off, and a pack met once stays away; phone buttons read each finger; bigger tricks give bigger boosts, three kickers of tricks running is a rush, sword spins and supermen count, rockets and letters can be picked up`);

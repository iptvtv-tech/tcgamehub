// node games/avalanche-run/check.mjs [--seeds=40]
// Level checker for Avalanche Run (side-on). Runs are made from seeded dice (world.js makeSlope), so
// this builds every run for a spread of seeds and proves:
//   1 · each run has the crevasses and cracks its number calls for, and at least its rocks
//   2 · the snow after the start line and after the flag is plain for 50 m, and the last 60 m
//       before the hut too, so a restart never begins with a tumble
//   3 · nothing overlaps: a rock or a crack never stands on a kicker or within 12 m of another
//       rock, crack or crevasse
//   4 · every kicker throws a cruising sled for between 0.6 and 3.3 seconds, and on every run the
//       biggest throws it at least half as long again as the smallest; every run has the yetis its number calls for
//   5 · every crevasse has a kicker at its edge that carries the sled over with 2 m to spare at
//       any speed from 70% of cruising (a sled that has just tumbled and picked itself up) to
//       flat out; ridden at a crawl it does not (the crevasse is real)
//   6 · no flight off any kicker, at any speed from 70% of cruising to flat out, comes down in a
//       crevasse or a crack, on a rock, or closer than 10 m before one
//   7 · every crack is cleared by a jump taken in its last metre and a half, from 70% of cruising
//       speed to flat out; ridden into without a jump it is a fall
//   8 · a jump taken a third of a second before a rock clears it, cruising or flat out
//   9 · a careful rider (jumps rocks and cracks, rides the kickers, does no tricks, tucks) gets from
//       the start line to the hut, and from the flag to the hut, without a tumble or a fall and
//       ahead of the avalanche; and a tucked sled is faster than the avalanche on every run
//  10 · every run has the letters S, L, E and D once each, each within reach of a sled that
//       just rides its kicker (slow, cruising or fast), a golden crystal, and two or more rockets from run 2, none just before something to hit; crystals hang over the snow (never under it or inside a rock), and the crystal rushes
//       (runs 5 and 10) have nothing to hit and plenty to collect
import { makeRng } from '../../assets/js/rng.js';
import { makeSlope, SlopeSim, snowAt, gapAt, launch, fly, TUCK, BOOST, ROCK_R, ROCK_H, HOP, GRAV, LIP_MAX, YETI_R, SLASH_REACH, LETTERS, REACH, CLEAR_START, BONUS_LEVELS, FINAL_LEVEL } from './world.js';

const arg = process.argv.find((a) => a.startsWith('--seeds='));
const SEEDS = arg ? +arg.slice(8) : 40;
const problems = [];
const fail = (m) => { if (problems.length < 30) problems.push(m); else if (problems.length === 30) problems.push('… and more'); };
const DT = 1 / 120;

/** A careful rider, from x0 to the hut. Returns what went wrong, or null. */
function ride(sl, x0) {
  const sim = new SlopeSim(sl), p = sim.p;
  if (x0) { sim.flagged = true; sim.place(x0); }
  let pressed = false;
  for (let i = 0; i < 400 / DT && !sim.done; i++) {
    const rock = sl.rocks.find((r) => r.x > p.x), crack = sl.gaps.find((c) => c.crack && c.x > p.x);
    const want = !p.air && ((rock && rock.x - p.x < Math.max(2.4, p.v * 0.3)) || (crack && crack.x - p.x < Math.max(1.2, p.v * 0.1)));
    const jump = want && !pressed; pressed = !!want;
    const yeti = sl.yetis.find((y) => !y.down && y.x > p.x - 1), ball = sim.balls.find((b) => b.x - p.x < SLASH_REACH + 1 + p.v * 0.08 && b.x > p.x - 1);
    const slash = ((yeti && yeti.x - p.x < SLASH_REACH + p.v * 0.12) || !!ball) && i % 2 === 0;
    for (const e of sim.step({ dir: 0, tuck: true, jump, slash }, DT)) {
      if (e.type === 'tumble') return `a tumble at x=${Math.round(p.x)}`;
      if (e.type === 'fell') return `a fall at x=${Math.round(p.x)}`;
      if (e.type === 'caught') return `caught by the avalanche at x=${Math.round(p.x)}`;
      if (e.type === 'hut') return null;
    }
  }
  return 'never reached the hut';
}
/** Height of a jumping sled over the snow, t seconds after the jump (taken at x at v m/s). */
function hopHeight(sl, x, v, t) {
  const q = launch(sl, x, v, true), X = x + q.vx * t;
  return snowAt(sl, x) + q.vy * t - GRAV * t * t / 2 - snowAt(sl, X);
}

let items = 0, airMin = 9, airMax = 0, yetis = 0, slopes = 0, kickers = 0, crevs = 0, cracks = 0, rocks = 0, crystals = 0, tight = 99;
for (let level = 1; level <= FINAL_LEVEL; level++) {
  const bonus = BONUS_LEVELS.includes(level);
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sl = makeSlope(level, makeRng(seed * 7919 + level * 31), bonus), R = sl.R, tag = `run ${level} seed ${seed}`;
    const top = R.top, slow = R.cruise * 0.7, lipTop = R.cruise * LIP_MAX;      // (a kicker throws the sled no faster than lipTop)
    slopes++; kickers += sl.kickers.length; crystals += sl.crystals.length;
    if (bonus) {
      if (sl.rocks.length || sl.gaps.length) fail(`${tag} (crystal rush): there is something to hit`);
      if (sl.crystals.length < 120) fail(`${tag} (crystal rush): only ${sl.crystals.length} crystals`);
      continue;
    }
    const big = sl.gaps.filter((c) => !c.crack), small = sl.gaps.filter((c) => c.crack);
    crevs += big.length; cracks += small.length; rocks += sl.rocks.length;
    // 1
    if (big.length !== R.crevasses) fail(`${tag}: ${big.length} crevasses (the run calls for ${R.crevasses})`);
    if (small.length !== R.cracks) fail(`${tag}: ${small.length} cracks (the run calls for ${R.cracks})`);
    yetis += sl.yetis.length;
    if (sl.yetis.length !== R.yetis) fail(`${tag}: ${sl.yetis.length} yetis (the run calls for ${R.yetis})`);
    // kickers of different sizes on every run: the biggest throws a cruising sled at least half as long again as the smallest
    { const airs = sl.kickers.map((k) => { const q = launch(sl, k.x, R.cruise); return fly(sl, k.x, snowAt(sl, k.x), q.vx, q.vy, false).t; });
      if (Math.max(...airs) < Math.min(...airs) * 1.5) fail(`${tag}: its kickers are all much the same size (they throw the sled for ${Math.min(...airs).toFixed(1)}–${Math.max(...airs).toFixed(1)} s)`); }
    if (sl.rocks.length < R.rocks) fail(`${tag}: ${sl.rocks.length} rocks (the run calls for ${R.rocks})`);
    // 2
    const things = [...sl.rocks.map((r) => [r.x - ROCK_R, r.x + ROCK_R, 'rock']), ...sl.gaps.map((c) => [c.x, c.x + c.w, c.crack ? 'crack' : 'crevasse']), ...sl.yetis.map((y) => [y.x - YETI_R, y.x + YETI_R, 'yeti']), ...sl.kickers.map((k) => [k.x - k.L, k.x, 'kicker'])];
    for (const [a, b, what] of things) {
      if (b > 0 && a < CLEAR_START) fail(`${tag}: a ${what} at x=${Math.round(a)}, on the plain snow after the start line`);
      if (b > sl.flagX - 2 && a < sl.flagX + CLEAR_START) fail(`${tag}: a ${what} at x=${Math.round(a)}, on the plain snow after the flag (${sl.flagX})`);
      if (b > sl.len - 60) fail(`${tag}: a ${what} at x=${Math.round(a)}, in the last 60 m before the hut`);
    }
    // 3
    const hard = things.filter((q) => q[2] !== 'kicker');
    for (let i = 0; i < hard.length; i++) {
      for (const k of sl.kickers) if (hard[i][2] !== 'crevasse' && hard[i][1] > k.x - k.L - 2 && hard[i][0] < k.x + 2) fail(`${tag}: a ${hard[i][2]} at x=${Math.round(hard[i][0])} stands on the kicker at ${k.x}`);
      for (let j = i + 1; j < hard.length; j++) if (hard[i][1] + 12 > hard[j][0] && hard[j][1] + 12 > hard[i][0]) fail(`${tag}: a ${hard[i][2]} at x=${Math.round(hard[i][0])} and a ${hard[j][2]} at x=${Math.round(hard[j][0])} are within 12 m of each other`);
    }
    for (const k of sl.kickers) {
      const at = (v) => { const q = launch(sl, k.x, v); return fly(sl, k.x, snowAt(sl, k.x), q.vx, q.vy); };
      // 4
      const f = at(R.cruise);
      airMin = Math.min(airMin, f.t); airMax = Math.max(airMax, f.t);
      if (f.t < 0.6 || f.t > 3.3) fail(`${tag}: the kicker at ${k.x} throws a cruising sled for ${f.t.toFixed(2)} s`);
      // 5
      if (k.big) {
        const c = k.gap;
        for (const v of [slow, R.cruise, lipTop]) { const q = at(v); if (q.fell || q.x < c.x + c.w + 2) fail(`${tag}: at ${v.toFixed(0)} m/s the kicker at ${k.x} does not carry the sled over its crevasse (${c.w} m) with 2 m to spare`); else tight = Math.min(tight, q.x - (c.x + c.w)); }
        if (!at(R.cruise * 0.15).fell) fail(`${tag}: a sled at a crawl gets over the crevasse at ${c.x}`);
      }
      // 6
      for (let v = slow; v <= lipTop + 0.01; v += (lipTop - slow) / 12) {
        const q = at(v);
        if (q.fell) { fail(`${tag}: a flight at ${v.toFixed(0)} m/s off the kicker at ${k.x} comes down in a crevasse`); break; }
        const bad = hard.find(([a, b]) => q.x > a - 10 && q.x < b + 1 && !(k.gap && a === k.gap.x));
        if (bad) { fail(`${tag}: a flight at ${v.toFixed(0)} m/s off the kicker at ${k.x} lands at x=${Math.round(q.x)}, on or just before the ${bad[2]} at ${Math.round(bad[0])}`); break; }
      }
    }
    // 7
    for (const c of small) {
      for (const v of [slow, R.cruise, top]) for (const d of [0.1, 1.5]) {
        const q = launch(sl, c.x - d, v, true), f = fly(sl, c.x - d, snowAt(sl, c.x - d), q.vx, q.vy);
        if (f.fell || f.x < c.x + c.w + 1) fail(`${tag}: a jump ${d} m before the crack at ${c.x} (${c.w} m) at ${v.toFixed(0)} m/s does not clear it`);
      }
      const q = launch(sl, c.x, R.cruise), f = fly(sl, c.x + 0.01, snowAt(sl, c.x), q.vx, q.vy);
      if (!f.fell) fail(`${tag}: a cruising sled rides over the crack at ${c.x} without jumping`);
    }
    // 8
    for (const r of sl.rocks) for (const v of [R.cruise, top]) {
      const x = r.x - v * 0.3;
      for (const dx of [-ROCK_R - 0.5, 0, ROCK_R + 0.5]) { const t = (r.x + dx - x) / launch(sl, x, v, true).vx; if (hopHeight(sl, x, v, t) < ROCK_H + 0.15) fail(`${tag}: a jump a third of a second before the rock at ${r.x} at ${v.toFixed(0)} m/s does not clear it`); }
    }
    // (6 again, for jumps: a jump over a rock or a crack at full speed never comes down in or just before the next thing)
    for (const [a, , what] of hard.filter((q) => q[2] !== 'crevasse' && q[2] !== 'yeti')) {
      for (const from of what === 'rock' ? [a + ROCK_R - top * 0.3, a + ROCK_R - 3] : [a - 1.5, a - 0.1]) {
        const q = launch(sl, from, top, true), f = fly(sl, from, snowAt(sl, from), q.vx, q.vy, false);
        const bad = hard.find(([c, d]) => c > a + 2 && f.x > c - 10 && f.x < d + 1);
        if (bad) fail(`${tag}: a jump at full speed over the ${what} at ${Math.round(a)} comes down at x=${Math.round(f.x)}, on or just before the ${bad[2]} at ${Math.round(bad[0])}`);
      }
    }
    // 9
    for (const x0 of [0, sl.flagX]) { const bad = ride(sl, x0); if (bad) fail(`${tag}: a careful rider from ${x0 ? 'the flag' : 'the start line'}: ${bad}`); }
    if (R.cruise * TUCK <= R.avalanche * 1.03) fail(`${tag}: the avalanche (${R.avalanche.toFixed(1)} m/s) is as fast as a tucked sled (${(R.cruise * TUCK).toFixed(1)})`);
    // 10
    for (const c of sl.crystals) {
      const h = c.y - snowAt(sl, c.x);
      if (h < 0.4 && !gapAt(sl, c.x)) fail(`${tag}: a crystal at x=${Math.round(c.x)} is under the snow`);
      if (h < ROCK_H + 0.3 && sl.rocks.some((r) => Math.abs(r.x - c.x) < ROCK_R + 0.6)) fail(`${tag}: a crystal at x=${Math.round(c.x)} is inside a rock`);
    }
    // (10 again: the four letters and the rockets)
    const letters = sl.items.filter((q) => q.kind === 'letter'), rockets = sl.items.filter((q) => q.kind === 'rocket');
    if (letters.map((q) => q.ch).sort().join('') !== [...LETTERS].sort().join('')) fail(`${tag}: its letters are "${letters.map((q) => q.ch).join('')}" (it should have each of ${LETTERS} once)`);
    if (!sl.crystals.some((c) => c.gold)) fail(`${tag}: no golden crystal`);
    if (level >= 2 && rockets.length < 2) fail(`${tag}: ${rockets.length} rockets (two or more from run 2)`);
    for (const q of sl.items) {
      const h = q.y - snowAt(sl, q.x);
      if (h < 0.5 || h > 60 || q.x < CLEAR_START || q.x > sl.len - 40) fail(`${tag}: the ${q.kind} at x=${Math.round(q.x)} is ${h.toFixed(1)} m over the snow, or off the run`);
      if (q.kind === 'rocket' && (gapAt(sl, q.x) || hard.some(([a, b]) => q.x > a - 10 && q.x < b + 3))) fail(`${tag}: the rocket at x=${Math.round(q.x)} is on or just before something to hit`);
    }
    // every letter can be picked up by a cruising sled that just rides its kicker
    for (const q of letters) {
      const k = sl.kickers.filter((w) => w.x < q.x).pop();
      for (const speed of [slow, R.cruise, lipTop]) {
      const v = launch(sl, k.x, speed);
      let best = 99; for (let t = 0; t < 3; t += 1 / 60) { const X = k.x + v.vx * t, Y = snowAt(sl, k.x) + v.vy * t - GRAV * t * t / 2 + 0.9; if (Math.abs(X - q.x) < REACH) best = Math.min(best, Math.abs(Y - q.y)); }
      if (best > REACH + 1.2) fail(`${tag}: the letter ${q.ch} at x=${Math.round(q.x)} is ${best.toFixed(1)} m from the flight of a sled at ${speed.toFixed(0)} m/s`);
      }
    }
    items += sl.items.length;
    void HOP; void BOOST;
  }
}
if (problems.length) { console.log(`✗ avalanche-run levels: ${problems.length} problem(s)`); for (const p of problems) console.log('    ' + p); process.exit(1); }
console.log(`✓ avalanche-run levels — ${slopes} runs built (${FINAL_LEVEL} runs × ${SEEDS} seeds): ${kickers} kickers, in four sizes, throwing a cruising sled for ${airMin.toFixed(1)}–${airMax.toFixed(1)} s, and none landing it on a rock or in a crack at any speed; ${crevs} crevasses, each carried by its kicker from 70% of cruising speed up (at least ${tight.toFixed(1)} m to spare); ${cracks} cracks, each cleared by a jump and a fall without one; ${rocks} rocks, each cleared by a jump; ${yetis} yetis, none where a flight lands; restarts begin on plain snow; a careful rider reaches the hut from the start line and from the flag on every run; ${crystals} crystals over the snow; ${items} letters and rockets, every letter within reach of a sled that just rides its kicker, slow or fast`);

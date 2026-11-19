// node games/eggspress/find-routes.mjs [--levels=8,9] [--seeds=1,2,3] [--out=file.json]
// Works out a whole drive for a delivery, from the start line to the farm with the egg, a stretch of
// road at a time with road-search.mjs, proves it by playing it in the real game, key for key, and
// keeps it in routes.js for the benchmark's expert bot (bench.mjs) and the game test (test.mjs).
// A road is one delivery with one game seed: the benchmark's expert plays seeds 1–3 of every
// delivery (game seed = seed × 7919 + delivery × 31 + 1).
//
// An egg can take two cracks. Where no drive gets one egg all the way (most often a road with three
// mushrooms: a bounce nearly always costs a crack), the drive is in two parts: from the start line
// to past the checkpoint flag, where the egg is let go, and from the restart at the flag to the
// farm with the fresh egg. A road with no drive at all is a road to look at: it may not be
// finishable.
//
// Run it again after changing the road rules or the physics: a kept drive that no longer arrives is
// ignored by the bot. Slow: a few minutes a road, and there are 48.
// With --out the drives go to that file instead (to run several copies at once);
// `--merge=a.json,b.json` then puts such files into routes.js.
import fs from 'node:fs';
import { loadGame, STEP } from '../../tools/lib/headless.mjs';
import { model, clone, mstep, findWay } from './road-search.mjs';
import { ROUTES } from './routes.js';
import { roadKey } from './bench.mjs';

const arg = (k, d) => { const a = process.argv.find((q) => q.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const HEAD = "// Whole drives the benchmark's expert bot has learned: one per road (delivery/game seed). Written by\n// `node games/eggspress/find-routes.mjs`; see bench.mjs. Each is what to hold for every tenth of a\n// second (G gas, B brake, - coast; a number repeats the letter before it): `start` from the start\n// line, and where one egg can't make it, `flag` from the restart at the checkpoint flag.\n";
const save = (all) => fs.writeFileSync(new URL('./routes.js', import.meta.url), `${HEAD}export const ROUTES = ${JSON.stringify(Object.fromEntries(Object.entries(all).sort((a, b) => parseInt(a[0]) - parseInt(b[0]) || a[0].localeCompare(b[0]))), null, 1)};\n`);
export const pack = (seq) => seq.replace(/(.)\1+/g, (run, ch) => ch + run.length);
export const unpack = (text) => text.replace(/(.)(\d+)/g, (_, ch, n) => ch.repeat(+n));

if (arg('merge')) {
  const all = { ...ROUTES };
  for (const f of arg('merge').split(',')) Object.assign(all, JSON.parse(fs.readFileSync(f, 'utf8')));
  save(all);
  console.log(`${Object.keys(all).length} drives in routes.js`);
  process.exit(0);
}

const G = await loadGame('eggspress');
const levels = arg('levels') ? arg('levels').split(',').map(Number) : Array.from({ length: 19 }, (_, i) => i + 1).filter((n) => n % 5);
const seeds = (arg('seeds', '1,2,3')).split(',').map(Number);
const outFile = arg('out');
const found = outFile && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const STRETCH = 800;
let bad = 0;

/** Play a drive (its parts) in the real game from the start line: does the egg arrive? */
export function arrives(level, gameSeed, parts) {
  const s = G.start({ seed: gameSeed, level, unlimited: true }), g = s.game;
  let part = parts.start, n = -1, lost = 0;
  for (let i = 0; i < 400 / STEP && !s.cleared; i++) {
    if (s.state === 'playing') {
      if (s.livesLost > lost) { lost = s.livesLost; if (lost > 1 || !parts.flag || !g.flagged) break; part = parts.flag; n = 0; }
      if (n < 0) { s.hold([]); n = 0; }                           // a drive starts one engine step in (as a restart does)
      else { const ch = part[Math.floor(n++ / 12)]; s.hold(ch === 'G' ? ['right'] : ch === 'B' ? ['left'] : []); }
    } else s.hold([]);
    s.tick();
  }
  return { ok: s.cleared === 1 && s.livesLost === (parts.flag ? 1 : 0), x: g.car.x, cracks: g.egg.cracks, lost: s.livesLost };
}

/** Work out a drive from copy `m0` of the truck to the farm, a stretch at a time. { seq, m (where it got to), why } */
function drive(g, m0, goal) {
  const marks = [{ m: m0, seq: '' }];
  let fails = 0, why = '';
  while (marks[marks.length - 1].m.car.x < goal && fails < 12) {
    const here = marks[marks.length - 1];
    let done = false;
    // from here; if that can't be done, from one and two stretches back, thinking wider and further;
    // and only when no clean way is found, a way that costs the egg a crack (it can take two)
    for (const [back, width, depth, maxCracks] of [[0, 160, 130, 0], [0, 400, 150, 0], [1, 500, 260, 0], [2, 600, 300, 0], [0, 400, 150, 1], [1, 500, 260, 1], [2, 600, 300, 1]]) {
      if (back > marks.length - 1) continue;
      const st = marks[marks.length - 1 - back], toX = Math.min(here.m.car.x + STRETCH, goal), last = toX >= goal;
      if (st.m.egg.cracks + maxCracks > 2) continue;
      // a stretch ends at a speed the next one can live with, unless a chasm is coming (that wants all the speed there is)
      const chasm = g.gaps.some((q) => q.x0 > toX - 200 && q.x0 < toX + 1700);
      const r = findWay(g, toX, { from: st.m, width, depth, maxCracks, settled: !last, maxSpeed: last || chasm ? 0 : 400 });
      if (!r.ok) { why = `${Math.round(st.m.car.x)}→${Math.round(toX)}: ${r.why}`; continue; }
      if (back) marks.length -= back;
      marks.push({ m: r.end, seq: st.seq + r.seq });
      if (process.env.V) console.log(`   ${Math.round(st.m.car.x)}→${Math.round(r.end.car.x)} back ${back} width ${width} cracks now ${r.end.egg.cracks} speed ${Math.round(r.end.car.vx)}`);
      done = true;
      break;
    }
    if (!done) {
      // stuck, most often because the egg has no crack to spare: go back to before its latest crack
      // and look much harder there for a way that doesn't cost one
      let j = marks.length - 1;
      while (j > 0 && marks[j].m.egg.cracks === here.m.egg.cracks) j--;
      // (past the flag on the first egg there is a cheaper answer: let it go and restart at the flag)
      if (here.m.egg.cracks === 0 || ++fails > 1 || (!m0.flagged && here.m.car.x > g.checkX + 40)) { fails = 99; break; }
      const st = marks[j], toX = Math.min(marks[j + 1].m.car.x + 100, goal);
      if (process.env.V) console.log(`   stuck at ${Math.round(here.m.car.x)} with ${here.m.egg.cracks} cracks (${why}); redo ${Math.round(st.m.car.x)}→${Math.round(toX)} clean`);
      const r = findWay(g, toX, { from: st.m, width: 1000, depth: 320, maxCracks: 0, settled: true });
      if (!r.ok) { why += ` (and no clean way ${Math.round(st.m.car.x)}→${Math.round(toX)})`; fails = 99; break; }
      marks.length = j + 1;
      marks.push({ m: r.end, seq: st.seq + r.seq });
    }
  }
  return { ...marks[marks.length - 1], why, marks };
}

for (const level of levels) for (const seed of seeds) {
  const gameSeed = seed * 7919 + level * 31 + 1, key = roadKey(G.start({ seed: gameSeed, level }).game), t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(0);
  const kept = found[key] || ROUTES[key];
  if (kept && arrives(level, gameSeed, Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, unpack(v)]))).ok) { found[key] = kept; console.log(`delivery ${level} seed ${seed}: kept drive still arrives`); continue; }
  const s = G.start({ seed: gameSeed, level }), g = s.game;
  s.hold([]); s.tick();
  g.ensure(g.goalX + 3000);
  const goal = g.goalX + 25, base = model(g);
  const a = drive(g, clone(base), goal);
  let parts = null, note = '';
  if (a.m.car.x >= goal) parts = { start: a.seq };
  else {
    // one egg won't make it: let it go just past the flag, and drive on from there with a fresh one
    const past = a.marks.find((q) => q.m.car.x > g.checkX + 40);
    if (!past) { bad++; console.log(`delivery ${level} seed ${seed}: NO DRIVE FOUND: stuck at x=${Math.round(a.m.car.x)}, before the checkpoint flag at ${Math.round(g.checkX)} (${a.why})  [${secs()} s]`); continue; }
    const m = clone(past.m);
    let seq = past.seq, gone = false;
    for (let k = 0; k < 400 && !gone; k++) { const ch = Math.floor(k / 17) % 2 ? 'B' : 'G'; seq += ch; for (let i = 0; i < 12 && !gone; i++) gone = mstep(m, ch === 'G' ? 1 : -1); }   // rock the truck until the egg rolls off
    if (!gone) { bad++; console.log(`delivery ${level} seed ${seed}: could not let the egg go past the flag  [${secs()} s]`); continue; }
    const f = clone(base);
    f.flagged = true; f.respawnX = g.checkX + 20; f.spawn(f.respawnX); f.mcd = m.mcd.slice(); f.stuck = 0;
    mstep(f, 0);
    const b = drive(g, f, goal);
    if (b.m.car.x < goal) { bad++; console.log(`delivery ${level} seed ${seed}: NO DRIVE FOUND from the flag: stuck at x=${Math.round(b.m.car.x)} of ${g.goalX} (${b.why})  [${secs()} s]`); continue; }
    parts = { start: seq, flag: b.seq };
    note = ', letting one egg go at the flag';
  }
  const real = arrives(level, gameSeed, parts);
  if (!real.ok) { bad++; console.log(`delivery ${level} seed ${seed}: a drive was found but in the real game it ${real.lost > (parts.flag ? 1 : 0) ? 'loses the egg' : 'stops'} at x=${Math.round(real.x)}  [${secs()} s]`); continue; }
  found[key] = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, pack(v)]));
  console.log(`delivery ${level} seed ${seed}: arrives in ${((parts.start.length + (parts.flag?.length || 0)) / 10).toFixed(0)} s of driving${note}; ${real.cracks} crack(s) on the egg that arrives  [${secs()} s]`);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(found)); else save({ ...ROUTES, ...found });
}
process.exit(bad ? 1 : 0);

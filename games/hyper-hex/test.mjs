// node games/hyper-hex/test.mjs
// Plays the real Hyper Hex headless (tools/lib/headless.mjs) and proves:
//   1 · every wall pattern leaves a way through: no ring ever closes all six lanes, and at no
//       moment are all six lanes blocked at the arrow's orbit (levels 1–20, many seeds)
//   2 · levels can be finished after a real crash (the benchmark's bot lets a wall hit it, then
//       plays on) with the game's rules holding at every step; a crash costs one life, clears
//       the walls and starts the level clock again; the level ends on its survive goal
//   3 · a wall's side only blocks: holding a key into a wall beside you never costs a life
//   4 · GEM RUSH (bonus): the walls are ghosts, and it ends on its 15 s timer
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';

const G = await loadGame('hyper-hex');
const B = (await import('./bench.mjs')).default;
const t = reporter('hyper-hex');
const SIDES = 6, RP = 86;
const goalFor = (level) => Math.min(60, 20 + (level - 1) * 4);
const atOrbit = (w) => w.d <= RP + 5 && w.d + w.th >= RP - 5;

// ── 1 · every pattern leaves a way through ──
{
  let patterns = 0, rings = 0;
  for (let level = 1; level <= 20; level++) for (let seed = 1; seed <= 40; seed++) {
    const s = G.start({ seed: seed * 131 + level, level }), g = s.game;
    let bad = null;
    for (let n = 0; n < 12 && !bad; n++) {
      g.walls = [];
      const gap = g.spawnPattern(); patterns++;
      if (!(gap > 0 && gap < 12)) bad = `the wait after a pattern is ${gap} s`;
      const byRing = new Map();
      for (const w of g.walls) { if (!byRing.has(w.ring)) byRing.set(w.ring, new Set()); byRing.get(w.ring).add(w.side); }
      rings += byRing.size;
      for (const [, sides] of byRing) if (sides.size >= SIDES) bad = 'a ring closes all six lanes';
      // let the pattern close in with nobody there: some lane must stay open at the orbit
      const far = Math.max(...g.walls.map((w) => w.d + w.th));
      for (let d = 0; d < far && !bad; d += 1) {
        const blocked = new Set(g.walls.filter((w) => atOrbit({ d: w.d - d, th: w.th })).map((w) => w.side));
        if (blocked.size >= SIDES) bad = `all six lanes are blocked at once, ${d.toFixed(0)} px into the pattern`;
      }
    }
    if (bad) t.fail(`level ${level} seed ${seed}: ${bad}`);
  }
  t.check(patterns > 5000 && rings > patterns, `only ${patterns} patterns / ${rings} rings were checked`);
}

// ── 2 · finishable after a real crash; the crash rules ──
let runs = 0, crashes = 0;
for (const level of [1, 2, 3, 4, 6, 8, 9, 12, 16, 19]) {
  for (const seed of [1, 2]) {
    let prev = null, crashAt = null, bad = null;
    const r = botPlay(G, B, { level, seed, each: (g, s) => {
      if (prev && s.livesLost > prev.lost) {                       // first step back in play after a crash
        if (s.livesLost - prev.lost !== 1) bad = `a crash cost ${s.livesLost - prev.lost} lives`;
        if (g.clock > 2 * STEP) bad = `the clock was at ${g.clock.toFixed(2)} s after a crash (it should start again)`;
        if (g.walls.length) bad = `${g.walls.length} wall(s) were left on screen after a crash`;
        crashAt = prev.clock;
      }
      prev = { lost: s.livesLost, clock: g.clock };
      return bad;
    } });
    runs++; crashes += r.deaths;
    const g = r.shell.game;
    if (!t.check(r.cleared, `level ${level} seed ${seed}: ${why(r)} (clock ${g.clock.toFixed(1)} of ${g.goal} s, ${r.deaths} lives lost)`)) continue;
    t.check(r.mistakeMade && r.mistakeCost >= 1 && crashAt != null, `level ${level} seed ${seed}: the test's crash didn't cost a life`);
    t.check(g.goal === goalFor(level), `level ${level}: the goal is ${g.goal} s (should be ${goalFor(level)})`);
    t.check(g.clock >= g.goal && g.clock < g.goal + 2 * STEP, `level ${level} seed ${seed}: cleared with the clock at ${g.clock.toFixed(2)} of ${g.goal} s`);
  }
}

// ── 3 · a wall's side blocks, it doesn't kill ──
{
  let pushes = 0;
  for (const level of [1, 6, 12]) for (const dir of ['left', 'right']) {
    const s = G.start({ seed: 9, level }), g = s.game;
    g.nextSpawn = 1e9; g.walls = [];
    const here = Math.floor((((g.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 3)) % SIDES;
    const side = (here + (dir === 'right' ? 1 : SIDES - 1)) % SIDES;
    // a long wall in the lane next door, already across the orbit for the next half second
    g.walls.push({ side, d: RP - 4, th: g.wallSpeed * 0.5, passed: false, ring: 9999 });
    const a0 = g.angle;
    s.hold([dir]);
    s.run(0.4);
    pushes++;
    t.check(s.livesLost === 0, `level ${level}: holding ${dir} into the side of a wall cost a life`);
    t.check(Math.abs(g.angle - a0) < Math.PI / 3, `level ${level}: holding ${dir} carried the arrow through the side of a wall`);
    t.check(!g.hits(g.angle), `level ${level}: the arrow ended up inside the wall beside it`);
  }
  t.check(pushes === 6, 'the side-of-a-wall check did not run');
}

// ── 4 · GEM RUSH: ghost walls, ends on its timer ──
for (const level of [5, 10, 20]) {
  const s = G.start({ seed: level, level }), g = s.game;
  t.check(s.bonus && g.bonus, `level ${level} is not a GEM RUSH`);
  let through = 0;
  const secs = s.run(20, () => { if (g.hits(g.angle)) through++; return s.cleared > 0; });   // sit still: walls pass through
  t.check(s.cleared === 1 && Math.abs(secs - 15) < 0.1, `level ${level} (GEM RUSH): ended after ${secs.toFixed(1)} s (should end on the 15 s timer)`);
  t.check(s.livesLost === 0, `level ${level} (GEM RUSH): lost ${s.livesLost} lives to ghost walls`);
  t.check(through > 0, `level ${level} (GEM RUSH): no wall ever crossed the arrow, so the ghost walls were not tested`);
}

t.done(`every pattern leaves a way through; ${runs} levels finished after a crash (${crashes} lives lost on the way); wall sides block, GEM RUSH walls are ghosts`);

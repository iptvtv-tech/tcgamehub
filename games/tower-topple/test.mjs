// node games/tower-topple/test.mjs
// Plays the real Tower Topple headless (tools/lib/headless.mjs) and proves:
//   1 · levels can be finished after a real mistake (the benchmark's bot drops one floor wide of
//       the tower, then builds on) with the game's rules holding at every step; the level ends
//       on exactly its floor goal (8 floors at level 1, +2 a level, 30 at most)
//   2 · one floor at a time: pressing again while a floor falls does nothing, and there is
//       always a floor on the crane or in the air
//   3 · a miss costs exactly one life, keeps the tower as it was and hangs a new floor
//   4 · a toppled tower costs exactly one life, loses only the floors from the break up, and what
//       is left stands (the balance rule holds), so the level can still be built
//   5 · a dead-centre drop is a PERFECT and sits exactly on the floor below
//   6 · GOLDEN RUSH (bonus): nothing topples, a miss costs nothing, it ends on its 15 s timer
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';

const G = await loadGame('tower-topple');
const B = (await import('./bench.mjs')).default;
const t = reporter('tower-topple');
const W = 480, BASE_W = 150;
const goalFor = (level) => Math.min(30, 8 + (level - 1) * 2);
const press = (s) => { s.keyUp('action'); s.keyDown('action'); };
/** Wait (crane swinging) until `when(g)` is true, then drop and let the floor land. */
const dropWhen = (s, when, max = 20) => { s.keyUp('action'); s.run(max, () => s.state === 'playing' && s.game.hang && when(s.game)); press(s); return s.run(5, () => !s.game.fall); };
const stands = (g) => { for (let i = g.floors.length - 1; i >= 0; i--) { const sup = i ? g.floors[i - 1] : { x: W / 2, w: BASE_W }; if (Math.abs(g.com(i) - sup.x) > sup.w / 2 + 1e-6) return false; } return true; };

// ── 1 · finishable after a real mistake ──
let runs = 0, lost = 0;
for (const level of [1, 2, 3, 4, 6, 8, 9, 11, 14, 18]) {
  for (const seed of [1, 2]) {
    const r = botPlay(G, B, { level, seed });
    runs++; lost += r.deaths;
    const g = r.shell.game;
    if (!t.check(r.cleared, `level ${level} seed ${seed}: ${why(r)} (${g.floors.length}/${g.goal} floors, ${r.deaths} lives lost)`)) continue;
    t.check(r.mistakeMade && r.mistakeCost >= 1, `level ${level} seed ${seed}: the test's missed floor didn't cost a life`);
    t.check(g.goal === goalFor(level) && g.floors.length === g.goal, `level ${level} seed ${seed}: cleared on ${g.floors.length} floors, goal ${g.goal} (should be ${goalFor(level)})`);
  }
}

// ── 2 · one floor at a time ──
for (const level of [1, 7]) {
  const s = G.start({ seed: 4, level }), g = s.game;
  t.check(g.hang && !g.fall, `level ${level}: no floor on the crane at the start`);
  dropWhen(s, (gg) => Math.abs(gg.hookX() - W / 2) < 3, 10);
  // (dropWhen let it land; now drop one and hammer the button while it falls)
  const before = g.floors.length;
  s.run(0.4, () => !!g.hang);
  press(s);
  let both = 0, none = 0;
  s.run(3, () => { press(s); s.pointerDown(240, 400); s.pointerUp(); if (g.hang && g.fall) both++; if (!g.hang && !g.fall) none++; return !g.fall && g.hang; });
  t.check(both === 0 && none === 0, `level ${level}: a floor was hanging and falling at once (${both} steps) or the crane was empty (${none} steps)`);
  t.check(g.floors.length + s.livesLost <= before + 1, `level ${level}: hammering the button during one fall landed ${g.floors.length - before} floors`);
}

// ── 3 · a miss: one life, tower untouched, new floor on the crane ──
for (const level of [1, 4, 9]) {
  const s = G.start({ seed: 6, level, unlimited: true }), g = s.game;
  for (let i = 0; i < 3; i++) dropWhen(s, (gg) => Math.abs(gg.hookX() - W / 2) < 4);
  s.run(3, () => s.state === 'playing' && !!g.hang && !g.fall);
  const before = g.floors.map((f) => f.x), lives = s.livesLost;
  dropWhen(s, (gg) => Math.abs(gg.hookX() - W / 2) > 140);                 // crane far out: wide of the tower
  t.check(s.livesLost === lives + 1, `level ${level}: a floor dropped wide of the tower cost ${s.livesLost - lives} lives (should be 1)`);
  t.check(g.floors.length === before.length && g.floors.every((f, i) => f.x === before[i]), `level ${level}: a missed floor changed the tower (${before.length} → ${g.floors.length} floors)`);
  s.run(3, () => s.state === 'playing');
  t.check(s.state === 'playing' && g.hang && !g.fall, `level ${level}: no new floor on the crane after a miss`);
}

// ── 4 · a topple: one life, only the floors from the break up fall, the rest stands ──
{
  let topples = 0;
  for (const level of [2, 6, 12]) for (const side of [-1, 1]) {
    const s = G.start({ seed: 8 + level, level, unlimited: true }), g = s.game;
    g.wind = 0; g.quake = 0;
    // a staircase leaning one way: each floor inside the rules on its own, until the weight
    // of the floors above hangs past the floor below
    g.floors = []; g.hang = { w: 120, heavy: false, color: '#fff' }; g.fall = null;
    let x = W / 2;
    const lives = s.livesLost;
    let n = 0, fell = false;
    while (n < 12 && !fell) {
      x += side * 40;                                              // 40 px over each time (a floor is 120 wide)
      g.wind = 0;
      g.fall = { x, y: g.topY() - 20 - 30, vx: 0, vy: 0, ...g.hang }; g.hang = null;
      // the tower sways: put the floor where it lands 40 px off the one below at touch-down
      const below = g.floors.length ? g.floors[g.floors.length - 1] : { x: W / 2 };
      const before = g.floors.length;
      s.run(2, () => { if (g.fall) g.fall.x = below.x + (before ? g.sway(before - 1) : 0) + side * 40; return !g.fall; });
      n++;
      if (s.livesLost > lives) { fell = true; t.check(g.floors.length < before + 1, `level ${level}: the tower toppled but no floor fell`); }
      else t.check(g.floors.length === before + 1, `level ${level}: floor ${n} of the staircase did not land (${g.floors.length} floors)`);
      s.run(3, () => s.state === 'playing' && !!g.hang);
    }
    if (!t.check(fell, `level ${level}: a staircase of ${n} floors, each 40 px over, never toppled`)) continue;
    topples++;
    t.check(s.livesLost === lives + 1, `level ${level}: a topple cost ${s.livesLost - lives} lives (should be 1)`);
    t.check(g.floors.length >= 1 && g.floors.length < n, `level ${level}: ${g.floors.length} of ${n} floors left after the topple (the floors under the break should stay)`);
    t.check(stands(g), `level ${level}: what is left of the tower after a topple is still out of balance`);
    t.check(g.hang && !g.fall, `level ${level}: no new floor on the crane after a topple`);
  }
  t.check(topples === 6, `only ${topples} of 6 topples were tested`);
}

// ── 5 · dead centre = PERFECT, sitting exactly on the floor below ──
for (const level of [1, 5]) {
  const s = G.start({ seed: 2, level }), g = s.game;
  g.wind = 0;
  for (let i = 0; i < 4; i++) {
    g.fall = { x: 0, y: g.topY() - 60, vx: 0, vy: 0, ...g.hang }; g.hang = null;
    const n = g.floors.length, below = n ? g.floors[n - 1] : { x: W / 2 };
    const run0 = g.perfectRun;
    s.run(2, () => { if (g.fall) g.fall.x = below.x + (n ? g.sway(n - 1) : 0) + 3; return !g.fall; });   // 3 px off: inside the 5 px PERFECT window
    t.check(g.floors.length === n + 1 && g.perfectRun === run0 + 1, `level ${level}: a drop 3 px off centre was not a PERFECT`);
    const top = g.floors[n];
    t.check(top && Math.abs(top.x - below.x) < 1.5, `level ${level}: a PERFECT floor sits ${(top?.x - below.x).toFixed(1)} px off the floor below (it should snap on)`);
    s.run(1, () => !!g.hang);
  }
}

// ── 6 · GOLDEN RUSH: nothing topples, a miss is free, ends on its timer ──
for (const level of [5, 10]) {
  const s = G.start({ seed: level, level }), g = s.game;
  t.check(s.bonus && g.bonus, `level ${level} is not a GOLDEN RUSH`);
  let k = 0;
  const secs = s.run(20, () => { if (g.hang && !g.fall && k++ % 30 === 0) press(s); return s.cleared > 0; });   // drop anywhere, any time
  t.check(s.cleared === 1 && Math.abs(secs - 15) < 0.1, `level ${level} (GOLDEN RUSH): ended after ${secs.toFixed(1)} s (should end on the 15 s timer)`);
  t.check(s.livesLost === 0, `level ${level} (GOLDEN RUSH): lost ${s.livesLost} lives (nothing can topple and a miss is free)`);
  t.check(g.rushCount >= 3 && g.rushCount === g.floors.length, `level ${level} (GOLDEN RUSH): counted ${g.rushCount} floors with ${g.floors.length} on the tower`);
}

t.done(`${runs} levels finished after a missed floor (${lost} lives lost on the way); misses, topples, PERFECT drops and GOLDEN RUSH follow the rules`);

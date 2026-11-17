// node games/astro-blaster/test.mjs
// Plays the real Astro Blaster headless (tools/lib/headless.mjs) and proves:
//   1 · the ship fires ONLY while Space or the mouse button is held (the site's rule): moving
//       with the mouse or the arrow keys never fires; the fire rate is the game's (5 shots a
//       second, 11 with rapid fire; spread = 3 bullets a shot)
//   2 · levels can be finished after a real crash (the benchmark's bot flies into a rock, then
//       plays on), with the game's rules holding at every step, and the level ends on exactly
//       12 + 3 × level rocks
//   3 · after a lost life the ship comes back with clear space round it and can't be hit at once
//   4 · a shield takes one hit instead of a life
//   5 · the crystal storm (bonus) can't hurt you and ends on its timer
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';

const G = await loadGame('astro-blaster');
const B = (await import('./bench.mjs')).default;
const t = reporter('astro-blaster');
const W = 480, H = 720;

// ── 1 · fire only on Space or the mouse button ──
{
  // count bullets as they are created (they leave the list when they fly off or hit)
  const shots = (s, secs, drive) => {
    const g = s.game; let n = 0, seen = new WeakSet();
    g.rocks = []; g.bullets = []; g.spawnT = 1e9; g.cometT = 1e9; g.ufoT = 1e9;   // empty sky: only the trigger matters
    for (let i = 0; i < secs / STEP; i++) { drive?.(i * STEP); s.tick(); for (const b of g.bullets) if (!seen.has(b)) { seen.add(b); n++; } }
    return n;
  };
  for (const level of [1, 7]) {
    let s = G.start({ seed: 3, level });
    let n = shots(s, 3, (tt) => { s.hold(tt % 1 < 0.5 ? ['left', 'up'] : ['right', 'down']); s.pointerMove(240 + 200 * Math.sin(tt * 5), 500 + 100 * Math.cos(tt * 3)); });
    t.check(n === 0, `level ${level}: the ship fired ${n} shot(s) with no Space and no mouse button (arrow keys + mouse moves only)`);
    t.check(!s.game.hasFired, `level ${level}: the game thinks the player has fired, with no trigger held`);

    s = G.start({ seed: 3, level });
    n = shots(s, 3, () => s.hold(['action']));
    t.check(n >= 14 && n <= 16, `level ${level}: holding Space for 3 s fired ${n} shots (the game's rate is 5 a second)`);

    s = G.start({ seed: 3, level });
    s.pointerDown(240, 600);
    n = shots(s, 3);
    t.check(n >= 14 && n <= 16, `level ${level}: holding the mouse button for 3 s fired ${n} shots (5 a second)`);
    s.pointerUp();
    n = shots(s, 1);
    t.check(n === 0, `level ${level}: ${n} shot(s) after the mouse button was let go`);

    s = G.start({ seed: 3, level }); s.game.rapidT = 10;
    n = shots(s, 3, () => s.hold(['action']));
    t.check(n >= 32 && n <= 35, `level ${level}: rapid fire gave ${n} shots in 3 s (about 11 a second)`);

    s = G.start({ seed: 3, level }); s.game.spreadT = 10;
    n = shots(s, 3, () => s.hold(['action']));
    t.check(n >= 42 && n <= 48, `level ${level}: spread shot gave ${n} bullets in 3 s (3 a shot, 5 shots a second)`);
  }
}

// ── 2 · finishable after a real crash, rules holding, exact rock count ──
let runs = 0, crashes = 0;
for (const level of [1, 2, 4, 6, 7, 9, 12, 16, 19]) {
  for (const seed of [1, 2]) {
    const r = botPlay(G, B, { level, seed });
    runs++; crashes += r.deaths;
    if (!t.check(r.cleared, `level ${level} seed ${seed}: ${why(r)} (${r.shell.game.kills}/${r.shell.game.need} rocks, ${r.deaths} lives lost)`)) continue;
    t.check(r.mistakeMade && r.mistakeCost >= 1, `level ${level} seed ${seed}: the test's crash didn't cost a life`);
    const g = r.shell.game;
    t.check(g.need === 12 + 3 * level, `level ${level}: the goal is ${g.need} rocks (should be ${12 + 3 * level})`);
    // a shock chain can take several rocks on the last blast, never fewer than the goal
    t.check(g.kills >= g.need, `level ${level} seed ${seed}: cleared on ${g.kills} of ${g.need} rocks`);
  }
}

// ── 3 · a fair comeback after a lost life ──
{
  let checked = 0;
  for (const level of [3, 8, 14]) for (const seed of [1, 2, 3]) {
    const s = G.start({ seed: seed * 17 + level, level, unlimited: true }), g = s.game;
    const b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
    let crashed = false, back = null, lostAt = null, again = null;
    for (let i = 0; i < 40 / STEP && !s.cleared; i++) {
      if (s.state === 'playing') {
        b.t = i * STEP;
        if (!crashed && b.t > 2) crashed = B.mistake(g, s, b) && true; else B.bot(g, s, b);
      }
      const was = s.state, lost = s.livesLost;
      s.tick();
      if (s.livesLost > lost) { if (lostAt == null) lostAt = s.time; else if (again == null) again = s.time; }
      if (lostAt != null && back == null && was !== 'playing' && s.state === 'playing') {
        back = s.time;
        const near = g.rocks.filter((k) => k.type !== 'gem' && Math.hypot(k.x - g.ship.x, k.y - g.ship.y) < 200 - 1);
        t.check(near.length === 0, `level ${level} seed ${seed}: ${near.length} rock(s) within 200 px of the ship as it comes back`);
        t.check(g.enemyShots.length === 0, `level ${level} seed ${seed}: ${g.enemyShots.length} UFO shot(s) still flying as the ship comes back`);
        t.check(g.invuln > 2, `level ${level} seed ${seed}: only ${g.invuln.toFixed(2)} s of safety after coming back`);
        checked++;
      }
    }
    t.check(lostAt != null, `level ${level} seed ${seed}: the test's crash never happened`);
    if (again != null && back != null) t.check(again - back >= 2.2 - 0.02, `level ${level} seed ${seed}: a second life went ${(again - back).toFixed(2)} s after coming back (2.2 s of safety promised)`);
  }
  t.check(checked >= 6, `only ${checked} comebacks were checked`);
}

// ── 4 · a shield takes one hit ──
{
  const s = G.start({ seed: 5, level: 3 }), g = s.game;
  g.rocks = []; g.spawnT = 1e9; g.shield = true;
  g.addRock(g.ship.x, g.ship.y - 20, 2, 'rock', 0, 60);
  s.run(1);
  t.check(s.livesLost === 0, `a shielded ship lost ${s.livesLost} life to one rock`);
  t.check(!g.shield, 'the shield was still up after taking a hit');
  t.check(g.rocks.length === 0, 'the rock that hit the shield was not destroyed');
  g.invuln = 0;
  g.addRock(g.ship.x, g.ship.y - 20, 2, 'rock', 0, 60);
  s.run(1);
  t.check(s.livesLost === 1, `with the shield gone, the next rock cost ${s.livesLost} lives (should be 1)`);
}

// ── 5 · crystal storm: can't be hit, ends on its timer, counts no rocks ──
for (const level of [5, 10, 20]) {
  const s = G.start({ seed: level, level }), g = s.game;
  t.check(s.bonus && g.bonus, `level ${level} is not a crystal storm`);
  let x = 40, dir = 1;
  const secs = s.run(20, () => { x += dir * 4; if (x > W - 40 || x < 40) dir = -dir; s.hold(['action']); s.pointerMove(x, H * 0.5); return s.cleared > 0; });
  t.check(s.cleared === 1 && Math.abs(secs - 15) < 0.1, `level ${level} (crystal storm): ended after ${secs.toFixed(1)} s, cleared ${s.cleared} (should end on the 15 s timer)`);
  t.check(s.livesLost === 0, `level ${level} (crystal storm): lost ${s.livesLost} lives (you can't be hit there)`);
  t.check(g.kills === 0 && g.gemsGot > 0, `level ${level} (crystal storm): ${g.kills} rocks counted, ${g.gemsGot} crystals caught`);
}

t.done(`fires only on Space or the mouse button; ${runs} levels finished after a crash (${crashes} lives lost on the way); fair comebacks, shield and crystal storm hold`);

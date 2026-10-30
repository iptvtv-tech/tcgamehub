// node games/pinball-blast/test.mjs
// Regression test (29 Oct 2026 review): a full drop-target bank or N·E·O·N resets 0.8 s after it
// completes. That reset used setTimeout and was dropped if the ball drained, the game paused or
// the tab lost focus in that moment: the bank stayed down for good and its mission (and so the
// level) could never be completed. Plays the real game headless (tools/lib/headless.mjs).
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const P = await loadGame('pinball-blast');
const t = reporter('pinball-blast');
const TG = { x: 330, y: 300, h: 20 };       // only used for where the effects appear
const dropBank = (g) => { for (let i = 0; i < 5; i++) g.targetHit(i, TG); };
const lightLanes = (g) => { for (let i = 0; i < 4; i++) g.laneHit(i); };
const mission = (g, id) => g.missions.find((m) => m.id === id);

for (const level of [7, 8, 12, 17]) {
  for (const interrupt of ['ball lost', 'paused']) {
    const s = P.start({ seed: level, level, lives: 9 }), g = s.game;
    s.run(1);
    const m = mission(g, 'targets') || (g.missions.push({ id: 'targets', need: 2, have: 0 }), mission(g, 'targets'));
    const need = m.need, have0 = m.have;
    dropBank(g);
    // the moment the bank completes, the ball drains / the player pauses
    if (interrupt === 'ball lost') { g.balls = []; s.hurt(); s.run(3, () => s.state === 'playing'); }
    else { s.state = 'paused'; s.run(2); s.state = 'playing'; }
    s.run(1.2);
    const where = `level ${level}, ${interrupt} right after a full bank`;
    t.check(g.targetsDown.every((d) => !d), `${where}: targets still down ${JSON.stringify(g.targetsDown)} — the bank can never be dropped again`);
    dropBank(g); s.run(1.2);
    t.check(m.have >= Math.min(need, have0 + 2) || s.cleared, `${where}: second bank didn't count (${m.have}/${need})`);

    // the same for N·E·O·N
    const s2 = P.start({ seed: level + 50, level, lives: 9 }), g2 = s2.game;
    s2.run(1);
    lightLanes(g2);
    if (interrupt === 'ball lost') { g2.balls = []; s2.hurt(); s2.run(3, () => s2.state === 'playing'); }
    else { s2.state = 'paused'; s2.run(2); s2.state = 'playing'; }
    s2.run(1.2);
    t.check(g2.lanesLit.every((l) => !l), `level ${level}, ${interrupt} right after N·E·O·N: lanes stuck lit ${JSON.stringify(g2.lanesLit)}`);
  }
}
// Ball save with another ball in play (multiball, Frenzy): the saved ball must come back into the
// playfield. It used to go up the shooter lane, hit the gate the other ball had just closed, and
// drain again (29 Oct 2026 review).
for (const bonus of [false, true]) {
  const level = bonus ? 5 : 9;
  const s = P.start({ seed: 11, level, lives: 9 }), g = s.game;
  s.run(1);
  g.balls = [];
  const main = g.addBall(200, 300, 0, 0);
  g.addBall(240, 700, 0, 400);                            // a fresh ball (ball save still on) heading for the drain
  if (!bonus) g.multiball = true;
  const before = new Set(g.balls);
  let saved = null, reachedField = false;
  for (let i = 0; i < 120 * 3; i++) {
    Object.assign(main, { x: 200, y: 300, vx: 0, vy: 0 });  // the other ball stays up in the playfield
    s.tick();
    saved ||= g.balls.find((b) => !before.has(b));
    if (saved && saved.inPlay && saved.x < 420 && saved.y < 600) reachedField = true;
  }
  t.check(!!saved, `${bonus ? 'Frenzy bonus' : 'multiball'}: the draining ball wasn't saved`);
  t.check(reachedField, `${bonus ? 'Frenzy bonus' : 'multiball'}: the saved ball never got back into the playfield (stuck behind the lane gate)`);
}
// A trap door's "DOWN THE CHUTE!" exit (from level 2; up to 45% of trap doors from level 12)
// dropped the ball out under the flippers already heading for the drain: a lost life nobody could
// save (found by the benchmark, 30 Oct 2026). It must come out where the flippers can play it:
// the benchmark's expert bot saves almost every one.
const B = (await import('./bench.mjs')).default;
let chutes = 0, saved = 0;
for (const level of [4, 12, 18]) {
  for (let seed = 1; seed <= 8; seed++) {
    const s = P.start({ seed: seed * 13 + level, level, unlimited: true }), g = s.game;
    const b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
    let i = 0;
    for (; i < 120 * 6 && g.plungerBall; i++) { b.t = i / 120; B.bot(g, s, b); s.tick(); }    // launch
    if (g.plungerBall || !g.balls.length) continue;
    const ball = g.balls[0];
    g.balls = [ball]; g.multiball = false;
    ball.inPlay = false; ball.saveUntil = 0; ball.limbo = { t: 0, bad: true };         // it just fell down the chute
    s.tick(); i++;
    const out = g.balls.find((x) => x.inPlay);
    if (!t.check(!!out, `level ${level} seed ${seed}: no ball came out of the chute`)) continue;
    chutes++;
    const lives = s.lives;
    for (let k = 0; k < 120 * 4 && s.lives === lives && s.state === 'playing'; k++, i++) { b.t = i / 120; B.bot(g, s, b); s.tick(); }
    if (s.lives === lives && s.state === 'playing') saved++;
  }
}
t.check(chutes >= 20, `only ${chutes} chute exits tried`);
t.check(saved >= chutes * 0.8, `the expert bot saved only ${saved} of ${chutes} balls that came "down the chute" (it must be playable, not a certain drain)`);
t.done(`target bank and N·E·O·N always re-arm; a saved ball always gets back into play; ${saved}/${chutes} chute exits saved`);

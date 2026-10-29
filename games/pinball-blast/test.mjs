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
t.done('target bank and N·E·O·N always re-arm after a lost ball or a pause');

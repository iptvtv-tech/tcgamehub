// node games/tc-pixel-craft/test.mjs
// Regression test (29 Oct 2026 review): when you die, everything you carry drops into a grave.
// Dying again before you got back to it replaced that grave, and dying empty-handed deleted it,
// so the first grave's things (armour, altar materials) were gone for good. Plays the real game
// headless (tools/lib/headless.mjs): die with things, die again (empty-handed, or carrying
// something new), then walk to the grave and check every item comes back.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { B, I, INFO } from './items.js';
import { SX } from './world.js';

const G = await loadGame('tc-pixel-craft');
const t = reporter('tc-pixel-craft');
const count = (g, id) => g.inv.filter((x) => x && x.id === id).reduce((a, x) => a + x.n, 0);
// stand somewhere `dx` blocks east of spawn, on the ground, so the respawn isn't on the grave
const goTo = (g, dx) => { const x = g.spawn[0] + dx, z = g.spawn[2]; const y = g.world.top[Math.floor(z) * SX + Math.floor(x)] + 1; Object.assign(g.p, { x, y, z, vx: 0, vy: 0, vz: 0 }); };
const die = (s, g, dx) => { goTo(g, dx); g.hurtCd = 0; g.damage(999, 'fall'); s.run(3, () => s.state === 'playing'); };
const visitGrave = (s, g) => { if (!g.grave) return false; Object.assign(g.p, { x: g.grave.x, y: g.grave.y, z: g.grave.z, vx: 0, vy: 0, vz: 0 }); s.run(0.2); return true; };

for (const second of ['empty-handed', 'carrying something new']) {
  const s = G.start({ seed: 3, level: 1, lives: 5 }), g = s.game;
  s.run(1);
  g.give(B.LOG, 12); g.give(I.APPLE, 3);
  die(s, g, 20);                                                   // grave 1: 12 logs + 3 apples
  t.check(!!g.grave, `${second}: no grave after the first death`);
  if (second !== 'empty-handed') g.give(I.BERRIES, 5);
  die(s, g, -20);                                                  // die again elsewhere, before reaching it
  t.check(!!g.grave, `${second}: the grave is gone after dying again — its items are lost`);
  t.check(visitGrave(s, g) && !g.grave, `${second}: walking onto the grave didn't open it`);
  t.check(count(g, B.LOG) === 12 && count(g, I.APPLE) === 3, `${second}: got back ${count(g, B.LOG)}/12 logs and ${count(g, I.APPLE)}/3 apples from the first grave`);
  if (second !== 'empty-handed') t.check(count(g, I.BERRIES) === 5, `${second}: got back ${count(g, I.BERRIES)}/5 berries from the second death`);
}
// Holding a block made matching blocks unbreakable (found by the benchmark, 30 Oct 2026): blocks
// carry a `tool` (the tool that's best on them) but no `speed`, so with a log in hand the next log
// took NaN seconds to break, and never did. The first log you chop lands in the selected slot.
for (const [target, held] of [[B.LOG, B.LOG], [B.GRASS, B.DIRT], [B.DIRT, B.DIRT], [B.STONE, B.COBBLE]]) {
  const g = G.start({ seed: 3, level: 1 }).game;
  const bt = g.breakTime(target, INFO[held]), bare = g.breakTime(target, null);
  t.check(Number.isFinite(bt) && bt === bare, `holding ${INFO[held].name || held}, a ${INFO[target].name || target} takes ${bt} s to break (empty-handed ${bare} s)`);
}
t.done('dying again never loses the first grave; a block in hand never stops you breaking blocks');

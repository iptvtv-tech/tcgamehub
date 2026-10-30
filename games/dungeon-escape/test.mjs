// node games/dungeon-escape/test.mjs
// Regression tests (found by the benchmark, 30 Oct 2026). Builds real mazes headless
// (tools/lib/headless.mjs).
//  1. A Treasure Vault chest could be placed inside a pillar (a quarter of vaults), or two chests
//     on one square: points nobody could collect.
//  2. Two spike traps side by side, each on its own rhythm, could leave no moment to cross both
//     (you need ~0.37 s in each square at full pace); with the stairs or a key behind them the
//     level could never be finished (level 4, seed 7 was one). Traps are never adjacent now.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const G = await loadGame('dungeon-escape');
const t = reporter('dungeon-escape');

let vaults = 0;
for (let seed = 1; seed <= 200; seed++) for (const level of [5, 10, 15, 20]) {
  const g = G.start({ seed, level }).game; vaults++;
  const chests = g.items.filter((it) => it.kind === 'chest');
  t.check(chests.length === 3, `vault ${level} seed ${seed}: ${chests.length} chests, not 3`);
  for (const c of chests) t.check(g.open(Math.floor(c.x), Math.floor(c.y)), `vault ${level} seed ${seed}: a chest is inside a pillar at (${c.x}, ${c.y})`);
  t.check(new Set(chests.map((c) => `${c.x},${c.y}`)).size === chests.length, `vault ${level} seed ${seed}: two chests on one square`);
}
let mazes = 0, traps = 0;
for (let level = 3; level <= 20; level++) {
  if (level % 5 === 0) continue;
  for (let seed = 1; seed <= 100; seed++) {
    const g = G.start({ seed, level }).game; mazes++; traps += g.spikes.length;
    const pair = g.spikes.find((a) => g.spikes.some((b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1));
    t.check(!pair, `level ${level} seed ${seed}: two spike traps side by side at (${pair?.x}, ${pair?.y})`);
  }
}
t.done(`${vaults} vaults with every chest on open floor; ${mazes} mazes, ${traps} traps, none side by side`);

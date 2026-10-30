// node games/void-breaker/test.mjs
// Regression test (found by the benchmark bot's author, 30 Oct 2026): on the Daily Challenge every
// enemy spawns round a seeded angle so all players face the same waves, but swarm groups (from
// level 12) still spawned round wherever the player happened to be looking. Builds the real waves
// headless (tools/lib/headless.mjs).
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const warn = console.warn;                                 // headless has no WebGL: the game says so on every start
console.warn = (...a) => { if (!/WebGL/i.test(String(a[0]))) warn(...a); };
const G = await loadGame('void-breaker');
const t = reporter('void-breaker');
const wave = (seed, level, yaw) => {
  const s = G.start({ seed, level, unlimited: true }), g = s.game;
  s.daily = true;
  g.startLevel(level, false);
  g.yaw = yaw; g.maxAlive = 999;
  for (let i = 0; i < 60 && g.spawned < g.total; i++) g.spawnWave(5);
  return g.enemies.map((e) => `${e.kind}@${e.pos.map((v) => v.toFixed(2)).join(',')}`);
};
let swarms = 0;
for (const level of [12, 13, 16, 19]) for (const seed of [1, 2, 3]) {
  const a = wave(seed, level, 0), b = wave(seed, level, 2.4);
  swarms += a.filter((x) => x.startsWith('swarm')).length;
  const diff = a.findIndex((x, i) => x !== b[i]);
  t.check(diff < 0 && a.length === b.length, `Daily, level ${level} seed ${seed}: the wave changes with where you look (enemy ${diff}: ${a[diff]} vs ${b[diff]})`);
}
t.check(swarms > 0, 'no swarms were spawned, so the test checked nothing');
t.done(`Daily waves are the same whichever way you look (${swarms} swarm enemies checked)`);

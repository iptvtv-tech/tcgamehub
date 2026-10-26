// node games/orbit-hopper/check.mjs [--levels 30] [--seeds 40]
// Proves every generated level can be finished: a hop route exists from the start
// planet to the beacon using the game's own physics (world.js), and no planet overlaps.
import { makeLevel, route, levelSpec, reachable } from './world.js';
import { makeRng } from '../../assets/js/rng.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 30), SEEDS = arg('--seeds', 40);
let bad = 0, hops = 0, n = 0, directs = 0;
for (let level = 1; level <= LEVELS; level++) {
  let worst = 0, sumHops = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rng = makeRng(seed * 7919 + level);
    const { planets } = makeLevel(level, rng);
    for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i], b = planets[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 60) { console.log(`L${level} seed ${seed}: planets ${i} and ${j} too close`); bad++; }
    }
    const r = route(planets, level);
    if (!r) { console.log(`L${level} seed ${seed}: beacon unreachable`); bad++; continue; }
    const direct = reachable(planets, planets[0], level).has(planets[planets.length - 1]);
    if (direct) directs++;
    sumHops += r.length - 1; worst = Math.max(worst, r.length - 1); hops += r.length - 1; n++;
  }
  console.log(`L${level.toString().padStart(2)}: ${levelSpec(level).count} planets · route ${(sumHops / SEEDS).toFixed(1)} hops avg, ${worst} worst`);
}
console.log(bad ? `\n${bad} problem(s)` : `\nOK — ${n} levels checked, ${(hops / n).toFixed(1)} hops on average, ${directs} start→beacon one-hop shortcuts`);
process.exit(bad ? 1 : 0);

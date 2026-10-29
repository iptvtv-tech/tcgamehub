// node games/orbit-hopper/test.mjs [--levels 40] [--seeds 400]
// Regression test (29 Oct 2026 review): from level 4 some planets swing left and right. A planet
// near the edge could swing far enough to carry the orbiting hopper past the void line, so letting
// go there cost a life on the first frame of flight. Builds real levels (tools/lib/headless.mjs)
// and checks, over a full swing, that every planet stays on screen and every point of its orbit
// stays inside the void bounds.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { W, ORBIT_GAP, bounds } from './world.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 40), SEEDS = arg('--seeds', 400);
const OH = await loadGame('orbit-hopper');
const t = reporter('orbit-hopper');

let levels = 0, moving = 0;
for (let level = 4; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;
  let bad = 0;
  for (let seed = 1; seed <= SEEDS && bad < 2; seed++) {
    const s = OH.start({ seed: seed * 613 + level, level });
    const g = s.game; levels++;
    const b = bounds(g.planets);
    for (const p of g.planets) {
      if (!p.amp) continue;
      moving++;
      for (const side of [-1, 1]) {
        const x = p.x0 + side * p.amp;
        const orbitEdge = x + side * (p.r + ORBIT_GAP);
        if (x - p.r < 0 || x + p.r > W) { t.fail(`level ${level} seed ${seed}: planet ${p.i} swings off screen (centre ${x.toFixed(0)}, r ${p.r.toFixed(0)})`); bad++; break; }
        if (orbitEdge < b.x0 || orbitEdge > b.x1) { t.fail(`level ${level} seed ${seed}: planet ${p.i}'s orbit swings into the void (x ${orbitEdge.toFixed(0)})`); bad++; break; }
      }
    }
  }
}
t.done(`${levels} levels, ${moving} swinging planets, all on screen with their orbits inside the bounds`);

// node games/eggspress/check.mjs [--all]
// Road checker for Eggspress: proves that ramps and chasms can be CROSSED WITH THE EGG. For each
// one in the list below it builds the real road headless (tools/lib/headless.mjs), puts the truck
// down a way before it and searches for a way over (road-search.mjs: thousands of ways of driving,
// played out with the game's own physics). One crack is allowed; losing the egg is not.
//
// Why: on the roads before 17 Nov 2026 this search found NO way over many of them. From delivery
// 11 about half the roads had a ramp on a climb or at the foot of a steep drop (a wall), and most
// chasms had a hilly run-up, or a gust, oil, a moon patch or a mushroom in the way. Ramps and
// chasms now stand on flat, clear pads. games/eggspress/test.mjs checks that shape on every road;
// this checks, on a sample from the late deliveries, that the shape is enough.
// --all adds a wider sample (a few minutes more).
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { findWay } from './road-search.mjs';

const G = await loadGame('eggspress');
const t = reporter('eggspress roads');
// [delivery, road, x of the lip] (road n is game seed n × 7919 + delivery × 31, as the benchmark uses)
const RAMPS = [[11, 1, 5719], [13, 23, 1800], [16, 29, 1800], [18, 6, 3968]];
const CHASMS = [[8, 34, 12921], [13, 32, 6155], [16, 35, 18634], [19, 32, 6284]];
const MORE_RAMPS = [[12, 10, 13993], [12, 30, 18150], [14, 17, 1800], [16, 6, 1800], [17, 15, 24453], [18, 22, 24405]];
const MORE_CHASMS = [[6, 31, 11007], [9, 35, 6723], [11, 31, 2900], [14, 31, 20106], [17, 35, 24278], [18, 36, 9990]];
const all = process.argv.includes('--all');

function cross(level, road, x, kind) {
  const find = (g) => g.ramps.find((r) => !!r.gap === (kind === 'chasm') && Math.abs(r.x - x) < 3);
  let last = null;
  // from a standing start a way back, then from further back (more room to get up to speed)
  for (const [back, depth] of kind === 'chasm' ? [[1000, 130], [2000, 220]] : [[700, 120], [1100, 130]]) {
    const s = G.start({ seed: road * 7919 + level * 31, level, unlimited: true }), g = s.game;
    g.ensure(x + 4000);
    const rp = find(g);
    if (!rp) return { ok: false, why: `there is no ${kind} at x=${x} on this road any more (update the list in check.mjs)` };
    g.spawn(x - back); g.respawnX = x - back;
    s.run(1);                                                   // let the truck settle on its wheels
    if (s.livesLost) { last = { ok: false, why: 'the egg was lost just standing at the start point' }; continue; }
    for (const maxCracks of [0, 1]) {
      last = findWay(g, x + (rp.w || 0) + (kind === 'chasm' ? 500 : 420), { maxCracks, depth });
      if (last.ok) return last;
    }
  }
  return last;
}

let n = 0, clean = 0;
for (const [kind, list] of [['ramp', all ? [...RAMPS, ...MORE_RAMPS] : RAMPS], ['chasm', all ? [...CHASMS, ...MORE_CHASMS] : CHASMS]]) {
  for (const [level, road, x] of list) {
    const r = cross(level, road, x, kind);
    n++; if (r.ok && !r.cracks) clean++;
    t.check(r.ok, `delivery ${level}, road ${road}: no way over the ${kind} at x=${x} with the egg (${r.why})`);
  }
}
t.done(`${n} ramps and chasms on late-delivery roads can all be crossed with the egg (${clean} without a crack)`);

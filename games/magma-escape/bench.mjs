// Benchmark contract for Magma Escape (see tools/bench.mjs).   Try it: node tools/bench.mjs --games=magma-escape
// The bot (bot.js) climbs with the route planner (plan.js) through the D-pad and SLASH only, and
// fights the embers it meets. The mistake: walking off the ledge it stands on and falling (into the
// lava pool, from the start ledge), losing the height it had climbed.
import { botStep, rulesBroken } from './bot.js';
import { TILE, ROCK, isFloor, tileAt } from './world.js';

export default {
  limit: () => 240,                    // seconds the expert may take on a level (the climb takes well under a minute)
  stuck: 40,                           // 40 s without climbing higher = stuck (the lava melts him long before that)

  // how high he has climbed since his last start (a lost heart starts the level again, so it can fall back),
  // and in a boss arena, how many hits the boss has taken
  progress: (g) => Math.round((g.sim.m.spawn.y - g.sim.p.best) / 24) + (g.sim.boss ? (g.sim.boss.max - g.sim.boss.hp) * 3 : 0),

  invariants: (g, s) => rulesBroken(s),

  bot: (g, s, b) => botStep(s, b, b.mem),

  // one real mistake: walk off the nearer open edge of the floor he stands on, and fall
  mistake(g, s, b) {
    const p = g.sim.p, m = g.sim.m, mk = (b.mem.mistake ||= { t: 0, y0: null });
    mk.t += 1 / 120;
    const finish = () => { s.hold([]); b.mem.bot = null; return true; };
    if (mk.y0 != null && !p.ground && p.vy > 0 && p.y > mk.y0 + 12) return finish();   // over the edge and falling
    if (mk.t > 5 || p.dead) return finish();
    if (!p.ground) { s.hold([]); return false; }        // mid-jump when asked: land first
    if (mk.y0 == null) mk.y0 = p.y;
    const r = Math.round(p.y / TILE), c = Math.floor(p.x / TILE);
    let l = c; while (l > 1 && isFloor(tileAt(m, l - 1, r))) l--;
    let e = c; while (e < m.C - 2 && isFloor(tileAt(m, e + 1, r))) e++;
    const openL = l > 1 && tileAt(m, l - 1, r - 1) !== ROCK, openR = e < m.C - 2 && tileAt(m, e + 1, r - 1) !== ROCK;
    const goLeft = openL && (!openR || p.x - l * TILE < (e + 1) * TILE - p.x);
    s.hold([goLeft ? 'left' : 'right']);
    return false;
  },
};

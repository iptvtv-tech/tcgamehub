// Benchmark contract for Inferno Vault (see tools/bench.mjs).   Try it: node tools/bench.mjs --games=inferno-vault
// The bot (bot.js) works its way down with the route planner (plan.js) through the D-pad and SLASH
// only, playing each move forward first so it stays out of the lanterns. The mistake: walking
// straight into a guard's lantern on the floor it stands on (seen: the guard throws fire), or, on
// a floor with no guard, into the lava.
import { botStep, rulesBroken } from './bot.js';
import { TILE, LAVA, tileAt } from './world.js';

export default {
  levels: 16,                          // the 15 levels and the secret one (The Heart of the Vault)
  limit: () => 240,                    // seconds the expert may take on a level (it takes well under a minute)
  stuck: 45,                           // 45 s without getting deeper, a takedown or an opal = stuck

  // how deep he has got since his last start, plus the guards put out and the opals taken
  progress: (g) => {
    const sim = g.sim, mem = (g._benchDepth ||= { sim: null, best: 0 });
    if (mem.sim !== sim || sim.t < (mem.t ?? 0)) { mem.sim = sim; mem.best = sim.p.y; }
    mem.t = sim.t; mem.best = Math.max(mem.best, sim.p.y);
    return Math.round((mem.best - sim.m.spawn.y) / TILE) + sim.takedowns * 100 + sim.opals.filter((o) => o.got).length * 1000;
  },

  invariants: (g, s) => rulesBroken(s),

  bot: (g, s, b) => botStep(s, b, b.mem),

  // one real mistake: walk into the light of the guard on this floor, or into the lava
  mistake(g, s, b) {
    const sim = g.sim, p = sim.p, m = sim.m, mk = (b.mem.mistake ||= { t: 0, hp: null });
    mk.t += 1 / 120;
    const finish = () => { s.hold([]); b.mem.bot = null; return true; };
    if (p.dead || mk.t > 60) return finish();
    if (mk.hp != null && (p.hp < mk.hp || sim.guards.some((q) => q.state === 'alert'))) return finish();   // seen or burned
    if (!p.ground) { if (mk.hp == null) botStep(s, b, b.mem); else s.hold([]); return false; }
    const guard = sim.guards.find((q) => q.state !== 'down' && Math.abs(q.y - p.y) < 4);
    let dir = 0;
    if (guard) dir = Math.sign(guard.x - p.x) || 1;
    else {
      const r = Math.round(p.y / TILE);
      let best = null;
      for (let c = 0; c < m.C; c++) if (tileAt(m, c, r) === LAVA && (best == null || Math.abs(c * TILE + 12 - p.x) < Math.abs(best - p.x))) best = c * TILE + 12;
      if (best != null) dir = Math.sign(best - p.x) || 1;
    }
    if (!dir) { mk.hp = null; botStep(s, b, b.mem); return false; }   // nothing to blunder into on this floor yet: play on
    if (mk.hp == null) { mk.hp = p.hp; b.mem.bot = null; }
    s.hold([dir < 0 ? 'left' : 'right']);
    return false;
  },
};

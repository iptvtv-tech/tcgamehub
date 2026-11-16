// Benchmark contract for Station Defense (see tools/bench.mjs).
// The bot plays through taps, like a phone player: tap a pad, tap a turret in the ring that opens;
// tap a turret, tap its upgrade; tap the lane to fire the station cannon. Its plan is the one the
// level checker (check.mjs) proves the levels with: a mix of the unlocked turrets on the pads that
// cover the most lane, upgrades once six are down, and the cannon at the thickest knot of ships,
// led along the lane. Lower skill thinks more slowly and aims wider.
// The mistake: the commander sells every turret and does nothing until the shields fall and a
// life is lost.
import { TURRETS, CANNON, SHIELDS, W, H, OY, SX, SY, pointAt } from './sim.js';

const ORDER = ['laser', 'missile', 'laser', 'tesla', 'cryo', 'missile', 'tesla', 'laser', 'missile', 'tesla', 'cryo', 'laser'];
const kindFor = (level, i) => {
  const k = ORDER[i % ORDER.length];
  if (TURRETS[k].unlock <= level) return k;
  return TURRETS.missile.unlock <= level && i % 2 ? 'missile' : 'laser';
};

/** What to do next with the credits: { pad, act: 'build', kind } | { pad, act: 'up' } | null. */
function wish(g) {
  const sim = g.sim;
  const pads = [...sim.map.pads].sort((a, b) => b.cover - a.cover);
  const i = pads.findIndex((p) => !sim.turretAt(p));
  const want = i >= 0 ? kindFor(g.level, i) : null;
  if (want && sim.credits >= TURRETS[want].cost) return { pad: pads[i], act: 'build', kind: want };
  if (!want || sim.turrets.length >= 6) {
    const up = sim.turrets.filter((t) => t.tier < 2).sort((a, b) => b.pad.cover - a.pad.cover || a.tier - b.tier)[0];
    if (up && sim.credits >= TURRETS[up.kind].tiers[up.tier + 1].up) return { pad: up.pad, act: 'up' };
  }
  return null;
}

export default {
  levels: 20,
  limit: () => 900,
  stuck: 120,                              // a wave and its breather are well under two minutes

  // ships dealt with, waves launched (bonus rounds are not judged on progress)
  progress: (g) => (g.sim ? (g.sim.wave + 1) * 1000 + g.sim.cleared.reduce((a, n) => a + (n || 0), 0) + g.sim.turrets.length : 0),

  invariants(g) {
    const sim = g.sim;
    if (!sim) return null;
    if (!Number.isFinite(sim.credits) || sim.credits < 0) return `credits are ${sim.credits}`;
    if (sim.shields < 0 || sim.shields > SHIELDS) return `shields are ${sim.shields} of ${SHIELDS}`;
    if (sim.wave >= sim.waves) return `wave ${sim.wave + 1} of ${sim.waves}`;
    if (new Set(sim.turrets.map((t) => t.pad)).size !== sim.turrets.length) return 'two turrets share a pad';
    for (const t of sim.turrets) if (!sim.map.pads.includes(t.pad)) return 'a turret is not on a build pad';
    for (const e of sim.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) return 'a ship has a position or health that is not a number';
      if (e.x < -60 || e.x > W + 60 || e.y < -120 || e.y > H + 60) return `a ship left the map at (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`;
    }
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    if (g.storm) {                                          // meteor storm: shoot the lowest rock
      const rock = [...g.storm.rocks].sort((a, c) => c.y - a.y)[0];
      if (rock && g.storm.cd <= 0) s.tap(rock.x + (b.rand() - 0.5) * (1 - b.skill) * 60, Math.min(H - 4, Math.max(OY + 4, rock.y)));
      return;
    }
    const sim = g.sim;
    if (!sim || sim.done || sim.down) return;
    m.think = (m.think ?? 0) - 1 / 120;
    if (m.think <= 0) {
      m.think = 0.25 + (1 - b.skill) * 0.9;
      if (g.sel) {
        // a ring is open: tap what we came for, or tap the pad's own centre... anywhere else closes it
        const it = g.menuItems().find((x) => x.ok && (x.act === 'build' ? m.want?.act === 'build' && x.kind === m.want.kind : x.act === m.want?.act));
        if (it && m.want?.pad === g.sel.pad) s.tap(it.x, it.y); else s.tap(W - 6, OY + 6);
        m.want = null;
        return;
      }
      const w = wish(g);
      if (w) { m.want = w; s.tap(w.pad.x, w.pad.y); return; }
    }
    if (g.sel) return;                                      // never fire into an open ring
    if (sim.cannonCd === 0 && sim.enemies.length) {
      let best = null, bn = -1;
      for (const e of sim.enemies) {
        let n = 0;
        for (const f of sim.enemies) if (Math.hypot(f.x - e.x, f.y - e.y) < CANNON.splash) n++;
        if (n > bn || (n === bn && e.d > best.d)) { bn = n; best = e; }
      }
      const T = Math.hypot(best.x - SX, best.y - (SY - 16)) / CANNON.speed;
      const [x, y] = pointAt(best.lane, Math.min(best.lane.len, best.d + best.speed * T));
      const wide = 10 + (1 - b.skill) * 70;
      const tx = x + (b.rand() - 0.5) * 2 * wide, ty = Math.min(H - 4, Math.max(OY + 4, y + (b.rand() - 0.5) * 2 * wide));
      if (!g.padAt(tx, ty)) s.tap(tx, ty);                  // a tap on a pad would open its ring instead
    }
  },

  // sell every turret (at the 70% sell-back) and then do nothing until the station goes down.
  // On the first levels too few ships come to break ten shields, so the level may simply end
  // with the shields battered; that still counts as finishing it after bad play.
  mistake(g, s, b) {
    if (!g.sim) return true;
    const m = b.mem;
    m.lives0 ??= s.livesLost;
    for (const t of [...g.sim.turrets]) g.sim.sell(t);
    g.sel = null;
    return s.livesLost > m.lives0;
  },
};

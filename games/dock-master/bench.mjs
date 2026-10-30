// Benchmark contract for Dock Master (see tools/bench.mjs). The bot is a traffic controller:
// it routes each ship to its bay once it has "noticed" it (slower at lower skill), steering
// around the station hull the way a player draws round it. Lower skill also sends the odd ship
// to the wrong bay first. The mistake: two drifting ships put on a collision course.
import { CX, CY, STATION_R, BAY_R, W, H, WRAP } from './world.js';

const bayFor = (g, sh) => g.bays.find((b) => b.color === sh.color);

/** Straight to the bay mouth, or round the hull on a ring outside the bays when the line hits it. */
function routeTo(sh, b) {
  const ring = STATION_R + BAY_R * 2 + 24;
  const dx = b.mx - sh.x, dy = b.my - sh.y;
  const k = Math.max(0, Math.min(1, ((CX - sh.x) * dx + (CY - sh.y) * dy) / (dx * dx + dy * dy || 1)));
  if (Math.hypot(sh.x + dx * k - CX, sh.y + dy * k - CY) > STATION_R + sh.r + 6) return [{ x: b.mx, y: b.my }];
  const a = Math.atan2(sh.y - CY, sh.x - CX);
  let d = b.a - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(d) / 0.35)), pts = [];
  for (let i = 0; i <= n; i++) { const t = a + (d * i) / n; pts.push({ x: CX + Math.cos(t) * ring, y: CY + Math.sin(t) * ring }); }
  pts.push({ x: b.mx, y: b.my });
  return pts;
}

export default {
  levels: 20,
  limit: (level) => 120 + level * 12,
  stuck: 45,
  progress: (g) => g.docked,

  invariants(g) {
    if (g.docked > g.spec.quota && !g.bonus) return `docked ${g.docked} is over the quota ${g.spec.quota}`;
    for (const sh of g.ships) {
      if (!Number.isFinite(sh.x) || !Number.isFinite(sh.y)) return 'a ship position is not a number';
      if (sh.x < -WRAP - 20 || sh.x > W + WRAP + 20 || sh.y < -WRAP - 20 || sh.y > H + WRAP + 20) return `a ship drifted out of the world at (${sh.x.toFixed(0)}, ${sh.y.toFixed(0)})`;
    }
    if (new Set(g.bays.map((b) => b.color)).size !== g.bays.length) return 'two bays share a colour';
    return null;
  },

  bot(g, s, b) {
    const react = 0.2 + (1 - b.skill) * 2.2;                // seconds before a new ship is routed
    for (const sh of g.ships) {
      if (sh.dock) continue;
      sh._seen ??= b.t;
      if (sh.path.length || b.t - sh._seen < react) continue;
      let bay = bayFor(g, sh);
      if (b.rand() < (1 - b.skill) * 0.15) bay = g.bays[Math.floor(b.rand() * g.bays.length)];   // a misread
      sh.path = routeTo(sh, bay);
    }
  },

  mistake(g) {
    const free = g.ships.filter((sh) => !sh.dock);
    if (free.length < 2) return false;
    const [a, c] = free;
    a.path = []; c.path = [{ x: a.x, y: a.y }];             // steer one straight into the other
    c.x = a.x + 30; c.y = a.y;
    return true;
  },
};

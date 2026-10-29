// node games/dock-master/test.mjs [--levels 19] [--seeds 8]
// Plays real Dock Master levels headless (tools/lib/headless.mjs) and proves every level can
// still be FINISHED after crashes. Regression test for the 29 Oct 2026 report: on level 6 a
// crash destroyed two ships, nothing replaced them, and the level sat at 15/17 for ever.
//   perfect · every ship docks the moment it appears, except for two forced crashes
//   routes   · every ship flies a route to its bay (around the station if needed); crossings
//              crash naturally
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 19), SEEDS = arg('--seeds', 8);
const DM = await loadGame('dock-master');
DM.world = await import('./world.js');
const t = reporter('dock-master');
const bayFor = (g, sh) => g.bays.find((b) => b.color === sh.color);

// A route a player would draw: straight to the bay, or around the station's hull when the
// straight line would hit it (waypoints on a ring outside the bays, then into the mouth).
function routeTo(sh, b) {
  const { CX, CY } = DM.world, ring = DM.world.STATION_R + DM.world.BAY_R * 2 + 24;
  const seg = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, k = Math.max(0, Math.min(1, ((CX - ax) * dx + (CY - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(ax + dx * k - CX, ay + dy * k - CY); };
  if (seg(sh.x, sh.y, b.mx, b.my) > DM.world.STATION_R + sh.r + 6) return [{ x: b.mx, y: b.my }];
  let a = Math.atan2(sh.y - CY, sh.x - CX);
  let d = b.a - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const pts = [], n = Math.max(1, Math.ceil(Math.abs(d) / 0.35));
  for (let i = 0; i <= n; i++) { const t = a + (d * i) / n; pts.push({ x: CX + Math.cos(t) * ring, y: CY + Math.sin(t) * ring }); }
  pts.push({ x: b.mx, y: b.my });
  return pts;
}

function play(level, seed, mode) {
  const s = DM.start({ seed: seed * 101 + level, level, lives: 99 });
  const g = s.game;
  const quota = g.spec.quota;
  const limit = quota * g.spec.spawnEvery * 3 + 120;      // generous: a stuck level never gets here
  const crashAt = [Math.ceil(quota / 3), Math.ceil((2 * quota) / 3)];
  let crashes = 0;
  const secs = s.run(limit, () => {
    if (s.cleared) return true;
    if (s.state !== 'playing') return false;
    const free = g.ships.filter((sh) => !sh.dock);
    if (mode === 'perfect') {
      if (crashes < 2 && g.docked >= crashAt[crashes]) {
        if (free.length >= 2) { free[1].x = free[0].x + 4; free[1].y = free[0].y; free[0].path = []; free[1].path = []; crashes++; }
        return false;                                       // hold off docking until two ships are out
      }
      for (const sh of free) { const b = bayFor(g, sh); sh.x = b.mx; sh.y = b.my; sh.path = [{ x: b.mx, y: b.my }]; }
    } else {
      for (const sh of free) if (!sh.path.length) sh.path = routeTo(sh, bayFor(g, sh));
    }
    return false;
  });
  return { cleared: !!s.cleared, secs, docked: g.docked, quota, spawned: g.spawned, alive: g.ships.length + g.incoming.length, lost: s.livesLost };
}

let runs = 0, crashesSeen = 0;
for (let level = 1; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;                          // Rush Hour bonus rounds end on their timer
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const mode of ['perfect', 'routes']) {
      const r = play(level, seed, mode);
      runs++; crashesSeen += r.lost;
      t.check(r.cleared, `level ${level} seed ${seed} (${mode}): never finished — docked ${r.docked}/${r.quota}, ${r.alive} ship(s) left, ${r.spawned} spawned, ${r.lost} crash(es)`);
      // the second forced crash can be pre-empted when stray ships dock on their own; one is enough
      if (mode === 'perfect') t.check(r.lost >= 1, `level ${level} seed ${seed}: the test's forced crash didn't happen`);
    }
  }
}
t.done(`${runs} level runs finished, ${crashesSeen} crashes along the way`);

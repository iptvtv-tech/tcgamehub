// node games/crazy-putt/test.mjs [--holes 29] [--seeds 60] [--putts 25]
// Fires thousands of bot putts through the real Crazy Putt physics (tools/lib/headless.mjs) and
// proves the ball never leaves the course. Regression test for the 29 Oct 2026 report: the ball
// flew off the screen on a windmill hole. A hidden speed pad multiplied the ball's speed ×1.9 on
// every pass (13,000+ px/s seen), and a ball that fast jumps through the thin walls.
// Checked after every physics step: ball inside the course outline, not inside a rock or wall
// block, speed under the cap — and the game's own "back in play" safety net never had to fire.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const HOLES = arg('--holes', 29), SEEDS = arg('--seeds', 60), PUTTS = arg('--putts', 25);
const CP = await loadGame('crazy-putt');
const t = reporter('crazy-putt');
const SPEED_LIMIT = 1500;   // px/s, a little over the game's own cap

const inPoly = (x, y, P) => { let s = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s; } return s; };
const inBlock = (g, x, y) => g.blocks.some((r) => x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1);

let putts = 0, fastest = 0, sunk = 0;
for (let hole = 1; hole <= HOLES; hole++) {
  if (hole % 5 === 0) continue;                       // Hole-in-One Frenzy (open course, no pads)
  const bad = [];
  for (let seed = 1; seed <= SEEDS && bad.length < 3; seed++) {
    const s = CP.start({ seed: seed * 7 + hole * 1000, level: hole, lives: 999 });
    const g = s.game;
    let r = seed * 2654435761 % 2147483647 || 1;          // the bot's own dice, separate from the game's
    const dice = () => ((r = (r * 48271) % 2147483647) / 2147483647);
    for (let k = 0; k < PUTTS && !s.cleared; k++) {
      s.run(3, () => s.state === 'playing' && !g.ball.moving && !g.sinking);    // wait for a still ball
      if (s.cleared || s.state !== 'playing') break;
      g.maxStrokes = Infinity;                                                   // keep putting
      // half the putts aim at the windmill / sliding blocker / cup (a player threading them), half anywhere
      const wm = g.windmill, mv = g.movers[0];
      const tgt = wm ? [wm.x, wm.y] : mv ? [mv.x + mv.w / 2, mv.y] : [g.cup.x, g.cup.y];
      g.aim = dice() < 0.5 ? Math.atan2(tgt[1] - g.ball.y, tgt[0] - g.ball.x) + (dice() - 0.5) * 0.6 : dice() * Math.PI * 2;
      g.power = 0.15 + dice() * 0.85; g.charging = 'pointer'; g.shoot(); putts++;
      // follow the ball step by step until it stops
      for (let i = 0; i < 120 * 10 && !s.cleared; i++) {
        s.tick();
        const b = g.ball, v = Math.hypot(b.vx, b.vy);
        if (v > fastest) fastest = v;
        const where = `hole ${hole} (${g.layoutName}) seed ${seed} putt ${k + 1}`;
        if (!g.sinking && (!inPoly(b.x, b.y, g.poly) || inBlock(g, b.x, b.y))) { bad.push(`${where}: ball left the course at (${b.x.toFixed(0)}, ${b.y.toFixed(0)}), ${v.toFixed(0)} px/s`); break; }
        if (v > SPEED_LIMIT) { bad.push(`${where}: ball reached ${v.toFixed(0)} px/s (limit ${SPEED_LIMIT})`); break; }
        if (!b.moving && !g.sinking) break;
      }
      if (bad.length) break;
    }
    if (s.cleared) sunk++;
    if (g.rescues) bad.push(`hole ${hole} seed ${seed}: the "back in play" safety net fired ${g.rescues}× (the ball got out — find out how)`);
  }
  for (const b of bad) t.fail(b);
}
// Conveyor belts (found by the benchmark, 30 Oct 2026): a ball carried by a belt into a wall or
// rock used to stay pinned there "moving" for ever, so the player could never putt again and
// the hole could never end. Drop a still ball at points along every belt and check it can always
// be putted again within a few seconds.
let belts = 0;
for (let hole = 7; hole <= HOLES; hole++) {
  if (hole % 5 === 0) continue;
  for (let seed = 1; seed <= 12; seed++) {
    const s = CP.start({ seed: seed * 13 + hole * 1000, level: hole, lives: 999 }), g = s.game;
    if (!g.conveyors.length) continue;
    const c = g.conveyors[0];
    for (const f of [0.1, 0.5, 0.9]) {
      g.placeBall(c.x + c.w * f, c.y + c.h / 2); g.ball.moving = true; belts++;
      s.run(8, () => g.canShoot() || s.cleared);
      if (s.cleared) break;                                // the belt carried it into the cup: fine
      if (!g.canShoot()) { t.fail(`hole ${hole} (${g.layoutName}) seed ${seed}: a ball on the conveyor got pinned at (${g.ball.x.toFixed(0)}, ${g.ball.y.toFixed(0)}) and can never be putted again`); break; }
    }
  }
}
t.done(`${putts} putts, ball always on the course, fastest ${Math.round(fastest)} px/s, ${sunk} holes sunk; ${belts} balls on belts all puttable again`);

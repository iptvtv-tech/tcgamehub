// node games/feather-dash/test.mjs [--levels 30] [--seeds 10]   (40 seeds: ~5 min, all pass)
// Fairness test (found by the benchmark, 30 Oct 2026): from level 13 some pairs of pillars could
// not be flown through by ANY bird, because the next gap could jump nearly the full height and the
// bird can only climb so fast. This records the real pillar timeline the game makes (spawn times,
// gaps, sway) and then tries every flap-or-wait choice on every engine step (a search over all
// heights and speeds the bird can have), from the first pillar to the last. If no bird survives,
// the level has an impossible pillar.
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 30), SEEDS = arg('--seeds', 10);
const FD = await loadGame('feather-dash');
const t = reporter('feather-dash');
const W = 480, GROUND = 650, BIRD_X = 130, R = 15, GRAVITY = 1350, FLAP = -410, MAX_FALL = 560, PILLAR_W = 72;   // game.js

const hit = (cy, x, y, w, h, r) => { const nx = Math.max(x, Math.min(BIRD_X, x + w)), ny = Math.max(y, Math.min(cy, y + h)); return (BIRD_X - nx) ** 2 + (cy - ny) ** 2 < r * r; };

/** The pillars the game spawns in this level, with the time each appeared. */
function timeline(level, seed) {
  const s = FD.start({ seed, level, unlimited: true }), g = s.game;
  g.hover = false;
  const out = [];
  let n = 0;
  for (let i = 0; i < 120 * 200 && g.spawned < g.need; i++) {
    g.invuln = 1e9; g.bird.y = 300; g.bird.vy = 0; g.hawks = [];   // keep the bird out of the way while we watch
    s.tick();
    while (g.pillars.length && n < g.spawned) {
      const p = g.pillars.find((q) => !q._seen); if (!p) break;
      p._seen = true; n++;
      out.push({ t0: g.t - (W + 20 - p.x) / g.scroll, base: p.base, amp: p.amp, spd: p.spd, ph: p.ph, gap: p.gap });
    }
  }
  return { pillars: out, scroll: g.scroll };
}

/** Can some bird get past every pillar? Returns the index of the first impossible pillar, or -1. */
function search({ pillars, scroll }) {
  if (!pillars.length) return -1;
  const tStart = pillars[0].t0 + (W + 20 - (BIRD_X + 160)) / scroll;    // the first pillar 160 px ahead
  const tEnd = pillars[pillars.length - 1].t0 + (W + 20 - (BIRD_X - R - PILLAR_W - 2)) / scroll;
  let states = new Map();
  for (let y = 80; y < GROUND - 80; y += 2) for (const vy of [-410, -200, 0, 200, 450]) states.set(`${y}|${vy}`, [y, vy]);
  let first = 0;
  for (let time = tStart; time < tEnd; time += STEP) {
    const next = new Map();
    while (first < pillars.length && W + 20 - scroll * (time - pillars[first].t0) + PILLAR_W < BIRD_X - R - 4) first++;
    const near = [];
    for (let i = first; i < pillars.length; i++) {
      const p = pillars[i], x = W + 20 - scroll * (time + STEP - p.t0);
      if (x > BIRD_X + R + 4) break;
      const gy = p.base + (p.amp ? Math.sin((time + STEP) * p.spd + p.ph) * p.amp : 0);
      near.push({ x, top: gy - p.gap / 2, bot: gy + p.gap / 2 });
    }
    for (const [y0, vy0] of states.values()) {
      for (const flap of [false, true]) {
        let vy = flap ? FLAP : vy0;
        vy = Math.min(vy + GRAVITY * STEP, MAX_FALL);
        let y = y0 + vy * STEP;
        if (y < R + 4) { y = R + 4; vy = Math.max(0, vy); }
        if (y + R >= GROUND) continue;
        if (near.some((p) => hit(y, p.x, -50, PILLAR_W, p.top + 50, R - 2) || hit(y, p.x, p.bot, PILLAR_W, GROUND - p.bot, R - 2))) continue;
        const qy = Math.round(y / 2), qv = Math.round(vy / 30);
        const k = `${qy}|${qv}`;
        if (!next.has(k)) next.set(k, [y, vy]);
      }
    }
    if (!next.size) { if (process.env.FD_DEBUG) console.log('died at', time.toFixed(3), 'first', first, 'near', JSON.stringify(near.map((q) => ({ x: Math.round(q.x), top: Math.round(q.top), bot: Math.round(q.bot) }))), 'states before', states.size, 'y range', Math.min(...[...states.values()].map((v) => v[0])).toFixed(0), Math.max(...[...states.values()].map((v) => v[0])).toFixed(0)); return first; }
    states = next;
  }
  return -1;
}

if (process.env.FD_DEBUG) { const [L, sd] = process.env.FD_DEBUG.split(',').map(Number); const tl = timeline(L, sd * 977 + L); console.log(JSON.stringify(tl.pillars.slice(0, 4).map((p) => ({ t0: +p.t0.toFixed(3), base: Math.round(p.base), amp: Math.round(p.amp), spd: +p.spd.toFixed(2), gap: p.gap }))), 'scroll', tl.scroll); console.log('result', search(tl)); process.exit(0); }
let levels = 0, pillarsChecked = 0;
for (let level = 1; level <= LEVELS; level++) {
  if (level % 5 === 0) continue;                         // bonus rounds have no pillars
  let bad = 0;
  for (let seed = 1; seed <= SEEDS && bad < 2; seed++) {
    const tl = timeline(level, seed * 977 + level);
    levels++; pillarsChecked += tl.pillars.length;
    const i = search(tl);
    if (i >= 0) { bad++; const a = tl.pillars[i - 1], b = tl.pillars[i]; t.fail(`level ${level} seed ${seed}: no bird can get past pillar ${i + 1}${a ? ` (gap ${a.base.toFixed(0)}±${a.amp.toFixed(0)} → ${b.base.toFixed(0)}±${b.amp.toFixed(0)})` : ''}`); }
  }
}
t.done(`${levels} levels, ${pillarsChecked} pillars: a bird can always get through`);

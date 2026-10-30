// Benchmark contract for Tower Topple (see tools/bench.mjs). The bot drops floors with Space, the
// way a player watches the crane: it reads the swing, the bob, the wind arrow and the tower's sway
// and judges where a floor let go now (or a moment later) would land. For each moment over the
// next swing it plays the drop through in its head (the same fall, wind and sway rules as the
// game) and picks the moment whose landing keeps the most margin: on the floor below, and for
// the balance of every group of floors above their support. Lower skill = a slower, shakier press
// (the drop goes a few hundredths of a second early or late), a rougher feel for the wind and
// less thought about balance. The mistake: let a floor go when the crane is far out, so it misses.
const W = 480, BH = 40, GY = 640, HOOK_Y = 120, BASE_W = 150;
const STEP = 1 / 120;
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());

/** Sway of floor i at time t with these floors (same formula as the game's sway()). */
function sway(g, floors, t, i) {
  const n = Math.max(1, floors.length);
  const lean = Math.abs(com(floors, 0) - W / 2);
  const amp = Math.min(38, Math.max(0, lean * 0.35 + n * 0.25)) + g.quake;
  return amp * Math.sin(t * 1.7) * ((i + 1) / (n + 1)) + (g.quake ? g.quake * 0.6 * Math.sin(t * 5.3) : 0);
}
function com(floors, i) {
  let m = 0, mx = 0;
  for (let k = i; k < floors.length; k++) { const f = floors[k], wt = f.w * (f.heavy ? 2 : 1); m += wt; mx += wt * f.x; }
  return m ? mx / m : W / 2;
}

/** Let the hanging floor go `wait` steps from now; where does it land? `windSense` scales the wind
 *  the player allows for (1 = exactly). Returns the landing offset, the margins left, and how long it takes. */
function imagine(g, wait, windSense = 1) {
  let t = g.t, ph = g.swing.ph, camY = g.camY;
  const floors = g.floors, n = floors.length, topY = GY - BH * n, want = Math.min(0, topY - 380);
  const hookX = () => W / 2 + Math.sin(ph) * g.swing.amp;
  const hookY = () => HOOK_Y + (g.level >= 6 && !g.bonus ? Math.sin(ph * 2) * 26 : 0);
  for (let i = 0; i < wait; i++) { t += STEP; ph += STEP * g.swing.speed; camY += (want - camY) * Math.min(1, STEP * 3); }
  const f = { x: hookX(), y: hookY() + 14 + BH / 2 + camY, vx: 0, vy: 0, w: g.hang.w, heavy: g.hang.heavy };
  const wind = g.wind * windSense, surface = topY - BH / 2;
  for (let i = 0; i < 2000; i++) {
    t += STEP; ph += STEP * g.swing.speed;
    f.vy += 1500 * STEP;
    f.vx += (wind - f.vx) * Math.min(1, STEP * 2.5);
    f.y += f.vy * STEP; f.x += f.vx * STEP;
    if (f.y >= surface) break;
  }
  const below = n ? floors[n - 1] : { x: W / 2, w: BASE_W };
  const belowX = below.x + (n ? sway(g, floors, t, n - 1) : 0);
  const off = f.x - belowX;
  const land = Math.min((f.w + below.w) / 2 - 3, g.bonus ? Infinity : below.w / 2) - Math.abs(off);   // > 0: it stays on
  // where it would be stored (tower frame) and the balance margin of every group above its support
  const perfect = Math.abs(off) <= 5 || (g.bonus && Math.abs(off) <= 14);
  const x = (perfect ? belowX : f.x) - sway(g, floors, t, n);
  const after = [...floors, { x, w: f.w, heavy: f.heavy }];
  let bal = Infinity;
  for (let i = after.length - 1; i >= 0; i--) {
    const sup = i ? after[i - 1] : { x: W / 2, w: BASE_W };
    bal = Math.min(bal, sup.w / 2 - Math.abs(com(after, i) - sup.x));
  }
  return { off, land, bal, lean: Math.abs(com(after, 0) - W / 2), perfect };
}

/** The best moment to let go within the next swing (in engine steps from now). */
function choose(g, b, kmin) {
  const period = (2 * Math.PI) / g.swing.speed;
  const horizon = Math.round(Math.min(4, period * 1.05) / STEP);
  const windSense = 1 + gauss(b.rand) * (1 - b.skill) * 0.5;
  const care = 0.3 + 0.7 * b.skill * b.skill;       // how much this player thinks about balance
  let best = null;
  for (let k = kmin; k <= kmin + horizon; k += 2) {
    const r = imagine(g, k, windSense);
    let v = Math.min(r.land, g.bonus ? r.land : r.bal * care + r.land * (1 - care)) - k * STEP * 0.5;
    if (!g.bonus) v -= r.lean * 0.05 * care;        // keep the tower upright for the floors to come
    if (r.perfect) v += 2;
    if (!best || v > best.v) best = { v, k };
  }
  return best.k;
}

function bot(g, s, b) {
  const m = b.mem;
  s.keyUp('action');
  if (!g.hang || g.fall) { m.at = null; return; }
  if (m.at == null) {
    // a beat to take the new floor in, then the chosen moment (pressed a little early or late)
    const look = 0.15 + (1 - b.skill) * 0.35;
    const k = choose(g, b, Math.round(look / STEP));
    m.at = b.t + k * STEP + gauss(b.rand) * (1 - b.skill) * 0.07;
  }
  if (b.t >= m.at - STEP / 2) { s.keyDown('action'); m.at = null; }
}

export default {
  // 8 floors at L1, +2 a level, 30 from L12. A floor takes the expert ~1–3 s (it waits for a good
  // moment in the swing, then ~0.5 s of fall); a toppled tower or a missed floor is built again
  limit: (level) => 30 + Math.min(30, 8 + (level - 1) * 2) * 3,
  stuck: 10,                    // a floor every ~1–4 s: none landed (or lost) for 10 s = stuck
  progress: (g, s) => g.floors.length * 10 + s.livesLost + (g.bonus ? g.rushCount : 0),

  invariants(g) {
    const sw = g.swing;
    if (![g.t, g.camY, sw.ph, g.wind].every(Number.isFinite)) return 'a clock, camera or wind value is not a number';
    if (g.camY > 1e-6) return `the camera is below the ground (camY ${g.camY})`;
    if (Math.abs(g.wind) > 150 + 1e-9) return `wind ${g.wind.toFixed(0)} over the cap of 150`;
    if (Math.abs(g.hookX() - W / 2) > sw.amp + 1e-6) return `the crane hook is off its track at x ${g.hookX().toFixed(0)}`;
    if (!g.bonus && g.floors.length >= g.goal) return `${g.floors.length} floors built of ${g.goal} and the level is still going`;
    if (!!g.hang === !!g.fall) return g.hang ? 'a floor is hanging and falling at once' : 'no floor on the crane and none falling';
    if (g.fall && (![g.fall.x, g.fall.y, g.fall.vx, g.fall.vy].every(Number.isFinite) || g.fall.x < -200 || g.fall.x > W + 200)) return `the falling floor flew off at x ${g.fall.x}`;
    for (const f of g.floors) if (!Number.isFinite(f.x) || f.w <= 0) return 'a floor position is not a number';
    // the game's own balance rule: every group of floors sits over the floor below it
    if (!g.bonus) for (let i = g.floors.length - 1; i >= 0; i--) {
      const sup = i ? g.floors[i - 1] : { x: W / 2, w: BASE_W };
      if (Math.abs(g.com(i) - sup.x) > sup.w / 2 + 1e-6) return `floors ${i}+ hang over their support (centre of mass ${g.com(i).toFixed(1)} vs ${sup.x.toFixed(1)} ± ${sup.w / 2}) and didn't topple`;
    }
    return null;
  },

  bot,

  mistake(g, s, b) {
    s.keyUp('action');
    if (!g.hang || g.fall || g.bonus) return false;
    // let go when the crane is near the end of its swing, well past the tower
    const r = imagine(g, 0);
    if (r.land > -40) return false;
    s.keyDown('action');
    return true;
  },
};

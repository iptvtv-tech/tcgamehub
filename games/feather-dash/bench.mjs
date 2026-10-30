// Benchmark contract for Feather Dash (see tools/bench.mjs). The bot flaps with the Space key
// (the 'action' control), deciding every 2 frames. It reads the screen (bird, pillars and their
// sway, hawks) and plans ahead: every flap / wait sequence over the next ~1.2 s is tried, layer
// by layer, keeping the ones nearest the gap it is heading for, and it follows a plan that keeps
// the bird clear (re-planning when something new appears). Lower skill plans less far ahead and
// keeps fewer options, aims a little off the middle of the gap, stays further from the edges and
// flaps late (a reaction delay), so it clips more pillars as the gaps shrink and the pace rises.
// The mistake: stop flapping and drop into the ground or a pillar.
const W = 480, GROUND = 650, BIRD_X = 130, R = 15;
const GRAVITY = 1350, FLAP = -410, MAX_FALL = 560, PILLAR_W = 72;
const DT = 1 / 120, EVERY = 2;                    // the bot may change its mind every 2 frames

function circleRect(cx, cy, r, x, y, w, h) {
  const nx = Math.max(x, Math.min(cx, x + w)), ny = Math.max(y, Math.min(cy, y + h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** A snapshot of what the player sees, and how it will move (pillars scroll and sway, hawks
 *  swoop: their path for the next `frames` frames is worked out once). */
function scene(g, frames) {
  const sp = g.scroll;
  const pillars = g.pillars.filter((p) => !p.passed || p.x + PILLAR_W > BIRD_X - R - 2).map((p) => ({ x: p.x, base: p.base, gap: p.gap, amp: p.amp, spd: p.spd, ph: p.ph, gapY: p.gapY }));
  const hawks = g.hawks.map((h) => {
    const xs = new Float64Array(frames + 1), ys = new Float64Array(frames + 1);
    let x = h.x, y = h.y, warn = h.warn;
    xs[0] = x; ys[0] = y;
    for (let k = 1; k <= frames; k++) {
      if (warn > 0) warn -= DT;
      else { x -= h.vx * DT; y += Math.sin((g.t + k * DT) * 3 + h.ph) * 40 * DT; }
      xs[k] = x; ys[k] = y;
    }
    return { xs, ys };
  });
  return { t: g.t, sp, pillars, hawks, invuln: g.invuln };
}
const gapAt = (sc, p, k) => (p.amp ? p.base + Math.sin((sc.t + k * DT) * p.spd + p.ph) * p.amp : p.gapY);

/** The height the bot wants to be at, k frames from now (plus its aim error). */
function target(sc, k, aim) {
  const ps = sc.pillars;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i], x = p.x - sc.sp * k * DT;
    if (x + PILLAR_W + R < BIRD_X) continue;
    const c = gapAt(sc, p, k) + aim;
    const nx = ps[i + 1];
    if (nx && x - R < BIRD_X) {                       // inside this gap: lean toward the next one
      const slack = Math.max(0, p.gap / 2 - R - 14);
      return Math.max(c - slack, Math.min(c + slack, gapAt(sc, nx, k) + aim));
    }
    return c;
  }
  return 330;
}

function hits(sc, y, k, margin) {
  if (y + R >= GROUND - margin * 0.5) return true;
  if (sc.invuln > k * DT) return false;
  for (const p of sc.pillars) {
    const x = p.x - sc.sp * k * DT;
    if (x > BIRD_X + R + 2 || x + PILLAR_W < BIRD_X - R - 2) continue;
    const gy = gapAt(sc, p, k), top = gy - p.gap / 2, bot = gy + p.gap / 2;
    if (circleRect(BIRD_X, y, R - 2 + margin, x, -50, PILLAR_W, top + 50) || circleRect(BIRD_X, y, R - 2 + margin, x, bot, PILLAR_W, GROUND - bot)) return true;
  }
  for (const h of sc.hawks) {
    if (Math.hypot(h.xs[k] - BIRD_X, h.ys[k] - y) < R + 14 + margin * 2) return true;
  }
  return false;
}

/** Fly EVERY frames from (y, vy) at frame k, flapping first if asked. Returns the new state, or
 *  null when the bird hits something on the way. */
function fly(sc, y, vy, k, flapNow, margin) {
  for (let i = 0; i < EVERY; i++) {
    if (i === 0 && flapNow) vy = FLAP;
    vy = Math.min(vy + GRAVITY * DT, MAX_FALL);
    y += vy * DT;
    if (y < R + 4) { y = R + 4; vy = Math.max(0, vy); }
    k++;
    if (hits(sc, y, k, margin)) return null;
  }
  return { y, vy, k };
}
const wants = (sc, st, aim) => st.y > target(sc, st.k, aim) + 6 && st.vy > -120;

/** A list of flap / wait choices (one per EVERY frames) that keeps the bird clear until the
 *  horizon: every reachable height and speed, one step of choices at a time (the `width` best,
 *  nearest the gap they head for, are kept). Ends nearest the target; when nothing survives the
 *  whole way, it takes whatever lasts longest. */
function search(sc, st, horizon, margin, aim, width) {
  let layer = [{ ...st, up: null, f: false }], deepest = layer;
  while (layer[0].k < horizon) {
    const next = new Map();
    for (const n of layer) {
      for (const f of [false, true]) {
        const nx = fly(sc, n.y, n.vy, n.k, f, margin);
        if (!nx) continue;
        const key = `${Math.round(nx.y / 2)}|${Math.round(nx.vy / 25)}`;
        if (!next.has(key)) next.set(key, { ...nx, up: n, f });
      }
    }
    if (!next.size) break;
    layer = [...next.values()];
    if (layer.length > width) {
      const k = layer[0].k, ty = target(sc, k, aim);
      layer.sort((a, c) => Math.abs(a.y - ty) - Math.abs(c.y - ty));
      layer.length = width;
    }
    deepest = layer;
  }
  if (deepest[0].k === st.k) return null;
  const ty = target(sc, deepest[0].k, aim);
  let best = deepest.reduce((a, c) => (Math.abs(c.y - ty) + Math.abs(c.vy) * 0.05 < Math.abs(a.y - ty) + Math.abs(a.vy) * 0.05 ? c : a));
  const full = best.k >= horizon, path = [];
  for (; best.up; best = best.up) path.unshift(best.f);
  return { path, full };
}

/** Does the stored plan (then heading for the target) still keep the bird clear? */
function check(sc, st, plan, horizon, margin, aim) {
  const out = [];
  for (let i = 0; st.k < horizon; i++) {
    const f = i < plan.length ? plan[i] : wants(sc, st, aim);
    st = fly(sc, st.y, st.vy, st.k, f, margin);
    if (!st) return null;
    out.push(f);
  }
  return out;
}

function flap(s) { s.keyUp('action'); s.keyDown('action'); }

function bot(g, s, b) {
  const m = b.mem;
  s.keyUp('action');
  m.queue ??= [];
  m.f = (m.f || 0) + 1;
  // flaps decided earlier go out after the reaction delay
  while (m.queue.length && m.queue[0] <= b.t) { m.queue.shift(); flap(s); return; }
  if (g.hover) {                                       // start (or restart) flying after a moment
    m.plan = null;
    m.hoverSince ??= b.t;
    if (b.t - m.hoverSince > 0.15 + (1 - b.skill) * 0.5) { m.hoverSince = null; m.f = 0; flap(s); }
    return;
  }
  if (m.f % EVERY !== 0) return;                       // one decision every EVERY frames
  // aim error: re-rolled for each new pillar
  const next = g.pillars.find((p) => !p.passed);
  if (next !== m.aimFor) { m.aimFor = next; m.aim = (b.rand() * 2 - 1) * (1 - b.skill) * 34; }
  const horizon = Math.round((0.2 + 1.0 * b.skill) / DT);
  const sc = scene(g, horizon + EVERY), st = { y: g.bird.y, vy: g.bird.vy, k: 0 };
  const margin = 2 + (1 - b.skill) * 20;              // a slower player keeps further from the edges
  let plan = m.f % (EVERY * 12) ? check(sc, st, (m.plan || []).slice(1), horizon, margin, m.aim) : null;
  if (!plan) {
    // with a safety margin first, then with none (a tight squeeze beats a sure crash)
    const width = Math.round(20 + 130 * b.skill ** 2);
    let r = search(sc, st, horizon, margin, m.aim, width);
    if (!r || !r.full) r = search(sc, st, horizon, 0, m.aim, width) || r;
    plan = r && r.path;
  }
  m.plan = plan;
  const doFlap = plan ? plan[0] : wants(sc, st, m.aim);
  if (!doFlap) return;
  const delay = -(1 - b.skill) * 0.07 * Math.log(1 - b.rand() * 0.999);
  if (delay < DT) flap(s); else m.queue.push(b.t + delay);
}

export default {
  levels: 20,
  // level L needs 6 + L pillars, one every ~1.9 s (L1) down to ~0.7 s (L15+), plus a few
  // seconds before the first pillar arrives; a crash costs ~2 s and slides the pillars back
  limit: (level) => 70 + level * 2,
  stuck: 15,
  progress: (g) => g.passed,

  invariants(g) {
    const bd = g.bird;
    if (!Number.isFinite(bd.y) || !Number.isFinite(bd.vy)) return 'the bird position is not a number';
    if (bd.y < R + 4 - 1e-6) return `the bird went above the sky at y ${bd.y.toFixed(1)}`;
    if (bd.y + R > GROUND + 1e-6) return `the bird is below the ground at y ${bd.y.toFixed(1)}`;
    if (bd.vy > MAX_FALL + 1e-6) return `falling at ${bd.vy.toFixed(0)} px/s (the cap is ${MAX_FALL})`;
    if (bd.vy < FLAP - 1e-6) return `rising at ${(-bd.vy).toFixed(0)} px/s (a flap gives ${-FLAP})`;
    if (!(g.scroll <= 150 * 2.1 + 1e-6)) return `scroll speed ${g.scroll} is over the cap`;
    if (g.passed > g.spawned || g.spawned > g.need) return `passed ${g.passed} / spawned ${g.spawned} / need ${g.need} don't add up`;
    if (!g.bonus && g.passed >= g.need) return `passed ${g.passed} of ${g.need} pillars but the level is still going`;
    for (const p of g.pillars) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.gapY)) return 'a pillar position is not a number';
      const top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
      if (top < R + 4 || bot > GROUND - 10) return `a pillar gap (${top.toFixed(0)}–${bot.toFixed(0)}) runs off the screen`;
      // the bird is never inside a pillar unless it is still flashing after a hit
      if (!g.invuln && !g.dead && (circleRect(BIRD_X, bd.y, R - 2, p.x, -50, PILLAR_W, top + 50) || circleRect(BIRD_X, bd.y, R - 2, p.x, bot, PILLAR_W, GROUND - bot))) return `the bird is inside a pillar at x ${p.x.toFixed(0)}`;
    }
    for (const h of g.hawks) if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) return 'a hawk position is not a number';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.l0 ??= s.livesLost;
    if (s.livesLost > m.l0) return true;                // the crash happened: back to playing
    s.keyUp('action');
    if (g.hover) flap(s);                                // get off the perch, then stop flapping
    return false;
  },
};

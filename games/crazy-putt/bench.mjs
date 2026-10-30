// Benchmark contract for Crazy Putt (see tools/bench.mjs). The bot putts like a mouse player:
// press where it wants to aim, hold while the power builds, release. Before each putt it "reads
// the green": it rolls trial putts in its head through the game's own physics on a copy of the
// course that holds only what a player can see (walls, rocks, water, bumpers, the windmill and
// sliding blockers where they will be when it lets go, visible sand, traps already found — never
// the hidden ones). It looks for a putt that drops; failing that, the one that leaves the ball
// nearest the cup by the walking distance round the walls (so dog-legs and blocked holes are
// played round the corner or off a bank). With two holes on show it can't tell which is fake, so
// it picks one and switches when it BOINGs. Lower skill = shakier aim and power. The mistake:
// duff putts away from the hole until the strokes run out (a hole lost costs a life).
import { STEP } from '../../tools/lib/headless.mjs';

const W = 480, H = 720, R = 7, CHARGE_TIME = 1.15, BALL_CAP = 1300, MAX_SPEED = 900;
const U = STEP / CHARGE_TIME;                       // power gained per engine step while held
const NOOP = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : NOOP), apply: () => NOOP });
const MIND = { input: { isDown: () => false }, sound: NOOP, fx: NOOP, rng: { range: (a, b) => (a + b) / 2, chance: () => false, next: () => 0.5 },
  unlock() {}, hurt() {}, award() {}, resetCombo() {}, state: 'playing', dropLayers() {} };

// ── geometry (same tests as the game) ──
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

/** A copy of the hole as a player sees it, ready to roll a trial putt through the game's physics.
 *  `sure` = the player knows this hole is real; if not (two holes on show) it can't count on the
 *  real cup's pull at the lip, so the hole is imagined as one that only counts when the ball rolls
 *  right over it (a fake hole in the copy: "reached" when it would BOING). */
function imagine(g, cup, sure) {
  const c = Object.create(Object.getPrototypeOf(g));
  Object.assign(c, {
    s: MIND, t: g.t, level: g.level, bonus: g.bonus, poly: g.poly, walls: g.walls, blocks: g.blocks, water: g.water, conveyors: g.conveyors,
    sand: g.sand.filter((z) => !z.hidden || z.revealed).map((z) => ({ ...z })),
    traps: g.traps.filter((t) => t.revealed).map((t) => ({ ...t, inside: false, boosted: undefined })),
    bumpers: g.bumpers.map((bp) => ({ ...bp })), movers: g.movers.map((m) => ({ ...m })), windmill: g.windmill && { ...g.windmill },
    decoy: sure ? (g.decoy?.revealed ? { ...g.decoy } : null) : { x: cup.x, y: cup.y, revealed: false },
    cup: sure ? cup : { x: -999, y: -999 }, bonusCups: g.bonusCups,
    sinking: null, charging: null, power: 0, ball: { ...g.ball, vx: 0, vy: 0, moving: false, z: 0 }, lastRest: [g.ball.x, g.ball.y],
    trail: [], shot: 1, strokes: 0, maxStrokes: Infinity, rescues: 0, par: g.par,
  });
  c.penalty = function () { this.fell = true; this.ball.moving = false; };
  c.sink = function (cup) { this.sunk = cup; this.ball.moving = false; };
  c.afterStop = function () {};
  return c;
}

/** Roll one trial putt: held for n steps, aimed at angle a. */
function trial(g, cup, sure, n, a, maxT = 7) {
  const c = imagine(g, cup, sure);
  for (let i = 0; i < n; i++) c.update(STEP);             // the windmill and blockers move while the power builds
  const p = Math.min(1, n * U), sp = 40 + p * (MAX_SPEED - 40), b = c.ball;
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.moving = true;
  for (let t = 0; t < maxT && b.moving && !c.sunk && !c.fell; t += STEP) {
    const v = Math.hypot(b.vx, b.vy);
    c.update(STEP);
    if (!sure && c.decoy.revealed) return v < 400 ? { sunk: cup, x: cup.x, y: cup.y } : { x: cup.x, y: cup.y, fast: true };
  }
  return { sunk: c.sunk, fell: c.fell, x: b.x, y: b.y, rolling: b.moving };
}

// ── the walking distance to a hole round walls, rocks and water (a grid flood) ──
const CELL = 8, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
const fields = new WeakMap();
function field(g, cup) {
  let per = fields.get(g);
  if (!per) fields.set(g, (per = new Map()));
  const k = `${Math.round(cup.x)},${Math.round(cup.y)}`;
  if (per.has(k)) return per.get(k);
  const open = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i * CELL + CELL / 2, y = j * CELL + CELL / 2;
    let ok = pointInPoly(x, y, g.poly) && !g.water.some((w) => inRect(x, y, w, 2)) && !g.blocks.some((r) => inRect(x, y, r, R - 2))
      && !g.bumpers.some((bp) => Math.hypot(x - bp.x, y - bp.y) < bp.r + R - 2);
    if (ok) for (const [a, b] of g.walls) if (segDist(x, y, a, b) < R - 3) { ok = false; break; }
    open[j * GW + i] = ok ? 1 : 0;
  }
  const dist = new Float32Array(GW * GH).fill(Infinity);
  const ci = Math.min(GW - 1, Math.floor(cup.x / CELL)), cj = Math.min(GH - 1, Math.floor(cup.y / CELL));
  dist[cj * GW + ci] = 0;
  let front = [cj * GW + ci];
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (front.length) {                                    // relax until settled (small grid: fine)
    const next = [];
    for (const id of front) {
      const i = id % GW, j = (id - i) / GW;
      for (const [di, dj, w] of nb) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nid = nj * GW + ni;
        if (!open[nid] || (di && dj && (!open[j * GW + ni] || !open[nj * GW + i]))) continue;
        const d = dist[id] + w * CELL;
        if (d < dist[nid] - 0.01) { dist[nid] = d; next.push(nid); }
      }
    }
    front = next;
  }
  const f = (x, y) => {
    const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
    let best = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const d = dist[nj * GW + ni] + Math.hypot(x - (ni * CELL + CELL / 2), y - (nj * CELL + CELL / 2));
      if (d < best) best = d;
    }
    return best === Infinity ? 2000 : best;
  };
  per.set(k, f);
  return f;
}

/** The holes this player believes in, the one it is going for first. */
function holes(g, b) {
  if (g.bonus) return [g.bonusCups.reduce((p, q) => (q.val > p.val ? q : p))];   // aim for the big one; trial putts score every cup
  const list = [g.cup];
  if (g.decoy && !g.decoy.revealed) list.push(g.decoy);   // two holes on show: no way to tell which is fake
  list.sort((p, q) => p.x - q.x || p.y - q.y);
  if (b.mem.pick == null) b.mem.pick = b.rand() < 0.5 ? 0 : 1;
  return [list[Math.min(b.mem.pick, list.length - 1)]];
}

/** Read the green: the best putt (steps to hold, aim angle) for this lie. */
function readGreen(g, b) {
  const targets = holes(g, b);
  let best = null;
  const sure = g.bonus || !g.decoy || g.decoy.revealed;
  const score = (cup, n, a) => {
    const r = trial(g, cup, sure, n, a);
    let v;
    if (r.sunk) v = 1e6 + (g.bonus ? (r.sunk.val || 0) * 100 : 0) - n;   // softer drops lip out less
    else if (g.bonus) v = -Math.hypot(r.x - cup.x, r.y - cup.y);
    else v = -field(g, cup)(r.x, r.y) - (r.fell ? 3000 : 0) - (r.fast ? 60 : 0);   // judged by where it ends up
    if (!best || v > best.v) best = { v, n, a, cup };
    return v;
  };
  const NS = [6, 11, 17, 25, 34, 45, 58, 73, 90, 110, 138];
  for (const cup of targets) {
    const direct = Math.atan2(cup.y - g.ball.y, cup.x - g.ball.x);
    const cand = [];
    const span = Math.round(30 * Math.min(1, b.skill * b.skill * 1.3));   // a weaker player sees fewer lines (± k × 6°)
    for (let k = -span; k < span; k++) {                    // every 6° round the ball
      const a = direct + (k * Math.PI * 2) / 60;
      for (const n of NS) cand.push({ n, a, v: score(cup, n, a) });
    }
    cand.sort((p, q) => q.v - p.v);
    for (const c of cand.slice(0, 4)) {                     // look closer at the best few
      for (let da = -3; da <= 3; da += 0.75) for (const dn of [-4, -2, 0, 2, 4]) {
        const n = Math.max(6, Math.min(138, c.n + dn));   // under 6 steps (power 0.04) the game won't putt
        score(cup, n, c.a + (da * Math.PI) / 180);
      }
    }
  }
  return best;
}

const bestRest = new WeakMap();

export default {
  // 20 holes (5, 10, 15, 20 are Hole-in-One Frenzy bonus rounds, 25 s on the clock). A hole is
  // 2–4 putts of ~1 s charge + 2–4 s roll; a hole lost (par + 3 strokes) restarts it from the tee
  limit: () => 120,
  stuck: 40,                    // ~8 putts without ever lying closer to the cup = stuck

  progress(g) {
    if (g.bonus) return g.bonusSunk;
    if (g.sinking) return 1e6;
    const was = bestRest.get(g) ?? 1e5;
    if (g.ball.moving) return -was;
    const d = Math.round(field(g, g.cup)(g.ball.x, g.ball.y) * 10) / 10;
    const near = Math.min(was, d);
    bestRest.set(g, near);
    return -near;
  },

  invariants(g) {
    const b = g.ball, v = Math.hypot(b.vx, b.vy);
    if (![b.x, b.y, b.vx, b.vy, g.aim, g.power].every(Number.isFinite)) return 'the ball or aim is not a number';
    if (v > BALL_CAP + 1e-6) return `the ball is going ${v.toFixed(0)} px/s (cap ${BALL_CAP})`;
    if (g.rescues) return `the "back in play" safety net fired ${g.rescues}× (the ball got off the course)`;
    if (!g.sinking && !pointInPoly(b.x, b.y, g.poly)) return `the ball is off the course at (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`;
    if (g.blocks.some((r) => b.x > r.x + 1 && b.x < r.x + r.w - 1 && b.y > r.y + 1 && b.y < r.y + r.h - 1)) return `the ball is inside a rock at (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`;
    if (g.power < 0 || g.power > 1) return `power ${g.power}`;
    if (!g.bonus && (!Number.isInteger(g.strokes) || g.strokes < 0 || g.strokes > g.maxStrokes)) return `strokes ${g.strokes} of ${g.maxStrokes}`;
    if (!g.bonus && g.maxStrokes !== g.par + 3) return `max strokes ${g.maxStrokes} for par ${g.par}`;
    if (g.bonus && (g.strokes !== 0 || g.bonusSunk < 0)) return `bonus round counted ${g.strokes} strokes`;
    for (const m of g.movers) if (m.x < m.minX - 1e-6 || m.x > m.maxX + 1e-6) return `a sliding blocker left its track (x ${m.x.toFixed(1)})`;
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    if (m.duff && s.livesLost > m.duff.lives) m.duff = null;
    if (g.charging === 'pointer' && m.shot) {               // holding: let go at the planned power
      if (g.power + 1e-9 >= m.shot.p) { s.pointerUp(m.shot.x, m.shot.y); m.shot = null; m.wait = b.t + 0.25 + (1 - b.skill) * 0.5; }
      return;
    }
    if (!g.canShoot() || b.t < (m.wait ?? 2.2)) return;    // first a good look at the hole
    const bx = g.ball.x, by = g.ball.y;
    let a, n;
    if (m.duff) {                                           // the mistake: a feeble putt the wrong way
      const cup = holes(g, b)[0];
      a = Math.atan2(by - cup.y, bx - cup.x) + (b.rand() - 0.5) * 1.2; n = 7;
    } else {
      const lie = `${g.level}|${bx.toFixed(1)},${by.toFixed(1)}|${g.decoy?.revealed}|${g.traps.filter((t) => t.revealed).length}|${g.sand.filter((z) => z.revealed).length}`;
      if (!g.bonus || !m.plan || m.plan.lie !== lie) m.plan = { lie, ...readGreen(g, b) };
      const gauss = () => (b.rand() + b.rand() + b.rand() - 1.5) * 2;   // ~N(0, 1)
      a = m.plan.a + gauss() * (1 - b.skill) * 0.14;        // shaky aim
      n = Math.round(m.plan.n * (1 + gauss() * (1 - b.skill) * 0.25));   // shaky power
    }
    n = Math.max(6, Math.min(138, n));
    let rr = 60;                                             // point somewhere on the screen along the aim line
    while (rr > 10 && (bx + Math.cos(a) * rr < 0 || bx + Math.cos(a) * rr > W || by + Math.sin(a) * rr < 0 || by + Math.sin(a) * rr > H)) rr -= 5;
    const x = bx + Math.cos(a) * rr, y = by + Math.sin(a) * rr;
    m.shot = { x, y, p: Math.min(1, n * U) - 1e-9 };
    s.pointerMove(x, y);
    s.pointerDown(x, y);
  },

  mistake(g, s, b) {
    if (!g.canShoot()) return false;
    b.mem.duff = { lives: s.livesLost };
    return true;
  },
};

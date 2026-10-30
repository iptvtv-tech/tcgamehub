// Benchmark contract for Prism Breaker (see tools/bench.mjs). The bot moves the paddle with the
// mouse (pointer moves) and launches with Space. It watches the ball that will reach the paddle
// first, works out where it will cross the paddle line (bouncing off the side walls), and gets
// there; the expert also picks which part of the paddle to hit with, so the ball heads for a
// brick it can break rather than a steel one or an empty lane. Lower skill re-reads the ball
// less often, misjudges where it lands and rarely aims. When no ball is coming soon it goes for
// falling power-up capsules. The mistake: move away from the ball and let it fall past.
const W = 480, H = 720, TOP = 44;
const COLS = 8, BW = 51, BH = 22, GAP = 5, BX0 = (W - (COLS * BW + (COLS - 1) * GAP)) / 2, BY0 = TOP + 40;
const PY = 668, PH = 14, BALL_R = 7;

/** Where (and how soon) a falling ball crosses the paddle line, bouncing off the side walls. */
function landing(g, b) {
  if (b.stuck || b.vy <= 0) return null;
  const m = g.slowT > 0 ? 0.65 : 1;
  const t = (PY - BALL_R - b.y) / (b.vy * m);
  if (t < 0) return null;
  const lo = BALL_R, span = W - 2 * BALL_R;
  let u = (b.x - lo + b.vx * m * t) % (2 * span);
  if (u < 0) u += 2 * span;
  return { x: lo + (u > span ? 2 * span - u : u), t };
}

/** Bricks by grid cell, for quick look-ups. */
function grid(g) {
  const cells = new Map();
  for (const br of g.bricks) if (br.alive) cells.set(`${Math.round((br.x - BX0) / (BW + GAP))},${Math.round((br.y - BY0) / (BH + GAP))}`, br);
  return cells;
}
function brickAt(cells, x, y) {
  const c0 = Math.floor((x - BALL_R - BX0) / (BW + GAP)), c1 = Math.floor((x + BALL_R - BX0) / (BW + GAP));
  const r0 = Math.floor((y - BALL_R - BY0) / (BH + GAP)), r1 = Math.floor((y + BALL_R - BY0) / (BH + GAP));
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const br = cells.get(`${c},${r}`);
    if (!br) continue;
    const nx = Math.max(br.x, Math.min(x, br.x + br.w)), ny = Math.max(br.y, Math.min(y, br.y + br.h));
    if ((x - nx) ** 2 + (y - ny) ** 2 <= BALL_R * BALL_R) return br;
  }
  return null;
}
/** The first breakable brick a ball leaving (x, y) at angle a (0 = straight up) would hit,
 *  following it off the walls and off up to three steel bricks; and how many steel bounces. */
function firstHit(cells, x, y, a) {
  let dx = Math.sin(a) * 4, dy = -Math.cos(a) * 4, steel = 0;
  for (let i = 0; i < 700; i++) {
    const px = x, py = y;
    x += dx; y += dy;
    if (x < BALL_R) { x = 2 * BALL_R - x; dx = -dx; }
    if (x > W - BALL_R) { x = 2 * (W - BALL_R) - x; dx = -dx; }
    if (y < TOP + BALL_R) { y = 2 * (TOP + BALL_R) - y; dy = -dy; }
    if (y > PY) return null;
    const br = brickAt(cells, x, y);
    if (!br) continue;
    if (br.type !== 'steel') return { br, steel };
    if (++steel > 3) return null;
    // bounce off the steel: off its top/bottom if we came from above/below it, else its side
    if (px > br.x - BALL_R && px < br.x + br.w + BALL_R) dy = -dy; else dx = -dx;
    x = px; y = py;
  }
  return null;
}

/** Which part of the paddle to meet the ball with: the smallest offset whose bounce reaches a
 *  breakable brick (the game turns an offset of -1..1 into a launch angle of up to ±60°). */
function aimOffset(g, xl, rand) {
  const cells = grid(g);
  let best = 0, bestScore = -1;
  for (let i = 0; i <= 36; i++) {
    const off = ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) / 20;      // 0, -0.05, 0.05, … ±0.9
    const h = firstHit(cells, xl, PY - BALL_R, off * 1.05);
    const score = h ? (h.br.type === 'boom' ? 4 : 3) - h.steel * 0.5 : 0;
    if (score > bestScore) { bestScore = score; best = off; }
  }
  // no straight shot at a brick from here: try a different angle each time
  return bestScore > 0 ? best : (rand() * 2 - 1) * 0.85;
}

/** A bell-curve random number (mean 0, spread 1): most misjudgements are small, a few are big. */
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());

const insideFor = new WeakMap();      // steps each ball has spent with its centre inside a brick

function bot(g, s, b) {
  const m = b.mem, p = g.paddle, half = g.pw / 2;
  s.keyUp('action');
  // like a player who has been stuck on the last few bricks for a while: try other angles
  const done = g.bricks.reduce((a, br) => a + (br.type === 'steel' ? 0 : br.alive ? br.maxHp - br.hp : br.maxHp), 0);
  if (done !== m.done) { m.done = done; m.doneT = b.t; }
  const bored = b.t - (m.doneT ?? 0) > 12;
  // launch after a short look (the game launches by itself after 6 s anyway)
  if (g.balls.some((x) => x.stuck)) {
    m.stuckSince ??= b.t;
    if (b.t - m.stuckSince > 0.25 + (1 - b.skill) * 0.6) { m.stuckSince = null; s.keyDown('action'); }
  } else m.stuckSince = null;
  if (m.trajBall && m.trajBall.vy < 0) m.wasUp = true;
  // re-read the ball every so often (instantly for the expert)
  const every = (1 - b.skill) * 0.22;
  if (m.readAt == null || b.t >= m.readAt) {
    m.readAt = b.t + every * (0.5 + b.rand());
    let first = null;
    for (const ball of g.balls) {
      const l = landing(g, ball);
      if (l && (!first || l.t < first.t)) first = { ...l, ball };
    }
    if (first) {
      // pick the aim once per fall (each time this ball comes down again, a new one)
      if (m.trajBall !== first.ball || m.wasUp) { m.trajBall = first.ball; m.wasUp = false; m.aim = bored ? (b.rand() * 2 - 1) * 0.9 : b.rand() < b.skill * b.skill ? aimOffset(g, first.x, b.rand) : 0; m.err = gauss(b.rand) * (1 - b.skill) * Math.hypot(first.ball.vx, first.ball.vy) * 0.14; }
      const aim = m.aim, err = m.err;
      m.goal = { x: first.x + err - aim * half, t: b.t + first.t, ball: first.ball };   // meet it with that part of the paddle
    } else {
      // nothing falling: follow the lowest ball loosely, or fetch a capsule
      const low = g.balls.filter((x) => !x.stuck).sort((a, c) => c.y - a.y)[0];
      m.goal = low ? { x: low.x, t: Infinity } : { x: p.x, t: Infinity };
    }
    // a capsule that lands before the ball does, and is in reach
    const ballIn = m.goal.t - b.t;
    for (const c of g.caps) {
      const tc = (PY - c.y) / 170;
      if (tc < 0 || tc > ballIn - 0.35) continue;
      if (Math.abs(c.x - p.x) < 520 * tc) { m.goal = { ...m.goal, x: c.x, capsule: true }; break; }
    }
  }
  const x = Math.max(half, Math.min(W - half, m.goal.x));
  s.pointerMove(x, PY);
}

export default {
  levels: 20,
  // up to 10 rows of 8 bricks (some 2–3 hits): the expert takes ~20–130 s a level (level 1's
  // slow ball is the longest, ~3 s a round trip for 32 bricks); the last lone brick can take a while
  limit: (level) => 200 + level * 6,
  stuck: 120,
  // damage done to breakable bricks (every hit counts, not just the last one)
  progress: (g) => g.bricks.reduce((a, br) => a + (br.type === 'steel' ? 0 : br.alive ? br.maxHp - br.hp : br.maxHp), 0),

  invariants(g) {
    // (a Wide capsule widens the paddle at once; the game pulls it back on screen next frame,
    // so the check uses the normal paddle's limits)
    const p = g.paddle;
    if (!Number.isFinite(p.x) || p.x < 48 - 1e-6 || p.x > W - 48 + 1e-6) return `the paddle is off the screen at x ${p.x}`;
    if (!g.balls.length) return 'no ball in play';
    const cap = g.baseSpeed * 1.2 * 1.0001;
    for (const b of g.balls) {
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy)) return 'a ball position or speed is not a number';
      if (b.x < BALL_R - 1e-6 || b.x > W - BALL_R + 1e-6) return `a ball went through the side wall at x ${b.x.toFixed(1)}`;
      if (b.y < TOP + BALL_R - 1e-6) return `a ball went through the ceiling at y ${b.y.toFixed(1)}`;
      if (b.y - BALL_R > H + 1) return `a lost ball is still in play at y ${b.y.toFixed(0)}`;
      if (b.stuck) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > cap) return `ball speed ${sp.toFixed(0)} is over the cap ${cap.toFixed(0)}`;
      if (sp < 1) return 'a ball in play has stopped';
      if (Math.abs(b.vy) < sp * 0.28 - 1e-6) return `a ball is travelling almost sideways (vy ${b.vy.toFixed(0)} of ${sp.toFixed(0)})`;
      {
        // the push-out from one brick can put the centre a few px into its neighbour (the gaps
        // are 5 px, the ball 14 px across); the game bounces it out next step. Stuck = a rule broken.
        const inside = g.bricks.find((br) => br.alive && b.x > br.x + 1 && b.x < br.x + br.w - 1 && b.y > br.y + 1 && b.y < br.y + br.h - 1);
        const n = inside ? (insideFor.get(b) || 0) + 1 : 0;
        insideFor.set(b, n);
        if (n > 3) return `a ball is passing through a ${inside.type} brick (its centre has been inside it for ${n} steps) at (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`;
      }
    }
    for (const br of g.bricks) {
      if (br.alive && br.type !== 'steel' && !(br.hp > 0 && br.hp <= br.maxHp)) return `a live brick has ${br.hp} hp of ${br.maxHp}`;
    }
    const left = g.breakable();
    if (left > g.total) return `${left} breakable bricks left of ${g.total}`;
    if (left === 0) return 'every brick is broken but the level is still going';
    for (const c of g.caps) if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return 'a capsule position is not a number';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const live = g.balls.filter((x) => !x.stuck);
    if (live.length !== 1 || live[0].vy <= 0 || live[0].y < 420) { bot(g, s, b); return false; }
    const ball = live[0], l = landing(g, ball), half = g.pw / 2;
    if (ball.y - BALL_R > PY + PH) return true;          // past the paddle: it's gone
    const lx = l ? l.x : ball.x;
    s.pointerMove(lx > W / 2 ? half : W - half, PY);      // look away: the paddle goes to the other side
    return false;
  },
};

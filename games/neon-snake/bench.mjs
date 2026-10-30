// Benchmark contract for Neon Snake (see tools/bench.mjs). The bot steers with the arrow keys,
// one decision per grid step: it looks at the three ways it can turn, throws out any that crash
// at once (wall, block, body, a spark's path), and takes the one that is shortest to the fruit
// while still leaving room to move (enough open squares to fit its own length). Lower skill
// reacts late (a slow decision misses the step and the snake carries straight on), sometimes
// skips the "is there room" check and now and then makes a careless turn.
// The mistake: a tight U-turn into its own body once the snake is long enough to bite itself.
const COLS = 20, ROWS = 20;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const LEFT_OF = { right: 'up', up: 'left', left: 'down', down: 'right' };
const RIGHT_OF = { right: 'down', down: 'left', left: 'up', up: 'right' };
const key = (x, y) => y * COLS + x;

/** One move from (x, y) in direction d, exactly as step() does it: wrap or wall, then portals. */
function move(g, x, y, d) {
  const [dx, dy] = DIRS[d];
  let nx = x + dx, ny = y + dy;
  const edge = (a, b) => {
    if (a < 0 || b < 0 || a >= COLS || b >= ROWS) { if (g.solid) return null; return [(a + COLS) % COLS, (b + ROWS) % ROWS]; }
    return [a, b];
  };
  let c = edge(nx, ny);
  if (!c) return null;
  if (g.portals) {
    const [a, b] = g.portals;
    const hit = c[0] === a.x && c[1] === a.y ? b : c[0] === b.x && c[1] === b.y ? a : null;
    if (hit) { c = edge(hit.x + dx, hit.y + dy); if (!c) return null; }
  }
  return c;
}

/** Where each spark will be after k of its moves (the same bounce rules as moveSpark). */
function sparkPaths(g, n) {
  const bad = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || g.obstacles.has(key(x, y));
  return g.sparks.map((sp0) => {
    const sp = { ...sp0 }, out = [[sp.x, sp.y]];
    for (let i = 0; i < n; i++) {
      let nx = sp.x + sp.dx, ny = sp.y + sp.dy;
      if (bad(nx, sp.y)) { sp.dx *= -1; nx = sp.x + sp.dx; }
      if (bad(sp.x, ny)) { sp.dy *= -1; ny = sp.y + sp.dy; }
      if (bad(nx, ny)) { sp.dx *= -1; sp.dy *= -1; } else { sp.x = nx; sp.y = ny; }
      out.push([sp.x, sp.y]);
    }
    return out;
  });
}

/** Is the square dangerous to stand on k steps from now? (body still there, or a spark near it) */
function makeDanger(g) {
  const len = g.snake.length, grow = g.grow;
  const bodyIdx = new Map();
  g.snake.forEach((p, i) => bodyIdx.set(key(p.x, p.y), i));
  const per = 1 / 1.7;                                      // spark moves per snake step
  const paths = sparkPaths(g, 40);
  const sparkAt = (x, y, k) => paths.some((p) => {
    const m = k * per;
    for (let j = Math.max(0, Math.floor(m) - 1); j <= Math.min(p.length - 1, Math.ceil(m) + 1); j++) if (p[j][0] === x && p[j][1] === y) return true;
    return false;
  });
  return (x, y, k) => {
    const c = key(x, y);
    if (g.obstacles.has(c)) return true;
    const i = bodyIdx.get(c);
    if (i !== undefined && i < len - Math.max(0, k - grow)) return true;
    return g.sparks.length > 0 && sparkAt(x, y, k);
  };
}

/** Breadth-first search from a first move; returns distance (in steps) to the target, and how
 *  many squares are open from there (a cheap "will I box myself in" check). */
function look(g, start, target, danger) {
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const q = [[start[0], start[1], 1]];
  dist[key(start[0], start[1])] = 1;
  let found = -1, open = 0;
  while (q.length) {
    const [x, y, k] = q.shift();
    open++;
    if (target && found < 0 && x === target.x && y === target.y) found = k;
    if (open > 400) break;
    for (const d of Object.keys(DIRS)) {
      const c = move(g, x, y, d);
      if (!c) continue;
      const j = key(c[0], c[1]);
      if (dist[j] >= 0 || danger(c[0], c[1], k + 1)) continue;
      dist[j] = k + 1; q.push([c[0], c[1], k + 1]);
    }
  }
  return { found, open };
}

function nearest(g, list) {
  const h = g.snake[0];
  let best = null, bd = 1e9;
  for (const f of list) {
    const dx = Math.min(Math.abs(f.x - h.x), g.solid ? 99 : COLS - Math.abs(f.x - h.x));
    const dy = Math.min(Math.abs(f.y - h.y), g.solid ? 99 : ROWS - Math.abs(f.y - h.y));
    if (dx + dy < bd) { bd = dx + dy; best = f; }
  }
  return best;
}

function choose(g, b, careful) {
  const h = g.snake[0], dir = g.dir;
  const target = g.bonus ? nearest(g, g.gems) : g.foods[0];
  const danger = g.bonus ? () => false : makeDanger(g);
  const opts = [];
  for (const d of [dir, LEFT_OF[dir], RIGHT_OF[dir]]) {
    const c = move(g, h.x, h.y, d);
    if (!c || danger(c[0], c[1], 1)) continue;
    const r = look(g, c, target, danger);
    opts.push({ d, ...r });
  }
  if (!opts.length) return dir;                            // nothing is safe: carry on
  const need = g.snake.length + 2;
  // Keeping room to move is the plan, but a fruit at the end of a dead end can't be eaten
  // safely: after a while circling, the bot goes and eats it anyway (it still counts).
  const roomy = careful && b.mem.sinceEat < 60 ? opts.filter((o) => o.open >= need) : opts;
  const pool = roomy.length ? roomy : opts.sort((a, c) => c.open - a.open).slice(0, 1);
  pool.sort((a, c) => ((a.found < 0 ? 999 : a.found) - (c.found < 0 ? 999 : c.found)) || (c.open - a.open));
  return pool[0].d;
}

function press(s, d) { s.keyUp(d); s.keyDown(d); s.keyUp(d); }

function bot(g, s, b) {
  const h = g.snake[0], m = b.mem;
  const at = `${h.x},${h.y},${g.snake.length}`;
  if (m.eaten !== g.eaten + g.gemsEaten) { m.eaten = g.eaten + g.gemsEaten; m.sinceEat = 0; }
  if (m.at !== at) { m.at = at; m.sinceEat++; m.done = false; m.ready = b.t - (1 - b.skill) * 0.06 * Math.log(1 - b.rand() * 0.999); }  // reaction time: a long-tailed spread
  if (m.done || g.queue.length || b.t < m.ready) return;
  m.done = true;
  let d;
  if (b.rand() < (1 - b.skill) * 0.06) {                   // a careless turn
    const ds = [g.dir, LEFT_OF[g.dir], RIGHT_OF[g.dir]];
    d = ds[Math.floor(b.rand() * 3)];
  } else d = choose(g, b, b.rand() < 0.4 + b.skill * 0.6);
  if (d !== g.dir) press(s, d);
}

export default {
  levels: 20,
  // level L needs 5 + L fruit; a fruit is ~10–20 steps of 0.165 s (L1) down to 0.055 s (L16+)
  limit: (level) => 60 + level * 2,
  stuck: 25,
  progress: (g) => (g.bonus ? g.gemsEaten : g.eaten),

  invariants(g) {
    const seen = new Set();
    for (const p of g.snake) {
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return `a snake segment is off the grid at (${p.x}, ${p.y})`;
      if (p.x < 0 || p.y < 0 || p.x >= COLS || p.y >= ROWS) return `a snake segment is outside the board at (${p.x}, ${p.y})`;
      const k = key(p.x, p.y);
      if (seen.has(k)) return `the snake overlaps itself at (${p.x}, ${p.y})`;
      seen.add(k);
      if (!g.bonus && g.obstacles.has(k)) return `the snake is inside a block at (${p.x}, ${p.y})`;
      if (g.portals && g.portals.some((q) => q.x === p.x && q.y === p.y)) return `the snake is standing on a portal at (${p.x}, ${p.y})`;
    }
    for (const f of [...g.foods, ...g.gems, ...(g.golden ? [g.golden] : [])]) {
      if (f.x < 0 || f.y < 0 || f.x >= COLS || f.y >= ROWS) return `a pickup is outside the board at (${f.x}, ${f.y})`;
      if (g.obstacles.has(key(f.x, f.y))) return `a pickup is inside a block at (${f.x}, ${f.y})`;
    }
    for (const sp of g.sparks) {
      if (sp.x < 0 || sp.y < 0 || sp.x >= COLS || sp.y >= ROWS) return `a spark left the board at (${sp.x}, ${sp.y})`;
      if (g.obstacles.has(key(sp.x, sp.y))) return `a spark is inside a block at (${sp.x}, ${sp.y})`;
    }
    if (!g.bonus) {
      if (g.foods.length !== 1) return `${g.foods.length} fruit on the board (there should be one)`;
      if (g.eaten >= g.need) return `eaten ${g.eaten} of ${g.need} but the level is still going`;
    } else if (g.gems.length !== 8) return `${g.gems.length} gems on the bonus board (there should be 8)`;
    if (!(g.stepTime >= 0.055 * 0.85 - 1e-9) || !(g.stepTime <= 0.165 + 1e-9)) return `step time ${g.stepTime} is outside the game's range`;
    if (g.queue.length > 3) return `${g.queue.length} turns queued (the cap is 3)`;
    return null;
  },

  bot,

  mistake(g, s, b) {
    // needs 5+ segments to bite itself; until then play normally
    if (g.snake.length < 5 || g.queue.length) { bot(g, s, b); return false; }
    const h = g.snake[0], d = g.dir;
    for (const side of [LEFT_OF, RIGHT_OF]) {
      const a = side[d], c = OPP[d];                          // turn, turn back, turn again: a U into the neck
      const p1 = move(g, h.x, h.y, a), p2 = p1 && move(g, p1[0], p1[1], c);
      const straight1 = p1 && Math.abs(p1[0] - h.x) + Math.abs(p1[1] - h.y) === 1;
      const straight2 = p2 && Math.abs(p2[0] - p1[0]) + Math.abs(p2[1] - p1[1]) === 1;
      if (!straight1 || !straight2) continue;                // a wrap or a portal would spoil the U
      press(s, a); press(s, c); press(s, OPP[a]);
      return true;
    }
    bot(g, s, b);
    return false;
  },
};

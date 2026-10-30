// Benchmark contract for Bubble Blitz 3D (see tools/bench.mjs). The bot aims like a mouse player:
// it points at a spot on the 3D table (onPointerMove with a screen point, which the game maps back
// onto the board) and fires with Space; ↑ swaps the current and next bubble. Before each shot it
// tries a fan of angles (and both bubbles), following each shot exactly as the game flies it — off
// the side walls, until it touches a bubble or the ceiling — to the cell it would snap into, and
// scores that: how many bubbles pop and drop, how close a near-miss is to making a group, and how
// near the bottom line it leaves the board. Lower skill tries fewer angles, sometimes settles for a
// worse shot, takes longer to fire (the ceiling and the push timer keep coming) and has a shaky
// hand (the angle is off by a little, which matters most on bank shots). The mistake: fire every
// bubble where it can't match, as low as possible, until the stack reaches the line and costs a life.
const W = 480, H = 720;
const R = 19, D = R * 2, COLS = 12;
const LEFT = (W - COLS * D) / 2;
const ROWH = R * Math.sqrt(3);
const DANGER = H - 158;
const GUN_X = W / 2, GUN_Y = H - 84;
const SHOT_SPEED = 1150;
const STEP = 1 / 120;
const AIM_MIN = 0.12, AIM_MAX = Math.PI - 0.12;

const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());

/** A read-only copy of the board: cells by "row,c", plus the game's own grid rules. */
function board(g) {
  const cells = new Map();
  g.grid.forEach((line, row) => line.forEach((b, c) => { if (b) cells.set(row * 16 + c, b); }));
  const offset = (row) => ((row + g.par) & 1) === 1;
  const ncols = (row) => (offset(row) ? COLS - 1 : COLS);
  const top = g.top;
  const xy = (row, c) => [LEFT + R + c * D + (offset(row) ? R : 0), top + R + row * ROWH];
  const nb = (row, c) => {
    const o = offset(row);
    const list = o
      ? [[row, c - 1], [row, c + 1], [row - 1, c], [row - 1, c + 1], [row + 1, c], [row + 1, c + 1]]
      : [[row, c - 1], [row, c + 1], [row - 1, c - 1], [row - 1, c], [row + 1, c - 1], [row + 1, c]];
    return list.filter(([rr, cc]) => rr >= 0 && cc >= 0 && cc < ncols(rr));
  };
  const rows = g.grid.length;
  // cell centres by row, for the shot's collision test
  const byRow = [];
  for (const [k] of cells) { const row = k >> 4, c = k & 15; (byRow[row] ||= []).push(xy(row, c)); }
  const B = { cells, offset, ncols, top, xy, nb, rows, byRow };
  B.low = lowRow(B);
  return B;
}

/** Fly a shot at angle a exactly as moveShot() does; return the cell land() would snap it into. */
function flyTo(B, a) {
  let x = GUN_X, y = GUN_Y, vx = Math.cos(a) * SHOT_SPEED, vy = -Math.sin(a) * SHOT_SPEED, bounces = 0;
  const lim = (D * 0.86) ** 2;
  for (let f = 0; f < 240; f++) {
    for (let i = 0; i < 8; i++) {
      x += vx * STEP / 8; y += vy * STEP / 8;
      if (x < LEFT + R) { x = LEFT + R; vx = Math.abs(vx); bounces++; }
      if (x > W - LEFT - R) { x = W - LEFT - R; vx = -Math.abs(vx); bounces++; }
      let hit = y - R <= B.top;
      if (!hit) {
        const r0 = Math.max(0, Math.floor((y - D - B.top - R) / ROWH)), r1 = Math.ceil((y + D - B.top - R) / ROWH);
        for (let row = r0; row <= r1 && !hit; row++) {
          const list = B.byRow[row]; if (!list) continue;
          for (const [bx, by] of list) {
            if (Math.abs(by - y) > D) continue;
            if ((bx - x) ** 2 + (by - y) ** 2 < lim) { hit = true; break; }
          }
        }
      }
      if (hit) return snap(B, x, y, bounces);
    }
  }
  return null;
}
function snap(B, x, y, bounces) {
  let best = null, bd = 1e9;
  const approxRow = Math.max(0, Math.round((y - B.top - R) / ROWH));
  for (let spread = 1; spread <= 4 && !best; spread += 3)
  for (let row = Math.max(0, approxRow - spread); row <= approxRow + spread; row++) {
    for (let c = 0; c < B.ncols(row); c++) {
      if (B.cells.has(row * 16 + c)) continue;
      if (row > 0 && !B.nb(row, c).some(([rr, cc]) => B.cells.has(rr * 16 + cc))) continue;
      const [cx, cy] = B.xy(row, c), d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) { bd = d; best = [row, c]; }
    }
  }
  return best && { row: best[0], c: best[1], bounces };
}

/** The same-colour group a bubble of colour k at (row, c) would join (itself included). */
function groupAt(B, row, c, k) {
  const seen = new Set([row * 16 + c]), q = [[row, c]];
  while (q.length) {
    const [rr, cc] = q.pop();
    for (const [nr, nc] of B.nb(rr, cc)) {
      const key = nr * 16 + nc, b = B.cells.get(key);
      if (!b || b.stone || b.c !== k || seen.has(key)) continue;
      seen.add(key); q.push([nr, nc]);
    }
  }
  return seen;
}
/** How many bubbles would fall if `gone` were removed (no longer hanging from the top row). */
function dropsAfter(B, gone) {
  const seen = new Set(), q = [];
  for (const [k] of B.cells) if (k >> 4 === 0 && !gone.has(k)) { seen.add(k); q.push(k); }
  while (q.length) {
    const k = q.pop();
    for (const [nr, nc] of B.nb(k >> 4, k & 15)) {
      const key = nr * 16 + nc;
      if (B.cells.has(key) && !gone.has(key) && !seen.has(key)) { seen.add(key); q.push(key); }
    }
  }
  let n = 0, low = -1;
  for (const [k] of B.cells) if (!gone.has(k) && !seen.has(k)) n++; else if (!gone.has(k)) low = Math.max(low, k >> 4);
  lastLow = low;
  return n;
}
let lastLow = -1;                       // the lowest row still standing after the last dropsAfter()
/** The lowest occupied row of a board. */
const lowRow = (B) => { let r = -1; for (const [k] of B.cells) r = Math.max(r, k >> 4); return r; };

/** What landing a bubble of colour k at a cell does: { v: score, after: the board afterwards }.
 *  (A rainbow bubble takes the colour of its best neighbour, as the game's bestColourAt() does.) */
function outcome(B, land, k, rainbow, shotsLeft) {
  const { row, c } = land, key = row * 16 + c;
  const lowY = B.xy(row, 0)[1] + R;
  let colours = rainbow ? [...new Set(B.nb(row, c).map(([rr, cc]) => B.cells.get(rr * 16 + cc)).filter((x) => x && !x.stone).map((x) => x.c))] : [k];
  if (!colours.length) colours = [k];
  let best = null;
  for (const col of colours) {
    const grp = groupAt(B, row, c, col);
    let v, gone = null;
    if (grp.size >= 3) {
      gone = new Set([...grp].filter((x) => x !== key));
      const dropped = dropsAfter(B, gone);
      v = 100 + grp.size * 4 + dropped * 7 + (B.low - lastLow) * 12;     // and raising the bottom of the board
    } else {
      // a miss: one more towards the next ceiling drop. Better next to its own colour (a pair to
      // finish later), high up, and never close to the line.
      v = (grp.size === 2 ? 12 : 0) - row * 1.5 - Math.max(0, row - B.low) * 15;
      const room = DANGER - lowY - (shotsLeft <= 1 ? ROWH : 0) - (B.pushSoon ? ROWH : 0);   // the ceiling is about to drop / a row to push in
      if (room < ROWH * 2.5) v -= (ROWH * 2.5 - room) * 3;
    }
    if (lowY > DANGER || (lowY > DANGER - ROWH && (B.pushSoon || shotsLeft <= 1) && !gone)) v -= 1000;                       // lands past the line: certain loss
    if (!best || v > best.v) best = { v, col, gone, miss: !gone };
  }
  return best;
}
/** The board after a landing (popped group and everything left hanging removed). */
function after(B, land, o) {
  const cells = new Map(B.cells), key = land.row * 16 + land.c;
  if (o.gone) {
    cells.delete(key);
    for (const x of o.gone) cells.delete(x);
    const B2 = { ...B, cells };
    const seen = new Set(), q = [];
    for (const [x] of cells) if (x >> 4 === 0) { seen.add(x); q.push(x); }
    while (q.length) { const x = q.pop(); for (const [nr, nc] of B.nb(x >> 4, x & 15)) { const y = nr * 16 + nc; if (cells.has(y) && !seen.has(y)) { seen.add(y); q.push(y); } } }
    for (const [x] of [...cells]) if (!seen.has(x)) cells.delete(x);
    B2.low = lowRow(B2);
    return B2;
  }
  cells.set(key, { c: o.col, stone: false });
  const B2 = { ...B, cells };
  B2.low = lowRow(B2);
  return B2;
}

/** Look at the board and choose the next shot: { a: angle, swap: bool }. The expert also thinks
 *  one shot ahead: what the bubble after this one could do on the board this shot leaves. */
function plan(g, b) {
  const B = board(g);
  B.pushSoon = g.pushEvery && g.pushT > g.pushEvery - 2.5;    // the pink bar is nearly full
  const n = Math.round(30 + b.skill * b.skill * 230);          // angles tried
  const rainbow = g.bonus || g.rainbowShots > 0;
  const options = [];
  const colours = [{ k: g.cur, then: g.next, swap: false }];
  if (!g.bonus && g.next !== g.cur && b.rand() < 0.2 + b.skill * 0.8) colours.push({ k: g.next, then: g.cur, swap: true });
  const cache = new Map(), lands = new Map();
  for (let i = 0; i <= n; i++) {
    const a = AIM_MIN + (AIM_MAX - AIM_MIN) * (i / n);
    const land = flyTo(B, a);
    if (!land) continue;
    const key = land.row * 16 + land.c;
    if (!lands.has(key)) lands.set(key, land);
    for (const { k, then, swap } of colours) {
      const ck = key * 8 + k + (swap ? 100000 : 0);
      let o = cache.get(ck);
      if (o == null) { o = outcome(B, land, k, rainbow && !swap, g.shotsLeft); o.land = land; o.then = then; cache.set(ck, o); }
      // bank shots are harder to get right: a slight preference for straight ones
      options.push({ a, swap, v: o.v - land.bounces * (2 - b.skill), key, o });
    }
  }
  if (!options.length) return { a: Math.PI / 2, swap: false };
  // one shot ahead (expert-ish players): the best follow-up on the board this shot leaves, using
  // the cells reachable now as the cells reachable then
  if (!g.bonus && b.rand() < b.skill * b.skill) {
    const firsts = [...cache.values()].sort((p, q) => q.v - p.v).slice(0, 14);
    for (const o of firsts) {
      const B2 = after(B, o.land, o);
      let best = -50;
      if (!B2.cells.size) best = 300;
      else for (const [key, land] of lands) {
        if (B2.cells.has(key)) continue;
        if (land.row > 0 && !B2.nb(land.row, land.c).some(([rr, cc]) => B2.cells.has(rr * 16 + cc))) continue;
        best = Math.max(best, outcome(B2, land, o.then, false, o.miss ? g.shotsLeft - 1 : g.shotsLeft).v);
      }
      o.ahead = best;
    }
    for (const op of options) if (op.o.ahead != null) op.v += op.o.ahead * 0.5; else op.v -= 1000;
  }
  options.sort((p, q) => q.v - p.v);
  // the expert takes the best; a weaker player often settles for one of the next few ideas
  let pick = options[0];
  if (b.rand() > b.skill) {
    const distinct = [];
    for (const o of options) if (!distinct.some((d) => d.key === o.key && d.swap === o.swap)) { distinct.push(o); if (distinct.length >= 5) break; }
    pick = distinct[Math.floor(b.rand() * distinct.length)];
  }
  // aim at the middle of the run of angles that land in the same cell (the safest line)
  const same = options.filter((o) => o.key === pick.key && o.swap === pick.swap).map((o) => o.a).sort((p, q) => p - q);
  const stepA = (AIM_MAX - AIM_MIN) / n;
  let lo = pick.a, hi = pick.a, changed = true;
  while (changed) { changed = false; for (const a of same) { if (a < lo && a >= lo - stepA * 1.01) { lo = a; changed = true; } if (a > hi && a <= hi + stepA * 1.01) { hi = a; changed = true; } } }
  return { a: (lo + hi) / 2, swap: pick.swap };
}

/** Point the launcher at angle a: hover the pointer over a board spot along that line. */
function pointAt(g, s, a) {
  a = Math.max(AIM_MIN, Math.min(AIM_MAX, a));
  const bx = GUN_X + Math.cos(a) * 260, by = GUN_Y - Math.sin(a) * 260;
  const q = g.cam.at(bx, by, R);
  s.pointerMove(q[0], q[1]);
}

function bot(g, s, b) {
  const m = b.mem;
  s.keyUp('action'); s.keyUp('up');
  if (g.shot || g.clearing > 0 || g.failing > 0) { m.plan = null; return; }
  if (!m.plan) {
    m.plan = plan(g, b);
    m.plan.err = gauss(b.rand) * (1 - b.skill) * 0.035;      // a shaky hand
    m.plan.at = b.t + 0.12 + (1 - b.skill) * (0.4 + b.rand() * 1.2);   // time to look and line up
    m.plan.swapped = false;
  }
  const p = m.plan;
  if (p.swap && !p.swapped) { s.keyDown('up'); p.swapped = true; return; }
  pointAt(g, s, p.a + p.err);
  if (b.t >= p.at || g.clock < 0.3) {
    s.keyDown('action');
    if (g.shot) m.plan = null;                            // fired: look again for the next one
    else p.at = b.t + 0.25;                               // the launcher didn't fire: press again in a moment
  }
}

/** The board rules (checked once per board change). */
function checkBoard(g) {
  const B = board(g);
  for (let row = 0; row < g.grid.length; row++) {
    const line = g.grid[row];
    for (let c = 0; c < line.length; c++) {
      const cell = line[c];
      if (!cell) continue;
      if (c >= B.ncols(row)) return `a bubble sits off the end of row ${row} (col ${c} of ${B.ncols(row)})`;
      if (!cell.stone && !(Number.isInteger(cell.c) && cell.c >= 0 && cell.c < g.nColors)) return `a bubble has colour ${cell.c}`;
      if (cell.stone && cell.secret) return 'a stone hides a secret';
      const [x, y] = B.xy(row, c);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < LEFT + R - 1e-6 || x > W - LEFT - R + 1e-6) return `bubble ${row},${c} is off the board at x ${x}`;
    }
  }
  if (!g.bonus && g.countColoured() === 0 && !(g.clearing > 0)) return 'the board is clear but the level goes on';
  if (!g.bonus && (g.shotsLeft < 0 || g.shotsLeft > g.dropEvery)) return `${g.shotsLeft} shots left before the ceiling drops (of ${g.dropEvery})`;
  if (g.grid.length > 40) return `the board has ${g.grid.length} rows`;
  return null;
}

const checked = new WeakMap();          // per game: the last board check
const watch = new WeakMap();            // per game: shot in flight / lives lost at the last check
/** The bottom edge of the lowest bubble on the board. */
function lowest(g) {
  let y = -Infinity;
  g.grid.forEach((line, row) => { if (line.some(Boolean)) y = Math.max(y, g.xy(row, 0)[1] + R); });
  return y;
}
const removed = new WeakMap();          // per game: bubbles popped or dropped so far

export default {
  levels: 20,                           // endless game: bench levels 1–20
  // 6–11 rows of 12 to clear; the expert needs ~20–60 shots at ≥ 0.2 s each plus 0.5 s flight;
  // a lost life cuts two rows so a mistake costs little time. Levels 4+ also push rows in.
  limit: (level) => 120 + level * 6,
  stuck: 30,                            // the launcher fires by itself within 7 s; 30 s without a pop = stuck

  progress(g, s) {
    let r = removed.get(g);
    if (!r || r.level !== g.level) { r = { level: g.level, n: 0, count: g.countColoured(), lives: s.livesLost }; removed.set(g, r); }
    const now = g.countColoured();
    if (s.livesLost !== r.lives) { r.lives = s.livesLost; r.count = now; }     // rows melted by a lost life don't count
    if (now < r.count) r.n += r.count - now;
    r.count = now;
    return r.n;
  },

  invariants(g, s) {
    if (!(g.aim >= AIM_MIN - 1e-9 && g.aim <= AIM_MAX + 1e-9)) return `the launcher aims at ${g.aim}`;
    const sh = g.shot;
    if (sh) {
      if (![sh.x, sh.y, sh.vx, sh.vy].every(Number.isFinite)) return 'the flying bubble has a position that is not a number';
      if (sh.x < LEFT + R - 1e-6 || sh.x > W - LEFT - R + 1e-6) return `the flying bubble left the board at x ${sh.x.toFixed(1)}`;
      if (sh.y > GUN_Y + 1 || sh.y < g.top - D) return `the flying bubble is at y ${sh.y.toFixed(1)} (ceiling ${g.top.toFixed(0)})`;
      if (Math.abs(Math.hypot(sh.vx, sh.vy) - SHOT_SPEED) > 1e-6) return `the flying bubble moves at ${Math.hypot(sh.vx, sh.vy).toFixed(1)}, not ${SHOT_SPEED}`;
    }
    if (!(g.cur >= 0 && g.cur < g.nColors && g.next >= 0 && g.next < g.nColors)) return `the launcher holds colours ${g.cur} / ${g.next} of ${g.nColors}`;
    // A bubble past the line costs a life: the game checks after every landing, push and drop,
    // and a lost life melts the two lowest rows so play goes on from above the line.
    const was = watch.get(g) || {};
    const landed = was.shot && !sh, revived = was.lives != null && was.lives !== s.livesLost;
    watch.set(g, { shot: !!sh, lives: s.livesLost });
    // after every shot everything still on the board hangs from the ceiling (a lost life melting
    // the lowest rows can leave a bubble hanging in the air until the next shot drops it)
    if (landed) { const B = board(g), n = dropsAfter(B, new Set()); if (n) return `${n} bubble(s) left floating after a shot, with nothing holding them up`; }
    if (!g.bonus && (landed || revived) && !(g.failing > 0) && !(g.clearing > 0)) {
      const low = lowest(g);
      if (low > DANGER + 1e-6) return revived
        ? `after a lost life the board is still past the line (lowest bubble at y ${low.toFixed(0)}, line ${DANGER}; ceiling dropped ${g.drops}×, ${g.grid.length} rows left) — the next shot loses another life`
        : `a shot landed past the line (lowest bubble at y ${low.toFixed(0)}) but no life was lost`;
    }
    // the board only changes when its revision does: check it once per change
    const seen = checked.get(g);
    if (seen && seen.rev === g.rev && seen.par === g.par && seen.drops === g.drops && seen.failing === (g.failing > 0) && seen.shot === !!g.shot && seen.clearing === (g.clearing > 0)) return seen.bad;
    const bad = checkBoard(g);
    checked.set(g, { rev: g.rev, par: g.par, drops: g.drops, failing: g.failing > 0, shot: !!g.shot, clearing: g.clearing > 0, bad });
    return bad;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.mistakeLives ??= s.livesLost;
    if (s.livesLost > m.mistakeLives) return true;           // it cost a life: done
    s.keyUp('action');
    if (g.shot || g.clearing > 0 || g.failing > 0) return false;
    if (b.t < (m.mistakeNext ?? 0)) return false;
    m.mistakeNext = b.t + 0.25;
    // the lowest cell this bubble can reach where it pops nothing
    const B = board(g);
    let best = null;
    for (let i = 0; i <= 80; i++) {
      const a = AIM_MIN + (AIM_MAX - AIM_MIN) * (i / 80), land = flyTo(B, a);
      if (!land || groupAt(B, land.row, land.c, g.cur).size >= 3) continue;
      if (!best || land.row > best.row) best = { ...land, a };
    }
    pointAt(g, s, best ? best.a : Math.PI / 2);
    s.keyDown('action');
    return false;
  },
};

// Benchmark contract for Crystal Cascade 3D (see tools/bench.mjs). The bot aims like a mouse
// player: it points at a column on the turning platform (onPointerMove with the screen x where
// that column stands, which the game maps back to an aim angle), fires with Space and swaps the
// current and next crystal with ↑. Before each shot it looks at every column it can reach right
// now and plays the shot out on a copy of the stack exactly as the game resolves it — the
// crystal lands (a prism takes the colour that helps most), groups of 3+ shatter, power crystals,
// charged layers and obsidian go off, everything above drops and the cascade repeats — and
// scores the board it leaves: geodes cracked, geodes dug free (on top of their column), how
// deep the rest are still buried, and how close the tallest column is to the red ring (with
// the floor about to rise). It also tries the next crystal (swap first). In Crystal Fever and
// Crystal Rain it keeps the trigger down and lines up each rapid shot the same way.
// Lower skill takes longer to look and fire (the cannon fires by itself after a few seconds,
// and the floor keeps rising), often settles for one of its next-best ideas, swaps less and has
// a shaky hand (the aim drifts onto the next column now and then).
// The mistake: stack crystals that match nothing on the tallest column in reach until it
// breaks the red ring and costs a life.
const N = 12, SEC = (Math.PI * 2) / N, RING = 150, LH = 36, MAXH = 8, AIM = 1.15;

const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());
const wrapA = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

// ── a copy of the stack and the game's own resolve rules ──
function copyBoard(g) {
  return g.cols.map((col) => col.filter((c) => !c.die).map((c) => ({ c: c.c, kind: c.kind, p: c.p })));
}
const matchable = (c) => c && (c.kind === 'n' || c.kind === 'bolt' || c.kind === 'power');
function nbs(B, i, j) { return [[(i + 1) % N, j], [(i - 1 + N) % N, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => b >= 0 && B[a][b]); }
function groupAt(B, i, j) {
  const st = B[i][j];
  if (!matchable(st)) return [];
  const seen = new Set([i * 64 + j]), out = [[i, j]], q = [[i, j]];
  while (q.length) {
    const [a, b] = q.pop();
    for (const [x, y] of nbs(B, a, b)) {
      const k = x * 64 + y, c = B[x][y];
      if (seen.has(k) || !matchable(c) || c.c !== st.c) continue;
      seen.add(k); out.push([x, y]); q.push([x, y]);
    }
  }
  return out;
}
function findGroups(B) {
  const seen = new Set(), groups = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < B[i].length; j++) {
    if (seen.has(i * 64 + j)) continue;
    const gr = groupAt(B, i, j);
    for (const [a, b] of gr) seen.add(a * 64 + b);
    if (gr.length >= 3) groups.push(gr);
  }
  return groups;
}
/** Land one shot (colour k, prism or not) on column i and resolve every cascade. Mutates B. */
function landShot(B, i, k, prism, out) {
  const col = B[i], top = col[col.length - 1];
  if (top && top.kind === 'geode') { col.pop(); out.geodes++; return; }
  const cell = { c: k, kind: 'n' };
  col.push(cell);
  const j = col.length - 1;
  if (prism) {
    let best = cell.c, bn = 0;
    const tried = new Set(nbs(B, i, j).map(([a, b]) => B[a][b]).filter(matchable).map((c) => c.c));
    for (const c of tried) { cell.c = c; const n = groupAt(B, i, j).length; if (n > bn) { bn = n; best = c; } }
    cell.c = best;
  }
  let step = 0;
  for (;;) {
    const groups = findGroups(B);
    if (!groups.length) break;
    step++;
    const kill = new Map(), queue = [];
    const mark = (a, b) => {
      const c = B[a]?.[b];
      if (!c || kill.has(a * 64 + b)) return;
      kill.set(a * 64 + b, [a, b, c]);
      if (c.kind === 'power' || c.kind === 'bolt') queue.push([a, b, c]);
    };
    for (const gr of groups) for (const [a, b] of gr) mark(a, b);
    while (queue.length) {
      const [a, b, c] = queue.shift();
      if (c.kind === 'bolt') for (let x = 0; x < N; x++) mark(x, b);
      else if (c.p === 'bomb') { for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) mark((a + di + N) % N, b + dj); }
      else if (c.p === 'drill') for (let y = 0; y < B[a].length; y++) mark(a, y);
      else if (c.p === 'freeze') out.freeze = true;
      else if (c.p === 'burst') for (let x = 0; x < N; x++) B[x].forEach((d, y) => { if (matchable(d) && d.c === c.c) mark(x, y); });
    }
    for (const [a, b] of [...kill.values()]) for (const [x, y] of nbs(B, a, b)) {
      const c = B[x][y];
      if (c.kind === 'stone') mark(x, y); else if (c.kind === 'ice') c.kind = 'n';
    }
    for (const [, , c] of kill.values()) { if (c.kind === 'geode') out.geodes++; else out.gone++; c.dead = true; }
    for (let x = 0; x < N; x++) B[x] = B[x].filter((c) => !c.dead);
  }
  out.steps = Math.max(out.steps, step);
}

/** How good a board is to be left with (geodes cracked counted by the caller). */
function boardValue(g, B, out, riseSoon) {
  let v = out.geodes * 1000 + out.gone * 4 + (out.steps >= 2 ? 25 : 0) + (out.freeze ? 20 : 0);
  let tall = 0;
  for (let i = 0; i < N; i++) {
    const col = B[i], h = col.length + (riseSoon ? 1 : 0);
    tall = Math.max(tall, h);
    if (h > MAXH) v -= 100000;                                   // breaks the ring: a lost life
    else if (h >= 6) v -= (h - 5) ** 2 * 45;
    v -= h * 3;
    col.forEach((c, j) => {
      if (c.kind !== 'geode') return;
      const above = col.length - 1 - j;
      v += above === 0 ? 300 : -above * 22;                         // dug free / still buried
    });
  }
  return v - Math.max(0, tall - 4) * 10;
}

/** The columns in reach right now, with the aim angle that points at each. */
function reachable(g, lead) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const a = wrapA(g.colAngle(i) + g.spin * lead);
    if (Math.abs(a) > AIM + SEC / 2 - 0.08) continue;
    out.push({ i, a: Math.max(-AIM + 0.01, Math.min(AIM - 0.01, a)), edge: Math.abs(a) > AIM - 0.05 });
  }
  return out;
}

/** Choose the next shot: { i, swap }. Pending shots in flight land first, in order. */
function plan(g, s, b) {
  const base = copyBoard(g), pre = { geodes: 0, gone: 0, steps: 0 };
  // board after the shots already on their way
  for (const sh of g.shots) landShot(base, sh.col, sh.c, sh.prism, pre);
  const lead = 0.1 + (1 - b.skill) * 0.3;
  const reach = reachable(g, lead);
  const prism = g.rapid() || g.prism > 0;
  const riseSoon = !g.rapid() && g.freezeT <= 0 && g.pushT > g.pushEvery - 1.5;
  const tries = [{ k: g.cur, swap: false }];
  if (!g.rapid() && g.next !== g.cur && b.rand() < 0.3 + 0.7 * b.skill) tries.push({ k: g.next, swap: true });
  const opts = [];
  for (const r of reach) for (const t of tries) {
    const B = base.map((c) => c.map((x) => ({ ...x }))), out = { geodes: pre.geodes, gone: pre.gone, steps: 0 };
    landShot(B, r.i, t.k, prism, out);
    // landing next to its own colour: a pair to finish off later
    const top = B[r.i][B[r.i].length - 1];
    let v = boardValue(g, B, out, riseSoon);
    if (out.gone === pre.gone && top && top.kind === 'n' && top.c === t.k) v += groupAt(B, r.i, B[r.i].length - 1).length === 2 ? 14 : 0;
    if (r.edge) v -= 6 * (1.2 - b.skill);                         // a column about to leave the reach is a risky aim
    if (t.swap) v -= 1;
    opts.push({ i: r.i, swap: t.swap, v });
  }
  if (!opts.length) return null;
  opts.sort((p, q) => q.v - p.v);
  let pick = opts[0];
  if (b.rand() > b.skill) pick = opts[Math.floor(b.rand() * Math.min(3, opts.length))];
  return pick;
}

/** Point the cannon at column i: move the pointer over where that column stands on screen. */
function pointAt(g, s, i, err = 0) {
  const a = Math.max(-AIM, Math.min(AIM, wrapA(g.colAngle(i)) + err));
  const q = g.cam.p(Math.sin(a) * RING, LH * 3, -Math.cos(a) * RING);
  s.pointerMove(q[0], 400);
}

function fire(s) { s.keyUp('action'); s.keyDown('action'); }

function bot(g, s, b) {
  const m = b.mem;
  s.keyUp('up');
  if (g.failing > 0 || g.clearing > 0) { s.keyUp('action'); m.plan = null; return; }
  const rapid = g.rapid();
  if (!rapid && g.shots.length) { s.keyUp('action'); m.plan = null; return; }
  if (rapid && g.shots.length >= 3) return;
  if (!m.plan || m.plan.rapid !== rapid || m.plan.lives !== s.livesLost) {
    const p = plan(g, s, b);
    if (!p) { s.keyUp('action'); return; }                        // nothing in reach (can't happen: ~5 columns always are)
    m.plan = { ...p, rapid, lives: s.livesLost, swapped: false,
      err: gauss(b.rand) * (1 - b.skill) * 0.18,                   // a shaky hand
      at: b.t + (rapid ? 0.02 + (1 - b.skill) * 0.25 : 0.12 + (1 - b.skill) * (0.4 + b.rand() * 1.6)) };
  }
  const p = m.plan;
  if (p.swap && !p.swapped) { s.keyDown('up'); p.swapped = true; return; }
  pointAt(g, s, p.i, p.err);
  // gone out of reach while lining up: look again
  if (Math.abs(wrapA(g.colAngle(p.i))) > AIM + SEC / 2 - 0.04) { m.plan = null; return; }
  if (b.t < p.at && g.clock > 0.25) return;
  if (b.skill >= 1 && g.aimCol() !== p.i) return;                 // an expert waits until it really points there
  const n = g.shots.length;
  fire(s);
  if (g.shots.length > n) m.plan = null;
}

// ── rules ──
const resolving = new WeakMap();        // per game: phase / shots in flight / floor timer at the last step
function cellRules(g) {
  let geodes = 0;
  for (let i = 0; i < N; i++) {
    const col = g.cols[i];
    for (let j = 0; j < col.length; j++) {
      const c = col[j];
      if (!c) return `column ${i} has a hole at layer ${j}`;
      if (!['n', 'stone', 'ice', 'bolt', 'power', 'geode'].includes(c.kind)) return `a crystal of kind ${c.kind}`;
      if (c.kind === 'stone' || c.kind === 'geode') { if (c.c !== -1 && c.kind === 'geode') return 'a geode has a colour'; }
      else if (!(Number.isInteger(c.c) && c.c >= 0 && c.c < g.nColors)) return `a ${c.kind} crystal has colour ${c.c} (of ${g.nColors})`;
      if (c.kind === 'power' && !['bomb', 'drill', 'freeze', 'burst'].includes(c.p)) return `a power crystal of type ${c.p}`;
      if (!Number.isFinite(c.yo) || !Number.isFinite(c.vy)) return 'a crystal position is not a number';
      if (c.kind === 'geode' && !c.die) geodes++;
    }
  }
  return { geodes };
}

export default {
  levels: 20,                           // endless game: bench levels 1–20
  // 1–3 geodes buried under 3–5 layers; an expert digs one out in ~10–25 shots at ~0.35 s
  // each plus the cascades. A lost life rebuilds the whole board (every geode again).
  limit: (level) => 150 + level * 6,
  stuck: 40,                            // the cannon fires by itself every ≤ 4 s; 40 s with nothing shattered = stuck
  progress: (g) => g.shattered + 1000 * (g.geodesNeed - g.geodesLeft),

  invariants(g, s) {
    for (const [k, v] of [['aim', g.aim], ['rot', g.rot], ['spin', g.spin], ['pushT', g.pushT], ['clock', g.clock], ['fever', g.fever]]) if (!Number.isFinite(v)) return `${k} is ${v}`;
    if (Math.abs(g.aim) > AIM + 1e-9) return `the cannon aims at ${g.aim.toFixed(3)}, past its ±${AIM} reach`;
    if (g.fever < 0 || g.fever > 1 + 1e-9) return `the fever bar is at ${g.fever}`;
    if (g.prism < 0 || g.prism > 3) return `${g.prism} prism shots (max 3)`;
    if (g.shots.length > 3) return `${g.shots.length} shots in flight (max 3)`;
    if (!(g.cur >= 0 && g.cur < g.nColors && g.next >= 0 && g.next < g.nColors)) return `the cannon holds colours ${g.cur} / ${g.next} of ${g.nColors}`;
    for (const sh of g.shots) if (!(sh.col >= 0 && sh.col < N)) return `a shot flies at column ${sh.col}`;
    const cap = g.baseSpin * 1.65 * 3 + 1e-6;
    if (Math.abs(g.spin) > cap) return `the platform spins at ${g.spin.toFixed(2)} rad/s (cap ${cap.toFixed(2)})`;
    if (g.clock > g.clockMax + 1e-9) return `the cannon clock is ${g.clock.toFixed(2)} s (max ${g.clockMax})`;
    if (!g.bonus && g.pushT > g.pushEvery + 1e-6) return `the floor is ${g.pushT.toFixed(2)} s into a ${g.pushEvery} s rise and hasn't risen`;
    const r = cellRules(g);
    if (typeof r === 'string') return r;
    if (g.geodesLeft < 0 || g.geodesLeft > g.geodesNeed) return `${g.geodesLeft} geodes left of ${g.geodesNeed}`;
    if (!(g.clearing > 0) && r.geodes !== g.geodesLeft) return `${r.geodes} geodes on the board but the counter says ${g.geodesLeft} left`;
    const settled = !g.phase && !(g.failing > 0) && !(g.clearing > 0);
    // did the stack just resolve (a shot landed, the floor rose, or a cascade finished)?
    const was = resolving.get(g) || {}, now = { phase: !!g.phase, shots: g.shots.length, pushT: g.pushT, lives: s.livesLost };
    resolving.set(g, now);
    const resolved = was.lives === now.lives && (was.phase || now.shots < was.shots || now.pushT < was.pushT);   // (a lost life builds a fresh board)
    if (settled) {
      for (let i = 0; i < N; i++) if (g.cols[i].length > MAXH) return `column ${i} is ${g.cols[i].length} high, through the red ring, and no life was lost`;
      if (!g.bonus && g.geodesLeft <= 0) return 'every geode is cracked but the level goes on';
      // a resolve leaves no group of 3+ behind. (A fresh board, new level or after a lost life,
      // can start with one, about 1 in 350: a known glitch with a patch proposed. The next landing
      // shatters it, so only a group that survives a resolve counts here.)
      if (resolved && findGroups(copyBoard(g)).length) return 'a group of 3+ is left on the stack after the stack resolved';
    }
    if (g.bonus && g.geodesNeed) return 'Crystal Rain has geodes to crack';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.l0 ??= s.livesLost;
    if (s.livesLost > m.l0) { s.keyUp('action'); return true; }
    s.keyUp('up');
    if (g.failing > 0 || g.shots.length || g.phase) { s.keyUp('action'); return false; }
    if (b.t < (m.next ?? 0)) return false;
    // the tallest column in reach where this crystal shatters nothing
    let best = null;
    for (const r of reachable(g, 0.05)) {
      const B = copyBoard(g), out = { geodes: 0, gone: 0, steps: 0 };
      landShot(B, r.i, g.cur, g.rapid() || g.prism > 0, out);
      if (out.gone || out.geodes) continue;
      const h = g.cols[r.i].length;
      if (!best || h > best.h) best = { i: r.i, h };
    }
    if (!best) { s.keyDown('up'); m.next = b.t + 0.1; return false; }   // everything matches: swap and look again
    pointAt(g, s, best.i);
    if (g.aimCol() !== best.i) return false;
    fire(s);
    m.next = b.t + 0.05;
    return false;
  },
};

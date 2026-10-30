// Benchmark contract for Void Breaker (see tools/bench.mjs). The bot plays like a phone player:
// one finger held on the screen (holding = firing) and dragged to turn and look up and down,
// lifted and put back down when it runs out of screen. It picks the most urgent thing to shoot —
// whatever will reach it soonest (orbs flying at it, darters, the swarm), else the closest thing
// in front of it, the boss's open core or its nodes, golden stars in a Star Shower — leads it
// (the shot flies at 100 a second) and swings round to it, with the 180° spin (↓) for things
// behind it and a NOVA (↑) when it is about to be swamped. Between waves it picks an upgrade card
// (← → and Space): a repair when hurt, else whatever adds to its shield. Lower skill re-picks its
// target less often, turns slower, aims looser and never spins or novas. The mistake: let go of the
// screen, turn its back on the wave and let the invaders hit it until a life is lost.
const W = 480, H = 720, TAU = Math.PI * 2;
const EYE = [0, 1.7, 0], SHOT_SPEED = 100;
const K_YAW = 0.006, K_PITCH = 0.006 * 0.7;      // game.js onPointerMove (mouse drag, not coarse)

// a headless shell has no WebGL; the game falls back to its plain-canvas picture (which draws
// nothing headless) after a console warning per start — keep the benchmark's output readable
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith('Void Breaker: WebGL failed')) warn(...a); };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const flat = (p) => Math.hypot(p[0], p[2]);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());

/** yaw / pitch that point the camera at world point p (camera basis: f = (sin y cos p, sin p, cos y cos p)). */
function lookAt(p) {
  const d = sub(p, EYE);
  return { yaw: Math.atan2(d[0], d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) };
}
/** Where to aim for a target moving at v: where it will be when the shot gets there. */
function lead(p, v) {
  if (!v) return p;
  let q = p;
  for (let i = 0; i < 3; i++) q = add(p, mul(v, len(sub(q, EYE)) / SHOT_SPEED));
  return q;
}

/** Everything worth shooting, with how urgent it is (smaller = sooner). */
function threats(g) {
  const out = [];
  for (const e of g.enemies) {
    if (e.dead || e.grow <= 0.4) continue;
    const d = flat(e.pos), sp = Math.max(1, Math.hypot(e.vel[0], e.vel[2]));
    let tt = Math.max(0, d - 2) / sp;
    if (e.kind === 'gunner' && d < 18) tt = Math.min(tt, 2.5);           // it sits and shoots: break it
    if (e.kind === 'warden' && g.wardenShield(e)) tt += 2;                // shielded: shots bounce off
    out.push({ p: e.pos, v: e.vel, tt, r: e.T.size, what: e.kind });
  }
  for (const o of g.orbs) {
    // only the orbs that will really hit (a boss's fan of orbs mostly flies past)
    const rel = sub(o.p, EYE), vv = o.v[0] ** 2 + o.v[1] ** 2 + o.v[2] ** 2 || 1, tc = -(rel[0] * o.v[0] + rel[1] * o.v[1] + rel[2] * o.v[2]) / vv;
    if (tc <= 0 || len(add(rel, mul(o.v, tc))) > 1.8) continue;
    out.push({ p: o.p, v: o.v, tt: tc - 0.2, r: 0.55, what: 'orb' });
  }
  for (const pk of g.pickups) out.push({ p: pk.p, tt: 6, r: 1, what: 'pickup' });
  for (const st of g.stars) out.push({ p: st.p, v: [Math.cos(st.a) * st.rad * st.w * st.dir, 0, -Math.sin(st.a) * st.rad * st.w * st.dir], tt: 1 + (st.comet ? -0.5 : 0), r: 1.2, what: 'star' });
  if (g.boss && !g.boss.dying && g.introT <= 0) {
    const was = (g.__bossPrev ??= new Map()), now = new Map();
    for (const tg of g.bossTargets()) {
      if (tg.armour) continue;
      const key = tg.node || 'core', prev = was.get(key);
      now.set(key, { p: tg.p, t: g.t });
      if (tg.core && !tg.open) continue;
      // boss parts move (the halo's ring spins): how fast, from the last look
      const v = prev && g.t > prev.t ? mul(sub(tg.p, prev.p), 1 / (g.t - prev.t)) : null;
      out.push({ p: tg.p, v, tt: tg.node ? 4 : 3, r: tg.r, what: tg.node ? 'node' : 'core' });
    }
    g.__bossPrev = now;
  }
  return out;
}

function pickTarget(g, b) {
  const all = threats(g);
  if (!all.length) return null;
  let best = null, bs = Infinity;
  for (const t of all) {
    const la = lookAt(t.p), turn = Math.abs(angDiff(la.yaw, g.yaw)) + Math.abs(la.pitch - g.pitch);
    // soonest first; a target already near the crosshair is cheaper to keep shooting
    const sc = t.tt + turn * (0.4 + 0.6 * b.skill) + (t === b.mem.last ? -0.3 : 0);
    if (sc < bs) { bs = sc; best = t; }
  }
  return best;
}

function chooseCard(g) {
  const opts = g.upgradePhase.opts, order = g.hp < g.perks.maxHp * 0.6 ? ['heal', 'maxhp', 'armour', 'nova'] : ['maxhp', 'armour', 'nova', 'heal', 'twin30', 'rapid30', 'spread30', 'chrono30'];
  for (const id of order) { const i = opts.findIndex((o) => o.id === id); if (i >= 0) return i; }
  return 0;
}

/** Drag the held finger by (dx, dy) screen pixels, lifting and re-placing it at the edges. */
function drag(g, s, b, dx, dy) {
  const m = b.mem;
  if (!s.input.pointer.down || m.px == null) { m.px = W / 2; m.py = H / 2; s.pointerDown(m.px, m.py); return; }
  let nx = m.px + dx, ny = m.py + dy;
  if (nx < 20 || nx > W - 20 || ny < 120 || ny > H - 120) {
    s.pointerUp(m.px, m.py);
    m.px = W / 2; m.py = H / 2; s.pointerDown(m.px, m.py);
    nx = m.px + dx; ny = m.py + dy;
  }
  m.px = Math.max(1, Math.min(W - 1, nx)); m.py = Math.max(1, Math.min(H - 1, ny));
  s.pointerMove(m.px, m.py);
}

function bot(g, s, b) {
  const m = b.mem;
  // between waves: the upgrade cards
  if (g.upgradePhase) {
    const up = g.upgradePhase;
    if (up.chosen >= 0) return;
    if (s.input.pointer.down) { s.pointerUp(); m.px = null; }
    const want = chooseCard(g);
    m.cardT ??= b.t;
    if (b.t - m.cardT < 0.4 + (1 - b.skill)) return;                    // reading the cards
    s.keyUp('left'); s.keyUp('right'); s.keyUp('action');
    if (up.hover !== want) s.keyDown(up.hover < want ? 'right' : 'left');
    else { s.keyDown('action'); m.cardT = null; }
    return;
  }
  s.keyUp('left'); s.keyUp('right'); s.keyUp('action'); s.keyUp('up'); s.keyUp('down');
  // pick a target (the expert every frame, lower skill every so often)
  if (m.retarget == null || b.t >= m.retarget || !m.target || !stillThere(g, m.target)) {
    m.retarget = b.t + (1 - b.skill) * 0.45 * (0.5 + b.rand());
    m.target = pickTarget(g, b);
    m.err = { yaw: gauss(b.rand) * (1 - b.skill) * 0.05, pitch: gauss(b.rand) * (1 - b.skill) * 0.04 };
  }
  const t = m.target;
  if (!t) { drag(g, s, b, 0, 0); return; }
  m.last = t;
  const aim = lookAt(lead(t.p, t.v));
  const dyaw = angDiff(aim.yaw + m.err.yaw, g.yaw), dpitch = Math.max(-0.5, Math.min(0.75, aim.pitch + m.err.pitch)) - g.pitch;
  // far behind: the quick 180° spin (expert)
  if (b.skill > 0.8 && Math.abs(dyaw) > 2.3 && g.quickTurn <= 0 && g.introT <= 0) { s.keyDown('down'); return; }
  // about to be swamped: NOVA (expert)
  if (b.skill > 0.8 && g.novas > 0 && g.novaR <= 0 && !g.bonus) {
    const close = g.enemies.filter((e) => !e.dead && flat(e.pos) < 9).length;
    if (close >= 4 || (close >= 2 && g.hp < 40) || (g.boss && g.boss.kind === 'halo' && g.hp < 30)) { s.keyDown('up'); }
  }
  // turn speed: an expert flicks up to ~14 rad/s, an average player ~5
  const maxTurn = (5 + 9 * b.skill) / 120;
  const ty = Math.max(-maxTurn, Math.min(maxTurn, dyaw)), tp = Math.max(-maxTurn, Math.min(maxTurn, dpitch));
  drag(g, s, b, -ty / K_YAW, -tp / K_PITCH);
}
function stillThere(g, t) {
  if (t.what === 'orb') return g.orbs.some((o) => o.p === t.p);
  if (t.what === 'pickup') return g.pickups.some((pk) => pk.p === t.p);
  if (t.what === 'star') return g.stars.some((st) => st.p === t.p);
  if (t.what === 'node' || t.what === 'core') return false;               // boss parts move: re-read every frame
  return g.enemies.some((e) => e.pos === t.p && !e.dead);
}

const TYPE_SPD = { shard: 5.2, block: 3.4, darter: 9.0, splitter: 4.0, gunner: 4.2, phaser: 4.5, warden: 3.0, swarm: 7.5 };

export default {
  levels: 20,
  // up to 72 invaders a wave (12 + 3 a wave), spawning every 0.45–2.7 s; bosses take 30–90 s
  limit: (level) => 150 + level * 6,
  stuck: 30,
  // invaders spawned and broken, damage done to the boss, stars hit, a card picked
  progress: (g) => g.spawned + g.killedWave * 2 + (g.boss ? g.boss.maxHp * 2 - g.bossHp() : 0) + g.starsHit + (g.upgradePhase ? 5000 : 0),

  invariants(g, s) {
    if (![g.yaw, g.pitch, g.hp, g.turnV].every(Number.isFinite)) return 'the view or the shield is not a number';
    if (g.pitch < -0.5 - 1e-9 || g.pitch > 0.75 + 1e-9) return `the view is tipped to pitch ${g.pitch.toFixed(2)} (limits -0.5..0.75)`;
    if (g.hp < 0 || g.hp > g.perks.maxHp + 1e-9) return `shield ${g.hp} outside 0..${g.perks.maxHp}`;
    if (g.novas < 0 || g.novas > 3) return `${g.novas} novas (0–3)`;
    if (g.perks.armour > 0.6 + 1e-9) return `energy armour at ${g.perks.armour}`;
    if (!g.bonus && !(g.spawned <= g.total)) return `${g.spawned} invaders spawned of a wave of ${g.total}`;
    for (const e of g.enemies) {
      if (!e.pos.every(Number.isFinite) || !e.vel.every(Number.isFinite)) return `a ${e.kind} position or speed is not a number`;
      if (flat(e.pos) > 80) return `a ${e.kind} is out beyond the rift at ${flat(e.pos).toFixed(0)}`;
      if (e.pos[1] < -1 || e.pos[1] > 20) return `a ${e.kind} is at height ${e.pos[1].toFixed(1)}`;
      if (e.hp > e.maxHp) return `a ${e.kind} has ${e.hp} of ${e.maxHp} hp`;
      // speed caps: its own speed, a darter's zigzag, a swarm's wobble, a gunner's orbit and hover
      const base = TYPE_SPD[e.kind] * g.sc;
      const cap = base * 1.01 + (e.kind === 'darter' ? 8 * g.sc : e.kind === 'swarm' ? 4.5 : e.kind === 'gunner' ? base * 0.4 + 2 + 12 : 0) + 2.01;
      if (len(e.vel) > cap) return `a ${e.kind} is moving at ${len(e.vel).toFixed(1)} (cap ${cap.toFixed(1)})`;
    }
    for (const o of g.orbs) if (!o.p.every(Number.isFinite)) return 'an orb position is not a number';
    for (const sh of g.shots) {
      if (!sh.p.every(Number.isFinite)) return 'a shot position is not a number';
      if (Math.abs(len(sh.d) - 1) > 1e-6) return 'a shot direction is not a unit vector';
    }
    if (g.boss) {
      const B = g.boss;
      if (!B.pos.every(Number.isFinite)) return 'the boss position is not a number';
      if (B.coreHp > B.maxHp) return `the boss core has ${B.coreHp} of ${B.maxHp}`;
      if (B.nodes && B.nodes.some((n) => n.hp > n.max)) return 'a halo node has more hp than it started with';
      if (flat(B.pos) < 10) return `the boss is right on top of the player (${flat(B.pos).toFixed(1)} away)`;
    }
    if (g.upgradePhase && g.enemies.length && !g.bonus) return `the wave ended with ${g.enemies.length} invaders still in the arena`;
    if (g.bonus && (g.hp !== g.__hp0 && g.__hp0 != null)) return 'the shield changed in a Star Shower (nothing can hurt you there)';
    if (g.__hp0 == null) g.__hp0 = g.hp;
    if (s.lives > 3) return `${s.lives} lives`;
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.mLives ??= s.livesLost;
    if (s.livesLost > m.mLives) return true;
    if (g.upgradePhase) { bot(g, s, b); return false; }
    // lift the finger (no more firing) and look away from the nearest invader
    if (s.input.pointer.down) { s.pointerUp(); m.px = null; }
    s.hold([]);
    const near = g.enemies.filter((e) => !e.dead).sort((a, c) => flat(a.pos) - flat(c.pos))[0];
    if (near) {
      const away = lookAt(near.pos).yaw + Math.PI, d = angDiff(away, g.yaw);
      if (Math.abs(d) > 0.3) s.hold([d > 0 ? 'left' : 'right']);
    }
    return false;
  },
};

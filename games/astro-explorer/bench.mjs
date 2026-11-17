// Benchmark contract for Astro Explorer (see tools/bench.mjs).
// The bot knows each planet the way a player who has studied it does (bot-route.mjs: how many
// moves every spot is from the exit), and plays through the same controls as a keyboard player:
// left/right, jump (press, hold, let go), blade and blaster. Every 1/15 s it looks one move ahead
// from where it really is, with the game's own movement code, and takes the move that gets
// closest to the exit without touching a spike or walking into an alien. It cuts down aliens in
// reach of the blade, shoots those lined up ahead, and stops to heal when it is safe. Lower skill
// reacts late, misjudges a move now and then and attacks less.
// In a guardian's lair it fights the way a player learns to: it pictures the next quarter of a
// second (where the guardian's body, its shots, shock waves and lightning will be), takes the move
// that stays clear of all of them and ends closest to a spot from which the blade reaches the
// weak point, strikes whenever it is in reach (side, up, or a downward strike that bounces off),
// and backs off to heal with the energy its blade hits earn. A guardian heals fully when a life is
// lost, so each fight has to be won on one life.
// The mistake: on a planet, jump onto the nearest spikes until a life is gone; in a lair, walk
// into the guardian.
import { stepPlayer, touchesSpikes, slashBox, foeBox, lineOfSight, DT, TILE, PW, PH, FOCUS_COST } from './world.js';
import { guardianParts, shotBox } from './guardians.js';
import { buildRoute, MV, HOLD, inputAt, movesFor, FAR } from './bot-route.mjs';

const routes = new Map();                         // planet + open cracks + abilities → route
function routeFor(sim) {
  const m = sim.m, key = `${m.name}|${m.cracks.map((k) => (k.open ? 1 : 0)).join('')}|${sim.lo.abil}|${sim.fight === 'on' ? 'shut' : ''}`;
  let r = routes.get(key);
  if (!r) { r = buildRoute(m, sim.ab); routes.set(key, r); }
  return r;
}
const hit4 = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const bodyOf = (p, grow = 0) => [p.x - PW / 2 - grow, p.y - PH - grow, p.x + PW / 2 + grow, p.y + grow];

const list = new Int8Array(MV.length), list2 = new Int8Array(MV.length), inp = {};
/** Play move mv from q (changed in place). False if it touches a spike or falls out of the world. */
function tryMove(q, mv, m, ab) {
  for (let t = 0; t < HOLD; t++) {
    stepPlayer(q, inputAt(mv, t, inp), m, ab);
    if (touchesSpikes(q, m) || q.y > m.h + 40) return false;
  }
  return true;
}
/** Does following the distances downhill from q stay off the spikes for the next `steps` moves? */
function holdsUp(q0, route, field, m, ab, steps) {
  let q = q0;
  for (let i = 0; i < steps; i++) {
    const n = movesFor(q, ab, list2);
    let best = null, bc = 1e9;
    for (let k = 0; k < n; k++) {
      const r = Object.assign({}, q);
      if (!tryMove(r, MV[list2[k]], m, ab)) continue;
      const at = route.lookup(r), c = at && at[field] < FAR ? at[field] : 5000;
      if (c < bc) { bc = c; best = r; }
    }
    if (!best) return false;                      // every way on from here ends on a spike
    if (bc === 0) return true;
    q = best;
  }
  return true;
}
/** One move ahead from the real position: the move with the fewest moves left (by `field`). */
function choose(sim, route, field, b, { daring = false, intoSpikes = false } = {}) {
  const p = sim.p, m = sim.m, ab = sim.ab;
  const n = movesFor(p, ab, list);
  const foes = daring ? [] : sim.foes.filter((f) => !f.dead && Math.abs(f.x - p.x) < 140 && Math.abs(f.y - p.y) < 140).map((f) => foeBox(f));
  const globs = daring ? [] : sim.globs.filter((g) => !g.dead && Math.abs(g.x - p.x) < 120 && Math.abs(g.y - p.y) < 120);
  const cands = [];
  for (let k = 0; k < n; k++) {
    const mv = MV[list[k]], q = Object.assign({}, p);
    let spike = false, danger = 0;
    for (let t = 0; t < HOLD; t++) {
      stepPlayer(q, inputAt(mv, t, inp), m, ab);
      if (touchesSpikes(q, m) || q.y > m.h + 40) { spike = true; break; }
      if (t === 3 || t === HOLD - 1) {
        const body = bodyOf(q, 7);
        for (const f of foes) if (hit4(body, f)) danger = 1;
        for (const g of globs) { const gx = g.x + g.vx * DT * (t + 1), gy = g.y + g.vy * DT * (t + 1); if (gx > body[0] - 6 && gx < body[2] + 6 && gy > body[1] - 6 && gy < body[3] + 6) danger = 1; }
      }
    }
    if (spike) { if (intoSpikes) return list[k]; continue; }
    const at = route.lookup(q);
    let cost = at ? at[field] : FAR;
    if (cost >= FAR) cost = 5000;                 // off the map of known spots: only if nothing else
    cost += danger * 60;
    cost += b.rand() * (0.01 + (1 - b.skill) * 2.5);                       // a weaker player misjudges
    cands.push({ mi: list[k], cost, q });
  }
  cands.sort((x, y) => x.cost - y.cost);
  if (intoSpikes || !cands.length) return cands.length ? cands[0].mi : -1;
  // a careful player looks further: is there still a way on after this move? (a weaker one looks less far)
  const far = Math.round(3 + b.skill * 9);
  const here = route.lookup(p), now = here && here[field] < FAR ? here[field] : 5000;
  if (cands[0].cost < now) for (const c of cands.slice(0, 5)) if (c.cost < now + 1 && holdsUp(c.q, route, field, m, ab, far)) return c.mi;
  // no single move gets closer from exactly here: think further ahead (best spots first) for a
  // run of moves that does, and commit to it
  const open = [{ q: Object.assign({}, p), c: now, path: [] }], seen = new Set();
  const rank = (o) => o.c + o.path.length * 0.6;   // nearest the exit first, but a short way round (a run-up, say) soon gets its turn
  for (let done = 0; done < 3000 && open.length; done++) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (rank(open[i]) < rank(open[bi])) bi = i;
    const node = open.splice(bi, 1)[0];
    const n2 = movesFor(node.q, ab, list2);
    const mine = Array.from(list2.subarray(0, n2));
    for (const mi of mine) {
      const r = Object.assign({}, node.q);
      if (!tryMove(r, MV[mi], m, ab)) continue;
      const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.vx / 20)},${Math.round(r.vy / 30)},${r.ground ? 1 : 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = route.lookup(r), c = at && at[field] < FAR ? at[field] : 5000;
      const path = [...node.path, mi];
      if (c < now - 1 && holdsUp(r, route, field, m, ab, 4)) return path;
      if (path.length < 24) open.push({ q: r, c, path });
    }
  }
  // nothing found: shuffle somewhere else nearby that is safe, and think again from there
  const safe = cands.filter((c) => MV[c.mi][0] !== 0 && holdsUp(c.q, route, field, m, ab, 3));
  if (safe.length) return safe[Math.floor(b.rand() * safe.length)].mi;
  return cands[0].mi;
}

/** Hold the keys for tick t of move mi. */
function press(g, s, mi, t, extra = []) {
  const mv = MV[mi], i = inputAt(mv, t, inp);
  const keys = [...extra];
  if (i.dir < 0) keys.push('left'); else if (i.dir > 0) keys.push('right');
  s.hold(keys);
  g.zHeld = i.jumpHeld;
  if (i.jumpPress) g.press.jump = true;
  if (i.dashPress) g.press.dash = true;
}

/** Blade and blaster: anything in reach or lined up. Returns extra keys to hold (aim). */
function fight(g, sim, b) {
  const p = sim.p;
  if (p.atk || b.rand() < (1 - b.skill) * 0.5) return [];
  const targets = sim.foes.filter((f) => !f.dead).map(foeBox);
  for (const gl of sim.globs) if (!gl.dead) targets.push([gl.x - 5, gl.y - 5, gl.x + 5, gl.y + 5]);
  if (p.atkCD <= 0.02) {
    const side = slashBox(p, 'side', p.face, sim.lo.reach), up = slashBox(p, 'up', p.face, sim.lo.reach);
    for (const t of targets) {
      if (hit4(side, t)) { g.press.slash = true; return []; }
      if (hit4(up, t)) { g.press.slash = true; return ['up']; }
    }
  }
  if (p.energy >= 1 && p.shotCD <= 0 && p.ground) {
    const y = p.y - 18;
    for (const f of sim.foes) {
      if (f.dead) continue;
      const fb = foeBox(f), dx = (fb[0] + fb[2]) / 2 - p.x;
      if (Math.sign(dx) === p.face && Math.abs(dx) < 300 && Math.abs(dx) > 30 && y > fb[1] - 2 && y < fb[3] + 2 && lineOfSight(sim.m, p.x, y, (fb[0] + fb[2]) / 2, y)) { g.press.shoot = true; break; }
    }
  }
  return [];
}

// ── The lair ─────────────────────────────────────────────────
const grown = (q, n) => [q[0] - n, q[1] - n, q[2] + n, q[3] + n];
/** Everything that would hurt in the lair, with how fast it is moving: [{ b, vx, vy, from, to }] (from/to: seconds from now it is live). */
function threats(sim, mem) {
  const out = [], g = sim.boss, a = sim.m.arena;
  const parts = guardianParts(g), prev = mem.parts || [];
  parts.forEach((part, i) => {
    const o = prev[i], vx = o ? (part.b[0] - o[0]) / DT : 0, vy = o ? (part.b[1] - o[1]) / DT : 0;
    if (part.harm) out.push({ b: part.b, vx: Math.abs(vx) < 900 ? vx : 0, vy: Math.abs(vy) < 900 ? vy : 0, from: 0, to: 9 });
  });
  mem.parts = parts.map((q) => q.b.slice());
  for (const sh of sim.bossShots) {
    if (sh.kind === 'warn') {                     // lightning is about to fall down this column
      const left = sh.life - sh.t;
      out.push({ b: [sh.x - 12, a.ceilY, sh.x + 12, a.floorY], vx: 0, vy: 0, from: left - 0.02, to: left + 0.36 });
      continue;
    }
    const q = shotBox(sh);
    if (!q) continue;
    out.push({ b: q, vx: sh.vx || 0, vy: sh.vy || 0, grav: sh.grav || 0, from: 0, to: sh.life - sh.t });
  }
  for (const f of sim.foes) if (!f.dead) out.push({ b: foeBox(f), vx: f.vx || 0, vy: 0, from: 0, to: 9 });
  return out;
}
const hitsAt = (body, th, t) => {
  for (const h of th) {
    if (t < h.from || t > h.to) continue;
    const dx = h.vx * t, dy = h.vy * t + (h.grav ? 0.5 * h.grav * t * t : 0);
    if (body[0] < h.b[2] + dx && body[2] > h.b[0] + dx && body[1] < h.b[3] + dy && body[3] > h.b[1] + dy) return true;
  }
  return false;
};
const AHEAD = 30;                                 // ticks pictured (a quarter of a second)
function arenaChoose(sim, b, mem) {
  const p = sim.p, m = sim.m, ab = sim.ab, a = m.arena, g = sim.boss;
  const th = threats(sim, mem);
  const weak = guardianParts(g).find((q) => q.weak && q.solid);
  const n = movesFor(p, ab, list);
  const margin = 3 + (1 - b.skill) * -2;
  let best = -1, bs = -1e18;
  // where to be: beside a guardian on the ground, level with one in the air
  let tx = (a.x0 + a.x1) / 2, ty = a.floorY;
  if (weak) {
    const cx = (weak.b[0] + weak.b[2]) / 2, low = weak.b[3] > a.floorY - 44;
    const side = p.x < cx ? -1 : 1;
    tx = Math.max(a.x0 + 14, Math.min(a.x1 - 14, side < 0 ? weak.b[0] - 20 : weak.b[2] + 20));
    ty = low ? a.floorY : Math.min(a.floorY, weak.b[3] + 12);
  }
  for (let k = 0; k < n; k++) {
    const mi = list[k], mv = MV[mi], q = Object.assign({}, p);
    const cont = [mv[0], mv[1] === 1 || mv[1] === 2 ? 2 : 0, 0];
    let hitAt = -1, reach = false;
    for (let t = 0; t < AHEAD; t++) {
      stepPlayer(q, t < HOLD ? inputAt(mv, t, inp) : inputAt(cont, 1, inp), m, ab);
      if (t % 2) continue;
      const time = (t + 1) * DT;
      const body = [q.x - PW / 2 + 2 - margin, q.y - PH + 3 - margin, q.x + PW / 2 - 2 + margin, q.y - 1 + margin];
      if (hitAt < 0 && hitsAt(body, th, time)) { hitAt = t; break; }
      if (weak && !reach && t < 16) {
        const wb = weak.b;
        if (hit4(slashBox(q, 'side', q.face, sim.lo.reach), wb) || hit4(slashBox(q, 'up', q.face, sim.lo.reach), wb) || (!q.ground && hit4(slashBox(q, 'down', q.face, sim.lo.reach), wb))) reach = true;
      }
    }
    let score = hitAt >= 0 ? -100000 + hitAt * 100 : 0;
    score -= Math.hypot(q.x - tx, (q.y - ty) * 0.6) * (p.inv > 0.3 ? 0.3 : 1);
    if (reach) score += 60;
    score += b.rand() * (0.5 + (1 - b.skill) * 60);
    if (score > bs) { bs = score; best = mi; }
  }
  mem.safeNow = bs > -50000;
  return best;
}
/** Strike the guardian's weak point (and its minions) whenever the blade reaches. */
function strike(g, sim, b) {
  const p = sim.p;
  if (p.atk || p.atkCD > 0.02 || b.rand() < (1 - b.skill) * 0.4) return [];
  const targets = guardianParts(sim.boss).filter((q) => q.weak && q.solid).map((q) => q.b);
  for (const f of sim.foes) if (!f.dead) targets.push(foeBox(f));
  const r = sim.lo.reach, side = slashBox(p, 'side', p.face, r), up = slashBox(p, 'up', p.face, r), down = slashBox(p, 'down', p.face, r);
  for (const t of targets) {
    if (!p.ground && hit4(down, t)) { g.press.slash = true; return ['down']; }
    if (hit4(side, t)) { g.press.slash = true; return []; }
    if (hit4(up, t)) { g.press.slash = true; return ['up']; }
  }
  return [];
}
function lairBot(g, s, b) {
  const sim = g.sim, p = sim.p, m = b.mem, boss = sim.boss;
  if (sim.done || p.dead || p.hazard > 0) { m.mi = -1; g.zHeld = false; return s.hold([]); }
  if (sim.stop > 0) return;
  if (sim.fight !== 'on' || boss.dead) {
    // before the fight and after it: walk the lair like any planet (in through the gate; out by the exit)
    if (sim.fight === 'won' && sim.exitWait > 0) { g.zHeld = false; return s.hold([]); }
    const route = routeFor(sim);
    const tick = m.mi >= 0 ? Math.round((sim.t - m.t0) / DT) : HOLD;
    if (tick >= HOLD || m.mi < 0) { const c = choose(sim, route, 'toExit', b, { daring: true }); m.mi = Array.isArray(c) ? c[0] : c; m.t0 = sim.t; }
    if (m.mi < 0) { g.zHeld = false; return s.hold([]); }
    return press(g, s, m.mi, Math.min(HOLD - 1, Math.round((sim.t - m.t0) / DT)));
  }
  // heal when nothing can reach for a second: blade hits earn the energy for it
  const th = threats(sim, { parts: m.parts });
  const body = grown(bodyOf(p), 26);
  let calm = p.ground && p.pips < sim.lo.pips && p.energy >= FOCUS_COST && b.skill > 0.3 && boss.state !== 'dying';
  if (calm) for (const t of [0.1, 0.3, 0.5, 0.7, 0.9, 1.1]) if (hitsAt(body, th, t)) { calm = false; break; }
  if (calm) { m.mi = -1; g.zHeld = false; return s.hold(Math.abs(p.vx) < 15 ? ['down'] : []); }
  const tick = m.mi >= 0 ? Math.round((sim.t - m.t0) / DT) : HOLD;
  if (tick >= 4 || m.mi < 0) { m.mi = arenaChoose(sim, b, m); m.t0 = sim.t; } else threats(sim, m);   // re-think twice per move; keep the speeds fresh
  if (m.mi < 0) { g.zHeld = false; return s.hold([]); }
  const aim = boss.state === 'dying' ? [] : strike(g, sim, b);
  press(g, s, m.mi, Math.min(HOLD - 1, Math.round((sim.t - m.t0) / DT)), aim);
}

export default {
  levels: 20,
  limit: (level) => (level % 5 === 0 ? 900 : 300),
  stuck: 90,

  // closest it has been to the exit (in moves), plus aliens beaten
  progress(g) {
    const sim = g.sim;
    if (sim.kind !== 'explore') return sim.kills + (sim.boss ? sim.boss.max - sim.boss.hp : 0) + sim.dustGot;
    const at = routeFor(sim).lookup(sim.p);
    g._botBest = Math.min(g._botBest ?? 1e9, at && at.toExit < FAR ? at.toExit : 1e9);
    if (g._botLevel !== g.level) { g._botLevel = g.level; g._botBest = 1e9; }
    return sim.kills * 1000 - (g._botBest === 1e9 ? 0 : g._botBest);
  },

  invariants(g) {
    const sim = g.sim, p = sim.p, m = sim.m;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) return 'the astronaut position or speed is not a number';
    if (p.x < 0 || p.x > m.w || p.y < 0 || p.y > m.h + 80) return `the astronaut is outside the planet at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;
    if (p.pips < 0 || p.pips > sim.lo.pips) return `armour plates ${p.pips} of ${sim.lo.pips}`;
    if (p.energy < 0 || p.energy > sim.lo.energy) return `energy ${p.energy} of ${sim.lo.energy}`;
    for (const f of sim.foes) {
      if (f.dead) continue;
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) return `a ${f.kind} has a position that is not a number`;
      if (f.x < -TILE || f.x > m.w + TILE || f.y < -TILE || f.y > m.h + TILE * 2) return `a ${f.kind} left the planet at (${f.x.toFixed(0)}, ${f.y.toFixed(0)})`;
    }
    return null;
  },

  bot(g, s, b) {
    const sim = g.sim, p = sim.p, m = b.mem;
    if (g.shop) { g.shop = null; return; }                    // never shops: plays every planet with the starting suit
    if (sim.kind === 'arena') return lairBot(g, s, b);
    if (sim.kind !== 'explore') return s.hold([]);            // the treasure vault is a bonus round: not judged
    if (sim.done || p.dead || p.hazard > 0 || p.kbT > 0) { m.mi = -1; m.plan = null; g.zHeld = false; return s.hold([]); }
    if (sim.stop > 0) return;                                 // hit-stop: the keys stay as they are
    const route = routeFor(sim);
    // heal when it is quiet: stand still and hold ↓ (three energy cells mend one armour plate)
    const quiet = !sim.foes.some((f) => !f.dead && Math.abs(f.x - p.x) < 170 && Math.abs(f.y - p.y) < 110) && !sim.globs.length;
    if (p.ground && quiet && p.pips < sim.lo.pips && p.energy >= FOCUS_COST && !sim.atBeacon() && b.skill > 0.3) {
      m.mi = -1; g.zHeld = false;
      return s.hold(Math.abs(p.vx) < 15 ? ['down'] : []);
    }
    const tick = m.mi >= 0 ? Math.round((sim.t - m.t0) / DT) : HOLD;
    if (tick >= HOLD || m.mi < 0) {
      // stuck behind an alien for a while: go through it, blade first
      const at = route.lookup(p), d = at ? at.toExit : FAR;
      if (d < (m.best ?? FAR) || d > (m.best ?? FAR) + 15) { m.best = d; m.bestT = sim.t; }   // (knocked a long way back: start counting again)
      const daring = sim.t - (m.bestT ?? sim.t) > 2.5;
      if (m.plan?.length) m.mi = m.plan.shift();
      else { const c = choose(sim, route, 'toExit', b, { daring }); if (Array.isArray(c)) { m.plan = c; m.mi = m.plan.shift(); } else m.mi = c; }
      m.t0 = sim.t;
      if (m.mi < 0) { g.zHeld = false; return s.hold([]); }
      if (b.skill < 1 && b.rand() < (1 - b.skill) * 0.12) m.late = Math.ceil((1 - b.skill) * 10 * b.rand());   // a slow reaction
    }
    if (m.late > 0) { m.late--; m.t0 = sim.t; g.zHeld = false; return s.hold([]); }
    const aim = fight(g, sim, b);
    press(g, s, m.mi, Math.min(HOLD - 1, Math.round((sim.t - m.t0) / DT)), aim);
  },

  // onto the spikes, again and again, until a life is lost
  mistake(g, s, b) {
    const sim = g.sim, p = sim.p, m = b.mem;
    m.lives0 ??= s.livesLost;
    if (s.livesLost > m.lives0) { m.mi = -1; m.plan = null; m.best = FAR; g.zHeld = false; s.hold([]); return true; }
    if (sim.kind === 'arena') {                               // walk in and into the guardian, blade away
      if (sim.done || p.dead || p.hazard > 0 || sim.stop > 0) return false;
      if (sim.fight !== 'on') { lairBot(g, s, b); return false; }
      const part = guardianParts(sim.boss)[0];
      g.zHeld = false;
      s.hold(part ? [(part.b[0] + part.b[2]) / 2 < p.x ? 'left' : 'right'] : []);
      return false;
    }
    if (sim.kind !== 'explore') return true;
    if (g.shop) { g.shop = null; return false; }
    if (sim.done || p.dead || p.hazard > 0) { m.mi = -1; g.zHeld = false; s.hold([]); return false; }
    if (sim.stop > 0) return false;
    const route = routeFor(sim);
    const tick = m.mi >= 0 ? Math.round((sim.t - m.t0) / DT) : HOLD;
    if (tick >= HOLD || m.mi < 0) { const c = choose(sim, route, 'toSpike', b, { daring: true, intoSpikes: true }); m.mi = Array.isArray(c) ? c[0] : c; m.t0 = sim.t; }
    if (m.mi < 0) { s.hold([]); return false; }
    press(g, s, m.mi, Math.min(HOLD - 1, Math.round((sim.t - m.t0) / DT)));
    return false;
  },
};

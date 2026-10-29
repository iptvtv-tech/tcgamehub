// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — the guardians (pure rules, like world.js). Every 5th planet is a guardian's
//  lair: an antechamber with a rest beacon, a gate, and an arena. Cross into the arena and the gate
//  slams shut; beat the guardian and the exit beacon lights up.
//
//    Mite Matriarch  (planets 5, 20, 35…)  ground brawler: charges into the walls, leap-slams
//                    shockwaves along the floor, and calls Dust Mites down from the ceiling.
//    Storm Jelly     (planets 10, 25, 40…) air caster: rings of orbs, a dive that leaves it stuck on
//                    the floor, and lightning columns marked a moment before they strike.
//    Magma Wyrm      (planets 15, 30, 45…) burrower: swims under the floor (watch the glowing wake),
//                    erupts, arcs across the arena and spits magma. Only its head takes damage.
//
//  Every attack is telegraphed. Below half health a guardian enters its second phase (faster,
//  more of everything). Each pass of the cycle (tier) adds health and pace. Pattern choices come
//  from the guardian's own seeded stream, so the Daily guardian fights the same way for everyone.
//  Lose a life and the guardian heals and waits for you again (Hollow Knight-style).
// ─────────────────────────────────────────────────────────────
import { moveBody, TILE, DT, PW, PH, GRAV, MAX_FALL, FOES } from './world.js';

export const GUARDIANS = {
  matriarch: { name: 'Mite Matriarch', sub: 'Mother of the Dust Mites', hp: 34, theme: 'dust', pts: 1000 },
  jelly:     { name: 'Storm Jelly', sub: 'It drifts where the lightning falls', hp: 40, theme: 'ice', pts: 1000 },
  wyrm:      { name: 'Magma Wyrm', sub: 'It swims through solid rock', hp: 38, theme: 'ember', pts: 1000 },
};
export const GUARDIAN_ORDER = ['matriarch', 'jelly', 'wyrm'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A guardian for this lair. tier: how many times round the three it is (0, 1, 2…). */
export function makeGuardian(kind, m, tier) {
  const G = GUARDIANS[kind], a = m.arena;
  const g = {
    kind, tier, max: G.hp + 8 * tier, hp: G.hp + 8 * tier,
    sp: Math.min(1.45, 1 + 0.1 * tier), tk: Math.max(0.72, 1 - 0.07 * tier),     // pace, telegraph length
    home: { x: a.gx, y: a.gy }, x: a.gx, y: a.gy, vx: 0, vy: 0, face: -1, ground: true,
    state: 'sleep', t: 0, dur: 0, phase2: false, hurtT: 0, dead: false, last: '', repeat: 0, n: 0,
    trail: [], tx: 0, ty: 0, cols: [], shake: 0,
  };
  return g;
}

/** Back to the start of the fight: full health, asleep at home. */
export function resetGuardian(g) {
  g.hp = g.max; g.x = g.home.x; g.y = g.home.y; g.vx = 0; g.vy = 0; g.state = 'sleep'; g.t = 0; g.dur = 0;
  g.phase2 = false; g.hurtT = 0; g.dead = false; g.last = ''; g.repeat = 0; g.trail = []; g.cols = []; g.face = -1;
  g.n = 0; g.tx = 0; g.ty = 0; g.shake = 0;          // a shake left over from a slam would jitter it while it sleeps
}

/** Wake it up: the fight starts. */
export function wakeGuardian(g) { go(g, 'wake', 1.3); }

function go(g, state, dur = 0) { g.state = state; g.t = 0; g.dur = dur; }
/** Pick the next attack from weighted options, never the same one three times running. */
function choose(sim, g, opts) {
  const ok = opts.filter(([name, w]) => w > 0 && !(name === g.last && g.repeat >= 2));
  const total = ok.reduce((s, [, w]) => s + w, 0);
  let r = sim.brng.next() * total, pick = ok[ok.length - 1][0];
  for (const [name, w] of ok) { if ((r -= w) < 0) { pick = name; break; } }
  g.repeat = pick === g.last ? g.repeat + 1 : 1; g.last = pick;
  return pick;
}

/** Hit for dmg. Returns 'hit', 'kill' or null (immune while it wakes or dies). */
export function damageGuardian(sim, g, dmg) {
  if (g.state === 'sleep' || g.state === 'wake' || g.state === 'dying' || g.dead) return null;
  g.hp -= dmg; g.hurtT = 0.12;
  if (!g.phase2 && g.hp <= g.max / 2) { g.phase2 = true; sim.ev.push({ type: 'phase2', x: g.x, y: g.y }); }
  if (g.hp <= 1e-6) { g.hp = 0; go(g, 'dying', 1.6); g.vx = 0; return 'kill'; }
  return 'hit';
}

// ── What can be hit, and what hurts ─────────────────────────
// part: { b: [x0, y0, x1, y1], weak (takes damage), harm (hurts on contact), solid (the blade clinks / pogo) }
export function guardianParts(g) {
  if (g.dead || g.state === 'sleep') return [];
  if (g.kind === 'matriarch') {
    const rear = g.state === 'charge-tele' || g.state === 'brood-tele' ? 8 : 0;
    return [{ b: [g.x - 30, g.y - 32 - rear, g.x + 30, g.y], weak: true, harm: g.state !== 'dying', solid: true }];
  }
  if (g.kind === 'jelly') {
    const harm = g.state !== 'dying' && g.state !== 'wake';
    return [
      { b: [g.x - 25, g.y - 19, g.x + 25, g.y + 13], weak: true, harm, solid: true },
      { b: [g.x - 13, g.y + 13, g.x + 13, g.y + 38], weak: false, harm: harm && g.state !== 'stuck', solid: false },
    ];
  }
  // the wyrm: its head (weak) and every body segment above the floor (armoured)
  const out = [], fy = g.floorY;
  const seg = wyrmSegments(g);
  seg.forEach((s, i) => {
    if (s.y - s.r > fy - 2) return;                       // under the floor
    const harm = g.state !== 'dying';
    out.push({ b: [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r], weak: i === 0, harm, solid: true });
  });
  return out;
}

/** The wyrm's body: the head, then segments spaced along the path the head took. */
export function wyrmSegments(g) {
  const out = [{ x: g.x, y: g.y, r: 13 }], tr = g.trail;
  let need = 15, acc = 0, px = g.x, py = g.y, k = tr.length - 1;
  for (let i = 1; i <= 10; i++) {
    const r = 11 - i * 0.5;
    while (k >= 0) {
      const d = Math.hypot(tr[k][0] - px, tr[k][1] - py);
      if (acc + d >= need) { const f = (need - acc) / d; px += (tr[k][0] - px) * f; py += (tr[k][1] - py) * f; acc = 0; break; }
      acc += d; px = tr[k][0]; py = tr[k][1]; k--;
    }
    if (k < 0) break;
    out.push({ x: px, y: py, r });
    need = 15 - i * 0.35;
  }
  return out;
}

// ── One 1/120 s step ─────────────────────────────────────────
export function stepGuardian(sim, g) {
  g.t += DT;
  if (g.hurtT > 0) g.hurtT -= DT;
  if (g.shake > 0) g.shake -= DT;
  if (g.dead) return;
  if (g.state === 'dying') {
    if (g.kind === 'jelly') { g.vy = Math.min(g.vy + 300 * DT, 120); g.y = Math.min(g.y + g.vy * DT, sim.m.arena.floorY - 16); }
    if (g.kind === 'wyrm') stepWyrmBody(g);
    if (g.t > 0.25 && Math.floor(g.t * 7) !== Math.floor((g.t - DT) * 7)) sim.ev.push({ type: 'boss-pop', x: g.x + (sim.brng.next() - 0.5) * 50, y: g.y - 20 + (sim.brng.next() - 0.5) * 30 });
    if (g.t >= g.dur) { g.dead = true; sim.ev.push({ type: 'boss-dead', x: g.x, y: g.kind === 'jelly' ? g.y : g.kind === 'wyrm' ? Math.min(g.y, g.floorY - 30) : g.y - 16 }); }
    return;
  }
  if (g.state === 'sleep') { if (g.kind === 'wyrm') { g.floorY = sim.m.arena.floorY; g.y = g.floorY + 60; } return; }
  if (g.kind === 'matriarch') stepMatriarch(sim, g);
  else if (g.kind === 'jelly') stepJelly(sim, g);
  else stepWyrm(sim, g);
}

// ── Mite Matriarch ───────────────────────────────────────────
const MAT_W = 30;
function stepMatriarch(sim, g) {
  const a = sim.m.arena, p = sim.p, ph2 = g.phase2, sp = g.sp * (ph2 ? 1.15 : 1);
  const toward = Math.sign(p.x - g.x) || g.face;
  const body = () => {                                    // gravity + walls
    g.vy = Math.min(MAX_FALL, g.vy + GRAV * DT);
    return moveBody(g, MAT_W, 32, sim.m, DT, false);
  };
  switch (g.state) {
    case 'wake':
      g.face = toward; body();
      if (g.t > 0.35 && g.t - DT <= 0.35) sim.ev.push({ type: 'roar', kind: g.kind, x: g.x, y: g.y - 20 });
      if (g.t >= g.dur) go(g, 'idle', 0.6);
      break;
    case 'idle': {
      g.face = toward;
      g.vx = Math.abs(p.x - g.x) > 70 ? toward * 38 * sp : 0;
      body();
      if (g.t >= g.dur / sp) {
        const mites = sim.foes.filter((f) => f.minion && !f.dead).length;
        const pick = choose(sim, g, [['charge', 40], ['leap', 36], ['brood', mites < 2 && g.last !== 'brood' ? 24 : 0]]);
        go(g, pick + '-tele', (pick === 'charge' ? 0.62 : pick === 'leap' ? 0.46 : 0.7) * g.tk);
        g.vx = 0;
        sim.ev.push({ type: 'boss-tele', kind: g.kind, move: pick, x: g.x, y: g.y });
      }
      break;
    }
    case 'charge-tele':
      g.face = toward; g.vx = 0; body();
      if (g.t >= g.dur) { go(g, 'charge'); g.vx = g.face * 300 * sp; sim.ev.push({ type: 'boss-charge', x: g.x, y: g.y }); }
      break;
    case 'charge': {
      g.vx = g.face * 300 * sp;
      const r = body();
      if (r.wall || g.x - MAT_W <= a.x0 + 1 || g.x + MAT_W >= a.x1 - 1) {
        go(g, 'stun', ph2 ? 0.55 : 0.8); g.vx = 0; g.shake = 0.3;
        sim.ev.push({ type: 'boss-slam', x: g.x + g.face * MAT_W, y: g.y - 16, big: true });
      }
      break;
    }
    case 'stun':
      g.vx = 0; body();
      if (g.t >= g.dur) go(g, 'idle', 0.5);
      break;
    case 'leap-tele':
      g.face = toward; g.vx = 0; body();
      if (g.t >= g.dur) {
        const target = clamp(p.x, a.x0 + MAT_W + 4, a.x1 - MAT_W - 4), T = 2 * 610 / GRAV;
        g.vy = -610; g.vx = (target - g.x) / T; g.ground = false;
        go(g, 'leap'); sim.ev.push({ type: 'boss-leap', x: g.x, y: g.y });
      }
      break;
    case 'leap': {
      const r = body();
      if (r.wall) g.vx = 0;
      if (r.ground && g.t > 0.1) {
        g.vx = 0; go(g, 'slam', 0.5); g.shake = 0.35;
        const v = 230 * sp;
        for (const d of [-1, 1]) sim.bossShots.push({ kind: 'wave', x: g.x + d * (MAT_W - 4), y: g.y, vx: d * v, vy: 0, w: 7, h: 15, t: 0, life: 4, dead: false });
        sim.ev.push({ type: 'boss-slam', x: g.x, y: g.y, big: true });
      }
      break;
    }
    case 'slam':
      body();
      if (g.t >= g.dur) {
        if (ph2 && sim.brng.next() < 0.4 && g.last === 'leap' && g.repeat < 2) { g.repeat++; go(g, 'leap-tele', 0.36 * g.tk); sim.ev.push({ type: 'boss-tele', kind: g.kind, move: 'leap', x: g.x, y: g.y }); }
        else go(g, 'idle', 0.55);
      }
      break;
    case 'brood-tele':
      g.vx = 0; body();
      if (g.t >= g.dur) {
        const n = ph2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          let x = 0;
          for (let k = 0; k < 6; k++) { x = a.x0 + 30 + sim.brng.next() * (a.x1 - a.x0 - 60); if (Math.abs(x - p.x) > 70) break; }
          sim.addMinion('crawler', x, a.ceilY + 18, sim.brng.next() < 0.5 ? -1 : 1);
        }
        sim.ev.push({ type: 'boss-brood', x: g.x, y: g.y });
        go(g, 'idle', 0.7);
      }
      break;
  }
  g.x = clamp(g.x, a.x0 + MAT_W, a.x1 - MAT_W);
}

// ── Storm Jelly ──────────────────────────────────────────────
function stepJelly(sim, g) {
  const a = sim.m.arena, p = sim.p, ph2 = g.phase2, sp = g.sp * (ph2 ? 1.12 : 1);
  const cx = (a.x0 + a.x1) / 2, hoverY = a.ceilY + (a.floorY - a.ceilY) * 0.36;
  const steer = (tx, ty, k, max) => {
    g.vx += (tx - g.x) * k * DT - g.vx * 2.4 * DT; g.vy += (ty - g.y) * k * DT - g.vy * 2.4 * DT;
    const v = Math.hypot(g.vx, g.vy); if (v > max) { g.vx *= max / v; g.vy *= max / v; }
    g.x += g.vx * DT; g.y += g.vy * DT;
  };
  const bound = () => { g.x = clamp(g.x, a.x0 + 30, a.x1 - 30); g.y = clamp(g.y, a.ceilY + 24, a.floorY - 14); };
  switch (g.state) {
    case 'wake':
      steer(cx, hoverY, 6, 120); bound();
      if (g.t > 0.4 && g.t - DT <= 0.4) sim.ev.push({ type: 'roar', kind: g.kind, x: g.x, y: g.y });
      if (g.t >= g.dur) go(g, 'drift', 1.4);
      break;
    case 'drift': {
      g.n += DT;
      const w = 0.9 * sp, tx = cx + Math.sin(g.n * w) * (a.x1 - a.x0) * 0.32, ty = hoverY + Math.sin(g.n * w * 2) * 34;
      steer(tx, ty, 7, 110 * sp); bound();
      g.face = Math.sign(p.x - g.x) || g.face;
      if (g.t >= g.dur / sp) {
        const pick = choose(sim, g, [['ring', 38], ['dive', 32], ['storm', 30]]);
        go(g, pick + '-tele', (pick === 'ring' ? 0.78 : pick === 'dive' ? 1.15 : 0.2) * g.tk);
        sim.ev.push({ type: 'boss-tele', kind: g.kind, move: pick, x: g.x, y: g.y });
        if (pick === 'storm') {                           // mark the columns where the lightning will fall
          const k = ph2 ? 5 : 3, cols = [clamp(p.x, a.x0 + 14, a.x1 - 14)];
          for (let tries = 0; cols.length < k && tries < 60; tries++) {
            const x = a.x0 + 14 + sim.brng.next() * (a.x1 - a.x0 - 28);
            if (cols.every((c) => Math.abs(c - x) > 46)) cols.push(x);
          }
          g.cols = cols.map((x) => ({ x, t: 0 }));
          for (const c of g.cols) sim.bossShots.push({ kind: 'warn', x: c.x, y: a.floorY, w: 10, h: a.floorY - a.ceilY, t: 0, life: 0.95 * g.tk, dead: false, harmless: true });
        }
      }
      break;
    }
    case 'ring-tele':
      steer(g.x, g.y, 4, 40); bound();
      if (g.t >= g.dur) { fireRing(sim, g, ph2 ? 14 : 10, sim.brng.next() * Math.PI); go(g, ph2 ? 'ring2' : 'drift', ph2 ? 0.6 : 1.8); }
      break;
    case 'ring2':
      steer(g.x, g.y, 4, 40); bound();
      if (g.t >= g.dur) { fireRing(sim, g, 14, sim.brng.next() * Math.PI); go(g, 'drift', 1.8); }
      break;
    case 'dive-tele': {                                   // float up over the astronaut, shiver, then drop
      const rise = g.t < 0.7 / sp;
      steer(rise ? clamp(p.x, a.x0 + 30, a.x1 - 30) : g.x, a.ceilY + 34, rise ? 9 : 3, 200 * sp); bound();
      if (!rise && g.t - DT < 0.7 / sp) g.shake = g.dur - g.t;
      if (g.t >= g.dur) { go(g, 'dive'); g.vx = 0; g.vy = 560 * Math.sqrt(sp); sim.ev.push({ type: 'boss-charge', x: g.x, y: g.y }); }
      break;
    }
    case 'dive':
      g.y += g.vy * DT;
      if (g.y + 13 >= a.floorY) {
        g.y = a.floorY - 13; g.vy = 0; go(g, 'stuck', ph2 ? 0.85 : 1.15); g.shake = 0.3;
        sim.ev.push({ type: 'boss-slam', x: g.x, y: a.floorY, big: true });
        if (ph2) for (const d of [-1, 1]) sim.bossShots.push({ kind: 'wave', x: g.x + d * 22, y: a.floorY, vx: d * 210 * sp, vy: 0, w: 7, h: 13, t: 0, life: 4, dead: false });
      }
      break;
    case 'stuck':
      if (g.t >= g.dur) go(g, 'rise', 0.9);
      break;
    case 'rise':
      steer(g.x, hoverY, 5, 130); bound();
      if (g.t >= g.dur) go(g, 'drift', 1.0);
      break;
    case 'storm-tele':
      steer(g.x, hoverY - 20, 4, 60); bound();
      if (g.t >= 0.95 * g.tk) {
        for (const c of g.cols) sim.bossShots.push({ kind: 'zap', x: c.x, y: a.floorY, w: 11, h: a.floorY - a.ceilY, t: 0, life: 0.32, dead: false });
        sim.ev.push({ type: 'boss-zap', x: g.x, y: g.y });
        go(g, 'drift', 1.6);
      }
      break;
  }
}
function fireRing(sim, g, n, off) {
  const v = 105 * g.sp * (g.phase2 ? 1.1 : 1);
  for (let i = 0; i < n; i++) {
    const ang = off + (i / n) * Math.PI * 2;
    sim.bossShots.push({ kind: 'orb', x: g.x, y: g.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: 5, t: 0, life: 6, dead: false });
  }
  sim.ev.push({ type: 'boss-ring', x: g.x, y: g.y });
}

// ── Magma Wyrm ───────────────────────────────────────────────
function stepWyrmBody(g) {
  const tr = g.trail, last = tr[tr.length - 1];
  if (!last || Math.hypot(last[0] - g.x, last[1] - g.y) > 2) tr.push([g.x, g.y]);
  if (tr.length > 160) tr.splice(0, tr.length - 160);
}
function stepWyrm(sim, g) {
  const a = sim.m.arena, p = sim.p, ph2 = g.phase2, sp = g.sp * (ph2 ? 1.15 : 1), fy = a.floorY;
  g.floorY = fy;
  const under = fy + 46;
  const launch = (vx, vy, grav) => { g.vx = vx; g.vy = vy; g.grav = grav; };
  const fly = () => { g.vy += g.grav * DT; g.x += g.vx * DT; g.y += g.vy * DT; };
  switch (g.state) {
    case 'wake':                                          // bursts out in the middle and roars
      if (g.t === DT) { g.x = (a.x0 + a.x1) / 2; g.y = fy + 30; g.trail = []; launch(0, -650, 1050); }
      fly();
      if (g.t > 0.5 && g.t - DT <= 0.5) sim.ev.push({ type: 'roar', kind: g.kind, x: g.x, y: g.y });
      if (g.y > under && g.vy > 0) { g.y = under; go(g, 'under', 1.0); }
      break;
    case 'under': {                                       // a glowing wake under the floor, homing on the astronaut
      g.y = under;
      const dx = p.x - g.x;
      g.vx = Math.abs(dx) > 6 ? Math.sign(dx) * 150 * sp : 0;
      g.x = clamp(g.x + g.vx * DT, a.x0 + 26, a.x1 - 26);
      if (g.t >= g.dur / sp) {
        const pick = choose(sim, g, [['erupt', 55], ['arc', ph2 ? 26 : 22], ['spit', ph2 ? 25 : 18]]);
        if (pick === 'arc') g.tx = Math.abs(p.x - (a.x0 + 34)) > Math.abs(p.x - (a.x1 - 34)) ? a.x0 + 34 : a.x1 - 34;   // the far end
        if (pick === 'spit') g.tx = p.x < (a.x0 + a.x1) / 2 ? a.x1 - 40 : a.x0 + 40;
        go(g, pick + '-move', 0); g.n = pick === 'erupt' ? 0 : 1;
      }
      break;
    }
    case 'erupt-move': go(g, 'erupt-tele', 0.58 * g.tk); sim.ev.push({ type: 'boss-tele', kind: g.kind, move: 'erupt', x: g.x, y: fy }); break;
    case 'arc-move': case 'spit-move': {                  // slide under the floor to where it'll come up
      const move = g.state.slice(0, -5), d = g.tx - g.x;
      g.x += clamp(d, -330 * DT, 330 * DT);
      if (Math.abs(d) < 3) { go(g, move + '-tele', (move === 'arc' ? 0.6 : 0.55) * g.tk); sim.ev.push({ type: 'boss-tele', kind: g.kind, move, x: g.x, y: fy }); }
      break;
    }
    case 'erupt-tele':
      if (g.t >= g.dur) {
        g.y = fy + 24; g.trail = [[g.x, under], [g.x, fy + 24]];
        const mid = (a.x0 + a.x1) / 2;
        launch(Math.sign(mid - g.x) * 45, -700 * Math.sqrt(sp), 1150);
        go(g, 'erupt'); sim.ev.push({ type: 'boss-erupt', x: g.x, y: fy });
      }
      break;
    case 'erupt':
      fly();
      if (g.y > fy + 30 && g.vy > 0) { sim.ev.push({ type: 'boss-dive', x: g.x, y: fy }); g.y = under; go(g, 'under', (ph2 ? 0.9 : 1.3) + sim.brng.next() * 0.5); }
      break;
    case 'arc-tele':
      if (g.t >= g.dur) {
        g.y = fy + 24; g.trail = [[g.x, under], [g.x, fy + 24]];
        const span = (a.x1 - 34) - (a.x0 + 34), T = 1.5 / Math.sqrt(sp), vy = -2 * 215 / (T / 2);
        launch(Math.sign((a.x0 + a.x1) / 2 - g.x) * span / T, vy, -2 * vy / T);
        go(g, 'arc'); sim.ev.push({ type: 'boss-erupt', x: g.x, y: fy });
      }
      break;
    case 'arc':
      fly();
      if (g.y > fy + 30 && g.vy > 0) {
        sim.ev.push({ type: 'boss-dive', x: g.x, y: fy }); g.y = under; g.x = clamp(g.x, a.x0 + 26, a.x1 - 26);
        if (ph2 && g.n === 1) { g.n = 2; go(g, 'arc-tele', 0.45 * g.tk); sim.ev.push({ type: 'boss-tele', kind: g.kind, move: 'arc', x: g.x, y: fy }); }   // straight back the other way
        else go(g, 'under', (ph2 ? 0.9 : 1.3) + sim.brng.next() * 0.5);
      }
      break;
    case 'spit-tele':                                     // the head rises out of the floor at the far side
      if (g.t === DT) { g.y = fy + 24; g.trail = [[g.x, under], [g.x, fy + 24]]; sim.ev.push({ type: 'boss-erupt', x: g.x, y: fy, small: true }); }
      g.y += (fy - 74 - g.y) * Math.min(1, DT * 9);
      g.face = Math.sign(p.x - g.x) || g.face;
      if (g.t >= g.dur) { go(g, 'spit', ph2 ? 2.2 : 2.0); g.n = 0; }
      break;
    case 'spit': {
      g.face = Math.sign(p.x - g.x) || g.face;
      const shots = ph2 ? 5 : 3, every = 0.32;
      if (g.n < shots && g.t >= 0.15 + g.n * every) {
        g.n++;
        const tx = clamp(p.x + (sim.brng.next() - 0.5) * 120, a.x0 + 16, a.x1 - 16), T = 0.95;
        const sx = g.x + g.face * 10, sy = g.y - 6;
        sim.bossShots.push({ kind: 'glob', x: sx, y: sy, vx: (tx - sx) / T, vy: -330, r: 6, t: 0, life: 4, dead: false, grav: 2 * (fy - sy + 330 * T) / (T * T) });
        sim.ev.push({ type: 'boss-spit', x: g.x, y: g.y });
      }
      if (g.t >= g.dur) { go(g, 'sink', 0.45); }
      break;
    }
    case 'sink':
      g.y += 200 * DT;
      if (g.y > under) { g.y = under; go(g, 'under', 1.1 + sim.brng.next() * 0.5); }
      break;
  }
  stepWyrmBody(g);
}

/** Boss projectiles: shockwaves, orbs, lightning (warn then strike), magma globs and the puddles they leave. */
export function stepBossShots(sim) {
  const a = sim.m.arena;
  for (const s of sim.bossShots) {
    if ((s.t += DT) > s.life) { s.dead = true; continue; }
    if (s.kind === 'wave') {
      s.x += s.vx * DT;
      if (s.x < a.x0 + 4 || s.x > a.x1 - 4) s.dead = true;
    } else if (s.kind === 'orb') {
      s.x += s.vx * DT; s.y += s.vy * DT;
      if (s.x < a.x0 - 4 || s.x > a.x1 + 4 || s.y < a.ceilY - 4 || s.y > a.floorY + 2) { s.dead = true; sim.ev.push({ type: 'orb-pop', x: s.x, y: s.y }); }
    } else if (s.kind === 'glob') {
      s.vy += s.grav * DT; s.x += s.vx * DT; s.y += s.vy * DT;
      if (s.y >= a.floorY - 2) {
        s.dead = true;
        sim.bossShots.push({ kind: 'puddle', x: clamp(s.x, a.x0 + 14, a.x1 - 14), y: a.floorY, w: 14, h: 9, t: 0, life: 1.3, dead: false });
        sim.ev.push({ type: 'splat-big', x: s.x, y: a.floorY });
      }
    }
  }
  sim.bossShots = sim.bossShots.filter((s) => !s.dead);
}

/** The box a boss shot hurts with (null: harmless right now). */
export function shotBox(s) {
  if (s.harmless) return null;
  if (s.kind === 'wave' || s.kind === 'puddle') return [s.x - s.w, s.y - s.h, s.x + s.w, s.y];
  if (s.kind === 'zap') return [s.x - s.w, s.y - s.h, s.x + s.w, s.y];
  return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
}
export { PW, PH, TILE, FOES };

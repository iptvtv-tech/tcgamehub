// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — the bosses (pure rules, run by ShaftSim in world.js).
//
//  Every boss follows one rule a player can learn: the blade only hurts a boss while it is DAZED
//  (it glows white-hot then). Any other time the blade clangs off. Two hits per daze (the second
//  shakes it awake). The mini-bosses take eight hits and get angrier at half health; the Volcano
//  Lord takes fifteen and has three phases. Each time a boss gets angrier the ice crystals in the
//  arena grow back. When it falls the crust over the vent shatters and the way out opens.
//
//  The Magma Golem (level 5) walks the floor at you. Close up it raises both fists and SLAMS:
//  a shockwave runs along the floor each way (jump it), and its fists stick in the stone for a
//  moment — that's your chance. Far away it hurls molten boulders (slash them).
//
//  The Cinder Drake (level 10) circles above. It breathes a spread of fireballs (slash them or
//  step aside), then rears up with a screech and DIVES at where you stand: run! It crashes into
//  the floor, dazed. Angry, it shakes embers loose when it climbs back up.
//
//  The Volcano Lord (level 15, the final boss), twice the Iceman's height:
//    phase 1 — walks at you; close up he POUNDS the floor (shockwaves, then his fists stick: hit
//              him); far away he hurls a volley of fireballs.
//    phase 2 — adds the LEAP: he crouches, vanishes into the smoke above, and his shadow hunts
//              you across the floor. When it stops and turns red, get out from under it — he
//              lands with shockwaves and staggers (hit him). His pound no longer sticks him:
//              from here on only a landing gives you an opening.
//    phase 3 — adds FIRE PILLARS: three glowing marks on the floor erupt into columns of flame.
//              Stand between them. His landings now shake embers loose too.
//
//  Note: world.js imports this file and this file imports world.js. Nothing here touches a
//  world.js value at load time (only inside functions), so the cycle is safe.
// ─────────────────────────────────────────────────────────────
import { DT, TILE, SHOT_G, overlap, playerBox, bodyH, tileAtPx, isFloor, ROCK, moveBody, FOES } from './world.js';

export const BOSSES = {
  golem: { name: 'MAGMA GOLEM', hp: 8, hw: 30, h: 88, pts: 400 },
  drake: { name: 'CINDER DRAKE', hp: 8, hw: 32, h: 34, pts: 400 },
  lord: { name: 'VOLCANO LORD', hp: 15, hw: 34, h: 104, pts: 1000 },
};
export const BOSS_HIT_PTS = 60;
/** Hits the blade can land in one daze: the second one wakes the boss up. */
export const DAZE_HITS = 2;
export const TOUCH_DMG = 20, WAVE_DMG = 15, BOULDER_DMG = 20, BREATH_DMG = 15;

// the golem
export const G_WALK = [52, 72], G_NEAR = 125, G_WINDUP = [0.8, 0.62], G_STUCK = [1.8, 1.45], G_THROW = 0.6;
export const WAVE_V = 245, WAVE_H = 22, WAVE_LIFE = 1.9;
// the drake
export const D_SPEED = [150, 195], D_HOVER = [2.2, 1.5], D_INHALE = 0.7, D_REAR = [0.8, 0.65], D_DIVE = 430, D_DAZED = [1.9, 1.5], D_RISE = 170;
export const D_HOVER_Y = 150;
// the Volcano Lord (index: phase 1, 2, 3)
export const L_WALK = [44, 56, 66], L_NEAR = 120, L_WINDUP = [0.85, 0.75, 0.65], L_STUCK = [1.7, 1.5, 1.35];
export const L_VOLLEY = 0.65, L_SHOTS = [3, 4, 5];
export const L_CROUCH = 0.5, L_RISE_V = 1600, L_TOP = -170, L_HUNT = 0.6, L_LOCK = 0.45, L_HUNT_V = 260, L_FALL_V = 950, L_LAND = [1.6, 1.5, 1.3];
export const PILLAR_RAISE = 0.7, PILLAR_WARN = 0.95, PILLAR_BURN = 0.6, PILLAR_HW = 16, PILLAR_H = 170, PILLAR_GAP = 100, PILLAR_DMG = 20;
export const CRUSH_DMG = 30;
/** The Lord's phase from his health: 15–11 → 1, 10–6 → 2, 5–1 → 3. */
export const lordPhase = (b) => (b.hp > 10 ? 1 : b.hp > 5 ? 2 : 3);

/** Which boss lives on this map (null on the climbing levels). */
export function makeBoss(m, rng) {
  const kind = m.boss;
  if (!kind) return null;
  const B = BOSSES[kind], floorY = Math.round(m.spawn.y / TILE) * TILE;
  // the stretch of floor the fight happens on (the raft between the two lava gutters)
  const r = floorY / TILE;
  let c0 = Math.floor(m.spawn.x / TILE), c1 = c0;
  while (isFloor(tileAtPx(m, (c0 - 1) * TILE + 1, r * TILE + 1))) c0--;
  while (isFloor(tileAtPx(m, (c1 + 1) * TILE + 1, r * TILE + 1))) c1++;
  const x0 = c0 * TILE, x1 = (c1 + 1) * TILE;
  const b = {
    kind, name: B.name, hp: B.hp, max: B.hp, hw: B.hw, h: B.h,
    floorY, x0, x1, state: 'intro', t: kind === 'drake' ? 1.8 : kind === 'lord' ? 2.2 : 1.6, face: -1, flash: 0, angry: false, dead: false, gone: false,
    x: kind === 'drake' ? (x0 + x1) / 2 + 60 : x1 - 70, y: kind === 'drake' ? -40 : floorY, vx: 0, vy: 0, next: 'breath', anim: 0, seed: rng.next(),
    phase: 1, n: 0, tx: 0, ty: 0,
  };
  if (kind === 'lord') { b.y = sim0Floor(floorY); b.rise = 0; }
  return b;
}

/** The Lord climbs up out of the lava for his entrance (y starts below the floor). */
const sim0Floor = (floorY) => floorY + 130;

/** The part of the boss that hurts to touch, and that the blade hits. Feet at (x, y). */
export const bossBox = (b) => [b.x - b.hw, b.y - b.h, b.x + b.hw, b.y];
export const bossDazed = (b) => !!b && (b.state === 'stuck' || b.state === 'dazed');
const harmless = (b) => b.state === 'stuck' || b.state === 'dazed' || b.state === 'rise' || b.state === 'dying' || b.state === 'intro' || b.state === 'hunt' || b.dead;

/** One step of the boss, its shockwaves, and its touch. */
export function stepBoss(sim) {
  const b = sim.boss;
  if (!b || b.gone) return;
  b.anim += DT;
  if (b.flash > 0) b.flash -= DT;
  if (b.state === 'dying') { if ((b.t -= DT) <= 0) { b.gone = true; sim.ev.push({ type: 'bossgone', x: b.x, y: b.y - b.h / 2 }); } return; }
  if (b.kind === 'golem') stepGolem(sim, b); else if (b.kind === 'drake') stepDrake(sim, b); else stepLord(sim, b);
  stepWaves(sim);
  stepPillars(sim);
  // touching the boss melts him (not while it's dazed)
  const p = sim.p;
  if (!p.dead && p.inv <= 0 && !harmless(b) && overlap(inset(playerBox(p), 3), bossBox(b))) sim.damage(b.state === 'fall' ? CRUSH_DMG : TOUCH_DMG, 'boss', p.x >= b.x ? 1 : -1);
}

/** The blade met the boss (once per swing). Returns true if it hurt it. */
export function hitBoss(sim, box) {
  const b = sim.boss, p = sim.p, a = p.atk;
  if (!b || b.dead || b.state === 'dying' || b.state === 'intro' || a.hit.includes('boss') || !overlap(box, bossBox(b))) return false;
  a.hit.push('boss');
  const pogo = a.kind === 'down' && !p.ground;
  if (pogo) { p.vy = -600; p.jumped = false; p.coyote = 0; p.buffer = 0; p.pogos++; sim.ev.push({ type: 'pogo', x: p.x, y: p.y, n: p.pogos }); }
  if (!bossDazed(b)) {
    sim.ev.push({ type: 'clang', x: (Math.max(box[0], b.x - b.hw) + Math.min(box[2], b.x + b.hw)) / 2, y: Math.max(box[1], b.y - b.h) + 10 });
    if (!pogo && p.ground) p.vx = -p.face * 140;         // the blade bounces off: a little shove back
    return false;
  }
  b.hp--; b.flash = 0.3;
  if (++b.dazeHits >= DAZE_HITS) b.t = Math.min(b.t, 0.3);   // shaken awake
  sim.ev.push({ type: 'bosshit', x: b.x, y: b.y - b.h * 0.55, hp: b.hp, max: b.max });
  if (b.hp <= 0) {
    b.state = 'dying'; b.t = 1.7; b.dead = true;
    for (const w of sim.waves) w.dead = true;
    for (const q of sim.shots) q.dead = true;
    for (const q of sim.pillars) q.dead = true;
    for (const e of sim.embers) if (!e.dead) { e.dead = true; sim.ev.push({ type: 'sizzle', id: e.id, x: e.x, y: e.y }); }
    sim.ev.push({ type: 'bossdown', kind: b.kind, x: b.x, y: b.y - b.h / 2, pts: BOSSES[b.kind].pts });
  } else if (b.kind === 'lord' ? lordPhase(b) > b.phase : !b.angry && b.hp <= b.max / 2) {
    b.angry = true;
    if (b.kind === 'lord') b.phase = lordPhase(b);
    for (const c of sim.crystals) c.got = false;
    sim.ev.push({ type: 'rage', kind: b.kind, phase: b.phase, x: b.x, y: b.y - b.h });
  }
  return true;
}

// ── The Magma Golem ──────────────────────────────────────────
function stepGolem(sim, b) {
  const p = sim.p, A = b.angry ? 1 : 0, rng = sim.rng;
  b.t -= DT;
  const dx = p.x - b.x;
  switch (b.state) {
    case 'intro':
      if (b.t <= 0) { b.state = 'walk'; b.t = 1.4; sim.ev.push({ type: 'roar', kind: 'golem', x: b.x, y: b.y - b.h }); }
      break;
    case 'walk': {
      if (!p.dead) b.face = Math.sign(dx) || b.face;
      const close = Math.abs(dx) <= G_NEAR;
      if (!close && !p.dead) b.x += Math.sign(dx) * G_WALK[A] * DT;
      b.x = Math.max(b.x0 + b.hw, Math.min(b.x1 - b.hw, b.x));
      if (p.dead) break;
      if (b.t <= 0 || (close && b.t < 0.9)) {
        const level = Math.abs(p.y - b.floorY) < 40;
        if (Math.abs(dx) < 175 && level) { b.state = 'windup'; b.t = G_WINDUP[A]; sim.ev.push({ type: 'windup', x: b.x, y: b.y - b.h }); }
        else { b.state = 'throw'; b.t = G_THROW; sim.ev.push({ type: 'heave', x: b.x, y: b.y - b.h }); }
      }
      break;
    }
    case 'windup':
      if (b.t <= 0) {
        b.state = 'stuck'; b.t = G_STUCK[A]; b.dazeHits = 0;
        for (const d of [-1, 1]) sim.waves.push({ x: b.x + d * (b.hw + 6), y: b.floorY, vx: d * WAVE_V, t: 0, dead: false });
        sim.ev.push({ type: 'slam', x: b.x, y: b.floorY });
        if (b.angry) for (let i = 0; i < 2; i++) sim.dropRock(b.x0 + 30 + rng.next() * (b.x1 - b.x0 - 60));
      }
      break;
    case 'stuck':
      if (b.t <= 0) { b.state = 'walk'; b.t = 1.2 + rng.next() * 0.8; sim.ev.push({ type: 'unstick', x: b.x, y: b.floorY }); }
      break;
    case 'throw':
      if (b.t <= 0) {
        const n = b.angry ? 2 : 1;
        for (let i = 0; i < n; i++) lob(sim, b.x + b.face * 14, b.y - b.h - 8, p.x + (i ? -b.face * 60 : 0), p.y - bodyH(p.k) * 0.5, { big: true, r: 11, dmg: BOULDER_DMG, T: 0.95 + i * 0.25 });
        sim.ev.push({ type: 'hurl', x: b.x, y: b.y - b.h });
        b.state = 'walk'; b.t = 1.1 + rng.next() * 0.9;
      }
      break;
  }
}

/** Shockwaves run along the floor until the floor ends. Jump over them. */
function stepWaves(sim) {
  const p = sim.p, m = sim.m, pb = p.dead ? null : playerBox(p);
  for (const w of sim.waves) {
    if (w.dead) continue;
    w.t += DT; w.x += w.vx * DT;
    const ahead = w.x + Math.sign(w.vx) * 6;
    if (w.t > WAVE_LIFE || !isFloor(tileAtPx(m, ahead, w.y + 1)) || tileAtPx(m, ahead, w.y - 4) === ROCK) { w.dead = true; sim.ev.push({ type: 'wavegone', x: w.x, y: w.y }); continue; }
    if (pb && p.inv <= 0 && overlap(pb, [w.x - 12, w.y - WAVE_H, w.x + 12, w.y])) sim.damage(WAVE_DMG, 'wave', Math.sign(w.vx));
  }
  if (sim.waves.length > 10) sim.waves = sim.waves.filter((w) => !w.dead);
}

// ── The Cinder Drake ─────────────────────────────────────────
function stepDrake(sim, b) {
  const p = sim.p, A = b.angry ? 1 : 0, m = sim.m;
  b.t -= DT;
  const mid = (b.x0 + b.x1) / 2;
  const fly = (tx, ty, v) => { const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1, s = Math.min(v, d * 3); b.x += (dx / d) * s * DT; b.y += (dy / d) * s * DT; };
  switch (b.state) {
    case 'intro':
      fly(b.x, D_HOVER_Y, 220);
      if (b.t <= 0) { b.state = 'hover'; b.t = 1.2; sim.ev.push({ type: 'roar', kind: 'drake', x: b.x, y: b.y - b.h }); }
      break;
    case 'hover': {
      // hang above him on the side of the nearer wall, so his escape from a dive is toward the middle
      const side = p.x < mid ? -1 : 1;
      const tx = Math.max(b.x0 + 40, Math.min(b.x1 - 40, p.x + side * 120));
      fly(tx, D_HOVER_Y + Math.sin(b.anim * 2.2) * 16, D_SPEED[A]);
      b.face = Math.sign(p.x - b.x) || b.face;
      if (b.t <= 0 && !p.dead) {
        if (b.next === 'breath') { b.state = 'inhale'; b.t = D_INHALE; b.next = 'swoop'; sim.ev.push({ type: 'inhale', x: b.x, y: b.y - b.h }); }
        else { b.state = 'rear'; b.t = D_REAR[A]; b.next = 'breath'; sim.ev.push({ type: 'rear', x: b.x, y: b.y - b.h }); }
      }
      break;
    }
    case 'inhale':
      b.face = Math.sign(p.x - b.x) || b.face;
      fly(b.x, D_HOVER_Y - 10, 60);
      if (b.t <= 0) {
        const n = b.angry ? 5 : 3, sx = b.x + b.face * 26, sy = b.y - 14;
        for (let i = 0; i < n; i++) lob(sim, sx, sy, p.x + (i - (n - 1) / 2) * 58, p.y - bodyH(p.k) * 0.5, { dmg: BREATH_DMG, T: 0.75 });
        sim.ev.push({ type: 'breath', x: sx, y: sy });
        b.state = 'hover'; b.t = 1.1;
      }
      break;
    case 'rear':
      b.face = Math.sign(p.x - b.x) || b.face;
      b.y -= 25 * DT;
      if (b.t <= 0) {
        // dive at the floor where he stands (kept over the raft, so it lands on stone)
        b.tx = Math.max(b.x0 + 34, Math.min(b.x1 - 34, p.x)); b.ty = Math.min(p.y, b.floorY);
        const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy) || 1;
        b.vx = (dx / d) * D_DIVE; b.vy = (dy / d) * D_DIVE; b.face = Math.sign(dx) || b.face;
        b.state = 'dive'; b.t = 2;
        sim.ev.push({ type: 'dive', x: b.x, y: b.y });
      }
      break;
    case 'dive': {
      b.x += b.vx * DT; b.y += b.vy * DT;
      const arrived = (b.tx - b.x) * b.vx + (b.ty - b.y) * b.vy <= 0;
      if (arrived || b.t <= 0 || tileAtPx(m, b.x, b.y) === ROCK) {
        if (arrived) { b.x = b.tx; b.y = b.ty; }
        b.state = 'dazed'; b.t = D_DAZED[A]; b.vx = 0; b.vy = 0; b.dazeHits = 0;
        sim.ev.push({ type: 'crashdown', x: b.x, y: b.y });
      }
      break;
    }
    case 'dazed': {
      // fall to whatever is below (it can land on a ledge)
      b.vy = Math.min(600, b.vy + 1400 * DT);
      const r = moveBody(b, 20, 20, m);
      if (r.ground) b.vy = 0;
      if (b.y > sim.lava.y - 4) { b.y = sim.lava.y - 4; b.vy = 0; }
      if (b.t <= 0) {
        b.state = 'rise';
        sim.ev.push({ type: 'recover', x: b.x, y: b.y - b.h });
        if (b.angry) shakeEmbers(sim, b);
      }
      break;
    }
    case 'rise':
      fly(b.x, D_HOVER_Y, D_RISE);
      if (b.y <= D_HOVER_Y + 6) { b.state = 'hover'; b.t = D_HOVER[A] + sim.rng.next() * 0.7; if (b.angry && sim.rng.chance(0.4)) b.next = 'swoop'; }
      break;
  }
}

// ── The Volcano Lord ─────────────────────────────────────────
function stepLord(sim, b) {
  const p = sim.p, P = b.phase - 1, rng = sim.rng;
  b.t -= DT;
  const dx = p.x - b.x, clampX = (x) => Math.max(b.x0 + b.hw, Math.min(b.x1 - b.hw, x));
  switch (b.state) {
    case 'intro':                      // he climbs up out of the lava lake onto the floor
      b.y = Math.max(b.floorY, b.y - 80 * DT);
      if (b.t <= 0) { b.y = b.floorY; b.state = 'walk'; b.t = 1.2; sim.ev.push({ type: 'roar', kind: 'lord', x: b.x, y: b.y - b.h }); }
      break;
    case 'walk': {
      if (!p.dead) b.face = Math.sign(dx) || b.face;
      const close = Math.abs(dx) <= L_NEAR;
      if (!close && !p.dead) b.x += Math.sign(dx) * L_WALK[P] * DT;
      b.x = clampX(b.x);
      if (p.dead) break;
      if (b.t <= 0 || (close && b.t < 0.9)) {
        // the next attack: phase 1 pound/volley; phase 2 every other one a leap; phase 3 leap, pillars, pound/volley
        const n = b.n++;
        let pick = 'basic';
        if (b.phase === 2 && n % 2 === 1) pick = 'leap';
        if (b.phase === 3) pick = ['leap', 'pillars', 'basic'][n % 3];
        if (pick === 'basic') pick = Math.abs(dx) < 175 && Math.abs(p.y - b.floorY) < 40 ? 'pound' : 'volley';
        if (pick === 'pound') { b.state = 'windup'; b.t = L_WINDUP[P]; sim.ev.push({ type: 'windup', kind: 'lord', x: b.x, y: b.y - b.h }); }
        else if (pick === 'volley') { b.state = 'volley'; b.t = L_VOLLEY; sim.ev.push({ type: 'inhale', kind: 'lord', x: b.x, y: b.y - b.h }); }
        else if (pick === 'leap') { b.state = 'crouch'; b.t = L_CROUCH; sim.ev.push({ type: 'crouch', x: b.x, y: b.y }); }
        else { b.state = 'summon'; b.t = PILLAR_RAISE; sim.ev.push({ type: 'summon', x: b.x, y: b.y - b.h }); }
      }
      break;
    }
    case 'windup':
      if (b.t <= 0) land(sim, b, 'pound');
      break;
    case 'stuck':
      if (b.t <= 0) { b.state = 'walk'; b.t = 1.0 + rng.next() * 0.8; sim.ev.push({ type: 'unstick', x: b.x, y: b.floorY }); }
      break;
    case 'volley':
      b.face = Math.sign(dx) || b.face;
      if (b.t <= 0) {
        const n = L_SHOTS[P], sx = b.x + b.face * 30, sy = b.y - b.h + 20;
        for (let i = 0; i < n; i++) lob(sim, sx, sy, p.x + (i - (n - 1) / 2) * 56, p.y - bodyH(p.k) * 0.5, { dmg: BREATH_DMG, T: 0.8 + (i % 2) * 0.12 });
        sim.ev.push({ type: 'breath', x: sx, y: sy });
        b.state = 'walk'; b.t = 1.1 + rng.next() * 0.7;
      }
      break;
    case 'crouch':
      if (b.t <= 0) { b.state = 'air'; b.tx = b.x; sim.ev.push({ type: 'leap', x: b.x, y: b.y }); }
      break;
    case 'air':                         // up into the smoke, out of sight
      b.y -= L_RISE_V * DT;
      if (b.y <= L_TOP) { b.y = L_TOP; b.state = 'hunt'; b.t = L_HUNT + L_LOCK; b.tx = b.x; }
      break;
    case 'hunt': {                      // his shadow follows him across the floor, then stops
      if (b.t > L_LOCK && !p.dead) { const d = clampX(p.x) - b.tx; b.tx += Math.sign(d) * Math.min(Math.abs(d), L_HUNT_V * DT); }
      else if (!b.locked) { b.locked = true; sim.ev.push({ type: 'lock', x: b.tx, y: b.floorY }); }
      b.x = b.tx;
      if (b.t <= 0) { b.state = 'fall'; b.locked = false; }
      break;
    }
    case 'fall':
      b.y += L_FALL_V * DT;
      if (b.y >= b.floorY) { b.y = b.floorY; land(sim, b, 'leap'); }
      break;
    case 'summon':                      // arms raised: three marks glow on the floor
      if (b.t <= 0) {
        const base = Math.max(b.x0 + PILLAR_GAP + 20, Math.min(b.x1 - PILLAR_GAP - 20, p.x));
        for (const o of [-1, 0, 1]) sim.pillars.push({ x: base + o * PILLAR_GAP, y: b.floorY, warn: PILLAR_WARN, burn: PILLAR_BURN, dead: false });
        sim.ev.push({ type: 'marks', x: base, y: b.floorY });
        b.state = 'walk'; b.t = PILLAR_WARN + PILLAR_BURN + 0.6;
      }
      break;
  }
}

/** The Lord hits the floor (a pound or a landing): shockwaves both ways, and he's stuck a moment. */
function land(sim, b, how) {
  const P = b.phase - 1;
  // from phase 2 on his pound no longer sticks him: only a landing from a leap staggers him
  if (how === 'pound' && b.phase > 1) { b.state = 'walk'; b.t = 0.9; }
  else { b.state = 'stuck'; b.t = how === 'leap' ? L_LAND[P] : L_STUCK[P]; b.dazeHits = 0; }
  for (const d of [-1, 1]) sim.waves.push({ x: b.x + d * (b.hw + 6), y: b.floorY, vx: d * WAVE_V, t: 0, dead: false });
  sim.ev.push({ type: how === 'leap' ? 'quake' : 'slam', kind: 'lord', x: b.x, y: b.floorY });
  if (how === 'leap' && b.phase === 3) shakeEmbers(sim, { ...b, y: b.floorY - 60 });
}

/** Fire pillars: a glowing mark on the floor, then a column of flame. Stand between them. */
function stepPillars(sim) {
  const p = sim.p, pb = p.dead ? null : playerBox(p);
  for (const q of sim.pillars) {
    if (q.dead) continue;
    if (q.warn > 0) { if ((q.warn -= DT) <= 0) sim.ev.push({ type: 'erupt', x: q.x, y: q.y }); continue; }
    if ((q.burn -= DT) <= 0) { q.dead = true; continue; }
    if (pb && p.inv <= 0 && overlap(pb, [q.x - PILLAR_HW, q.y - PILLAR_H, q.x + PILLAR_HW, q.y])) sim.damage(PILLAR_DMG, 'pillar', p.x >= q.x ? 1 : -1);
  }
  if (sim.pillars.length > 9) sim.pillars = sim.pillars.filter((q) => !q.dead);
}

/** Angry, the drake shakes two embers off its back as it climbs. */
function shakeEmbers(sim, b) {
  const alive = sim.embers.filter((e) => !e.dead).length;
  for (let i = 0; i < 2 && alive + i < sim.plan.max; i++) {
    const x = Math.max(b.x0 + 16, Math.min(b.x1 - 16, b.x + (i ? 30 : -30)));
    sim.embers.push({ id: sim.nextId++, kind: 'ember', hp: FOES.ember.hp, state: 'fall', t: 0, x, y: b.y - b.h - 10, vx: 0, vy: -120, dir: i ? 1 : -1, hopCD: 1.2, dead: false, age: 0, spitT: 9, flash: 0, side: 1 });
  }
}

/** Throw a fireball / boulder from (sx, sy) to land on (tx, ty) after o.T seconds. */
function lob(sim, sx, sy, tx, ty, o) {
  const T = Math.max(0.45, Math.min(1.3, o.T ?? 0.9));
  sim.shots.push({ x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T - 0.5 * SHOT_G * T, t: 0, dead: false, big: !!o.big, r: o.r || 7, dmg: o.dmg });
}

const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];

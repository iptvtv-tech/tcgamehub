// ─────────────────────────────────────────────────────────────
//  MAGMA ESCAPE — game test.   Run:  node games/magma-escape/test.mjs
//
//  Plays the real game.js headless (tools/lib/headless.mjs) and proves that:
//    • every level can be finished after a real mistake: the Iceman stands still on the start
//      ledge until the lava rises over it and melts him (a heart lost), then the bot climbs
//      out through the controls only, fighting the embers on the way
//    • the rules hold after every step: inside the shaft, never inside rock, size and health
//      agree, the lava only rises, no more embers than the level allows, nothing NaN
//    • the blade works: a slash shatters an ember in front, a jump-stab bounces off one below,
//      and a crystal freezes a melted Iceman back up a size (when there's room)
//    • the bosses (levels 5, 10 and the Volcano Lord on 15) can be beaten after a real mistake (a step into the lava
//      gutter); the blade clangs off a boss that isn't dazed and hurts one that is (two hits a
//      daze); shockwaves burn; the vent stays sealed until the boss falls
// ─────────────────────────────────────────────────────────────
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { botStep, rulesBroken as broken } from './bot.js';
import { TILE, MAX_HP, STAGES, POGO_V, emberPlan, FOES, SPIT_EVERY, ROCK_WARN, bodyH } from './world.js';
import { DAZE_HITS, WAVE_DMG, PILLAR_DMG, lordPhase } from './boss.js';

const G = await loadGame('magma-escape');
const r = reporter('magma-escape game test');

// ── 1. finish every level after melting once ──
const LEVELS = [1, 2, 4, 6, 8, 11, 14];
const SEEDS = [1, 2, 3];
let runs = 0, slashes = 0, kills = 0, totalT = 0;
for (const level of LEVELS) for (const seed of SEEDS) {
  const s = G.start({ seed, level, lives: 3 });
  const mem = {};
  let lastLava = s.game.sim.lava.y, t = 0, bad = null, phase = 'wait';
  const startLife = s.livesLost;
  while (t < 260 && s.state !== 'over' && s.cleared === 0) {
    if (s.state === 'playing') {
      if (phase === 'wait') { s.hold([]); if (s.livesLost > startLife) phase = 'climb'; }
      else botStep(s, { skill: 1 }, mem);
    } else s.hold([]);
    const before = s.game.sim;
    s.tick(); t += 1 / 120;
    if (s.game.sim !== before || s.game.sim.p.hp === MAX_HP && s.game.sim.lava.y === s.game.sim.lava.start) lastLava = s.game.sim.lava.y;
    if (s.state === 'playing' || s.state === 'clear') {
      bad = broken(s, lastLava);
      if (bad) break;
      lastLava = s.game.sim.lava.y;
    }
    if (phase === 'wait' && s.state === 'playing' && s.livesLost > startLife) phase = 'climb';
  }
  runs++; totalT += t; kills += s.game.sim.kills;
  const tag = `level ${level} seed ${seed}`;
  if (bad) { r.fail(`${tag}: ${bad}`); continue; }
  r.check(s.livesLost >= 1, `${tag}: standing in the rising lava never melted him (lava ${s.game.sim.lava.y.toFixed(0)}, hp ${s.game.sim.p.hp})`);
  r.check(s.cleared === 1, `${tag}: not finished after a lost heart (${t.toFixed(0)} s, ${s.state}, y ${s.game.sim.p.y.toFixed(0)}, best ${s.game.sim.p.best.toFixed(0)}, hp ${s.game.sim.p.hp}, lives lost ${s.livesLost})`);
}

// ── 2. the blade ──
{
  const s = G.start({ seed: 9, level: 1 });
  const sim = s.game.sim, p = sim.p;
  p.face = 1;
  sim.embers.push({ id: 900, state: 'crawl', t: 0, x: p.x + 34, y: p.y, vx: 0, vy: 0, dir: -1, hopCD: 9, dead: false, age: 0 });
  s.game.press.slash = true;
  s.run(0.25);
  r.check(sim.embers.find((e) => e.id === 900)?.dead, 'a slash did not shatter the ember in front of him');
  slashes++;
}
{
  const s = G.start({ seed: 9, level: 1 });
  const sim = s.game.sim, p = sim.p;
  p.y -= 120; p.vy = 300; p.ground = false;      // falling, an ember just below his feet
  sim.embers.push({ id: 901, state: 'crawl', t: 0, x: p.x, y: p.y + 30, vx: 0, vy: 0, dir: 1, hopCD: 9, dead: false, age: 0 });
  s.hold(['down']); s.game.press.slash = true;
  let bounced = false;
  for (let i = 0; i < 40; i++) { s.tick(); if (p.vy <= POGO_V + 30) bounced = true; }
  r.check(sim.embers.find((e) => e.id === 901)?.dead, 'a jump-stab did not shatter the ember below him');
  r.check(bounced, 'a jump-stab hit did not bounce him up');
}
// ── 3. crystals freeze him back up ──
{
  const s = G.start({ seed: 9, level: 1 });
  const sim = s.game.sim, p = sim.p;
  sim.damage(60, 'ember', 1);                       // 100 → 40: Cracks
  r.check(sim.p.k === STAGES[1].k, `60 damage should leave him at Cracks (k ${p.k})`);
  s.run(1.5);                                      // land again
  const c = sim.crystals[0];
  p.x = c.x; p.y = Math.floor((c.y + TILE) / TILE) * TILE;   // stand on the ledge the crystal floats above
  s.tick();
  r.check(c.got, 'touching a crystal did not collect it');
  r.check(sim.p.hp === 65 && sim.p.k === STAGES[2].k, `a crystal should heal 25 and grow him to Drips (hp ${sim.p.hp}, k ${sim.p.k})`);
}
// ── 4. the other creatures ──
const foe = (sim, kind, dx, extra = {}) => { const p = sim.p, e = { id: 950 + sim.embers.length, kind, hp: FOES[kind].hp, state: kind === 'spitter' ? 'perch' : 'crawl', t: 0, x: p.x + dx, y: p.y, vx: 0, vy: 0, dir: -1, hopCD: 9, dead: false, age: 0, spitT: 0.01, flash: 0, side: 1, ...extra }; sim.embers.push(e); return e; };
{ // a brute takes two hits
  const s = G.start({ seed: 9, level: 8 }), sim = s.game.sim; sim.p.face = 1;
  const b = foe(sim, 'brute', 34);
  s.game.press.slash = true; s.run(0.35);
  r.check(!b.dead && b.hp === 1, `one slash should crack a brute, not kill it (hp ${b.hp}, dead ${b.dead})`);
  sim.p.inv = 5; b.x = sim.p.x + 30; s.game.press.slash = true; s.run(0.35);
  r.check(b.dead, 'a second slash should finish a brute');
}
{ // a spitter lobs a fireball, and the blade shatters it
  const s = G.start({ seed: 9, level: 3 }), sim = s.game.sim; sim.p.inv = 99;
  foe(sim, 'spitter', 150, { spitT: 0.01 });
  s.run(0.7);
  r.check(sim.shots.length > 0, 'a spitter in range never spat');
  const shot = sim.shots[0];
  if (shot) { shot.x = sim.p.x + 26; shot.y = sim.p.y - 25; shot.vx = 0; shot.vy = 0; sim.p.face = 1; s.game.press.slash = true; s.tick(); s.tick(); s.tick(); r.check(shot.dead, 'a slash should shatter a fireball in front of him'); }
  r.check(SPIT_EVERY > 1, 'spitters should not fire non-stop');
}
{ // a cinder bat dives at him
  const s = G.start({ seed: 9, level: 6 }), sim = s.game.sim; sim.p.inv = 99;
  const b = foe(sim, 'bat', 80, { state: 'fly', t: 0.2 });
  b.y = sim.p.y - 120;
  let dove = false; for (let i = 0; i < 240; i++) { s.tick(); if (b.state === 'dive') dove = true; }
  r.check(dove, 'a cinder bat never dived');
}
{ // a falling rock lands where its shadow was
  const s = G.start({ seed: 9, level: 4 }), sim = s.game.sim;
  sim.p.x = 228; sim.dropRock(); const k = sim.rocks[0];
  r.check(k && k.land > k.y, 'the rock rain should mark a landing spot below the rock');
  let hitOrLanded = false; for (let i = 0; i < 360 && k; i++) { s.tick(); if (k.dead) { hitOrLanded = true; break; } }
  r.check(hitOrLanded && ROCK_WARN > 0.5, 'a falling rock never landed (or gave too little warning)');
}

// ── 5. the bosses ──
let bossRuns = 0, bossT = 0;
for (const level of [5, 10, 15]) for (const seed of [1, 2, 3, 4]) {
  const s = G.start({ seed, level, lives: 3 });
  const mem = {};
  let t = 0, bad = null, phase = 'mistake', lastLava = s.game.sim.lava.y, sawSealed = false;
  while (t < 260 && s.state !== 'over' && s.cleared === 0) {
    const sim = s.game.sim;
    if (s.state === 'playing') {
      // the mistake: walk left off the raft into the lava gutter
      if (phase === 'mistake') { s.hold(['left']); if (sim.p.inv > 0 || sim.p.hp < MAX_HP) { phase = 'fight'; s.hold([]); } }
      else botStep(s, { skill: 1 }, mem);
    } else s.hold([]);
    const before = sim, lost = s.livesLost;
    s.tick(); t += 1 / 120;
    if (s.game.sim !== before || s.livesLost !== lost || s.state !== 'playing') lastLava = s.game.sim.lava.y;
    if (s.state === 'playing' || s.state === 'clear') {
      bad = broken(s, lastLava); if (bad) break;
      lastLava = s.game.sim.lava.y;
      const B = s.game.sim.boss;
      if (B && !B.dead && !s.game.sim.ventOpen()) sawSealed = true;
      if (B && !B.dead && s.game.sim.done) { bad = 'the vent let him out while the boss lived'; break; }
    }
  }
  bossRuns++; bossT += t;
  const tag = `boss level ${level} seed ${seed}`, B = s.game.sim.boss;
  if (bad) { r.fail(`${tag}: ${bad}`); continue; }
  r.check(phase === 'fight', `${tag}: the step into the lava gutter never burned him`);
  r.check(sawSealed, `${tag}: the vent was never sealed`);
  r.check(s.cleared === 1, `${tag}: not beaten after a mistake (${t.toFixed(0)} s, boss hp ${B?.hp}, state ${B?.state}, lives lost ${s.livesLost})`);
}
{ // the blade clangs off a boss that isn't dazed, and hurts one that is (two hits a daze)
  const s = G.start({ seed: 4, level: 5 }), sim = s.game.sim, p = sim.p, B = sim.boss;
  p.inv = 99; B.state = 'walk'; B.t = 99; B.x = p.x + 60; B.face = -1; p.face = 1;
  s.game.press.slash = true; s.run(0.3);
  r.check(B.hp === B.max, `a slash on a golem that isn't dazed should clang off (hp ${B.hp})`);
  B.state = 'stuck'; B.t = 9; B.dazeHits = 0; B.x = p.x + 60;
  for (let i = 0; i < 4; i++) { s.game.press.slash = true; s.run(0.4); }
  r.check(B.hp === B.max - DAZE_HITS, `a dazed golem should take ${DAZE_HITS} hits a daze (hp ${B.hp}/${B.max})`);
  r.check(B.state !== 'stuck' || B.t <= 0.3, 'the second hit should shake the golem awake');
  // its shockwave burns him
  const s2 = G.start({ seed: 4, level: 5 }), sim2 = s2.game.sim, p2 = sim2.p;
  sim2.boss.state = 'walk'; sim2.boss.t = 99; sim2.boss.x = 380;
  sim2.waves.push({ x: p2.x + 60, y: sim2.boss.floorY, vx: -245, t: 0, dead: false });
  s2.run(0.6);
  r.check(p2.hp === MAX_HP - WAVE_DMG, `a shockwave should melt him by ${WAVE_DMG} (hp ${p2.hp})`);
}
{ // the vent stays sealed until the boss falls, then opens
  const s = G.start({ seed: 4, level: 10 }), sim = s.game.sim, p = sim.p, m = sim.m;
  p.inv = 999; sim.boss.state = 'hover'; sim.boss.t = 99;
  const atVent = () => { p.x = m.exit.x; p.y = m.exit.y; p.vx = 0; p.vy = 0; p.ground = true; };
  atVent(); s.run(0.2);
  r.check(!sim.done && s.cleared === 0, 'the sealed vent let him out while the drake lived');
  sim.boss.hp = 0; sim.boss.dead = true; sim.boss.state = 'dying'; sim.boss.t = 0.1;
  atVent(); s.run(0.3);
  r.check(s.cleared === 1, 'the vent did not open once the drake fell');
}
{ // the drake's dive ends with it dazed on the floor
  const s = G.start({ seed: 4, level: 10 }), sim = s.game.sim, B = sim.boss;
  sim.p.inv = 999; B.state = 'rear'; B.t = 0.01; B.x = 120; B.y = 150;
  let dazed = false; for (let i = 0; i < 360 && !dazed; i++) { s.tick(); if (B.state === 'dazed') dazed = true; }
  r.check(dazed, 'the drake dive never ended dazed');
  s.run(0.8);
  r.check(Math.abs(B.y - sim.p.y) < 30, `the dazed drake should come to rest on the floor (y ${B.y.toFixed(0)}, him ${sim.p.y.toFixed(0)})`);
}

{ // the Volcano Lord: three phases; from phase 2 only a leap landing staggers him; pillars burn
  const s = G.start({ seed: 5, level: 15 }), sim = s.game.sim, p = sim.p, B = sim.boss;
  r.check(B && B.kind === 'lord' && B.max === 15, 'level 15 should be the Volcano Lord with 15 hits');
  r.check(lordPhase({ hp: 15 }) === 1 && lordPhase({ hp: 10 }) === 2 && lordPhase({ hp: 5 }) === 3, 'the Lord\'s phases should change at 10 and 5 hits left');
  B.state = 'walk'; B.t = 9; B.y = B.floorY;
  B.hp = 11; B.state = 'stuck'; B.t = 9; B.dazeHits = 0; B.x = p.x + 62; p.face = 1; p.inv = 99;
  s.game.press.slash = true; s.run(0.4);
  r.check(B.hp === 10 && B.phase === 2, `the hit that leaves 10 should start phase 2 (hp ${B.hp}, phase ${B.phase})`);
  r.check(sim.crystals.every((c) => !c.got), 'a new phase should grow the crystals back');
  // a pound in phase 2 does not stick him
  B.state = 'windup'; B.t = 0.01; s.tick(); s.tick();
  r.check(B.state === 'walk', `in phase 2 a pound should not stick him (state ${B.state})`);
  // a leap ends with him staggered where his shadow stopped
  B.state = 'crouch'; B.t = 0.01; p.inv = 99;
  let landed = false, shadowX = null;
  for (let i = 0; i < 600 && !landed; i++) { s.tick(); if (B.locked && shadowX == null) shadowX = B.tx; if (B.state === 'stuck') landed = true; }
  r.check(landed, 'the Lord\'s leap never landed');
  r.check(shadowX != null && Math.abs(B.x - shadowX) < 1, `he should land where his shadow stopped (shadow ${shadowX}, landed ${B.x.toFixed(0)})`);
  // fire pillars burn
  const s2 = G.start({ seed: 5, level: 15 }), sim2 = s2.game.sim, p2 = sim2.p;
  sim2.boss.state = 'walk'; sim2.boss.t = 99; sim2.boss.y = sim2.boss.floorY; sim2.boss.x = 380;
  sim2.pillars.push({ x: p2.x, y: sim2.boss.floorY, warn: 0.2, burn: 0.6, dead: false });
  s2.run(0.1);
  r.check(p2.hp === MAX_HP, 'a fire pillar should not burn while it is only a mark');
  s2.run(0.3);
  r.check(p2.hp === MAX_HP - PILLAR_DMG, `an erupting pillar should melt him by ${PILLAR_DMG} (hp ${p2.hp})`);
}

// ── 6. the ember plan stays sane on every level ──
for (let L = 1; L <= 15; L++) { const e = emberPlan(L); r.check(e.max >= 2 && e.max <= 6 && e.every >= 1.6, `level ${L}: odd ember plan ${JSON.stringify(e)}`); }

r.done(`${runs} runs finished after melting once (avg ${(totalT / runs).toFixed(0)} s), ${kills} embers shattered on the way, ${bossRuns} boss fights won after a mistake (avg ${(bossT / bossRuns).toFixed(0)} s), blade + crystal + boss checks`);

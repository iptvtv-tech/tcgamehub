// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — game test.   Run:  node games/inferno-vault/test.mjs
//
//  Plays the real game.js headless (tools/lib/headless.mjs) and proves that:
//    • every level can be finished after a real mistake: the Iceman walks into a guard's lantern
//      (or, with no guard on his floor, into the lava), and the bot still gets him down to the
//      vault door through the controls only
//    • the expert bot gets through every level unseen (the Ghost bonus is always possible)
//    • the rules hold after every step: inside the vault, never inside rock, size and health
//      agree, guards stay on their patrols, no more fireballs than allowed, nothing NaN
//    • the stealth rules: a lantern melts him and the guard shouts and throws; an alcove hides him
//      (not seen, not burned, even as a guard walks through it); a hunting guard gives up and
//      patrols again once he has hidden; a slash from behind puts a guard out, from the front it
//      bounces off and the guard sees him; the blade smashes fireballs; lava burns; shards heal
// ─────────────────────────────────────────────────────────────
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { botStep, rulesBroken } from './bot.js';
import BENCH from './bench.mjs';
import { VaultSim, TILE, MAX_HP, STAGES, BEAM_DPS, SPOT_T, SEARCH_T, SHARD_HP, GUARD_H, bodyH } from './world.js';
import { mapFor, ALL_MAPS } from './levels.js';

const G = await loadGame('inferno-vault');
const r = reporter('inferno-vault game test');
const STEP = 1 / 120;

// ── 1. finish every level after a real mistake ──
const LEVELS = [1, 2, 3, 4, 5, 8, 12, 15];
const SEEDS = [1, 2];
let runs = 0, totalT = 0, takedowns = 0;
for (const level of LEVELS) for (const seed of SEEDS) {
  const s = G.start({ seed, level, lives: 3, unlimited: true });
  const b = { skill: 1, rand: (() => { let a = seed * 7 + level; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })(), t: 0, level, mem: {} };
  let t = 0, bad = null, mistakeDone = false;
  while (t < 240 && s.state !== 'over' && !s.cleared) {
    if (s.state === 'playing') {
      if (!mistakeDone && t > 1) mistakeDone = BENCH.mistake(s.game, s, b);
      else botStep(s, b, b.mem);
    } else s.hold([]);
    s.tick(); t += STEP;
    if (s.state === 'playing') { bad = rulesBroken(s); if (bad) break; }
  }
  runs++; totalT += t; takedowns += s.game.sim.takedowns;
  const tag = `level ${level} seed ${seed}`, sim = s.game.sim;
  if (bad) { r.fail(`${tag}: ${bad}`); continue; }
  r.check(b.mem.mistake?.hp != null, `${tag}: the mistake never happened (no guard or lava found)`);
  r.check(s.cleared, `${tag}: not finished after the mistake (${t.toFixed(0)} s, ${s.state}, x ${sim.p.x.toFixed(0)} y ${sim.p.y.toFixed(0)}, hp ${sim.p.hp.toFixed(0)}, lives lost ${s.livesLost})`);
}

// ── 2. unseen: the Ghost bonus is always possible ──
let ghosts = 0;
for (let level = 1; level <= ALL_MAPS().length; level++) {
  const s = G.start({ seed: 5, level, lives: 3, unlimited: true });
  const b = { skill: 1, t: 0, level, mem: {} };
  let t = 0, ghost = false;
  const sim = () => s.game.sim;
  while (t < 200 && !s.cleared && s.state !== 'over') {
    if (s.state === 'playing') botStep(s, b, b.mem); else s.hold([]);
    const before = sim().done;
    s.tick(); t += STEP;
    if (!before && sim().done) ghost = !sim().seen;
  }
  if (r.check(s.cleared, `level ${level}: the expert bot did not finish a clean run (${t.toFixed(0)} s)`)) {
    if (r.check(ghost && s.livesLost === 0, `level ${level}: the expert bot was seen or lost a heart (seen ${sim().seen}, lives lost ${s.livesLost}) — is the Ghost bonus possible?`)) ghosts++;
  }
}

// ── 3. the stealth rules (on the rules alone, world.js) ──
const NONE = { dir: 0, jumpPress: false, jumpHeld: false, up: false, down: false, slashPress: false };
const run = (sim, secs, inp = NONE) => { const ev = []; for (let i = 0; i < Math.round(secs / STEP); i++) ev.push(...sim.step(typeof inp === 'function' ? inp(i) : inp)); return ev; };
const guardHall = () => {
  const sim = new VaultSim(mapFor(2), 2), g = sim.guards[0];
  return { sim, g, p: sim.p, floorY: g.y };
};
{ // a lantern melts him; the guard shouts, then throws
  const { sim, g, p, floorY } = guardHall();
  g.x = 9 * TILE + 12; g.face = 1; g.state = 'patrol';
  p.x = g.x + 90; p.y = floorY; p.vy = 0; p.ground = true;
  const ev = run(sim, 0.3);
  r.check(ev.some((e) => e.type === 'spotted'), 'standing in a lantern beam did not get him seen');
  r.check(p.hp < MAX_HP && p.hp > MAX_HP - BEAM_DPS * 0.3 - 1, `a lantern should melt him slowly (hp ${p.hp.toFixed(1)})`);
  const ev2 = run(sim, SPOT_T + 0.1);
  r.check(ev2.some((e) => e.type === 'throw') || ev.some((e) => e.type === 'throw'), 'a guard that saw him never threw a fireball');
}
{ // an alcove hides him, even as the guard walks through it
  const { sim, g, p, floorY } = guardHall();
  const ax = 6 * TILE + TILE;                        // between the two shadow columns (6 and 7)
  p.x = ax; p.y = floorY; p.ground = true; p.vy = 0;
  g.x = 12 * TILE; g.face = -1; g.state = 'patrol';
  let passed = false;
  const ev = run(sim, 8, () => { if (g.x < ax - 30) passed = true; return NONE; });
  r.check(p.hidden, 'standing in the alcove should hide him');
  r.check(passed, 'the guard never walked past the alcove');
  r.check(!ev.some((e) => e.type === 'spotted' || e.type === 'hurt' || e.type === 'heat'), `hidden in an alcove he was still ${ev.find((e) => ['spotted', 'hurt', 'heat'].includes(e.type))?.type}`);
  r.check(p.hp === MAX_HP, `hidden in an alcove he still melted (hp ${p.hp})`);
}
{ // a hunting guard gives up once he hides, and patrols again
  const { sim, g, p, floorY } = guardHall();
  g.x = 13 * TILE; g.face = -1; g.state = 'patrol';
  p.x = g.x - 100; p.y = floorY; p.ground = true; p.inv = 99;
  run(sim, 0.2);
  r.check(g.state === 'alert' || g.state === 'hunt', `the guard did not see him (state ${g.state})`);
  p.x = 6 * TILE + TILE;                             // into the alcove
  run(sim, SPOT_T + SEARCH_T + 0.5);
  r.check(g.state === 'patrol', `a guard that lost him should patrol again after ${SEARCH_T} s (state ${g.state})`);
}
{ // a slash from behind puts a guard out
  const { sim, g, p, floorY } = guardHall();
  g.x = 12 * TILE; g.face = 1; g.state = 'patrol';
  p.x = g.x - 50; p.y = floorY; p.ground = true; p.face = 1;
  const ev = run(sim, 0.3, (i) => ({ ...NONE, slashPress: i === 0 }));
  r.check(g.state === 'down' && ev.some((e) => e.type === 'takedown'), `a slash from behind should put the guard out (state ${g.state})`);
  r.check(sim.takedowns === 1, 'the takedown was not counted');
  const ev2 = run(sim, 3, (i) => ({ ...NONE, dir: i < 60 ? 1 : 0 }));
  r.check(!ev2.some((e) => e.type === 'hurt' || e.type === 'spotted'), 'a guard that was put out still burned or saw him');
}
{ // from the front the blade bounces off, and the guard knows he is there
  const { sim, g, p, floorY } = guardHall();
  g.x = 12 * TILE; g.face = 1; g.state = 'patrol';
  p.x = g.x + 50; p.y = floorY; p.ground = true; p.face = -1; p.inv = 99;
  const ev = run(sim, 0.3, (i) => ({ ...NONE, slashPress: i === 0 }));
  r.check(ev.some((e) => e.type === 'parry') && g.state !== 'down', `a slash at a guard's face should bounce off (state ${g.state})`);
  r.check(g.state === 'alert' || g.state === 'hunt', `after the blade bounced off, the guard should be after him (state ${g.state})`);
}
{ // the blade smashes a fireball
  const { sim, p, floorY } = guardHall();
  p.x = 4 * TILE; p.y = floorY; p.ground = true; p.face = 1;
  sim.shots.push({ id: 99, x: p.x + 30, y: p.y - 25, vx: 0, vy: 0, t: 0, dead: false, r: 7 });
  const ev = run(sim, 0.1, (i) => ({ ...NONE, slashPress: i === 0 }));
  r.check(ev.some((e) => e.type === 'smash'), 'a slash should smash a fireball in front of him');
}
{ // lava burns; a frost shard freezes him back up a size
  const sim = new VaultSim(mapFor(1), 1), p = sim.p, m = sim.m;
  let lx = -1;
  for (let c = 0; c < m.C && lx < 0; c++) if (m.t[15 * m.C + c] === 3) lx = c * TILE + 12;
  p.x = lx; p.y = 15 * TILE - 2; p.vy = 200; p.ground = false;
  const ev = run(sim, 0.1);
  r.check(ev.some((e) => e.type === 'burn') && p.hp < MAX_HP, 'stepping into the lava did not burn him');
  const sh = sim.shards[0], before = p.hp;
  p.x = sh.x; p.y = Math.ceil(sh.y / TILE) * TILE; p.vy = 0; p.ground = true; p.inv = 0;
  run(sim, 0.05);
  r.check(sh.got && p.hp === Math.min(MAX_HP, before + SHARD_HP), `a frost shard should heal ${SHARD_HP} (hp ${before} → ${p.hp})`);
}
{ // a guard walking into him burns him and sees him
  const { sim, g, p, floorY } = guardHall();
  g.x = 12 * TILE; g.face = -1; g.state = 'patrol';
  p.x = g.x - 14; p.y = floorY; p.ground = true; p.face = 1;
  const ev = run(sim, 0.1);
  r.check(ev.some((e) => e.type === 'hurt'), 'touching a fire guard should burn him');
  r.check(sim.seen, 'touching a fire guard should get him seen');
}
// ── 4. every level is a real vault: guards from level 2, more of them deeper ──
r.check(mapFor(1).guards.length === 0 && mapFor(2).guards.length === 1, 'level 1 should have no guard and level 2 one');
r.check(mapFor(5).guards.length >= 3, 'level 5 should have at least three guards');
r.check(STAGES.length === 4 && bodyH(1) < 3 * TILE, 'the full-size Iceman should fit in a 3-tile alcove');
r.check(GUARD_H < 3 * TILE, 'a guard should fit under a 3-tile ceiling');

r.done(`${runs} levels finished after a mistake (avg ${(totalT / runs).toFixed(0)} s, ${takedowns} guards put out), ${ghosts}/${ALL_MAPS().length} levels unseen`);

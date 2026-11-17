// node games/galactic-alien-shooter/test.mjs
// Plays the real Galactic Alien Shooter headless (tools/lib/headless.mjs) and proves:
//   1 · the ship fires only while Space or the mouse button is held: moving with the mouse or
//       the arrow keys never fires
//   2 · levels can be finished after a real crash (the benchmark's bot flies into a diving ship
//       or a shot, then plays on), bosses included, with the game's rules holding at every step
//   3 · after a lost life the ship comes back at the bottom middle with the sky clear of shots,
//       2.2 s of safety, no special weapon and the blaster one power level down
//   4 · a shield takes one hit; a twin fighter loses a wing, not a life
//   5 · lives: never more than 5; extra lives come at 100k, 300k and 600k points, once each
//   6 · special weapons run out on their timers (laser 7 s, rockets 10 s) and capsules follow
//       the power rules (1 → 3, never higher)
//   7 · STAR RUN (bonus): 40 ships, you can't be hit, it ends by its 15 s timer
//   8 · every level 1–40 builds: a fleet of 20–40 ships, or its boss on levels 9, 19, 29, 39
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';

const G = await loadGame('galactic-alien-shooter');
const B = (await import('./bench.mjs')).default;
const t = reporter('galactic-alien-shooter');
const W = 480, H = 720, PY = H - 74;
const isBoss = (L) => L % 10 === 9, isBonus = (L) => L % 5 === 0;
/** A shot sitting on the ship (the simplest real hit). */
const hitShip = (g) => g.enemyShots.push({ kind: 'pellet', x: g.ship.x, y: g.ship.y - 30, vx: 0, vy: 240, r: 4 });

// ── 1 · fire only on Space or the mouse button ──
for (const level of [1, 6]) {
  const fired = (drive, setup) => {
    const s = G.start({ seed: 3, level }), g = s.game;
    setup?.(s);
    let n = 0; const seen = new WeakSet();
    // the level may end when its (emptied) fleet is "gone"; count only while in play
    for (let i = 0; i < 2 / STEP && s.state === 'playing'; i++) {
      g.waveQ.forEach((w) => { w.t = 1e9; });                 // hold the fleet back: only the trigger matters
      drive?.(s, i * STEP); s.tick();
      for (const b of g.bullets) if (!seen.has(b)) { seen.add(b); n++; }
    }
    return { n, g, s };
  };
  let r = fired((s, tt) => { s.hold(tt % 1 < 0.5 ? ['left', 'up'] : ['right', 'down']); s.pointerMove(240 + 200 * Math.sin(tt * 5), 560 + 80 * Math.cos(tt * 3)); });
  t.check(r.n === 0 && r.g.shots === 0, `level ${level}: the ship fired ${r.n} bullet(s) with no Space and no mouse button (arrow keys + mouse moves only)`);
  t.check(!r.g.hasFired, `level ${level}: the game thinks the player has fired, with no trigger held`);
  r = fired((s) => s.hold(['action']));
  t.check(r.n >= 8 && r.n <= 12, `level ${level}: holding Space for 2 s fired ${r.n} bolts (the blaster's rate is 5 a second)`);
  r = fired(null, (s) => s.pointerDown(240, 600));
  t.check(r.n >= 8 && r.n <= 12, `level ${level}: holding the mouse button for 2 s fired ${r.n} bolts (5 a second)`);
}

// ── 2 · finishable after a real crash, bosses included ──
let runs = 0, crashes = 0;
for (const level of [1, 2, 4, 7, 9, 11, 13, 16, 19]) {
  const r = botPlay(G, B, { level, seed: 1 });
  runs++; crashes += r.deaths;
  const g = r.shell.game;
  if (!t.check(r.cleared, `level ${level}${isBoss(level) ? ' (boss)' : ''}: ${why(r)} (${r.deaths} lives lost${g.boss ? `, boss at ${g.boss.hp}/${g.boss.maxHp}` : ''})`)) continue;
  t.check(r.mistakeMade && r.mistakeCost >= 1, `level ${level}: the test's crash didn't cost a life`);
  if (isBoss(level)) t.check(g.boss && g.boss.hp <= 0, `level ${level}: cleared with the boss at ${g.boss?.hp} hp`);
  else t.check(g.aliens.every((a) => a.dead || a.col < 0), `level ${level}: cleared with ${g.aliens.filter((a) => !a.dead).length} ships still flying`);
}

// ── 3 · a fair comeback after a lost life ──
for (const level of [3, 8, 9, 14]) {
  const s = G.start({ seed: 21 + level, level, unlimited: true }), g = s.game;
  s.run(4, () => g.aliens.length > 6 || (g.boss && !g.boss.enter));
  g.weapon = 'rockets'; g.weaponT = 9; g.pw = { blaster: 3, laser: 1, rockets: 2 };
  g.shield = false; g.dual = false; g.invuln = 0;
  for (let i = 0; i < 6; i++) g.enemyShots.push({ kind: 'pellet', x: 60 + i * 70, y: 300, vx: 0, vy: 100, r: 4 });
  hitShip(g);
  const lost = s.run(2, () => s.livesLost > 0);
  if (!t.check(s.livesLost === 1, `level ${level}: a shot on the ship cost ${s.livesLost} lives after ${lost.toFixed(1)} s`)) continue;
  s.run(4, () => s.state === 'playing');
  t.check(s.state === 'playing', `level ${level}: play did not start again after the lost life`);
  t.check(Math.abs(g.ship.x - W / 2) < 1 && Math.abs(g.ship.y - PY) < 1, `level ${level}: the ship comes back at (${g.ship.x.toFixed(0)}, ${g.ship.y.toFixed(0)}), not the bottom middle`);
  t.check(g.enemyShots.length === 0, `level ${level}: ${g.enemyShots.length} enemy shot(s) still flying as the ship comes back`);
  t.check(g.invuln >= 2.2 - 0.02, `level ${level}: only ${g.invuln.toFixed(2)} s of safety after coming back`);
  t.check(g.weapon === 'blaster' && g.weaponT === 0 && g.pw.blaster === 2 && g.pw.rockets === 1, `level ${level}: after a lost life the weapon is ${g.weapon} (blaster power ${g.pw.blaster}, rockets ${g.pw.rockets}); it should be the blaster, one level down`);
  // nothing can cost a second life during the safe time
  hitShip(g); s.run(1);
  t.check(s.livesLost === 1, `level ${level}: a second life was lost inside the 2.2 s of safety`);
}

// ── 4 · shield and twin fighter ──
{
  const s = G.start({ seed: 5, level: 3, unlimited: true }), g = s.game;
  const calm = () => { g.waveQ.forEach((w) => { w.t = 1e9; }); };
  calm(); g.shield = true; hitShip(g);
  s.run(1, calm);
  t.check(s.livesLost === 0 && !g.shield, `a shielded ship: ${s.livesLost} lives lost, shield ${g.shield ? 'still up' : 'down'} after one hit`);
  g.invuln = 0; g.dual = true; hitShip(g);
  s.run(1, calm);
  t.check(s.livesLost === 0 && !g.dual, `a twin fighter: ${s.livesLost} lives lost, ${g.dual ? 'still twin' : 'one wing left'} after one hit`);
  g.invuln = 0; hitShip(g);
  s.run(1, calm);
  t.check(s.livesLost === 1, `with no shield and no twin, a hit cost ${s.livesLost} lives (should be 1)`);
}

// ── 5 · lives ──
{
  const s = G.start({ seed: 6, level: 2 }), g = s.game;
  const calm = () => { g.waveQ.forEach((w) => { w.t = 1e9; }); };
  t.check(s.lives === 3, `a run starts with ${s.lives} lives`);
  const got = [];
  for (const score of [99999, 100000, 150000, 299999, 300000, 600000, 2000000]) {
    s.score = score; const before = s.lives;
    s.run(0.1, calm);
    got.push(s.lives - before);
  }
  t.check(got.join() === '0,1,0,0,1,0,0' && s.lives === 5, `extra lives at 99 999 / 100k / 150k / 299 999 / 300k / 600k / 2M came as ${got.join(' ')} (lives now ${s.lives}); expected 0 1 0 0 1 0 0 and 5 lives, the third being worth points at the cap`);
  const sc = s.score;
  g.collect({ kind: 'life', x: 240, y: 600 });
  t.check(s.lives === 5 && s.score > sc, `a 1UP at 5 lives: lives ${s.lives}, score ${s.score > sc ? 'went up' : 'unchanged'} (it should give points instead)`);
}

// ── 6 · weapon timers and capsule rules ──
{
  const s = G.start({ seed: 7, level: 4 }), g = s.game;
  const calm = () => { g.waveQ.forEach((w) => { w.t = 1e9; }); };
  const cap = (kind) => g.collect({ kind, x: 240, y: 600 });
  cap('blaster'); cap('blaster'); cap('blaster'); cap('blaster');
  t.check(g.pw.blaster === 3, `four blaster capsules gave power ${g.pw.blaster} (3 is the top)`);
  for (const [kind, secs] of [['laser', 7], ['rockets', 10]]) {
    cap(kind);
    t.check(g.weapon === kind && Math.abs(g.weaponT - secs) < 1e-9, `a ${kind} capsule: weapon ${g.weapon}, ${g.weaponT} s (should last ${secs} s)`);
    const ran = s.run(secs + 2, () => { calm(); return g.weapon === 'blaster'; });
    t.check(Math.abs(ran - secs) < 0.05 && g.weaponT === 0 && g.pw[kind] === 1, `the ${kind} ran for ${ran.toFixed(2)} s (should be ${secs}) and left power ${g.pw[kind]}`);
  }
  cap('rockets'); cap('rockets'); cap('rockets'); cap('rockets');
  t.check(g.pw.rockets === 3 && g.weaponT === 10, `four rocket capsules gave power ${g.pw.rockets} with ${g.weaponT} s left`);
  cap('laser');
  t.check(g.weapon === 'laser' && g.pw.rockets === 1 && g.pw.laser === 2, `switching to the laser: weapon ${g.weapon}, laser power ${g.pw.laser}, rockets kept power ${g.pw.rockets}`);
}

// ── 7 · STAR RUN ──
for (const level of [5, 10, 20]) {
  const r = botPlay(G, B, { level, seed: 1, mistake: false, limit: 30 });
  const g = r.shell.game;
  t.check(r.shell.bonus && g.bonusTotal === 40, `level ${level}: not a STAR RUN of 40 ships (${g.bonusTotal})`);
  t.check(r.cleared && r.shell.playTime <= 15 + 0.1, `level ${level} (STAR RUN): ${why(r)} — it should end by its 15 s timer`);
  t.check(r.deaths === 0, `level ${level} (STAR RUN): ${r.deaths} lives lost (you can't be hit there)`);
  t.check(g.bonusHits >= 20 && g.bonusHits <= 40, `level ${level} (STAR RUN): the expert hit ${g.bonusHits} of 40`);
  // and flying through everything without firing costs nothing
  const s = G.start({ seed: level, level }), g2 = s.game; let x = 30, d = 1;
  s.run(20, () => { x += d * 5; if (x > W - 30 || x < 30) d = -d; s.pointerMove(x, 340 + (x % 200)); return s.cleared > 0; });
  t.check(s.cleared === 1 && s.livesLost === 0 && g2.bonusHits === 0, `level ${level} (STAR RUN): flying through the ships without firing: cleared ${s.cleared}, lives lost ${s.livesLost}, hits ${g2.bonusHits}`);
}

// ── 8 · every level builds ──
{
  let fleets = 0, bosses = 0; const names = new Set();
  for (let level = 1; level <= 40; level++) {
    let s;
    try { s = G.start({ seed: level, level }); } catch (e) { t.fail(`level ${level}: starting it throws "${e.message}"`); continue; }
    const g = s.game;
    if (isBonus(level)) { t.check(g.bonus && g.waveQ.reduce((n, w) => n + w.members.length, 0) === 40, `level ${level}: the STAR RUN has ${g.waveQ.reduce((n, w) => n + w.members.length, 0)} ships`); continue; }
    if (isBoss(level)) {
      bosses++; names.add(g.boss?.kind);
      t.check(g.boss && g.boss.hp === g.boss.maxHp && g.boss.hp >= 100 && g.boss.hp <= 400 && !g.waveQ.length, `level ${level}: the boss has ${g.boss?.hp} hp`);
      continue;
    }
    fleets++;
    const n = g.waveQ.reduce((k, w) => k + w.members.length, 0);
    t.check(!g.boss && n === g.formationSize && n >= 20 && n <= 40, `level ${level}: a fleet of ${n} ships (formation size ${g.formationSize})`);
    const cells = new Set(g.waveQ.flatMap((w) => w.members.map((m) => m.a.row + ',' + m.a.col)));
    t.check(cells.size === n, `level ${level}: ${n - cells.size} ships share a place in the formation`);
    const lasers = g.waveQ.flatMap((w) => w.members).filter((m) => m.a.laserCarrier).length;
    t.check(lasers <= 1, `level ${level}: ${lasers} laser carriers in one fleet (one per five levels at most)`);
  }
  t.check(fleets === 28 && bosses === 4 && names.size === 4, `levels 1–40: ${fleets} fleets, ${bosses} bosses of ${names.size} kinds (28, 4 and 4 expected)`);
}

t.done(`fires only on Space or the mouse button; ${runs} levels (2 bosses) finished after a crash (${crashes} lives lost); comebacks, shield, twin fighter, lives, weapons and STAR RUN follow the rules`);

// node games/crypt-of-crowns/test.mjs
// Checks the hand-built crypts and plays the real Crypt of Crowns headless
// (tools/lib/headless.mjs) to prove:
//   1 · the crypt book: crypts 1–15 and the Crown Vault (16) are well formed: known map signs
//       only, one entrance, stairs (the crown in the vault), sealed walls, a key for every door, a
//       lever for every gate, patrols with room to walk, and every coin, chest and key reachable
//   2 · the timetable is fair: it repeats, no skeleton or spike ever reaches the entrance (where
//       you come back after a catch), and no patrol walks through a wall, door or gate
//   3 · every crypt can be finished FLAWLESSLY (never caught), which is what the Legends rule and
//       the Golden Egg ask for, and inside its par time; the vault then gives the crown
//   4 · every crypt can be finished after a real catch (the benchmark's bot walks into a skeleton
//       or spikes, then plays on) with the game's rules holding at every step; a catch costs one
//       life and puts you back at the entrance with your keys, doors and levers as they were
//   5 · the gold rooms (5 and 10) have nothing that can catch you and end on their 15 s timer
import { loadGame, reporter } from '../../tools/lib/headless.mjs';
import { botPlay, why } from '../../tools/lib/bot-play.mjs';
import { LEVELS } from './levels.js';
import { parse, skelAt, spikeUp, DIRS } from './sim.js';

const G = await loadGame('crypt-of-crowns');
const B = (await import('./bench.mjs')).default;
const t = reporter('crypt-of-crowns');
const FINAL = 15, SECRET = 16, BONUS = [5, 10];
const SIGNS = new Set('#=%@ECkDbBLGgMHh*tcTrlud. '.split(''));
const SOLID = '#= tLM';                                   // never walkable, whatever is open

// ── 1 · the crypt book ──
for (let L = 1; L <= SECRET; L++) {
  const def = LEVELS[L];
  if (!t.check(def && Array.isArray(def.map), `crypt ${L} is missing from levels.js`)) continue;
  const W = parse(def), at = W.at;
  const count = (ch) => def.map.join('').split('').filter((c) => ch.includes(c)).length;
  const bad = [...new Set(def.map.join(''))].filter((c) => !SIGNS.has(c));
  t.check(!bad.length, `crypt ${L}: unknown map sign(s) ${JSON.stringify(bad.join(''))}`);
  t.check(count('@') === 1, `crypt ${L}: ${count('@')} entrances (@)`);
  t.check(!!def.name, `crypt ${L} has no name`);
  t.check(!!def.bonus === BONUS.includes(L) && !!def.secret === (L === SECRET), `crypt ${L}: bonus/secret flags don't match the game's level list`);
  if (def.bonus) t.check(!count('E') && !count('C') && !W.skels.length && !W.spikes.length, `crypt ${L} (gold room) has stairs, a crown or something that can catch you`);
  else if (def.secret) t.check(count('C') === 1 && !count('E'), `crypt ${L} (the vault): ${count('C')} crowns, ${count('E')} stairs`);
  else t.check(count('E') === 1 && !count('C') && def.par > 0, `crypt ${L}: ${count('E')} stairs, ${count('C')} crowns, par ${def.par}`);
  t.check(count('k') >= count('D') && count('b') >= count('B'), `crypt ${L}: ${count('D')} gold / ${count('B')} blue doors but only ${count('k')} / ${count('b')} keys`);
  t.check(!count('Gg') || count('L') >= 1, `crypt ${L}: gates for lever L but no lever L`);
  t.check(!count('Hh') || count('M') >= 1, `crypt ${L}: gates for lever M but no lever M`);
  t.check(!count('L') || count('Gg') >= 1, `crypt ${L}: lever L works no gate`);
  t.check(!count('M') || count('Hh') >= 1, `crypt ${L}: lever M works no gate`);
  // sealed: nothing you can stand on touches the outside of the map
  // reachable: flood from the entrance with every door, gate and cracked wall open
  const seen = new Set([W.start.x + ',' + W.start.y]), q = [[W.start.x, W.start.y]];
  let leak = null;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, c = at(nx, ny);
      if (c === ' ') { leak = leak || [x, y]; continue; }
      if (SOLID.includes(c) || seen.has(nx + ',' + ny)) continue;
      seen.add(nx + ',' + ny); q.push([nx, ny]);
    }
  }
  t.check(!leak, `crypt ${L}: the floor at (${leak}) is open to the outside of the map`);
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    const c = at(x, y);
    if ('ckbTEC'.includes(c) && c !== ' ') t.check(seen.has(x + ',' + y), `crypt ${L}: the '${c}' at (${x}, ${y}) can't be reached`);
    if (c === 'L' || c === 'M' || c === '%') t.check(DIRS.some(([dx, dy]) => seen.has(x + dx + ',' + (y + dy))), `crypt ${L}: the '${c}' at (${x}, ${y}) can't be reached from any side`);
  }
  t.check(W.skels.length === count('rlud'), `crypt ${L}: ${count('rlud')} skeletons on the map, ${W.skels.length} patrols built`);
  for (const sk of W.skels) t.check(sk.route.length >= 2, `crypt ${L}: the skeleton at (${sk.route[0]}) has nowhere to walk`);

  // ── 2 · the timetable ──
  const P = W.P;
  t.check(Number.isInteger(P) && P >= 1 && P <= 100000, `crypt ${L}: the timetable repeats every ${P} ticks`);
  let wrong = null;
  for (let T = 0; T < Math.min(P, 5000) && !wrong; T++) {
    for (const sk of W.skels) {
      const a = skelAt(sk, T), b = skelAt(sk, T + P);
      if (a.from[0] !== b.from[0] || a.from[1] !== b.from[1] || a.to[0] !== b.to[0] || a.to[1] !== b.to[1]) wrong = `a patrol does not repeat after ${P} ticks`;
      if (Math.abs(a.from[0] - a.to[0]) + Math.abs(a.from[1] - a.to[1]) > 1) wrong = `a skeleton jumps from (${a.from}) to (${a.to}) on tick ${T}`;
      for (const [x, y] of [a.from, a.to]) {
        if ('#= tLM%DBGgHh'.includes(at(x, y))) wrong = `a skeleton walks through '${at(x, y)}' at (${x}, ${y})`;
        if (x === W.start.x && y === W.start.y) wrong = `a skeleton walks over the entrance on tick ${T} (you come back there after a catch)`;
      }
    }
  }
  for (const sp of W.spikes) {
    if (sp.x === W.start.x && sp.y === W.start.y) wrong = 'the entrance is a spike trap';
    let up = 0; for (let T = 0; T < 24; T++) if (spikeUp(sp, T)) up++;
    if (up !== 10) wrong = `the spikes at (${sp.x}, ${sp.y}) are up ${up} ticks in 24 (10 is the beat)`;
  }
  t.check(!wrong, `crypt ${L}: ${wrong}`);
}

// ── 3 · flawless, inside par ──
let flawless = 0;
for (let L = 1; L <= SECRET; L++) {
  if (BONUS.includes(L)) continue;
  const r = botPlay(G, B, { level: L, seed: 1, mistake: false });
  const g = r.shell.game;
  if (!t.check(r.cleared, `crypt ${L}: the expert did not finish it (${why(r)})`)) continue;
  t.check(r.deaths === 0, `crypt ${L}: the expert was caught ${r.deaths} time(s) on a careful run (a flawless run must be possible)`);
  if (r.deaths === 0) flawless++;
  if (L === SECRET) t.check(r.shell.legend === true, 'the Crown Vault was finished but the crown was not given');
  else {
    t.check(!r.shell.legend, `crypt ${L} gave the crown`);
    t.check(g.time <= LEVELS[L].par, `crypt ${L}: the expert's careful run took ${g.time.toFixed(1)} s, over the par of ${LEVELS[L].par} s`);
    t.check(g.p.x === g.W.exit.x && g.p.y === g.W.exit.y, `crypt ${L}: cleared away from the stairs, at (${g.p.x}, ${g.p.y})`);
  }
}

// ── 4 · finishable after a real catch ──
let runs = 0, catches = 0;
for (let L = 1; L <= FINAL; L++) {
  if (BONUS.includes(L)) continue;
  const W0 = parse(LEVELS[L]);
  if (!W0.skels.length && !W0.spikes.length) continue;      // nothing in this crypt can catch you
  for (const seed of [1, 2]) {
    let prev = null, bad = null, back = 0;
    const r = botPlay(G, B, { level: L, seed, each: (g, s) => {
      const inv = `${[...g.st.keys].sort()}|${[...g.st.doors].sort()}|${[...g.st.secrets].sort()}|${g.st.levers.L}${g.st.levers.M}|${g.st.gold},${g.st.blue}`;
      if (prev && s.livesLost > prev.lost) {                 // first step back in play after a catch
        back++;
        if (s.livesLost - prev.lost !== 1) bad = `a catch cost ${s.livesLost - prev.lost} lives`;
        else if (g.p.x !== g.W.start.x || g.p.y !== g.W.start.y) bad = `after a catch the player is at (${g.p.x}, ${g.p.y}), not the entrance`;
        else if (inv !== prev.inv) bad = `a catch changed the keys, doors or levers (${prev.inv} → ${inv})`;
        else if (g.caught !== s.livesLost) bad = `the crypt counted ${g.caught} catches for ${s.livesLost} lives lost`;
      }
      prev = { lost: s.livesLost, inv };
      return bad;
    } });
    runs++; catches += r.deaths;
    if (!t.check(r.cleared, `crypt ${L} seed ${seed}: ${why(r)} (${r.deaths} catches)`)) continue;
    t.check(r.mistakeMade && r.mistakeCost >= 1 && back >= 1, `crypt ${L} seed ${seed}: the test's catch didn't cost a life`);
  }
}

// ── 5 · the gold rooms ──
for (const L of BONUS) {
  const r = botPlay(G, B, { level: L, seed: 1, mistake: false, limit: 30 });
  const g = r.shell.game;
  t.check(r.cleared && Math.abs(r.shell.playTime - 15) < 0.1, `crypt ${L} (gold room): ended after ${r.shell.playTime.toFixed(1)} s (${why(r)}); it should end on the 15 s timer`);
  t.check(r.deaths === 0, `crypt ${L} (gold room): ${r.deaths} catches in a room with nothing that can catch you`);
  t.check(g.coinsHere >= 10, `crypt ${L} (gold room): only ${g.coinsHere} gold grabbed in 15 s`);
}

t.done(`16 crypts well formed with fair timetables; ${flawless} of 14 finished flawlessly inside par (the vault gives the crown); ${runs} runs finished after a catch (${catches} catches); gold rooms end on their timer`);

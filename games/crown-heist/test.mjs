// node games/crown-heist/test.mjs
// Plays the real Crown Heist headless (tools/lib/headless.mjs) and proves, floor by floor:
//   1 · every floor can be finished, FLAWLESSLY: for each of floors 1–15 there is a known way to
//       take the crown and reach the stairs without being caught (routes.js, found by
//       route-search.mjs and kept by find-routes.mjs). The test plays it in the real game, key
//       for key, from a fresh start, with the game's rules checked after every step. A flawless
//       run of every floor is what the Golden Egg asks for.
//   2 · the ways use only what you start a floor with (2–3 coins, 1–2 smoke bombs): no gold picked
//       up on the way is needed, so they still work when a floor is replayed after a catch
//   3 · a catch costs one life and puts everything back: you, the guards, the crown, the gate
//   4 · the Treasure Vaults (5, 10) and the Empty Throne (16) have nothing that can catch you
//   5 · floors 6–9, 12 and 13 are eased (19 Nov 2026): their guards move 15% slower, because an
//       average player lost 4–9 lives on each of them (floor 14 is not: slower guards block it)
// If a way stops working after a change to the game, run `node games/crown-heist/find-routes.mjs`
// (slow: it works every floor out again); a floor it can't find a way for is a floor to look at.
import { loadGame, reporter, STEP } from '../../tools/lib/headless.mjs';
import { ROUTES } from './routes.js';
import { KEY } from './route-search.mjs';

const G = await loadGame('crown-heist');
const B = (await import('./bench.mjs')).default;
const t = reporter('crown-heist');
const unpack = (text) => { const out = []; for (const part of text.split('.')) { const k = parseInt(part[0], 36), n = part.length > 1 ? +part.slice(1) : 1; for (let i = 0; i < n; i++) out.push(k); } return out; };
const press = (g, s, k) => {
  s.hold([...(k & KEY.up ? ['up'] : []), ...(k & KEY.left ? ['left'] : []), ...(k & KEY.right ? ['right'] : [])]);
  if (k & KEY.use) g.use();
  if (k & KEY.coin) g.throwCoin();
  if (k & KEY.smoke) g.dropSmoke();
};

// ── 1, 2 · a flawless way out of every floor ──
let floors = 0, longest = 0;
for (let level = 1; level <= 15; level++) {
  if (level === 5 || level === 10) continue;
  const at = Object.keys(ROUTES).find((k) => k.startsWith(level + '@'));
  if (!t.check(!!at, `floor ${level}: no known way out from a fresh start in routes.js (run find-routes.mjs)`)) continue;
  const keys = unpack(ROUTES[at]), s = G.start({ seed: 1, level }), g = s.game;
  const start = { ...g.ammo };
  s.hold([]); s.tick();                                       // the ways start one engine step into a try (as a try after a catch does)
  let coins = 0, smoke = 0, bad = null, grabbedAt = -1;
  for (let i = 0; i < keys.length && !s.cleared && !s.livesLost && !bad; i++) {
    if (keys[i] & KEY.coin) coins++;
    if (keys[i] & KEY.smoke) smoke++;
    press(g, s, keys[i]);
    s.tick();
    if (g.has && grabbedAt < 0) grabbedAt = i * STEP;
    if (s.state === 'playing') bad = B.invariants(g, s);
  }
  floors++; longest = Math.max(longest, keys.length * STEP);
  t.check(!bad, `floor ${level}: rule broken while playing the known way — ${bad}`);
  t.check(s.cleared === 1 && s.livesLost === 0, `floor ${level}: the known way out no longer works (${s.livesLost ? 'caught' : 'not out'} at (${Math.floor(g.p.x)}, ${Math.floor(g.p.y)}), crown ${g.has ? 'in hand' : 'not taken'}); run find-routes.mjs`);
  t.check(grabbedAt > 0, `floor ${level}: the way out never lifted the crown`);
  t.check(coins <= start.coin && smoke <= start.smoke, `floor ${level}: the way uses ${coins} coins and ${smoke} smoke bombs; you start with ${start.coin} and ${start.smoke}`);
  t.check(keys.length * STEP - grabbedAt <= g.f.seal, `floor ${level}: the way takes ${(keys.length * STEP - grabbedAt).toFixed(0)} s with the crown, the vault seals after ${g.f.seal} s`);
}

// ── 3 · a catch puts everything back ──
for (const level of [1, 6, 11]) {
  const s = G.start({ seed: 2, level, unlimited: true }), g = s.game;
  const b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
  const first = { p: { ...g.p }, guards: g.guards.map((o) => [o.x, o.y, o.state]), ammo: { ...g.ammo } };
  let lost = false;
  for (let i = 0; i < 90 / STEP && !lost; i++) { if (s.state === 'playing') { b.t = i * STEP; lost = B.mistake(g, s, b); } s.tick(); }
  if (!t.check(lost && s.livesLost === 1, `floor ${level}: walking into the nearest guard cost ${s.livesLost} lives in 90 s (should be 1)`)) continue;
  s.run(4, () => s.state === 'playing');
  t.check(s.state === 'playing' && Math.hypot(g.p.x - first.p.x, g.p.y - first.p.y) < 0.2, `floor ${level}: after a catch the player is at (${g.p.x.toFixed(1)}, ${g.p.y.toFixed(1)}), not back at the entrance`);
  t.check(!g.has && !g.gateShut && !g.leverOn && g.ammo.coin === first.ammo.coin && g.ammo.smoke === first.ammo.smoke, `floor ${level}: after a catch the crown, gate, lever or pockets are not as at the start`);
  t.check(g.guards.every((o, i) => Math.hypot(o.x - first.guards[i][0], o.y - first.guards[i][1]) < 0.3 && !o.alert), `floor ${level}: after a catch the guards are not back at their posts, calm`);
}

// ── 4 · vaults and the Empty Throne: nothing can catch you ──
for (const level of [5, 10, 16]) {
  const s = G.start({ seed: 1, level }), g = s.game;
  t.check(g.guards.length === 0 || g.bonus || g.secret, `floor ${level} has guards on duty`);
  const b = { skill: 1, rand: () => 0.5, t: 0, level, mem: {} };
  let bad = null;
  for (let i = 0; i < 70 / STEP && !s.cleared && !bad; i++) { if (s.state === 'playing') { b.t = i * STEP; B.bot(g, s, b); } s.tick(); if (s.state === 'playing') bad = B.invariants(g, s); }
  t.check(!bad, `floor ${level}: rule broken — ${bad}`);
  t.check(s.cleared === 1 && s.livesLost === 0, `floor ${level}: ${s.cleared ? '' : 'not finished; '}${s.livesLost} lives lost on a floor with nothing that can catch you`);
}

// ── 5 · the eased floors: guards on 6–9, 12 and 13 walk 15% slower than their kind does elsewhere ──
{
  const WALK = { skeleton: 0.80, knight: 0.92 };
  const pace = (level) => {                         // the fastest any calm guard walks, as a share of its kind's walk
    const s = G.start({ seed: 1, level, unlimited: true }), g = s.game;
    let top = 0;
    for (let i = 0; i < 6 / STEP; i++) {
      const was = g.guards.map((o) => [o.x, o.y]);
      s.hold([]); s.tick();
      if (s.state !== 'playing') continue;
      g.guards.forEach((o, k) => { if (!o.dead && o.state === 'patrol' && !o.alert) top = Math.max(top, Math.hypot(o.x - was[k][0], o.y - was[k][1]) / STEP / WALK[o.kind]); });
    }
    return top;
  };
  for (const level of [6, 7, 8, 9, 12, 13]) { const v = pace(level); t.check(v > 0.8 && v < 0.86, `floor ${level}: calm guards walk at ${(v * 100).toFixed(0)}% of their usual pace (should be 85%)`); }
  for (const level of [4, 11, 14, 15]) { const v = pace(level); t.check(v > 0.99 && v < 1.01, `floor ${level}: calm guards walk at ${(v * 100).toFixed(0)}% of their usual pace (should be 100%)`); }
}

t.done(`${floors} floors each have a flawless way out that plays in the real game (the longest takes ${longest.toFixed(0)} s); a catch puts everything back; vaults and the Empty Throne are safe; guards are 15% slower on floors 6–9, 12 and 13`);

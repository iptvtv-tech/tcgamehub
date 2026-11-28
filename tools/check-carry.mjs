// node tools/check-carry.mjs
// Moving day (tcgamehub.win → tcarcade.com): saved progress travels in the link (#carry=…).
// assets/js/carry-out.js packs it on the old address; assets/js/theme-boot.js merges it in on the
// new one. Players must never lose anything, and a crown must never be taken away. Checks:
//   1 · a fresh browser on the new address gets every saved key exactly as it was
//   2 · merging into a browser that already has progress only ever adds: higher bests, levels,
//       plays and tokens; earlier badge / purchase times; every crystal; the earliest crowning
//   3 · games reset since the old save don't get their old best back; this browser's own name,
//       code and settings stay, the old ones fill gaps
//   4 · the link: taken out of the address bar, bad links ignored, odd keys never written
//   5 · carry-out.js: where it sends you, sends progress once (always when asked at /carry/),
//       and trims very long offline score lists so the link stays short
//   6 · random saves: nothing in either save is ever lost by a merge
//   7 · sw.js and the pages wire it up (carry page cached, theme-boot first on every page)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const problems = [];
const ok = (cond, what) => { if (!cond) problems.push(what); };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const BOOT = readFileSync(new URL('../assets/js/theme-boot.js', import.meta.url), 'utf8');
const OUT = readFileSync(new URL('../assets/js/carry-out.js', import.meta.url), 'utf8');

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, dump: () => Object.fromEntries(m),
  };
}
const Carry = (() => { const module = { exports: {} }; vm.runInNewContext(BOOT, { module, globalThis: {}, atob, TextDecoder, JSON, Math, Date, String, Array, Object, Uint8Array, Infinity, isFinite }); return module.exports; })();

/** run carry-out.js at an old-address URL; returns where it sent the browser */
function carryOut(href, store) {
  const u = new URL(href);
  let went = null;
  const location = { pathname: u.pathname, search: u.search, replace: (to) => { went = to; } };
  vm.runInNewContext(OUT, { location, localStorage: store, URLSearchParams, TextEncoder, btoa, JSON, String, Date, Math });
  return went;
}
const bundleOf = (link) => { const m = /#carry=([A-Za-z0-9_-]+)$/.exec(link || ''); return m ? JSON.parse(Carry.decode(m[1])) : null; };

const OLD_SAVE = {
  best: { 'neon-snake': 120, 'galactic-alien-shooter': 9000 }, maxLevel: { 'neon-snake': 7 }, plays: { 'neon-snake': 14, 'crown-heist': 3 },
  ach: { 'neon-snake:first': 1000, 'g:grand': 5000 }, resets: { 'galactic-alien-shooter': 1, 'pinball-blast': 1 },
  tokens: { earned: 640 }, owned: { 'theme-ice': 2000 }, local: [{ game: 'neon-snake', score: 120, name: 'Zoë 🧊', at: 1 }],
  settings: { muted: true, music: false, theme: 'ice', avatar: 'yeti' }, name: 'Zoë 🧊',
  legend: { at: 3000, games: ['the-vault-job', 'heist-planner'], code: 'LEGEND-ABCDE7', name: 'Zoë 🧊', codeGames: 2, crownAt: 4000 },
  daily: { last: '2026-11-20', streak: 4 }, tokenDay: { date: '2026-11-27', n: 40 }, rev: 30, syncedRev: 30,
};

// 1 · fresh browser
{
  const old = memStore({ 'arcade:v1': JSON.stringify(OLD_SAVE), 'arcade:theme': 'ice', 'arcade:zone-done': '{"1":1}', 'arcade:retro-played': '["a","b"]', 'other': 'x' });
  const link = carryOut('https://tcgamehub.win/games/neon-snake/?daily=1', old);
  ok(link?.startsWith('https://tcarcade.com/games/neon-snake/?daily=1#carry='), `goes to the same page on the new address (went to ${link?.slice(0, 80)})`);
  const b = bundleOf(link);
  ok(b && b.v === 1, 'the link holds a bundle');
  ok(!('other' in (b?.k || {})), 'only arcade:* keys travel');
  const fresh = memStore();
  Carry.apply(b, fresh);
  const got = fresh.dump();
  for (const k of ['arcade:v1', 'arcade:theme', 'arcade:zone-done', 'arcade:retro-played']) eq(got[k], old.getItem(k), `fresh browser: ${k} copied exactly`);
  ok(JSON.parse(got['arcade:v1']).name === 'Zoë 🧊', 'a name with accents and emoji survives the link');
  ok(!!got['arcade:carried'], 'the new browser remembers progress came across');
  ok(old.getItem('arcade:carried-out'), 'the old browser remembers it sent it');
}

// 2 + 3 · merging into a browser that already has progress
{
  const mine = {
    best: { 'neon-snake': 90, 'galactic-alien-shooter': 50, 'turbo-rush': 3000 }, maxLevel: { 'neon-snake': 9 }, plays: { 'neon-snake': 2 },
    ach: { 'neon-snake:first': 3000, 'turbo-rush:x': 10 }, resets: { 'galactic-alien-shooter': 2, 'pinball-blast': 1 },
    tokens: { earned: 100 }, owned: { 'theme-ice': 9000, 'avatar-cat': 50 }, local: [{ game: 'turbo-rush', score: 3000, name: 'Zed', at: 9 }, { game: 'neon-snake', score: 120, name: 'Zoë 🧊', at: 1 }],
    settings: { muted: false, music: true }, name: 'Zed', progressCode: null,
    legend: { at: 6000, games: ['heist-planner', 'crown-heist'], code: 'LEGEND-QQQQQ1', name: 'Zed', codeGames: 1, crownAt: 8000 },
    daily: { last: '2026-11-28', streak: 1 }, tokenDay: { date: '2026-11-27', n: 70 }, rev: 3, syncedRev: 3,
  };
  const m = Carry.mergeSave(mine, OLD_SAVE);
  eq(m.best['neon-snake'], 120, 'higher best kept');
  eq(m.best['turbo-rush'], 3000, 'a best only this browser had stays');
  eq(m.best['galactic-alien-shooter'], 50, 'a game reset since the old save keeps its new best (old 9000 not restored)');
  eq(m.maxLevel['neon-snake'], 9, 'higher level kept');
  eq(m.plays, { 'neon-snake': 14, 'crown-heist': 3 }, 'plays: the higher count for each game');
  eq(m.tokens.earned, 640, 'lifetime tokens: the higher total');
  eq(m.owned, { 'theme-ice': 2000, 'avatar-cat': 50 }, 'owned items: all of them, earliest purchase time');
  eq(m.ach['neon-snake:first'], 1000, 'badges: earliest time');
  ok(m.ach['g:grand'] && m.ach['turbo-rush:x'], 'badges from both browsers');
  eq(m.local.length, 2, 'offline scores: both lists, no doubles');
  eq(m.name, 'Zed', 'this browser keeps its own name');
  eq(m.settings, { muted: false, music: true, theme: 'ice', avatar: 'yeti' }, 'settings: this browser wins, the old ones fill gaps');
  eq([...m.legend.games].sort(), ['crown-heist', 'heist-planner', 'the-vault-job'], 'every crystal from both');
  eq(m.legend.crownAt, 4000, 'the earliest crowning survives (the four-crystal rule depends on it)');
  eq(m.legend.at, 3000, 'earliest Legend date');
  eq(m.legend.code, 'LEGEND-ABCDE7', 'the code holding the most crystals becomes the code');
  eq(m.daily, { last: '2026-11-28', streak: 1 }, 'the more recent daily streak');
  eq(m.tokenDay, { date: '2026-11-27', n: 70 }, "same day's tokens: the higher count (the daily cap still holds)");
  ok(m.rev > 30 && m.syncedRev === 3, 'a new revision, so a Legend code saves the merged progress online');
  // this browser has no Legend record: the old one comes across whole
  eq(Carry.mergeSave({ ...mine, legend: null }, OLD_SAVE).legend, OLD_SAVE.legend, 'Legend record carried when this browser has none');
  // the other keys
  eq(Carry.mergeKey('arcade:zone-done', '{"2":1}', '{"1":1}'), '{"1":1,"2":1}', 'zone celebrations: both');
  eq(Carry.mergeKey('arcade:retro-played', '["b","c"]', '["a","b"]'), '["b","c","a"]', 'Retro Vault games: both');
  eq(Carry.mergeKey('arcade:theme', 'neon', 'ice'), null, "this browser's theme stays");
  eq(Carry.mergeKey('arcade:theme', null, 'ice'), 'ice', 'the old theme fills a gap');
  eq(Carry.mergeKey('arcade:v1', '{"best":{"a":1}}', 'not json'), null, 'a broken old save changes nothing');
}

// 4 · the link
{
  let replaced = null;
  const hist = { state: null, replaceState: (s, t, u) => { replaced = u; } };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const got = Carry.takeFromHash({ hash: `#carry=${enc({ v: 1, k: {} })}`, pathname: '/games/x/', search: '?a=1' }, hist);
  eq(got, { v: 1, k: {} }, 'reads the bundle');
  eq(replaced, '/games/x/?a=1', 'takes it out of the address bar');
  eq(Carry.takeFromHash({ hash: '#carry=%%%', pathname: '/', search: '' }, hist), null, 'a broken link is ignored');
  eq(Carry.takeFromHash({ hash: '#top', pathname: '/', search: '' }, hist), null, 'no carry, nothing done');
  const s = memStore({ 'arcade:theme': 'neon' });
  Carry.apply({ v: 1, k: { 'arcade:v1': '{}', 'evil': 'x', 'arcade:carried': 'x', 'arcade:carry-pending': 'x', 'arcade:BAD KEY': 'x' } }, s);
  ok(!s.getItem('evil') && !s.getItem('arcade:BAD KEY') && !s.getItem('arcade:carry-pending'), 'odd keys are never written');
  eq(Carry.apply({ v: 2, k: { 'arcade:v1': '{}' } }, memStore()), 0, 'an unknown bundle version is ignored');
}

// 5 · carry-out.js
{
  eq(carryOut('https://tcgamehub.win/', memStore()), 'https://tcarcade.com/', 'no progress: just goes');
  const st = memStore({ 'arcade:v1': '{"best":{"a":1}}' });
  ok(bundleOf(carryOut('https://tcgamehub.win/', st)), 'first visit sends progress');
  eq(carryOut('https://tcgamehub.win/games/', st), 'https://tcarcade.com/games/', 'once sent, later visits just go');
  ok(bundleOf(carryOut('https://tcgamehub.win/carry/', st))?.k['arcade:v1'], 'asked at /carry/: always sends');
  ok(carryOut('https://tcgamehub.win/carry/?to=/games/neon-snake/', st).startsWith('https://tcarcade.com/games/neon-snake/#carry='), '/carry/?to= goes to that page');
  ok(carryOut('https://tcgamehub.win/carry/?to=//evil.example/', st).startsWith('https://tcarcade.com/#carry='), '/carry/?to= never leaves the arcade');
  ok(carryOut('https://tcgamehub.win/carry/?to=https://evil.example/', st).startsWith('https://tcarcade.com/#carry='), '/carry/?to= takes paths only');
  const big = { best: { a: 1 }, local: Array.from({ length: 600 }, (_, i) => ({ game: `game-${i % 30}`, score: i * 1000, name: 'Player', at: 1764000000000 + i })) };
  const link = carryOut('https://tcgamehub.win/', memStore({ 'arcade:v1': JSON.stringify(big) }));
  ok(link.length < 31000, `a long score list is trimmed so the link stays short (${link.length} characters)`);
  const kept = JSON.parse(bundleOf(link).k['arcade:v1']);
  ok(kept.best.a === 1 && kept.local.length > 0 && kept.local.at(-1).at === big.local.at(-1).at, 'trimming keeps bests and the newest scores');
}

// 6 · random saves: a merge never loses anything
{
  let seed = 11; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const map = () => Object.fromEntries(ids.filter(() => rnd(2)).map((id) => [id, rnd(1000)]));
  for (let n = 0; n < 3000; n++) {
    const a = { best: map(), maxLevel: map(), plays: map(), tokens: { earned: rnd(5000) }, owned: map(), ach: map(), resets: {} };
    const b = { best: map(), maxLevel: map(), plays: map(), tokens: { earned: rnd(5000) }, owned: map(), ach: map(), resets: {} };
    if (rnd(3) === 0) a.legend = { at: rnd(100), games: ids.filter(() => rnd(2)), crownAt: rnd(2) ? rnd(100) : undefined };
    if (rnd(3) === 0) b.legend = { at: rnd(100), games: ids.filter(() => rnd(2)), crownAt: rnd(2) ? rnd(100) : undefined };
    const m = Carry.mergeSave(a, b);
    for (const key of ['best', 'maxLevel', 'plays', 'tokens']) for (const s of [a, b]) for (const [id, v] of Object.entries(s[key])) {
      if (!(m[key][id] >= v)) { problems.push(`random merge ${n}: ${key}.${id} fell to ${m[key][id]} (had ${v})`); break; }
    }
    for (const key of ['owned', 'ach']) for (const s of [a, b]) for (const id of Object.keys(s[key])) if (!(id in m[key])) problems.push(`random merge ${n}: lost ${key}.${id}`);
    for (const s of [a, b]) for (const g of s.legend?.games || []) if (!m.legend?.games.includes(g)) problems.push(`random merge ${n}: lost crystal ${g}`);
    const crowns = [a, b].map((s) => s.legend?.crownAt).filter((x) => typeof x === 'number');
    if (crowns.length && m.legend?.crownAt !== Math.min(...crowns)) problems.push(`random merge ${n}: crown date ${m.legend?.crownAt}, should be ${Math.min(...crowns)}`);
    if (problems.length > 10) break;
  }
}

// 7 · wiring
{
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  ok(/'carry\/'/.test(sw) && /'assets\/js\/carry-out\.js'/.test(sw), 'sw.js saves the carry page and its script up front');
  ok(/NEW_ORIGIN = 'https:\/\/tcarcade\.com'/.test(sw), 'sw.js knows the new address');
  ok(/OLD = 'https:\/\/tcgamehub\.win'/.test(BOOT) && /NEW = 'https:\/\/tcarcade\.com'/.test(OUT), 'theme-boot.js and carry-out.js agree on the two addresses');
  const carryPage = readFileSync(new URL('../carry/index.html', import.meta.url), 'utf8');
  ok(/src="\/assets\/js\/carry-out\.js"/.test(carryPage), 'the carry page loads carry-out.js from the site root');
  ok(/name="robots" content="noindex"/.test(carryPage), 'the carry page is kept out of search');
  // every page that runs site code loads theme-boot.js before any module, so the merge happens first
  const pages = ['index.html', 'about/index.html', 'shop/index.html', 'hall-of-legends/index.html', 'crown-room/index.html', 'leaderboard/index.html', 'retro-vault/index.html', 'games/index.html'];
  for (const id of readdirSync(new URL('../games/', import.meta.url))) if (!id.startsWith('_') && existsSync(new URL(`../games/${id}/game.js`, import.meta.url))) pages.push(`games/${id}/index.html`);
  for (const p of pages) {
    const html = readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    const boot = html.indexOf('theme-boot.js'), mod = html.indexOf('type="module"');
    ok(boot > 0 && (mod < 0 || boot < mod), `${p}: theme-boot.js loads before the page's modules`);
  }
}

if (problems.length) {
  console.log(`check-carry: ${problems.length} problem(s)`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('check-carry: progress carries from tcgamehub.win to tcarcade.com without losing anything ✓');

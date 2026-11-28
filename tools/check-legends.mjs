#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  LEGENDS RULES CHECK — chapters, crowns and "a crown is never taken away".
//    node tools/check-legends.mjs            the rules, on made-up Hall histories (no network)
//    node tools/check-legends.mjs --live     also the real Hall of Legends (needs the arcade online)
//
//  Proves, with the site's own code (games.js chapters(), legends.js crownsFrom / hallPeople):
//    • chapters are six zones each (1–6, 7–12, …), every chapter has a crown with its own name,
//      and every Legends zone has its crystal (EGGS in eggs.js) and its crystal badge (crownN)
//    • a crown needs exactly its chapter's six crystals, and a chapter with fewer than six Legends
//      games has no crown to win yet
//    • the two older Frost Crown rules still crown the players who won under them: the crystals of
//      Zones 1–4 before CROWN_OF_FOUR_UNTIL, and of Zones 1–5 before CROWN_OF_FIVE_UNTIL
//    • NEVER TAKEN AWAY: on thousands of made-up histories (players signing the Hall in any order,
//      before and after both cut-offs), a player's crowns only ever grow as they sign more, and
//      anyone the rules of the day crowned at any moment is still crowned now
//    • --live: every crown holder in the real Hall is listed, with when they were crowned
//  Exit code 1 on any failure.
// ─────────────────────────────────────────────────────────────
import { chapters, crownOf, CROWNS, CHAPTER_ZONES, ZONES, GLOBAL_ACHIEVEMENTS, legendZones,
  CROWN_OF_FOUR_UNTIL, CROWN_OF_FIVE_UNTIL, OLD_CROWN_EGGS, FIVE_CROWN_EGGS } from '../assets/js/games.js';
import { crownsFrom, hallPeople } from '../assets/js/legends.js';
import { EGGS } from '../assets/js/eggs.js';

const live = process.argv.includes('--live');
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
const t0 = Date.now();
const DAY = 86400000;
const date = (t) => new Date(t).toISOString().slice(0, 10);

// ── 1. chapters, crowns, crystals ──
const chs = chapters();
check(chs.length >= 1 && chs[0].crown.name === 'Frost Crown', 'Chapter 1\'s crown should be the Frost Crown');
for (const ch of chs) {
  check(ch.zones.every((z) => z.n >= ch.from && z.n <= ch.to) && ch.to - ch.from + 1 === CHAPTER_ZONES, `chapter ${ch.n} should be Zones ${ch.from}–${ch.to}`);
  check(!!ch.crown.name, `chapter ${ch.n} has no crown name`);
  check(ch.complete === (ch.legendZones.length === CHAPTER_ZONES), `chapter ${ch.n}: complete should mean six Legends games`);
}
check(new Set(CROWNS.map((c) => c.name)).size === CROWNS.length, 'two crowns share a name');
check(crownOf(99).name && crownOf(99).working, 'a chapter past the crown list should get a placeholder crown');
for (const z of legendZones()) {
  check(!!EGGS[z.n]?.name, `Zone ${z.n} (${z.legendGame}) has no crystal in EGGS (eggs.js)`);
  check(GLOBAL_ACHIEVEMENTS.some((a) => a.id === `crown${z.n}`), `Zone ${z.n} has no crystal badge crown${z.n} in GLOBAL_ACHIEVEMENTS`);
}
check(GLOBAL_ACHIEVEMENTS.some((a) => a.id === 'grand'), 'the Frost Crown badge (grand) is missing');
check(chs[0].complete, 'Chapter 1 should be complete (Zones 1–6 all have a Legends game)');
check(CROWN_OF_FOUR_UNTIL < CROWN_OF_FIVE_UNTIL, 'the four-crystal rule must end before the five-crystal rule');

// ── 2. the rules, case by case ──
const legendOf = new Map(ZONES.filter((z) => z.legendGame).map((z) => [z.n, z.legendGame]));
const zonesAt = (pairs) => new Map(pairs);                        // [[zone, time], …]
const crowned = (pairs, c = 1) => crownsFrom(zonesAt(pairs)).has(c);
const before4 = CROWN_OF_FOUR_UNTIL - DAY, between = CROWN_OF_FOUR_UNTIL + DAY, after5 = CROWN_OF_FIVE_UNTIL + DAY;
const span = (n, t) => Array.from({ length: n }, (_, i) => [i + 1, t + i * 1000]);
check(crowned(span(4, before4 - 10000)), 'Zones 1–4 all won before 30 Oct 2026 should keep the Frost Crown (the four-crystal rule)');
check(!crowned(span(4, between)), 'Zones 1–4 won after 30 Oct 2026 should not be a crown on their own');
check(crowned(span(5, between)), 'Zones 1–5 all won before the chapters release should keep the Frost Crown (the five-crystal rule)');
check(!crowned([...span(4, between), [5, after5]]), 'Zones 1–5 finished after the chapters release should not be a crown without Zone 6');
check(crowned([...span(4, between), [5, after5], [6, after5 + DAY]]), 'all six crystals of Chapter 1 should win the Frost Crown');
check(!crowned([[1, after5], [2, after5], [3, after5], [4, after5], [6, after5]]), 'five of the six (Zone 5 missing) should not win the Frost Crown');
{
  const held = crownsFrom(zonesAt([...span(6, after5)]));
  check(held.get(1) === after5 + 5000, `a crown's date should be when its last crystal came in (${held.get(1)})`);
  const legacy = crownsFrom(zonesAt([...span(5, between), [6, after5]]));
  check(legacy.get(1) === between + 4000, 'a crown won under an older rule keeps its older date');
}
// a later chapter: no crown until all six of its zones have a Legends game
for (const ch of chs.filter((c) => c.n > 1)) {
  const all = Array.from({ length: CHAPTER_ZONES }, (_, i) => [ch.from + i, after5]);
  check(crowned(all, ch.n) === ch.complete, `the ${ch.crown.name} should ${ch.complete ? '' : 'not '}be winnable (chapter ${ch.n} has ${ch.legendZones.length} of ${CHAPTER_ZONES} Legends games)`);
}
// with a made-up complete Chapter 2, its crown needs exactly Zones 7–12
{
  const fake = { n: 2, complete: true, legendZones: Array.from({ length: CHAPTER_ZONES }, (_, i) => ({ n: 7 + i })) };
  const has = (zs) => fake.complete && fake.legendZones.every((z) => zs.has(z.n));
  check(has(new Map(Array.from({ length: 6 }, (_, i) => [7 + i, 1]))) && !has(new Map(Array.from({ length: 5 }, (_, i) => [7 + i, 1]))), 'a chapter crown should need exactly its six crystals');
}
// hallPeople groups by name (any case) and keeps each zone's first signing
{
  const g = (n) => legendOf.get(n);
  const rows = [...span(6, after5).map(([n, t]) => ({ name: 'Theo', game: g(n), at: t })), { name: 'THEO', game: g(1), at: after5 + 9 * DAY }, { name: 'Ana', game: g(1), at: after5 }];
  const people = hallPeople(rows), theo = people.find((p) => p.name === 'Theo'), ana = people.find((p) => p.name === 'Ana');
  check(people.length === 2 && theo?.crown && theo.zones.get(1) === after5 && !ana?.crown, 'the Hall should group signings by name and crown only Theo');
}

// ── 3. never taken away: made-up histories ──
let seed = 12345;                                                   // mulberry32: a fixed, repeatable sequence
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const lz = legendZones().map((z) => z.n);
const lo = CROWN_OF_FOUR_UNTIL - 60 * DAY, hi = CROWN_OF_FIVE_UNTIL + 120 * DAY;
/** The Frost Crown under the rules in force at time t (what the site showed that day). */
const ruleOfTheDay = (zones, t) => {
  const have = (k) => Array.from({ length: k }, (_, i) => i + 1).every((n) => zones.has(n));
  if (t < CROWN_OF_FOUR_UNTIL) return have(OLD_CROWN_EGGS);
  if (t < CROWN_OF_FIVE_UNTIL) return have(FIVE_CROWN_EGGS);
  return have(CHAPTER_ZONES);
};
let histories = 0, crownings = 0;
for (let h = 0; h < 4000; h++) {
  const order = [...lz].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * lz.length));
  let t = lo + rand() * (hi - lo);
  const gap = [0.5, 5, 40][h % 3] * DAY;                           // a crystal a day, a week, or a month apart
  const zones = new Map(), seen = new Set();
  let ok = true;
  for (const n of order) {
    t += rand() * gap;
    zones.set(n, t);
    const now = crownsFrom(zones);
    for (const c of seen) if (!now.has(c)) { ok = false; fails.push(`history ${h}: crown ${c} was taken away after signing Zone ${n} on ${date(t)}`); }
    for (const c of now.keys()) seen.add(c);
    if (ruleOfTheDay(zones, t)) { crownings++; if (!now.has(1)) { ok = false; fails.push(`history ${h}: crowned on ${date(t)} under that day's rule, but not now`); } }
  }
  histories++;
  if (!ok && fails.length > 20) break;
}

// ── 4. the real Hall (optional) ──
let liveNote = '';
if (live) {
  try {
    const { rpc } = await import('../assets/js/scores.js');
    const rows = (await rpc('hall_of_legends', {})).map((r) => ({ name: r.name, game: r.game, at: new Date(r.created_at).getTime() }));
    const people = hallPeople(rows);
    for (const p of people) {
      const t = Math.max(...p.zones.values());
      if (ruleOfTheDay(p.zones, Math.min(t, Date.now())) && !p.crown) fails.push(`${p.name} was crowned under the rules of ${date(t)} but is not crowned now`);
    }
    const holders = people.filter((p) => p.crowns.size);
    liveNote = ` · live Hall: ${people.length} legend(s), ${holders.length} crowned${holders.length ? ` (${holders.map((p) => `${p.name}: ${[...p.crowns].map(([c, at]) => `${crownOf(c).name} ${date(at)}`).join(', ')}`).join('; ')})` : ''}`;
  } catch (e) { fails.push(`--live: could not read the Hall of Legends (${e.message})`); }
}

if (fails.length) {
  console.log(`✗ legends rules: ${fails.length} problem(s)`);
  for (const f of fails.slice(0, 15)) console.log(`    ${f}`);
  process.exit(1);
}
console.log(`✓ legends rules — ${chs.length} chapter(s), the Frost Crown is Zones 1–6 (older rules until ${date(CROWN_OF_FOUR_UNTIL)} and ${date(CROWN_OF_FIVE_UNTIL)}), ${histories} made-up histories with ${crownings} crownings, no crown ever taken away${liveNote} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

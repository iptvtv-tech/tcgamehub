#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  BENCHMARK — a bot plays every level of every game headless (tools/lib/headless.mjs) and
//  scores it on the same scorecard. Each game describes how to play it in games/<id>/bench.mjs
//  (the "contract" below); games without one are listed as "no bot yet".
//
//    node tools/bench.mjs                      every game with a bench.mjs
//    node tools/bench.mjs --games=a,b          only these
//    node tools/bench.mjs --seeds=5            expert runs per level (default 3); the average-bot
//                                              curve uses --curve-seeds (default 6)
//    node tools/bench.mjs --summary=FILE       also write the scorecard as a markdown table
//                                              (GitHub: --summary="$GITHUB_STEP_SUMMARY")
//
//  HARD RULES — the same for every game and every zone, now and in future. Any failure exits 1.
//    finishable   an expert bot that makes one real mistake (a crash, a fall, a lost ball)
//                 still finishes the level, started straight from that level (as a checkpoint
//                 or a repeat does), with unlimited lives
//    rules hold   the game's own invariants (in bounds, speed caps, counts add up) hold after
//                 every engine step, and nothing is NaN
//    never stuck  while in play, progress() moves at least once every `stuck` seconds
//    no crash     no exception from the game's code
//
//  DIFFICULTY — reported, not enforced yet (bots aren't people; bands get calibrated against
//  real play data later). An average-skill bot plays each level; the scorecard shows its lives
//  lost per level and flags a WALL where one level is suddenly far harder than the one before.
//
//  CONTRACT — games/<id>/bench.mjs:
//    export default {
//      levels: 20,                       // levels to play (default: the game's finalLevel, else 20)
//      limit: (level) => 240,            // seconds a level may take the expert bot (default 300)
//      stuck: 60,                        // seconds without progress() moving = stuck (default 60)
//      progress: (g, s) => number,       // rises as the player gets somewhere (docked, eaten, x…)
//      invariants: (g, s) => string|null,// a broken rule, described; null when all is well
//      bot: (g, s, b) => void,           // called before every engine step while in play: steer
//                                        //   with s.hold([...]), s.keyDown/keyUp, s.pointerDown/
//                                        //   Move/Up, s.tap, or the game's own methods.
//                                        //   b.skill 0..1 (1 = expert), b.rand() its own dice,
//                                        //   b.t seconds into the level, b.mem a scratch object
//      mistake: (g, s, b) => boolean,    // make one REAL mistake now (crash into something, fall);
//                                        //   return true once it is under way (optional)
//    };
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGame, ROOT, STEP } from './lib/headless.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SEEDS = +(args.seeds || 3);
const CURVE_SEEDS = Math.max(SEEDS, +(args['curve-seeds'] || 6));   // the difficulty curve needs more runs to be steady
const { SLOTS } = await import(pathToFileURL(path.join(ROOT, 'assets/js/games.js')).href);
let ids = SLOTS.filter((s) => s.game).map((s) => ({ id: s.game.id, zone: s.zone.n, title: s.game.title }));
if (args.games) {
  const want = String(args.games).split(',');
  // a game still being built (not in games.js yet, or the template) can be benched by name
  const extra = want.filter((w) => !ids.some((g) => g.id === w) && fs.existsSync(path.join(ROOT, 'games', w, 'game.js'))).map((id) => ({ id, zone: '–', title: id }));
  ids = [...ids.filter((g) => want.includes(g.id)), ...extra];
}

const EXPERT = 1, AVERAGE = 0.55;

function dice(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Play one level with a bot. */
function play(G, B, level, seed, skill, withMistake) {
  const s = G.start({ seed: seed * 7919 + level * 31 + (withMistake ? 1 : 0), level, unlimited: true });
  const g = s.game;
  const b = { skill, rand: dice(seed * 104729 + level), t: 0, level, mem: {} };
  const limit = (B.limit ? B.limit(level) : 300) + (s.bonus ? 0 : 0);
  const stuckAfter = B.stuck ?? 60;
  let mistakeDone = !withMistake || !B.mistake || s.bonus, livesAtMistake = null;
  let lastProg = safe(() => B.progress(g, s)), lastMove = 0, playT = 0;
  const steps = Math.round(limit / STEP);
  for (let i = 0; i < steps; i++) {
    if (s.state === 'playing') {
      b.t = playT;
      if (!mistakeDone && playT > 2) {
        if (B.mistake(g, s, b)) { mistakeDone = true; livesAtMistake = s.livesLost; }
      } else B.bot(g, s, b);
    }
    s.tick();
    if (s.cleared) return { cleared: true, secs: s.time, deaths: s.livesLost, mistakeCost: livesAtMistake == null ? null : s.livesLost - livesAtMistake };
    if (s.state === 'over') return { cleared: false, secs: s.time, deaths: s.livesLost, error: 'the run ended (game over) during the level' };
    if (s.state !== 'playing') continue;
    playT += STEP;
    const bad = B.invariants?.(g, s) || (Number.isFinite(s.score) ? null : `score is ${s.score}`);
    if (bad) return { cleared: false, secs: s.time, deaths: s.livesLost, broken: bad };
    if (s.bonus) continue;                                   // bonus rounds end on their own timer
    const p = B.progress(g, s);
    if (p !== lastProg) { lastProg = p; lastMove = playT; }
    else if (playT - lastMove > stuckAfter) return { cleared: false, secs: s.time, deaths: s.livesLost, stuck: `no progress for ${stuckAfter} s (progress stuck at ${fmt(p)})` };
  }
  return { cleared: false, secs: s.time, deaths: s.livesLost, timeout: `not finished after ${limit} s (progress ${fmt(safe(() => B.progress(g, s)))})` };
}
const safe = (f) => { try { return f(); } catch { return NaN; } };
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));

const t0 = Date.now();
const card = [];            // one row per game for the summary
let hardFails = 0;
const missing = [];
for (const { id, zone, title } of ids) {
  const file = path.join(ROOT, 'games', id, 'bench.mjs');
  if (!fs.existsSync(file)) { missing.push(id); continue; }
  const g0 = Date.now();
  const B = (await import(pathToFileURL(file).href)).default;
  const G = await loadGame(id);
  const probe = G.start({ level: 1 });
  const top = B.levels ?? G.def.finalLevel ?? 20;
  const levels = Array.from({ length: top }, (_, i) => i + 1);
  if (G.def.secretLevel && !levels.includes(G.def.secretLevel)) levels.push(G.def.secretLevel);
  const fails = [], rows = [], walls = [];
  for (const L of levels) {
    const bonus = probe.isBonusLevel(L);
    let ok = 0, secs = 0, deaths = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      let r;
      try { r = play(G, B, L, seed, EXPERT, true); } catch (e) { r = { cleared: false, error: `crashed: ${String(e.message || e).split('\n')[0].slice(0, 140)}` }; }
      if (r.cleared) { ok++; secs += r.secs; }
      else fails.push(`level ${L}${bonus ? ' (bonus)' : ''} seed ${seed}: ${r.broken ? `rule broken — ${r.broken}` : r.stuck || r.timeout || r.error}`);
    }
    for (let seed = 1; seed <= CURVE_SEEDS; seed++) {
      let a;
      try { a = play(G, B, L, seed, AVERAGE, false); } catch (e) { a = { cleared: false, deaths: 0, error: `crashed: ${String(e.message || e).split('\n')[0].slice(0, 140)}` }; }
      deaths += a.deaths + (a.cleared ? 0 : 3);              // an unfinished level counts as 3 more lives
      if (!a.cleared && (a.broken || a.error)) fails.push(`level ${L} seed ${seed} (average bot): ${a.broken ? `rule broken — ${a.broken}` : a.error}`);
    }
    const d = deaths / CURVE_SEEDS;
    rows.push({ L, bonus, ok, secs: ok ? secs / ok : null, deaths: d });
  }
  const secs = ((Date.now() - g0) / 1000).toFixed(0);
  const normal = rows.filter((r) => !r.bonus);
  // a WALL: a level far harder than the two before it, and the level after stays hard too
  // (one unlucky level is noise, a step that lasts is a wall)
  for (let i = 1; i < normal.length; i++) {
    const before = normal.slice(Math.max(0, i - 2), i).reduce((a, r) => a + r.deaths, 0) / Math.min(2, i);
    const d = normal[i].deaths, next = normal[i + 1]?.deaths ?? d;
    if (d >= 3 && d > before * 2.5 + 1 && next > before * 1.8 + 0.5) walls.push(`L${normal[i].L}`);
  }
  const start = normal.slice(0, 3), end = normal.slice(-3);
  const avg = (xs) => (xs.length ? xs.reduce((a, r) => a + r.deaths, 0) / xs.length : 0);
  hardFails += fails.length ? 1 : 0;
  console.log(`${fails.length ? '✗' : '✓'} ${id}  zone ${zone}  (${secs}s)  levels ${levels[0]}–${levels[levels.length - 1]} · average bot loses ${avg(start).toFixed(1)} lives/level at the start, ${avg(end).toFixed(1)} at the end${walls.length ? ` · WALL at ${walls.join(', ')}` : ''}`);
  console.log(`    lives lost per level (average bot): ${normal.map((r) => `${r.L}:${r.deaths.toFixed(1)}`).join(' ')}`);
  for (const f of fails.slice(0, 10)) console.log(`    ${f}`);
  if (fails.length > 10) console.log(`    … and ${fails.length - 10} more`);
  if (fails.length && process.env.GITHUB_ACTIONS) console.log(`::error title=benchmark ${id}::${fails.slice(0, 6).join('%0A')}`);
  card.push({ id, title, zone, ok: !fails.length, fails: fails.length, start: avg(start), end: avg(end), walls, levels: `${levels[0]}–${levels[levels.length - 1]}`,
    spark: normal.map((r) => r.deaths) });
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${card.length - hardFails}/${card.length} games pass every hard rule in ${mins} min${hardFails ? ` — ${hardFails} need a look` : ''}`);
if (missing.length) console.log(`no bot yet (${missing.length}): ${missing.join(', ')}`);

if (args.summary) {
  const bars = '▁▂▃▄▅▆▇█';
  const spark = (xs) => { const m = Math.max(1, ...xs); return xs.map((x) => bars[Math.min(7, Math.round((x / m) * 7))]).join(''); };
  const lines = [
    '## Benchmark scorecard',
    '',
    `Hard rules (finishable after a mistake, rules hold, never stuck, no crash): **${card.length - hardFails}/${card.length} games pass**. Difficulty columns are lives an average-skill bot loses per level — reported, not enforced yet.`,
    '',
    '| Zone | Game | Hard rules | Levels | Lives lost: start → end | Curve | Walls |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...card.map((c) => `| ${c.zone} | ${c.title} | ${c.ok ? '✅ pass' : `❌ ${c.fails} problem(s)`} | ${c.levels} | ${c.start.toFixed(1)} → ${c.end.toFixed(1)} | ${spark(c.spark)} | ${c.walls.join(', ') || '—'} |`),
    '',
    missing.length ? `No bot yet (${missing.length}): ${missing.join(', ')}` : 'Every game has a bot.',
    '',
  ];
  fs.appendFileSync(args.summary, lines.join('\n'));
}
process.exit(hardFails ? 1 : 0);

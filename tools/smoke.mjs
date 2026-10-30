#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  SMOKE TEST — plays every game through the real engine in headless Chromium
//  and fails if anything breaks. Run it before pushing a batch of changes.
//
//    node tools/smoke.mjs                  every game (≈15–40 min; the 3D games are slow)
//    node tools/smoke.mjs --quick          first 4 levels per game instead of all
//    node tools/smoke.mjs --games=neon-snake,crazy-putt
//    node tools/smoke.mjs --zone=3              one zone's games (GitHub runs the zones side by side)
//
//  Per game it checks:
//    layout  the canvas sits fully inside the screen on a phone (390×844) and a desktop (1280×800)
//    play    start · scripted taps and keys · lose a life and come back · every level, including
//            bonus rounds and the secret level · game over · "play again" from level 1
//  Any page error or console error fails the game. The page clock is faked, so a minute of
//  play runs in seconds and the same run plays out the same way every time.
//
//  Needs Playwright with Chromium, once per machine:
//    npm install -g playwright && npx playwright install chromium
//  Supabase and GoatCounter calls are blocked, so nothing is scored or counted.
// ─────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const QUICK = !!args.quick;

// ── Playwright: local install first, then the global one ─────
async function loadPlaywright() {
  const roots = [ROOT];
  try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* no npm */ }
  for (const r of roots) {
    try { const pw = await import(pathToFileURL(createRequire(path.join(r, 'x.js')).resolve('playwright')).href); return pw.chromium ? pw : pw.default; } catch { /* try next */ }
  }
  console.error('Playwright not found. Install it once:\n  npm install -g playwright && npx playwright install chromium');
  process.exit(2);
}

// ── A tiny static server for the repo (like python -m http.server) ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

// ── The games, in zone order ─────────────────────────────────
const { SLOTS } = await import(pathToFileURL(path.join(ROOT, 'assets/js/games.js')).href);
let GAMES = SLOTS.filter((s) => s.game && (!args.zone || s.zone.n === +args.zone)).map((s) => s.game.id);
if (args.games) { const want = String(args.games).split(','); GAMES = GAMES.filter((g) => want.includes(g)); }
if (!GAMES.length) { console.error('No games match the --zone / --games given.'); process.exit(2); }

const NOISE = ['supabase', 'goatcounter', 'gc.zgo.at', 'net::ERR', 'Failed to load resource', 'favicon'];
const KEYS = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyW', 'KeyA', 'KeyD'];
const STATE = `() => { const s = window.shell; if (!s) return { missing: true, href: location.href };
  return { state: s.state, level: s.level, lives: s.lives, final: s.def.finalLevel || null, secret: s.def.secretLevel || null }; }`;

function rng(seedText) {   // small seeded RNG so a game's scripted play is the same every run
  let a = [...seedText].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function openGame(browser, base, gid, { phone, dpr }) {
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  const nav = { loaded: false };
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (NOISE.slice(0, 3).some((h) => u.includes(h))) return r.abort();
    // a tap must never take the page away from the game (a link, a share button, a reload)
    if (nav.loaded && r.request().isNavigationRequest() && !r.request().frame().parentFrame()) return r.abort();
    return r.continue();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.some((n) => m.text().includes(n))) errors.push(`console: ${m.text()}`); });
  await page.clock.install();
  await page.goto(`${base}/games/${gid}/`, { waitUntil: 'load' });
  nav.loaded = true;
  for (let i = 0; i < 150 && !(await ev(page, '() => !!(window.shell && window.shell.game)')); i++) await page.clock.runFor(100);
  return { ctx, page, errors };
}

// run a function given as source text in the page and return its result
const ev = (page, src) => page.evaluate(`(${src})()`);

const state = async (page) => {
  const st = await ev(page, STATE);
  if (st.missing) throw new Error(`the game page went away (now at ${st.href})`);
  return st;
};
async function runUntil(page, cond, maxS) {
  for (let t = 0; t < maxS; t += 0.25) { await page.clock.runFor(250); const st = await state(page); if (cond(st)) return st; }
  return state(page);
}
async function play(page, rand, seconds, phone) {
  for (let t = 0; t < seconds;) {
    if (rand() < 0.55) {
      const r = await ev(page, "() => { const c = document.querySelector('.canvas-wrap canvas') || document.querySelector('canvas'); const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }");
      const x = r[0] + 8 + rand() * (r[2] - 16), y = r[1] + 8 + rand() * (r[3] - 16);
      // only taps a player could make on the game itself, while it's in play
      const ok = await ev(page, `() => window.shell?.state === 'playing' && document.elementFromPoint(${x}, ${y})?.tagName === 'CANVAS'`);
      if (ok) phone ? await page.touchscreen.tap(x, y) : await page.mouse.click(x, y);
    } else {
      const k = KEYS[Math.floor(rand() * KEYS.length)];
      await page.keyboard.down(k); await page.clock.runFor(60 + Math.floor(rand() * 220)); await page.keyboard.up(k);
    }
    const step = 120 + Math.floor(rand() * 380);
    await page.clock.runFor(step); t += step / 1000;
  }
}

// Draw the same frame twice: from the cached layers, then with every cache dropped. If the two
// pictures differ, a cached layer is stale (it shows an old level, run or layout). Returns the
// share of pixels that changed.
const STALE = `() => { const s = window.shell, c = s.canvas, x = c.getContext('2d');
  const fxr = s.fx.render; s.fx.render = () => {};          // particles drift between draws
  const rnd = Math.random; Math.random = () => 0.5;          // so do random sparkles
  const grab = () => { s.draw(); return x.getImageData(0, 0, c.width, c.height).data.slice(); };
  const cmp = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 20) d++; return d / (a.length / 4); };
  try {
    // Some games animate inside the draw itself (Turbo Rush's rain), so even two cached
    // draws differ a little: measure that flicker first, then compare a fresh-cache draw.
    const a = grab(), b = grab();
    const kept = s._layers; s._layers = new Map(); const f = grab(); s._layers = kept;   // fresh caches for one draw, then the game's own back
    return { flicker: cmp(a, b), fresh: cmp(b, f) };
  } finally { s.fx.render = fxr; Math.random = rnd; } }`;
const stale = async (page, where, notes) => {
  const { flicker, fresh } = await ev(page, STALE);
  // stale = a fresh redraw differs by clearly more than the game's own draw-to-draw flicker
  if (fresh > flicker * 2 + 0.005) notes.push(`${where}: the cached picture is stale (${(fresh * 100).toFixed(1)}% of the screen redraws differently)`);
};

async function checkLayout(browser, base, gid, phone) {
  const { ctx, page, errors } = await openGame(browser, base, gid, { phone, dpr: 2 });
  await ev(page, '() => window.shell.startRun(1)');
  await page.clock.runFor(2600);
  const off = await ev(page, `() => { const c = document.querySelector('.canvas-wrap canvas') || document.querySelector('canvas'); const b = c.getBoundingClientRect();
    const o = { left: -b.left, top: -b.top, right: b.right - innerWidth, bottom: b.bottom - innerHeight };
    return Object.entries(o).filter(([, v]) => v > 0.5).map(([k, v]) => k + ' ' + v.toFixed(1) + 'px'); }`);
  await ctx.close();
  const problems = errors.slice(0, 3);
  if (off.length) problems.unshift(`${phone ? 'phone' : 'desktop'}: canvas runs off the screen (${off.join(', ')})`);
  return problems;
}

async function checkPlay(browser, base, gid) {
  const { ctx, page, errors } = await openGame(browser, base, gid, { phone: true, dpr: 1 });
  const notes = [], rand = rng(gid);
  try {
    await ev(page, '() => window.shell.startRun(1)');
    let st = await runUntil(page, (s) => s.state === 'playing', 6);
    if (st.state !== 'playing') notes.push(`start: still "${st.state}" after 6 s`);
    else await stale(page, 'level 1 (first start)', notes);   // the title screen builds level 1 too
    await play(page, rand, 6, true);
    st = await state(page);
    if (st.state === 'playing' && st.lives > 1) {                      // lose a life and come back
      await ev(page, '() => window.shell.hurt()');
      const back = await runUntil(page, (s) => s.state === 'playing', 5);
      if (back.state !== 'playing') notes.push(`after losing a life: "${back.state}", not back in play after 5 s`);
      if (back.lives !== st.lives - 1) notes.push(`after losing a life: lives ${st.lives} → ${back.lives}`);
      await play(page, rand, 3, true);
    }
    let levels = Array.from({ length: (st.final || 20) - 1 }, (_, i) => i + 2);
    if (st.secret) levels.push(st.secret);
    if (QUICK) levels = levels.slice(0, 3);
    for (const L of levels) {                                            // every level, bonus and secret included
      const n0 = errors.length;
      const now = await state(page);
      if (now.state === 'over' || now.state === 'title') { await ev(page, '() => window.shell.startRun(1)'); await runUntil(page, (s) => s.state === 'playing', 6); }
      await ev(page, `() => { const s = window.shell; s.lives = Math.max(s.lives, 3); s.beginLevel(${L}); }`);
      const lv = await runUntil(page, (s) => s.state === 'playing', 6);
      if (lv.state !== 'playing') notes.push(`level ${L}: "${lv.state}", never came into play`);
      else await stale(page, `level ${L}`, notes);
      await play(page, rand, 2.2, true);
      if (errors.length > n0) notes.push(`level ${L}: ${errors[n0].slice(0, 160)}`);
    }
    await runUntil(page, (s) => s.state === 'playing', 6);              // game over
    await ev(page, '() => { const s = window.shell; s.lives = 1; s.hurt(); }');
    const over = await runUntil(page, (s) => s.state === 'over', 6);
    if (over.state !== 'over') notes.push(`game over: "${over.state}" instead of the game-over screen`);
    const n0 = errors.length;                                            // play again from level 1 (stale state from the last run)
    await ev(page, '() => window.shell.startRun(1)');
    const again = await runUntil(page, (s) => s.state === 'playing', 6);
    if (again.state !== 'playing') notes.push(`play again: "${again.state}" after 6 s`);
    await stale(page, 'play again, level 1', notes);
    for (const L of [3, 4, 7, 12].filter((l) => l <= (st.final || 20))) {     // the same levels again, now with a new seed
      await ev(page, `() => { const s = window.shell; s.lives = Math.max(s.lives, 3); s.beginLevel(${L}); }`);
      const lv = await runUntil(page, (s) => s.state === 'playing', 6);
      if (lv.state === 'playing') await stale(page, `play again, level ${L}`, notes);
    }
    await play(page, rand, 4, true);
    if (errors.length > n0) notes.push(`play again: ${errors[n0].slice(0, 160)}`);
  } catch (e) {
    notes.push(`stopped: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
  }
  await ctx.close();
  const uniq = [...new Set(errors.map((e) => e.slice(0, 200)))];
  return [...notes, ...uniq.slice(0, 4).map((e) => `error: ${e}`)];
}

// ── Run ─────────────────────────────────────────────────────
const { chromium } = await loadPlaywright();
const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const t0 = Date.now();
let failed = 0;
console.log(`Smoke test: ${GAMES.length} game(s)${QUICK ? ', quick' : ''}\n`);
for (const gid of GAMES) {
  const g0 = Date.now();
  const problems = [
    ...(await checkLayout(browser, base, gid, true)),
    ...(await checkLayout(browser, base, gid, false)),
    ...(await checkPlay(browser, base, gid)),
  ];
  const secs = ((Date.now() - g0) / 1000).toFixed(0);
  if (problems.length) {
    failed++; console.log(`✗ ${gid}  (${secs}s)`); for (const p of problems) console.log(`    ${p}`);
    // on GitHub, also post it as a note at the top of the run page (an "annotation")
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=smoke ${gid}::${problems.slice(0, 6).join('%0A').replace(/\r?\n/g, '%0A')}`);
  }
  else console.log(`✓ ${gid}  (${secs}s)`);
}
await browser.close();
srv.close();
console.log(`\n${GAMES.length - failed}/${GAMES.length} games OK in ${((Date.now() - t0) / 60000).toFixed(1)} min${failed ? ` — ${failed} need a look` : ''}`);
process.exit(failed ? 1 : 0);

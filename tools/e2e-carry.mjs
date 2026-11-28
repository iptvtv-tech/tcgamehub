// node tools/e2e-carry.mjs   (needs Playwright + Chromium, and port 443: run as root / in CI)
// Moving day, end to end, in a real browser with the real service worker. Both addresses are
// served from this folder by a local HTTPS server (Chromium maps tcgamehub.win and tcarcade.com
// to 127.0.0.1). "before" = today; "after" = moving day: tcgamehub.win answers 301 to the same
// page on tcarcade.com, except the three files the Cloudflare worker keeps there
// (tools/cloudflare/old-domain-worker.js).
//   A · a returning player (service worker installed before the move) opens an old link after
//       the move and lands on the same page at tcarcade.com with every bit of progress
//   B · before the move, GitHub's own redirects (/games/x → /games/x/) are NOT mistaken for it
//   C · a player who never had the service worker uses "Bring my progress" on tcarcade.com
//   D · a carry link from anywhere else asks first, and only merges on "Bring it"
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:https';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
// Playwright: the repo's own, then the global install (as tools/smoke.mjs); NODE_PATH is honoured too
async function loadChromium() {
  const roots = [ROOT];
  try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* no npm */ }
  for (const r of roots) {
    try { const pw = await import(pathToFileURL(createRequire(join(r, 'x.js')).resolve('playwright')).href); return (pw.chromium ? pw : pw.default).chromium; } catch { /* next */ }
  }
  console.error('Playwright not found. Install it once:\n  npm install -g playwright && npx playwright install chromium');
  process.exit(2);
}
const chromium = await loadChromium();
const OLD = 'https://tcgamehub.win', NEW = 'https://tcarcade.com';
const KEEP = new Set(['/carry', '/carry/', '/assets/js/carry-out.js', '/sw.js']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
let phase = 'before';

const dir = mkdtempSync(join(tmpdir(), 'carry-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=tcgamehub.win',
  '-addext', 'subjectAltName=DNS:tcgamehub.win,DNS:tcarcade.com', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });

const server = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const url = new URL(req.url, `https://${host}`);
  if (host === 'tcgamehub.win' && phase === 'after' && !KEEP.has(url.pathname)) {
    res.writeHead(301, { Location: NEW + url.pathname + url.search }); return res.end();
  }
  let file = join(ROOT, decodeURIComponent(url.pathname));
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end(); }   // like GitHub Pages
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(file));
}).listen(443, '127.0.0.1');

// a proxy in the environment would catch the two mapped addresses: leave it out of Chromium's
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(https?|all)_proxy$/i.test(k)));
const browser = await chromium.launch({ env, args: ['--host-resolver-rules=MAP tcgamehub.win 127.0.0.1, MAP tcarcade.com 127.0.0.1, MAP * ~NOTFOUND', '--ignore-certificate-errors', '--no-proxy-server'] });
const problems = [];
const ok = (c, what) => { console.log(`  ${c ? '✓' : '✗'} ${what}`); if (!c) problems.push(what); };
const SAVE = {
  best: { 'neon-snake': 4321 }, maxLevel: { 'neon-snake': 6 }, plays: { 'neon-snake': 12, 'the-vault-job': 4 }, tokens: { earned: 777 },
  owned: { 'theme-ice': 1764000000000 }, ach: { 'g:grand': 1764000000000 }, name: 'Zoë 🧊',
  legend: { at: 1760000000000, games: ['the-vault-job'], code: null, name: 'Zoë 🧊', crownAt: 1761000000000 },
};
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcade:v1') || 'null'));
const settle = (page) => page.waitForLoadState('load').then(() => page.waitForTimeout(400));

try {
  // A + B · returning player with the service worker
  {
    console.log('A/B · returning player (service worker installed before the move)');
    phase = 'before';
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(OLD + '/'); await settle(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.evaluate((s) => { const d = JSON.parse(localStorage.getItem('arcade:v1') || '{}'); localStorage.setItem('arcade:v1', JSON.stringify({ ...d, ...s })); localStorage.setItem('arcade:theme', 'classic'); }, SAVE);
    await page.reload(); await settle(page);
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker is running on tcgamehub.win');
    ok((await page.textContent('.move-bar').catch(() => ''))?.includes('moving to tcarcade.com'), 'before the move: the "moving to tcarcade.com" note shows');
    await page.goto(OLD + '/games/neon-snake'); await settle(page);
    ok(page.url() === OLD + '/games/neon-snake/', `B · before the move a slash redirect stays on tcgamehub.win (${page.url()})`);

    phase = 'after';
    await page.goto(OLD + '/games/neon-snake/'); await page.waitForURL(/tcarcade\.com/, { timeout: 10000 }).catch(() => {}); await settle(page);
    ok(page.url() === NEW + '/games/neon-snake/', `A · an old link lands on the same page at tcarcade.com, link tidied (${page.url()})`);
    const got = await save(page);
    ok(got?.best?.['neon-snake'] === 4321 && got?.tokens?.earned === 777 && got?.owned?.['theme-ice'], 'A · bests, tokens and shop items came across');
    ok(got?.legend?.crownAt === SAVE.legend.crownAt && got?.legend?.games?.includes('the-vault-job'), 'A · crystals and the crown date came across');
    ok(got?.name === 'Zoë 🧊', 'A · the name came across (accents and emoji)');
    ok(await page.evaluate(() => !!localStorage.getItem('arcade:carried')), 'A · tcarcade.com remembers the progress came across');
    await page.goto(NEW + '/'); await settle(page);
    ok(!(await page.$('.move-bar')), 'A · no "bring my progress" note once it has come across');
    await page.goto(OLD + '/'); await page.waitForURL(/tcarcade\.com/, { timeout: 10000 }).catch(() => {}); await settle(page);
    ok(page.url() === NEW + '/', `A · later old links just go to tcarcade.com (${page.url()})`);
    await ctx.close();
  }

  // C · no service worker: "Bring my progress" on tcarcade.com
  {
    console.log('C · player who never had the service worker');
    phase = 'before';
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(OLD + '/'); await settle(page);
    await page.evaluate((s) => localStorage.setItem('arcade:v1', JSON.stringify(s)), SAVE);
    phase = 'after';
    await page.goto(OLD + '/games/'); await settle(page);
    ok(page.url() === NEW + '/games/', 'without the worker an old link is a plain redirect');
    ok(!(await save(page))?.best?.['neon-snake'], 'so the progress is not there yet');
    await page.evaluate(() => localStorage.setItem('arcade:v1', JSON.stringify({ best: { 'turbo-rush': 50 }, name: 'New' })));   // played a bit here first
    await page.goto(NEW + '/'); await settle(page);
    const link = await page.$('.move-bar a[href="https://tcgamehub.win/carry/"]');
    ok(!!link, 'tcarcade.com home offers "Bring my progress"');
    if (link) { await link.click(); await page.waitForURL(NEW + '/', { timeout: 10000 }).catch(() => {}); await settle(page); }
    const got = await save(page);
    ok(got?.best?.['neon-snake'] === 4321 && got?.best?.['turbo-rush'] === 50, 'C · old progress merged in, new progress kept');
    ok(got?.name === 'New', "C · this browser's own name stays");
    ok(page.url() === NEW + '/', `C · back on tcarcade.com, link tidied (${page.url()})`);
    await ctx.close();
  }

  // D · carry link that didn't come from the old address
  {
    console.log('D · a carry link from anywhere else');
    phase = 'after';
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const code = Buffer.from(JSON.stringify({ v: 1, k: { 'arcade:v1': JSON.stringify({ tokens: { earned: 99999 } }) } })).toString('base64url');
    await page.goto(`${NEW}/#carry=${code}`); await settle(page);
    ok(!(await save(page))?.tokens?.earned, 'D · nothing merged without asking');
    ok(page.url() === NEW + '/', 'D · link tidied');
    ok((await page.textContent('.move-bar').catch(() => ''))?.includes('Bring your saved progress'), 'D · the page asks first');
    await page.click('.move-bar [data-yes]'); await settle(page);
    ok((await save(page))?.tokens?.earned === 99999, 'D · merged after "Bring it"');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) { console.log(`e2e-carry: ${problems.length} problem(s)`); process.exit(1); }
console.log('e2e-carry: moving day works end to end ✓');

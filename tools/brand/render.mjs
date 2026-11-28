// node tools/brand/render.mjs [--host=tcarcade.com]
// Draws TC Arcade's mascot and home share card from code (needs Playwright, like tools/smoke.mjs):
//   assets/img/iceman.png   the Iceman, drawn by Magma Escape's own art.js (About page, 404 page)
//   assets/img/og.png       the 1200×630 share card (tools/brand/og.html), with the site's address
// --host defaults to the address in tools/build-pages.mjs (SITE), so after the move it says tcarcade.com.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const site = /const SITE = '([^']+)'/.exec(readFileSync(join(ROOT, 'tools/build-pages.mjs'), 'utf8'))?.[1] || 'https://tcgamehub.win/';
const HOST = args.host || new URL(site).host;

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
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(https?|all)_proxy$/i.test(k)));
const browser = await chromium.launch({ env, args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// serve the repo to the page from a made-up address (no server needed)
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.css': 'text/css' };
await page.route('http://brand.local/**', (r) => {
  const p = decodeURIComponent(new URL(r.request().url()).pathname);
  try { r.fulfill({ body: readFileSync(join(ROOT, p)), contentType: TYPES[extname(p)] || 'application/octet-stream' }); } catch { r.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://brand.local/404.html');

// 1 · the Iceman, big, cropped to his outline
const big = await page.evaluate(async () => {
  const { drawIceman, PAL } = await import('/games/magma-escape/art.js');
  const c = document.createElement('canvas'); c.width = 640; c.height = 860;
  const ctx = c.getContext('2d');
  drawIceman(ctx, { x: 320, y: 700, k: 8.4, stage: 3, face: 1, mode: 'idle', phase: 0, t: 0.3, slash: null, hurt: 0, blinkOut: false, heat: 0, land: 0 }, PAL.ice, null);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, -x0, -y0);
  const small = document.createElement('canvas'); small.width = 300; small.height = Math.round(300 * out.height / out.width);
  const sc = small.getContext('2d'); sc.imageSmoothingQuality = 'high'; sc.drawImage(out, 0, 0, small.width, small.height);
  return { big: out.toDataURL('image/png'), small: small.toDataURL('image/png') };
});
writeFileSync(join(ROOT, 'assets/img/iceman.png'), Buffer.from(big.small.split(',')[1], 'base64'));

// 2 · the share card
const html = readFileSync(join(ROOT, 'tools/brand/og.html'), 'utf8').replace('src="ICEMAN_SRC"', () => `src="${big.big}"`).replace('<b>HOST</b>', `<b>${HOST}</b>`);
await page.setContent(html);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.screenshot({ path: join(ROOT, 'assets/img/og.png') });
await browser.close();
console.log(`wrote assets/img/iceman.png and assets/img/og.png (address: ${HOST})`);

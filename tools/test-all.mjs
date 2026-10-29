#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  TEST ALL — every fast test in one go (no browser needed, a few minutes at most):
//    • level checkers   games/*/check.mjs, tools/check-*.mjs   (every generated level is fair)
//    • game tests       games/*/test.mjs                       (real game code played headless:
//                       levels can be finished, rules always hold — see tools/lib/headless.mjs)
//    • page build       tools/build-pages.mjs --check           (generated pages are up to date)
//
//    node tools/test-all.mjs                   everything
//    node tools/test-all.mjs --games=a,b       only those games' checkers and tests
//
//  The browser smoke test (tools/smoke.mjs) is separate and much slower. GitHub runs both on
//  every push to a review branch and every night (.github/workflows/tests.yml).
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const only = args.games ? String(args.games).split(',') : null;

const jobs = [];
for (const id of fs.readdirSync(path.join(ROOT, 'games')).sort()) {
  if (id.startsWith('_') || (only && !only.includes(id))) continue;
  for (const f of ['check.mjs', 'test.mjs']) {
    const p = path.join('games', id, f);
    if (fs.existsSync(path.join(ROOT, p))) jobs.push({ name: `${id} ${f === 'check.mjs' ? 'level checker' : 'game test'}`, cmd: [p] });
  }
}
if (!only) {
  for (const f of fs.readdirSync(path.join(ROOT, 'tools')).sort()) if (/^check-.*\.mjs$/.test(f)) jobs.push({ name: f.replace('.mjs', ''), cmd: [path.join('tools', f)] });
  // the sitemap needs real git history; a shallow clone can't check it
  const shallow = fs.existsSync(path.join(ROOT, '.git', 'shallow'));
  jobs.push(shallow ? { name: 'page build (skipped: shallow clone, run git fetch --unshallow)', skip: true } : { name: 'page build', cmd: ['tools/build-pages.mjs', '--check'] });
}

const t0 = Date.now();
let failed = 0;
for (const j of jobs) {
  if (j.skip) { console.log(`– ${j.name}`); continue; }
  const s0 = Date.now();
  const r = spawnSync(process.execPath, j.cmd, { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const secs = ((Date.now() - s0) / 1000).toFixed(1);
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
  if (r.status === 0) console.log(`✓ ${j.name}  (${secs}s)`);
  else {
    failed++;
    console.log(`✗ ${j.name}  (${secs}s)${r.error ? ` — ${r.error.message}` : ''}`);
    for (const line of out.slice(-15)) console.log(`    ${line}`);
  }
}
const n = jobs.filter((j) => !j.skip).length;
console.log(`\n${n - failed}/${n} passed in ${((Date.now() - t0) / 60000).toFixed(1)} min${failed ? ` — ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);

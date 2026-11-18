// node games/crown-heist/find-routes.mjs [--floors=8,9]
// Works out a way to take the crown and escape, never caught, on every floor (route-search.mjs)
// and keeps them in routes.js for the benchmark's bots (bench.mjs) and the game test (test.mjs).
// Run it again after changing the game's rules or floors: a kept way that no longer gets out is
// ignored by the bot, which then works the floor out afresh, and this writes down what it finds.
// Slow where a floor has to be worked out: from a second to about twenty minutes a floor (floors
// 8, 9, 12 and 14 are the long ones), and it needs about 4 GB of memory for those.
// A floor it can find no way for is a floor to look at: it may not be finishable.
import fs from 'node:fs';
import { loadGame } from '../../tools/lib/headless.mjs';
import { botPlay } from '../../tools/lib/bot-play.mjs';
import { ROUTES } from './routes.js';

const arg = process.argv.find((a) => a.startsWith('--floors='));
const G = await loadGame('crown-heist');
const { default: B, learned, packKeys } = await import('./bench.mjs');
const floors = arg ? arg.slice(9).split(',').map(Number) : Array.from({ length: 15 }, (_, i) => i + 1).filter((n) => n !== 5 && n !== 10);
const out = { ...ROUTES };
let bad = 0;
for (const level of floors) {
  const t0 = Date.now(), before = new Set(learned.keys());
  const r = botPlay(G, B, { level, seed: 1 });                   // the expert, with its one mistake
  for (const [at, keys] of learned) if (!before.has(at) && keys) out[at] = packKeys(keys);
  if (!r.cleared) bad++;
  console.log(`floor ${level}: ${r.cleared ? `out in ${r.secs.toFixed(0)} s (${r.deaths} catch${r.deaths === 1 ? '' : 'es'})` : 'NOT finished'}  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
  const text = `// Ways out of each floor that the benchmark's expert bot has learned. Written by\n// \`node games/crown-heist/find-routes.mjs\`; see bench.mjs. Each is the keys to hold on every engine\n// step (run-length text), from one exact moment of a floor (floor@clock:player:guards).\nexport const ROUTES = ${JSON.stringify(out, null, 1)};\n`;
  fs.writeFileSync(new URL('./routes.js', import.meta.url), text);
}
process.exit(bad ? 1 : 0);

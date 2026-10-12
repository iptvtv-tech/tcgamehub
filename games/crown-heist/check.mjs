// Prove every Crown Heist floor can be escaped:  node games/crown-heist/check.mjs  [--map N]
import { buildFloor, check, C } from './floors.js';

const show = process.argv.indexOf('--map');
let bad = 0;
for (let n = 1; n <= 16; n++) {
  const f = buildFloor(n), r = check(f);
  if (!r.ok) bad++;
  console.log(`floor ${String(n).padStart(2)} ${r.ok ? 'OK ' : 'BAD'} ${f.name.padEnd(20)} seed#${f.attempt ?? '-'} ${JSON.stringify(r.stats)} ${r.problems.join('; ')}`);
}
if (show > 0) {
  const f = buildFloor(+process.argv[show + 1]), g = f.g;
  const ch = { [C.WALL]: '#', [C.OPEN]: '.', [C.ALCOVE]: 'a', [C.GATE]: 'P', [C.LEVER]: 'L', [C.CRACK]: 'k', [C.BRAZ]: 't', [C.THRONE]: 'T' };
  const route = new Set((f.escape.route || []).map(([x, y]) => x + ',' + y));
  for (let y = 0; y < g.h; y++) {
    let line = '';
    for (let x = 0; x < g.w; x++) {
      const at = (p) => p && p[0] === x && p[1] === y;
      let c = ch[g.at(x, y)];
      if (at(f.start)) c = 'S'; else if (at(f.crown)) c = 'C'; else if (at(f.exit)) c = 'E';
      else if (f.guards.some((gd) => at(gd.route[gd.phase % gd.route.length]))) c = 'G';
      else if (c === '.' && route.has(x + ',' + y)) c = '·';
      line += c;
    }
    console.log(line);
  }
}
process.exit(bad ? 1 : 0);

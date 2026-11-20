// node tools/check-touch.mjs
// The engine's guard against stuck on-screen buttons (assets/js/touch.js, used by Input in engine.js).
// Bug, 20 Nov 2026: on an iPhone the ◀ ▶ buttons of Avalanche Run "glitch and get stuck". The engine
// only let a finger go when its "up" event came, and phones sometimes never send it. Now it compares
// its own list of fingers with the phone's after every touch event; this checks that comparison:
//   1 · nothing is dropped while the phone still lists every finger (however far they have moved)
//   2 · a finger the phone no longer lists is dropped, and it is the right one
//   3 · when the phone lists no fingers, every held finger is dropped
//   4 · the phone listing MORE fingers than the engine holds drops nothing
//   5 · engine.js really uses it: it listens to the four touch events on the canvas, reconciles, and
//       lets go of everything when the page is hidden
import { readFileSync } from 'node:fs';
import { staleFingers } from '../assets/js/touch.js';

const problems = [];
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const check = (got, want, what) => { if (!same(got, want)) problems.push(`${what}: dropped [${got}] (should be [${want}])`); };

const L = { id: 11, x: 76, y: 810 }, R = { id: 12, x: 178, y: 810 }, J = { id: 13, x: 404, y: 806 }, T = { id: 14, x: 312, y: 818 };
// 1
check(staleFingers([L], [{ x: 76, y: 810 }]), [], 'one finger, still listed');
check(staleFingers([L, J], [{ x: 404, y: 806 }, { x: 76, y: 810 }]), [], 'two fingers, both listed (in the other order)');
check(staleFingers([L, J], [{ x: 150, y: 790 }, { x: 380, y: 760 }]), [], 'two fingers, both moved a long way');
check(staleFingers([], []), [], 'no fingers at all');
// 2
check(staleFingers([L, J], [{ x: 404, y: 806 }]), [11], 'left thumb lifted without an "up", right thumb still on JUMP');
check(staleFingers([L, J], [{ x: 80, y: 808 }]), [13], 'right thumb lifted without an "up", left thumb still on ◀');
check(staleFingers([L, R, J], [{ x: 178, y: 811 }, { x: 400, y: 800 }]), [11], 'three held, the phone lists two');
check(staleFingers([L, R, J, T], [{ x: 310, y: 820 }]), [11, 12, 13], 'four held, the phone lists one');
// a thumb slid from ◀ to ▶ while another record went stale at ◀: the nearer record is the live one
check(staleFingers([{ id: 1, x: 76, y: 810 }, { id: 2, x: 170, y: 812 }], [{ x: 176, y: 810 }]), [1], 'two records, one touch near the second');
// 3
check(staleFingers([L], []), [11], 'one held, the phone lists none');
check(staleFingers([L, R, J, T], []), [11, 12, 13, 14], 'four held, the phone lists none');
// 4
check(staleFingers([L], [{ x: 76, y: 810 }, { x: 300, y: 300 }]), [], 'the phone lists a finger the engine never saw go down');
// random soak: the number dropped is always held − listed (never negative), and never a finger that sits exactly under a listed touch
{
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 2000; n++) {
    const held = Array.from({ length: Math.floor(rnd() * 6) }, (_, i) => ({ id: i + 1, x: rnd() * 480, y: rnd() * 900 }));
    const live = held.filter(() => rnd() < 0.6), touches = live.map((h) => ({ x: h.x, y: h.y }));
    const gone = staleFingers(held, touches);
    if (gone.length !== held.length - live.length) { problems.push(`soak ${n}: ${held.length} held, ${live.length} listed, ${gone.length} dropped`); break; }
    if (gone.some((id) => live.some((h) => h.id === id))) { problems.push(`soak ${n}: dropped a finger that is still on the screen`); break; }
  }
}
// 5
{
  const src = readFileSync(new URL('../assets/js/engine.js', import.meta.url), 'utf8');
  if (!/import \{ staleFingers \} from '\.\/touch\.js'/.test(src)) problems.push('engine.js does not import staleFingers from touch.js');
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) if (!src.includes(`'${type}'`)) problems.push(`engine.js does not listen for ${type}`);
  if (!/staleFingers\(/.test(src.replace(/import[^\n]*\n/g, ''))) problems.push('engine.js never calls staleFingers');
  if (!src.includes("'visibilitychange'") || !src.includes("'pagehide'")) problems.push('engine.js does not let go of the controls when the page is hidden');
}

if (problems.length) { console.log(`✗ touch: ${problems.length} problem(s)`); for (const p of problems) console.log('    ' + p); process.exit(1); }
console.log('✓ touch — a finger whose lift was never reported is let go (and only that finger), in 12 cases and a 2,000-case soak; engine.js reconciles after every touch event and when the page is hidden');

// node games/dock-master/check.mjs [--levels 40] [--seeds 40]
// Proves every generated level is fair: each traffic colour has exactly one bay,
// bays sit on screen and apart, the spawner can never outrun the player's best
// throughput (quota is always reachable), and a straight plotted route really
// does arrive at its bay using the game's own movement (world.js).
import {
  W, H, BAY_R, STATION_R, CX, CY,
  levelSpec, makeLevel, spawnShip, stepShip, atBay, worstDockTime,
} from './world.js';
import { makeRng } from '../../assets/js/rng.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 40), SEEDS = arg('--seeds', 40);
let bad = 0, n = 0;

for (let level = 1; level <= LEVELS; level++) {
  const sp = levelSpec(level);
  let worstT = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rng = makeRng(seed * 7919 + level);
    const { spec, bays } = makeLevel(level, rng);
    n++;

    // one bay per colour, no colour missing or doubled
    const seen = new Set(bays.map((b) => b.color));
    if (bays.length !== spec.colours || seen.size !== spec.colours) { console.log(`L${level} seed ${seed}: bay/colour mismatch`); bad++; }
    for (const b of bays) {
      if (b.mx < BAY_R || b.mx > W - BAY_R || b.my < BAY_R || b.my > H - BAY_R) { console.log(`L${level} seed ${seed}: bay mouth off screen`); bad++; }
    }
    for (let i = 0; i < bays.length; i++) for (let j = i + 1; j < bays.length; j++) {
      const a = bays[i], b = bays[j];
      if (Math.hypot(a.mx - b.mx, a.my - b.my) < BAY_R * 2 + 6) { console.log(`L${level} seed ${seed}: bays ${i}/${j} overlap`); bad++; }
    }

    // throughput: even from the worst corner a routed ship docks faster than
    // maxAlive ships can pile up — the screen can always be kept clear
    const t = worstDockTime(bays, spec);
    worstT = Math.max(worstT, t);
    if (t > spec.spawnEvery * spec.maxAlive) { console.log(`L${level} seed ${seed}: spawner outruns docking (${t.toFixed(1)}s vs ${(spec.spawnEvery * spec.maxAlive).toFixed(1)}s)`); bad++; }

    // movement sanity: a spawned ship with a straight plotted route reaches its bay
    const ship = spawnShip(spec, rng);
    const bay = bays.find((b) => b.color === ship.color);
    ship.path = [{ x: bay.mx, y: bay.my }];
    let steps = 0, docked = false;
    while (steps++ < 60 * 40) { stepShip(ship, spec, 1 / 60); if (atBay(ship, bay)) { docked = true; break; } }
    if (!docked) { console.log(`L${level} seed ${seed}: routed ship never reached its bay`); bad++; }

    // every colour a ship can wear has a bay to go to
    for (let c = 0; c < spec.colours; c++) if (!bays.some((b) => b.color === c)) { console.log(`L${level} seed ${seed}: colour ${c} has no bay`); bad++; }
  }
  console.log(`L${level.toString().padStart(2)}: ${sp.colours} colours · quota ${sp.quota} · spawn ${sp.spawnEvery.toFixed(2)}s · worst route ${worstT.toFixed(1)}s`);
}
console.log(bad ? `\n${bad} problem(s)` : `\nOK — ${n} level seeds checked (station r${STATION_R} at ${CX},${CY})`);
process.exit(bad ? 1 : 0);

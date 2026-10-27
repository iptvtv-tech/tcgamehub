// node games/station-defense/check.mjs [--levels 30] [--seeds 30] [--verbose]
// 1. Every generated map is sound: each lane is one unbroken path from its gate to the
//    dock with no cell used twice, a second lane only ever joins the first, and the full
//    set of build pads sits beside the lanes (never on them, never touching each other).
// 2. Every level can be won: a plain bot plays each level with the game's own rules
//    (sim.js). It builds a mix of the unlocked turrets on the best pads, upgrades them,
//    and fires the cannon at the thickest knot of ships with near-perfect aim. It must
//    finish every level (85% of maps), and up to level 15 without losing a life; past
//    that the bar drops (50% to level 25, 30% after), because Ultra should bite.
// 3. Turrets matter: a bot that never builds (cannon only) must fail from level 5 on.
// Bonus levels (every 5th) are Meteor Storms and don't use the simulation.
import { Sim, TURRETS, STEP, COLS, ROWS, CANNON, pointAt, padCount, waveCount, bossLevel } from './sim.js';
import { makeRng } from '../../assets/js/rng.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const LEVELS = arg('--levels', 30), SEEDS = arg('--seeds', 30), VERBOSE = process.argv.includes('--verbose');
let bad = 0;

function checkMap(sim, tag) {
  const { cells: lanes, pads } = sim.map;
  const all = new Set();
  for (const [li, cells] of lanes.entries()) {
    const seen = new Set();
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = cells[i], k = x + y * COLS;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return `${tag}: lane ${li} leaves the map`;
      if (seen.has(k)) return `${tag}: lane ${li} crosses itself`;
      seen.add(k); all.add(k);
      if (i && Math.abs(x - cells[i - 1][0]) + Math.abs(y - cells[i - 1][1]) !== 1) return `${tag}: lane ${li} is broken`;
    }
    const [lx, ly] = cells[cells.length - 1];
    if (cells[0][1] !== 0 || ly !== 11 || (lx !== 4 && lx !== 5)) return `${tag}: lane ${li} doesn't run gate → dock`;
  }
  if (lanes.length > 1) {
    const [a, b] = lanes, onA = new Set(a.map(([x, y]) => x + y * COLS));
    const j = b.findIndex(([x, y]) => onA.has(x + y * COLS));
    if (j < 7 || b.slice(j).some(([x, y]) => !onA.has(x + y * COLS))) return `${tag}: second lane doesn't merge cleanly`;
  }
  if (pads.length !== padCount(sim.level, lanes.length)) return `${tag}: only ${pads.length} pads`;
  for (const p of pads) {
    if (all.has(p.c + p.r * COLS)) return `${tag}: pad on a lane`;
    for (const q of pads) if (q !== p && Math.max(Math.abs(p.c - q.c), Math.abs(p.r - q.r)) <= 1) return `${tag}: pads touching`;
  }
  return null;
}

// what the bot builds on its pads, best pad first (locked kinds fall back to what's open)
const ORDER = ['laser', 'missile', 'laser', 'tesla', 'cryo', 'missile', 'tesla', 'laser', 'missile', 'tesla', 'cryo', 'laser'];
const kindFor = (level, i) => {
  const k = ORDER[i % ORDER.length];
  if (TURRETS[k].unlock <= level) return k;
  return TURRETS.missile.unlock <= level && i % 2 ? 'missile' : 'laser';
};

/** Play a level. mode: 'full' | 'cannon' (never builds) | 'turrets' (never fires). */
export function play(level, seed, mode = 'full') {
  const sim = new Sim(level, makeRng(seed));
  const pads = [...sim.map.pads].sort((a, b) => b.cover - a.cover);
  const aim = makeRng(seed ^ 0x5eed);
  let think = 0, lives = 3, kills = 0;
  for (let guard = 0; guard < 120 * 900 && !sim.done; guard++) {
    if ((think -= STEP) <= 0 && mode !== 'cannon') {
      think = 0.25;
      const i = pads.findIndex((p) => !sim.turretAt(p));
      const want = i >= 0 ? kindFor(level, i) : null;
      if (want && sim.credits >= TURRETS[want].cost) sim.build(pads[i], want);
      else if (!want || sim.turrets.length >= 6) {
        // upgrade: the busiest turret that can still go up
        const up = sim.turrets.filter((t) => t.tier < 2).sort((a, b) => b.pad.cover - a.pad.cover || a.tier - b.tier)[0];
        if (up) sim.upgrade(up);
      }
    }
    if (mode !== 'turrets' && sim.cannonCd === 0 && sim.enemies.length) {
      // aim at the ship with the most company, leading it along the lane; a good human taps a little off
      let best = null, bn = -1;
      for (const e of sim.enemies) {
        let n = 0;
        for (const f of sim.enemies) if (Math.hypot(f.x - e.x, f.y - e.y) < CANNON.splash) n++;
        if (n > bn || (n === bn && e.d > best.d)) { bn = n; best = e; }
      }
      const T = Math.hypot(best.x - 240, best.y - 650) / CANNON.speed;
      const [x, y] = pointAt(best.lane, Math.min(best.lane.len, best.d + best.speed * T));
      sim.fire(x + aim.range(-10, 10), y + aim.range(-10, 10));
    }
    sim.step();
    for (const ev of sim.events) {
      if (ev.type === 'kill') kills++;
      if (ev.type === 'down') { lives--; if (lives > 0) sim.restartWave(); }
    }
    sim.events.length = 0;
    if (lives <= 0) break;
  }
  return { won: sim.done, lives, shields: sim.shields, kills, credits: sim.credits, time: sim.t, turrets: sim.turrets.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (let level = 1; level <= LEVELS; level++) {
    if (level % 5 === 0) continue;
    let wins = 0, flawless = 0, shields = 0, time = 0, idle = 0, turretOnly = 0, ships = 0, two = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = seed * 7919 + level;
      const sim = new Sim(level, makeRng(s));
      const err = checkMap(sim, `L${level} seed ${seed}`);
      if (err) { console.log(err); bad++; continue; }
      if (sim.map.lanes.length > 1) two++;
      ships += sim.plan.waves.flat().reduce((a, g) => a + g.count, 0);
      const r = play(level, s);
      if (r.won) { wins++; time += r.time; shields += r.shields; if (r.lives === 3) flawless++; }
      else if (VERBOSE) console.log(`  L${level} seed ${seed}: lost (${r.turrets} turrets, ${r.kills} kills)`);
      const cn = play(level, s, 'cannon'); if (cn.won && cn.lives === 3) idle++;
      const tr = play(level, s, 'turrets'); if (tr.won && tr.lives === 3) turretOnly++;
    }
    const n = Math.max(1, wins);
    console.log(`L${String(level).padStart(2)}: ${waveCount(level)} waves${bossLevel(level) ? ' + boss' : ''}, ${(ships / SEEDS).toFixed(0)} ships${two ? `, ${two}/${SEEDS} two-gate` : ''} · bot clears ${flawless}/${SEEDS} without losing a life (${wins} in all), ${(shields / n).toFixed(1)} shields left, ${(time / n).toFixed(0)} s · turrets only ${turretOnly} · cannon only ${idle}`);
    const need = level <= 15 ? 0.85 : level <= 25 ? 0.5 : 0.3;     // Ultra: past level 15 even a good player drops the odd life
    if (flawless < SEEDS * need) { console.log(`  ✗ L${level}: the bot loses lives too often`); bad++; }
    if (wins < SEEDS * 0.85) { console.log(`  ✗ L${level}: the bot can't finish it`); bad++; }
    if (level >= 5 && idle > SEEDS * 0.1) { console.log(`  ✗ L${level}: winnable without building anything`); bad++; }
  }
  console.log(bad ? `\n${bad} problem(s)` : '\nOK — every map is sound and every level can be won (and needs turrets).');
  process.exit(bad ? 1 : 0);
}

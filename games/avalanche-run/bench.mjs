// Benchmark contract for Avalanche Run (see tools/bench.mjs). Try it: node tools/bench.mjs --games=avalanche-run
// The bot steers by eye: it looks down the slope as far as it can ride in a couple of seconds,
// tries every line across it, and takes the nearest one that is clear all the way, moving over
// only as fast as the sled can. It tucks when the snow ahead is open or the avalanche is close.
// At a crevasse it heads for the ramp at the edge, and jumps at the last moment if it is not lined
// up with it. It does no tricks. It never reads the slope maker's safe line.
import { HALF, PR, STEER, STEER_TUCK, START_GAP, BOOST } from './world.js';

/** Is the line "ride to x = tx, then straight on" clear for `ahead` metres? Returns the clearance (m), or −1. */
function clearTo(g, tx, ahead, steer, margin) {
  const p = g.sim.p, obs = g.slope.obstacles;
  let least = 9;
  for (let i = g.sim.i0; i < obs.length; i++) {
    const o = obs[i], dz = o.z - p.z;
    if (dz > ahead) break;
    if (dz < -1 || (o.hit && o.kind !== 'yeti') || o.flat) continue;       // (already down)
    const t = Math.max(0, dz - 0.9) / Math.max(6, p.v), reach = steer * t;        // how far over the sled can be by then
    const x = Math.abs(tx - p.x) <= reach ? tx : p.x + Math.sign(tx - p.x) * reach;
    const c = Math.abs(x - o.x) - o.r - PR;
    if (c < margin) return -1;
    if (c < least) least = c;
  }
  // boulders: where each will be when the sled gets to it (a thrown one first has to land)
  for (const q of g.sim.boulders) {
    const closing = Math.max(4, p.v - q.vz), wait = Math.max(0, q.t);
    let tau = (q.z - p.z) / Math.max(4, p.v);                      // if it has not landed by then, it is no danger
    if (tau > wait) tau = wait + (q.z - (p.z + p.v * wait)) / closing;
    else if (q.kind === 'snow' && tau < wait - 0.12) continue;
    if (tau < -0.2 || tau * p.v > ahead + 6) continue;
    const bx = q.x + q.vx * Math.max(0, tau - wait), reach = steer * Math.max(0, tau - 0.05);
    const x = Math.abs(tx - p.x) <= reach ? tx : p.x + Math.sign(tx - p.x) * reach;
    const c = Math.abs(x - bx) - q.r - PR - 0.25;
    if (c < margin) return -1;
    if (c < least) least = c;
  }
  // the giant yeti: its shadow (it lands there) or the giant itself standing on the slope
  const G = g.sim.giant;
  if (G && (G.state === 'shadow' || G.state === 'stand') && G.z > p.z - 2 && G.z - p.z < ahead + 10) {
    const t = Math.max(0, G.z - p.z - 2.6) / Math.max(6, p.v), reach = steer * t;
    const x = Math.abs(tx - p.x) <= reach ? tx : p.x + Math.sign(tx - p.x) * reach;
    const c = Math.abs(x - G.x) - 2.2 - PR - 0.4;
    if (c < margin) return -1;
    if (c < least) least = c;
  }
  return least;
}

function bot(g, s, b) {
  const sim = g.sim, p = sim.p, m = b.mem;
  if (g.bonus) {                       // crystal rush: ride at the next crystal
    const c = g.slope.crystals.find((q) => !q.got && q.z > p.z + 1);
    const dx = c ? c.x - p.x : 0;
    return s.hold(Math.abs(dx) < 0.3 ? [] : dx < 0 ? ['left'] : ['right']);
  }
  if (p.air === 'ramp') return s.hold([]);                      // flying: sit still, land straight
  // an average rider looks less far, leaves less room and changes its mind late
  const look = (1.2 + 1.2 * b.skill) * p.v + 8, margin = 0.15 + 0.35 * b.skill;
  // a crevasse ahead: line up with its ramp; without it, jump just before the edge
  const crev = g.slope.crevasses.find((c) => c.z > p.z && c.z - p.z < 50);
  if (crev) {
    const rp = g.slope.ramps.find((r) => r.crev && Math.abs(r.z - crev.z) < 2), d = crev.z - p.z;
    const aim = rp.x + (b.rand() - 0.5) * (1 - b.skill) * 5, dx = aim - p.x, keys = Math.abs(dx) < 0.3 ? [] : dx < 0 ? ['left'] : ['right'];
    const onRamp = Math.abs(p.x - rp.x) < rp.w - 0.3, late = (1 - b.skill) * 0.25 * b.rand() * p.v;
    if (!onRamp && !p.air && d < 0.8 + p.v / 60 + late && d > late * 0.6) keys.push('up');
    return s.hold(keys);
  }
  if (m.holdT > 0 && b.skill < 0.9) { m.holdT -= 1 / 120; return s.hold(m.keys || []); }
  let best = null, bestCost = 1e9;
  for (let tx = -HALF + 1; tx <= HALF - 1; tx += 0.5) {
    const c = clearTo(g, tx, look, STEER * 0.9, margin);
    if (c < 0) continue;
    const cost = Math.abs(tx - p.x) + Math.abs(tx) * 0.05 - Math.min(c, 2) * 0.4;
    if (cost < bestCost) { bestCost = cost; best = tx; }
  }
  if (best == null) {                  // nothing clear all the way: take the line with the most room close by
    for (let tx = -HALF + 1; tx <= HALF - 1; tx += 0.5) { const c = clearTo(g, tx, look * 0.45, STEER * 0.9, 0.05); if (c >= 0 && -c + Math.abs(tx - p.x) * 0.1 < bestCost) { bestCost = -c + Math.abs(tx - p.x) * 0.1; best = tx; } }
  }
  if (best == null) best = p.x;
  best += (b.rand() - 0.5) * (1 - b.skill) * 2.2;
  // a wolf beside the sled that is not lunging: swerve into it if that way is clear; from a lunge, lean away
  const wolf = sim.wolves.find((w) => Math.abs(w.dz) < 1.6 && Math.abs(w.x - p.x) < 4.2 && (w.state === 'run' || w.state === 'crouch' || w.state === 'lunge'));
  if (wolf && b.skill > 0.4) {
    const into = wolf.state !== 'lunge', tx = into ? wolf.x : p.x - Math.sign(wolf.x - p.x) * 2.5;
    if (clearTo(g, Math.max(-HALF + 1, Math.min(HALF - 1, tx)), look * 0.5, STEER * 0.9, 0.1) >= 0) best = tx;
  }
  const dx = best - p.x, keys = Math.abs(dx) < 0.25 ? [] : dx < 0 ? ['left'] : ['right'];
  // tuck where it is open (the tucked sled steers less, so only with room to spare), or to get away
  const open = clearTo(g, p.x, look * 1.1, STEER_TUCK * 0.8, 0.8) >= 0 && keys.length === 0;
  if (open && (b.skill > 0.8 || sim.gap < START_GAP * 0.6)) keys.push('down');
  m.keys = keys; m.holdT = (1 - b.skill) * 0.3 * b.rand();
  s.hold(keys);
}

export default {
  levels: 15,
  limit: (level) => 150 + level * 12,
  stuck: 25,                          // the sled always moves: 25 s without getting further down is stuck
  // metres down the slope (crystals in a rush); the flag keeps what was reached before a lost life
  progress: (g) => (g.bonus ? g.slope.crystals.filter((c) => c.got).length + g.sim.p.z : g.sim.p.z),
  invariants(g) {
    const sim = g.sim, p = sim.p, R = sim.R;
    if (![p.x, p.z, p.v, p.vx, sim.az].every(Number.isFinite)) return 'the sled or the avalanche is at NaN';
    if (Math.abs(p.x) > HALF - PR + 1e-6) return `the sled left the slope (x=${p.x.toFixed(2)})`;
    if (p.v > R.top * BOOST + 1e-6 || p.v < 0) return `the sled rides at ${p.v.toFixed(1)} m/s (top speed ${(R.top * BOOST).toFixed(1)} with a boost)`;
    if (!Number.isFinite(p.y) || p.y < 0 || p.y > 14) return `the sled is ${p.y.toFixed(1)} m above the snow`;
    if (!p.air && p.y !== 0) return 'the sled is off the snow but not in the air';
    for (const w of sim.wolves) if (![w.x, w.dz].every(Number.isFinite)) return 'a wolf is at NaN';
    for (const q of sim.boulders) if (![q.x, q.z, q.t].every(Number.isFinite)) return 'a boulder is at NaN';
    if (Math.abs(p.vx) > STEER + 1e-6) return `the sled slides sideways at ${p.vx.toFixed(1)} m/s (steering gives ${STEER})`;
    if (!g.bonus && sim.az > p.z + 1e-6) return 'the avalanche is ahead of the sled';
    return null;
  },
  bot,
  // one real mistake: ride straight into the nearest tree or rock
  mistake(g, s) {
    const sim = g.sim, p = sim.p;
    if (g.bonus) return false;
    if (p.tumble > 0) return true;
    if (p.air) { s.hold([]); return false; }
    if (g.slope.crevasses.some((c) => c.z > p.z && c.z - p.z < 60)) { bot(g, s, { skill: 1, rand: () => 0.5, mem: {} }); return false; }   // (a tumble, not a fall: cross the crevasse first)
    const o = g.slope.obstacles.slice(sim.i0).find((q) => !q.hit && !q.flat && q.z > p.z + 4 && q.z < p.z + 60 && Math.abs(q.x - p.x) < STEER * (q.z - p.z) / Math.max(6, p.v) * 0.8);
    if (!o) { s.hold([]); return false; }
    const dx = o.x - p.x;
    s.hold(Math.abs(dx) < 0.2 ? [] : dx < 0 ? ['left'] : ['right']);
    return false;
  },
};

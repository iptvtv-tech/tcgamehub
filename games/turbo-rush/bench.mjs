// Benchmark contract for Turbo Rush (see tools/bench.mjs). The bot drives with the keys only:
// ← → to steer, ↑ for nitro, ↓ to brake (the car keeps its foot down by itself). It reads the
// road the way a player does — the traffic it can see (never past the draw distance, so fog
// hides it), the blinkers of cars about to change lanes, the police car coming up behind, VIPER
// and the roadworks cones — and every look (30 a second) it plays out the next ~2 s for each
// place it could steer to (a lane; an expert also rides the line between two lanes), cruising or
// braking, and when none of those gets through, the same move for a moment followed by a second
// one (brake, let the car alongside go, then pull out). It picks what stays clear for the next
// second and ends up fastest (the clock is running), keeps its lane unless another is better,
// burns nitro when the road stays clear even at nitro speed, and brakes when a bend pulls harder
// than it can steer. On a Coin Highway it simply follows the coins. Lower skill looks less often
// (every ~0.12 s) and less far ahead, sticks to the lanes, often thinks only one move ahead,
// thinks the gaps are wider than they are, misses blinkers and spots the police late, so it gets
// clipped more as traffic thickens.
// The mistake: steer into the nearest car ahead and hold its lane until it really costs a life
// (a 🛡 shield only postpones it).
const SEG = 200, CW = 1000 / 1200, PLAYER_W = 0.36 * CW, PLAYER_Z = 1000 * 0.84;
const LANES = [-2 / 3, 0, 2 / 3];
// where the bot may aim: the three lanes, and (for a skilled driver) the lines between them and
// the road edges — a sedan is 0.26 wide either side of its lane, so the line between two lanes clears both
const SPOTS = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
const LANE_SPOTS = [1, 3, 5];
const HIT_FRONT = 190, HIT_BACK = 120;
const DT = 1 / 20;                    // roll-out step (collisions are swept, so nothing slips between steps)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const touchOf = (w) => (w + PLAYER_W) / 2 * 0.86;
const steerRate = (g, v) => { const p = v / g.maxSpeed; return (2 + 0.5 * clamp(p, 0, 1.3)) * Math.min(1, p + 0.15) * g.grip; };

/** What the driver has noticed: cars, the police car and VIPER as moving boxes, cones as still ones. */
function obstacles(g, b, pz, horizon) {
  const reach = g.maxSpeed * 1.28 * horizon + HIT_FRONT;     // nothing further ahead can be reached in time
  const out = [], see = Math.min(reach, g.drawDist * SEG * (g.themeId === 'fog' ? 0.8 : 1));
  const m = b.mem, seen = (m.seen ??= new WeakMap());
  for (const c of g.cars) {
    const dz = c.z - pz;
    if (c.police) {
      // the police car is shown by an arrow at the bottom once it is near; a slow player spots it late
      if (dz < -(10 + 20 * b.skill) * SEG) continue;
    } else if (dz > see || dz < -HIT_BACK - 1500) continue;
    let n = seen.get(c);
    if (!n) { n = { blinkers: b.rand() < 0.35 + 0.65 * b.skill }; seen.set(c, n); }
    const to = c.blink > 0 && c.to !== undefined && n.blinkers ? c.to : c.lane;
    out.push({ z: c.z, v: c.speed, x: c.x, tx: c.police ? c.x : LANES[to], also: c.blink > 0 && n.blinkers ? LANES[c.to] : null, w: c.w, police: !!c.police, soft: false });
  }
  const rv = g.rival;
  // bumping VIPER costs no life but kills your speed (×0.92 every frame you touch): steer clear like a car
  if (rv && Math.abs(rv.z - pz) < see) out.push({ z: rv.z, v: rv.speed, x: rv.x, tx: LANES[rv.lane], also: null, w: 0.33 * CW * 2 / 0.86 - PLAYER_W, soft: false, rival: true });
  for (const cl of g.closures) {
    if (cl.z1 < pz - 300 || cl.z0 > pz + see) continue;
    out.push({ cone: true, z0: cl.z0, z1: cl.z1, x: LANES[cl.lane], soft: true });
  }
  return out;
}

/** Play out a plan — [lane, mode, seconds] steps (cruise, nitro or brake) — and see when it touches
 *  something. Returns { hit: seconds (Infinity = never), soft: a cone / VIPER bump, dist: distance }. */
function rollout(g, obs, plan, margin) {
  const max = g.maxSpeed, z0 = g.position + PLAYER_Z;
  let x = g.playerX, v = g.speed, z = z0, softAt = Infinity, t = 0;
  const oz = obs.map((o) => o.z);
  for (const [spot, mode, dur] of plan) {
    const tx = SPOTS[spot], end = t + dur - 1e-9;
    while (t < end) {
      t += DT;
      const steer = steerRate(g, v), pct = v / max;
      const drift = steer * pct * g.segAt(z).curve * g.centrifugal;
      x += clamp((tx - x) / DT, -steer, steer) * DT - drift * DT;
      if (mode === 'brake') v = Math.max(0, v - max * 1.2 * DT);
      else { const top = mode === 'nitro' ? max * 1.28 : max; v = v < top ? Math.min(top, v + max / (mode === 'nitro' ? 2.5 : 4.2) * DT) : v; }
      if (Math.abs(x) > 1 && v > max / 4) v -= max * 0.9 * DT;
      z += v * DT;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (o.cone) {
          if (z >= o.z0 && z <= o.z1 && Math.abs(x - o.x) < 0.44 + margin) softAt = Math.min(softAt, t);
          continue;
        }
        const ox = o.x + (o.tx - o.x) * Math.min(1, t * 2.2);
        // traffic just behind you in your lane eases off to 90% of your speed (the police and VIPER don't)
        let ov = o.v;
        const before = oz[i] - (z - v * DT);
        if (!o.police && !o.rival && before < 0 && before > -SEG * 4 && Math.abs(ox - x) < 0.45) ov = Math.min(ov, v * 0.9);
        oz[i] += ov * DT;
        const dz = oz[i] - z;
        // touching at any moment during this step: the gap went through the bumper window
        if (Math.max(dz, before) <= -HIT_BACK || Math.min(dz, before) >= HIT_FRONT) continue;
        const r = touchOf(o.w) + margin;
        if (!(Math.abs(ox - x) < r || (o.also != null && Math.abs(o.also - x) < r))) continue;
        if (o.soft) softAt = Math.min(softAt, t);
        else return { hit: t, soft: softAt, dist: z - z0, vEnd: v };
      }
    }
  }
  return { hit: Infinity, soft: softAt, dist: z - z0, vEnd: v };
}

/** Value of a plan: how long it stays clear (crashes are far worse than cones), then how far it
 *  gets (speed matters: the clock is running), small tie-breaks for keeping the lane. */
function value(g, r, spot, cur, mode, horizon) {
  // clear for the next second is what counts (it looks again long before then); further is a bonus
  const safe = Math.min(1, horizon * 0.5);
  let v = Math.min(r.hit, safe) * 30 + Math.min(r.hit, horizon + 1) * 0.5 + Math.min(r.soft, horizon + 1);
  v += r.dist / (g.maxSpeed * horizon) * 4 + r.vEnd / g.maxSpeed * 8;   // up to speed at the end = a way through
  if (spot === cur) v += 0.4;
  v -= Math.abs(spot - cur) * 0.1;
  if (!LANE_SPOTS.includes(spot)) v -= spot === 0 || spot === 6 ? 0.8 : 0.3;   // lanes first
  if (mode === 'brake') v -= 0.3;
  return v;
}

function nearestSpot(x, spots) { let k = spots[0]; for (const i of spots) if (Math.abs(SPOTS[i] - x) < Math.abs(SPOTS[k] - x)) k = i; return k; }

function steerTo(g, s, tx, extra = []) {
  const keys = [...extra], d = tx - g.playerX;
  // the bend pulls the car outwards: lean against it a little before the line drifts off
  const seg = g.segAt(g.position + PLAYER_Z), pull = -seg.curve * (g.speed / g.maxSpeed) * g.centrifugal;
  if (d > 0.025 || (d > -0.01 && pull < -0.25)) keys.push('right');
  else if (d < -0.025 || (d < 0.01 && pull > 0.25)) keys.push('left');
  s.hold(keys);
}

function bonusBot(g, s, b) {
  const pz = g.position + PLAYER_Z;
  const next = g.pickups.filter((p) => !p.got && p.z > pz - 60).sort((a, c) => a.z - c.z);
  // look a moment ahead (a slower player aims at the coin in front of the bonnet, and late)
  const lead = (0.15 + 0.3 * b.skill) * g.speed;
  const tgt = next.find((p) => p.z > pz + lead * 0.5) || next[0];
  const tx = tgt ? tgt.x + (b.mem.aim ?? 0) : 0;
  if (!b.mem.aimT || b.t > b.mem.aimT) { b.mem.aimT = b.t + 1; b.mem.aim = (b.rand() * 2 - 1) * (1 - b.skill) * 0.3; }
  steerTo(g, s, tx, ['up']);
}

function bot(g, s, b) {
  if (g.bonus) return bonusBot(g, s, b);
  const m = b.mem, pz = g.position + PLAYER_Z;
  const every = 1 / 30 + (1 - b.skill) * 0.2;                   // how often it re-reads the road
  if (m.next == null || b.t >= m.next || s.livesLost !== m.lives) {
    m.next = b.t + every; m.lives = s.livesLost;
    const horizon = 0.7 + 1.5 * b.skill;
    const margin = b.skill >= 1 ? 0.04 : 0.04 - (1 - b.skill) * 0.16;    // a sloppy driver squeezes through gaps that aren't there
    const obs = obstacles(g, b, pz, horizon);
    // a skilled driver also rides the line between lanes when traffic is thick
    const spots = b.skill >= 0.8 ? [0, 1, 2, 3, 4, 5, 6] : LANE_SPOTS;
    const cur = m.spot ?? nearestSpot(g.playerX, spots);
    // every first move (a spot, cruising or braking) — and when that alone doesn't get through,
    // the same move for a moment followed by every second one (a slower player thinks one move ahead)
    const firsts = b.skill >= 0.9 ? [0.25, 0.6] : [0.35], deep = b.skill >= 0.7 || b.rand() < b.skill;
    const singles = [];
    for (const mode of ['cruise', 'brake']) {
      for (const spot of spots) {
        if (Math.abs(SPOTS[spot] - SPOTS[cur]) > 1 && b.skill < 0.8 && b.rand() < 0.5) continue;   // doesn't think of the far lane
        const r = rollout(g, obs, [[spot, mode, horizon]], margin);
        singles.push({ spot, mode, r, val: value(g, r, spot, cur, mode, horizon) });
      }
    }
    let best = singles.reduce((a, c) => (c.val > a.val ? c : a));
    // a clear run at full throttle can't be beaten; otherwise look for a way through in two moves
    const flatOut = Math.min(g.maxSpeed, g.speed + g.maxSpeed / 4.2 * horizon) - g.maxSpeed * 0.03;
    if (deep && !(best.mode === 'cruise' && best.r.hit === Infinity && best.r.vEnd >= flatOut)) {
      // the five most promising first moves get a second one
      for (const one of [...singles].sort((a, c) => c.val - a.val).slice(0, 5)) {
        const { spot, mode } = one;
        for (const first of firsts) for (const mode2 of ['cruise', 'brake']) for (const s2 of spots) {
          if (one.r.hit <= first) break;                     // already crashed during the first move
          if ((s2 === spot && mode2 === mode) || Math.abs(s2 - spot) > 3) continue;
          const r2 = rollout(g, obs, [[spot, mode, first], [s2, mode2, horizon - first]], margin);
          const v2 = value(g, r2, spot, cur, mode, horizon);
          if (v2 > best.val) best = { spot, mode, r: r2, val: v2 };
        }
      }
    }
    m.spot = best.spot; m.mode = best.mode;
    // nitro when that line stays clear even at nitro speed (and the nitro is worth burning)
    m.nitro = false;
    if (best.mode === 'cruise' && best.r.hit === Infinity && g.boost > 0.15 && b.rand() < 0.3 + 0.7 * b.skill) {
      const rn = rollout(g, obs, [[best.spot, 'nitro', horizon + 0.5]], Math.max(margin, 0.06));
      m.nitro = rn.hit === Infinity && rn.soft === Infinity;
    }
    // a bend pulling harder than the car can steer: lift (brake) until it holds the line
    const seg = g.segAt(pz), pct = g.speed / g.maxSpeed;
    m.bendBrake = pct * Math.abs(seg.curve) * g.centrifugal > 0.9 && Math.abs(g.playerX - SPOTS[best.spot]) > 0.12 && b.rand() < 0.4 + 0.6 * b.skill;
  }
  const extra = m.mode === 'brake' || m.bendBrake ? ['down'] : m.nitro ? ['up'] : [];
  steerTo(g, s, SPOTS[m.spot], extra);
}

export default {
  levels: 20,
  // a level is 38 + L (max 52) s of road at 90% of top speed and the clock gives ~80 s; a crash
  // costs ~2 s stopped plus ~4 s back up to speed, a TIME UP adds 15 s. From level 7 traffic bunches
  // into slow convoys (half the cars far ahead crawl at under 60% of their own pace by 30 s in), so
  // an expert run takes 40–75 s and the odd one up to ~115 s
  limit: () => 150,
  stuck: 8,                       // the car is never stopped for long: 2 s after a crash it pulls away
  progress: (g) => Math.floor((g.position + PLAYER_Z) / SEG),

  invariants(g, s) {
    const max = g.maxSpeed, pz = g.position + PLAYER_Z;
    for (const [k, v] of [['position', g.position], ['speed', g.speed], ['playerX', g.playerX], ['boost', g.boost], ['timeLeft', g.timeLeft]]) if (!Number.isFinite(v)) return `${k} is ${v}`;
    if (g.speed < 0 || g.speed > max * 1.3 + 1e-6) return `speed ${g.speed.toFixed(0)} is outside 0…${(max * 1.3).toFixed(0)}`;
    if (g.boost < 0 || g.boost > 1 + 1e-9) return `nitro ${g.boost.toFixed(3)} is outside 0…1`;
    const seg = g.segAt(pz);
    const lim = seg.tunnel ? 1.12 : 2.2;
    if (Math.abs(g.playerX) > lim + 1e-6) return `the car is at x ${g.playerX.toFixed(2)}, past the ${seg.tunnel ? 'tunnel wall' : 'roadside'} (${lim})`;
    if (!g.bonus && (g.timeLeft < 0 || (g.timeMax && g.timeLeft > g.timeMax + 60))) return `clock ${g.timeLeft.toFixed(1)} s out of range (max ${g.timeMax})`;
    if (g.bonus && g.cars.length) return `${g.cars.length} cars on the Coin Highway (it has no traffic)`;
    if (pz >= g.finishZ && !g.bonus && !g.done) return 'past the checkpoint but the level is still going';
    for (const c of g.cars) {
      if (!Number.isFinite(c.z) || !Number.isFinite(c.x) || !Number.isFinite(c.speed)) return 'a car position is not a number';
      if (c.lane < 0 || c.lane > 2 || Math.abs(c.x) > 0.7) return `a car is off the road at x ${c.x.toFixed(2)} (lane ${c.lane})`;
      // traffic tops out at 52% of your top speed; the police car at your speed (nitro: 130%) + 24%
      const cap = c.police ? max * (1.3 + 0.24) : max * 0.52;
      if (c.speed < 0 || c.speed > cap + 1e-6) return `a ${c.police ? 'police car' : 'car'} drives at ${c.speed.toFixed(0)} (cap ${cap.toFixed(0)})`;
      // you are never inside a car unless you're still flashing after a crash (or a shield save)
      const dz = c.z - pz;
      if (g.invuln <= 0 && dz > -HIT_BACK && dz < HIT_FRONT && Math.abs(c.x - g.playerX) < touchOf(c.w)) return `the player's car is inside a ${c.kind} (dz ${dz.toFixed(0)}, gap ${Math.abs(c.x - g.playerX).toFixed(2)}) and nothing happened`;
    }
    if (g.coinsGot < 0 || g.passedCount < 0) return 'a negative count';
    // the police car the siren and the 🚨 MOVE! arrow are about is a car on the road
    if (g.police && !g.cars.includes(g.police)) return `the police car left the traffic ${((g.police.z - pz) / SEG).toFixed(0)} segments away but is still the level's police car (frozen there: no new one comes, and the HUD warns about it when you pass the spot)`;
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem;
    m.l0 ??= s.livesLost;
    if (s.livesLost > m.l0) return true;                      // the crash happened: back to driving
    const pz = g.position + PLAYER_Z;
    if (!m.victim || m.victim.z < pz - HIT_BACK || !g.cars.includes(m.victim)) {
      m.victim = g.cars.filter((c) => !c.police && c.z > pz + HIT_FRONT).sort((a, c) => a.z - c.z)[0] || null;
    }
    if (!m.victim) { s.hold([]); return false; }
    steerTo(g, s, m.victim.x, ['up']);                          // floor it straight into the back of it
    return false;
  },
};

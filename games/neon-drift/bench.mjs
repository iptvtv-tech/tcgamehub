// Benchmark contract for Neon Drift 3D (see tools/bench.mjs). The bot drives with the keys only:
// ← → to steer, ↑ to fire the drift-charged boost (the car keeps its foot down by itself), and
// Space once to confirm the radio station before the first race. It reads the road the way a
// player does: the bend coming up (it aims through the inside of it — at speed, holding the turn
// swings the tail out into a drift, which charges the boost), the oil slicks on its line (it goes
// round them) and the straight ahead (a charged meter is fired when the road stays straight for
// the next second or so). Steering is a pure-pursuit driver: it picks a point ahead on its line
// (further ahead the faster it goes) and turns the wheel just enough to curve onto it, tapping
// the keys to hold the wheel part-way. On a NEON COIN RUSH it steers for the next coin.
// Lower skill re-reads the road less often (up to ~4 times a second), looks less far ahead,
// cuts the bends less, wanders off its line, sets the wheel and holds it a moment (over- or
// under-steering) before it corrects, misses the odd oil slick and saves the boost.
// The mistake: lose its bearings and drive the wrong way round until the race is lost (only
// losing a race — not making the cut — costs a life in this game).
const TAU = Math.PI * 2, RUNOFF = 34, CAR_R = 22, BOOST_MIN = 0.25;
const wrapA = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isBoss = (l) => l % 5 === 0;
const need = (l) => (isBoss(l) ? 1 : l <= 2 ? 3 : l <= 8 ? 2 : 1);   // the places that qualify (game.js need())

/** A point on the track at distance d and sideways offset off (game.js at()). */
function at(T, d, off = 0) {
  const dd = mod(d, T.L), fi = dd / T.step, i = Math.floor(fi) % T.N, j = (i + 1) % T.N, f = fi - Math.floor(fi);
  const nx = T.nx[i] + (T.nx[j] - T.nx[i]) * f, nz = T.nz[i] + (T.nz[j] - T.nz[i]) * f;
  return [T.x[i] + (T.x[j] - T.x[i]) * f + nx * off, T.z[i] + (T.z[j] - T.z[i]) * f + nz * off];
}
const kAt = (T, d) => T.k[mod(Math.floor(d / T.step), T.N)];
function kMean(T, d0, d1) { let s = 0, n = 0; for (let d = d0; d <= d1; d += T.step) { s += kAt(T, d); n++; } return n ? s / n : 0; }
function kMax(T, d0, d1) { let m = 0; for (let d = d0; d <= d1; d += T.step) m = Math.max(m, Math.abs(kAt(T, d))); return m; }

/** Hold the wheel at `want` (-1…1) with the arrow keys: the wheel eases towards full lock while a
 *  key is down and back to the middle when none is, so tapping holds it part-way. */
function steerKeys(g, s, want, extra) {
  const st = g.p.steer, keys = [...extra];
  if (Math.abs(want) < 0.06 && Math.abs(st) < 0.12) { /* hands off: the steering assist lines the car up */ }
  else if (want > st + 0.02) { if (want > 0 || st < want - 0.1) keys.push('right'); }
  else if (want < st - 0.02) { if (want < 0 || st > want + 0.1) keys.push('left'); }
  s.hold(keys);
}

/** Turn the wheel to curve onto a point (pure pursuit), with the game's own steering rate. */
function pursue(g, tx, tz, gain = 1) {
  const p = g.p, v = Math.hypot(p.vx, p.vz);
  const alpha = wrapA(Math.atan2(tx - p.x, tz - p.z) - p.h), Ld = Math.hypot(tx - p.x, tz - p.z);
  if (Math.abs(alpha) > 1.2) return Math.sign(alpha);          // facing well away (after a spin): full lock round
  const kappa = 2 * Math.sin(alpha) / Math.max(40, Ld);
  const sf = Math.max(0.2, clamp(v / 220, -1, 1)), sl = p.slide * p.slide * (3 - 2 * p.slide);
  return clamp(gain * v * kappa / (2.2 * (1 + sl * 0.62) * sf), -1, 1);
}

function coinBot(g, s, b) {
  const p = g.p, T = g.T, m = b.mem, v = Math.hypot(p.vx, p.vz);
  // the next coin far enough ahead to curve onto (a slower player aims at the one under the bonnet, and late)
  const lead = 40 + (0.1 + 0.25 * b.skill) * v;
  let best = null, bd = 1e9;
  for (const c of g.coins) {
    if (c.got) continue;
    const ahead = mod(c.d - p.prog, T.L);
    if (ahead < lead || ahead > 900) continue;
    if (ahead < bd) { bd = ahead; best = c; }
  }
  if (!m.aimT || b.t > m.aimT) { m.aimT = b.t + 0.8; m.aim = (b.rand() * 2 - 1) * (1 - b.skill) * 0.3 * T.halfW; }
  const off = best ? clamp(best.off + m.aim, -0.8 * T.halfW, 0.8 * T.halfW) : 0;
  const [tx, tz] = at(T, best ? best.d : p.prog + lead + 100, off);
  steerKeys(g, s, pursue(g, tx, tz), []);
}

function bot(g, s, b) {
  const m = b.mem, p = g.p, T = g.T, hw = T.halfW;
  if (g.tuneT > 0) { if (!m.tuned) { s.keyDown('action'); m.tuned = true; } else s.hold([]); return; }   // pick the station: Space
  if (g.count > 0 || p.finished) { s.hold([]); return; }
  if (g.bonus) return coinBot(g, s, b);
  const v = Math.hypot(p.vx, p.vz);
  // re-read the road every so often (an expert every frame)
  const every = (1 - b.skill) * 0.25;
  if (m.next == null || b.t >= m.next || s.livesLost !== m.lives) {
    m.next = b.t + every; m.lives = s.livesLost;
    if (!m.wanderT || b.t > m.wanderT) { m.wanderT = b.t + 1 + b.rand() * 2; m.wander = (b.rand() * 2 - 1) * (1 - b.skill) * 0.45 * hw; }
    const look = (50 + 30 * b.skill) + (0.2 + 0.12 * b.skill) * v;
    // racing line: the inside of the bend at the look point (a weaker driver cuts it less)
    const kl = kMean(T, p.prog + look * 0.6, p.prog + look * 1.8);
    let off = clamp(kl / 0.004, -1, 1) * (0.2 + 0.35 * b.skill) * hw + m.wander;
    // oil ahead on that line: go round it (if it's been spotted)
    const seen = (m.seen ??= new WeakMap());
    for (const o of g.oils) {
      const ahead = mod(o.d - p.prog, T.L);
      if (ahead < 20 || ahead > 450) continue;
      if (!seen.has(o)) seen.set(o, b.rand() < 0.4 + 0.6 * b.skill);
      if (seen.get(o) && Math.abs(off - o.off) < o.r + CAR_R + 18) off = o.off + Math.sign(off - o.off || -o.off || 1) * (o.r + CAR_R + 24);
    }
    m.off = clamp(off, -0.75 * hw, 0.75 * hw); m.look = look;
    // a straight coming up and the meter charged: fire the boost (a cautious driver saves it)
    m.boost = p.charge >= (b.skill >= 1 ? 0.5 : 0.8) && p.boostT <= 0 && kMax(T, p.prog, p.prog + v * 1.2) < 0.0016 && b.rand() < 0.3 + 0.7 * b.skill;
  }
  const extra = [];
  if (m.boost && p.charge >= BOOST_MIN) { if (!m.up) { extra.push('up'); m.up = true; } } else m.up = false;
  // the hands: an expert corrects the wheel every frame; a slower driver sets it, holds it a moment
  // (over- or under-steering a little) and only then looks again
  if (m.wheelAt == null || b.t >= m.wheelAt) {
    const [tx, tz] = at(T, p.prog + m.look, m.off);
    m.wheelAt = b.t + (1 - b.skill) * (0.08 + b.rand() * 0.2);
    m.want = pursue(g, tx, tz, (0.85 + 0.15 * b.skill) * (1 + (b.rand() * 2 - 1) * (1 - b.skill) * 0.6));
  }
  steerKeys(g, s, m.want, extra);
}

// ── rules ──
const watch = new WeakMap();            // per game: when the race result was decided

export default {
  levels: 20,
  // three laps of a ~8–10 km circuit at ~600–730 top speed: an expert takes 40–55 s (a boss duel
  // is one lap, ~25 s). The wrong-way mistake waits for the rivals to finish the race (up to
  // ~75 s), then the race starts again from the grid.
  limit: () => 260,
  stuck: 10,                            // the car is never stopped: the countdown is 2 s, a spin-out 0.9 s
  progress: (g) => Math.floor(g.p.prog / 40),

  invariants(g, s) {
    const p = g.p, T = g.T, hw = T.halfW, maxV = g.maxV;
    for (const [k, v] of [['x', p.x], ['z', p.z], ['vx', p.vx], ['vz', p.vz], ['heading', p.h], ['prog', p.prog], ['lat', p.lat], ['charge', p.charge], ['steer', p.steer], ['slide', p.slide]]) if (!Number.isFinite(v)) return `the car's ${k} is ${v}`;
    const v = Math.hypot(p.vx, p.vz);
    // top speed ×1.32 while boosting, plus the boost's kick (≤ 200) and a boost pad's (140) on top
    const cap = maxV * 1.32 + 360;
    if (v > cap) return `the car drives at ${v.toFixed(0)} (cap ${cap.toFixed(0)}, top speed ${maxV.toFixed(0)})`;
    if (Math.abs(p.lat) > hw + RUNOFF + 1e-3) return `the car is ${Math.abs(p.lat).toFixed(0)} from the middle, through the wall (${(hw + RUNOFF).toFixed(0)})`;
    if (p.charge < 0 || p.charge > 1 + 1e-9) return `the boost meter is at ${p.charge}`;
    if (Math.abs(p.steer) > 1 + 1e-9 || p.slide < 0 || p.slide > 1 + 1e-9) return `steering ${p.steer} / slide ${p.slide} out of range`;
    if (p.lapDone < 0 || p.lapDone > g.laps) return `${p.lapDone} laps done of ${g.laps}`;
    if (g.bonus ? g.rivals.length !== 0 : g.rivals.length !== (g.boss ? 1 : 5)) return `${g.rivals.length} rivals on a ${g.bonus ? 'Coin Rush' : g.boss ? 'boss duel' : 'race'}`;
    let fin = 0;
    for (const rv of g.rivals) {
      if (![rv.d, rv.off, rv.v, rv.x, rv.z].every(Number.isFinite)) return `${rv.name}'s position is not a number`;
      if (Math.abs(rv.off) > hw + RUNOFF - CAR_R + 1e-3) return `${rv.name} is through the wall (offset ${rv.off.toFixed(0)})`;
      const rcap = rv.vmax * 1.26 * 1.25 + 90;              // its top speed, the catch-up push (≤ 26%) and a boost (×1.25)
      if (rv.v < 0 || rv.v > rcap) return `${rv.name} drives at ${rv.v.toFixed(0)} (cap ${rcap.toFixed(0)})`;
      if (rv.finished) fin++;
    }
    if (fin !== g.finishedRivals) return `${fin} rivals have finished but the race counts ${g.finishedRivals}`;
    if (!g.bonus) {
      // once enough rivals are home that you can't qualify, the race is lost (and it costs a life)
      if (!p.finished && g.finishedRivals >= need(g.level) && g.result !== 'fail') return `${g.finishedRivals} rivals are home (top ${need(g.level)} qualify) but the race goes on`;
      if (p.finished && p.place < 1) return 'the car finished in no place';
      if (g.result === 'win' && p.place > need(g.level)) return `a win was given for ${p.place}th (top ${need(g.level)} qualify)`;
      let w = watch.get(g);
      if (!w || w.lives !== s.livesLost) { w = { lives: s.livesLost, at: null }; watch.set(g, w); }
      if (g.result && w.at == null) w.at = s.time;
      if (!g.result) w.at = null;
      if (w.at != null && s.time - w.at > 4) return `the race was decided (${g.result}) ${(s.time - w.at).toFixed(1)} s ago and nothing happened`;
    }
    if (g.coinsGot < 0) return 'a negative coin count';
    return null;
  },

  bot,

  mistake(g, s, b) {
    const m = b.mem, p = g.p, T = g.T;
    m.l0 ??= s.livesLost;
    if (s.livesLost > m.l0) { s.hold([]); return true; }        // the race was lost: back to racing
    if (g.tuneT > 0) { if (!m.tuned) { s.keyDown('action'); m.tuned = true; } else s.hold([]); return false; }
    if (g.count > 0 || g.result) { s.hold([]); return false; }
    // turned round: aim at a point behind on the track
    const [tx, tz] = at(T, p.prog - 160, 0);
    steerKeys(g, s, pursue(g, tx, tz, 1.5), []);
    return false;
  },
};

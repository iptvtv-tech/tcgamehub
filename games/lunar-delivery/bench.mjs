// Benchmark contract for Lunar Delivery 3D (see tools/bench.mjs).
// The bot is a careful pilot flying with the same controls as a phone player: the stick (tilt and
// turn) and the THRUST button. It lifts off, hovers over the crate until the hook bites, climbs
// clear of the base buildings and the ridges ahead, cruises to the next pad, steers round erupting
// geysers and falling meteors, picks up fuel canisters that lie on its way, and lowers the crate
// onto the pad. It tops the tank up on the pad between deliveries. Lower skill flies faster, brakes
// later and sets the crate down harder.
// From level 14 the heavy-crate legs take it several tries: dipping for a fuel canister puts the
// crate where a meteor can reach it, and two hits smash it.
// The mistake: climb, cut the engine and drop out of the sky.
import { PHYS, PAD_R, HALF } from './world.js';

const HOOK = 1.1, CRATE_H = 0.92;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Highest ground on the line from (x, z) to `ahead` metres along (dx, dz), and around the hopper. */
function ridge(g, x, z, dx, dz, ahead) {
  let top = -1e9;
  for (let d = -8; d <= ahead; d += 5) top = Math.max(top, g.W.ground(x + dx * d, z + dz * d));
  return top;
}

/** Highest ground within R metres of (x, z). */
function groundAround(g, x, z, R) {
  let top = g.W.ground(x, z);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, cx = Math.cos(a), sz = Math.sin(a);
    top = Math.max(top, g.W.ground(x + cx * R, z + sz * R), g.W.ground(x + cx * R * 0.5, z + sz * R * 0.5));
  }
  return top;
}

/** Steer round anything standing on the way to (tx, tz): returns the point to aim at instead. */
function roundHazards(g, tx, tz, hooked) {
  const p = g.p, dx = tx - p[0], dz = tz - p[2], dist = Math.hypot(dx, dz) || 1e-6, ux = dx / dist, uz = dz / dist;
  const rings = [];
  for (const gy of g.W.geysers) if (p[1] - gy.y < 56) rings.push({ x: gy.x, z: gy.z, r: 12 });
  for (const d of g.W.domes) if (p[1] - (hooked ? 9 : 0) < d.y + d.r + 3) rings.push({ x: d.x, z: d.z, r: d.r + 5.5 });
  for (const m of g.W.masts) if (p[1] - PHYS.FEET < m.y + m.h + 2.5) rings.push({ x: m.x, z: m.z, r: 5.5 });
  let best = null, bd = 1e9;
  for (const c of rings) {
    const cx = c.x - p[0], cz = c.z - p[2], along = cx * ux + cz * uz, side = cx * uz - cz * ux;
    if (along < -c.r || along > Math.min(dist, 60) || Math.abs(side) > c.r) continue;
    if (Math.hypot(tx - c.x, tz - c.z) < c.r) continue;              // the goal itself is inside: nothing to gain
    if (along < bd) { bd = along; best = { c, side }; }
  }
  if (!best) return [tx, tz];
  // pass on the side we are already leaning to (side > 0: the hazard lies to the right of the course)
  const k = best.side > 0 ? 1 : -1, R = best.c.r + 3;                 // the left-hand vector of the course is (-uz, ux)
  return [best.c.x - uz * k * R, best.c.z + ux * k * R];
}

/** Fly towards (tx, tz) and hold altitude `alt`. vmax = top horizontal speed. */
function fly(g, s, { tx, tz, alt, vmax, climb = 5, sink = 3, push = 0, through = false }, noise = 0, b = null) {
  const p = g.p, v = g.v;
  const ex = tx - p[0], ez = tz - p[2];
  const dist = Math.hypot(ex, ez) || 1e-6, ux = ex / dist, uz = ez / dist;
  const sp = through ? vmax : Math.min(vmax, Math.sqrt(2 * 0.6 * dist), dist * 0.9);
  // speed along the course, and the drift across it (killed first: that is what makes it hit the mark)
  const along = v[0] * ux + v[2] * uz, sx = v[0] - along * ux, sz = v[2] - along * uz;
  let cx = ux * (sp - along) * 1.1 - sx * 2.6, cz = uz * (sp - along) * 1.1 - sz * 2.6;
  if (noise && b) { cx += (b.rand() - 0.5) * noise; cz += (b.rand() - 0.5) * noise; }
  // a meteor on its way (2.4 s of warning) that would catch the hopper or the crate: full power away from it
  let dodge = false;
  const cr = g.crate?.hooked ? g.crate.c : null;
  for (const m of g.meteors) {
    if (m.done) continue;
    const left = Math.max(0, m.warn - m.t), reach = m.r + 2.5;
    const hx = p[0] + v[0] * left, hz = p[2] + v[2] * left;
    const dh = Math.hypot(hx - m.to[0], p[1] - m.to[1], hz - m.to[2]);
    const dc = cr ? Math.hypot(cr[0] + v[0] * left - m.to[0], cr[1] - m.to[1], cr[2] + v[2] * left - m.to[2]) : 1e9;
    if (dh > reach && dc > reach) continue;
    const ax = hx - m.to[0], az = hz - m.to[2], l = Math.hypot(ax, az) || 1;
    cx = ax / l * 9; cz = az / l * 9; dodge = true;
  }
  if (dodge && b && b.rand() < (1 - b.skill) * 0.01) dodge = false;   // a weaker pilot is slow to see it
  const want = Math.hypot(cx, cz);
  let tilt = 0, turn = 0;
  if (want > 0.05) {
    let e = wrap(Math.atan2(cx, cz) - g.yaw), back = false;
    if (Math.abs(e) > Math.PI / 2) { e = wrap(e + Math.PI); back = true; }
    turn = clamp(-e * 4, -1, 1);
    tilt = clamp(want / 0.8, 0, 1) * Math.cos(e) * (back ? -1 : 1);
  }
  g.stick = { id: 'bot', dx: turn, dy: -tilt };
  // altitude: hold a climb rate; burn when below it
  const wantVy = clamp((alt - p[1]) * 0.9, -sink, climb);
  // `push`: a pilot in a hurry keeps the engine lit while tilted, trading a little height for speed
  const hurry = push > 0 && want > 1.5 && Math.abs(tilt) > 0.8 && p[1] < alt + push && v[1] < 3;
  s.hold(v[1] < wantVy || hurry || (dodge && Math.abs(tilt) > 0.5 && v[1] < 5) ? ['action'] : []);
}

export default {
  levels: 20,
  limit: (level) => 600 + level * 60,     // from level 14 the heavy legs take several tries (meteors on the crate)
  stuck: 200,                               // a long leg with a refuel stop is well under this

  progress: (g) => (g.bonus ? 0 : g.leg * 2 + (g.crate?.hooked ? 1 : 0)),

  invariants(g) {
    for (const k of [0, 1, 2]) if (!Number.isFinite(g.p[k]) || !Number.isFinite(g.v[k])) return 'the hopper position or speed is not a number';
    if (Math.abs(g.p[0]) > HALF + 40 || Math.abs(g.p[2]) > HALF + 40) return `the hopper left the map at (${g.p[0].toFixed(0)}, ${g.p[2].toFixed(0)})`;
    if (g.p[1] > g.W.ceiling + 60) return `the hopper is ${(g.p[1] - g.W.ceiling).toFixed(0)} m above the flying ceiling`;
    if (g.p[1] - PHYS.FEET < g.W.ground(g.p[0], g.p[2]) - 0.5) return 'the hopper is under the ground';
    if (!(g.fuel >= 0 && g.fuel <= 100)) return `fuel is ${g.fuel}`;
    if (!g.bonus && g.leg > g.legs) return `delivery ${g.leg} of ${g.legs}`;
    const c = g.crate;
    if (c && (!Number.isFinite(c.c[0]) || !Number.isFinite(c.c[1]) || !Number.isFinite(c.c[2]) || !Number.isFinite(c.dmg))) return 'the crate position or damage is not a number';
    return null;
  },

  bot(g, s, b) {
    const sloppy = 1 - b.skill, p = g.p, m = b.mem;
    const noise = sloppy * 1.2;
    if (g.bonus) {                                          // stardust storm: chase the nearest star
      let best = null, bd = 1e9;
      for (const d of g.W.dust) { if (d.got) continue; const dd = Math.hypot(d.x - p[0], d.y - p[1], d.z - p[2]); if (dd < bd) { bd = dd; best = d; } }
      if (!best) return s.hold([]);
      return fly(g, s, { tx: best.x, tz: best.z, alt: best.y, vmax: 12 }, noise, b);
    }
    const c = g.crate;
    if (!c) return s.hold([]);
    const padHere = g.W.pads[c.pad], T = g.W.pads[c.pad + 1];
    const here = g.W.ground(p[0], p[2]);

    if (!c.hooked) {
      // top the tank up on the pad first (landed in the middle, away from both crates)
      const onPad = g.landed && g.padUnder();
      if (onPad && g.fuel < 99.5 && !m.goUp) { g.stick = null; return s.hold([]); }
      if (onPad) m.goUp = true;
      if (!g.landed && !m.goUp && g.fuel < 88 - sloppy * 35) {
        const d = Math.hypot(p[0] - padHere.x, p[2] - padHere.z), sp = Math.hypot(g.v[0], g.v[2]);
        return fly(g, s, { tx: padHere.x, tz: padHere.z, alt: d < 2.5 && sp < 1.5 ? padHere.y : padHere.y + 7, vmax: 4, sink: 2.2 }, noise, b);
      }
      const hookAlt = c.c[1] + CRATE_H + HOOK + 3.4;
      const [ax, az] = roundHazards(g, c.c[0], c.c[2], false);
      return fly(g, s, { tx: ax, tz: az, alt: hookAlt, vmax: 6 }, noise, b);
    }
    m.goUp = false;
    const hang = PHYS.CABLE + HOOK + CRATE_H;               // hopper centre to the crate's underside
    const heavy = c.kind === 'heavy';
    const dPad = Math.hypot(p[0] - T.x, p[2] - T.z);
    const sp = Math.hypot(g.v[0], g.v[2]);

    // fuel: is the pad in reach, or is a canister on this leg needed? Once chosen, it stays the
    // goal until it is picked up.
    const perM = g.burn * (heavy ? 0.16 : 0.11);          // % of the tank per metre, flown well
    if (m.canKey !== `${c.pad}:${s.livesLost}`) { m.canKey = `${c.pad}:${s.livesLost}`; m.can = null; }
    if (m.can?.got) m.can = null;
    if (!m.can && (g.fuel < perM * dPad * 1.3 + 16 || g.fuel < 45 || (heavy && g.fuel < 100 - PHYS.CAN * 0.6))) {
      const lx = T.x - p[0], lz = T.z - p[2];
      let bd = 1e9;
      for (const f of g.W.fuel) {
        if (f.got || f.leg !== c.pad) continue;
        const fx = f.x - p[0], fz = f.z - p[2], d = Math.hypot(fx, fz), along = (fx * lx + fz * lz) / (dPad || 1);
        if (along > -6 && along < dPad + 6 && d < bd && Math.hypot(f.x - T.x, f.z - T.z) < dPad + 12) { bd = d; m.can = f; }
      }
    }
    const can = m.can;
    let tx = T.x, tz = T.z;
    if (can) { tx = can.x; tz = can.z; }
    const goalDist = Math.hypot(tx - p[0], tz - p[2]) || 1;
    [tx, tz] = roundHazards(g, tx, tz, true);
    const dx = tx - p[0], dz = tz - p[2], dist = Math.hypot(dx, dz) || 1, ux = dx / dist, uz = dz / dist;

    // cruising height: the crate clear of the ground in the stretch ahead, and (once meteors fall,
    // from level 6) high enough that a strike anywhere near reaches neither crate nor hopper
    const top = ridge(g, p[0], p[2], ux, uz, Math.min(dist, 40 + sp * 5));
    const nearTop = ridge(g, p[0], p[2], ux, uz, Math.min(dist, 12));
    const blast = g.meteorRate ? (g.level >= 14 ? 9 : 7.5) + 1.5 : 0;
    const under = blast ? groundAround(g, p[0] + g.v[0] * 2.5, p[2] + g.v[2] * 2.5, 13) : nearTop;
    let alt = Math.max(top + hang + 3 - sloppy * 1.5, under + hang + blast);
    let vmax = (heavy ? 9 : 13) + sloppy * 4, sink = 3, push = goalDist > 60 ? 22 : 8;
    const through = false;
    if (can) {
      // hover down onto the canister: stay high until close, then just low enough to reach it
      // (within 3.4 m of the hopper) with the crate barely off the ground
      vmax = Math.min(vmax, 2 + goalDist * 0.35);
      if (goalDist < 22) {
        const crateGnd = groundAround(g, c.c[0], c.c[2], 3);
        alt = Math.min(can.y + 2.9, Math.max(can.y + 1.2, crateGnd + hang + 0.3));
        alt = Math.max(alt, groundAround(g, p[0], p[2], 3) + PHYS.FEET + 1.6);   // feet off the slope
        sink = 6; push = 0;
      }
    } else if (dPad < 10) vmax = 4;
    // the crate must clear the ground just ahead before the hopper moves off
    if (p[1] < nearTop + hang + 0.8 && !(can && goalDist < 22)) vmax = Math.min(vmax, 1.5);
    // over the pad and steady: lower the crate
    const swing = Math.hypot(c.c[0] - p[0], c.c[2] - p[2]);
    if (!can && dPad < 3.2 + sloppy * 2.5 && sp < 1.6 + sloppy * 2 && swing < 2.2 + sloppy * 2) {
      alt = T.y + hang - 1.5; sink = (c.kind === 'fragile' ? 0.8 : 1.1) + sloppy * 3.2;
      if (c.c[1] - CRATE_H - T.y > 3) sink = Math.max(sink, 2.6);
    } else if (!can && dPad < 9) alt = Math.max(T.y + hang + 2.5, here + hang + 1);   // come down over the pad while lining up
    // never let the crate come down hard: it breaks at about 3 m/s (a fragile one at under 2)
    const crateUp = c.c[1] - CRATE_H - g.W.ground(c.c[0], c.c[2]);
    if (crateUp < 6) sink = Math.min(sink, (c.kind === 'fragile' ? 1.2 : 1.9) + sloppy * 2.5);
    fly(g, s, { tx, tz, alt, vmax, sink, push, through }, noise, b);
  },

  // climb, then cut the engine and fall
  mistake(g, s, b) {
    const m = b.mem;
    m.lives0 ??= s.livesLost;
    if (s.livesLost > m.lives0) { s.hold([]); g.stick = null; return true; }
    g.stick = null;
    const high = g.p[1] - PHYS.FEET - g.W.ground(g.p[0], g.p[2]);
    if (!m.drop && high < 16) s.hold(['action']); else { m.drop = true; s.hold([]); if (g.landed) m.drop = false; }
    return false;
  },
};

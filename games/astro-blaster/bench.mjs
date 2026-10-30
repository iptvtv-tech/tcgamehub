// Benchmark contract for Astro Blaster (see tools/bench.mjs). The bot flies like a mouse player:
// it holds Space to fire and moves the ship by pointing (onPointerMove with the button up, the way
// the engine passes a hovering mouse). Every look it lines up a lead shot on the nearest rock it
// can reach, then picks the spot along the bottom of the screen that keeps the ship clear of every
// rock, comet and UFO shot it can see coming over the next second. Lower skill looks less often,
// sees less far ahead, leaves a thinner gap and aims sloppier. The mistake: stop firing and fly
// into the nearest rock (until it really costs a life — a shield only postpones it).
const W = 480, H = 720, SHIP_R = 13;
const LOW_Y = H - 48;                        // an expert hugs the bottom (most warning); others sit higher
const sitY = (b) => LOW_Y - (1 - b.skill) * 160;
let SHIP_Y = LOW_Y;                          // this bot's flying height (set every frame from its skill)
const XS = Array.from({ length: 37 }, (_, i) => 24 + i * 12);   // candidate spots, 24…456

/** Where a falling rock will be in t seconds (bouncing off the side walls as the game does). */
function at(k, t) {
  let x = k.x + k.vx * t;
  const y = k.y + k.vy * t;
  if (k.type !== 'comet' && k.r) {
    const lo = k.wall ?? k.r, hi = W - lo, span = hi - lo;
    if (span > 0) { let u = (x - lo) % (2 * span); if (u < 0) u += 2 * span; x = lo + (u > span ? 2 * span - u : u); }
  }
  return [x, y];
}

/** Everything that can hurt the ship and that the bot has noticed, as moving circles. A worse
 *  player overlooks some rocks and shots until they are close (b.mem.seen remembers who saw what). */
function threats(g, b) {
  const seen = (b.mem.seen ??= new WeakMap()), out = [];
  const react = (1 - b.skill) * 0.45;                          // s from spotting a threat to acting on it
  const noticed = (o) => {
    let n = seen.get(o);
    if (!n) { n = { near: b.rand() < (1 - b.skill) * 0.7 ? 60 + b.rand() * 120 : Infinity, at: null }; seen.set(o, n); }
    if (n.at == null && (n.near === Infinity || Math.hypot(o.x - g.ship.x, o.y - g.ship.y) < n.near)) n.at = b.t;
    return n.at != null && b.t - n.at >= react;
  };
  for (const k of g.rocks) if (k.type !== 'gem' && !k.dead && noticed(k)) out.push({ x: k.x, y: k.y, vx: k.vx, vy: k.vy, r: k.r * 0.82, type: k.type, wall: k.r });
  for (const e of g.enemyShots) if (!e.gone && noticed(e)) out.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, r: 5, type: 'shot' });
  return out;
}

/** Danger of sending the ship towards x: how soon it would touch something (1e5-scale), plus a
 *  soft cost for passing close. Sampled every 1/60 s while the ship is still sliding over. */
function danger(g, list, x, horizon, margin, hand) {
  const sh = g.ship, sy = SHIP_Y, dx = x - sh.x;
  let hard = 0, soft = 0;
  for (const k of list) {
    if (k.y > sh.y + 80 && k.vy >= 0) continue;               // already behind the ship
    if (k.y + Math.max(0, k.vy) * horizon < sy - k.r - SHIP_R - 60) continue;   // can't get here in time
    const rr = k.r + SHIP_R + margin;
    let clear = Infinity;
    for (let t = 0; t <= horizon; t += t < 0.4 ? 1 / 60 : 0.04) {
      const reach = hand * Math.max(0, t - 0.05);             // the hand moves the pointer, the ship follows ~0.05 s behind
      const shx = sh.x + Math.max(-reach, Math.min(reach, dx)), shy = sy + (sh.y - sy) * Math.exp(-14 * t);
      const [kx, ky] = k.type === 'shot' ? [k.x + k.vx * t, k.y + k.vy * t] : at(k, t);
      const c = Math.hypot(kx - shx, ky - shy) - rr;
      if (c < 0) { hard = Math.max(hard, 2 - t); break; }
      if (c < clear) clear = c;
    }
    if (clear < 40) soft += (40 - clear) * 4;
  }
  return hard * 1e5 + soft;
}

/** The x to sit at so a bullet meets this rock (lead for its drift). */
function leadX(g, k) {
  const tb = Math.max(0, (SHIP_Y - 20 - k.y) / (720 + Math.max(0, k.vy)));
  return at(k, tb)[0];
}

/** How fast this player can sweep the mouse across (px/s). */
const handSpeed = (b) => 500 + b.skill * 1300;

function plan(g, s, b) {
  const skill = b.skill;
  const horizon = 0.3 + skill * 0.85;                        // seconds it looks ahead
  const margin = 1 + skill * 9;                               // px it keeps clear
  const list = threats(g, b);
  // what to shoot: shock rocks first (they clear the area), then the lowest rock still above us
  const targets = g.rocks.filter((k) => k.type !== 'gem' && k.type !== 'comet' && k.y > 0 && k.y < SHIP_Y - 70);
  targets.sort((p, q) => (q.type === 'shock') - (p.type === 'shock') || q.y - p.y);
  let want = g.ship.x;
  if (g.bonus) {                                              // crystal storm: catch the nearest gems
    const gem = g.rocks.filter((k) => k.type === 'gem' && k.y < SHIP_Y).sort((p, q) => q.y - p.y)[0];
    if (gem) want = at(gem, Math.max(0, (SHIP_Y - gem.y) / gem.vy))[0];
  } else if (g.caps.length && g.caps[0].y < SHIP_Y - 20) want = g.caps[0].x;
  else if (targets.length) want = leadX(g, targets[0]);
  if (g.ufo && !targets.length) want = g.ufo.x + g.ufo.vx * 0.5;
  want += (b.rand() - 0.5) * (1 - skill) * 60;                // aim noise
  let best = null, bestCost = Infinity;
  for (const x of XS) {
    const d = g.bonus ? 0 : danger(g, list, x, horizon, margin, handSpeed(b));
    const cost = d + Math.abs(x - want) + Math.abs(x - g.ship.x) * 0.15;
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  return best;
}

export default {
  levels: 20,                                   // endless game: bench levels 1–20
  // level L needs 12 + 3L rocks; a rock spawns every max(0.28, 1.15 / speed) s (≈1.1 s at L1,
  // ≈0.5 s from L13), so the expert needs ~25–50 s; the limit leaves room for the mistake
  limit: (level) => 60 + level * 5,
  stuck: 20,                                    // rocks keep coming: 20 s without a kill = stuck

  progress: (g) => g.kills,

  invariants(g, s) {
    const sh = g.ship;
    if (![sh.x, sh.y, sh.tx, sh.ty].every(Number.isFinite)) return 'the ship position is not a number';
    if (sh.x < 24 - 0.5 || sh.x > W - 24 + 0.5 || sh.y < H * 0.42 - 0.5 || sh.y > H - 40 + 0.5) return `the ship left its box at (${sh.x.toFixed(1)}, ${sh.y.toFixed(1)})`;
    if (!g.bonus && g.kills > g.need) return `kills ${g.kills} over the target ${g.need} while still playing`;
    if (!Number.isInteger(g.kills) || g.kills < 0) return `kills is ${g.kills}`;
    if (g.bonus && g.kills !== 0) return `the crystal storm counted ${g.kills} kills`;
    if (g.spreadT < 0 || g.spreadT > 10 || g.rapidT < 0 || g.rapidT > 10) return `power-up timers out of range (spread ${g.spreadT}, rapid ${g.rapidT})`;
    for (const k of g.rocks) {
      if (![k.x, k.y, k.vx, k.vy].every(Number.isFinite)) return `a ${k.type} has a position or speed that is not a number`;
      const v = Math.hypot(k.vx, k.vy);
      const cap = k.type === 'comet' ? Math.hypot(330, 170) * 2.2 + 1 : k.type === 'gem' ? 270 : 130 * 2.2 + 120;
      if (v > cap) return `a ${k.type} is moving at ${v.toFixed(0)} px/s (cap ${cap.toFixed(0)})`;
      if (k.type !== 'comet' && (k.x < -1 || k.x > W + 1)) return `a ${k.type} left the sides at x=${k.x.toFixed(0)}`;
    }
    for (const bl of g.bullets) if (Math.abs(Math.hypot(bl.vx, bl.vy) - 720) > 1) return 'a bullet is not flying at 720 px/s';
    if (g.rocks.length > 200 || g.bullets.length > 200) return `too many objects (${g.rocks.length} rocks, ${g.bullets.length} bullets)`;
    if (g.ufo && (g.ufo.hp < 1 || g.ufo.hp > 5)) return `the UFO has ${g.ufo.hp} hp`;
    if (s.lives < 0) return `lives ${s.lives}`;
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    SHIP_Y = sitY(b);
    if (m.crash) {                                            // finishing the mistake
      if (s.livesLost > m.crash.lives) m.crash = null;
      else return crashInto(g, s);
    }
    const every = 0.01 + (1 - b.skill) * 0.4;                 // seconds between looks
    if (m.next == null || b.t >= m.next) { m.x = plan(g, s, b) + (b.rand() - 0.5) * (1 - b.skill) * 50; m.next = b.t + every; }   // + a shaky hand
    s.hold(['action']);
    const px = s.input.pointer.x, step = handSpeed(b) / 120;
    s.pointerMove(px + Math.max(-step, Math.min(step, m.x - px)), SHIP_Y);
  },

  mistake(g, s, b) {
    if (!crashInto(g, s)) return false;
    b.mem.crash = { lives: s.livesLost };
    return true;
  },
};

/** Stop firing and fly at the nearest rock. Returns false when there is none to hit. */
function crashInto(g, s) {
  s.hold([]);
  const sh = g.ship;
  const k = g.rocks.filter((r) => r.type !== 'gem' && r.y > 0 && r.y < sh.y + 10).sort((p, q) => q.y - p.y)[0];
  if (!k) return false;
  const t = Math.max(0, (sh.y - k.y) / Math.max(60, k.vy));
  const [x, y] = at(k, t * 0.8);
  s.pointerMove(x, Math.max(y, H * 0.42));
  return true;
}

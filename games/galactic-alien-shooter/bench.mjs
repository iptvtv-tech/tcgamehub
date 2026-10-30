// Benchmark contract for Galactic Alien Shooter (see tools/bench.mjs). The bot flies like a mouse
// player: it holds Space to fire and steers by pointing (onPointerMove with the button up, the
// way the engine passes a hovering mouse), staying on the bottom row for the most warning. Every
// look it works out where each thing that can hurt it will be over the next second — pellets and
// shrapnel (bombs burst on a timer), mines and missiles, diving ships along their dive paths,
// lancer lasers, carrier abduction beams, boss lasers — then picks the spot along the row that
// stays clear of all of it while lining up a lead shot on a ship (or the boss), grabbing a capsule
// when one falls nearby. Lower skill looks less often, sees threats later and less far ahead,
// leaves a thinner gap, moves the mouse slower and aims sloppier. The mistake: stop firing and fly
// into the next diving ship or shot (until it really costs a life — a shield only postpones it).
const W = 480, H = 720, PY = H - 74, YMIN = 330, SHIP_R = 14, TWIN = 15, HUD_H = 44;
const BEAM = { grow: 0.5, hold: 1.9, shrink: 0.5 };
const LANCE = { charge: 0.75, fire: 0.4 };
const MAX_LIVES = 5;
const XS = Array.from({ length: 37 }, (_, i) => 24 + i * 12);   // candidate spots, 24…456
const DTS = 1 / 30;                                              // prediction sample step (s)

/** Same path follower as the game's follow(): returns positions every DTS s for n samples. */
function pathTrack(a, speed, n) {
  const out = new Float64Array(2 * (n + 1));
  let x = a.x, y = a.y, pi = a.pi;
  const path = a.path || [];
  out[0] = x; out[1] = y;
  for (let j = 1; j <= n; j++) {
    let move = speed * DTS;
    while (move > 0 && pi < path.length) {
      const [tx, ty] = path[pi], dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
      if (d <= move) { x = tx; y = ty; move -= d; pi++; } else { x += (dx / d) * move; y += (dy / d) * move; move = 0; }
    }
    if (pi >= path.length && move > 0) y = -999;                // path over (gone or back to formation)
    out[2 * j] = x; out[2 * j + 1] = y;
  }
  return out;
}
function lineTrack(x, y, vx, vy, n, t0 = 0) {
  const out = new Float64Array(2 * (n + 1));
  for (let j = 0; j <= n; j++) {
    const t = j * DTS - t0;
    if (t < 0) { out[2 * j] = -999; out[2 * j + 1] = -999; continue; }
    out[2 * j] = x + vx * t; out[2 * j + 1] = y + vy * t;
  }
  return out;
}

/** A mine or missile steering at the ship (the game's turn and speed rules) while the ship
 *  follows shipX[]. */
function homeTrack(e, shipX, sy, n) {
  const out = new Float64Array(2 * (n + 1));
  const m = e.kind === 'missile';
  let x = e.x, y = e.y, vx = e.vx, vy = e.vy, t = e.t || 0, life = e.life;
  out[0] = x; out[1] = y;
  for (let j = 1; j <= n; j++) {
    const want = Math.atan2(sy - y, shipX[j - 1] - x), cur = Math.atan2(vy, vx);
    let d = want - cur; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const turn = m && t > 1.6 ? 0.3 : m ? 2.6 : 1.6;
    const na = cur + Math.max(-turn * DTS, Math.min(turn * DTS, d)), sp = Math.min(m ? 250 : 150, Math.hypot(vx, vy) + (m ? 160 : 30) * DTS);
    vx = Math.cos(na) * sp; vy = Math.sin(na) * sp; x += vx * DTS; y += vy * DTS; t += DTS; life -= DTS;
    out[2 * j] = x; out[2 * j + 1] = life <= 0 ? -999 : y;
  }
  return out;
}

/** Everything that can hurt the ship and that the bot has noticed, over the next n samples:
 *  { pts, r } moving circles, and { col: x(j) → x | null, hw } deadly columns. */
function threats(g, b, n) {
  const seen = (b.mem.seen ??= new WeakMap()), out = [];
  const react = (1 - b.skill) * 0.7;                          // s from spotting a threat to acting on it
  const sh = g.ship;
  const noticed = (o) => {
    let k = seen.get(o);
    if (!k) { k = { near: b.rand() < (1 - b.skill) * 0.8 ? 100 + b.rand() * 160 : Infinity, at: null }; seen.set(o, k); }
    if (k.at == null && (k.near === Infinity || Math.hypot(o.x - sh.x, o.y - sh.y) < k.near)) k.at = b.t;
    return k.at != null && b.t - k.at >= react;
  };
  const speedK = g.speedK, diveSpeed = 200 * speedK;
  for (const a of g.aliens) {
    if (a.dead) continue;
    if (a.state === 'dive') {
      if (!noticed(a)) continue;
      const sp = diveSpeed * (a.type === 'shard' ? 1.3 : a.lanceRun ? 1.9 : 1);
      out.push({ pts: pathTrack(a, sp, n), r: a.r * 0.9 });
      if (a.lancePath && a.path?.length) {                     // flying to its firing spot: the laser comes next
        const [lx, ly] = a.path[a.path.length - 1];
        let left = Math.hypot(a.path[a.pi]?.[0] - a.x || 0, a.path[a.pi]?.[1] - a.y || 0);
        for (let i = a.pi; i < a.path.length - 1; i++) left += Math.hypot(a.path[i + 1][0] - a.path[i][0], a.path[i + 1][1] - a.path[i][1]);
        const t0 = left / sp + LANCE.charge;
        out.push({ col: (j) => (j * DTS >= t0 - 0.1 && j * DTS <= t0 + LANCE.fire + 0.05 ? lx : null), hw: 7 + SHIP_R * 0.75, above: ly });
      }
      if (a.beamDive && a.path?.length) {
        const [bx] = a.path[a.path.length - 1];
        out.push({ col: () => bx, hw: 30, above: 0, beam: true });
      }
    } else if (a.state === 'return') {
      if (a.y > YMIN - 60) out.push({ pts: lineTrack(a.x, a.y, 0, -50, n), r: a.r * 0.9 });
    } else if (a.state === 'lance') {
      const t0 = LANCE.charge - a.lanceT, t1 = t0 + LANCE.fire;
      const x = a.x;
      out.push({ col: (j) => (j * DTS >= t0 - 0.1 && j * DTS <= t1 + 0.05 ? x : null), hw: 7 + SHIP_R * 0.75, above: a.y });
      out.push({ pts: lineTrack(a.x, a.y, 0, diveSpeed * 1.9, n, Math.max(0, t1)), r: a.r * 0.9 });
    } else if (a.state === 'beam') {
      const end = BEAM.grow + BEAM.hold, x = a.x;
      if (a.beamT < end) out.push({ col: (j) => (a.beamT + j * DTS > BEAM.grow - 0.15 && a.beamT + j * DTS < end ? x : null), hw: 30, above: a.y + 20, beam: true });
    }
  }
  for (const e of g.enemyShots) {
    if (e.gone || !noticed(e)) continue;
    if (e.kind === 'bomb') {
      const tb = Math.max(0, (e.burstY - e.y) / e.vy);
      out.push({ pts: lineTrack(e.x, e.y, 0, e.vy, n).map((v, i) => (i % 2 && (i >> 1) * DTS > tb ? -999 : v)), r: e.r * 0.8 });
      const bx = e.x, by = e.burstY, sp = 170 * Math.min(1.3, Math.sqrt(speedK));
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.2;
        out.push({ pts: lineTrack(bx, by, Math.cos(ang) * sp, Math.sin(ang) * sp, n, tb), r: 3 * 0.8 });
      }
    } else if (e.kind === 'mine' || e.kind === 'missile') {
      out.push({ home: e, r: e.r * 0.8 });                     // they steer at the ship: worked out per spot
    } else out.push({ pts: lineTrack(e.x, e.y, e.vx, e.vy, n), r: e.r * 0.8 });
  }
  const bs = g.boss;
  if (bs && bs.hp > 0 && bs.lasers) {
    const L = bs.lasers, t0 = L.charge - L.t, t1 = L.charge + L.dur - L.t;
    const vx = bs.hold > 0 ? 0 : (b.mem.bossVx ?? 0);
    for (const off of L.offs) out.push({ col: (j) => (j * DTS >= t0 - 0.1 && j * DTS <= t1 + 0.05 ? bs.x + vx * j * DTS + off : null), hw: L.w + SHIP_R * 0.75 + 4, above: 0 });
  }
  for (const ln of g.lanes) {
    const t0 = ln.charge - ln.t, t1 = ln.charge + ln.dur - ln.t;
    out.push({ col: (j) => (j * DTS >= t0 - 0.1 && j * DTS <= t1 + 0.05 ? ln.x : null), hw: ln.w + SHIP_R * 0.7, above: 0 });
  }
  return out;
}

/** Danger of heading for x: how soon the ship would touch something (1e5-scale) plus a soft cost
 *  for passing close. The pointer moves at `hand` px/s; the ship eases after it. */
function danger(g, list, x, n, margin, hand) {
  const sh = g.ship, xs = g.dual ? [-TWIN, TWIN] : [0];
  const edge = g.dual ? 24 + TWIN : 24, tx = Math.max(edge, Math.min(W - edge, x));
  let hard = 0, soft = 0;
  const shipX = new Float64Array(n + 1);
  let px = sh.tx, sx = sh.x;
  for (let j = 0; j <= n; j++) {
    shipX[j] = sx;
    const step = hand * DTS; px += Math.max(-step, Math.min(step, tx - px));
    sx += (px - sx) * (1 - Math.exp(-16 * DTS));
  }
  const sy = sh.y;
  for (const k of list) {
    let clear = Infinity;
    if (k.home) k.pts = homeTrack(k.home, shipX, sy, n);
    for (let j = 0; j <= n; j++) {
      if (k.col) {
        const cx = k.col(j);
        if (cx == null || sy <= k.above) continue;
        for (const o of xs) {
          const c = Math.abs(shipX[j] + o - cx) - k.hw - margin;
          if (c < 0) { hard = Math.max(hard, 3 - j * DTS); j = n + 1; break; }
          if (c < clear) clear = c;
        }
      } else {
        const kx = k.pts[2 * j], ky = k.pts[2 * j + 1];
        if (ky < -500 || Math.abs(ky - sy) > 120) continue;
        for (const o of xs) {
          const c = Math.hypot(kx - shipX[j] - o, ky - sy) - k.r - SHIP_R - margin;
          if (c < 0) { hard = Math.max(hard, 3 - j * DTS); j = n + 1; break; }
          if (c < clear) clear = c;
        }
      }
    }
    if (clear < 30) soft += (30 - clear) * 4;
  }
  return hard * 1e5 + soft;
}

/** Where to sit to hit something: the x a bolt fired now meets the chosen target at. */
function aim(g, b) {
  const sh = g.ship, m = b.mem;
  if (g.boss && g.boss.hp > 0 && !g.boss.enter) {
    const tb = Math.max(0, (sh.y - 20 - g.boss.y) / 700);
    return g.boss.x + (g.boss.hold > 0 ? 0 : (m.bossVx ?? 0)) * tb;
  }
  const vel = (m.vel ??= new Map());
  let best = null, bestCost = Infinity;
  // mines, missiles and bombs above the ship can be shot down: those first when they're close
  for (const e of g.enemyShots) {
    if (!e.shootable || e.gone || e.y > sh.y - 50 || e.y < HUD_H) continue;
    const tb = Math.max(0, (sh.y - 20 - e.y) / (700 + Math.max(0, e.vy)));
    const x = e.x + e.vx * tb;
    const cost = Math.abs(x - sh.x) - (e.kind === 'bomb' ? 150 : 400) + Math.max(0, sh.y - e.y - 400);
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  for (const a of g.aliens) {
    if (a.dead || a.state === 'wait' || a.y < HUD_H || a.y > sh.y - 40 || a.captive) continue;
    const v = vel.get(a.id) ?? { vx: 0, vy: 0 };
    const tb = Math.max(0, (sh.y - 20 - a.y) / (700 + Math.max(0, v.vy)));
    const x = a.x + v.vx * tb;
    if (x < 20 || x > W - 20) continue;
    // nearest first; ships diving low are worth taking out early, carriers first if one beams
    const cost = Math.abs(x - sh.x) - (a.state === 'dive' && a.y > 250 ? 80 : 0) - (a === g.beamCarrier ? 200 : 0);
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  return best ?? sh.x;
}

/** How fast this player sweeps the mouse across (px/s). */
const handSpeed = (b) => 400 + b.skill * 1800;

function plan(g, s, b) {
  const skill = b.skill;
  const n = Math.round((0.35 + skill * 0.65) / DTS);              // samples it looks ahead
  const margin = skill * 8 - (1 - skill) * 4;                      // px it keeps clear
  const list = g.bonus ? [] : threats(g, b, n);
  let want = aim(g, b);
  // capsules: worth a detour when they are coming down near the row
  const cap = g.pickups.filter((p) => p.y > PY - 260 && p.y < PY + 10 && Math.abs(p.x - g.ship.x) < 140 + skill * 120)[0];
  if (cap && !g.bonus && b.rand() < 0.3 + skill * 0.7) want = cap.x;
  want += (b.rand() - 0.5) * (1 - skill) * 70;                    // aim noise
  const busy = g.enemyShots.some((e) => !e.gone && (e.kind === 'mine' || e.kind === 'missile' || e.y > PY - 250));
  let best = g.ship.x, bestCost = Infinity;
  for (const x of XS) {
    const d = list.length ? danger(g, list, x, n, margin, handSpeed(b)) : 0;
    const cornered = busy ? Math.max(0, 90 - Math.min(x - 24, W - 24 - x)) * 2 * skill : 0;   // under fire: keep room to run both ways
    const cost = d + Math.abs(x - want) + Math.abs(x - g.ship.x) * 0.15 + cornered;
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  return best;
}

/** Remaining enemies of this level (the fleet still to fly in plus the ships alive) / boss hp. */
function remaining(g) {
  if (g.boss) return g.boss.hp;
  let n = 0;
  for (const w of g.waveQ) if (!w.done) n += w.members.length;
  for (const a of g.aliens) if (!a.dead && a.col >= 0) n++;
  return n;
}

const bonusLives = new WeakMap();

export default {
  levels: 20,                                   // endless game: bench levels 1–20 (5, 10, 15, 20 are STAR RUNs; 9 and 19 bosses)
  // a fleet of 20 (L1), 28 (L2) or 40 ships flies in over ~10 s; the expert clears it in 10–40 s;
  // the bosses (100 hp at L9, 140 at L19) take it 30–60 s; the limits leave room for the mistake
  limit: (level) => (level % 10 === 9 ? 100 : 70),
  stuck: 25,                                    // the fleet keeps diving: 25 s without a kill = stuck

  progress: (g) => (g.boss ? g.boss.maxHp : g.formationSize ?? 0) - remaining(g),

  invariants(g, s) {
    const sh = g.ship, edge = g.dual ? 24 + TWIN : 24;
    if (![sh.x, sh.y, sh.tx, sh.ty].every(Number.isFinite)) return 'the ship position is not a number';
    if (sh.x < 24 - 0.5 || sh.x > W - 24 + 0.5 || sh.y < YMIN - 0.5 || sh.y > PY + 0.5) return `the ship left its box at (${sh.x.toFixed(1)}, ${sh.y.toFixed(1)})`;
    if (sh.tx < edge - 0.5 || sh.tx > W - edge + 0.5) return `the ship's target x ${sh.tx.toFixed(1)} is outside ${edge}…${W - edge}`;
    if (!['blaster', 'laser', 'rockets'].includes(g.weapon)) return `unknown weapon ${g.weapon}`;
    for (const k of ['blaster', 'laser', 'rockets']) if (!(g.pw[k] >= 1 && g.pw[k] <= 3 && Number.isInteger(g.pw[k]))) return `${k} power ${g.pw[k]}`;
    if (g.weaponT < 0 || g.weaponT > 10 || (g.weapon === 'blaster' && g.weaponT !== 0)) return `weapon timer ${g.weaponT} with the ${g.weapon}`;
    if (s.lives < 0 || s.lives > MAX_LIVES) return `lives ${s.lives} (max ${MAX_LIVES})`;
    if (g.invuln < 0 || g.invuln > 2.2 + 1e-9) return `invulnerable for ${g.invuln} s`;
    if (g.boss) {
      const b = g.boss;
      if (!(b.hp >= 0 && b.hp <= b.maxHp)) return `boss hp ${b.hp} of ${b.maxHp}`;
      if (![b.x, b.y].every(Number.isFinite)) return 'the boss position is not a number';
      if (!b.enter && (b.x < 0 || b.x > W)) return `the boss left the screen at x=${b.x.toFixed(0)}`;
    } else if (!g.bonus) {
      const left = remaining(g);
      if (left < 0 || left > g.formationSize) return `${left} ships left of a fleet of ${g.formationSize}`;
    }
    if (g.bonus) {
      if (!bonusLives.has(g)) bonusLives.set(g, s.livesLost);
      if (s.livesLost !== bonusLives.get(g)) return 'a life was lost in the STAR RUN (you can\'t be hit there)';
      if (g.bonusHits > g.bonusTotal) return `${g.bonusHits} hits of ${g.bonusTotal} in the STAR RUN`;
    }
    for (const a of g.aliens) if (!a.dead && ![a.x, a.y].every(Number.isFinite)) return `a ${a.type} has a position that is not a number`;
    for (const e of g.enemyShots) {
      if (![e.x, e.y, e.vx, e.vy].every(Number.isFinite)) return `a ${e.kind} has a position or speed that is not a number`;
      const v = Math.hypot(e.vx, e.vy), cap = e.kind === 'missile' ? 250.5 : e.kind === 'mine' ? 150.5 : 760;
      if (v > cap) return `a ${e.kind} is flying at ${v.toFixed(0)} px/s (cap ${cap})`;
    }
    for (const bl of g.bullets) {
      if (![bl.x, bl.y].every(Number.isFinite)) return 'a bullet position is not a number';
      if (bl.kind === 'bolt' && bl.vy !== -700) return `a bolt flying at vy=${bl.vy}`;
      if (bl.kind === 'rocket' && bl.sp > 560) return `a rocket at ${bl.sp} px/s`;
    }
    const bolts = g.bullets.filter((x) => x.kind === 'bolt').length;
    if (bolts > 2 * 9 + 2) return `${bolts} bolts on screen (the most two ships at full power fire is 18)`;
    if (g.aliens.length > 120 || g.enemyShots.length > 400 || g.bullets.length > 200) return `too many objects (${g.aliens.length} ships, ${g.enemyShots.length} shots, ${g.bullets.length} bullets)`;
    return null;
  },

  bot(g, s, b) {
    const m = b.mem;
    // the boss's speed, as the eye judges it from frame to frame
    if (g.boss) { if (m.bossX != null) m.bossVx = (g.boss.x - m.bossX) * 120; m.bossX = g.boss.x; }
    if (m.crash != null) {                                     // finishing the mistake
      if (s.livesLost > m.crash) m.crash = null;
      else return crashInto(g, s);
    }
    const every = 0.02 + (1 - b.skill) * 0.45;                 // seconds between looks
    if (m.next == null || b.t >= m.next) {
      // ships' speeds, judged between looks
      const vel = (m.vel ??= new Map()), dtl = m.lastLook == null ? 0 : b.t - m.lastLook;
      for (const a of g.aliens) {
        const p = m.pos?.get(a.id);
        if (p && dtl > 0) vel.set(a.id, { vx: (a.x - p.x) / dtl, vy: (a.y - p.y) / dtl });
      }
      m.pos = new Map(g.aliens.map((a) => [a.id, { x: a.x, y: a.y }]));
      m.lastLook = b.t;
      m.x = plan(g, s, b) + (b.rand() - 0.5) * (1 - b.skill) * 40;   // + a shaky hand
      m.next = b.t + every;
    }
    s.hold(['action']);
    const px = s.input.pointer.x, step = handSpeed(b) / 120;
    s.pointerMove(px + Math.max(-step, Math.min(step, m.x - px)), PY);
  },

  mistake(g, s, b) {
    if (g.bonus || !crashInto(g, s)) return false;
    b.mem.crash = s.livesLost;
    return true;
  },
};

/** Stop firing and fly into the diving ship or shot that reaches the bottom row first.
 *  Returns false when there is nothing to fly into. */
function crashInto(g, s) {
  s.hold([]);
  const sh = g.ship;
  let best = null;
  const consider = (x, y, vy) => {
    if (y > sh.y + 10 || vy <= 0) return;
    const t = (sh.y - y) / vy;
    if (t > 2.5) return;
    if (!best || t < best.t) best = { x, t };
  };
  for (const e of g.enemyShots) if (!e.gone) consider(e.x + e.vx * Math.max(0, (sh.y - e.y) / Math.max(1, e.vy)), e.y, e.vy);
  for (const a of g.aliens) if (!a.dead && a.state === 'dive' && a.y < sh.y && a.y > 0) consider(a.x, a.y, 200 * g.speedK);
  if (!best) { s.pointerMove(s.input.pointer.x, PY); return false; }
  s.pointerMove(Math.max(24, Math.min(W - 24, best.x)), PY);
  return true;
}

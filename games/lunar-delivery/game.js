// ─────────────────────────────────────────────────────────────
//  LUNAR DELIVERY 3D — game 25 (Zone 5 · Ultra)
//  Fly a moon hopper between lunar bases. Hover over the waiting cargo crate
//  to hook it on the tow cable, carry it across the craters — it swings! —
//  and set it down GENTLY on the green landing ring of the next base.
//  Land on any pad to refuel. Fly through stardust for points.
//
//    L1  one delivery, smooth ground       L2  two deliveries + stardust trails
//    L3  fuel burns faster — grab canisters L4  ridges (taller every level)
//    L6  ☄ meteor showers (red rings show where they'll land)
//    L7  fewer fuel canisters               L8  HEAVY steel crates
//    L9  🌋 dust geysers on the way          L11 night runs (odd levels): earthshine + floodlight
//    L12 FRAGILE glass crates               L13 two geysers per leg
//  Every 5th level: ★ STARDUST STORM — no crate, nothing can hurt you,
//  fly through the star rings round Stardust Mesa.
//
//  The world (terrain, pads, routes) comes from world.js, drawn by gl.js.
//  check.mjs proves every level's route can be flown on the fuel you get.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, roundRect, clamp } from '../../assets/js/engine.js';
import { buildWorld, sunShade, deliveriesFor, crateKind, PAD_R, LIMIT, PHYS, burnFor } from './world.js';
import { MoonGL, V3, model, xform, project } from './gl.js';

const ID = 'lunar-delivery';
const W = 480, H = 720, TAU = Math.PI * 2;
const MAX_TILT = 0.42, ROLL_TILT = 0.3;
const CRATES = {
  normal:  { name: 'CARGO',   mass: 0.5, safe: 2.6, col: [0.62, 0.2, 0.035], frame: [0.22, 0.22, 0.25] },
  heavy:   { name: 'HEAVY',   mass: 0.9, safe: 2.9, col: [0.36, 0.38, 0.43], frame: [0.95, 0.75, 0.18] },
  fragile: { name: 'FRAGILE', mass: 0.4, safe: 1.5, col: [0.45, 0.85, 1.0],  frame: [0.85, 0.9, 0.95], alpha: 0.72 },
};
const sm = (a, b, k) => a + (b - a) * k;

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  detail: true,               // 🖥 Graphics HIGH / LOW
  comboWindow: 2.6,
  comboStep: 4,
  maxMultiplier: 5,
  bonusTime: 25,
  music: { bpm: 92, style: 'cosmic', lead: 'triangle', bass: 'half' },
  levelTitle: (l) => `Delivery Run ${l}`,
  levelName: 'Run',
  clearText: 'ALL DELIVERED!',
  levelInfo(level, bonus) {
    if (bonus) return '★ STARDUST STORM! Fly through the star rings round Stardust Mesa. No cargo, no crashes — nothing can hurt you.';
    const n = deliveriesFor(level), base = `${n} deliver${n > 1 ? 'ies' : 'y'}. `;
    const notes = {
      1: 'Space / hold THRUST to fire the engine. ↑ ↓ tilt, ← → turn. Hover over the crate to hook it, then set it down gently on the green ring.',
      2: 'Fly through the stardust for points. Land on any pad to refuel.',
      3: 'The engine burns fuel faster now — grab the ⛽ canisters on the way.',
      4: '⛰ Ridges! Climb before you hit them — the cable swings the crate into rocks.',
      6: '☄ METEOR SHOWERS! A red ring shows where one will land. Get out of it!',
      7: 'Fewer fuel canisters from here — plan your hops.',
      8: '▣ HEAVY steel crates: more thrust to lift, more swing to stop.',
      9: '🌋 Dust geysers! They rumble, glow, then blast you skywards.',
      11: '🌑 NIGHT RUN. No Sun — only earthshine and your floodlight.',
      12: '◇ FRAGILE glass crates. Touch down like a feather.',
      13: 'Two geysers on every leg.',
    };
    return base + (notes[level] || (isNightLvl(level) ? '🌑 Night run — trust the beacons.' : 'Longer legs, taller ridges, more meteors.'));
  },
  create: (shell) => new LunarDelivery(shell),
});
const isNightLvl = (l) => l >= 11 && l % 2 === 1;

class LunarDelivery {
  constructor(s) {
    this.s = s; this.t = 0;
    try { if (MoonGL.supported()) this.gl = new MoonGL(); } catch (e) { console.warn('Lunar Delivery: WebGL failed', e); this.gl = null; }
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.keys = new Set();
    this.parts = [];
    this.setupInput();
    this.reset();
    this.startLevel(1, false);
  }

  reset() { this.dustRun = 0; }

  // ── Input: Q/E roll, the touch stick and THRUST button ─────
  setupInput() {
    const s = this.s, cv = s.canvas;
    addEventListener('keydown', (e) => { if (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'ShiftLeft') this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.stick = null; this.thrustTouch = null; });
    this.stick = null; this.thrustTouch = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || s.state !== 'playing') return;
      const [x, y] = s.input.toLogical(e), U = this.ui();
      if (Math.hypot(x - U.stick.x, y - U.stick.y) < U.stick.r + 34) { this.stick = { id: e.pointerId, dx: 0, dy: 0 }; this.moveStick(x, y); }
      else if (x > W * 0.5 && y > H * 0.45) this.thrustTouch = e.pointerId;
    });
    addEventListener('pointermove', (e) => { if (this.stick?.id === e.pointerId) { const [x, y] = s.input.toLogical(e); this.moveStick(x, y); } });
    const up = (e) => { if (this.stick?.id === e.pointerId) this.stick = null; if (this.thrustTouch === e.pointerId) this.thrustTouch = null; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  ui() { return { stick: { x: 86, y: H - 104, r: 58 }, thrust: { x: W - 92, y: H - 104, r: 58 } }; }
  moveStick(x, y) {
    const U = this.ui().stick, dx = (x - U.x) / U.r, dy = (y - U.y) / U.r, l = Math.hypot(dx, dy), k = l > 1 ? 1 / l : 1;
    this.stick.dx = dx * k; this.stick.dy = dy * k;
  }
  thrusting() { return this.s.input.isDown('action') || this.thrustTouch != null; }

  // ── Building a level ───────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.night = isNightLvl(level) && !bonus;
    // one draw per run, so every level's map is the same for everyone on the Daily Challenge
    if (this.runRng !== s.rng) { this.runRng = s.rng; this.runSeed = s.rng.int(1, 2 ** 30); }
    const seed = (Math.imul(this.runSeed + level * 7919, 2654435761 | 0) >>> 0) || 1;
    this.W = buildWorld({ level, bonus, seed });
    // the Sun: low over the horizon, somewhere different each level (cosmetic)
    const sa = (seed % 628) / 100;
    this.sunDir = this.night ? V3.norm([Math.sin(sa), -0.35, Math.cos(sa)]) : V3.norm([Math.sin(sa), 0.24 + (seed % 7) * 0.012, Math.cos(sa)]);
    this.earthDir = V3.norm([Math.sin(sa + 2.3) * 0.9, 0.3, Math.cos(sa + 2.3) * 0.9]);
    this.shade = sunShade(this.W, this.sunDir);
    this.gl?.setWorld(this.W, this.shade);
    this.burn = burnFor(level);
    this.meteorRate = level >= 6 && !bonus ? Math.max(2.4, 8.5 / s.speed(0.06)) : 0;
    this.leg = 0; this.legs = bonus ? 0 : this.W.pads.length - 1;
    this.delivered = [];               // crates sitting on pads (decoration)
    this.dustGot = 0; this.dustTotal = this.W.dust.length; this.stormStars = 0;
    for (const d of this.W.dust) d.got = false;
    for (const f of this.W.fuel) f.got = false;
    this.meteors = []; this.meteorT = this.meteorRate ? 5 : 0; this.parts = [];
    this.flawless = true;
    this.spawnAtPad(bonus ? 0 : 0);
    if (!bonus) this.newCrate(0, this.W.pads[0].cargo);
    else { this.crate = null; this.p[1] += 14; this.landed = false; }
  }

  spawnAtPad(k) {
    const P = this.W.pads[k], nx = this.W.pads[k + 1] || this.W.pads[k - 1];
    this.p = [P.x, P.y + PHYS.FEET, P.z];
    this.v = [0, 0, 0];
    this.yaw = nx ? Math.atan2(nx.x - P.x, nx.z - P.z) : 0;
    this.camYaw = this.yaw;
    this.pitch = 0; this.roll = 0;
    this.fuel = 100; this.landed = true; this.landedT = 0; this.strandT = 0;
    this.crashed = false; this.geyserRide = 0;
    this.legT = 0; this.rumbleT = 0; this.beepT = 0;
    this.cam = null;
  }

  /** a new waiting crate at pad k */
  newCrate(k, at) {
    const P = this.W.pads[k], kind = crateKind(this.level, this.leg);
    let pos = at;
    if (!pos) {            // put it opposite the crate just delivered there
      const last = this.delivered[this.delivered.length - 1];
      const dx = last ? last.c[0] - P.x : 1, dz = last ? last.c[2] - P.z : 0, l = Math.hypot(dx, dz) || 1;
      pos = { x: P.x - dx / l * 5, z: P.z - dz / l * 5 };
    }
    const y = this.W.ground(pos.x, pos.z) + 0.92;
    this.crate = { kind, T: CRATES[kind], c: [pos.x, y, pos.z], v: [0, 0, 0], hooked: false, dmg: 0, pad: k, lastHit: 0, scrapeT: 0, hookCool: 0, yaw: this.yaw };
    const T = this.W.pads[k + 1];
    this.legDist = T ? Math.hypot(T.x - P.x, T.z - P.z) : 0;
    this.tipTime = Math.round(this.legDist / 8 + 26);
    this.legT = 0;
  }

  target() {
    if (this.bonus) return this.W.pads[0];
    const c = this.crate;
    if (!c) return null;
    return c.hooked ? this.W.pads[c.pad + 1] : { x: c.c[0], z: c.c[2], y: c.c[1], crate: true };
  }

  onAction(a) { /* everything is read every tick: held keys, stick, thrust button */ }

  // ── The flight ────────────────────────────────────────────
  update(dt) {
    const s = this.s, W0 = this.W;
    this.titleCam = false;
    this.t += dt; this.legT += dt;
    // 1. controls
    let tilt = (s.input.isDown('up') ? 1 : 0) - (s.input.isDown('down') ? 1 : 0);
    let turn = (s.input.isDown('right') ? 1 : 0) - (s.input.isDown('left') ? 1 : 0);
    let roll = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    if (this.stick) { tilt += -this.stick.dy; turn += this.stick.dx; }
    tilt = clamp(tilt, -1, 1); turn = clamp(turn, -1, 1);
    if (!this.landed) {
      this.yaw -= turn * 1.7 * dt;
      this.pitch = sm(this.pitch, tilt * MAX_TILT, Math.min(1, dt * 4));
      this.roll = sm(this.roll, roll * ROLL_TILT, Math.min(1, dt * 4));
    } else { this.pitch = sm(this.pitch, 0, Math.min(1, dt * 8)); this.roll = sm(this.roll, 0, Math.min(1, dt * 8)); if (turn) this.yaw -= turn * 0.8 * dt; }
    const M = model(this.p, this.yaw, this.pitch, this.roll, 1);
    const up = V3.norm([M[4], M[5], M[6]]);
    this.M = M; this.up = up;

    // 2. engine
    const fuelInf = this.bonus;
    const firing = this.thrusting() && (this.fuel > 0 || fuelInf);
    this.firing = firing;
    let thr = 0;
    if (firing) {
      const ceil = W0.ceiling, k = clamp((ceil - this.p[1]) / 20, 0, 1);  // thin signal near the ceiling
      thr = PHYS.THRUST * (0.25 + 0.75 * k);
      if (!fuelInf) this.fuel = Math.max(0, this.fuel - this.burn * dt);
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) { this.rumbleT = 0.07; s.sound.noise({ dur: 0.12, vol: 0.06, freq: 520, to: 220, type: 'lowpass' }); }
      if (this.landed) { this.landed = false; }
    }
    if (!fuelInf && this.fuel < 20 && this.fuel > 0) { this.beepT -= dt; if (this.beepT <= 0) { this.beepT = this.fuel < 8 ? 0.3 : 0.7; s.sound.play('tick'); } }

    if (!this.landed) {
      this.v[0] += up[0] * thr * dt; this.v[1] += (up[1] * thr - PHYS.G) * dt; this.v[2] += up[2] * thr * dt;
      // gentle attitude thrusters bleed off sideways drift (arcade help)
      const drag = 1 - (this.crate?.hooked ? 0.06 : 0.1) * dt;
      this.v[0] *= drag; this.v[2] *= drag;
      // soft walls at the edge of the map and above the ceiling
      for (const i of [0, 2]) { const o = this.p[i]; if (Math.abs(o) > LIMIT) this.v[i] -= Math.sign(o) * (Math.abs(o) - LIMIT) * 0.8 * dt; }
      this.p = V3.add(this.p, V3.mul(this.v, dt));
    }

    // 3. the crate and its cable
    const c = this.crate;
    if (c) this.updateCrate(c, dt);
    if (s.state !== 'playing') return;

    // 4. touching the ground / buildings
    if (!this.landed) this.groundContact(dt);
    if (s.state !== 'playing') return;
    if (this.landed) this.onGround(dt);
    if (s.state !== 'playing') return;

    // 5. the world
    this.collect();
    this.geysers(dt);
    if (s.state !== 'playing') return;
    this.meteorsUpdate(dt);
    if (s.state !== 'playing') return;
    if (this.geyserRide > 0) { this.geyserRide -= dt; if (this.geyserRide <= 0) { s.unlock('geyser'); s.fx.text(W / 2, H * 0.4, 'GEYSER RIDER!', { color: '#fb923c', size: 26 }); } }
    this.dustFx(dt);
  }

  updateCrate(c, dt) {
    const s = this.s;
    if (c.hookCool > 0) c.hookCool -= dt;
    const hook = xform(this.M, 0, -1.1, 0);
    if (!c.hooked) {
      // hover over the waiting crate to hook it
      const dx = hook[0] - c.c[0], dz = hook[2] - c.c[2], dy = hook[1] - (c.c[1] + 0.92);
      if (c.hookCool <= 0 && !this.landed && Math.hypot(dx, dz) < 2.4 && dy > 0.2 && dy < PHYS.CABLE + 0.6 && V3.len(this.v) < 7) {
        c.hooked = true; c.v = [0, 0, 0]; c.lastHit = 0; this.legT = 0;
        s.sound.play('metal'); s.sound.tone({ freq: 300, to: 900, dur: 0.18, type: 'square', vol: 0.06 });
        s.fx.text(W / 2, H * 0.38, `${c.T.name} HOOKED!`, { color: '#67e8f9', size: 26 });
        s.award(50 * this.level, W / 2, H * 0.43, { chain: false, color: '#67e8f9' });
      }
      return;
    }
    // swing: a point mass on a rope (slack allowed), coupled to the hopper
    const wH = 1, wC = 1 / c.T.mass;
    c.v[1] -= PHYS.G * dt;
    c.v = V3.mul(c.v, 1 - 0.22 * dt);           // the cable damper: swings settle in a few seconds
    c.c = V3.add(c.c, V3.mul(c.v, dt));
    const d = V3.sub(c.c, hook), dist = V3.len(d);
    if (dist > PHYS.CABLE) {
      const n = V3.mul(d, 1 / dist), over = dist - PHYS.CABLE, sum = wH + wC;
      if (!this.landed) this.p = V3.add(this.p, V3.mul(n, over * wH / sum));
      c.c = V3.sub(c.c, V3.mul(n, over * (this.landed ? 1 : wC / sum)));
      const vrel = V3.dot(V3.sub(c.v, this.landed ? [0, 0, 0] : this.v), n);
      if (vrel > 0) {
        if (this.landed) c.v = V3.sub(c.v, V3.mul(n, vrel));
        else { const j = vrel / sum; this.v = V3.add(this.v, V3.mul(n, j * wH)); c.v = V3.sub(c.v, V3.mul(n, j * wC)); }
      }
    }
    // the crate on the ground
    const g = this.W.ground(c.c[0], c.c[2]);
    c.onGround = false;
    if (c.c[1] - 0.92 < g) {
      const imp = Math.max(-c.v[1], 0), hs = Math.hypot(c.v[0], c.v[2]);
      c.c[1] = g + 0.92;
      if (imp > 0.3) c.lastHit = imp;
      if (imp > c.T.safe && !this.bonus) {
        const dm = (imp - c.T.safe) * 26 + 8;
        c.dmg += dm; this.flawless = false;
        s.sound.play('hit'); s.fx.shake(5, 0.25);
        this.puff(c.c, 10, 1.4);
        if (c.dmg < 100) s.fx.text(W / 2, H * 0.45, c.dmg > 60 ? 'CRATE BADLY DAMAGED!' : 'BUMP!', { color: '#fb923c', size: 22 });
      } else if (imp > 0.8) { s.sound.play('bounce', 2); this.puff(c.c, 4, 0.8); }
      c.v[1] = imp > 1.5 ? imp * 0.15 : 0;
      c.v[0] *= 0.86; c.v[2] *= 0.86;
      c.onGround = true;
      if (hs > 6 && !this.bonus) { c.dmg += 20 * dt; c.scrapeT -= dt; if (c.scrapeT <= 0) { c.scrapeT = 0.12; s.sound.noise({ dur: 0.1, vol: 0.05, freq: 3000, type: 'highpass' }); this.puff(c.c, 2, 0.6); } }
    }
    // base buildings knock the crate
    for (const dm of this.W.domes) {
      const r = V3.sub(c.c, [dm.x, dm.y, dm.z]), l = V3.len(r);
      if (l < dm.r + 0.9) {
        const n = V3.mul(r, 1 / l), vn = V3.dot(c.v, n);
        c.c = V3.add([dm.x, dm.y, dm.z], V3.mul(n, dm.r + 0.9));
        if (vn < 0) { c.v = V3.sub(c.v, V3.mul(n, vn * 1.4)); if (-vn > c.T.safe) { c.dmg += (-vn - c.T.safe) * 20 + 6; s.sound.play('metal'); this.flawless = false; } }
      }
    }
    if (c.dmg >= 100) return this.lose('CARGO SMASHED!', c.c);
    // delivered?
    const T = this.W.pads[c.pad + 1];
    if (T && c.onGround && Math.hypot(c.c[0] - T.x, c.c[2] - T.z) < PAD_R - 0.6 && V3.len(c.v) < PHYS.DROP_V && Math.abs(c.c[1] - 0.92 - T.y) < 0.6) this.deliver(c, T);
  }

  deliver(c, T) {
    const s = this.s, L = this.level;
    const soft = c.lastHit < 0.9, tip = Math.max(0, Math.round((1 - this.legT / this.tipTime) * 400 * L / 10) * 10);
    c.hooked = false;
    this.delivered.push({ c: c.c.slice(), kind: c.kind, yaw: c.yaw });
    s.sound.play('golden'); s.sound.play('coin', 6);
    s.fx.flash('#bbf7d0', 0.15);
    const base = 500 + 150 * L;
    s.award(base, W / 2, H * 0.36, { chain: false, color: '#4ade80' });
    s.fx.text(W / 2, H * 0.3, `DELIVERED TO ${T.name.toUpperCase()}!`, { color: '#4ade80', size: 24, life: 1.6 });
    if (tip > 0) s.award(tip, W / 2, H * 0.42, { chain: false, color: '#fde047' });
    if (soft) { s.award(250 * L, W / 2, H * 0.48, { chain: false, color: '#a5f3fc' }); s.fx.text(W / 2, H * 0.53, 'FEATHER TOUCH!', { color: '#a5f3fc', size: 22 }); s.unlock('feather'); }
    if (c.dmg <= 0) s.award(100 * L, W / 2, H * 0.58, { chain: false, color: '#fbbf24' });
    if (this.night) s.unlock('night');
    if (c.kind === 'heavy') s.unlock('heavy');
    if (c.kind === 'fragile' && c.dmg <= 0) s.unlock('glass');
    for (let k = 0; k < 24; k++) this.parts.push({ p: V3.add(c.c, [0, 1, 0]), v: [Math.cos(k) * 4, 3 + (k % 5), Math.sin(k) * 4], life: 1.2, max: 1.2, size: 0.4, col: [0.4, 1, 0.55], glow: true });
    this.leg++;
    if (this.leg >= this.legs) {
      const fuelBonus = Math.round(this.fuel) * 10 * L;
      if (fuelBonus) s.award(fuelBonus, W / 2, H * 0.64, { chain: false, color: '#60a5fa' });
      this.crate = null;
      return s.completeLevel();
    }
    this.newCrate(c.pad + 1);
    this.crate.hookCool = 1.2;
  }

  groundContact(dt) {
    const s = this.s, p = this.p, g = this.W.ground(p[0], p[2]);
    // buildings
    for (const dm of this.W.domes) if (V3.len(V3.sub(p, [dm.x, dm.y, dm.z])) < dm.r + 1.7) return this.crash('HIT A BASE DOME!');
    for (const m of this.W.masts) if (Math.hypot(p[0] - m.x, p[2] - m.z) < 1.9 && p[1] - PHYS.FEET < m.y + m.h) return this.crash('HIT A RADIO MAST!');
    if (p[1] - PHYS.FEET > g) return;
    const vy = -this.v[1], vh = Math.hypot(this.v[0], this.v[2]), n = this.groundNormal(p[0], p[2]);
    const pad = this.padUnder();
    if (this.bonus) {           // can't lose in the storm: bounce
      p[1] = g + PHYS.FEET; if (this.v[1] < 0) this.v[1] = Math.max(2, vy * 0.4);
      return;
    }
    if (vy > PHYS.SAFE_VY) return this.crash(`TOO FAST! ${vy.toFixed(1)} m/s down`);
    if (vh > PHYS.SAFE_VH) return this.crash('SKIDDED INTO THE GROUND!');
    if (this.up[1] < Math.cos(0.55)) return this.crash('LANDED TILTED!');
    if (!pad && n[1] < 0.86) return this.crash('TOO STEEP TO LAND!');
    p[1] = g + PHYS.FEET; this.v = [0, 0, 0]; this.landed = true; this.landedT = 0;
    s.sound.play('bounce', 0); this.puff([p[0], g, p[2]], 8, 1);
    if (pad && vy < 1) s.fx.text(W / 2, H * 0.42, 'NICE LANDING', { color: '#a5f3fc', size: 18 });
  }

  onGround(dt) {
    const s = this.s, pad = this.padUnder();
    this.landedT += dt;
    if (pad && !this.bonus && this.fuel < 100) {
      const before = this.fuel;
      this.fuel = Math.min(100, this.fuel + PHYS.REFUEL * dt);
      if (Math.floor(before / 10) !== Math.floor(this.fuel / 10)) s.sound.tone({ freq: 500 + this.fuel * 6, dur: 0.05, type: 'sine', vol: 0.05 });
    }
    if (!pad && this.fuel <= 0 && !this.bonus) {
      this.strandT += dt;
      if (this.strandT > 2.5) return this.lose('OUT OF FUEL — STRANDED!', this.p);
    } else this.strandT = 0;
  }

  padUnder() { return this.W.pads.find((P) => Math.hypot(this.p[0] - P.x, this.p[2] - P.z) < PAD_R && Math.abs(this.p[1] - PHYS.FEET - P.y) < 1.2) || null; }
  groundNormal(x, z) { const e = 1.5, G = this.W.ground; const hx = G(x + e, z) - G(x - e, z), hz = G(x, z + e) - G(x, z - e); return V3.norm([-hx, 2 * e, -hz]); }

  collect() {
    const s = this.s, p = this.p, c = this.crate;
    for (const d of this.W.dust) {
      if (d.got) continue;
      const near = V3.len(V3.sub(p, [d.x, d.y, d.z])) < 3.0 || (c?.hooked && V3.len(V3.sub(c.c, [d.x, d.y, d.z])) < 2.2);
      if (!near) continue;
      d.got = true; this.dustGot++; this.dustRun++;
      if (this.bonus) this.stormStars++;
      const pts = d.gold ? 200 + 40 * this.level : 20 + 6 * this.level;
      const sp = (this.cam && project(this.cam, [d.x, d.y, d.z], W, H)) || [W / 2, H / 2];
      s.award(pts, sp[0], sp[1] - 16, { chain: true, color: d.gold ? '#fde047' : '#67e8f9' });
      s.sound.play(d.gold ? 'golden' : 'coin', Math.min(10, s.comboCount));
      for (let k = 0; k < (d.gold ? 16 : 7); k++) this.parts.push({ p: [d.x, d.y, d.z], v: [(Math.random() - 0.5) * 8, (Math.random() - 0.3) * 6, (Math.random() - 0.5) * 8], life: 0.6, max: 0.6, size: 0.35, col: d.gold ? [1, 0.85, 0.3] : [0.4, 0.95, 1], glow: true });
      if (this.dustRun >= 60) s.unlock('hoard');
      if (this.bonus && this.stormStars >= 60) s.unlock('storm');
    }
    for (const f of this.W.fuel) {
      if (f.got || V3.len(V3.sub(p, [f.x, f.y, f.z])) > 3.4) continue;
      f.got = true; this.fuel = Math.min(100, this.fuel + PHYS.CAN);
      s.sound.play('powerup');
      s.fx.text(W / 2, H * 0.44, `+${PHYS.CAN}% FUEL`, { color: '#fbbf24', size: 22 });
      s.award(80 * this.level, W / 2, H * 0.48, { chain: true, color: '#fbbf24' });
    }
  }

  /** 0 = quiet, 0..1 rumbling (warning), >1 erupting */
  geyserState(g) {
    const ph = (this.t + g.ph) % g.period;
    return ph < 1.3 ? ph / 1.3 * 0.9 : ph < 2.6 ? 2 : 0;
  }
  geysers(dt) {
    const s = this.s;
    for (const g of this.W.geysers) {
      const st = this.geyserState(g), d = Math.hypot(this.p[0] - g.x, this.p[2] - g.z);
      if (st > 0 && st < 1 && d < 40 && Math.random() < dt * 8) s.sound.noise({ dur: 0.2, vol: 0.03 * (1 - d / 40), freq: 160, type: 'lowpass' });
      if (st >= 2) {
        if (!g.on) { g.on = true; if (d < 70) { s.sound.noise({ dur: 1.2, vol: 0.18 * (1 - d / 80), freq: 700, to: 120, type: 'lowpass' }); s.fx.shake(4 * (1 - d / 70), 0.5); } }
        if (Math.random() < dt * 60) this.parts.push({ p: [g.x + (Math.random() - 0.5) * 3, g.y + 1, g.z + (Math.random() - 0.5) * 3], v: [(Math.random() - 0.5) * 4, 22 + Math.random() * 10, (Math.random() - 0.5) * 4], life: 1.8, max: 1.8, size: 2.2, col: [0.62, 0.58, 0.54], dust: true, grav: 4 });
        const hy = this.p[1] - g.y;
        if (d < 5.5 && hy < 48 && hy > -2) {
          this.v[1] += 26 * dt; this.v[0] += (this.p[0] - g.x) * 0.6 * dt; this.v[2] += (this.p[2] - g.z) * 0.6 * dt;
          this.yaw += 2.5 * dt; this.landed = false;
          if (this.geyserRide <= 0) { this.geyserRide = 3; s.fx.text(W / 2, H * 0.36, 'GEYSER!', { color: '#fb923c', size: 30 }); s.fx.shake(6, 0.4); }
          else this.geyserRide = Math.max(this.geyserRide, 2);
          const c = this.crate; if (c?.hooked) { c.dmg += 6 * dt; this.flawless = false; }
        }
        const c = this.crate;
        if (c?.hooked && Math.hypot(c.c[0] - g.x, c.c[2] - g.z) < 5 && c.c[1] - g.y < 48) { c.v[1] += 20 * dt; c.dmg += 10 * dt; }
      } else g.on = false;
    }
  }

  meteorsUpdate(dt) {
    const s = this.s;
    if (this.meteorRate) {
      this.meteorT -= dt;
      if (this.meteorT <= 0 && !this.landed) {
        this.meteorT = this.meteorRate * s.rng.range(0.8, 1.2);
        const lead = 2.6, tx = this.p[0] + this.v[0] * lead + s.rng.range(-10, 10), tz = this.p[2] + this.v[2] * lead + s.rng.range(-10, 10);
        if (!this.W.pads.some((P) => Math.hypot(P.x - tx, P.z - tz) < PAD_R + 8)) {
          const ty = this.W.ground(tx, tz), a = s.rng.range(0, TAU);
          const from = [tx + Math.sin(a) * 90, ty + 160, tz + Math.cos(a) * 90];
          this.meteors.push({ to: [tx, ty, tz], from, t: 0, warn: 2.4, r: this.level >= 14 ? 9 : 7.5, spin: s.rng.range(0, 6) });
          s.sound.tone({ freq: 1900, to: 400, dur: 2.2, type: 'sine', vol: 0.025 });
        }
      }
    }
    for (const m of this.meteors) {
      m.t += dt;
      if (m.t >= m.warn && !m.done) {
        m.done = true; m.boomT = 0;
        const dH = V3.len(V3.sub(this.p, m.to)), dC = this.crate?.hooked ? V3.len(V3.sub(this.crate.c, m.to)) : 1e9;
        s.sound.play('boom'); s.fx.shake(Math.max(2, 12 - dH * 0.2), 0.5);
        this.puff(m.to, 26, 3.2);
        for (let k = 0; k < 30; k++) this.parts.push({ p: V3.add(m.to, [0, 1, 0]), v: [(Math.random() - 0.5) * 22, 6 + Math.random() * 14, (Math.random() - 0.5) * 22], life: 0.9, max: 0.9, size: 0.6, col: [1, 0.55, 0.2], glow: true, grav: 9 });
        if (dH < m.r + 1) return this.crash('HIT BY A METEOR!');
        if (dC < m.r) { this.crate.dmg += 60; this.flawless = false; s.fx.text(W / 2, H * 0.45, 'METEOR HIT THE CRATE!', { color: '#fb7185', size: 22 }); }
        else if (dH < m.r + 9) { s.unlock('meteor'); s.award(150 * this.level, W / 2, H * 0.4, { chain: true, color: '#fb923c' }); s.fx.text(W / 2, H * 0.35, 'CLOSE SHAVE!', { color: '#fb923c', size: 24 }); }
      }
      if (m.done) m.boomT += dt;
    }
    this.meteors = this.meteors.filter((m) => !m.done || m.boomT < 0.6);
  }

  crash(why) {
    const s = this.s;
    if (this.bonus) return;
    this.crashed = true;
    s.sound.play('boom'); s.sound.play('die');
    s.fx.shake(14, 0.7); s.fx.flash('#fb923c', 0.35);
    this.puff(this.p, 30, 2.6);
    for (let k = 0; k < 40; k++) this.parts.push({ p: this.p.slice(), v: [(Math.random() - 0.5) * 18, Math.random() * 14, (Math.random() - 0.5) * 18], life: 1, max: 1, size: 0.5, col: [1, 0.6, 0.25], glow: true, grav: 6 });
    s.fx.text(W / 2, H * 0.38, why, { color: '#fb7185', size: 24, life: 1.6 });
    s.resetCombo();
    s.hurt();
  }
  lose(why, at) {
    const s = this.s;
    if (this.bonus) return;
    if (at) this.puff(at, 20, 2);
    s.sound.play('lose'); s.fx.shake(8, 0.4);
    s.fx.text(W / 2, H * 0.38, why, { color: '#fb7185', size: 24, life: 1.6 });
    if (this.crate) this.crate.smashed = true;
    s.resetCombo();
    s.hurt();
  }

  /** after a life is lost: back to the pad of the crate you were on, crate waiting again */
  onLifeLost() {
    const k = this.crate ? this.crate.pad : Math.max(0, this.leg);
    this.meteors = [];
    this.spawnAtPad(k);
    this.newCrate(k, k === 0 ? this.W.pads[0].cargo : null);
    this.crate.hookCool = 0.5;
  }
  onLevelClear() { if (!this.bonus && this.flawless && this.level >= 3) this.s.unlock('pristine'); }

  // ── Effects ────────────────────────────────────────────────
  puff(at, n, size) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 6;
      this.parts.push({ p: [at[0], at[1] + 0.3, at[2]], v: [Math.cos(a) * sp, 0.6 + Math.random() * 2.5, Math.sin(a) * sp], life: 1.4, max: 1.4, size: size * (0.6 + Math.random() * 0.6), col: [0.6, 0.58, 0.55], dust: true, grav: 1.2 });
    }
  }
  dustFx(dt) {
    // engine blast kicks up regolith when you're low
    if (!this.firing) return;
    const g = this.W.ground(this.p[0], this.p[2]), alt = this.p[1] - PHYS.FEET - g;
    if (alt < 14 && Math.random() < dt * 50 * (1 - alt / 14)) {
      const a = Math.random() * TAU, sp = 6 + Math.random() * 8;
      this.parts.push({ p: [this.p[0], g + 0.4, this.p[2]], v: [Math.cos(a) * sp, 0.5 + Math.random(), Math.sin(a) * sp], life: 1.2, max: 1.2, size: 1.2 + Math.random(), col: [0.6, 0.58, 0.55], dust: true, grav: 0.6 });
    }
  }
  stepParts(dt) {
    const lo = this.s.lowDetail, cap = lo ? 260 : 700;
    if (this.parts.length > cap) this.parts.splice(0, this.parts.length - cap);
    for (const q of this.parts) {
      q.life -= dt; q.v[1] -= (q.grav || 0) * dt;
      if (q.dust) q.v = V3.mul(q.v, 1 - 1.2 * dt);
      q.p = V3.add(q.p, V3.mul(q.v, dt));
    }
    this.parts = this.parts.filter((q) => q.life > 0);
  }

  idle(dt) {
    this.t += dt;
    if (this.s.state === 'title') { this.camYaw += 0.15 * dt; this.titleCam = true; }
    else this.titleCam = false;
  }

  // ── Camera ────────────────────────────────────────────────
  camera(dt) {
    const p = this.p, fwd = [Math.sin(this.camYaw), 0, Math.cos(this.camYaw)];
    if (this.titleCam) {
      const P = this.W.pads[0];
      const eye = [P.x - fwd[0] * 26, P.y + 12, P.z - fwd[2] * 26];
      return { eye, target: [P.x, P.y + 2, P.z], fov: 1.05 };
    }
    let dy = this.yaw - this.camYaw; dy = ((dy + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.camYaw += dy * Math.min(1, dt * 3);
    const carry = this.crate?.hooked ? 1 : 0, dist = 15 + carry * 8, hgt = 6 + carry * 8;
    let eye = [p[0] - fwd[0] * dist, p[1] + hgt, p[2] - fwd[2] * dist];
    const ge = this.W.ground(eye[0], eye[2]) + 2.5;
    if (eye[1] < ge) eye[1] = ge;
    const target = [p[0] + fwd[0] * (6 + carry * 4) + this.v[0] * 0.3, p[1] - 1.5 - carry * 5, p[2] + fwd[2] * (6 + carry * 4) + this.v[2] * 0.3];
    if (this.cam) eye = V3.lerp(this.cam.eye, eye, Math.min(1, dt * 6));
    return { eye, target, fov: 1.08 };
  }

  // ── Drawing ───────────────────────────────────────────────
  render(ctx) {
    const s = this.s, lo = s.lowDetail, now = performance.now() / 1000;
    const rdt = Math.min(0.05, this.lastR ? now - this.lastR : 0.016); this.lastR = now;
    this.stepParts(rdt);
    this.cam = this.camera(rdt);
    if (!this.gl) return this.noGL(ctx);
    const t = this.t, W0 = this.W, gold = s.gold, night = this.night;
    const solids = [], M = model(this.p, this.yaw, this.pitch, this.roll, 1);
    const far = lo ? 430 : 620, eye = this.cam.eye;
    const nearEnough = (x, z, extra = 0) => Math.hypot(x - eye[0], z - eye[2]) < far + extra;
    // the hopper
    if (!(this.crashed && s.state === 'dying')) {
      const hullC = gold ? [1, 0.76, 0.28] : [0.86, 0.87, 0.9], darkC = gold ? [0.55, 0.38, 0.1] : [0.16, 0.16, 0.19], foil = gold ? [1, 0.85, 0.4] : [0.95, 0.66, 0.2];
      solids.push({ mesh: 'hull', m: M, col: hullC, spec: gold ? 1.4 : 0.6, shine: 40 });
      solids.push({ mesh: 'hullDark', m: M, col: darkC, spec: 0.4 });
      solids.push({ mesh: 'tank', m: M, col: foil, spec: 1.2, shine: 30 });
      solids.push({ mesh: 'glass', m: M, col: [0.05, 0.08, 0.12], emis: night ? [0.25, 0.5, 0.7] : [0.05, 0.12, 0.2], spec: 2, shine: 80 });
      const blink = Math.sin(t * 6) > 0.6 ? 1 : 0.15;
      solids.push({ mesh: 'navR', m: M, col: [0.3, 0, 0], emis: [2 * blink, 0.1, 0.1] });
      solids.push({ mesh: 'navG', m: M, col: [0, 0.3, 0], emis: [0.1, 2 * blink, 0.2] });
    }
    // crates
    const crateSolids = (pos, kind, yaw, rx = 0, rz = 0, dmg = 0) => {
      const T = CRATES[kind], Mc = model(pos, yaw, rx, rz, 1), dk = 1 - Math.min(0.5, dmg / 200);
      solids.push({ mesh: 'crate', m: Mc, col: V3.mul(T.col, dk), spec: kind === 'fragile' ? 1.5 : 0.3, alpha: T.alpha ?? 1, emis: kind === 'fragile' ? [0.05, 0.15, 0.22] : [0, 0, 0] });
      solids.push({ mesh: 'crateFrame', m: Mc, col: T.frame, spec: 0.8 });
    };
    for (const d of this.delivered) crateSolids(d.c, d.kind, d.yaw);
    const c = this.crate;
    if (c && !c.smashed) {
      let rx = 0, rz = 0;
      if (c.hooked) { const hook = xform(M, 0, -1.1, 0), d = V3.sub(hook, c.c), l = V3.len(d) || 1; rx = Math.asin(clamp(d[2] / l, -1, 1)) * 0.6; rz = -Math.asin(clamp(d[0] / l, -1, 1)) * 0.6; c.yaw = sm(c.yaw, this.yaw, 0.02); }
      crateSolids(c.c, c.kind, c.yaw, rx, rz, c.dmg);
    }
    // bases
    for (const dm of W0.domes) {
      if (!nearEnough(dm.x, dm.z, 30)) continue;
      const p = [dm.x, dm.y, dm.z], sc = [dm.r, dm.r * 0.78, dm.r];
      solids.push({ mesh: 'dome', m: model(p, 0, 0, 0, sc), col: [0.82, 0.83, 0.86], spec: 0.5, shine: 20 });
      solids.push({ mesh: 'domeBand', m: model(p, 0, 0, 0, [dm.r, dm.r, dm.r]), col: [0.25, 0.26, 0.3] });
      solids.push({ mesh: 'domeGlow', m: model(p, 0, 0, 0, sc), col: [0.1, 0.1, 0.1], emis: night ? [1.6, 1.1, 0.5] : [0.7, 0.5, 0.25] });
    }
    for (const tb of W0.tubes) {
      if (!nearEnough(tb.x0, tb.z0, 30)) continue;
      const dx = tb.x1 - tb.x0, dz = tb.z1 - tb.z0, len = Math.hypot(dx, dz);
      solids.push({ mesh: 'tube', m: model([tb.x0, tb.y, tb.z0], Math.atan2(-dz, dx), 0, 0, [len, tb.r, tb.r]), col: [0.7, 0.71, 0.74], spec: 0.4 });
    }
    for (const ms of W0.masts) {
      if (!nearEnough(ms.x, ms.z, 30)) continue;
      solids.push({ mesh: 'mast', m: model([ms.x, ms.y, ms.z], 0, 0, 0, [1, ms.h, 1]), col: [0.5, 0.5, 0.54], spec: 0.3 });
      solids.push({ mesh: 'dish', m: model([ms.x, ms.y + ms.h * 0.8, ms.z], Math.atan2(this.earthDir[0], this.earthDir[2]), 0.9, 0, 1), col: [0.88, 0.88, 0.9], spec: 0.8 });
    }
    // fuel canisters and stardust
    for (const f of W0.fuel) {
      if (f.got || !nearEnough(f.x, f.z)) continue;
      const Mf = model([f.x, f.y + Math.sin(t * 2 + f.x) * 0.4, f.z], t * 1.2, 0.25, 0, 1.1);
      solids.push({ mesh: 'canister', m: Mf, col: [0.92, 0.2, 0.15], spec: 1, shine: 30, emis: [0.25, 0.04, 0.02] });
      solids.push({ mesh: 'canBand', m: Mf, col: [1, 0.85, 0.2], emis: [0.9, 0.6, 0.1] });
    }
    for (const d of W0.dust) {
      if (d.got || !nearEnough(d.x, d.z, -100)) continue;
      const sc = d.gold ? 1.1 : 0.62;
      solids.push({ mesh: 'octa', m: model([d.x, d.y + Math.sin(t * 2.5 + d.x) * 0.3, d.z], t * 2 + d.z, 0, 0, sc), col: d.gold ? [1, 0.75, 0.2] : [0.3, 0.85, 1], emis: d.gold ? [1.4, 1, 0.25] : [0.35, 1.1, 1.4], spec: 1.5 });
    }
    for (const m of this.meteors) {
      if (m.done) continue;
      const k = clamp(m.t / m.warn, 0, 1), pos = V3.lerp(m.from, m.to, k * k);
      if (k > 0.25) solids.push({ mesh: 'rock', m: model(pos, m.spin + t * 3, t * 2, 0, 2.2), col: [0.25, 0.2, 0.18], emis: [1.2, 0.45, 0.12] });
      m.pos = pos; m.k = k;
    }

    // ground decals
    const tg = this.target(), pads = W0.pads.map((P, i) => {
      let kind = 1;
      if (!this.bonus && c) { if (c.hooked && i === c.pad + 1) kind = 2; else if (!c.hooked && i === c.pad) kind = 3; }
      return [P.x, P.z, PAD_R, kind];
    });
    const g0 = W0.ground(this.p[0], this.p[2]), alt = this.p[1] - PHYS.FEET - g0;
    const blobs = [];
    if (!this.crashed) blobs.push([this.p[0], this.p[2], 3.2, clamp(0.7 - alt / 60, 0, 0.7)]);
    if (c && !c.smashed) { const gc = W0.ground(c.c[0], c.c[2]); blobs.push([c.c[0], c.c[2], 2.0, clamp(0.75 - (c.c[1] - gc) / 30, 0, 0.75)]); }
    const warns = this.meteors.filter((m) => !m.done).map((m) => [m.to[0], m.to[2], m.r, 0.5 + 0.5 * m.k]);
    const vents = W0.geysers.map((g) => { const st = this.geyserState(g); return { g, d: Math.hypot(g.x - eye[0], g.z - eye[2]), st }; }).sort((a, b) => a.d - b.d).slice(0, 4)
      .map(({ g, st }) => [g.x, g.z, 2.6, st >= 2 ? 1.4 : st * (0.6 + 0.4 * Math.sin(t * 20))]);

    const S = {
      t, night, cam: this.cam, far,
      sunDir: this.sunDir, sunCol: night ? [0, 0, 0] : [2.7, 2.6, 2.4], amb: night ? [0.012, 0.014, 0.022] : [0.03, 0.03, 0.038],
      earthDir: this.earthDir, earthCol: night ? [0.16, 0.2, 0.32] : [0.03, 0.04, 0.06],
      lamp: [this.p[0], this.p[1] - 1, this.p[2], night && !this.crashed ? 1.2 : 0], lampCol: [3.4, 3.2, 2.9],
      pads, blobs, warns, vents, solids,
      dust: (R) => this.drawDust(R),
      glow: (R) => this.drawGlow(R, M, tg),
    };
    const k = lo ? 0.6 : 1, sc = s.scale || 1;
    let w = Math.round(W * sc * k), h = Math.round(H * sc * k);
    const cap = lo ? 480 : 900; if (w > cap) { h = Math.round(h * cap / w); w = cap; }
    const img = this.gl.render(S, w, h);
    if (img) ctx.drawImage(img, 0, 0, W, H);
    this.drawHud(ctx, tg, alt);
  }

  drawDust(R) {
    // the tow cable (dark, so it's drawn with the dust, not the glow)
    const c = this.crate;
    if (c?.hooked && !this.crashed) {
      const hook = xform(model(this.p, this.yaw, this.pitch, this.roll, 1), 0, -1.1, 0), top = V3.add(c.c, [0, 1.1, 0]);
      const slack = Math.max(0, PHYS.CABLE - V3.len(V3.sub(top, hook)));
      const n = 8; let prev = hook;
      for (let i = 1; i <= n; i++) { const k = i / n, q = V3.lerp(hook, top, k); q[1] -= Math.sin(k * Math.PI) * slack * 0.5; R.ribbon(prev, q, 0.07, [0.1, 0.1, 0.11], 1); prev = q; }
    }
    for (const q of this.parts) if (q.dust) { const a = q.life / q.max; R.sprite(q.p, q.size * (1.6 - a * 0.6), q.col, 0.55 * a, 2); }
  }

  drawGlow(R, M, tg) {
    const t = this.t, W0 = this.W, night = this.night, c = this.crate;
    // engine flame
    if (this.firing && !this.crashed) {
      const fl = 0.85 + Math.random() * 0.3;
      for (let i = 0; i < 5; i++) R.sprite(xform(M, 0, -1.5 - i * 0.55 * fl, 0), (0.9 - i * 0.13) * fl, i < 2 ? [1, 0.85, 0.6] : [1, 0.5, 0.2], 0.7 - i * 0.1, 3);
      R.sprite(xform(M, 0, -1.6, 0), 3.2, [1, 0.55, 0.25], 0.25, 0);
    }
    // nav light halos
    if (!this.crashed) { const b = Math.sin(t * 6) > 0.6 ? 1 : 0; if (b) { R.sprite(xform(M, -1.6, 0.33, 0), 0.6, [1, 0.2, 0.15], 0.8, 0); R.sprite(xform(M, 1.6, 0.33, 0), 0.6, [0.2, 1, 0.3], 0.8, 0); } }
    // pad beacons + a tall beam over where you're going
    W0.pads.forEach((P) => { for (const a of [0.8, 2.4, 4.0, 5.6]) { const on = Math.sin(t * 3 + a) > 0.3; R.sprite([P.x + Math.sin(a) * PAD_R, P.y + 0.5, P.z + Math.cos(a) * PAD_R], on ? 0.9 : 0.5, [1, 0.7, 0.2], on ? 0.9 : 0.3, 0); } });
    for (const ms of W0.masts) if (Math.sin(t * 2.2 + ms.x) > 0) R.sprite([ms.x, ms.y + ms.h + 0.3, ms.z], 1.1, [1, 0.15, 0.1], 0.9, 0);
    if (tg) {
      const col = tg.crate ? [0.3, 0.9, 1] : this.bonus ? [1, 0.8, 0.3] : [0.35, 1, 0.5], y0 = tg.y ?? W0.ground(tg.x, tg.z);
      R.ribbon([tg.x, y0, tg.z], [tg.x, y0 + 70, tg.z], tg.crate ? 0.9 : 2.2, col, 0.22 + 0.08 * Math.sin(t * 4));
      if (tg.crate) R.flatSprite([tg.x, y0 - 0.85, tg.z], 2.6 + 0.4 * Math.sin(t * 5), col, 0.8, 1);
    }
    // where the crate will land: a drop line
    if (c?.hooked && !this.crashed) { const gy = W0.ground(c.c[0], c.c[2]); R.ribbon([c.c[0], gy, c.c[2]], [c.c[0], c.c[1] - 0.9, c.c[2]], 0.05, [0.5, 0.9, 1], 0.35); }
    // stardust and canister glows
    for (const d of W0.dust) if (!d.got && Math.hypot(d.x - this.cam.eye[0], d.z - this.cam.eye[2]) < 400) R.sprite([d.x, d.y, d.z], d.gold ? 2.6 : 1.5, d.gold ? [1, 0.8, 0.3] : [0.3, 0.8, 1], night ? 0.7 : 0.45, 0);
    for (const f of W0.fuel) if (!f.got) R.sprite([f.x, f.y, f.z], 2.2, [1, 0.4, 0.15], 0.35 + 0.15 * Math.sin(t * 4), 0);
    // geysers
    for (const g of W0.geysers) { const st = this.geyserState(g); if (st > 0) R.sprite([g.x, g.y + 1, g.z], st >= 2 ? 6 : 2 + st * 2, [1, 0.5, 0.18], st >= 2 ? 0.6 : 0.3 * st, 0); }
    // meteors
    for (const m of this.meteors) {
      if (m.done) { const k = m.boomT / 0.6; R.sprite(V3.add(m.to, [0, 2, 0]), 6 + k * 10, [1, 0.6, 0.25], 1 - k, 0); R.flatSprite(V3.add(m.to, [0, 0.4, 0]), m.r * (0.5 + k), [1, 0.5, 0.2], 1 - k, 1); continue; }
      if (!m.pos || m.k < 0.25) continue;
      R.ribbon(V3.lerp(m.from, m.to, Math.max(0, m.k * m.k - 0.15)), m.pos, 1.0, [1, 0.5, 0.15], 0.7);
      R.sprite(m.pos, 4, [1, 0.6, 0.25], 0.8, 0);
    }
    for (const q of this.parts) if (q.glow) { const a = q.life / q.max; R.sprite(q.p, q.size, q.col, a, 0); }
  }

  noGL(ctx) {
    ctx.fillStyle = '#05050c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Lunar Delivery needs WebGL 3D graphics,', W / 2, H / 2 - 14);
    ctx.fillText('which this browser has switched off.', W / 2, H / 2 + 14);
  }

  // ── HUD ───────────────────────────────────────────────────
  drawHud(ctx, tg, alt) {
    const s = this.s, t = this.t, c = this.crate;
    if (s.state === 'title') return;
    ctx.save();
    ctx.textBaseline = 'middle';
    // top bar
    ctx.fillStyle = 'rgba(3,4,12,.62)'; ctx.fillRect(0, 0, W, 50);
    if (this.bonus) progressBar(ctx, 12, 14, W - 24, 22, s.bonusLeft / 25, '#fbbf24', `★ STARDUST STORM · ${this.stormStars} stars · ${Math.ceil(s.bonusLeft)}s`);
    else {
      const fc = this.fuel > 40 ? '#60a5fa' : this.fuel > 20 ? '#fbbf24' : (Math.sin(t * 10) > 0 ? '#f87171' : '#7f1d1d');
      progressBar(ctx, 12, 8, 150, 16, this.fuel / 100, fc, `FUEL ${Math.ceil(this.fuel)}%`);
      if (c) {
        const ck = 1 - c.dmg / 100, cc = ck > 0.6 ? '#4ade80' : ck > 0.3 ? '#fbbf24' : '#f87171';
        progressBar(ctx, 12, 28, 150, 16, ck, cc, `${c.T.name} ${Math.max(0, Math.ceil(ck * 100))}%`);
      }
      ctx.textAlign = 'center'; ctx.font = '900 13px system-ui'; ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`DELIVERY ${Math.min(this.leg + 1, this.legs)} / ${this.legs}`, W / 2 + 10, 16);
      const tip = c?.hooked ? Math.max(0, Math.ceil(this.tipTime - this.legT)) : null;
      ctx.font = '700 11px system-ui'; ctx.fillStyle = tip === 0 ? '#94a3b8' : '#fde047';
      ctx.fillText(c?.hooked ? (tip > 0 ? `⏱ TIP ${tip}s` : 'NO TIP') : 'HOOK THE CRATE', W / 2 + 10, 35);
      ctx.textAlign = 'right'; ctx.font = '700 11px system-ui'; ctx.fillStyle = '#67e8f9';
      ctx.fillText(`✦ ${this.dustGot} / ${this.dustTotal}`, W - 108, 16);
    }
    this.drawMap(ctx);
    // incoming meteor: the ring may be right under you, out of view
    const danger = this.meteors.find((m) => !m.done && Math.hypot(m.to[0] - this.p[0], m.to[2] - this.p[2]) < m.r + 4);
    if (danger && !this.bonus) {
      ctx.textAlign = 'center'; ctx.font = '900 20px system-ui';
      ctx.fillStyle = Math.sin(t * 16) > 0 ? '#f87171' : '#fde047';
      ctx.fillText('☄ METEOR INCOMING — MOVE!', W / 2, 96);
      const a = 0.12 + 0.1 * Math.sin(t * 16); ctx.fillStyle = `rgba(255,30,30,${a})`; ctx.fillRect(0, 50, W, H - 50);
    }
    // target marker
    if (tg && !this.bonus) {
      const y0 = (tg.y ?? this.W.ground(tg.x, tg.z)) + (tg.crate ? 2.5 : 3);
      const pr = project(this.cam, [tg.x, y0, tg.z], W, H), dist = Math.hypot(tg.x - this.p[0], tg.z - this.p[2]);
      const col = tg.crate ? '#67e8f9' : this.bonus ? '#fbbf24' : '#4ade80';
      const label = tg.crate ? `CRATE ${Math.round(dist)} m` : `${(tg.name || '').toUpperCase()} ${Math.round(dist)} m`;
      const inView = pr && pr[0] > 20 && pr[0] < W - 20 && pr[1] > 60 && pr[1] < H - 150;
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
      if (inView) {
        const [x, y] = pr, r = 9 + Math.sin(t * 5) * 1.5;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke();
        ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - r - 9);
      } else {
        // an arrow round the edge pointing the way
        const B = { f: [Math.sin(this.camYaw), 0, Math.cos(this.camYaw)] }, rgt = [-B.f[2], 0, B.f[0]];
        const d = [tg.x - this.cam.eye[0], 0, tg.z - this.cam.eye[2]];
        const a = Math.atan2(V3.dot(d, rgt), V3.dot(d, B.f));
        const cx = W / 2 + Math.sin(a) * 150, cy = H * 0.42 - Math.cos(a) * 190;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 6); ctx.lineTo(0, 1); ctx.lineTo(-11, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, cx, cy + 22);
      }
    }
    // flight instruments
    const vs = this.v[1], hs = Math.hypot(this.v[0], this.v[2]);
    const by = H - (this.coarse ? 186 : 46);
    ctx.fillStyle = 'rgba(3,4,12,.55)'; roundRect(ctx, W / 2 - 150, by - 18, 300, 36, 12); ctx.fill();
    ctx.font = '800 13px system-ui'; ctx.textAlign = 'center';
    const near = alt < 25;
    const vsCol = !near ? '#e2e8f0' : -vs > PHYS.SAFE_VY ? '#f87171' : -vs > PHYS.SAFE_VY * 0.7 ? '#fbbf24' : '#4ade80';
    const hsCol = !near ? '#e2e8f0' : hs > PHYS.SAFE_VH ? '#f87171' : '#4ade80';
    ctx.fillStyle = '#e2e8f0'; ctx.fillText(`ALT ${Math.max(0, alt).toFixed(alt < 10 ? 1 : 0)}m`, W / 2 - 96, by);
    ctx.fillStyle = vsCol; ctx.fillText(`${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(1)}`, W / 2, by);
    ctx.fillStyle = hsCol; ctx.fillText(`➜ ${hs.toFixed(1)}`, W / 2 + 92, by);
    if (this.landed && this.padUnder() && this.fuel < 100 && !this.bonus) { ctx.fillStyle = '#60a5fa'; ctx.font = '800 14px system-ui'; ctx.fillText('⛽ REFUELLING…', W / 2, by - 34); }
    else if (this.landed && !this.padUnder() && this.fuel <= 0 && !this.bonus) { ctx.fillStyle = '#f87171'; ctx.font = '800 14px system-ui'; ctx.fillText('OUT OF FUEL!', W / 2, by - 34); }
    else if (this.fuel <= 0 && !this.bonus) { ctx.fillStyle = Math.sin(t * 10) > 0 ? '#f87171' : '#fff'; ctx.font = '900 16px system-ui'; ctx.fillText('NO FUEL — BRACE!', W / 2, by - 34); }
    if (Math.abs(this.p[0]) > LIMIT || Math.abs(this.p[2]) > LIMIT) { ctx.fillStyle = '#fbbf24'; ctx.font = '800 13px system-ui'; ctx.fillText('⚠ LEAVING THE DELIVERY ZONE', W / 2, 74); }
    // touch controls
    if (this.coarse) {
      const U = this.ui();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(10,12,30,.45)'; ctx.beginPath(); ctx.arc(U.stick.x, U.stick.y, U.stick.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(226,232,240,.5)'; ctx.lineWidth = 2; ctx.stroke();
      const kx = U.stick.x + (this.stick?.dx || 0) * U.stick.r * 0.6, ky = U.stick.y + (this.stick?.dy || 0) * U.stick.r * 0.6;
      ctx.fillStyle = 'rgba(226,232,240,.75)'; ctx.beginPath(); ctx.arc(kx, ky, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(226,232,240,.6)'; ctx.font = '700 10px system-ui'; ctx.fillText('TILT / TURN', U.stick.x, U.stick.y + U.stick.r + 12);
      const on = this.thrustTouch != null;
      ctx.fillStyle = on ? 'rgba(251,146,60,.6)' : 'rgba(10,12,30,.45)'; ctx.beginPath(); ctx.arc(U.thrust.x, U.thrust.y, U.thrust.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fb923c'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '900 15px system-ui'; ctx.fillText('THRUST', U.thrust.x, U.thrust.y);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.55)'; ctx.textAlign = 'center';
      ctx.fillText('Space thrust · ↑ ↓ tilt · ← → turn · Q E sidestep', W / 2, H - 12);
    }
    ctx.restore();
  }

  drawMap(ctx) {
    const R0 = 46, cx = W - 56, cy = 104, sc = R0 / 260, t = this.t;
    const f = [Math.sin(this.camYaw), Math.cos(this.camYaw)], r = [-f[1], f[0]];
    const toMap = (x, z) => { const dx = x - this.p[0], dz = z - this.p[2]; let u = (dx * r[0] + dz * r[1]) * sc, v = -(dx * f[0] + dz * f[1]) * sc; const l = Math.hypot(u, v); if (l > R0 - 4) { u *= (R0 - 4) / l; v *= (R0 - 4) / l; } return [cx + u, cy + v]; };
    ctx.save();
    ctx.fillStyle = 'rgba(3,4,12,.6)'; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R0 / 2, 0, TAU); ctx.stroke();
    const c = this.crate;
    this.W.pads.forEach((P, i) => {
      const [x, y] = toMap(P.x, P.z);
      const tgt = c && ((c.hooked && i === c.pad + 1) || (!c.hooked && i === c.pad));
      ctx.fillStyle = tgt ? (c.hooked ? '#4ade80' : '#67e8f9') : i < (c ? c.pad : this.legs + 1) ? '#64748b' : '#fbbf24';
      ctx.beginPath(); ctx.arc(x, y, tgt ? 4.5 + Math.sin(t * 6) : 3.2, 0, TAU); ctx.fill();
    });
    for (const g of this.W.geysers) { const [x, y] = toMap(g.x, g.z); ctx.fillStyle = this.geyserState(g) >= 2 ? '#fb923c' : '#7c2d12'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    for (const m of this.meteors) if (!m.done) { const [x, y] = toMap(m.to[0], m.to[2]); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, Math.max(6, m.r * sc), 0, TAU); ctx.stroke(); ctx.lineWidth = 1; }
    if (c && !c.hooked) { const [x, y] = toMap(c.c[0], c.c[2]); ctx.fillStyle = '#67e8f9'; ctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.5, cy + 4); ctx.lineTo(cx - 4.5, cy + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

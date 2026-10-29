// ─────────────────────────────────────────────────────────────
//  ORBIT HOPPER — Zone 5, slot 26.
//
//  One-button slingshot: the hopper circles a planet; press to let go and fly,
//  bent by every planet's gravity, and get captured by the next planet you
//  touch. Climb from the start pad to the golden beacon at the top. Stars in
//  the gaps pay points, chained planets pay combos, the void costs a life.
//
//  All gameplay randomness comes from s.rng (Daily Challenge); physics and
//  level generation live in world.js, shared with check.mjs which proves every
//  level has a route to the beacon.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import {
  W, HOPPER_R, STAR_R, MAX_FLIGHT, ORBIT_GAP,
  launchSpeed, orbitSpeed, makeLevel, gravity, stepFlight, orbitState, bounds, route,
} from './world.js';

const H = 720;

runGame({
  id: 'orbit-hopper',
  width: W, height: H,
  lives: 3,
  comboWindow: 0,            // the chain only breaks when a hop misses (handled here)
  comboStep: 1,              // every clean planet-to-planet hop raises the multiplier
  maxMultiplier: 8,
  bonusTime: 20,
  detail: true,
  music: { bpm: 96, style: 'dream', lead: 'triangle', bass: 'half' },

  levelInfo: (level, bonus) => bonus
    ? '★ STAR SHOWER! No void, no danger — hop and hoover up every star.'
    : level === 1 ? 'Press to let go. Ride gravity to the next planet and climb to the golden beacon.'
    : level === 4 ? 'The planets are drifting now. Time the release.'
    : level === 7 ? 'Watch for the black hole — nothing comes back out.'
    : 'Higher. Faster. Further apart.',

  create: (shell) => new OrbitHopper(shell),
});

class OrbitHopper {
  constructor(s) {
    this.s = s; this.t = 0;
    // one starfield for the whole session (cosmetic → Math.random is fine)
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.25 + Math.random() * 0.75, tw: Math.random() * 6 }));
    this.startLevel(1, false);
  }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    const make = makeLevel(level, s.rng);
    this.planets = make.planets; this.lootStars = make.stars;
    // moving planets from L4 (never the start or the beacon)
    for (const p of this.planets) {
      p.x0 = p.x; p.phase = s.rng.range(0, Math.PI * 2);
      p.amp = (!bonus && level >= 4 && !p.start && !p.goal && s.rng.chance(Math.min(0.6, 0.2 + level * 0.04))) ? s.rng.range(30, 60 + level * 3) : 0;
      // the swing keeps the planet fully on screen: a planet near the edge used to carry the
      // orbiting hopper past the void line, so letting go cost a life at once (29 Oct 2026 review)
      if (p.amp) p.amp = Math.max(0, Math.min(p.amp, p.x0 - p.r - 8, W - 8 - p.r - p.x0));
      p.om = s.rng.range(0.35, 0.7);
    }
    // one black hole in a gap from L7
    this.hole = null;
    if (!bonus && level >= 7) {
      const i = s.rng.int(1, this.planets.length - 3);
      const a = this.planets[i], b = this.planets[i + 1];
      this.hole = { x: clamp(W - (a.x + b.x) / 2, 70, W - 70), y: (a.y + b.y) / 2, r: 16 };
    }
    this.cam = 0;                       // camera: world y at the top of the screen (set in render)
    this.enter(this.planets[0], null);  // start in orbit around the bottom planet
    this.fly = null;
    this.trail = [];
    this.visited = new Set([0]);
    this.deaths = 0;
    this.chain = 0;            // planets reached since the last lost life (chain5 badge)
    this.nearMiss = false;     // grazed a planet's gravity this flight (slingshot badge)
    this.holeGraze = false;    // skimmed the black hole this flight (grazed badge)
    this.hintT = level === 1 ? 6 : 0;
    this.beaconPulse = 0;
  }

  /** Capture into orbit around planet p (dir keeps the current sense of travel). */
  enter(p, from) {
    const s = this.s;
    this.orbit = { p, a: from ? Math.atan2(from.y - p.y, from.x - p.x) : -Math.PI / 2, dir: this.fly?.dir || 1 };
    if (from) {
      s.fx.ring(this.hx(), this.hy());
      s.sound.play('bounce', 1);
    }
    if (p.goal) return this.reachBeacon();
    if (from && !this.visited.has(p.i)) {
      this.visited.add(p.i);
      s.award(25 * this.level, this.hx(), this.hy() - 20, { chain: true, color: '#86efac' });
      s.sound.play('coin', s.comboCount);
      s.unlock('first');
      if (++this.chain >= 5) s.unlock('chain5');
      if (this.nearMiss) s.unlock('slingshot');
      if (this.holeGraze) s.unlock('grazed');
    }
    this.nearMiss = false; this.holeGraze = false;
  }

  reachBeacon() {
    const s = this.s;
    s.unlock('beacon');
    if (!this.bonus && this.lootStars.length && this.lootStars.every((x) => x.got)) s.unlock('allstars');
    if (!this.bonus && this.level >= 3 && this.deaths === 0) s.unlock('flawless');
    s.award(150 * this.level, this.hx(), this.hy() - 24, { chain: true, color: '#fde047', size: 22 });
    s.sound.play('powerup');
    s.fx.burst(this.hx(), this.hy(), { color: '#fde047', count: 40, speed: 260 });
    this.beaconPulse = 1;
    s.completeLevel();
  }

  hx() { return this.fly ? this.fly.x : this.orbit.p.x + Math.cos(this.orbit.a) * (this.orbit.p.r + ORBIT_GAP); }
  hy() { return this.fly ? this.fly.y : this.orbit.p.y + Math.sin(this.orbit.a) * (this.orbit.p.r + ORBIT_GAP); }

  onAction(a, x, y) {
    if (a === 'action' || a === 'press' || a === 'tap') this.hop();
  }

  hop() {
    const s = this.s;
    if (!this.orbit || this.fly) return;
    const o = this.orbit;
    const st = orbitState(o.p, o.a, o.dir, this.level);
    this.fly = { ...st, t: 0, from: o.p, dir: o.dir };
    this.orbit = null;
    this.hintT = 0;
    s.sound.play('flap', 1);
    s.fx.burst(st.x, st.y, { color: '#67e8f9', count: 8, speed: 80, life: 0.3 });
  }

  onLifeLost() {
    // back into orbit around the last planet, chain broken
    this.fly = null; this.trail = [];
    this.deaths++; this.chain = 0; this.nearMiss = false; this.holeGraze = false;
    this.s.resetCombo();
    this.enter(this.lastPlanet || this.planets[0], null);
  }

  update(dt) {
    const s = this.s;
    this.t += dt;
    if (this.hintT > 0) this.hintT -= dt;
    // moving planets
    for (const p of this.planets) if (p.amp) p.x = p.x0 + Math.sin(this.t * p.om + p.phase) * p.amp;

    if (this.orbit) {
      const o = this.orbit;
      o.a += orbitSpeed(this.level) * o.dir * dt;
      this.lastPlanet = o.p;
      return;
    }
    if (!this.fly) return;

    const f = this.fly;
    f.t += dt;
    this.trail.push({ x: f.x, y: f.y, a: 1 });
    if (this.trail.length > 26) this.trail.shift();

    const hit = stepFlight(f, this.planets, dt);
    // badge trackers: grazing a planet's gravity well / the black hole mid-flight
    if (f.t > 0.25) for (const p of this.planets) {
      if (p === f.from || p.goal) continue;
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d < p.r + 46 && d > p.r + HOPPER_R + 2) this.nearMiss = true;
    }
    if (this.hole && Math.hypot(this.hole.x - f.x, this.hole.y - f.y) < this.hole.r * 3) this.holeGraze = true;
    // stars
    for (const st of this.lootStars) {
      if (!st.got && Math.hypot(st.x - f.x, st.y - f.y) < STAR_R + HOPPER_R + 4) {
        st.got = true;
        s.award(15 * this.level, st.x, st.y - 14, { chain: false, color: '#fde68a' });
        s.sound.play('gem', 1);
        s.fx.burst(st.x, st.y, { color: '#fde68a', count: 10, speed: 110, life: 0.35 });
      }
    }
    // black hole
    if (this.hole && Math.hypot(this.hole.x - f.x, this.hole.y - f.y) < this.hole.r + HOPPER_R) {
      s.fx.flash('#a78bfa'); s.fx.shake(6, 0.3);
      s.sound.play('boom');
      return s.hurt();
    }
    if (hit && !(hit === f.from && f.t < 0.15)) {
      if (this.bonus) s.award(10 * this.level, f.x, f.y, { chain: true, color: '#86efac' });
      this.fly = null; this.trail = [];
      return this.enter(hit, { x: f.x, y: f.y });
    }
    const b = bounds(this.planets);
    const lost = f.t > MAX_FLIGHT || f.x < b.x0 || f.x > b.x1 || f.y > b.y1 || f.y < b.y0;
    if (lost) {
      if (this.bonus) { this.fly = null; this.trail = []; return this.enter(this.lastPlanet || this.planets[0], null); }
      s.sound.play('hit');
      s.fx.text(W / 2, 200, 'Lost in the void…', { color: '#fda4af', size: 20, life: 1.2 });
      return s.hurt();
    }
  }

  idle(dt) { this.t += dt; if (this.orbit) this.orbit.a += orbitSpeed(this.level) * this.orbit.dir * dt; }

  // ── Drawing ─────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, lo = s.lowDetail;
    // camera follows the hopper, clamped to the level
    const hy = this.hy();
    const b = bounds(this.planets);
    const target = clamp(hy - H * 0.55, b.y0 - 60, Math.max(b.y0 - 60, 0 + 140 - H));
    this.cam += (target - (this.cam ?? target)) * 0.12;
    const cam = this.cam;

    // sky
    ctx.fillStyle = this.bonus ? '#140b24' : '#070b18';
    ctx.fillRect(0, 0, W, H);
    for (const st of this.stars) {
      const y = ((st.y - cam * st.z * 0.3) % H + H) % H;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(this.t * 2 + st.tw);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(st.x, y, st.z > 0.7 ? 2 : 1, st.z > 0.7 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(0, -cam);

    // gravity hint rings + planets
    for (const p of this.planets) {
      if (!lo) {
        const g = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.r * 2.1);
        g.addColorStop(0, `hsla(${p.hue}, 80%, 60%, .16)`); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.1, 0, Math.PI * 2); ctx.fill();
      }
      // orbit line of the current planet
      if (this.orbit?.p === p) {
        ctx.strokeStyle = 'rgba(103,232,249,.35)'; ctx.setLineDash([4, 7]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + ORBIT_GAP, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      const pg = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r);
      pg.addColorStop(0, `hsl(${p.hue}, 75%, ${p.goal ? 72 : 62}%)`);
      pg.addColorStop(1, `hsl(${p.hue}, 70%, ${p.goal ? 38 : 22}%)`);
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if (p.goal) {
        // the beacon: a lighthouse pulse
        const k = 0.6 + 0.4 * Math.sin(this.t * 3);
        ctx.strokeStyle = `rgba(253,224,71,${0.5 * k})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8 + 6 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fde047'; ctx.font = `700 ${Math.round(p.r * 0.6)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', p.x, p.y + 1);
      } else if (p.start) {
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('PAD', p.x, p.y + 1);
      }
    }

    // black hole
    if (this.hole) {
      const h = this.hole, k = 1 + 0.08 * Math.sin(this.t * 5);
      if (!lo) { const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r * 3); g.addColorStop(0, 'rgba(167,139,250,.5)'); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#05010d'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, Math.PI * 2); ctx.stroke();
    }

    // loot stars
    for (const st of this.lootStars) {
      if (st.got) continue;
      const k = 1 + 0.2 * Math.sin(this.t * 4 + st.x);
      ctx.fillStyle = '#fde68a';
      this.star(ctx, st.x, st.y, STAR_R * k);
    }

    // flight trail
    for (let i = 0; i < this.trail.length; i++) {
      const tr = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.5;
      ctx.fillStyle = s.gold ? '#fbbf24' : '#67e8f9';
      ctx.fillRect(tr.x - 2, tr.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // the hopper (gold once the zone egg is held)
    const hx = this.hx(), hhy = this.hy();
    const ang = this.fly ? Math.atan2(this.fly.vy, this.fly.vx)
      : this.orbit.a + (Math.PI / 2) * this.orbit.dir;
    this.drawHopper(ctx, hx, hhy, ang, s.gold);

    // release direction nudge for the first level
    if (this.orbit && this.hintT > 0 && Math.floor(this.t * 2) % 2 === 0) {
      const o = this.orbit, v = orbitState(o.p, o.a, o.dir, this.level);
      const n = Math.hypot(v.vx, v.vy);
      ctx.strokeStyle = 'rgba(253,224,71,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, hhy); ctx.lineTo(hx + v.vx / n * 34, hhy + v.vy / n * 34); ctx.stroke();
    }
    ctx.restore();

    // HUD: climb progress to the beacon
    const goal = this.planets[this.planets.length - 1], start = this.planets[0];
    const cy = this.fly ? this.fly.y : this.orbit?.p.y ?? start.y;
    const frac = clamp((start.y - cy) / (start.y - goal.y || 1), 0, 1);
    progressBar(ctx, 16, 14, W - 32, 16, frac, '#67e8f9', `Climb ${Math.round(frac * 100)}%  ·  ★ ${this.lootStars.filter((x) => x.got).length}/${this.lootStars.length}`);
    if (this.hintT > 0) {
      ctx.fillStyle = 'rgba(226,232,240,.85)'; ctx.font = '600 15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(this.s.coarse ? 'Tap to let go — ride gravity upward' : 'Press SPACE or click to let go', W / 2, H - 24);
    }
  }

  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  drawHopper(ctx, x, y, ang, gold) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    // body
    ctx.fillStyle = gold ? '#fbbf24' : '#e0f2fe';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
    // visor
    ctx.fillStyle = gold ? '#78350f' : '#0ea5e9';
    ctx.beginPath(); ctx.arc(0, -2, 3.4, 0, Math.PI * 2); ctx.fill();
    // thruster glow while flying
    if (this.fly) { ctx.fillStyle = gold ? 'rgba(251,191,36,.6)' : 'rgba(103,232,249,.6)'; ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(4, 8); ctx.lineTo(0, 15 + 3 * Math.sin(this.t * 30)); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
//  STATION DEFENSE — Zone 5, slot 27.
//
//  A space tower defence. Ships fly a glowing lane from a warp gate down to
//  your station. Tap a pad to build a turret, tap a turret to upgrade or sell
//  it, and tap anywhere else to fire the station cannon. Call the next wave
//  early for bonus points. Every 5th level is a Meteor Storm bonus round.
//
//  The rules live in sim.js (shared with check.mjs, which proves every level
//  can be won); this file draws them and turns taps into orders.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { W, H, OY, CELL, SX, SY, STATION_R, SHIELDS, TURRETS, KINDS, CANNON, Sim, tierOf, sellValue, pointAt, statLine } from './sim.js';

const ID = 'station-defense';
const ACCENT = '#818cf8';
const GOLD = '#fbbf24';
const SHIP_COL = { scout: '#4ade80', raider: '#fb923c', tank: '#a78bfa', dart: '#facc15', splitter: '#f472b6', shard: '#f9a8d4', warden: '#2dd4bf', mother: '#f43f5e' };
const BTN = { x: W - 132, y: 8, w: 122, h: 32 };       // the NEXT WAVE button in the top strip
const BAND_MIN = 110;                                   // a phone band at least this tall gets the control panel

// Station Defense's own sounds (the turret, cannon and kill sounds are made in onEvent)
const SFX = {
  build: (S) => { S.tone({ freq: 520, to: 780, dur: 0.07, type: 'square', vol: 0.05 }); S.tone({ freq: 780, to: 1170, dur: 0.08, type: 'square', vol: 0.045, delay: 0.06 }); },
  upgrade: (S) => [0, 4, 7, 12].forEach((k, i) => S.tone({ freq: 523 * 2 ** (k / 12), dur: 0.09, type: 'triangle', vol: 0.07, delay: i * 0.05 })),
  sell: (S) => S.tone({ freq: 900, to: 450, dur: 0.14, type: 'triangle', vol: 0.06 }),
  wave: (S) => { S.tone({ freq: 98, to: 82, dur: 0.6, type: 'sawtooth', vol: 0.08 }); S.tone({ freq: 147, to: 123, dur: 0.6, type: 'sawtooth', vol: 0.045 }); S.noise({ dur: 0.5, vol: 0.05, freq: 400, to: 1600, type: 'bandpass' }); },
  boss: (S) => [0, 0.42, 0.84].forEach((d) => S.tone({ freq: 73, to: 55, dur: 0.36, type: 'sawtooth', vol: 0.11, delay: d })),
  leak: (S) => { S.tone({ freq: 880, dur: 0.1, type: 'square', vol: 0.055 }); S.tone({ freq: 622, dur: 0.14, type: 'square', vol: 0.055, delay: 0.11 }); },
  early: (S) => { S.tone({ freq: 300, to: 1200, dur: 0.22, type: 'sawtooth', vol: 0.045 }); S.tone({ freq: 1200, dur: 0.08, type: 'square', vol: 0.04, delay: 0.2 }); },
  deny: (S) => S.tone({ freq: 160, dur: 0.08, type: 'square', vol: 0.04 }),
};

const INFO = {
  1: 'Tap a glowing pad to build a laser. Tap anywhere else to fire the station cannon.',
  2: 'RAIDERS take more hits. Tap a turret to upgrade it.',
  3: 'TANKS! Armour shrugs off small hits. MISSILE PODS unlocked: they blast whole groups.',
  4: 'DARTS: tiny and very fast. Call waves early for bonus points.',
  6: 'CRYO BEAM unlocked: its frost pulse slows every ship in range.',
  7: 'SPLITTERS break into two shards when you destroy them.',
  8: 'TESLA COIL unlocked: lightning jumps from ship to ship, straight through armour.',
  9: 'WARDENS carry a shield bubble (lightning tears through it). Some maps now have TWO gates.',
  11: 'A MOTHERSHIP leads the final wave, launching fighters as it comes.',
};

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 1.6,          // kills within 1.6 s of each other chain the combo
  comboStep: 4,
  maxMultiplier: 6,
  bonusTime: 20,
  detail: true,
  extend: { maxH: 1000, topShare: 0 },   // tall phones: a control panel (info + a big NEXT WAVE button) under the station
  // original tune: its own 8-bar progression (audio.js 'station') on the synth kit, with a hook over the top
  music: {
    bpm: 122, style: 'station', lead: 'square', kit: 'synth',
    arp: [0, 2, 4, 2, 1, 3, 5, 3], oct: [12, 12, 12, 12, 12, 12, 24, 12],
    hook: [4, null, 3, 2, 4, null, 5, 4, 3, null, 2, 1, 2, 3, 4, null],
  },
  levelClearPoints: (level, bonus) => (bonus ? 100 : 150) * level,
  levelInfo: (level, bonus) => bonus
    ? '★ METEOR STORM! Nothing can hurt the station. Blast every rock you can.'
    : INFO[level] || (level % 2 && level > 11 ? 'Mothership in the final wave. Hold the line!' : 'A new lane, tougher ships. Hold the line!'),
  create: (shell) => new StationDefense(shell),
});

class StationDefense {
  constructor(s) {
    this.s = s; this.t = 0; this.mapN = 0;
    // cosmetic backdrop (Math.random is fine: it never touches gameplay)
    this.stars = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() }));
    this.nebula = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * W, y: OY + Math.random() * (H - OY), r: 110 + Math.random() * 130, hue: [250, 205, 290, 225, 185][i] }));
    this.hover = null;
    addEventListener('keydown', (e) => this.onKey(e));
    this.startLevel(1, false);
  }

  reset() { this.hintBuild = true; this.hintFire = true; }

  /** Desktop shortcuts: hover (or select) a pad and press 1–4 to build; U upgrades, X sells. */
  onKey(e) {
    if (this.s.state !== 'playing' || !this.sim || e.repeat || e.target instanceof HTMLInputElement) return;
    const h = this.hover, pad = this.sel?.pad || (h && this.padAt(h.x, h.y));
    if (!pad) return;
    const t = this.sim.turretAt(pad), n = /^Digit([1-4])$/.exec(e.code);
    if (n && !t) {
      const kind = KINDS[+n[1] - 1], T = TURRETS[kind];
      if (T.unlock > this.level || this.sim.credits < T.cost) { SFX.deny(this.s.sound); return; }
      this.sim.build(pad, kind); this.sel = null; this.hintBuild = false;
    } else if (e.code === 'KeyU' && t) { if (!this.sim.upgrade(t)) SFX.deny(this.s.sound); }
    else if ((e.code === 'KeyX' || e.code === 'Delete') && t) { this.sim.sell(t); this.sel = null; }
  }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.sel = null; this.beams = []; this.booms = []; this.arcs = [];
    this.aim = -Math.PI / 2; this.recoil = 0; this.shieldHit = 0; this.lastZap = 0;
    this.early = 0; this.cannonKills = 0;
    this.mapN++;
    if (bonus) {
      this.sim = null;
      this.storm = { rocks: [], shells: [], spawn: 0.4, cd: 0, hits: 0 };
      return;
    }
    this.storm = null;
    this.sim = new Sim(level, this.s.rng);
  }

  onLifeLost() {
    this.sim?.restartWave();
    this.sel = null; this.beams = []; this.booms = []; this.arcs = [];
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x, y) {
    if (a === 'action') { if (this.sim) this.callWave(); return; }
    if (a === 'press' && x !== undefined) this.tap(x, y);
  }
  onPointerMove(x, y) { this.hover = { x, y }; }

  callWave() {
    const secs = this.sim.callWave();
    if (!secs) return;
    const b = this.bandUi();
    this.s.award(5 * secs * this.level, b ? W / 2 : BTN.x + BTN.w / 2, b ? b.btn.y - 14 : BTN.y + BTN.h + 18, { color: '#fde047', size: 16 });
    SFX.early(this.s.sound);
    if (++this.early >= 3) this.s.unlock('early3');
  }

  tap(x, y) {
    const s = this.s;
    const band = this.bandUi();
    if (y > H) {                                    // the phone control panel: only its button reacts
      const B = band?.btn;
      if (this.sim && B && x >= B.x && x <= B.x + B.w && y >= B.y - 8 && y <= B.y + B.h + 8) this.callWave();
      return;
    }
    if (this.storm) return this.stormFire(x, y);
    if (y < OY) {
      if (band) return;                             // the strip's own button is replaced by the big one below
      if (x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y - 6 && y <= BTN.y + BTN.h + 6) this.callWave();
      return;
    }
    if (this.sel) {                                   // an open menu takes the tap first
      const it = this.menuItems().find((m) => Math.hypot(m.x - x, m.y - y) < 28);
      if (it) return this.doMenu(it);
      const p = this.padAt(x, y);
      this.sel = p && p !== this.sel.pad ? { pad: p } : null;   // anywhere else just closes it
      if (this.sel) s.sound.play('click');
      return;
    }
    const p = this.padAt(x, y);
    if (p) { this.sel = { pad: p }; s.sound.play('click'); return; }
    if (this.sim.fire(x, y)) {
      this.aim = Math.atan2(y - (SY - 16), x - SX); this.recoil = 1; this.hintFire = false;
      s.sound.tone({ freq: 320, to: 90, dur: 0.16, type: 'sawtooth', vol: 0.07 });
      s.sound.noise({ dur: 0.08, vol: 0.06, freq: 2400, to: 500 });
    } else s.sound.tone({ freq: 180, dur: 0.035, type: 'square', vol: 0.025 });   // still reloading
  }

  padAt(x, y) { return this.sim.map.pads.find((p) => Math.abs(p.x - x) < 25 && Math.abs(p.y - y) < 25) || null; }

  /** The phone control panel under the station: an info card and a big NEXT WAVE button
   *  (null on desktop and short screens, where both stay in the playfield). */
  bandUi() {
    const b = this.s.bands?.bottom || 0;
    if (b < BAND_MIN) return null;
    const bh = Math.round(Math.min(62, b * 0.4));
    return { h: b, info: { y: H + 10, h: Math.max(44, Math.min(60, b - bh - 34)) }, btn: { x: 16, y: H + b - bh - 14, w: W - 32, h: bh } };
  }

  /** The round buttons around the selected pad: the four turrets, or upgrade / sell. */
  menuItems() {
    const sel = this.sel, sim = this.sim;
    if (!sel || !sim) return [];
    const p = sel.pad, t = sim.turretAt(p), items = [];
    if (t) {
      const next = TURRETS[t.kind].tiers[t.tier + 1];
      items.push({ act: 'up', t, cost: next?.up, max: !next, ok: !!next && sim.credits >= next.up });
      items.push({ act: 'sell', t, value: sellValue(t), ok: true });
    } else {
      for (const kind of KINDS) {
        const T = TURRETS[kind], locked = T.unlock > this.level;
        items.push({ act: 'build', kind, cost: T.cost, locked, ok: !locked && sim.credits >= T.cost });
      }
    }
    // an arc above the pad (below it near the top), swung away from the sides
    const n = items.length, R = n > 2 ? 66 : 60;
    const spread = n === 1 ? 0 : n > 2 ? 2.55 : 1.25;
    const above = p.y > OY + 130;
    let base = above ? -Math.PI / 2 : Math.PI / 2;
    const lean = p.x < 120 ? 0.75 : p.x > W - 120 ? -0.75 : 0;
    base += above ? lean : -lean;
    items.forEach((it, i) => {
      const f = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const a = base + (above ? f : -f);              // left to right in the same order either way
      it.x = clamp(p.x + Math.cos(a) * R, 28, W - 28);
      it.y = clamp(p.y + Math.sin(a) * R, OY + 28, H - 28);
    });
    return items;
  }

  doMenu(it) {
    const sim = this.sim, s = this.s, p = this.sel.pad;
    if (it.act === 'build') {
      if (it.locked) { s.fx.text(it.x, it.y - 34, `Unlocks at level ${TURRETS[it.kind].unlock}`, { color: '#cbd5e1', size: 14, life: 1 }); return; }
      if (!it.ok) return this.short(it);
      sim.build(p, it.kind); this.sel = null; this.hintBuild = false;
    } else if (it.act === 'up') {
      if (it.max) return;
      if (!it.ok) return this.short(it);
      sim.upgrade(it.t);                              // the menu stays open: tap again for the next tier
    } else if (it.act === 'sell') { sim.sell(it.t); this.sel = null; }
  }
  short(it) {
    this.s.fx.text(it.x, it.y - 34, 'Not enough ⚡', { color: '#fca5a5', size: 14, life: 0.8 });
    SFX.deny(this.s.sound);
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; this.fade(dt); }

  update(dt) {
    this.t += dt;
    this.fade(dt);
    if (this.storm) return this.updateStorm(dt);
    const sim = this.sim;
    sim.step(dt);
    for (const ev of sim.events) this.onEvent(ev);
    sim.events.length = 0;
    // missiles leave a smoke trail
    for (const m of sim.shots) {
      if (m.kind !== 'missile') continue;
      (m.trail ||= []).push(m.x, m.y);
      if (m.trail.length > 16) m.trail.splice(0, 2);
    }
  }

  fade(dt) {
    for (const list of [this.beams, this.booms, this.arcs]) for (const b of list) b.life -= dt;
    if (this.beams.some((b) => b.life <= 0) || this.beams.length > 40) this.beams = this.beams.filter((b) => b.life > 0).slice(-40);
    if (this.booms.some((b) => b.life <= 0)) this.booms = this.booms.filter((b) => b.life > 0);
    if (this.arcs.some((b) => b.life <= 0)) this.arcs = this.arcs.filter((b) => b.life > 0);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.shieldHit = Math.max(0, this.shieldHit - dt * 2.5);
  }

  /** A short sound, at most one per 50 ms per kind (a dozen lasers mustn't make a dozen sounds). */
  sfx(kind, play) {
    const k = `last_${kind}`;
    if (this.t - (this[k] || -1) < 0.05) return;
    this[k] = this.t;
    play(this.s.sound);
  }

  onEvent(ev) {
    const s = this.s, L = this.level, sim = this.sim;
    switch (ev.type) {
      case 'kill': {
        const e = ev.e, col = SHIP_COL[e.type], big = e.type === 'mother';
        // floating "+points" only for the cannon's kills and the big ships, or the lane drowns in numbers
        const label = ev.by === 'cannon' || e.pts >= 40;
        s.award(e.pts * L, label ? e.x : undefined, e.y - 14, { chain: true, color: col, size: big ? 24 : 15 });
        s.fx.burst(e.x, e.y, { colors: [col, '#ffffff'], count: big ? 60 : e.r > 11 ? 18 : 10, speed: big ? 220 : 140, life: big ? 0.9 : 0.45 });
        this.booms.push({ x: e.x, y: e.y, r: e.r * 2.2, life: big ? 0.6 : 0.3, max: big ? 0.6 : 0.3, col });
        if (big) { s.fx.shake(10, 0.5); s.sound.play('boom'); s.fx.text(e.x, e.y - 40, 'MOTHERSHIP DOWN!', { color: '#fda4af', size: 24, life: 1.4 }); s.unlock('mother'); }
        else this.sfx('kill', (S) => S.noise({ dur: 0.12, vol: 0.07, freq: 1600, to: 200 }));
        if (ev.by === 'cannon') this.cannonKills++;
        break;
      }
      case 'leak':
        s.resetCombo();
        this.shieldHit = 1;
        s.fx.shake(ev.e.leak > 1 ? 8 : 5, 0.25);
        SFX.leak(s.sound);
        s.fx.text(SX, SY - 76, `−${ev.e.leak} 🛡`, { color: '#fca5a5', size: 18, life: 0.9 });
        break;
      case 'down': s.hurt(); break;
      case 'wave': {
        const last = ev.w === sim.waves - 1, boss = last && sim.plan.waves[ev.w].some((g) => g.type === 'mother');
        s.fx.text(W / 2, OY + 130, boss ? 'FINAL WAVE · MOTHERSHIP' : last ? 'FINAL WAVE' : `WAVE ${ev.w + 1}`, { color: boss ? '#fda4af' : '#c7d2fe', size: boss ? 26 : 30, life: 1.3 });
        (boss ? SFX.boss : SFX.wave)(s.sound);
        break;
      }
      case 'waveClear':
        if (ev.perfect) s.award(25 * L, W / 2, OY + 170, { color: '#a3e635', size: 18 });
        break;
      case 'clear':
        if (ev.shields) s.award(15 * L * ev.shields, SX, SY - 90, { color: '#93c5fd', size: 20 });
        if (ev.shields === SHIELDS && L >= 3) s.unlock('spotless');
        s.completeLevel();
        break;
      case 'laser': {
        const t = ev.t, k = 14 + t.tier * 2;
        this.beams.push({ x1: t.x + Math.cos(t.aim) * k, y1: t.y + Math.sin(t.aim) * k, x2: ev.x, y2: ev.y, life: 0.07, max: 0.07, w: 1.5 + t.tier, col: '#67e8f9' });
        this.sfx('laser', (S) => S.tone({ freq: 1500 + Math.random() * 300, to: 700, dur: 0.045, type: 'square', vol: 0.018 }));
        break;
      }
      case 'missile':
        ev.t.flash = 1;
        this.sfx('missile', (S) => S.noise({ dur: 0.18, vol: 0.05, freq: 600, to: 2400, type: 'bandpass' }));
        break;
      case 'frost':
        ev.t.flash = 1;
        this.booms.push({ x: ev.t.x, y: ev.t.y, r: ev.r, life: 0.45, max: 0.45, col: '#bae6fd', fill: true });
        this.sfx('frost', (S) => S.tone({ freq: 2200, to: 1300, dur: 0.12, type: 'sine', vol: 0.03 }));
        break;
      case 'tesla':
        ev.t.flash = 1;
        this.arcs.push({ pts: ev.pts, life: 0.14, max: 0.14 });
        if (ev.pts.length > 5) s.unlock('chain5');
        this.sfx('tesla', (S) => S.noise({ dur: 0.1, vol: 0.07, freq: 3200, to: 900, type: 'highpass' }));
        break;
      case 'shieldBreak':
        s.fx.burst(ev.e.x, ev.e.y, { colors: ['#5eead4', '#ccfbf1'], count: 14, speed: 120, life: 0.4 });
        this.sfx('shield', (S) => S.tone({ freq: 900, to: 300, dur: 0.15, type: 'triangle', vol: 0.05 }));
        break;
      case 'launch':
        s.fx.burst(ev.f.x, ev.f.y, { color: '#4ade80', count: 6, speed: 60, life: 0.3 });
        break;
      case 'boom':
        if (ev.by === 'cannon') {
          if (this.cannonKills >= 3) s.unlock('cannon3');
          this.cannonKills = 0;
          this.booms.push({ x: ev.x, y: ev.y, r: ev.r, life: 0.35, max: 0.35, col: s.gold ? GOLD : '#c4b5fd' });
          this.sfx('cannon', (S) => S.noise({ dur: 0.2, vol: 0.12, freq: 900, to: 110 }));
        } else {
          this.booms.push({ x: ev.x, y: ev.y, r: ev.r, life: 0.4, max: 0.4, col: '#fdba74' });
          s.fx.burst(ev.x, ev.y, { colors: ['#fb923c', '#fde68a'], count: 10, speed: 110, life: 0.35 });
          this.sfx('boom', (S) => S.noise({ dur: 0.25, vol: 0.1, freq: 700, to: 90 }));
        }
        break;
      case 'build':
        SFX.build(s.sound);
        s.fx.burst(ev.t.x, ev.t.y, { color: TURRETS[ev.t.kind].color, count: 12, speed: 90, life: 0.4 });
        if (new Set(sim.turrets.map((t) => t.kind)).size === KINDS.length) s.unlock('arsenal');
        break;
      case 'upgrade':
        SFX.upgrade(s.sound);
        s.fx.ring(ev.t.x, ev.t.y, { color: TURRETS[ev.t.kind].color, radius: 30 });
        if (ev.t.tier === 2) s.unlock('maxed');
        break;
      case 'sell':
        SFX.sell(s.sound);
        s.fx.text(ev.t.x, ev.t.y - 22, `+${ev.v} ⚡`, { color: '#fde047', size: 16, life: 0.9 });
        break;
    }
  }

  // ── Meteor Storm (bonus round) ─────────────────────────────
  updateStorm(dt) {
    const st = this.storm, s = this.s;
    if ((st.spawn -= dt) <= 0) {
      st.spawn = 0.3;
      const gold = s.rng.chance(0.12);
      st.rocks.push({
        x: s.rng.range(40, W - 40), y: OY - 24, vx: s.rng.range(-45, 45), vy: s.rng.range(80, 150),
        r: gold ? 13 : s.rng.range(12, 22), hp: gold ? 1 : s.rng.chance(0.3) ? 2 : 1, gold, rot: 0, vr: s.rng.range(-2, 2), seed: s.rng.int(0, 999),
      });
    }
    if (st.cd > 0) st.cd -= dt;
    for (const r of st.rocks) {
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt;
      if (r.x < r.r || r.x > W - r.r) r.vx *= -1;
      if (r.y > SY - STATION_R - 20 && r.hp > 0) {          // burns up on the shield: no harm, but the combo breaks
        r.hp = 0; this.shieldHit = 0.6; s.resetCombo();
        s.fx.burst(r.x, r.y, { colors: ['#93c5fd', '#e0f2fe'], count: 8, speed: 80, life: 0.35 });
      }
    }
    for (const sh of st.shells) {
      sh.t += dt;
      const k = Math.min(1, sh.t / sh.T);
      sh.x = sh.ox + (sh.tx - sh.ox) * k; sh.y = sh.oy + (sh.ty - sh.oy) * k;
      if (k < 1) continue;
      sh.dead = true;
      this.booms.push({ x: sh.tx, y: sh.ty, r: 34, life: 0.3, max: 0.3, col: s.gold ? GOLD : '#c4b5fd' });
      for (const r of st.rocks) {
        if (r.hp <= 0 || Math.hypot(r.x - sh.tx, r.y - sh.ty) > 34 + r.r * 0.6) continue;
        if (--r.hp > 0) { s.fx.burst(r.x, r.y, { color: '#a8a29e', count: 6, speed: 90, life: 0.3 }); continue; }
        if (++st.hits >= 40) s.unlock('storm');
        s.award((r.gold ? 60 : 15) * this.level, r.x, r.y - 16, { chain: true, color: r.gold ? GOLD : '#e7e5e4', size: r.gold ? 20 : 15 });
        s.fx.burst(r.x, r.y, { colors: r.gold ? [GOLD, '#fff7ed'] : ['#a8a29e', '#fb923c'], count: r.gold ? 24 : 14, speed: 160, life: 0.5 });
        s.sound.play(r.gold ? 'golden' : 'brick', s.comboCount);
      }
      s.sound.noise({ dur: 0.14, vol: 0.08, freq: 1100, to: 140 });
    }
    st.shells = st.shells.filter((x) => !x.dead);
    st.rocks = st.rocks.filter((r) => r.hp > 0 && r.y < H + 40);
  }

  stormFire(x, y) {
    const st = this.storm;
    if (st.cd > 0 || y < OY) return;
    st.cd = 0.16;
    const ox = SX, oy = SY - 16;
    st.shells.push({ ox, oy, x: ox, y: oy, tx: x, ty: y, t: 0, T: Math.hypot(x - ox, y - oy) / 1100 });
    this.aim = Math.atan2(y - oy, x - ox); this.recoil = 1;
    this.s.sound.tone({ freq: 420, to: 120, dur: 0.1, type: 'sawtooth', vol: 0.05 });
  }

  // ── Drawing ────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, lo = s.lowDetail;
    s.layer(ctx, `sd:${this.mapN}:${lo ? 0 : 1}:${s.bands?.bottom || 0}`, (c) => this.paintMap(c, lo));
    if (this.storm) return this.renderStorm(ctx);
    const sim = this.sim;
    this.drawFlow(ctx);
    this.drawGates(ctx);
    this.drawPads(ctx);
    for (const t of sim.turrets) this.drawTurret(ctx, t);
    for (const e of sim.enemies) this.drawShip(ctx, e, lo);
    this.drawShots(ctx, sim.shots);
    this.drawBeams(ctx);
    this.drawArcs(ctx);
    this.drawBooms(ctx);
    this.drawStation(ctx);
    this.drawSelection(ctx);
    this.drawReticle(ctx);
    this.drawHud(ctx);
    this.drawHints(ctx);
    this.drawBand(ctx);
  }

  /** Phone control panel: the selected turret's card (or a tip), and a big NEXT WAVE button. */
  drawBand(ctx) {
    const b = this.bandUi();
    if (!b) return;
    const sim = this.sim, B = b.btn;
    if (this.storm) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 22px system-ui'; ctx.fillStyle = GOLD; ctx.fillText(`☄️ ${this.storm.hits} rocks blasted`, W / 2, H + b.h / 2 - 12);
      ctx.font = '600 16px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText('Tap the rocks · gold ones pay 4×', W / 2, H + b.h / 2 + 18);
      return;
    }
    if (!this.sel) {
      const tip = sim.turrets.length === 0 ? 'Tap a glowing pad to build a turret'
        : sim.enemies.length ? `Tap near the ships to fire · ${sim.enemies.length} ship${sim.enemies.length === 1 ? '' : 's'} on the lane`
        : 'Tap a turret to upgrade or sell it';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 16px system-ui'; ctx.fillStyle = '#a5b4fc';
      ctx.fillText(tip, W / 2, b.info.y + b.info.h / 2, W - 40);
    }
    const can = sim.canCall, first = sim.wave < 0;
    const pulse = can && first ? 0.5 + 0.5 * Math.sin(this.t * 5) : 0;
    ctx.fillStyle = can ? `rgba(79,70,229,${0.8 + 0.2 * pulse})` : 'rgba(30,41,59,.85)';
    roundRect(ctx, B.x, B.y, B.w, B.h, 14); ctx.fill();
    ctx.strokeStyle = can ? '#a5b4fc' : 'rgba(100,116,139,.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 22px system-ui'; ctx.fillStyle = can ? '#fff' : '#64748b';
    const label = can ? `${first ? '▶ START WAVE 1' : `▶ SEND WAVE ${sim.wave + 2}`}  ·  ${Math.ceil(sim.countdown)}s`
      : sim.wave >= sim.waves - 1 ? `FINAL WAVE · ${sim.waves}/${sim.waves}` : `WAVE ${sim.wave + 1} INCOMING`;
    ctx.fillText(label, W / 2, B.y + B.h / 2 + 1);
    if (can) { ctx.font = '700 13px system-ui'; ctx.fillStyle = '#fde68a'; ctx.fillText(first ? 'early start pays bonus points' : `+${Math.ceil(sim.countdown)} ⚡ and bonus points for calling it early`, W / 2, B.y - 9); }
  }

  /** The static map, painted once per level into a cached layer: space, nebulae, stars, the lanes and the pads. */
  paintMap(c, lo) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070818'); g.addColorStop(1, '#0b0d24');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const band = this.s.bands?.bottom || 0;
    if (band) {                                  // the phone control panel
      c.fillStyle = '#05060f'; c.fillRect(0, H, W, band);
      c.fillStyle = 'rgba(129,140,248,.35)'; c.fillRect(0, H, W, 1);
    }
    if (!lo) for (const n of this.nebula) {
      const rg = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      rg.addColorStop(0, `hsla(${n.hue}, 70%, 45%, .16)`); rg.addColorStop(1, 'hsla(0,0%,0%,0)');
      c.fillStyle = rg; c.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    for (const st of this.stars) {
      if (st.y > H) continue;
      c.globalAlpha = 0.25 + st.z * 0.6; c.fillStyle = st.z > 0.85 ? '#e0e7ff' : '#94a3b8';
      const k = st.z > 0.85 ? 2 : 1; c.fillRect(st.x, st.y, k, k);
    }
    c.globalAlpha = 1;
    if (this.storm) return;
    // faint grid dots
    c.fillStyle = 'rgba(148,163,184,.10)';
    for (let y = OY; y <= H; y += CELL) for (let x = 0; x <= W; x += CELL) c.fillRect(x - 1, y - 1, 2, 2);
    // the lanes: a wide soft glow, a body, a bright core
    const lanes = this.sim.map.lanes;
    const path = (lane) => { c.beginPath(); lane.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [w, col] of [[34, 'rgba(129,140,248,.07)'], [22, 'rgba(129,140,248,.13)'], [12, 'rgba(30,27,75,.9)']]) for (const lane of lanes) { path(lane); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
    for (const lane of lanes) { path(lane); c.strokeStyle = 'rgba(165,180,252,.5)'; c.lineWidth = 2; if (!lo) { c.shadowColor = ACCENT; c.shadowBlur = 10; } c.stroke(); c.shadowBlur = 0; }
    // pads: little hex platforms
    for (const p of this.sim.map.pads) {
      hex(c, p.x, p.y, 19);
      c.fillStyle = '#121633'; c.fill();
      c.strokeStyle = 'rgba(129,140,248,.55)'; c.lineWidth = 2; c.stroke();
      hex(c, p.x, p.y, 12); c.strokeStyle = 'rgba(129,140,248,.22)'; c.lineWidth = 1; c.stroke();
    }
  }

  /** Chevrons drifting down each lane toward the station (lane 2 only up to where it joins lane 1). */
  drawFlow(ctx) {
    const gap = 28, off = (this.t * 36) % gap;
    ctx.strokeStyle = 'rgba(199,210,254,.32)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const lane of this.sim.map.lanes) {
      const end = Math.min(lane.own ?? lane.len, lane.len - 10);
      for (let d = off + 16; d < end; d += gap) {
        const [x, y, a] = pointAt(lane, d), ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(x - ca * 4 - sa * 4, y - sa * 4 + ca * 4); ctx.lineTo(x + ca * 2, y + sa * 2); ctx.lineTo(x - ca * 4 + sa * 4, y - sa * 4 - ca * 4);
      }
    }
    ctx.stroke();
  }

  drawGates(ctx) {
    const t = this.t, s = this.s, sim = this.sim;
    for (const lane of sim.map.lanes) {
      const [x, y] = lane.pts[0];
      const busy = sim.pending.some((p) => p.lane === lane.i && p.at - sim.t < 1.5);
      if (!s.lowDetail) { const g = s.glowSprite('rgba(167,139,250,.75)'); const r = busy ? 46 : 36; ctx.drawImage(g, x - r, y - r, r * 2, r * 2); }
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = i ? '#c4b5fd' : '#7c3aed';
        ctx.beginPath(); ctx.arc(x, y, 15 - i * 5, t * (i ? -4 : 3), t * (i ? -4 : 3) + Math.PI * 1.3); ctx.stroke();
      }
      ctx.fillStyle = '#1e1b4b'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawPads(ctx) {
    const sim = this.sim;
    const cheapest = Math.min(...KINDS.filter((k) => TURRETS[k].unlock <= this.level).map((k) => TURRETS[k].cost));
    const canBuild = sim.credits >= cheapest;
    const hov = this.hover && !this.s.coarse ? this.padAt(this.hover.x, this.hover.y) : null;
    for (const p of sim.map.pads) {
      if (sim.turretAt(p)) continue;
      const k = 0.5 + 0.5 * Math.sin(this.t * 3 + p.i);
      if (canBuild) {
        ctx.strokeStyle = `rgba(165,180,252,${0.25 + 0.35 * k})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - 5, p.y); ctx.lineTo(p.x + 5, p.y); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y + 5); ctx.stroke();
      }
      if (p === hov) { hex(ctx, p.x, p.y, 22); ctx.strokeStyle = 'rgba(199,210,254,.8)'; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }

  drawTurret(ctx, t) {
    const T = TURRETS[t.kind], col = T.color, flash = t.flash || 0;
    if (flash > 0) t.flash = Math.max(0, flash - 0.08);
    ctx.save(); ctx.translate(t.x, t.y);
    ctx.fillStyle = '#1b2140'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    switch (t.kind) {
      case 'laser': {
        ctx.rotate(t.aim);
        const len = 15 + t.tier * 3;
        ctx.fillStyle = '#cbd5e1';
        if (t.tier === 0) ctx.fillRect(0, -2.5, len, 5);
        else { ctx.fillRect(0, -5, len, 3.5); ctx.fillRect(0, 1.5, len, 3.5); }
        ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'missile': {
        ctx.rotate(t.aim);
        ctx.fillStyle = '#475569'; roundRect(ctx, -9, -9, 20 + t.tier * 2, 18, 4); ctx.fill();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
        const tubes = 2 + t.tier * 2;
        for (let i = 0; i < tubes; i++) {
          const row = i % 2, colI = Math.floor(i / 2);
          ctx.fillStyle = flash > 0.5 && colI === 0 ? '#fde68a' : col;
          ctx.beginPath(); ctx.arc(-3 + colI * 6, row ? 4 : -4, 2.4, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'cryo': {
        ctx.rotate(this.t * 0.6);
        ctx.strokeStyle = flash > 0 ? '#f0f9ff' : col; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3, r = 10 + t.tier;
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.moveTo(Math.cos(a) * r * 0.55 + Math.cos(a + 0.6) * 3, Math.sin(a) * r * 0.55 + Math.sin(a + 0.6) * 3); ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        }
        ctx.stroke();
        ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'tesla': {
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = i === 2 ? col : '#64748b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 4 - i * 5, 9 - i * 2, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
        const glow = 0.6 + 0.4 * Math.sin(this.t * 8 + t.id) + flash;
        if (!this.s.lowDetail) { const g = this.s.glowSprite('rgba(192,132,252,.8)'); const r = 12 + 4 * glow; ctx.drawImage(g, -r, -10 - r, r * 2, r * 2); }
        ctx.fillStyle = '#f5d0fe'; ctx.beginPath(); ctx.arc(0, -10, 4 + t.tier, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
    for (let i = 0; i <= t.tier; i++) { ctx.fillStyle = col; ctx.fillRect(t.x - 7 + i * 6, t.y + 18, 4, 3); }
  }

  drawShip(ctx, e, lo) {
    const col = SHIP_COL[e.type], s = this.s, r = e.r;
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.slowT > 0) { ctx.strokeStyle = 'rgba(186,230,253,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.rotate(e.a);
    if (!lo) { const g = s.glowSprite(col); ctx.globalAlpha = 0.55; ctx.drawImage(g, -r - 12, -9, 18, 18); ctx.globalAlpha = 1; }
    ctx.fillStyle = col;
    ctx.beginPath();
    switch (e.type) {
      case 'scout': ctx.moveTo(r, 0); ctx.lineTo(-r * 0.8, -r * 0.7); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, r * 0.7); break;
      case 'raider': ctx.moveTo(r, 0); ctx.lineTo(-r * 0.2, -r); ctx.lineTo(-r, -r * 0.9); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r, r * 0.9); ctx.lineTo(-r * 0.2, r); break;
      case 'tank': ctx.moveTo(r, -r * 0.45); ctx.lineTo(r, r * 0.45); ctx.lineTo(r * 0.4, r * 0.8); ctx.lineTo(-r, r * 0.8); ctx.lineTo(-r, -r * 0.8); ctx.lineTo(r * 0.4, -r * 0.8); break;
      case 'dart': ctx.moveTo(r * 1.4, 0); ctx.lineTo(-r, -r * 0.45); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r, r * 0.45); break;
      case 'splitter': ctx.moveTo(r, 0); ctx.lineTo(0, -r); ctx.lineTo(-r, -r * 0.5); ctx.lineTo(-r, r * 0.5); ctx.lineTo(0, r); break;
      case 'shard': ctx.moveTo(r, 0); ctx.lineTo(-r, -r * 0.8); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, r * 0.8); break;
      case 'warden': ctx.moveTo(r, 0); ctx.lineTo(r * 0.2, -r * 0.8); ctx.lineTo(-r, -r * 0.6); ctx.lineTo(-r, r * 0.6); ctx.lineTo(r * 0.2, r * 0.8); break;
      case 'mother': ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 0.3, -r * 0.9); ctx.lineTo(-r, -r * 0.8); ctx.lineTo(-r * 0.7, 0); ctx.lineTo(-r, r * 0.8); ctx.lineTo(r * 0.3, r * 0.9); break;
    }
    ctx.closePath(); ctx.fill();
    // details: armour plates, seams, bridge lights
    if (e.type === 'tank') { ctx.fillStyle = 'rgba(30,27,75,.55)'; ctx.fillRect(-r * 0.7, -r * 0.55, r * 1.1, r * 0.35); ctx.fillRect(-r * 0.7, r * 0.2, r * 1.1, r * 0.35); }
    if (e.type === 'splitter') { ctx.strokeStyle = 'rgba(80,7,36,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(-r, 0); ctx.stroke(); }
    if (e.type === 'mother') {
      ctx.fillStyle = 'rgba(76,5,25,.6)'; ctx.fillRect(-r * 0.6, -r * 0.35, r * 1.1, r * 0.7);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = (Math.floor(this.t * 4) + i) % 2 ? '#fecdd3' : '#9f1239'; ctx.fillRect(-r * 0.5 + i * r * 0.28, -2, r * 0.14, 4); }
    }
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(r * 0.25, 0, e.type === 'mother' ? 4 : 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (e.shield > 0) {
      const k = e.shield / e.maxShield;
      ctx.strokeStyle = `rgba(94,234,212,${0.35 + 0.5 * k})`; ctx.fillStyle = `rgba(94,234,212,${0.08 + 0.1 * k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (e.hp < e.maxHp) {
      const w = e.type === 'mother' ? 64 : r * 2 + 4, k = clamp(e.hp / e.maxHp, 0, 1), y = e.y - r - (e.type === 'mother' ? 14 : 9);
      ctx.fillStyle = 'rgba(15,23,42,.8)'; ctx.fillRect(e.x - w / 2, y, w, e.type === 'mother' ? 6 : 4);
      ctx.fillStyle = k > 0.5 ? '#4ade80' : k > 0.25 ? '#fbbf24' : '#f87171'; ctx.fillRect(e.x - w / 2, y, w * k, e.type === 'mother' ? 6 : 4);
    }
  }

  drawShots(ctx, shots) {
    const gold = this.s.gold;
    for (const sh of shots) {
      if (sh.kind === 'missile') {
        const tr = sh.trail || [];
        for (let i = 0; i < tr.length; i += 2) { ctx.globalAlpha = (i / tr.length) * 0.45; ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(tr[i], tr[i + 1], 1.5 + (i / tr.length) * 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.a);
        ctx.fillStyle = '#fb923c'; ctx.fillRect(-6, -2, 10, 4);
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(-7, 0, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        continue;
      }
      const a = Math.atan2(sh.ty - sh.oy, sh.tx - sh.ox);
      ctx.strokeStyle = gold ? 'rgba(251,191,36,.45)' : 'rgba(165,180,252,.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sh.x - Math.cos(a) * 16, sh.y - Math.sin(a) * 16); ctx.lineTo(sh.x, sh.y); ctx.stroke();
      ctx.fillStyle = gold ? GOLD : '#e0e7ff'; ctx.beginPath(); ctx.arc(sh.x, sh.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBeams(ctx) {
    ctx.lineCap = 'round';
    for (const b of this.beams) {
      ctx.globalAlpha = b.life / b.max;
      ctx.strokeStyle = b.col; ctx.lineWidth = b.w + 2;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = b.w * 0.6; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Tesla lightning: a jagged line through every ship it jumped to, re-jagged each frame. */
  drawArcs(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const a of this.arcs) {
      ctx.globalAlpha = Math.min(1, (a.life / a.max) * 1.6);
      for (const [w, col] of [[5, 'rgba(192,132,252,.45)'], [2, '#f5d0fe']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        for (let i = 0; i < a.pts.length; i++) {
          const [x, y] = a.pts[i];
          if (!i) { ctx.moveTo(x, y); continue; }
          const [px, py] = a.pts[i - 1];
          for (let k = 1; k <= 3; k++) {
            const f = k / 4, j = (Math.random() - 0.5) * 12;
            ctx.lineTo(px + (x - px) * f + j, py + (y - py) * f + j);
          }
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBooms(ctx) {
    for (const b of this.booms) {
      const k = 1 - b.life / b.max;
      ctx.globalAlpha = 1 - k;
      if (b.fill) { ctx.fillStyle = 'rgba(186,230,253,.12)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = b.col; ctx.lineWidth = 3 - 2 * k;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.35 + 0.65 * k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawStation(ctx) {
    const s = this.s, t = this.t, gold = s.gold;
    const sh = this.sim ? this.sim.shields / SHIELDS : 1;
    const hitK = this.shieldHit;
    ctx.strokeStyle = hitK > 0 ? `rgba(248,113,113,${0.4 + 0.5 * hitK})` : `rgba(147,197,253,${0.18 + 0.4 * sh})`;
    ctx.lineWidth = 2 + 2 * hitK;
    ctx.beginPath(); ctx.arc(SX, SY, STATION_R + 12, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(SX, SY, STATION_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gold ? GOLD : '#64748b'; ctx.lineWidth = 3; ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 0.4, on = (Math.floor(t * 3) + i) % 3 === 0;
      ctx.fillStyle = on ? (gold ? '#fde68a' : '#a5b4fc') : 'rgba(100,116,139,.6)';
      ctx.beginPath(); ctx.arc(SX + Math.cos(a) * (STATION_R - 7), SY + Math.sin(a) * (STATION_R - 7), 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.translate(SX, SY); ctx.rotate(this.aim);
    ctx.fillStyle = gold ? '#f59e0b' : '#94a3b8'; ctx.fillRect(6 - this.recoil * 6, -5, 30, 10);
    ctx.fillStyle = gold ? GOLD : '#e2e8f0'; ctx.fillRect(30 - this.recoil * 6, -6, 6, 12);
    ctx.restore();
    ctx.fillStyle = gold ? '#b45309' : '#312e81'; ctx.beginPath(); ctx.arc(SX, SY, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = gold ? GOLD : ACCENT; ctx.beginPath(); ctx.arc(SX - 4, SY - 4, 7, 0, Math.PI * 2); ctx.fill();
    const cd = this.storm ? this.storm.cd / 0.16 : this.sim.cannonCd / CANNON.cd;
    ctx.strokeStyle = cd > 0 ? 'rgba(148,163,184,.7)' : (gold ? GOLD : '#4ade80'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(SX, SY, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - clamp(cd, 0, 1))); ctx.stroke();
  }

  drawSelection(ctx) {
    if (!this.sel) return;
    const sim = this.sim, p = this.sel.pad, t = sim.turretAt(p);
    const items = this.menuItems();
    const small = `800 ${this.s.coarse ? 13 : 12}px system-ui`;   // price labels: a size up on phones
    // the range shown: the turret's own, or (while building) the option under the mouse / the first one open
    const h = this.hover && !this.s.coarse ? items.find((m) => m.act === 'build' && !m.locked && Math.hypot(m.x - this.hover.x, m.y - this.hover.y) < 28) : null;
    const kind = t ? t.kind : h ? h.kind : KINDS.find((k) => TURRETS[k].unlock <= this.level);
    const range = t ? tierOf(t).range : TURRETS[kind].tiers[0].range;
    ctx.fillStyle = 'rgba(129,140,248,.08)'; ctx.strokeStyle = 'rgba(165,180,252,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, range, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    hex(ctx, p.x, p.y, 22); ctx.strokeStyle = '#e0e7ff'; ctx.lineWidth = 2; ctx.stroke();
    for (const it of items) {
      ctx.strokeStyle = 'rgba(165,180,252,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(it.x, it.y); ctx.stroke();
    }
    for (const it of items) {
      const on = it.ok && !it.max;
      ctx.fillStyle = on ? '#1e1b4b' : '#151826'; ctx.beginPath(); ctx.arc(it.x, it.y, 25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = it.act === 'sell' ? '#fde047' : it.act === 'build' && !it.locked ? (on ? TURRETS[it.kind].color : '#475569') : on ? '#a5b4fc' : '#475569';
      ctx.lineWidth = 2.5; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (it.act === 'build') {
        if (it.locked) { ctx.font = '700 16px system-ui'; ctx.fillStyle = '#64748b'; ctx.fillText('🔒', it.x, it.y - 4); }
        else this.turretIcon(ctx, it.kind, it.x, it.y - 5, on);
        ctx.font = small; ctx.fillStyle = it.locked ? '#64748b' : on ? '#fde047' : '#f87171';
        ctx.fillText(it.locked ? `L${TURRETS[it.kind].unlock}` : `${it.cost}⚡`, it.x, it.y + 13);
      } else if (it.act === 'up') {
        ctx.font = '800 17px system-ui'; ctx.fillStyle = on ? '#a5f3fc' : '#64748b'; ctx.fillText(it.max ? '★' : '▲', it.x, it.y - 5);
        ctx.font = small; ctx.fillStyle = it.max ? '#94a3b8' : on ? '#fde047' : '#f87171';
        ctx.fillText(it.max ? 'MAX' : `${it.cost}⚡`, it.x, it.y + 13);
      } else {
        ctx.font = '800 15px system-ui'; ctx.fillStyle = '#fde047'; ctx.fillText('↺', it.x, it.y - 5);
        ctx.font = small; ctx.fillText(`+${it.value}`, it.x, it.y + 13);
      }
    }
    // info card: in the phone panel if there is one, else over the map (at the bottom when the selection is near the top)
    const T = TURRETS[kind], band = this.bandUi();
    const y = band ? band.info.y : p.y < OY + 190 ? H - 150 : OY + 8;
    let line1, line2;
    if (t) {
      const st = tierOf(t), nx = T.tiers[t.tier + 1];
      line1 = `${T.name} · tier ${t.tier + 1} of 3`;
      line2 = `${statLine(t.kind, st)} · range ${st.range}` + (nx ? `  →  next: ${statLine(t.kind, nx)}` : '');
    } else {
      line1 = `${T.name} · ${T.cost} ⚡`;
      line2 = T.blurb;
    }
    const big = !!band, hh = big ? band.info.h : 46;
    ctx.fillStyle = 'rgba(8,10,28,.9)'; roundRect(ctx, 10, y, W - 20, hh, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(129,140,248,.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${big ? 17 : 15}px system-ui`; ctx.fillStyle = '#e0e7ff'; ctx.fillText(line1, 22, y + hh * 0.32);
    ctx.font = `600 ${big ? 15 : 13}px system-ui`; ctx.fillStyle = '#a5b4fc'; ctx.fillText(line2, 22, y + hh * 0.72, W - 44);
  }

  turretIcon(ctx, kind, x, y, on) {
    const col = on ? TURRETS[kind].color : '#64748b';
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
    switch (kind) {
      case 'laser': ctx.fillRect(x - 2, y - 11, 4, 10); ctx.beginPath(); ctx.arc(x, y + 1, 6, 0, Math.PI * 2); ctx.fill(); break;
      case 'missile': roundRect(ctx, x - 8, y - 6, 16, 12, 3); ctx.fill(); ctx.fillStyle = '#1e1b4b'; for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 3], [3, 3]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2); ctx.fill(); } break;
      case 'cryo': ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(x - Math.cos(a) * 8, y - Math.sin(a) * 8); ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); } ctx.stroke(); break;
      case 'tesla': ctx.beginPath(); ctx.moveTo(x + 3, y - 10); ctx.lineTo(x - 4, y + 1); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x - 3, y + 10); ctx.lineTo(x + 5, y - 2); ctx.lineTo(x, y - 2); ctx.closePath(); ctx.fill(); break;
    }
  }

  drawReticle(ctx) {
    const h = this.hover;
    if (!h || this.s.coarse || this.sel || h.y < OY || this.padAt(h.x, h.y)) return;
    const ready = this.sim.cannonCd === 0;
    ctx.strokeStyle = ready ? 'rgba(224,231,255,.7)' : 'rgba(148,163,184,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(h.x, h.y, CANNON.splash, 0, Math.PI * 2);
    ctx.moveTo(h.x - 6, h.y); ctx.lineTo(h.x + 6, h.y); ctx.moveTo(h.x, h.y - 6); ctx.lineTo(h.x, h.y + 6); ctx.stroke();
  }

  drawHud(ctx) {
    const sim = this.sim;
    ctx.fillStyle = 'rgba(5,6,20,.9)'; ctx.fillRect(0, 0, W, OY);
    ctx.fillStyle = 'rgba(129,140,248,.35)'; ctx.fillRect(0, OY - 1, W, 1);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '800 20px system-ui'; ctx.fillStyle = '#fde047'; ctx.fillText(`⚡${sim.credits}`, 12, 24);
    const sx = 96;
    ctx.font = '700 13px system-ui'; ctx.fillStyle = '#93c5fd'; ctx.fillText('🛡', sx, 24);
    for (let i = 0; i < SHIELDS; i++) { ctx.fillStyle = i < sim.shields ? '#60a5fa' : 'rgba(96,165,250,.18)'; ctx.fillRect(sx + 20 + i * 8, 17, 6, 14); }
    ctx.textAlign = 'center'; ctx.font = '800 14px system-ui'; ctx.fillStyle = '#c7d2fe';
    ctx.fillText(`WAVE ${Math.max(1, sim.wave + 1)}/${sim.waves}`, 255, 24);
    if (this.bandUi()) {                         // phones: the big button lives in the panel below; show the countdown here
      ctx.textAlign = 'right'; ctx.font = '700 13px system-ui'; ctx.fillStyle = sim.canCall ? '#fde68a' : '#64748b';
      ctx.fillText(sim.canCall ? `next in ${Math.ceil(sim.countdown)}s` : sim.wave >= sim.waves - 1 ? 'final wave' : 'incoming', W - 12, 24);
      return;
    }
    const can = sim.canCall, first = sim.wave < 0;
    const pulse = can && first ? 0.5 + 0.5 * Math.sin(this.t * 5) : 0;
    ctx.fillStyle = can ? `rgba(79,70,229,${0.75 + 0.25 * pulse})` : 'rgba(30,41,59,.8)';
    roundRect(ctx, BTN.x, BTN.y, BTN.w, BTN.h, 9); ctx.fill();
    ctx.strokeStyle = can ? '#a5b4fc' : 'rgba(100,116,139,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '800 13px system-ui'; ctx.fillStyle = can ? '#fff' : '#64748b';
    const label = can ? `${first ? '▶ START' : '▶ NEXT'}  ${Math.ceil(sim.countdown)}s` : sim.wave >= sim.waves - 1 ? 'LAST WAVE' : 'INCOMING';
    ctx.fillText(label, BTN.x + BTN.w / 2, BTN.y + BTN.h / 2 + 1);
  }

  drawHints(ctx) {
    if (this.level !== 1 || this.sel) return;
    const panel = !!this.bandUi();
    const sim = this.sim;
    let text = null, y = OY + 90;
    if (this.hintBuild && !sim.turrets.length) {
      const p = [...sim.map.pads].sort((a, b) => b.cover - a.cover)[0];
      const k = Math.sin(this.t * 6) * 4;
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 26 + k, 0, Math.PI * 2); ctx.stroke();
      text = panel ? null : this.s.coarse ? 'Tap a glowing pad to build a laser' : 'Click a glowing pad to build a laser';
      y = p.y < OY + 200 ? p.y + 60 : p.y - 50;
    } else if (this.hintFire && sim.enemies.length && !panel) {
      text = this.s.coarse ? 'Tap near the ships to fire the cannon' : 'Click near the ships to fire the cannon';
      y = SY - 90;
    }
    if (!text) return;
    ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(8,10,28,.85)'; roundRect(ctx, W / 2 - w / 2, y - 15, w, 30, 15); ctx.fill();
    ctx.fillStyle = '#fde68a'; ctx.fillText(text, W / 2, y);
  }

  renderStorm(ctx) {
    const st = this.storm, s = this.s;
    for (const r of st.rocks) {
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
      if (r.gold && !s.lowDetail) { const g = s.glowSprite('rgba(251,191,36,.8)'); ctx.drawImage(g, -r.r * 2, -r.r * 2, r.r * 4, r.r * 4); }
      ctx.fillStyle = r.gold ? GOLD : r.hp > 1 ? '#78716c' : '#a8a29e';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, k = 0.78 + 0.22 * Math.abs(Math.sin(r.seed + i * 1.7)); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(r.r * 0.25, -r.r * 0.2, r.r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    this.drawShots(ctx, st.shells);
    this.drawBooms(ctx);
    this.drawStation(ctx);
    ctx.fillStyle = 'rgba(5,6,20,.9)'; ctx.fillRect(0, 0, W, OY);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 16px system-ui'; ctx.fillStyle = GOLD;
    ctx.fillText(`★ METEOR STORM · ${st.hits} rocks · ${Math.ceil(s.bonusLeft)}s`, W / 2, 24);
    this.drawBand(ctx);
  }
}

function hex(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
}

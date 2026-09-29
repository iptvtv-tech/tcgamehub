// ─────────────────────────────────────────────────────────────
//  HEIST PLANNER — game 12 (Zone 2 · Extreme · LEGENDS game)
//  Plan every step of your crew's moves, then press GO and watch it play out.
//  Guards patrol, cameras sweep and lasers blink on fixed timetables, so a
//  perfect plan always works. One of the crew gets seen = the alarm goes off
//  and you lose a life (your plan is kept so you can fix it).
//
//  🕵️ Thief   grabs the loot ($) and gems (*)
//  💻 Hacker  standing on a terminal (C) switches off every camera and laser
//  💪 Muscle  smashes locked doors (D) — then anyone can use them
//  Everyone has to finish on a getaway van (E).
//
//  15 jobs. Finish all of them without losing a single life, starting from
//  job 1, and a secret 16th job opens… it wins the Zone 2 crown.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import { LEVELS, levelDef } from './levels.js';
import { COLS, ROWS, CREW, MOVES, parseLevel, simulate, trace, tileAt, watcherAt, vision, laserOn } from './sim.js';

const ID = 'heist-planner';
const W = 480, H = 720;
const TS = 36, BX = (W - COLS * TS) / 2, BY = 52;
const cx = (x) => BX + (x + 0.5) * TS, cy = (y) => BY + (y + 0.5) * TS;
const STEP_TIME = 0.26;
const MAX_PLAN = 99;
const ENGRAVING = 'TC LEGENDS';

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  finalLevel: 15,
  secretLevel: 16,
  bonusLevels: [5, 10],
  bonusTime: 15,
  comboWindow: 0,
  comboStep: 2,
  maxMultiplier: 4,
  music: { bpm: 96, style: 'minor', lead: 'triangle', arp: [0, 2, 1, 2, 0, 3, 1, 2], oct: [12, 12, 12, 12, 12, 12, 12, 12] },
  winTitle: 'The crew got away!',
  titleHint: 'Legends say a flawless crew finds a door no one else has seen…',
  sealedHint: 'One last door stays sealed… perhaps for a crew that never gets caught?',
  sealedHintCheckpoint: 'Legends say that door only opens for crews that start from the very first job…',
  secretTitle: '★ THE ROYAL TREASURY ★',
  legendBadge: 'crown',
  legendRevealDelay: 7.5,
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 150),
  levelInfo(level, bonus) {
    const d = levelDef(level);
    return bonus ? d.tip : `${d.name} — ${d.tip}`;
  },
  create: (shell) => new HeistPlanner(shell),
});

class HeistPlanner {
  constructor(s) {
    this.s = s; this.t = 0;
    this.buttons = [];
    addEventListener('keydown', (e) => this.onKey(e), { capture: true });
    this.startLevel(1, false);
  }

  reset() { this.cleanJobs = 0; }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus; this.secret = level === 16;
    this.def = levelDef(level);
    this.fails = 0;
    this.finale = null;
    if (bonus) { this.startSafe(); return; }
    this.L = parseLevel(this.def);
    this.plans = Object.fromEntries(this.L.crew.map((c) => [c.id, '']));
    this.sel = this.L.crew[0].id;
    this.phase = 'plan';
    this.view = 0; this.follow = true;
    this.run = null;
    this.retrace();
  }

  // ── Planning ───────────────────────────────────────────────
  retrace() {
    const T = Math.max(1, ...Object.values(this.plans).map((p) => p.length)) + 1;
    this.frames = trace(this.L, this.plans, T + 30);
    this.maxT = T;
    if (this.follow) this.view = this.plans[this.sel].length;
    this.view = clamp(this.view, 0, this.frames.length - 1);
  }

  endPos(id) {
    const f = this.frames[this.plans[id].length];
    return f.crew.find((c) => c.id === id);
  }

  addMove(k) {
    if (this.phase !== 'plan') return;
    const p = this.plans[this.sel];
    if (p.length >= MAX_PLAN) return;
    if (k !== 'W') {
      const at = this.endPos(this.sel), [dx, dy] = MOVES[k];
      const ch = tileAt(this.L, at.x + dx, at.y + dy);
      // walls and exhibits can't be planned through; doors only by the muscle (or once smashed)
      const f = this.frames[p.length];
      const ok = ch !== '#' && ch !== 'P' && !this.L.blocked.has(`${at.x + dx},${at.y + dy}`) && (ch !== 'D' || this.sel === 'M' || f.open.has(`${at.x + dx},${at.y + dy}`));
      if (!ok) { this.s.sound.tone({ freq: 140, dur: 0.06, type: 'square', vol: 0.05 }); return; }
    }
    this.plans[this.sel] = p + k;
    this.follow = true;
    this.retrace();
    this.s.sound.tone({ freq: k === 'W' ? 520 : 700, dur: 0.04, type: 'triangle', vol: 0.05 });
  }
  undo() {
    if (this.phase !== 'plan') return;
    this.plans[this.sel] = this.plans[this.sel].slice(0, -1);
    this.follow = true; this.retrace();
    this.s.sound.tone({ freq: 400, dur: 0.04, type: 'triangle', vol: 0.04 });
  }
  clear() { if (this.phase !== 'plan') return; this.plans[this.sel] = ''; this.follow = true; this.retrace(); }
  select(id) { if (this.plans[id] === undefined) return; this.sel = id; this.follow = true; this.retrace(); this.s.sound.play('coin'); }
  cycle() { const ids = this.L.crew.map((c) => c.id); this.select(ids[(ids.indexOf(this.sel) + 1) % ids.length]); }
  scrub(d) { this.follow = false; this.view = clamp(this.view + d, 0, this.maxT + 20); }

  go() {
    if (this.phase !== 'plan') return;
    const res = simulate(this.L, this.plans);
    this.run = { res, i: 0, acc: 0, t: 0 };
    this.phase = 'run';
    this.s.sound.play('go');
  }

  // ── Input ──────────────────────────────────────────────────
  onKey(e) {
    if (this.s.state !== 'playing' || e.target instanceof HTMLInputElement) return;
    if (this.bonus) return;
    const k = e.code;
    const handled = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (k === 'Enter' || k === 'KeyG') { handled(); this.go(); }
    else if (k === 'Backspace' || k === 'KeyZ') { handled(); this.undo(); }
    else if (k === 'Tab') { handled(); this.cycle(); }
    else if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') { handled(); const c = this.L.crew[+k.slice(-1) - 1]; if (c) this.select(c.id); }
    else if (k === 'Comma' || k === 'BracketLeft') { handled(); this.scrub(-1); }
    else if (k === 'Period' || k === 'BracketRight') { handled(); this.scrub(1); }
    else if (k === 'KeyX') { handled(); this.clear(); }
  }

  onAction(a, x, y) {
    if (this.bonus) { if (a === 'action' || a === 'press') this.safeTry(); return; }
    if (this.phase === 'run' && (a === 'action' || a === 'tap')) { this.fast = true; return; }
    const map = { up: 'U', down: 'D', left: 'L', right: 'R' };
    if (map[a]) { this.addMove(map[a]); return; }
    if (a === 'action') { this.addMove('W'); return; }
    if (a === 'tap') this.tapAt(x, y);
  }

  tapAt(x, y) {
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
    if (this.phase !== 'plan') return;
    const gx = Math.floor((x - BX) / TS), gy = Math.floor((y - BY) / TS);
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;
    // tap a crew member (where they'd be at the current step) to select them
    const f = this.frames[this.view];
    const who = f.crew.find((c) => c.x === gx && c.y === gy && c.id !== this.sel);
    if (who) { this.select(who.id); return; }
    const at = this.endPos(this.sel);
    const dx = gx - at.x, dy = gy - at.y;
    if (dx === 0 && dy === 0) this.addMove('W');
    else if (Math.abs(dx) + Math.abs(dy) === 1) this.addMove(dx === 1 ? 'R' : dx === -1 ? 'L' : dy === 1 ? 'D' : 'U');
  }

  // ── Update ─────────────────────────────────────────────────
  idle(dt) { this.t += dt; if (this.finale) this.updateFinale(dt); }

  update(dt) {
    this.t += dt;
    if (this.bonus) { this.updateSafe(dt); return; }
    if (this.finale) { this.updateFinale(dt); return; }
    if (this.phase === 'alarm') {
      const a = this.alarm, s = this.s;
      a.t += dt;
      if (a.t > 1.6) {
        this.phase = 'plan'; this.alarm = null; this.follow = false;
        this.view = Math.max(0, a.res.steps - 1); this.retrace();
        if (!this.secret) s.hurt(); else s.fx.text(W / 2, H * 0.45, 'Try again…', { color: '#fde68a', size: 22 });
      }
      return;
    }
    if (this.phase !== 'run') return;
    const r = this.run, s = this.s;
    r.acc += dt * (this.fast ? 3 : 1);
    while (r.acc >= STEP_TIME && r.i < r.res.frames.length - 1) {
      r.acc -= STEP_TIME;
      r.i++;
      const fr = r.res.frames[r.i];
      this.view = r.i;
      s.sound.tone({ freq: 160 + (r.i % 2) * 40, dur: 0.03, type: 'triangle', vol: 0.03 });
      for (const ev of fr.events) this.event(ev);
    }
    if (r.i >= r.res.frames.length - 1) {
      r.t += dt;
      if (r.t > 0.5 && !r.done) { r.done = true; this.finish(r.res); }
    }
  }

  event(ev) {
    const s = this.s;
    if (ev.type === 'loot') { s.sound.play('coin'); s.fx.text(cx(ev.x), cy(ev.y) - 18, 'LOOT!', { color: '#fde047', size: 18 }); s.fx.burst(cx(ev.x), cy(ev.y), { colors: ['#fde047', '#fff'], count: 16, speed: 140 }); }
    if (ev.type === 'gem') { s.sound.play('gem'); s.fx.burst(cx(ev.x), cy(ev.y), { colors: ['#a78bfa', '#fff'], count: 16, speed: 140 }); }
    if (ev.type === 'smash') { s.sound.noise({ dur: 0.3, vol: 0.25, freq: 700, to: 80 }); s.fx.shake(6, 0.25); s.fx.burst(cx(ev.x), cy(ev.y), { colors: ['#a16207', '#fde68a'], count: 20, speed: 180 }); }
    if (ev.type === 'prize') { this.startFinale(); }
  }

  finish(res) {
    const s = this.s, L = this.level;
    this.fast = false;
    if (this.finale) return;
    if (!res.ok) {
      const f = res.fail;
      const why = { guard: 'SPOTTED BY A GUARD!', camera: 'CAUGHT ON CAMERA!', laser: 'TRIPPED A LASER!', noloot: 'You forgot the loot!', left: `${CREW[f.who].name} missed the van!`, noprize: 'The prize is still there…' }[f.why] || 'ALARM!';
      s.fx.flash('#ef4444', 0.3);
      s.sound.play('boom');
      s.fx.text(W / 2, BY + ROWS * TS / 2, why, { color: '#fb7185', size: 24, life: 1.6 });
      this.alarm = { t: 0, who: f.who, step: f.step, res };
      this.fails++;
      this.phase = 'alarm';
      return;
    }
    // success!
    s.sound.play('levelup');
    s.award(500 * L, W / 2, BY + 120, { chain: true, color: '#fde047', size: 26 });
    if (res.gems) { s.award(300 * L * res.gems, W / 2, BY + 160, { color: '#a78bfa', size: 20 }); s.unlock('gems'); }
    const par = this.def.par || 99;
    if (res.steps <= par) { s.award((par - res.steps + 5) * 20 * L, W / 2, BY + 200, { color: '#4ade80', size: 20 }); s.fx.text(W / 2, BY + 230, `Under par! ${res.steps} / ${par} steps`, { color: '#4ade80', size: 18 }); }
    if (this.fails === 0) { s.award(300 * L, W / 2, BY + 260, { color: '#22d3ee', size: 18 }); s.fx.text(W / 2, BY + 290, 'FIRST-TIME PLAN!', { color: '#22d3ee', size: 20 }); s.unlock('firsttry'); }
    else s.resetCombo();
    if (this.L.crew.length === 3) s.unlock('fullcrew');
    if (L === 15) s.unlock('escape');
    s.completeLevel();
  }

  onLifeLost() { this.phase = 'plan'; this.alarm = null; }

  // ── Bonus: Safe Cracker ────────────────────────────────────
  startSafe() {
    this.safe = { ang: 0, speed: 2.6 + this.level * 0.08, target: this.s.rng.range(0, Math.PI * 2), width: 0.42, tumbler: 0, cracked: 0, flash: 0, miss: 0 };
  }
  updateSafe(dt) { const sf = this.safe; sf.ang += dt * sf.speed; sf.flash = Math.max(0, sf.flash - dt * 3); sf.miss = Math.max(0, sf.miss - dt * 3); }
  safeTry() {
    const s = this.s, sf = this.safe;
    let d = ((sf.ang - sf.target) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    if (Math.abs(d) < sf.width / 2) {
      sf.tumbler++; sf.flash = 1;
      s.sound.tone({ freq: 1200, dur: 0.05, type: 'square', vol: 0.08 });
      s.award(40 * this.level, W / 2, 260, { chain: true, color: '#fde047', size: 18 });
      sf.target = s.rng.range(0, Math.PI * 2); sf.speed = -sf.speed * 1.04;
      if (sf.tumbler >= 3) {
        sf.cracked++; sf.tumbler = 0; sf.width = Math.max(0.22, sf.width * 0.92);
        s.sound.play('golden'); s.award(200 * this.level, W / 2, 220, { color: '#4ade80', size: 24 });
        s.fx.text(W / 2, 200, 'SAFE CRACKED!', { color: '#4ade80', size: 28 });
        if (sf.cracked >= 4) s.unlock('safecracker');
      }
    } else {
      sf.miss = 1; sf.tumbler = 0; s.resetCombo();
      s.sound.tone({ freq: 160, to: 90, dur: 0.12, type: 'sawtooth', vol: 0.06 });
    }
  }

  // ── The finale (secret level) ─────────────────────────────
  startFinale() {
    const s = this.s;
    this.finale = { t: 0, note: 0, nextNote: 1.2, sparkT: 0 };
    s.sound.noise({ dur: 0.6, vol: 0.35, freq: 6000, type: 'highpass' });
    s.sound.play('powerup');
    s.legendFound();
  }
  updateFinale(dt) {
    const f = this.finale, s = this.s;
    f.t += dt;
    const tune = [72, 76, 79, 84, 79, 76, 77, 81, 84, 88, 84, 81, 79, 83, 86, 91];
    f.nextNote -= dt;
    if (f.nextNote <= 0) {
      const n = tune[f.note % tune.length];
      s.sound.tone({ freq: s.sound.note(n), dur: 1.0, type: 'sine', vol: 0.12 });
      s.sound.tone({ freq: s.sound.note(n - 12), dur: 0.6, type: 'triangle', vol: 0.04 });
      f.note++;
      f.nextNote = f.note % 4 === 3 ? 0.7 : 0.36;
    }
    f.sparkT -= dt;
    if (f.t > 2 && f.sparkT <= 0) {
      f.sparkT = 0.1;
      const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 50;
      s.fx.burst(W / 2 + Math.cos(a) * r, H * 0.3 + Math.sin(a) * r, { colors: ['#fde68a', '#fff'], count: 2, speed: 30, life: 0.8, size: 3 });
    }
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t;
    ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, W, H);
    this.buttons = [];
    if (this.bonus) { this.drawSafe(ctx, t); return; }
    const L = this.L;
    const running = this.phase === 'run' || this.phase === 'alarm';
    const fr = running ? this.run.res.frames[Math.min(this.view, this.run.res.frames.length - 1)] : this.frames[Math.min(this.view, this.frames.length - 1)];
    const step = running ? this.view : this.view;

    // board
    const secret = this.secret;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = tileAt(L, x, y), px = BX + x * TS, py = BY + y * TS;
      if (ch === '#') { ctx.fillStyle = secret ? '#3b2a06' : '#1e293b'; ctx.fillRect(px, py, TS, TS); ctx.fillStyle = secret ? '#a16207' : '#334155'; ctx.fillRect(px, py, TS, 5); continue; }
      ctx.fillStyle = (x + y) % 2 ? (secret ? '#1c1405' : '#0f172a') : (secret ? '#241a07' : '#111c33');
      ctx.fillRect(px, py, TS, TS);
      if (ch === 'E') { ctx.fillStyle = '#166534'; roundRect(ctx, px + 3, py + 7, TS - 6, TS - 14, 6); ctx.fill(); ctx.fillStyle = '#bbf7d0'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('VAN', px + TS / 2, py + TS / 2 + 4); }
      if (ch === 'C') { ctx.fillStyle = '#0e7490'; roundRect(ctx, px + 6, py + 6, TS - 12, TS - 14, 3); ctx.fill(); ctx.fillStyle = fr.hacked ? '#67e8f9' : '#164e63'; ctx.fillRect(px + 9, py + 9, TS - 18, TS - 20); ctx.fillStyle = '#94a3b8'; ctx.fillRect(px + 12, py + TS - 8, TS - 24, 3); }
      if (ch === 'D') {
        const open = fr.open.has(`${x},${y}`);
        ctx.fillStyle = open ? 'rgba(161,98,7,.25)' : '#a16207'; ctx.fillRect(px + 2, py + 2, TS - 4, TS - 4);
        if (!open) { ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.strokeRect(px + 5, py + 5, TS - 10, TS - 10); ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2, 3, 0, 7); ctx.fill(); }
      }
      if (ch === 'H') { ctx.fillStyle = '#166534'; ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2, 13, 0, 7); ctx.fill(); ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(px + TS / 2 - 4, py + TS / 2 - 4, 7, 0, 7); ctx.arc(px + TS / 2 + 5, py + TS / 2 - 2, 6, 0, 7); ctx.fill(); }
      if (ch === 'P') { ctx.fillStyle = '#475569'; roundRect(ctx, px + 4, py + 4, TS - 8, TS - 8, 4); ctx.fill(); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(px + 10, py + 10, TS - 20, TS - 20); }
      if (ch === 'V') this.drawCase(ctx, px + TS / 2, py + TS / 2, t);
    }
    // loot & gems (still there in this frame)
    const lootLeft = running ? fr.loot : new Set(L.loot.map(([x, y]) => `${x},${y}`));
    const gemsLeft = running ? fr.gems : new Set(L.gems.map(([x, y]) => `${x},${y}`));
    for (const k of lootLeft) { const [x, y] = k.split(',').map(Number); this.drawBag(ctx, cx(x), cy(y), t); }
    for (const k of gemsLeft) { const [x, y] = k.split(',').map(Number); ctx.fillStyle = '#a78bfa'; ctx.save(); ctx.translate(cx(x), cy(y)); ctx.rotate(Math.PI / 4); ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10; ctx.fillRect(-6, -6, 12, 12); ctx.restore(); }

    // lasers
    for (const l of L.lasers) {
      const on = !fr.hacked && laserOn(l, step);
      for (const k of l.set) {
        const [x, y] = k.split(',').map(Number);
        const horiz = tileAt(L, x - 1, y) === '=' || tileAt(L, x + 1, y) === '=' || (tileAt(L, x, y - 1) === '#' && tileAt(L, x, y + 1) === '#');
        ctx.strokeStyle = on ? `rgba(248,113,113,${0.7 + 0.3 * Math.sin(t * 20)})` : 'rgba(248,113,113,.15)';
        ctx.lineWidth = on ? 3 : 1;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(BX + x * TS, cy(y)); ctx.lineTo(BX + (x + 1) * TS, cy(y)); } else { ctx.moveTo(cx(x), BY + y * TS); ctx.lineTo(cx(x), BY + (y + 1) * TS); }
        ctx.stroke();
      }
    }

    // vision cones + guards + cameras at this step
    for (const w of L.watchers) {
      const st = watcherAt(w, step);
      const off = w.type === 'camera' && fr.hacked;
      if (!off) {
        ctx.fillStyle = w.type === 'camera' ? 'rgba(250,204,21,.18)' : 'rgba(239,68,68,.2)';
        for (const [vx, vy] of vision(L, w, st, fr.open)) ctx.fillRect(BX + vx * TS + 1, BY + vy * TS + 1, TS - 2, TS - 2);
      }
      if (w.type === 'camera') {
        ctx.save(); ctx.translate(cx(st.x), cy(st.y));
        ctx.rotate({ up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[st.dir]);
        ctx.fillStyle = off ? '#475569' : '#facc15'; roundRect(ctx, -10, -7, 20, 14, 3); ctx.fill();
        ctx.fillStyle = off ? '#1e293b' : '#ef4444'; ctx.beginPath(); ctx.arc(8, 0, 4, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        const alarmHere = this.alarm && this.phase === 'alarm';
        ctx.fillStyle = alarmHere ? '#f87171' : '#dc2626';
        ctx.beginPath(); ctx.arc(cx(st.x), cy(st.y), 12, 0, 7); ctx.fill();
        ctx.fillStyle = '#1e3a8a'; ctx.fillRect(cx(st.x) - 9, cy(st.y) - 13, 18, 6);
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[st.dir];
        ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(cx(st.x) + dx * 8, cy(st.y) + dy * 8, 3.5, 0, 7); ctx.fill();
      }
    }

    // planned paths (planning only)
    if (!running) {
      for (const c of L.crew) {
        const col = CREW[c.id].color, plan = this.plans[c.id];
        if (!plan.length) continue;
        ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = c.id === this.sel ? 0.9 : 0.4; ctx.lineWidth = c.id === this.sel ? 3 : 2; ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for (let k = 0; k <= plan.length; k++) { const p = this.frames[k].crew.find((q) => q.id === c.id); const ox = ('TKM'.indexOf(c.id) - 1) * 3; if (k) ctx.lineTo(cx(p.x) + ox, cy(p.y) + ox); else ctx.moveTo(cx(p.x) + ox, cy(p.y) + ox); }
        ctx.stroke(); ctx.restore();
      }
    }

    // crew (where they are at this step)
    for (const c of fr.crew) {
      const info = CREW[c.id];
      const caught = this.alarm && this.alarm.who === c.id;
      const mine = !running && c.id === this.sel;
      ctx.save(); ctx.translate(cx(c.x), cy(c.y));
      if (mine) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(t * 6) * 1.5, 0, 7); ctx.stroke(); }
      ctx.fillStyle = caught ? (Math.floor(t * 8) % 2 ? '#ef4444' : '#fff') : (s.gold && c.id === 'T' ? '#fbbf24' : info.color);
      ctx.shadowColor = info.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(info.icon, 0, 1);
      ctx.restore();
    }
    // "where will they be" helper: ghost of the selected member's end position
    if (!running) {
      const e = this.endPos(this.sel);
      ctx.strokeStyle = CREW[this.sel].color; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.strokeRect(BX + e.x * TS + 3, BY + e.y * TS + 3, TS - 6, TS - 6); ctx.setLineDash([]);
    }

    // HUD
    ctx.fillStyle = 'rgba(3,5,20,.8)'; ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = secret ? '#fde68a' : '#e2e8f0'; ctx.font = '800 16px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`Job ${this.level}: ${this.def.name}`, 12, 20);
    ctx.font = '600 12px system-ui'; ctx.fillStyle = '#94a3b8';
    ctx.fillText(running ? `Step ${this.view}${this.fast ? ' · ⏩' : ''}` : `Par ${this.def.par} steps · attempts failed: ${this.fails}`, 12, 37);
    if (fr.hacked) { ctx.textAlign = 'right'; ctx.fillStyle = '#67e8f9'; ctx.fillText('💻 SYSTEMS HACKED', W - 12, 37); }

    this.drawPanel(ctx, running);
    if (this.finale) this.drawFinale(ctx, t);
  }

  drawPanel(ctx, running) {
    const L = this.L, top = BY + ROWS * TS + 10;
    const btn = (x, y, w, h, label, fn, { on = false, color = '#334155', text = '#fff', disabled = false } = {}) => {
      ctx.fillStyle = disabled ? '#1e293b' : on ? color : '#1e293b';
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = disabled ? '#475569' : text; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
      if (!disabled) this.buttons.push({ x, y, w, h, fn });
    };
    if (running) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(this.phase === 'alarm' ? '🚨 ALARM! Back to the drawing board…' : 'The plan is under way… (tap to fast-forward)', W / 2, top + 40);
      progressBar(ctx, 40, top + 60, W - 80, 14, this.view / Math.max(1, this.run.res.frames.length - 1), '#fbbf24', '');
      return;
    }
    // crew tabs
    const n = L.crew.length, tw = (W - 24 - (n - 1) * 8) / n;
    L.crew.forEach((c, i) => {
      const info = CREW[c.id];
      btn(12 + i * (tw + 8), top, tw, 38, `${i + 1} ${info.icon} ${info.name} · ${this.plans[c.id].length}`, () => this.select(c.id), { on: this.sel === c.id, color: info.color, text: this.sel === c.id ? '#0b0b1a' : '#fff' });
    });
    // timeline
    const ty = top + 48;
    btn(12, ty, 40, 30, '◀', () => this.scrub(-1));
    btn(W - 52, ty, 40, 30, '▶', () => this.scrub(1));
    const tot = Math.max(1, this.maxT);
    progressBar(ctx, 60, ty + 8, W - 120, 14, Math.min(1, this.view / tot), '#a78bfa', `Showing step ${this.view} of ${tot - 1}${this.follow ? '' : ' (scrubbing)'}`);
    // actions
    const ay = ty + 40, bw = (W - 24 - 3 * 8) / 4;
    btn(12, ay, bw, 44, '⏸ WAIT', () => this.addMove('W'), { color: '#64748b' });
    btn(12 + (bw + 8), ay, bw, 44, '↶ UNDO', () => this.undo(), { color: '#64748b' });
    btn(12 + 2 * (bw + 8), ay, bw, 44, '✖ CLEAR', () => this.clear(), { color: '#64748b' });
    btn(12 + 3 * (bw + 8), ay, bw, 44, '▶ GO!', () => this.go(), { on: true, color: '#22c55e', text: '#052e16' });
    ctx.fillStyle = '#64748b'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Tap next to a crew member (or swipe) to plan a step'
      : 'Arrows plan · Space wait · Z undo · Tab switch crew · Enter GO', W / 2, ay + 62);
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Tap a crew member to switch · ◀ ▶ to see the guards at any step'
      : '◀ ▶ (or , .) shows where the guards will be at any step', W / 2, ay + 78);
  }

  drawBag(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 1.5);
    ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(0, 3, 11, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ca8a04'; ctx.fillRect(-5, -9, 10, 5);
    ctx.fillStyle = '#fde047'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 8);
    ctx.restore();
  }

  drawCase(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(186,230,253,.18)'; ctx.strokeStyle = 'rgba(186,230,253,.7)'; ctx.lineWidth = 2;
    roundRect(ctx, -15, -15, 30, 30, 4); ctx.fill(); ctx.stroke();
    ctx.shadowColor = '#fde047'; ctx.shadowBlur = 12 + Math.sin(t * 3) * 6;
    drawCrown(ctx, 0, 2, 11, t);
    ctx.restore();
  }

  drawSafe(ctx, t) {
    const s = this.s, sf = this.safe;
    const g = ctx.createRadialGradient(W / 2, 360, 20, W / 2, 360, 400);
    g.addColorStop(0, '#1f2937'); g.addColorStop(1, '#030712');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(3,5,20,.8)'; ctx.fillRect(0, 0, W, 44);
    progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ SAFE CRACKER · ${sf.cracked} safes · ${Math.ceil(s.bonusLeft)}s`);
    // safe door
    ctx.fillStyle = '#374151'; roundRect(ctx, 60, 150, 360, 380, 24); ctx.fill();
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 6; roundRect(ctx, 76, 166, 328, 348, 18); ctx.stroke();
    const X = W / 2, Y = 340, R = 110;
    ctx.fillStyle = sf.miss ? '#7f1d1d' : '#111827'; ctx.beginPath(); ctx.arc(X, Y, R + 14, 0, 7); ctx.fill();
    // green notch
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(X, Y, R, sf.target - sf.width / 2, sf.target + sf.width / 2); ctx.stroke();
    // ticks
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = i % 5 ? 1 : 3; ctx.beginPath(); ctx.moveTo(X + Math.cos(a) * (R - 18), Y + Math.sin(a) * (R - 18)); ctx.lineTo(X + Math.cos(a) * (R - 6), Y + Math.sin(a) * (R - 6)); ctx.stroke(); }
    // needle
    ctx.strokeStyle = s.gold ? '#fbbf24' : '#f8fafc'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(sf.ang) * (R + 4), Y + Math.sin(sf.ang) * (R + 4)); ctx.stroke();
    ctx.fillStyle = '#d1d5db'; ctx.beginPath(); ctx.arc(X, Y, 22, 0, 7); ctx.fill();
    // tumblers
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < sf.tumbler ? '#22c55e' : '#1f2937'; ctx.beginPath(); ctx.arc(X - 40 + i * 40, 490, 12, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#e5e7eb'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Tap / SPACE when the needle is in the green!', W / 2, 580);
  }

  drawFinale(ctx, t) {
    const f = this.finale;
    const k = clamp(f.t / 2.5, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.7 * k})`; ctx.fillRect(0, 0, W, H);
    const up = clamp((f.t - 7.2) / 1.2, 0, 1);
    const y = H * 0.36 - up * 110;
    ctx.save(); ctx.globalAlpha = k;
    const glow = ctx.createRadialGradient(W / 2, y, 10, W / 2, y, 200);
    glow.addColorStop(0, 'rgba(253,224,71,.45)'); glow.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, y - 200, W, 400);
    drawCrown(ctx, W / 2, y, 70 + k * 20, t, true);
    ctx.fillStyle = '#fde68a'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center';
    if (up < 1) ctx.fillText('THE GOLDEN CROWN', W / 2, y + 120);
    ctx.restore();
  }
}

/** A golden crown with the engraving travelling around its band. */
function drawCrown(ctx, x, y, r, t, engraved = false) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#fef3c7'); g.addColorStop(0.4, '#fbbf24'); g.addColorStop(1, '#b45309');
  ctx.fillStyle = g;
  // points
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.35);
  ctx.lineTo(-r, -r * 0.35); ctx.lineTo(-r * 0.55, r * 0.02); ctx.lineTo(0, -r * 0.7); ctx.lineTo(r * 0.55, r * 0.02); ctx.lineTo(r, -r * 0.35);
  ctx.lineTo(r, r * 0.35); ctx.closePath(); ctx.fill();
  // jewels on the points
  for (const [px, py, c] of [[-r, -r * 0.35, '#f472b6'], [0, -r * 0.7, '#22d3ee'], [r, -r * 0.35, '#a3e635']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, r * 0.11, 0, 7); ctx.fill(); }
  // band
  const bh = r * 0.34;
  const bg = ctx.createLinearGradient(0, r * 0.2, 0, r * 0.2 + bh);
  bg.addColorStop(0, '#fcd34d'); bg.addColorStop(1, '#92400e');
  ctx.fillStyle = bg; ctx.fillRect(-r, r * 0.2, r * 2, bh);
  if (engraved) {
    // the engraving scrolls round the band, like it's spinning
    ctx.save(); ctx.beginPath(); ctx.rect(-r, r * 0.2, r * 2, bh); ctx.clip();
    ctx.font = `900 ${Math.round(bh * 0.72)}px system-ui`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#78350f';
    const txt = `${ENGRAVING} ✦ `, tw = ctx.measureText(txt).width;
    const off = (t * 40) % tw;
    for (let xx = -r - off; xx < r; xx += tw) {
      ctx.fillText(txt, xx, r * 0.2 + bh / 2 + 1);
    }
    // shading so the band looks round
    const sh = ctx.createLinearGradient(-r, 0, r, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = sh; ctx.fillRect(-r, r * 0.2, r * 2, bh);
    ctx.restore();
  }
  ctx.restore();
}

void LEVELS;

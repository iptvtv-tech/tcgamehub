// ─────────────────────────────────────────────────────────────
//  NEON BEAT — game 8 (Zone 2 · Expert)
//  A 4-lane rhythm game. Notes fall to the line; hit them on the beat.
//  Every note you hit plays its part of the tune — miss it and the melody drops out.
//
//  Keys: ← ↓ ↑ →  (or A S W D)   ·  Touch/click: tap the lane
//  L1 learn the beat · L3 chords (two at once) · L4 hold notes · L6 faster scroll
//  L8 16th-note runs · L12 STEALTH: notes vanish just before the line
//  Misses drain your energy — empty = lose a life (the song restarts).
//  Every 5th level: ★ FEVER bonus — 15 s of golden notes, no energy loss.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'neon-beat';
const W = 480, H = 720;
const LANES = 4, LW = 92, LX = (W - LANES * LW) / 2, HIT_Y = 610, TOP = 50;
const DIRS = ['left', 'down', 'up', 'right'];
const LANE_COL = ['#f472b6', '#22d3ee', '#a3e635', '#fbbf24'];
const WIN = { perfect: 0.045, great: 0.09, good: 0.135 };
const JUDGE = {
  perfect: { label: 'PERFECT', color: '#fde047', mult: 1, hp: 3 },
  great:   { label: 'GREAT',   color: '#4ade80', mult: 0.7, hp: 2 },
  good:    { label: 'GOOD',    color: '#60a5fa', mult: 0.4, hp: 1 },
};
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G

// Rhythm cells for one beat (four 16ths). [pattern, first level it can appear]
const CELLS = [['1000', 1], ['1010', 1], ['1000', 1], ['0000', 1], ['0010', 2], ['1001', 2], ['1011', 3],
  ['1101', 3], ['0101', 6], ['1110', 5], ['0111', 6], ['1111', 8], ['1011', 8]];

const bpmFor = (level) => Math.min(150, 75 + (level - 1) * 4);   // 75 BPM at level 1, +4 a level

runGame({
  id: ID,
  width: W,
  height: H,
  lives: 3,
  comboWindow: 0,            // rhythm combos only break on a miss
  comboStep: 10,
  maxMultiplier: 4,
  bonusTime: 15,
  music: false,              // the game plays its own song, in time with the notes
  levelInfo(level, bonus) {
    if (bonus) return '★ FEVER! 15 seconds of golden notes — no energy loss, mash away. Hit everything!';
    const notes = {
      1: 'Hit ← ↓ ↑ → (or A S W D, or tap the lanes) as notes cross the line. Misses drain your energy — and so does pressing when there\'s no note, so no button-mashing!',
      2: 'Off-beats join in. Listen to the music and feel it.',
      3: 'CHORDS: two notes at once — press both keys together.',
      4: 'HOLD notes: keep the key down until the tail ends.',
      6: 'Faster scroll and syncopation. Stay on the beat!',
      8: '16th-note runs. Fingers ready…',
      12: '👻 STEALTH: notes fade out just before the line. Trust the rhythm!',
    };
    return notes[level] || `${bpmFor(level)} BPM — faster and busier!`;
  },
  create: (shell) => new NeonBeat(shell),
});

class NeonBeat {
  constructor(s) {
    this.s = s; this.t = 0;
    this.flash = [0, 0, 0, 0];
    this.pointerLane = -1;
    this.pulse = 0;
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() }));
    this.startLevel(1, false);
  }

  reset() { this.bestStreak = 0; }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.bpm = bpmFor(level);
    this.beat = 60 / this.bpm;
    this.speed = Math.min(680, 340 * this.s.speed(0.03));        // pixels per second
    // timing windows: generous while you learn, tighter later
    this.win = level <= 4 ? { perfect: 0.055, great: 0.11, good: 0.165 } : level <= 9 ? { perfect: 0.05, great: 0.1, good: 0.15 } : WIN;
    this.stealth = level >= 12 && !bonus;
    this.chart = this.makeChart();
    this.startSong();
  }

  startSong() {
    this.songT = -0.3;
    this.nextBeat = 0;
    this.notes = this.chart.map((n) => ({ ...n, state: 'live' }));
    this.hp = 100;
    this.stats = { perfect: 0, great: 0, good: 0, miss: 0, stray: 0 };
    this.bad = [0, 0, 0, 0];
    this.feverHits = 0; this.holdsDone = 0;
    this.judge = null;
    this.endT = this.notes.length ? this.notes[this.notes.length - 1].t + (this.notes[this.notes.length - 1].hold || 0) + 1.2 : 4;
  }

  // ── Chart generator (seeded, so the Daily Challenge is the same for everyone) ──
  makeChart() {
    const r = this.s.rng, L = this.level, beat = this.beat;
    const lead = 4 * beat;                                   // one bar count-in
    const beats = this.bonus ? Math.ceil(16 / beat) : (12 + Math.min(4, Math.floor(L / 3))) * 4;
    const pool = this.bonus ? ['1010', '1111', '1011', '1110'] : CELLS.filter(([, lv]) => lv <= L).map(([p]) => p);
    const busy = [0, 0, 0, 0];                               // hold notes block their lane until this time
    const lastT = [-9, -9, -9, -9];
    const notes = [];
    let last = -1;
    const pickLane = (time, avoid = -1) => {
      const minGap = L >= 8 ? beat / 4 : beat / 2 - 0.01;
      let opts = [0, 1, 2, 3].filter((l) => l !== avoid && busy[l] <= time && time - lastT[l] >= minGap);
      if (opts.length > 1) opts = opts.filter((l) => l !== last || r.chance(0.25));
      return opts.length ? r.pick(opts) : -1;
    };
    for (let b = 0; b < beats; b++) {
      const cell = r.pick(pool);
      for (let j = 0; j < 4; j++) {
        if (cell[j] !== '1') continue;
        const time = lead + (b + j / 4) * beat;
        const lane = pickLane(time);
        if (lane < 0) continue;
        const bar = Math.floor(b / 4);
        let hold = 0;
        if (!this.bonus && L >= 4 && j === 0 && r.chance(Math.min(0.2, 0.08 + (L - 4) * 0.015))) hold = beat * r.pick([1, 1.5, 2]);
        notes.push({ lane, t: time, hold, bar });
        lastT[lane] = time + hold; busy[lane] = time + hold + beat / 4; last = lane;
        // chords
        if (!this.bonus && L >= 3 && j === 0 && !hold && r.chance(Math.min(0.35, 0.12 + (L - 3) * 0.025))) {
          const l2 = pickLane(time, lane);
          if (l2 >= 0) { notes.push({ lane: l2, t: time, hold: 0, bar, chord: true }); lastT[l2] = time; }
        }
      }
    }
    return notes.sort((a, b) => a.t - b.t);
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x) {
    const i = DIRS.indexOf(a);
    if (i >= 0) { this.press(i); return; }
    if (a === 'press' && x !== undefined) {
      const lane = Math.floor((x - LX) / LW);
      if (lane >= 0 && lane < LANES) { this.pointerLane = lane; this.press(lane); }
    }
    if (a === 'release') this.pointerLane = -1;
  }

  laneHeld(lane) { return this.s.input.isDown(DIRS[lane]) || (this.s.input.pointer.down && this.pointerLane === lane); }

  press(lane) {
    this.flash[lane] = 1;
    const t = this.songT;
    let best = null;
    for (const n of this.notes) {
      if (n.lane !== lane || n.state !== 'live') continue;
      const d = Math.abs(n.t - t);
      if (d <= this.win.good && (!best || d < Math.abs(best.t - t))) best = n;
      if (n.t - t > this.win.good) break;
    }
    if (!best) { this.stray(lane); return; }
    const d = Math.abs(best.t - t);
    const j = d <= this.win.perfect ? 'perfect' : d <= this.win.great ? 'great' : 'good';
    this.hit(best, j, best.t - t);
  }

  hit(n, j, early) {
    const s = this.s, J = JUDGE[j], L = this.level;
    n.state = n.hold ? 'holding' : 'hit';
    this.stats[j]++;
    if (!this.bonus) this.hp = Math.min(100, this.hp + J.hp);
    else this.feverHits++;
    const x = LX + (n.lane + 0.5) * LW;
    const base = Math.round((10 + L * 2) * J.mult * (this.bonus ? 2 : 1));
    s.award(base, x, HIT_Y - 40, { chain: true, color: J.color, size: j === 'perfect' ? 18 : 15 });
    this.judge = { label: J.label, color: J.color, t: 0, early: j !== 'perfect' ? (early > 0 ? 'EARLY' : 'LATE') : '' };
    this.playNote(n);
    s.fx.burst(x, HIT_Y, { colors: [LANE_COL[n.lane], '#fff'], count: j === 'perfect' ? 16 : 8, speed: 200, life: 0.35 });
    if (j === 'perfect') s.fx.ring(x, HIT_Y, { color: J.color, radius: 38, life: 0.3, width: 2 });
    this.bestStreak = Math.max(this.bestStreak || 0, s.comboCount);
    if (s.comboCount >= 100) s.unlock('streak100');
    if (this.bonus && this.feverHits >= 60) s.unlock('fever');
  }

  /** A press with no note to hit. Button-mashing costs energy and your combo — except in FEVER, where anything goes. */
  stray(lane) {
    if (this.bonus || this.songT < 0) return;
    const s = this.s;
    this.stats.stray++;
    this.bad[lane] = 1;
    s.resetCombo();
    this.judge = { label: '✗ NO NOTE', color: '#fb7185', t: 0, early: '' };
    s.sound.tone({ freq: 180, to: 110, dur: 0.06, type: 'square', vol: 0.03 });
    this.hp -= Math.min(10, 4 + this.level * 0.3);
    if (this.hp <= 0) { this.hp = 0; s.sound.play('boom'); s.fx.shake(8, 0.3); s.hurt(); }
  }

  miss(n) {
    const s = this.s;
    n.state = 'miss';
    this.stats.miss++;
    s.resetCombo();
    this.judge = { label: 'MISS', color: '#f87171', t: 0, early: '' };
    s.sound.tone({ freq: 120, to: 70, dur: 0.12, type: 'sawtooth', vol: 0.05 });
    if (this.bonus) return false;
    this.hp -= Math.min(22, 12 + this.level * 0.6);
    if (this.hp <= 0) { this.hp = 0; s.sound.play('boom'); s.fx.shake(8, 0.3); s.hurt(); return true; }
    return false;
  }

  playNote(n) {
    const s = this.s, ch = PROG[n.bar % 4];
    const pitch = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24][n.lane];
    s.sound.tone({ freq: s.sound.note(pitch), dur: n.hold ? n.hold : 0.16, type: 'square', vol: 0.055 });
    s.sound.tone({ freq: s.sound.note(pitch + 12), dur: 0.08, type: 'triangle', vol: 0.03 });
  }

  // Backing track: kick, snare, hats and bass, locked to the chart's clock
  backing() {
    const s = this.s, beat = this.beat;
    while (this.songT >= this.nextBeat * beat) {
      const b = this.nextBeat++;
      if (this.songT - b * beat > 0.1) continue;             // skip if we fell behind (e.g. tab hidden)
      const bar = Math.floor((b - 4) / 4), inBar = ((b % 4) + 4) % 4;
      if (b < 4) { s.sound.tone({ freq: b === 3 ? 1320 : 880, dur: 0.05, type: 'square', vol: 0.06 }); continue; } // count-in
      if (this.songT > this.endT - 1) continue;
      s.sound.tone({ freq: 150, to: 45, dur: 0.14, type: 'sine', vol: 0.22 });                   // kick
      if (inBar === 1 || inBar === 3) s.sound.noise({ dur: 0.12, vol: 0.08, freq: 2500, to: 900 }); // snare
      s.sound.noise({ dur: 0.03, vol: 0.03, freq: 7000, type: 'highpass', delay: beat / 2 });             // off-beat hat
      const ch = PROG[Math.max(0, bar) % 4];
      s.sound.tone({ freq: s.sound.note(ch[0] - 12), dur: beat * 0.8, type: 'triangle', vol: 0.11 });
      this.pulse = 1;
    }
  }

  onLifeLost() { this.startSong(); }

  idle(dt) { this.t += dt; this.fade(dt); }

  fade(dt) {
    for (let i = 0; i < LANES; i++) { this.flash[i] = Math.max(0, this.flash[i] - dt * 5); this.bad[i] = Math.max(0, this.bad[i] - dt * 4); }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    if (this.judge) this.judge.t += dt;
  }

  // ── Update ─────────────────────────────────────────────────
  update(dt) {
    const s = this.s;
    this.t += dt; this.songT += dt;
    this.fade(dt);
    this.backing();

    for (const n of this.notes) {
      if (n.state === 'live' && this.songT - n.t > this.win.good) { if (this.miss(n)) return; }
      else if (n.state === 'holding') {
        const end = n.t + n.hold;
        if (this.songT >= end) {
          n.state = 'hit'; this.holdsDone++;
          s.award(Math.round((6 + this.level) * n.hold / this.beat), LX + (n.lane + 0.5) * LW, HIT_Y - 60, { chain: true, color: LANE_COL[n.lane], size: 14 });
        } else if (!this.laneHeld(n.lane)) {
          if (end - this.songT > 0.12) { if (this.miss(n)) return; }
          else n.state = 'hit';
        } else if (Math.random() < 0.5) {
          s.fx.burst(LX + (n.lane + 0.5) * LW, HIT_Y, { colors: [LANE_COL[n.lane]], count: 1, speed: 120, life: 0.3 });
        }
      }
    }

    if (!this.bonus && this.songT >= this.endT) this.finishSong();
    if (this.bonus && this.songT >= this.endT) { this.chart = this.makeChart(); this.startSong(); this.songT = 0.6; }
  }

  finishSong() {
    const s = this.s, st = this.stats, L = this.level;
    if (s.state !== 'playing') return;
    const total = st.perfect + st.great + st.good + st.miss;
    const acc = total ? (st.perfect + st.great * 0.7 + st.good * 0.4) / total : 0;
    s.award(Math.round(acc * 100) * L * 3, W / 2, H * 0.4, { color: '#a5f3fc', size: 22 });
    s.fx.text(W / 2, H * 0.34, `Accuracy ${Math.round(acc * 100)}%`, { color: '#a5f3fc', size: 26, life: 1.4, rise: 10 });
    if (st.miss === 0 && st.stray === 0 && L >= 2) {
      s.award(150 * L, W / 2, H * 0.48, { color: '#fde047', size: 26 });
      s.fx.text(W / 2, H * 0.28, 'FULL COMBO!', { color: '#fde047', size: 34, life: 1.6, rise: 10 });
      s.unlock('fullcombo');
      if (st.great === 0 && st.good === 0) s.unlock('allperfect');
    }
    if (this.holdsDone >= 10) s.unlock('sustain');
    s.completeLevel();
  }

  // ── Draw ───────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, t = this.t, gold = s.gold;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bonus) { g.addColorStop(0, '#2a1403'); g.addColorStop(1, '#3b0a3a'); }
    else { g.addColorStop(0, '#0a0620'); g.addColorStop(1, '#140a2e'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // pulsing stars + beat glow
    for (const st of this.stars) {
      ctx.globalAlpha = 0.2 + st.z * 0.5 + this.pulse * 0.2;
      ctx.fillStyle = '#c4b5fd';
      const y = (st.y + t * (20 + st.z * 60)) % H;
      ctx.fillRect(st.x, y, 1 + st.z * 1.5, 1 + st.z * 1.5);
    }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(W / 2, HIT_Y, 10, W / 2, HIT_Y, 360);
    glow.addColorStop(0, `rgba(236,72,153,${0.12 + this.pulse * 0.18})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    // lanes
    for (let i = 0; i < LANES; i++) {
      const x = LX + i * LW;
      const lg = ctx.createLinearGradient(0, TOP, 0, HIT_Y + 60);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,255,255,${0.05 + this.flash[i] * 0.15})`);
      if (this.bad[i] > 0) lg.addColorStop(1, `rgba(251,113,133,${this.bad[i] * 0.35})`);
      ctx.fillStyle = lg; ctx.fillRect(x + 3, TOP, LW - 6, HIT_Y + 60 - TOP);
      ctx.strokeStyle = 'rgba(167,139,250,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, H - 40); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(LX + LANES * LW, TOP); ctx.lineTo(LX + LANES * LW, H - 40); ctx.stroke();
    // beat lines scrolling down
    ctx.strokeStyle = 'rgba(167,139,250,.14)';
    const firstBeat = Math.ceil((this.songT - 0.2) / this.beat);
    for (let b = firstBeat; b < firstBeat + 16; b++) {
      const y = HIT_Y - (b * this.beat - this.songT) * this.speed;
      if (y < TOP) break;
      ctx.lineWidth = b % 4 === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(LX, y); ctx.lineTo(LX + LANES * LW, y); ctx.stroke();
    }
    // stealth fog
    if (this.stealth) {
      const fg = ctx.createLinearGradient(0, HIT_Y - 230, 0, HIT_Y - 90);
      fg.addColorStop(0, 'rgba(10,6,32,0)'); fg.addColorStop(1, 'rgba(10,6,32,0.96)');
      // drawn after notes (below)
      this._fog = fg;
    }

    // hit line + receptors
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(LX, HIT_Y - 2, LANES * LW, 4);
    for (let i = 0; i < LANES; i++) this.drawArrow(ctx, LX + (i + 0.5) * LW, HIT_Y, i, 1 + this.flash[i] * 0.15, true, gold);

    // notes
    const colFor = (i) => (gold || this.bonus ? '#fbbf24' : LANE_COL[i]);
    for (const n of this.notes) {
      if (n.state === 'hit' || (n.state === 'miss' && !n.hold)) continue;
      const x = LX + (n.lane + 0.5) * LW;
      let y = HIT_Y - (n.t - this.songT) * this.speed;
      const yEnd = HIT_Y - (n.t + n.hold - this.songT) * this.speed;
      if (yEnd > H + 40) continue;
      if (y < TOP - 40 && yEnd < TOP - 40) break;
      if (n.hold) {
        if (n.state === 'holding') y = HIT_Y;
        ctx.save();
        ctx.globalAlpha = n.state === 'miss' ? 0.25 : 0.85;
        ctx.fillStyle = colFor(n.lane); ctx.shadowColor = colFor(n.lane); ctx.shadowBlur = n.state === 'holding' ? 20 : 8;
        roundRect(ctx, x - 13, Math.max(TOP, yEnd), 26, Math.max(0, y - Math.max(TOP, yEnd)), 13); ctx.fill();
        ctx.restore();
        if (n.state === 'miss' || n.state === 'holding') continue;
      }
      if (y < TOP - 40) continue;
      this.drawArrow(ctx, x, y, n.lane, 1, false, gold || this.bonus, n.chord);
    }
    if (this.stealth && this._fog) { ctx.fillStyle = this._fog; ctx.fillRect(LX, HIT_Y - 230, LANES * LW, 140); ctx.fillStyle = 'rgba(10,6,32,.96)'; ctx.fillRect(LX, HIT_Y - 90, LANES * LW, 60); }

    // judgement
    if (this.judge && this.judge.t < 0.6) {
      const k = this.judge.t;
      ctx.save(); ctx.globalAlpha = 1 - k / 0.6; ctx.textAlign = 'center';
      ctx.font = `900 ${34 + (k < 0.08 ? (0.08 - k) * 150 : 0)}px system-ui`;
      ctx.fillStyle = this.judge.color; ctx.shadowColor = this.judge.color; ctx.shadowBlur = 16;
      ctx.fillText(this.judge.label, W / 2, HIT_Y - 150);
      if (this.judge.early) { ctx.font = '700 14px system-ui'; ctx.shadowBlur = 0; ctx.fillText(this.judge.early, W / 2, HIT_Y - 128); }
      if (s.comboCount >= 5) { ctx.font = '800 18px system-ui'; ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.fillText(`${s.comboCount} STREAK`, W / 2, HIT_Y - 100); }
      ctx.restore();
    }
    // count-in
    if (this.songT < 4 * this.beat && s.state === 'playing') {
      const b = Math.floor(this.songT / this.beat);
      if (b >= 0) {
        ctx.save(); ctx.textAlign = 'center'; ctx.font = '900 64px system-ui'; ctx.fillStyle = '#fff';
        ctx.globalAlpha = 1 - (this.songT / this.beat - b);
        ctx.fillText(['4', '3', '2', '1'][b] || '', W / 2, H * 0.42); ctx.restore();
      }
    }

    // HUD
    ctx.fillStyle = 'rgba(3,5,20,.78)'; ctx.fillRect(0, 0, W, 44);
    const prog = clamp(this.songT / this.endT, 0, 1);
    if (this.bonus) progressBar(ctx, 14, 12, W - 28, 20, s.bonusLeft / 15, '#fbbf24', `★ FEVER · ${this.feverHits} hits · ${Math.ceil(s.bonusLeft)}s`);
    else progressBar(ctx, 14, 12, W - 28, 20, prog, '#e879f9', `♪ ${this.bpm} BPM · song ${Math.round(prog * 100)}%`);
    if (!this.bonus) {
      const c = this.hp > 50 ? '#4ade80' : this.hp > 25 ? '#fbbf24' : '#f87171';
      progressBar(ctx, LX, H - 30, LANES * LW, 14, this.hp / 100, c, 'ENERGY');
    }
    if (gold) { ctx.save(); ctx.font = '700 12px system-ui'; ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'right'; ctx.fillText('★ GOLDEN NOTES', W - 10, H - 34); ctx.restore(); }
  }

  drawArrow(ctx, x, y, lane, scale, receptor, gold, chord) {
    const rot = [Math.PI / 2, 0, Math.PI, -Math.PI / 2][lane];     // arrow drawn pointing down; rotate per lane
    const col = gold ? '#fbbf24' : LANE_COL[lane];
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 22); ctx.lineTo(24, -2); ctx.lineTo(10, -2); ctx.lineTo(10, -22); ctx.lineTo(-10, -22); ctx.lineTo(-10, -2); ctx.lineTo(-24, -2); ctx.closePath();
    if (receptor) {
      ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.globalAlpha = 0.55 + this.flash[lane] * 0.45;
      ctx.shadowColor = col; ctx.shadowBlur = 8 + this.flash[lane] * 20; ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${this.flash[lane] * 0.3})`; ctx.fill();
    } else {
      const g = ctx.createLinearGradient(0, -22, 0, 22);
      g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, col);
      ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fill();
      ctx.lineWidth = chord ? 3 : 1.5; ctx.strokeStyle = chord ? '#fff' : 'rgba(255,255,255,.6)'; ctx.stroke();
    }
    ctx.restore();
  }
}

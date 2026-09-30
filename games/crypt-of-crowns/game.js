// ─────────────────────────────────────────────────────────────
//  CRYPT OF CROWNS — game 18 (Zone 3 · Master · LEGENDS game)
//  A first-person dungeon crawl through 15 hand-built crypts. You move one
//  square at a time. Find keys, pull levers to work the iron gates, SEARCH
//  cracked walls for secret passages, and time your way past skeleton
//  patrols and spike traps. Everything runs on a fixed timetable, so every
//  crypt can be beaten without a scratch.
//
//  Finish all 15 without losing a single life, starting from crypt 1, and the
//  secret 16th crypt opens… the Crown Vault. That wins the Zone 3 crown.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { Raycaster, makeTextures, makeSprites } from '../../assets/js/raycast.js';
import { LEVELS } from './levels.js';
import { TICK, ACT, DIRS, parse, skelAt, spikeUp, freshState, tryAct, applyAct, pickKey, danger, jammed } from './sim.js';

const ID = 'crypt-of-crowns';
const W = 480, H = 720;
const VIEW = { x: 0, y: 46, w: 480, h: 430 };
const PANEL_Y = VIEW.y + VIEW.h;
const PAD = { up: [282, PANEL_Y + 52], left: [222, PANEL_Y + 112], right: [342, PANEL_Y + 112], down: [282, PANEL_Y + 172] };
const SEARCH_BTN = [420, PANEL_Y + 112];
const BTN_R = 29;

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  finalLevel: 15,
  secretLevel: 16,
  bonusLevels: [5, 10],
  bonusTime: 15,
  comboWindow: 2.5,
  comboStep: 4,
  maxMultiplier: 4,
  music: { bpm: 92, style: 'crypt', lead: 'triangle', arp: [0, 1, 2, 1, 0, 2, 1, 3], oct: [12, 12, 12, 24, 12, 12, 12, 24], bass: 'half' },
  winTitle: 'You escaped the crypts!',
  titleHint: 'Legends say the Crypt Kings buried their crown where only a flawless explorer can find it…',
  sealedHint: 'Somewhere below, one last crypt stays sealed… perhaps for an explorer who is never caught?',
  sealedHintCheckpoint: 'Legends say the last crypt only opens for explorers who start from crypt 1…',
  secretTitle: '★ THE CROWN VAULT ★',
  legendBadge: 'crown',
  legendRevealDelay: 7.5,
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 150),
  levelInfo(level, bonus) {
    const d = LEVELS[level];
    if (bonus) return `★ ${d.name}! Grab all the gold you can in 15 seconds.`;
    if (d.secret) return 'You found it. The crypt no one has ever seen…';
    return `Crypt ${level}: ${d.name} — ${d.tip}`;
  },
  create: (shell) => new CryptOfCrowns(shell),
});

const TEX_OF = { '#': 10, '=': 13 };

class CryptOfCrowns {
  constructor(s) {
    this.s = s; this.t = 0;
    this.rc = new Raycaster({ ...VIEW, cols: 160 });
    this.tex = makeTextures(); this.spr = makeSprites();
    this.chestsRun = 0;
    this.startLevel(1, false);
  }

  reset() { this.chestsRun = 0; }

  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.def = LEVELS[level];
    this.secret = !!this.def.secret;
    this.W = parse(this.def);
    this.st = freshState();
    this.T = 0; this.acc = 0; this.time = 0;
    this.act = null; this.next = null;
    this.p = { ...this.W.start };
    this.taken = new Set();         // coins & chests picked up ("x,y")
    this.coinsHere = 0; this.caught = 0; this.done = false;
    this.finale = null; this.msg = null;
    this.seen = this.W.grid.map((r) => r.map(() => bonus || this.secret));
    this.see();
  }

  // ── Input ──────────────────────────────────────────────────
  onAction(a, x, y) {
    if (a === 'up') this.next = 'fwd';
    else if (a === 'down') this.next = 'back';
    else if (a === 'left') this.next = 'left';
    else if (a === 'right') this.next = 'right';
    else if (a === 'action') this.next = 'search';
    else if (a === 'press') { const b = this.buttonAt(x, y); if (b) this.next = b; }
    else if (a === 'tap' && y >= VIEW.y && y < PANEL_Y) this.next = x < W * 0.3 ? 'left' : x > W * 0.7 ? 'right' : 'fwd';
  }
  buttonAt(x, y) {
    for (const [k, [bx, by]] of Object.entries(PAD)) if (Math.hypot(x - bx, y - by) < BTN_R + 8) return { up: 'fwd', down: 'back', left: 'left', right: 'right' }[k];
    if (Math.hypot(x - SEARCH_BTN[0], y - SEARCH_BTN[1]) < 44) return 'search';
    return null;
  }
  /** Walking keeps going while the key / button is held. */
  heldMove() {
    const inp = this.s.input, p = inp.pointer;
    if (inp.isDown('up')) return 'fwd';
    if (inp.isDown('down')) return 'back';
    if (p.down) { const b = this.buttonAt(p.x, p.y); if (b === 'fwd' || b === 'back') return b; }
    return null;
  }

  // ── The world clock ────────────────────────────────────────
  update(dt) {
    this.t += dt;
    if (this.done) return;
    this.acc += dt;
    while (this.acc >= TICK && !this.done) { this.acc -= TICK; this.tick(); if (this.s.state !== 'playing') { this.acc = 0; return; } }
  }

  tick() {
    const s = this.s, W = this.W, p = this.p;
    // 0. start the next action on the tick boundary (just like the level checker)
    if (!this.act) { this.begin(this.next || this.heldMove()); this.next = null; }
    this.T++; this.time += TICK;
    // 1. the action in progress
    const a = this.act;
    let cells = [[p.x, p.y]], spike = [p.x, p.y];
    if (a) {
      a.n++;
      if (a.type === 'move' && a.n === 1) cells = [[p.x, p.y], a.to];
      if (a.type === 'move' && a.n === ACT) { p.x = a.to[0]; p.y = a.to[1]; cells = [[p.x, p.y]]; spike = [p.x, p.y]; }
    }
    // 2. caught?
    if (!this.bonus && !this.secret) {
      const d = danger(W, this.T, cells, spike);
      if (d) return this.die(d);
    }
    // 3. finish the action
    if (a && a.n >= a.dur) {
      this.act = null;
      if (a.type === 'move') this.arrive();
      else if (a.type === 'turn') p.d = a.to;
      else if (a.type === 'door' || a.type === 'lever' || a.type === 'secret') this.effect(a);
    }
  }

  begin(cmd) {
    if (!cmd) return;
    const s = this.s, p = this.p;
    if (cmd === 'left' || cmd === 'right') { this.act = { type: 'turn', from: p.d, to: (p.d + (cmd === 'left' ? 3 : 1)) % 4, n: 0, dur: ACT }; return; }
    const r = tryAct(this.W, this.st, p.x, p.y, p.d, cmd);
    if (r.type === 'move') { this.act = { type: 'move', from: [p.x, p.y], to: r.to, n: 0, dur: ACT, back: cmd === 'back' }; return; }
    if (r.type === 'lever' && jammed(this.W, this.st, p.x, p.y, r.which)) { this.say('The gate would crush you — step off it first!', '#fca5a5'); s.sound.tone({ freq: 150, dur: 0.12, type: 'square', vol: 0.06 }); return; }
    if (r.type === 'door' || r.type === 'lever' || r.type === 'secret') {
      this.act = { ...r, n: 0, dur: ACT };
      if (r.type === 'secret') s.sound.noise({ dur: 0.35, vol: 0.18, freq: 300, type: 'lowpass' });
      if (r.type === 'lever') s.sound.tone({ freq: 220, to: 140, dur: 0.12, type: 'square', vol: 0.07 });
      if (r.type === 'door') s.sound.play('metal');
      return;
    }
    if (r.type === 'locked') { this.say(r.blue ? '🔒 This door needs a BLUE key' : '🔒 This door needs a GOLD key', r.blue ? '#93c5fd' : '#fcd34d'); s.sound.tone({ freq: 160, dur: 0.15, type: 'square', vol: 0.06 }); }
    else if (cmd === 'search') { this.say('Solid stone…', '#a8a29e'); s.sound.noise({ dur: 0.06, vol: 0.06, freq: 400, type: 'lowpass' }); }
    else s.sound.noise({ dur: 0.05, vol: 0.07, freq: 250, type: 'lowpass' });   // bump
    this.act = { type: 'wait', n: 0, dur: ACT };                                    // a bump costs a moment
  }

  say(text, color = '#e7e5e4') { this.msg = { text, color, t: 1.8 }; }

  effect(a) {
    const s = this.s, L = this.level, W = this.W;
    applyAct(W, this.st, a);
    if (a.type === 'door') {
      s.award(50 * L); s.fx.text(VIEW.w / 2, VIEW.y + 150, 'Unlocked!', { color: '#fcd34d', size: 22 });
      s.sound.tone({ freq: 330, to: 660, dur: 0.18, type: 'triangle', vol: 0.1 });
    } else if (a.type === 'lever') {
      s.award(30 * L);
      s.sound.noise({ dur: 0.5, vol: 0.14, freq: 180, type: 'lowpass' }); s.sound.tone({ freq: 90, to: 60, dur: 0.45, type: 'sawtooth', vol: 0.06 });
      this.say(this.st.levers[a.which] ? 'Clunk! Gates grind open…' : 'Clunk! Gates slam shut…', '#cbd5e1');
    } else if (a.type === 'secret') {
      s.award(250 * L, VIEW.w / 2, VIEW.y + 140, { chain: true, color: '#c4b5fd', size: 22 });
      s.fx.text(VIEW.w / 2, VIEW.y + 110, 'SECRET PASSAGE!', { color: '#c4b5fd', size: 30, life: 1.3 });
      [0, 3, 7, 10, 14].forEach((st, i) => s.sound.tone({ freq: s.sound.note(69 + st), dur: 0.16, type: 'sine', vol: 0.1, delay: i * 0.07 }));
      s.unlock('secret');
    }
    this.see();
  }

  arrive() {
    const s = this.s, p = this.p, L = this.level, W = this.W, k = p.x + ',' + p.y, c = W.at(p.x, p.y);
    this.see();
    s.sound.noise({ dur: 0.05, vol: 0.05, freq: 380, type: 'lowpass' });   // footstep
    if (c === 'c' && !this.taken.has(k)) {
      this.taken.add(k); this.coinsHere++;
      s.award((this.bonus ? 10 : 25) * L, VIEW.w / 2, VIEW.y + 240, { chain: true, color: '#fde047', size: 16 });
      s.sound.play('coin', this.coinsHere % 8);
      if (this.bonus && this.coinsHere >= 50) s.unlock('hoard');
    } else if (c === 'T' && !this.taken.has(k)) {
      this.taken.add(k); this.chestsRun++;
      s.award((this.bonus ? 150 : 300) * L, VIEW.w / 2, VIEW.y + 220, { color: '#fbbf24', size: 24 });
      s.fx.text(VIEW.w / 2, VIEW.y + 180, 'TREASURE!', { color: '#fbbf24', size: 26 });
      s.sound.play('powerup');
      if (this.chestsRun >= 10) s.unlock('chests');
    }
    const key = pickKey(W, this.st, p.x, p.y);
    if (key) {
      s.award(100 * L, VIEW.w / 2, VIEW.y + 200, { color: key.blue ? '#93c5fd' : '#fcd34d', size: 20 });
      this.say(key.blue ? '🔑 A BLUE key!' : '🔑 A GOLD key!', key.blue ? '#93c5fd' : '#fcd34d');
      [0, 4, 7, 12].forEach((st, i) => s.sound.tone({ freq: s.sound.note((key.blue ? 79 : 84) + st), dur: 0.1, type: 'triangle', vol: 0.08, delay: i * 0.05 }));
    }
    if (W.exit && p.x === W.exit.x && p.y === W.exit.y) this.escape();
    if (W.crown && p.x === W.crown.x && p.y === W.crown.y) this.startFinale();
  }

  escape() {
    const s = this.s, L = this.level, par = this.def.par || 60;
    this.done = true;
    const spare = Math.max(0, Math.floor(par - this.time));
    if (spare) s.award(spare * 10 * L, VIEW.w / 2, VIEW.y + 200, { color: '#86efac', size: 22 });
    s.fx.text(VIEW.w / 2, VIEW.y + 150, spare ? `ESCAPED! ${spare}s under par` : 'ESCAPED!', { color: '#fde047', size: 30, life: 1.4 });
    s.sound.noise({ dur: 0.5, vol: 0.12, freq: 700, type: 'bandpass' });
    if (L >= 8 && this.caught === 0) s.unlock('untouched');
    if (L >= 11 && spare > 0) s.unlock('swift');
    s.completeLevel();
  }

  die(cause) {
    const s = this.s;
    this.caught++;
    this.act = null; this.next = null;
    if (cause === 'skeleton') {
      s.fx.text(VIEW.w / 2, VIEW.y + 170, 'CAUGHT BY A SKELETON!', { color: '#e7e5e4', size: 26, life: 1.2 });
      s.sound.noise({ dur: 0.3, vol: 0.25, freq: 2500, to: 400, type: 'bandpass' }); [0, 1, 2].forEach((i) => s.sound.tone({ freq: 700 - i * 150, dur: 0.05, type: 'square', vol: 0.07, delay: i * 0.06 }));
    } else {
      s.fx.text(VIEW.w / 2, VIEW.y + 170, 'SPIKES!', { color: '#f87171', size: 30, life: 1.2 });
      s.sound.play('hit');
    }
    s.hurt();
  }

  onLifeLost() {
    // back to the crypt entrance — keys, doors and levers stay as they were
    this.p = { ...this.W.start }; this.act = null; this.next = null; this.acc = 0;
  }

  onLevelClear() {}

  /** Mark what you can see on the map. */
  see() {
    const { x, y, d } = this.p, W = this.W;
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (this.seen[yy]?.[xx] !== undefined) this.seen[yy][xx] = true;
    for (const dd of [0, 1, 2, 3]) {
      const [dx, dy] = DIRS[dd];
      for (let i = 1; i <= (dd === d ? 8 : 3); i++) {
        const cx = x + dx * i, cy = y + dy * i;
        if (this.seen[cy]?.[cx] === undefined) break;
        this.seen[cy][cx] = true;
        for (const [ox, oy] of [[dy, dx], [-dy, -dx]]) if (this.seen[cy + oy]?.[cx + ox] !== undefined) this.seen[cy + oy][cx + ox] = true;
        if (this.solidAt(cx, cy)) break;
      }
    }
  }
  solidAt(x, y) { const c = this.W.at(x, y); return this.cellTex(x, y, c) !== 0 || c === 't'; }

  // ── The secret vault's finale ──────────────────────────────
  startFinale() {
    const s = this.s;
    this.done = true;
    this.finale = { t: 0, note: 0, nextNote: 1.2, sparkT: 0 };
    s.award(5000, VIEW.w / 2, VIEW.y + 200, { color: '#fde047', size: 30 });
    s.sound.noise({ dur: 0.6, vol: 0.35, freq: 6000, type: 'highpass' });
    s.sound.play('powerup');
    s.fx.flash('#fde68a', 0.6);
    s.legendFound();
  }
  idle(dt) {
    this.t += dt;
    const f = this.finale, s = this.s;
    if (!f) return;
    f.t += dt;
    const tune = [72, 75, 79, 84, 79, 75, 77, 80, 84, 87, 84, 80, 79, 83, 86, 91];
    f.nextNote -= dt;
    if (f.nextNote <= 0) {
      const n = tune[f.note % tune.length];
      s.sound.tone({ freq: s.sound.note(n), dur: 1.0, type: 'sine', vol: 0.12 });
      s.sound.tone({ freq: s.sound.note(n - 12), dur: 0.6, type: 'triangle', vol: 0.04 });
      f.note++;
      f.nextNote = f.note % 4 === 3 ? 0.7 : 0.36;
    }
    f.sparkT -= dt;
    if (f.t > 1 && f.sparkT <= 0) {
      f.sparkT = 0.08;
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 90;
      s.fx.burst(W / 2 + Math.cos(a) * r, VIEW.y + 180 + Math.sin(a) * r * 0.7, { colors: ['#fde68a', '#fff', '#fbbf24'], count: 2, speed: 30, life: 0.9, size: 3 });
    }
  }

  // ── Draw ───────────────────────────────────────────────────
  cellTex(x, y, c = this.W.at(x, y)) {
    const st = this.st, W = this.W;
    switch (c) {
      case '#': return this.bonus ? 1 : this.secret ? 2 : 10;
      case '=': return 13;
      case ' ': return 10;
      case '%': return st.secrets.has(W.secrets.findIndex((q) => q.x === x && q.y === y)) ? 0 : 11;
      case 'D': return st.doors.has(W.doors.findIndex((q) => q.x === x && q.y === y)) ? 0 : 9;
      case 'B': return st.doors.has(W.doors.findIndex((q) => q.x === x && q.y === y)) ? 0 : 12;
      case 'G': return st.levers.L ? 0 : 6;
      case 'g': return st.levers.L ? 6 : 0;
      case 'H': return st.levers.M ? 0 : 6;
      case 'h': return st.levers.M ? 6 : 0;
      case 'L': return st.levers.L ? 8 : 7;
      case 'M': return st.levers.M ? 8 : 7;
      default: return 0;
    }
  }

  camera() {
    const p = this.p, a = this.act, f = a ? clamp((a.n + this.acc / TICK) / a.dur, 0, 1) : 0;
    const e = f * f * (3 - 2 * f);
    let x = p.x + 0.5, y = p.y + 0.5, ang = p.d * Math.PI / 2, bob = 0;
    if (a?.type === 'move') { x += (a.to[0] - p.x) * e; y += (a.to[1] - p.y) * e; bob = Math.sin(f * Math.PI) * 6; }
    if (a?.type === 'turn') { let da = (a.to - a.from) * Math.PI / 2; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2; ang = a.from * Math.PI / 2 + da * e; }
    // stand a little back in the square so the wall in front isn't pressed against your nose
    return { x: x - Math.cos(ang) * 0.32, y: y - Math.sin(ang) * 0.32, a: ang, bob };
  }

  render(ctx) {
    const s = this.s, t = this.t, W = this.W, st = this.st;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 480, H);
    const cam = this.camera(), tt = this.T + this.acc / TICK;
    const sprites = [];
    W.grid.forEach((row, y) => row.forEach((c, x) => {
      const k = x + ',' + y;
      if (c === 'c' && !this.taken.has(k)) sprites.push({ x: x + 0.5, y: y + 0.5, img: this.spr.coin, scale: 0.6, lift: Math.sin(t * 3 + x) * 0.02 });
      else if (c === 'T' && !this.taken.has(k)) sprites.push({ x: x + 0.5, y: y + 0.5, img: this.spr.chest, scale: 0.6, glow: true });
      else if (c === 't') sprites.push({ x: x + 0.5, y: y + 0.5, img: this.spr.torch, scale: 0.9, glow: true, lift: 0.05 });
      else if (c === 'E') sprites.push({ x: x + 0.5, y: y + 0.5, img: this.spr.stairs, scale: 1, glow: true });
      else if (c === 'C' && !this.finale) sprites.push({ x: x + 0.5, y: y + 0.5, img: this.spr.crown, scale: 0.7, glow: true, lift: 0.15 + Math.sin(t * 2) * 0.04 });
    }));
    W.keys.forEach((q, i) => { if (!st.keys.has(i)) sprites.push({ x: q.x + 0.5, y: q.y + 0.5, img: q.blue ? this.spr.bluekey : this.spr.key, scale: 0.5, glow: true, lift: 0.12 + Math.sin(t * 3 + i) * 0.04 }); });
    for (const sp of W.spikes) sprites.push({ x: sp.x + 0.5, y: sp.y + 0.5, img: spikeUp(sp, this.T) ? this.spr.spikes : this.spr.spikesdown, scale: 0.9 });
    for (const sk of W.skels) { const q = this.skelPos(sk, tt); sprites.push({ x: q[0] + 0.5, y: q[1] + 0.5, img: this.spr.skeleton, scale: 0.9, lift: Math.abs(Math.sin(tt * 1.3)) * 0.02 }); }
    this.rc.render(ctx, (x, y) => this.cellTex(x, y), cam, {
      tex: this.tex, light: this.secret ? 11 : this.bonus ? 9 : 7.5, sprites, bob: cam.bob,
      ceil: [this.secret ? '#422006' : '#1c1917'], floor: [this.secret ? '#a16207' : this.bonus ? '#78350f' : '#3f3a36'],
    });
    if (this.finale) this.drawCrownRising(ctx);
    this.drawHud(ctx);
    this.drawPanel(ctx);
  }

  /** Smoothly interpolated skeleton cell position at fractional tick tt. */
  skelPos(sk, tt) {
    const T = Math.floor(tt), q = skelAt(sk, T), f = ((T % sk.sk) + (tt - T)) / sk.sk;
    return [q.from[0] + (q.to[0] - q.from[0]) * f, q.from[1] + (q.to[1] - q.from[1]) * f];
  }

  drawCrownRising(ctx) {
    const f = this.finale, k = Math.min(1, f.t / 2.5), cx = VIEW.w / 2, cy = VIEW.y + 190 - k * 30;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
    g.addColorStop(0, `rgba(253,230,138,${0.55 * k})`); g.addColorStop(1, 'rgba(253,230,138,0)');
    ctx.fillStyle = g; ctx.fillRect(0, VIEW.y, VIEW.w, VIEW.h);
    const sz = 90 + k * 110;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy); ctx.rotate(Math.sin(f.t * 1.5) * 0.06);
    ctx.drawImage(this.spr.crown, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
    if (f.t > 1.5) {
      ctx.globalAlpha = Math.min(1, (f.t - 1.5) / 1);
      ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde047';
      ctx.fillText('THE CROWN OF THE CRYPT KINGS', cx, VIEW.y + 340);
      ctx.font = '700 15px system-ui'; ctx.fillStyle = '#fef3c7'; ctx.fillText('A flawless run. You are a Legend.', cx, VIEW.y + 368);
      ctx.globalAlpha = 1;
    }
  }

  drawHud(ctx) {
    const s = this.s, st = this.st, d = this.def;
    ctx.fillStyle = 'rgba(3,5,20,.94)'; ctx.fillRect(0, 0, 480, VIEW.y);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '800 15px system-ui'; ctx.fillStyle = this.secret ? '#fde047' : '#e7e5e4';
    const title = this.bonus ? `★ ${d.name} · ${Math.ceil(s.bonusLeft)}s` : this.secret ? '★ The Crown Vault' : `${this.level}. ${d.name}`;
    ctx.fillText(title, 12, 16);
    ctx.font = '600 12px system-ui'; ctx.fillStyle = '#a8a29e';
    if (!this.bonus && !this.secret) {
      const par = d.par || 60, left = Math.ceil(par - this.time);
      ctx.fillStyle = left > 0 ? '#86efac' : '#a8a29e';
      ctx.fillText(left > 0 ? `⏱ ${left}s to beat par` : '⏱ past par — no time bonus', 12, 34);
      const found = st.secrets.size, all = this.W.secrets.length;
      ctx.textAlign = 'right'; ctx.fillStyle = '#c4b5fd';
      ctx.fillText(`Secrets ${found}/${all}`, 468, 34);
    } else if (this.bonus) { ctx.fillStyle = '#fde047'; ctx.fillText(`${this.coinsHere} gold grabbed`, 12, 34); }
    // keys
    ctx.textAlign = 'right'; ctx.font = '800 15px system-ui';
    let kx = 468;
    if (st.blue > 0) { ctx.fillStyle = '#93c5fd'; ctx.fillText(`🔑×${st.blue}`, kx, 16); kx -= 58; }
    if (st.gold > 0) { ctx.fillStyle = '#fcd34d'; ctx.fillText(`🔑×${st.gold}`, kx, 16); }
    // message
    if (this.msg) {
      this.msg.t -= 1 / 60;
      if (this.msg.t <= 0) this.msg = null;
      else {
        ctx.save(); ctx.globalAlpha = Math.min(1, this.msg.t * 2);
        ctx.font = '800 17px system-ui'; const w = ctx.measureText(this.msg.text).width + 28;
        ctx.fillStyle = 'rgba(0,0,0,.65)'; roundRect(ctx, 240 - w / 2, VIEW.y + 12, w, 32, 16); ctx.fill();
        ctx.fillStyle = this.msg.color; ctx.textAlign = 'center'; ctx.fillText(this.msg.text, 240, VIEW.y + 29);
        ctx.restore();
      }
    }
  }

  drawPanel(ctx) {
    const s = this.s, W = this.W, st = this.st, p = this.p, t = this.t;
    ctx.fillStyle = '#0c0a09'; ctx.fillRect(0, PANEL_Y, 480, H - PANEL_Y);
    ctx.fillStyle = '#292524'; ctx.fillRect(0, PANEL_Y, 480, 3);
    // map
    const size = 168, ox = 10, oy = PANEL_Y + 18, cs = Math.min(size / W.w, size / W.h);
    ctx.fillStyle = '#000'; ctx.fillRect(ox - 3, oy - 3, W.w * cs + 6, W.h * cs + 6);
    for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
      if (!this.seen[y][x]) continue;
      const c = W.at(x, y), tx = this.cellTex(x, y, c);
      let col = tx ? '#57534e' : '#1c1917';
      if (tx === 9) col = '#ca8a04'; else if (tx === 12) col = '#2563eb'; else if (tx === 6) col = '#9ca3af'; else if (tx === 7 || tx === 8) col = st.levers[c] ? '#22c55e' : '#ef4444'; else if (c === 'E') col = '#4ade80'; else if (c === 't') col = '#f97316';
      ctx.fillStyle = col; ctx.fillRect(ox + x * cs, oy + y * cs, cs + 0.5, cs + 0.5);
    }
    const dot = (x, y, color, r = 0.32) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, Math.max(1.8, cs * r), 0, Math.PI * 2); ctx.fill(); };
    W.keys.forEach((q, i) => { if (!st.keys.has(i) && this.seen[q.y][q.x]) dot(q.x, q.y, q.blue ? '#60a5fa' : '#fbbf24'); });
    W.grid.forEach((row, y) => row.forEach((c, x) => { if (c === 'T' && !this.taken.has(x + ',' + y) && this.seen[y][x]) dot(x, y, '#f59e0b', 0.28); }));
    for (const sp of W.spikes) if (this.seen[sp.y][sp.x] && spikeUp(sp, this.T)) dot(sp.x, sp.y, '#ef4444', 0.25);
    const tt = this.T + this.acc / TICK;
    for (const sk of W.skels) { const q = this.skelPos(sk, tt); if (this.seen[Math.round(q[1])]?.[Math.round(q[0])]) dot(q[0], q[1], '#f5f5f4', 0.34); }
    const cam = this.camera();
    ctx.save(); ctx.translate(ox + (cam.x + Math.cos(cam.a) * 0.32) * cs, oy + (cam.y + Math.sin(cam.a) * 0.32) * cs); ctx.rotate(cam.a);
    const r = Math.max(3, cs * 0.45);
    ctx.fillStyle = s.gold ? '#fbbf24' : '#38bdf8'; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7); ctx.fill(); ctx.restore();

    // d-pad
    const held = this.heldMove();
    const btn = (x, y, label, on) => {
      ctx.fillStyle = on ? '#44403c' : '#1c1917'; ctx.strokeStyle = '#57534e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, BTN_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e7e5e4'; ctx.font = '900 20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + 1);
    };
    btn(...PAD.up, '▲', held === 'fwd'); btn(...PAD.down, '▼', held === 'back');
    btn(...PAD.left, '↺', this.act?.type === 'turn' && this.act.to === (p.d + 3) % 4);
    btn(...PAD.right, '↻', this.act?.type === 'turn' && this.act.to === (p.d + 1) % 4);
    // search
    const [sx, sy] = SEARCH_BTN;
    ctx.fillStyle = '#2e1065'; ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, 42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ede9fe'; ctx.font = '900 13px system-ui'; ctx.fillText('🔍', sx, sy - 10); ctx.fillText('SEARCH', sx, sy + 10);
    ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(214,211,209,.55)';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Tap the view: sides turn, middle steps' : '↑↓ step · ←→ turn · Space search', 330, H - 14);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 11px system-ui'; ctx.fillText('★ GOLDEN EXPLORER', 330, PANEL_Y + 14); }
  }
}

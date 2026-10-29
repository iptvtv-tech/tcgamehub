// ─────────────────────────────────────────────────────────────
//  CROWN HEIST 3D: THE DEEP VAULTS — game 24 (Zone 4 · Ultra · LEGENDS game)
//  First-person, drawn with the HD engine (assets/js/raycast-hd.js): torchlight,
//  guards' torch beams sweeping the walls, the crown's gold glow.
//
//  Every floor: SNEAK IN by torchlight, find the crown on its lit pedestal and
//  grab it — the torch-hand becomes the crown-hand, gold light blooms from you
//  and every guard is alerted. Then RUN for the stairs, slowed by the crown's
//  weight, before the vault seals. Portcullises slam on the short way out (find
//  the lever or a side route), cracked floors give way behind you. Hide in dark
//  alcoves, throw a coin to lure a guard, drop smoke to break a chase.
//  Floors 1-5 sandstone cellars (skeletons) · 6-10 golden marble halls (knights
//  who run) · 11-15 throne rooms (and the Crown Wraith, who follows the crown's
//  light through walls). Floors 5 and 10 are treasure vaults.
//
//  THE EGG: carry the crown out of floor 15 — across as many visits as it takes
//  (start from any floor you've reached; progress is saved to your code). A
//  flawless run from floor 1 also finds floor 16: the Empty Throne.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, clamp } from '../../assets/js/engine.js';
import { HDRaycaster } from '../../assets/js/raycast-hd.js';
import { drawTorchHand } from '../../assets/js/raycast-art.js';
import { Legends, applyTheme } from '../../assets/js/legends.js';
import { Store } from '../../assets/js/storage.js';
import { Sound } from '../../assets/js/audio.js';
import { buildFloor, C, SPEED, FINAL, SECRET, bfs, WRAITH_WAKE } from './floors.js';
import { makeArt, makeSprites, drawCrownHand, WALL, SCONCE, BANNER, LEVER, GATE, ALCOVE, RUBBLE, VAULT, FL } from './art.js';

const ID = 'crown-heist';
const W = 480, H = 720;
const VIEW = { x: 0, y: 46, w: 480, h: 430 };
const PANEL_Y = VIEW.y + VIEW.h;
const STICK = { x: 82, y: PANEL_Y + 128, r: 58 };
const BTN = { use: { x: 404, y: PANEL_Y + 66, r: 40 }, coin: { x: 364, y: PANEL_Y + 170, r: 31 }, smoke: { x: 442, y: PANEL_Y + 170, r: 31 } };
const BASE_Y = { stick: STICK.y, use: BTN.use.y, coin: BTN.coin.y, smoke: BTN.smoke.y };
/** portrait bands: the stick and the three buttons drop below the box on tall phones,
 *  keeping their layout (USE above, COIN/SMOKE below) */
function dropControls(bands) {
  const band = bands?.bottom || 0;
  if (band >= 170) {
    const mid = H + band * 0.5;
    STICK.y = mid; BTN.use.y = mid - 34; BTN.coin.y = mid + 44; BTN.smoke.y = mid + 44;
  } else { STICK.y = BASE_Y.stick; BTN.use.y = BASE_Y.use; BTN.coin.y = BASE_Y.coin; BTN.smoke.y = BASE_Y.smoke; }
}
const MAP = { x: 160, y: PANEL_Y + 12, s: 150 };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CALM = { bpm: 84, style: 'crypt', lead: 'triangle', arp: [0, 2, 1, 2, 0, 3, 2, 1], oct: [12, 12, 12, 24, 12, 12, 0, 12], bass: 'half' };
const CHASE = { bpm: 148, style: 'chase', lead: 'sawtooth', arp: [0, 1, 2, 3, 2, 1, 0, 1], oct: [12, 24, 12, 24, 12, 24, 12, 24], bass: 'drive' };

const GUARD = {
  // speeds reduced ~20%, detection range reduced ~10% for a gentler difficulty curve
  skeleton: { walk: 0.80, alert: 1.08, run: 1.48, range: 4.1, cone: 0.55, light: [1.15, 0.6, 0.24], rad: 4.4 },
  knight:   { walk: 0.92, alert: 1.24, run: 1.96, range: 5.0, cone: 0.6,  light: [1.3, 0.85, 0.35], rad: 5.0 },
};

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  extend: { maxH: 900, topShare: 0 },
  detail: true,
  levelName: 'Floor',
  finalLevel: FINAL,
  secretLevel: SECRET,
  bonusLevels: [5, 10],
  bonusTime: 15,
  comboWindow: 2.5,
  comboStep: 4,
  maxMultiplier: 4,
  music: CALM,
  winTitle: 'You escaped the Deep Vaults!',
  wonText: () => 'All 15 floors escaped with the crown',
  titleHint: 'Fifteen floors down lies the crown of the Crypt Kings. Every floor: sneak in, take its crown — and run.',
  sealedHint: 'Below the last floor, a throne has stood empty for a thousand years… waiting for a thief who is never caught?',
  sealedHintCheckpoint: 'Legends say the empty throne only shows itself to thieves who start from floor 1…',
  secretTitle: '★ THE EMPTY THRONE ★',
  legendBadge: 'heist',
  legendRevealDelay: 6.5,
  legendLore: 'You saw the crown in the Crypt. You stole it from the Vault.',
  legendLine: (s) => (s.isSecretLevel() ? 'all 16 floors · not a single life lost' : 'all 15 floors escaped with the crown'),
  checkpoints: (max) => { const out = [1]; for (let f = 2; f <= Math.min(max, FINAL); f++) if (f !== 5 && f !== 10) out.push(f); return out; },
  titleExtra: () => titleExtra(),
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 200),
  levelInfo(level, bonus) {
    if (bonus) return '★ Treasure vault! No guards — grab all the gold you can in 15 seconds.';
    const f = buildFloor(level);
    if (level === SECRET) return 'No guard has ever seen this room. Carry the crown to the empty throne.';
    return `${f.name} — ${f.tip}`;
  },
  create: (shell) => new CrownHeist(shell),
});

function titleExtra() {
  const code = Legends.myCode(), max = Math.min(Store.maxLevel(ID), FINAL), egg = Legends.hasEgg(4);
  const deep = egg ? '🥚 <b>Golden Throne Egg</b> won — all 15 floors escaped.' : max > 1 ? `🏰 Deepest floor reached: <b>${max}</b> / 15 — carry on from any floor you've reached.` : '';
  const c = code ? `🔐 Your progress is saved to <b>${esc(code)}</b> — enter it on the 🏛️ Legends page on any phone or computer.`
    : `🔐 Clear floor 3 to seal your progress with a code. Already have one? <a href="../../hall-of-legends/">Enter it here</a>.`;
  return `<p class="muted small">${deep}${deep ? '<br>' : ''}${c}</p>`;
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

class CrownHeist {
  constructor(s) {
    this.s = s; this.t = 0;
    this.rc = new HDRaycaster(VIEW);
    const art = makeArt();
    this.tex = art.tex; this.floorTex = art.floorTex; this.ceils = art.ceil; this.floors = art.floors;
    this.spr = makeSprites();
    this.dust = Array.from({ length: 54 }, () => ({ x: Math.random() * VIEW.w, y: VIEW.y + Math.random() * VIEW.h, v: 5 + Math.random() * 10, p: Math.random() * 7, r: Math.random() < 0.3 ? 1.6 : 1 }));
    this.keys = new Set();
    this.setupInput();
    this.reset();
    this.startLevel(1, false);
  }

  reset() { this.runCoins = 0; this.crownWonEarly = false; }

  // ── Input: keys beyond the engine's, the stick, the buttons, drag-to-look ──
  setupInput() {
    const s = this.s, playing = () => s.state === 'playing';
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (['KeyQ', 'KeyE', 'KeyC', 'KeyX', 'KeyF'].includes(e.code)) {
        this.keys.add(e.code);
        if (!playing() || e.repeat) return;
        if (e.code === 'KeyC') this.throwCoin();
        if (e.code === 'KeyX') this.dropSmoke();
        if (e.code === 'KeyF') this.use();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    const cv = s.canvas;
    this.ptr = new Map();
    cv.addEventListener('pointerdown', (e) => {
      if (!playing() && s.state !== 'banner') return;
      const [x, y] = s.input.toLogical(e);
      if (e.pointerType !== 'mouse') this.coarse = true;
      if (Math.hypot(x - STICK.x, y - STICK.y) < STICK.r + 26) { this.stick = { id: e.pointerId, dx: 0, dy: 0 }; this.moveStick(x, y); return; }
      for (const [k, b] of Object.entries(BTN)) if (Math.hypot(x - b.x, y - b.y) < b.r + 8) { this.pressed = { k, t: 0.2 }; if (playing()) (k === 'use' ? this.use() : k === 'coin' ? this.throwCoin() : this.dropSmoke()); return; }
      if (y >= VIEW.y && y < PANEL_Y) this.look = { id: e.pointerId, x };
    });
    addEventListener('pointermove', (e) => {
      if (this.stick?.id === e.pointerId) { const [x, y] = s.input.toLogical(e); this.moveStick(x, y); }
      else if (this.look?.id === e.pointerId) {
        const [x] = s.input.toLogical(e);
        if (playing()) this.p.a += (x - this.look.x) * (this.coarse ? 0.011 : 0.007);
        this.look.x = x;
      }
    });
    const up = (e) => { if (this.stick?.id === e.pointerId) this.stick = null; if (this.look?.id === e.pointerId) this.look = null; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    this.coarse = this.s.coarse;
  }
  moveStick(x, y) {
    let dx = (x - STICK.x) / STICK.r, dy = (y - STICK.y) / STICK.r;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    this.stick.dx = dx; this.stick.dy = dy;
  }
  onAction(a) { if (a === 'action') this.use(); }

  // ── Floors ─────────────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    this.f = buildFloor(level);
    this.secret = level === SECRET;
    this.look3 = this.f.treasure ? (level === 5 ? 'sand' : 'marble') : this.f.theme;
    this.taken = new Set();
    this.coinsHere = 0;
    this.spotted = false;
    this.done = false; this.finale = null; this.msg = null; this.nowRun = 0;
    this.seen = new Uint8Array(this.f.w * this.f.h);
    if (bonus || this.secret) this.seen.fill(1);
    this.placeDecor();
    this.attempt();
    if (this.secret) this.has = true;
  }

  /** (Re)start the floor: everything back where it was — but gold already taken stays taken. */
  attempt() {
    const f = this.f, s = this.s;
    this.g = f.g.clone();
    this.p = { x: f.start[0] + 0.5, y: f.start[1] + 0.5, a: this.startAngle() };
    this.has = this.secret; this.sealT = 0; this.gateShut = false; this.leverOn = false;
    this.ammo = { coin: this.level >= 4 ? 3 : 2, smoke: this.level >= 11 ? 2 : this.level >= 6 ? 1 : 1 };
    this.thrown = []; this.smokes = []; this.cracking = new Map(); this.collapseT = -1; this.collapsedTo = -1;
    this.caughtFx = null; this.hidden = false; this.bob = 0; this.walkT = 0; this.beatT = 0; this.exitWarn = 0;
    this.grabFx = 0;   // the crown hand reads it; undefined made the secret floor's first frame NaN
    this.wraith = null; this.pitCount = 0;
    this.guards = f.guards.map((gd, i) => {
      const [x, y] = gd.route[gd.phase % gd.route.length];
      return { i, kind: gd.kind, sentry: !!gd.sentry, route: gd.route, ri: gd.phase % gd.route.length, x: x + 0.5, y: y + 0.5, a: i * 1.7, state: 'patrol', sus: 0, alert: false, stun: 0, dead: false, field: null, fieldKey: '', target: null, searchT: 0, frame: 0, stepT: Math.random() * 0.5, lure: false, seeT: 9, lost: null };
    });
    this.relight();
    if (Sound.musicOn && s.state !== 'title') Sound.startMusic(CALM);
  }

  startAngle() {
    // face into the room, towards the crown (or straight up the throne hall)
    const f = this.f;
    if (!f.crown) return -Math.PI / 2;
    const dx = f.crown[0] - f.start[0], dy = f.crown[1] - f.start[1];
    const a = Math.atan2(dy, dx);
    return Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  }

  /** Wall torches and banners on the walls (same places every time). */
  placeDecor() {
    const f = this.f, g = f.g;
    this.sconces = new Map(); this.banners = new Set(); this.sconceLights = [];
    const taken = [], btaken = [];
    const open = (x, y) => { const v = g.at(x, y); return v === C.OPEN || v === C.CRACK || v === C.GATE || v === C.THRONE; };
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (g.at(x, y) !== C.WALL) continue;
      DIRS.forEach(([dx, dy]) => {
        if (!open(x + dx, y + dy)) return;
        const lx = x + 0.5 + dx * 0.8, ly = y + 0.5 + dy * 0.8, k = this.faceKey(x, y, dx, dy);
        const h = ((x * 73856093) ^ (y * 19349663) ^ (this.level * 83492791)) >>> 0;
        if (!taken.some(([ax, ay]) => Math.hypot(ax - lx, ay - ly) < (f.treasure || f.secret ? 3 : 4.2)) && h % 5 !== 0) {
          taken.push([lx, ly]); this.sconces.set(k, true);
          this.sconceLights.push({ x: lx, y: ly, r: 1.25, g: 0.64, b: 0.26, rad: 3.4 });
        } else if (f.theme !== 'sand' && h % 3 === 0 && !btaken.some(([ax, ay]) => Math.hypot(ax - lx, ay - ly) < 3.5)) {
          btaken.push([lx, ly]); this.banners.add(k);
        }
      });
    }
  }
  faceKey(x, y, fx, fy) { return ((y * 64 + x) * 4) + (fx === 1 ? 0 : fy === 1 ? 1 : fx === -1 ? 2 : 3); }

  /** Rebuild the fixed light map (call when the gate moves, the crown is taken, or the vault falls in). */
  relight() {
    const f = this.f, lights = [...this.sconceLights];
    for (const [x, y] of f.braziers) lights.push({ x: x + 0.5, y: y + 0.5, r: 1.35, g: 0.72, b: 0.3, rad: 4.6 });
    if (f.crown) lights.push(this.has ? { x: f.crown[0] + 0.5, y: f.crown[1] + 0.5, r: 0.85, g: 0.12, b: 0.08, rad: 3.2 } : { x: f.crown[0] + 0.5, y: f.crown[1] + 0.5, r: 1.5, g: 1.25, b: 0.75, rad: 4.2 });
    if (f.exit) lights.push({ x: f.exit[0] + 0.5, y: f.exit[1] + 0.5, r: 0.75, g: 0.8, b: 0.3, rad: 2.8 });
    if (f.throne) lights.push({ x: f.throne[0] + 0.5, y: f.throne[1] + 1, r: 1.6, g: 1.3, b: 0.7, rad: 5 });
    if (f.lever) lights.push({ x: f.lever.x + 0.5 + f.lever.fx * 0.7, y: f.lever.y + 0.5 + f.lever.fy * 0.7, ...(this.leverOn ? { r: 0.2, g: 0.6, b: 0.25 } : { r: 0.6, g: 0.18, b: 0.12 }), rad: 1.6 });
    this.rc.buildLights(f.w, f.h, lights, (x, y) => this.lightSolid(x, y));
  }
  lightSolid(x, y) { const v = this.g.at(x, y); return v === C.WALL || v === C.LEVER || v === C.RUBBLE || (v === C.GATE && this.gateClosed()); }

  // ── The map ────────────────────────────────────────────────
  gateClosed() { return this.gateShut && !this.leverOn; }
  /** can the player stand here? */
  walkable(x, y) {
    const v = this.g.at(x, y);
    if (v === C.GATE) return !this.gateClosed();
    return v === C.OPEN || v === C.ALCOVE || v === C.CRACK;
  }
  guardWalk(x, y) { return this.walkable(x, y); }
  /** can a guard see through here? (bars of a shut gate: yes) */
  seeThrough(x, y) { const v = this.g.at(x, y); return v !== C.WALL && v !== C.LEVER && v !== C.RUBBLE; }

  collide(x, y, r = 0.23) {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      if (this.walkable(xx, yy)) continue;
      const nx = clamp(x, xx, xx + 1), ny = clamp(y, yy, yy + 1);
      if (Math.hypot(x - nx, y - ny) < r) return true;
    }
    const f = this.f;
    if (f.crown && this.collapseT < 0 && Math.hypot(x - f.crown[0] - 0.5, y - f.crown[1] - 0.5) < r + 0.2) return true;   // the pedestal
    if (f.throne && Math.hypot(x - f.throne[0] - 0.5, y - f.throne[1] - 0.5) < r + 0.3) return true;
    for (const [bx, by] of f.braziers) if (Math.hypot(x - bx - 0.5, y - by - 0.5) < r + 0.22) return true;
    return false;
  }

  lineClear(ax, ay, bx, by, smokeBlocks = true) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 5);
    for (let i = 1; i < n; i++) { const t = i / n; if (!this.seeThrough(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false; }
    if (smokeBlocks) for (const sm of this.smokes) if (segDist(ax, ay, bx, by, sm.x, sm.y) < sm.r * 0.9) return false;
    return true;
  }

  // ── Actions ────────────────────────────────────────────────
  use() {
    const s = this.s, f = this.f, p = this.p;
    if (s.state !== 'playing' || this.done || this.caughtFx) return;
    const fx = Math.cos(p.a), fy = Math.sin(p.a);
    const facing = (tx, ty, reach) => { const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); return d < reach && (dx * fx + dy * fy) / (d || 1) > 0.35; };
    if (this.secret && f.throne && facing(f.throne[0] + 0.5, f.throne[1] + 0.5, 1.6)) return this.placeCrown();
    if (f.crown && !this.has && facing(f.crown[0] + 0.5, f.crown[1] + 0.5, 1.35)) return this.grab();
    if (f.lever) {
      const lx = f.lever.x + 0.5 + f.lever.fx * 0.5, ly = f.lever.y + 0.5 + f.lever.fy * 0.5;
      if (facing(lx, ly, 1.25)) {
        if (!this.gateShut) { this.say('The lever won\'t budge… yet.', '#d6d3d1'); s.sound.tone({ freq: 140, dur: 0.12, type: 'square', vol: 0.06 }); return; }
        if (this.leverOn) { this.say('The portcullis is already up.', '#86efac'); return; }
        this.leverOn = true;
        s.award(60 * this.level, VIEW.w / 2, VIEW.y + 170, { color: '#86efac', size: 20 });
        this.say('Clunk! The portcullis grinds up…', '#86efac');
        s.sound.noise({ dur: 0.7, vol: 0.16, freq: 200, type: 'lowpass' }); s.sound.tone({ freq: 90, to: 160, dur: 0.6, type: 'sawtooth', vol: 0.06 });
        s.unlock('lever');
        this.relight();
        return;
      }
    }
    if (f.crown && this.has && !this.secret && facing(f.crown[0] + 0.5, f.crown[1] + 0.5, 1.35)) { this.say('No turning back now — run!', '#fca5a5'); return; }
    this.say(this.has ? 'Run for the stairs! ⇧' : 'Nothing to grab here.', '#a8a29e');
  }

  throwCoin() {
    const s = this.s, p = this.p;
    if (s.state !== 'playing' || this.done || this.caughtFx || this.bonus || this.secret) return;
    if (this.ammo.coin <= 0) { this.say('No coins to throw — pick some up!', '#fde68a'); return; }
    this.ammo.coin--;
    this.thrown.push({ x: p.x, y: p.y, vx: Math.cos(p.a) * 9, vy: Math.sin(p.a) * 9, z: 0.5, vz: 1.6, t: 0, landed: false });
    s.sound.tone({ freq: 1500, to: 2200, dur: 0.06, type: 'triangle', vol: 0.06 });
  }

  dropSmoke() {
    const s = this.s, p = this.p;
    if (s.state !== 'playing' || this.done || this.caughtFx || this.bonus || this.secret) return;
    if (this.ammo.smoke <= 0) { this.say('Out of smoke bombs!', '#d6d3d1'); return; }
    this.ammo.smoke--;
    this.smokes.push({ x: p.x, y: p.y, t: 0, life: 6.5, r: 1.6 });
    s.sound.noise({ dur: 0.9, vol: 0.22, freq: 900, to: 300, type: 'bandpass' });
    s.sound.tone({ freq: 220, to: 70, dur: 0.25, type: 'sine', vol: 0.12 });
    for (const g of this.guards) {
      if (g.dead) continue;
      if (Math.hypot(g.x - p.x, g.y - p.y) < 1.9) { g.stun = 2.6; g.state = 'search'; g.searchT = 3.5; g.target = [Math.floor(g.x), Math.floor(g.y)]; g.sus = 0; }
    }
  }

  /** THE PICKUP: one moment, three things — crown-hand, gold light, every guard alerted. */
  grab() {
    const s = this.s, f = this.f, L = this.level;
    this.has = true;
    this.sealT = f.seal;
    this.grabFx = 1;
    s.award(300 * L, VIEW.w / 2, VIEW.y + 210, { color: '#fde047', size: 26 });
    s.fx.flash('#fde68a', 0.3);
    s.sound.play('powerup');
    s.sound.noise({ dur: 0.6, vol: 0.3, freq: 5000, type: 'highpass' });
    // every guard alerted: they converge on the pedestal and search with wider eyes
    for (const g of this.guards) {
      if (g.dead) continue;
      g.alert = true;
      if (g.state !== 'chase') { g.state = 'look'; g.target = [...f.crown]; g.lure = false; }
    }
    // the gate slams on the short way out
    if (f.gate) {
      this.gateShut = true;
      const d = Math.hypot(f.gate.x + 0.5 - this.p.x, f.gate.y + 0.5 - this.p.y);
      s.sound.noise({ dur: 0.5, vol: 0.32 * Math.max(0.3, 1 - d / 20), freq: 600, type: 'lowpass', delay: 0.35 });
      s.sound.tone({ freq: 90, to: 40, dur: 0.4, type: 'square', vol: 0.12, delay: 0.35 });
      setTimeout(() => { if (this.has && this.gateShut) this.say('CLANG! A portcullis slammed shut somewhere…', '#fca5a5'); }, 400);
    }
    if (f.collapse) { this.collapseT = 0; this.nowRun = 3.2; s.fx.shake(10, 1.2); s.sound.play('boom'); }
    if (f.wraith) this.wraith = { x: f.crown[0] + 0.5, y: f.crown[1] + 0.5, t: 0, on: false, frame: 0, hum: 0 };
    this.relight();
    if (Sound.musicOn) { Sound.startMusic(CHASE); Sound.setTempo(CHASE.bpm + (L - 1) * 2); }
    if (!f.collapse) this.say(L === FINAL ? 'You have the crown. Now run.' : 'The crown is yours — now RUN for the stairs!', '#fde047');
  }

  // ── The world ──────────────────────────────────────────────
  update(dt) {
    const s = this.s;
    this.t += dt;
    if (this.pressed) { this.pressed.t -= dt; if (this.pressed.t <= 0) this.pressed = null; }
    if (this.done) return;
    if (this.caughtFx) { this.caughtFx.t += dt; if (this.caughtFx.t >= this.caughtFx.dur) { this.caughtFx = null; s.hurt(); } return; }
    if (this.grabFx > 0) this.grabFx = Math.max(0, this.grabFx - dt * 1.5);
    if (this.nowRun > 0) this.nowRun -= dt;
    if (this.exitWarn > 0) this.exitWarn -= dt;
    this.movePlayer(dt);
    this.pickups();
    if (this.done) return;
    this.updateThrown(dt);
    this.updateSmoke(dt);
    this.updateCracks(dt);
    if (!this.bonus && !this.secret) {
      this.updateGuards(dt);
      this.updateWraith(dt);
      this.updateCollapse(dt);
      if (this.has && !this.done && !this.caughtFx) {
        this.sealT -= dt;
        this.heartbeat(dt);
        if (this.sealT <= 0) { this.sealT = 0; this.die('sealed'); }
      }
    }
    this.seeT = (this.seeT || 0) - dt;
    if (this.seeT <= 0) { this.seeT = 0.12; this.see(); }
  }

  movePlayer(dt) {
    const s = this.s, inp = s.input, p = this.p, k = this.keys;
    let fwd = (inp.isDown('up') ? 1 : 0) - (inp.isDown('down') ? 1 : 0);
    let turn = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
    let side = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (this.stick) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      fwd += -dz(this.stick.dy); turn += dz(this.stick.dx) * 0.85;
    }
    fwd = clamp(fwd, -1, 1); turn = clamp(turn, -1, 1);
    p.a += turn * 2.5 * dt;
    const sp = (this.has && !this.secret ? SPEED.carry : SPEED.walk) * (fwd < 0 ? 0.65 : 1);
    const cx = Math.cos(p.a), cy = Math.sin(p.a);
    const vx = cx * fwd * sp - cy * side * SPEED.strafe * (this.has ? 0.75 : 1), vy = cy * fwd * sp + cx * side * SPEED.strafe * (this.has ? 0.75 : 1);
    const moving = Math.abs(fwd) + Math.abs(side) > 0.05;
    if (moving) {
      if (!this.collide(p.x + vx * dt, p.y)) p.x += vx * dt;
      if (!this.collide(p.x, p.y + vy * dt)) p.y += vy * dt;
      this.walkT += dt * (this.has ? 7 : 9);
      if (Math.floor(this.walkT / Math.PI) !== Math.floor((this.walkT - dt * (this.has ? 7 : 9)) / Math.PI)) {
        s.sound.noise({ dur: 0.05, vol: this.has ? 0.07 : 0.04, freq: this.has ? 300 : 420, type: 'lowpass' });
        if (this.has && !this.secret && Math.random() < 0.5) s.sound.tone({ freq: 2400 + Math.random() * 600, dur: 0.04, type: 'sine', vol: 0.012 });   // the crown's jewels chink
      }
    }
    this.bob = moving ? Math.sin(this.walkT) * (this.has ? 7 : 5) : this.bob * 0.85;
    this.moving = moving;
    const cell = this.g.at(Math.floor(p.x), Math.floor(p.y));
    const wasHidden = this.hidden;
    this.hidden = cell === C.ALCOVE;
    if (this.hidden && !wasHidden) { s.sound.tone({ freq: 160, dur: 0.25, type: 'sine', vol: 0.05 }); this.say(this.has && this.wraith?.on ? 'Hidden from the guards… not from the Wraith.' : 'Hidden in the shadows…', '#c4b5fd'); }
  }

  pickups() {
    const s = this.s, f = this.f, p = this.p, L = this.level;
    for (const [x, y] of f.coins) {
      const k = x + ',' + y;
      if (this.taken.has(k) || Math.hypot(p.x - x - 0.5, p.y - y - 0.5) > 0.5) continue;
      this.taken.add(k); this.coinsHere++; this.runCoins++;
      s.award((this.bonus ? 12 : 25) * L, VIEW.w / 2, VIEW.y + 250, { chain: true, color: '#fde047', size: 16 });
      s.sound.play('coin', this.coinsHere % 8);
      if (!this.bonus && !this.secret && this.ammo.coin < 6) this.ammo.coin++;
      if (this.bonus && this.coinsHere >= 40) s.unlock('hoard');
    }
    for (const [x, y] of f.chests) {
      const k = 'T' + x + ',' + y;
      if (this.taken.has(k) || Math.hypot(p.x - x - 0.5, p.y - y - 0.5) > 0.55) continue;
      this.taken.add(k);
      s.award((this.bonus ? 150 : 350) * L, VIEW.w / 2, VIEW.y + 220, { color: '#fbbf24', size: 24 });
      s.fx.text(VIEW.w / 2, VIEW.y + 180, 'TREASURE!', { color: '#fbbf24', size: 26 });
      s.sound.play('powerup');
      if (!this.bonus && !this.secret) { this.ammo.smoke = Math.min(3, this.ammo.smoke + 1); this.say('A smoke bomb in the chest! 💨', '#e7e5e4'); }
    }
    if (f.exit && Math.hypot(p.x - f.exit[0] - 0.5, p.y - f.exit[1] - 0.5) < 0.55) {
      if (this.has) this.escape();
      else if (this.exitWarn <= 0) { this.exitWarn = 2.5; this.say('You can\'t leave without the crown!', '#fde68a'); s.sound.tone({ freq: 180, dur: 0.15, type: 'square', vol: 0.05 }); }
    }
  }

  updateThrown(dt) {
    const s = this.s;
    for (const c of this.thrown) {
      if (c.landed) { c.t += dt; continue; }
      c.t += dt; c.vz -= 6 * dt; c.z += c.vz * dt;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
      if (!this.seeThrough(Math.floor(nx), Math.floor(c.y)) || this.g.at(Math.floor(nx), Math.floor(c.y)) === C.GATE && this.gateClosed()) c.vx *= -0.35; else c.x = nx;
      if (!this.seeThrough(Math.floor(c.x), Math.floor(ny)) || this.g.at(Math.floor(c.x), Math.floor(ny)) === C.GATE && this.gateClosed()) c.vy *= -0.35; else c.y = ny;
      if (c.z <= 0) {
        c.z = 0; c.landed = true; c.t = 0;
        const d = Math.hypot(c.x - this.p.x, c.y - this.p.y);
        s.sound.play('coin', 6); s.sound.tone({ freq: 3200, dur: 0.05, type: 'sine', vol: 0.05 * Math.max(0.2, 1 - d / 10), delay: 0.12 });
        // every guard in earshot (that isn't chasing you) goes to look
        const cell = [Math.floor(c.x), Math.floor(c.y)];
        if (!this.walkable(cell[0], cell[1])) continue;
        for (const g of this.guards) {
          if (g.dead || g.state === 'chase' || g.stun > 0) continue;
          if (Math.hypot(g.x - c.x, g.y - c.y) < 7.5) { g.state = 'look'; g.target = cell; g.lure = true; g.sus = Math.max(g.sus, 0.3); }
        }
      }
    }
    this.thrown = this.thrown.filter((c) => !c.landed || c.t < 5);
  }

  updateSmoke(dt) {
    for (const sm of this.smokes) { sm.t += dt; sm.r = Math.min(1.9, 0.6 + sm.t * 2.4); }
    this.smokes = this.smokes.filter((sm) => sm.t < sm.life);
  }

  /** Cracked floors: stable until the crown is taken; then each one gives way once you've crossed it. */
  updateCracks(dt) {
    if (!this.has || this.secret) return;
    const s = this.s, p = this.p, cx = Math.floor(p.x), cy = Math.floor(p.y), i = cy * this.f.w + cx;
    if (this.g.at(cx, cy) === C.CRACK && !this.cracking.has(i)) {
      this.cracking.set(i, { x: cx, y: cy, t: -1 });
      s.sound.noise({ dur: 0.4, vol: 0.14, freq: 500, type: 'lowpass' });
      this.say('The floor is giving way!', '#fca5a5');
    }
    for (const [k, c] of this.cracking) {
      if (c.t < 0) { if (Math.floor(p.x) !== c.x || Math.floor(p.y) !== c.y) c.t = 0.3; continue; }
      c.t -= dt;
      if (c.t > 0) continue;
      this.cracking.delete(k);
      this.g.set(c.x, c.y, C.PIT); this.pitCount = (this.pitCount || 0) + 1;
      s.sound.noise({ dur: 0.8, vol: 0.25, freq: 300, to: 60, type: 'lowpass' }); s.fx.shake(4, 0.3);
      for (const g of this.guards) {
        if (g.dead || Math.floor(g.x) !== c.x || Math.floor(g.y) !== c.y) continue;
        this.guardFalls(g);
      }
      // you were standing on it after all (walked back): fall!
      if (Math.floor(p.x) === c.x && Math.floor(p.y) === c.y) this.die('fall');
    }
  }
  guardFalls(g) {
    const s = this.s;
    g.dead = true; g.deadT = 0;
    s.award(400 * this.level, VIEW.w / 2, VIEW.y + 200, { color: '#fca5a5', size: 22 });
    s.fx.text(VIEW.w / 2, VIEW.y + 160, g.kind === 'knight' ? 'A knight fell through the floor!' : 'A skeleton fell through the floor!', { color: '#fecaca', size: 18, life: 1.4 });
    s.sound.tone({ freq: 500, to: 80, dur: 0.9, type: 'sawtooth', vol: 0.08 });
    s.unlock('pit');
  }

  // ── Guards ─────────────────────────────────────────────────
  /** Distances to a target square for one guard (cached until the target or the map changes). */
  fieldTo(g, tx, ty) {
    const key = tx + ',' + ty + ':' + this.mapRev();
    if (g.fieldKey !== key) { g.field = bfs(this.g, [[tx, ty]], (x, y) => this.guardWalk(x, y)); g.fieldKey = key; }
    return g.field;
  }
  mapRev() { return (this.gateClosed() ? 1 : 0) + ':' + this.cracking.size + ':' + (this.pitCount || 0) + ':' + this.collapsedTo; }
  /** Move a guard one step towards square (tx, ty), ending exactly at point (px, py). Returns true when there. */
  walkTo(g, tx, ty, px, py, speed, dt) {
    const gx = Math.floor(g.x), gy = Math.floor(g.y);
    let goalX = px, goalY = py;
    if (gx !== tx || gy !== ty) {
      const fld = this.fieldTo(g, tx, ty), w = this.f.w, here = fld[gy * w + gx];
      if (here < 0) return null;                                          // can't get there
      let best = null;
      for (const [dx, dy] of DIRS) { const v = fld[(gy + dy) * w + gx + dx]; if (v >= 0 && v < here && (!best || v < best.v)) best = { v, x: gx + dx, y: gy + dy }; }
      if (!best) return null;
      // keep to the middle of corridors: line up on the square's centre before turning
      const ax = gx + 0.5, ay = gy + 0.5;
      if (best.x !== gx && Math.abs(g.y - ay) > 0.08) { goalX = g.x; goalY = ay; }
      else if (best.y !== gy && Math.abs(g.x - ax) > 0.08) { goalX = ax; goalY = g.y; }
      else { goalX = best.x + 0.5; goalY = best.y + 0.5; }
    }
    const dx = goalX - g.x, dy = goalY - g.y, d = Math.hypot(dx, dy), step = speed * dt;
    if (d > 0.001) { g.va = Math.atan2(dy, dx); g.a += clamp(angDiff(g.va, g.a), -7 * dt, 7 * dt); }
    if (d <= step) { g.x = goalX; g.y = goalY; return gx === tx && gy === ty && d <= step; }
    g.x += dx / d * step; g.y += dy / d * step;
    g.moved = true;
    return false;
  }

  canSee(g) {
    const p = this.p, T = GUARD[g.kind], dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
    if (this.hidden) return d < 0.8;
    const range = T.range + (g.alert ? 1.2 : 0) + (this.has ? 1.0 : 0); // crown-carry range bonus reduced (was 1.5)
    if (d > range) return false;
    if (d > 1.15 && Math.abs(angDiff(Math.atan2(dy, dx), g.a)) > T.cone + (g.alert ? 0.15 : 0)) return false;
    return this.lineClear(g.x, g.y, p.x, p.y);
  }

  updateGuards(dt) {
    const s = this.s, p = this.p, L = this.level;
    for (const g of this.guards) {
      if (g.dead) { g.deadT += dt; continue; }
      const T = GUARD[g.kind];
      g.moved = false;
      if (g.stun > 0) { g.stun -= dt; g.a += dt * 3; continue; }
      // ── look
      const seen = this.canSee(g), d = Math.hypot(p.x - g.x, p.y - g.y);
      if (seen) {
        g.seeT = 0; g.last = [p.x, p.y];
        const rate = (1 / (0.42 + d * 0.13)) * (g.alert ? 1.6 : 1) * (this.has ? 1.10 : 1) * (this.moving ? 1 : 0.6); // crown suspicion multiplier eased (was 1.35)
        if (g.state !== 'chase') g.sus = Math.min(1, g.sus + rate * dt);
      } else {
        g.seeT += dt;
        if (g.state !== 'chase' && g.state !== 'look') g.sus = Math.max(0, g.sus - dt * 0.3);
      }
      if (g.state !== 'chase' && g.sus >= 1) this.startChase(g);
      // a little suspicious: stop and turn towards you
      const curious = g.state !== 'chase' && g.sus > 0.25 && seen;
      // ── act
      if (g.state === 'chase') {
        if (g.seeT > 0) {
          // lost sight: hurry to where you were last seen, then search
          if (!g.lost) { g.lost = { at: [Math.floor(g.last[0]), Math.floor(g.last[1])], smoke: this.smokes.some((sm) => segDist(g.x, g.y, p.x, p.y, sm.x, sm.y) < sm.r) && this.lineClear(g.x, g.y, p.x, p.y, false) }; }
          const r = this.walkTo(g, g.lost.at[0], g.lost.at[1], g.lost.at[0] + 0.5, g.lost.at[1] + 0.5, T.run, dt);
          if (r !== false || g.seeT > 4) {
            if (g.lost.smoke) s.unlock('smoke');
            g.state = 'search'; g.searchT = 3.5; g.target = g.lost.at; g.lost = null; g.sus = 0.4;
          }
        } else {
          g.lost = null;
          const r = this.walkTo(g, Math.floor(p.x), Math.floor(p.y), p.x, p.y, T.run, dt);
          if (r === null) { g.a += clamp(angDiff(Math.atan2(p.y - g.y, p.x - g.x), g.a), -6 * dt, 6 * dt); }
        }
      } else if (curious) {
        g.a += clamp(angDiff(Math.atan2(p.y - g.y, p.x - g.x), g.a), -3 * dt, 3 * dt);
      } else if (g.state === 'look') {
        const [tx, ty] = g.target;
        const r = this.walkTo(g, tx, ty, tx + 0.5, ty + 0.5, g.alert ? T.alert : T.walk * 1.15, dt);
        if (r !== false) {
          if (g.lure && r) { s.unlock('decoy'); s.award(80 * L); }
          g.lure = false; g.state = 'search'; g.searchT = g.alert ? 4.5 : 3; g.sus = Math.min(g.sus, 0.5);
        }
      } else if (g.state === 'search') {
        g.searchT -= dt;
        g.a += Math.sin(this.t * 1.7 + g.i) * dt * 2.2;                    // looking around
        if (g.searchT <= 0) g.state = 'return';
      } else if (g.state === 'return' || g.state === 'patrol') {
        if (g.sentry) {
          const [x, y] = g.route[0];
          if (this.walkTo(g, x, y, x + 0.5, y + 0.5, T.walk, dt) !== false) { g.state = 'patrol'; g.a += dt * (g.alert ? 0.9 : 0.55); }
        } else {
          let tries = 0;
          while (tries++ < g.route.length) {
            const [x, y] = g.route[g.ri];
            const r = this.walkTo(g, x, y, x + 0.5, y + 0.5, g.alert ? T.alert : T.walk, dt);
            if (r === null) { g.ri = (g.ri + 1) % g.route.length; continue; }   // blocked (gate, pit): skip ahead
            if (r) { g.ri = (g.ri + 1) % g.route.length; g.state = 'patrol'; }
            break;
          }
        }
      }
      // ── footsteps (louder when close, from the side they're on, muffled behind walls)
      if (g.moved) {
        g.frame += dt * (g.state === 'chase' ? 4 : 2.4);
        g.stepT -= dt;
        if (g.stepT <= 0) {
          g.stepT = g.state === 'chase' ? 0.28 : 0.46;
          if (d < 9) {
            let rel = Math.atan2(g.y - p.y, g.x - p.x) - p.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
            const pan = Math.sin(rel) * 0.85, vol = 0.15 * Math.pow(1 - d / 9, 1.4), clear = this.lineClear(p.x, p.y, g.x, g.y, false);
            if (g.kind === 'knight') { s.sound.tone({ freq: clear ? 900 : 500, to: 600, dur: 0.06, type: 'triangle', vol: vol * 0.6, pan }); s.sound.noise({ dur: 0.05, vol: vol * 0.7, freq: clear ? 2400 : 900, type: 'bandpass', pan }); }
            else { s.sound.noise({ dur: 0.05, vol, freq: clear ? 3200 : 1100, type: 'bandpass', pan }); s.sound.tone({ freq: 420 + (g.i * 37) % 160, dur: 0.03, type: 'triangle', vol: vol * 0.35, pan, delay: 0.035 }); }
          }
        }
      }
      // ── caught?
      if (d < 0.55 && !this.caughtFx && !this.done) { this.die(g.kind); return; }
    }
  }
  startChase(g) {
    const s = this.s;
    g.state = 'chase'; g.sus = 1; g.lost = null;
    if (!this.spotted) this.spotted = true;
    s.sound.tone({ freq: 880, to: 1320, dur: 0.12, type: 'square', vol: 0.08 });
    s.sound.tone({ freq: 660, dur: 0.18, type: 'square', vol: 0.06, delay: 0.12 });
    if (g.kind === 'knight') s.sound.noise({ dur: 0.3, vol: 0.1, freq: 1800, type: 'bandpass' });
    this.say(g.kind === 'knight' ? 'A KNIGHT HAS SEEN YOU — RUN!' : 'SPOTTED! A skeleton is after you!', '#f87171');
    // the shout carries: nearby guards come to look
    for (const o of this.guards) {
      if (o === g || o.dead || o.state === 'chase' || Math.hypot(o.x - g.x, o.y - g.y) > 6) continue;
      o.state = 'look'; o.target = [Math.floor(this.p.x), Math.floor(this.p.y)]; o.lure = false; o.sus = Math.max(o.sus, 0.5);
    }
  }

  /** The Crown Wraith: wakes after the crown is lifted (floors 11-15) and drifts straight at its light — through walls. */
  updateWraith(dt) {
    const w = this.wraith, s = this.s, p = this.p;
    if (!w) return;
    w.t += dt; w.frame += dt * 3;
    if (!w.on) {
      if (w.t < WRAITH_WAKE) return;
      w.on = true;
      this.say('The Crown Wraith wakes… it follows the crown\'s light.', '#67e8f9');
      s.sound.tone({ freq: 110, to: 55, dur: 1.6, type: 'sawtooth', vol: 0.09 }); s.sound.noise({ dur: 1.4, vol: 0.12, freq: 700, to: 200, type: 'bandpass' });
    }
    const dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy);
    const slow = this.smokes.some((sm) => Math.hypot(sm.x - w.x, sm.y - w.y) < sm.r) ? 0.55 : 1;
    if (d > 0.01) { w.x += dx / d * this.f.wraithSpeed * slow * dt; w.y += dy / d * this.f.wraithSpeed * slow * dt; }
    w.hum -= dt;
    if (w.hum <= 0 && d < 10) {
      w.hum = 0.9;
      let rel = Math.atan2(w.y - p.y, w.x - p.x) - p.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      s.sound.tone({ freq: 140 + Math.random() * 20, to: 120, dur: 0.8, type: 'sine', vol: 0.07 * (1 - d / 10), pan: Math.sin(rel) * 0.8 });
    }
    if (d < 0.6 && !this.caughtFx) this.die('wraith');
  }

  /** Floor 15: the vault falls in, spreading out from the empty pedestal. */
  updateCollapse(dt) {
    const f = this.f;
    if (this.collapseT < 0) return;
    this.collapseT += dt;
    const reach = (this.collapseT - f.collapseDelay) * f.collapseSpeed;
    if (Math.floor(reach) <= this.collapsedTo) { if (Math.random() < dt * 3) this.s.fx.shake(3, 0.2); return; }
    const to = Math.floor(reach), D = f.collapseDist;
    let any = false;
    for (let i = 0; i < D.length; i++) {
      if (D[i] < 0 || D[i] > to || D[i] <= this.collapsedTo) continue;
      const x = i % f.w, y = (i / f.w) | 0;
      if (this.g.at(x, y) === C.WALL) continue;
      this.g.set(x, y, C.RUBBLE); any = true;
      for (const g of this.guards) if (!g.dead && Math.floor(g.x) === x && Math.floor(g.y) === y) { g.dead = true; g.deadT = 0; }
      if (Math.floor(this.p.x) === x && Math.floor(this.p.y) === y) this.die('crushed');
    }
    this.collapsedTo = to;
    if (any) {
      this.s.sound.noise({ dur: 0.7, vol: 0.28, freq: 260, to: 50, type: 'lowpass' });
      this.s.fx.shake(7, 0.45);
      if (this.t - (this.lastRelight || 0) > 0.45) { this.lastRelight = this.t; this.relight(); }
    }
  }

  heartbeat(dt) {
    const s = this.s, chased = this.guards.some((g) => !g.dead && g.state === 'chase');
    const urgency = Math.max(1 - this.sealT / this.f.seal, chased ? 0.7 : 0, this.wraith?.on ? 0.5 + 0.5 * Math.max(0, 1 - Math.hypot(this.wraith.x - this.p.x, this.wraith.y - this.p.y) / 6) : 0);
    this.beatT -= dt;
    if (this.beatT <= 0) {
      this.beatT = 0.9 - urgency * 0.5;
      s.sound.tone({ freq: 62, to: 40, dur: 0.12, type: 'sine', vol: 0.22 + urgency * 0.15 });
      s.sound.tone({ freq: 56, to: 36, dur: 0.12, type: 'sine', vol: 0.15 + urgency * 0.1, delay: 0.16 });
      if (this.sealT < 10 && this.sealT > 0) s.sound.play('tick');
    }
    if (Sound.musicOn) Sound.setTempo(CHASE.bpm + (this.level - 1) * 2 + urgency * 26);
  }

  /** Mark what you can see on the map. */
  see() {
    const p = this.p, f = this.f;
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < f.w && y < f.h) this.seen[y * f.w + x] = 1; };
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) mark(Math.floor(p.x) + xx, Math.floor(p.y) + yy);
    for (let k = 0; k < 40; k++) {
      const a = p.a + (k / 40 - 0.5) * 2.2, dx = Math.cos(a), dy = Math.sin(a);
      for (let r = 0.3; r < 7; r += 0.35) {
        const x = Math.floor(p.x + dx * r), y = Math.floor(p.y + dy * r);
        mark(x, y);
        if (!this.seeThrough(x, y)) break;
      }
    }
  }

  say(text, color = '#e7e5e4') { this.msg = { text, color, t: 2 }; }

  // ── Endings ────────────────────────────────────────────────
  escape() {
    const s = this.s, L = this.level, f = this.f;
    this.done = true;
    const left = Math.floor(this.sealT);
    if (left > 0) s.award(left * 15 * L, VIEW.w / 2, VIEW.y + 230, { color: '#86efac', size: 20 });
    if (!this.spotted) { s.award(500 * L, VIEW.w / 2, VIEW.y + 190, { color: '#c4b5fd', size: 24 }); s.fx.text(VIEW.w / 2, VIEW.y + 120, '👻 GHOST — never seen!', { color: '#c4b5fd', size: 24, life: 1.6 }); if (L >= 3) s.unlock('ghost'); }
    s.fx.text(VIEW.w / 2, VIEW.y + 155, L === FINAL ? 'THE CROWN OF THE CRYPT KINGS IS YOURS!' : 'ESCAPED WITH THE CROWN!', { color: '#fde047', size: L === FINAL ? 22 : 28, life: 1.6 });
    s.sound.noise({ dur: 0.5, vol: 0.12, freq: 700, type: 'bandpass' });
    if (this.wraith?.on) s.unlock('wraith');
    if (Sound.musicOn) { Sound.startMusic(CALM); Sound.setTempo(CALM.bpm); }
    if (L === FINAL) {
      s.unlock('heist');
      if (s.isFlawless()) {
        // flawless: the egg is safe now, and floor 16 opens
        const had = Legends.hasGoldenCrown();
        Legends.grant(ID);
        for (const n of Legends.eggs()) s.unlock(`crown${n}`, true);
        s.unlock('legend', true);
        Legends.syncCrowns();
        this.crownWonEarly = !had && Legends.hasGoldenCrown();
        s.completeLevel();
      } else {
        // the egg — however many visits it took
        s.addScore(L * 200);
        this.startFinale(false);
      }
      return;
    }
    s.completeLevel();
  }

  placeCrown() {
    const s = this.s, f = this.f;
    // step back to watch the crown settle on the throne
    this.p.x = f.throne[0] + 0.5; this.p.y = f.throne[1] + 3.3; this.p.a = -Math.PI / 2;
    s.unlock('throne');
    this.startFinale(true);
  }

  startFinale(throne) {
    const s = this.s;
    this.done = true;
    this.finale = { t: 0, note: 0, nextNote: 1.0, sparkT: 0, throne };
    s.award(throne ? 10000 : 5000, VIEW.w / 2, VIEW.y + 200, { color: '#fde047', size: 30 });
    s.sound.noise({ dur: 0.6, vol: 0.35, freq: 6000, type: 'highpass' });
    s.sound.play('powerup');
    s.fx.flash('#fde68a', 0.3);
    s.legendFound();
    if (this.crownWonEarly && !s.crownWon) { s.crownWon = true; s.unlock('grand', true); applyTheme(); }
  }

  idle(dt) {
    this.t += dt;
    if (this.pressed) { this.pressed.t -= dt; if (this.pressed.t <= 0) this.pressed = null; }
    const f = this.finale, s = this.s;
    if (!f) return;
    f.t += dt;
    const tune = [72, 76, 79, 84, 83, 79, 76, 77, 81, 84, 88, 86, 84, 83, 79, 84];
    f.nextNote -= dt;
    if (f.nextNote <= 0) {
      const n = tune[f.note % tune.length];
      s.sound.tone({ freq: s.sound.note(n), dur: 1.0, type: 'sine', vol: 0.12 });
      s.sound.tone({ freq: s.sound.note(n - 12), dur: 0.6, type: 'triangle', vol: 0.04 });
      f.note++; f.nextNote = f.note % 4 === 3 ? 0.7 : 0.36;
    }
    f.sparkT -= dt;
    if (f.t > 1 && f.sparkT <= 0) {
      f.sparkT = 0.08;
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 90;
      s.fx.burst(W / 2 + Math.cos(a) * r, VIEW.y + 180 + Math.sin(a) * r * 0.7, { colors: ['#fde68a', '#fff', '#fbbf24'], count: 2, speed: 30, life: 0.9, size: 3 });
    }
  }

  die(cause) {
    const s = this.s;
    if (this.caughtFx || this.done) return;
    const words = { skeleton: 'CAUGHT BY A SKELETON!', knight: 'CAUGHT BY A KNIGHT!', wraith: 'THE WRAITH TOOK THE CROWN!', sealed: 'THE VAULT IS SEALED!', fall: 'THE FLOOR GAVE WAY!', crushed: 'CRUSHED BY THE FALLING VAULT!' };
    s.fx.text(VIEW.w / 2, VIEW.y + 170, words[cause], { color: cause === 'wraith' ? '#67e8f9' : '#fecaca', size: 22, life: 1.3 });
    if (cause === 'skeleton' || cause === 'knight' || cause === 'wraith') {
      s.sound.noise({ dur: 0.3, vol: 0.25, freq: 2500, to: 400, type: 'bandpass' });
      s.sound.tone({ freq: 180, to: 60, dur: 0.6, type: 'sawtooth', vol: 0.12 });
    } else { s.sound.play('boom'); }
    s.fx.shake(12, 0.6);
    this.caughtFx = { kind: cause, t: 0, dur: cause === 'sealed' ? 1.0 : 0.8 };
    if (Sound.musicOn) Sound.stopMusic();
  }

  onLifeLost() { this.caughtFx = null; this.attempt(); }
  onLevelClear() {}
  onGameOver() { if (Sound.musicOn) Sound.stopMusic(); }
  onDetailChange() {}

  /** After floor 3: seal your progress with a code (only if you don't have one yet). */
  beforeNextLevel(level) {
    const s = this.s;
    if (level !== 3 || this.bonus) return undefined;
    if (!Legends.canIssue()) {
      if (Legends.myCode()) s.fx.text(W / 2, H * 0.6, `🔐 Progress sealed to ${Legends.myCode()}`, { color: '#fde68a', size: 16, life: 2 });
      return undefined;
    }
    return new Promise((resolve) => {
      const prev = s.state;
      s.state = 'sealing';
      const done = () => { s.hideOverlay(); s.state = prev; resolve(); };
      const o = s.showOverlay(`
        <h2>🔐 Seal your progress</h2>
        <p class="muted">Three floors down. The vault can seal your progress with a code — enter it on the <b>🏛️ Legends</b> page on any phone or computer to carry on from where you left off. It keeps your progress in <b>every</b> game.</p>
        <form class="name-form" autocomplete="off">
          <input name="n" maxlength="12" placeholder="Your name" value="${esc(Legends.myName() || '')}" aria-label="Your name" enterkeyhint="done">
          <button class="btn primary" type="submit">Seal it</button>
        </form>
        <p class="form-msg" aria-live="polite"></p>
        <button class="btn" data-skip>Not now ▶</button>`);
      const form = o.querySelector('form'), msg = o.querySelector('.form-msg');
      o.querySelector('[data-skip]').onclick = done;
      form.n.focus({ preventScroll: true });
      form.onsubmit = async (e) => {
        e.preventDefault();
        form.querySelector('button').disabled = true; msg.className = 'form-msg'; msg.textContent = 'Sealing…';
        try {
          const code = await Legends.issueCode(form.n.value.trim());
          s.sound.play('achieve');
          const p = s.showOverlay(`
            <h2>🔐 Sealed</h2>
            <p>Your progress has been sealed. Enter this code when you return.</p>
            <p class="legend-code"><b>${esc(code)}</b></p>
            <p class="muted small">It's an ordinary Legend code: enter it on the 🏛️ Legends page on any device. Win the Golden Throne Egg and sign the Hall with the same name, and the egg goes on this code too.</p>
            <button class="btn primary big" data-go>▶ Floor 4</button>`);
          const go = p.querySelector('[data-go]'); go.onclick = done; go.focus({ preventScroll: true });
        } catch (err) {
          form.querySelector('button').disabled = false;
          msg.className = 'form-msg err'; msg.textContent = err.message || 'Could not seal — try again.';
        }
      };
    });
  }

  // ── Drawing ────────────────────────────────────────────────
  cellTex(x, y) {
    const v = this.g.at(x, y), look = this.look3;
    if (v === C.WALL || v === C.LEVER) return this.f.treasure && this.level === 5 ? VAULT : WALL[look];
    if (v === C.GATE) return this.gateClosed() ? GATE : 0;
    if (v === C.RUBBLE) return RUBBLE;
    return 0;
  }
  floorOf(x, y) {
    const v = this.g.at(x, y), look = this.look3, f = this.f;
    if (f.treasure) return FL.gold;
    if (v === C.PIT) return FL.pit;
    if (v === C.CRACK) return look === 'sand' ? FL.crackSand : look === 'marble' ? FL.crackMarble : FL.crackThrone;
    if (v === C.ALCOVE) return look === 'sand' ? FL.nookSand : look === 'marble' ? FL.nookMarble : FL.nookThrone;
    if (v === C.RUBBLE) return FL.rubble;
    if (look === 'throne') {
      if (f.secret && x === f.start[0]) return FL.carpet;
      const r = f.rooms[f.crownRoom];
      if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && (x === f.crown[0] || y === f.crown[1])) return FL.carpet;
    }
    return FL[look];
  }

  camera() {
    const p = this.p;
    // stand a touch back so walls aren't pressed against your nose
    return { x: p.x - Math.cos(p.a) * 0.12, y: p.y - Math.sin(p.a) * 0.12, a: p.a, bob: this.bob };
  }

  render(ctx) {
    const s = this.s, t = this.t, f = this.f, lo = s.lowDetail, spr = this.spr;
    dropControls(s.bands);
    // real time since the last frame for the render-side decays below (was a fixed 1/60; stops while paused)
    const now = performance.now(), rdt = this.s.state === 'playing' ? Math.min(0.05, (now - (this.rtPrev || now)) / 1000) : 0; this.rtPrev = now;
    this.rdt = rdt;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    const cam = this.camera();
    // moving lights: guards' torch beams, the crown's glow, the Wraith's cold light
    const dyn = [];
    if (this.has) dyn.push({ x: this.p.x, y: this.p.y, r: 1.15, g: 0.82, b: 0.32, rad: 3.4 + Math.sin(t * 5) * 0.15 });
    for (const g of this.guards) {
      if (g.dead || Math.hypot(g.x - this.p.x, g.y - this.p.y) > 15) continue;
      const T = GUARD[g.kind], k = g.state === 'chase' ? 1.25 : 1;
      dyn.push({ x: g.x, y: g.y, r: T.light[0] * k, g: T.light[1] * k, b: T.light[2] * k, rad: T.rad + (g.alert ? 0.6 : 0), dir: g.a, cone: T.cone + 0.12 + (g.alert ? 0.15 : 0) });
      dyn.push({ x: g.x, y: g.y, r: 0.5, g: 0.26, b: 0.1, rad: 1.4 });                   // the torch itself
    }
    if (this.wraith?.on) dyn.push({ x: this.wraith.x, y: this.wraith.y, r: 0.25, g: 0.75, b: 0.85, rad: 2.6 });
    for (const sm of this.smokes) dyn.push({ x: sm.x, y: sm.y, r: 0.08, g: 0.08, b: 0.1, rad: 1 });
    this.rc.moveLights(dyn, (x, y) => this.lightSolid(x, y), this.level + ':' + this.mapRev());   // cached per map state

    const sprites = [];
    const add = (x, y, sp, o) => sprites.push({ x, y, data: sp.data, glow: sp.glow, ...o });
    for (const [x, y] of f.coins) if (!this.taken.has(x + ',' + y)) add(x + 0.5, y + 0.5, spr.coin, { scale: 0.6, lift: Math.sin(t * 3 + x) * 0.02, wide: 0.2 + 0.8 * Math.abs(Math.cos(t * 2.6 + x + y)), minLight: 0.35 });
    for (const [x, y] of f.chests) if (!this.taken.has('T' + x + ',' + y)) add(x + 0.5, y + 0.5, spr.chest, { scale: 0.6, minLight: 0.3 });
    for (const [x, y] of f.braziers) add(x + 0.5, y + 0.5, spr.brazier[Math.floor(t * 9 + x) % 3], { scale: 0.9, minLight: 0.4 });
    if (f.exit) add(f.exit[0] + 0.5, f.exit[1] + 0.5, spr.exit, { scale: 1, minLight: 0.5 });
    if (f.crown && this.g.at(f.crown[0], f.crown[1]) !== C.RUBBLE) {
      add(f.crown[0] + 0.5, f.crown[1] + 0.5, spr.pedestal, { scale: 1, minLight: 0.35 });
      if (!this.has) add(f.crown[0] + 0.5, f.crown[1] + 0.5, this.level === FINAL ? spr.crown : spr.lesser, { scale: 0.42, minLight: 0.95, lift: 0.5 + Math.sin(t * 2) * 0.025 });
    }
    if (f.throne) {
      add(f.throne[0] + 0.5, f.throne[1] + 0.5, spr.throne, { scale: 1.1, minLight: 0.5 });
      if (this.finale) add(f.throne[0] + 0.5, f.throne[1] + 0.6, spr.crown, { scale: 0.36, minLight: 1, lift: 0.5 });
    }
    for (const c of this.thrown) add(c.x, c.y, spr.coin, { scale: 0.35, lift: c.z * 0.6, minLight: 0.6 });
    for (const g of this.guards) {
      if (g.dead) continue;
      const fr = Math.floor(g.frame) % 2, img = g.kind === 'knight' ? spr.knight[fr] : spr.skeleton[fr];
      add(g.x, g.y, img, { scale: g.kind === 'knight' ? 0.95 : 0.9, minLight: 0.28, lift: g.state === 'chase' ? Math.abs(Math.sin(g.frame * 3)) * 0.03 : 0 });
    }
    if (this.wraith?.on) { const w = this.wraith; add(w.x, w.y, spr.wraith[Math.floor(w.frame) % 2], { scale: 1, minLight: 0.2, alpha: 0.78, lift: 0.08 + Math.sin(t * 2.2) * 0.05 }); }
    for (const sm of this.smokes) {
      const a = Math.min(1, sm.t * 3) * Math.min(1, (sm.life - sm.t) / 1.5);
      for (let i = 0; i < 4; i++) { const an = i * 1.6 + sm.t * 0.4; add(sm.x + Math.cos(an) * sm.r * 0.45, sm.y + Math.sin(an) * sm.r * 0.45, spr.smoke, { scale: 0.9 + sm.r * 0.25, minLight: 0.5, alpha: 0.5 * a, lift: -0.05 }); }
    }

    // wall and floor textures per square only change with the map (gate, cracks, pits, collapse) —
    // rebuilt then, not every frame
    const W2 = f.w, H2 = f.h, idsKey = this.mapRev() + '|' + this.look3;
    if (this.idsFor !== this.g || this.idsKey !== idsKey || !this.ids || this.ids.length !== W2 * H2) {
      if (!this.ids || this.ids.length !== W2 * H2) { this.ids = new Int16Array(W2 * H2); this.fmap = new Uint8Array(W2 * H2); }
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { this.ids[y * W2 + x] = this.cellTex(x, y); this.fmap[y * W2 + x] = this.floorOf(x, y); }
      this.idsFor = this.g; this.idsKey = idsKey;
    }
    const ids = this.ids, fm = this.fmap;
    const look = this.look3;
    const L = {
      sand:   { light: 6.5, amb: [0.07, 0.055, 0.04], fog: [12, 8, 4], fogDist: 9 },
      marble: { light: 7, amb: [0.08, 0.07, 0.05], fog: [16, 12, 6], fogDist: 10 },
      throne: { light: 6.5, amb: [0.06, 0.035, 0.04], fog: [10, 3, 5], fogDist: 9 },
    }[look];
    const alarm = this.has && !this.secret ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
    const amb = f.treasure || f.secret ? [0.16, 0.12, 0.07] : [L.amb[0] + alarm * 0.04, L.amb[1], L.amb[2]];
    const flick = 0.9 + 0.06 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 17.9 + 2) + 0.03 * Math.sin(t * 31.7);
    const base = this.cellTex === undefined ? 0 : WALL[look];
    this.rc.setRes(lo ? 240 : 360);
    this.rc.render(ctx, cam, {
      ids, mapW: W2, mapH: H2, tex: this.tex, floor: this.floorTex[FL[look]] || this.floorTex[0], ceil: this.ceils[look], floorMap: fm, floorTex: this.floorTex,
      faceTex: (x, y, fx, fy, id) => {
        const v = this.g.at(x, y);
        if (v === C.LEVER && f.lever && fx === f.lever.fx && fy === f.lever.fy) return LEVER[look][this.leverOn ? 1 : 0];
        if (id !== base && id !== VAULT) return id;
        if (this.g.at(x + fx, y + fy) === C.ALCOVE) return ALCOVE[look];
        const k = this.faceKey(x, y, fx, fy);
        if (this.sconces.has(k)) return SCONCE[look] + Math.floor(t * 9 + x * 7 + y * 3) % 3;
        if (this.banners.has(k)) return BANNER[look];
        return id;
      },
      light: this.has && !this.secret ? 7.5 : L.light, fogDist: L.fogDist, ambient: amb, fogCol: L.fog, flicker: flick,
      torch: (this.has ? [1.0, 0.82, 0.42] : s.gold ? [0.95, 0.8, 0.45] : [0.88, 0.66, 0.46]).map((v) => v * (0.93 + flick * 0.07) * (this.hidden ? 0.45 : 1)),
      sprites,
    });
    if (!lo) { this.drawDust(ctx, flick); if (this.has && !this.secret) this.drawGlints(ctx); }
    this.drawMarkers(ctx, cam);
    if (this.smokes.some((sm) => Math.hypot(sm.x - this.p.x, sm.y - this.p.y) < sm.r)) { ctx.fillStyle = 'rgba(160,160,170,.42)'; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); }
    // the hand: torch while sneaking, crown once it's taken
    if (!this.finale || !this.secret) {
      const sway = this.moving ? Math.sin(this.walkT) * 7 : Math.sin(t * 1.6) * 1.5;
      if (this.has && !this.finale) drawCrownHand(ctx, VIEW, this.level >= FINAL ? spr.crownCanvas : spr.lesserCanvas, { t, sway, gold: s.gold, big: this.level >= FINAL, dip: this.grabFx * 60 });
      else if (!this.finale) drawTorchHand(ctx, VIEW, { t, flick, gold: s.gold, sway, size: this.hidden ? 0.45 : 1 });
    }
    if (this.grabFx > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(W / 2, VIEW.y + VIEW.h * 0.7, 10, W / 2, VIEW.y + VIEW.h * 0.7, 380);
      gr.addColorStop(0, `rgba(255,220,120,${0.6 * this.grabFx})`); gr.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.restore();
    }
    if (alarm && !this.done) {
      ctx.save();
      const gr = ctx.createRadialGradient(W / 2, VIEW.y + VIEW.h / 2, VIEW.h * 0.35, W / 2, VIEW.y + VIEW.h / 2, VIEW.h * 0.85);
      gr.addColorStop(0, 'rgba(200,20,20,0)'); gr.addColorStop(1, `rgba(200,20,20,${0.08 + 0.12 * alarm * (this.sealT < 10 ? 2 : 1)})`);
      ctx.fillStyle = gr; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.restore();
    }
    if (this.hidden) { ctx.fillStyle = 'rgba(20,6,40,.35)'; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); }
    if (this.collapseT >= 0 && !lo) this.drawRockfall(ctx);
    if (this.caughtFx) this.drawCaught(ctx);
    this.drawVignette(ctx);
    if (this.nowRun > 0) this.drawNowRun(ctx);
    if (this.finale) this.drawFinale(ctx);
    if (this.has && !this.secret && !this.done && f.exit) this.drawCompass(ctx);
    this.drawHud(ctx);
    this.drawPanel(ctx);
  }

  /** Dust falling slowly through the torchlight. */
  drawDust(ctx, flick) {
    const dt = this.rdt ?? 1 / 60, heavy = this.collapseT >= 0 ? 3 : 1;
    ctx.save();
    for (const d of this.dust) {
      d.y += d.v * dt * 0.35 * heavy; d.x += Math.sin(this.t * 0.6 + d.p) * 0.12;
      if (d.y > VIEW.y + VIEW.h) { d.y = VIEW.y; d.x = Math.random() * VIEW.w; }
      const near = 1 - Math.min(1, Math.hypot(d.x - 380, d.y - (VIEW.y + 330)) / 330);
      ctx.globalAlpha = (0.12 + near * 0.5) * (0.6 + 0.4 * Math.sin(this.t * 2 + d.p)) * flick;
      ctx.fillStyle = this.has ? '#ffe9a8' : '#ffe2b0'; ctx.fillRect(d.x, d.y, d.r, d.r);
    }
    ctx.restore();
  }

  /** Gold glinting off nearby walls while you hold the crown. */
  drawGlints(ctx) {
    const rc = this.rc, rw = rc.rw, rh = rc.rh, sx = VIEW.w / rw, sy = VIEW.h / rh;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const seed = Math.floor(this.t * 3) * 7 + i, c = Math.floor(((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 * rw);
      const dist = rc.zbuf[c];
      if (!(dist < 3.2)) continue;
      const lh = rh / dist, top = rh / 2 + this.bob * rh / VIEW.h - lh / 2;
      const v = ((Math.sin(seed * 78.233) * 12345.678) % 1 + 1) % 1, life = (this.t * 3) % 1, a = Math.sin(life * Math.PI) * (1 - dist / 3.2);
      const x = VIEW.x + c * sx, y = VIEW.y + (top + lh * (0.15 + v * 0.7)) * sy, r = 3 + 5 * a;
      ctx.fillStyle = `rgba(255,236,170,${0.85 * a})`;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + 1.2, y - 1.2); ctx.lineTo(x + r, y); ctx.lineTo(x + 1.2, y + 1.2); ctx.lineTo(x, y + r); ctx.lineTo(x - 1.2, y + 1.2); ctx.lineTo(x - r, y); ctx.lineTo(x - 1.2, y - 1.2); ctx.fill();
    }
    ctx.restore();
  }

  /** ? and ! over guards who've noticed something. */
  drawMarkers(ctx, cam) {
    const rc = this.rc;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const g of this.guards) {
      if (g.dead) continue;
      const mark = g.state === 'chase' ? '!' : g.stun > 0 ? '✦' : g.sus > 0.2 || g.state === 'look' ? '?' : null;
      if (!mark) continue;
      const pr = rc.project(cam, g.x, g.y, 1.12);
      if (!pr) continue;
      const tY = VIEW.h / pr[2], col = Math.floor((pr[0] - VIEW.x) / VIEW.w * rc.rw);
      if (col < 0 || col >= rc.rw || tY > rc.zbuf[col] + 0.2) continue;
      const sz = clamp(pr[2] * 0.3, 14, 40);
      ctx.font = `900 ${sz}px system-ui`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(mark, pr[0], pr[1]);
      ctx.fillStyle = mark === '!' ? '#ef4444' : mark === '✦' ? '#e5e7eb' : '#facc15'; ctx.fillText(mark, pr[0], pr[1]);
      if (mark === '?' && g.state !== 'look') {                       // suspicion meter
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(pr[0] - 17, pr[1] + sz * 0.55, 34, 7);
        ctx.fillStyle = '#facc15'; ctx.fillRect(pr[0] - 16, pr[1] + sz * 0.55 + 1, 32 * g.sus, 5);
      }
    }
    ctx.restore();
  }

  drawRockfall(ctx) {
    const t = this.t;
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const k = ((t * (0.6 + (i % 5) * 0.13) + i * 0.37) % 1), x = VIEW.x + ((i * 97) % 470) + Math.sin(i * 3) * 6, y = VIEW.y + k * VIEW.h;
      const s2 = 3 + (i % 4) * 2;
      ctx.globalAlpha = 0.75 * (1 - k * 0.5);
      ctx.fillStyle = i % 3 ? '#7c6a55' : '#a08a6e';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s2, y + s2 * 0.4); ctx.lineTo(x + s2 * 0.6, y + s2 * 1.2); ctx.lineTo(x - s2 * 0.4, y + s2 * 0.8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawCaught(ctx) {
    const c = this.caughtFx, k = Math.min(1, c.t / c.dur);
    ctx.save();
    ctx.beginPath(); ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.clip();
    const img = c.kind === 'skeleton' ? this.spr.skeletonCanvas : c.kind === 'knight' ? this.spr.knightCanvas : c.kind === 'wraith' ? this.spr.wraithCanvas : null;
    if (img) {
      const sz = 160 + k * k * 520, cx = VIEW.w / 2, cy = VIEW.y + VIEW.h * 0.52 + k * 60;
      ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
      ctx.imageSmoothingEnabled = false;
      ctx.translate(cx, cy); ctx.rotate(Math.sin(c.t * 40) * 0.04 * k);
      if (c.kind === 'wraith') ctx.globalAlpha = 0.85;
      ctx.drawImage(img, -sz / 2, -sz * 0.45, sz, sz);
    } else if (c.kind === 'sealed') {
      // the vault's last portcullis drops in front of you
      const drop = Math.min(1, k * 1.4);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * k})`; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
      ctx.fillStyle = '#3a3a42';
      for (let x = 10; x < VIEW.w; x += 44) ctx.fillRect(x, VIEW.y - VIEW.h + drop * VIEW.h, 14, VIEW.h);
      for (const y of [0.25, 0.55, 0.85]) ctx.fillRect(0, VIEW.y - VIEW.h + drop * VIEW.h + VIEW.h * y, VIEW.w, 12);
    } else {
      ctx.fillStyle = `rgba(40,30,20,${0.85 * k})`; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    }
    ctx.restore();
    ctx.save();
    const red = ctx.createRadialGradient(VIEW.w / 2, VIEW.y + VIEW.h / 2, VIEW.h * 0.15, VIEW.w / 2, VIEW.y + VIEW.h / 2, VIEW.h * 0.75);
    red.addColorStop(0, `rgba(220,20,20,${0.12 * k})`); red.addColorStop(1, `rgba(150,0,0,${0.75 * k})`);
    ctx.fillStyle = red; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.restore();
  }

  drawVignette(ctx) {
    if (!this.vig) {
      const c = document.createElement('canvas'); c.width = VIEW.w; c.height = VIEW.h; const g = c.getContext('2d');
      const gr = g.createRadialGradient(VIEW.w / 2, VIEW.h * 0.52, VIEW.h * 0.28, VIEW.w / 2, VIEW.h * 0.52, VIEW.h * 0.82);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = gr; g.fillRect(0, 0, VIEW.w, VIEW.h);
      this.vig = c;
    }
    ctx.drawImage(this.vig, VIEW.x, VIEW.y);
  }

  drawNowRun(ctx) {
    const k = this.nowRun, a = Math.min(1, k * 1.5, (3.2 - k) * 3);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, VIEW.y + 150, W, 110);
    ctx.font = '900 28px Georgia, serif'; ctx.fillStyle = '#fde047'; ctx.fillText('You have the crown.', W / 2, VIEW.y + 188);
    ctx.font = '900 44px Georgia, serif'; ctx.fillStyle = '#fff7ed'; ctx.fillText('Now run.', W / 2, VIEW.y + 232);
    ctx.restore();
  }

  drawCompass(ctx) {
    const f = this.f, p = this.p;
    const rel = angDiff(Math.atan2(f.exit[1] + 0.5 - p.y, f.exit[0] + 0.5 - p.x), p.a);
    const cx = W / 2, cy = VIEW.y + 30;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rel);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawFinale(ctx) {
    const f = this.finale, k = Math.min(1, f.t / 2.5), cx = VIEW.w / 2, cy = VIEW.y + 180 - k * 30;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 240);
    g.addColorStop(0, `rgba(253,230,138,${0.55 * k})`); g.addColorStop(1, 'rgba(253,230,138,0)');
    ctx.fillStyle = g; ctx.fillRect(0, VIEW.y, VIEW.w, VIEW.h);
    if (!f.throne) {
      const sz = 90 + k * 110;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(cx, cy); ctx.rotate(Math.sin(f.t * 1.5) * 0.06);
      ctx.drawImage(this.spr.crownCanvas, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    }
    if (f.t > 1.4) {
      ctx.globalAlpha = Math.min(1, (f.t - 1.4) / 1); ctx.textAlign = 'center';
      ctx.font = '900 22px system-ui'; ctx.fillStyle = '#fde047';
      ctx.fillText(f.throne ? 'THE CROWN IS HOME' : 'THE CROWN OF THE CRYPT KINGS', cx, VIEW.y + 340);
      ctx.font = '700 15px system-ui'; ctx.fillStyle = '#fef3c7';
      ctx.fillText('You saw the crown in the Crypt. You stole it from the Vault.', cx, VIEW.y + 368);
      if (f.throne) ctx.fillText('A flawless heist — and a throne no longer empty.', cx, VIEW.y + 390);
      ctx.globalAlpha = 1;
    }
  }

  drawHud(ctx) {
    const s = this.s, f = this.f;
    ctx.fillStyle = 'rgba(3,5,20,.94)'; ctx.fillRect(0, 0, W, VIEW.y);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '800 15px system-ui'; ctx.fillStyle = this.secret ? '#fde047' : '#e7e5e4';
    ctx.fillText(this.bonus ? `★ Treasure Vault · ${Math.ceil(s.bonusLeft)}s` : this.secret ? '★ The Empty Throne' : `${this.level}. ${f.name}`, 12, 15);
    ctx.font = '700 12px system-ui';
    if (this.bonus) { ctx.fillStyle = '#fde047'; ctx.fillText(`${this.coinsHere} gold grabbed`, 12, 34); }
    else if (this.secret) { ctx.fillStyle = '#fef3c7'; ctx.fillText('Carry the crown to the empty throne', 12, 34); }
    else if (this.has) {
      const sec = Math.max(0, Math.ceil(this.sealT)), urgent = sec <= 10;
      ctx.fillStyle = urgent && Math.floor(this.t * 4) % 2 ? '#fff' : '#f87171';
      ctx.font = '900 14px system-ui'; ctx.fillText(`⏳ VAULT SEALS IN ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, 12, 34);
    } else {
      const chased = this.guards.some((g) => !g.dead && g.state === 'chase');
      ctx.fillStyle = chased ? '#f87171' : this.hidden ? '#c4b5fd' : '#fcd34d';
      ctx.fillText(chased ? '⚠ SPOTTED — break their line of sight!' : this.hidden ? '🌑 Hidden' : '★ Find the crown and take it', 12, 34);
    }
    ctx.textAlign = 'right'; ctx.font = '800 14px system-ui';
    if (!this.bonus && !this.secret) { ctx.fillStyle = '#fde68a'; ctx.fillText(`🪙${this.ammo.coin}  💨${this.ammo.smoke}`, 468, 15); }
    if (this.wraith?.on && !this.done) { ctx.fillStyle = '#67e8f9'; ctx.font = '800 12px system-ui'; ctx.fillText('👁 The Wraith follows', 468, 34); }
    if (this.msg) {
      this.msg.t -= this.rdt ?? 1 / 60;
      if (this.msg.t <= 0) this.msg = null;
      else {
        ctx.save(); ctx.globalAlpha = Math.min(1, this.msg.t * 2);
        ctx.font = '800 16px system-ui'; const w = Math.min(W - 20, ctx.measureText(this.msg.text).width + 28);
        ctx.fillStyle = 'rgba(0,0,0,.66)'; roundRect(ctx, W / 2 - w / 2, VIEW.y + 52, w, 30, 15); ctx.fill();
        ctx.fillStyle = this.msg.color; ctx.textAlign = 'center'; ctx.fillText(this.msg.text, W / 2, VIEW.y + 67, W - 30);
        ctx.restore();
      }
    }
  }

  drawPanel(ctx) {
    const s = this.s, f = this.f, t = this.t, p = this.p;
    ctx.fillStyle = '#0c0a09'; ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
    ctx.fillStyle = '#292524'; ctx.fillRect(0, PANEL_Y, W, 3);
    // ── the map
    const cs = Math.min(MAP.s / f.w, MAP.s / f.h), ox = MAP.x + (MAP.s - f.w * cs) / 2, oy = MAP.y;
    ctx.fillStyle = '#000'; ctx.fillRect(ox - 3, oy - 3, f.w * cs + 6, f.h * cs + 6);
    const g = this.g;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (!this.seen[y * f.w + x]) continue;
      const v = g.at(x, y);
      let col = v === C.WALL || v === C.LEVER ? '#57534e' : '#1c1917';
      if (v === C.ALCOVE) col = '#4c1d95'; else if (v === C.CRACK) col = '#44403c'; else if (v === C.PIT) col = '#000'; else if (v === C.RUBBLE) col = '#78350f';
      else if (v === C.GATE) col = this.gateClosed() ? '#9ca3af' : '#374151'; else if (v === C.LEVER) col = this.leverOn ? '#22c55e' : '#ef4444'; else if (v === C.BRAZ) col = '#f97316';
      if (v === C.LEVER) col = this.leverOn ? '#22c55e' : '#ef4444';
      ctx.fillStyle = col; ctx.fillRect(ox + x * cs, oy + y * cs, cs + 0.5, cs + 0.5);
    }
    const dot = (x, y, color, r = 0.36) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ox + x * cs, oy + y * cs, Math.max(1.8, cs * r), 0, Math.PI * 2); ctx.fill(); };
    // the crown is on the vault plans from the start; the stairs once you have it (or have seen them)
    if (f.crown && !this.has) { ctx.fillStyle = '#fde047'; ctx.font = `${Math.max(9, cs * 1.6)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♛', ox + (f.crown[0] + 0.5) * cs, oy + (f.crown[1] + 0.5) * cs + 1); }
    if (f.exit && (this.has || this.seen[f.exit[1] * f.w + f.exit[0]])) { const pulse = this.has ? 0.4 + 0.15 * Math.sin(t * 6) : 0.36; dot(f.exit[0] + 0.5, f.exit[1] + 0.5, '#4ade80', pulse); }
    for (const [x, y] of f.coins) if (!this.taken.has(x + ',' + y) && this.seen[y * f.w + x]) dot(x + 0.5, y + 0.5, '#ca8a04', 0.16);
    for (const [x, y] of f.chests) if (!this.taken.has('T' + x + ',' + y) && this.seen[y * f.w + x]) dot(x + 0.5, y + 0.5, '#f59e0b', 0.28);
    // guards you can see (or hear close by), with their torch beams
    for (const gd of this.guards) {
      if (gd.dead) continue;
      const d = Math.hypot(gd.x - p.x, gd.y - p.y), vis = d < 3.2 || (d < 9 && this.lineClear(p.x, p.y, gd.x, gd.y));
      if (!vis && !this.bonus) continue;
      const T = GUARD[gd.kind], rr = (T.range + (gd.alert ? 1.2 : 0)) * cs, cone = T.cone + (gd.alert ? 0.15 : 0);
      ctx.fillStyle = gd.state === 'chase' ? 'rgba(239,68,68,.3)' : 'rgba(251,191,36,.22)';
      ctx.beginPath(); ctx.moveTo(ox + gd.x * cs, oy + gd.y * cs); ctx.arc(ox + gd.x * cs, oy + gd.y * cs, rr, gd.a - cone, gd.a + cone); ctx.closePath(); ctx.fill();
      dot(gd.x, gd.y, gd.state === 'chase' ? '#ef4444' : gd.kind === 'knight' ? '#fbbf24' : '#f5f5f4', 0.42);
    }
    if (this.wraith?.on) dot(this.wraith.x, this.wraith.y, `rgba(103,232,249,${0.6 + 0.4 * Math.sin(t * 5)})`, 0.5);
    for (const sm of this.smokes) { ctx.fillStyle = 'rgba(200,200,210,.35)'; ctx.beginPath(); ctx.arc(ox + sm.x * cs, oy + sm.y * cs, sm.r * cs, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(ox + p.x * cs, oy + p.y * cs); ctx.rotate(p.a);
    const r = Math.max(3.2, cs * 0.55);
    ctx.fillStyle = this.has ? '#fde047' : s.gold ? '#fbbf24' : '#38bdf8'; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7); ctx.fill(); ctx.restore();

    // ── the stick
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1c1917'; ctx.strokeStyle = '#44403c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(STICK.x, STICK.y, STICK.r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(214,211,209,.35)'; ctx.font = '700 11px system-ui';
    ctx.fillText('▲', STICK.x, STICK.y - STICK.r + 12); ctx.fillText('▼', STICK.x, STICK.y + STICK.r - 12); ctx.fillText('↺', STICK.x - STICK.r + 12, STICK.y); ctx.fillText('↻', STICK.x + STICK.r - 12, STICK.y);
    const kx = STICK.x + (this.stick?.dx || 0) * STICK.r * 0.62, ky = STICK.y + (this.stick?.dy || 0) * STICK.r * 0.62;
    const kg = ctx.createRadialGradient(kx - 6, ky - 6, 2, kx, ky, 26); kg.addColorStop(0, '#78716c'); kg.addColorStop(1, '#292524');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(kx, ky, 24, 0, 7); ctx.fill();
    // ── the buttons
    const btn = (b, label, sub, col, on, n) => {
      const pr = this.pressed?.k === on;
      ctx.fillStyle = pr ? col[1] : col[0]; ctx.strokeStyle = col[1]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${b.r > 35 ? 22 : 17}px system-ui`; ctx.fillText(label, b.x, b.y - 7);
      ctx.font = '800 10px system-ui'; ctx.fillText(sub, b.x, b.y + (b.r > 35 ? 14 : 11));
      if (n !== undefined) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x + b.r * 0.72, b.y - b.r * 0.72, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#fde68a'; ctx.font = '900 11px system-ui'; ctx.fillText(n, b.x + b.r * 0.72, b.y - b.r * 0.72 + 0.5); }
    };
    const near = !this.has && f.crown && Math.hypot(p.x - f.crown[0] - 0.5, p.y - f.crown[1] - 0.5) < 1.5;
    btn(BTN.use, this.secret ? '♛' : near ? '♛' : '✋', this.secret ? 'THRONE' : near ? 'GRAB' : 'USE', near ? ['#713f12', '#facc15'] : ['#1e1b4b', '#818cf8'], 'use');
    if (!this.bonus && !this.secret) {
      btn(BTN.coin, '🪙', 'COIN', ['#422006', '#ca8a04'], 'coin', this.ammo.coin);
      btn(BTN.smoke, '💨', 'SMOKE', ['#27272a', '#a1a1aa'], 'smoke', this.ammo.smoke);
    }
    ctx.font = '600 10.5px system-ui'; ctx.fillStyle = 'rgba(214,211,209,.5)';
    ctx.fillText(this.coarse ? 'Drag the view to look around' : 'WASD/↑↓←→ · Q/E sidestep · Space grab · C coin · X smoke', MAP.x + MAP.s / 2, H - 18);
    if (s.gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 10px system-ui'; ctx.fillText('★ GOLDEN THIEF', MAP.x + MAP.s / 2, PANEL_Y + MAP.s + 22); }
  }
}

/** shortest distance from point (px, py) to the segment a→b */
function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — game 19 (Zone 4 · Ultra)
//  An open-world survival block game. You start with nothing on an island:
//  punch trees, craft tools, mine deeper, smelt iron, keep yourself fed,
//  build a shelter before night — and one day summon and defeat the Shadow King.
//
//  Fits the arcade like every other game:
//    • each sunrise is a new level (Day 2, Day 3 …) — surviving a night scores
//    • every 5th level is a ★ STARFALL bonus round (20 s, nothing can hurt you)
//    • 3 lives: die and everything you carry drops into a grave where you fell —
//      get back to it to recover your things
//    • difficulty rises ~7% a day, and something new turns up every day or two:
//        D2 Thornbacks (archers) · D3 Boomcaps, starving can kill · D4 Crawlers
//        D5 longer nights · D6 armoured monsters · D7+ Blood Moon nights
//      while food (animals, apples, berries) gets scarcer every day
//    • score: advancements, ores, creatures defeated (combos!), nights survived
//    • the Daily Challenge gives everyone the same island
//  Files: items.js (blocks, recipes, advancements) · world.js (island + light)
//         blocktex.js + textures.js (all the pixel art) · glrender.js (GPU 3D view)
//         render.js (software 3D view for devices without WebGL 2) · ui.js (HUD & menus)
// ─────────────────────────────────────────────────────────────
import { runGame, clamp } from '../../assets/js/engine.js';
import { B, I, INFO, FUELS, ADV_BY_ID, isBlock, stackOf, PLACEABLE } from './items.js';
import { World, SX, SY, SZ, idx } from './world.js';
import { makeTextures, makeIcons, SPRITES } from './textures.js';
import { Renderer } from './render.js';
import { GLRenderer } from './glrender.js';
import { UI } from './ui.js';

const ID = 'tc-pixel-craft';
const W = 480, H = 720;
export const VIEW_H = 560;
const CYCLE = 200;   // one day-night cycle, in seconds
export const dayOfLevel = (L) => L - Math.floor(L / 5);

const SOLID = new Uint8Array(64).fill(1);
for (const b of [B.AIR, B.WATER, B.LAVA, B.TORCH, B.BUSH, B.BUSH_RIPE, B.MUSHROOM]) SOLID[b] = 0;

// creature types (hp/damage/speed grow with the day — see stats())
const MOB = {
  gloom: { hp: 16, w: 0.7, h: 0.9, sprH: 1.0, speed: 2.6, dmg: 3, pts: 60, hostile: true, drops: [[I.GEL, 1, 2]] },
  thorn: { hp: 14, w: 0.8, h: 1.0, sprH: 1.05, speed: 2.0, dmg: 3, pts: 70, hostile: true, drops: [[I.THORN, 1, 2], [I.STICK, 0, 1]] },
  boom: { hp: 14, w: 0.7, h: 1.1, sprH: 1.15, speed: 2.4, dmg: 0, pts: 80, hostile: true, drops: [[I.SPORE, 1, 2]] },
  crawler: { hp: 10, w: 0.95, h: 0.6, sprH: 0.75, speed: 3.6, dmg: 2, pts: 70, hostile: true, drops: [[I.SILK, 1, 2]] },
  fluff: { hp: 8, w: 0.8, h: 0.9, sprH: 1.0, speed: 0.9, dmg: 0, pts: 10, hostile: false, drops: [[I.WOOL, 1, 2]] },
  king: { hp: 420, w: 2.4, h: 2.8, sprH: 3.0, speed: 3.2, dmg: 6, pts: 5000, hostile: true, drops: [] },
};

const HINTS = {
  2: 'Something with thorns is watching from the trees…',
  3: 'Spores drift on the wind. And your stomach rumbles…',
  4: 'Skittering, deep in the caves…',
  5: 'The nights are growing longer.',
  6: 'The creatures have found armour.',
  7: 'A red moon will rise tonight…',
};

let game = null;
runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  detail: true,                      // the shared HIGH/LOW chip drives the GL render scale
  comboWindow: 4,
  comboStep: 3,
  maxMultiplier: 5,
  bonusTime: 20,
  noCheckpoints: true,
  levelName: 'Day',
  levelLabel: (L, bonus) => bonus ? '★' : String(dayOfLevel(L)),
  levelTitle: (L) => `Day ${dayOfLevel(L)}`,
  clearText: 'YOU SURVIVED THE NIGHT!',
  winTitle: '👑 The Shadow King has fallen!',
  wonText: (L) => `Won on day ${dayOfLevel(L)}`,
  levelClearPoints: (L, bonus) => bonus ? 500 : 300 * dayOfLevel(L),
  music: { bpm: 84, style: 'dream', lead: 'triangle', arp: [0, 2, 1, 2, 0, 1, 2, 1], oct: [0, 12, 0, 12, 0, 0, 12, 0], bass: 'half' },
  levelInfo(level, bonus) {
    if (bonus) return '★ STARFALL! Catch the falling stars. Nothing can hurt you for 20 seconds.';
    if (level === 1) return 'A new island. You have nothing. (E = your bag & crafting)';
    const d = dayOfLevel(level);
    return HINTS[d] || (d >= 8 && d % 2 === 1 ? 'Blood Moon tonight. Food is scarce.' : 'Food is getting harder to find.');
  },
  create: (shell) => (game = new PixelCraft(shell)),
});

class PixelCraft {
  constructor(s) {
    this.s = s; this.t = 0;
    this.tex = makeTextures();
    this.icons = makeIcons(this.tex);
    this.touchUI = this.s.coarse;
    this.clouds = new Uint8Array(64 * 64);
    { let q = 12345; const rnd = () => ((q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); for (let k = 0; k < 30; k++) { const cx = rnd() * 64, cz = rnd() * 64, rx = 2 + rnd() * 5, rz = 1.5 + rnd() * 3; for (let z = -8; z <= 8; z++) for (let x = -10; x <= 10; x++) if ((x / rx) ** 2 + (z / rz) ** 2 < 1) this.clouds[(((Math.floor(cz) + z) & 63) * 64) + ((Math.floor(cx) + x) & 63)] = 255; } }
    this.gl = null;
    const forceSoft = /[?&]soft=1/.test(location.search);
    if (!forceSoft && GLRenderer.supported()) { try { this.gl = new GLRenderer(this.tex, SPRITES, this.clouds); } catch (e) { console.warn('WebGL renderer unavailable, using software 3D', e); this.gl = null; } }
    if (this.gl && this.s.lowDetail) this.gl.quality = 0.6;
    if (!this.gl) this.renderer = new Renderer(this.tex, SPRITES, this.touchUI ? 2 : 0);
    this.world = new World();
    this.ui = new UI(this);
    this.keys = new Set();
    this.joy = null; this.look = null; this.mineTouch = null; this.jumpTouch = null; this.useTouch = null;
    this.mineMouse = false; this.useMouse = false; this.useQueued = false; this.perf = []; this.frameDt = [];
    this.bindInput();
    this.fresh = true;
    this.newGame();
  }

  // ── A new island ────────────────────────────────────────────
  reset() { this.fresh = true; }

  newGame() {
    this.world.generate(this.s.rng);
    const sp = this.world.findSpawn();
    this.spawn = sp.slice(); this.bedSet = false;
    this.plantNear(sp);
    this.gl?.invalidateAll();
    this.p = { x: sp[0], y: sp[1], z: sp[2], vx: 0, vy: 0, vz: 0, grounded: false, inWater: false };
    this.yaw = this.s.rng.range(0, Math.PI * 2); this.pitch = -0.1;
    this.health = 20; this.energy = 20; this.air = 10; this.hurtCd = 0; this.regenT = 0; this.fallTop = sp[1]; this.burnT = 0; this.starveT = 0;
    this.inv = new Array(36).fill(null); this.armour = [null, null, null, null]; this.sel = 0;
    this.advs = new Set(); this.kills = 0; this.crafted = new Set();
    this.mobs = []; this.shots = []; this.arrows = []; this.stars = []; this.boss = null; this.grave = null;
    this.dayT = 6; this.day = 1; this.spawnT = 3; this.passiveT = 1; this.bushT = 5; this.bloodNight = false;
    this.mining = null; this.swingT = 0; this.attackCd = 0; this.useCd = 0; this.eatT = 0; this.bowT = 0;
    this.sleepT = 0; this.relightT = 0; this.stationsT = 0; this.near = { table: false, furnace: false };
    this.toast = null; this.heldNameT = 0;
    this.ui.close();
  }

  /** Make sure there are a few trees close to where you start. */
  plantNear(sp) {
    const w = this.world, r = this.s.rng;
    let logs = 0;
    for (let z = sp[2] - 10; z < sp[2] + 10; z++) for (let x = sp[0] - 10; x < sp[0] + 10; x++) for (let y = 1; y < SY; y++) if (w.get(Math.floor(x), y, Math.floor(z)) === B.LOG) logs++;
    for (let tries = 0; tries < 40 && logs < 12; tries++) {
      const x = Math.floor(sp[0] + r.range(-8, 8)), z = Math.floor(sp[2] + r.range(-8, 8));
      if (Math.hypot(x + 0.5 - sp[0], z + 0.5 - sp[2]) < 3 || x < 3 || z < 3 || x > SX - 4 || z > SZ - 4) continue;
      const g = w.top[z * SX + x];
      if (w.get(x, g, z) !== B.GRASS && w.get(x, g, z) !== B.SNOW) continue;
      w.tree(x, g, z, w.get(x, g, z) === B.SNOW, r.next);
      logs += 4;
    }
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) w.updateTop(x, z);
    w.relight();
  }

  startLevel(level, bonus) {
    if (this.fresh) { this.newGame(); this.fresh = false; }
    this.level = level; this.bonus = bonus; this.day = dayOfLevel(level);
    this.sleepT = 0;
    if (level > 1) this.dayT = 2; // a fresh morning
    this.bloodNight = !bonus && this.day >= 7 && this.day % 2 === 1;
    if (bonus) {
      this.stars = []; this.starT = 0; this.starsCaught = 0;
      for (const m of this.mobs) if (MOB[m.type].hostile && m.type !== 'king') this.poof(m);
      this.mobs = this.mobs.filter((m) => !m.dead);
      this.shots = [];
    }
  }

  // ── How hard things are today ───────────────────────────────
  /** food scarcity: 1.2 on day 1, down to 0.3 */
  foodK() { return clamp(1.2 - 0.09 * (this.day - 1), 0.3, 1.2); }
  stats(type) {
    const M = MOB[type], s = this.s;
    if (type === 'king' || !M.hostile) return { hp: M.hp, dmg: M.dmg, speed: M.speed };
    const armoured = this.day >= 6;
    return {
      hp: Math.round(M.hp * s.speed(0.07, 3) * (armoured ? 1.4 : 1)),
      dmg: M.dmg ? M.dmg + Math.floor((this.day - 1) / 3) : 0,
      speed: M.speed * s.speed(0.035, 1.5),
      armoured,
    };
  }
  /** energy used per second, before activity */
  drainRate() { return 20 / Math.max(110, 280 / this.s.speed(0.08, 2.6)) * 0.4; }
  sunsetAt() { return 135 - (this.day >= 5 ? Math.min(30, (this.day - 4) * 6) : 0); }

  // ── Input ───────────────────────────────────────────────────
  bindInput() {
    const s = this.s, cv = s.canvas;
    const typing = (e) => e.target instanceof HTMLInputElement;
    const playing = () => s.state === 'playing';
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      const c = e.code;
      if (playing() && ['KeyE', 'KeyL', 'KeyJ', 'KeyK', 'Tab', 'ShiftLeft', 'KeyQ'].includes(c)) e.preventDefault();
      if (!e.repeat && playing()) {
        if (c === 'KeyE') { this.ui.toggle('inv'); return; }
        if (c === 'KeyL' || c === 'Tab') { this.ui.toggle('adv'); return; }
        if (/^Digit[1-9]$/.test(c)) { this.select(+c.slice(5) - 1); }
        if (c === 'KeyK' && !this.ui.open) this.useQueued = true;
        if (c === 'KeyQ' && !this.ui.open) this.startEat();
      }
      this.keys.add(c);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mineMouse = this.useMouse = false; this.joy = this.look = this.mineTouch = this.jumpTouch = this.useTouch = null; });

    const logical = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = logical(e);
      if (!playing()) return;
      if (e.pointerType !== 'mouse') this.touchUI = true;
      if (this.ui.open) { this.ui.click(x, y); return; }
      if (this.ui.hudClick(x, y, e.pointerType)) return;
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement !== cv) { this.lock(); }
        if (e.button === 0) this.mineMouse = true;
        if (e.button === 2) { this.useQueued = true; this.useMouse = true; }
        return;
      }
      const b = this.ui.touchButton(x, y);
      if (b === 'mine') this.mineTouch = e.pointerId;
      else if (b === 'use') { this.useQueued = true; this.useTouch = e.pointerId; }
      else if (b === 'jump') this.jumpTouch = e.pointerId;
      else if (y > VIEW_H && x < 170) { this.joy = { id: e.pointerId, dx: 0, dy: 0 }; this.moveJoy(x, y); }
      else if (y < VIEW_H) this.look = { id: e.pointerId, x, y, x0: x, y0: y, t: performance.now() };
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { if (this.ui.open) { const [x, y] = logical(e); this.ui.hover(x, y); } return; }
      const [x, y] = logical(e);
      if (this.ui.open) { this.ui.drag(x, y); return; }
      if (this.joy && e.pointerId === this.joy.id) this.moveJoy(x, y);
      if (this.look && e.pointerId === this.look.id) {
        if (playing()) { this.yaw += (x - this.look.x) * 0.011; this.pitch = clamp(this.pitch - (y - this.look.y) * 0.009, -1.5, 1.5); }
        this.look.x = x; this.look.y = y;
      }
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mineMouse = false; if (e.button === 2) this.useMouse = false; return; }
      this.ui.dragEnd?.();
      if (this.joy && e.pointerId === this.joy.id) this.joy = null;
      if (this.look && e.pointerId === this.look.id) {
        const l = this.look; this.look = null;   // a quick tap on the view = use / place
        if (Math.hypot(l.x - l.x0, l.y - l.y0) < 10 && performance.now() - l.t < 250 && playing() && !this.ui.open) { this.useQueued = true; this.useFromTap = true; }
      }
      if (this.mineTouch === e.pointerId) this.mineTouch = null;
      if (this.jumpTouch === e.pointerId) this.jumpTouch = null;
      if (this.useTouch === e.pointerId) this.useTouch = null;
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== cv || !playing() || this.ui.open) return;
      this.yaw += e.movementX * 0.0026;
      this.pitch = clamp(this.pitch - e.movementY * 0.0026, -1.5, 1.5);
    });
    cv.addEventListener('wheel', (e) => {
      if (!playing()) return;
      e.preventDefault();
      if (this.ui.open) this.ui.wheel(e.deltaY);
      else this.select((this.sel + (e.deltaY > 0 ? 1 : 8)) % 9);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === cv;
      if (!locked) this.mineMouse = this.useMouse = false;
      if (!locked && this.wasLocked && playing() && !this.ui.open && !this.quietUnlock) s.togglePause();
      this.quietUnlock = false;
      this.wasLocked = locked;
    });
  }
  lock() { const cv = this.s.canvas; if (this.touchUI || !cv.requestPointerLock) return; try { const p = cv.requestPointerLock(); p?.catch?.(() => {}); } catch { /* ignore */ } }
  unlock() { if (document.pointerLockElement) { this.quietUnlock = true; document.exitPointerLock?.(); } }
  moveJoy(x, y) { const dx = x - 80, dy = y - 662, d = Math.hypot(dx, dy), m = Math.min(1, d / 48); this.joy.dx = d ? dx / d * m : 0; this.joy.dy = d ? dy / d * m : 0; }
  select(i) { this.sel = i; this.heldNameT = 1.6; this.mining = null; this.eatT = 0; this.bowT = 0; }
  useDown() { return this.useMouse || this.useTouch !== null || this.keys.has('KeyK'); }

  // ── Inventory ───────────────────────────────────────────────
  held() { return this.inv[this.sel]; }
  count(id) { let n = 0; for (const it of this.inv) if (it && it.id === id) n += it.n; return n; }
  /** Add items; returns how many didn't fit. */
  give(id, n = 1) {
    const st = stackOf(id);
    for (const it of this.inv) if (n > 0 && it && it.id === id && it.n < st) { const k = Math.min(n, st - it.n); it.n += k; n -= k; }
    for (let i = 0; i < this.inv.length && n > 0; i++) if (!this.inv[i]) { const k = Math.min(n, st); this.inv[i] = { id, n: k, dur: INFO[id].dur || 0 }; n -= k; }
    if (id === B.LOG) this.adv('wood');
    if (id === I.CRYSTAL) this.adv('crystal');
    return n;
  }
  take(id, n) {
    for (let i = this.inv.length - 1; i >= 0 && n > 0; i--) {
      const it = this.inv[i];
      if (it && it.id === id) { const k = Math.min(n, it.n); it.n -= k; n -= k; if (!it.n) this.inv[i] = null; }
    }
  }
  roomFor(id, n) {
    const st = stackOf(id); let room = 0;
    for (const it of this.inv) room += !it ? st : it.id === id ? st - it.n : 0;
    return room >= n;
  }
  fuelFor() { for (const [id, n] of FUELS) if (this.count(id) >= n) return [id, n]; return null; }
  canCraft(r) {
    if (r.at === 'table' && !this.near.table) return false;
    if (r.at === 'furnace' && !this.near.furnace) return false;
    for (const [id, n] of Object.entries(r.needs)) if (this.count(+id) < n) return false;
    if (r.at === 'furnace') {
      const f = this.fuelFor(); if (!f) return false;
      const need = r.needs[f[0]] || 0; if (need && this.count(f[0]) < need + f[1]) return false;   // the fuel can't also be what you smelt
    }
    return true;
  }
  craft(r) {
    if (!this.canCraft(r) || !this.roomFor(r.out, r.n)) return false;
    for (const [id, n] of Object.entries(r.needs)) this.take(+id, n);
    if (r.at === 'furnace') { const f = this.fuelFor(); if (f) this.take(f[0], f[1]); }
    this.give(r.out, r.n);
    const s = this.s;
    s.sound.play(r.at === 'furnace' ? 'powerup' : 'click');
    if (!this.crafted.has(r.out)) { this.crafted.add(r.out); s.award(25, W / 2, 120, { color: '#a7f3d0' }); }
    const o = r.out, info = INFO[o];
    if (o === B.TABLE) this.adv('table');
    if (info.tool === 'pick') this.adv('pick');
    if (info.tool && info.tier === 2) this.adv('stone');
    if (o === B.FURNACE) this.adv('furnace');
    if (o === I.IRON) this.adv('iron');
    if (o === I.I_PICK) this.adv('ironpick');
    if (o === I.GOLD) this.adv('gold');
    if (info.tool && info.tier === 4) this.adv('ctool');
    return true;
  }
  checkArmour() { if (this.armour.every((a) => a && INFO[a.id].armour !== undefined)) this.adv('armour'); }
  protection() { let p = 0; for (const a of this.armour) if (a) p += INFO[a.id].protect; return Math.min(0.8, p); }

  // ── Food & energy ───────────────────────────────────────────
  startEat() {
    const it = this.held();
    if (!it || !INFO[it.id].food) return false;
    if (this.energy >= 20) { this.ui.say('You\'re not hungry.', '#e7e5e4'); return false; }
    if (!this.eatT) { this.eatT = 0.001; this.eatId = it.id; }
    return true;
  }
  finishEat() {
    const it = this.held();
    this.eatT = 0;
    if (!it || it.id !== this.eatId) return;
    const food = INFO[it.id].food;
    this.energy = Math.min(20, this.energy + food);
    if (it.id === I.COOKED || it.id === I.MUSH_COOKED) this.adv('food');
    if (it.id === I.APPLE || it.id === I.BERRIES) this.adv('forage');
    it.n--; if (!it.n) this.inv[this.sel] = null;
    this.s.sound.play('eat');
    this.s.fx.text(W / 2, VIEW_H * 0.55, `+${food} ⚡`, { color: '#fde047', size: 22 });
  }
  tire(n) { this.energy = Math.max(0, this.energy - n); }

  // ── Advancements ────────────────────────────────────────────
  adv(id) {
    if (this.advs.has(id) || !this.inRun()) return;
    const a = ADV_BY_ID[id]; if (!a) return;
    this.advs.add(id);
    const s = this.s;
    s.award(a.pts, W / 2, 150, { color: '#fde047', size: 24 });
    s.sound.play('achieve');
    this.toast = { a, t: 3.2 };
    if (a.badge) s.unlock(a.badge);
    if (this.advs.size >= 10) s.unlock('adv10');
  }
  inRun() { return ['playing', 'banner', 'clear', 'dying'].includes(this.s.state); }

  // ── Physics ─────────────────────────────────────────────────
  solid(x, y, z) { return SOLID[this.world.get(x, y, z)] === 1; }
  collides(x, y, z, hw, h) {
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-4), y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-4), z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-4);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (this.solid(xx, yy, zz)) return true;
    return false;
  }
  moveBody(b, dt, hw, h, grav = 28) {
    let hitX = false, hitZ = false;
    const nx = b.x + b.vx * dt;
    if (this.collides(nx, b.y, b.z, hw, h)) { hitX = true; b.vx = 0; } else b.x = nx;
    const nz = b.z + b.vz * dt;
    if (this.collides(b.x, b.y, nz, hw, h)) { hitZ = true; b.vz = 0; } else b.z = nz;
    b.vy -= grav * dt;
    if (b.vy < -40) b.vy = -40;
    const ny = b.y + b.vy * dt;
    b.grounded = false;
    if (this.collides(b.x, ny, b.z, hw, h)) {
      if (b.vy < 0) { const snap = Math.floor(ny) + 1; if (snap <= b.y + 0.01 && !this.collides(b.x, snap, b.z, hw, h)) b.y = snap; b.grounded = true; }
      b.vy = 0;
    } else b.y = ny;
    return { hitX, hitZ };
  }
  touching(b, hw, h, block) {
    for (let yy = Math.floor(b.y); yy <= Math.floor(b.y + h - 0.01); yy++) for (const [dx, dz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) if (this.world.get(Math.floor(b.x + dx), yy, Math.floor(b.z + dz)) === block) return true;
    return false;
  }
  // Is the ground a short step ahead (or the drop just below it) water or lava?
  liquidAhead(b, dx, dz, dist) {
    const x = Math.floor(b.x + dx * dist), z = Math.floor(b.z + dz * dist);
    for (let y = Math.floor(b.y + 0.5); y >= Math.floor(b.y) - 3; y--) {
      const v = this.world.get(x, y, z);
      if (v === B.WATER || v === B.LAVA) return true;
      if (SOLID[v] === 1) return false;
    }
    return false;
  }
  // Direction (unit [x, z]) to the nearest dry ground within a few blocks, or null.
  landDir(b) {
    for (let dist = 1; dist <= 5; dist++) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a);
      const x = Math.floor(b.x + dx * dist), z = Math.floor(b.z + dz * dist);
      for (let y = Math.floor(b.y) + 2; y >= Math.floor(b.y) - 2; y--) {
        const v = this.world.get(x, y, z);
        if (v === B.WATER || v === B.LAVA) break;
        if (SOLID[v] === 1) return [dx, dz];
      }
    }
    return null;
  }
  eye() { return [this.p.x, this.p.y + 1.62, this.p.z]; }
  fwd() { const cp = Math.cos(this.pitch); return [cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw)]; }

  /** The block under the crosshair: { x,y,z, px,py,pz (cell before it), t, v } */
  castBlock(reach = 4.6) {
    const [ox, oy, oz] = this.eye(), [dx, dy, dz] = this.fwd(), w = this.world;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tx = (dx > 0 ? x + 1 - ox : ox - x) * tdx, ty = (dy > 0 ? y + 1 - oy : oy - y) * tdy, tz = (dz > 0 ? z + 1 - oz : oz - z) * tdz;
    let t = 0;
    for (let i = 0; i < 20; i++) {
      const px = x, py = y, pz = z;
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
      if (t > reach || !w.inside(x, y, z)) return null;
      const v = w.b[idx(x, y, z)];
      if (v && v !== B.WATER && v !== B.LAVA) return { x, y, z, px, py, pz, t, v };
    }
    return null;
  }

  // ── Main update (120× per second) ───────────────────────────
  update(dt) {
    const s = this.s, k = this.keys, p = this.p;
    this.t += dt;
    for (const n of ['hurtCd', 'swingT', 'attackCd', 'useCd', 'heldNameT']) this[n] = Math.max(0, this[n] - dt);
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    this.ui.update(dt);

    // time of day
    if (!this.bonus && !this.sleepT) {
      this.dayT += dt;
      if (this.dayT >= CYCLE) return this.dawn();
    }
    if (this.sleepT) { this.sleepT -= dt; if (this.sleepT <= 0) { this.sleepT = 0; this.adv('bed'); return this.dawn(); } }

    this.stationsT -= dt;
    if (this.stationsT <= 0) { this.stationsT = 0.4; this.findStations(); }

    // look with keys
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0), tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    this.yaw += turn * 2.6 * dt; this.pitch = clamp(this.pitch + tilt * 1.8 * dt, -1.5, 1.5);

    // move
    const frozen = this.ui.open || this.sleepT;
    let fwdIn = frozen ? 0 : (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    let strafe = frozen ? 0 : (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    let sprintIn = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy && !frozen) { fwdIn -= this.joy.dy; strafe += this.joy.dx; if (-this.joy.dy > 0.93) sprintIn = true; }
    const len = Math.hypot(fwdIn, strafe);
    if (len > 1) { fwdIn /= len; strafe /= len; }
    p.inWater = this.touching(p, 0.3, 1.0, B.WATER);
    const headWater = this.world.get(Math.floor(p.x), Math.floor(p.y + 1.62), Math.floor(p.z)) === B.WATER;
    const weak = this.energy <= 6;
    const sprinting = sprintIn && fwdIn > 0 && !weak && !this.eatT && !this.bowT;
    let speed = (p.inWater ? 2.6 : 4.3) * (sprinting ? 1.32 : 1) * (weak ? 0.85 : 1);
    if (this.eatT || this.bowT) speed *= 0.45;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tvx = (sy * fwdIn + cy * strafe) * speed, tvz = (cy * fwdIn - sy * strafe) * speed;
    const acc = p.grounded || p.inWater ? 12 : 4;
    p.vx += (tvx - p.vx) * Math.min(1, dt * acc); p.vz += (tvz - p.vz) * Math.min(1, dt * acc);
    const jump = !frozen && (k.has('Space') || this.jumpTouch !== null);
    if (p.inWater) { p.vy *= 0.92; if (jump) p.vy = Math.min(p.vy + 30 * dt, 3.4); }
    else if (jump && p.grounded) { p.vy = 8.6; this.tire(0.06); }
    const wasGrounded = p.grounded, vyBefore = p.vy;
    const { hitX, hitZ } = this.moveBody(p, dt, 0.3, 1.8, p.inWater ? 9 : 28);
    if ((hitX || hitZ) && p.grounded && len > 0.3) p.vy = 8.6; // step up single blocks
    if (p.inWater || p.grounded && vyBefore >= -1) this.fallTop = p.y;
    if (!p.grounded && !p.inWater) this.fallTop = Math.max(this.fallTop, p.y);
    if (p.grounded && !wasGrounded && !p.inWater) { const fall = this.fallTop - p.y; if (fall > 3.5) this.damage(Math.floor(fall - 3), 'fall'); this.fallTop = p.y; }
    if (p.y < 6) this.adv('deep');

    // energy
    if (!this.bonus) {
      const moving = len > 0.2;
      let drain = this.drainRate() * (1 + (sprinting ? 1.4 : 0) + (p.inWater && moving ? 0.6 : 0) + (this.mining ? 0.5 : 0));
      if (this.sleepT) drain = 0;
      this.tire(drain * dt);
      if (this.energy <= 0) {
        this.starveT += dt;
        if (this.starveT > 4) { this.starveT = 0; if (this.day >= 3 || this.health > 2) this.damage(1, 'starve'); }
      } else this.starveT = 0;
    }

    // grave
    if (this.grave && Math.hypot(this.grave.x - p.x, this.grave.z - p.z) < 1.3 && Math.abs(this.grave.y - p.y) < 2) this.openGrave();

    // hazards
    if (this.touching(p, 0.3, 1.8, B.LAVA)) { this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.5; this.damage(4, 'lava'); } }
    if (this.touching({ x: p.x, y: p.y, z: p.z }, 0.36, 1.8, B.CACTUS)) { this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.6; this.damage(1, 'cactus'); } }
    if (headWater) { this.air = Math.max(0, this.air - dt); if (this.air <= 0) { this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 1; this.damage(2, 'drown'); } } }
    else this.air = Math.min(10, this.air + dt * 4);
    if (s.state !== 'playing') return;

    // health only comes back while you're well fed
    this.regenT += dt;
    const regenEvery = this.energy >= 16 ? 3 : this.energy >= 8 ? 8 : Infinity;
    if (this.regenT > regenEvery && this.health < 20 && this.hurtCd <= 0) { this.regenT = 0; this.health++; this.tire(0.4); }

    // eating / bow / hands
    if (this.eatT) {
      this.eatT += dt;
      this.chewT = (this.chewT || 0) - dt;
      if (this.chewT <= 0) { this.chewT = 0.28; s.sound.play('flap'); }
      if (this.eatT >= 1.1) this.finishEat();
    }
    if (!frozen) this.hands(dt);

    // creatures, projectiles, bushes
    this.updateMobs(dt);
    if (s.state !== 'playing') return;
    this.updateShots(dt);
    this.updateArrows(dt);
    if (this.bonus) this.updateStars(dt);
    this.bushT -= dt;
    if (this.bushT <= 0) { this.bushT = 5; this.regrowBush(); }

    // light
    this.relightT -= dt;
    if (this.world.dirty && this.relightT <= 0) { this.relightT = 0.08; this.world.relight(); }
  }

  regrowBush() {
    const r = this.s.rng, w = this.world;
    if (!r.chance(0.3 * this.foodK())) return;
    for (let tries = 0; tries < 30; tries++) {
      const x = r.int(2, SX - 3), z = r.int(2, SZ - 3), y = w.top[z * SX + x] + 1;
      if (w.get(x, y, z) === B.BUSH) { w.set(x, y, z, B.BUSH_RIPE); return; }
    }
  }

  findStations() {
    const w = this.world, px = Math.floor(this.p.x), py = Math.floor(this.p.y), pz = Math.floor(this.p.z);
    let table = false, furnace = false;
    for (let y = py - 2; y <= py + 3; y++) for (let z = pz - 4; z <= pz + 4; z++) for (let x = px - 4; x <= px + 4; x++) {
      const v = w.get(x, y, z); if (v === B.TABLE) table = true; else if (v === B.FURNACE) furnace = true;
    }
    this.near = { table, furnace };
  }

  // ── Sun ─────────────────────────────────────────────────────
  sunAngle() { const t = this.dayT, S = this.sunsetAt(); return t < S ? Math.PI * (t + 5) / (S + 5) : Math.PI + Math.PI * (t - S) / (CYCLE - S); }
  isNight() { return !this.bonus && this.dayT > this.sunsetAt() + 3 && this.dayT < CYCLE - 8; }
  daylight() { const a = this.sunAngle(); return clamp(Math.sin(a) * 3 + 0.35, 0, 1); }

  dawn() {
    const s = this.s;
    if (s.state !== 'playing') return;
    this.dayT = CYCLE;
    this.adv('night');
    if (this.bloodNight) this.adv('blood');
    for (const m of this.mobs) if (MOB[m.type].hostile && m.type !== 'king' && this.world.sky[this.cellIdx(m)] > 10) this.poof(m);
    this.mobs = this.mobs.filter((m) => !m.dead);
    s.completeLevel();
  }
  cellIdx(m) { const x = clamp(Math.floor(m.x), 0, SX - 1), y = clamp(Math.floor(m.y + 0.5), 0, SY - 1), z = clamp(Math.floor(m.z), 0, SZ - 1); return idx(x, y, z); }

  // ── Hands: mining, fighting, building, using ───────────────
  hands(dt) {
    const s = this.s, k = this.keys;
    const mineHeld = this.mineMouse || this.mineTouch !== null || k.has('KeyJ');
    const target = this.castBlock();
    this.target = target;
    const it = this.held(), info = it ? INFO[it.id] : null;
    // bow: hold USE to draw, let go to shoot
    if (info && info.tool === 'bow') {
      if (this.useDown() && !this.eatT) {
        if (!this.bowT) { if (!this.count(I.ARROW)) { if (this.useQueued) this.ui.say('You have no arrows.'); this.useQueued = false; } else this.bowT = 0.001; }
        else this.bowT = Math.min(1.2, this.bowT + dt);
        this.useQueued = false;
      } else if (this.bowT) { this.fireArrow(this.bowT); this.bowT = 0; }
    } else this.bowT = 0;
    if (this.eatT) { this.mining = null; this.useQueued = false; return; }
    if (mineHeld && !this.bowT) {
      this.swingT = Math.max(this.swingT, 0.05);
      const foe = this.attackCd <= 0 && this.foeInFront(target ? target.t : 3.4);
      if (foe) { this.hit(foe); this.mining = null; }
      else if (target) {
        const bi = INFO[target.v];
        const m = this.mining;
        if (!m || m.x !== target.x || m.y !== target.y || m.z !== target.z) this.mining = { x: target.x, y: target.y, z: target.z, p: 0 };
        const time = this.breakTime(target.v, info);
        if (isFinite(time)) {
          this.mining.p += dt;
          this.mining.k = this.mining.p / time;
          this.digT = (this.digT || 0) - dt;
          if (this.digT <= 0) { this.digT = 0.25; s.sound.play(bi.tool === 'pick' ? 'brick' : 'bounce', 1); }
          if (this.mining.p >= time) this.breakBlock(target, info);
        }
      } else this.mining = null;
    } else this.mining = null;

    if (this.useQueued) {
      this.useQueued = false;
      const fromTap = this.useFromTap; this.useFromTap = false;
      // A tap on the view only *uses* with something usable: a block or food in hand, or an
      // interactive target. A tap while holding a tool used to do nothing confusing — teach
      // the real gesture once instead.
      const it = this.held();
      const interactive = target && (target.v === B.BUSH_RIPE || target.v === B.TABLE || target.v === B.FURNACE || target.v === B.BED);
      if (fromTap && !interactive && !(it && (INFO[it.id].food || isBlock(it.id)))) {
        if (!this.mineToast) { this.mineToast = true; this.s.fx.text(W / 2, VIEW_H * 0.5, 'Hold ⛏ HIT to mine', { color: '#e2e8f0', size: 18, life: 1.8 }); }
      } else if (this.useCd <= 0) this.use(target);
    }
  }

  breakTime(v, tool) {
    const bi = INFO[v];
    if (!bi || !isFinite(bi.hard)) return Infinity;
    if (bi.hard === 0) return 0.05;
    const right = tool && tool.tool === bi.tool;
    const canDrop = !bi.tier || (tool && tool.tool === 'pick' && tool.tier >= bi.tier);
    let time = bi.hard * (canDrop ? 1.5 : 5);
    if (right) time /= tool.speed;
    if (this.energy <= 6) time *= 1.3;
    return Math.max(0.05, time);
  }

  breakBlock(t, tool) {
    const s = this.s, bi = INFO[t.v], v = t.v, f = this.foodK();
    this.mining = null;
    if (v === B.BUSH_RIPE) return this.harvest(t);
    this.world.set(t.x, t.y, t.z, B.AIR);
    for (const up of [B.TORCH, B.BUSH, B.BUSH_RIPE, B.MUSHROOM]) if (this.world.get(t.x, t.y + 1, t.z) === up) { this.world.set(t.x, t.y + 1, t.z, B.AIR); if (up === B.TORCH || up === B.MUSHROOM) this.give(up, 1); }
    s.fx.burst(W / 2, VIEW_H / 2, { colors: this.particleCols(v), count: 14, speed: 160, gravity: 500, size: 4 });
    s.sound.play(bi.tool === 'pick' ? 'brick' : 'bounce', 4);
    this.tire(0.05);
    const canDrop = !bi.tier || (tool && tool.tool === 'pick' && tool.tier >= bi.tier);
    if (canDrop) {
      const drop = bi.drop === undefined ? v : bi.drop;
      if (drop) this.give(drop, 1);
      for (const [id, ch] of bi.dropChance || []) if (s.rng.chance(ch)) this.give(id, 1);
      if (v === B.LEAVES && s.rng.chance(0.07 * f)) { this.give(I.APPLE, 1); s.fx.text(W / 2, VIEW_H * 0.45, '🍎', { size: 24 }); }
      if (bi.ore) {
        s.award(bi.ore, W / 2, VIEW_H / 2 - 30, { chain: true, color: '#fde047' });
        s.sound.play(v === B.CRYSTAL_ORE ? 'golden' : 'gem', s.comboCount);
      }
    } else if (bi.tier) s.fx.text(W / 2, VIEW_H * 0.58, 'Too hard for this tool…', { color: '#fca5a5', size: 16 });
    this.wearTool(tool && bi.tool && tool.tool ? 1 : 0);
    if (v === B.BED) { this.spawn = this.world.findSpawn(); this.bedSet = false; }
  }
  harvest(t) {
    const s = this.s, f = this.foodK();
    const n = 1 + (s.rng.chance(f * 0.6) ? 1 : 0) + (s.rng.chance(f * 0.3) ? 1 : 0);
    this.world.set(t.x, t.y, t.z, B.BUSH);
    this.give(I.BERRIES, n);
    s.sound.play('eat'); s.fx.burst(W / 2, VIEW_H / 2, { colors: ['#dc2626', '#fecaca', '#2f8434'], count: 10, speed: 120 });
    s.fx.text(W / 2, VIEW_H * 0.45, `+${n} berries`, { color: '#fca5a5', size: 18 });
  }
  particleCols(v) { const T = this.tex, o = (v * 3 + 1) * 1024 * 4; const c = (n) => `rgb(${T[o + n * 4]},${T[o + n * 4 + 1]},${T[o + n * 4 + 2]})`; return [c(70), c(300), c(620), c(900)]; }

  wearTool(n) {
    const it = this.held();
    if (!it || !INFO[it.id].dur || !n) return;
    it.dur -= n;
    if (it.dur <= 0) { this.inv[this.sel] = null; this.s.sound.play('metal'); this.s.fx.text(W / 2, VIEW_H * 0.6, 'Your tool broke!', { color: '#fca5a5', size: 18 }); }
  }

  use(target) {
    const s = this.s, it = this.held(), id = it?.id;
    this.useCd = 0.2;
    if (target && target.v === B.BUSH_RIPE) return this.harvest(target);
    if (id === I.BERRIES && target && (target.v === B.GRASS || target.v === B.DIRT || target.v === B.SAND)) {
      const px = target.px, py = target.py, pz = target.pz;
      if (this.world.inside(px, py, pz) && this.world.get(px, py, pz) === B.AIR) {
        this.world.set(px, py, pz, B.BUSH);
        it.n--; if (!it.n) this.inv[this.sel] = null;
        this.useCd = 0.3;
        this.s.fx.text(W / 2, VIEW_H * 0.45, 'Berry bush planted!', { color: '#86efac', size: 18 });
        return;
      }
    }
    if (it && INFO[id].food) { this.startEat(); return; }
    if (target) {
      if (target.v === B.TABLE || target.v === B.FURNACE) { this.findStations(); this.ui.toggle('inv'); return; }
      if (target.v === B.BED) return this.trySleep(target);
    }
    if (!it || !isBlock(id) || !PLACEABLE(id) || !target) return;
    let { px: x, py: y, pz: z } = target;
    const w = this.world;
    if (!w.inside(x, y, z) || y < 1) return;
    const cur = w.get(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER) return;
    const overlap = (bx, by, bz, hw, h) => bx + hw > x && bx - hw < x + 1 && bz + hw > z && bz - hw < z + 1 && by + h > y && by < y + 1;
    if (id !== B.TORCH && id !== B.MUSHROOM && (overlap(this.p.x, this.p.y, this.p.z, 0.3, 1.8) || this.mobs.some((m) => overlap(m.x, m.y, m.z, MOB[m.type].w / 2, MOB[m.type].h)))) return;
    if ((id === B.TORCH || id === B.MUSHROOM) && !this.solid(x, y - 1, z)) return;
    if (id === B.ALTAR) { if (!this.isNight()) { s.fx.text(W / 2, VIEW_H * 0.5, 'The altar only wakes at night…', { color: '#e9d5ff', size: 18 }); return; } if (this.boss) return; }
    w.set(x, y, z, id);
    it.n--; if (!it.n) this.inv[this.sel] = null;
    this.swingT = 0.2;
    s.sound.play('metal');
    if (id === B.TORCH) this.adv('torch');
    if (id === B.ALTAR) this.summon(x, y, z);
  }

  trySleep(t) {
    const s = this.s;
    this.spawn = [t.x + 0.5, t.y + 1, t.z + 0.5]; this.bedSet = true;
    if (!this.isNight()) { s.fx.text(W / 2, VIEW_H * 0.5, 'Respawn point set. You can only sleep at night.', { color: '#e0e7ff', size: 16 }); return; }
    if (this.energy < 3) { s.fx.text(W / 2, VIEW_H * 0.5, 'Too hungry to sleep…', { color: '#fca5a5', size: 18 }); return; }
    this.sleepT = 1.6;
    s.sound.play('life');
  }

  // ── Fighting ────────────────────────────────────────────────
  foeInFront(maxT) {
    const [ox, oy, oz] = this.eye(), [fx, fy, fz] = this.fwd();
    let best = null, bestZ = Math.min(maxT, 3.4);
    for (const m of this.mobs) {
      const M = MOB[m.type];
      const rx = m.x - ox, ry = m.y + M.h / 2 - oy, rz = m.z - oz;
      const zz = rx * fx + ry * fy + rz * fz;
      const reach = m.type === 'king' ? 4.8 : bestZ;
      if (zz < 0.1 || zz > reach) continue;
      const lat = Math.hypot(rx - fx * zz, ry - fy * zz, rz - fz * zz);
      if (lat < Math.max(M.w, M.h) * 0.62) { best = m; bestZ = Math.min(bestZ, zz); }
    }
    return best;
  }

  hit(m, dmgOverride, fromArrow) {
    const s = this.s, it = this.held(), info = it ? INFO[it.id] : null;
    const dmg = dmgOverride ?? (info && info.dmg && info.tool !== 'bow' ? info.dmg : 1) * (this.energy <= 6 ? 0.75 : 1);
    if (!fromArrow) { this.attackCd = 0.45; this.swingT = 0.3; this.tire(0.1); }
    m.hp -= dmg; m.flash = 0.15; m.aggro = true;
    const kx = fromArrow ? fromArrow[0] : this.fwd()[0], kz = fromArrow ? fromArrow[1] : this.fwd()[2], n = Math.hypot(kx, kz) || 1, kb = m.type === 'king' ? 2 : 7;
    m.vx = kx / n * kb; m.vz = kz / n * kb; m.vy = m.type === 'king' ? 0 : 5; m.stun = 0.4;
    if (m.type === 'boom') m.fuse = 0;
    s.sound.play('hit');
    if (!fromArrow) this.wearTool(info && info.dmg && info.tool !== 'bow' ? 1 : 0);
    if (m.hp <= 0) this.kill(m);
  }

  fireArrow(charge) {
    const s = this.s, k = Math.min(1, charge);
    if (k < 0.15 || !this.count(I.ARROW)) return;
    this.take(I.ARROW, 1);
    const [ex, ey, ez] = this.eye(), [fx, fy, fz] = this.fwd(), sp = 14 + k * 24;
    this.arrows.push({ x: ex + fx * 0.4, y: ey - 0.1 + fy * 0.4, z: ez + fz * 0.4, vx: fx * sp, vy: fy * sp, vz: fz * sp, dmg: 2 + k * 8, life: 4 });
    this.wearTool(1);
    s.sound.play('flap');
  }
  updateArrows(dt) {
    for (const a of this.arrows) {
      a.life -= dt; a.vy -= 12 * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      if (this.solid(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z))) { a.stuck = true; a.vx = a.vy = a.vz = 0; a.life = Math.min(a.life, 2); }
      if (a.stuck) continue;
      for (const m of this.mobs) {
        const M = MOB[m.type];
        if (Math.abs(a.x - m.x) < M.w * 0.6 && Math.abs(a.z - m.z) < M.w * 0.6 && a.y > m.y && a.y < m.y + M.h + 0.1) {
          a.life = 0; this.adv('bow'); this.hit(m, a.dmg, [a.vx, a.vz]);
          this.s.fx.text(W / 2, VIEW_H * 0.4, 'Hit!', { color: '#fde68a', size: 18 });
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.life > 0);
  }

  kill(m, byPlayer = true) {
    const s = this.s, M = MOB[m.type];
    if (m.dead) return;
    m.dead = true;
    s.fx.burst(W / 2, VIEW_H / 2, { colors: m.type === 'fluff' ? ['#f8fafc', '#fcd9b6'] : ['#7c3aed', '#c4b5fd', '#fde047', '#a3e635'], count: m.type === 'king' ? 80 : 20, speed: 260 });
    if (!byPlayer) return;
    for (const [id, a, b] of M.drops) { const n = s.rng.int(a, b); if (n) this.give(id, n); }
    if (m.type === 'fluff') { const f = this.foodK(); this.give(I.MEAT, 1 + (s.rng.chance(f * 0.55) ? 1 : 0)); }
    if (M.hostile) {
      s.award(Math.round(M.pts * (m.armoured ? 1.5 : 1)), W / 2, VIEW_H / 2 - 30, { chain: true, color: '#c4b5fd' });
      s.sound.play('powerup');
      this.kills++;
      this.adv('kill');
      if (this.kills >= 10) this.adv('hunter');
    } else s.award(M.pts, W / 2, VIEW_H / 2 - 30, { color: '#fff' });
    if (m.type === 'king') {
      this.boss = null;
      s.fx.shake(14, 0.8); s.fx.flash('#f0abfc', 0.3); s.fx.confetti(W, VIEW_H);
      this.adv('boss');
      for (const o of this.mobs) if (MOB[o.type].hostile) this.poof(o);
      s.after(2.5, () => { if (s.state === 'playing') s.finishRun(); });
    }
  }
  poof(m) { m.dead = true; }

  damage(n, why) {
    const s = this.s;
    if (this.bonus || this.hurtCd > 0 || s.state !== 'playing' || n <= 0) return;
    const prot = why === 'fall' || why === 'drown' || why === 'lava' || why === 'starve' ? 0 : this.protection();
    const d = Math.max(1, Math.round(n * (1 - prot)));
    this.health -= d;
    this.hurtCd = why === 'starve' ? 0 : 0.5; this.regenT = 0;
    if (prot > 0) for (let i = 0; i < 4; i++) { const a = this.armour[i]; if (a) { a.dur--; if (a.dur <= 0) this.armour[i] = null; } }
    s.sound.play('hit'); s.fx.shake(5, 0.2); s.fx.flash('#ff2244', 0.22);
    this.hurtFlash = 0.35;
    this.eatT = 0;
    if (this.health <= 0) {
      this.health = 0;
      const msg = { fall: 'You fell too far', lava: 'You tried to swim in lava', drown: 'You drowned', cactus: 'You hugged a cactus', boom: 'You were blown up', thorn: 'You were shot by a Thornback', king: 'The Shadow King got you', gloom: 'A Gloomling got you', crawler: 'A Crawler got you', starve: 'You starved' }[why] || 'You died';
      s.fx.text(W / 2, VIEW_H * 0.4, msg, { color: '#fca5a5', size: 22, life: 1.5 });
      this.dropGrave();
      s.hurt();
    }
  }

  /** Everything you carry drops into a grave where you fell. */
  dropGrave() {
    const items = [...this.inv, ...this.armour].filter(Boolean);
    this.inv = new Array(36).fill(null); this.armour = [null, null, null, null];
    if (!items.length || this.s.lives <= 1) { this.grave = null; return; }
    const p = this.p;
    let y = Math.floor(p.y);
    if (this.touching(p, 0.3, 1.8, B.LAVA) || y < 1) { // a grave in lava would be lost: put it on the nearest safe ground above
      y = this.world.top[clamp(Math.floor(p.z), 0, SZ - 1) * SX + clamp(Math.floor(p.x), 0, SX - 1)] + 1;
    }
    this.grave = { x: p.x, y, z: p.z, items };
  }
  openGrave() {
    const g = this.grave; this.grave = null;
    for (const it of g.items) {
      const a = INFO[it.id].armour;
      if (a !== undefined && !this.armour[a]) { this.armour[a] = it; continue; }
      const slot = this.inv.findIndex((x) => !x);
      if (INFO[it.id].stack === 1 && slot >= 0) this.inv[slot] = it; else this.give(it.id, it.n);
    }
    this.adv('grave');
    this.s.sound.play('life');
    this.ui.say('You got your things back!', '#a7f3d0');
  }

  onLifeLost() {
    const p = this.p;
    [p.x, p.y, p.z] = this.spawn;
    if (this.collides(p.x, p.y, p.z, 0.3, 1.8)) { const sp = this.world.findSpawn(); [p.x, p.y, p.z] = sp; }
    p.vx = p.vy = p.vz = 0; this.fallTop = p.y;
    this.health = 20; this.energy = Math.max(this.energy, 12); this.air = 10; this.hurtCd = 3; this.eatT = 0; this.bowT = 0;
    this.mobs = this.mobs.filter((m) => m.type === 'king' || !MOB[m.type].hostile || Math.hypot(m.x - p.x, m.z - p.z) > 14);
    this.shots = [];
    this.ui.close();
  }
  onGameOver() { this.unlock(); this.ui.close(); }

  // ── Creatures ───────────────────────────────────────────────
  summon(x, y, z) {
    const s = this.s;
    this.adv('altar');
    s.fx.shake(10, 1); s.fx.flash('#a78bfa', 0.3); s.sound.play('boom');
    s.fx.text(W / 2, VIEW_H * 0.3, '👑 THE SHADOW KING RISES', { color: '#e9d5ff', size: 26, life: 2.5 });
    const m = this.spawnMob('king', x + 0.5, y + 2, z + 0.5);
    m.shotT = 3; m.minionT = 10;
    this.boss = m;
    this.world.set(x, y, z, B.AIR);
  }

  spawnMob(type, x, y, z) {
    const st = this.stats(type);
    const m = { type, x, y, z, vx: 0, vy: 0, vz: 0, hp: st.hp, maxHp: st.hp, dmg: st.dmg, speed: st.speed, armoured: !!st.armoured, flash: 0, stun: 0, t: this.s.rng.range(0, 3), grounded: false, wander: 0, wx: 0, wz: 0, fuse: 0, shotT: 2, aggro: false };
    this.mobs.push(m);
    return m;
  }

  /** A safe-looking cell to spawn on: [x, y, z] or null */
  findSpawnCell(minD, maxD, wantDark) {
    const r = this.s.rng, w = this.world, p = this.p;
    for (let tries = 0; tries < 24; tries++) {
      const a = r.range(0, Math.PI * 2), d = r.range(minD, maxD);
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) continue;
      let y;
      if (wantDark === 'cave') {
        y = r.int(2, Math.max(2, w.top[z * SX + x] - 2));
        if (this.solid(x, y, z) || !this.solid(x, y - 1, z)) continue;
        const li = idx(x, y, z); if (w.sky[li] > 3 || w.blk[li] > 4) continue;
      } else {
        y = w.top[z * SX + x] + 1;
        const ground = w.get(x, y - 1, z);
        if (ground === B.WATER || ground === B.LAVA || ground === B.LEAVES || ground === B.CACTUS) continue;
        if (wantDark === 'grass' && ground !== B.GRASS && ground !== B.SNOW) continue;
        if (w.blk[idx(x, Math.min(y, SY - 1), z)] > 6) continue; // torches keep monsters away
      }
      if (y >= SY - 2 || this.solid(x, y, z) || this.solid(x, y + 1, z)) continue;
      return [x + 0.5, y, z + 0.5];
    }
    return null;
  }
  pickHostile() {
    const r = this.s.rng, d = this.day, opts = [['gloom', 5]];
    if (d >= 2) opts.push(['thorn', 3]);
    if (d >= 3) opts.push(['boom', 2]);
    if (d >= 4) opts.push(['crawler', 3]);
    let k = r.next() * opts.reduce((a, o) => a + o[1], 0);
    for (const [t, wgt] of opts) { k -= wgt; if (k <= 0) return t; }
    return 'gloom';
  }

  updateMobs(dt) {
    const s = this.s, p = this.p, r = s.rng;
    if (!this.bonus) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = Math.max(0.8, 2.4 - this.day * 0.12) / (this.bloodNight && this.isNight() ? 1.6 : 1);
        const hostiles = this.mobs.filter((m) => MOB[m.type].hostile && m.type !== 'king').length;
        const night = this.isNight();
        const cap = night ? Math.round(Math.min(12, 3 + this.day) * (this.bloodNight ? 1.6 : 1)) : Math.min(6, 2 + Math.floor(this.day / 2));
        if (hostiles < cap) {
          const cell = night ? (r.chance(0.7) ? this.findSpawnCell(14, 26, 'surface') : this.findSpawnCell(10, 22, 'cave')) : this.findSpawnCell(10, 22, 'cave');
          if (cell) this.spawnMob(this.pickHostile(), ...cell);
        }
      }
      this.passiveT -= dt;
      if (this.passiveT <= 0) {
        const f = this.foodK();
        this.passiveT = 5 / f;
        if (!this.isNight() && this.mobs.filter((m) => m.type === 'fluff').length < Math.max(1, Math.round(6 * f))) { const cell = this.findSpawnCell(12, 28, 'grass'); if (cell) this.spawnMob('fluff', ...cell); }
      }
    }
    for (const m of this.mobs) {
      const M = MOB[m.type];
      m.t += dt; m.flash = Math.max(0, m.flash - dt); m.stun = Math.max(0, m.stun - dt);
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz) || 1, dy = p.y - m.y;
      let tvx = 0, tvz = 0;
      if (m.type === 'fluff') {
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = r.range(2, 5); const a = r.range(0, Math.PI * 2), go = r.chance(0.6); m.wx = go ? Math.cos(a) : 0; m.wz = go ? Math.sin(a) : 0; }
        const flee = m.aggro && d < 10;
        tvx = flee ? -dx / d * 2.0 : m.wx * M.speed; tvz = flee ? -dz / d * 2.0 : m.wz * M.speed;
        // Sheep keep to dry land: look ahead before stepping (beaches sit a block above
        // the sea, so a sheep that steps off floats on the surface), and if one does end
        // up in the water — knocked in, or fleeing — it paddles back to the nearest shore.
        const look = M.w / 2 + 0.35;
        if (this.touching(m, M.w / 2, 0.5, B.WATER)) {
          const land = this.landDir(m);
          if (land) { tvx = land[0] * M.speed * 1.6; tvz = land[1] * M.speed * 1.6; m.wx = land[0]; m.wz = land[1]; }
        } else {
          const sp = Math.hypot(tvx, tvz);
          if (sp > 0.01) {
            const ux = tvx / sp, uz = tvz / sp;
            if (this.liquidAhead(m, ux, uz, look)) {
              let turned = false;
              for (const [rx, rz] of [[-uz, ux], [uz, -ux], [-ux, -uz]]) {
                if (!this.liquidAhead(m, rx, rz, look)) { tvx = rx * sp; tvz = rz * sp; m.wx = rx; m.wz = rz; turned = true; break; }
              }
              if (!turned) { tvx = 0; tvz = 0; m.wx = 0; m.wz = 0; }
            }
          }
        }
      } else if (m.type === 'thorn') {
        const want = d > 9 ? 1 : d < 5 ? -1 : 0;
        tvx = dx / d * m.speed * want; tvz = dz / d * m.speed * want;
        m.shotT -= dt;
        if (m.shotT <= 0 && d < 18 && this.canSee(m)) { m.shotT = r.range(1.8, 2.6) / s.speed(0.03, 1.4); this.shoot(m, 'dart', 13, m.dmg); }
      } else if (m.type === 'king') {
        const want = d > 5 ? 1 : -0.3;
        tvx = dx / d * M.speed * want; tvz = dz / d * M.speed * want;
        m.shotT -= dt; m.minionT -= dt;
        if (m.shotT <= 0) { m.shotT = m.hp < M.hp / 2 ? 1.6 : 2.6; for (let k2 = -1; k2 <= 1; k2++) this.shoot(m, 'orb', 10, 5, k2 * 0.25); s.sound.play('flap'); }
        if (m.minionT <= 0) { m.minionT = 12; for (let k2 = 0; k2 < 2; k2++) { const c = this.findSpawnCell(4, 9, 'surface'); if (c) this.spawnMob('gloom', ...c); } }
      } else {
        if (d < 22 || m.aggro) { tvx = dx / d * m.speed; tvz = dz / d * m.speed; }
        if (m.type === 'boom') {
          if (d < 2.4 && Math.abs(dy) < 2) { m.fuse += dt; tvx *= 0.2; tvz *= 0.2; if (m.fuse > 1.4) { this.explode(m); continue; } }
          else m.fuse = Math.max(0, m.fuse - dt * 2);
        }
      }
      if (m.stun > 0) { m.vx *= 0.97; m.vz *= 0.97; } else { m.vx += (tvx - m.vx) * Math.min(1, dt * 8); m.vz += (tvz - m.vz) * Math.min(1, dt * 8); }
      if (m.type === 'king') {
        const ground = this.world.top[clamp(Math.floor(m.z), 0, SZ - 1) * SX + clamp(Math.floor(m.x), 0, SX - 1)] + 1;
        const wantY = Math.max(ground + 1.2 + Math.sin(m.t * 1.5) * 0.6, p.y - 0.5);
        m.vy += (wantY - m.y) * dt * 3; m.vy *= 0.96;
        m.x = clamp(m.x + m.vx * dt, 2, SX - 2); m.z = clamp(m.z + m.vz * dt, 2, SZ - 2); m.y += m.vy * dt;
      } else {
        const inWater = this.touching(m, M.w / 2, 0.5, B.WATER);
        if (inWater && m.vy < 2.5) m.vy = Math.min(m.vy + 40 * dt, 2.5);
        const { hitX, hitZ } = this.moveBody(m, dt, M.w / 2, M.h, inWater ? 10 : 28);
        if ((hitX || hitZ) && m.stun <= 0) {
          if (m.type === 'crawler') m.vy = Math.max(m.vy, 4.5);          // crawlers climb straight up walls
          else if (m.grounded) m.vy = 8.2;
          else if (inWater) m.vy = Math.max(m.vy, 6);                    // swimmers climb out onto the bank
        }
        if (this.touching(m, M.w / 2, M.h, B.LAVA) || m.y < -2) { this.kill(m, false); continue; }
      }
      if (m.dmg && m.type !== 'thorn' && this.hurtCd <= 0) {
        const reach = m.type === 'king' ? 2.2 : 0.75;
        if (d < reach && m.y < p.y + 1.8 && m.y + M.h > p.y) { this.damage(m.dmg, m.type); if (s.state !== 'playing') return; const n = d || 1; p.vx += dx / n * 6; p.vz += dz / n * 6; p.vy = 5; }
      }
      if (m.type !== 'king' && d > 44) m.dead = true;
    }
    this.mobs = this.mobs.filter((m) => !m.dead);
  }

  canSee(m) {
    const [ex, ey, ez] = this.eye();
    const sx = m.x, sy = m.y + 0.8, sz = m.z, n = Math.ceil(Math.hypot(ex - sx, ey - sy, ez - sz) * 2);
    for (let i = 1; i < n; i++) { const k = i / n; if (this.solid(Math.floor(sx + (ex - sx) * k), Math.floor(sy + (ey - sy) * k), Math.floor(sz + (ez - sz) * k))) return false; }
    return true;
  }

  shoot(m, kind, speed, dmg, spread = 0) {
    const [ex, ey, ez] = this.eye();
    const sx = m.x, sy = m.y + MOB[m.type].h * 0.6, sz = m.z;
    let dx = ex - sx, dy = ey - 0.3 - sy, dz = ez - sz;
    const n = Math.hypot(dx, dy, dz) || 1;
    dx /= n; dy /= n; dz /= n;
    if (spread) { const c = Math.cos(spread), s2 = Math.sin(spread); [dx, dz] = [dx * c - dz * s2, dx * s2 + dz * c]; }
    this.shots.push({ kind, x: sx, y: sy, z: sz, vx: dx * speed, vy: dy * speed, vz: dz * speed, dmg, life: 4, from: m.type });
  }

  updateShots(dt) {
    const p = this.p;
    for (const b of this.shots) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.kind === 'dart') b.vy -= 4 * dt;
      if (this.solid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) b.life = 0;
      if (Math.abs(b.x - p.x) < 0.45 && Math.abs(b.z - p.z) < 0.45 && b.y > p.y && b.y < p.y + 1.85) { b.life = 0; this.damage(b.dmg, b.from); if (this.s.state !== 'playing') return; }
    }
    this.shots = this.shots.filter((b) => b.life > 0);
  }

  explode(m) {
    const s = this.s, w = this.world, R = 2.8;
    m.dead = true;
    const cx = Math.floor(m.x), cy = Math.floor(m.y + 0.5), cz = Math.floor(m.z);
    for (let y = cy - 3; y <= cy + 3; y++) for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (Math.hypot(x - cx, y - cy, z - cz) > R + s.rng.range(-0.4, 0.3)) continue;
      const v = w.get(x, y, z);
      if (!w.inside(x, y, z) || v === B.BEDROCK || v === B.WATER || v === B.AIR) continue;
      w.set(x, y, z, B.AIR);
    }
    const d = Math.hypot(this.p.x - m.x, this.p.y + 0.9 - m.y, this.p.z - m.z);
    s.sound.play('boom'); s.fx.shake(Math.max(4, 16 - d * 2), 0.5);
    if (d < 9) s.fx.flash('#fde68a', 0.3);
    if (d < 5) this.damage(Math.round((14 + Math.floor((this.day - 1) / 3) * 2) * (1 - d / 5)), 'boom');
  }

  updateStars(dt) {
    const s = this.s, r = s.rng, p = this.p;
    this.starT -= dt;
    if (this.starT <= 0) {
      this.starT = 0.22;
      const a = r.range(0, Math.PI * 2), d = r.range(2, 12);
      this.stars.push({ x: p.x + Math.cos(a) * d, y: SY + 2, z: p.z + Math.sin(a) * d, vy: -r.range(6, 10), landed: 0 });
    }
    for (const st of this.stars) {
      if (!st.landed) {
        st.y += st.vy * dt;
        if (st.y < 0 || this.solid(Math.floor(st.x), Math.floor(st.y), Math.floor(st.z))) { st.y = Math.floor(st.y) + 1; st.landed = 6; }
      } else st.landed -= dt;
      if (Math.hypot(st.x - p.x, st.z - p.z) < 1.3 && st.y > p.y - 1 && st.y < p.y + 2.2) {
        st.gone = true;
        s.award(100, W / 2, VIEW_H * 0.45, { chain: true, color: '#fde047' });
        s.sound.play('coin', s.comboCount);
      }
      if (st.landed < 0) st.gone = true;
    }
    this.stars = this.stars.filter((st) => !st.gone);
  }

  // ── Menus / idle ────────────────────────────────────────────
  idle(dt) {
    this.t += dt;
    const st = this.s.state;
    if (st === 'title') { this.yaw += dt * 0.12; this.pitch = -0.12; }
    if (st === 'title' || st === 'over' || st === 'legend') this.unlock();
    this.ui.update(dt);
  }

  onDetailChange(low) { if (this.gl) this.gl.quality = low ? 0.6 : 1; }

  /** How lit your hand is (0.25 … 1) */
  handLight() {
    if (this.bonus) return 1;
    const [ex, ey, ez] = this.eye(), [sk, bl] = this.world.light(Math.floor(ex), Math.floor(ey), Math.floor(ez));
    const day = 0.16 + 0.84 * this.daylight();
    return clamp(Math.max(Math.pow(0.8, 15 - sk * 15) * day, bl > 0 ? Math.pow(0.8, 15 - bl * 15) : 0), 0.25, 1);
  }

  /** Where the compass points: your grave first, then your bed. */
  compassTarget() {
    if (this.grave) return { x: this.grave.x, z: this.grave.z, icon: '🪦' };
    if (this.bedSet) return { x: this.spawn[0], z: this.spawn[2], icon: '🛏️' };
    return null;
  }

  // ── Drawing ─────────────────────────────────────────────────
  skyColours(day, sunY) {
    const mix = (a, b, k) => a + (b - a) * k;
    const dusk = Math.max(0, 1 - Math.abs(sunY) * 4) * (sunY > -0.25 ? 1 : 0);
    const top = [mix(6, 70, day), mix(8, 140, day), mix(28, 235, day)];
    const hor = [mix(mix(18, 175, day), 250, dusk * 0.6), mix(mix(24, 215, day), 150, dusk * 0.5), mix(mix(52, 255, day), 110, dusk * 0.5)];
    if (this.bloodNight && this.isNight()) { hor[0] = Math.max(hor[0], 70); hor[1] *= 0.5; hor[2] *= 0.45; top[0] += 30; }
    return { top: top.map((v) => v / 255), hor: hor.map((v) => v / 255) };
  }

  render(ctx) {
    const s = this.s;
    if (!['playing', 'banner', 'clear', 'dying'].includes(s.state) && document.pointerLockElement) this.unlock();
    const a = this.sunAngle();
    const sun = [Math.cos(a) * 0.92, Math.sin(a), 0.38];
    const sl = Math.hypot(...sun); sun[0] /= sl; sun[1] /= sl; sun[2] /= sl;
    const day = this.bonus ? 0.25 : this.daylight();
    const [ex, ey, ez] = this.eye();
    const uw = this.world.get(Math.floor(ex), Math.floor(ey), Math.floor(ez)) === B.WATER;
    const target = s.state === 'playing' ? this.target : null;
    const crack = this.mining?.k || 0;
    const cam = { x: ex, y: ey, z: ez, yaw: this.yaw, pitch: this.pitch };
    const lightOf = (x, y, z) => this.world.light(Math.floor(x), Math.floor(y), Math.floor(z));
    let drawn = null;
    if (this.gl) {
      const ents = [];
      for (const m of this.mobs) {
        const M = MOB[m.type];
        const bob = m.type === 'gloom' ? Math.abs(Math.sin(m.t * 6)) * 0.1 : 0;
        const fl = m.flash > 0 || (m.type === 'boom' && m.fuse > 0 && Math.sin(this.t * 30) > 0);
        const yaw = m.type === 'fluff' && Math.hypot(m.vx, m.vz) > 0.2 ? Math.atan2(m.vx, m.vz) : Math.atan2(ex - m.x, ez - m.z);
        const [sk, bl] = lightOf(m.x, m.y + 0.5, m.z);
        const groundY = this.world.top[Math.min(SZ - 1, Math.max(0, Math.floor(m.z))) * SX + Math.min(SX - 1, Math.max(0, Math.floor(m.x)))] + 1;
        ents.push({ x: m.x, y: m.y + bob, z: m.z, w: M.w * (m.type === 'king' ? 1.25 : 1.15) * (m.armoured ? 1.06 : 1), h: M.sprH, spr: m.type, yaw, flash: fl, sky: sk, blk: bl, gold: false, phase: m.t || 0, groundY, spd: Math.hypot(m.vx, m.vz) });
      }
      for (const b of this.shots) ents.push({ x: b.x, y: b.y - 0.2, z: b.z, w: 0.5, h: 0.5, spr: b.kind, yaw: Math.atan2(ex - b.x, ez - b.z), sky: 1, blk: 1 });
      for (const a2 of this.arrows) ents.push({ x: a2.x, y: a2.y - 0.25, z: a2.z, w: 0.9, h: 0.9, spr: 'arrow', yaw: a2.stuck ? a2.yaw : (a2.yaw = Math.atan2(a2.vx, a2.vz) - Math.PI / 2), ...(() => { const [sk, bl] = lightOf(a2.x, a2.y, a2.z); return { sky: sk, blk: bl }; })() });
      for (const st of this.stars) ents.push({ x: st.x, y: st.y, z: st.z, w: 0.8, h: 0.8, spr: 'star', yaw: this.t * 3, sky: 1, blk: 1 });
      if (this.grave) { const [sk, bl] = lightOf(this.grave.x, this.grave.y + 0.5, this.grave.z); ents.push({ x: this.grave.x, y: this.grave.y, z: this.grave.z, w: 0.9, h: 0.9, spr: 'grave', yaw: Math.atan2(ex - this.grave.x, ez - this.grave.z), sky: sk, blk: Math.max(bl, 0.5) }); }
      const { top, hor } = this.skyColours(day, sun[1]);
      const env = { day, sun, t: this.t, underwater: uw, target, crack, blood: this.bloodNight && this.isNight() ? 1 : 0, torch: 0.94 + 0.06 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3), top, horizon: hor, fogEnd: 34 + 30 * day };
      const t0 = performance.now();
      drawn = this.gl.render(this.world, cam, env, ents, W * s.scale, VIEW_H * s.scale);
      this.trackFrame(performance.now() - t0);
      if (drawn) { ctx.imageSmoothingEnabled = false; ctx.drawImage(drawn, 0, 0, W, VIEW_H); ctx.imageSmoothingEnabled = true; }
    }
    if (!drawn) {
      if (!this.renderer) this.renderer = new Renderer(this.tex, SPRITES, 2);
      const sprites = [];
      const lightAt = (x, y, z) => { const [sk, bl] = lightOf(x, y, z); return Math.max(Math.pow(0.8, 15 - sk * 15) * (0.12 + 0.88 * day), bl > 0 ? Math.pow(0.8, 15 - bl * 15) : 0, 0.1); };
      for (const m of this.mobs) {
        const M = MOB[m.type];
        const bob = m.type === 'gloom' ? Math.abs(Math.sin(m.t * 6)) * 0.1 : 0;
        const fl = m.flash > 0 || (m.type === 'boom' && m.fuse > 0 && Math.sin(this.t * 30) > 0);
        sprites.push({ x: m.x, y: m.y + bob, z: m.z, w: M.w * (m.type === 'king' ? 1.25 : 1.15), h: M.sprH, spr: m.type, flash: fl, light: lightAt(m.x, m.y + 0.5, m.z), flip: m.vx < 0 && m.type === 'fluff' });
      }
      for (const b of this.shots) sprites.push({ x: b.x, y: b.y - 0.2, z: b.z, w: 0.5, h: 0.5, spr: b.kind, light: 1 });
      for (const a2 of this.arrows) sprites.push({ x: a2.x, y: a2.y - 0.25, z: a2.z, w: 0.7, h: 0.7, spr: 'arrow', light: 1 });
      for (const st of this.stars) sprites.push({ x: st.x, y: st.y, z: st.z, w: 0.8, h: 0.8, spr: 'star', light: 1.1 });
      if (this.grave) sprites.push({ x: this.grave.x, y: this.grave.y, z: this.grave.z, w: 0.9, h: 0.9, spr: 'grave', light: 1 });
      const env = { day, sun, t: this.t, underwater: uw, target, crack };
      const t0 = performance.now();
      const img = this.renderer.render(this.world, cam, env, sprites);
      const ms = performance.now() - t0;
      if (s.state === 'playing') {
        this.perf.push(ms);
        if (this.perf.length >= 45) {
          const avg = this.perf.reduce((q, v) => q + v, 0) / this.perf.length; this.perf = [];
          if (avg > 14 && this.renderer.resIdx < this.renderer.resLevels - 1) this.renderer.setRes(this.renderer.resIdx + 1);
        }
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, this.renderer.RW, this.renderer.RH, 0, 0, W, VIEW_H);
      ctx.imageSmoothingEnabled = true;
    }
    this.ui.draw(ctx);
  }

  /** On slow devices, draw the 3D view at a lower resolution. */
  trackFrame() {
    const now = performance.now();
    if (this.lastFrame) this.frameDt.push(now - this.lastFrame);
    this.lastFrame = now;
    if (this.s.state !== 'playing') { this.frameDt = []; return; }
    if (this.frameDt.length >= 90) {
      const sorted = this.frameDt.slice().sort((a, b) => a - b), med = sorted[45];
      this.frameDt = [];
      if (med > 26 && this.gl.quality > 0.5) this.gl.quality = Math.max(0.5, this.gl.quality - 0.15);
    }
  }
}

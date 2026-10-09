// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — game 19 (Zone 4 · Ultra)
//  An open-world survival block game. You start with nothing on an island:
//  punch trees, craft tools, mine deeper, smelt iron, build a shelter before
//  night — and one day summon and defeat the Shadow King.
//
//  Fits the arcade like every other game:
//    • each sunrise is a new "level" (Day 2, Day 3 …) — surviving a night scores
//    • every 5th sunrise is a ★ STARFALL bonus round (20 s, nothing can hurt you)
//    • 3 lives: die and you respawn (at your bed if you slept in one) with your stuff
//    • score: advancements, ores, creatures defeated (combos!), nights survived
//    • the Daily Challenge gives everyone the same island
//  Files: items.js (blocks, recipes, advancements) · world.js (island + light)
//         textures.js (all the pixel art) · render.js (3D view) · ui.js (HUD & menus)
// ─────────────────────────────────────────────────────────────
import { runGame, clamp } from '../../assets/js/engine.js';
import { B, I, INFO, RECIPES, FUELS, ADV, ADV_BY_ID, isBlock, stackOf, PLACEABLE } from './items.js';
import { World, SX, SY, SZ, idx } from './world.js';
import { makeTextures, makeIcons, SPRITES } from './textures.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

const ID = 'tc-pixel-craft';
const W = 480, H = 720;
export const VIEW_H = 560;
// one day = 200 s: day until 125, sunset to 140, night to 190, sunrise to 200
const CYCLE = 200, NIGHT_START = 138, NIGHT_END = 192;
export const dayOfLevel = (L) => L - Math.floor(L / 5);

const SOLID = new Uint8Array(64).fill(1);
for (const b of [B.AIR, B.WATER, B.LAVA, B.TORCH]) SOLID[b] = 0;

// creature types
const MOB = {
  gloom: { hp: 16, w: 0.7, h: 0.9, sprH: 1.0, speed: 2.6, dmg: 3, pts: 60, hostile: true, drops: [[I.GEL, 1, 2]] },
  thorn: { hp: 14, w: 0.8, h: 1.0, sprH: 1.05, speed: 2.0, dmg: 3, pts: 70, hostile: true, drops: [[I.THORN, 0, 2], [I.STICK, 0, 1]] },
  boom: { hp: 14, w: 0.7, h: 1.1, sprH: 1.15, speed: 2.4, dmg: 0, pts: 80, hostile: true, drops: [[I.SPORE, 1, 2]] },
  fluff: { hp: 8, w: 0.8, h: 0.9, sprH: 1.0, speed: 1.4, dmg: 0, pts: 10, hostile: false, drops: [[I.WOOL, 1, 2], [I.MEAT, 1, 2]] },
  king: { hp: 420, w: 2.4, h: 2.8, sprH: 3.0, speed: 3.2, dmg: 6, pts: 5000, hostile: true, drops: [] },
};

let game = null;
runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 4,
  comboStep: 3,
  maxMultiplier: 5,
  bonusTime: 20,
  noCheckpoints: true,
  levelTitle: (L) => `Day ${dayOfLevel(L)}`,
  clearText: 'YOU SURVIVED THE NIGHT!',
  winTitle: '👑 The Shadow King has fallen!',
  levelClearPoints: (L, bonus) => bonus ? 500 : 300 * dayOfLevel(L),
  music: { bpm: 84, style: 'dream', lead: 'triangle', arp: [0, 2, 1, 2, 0, 1, 2, 1], oct: [0, 12, 0, 12, 0, 0, 12, 0], bass: 'half' },
  levelInfo(level, bonus) {
    if (bonus) return '★ STARFALL! Catch the falling stars. Nothing can hurt you for 20 seconds.';
    if (level === 1) return 'A new island. You have nothing. (E = your bag & crafting)';
    return 'The sun rises.';
  },
  create: (shell) => (game = new PixelCraft(shell)),
});

class PixelCraft {
  constructor(s) {
    this.s = s; this.t = 0;
    this.tex = makeTextures();
    this.icons = makeIcons(this.tex);
    this.touchUI = matchMedia('(pointer: coarse)').matches;
    this.renderer = new Renderer(this.tex, SPRITES, this.touchUI ? 2 : 0);
    this.world = new World();
    this.ui = new UI(this);
    this.keys = new Set();
    this.joy = null; this.look = null; this.mineTouch = null; this.jumpTouch = null;
    this.mineMouse = false; this.useQueued = false; this.perf = [];
    this.bindInput();
    this.fresh = true;
    this.newGame();
  }

  // ── A new island ────────────────────────────────────────────
  reset() { this.fresh = true; }

  newGame() {
    this.world.generate(this.s.rng);
    const sp = this.world.findSpawn();
    this.spawn = sp.slice();
    this.plantNear(sp);
    this.p = { x: sp[0], y: sp[1], z: sp[2], vx: 0, vy: 0, vz: 0, grounded: false, inWater: false };
    this.yaw = this.s.rng.range(0, Math.PI * 2); this.pitch = -0.1;
    this.health = 20; this.air = 10; this.hurtCd = 0; this.regenT = 0; this.fallTop = sp[1]; this.burnT = 0;
    this.inv = new Array(36).fill(null); this.armour = [null, null, null, null]; this.sel = 0;
    this.advs = new Set(); this.kills = 0; this.crafted = new Set();
    this.mobs = []; this.shots = []; this.stars = []; this.boss = null;
    this.dayT = 6; this.day = 1; this.spawnT = 3; this.passiveT = 1;
    this.mining = null; this.swingT = 0; this.attackCd = 0; this.useCd = 0;
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
    if (bonus) {
      this.stars = []; this.starT = 0; this.starsCaught = 0;
      for (const m of this.mobs) if (MOB[m.type].hostile && m.type !== 'king') this.poof(m);
      this.mobs = this.mobs.filter((m) => !m.dead);
      this.shots = [];
    }
  }

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
        if (c === 'KeyQ' && !this.ui.open) this.eatHeld();
      }
      this.keys.add(c);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mineMouse = false; this.joy = this.look = this.mineTouch = this.jumpTouch = null; });

    const logical = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = logical(e);
      if (!playing()) return;
      if (e.pointerType !== 'mouse') this.touchUI = true;
      if (this.ui.open) { this.ui.click(x, y); return; }
      // hotbar & on-screen buttons work for mouse and touch
      if (this.ui.hudClick(x, y, e.pointerType)) return;
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement !== cv) { this.lock(); }
        if (e.button === 0) this.mineMouse = true;
        if (e.button === 2) this.useQueued = true;
        return;
      }
      const b = this.ui.touchButton(x, y);
      if (b === 'mine') this.mineTouch = e.pointerId;
      else if (b === 'use') this.useQueued = true;
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
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mineMouse = false; return; }
      this.ui.dragEnd?.();
      if (this.joy && e.pointerId === this.joy.id) this.joy = null;
      if (this.look && e.pointerId === this.look.id) {
        // a quick tap on the view = use / place
        const l = this.look; this.look = null;
        if (Math.hypot(l.x - l.x0, l.y - l.y0) < 10 && performance.now() - l.t < 250 && playing() && !this.ui.open) this.useQueued = true;
      }
      if (this.mineTouch === e.pointerId) this.mineTouch = null;
      if (this.jumpTouch === e.pointerId) this.jumpTouch = null;
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
      if (!locked) this.mineMouse = false;
      if (!locked && this.wasLocked && playing() && !this.ui.open && !this.quietUnlock) s.togglePause();
      this.quietUnlock = false;
      this.wasLocked = locked;
    });
  }
  lock() { const cv = this.s.canvas; if (this.touchUI || !cv.requestPointerLock) return; try { const p = cv.requestPointerLock(); p?.catch?.(() => {}); } catch { /* ignore */ } }
  unlock() { if (document.pointerLockElement) { this.quietUnlock = true; document.exitPointerLock?.(); } }
  moveJoy(x, y) { const dx = x - 80, dy = y - 662, d = Math.hypot(dx, dy), m = Math.min(1, d / 48); this.joy.dx = d ? dx / d * m : 0; this.joy.dy = d ? dy / d * m : 0; }
  select(i) { this.sel = i; this.heldNameT = 1.6; this.mining = null; }

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
      // the fuel can't also be the thing you're smelting
      const need = r.needs[f[0]] || 0; if (need && this.count(f[0]) < need + f[1]) return false;
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
  checkArmour() {
    if (this.armour.every((a) => a && INFO[a.id].armour !== undefined)) this.adv('armour');
  }
  protection() { let p = 0; for (const a of this.armour) if (a) p += INFO[a.id].protect; return Math.min(0.8, p); }

  eatHeld() {
    const it = this.held();
    if (!it || !INFO[it.id].food || this.health >= 20) return false;
    this.health = Math.min(20, this.health + INFO[it.id].food);
    if (it.id === I.COOKED) this.adv('food');
    it.n--; if (!it.n) this.inv[this.sel] = null;
    this.s.sound.play('eat');
    this.s.fx.text(W / 2, VIEW_H * 0.55, '+♥', { color: '#f87171', size: 26 });
    return true;
  }

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

    // nearby crafting table / furnace
    this.stationsT -= dt;
    if (this.stationsT <= 0) { this.stationsT = 0.4; this.findStations(); }

    // look with keys
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0), tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    this.yaw += turn * 2.6 * dt; this.pitch = clamp(this.pitch + tilt * 1.8 * dt, -1.5, 1.5);

    // move
    const frozen = this.ui.open || this.sleepT;
    let fwdIn = frozen ? 0 : (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    let strafe = frozen ? 0 : (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (this.joy && !frozen) { fwdIn -= this.joy.dy; strafe += this.joy.dx; }
    const len = Math.hypot(fwdIn, strafe);
    if (len > 1) { fwdIn /= len; strafe /= len; }
    p.inWater = this.touching(p, 0.3, 1.0, B.WATER);
    const headWater = this.world.get(Math.floor(p.x), Math.floor(p.y + 1.62), Math.floor(p.z)) === B.WATER;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') ? 1.3 : 1;
    const speed = (p.inWater ? 2.6 : 4.3) * (fwdIn > 0 ? sprint : 1);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tvx = (sy * fwdIn + cy * strafe) * speed, tvz = (cy * fwdIn - sy * strafe) * speed;
    const acc = p.grounded || p.inWater ? 12 : 4;
    p.vx += (tvx - p.vx) * Math.min(1, dt * acc); p.vz += (tvz - p.vz) * Math.min(1, dt * acc);
    const jump = !frozen && (k.has('Space') || this.jumpTouch !== null);
    if (p.inWater) { p.vy *= 0.92; if (jump) p.vy = Math.min(p.vy + 30 * dt, 3.4); }
    else if (jump && p.grounded) p.vy = 8.6;
    const wasGrounded = p.grounded, vyBefore = p.vy;
    const { hitX, hitZ } = this.moveBody(p, dt, 0.3, 1.8, p.inWater ? 9 : 28);
    if ((hitX || hitZ) && p.grounded && len > 0.3) p.vy = 8.6; // step up single blocks
    // fall damage
    if (p.inWater || p.grounded && vyBefore >= -1) this.fallTop = p.y;
    if (!p.grounded && !p.inWater) this.fallTop = Math.max(this.fallTop, p.y);
    if (p.grounded && !wasGrounded && !p.inWater) { const fall = this.fallTop - p.y; if (fall > 3.5) this.damage(Math.floor(fall - 3), 'fall'); this.fallTop = p.y; }
    if (p.y < 6) this.adv('deep');

    // hazards
    if (this.touching(p, 0.3, 1.8, B.LAVA)) { this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.5; this.damage(4, 'lava'); } }
    if (this.touching({ x: p.x, y: p.y, z: p.z }, 0.36, 1.8, B.CACTUS)) { this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.6; this.damage(1, 'cactus'); } }
    if (headWater) { this.air = Math.max(0, this.air - dt); if (this.air <= 0) { this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 1; this.damage(2, 'drown'); } } }
    else this.air = Math.min(10, this.air + dt * 4);
    if (this.s.state !== 'playing') return;

    // health comes back slowly
    this.regenT += dt;
    if (this.regenT > 4 && this.health < 20 && this.hurtCd <= 0) { this.regenT = 0; this.health++; }

    // mine / attack / use
    if (!frozen) this.hands(dt);

    // creatures & projectiles
    this.updateMobs(dt);
    if (s.state !== 'playing') return;
    this.updateShots(dt);
    if (this.bonus) this.updateStars(dt);

    // light
    this.relightT -= dt;
    if (this.world.dirty && this.relightT <= 0) { this.relightT = 0.12; this.world.relight(); }
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
  sunAngle() { const t = this.dayT; return t < 135 ? Math.PI * (t + 5) / 140 : Math.PI + Math.PI * (t - 135) / 65; }
  isNight() { return !this.bonus && this.dayT > NIGHT_START && this.dayT < NIGHT_END; }
  daylight() { const a = this.sunAngle(); return clamp(Math.sin(a) * 3 + 0.35, 0, 1); }

  dawn() {
    const s = this.s;
    if (s.state !== 'playing') return;
    this.dayT = CYCLE;
    this.adv('night');
    // creatures of the night burn away in the sunlight (cave dwellers stay)
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
    if (mineHeld) {
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

    if (this.useQueued) { this.useQueued = false; if (this.useCd <= 0) this.use(target); }
  }

  breakTime(v, tool) {
    const bi = INFO[v];
    if (!bi || !isFinite(bi.hard)) return Infinity;
    if (bi.hard === 0) return 0.05;
    const right = tool && tool.tool === bi.tool;
    const canDrop = !bi.tier || (tool && tool.tool === 'pick' && tool.tier >= bi.tier);
    let time = bi.hard * (canDrop ? 1.5 : 5);
    if (right) time /= tool.speed;
    return Math.max(0.05, time);
  }

  breakBlock(t, tool) {
    const s = this.s, bi = INFO[t.v], v = t.v;
    this.mining = null;
    this.world.set(t.x, t.y, t.z, B.AIR);
    // things resting on top fall off (torches, cactus)
    const above = this.world.get(t.x, t.y + 1, t.z);
    if (above === B.TORCH) { this.world.set(t.x, t.y + 1, t.z, B.AIR); this.give(B.TORCH, 1); }
    s.fx.burst(W / 2, VIEW_H / 2, { colors: this.particleCols(v), count: 14, speed: 160, gravity: 500, size: 4 });
    s.sound.play(bi.tool === 'pick' ? 'brick' : 'bounce', 4);
    const canDrop = !bi.tier || (tool && tool.tool === 'pick' && tool.tier >= bi.tier);
    if (canDrop) {
      const drop = bi.drop === undefined ? v : bi.drop;
      if (drop) this.give(drop, 1);
      for (const [id, ch] of bi.dropChance || []) if (s.rng.chance(ch)) this.give(id, 1);
      if (bi.ore) {
        s.award(bi.ore, W / 2, VIEW_H / 2 - 30, { chain: true, color: '#fde047' });
        s.sound.play(v === B.CRYSTAL_ORE ? 'golden' : 'gem', s.comboCount);
      }
    } else if (bi.tier) {
      s.fx.text(W / 2, VIEW_H * 0.58, 'Too hard for this tool…', { color: '#fca5a5', size: 16 });
    }
    this.wearTool(tool && bi.tool && tool.tool ? 1 : 0);
    if (v === B.BED) { this.spawn = this.world.findSpawn(); }
  }
  particleCols(v) { const o = (v * 3 + 1) * 256 * 3; const c = (n) => `rgb(${this.tex[o + n * 3]},${this.tex[o + n * 3 + 1]},${this.tex[o + n * 3 + 2]})`; return [c(17), c(90), c(200), c(140)]; }

  wearTool(n) {
    const it = this.held();
    if (!it || !INFO[it.id].dur || !n) return;
    it.dur -= n;
    if (it.dur <= 0) { this.inv[this.sel] = null; this.s.sound.play('metal'); this.s.fx.text(W / 2, VIEW_H * 0.6, 'Your tool broke!', { color: '#fca5a5', size: 18 }); }
  }

  use(target) {
    const s = this.s, it = this.held(), id = it?.id;
    this.useCd = 0.2;
    if (it && INFO[id].food && this.health < 20) return this.eatHeld();
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
    if (id !== B.TORCH && (overlap(this.p.x, this.p.y, this.p.z, 0.3, 1.8) || this.mobs.some((m) => overlap(m.x, m.y, m.z, MOB[m.type].w / 2, MOB[m.type].h)))) return;
    if (id === B.TORCH && !this.solid(x, y - 1, z) && !this.solid(x + 1, y, z) && !this.solid(x - 1, y, z) && !this.solid(x, y, z + 1) && !this.solid(x, y, z - 1)) return;
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
    this.spawn = [t.x + 0.5, t.y + 1, t.z + 0.5];
    if (!this.isNight()) { s.fx.text(W / 2, VIEW_H * 0.5, 'Respawn point set. You can only sleep at night.', { color: '#e0e7ff', size: 16 }); return; }
    if (this.boss || this.mobs.some((m) => MOB[m.type].hostile && Math.hypot(m.x - this.p.x, m.z - this.p.z) < 10)) { s.fx.text(W / 2, VIEW_H * 0.5, 'You can\'t sleep — monsters nearby!', { color: '#fca5a5', size: 18 }); return; }
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

  hit(m) {
    const s = this.s, it = this.held(), info = it ? INFO[it.id] : null;
    const dmg = info && info.dmg ? info.dmg : 1;
    this.attackCd = 0.45; this.swingT = 0.3;
    m.hp -= dmg; m.flash = 0.15; m.aggro = true;
    const [fx, , fz] = this.fwd(), n = Math.hypot(fx, fz) || 1, kb = m.type === 'king' ? 2 : 7;
    m.vx = fx / n * kb; m.vz = fz / n * kb; m.vy = m.type === 'king' ? 0 : 5; m.stun = 0.4;
    if (m.type === 'boom') m.fuse = 0;
    s.sound.play('hit');
    this.wearTool(info && info.dmg ? 1 : 0);
    if (m.hp <= 0) this.kill(m);
  }

  kill(m, byPlayer = true) {
    const s = this.s, M = MOB[m.type];
    m.dead = true;
    s.fx.burst(W / 2, VIEW_H / 2, { colors: m.type === 'fluff' ? ['#f8fafc', '#fcd9b6'] : ['#7c3aed', '#c4b5fd', '#fde047', '#a3e635'], count: m.type === 'king' ? 80 : 20, speed: 260 });
    if (!byPlayer) return;
    for (const [id, a, b] of M.drops) { const n = s.rng.int(a, b); if (n) this.give(id, n); }
    if (M.hostile) {
      s.award(M.pts, W / 2, VIEW_H / 2 - 30, { chain: true, color: '#c4b5fd' });
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
    const prot = why === 'fall' || why === 'drown' || why === 'lava' ? 0 : this.protection();
    const d = Math.max(1, Math.round(n * (1 - prot)));
    this.health -= d;
    this.hurtCd = 0.5; this.regenT = 0;
    if (prot > 0) for (const a of this.armour) if (a) { a.dur--; if (a.dur <= 0) this.armour[this.armour.indexOf(a)] = null; }
    s.sound.play('hit'); s.fx.shake(5, 0.2); s.fx.flash('#ff2244', 0.22);
    this.hurtFlash = 0.35;
    if (this.health <= 0) {
      this.health = 0;
      const msg = { fall: 'You fell too far', lava: 'You tried to swim in lava', drown: 'You drowned', cactus: 'You hugged a cactus', boom: 'You were blown up', thorn: 'You were shot by a Thornback', king: 'The Shadow King got you', gloom: 'A Gloomling got you' }[why] || 'You died';
      s.fx.text(W / 2, VIEW_H * 0.4, msg, { color: '#fca5a5', size: 22, life: 1.5 });
      s.hurt();
    }
  }

  onLifeLost() {
    const p = this.p;
    [p.x, p.y, p.z] = this.spawn;
    if (this.collides(p.x, p.y, p.z, 0.3, 1.8)) { const sp = this.world.findSpawn(); [p.x, p.y, p.z] = sp; }
    p.vx = p.vy = p.vz = 0; this.fallTop = p.y;
    this.health = 20; this.air = 10; this.hurtCd = 3;
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
    const M = MOB[type];
    const m = { type, x, y, z, vx: 0, vy: 0, vz: 0, hp: M.hp, flash: 0, stun: 0, t: this.s.rng.range(0, 3), grounded: false, wander: 0, wx: 0, wz: 0, fuse: 0, shotT: 2, aggro: false };
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

  updateMobs(dt) {
    const s = this.s, p = this.p, r = s.rng;
    // spawning
    if (!this.bonus) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 2.2;
        const hostiles = this.mobs.filter((m) => MOB[m.type].hostile && m.type !== 'king').length;
        const cap = this.isNight() ? 4 + Math.min(this.day, 6) : 3;
        if (hostiles < cap) {
          const cell = this.isNight() ? (r.chance(0.7) ? this.findSpawnCell(14, 26, 'surface') : this.findSpawnCell(10, 22, 'cave')) : this.findSpawnCell(10, 22, 'cave');
          if (cell) { const pick = r.next(); this.spawnMob(pick < 0.5 ? 'gloom' : pick < 0.78 ? 'thorn' : 'boom', ...cell); }
        }
      }
      this.passiveT -= dt;
      if (this.passiveT <= 0) {
        this.passiveT = 5;
        if (!this.isNight() && this.mobs.filter((m) => m.type === 'fluff').length < 6) { const cell = this.findSpawnCell(12, 28, 'grass'); if (cell) this.spawnMob('fluff', ...cell); }
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
        tvx = flee ? -dx / d * 3.2 : m.wx * M.speed; tvz = flee ? -dz / d * 3.2 : m.wz * M.speed;
      } else if (m.type === 'thorn') {
        const want = d > 9 ? 1 : d < 5 ? -1 : 0;
        tvx = dx / d * M.speed * want; tvz = dz / d * M.speed * want;
        m.shotT -= dt;
        if (m.shotT <= 0 && d < 18 && this.canSee(m)) { m.shotT = r.range(1.8, 2.6); this.shoot(m, 'dart', 13, 3); }
      } else if (m.type === 'king') {
        const want = d > 5 ? 1 : -0.3;
        tvx = dx / d * M.speed * want; tvz = dz / d * M.speed * want;
        m.shotT -= dt; m.minionT -= dt;
        if (m.shotT <= 0) { m.shotT = m.hp < M.hp / 2 ? 1.6 : 2.6; for (let k2 = -1; k2 <= 1; k2++) this.shoot(m, 'orb', 10, 5, k2 * 0.25); s.sound.play('flap'); }
        if (m.minionT <= 0) { m.minionT = 12; for (let k2 = 0; k2 < 2; k2++) { const c = this.findSpawnCell(4, 9, 'surface'); if (c) this.spawnMob('gloom', ...c); } }
      } else {
        // gloom & boom: chase when close
        if (d < 22 || m.aggro) { tvx = dx / d * M.speed * s.speed(0.03, 1.5); tvz = dz / d * M.speed * s.speed(0.03, 1.5); }
        if (m.type === 'boom') {
          if (d < 2.4 && Math.abs(dy) < 2) { m.fuse += dt; tvx *= 0.2; tvz *= 0.2; if (m.fuse > 1.4) { this.explode(m); continue; } }
          else m.fuse = Math.max(0, m.fuse - dt * 2);
        }
      }
      if (m.stun > 0) { m.vx *= 0.97; m.vz *= 0.97; } else { m.vx += (tvx - m.vx) * Math.min(1, dt * 8); m.vz += (tvz - m.vz) * Math.min(1, dt * 8); }
      if (m.type === 'king') {
        // hovers above the ground
        const ground = this.world.top[clamp(Math.floor(m.z), 0, SZ - 1) * SX + clamp(Math.floor(m.x), 0, SX - 1)] + 1;
        const wantY = Math.max(ground + 1.2 + Math.sin(m.t * 1.5) * 0.6, p.y - 0.5);
        m.vy += (wantY - m.y) * dt * 3; m.vy *= 0.96;
        m.x = clamp(m.x + m.vx * dt, 2, SX - 2); m.z = clamp(m.z + m.vz * dt, 2, SZ - 2); m.y += m.vy * dt;
      } else {
        const inWater = this.touching(m, M.w / 2, 0.5, B.WATER);
        if (inWater) m.vy = Math.min(m.vy + 40 * dt, 2.5);
        const { hitX, hitZ } = this.moveBody(m, dt, M.w / 2, M.h, inWater ? 10 : 28);
        if ((hitX || hitZ) && m.grounded && m.stun <= 0) m.vy = 8.2;
        if (this.touching(m, M.w / 2, M.h, B.LAVA) || m.y < -2) { this.kill(m, false); continue; }
      }
      // contact damage
      if (M.dmg && m.type !== 'thorn' && this.hurtCd <= 0) {
        const reach = m.type === 'king' ? 2.2 : 0.75;
        if (d < reach && m.y < p.y + 1.8 && m.y + M.h > p.y) { this.damage(M.dmg, m.type); if (s.state !== 'playing') return; const n = d || 1; p.vx -= dx / n * -6; p.vz -= dz / n * -6; p.vy = 5; }
      }
      // wander too far → gone
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
    if (d < 5) this.damage(Math.round(14 * (1 - d / 5)), 'boom');
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

  // ── Drawing ─────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, p = this.p;
    if (!['playing', 'banner', 'clear', 'dying'].includes(s.state) && document.pointerLockElement) this.unlock();
    const a = this.sunAngle();
    const sun = [Math.cos(a) * 0.92, Math.sin(a), 0.38];
    const sl = Math.hypot(...sun); sun[0] /= sl; sun[1] /= sl; sun[2] /= sl;
    const day = this.bonus ? 0.25 : this.daylight();
    const [ex, ey, ez] = this.eye();
    const uw = this.world.get(Math.floor(ex), Math.floor(ey), Math.floor(ez)) === B.WATER;
    const sprites = [];
    const lightAt = (x, y, z) => { const [sk, bl] = this.world.light(Math.floor(x), Math.floor(y), Math.floor(z)); return Math.max(Math.pow(0.8, 15 - sk * 15) * (0.12 + 0.88 * day), bl > 0 ? Math.pow(0.8, 15 - bl * 15) : 0, 0.1); };
    for (const m of this.mobs) {
      const M = MOB[m.type];
      const bob = m.type === 'gloom' ? Math.abs(Math.sin(m.t * 6)) * 0.1 : 0;
      const fl = m.flash > 0 || (m.type === 'boom' && m.fuse > 0 && Math.sin(this.t * 30) > 0);
      sprites.push({ x: m.x, y: m.y + bob, z: m.z, w: M.w * (m.type === 'king' ? 1.25 : 1.15), h: M.sprH, spr: m.type, flash: fl, light: lightAt(m.x, m.y + 0.5, m.z), flip: m.vx < 0 && m.type === 'fluff' });
    }
    for (const b of this.shots) sprites.push({ x: b.x, y: b.y - 0.2, z: b.z, w: 0.5, h: 0.5, spr: b.kind, light: 1 });
    for (const st of this.stars) sprites.push({ x: st.x, y: st.y, z: st.z, w: 0.8, h: 0.8, spr: 'star', light: 1.1 + Math.sin(this.t * 10) * 0.1 });
    const env = { day, sun, t: this.t, underwater: uw, target: s.state === 'playing' ? this.target : null, crack: this.mining?.k || 0 };
    const t0 = performance.now();
    const img = this.renderer.render(this.world, { x: ex, y: ey, z: ez, yaw: this.yaw, pitch: this.pitch }, env, sprites);
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
    this.ui.draw(ctx);
  }
}

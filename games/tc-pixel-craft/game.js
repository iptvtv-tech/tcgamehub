// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — game 19 (Zone 4 · Ultra)
//  A first-person block world. Dig down, mine ore, build walls — and get the
//  job done before night falls and the gloomlings come hunting.
//
//  Every level is a brand-new world (built from s.rng, so the Daily Challenge
//  is the same world for everyone). Mine the ore quota to clear the level.
//    L1 a sunny meadow, no danger    L2 night falls, gloomlings hunt you
//    L3 lava lakes in the caves      L4 TNT — blow up ore for big combos
//    L6 gloomlings in the caves by day   L8 tougher gloomlings   days get shorter
//  Every 5th level: ★ CRYSTAL CAVERN — 20 s in a cave packed with ore, nothing can hurt you.
//
//  The renderer is a tiny voxel ray-caster: one ray per (chunky) pixel through
//  the block grid, written straight into an ImageData buffer. All textures,
//  creatures and the pickaxe are drawn in code.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, roundRect, clamp } from '../../assets/js/engine.js';

const ID = 'tc-pixel-craft';
const W = 480, H = 720;
const VIEW = { x: 0, y: 0, w: 480, h: 540 };
const PANEL_Y = VIEW.y + VIEW.h;

// World size (blocks)
const SX = 32, SY = 24, SZ = 32;
const idx = (x, y, z) => (y * SZ + z) * SX + x;

// Block ids
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, COAL = 4, IRON = 5, GOLD = 6, STAR = 7,
  WOOD = 8, LEAVES = 9, BEDROCK = 10, TNT = 11, LAVA = 12, COBBLE = 13, PLANKS = 14;
const NTYPES = 15;
const ORE_PTS = { [COAL]: 10, [IRON]: 25, [GOLD]: 50, [STAR]: 120 };
const ORE_COL = { [COAL]: '#9ca3af', [IRON]: '#f0b48a', [GOLD]: '#fde047', [STAR]: '#f472b6' };
const HARD = [0, 0.3, 0.25, 0.55, 0.6, 0.75, 0.85, 1.0, 0.45, 0.1, Infinity, 0.15, Infinity, 0.5, 0.4];
const DROP = { [GRASS]: DIRT, [DIRT]: DIRT, [STONE]: COBBLE, [COBBLE]: COBBLE, [WOOD]: PLANKS, [PLANKS]: PLANKS };
const BLOCK_COL = ['#000', '#4ea52f', '#8b5a2b', '#8a8a8a', '#3f3f46', '#d8a27a', '#f5c518', '#ec4899', '#6b4423', '#2f7d32', '#333', '#d63a2f', '#ff7a00', '#7b7b7b', '#b8874a'];
const isOre = (v) => v >= COAL && v <= STAR;

// Resolutions the renderer can drop to if a device is slow
const RES = [[160, 180], [128, 144], [96, 108]];

let game = null;
runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  comboWindow: 3,
  comboStep: 3,
  maxMultiplier: 5,
  bonusTime: 20,
  music: { bpm: 104, style: 'cosmic', lead: 'triangle', arp: [0, 1, 2, 1, 0, 2, 1, 2], oct: [0, 0, 12, 0, 0, 12, 0, 12], bass: 'half' },
  levelClearPoints: (level, bonus) => bonus ? 500 : level * 150 + (game && isFinite(game.dayLeft) ? Math.floor(Math.max(0, game.dayLeft)) * 10 : 0),
  levelInfo(level, bonus) {
    if (bonus) return '★ CRYSTAL CAVERN! Ore everywhere and nothing can hurt you. Mine fast!';
    const notes = {
      1: 'Mine the ore quota! Hold to dig (click / E, or MINE on touch). Right-click / Q builds a block.',
      2: 'When the sun bar runs out, night falls and gloomlings hunt you. Whack them — or wall yourself in!',
      3: '🔥 Lava lakes at the bottom of the caves. Don\'t fall in!',
      4: '🧨 TNT! Mine it to light the fuse, then run. Blast ore for huge combos.',
      6: 'Gloomlings now lurk in the caves even in daylight.',
      8: 'Tougher gloomlings — it takes three whacks now.',
    };
    return notes[level] || 'Shorter day, more ore to find. Keep digging!';
  },
  create: (shell) => (game = new PixelPickaxe(shell)),
});

// ── Textures (8×8, drawn in code) ───────────────────────────
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function makeTextures() {
  // TEX[((type * 3 + face) * 64 + v * 8 + u) * 3 + c]  face: 0 top, 1 side, 2 bottom
  const T = new Uint8Array(NTYPES * 3 * 64 * 3);
  const r = prng(1234);
  const put = (type, face, u, v, col) => { const o = ((type * 3 + face) * 64 + v * 8 + u) * 3; T[o] = col[0]; T[o + 1] = col[1]; T[o + 2] = col[2]; };
  const fill = (type, faces, pal, fn) => {
    const P = pal.map(hex);
    for (const f of faces) for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      const c = fn ? fn(u, v, f, P) : null;
      put(type, f, u, v, c || P[Math.floor(r() * P.length)]);
    }
  };
  const ALL = [0, 1, 2];
  const dirtP = ['#8b5a2b', '#7a4e25', '#9c6833', '#6e4520'];
  const stoneP = ['#8a8a8a', '#7b7b7b', '#959595', '#838383'];
  fill(DIRT, ALL, dirtP);
  fill(GRASS, [0], ['#5fbf3a', '#4ea52f', '#6fcf45', '#57b335']);
  fill(GRASS, [2], dirtP);
  fill(GRASS, [1], dirtP, (u, v) => (v < 2 || (v === 2 && r() < 0.5)) ? hex(['#5fbf3a', '#4ea52f', '#6fcf45'][Math.floor(r() * 3)]) : null);
  fill(STONE, ALL, stoneP);
  const ore = (type, spots) => fill(type, ALL, stoneP, (u, v) => {
    const k = (u * 7 + v * 13 + type * 5) % 11;
    return (k < 5 && (u + v) % 2 === 0) ? hex(spots[(u + v) % spots.length]) : null;
  });
  ore(COAL, ['#222222', '#333333', '#1a1a1a']);
  ore(IRON, ['#d8a27a', '#e9bb94', '#c48a62']);
  ore(GOLD, ['#f5c518', '#ffe066', '#e0a800']);
  ore(STAR, ['#ff5fd2', '#c084fc', '#ffffff', '#f472b6']);
  fill(WOOD, [1], ['#6b4423', '#5a381c'], (u) => hex(u % 3 === 0 ? '#4a2e16' : r() < 0.5 ? '#6b4423' : '#5a381c'));
  fill(WOOD, [0, 2], ['#a0743f'], (u, v) => { const d = Math.max(Math.abs(u - 3.5), Math.abs(v - 3.5)); return hex(d > 3 ? '#5a381c' : (Math.floor(d) % 2 ? '#b8874a' : '#a0743f')); });
  fill(LEAVES, ALL, ['#2f7d32', '#3a9a3d', '#24632a', '#1d4f22']);
  fill(BEDROCK, ALL, ['#333333', '#555555', '#222222', '#444444']);
  fill(TNT, [1], ['#d63a2f'], (u, v) => v === 3 || v === 4 ? hex(u % 2 ? '#f5f5f5' : '#e2e2e2') : hex(u % 4 === 0 ? '#a72a21' : '#d63a2f'));
  fill(TNT, [0, 2], ['#d63a2f'], (u, v) => (u > 2 && u < 5 && v > 2 && v < 5) ? hex('#1f1f1f') : hex((u + v) % 3 ? '#c9352b' : '#e04a3c'));
  fill(LAVA, ALL, ['#ff7a00', '#ffb000', '#e04a00', '#ff9100']);
  fill(COBBLE, ALL, ['#6b6b6b'], (u, v) => hex((u % 4 === 0 || (v + (u > 3 ? 2 : 0)) % 4 === 0) ? '#4f4f4f' : r() < 0.5 ? '#8e8e8e' : '#7d7d7d'));
  fill(PLANKS, ALL, ['#b8874a'], (u, v) => hex(v % 4 === 3 ? '#7c5a2f' : (u === (v < 4 ? 2 : 6) ? '#8f6a38' : r() < 0.5 ? '#b8874a' : '#a8773e')));
  return T;
}

// Gloomling sprite (8×8): 0 clear, 1 body, 2 dark, 3 eye, 4 eye shine
const GLOOM = [
  '00111100',
  '01111110',
  '11211211',
  '13311331',
  '13411341',
  '11111111',
  '12122121',
  '01100110',
].map((row) => [...row].map(Number));

// Small seeded value noise for terrain + caves
function makeNoise(rand) {
  const P = new Float32Array(4096).map(() => rand());
  const h = (x, y, z) => P[((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & 4095];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = sm(x - x0), fy = sm(y - y0), fz = sm(z - z0);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(x0, y0, z0), h(x0 + 1, y0, z0), fx), l(h(x0, y0 + 1, z0), h(x0 + 1, y0 + 1, z0), fx), fy),
      l(l(h(x0, y0, z0 + 1), h(x0 + 1, y0, z0 + 1), fx), l(h(x0, y0 + 1, z0 + 1), h(x0 + 1, y0 + 1, z0 + 1), fx), fy), fz);
  };
}

class PixelPickaxe {
  constructor(s) {
    this.s = s; this.t = 0;
    this.tex = makeTextures();
    this.world = new Uint8Array(SX * SY * SZ);
    this.colTop = new Int8Array(SX * SZ);
    this.touchUI = matchMedia('(pointer: coarse)').matches;
    this.resIdx = this.touchUI ? 1 : 0;
    this.setRes(this.resIdx);
    this.crack = Array.from({ length: 64 }, (_, i) => ((i * 37 + (i >> 3) * 11) % 64) / 64);
    this.keys = new Set();
    this.joy = null; this.look = null; this.mineTouch = null;
    this.mineMouse = false; this.prevMine = false;
    this.placeQueued = false; this.jumpQueued = false;
    this.perf = []; this.runEnemiesBonked = 0;
    this.bindInput();
    this.startLevel(1, false);
  }

  setRes(i) {
    const [rw, rh] = RES[i];
    this.RW = rw; this.RH = rh;
    this.off = document.createElement('canvas'); this.off.width = rw; this.off.height = rh;
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(rw, rh);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(rw * rh);
  }

  reset() { this.runEnemiesBonked = 0; }

  // ── Input ───────────────────────────────────────────────────
  bindInput() {
    const s = this.s, cv = s.canvas;
    const typing = (e) => e.target instanceof HTMLInputElement;
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['KeyE', 'KeyQ', 'KeyR', 'KeyF', 'KeyJ', 'KeyK'].includes(e.code) && s.state === 'playing') e.preventDefault();
      if (!e.repeat && (e.code === 'KeyQ' || e.code === 'KeyK') && s.state === 'playing') this.placeQueued = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mineMouse = false; this.joy = this.look = this.mineTouch = null; });

    const logical = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = logical(e);
      if (e.pointerType === 'mouse') {
        if (s.state !== 'playing') return;
        if (document.pointerLockElement !== cv && cv.requestPointerLock) { try { const p = cv.requestPointerLock(); p?.catch?.(() => {}); } catch { /* ignore */ } }
        if (e.button === 0) this.mineMouse = true;
        if (e.button === 2) this.placeQueued = true;
        return;
      }
      this.touchUI = true;
      if (s.state !== 'playing') return;
      if (y >= PANEL_Y) {
        const b = this.buttonAt(x, y);
        if (b === 'mine') this.mineTouch = e.pointerId;
        else if (b === 'build') this.placeQueued = true;
        else if (b === 'jump') this.jumpQueued = true;
        else if (x < 220) this.joy = { id: e.pointerId, dx: 0, dy: 0 }, this.moveJoy(x, y);
      } else this.look = { id: e.pointerId, x, y };
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      const [x, y] = logical(e);
      if (this.joy && e.pointerId === this.joy.id) this.moveJoy(x, y);
      if (this.look && e.pointerId === this.look.id) {
        if (s.state === 'playing') { this.yaw += (x - this.look.x) * 0.012; this.pitch = clamp(this.pitch - (y - this.look.y) * 0.010, -1.45, 1.45); }
        this.look.x = x; this.look.y = y;
      }
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mineMouse = false; return; }
      if (this.joy && e.pointerId === this.joy.id) this.joy = null;
      if (this.look && e.pointerId === this.look.id) this.look = null;
      if (this.mineTouch === e.pointerId) this.mineTouch = null;
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== cv || s.state !== 'playing') return;
      this.yaw += e.movementX * 0.0026;
      this.pitch = clamp(this.pitch - e.movementY * 0.0026, -1.45, 1.45);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === cv;
      if (!locked) this.mineMouse = false;
      if (!locked && this.wasLocked && s.state === 'playing') s.togglePause();
      this.wasLocked = locked;
    });
  }

  // Touch layout (bottom panel)
  get BTN() { return { mine: [330, 612, 40], build: [428, 612, 34], jump: [380, 684, 30] }; }
  buttonAt(x, y) { for (const [k, [bx, by, br]] of Object.entries(this.BTN)) if (Math.hypot(x - bx, y - by) < br + 8) return k; return null; }
  moveJoy(x, y) { const dx = x - 95, dy = y - 630, d = Math.hypot(dx, dy), m = Math.min(1, d / 55); this.joy.dx = d ? dx / d * m : 0; this.joy.dy = d ? dy / d * m : 0; }

  // ── World building ──────────────────────────────────────────
  get(x, y, z) { return (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0) ? BEDROCK : y >= SY ? AIR : this.world[idx(x, y, z)]; }
  set(x, y, z, v) { if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0 || y >= SY) return; this.world[idx(x, y, z)] = v; this.updateCol(x, z); }
  updateCol(x, z) { let y = SY - 1; while (y > 0 && (this.world[idx(x, y, z)] === AIR || this.world[idx(x, y, z)] === LAVA)) y--; this.colTop[z * SX + x] = y; }
  solid(x, y, z) { const v = this.get(x, y, z); return v !== AIR && v !== LAVA; }

  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.enemies = []; this.lit = []; this.ores = 0; this.placed = 0; this.bonusOres = 0;
    this.mining = null; this.swingT = 0; this.attackCd = 0; this.invuln = 0; this.hurtT = 0;
    this.blocks = 12; this.placeType = COBBLE;
    this.spawnT = 3;
    this.world.fill(AIR);
    if (bonus) this.buildCavern(r); else this.buildWorld(level, r);
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) this.updateCol(x, z);
    this.dayLen = level <= 1 || bonus ? Infinity : Math.max(22, 55 - (level - 2) * 4);
    this.dayLeft = this.dayLen;
    this.respawn(true);
  }

  buildWorld(level, r) {
    const noise = makeNoise(r.next), w = this.world;
    const cx = SX >> 1, cz = SZ >> 1;
    const hmap = new Int8Array(SX * SZ);
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let h = 10 + (noise(x / 9, 0.5, z / 9) - 0.5) * 9 + (noise(x / 4, 3.5, z / 4) - 0.5) * 3;
      h = Math.round(clamp(h, 7, 16));
      hmap[z * SX + x] = h;
      for (let y = 0; y <= h; y++) w[idx(x, y, z)] = y === 0 ? BEDROCK : y === h ? GRASS : y >= h - 2 ? DIRT : STONE;
    }
    // Caves
    for (let y = 1; y < SY; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      if (y > hmap[z * SX + x] - 3) continue;
      const n = noise(x / 6, y / 4.5 + 20, z / 6) * 0.7 + noise(x / 3, y / 3 + 40, z / 3) * 0.3;
      if (n > 0.6) w[idx(x, y, z)] = AIR;
    }
    // Sinkholes (cave entrances), away from the spawn
    const holes = 2 + (level > 3 ? 1 : 0);
    for (let i = 0; i < holes; i++) {
      let hx, hz, tries = 0;
      do { hx = r.int(4, SX - 5); hz = r.int(4, SZ - 5); } while (Math.hypot(hx - cx, hz - cz) < 7 && ++tries < 30);
      const bottom = r.int(3, 6);
      for (let y = bottom; y < SY; y++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > (y > bottom + 3 ? 2 : 1)) continue;
        const v = w[idx(hx + dx, y, hz + dz)];
        if (v !== BEDROCK) w[idx(hx + dx, y, hz + dz)] = AIR;
      }
    }
    // Ore
    for (let y = 1; y < SY; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      if (w[idx(x, y, z)] !== STONE) continue;
      const d = hmap[z * SX + x] - y, p = r.next();
      if (y <= 5 && p < 0.016) w[idx(x, y, z)] = STAR;
      else if (d > 5 && p < 0.04) w[idx(x, y, z)] = GOLD;
      else if (d > 3 && p < 0.08) w[idx(x, y, z)] = IRON;
      else if (p < 0.13) w[idx(x, y, z)] = COAL;
    }
    // Lava lakes (level 3+)
    if (level >= 3) {
      const top = level >= 7 ? 2 : 1;
      for (let y = 1; y <= top; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) if (w[idx(x, y, z)] === AIR) w[idx(x, y, z)] = LAVA;
    }
    // TNT (level 4+)
    if (level >= 4) {
      const n = 5 + Math.floor(level / 2);
      for (let i = 0; i < n; i++) {
        const x = r.int(1, SX - 2), z = r.int(1, SZ - 2), y = r.int(2, Math.max(3, hmap[z * SX + x] - 3));
        if (w[idx(x, y, z)] === STONE) w[idx(x, y, z)] = TNT;
      }
      for (let i = 0; i < 2; i++) { const x = r.int(3, SX - 4), z = r.int(3, SZ - 4); if (Math.hypot(x - cx, z - cz) > 5) w[idx(x, hmap[z * SX + x] + 1, z)] = TNT; }
    }
    // An ore boulder near the start on the first levels, so there's something to mine straight away
    if (level <= 2) {
      const bx = cx + 4, bz = cz + 1, by = hmap[bz * SX + bx] + 1;
      const oreList = [COAL, COAL, IRON, COAL, IRON, GOLD];
      for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) w[idx(bx + dx, by + dy, bz + dz)] = r.chance(0.6) ? r.pick(oreList) : STONE;
    }
    // Trees
    const trees = r.int(6, 10);
    for (let i = 0; i < trees; i++) {
      const x = r.int(2, SX - 3), z = r.int(2, SZ - 3);
      if (Math.hypot(x - cx, z - cz) < 4) continue;
      const g = hmap[z * SX + x];
      if (w[idx(x, g, z)] !== GRASS) continue;
      const th = r.int(3, 5);
      for (let y = 1; y <= th; y++) w[idx(x, g + y, z)] = WOOD;
      for (let y = th - 1; y <= th + 1; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const rad = y === th + 1 ? 1 : 2;
        if (Math.abs(dx) > rad || Math.abs(dz) > rad || (Math.abs(dx) === 2 && Math.abs(dz) === 2)) continue;
        const yy = g + y; if (yy >= SY) continue;
        if (w[idx(x + dx, yy, z + dz)] === AIR) w[idx(x + dx, yy, z + dz)] = LEAVES;
      }
    }
    // The quota: never more than half the ore in the world
    let total = 0;
    for (let i = 0; i < w.length; i++) if (isOre(w[i])) total++;
    this.quota = Math.min(5 + (level - 1) * 2, 26);
    while (total < this.quota * 2) {
      const x = r.int(1, SX - 2), z = r.int(1, SZ - 2), y = r.int(2, 8);
      if (w[idx(x, y, z)] === STONE) { w[idx(x, y, z)] = r.chance(0.5) ? COAL : IRON; total++; }
    }
  }

  buildCavern(r) {
    const w = this.world;
    for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) w[idx(x, y, z)] = y === 0 ? BEDROCK : y < 13 ? STONE : AIR;
    const x0 = 7, x1 = 24, z0 = 7, z1 = 24, y0 = 3, y1 = 9;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w[idx(x, y, z)] = AIR;
    const pick = () => { const p = r.next(); return p < 0.35 ? COAL : p < 0.6 ? IRON : p < 0.85 ? GOLD : STAR; };
    for (let y = 1; y < 13; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      if (w[idx(x, y, z)] !== STONE) continue;
      const dx = Math.max(x0 - x, x - x1, 0), dz = Math.max(z0 - z, z - z1, 0), dy = Math.max(y0 - y, y - y1, 0);
      if (dx + dz + dy <= 3 && r.chance(0.55)) w[idx(x, y, z)] = pick();
    }
    // Crystal pillars in the middle
    for (let i = 0; i < 6; i++) {
      const x = r.int(x0 + 2, x1 - 2), z = r.int(z0 + 2, z1 - 2);
      if (Math.abs(x - 16) < 3 && Math.abs(z - 16) < 3) continue;
      const ht = r.int(2, 5);
      for (let y = y0; y < y0 + ht; y++) w[idx(x, y, z)] = pick();
    }
    this.quota = Infinity;
  }

  respawn(first) {
    const cx = SX >> 1, cz = SZ >> 1;
    let y = SY - 3;
    if (this.bonus) y = 3;
    else { while (y > 1 && !this.solid(cx, y - 1, cz)) y--; }
    // make sure there's room to stand
    for (let dy = 0; dy < 2; dy++) if (this.solid(cx, y + dy, cz)) this.set(cx, y + dy, cz, AIR);
    this.px = cx + 0.5; this.py = y; this.pz = cz + 0.5;
    this.vx = this.vy = this.vz = 0; this.grounded = false;
    if (first) { this.yaw = 0.6; this.pitch = -0.25; }
    this.spawnY = y;
  }

  onLifeLost() {
    this.enemies = this.enemies.filter((e) => Math.hypot(e.x - (SX >> 1), e.z - (SZ >> 1)) > 10);
    this.lit = [];
    this.respawn(false);
    this.invuln = 2.5; this.mining = null;
  }
  onGameOver() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  // ── Physics helpers ─────────────────────────────────────────
  collides(x, y, z, hw, h) {
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-4), y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-4), z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-4);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (this.solid(xx, yy, zz)) return true;
    return false;
  }
  /** Move a body {x,y,z,vx,vy,vz} with collisions. Returns { hitX, hitZ }. */
  moveBody(b, dt, hw, h) {
    let hitX = false, hitZ = false;
    const nx = b.x + b.vx * dt;
    if (this.collides(nx, b.y, b.z, hw, h)) { hitX = true; b.vx = 0; } else b.x = nx;
    const nz = b.z + b.vz * dt;
    if (this.collides(b.x, b.y, nz, hw, h)) { hitZ = true; b.vz = 0; } else b.z = nz;
    b.vy -= 26 * dt;
    const ny = b.y + b.vy * dt;
    b.grounded = false;
    if (this.collides(b.x, ny, b.z, hw, h)) {
      if (b.vy < 0) { const snap = Math.floor(ny) + 1; if (!this.collides(b.x, snap, b.z, hw, h) && snap <= b.y + 0.01) b.y = snap; b.grounded = true; }
      b.vy = 0;
    } else b.y = ny;
    return { hitX, hitZ };
  }
  inLava(x, y, z, hw, h) {
    for (let yy = Math.floor(y); yy <= Math.floor(y + h - 0.01); yy++) for (const [dx, dz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) if (this.get(Math.floor(x + dx), yy, Math.floor(z + dz)) === LAVA) return true;
    return false;
  }

  eye() { return [this.px, this.py + 1.55, this.pz]; }
  fwd() { const cp = Math.cos(this.pitch); return [cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw)]; }

  /** The block under the crosshair: { x,y,z, px,py,pz (the empty cell before it), t } */
  castBlock(reach = 5) {
    const [ox, oy, oz] = this.eye(), [dx, dy, dz] = this.fwd();
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tx = (dx > 0 ? x + 1 - ox : ox - x) * tdx, ty = (dy > 0 ? y + 1 - oy : oy - y) * tdy, tz = (dz > 0 ? z + 1 - oz : oz - z) * tdz;
    let px = x, py = y, pz = z, t = 0;
    while (t <= reach) {
      px = x; py = y; pz = z;
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
      if (t > reach) break;
      if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0 || y >= SY) return null;
      const v = this.world[idx(x, y, z)];
      if (v !== AIR) return { x, y, z, px, py, pz, t, v };
    }
    return null;
  }

  // ── Game loop ───────────────────────────────────────────────
  onAction(a) { if (a === 'action') this.jumpQueued = true; }

  update(dt) {
    const s = this.s, k = this.keys;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);

    // Look (keyboard)
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    this.yaw += turn * 2.6 * dt;
    const tilt = (k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0);
    this.pitch = clamp(this.pitch + tilt * 1.8 * dt, -1.45, 1.45);

    // Move
    let fwdIn = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (this.joy) { fwdIn -= this.joy.dy; strafe += this.joy.dx; }
    const len = Math.hypot(fwdIn, strafe);
    if (len > 1) { fwdIn /= len; strafe /= len; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), SPEED = 4.4;
    const tvx = (sy * fwdIn + cy * strafe) * SPEED, tvz = (cy * fwdIn - sy * strafe) * SPEED;
    const acc = this.grounded ? 1 : 0.35;
    this.vx += (tvx - this.vx) * Math.min(1, dt * 14 * acc);
    this.vz += (tvz - this.vz) * Math.min(1, dt * 14 * acc);
    const wantJump = this.jumpQueued || k.has('Space');
    this.jumpQueued = false;
    const body = { x: this.px, y: this.py, z: this.pz, vx: this.vx, vy: this.vy, vz: this.vz };
    if (wantJump && this.grounded) body.vy = 8.4;
    const { hitX, hitZ } = this.moveBody(body, dt, 0.3, 1.75);
    // auto-jump up single blocks while walking
    if ((hitX || hitZ) && body.grounded && len > 0.3) body.vy = 8.4;
    if (!(hitX || hitZ)) { this.vx = body.vx; this.vz = body.vz; } else { if (hitX) this.vx = 0; if (hitZ) this.vz = 0; }
    this.px = body.x; this.py = body.y; this.pz = body.z; this.vy = body.vy; this.grounded = body.grounded;
    if (!this.bonus && this.inLava(this.px, this.py, this.pz, 0.3, 1.7) && this.invuln <= 0) {
      s.fx.flash('#ff7a00'); s.sound.play('hit'); s.fx.text(W / 2, VIEW.h * 0.4, 'OUCH! LAVA!', { color: '#fb923c', size: 28 });
      return s.hurt();
    }

    // Mine / attack
    const mineHeld = this.mineMouse || this.mineTouch !== null || k.has('KeyE') || k.has('KeyJ');
    const target = this.castBlock();
    this.target = target;
    if (mineHeld) {
      this.swingT = Math.max(this.swingT, 0.001);
      const foe = this.attackCd <= 0 && this.foeInFront(target ? target.t : 3);
      if (foe) this.whack(foe);
      else if (target && HARD[target.v] < Infinity) {
        const m = this.mining;
        if (!m || m.x !== target.x || m.y !== target.y || m.z !== target.z) this.mining = { x: target.x, y: target.y, z: target.z, p: 0 };
        const speed = this.bonus ? 1.7 : 1;
        this.mining.p += dt * speed;
        this.digT = (this.digT || 0) - dt;
        if (this.digT <= 0) { this.digT = 0.22; s.sound.play('brick', 2); }
        if (this.mining.p >= HARD[target.v]) this.breakBlock(target);
      } else this.mining = null;
    } else this.mining = null;
    this.prevMine = mineHeld;

    // Build
    if (this.placeQueued) { this.placeQueued = false; this.placeBlock(target); }

    // TNT
    for (const l of this.lit) { l.t -= dt; }
    const boom = this.lit.filter((l) => l.t <= 0);
    if (boom.length) { this.lit = this.lit.filter((l) => l.t > 0); for (const b of boom) this.explode(b); if (s.state !== 'playing') return; }

    // Day & night, gloomlings
    if (isFinite(this.dayLeft)) {
      const before = this.dayLeft;
      this.dayLeft -= dt;
      if (before > 0 && this.dayLeft <= 0) { s.fx.text(W / 2, VIEW.h * 0.3, '🌙 NIGHT FALLS…', { color: '#a5b4fc', size: 30, life: 1.6 }); s.sound.play('lose'); this.spawnT = 0.5; }
    }
    this.updateEnemies(dt);
  }

  foeInFront(maxT) {
    const [ox, oy, oz] = this.eye(), [fx, fy, fz] = this.fwd();
    let best = null, bestZ = Math.min(maxT, 2.9);
    for (const e of this.enemies) {
      const rx = e.x - ox, ry = e.y + 0.45 - oy, rz = e.z - oz;
      const zz = rx * fx + ry * fy + rz * fz;
      if (zz < 0.1 || zz > bestZ) continue;
      const lat = Math.hypot(rx - fx * zz, ry - fy * zz, rz - fz * zz);
      if (lat < 0.75) { best = e; bestZ = zz; }
    }
    return best;
  }

  whack(e) {
    const s = this.s;
    this.attackCd = 0.38; this.swingT = 0.3;
    e.hp--; e.flash = 0.15;
    const [fx, , fz] = this.fwd(), n = Math.hypot(fx, fz) || 1;
    e.vx = fx / n * 7; e.vz = fz / n * 7; e.vy = 4.5; e.stun = 0.45;
    s.sound.play('hit');
    if (e.hp <= 0) this.killEnemy(e, true);
    else s.fx.burst(W / 2, VIEW.h / 2, { color: '#a78bfa', count: 8, speed: 140 });
  }

  killEnemy(e, byPlayer) {
    const s = this.s;
    e.dead = true;
    s.fx.burst(W / 2, VIEW.h / 2, { colors: ['#7c3aed', '#c4b5fd', '#fde047'], count: 22, speed: 240 });
    if (byPlayer) {
      s.award(40 * this.level, W / 2, VIEW.h / 2 - 30, { chain: true, color: '#c4b5fd' });
      s.sound.play('powerup');
      if (++this.runEnemiesBonked >= 10) s.unlock('nightwatch');
    }
  }

  breakBlock(b) {
    const s = this.s, v = b.v;
    this.mining = null;
    if (v === TNT) {
      if (!this.lit.some((l) => l.x === b.x && l.y === b.y && l.z === b.z)) { this.lit.push({ x: b.x, y: b.y, z: b.z, t: 1.8 }); s.sound.play('tick'); s.fx.text(W / 2, VIEW.h * 0.4, '🧨 RUN!', { color: '#f87171', size: 30 }); }
      return;
    }
    this.set(b.x, b.y, b.z, AIR);
    s.fx.burst(W / 2, VIEW.h / 2, { color: BLOCK_COL[v], count: 12, speed: 160, gravity: 400 });
    if (isOre(v)) this.mineOre(v, W / 2, VIEW.h / 2 - 30);
    else {
      s.sound.play('bounce', 3);
      if (DROP[v]) { this.placeType = DROP[v]; this.blocks = Math.min(99, this.blocks + 1); }
    }
  }

  mineOre(v, x, y) {
    const s = this.s;
    const pts = ORE_PTS[v] * (1 + (this.level - 1) * 0.1);
    s.award(Math.round(pts), x, y, { chain: true, color: ORE_COL[v] });
    s.sound.play(v === STAR ? 'golden' : 'gem', s.comboCount);
    if (v === STAR) { s.unlock('crystal'); s.fx.ring(x, y + 30, { color: '#f472b6', radius: 50 }); }
    this.ores++;
    if (this.bonus) { if (++this.bonusOres >= 30) s.unlock('rush'); return; }
    if (this.ores >= this.quota) s.completeLevel();
  }

  placeBlock(t) {
    const s = this.s;
    if (!t || this.blocks <= 0) { if (this.blocks <= 0) s.fx.text(W / 2, VIEW.h * 0.6, 'No blocks — dig some!', { color: '#fca5a5', size: 18 }); return; }
    let { px: x, py: y, pz: z } = t;
    if (t.v === LAVA) { x = t.x; y = t.y; z = t.z; }
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 1 || y >= SY) return;
    const cur = this.world[idx(x, y, z)];
    if (cur !== AIR && cur !== LAVA) return;
    // not inside the player or a gloomling
    const overlap = (bx, by, bz, hw, h) => bx + hw > x && bx - hw < x + 1 && bz + hw > z && bz - hw < z + 1 && by + h > y && by < y + 1;
    if (overlap(this.px, this.py, this.pz, 0.3, 1.75)) return;
    if (this.enemies.some((e) => overlap(e.x, e.y, e.z, 0.35, 0.9))) return;
    this.set(x, y, z, this.placeType);
    this.blocks--; this.swingT = 0.2;
    s.sound.play('metal');
    if (++this.placed >= 25) s.unlock('builder');
  }

  explode(b) {
    const s = this.s, R = 2.6;
    let ores = 0;
    for (let y = b.y - 3; y <= b.y + 3; y++) for (let z = b.z - 3; z <= b.z + 3; z++) for (let x = b.x - 3; x <= b.x + 3; x++) {
      if (Math.hypot(x - b.x, y - b.y, z - b.z) > R) continue;
      const v = this.get(x, y, z);
      if (v === AIR || v === BEDROCK || y < 0 || y >= SY) continue;
      if (v === TNT && !(x === b.x && y === b.y && z === b.z)) { if (!this.lit.some((l) => l.x === x && l.y === y && l.z === z)) this.lit.push({ x, y, z, t: 0.25 }); continue; }
      if (isOre(v)) { ores++; this.mineOre(v, W / 2 + s.rng.range(-80, 80), VIEW.h * 0.4 + s.rng.range(-40, 40)); if (s.state !== 'playing') return; }
      this.set(x, y, z, AIR);
    }
    if (ores >= 5) s.unlock('tnt5');
    const [ex, ey, ez] = [b.x + 0.5, b.y + 0.5, b.z + 0.5];
    const d = Math.hypot(this.px - ex, this.py + 0.9 - ey, this.pz - ez);
    s.sound.play('boom');
    s.fx.shake(Math.max(4, 16 - d * 1.5), 0.4);
    if (d < 12) s.fx.flash('#fde68a', 0.3);
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - ex, e.y - ey, e.z - ez) < 3.6) this.killEnemy(e, true);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (d < 3.1 && this.invuln <= 0 && !this.bonus) { s.fx.text(W / 2, VIEW.h * 0.35, 'KABOOM!', { color: '#fb923c', size: 34 }); s.hurt(); }
  }

  updateEnemies(dt) {
    const s = this.s, L = this.level;
    if (this.bonus || L < 2) return;
    const night = this.dayLeft <= 0;
    const dayCaves = L >= 6;
    this.spawnT -= dt;
    const max = night ? Math.min(14, 3 + L) : dayCaves ? Math.min(4, L - 4) : 0;
    if (this.spawnT <= 0) {
      this.spawnT = night ? Math.max(1.0, 3.2 - L * 0.2) : 6;
      if (this.enemies.length < max) this.spawnEnemy(night);
    }
    const speed = Math.min(3.8, 2.0 * s.speed(0.06));
    for (const e of this.enemies) {
      e.t += dt; e.flash = Math.max(0, e.flash - dt); e.stun = Math.max(0, e.stun - dt);
      const dx = this.px - e.x, dz = this.pz - e.z, d = Math.hypot(dx, dz) || 1;
      if (e.stun <= 0) {
        e.vx += (dx / d * speed - e.vx) * Math.min(1, dt * 8);
        e.vz += (dz / d * speed - e.vz) * Math.min(1, dt * 8);
      } else { e.vx *= 0.98; e.vz *= 0.98; }
      const { hitX, hitZ } = this.moveBody(e, dt, 0.35, 0.9);
      if ((hitX || hitZ) && e.grounded && e.stun <= 0) e.vy = 7.6;
      if (e.grounded && e.stun <= 0 && e.t % 1.1 < dt) e.vy = Math.max(e.vy, 3); // little hops
      if (this.inLava(e.x, e.y, e.z, 0.35, 0.9) || e.y < 0) this.killEnemy(e, false);
      if (!e.dead && this.invuln <= 0 && Math.hypot(this.px - e.x, this.pz - e.z) < 0.62 && e.y < this.py + 1.7 && e.y + 0.9 > this.py) {
        s.fx.text(W / 2, VIEW.h * 0.35, 'GOT YOU!', { color: '#c4b5fd', size: 30 });
        s.sound.play('hit');
        this.enemies = this.enemies.filter((x) => !x.dead);
        return s.hurt();
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  spawnEnemy(night) {
    const r = this.s.rng;
    for (let tries = 0; tries < 30; tries++) {
      const x = r.int(1, SX - 2), z = r.int(1, SZ - 2);
      if (Math.hypot(x + 0.5 - this.px, z + 0.5 - this.pz) < 9) continue;
      let y;
      if (night) y = this.colTop[z * SX + x] + 1;
      else {
        y = r.int(2, Math.max(2, this.colTop[z * SX + x] - 3));
        if (this.solid(x, y, z) || !this.solid(x, y - 1, z)) continue;
      }
      if (y >= SY - 1 || this.get(x, y - 1, z) === LAVA || this.get(x, y - 1, z) === LEAVES || this.solid(x, y, z) || this.solid(x, y + 1, z)) continue;
      const hp = this.level >= 8 ? 3 : 2;
      this.enemies.push({ x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0, hp, t: r.range(0, 2), flash: 0, stun: 0, grounded: false });
      return;
    }
  }

  idle(dt) {
    this.t += dt;
    const st = this.s.state;
    if (st === 'title') { this.yaw += dt * 0.15; this.pitch = -0.15; }
    if ((st === 'title' || st === 'over' || st === 'legend') && document.pointerLockElement) document.exitPointerLock?.();
  }

  // ── Rendering ───────────────────────────────────────────────
  nightK() { if (!isFinite(this.dayLeft)) return 0; return this.dayLeft <= 0 ? 1 : this.dayLeft < 6 ? 1 - this.dayLeft / 6 : 0; }

  renderWorld() {
    const RW = this.RW, RH = this.RH, buf = this.buf, depth = this.depth, world = this.world, TEXA = this.tex, colTop = this.colTop;
    const [ox, oy, oz] = this.eye(), [fx, fy, fz] = this.fwd();
    const rx = Math.cos(this.yaw), ry = 0, rz = -Math.sin(this.yaw);
    const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx; // up = fwd × right
    const tanY = 0.72, tanX = tanY * RW / RH;
    const nk = this.nightK(), cave = this.bonus;
    // sky colours: day → night
    const mix = (a, b, k) => a + (b - a) * k;
    const skyTop = [mix(74, 8, nk), mix(150, 12, nk), mix(240, 40, nk)], skyHor = [mix(190, 30, nk), mix(225, 40, nk), mix(255, 85, nk)];
    const dayLight = cave ? 0.55 : mix(1, 0.3, nk), caveLight = cave ? 0.55 : 0.13;
    const maxDist = cave ? 26 : mix(30, 18, nk), fogStart = maxDist * 0.55, lampR = 7.5;
    const m = this.mining, tg = this.target, crack = this.crack;
    const tgx = tg ? tg.x : -9, tgy = tg ? tg.y : -9, tgz = tg ? tg.z : -9, mp = m && tg && m.x === tgx && m.y === tgy && m.z === tgz ? m.p / HARD[tg.v] : 0;
    const lavaShift = Math.floor(this.t * 3) & 7, t6 = this.t * 6;
    const litSet = new Set(this.lit.map((l) => idx(l.x, l.y, l.z)));
    const flashOn = Math.sin(this.t * 22) > 0;
    let o = 0;
    for (let j = 0; j < RH; j++) {
      const sv = (1 - (j + 0.5) / RH * 2) * tanY;
      for (let i = 0; i < RW; i++, o++) {
        const su = ((i + 0.5) / RW * 2 - 1) * tanX;
        const dx = fx + rx * su + ux * sv, dy = fy + ry * su + uy * sv, dz = fz + rz * su + uz * sv;
        const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
        const stx = dx > 0 ? 1 : -1, sty = dy > 0 ? 1 : -1, stz = dz > 0 ? 1 : -1;
        const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
        let tx = (dx > 0 ? x + 1 - ox : ox - x) * tdx, ty = (dy > 0 ? y + 1 - oy : oy - y) * tdy, tz = (dz > 0 ? z + 1 - oz : oz - z) * tdz;
        let t = 0, side = 0, v = 0, lx = x, ly = y, lz = z;
        const tMax = maxDist / dlen;
        while (true) {
          lx = x; ly = y; lz = z;
          if (tx < ty && tx < tz) { x += stx; t = tx; tx += tdx; side = 0; } else if (ty < tz) { y += sty; t = ty; ty += tdy; side = 1; } else { z += stz; t = tz; tz += tdz; side = 2; }
          if (t > tMax) { v = -1; break; }
          if (x < 0 || z < 0 || x >= SX || z >= SZ || y >= SY) { v = -1; break; }
          if (y < 0) { v = BEDROCK; break; }
          v = world[(y * SZ + z) * SX + x];
          if (v) break;
        }
        let R, G, B;
        if (v < 0) {
          // sky (or the edge of the world)
          const k = clamp(dy / dlen * 1.6 + 0.15, 0, 1);
          R = skyHor[0] + (skyTop[0] - skyHor[0]) * k; G = skyHor[1] + (skyTop[1] - skyHor[1]) * k; B = skyHor[2] + (skyTop[2] - skyHor[2]) * k;
          if (dy < 0 && !cave) { const g = clamp(-dy / dlen * 3, 0, 1); R *= 1 - g * 0.5; G *= 1 - g * 0.4; B *= 1 - g * 0.3; }
          depth[o] = 1e9;
        } else {
          const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
          let u, w, face, shade;
          if (side === 1) { u = hx - Math.floor(hx); w = hz - Math.floor(hz); face = sty > 0 ? 2 : 0; shade = sty > 0 ? 0.5 : 1; }
          else if (side === 0) { u = hz - Math.floor(hz); w = 1 - (hy - Math.floor(hy)); face = 1; shade = 0.8; }
          else { u = hx - Math.floor(hx); w = 1 - (hy - Math.floor(hy)); face = 1; shade = 0.66; }
          let ui = (u * 8) | 0, vi = (w * 8) | 0;
          if (v === LAVA) { ui = (ui + lavaShift) & 7; vi = (vi + (lavaShift >> 1)) & 7; }
          const tv = v === TNT && flashOn && litSet.has((y * SZ + z) * SX + x);
          const to = (((v * 3 + face) << 6) + (vi << 3) + ui) * 3;
          R = TEXA[to]; G = TEXA[to + 1]; B = TEXA[to + 2];
          if (tv) { R = G = B = 255; }
          // light: is the empty cell in front of this face open to the sky?
          const lightCellOpen = lx >= 0 && lz >= 0 && lx < SX && lz < SZ ? ly > colTop[lz * SX + lx] : true;
          const dist = t * dlen;
          let light = lightCellOpen ? dayLight : caveLight;
          const lamp = 1 - dist / lampR;
          if (lamp > light) light = lamp;
          if (v === LAVA || tv) light = 1.15, shade = 1;
          else if (v === STAR) light = Math.max(light, 0.75 + 0.15 * Math.sin(t6 + x + z));
          light *= shade;
          // the block you're aiming at: outline + cracks
          if (x === tgx && y === tgy && z === tgz) {
            const e = u < 0.06 || u > 0.94 || w < 0.06 || w > 0.94;
            if (e) light *= 0.25;
            else if (mp > 0 && crack[(vi << 3) + ui] < mp) light *= 0.45;
          }
          R *= light; G *= light; B *= light;
          // fog
          if (dist > fogStart) {
            const f = Math.min(1, (dist - fogStart) / (maxDist - fogStart));
            const fr = lightCellOpen ? skyHor[0] : 6, fg = lightCellOpen ? skyHor[1] : 6, fb = lightCellOpen ? skyHor[2] : 14;
            R += (fr - R) * f; G += (fg - G) * f; B += (fb - B) * f;
          }
          depth[o] = t;
        }
        buf[o] = 0xff000000 | (Math.min(255, B) << 16) | (Math.min(255, G) << 8) | Math.min(255, R);
      }
    }
    // Gloomlings (sprites with a depth test)
    const focal = RH / 2 / tanY;
    const list = this.enemies.map((e) => {
      const rxx = e.x - ox, ryy = e.y + 0.45 - oy, rzz = e.z - oz;
      return { e, z: rxx * fx + ryy * fy + rzz * fz, sx: rxx * rx + ryy * ry + rzz * rz, sy: rxx * ux + ryy * uy + rzz * uz };
    }).filter((p) => p.z > 0.25).sort((a, b) => b.z - a.z);
    for (const p of list) {
      const cxp = RW / 2 + p.sx / p.z * focal, cyp = RH / 2 - p.sy / p.z * focal + Math.abs(Math.sin(p.e.t * 6)) * -0.08 * focal / p.z;
      const size = 0.85 / p.z * focal;
      const x0 = Math.floor(cxp - size / 2), y0 = Math.floor(cyp - size / 2), x1 = Math.ceil(cxp + size / 2), y1 = Math.ceil(cyp + size / 2);
      const dist = p.z;
      let light = Math.max(nk > 0.5 ? 0.45 : 0.9, 1 - dist / lampR);
      const fl = p.e.flash > 0;
      const pal = [null, [76, 29, 149], [40, 12, 80], [253, 224, 71], [255, 255, 255]];
      for (let yy = Math.max(0, y0); yy < Math.min(RH, y1); yy++) {
        const sv2 = Math.floor((yy - y0) / (y1 - y0) * 8);
        for (let xx = Math.max(0, x0); xx < Math.min(RW, x1); xx++) {
          const oo = yy * RW + xx;
          if (depth[oo] < p.z) continue;
          const su2 = Math.floor((xx - x0) / (x1 - x0) * 8);
          const c = GLOOM[sv2]?.[su2];
          if (!c) continue;
          const col = pal[c];
          const k = c >= 3 ? 1 : light;
          let R = fl ? 255 : col[0] * k, G = fl ? 255 : col[1] * k, B = fl ? 255 : col[2] * k;
          buf[oo] = 0xff000000 | (Math.min(255, B) << 16) | (Math.min(255, G) << 8) | Math.min(255, R);
        }
      }
    }
    this.offCtx.putImageData(this.img, 0, 0);
  }

  render(ctx) {
    const s = this.s, t0 = performance.now();
    this.renderWorld();
    // drop the resolution on slow devices
    const ms = performance.now() - t0;
    if (s.state === 'playing') {
      this.perf.push(ms);
      if (this.perf.length >= 40) {
        const avg = this.perf.reduce((a, b) => a + b, 0) / this.perf.length; this.perf = [];
        if (avg > 13 && this.resIdx < RES.length - 1) this.setRes(++this.resIdx);
      }
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, this.RW, this.RH, VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.imageSmoothingEnabled = true;
    if (!['playing', 'banner', 'clear', 'dying'].includes(s.state) && document.pointerLockElement) document.exitPointerLock?.();

    // crosshair
    const cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h / 2;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(cx - 9, cy - 1.5, 18, 3); ctx.fillRect(cx - 1.5, cy - 9, 3, 18);

    this.drawPickaxe(ctx);

    // hurt glow while invulnerable
    if (this.invuln > 0 && s.state === 'playing') {
      ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.t * 20);
      const g = ctx.createRadialGradient(cx, cy, 120, cx, cy, 380); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.restore();
    }
    // night vignette
    const nk = this.nightK();
    if (nk > 0) {
      ctx.save(); ctx.globalAlpha = nk * 0.5;
      const g = ctx.createRadialGradient(cx, cy, 140, cx, cy, 420); g.addColorStop(0, 'rgba(0,0,30,0)'); g.addColorStop(1, '#000018');
      ctx.fillStyle = g; ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.restore();
    }

    // top HUD
    if (this.bonus) {
      progressBar(ctx, 16, 12, W - 32, 20, 1, '#ec4899', `✦ Crystal Cavern — ore mined: ${this.bonusOres}`);
    } else {
      progressBar(ctx, 16, 12, isFinite(this.dayLeft) ? W - 150 : W - 32, 20, this.ores / this.quota, '#fbbf24', `⛏ Ore ${this.ores} / ${this.quota}`);
      if (isFinite(this.dayLeft)) {
        const night = this.dayLeft <= 0;
        progressBar(ctx, W - 126, 12, 110, 20, night ? 1 : this.dayLeft / this.dayLen, night ? '#6366f1' : '#38bdf8', night ? '🌙 Night' : `☀ ${Math.ceil(this.dayLeft)}s`);
      }
    }
    if (this.lit.length) {
      ctx.save(); ctx.font = '800 18px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fca5a5';
      ctx.fillText(`🧨 ${Math.max(...this.lit.map((l) => l.t)).toFixed(1)}`, W / 2, 56); ctx.restore();
    }

    this.drawPanel(ctx);
  }

  drawPickaxe(ctx) {
    const swing = this.swingT > 0 ? Math.sin(this.t * 22) * 0.45 + 0.2 : 0;
    const gold = this.s.gold;
    ctx.save();
    ctx.translate(VIEW.x + VIEW.w - 110, VIEW.y + VIEW.h - 30);
    ctx.rotate(-0.55 - swing);
    // handle
    ctx.fillStyle = gold ? '#b45309' : '#7c4a1e'; ctx.fillRect(-8, -150, 16, 165);
    ctx.fillStyle = gold ? '#92400e' : '#5a3412'; ctx.fillRect(4, -150, 4, 165);
    // head
    const g = ctx.createLinearGradient(0, -190, 0, -140);
    if (gold) { g.addColorStop(0, '#fff7c2'); g.addColorStop(0.5, '#fbbf24'); g.addColorStop(1, '#b45309'); }
    else { g.addColorStop(0, '#e5e7eb'); g.addColorStop(0.5, '#9ca3af'); g.addColorStop(1, '#4b5563'); }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-90, -142); ctx.quadraticCurveTo(-40, -196, 0, -192); ctx.quadraticCurveTo(40, -196, 90, -142);
    ctx.lineTo(70, -140); ctx.quadraticCurveTo(30, -170, 0, -166); ctx.quadraticCurveTo(-30, -170, -70, -140); ctx.closePath(); ctx.fill();
    ctx.fillStyle = gold ? '#fde68a' : '#d1d5db'; ctx.fillRect(-14, -194, 28, 34);
    if (gold) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 5); ctx.fillStyle = '#fff'; ctx.fillRect(-60, -170, 6, 6); ctx.fillRect(48, -164, 5, 5); }
    ctx.restore();
  }

  drawPanel(ctx) {
    const y0 = PANEL_Y;
    const g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, '#1f2937'); g.addColorStop(1, '#0b1120');
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, y0, W, 2);
    // block stack
    const sw = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 26, 26); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, 26, 5); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + 21, 26, 5); };
    ctx.font = '800 16px system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (this.touchUI) {
      // joystick
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(95, 630, 58, 0, Math.PI * 2); ctx.stroke();
      const jx = 95 + (this.joy ? this.joy.dx * 50 : 0), jy = 630 + (this.joy ? this.joy.dy * 50 : 0);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(jx, jy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const btn = (k, label, col, on) => {
        const [bx, by, br] = this.BTN[k];
        ctx.fillStyle = on ? col : 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `800 ${br > 35 ? 14 : 12}px system-ui`; ctx.fillText(label, bx, by + 1);
      };
      btn('mine', '⛏ MINE', '#fbbf24', this.mineTouch !== null);
      btn('build', '🧱 BUILD', '#60a5fa', false);
      btn('jump', '⤒ JUMP', '#4ade80', false);
      // block count
      sw(176, y0 + 14, BLOCK_COL[this.placeType]);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '800 16px system-ui'; ctx.fillText(`× ${this.blocks}`, 208, y0 + 28);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Drag the view to look', 240, H - 14);
    } else {
      sw(20, y0 + 18, BLOCK_COL[this.placeType]);
      ctx.fillStyle = '#fff'; ctx.fillText(`× ${this.blocks} blocks`, 54, y0 + 32);
      ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'right';
      ctx.fillText(this.bonus ? `✦ ${this.bonusOres} ore` : `⛏ ${this.ores} / ${this.quota} ore`, W - 20, y0 + 32);
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 14px system-ui';
      const locked = document.pointerLockElement === this.s.canvas;
      ctx.fillText(locked ? 'Mouse: look · Left click: mine / whack · Right click: build' : 'Click the view to look around with the mouse', W / 2, y0 + 82);
      ctx.fillText('WASD move · Space jump · E mine · Q build', W / 2, y0 + 108);
      ctx.fillText('No mouse? ← → turn · R / F look up & down', W / 2, y0 + 134);
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '600 12px system-ui';
      ctx.fillText('Esc or P to pause', W / 2, y0 + 162);
    }
    ctx.textBaseline = 'alphabetic';
  }
}

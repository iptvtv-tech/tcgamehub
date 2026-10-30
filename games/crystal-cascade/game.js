// ─────────────────────────────────────────────────────────────
//  CRYSTAL CASCADE 3D — game 22 (Zone 4 · Ultra)
//  An over-the-shoulder 3D puzzle shooter. You stand at the top of a crystal
//  mine shaft behind a crystal cannon. Far below, a round platform turns with
//  twelve columns of cut crystals stacked on it. Fire crystals down the shaft:
//  3 or more of one colour touching (side by side round the ring, or one on top
//  of another) SHATTER. Everything above drops, and if that makes a new match it
//  shatters too — a CASCADE (cascades earn 💎 prism shots).
//
//  THE GOAL: every level hides golden GEODES ◆ near the bottom of the stack.
//  Dig down to one and shoot it to crack it open; crack them all to clear the
//  level. (Bombs, drills and charged layers break geodes too.)
//
//  POWER CRYSTALS sit in the stack — shatter one to set it off:
//    💣 bomb (blasts all round it)  🔩 drill (bores the whole column)
//    ❄️ freeze (stops the spin, the floor and the clock)  🌈 burst (every crystal of its colour)
//  CRYSTAL FEVER: every shatter fills the fever bar. Full → 8 s of rapid-fire
//  prism shots, double points and a faster spin.
//
//  The floor keeps rising and the cannon fires by itself if you dither. If any
//  column breaks the red laser ring at the top, you lose a life.
//    L3 obsidian   L4 five colours   L6 the platform REVERSES   L7 frozen crystals
//    L8 ⚡ charged crystals (the whole layer goes)   L9 six colours   L11 surging spin
//  Every 5th level: ★ CRYSTAL RAIN — rapid-fire prisms, no way to lose.
//
//  Drawn in real 3D on the canvas: a perspective camera behind the cannon,
//  lit faceted crystal meshes (back faces culled, sorted far → near), the
//  shaft wall, the turning platform and the cannon are all built in code.
// ─────────────────────────────────────────────────────────────
import { runGame, progressBar, clamp } from '../../assets/js/engine.js';

const ID = 'crystal-cascade';
const W = 480, H = 720, TAU = Math.PI * 2;
const N = 12, SEC = TAU / N;           // columns round the ring
const RING = 150;                      // radius the columns stand on
const CR = 31;                         // crystal radius (corner of the hexagon)
const LH = 36;                         // height of one layer
const MAXH = 8;                        // a 9th crystal in any column = overflow
const TOPY = MAXH * LH;                // the red laser ring
const PLAT_R = 202, WALL_R = 236, WALL_TOP = TOPY + 90;
const AIM = 1.15;                      // how far left / right you can aim (radians)
const SHOT_T = 0.22;                   // flight time of a shot
const FEVER_T = 8;                     // seconds of Crystal Fever
const BPM = 126;
const PIV = [0, 272, -420];            // the cannon's pivot (just below and in front of the camera)
const CAM_POS = [0, 600, -610], CAM_TGT = [0, 120, 30], FOCAL = 780, CAM_CY = 300;

const COLORS = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#22d3ee'];
const STONE = '#4a4058', GEODE = '#fbbf24';
const POWERS = ['bomb', 'drill', 'freeze', 'burst'];
const PICON = { bomb: '💣', drill: '🔩', freeze: '❄️', burst: '🌈' };
const THEMES = [
  { name: 'Amethyst Mine',  bg: ['#07020f', '#1d0a33'], wall: '#2a1a44', vein: '#c084fc', plat: '#1c1430', plat2: '#2b1f48', rim: '#a78bfa' },
  { name: 'Sapphire Deep',  bg: ['#01050f', '#0a1c3b'], wall: '#14284c', vein: '#38bdf8', plat: '#0f1c36', plat2: '#1a2c52', rim: '#60a5fa' },
  { name: 'Emerald Grotto', bg: ['#010a06', '#082619'], wall: '#123326', vein: '#34d399', plat: '#0d2419', plat2: '#173a2a', rim: '#4ade80' },
];
const GOLD_THEME = { name: 'Crystal Rain', bg: ['#110802', '#3a2006'], wall: '#3d2a0d', vein: '#fde047', plat: '#2b1d08', plat2: '#46300e', rim: '#fbbf24' };
const CALLOUT = ['', '', 'NICE!', 'AVALANCHE!', 'CRYSTAL STORM!', 'UNSTOPPABLE!'];

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  detail: true,                // 🖥 Graphics HIGH / LOW (LOW skips the glows, wall veins and dust)
  comboWindow: 0,              // the combo lasts while every shot shatters something
  comboStep: 2,
  maxMultiplier: 6,
  bonusTime: 20,
  music: { bpm: BPM, style: 'cosmic', lead: 'triangle', arp: [0, 2, 4, 1, 3, 2, 4, 3], oct: [12, 12, 24, 12, 12, 24, 12, 12], bass: 'half' },
  levelInfo(level, bonus) {
    if (bonus) return '★ CRYSTAL RAIN! Hold fire for rapid prism shots — nothing can hurt you. Shatter as many as you can!';
    const notes = {
      1: 'Dig down to the gold GEODE ◆ and shoot it to crack it open! 3 of a colour touching SHATTER. Don\'t let a column break the red ring.',
      2: 'Two geodes. Shatter 💣 🔩 ❄️ 🌈 power crystals to set them off — and fill the FEVER bar for rapid fire!',
      3: '🪨 Obsidian! It can\'t be matched — shatter crystals right next to it to break it.',
      4: 'Five colours now, and the floor rises faster.',
      6: '⟲ The platform REVERSES now — watch the warning! And three geodes from here on.',
      7: '🧊 Frozen crystals can\'t be matched until a shatter next to them thaws them.',
      8: '⚡ Charged crystals: shatter one and its whole layer goes — geodes too!',
      9: 'Six colours. Keep your nerve.',
      11: 'The spin surges AND reverses. Ultra mode!',
    };
    return notes[level] || 'Faster floor, faster spin. Dig quick!';
  },
  create: (shell) => new CrystalCascade(shell),
});

// ── Little vector kit ──────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const LIGHT = norm([-0.45, 0.85, -0.4]);
const rgbCache = new Map();
const rgb = (h) => { if (!rgbCache.has(h)) rgbCache.set(h, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); return rgbCache.get(h); };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c, a = 1) => `rgba(${Math.min(255, c[0] | 0)},${Math.min(255, c[1] | 0)},${Math.min(255, c[2] | 0)},${a})`;
const hexA = (h, a) => css(rgb(h), a);

/** A perspective camera (world: x right, y up, z away from the viewer). */
class Cam {
  constructor(pos, tgt) {
    this.pos = pos;
    this.f = norm(sub(tgt, pos));
    this.r = norm([this.f[2], 0, -this.f[0]]);
    this.u = cross(this.f, this.r);
    this.half = norm(add(LIGHT, mul(this.f, -1)));
  }
  /** world → [screenX, screenY, scale, depth] */
  p(x, y, z) {
    const a = x - this.pos[0], b = y - this.pos[1], c = z - this.pos[2];
    const d = Math.max(1, a * this.f[0] + b * this.f[1] + c * this.f[2]), k = FOCAL / d;
    return [W / 2 + (a * this.r[0] + b * this.r[1] + c * this.r[2]) * k, CAM_CY - (a * this.u[0] + b * this.u[1] + c * this.u[2]) * k, k, d];
  }
}

// ── The crystal: a hexagonal column with bevelled top and bottom ──
const RINGS = [[0.05, 0.62], [0.2, 1], [0.74, 1], [0.94, 0.6]];        // [height (× LH), radius (× CR)]
const CFACES = (() => {
  const f = [{ idx: [0, 1, 2, 3, 4, 5], mat: 0 }, { idx: [18, 19, 20, 21, 22, 23], mat: 4 }];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; f.push({ idx: [r * 6 + k, r * 6 + k2, (r + 1) * 6 + k2, (r + 1) * 6 + k], mat: r + 1 }); }
  return f;
})();

function glowSprite(hex) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(hex, 0.85)); gr.addColorStop(0.35, hexA(hex, 0.3)); gr.addColorStop(1, hexA(hex, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return cv;
}

/** Draw convex polygons (one solid part), lit, back faces culled. faces: [{idx, mat}], colour(mat, n) → [r,g,b] */
function drawPart(ctx, cam, verts, faces, centre, colour, { alpha = 1, edge = 0.25, lw = 0.8 } = {}) {
  const scr = verts.map((v) => cam.p(v[0], v[1], v[2]));
  ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineWidth = lw;
  for (const fc of faces) {
    const A = verts[fc.idx[0]], B = verts[fc.idx[1]], C = verts[fc.idx[2]];
    let n = norm(cross(sub(B, A), sub(C, A)));
    let cx = 0, cy = 0, cz = 0;
    for (const i of fc.idx) { cx += verts[i][0]; cy += verts[i][1]; cz += verts[i][2]; }
    const m = fc.idx.length, fcen = [cx / m, cy / m, cz / m];
    if (dot(n, sub(fcen, centre)) < 0) n = mul(n, -1);
    if (dot(n, sub(cam.pos, fcen)) <= 0) continue;
    const col = colour(fc.mat, n);
    ctx.fillStyle = css(col);
    ctx.strokeStyle = edge ? css(mix(col, [255, 255, 255], edge)) : css(col);
    ctx.beginPath();
    for (let i = 0; i < m; i++) { const q = scr[fc.idx[i]]; i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
const lit = (cam, base, n, { amb = 0.3, gain = 0.85, spec = 0.75, top = 0, mat = 0 } = {}) => {
  const d = Math.max(0, dot(n, LIGHT)), sp = Math.pow(Math.max(0, dot(n, cam.half)), 18) * spec * 255;
  const k = amb + gain * d + (mat === 4 ? top : 0);
  return [base[0] * k + sp, base[1] * k + sp, base[2] * k + sp];
};

/** an n-sided prism between two points (radius r), for the cannon */
function prism(a, b, r, n, twist = 0) {
  const d = norm(sub(b, a));
  const s = norm(Math.abs(d[1]) > 0.95 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])), t = cross(d, s);
  const v = [];
  for (const p of [a, b]) for (let i = 0; i < n; i++) { const th = twist + i / n * TAU; v.push(add(p, add(mul(s, Math.cos(th) * r), mul(t, Math.sin(th) * r)))); }
  const faces = [{ idx: Array.from({ length: n }, (_, i) => i), mat: 0 }, { idx: Array.from({ length: n }, (_, i) => n + i), mat: 0 }];
  for (let i = 0; i < n; i++) faces.push({ idx: [i, (i + 1) % n, n + (i + 1) % n, n + i], mat: 1 + (i % 2) });
  return { v, faces, c: mul(add(a, b), 0.5) };
}
/** a box from its centre and three half-axis vectors */
function boxPart(c, ax, ay, az) {
  const v = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) v.push(add(c, add(mul(ax, sx), add(mul(ay, sy), mul(az, sz)))));
  // vertex index = sx*4 + sy*2 + sz (0/1 each)
  const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].map((idx, i) => ({ idx, mat: i === 3 ? 4 : 1 }));
  return { v, faces, c };
}

class CrystalCascade {
  constructor(s) {
    this.s = s; this.t = 0;
    this.cam = new Cam(CAM_POS, CAM_TGT);
    this.glow = COLORS.map(glowSprite); this.glowW = glowSprite('#ffffff'); this.glowG = glowSprite(GEODE);
    this.aim = 0; this.rot = 0; this.spin = 0.12;
    this.dust = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 16, r: 0.6 + Math.random() * 1.6, p: Math.random() * TAU }));
    // glowing veins in the shaft wall: polylines in (angle, height)
    this.veins = Array.from({ length: 9 }, (_, i) => {
      let a = Math.PI * 0.55 + i / 9 * Math.PI * 0.9 + Math.random() * 0.15, y = 20 + Math.random() * 260;
      const pts = [[a, y]];
      for (let k = 0; k < 6; k++) { a += (Math.random() - 0.5) * 0.12; y += 14 + Math.random() * 26; pts.push([a, y]); }
      return pts;
    });
    // little crystal clusters growing out of the wall (cosmetic)
    this.clusters = Array.from({ length: 7 }, (_, i) => ({ a: Math.PI * 0.62 + i / 7 * Math.PI * 0.76 + Math.random() * 0.1, y: 60 + Math.random() * 230, c: Math.floor(Math.random() * 6), s: 0.35 + Math.random() * 0.25 }));
    this.reset();
    this.startLevel(1, false);
  }

  reset() { this.obsidianRun = 0; this.geodeRun = 0; this.feverRun = 0; this.fever = 0; }

  // ── Level setup ─────────────────────────────────────────────
  startLevel(level, bonus) {
    const s = this.s, r = s.rng;
    this.level = level; this.bonus = bonus;
    this.theme = bonus ? GOLD_THEME : THEMES[(level - 1) % 3];
    this.nColors = bonus ? 4 : level >= 9 ? 6 : level >= 4 ? 5 : 4;
    this.geodesNeed = bonus ? 0 : level === 1 ? 1 : level < 6 ? 2 : 3;
    this.shattered = 0; this.rain = 0;
    this.baseSpin = (bonus ? 0.34 : 0.22) * s.speed(0.045, 2.1);
    this.spinDir = r.chance(0.5) ? 1 : -1; this.spinMag = 1;
    this.reverses = !bonus && level >= 6;
    this.surges = !bonus && level >= 11;
    this.pushEvery = bonus ? 2.4 : Math.max(8, 15 - (level - 1) * 0.6);
    this.clockMax = bonus ? 99 : Math.max(2.2, 4 - (level - 1) * 0.12);
    this.stoneChance = !bonus && level >= 3 ? Math.min(0.16, 0.05 + level * 0.008) : 0;
    this.iceChance = !bonus && level >= 7 ? Math.min(0.2, 0.08 + (level - 7) * 0.015) : 0;
    this.boltChance = !bonus && level >= 8 ? Math.min(0.7, 0.35 + (level - 8) * 0.04) : 0;
    this.powerChance = bonus ? 0.6 : 0.5;
    this.livesAtStart = s.lives;
    this.prism = 0; this.feverT = 0; this.fever ??= 0;
    this.buildBoard();
  }

  buildBoard() {
    const r = this.s.rng;
    this.cols = Array.from({ length: N }, () => []);
    const layers = this.bonus ? 3 : Math.min(5, 3 + Math.floor((this.level - 1) / 3));
    for (let j = 0; j < layers; j++) this.addLayer(false);
    // golden geodes, buried near the bottom and spread round the ring
    this.geodesLeft = this.geodesNeed;
    const off = r.int(0, N - 1);
    for (let g = 0; g < this.geodesNeed; g++) {
      const i = (off + Math.round(g * N / this.geodesNeed) + r.int(-1, 1) + N) % N, j = this.level >= 4 && r.chance(0.5) ? 0 : Math.min(1, layers - 3);
      this.cols[i][j] = this.newCell(-1, 'geode');
    }
    // a couple of power crystals to start with
    for (let k = 0; k < (this.bonus ? 4 : 2); k++) this.makePower(r.int(0, N - 1), r.int(1, layers - 1));
    this.shots = []; this.phase = null; this.failing = 0; this.failCol = -1; this.clearing = 0;
    this.pushT = 0; this.clock = this.clockMax; this.fireCD = 0; this.freezeT = 0; this.slowmo = 0;
    this.cur = this.pickColour(); this.next = this.pickColour();
    this.spin = this.baseSpin * this.spinDir;
    this.revT = this.reverses ? r.range(this.surges ? 6 : 9, this.surges ? 10 : 14) : 0; this.revWarned = false;
  }

  newCell(c, kind = 'n') { return { c, kind, yo: 0, vy: 0, die: 0, born: 0 }; }
  makePower(i, j) {
    const c = this.cols[i][j];
    if (!c || c.kind !== 'n') return;
    c.kind = 'power'; c.p = this.s.rng.pick(POWERS);
  }

  /** push a new layer in under every column (or stack the first layers at the start) */
  addLayer(rising) {
    const r = this.s.rng, row = [];
    for (let i = 0; i < N; i++) {
      let kind = 'n';
      if (r.chance(this.stoneChance)) kind = 'stone';
      else if (rising && r.chance(this.iceChance)) kind = 'ice';
      let c = r.int(0, this.nColors - 1);
      // clusters: often copy the colour below or beside, so there are pairs to finish off
      const below = this.cols[i][0], left = row[i - 1];
      if (kind !== 'stone' && r.chance(0.45)) { const src = r.chance(0.5) ? below : left; if (src && src.c >= 0) c = src.c; }
      row.push(this.newCell(kind === 'stone' ? -1 : c, kind));
    }
    if (rising && r.chance(this.boltChance)) { const b = row[r.int(0, N - 1)]; if (b.kind === 'n') b.kind = 'bolt'; }
    if (rising && r.chance(this.powerChance)) { const b = row[r.int(0, N - 1)]; if (b.kind === 'n') { b.kind = 'power'; b.p = r.pick(POWERS); } }
    for (let i = 0; i < N; i++) {
      for (const c of this.cols[i]) { if (rising) c.yo -= LH; }
      this.cols[i].unshift(row[i]);
      if (rising) { row[i].yo = -LH; row[i].born = 1; }
    }
    // no ready-made matches: re-pick colours that would make a group of 3
    for (let i = 0; i < N; i++) {
      const cell = row[i];
      if (cell.kind === 'stone') continue;
      for (let k = 0; k < 8 && this.groupAt(i, 0).length >= 3; k++) cell.c = (cell.c + 1 + r.int(0, this.nColors - 2)) % this.nColors;
      // the random re-picks can all miss the one safe colour: then try every colour in turn (no rng, so boards stay the same)
      for (let c = 0; c < this.nColors && this.groupAt(i, 0).length >= 3; c++) cell.c = c;
    }
  }

  // ── Board rules ────────────────────────────────────────────
  cell(i, j) { return this.cols[((i % N) + N) % N][j] || null; }
  matchable(c) { return c && (c.kind === 'n' || c.kind === 'bolt' || c.kind === 'power') && !c.die; }
  neighbours(i, j) { return [[(i + 1) % N, j], [(i - 1 + N) % N, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => b >= 0 && this.cols[a][b]); }
  groupAt(i, j) {
    const start = this.cell(i, j);
    if (!this.matchable(start)) return [];
    const seen = new Set([i * 64 + j]), out = [[i, j]], q = [[i, j]];
    while (q.length) {
      const [a, b] = q.pop();
      for (const [x, y] of this.neighbours(a, b)) {
        const k = x * 64 + y, c = this.cols[x][y];
        if (seen.has(k) || !this.matchable(c) || c.c !== start.c) continue;
        seen.add(k); out.push([x, y]); q.push([x, y]);
      }
    }
    return out;
  }
  findGroups() {
    const seen = new Set(), groups = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < this.cols[i].length; j++) {
      if (seen.has(i * 64 + j)) continue;
      const g = this.groupAt(i, j);
      for (const [a, b] of g) seen.add(a * 64 + b);
      if (g.length >= 3) groups.push(g);
    }
    return groups;
  }
  pickColour() {
    const present = new Set();
    for (const col of this.cols) for (const c of col) if (this.matchable(c)) present.add(c.c);
    const pool = present.size ? [...present] : [...Array(this.nColors).keys()];
    return this.s.rng.pick(pool);
  }
  pts(base) { return Math.round(base * (this.feverT > 0 ? 2 : 1)); }

  // ── Geometry ───────────────────────────────────────────────
  colAngle(i) { return i * SEC + this.rot; }
  /** world position of the base of slot (column i, layer j) */
  slot(i, j, yo = 0) { const a = this.colAngle(i); return [Math.sin(a) * RING, j * LH + yo, -Math.cos(a) * RING]; }
  /** the column sitting under the aim right now */
  aimCol() { return (((Math.round((this.aim - this.rot) / SEC)) % N) + N) % N; }
  /** where a shot at column i will land (counting the shots already on their way there) */
  targetPos(i, before = this.shots.length) {
    let j = this.cols[i].length;
    const top = this.cols[i][j - 1];
    if (top && top.kind === 'geode') j--;                       // a shot at an open geode cracks it
    for (let k = 0; k < before; k++) if (this.shots[k].col === i) j++;
    const [x, y, z] = this.slot(i, j); return [x, y + LH * 0.5, z];
  }
  ghostPos() { return this.targetPos(this.aimCol()); }
  muzzle() { const d = norm(sub(this.ghostPos(), PIV)); return add(PIV, mul(d, 64)); }
  /** screen x → aim angle: pick the aim whose target lands under the pointer */
  aimFromScreen(px) {
    let best = this.aim, bd = 1e9;
    for (let k = 0; k <= 80; k++) {
      const a = -AIM + k / 80 * AIM * 2, q = this.cam.p(Math.sin(a) * RING, LH * 3, -Math.cos(a) * RING), d = Math.abs(q[0] - px);
      if (d < bd) { bd = d; best = a; }
    }
    this.aim = best;
  }
  nextScreen() { return this.cam.p(-66, PIV[1] - 4, PIV[2] + 6); }

  // ── Input ──────────────────────────────────────────────────
  onPointerMove(x, y) { if (y > 50) this.aimFromScreen(x); }
  onAction(a, x, y) {
    if (a === 'press') {
      const q = this.nextScreen();
      if (Math.hypot(x - q[0], y - q[1]) < 36) { this.swap(); this.swapTap = true; return; }
      this.swapTap = false; if (y > 50) this.aimFromScreen(x);
      if (this.rapid()) this.fire();
      return;
    }
    if (a === 'release') { if (this.swapTap) { this.swapTap = false; return; } if (y > 50 && y < H - 24 && !this.rapid()) { this.aimFromScreen(x); this.fire(); } return; }
    if (a === 'action') this.fire();
    if (a === 'up' && !this.s.input.pointer.down) this.swap();
  }
  rapid() { return this.bonus || this.feverT > 0; }
  swap() {
    if (this.rapid()) return;
    [this.cur, this.next] = [this.next, this.cur];
    this.s.sound.tone({ freq: 620, to: 880, dur: 0.06, type: 'sine', vol: 0.06 });
  }
  fire() {
    const s = this.s;
    if (this.failing || this.clearing || s.state !== 'playing' || this.fireCD > 0) return;
    if (this.shots.length >= (this.rapid() ? 3 : 1)) return;
    const pr = this.rapid() || this.prism > 0;
    if (!this.rapid() && this.prism > 0) this.prism--;
    const col = this.aimCol();
    this.shots.push({ t: 0, col, from: this.muzzle(), c: this.cur, prism: pr, trail: [] });
    this.cur = this.next; this.next = this.pickColour();
    this.clock = this.clockMax; this.fireCD = this.rapid() ? 0.13 : 0.08;
    s.sound.tone({ freq: 420, to: 980, dur: 0.1, type: 'triangle', vol: 0.09 });
    s.sound.noise({ dur: 0.08, vol: 0.05, freq: 4200, type: 'highpass' });
  }

  onLifeLost() { this.endFever(); this.buildBoard(); }

  // ── Simulation ─────────────────────────────────────────────
  idle(dt) { this.t += dt; this.animate(dt); }

  animate(dt) {
    const frozen = this.freezeT > 0;
    // the spin (reversing / surging on later levels)
    if (this.reverses && this.s.state === 'playing' && !this.failing && !frozen) {
      this.revT -= dt;
      if (this.revT < 1.3 && !this.revWarned) {
        this.revWarned = true;
        this.s.fx.text(W / 2, 118, '⟲ REVERSE! ⟳', { color: '#fde047', size: 30, life: 1.3, rise: 10 });
        this.s.sound.tone({ freq: 660, dur: 0.12, type: 'square', vol: 0.07 }); this.s.sound.tone({ freq: 440, dur: 0.12, type: 'square', vol: 0.07, delay: 0.16 });
      }
      if (this.revT <= 0) {
        const r = this.s.rng;
        this.spinDir *= -1; this.revWarned = false;
        this.revT = r.range(this.surges ? 6 : 9, this.surges ? 10 : 14);
        if (this.surges) this.spinMag = r.range(0.7, 1.65);
      }
    }
    const target = frozen ? 0 : this.baseSpin * this.spinDir * this.spinMag * (this.clearing ? 3 : this.feverT > 0 ? 1.8 : 1);
    this.spin += (target - this.spin) * Math.min(1, dt * (frozen ? 6 : 1.6));
    this.rot += this.spin * dt;
    // crystals settling (falling down after a shatter, or rising with the floor)
    for (const col of this.cols) for (const c of col) {
      if (c.yo > 0) { c.vy += 2600 * dt; c.yo -= c.vy * dt; if (c.yo <= 0) { if (c.vy > 300 && !this.s.sound.muted) this.s.sound.tone({ freq: 1500 + Math.random() * 400, dur: 0.03, type: 'sine', vol: 0.025 }); c.yo = 0; c.vy = 0; } }
      else if (c.yo < 0) { c.yo = Math.min(0, c.yo + 150 * dt); }
      if (c.die) c.die += dt;
      if (c.born) c.born = Math.max(0, c.born - dt * 1.6);
      if (c.land) c.land = Math.max(0, c.land - dt * 4);
    }
    for (const d of this.dust) { d.y -= d.v * dt * (this.feverT > 0 ? 4 : 1); if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; } }
  }

  update(rdt) {
    const s = this.s;
    // slow motion after big moments: the world runs slower, the controls don't
    if (this.slowmo > 0) this.slowmo -= rdt;
    const dt = this.slowmo > 0 ? rdt * 0.4 : rdt;
    this.t += dt;
    this.animate(dt);
    if (s.input.isDown('left')) this.aim = clamp(this.aim - 1.5 * rdt, -AIM, AIM);
    if (s.input.isDown('right')) this.aim = clamp(this.aim + 1.5 * rdt, -AIM, AIM);
    if (this.fireCD > 0) this.fireCD -= rdt;

    if (this.failing > 0) { this.failing -= rdt; if (this.failing <= 0) { s.sound.play('boom'); s.hurt(); } return; }
    if (this.clearing > 0) { this.clearing -= rdt; if (this.clearing <= 0) s.completeLevel(); return; }

    // Crystal Fever / freeze timers
    if (this.feverT > 0) { this.feverT -= rdt; this.fever = Math.max(0, this.feverT / FEVER_T); if (this.feverT <= 0) this.endFever(); }
    if (this.freezeT > 0) { this.freezeT -= rdt; if (this.freezeT <= 0) s.fx.text(W / 2, 150, 'THAWED', { color: '#bae6fd', size: 22 }); }
    // rapid fire: hold to keep shooting
    if (this.rapid() && (s.input.isDown('action') || s.input.pointer.down)) this.fire();

    // shots in flight; a shot that arrives mid-cascade waits until the stack has settled
    for (const sh of this.shots) { sh.t = Math.min(SHOT_T, sh.t + dt); sh.trail.push(this.shotPos(sh)); if (sh.trail.length > 12) sh.trail.shift(); }
    if (!this.phase && this.shots.length && this.shots[0].t >= SHOT_T) this.land(this.shots.shift());
    if (this.phase) this.resolveStep(dt);

    const calm = !this.phase && !this.shots.length && this.feverT <= 0 && this.freezeT <= 0;
    // the floor rises
    if (calm || (this.bonus && !this.phase)) {
      this.pushT += dt;
      if (!this.bonus && this.pushT >= this.pushEvery - 2 && Math.ceil(this.pushT * 2) !== Math.ceil((this.pushT - dt) * 2)) s.sound.tone({ freq: 160, dur: 0.05, type: 'square', vol: 0.05 });
      if (this.pushT >= this.pushEvery) { this.pushT = 0; this.rise(); }
    }
    // the cannon gets impatient
    if (calm && !this.bonus) {
      this.clock -= dt;
      if (this.clock <= 1.5 && Math.ceil(this.clock * 2) !== Math.ceil((this.clock + dt) * 2)) s.sound.play('tick');
      if (this.clock <= 0) this.fire();
    }
  }

  shotPos(sh) {
    const u = clamp(sh.t / SHOT_T, 0, 1), e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
    const to = this.targetPos(sh.col, this.shots.indexOf(sh) < 0 ? 0 : this.shots.indexOf(sh));
    const p = add(sh.from, mul(sub(to, sh.from), e));
    p[1] += Math.sin(u * Math.PI) * 46;
    return p;
  }

  land(sh) {
    const s = this.s, i = sh.col, col = this.cols[i], top = col[col.length - 1];
    this.step = 0; this.fromShot = true; this.hitGeode = false;
    if (top && top.kind === 'geode' && !top.die) {              // crack the geode open!
      this.hitGeode = true;
      top.die = 0.001;
      this.geodeBroken(i, col.length - 1, true);
      this.phase = { k: 'shatter', t: 0.3 };
      return;
    }
    const cell = this.newCell(sh.c);
    col.push(cell); cell.land = 1;
    const j = col.length - 1;
    if (sh.prism) {                                             // a prism becomes the colour that helps most
      let best = cell.c, bn = 0;
      const tried = new Set(this.neighbours(i, j).map(([a, b]) => this.cols[a][b]).filter((c) => this.matchable(c)).map((c) => c.c));
      for (const c of tried) { cell.c = c; const n = this.groupAt(i, j).length; if (n > bn) { bn = n; best = c; } }
      cell.c = best; cell.prismFlash = 1;
    }
    const [x, y, z] = this.slot(i, j); const q = this.cam.p(x, y + LH / 2, z);
    s.fx.burst(q[0], q[1], { color: COLORS[cell.c], count: 8, speed: 120, life: 0.35 });
    s.sound.tone({ freq: 1250, to: 1650, dur: 0.05, type: 'sine', vol: 0.07 });
    this.phase = { k: 'check', t: 0 };
  }

  geodeBroken(i, j, direct) {
    const s = this.s, [x, y, z] = this.slot(i, j), q = this.cam.p(x, y + LH / 2, z);
    this.geodesLeft = Math.max(0, this.geodesLeft - 1); this.geodeRun++;
    if (this.geodeRun >= 10) s.unlock('digger');
    s.award(this.pts(400 * this.level), q[0], q[1] - 30, { chain: true, color: GEODE, size: 30 });
    s.fx.text(q[0], q[1] - 70, this.geodesLeft ? 'GEODE!' : 'LAST GEODE!', { color: '#fde047', size: 34, life: 1.2 });
    s.fx.burst(q[0], q[1], { colors: ['#fde047', '#fbbf24', '#ffffff', '#fef3c7'], count: 46, speed: 420, life: 1, size: 5, gravity: 400 });
    s.fx.ring(q[0], q[1], { color: '#fde047', radius: 90, life: 0.6, width: 5 });
    s.fx.flash('#fde68a', 0.25); s.fx.shake(8, 0.35);
    s.sound.play('golden'); s.sound.play('gem', 7);
    this.slowmo = Math.max(this.slowmo, direct ? 0.45 : 0.3);
    this.addFever(0.2);
  }

  rise() {
    const s = this.s;
    this.addLayer(true);
    s.fx.shake(4, 0.25);
    s.sound.tone({ freq: 110, to: 60, dur: 0.35, type: 'sawtooth', vol: 0.1 });
    s.sound.noise({ dur: 0.35, vol: 0.12, freq: 320, type: 'bandpass' });
    this.step = 0; this.fromShot = false; this.hitGeode = false;
    this.phase = { k: 'check', t: 0 };                          // the new layer can't make a match, but a check also tests for overflow
  }

  resolveStep(dt) {
    const ph = this.phase;
    if (ph.k === 'check') {
      const groups = this.findGroups();
      if (groups.length) { this.step++; this.shatter(groups); this.phase = { k: 'shatter', t: 0.22 }; }
      else this.endResolve();
    } else if (ph.k === 'shatter') {
      ph.t -= dt;
      if (ph.t <= 0) { this.collapse(); this.phase = { k: 'fall', t: 0.08 }; }
    } else if (ph.k === 'fall') {
      ph.t -= dt;
      if (ph.t <= 0 && this.cols.every((col) => col.every((c) => c.yo <= 0))) this.phase = { k: 'check', t: 0 };
    }
  }

  shatter(groups) {
    const s = this.s, kill = new Map(), queue = [], lvl = 1 + (this.level - 1) * 0.15, step = this.step;
    let extra = 0;
    const mark = (i, j, bonusKill) => {
      const c = this.cols[i]?.[j];
      if (!c || c.die || kill.has(i * 64 + j)) return;
      kill.set(i * 64 + j, [i, j, c]);
      if (bonusKill) extra++;
      if (c.kind === 'power' || c.kind === 'bolt') queue.push([i, j, c]);
    };
    for (const g of groups) {
      const n = g.length;
      let sx = 0, sy = 0;
      for (const [i, j] of g) { mark(i, j); const [x, y, z] = this.slot(i, j); const q = this.cam.p(x, y + LH / 2, z); sx += q[0]; sy += q[1]; }
      sx /= n; sy /= n;
      const colHex = COLORS[this.cols[g[0][0]][g[0][1]].c];
      const base = this.bonus ? 6 * n * this.level : Math.round(n * 10 * (1 + (n - 3) * 0.3) * lvl * step);
      s.award(this.pts(base), sx, sy - 20, { chain: true, color: colHex, size: 20 + Math.min(12, n * 1.5) });
      s.fx.ring(sx, sy, { color: colHex, radius: 40 + n * 6, life: 0.45, width: 4 });
      if (n >= 6) { s.unlock('big6'); s.fx.text(sx, sy - 54, n >= 9 ? 'MOTHER LODE!' : 'BIG SHATTER!', { color: '#fde047', size: 24 }); }
    }
    // power crystals and charged crystals go off (and can set each other off)
    while (queue.length) {
      const [i, j, c] = queue.shift(), [x, y, z] = this.slot(i, j), q = this.cam.p(x, y + LH / 2, z);
      if (c.kind === 'bolt') {
        for (let k = 0; k < N; k++) mark(k, j, true);
        s.fx.flash('#e0f2fe', 0.25); s.fx.shake(7, 0.3); s.sound.play('boom');
        s.fx.text(W / 2, 150, '⚡ LAYER BLAST!', { color: '#67e8f9', size: 30 });
      } else if (c.p === 'bomb') {
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) mark((i + di + N) % N, j + dj, true);
        s.fx.shake(9, 0.35); s.sound.play('boom'); s.fx.ring(q[0], q[1], { color: '#fb923c', radius: 110, life: 0.5, width: 6 });
        s.fx.burst(q[0], q[1], { colors: ['#fb923c', '#fde047', '#ffffff'], count: 30, speed: 380, life: 0.7, size: 5 });
        s.fx.text(q[0], q[1] - 40, '💣 BOOM!', { color: '#fb923c', size: 28 });
      } else if (c.p === 'drill') {
        for (let jj = 0; jj < this.cols[i].length; jj++) mark(i, jj, true);
        s.fx.shake(6, 0.4); s.sound.noise({ dur: 0.5, vol: 0.2, freq: 900, to: 200, type: 'bandpass' });
        s.fx.text(q[0], q[1] - 40, '🔩 DRILL!', { color: '#cbd5e1', size: 28 });
      } else if (c.p === 'freeze') {
        this.freezeT = 6;
        s.fx.flash('#bae6fd', 0.2); s.sound.tone({ freq: 2200, to: 900, dur: 0.5, type: 'sine', vol: 0.1 });
        s.fx.text(W / 2, 150, '❄️ FREEZE! (6s)', { color: '#bae6fd', size: 30 });
      } else if (c.p === 'burst') {
        for (let a = 0; a < N; a++) this.cols[a].forEach((d, b) => { if (this.matchable(d) && d.c === c.c) mark(a, b, true); });
        s.fx.flash(COLORS[c.c], 0.2); s.sound.play('powerup');
        s.fx.text(W / 2, 150, '🌈 COLOUR BURST!', { color: COLORS[c.c], size: 30 });
      }
    }
    // obsidian next to a shatter breaks; frozen crystals thaw
    let stones = 0;
    for (const [i, j] of [...kill.values()]) for (const [a, b] of this.neighbours(i, j)) {
      const c = this.cols[a][b];
      if (c.kind === 'stone' && !c.die) { mark(a, b); stones++; }
      else if (c.kind === 'ice') { c.kind = 'n'; c.thaw = 1; s.sound.tone({ freq: 2400, to: 1800, dur: 0.08, type: 'sine', vol: 0.05 }); }
    }
    if (stones) {
      this.obsidianRun += stones;
      s.award(this.pts(25 * stones * this.level), W / 2, 190, { color: '#c4b5fd' });
      if (this.obsidianRun >= 15) s.unlock('obsidian');
    }
    if (extra) s.award(this.pts(15 * extra * this.level), W / 2, 226, { color: '#fde68a' });
    let gems = 0;
    for (const [i, j, c] of kill.values()) {
      c.die = 0.001;
      if (c.kind === 'geode') { this.geodeBroken(i, j, false); continue; }
      if (c.kind !== 'stone') gems++;
      const [x, y, z] = this.slot(i, j, c.yo), q = this.cam.p(x, y + LH / 2, z);
      const col = c.kind === 'stone' ? '#a8a29e' : COLORS[c.c];
      s.fx.burst(q[0], q[1], { colors: [col, '#ffffff', col], count: this.s.lowDetail ? 7 : 16, speed: 320, life: 0.7, size: 4.5, gravity: 520 });
    }
    this.shattered += gems; if (this.bonus) this.rain += gems;
    this.addFever(gems * 0.021 + (step >= 2 ? 0.04 : 0));
    // glassy shatter, climbing in pitch with the combo
    const p = Math.min(14, s.comboCount + step);
    s.sound.play('gem', p);
    s.sound.noise({ dur: 0.22, vol: 0.13, freq: 7000, to: 2600, type: 'highpass' });
    s.sound.tone({ freq: 1500 + p * 140, to: 2300 + p * 160, dur: 0.12, type: 'sine', vol: 0.06, delay: 0.04 });
    if (step >= 2) {
      s.fx.text(W / 2, 200, `${CALLOUT[Math.min(5, step)]}  ×${step}`, { color: ['#67e8f9', '#f0abfc', '#fde047', '#fb7185'][Math.min(3, step - 2)], size: 28 + step * 4, life: 1.1 });
      s.sound.play('combo', step);
    }
    if (step >= 3) { this.slowmo = Math.max(this.slowmo, 0.6); s.fx.flash('#ffffff', 0.18); }
    s.fx.shake(Math.min(8, 2 + gems * 0.35), 0.18);
  }

  addFever(k) {
    if (this.bonus || this.feverT > 0) return;
    this.fever = Math.min(1, this.fever + k);
    if (this.fever >= 1) this.startFever();
  }
  startFever() {
    const s = this.s;
    this.feverT = FEVER_T; this.fever = 1; this.feverRun++;
    if (this.feverRun >= 3) s.unlock('fever');
    s.fx.text(W / 2, 250, 'CRYSTAL FEVER!', { color: '#f0abfc', size: 44, life: 1.5, rise: 20 });
    s.fx.text(W / 2, 292, 'Hold fire · double points', { color: '#fff', size: 18, life: 1.5, rise: 20 });
    s.fx.flash('#f0abfc', 0.25); s.sound.play('bonus');
    s.sound.setTempo?.(BPM * 1.35);
  }
  endFever() {
    if (this.feverT <= 0) return;
    this.feverT = 0; this.fever = 0;
    this.s.sound.setTempo?.(BPM * Math.min(1.45, 1 + (this.level - 1) * 0.025));
  }

  collapse() {
    for (let i = 0; i < N; i++) {
      const col = this.cols[i], out = [];
      col.forEach((c, j) => { if (c.die) return; const nj = out.length; if (nj < j) { c.yo += (j - nj) * LH; c.vy = 0; } out.push(c); });
      this.cols[i] = out;
    }
  }

  endResolve() {
    const s = this.s, step = this.step;
    this.phase = null;
    if (this.fromShot) {
      if (step === 0 && !this.hitGeode && !this.bonus) s.resetCombo();
      if (step >= 2 && !this.rapid() && this.prism < 3) { this.prism++; s.fx.text(W / 2, 244, '+1 💎 PRISM SHOT', { color: '#e0f2fe', size: 18 }); s.sound.play('powerup'); }
      if (step >= 3) s.unlock('cascade3');
    }
    // overflow?
    for (let i = 0; i < N; i++) {
      if (this.cols[i].length <= MAXH) continue;
      if (this.bonus) {                                         // in the bonus the top just shatters off
        this.cols[i].splice(MAXH);
        const [x, y, z] = this.slot(i, MAXH), q = this.cam.p(x, y, z);
        s.fx.burst(q[0], q[1], { color: '#fde047', count: 10, speed: 200 });
        s.sound.noise({ dur: 0.15, vol: 0.06, freq: 5000, type: 'highpass' });
        continue;
      }
      this.failing = 1.3; this.failCol = i; this.shots = [];
      this.endFever();
      const [x, y, z] = this.slot(i, MAXH), q = this.cam.p(x, y, z);
      s.fx.text(q[0], q[1] - 20, 'OVERFLOW!', { color: '#fb7185', size: 34, life: 1.3 });
      s.sound.play('hit'); s.fx.shake(6, 0.4);
      return;
    }
    // every geode cracked?
    if (!this.bonus && this.geodesLeft <= 0) this.clearLevel();
  }

  clearLevel() {
    const s = this.s;
    this.clearing = 1.6; this.shots = [];
    let n = 0;
    for (let i = 0; i < N; i++) this.cols[i].forEach((c, j) => {
      c.die = 0.001 - j * 0.04 - i * 0.004; n++;               // shatter top to bottom in a ripple
    });
    if (n) s.award(this.pts(8 * n * this.level), W / 2, 180, { color: '#a5f3fc' });
    s.fx.text(W / 2, 140, 'VEIN CLEARED!', { color: '#a3e635', size: 38, life: 1.5 });
    s.sound.noise({ dur: 0.6, vol: 0.12, freq: 6000, to: 1500, type: 'highpass' });
    if (this.level >= 6 && s.lives >= this.livesAtStart) s.unlock('dizzy');
    this.endFever();
  }

  onLevelClear() { if (this.bonus && this.rain >= 80) this.s.unlock('rain'); }

  // ── Drawing ────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, lo = s.lowDetail, cam = this.cam, th = this.theme;
    // the backdrop and shaft wall never move (the camera is fixed), so they're drawn once into a cached picture
    const sc = Math.max(1, Math.min(3, s.scale || 1)), key = `${th.name}|${lo}|${sc}`;
    if (!this.bg || this.bgKey !== key) {
      this.bgKey = key;
      this.bg = document.createElement('canvas'); this.bg.width = Math.round(W * sc); this.bg.height = Math.round(H * sc);
      const g = this.bg.getContext('2d'); g.scale(sc, sc);
      this.drawBackdrop(g, lo); this.drawWall(g, lo);
    }
    ctx.drawImage(this.bg, 0, 0, W, H);
    if (this.feverT > 0) {                                      // fever: the shaft pulses with colour
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `hsla(${(this.t * 160) % 360},90%,60%,${0.1 + 0.05 * Math.sin(this.t * 12)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
      // Rainbow border glow during fever
      const bw = 18 + 6 * Math.sin(this.t * 10);
      ctx.save();
      const hue = (this.t * 120) % 360;
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0,   `hsla(${hue},100%,70%,0.75)`);
      grad.addColorStop(0.5, `hsla(${(hue+120)%360},100%,70%,0.75)`);
      grad.addColorStop(1,   `hsla(${(hue+240)%360},100%,70%,0.75)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = bw;
      ctx.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
      ctx.restore();
    }
    this.drawDust(ctx, lo);
    this.drawPlatform(ctx, lo);

    // crystals, far → near; the light core sits between the back and front halves
    const back = [], front = [];
    for (let i = 0; i < N; i++) {
      const a = this.colAngle(i), z = -Math.cos(a) * RING;
      this.cols[i].forEach((c, j) => {
        if (c.die > 0.3) return;
        const p = this.slot(i, j, c.yo), d = cam.p(p[0], p[1] + LH * 0.5, p[2])[3];
        (z > 0 ? back : front).push({ i, j, c, p, a, d });
      });
    }
    back.sort((p, q) => q.d - p.d); front.sort((p, q) => q.d - p.d);
    for (const it of back) this.drawCell(ctx, it, lo);
    this.drawCore(ctx, lo);
    this.drawLaser(ctx, false);
    for (const it of front) this.drawCell(ctx, it, lo);
    this.drawLaser(ctx, true);
    this.drawBeacons(ctx, lo);
    if (this.failing > 0) this.drawFail(ctx);
    if (this.freezeT > 0) { ctx.fillStyle = `rgba(186,230,253,${0.08 + 0.04 * Math.sin(this.t * 4)})`; ctx.fillRect(0, 46, W, H - 46); }

    // first levels: a bobbing arrow over each column that still hides a geode
    if (s.state === 'playing' && this.level <= 2 && !this.bonus && this.geodesLeft > 0) {
      for (let i = 0; i < this.cols.length; i++) {
        if (!this.cols[i].some((c) => c.kind === 'geode')) continue;
        const [x, y, z] = this.slot(i, this.cols[i].length + 1);
        if (z > 0) continue;   // behind the ring: not visible from the cannon side
        const q = this.cam.p(x, y + LH, z), bob = Math.sin(this.t * 5) * 5;
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.moveTo(q[0], q[1] - 6 + bob); ctx.lineTo(q[0] - 8 * q[2], q[1] - 20 + bob); ctx.lineTo(q[0] + 8 * q[2], q[1] - 20 + bob); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    if (s.state === 'playing' && !this.failing && !this.clearing && this.shots.length < (this.rapid() ? 3 : 1)) this.drawGhost(ctx);
    for (const sh of this.shots) this.drawShot(ctx, sh, lo);
    this.drawCannon(ctx, lo);
    this.drawHud(ctx);
  }

  /** a beam of gold light rises from every buried geode, so you can see where to dig */
  drawBeacons(ctx, lo) {
    const cam = this.cam;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const col = this.cols[i], j = col.findIndex((c) => c.kind === 'geode' && !c.die);
      if (j < 0) continue;
      const [x, , z] = this.slot(i, 0), b = cam.p(x, j * LH + LH / 2, z), top = cam.p(x, col.length * LH + 34, z);
      const w = CR * 0.55 * b[2], a = 0.18 + 0.1 * Math.sin(this.t * 4 + i);
      const g = ctx.createLinearGradient(0, b[1], 0, top[1]);
      g.addColorStop(0, `rgba(253,224,71,${a})`); g.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(b[0] - w, b[1]); ctx.lineTo(b[0] + w, b[1]); ctx.lineTo(top[0] + w * 0.4, top[1]); ctx.lineTo(top[0] - w * 0.4, top[1]); ctx.closePath(); ctx.fill();
      // a bobbing ◆ marker over the column
      const m = cam.p(x, col.length * LH + 22 + Math.sin(this.t * 4 + i) * 5, z), r = 9 * m[2];
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m[0], m[1] - r); ctx.lineTo(m[0] + r * 0.75, m[1]); ctx.lineTo(m[0], m[1] + r); ctx.lineTo(m[0] - r * 0.75, m[1]); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.restore();
  }

  drawBackdrop(ctx, lo) {
    const th = this.theme, g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  drawDust(ctx, lo) {
    if (lo) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = this.theme.vein;
    for (const d of this.dust) { ctx.globalAlpha = 0.25 + 0.25 * Math.sin(this.t * 2 + d.p); ctx.fillRect(d.x + Math.sin(this.t + d.p) * 4, d.y, d.r, d.r); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  /** The shaft wall: the far half as lit strips of rock, glowing veins, and a low lip in front. */
  drawWall(ctx, lo) {
    const cam = this.cam, th = this.theme, base = rgb(th.wall), S = 40;
    const strip = (a0, a1, y0, y1, k) => {
      const p = [cam.p(Math.sin(a0) * WALL_R, y0, -Math.cos(a0) * WALL_R), cam.p(Math.sin(a1) * WALL_R, y0, -Math.cos(a1) * WALL_R), cam.p(Math.sin(a1) * WALL_R, y1, -Math.cos(a1) * WALL_R), cam.p(Math.sin(a0) * WALL_R, y1, -Math.cos(a0) * WALL_R)];
      ctx.fillStyle = ctx.strokeStyle = css(mix([4, 2, 10], base, k));
      ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    ctx.lineWidth = 1;
    for (let k = 0; k < S; k++) {
      const a0 = Math.PI * 0.3 + k / S * Math.PI * 1.4, a1 = a0 + Math.PI * 1.4 / S, am = (a0 + a1) / 2;
      const n = [-Math.sin(am), 0, Math.cos(am)];                 // facing the middle of the shaft
      const shade = 0.55 + 0.6 * Math.max(0, dot(n, LIGHT)) + (k % 2 ? 0.05 : 0);
      strip(a0, a1, -40, WALL_TOP, shade);
    }
    // rock ledges (horizontal bands)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let y = 40; y < WALL_TOP; y += 64) {
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) { const a = Math.PI * 0.3 + k / 30 * Math.PI * 1.4, q = cam.p(Math.sin(a) * WALL_R, y + Math.sin(a * 7 + y) * 6, -Math.cos(a) * WALL_R); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    }
    if (!lo) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const v of this.veins) {
        const pulse = 0.45 + 0.2 * Math.sin(v[0][0] * 5);
        for (const [w, a] of [[6, 0.12 * pulse], [2, 0.8 * pulse]]) {
          ctx.strokeStyle = hexA(th.vein, a); ctx.lineWidth = w; ctx.beginPath();
          v.forEach(([ang, y], i) => { const q = cam.p(Math.sin(ang) * (WALL_R - 1), y, -Math.cos(ang) * (WALL_R - 1)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
          ctx.stroke();
        }
      }
      ctx.restore();
      // crystal clusters growing out of the rock
      for (const cl of this.clusters) {
        const cx = Math.sin(cl.a) * (WALL_R - 8), cz = -Math.cos(cl.a) * (WALL_R - 8);
        for (let k = -1; k <= 1; k++) {
          const tilt = k * 0.5, len = (k ? 0.75 : 1) * 46 * cl.s;
          const b = [cx + Math.cos(cl.a) * k * 10, cl.y, cz + Math.sin(cl.a) * k * 10];
          const tip = add(b, [Math.cos(cl.a) * tilt * len - Math.sin(cl.a) * len * 0.5, len, Math.sin(cl.a) * tilt * len + Math.cos(cl.a) * len * 0.5]);
          const part = prism(b, tip, 9 * cl.s + 3, 6);
          part.v.splice(6, 6, ...Array(6).fill(tip));               // a pointed tip
          const C = rgb(COLORS[cl.c]);
          drawPart(ctx, cam, part.v, part.faces.filter((f) => f.mat !== 0 || f.idx[0] === 0), part.c, (m, n) => lit(cam, C, n, { amb: 0.3, gain: 0.7 }), { alpha: 0.85, edge: 0.35 });
        }
        const q = cam.p(cx, cl.y + 20, cz);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(this.glow[cl.c], q[0] - 40 * q[2], q[1] - 40 * q[2], 80 * q[2], 80 * q[2]); ctx.restore();
      }
    }
    // the rim at the top of the shaft
    ctx.strokeStyle = hexA(th.rim, 0.5); ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const a = Math.PI * 0.3 + k / 40 * Math.PI * 1.4, q = cam.p(Math.sin(a) * WALL_R, WALL_TOP, -Math.cos(a) * WALL_R); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.stroke();
  }

  /** The turning platform at the bottom of the shaft. */
  drawPlatform(ctx, lo) {
    const cam = this.cam, th = this.theme, S = 48;
    const P = (a, r, y) => cam.p(Math.sin(a) * r, y, -Math.cos(a) * r);
    // the side band (front half)
    ctx.lineWidth = 1;
    for (let k = 0; k < S; k++) {
      const a0 = k / S * TAU, a1 = (k + 1) / S * TAU;
      if (Math.cos((a0 + a1) / 2) < -0.05) continue;
      const q = [P(a0, PLAT_R, 0), P(a1, PLAT_R, 0), P(a1, PLAT_R, -30), P(a0, PLAT_R, -30)];
      const n = [Math.sin((a0 + a1) / 2), 0, -Math.cos((a0 + a1) / 2)];
      const C = mix([0, 0, 0], rgb(th.plat2), 0.5 + 0.7 * Math.max(0, dot(n, LIGHT)));
      ctx.fillStyle = ctx.strokeStyle = css(C);
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // the top
    ctx.fillStyle = th.plat; ctx.beginPath();
    for (let k = 0; k < S; k++) { const q = P(k / S * TAU, PLAT_R, 0); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(th.rim, 0.75); ctx.lineWidth = 2; ctx.stroke();
    // turning spokes + a socket under every column (they show the spin)
    ctx.strokeStyle = hexA(th.rim, 0.22); ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < N; i++) { const a = this.colAngle(i) + SEC / 2, q0 = P(a, 44, 0), q1 = P(a, PLAT_R - 6, 0); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); }
    ctx.stroke();
    for (let i = 0; i < N; i++) {
      const a = this.colAngle(i), danger = this.cols[i].length >= MAXH - 1 && !this.bonus;
      ctx.strokeStyle = danger ? `rgba(251,113,133,${0.5 + 0.4 * Math.sin(this.t * 9)})` : hexA(th.rim, 0.4); ctx.lineWidth = danger ? 2.5 : 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const th2 = a + k / 6 * TAU + TAU / 12, q = cam.p(Math.sin(a) * RING + Math.sin(th2) * CR * 1.1, 0.5, -Math.cos(a) * RING - Math.cos(th2) * CR * 1.1); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    }
    // the hub
    ctx.fillStyle = th.plat2; ctx.beginPath();
    for (let k = 0; k < 24; k++) { const q = P(k / 24 * TAU + this.rot, 44, 2); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = th.rim; ctx.lineWidth = 1.5; ctx.stroke();
    // the low lip of the shaft in front of the platform
    for (let k = 0; k < S; k++) {
      const a0 = k / S * TAU, a1 = (k + 1) / S * TAU;
      if (Math.cos((a0 + a1) / 2) < 0.25) continue;
      const q = [P(a0, WALL_R, -40), P(a1, WALL_R, -40), P(a1, WALL_R, 10), P(a0, WALL_R, 10)];
      ctx.fillStyle = ctx.strokeStyle = css(mix([0, 0, 0], rgb(th.wall), 0.8));
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  /** A beam of light up the middle of the shaft. */
  drawCore(ctx, lo) {
    const cam = this.cam, th = this.theme, b = cam.p(0, 0, 0), t = cam.p(0, WALL_TOP, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const w = 26 * b[2], g = ctx.createLinearGradient(b[0] - w, 0, b[0] + w, 0);
    g.addColorStop(0, hexA(th.vein, 0)); g.addColorStop(0.5, hexA(th.vein, lo ? 0.18 : 0.28 + 0.06 * Math.sin(this.t * 3))); g.addColorStop(1, hexA(th.vein, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(b[0] - w, b[1]); ctx.lineTo(b[0] + w, b[1]); ctx.lineTo(t[0] + w * 0.6, t[1]); ctx.lineTo(t[0] - w * 0.6, t[1]); ctx.closePath(); ctx.fill();
    if (!lo) { ctx.globalAlpha = 0.5; ctx.drawImage(this.glowW, b[0] - 60 * b[2], b[1] - 30 * b[2], 120 * b[2], 60 * b[2]); }
    ctx.restore();
  }

  /** The red laser ring a column must not break: far half (behind the front crystals) or near half. */
  drawLaser(ctx, near) {
    const cam = this.cam, r = RING + 46, hot = !this.bonus && this.cols.some((c) => c.length >= MAXH - 1);
    const a = hot ? 0.65 + 0.35 * Math.sin(this.t * 10) : 0.45;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [w, k] of [[7, 0.18], [2.2, 1]]) {
      ctx.strokeStyle = this.bonus ? `rgba(253,224,71,${a * k})` : `rgba(255,42,79,${a * k})`; ctx.lineWidth = w; ctx.beginPath();
      let open = false;
      for (let i = 0; i <= 64; i++) {
        const ang = i / 64 * TAU, isNear = Math.cos(ang) > 0;
        if (isNear !== near) { open = false; continue; }
        const q = cam.p(Math.sin(ang) * r, TOPY, -Math.cos(ang) * r);
        open ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); open = true;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFail(ctx) {
    const i = this.failCol; if (i < 0) return;
    const [x, , z] = this.slot(i, 0), b = this.cam.p(x, 0, z), t = this.cam.p(x, TOPY + 60, z);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,42,79,${0.25 + 0.2 * Math.sin(this.t * 20)})`;
    const w = CR * 1.3 * b[2];
    ctx.fillRect(Math.min(b[0], t[0]) - w, t[1], Math.abs(b[0] - t[0]) + w * 2, b[1] - t[1]);
    ctx.restore();
  }

  drawCell(ctx, it, lo) {
    const c = it.c, k = c.die ? clamp(c.die / 0.26, 0, 1) : 0;
    if (c.die && c.die < 0) { this.drawCrystal(ctx, it.p, it.a, c, lo, 1, 1); return; }
    const front = -Math.cos(it.a) < -60;
    this.drawCrystal(ctx, it.p, it.a, c, lo, 1 + k * 0.35 - (c.land || 0) * 0.08, (front ? 0.93 : 1) * (1 - k) * (c.born ? 1 - c.born * 0.7 : 1), k);
  }

  /** One crystal at world position p (base of its slot), turned to angle a. */
  drawCrystal(ctx, p, a, c, lo, sc = 1, alpha = 1, white = 0, colourOverride = null) {
    if (alpha <= 0.02) return;
    const cam = this.cam, v = [];
    for (const [fy, fr] of RINGS) for (let k = 0; k < 6; k++) {
      const th = a + k / 6 * TAU + TAU / 12, rr = CR * fr * sc;
      v.push([p[0] + Math.sin(th) * rr, p[1] + LH * 0.5 + (fy - 0.5) * LH * sc, p[2] - Math.cos(th) * rr]);
    }
    const centre = [p[0], p[1] + LH * 0.5, p[2]];
    let base, edge = 0.35;
    if (c.kind === 'stone') { base = rgb(STONE); edge = 0.15; }
    else if (c.kind === 'geode') { base = mix(rgb(GEODE), [255, 255, 255], 0.12 + 0.12 * Math.sin(this.t * 5 + p[0])); edge = 0.7; }
    else base = rgb(colourOverride || COLORS[c.c] || STONE);
    if (c.kind === 'ice') { base = mix(base, [220, 240, 255], 0.5); edge = 0.85; }
    if (c.kind === 'bolt') base = mix(base, [255, 255, 255], 0.15 + 0.15 * Math.sin(this.t * 14));
    if (c.prismFlash) { base = mix(base, [255, 255, 255], c.prismFlash * 0.6); c.prismFlash = Math.max(0, c.prismFlash - 0.03); }
    if (c.thaw) { base = mix(base, [255, 255, 255], c.thaw * 0.7); c.thaw = Math.max(0, c.thaw - 0.03); }
    if (white) base = mix(base, [255, 255, 255], white);
    if (this.s.gold && c.kind !== 'stone') edge = Math.max(edge, 0.5);
    drawPart(ctx, cam, v, CFACES, centre, (mat, n) => lit(cam, base, n, { amb: c.kind === 'stone' ? 0.35 : 0.28, gain: c.kind === 'stone' ? 0.6 : 0.85, spec: c.kind === 'stone' ? 0.2 : 0.8, top: 0.18, mat }), { alpha, edge, lw: c.kind === 'ice' ? 1.6 : 0.8 });
    const q = cam.p(centre[0], centre[1], centre[2]);
    if (c.kind === 'ice') {                                     // frost cracks
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * alpha})`; ctx.lineWidth = 1; ctx.beginPath();
      const r = CR * 0.55 * q[2];
      ctx.moveTo(q[0] - r, q[1] - r * 0.3); ctx.lineTo(q[0] - r * 0.1, q[1] + r * 0.1); ctx.lineTo(q[0] + r * 0.6, q[1] - r * 0.4); ctx.moveTo(q[0] - r * 0.1, q[1] + r * 0.1); ctx.lineTo(q[0] + r * 0.2, q[1] + r * 0.6);
      ctx.stroke();
    }
    if (c.kind === 'bolt') {                                    // a lightning glyph inside
      const r = CR * 0.45 * q[2];
      ctx.fillStyle = `rgba(255,255,255,${(0.75 + 0.25 * Math.sin(this.t * 14)) * alpha})`; ctx.beginPath();
      ctx.moveTo(q[0] + r * 0.2, q[1] - r); ctx.lineTo(q[0] - r * 0.45, q[1] + r * 0.1); ctx.lineTo(q[0] - r * 0.02, q[1] + r * 0.1);
      ctx.lineTo(q[0] - r * 0.25, q[1] + r); ctx.lineTo(q[0] + r * 0.45, q[1] - r * 0.15); ctx.lineTo(q[0] + r * 0.03, q[1] - r * 0.15); ctx.closePath(); ctx.fill();
    }
    if (c.kind === 'power') {                                   // the power's icon on a dark disc
      const r = CR * 0.42 * q[2] * sc;
      ctx.globalAlpha = alpha; ctx.fillStyle = 'rgba(8,6,20,.7)'; ctx.beginPath(); ctx.arc(q[0], q[1], r * 1.05, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      // icon glyph cached as a sprite — emoji fillText is slow on some phones
      this._picons ??= new Map();
      let pc = this._picons.get(c.p);
      if (!pc) {
        pc = document.createElement('canvas'); pc.width = pc.height = 64;
        const g2 = pc.getContext('2d'); g2.font = '48px system-ui'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(PICON[c.p], 32, 36);
        this._picons.set(c.p, pc);
      }
      ctx.drawImage(pc, q[0] - r * 0.78, q[1] - r * 0.7, r * 1.56, r * 1.56); ctx.globalAlpha = 1;
    }
    if (c.kind === 'geode') {                                   // sparkles on the gold
      const ph = (this.t * 1.6 + p[0] * 0.01) % 1, r = CR * 0.6 * q[2] * Math.sin(ph * Math.PI);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`; ctx.beginPath();
      const sx = q[0] + CR * 0.3 * q[2], sy = q[1] - CR * 0.2 * q[2];
      ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * 0.22, sy - r * 0.22); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * 0.22, sy + r * 0.22); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * 0.22, sy + r * 0.22); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * 0.22, sy - r * 0.22); ctx.closePath(); ctx.fill();
    }
    if (!lo && c.kind !== 'stone') {
      const g = c.kind === 'bolt' ? this.glowW : c.kind === 'geode' ? this.glowG : this.glow[c.c] || this.glowW, r = CR * (c.kind === 'bolt' || c.kind === 'geode' ? 2.6 : 1.9) * q[2] * sc;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (c.kind === 'geode' ? 0.6 : 0.32 + white * 0.5) * alpha;
      ctx.drawImage(g, q[0] - r, q[1] - r, r * 2, r * 2); ctx.restore();
    }
  }

  drawGhost(ctx) {
    const cam = this.cam, i = this.aimCol(), top = this.cols[i][this.cols[i].length - 1], to = this.ghostPos();
    const onGeode = top && top.kind === 'geode', danger = this.cols[i].length >= MAXH && !onGeode && !this.bonus;
    const prismNow = this.rapid() || this.prism > 0;
    const col = danger ? '#fb7185' : onGeode ? '#fde047' : prismNow ? '#ffffff' : COLORS[this.cur];
    // dotted arc from the muzzle
    const from = this.muzzle();
    ctx.fillStyle = hexA(col, 0.75);
    for (let k = 1; k < 14; k++) {
      const u = (k + (this.t * 3) % 1) / 14, e = add(from, mul(sub(to, from), u));
      e[1] += Math.sin(u * Math.PI) * 46;
      const q = cam.p(e[0], e[1], e[2]);
      ctx.beginPath(); ctx.arc(q[0], q[1], 2.4 * q[2] * 1.4, 0, TAU); ctx.fill();
    }
    // outline of where it will land
    const pulse = 0.5 + 0.3 * Math.sin(this.t * 8), base = [to[0], to[1] - LH * 0.5, to[2]];
    ctx.strokeStyle = hexA(col, pulse); ctx.lineWidth = onGeode ? 3 : 2; ctx.setLineDash([5, 4]);
    for (const fy of [0.2, 0.74]) {
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const th = this.colAngle(i) + k / 6 * TAU + TAU / 12, q = cam.p(base[0] + Math.sin(th) * CR * (onGeode ? 1.25 : 1), base[1] + fy * LH, base[2] - Math.cos(th) * CR * (onGeode ? 1.25 : 1)); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (onGeode) { const q = cam.p(...to); ctx.fillStyle = '#fde047'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('CRACK IT!', q[0], q[1] - 30 * q[2]); }
  }

  drawShot(ctx, sh, lo) {
    const p = this.shotPos(sh), cam = this.cam;
    const colHex = sh.prism ? COLORS[Math.floor(this.t * 12) % COLORS.length] : COLORS[sh.c];
    if (!lo) {                                                  // light trail
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let k = 1; k < sh.trail.length; k++) {
        const a = cam.p(...sh.trail[k - 1]), b = cam.p(...sh.trail[k]);
        ctx.strokeStyle = hexA(colHex, k / sh.trail.length * 0.6); ctx.lineWidth = 10 * b[2] * k / sh.trail.length;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.restore();
    }
    this.drawCrystal(ctx, [p[0], p[1] - LH * 0.5, p[2]], this.t * 9, { c: sh.c, kind: 'n' }, lo, 0.85, 1, sh.prism ? 0.2 : 0, colHex);
  }

  drawCannon(ctx, lo) {
    const cam = this.cam, s = this.s, gold = s.gold;
    const tgt = this.ghostPos(), d = norm(sub(tgt, PIV));
    const yaw = Math.atan2(d[0], d[2]), side = [Math.cos(yaw), 0, -Math.sin(yaw)], fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
    const body = gold ? rgb('#b7791f') : rgb('#3b4256'), dark = gold ? rgb('#5c3a0c') : rgb('#161a26'), trim = gold ? rgb('#fde68a') : rgb(this.theme.rim);
    const colour = (b) => (m, n) => lit(cam, m === 4 ? mix(b, [255, 255, 255], 0.1) : b, n, { amb: 0.32, gain: 0.8, spec: gold ? 1 : 0.5, mat: m });
    // pillar the cannon stands on, then the housing, then the barrel
    const pillar = boxPart(add(PIV, [0, -100, -4]), mul(side, 11), [0, 90, 0], mul(fwd, 11));
    drawPart(ctx, cam, pillar.v, pillar.faces, pillar.c, colour(dark), { edge: 0.1 });
    const house = boxPart(add(PIV, [0, -5, 0]), mul(side, 21), [0, 10, 0], mul(fwd, 18));
    drawPart(ctx, cam, house.v, house.faces, house.c, colour(body), { edge: 0.18 });
    const barrel = prism(add(PIV, mul(d, -8)), add(PIV, mul(d, 56)), 8, 8, Math.PI / 8);
    drawPart(ctx, cam, barrel.v, barrel.faces, barrel.c, (m, n) => colour(m === 2 ? mix(body, trim, 0.25) : body)(m, n), { edge: 0.2 });
    const collar = prism(add(PIV, mul(d, 50)), add(PIV, mul(d, 64)), 11, 8, Math.PI / 8);
    drawPart(ctx, cam, collar.v, collar.faces, collar.c, colour(mix(body, trim, 0.4)), { edge: 0.3 });
    // a glowing ring on the muzzle
    const mz = cam.p(...add(PIV, mul(d, 64)));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
    const loadedHex = this.rapid() || this.prism > 0 ? COLORS[Math.floor(this.t * 6) % COLORS.length] : COLORS[this.cur];
    ctx.drawImage(this.glow[COLORS.indexOf(loadedHex)], mz[0] - 26 * mz[2], mz[1] - 26 * mz[2], 52 * mz[2], 52 * mz[2]);
    ctx.restore();

    // the loaded crystal sits in a glass chamber on top of the housing
    const ch = add(PIV, [0, 2, -8]);
    this.drawCrystal(ctx, ch, this.t * 1.5, { c: this.cur, kind: 'n' }, lo, 0.36, 1, 0, loadedHex);
    const cq = cam.p(ch[0], ch[1] + LH * 0.5, ch[2]);
    if (!this.bonus) {                                          // the shot clock: a ring of light round the chamber
      const k = clamp(this.clock / this.clockMax, 0, 1), r = 17 * cq[2];
      const busy = this.shots.length || this.phase || this.feverT > 0 || this.freezeT > 0;
      ctx.strokeStyle = busy ? 'rgba(148,163,184,.4)' : k < 0.3 ? '#f87171' : gold ? '#fde047' : this.theme.rim;
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(cq[0], cq[1] + 4, r, r * 0.45, 0, -Math.PI / 2, -Math.PI / 2 + TAU * (busy ? 1 : k)); ctx.stroke(); ctx.lineCap = 'butt';
    }
    if (this.prism > 0 && !this.rapid()) { ctx.fillStyle = '#e0f2fe'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('💎 PRISM ×' + this.prism, cq[0], cq[1] - 26 * cq[2]); }

    // the next crystal on its little stand
    if (!this.rapid()) {
      const np = [-66, PIV[1] - 4 - LH * 0.5, PIV[2] + 6];
      const stand = prism([np[0], np[1] - 80, np[2]], [np[0], np[1] + 6, np[2]], 9, 6);
      drawPart(ctx, cam, stand.v, stand.faces, stand.c, colour(dark), { edge: 0.15 });
      this.drawCrystal(ctx, np, -this.t, { c: this.next, kind: 'n' }, lo, 0.36, 1);
      const q = this.nextScreen();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('NEXT ⇄', q[0], q[1] - 24);
    }
    if (gold) { ctx.fillStyle = '#fbbf24'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★ GOLDEN CRYSTAL CANNON', W / 2, H - 30); }
  }

  drawHud(ctx) {
    const s = this.s;
    if (s.state === 'title') return;
    ctx.save();
    ctx.fillStyle = 'rgba(3,2,12,.72)'; ctx.fillRect(0, 0, W, 46);
    ctx.textBaseline = 'middle';
    if (this.bonus) {
      progressBar(ctx, 14, 13, W - 28, 20, s.bonusLeft / 20, '#fbbf24', `★ CRYSTAL RAIN · ${this.rain} shattered · ${Math.ceil(s.bonusLeft)}s`);
    } else {
      // geodes: ◆ filled once cracked
      ctx.textAlign = 'left'; ctx.font = '800 11px system-ui'; ctx.fillStyle = '#fde68a'; ctx.fillText('GEODES', 14, 23);
      for (let g = 0; g < this.geodesNeed; g++) {
        const x = 72 + g * 20, y = 23, done = g < this.geodesNeed - this.geodesLeft;
        ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.closePath();
        ctx.fillStyle = done ? '#fde047' : 'rgba(253,224,71,.12)'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // the fever bar
      const fx = 140, fw = 180, on = this.feverT > 0;
      progressBar(ctx, fx, 13, fw, 20, this.fever, on ? `hsl(${(this.t * 300) % 360},90%,65%)` : '#e879f9', on ? `🔥 FEVER ${Math.ceil(this.feverT)}s · ×2` : 'FEVER');
      // spin / freeze
      ctx.textAlign = 'right'; ctx.font = '800 13px system-ui';
      if (this.freezeT > 0) { ctx.fillStyle = '#bae6fd'; ctx.fillText(`❄️ ${Math.ceil(this.freezeT)}s`, W - 14, 23); }
      else {
        ctx.fillStyle = this.revWarned ? (Math.sin(this.t * 16) > 0 ? '#fde047' : '#fff') : '#cbd5e1';
        ctx.fillText(`${this.spin >= 0 ? '⟳' : '⟲'} ${Math.abs(this.spin / 0.22).toFixed(1)}×`, W - 14, 23);
      }
    }
    // the rising floor: bar just under the HUD
    const k = clamp(this.pushT / this.pushEvery, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 46, W, 4);
    ctx.fillStyle = this.freezeT > 0 ? '#7dd3fc' : k > 0.85 ? '#f87171' : this.theme.rim; ctx.fillRect(0, 46, W * k, 4);
    ctx.textAlign = 'center'; ctx.font = '600 13px system-ui'; ctx.fillStyle = 'rgba(226,232,240,.5)'; ctx.textBaseline = 'alphabetic';
    const coarse = this.s.coarse;
    ctx.fillText(this.rapid() ? (coarse ? 'Hold to rapid-fire!' : 'Hold click or Space to rapid-fire!') : coarse ? 'Drag to aim · let go to fire · tap NEXT to swap' : 'Aim with the mouse · click to fire · ← → + Space · ↑ swap', W / 2, H - 18);
    ctx.restore();
  }
}

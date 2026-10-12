// ─────────────────────────────────────────────────────────────
//  CROWN HEIST — art painted in code (64×64, like raycast-art.js), on top of the
//  shared crypt art: sandstone cellars, golden marble halls, throne rooms,
//  portcullis, levers, hiding alcoves, rubble, cracked floors and pits, and the
//  new characters (gold-armoured knights, the Crown Wraith), pedestal and throne.
//  Glowing parts go on a separate glow layer the engine draws at full strength.
// ─────────────────────────────────────────────────────────────
import { makeHDTextures, makeHDSprites } from '../../assets/js/raycast-art.js';
import { texData } from '../../assets/js/raycast-hd.js';

const N = 64;
const cnv = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const paint = (fn, seed = 1) => { const c = cnv(), g = c.getContext('2d'); fn(g, rng(seed * 7919)); return c; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
function grain(g, r, n, cols, w = 1) { for (let i = 0; i < n; i++) { g.fillStyle = pick(r, cols); g.fillRect(Math.floor(r() * N), Math.floor(r() * N), w + Math.floor(r() * 2), 1); } }
function blocks(g, r, { base, mortar, rows = 4, hi = 'rgba(255,255,255,.13)', lo = 'rgba(0,0,0,.45)', cracks = 2 }) {
  g.fillStyle = mortar; g.fillRect(0, 0, N, N);
  const rh = N / rows;
  for (let row = 0; row < rows; row++) {
    let x = -Math.floor(r() * 14);
    while (x < N) {
      const w = 14 + Math.floor(r() * 16), y = row * rh;
      const draw = (ox) => {
        g.fillStyle = pick(r, base); g.fillRect(ox + 1, y + 1, w - 2, rh - 2);
        g.fillStyle = hi; g.fillRect(ox + 1, y + 1, w - 2, 1); g.fillRect(ox + 1, y + 1, 1, rh - 2);
        g.fillStyle = lo; g.fillRect(ox + 1, y + rh - 2, w - 2, 1); g.fillRect(ox + w - 2, y + 1, 1, rh - 2);
      };
      draw(x); if (x + w > N) draw(x - N);
      x += w;
    }
  }
  grain(g, r, 160, ['rgba(0,0,0,.22)', 'rgba(255,255,255,.06)', 'rgba(0,0,0,.12)']);
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1;
  for (let i = 0; i < cracks; i++) {
    let x = 4 + r() * 56, y = 4 + r() * 56; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 8; y += 2 + r() * 4; g.lineTo(x, y); }
    g.stroke();
  }
}
function sconceOn(wallCanvas, f) {
  const wall = cnv(); wall.getContext('2d').drawImage(wallCanvas, 0, 0);
  const g = wall.getContext('2d');
  g.fillStyle = '#1b1b1f'; g.fillRect(28, 40, 8, 10); g.fillRect(26, 34, 12, 6);
  g.fillStyle = '#3a3a42'; g.fillRect(26, 34, 12, 2);
  g.fillStyle = '#4a2a12'; g.fillRect(29.5, 26, 5, 9);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(36, 36, 2, 14);
  const glow = cnv(), q = glow.getContext('2d');
  const sway = [0, 1.5, -1.2][f], tall = [16, 19, 14][f];
  q.fillStyle = '#ff7a1a'; q.beginPath(); q.moveTo(26, 27); q.quadraticCurveTo(28 + sway, 27 - tall * 0.6, 32 + sway, 27 - tall); q.quadraticCurveTo(36 + sway, 27 - tall * 0.6, 38, 27); q.closePath(); q.fill();
  q.fillStyle = '#ffd25a'; q.beginPath(); q.moveTo(29, 27); q.quadraticCurveTo(30 + sway, 27 - tall * 0.45, 32 + sway * 0.8, 27 - tall * 0.75); q.quadraticCurveTo(34 + sway, 27 - tall * 0.45, 35, 27); q.closePath(); q.fill();
  q.fillStyle = '#fff6d0'; q.beginPath(); q.ellipse(32 + sway * 0.4, 24, 1.8, 3, 0, 0, 7); q.fill();
  return { data: texData(wall), glow: texData(glow) };
}

// ── the three looks ──────────────────────────────────────────
const SAND = (g, r) => blocks(g, r, { base: ['#a07a46', '#8f6c3c', '#ad8752', '#97733f'], mortar: '#3a2812', cracks: 2, hi: 'rgba(255,240,200,.22)' });
const MARBLE = (g, r) => {
  // big cream marble slabs with grey and gold veins, a gold band near the top and the foot
  g.fillStyle = '#d8cdb6'; g.fillRect(0, 0, N, N);
  for (const [y, h] of [[0, 30], [30, 34]]) {
    const gr = g.createLinearGradient(0, y, N, y + h); gr.addColorStop(0, '#efe6d2'); gr.addColorStop(0.5, '#ded2b8'); gr.addColorStop(1, '#e8dcc4');
    g.fillStyle = gr; g.fillRect(1, y + 1, N - 2, h - 2);
  }
  g.lineWidth = 0.8;
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = i % 3 === 0 ? 'rgba(190,140,40,.55)' : 'rgba(110,100,90,.35)';
    let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (r() - 0.3) * 16; y += (r() - 0.5) * 10; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(80,60,40,.35)'; g.fillRect(0, 30, N, 1); g.fillRect(0, 0, N, 1);
  for (const y of [6, 55]) {
    const gr = g.createLinearGradient(0, y, 0, y + 4); gr.addColorStop(0, '#fff1b0'); gr.addColorStop(0.5, '#d4a02a'); gr.addColorStop(1, '#7a520c');
    g.fillStyle = gr; g.fillRect(0, y, N, 4);
  }
  grain(g, r, 90, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.12)']);
};
const THRONE = (g, r) => {
  // deep crimson panels with a gold frame and a damask pattern
  g.fillStyle = '#3b0a0e'; g.fillRect(0, 0, N, N);
  const gr = g.createLinearGradient(0, 0, 0, N); gr.addColorStop(0, '#6b1219'); gr.addColorStop(1, '#4a0c12');
  g.fillStyle = gr; g.fillRect(4, 4, N - 8, N - 8);
  g.fillStyle = 'rgba(255,190,90,.12)';
  for (let y = 10; y < 60; y += 14) for (let x = 12 + ((y / 14) % 2) * 10; x < 60; x += 20) {
    g.beginPath(); g.moveTo(x, y - 5); g.quadraticCurveTo(x + 5, y, x, y + 5); g.quadraticCurveTo(x - 5, y, x, y - 5); g.fill();
    g.fillRect(x - 0.5, y - 7, 1, 14);
  }
  const fr = g.createLinearGradient(0, 0, N, N); fr.addColorStop(0, '#fde68a'); fr.addColorStop(0.5, '#b7791f'); fr.addColorStop(1, '#fbd34d');
  g.strokeStyle = fr; g.lineWidth = 2.5; g.strokeRect(3, 3, N - 6, N - 6);
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.strokeRect(5.5, 5.5, N - 11, N - 11);
  grain(g, r, 80, ['rgba(0,0,0,.18)', 'rgba(255,200,150,.05)']);
};
const LOOKS = { sand: SAND, marble: MARBLE, throne: THRONE };
const SEEDS = { sand: 60, marble: 61, throne: 65 };
/** wall texture ids per look */
export const WALL = { sand: 60, marble: 61, throne: 65 };
export const SCONCE = { sand: 70, marble: 73, throne: 76 };
export const BANNER = { sand: 79, marble: 80, throne: 81 };
export const LEVER = { sand: [82, 83], marble: [84, 85], throne: [86, 87] };
export const GATE = 88, ALCOVE = { sand: 89, marble: 90, throne: 91 }, RUBBLE = 92, VAULT = 93;
/** floor texture slots (opts.floorTex index) */
export const FL = { sand: 0, marble: 1, throne: 2, carpet: 3, crackSand: 4, crackMarble: 5, crackThrone: 6, pit: 7, gold: 8, nookSand: 9, nookMarble: 10, nookThrone: 11, rubble: 12 };

function banner(base, seed, cloth, trim) {
  return paint((g, r) => {
    base(g, r);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(19, 6, 28, 54);
    g.fillStyle = '#3f2a10'; g.fillRect(14, 4, 36, 3);
    const gr = g.createLinearGradient(18, 0, 46, 0); gr.addColorStop(0, cloth[1]); gr.addColorStop(0.5, cloth[0]); gr.addColorStop(1, cloth[1]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(18, 7); g.lineTo(46, 7); g.lineTo(46, 54); g.lineTo(32, 46); g.lineTo(18, 54); g.closePath(); g.fill();
    g.strokeStyle = trim; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 9); g.lineTo(44, 9); g.lineTo(44, 50); g.lineTo(32, 43); g.lineTo(20, 50); g.closePath(); g.stroke();
    // a crown on the banner
    g.fillStyle = trim; g.beginPath(); g.moveTo(24, 32); g.lineTo(25, 20); g.lineTo(29, 26); g.lineTo(32, 17); g.lineTo(35, 26); g.lineTo(39, 20); g.lineTo(40, 32); g.closePath(); g.fill();
    g.fillRect(24, 31, 16, 3);
  }, seed);
}
function lever(base, seed, on) {
  const wall = paint(base, seed), g = wall.getContext('2d');
  g.fillStyle = '#1c1c22'; g.fillRect(24, 24, 16, 22); g.fillStyle = '#3b3b45'; g.fillRect(24, 24, 16, 2);
  g.fillStyle = '#6b6b78'; for (const [x, y] of [[26, 27], [37, 27], [26, 43], [37, 43]]) g.fillRect(x, y, 1.5, 1.5);
  g.strokeStyle = '#2a2a30'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(32, 35); g.lineTo(32 + (on ? 9 : -9), on ? 46 : 22); g.stroke();
  g.fillStyle = on ? '#16a34a' : '#b91c1c'; g.beginPath(); g.arc(32 + (on ? 9 : -9), on ? 46 : 22, 3.2, 0, 7); g.fill();
  const glow = cnv(), q = glow.getContext('2d');
  q.fillStyle = on ? 'rgba(74,222,128,.9)' : 'rgba(248,113,113,.85)'; q.beginPath(); q.arc(32 + (on ? 9 : -9), on ? 46 : 22, 1.6, 0, 7); q.fill();
  return { data: texData(wall), glow: texData(glow) };
}
function nook(base, seed) {
  // inside a hiding alcove: the same wall, sunk in shadow, with a heavy curtain at the sides
  return paint((g, r) => {
    base(g, r);
    const gr = g.createRadialGradient(32, 34, 4, 32, 34, 44); gr.addColorStop(0, 'rgba(0,0,0,.82)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    for (const side of [0, 1]) {
      const x0 = side ? 52 : 0, cl = g.createLinearGradient(x0, 0, x0 + 12, 0);
      cl.addColorStop(0, side ? '#160a24' : '#2a1240'); cl.addColorStop(1, side ? '#2a1240' : '#160a24');
      g.fillStyle = cl; g.fillRect(x0, 0, 12, N);
      g.fillStyle = 'rgba(0,0,0,.4)'; for (let x = x0 + 2; x < x0 + 12; x += 3) g.fillRect(x, 0, 1, N);
    }
  }, seed);
}

export function makeArt() {
  const { tex: T, floors: F } = makeHDTextures();
  const walls = {};
  for (const k of Object.keys(LOOKS)) walls[k] = paint(LOOKS[k], SEEDS[k]);
  T[WALL.sand] = { data: texData(walls.sand) };
  T[WALL.marble] = { data: texData(walls.marble) };
  T[WALL.throne] = { data: texData(walls.throne) };
  for (const k of Object.keys(LOOKS)) for (let f = 0; f < 3; f++) T[SCONCE[k] + f] = sconceOn(walls[k], f);
  T[BANNER.sand] = { data: texData(banner(SAND, 60, ['#7c2d12', '#431407'], '#fbbf24')) };
  T[BANNER.marble] = { data: texData(banner(MARBLE, 61, ['#1e3a8a', '#172554'], '#fcd34d')) };
  T[BANNER.throne] = { data: texData(banner(THRONE, 65, ['#14532d', '#052e16'], '#fde68a')) };
  for (const k of Object.keys(LOOKS)) for (const on of [0, 1]) T[LEVER[k][on]] = lever(LOOKS[k], SEEDS[k], on);
  for (const k of Object.keys(LOOKS)) T[ALCOVE[k]] = { data: texData(nook(LOOKS[k], SEEDS[k])) };
  // the portcullis: iron bars over darkness, spikes at the foot
  T[GATE] = { data: texData(paint((g) => {
    g.fillStyle = '#060504'; g.fillRect(0, 0, N, N);
    const bar = (x, y, w, h, horiz) => { const gr = horiz ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#2b2b30'); gr.addColorStop(0.45, '#8a8a96'); gr.addColorStop(1, '#1d1d22'); g.fillStyle = gr; g.fillRect(x, y, w, h); };
    for (const y of [8, 28, 48]) bar(0, y, N, 5, true);
    for (let x = 3; x < N; x += 10) { bar(x, 0, 5, 58, false); g.fillStyle = '#9ca3af'; g.beginPath(); g.moveTo(x, 58); g.lineTo(x + 2.5, 64); g.lineTo(x + 5, 58); g.fill(); }
    g.fillStyle = '#5b3a1e'; for (let i = 0; i < 26; i++) g.fillRect((i * 37) % 60, (i * 23) % 56, 2, 1);
    g.fillStyle = '#c0c0cc'; for (let x = 3; x < N; x += 10) for (const y of [9, 29, 49]) g.fillRect(x + 1.5, y + 1.5, 2, 2);
  }, 88)) };
  // rubble: the vault falling in
  T[RUBBLE] = { data: texData(paint((g, r) => {
    g.fillStyle = '#1a140e'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 46; i++) {
      const x = r() * N, y = r() * N, s = 5 + r() * 12;
      const gr = g.createLinearGradient(x - s, y - s, x + s, y + s); gr.addColorStop(0, pick(r, ['#a08260', '#8a6e50', '#b39370', '#6b5640'])); gr.addColorStop(1, '#2a2016');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s * 0.3, y - s * 0.8); g.lineTo(x + s * 0.7, y - s * 0.5); g.lineTo(x + s, y + s * 0.3); g.lineTo(x, y + s * 0.8); g.closePath(); g.fill();
    }
    grain(g, r, 200, ['rgba(0,0,0,.3)', 'rgba(255,240,200,.08)']);
  }, 92)) };
  T[VAULT] = T[1];

  // ── floors ──
  const flag = (cols, mortar, seed) => paint((g, r) => {
    g.fillStyle = mortar; g.fillRect(0, 0, N, N);
    for (const [x, y, w, h] of [[0, 0, 32, 32], [32, 0, 32, 20], [32, 20, 32, 12], [0, 32, 20, 32], [20, 32, 44, 32]]) {
      g.fillStyle = pick(r, cols); g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 1, y + 1, w - 2, 1);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + h - 2, w - 2, 1);
    }
    grain(g, r, 220, ['rgba(0,0,0,.22)', 'rgba(255,255,255,.05)', 'rgba(0,0,0,.12)']);
  }, seed);
  const floorCan = {
    sand: flag(['#6e5636', '#655032', '#7a603c', '#5e4a2e'], '#241a0e', 101),
    marble: paint((g) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const light = (x + y) % 2 === 0, gr = g.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
        gr.addColorStop(0, light ? '#f3ead6' : '#25201b'); gr.addColorStop(1, light ? '#cfc2a4' : '#3a322a'); g.fillStyle = gr; g.fillRect(x * 32, y * 32, 32, 32);
      }
      g.strokeStyle = 'rgba(212,160,42,.9)'; g.lineWidth = 1.2; g.strokeRect(0.6, 0.6, 62.8, 62.8); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
      g.strokeStyle = 'rgba(120,110,100,.35)'; g.beginPath(); g.moveTo(4, 8); g.bezierCurveTo(12, 14, 18, 6, 28, 20); g.moveTo(38, 40); g.bezierCurveTo(46, 46, 50, 38, 60, 52); g.stroke();
    }, 102),
    throne: paint((g, r) => {
      g.fillStyle = '#1a1416'; g.fillRect(0, 0, N, N);
      for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) { g.fillStyle = pick(r, ['#2a2226', '#241d20', '#2f272b']); g.fillRect(x + 1, y + 1, 30, 30); }
      g.fillStyle = '#b7791f'; g.beginPath(); g.moveTo(32, 22); g.lineTo(42, 32); g.lineTo(32, 42); g.lineTo(22, 32); g.closePath(); g.fill();
      g.fillStyle = '#fde68a'; g.beginPath(); g.moveTo(32, 26); g.lineTo(38, 32); g.lineTo(32, 38); g.lineTo(26, 32); g.closePath(); g.fill();
      grain(g, r, 120, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.04)']);
    }, 103),
    carpet: paint((g, r) => {
      const gr = g.createLinearGradient(0, 0, N, 0); gr.addColorStop(0, '#7f1d1d'); gr.addColorStop(0.5, '#991b1b'); gr.addColorStop(1, '#7f1d1d');
      g.fillStyle = gr; g.fillRect(0, 0, N, N);
      g.fillStyle = 'rgba(253,224,71,.55)'; for (let y = 4; y < N; y += 16) for (let x = 8 + (y % 32 ? 16 : 0); x < N; x += 32) { g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y); g.fill(); }
      grain(g, r, 260, ['rgba(0,0,0,.15)', 'rgba(255,200,200,.05)']);
    }, 104),
  };
  const cracked = (base, seed) => paint((g, r) => {
    g.drawImage(base, 0, 0);
    g.lineJoin = 'round';
    for (let k = 0; k < 4; k++) {
      let x = 32 + (r() - 0.5) * 10, y = 32 + (r() - 0.5) * 10, a = r() * Math.PI * 2;
      g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 6; i++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.9)'; g.beginPath(); g.ellipse(32, 32, 5, 3.5, 0.4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,240,210,.18)'; g.lineWidth = 1; g.beginPath(); g.ellipse(32, 31, 6, 4.4, 0.4, 0, 7); g.stroke();
  }, seed);
  const pit = paint((g, r) => {
    g.drawImage(floorCan.sand, 0, 0);
    g.fillStyle = '#000'; g.beginPath();
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, rr = 25 + r() * 6; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 26); gr.addColorStop(0, 'rgba(120,20,0,.55)'); gr.addColorStop(0.5, 'rgba(30,5,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
  }, 105);
  const dark = (c) => paint((g) => { g.drawImage(c, 0, 0); g.fillStyle = 'rgba(8,4,14,.55)'; g.fillRect(0, 0, N, N); g.fillStyle = 'rgba(60,20,90,.25)'; g.fillRect(6, 6, 52, 52); }, 106);
  const rubbleFloor = paint((g) => { g.drawImage(floorCan.sand, 0, 0); g.globalAlpha = 0.85; g.drawImage(paint((q, r) => { for (let i = 0; i < 30; i++) { q.fillStyle = pick(r, ['#8a6e50', '#5a4632', '#a08260']); q.fillRect(r() * N, r() * N, 3 + r() * 6, 2 + r() * 4); } }, 107), 0, 0); }, 108);
  const floorTex = [floorCan.sand, floorCan.marble, floorCan.throne, floorCan.carpet,
    cracked(floorCan.sand, 111), cracked(floorCan.marble, 112), cracked(floorCan.throne, 113), pit, null,
    dark(floorCan.sand), dark(floorCan.marble), dark(floorCan.throne), rubbleFloor].map((c) => (c ? { data: texData(c) } : null));
  floorTex[FL.gold] = F.gold.floor;
  const beams = (stone, wood, seed) => paint((g, r) => {
    blocks(g, r, { base: stone, mortar: '#08080b', rows: 4, cracks: 1 });
    const gr = g.createLinearGradient(0, 26, 0, 38); gr.addColorStop(0, wood[0]); gr.addColorStop(0.5, wood[1]); gr.addColorStop(1, wood[2]);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 38, N, 3);
    g.fillStyle = gr; g.fillRect(0, 26, N, 12);
  }, seed);
  const ceil = {
    sand: { data: texData(beams(['#5a4528', '#4e3c22', '#634c2c'], ['#3a2412', '#5a3a1c', '#2a190c'], 121)) },
    marble: { data: texData(paint((g) => {
      g.fillStyle = '#3a2c18'; g.fillRect(0, 0, N, N);
      const gr = g.createLinearGradient(8, 8, 56, 56); gr.addColorStop(0, '#f1e6cc'); gr.addColorStop(1, '#b9aa88');
      g.fillStyle = gr; g.fillRect(6, 6, 52, 52);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(12, 12, 40, 40);
      g.strokeStyle = '#d4a02a'; g.lineWidth = 2; g.strokeRect(6, 6, 52, 52); g.strokeRect(12, 12, 40, 40);
      g.fillStyle = '#fbd34d'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill();
    }, 122)) },
    throne: { data: texData(beams(['#2a1216', '#22100f', '#301619'], ['#3a1a0e', '#5a2a14', '#2a120a'], 123)) },
  };
  return { tex: T, floorTex, ceil, floors: F };
}

// ── sprites ─────────────────────────────────────────────────
export function makeSprites() {
  const S = makeHDSprites();
  const sp = (fn, glowFn, seed = 3) => { const c = paint(fn, seed); const out = { data: texData(c), canvas: c }; if (glowFn) { const gc = paint(glowFn, seed); out.glow = texData(gc); out.glowCanvas = gc; } return out; };
  const flat = (o) => { const c = cnv(), g = c.getContext('2d'); g.drawImage(o.canvas, 0, 0); if (o.glowCanvas) g.drawImage(o.glowCanvas, 0, 0); return c; };
  const torchFlame = (g, x, y, f, s = 1) => {
    const sway = [0, 1.4, -1.2][f], tall = [11, 13, 9.5][f] * s;
    g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(x - 4 * s, y); g.quadraticCurveTo(x - 3 * s + sway, y - tall * 0.6, x + sway, y - tall); g.quadraticCurveTo(x + 3 * s + sway, y - tall * 0.6, x + 4 * s, y); g.fill();
    g.fillStyle = '#ffd25a'; g.beginPath(); g.moveTo(x - 2 * s, y); g.quadraticCurveTo(x - 1.5 * s + sway, y - tall * 0.4, x + sway * 0.7, y - tall * 0.7); g.quadraticCurveTo(x + 1.5 * s + sway, y - tall * 0.4, x + 2 * s, y); g.fill();
  };
  // gold-armoured knight with a red plume and a torch (two walking frames)
  const knight = (step) => sp((g) => {
    const lx = step ? 2.5 : -2.5;
    const metal = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.35, '#e0a82e'); gr.addColorStop(0.7, '#9a6512'); gr.addColorStop(1, '#5a3a08'); return gr; };
    g.fillStyle = metal(20, 44, 30, 64); g.fillRect(23 - lx, 44, 7, 18); g.fillStyle = metal(34, 44, 44, 64); g.fillRect(34 + lx, 44, 7, 18);   // legs
    g.fillStyle = '#3a2408'; g.fillRect(22 - lx, 60, 9, 4); g.fillRect(33 + lx, 60, 9, 4);
    g.fillStyle = metal(18, 20, 46, 46); g.beginPath(); g.moveTo(19, 22); g.lineTo(45, 22); g.lineTo(42, 46); g.lineTo(22, 46); g.closePath(); g.fill();   // breastplate
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(25, 24, 2, 18);
    g.fillStyle = '#7f1d1d'; g.fillRect(22, 41, 20, 4);                                    // red sash
    g.fillStyle = metal(12, 20, 20, 40); g.beginPath(); g.ellipse(17, 25, 6, 5, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(47, 25, 6, 5, 0, 0, 7); g.fill();   // pauldrons
    g.fillStyle = metal(10, 26, 16, 44); g.fillRect(11, 27, 6, 15 + (step ? 1 : -1));       // left arm
    g.fillStyle = metal(46, 26, 52, 40); g.fillRect(47, 26, 6, 10); g.fillRect(49, 34, 6, 6);   // torch arm
    g.fillStyle = '#5a3412'; g.fillRect(52, 18, 3, 20);                                     // torch
    g.fillStyle = '#2a2a30'; g.fillRect(51, 17, 5, 3);
    g.fillStyle = metal(24, 4, 40, 22); g.beginPath(); g.moveTo(24, 21); g.lineTo(24, 9); g.quadraticCurveTo(32, 2, 40, 9); g.lineTo(40, 21); g.closePath(); g.fill();   // helm
    g.fillStyle = '#120a02'; g.fillRect(26, 12, 12, 3); g.fillRect(31, 12, 2, 8);
    g.fillStyle = '#b91c1c'; g.beginPath(); g.moveTo(31, 4); g.quadraticCurveTo(22, -2, 18, 10); g.quadraticCurveTo(26, 4, 33, 6); g.fill();   // plume
  }, (g) => {
    torchFlame(g, 53.5, 17, step ? 1 : 0);
    g.fillStyle = 'rgba(255,200,80,.9)'; g.fillRect(28, 13, 2, 1.4); g.fillRect(34, 13, 2, 1.4);
  }, 31 + step);
  S.knight = [knight(0), knight(1)];
  S.knightCanvas = flat(S.knight[0]);
  // the Crown Wraith: a hooded shroud of pale fire with a crown of light
  const wraith = (f) => sp((g) => {
    const gr = g.createLinearGradient(0, 4, 0, 64); gr.addColorStop(0, 'rgba(30,60,70,.9)'); gr.addColorStop(1, 'rgba(10,20,30,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(52, 10, 54, 40);
    for (let x = 54; x > 10; x -= 6) g.lineTo(x - 3, 60 + ((x + f * 3) % 4)), g.lineTo(x - 6, 52);
    g.quadraticCurveTo(12, 10, 32, 6); g.fill();
    g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.ellipse(32, 22, 9, 10, 0, 0, 7); g.fill();
  }, (g) => {
    g.strokeStyle = 'rgba(125,249,255,.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(52, 10, 54, 40); g.moveTo(32, 6); g.quadraticCurveTo(12, 10, 10, 40); g.stroke();
    g.fillStyle = 'rgba(165,243,252,.95)'; g.beginPath(); g.arc(28.5, 22, 1.8, 0, 7); g.arc(35.5, 22, 1.8, 0, 7); g.fill();
    g.fillStyle = 'rgba(103,232,249,.35)'; g.beginPath(); g.arc(28.5, 22, 4, 0, 7); g.arc(35.5, 22, 4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(253,230,138,.85)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(24, 9); g.lineTo(25, 3 + f); g.lineTo(28.5, 7); g.lineTo(32, 1 + f); g.lineTo(35.5, 7); g.lineTo(39, 3 + f); g.lineTo(40, 9); g.stroke();
    g.fillStyle = 'rgba(103,232,249,.18)'; g.fillRect(14, 30, 36, 26);
  }, 41 + f);
  S.wraith = [wraith(0), wraith(1)];
  S.wraithCanvas = flat(S.wraith[0]);
  // pedestal (with and without its crown on top — the crown is a separate lifted sprite)
  S.pedestal = sp((g) => {
    const gr = g.createLinearGradient(22, 0, 42, 0); gr.addColorStop(0, '#3a3530'); gr.addColorStop(0.45, '#9a9088'); gr.addColorStop(1, '#2a2622');
    g.fillStyle = gr; g.fillRect(24, 36, 16, 24);
    g.fillStyle = '#d4a02a'; g.fillRect(20, 33, 24, 4); g.fillRect(19, 59, 26, 5);
    g.fillStyle = '#fff1b0'; g.fillRect(20, 33, 24, 1);
    g.fillStyle = '#7f1d1d'; g.fillRect(22, 31, 20, 2);
  }, null, 51);
  // a lesser crown (floors 1-14) — the crown of the Crypt Kings (S.crown) waits on floor 15
  S.lesser = sp((g) => {
    const gr = g.createLinearGradient(0, 22, 0, 52); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.5, '#e0a82e'); gr.addColorStop(1, '#7a4a08');
    g.fillStyle = gr; g.beginPath(); g.moveTo(14, 48); g.lineTo(15, 26); g.lineTo(24, 36); g.lineTo(32, 22); g.lineTo(40, 36); g.lineTo(49, 26); g.lineTo(50, 48); g.closePath(); g.fill();
    g.fillRect(14, 46, 36, 7);
    g.fillStyle = '#fff6d0'; for (const [x, y] of [[15, 26], [32, 22], [49, 26]]) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  }, (g) => { g.fillStyle = 'rgba(255,240,180,.9)'; g.fillRect(20, 47, 2, 2); g.fillRect(31, 47, 2, 2); g.fillRect(42, 47, 2, 2); }, 52);
  S.lesserCanvas = flat(S.lesser);
  // the throne (throne rooms and the secret floor)
  S.throne = sp((g) => {
    const gold = g.createLinearGradient(8, 0, 56, 0); gold.addColorStop(0, '#7a4a08'); gold.addColorStop(0.5, '#f5c542'); gold.addColorStop(1, '#7a4a08');
    g.fillStyle = gold; g.beginPath(); g.moveTo(14, 64); g.lineTo(14, 14); g.lineTo(20, 6); g.lineTo(26, 12); g.lineTo(32, 2); g.lineTo(38, 12); g.lineTo(44, 6); g.lineTo(50, 14); g.lineTo(50, 64); g.closePath(); g.fill();
    g.fillStyle = '#7f1d1d'; g.fillRect(19, 16, 26, 26);
    g.fillStyle = '#991b1b'; g.fillRect(17, 42, 30, 8);
    g.fillStyle = gold; g.fillRect(8, 36, 8, 22); g.fillRect(48, 36, 8, 22); g.fillRect(14, 50, 36, 4);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(17, 54, 30, 10);
  }, (g) => { g.fillStyle = '#ef4444'; g.beginPath(); g.arc(32, 9, 2.4, 0, 7); g.fill(); g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(20, 10, 1.6, 0, 7); g.arc(44, 10, 1.6, 0, 7); g.fill(); }, 53);
  // smoke puff (drawn see-through)
  S.smoke = sp((g) => {
    for (let i = 0; i < 9; i++) {
      const x = 32 + Math.cos(i * 2.4) * 12, y = 38 + Math.sin(i * 1.7) * 9, rr = 12 + (i % 3) * 4;
      const gr = g.createRadialGradient(x, y, 1, x, y, rr); gr.addColorStop(0, 'rgba(190,190,200,.75)'); gr.addColorStop(1, 'rgba(150,150,165,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    }
  }, null, 54);
  // exit stairs going UP out of the vault, with daylight-gold glow
  S.exit = S.stairs;
  return S;
}

/** The hand holding the crown, low on the right of the view, gold light pouring off it. */
export function drawCrownHand(ctx, view, img, { t, sway = 0, dip = 0, gold = false, big = false }) {
  const x = view.x + view.w - 150 + sway * 0.6, y = view.y + view.h - 92 + Math.abs(sway) * 0.8 + dip + Math.sin(t * 2.2) * 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const gl = ctx.createRadialGradient(x + 10, y - 20, 6, x + 10, y - 20, big ? 220 : 170);
  gl.addColorStop(0, `rgba(255,214,90,${0.34 + 0.06 * Math.sin(t * 5)})`); gl.addColorStop(0.5, 'rgba(255,170,40,.12)'); gl.addColorStop(1, 'rgba(255,150,30,0)');
  ctx.fillStyle = gl; ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.globalCompositeOperation = 'source-over';
  const sz = big ? 150 : 128, cx = x + 4, cy = y - 22, tilt = -0.12 + Math.sin(t * 1.7) * 0.03;
  const leather = (x0, y0, x1, y1) => { const gr = ctx.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, gold ? '#fde68a' : '#6b4428'); gr.addColorStop(0.5, gold ? '#d4a02a' : '#4a2c18'); gr.addColorStop(1, gold ? '#7a4a06' : '#24140a'); return gr; };
  // forearm, coming up from the bottom right corner
  ctx.fillStyle = leather(cx + 20, cy + 40, cx + 90, cy + 40);
  ctx.beginPath(); ctx.moveTo(cx + 6, cy + 40); ctx.lineTo(cx + 46, cy + 34); ctx.lineTo(cx + 120, view.y + view.h + 10); ctx.lineTo(cx + 40, view.y + view.h + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = gold ? '#fff1b0' : '#8a5a34'; ctx.fillRect(cx + 4, cy + 46, 48, 7);                       // cuff
  // palm under the crown
  ctx.fillStyle = leather(cx - 40, cy + 20, cx + 40, cy + 60);
  ctx.beginPath(); ctx.ellipse(cx + 6, cy + 38, 44, 18, -0.08, 0, 7); ctx.fill();
  // the crown, held up
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
  ctx.restore();
  // fingers wrapped over the band (in front of the crown)
  ctx.fillStyle = leather(cx - 40, cy + 20, cx - 40, cy + 44);
  for (let i = 0; i < 4; i++) {
    const fx = cx - 34 + i * 15, fy = cy + 18 + Math.abs(i - 1.5) * 3;
    ctx.beginPath(); ctx.ellipse(fx, fy + 8, 7, 12, 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(fx + 4, fy + 2, 2, 14); ctx.fillStyle = leather(cx - 40, cy + 20, cx - 40, cy + 44);
  }
  ctx.beginPath(); ctx.ellipse(cx + 40, cy + 26, 9, 15, -0.5, 0, 7); ctx.fill();                            // thumb
  // glints running over the gold
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.7 + i / 3) % 1, gx = x - 40 + k * 90, gy = y - 22 + Math.sin(k * 6 + i) * 10, a = Math.sin(k * Math.PI);
    ctx.fillStyle = `rgba(255,255,230,${0.8 * a})`;
    ctx.beginPath(); ctx.moveTo(gx, gy - 7 * a); ctx.lineTo(gx + 1.5, gy - 1.5); ctx.lineTo(gx + 7 * a, gy); ctx.lineTo(gx + 1.5, gy + 1.5); ctx.lineTo(gx, gy + 7 * a); ctx.lineTo(gx - 1.5, gy + 1.5); ctx.lineTo(gx - 7 * a, gy); ctx.lineTo(gx - 1.5, gy - 1.5); ctx.fill();
  }
  ctx.restore();
}

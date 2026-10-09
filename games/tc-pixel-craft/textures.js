// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — every texture, icon and creature, drawn in code.
//  Block textures are 16×16 RGB, three faces each (0 top, 1 side, 2 bottom):
//    TEX[((id * 3 + face) * 256 + v * 16 + u) * 3 + channel]
// ─────────────────────────────────────────────────────────────
import { B, I, INFO, NBLOCKS } from './items.js';

export const TS = 16;
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

export function makeTextures() {
  const T = new Uint8Array(NBLOCKS * 3 * 256 * 3);
  const r = prng(777);
  const put = (id, f, u, v, c) => { const o = ((id * 3 + f) * 256 + v * 16 + u) * 3; T[o] = c[0]; T[o + 1] = c[1]; T[o + 2] = c[2]; };
  const get = (id, f, u, v) => { const o = ((id * 3 + f) * 256 + v * 16 + u) * 3; return [T[o], T[o + 1], T[o + 2]]; };
  const each = (fn) => { for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) fn(u, v); };
  /** noisy fill from a palette, with a little brightness jitter */
  const noisy = (id, faces, pal, jitter = 0.08) => { const P = pal.map(hex); for (const f of faces) each((u, v) => put(id, f, u, v, shade(P[Math.floor(r() * P.length)], 1 - jitter + r() * jitter * 2))); };
  const copy = (id, from, ff, tf) => each((u, v) => put(id, tf, u, v, get(from, ff, u, v)));
  const ALL = [0, 1, 2];

  // dirt, grass, snow
  const dirtP = ['#8b5a2b', '#7a4e25', '#9c6833', '#6e4520', '#85552a'];
  noisy(B.DIRT, ALL, dirtP);
  for (let i = 0; i < 14; i++) put(B.DIRT, 1, Math.floor(r() * 16), Math.floor(r() * 16), hex('#a8a29e'));
  copy(B.DIRT, B.DIRT, 1, 0); copy(B.DIRT, B.DIRT, 1, 2);
  noisy(B.GRASS, [0], ['#5fbf3a', '#4ea52f', '#6fcf45', '#57b335', '#4a9e2c']);
  copy(B.GRASS, B.DIRT, 1, 1); copy(B.GRASS, B.DIRT, 1, 2);
  for (let u = 0; u < 16; u++) { const d = 3 + Math.floor(r() * 3); for (let v = 0; v < d; v++) put(B.GRASS, 1, u, v, shade(hex(['#5fbf3a', '#4ea52f', '#6fcf45'][Math.floor(r() * 3)]), v === d - 1 ? 0.8 : 1)); }
  noisy(B.SNOW, [0], ['#f8fafc', '#eef2f7', '#e2e8f0'], 0.03);
  copy(B.SNOW, B.DIRT, 1, 1); copy(B.SNOW, B.DIRT, 1, 2);
  for (let u = 0; u < 16; u++) { const d = 3 + Math.floor(r() * 2); for (let v = 0; v < d; v++) put(B.SNOW, 1, u, v, hex(v === d - 1 ? '#cbd5e1' : '#f1f5f9')); }

  // stone family
  const stoneP = ['#8a8a8a', '#7f7f7f', '#959595', '#858585', '#909090'];
  noisy(B.STONE, ALL, stoneP, 0.05);
  for (let i = 0; i < 6; i++) { let u = Math.floor(r() * 16), v = Math.floor(r() * 16); for (let k = 0; k < 4; k++) { for (const f of ALL) put(B.STONE, f, u & 15, v & 15, hex('#6e6e6e')); u += r() < 0.5 ? 1 : 0; v += r() < 0.5 ? 1 : -1; } }
  // cobble: rounded stones with dark mortar
  for (const f of ALL) each((u, v) => {
    const cx = Math.floor(u / 5.3), cy = Math.floor((v + (cx % 2) * 3) / 5.3);
    const du = (u % 5.3) / 5.3 - 0.5, dv = (((v + (cx % 2) * 3) % 5.3) / 5.3) - 0.5;
    const edge = Math.hypot(du, dv) > 0.46;
    const base = hex(['#7d7d7d', '#8e8e8e', '#6f6f6f', '#999999'][(cx * 7 + cy * 3) % 4]);
    put(B.COBBLE, f, u, v, edge ? hex('#4a4a4a') : shade(base, 0.92 + r() * 0.16 + (dv < -0.2 ? 0.1 : 0)));
  });
  // stone bricks
  for (const f of ALL) each((u, v) => {
    const row = Math.floor(v / 8), off = row % 2 ? 4 : 0;
    const mortar = v % 8 === 7 || (u + off) % 8 === 7;
    put(B.BRICKS, f, u, v, mortar ? hex('#555555') : shade(hex('#8c8c8c'), 0.9 + r() * 0.15 + (v % 8 === 0 ? 0.12 : 0)));
  });
  noisy(B.BEDROCK, ALL, ['#333333', '#555555', '#222222', '#444444', '#2a2a2a'], 0.1);
  noisy(B.SAND, ALL, ['#e8d9a0', '#dccb8c', '#f0e2ae', '#e2d295'], 0.04);
  noisy(B.GRAVEL, ALL, ['#8a817c', '#6b6461', '#9c9490', '#5b5552', '#a8a29e'], 0.1);
  noisy(B.SANDSTONE, [0, 2], ['#e0cf92', '#d6c486'], 0.03);
  each((u, v) => put(B.SANDSTONE, 1, u, v, shade(hex(v < 3 ? '#ead9a0' : v > 12 ? '#c9b679' : '#dcca8c'), 0.95 + r() * 0.08 + (v % 5 === 4 ? -0.12 : 0))));

  // ores: stone with chunky veins of colour
  const ore = (id, cols, glow = false) => {
    copy(id, B.STONE, 0, 0); copy(id, B.STONE, 1, 1); copy(id, B.STONE, 2, 2);
    const rr = prng(id * 991);
    for (let k = 0; k < 6; k++) {
      const cu = 1 + Math.floor(rr() * 13), cv = 1 + Math.floor(rr() * 13);
      for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
        if (rr() < 0.25 && (du || dv)) continue;
        const u = (cu + du) & 15, v = (cv + dv) & 15;
        const c = hex(cols[(du + dv + 3) % cols.length]);
        for (const f of ALL) put(id, f, u, v, dv < 0 || du < 0 ? shade(c, glow ? 1.25 : 1.15) : c);
      }
    }
  };
  ore(B.COAL_ORE, ['#2b2b2b', '#1c1c1c', '#3a3a3a']);
  ore(B.IRON_ORE, ['#d8a27a', '#e9bb94', '#b98660']);
  ore(B.GOLD_ORE, ['#f5c518', '#ffe066', '#d9a300']);
  ore(B.CRYSTAL_ORE, ['#f472b6', '#e879f9', '#fdf4ff', '#c026d3'], true);

  // wood
  for (const f of [1]) each((u, v) => put(B.LOG, f, u, v, shade(hex(u % 4 === 0 ? '#4a2e16' : (u + v * 3) % 7 === 0 ? '#5a381c' : '#6b4423'), 0.92 + r() * 0.14)));
  for (const f of [0, 2]) each((u, v) => { const d = Math.max(Math.abs(u - 7.5), Math.abs(v - 7.5)); put(B.LOG, f, u, v, d > 6.5 ? hex('#5a381c') : shade(hex(Math.floor(d) % 2 ? '#c09257' : '#a8793f'), 0.95 + r() * 0.08)); });
  for (const f of ALL) each((u, v) => {
    const plank = Math.floor(v / 4), seam = v % 4 === 3, joint = u === (plank * 5 + 3) % 16;
    put(B.PLANKS, f, u, v, seam ? hex('#7c5a2f') : joint ? hex('#8f6a38') : shade(hex(plank % 2 ? '#b8874a' : '#ad7d42'), 0.94 + r() * 0.1));
  });
  // leaves with holes (dark gaps)
  for (const f of ALL) each((u, v) => { const p = r(); put(B.LEAVES, f, u, v, p < 0.14 ? hex('#173d1b') : shade(hex(['#2f7d32', '#3a9a3d', '#24632a', '#2d8a33'][Math.floor(r() * 4)]), 0.9 + r() * 0.2)); });
  // cactus
  each((u, v) => { put(B.CACTUS, 1, u, v, shade(hex(u % 5 === 1 ? '#1f6b2e' : '#2f8f3f'), 0.94 + r() * 0.1)); if ((u * 3 + v * 7) % 23 === 0) put(B.CACTUS, 1, u, v, hex('#e5e7eb')); });
  each((u, v) => { const d = Math.max(Math.abs(u - 7.5), Math.abs(v - 7.5)); const c = hex(d > 6.5 ? '#1f6b2e' : d > 4 ? '#3fa34f' : '#2f8f3f'); put(B.CACTUS, 0, u, v, c); put(B.CACTUS, 2, u, v, c); });

  // crafting table: planks with tools on the side, a grid on top
  copy(B.TABLE, B.PLANKS, 0, 2);
  each((u, v) => put(B.TABLE, 0, u, v, (u === 0 || v === 0 || u === 15 || v === 15) ? hex('#6b4423') : (u % 5 === 0 || v % 5 === 0) ? hex('#7c5a2f') : shade(hex('#c4955a'), 0.94 + r() * 0.08)));
  each((u, v) => put(B.TABLE, 1, u, v, v < 3 ? hex('#7c5a2f') : get(B.PLANKS, 1, u, v)));
  for (let i = 0; i < 6; i++) { put(B.TABLE, 1, 3, 5 + i, hex('#5a381c')); put(B.TABLE, 1, 4 + (i < 2 ? i : 1), 5, hex('#9ca3af')); put(B.TABLE, 1, 11, 5 + i, hex('#5a381c')); }
  for (let i = 0; i < 4; i++) put(B.TABLE, 1, 10 + i, 6 + (i % 2), hex('#9ca3af'));
  // furnace: cobble with a dark mouth
  copy(B.FURNACE, B.COBBLE, 0, 0); copy(B.FURNACE, B.COBBLE, 0, 2);
  each((u, v) => { const mouth = u > 3 && u < 12 && v > 7 && v < 14; const fire = mouth && v > 10 && r() < 0.6; put(B.FURNACE, 1, u, v, fire ? hex(r() < 0.5 ? '#f97316' : '#fbbf24') : mouth ? hex('#1a1a1a') : (v === 7 && u > 2 && u < 13) ? hex('#3f3f3f') : get(B.COBBLE, 1, u, v)); });
  // water & lava (animated in the renderer by shifting u/v)
  each((u, v) => { const w = Math.sin(u * 0.8 + v * 0.3) + Math.sin(v * 0.9 - u * 0.2); for (const f of ALL) put(B.WATER, f, u, v, shade(hex('#2f6fd6'), 0.92 + w * 0.06 + r() * 0.04)); });
  each((u, v) => { const w = Math.sin(u * 0.7 + v * 0.5) * Math.sin(v * 0.6 - u * 0.4); for (const f of ALL) put(B.LAVA, f, u, v, hex(w > 0.3 ? '#ffd166' : w > -0.1 ? '#ff9100' : r() < 0.5 ? '#e04a00' : '#ff7a00')); });
  // torch (only the stick is drawn — see the renderer)
  each((u, v) => { for (const f of ALL) put(B.TORCH, f, u, v, v < 4 ? hex(v < 2 ? '#fff3b0' : '#fbbf24') : hex(u % 2 ? '#8b5a2b' : '#6b4423')); });
  // bed: red blanket, white pillow
  each((u, v) => { put(B.BED, 0, u, v, v < 5 ? hex('#f1f5f9') : shade(hex('#dc2626'), 0.92 + r() * 0.1 + ((u + v) % 4 === 0 ? 0.08 : 0))); });
  each((u, v) => put(B.BED, 1, u, v, v < 7 ? shade(hex('#dc2626'), 0.9 + r() * 0.08) : v < 9 ? hex('#f1f5f9') : hex(u < 2 || u > 13 ? '#6b4423' : '#1f1f1f')));
  copy(B.BED, B.PLANKS, 2, 2);
  // altar: dark bricks with glowing crystal
  each((u, v) => { const g = Math.hypot(u - 7.5, v - 7.5); for (const f of ALL) put(B.ALTAR, f, u, v, g < 3 && f !== 2 ? hex(g < 1.5 ? '#fdf4ff' : '#e879f9') : (u % 8 === 0 || v % 5 === 0) ? hex('#1e1b2e') : shade(hex('#3b2f5c'), 0.9 + r() * 0.15)); });
  return T;
}

// ── Pixel-art icons for items and creatures ─────────────────
function art(rows, pal) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}
const PICK = ['................', '....hhhhhhh.....', '..hhHHHHHHHhh...', '.hhd....s..dhh..', '.hd....ss...dh..', '.h....ss.....h..', '.....ss.......d.', '....ss..........', '...ss...........', '..ss............', '.ss.............', 'ss..............', 's...............', '................', '................', '................'];
const AXE = ['................', '.........hhh....', '........hHHHh...', '.......hHHHHdh..', '.......hHHsdhh..', '........hss.....', '........ss......', '.......ss.......', '......ss........', '.....ss.........', '....ss..........', '...ss...........', '..ss............', '.ss.............', '................', '................'];
const SHOVEL = ['................', '...........hhh..', '..........hHHHh.', '..........hHHHh.', '...........hHd..', '..........ss....', '.........ss.....', '........ss......', '.......ss.......', '......ss........', '.....ss.........', '....ss..........', '...ss...........', '..ss............', '................', '................'];
const SWORD = ['................', '.............hh.', '............hHh.', '...........hHh..', '..........hHh...', '.........hHh....', '........hHh.....', '...d...hHh......', '....d.hHh.......', '.....dHh........', '.....ss.d.......', '....ss...d......', '...ss...........', '..d.............', '................', '................'];
const ARM = [
  ['................', '................', '....hhhhhhhh....', '...hHHHHHHHHh...', '..hHHHHHHHHHHh..', '..hHHhhhhhhHHh..', '..hHh......hHh..', '..hHh......hHh..', '..hdh......hdh..', '................', '................', '................', '................', '................', '................', '................'],
  ['................', '..hhh......hhh..', '.hHHHh....hHHHh.', '.hHHHHhhhhHHHHh.', '.hHHHHHHHHHHHHh.', '..hhHHHHHHHHhh..', '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hdddddddddh..', '................', '................', '................', '................'],
  ['................', '...hhhhhhhhhh...', '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hHHHhhHHHh...', '...hHHh..hHHh...', '...hHHh..hHHh...', '...hHHh..hHHh...', '...hHHh..hHHh...', '...hHHh..hHHh...', '...hHHh..hHHh...', '...hddh..hddh...', '................', '................', '................', '................'],
  ['................', '................', '................', '................', '................', '...hhh....hhh...', '...hHh....hHh...', '...hHh....hHh...', '..hHHh....hHHh..', '.hHHHh....hHHHh.', '.hdddh....hdddh.', '................', '................', '................', '................', '................'],
];
const DARK = (c) => '#' + hex(c).map((v) => Math.round(v * 0.62).toString(16).padStart(2, '0')).join('');
const LIGHT = (c) => '#' + hex(c).map((v) => Math.min(255, Math.round(v * 1.18 + 20)).toString(16).padStart(2, '0')).join('');

const SIMPLE = {
  [I.STICK]: [['................', '................', '...........ss...', '..........sS....', '.........sS.....', '........sS......', '.......sS.......', '......sS........', '.....sS.........', '....sS..........', '...sS...........', '..sS............', '................', '................', '................', '................'], { s: '#8b5a2b', S: '#5a381c' }],
  [I.COAL]: [['................', '................', '.....kkkk.......', '...kkKKkkkk.....', '..kkKkkkkkkk....', '..kkkkkkkKkk....', '..kkkkKkkkkkk...', '...kkkkkkkkkk...', '...kkkkkkKkk....', '....kkkkkkk.....', '......kkk.......', '................', '................', '................', '................', '................'], { k: '#262626', K: '#525252' }],
  [I.RAW_IRON]: [['................', '................', '......aaaa......', '....aaAAaaa.....', '...aaAaaaaaa....', '...aaaaaabaaa...', '..aabaaaaaaaa...', '..aaaaaaaAaab...', '...aaaaaaaaa....', '....abaaaaa.....', '......aaa.......', '................', '................', '................', '................', '................'], { a: '#c9a184', A: '#ead0bc', b: '#8a6650' }],
  [I.RAW_GOLD]: [['................', '................', '......aaaa......', '....aaAAaaa.....', '...aaAaaaaaa....', '...aaaaaabaaa...', '..aabaaaaaaaa...', '..aaaaaaaAaab...', '...aaaaaaaaa....', '....abaaaaa.....', '......aaa.......', '................', '................', '................', '................', '................'], { a: '#e6b422', A: '#fff1a8', b: '#a37b00' }],
  [I.IRON]: [['................', '................', '................', '................', '.....AAAAAAA....', '....AaaaaaaaA...', '...AaaaaaaaaaA..', '..AaaaaaaaaaaaA.', '..bbbbbbbbbbbbb.', '................', '................', '................', '................', '................', '................', '................'], { a: '#d4d4d8', A: '#f4f4f5', b: '#71717a' }],
  [I.GOLD]: [['................', '................', '................', '................', '.....AAAAAAA....', '....AaaaaaaaA...', '...AaaaaaaaaaA..', '..AaaaaaaaaaaaA.', '..bbbbbbbbbbbbb.', '................', '................', '................', '................', '................', '................', '................'], { a: '#facc15', A: '#fef08a', b: '#a16207' }],
  [I.CRYSTAL]: [['................', '.......A........', '......AaA.......', '.....AaaaA......', '....AaawaaA.....', '...AaawwaaaA....', '..AaaawaaaaaA...', '..baaaaaaaaab...', '...baaaaaaab....', '....baaaaab.....', '.....baaab......', '......bab.......', '.......b........', '................', '................', '................'], { a: '#e879f9', A: '#f5d0fe', b: '#a21caf', w: '#ffffff' }],
  [I.WOOL]: [['................', '................', '...wwwwwwwwww...', '..wWWwwwwwWWww..', '..wwwwWwwwwwww..', '..wwwwwwwwWwww..', '..wWwwwwwwwwww..', '..wwwwwWwwwwWw..', '..wwwwwwwwwwww..', '..wWwwwwwWwwww..', '..wwwwwwwwwwww..', '...gggggggggg...', '................', '................', '................', '................'], { w: '#f1f5f9', W: '#ffffff', g: '#cbd5e1' }],
  [I.MEAT]: [['................', '................', '.........ww.....', '....rrrrrwWw....', '...rRRrrrrww....', '..rRrrrrrrr.....', '..rrrrrrrrrr....', '..rrrrrrrrrr....', '...rrrrrrrr.....', '....rrrrrr......', '................', '................', '................', '................', '................', '................'], { r: '#e05a6a', R: '#f9a8b4', w: '#f1f5f9', W: '#ffffff' }],
  [I.COOKED]: [['................', '................', '.........ww.....', '....bbbbbwWw....', '...bBBbbbbww....', '..bBbbbbbbb.....', '..bbbbbbbbbb....', '..bbbbbbbbbb....', '...bbbbbbbb.....', '....bbbbbb......', '................', '................', '................', '................', '................', '................'], { b: '#9a4f1f', B: '#d18a4a', w: '#f1f5f9', W: '#ffffff' }],
  [I.GEL]: [['................', '................', '................', '......gggg......', '....ggGGgggg....', '...gGGggggggg...', '...gGggggggggg..', '..ggggggggggggg.', '..gggggggggggg..', '...ggggggggggg..', '....dddddddd....', '................', '................', '................', '................', '................'], { g: '#7c3aed', G: '#c4b5fd', d: '#4c1d95' }],
  [I.THORN]: [['................', '..............t.', '.............tT.', '............tT..', '...........tT...', '..........tT....', '.........tT.....', '........tT......', '.......tT.......', '......tT........', '.....tT.........', '...fffT.........', '...fff..........', '..fff...........', '................', '................'], { t: '#65a30d', T: '#d9f99d', f: '#3f6212' }],
  [I.SPORE]: [['................', '................', '.....s..s.......', '...s..ss...s....', '.....ssSs.......', '..s.sSSSss..s...', '....ssSsss......', '...s.ssss.s.....', '.....s..s....s..', '..s.....s.......', '................', '................', '................', '................', '................', '................'], { s: '#f87171', S: '#fecaca' }],
  [I.FLINT]: [['................', '................', '......kk........', '.....kKkk.......', '....kKkkkk......', '...kKkkkkkk.....', '...kkkkkkkkk....', '....kkkkkkkk....', '.....kkkkkk.....', '......kkk.......', '................', '................', '................', '................', '................', '................'], { k: '#3f3f46', K: '#a1a1aa' }],
};

/** 16×16 canvases for every item, plus a little 3D cube for every block. */
export function makeIcons(TEX) {
  const icons = {};
  for (const [id, [rows, pal]] of Object.entries(SIMPLE)) icons[id] = art(rows, pal);
  for (const [base, shape] of [[I.W_PICK, PICK], [I.W_AXE, AXE], [I.W_SHOVEL, SHOVEL], [I.W_SWORD, SWORD]]) {
    for (let t = 0; t < 4; t++) { const c = INFO[base + t].col; icons[base + t] = art(shape, { h: c, H: LIGHT(c), d: DARK(c), s: '#7c4a1e' }); }
  }
  for (const base of [I.I_HELM, I.C_HELM]) for (let k = 0; k < 4; k++) { const c = INFO[base + k].col; icons[base + k] = art(ARM[k], { h: DARK(c), H: c, d: DARK(DARK(c)) }); }
  // blocks: an isometric cube from the block's own textures (32×32 so it looks crisp)
  for (let id = 1; id < 64; id++) {
    if (!INFO[id]) continue;
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d'), img = g.createImageData(32, 32);
    const px = (x, y, col, k) => { if (x < 0 || y < 0 || x > 31 || y > 31) return; const o = (y * 32 + x) * 4; img.data[o] = col[0] * k; img.data[o + 1] = col[1] * k; img.data[o + 2] = col[2] * k; img.data[o + 3] = 255; };
    const tx = (f, u, v) => { const o = ((id * 3 + f) * 256 + (v & 15) * 16 + (u & 15)) * 3; return [TEX[o], TEX[o + 1], TEX[o + 2]]; };
    if (id === B.TORCH) { for (let y = 8; y < 28; y++) for (let x = 14; x < 18; x++) px(x, y, tx(1, x - 8, y < 13 ? 0 : 8), 1); icons[id] = c; g.putImageData(img, 0, 0); continue; }
    // top face (rhombus), left face, right face
    for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
      const x = 16 + (u - v) * 0.94, y = 2 + (u + v) * 0.47;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 1; dy++) px(Math.round(x + dx - 1), Math.round(y + dy), tx(0, u, v), 1);
    }
    for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
      const xl = 1 + u * 0.94, yl = 9.5 + u * 0.47 + v * 1.1;
      const xr = 16 + u * 0.94, yr = 17 - u * 0.47 + v * 1.1;
      for (let d = 0; d < 2; d++) { px(Math.round(xl), Math.round(yl + d * 0.6), tx(1, u, v), 0.78); px(Math.round(xr), Math.round(yr + d * 0.6), tx(1, u, v), 0.6); }
    }
    g.putImageData(img, 0, 0);
    icons[id] = c;
  }
  return icons;
}

// ── Creatures (front-facing sprites, 16×16; the king is 32×32) ──
const P_GLOOM = { b: '#5b21b6', B: '#7c3aed', d: '#2e1065', e: '#fde047', w: '#ffffff', m: '#1e0b3b' };
const GLOOM = ['................', '....bbbbbbbb....', '...bBBBBBBBBb...', '..bBBBBBBBBBBb..', '..bBBbbbbbbBBb..', '.bBBbbbbbbbbBBb.', '.bBbeewbbweebBb.', '.bBbeeebbeeebBb.', '.bBbbbbbbbbbbBb.', '.bBbbmmmmmmbbBb.', '.bBbbmwmmwmbbBb.', '.bbBbbbbbbbbBbb.', '..bbBBbbbbBBbb..', '..dbbbbddbbbbd..', '..dd..dd..dd.dd.', '................'];
const P_THORN = { g: '#3f6212', G: '#65a30d', L: '#a3e635', t: '#d9f99d', e: '#ef4444', k: '#1a2e05' };
const THORN = ['...t..t..t..t...', '..tG.tG.tG.tG...', '..GGGGGGGGGGGG..', '.GGLLLLLLLLLLGG.', '.GLLLggggggLLLG.', 'tGLgeeggggeegLGt', '.GLgekggggkegLG.', '.GLggggggggggLG.', 'tGLgggkkkkgggLGt', '.GLLgggggggggLG.', '.GGLLLLLLLLLLGG.', '..GGGGGGGGGGGG..', '...gg..gg..gg...', '..ggg.ggg..ggg..', '..kk..kk...kk...', '................'];
const P_BOOM = { r: '#dc2626', R: '#f87171', w: '#fef2f2', s: '#e7d8c9', S: '#cbb8a3', k: '#1f1f1f', d: '#991b1b' };
const BOOM = ['.....rrrrrr.....', '...rrRRwRRrrr...', '..rRwRRRRRwRRr..', '.rRRRRRwRRRRRRr.', '.rwRRRRRRRRRwRr.', 'rrrrrrrrrrrrrrrr', 'dddddddddddddddd', '....ssssssss....', '...sSkSssSkSs...', '...sskksskksS...', '...ssssssssss...', '...sSsskksssS...', '...ssssssssss...', '....ssssssss....', '....SS....SS....', '................'];
const P_FLUFF = { w: '#f8fafc', W: '#e2e8f0', g: '#cbd5e1', f: '#fcd9b6', F: '#e9b98d', k: '#1f1f1f', p: '#fda4af' };
const FLUFF = ['................', '...wWwwWwwWw....', '..wwwwwwwwwwWw..', '.wWwwffffffwwww.', '.wwwfkffffkfwWw.', '.wwwffffffffwww.', '.wWwfpffffpfwww.', '.wwwffFFFFffwWw.', '.wwwwffffffwwww.', '.wWwwwwwwwwwwww.', '.wwwwWwwwwWwwWw.', '..wwwwwwwwwwww..', '...gg......gg...', '...FF......FF...', '...FF......FF...', '................'];
const P_KING = { k: '#0f0a1e', K: '#2e1065', p: '#6d28d9', P: '#a78bfa', e: '#f0abfc', E: '#ffffff', g: '#fbbf24', G: '#fde68a', r: '#be123c' };
const KING = [
  '................................', '..........g..g..g..g............', '.........gGg.gGg.gGg.g..........', '.........gggggggggggggg.........', '.........gGrgggGgggrgGg.........', '........kkkkkkkkkkkkkkkk........', '.......kKKKKKKKKKKKKKKKKk.......', '......kKKpppppppppppppKKKk......', '.....kKKppKKKKKKKKKKKppKKk......', '.....kKpKKeeEKKKKKeeEKKpKk......', '.....kKpKKeeeKKKKKeeeKKpKk......', '.....kKpKKKKKKKKKKKKKKKpKk......', '.....kKKpKKKKkkkkKKKKKpKKk......', '......kKKpKKkEkkEkKKKpKKk.......', '.......kKKppKKKKKKKKppKKk.......', '....kkkkKKKKKKKKKKKKKKKKkkkk....', '...kKKKKkKKKKKPPKKKKKKkKKKKKk...', '..kKKpKKkKKKKPPPPKKKKKkKKpKKKk..', '..kKpKKkkKKKKKPPKKKKKKkkKKpKKk..', '..kKpKKk.kKKKKKKKKKKKKk.kKKpKk..', '..kKpKk..kKKKKKKKKKKKKk..kKpKk..', '..kpPpk..kKKKKKKKKKKKKk..kpPpk..', '..kPPPk..kKKKKKKKKKKKKk..kPPPk..', '...kkk...kKKKKKKKKKKKKk...kkk...', '.........kKKKKKkkKKKKKk.........', '.........kKKKKk..kKKKKk.........', '.........kKKKKk..kKKKKk.........', '.........kKKKk....kKKKk.........', '........kKKKKk....kKKKKk........', '........kkkkk......kkkkk........', '................................', '................................'];
const P_STAR = { y: '#fde047', Y: '#fef9c3', o: '#f59e0b', w: '#ffffff' };
const STAR = ['................', '.......y........', '.......y........', '......yYy.......', '......yYy.......', '.yyyyyYwYyyyyy..', '..yYYYwwwYYYy...', '...yYYYwYYYy....', '....yYYYYYy.....', '....yYYoYYy.....', '...yYYo.oYYy....', '...yYo...oYy....', '..yyo.....oyy...', '..o.........o...', '................', '................'];

/** Sprite pixel arrays: { w, h, px: Uint8Array of palette indices, pal: [[r,g,b]...] } — index 0 = clear */
function sprite(rows, palMap) {
  const keys = Object.keys(palMap), pal = [null, ...keys.map((k) => hex(palMap[k]))];
  const h = rows.length, w = rows[0].length, px = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const i = keys.indexOf(ch); px[y * w + x] = i < 0 ? 0 : i + 1; }));
  const glow = new Uint8Array(pal.length);
  keys.forEach((k, i) => { if ('eEwYy'.includes(k)) glow[i + 1] = 1; });
  return { w, h, px, pal, glow };
}
export const SPRITES = {
  gloom: sprite(GLOOM, P_GLOOM), thorn: sprite(THORN, P_THORN), boom: sprite(BOOM, P_BOOM),
  fluff: sprite(FLUFF, P_FLUFF), king: sprite(KING, P_KING), star: sprite(STAR, P_STAR),
};
const ORB = ['................', '................', '................', '................', '......pppp......', '.....pPPPPp.....', '....pPwwPPPp....', '....pPwPPPPp....', '....pPPPPPPp....', '....pPPPPPPp....', '.....pPPPPp.....', '......pppp......', '................', '................', '................', '................'];
const DART = ['................', '................', '................', '................', '................', '................', '.......tt.......', '......tTTt......', '......tTTt......', '.......tt.......', '................', '................', '................', '................', '................', '................'];
SPRITES.orb = sprite(ORB, { p: '#7c3aed', P: '#c084fc', w: '#ffffff' });
SPRITES.dart = sprite(DART, { t: '#3f6212', T: '#a3e635' });

// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — item icons and creature models, all pixel art drawn in code.
//  The art below is sketched at 16 × 16, then smoothed up to 32 × 32 with the
//  Scale2x pixel-art filter and given a crisp outline, so everything has the
//  same 32-pixel detail as the block textures (see blocktex.js).
// ─────────────────────────────────────────────────────────────
import { B, I, INFO } from './items.js';
import { makeTextures, TS, hex } from './blocktex.js';
export { makeTextures, TS };

const DARK = (c) => '#' + hex(c).map((v) => Math.round(v * 0.62).toString(16).padStart(2, '0')).join('');
const LIGHT = (c) => '#' + hex(c).map((v) => Math.min(255, Math.round(v * 1.18 + 20)).toString(16).padStart(2, '0')).join('');

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

const ORB = ['................', '................', '................', '................', '......pppp......', '.....pPPPPp.....', '....pPwwPPPp....', '....pPwPPPPp....', '....pPPPPPPp....', '....pPPPPPPp....', '.....pPPPPp.....', '......pppp......', '................', '................', '................', '................'];
const DART = ['................', '................', '................', '................', '................', '................', '.......tt.......', '......tTTt......', '......tTTt......', '.......tt.......', '................', '................', '................', '................', '................', '................'];

// ── new items ───────────────────────────────────────────────
SIMPLE[I.APPLE] = [['................', '.......l........', '......sll.......', '......s.........', '...rrrsrrr......', '..rRRrrrrrr.....', '.rRRrrrrrrrr....', '.rRrrrrrrrrr....', '.rrrrrrrrrrr....', '.rrrrrrrrrrd....', '..rrrrrrrrdd....', '...rrdrrddd.....', '................', '................', '................', '................'], { r: '#dc2626', R: '#fca5a5', d: '#991b1b', s: '#5a381c', l: '#4ade80' }];
SIMPLE[I.BERRIES] = [['................', '.......l........', '......ll........', '....rr..rr......', '...rRrrrRrr.....', '...rrdrrrdr.....', '....dd.rrdd.....', '....rRrrRr......', '....rrdrrd......', '.....dd.d.......', '................', '................', '................', '................', '................', '................'], { r: '#dc2626', R: '#fecaca', d: '#7f1d1d', l: '#4ade80' }];
SIMPLE[I.MUSH_COOKED] = [['................', '.....cccccc.....', '...ccCCccccc....', '..cCcccccccccc..', '..cccccccccccc..', '...dddddddddd...', '......ssss......', '......sSss......', '......ssss......', '......ssss......', '......kkkk......', '......kkkk......', '................', '................', '................', '................'], { c: '#b45309', C: '#fbbf24', d: '#78350f', s: '#e7d8c9', S: '#ffffff', k: '#7c4a1e' }];
SIMPLE[I.SILK] = [['................', '.....wwwww......', '...ww.....ww....', '..w..wwwww..w...', '..w.w.....w.w...', '..w.w.www.w.w...', '..w.w.w.w.w.w...', '..w.w.w...w.w...', '..w.w..www..w...', '..w..w.....w....', '...ww.wwwww.....', '.....w..........', '......ww........', '................', '................', '................'], { w: '#f1f5f9' }];
SIMPLE[I.BOW] = [['.....bb.........', '.....bBb........', '......bBb.......', '......w.bb......', '......w..bb.....', '......w...b.....', '......w...bB....', '......w...bB....', '......w...bB....', '......w...b.....', '......w..bb.....', '......w.bb......', '......bBb.......', '.....bBb........', '.....bb.........', '................'], { b: '#7c4a1e', B: '#c08a4e', w: '#e5e7eb' }];
SIMPLE[I.ARROW] = [['................', '...........hhh..', '...........hHh..', '..........shh...', '.........s......', '........s.......', '.......s........', '......s.........', '.....s..........', '..f.s...........', '..ffs...........', '...ff...........', '................', '................', '................', '................'], { h: '#9ca3af', H: '#e5e7eb', s: '#8b5a2b', f: '#f8fafc' }];

const P_CRAWL = { k: '#27272a', d: '#3f3f46', D: '#5b5b66', r: '#ef4444', R: '#fecaca' };
const CRAWL = ['................', '................', '..k..........k..', '...k...dd...k...', '....k.dDDd.k....', '.kk..dDDDDd..kk.', '...kkdrDDrdkk...', '.....dRDDRd.....', '..kkkdDDDDdkkk..', '.k...ddDDdd...k.', 'k...k.dddd.k...k', '...k........k...', '..k..........k..', '................', '................', '................'];
const P_GRAVE = { g: '#57534e', G: '#a8a29e', s: '#78716c', d: '#3f6212', m: '#65a30d', w: '#e7e5e4' };
const GRAVE = ['................', '.....gggggg.....', '....gGGGGGGg....', '...gGGGwwGGGg...', '...gGGGwwGGGg...', '...gGwwwwwwGg...', '...gGGGwwGGGg...', '...gGGGwwGGGg...', '...gGGGGGGGGg...', '...gGsGGGsGGg...', '...gGGsGsGGGg...', '...gGGGGGGGGg...', '..dddddddddddd..', '.dmmmmmmmmmmmmd.', '.dddddddddddddd.', '................'];
const ARROWP = ['................', '................', '................', '................', '................', '................', '.f............h.', '.ff..........hH.', '.sssssssssssshhh', '.ff..........hH.', '.f............h.', '................', '................', '................', '................', '................'];

// ── pixel grids, Scale2x and outlines ───────────────────────
/** rows of characters + palette → { w, h, px (palette index, 0 = clear), pal, keys } */
function grid(rows, palMap) {
  const keys = Object.keys(palMap), pal = [null, ...keys.map((k) => hex(palMap[k]))];
  const h = rows.length, w = rows[0].length, px = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const i = keys.indexOf(ch); px[y * w + x] = i < 0 ? 0 : i + 1; }));
  return { w, h, px, pal, keys };
}
/** Scale2x (EPX): doubles the size and rounds off the jaggies — classic pixel-art upscaling */
function scale2x(g) {
  const { w, h, px } = g, W2 = w * 2, out = new Uint8Array(W2 * h * 2);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), Bn = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== Bn) e0 = A;
    if (A === Bn && A !== C && Bn !== D) e1 = Bn;
    if (D === C && D !== Bn && C !== A) e2 = C;
    if (Bn === D && Bn !== A && D !== C) e3 = D;
    out[(y * 2) * W2 + x * 2] = e0; out[(y * 2) * W2 + x * 2 + 1] = e1;
    out[(y * 2 + 1) * W2 + x * 2] = e2; out[(y * 2 + 1) * W2 + x * 2 + 1] = e3;
  }
  return { ...g, w: W2, h: h * 2, px: out };
}
/** grid → canvas, with soft top-left lighting and a dark outline */
function toCanvas(g, { outline = true } = {}) {
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
  const x2 = c.getContext('2d'), img = x2.createImageData(g.w, g.h), d = img.data;
  const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : g.px[y * g.w + x]);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const p = at(x, y), o = (y * g.w + x) * 4;
    if (p) {
      let [rr, gg, bb] = g.pal[p];
      // edge light: brighter where the pixel above-left is empty, darker below-right
      if (!at(x - 1, y - 1)) { rr *= 1.12; gg *= 1.12; bb *= 1.12; }
      if (!at(x + 1, y + 1)) { rr *= 0.82; gg *= 0.82; bb *= 0.82; }
      d[o] = Math.min(255, rr); d[o + 1] = Math.min(255, gg); d[o + 2] = Math.min(255, bb); d[o + 3] = 255;
    } else if (outline && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) {
      d[o] = 16; d[o + 1] = 12; d[o + 2] = 20; d[o + 3] = 200;
    }
  }
  x2.putImageData(img, 0, 0);
  return c;
}
const art = (rows, pal) => toCanvas(scale2x(grid(rows, pal)));

/** 32 × 32 canvases for every item, and a 64 × 64 little 3D cube for every block. */
export function makeIcons(TEX) {
  const icons = {};
  for (const [id, [rows, pal]] of Object.entries(SIMPLE)) icons[id] = art(rows, pal);
  for (const [base, shape] of [[I.W_PICK, PICK], [I.W_AXE, AXE], [I.W_SHOVEL, SHOVEL], [I.W_SWORD, SWORD]]) {
    for (let t = 0; t < 4; t++) { const c = INFO[base + t].col; icons[base + t] = art(shape, { h: c, H: LIGHT(c), d: DARK(c), s: '#7c4a1e' }); }
  }
  for (const base of [I.I_HELM, I.C_HELM]) for (let k = 0; k < 4; k++) { const c = INFO[base + k].col; icons[base + k] = art(ARM[k], { h: DARK(c), H: c, d: DARK(DARK(c)) }); }
  const TT = TS * TS;
  const tex = (id, f, u, v) => { const o = ((id * 3 + f) * TT + (v & 31) * TS + (u & 31)) * 4; return [TEX[o], TEX[o + 1], TEX[o + 2], TEX[o + 3]]; };
  // block icons: each output pixel is mapped back onto the top / left / right face
  const S = 64, T0 = [32, 2], R0 = [62, 17], B0 = [32, 32], L0 = [2, 17], HGT = 30;
  const solve = (p, o, a, b) => { const det = a[0] * b[1] - a[1] * b[0]; const px = p[0] - o[0], py = p[1] - o[1]; return [(px * b[1] - py * b[0]) / det, (a[0] * py - a[1] * px) / det]; };
  for (let id = 1; id < 64; id++) {
    if (!INFO[id]) continue;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    if (INFO[id].plant || id === B.TORCH) {
      const img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const t = tex(id, 1, x >> 1, y >> 1), o = (y * S + x) * 4; img.data.set(t, o); }
      g.putImageData(img, 0, 0); icons[id] = c; continue;
    }
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = [x + 0.5, y + 0.5];
      let t = null, k = 1;
      let [a, b] = solve(p, T0, [R0[0] - T0[0], R0[1] - T0[1]], [L0[0] - T0[0], L0[1] - T0[1]]);
      if (a >= 0 && a < 1 && b >= 0 && b < 1) t = tex(id, 0, Math.floor(a * TS), Math.floor(b * TS));
      else {
        [a, b] = solve(p, L0, [B0[0] - L0[0], B0[1] - L0[1]], [0, HGT]);
        if (a >= 0 && a < 1 && b >= 0 && b < 1) { t = tex(id, 1, Math.floor(a * TS), Math.floor(b * TS)); k = 0.8; }
        else {
          [a, b] = solve(p, B0, [R0[0] - B0[0], R0[1] - B0[1]], [0, HGT]);
          if (a >= 0 && a < 1 && b >= 0 && b < 1) { t = tex(id, 1, Math.floor(a * TS), Math.floor(b * TS)); k = 0.62; }
        }
      }
      if (!t || !t[3]) continue;
      const o = (y * S + x) * 4; d[o] = t[0] * k; d[o + 1] = t[1] * k; d[o + 2] = t[2] * k; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    icons[id] = c;
  }
  return icons;
}

// ── creature models ─────────────────────────────────────────
/** { w, h, px, pal, glow } at double resolution; glow colours ignore darkness */
function sprite(rows, palMap, glowKeys = 'eEwYy') {
  const g = scale2x(grid(rows, palMap));
  const glow = new Uint8Array(g.pal.length);
  g.keys.forEach((k, i) => { if (glowKeys.includes(k)) glow[i + 1] = 1; });
  return { w: g.w, h: g.h, px: g.px, pal: g.pal, glow };
}
export const SPRITES = {
  gloom: sprite(GLOOM, P_GLOOM), thorn: sprite(THORN, P_THORN, 'et'), boom: sprite(BOOM, P_BOOM, 'w'),
  fluff: sprite(FLUFF, P_FLUFF, ''), king: sprite(KING, P_KING), star: sprite(STAR, P_STAR, 'yYow'),
  orb: sprite(ORB, { p: '#7c3aed', P: '#c084fc', w: '#ffffff' }, 'pPw'), dart: sprite(DART, { t: '#3f6212', T: '#a3e635' }, 'T'),
  crawler: sprite(CRAWL, P_CRAWL, 'rR'), grave: sprite(GRAVE, P_GRAVE, ''), arrow: sprite(ARROWP, { f: '#f8fafc', s: '#8b5a2b', h: '#9ca3af', H: '#e5e7eb' }, ''),
};

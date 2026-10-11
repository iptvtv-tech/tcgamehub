// ─────────────────────────────────────────────────────────────
//  CRYPT OF CROWNS 3D — the HD art. Every texture and sprite is painted in
//  code onto 64×64 canvases. Glowing parts (flames, eyes, jewels, the exit)
//  go on a separate "glow" layer that the engine draws at full brightness,
//  so they shine even in the dark.
// ─────────────────────────────────────────────────────────────
import { makeTextures, makeSprites } from '../../assets/js/raycast.js';
import { texData } from '../../assets/js/raycast-hd.js';

const N = 64;
const cnv = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const paint = (fn, seed = 1) => { const c = cnv(), g = c.getContext('2d'); fn(g, rng(seed * 7919)); return c; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
function grain(g, r, n, cols, w = 1) { for (let i = 0; i < n; i++) { g.fillStyle = pick(r, cols); g.fillRect(Math.floor(r() * N), Math.floor(r() * N), w + Math.floor(r() * 2), 1); } }

/** Bevelled stone blocks: light top-left edge, dark bottom-right edge, speckled faces, the odd crack. */
function blocks(g, r, { base, mortar, rows = 4, hi = 'rgba(255,255,255,.13)', lo = 'rgba(0,0,0,.45)', cracks = 3, moss = 0 }) {
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
      draw(x); if (x + w > N) draw(x - N);                     // wrap so the texture tiles
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
  for (let i = 0; i < moss; i++) { g.fillStyle = pick(r, ['#2f4a1a', '#3a5a1e', '#25401a']); g.fillRect(Math.floor(r() * N), Math.floor(r() * N), 2 + r() * 4, 1 + r() * 3); }
}
// no random cracks on crypt walls: a crack must only ever mean a secret passage
const CRYPT = { base: ['#4a4c57', '#3e404a', '#53555f', '#45474f', '#3a3c45'], mortar: '#121219', moss: 14, cracks: 0 };

function skull(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const gr = g.createRadialGradient(-1.5, -2, 0.5, 0, 0, 6.5); gr.addColorStop(0, '#f5f0e1'); gr.addColorStop(1, '#a8a08a');
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, -1, 5.2, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(-3, 2, 6, 3.5);
  g.fillStyle = '#16120c'; g.beginPath(); g.ellipse(-2, -0.6, 1.5, 1.7, 0, 0, Math.PI * 2); g.ellipse(2, -0.6, 1.5, 1.7, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(0, 1.2); g.lineTo(-0.8, 2.6); g.lineTo(0.8, 2.6); g.fill();
  for (let i = -2; i <= 2; i += 1.3) g.fillRect(i - 0.3, 4, 0.6, 1.5);
  g.restore();
}

/** All the wall / floor / ceiling textures: {id: {data, glow?}} plus floor & ceiling sets per crypt style. */
export function makeCryptTextures() {
  const base = makeTextures(), T = {};
  for (const id of Object.keys(base)) T[id] = { data: texData(base[id]) };
  const crypt = (g, r) => blocks(g, r, CRYPT);
  T[10] = { data: texData(paint(crypt, 10)) };
  // the cracked (secret) wall: the same stones, plus the same faint crack as before
  T[11] = { data: texData(paint((g, r) => {
    crypt(g, r);
    const crack = [[29, 10], [33, 22], [29, 31], [35, 42], [31, 54]];
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 3; g.beginPath(); crack.forEach(([x, y], i) => (i ? g.lineTo(x + 1, y) : g.moveTo(x + 1, y))); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1.6; g.beginPath(); crack.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.beginPath(); g.moveTo(33, 22); g.lineTo(40, 26); g.moveTo(29, 31); g.lineTo(23, 35); g.stroke();
  }, 10)) };
  // bone wall: skulls and bones packed into the mortar
  T[13] = { data: texData(paint((g, r) => {
    blocks(g, r, { base: ['#3a362f', '#332f29', '#403b33'], mortar: '#0d0b08', rows: 4, cracks: 1 });
    for (let i = 0; i < 8; i++) {
      const x = 6 + r() * 52, y = 6 + r() * 52, a = r() * Math.PI;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#cfc6ad'; g.fillRect(-9, -1.2, 18, 2.4);
      g.beginPath(); g.arc(-9, -1.4, 1.8, 0, 7); g.arc(-9, 1.4, 1.8, 0, 7); g.arc(9, -1.4, 1.8, 0, 7); g.arc(9, 1.4, 1.8, 0, 7); g.fill(); g.restore();
    }
    for (const [x, y] of [[12, 12], [40, 9], [26, 30], [52, 34], [10, 48], [38, 53]]) skull(g, x, y, 0.95 + r() * 0.2);
  }, 13)) };
  // vault walls: warm sandstone; treasure-room walls: red brick
  T[2] = { data: texData(paint((g, r) => blocks(g, r, { base: ['#8a6a3e', '#7c5d34', '#957447', '#81643a'], mortar: '#2a1c0c', cracks: 2, hi: 'rgba(255,240,200,.2)' }), 2)) };
  T[1] = { data: texData(paint((g, r) => blocks(g, r, { base: ['#7c2d12', '#8f3a17', '#6e2810', '#9a3412'], mortar: '#1c0f08', rows: 8, cracks: 1 }), 1)) };

  // wall sconces: three flame frames, on crypt stone (ids 30-32), treasure brick (33-35) and vault sandstone (36-38)
  const wallArt = [[crypt, 10], [(g, r) => blocks(g, r, { base: ['#7c2d12', '#8f3a17', '#6e2810', '#9a3412'], mortar: '#1c0f08', rows: 8, cracks: 1 }), 1],
    [(g, r) => blocks(g, r, { base: ['#8a6a3e', '#7c5d34', '#957447', '#81643a'], mortar: '#2a1c0c', cracks: 2, hi: 'rgba(255,240,200,.2)' }), 2]];
  wallArt.forEach(([art, seed], w) => {
    for (let f = 0; f < 3; f++) {
      const wall = paint(art, seed);
      const g = wall.getContext('2d');
      g.fillStyle = '#1b1b1f'; g.fillRect(28, 40, 8, 10); g.fillRect(26, 34, 12, 6);       // iron bracket
      g.fillStyle = '#3a3a42'; g.fillRect(26, 34, 12, 2);
      g.fillStyle = '#4a2a12'; g.fillRect(29.5, 26, 5, 9);                                  // torch stick
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(36, 36, 2, 14);
      const glow = cnv(), q = glow.getContext('2d');
      const sway = [0, 1.5, -1.2][f], tall = [16, 19, 14][f];
      q.fillStyle = '#ff7a1a'; q.beginPath(); q.moveTo(26, 27); q.quadraticCurveTo(28 + sway, 27 - tall * 0.6, 32 + sway, 27 - tall); q.quadraticCurveTo(36 + sway, 27 - tall * 0.6, 38, 27); q.closePath(); q.fill();
      q.fillStyle = '#ffd25a'; q.beginPath(); q.moveTo(29, 27); q.quadraticCurveTo(30 + sway, 27 - tall * 0.45, 32 + sway * 0.8, 27 - tall * 0.75); q.quadraticCurveTo(34 + sway, 27 - tall * 0.45, 35, 27); q.closePath(); q.fill();
      q.fillStyle = '#fff6d0'; q.beginPath(); q.ellipse(32 + sway * 0.4, 24, 1.8, 3, 0, 0, 7); q.fill();
      T[30 + w * 3 + f] = { data: texData(wall), glow: texData(glow) };
    }
  });

  // floors and ceilings
  const flag = (cols, mortar, seed, extra) => paint((g, r) => {
    g.fillStyle = mortar; g.fillRect(0, 0, N, N);
    for (const [x, y, w, h] of [[0, 0, 32, 32], [32, 0, 32, 20], [32, 20, 32, 12], [0, 32, 20, 32], [20, 32, 44, 32]]) {
      g.fillStyle = pick(r, cols); g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 1, y + 1, w - 2, 1);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + h - 2, w - 2, 1);
    }
    grain(g, r, 220, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.05)', 'rgba(0,0,0,.15)']);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.moveTo(8, 6); g.lineTo(14, 13); g.lineTo(12, 22); g.moveTo(44, 40); g.lineTo(50, 47); g.stroke();
    extra?.(g, r);
  }, seed);
  const beams = (stone, wood, seed) => paint((g, r) => {
    blocks(g, r, { base: stone, mortar: '#08080b', rows: 4, cracks: 1 });
    const gr = g.createLinearGradient(0, 26, 0, 38); gr.addColorStop(0, wood[0]); gr.addColorStop(0.5, wood[1]); gr.addColorStop(1, wood[2]);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 38, N, 3);                       // the beam's shadow
    g.fillStyle = gr; g.fillRect(0, 26, N, 12);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(Math.floor(r() * N), 27 + Math.floor(r() * 10), 4 + Math.floor(r() * 8), 1); }
    g.fillStyle = '#111'; for (const x of [10, 42]) { g.fillRect(x, 27, 2, 2); g.fillRect(x, 35, 2, 2); }
  }, seed);
  const floors = {
    crypt: { floor: flag(['#34302b', '#2d2a26', '#3a3530', '#302c28'], '#0e0c0a', 41), ceil: beams(['#26272d', '#2b2c33', '#222329'], ['#2e1c0e', '#3d2613', '#21140a'], 42) },
    gold: { floor: paint((g) => {                                     // the Crown Vault: gold and black marble
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const gold = (x + y) % 2 === 0, gr = g.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
        gr.addColorStop(0, gold ? '#e8b64c' : '#1d1610'); gr.addColorStop(1, gold ? '#a8741e' : '#2c2116'); g.fillStyle = gr; g.fillRect(x * 32, y * 32, 32, 32);
        g.fillStyle = gold ? 'rgba(255,248,220,.35)' : 'rgba(255,220,150,.08)'; g.fillRect(x * 32, y * 32, 32, 1); g.fillRect(x * 32, y * 32, 1, 32);
      }
      g.strokeStyle = 'rgba(255,240,200,.18)'; g.beginPath(); g.moveTo(36, 40); g.bezierCurveTo(44, 46, 50, 38, 60, 50); g.moveTo(4, 6); g.bezierCurveTo(14, 12, 18, 6, 28, 20); g.stroke();
    }, 43), ceil: beams(['#4a2a16', '#55311a', '#3f2412'], ['#4a3010', '#6e4c16', '#3a2608'], 44) },
    treasure: { floor: flag(['#5a3a22', '#4e321e', '#664428'], '#1a0f08', 45), ceil: beams(['#3a2418', '#33201a', '#2e1d14'], ['#3b2412', '#4e3018', '#2a190c'], 46) },
  };
  for (const k of Object.keys(floors)) floors[k] = { floor: { data: texData(floors[k].floor) }, ceil: { data: texData(floors[k].ceil) } };
  return { tex: T, floors };
}

/** Sprites: {name: {data, glow?}} — plus the crown's canvas for the finale. */
export function makeCryptSprites() {
  const old = makeSprites(), S = {};
  const sp = (fn, glowFn, seed = 3) => { const c = paint(fn, seed); const out = { data: texData(c), canvas: c }; if (glowFn) { const gc = paint(glowFn, seed); out.glow = texData(gc); out.glowCanvas = gc; } return out; };
  const bone = (g, x1, y1, x2, y2, w = 3) => { g.lineCap = 'round'; g.strokeStyle = '#3a342a'; g.lineWidth = w + 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = '#e9e2cf'; g.lineWidth = w; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x1 - 0.5, y1 - 0.5); g.lineTo(x2 - 0.5, y2 - 0.5); g.stroke(); };
  // skeleton: two walking frames, rusty sword, glowing eyes
  const skel = (step) => sp((g) => {
    const lx = step ? 3 : -3;
    bone(g, 32, 42, 26 - lx, 62); bone(g, 32, 42, 38 + lx, 62);                // legs
    g.fillStyle = '#d8d0b9'; g.beginPath(); g.ellipse(32, 42, 7, 3, 0, 0, 7); g.fill();   // pelvis
    bone(g, 32, 21, 32, 42, 3);                                                 // spine
    for (let y = 24; y <= 36; y += 4) { bone(g, 32, y, 23, y + 3, 2); bone(g, 32, y, 41, y + 3, 2); }
    bone(g, 32, 23, 19, 34 + (step ? 1 : -1)); bone(g, 19, 34 + (step ? 1 : -1), 16, 44);   // left arm
    bone(g, 32, 23, 45, 31); bone(g, 45, 31, 50, 22);                          // sword arm
    g.strokeStyle = '#6b4b2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(48, 26); g.lineTo(53, 18); g.stroke();
    g.strokeStyle = '#8a8f98'; g.lineWidth = 3; g.beginPath(); g.moveTo(51, 21); g.lineTo(60, 2); g.stroke();
    g.strokeStyle = '#7c4a22'; g.lineWidth = 1; g.beginPath(); g.moveTo(55, 12); g.lineTo(57, 8); g.stroke();
    g.fillStyle = '#5b4632'; g.fillRect(45, 23, 9, 2);
    skull(g, 32, 13, 1.45);
  }, (g) => {
    g.fillStyle = 'rgba(255,60,40,.95)'; g.beginPath(); g.arc(29.2, 12, 1.4, 0, 7); g.arc(34.8, 12, 1.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,90,50,.35)'; g.beginPath(); g.arc(29.2, 12, 2.6, 0, 7); g.arc(34.8, 12, 2.6, 0, 7); g.fill();
  }, 5 + step);
  S.skeleton = [skel(0), skel(1)];
  // gold coin (spins by squashing its width)
  S.coin = sp((g) => {
    const gr = g.createRadialGradient(28, 44, 1, 32, 48, 11); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#f5b82e'); gr.addColorStop(1, '#a8650c');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 48, 10, 0, 7); g.fill();
    g.strokeStyle = '#8a540a'; g.lineWidth = 1.5; g.beginPath(); g.arc(32, 48, 7, 0, 7); g.stroke();
    g.fillStyle = '#8a540a'; g.font = '900 9px system-ui'; g.textAlign = 'center'; g.fillText('C', 32, 51);
  }, (g) => { g.fillStyle = 'rgba(255,255,230,.9)'; g.fillRect(27, 42, 2, 2); });
  // treasure chest
  S.chest = sp((g, r) => {
    const wood = (y, h, c1, c2) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; };
    wood(36, 26, '#7a4319', '#4a2509'); g.fillRect(9, 36, 46, 25);
    wood(22, 16, '#8d521f', '#5a2f0e'); g.beginPath(); g.moveTo(9, 37); g.quadraticCurveTo(32, 16, 55, 37); g.fill();
    g.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 42; y < 60; y += 6) g.fillRect(10, y, 44, 1);
    g.fillStyle = '#c99a2e'; g.fillRect(9, 35, 46, 3); g.fillRect(14, 24, 3, 37); g.fillRect(47, 24, 3, 37);
    g.fillStyle = '#f2c94c'; g.fillRect(28, 33, 8, 10); g.fillStyle = '#3a2408'; g.beginPath(); g.arc(32, 37, 1.6, 0, 7); g.fill(); g.fillRect(31.3, 37, 1.4, 4);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(9, 60, 46, 2);
  }, (g) => { g.fillStyle = 'rgba(255,235,150,.85)'; g.fillRect(9, 35, 10, 1); g.fillRect(29, 33, 2, 1); g.fillStyle = 'rgba(255,214,90,.5)'; g.beginPath(); g.moveTo(14, 32); g.quadraticCurveTo(32, 26, 50, 32); g.lineTo(50, 33); g.quadraticCurveTo(32, 28, 14, 33); g.fill(); });
  // keys
  const key = (c1, c2, c3) => sp((g) => {
    const gr = g.createLinearGradient(24, 12, 42, 56); gr.addColorStop(0, c1); gr.addColorStop(0.5, c2); gr.addColorStop(1, c3);
    g.strokeStyle = gr; g.fillStyle = gr; g.lineWidth = 5; g.beginPath(); g.arc(32, 22, 9, 0, 7); g.stroke();
    g.fillRect(29, 30, 6, 26); g.fillRect(35, 44, 9, 4); g.fillRect(35, 51, 7, 4);
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(30, 31, 1.5, 22);
  }, (g) => { g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.moveTo(25, 14); g.lineTo(26, 17); g.lineTo(29, 18); g.lineTo(26, 19); g.lineTo(25, 22); g.lineTo(24, 19); g.lineTo(21, 18); g.lineTo(24, 17); g.fill(); });
  S.key = key('#fff1a8', '#f2b52e', '#9c6510');
  S.bluekey = key('#dbeafe', '#60a5fa', '#1e40af');
  // the crown of the Crypt Kings
  S.crown = sp((g) => {
    const gr = g.createLinearGradient(0, 16, 0, 54); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.45, '#f5b82e'); gr.addColorStop(1, '#8a540a');
    g.fillStyle = gr; g.beginPath(); g.moveTo(11, 46); g.lineTo(13, 21); g.lineTo(23, 33); g.lineTo(32, 13); g.lineTo(41, 33); g.lineTo(51, 21); g.lineTo(53, 46); g.closePath(); g.fill();
    g.fillRect(11, 44, 42, 9);
    g.strokeStyle = '#7a4a08'; g.lineWidth = 1; g.strokeRect(11.5, 44.5, 41, 8);
    g.fillStyle = '#fff6d0'; for (const [x, y] of [[13, 21], [32, 13], [51, 21]]) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
    g.fillStyle = '#5a3a06'; g.font = '700 5px system-ui'; g.textAlign = 'center'; g.fillText('TC LEGENDS', 32, 51);
  }, (g) => {
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(32, 38, 3.4, 0, 7); g.fill();
    g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(21, 39, 2.6, 0, 7); g.arc(43, 39, 2.6, 0, 7); g.fill();
    g.fillStyle = '#a3e635'; g.beginPath(); g.arc(13, 21, 1.4, 0, 7); g.arc(51, 21, 1.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(31, 36, 1.5, 1.5); g.fillRect(20, 38, 1, 1); g.fillRect(42, 38, 1, 1);
  });
  // the exit: stone steps going down into a golden glow
  S.stairs = sp((g) => {
    g.fillStyle = '#1a1612'; g.fillRect(6, 30, 52, 34);
    for (let i = 0; i < 5; i++) { const y = 34 + i * 6, inset = i * 4; g.fillStyle = ['#6b6259', '#5c544b', '#4d463e', '#3e3832', '#2f2a25'][i]; g.fillRect(6 + inset, y, 52 - inset * 2, 4); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(6 + inset, y, 52 - inset * 2, 1); }
    g.fillStyle = '#4a443d'; g.fillRect(4, 28, 4, 36); g.fillRect(56, 28, 4, 36);
  }, (g) => {
    const gr = g.createRadialGradient(32, 62, 2, 32, 58, 22); gr.addColorStop(0, 'rgba(255,230,140,.95)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.fillRect(14, 44, 36, 20);
    g.fillStyle = 'rgba(253,224,71,.9)'; g.beginPath(); g.moveTo(32, 10); g.lineTo(41, 22); g.lineTo(35, 22); g.lineTo(35, 27); g.lineTo(29, 27); g.lineTo(29, 22); g.lineTo(23, 22); g.fill();
  });
  // spike trap (up / down)
  const plate = (g) => { const gr = g.createLinearGradient(0, 56, 0, 64); gr.addColorStop(0, '#4a4642'); gr.addColorStop(1, '#1c1a18'); g.fillStyle = gr; g.fillRect(2, 57, 60, 7); g.fillStyle = '#0c0a09'; for (let x = 8; x < 60; x += 8) g.fillRect(x - 1, 59, 3, 2); };
  S.spikes = sp((g) => {
    plate(g);
    for (let x = 4; x < 60; x += 8) {
      const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, '#6b7280'); gr.addColorStop(0.45, '#e5e7eb'); gr.addColorStop(1, '#4b5563');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, 60); g.lineTo(x + 4, 28); g.lineTo(x + 8, 60); g.fill();
    }
  }, (g) => { g.fillStyle = 'rgba(220,38,38,.85)'; for (let x = 4; x < 60; x += 8) { g.beginPath(); g.moveTo(x + 2.8, 37); g.lineTo(x + 4, 28); g.lineTo(x + 5.2, 37); g.fill(); } });
  S.spikesdown = sp((g) => { plate(g); g.fillStyle = '#9ca3af'; for (let x = 8; x < 60; x += 8) g.fillRect(x - 1, 57, 2, 2); });
  // brazier (the vault's 't' blocks): iron bowl on a stand, flames in three frames
  S.brazier = [0, 1, 2].map((f) => sp((g) => {
    g.fillStyle = '#26262b'; g.fillRect(30, 40, 4, 22); g.fillRect(22, 60, 20, 3);
    const gr = g.createLinearGradient(0, 34, 0, 44); gr.addColorStop(0, '#5b5b66'); gr.addColorStop(1, '#1d1d22');
    g.fillStyle = gr; g.beginPath(); g.moveTo(16, 34); g.lineTo(48, 34); g.lineTo(42, 44); g.lineTo(22, 44); g.closePath(); g.fill();
  }, (g) => {
    const sway = [0, 2, -2][f], tall = [24, 28, 21][f];
    g.fillStyle = '#ff6a10'; g.beginPath(); g.moveTo(17, 34); g.quadraticCurveTo(22 + sway, 34 - tall * 0.7, 32 + sway, 34 - tall); g.quadraticCurveTo(42 + sway, 34 - tall * 0.7, 47, 34); g.fill();
    g.fillStyle = '#ffc93c'; g.beginPath(); g.moveTo(22, 34); g.quadraticCurveTo(26 + sway, 34 - tall * 0.5, 32 + sway, 34 - tall * 0.78); g.quadraticCurveTo(38 + sway, 34 - tall * 0.5, 42, 34); g.fill();
    g.fillStyle = '#fff7d6'; g.beginPath(); g.ellipse(32 + sway * 0.4, 30, 3, 5, 0, 0, 7); g.fill();
  }, 9 + f));
  // the finale's big crown: the picture with its glowing jewels on top
  S.crownCanvas = cnv(); { const g = S.crownCanvas.getContext('2d'); g.drawImage(S.crown.canvas, 0, 0); g.drawImage(S.crown.glowCanvas, 0, 0); }
  S.old = old;
  return S;
}

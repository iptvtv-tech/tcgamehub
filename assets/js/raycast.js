// ─────────────────────────────────────────────────────────────
//  Tiny first-person 3D engine ("raycaster"), shared by Dungeon Escape 3D and
//  Crypt of Crowns. Everything is drawn in code: wall textures and sprites are
//  painted once onto small off-screen canvases, then sliced into columns.
//
//  Map cells: 0 = open floor; any other number = a wall texture id (see makeTextures).
// ─────────────────────────────────────────────────────────────
export const TEX = 64;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function speckle(g, r, n, cols) { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(Math.floor(r() * TEX), Math.floor(r() * TEX), 1 + Math.floor(r() * 2), 1); } }

/** Wall textures. ids: 1 brick · 2 stone · 3 mossy stone · 4 wooden door · 5 golden exit · 6 iron gate · 7 lever (up) · 8 lever (down) · 9 locked door · 10 crypt stone · 11 crypt stone with a faint crack (secret wall) · 12 blue door · 13 bone wall */
export function makeTextures() {
  const T = {};
  const mk = (id, fn, seed = id) => { const c = canvas(TEX, TEX), g = c.getContext('2d'), r = rng(seed * 977); fn(g, r); T[id] = c; };
  const bricks = (g, r, base, mortar, dark) => {
    g.fillStyle = mortar; g.fillRect(0, 0, TEX, TEX);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
      const x = col * 16 + (row % 2) * 8 + 1, y = row * 8 + 1;
      g.fillStyle = base[Math.floor(r() * base.length)]; g.fillRect(x, y, 14, 6);
      g.fillStyle = dark; g.fillRect(x, y + 5, 14, 1);
    }
  };
  const stones = (g, r, base, mortar, n = 9) => {
    g.fillStyle = mortar; g.fillRect(0, 0, TEX, TEX);
    for (let row = 0; row < 4; row++) {
      let x = -Math.floor(r() * 12);
      while (x < TEX) { const w = 14 + Math.floor(r() * 14); g.fillStyle = base[Math.floor(r() * base.length)]; g.fillRect(x + 1, row * 16 + 1, w - 2, 14); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 1, row * 16 + 1, w - 2, 2); x += w; }
    }
    speckle(g, r, 90, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.07)']);
  };
  mk(1, (g, r) => { bricks(g, r, ['#7c2d12', '#9a3412', '#854d0e', '#78350f'], '#292524', '#431407'); speckle(g, r, 60, ['rgba(0,0,0,.3)']); });
  mk(2, (g, r) => stones(g, r, ['#57534e', '#44403c', '#6b7280', '#52525b'], '#1c1917'));
  mk(3, (g, r) => { stones(g, r, ['#44403c', '#3f3f46', '#57534e'], '#1c1917'); for (let i = 0; i < 26; i++) { g.fillStyle = ['#365314', '#3f6212', '#4d7c0f'][i % 3]; const x = r() * TEX, y = r() * TEX; g.fillRect(x, y, 3 + r() * 5, 2 + r() * 6); } });
  mk(4, (g, r) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#78350f', '#92400e', '#7c2d12', '#854d0e'][i]; g.fillRect(i * 16, 0, 16, TEX); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 16, 0, 1, TEX); }
    speckle(g, r, 80, ['rgba(0,0,0,.2)']);
    g.fillStyle = '#1c1917'; g.fillRect(0, 10, TEX, 5); g.fillRect(0, 48, TEX, 5);
    g.fillStyle = '#a8a29e'; for (const x of [6, 26, 46]) { g.fillRect(x, 11, 3, 3); g.fillRect(x, 49, 3, 3); }
    g.fillStyle = '#fbbf24'; g.fillRect(50, 30, 6, 4);
  });
  mk(5, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, TEX); gr.addColorStop(0, '#fde68a'); gr.addColorStop(1, '#b45309'); g.fillStyle = gr; g.fillRect(0, 0, TEX, TEX);
    g.fillStyle = '#78350f'; for (let x = 4; x < TEX; x += 10) g.fillRect(x, 0, 3, TEX); g.fillRect(0, 4, TEX, 3); g.fillRect(0, 56, TEX, 3);
    g.fillStyle = '#fff7ed'; g.font = '900 13px system-ui'; g.textAlign = 'center'; g.fillText('EXIT', 32, 36);
  });
  mk(6, (g, r) => {
    stones(g, r, ['#44403c', '#3f3f46'], '#0c0a09');
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(6, 6, 52, 58);
    g.fillStyle = '#6b7280'; for (let x = 8; x < 58; x += 8) g.fillRect(x, 6, 3, 58); g.fillRect(6, 14, 52, 3); g.fillRect(6, 40, 52, 3);
    g.fillStyle = '#9ca3af'; for (let x = 8; x < 58; x += 8) g.fillRect(x, 6, 1, 58);
  });
  const lever = (g, r, up) => {
    stones(g, r, ['#57534e', '#44403c'], '#1c1917');
    g.fillStyle = '#292524'; g.fillRect(24, 26, 16, 18);
    g.strokeStyle = '#a8a29e'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 35); g.lineTo(up ? 24 : 40, up ? 14 : 54); g.stroke();
    g.fillStyle = up ? '#ef4444' : '#22c55e'; g.beginPath(); g.arc(up ? 24 : 40, up ? 14 : 54, 4, 0, Math.PI * 2); g.fill();
  };
  mk(7, (g, r) => lever(g, r, true), 7);
  mk(8, (g, r) => lever(g, r, false), 7);
  mk(9, (g, r) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#44403c', '#57534e', '#44403c', '#57534e'][i]; g.fillRect(i * 16, 0, 16, TEX); }
    speckle(g, r, 60, ['rgba(0,0,0,.25)']);
    g.fillStyle = '#a16207'; g.fillRect(0, 8, TEX, 4); g.fillRect(0, 52, TEX, 4);
    g.fillStyle = '#fbbf24'; g.fillRect(26, 26, 12, 14); g.fillStyle = '#1c1917'; g.beginPath(); g.arc(32, 31, 2.5, 0, Math.PI * 2); g.fill(); g.fillRect(31, 32, 2, 5);
  });
  mk(10, (g, r) => stones(g, r, ['#3f3f46', '#27272a', '#3f3f46', '#52525b'], '#09090b'), 10);
  mk(11, (g, r) => { stones(g, r, ['#3f3f46', '#27272a', '#3f3f46', '#52525b'], '#09090b'); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(30, 18); g.lineTo(34, 30); g.lineTo(31, 44); g.stroke(); }, 10);
  mk(12, (g, r) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#1e3a8a', '#1d4ed8', '#1e40af', '#1d4ed8'][i]; g.fillRect(i * 16, 0, 16, TEX); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 16, 0, 1, TEX); }
    g.fillStyle = '#93c5fd'; g.fillRect(26, 26, 12, 14); g.fillStyle = '#0f172a'; g.beginPath(); g.arc(32, 31, 2.5, 0, Math.PI * 2); g.fill(); g.fillRect(31, 32, 2, 5);
  });
  mk(13, (g, r) => {
    stones(g, r, ['#44403c', '#3f3f46'], '#0c0a09');
    for (let i = 0; i < 14; i++) { const x = 4 + r() * 52, y = 4 + r() * 52; g.fillStyle = '#e7e5e4'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1c1917'; g.fillRect(x - 2, y - 1, 1.5, 1.5); g.fillRect(x + 0.5, y - 1, 1.5, 1.5); }
  });
  return T;
}

/** Sprite images (64×64, transparent). */
export function makeSprites() {
  const S = {};
  const mk = (name, fn) => { const c = canvas(TEX, TEX), g = c.getContext('2d'); fn(g); S[name] = c; };
  mk('ghoul', (g) => {
    const gr = g.createRadialGradient(32, 30, 4, 32, 34, 30); gr.addColorStop(0, '#86efac'); gr.addColorStop(1, '#14532d');
    g.fillStyle = gr; g.beginPath(); g.moveTo(10, 62); g.quadraticCurveTo(6, 10, 32, 6); g.quadraticCurveTo(58, 10, 54, 62);
    for (let x = 54; x > 10; x -= 8) g.lineTo(x - 4, 55), g.lineTo(x - 8, 62); g.fill();
    g.fillStyle = '#fef08a'; g.beginPath(); g.arc(23, 26, 5, 0, Math.PI * 2); g.arc(41, 26, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#dc2626'; g.beginPath(); g.arc(23, 26, 2, 0, Math.PI * 2); g.arc(41, 26, 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#052e16'; g.beginPath(); g.ellipse(32, 42, 9, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5f5f4'; for (let x = 25; x < 40; x += 4) { g.beginPath(); g.moveTo(x, 38); g.lineTo(x + 2, 43); g.lineTo(x + 4, 38); g.fill(); }
  });
  mk('skeleton', (g) => {
    g.fillStyle = '#e7e5e4'; g.strokeStyle = '#e7e5e4'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(32, 12, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1c1917'; g.fillRect(27, 10, 4, 4); g.fillRect(33, 10, 4, 4); g.fillRect(30, 16, 4, 2);
    g.beginPath(); g.moveTo(32, 20); g.lineTo(32, 42); g.stroke();
    for (let y = 24; y < 38; y += 4) { g.beginPath(); g.moveTo(24, y); g.lineTo(40, y); g.stroke(); }
    g.beginPath(); g.moveTo(32, 24); g.lineTo(18, 36); g.moveTo(32, 24); g.lineTo(46, 34); g.moveTo(32, 42); g.lineTo(24, 62); g.moveTo(32, 42); g.lineTo(40, 62); g.stroke();
    g.strokeStyle = '#94a3b8'; g.lineWidth = 2; g.beginPath(); g.moveTo(46, 34); g.lineTo(58, 8); g.stroke();
  });
  mk('key', (g) => {
    g.fillStyle = '#fbbf24'; g.strokeStyle = '#fbbf24'; g.lineWidth = 5;
    g.beginPath(); g.arc(32, 22, 9, 0, Math.PI * 2); g.stroke();
    g.fillRect(29, 30, 6, 26); g.fillRect(35, 44, 8, 4); g.fillRect(35, 51, 6, 4);
  });
  mk('bluekey', (g) => {
    g.fillStyle = '#60a5fa'; g.strokeStyle = '#60a5fa'; g.lineWidth = 5;
    g.beginPath(); g.arc(32, 22, 9, 0, Math.PI * 2); g.stroke();
    g.fillRect(29, 30, 6, 26); g.fillRect(35, 44, 8, 4); g.fillRect(35, 51, 6, 4);
  });
  mk('torch', (g) => {
    g.fillStyle = '#78350f'; g.fillRect(29, 30, 6, 32);
    const gr = g.createRadialGradient(32, 22, 2, 32, 22, 16); gr.addColorStop(0, '#fef9c3'); gr.addColorStop(0.5, '#f97316'); gr.addColorStop(1, 'rgba(234,88,12,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 20, 14, 18, 0, 0, Math.PI * 2); g.fill();
  });
  mk('coin', (g) => {
    g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(32, 48, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fde68a'; g.beginPath(); g.arc(29, 45, 4, 0, Math.PI * 2); g.fill();
  });
  mk('chest', (g) => {
    g.fillStyle = '#78350f'; g.fillRect(10, 34, 44, 26); g.fillStyle = '#92400e'; g.beginPath(); g.moveTo(10, 36); g.quadraticCurveTo(32, 16, 54, 36); g.fill();
    g.fillStyle = '#fbbf24'; g.fillRect(10, 38, 44, 3); g.fillRect(29, 38, 6, 10);
  });
  mk('spikes', (g) => {
    g.fillStyle = '#d6d3d1';
    for (let x = 6; x < 60; x += 8) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 4, 42); g.lineTo(x + 8, 64); g.fill(); }
  });
  mk('spikesdown', (g) => { g.fillStyle = '#57534e'; for (let x = 6; x < 60; x += 8) g.fillRect(x + 2, 60, 4, 4); });
  mk('crown', (g) => {
    g.fillStyle = '#fbbf24'; g.beginPath(); g.moveTo(12, 44); g.lineTo(14, 22); g.lineTo(24, 34); g.lineTo(32, 16); g.lineTo(40, 34); g.lineTo(50, 22); g.lineTo(52, 44); g.closePath(); g.fill();
    g.fillRect(12, 44, 40, 8);
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(32, 46, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(22, 46, 2.5, 0, Math.PI * 2); g.arc(42, 46, 2.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fde68a'; g.font = '700 5px system-ui'; g.textAlign = 'center'; g.fillText('TC LEGENDS', 32, 60);
  });
  mk('stairs', (g) => {
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#a8a29e' : '#78716c'; g.fillRect(8 + i * 5, 34 + i * 6, 48 - i * 10, 6); }
    g.fillStyle = 'rgba(250,204,21,.6)'; g.beginPath(); g.moveTo(32, 14); g.lineTo(40, 26); g.lineTo(24, 26); g.fill();
  });
  mk('plate', (g) => { g.fillStyle = '#57534e'; g.fillRect(8, 56, 48, 6); g.fillStyle = '#a8a29e'; g.fillRect(8, 56, 48, 2); });
  return S;
}

/** Axis-separated movement with a round body of radius r. */
export function tryMove(solid, o, dx, dy, r = 0.22) {
  const nx = o.x + dx;
  if (!solid(Math.floor(nx + Math.sign(dx) * r), Math.floor(o.y - r)) && !solid(Math.floor(nx + Math.sign(dx) * r), Math.floor(o.y + r))) o.x = nx;
  const ny = o.y + dy;
  if (!solid(Math.floor(o.x - r), Math.floor(ny + Math.sign(dy) * r)) && !solid(Math.floor(o.x + r), Math.floor(ny + Math.sign(dy) * r))) o.y = ny;
}

/** Clear line of sight between two points (steps along the line)? */
export function canSee(solid, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 4);
  for (let i = 1; i < n; i++) { const t = i / n; if (solid(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false; }
  return true;
}

export class Raycaster {
  constructor({ x = 0, y = 0, w, h, cols = 160 }) {
    this.vx = x; this.vy = y; this.vw = w; this.vh = h; this.cols = cols;
    this.colW = w / cols;
    this.zbuf = new Float32Array(cols);
  }

  /**
   * cell(x,y) → texture id (0 = open). cam {x,y,a}. opts: tex, sprites [{x,y,img,scale,lift,alpha}],
   * light (torch radius in cells), ceil/floor [near,far] colours, bob (head bob px)
   */
  render(ctx, cell, cam, opts) {
    const { tex, light = 6, bob = 0 } = opts;
    const X = this.vx, Y = this.vy, VW = this.vw, VH = this.vh, horizon = Y + VH / 2 + bob;
    const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a), plX = -dirY * 0.66, plY = dirX * 0.66;
    ctx.save();
    ctx.imageSmoothingEnabled = false;               // crisp retro texels
    ctx.beginPath(); ctx.rect(X, Y, VW, VH); ctx.clip();
    // ceiling + floor (fading into the dark)
    const cg = ctx.createLinearGradient(0, Y, 0, horizon);
    cg.addColorStop(0, opts.ceil?.[0] || '#1c1917'); cg.addColorStop(1, '#000');
    ctx.fillStyle = cg; ctx.fillRect(X, Y, VW, horizon - Y);
    const fg = ctx.createLinearGradient(0, horizon, 0, Y + VH);
    fg.addColorStop(0, '#000'); fg.addColorStop(1, opts.floor?.[0] || '#44403c');
    ctx.fillStyle = fg; ctx.fillRect(X, horizon, VW, Y + VH - horizon);

    for (let c = 0; c < this.cols; c++) {
      const camX = 2 * (c + 0.5) / this.cols - 1;
      const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      let mx = Math.floor(cam.x), my = Math.floor(cam.y);
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (cam.x - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - cam.x) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (cam.y - my) * ddy; } else { stepY = 1; sdy = (my + 1 - cam.y) * ddy; }
      let side = 0, id = 0, guard = 0;
      while (guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        id = cell(mx, my);
        if (id) break;
      }
      const dist = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      this.zbuf[c] = dist;
      if (!id) continue;
      let wx = side === 0 ? cam.y + dist * rdy : cam.x + dist * rdx;
      wx -= Math.floor(wx);
      let tx = Math.floor(wx * TEX);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TEX - tx - 1;
      const lh = VH / dist, top = horizon - lh / 2;
      const img = tex[id] || tex[2];
      const x = X + c * this.colW;
      ctx.drawImage(img, tx, 0, 1, TEX, x, top, this.colW + 0.6, lh);
      // light falls off with distance; the far side of each block is a little darker
      const dark = Math.min(0.97, Math.pow(dist / light, 1.25) * 0.95 + (side ? 0.12 : 0));
      if (dark > 0.02) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(x, top, this.colW + 0.6, lh); }
    }

    // sprites, far to near, clipped by the wall depth buffer
    const invDet = 1 / (plX * dirY - dirX * plY);
    const list = (opts.sprites || []).map((s) => {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      return { s, tX: invDet * (dirY * sx - dirX * sy), tY: invDet * (-plY * sx + plX * sy) };
    }).filter((p) => p.tY > 0.12).sort((a, b) => b.tY - a.tY);
    for (const { s, tX, tY } of list) {
      const scrX = X + (VW / 2) * (1 + tX / tY);
      const size = (VH / tY) * (s.scale || 1);
      const lift = (s.lift || 0) * VH / tY;
      const top = horizon - size / 2 + (VH / tY) * (1 - (s.scale || 1)) / 2 - lift;
      const left = scrX - size / 2;
      const c0 = Math.max(0, Math.floor((left - X) / this.colW)), c1 = Math.min(this.cols - 1, Math.floor((left + size - X) / this.colW));
      const alpha = (s.alpha ?? 1) * Math.max(0, 1 - (tY / light) * (s.glow ? 0.45 : 0.9));
      if (alpha <= 0.02) continue;
      ctx.globalAlpha = alpha;
      for (let c = c0; c <= c1; c++) {
        if (tY >= this.zbuf[c]) continue;
        const sx0 = X + c * this.colW;
        const u = Math.floor(((sx0 - left) / size) * TEX);
        if (u < 0 || u >= TEX) continue;
        ctx.drawImage(s.img, u, 0, 1, TEX, sx0, top, this.colW + 0.6, size);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

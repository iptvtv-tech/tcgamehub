// ─────────────────────────────────────────────────────────────
//  HD first-person engine — the upgraded version of raycast.js (which Dungeon
//  Escape 3D still uses unchanged). Same ray-casting idea, but every pixel is
//  worked out in code:
//    • textured floors and ceilings (not flat gradients)
//    • real lighting: your own flickering torch + coloured light from wall
//      sconces and glowing things, spilling across walls and floor
//    • soft shadows where walls meet the floor, distance haze (fog)
//    • sprites lit by the same light, with glowing parts (eyes, flames, jewels)
//  The picture is built in a small off-screen image (size set by the HIGH/LOW
//  graphics switch) and scaled up crisply.
//
//  Uses: Crypt of Crowns 3D, Crown Heist 3D. Map cells and texture ids are the same as raycast.js.
//  Crown Heist also uses: moving lights (guards' torch cones, the crown's glow — see
//  moveLights) and a different floor texture per square (opts.floorMap / floorTex).
// ─────────────────────────────────────────────────────────────
export const TEX = 64;

const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
/** canvas → texture data (64×64 packed pixels) */
export function texData(canvas) {
  const g = canvas.getContext('2d');
  return new Uint32Array(g.getImageData(0, 0, canvas.width, canvas.height).data.buffer.slice(0));
}

const TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

export class HDRaycaster {
  constructor({ x = 0, y = 0, w, h }) {
    this.vx = x; this.vy = y; this.vw = w; this.vh = h;
    this.setRes(360);
    // player-torch brightness by distance, and haze by distance (lookup tables, 32 steps per cell)
    this.lut = null; this.lutLight = -1;
  }

  /** Internal picture width (height follows the view's shape).
   *  Phones and tablets cast a quarter fewer rays (audit P2): each ray is a column of pixels,
   *  so this cuts the work by ~44% (fewer columns AND fewer rows) while staying sharp enough. */
  setRes(cols) {
    if (TOUCH) cols = Math.round(cols * 0.75);
    if (cols === this.rw) return;
    this.rw = cols; this.rh = Math.round(cols * this.vh / this.vw);
    this.can = cnv(this.rw, this.rh); this.g = this.can.getContext('2d');
    this.img = this.g.createImageData(this.rw, this.rh);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(this.rw);
  }

  makeLut(light, fogDist) {
    const n = 64 * 32, bright = new Float32Array(n), fog = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = i / 32;
      bright[i] = Math.pow(Math.max(0, 1 - Math.min(1, Math.pow(d / light, 1.25) * 0.95)), 1.3);
      fog[i] = Math.min(0.92, Math.pow(d / fogDist, 1.6));
    }
    this.lut = { bright, fog }; this.lutLight = light + fogDist * 1000;
  }

  /**
   * Build the light map for a level: lights = [{x, y, r, g, b, rad}] in cells; solid(x, y) blocks light.
   * Light is stored 4 samples per cell and read back smoothly (bilinear).
   */
  buildLights(w, h, lights, solid) {
    const S = 4, LW = w * S + 1, LH = h * S + 1;
    const R = new Float32Array(LW * LH), G = new Float32Array(LW * LH), B = new Float32Array(LW * LH);
    for (const L of lights) {
      const x0 = Math.max(0, Math.floor((L.x - L.rad) * S)), x1 = Math.min(LW - 1, Math.ceil((L.x + L.rad) * S));
      const y0 = Math.max(0, Math.floor((L.y - L.rad) * S)), y1 = Math.min(LH - 1, Math.ceil((L.y + L.rad) * S));
      for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
        const px = sx / S, py = sy / S, d = Math.hypot(px - L.x, py - L.y);
        if (d > L.rad) continue;
        // a sample on a wall edge counts if any open square touching it can see the light
        if (!seesLight(solid, L.x, L.y, px, py)) continue;
        const k = Math.pow(1 - d / L.rad, 1.7);
        const i = sy * LW + sx; R[i] += L.r * k; G[i] += L.g * k; B[i] += L.b * k;
      }
    }
    this.L = { S, LW, LH, R, G, B, w, h };
    this.L0 = null;
  }

  /**
   * Moving lights on top of the fixed ones (call every frame, after buildLights).
   * lights = [{x, y, r, g, b, rad, dir?, cone?}] — with dir/cone (radians, half-angle) the light is a
   * torch beam that only shines that way, soft at its edges. solid(x, y) blocks light, as in buildLights.
   */
  moveLights(lights, solid) {
    const L = this.L;
    if (!L) return;
    if (!this.L0) this.L0 = { R: L.R.slice(), G: L.G.slice(), B: L.B.slice() };
    L.R.set(this.L0.R); L.G.set(this.L0.G); L.B.set(this.L0.B);
    const S = L.S, LW = L.LW, LH = L.LH, R = L.R, G = L.G, B = L.B;
    for (const Lt of lights) {
      const x0 = Math.max(0, Math.floor((Lt.x - Lt.rad) * S)), x1 = Math.min(LW - 1, Math.ceil((Lt.x + Lt.rad) * S));
      const y0 = Math.max(0, Math.floor((Lt.y - Lt.rad) * S)), y1 = Math.min(LH - 1, Math.ceil((Lt.y + Lt.rad) * S));
      const cone = Lt.cone, cd = Lt.dir || 0, cx = Math.cos(cd), cy = Math.sin(cd), cosC = cone ? Math.cos(cone) : -2, cosC2 = cone ? Math.cos(cone * 0.6) : -2;
      for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
        const px = sx / S, py = sy / S, dx = px - Lt.x, dy = py - Lt.y, d = Math.hypot(dx, dy);
        if (d > Lt.rad) continue;
        let k = Math.pow(1 - d / Lt.rad, 1.5);
        if (cone && d > 0.35) {
          const c = (dx * cx + dy * cy) / d;
          if (c < cosC) continue;
          if (c < cosC2) k *= (c - cosC) / (cosC2 - cosC);         // soft edge of the beam
        }
        if (!seesLight(solid, Lt.x, Lt.y, px, py)) continue;
        const i = sy * LW + sx; R[i] += Lt.r * k; G[i] += Lt.g * k; B[i] += Lt.b * k;
      }
    }
  }

  /**
   * Draw the view.  cam {x, y, a, bob}.  opts:
   *   ids: Int16Array(w*h) texture id per cell (0 = open) · mapW, mapH
   *   tex: {id: {data, glow?}} · floor, ceil: {data} · faceTex(x, y, fx, fy, id) → override id for one wall face
   *   floorMap: Uint8Array(w*h) + floorTex: [{data}] — a floor texture per square (optional)
   *   light (torch reach, cells) · fogDist · ambient [r,g,b] (0..1) · torch [r,g,b] (0..1) · flicker (0..1 multiplier for wall lights)
   *   fogCol [r,g,b] (0..255) · sprites [{x, y, data, glow?, scale, lift, minLight, alpha, wide}]
   */
  render(ctx, cam, o) {
    const rw = this.rw, rh = this.rh, buf = this.buf;
    if (this.lutLight !== o.light + o.fogDist * 1000) this.makeLut(o.light, o.fogDist);
    const { bright, fog } = this.lut;
    const horizon = rh / 2 + (cam.bob || 0) * rh / this.vh;
    const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a), plX = -dirY * 0.66, plY = dirX * 0.66;
    const ids = o.ids, MW = o.mapW, MH = o.mapH;
    const amb = o.ambient, tor = o.torch, fl = o.flicker ?? 1, fc = o.fogCol;
    const L = this.L, S = L.S, LW = L.LW, LR = L.R, LG = L.G, LB = L.B, LWm = L.LW - 1.001, LHm = L.LH - 1.001;
    const tm = (k) => k * 1.4 / (1 + 0.4 * k);          // tone curve: strong light rolls off gently instead of burning out
    const isSolid = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 1 : ids[y * MW + x]);

    // light at a world point → [r, g, b] in out (shared arrays to avoid garbage)
    const lr = [0, 0, 0];
    const lightAt = (wx, wy) => {
      let fx = wx * S, fy = wy * S;
      fx = fx < 0 ? 0 : fx > LWm ? LWm : fx; fy = fy < 0 ? 0 : fy > LHm ? LHm : fy;
      const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, i = iy * LW + ix;
      const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
      lr[0] = (LR[i] * w00 + LR[i + 1] * w10 + LR[i + LW] * w01 + LR[i + LW + 1] * w11) * fl;
      lr[1] = (LG[i] * w00 + LG[i + 1] * w10 + LG[i + LW] * w01 + LG[i + LW + 1] * w11) * fl;
      lr[2] = (LB[i] * w00 + LB[i + 1] * w10 + LB[i + LW] * w01 + LB[i + LW + 1] * w11) * fl;
    };

    // ── floor & ceiling, one row at a time
    const fT = o.floor.data, cT = o.ceil.data, FM = o.floorMap, FT = o.floorTex;
    const r0x = dirX - plX, r0y = dirY - plY, r1x = dirX + plX, r1y = dirY + plY;
    for (let y = 0; y < rh; y++) {
      const isFloor = y > horizon, p = isFloor ? y - horizon : horizon - y;
      if (p < 0.5) { for (let x = 0; x < rw; x++) buf[y * rw + x] = 0xff000000; continue; }
      const rowDist = rh / (2 * p);
      const di = Math.min(2047, (rowDist * 32) | 0), pb = bright[di], fk = fog[di], fk1 = 1 - fk;
      const tR = tor[0] * pb, tG = tor[1] * pb, tB = tor[2] * pb;
      const sx = rowDist * (r1x - r0x) / rw, sy = rowDist * (r1y - r0y) / rw;
      let wx = cam.x + rowDist * r0x + sx * 0.5, wy = cam.y + rowDist * r0y + sy * 0.5;
      const T = isFloor ? fT : cT;
      let o32 = y * rw;
      for (let x = 0; x < rw; x++, wx += sx, wy += sy) {
        const cx = Math.floor(wx), cy = Math.floor(wy), u = wx - cx, v = wy - cy;
        const TT = FM && isFloor && cx >= 0 && cy >= 0 && cx < MW && cy < MH ? FT[FM[cy * MW + cx]].data : T;
        const t = TT[(((v * 64) | 0) & 63) * 64 + (((u * 64) | 0) & 63)];
        if (!(x & 1)) lightAt(wx + sx * 0.5, wy + sy * 0.5);              // light changes slowly: work it out every other pixel
        // soft shadow along the foot (or top) of each wall
        let ao = 1;
        if (u < 0.22 && isSolid(cx - 1, cy)) ao *= 0.55 + u * 2.05;
        if (u > 0.78 && isSolid(cx + 1, cy)) ao *= 0.55 + (1 - u) * 2.05;
        if (v < 0.22 && isSolid(cx, cy - 1)) ao *= 0.55 + v * 2.05;
        if (v > 0.78 && isSolid(cx, cy + 1)) ao *= 0.55 + (1 - v) * 2.05;
        const kr = tm(amb[0] + tR + lr[0]) * ao, kg = tm(amb[1] + tG + lr[1]) * ao, kb = tm(amb[2] + tB + lr[2]) * ao;
        let r = (t & 255) * kr, g = ((t >> 8) & 255) * kg, b = ((t >> 16) & 255) * kb;
        r = r * fk1 + fc[0] * fk; g = g * fk1 + fc[1] * fk; b = b * fk1 + fc[2] * fk;
        buf[o32++] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
      }
    }

    // ── walls, one column at a time
    for (let c = 0; c < rw; c++) {
      const camX = 2 * (c + 0.5) / rw - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      let mx = Math.floor(cam.x), my = Math.floor(cam.y);
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (cam.x - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - cam.x) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (cam.y - my) * ddy; } else { stepY = 1; sdy = (my + 1 - cam.y) * ddy; }
      let side = 0, id = 0, guard = 0;
      while (guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        id = isSolid(mx, my);
        if (id) break;
      }
      const dist = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      this.zbuf[c] = dist;
      if (!id) continue;
      const hx = cam.x + dist * rdx, hy = cam.y + dist * rdy;
      let wx = side === 0 ? hy : hx; wx -= Math.floor(wx);
      let tx = (wx * TEX) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TEX - tx - 1;
      const fx = side === 0 ? -stepX : 0, fy = side === 1 ? -stepY : 0;   // which way this face looks
      const tid = o.faceTex ? o.faceTex(mx, my, fx, fy, id) : id;
      const tx0 = o.tex[tid] || o.tex[id], T = tx0.data, Gl = tx0.glow;
      lightAt(hx + fx * 0.06, hy + fy * 0.06);
      const di = Math.min(2047, (dist * 32) | 0), pb = bright[di], fk = fog[di], fk1 = 1 - fk;
      const shade = side ? 0.82 : 1;                                   // one set of faces a little darker
      const kr0 = tm(amb[0] + tor[0] * pb + lr[0]) * shade, kg0 = tm(amb[1] + tor[1] * pb + lr[1]) * shade, kb0 = tm(amb[2] + tor[2] * pb + lr[2]) * shade;
      const lh = rh / dist, top = horizon - lh / 2;
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(rh, Math.ceil(top + lh));
      const vStep = TEX / lh;
      let v = (y0 - top) * vStep;
      for (let y = y0; y < y1; y++, v += vStep) {
        const ti = ((v | 0) & 63) * 64 + tx;
        const t = T[ti], vv = v / TEX;
        const ao = vv > 0.86 ? 0.62 + (1 - vv) * 2.7 : vv < 0.06 ? 0.7 + vv * 5 : 1;   // darker at the foot and top
        let r = (t & 255) * kr0 * ao, g = ((t >> 8) & 255) * kg0 * ao, b = ((t >> 16) & 255) * kb0 * ao;
        const q = Gl ? Gl[ti] : 0;
        if (q >>> 24) {                                                  // glowing paint shines through at its own strength
          const a = (q >>> 24) / 255;
          r = r * (1 - a) + (q & 255) * a; g = g * (1 - a) + ((q >> 8) & 255) * a; b = b * (1 - a) + ((q >> 16) & 255) * a;
        }
        r = r * fk1 + fc[0] * fk; g = g * fk1 + fc[1] * fk; b = b * fk1 + fc[2] * fk;
        buf[y * rw + c] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
      }
    }

    // ── sprites, far to near, hidden behind nearer walls
    const invDet = 1 / (plX * dirY - dirX * plY);
    const list = (o.sprites || []).map((s) => {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      return { s, tX: invDet * (dirY * sx - dirX * sy), tY: invDet * (-plY * sx + plX * sy) };
    }).filter((p) => p.tY > 0.12).sort((a, b) => b.tY - a.tY);
    for (const { s, tX, tY } of list) {
      const scale = s.scale || 1, full = rh / tY, size = full * scale, wide = size * (s.wide ?? 1);
      const scrX = (rw / 2) * (1 + tX / tY);
      const top = horizon - full / 2 + full * (1 - scale) - (s.lift || 0) * full;
      const left = scrX - wide / 2;
      const c0 = Math.max(0, Math.ceil(left)), c1 = Math.min(rw - 1, Math.floor(left + wide));
      const r0 = Math.max(0, Math.ceil(top)), r1 = Math.min(rh - 1, Math.floor(top + size));
      if (c0 > c1 || r0 > r1) continue;
      lightAt(s.x, s.y);
      const di = Math.min(2047, (tY * 32) | 0), pb = bright[di], fk = fog[di], fk1 = 1 - fk, ml = s.minLight || 0;
      const kr = Math.max(ml, tm(amb[0] + tor[0] * pb + lr[0])), kg = Math.max(ml, tm(amb[1] + tor[1] * pb + lr[1])), kb = Math.max(ml, tm(amb[2] + tor[2] * pb + lr[2]));
      const D = s.data, Gl = s.glow, A = s.alpha ?? 1;
      for (let c = c0; c <= c1; c++) {
        if (tY >= this.zbuf[c]) continue;
        const u = (((c - left) / wide) * TEX) | 0;
        if (u < 0 || u > 63) continue;
        for (let y = r0; y <= r1; y++) {
          const vv = (((y - top) / size) * TEX) | 0;
          if (vv < 0 || vv > 63) continue;
          const ti = vv * 64 + u;
          let r, g, b, a;
          const q = Gl ? Gl[ti] : 0;
          if (q >>> 24) { r = q & 255; g = (q >> 8) & 255; b = (q >> 16) & 255; a = (q >>> 24) / 255; r = r * (1 - fk * 0.5); g = g * (1 - fk * 0.5); b = b * (1 - fk * 0.5); }
          else {
            const t = D[ti]; a = (t >>> 24) / 255;
            if (a < 0.04) continue;
            r = (t & 255) * kr; g = ((t >> 8) & 255) * kg; b = ((t >> 16) & 255) * kb;
            r = r * fk1 + fc[0] * fk; g = g * fk1 + fc[1] * fk; b = b * fk1 + fc[2] * fk;
          }
          a *= A;
          const i = y * rw + c;
          if (a < 0.98) { const d = buf[i]; r = r * a + (d & 255) * (1 - a); g = g * a + ((d >> 8) & 255) * (1 - a); b = b * a + ((d >> 16) & 255) * (1 - a); }
          buf[i] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
        }
      }
    }

    this.g.putImageData(this.img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.can, this.vx, this.vy, this.vw, this.vh);
    ctx.restore();
  }

  /** Where a world point lands on screen (for effects drawn on top): [x, y, scale] or null if behind you. */
  project(cam, wx, wy, h = 0.5) {
    const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a), plX = -dirY * 0.66, plY = dirX * 0.66;
    const invDet = 1 / (plX * dirY - dirX * plY), sx = wx - cam.x, sy = wy - cam.y;
    const tX = invDet * (dirY * sx - dirX * sy), tY = invDet * (-plY * sx + plX * sy);
    if (tY < 0.15) return null;
    const k = this.vh / tY;
    return [this.vx + (this.vw / 2) * (1 + tX / tY), this.vy + this.vh / 2 + (cam.bob || 0) + (0.5 - h) * k, k];
  }
}

/** Can light travel from (ax, ay) to the edge point (bx, by)? Tests just short of the point from both sides. */
function seesLight(solid, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 0.01) return true;
  const n = Math.ceil(d * 6);
  // stop a hair before the target so a sample sitting on a wall face still gets lit from the open side
  for (let i = 1; i < n; i++) { const t = (i / n) * (1 - 0.04 / d); if (solid(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false; }
  return true;
}

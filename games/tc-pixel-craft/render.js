// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — the 3D view. One ray per pixel marches through the block
//  grid (a voxel "DDA"), then each pixel gets: its 16×16 texture, sun & torch
//  light from the flood-filled light grid, soft corner shadows (ambient
//  occlusion), see-through water, fog, and a sky with sun, moon, stars and
//  clouds. Creatures are sprites drawn with a depth test.
// ─────────────────────────────────────────────────────────────
import { B } from './items.js';
import { SX, SY, SZ, SEA, isClear } from './world.js';

const RES = [[240, 280], [192, 224], [150, 175], [120, 140]];
// light curve: 0..15 → brightness (each step ≈ 20% dimmer, like a real block game)
const LUT = Float32Array.from({ length: 16 }, (_, i) => Math.pow(0.8, 15 - i));

export class Renderer {
  constructor(tex, sprites, startRes = 0) {
    this.tex = tex; this.sprites = sprites;
    this.crack = Float32Array.from({ length: 256 }, (_, i) => { const u = i & 15, v = i >> 4; return ((u * 37 + v * 91 + ((u * v) % 7) * 13) % 97) / 97; });
    // cloud map 64×64 (cosmetic)
    this.clouds = new Uint8Array(64 * 64);
    let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let k = 0; k < 26; k++) { const cx = rnd() * 64, cz = rnd() * 64, rx = 3 + rnd() * 6, rz = 2 + rnd() * 4; for (let z = -8; z <= 8; z++) for (let x = -10; x <= 10; x++) if ((x / rx) ** 2 + (z / rz) ** 2 < 1) this.clouds[(((cz + z) & 63) * 64) + ((cx + x) & 63)] = 1; }
    this.setRes(startRes);
  }
  get resLevels() { return RES.length; }
  setRes(i) {
    this.resIdx = Math.max(0, Math.min(RES.length - 1, i));
    const [w, h] = RES[this.resIdx];
    this.RW = w; this.RH = h;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(w * h);
  }

  /**
   * cam: { x, y, z, yaw, pitch }   env: { day 0..1, sun [x,y,z], t, underwater, target, crack, lit:Set }
   * sprites: [{ x, y, z, w, h, spr, flash, light }]
   */
  render(world, cam, env, sprites) {
    const RW = this.RW, RH = this.RH, buf = this.buf, depth = this.depth, T = this.tex;
    const blocks = world.b, skyL = world.sky, blkL = world.blk;
    const ox = cam.x, oy = cam.y, oz = cam.z;
    const cp = Math.cos(cam.pitch);
    const fx = cp * Math.sin(cam.yaw), fy = Math.sin(cam.pitch), fz = cp * Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx; // fwd × right
    const tanY = 0.66, tanX = tanY * RW / RH;
    const day = env.day, sun = env.sun, t = env.t;
    const mix = (a, b, k) => a + (b - a) * k;
    // sky colours
    const dusk = Math.max(0, 1 - Math.abs(sun[1]) * 4) * (sun[1] > -0.25 ? 1 : 0);
    const topR = mix(6, 70, day), topG = mix(8, 140, day), topB = mix(28, 235, day);
    const horR = mix(mix(18, 175, day), 250, dusk * 0.6), horG = mix(mix(24, 215, day), 150, dusk * 0.5), horB = mix(mix(52, 255, day), 110, dusk * 0.5);
    const skyBright = 0.2 + 0.8 * day;
    const sunX = sun[0], sunY = sun[1], sunZ = sun[2];
    const maxDist = 44, fogStart = 22;
    const tg = env.target, tgx = tg ? tg.x : -99, tgy = tg ? tg.y : -99, tgz = tg ? tg.z : -99, crackK = env.crack || 0, crack = this.crack;
    const shift = Math.floor(t * 4) & 15, lavaShift = Math.floor(t * 2) & 15;
    const cloudOff = t * 0.6;
    const uw = env.underwater;
    const solidAt = (x, y, z) => { if (x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ || y >= SY) return 0; const v = blocks[(y * SZ + z) * SX + x]; return v && !isClear(v) ? 1 : v === B.LEAVES ? 1 : 0; };

    let o = 0;
    for (let j = 0; j < RH; j++) {
      const sv = (1 - (j + 0.5) / RH * 2) * tanY;
      for (let i = 0; i < RW; i++, o++) {
        const su = ((i + 0.5) / RW * 2 - 1) * tanX;
        const dx = fx + rx * su + ux * sv, dy = fy + uy * sv, dz = fz + rz * su + uz * sv;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
        const stx = dx > 0 ? 1 : -1, sty = dy > 0 ? 1 : -1, stz = dz > 0 ? 1 : -1;
        const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
        let tx = (dx > 0 ? x + 1 - ox : ox - x) * tdx, ty = (dy > 0 ? y + 1 - oy : oy - y) * tdy, tz = (dz > 0 ? z + 1 - oz : oz - z) * tdz;
        let tt = 0, side = 1, v = 0, lx = x, ly = y, lz = z, hitT = 0;
        const tMax = maxDist / dl;
        let waterIn = uw ? 0 : -1, waterLen = 0, waterSurf = 0;
        let R = 0, G = 0, Bc = 0, done = false, sky = false, glowPix = false;
        for (let step = 0; step < 160; step++) {
          lx = x; ly = y; lz = z;
          if (tx < ty && tx < tz) { x += stx; tt = tx; tx += tdx; side = 0; } else if (ty < tz) { y += sty; tt = ty; ty += tdy; side = 1; } else { z += stz; tt = tz; tz += tdz; side = 2; }
          if (tt > tMax) { sky = true; break; }
          if (x < 0 || z < 0 || x >= SX || z >= SZ || y >= SY || y < 0) { sky = true; break; }
          v = blocks[(y * SZ + z) * SX + x];
          if (v === 0) { if (waterIn >= 0) { waterLen += tt - waterIn; waterIn = -1; } continue; }
          if (v === B.WATER) {
            if (waterIn < 0) { waterIn = tt; if (side === 1 && sty < 0) waterSurf = 1; }
            continue;
          }
          if (waterIn >= 0) { waterLen += tt - waterIn; waterIn = -1; }
          if (v === B.TORCH) {
            // thin stick in the middle of the cell
            const bx0 = x + 0.4375, bx1 = x + 0.5625, by0 = y, by1 = y + 0.625, bz0 = z + 0.4375, bz1 = z + 0.5625;
            let t0 = 0, t1 = 1e9;
            const slab = (o1, d1, a, b) => { if (Math.abs(d1) < 1e-9) return o1 >= a && o1 <= b; let ta = (a - o1) / d1, tb = (b - o1) / d1; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; return t0 <= t1; };
            if (slab(ox, dx, bx0, bx1) && slab(oy, dy, by0, by1) && slab(oz, dz, bz0, bz1) && t1 > 0) {
              const hy = oy + dy * t0 - y;
              if (hy > 0.45) { R = 255; G = 220 + (Math.sin(t * 20 + x) * 30 | 0); Bc = 90; glowPix = true; }
              else { R = 120; G = 80; Bc = 40; }
              hitT = t0; done = true; break;
            }
            continue;
          }
          hitT = tt; done = true; break;
        }
        if (!done) {
          // ── sky (or the ocean beyond the edge of the island) ──
          if (waterIn >= 0) { waterLen += Math.min(tt, tMax) - waterIn; }
          const ndy = dy / dl;
          if (ndy < 0 && oy > SEA) {
            // look down past the edge: endless sea
            const ts = (SEA + 0.9 - oy) / dy;
            const dist = ts * dl;
            const f = Math.min(1, dist / 90);
            R = mix(40 * skyBright, horR, f); G = mix(90 * skyBright, horG, f); Bc = mix(170 * skyBright, horB, f);
            depth[o] = ts;
          } else {
            const k = Math.max(0, Math.min(1, ndy * 1.4 + 0.12));
            R = horR + (topR - horR) * k; G = horG + (topG - horG) * k; Bc = horB + (topB - horB) * k;
            const ndx = dx / dl, ndz = dz / dl;
            const sd = ndx * sunX + ndy * sunY + ndz * sunZ;
            if (sd > 0.9985) { R = 255; G = 248; Bc = 210; }
            else if (sd > 0.985) { const g = (sd - 0.985) / 0.0135; R += (255 - R) * g * 0.5; G += (230 - G) * g * 0.45; Bc += (170 - Bc) * g * 0.3; }
            if (-sd > 0.9988) { R = 235; G = 238; Bc = 250; } // moon
            if (day < 0.6 && ndy > 0) {
              const hsh = ((Math.floor(ndx * 180) * 73856093) ^ (Math.floor(ndy * 180) * 19349663) ^ (Math.floor(ndz * 180) * 83492791)) & 1023;
              if (hsh < 3) { const b2 = (0.6 - day) / 0.6 * 255; R = Math.max(R, b2); G = Math.max(G, b2); Bc = Math.max(Bc, b2); }
            }
            if (ndy > 0.02) {
              const tc = (60 - oy) / dy, cx = ox + dx * tc + cloudOff, cz = oz + dz * tc;
              if (this.clouds[((Math.floor(cz / 5) & 63) * 64) + (Math.floor(cx / 5) & 63)]) {
                const a = Math.min(0.85, ndy * 3) ;
                const cr = 255 * skyBright + dusk * 30;
                R += (cr - R) * a; G += (cr * 0.98 - G) * a; Bc += (cr * 0.96 + 10 - Bc) * a;
              }
            }
            depth[o] = 1e9;
          }
        } else {
          // ── a block ──
          const hx = ox + dx * hitT, hy = oy + dy * hitT, hz = oz + dz * hitT;
          const dist = hitT * dl;
          if (!glowPix) {
            let u, w, face, sh;
            const fxr = hx - Math.floor(hx), fyr = hy - Math.floor(hy), fzr = hz - Math.floor(hz);
            if (side === 1) { u = fxr; w = fzr; face = sty > 0 ? 2 : 0; sh = sty > 0 ? 0.55 : 1; }
            else if (side === 0) { u = stx > 0 ? fzr : 1 - fzr; w = 1 - fyr; face = 1; sh = 0.72 + 0.18 * Math.max(0, -stx * sunX); }
            else { u = stz > 0 ? 1 - fxr : fxr; w = 1 - fyr; face = 1; sh = 0.68 + 0.18 * Math.max(0, -stz * sunZ); }
            let ui = (u * 16) | 0, vi = (w * 16) | 0;
            if (ui > 15) ui = 15; if (vi > 15) vi = 15;
            if (v === B.LAVA) { ui = (ui + lavaShift) & 15; vi = (vi + (lavaShift >> 1)) & 15; }
            const to = (((v * 3 + face) << 8) + (vi << 4) + ui) * 3;
            R = T[to]; G = T[to + 1]; Bc = T[to + 2];
            const flashing = v === B.ALTAR || (env.lit && env.lit.has((y * SZ + z) * SX + x));
            // light from the clear cell in front of this face
            let sl = 15, bl = 0;
            if (lx >= 0 && lz >= 0 && ly >= 0 && lx < SX && lz < SZ && ly < SY) { const li = (ly * SZ + lz) * SX + lx; sl = skyL[li]; bl = blkL[li]; }
            let L = LUT[sl] * skyBright, BLt = LUT[bl] * (bl > 0 ? 1 : 0);
            // soft corner shadows
            let ao = 1;
            if (side === 1) {
              if (solidAt(lx - 1, ly, lz)) ao -= 0.28 * Math.max(0, 0.45 - fxr) / 0.45;
              if (solidAt(lx + 1, ly, lz)) ao -= 0.28 * Math.max(0, fxr - 0.55) / 0.45;
              if (solidAt(lx, ly, lz - 1)) ao -= 0.28 * Math.max(0, 0.45 - fzr) / 0.45;
              if (solidAt(lx, ly, lz + 1)) ao -= 0.28 * Math.max(0, fzr - 0.55) / 0.45;
            } else {
              if (solidAt(lx, ly - 1, lz)) ao -= 0.3 * Math.max(0, 0.4 - fyr) / 0.4;
              if (solidAt(lx, ly + 1, lz)) ao -= 0.22 * Math.max(0, fyr - 0.6) / 0.4;
              if (side === 0) { if (solidAt(lx, ly, lz - 1)) ao -= 0.25 * Math.max(0, 0.45 - fzr) / 0.45; if (solidAt(lx, ly, lz + 1)) ao -= 0.25 * Math.max(0, fzr - 0.55) / 0.45; }
              else { if (solidAt(lx - 1, ly, lz)) ao -= 0.25 * Math.max(0, 0.45 - fxr) / 0.45; if (solidAt(lx + 1, ly, lz)) ao -= 0.25 * Math.max(0, fxr - 0.55) / 0.45; }
            }
            if (v === B.LAVA || v === B.TORCH) { L = 1.1; BLt = 0; sh = 1; ao = 1; }
            else if (v === B.CRYSTAL_ORE) { const tw = T[to] > 220 ? 1 : 0; if (tw || (ui + vi + shift) % 13 === 0) L = Math.max(L, 0.85); }
            if (flashing && Math.sin(t * 18) > 0) { L = 1.3; }
            const kk = sh * ao;
            const lr = L * kk + BLt * kk * 1.05 + 0.03, lg = L * kk + BLt * kk * 0.86 + 0.03, lb = L * kk * (1.02 + (1 - day) * 0.15) + BLt * kk * 0.6 + 0.04;
            R *= lr; G *= lg; Bc *= lb;
            // block you're aiming at: outline & cracks
            if (x === tgx && y === tgy && z === tgz) {
              if (u < 0.04 || u > 0.96 || w < 0.04 || w > 0.96) { R *= 0.2; G *= 0.2; Bc *= 0.2; }
              else if (crackK > 0 && crack[(vi << 4) + ui] < crackK) { R *= 0.4; G *= 0.4; Bc *= 0.4; }
            }
          }
          // fog
          if (dist > fogStart) {
            const f = Math.min(1, (dist - fogStart) / (maxDist - fogStart));
            const lit = sl_or_sky(lx, ly, lz, world);
            const fr = lit ? horR : 8, fg = lit ? horG : 8, fb = lit ? horB : 16;
            R += (fr - R) * f; G += (fg - G) * f; Bc += (fb - Bc) * f;
          }
          depth[o] = hitT;
        }
        // water tint along the part of the ray that went through water
        if (waterIn >= 0 && done) waterLen += hitT - waterIn;
        if (waterLen > 0 || waterSurf) {
          const a = Math.min(0.92, 1 - Math.exp(-waterLen * 0.45)) * 0.85 + (waterSurf ? 0.18 : 0);
          const wr = 30 * skyBright + 6, wg = 80 * skyBright + 10, wb = 160 * skyBright + 20;
          R += (wr - R) * a; G += (wg - G) * a; Bc += (wb - Bc) * a;
          if (waterSurf && !uw) { const sp = Math.sin((i + shift * 2) * 0.7) * Math.sin(j * 1.3 + t * 2); if (sp > 0.92) { R += 60 * skyBright; G += 60 * skyBright; Bc += 60 * skyBright; } }
        }
        if (R > 255) R = 255; if (G > 255) G = 255; if (Bc > 255) Bc = 255;
        buf[o] = 0xff000000 | ((Bc | 0) << 16) | ((G | 0) << 8) | (R | 0);
      }
    }
    if (uw) { for (let k = 0; k < buf.length; k++) { const c = buf[k]; const r2 = c & 255, g2 = (c >> 8) & 255, b2 = (c >> 16) & 255; buf[k] = 0xff000000 | (Math.min(255, b2 * 0.7 + 70 * skyBright) << 16) | ((g2 * 0.7 + 30) << 8) | (r2 * 0.5); } }

    // ── creatures ──
    const focal = RH / 2 / tanY;
    const list = [];
    for (const s of sprites) {
      const ex = s.x - ox, ey = s.y + s.h / 2 - oy, ez = s.z - oz;
      const zc = ex * fx + ey * fy + ez * fz;
      if (zc < 0.2 || zc > maxDist) continue;
      list.push({ s, zc, sx: ex * rx + ez * rz, sy: ex * ux + ey * uy + ez * uz });
    }
    list.sort((a, b) => b.zc - a.zc);
    for (const p of list) {
      const s = p.s, spr = this.sprites[s.spr];
      const cx = RW / 2 + p.sx / p.zc * focal, cy = RH / 2 - p.sy / p.zc * focal;
      const pw = s.w / p.zc * focal, ph = s.h / p.zc * focal;
      const x0 = Math.floor(cx - pw / 2), x1 = Math.ceil(cx + pw / 2), y0 = Math.floor(cy - ph / 2), y1 = Math.ceil(cy + ph / 2);
      const L = Math.max(0.32, s.light);
      const fogK = p.zc * Math.hypot(1, 0) > fogStart ? Math.min(1, (p.zc - fogStart) / (maxDist - fogStart)) : 0;
      for (let yy = Math.max(0, y0); yy < Math.min(RH, y1); yy++) {
        const sv2 = Math.min(spr.h - 1, Math.floor((yy - y0) / (y1 - y0) * spr.h));
        for (let xx = Math.max(0, x0); xx < Math.min(RW, x1); xx++) {
          const oo = yy * RW + xx;
          if (depth[oo] < p.zc) continue;
          let su2 = Math.floor((xx - x0) / (x1 - x0) * spr.w);
          if (s.flip) su2 = spr.w - 1 - su2;
          const c = spr.px[sv2 * spr.w + Math.min(spr.w - 1, su2)];
          if (!c) continue;
          const col = spr.pal[c], k = spr.glow[c] ? 1.1 : L;
          let r2 = s.flash ? 255 : col[0] * k, g2 = s.flash ? 120 : col[1] * k, b2 = s.flash ? 120 : col[2] * k;
          if (s.gold) { r2 = Math.min(255, r2 * 0.6 + 120 * k); g2 = Math.min(255, g2 * 0.5 + 95 * k); b2 = b2 * 0.3; }
          if (fogK) { r2 += (horR - r2) * fogK; g2 += (horG - g2) * fogK; b2 += (horB - b2) * fogK; }
          buf[oo] = 0xff000000 | ((Math.min(255, b2) | 0) << 16) | ((Math.min(255, g2) | 0) << 8) | (Math.min(255, r2) | 0);
          depth[oo] = p.zc;
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

function sl_or_sky(x, y, z, world) {
  if (!world.inside(x, y, z)) return true;
  return world.sky[(y * SZ + z) * SX + x] > 6;
}

// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — the GPU 3D view (WebGL 2).
//
//  The island is cut into 16 × 16 columns ("chunks"). Each chunk becomes a
//  mesh of only the block faces you could ever see, with smooth lighting and
//  soft corner shadows baked into its corners. Sunlight is a separate number
//  in every corner, so day turns to night without rebuilding anything.
//  32 × 32 textures live in a texture array (with mipmaps, so far-away blocks
//  don't shimmer). Water is see-through and ripples; lava and torches glow.
//  The sky (sun, moon, stars, blocky clouds and the endless sea) is drawn in
//  one pass, and creatures are real 3D models made by extruding their pixel art.
//
//  If a device has no WebGL 2, the game falls back to the software renderer
//  in render.js.
// ─────────────────────────────────────────────────────────────
import { B, NBLOCKS, isPlant } from './items.js';
import { SX, SY, SZ, SEA } from './world.js';
import { TS } from './blocktex.js';

const CH = 16, NCX = SX / CH, NCZ = SZ / CH;
const TAN_Y = 0.66, NEAR = 0.05, FAR = 220;
const FLOATS = 9; // x y z · u v layer · shade sky blk

// block categories for meshing
const OPAQUE = new Uint8Array(64);
for (let v = 1; v < NBLOCKS; v++) OPAQUE[v] = 1;
for (const v of [B.WATER, B.TORCH, B.LEAVES, B.BUSH, B.BUSH_RIPE, B.MUSHROOM, B.BED]) OPAQUE[v] = 0;
const CROSS = new Uint8Array(64);
for (const v of [B.TORCH, B.BUSH, B.BUSH_RIPE, B.MUSHROOM]) CROSS[v] = 1;
const GLOW = new Uint8Array(64);
for (const v of [B.LAVA, B.TORCH, B.MUSHROOM]) GLOW[v] = 1;

// faces: normal, 4 corners (CCW from outside), and which texture face
const FACES = [
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], tf: 0, shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tf: 2, shade: 0.52 },
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], tf: 1, shade: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tf: 1, shade: 0.8 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tf: 1, shade: 0.66 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], tf: 1, shade: 0.66 },
];
const AO = [0.42, 0.62, 0.8, 1];
// for each corner: the two neighbouring cells in the face's plane (for corner shadows & smooth light)
for (const F of FACES) {
  const ax = F.n[0] ? [1, 2] : F.n[1] ? [0, 2] : [0, 1];
  F.t = F.c.map((c) => { const o1 = [0, 0, 0], o2 = [0, 0, 0]; o1[ax[0]] = c[ax[0]] ? 1 : -1; o2[ax[1]] = c[ax[1]] ? 1 : -1; return [...o1, ...o2]; });
}

// ── shaders ───────────────────────────────────────────────────
const BLOCK_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aUVL; layout(location=2) in vec3 aLight;
uniform mat4 uVP; uniform float uTime; uniform float uWaterLayer;
out vec3 vUVL; out vec3 vLight; out vec3 vWorld;
void main() {
  vec3 p = aPos;
  if (aUVL.z == uWaterLayer && fract(p.y) > 0.8) p.y += sin(uTime * 1.7 + p.x * 1.3 + p.z * 0.9) * 0.03 - 0.03;
  vUVL = aUVL; vLight = aLight; vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const BLOCK_FS = `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform float uDay, uTorch, uTime, uWaterLayer, uLavaLayer, uAlpha, uCrack;
uniform vec3 uFogCol, uCaveFog, uCam; uniform vec2 uFog; uniform vec4 uTarget;
in vec3 vUVL; in vec3 vLight; in vec3 vWorld; out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = vUVL.xy;
  if (vUVL.z == uWaterLayer) uv += vec2(uTime * 0.04, uTime * 0.025);
  if (vUVL.z == uLavaLayer) uv += vec2(sin(uTime * 0.35) * 0.12, uTime * 0.03);
  vec4 t = texture(uTex, vec3(uv, vUVL.z));
  if (uAlpha > 0.99 && t.a < 0.5) discard;
  float shade = vLight.x;
  vec3 col;
  if (shade > 1.5) col = t.rgb * 1.08;
  else {
    float sky = pow(0.8, 15.0 * (1.0 - vLight.y)) * uDay;
    float blk = vLight.z > 0.0 ? pow(0.8, 15.0 * (1.0 - vLight.z)) * uTorch : 0.0;
    vec3 L = sky * vec3(0.97, 0.98, 1.0 + 0.18 * (1.0 - uDay)) + blk * vec3(1.0, 0.8, 0.55);
    col = t.rgb * max(L, vec3(0.03)) * shade;
  }
  if (uTarget.w > 0.0) {
    vec3 dir = normalize(vWorld - uCam), q = vWorld + dir * 0.002;
    if (floor(q) == uTarget.xyz) {
      vec3 f = fract(q), e = min(f, 1.0 - f);
      float n = (e.x < 0.022 ? 1.0 : 0.0) + (e.y < 0.022 ? 1.0 : 0.0) + (e.z < 0.022 ? 1.0 : 0.0);
      if (n >= 2.0) col *= 0.2;
      else {
        col += 0.035;
        if (uCrack > 0.0) {
          vec2 pq = (e.x <= e.y && e.x <= e.z) ? f.yz : (e.y <= e.z ? f.xz : f.xy);
          if (hash(floor(pq * 16.0)) < uCrack) col *= 0.42;
        }
      }
    }
  }
  float d = length(vWorld - uCam);
  vec3 fc = mix(uCaveFog, uFogCol, smoothstep(0.15, 0.6, vLight.y));
  col = mix(col, fc, smoothstep(uFog.x, uFog.y, d));
  o = vec4(col, uAlpha > 0.99 ? 1.0 : uAlpha);
}`;
const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vP;
void main() { vP = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 uF, uR, uU, uSun, uTop, uHor, uCam, uSeaCol; uniform vec2 uTan; uniform float uDay, uTime, uBlood, uSeaY, uFogE;
uniform sampler2D uCloud;
in vec2 vP; out vec4 o;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 dir = normalize(uF + uR * vP.x * uTan.x + uU * vP.y * uTan.y);
  float k = clamp(dir.y * 1.4 + 0.12, 0.0, 1.0);
  vec3 col = mix(uHor, uTop, k);
  vec3 s = normalize(uSun);
  vec3 t1 = normalize(cross(s, vec3(0.0, 0.0, 1.0))), t2 = cross(t1, s);
  float sd = dot(dir, s);
  if (sd > 0.0) {
    vec2 q = vec2(dot(dir, t1), dot(dir, t2)) / sd;
    float m = max(abs(q.x), abs(q.y));
    col += vec3(1.0, 0.8, 0.5) * exp(-length(q) * 5.0) * 0.35 * uDay;
    if (m < 0.075) col = vec3(1.0, 0.97, 0.82);
  } else {
    vec2 q = vec2(dot(dir, t1), dot(dir, t2)) / -sd;
    float m = max(abs(q.x), abs(q.y));
    vec3 moon = mix(vec3(0.9, 0.92, 1.0), vec3(1.0, 0.25, 0.2), uBlood);
    col += moon * exp(-length(q) * 9.0) * 0.18 * (1.0 - uDay);
    if (m < 0.055) col = moon * (0.85 + 0.15 * step(0.5, fract((q.x + q.y) * 18.0)));
  }
  if (dir.y > 0.0 && uDay < 0.7) {
    vec3 c = floor(dir * 220.0);
    if (hash(c) > 0.9975) col = max(col, vec3((0.7 - uDay) / 0.7 * (0.6 + 0.4 * sin(uTime * 3.0 + hash(c + 1.0) * 40.0))));
  }
  if (dir.y > 0.015) {
    float tc = (64.0 - uCam.y) / dir.y;
    vec2 p = uCam.xz + dir.xz * tc + vec2(uTime * 0.7, 0.0);
    if (texture(uCloud, p / 384.0).r > 0.5) {
      float a = clamp(1.0 - tc / 420.0, 0.0, 1.0) * 0.85;
      vec3 cc = vec3(0.12 + 0.88 * uDay) + vec3(0.25, 0.08, 0.0) * (1.0 - abs(uDay - 0.5) * 2.0) * 0.6;
      col = mix(col, cc, a);
    }
  }
  if (dir.y < -0.0005) {
    float tt = (uSeaY - uCam.y) / dir.y;
    if (tt > 0.0) {
      vec3 h = uCam + dir * tt;
      float w = sin(h.x * 0.6 + uTime * 1.2) * sin(h.z * 0.5 + uTime);
      vec3 wc = uSeaCol * (1.0 + w * 0.06);
      col = mix(wc, uHor, smoothstep(uFogE * 0.6, uFogE * 3.0, tt));
    } else col = uHor * 0.5;
  }
  col = mix(col, col * vec3(1.25, 0.55, 0.5), uBlood * (1.0 - uDay) * 0.7);
  o = vec4(col, 1.0);
}`;
const ENT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol; layout(location=2) in vec2 aEx;
uniform mat4 uVP, uModel; out vec3 vCol; out vec2 vEx; out vec3 vWorld;
void main() { vec4 w = uModel * vec4(aPos, 1.0); vCol = aCol; vEx = aEx; vWorld = w.xyz; gl_Position = uVP * w; }`;
const ENT_FS = `#version 300 es
precision highp float;
uniform float uDay, uTorch, uFlash, uGold; uniform vec2 uLight; uniform vec3 uFogCol, uCaveFog, uCam; uniform vec2 uFog;
in vec3 vCol; in vec2 vEx; in vec3 vWorld; out vec4 o;
void main() {
  float sky = pow(0.8, 15.0 * (1.0 - uLight.x)) * uDay, blk = uLight.y > 0.0 ? pow(0.8, 15.0 * (1.0 - uLight.y)) * uTorch : 0.0;
  vec3 L = max(sky * vec3(1.0) + blk * vec3(1.0, 0.8, 0.55), vec3(0.22));
  vec3 base = vCol;
  if (uGold > 0.5) base = vec3(dot(base, vec3(0.3, 0.59, 0.11))) * vec3(1.35, 1.0, 0.35) + vec3(0.12, 0.08, 0.0);
  vec3 col = vEx.y > 0.5 ? base * 1.05 : base * L * vEx.x;
  col = mix(col, vec3(1.0, 0.35, 0.35), uFlash);
  float d = length(vWorld - uCam);
  col = mix(col, mix(uCaveFog, uFogCol, smoothstep(0.15, 0.6, uLight.x)), smoothstep(uFog.x, uFog.y, d));
  o = vec4(col, 1.0);
}`;

// ── tiny matrix helpers (column-major) ─────────────────────────
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function perspective(tanY, aspect) {
  const f = 1 / tanY, nf = 1 / (NEAR - FAR);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (FAR + NEAR) * nf, -1, 0, 0, 2 * FAR * NEAR * nf, 0]);
}
function model(x, y, z, yaw, sx, sy) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // translate · rotateY(yaw) · scale(sx, sy, sx)
  return new Float32Array([c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sx, 0, c * sx, 0, x, y, z, 1]);
}

export class GLRenderer {
  static supported() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } }

  constructor(tex, sprites, clouds) {
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    this.quality = 1;
    this.block = this.program(BLOCK_VS, BLOCK_FS);
    this.sky = this.program(SKY_VS, SKY_FS);
    this.ent = this.program(ENT_VS, ENT_FS);
    // textures
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TS, TS, NBLOCKS * 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D_ARRAY, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.cloudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, clouds);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    // sky triangle
    this.skyVao = gl.createVertexArray(); gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // chunks
    this.chunks = [];
    for (let cz = 0; cz < NCZ; cz++) for (let cx = 0; cx < NCX; cx++) this.chunks.push({ cx, cz, solid: this.mesh(), water: this.mesh(), dirty: true });
    this.scratch = { v: new Float32Array(FLOATS * 4 * 30000), i: new Uint32Array(6 * 30000) };
    this.wScratch = { v: new Float32Array(FLOATS * 4 * 4000), i: new Uint32Array(6 * 4000) };
    // creature models
    this.models = {};
    for (const [name, s] of Object.entries(sprites)) this.models[name] = this.extrude(s);
    this.lightVersion = -1;
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
  }

  program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  mesh() {
    const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const st = FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, n: 0 };
  }

  /** Pixel art → a chunky 3D model: every pixel becomes a little block, front and back. */
  extrude(s) {
    const gl = this.gl, V = [], Ix = [];
    const pw = 1 / s.w, ph = 1 / s.h, d = 1.6 / s.w;
    const at = (x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? 0 : s.px[y * s.w + x]);
    const quad = (pts, col, shade, glow) => {
      const b = V.length / 8;
      for (const p of pts) V.push(p[0], p[1], p[2], col[0] / 255, col[1] / 255, col[2] / 255, shade, glow);
      Ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const c = at(x, y); if (!c) continue;
      const col = s.pal[c], glow = s.glow[c] ? 1 : 0;
      const x0 = 0.5 - (x + 1) * pw, x1 = x0 + pw, y1 = 1 - y * ph, y0 = y1 - ph; // mirrored so the picture reads the right way round
      quad([[x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d]], col, 1, glow);
      quad([[x1, y0, -d], [x0, y0, -d], [x0, y1, -d], [x1, y1, -d]], col, 0.8, glow);
      if (!at(x, y - 1)) quad([[x0, y1, -d], [x0, y1, d], [x1, y1, d], [x1, y1, -d]], col, 1.12, glow);
      if (!at(x, y + 1)) quad([[x0, y0, -d], [x1, y0, -d], [x1, y0, d], [x0, y0, d]], col, 0.55, glow);
      if (!at(x + 1, y)) quad([[x0, y0, -d], [x0, y0, d], [x0, y1, d], [x0, y1, -d]], col, 0.72, glow);
      if (!at(x - 1, y)) quad([[x1, y0, d], [x1, y0, -d], [x1, y1, -d], [x1, y1, d]], col, 0.72, glow);
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(Ix), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindVertexArray(null);
    return { vao, n: Ix.length };
  }

  invalidateAll() { for (const c of this.chunks) c.dirty = true; this.lightVersion = -1; }

  // ── meshing ─────────────────────────────────────────────────
  buildChunk(world, ch) {
    const b = world.b, skyA = world.sky, blkA = world.blk, top = world.top;
    const S = this.scratch, Wt = this.wScratch;
    let vS = 0, iS = 0, vW = 0, iW = 0;
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    let maxY = 0;
    for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) if (top[z * SX + x] > maxY) maxY = top[z * SX + x];
    maxY = Math.min(SY - 1, maxY + 2);
    // block id at (x,y,z): -1 outside the island, BEDROCK below, AIR above
    const get = (x, y, z) => (y < 0 ? B.BEDROCK : y >= SY ? 0 : (x < 0 || z < 0 || x >= SX || z >= SZ) ? -1 : b[(y * SZ + z) * SX + x]);
    const opq = (x, y, z) => { if (y < 0) return 1; if (y >= SY || x < 0 || z < 0 || x >= SX || z >= SZ) return 0; return OPAQUE[b[(y * SZ + z) * SX + x]]; };
    let lS = 0, lB = 0; // light of the last cell read (sky, block)
    const light = (x, y, z) => {
      if (y >= SY || x < 0 || z < 0 || x >= SX || z >= SZ) { lS = 15; lB = 0; return; }
      if (y < 0) { lS = 0; lB = 0; return; }
      const i = (y * SZ + z) * SX + x; lS = skyA[i]; lB = blkA[i];
    };
    const need = (vs, is) => {
      if ((vs + 4) * FLOATS > S.v.length) { const nv = new Float32Array(S.v.length * 2); nv.set(S.v); S.v = nv; }
      if (is + 12 > S.i.length) { const ni = new Uint32Array(S.i.length * 2); ni.set(S.i); S.i = ni; }
    };
    const needW = (vs, is) => {
      if ((vs + 4) * FLOATS > Wt.v.length) { const nv = new Float32Array(Wt.v.length * 2); nv.set(Wt.v); Wt.v = nv; }
      if (is + 12 > Wt.i.length) { const ni = new Uint32Array(Wt.i.length * 2); ni.set(Wt.i); Wt.i = ni; }
    };
    const put = (V, n, px, py, pz, u, v, layer, shade, sky, blk) => {
      const o = n * FLOATS;
      V[o] = px; V[o + 1] = py; V[o + 2] = pz; V[o + 3] = u; V[o + 4] = v; V[o + 5] = layer; V[o + 6] = shade; V[o + 7] = sky; V[o + 8] = blk;
    };
    for (let y = 0; y <= maxY; y++) for (let lz = 0; lz < CH; lz++) for (let lx = 0; lx < CH; lx++) {
      const x = x0 + lx, z = z0 + lz, v = b[(y * SZ + z) * SX + x];
      if (!v) continue;
      if (CROSS[v]) {
        light(x, y, z);
        const sky = lS / 15, blk = lB / 15, layer = v * 3 + 1;
        const shade = GLOW[v] ? (v === B.MUSHROOM ? 1.6 : 2) : 0.92, m = v === B.TORCH ? 0.3 : 0.12;
        for (let q = 0; q < 2; q++) {
          const ax = q ? 1 - m : m, az = m, cx = q ? m : 1 - m, cz = 1 - m;
          for (let dir = 0; dir < 2; dir++) {
            need(vS, iS);
            const p0x = dir ? cx : ax, p0z = dir ? cz : az, p1x = dir ? ax : cx, p1z = dir ? az : cz, base = vS;
            put(S.v, vS++, x + p0x, y, z + p0z, 0, 1, layer, shade, sky, blk);
            put(S.v, vS++, x + p1x, y, z + p1z, 1, 1, layer, shade, sky, blk);
            put(S.v, vS++, x + p1x, y + 1, z + p1z, 1, 0, layer, shade, sky, blk);
            put(S.v, vS++, x + p0x, y + 1, z + p0z, 0, 0, layer, shade, sky, blk);
            S.i[iS++] = base; S.i[iS++] = base + 1; S.i[iS++] = base + 2; S.i[iS++] = base; S.i[iS++] = base + 2; S.i[iS++] = base + 3;
          }
        }
        continue;
      }
      const isWater = v === B.WATER;
      const topH = isWater && get(x, y + 1, z) !== B.WATER ? 0.875 : 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f], nx = F.n[0], ny = F.n[1], nz = F.n[2];
        const nb = get(x + nx, y + ny, z + nz);
        if (nb === -1) continue;                       // the edge of the world
        if (nb > 0 && OPAQUE[nb]) continue;            // hidden behind a solid block
        if (isWater && nb === B.WATER) continue;
        if (nb === v && v === B.LAVA) continue;
        const layer = v * 3 + F.tf;
        const fx = x + nx, fy = y + ny, fz = z + nz;
        let V, base;
        if (isWater) { needW(vW, iW); V = Wt.v; base = vW; } else { need(vS, iS); V = S.v; base = vS; }
        let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
        for (let k = 0; k < 4; k++) {
          const c = F.c[k], T = F.t[k];
          let sky, blk, ao = 3;
          if (!isWater) {
            const o1 = opq(fx + T[0], fy + T[1], fz + T[2]), o2 = opq(fx + T[3], fy + T[4], fz + T[5]), o3 = opq(fx + T[0] + T[3], fy + T[1] + T[4], fz + T[2] + T[5]);
            ao = o1 && o2 ? 0 : 3 - o1 - o2 - o3;
            light(fx, fy, fz); let ss = lS, bb = lB, cnt = 1;
            if (!o1) { light(fx + T[0], fy + T[1], fz + T[2]); ss += lS; bb += lB; cnt++; }
            if (!o2) { light(fx + T[3], fy + T[4], fz + T[5]); ss += lS; bb += lB; cnt++; }
            if (!o3 && !(o1 && o2)) { light(fx + T[0] + T[3], fy + T[1] + T[4], fz + T[2] + T[5]); ss += lS; bb += lB; cnt++; }
            sky = ss / cnt / 15; blk = bb / cnt / 15;
          } else { light(fx, fy, fz); sky = lS / 15; blk = lB / 15; }
          if (k === 0) a0 = ao; else if (k === 1) a1 = ao; else if (k === 2) a2 = ao; else a3 = ao;
          const shade = GLOW[v] ? 2 : F.shade * AO[ao];
          let tu, tv;
          if (ny) { tu = c[0]; tv = c[2]; } else if (nx) { tu = nx > 0 ? c[2] : 1 - c[2]; tv = 1 - c[1]; } else { tu = nz > 0 ? 1 - c[0] : c[0]; tv = 1 - c[1]; }
          let py = y + c[1];
          if (isWater && c[1] === 1) py = y + topH;
          if (isWater && !ny) tv = c[1] ? 1 - topH : 1;
          put(V, base + k, x + c[0], py, z + c[2], tu, tv, layer, shade, sky, blk);
        }
        const flip = a0 + a2 < a1 + a3;
        const I = isWater ? Wt.i : S.i;
        let n = isWater ? iW : iS;
        if (flip) { I[n++] = base + 1; I[n++] = base + 2; I[n++] = base + 3; I[n++] = base + 1; I[n++] = base + 3; I[n++] = base; }
        else { I[n++] = base; I[n++] = base + 1; I[n++] = base + 2; I[n++] = base; I[n++] = base + 2; I[n++] = base + 3; }
        if (isWater) { iW = n; vW += 4; } else { iS = n; vS += 4; }
      }
    }
    const gl = this.gl;
    const up = (m, V, I, n) => {
      gl.bindVertexArray(m.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo); gl.bufferData(gl.ARRAY_BUFFER, V, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
      m.n = n;
    };
    up(ch.solid, S.v.subarray(0, vS * FLOATS), S.i.subarray(0, iS), iS);
    up(ch.water, Wt.v.subarray(0, vW * FLOATS), Wt.i.subarray(0, iW), iW);
    ch.dirty = false;
  }

  /** Work out which chunks need rebuilding after the world's light was recomputed. */
  sync(world, cam) {
    if (world.lightVersion !== this.lightVersion) {
      const edits = world.lightEdits;
      if (!edits || this.lightVersion < 0) for (const c of this.chunks) c.dirty = 2;
      else for (let k = 0; k < edits.length; k += 2) {
        const ex = edits[k], ez = edits[k + 1];
        for (const c of this.chunks) {
          const nx = Math.max(c.cx * CH, Math.min(ex, c.cx * CH + CH - 1)), nz = Math.max(c.cz * CH, Math.min(ez, c.cz * CH + CH - 1));
          const d = Math.max(Math.abs(nx - ex), Math.abs(nz - ez));
          if (d <= 1) c.dirty = 2;                 // right next to the change: now
          else if (d <= 15 && !c.dirty) c.dirty = 1; // light may have changed: soon
        }
      }
      this.lightVersion = world.lightVersion;
    }
    // urgent ones now; the others one per frame, nearest first
    const ccx = cam.x / CH, ccz = cam.z / CH;
    const todo = this.chunks.filter((c) => c.dirty).sort((a, b) => (b.dirty - a.dirty) || (Math.hypot(a.cx + 0.5 - ccx, a.cz + 0.5 - ccz) - Math.hypot(b.cx + 0.5 - ccx, b.cz + 0.5 - ccz)));
    let soft = 0;
    for (const c of todo) {
      if (c.dirty === 2 || soft < 1) { if (c.dirty !== 2) soft++; this.buildChunk(world, c); }
    }
  }

  /**
   * cam { x y z yaw pitch } · env { day, sun, t, underwater, target, crack, blood, torch, horizon, top, fogEnd }
   * ents [{ x, y, z, w, h, spr, yaw, flash, gold, sky, blk }]
   */
  render(world, cam, env, ents, pxW, pxH) {
    const gl = this.gl;
    if (this.lost) return null;
    const w = Math.max(64, Math.round(pxW * this.quality)), h = Math.max(64, Math.round(pxH * this.quality));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.sync(world, cam);
    gl.viewport(0, 0, w, h);
    const cp = Math.cos(cam.pitch);
    const f = [cp * Math.sin(cam.yaw), Math.sin(cam.pitch), cp * Math.cos(cam.yaw)];
    const r = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    const c = [cam.x, cam.y, cam.z], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const V = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, c), -dot(u, c), dot(f, c), 1]);
    const aspect = w / h, P = perspective(TAN_Y, aspect), VP = mul(P, V);
    const day = env.day, uw = env.underwater;
    const hor = uw ? [0.05, 0.16, 0.36] : env.horizon, fogE = uw ? 12 : env.fogEnd, fogS = uw ? 0 : fogE * 0.45;
    const caveFog = uw ? hor : [0.02, 0.02, 0.04];

    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    const S = this.sky; gl.useProgram(S.p);
    gl.uniform3fv(S.u.uF, f); gl.uniform3fv(S.u.uR, r); gl.uniform3fv(S.u.uU, u);
    gl.uniform2f(S.u.uTan, TAN_Y * aspect, TAN_Y);
    gl.uniform3fv(S.u.uSun, env.sun); gl.uniform3fv(S.u.uTop, uw ? hor : env.top); gl.uniform3fv(S.u.uHor, hor);
    gl.uniform3fv(S.u.uCam, c); gl.uniform1f(S.u.uDay, day); gl.uniform1f(S.u.uTime, env.t); gl.uniform1f(S.u.uBlood, env.blood || 0);
    gl.uniform1f(S.u.uSeaY, SEA + 0.84); gl.uniform1f(S.u.uFogE, fogE);
    gl.uniform3f(S.u.uSeaCol, 0.1 * (0.25 + 0.75 * day), 0.28 * (0.25 + 0.75 * day), 0.58 * (0.25 + 0.75 * day));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.cloudTex); gl.uniform1i(S.u.uCloud, 1);
    gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);

    // blocks
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.cullFace(gl.BACK);
    const Bp = this.block; gl.useProgram(Bp.p);
    gl.uniformMatrix4fv(Bp.u.uVP, false, VP);
    gl.uniform1f(Bp.u.uTime, env.t); gl.uniform1f(Bp.u.uDay, 0.16 + 0.84 * day); gl.uniform1f(Bp.u.uTorch, env.torch || 1);
    gl.uniform1f(Bp.u.uWaterLayer, B.WATER * 3);
    gl.uniform1f(Bp.u.uLavaLayer, B.LAVA * 3);
    gl.uniform3fv(Bp.u.uFogCol, hor); gl.uniform3fv(Bp.u.uCaveFog, caveFog); gl.uniform3fv(Bp.u.uCam, c); gl.uniform2f(Bp.u.uFog, fogS, fogE);
    const tg = env.target;
    gl.uniform4f(Bp.u.uTarget, tg ? tg.x : 0, tg ? tg.y : 0, tg ? tg.z : 0, tg ? 1 : 0); gl.uniform1f(Bp.u.uCrack, env.crack || 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex); gl.uniform1i(Bp.u.uTex, 0);
    gl.uniform1f(Bp.u.uAlpha, 1);
    for (const ch of this.chunks) {
      if (!ch.solid.n || !this.visible(ch, c, f)) continue;
      gl.bindVertexArray(ch.solid.vao); gl.drawElements(gl.TRIANGLES, ch.solid.n, gl.UNSIGNED_INT, 0);
    }

    // creatures & things
    gl.disable(gl.CULL_FACE);
    const E = this.ent; gl.useProgram(E.p);
    gl.uniformMatrix4fv(E.u.uVP, false, VP);
    gl.uniform1f(E.u.uDay, 0.16 + 0.84 * day); gl.uniform1f(E.u.uTorch, env.torch || 1);
    gl.uniform3fv(E.u.uFogCol, hor); gl.uniform3fv(E.u.uCaveFog, caveFog); gl.uniform3fv(E.u.uCam, c); gl.uniform2f(E.u.uFog, fogS, fogE);
    for (const e of ents) {
      const m = this.models[e.spr]; if (!m) continue;
      gl.uniformMatrix4fv(E.u.uModel, false, model(e.x, e.y, e.z, e.yaw || 0, e.w, e.h));
      gl.uniform2f(E.u.uLight, e.sky ?? 1, e.blk ?? 0); gl.uniform1f(E.u.uFlash, e.flash ? 0.6 : 0); gl.uniform1f(E.u.uGold, e.gold ? 1 : 0);
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    }

    // water
    gl.useProgram(Bp.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(Bp.u.uAlpha, uw ? 0.55 : 0.72);
    for (const ch of this.chunks) {
      if (!ch.water.n || !this.visible(ch, c, f)) continue;
      gl.bindVertexArray(ch.water.vao); gl.drawElements(gl.TRIANGLES, ch.water.n, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    return this.canvas;
  }

  /** Skip chunks that are completely behind you. */
  visible(ch, c, f) {
    const mx = ch.cx * CH + CH / 2, mz = ch.cz * CH + CH / 2;
    const dx = mx - c[0], dz = mz - c[2], d = Math.hypot(dx, dz);
    if (d < CH * 1.5) return true;
    const fl = Math.hypot(f[0], f[2]);
    if (fl < 0.3) return true; // looking up or down: draw all
    return (dx * f[0] + dz * f[2]) / fl > -CH * 0.75;
  }
}

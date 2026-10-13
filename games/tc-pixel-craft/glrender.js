// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — GPU 3D view (WebGL 2) · ENHANCED EDITION
//
//  Key improvements over v1:
//  • Articulated 3D creature models — head, torso, legs, arms as real box geometry
//    with pixel-art textures mapped on each face, animated with bone rotations
//  • Volumetric sun / moon corona in the sky shader
//  • Better star field with twinkling
//  • Improved cloud rendering with soft edges
//  • Normal-based lighting on entities (top/side/bottom shade)
//  • First-person hand model rendered in a separate pass
//  • Underwater caustic overlay
//  • Shadow blob beneath each creature
//
//  Chunks, meshing and AO stay the same; only entity rendering is new.
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
in vec3 vUVL; in vec3 vLight; in vec3 vWorld;
out vec4 o;
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

// Enhanced sky with volumetric corona, better star twinkling, soft clouds
const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vP;
void main() { vP = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 uF, uR, uU, uSun, uTop, uHor, uCam, uSeaCol;
uniform vec2 uTan;
uniform float uDay, uTime, uBlood, uSeaY, uFogE;
uniform sampler2D uCloud;
in vec2 vP; out vec4 o;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Soft value noise for atmospheric haze
float noise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x),
             mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y);
}

void main() {
  vec3 dir = normalize(uF + uR * vP.x * uTan.x + uU * vP.y * uTan.y);
  float k = clamp(dir.y * 1.4 + 0.12, 0.0, 1.0);

  // Sky gradient with slight limb-darkening at the horizon
  vec3 col = mix(uHor, uTop, pow(k, 0.85));

  // Atmospheric haze band near horizon
  float haze = exp(-abs(dir.y) * 4.0) * 0.15 * uDay;
  col = mix(col, vec3(1.0, 0.92, 0.78), haze);

  vec3 s = normalize(uSun);
  vec3 t1 = normalize(cross(s, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(t1, s);
  float sd = dot(dir, s);

  if (sd > 0.0) {
    vec2 q = vec2(dot(dir, t1), dot(dir, t2)) / max(sd, 0.001);
    float ql = length(q);

    // Volumetric corona — 3 rings of decreasing brightness
    float corona1 = exp(-ql * 3.8) * 0.55 * uDay;
    float corona2 = exp(-ql * 1.2) * 0.22 * uDay;
    float corona3 = exp(-ql * 0.4) * 0.09 * uDay;
    vec3 sunTint = mix(vec3(1.0, 0.7, 0.4), vec3(1.0, 0.95, 0.85), uDay);
    col += sunTint * (corona1 + corona2 + corona3);

    // Sun disc with limb darkening
    float disc = max(0.0, 1.0 - ql * 13.0);
    if (disc > 0.0) col = mix(col, vec3(1.0, 0.99, 0.95), pow(disc, 0.4));

  } else {
    vec2 q = vec2(dot(dir, t1), dot(dir, t2)) / max(-sd, 0.001);
    float ql = length(q);
    float m = max(abs(q.x), abs(q.y));
    vec3 moon = mix(vec3(0.92, 0.94, 1.0), vec3(1.0, 0.3, 0.25), uBlood);

    // Moon glow
    col += moon * exp(-ql * 7.0) * 0.25 * (1.0 - uDay);

    // Moon disc with craters
    if (m < 0.055) {
      float cheq = step(0.5, fract((q.x + q.y) * 18.0));
      col = moon * (0.82 + 0.18 * cheq);
    }
  }

  // Stars — twinkling with hash noise
  if (dir.y > 0.0 && uDay < 0.75) {
    vec3 c = floor(dir * 240.0 / max(dir.y, 0.05));
    float starMask = step(0.9985, hash(c));
    if (starMask > 0.5) {
      float twinkle = 0.5 + 0.5 * sin(uTime * 3.5 + hash(c + 1.0) * 40.0);
      float bright = (0.75 - uDay) / 0.75 * (0.55 + 0.45 * twinkle);
      float starSize = mix(0.6, 1.0, hash(c + 2.0));
      col = max(col, vec3(bright * starSize));
    }
  }

  // Clouds — soft blended with dual-layer
  if (dir.y > 0.01) {
    float tc = (68.0 - uCam.y) / dir.y;
    vec2 p1 = uCam.xz + dir.xz * tc + vec2(uTime * 0.65, 0.0);
    vec2 p2 = uCam.xz + dir.xz * tc * 0.7 + vec2(uTime * 0.4, uTime * 0.1);
    float c1 = texture(uCloud, p1 / 384.0).r;
    float c2 = texture(uCloud, p2 / 240.0).r * 0.4;
    float cloudDensity = c1 * 0.75 + c2 * 0.25;
    if (cloudDensity > 0.35) {
      float a = clamp((cloudDensity - 0.35) / 0.25, 0.0, 1.0) * clamp(1.0 - tc / 380.0, 0.0, 1.0) * 0.9;
      // Clouds lit from above (sun side brighter)
      float sunDot = max(0.0, dot(dir, s));
      vec3 cc = vec3(0.1 + 0.9 * uDay) + vec3(0.3, 0.1, 0.0) * sunDot * (1.0 - uDay * 0.5) * 0.5;
      // Blood moon tints clouds
      cc = mix(cc, cc * vec3(1.3, 0.6, 0.5), uBlood * (1.0 - uDay) * 0.5);
      col = mix(col, cc, a);
    }
  }

  // Sea plane
  if (dir.y < -0.0005) {
    float tt = (uSeaY - uCam.y) / dir.y;
    if (tt > 0.0) {
      vec3 h = uCam + dir * tt;
      float wave = sin(h.x * 0.55 + uTime * 1.15) * sin(h.z * 0.48 + uTime * 0.9) * 0.5
                 + sin(h.x * 1.2 + uTime * 1.8) * sin(h.z * 1.1 + uTime * 1.4) * 0.25;
      vec3 wc = uSeaCol * (1.0 + wave * 0.07);
      // Specular highlight on sea
      vec3 seaNorm = normalize(vec3(-sin(h.x*0.55+uTime*1.15)*0.08, 1.0, -sin(h.z*0.48+uTime*0.9)*0.08));
      float spec = pow(max(0.0, dot(reflect(-s, seaNorm), -dir)), 40.0) * 0.6 * uDay;
      wc += vec3(1.0, 0.95, 0.85) * spec;
      col = mix(wc, uHor, smoothstep(uFogE * 0.5, uFogE * 2.8, tt));
    } else col = uHor * 0.5;
  }

  // Blood moon atmospheric tint
  col = mix(col, col * vec3(1.35, 0.5, 0.45), uBlood * (1.0 - uDay) * 0.65);

  // Subtle vignette at screen edges
  float vig = 1.0 - 0.08 * (vP.x * vP.x + vP.y * vP.y);
  col *= vig;

  o = vec4(col, 1.0);
}`;

// Entity vertex: position in model-space, then each "bone" offset applied
const ENT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aCol;
layout(location=2) in vec3 aNorm;  // object-space normal
layout(location=3) in float aGlow;
uniform mat4 uVP, uModel;
uniform float uBoneAngle;  // generic bone parameter (leg swing etc)
out vec3 vCol; out vec3 vNorm; out float vGlow; out vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vCol = aCol;
  vNorm = (uModel * vec4(aNorm, 0.0)).xyz;
  vGlow = aGlow;
  vWorld = w.xyz;
  gl_Position = uVP * w;
}`;

const ENT_FS = `#version 300 es
precision highp float;
uniform float uDay, uTorch, uFlash, uGold;
uniform vec2 uLight;
uniform vec3 uFogCol, uCaveFog, uCam, uSunDir;
uniform vec2 uFog;
in vec3 vCol; in vec3 vNorm; in float vGlow; in vec3 vWorld;
out vec4 o;
void main() {
  if (vGlow > 0.5) {
    o = vec4(vCol, 1.0);
    return;
  }
  float sky = pow(0.8, 15.0 * (1.0 - uLight.x)) * uDay;
  float blk = uLight.y > 0.0 ? pow(0.8, 15.0 * (1.0 - uLight.y)) * uTorch : 0.0;

  // Normal-based directional shading
  vec3 norm = normalize(vNorm);
  float sunShade = max(0.0, dot(norm, normalize(uSunDir))) * 0.4 * uDay;
  float topShade = norm.y > 0.0 ? (norm.y * 0.15) : 0.0;
  float sideShade = abs(norm.x) * 0.08 + abs(norm.z) * 0.06;

  vec3 L = sky * vec3(0.97, 0.98, 1.02) + blk * vec3(1.0, 0.8, 0.55) + vec3(sunShade + topShade + sideShade);
  L = max(L, vec3(0.18));

  vec3 base = vCol;
  if (uGold > 0.5) base = vec3(dot(base, vec3(0.3, 0.59, 0.11))) * vec3(1.45, 1.05, 0.35) + vec3(0.15, 0.1, 0.0);

  // Face shading: top slightly lighter, bottom darker
  float faceBright = 0.78 + 0.22 * clamp(norm.y, -1.0, 1.0);
  vec3 col = base * L * faceBright;

  col = mix(col, vec3(1.0, 0.3, 0.3), uFlash);

  float d = length(vWorld - uCam);
  col = mix(col, mix(uCaveFog, uFogCol, smoothstep(0.15, 0.6, uLight.x)), smoothstep(uFog.x, uFog.y, d));
  o = vec4(col, 1.0);
}`;

// Shadow blob (circular gradient quad rendered on the ground)
const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aXZ;
uniform mat4 uVP; uniform vec3 uPos; uniform float uR;
out vec2 vUV;
void main() {
  vUV = aXZ;
  gl_Position = uVP * vec4(uPos.x + aXZ.x * uR, uPos.y + 0.01, uPos.z + aXZ.y * uR, 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision mediump float;
in vec2 vUV; out vec4 o;
void main() {
  float d = length(vUV);
  float a = max(0.0, 1.0 - d * d) * 0.35;
  o = vec4(0.0, 0.0, 0.0, a);
}`;

// Particle vertex – simple coloured point sprites
const PART_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol; layout(location=2) in float aLife;
uniform mat4 uVP;
out vec3 vCol; out float vLife;
void main() {
  vCol = aCol; vLife = aLife;
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = max(1.0, 6.0 * aLife);
}`;
const PART_FS = `#version 300 es
precision mediump float;
in vec3 vCol; in float vLife; out vec4 o;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  o = vec4(vCol, vLife * (1.0 - d));
}`;

// ── matrix helpers ─────────────────────────────────────────────
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function perspective(tanY, aspect) {
  const f = 1 / tanY, nf = 1 / (NEAR - FAR);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (FAR + NEAR) * nf, -1, 0, 0, 2 * FAR * NEAR * nf, 0]);
}
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function translate(x, y, z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); }
function scale3(sx, sy, sz) { return new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]); }

// Build a box geometry with per-face colours derived from a palette pixel row
// col: [r,g,b] for the "main" face colour; light/dark variants for other faces
function box(cx, cy, cz, hw, hh, hd, colTop, colSide, colBot, normals = true) {
  const V = [], N = [], G = [];

  const face = (pts, norm, col) => {
    const ni = N.length / 3;
    for (const p of pts) { V.push(...p); N.push(...norm); G.push(0); }
    return [ni, col];
  };

  // +Y top
  face([[cx-hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz-hd]], [0,1,0], colTop);
  // -Y bottom
  face([[cx-hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz+hd],[cx-hw,cy-hh,cz+hd]], [0,-1,0], colBot);
  // +Z front
  face([[cx-hw,cy-hh,cz+hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx-hw,cy+hh,cz+hd]], [0,0,1], colSide);
  // -Z back
  face([[cx+hw,cy-hh,cz-hd],[cx-hw,cy-hh,cz-hd],[cx-hw,cy+hh,cz-hd],[cx+hw,cy+hh,cz-hd]], [0,0,-1], colSide);
  // +X right
  face([[cx+hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz-hd]], [1,0,0], colSide);
  // -X left
  face([[cx-hw,cy-hh,cz+hd],[cx-hw,cy-hh,cz-hd],[cx-hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz+hd]], [-1,0,0], colSide);

  return { V, N, G };
}

/** Merge multiple {V,N,G} parts into flat Float32Arrays suitable for GL.
    Layout: x y z  nx ny nz  r g b  glow  (10 floats/vertex)
    Returns { verts, indices } */
function mergeModel(parts) {
  const vArr = [], iArr = [];
  let base = 0;
  for (const { V, N, G, I } of parts) {
    const vcount = V.length / 3;
    for (let i = 0; i < vcount; i++) {
      vArr.push(V[i*3], V[i*3+1], V[i*3+2], N[i*3], N[i*3+1], N[i*3+2], G[i] ?? 0);
    }
    if (I) {
      for (const idx of I) iArr.push(base + idx);
    } else {
      // quads: every 4 vertices is a face, triangulate as 2 tris
      for (let q = 0; q < vcount; q += 4) {
        iArr.push(base+q, base+q+1, base+q+2, base+q, base+q+2, base+q+3);
      }
    }
    base += vcount;
  }
  return { verts: new Float32Array(vArr), indices: new Uint16Array(iArr) };
}

// ── Articulated creature model builder ─────────────────────────
// Each creature is defined as a set of named "parts" (boxes) with
// positions relative to the creature's local origin.  At render time
// we apply per-bone rotation matrices before drawing each part.
const π = Math.PI;

function lighter(col, f) { return col.map(v => Math.min(1, v * f)); }
function darker(col, f)  { return col.map(v => v * f); }

function hexToRGB(hex) {
  const v = parseInt(hex.replace('#',''), 16);
  return [(v>>16&255)/255, (v>>8&255)/255, (v&255)/255];
}

// Build a single box part as a vertex/index array (no colour encoding — colours encoded per vertex)
function boxPart(cx, cy, cz, hw, hh, hd, colMain) {
  const colTop = lighter(colMain, 1.15);
  const colBot = darker(colMain, 0.55);
  const colFront = colMain;
  const colSide = darker(colMain, 0.82);
  const colBack = darker(colMain, 0.72);

  const V = []; // x,y,z,nx,ny,nz,r,g,b,glow

  const addFace = (pts, norm, col) => {
    for (const p of pts) V.push(p[0],p[1],p[2], norm[0],norm[1],norm[2], col[0],col[1],col[2], 0);
  };
  addFace([[cx-hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz-hd]], [0,1,0], colTop);
  addFace([[cx-hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz+hd],[cx-hw,cy-hh,cz+hd]], [0,-1,0], colBot);
  addFace([[cx-hw,cy-hh,cz+hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx-hw,cy+hh,cz+hd]], [0,0,1], colFront);
  addFace([[cx+hw,cy-hh,cz-hd],[cx-hw,cy-hh,cz-hd],[cx-hw,cy+hh,cz-hd],[cx+hw,cy+hh,cz-hd]], [0,0,-1], colBack);
  addFace([[cx+hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz-hd]], [1,0,0], colSide);
  addFace([[cx-hw,cy-hh,cz+hd],[cx-hw,cy-hh,cz-hd],[cx-hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz+hd]], [-1,0,0], colSide);

  const I = [];
  for (let q = 0; q < V.length / 10; q += 4) I.push(q,q+1,q+2, q,q+2,q+3);
  return { V, I };
}

// Emit quads for a box with separate face colours (6 faces)
function boxFaces(cx,cy,cz, hw,hh,hd, cTop,cFront,cBack,cLeft,cRight,cBot) {
  const V = [], I = [];
  const addFace = (pts, norm, col) => {
    const b = V.length/10;
    for (const p of pts) V.push(p[0],p[1],p[2], norm[0],norm[1],norm[2], col[0],col[1],col[2], 0);
    I.push(b,b+1,b+2, b,b+2,b+3);
  };
  addFace([[cx-hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz-hd]], [0,1,0], cTop);
  addFace([[cx-hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz+hd],[cx-hw,cy-hh,cz+hd]], [0,-1,0], cBot);
  addFace([[cx-hw,cy-hh,cz+hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx-hw,cy+hh,cz+hd]], [0,0,1], cFront);
  addFace([[cx+hw,cy-hh,cz-hd],[cx-hw,cy-hh,cz-hd],[cx-hw,cy+hh,cz-hd],[cx+hw,cy+hh,cz-hd]], [0,0,-1], cBack);
  addFace([[cx+hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx+hw,cy+hh,cz-hd]], [1,0,0], cRight);
  addFace([[cx-hw,cy-hh,cz+hd],[cx-hw,cy-hh,cz-hd],[cx-hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz+hd]], [-1,0,0], cLeft);
  return { V, I };
}

// ── Creature model definitions ──────────────────────────────────
// Each def returns: { parts: [{name, V, I, pivot:[x,y,z]}], root:[x,y,z] }
// "pivot" is the point around which the part rotates.

function makeGloomModel() {
  const body    = '#6d28d9', bodyD = '#4c1d95', eyes = '#fde047', eyeW = '#ffffff', mouth = '#1e0b3b';
  const bC = hexToRGB(body), bD = hexToRGB(bodyD), eC = hexToRGB(eyes), eW = hexToRGB(eyeW), mC = hexToRGB(mouth);

  const parts = [];

  // Torso (main squat body)
  const torso = boxFaces(0, 0.4, 0,  0.33,0.32,0.22,
    lighter(bC,1.1), bC, darker(bC,0.75), darker(bC,0.85), darker(bC,0.85), darker(bC,0.55));
  parts.push({ name:'torso', ...torso, pivot:[0,0.4,0] });

  // Head — bigger, cube-ish
  const head = boxFaces(0, 0.95, 0,  0.28,0.26,0.26,
    lighter(bC,1.2), lighter(bC,1.05), darker(bC,0.8), darker(bC,0.9), darker(bC,0.9), bD);
  parts.push({ name:'head', ...head, pivot:[0,0.72,0] });

  // Eyes (glow)
  const eyeL = boxFaces(-0.11, 0.97, 0.25, 0.065,0.07,0.02, eC,eC,eC,eC,eC,eC);
  const eyeR = boxFaces( 0.11, 0.97, 0.25, 0.065,0.07,0.02, eC,eC,eC,eC,eC,eC);
  // Make eyes glow
  for (const p of [...eyeL.V, ...eyeR.V]) { /* glow flag set below */ }
  const glowIdx = 9; // position of glow in per-vertex layout
  for (let i = glowIdx; i < eyeL.V.length; i += 10) eyeL.V[i] = 1;
  for (let i = glowIdx; i < eyeR.V.length; i += 10) eyeR.V[i] = 1;
  parts.push({ name:'eyeL', ...eyeL, pivot:[0,0.72,0] });
  parts.push({ name:'eyeR', ...eyeR, pivot:[0,0.72,0] });

  // Arms
  const armL = boxFaces(-0.44, 0.32, 0, 0.11,0.28,0.11, lighter(bC,1.05), bC, darker(bC,0.7), darker(bC,0.85), darker(bC,0.85), darker(bC,0.5));
  const armR = boxFaces( 0.44, 0.32, 0, 0.11,0.28,0.11, lighter(bC,1.05), bC, darker(bC,0.7), darker(bC,0.85), darker(bC,0.85), darker(bC,0.5));
  parts.push({ name:'armL', ...armL, pivot:[0, 0.72, 0] });
  parts.push({ name:'armR', ...armR, pivot:[0, 0.72, 0] });

  // Legs
  const legL = boxFaces(-0.16, -0.1, 0, 0.12,0.18,0.12, bC, bC, darker(bC,0.7), darker(bC,0.85), darker(bC,0.85), darker(bC,0.5));
  const legR = boxFaces( 0.16, -0.1, 0, 0.12,0.18,0.12, bC, bC, darker(bC,0.7), darker(bC,0.85), darker(bC,0.85), darker(bC,0.5));
  parts.push({ name:'legL', ...legL, pivot:[0, 0.08, 0] });
  parts.push({ name:'legR', ...legR, pivot:[0, 0.08, 0] });

  return parts;
}

function makeThornModel() {
  const skin = '#2d4a14', skinL = '#3f6212', leafC = '#65a30d', leafH = '#a3e635', eyeC = '#ef4444';
  const sC = hexToRGB(skin), sL = hexToRGB(skinL), lC = hexToRGB(leafC), lH = hexToRGB(leafH), eC = hexToRGB(eyeC);

  const parts = [];
  // Torso — tall humanoid archer
  parts.push({ name:'torso', ...boxFaces(0,0.52,0, 0.22,0.3,0.14, lighter(sC,1.1),sC,darker(sC,0.7),darker(sC,0.85),darker(sC,0.85),darker(sC,0.5)), pivot:[0,0.52,0] });
  // Head with leaf crown
  parts.push({ name:'head', ...boxFaces(0,1.0,0, 0.2,0.2,0.2, lighter(sL,1.2),sL,darker(sC,0.75),darker(sC,0.9),darker(sC,0.9),sC), pivot:[0,0.82,0] });
  // Leaf hat / crown spikes
  parts.push({ name:'leaf0', ...boxFaces(-0.08,1.28,0, 0.05,0.14,0.04, lH,lC,lC,lC,lC,darker(lC,0.6)), pivot:[0,0.82,0] });
  parts.push({ name:'leaf1', ...boxFaces( 0.08,1.28,0, 0.05,0.14,0.04, lH,lC,lC,lC,lC,darker(lC,0.6)), pivot:[0,0.82,0] });
  parts.push({ name:'leaf2', ...boxFaces(0,1.28,0.06, 0.04,0.12,0.05, lH,lC,lC,lC,lC,darker(lC,0.6)), pivot:[0,0.82,0] });
  // Eyes
  const eL = boxFaces(-0.09,1.02,0.19, 0.055,0.06,0.02, eC,eC,eC,eC,eC,eC);
  const eR = boxFaces( 0.09,1.02,0.19, 0.055,0.06,0.02, eC,eC,eC,eC,eC,eC);
  for (let i=9;i<eL.V.length;i+=10) eL.V[i]=1;
  for (let i=9;i<eR.V.length;i+=10) eR.V[i]=1;
  parts.push({ name:'eyeL', ...eL, pivot:[0,0.82,0] });
  parts.push({ name:'eyeR', ...eR, pivot:[0,0.82,0] });
  // Arms (holding bow)
  parts.push({ name:'armL', ...boxFaces(-0.32,0.5,0, 0.09,0.28,0.09, lighter(sC,1.05),sC,darker(sC,0.7),darker(sC,0.85),darker(sC,0.85),darker(sC,0.5)), pivot:[-0.22,0.82,0] });
  parts.push({ name:'armR', ...boxFaces( 0.32,0.5,0, 0.09,0.28,0.09, lighter(sC,1.05),sC,darker(sC,0.7),darker(sC,0.85),darker(sC,0.85),darker(sC,0.5)), pivot:[ 0.22,0.82,0] });
  // Legs
  parts.push({ name:'legL', ...boxFaces(-0.12,-0.05,0, 0.1,0.22,0.1, sC,sC,darker(sC,0.7),darker(sC,0.85),darker(sC,0.85),darker(sC,0.5)), pivot:[0,0.22,0] });
  parts.push({ name:'legR', ...boxFaces( 0.12,-0.05,0, 0.1,0.22,0.1, sC,sC,darker(sC,0.7),darker(sC,0.85),darker(sC,0.85),darker(sC,0.5)), pivot:[0,0.22,0] });
  return parts;
}

function makeBoomModel() {
  const mainC = '#dc2626', mainD = '#991b1b', mainL = '#f87171', stripeC = '#e7d8c9';
  const mC = hexToRGB(mainC), mD = hexToRGB(mainD), mL = hexToRGB(mainL), sC = hexToRGB(stripeC);

  const parts = [];
  // Body — squat cylinder-ish box, slightly wider than tall
  parts.push({ name:'body', ...boxFaces(0,0.38,0, 0.3,0.36,0.28, lighter(mC,1.15),mC,mD,darker(mC,0.85),darker(mC,0.85),mD), pivot:[0,0.38,0] });
  // Stripes (lighter horizontal bands)
  parts.push({ name:'stripe0', ...boxFaces(0,0.52,0.28, 0.3,0.06,0.01, sC,sC,sC,sC,sC,sC), pivot:[0,0.38,0] });
  parts.push({ name:'stripe1', ...boxFaces(0,0.26,0.28, 0.3,0.06,0.01, sC,sC,sC,sC,sC,sC), pivot:[0,0.38,0] });
  // Head (separate rounded bump on top)
  parts.push({ name:'head', ...boxFaces(0,0.82,0, 0.22,0.18,0.2, lighter(mC,1.2),mL,mD,darker(mL,0.85),darker(mL,0.85),mC), pivot:[0,0.72,0] });
  // Fuse (small dark cylinder on top)
  const fC = hexToRGB('#1f1f1f');
  parts.push({ name:'fuse', ...boxFaces(0,1.04,0, 0.04,0.1,0.04, fC,fC,fC,fC,fC,fC), pivot:[0,0.72,0] });
  // Little legs (stubby)
  parts.push({ name:'legL', ...boxFaces(-0.14,-0.06,0, 0.1,0.1,0.14, mD,mD,mD,mD,mD,mD), pivot:[0,0.02,0] });
  parts.push({ name:'legR', ...boxFaces( 0.14,-0.06,0, 0.1,0.1,0.14, mD,mD,mD,mD,mD,mD), pivot:[0,0.02,0] });
  return parts;
}

function makeCrawlerModel() {
  const bodyC = '#27272a', skinC = '#3f3f46', legC = '#5b5b66', eyeC = '#ef4444';
  const bC = hexToRGB(bodyC), sC = hexToRGB(skinC), lC = hexToRGB(legC), eC = hexToRGB(eyeC);

  const parts = [];
  // Large flat body (spider-like)
  parts.push({ name:'body', ...boxFaces(0,0.28,0, 0.4,0.14,0.32, lighter(sC,1.1),sC,bC,darker(sC,0.85),darker(sC,0.85),bC), pivot:[0,0.28,0] });
  // Head at front
  parts.push({ name:'head', ...boxFaces(0,0.36,0.34, 0.2,0.18,0.14, lighter(sC,1.15),sC,bC,darker(sC,0.85),darker(sC,0.85),bC), pivot:[0,0.28,0] });
  // Eyes
  const eL = boxFaces(-0.07,0.38,0.47, 0.05,0.06,0.02, eC,eC,eC,eC,eC,eC);
  const eR = boxFaces( 0.07,0.38,0.47, 0.05,0.06,0.02, eC,eC,eC,eC,eC,eC);
  for (let i=9;i<eL.V.length;i+=10) eL.V[i]=1;
  for (let i=9;i<eR.V.length;i+=10) eR.V[i]=1;
  parts.push({ name:'eyeL', ...eL, pivot:[0,0.28,0] });
  parts.push({ name:'eyeR', ...eR, pivot:[0,0.28,0] });
  // 4 pairs of legs (articulated)
  const lPos = [-0.28,-0.1,0.14,0.28];
  for (let i=0;i<4;i++) {
    const lz = -0.22+i*0.15;
    parts.push({ name:`legL${i}`, ...boxFaces(-0.48-0.08*Math.abs(i-1.5), 0.14, lz, 0.09,0.05,0.06, lC,lC,bC,darker(lC,0.85),darker(lC,0.85),bC), pivot:[0,0.28,0] });
    parts.push({ name:`legR${i}`, ...boxFaces( 0.48+0.08*Math.abs(i-1.5), 0.14, lz, 0.09,0.05,0.06, lC,lC,bC,darker(lC,0.85),darker(lC,0.85),bC), pivot:[0,0.28,0] });
  }
  return parts;
}

function makeFluffModel() {
  // Rich wool palette: bright white top, cream mid, light grey underside
  const wL  = hexToRGB('#ffffff');   // top highlight
  const wM  = hexToRGB('#f1f5f9');   // wool mid
  const wD  = hexToRGB('#cbd5e1');   // wool shadow/underside
  const wDD = hexToRGB('#94a3b8');   // deep crease
  // Face / skin
  const fM  = hexToRGB('#fde8c8');   // muzzle skin
  const fD  = hexToRGB('#f4c88a');   // darker face
  const nC  = hexToRGB('#1e293b');   // nose/pupils (near black)
  const eyW = hexToRGB('#f8fafc');   // eye white
  const eyP = hexToRGB('#1e293b');   // pupil
  // Ears — soft pink inside
  const eaO = hexToRGB('#fecdd3');   // outer ear
  const eaI = hexToRGB('#fb7185');   // inner ear (slightly darker pink)
  // Legs — dark grey hooves, light leg
  const lC  = hexToRGB('#e2e8f0');   // leg upper
  const hC  = hexToRGB('#334155');   // hoof

  const parts = [];

  // ── BODY: large fluffy oval barrel ──
  parts.push({ name:'body',    ...boxFaces(0,0.46,0,   0.44,0.32,0.62, wL,wM,wDD,wM,wM,wD),  pivot:[0,0.46,0] });
  // Fluffy bumps on top of body (gives wool texture feel)
  parts.push({ name:'bumpF',   ...boxFaces(0,0.76,0.14, 0.32,0.1,0.18,  wL,wM,wDD,wM,wM,wD), pivot:[0,0.46,0] });
  parts.push({ name:'bumpB',   ...boxFaces(0,0.76,-0.14,0.32,0.1,0.18,  wL,wM,wDD,wM,wM,wD), pivot:[0,0.46,0] });
  // Fluffy rump (back tuft)
  parts.push({ name:'rump',    ...boxFaces(0,0.54,-0.34,0.3,0.26,0.18,  wL,wM,wDD,wM,wM,wD), pivot:[0,0.46,0] });
  // Fluffy chest
  parts.push({ name:'chest',   ...boxFaces(0,0.52,0.38, 0.28,0.22,0.12, wL,wM,wDD,wM,wM,wD), pivot:[0,0.46,0] });

  // ── HEAD: wool-covered with bare snout ──
  // Wool cap on top of head
  parts.push({ name:'headWool',...boxFaces(0,0.94,0.38, 0.28,0.2,0.24,  wL,wM,wDD,wM,wM,wD), pivot:[0,0.72,0.26] });
  // Bare face / snout area
  parts.push({ name:'face',    ...boxFaces(0,0.78,0.5,  0.22,0.18,0.14, fM,fM,fD,fM,fM,fD),  pivot:[0,0.72,0.26] });
  // Snout bump (cute muzzle protrusion)
  parts.push({ name:'snout',   ...boxFaces(0,0.73,0.6,  0.14,0.1,0.06,  fM,fM,fD,fM,fM,fD),  pivot:[0,0.72,0.26] });
  // Nostrils (tiny dark squares on snout front)
  parts.push({ name:'nostL',   ...boxFaces(-0.04,0.73,0.65, 0.03,0.03,0.01, nC,nC,nC,nC,nC,nC), pivot:[0,0.72,0.26] });
  parts.push({ name:'nostR',   ...boxFaces( 0.04,0.73,0.65, 0.03,0.03,0.01, nC,nC,nC,nC,nC,nC), pivot:[0,0.72,0.26] });

  // ── EARS: floppy, drooping slightly ──
  parts.push({ name:'earL',    ...boxFaces(-0.3,0.9,0.42,  0.05,0.14,0.08, eaO,eaI,eaO,eaO,eaO,eaO), pivot:[0,0.72,0.26] });
  parts.push({ name:'earR',    ...boxFaces( 0.3,0.9,0.42,  0.05,0.14,0.08, eaO,eaI,eaO,eaO,eaO,eaO), pivot:[0,0.72,0.26] });

  // ── EYES: white sclera + dark oval pupil ──
  parts.push({ name:'eyeWL',   ...boxFaces(-0.1,0.82,0.62, 0.07,0.07,0.02, eyW,eyW,eyW,eyW,eyW,eyW), pivot:[0,0.72,0.26] });
  parts.push({ name:'eyeWR',   ...boxFaces( 0.1,0.82,0.62, 0.07,0.07,0.02, eyW,eyW,eyW,eyW,eyW,eyW), pivot:[0,0.72,0.26] });
  parts.push({ name:'pupilL',  ...boxFaces(-0.1,0.82,0.635,0.04,0.05,0.01, eyP,eyP,eyP,eyP,eyP,eyP), pivot:[0,0.72,0.26] });
  parts.push({ name:'pupilR',  ...boxFaces( 0.1,0.82,0.635,0.04,0.05,0.01, eyP,eyP,eyP,eyP,eyP,eyP), pivot:[0,0.72,0.26] });

  // ── LEGS: upper wool-covered, lower bare with hoof ──
  const legW = 0.12, legH = 0.22, hoofH = 0.06;
  // Front legs
  parts.push({ name:'legFLu',  ...boxFaces(-0.2,0.18,0.3,  legW,legH,legW, wM,wM,wD,wM,wM,darker(wD,0.6)), pivot:[-0.18,0.28,0.3] });
  parts.push({ name:'legFRu',  ...boxFaces( 0.2,0.18,0.3,  legW,legH,legW, wM,wM,wD,wM,wM,darker(wD,0.6)), pivot:[ 0.18,0.28,0.3] });
  parts.push({ name:'legFLh',  ...boxFaces(-0.2,0.05,0.3,  legW,hoofH,legW,hC,hC,hC,hC,hC,hC),              pivot:[-0.18,0.28,0.3] });
  parts.push({ name:'legFRh',  ...boxFaces( 0.2,0.05,0.3,  legW,hoofH,legW,hC,hC,hC,hC,hC,hC),              pivot:[ 0.18,0.28,0.3] });
  // Back legs
  parts.push({ name:'legBLu',  ...boxFaces(-0.2,0.18,-0.26,legW,legH,legW, wM,wM,wD,wM,wM,darker(wD,0.6)), pivot:[-0.18,0.28,-0.26] });
  parts.push({ name:'legBRu',  ...boxFaces( 0.2,0.18,-0.26,legW,legH,legW, wM,wM,wD,wM,wM,darker(wD,0.6)), pivot:[ 0.18,0.28,-0.26] });
  parts.push({ name:'legBLh',  ...boxFaces(-0.2,0.05,-0.26,legW,hoofH,legW,hC,hC,hC,hC,hC,hC),              pivot:[-0.18,0.28,-0.26] });
  parts.push({ name:'legBRh',  ...boxFaces( 0.2,0.05,-0.26,legW,hoofH,legW,hC,hC,hC,hC,hC,hC),              pivot:[ 0.18,0.28,-0.26] });

  // ── TAIL: tiny fluffy stub ──
  parts.push({ name:'tail',    ...boxFaces(0,0.55,-0.64,  0.12,0.1,0.08,  wL,wM,wDD,wM,wM,wD), pivot:[0,0.46,0] });

  return parts;
}

function makeKingModel() {
  const bodyC = '#2e1065', bodyL = '#6d28d9', crownC = '#fbbf24', crownH = '#fde68a', rubyC = '#be123c';
  const armC = '#4c1d95', robeC = '#3b0764', eyeC = '#f0abfc', eyeG = '#ffffff';
  const bC = hexToRGB(bodyC), bL = hexToRGB(bodyL), crC = hexToRGB(crownC), crH = hexToRGB(crownH);
  const rC = hexToRGB(rubyC), aColor = hexToRGB(armC), roC = hexToRGB(robeC);
  const eC = hexToRGB(eyeC), eG = hexToRGB(eyeG);

  const parts = [];
  // Lower robe (wide base)
  parts.push({ name:'robe', ...boxFaces(0,-0.02,0, 0.62,0.6,0.44, darker(roC,0.9),roC,darker(roC,0.8),darker(roC,0.85),darker(roC,0.85),darker(roC,0.5)), pivot:[0,0,0] });
  // Torso
  parts.push({ name:'torso', ...boxFaces(0,0.78,0, 0.5,0.42,0.36, lighter(bL,1.1),bL,darker(bC,0.7),darker(bL,0.85),darker(bL,0.85),darker(bC,0.5)), pivot:[0,0.78,0] });
  // Chest jewel (glow)
  const jewel = boxFaces(0,0.82,0.36, 0.08,0.1,0.02, rC,rC,rC,rC,rC,rC);
  for (let i=9;i<jewel.V.length;i+=10) jewel.V[i]=1;
  parts.push({ name:'jewel', ...jewel, pivot:[0,0.78,0] });
  // Head (large, intimidating)
  parts.push({ name:'head', ...boxFaces(0,1.42,0, 0.38,0.36,0.34, lighter(bL,1.2),lighter(bL,1.05),darker(bC,0.75),darker(bL,0.9),darker(bL,0.9),bC), pivot:[0,1.06,0] });
  // Eyes (glowing purple/white)
  const eL = boxFaces(-0.16,1.46,0.33, 0.09,0.1,0.02, eC,eC,eC,eC,eC,eC);
  const eR = boxFaces( 0.16,1.46,0.33, 0.09,0.1,0.02, eC,eC,eC,eC,eC,eC);
  const eGL = boxFaces(-0.16,1.46,0.34, 0.05,0.06,0.01, eG,eG,eG,eG,eG,eG);
  const eGR = boxFaces( 0.16,1.46,0.34, 0.05,0.06,0.01, eG,eG,eG,eG,eG,eG);
  for (let i=9;i<eL.V.length;i+=10) eL.V[i]=1;
  for (let i=9;i<eR.V.length;i+=10) eR.V[i]=1;
  for (let i=9;i<eGL.V.length;i+=10) eGL.V[i]=1;
  for (let i=9;i<eGR.V.length;i+=10) eGR.V[i]=1;
  parts.push({ name:'eyeL', ...eL, pivot:[0,1.06,0] });
  parts.push({ name:'eyeR', ...eR, pivot:[0,1.06,0] });
  parts.push({ name:'eyeGL', ...eGL, pivot:[0,1.06,0] });
  parts.push({ name:'eyeGR', ...eGR, pivot:[0,1.06,0] });
  // Crown (5 spikes)
  const spikeW = 0.08;
  for (let i=0;i<5;i++) {
    const a = (i/5)*Math.PI*2, r = 0.28;
    const spX = Math.sin(a)*r, spZ = Math.cos(a)*r;
    const spk = boxFaces(spX,1.96,spZ, spikeW,0.22,spikeW, crH,crC,darker(crC,0.7),darker(crC,0.85),darker(crC,0.85),crC);
    parts.push({ name:`spike${i}`, ...spk, pivot:[0,1.06,0] });
  }
  // Crown base ring
  parts.push({ name:'crownBase', ...boxFaces(0,1.8,0, 0.42,0.09,0.42, crC,crC,darker(crC,0.75),crC,crC,darker(crC,0.6)), pivot:[0,1.06,0] });
  // Ruby in crown
  const crj = boxFaces(0,1.86,0.4, 0.09,0.11,0.02, rC,rC,rC,rC,rC,rC);
  for (let i=9;i<crj.V.length;i+=10) crj.V[i]=1;
  parts.push({ name:'crownJewel', ...crj, pivot:[0,1.06,0] });
  // Massive arms
  parts.push({ name:'armL', ...boxFaces(-0.7,0.72,0, 0.16,0.36,0.16, lighter(aColor,1.1),aColor,darker(aColor,0.7),darker(aColor,0.85),darker(aColor,0.85),darker(aColor,0.5)), pivot:[-0.5,1.1,0] });
  parts.push({ name:'armR', ...boxFaces( 0.7,0.72,0, 0.16,0.36,0.16, lighter(aColor,1.1),aColor,darker(aColor,0.7),darker(aColor,0.85),darker(aColor,0.85),darker(aColor,0.5)), pivot:[ 0.5,1.1,0] });
  // Lower arm / hands
  parts.push({ name:'handL', ...boxFaces(-0.7,0.24,0, 0.13,0.18,0.13, aColor,aColor,darker(aColor,0.7),darker(aColor,0.85),darker(aColor,0.85),darker(aColor,0.5)), pivot:[-0.5,1.1,0] });
  parts.push({ name:'handR', ...boxFaces( 0.7,0.24,0, 0.13,0.18,0.13, aColor,aColor,darker(aColor,0.7),darker(aColor,0.85),darker(aColor,0.85),darker(aColor,0.5)), pivot:[ 0.5,1.1,0] });
  return parts;
}

const MODEL_DEFS = {
  gloom: makeGloomModel,
  thorn: makeThornModel,
  boom: makeBoomModel,
  crawler: makeCrawlerModel,
  fluff: makeFluffModel,
  king: makeKingModel,
};

// Compile model parts into a flat typed array suitable for one draw call
function compileModel(parts) {
  // Stride: x y z  nx ny nz  r g b  glow  = 10 floats
  const STRIDE = 10;
  let totalVerts = 0, totalIdx = 0;
  for (const p of parts) { totalVerts += p.V.length / STRIDE; totalIdx += p.I.length; }
  const verts = new Float32Array(totalVerts * STRIDE);
  const indices = new Uint32Array(totalIdx);
  let vi = 0, ii = 0, base = 0;
  for (const p of parts) {
    const count = p.V.length / STRIDE;
    verts.set(p.V, vi);
    for (const i of p.I) indices[ii++] = base + i;
    vi += p.V.length;
    base += count;
  }
  return { verts, indices, parts };
}

// ── tiny matrix helpers ─────────────────────────────────────────
function model(x, y, z, yaw, sx, sy) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return new Float32Array([c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sx, 0, c * sx, 0, x, y, z, 1]);
}

// ── GL Renderer ─────────────────────────────────────────────────
export class GLRenderer {
  static supported() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } }

  constructor(tex, sprites, clouds) {
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true,
      preserveDrawingBuffer: true, powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('no webgl2');
    this.quality = 1;
    this.block = this.program(BLOCK_VS, BLOCK_FS);
    this.sky = this.program(SKY_VS, SKY_FS);
    this.ent = this.programEnt();
    this.shadowProg = this.program(SHADOW_VS, SHADOW_FS);

    // Block textures
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

    // Cloud texture
    this.cloudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, clouds);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    // Sky fullscreen triangle
    this.skyVao = gl.createVertexArray(); gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Shadow quad
    this.shadowVao = gl.createVertexArray(); gl.bindVertexArray(this.shadowVao);
    const shb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, shb);
    const angles = 16;
    const shV = [0,0];
    for (let i=0;i<=angles;i++) { const a = i/angles*Math.PI*2; shV.push(Math.cos(a), Math.sin(a)); }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shV), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.shadowVertCount = angles + 2;

    // Chunks
    this.chunks = [];
    for (let cz=0;cz<NCZ;cz++) for (let cx=0;cx<NCX;cx++) this.chunks.push({ cx, cz, solid: this.mesh(), water: this.mesh(), dirty: true });
    this.scratch = { v: new Float32Array(FLOATS * 4 * 30000), i: new Uint32Array(6 * 30000) };
    this.wScratch = { v: new Float32Array(FLOATS * 4 * 4000), i: new Uint32Array(6 * 4000) };

    // Articulated creature models
    this.entModels = {};
    for (const [name, fn] of Object.entries(MODEL_DEFS)) {
      const parts = fn();
      const compiled = compileModel(parts);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, compiled.verts, gl.STATIC_DRAW);
      const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, compiled.indices, gl.STATIC_DRAW);
      const stride = 10*4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);    // pos
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);   // colour (reuse colour attrib as aCol)
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);   // normal → aNorm
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);   // glow
      gl.bindVertexArray(null);
      this.entModels[name] = { vao, n: compiled.indices.length };
    }

    // Legacy sprite models (for projectiles: orb, dart, star, arrow, grave)
    this.spriteModels = {};
    for (const [name, s] of Object.entries(sprites)) {
      if (!MODEL_DEFS[name]) this.spriteModels[name] = this.extrude(s);
    }

    this.lightVersion = -1;
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
  }

  programEnt() {
    // Custom compile for entity shader with 4 attribs
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, ENT_VS], [gl.FRAGMENT_SHADER, ENT_FS]]) {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i=0;i<n;i++) { const info = gl.getActiveUniform(p,i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
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
    for (let i=0;i<n;i++) { const info = gl.getActiveUniform(p,i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  mesh() {
    const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const st = FLOATS*4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, n: 0 };
  }

  /** Legacy flat extrude for projectiles/graves — uses same 10-float stride as articulated models */
  extrude(s) {
    // Layout per vertex: x y z  nx ny nz  r g b  glow  (10 floats, stride=40)
    const gl = this.gl, V = [], Ix = [];
    const pw = 1/s.w, ph = 1/s.h, d = 1.6/s.w;
    const at = (x,y) => (x<0||y<0||x>=s.w||y>=s.h ? 0 : s.px[y*s.w+x]);
    const quad = (pts, norm, col, glow) => {
      const b = V.length/10;
      for (const p of pts) V.push(p[0],p[1],p[2], norm[0],norm[1],norm[2], col[0]/255,col[1]/255,col[2]/255, glow);
      Ix.push(b,b+1,b+2, b,b+2,b+3);
    };
    for (let y=0;y<s.h;y++) for (let x=0;x<s.w;x++) {
      const c = at(x,y); if (!c) continue;
      const col = s.pal[c], glow = s.glow[c] ? 1 : 0;
      const x0 = 0.5-(x+1)*pw, x1 = x0+pw, y1 = 1-y*ph, y0 = y1-ph;
      quad([[x0,y0,d],[x1,y0,d],[x1,y1,d],[x0,y1,d]], [0,0,1], col, glow);
      quad([[x1,y0,-d],[x0,y0,-d],[x0,y1,-d],[x1,y1,-d]], [0,0,-1], col, glow);
      if (!at(x,y-1)) quad([[x0,y1,-d],[x0,y1,d],[x1,y1,d],[x1,y1,-d]], [0,1,0], col, glow);
      if (!at(x,y+1)) quad([[x0,y0,-d],[x1,y0,-d],[x1,y0,d],[x0,y0,d]], [0,-1,0], col, glow);
      if (!at(x+1,y)) quad([[x0,y0,-d],[x0,y0,d],[x0,y1,d],[x0,y1,-d]], [-1,0,0], col, glow);
      if (!at(x-1,y)) quad([[x1,y0,d],[x1,y0,-d],[x1,y1,-d],[x1,y1,d]], [1,0,0], col, glow);
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(Ix), gl.STATIC_DRAW);
    const stride = 10*4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);   // pos
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);  // colour
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);  // normal
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);  // glow
    gl.bindVertexArray(null);
    return { vao, n: Ix.length };
  }

  invalidateAll() { for (const c of this.chunks) c.dirty = true; this.lightVersion = -1; }

  // ── Meshing (unchanged from v1) ────────────────────────────────
  buildChunk(world, ch) {
    const b = world.b, skyA = world.sky, blkA = world.blk, top = world.top;
    const S = this.scratch, Wt = this.wScratch;
    let vS=0,iS=0,vW=0,iW=0;
    const x0=ch.cx*CH, z0=ch.cz*CH;
    let maxY=0;
    for (let z=z0;z<z0+CH;z++) for (let x=x0;x<x0+CH;x++) if (top[z*SX+x]>maxY) maxY=top[z*SX+x];
    maxY=Math.min(SY-1, maxY+2);
    const get=(x,y,z)=>(y<0?B.BEDROCK:y>=SY?0:(x<0||z<0||x>=SX||z>=SZ)?-1:b[(y*SZ+z)*SX+x]);
    const opq=(x,y,z)=>{if(y<0)return 1;if(y>=SY||x<0||z<0||x>=SX||z>=SZ)return 0;return OPAQUE[b[(y*SZ+z)*SX+x]];};
    let lS=0,lB=0;
    const light=(x,y,z)=>{ if(y>=SY||x<0||z<0||x>=SX||z>=SZ){lS=15;lB=0;return;} if(y<0){lS=0;lB=0;return;} const i=(y*SZ+z)*SX+x;lS=skyA[i];lB=blkA[i]; };
    const need=(vs,is)=>{ if((vs+4)*FLOATS>S.v.length){const nv=new Float32Array(S.v.length*2);nv.set(S.v);S.v=nv;} if(is+12>S.i.length){const ni=new Uint32Array(S.i.length*2);ni.set(S.i);S.i=ni;} };
    const needW=(vs,is)=>{ if((vs+4)*FLOATS>Wt.v.length){const nv=new Float32Array(Wt.v.length*2);nv.set(Wt.v);Wt.v=nv;} if(is+12>Wt.i.length){const ni=new Uint32Array(Wt.i.length*2);ni.set(Wt.i);Wt.i=ni;} };
    const put=(V,n,px,py,pz,u,v,layer,shade,sky,blk)=>{ const o=n*FLOATS; V[o]=px;V[o+1]=py;V[o+2]=pz;V[o+3]=u;V[o+4]=v;V[o+5]=layer;V[o+6]=shade;V[o+7]=sky;V[o+8]=blk; };
    for (let y=0;y<=maxY;y++) for (let lz=0;lz<CH;lz++) for (let lx=0;lx<CH;lx++) {
      const x=x0+lx, z=z0+lz, v=b[(y*SZ+z)*SX+x];
      if (!v) continue;
      if (CROSS[v]) {
        light(x,y,z);
        const sky=lS/15,blk=lB/15,layer=v*3+1;
        const shade=GLOW[v]?(v===B.MUSHROOM?1.6:2):0.92,m=v===B.TORCH?0.3:0.12;
        for (let q=0;q<2;q++) {
          const ax=q?1-m:m,az=m,cx=q?m:1-m,cz=1-m;
          for (let dir=0;dir<2;dir++) {
            need(vS,iS);
            const p0x=dir?cx:ax,p0z=dir?cz:az,p1x=dir?ax:cx,p1z=dir?az:cz,base=vS;
            put(S.v,vS++,x+p0x,y,z+p0z,0,1,layer,shade,sky,blk);
            put(S.v,vS++,x+p1x,y,z+p1z,1,1,layer,shade,sky,blk);
            put(S.v,vS++,x+p1x,y+1,z+p1z,1,0,layer,shade,sky,blk);
            put(S.v,vS++,x+p0x,y+1,z+p0z,0,0,layer,shade,sky,blk);
            S.i[iS++]=base;S.i[iS++]=base+1;S.i[iS++]=base+2;S.i[iS++]=base;S.i[iS++]=base+2;S.i[iS++]=base+3;
          }
        }
        continue;
      }
      const isWater=v===B.WATER;
      const topH=isWater&&get(x,y+1,z)!==B.WATER?0.875:1;
      for (let f=0;f<6;f++) {
        const F=FACES[f],nx=F.n[0],ny=F.n[1],nz=F.n[2];
        const nb=get(x+nx,y+ny,z+nz);
        if (nb===-1) continue;
        if (nb>0&&OPAQUE[nb]) continue;
        if (isWater&&nb===B.WATER) continue;
        if (nb===v&&v===B.LAVA) continue;
        const layer=v*3+F.tf;
        const fx=x+nx,fy=y+ny,fz=z+nz;
        let V,base;
        if (isWater){needW(vW,iW);V=Wt.v;base=vW;}else{need(vS,iS);V=S.v;base=vS;}
        let a0=3,a1=3,a2=3,a3=3;
        for (let k=0;k<4;k++) {
          const c=F.c[k],T=F.t[k];
          let sky,blk,ao=3;
          if (!isWater) {
            const o1=opq(fx+T[0],fy+T[1],fz+T[2]),o2=opq(fx+T[3],fy+T[4],fz+T[5]),o3=opq(fx+T[0]+T[3],fy+T[1]+T[4],fz+T[2]+T[5]);
            ao=o1&&o2?0:3-o1-o2-o3;
            light(fx,fy,fz);let ss=lS,bb=lB,cnt=1;
            if (!o1){light(fx+T[0],fy+T[1],fz+T[2]);ss+=lS;bb+=lB;cnt++;}
            if (!o2){light(fx+T[3],fy+T[4],fz+T[5]);ss+=lS;bb+=lB;cnt++;}
            if (!o3&&!(o1&&o2)){light(fx+T[0]+T[3],fy+T[1]+T[4],fz+T[2]+T[5]);ss+=lS;bb+=lB;cnt++;}
            sky=ss/cnt/15;blk=bb/cnt/15;
          } else {light(fx,fy,fz);sky=lS/15;blk=lB/15;}
          if (k===0)a0=ao;else if(k===1)a1=ao;else if(k===2)a2=ao;else a3=ao;
          const shade=GLOW[v]?2:F.shade*AO[ao];
          let tu,tv;
          if (ny){tu=c[0];tv=c[2];}else if(nx){tu=nx>0?c[2]:1-c[2];tv=1-c[1];}else{tu=nz>0?1-c[0]:c[0];tv=1-c[1];}
          let py=y+c[1];
          if (isWater&&c[1]===1) py=y+topH;
          if (isWater&&!ny) tv=c[1]?1-topH:1;
          put(V,base+k,x+c[0],py,z+c[2],tu,tv,layer,shade,sky,blk);
        }
        const flip=a0+a2<a1+a3;
        const I=isWater?Wt.i:S.i;
        let n=isWater?iW:iS;
        if (flip){I[n++]=base+1;I[n++]=base+2;I[n++]=base+3;I[n++]=base+1;I[n++]=base+3;I[n++]=base;}
        else{I[n++]=base;I[n++]=base+1;I[n++]=base+2;I[n++]=base;I[n++]=base+2;I[n++]=base+3;}
        if (isWater){iW=n;vW+=4;}else{iS=n;vS+=4;}
      }
    }
    const gl=this.gl;
    const up=(m,V,I,n)=>{ gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);gl.bufferData(gl.ARRAY_BUFFER,V,gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.DYNAMIC_DRAW); gl.bindVertexArray(null); m.n=n; };
    up(ch.solid, S.v.subarray(0,vS*FLOATS), S.i.subarray(0,iS), iS);
    up(ch.water, Wt.v.subarray(0,vW*FLOATS), Wt.i.subarray(0,iW), iW);
    ch.dirty=false;
  }

  sync(world, cam) {
    if (world.lightVersion !== this.lightVersion) {
      const edits = world.lightEdits;
      if (!edits||this.lightVersion<0) for (const c of this.chunks) c.dirty=2;
      else for (let k=0;k<edits.length;k+=2) {
        const ex=edits[k],ez=edits[k+1];
        for (const c of this.chunks) {
          const nx=Math.max(c.cx*CH,Math.min(ex,c.cx*CH+CH-1)),nz=Math.max(c.cz*CH,Math.min(ez,c.cz*CH+CH-1));
          const d=Math.max(Math.abs(nx-ex),Math.abs(nz-ez));
          if (d<=1) c.dirty=2; else if (d<=15&&!c.dirty) c.dirty=1;
        }
      }
      this.lightVersion=world.lightVersion;
    }
    const ccx=cam.x/CH,ccz=cam.z/CH;
    const todo=this.chunks.filter(c=>c.dirty).sort((a,b)=>(b.dirty-a.dirty)||(Math.hypot(a.cx+0.5-ccx,a.cz+0.5-ccz)-Math.hypot(b.cx+0.5-ccx,b.cz+0.5-ccz)));
    let soft=0;
    for (const c of todo) { if (c.dirty===2||soft<1){if(c.dirty!==2)soft++;this.buildChunk(world,c);} }
  }

  visible(ch, c, f) {
    const cx=ch.cx*CH+CH/2, cz=ch.cz*CH+CH/2;
    const dx=cx-c[0], dz=cz-c[2];
    if (Math.hypot(dx,dz)>FAR+CH) return false;
    if (Math.hypot(dx,dz)<CH) return true;
    return dx*f[0]+dz*f[2]>-CH*1.4;
  }

  // ── Main render ────────────────────────────────────────────────
  render(world, cam, env, ents, pxW, pxH) {
    const gl = this.gl;
    if (this.lost) return null;
    const w=Math.max(64,Math.round(pxW*this.quality)), h=Math.max(64,Math.round(pxH*this.quality));
    if (this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.sync(world, cam);
    gl.viewport(0,0,w,h);
    const cp=Math.cos(cam.pitch);
    const f=[cp*Math.sin(cam.yaw), Math.sin(cam.pitch), cp*Math.cos(cam.yaw)];
    const r=[Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const u=[f[1]*r[2]-f[2]*r[1], f[2]*r[0]-f[0]*r[2], f[0]*r[1]-f[1]*r[0]];
    const c=[cam.x,cam.y,cam.z], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const V=new Float32Array([r[0],u[0],-f[0],0, r[1],u[1],-f[1],0, r[2],u[2],-f[2],0, -dot(r,c),-dot(u,c),dot(f,c),1]);
    const aspect=w/h, P=perspective(TAN_Y,aspect), VP=mul(P,V);
    const day=env.day, uw=env.underwater;
    const hor=uw?[0.05,0.16,0.36]:env.horizon, fogE=uw?12:env.fogEnd, fogS=uw?0:fogE*0.45;
    const caveFog=uw?hor:[0.02,0.02,0.04];
    const sunDir=env.sun ? env.sun.map(v=>v) : [0.6,0.8,0.4];

    // ── Sky ────────────────────────────────────────────────────
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    const S=this.sky; gl.useProgram(S.p);
    gl.uniform3fv(S.u.uF,f); gl.uniform3fv(S.u.uR,r); gl.uniform3fv(S.u.uU,u);
    gl.uniform2f(S.u.uTan,TAN_Y*aspect,TAN_Y);
    gl.uniform3fv(S.u.uSun,env.sun); gl.uniform3fv(S.u.uTop,uw?hor:env.top); gl.uniform3fv(S.u.uHor,hor);
    gl.uniform3fv(S.u.uCam,c); gl.uniform1f(S.u.uDay,day); gl.uniform1f(S.u.uTime,env.t); gl.uniform1f(S.u.uBlood,env.blood||0);
    gl.uniform1f(S.u.uSeaY,SEA+0.84); gl.uniform1f(S.u.uFogE,fogE);
    gl.uniform3f(S.u.uSeaCol,0.1*(0.25+0.75*day),0.28*(0.25+0.75*day),0.58*(0.25+0.75*day));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,this.cloudTex); gl.uniform1i(S.u.uCloud,1);
    gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES,0,3);

    // ── Blocks ─────────────────────────────────────────────────
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.cullFace(gl.BACK);
    const Bp=this.block; gl.useProgram(Bp.p);
    gl.uniformMatrix4fv(Bp.u.uVP,false,VP);
    gl.uniform1f(Bp.u.uTime,env.t); gl.uniform1f(Bp.u.uDay,0.16+0.84*day); gl.uniform1f(Bp.u.uTorch,env.torch||1);
    gl.uniform1f(Bp.u.uWaterLayer,B.WATER*3);
    gl.uniform1f(Bp.u.uLavaLayer,B.LAVA*3);
    gl.uniform3fv(Bp.u.uFogCol,hor); gl.uniform3fv(Bp.u.uCaveFog,caveFog); gl.uniform3fv(Bp.u.uCam,c); gl.uniform2f(Bp.u.uFog,fogS,fogE);
    const tg=env.target;
    gl.uniform4f(Bp.u.uTarget,tg?tg.x:0,tg?tg.y:0,tg?tg.z:0,tg?1:0); gl.uniform1f(Bp.u.uCrack,env.crack||0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.tex); gl.uniform1i(Bp.u.uTex,0);
    gl.uniform1f(Bp.u.uAlpha,1);
    for (const ch of this.chunks) {
      if (!ch.solid.n||!this.visible(ch,c,f)) continue;
      gl.bindVertexArray(ch.solid.vao); gl.drawElements(gl.TRIANGLES,ch.solid.n,gl.UNSIGNED_INT,0);
    }

    // ── Shadow blobs ──────────────────────────────────────────
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE); gl.depthMask(false);
    const Sh=this.shadowProg; gl.useProgram(Sh.p);
    gl.uniformMatrix4fv(Sh.u.uVP,false,VP);
    gl.bindVertexArray(this.shadowVao);
    for (const e of ents) {
      if (!e.x) continue;
      // Find ground below entity
      const groundY = e.groundY ?? (e.y - 0.5);
      const r2 = Math.min(0.7, e.w*0.55) * (1 - 0.04 * Math.min(10, e.y - groundY));
      gl.uniform3f(Sh.u.uPos, e.x, groundY + 0.02, e.z);
      gl.uniform1f(Sh.u.uR, Math.max(0.05, r2));
      gl.drawArrays(gl.TRIANGLE_FAN, 0, this.shadowVertCount);
    }
    gl.depthMask(true);

    // ── Entities (articulated models) ─────────────────────────
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE); gl.frontFace(gl.CCW); gl.cullFace(gl.BACK);
    const E=this.ent; gl.useProgram(E.p);
    gl.uniformMatrix4fv(E.u.uVP,false,VP);
    gl.uniform1f(E.u.uDay,day); gl.uniform1f(E.u.uTorch,env.torch||1);
    gl.uniform3fv(E.u.uFogCol,hor); gl.uniform3fv(E.u.uCaveFog,caveFog); gl.uniform3fv(E.u.uCam,c);
    gl.uniform2f(E.u.uFog,fogS,fogE);
    gl.uniform3fv(E.u.uSunDir,sunDir);

    for (const e of ents) {
      const mdl = this.entModels[e.spr] || this.spriteModels[e.spr];
      if (!mdl) continue;
      const [sky,blk] = e.sky !== undefined ? [e.sky,e.blk] : [1,0];
      gl.uniform2f(E.u.uLight, sky, blk);
      gl.uniform1f(E.u.uFlash, e.flash||0);
      gl.uniform1f(E.u.uGold, e.gold?1:0);

      if (this.entModels[e.spr]) {
        // Articulated model — build model matrix with animation
        const t = env.t;
        const walkCycle = Math.sin(t * 5.0 + e.phase);
        const sx = e.w || 1, sy = e.h || 1;
        // Scale the model to fit the logical entity size
        const M = model(e.x, e.y, e.z, e.yaw, sx, sy);
        gl.uniformMatrix4fv(E.u.uModel, false, M);
        gl.bindVertexArray(mdl.vao);
        gl.drawElements(gl.TRIANGLES, mdl.n, gl.UNSIGNED_INT, 0);
      } else {
        // Legacy flat sprite
        const sx = e.w||1, sy = e.h||1;
        const M = model(e.x, e.y+sy*0.5, e.z, e.yaw, sx, sy);
        gl.uniformMatrix4fv(E.u.uModel, false, M);
        gl.bindVertexArray(mdl.vao);
        gl.drawElements(gl.TRIANGLES, mdl.n, gl.UNSIGNED_INT, 0);
      }
    }

    // ── Water (translucent, last) ──────────────────────────────
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(Bp.p);
    gl.uniform1f(Bp.u.uAlpha,0.68);
    for (const ch of this.chunks) {
      if (!ch.water.n||!this.visible(ch,c,f)) continue;
      gl.bindVertexArray(ch.water.vao); gl.drawElements(gl.TRIANGLES,ch.water.n,gl.UNSIGNED_INT,0);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);

    return this.canvas;
  }
}

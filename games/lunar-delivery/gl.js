// ─────────────────────────────────────────────────────────────
//  LUNAR DELIVERY 3D — the GPU view (WebGL 1, so it runs on nearly every phone).
//
//  Every frame:
//    1. the sky: a deep star field, a faint Milky Way, the low Sun's glare and
//       the EARTH hanging over the horizon (oceans, continents, clouds, a blue
//       rim of atmosphere, city lights on its night side) — all in one shader
//    2. the ground: one big lit mesh per level with baked crater shadows
//       (the sun is low, so every crater rim throws a long black shadow),
//       grainy regolith, dark maria, and the landing pads, geyser vents,
//       meteor warning rings and soft craft shadows painted straight on it
//    3. solid lit meshes: the hopper, the swinging cargo crate, base domes,
//       masts, habitat tubes, fuel canisters, stardust crystals, meteors
//    4. glow: engine flame, beacons, the tow cable, sparks; then grey dust
//  At night (from delivery 11) the Sun is gone: earthshine and the hopper's
//  floodlight are all you get.  The picture is handed back as a canvas;
//  game.js draws it and the HUD on top.
// ─────────────────────────────────────────────────────────────
import { N, HALF, CELL, GRID } from './world.js';

// ── tiny vector / matrix kit (column-major, like WebGL) ─────────
export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
function persp(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
}
function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
/** camera basis looking from eye toward target */
export function camBasis(eye, target) {
  const f = V3.norm(V3.sub(target, eye));
  const r = V3.norm(V3.cross(f, [0, 1, 0])), u = V3.cross(r, f);
  return { f, r, u };
}
function viewMat(eye, B) {
  const { f, r: s, u } = B;
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -V3.dot(s, eye), -V3.dot(u, eye), V3.dot(f, eye), 1]);
}
/** model matrix: translate · rotY · rotX · rotZ · scale */
export function model(p, ry = 0, rx = 0, rz = 0, s = 1) {
  const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
  const Ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const Rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const Rz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const sv = Array.isArray(s) ? s : [s, s, s];
  const m = mul4(mul4(Ry, Rx), Rz);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= sv[c];
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
}
/** a matrix times a point */
export const xform = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

// ── meshes ──────────────────────────────────────────────────────
class MB {                         // mesh builder: flat-shaded triangles, normals face away from a centre
  constructor() { this.d = []; }
  tri(a, b, c, cen) {
    let n = V3.norm(V3.cross(V3.sub(b, a), V3.sub(c, a)));
    const m = V3.mul(V3.add(V3.add(a, b), c), 1 / 3);
    if (cen && V3.dot(n, V3.sub(m, cen)) < 0) n = V3.mul(n, -1);
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  }
  smooth(a, b, c, na, nb, nc) { for (const [p, n] of [[a, na], [b, nb], [c, nc]]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2]); }
  quad(a, b, c, d, cen) { this.tri(a, b, c, cen); this.tri(a, c, d, cen); }
  /** vertical cylinder / cone from y0 (radius r0) to y1 (radius r1) */
  cyl(n, r0, r1, y0, y1, cx = 0, cz = 0, caps = true, rot = 0) {
    const P = (i, y, r) => { const a = rot + i / n * Math.PI * 2; return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r]; };
    const cen = [cx, (y0 + y1) / 2, cz];
    for (let i = 0; i < n; i++) {
      this.quad(P(i, y0, r0), P(i + 1, y0, r0), P(i + 1, y1, r1), P(i, y1, r1), cen);
      if (caps) { this.tri([cx, y0, cz], P(i, y0, r0), P(i + 1, y0, r0), [cx, y0 + 1, cz]); this.tri([cx, y1, cz], P(i, y1, r1), P(i + 1, y1, r1), [cx, y1 - 1, cz]); }
    }
    return this;
  }
  box(x0, y0, z0, x1, y1, z1) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const v = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
    this.quad(v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0), c); this.quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1), c);
    this.quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0), c); this.quad(v(1, 0, 0), v(1, 0, 1), v(1, 1, 1), v(1, 1, 0), c);
    this.quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1), c); this.quad(v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1), c);
    return this;
  }
  /** a square strut from a to b */
  beam(a, b, w) {
    const d = V3.norm(V3.sub(b, a)), s = V3.norm(V3.cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), u = V3.cross(s, d);
    const o = (p, i, j) => V3.add(p, V3.add(V3.mul(s, i * w), V3.mul(u, j * w)));
    const c = V3.mul(V3.add(a, b), 0.5);
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) { const [i0, j0] = cs[k], [i1, j1] = cs[(k + 1) % 4]; this.quad(o(a, i0, j0), o(a, i1, j1), o(b, i1, j1), o(b, i0, j0), c); }
    return this;
  }
  done() { return new Float32Array(this.d); }
}

function makeMeshes() {
  const M = {};
  // the hopper (forward is +z), feet at y = -1.9
  const hull = new MB();
  hull.cyl(8, 1.5, 1.5, -0.6, 0.7, 0, 0, true, Math.PI / 8);
  hull.cyl(6, 1.0, 0.72, 0.7, 1.45, 0, 0, true, Math.PI / 6);
  hull.cyl(8, 1.56, 1.56, -0.12, 0.02, 0, 0, false, Math.PI / 8);     // a stripe band
  M.hull = hull.done();
  const dark = new MB();
  dark.cyl(10, 0.38, 0.8, -0.6, -1.35, 0, 0, false);                  // engine bell
  dark.cyl(10, 0.45, 0.45, -0.6, -0.45, 0, 0, true);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    dark.beam([sx * 0.95, -0.35, sz * 0.95], [sx * 2.05, -1.8, sz * 2.05], 0.08);
    dark.beam([sx * 1.2, 0.3, sz * 1.2], [sx * 1.75, -1.2, sz * 1.75], 0.05);
    dark.cyl(8, 0.36, 0.3, -1.92, -1.78, sx * 2.05, sz * 2.05, true);
  }
  dark.cyl(6, 0.08, 0.08, 1.45, 2.2, 0.45, -0.2, true);                // antenna
  dark.cyl(8, 0.28, 0.0, 2.15, 2.4, 0.45, -0.2, true);
  M.hullDark = dark.done();
  const tank = new MB();
  for (const sx of [-1, 1]) { tank.cyl(10, 0.46, 0.46, -0.45, 0.5, sx * 1.62, 0, true); tank.cyl(10, 0.46, 0.2, 0.5, 0.75, sx * 1.62, 0, true); }
  M.tank = tank.done();
  M.glass = new MB().box(-0.42, 0.85, 0.82, 0.42, 1.22, 0.95).done();
  M.navR = new MB().box(-1.66, 0.25, -0.1, -1.54, 0.4, 0.1).done();
  M.navG = new MB().box(1.54, 0.25, -0.1, 1.66, 0.4, 0.1).done();
  // cargo crate (centred, 2 m)
  M.crate = new MB().box(-0.92, -0.92, -0.92, 0.92, 0.92, 0.92).done();
  const fr = new MB();
  const e = 1.0, edges = [[[-e, -e, -e], [e, -e, -e]], [[-e, e, -e], [e, e, -e]], [[-e, -e, e], [e, -e, e]], [[-e, e, e], [e, e, e]],
    [[-e, -e, -e], [-e, e, -e]], [[e, -e, -e], [e, e, -e]], [[-e, -e, e], [-e, e, e]], [[e, -e, e], [e, e, e]],
    [[-e, -e, -e], [-e, -e, e]], [[e, -e, -e], [e, -e, e]], [[-e, e, -e], [-e, e, e]], [[e, e, -e], [e, e, e]]];
  for (const [a, b] of edges) fr.beam(a, b, 0.12);
  fr.beam([-e, e, -e], [e, e, e], 0.07); fr.beam([e, e, -e], [-e, e, e], 0.07);
  fr.cyl(8, 0.18, 0.18, 1.0, 1.25, 0, 0, true);                       // lifting eye
  M.crateFrame = fr.done();
  // base buildings
  const dome = new MB(), seg = 18, rings = 7;
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const P = (ii, jj) => { const a = ii / seg * Math.PI * 2, b = jj / rings * Math.PI / 2; return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)]; };
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    dome.smooth(a, b, c, a, b, c); dome.smooth(a, c, d, a, c, d);
  }
  M.dome = dome.done();
  M.domeBand = new MB().cyl(18, 1.03, 1.03, 0, 0.14, 0, 0, false).done();
  M.domeGlow = new MB().cyl(18, 1.012, 0.985, 0.26, 0.33, 0, 0, false).done();
  const mast = new MB();
  mast.cyl(6, 0.3, 0.18, 0, 1, 0, 0, true);
  M.mast = mast.done();
  const dish = new MB();
  dish.cyl(12, 0.12, 1.4, 0, 0.6, 0, 0, false);
  M.dish = dish.done();
  // a habitat tube along +x from 0..1
  const tb = new MB(), tn = 10;
  for (let i = 0; i < tn; i++) {
    const P = (k, x) => { const a = k / tn * Math.PI * 2; return [x, Math.sin(a), Math.cos(a)]; };
    tb.quad(P(i, 0), P(i + 1, 0), P(i + 1, 1), P(i, 1), [0.5, 0, 0]);
  }
  M.tube = tb.done();
  // fuel canister
  M.canister = new MB().cyl(10, 0.55, 0.55, -0.8, 0.8, 0, 0, true).cyl(10, 0.3, 0.3, 0.8, 1.0, 0, 0, true).done();
  M.canBand = new MB().cyl(10, 0.6, 0.6, -0.15, 0.15, 0, 0, false).done();
  // crystals and rocks
  const oc = new MB(), ov = [[1, 0, 0], [-1, 0, 0], [0, 1.5, 0], [0, -1.5, 0], [0, 0, 1], [0, 0, -1]];
  for (const [a, b, c] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]]) oc.tri(ov[a], ov[b], ov[c], [0, 0, 0]);
  M.octa = oc.done();
  M.rock = rockMesh();
  return M;
}
function rockMesh() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(V3.norm);
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const jit = v.map((p, i) => V3.mul(p, 0.8 + 0.35 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1)));
  const m = new MB();
  for (const [a, b, c] of f) m.tri(jit[a], jit[b], jit[c], [0, 0, 0]);
  return m.done();
}

// ── shaders ─────────────────────────────────────────────────────
const TONE = `
vec3 tone(vec3 c){ c = c*(2.51*c+0.03)/(c*(2.43*c+0.59)+0.14); return pow(clamp(c,0.0,1.0), vec3(0.4545)); }`;
const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }`;
const QUAD_VS = `attribute vec2 aP; varying vec2 vUV; void main(){ vUV = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;

const SKY_FS = `precision highp float;
varying vec2 vUV;
uniform vec3 uF, uR, uU, uSun, uEarth;
uniform float uTX, uTY, uTime, uNight;
${NOISE}
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
${TONE}
void main(){
  vec3 d = normalize(uF + vUV.x*uTX*uR + vUV.y*uTY*uU);
  vec3 col = vec3(0.0);
  // stars
  float above = smoothstep(-0.12, 0.05, d.y);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 160.0 : 330.0;
    vec3 p = d*sc, c = floor(p), f = fract(p) - 0.5;
    float h = h3(c), h2 = h3(c + 7.1);
    vec3 j = vec3(h2, h3(c+3.3), h3(c+5.7)) - 0.5;
    float dd = length(f - j*0.6);
    float s = (1.0 - smoothstep(0.0, k == 0 ? 0.16 : 0.12, dd)) * step(k == 0 ? 0.985 : 0.975, h);
    float tw = 0.75 + 0.25*sin(uTime*(1.5+h2*4.0) + h*40.0);
    col += s * tw * mix(vec3(0.75,0.82,1.0), vec3(1.0,0.86,0.7), h2) * (k == 0 ? 1.6 : 0.8);
  }
  // the Milky Way: a faint lumpy band
  vec3 bandN = normalize(vec3(0.35, 0.55, -0.76));
  float band = exp(-pow(dot(d, bandN)*5.5, 2.0));
  float lump = vnoise(vec2(atan(d.z, d.x)*9.0, d.y*14.0)) * vnoise(vec2(atan(d.z, d.x)*31.0, d.y*40.0));
  col += vec3(0.32, 0.3, 0.42) * band * (0.15 + lump*0.6) * 0.5;
  col *= above;
  // the Sun: a disc + glare (it's below the horizon at night)
  float sd = dot(d, uSun);
  col += vec3(1.0, 0.97, 0.9) * (smoothstep(0.99975, 0.9999, sd)*6.0 + pow(max(sd,0.0), 600.0)*1.4 + pow(max(sd,0.0), 40.0)*0.06) * (1.0 - uNight);
  // the Earth
  float R = 0.072;
  float ed = acos(clamp(dot(d, uEarth), -1.0, 1.0));
  if (ed < R*1.35) {
    vec3 eR = normalize(cross(uEarth, vec3(0.0,1.0,0.0))), eU = cross(eR, uEarth);
    vec2 q = vec2(dot(d, eR), dot(d, eU)) / sin(R);
    float r2 = dot(q, q);
    vec3 sunE = normalize(uSun + vec3(0.0, 0.0, 0.0));
    if (r2 < 1.0) {
      float z = sqrt(1.0 - r2);
      vec3 n = normalize(q.x*eR + q.y*eU - z*uEarth);
      float lit = dot(n, sunE);
      float lon = atan(q.x, z) + uTime*0.01, lat = q.y;
      float land = smoothstep(0.52, 0.6, vnoise(vec2(lon*3.0, lat*4.0)) * 0.7 + vnoise(vec2(lon*9.0, lat*11.0))*0.3);
      float ice = smoothstep(0.72, 0.85, abs(lat));
      float cloud = smoothstep(0.45, 0.75, vnoise(vec2(lon*6.0 + uTime*0.02, lat*9.0)) * 0.6 + vnoise(vec2(lon*17.0, lat*23.0))*0.4);
      vec3 surf = mix(vec3(0.03, 0.12, 0.38), vec3(0.22, 0.3, 0.12), land);
      surf = mix(surf, vec3(0.9), max(ice, cloud*0.85));
      float day = smoothstep(-0.08, 0.25, lit);
      vec3 ec = surf * day * 2.2;
      ec += vec3(1.0, 0.75, 0.35) * land * (1.0 - cloud) * (1.0 - day) * step(0.7, vnoise(vec2(lon*40.0, lat*40.0))) * 0.25;
      ec += vec3(0.3, 0.55, 1.0) * pow(1.0 - z, 3.0) * day * 0.9;
      col = mix(col, ec, 1.0 - smoothstep(0.985, 1.0, r2));
    } else {
      float glow = exp(-(sqrt(r2) - 1.0) * 14.0);
      col += vec3(0.25, 0.5, 1.0) * glow * 0.45 * smoothstep(-0.4, 0.4, dot(normalize(q.x*eR + q.y*eU), sunE));
    }
  }
  gl_FragColor = vec4(tone(col), 1.0);
}`;

const TERRAIN_VS = `attribute vec3 aPos; attribute vec3 aNor; attribute float aSun;
uniform mat4 uVP;
varying vec3 vP; varying vec3 vN; varying float vSun;
void main(){ vP = aPos; vN = aNor; vSun = aSun; gl_Position = uVP * vec4(aPos, 1.0); }`;

const LIGHT = `
uniform vec3 uSunDir, uSunCol, uAmb, uEarthDir, uEarthCol, uCam, uLampCol;
uniform vec4 uLamp;
uniform float uFar;
vec3 lamp(vec3 P, vec3 N){
  vec3 Ld = uLamp.xyz - P; float dist = length(Ld); vec3 l = Ld / max(dist, 0.001);
  float cone = smoothstep(0.35, 0.8, -l.y);
  return uLampCol * max(dot(N, l), 0.0) * uLamp.w * cone / (1.0 + dist*dist*0.0035);
}
float fade(vec3 P){
  float e = max(abs(P.x), abs(P.z));
  return (1.0 - smoothstep(uFar*0.72, uFar, length(P - uCam))) * (1.0 - smoothstep(${(HALF - 70).toFixed(1)}, ${(HALF - 4).toFixed(1)}, e));
}`;

const TERRAIN_FS = `precision highp float;
varying vec3 vP; varying vec3 vN; varying float vSun;
uniform vec4 uPads[6];      // x, z, radius, kind (0 off · 1 pad · 2 drop target · 3 pick-up)
uniform vec4 uBlob[3];      // x, z, radius, strength (soft shadows of the hopper and crate)
uniform vec4 uWarn[4];      // x, z, radius, strength (meteor about to land)
uniform vec4 uVent[4];      // x, z, radius, heat (dust geysers)
uniform float uTime;
${LIGHT}
${NOISE}
${TONE}
void main(){
  vec3 N = normalize(vN);
  float n1 = vnoise(vP.xz*0.03), n2 = vnoise(vP.xz*0.21), n3 = vnoise(vP.xz*1.6), n4 = vnoise(vP.xz*5.3);
  float alb = 0.33 + 0.16*n1 + 0.08*n2 + 0.05*n3 + 0.03*n4;
  alb *= mix(0.68, 1.0, smoothstep(0.33, 0.62, vnoise(vP.xz*0.007 + 3.1)));
  // bright ejecta speckle
  alb += step(0.93, vnoise(vP.xz*2.7)) * 0.06;
  vec3 base = vec3(alb) * vec3(1.0, 0.985, 0.955);
  float sunL = max(dot(N, uSunDir), 0.0) * vSun;
  vec3 light = uSunCol*sunL + uAmb + uEarthCol*max(dot(N, uEarthDir), 0.0)*0.55 + lamp(vP, N);
  vec3 col = base * light;
  for (int k = 0; k < 6; k++) {
    vec4 p = uPads[k];
    if (p.w < 0.5) continue;
    vec2 d = vP.xz - p.xy; float r = length(d);
    if (r > p.z + 1.5) continue;
    float plate = 1.0 - smoothstep(p.z, p.z + 0.35, r);
    vec2 a = abs(d);
    float tile = 0.86 + 0.14*step(0.5, fract(floor(d.x*0.5) * 0.5 + floor(d.y*0.5) * 0.5));
    vec3 pc = vec3(0.5, 0.52, 0.56) * tile;
    vec3 accent = p.w > 2.5 ? vec3(0.25, 0.85, 1.0) : p.w > 1.5 ? vec3(0.3, 1.0, 0.45) : vec3(1.0, 0.68, 0.18);
    float ring = 1.0 - smoothstep(0.0, 0.4, abs(r - (p.z - 0.9)));
    float inner = 1.0 - smoothstep(0.0, 0.25, abs(r - p.z*0.62));
    float legs = step(p.z*0.2, a.x) * step(a.x, p.z*0.3) * step(a.y, p.z*0.34);
    float bar = step(a.x, p.z*0.3) * step(a.y, 0.55);
    float H = max(legs, bar);
    float hazard = step(p.z - 0.4, r) * step(0.5, fract(atan(d.y, d.x) * 3.8197));
    vec3 padCol = pc * light;
    padCol = mix(padCol, vec3(0.95, 0.75, 0.15) * light, hazard * 0.85);
    padCol = mix(padCol, vec3(0.92) * light, H * 0.8);
    float pulse = p.w > 1.5 ? 0.5 + 0.5*sin(uTime*4.0 - r*0.7) : 0.25;
    padCol = mix(padCol, accent, ring*0.85);
    padCol += accent * (ring*(0.35 + pulse) + inner*pulse*0.6);
    col = mix(col, padCol, plate);
  }
  for (int k = 0; k < 4; k++) {
    vec4 v = uVent[k];
    if (v.z < 0.5) continue;
    float dd = length(vP.xz - v.xy) / v.z;
    if (dd > 1.6) continue;
    col *= mix(0.2, 1.0, smoothstep(0.25, 1.05, dd));
    col += vec3(1.0, 0.5, 0.18) * v.w * (1.0 - smoothstep(0.0, 1.0, dd)) * 0.9;
    col += vec3(0.6, 0.45, 0.3) * (1.0 - smoothstep(0.0, 0.12, abs(dd - 1.15))) * 0.12;
  }
  for (int k = 0; k < 3; k++) {
    vec4 b = uBlob[k];
    if (b.w <= 0.0) continue;
    float dd = length(vP.xz - b.xy);
    col *= 1.0 - b.w * (1.0 - smoothstep(b.z*0.25, b.z, dd));
  }
  for (int k = 0; k < 4; k++) {
    vec4 w = uWarn[k];
    if (w.w <= 0.0) continue;
    float dd = length(vP.xz - w.xy);
    float ring = 1.0 - smoothstep(0.0, 0.7, abs(dd - w.z));
    float fill = 1.0 - smoothstep(w.z - 0.5, w.z, dd);
    col += vec3(1.0, 0.18, 0.1) * (ring*(0.7 + 0.5*sin(uTime*16.0)) + fill*0.18) * w.w;
  }
  gl_FragColor = vec4(tone(col * fade(vP)), 1.0);
}`;

const SOLID_VS = `attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uVP, uM;
varying vec3 vP; varying vec3 vN;
void main(){ vec4 w = uM * vec4(aPos, 1.0); vP = w.xyz; vN = mat3(uM) * aNor; gl_Position = uVP * w; }`;
const SOLID_FS = `precision highp float;
varying vec3 vP; varying vec3 vN;
uniform vec3 uCol, uEmis;
uniform float uSpec, uAlpha, uShine;
${LIGHT}
${TONE}
void main(){
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vP);
  float dl = max(dot(N, uSunDir), 0.0);
  vec3 Hh = normalize(uSunDir + V);
  float sp = pow(max(dot(N, Hh), 0.0), uShine) * uSpec * step(0.0, dot(N, uSunDir));
  vec3 lit = uSunCol*dl + uAmb*1.15 + uEarthCol*max(dot(N, uEarthDir), 0.0)*0.6 + lamp(vP, N)*0.6;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.18;
  vec3 col = uCol * lit + uSunCol*sp + uEmis + rim*(uAmb + uEarthCol*0.5);
  gl_FragColor = vec4(tone(col) * fade(vP), uAlpha);
}`;

const FX_VS = `attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute float aK;
uniform mat4 uVP;
varying vec2 vUV; varying vec4 vCol; varying float vK;
void main(){ vUV = aUV; vCol = aCol; vK = aK; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FX_FS = `precision mediump float;
varying vec2 vUV; varying vec4 vCol; varying float vK;
void main(){
  float r = length(vUV), a;
  if (vK < 0.5) a = exp(-r*r*4.0) * (1.0 - smoothstep(0.85, 1.0, r));        // soft glow
  else if (vK < 1.5) a = 1.0 - smoothstep(0.0, 0.18, abs(r - 0.8));           // ring
  else if (vK < 2.5) a = 1.0 - smoothstep(0.6, 1.0, r);                       // dust puff (soft disc)
  else if (vK < 3.5) a = exp(-r*r*2.5) * (1.0 - smoothstep(0.9, 1.0, r)) + exp(-r*r*30.0); // flame
  else a = 1.0 - smoothstep(0.6, 1.0, abs(vUV.y));                             // ribbon (cable, trails)
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

// ── the renderer ──────────────────────────────────────────────
export class MoonGL {
  static supported() { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } }

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl', { antialias: true, alpha: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); if (this.world) this.setWorld(this.world, this.shade); });
    this.init();
  }

  init() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (vs, fs, attrs) => {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
      return { p, u };
    };
    this.P = {
      sky: prog(QUAD_VS, SKY_FS, ['aP']),
      terrain: prog(TERRAIN_VS, TERRAIN_FS, ['aPos', 'aNor', 'aSun']),
      solid: prog(SOLID_VS, SOLID_FS, ['aPos', 'aNor']),
      fx: prog(FX_VS, FX_FS, ['aPos', 'aUV', 'aCol', 'aK']),
    };
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.meshes = {};
    for (const [k, d] of Object.entries(makeMeshes())) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); this.meshes[k] = { b, n: d.length / 6 }; }
    // terrain index buffer (same diagonal as world.groundAt)
    const idx = new Uint16Array(GRID * GRID * 6); let q = 0;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * N + i, b = a + 1, c = a + N + 1, d = a + N;
      idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = a; idx[q++] = c; idx[q++] = d;
    }
    this.tIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.tIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.tIdxN = idx.length;
    this.tBuf = gl.createBuffer();
    this.fxMax = 6000;
    this.fxData = new Float32Array(10 * 6 * this.fxMax); this.fxN = 0;
    this.fxBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf); gl.bufferData(gl.ARRAY_BUFFER, this.fxData.byteLength, gl.DYNAMIC_DRAW);
  }

  /** upload a new level's ground (positions, normals, baked sunlight) */
  setWorld(W, shade) {
    this.world = W; this.shade = shade;
    const gl = this.gl, h = W.h, d = new Float32Array(N * N * 7);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, o = k * 7;
      const hl = h[j * N + Math.max(0, i - 1)], hr = h[j * N + Math.min(GRID, i + 1)];
      const hd = h[Math.max(0, j - 1) * N + i], hu = h[Math.min(GRID, j + 1) * N + i];
      const nx = hl - hr, nz = hd - hu, ny = 4 * CELL / 2, l = Math.hypot(nx, ny, nz);
      d[o] = i * CELL - HALF; d[o + 1] = h[k]; d[o + 2] = j * CELL - HALF;
      d[o + 3] = nx / l; d[o + 4] = ny / l; d[o + 5] = nz / l; d[o + 6] = shade ? shade[k] : 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  // ── glow / dust batch ──────────────────────────────────────
  vert(p, u, v, c, a, k) {
    if (this.fxN >= this.fxMax * 6) return;
    const o = this.fxN++ * 10, D = this.fxData;
    D[o] = p[0]; D[o + 1] = p[1]; D[o + 2] = p[2]; D[o + 3] = u; D[o + 4] = v; D[o + 5] = c[0]; D[o + 6] = c[1]; D[o + 7] = c[2]; D[o + 8] = a; D[o + 9] = k;
  }
  quadFx(a, b, c, d, col, al, k) { this.vert(a, -1, -1, col, al, k); this.vert(b, 1, -1, col, al, k); this.vert(c, 1, 1, col, al, k); this.vert(a, -1, -1, col, al, k); this.vert(c, 1, 1, col, al, k); this.vert(d, -1, 1, col, al, k); }
  /** a camera-facing sprite */
  sprite(p, size, col, al, kind = 0) {
    const { r, u } = this.B, R = V3.mul(r, size), U = V3.mul(u, size);
    this.quadFx(V3.sub(V3.sub(p, R), U), V3.sub(V3.add(p, R), U), V3.add(V3.add(p, R), U), V3.add(V3.sub(p, R), U), col, al, kind);
  }
  /** a flat ring lying on the ground */
  flatSprite(p, size, col, al, kind = 1) {
    this.quadFx([p[0] - size, p[1], p[2] - size], [p[0] + size, p[1], p[2] - size], [p[0] + size, p[1], p[2] + size], [p[0] - size, p[1], p[2] + size], col, al, kind);
  }
  /** a camera-facing ribbon from a to b */
  ribbon(a, b, w, col, al) {
    const d = V3.sub(b, a), mid = V3.mul(V3.add(a, b), 0.5);
    const side = V3.mul(V3.norm(V3.cross(d, V3.sub(this.eye, mid))), w);
    this.quadFx(V3.sub(a, side), V3.sub(b, side), V3.add(b, side), V3.add(a, side), col, al, 4);
  }

  /** draw one frame; returns the canvas */
  render(S, w, h) {
    if (this.lost) return null;
    const gl = this.gl;
    this.resize(w, h);
    const { eye, target, fov } = S.cam;
    const B = this.B = camBasis(eye, target);
    this.eye = eye;
    const aspect = w / h, far = S.far || 620;
    const VP = mul4(persp(fov, aspect, 0.3, far + 40), viewMat(eye, B));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. sky
    gl.disable(gl.DEPTH_TEST);
    let P = this.P.sky; gl.useProgram(P.p);
    gl.uniform3fv(P.u.uF, B.f); gl.uniform3fv(P.u.uR, B.r); gl.uniform3fv(P.u.uU, B.u);
    gl.uniform1f(P.u.uTY, Math.tan(fov / 2)); gl.uniform1f(P.u.uTX, Math.tan(fov / 2) * aspect);
    gl.uniform3fv(P.u.uSun, S.sunDir); gl.uniform3fv(P.u.uEarth, S.earthDir);
    gl.uniform1f(P.u.uTime, S.t); gl.uniform1f(P.u.uNight, S.night ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const lightU = (P) => {
      gl.uniform3fv(P.u.uSunDir, S.sunDir); gl.uniform3fv(P.u.uSunCol, S.sunCol); gl.uniform3fv(P.u.uAmb, S.amb);
      gl.uniform3fv(P.u.uEarthDir, S.earthDir); gl.uniform3fv(P.u.uEarthCol, S.earthCol); gl.uniform3fv(P.u.uCam, eye);
      gl.uniform4fv(P.u.uLamp, S.lamp); gl.uniform3fv(P.u.uLampCol, S.lampCol); gl.uniform1f(P.u.uFar, far);
    };
    const vec4s = (list, n) => { const a = new Float32Array(n * 4); list.slice(0, n).forEach((v, i) => a.set(v, i * 4)); return a; };

    // 2. ground
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    P = this.P.terrain; gl.useProgram(P.p); lightU(P);
    gl.uniformMatrix4fv(P.u.uVP, false, VP);
    gl.uniform4fv(P.u.uPads, vec4s(S.pads, 6)); gl.uniform4fv(P.u.uBlob, vec4s(S.blobs, 3));
    gl.uniform4fv(P.u.uWarn, vec4s(S.warns, 4)); gl.uniform4fv(P.u.uVent, vec4s(S.vents, 4));
    gl.uniform1f(P.u.uTime, S.t);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.tIdx);
    gl.drawElements(gl.TRIANGLES, this.tIdxN, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(2);

    // 3. solids (opaque first, see-through after)
    P = this.P.solid; gl.useProgram(P.p); lightU(P);
    gl.uniformMatrix4fv(P.u.uVP, false, VP);
    const draw = (o) => {
      const m = this.meshes[o.mesh]; if (!m) return;
      gl.uniformMatrix4fv(P.u.uM, false, o.m);
      gl.uniform3fv(P.u.uCol, o.col); gl.uniform3fv(P.u.uEmis, o.emis || [0, 0, 0]);
      gl.uniform1f(P.u.uSpec, o.spec || 0); gl.uniform1f(P.u.uShine, o.shine || 24); gl.uniform1f(P.u.uAlpha, o.alpha ?? 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, m.n);
    };
    for (const o of S.solids) if ((o.alpha ?? 1) >= 1) draw(o);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const o of S.solids) if ((o.alpha ?? 1) < 1) draw(o);
    gl.disableVertexAttribArray(1);

    // 4. dust (normal blending), then glow (added light)
    P = this.P.fx; gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, VP);
    const flush = () => {
      if (!this.fxN) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fxData.subarray(0, this.fxN * 10));
      for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
      gl.drawArrays(gl.TRIANGLES, 0, this.fxN);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
      this.fxN = 0;
    };
    this.fxN = 0; S.dust?.(this); flush();
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.fxN = 0; S.glow?.(this); flush();
    gl.depthMask(true); gl.disable(gl.BLEND);
    return this.canvas;
  }
}

/** project a world point to the logical screen (W × H); null when behind the camera */
export function project(cam, p, W, H) {
  const B = camBasis(cam.eye, cam.target), d = V3.sub(p, cam.eye), z = V3.dot(d, B.f);
  if (z < 0.2) return null;
  const ty = Math.tan(cam.fov / 2), tx = ty * W / H;
  return [W / 2 + V3.dot(d, B.r) / z / tx * W / 2, H / 2 - V3.dot(d, B.u) / z / ty * H / 2, z];
}

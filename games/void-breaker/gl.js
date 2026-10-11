// ─────────────────────────────────────────────────────────────
//  VOID BREAKER — the GPU 3D view (WebGL 1, so it runs on nearly every phone).
//
//  Every frame:
//    1. the sky: a nebula + star field baked once into a cube map per theme,
//       plus the animated VOID RIFT (a swirling black hole) drawn live
//    2. the arena floor: a disc of glowing hexagon tiles with energy rings that
//       pulse outwards, lit by every shot and explosion (8 moving point lights)
//    3. solid lit meshes: pylons, an orbiting rock belt, the enemies (flat
//       shaded with glowing edges and a rim light), pickups and bosses
//    4. additive glow: light-trail shots, sparks, portals, beams and the
//       shattered triangles of every enemy you break
//    5. your arm cannon, drawn on top in view space
//    6. post: bright-pass → two blurred bloom layers → composite with
//       tone mapping, chromatic aberration on hits, vignette and film grain
//  The picture is handed back as a canvas; game.js draws it and the HUD.
// ─────────────────────────────────────────────────────────────

// ── tiny matrix kit (column-major, like WebGL) ─────────────────
export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
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
function lookDir(eye, f, up = [0, 1, 0]) {
  const s = V3.norm(V3.cross(f, up)), u = V3.cross(s, f);
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

// ── meshes: flat shaded, every vertex carries "how close am I to a real edge" ──
/** tris: [[a,b,c], …] (points), real: per-triangle [e0,e1,e2] (edge opposite vertex k is a real, glowing edge), centre: for each tri, a point inside the solid (so normals face out) */
function buildMesh(tris, real, centreOf = () => [0, 0, 0]) {
  const out = [];
  tris.forEach((t, i) => {
    const [a, b, c] = t;
    let n = V3.norm(V3.cross(V3.sub(b, a), V3.sub(c, a)));
    const m = V3.mul(V3.add(V3.add(a, b), c), 1 / 3);
    if (V3.dot(n, V3.sub(m, centreOf(i, m))) < 0) n = V3.mul(n, -1);
    const e = real ? real[i] : [1, 1, 1];
    const bary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    t.forEach((p, k) => { const bb = bary[k].map((v, j) => v + (e[j] ? 0 : 1)); out.push(...p, ...n, ...bb); });
  });
  return { data: new Float32Array(out), count: out.length / 9 };
}
const quadTris = (a, b, c, d) => ({ t: [[a, b, c], [a, c, d]], e: [[1, 0, 1], [1, 1, 0]] });
function polyMesh(verts, faces) {               // faces as vertex-index polygons (convex), fan-triangulated
  const tris = [], real = [];
  for (const f of faces) for (let k = 1; k < f.length - 1; k++) {
    tris.push([verts[f[0]], verts[f[k]], verts[f[k + 1]]]);
    // only the polygon's own outline glows, not the fan's inner diagonals
    real.push([1, k === f.length - 2 ? 1 : 0, k === 1 ? 1 : 0]);
  }
  return buildMesh(tris, real);
}
const PHI = (1 + Math.sqrt(5)) / 2;
function icoData() {
  const v = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(V3.norm);
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
}
function dodecaFaces() {                         // the dual of the icosahedron
  const { v, f } = icoData();
  const cents = f.map((t) => V3.norm(V3.mul(V3.add(V3.add(v[t[0]], v[t[1]]), v[t[2]]), 1 / 3)));
  const faces = v.map((p, vi) => {
    const around = f.map((t, i) => (t.includes(vi) ? i : -1)).filter((i) => i >= 0);
    const t1 = V3.norm(V3.cross(p, Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = V3.cross(p, t1);
    around.sort((a, b) => Math.atan2(V3.dot(cents[a], t2), V3.dot(cents[a], t1)) - Math.atan2(V3.dot(cents[b], t2), V3.dot(cents[b], t1)));
    return around;
  });
  return { v: cents, f: faces };
}
function torusMesh(R = 1, r = 0.3, n = 18, m = 8) {
  const tris = [], real = [], cen = [];
  const P = (i, j) => { const a = i / n * Math.PI * 2, b = j / m * Math.PI * 2; return [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const q = quadTris(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
    const a = (i + 0.5) / n * Math.PI * 2;
    for (let k = 0; k < 2; k++) { tris.push(q.t[k]); real.push(q.e[k]); cen.push([R * Math.cos(a), 0, R * Math.sin(a)]); }
  }
  return buildMesh(tris, real, (i) => cen[i]);
}
/** an n-sided prism along z from z0 to z1 (radius r), optionally tapered */
function prismTris(n, r0, r1, z0, z1, cx = 0, cy = 0, rot = Math.PI / n) {
  const tris = [], real = [];
  const P = (i, z, r) => { const a = rot + i / n * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; };
  for (let i = 0; i < n; i++) { const q = quadTris(P(i, z0, r0), P(i + 1, z0, r0), P(i + 1, z1, r1), P(i, z1, r1)); tris.push(...q.t); real.push(...q.e); }
  for (let i = 1; i < n - 1; i++) {
    tris.push([P(0, z0, r0), P(i, z0, r0), P(i + 1, z0, r0)]); real.push([1, i === n - 2 ? 1 : 0, i === 1 ? 1 : 0]);
    tris.push([P(0, z1, r1), P(i, z1, r1), P(i + 1, z1, r1)]); real.push([1, i === n - 2 ? 1 : 0, i === 1 ? 1 : 0]);
  }
  return { tris, real, c: [cx, cy, (z0 + z1) / 2] };
}
function boxTris(x0, y0, z0, x1, y1, z1) {
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const tris = [], real = [];
  for (const f of faces) { const q = quadTris(c[f[0]], c[f[1]], c[f[2]], c[f[3]]); tris.push(...q.t); real.push(...q.e); }
  return { tris, real, c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] };
}
/** several convex parts → one mesh (each part keeps its own inside point) */
function partsMesh(parts) {
  const tris = [], real = [], cen = [];
  for (const p of parts) { tris.push(...p.tris); real.push(...p.real); for (let i = 0; i < p.tris.length; i++) cen.push(p.c); }
  return buildMesh(tris, real, (i) => cen[i]);
}

export function makeMeshes() {
  const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(V3.norm);
  const tetraF = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
  const tetra = polyMesh(T, tetraF);
  const star = (() => { const a = T.map((p) => V3.mul(p, 1.0)), b = T.map((p) => V3.mul(p, -1.0)); const tris = [], real = [];
    for (const set of [a, b]) for (const f of tetraF) { tris.push([set[f[0]], set[f[1]], set[f[2]]]); real.push([1, 1, 1]); }
    return buildMesh(tris, real, (i) => [0, 0, 0]); })();
  const cubeV = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((p) => V3.mul(p, 0.62));
  const cube = polyMesh(cubeV, [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]);
  const O = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const octF = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
  const octa = polyMesh(O, octF);
  const dart = polyMesh(O.map(([x, y, z]) => [x * 0.6, y * 0.6, z * 1.7]), octF);
  const ico = polyMesh(icoData().v, icoData().f);
  const dd = dodecaFaces(); const dodeca = polyMesh(dd.v, dd.f);
  const torus = torusMesh(1, 0.28, 20, 8);
  // the arm cannon (view space: points down −z): a rounded body, vented shroud, barrel and grip
  const gun = partsMesh([
    prismTris(8, 0.085, 0.07, -0.08, 0.3),                          // body
    prismTris(6, 0.06, 0.05, -0.36, -0.06),                         // barrel shroud
    prismTris(8, 0.03, 0.03, -0.47, -0.3),                          // barrel
    prismTris(8, 0.048, 0.044, -0.5, -0.45),                        // muzzle collar
    boxTris(-0.018, 0.07, -0.02, 0.018, 0.105, 0.2),                 // top sight rail
    boxTris(-0.035, -0.2, 0.14, 0.035, -0.06, 0.24),                 // grip
    boxTris(-0.012, -0.12, 0.02, 0.012, -0.06, 0.12),                // under-fin
  ]);
  // the glowing parts: three coil rings on the shroud and an energy cell along the side
  const coils = partsMesh([
    ...[0, 1, 2].map((i) => prismTris(6, 0.066, 0.066, -0.33 + i * 0.08, -0.305 + i * 0.08)),
    prismTris(8, 0.022, 0.022, -0.02, 0.22, -0.088, 0.01),
    prismTris(8, 0.018, 0.018, -0.44, -0.4, 0, 0),
  ]);
  // pylons round the arena edge, and their glowing strips
  const pyl = [], pylG = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.sin(a) * 29.5, z = Math.cos(a) * 29.5;
    const p = prismTris(4, 1.1, 0.35, 0, 1, 0, 0, Math.PI / 4);
    const tf = (q) => [x + q[0], q[2] * 11 - 2, z + q[1]];             // prism along z → stand it up
    pyl.push({ tris: p.tris.map((t) => t.map(tf)), real: p.real, c: [x, 3, z] });
    const g = prismTris(4, 0.42, 0.18, 0, 1, 0, 0, Math.PI / 4);
    pylG.push({ tris: g.tris.map((t) => t.map((q) => [x + q[0] * 1.02, q[2] * 1.6 + 9.1, z + q[1] * 1.02])), real: g.real, c: [x, 9.9, z] });
  }
  // a belt of broken rock slowly orbiting beyond the arena
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rocks = [];
  const { v: iv, f: ifc } = icoData();
  for (let k = 0; k < 46; k++) {
    const a = rnd() * Math.PI * 2, r = 33 + rnd() * 30, y = -14 + rnd() * 12, s = 0.8 + rnd() * 2.6;
    const c = [Math.sin(a) * r, y, Math.cos(a) * r], dv = iv.map((p) => V3.add(c, V3.mul(p, s * (0.7 + rnd() * 0.6))));
    rocks.push({ tris: ifc.map((f) => [dv[f[0]], dv[f[1]], dv[f[2]]]), real: ifc.map(() => [1, 1, 1]), c });
  }
  return { tetra, star, cube, octa, dart, ico, dodeca, torus, gun, coils, pylons: partsMesh(pyl), pylonGlow: partsMesh(pylG), rocks: partsMesh(rocks) };
}

// ── shaders ───────────────────────────────────────────────────
const NOISE = `
float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }`;
const QUAD_VS = `attribute vec2 aP; varying vec2 vUV; varying vec2 vN; void main(){ vN=aP; vUV=aP*0.5+0.5; gl_Position=vec4(aP,0.0,1.0); }`;
const BAKE_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
 varying vec2 vN;
uniform vec3 uF, uR, uU, uA, uB, uC, uBand; ${NOISE}
void main(){
  vec3 d = normalize(uF + uR*vN.x + uU*vN.y);
  float band = exp(-pow(dot(d, uBand), 2.0)*5.0);
  float n1 = fbm(d*2.2), n2 = fbm(d*4.6+3.0), n3v = fbm(d*1.2+7.0);
  vec3 neb = mix(uA, uB, smoothstep(0.3,0.75,n1)) * pow(n2, 2.4) * (0.25 + 1.2*band);
  neb += uC * pow(n3v, 3.8) * 1.3 * (0.3+band);
  float dust = smoothstep(0.55, 0.75, fbm(d*7.0+11.0)); neb *= 1.0 - dust*0.6*band;      // dark dust lanes
  vec3 col = vec3(0.004,0.003,0.012) + neb;
  // stars: three sizes
  for (int k=0;k<3;k++){
    float sc = k==0 ? 260.0 : k==1 ? 120.0 : 55.0;
    vec3 c = floor(d*sc); float r = h3(c+float(k)*17.0);
    float th = k==0 ? 0.985 : k==1 ? 0.993 : 0.9975;
    if (r > th) { vec3 cp = (c+0.5+(vec3(h3(c+1.3),h3(c+2.7),h3(c+5.1))-0.5)*0.7)/sc; float dd = length(normalize(cp)-d)*sc;
      float b = exp(-dd*dd*(k==2?3.0:5.0)) * (0.5 + 1.4*(r-th)/(1.0-th)) * (k==2?0.75:1.0);
      vec3 tint = mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.7), h3(c+9.0)); col += tint*b*(0.8+band); }
  }
  // the abyss below the arena: darker, with a faint glow from far down
  col *= mix(1.0, 0.35, smoothstep(0.0, -0.6, d.y));
  col += uB*0.12*smoothstep(-0.4,-1.0,d.y);
  gl_FragColor = vec4(col, 1.0);
}`;
const SKY_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
 varying vec2 vN;
uniform samplerCube uSky; uniform vec3 uF, uR, uU, uVD, uVT1, uVT2, uVA, uVB; uniform vec2 uTan; uniform float uTime;
void main(){
  vec3 d = normalize(uF + uR*vN.x*uTan.x + uU*vN.y*uTan.y);
  vec3 col = textureCube(uSky, d).rgb;
  // the void rift: a swirling black hole with a hot accretion disc
  float fw = dot(d, uVD);
  if (fw > 0.6) {
    vec2 p = vec2(dot(d, uVT1), dot(d, uVT2)) / fw; float r = length(p), th = atan(p.y, p.x);
    float spiral = 0.5 + 0.5*sin(th*3.0 - log(r+0.001)*9.0 + uTime*1.6);
    float spiral2 = 0.5 + 0.5*sin(th*7.0 - log(r+0.001)*14.0 - uTime*2.3);
    float disc = smoothstep(0.62, 0.16, r) * smoothstep(0.075, 0.15, r);
    vec3 hot = mix(uVA, uVB, smoothstep(0.1, 0.5, r));
    col += hot * disc * (0.25 + 1.1*spiral*spiral2 + 0.6*spiral) * 1.4;
    col *= smoothstep(0.06, 0.085, r);                                        // the black core
    col += vec3(1.0,0.92,0.85) * exp(-pow((r-0.086)*70.0, 2.0)) * 2.2;        // photon ring
    col += uVA * exp(-r*5.0) * 0.25;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const FLOOR_VS = `attribute vec3 aPos; uniform mat4 uVP; varying vec3 vW; void main(){ vW=aPos; gl_Position=uVP*vec4(aPos,1.0); }`;
const LIGHTS = `uniform vec4 uL[8]; uniform vec3 uLC[8];`;
const FLOOR_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
 varying vec3 vW; ${LIGHTS}
uniform float uR, uTime, uNova, uBeat, uHurt; uniform vec3 uCol, uCol2, uCam;
void main(){
  float rad = length(vW.xz);
  if (rad > uR + 0.6) discard;
  vec2 p = vW.xz*0.62; vec2 rr = vec2(1.0, 1.7320508), h = rr*0.5;
  vec2 a = mod(p, rr)-h, b = mod(p-h, rr)-h; vec2 g = dot(a,a)<dot(b,b) ? a : b;
  vec2 q = abs(g); float hd = max(dot(q, vec2(0.5,0.8660254)), q.x);
  vec2 id = p - g;
  float line = smoothstep(0.43, 0.5, hd);
  float tileGlow = 0.5 + 0.5*sin(id.x*3.1 + id.y*1.7 + uTime*1.3);
  vec3 col = uCol*0.025 + uCol2*0.02*tileGlow;
  float ring = exp(-pow(rad - mod(uTime*9.0, uR+14.0), 2.0)*0.35);
  float ring2 = exp(-pow(rad - mod(uTime*9.0 + (uR+14.0)*0.5, uR+14.0), 2.0)*0.35);
  col += uCol * line * (0.2 + 0.7*(ring+ring2) + 0.25*uBeat);
  col += uCol * (ring+ring2) * 0.05;
  // centre emblem + rim
  col += uCol2 * exp(-rad*rad*0.6) * 0.9;
  col += uCol2 * exp(-pow((rad-3.2)*4.0,2.0)) * 0.45;
  col += uCol * exp(-pow((rad-uR)*2.2,2.0)) * 1.6;
  col += uCol2 * exp(-pow((rad-uR+1.4)*5.0,2.0)) * 0.5;
  // nova shockwave
  if (uNova > 0.0) col += vec3(0.9,0.95,1.0) * exp(-pow((rad-uNova)*1.2,2.0)) * 1.8;
  // light from shots and explosions pooling on the floor
  for (int i=0;i<8;i++){ vec3 d = uL[i].xyz - vW; float dist = length(d); float at = max(0.0, 1.0 - dist/uL[i].w); col += uLC[i] * at*at * (0.55 + line*1.4); }
  col = mix(col, vec3(0.7,0.05,0.1)*line, uHurt*0.5);
  float fade = smoothstep(uR+0.6, uR-0.4, rad);
  gl_FragColor = vec4(col*fade, 1.0);
}`;
const SOLID_VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aBary;
uniform mat4 uVP, uM; varying vec3 vN, vW, vB;
void main(){ vec4 w = uM*vec4(aPos,1.0); vW=w.xyz; vN = mat3(uM[0].xyz, uM[1].xyz, uM[2].xyz)*aNor; vB=aBary; gl_Position = uVP*w; }`;
const SOLID_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
 varying vec3 vN, vW, vB; ${LIGHTS}
uniform vec3 uColor, uEdgeCol, uCam, uKey, uAmb; uniform float uEdge, uFlash, uAlpha, uEmis, uLit, uRim;
void main(){
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  if (dot(n, v) < 0.0) n = -n;
  float dif = max(dot(n, uKey), 0.0);
  vec3 col = uColor*(uAmb + dif*0.85);
  if (uLit > 0.5) for (int i=0;i<8;i++){ vec3 d = uL[i].xyz - vW; float dist = length(d); float at = max(0.0, 1.0 - dist/uL[i].w); col += uColor*uLC[i]*at*at*max(dot(n, d/max(dist,0.001)),0.0)*1.6; }
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  col += uEdgeCol*fres*uRim;
  float e = min(min(vB.x, vB.y), vB.z);
  col = mix(col, uEdgeCol*1.7, 1.0 - smoothstep(0.0, uEdge, e));
  col += uColor*uEmis;
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col*uAlpha, uAlpha);
}`;
const FX_VS = `attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute float aK;
uniform mat4 uVP; varying vec2 vUV; varying vec4 vCol; varying float vK;
void main(){ vUV=aUV; vCol=aCol; vK=aK; gl_Position=uVP*vec4(aPos,1.0); }`;
const FX_FS = `precision mediump float; varying vec2 vUV; varying vec4 vCol; varying float vK;
void main(){
  vec2 c = vUV*2.0-1.0; float d = length(c); float a; vec3 col = vCol.rgb;
  if (vK < 0.5) a = exp(-d*d*4.5);                                            // soft glow
  else if (vK < 1.5) a = exp(-pow((d-0.8)*9.0, 2.0)) + exp(-d*d*9.0)*0.15;     // ring
  else if (vK < 2.5) { float ac = c.y; float al = vUV.x;                        // light trail (x: tail→head)
    a = exp(-ac*ac*5.0) * pow(al, 1.6); col = mix(col, vec3(1.0), exp(-ac*ac*40.0)*al); }
  else if (vK < 3.5) { a = max(exp(-abs(c.x)*16.0)*exp(-c.y*c.y*2.5), exp(-abs(c.y)*16.0)*exp(-c.x*c.x*2.5)) + exp(-d*d*10.0)*0.6; }  // sparkle
  else a = 1.0;                                                               // flat (shards)
  gl_FragColor = vec4(col*a*vCol.a, 1.0);
}`;
const BRIGHT_FS = `precision mediump float; varying vec2 vUV; uniform sampler2D uT; uniform float uThr;
void main(){ vec3 c = texture2D(uT, vUV).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c*smoothstep(uThr, uThr+0.3, l), 1.0); }`;
const BLUR_FS = `precision mediump float; varying vec2 vUV; uniform sampler2D uT; uniform vec2 uD;
void main(){ vec3 s = texture2D(uT, vUV).rgb*0.227;
  s += (texture2D(uT, vUV+uD*1.385).rgb + texture2D(uT, vUV-uD*1.385).rgb)*0.316;
  s += (texture2D(uT, vUV+uD*3.231).rgb + texture2D(uT, vUV-uD*3.231).rgb)*0.07;
  gl_FragColor = vec4(s, 1.0); }`;
const COMP_FS = `precision mediump float; varying vec2 vUV; uniform sampler2D uS, uB1, uB2;
uniform float uChroma, uTime, uFlash, uVig, uB1k, uB2k; uniform vec3 uFlashCol; uniform vec2 uRes;
float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 o = (vUV-0.5)*uChroma;
  vec3 c = vec3(texture2D(uS, vUV+o).r, texture2D(uS, vUV).g, texture2D(uS, vUV-o).b);
  c += texture2D(uB1, vUV).rgb*uB1k + texture2D(uB2, vUV).rgb*uB2k;
  c = (c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14);                                // ACES-style tone curve
  vec2 v = vUV-0.5; c *= 1.0 - dot(v,v)*uVig;
  c += (hh(vUV*uRes + uTime) - 0.5)*0.025;
  c *= 0.97 + 0.03*sin(vUV.y*uRes.y*3.14159);
  c = mix(c, uFlashCol, uFlash);
  gl_FragColor = vec4(c, 1.0);
}`;

// ── the renderer ──────────────────────────────────────────────
export class VoidGL {
  static supported() { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } }

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); });
    this.init();
  }

  init() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.slice(0, 200)); return s; };
    const prog = (vs, fs, attrs) => {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
      return { p, u };
    };
    this.P = {
      bake: prog(QUAD_VS, BAKE_FS, ['aP']), sky: prog(QUAD_VS, SKY_FS, ['aP']), floor: prog(FLOOR_VS, FLOOR_FS, ['aPos']),
      solid: prog(SOLID_VS, SOLID_FS, ['aPos', 'aNor', 'aBary']), fx: prog(FX_VS, FX_FS, ['aPos', 'aUV', 'aCol', 'aK']),
      bright: prog(QUAD_VS, BRIGHT_FS, ['aP']), blur: prog(QUAD_VS, BLUR_FS, ['aP']), comp: prog(QUAD_VS, COMP_FS, ['aP']),
    };
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const R = 27;
    this.floorBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-R, 0, -R, R, 0, -R, R, 0, R, -R, 0, -R, R, 0, R, -R, 0, R]), gl.STATIC_DRAW);
    this.meshes = {};
    for (const [k, m] of Object.entries(makeMeshes())) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW); this.meshes[k] = { b, n: m.count }; }
    this.fxData = new Float32Array(10 * 6 * 3000); this.fxN = 0;
    this.fxBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf); gl.bufferData(gl.ARRAY_BUFFER, this.fxData.byteLength, gl.DYNAMIC_DRAW);
    this.skies = {}; this.fbo = null; this.size = [0, 0];
  }

  // ── render targets ─────────────────────────────────────────
  target(w, h, depth) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (depth) { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, r); }
    return { t, f, w, h };
  }
  resize(w, h) {
    if (this.size[0] === w && this.size[1] === h && this.fbo) return;
    this.size = [w, h]; this.canvas.width = w; this.canvas.height = h;
    this.fbo = this.target(w, h, true);
    const w2 = Math.max(2, w >> 1), h2 = Math.max(2, h >> 1), w4 = Math.max(2, w >> 2), h4 = Math.max(2, h >> 2);
    this.half = [this.target(w2, h2), this.target(w2, h2)];
    this.quarter = [this.target(w4, h4), this.target(w4, h4)];
  }

  /** bake a theme's nebula + stars into a cube map (once per theme) */
  skyFor(th, size) {
    const key = th.name + size;
    if (this.skies[key]) return this.skies[key];
    const gl = this.gl, P = this.P.bake, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_CUBE_MAP, k, v);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.useProgram(P.p); gl.viewport(0, 0, size, size); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const faces = [[[1, 0, 0], [0, 0, -1], [0, -1, 0]], [[-1, 0, 0], [0, 0, 1], [0, -1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 0, -1], [-1, 0, 0], [0, -1, 0]]];
    gl.uniform3fv(P.u.uA, th.nebA); gl.uniform3fv(P.u.uB, th.nebB); gl.uniform3fv(P.u.uC, th.nebC); gl.uniform3fv(P.u.uBand, V3.norm(th.band));
    for (let i = 0; i < 6; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, tex, 0);
      gl.uniform3fv(P.u.uF, faces[i][0]); gl.uniform3fv(P.u.uR, faces[i][1]); gl.uniform3fv(P.u.uU, faces[i][2]);
      this.drawQuad();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f);
    return (this.skies[key] = tex);
  }

  drawQuad() { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  // ── additive effects buffer (built fresh each frame) ───────
  fxBegin() { this.fxN = 0; }
  fxVert(p, u, v, c, a, k) {
    if (this.fxN * 10 >= this.fxData.length) return;
    const d = this.fxData, i = this.fxN * 10;
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = u; d[i + 4] = v; d[i + 5] = c[0]; d[i + 6] = c[1]; d[i + 7] = c[2]; d[i + 8] = a; d[i + 9] = k;
    this.fxN++;
  }
  fxQuad(a, b, c, d, col, al, k) {
    this.fxVert(a, 0, 0, col, al, k); this.fxVert(b, 1, 0, col, al, k); this.fxVert(c, 1, 1, col, al, k);
    this.fxVert(a, 0, 0, col, al, k); this.fxVert(c, 1, 1, col, al, k); this.fxVert(d, 0, 1, col, al, k);
  }
  /** camera-facing sprite */
  sprite(p, size, col, al, kind = 0, rot = 0) {
    const R = this.camR, U = this.camU, c = Math.cos(rot) * size, s = Math.sin(rot) * size;
    const ax = [R[0] * c + U[0] * s, R[1] * c + U[1] * s, R[2] * c + U[2] * s], ay = [-R[0] * s + U[0] * c, -R[1] * s + U[1] * c, -R[2] * s + U[2] * c];
    this.fxQuad(V3.sub(V3.sub(p, ax), ay), V3.sub(V3.add(p, ax), ay), V3.add(V3.add(p, ax), ay), V3.add(V3.sub(p, ax), ay), col, al, kind);
  }
  /** a light trail from tail to head */
  trail(tail, head, w, col, al) {
    const mid = V3.mul(V3.add(tail, head), 0.5), dir = V3.sub(head, tail);
    let side = V3.cross(dir, V3.sub(this.camPos, mid)); const l = V3.len(side); if (l < 1e-6) return;
    side = V3.mul(side, w / l);
    this.fxQuad(V3.sub(tail, side), V3.sub(head, side), V3.add(head, side), V3.add(tail, side), col, al, 2);
    // the uv layout of fxQuad: (0,0) (1,0) (1,1) (0,1) → x runs tail→head, y across
  }
  /** a flat glowing triangle (shards) */
  tri(a, b, c, col, al) { this.fxVert(a, 0.5, 0.5, col, al, 4); this.fxVert(b, 0.5, 0.5, col, al, 4); this.fxVert(c, 0.5, 0.5, col, al, 4); }
  /** a flat ring lying on a plane (n = normal) */
  flatRing(cen, n, r, col, al) {
    const t1 = V3.norm(V3.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = V3.cross(n, t1);
    const a = V3.add(cen, V3.add(V3.mul(t1, -r), V3.mul(t2, -r))), b = V3.add(cen, V3.add(V3.mul(t1, r), V3.mul(t2, -r)));
    const c = V3.add(cen, V3.add(V3.mul(t1, r), V3.mul(t2, r))), d = V3.add(cen, V3.add(V3.mul(t1, -r), V3.mul(t2, r)));
    this.fxQuad(a, b, c, d, col, al, 1);
  }

  // ── the frame ──────────────────────────────────────────────
  /**
   * S = { t, cam:{pos, yaw, pitch, fov}, theme, skySize, lights:[[x,y,z,r,  r,g,b]], solids:[{mesh, m, color, edge, emis, flash, alpha, edgeW}],
   *       gun:{m, color, edge, emis, coil}, fx: fn(renderer) adds sprites/trails, post:{chroma, flash, flashCol, vig, bloom}, nova, beat, hurt }
   */
  render(S, w, h) {
    const gl = this.gl;
    if (this.lost) return null;
    this.resize(w, h);
    const th = S.theme, cam = S.cam;
    const f = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
    const view = lookDir(cam.pos, f), aspect = w / h, proj = persp(cam.fov, aspect, 0.05, 600), vp = mul4(proj, view);
    const R = V3.norm(V3.cross(f, [0, 1, 0])), U = V3.cross(R, f);
    this.camR = R; this.camU = U; this.camPos = cam.pos;
    const sky = this.skyFor(th, S.skySize);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.f); gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

    // 1. sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    let P = this.P.sky; gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, sky); gl.uniform1i(P.u.uSky, 0);
    const tanY = Math.tan(cam.fov / 2);
    gl.uniform3fv(P.u.uF, f); gl.uniform3fv(P.u.uR, R); gl.uniform3fv(P.u.uU, U); gl.uniform2f(P.u.uTan, tanY * aspect, tanY);
    const vd = V3.norm(th.vortex), vt1 = V3.norm(V3.cross(vd, [0, 1, 0])), vt2 = V3.cross(vd, vt1);
    gl.uniform3fv(P.u.uVD, vd); gl.uniform3fv(P.u.uVT1, vt1); gl.uniform3fv(P.u.uVT2, vt2);
    gl.uniform3fv(P.u.uVA, th.vortexA); gl.uniform3fv(P.u.uVB, th.vortexB); gl.uniform1f(P.u.uTime, S.t);
    this.drawQuad();

    // lights (shared by floor and solids)
    const L = new Float32Array(32), LC = new Float32Array(24);
    for (let i = 0; i < 8; i++) { const l = S.lights[i]; if (!l) { L[i * 4 + 3] = 0.001; continue; } L.set([l[0], l[1], l[2], l[3]], i * 4); LC.set([l[4], l[5], l[6]], i * 3); }

    // 2. floor
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    P = this.P.floor; gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, vp); gl.uniform1f(P.u.uR, 26); gl.uniform1f(P.u.uTime, S.t); gl.uniform1f(P.u.uNova, S.nova || 0);
    gl.uniform1f(P.u.uBeat, S.beat || 0); gl.uniform1f(P.u.uHurt, S.hurt || 0);
    gl.uniform3fv(P.u.uCol, th.floor); gl.uniform3fv(P.u.uCol2, th.floor2); gl.uniform3fv(P.u.uCam, cam.pos);
    gl.uniform4fv(P.u.uL, L); gl.uniform3fv(P.u.uLC, LC);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 3. solids
    P = this.P.solid; gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, vp); gl.uniform3fv(P.u.uCam, cam.pos); gl.uniform3fv(P.u.uKey, V3.norm([th.vortex[0], 0.8, th.vortex[2]]));
    gl.uniform3fv(P.u.uAmb, [0.16, 0.15, 0.22]); gl.uniform4fv(P.u.uL, L); gl.uniform3fv(P.u.uLC, LC); gl.uniform1f(P.u.uLit, 1);
    const solids = [...S.statics, ...S.solids];
    const opaque = solids.filter((o) => (o.alpha ?? 1) >= 1), clear = solids.filter((o) => (o.alpha ?? 1) < 1);
    for (const o of opaque) this.drawSolid(o);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const o of clear) this.drawSolid(o);

    // 4. additive glow
    this.fxBegin(); S.fx(this);
    if (this.fxN) {
      P = this.P.fx; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, vp);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fxData.subarray(0, this.fxN * 10));
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
      gl.drawArrays(gl.TRIANGLES, 0, this.fxN);
    }

    // 5. the arm cannon, on top of everything
    if (S.gun) {
      gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.depthMask(true);
      P = this.P.solid; gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, proj); gl.uniform3fv(P.u.uCam, [0, 0, 0]); gl.uniform3fv(P.u.uKey, V3.norm([-0.3, 0.8, 0.5])); gl.uniform1f(P.u.uLit, 0);
      gl.uniform3fv(P.u.uAmb, [0.3, 0.28, 0.36]);
      this.drawSolid(S.gun.body); this.drawSolid(S.gun.coils);
      if (S.gun.fx) {                                      // muzzle flash etc. in view space
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
        this.camR = [1, 0, 0]; this.camU = [0, 1, 0]; this.camPos = [0, 0, 0];
        this.fxBegin(); S.gun.fx(this);
        if (this.fxN) {
          P = this.P.fx; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, proj);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fxData.subarray(0, this.fxN * 10));
          gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
          gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
          gl.drawArrays(gl.TRIANGLES, 0, this.fxN);
        }
      }
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);

    // 6. bloom + composite
    const post = S.post;
    const pass = (prog, dst, setup) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : w, dst ? dst.h : h); gl.useProgram(prog.p); setup(prog.u); this.drawQuad(); };
    const tex = (unit, t, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); };
    const [h0, h1] = this.half, [q0, q1] = this.quarter;
    pass(this.P.bright, h0, (u) => { tex(0, this.fbo.t, u.uT); gl.uniform1f(u.uThr, post.thr ?? 0.55); });
    const blur = (a, b, n) => { for (let i = 0; i < n; i++) {
      pass(this.P.blur, b, (u) => { tex(0, a.t, u.uT); gl.uniform2f(u.uD, 1 / a.w, 0); });
      pass(this.P.blur, a, (u) => { tex(0, b.t, u.uT); gl.uniform2f(u.uD, 0, 1 / a.h); });
    } };
    blur(h0, h1, post.lo ? 1 : 2);
    pass(this.P.blur, q0, (u) => { tex(0, h0.t, u.uT); gl.uniform2f(u.uD, 0.5 / h0.w, 0.5 / h0.h); });
    blur(q0, q1, post.lo ? 1 : 3);
    pass(this.P.comp, null, (u) => {
      tex(0, this.fbo.t, u.uS); tex(1, h0.t, u.uB1); tex(2, q0.t, u.uB2);
      gl.uniform1f(u.uB1k, post.bloom * 0.7); gl.uniform1f(u.uB2k, post.bloom * 1.0);
      gl.uniform1f(u.uChroma, post.chroma || 0); gl.uniform1f(u.uTime, S.t % 100); gl.uniform1f(u.uFlash, post.flash || 0);
      gl.uniform3fv(u.uFlashCol, post.flashCol || [1, 1, 1]); gl.uniform1f(u.uVig, post.vig ?? 1.1); gl.uniform2f(u.uRes, w, h);
    });
    return this.canvas;
  }

  drawSolid(o) {
    const gl = this.gl, P = this.P.solid, m = this.meshes[o.mesh];
    if (!m) return;
    gl.uniformMatrix4fv(P.u.uM, false, o.m);
    gl.uniform3fv(P.u.uColor, o.color); gl.uniform3fv(P.u.uEdgeCol, o.edge || o.color);
    gl.uniform1f(P.u.uEdge, o.edgeW ?? 0.05); gl.uniform1f(P.u.uRim, o.rim ?? 0.9); gl.uniform1f(P.u.uFlash, o.flash || 0); gl.uniform1f(P.u.uAlpha, o.alpha ?? 1); gl.uniform1f(P.u.uEmis, o.emis || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
    gl.disableVertexAttribArray(3);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
  }
}

/** the triangles of a mesh in world space (for shattering an enemy into pieces) */
let ALL = null;
export function meshTris(name, m, max = 40) {
  const src = (ALL ||= makeMeshes())[name].data, out = [];
  const n = src.length / 27, step = Math.max(1, Math.floor(n / max));
  for (let i = 0; i < n; i += step) out.push([0, 1, 2].map((k) => { const o = (i * 3 + k) * 9; return xform(m, src[o], src[o + 1], src[o + 2]); }));
  return out;
}

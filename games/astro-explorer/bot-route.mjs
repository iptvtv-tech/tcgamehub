// Route knowledge for the Astro Explorer benchmark bot (bench.mjs). Not used by the game.
// For one planet (as its rock stands now) and one set of abilities, this explores everything the
// astronaut can do with the game's own stepPlayer, the same way the level checker does (a new
// choice every 1/15 s), and then works backwards from the exit: every explored spot gets "moves
// left to the exit". The bot follows that downhill, re-reading its real position after every move,
// so a knock from an alien only puts it somewhere else on the same map of distances.
// A second set of distances leads to the nearest spike (for the bot's deliberate mistake).
import { makePlayer, stepPlayer, atExit, touchesSpikes, DT, TILE } from './world.js';

export const HOLD = 8;                              // ticks per move
// moves: [dir, jump (0 release · 1 press & hold · 2 keep holding · 3 tap), dash]
export const MV = [];
for (const d of [-1, 0, 1]) for (const j of [0, 1, 2, 3]) MV.push([d, j, 0]);
for (const d of [-1, 1]) for (const j of [0, 2]) MV.push([d, j, 1]);

/** The stick-and-button state for tick `t` (0..HOLD-1) of move `mv`. */
export function inputAt(mv, t, inp = {}) {
  inp.dir = mv[0]; inp.jumpPress = t === 0 && (mv[1] === 1 || mv[1] === 3);
  inp.jumpHeld = mv[1] === 1 || mv[1] === 2 || (mv[1] === 3 && t < 2); inp.dashPress = t === 0 && mv[2] === 1;
  return inp;
}

/** Which moves can make a difference from state p (as the level checker prunes them). */
export function movesFor(p, ab, out) {
  let n = 0;
  const cut = p.jumped && p.jumpHeld && p.vy < 0;
  for (let i = 0; i < MV.length; i++) {
    const d = MV[i], j = d[1];
    if (d[2]) { if (ab.dash && p.dashT <= 0 && p.dashCD < 0.1 && (p.ground || p.airDash || p.cling) && (j === 0 || cut)) out[n++] = i; continue; }
    if (p.dashT > 0) { if ((j === 0 || j === 1) && (d[0] === 0 || p.dashT <= HOLD * DT)) out[n++] = i; continue; }
    if (p.ground) { if (j !== 2) out[n++] = i; continue; }
    if (j === 2) { if (cut) out[n++] = i; continue; }
    if (j === 0) { out[n++] = i; continue; }
    if (j === 1 && (p.vy > 0 || (ab.double && p.airJumps > 0) || (ab.cling && (p.cling || p.wallCoy > 0)))) out[n++] = i;
  }
  return n;
}

const Q = (v, q) => Math.round(v / q);
function makeKey(ab) {
  const base = (p) => {
    const g = p.ground, kx = g ? Q(p.x, 4) : Q(p.x, 6) + 4096, ky = g ? Q(p.y, 4) : Q(p.y, 6);
    const kvx = Math.max(0, Math.min(18, Q(p.vx, 50) + 9)), kvy = Math.max(0, Math.min(13, Q(p.vy, 100) + 6));
    let k = ((kx * 512 + ky) * 19 + kvx) * 14 + kvy;
    if (ab.dash) k = k * 4 + (p.dashT > 0 ? Math.min(3, Math.ceil(p.dashT / 0.06)) : 0);
    if (ab.cling) k = k * 12 + (p.cling < 0 ? 1 : p.cling > 0 ? 2 : 0) * 4 + (p.wjT > 0 ? 2 : 0) + (p.wallCoy > 0 ? 1 : 0);
    return k * 16;
  };
  const flags = (p) => (p.jumped && p.jumpHeld && p.vy < 0 ? 1 : 0) + (ab.double && p.airJumps > 0 ? 2 : 0) + (ab.dash && p.airDash ? 4 : 0) + (ab.dash && p.dashCD <= 0.05 ? 8 : 0);
  const USED = 1 | (ab.double ? 2 : 0) | (ab.dash ? 12 : 0);
  const SUPER = [];
  for (let f = 0; f < 16; f++) { SUPER.push([]); for (let g = 0; g < 16; g++) if (g !== f && (g & f) === f && (g & ~USED) === 0) SUPER[f].push(g); }
  return { base, flags, SUPER };
}

const NF = 20;
const FAR = 65535;

/** Explore map m with abilities ab. Returns { lookup(p) → { toExit, toSpike } | null, exitReachable }. */
export function buildRoute(m, ab) {
  const K = makeKey(ab);
  let cap = 1 << 18, S = new Float32Array(cap * NF);
  const p = makePlayer(m), B = new Float32Array(NF);
  const restore = () => {
    p.x = B[0]; p.y = B[1]; p.vx = B[2]; p.vy = B[3]; p.coyote = B[4]; p.buffer = B[5]; p.dashT = B[6]; p.dashCD = B[7]; p.dashBuf = B[8];
    p.wallCoy = B[9]; p.wjT = B[10]; p.face = B[11]; p.ground = B[12] === 1; p.jumpHeld = B[13] === 1; p.jumped = B[14] === 1;
    p.airJumps = B[15]; p.airDash = B[16] === 1; p.dashDir = B[17]; p.cling = B[18]; p.wallSide = B[19]; p.kbT = 0;
  };
  const save = (i) => {
    const o = i * NF;
    S[o] = p.x; S[o + 1] = p.y; S[o + 2] = p.vx; S[o + 3] = p.vy; S[o + 4] = p.coyote; S[o + 5] = p.buffer; S[o + 6] = p.dashT; S[o + 7] = p.dashCD;
    S[o + 8] = p.dashBuf; S[o + 9] = p.wallCoy; S[o + 10] = p.wjT; S[o + 11] = p.face; S[o + 12] = p.ground ? 1 : 0; S[o + 13] = p.jumpHeld ? 1 : 0;
    S[o + 14] = p.jumped ? 1 : 0; S[o + 15] = p.airJumps; S[o + 16] = p.airDash ? 1 : 0; S[o + 17] = p.dashDir; S[o + 18] = p.cling; S[o + 19] = p.wallSide;
  };
  let hcap = 1 << 20, hk = new Float64Array(hcap).fill(-1), hv = new Int32Array(hcap), hn = 0;
  const slot = (k, c) => ((k % 1048573) * 40503 + Math.floor(k / 1048573) * 9973) % c;
  const hget = (k) => { let h = slot(k, hcap); while (hk[h] !== -1) { if (hk[h] === k) return hv[h]; h = (h + 1) & (hcap - 1); } return -1; };
  const hput = (k, v) => {
    if (++hn * 2 > hcap) {
      const ok = hk, ov = hv; hcap *= 2; hk = new Float64Array(hcap).fill(-1); hv = new Int32Array(hcap);
      for (let i = 0; i < ok.length; i++) if (ok[i] !== -1) { let h = slot(ok[i], hcap); while (hk[h] !== -1) h = (h + 1) & (hcap - 1); hk[h] = ok[i]; hv[h] = ov[i]; }
    }
    let h = slot(k, hcap); while (hk[h] !== -1) h = (h + 1) & (hcap - 1); hk[h] = k; hv[h] = v;
  };
  const find = (q) => {
    const b0 = K.base(q), fl = K.flags(q);
    let j = hget(b0 + fl);
    if (j < 0) for (const g of K.SUPER[fl]) { j = hget(b0 + g); if (j >= 0) break; }
    return j;
  };

  const inp = {}, list = new Int8Array(MV.length);
  for (let i = 0; i < 30; i++) stepPlayer(p, inputAt(MV[4], 1, inp), m, ab);   // settle on the ground (MV[4] = stand still, no jump)
  save(0); hput(K.base(p) + K.flags(p), 0);
  let N = 1, succ = new Int32Array(1 << 21), nSucc = 0, succStart = new Int32Array(cap + 1);
  const goal = [], spiky = [];
  for (let i = 0; i < N; i++) {
    for (let f = 0, o = i * NF; f < NF; f++) B[f] = S[o + f];
    restore();
    if (succStart.length < N + 2) { const g = new Int32Array(succStart.length * 2); g.set(succStart); succStart = g; }
    succStart[i] = nSucc;
    const nm = movesFor(p, ab, list);
    let hitsSpike = false;
    for (let q = 0; q < nm; q++) {
      const mv = MV[list[q]];
      restore();
      let ok = true;
      for (let t = 0; t < HOLD; t++) {
        stepPlayer(p, inputAt(mv, t, inp), m, ab);
        if (p.x < 0 || p.y < 0 || p.x > m.w || p.y > m.h + 40 || touchesSpikes(p, m)) { ok = false; break; }
      }
      if (!ok) { hitsSpike = true; continue; }
      let j = find(p);
      if (j < 0) {
        if (N === cap) { cap *= 2; const S2 = new Float32Array(cap * NF); S2.set(S); S = S2; }
        j = N++; save(j); hput(K.base(p) + K.flags(p), j);
        if (m.exit && atExit(p, m)) goal.push(j);
      }
      if (nSucc === succ.length) { const g = new Int32Array(succ.length * 2); g.set(succ); succ = g; }
      succ[nSucc++] = j;
    }
    if (hitsSpike) spiky.push(i);
  }
  if (succStart.length < N + 1) { const g = new Int32Array(N + 1); g.set(succStart); succStart = g; }
  succStart[N] = nSucc;
  // backwards: predecessor lists, then breadth-first from the goals
  const start = new Int32Array(N + 1);
  for (let e = 0; e < nSucc; e++) start[succ[e] + 1]++;
  for (let i = 0; i < N; i++) start[i + 1] += start[i];
  const pred = new Int32Array(nSucc), fill = start.slice(0, N);
  for (let i = 0; i < N; i++) for (let e = succStart[i]; e < succStart[i + 1]; e++) pred[fill[succ[e]]++] = i;
  const back = (from) => {
    const d = new Uint16Array(N).fill(FAR);
    let q = from.slice(); for (const j of q) d[j] = 0;
    for (let depth = 1; q.length; depth++) {
      const nq = [];
      for (const j of q) for (let e = start[j]; e < start[j + 1]; e++) { const i = pred[e]; if (d[i] === FAR) { d[i] = depth; nq.push(i); } }
      q = nq;
    }
    return d;
  };
  const toExit = back(goal), toSpike = back(spiky);
  S = null; succ = null;
  return {
    states: N, exitReachable: toExit[0] !== FAR, startToExit: toExit[0],
    /** Moves left from state q (a player object): null when q is somewhere the search never went. */
    lookup(q) { const j = find(q); return j < 0 ? null : { toExit: toExit[j], toSpike: toSpike[j] }; },
  };
}
export { FAR };

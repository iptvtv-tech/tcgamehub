// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — the world: an island of 64 × 40 × 64 blocks with
//  plains, forests, deserts and snowy hills, caves, ores, lakes and lava,
//  plus sky light and torch light (flood-filled, 0–15 like a real block game).
// ─────────────────────────────────────────────────────────────
import { B } from './items.js';

export const SX = 64, SY = 40, SZ = 64, SEA = 14;
export const N = SX * SY * SZ;
export const idx = (x, y, z) => (y * SZ + z) * SX + x;

/** Blocks light (and sight) can pass through */
const CLEAR = new Uint8Array(64);
for (const b of [B.AIR, B.WATER, B.TORCH, B.LEAVES]) CLEAR[b] = 1;
export const isClear = (v) => CLEAR[v] === 1;

function makeNoise(rand) {
  const P = new Float32Array(4096).map(() => rand());
  const h = (x, y, z) => P[((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & 4095];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = sm(x - x0), fy = sm(y - y0), fz = sm(z - z0);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(x0, y0, z0), h(x0 + 1, y0, z0), fx), l(h(x0, y0 + 1, z0), h(x0 + 1, y0 + 1, z0), fx), fy),
      l(l(h(x0, y0, z0 + 1), h(x0 + 1, y0, z0 + 1), fx), l(h(x0, y0 + 1, z0 + 1), h(x0 + 1, y0 + 1, z0 + 1), fx), fy), fz);
  };
}

export class World {
  constructor() {
    this.b = new Uint8Array(N);         // blocks
    this.sky = new Uint8Array(N);       // sky light 0..15
    this.blk = new Uint8Array(N);       // block light 0..15 (torches, lava)
    this.top = new Int8Array(SX * SZ);  // highest solid block per column
    this.queue = new Int32Array(N * 2);
    this.dirty = false;
  }

  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= SY) return B.AIR;
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return B.BEDROCK; // the invisible edge of the world
    return this.b[idx(x, y, z)];
  }
  inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < SX && z < SZ && y < SY; }
  set(x, y, z, v) {
    if (!this.inside(x, y, z)) return;
    this.b[idx(x, y, z)] = v;
    this.dirty = true;
    this.updateTop(x, z);
  }
  updateTop(x, z) { let y = SY - 1; while (y > 0 && isClear(this.b[idx(x, y, z)]) && this.b[idx(x, y, z)] !== B.LEAVES) y--; this.top[z * SX + x] = y; }
  /** light at a cell: [sky 0..1, block 0..1] */
  light(x, y, z) {
    if (y >= SY) return [1, 0];
    if (!this.inside(x, y, z)) return [1, 0];
    const i = idx(x, y, z); return [this.sky[i] / 15, this.blk[i] / 15];
  }

  // ── Generation ───────────────────────────────────────────
  generate(rng) {
    const b = this.b, R = rng.next;
    const n = makeNoise(R), n2 = makeNoise(R);
    b.fill(B.AIR);
    const H = new Int8Array(SX * SZ), biome = new Uint8Array(SX * SZ); // 0 plains 1 forest 2 desert 3 snow
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const bi = n(x / 34, 7.3, z / 34), fo = n2(x / 18, 1.5, z / 18);
      let h = 17 + (n(x / 16, 0.5, z / 16) - 0.5) * 12 + (n(x / 6, 3.5, z / 6) - 0.5) * 4;
      let kind = fo > 0.55 ? 1 : 0;
      if (bi < 0.36) { kind = 2; h = 16 + (h - 17) * 0.45; }
      if (bi > 0.64) { kind = 3; h += (bi - 0.64) * 40 + (n(x / 9, 9.1, z / 9) - 0.5) * 6; }
      // make it an island: sink the edges below the sea
      const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      if (edge < 12) h = 8 + (h - 8) * Math.pow(edge / 12, 1.4);
      h = Math.round(Math.max(4, Math.min(SY - 6, h)));
      H[z * SX + x] = h; biome[z * SX + x] = kind;
      for (let y = 0; y <= h; y++) {
        let v;
        if (y === 0) v = B.BEDROCK;
        else if (y < h - 3) v = B.STONE;
        else if (kind === 2) v = y < h - 1 ? B.SANDSTONE : B.SAND;
        else if (y < h) v = B.DIRT;
        else v = h <= SEA + 1 ? (R() < 0.15 && h < SEA ? B.GRAVEL : B.SAND) : kind === 3 ? B.SNOW : B.GRASS;
        if (h <= SEA + 1 && y >= h - 2 && y > 0 && kind !== 2 && y < h) v = B.SAND;
        b[idx(x, y, z)] = v;
      }
      for (let y = h + 1; y <= SEA; y++) b[idx(x, y, z)] = B.WATER;
    }
    // Caves: winding tunnels where two noise fields cross, plus a few big caverns
    const c1 = makeNoise(R), c2 = makeNoise(R), c3 = makeNoise(R);
    for (let y = 1; y < SY; y++) for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
      const h = H[z * SX + x];
      const maxY = h <= SEA + 2 ? h - 4 : h - (c3(x / 7, 5, z / 7) > 0.62 ? 0 : 3);
      if (y > maxY) continue;
      const v = b[idx(x, y, z)];
      if (v === B.BEDROCK || v === B.WATER) continue;
      const a = Math.abs(c1(x / 11, y / 7, z / 11) - 0.5), bb = Math.abs(c2(x / 11, y / 7 + 9, z / 11) - 0.5);
      const cav = c3(x / 9, y / 6 + 30, z / 9);
      if ((a < 0.045 && bb < 0.07) || (cav > 0.74 && y < 22)) b[idx(x, y, z)] = y <= 3 ? B.LAVA : B.AIR;
    }
    // never let a cave cut under the sea: refill anything next to water
    for (let y = 1; y < SY; y++) for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
      const i = idx(x, y, z);
      if (b[i] !== B.AIR) continue;
      if (b[idx(x + 1, y, z)] === B.WATER || b[idx(x - 1, y, z)] === B.WATER || b[idx(x, y, z + 1)] === B.WATER || b[idx(x, y, z - 1)] === B.WATER || (y + 1 < SY && b[idx(x, y + 1, z)] === B.WATER)) b[i] = B.STONE;
    }
    // Ores in veins
    const vein = (ore, count, size, maxY, minY = 1) => {
      for (let k = 0; k < count; k++) {
        let x = 1 + Math.floor(R() * (SX - 2)), z = 1 + Math.floor(R() * (SZ - 2)), y = minY + Math.floor(R() * (maxY - minY));
        for (let s = 0; s < size; s++) {
          if (this.inside(x, y, z) && b[idx(x, y, z)] === B.STONE) b[idx(x, y, z)] = ore;
          const d = Math.floor(R() * 6); if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
        }
      }
    };
    vein(B.COAL_ORE, 90, 8, 30);
    vein(B.IRON_ORE, 60, 6, 22);
    vein(B.GOLD_ORE, 22, 5, 12);
    vein(B.CRYSTAL_ORE, 14, 4, 8);
    vein(B.GRAVEL, 24, 10, 20);
    vein(B.CRYSTAL_ORE, 3, 2, 14, 9);     // a few higher up, for lucky explorers
    // Trees & cacti
    const trees = [];
    for (let z = 3; z < SZ - 3; z++) for (let x = 3; x < SX - 3; x++) {
      const h = H[z * SX + x], kind = biome[z * SX + x], top = b[idx(x, h, z)];
      if (h <= SEA + 1 || h > SY - 9) continue;
      const p = R();
      if (kind === 2 && top === B.SAND && p < 0.012) { const ch = 2 + Math.floor(R() * 2); for (let y = 1; y <= ch; y++) b[idx(x, h + y, z)] = B.CACTUS; continue; }
      if ((top === B.GRASS || top === B.SNOW) && p < (kind === 1 ? 0.085 : kind === 3 ? 0.03 : 0.02)) {
        if (trees.some(([tx, tz]) => Math.abs(tx - x) < 3 && Math.abs(tz - z) < 3)) continue;
        trees.push([x, z]);
        this.tree(x, h, z, kind === 3, R);
      }
    }
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) this.updateTop(x, z);
    this.heights = H; this.biome = biome;
    this.relight();
  }

  tree(x, g, z, spruce, R) {
    const b = this.b, th = 4 + Math.floor(R() * 3);
    if (g + th + 2 >= SY) return;
    b[idx(x, g, z)] = B.DIRT;
    for (let y = 1; y <= th; y++) b[idx(x, g + y, z)] = B.LOG;
    if (spruce) {
      for (let y = 2; y <= th + 1; y++) {
        const rad = y === th + 1 ? 0 : (th - y) % 2 === 0 ? 2 : 1;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + 1) continue;
          const i = idx(x + dx, g + y, z + dz); if (b[i] === B.AIR) b[i] = B.LEAVES;
        }
      }
      return;
    }
    for (let y = th - 2; y <= th + 1; y++) {
      const rad = y >= th ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && R() < 0.7) continue;
        if (y === th + 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
        const i = idx(x + dx, g + y, z + dz); if (b[i] === B.AIR) b[i] = B.LEAVES;
      }
    }
  }

  /** A good place to stand: grass near the middle of the island. */
  findSpawn() {
    const H = this.heights;
    let best = null, bestD = 1e9;
    for (let z = 8; z < SZ - 8; z++) for (let x = 8; x < SX - 8; x++) {
      const h = H[z * SX + x];
      if (this.b[idx(x, h, z)] !== B.GRASS || this.b[idx(x, h + 1, z)] !== B.AIR || this.b[idx(x, h + 2, z)] !== B.AIR) continue;
      const d = Math.hypot(x - SX / 2, z - SZ / 2);
      if (d < bestD) { bestD = d; best = [x + 0.5, h + 1, z + 0.5]; }
    }
    return best || [SX / 2 + 0.5, SY - 2, SZ / 2 + 0.5];
  }

  // ── Light (flood fill) ───────────────────────────────────
  relight() {
    const b = this.b, sky = this.sky, blk = this.blk, q = this.queue;
    sky.fill(0); blk.fill(0);
    let head = 0, tail = 0;
    // sky light pours straight down each column
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let l = 15;
      for (let y = SY - 1; y >= 0; y--) {
        const i = idx(x, y, z), v = b[i];
        if (!CLEAR[v]) break;
        if (v === B.LEAVES) l -= 2; else if (v === B.WATER) l -= 1;
        if (l <= 0) break;
        sky[i] = l; q[tail++] = i;
      }
    }
    // …then spreads sideways and into caves, one less per step
    const spread = (arr) => {
      while (head < tail) {
        const i = q[head++], l = arr[i];
        if (l <= 1) continue;
        const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
        const nb = [x > 0 ? i - 1 : -1, x < SX - 1 ? i + 1 : -1, z > 0 ? i - SX : -1, z < SZ - 1 ? i + SX : -1, y > 0 ? i - SX * SZ : -1, y < SY - 1 ? i + SX * SZ : -1];
        for (const j of nb) {
          if (j < 0) continue;
          const v = b[j];
          if (!CLEAR[v]) continue;
          const nl = l - (v === B.LEAVES || v === B.WATER ? 2 : 1);
          if (nl > arr[j]) { arr[j] = nl; if (tail < q.length) q[tail++] = j; }
        }
      }
    };
    spread(sky);
    // torches and lava
    head = 0; tail = 0;
    for (let i = 0; i < N; i++) {
      const v = b[i];
      if (v === B.TORCH) { blk[i] = 14; q[tail++] = i; }
      else if (v === B.LAVA) {
        // lava lights the air around it
        const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
          if (!this.inside(x + dx, y + dy, z + dz)) continue;
          const j = idx(x + dx, y + dy, z + dz);
          if (CLEAR[b[j]] && blk[j] < 12) { blk[j] = 12; q[tail++] = j; }
        }
      }
    }
    spread(blk);
    this.dirty = false;
  }
}

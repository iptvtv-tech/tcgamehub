// ─────────────────────────────────────────────────────────────
//  ASTRO EXPLORER — the maps. Each planet is designed as rooms carved out of solid rock, with
//  ledges, spikes and markers placed by column and row, and built into tile rows when this module
//  loads (no build step). See them as text with: node games/astro-explorer/check.mjs --print=Name
//  and prove them with: node games/astro-explorer/check.mjs
//
//  Tiles:   # rock   . air   = one-way ledge   ^ floor spikes   v ceiling spikes   x cracked rock
//           D a lair's gate
//  Markers: S spawn   E exit beacon   * star dust   A ability capsule   B rest beacon   G guardian
//           T treasure chest   c ground alien slot   f flying alien slot   t acid pod slot
//  Columns run left to right from 0, rows top to bottom from 0.
// ─────────────────────────────────────────────────────────────

class Grid {
  constructor(name, w, h) { this.name = name; this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill('#')); }
  ok(c, r) { if (c < 0 || r < 0 || c >= this.w || r >= this.h) throw new Error(`${this.name}: (${c},${r}) is off the map`); }
  fill(c0, r0, c1, r1, ch) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { this.ok(c, r); this.g[r][c] = ch; } return this; }
  air(c0, r0, c1, r1) { return this.fill(c0, r0, c1, r1, '.'); }
  rock(c0, r0, c1, r1) { return this.fill(c0, r0, c1, r1, '#'); }
  ledge(c0, c1, r) { return this.fill(c0, r, c1, r, '='); }
  spikes(c0, c1, r) { return this.fill(c0, r, c1, r, '^'); }
  icicles(c0, c1, r) { return this.fill(c0, r, c1, r, 'v'); }
  crack(c, r0, r1 = r0) { return this.fill(c, r0, c, r1, 'x'); }
  gate(c, r0, r1) { return this.fill(c, r0, c, r1, 'D'); }
  put(c, r, ch) {
    this.ok(c, r);
    if (this.g[r][c] !== '.') throw new Error(`${this.name}: marker ${ch} at (${c},${r}) sits on "${this.g[r][c]}", not air`);
    this.g[r][c] = ch; return this;
  }
  dust(...cells) { for (const [c, r] of cells) this.put(c, r, '*'); return this; }
  rows() { return this.g.map((row) => row.join('')); }
}

// ── 1. LANDING SITE ──────────────────────────────────────────
// The crash site. Run, jump, blade, pogo over a spike pit. The beacon is in the room past the big
// cavern; the capsule (the double jump, first time round) waits in the little cave under it; the exit
// is up the east shaft. With the double jump, the high shelf in the cavern pays out.
function landingSite() {
  const m = new Grid('Landing Site', 60, 34);
  // spawn cave and the tunnel east
  m.air(1, 22, 14, 27).air(15, 25, 19, 27);
  m.put(3, 27, 'S').dust([8, 26], [11, 25], [14, 26]);
  m.put(12, 27, 'c');
  // the big cavern: floor row 29, a spike pit, ledges climbing to a high shelf
  m.air(20, 6, 40, 28).air(41, 10, 41, 28);
  m.air(28, 29, 31, 29).spikes(28, 31, 30);
  m.dust([29, 26], [30, 25], [31, 26]);                   // over the pit: jump (or pogo) through them
  m.ledge(34, 38, 26).dust([36, 25]);
  m.ledge(29, 33, 23).dust([31, 22]);
  m.ledge(23, 27, 20).dust([25, 19]);
  m.ledge(31, 36, 17).dust([33, 16]);
  m.ledge(24, 28, 14).dust([26, 13]);
  m.ledge(33, 38, 9).dust([34, 8], [37, 8]);             // the high shelf: double jump from the ledge below
  m.put(24, 28, 'c').put(38, 28, 'c').put(36, 21, 'f').put(30, 11, 'f');
  // a secret pocket in the cavern's west wall, behind cracked rock (stand on the little ledge)
  m.ledge(20, 22, 18);
  m.air(15, 16, 18, 17).crack(19, 16, 17).dust([15, 17], [16, 16], [17, 17]);
  // east: the beacon room, the capsule cave under it, the shaft up to the exit
  m.air(42, 26, 45, 28);
  m.air(46, 21, 52, 28);
  m.put(48, 28, 'B');
  m.air(51, 29, 52, 30).air(43, 30, 56, 31);
  m.put(45, 31, 'A').dust([49, 31], [54, 31]);
  m.air(53, 5, 57, 28);
  for (const [r, c0, c1] of [[26, 53, 55], [23, 55, 57], [20, 53, 55], [17, 55, 57], [14, 53, 55], [11, 55, 57]]) m.ledge(c0, c1, r);
  m.dust([56, 21], [54, 15], [56, 9]);
  m.put(57, 19, 't');
  m.air(43, 5, 52, 8);                                    // (rock at cols 41-42 keeps the shelf a double-jump reward)
  m.put(45, 8, 'E').dust([49, 7], [51, 6]);
  m.put(50, 8, 'c');
  return m;
}

// ── 2. FROST MOON ────────────────────────────────────────────
// A descent: from the plateau at the top, down through the icicle hall (short hops under the
// icicles), the ice chasm (the beacon on its outcrop, the capsule in a niche: the dash, first time
// round) and onto the frozen lake. A cracked floor in the hall hides a pocket; a niche high in the
// chasm wants the double jump; a low tunnel off the lake has a spiked floor only a dash crosses.
function frostMoon() {
  const m = new Grid('Frost Moon', 46, 44);
  // A. the plateau, and a hole in its floor
  m.air(1, 2, 14, 6).put(2, 6, 'S').dust([6, 5], [9, 4]).put(9, 6, 'c');
  m.icicles(4, 5, 2);
  m.air(12, 7, 13, 14);
  // B. the icicle hall: a full jump under the icicles hurts
  m.air(2, 15, 26, 19);
  m.icicles(6, 8, 15).icicles(15, 17, 15).icicles(22, 23, 15);
  m.dust([10, 17], [19, 17], [24, 18]).put(20, 19, 'c').put(12, 17, 'f');
  m.crack(4, 20).crack(5, 20);                            // a cracked floor: a pocket underneath
  m.air(3, 21, 7, 22).dust([3, 22], [5, 21], [7, 22]);
  // C. the ice chasm, dropping ledge to ledge
  m.air(27, 8, 38, 37);
  m.ledge(29, 31, 17).ledge(34, 37, 17);
  m.air(39, 10, 41, 12).dust([39, 12], [40, 11], [41, 12]);   // a niche for the double jump
  m.ledge(28, 31, 22).dust([29, 21]);
  m.ledge(34, 37, 25).dust([36, 24]);
  m.rock(28, 26, 32, 27).put(30, 25, 'B');               // the beacon's outcrop
  m.ledge(34, 37, 30).dust([34, 29]);
  m.ledge(28, 31, 33).dust([29, 32]);
  m.air(23, 28, 27, 30).put(24, 30, 'A').dust([26, 30]); // the capsule's niche
  m.put(32, 12, 'f').put(35, 34, 'f').put(38, 20, 't').put(27, 32, 't');
  // D. the frozen lake: ice-crystal pits, the exit at the far end
  m.air(8, 35, 44, 41);
  m.spikes(14, 16, 42).spikes(22, 24, 42).spikes(38, 39, 42);
  m.dust([12, 40], [18, 39], [23, 38], [30, 40], [36, 39], [41, 40]);
  m.put(20, 41, 'c').put(33, 41, 'c').put(27, 36, 'f');
  m.put(43, 41, 'E');
  // the dash tunnel: low, its floor all spikes
  m.air(2, 40, 7, 41).spikes(4, 7, 42);
  m.air(1, 38, 3, 41).dust([1, 41], [2, 39], [3, 41]);
  return m;
}

// ── 3. EMBER ROCK ────────────────────────────────────────────
// A climb: across the lava field (crystal pits to jump), then up the chimney ledge by ledge, past
// the beacon's outcrop, to the summit. Off the beacon, a tunnel leads to the capsule (the wall-cling,
// first time round) at the foot of a shaft too tall for any jump: cling your way up it to a treasure
// room. Cracked rock in the field's ceiling and a spiked tunnel off the chimney hide more.
function emberRock() {
  const m = new Grid('Ember Rock', 44, 44);
  // A. the lava field
  m.air(1, 35, 30, 41).put(2, 41, 'S');
  m.spikes(8, 10, 42).spikes(15, 17, 42).spikes(23, 25, 42);
  m.ledge(5, 7, 39).ledge(11, 14, 39).ledge(19, 21, 39);
  m.dust([9, 38], [16, 38], [24, 38], [6, 38], [13, 36], [20, 38], [28, 40]);
  m.put(13, 41, 'c').put(20, 41, 'c').put(27, 41, 'c').put(17, 36, 'f');
  m.crack(12, 34).crack(13, 34);                          // the field's ceiling: a pocket above (double jump)
  m.air(11, 31, 14, 33).dust([11, 33], [12, 31], [14, 33]);
  // B. the chimney
  m.air(31, 2, 40, 41);
  for (const [r, c0, c1] of [[39, 32, 34], [36, 38, 40], [33, 32, 34], [30, 38, 40], [27, 32, 34], [21, 38, 40], [18, 32, 34], [15, 38, 40], [12, 32, 34], [9, 38, 40]]) m.ledge(c0, c1, r);
  m.rock(31, 24, 34, 24).put(32, 23, 'B');               // the beacon's outcrop
  m.rock(31, 6, 35, 6).put(33, 5, 'E');                  // the summit
  m.dust([36, 34], [33, 31], [39, 28], [36, 19], [33, 10], [39, 7]);
  m.put(36, 28, 'f').put(36, 13, 'f').put(40, 16, 't').put(31, 31, 't');
  // C. the capsule, and the shaft only the wall-cling climbs
  m.air(22, 21, 30, 23).air(16, 18, 21, 23).put(17, 23, 'A').dust([19, 22], [20, 19], [25, 22]);
  m.air(16, 4, 17, 17);
  m.air(8, 3, 17, 7).dust([9, 7], [11, 5], [13, 7], [15, 4], [10, 3]);
  // D. a low tunnel off the chimney, its floor all crystal spikes: dash across
  m.air(24, 14, 31, 15).spikes(25, 29, 16);
  m.air(20, 13, 23, 15).dust([20, 15], [21, 13], [23, 15]);
  return m;
}

// ── 4. SPORE JUNGLE ──────────────────────────────────────────
// Wide and crowded: from the grove into the spore hall (mushroom ledges, pods on the ceiling, toads
// on the floor), the beacon's clearing with the capsule down in the roots, then the thorn gallery
// (a stepping-stone pillar over the thorns) and the climb to the exit. The canopy above the hall is
// a wall-cling climb; cracked rock in the hall's west wall and a thorn-floored tunnel hide more.
function sporeJungle() {
  const m = new Grid('Spore Jungle', 66, 34);
  // R1. the grove
  m.air(1, 22, 12, 28).put(2, 28, 'S').dust([5, 27], [9, 26]).put(8, 28, 'c');
  m.air(13, 25, 13, 28);
  // R2. the spore hall
  m.air(14, 16, 30, 28);
  m.ledge(15, 18, 26).ledge(22, 25, 23).ledge(17, 20, 20).ledge(25, 28, 17);
  m.dust([16, 25], [24, 22], [19, 19], [27, 16], [21, 28]);
  m.put(18, 28, 'c').put(26, 28, 'c').put(22, 16, 't').put(14, 22, 't').put(21, 25, 'f');
  m.crack(13, 19, 20);                                    // the hall's west wall: a pocket behind it
  m.air(9, 18, 12, 20).dust([9, 20], [10, 18], [12, 20]);
  // the canopy: up a shaft far too tall to jump (wall-cling)
  m.air(28, 9, 29, 15);
  m.air(14, 2, 30, 8).dust([16, 7], [19, 5], [22, 7], [25, 5], [28, 7]).put(20, 2, 't');
  // R3. the beacon's clearing, the roots under it with the capsule
  m.air(31, 26, 31, 28).air(32, 22, 40, 28).put(36, 28, 'B').dust([33, 27], [39, 25]);
  m.air(38, 29, 39, 29).air(32, 30, 41, 31).put(33, 31, 'A').dust([37, 31], [41, 31]);
  // R5. the thorn gallery, and the climb to the exit
  m.air(41, 24, 41, 28).air(42, 20, 54, 28);
  m.spikes(45, 51, 29);
  m.rock(47, 26, 48, 28);                                 // the stepping stone
  m.dust([46, 25], [49, 22], [50, 22], [53, 27]);
  m.air(51, 9, 54, 19);                                   // the climb's upper shaft (carved before its ledges)
  for (const [r, c0, c1] of [[26, 52, 54], [23, 50, 51], [20, 53, 54], [17, 51, 52], [14, 53, 54]]) m.ledge(c0, c1, r);
  m.put(44, 22, 'f').put(43, 28, 'c').put(54, 24, 't');
  // a tunnel off the climb, its floor all thorns: dash across
  m.air(45, 15, 50, 16).spikes(45, 49, 17).air(42, 14, 44, 16).dust([42, 16], [43, 14], [44, 16]);
  // R6. the exit
  m.air(55, 7, 64, 11).put(62, 11, 'E').dust([57, 10], [60, 9]).put(58, 11, 'c');
  return m;
}

// ── 5. DUNE WORLD ────────────────────────────────────────────
// One great sand cavern, its floor all quicksand crystals. Hop the floating sandstone across: the
// high road passes the beacon and the capsule's shelf; the low road is quicker but riskier. Up in
// the roof, a perch for the double jump; far out over the sand, an island only a dash reaches; in
// the exit hall, a chimney to cling up and a cracked floor.
function duneWorld() {
  const m = new Grid('Dune World', 60, 36);
  m.air(1, 4, 10, 9).put(2, 9, 'S').dust([6, 8]);
  m.air(11, 3, 50, 30).spikes(11, 50, 31);              // the cavern and its quicksand
  // the high road
  for (const [c0, c1, r] of [[13, 16, 12], [20, 23, 14], [27, 30, 13], [34, 37, 16], [40, 42, 14], [40, 43, 19], [46, 49, 22]]) m.rock(c0, r, c1, r);
  m.put(35, 15, 'B');
  m.dust([14, 11], [18, 11], [22, 13], [25, 11], [28, 12], [32, 13], [37, 15], [42, 18], [47, 21]);
  // the capsule on its own sandstone shelf, past the little ledge (a pod watches from the roof)
  m.rock(45, 13, 49, 13).put(47, 12, 'A').dust([49, 11]).put(47, 3, 't');
  // the low road
  for (const [c0, c1, r] of [[16, 19, 22], [23, 26, 24], [30, 33, 26], [37, 40, 27], [44, 47, 28]]) m.rock(c0, r, c1, r);
  m.dust([17, 21], [24, 23], [31, 25], [38, 26], [45, 27]);
  // a perch in the roof (double jump), an island far over the sand (dash)
  m.rock(22, 8, 25, 8).dust([23, 7], [24, 6]);
  m.rock(3, 24, 5, 24).air(1, 20, 10, 23).air(1, 24, 2, 30).air(6, 24, 10, 30).spikes(1, 2, 31).spikes(6, 10, 31).dust([4, 23], [5, 21]);
  m.put(18, 7, 'f').put(32, 9, 'f').put(41, 23, 'f').put(26, 19, 'f').put(21, 13, 'c').put(41, 18, 'c').put(29, 3, 't');
  // the exit hall: a chimney up to a treasure ledge (wall-cling), a cracked floor
  m.air(51, 20, 58, 28).put(57, 28, 'E').dust([53, 27], [56, 26]).put(54, 28, 'c');
  m.air(55, 9, 56, 19).air(52, 5, 58, 8).dust([53, 8], [55, 6], [57, 8]);
  m.crack(52, 29).crack(53, 29).air(51, 30, 55, 31).dust([51, 31], [53, 31], [55, 31]);
  return m;
}

// ── 6. NEBULA REACH ──────────────────────────────────────────
// The last of the six and the hardest: a winding descent through five corridors, back and forth,
// each with its own trap — spike patches under acid pods, a pillar hall over a spike floor, the
// beacon's corridor under hanging crystals, a gauntlet of ledges over spikes, and the exit run. Every
// drop is one-way. Secrets: a pocket in the roof of the first corridor (double jump), cracked rock at
// the end of the beacon's corridor hiding a shaft up to a gallery (wall-cling), and a low tunnel
// under the exit run with a spiked floor (dash).
function nebulaReach() {
  const m = new Grid('Nebula Reach', 52, 46);
  // C1: spike patches under the pods
  m.air(1, 4, 46, 8).put(2, 8, 'S');
  m.spikes(10, 12, 9).spikes(20, 22, 9).spikes(31, 33, 9);
  m.dust([6, 7], [11, 6], [16, 7], [21, 6], [27, 7], [32, 6], [38, 7]);
  m.put(15, 4, 't').put(26, 4, 't').put(37, 8, 'c');
  m.air(27, 1, 32, 2).air(29, 3, 30, 3).dust([28, 1], [31, 1], [32, 2]);   // the roof pocket
  m.air(43, 9, 46, 10);                                   // drop 1
  // C2: the pillar hall (two rows of headroom over the pillars, enough for a hop)
  m.air(1, 11, 46, 16).spikes(5, 42, 17);
  for (const c of [38, 33, 28, 23, 18, 13, 8]) m.rock(c, 15, c + 1, 16);
  m.dust([41, 13], [31, 12], [26, 13], [16, 12], [11, 13], [6, 13]);
  m.put(36, 13, 'f').put(21, 13, 'f');
  m.air(1, 17, 4, 19);                                    // drop 2
  // C3: the beacon's corridor, under hanging crystals
  m.air(1, 20, 46, 24).icicles(12, 14, 20).icicles(30, 32, 20);
  m.put(22, 24, 'B').dust([9, 23], [13, 23], [18, 22], [27, 23], [31, 23], [37, 22]);
  m.air(5, 25, 8, 25).put(6, 25, 'A');                    // the capsule, in a dip in the floor
  m.put(33, 22, 'f').put(39, 24, 'c');
  m.crack(47, 21, 24).air(48, 20, 49, 24).air(48, 9, 49, 19).air(48, 4, 50, 8).dust([48, 8], [50, 8], [49, 5], [50, 6]);
  m.air(43, 25, 46, 25);                                  // drop 3
  // C4: the gauntlet — ledges over a spike floor
  m.air(1, 26, 46, 32).spikes(5, 42, 33);
  for (const [c0, c1, r] of [[38, 41, 31], [33, 35, 30], [28, 30, 31], [23, 25, 30], [18, 20, 31], [13, 15, 30], [8, 10, 31]]) m.ledge(c0, c1, r);
  m.dust([34, 29], [29, 30], [24, 29], [19, 30], [14, 29], [9, 30]);
  m.put(31, 26, 't').put(14, 26, 't');
  m.air(1, 33, 4, 35);                                    // drop 4
  // C5: the exit run, and the low tunnel under it
  m.air(1, 36, 46, 40);
  m.spikes(15, 17, 41).spikes(25, 28, 41).spikes(36, 38, 41);
  m.put(45, 40, 'E').dust([16, 38], [26, 37], [37, 38], [42, 39]);
  m.put(21, 40, 'c').put(31, 40, 'c').put(41, 37, 'f');
  m.air(5, 41, 6, 41).air(5, 42, 14, 43).spikes(7, 11, 44).dust([12, 43], [13, 42], [14, 43]);
  return m;
}

// ── The guardians' lairs ─────────────────────────────────────
// An antechamber with the rest beacon, the gate (D), and a 13-tile arena that fits the screen. The
// exit beacon in the arena lights up once the guardian falls. (Solid rock round it fills the view.)
const Y = 4;                                              // the lair's rows start this far down
function lair(name, build) {
  const m = new Grid(name, 24, 23);
  m.air(1, Y + 7, 8, Y + 10);                             // antechamber
  m.put(2, Y + 10, 'S').put(6, Y + 10, 'B');
  m.gate(9, Y + 8, Y + 10);
  m.air(10, Y + 1, 22, Y + 10);                           // the arena
  m.put(16, Y + 10, 'E');
  build(m);
  return m;
}
const broodHollow = () => lair('Brood Hollow', (m) => {   // the Mite Matriarch: side ledges to wait out a charge
  m.ledge(11, 13, Y + 8).ledge(19, 21, Y + 8);
  m.put(19, Y + 10, 'G');
});
const squallHollow = () => lair('Squall Hollow', (m) => { // the Storm Jelly: ledges to reach it in the air
  m.air(10, Y, 22, Y);
  m.ledge(10, 12, Y + 7).ledge(20, 22, Y + 7).ledge(15, 17, Y + 4);
  m.put(16, Y + 1, 'G');
});
const magmaHollow = () => lair('Magma Hollow', (m) => {   // the Magma Wyrm: a flat floor to swim under, two perches
  m.ledge(10, 11, Y + 7).ledge(21, 22, Y + 7);
  m.put(18, Y + 10, 'G');
});

// ── The treasure vault (the bonus round after each guardian) ──
function hoard() {
  const m = new Grid('Treasure Vault', 20, 21);
  m.air(1, 1, 18, 16);
  m.put(9, 16, 'S');
  // tiers of ledges three rows apart (one jump each), treasure on the floor corners and the top
  m.ledge(2, 6, 14).ledge(13, 17, 14).ledge(7, 12, 11).ledge(1, 4, 8).ledge(15, 18, 8).ledge(6, 13, 5);
  m.put(2, 16, 'T').put(17, 16, 'T').put(9, 4, 'T');
  m.dust([4, 16], [6, 16], [12, 16], [14, 16], [8, 15], [11, 15]);
  m.dust([3, 13], [5, 13], [14, 13], [16, 13]);
  m.dust([8, 10], [10, 10], [11, 10]);
  m.dust([2, 7], [4, 7], [15, 7], [17, 7], [1, 5], [18, 5]);
  m.dust([7, 4], [11, 4], [12, 4]);
  m.dust([6, 1], [8, 2], [10, 1], [12, 2], [14, 1]);
  return m;
}

const build = (f) => f().rows();
export const MAPS = {
  'Landing Site': build(landingSite),
  'Frost Moon': build(frostMoon),
  'Ember Rock': build(emberRock),
  'Spore Jungle': build(sporeJungle),
  'Dune World': build(duneWorld),
  'Nebula Reach': build(nebulaReach),
  'Brood Hollow': build(broodHollow),
  'Squall Hollow': build(squallHollow),
  'Magma Hollow': build(magmaHollow),
  'Treasure Vault': build(hoard),
};

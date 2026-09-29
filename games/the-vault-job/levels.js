// ─────────────────────────────────────────────────────────────
//  THE VAULT JOB — museum floor plans.
//  Each map is 15 × 13 tiles. Key: see sim.js.
//  guards:  path = corner points (straight lines), every = ticks per step (lower = faster),
//           vision = tiles, pause = ticks spent turning at corners, loop = walk in a loop,
//           phase = start part-way round, dog = true for a fast, short-sighted guard dog.
//  cameras: x,y (on a wall/pillar), dirs = directions it sweeps between, hold = ticks per direction.
//  lasers:  one entry per laser group (in reading order): on/off ticks and offset.
//  Levels 5 and 10 are bonus rounds (built in game.js). Level 16 is the secret vault.
// ─────────────────────────────────────────────────────────────
export const LEVELS = {
  1: {
    name: 'The Lobby',
    tip: 'Guards see along their torch beam. Stay out of the yellow!',
    map: [
      '###############',
      '#S.....#......#',
      '#......#..$...#',
      '#..P...#......#',
      '#......#...P..#',
      '#.............#',
      '#.............#',
      '#..P......P...#',
      '#......#......#',
      '#......#......#',
      '#.$....#.....E#',
      '#......#......#',
      '###############',
    ],
    guards: [{ path: [[12, 1], [12, 4]], every: 6, vision: 3, pause: 8 }],
  },

  2: {
    name: 'Portrait Hall',
    tip: 'Follow behind a guard — they can\'t see backwards.',
    map: [
      '###############',
      '#S..#.........#',
      '#...#...$.....#',
      '#...#.........#',
      '#...######.####',
      '#.............#',
      '#.............#',
      '#.............#',
      '####.######...#',
      '#.........#...#',
      '#..$......#...#',
      '#.........#..E#',
      '###############',
    ],
    guards: [
      { path: [[1, 6], [13, 6]], every: 5, vision: 4, pause: 8 },
      { path: [[2, 9], [8, 9]], every: 6, vision: 2, pause: 8 },
    ],
  },

  3: {
    name: 'Laser Gallery',
    tip: 'Lasers switch on and off. Wait for the gap!',
    map: [
      '###############',
      '#S............#',
      '#.............#',
      '#=============#',
      '#.............#',
      '#..P...P...P..#',
      '#.............#',
      '#=============#',
      '#.............#',
      '#..$.......$..#',
      '#.............#',
      '#............E#',
      '###############',
    ],
    lasers: [{ on: 14, off: 12, offset: 0 }, { on: 14, off: 12, offset: 13 }],
    guards: [
      { path: [[1, 6], [13, 6]], every: 5, vision: 3, pause: 8 },
      { path: [[13, 10], [1, 10]], every: 6, vision: 3, pause: 8 },
    ],
  },

  4: {
    name: 'Sculpture Garden',
    tip: 'Stand on a plant or statue and nobody can see you.',
    map: [
      '###############',
      '#S.....#.....E#',
      '#.....H#......#',
      '#.P.P..#..P...#',
      '#......#......#',
      '#..H...H......#',
      '#.............#',
      '#......H..H...#',
      '#.P.P..#......#',
      '#......#...$..#',
      '#..$...#..P...#',
      '#....H.#......#',
      '###############',
    ],
    guards: [
      { path: [[1, 6], [6, 6]], every: 5, vision: 3, pause: 8 },
      { path: [[12, 2], [12, 10]], every: 5, vision: 4, pause: 8 },
    ],
  },

  6: {
    name: 'Security Room',
    tip: 'Cameras sweep back and forth — watch for the red beam.',
    map: [
      '###############',
      '#S....#.......#',
      '#.....#...$...#',
      '#.....#.......#',
      '#.....###.#####',
      '#.............#',
      '#.P.P.P.P.P.P.#',
      '#.............#',
      '#####.###.....#',
      '#.......#.....#',
      '#.$.....#.....#',
      '#.......#....E#',
      '###############',
    ],
    cameras: [
      { x: 14, y: 5, dirs: ['left', 'down'], hold: 22, vision: 8 },
      { x: 0, y: 7, dirs: ['right', 'up'], hold: 22, vision: 8 },
    ],
    guards: [{ path: [[9, 9], [13, 9]], every: 4, vision: 3, pause: 8 }],
  },

  7: {
    name: 'Egyptian Wing',
    tip: 'Two guards, two directions. Timing is everything.',
    map: [
      '###############',
      '#S....=.......#',
      '#.....=...P...#',
      '#..P..=.......#',
      '#.....=...$...#',
      '#.....=.......#',
      '###.#####.#####',
      '#.............#',
      '#.P...P...P...#',
      '#.............#',
      '#......=......#',
      '#.$....=.....E#',
      '###############',
    ],
    lasers: [{ on: 16, off: 10, offset: 0 }, { on: 10, off: 10, offset: 5 }],
    guards: [
      { path: [[1, 7], [13, 7]], every: 4, vision: 4, pause: 8 },
      { path: [[13, 9], [1, 9]], every: 4, vision: 4, pause: 8 },
    ],
  },

  8: {
    name: 'Dinosaur Hall',
    tip: 'The big bones block the guards\' view. Use them.',
    map: [
      '###############',
      '#S............#',
      '#.............#',
      '#..PPP...PPP..#',
      '#..PPP.$.PPP..#',
      '#..PPP...PPP..#',
      '#.............#',
      '#..PPP...PPP..#',
      '#..PPP.$.PPP..#',
      '#..PPP...PPP..#',
      '#.............#',
      '#............E#',
      '###############',
    ],
    guards: [
      { path: [[2, 2], [6, 2], [6, 6], [2, 6]], loop: true, every: 4, vision: 3, pause: 6, phase: 20 },
      { path: [[8, 6], [12, 6], [12, 10], [8, 10]], loop: true, every: 4, vision: 3, pause: 6 },
      { path: [[7, 1], [7, 11]], every: 5, vision: 3, pause: 8, phase: 30 },
    ],
  },

  9: {
    name: 'The Kennels',
    tip: 'Guard dogs are fast but short-sighted.',
    map: [
      '###############',
      '#S.#.....#...E#',
      '#..#.###.#.#..#',
      '#..#.#$..#.#..#',
      '#....#...#.#..#',
      '####.#.###.#..#',
      '#....#.....#..#',
      '#.####.###.#..#',
      '#......#.$.#..#',
      '#.####.#...#..#',
      '#......#......#',
      '#..H.......H..#',
      '###############',
    ],
    guards: [
      { path: [[12, 2], [12, 10]], every: 2, vision: 2, pause: 6, dog: true },
      { path: [[1, 10], [6, 10]], every: 2, vision: 2, pause: 6, dog: true, phase: 12 },
      { path: [[6, 6], [10, 6]], every: 4, vision: 3, pause: 8 },
    ],
  },

  11: {
    name: 'Crown Jewels',
    tip: 'Every laser has its own rhythm.',
    map: [
      '###############',
      '#S#.=.=.=.=.=.#',
      '#.#.=.=.=.=.=.#',
      '#.#$=.=.=.=.=.#',
      '#.#.=.=.=.=.=.#',
      '#.#.=.=.=.=.=.#',
      '#.###########.#',
      '#.............#',
      '#.P.P.P.P.P.P.#',
      '#.............#',
      '###########=###',
      '#E....$.......#',
      '###############',
    ],
    lasers: [
      { on: 10, off: 8, offset: 0 }, { on: 10, off: 8, offset: 4 }, { on: 10, off: 8, offset: 8 },
      { on: 10, off: 8, offset: 12 }, { on: 10, off: 8, offset: 16 }, { on: 8, off: 14, offset: 0 },
    ],
    guards: [
      { path: [[2, 7], [12, 7]], every: 4, vision: 4, pause: 8 },
      { path: [[12, 9], [2, 9]], every: 2, vision: 2, pause: 6, dog: true },
    ],
  },

  12: {
    name: 'Hall of Mirrors',
    tip: 'Hide as a guard walks right past you…',
    map: [
      '###############',
      '#S....#.......#',
      '#.##..#.#####.#',
      '#.#H..#.#...#.#',
      '#.#...H.#.$.#.#',
      '#.#####.#...#.#',
      '#.......#.#.#.#',
      '#.#####.#.#...#',
      '#.#...#...#####',
      '#.#.$.#.#.....#',
      '#.#...H.#####.#',
      '#.......H....E#',
      '###############',
    ],
    guards: [
      { path: [[7, 1], [7, 11]], every: 4, vision: 4, pause: 8 },
      { path: [[9, 9], [13, 9]], every: 4, vision: 3, pause: 8 },
      { path: [[1, 4], [1, 11]], every: 2, vision: 2, pause: 6, dog: true },
    ],
  },

  13: {
    name: 'Night Shift',
    tip: 'Everything at once. Breathe.',
    map: [
      '###############',
      '#S..=.....=..$#',
      '#...=.P.P.=...#',
      '#...=.....=...#',
      '##.####.####.##',
      '#.............#',
      '#.H.P.H.P.H.P.#',
      '#.............#',
      '##.####.####.##',
      '#...=.....=...#',
      '#...=.P.P.=...#',
      '#$..=.....=..E#',
      '###############',
    ],
    lasers: [
      { on: 12, off: 10, offset: 0 }, { on: 12, off: 10, offset: 11 },
      { on: 12, off: 10, offset: 5 }, { on: 12, off: 10, offset: 16 },
    ],
    guards: [
      { path: [[1, 5], [13, 5]], every: 4, vision: 4, pause: 8 },
      { path: [[13, 7], [1, 7]], every: 4, vision: 4, pause: 8 },
      { path: [[5, 1], [9, 1]], every: 5, vision: 2, pause: 8 },
      { path: [[9, 11], [5, 11]], every: 5, vision: 2, pause: 8 },
    ],
  },

  14: {
    name: 'Double Shift',
    tip: 'The guards are getting faster…',
    map: [
      '###############',
      '#S.....#.....$#',
      '#.P.P..#..P...#',
      '#......#......#',
      '#..H...=...H..#',
      '#......#......#',
      '####=######.###',
      '#......#......#',
      '#..P...#...P..#',
      '#......=......#',
      '#.P.H..#...H..#',
      '#$.....#.....E#',
      '###############',
    ],
    lasers: [{ on: 12, off: 10, offset: 0 }, { on: 12, off: 10, offset: 7 }, { on: 12, off: 10, offset: 14 }],
    cameras: [{ x: 0, y: 9, dirs: ['right', 'up'], hold: 18, vision: 6 }],
    guards: [
      { path: [[1, 3], [6, 3]], every: 3, vision: 3, pause: 8 },
      { path: [[8, 5], [13, 5]], every: 3, vision: 4, pause: 8 },
      { path: [[8, 9], [13, 9]], every: 3, vision: 3, pause: 8, phase: 10 },
    ],
  },

  15: {
    name: 'The Director\'s Office',
    tip: 'One last room. The exit is so close…',
    map: [
      '###############',
      '#......E......#',
      '#.PP.=====.PP.#',
      '#.............#',
      '#H.P.P.P.P.P.H#',
      '#.............#',
      '#.PPP..$..PPP.#',
      '#.............#',
      '#H.P.P.P.P.P.H#',
      '#.............#',
      '#.PP.......PP.#',
      '#......S......#',
      '###############',
    ],
    lasers: [{ on: 10, off: 10, offset: 0 }],
    guards: [
      { path: [[1, 3], [13, 3]], every: 3, vision: 4, pause: 8 },
      { path: [[13, 5], [1, 5]], every: 3, vision: 4, pause: 8 },
      { path: [[1, 7], [13, 7]], every: 3, vision: 4, pause: 8, phase: 12 },
      { path: [[13, 9], [1, 9]], every: 3, vision: 4, pause: 8, phase: 12 },
    ],
  },

  // ── The secret vault (only for flawless thieves) ──────────────
  16: {
    name: 'The Vault',
    tip: 'Move with the rhythm of the lasers. Getting caught here only sends you back to the start.',
    map: [
      '###############',
      '#$....#V#....$#',
      '#.===.#.#.===.#',
      '#.....#=#.....#',
      '#.===.#.#.===.#',
      '#.....#=#.....#',
      '#.===.#.#.===.#',
      '#.....#=#.....#',
      '#.===.#.#.===.#',
      '#.....#=#.....#',
      '#.#####.#####.#',
      '#......S......#',
      '###############',
    ],
    lasers: [
      { on: 10, off: 10, offset: 0 }, { on: 10, off: 10, offset: 10 },
      { on: 16, off: 8, offset: 0 },
      { on: 10, off: 10, offset: 10 }, { on: 10, off: 10, offset: 0 },
      { on: 16, off: 8, offset: 12 },
      { on: 10, off: 10, offset: 0 }, { on: 10, off: 10, offset: 10 },
      { on: 16, off: 8, offset: 0 },
      { on: 10, off: 10, offset: 10 }, { on: 10, off: 10, offset: 0 },
      { on: 16, off: 8, offset: 12 },
    ],
  },
};

/** Bonus levels (5 and 10): the gift shop is full of coins and nobody is watching. */
export function giftShop(level) {
  const rows = ['###############'];
  for (let y = 1; y < 12; y++) {
    let r = '#';
    for (let x = 1; x < 14; x++) {
      const pillar = (x % 4 === 2 && y % 4 === 2);
      r += y === 11 && x === 7 ? 'S' : pillar ? 'P' : ((x + y + level) % 2 === 0 ? 'o' : '.');
    }
    rows.push(r + '#');
  }
  rows.push('###############');
  return { name: 'The Gift Shop', tip: 'Nobody\'s watching — grab every coin before time runs out!', map: rows };
}

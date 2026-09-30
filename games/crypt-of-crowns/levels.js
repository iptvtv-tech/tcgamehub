// Crypt of Crowns — the hand-built crypts. See sim.js for the map key.
// par: seconds to beat for a time bonus (about twice the solver's perfect run).
// dir: which way you face at the start (0 E, 1 S, 2 W, 3 N). skel: ticks per skeleton step (lower = faster).
export const LEVELS = [];
const L = (n, def) => { LEVELS[n] = def; };

L(1, { par: 26, name: 'The Entry Hall', dir: 0,
  tip: 'Find the 🔑 key and open the gold door. Cracked walls hide secrets — face one and SEARCH (Space).',
  map: [
    '###########',
    '#@..c.#TcT#',
    '#.###.#%###',
    '#.#k..c...#',
    '#.#####.#.#',
    '#...c...#D#',
    '#########.#',
    '#E.c......#',
    '###########',
  ] });

L(2, { par: 30, name: 'The Gatehouse', dir: 0,
  tip: 'Walk into a lever to pull it — it works the iron gates.',
  map: [
    '#############',
    '#@...c...#TT#',
    '#.#####.##%##',
    '#.#...#.....#',
    '#.#.k.G.#####',
    '#.#...#.#...#',
    '#.##L##.#.E.#',
    '#.c.....D...#',
    '#############',
  ] });

L(3, { par: 29, name: 'Bone Patrol', dir: 1,
  tip: 'A skeleton guards the hall. It walks the same beat forever — watch it, then time your move.',
  map: [
    '#############',
    '#@...c.##TcT#',
    '#.####.###%##',
    '#.#E.D.#....#',
    '#.####.#.##.#',
    '#r..........#',
    '#####.#####.#',
    '#k..c.#...c.#',
    '#############',
  ] });

L(4, { par: 26, name: 'Spike Walk', dir: 1, spikePhase: (x) => (48 - 2 * x) % 24,
  tip: 'Spike traps rise and fall on a beat. Cross while they are down.',
  map: [
    '#############',
    '#@.c#TcT#ccc#',
    '#.#.##%####.#',
    '#.#.......#.#',
    '#.#########.#',
    '#.*****.#...#',
    '#######.#k#.#',
    '#E.c..D...#.#',
    '#############',
  ] });

L(5, { bonus: true, name: 'The Gold Room', dir: 3,
  map: [
    '#############',
    '#cccccTccccc#',
    '#c#c#c.c#c#c#',
    '#ccccc.ccccc#',
    '#c#c#c@c#c#c#',
    '#ccccc.ccccc#',
    '#c#c#c.c#c#c#',
    '#cccccTccccc#',
    '#############',
  ] });

L(6, { par: 36, name: 'The Blue Door', dir: 0,
  tip: 'Blue keys open blue doors. The gold key is further in…',
  map: [
    '###############',
    '#@...c#...#TcT#',
    '#.###.#.b.#%###',
    '#.#L#.#...#...#',
    '#.....G...#.#.#',
    '###.#######.#.#',
    '#...B.....#.#.#',
    '#.###..u..D.#.#',
    '#.###.....#.#.#',
    '#.c.#....k#..E#',
    '###############',
  ] });

L(7, { par: 37, name: 'Two Levers', dir: 0,
  tip: 'Some gates open when you pull a lever… and some close. Think before you pull.',
  map: [
    '#########M#####',
    '#@.c.g.......c#',
    'L.####.########',
    '#.#k.#.#TcT####',
    '#.G..#.##%#####',
    '#.####.......c#',
    '#.#########H###',
    '#.c..#.r....DE#',
    '###############',
  ] });

L(8, { par: 37, name: 'The Long Hall', dir: 1,
  tip: 'Four patrols cross the hall. Wait in the gaps between them.',
  map: [
    '#################',
    '#..#.#.#.#.##TcT#',
    '#.@#.#.#.#.###%##',
    '#...d.u.d.u.*k*.#',
    '####.#.#.#.####.#',
    '####.#.#.#.####.#',
    '###.#.#.#######.#',
    '#E..l.c.D.c.c.c.#',
    '#################',
  ] });

L(9, { par: 29, name: 'Hidden Ways', dir: 0,
  tip: 'The way on is hidden. Look for cracks in the walls.',
  map: [
    '###############',
    '#@..c..#...#.E#',
    '#.####.#.k.#..#',
    '#.#Tc#.#...#..#',
    '#.#T.%.###%##D#',
    '#.####.......c#',
    '#.#########.###',
    '#....c.*...u..#',
    '###############',
  ] });

L(10, { bonus: true, name: 'The Bone Vault', dir: 3,
  map: [
    '###############',
    '#ccc=ccccc=ccc#',
    '#cTc=c===c=cTc#',
    '#ccc.ccccc.ccc#',
    '#===c=c@c=c===#',
    '#ccc.ccccc.ccc#',
    '#cTc=c===c=cTc#',
    '#ccc=ccccc=ccc#',
    '###############',
  ] });

L(11, { par: 67, name: 'The Ossuary', dir: 0,
  tip: 'Gold key, blue key, a lever — and the dead walk the bone road.',
  map: [
    '###############',
    '#@..=.......=k#',
    '#.=c=...d...=.#',
    '#......r......#',
    '#.#%=.......=.#',
    '#.#T=.......=.#',
    '#.###=====###D#',
    '#.c.#...u..#..#',
    '#..B#......G..#',
    '#.#E#b.....#.L#',
    '###############',
  ] });

L(12, { par: 40, name: 'Spike Maze', dir: 0, spikePhase: (x, y) => (x * 7 + y * 11) % 24,
  tip: 'A whole floor of traps, each on its own beat. Stop only on safe stone.',
  map: [
    '###############',
    '#@.*.*.*.*.*.c#',
    '##.#.#.#.#.#.##',
    '#*.*.*.*.*.*.*#',
    '##.#.#.#.#.#.##',
    '#*.*.*.*.*.*k*#',
    '#D#########%###',
    '#E#########TcT#',
    '###############',
  ] });

L(13, { par: 48, name: 'Lever Labyrinth', dir: 1,
  tip: 'Two levers, three gates, two colours of key. Plan your route.',
  map: [
    '########L########',
    '#...#.......#...#',
    '#.b.G...@...g...M',
    '#...#.......#.u.#',
    '#%c.####H####...#',
    '#T######.#####B##',
    '##ED....r...#.k.#',
    '#################',
  ] });

L(14, { par: 36, name: "The Warden's Hall", dir: 0, skel: 4,
  tip: 'Faster patrols on every street. Find the gold key in the far corner.',
  map: [
    '#################',
    '#@..c.......c...#',
    '#.###.###.#%#d#.#',
    '#.###d###.#T#.#.#',
    '#.###.###.###.#.#',
    '#..r..c......c..#',
    '#.###.###.###.#.#',
    '#.#E#.###u###.#k#',
    '#.#D#.###.###.#.#',
    '#...c...l.....c.#',
    '#################',
  ] });

L(15, { par: 106, name: 'The Crown Door', dir: 1, skel: 4, spikePhase: (x, y) => (x * 5 + y * 9) % 24,
  tip: 'The last crypt. Every trick you have learned — and one lever hidden in the dark.',
  map: [
    '###################',
    '#b.*.*.#@....#..k.#',
    '#.*.*.*#..d..#.u..#',
    '#*.*.*.G.....B....#',
    '#.*.*.*#.....#...T#',
    '#######L##.########',
    '#.c.%...r.....cDHE#',
    '##M################',
  ] });

// ★ The secret 16th crypt — only for a flawless run.
L(16, { name: 'The Crown Vault', dir: 3, secret: true,
  tip: 'The Crown of the Crypt Kings…',
  map: [
    '###############',
    '#====t.C.t====#',
    '#=cc.......cc=#',
    '#=t.c.....c.t=#',
    '#=.c.......c.=#',
    '#=t..c...c..t=#',
    '#=....c.c....=#',
    '#=t.........t=#',
    '#======@======#',
    '###############',
  ] });

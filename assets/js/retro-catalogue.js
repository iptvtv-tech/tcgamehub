// ─────────────────────────────────────────────────────────────
//  RETRO VAULT catalogue — every title here is legal to list.
//
//  hosted   → the ROM file is on this site (retro-vault/roms/). Only games whose
//             licence allows re-hosting go here, with their source code alongside
//             (retro-vault/roms/source/) and full credits on the page.
//  download → free from the creator, but no permission to re-host. Players get it
//             from the creator's page, then load it with "Your ROM".
//  paid     → commercial homebrew. Link to the creator's shop only.
//
//  `system` is the EmulatorJS system name (see SYSTEMS below).
//  To add a hosted game: build/download the ROM, check the licence lets you
//  re-host it, put the ROM in retro-vault/roms/ and its source in roms/source/,
//  then add an entry with host: 'hosted'.
// ─────────────────────────────────────────────────────────────

export const SYSTEMS = {
  nes:       { label: 'NES',          ext: ['nes'],                 colour: '#f472b6' },
  snes:      { label: 'SNES',         ext: ['sfc', 'smc'],          colour: '#a78bfa' },
  gb:        { label: 'Game Boy',     ext: ['gb', 'gbc'],           colour: '#a3e635' },
  gba:       { label: 'GBA',          ext: ['gba'],                 colour: '#34d399' },
  segaMD:    { label: 'Mega Drive',   ext: ['md', 'gen', 'smd', 'bin'], colour: '#fbbf24' },
  segaMS:    { label: 'Master System', ext: ['sms'],                colour: '#fb923c' },
  segaGG:    { label: 'Game Gear',    ext: ['gg'],                  colour: '#fb923c' },
  atari2600: { label: 'Atari 2600',   ext: ['a26'],                 colour: '#fb7185' },
  mame:      { label: 'Arcade',       ext: ['zip'],                 colour: '#22d3ee' },
};

const MAME = 'https://www.mamedev.org/roms/';
const MAME_LIC = 'Released free for non-commercial use by the rights holder. Download it from mamedev.org only. Keep the zip name (e.g. ';

export const GAMES = [
  // ── Hosted here (open licences) ─────────────────────────────
  {
    id: 'thwaite', host: 'hosted', system: 'nes', rom: 'roms/thwaite.nes',
    title: 'Thwaite', by: 'Damian Yerrick', year: 2011, genre: 'Missile defence',
    blurb: 'Protect the villages from incoming missiles. Aim, fire, and let the blasts catch them. A cousin of Astro Blaster.',
    licence: 'GPL v3 or later', source: 'roms/source/thwaite-source.tar.gz', upstream: 'https://github.com/pinobatch/thwaite-nes',
    commit: '00e3674',
    tip: 'Press Enter at the title, then use the arrows to aim and Z or X to fire.',
  },
  {
    id: 'concentration-room', host: 'hosted', system: 'nes', rom: 'roms/concentration-room.nes',
    title: 'Concentration Room', by: 'Damian Yerrick', year: 2010, genre: 'Memory puzzle',
    blurb: 'Flip cards and find the pairs before time runs out. Play solo, against a friend or against the computer.',
    licence: 'GPL v3 or later (exact copies may be shared without source)', source: 'roms/source/concentration-room-source.tar.gz', upstream: 'https://github.com/pinobatch/croom-nes',
    commit: 'ed19c3c',
    tip: 'Arrows move the cursor, Z flips a card. Enter starts.',
  },
  {
    id: 'nova-the-squirrel', host: 'hosted', system: 'nes', rom: 'roms/nova-the-squirrel.nes',
    title: 'Nova the Squirrel', by: 'NovaSquirrel', year: 2018, genre: 'Platformer',
    blurb: 'A big, bright platformer with powers to collect, levels to explore and plenty of secrets.',
    licence: 'Code GPL v3 or later · art and levels CC BY-NC-SA 4.0 (non-commercial)', source: 'roms/source/nova-the-squirrel-source.tar.gz', upstream: 'https://github.com/NovaSquirrel/NovaTheSquirrel',
    commit: 'e9e79ae',
    tip: 'Z jumps, X uses your current power. Enter pauses.',
  },
  {
    id: 'ucity', host: 'hosted', system: 'gb', rom: 'roms/ucity.gbc',
    title: 'µCity', by: 'Antonio Niño Díaz', year: 2017, genre: 'City builder',
    blurb: 'A full city builder for the Game Boy Color: zone land, lay roads and power, balance the budget and survive disasters.',
    licence: 'Code GPL v3 or later · graphics and music CC BY-SA 4.0', source: 'roms/source/ucity-source.tar.gz', upstream: 'https://github.com/AntonioND/ucity',
    commit: '71fb08e',
    tip: 'Arrows move, Z selects, X goes back. Enter opens the menu. It saves to your browser.',
  },

  // ── Free from the creator: download, then load with "Your ROM" ──
  {
    id: 'tobu-tobu-girl', host: 'download', system: 'gb',
    title: 'Tobu Tobu Girl', by: 'Tangram Games', year: 2017, genre: 'Arcade platformer',
    blurb: 'Bounce higher and higher to rescue a lost cat. Gorgeous pixel art and a great score chase.',
    licence: 'MIT code, CC BY 4.0 art. Free on itch.io (the Deluxe version is paid).',
    url: 'https://tangramgames.itch.io/tobutobugirl',
  },
  {
    id: 'alter-ego', host: 'download', system: 'nes',
    title: 'Alter Ego', by: 'Denis Grachev (RetroSouls)', year: 2011, genre: 'Puzzle platformer',
    blurb: 'Swap places with your mirror-image twin to collect every pixie on the screen.',
    licence: 'Free download from RetroSouls.',
    url: 'https://www.retrosouls.net/?page_id=614',
  },
  {
    id: 'blade-buster', host: 'download', system: 'nes',
    title: 'Blade Buster', by: 'High Level Challenge', year: 2010, genre: 'Score-attack shooter',
    blurb: 'A fast vertical shooter built around 2- and 5-minute score attacks.',
    licence: 'Free from the developer.',
    url: 'https://www.rgcd.co.uk/2011/05/blade-buster-nes.html',
  },
  {
    id: 'super-uwol', host: 'download', system: 'nes',
    title: 'Super Uwol', by: 'The Mojon Twins', year: 2016, genre: 'Arcade platformer',
    blurb: 'Grab the coins in each room of a cursed pyramid. Short rooms, classic arcade feel.',
    licence: 'Free. Ask the Mojon Twins before re-sharing.',
    url: 'https://github.com/retrobrews/nes-games',
  },
  {
    id: 'lala', host: 'download', system: 'nes',
    title: 'Lala the Magical', by: 'The Mojon Twins', year: 2016, genre: 'Puzzle platformer',
    blurb: 'A young witch makes blocks to climb her way through each room.',
    licence: 'Free. Ask the Mojon Twins before re-sharing.',
    url: 'https://github.com/retrobrews/nes-games',
  },
  {
    id: 'deadeus', host: 'download', system: 'gb',
    title: 'Deadeus', by: 'IZMA', year: 2019, genre: 'Horror adventure',
    blurb: 'A creepy village, a terrible dream and several endings. Short, dark and atmospheric.',
    licence: 'Download from the creator\'s itch.io page.',
    url: 'https://izma.itch.io/deadeus',
  },
  {
    id: 'anguna', host: 'download', system: 'gba',
    title: 'Anguna', by: 'Nathan Tolbert', year: 2008, genre: 'Action adventure',
    blurb: 'A top-down dungeon crawler with swords, keys, bosses and a map to explore.',
    licence: 'Free download from the creator.',
    url: 'http://www.tolberts.net/anguna/',
  },
  {
    id: 'old-towers', host: 'download', system: 'segaMD',
    title: 'Old Towers', by: 'RetroSouls', year: 2019, genre: 'Puzzle platformer',
    blurb: 'Collect every coin in towers where you keep moving until you hit a wall.',
    licence: 'Free from RetroSouls.',
    url: 'https://www.retrosouls.net/',
  },
  {
    id: 'tanglewood-demo', host: 'download', system: 'segaMD',
    title: 'Tanglewood (demo)', by: 'Big Evil Corporation', year: 2018, genre: 'Puzzle platformer',
    blurb: 'A beautifully animated creature lost in the woods. The demo is free; the full game is sold.',
    licence: 'Free demo from the official site.',
    url: 'https://www.tanglewoodgame.com/',
  },
  {
    id: 'halo-2600', host: 'download', system: 'atari2600',
    title: 'Halo 2600', by: 'Ed Fries', year: 2010, genre: 'Action',
    blurb: 'Master Chief squeezed into 4 KB. A famous piece of homebrew history.',
    licence: 'Free download, made with Microsoft\'s blessing. Shared on AtariAge.',
    url: 'https://atariage.com/',
  },

  // ── Real arcade boards, released free by their owners (MAME) ──
  { id: 'alienar', host: 'download', system: 'mame', title: 'Alien Arena', by: 'Duncan Brown', year: 1985, genre: 'Arena shooter',
    blurb: 'Blast aliens around an arena on a genuine 1985 arcade board.', licence: MAME_LIC + 'alienar.zip).', url: MAME },
  { id: 'gridlee', host: 'download', system: 'mame', title: 'Gridlee', by: 'Videa', year: 1982, genre: 'Grid shooter',
    blurb: 'An unreleased 1982 arcade game from ex-Atari engineers.', licence: MAME_LIC + 'gridlee.zip).', url: MAME },
  { id: 'robby', host: 'download', system: 'mame', title: 'Robby Roto', by: 'Bally/Midway', year: 1981, genre: 'Dig and rescue',
    blurb: 'Dig tunnels, rescue prisoners and dodge monsters.', licence: MAME_LIC + 'robby.zip).', url: MAME },
  { id: 'teetert', host: 'download', system: 'mame', title: 'Teeter Torture', by: 'Exidy', year: 1982, genre: 'Shooter',
    blurb: 'Shoot monsters while balancing a see-saw cannon. A prototype that never reached arcades.', licence: MAME_LIC + 'teetert.zip).', url: MAME },
  { id: 'targ', host: 'download', system: 'mame', title: 'Targ', by: 'Exidy', year: 1980, genre: 'Maze shooter',
    blurb: 'Drive your Wummel through a city grid and blast the Targs.', licence: MAME_LIC + 'targ.zip).', url: MAME },
  { id: 'spectar', host: 'download', system: 'mame', title: 'Spectar', by: 'Exidy', year: 1980, genre: 'Maze shooter',
    blurb: 'The faster follow-up to Targ, with new mazes and tougher enemies.', licence: MAME_LIC + 'spectar.zip).', url: MAME },

  // ── Paid homebrew: support the developers ──
  { id: 'micro-mages', host: 'paid', system: 'nes', title: 'Micro Mages', by: 'Morphcat Games', year: 2019, genre: 'Platformer · 1–4 players',
    blurb: 'Four wizards climb a monster tower. One of the most impressive NES homebrews ever made.',
    licence: 'From US$9.99 on itch.io.', url: 'https://morphcatgames.itch.io/micromages' },
  { id: 'twin-dragons', host: 'paid', system: 'nes', title: 'Twin Dragons', by: 'Broke Studio', year: 2018, genre: 'Co-op platformer',
    blurb: 'Two baby dragons team up across colourful levels.',
    licence: 'From US$9 on itch.io.', url: 'https://broke-studio.itch.io/twin-dragons' },
];

/** Pick the EmulatorJS system from a file name, or '' if unknown. */
export function systemForFile(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  if (ext === 'bin') return '';              // could be Mega Drive or Atari: ask
  for (const [id, s] of Object.entries(SYSTEMS)) if (s.ext.includes(ext)) return id;
  return '';
}

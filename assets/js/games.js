// ─────────────────────────────────────────────────────────────
//  GAME REGISTRY — add one entry here for every game.
//  The home page, leaderboard, daily challenge and badges all read this list.
//  See docs/ADDING_A_GAME.md.
// ─────────────────────────────────────────────────────────────
export const GAMES = [
  {
    id: 'neon-snake',
    gold: 'Golden Snake',            // golden character unlocked for Legends                       // must match the folder name and the Supabase games table
    title: 'Neon Snake',
    tagline: 'Eat, grow, glow. Dodge the walls as the pace climbs.',
    controls: 'Arrow keys / WASD · swipe on touch screens',
    difficulty: 'Easy start',
    color: '#22d3ee',
    isNew: false,
    achievements: [
      { id: 'golden',   icon: '🌟', title: 'Golden Bite',   desc: 'Eat a golden fruit' },
      { id: 'combo3',   icon: '🔥', title: 'Hungry Streak', desc: 'Reach a x3 combo' },
      { id: 'portal',   icon: '🌀', title: 'Wormhole',      desc: 'Travel through a portal' },
      { id: 'feast',    icon: '💎', title: 'Gem Feast',     desc: 'Eat 15 gems in one bonus round' },
      { id: 'level10',  icon: '🐍', title: 'Serpent Sage',  desc: 'Reach level 10' },
      { id: 'score5k',  icon: '🏅', title: 'Five Grand',    desc: 'Score 5,000 in one run' },
    ],
  },
  {
    id: 'feather-dash',
    gold: 'Golden Bird',            // golden character unlocked for Legends
    title: 'Feather Dash',
    tagline: 'Flap through the pillars from sunrise to the northern lights.',
    controls: 'Space / ↑ / click / tap to flap',
    difficulty: 'Medium',
    color: '#fbbf24',
    isNew: false,
    achievements: [
      { id: 'seeds50',  icon: '🌻', title: 'Seed Collector', desc: 'Collect 50 seeds in one run' },
      { id: 'shield',   icon: '🛡️', title: 'Lucky Feather',  desc: 'Grab a golden feather shield' },
      { id: 'saved',    icon: '💫', title: 'Close Call',     desc: 'Let a shield save you' },
      { id: 'combo4',   icon: '🔥', title: 'Seed Streak',    desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🦅', title: 'High Flyer',     desc: 'Reach level 10' },
      { id: 'score5k',  icon: '🏅', title: 'Five Grand',     desc: 'Score 5,000 in one run' },
    ],
  },
  {
    id: 'prism-breaker',
    gold: 'Golden Paddle & Ball',            // golden character unlocked for Legends
    title: 'Prism Breaker',
    tagline: 'Smash rainbow bricks, chain combos, catch the power-ups.',
    controls: 'Mouse / drag / ← → to move · Space or tap to launch',
    difficulty: 'Easy start',
    color: '#f472b6',
    isNew: false,
    achievements: [
      { id: 'chain10',  icon: '⛓️', title: 'Chain Reaction', desc: 'Break 10 bricks without touching the paddle' },
      { id: 'multi',    icon: '🔮', title: 'Seeing Triple',  desc: 'Catch a multi-ball' },
      { id: 'boom',     icon: '💥', title: 'Kaboom',         desc: 'Set off an explosive brick' },
      { id: 'flawless', icon: '✨', title: 'Flawless',       desc: 'Clear level 3 or higher without losing a life' },
      { id: 'level10',  icon: '🌈', title: 'Prism Master',   desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'astro-blaster',
    gold: 'Golden Ship',            // golden character unlocked for Legends
    title: 'Astro Blaster',
    tagline: 'Blast colourful asteroids — shoot a ⚡ shock rock for a huge chain reaction.',
    controls: 'Move: mouse / arrows / drag · Fire: hold Space or mouse button (touch & hold on phones)',
    difficulty: 'Medium',
    color: '#a855f7',
    isNew: false,
    achievements: [
      { id: 'shock',    icon: '⚡', title: 'Shock Wave',     desc: 'Set off a shock asteroid' },
      { id: 'shock5',   icon: '💥', title: 'Chain Reaction', desc: 'Destroy 5 rocks with one shockwave' },
      { id: 'ufo',      icon: '🛸', title: 'Close Encounter', desc: 'Shoot down a UFO' },
      { id: 'combo4',   icon: '🔥', title: 'On Fire',        desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🚀', title: 'Deep Space',     desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'crazy-putt',
    gold: 'Golden Golf Ball',            // golden character unlocked for Legends
    title: 'Crazy Putt',
    tagline: 'Crazy golf that looks easy… until the hidden traps get you. Go for a hole in one!',
    controls: 'Aim with mouse / finger (or ← →) · hold click or Space for power · release to putt',
    difficulty: 'Tricky',
    color: '#4ade80',
    isNew: false,
    achievements: [
      { id: 'ace',      icon: '⛳', title: 'Hole in One',    desc: 'Sink a hole in a single shot' },
      { id: 'ace3',     icon: '🏌️', title: 'Ace Collector',  desc: 'Get 3 holes in one in a single run' },
      { id: 'birdie',   icon: '🐦', title: 'Birdie',         desc: 'Finish a hole under par' },
      { id: 'trapped',  icon: '🕳️', title: 'Watch Your Step', desc: 'Fall down a hidden trapdoor' },
      { id: 'fake',     icon: '🤡', title: 'Fooled You',     desc: 'Putt into a fake hole' },
      { id: 'level10',  icon: '🏆', title: 'Course Master',  desc: 'Reach hole 10' },
    ],
  },
  {
    id: 'the-vault-job',
    gold: 'Golden Thief',
    title: 'The Vault Job',
    tagline: 'Sneak through the museum after dark. Dodge guards, cameras and lasers… grab the loot if you dare.',
    controls: 'Arrow keys / WASD / swipe to move one tile · hide behind plants and statues',
    difficulty: 'Sneaky',
    color: '#fbbf24',
    isNew: false,
    legend: true,                           // this game can make you a Legend (see assets/js/legends.js)
    achievements: [
      { id: 'escape',   icon: '🚪', title: 'Great Escape',   desc: 'Get out of the museum after level 15' },
      { id: 'greedy',   icon: '💰', title: 'Clean Sweep',    desc: 'Grab every treasure in a level' },
      { id: 'shadow',   icon: '🌿', title: 'In the Shadows', desc: 'Stay hidden while a guard walks right past you' },
      { id: 'level10',  icon: '🔦', title: 'Night Shift',    desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
      { id: 'egg',      icon: '🥚', title: 'The Golden Egg', desc: 'Open the display case in the vault', legendary: true, secret: true },
    ],
  },
  {
    id: 'galactic-alien-shooter',
    gold: 'Golden Starfighter',     // golden character unlocked for Legends
    title: 'Galactic Alien Shooter',
    tagline: 'Five alien warships, five different weapons. Grab lasers, rockets and blasters, rescue your abducted ship, then take on the Dreadnought!',
    controls: 'Fly: mouse / arrow keys / drag (up, down, left, right) · Fire: hold Space or mouse button (touch & hold on phones)',
    difficulty: 'Hard',
    color: '#22d3ee',
    isNew: true,
    achievements: [
      { id: 'rescue',   icon: '🚀', title: 'Twin Engines',       desc: 'Rescue your abducted ship for a twin fighter' },
      { id: 'squad',    icon: '🛸', title: 'Wing Clipper',       desc: 'Shoot down a diving carrier and both escorts' },
      { id: 'maxed',    icon: '🔋', title: 'Fully Loaded',       desc: 'Power a weapon up to level 3' },
      { id: 'boss',     icon: '☠️', title: 'Dreadnought Down',   desc: 'Destroy the Dreadnought boss' },
      { id: 'sharp',    icon: '🎯', title: 'Sharpshooter',       desc: 'Clear level 2+ with 75% accuracy' },
      { id: 'golden',   icon: '✨', title: 'Golden Starfighter', desc: 'Hit all 40 in a Star Run bonus — unlocks the golden ship' },
      { id: 'combo4',   icon: '🔥', title: 'On Fire',            desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🌌', title: 'Galaxy Defender',    desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',          desc: 'Score 10,000 in one run' },
    ],
  },

];

// Badges that any game can earn (unlocked automatically by the engine).
export const GLOBAL_ACHIEVEMENTS = [
  { id: 'first',   icon: '🎮', title: 'Welcome, Player', desc: 'Play your first game' },
  { id: 'all',     icon: '🧭', title: 'Explorer',        desc: 'Play every game' },
  { id: 'plays10', icon: '🔁', title: 'Regular',         desc: 'Play 10 rounds' },
  { id: 'plays50', icon: '🕹️', title: 'Arcade Legend',   desc: 'Play 50 rounds' },
  { id: 'daily',   icon: '📅', title: 'Daily Grinder',   desc: 'Play a daily challenge' },
  { id: 'bonus',   icon: '⭐', title: 'Bonus Hunter',    desc: 'Reach a bonus round' },
  { id: 'famous',  icon: '🏆', title: 'Famous',          desc: 'Put your name on a leaderboard' },
  { id: 'pb',      icon: '📈', title: 'Getting Better',  desc: 'Beat your own best score' },
  { id: 'legend',  icon: '👑', title: 'Legend',          desc: 'Finish a Legend game without losing a single life', legendary: true, secret: true },
];

export const gameById = (id) => GAMES.find((g) => g.id === id);

// One game per day gets the "Daily Challenge" (same seed for everyone, own leaderboard).
export function dailyGame(date = new Date()) {
  const day = Math.floor(date.getTime() / 86400000);
  return GAMES[day % GAMES.length];
}

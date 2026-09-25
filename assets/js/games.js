// ─────────────────────────────────────────────────────────────
//  GAME REGISTRY — add one entry here for every game.
//  The home page, leaderboard, daily challenge and badges all read this list.
//  See docs/ADDING_A_GAME.md.
// ─────────────────────────────────────────────────────────────
export const GAMES = [
  {
    id: 'neon-snake',                       // must match the folder name and the Supabase games table
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
    title: 'Astro Blaster',
    tagline: 'Blast colourful asteroids — shoot a ⚡ shock rock for a huge chain reaction.',
    controls: 'Drag / mouse / arrow keys to fly · fires automatically',
    difficulty: 'Medium',
    color: '#a855f7',
    isNew: true,
    achievements: [
      { id: 'shock',    icon: '⚡', title: 'Shock Wave',     desc: 'Set off a shock asteroid' },
      { id: 'shock5',   icon: '💥', title: 'Chain Reaction', desc: 'Destroy 5 rocks with one shockwave' },
      { id: 'ufo',      icon: '🛸', title: 'Close Encounter', desc: 'Shoot down a UFO' },
      { id: 'combo4',   icon: '🔥', title: 'On Fire',        desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🚀', title: 'Deep Space',     desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
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
];

export const gameById = (id) => GAMES.find((g) => g.id === id);

// One game per day gets the "Daily Challenge" (same seed for everyone, own leaderboard).
export function dailyGame(date = new Date()) {
  const day = Math.floor(date.getTime() / 86400000);
  return GAMES[day % GAMES.length];
}

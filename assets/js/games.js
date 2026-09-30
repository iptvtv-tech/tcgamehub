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
    id: 'snake-escape-puzzle',
    gold: 'Golden Snakes',          // golden character unlocked by the Zone 2 crown
    title: 'Snake Escape Puzzle',
    tagline: 'A knot of snakes, every one in another\'s way. Each tap slides a snake until it\'s blocked — clear the board before you run out of moves.',
    controls: 'Tap / click a snake to slide it · R or ↺ to restart the board (free) · arrow keys + Space',
    color: '#2dd4bf',
    isNew: true,
    achievements: [
      { id: 'clean',    icon: '🧠', title: 'Perfect Solve', desc: 'Clear level 3+ in the fewest possible moves' },
      { id: 'quick',    icon: '⏱️', title: 'Quick Thinker', desc: 'Clear a timed level with half the clock left' },
      { id: 'giant',    icon: '🪢', title: 'Giant Knot',    desc: 'Untangle a 9×9 puzzle' },
      { id: 'stampede', icon: '🐍', title: 'Stampede',      desc: 'Free 20 snakes in one bonus round' },
      { id: 'combo4',   icon: '🔥', title: 'Snake Charmer', desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🏅', title: 'Knot Master',   desc: 'Reach level 10' },
      { id: 'score10k', icon: '💯', title: 'Ten Grand',     desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'neon-beat',
    gold: 'Golden Notes',           // golden character unlocked by the Zone 2 crown
    title: 'Neon Beat',
    tagline: 'Hit the falling notes on the beat — every note you hit plays the tune. Chords, holds and stealth notes!',
    controls: '← ↓ ↑ → or A S W D · tap the lanes on touch screens · hold for long notes',
    color: '#e879f9',
    isNew: true,
    achievements: [
      { id: 'fullcombo',  icon: '🎯', title: 'Full Combo',   desc: 'Finish a song (level 2+) without a single miss' },
      { id: 'allperfect', icon: '💎', title: 'Pitch Perfect', desc: 'Finish a song with nothing but PERFECTs' },
      { id: 'streak100',  icon: '🔥', title: 'In the Zone',  desc: 'Hit a 100-note streak' },
      { id: 'sustain',    icon: '🎹', title: 'Sustain',      desc: 'Complete 10 hold notes in one song' },
      { id: 'fever',      icon: '⭐', title: 'Fever Pitch',  desc: 'Hit 60 notes in one Fever bonus' },
      { id: 'level10',    icon: '🎧', title: 'Headliner',    desc: 'Reach level 10' },
      { id: 'score10k',   icon: '🏅', title: 'Ten Grand',    desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'tower-topple',
    gold: 'Golden Bricks',          // golden character unlocked by the Zone 2 crown
    title: 'Tower Topple',
    tagline: 'Drop swinging floors from the crane and build sky-high. Off-centre floors make it lean… and TOPPLE!',
    controls: 'Tap / click / Space to drop the floor',
    color: '#fb923c',
    isNew: true,
    achievements: [
      { id: 'perfect5', icon: '🎯', title: 'Dead Centre',    desc: '5 PERFECT drops in a row' },
      { id: 'windy',    icon: '💨', title: 'Weather Proof',  desc: 'Land 10 floors in strong wind in one level' },
      { id: 'tall',     icon: '🏙️', title: 'Skyscraper',     desc: 'Stack 25 floors in one tower' },
      { id: 'rush',     icon: '⭐', title: 'Golden Rush',    desc: 'Stack 12 floors in one bonus round' },
      { id: 'nomiss',   icon: '🧱', title: 'Steady Hands',   desc: 'Clear level 3+ without losing a life' },
      { id: 'level10',  icon: '🏗️', title: 'Master Builder', desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'hyper-hex',
    gold: 'Golden Arrow',           // golden character unlocked by the Zone 2 crown
    title: 'Hyper Hex',
    tagline: 'Circle the core and slip through the gaps as hexagon walls close in and the world spins. Pure reflexes.',
    controls: 'Hold ← → or A / D · touch: hold the left or right side of the screen',
    color: '#22d3ee',
    isNew: true,
    achievements: [
      { id: 'nohit',     icon: '🎯', title: 'Untouchable',  desc: 'Clear level 3+ without losing a life' },
      { id: 'survive60', icon: '⏱️', title: 'Hyper Minute', desc: 'Survive a 60-second level' },
      { id: 'gems',      icon: '💎', title: 'Gem Rush',     desc: 'Grab 20 gems in one bonus round' },
      { id: 'combo4',    icon: '🔥', title: 'In the Flow',  desc: 'Reach a x4 combo' },
      { id: 'level10',   icon: '🌀', title: 'Hexpert',      desc: 'Reach level 10' },
      { id: 'score10k',  icon: '🏅', title: 'Ten Grand',    desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'galactic-alien-shooter',
    gold: 'Golden Starfighter',     // golden character unlocked for Legends
    title: 'Galactic Alien Shooter',
    tagline: 'Five alien warships, five different weapons. Grab lasers, rockets and blasters, rescue your abducted ship, then face four different bosses!',
    controls: 'Fly: mouse / arrow keys / drag (up, down, left, right) · Fire: hold Space or mouse button (touch & hold on phones)',
    color: '#22d3ee',
    isNew: false,
    achievements: [
      { id: 'rescue',   icon: '🚀', title: 'Twin Engines',       desc: 'Rescue your abducted ship for a twin fighter' },
      { id: 'squad',    icon: '🛸', title: 'Wing Clipper',       desc: 'Shoot down a diving carrier and both escorts' },
      { id: 'maxed',    icon: '🔋', title: 'Fully Loaded',       desc: 'Power a weapon up to level 3' },
      { id: 'boss',     icon: '☠️', title: 'Dreadnought Down',   desc: 'Destroy the Dreadnought boss' },
      { id: 'sharp',    icon: '🎯', title: 'Sharpshooter',       desc: 'Clear level 2+ with 75% accuracy' },
      { id: 'perfect',  icon: '✨', title: 'Perfect Run',        desc: 'Hit all 40 ships in a Star Run bonus' },
      { id: 'combo4',   icon: '🔥', title: 'On Fire',            desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🌌', title: 'Galaxy Defender',    desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',          desc: 'Score 10,000 in one run' },
    ],
  },

  {
    id: 'heist-planner',
    gold: 'Golden Heist Crew',      // golden character unlocked by the Zone 2 crown
    title: 'Heist Planner',
    tagline: 'Plan every step of your crew — thief, hacker and muscle — then press GO and watch the heist play out.',
    controls: 'Arrows / tap next to a crew member to plan steps · Space wait · Tab switch crew · Enter GO',
    color: '#fde047',
    isNew: true,
    legend: true,                   // Zone 2's Legends game
    achievements: [
      { id: 'firsttry',    icon: '🧠', title: 'Mastermind',     desc: 'Pull off a job with your very first plan' },
      { id: 'gems',        icon: '💎', title: 'Sticky Fingers', desc: 'Grab a bonus gem during a heist' },
      { id: 'fullcrew',    icon: '👥', title: 'The Full Crew',  desc: 'Finish a job with thief, hacker and muscle' },
      { id: 'safecracker', icon: '🔐', title: 'Safe Cracker',   desc: 'Crack 4 safes in one bonus round' },
      { id: 'escape',      icon: '🚐', title: 'Clean Getaway',  desc: 'Finish job 15, The Crown Vault' },
      { id: 'level10',     icon: '🗺️', title: 'Criminal Genius', desc: 'Reach job 10' },
      { id: 'crown',       icon: '👑', title: 'The Golden Crown', desc: 'Find the treasure in the secret job', legendary: true, secret: true },
    ],
  },
  {
    id: 'turbo-rush',
    gold: 'Golden Racer',           // golden character unlocked by the Zone 3 crown
    title: 'Turbo Rush',
    tagline: 'Race the clock down a neon highway. Weave through traffic, skim past cars for near-miss combos, and reach every checkpoint before time runs out.',
    controls: 'Steer ← → (or A / D) · ↑ / W nitro boost · ↓ / S brake · touch: hold the left or right side to steer, the middle to boost',
    color: '#ef4444',
    isNew: true,
    achievements: [
      { id: 'clean',    icon: '🧼', title: 'Clean Run',     desc: 'Clear level 3+ without crashing' },
      { id: 'nearmiss', icon: '💨', title: 'Hair\'s Breadth', desc: 'Chain 10 near misses in one level' },
      { id: 'photo',    icon: '📸', title: 'Photo Finish',  desc: 'Reach a checkpoint with under 2 seconds left' },
      { id: 'coins',    icon: '🪙', title: 'Coin Highway',  desc: 'Collect 60 coins in one bonus round' },
      { id: 'combo4',   icon: '🔥', title: 'On a Roll',     desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🏁', title: 'Road Warrior',  desc: 'Reach level 10' },
      { id: 'score10k', icon: '🏅', title: 'Ten Grand',     desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'bubble-blitz',
    gold: 'Golden Launcher',        // golden character unlocked by the Zone 3 crown
    title: 'Bubble Blitz',
    tagline: 'Fire coloured bubbles at the ceiling and pop groups of 3. Sparkly bubbles hide bonuses — or traps. The ceiling keeps dropping, so be quick!',
    controls: 'Aim with the mouse and click to fire · touch: drag to aim, let go to fire · ← → aim, Space fire, ↑ swap (or tap NEXT)',
    color: '#ec4899',
    isNew: true,
    achievements: [
      { id: 'flawless', icon: '💎', title: 'Flawless',       desc: 'Clear level 3+ without losing a life' },
      { id: 'bigdrop',  icon: '🌧️', title: 'Avalanche',      desc: 'Drop 10 bubbles with one shot' },
      { id: 'bank',     icon: '↩️', title: 'Bank Shot',      desc: 'Pop a group with a shot off the wall' },
      { id: 'treasure', icon: '🎁', title: 'Treasure Hunter', desc: 'Find 8 hidden bonuses in one game' },
      { id: 'bonanza',  icon: '🫧', title: 'Bubble Bonanza', desc: 'Pop 100 bubbles in one bonus round' },
      { id: 'combo4',   icon: '🔥', title: 'Pop Streak',     desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🏅', title: 'Bubble Boss',    desc: 'Reach level 10' },
      { id: 'score10k', icon: '💯', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'pinball-blast',
    gold: 'Golden Ball',            // golden character unlocked by the Zone 3 crown
    title: 'Pinball Blast Extreme',
    tagline: 'Neon pinball against the clock — and CHAOS: ghost balls, earthquakes, magnets, reversed flippers, hidden trap doors, portals and black holes. Hit the UFO for multiball jackpots!',
    controls: 'Flippers: ← → or A / D (touch: hold left / right half) · Launch: hold Space / touch, let go · Nudge: ↑ (too much = TILT)',
    color: '#f472b6',
    isNew: true,
    achievements: [
      { id: 'skill',     icon: '🎯', title: 'Skill Shot',     desc: 'Launch with a full-power plunger' },
      { id: 'neon',      icon: '💡', title: 'Lights On',      desc: 'Light all four N·E·O·N lanes' },
      { id: 'bank',      icon: '🧨', title: 'Bank Buster',    desc: 'Knock down the whole drop-target bank' },
      { id: 'multiball', icon: '🔒', title: 'Multiball!',     desc: 'Lock two balls and start multiball' },
      { id: 'jackpot',   icon: '🛸', title: 'UFO Jackpot',    desc: 'Hit the UFO during multiball' },
      { id: 'allballs',  icon: '🪙', title: 'Wizard',         desc: 'Finish a mission (level 3+) with all 3 balls left' },
      { id: 'frenzy',    icon: '⭐', title: 'Frenzy Jackpot', desc: 'Hit the saucer 3 times in one Multiball Frenzy' },
      { id: 'secret',    icon: '🚪', title: 'Secret Passage', desc: 'Find a hidden trap door that shoots you back to the top' },
      { id: 'level10',   icon: '🕹️', title: 'Table Master',   desc: 'Reach level 10' },
      { id: 'score10k',  icon: '🏅', title: 'Ten Grand',      desc: 'Score 10,000 in one run' },
    ],
  },
  {
    id: 'star-strike',
    gold: 'Golden Fighter',         // golden character unlocked by the Zone 3 crown
    title: 'Star Strike 3D',
    tagline: 'Fly a starfighter down a 3D space corridor. Blast fighter waves, asteroids and mines, thread laser gates — and take down the Mothership.',
    controls: 'Fly: arrows / WASD or mouse (touch: drag) · Fire: hold Space / mouse (touch fires automatically) · Bomb: B or 💣',
    color: '#38bdf8',
    isNew: true,
    achievements: [
      { id: 'ace',      icon: '🎖️', title: 'Ace Pilot',      desc: 'Clear sector 3+ without being hit' },
      { id: 'boss',     icon: '🛸', title: 'Mothership Down', desc: 'Destroy a Mothership' },
      { id: 'rings',    icon: '💫', title: 'Ring Master',    desc: 'Fly through 30 rings in one Ring Run' },
      { id: 'combo4',   icon: '🔥', title: 'Hot Streak',     desc: 'Reach a x4 combo' },
      { id: 'level10',  icon: '🚀', title: 'Deep Space',     desc: 'Reach sector 10' },
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
  { id: 'streak3', icon: '🔥', title: 'Warming Up',      desc: 'Play the daily challenge 3 days in a row' },
  { id: 'streak7', icon: '🔥', title: 'On Fire',         desc: 'Play the daily challenge 7 days in a row' },
  { id: 'streak30', icon: '🌟', title: 'Dedicated',      desc: 'Play the daily challenge 30 days in a row' },
  { id: 'bonus',   icon: '⭐', title: 'Bonus Hunter',    desc: 'Reach a bonus round' },
  { id: 'famous',  icon: '🏆', title: 'Famous',          desc: 'Put your name on a leaderboard' },
  { id: 'pb',      icon: '📈', title: 'Getting Better',  desc: 'Beat your own best score' },
  { id: 'legend',  icon: '👑', title: 'Legend',          desc: 'Finish a Legend game without losing a single life', legendary: true, secret: true },
  { id: 'crown1',  icon: '🥇', title: 'Zone 1 Crown',    desc: 'Become a Legend of Zone 1 — unlocks the golden characters in games 1–6', legendary: true, secret: true },
  { id: 'crown2',  icon: '💎', title: 'Zone 2 Crown',    desc: 'Become a Legend of Zone 2 — unlocks the golden characters in games 7–12', legendary: true, secret: true },
  { id: 'crown3',  icon: '🔱', title: 'Zone 3 Crown',    desc: 'Become a Legend of Zone 3 — unlocks the golden characters in games 13–18', legendary: true, secret: true },
  { id: 'grand',   icon: '🏆', title: 'Grand Legend',    desc: 'Win the crown of every zone', legendary: true, secret: true },
];

// ── Difficulty tiers & zones ─────────────────────────────────
// Games are numbered by their place in ZONES. Difficulty goes up with the number,
// and every 6th game (the last slot of each zone) is a Legends game.
export const TIERS = [
  { id: 'easy',    label: 'Easy',    color: '#4ade80', from: 1 },
  { id: 'medium',  label: 'Medium',  color: '#facc15', from: 3 },
  { id: 'hard',    label: 'Hard',    color: '#fb923c', from: 5 },
  { id: 'expert',  label: 'Expert',  color: '#f43f5e', from: 7 },
  { id: 'extreme', label: 'Extreme', color: '#c084fc', from: 10 },
  { id: 'master',  label: 'Master',  color: '#38bdf8', from: 13 },
];
export const tierFor = (n) => [...TIERS].reverse().find((t) => n >= t.from);

// null = a game still to be built (shows as "coming soon").
export const ZONES = [
  { n: 1, name: 'Zone 1 · Arcade Classics', blurb: 'Easy to Hard. The Vault Job is this zone\'s Legends game.',
    legendGame: 'the-vault-job',
    slots: ['neon-snake', 'feather-dash', 'prism-breaker', 'astro-blaster', 'crazy-putt', 'the-vault-job'] },
  { n: 2, name: 'Zone 2 · Hard Mode', blurb: 'Expert to Extreme — tougher than anything in Zone 1. Heist Planner is this zone\'s Legends game.',
    legendGame: 'heist-planner',
    slots: ['snake-escape-puzzle', 'neon-beat', 'tower-topple', 'hyper-hex', 'galactic-alien-shooter', 'heist-planner'] },
  { n: 3, name: 'Zone 3 · Master Class', blurb: 'Master difficulty — for players who have beaten Zone 2. New games arriving one at a time.',
    legendGame: null,
    slots: ['turbo-rush', 'bubble-blitz', 'pinball-blast', 'star-strike', null, null] },
];

/** Crown icon for each zone. */
export const crownIcon = (n) => ({ 1: '🥇', 2: '💎', 3: '🔱' }[n] || '👑');
/** Zones that have a Legends game yet (Grand Legend = the crown of every one of these). */
export const legendZones = () => ZONES.filter((z) => z.legendGame);

/** Every slot in order: { n, zone, tier, legendSlot, game|null } */
export const SLOTS = ZONES.flatMap((z) => z.slots.map((id, i) => {
  const n = (z.n - 1) * 6 + i + 1;
  return { n, zone: z, tier: tierFor(n), legendSlot: i === 5, game: id ? GAMES.find((g) => g.id === id) : null };
}));
for (const sl of SLOTS) {
  if (!sl.game) continue;
  Object.assign(sl.game, { number: sl.n, zone: sl.zone.n, tier: sl.tier.id, difficulty: sl.tier.label });
}
GAMES.sort((a, b) => (a.number || 99) - (b.number || 99));
export const zoneOf = (id) => ZONES.find((z) => z.slots.includes(id)) || null;

export const gameById = (id) => GAMES.find((g) => g.id === id);

// One game per day gets the "Daily Challenge" (same seed for everyone, own leaderboard).
export function dailyGame(date = new Date()) {
  const day = Math.floor(date.getTime() / 86400000);
  return GAMES[day % GAMES.length];
}

// ─────────────────────────────────────────────────────────────
//  SEARCH + "ABOUT THIS GAME" COPY — one entry per game id.
//  Used by tools/build-pages.mjs to write each game page's <title>, meta
//  description, share card and the "How to play" section, and by the
//  genre pages. Keep `blurb` under 155 characters (Google cuts it there).
//    kind  — what to call it in the title: "<Title> – free online <kind> | Quick Play Arcade"
//    blurb — one or two plain sentences: what you do and why it's fun
//    how   — 3–5 short steps a new player needs (controls are added automatically)
//    tip   — optional one-liner shown at the end of "How to play"
// ─────────────────────────────────────────────────────────────
export const COPY = {
  'neon-snake': {
    kind: 'snake game',
    blurb: 'Classic snake with a neon glow: eat fruit, grow longer and dodge walls and portals as the pace climbs. Free, no download, levels and high scores.',
    how: ['Steer the snake with the arrow keys or WASD, or swipe on a phone.', 'Eat the fruit to grow and to fill the level bar.', 'Walls and obstacles appear from level 4 — from then on the edges no longer wrap.', 'Eat quickly in a row to build a combo multiplier.'],
    tip: 'Golden fruit is worth far more, and portals are a shortcut when you are cornered.',
  },
  'feather-dash': {
    kind: 'flappy bird style game',
    blurb: 'Flap a little bird through gaps in the pillars from sunrise to the northern lights, collecting seeds and shields. Free one-button browser game.',
    how: ['Tap, click, press Space or ↑ to flap — the bird falls when you do nothing.', 'Fly through the gap in each pair of pillars.', 'Collect seeds for points and golden feathers for a shield.', 'Pillars start to move from level 3.'],
    tip: 'Short, steady taps keep the bird level; one tap too many sends it into the top pillar.',
  },
  'prism-breaker': {
    kind: 'brick breaker game',
    blurb: 'A rainbow brick-breaker: bounce the ball off your paddle, smash bricks, chain combos and catch multi-ball and explosive power-ups. Free to play.',
    how: ['Move the paddle with the mouse, by dragging, or with ← and →.', 'Press Space or tap to launch the ball.', 'Clear every breakable brick to finish the level.', 'Catch falling capsules for multi-ball, a wider paddle and more.'],
    tip: 'Hit the ball with the edge of the paddle to change its angle.',
  },
  'astro-blaster': {
    kind: 'asteroid shooter',
    blurb: 'Blast colourful asteroids in a free space shooter. Shoot a shock rock to set off a chain reaction, dodge UFOs and climb the levels.',
    how: ['Move the ship with the mouse, the arrow keys, or by dragging on a phone.', 'Hold Space or the mouse button to fire (touch and hold on a phone). The ship never fires by itself.', 'Destroy the number of asteroids shown at the top to clear the level.', 'Shoot a ⚡ shock rock when others are close to it for a huge chain reaction.'],
  },
  'crazy-putt': {
    kind: 'crazy golf game',
    blurb: 'Crazy golf in your browser: aim, hold for power and putt past windmills, water and hidden trapdoors. Go for a hole in one. Free, no sign-up.',
    how: ['Aim with the mouse or your finger (or ← and →).', 'Hold the mouse button, Space or your finger to build power, then let go to putt.', 'Sink the ball within the stroke limit to move on to the next hole.', 'Watch the green: sand, trapdoors and fake holes are hidden on it.'],
    tip: 'A hole in one scores big, and three in one run earns the Ace Collector badge.',
  },
  'the-vault-job': {
    kind: 'stealth puzzle game',
    blurb: 'Sneak through a museum after dark, one tile at a time. Dodge guards, cameras and lasers, grab the loot and reach the exit. Zone 1’s Legends game.',
    how: ['Move one tile at a time with the arrow keys, WASD, or a swipe.', 'Guards walk fixed routes; wait or hide behind plants and statues until they pass.', 'Grab the treasure, then get to the exit before the lights come on.', 'Lasers and cameras switch on and off on a timer — watch the pattern.'],
    tip: 'Finish all 15 levels from level 1 without losing a life and something waits beyond level 15.',
  },
  'snake-escape-puzzle': {
    kind: 'snake puzzle game',
    blurb: 'A knot of snakes, every one in another’s way. Tap a snake to slide it until it is blocked and clear the board in as few moves as you can. Free puzzle.',
    how: ['Tap or click a snake to slide it in the direction it faces.', 'A snake moves until it hits another snake, a rock or the edge.', 'Free every snake from the board before you run out of moves.', 'Press R or ↺ to restart the board at no cost.'],
    tip: 'Clear a board in the fewest possible moves for the Perfect Solve badge.',
  },
  'neon-beat': {
    kind: 'rhythm game',
    blurb: 'Hit the falling notes on the beat and every note you hit plays the tune. Chords, long holds and stealth notes. A free rhythm game in your browser.',
    how: ['Press ← ↓ ↑ → (or A S W D) as each note reaches the line, or tap the lanes on a phone.', 'Hold the key for long notes.', 'Perfect timing scores more than Good; a miss costs health.', 'Finish the song to clear the level.'],
    tip: 'Press [ or ] on a keyboard to shift the timing if the notes feel early or late.',
  },
  'tower-topple': {
    kind: 'tower stacking game',
    blurb: 'Drop swinging floors from a crane and build as high as you can. Off-centre floors make the tower lean until it topples. Free one-tap stacking game.',
    how: ['Tap, click or press Space to drop the swinging floor.', 'Land it squarely on the floor below — a floor off the edge tips off and costs a life.', 'Stack the number of floors shown to finish the level.', 'Wind and heavy floors arrive in later levels.'],
    tip: 'A perfect, dead-centre drop straightens the tower a little.',
  },
  'hyper-hex': {
    kind: 'reflex arcade game',
    blurb: 'Circle the core and slip through the gaps as hexagon walls close in and the world spins. Pure reflexes. Free Super Hexagon style browser game.',
    how: ['Hold ← or → (A or D) to circle; on a phone hold the left or right side of the screen.', 'Slip through the gap in each ring of walls as it closes in.', 'Survive the clock to clear the level; the spin and speed rise every level.', 'Tap once on a phone to hop one lane.'],
  },
  'galactic-alien-shooter': {
    kind: 'Galaga style shooter',
    blurb: 'Fight five alien warships with five weapons, rescue your abducted ship for a twin fighter and take on four bosses. Free retro space shooter.',
    how: ['Fly with the mouse, arrow keys, or drag on a phone.', 'Hold Space or the mouse button to fire (touch and hold on a phone).', 'Destroy the whole fleet to clear the level; some ships dive at you.', 'Pick up lasers, rockets and blasters, and power each one up to level 3.'],
    tip: 'Let a carrier abduct your ship, then shoot it down to fly a twin fighter.',
  },
  'heist-planner': {
    kind: 'strategy puzzle game',
    blurb: 'Plan every step of your crew — thief, hacker and muscle — then press GO and watch the heist play out. Free turn-based puzzle. Zone 2’s Legends game.',
    how: ['Pick a crew member and tap the tiles next to them (or use the arrows) to plan their moves.', 'Space adds a wait, Tab switches crew, Enter or GO runs the plan.', 'Guards and cameras follow fixed patterns — plan around them.', 'Every crew member must reach the van with the loot.'],
    tip: 'Pull off a job with your very first plan for the Mastermind badge.',
  },
  'turbo-rush': {
    kind: '3D racing game',
    blurb: 'Race the clock from the driver’s seat through coast roads, mountain passes, tunnels and city freeways. Near-miss combos, nitro, police and rival duels. Free.',
    how: ['Steer with ← and → (A and D); on a phone drag the wheel or tilt.', 'Reach each checkpoint before the clock runs out.', 'Skim past cars for near-miss combos; drive clean and slipstream to charge nitro, then hold ↑ to use it.', 'Press C to switch between the cockpit and the chase camera.'],
    tip: 'Beat VIPER to the checkpoint in a rival duel for the Viper Slayer badge.',
  },
  'bubble-blitz': {
    kind: 'bubble shooter',
    blurb: 'Fire glossy 3D bubbles up the table and pop groups of three. Sparkly bubbles hide bonuses or traps, and the ceiling keeps dropping. Free bubble shooter.',
    how: ['Aim with the mouse and click to fire; on a phone drag to aim and let go.', 'Match three or more of a colour to pop them.', 'Clear the board before the ceiling reaches the line.', 'Press ↑ or tap NEXT to swap the bubble you are holding.'],
    tip: 'Bounce a shot off the wall to reach bubbles hiding behind others.',
  },
  'pinball-blast': {
    kind: '3D pinball game',
    blurb: 'Neon 3D pinball against the clock with chaos events: ghost balls, earthquakes, magnets, reversed flippers, portals and black holes. Free online pinball.',
    how: ['Flippers: ← and → (A and D), or hold the left or right half of the screen.', 'Hold Space or your finger to pull the plunger and let go to launch.', 'Complete the mission shown at the top before the clock runs out.', 'Nudge with ↑ — too much and the table tilts.'],
    tip: 'Lock two balls to start multiball, then hit the UFO for the jackpot.',
  },
  'star-strike': {
    kind: '3D space shooter',
    blurb: 'Fly a starfighter down a 3D space corridor. Grab spread shot, plasma, homing missiles and a wingman drone, and take down three bosses. Free.',
    how: ['Fly with the arrow keys, WASD or the mouse; drag on a phone.', 'Hold Space or the mouse button to fire; on a phone you fire while touching.', 'Press B or 💣 for a bomb that clears the screen.', 'Fly into capsules to upgrade your weapons.'],
  },
  'eggspress': {
    kind: 'egg delivery driving game',
    blurb: 'Deliver one very loose egg over the hills to the farm. Ramps, chasms, wind and oil — hard landings crack it, and three cracks is splat. Free physics game.',
    how: ['Drive with → (D or Space) and brake or reverse with ← (A); on a phone hold the right or left side.', 'In the air, → tips the truck back and ← tips it forward.', 'Land gently — every hard landing cracks the egg.', 'Reach the farm with the egg in its cup.'],
  },
  'crypt-of-crowns': {
    kind: '3D dungeon crawler',
    blurb: 'Explore 15 hand-built crypts in first person. Find keys, work levers, search for secret walls and time your way past skeleton patrols. Zone 3’s Legends game.',
    how: ['Step forward and back with ↑ and ↓ (W and S); turn with ← and → (A and D). On a phone use the on-screen stick.', 'Press Space (or tap the view) to search walls and open chests.', 'Find the key, then the stairs down.', 'Skeleton patrols walk fixed routes — wait for the gap.'],
    tip: 'Start at crypt 1 and never get caught: the Crypt Kings buried their crown in the deepest crypt.',
  },
  'tc-pixel-craft': {
    kind: 'block building survival game',
    blurb: 'An open-world block survival game in your browser. Start with nothing, punch trees, craft tools, find food, survive the nights and face the Shadow King.',
    how: ['Move with WASD, look with the mouse (click the view first), Shift to sprint.', 'Left click mines or hits; right click places a block, uses an item or eats.', 'Press E for your bag and the crafting menu.', 'Your energy drops over time — find food before night falls.'],
    tip: 'Advancements are earned as you play; press L to see them.',
  },
  'dungeon-escape': {
    kind: '3D maze game',
    blurb: 'Lost in a 3D maze with a dying torch. Grab the keys, find the stairs and stay a step ahead of the ghouls hunting you in the dark. Free first-person game.',
    how: ['Walk with ↑ and ↓ (W and S), turn with ← and → (A and D); on a phone use the stick.', 'Find every key, then the stairs, before your torch burns out.', 'Press Space or ✨ to flash your torch and stun a ghoul in front of you.', 'The minimap shows where you have been.'],
  },
  'neon-drift': {
    kind: '3D drift racing game',
    blurb: 'Neon racing from the driver’s seat on a glowing grid circuit. Throw the car sideways, chain drifts, dodge oil and beat five rivals — plus a boss every 5th level.',
    how: ['Steer with ← and → (A and D); on a phone drag the wheel or tilt.', 'Press Space or ↓ to handbrake into a drift; hold it round the bend.', 'Press ↑ (W) to fire the boost you charged while drifting.', 'Beat the rivals to the flag to win the race.'],
    tip: 'Full lock through a bend starts a drift on its own.',
  },
  'crystal-cascade': {
    kind: 'match-3 puzzle shooter',
    blurb: 'Fire crystals onto a turning platform and match three to shatter them. Set off cascades, bombs and drills, and crack the gold geodes before the stack breaks the laser ring.',
    how: ['Aim with the mouse or ← and →; on a phone drag to aim.', 'Click, press Space or let go to fire.', 'Match three crystals of a colour to shatter them; chains score more.', 'Crack the ◆ geodes marked on the board to finish the level.'],
  },
  'void-breaker': {
    kind: '3D arena shooter',
    blurb: 'Stand at the heart of a glowing arena as geometric invaders pour in from every side. Light-trail shots, a NOVA shockwave and a giant boss every 5th wave. Free.',
    how: ['Aim with the mouse (click to lock the cursor) or ← and →; drag to turn on a phone.', 'Hold the mouse button, Space or your finger to fire.', 'Press ↑ (W) or NOVA for a shockwave that clears the ring around you.', 'Pick an upgrade between waves.'],
  },
  'crown-heist': {
    kind: '3D stealth game',
    blurb: 'Sneak into the Deep Vaults by torchlight, lift the crown from its pedestal and run. Fifteen floors of guards, portcullises and crumbling floors. Zone 4’s Legends game.',
    how: ['Move with ↑ ↓ (W S), turn with ← → (A D), sidestep with Q and E; on a phone use the stick and drag the view.', 'Stay out of the guards’ torch cones — hide in alcoves and throw coins (C) to lure them away.', 'Grab the crown (Space), then run for the stairs before the vault seals.', 'Smoke bombs (X) lose a guard that is chasing you.'],
    tip: 'Carry the crown out of floor 15 — over as many visits as it takes — to win the Golden Throne Egg.',
  },
  'lunar-delivery': {
    kind: '3D lunar lander game',
    blurb: 'Fly a moon hopper between lunar bases with a cargo crate swinging on your tow cable. Land gently, dodge meteors and dust geysers, and mind your fuel. Free.',
    how: ['Hold Space to thrust; tilt with ↑ and ↓, turn with ← and →, sidestep with Q and E. On a phone use the stick and hold THRUST.', 'Hover low over the waiting crate to hook it.', 'Set it down gently inside the green ring at the next base.', 'Land on any pad to refuel.'],
    tip: 'Touch down at under 1 m/s for the Feather Touch bonus.',
  },
  'orbit-hopper': {
    kind: 'one-button space game',
    blurb: 'Circle a planet, let go at the right moment and slingshot through gravity to the next one. Climb to the golden beacon, grab stars on the way, and don\u2019t drift into the void. Free.',
    how: ['Your hopper circles the planet on its own \u2014 watch the direction it is facing.', 'Press Space, click or tap to let go. You fly straight, bent by every planet\u2019s gravity.', 'Touch a planet to swing into its orbit. Each new planet pays points and grows your combo.', 'Reach the golden \u2605 beacon at the top to finish the level. From level 4 planets drift, and from level 7 a black hole lurks between them.'],
    tip: 'A near miss is a free slingshot: grazing a planet\u2019s gravity bends you around it and flings you out faster.',
  },
  'vault-of-stars': {
    kind: 'speedrun puzzle game',
    blurb: 'Fifteen sealed vaults on an alien moon. Time the laser grids, slip past sentry drones, drift across zero-g fields and reach the airlock before your oxygen runs out. Zone 5’s Legends game.',
    how: ['Move one tile per step with the arrow keys, WASD, a swipe or the on-screen pad.', 'Everything moves on the same clock, so each vault plays out the same way every time.', 'Laser emitters flicker one beat before they fire.', 'Reach the airlock before the oxygen gauge empties; collect key cards to open force-field doors.'],
    tip: 'Clear a vault within half a second of its par time for the Speed of Light badge.',
  },
};

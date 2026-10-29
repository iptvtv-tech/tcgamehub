# Quick Play Arcade — tcgamehub.win

Browser-games site: plain HTML/CSS/JS with **no build step on deploy** — GitHub Pages
serves the committed files. "Quick Play Arcade" is the site name, "TC Game Hub" the
publisher. Supabase holds the leaderboard (players enter a name only). GoatCounter
(code `tcgamehub`) is the **only** analytics — never add another tracker.

## Git workflow

- **Never commit or push without the owner's review and go-ahead.** Work on a review
  branch; merge to main only when told.
- Bump `CACHE_VERSION` in `sw.js` on every release (any merge to main that changes the site).

## Structure rules

- Zones of 6 games, difficulty rising; the order lives in `ZONES` in `assets/js/games.js`
  (the source of truth for zones, slots and genres). The 6th game of each zone is a
  LEGENDS game.
- **Every game is open to everyone.** Zones are a recommended order; playing all six
  games of a zone completes it (+50 tokens, home-page celebration). Never add unlock
  gates back.
- Legends: finish a Legends game from level 1 without losing a life to open its secret
  final level and win the zone's Golden Egg. The Golden Crown = all 5 eggs of Zones 1–5,
  fixed from now on (`CROWN_EGGS = 5`; it was 4 until 29 Oct 2026 and players crowned
  then keep it); every egg after Zone 5 adds a jewel to the crown.
  Eggs gate nothing except golden characters.
- **Golden characters are egg-only, never sold**, and every unlockable character must be
  GOLDEN, in every game, including future ones.
- Arcade tokens (`assets/js/tokens.js`) are **cosmetic only** and never touch scores;
  150/day earn cap; lifetime earned and owned items only ever grow (max-merge via
  Legend code). Spent at `/shop/`.
- Retro Vault (`/retro-vault/`) hosts legal homebrew only and posts no scores.
- Phone header is a top bar with a ☰ menu (`assets/js/site.js`); nav links live in the
  sheet under 600px.

## Adding a game

Follow `docs/ADDING_A_GAME.md`: copy `games/_template`, register it in
`assets/js/games.js` (with genres), add its copy to `assets/js/game-copy.js`, add its
Supabase row (Zone 5 games go in `supabase/zone5.sql`), then run
`node tools/build-pages.mjs --images`. Build each new game in sections for the owner's
review, and give it a `world.js`/`sim.js` + `check.mjs` level checker where levels are
generated.

## Generated files — never hand-edit

`games/<id>/index.html`, `games/index.html`, `games/<genre>/`, `badges/index.html`,
`sitemap.xml`, `games/<id>/og.jpg`, the `build:*` blocks in `index.html` and other
pages, and the "N free browser games" counts in the home page title/meta. Change
`games.js`, `game-copy.js` or `tools/build-pages.mjs` and rebuild;
`node tools/build-pages.mjs --check` verifies without writing.

## Engine and gameplay rules

- Use the seeded `s.rng` for all gameplay randomness (the Daily Challenge depends on
  it); `Math.random` only for pure cosmetics like starfields.
- Scores go only through the server-ticketed `submit_score_v2`. **NEVER put the
  service_role key in the repo.**
- Zone 3+ games get original sound/music (`assets/js/audio.js` styles with a custom
  `arp`/`oct` pattern).
- Portrait phones: `def.extend = { maxH, topShare }` grows the canvas into top/bottom
  bands (`shell.bands`); draw touch controls in the band (see Eggspress `drawPedals`,
  the racers' cockpit `drop()`), gated on `bands.bottom >= 150` so desktops are
  unchanged. Use `shell.coarse` for touch checks and `input.pointers` for multi-touch.
- Astro Blaster fires only on Space or mouse button.
- Run the level checkers after changing levels: `tools/check-*.mjs` and
  `games/*/check.mjs`.

## Testing

- Before pushing a batch of game or engine changes, run `node tools/smoke.mjs` (or
  `--quick`, or `--games=a,b`). It plays every game headless through the real engine
  (layout on phone + desktop, levels, lives, bonus/secret, game over, play again,
  stale cached pictures) and exits non-zero on any problem. Needs Playwright once:
  `npm install -g playwright && npx playwright install chromium`.
- Local server: `python3 -m http.server 8765` from the repo root.
- `window.shell` is the live engine handle on a game page (`state`, `score`, `level`,
  `game`, `bands`, `input`) — handy for headless Playwright smoke tests.

## Working with the owner

When a decision is needed, present it as a short list of clickable options with a
recommended choice.

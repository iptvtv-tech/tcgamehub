# TC Arcade — tcgamehub.win

Browser-games site: plain HTML/CSS/JS with **no build step on deploy** — GitHub Pages
serves the committed files. "TC Arcade" is the one name for the site and its
publisher (until Nov 2026 it was "Quick Play Arcade" by "TC Game Hub"). Supabase holds the leaderboard (players enter a name only). GoatCounter
(code `tcgamehub`) is the **only** analytics — never add another tracker.

## Git workflow

- **Never commit or push without the owner's review and go-ahead.** Work on a review
  branch; merge to main only when told.
- Bump `CACHE_VERSION` in `sw.js` on every release (any merge to main that changes the site).
  Do it as the **last commit on the review branch** (plus a sitemap rebuild if game files
  changed: commit the game changes first, then run `node tools/build-pages.mjs` and commit
  `sitemap.xml`), wait for GitHub's "all tests passed", then fast-forward `main` to that exact
  commit. `main` only accepts commits that passed the tests, so nothing is committed on `main`
  itself.

## Structure rules

- Zones of 6 games, difficulty rising; the order lives in `ZONES` in `assets/js/games.js`
  (the source of truth for zones, slots and genres). The 6th game of each zone is a
  LEGENDS game. Zones 1–5 are full; Zone 6 (*Inferno*) opened on 30 Oct 2026 with Magma
  Escape; Avalanche Run joined on 20 Nov 2026 and was rebuilt side-on on 21 Nov 2026 (flips off kickers of four
  sizes, a sword for the yetis, an avalanche always in the picture; wolves and the giant yeti to come). Inferno
  Vault (slot 36, a side-on stealth game) is Zone 6's Legends game and holds the Inferno Crystal (its secret
  level 16, The Heart of the Vault), leaving three "coming soon" slots (33–35). A zone with no game yet (Zone 7) stays in `ZONES`
  but is not shown on the home page until its first game is registered.
- **Every game is open to everyone.** Zones are a recommended order; playing all six
  games of a zone completes it (+50 tokens, home-page celebration). Never add unlock
  gates back.
- Legends: finish a Legends game from level 1 without losing a life to open its secret
  final level and win the zone's Frost Crystal. The Frost Crown = all 5 crystals of Zones 1–5,
  fixed from now on (`CROWN_EGGS = 5`; it was 4 until 29 Oct 2026 and players crowned
  then keep it); every crystal after Zone 5 adds a jewel to the crown.
  Crystals gate nothing except golden characters. Until Nov 2026 they were the Golden Eggs
  and the Golden Crown: the code still says egg (`EGGS`, `eggSVG`, `Legends.eggs()`,
  `data-gold-theme`, reward `egg`) so saved progress, Legend codes and crowns carry over —
  rename only what players read, never those names.
- **Golden characters are crystal-only, never sold**, and every unlockable character must be
  GOLDEN, in every game, including future ones.
- Arcade tokens (`assets/js/tokens.js`) are **cosmetic only** and never touch scores;
  150/day earn cap; lifetime earned and owned items only ever grow (max-merge via
  Legend code). Spent at `/shop/`.
- Retro Vault (`/retro-vault/`) hosts legal homebrew only and posts no scores.
- The Iceman (hero of Magma Escape and Avalanche Run) is the site's mascot. `assets/img/iceman.png`
  and the home share card `assets/img/og.png` are drawn from the game's own art by
  `node tools/brand/render.mjs` (re-run it after changing his art or the site address).
- Phone header is a top bar with a ☰ menu (`assets/js/site.js`); nav links live in the
  sheet under 600px.

## Moving to tcarcade.com (Nov 2026)

The site moves from tcgamehub.win to tcarcade.com (Cloudflare zone ready, DNS only, not live
yet). Saved progress lives in each browser under the address it was made on, so it travels
in the link: `https://tcarcade.com/<page>#carry=<data>`. Keep these working until mid-2027:
- `assets/js/theme-boot.js` (first script on every page) merges a carry in — only ever adds,
  keeps the earliest `crownAt`; a carry without a tcgamehub.win referrer waits for a yes
  (`site.js` moveNotice, which also shows the "moving" / "Bring my progress" notes).
- `carry/index.html` + `assets/js/carry-out.js` pack the progress on the old address. `sw.js`
  shows the carry page when a page on the old address redirects to tcarcade.com.
- After the move, tcgamehub.win is a Cloudflare 301 to the same page, except `/carry/`,
  `/assets/js/carry-out.js` and `/sw.js`, served by `tools/cloudflare/old-domain-worker.js`.
- Tests: `tools/check-carry.mjs` (in test-all) and `tools/e2e-carry.mjs` (real Chromium + service
  worker, both addresses on a local HTTPS server; needs port 443, run by hand).

## Adding a game

Follow `docs/ADDING_A_GAME.md`: copy `games/_template`, register it in
`assets/js/games.js` (with genres), add its copy to `assets/js/game-copy.js`, add its
Supabase row (each zone has one combined, re-runnable file: `supabase/zone5.sql`,
`supabase/zone6.sql`, … — the owner runs it in the Supabase SQL Editor, and scores are
rejected until then), then run
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
- On-screen buttons: read fingers from `shell.input.pointers` (or follow a pointer id and release on
  `pointerup`/`pointercancel`). Phones do not always report a finger lifting, so the engine compares
  its list with the phone's own after every touch event and lets lost fingers go, sending a
  `pointercancel` for each (`assets/js/touch.js`, checked by `tools/check-touch.mjs`). Never keep
  a private "finger is down" flag that only a `pointerup` can clear. Keep buttons 26 px clear of
  the screen's side edges (iPhones start their own swipes there).
- Astro Blaster fires only on Space or mouse button.
- Run the level checkers after changing levels: `tools/check-*.mjs` and
  `games/*/check.mjs`.

## Testing

- `node tools/test-all.mjs` (or `--games=a,b`): every level checker, every game test
  (`games/<id>/test.mjs`) and the page-build check, in a few minutes, no browser.
- Game tests run the real `game.js` in Node via `tools/lib/headless.mjs` (engine stubbed:
  fixed 1/120 s step, lives, `onLifeLost`, `completeLevel`, seeded `s.rng`). Each proves
  its levels can be **finished after real mistakes** and that its **rules always hold**
  (in bounds, speed caps, goal counts). Every new game needs one (`docs/ADDING_A_GAME.md`),
  and every bug report gets a failing test before its fix. `tools/lib/bot-play.mjs` (`botPlay`)
  plays one level in a test with the game's benchmark bot.
- `node tools/bench.mjs` (or `--games=a,b`, `--seeds=N`): the benchmark. Each game's
  `games/<id>/bench.mjs` gives a bot (plays through the controls only, `b.skill` 0..1), one real
  `mistake`, `progress()` and `invariants()`. Hard rules, the same for every zone: an expert bot
  finishes every level after a mistake, started straight from that level; invariants hold every
  step; progress never stalls for `stuck` s; no exceptions. Difficulty (lives an average bot
  loses per level, walls) is reported on the GitHub run summary, not enforced yet. Every game
  needs a bench.mjs; games without one are listed as "no bot yet".
- `node tools/smoke.mjs` (or `--games=a,b`, `--zone=N`, `--quick`): every game in headless
  Chromium through the real engine (layout on phone + desktop, every level, lives,
  bonus/secret, game over, play again, stale cached pictures). Needs Playwright once:
  `npm install -g playwright && npx playwright install chromium`.
- GitHub runs both on every push to a non-main branch and nightly on main
  (`.github/workflows/tests.yml`, smoke at every level, one job per zone, zones read from
  `games.js`). "all tests passed" is the check `main` requires.
- Local server: `python3 -m http.server 8765` from the repo root.
- `window.shell` is the live engine handle on a game page (`state`, `score`, `level`,
  `game`, `bands`, `input`) — handy for headless Playwright smoke tests.

## Working with the owner

When a decision is needed, present it as a short list of clickable options with a
recommended choice.

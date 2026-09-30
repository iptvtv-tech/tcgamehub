# Quick Play Arcade

A static website of quick browser games with levels, bonus rounds, combos, badges, a daily challenge and a public high-score board where players enter **only a name**.

- **Hosting:** GitHub Pages (free) with your own domain
- **High scores:** Supabase (free tier), called straight from the browser. There's no server to run.
- **No build step:** plain HTML, CSS and JavaScript. Edit a file, push it, and it's live.

| Game | What it is |
|---|---|
| **Neon Snake** | Snake with neon colours. Golden fruit, blocks, solid walls, portals and sparks get added level by level. Bonus round: a gem feast where you can't crash. |
| **Feather Dash** | Flappy-style endless flyer. Pillars start to sway, golden-feather shields and hawks come in later, and the scenery goes from day to sunset to night to aurora. Bonus round: golden sky. |
| **Astro Blaster** | Colourful space shooter. ⚡ Shock asteroids go off with a bang, a flash and a shockwave that chain-reacts; plus splitting rocks, power-ups, comets and UFOs. Bonus: crystal storm. |
| **Crazy Putt** | Crazy golf: hold to power up, aim line, windmills, water, bumpers and *hidden* traps (trapdoors, secret sand, speed pads, fake holes). Big hole-in-one bonus. Bonus: hole-in-one frenzy. |
| **The Vault Job** | Stealth heist through a museum at night: guards with torch beams, cameras, guard dogs, lasers and hiding spots. 15 levels, and a secret for anyone who finishes without losing a life… |
| **Snake Escape Puzzle** | Game 7 (Zone 2). A knot of snakes where every snake blocks another. A tap slides a snake until it's blocked; clear the board within the move limit (pre-built, computer-solved puzzles; `node tools/gen-snake-puzzles.mjs`). Clock from level 12. Bonus: Stampede. |
| **Neon Beat** | Game 8 (Zone 2). 4-lane rhythm game with its own beat — every note you hit plays the tune. Chords, hold notes, 16th runs and stealth notes; misses drain your energy. Bonus: Fever. |
| **Tower Topple** | Game 9 (Zone 2). Drop swinging floors from a crane; real balance physics — lean too far and the tower topples. Wind, different widths, a bobbing crane, earthquakes and heavy steel floors. Bonus: Golden Rush. |
| **Hyper Hex** | Game 10 (Zone 2, Extreme). Circle the core and slip through the gaps as hexagon walls close in and the world spins; survive the clock (20 s at level 1, up to 60 s). Spirals, tunnels and reversing spin. Bonus: Gem Rush. |
| **Galactic Alien Shooter** | Hard formation space shooter. Fly anywhere in the lower half. Five alien warships with their own weapons; scarce power-ups (blaster, timed rockets, a rare laser once every 5 levels from a red-glowing carrier), shields, rescue your abducted ship for a twin fighter. Four different bosses on levels 9, 19, 29, 39 (then tougher Mk 2s). Bonus: Star Run. |
| **Heist Planner** | Game 12 — Zone 2's **Legends game**. Plan every step of a thief, hacker and muscle, then watch the heist play out. 15 jobs, and a secret 16th for flawless crews that wins the Zone 2 crown. Bonus: Safe Cracker. |
| **Turbo Rush** | Game 13 (Zone 3, Master). Pseudo-3D neon highway racer: reach each checkpoint before the clock runs out, weave through traffic, chain near-miss combos. Hills, trucks, night, lane-changers, rain and fog. Bonus: Coin Highway. |
| **Bubble Blitz** | Game 14 (Zone 3, Master). Fast bubble shooter: pop groups of 3, drop whole clusters. Sparkly bubbles hide bonuses (bomb, lightning, rainbow, star, freeze, laser sight) or traps (stone, ceiling drop, shuffle, skull row, fog) — knock them down to keep bonuses and defuse traps. The ceiling drops every few shots and the launcher fires on its own if you wait. Bonus: Bubble Bonanza. |
| **Pinball Blast Extreme** | Game 15 (Zone 3, Master). Neon pinball against the clock with CHAOS every few seconds (👻 ghost ball, 🌋 earthquake, 🧲 magnet, 🔀 reversed flippers, ⚡ flipper glitch), hidden 🚪 trap doors (secret passage… or down the chute), 🌀 teleport portals, black holes, a UFO, spinner and 2-ball lock multiball with jackpots. Bonus: Multiball Frenzy. |
| **Star Strike 3D** | Game 16 (Zone 3, Master). 3D space-corridor shooter with real lit low-poly models: fighter waves, asteroids, mines, laser gates, kamikaze divers, aiming turrets and a Mothership boss every 5th-minus-one sector. Power-ups: twin lasers, shield, bombs. Bonus: Ring Run. |
| **Dungeon Escape 3D** | Game 17 (Zone 3, Master). First-person 3D maze escape on a shared raycaster (`assets/js/raycast.js`): a new maze every level, keys to collect, a torch that burns down, spike traps and ghouls that hunt you by sight. ⚡ Flash stuns them. Bonus: Treasure Vault. |
| **Prism Breaker** | Rainbow brick breaker with 10 layouts, tough, steel and explosive bricks, and 5 power-ups. Bonus round: a piñata party where the floor is shielded. |

---

## 1. Try it on your computer first

Browsers won't run these game files if you just double-click `index.html`. They need to be served by a small local web server. Pick one:

- **VS Code:** install the **Live Server** extension, then right-click `index.html` → *Open with Live Server*.
- **Python:** in this folder run `python -m http.server 8000` and open <http://localhost:8000>.
- **Node:** `npx serve .`

Until Supabase is connected, scores are saved in your own browser only (the leaderboard page says so). Everything else works.

---

## 2. Set up Supabase (the shared leaderboard)

1. At <https://supabase.com>, create a **New project**. Pick the region closest to your players (e.g. *West EU (London)* or *West EU (Ireland)*) and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste in the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. You should see *Success*.
3. Go to **Project Settings → API Keys** (older dashboards: **Settings → API**) and copy:
   - the **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - the **Publishable key** (`sb_publishable_…`). On older projects, use the **anon public** key instead.
4. Paste both into [`assets/js/config.js`](assets/js/config.js):

   ```js
   supabaseUrl: 'https://abcdefgh.supabase.co',
   supabaseKey: 'sb_publishable_xxxxxxxxxxxx',
   ```

> ✅ The publishable/anon key is **meant to be public**. The database only accepts scores through the `submit_score_v2` function, which needs a one-time game ticket timed by the server, checks the name, rejects impossible scores and too-short games, and rate-limits spam.
> ⛔ **Never** put the *secret* / *service_role* key in this project.

> ℹ️ Supabase pauses free projects after about a week with no activity. A site people visit keeps it awake. If it does pause, press **Restore** in the dashboard.

---

## 3. Put it on GitHub Pages

1. Create a new **public** repository on GitHub, e.g. `arcade`.
2. Upload everything in this folder. You can use the website (*Add file → Upload files*, then drag the whole folder contents in), **GitHub Desktop**, or:

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/arcade.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages → Build and deployment**, set **Source: Deploy from a branch**, then **Branch: `main` / `(root)`** → Save.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/arcade/`.

---

## 4. Connect your domain

1. **Settings → Pages → Custom domain**: type your domain (e.g. `playquick.ie`) and Save. GitHub adds a `CNAME` file to the repo for you.
2. At your domain registrar, add these DNS records:

   | Type | Name / Host | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `YOUR-USERNAME.github.io` |

3. DNS can take from a few minutes to a few hours. When GitHub shows the check as passed, tick **Enforce HTTPS**.
4. Recommended: **verify the domain** under your GitHub account's *Settings → Pages* so nobody else can claim it.

Then replace the placeholders:
- `example.com` → your domain, in `index.html` and the game pages (canonical and share-image links), `robots.txt` and `sitemap.xml`
- `Quick Play Arcade` → your site name. It appears in `assets/js/config.js`, the `<title>` tags and `manifest.webmanifest`. Use find-and-replace across the folder.

---

## 5. Everyday admin

Run these in the Supabase **SQL Editor**:

```sql
-- remove a rude name everywhere
delete from public.scores where lower(name) = lower('BadName');
-- remove one suspicious score
select id, game, name, score, level, duration_ms, created_at from public.scores order by score desc limit 20;
delete from public.scores where id = 123;
```

To block more words, run `insert into public.banned_words values ('word');` and also add the word to the `BANNED` list in `assets/js/scores.js`.

---

## 6. Adding a new game

See **[docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md)**. In short: copy `games/_template`, add one entry to `assets/js/games.js`, and add one row in Supabase.

---

## How the site keeps people playing

- **Daily challenge streaks** (🔥 3 / 7 / 30-day badges) are counted in the player's own browser only.
- **"Beat my score" links**: the WhatsApp share opens the game with a challenge banner (`?beat=12450&by=Sam`) and tells the friend if they won.
- **Fair scores**: every game starts with a server-timed ticket (`start_game` → `submit_score_v2`), see `supabase/update-2026-10.sql`.
- **Visitor stats (optional)**: set `goatcounter` in `assets/js/config.js` to your GoatCounter code. No cookies; only page paths and anonymous game start/finish events are counted.

| Feature | Where |
|---|---|
| One-click **Play now** (picks a game you haven't tried) | Home |
| **Daily Challenge**: one game a day, same seed for everyone, own board, countdown | Home, leaderboard, `?daily=1` |
| **Latest scores ticker** and each game's "Today's top" | Home |
| **Continue where you left off**, with **checkpoints** every 5 levels | Home, game menu |
| Difficulty up **6–7% per level**, **a new element every few levels** | Each game |
| **Bonus round every 5th level** (can't lose, timer, big points) | Engine |
| **Combos** up to x5/x6 with sounds and pop-ups | Engine |
| **Instant restart**: Enter/Space/R, *Play again* focused | Game over |
| **Near-miss messages**: "Only 120 off your best", "just 80 more for the top 20" | Game over |
| Rank shown straight away, **name entry only if you make the board** | Game over |
| **Today / Week / All-time** boards, one row per name | Leaderboard |
| **26 badges** with unlock toasts | Games, home |
| Synthesised **sound effects and chiptune music**, separate mute toggles | Engine |
| Phone-friendly **touch, swipe and drag** controls, auto-pause when the tab is hidden | Engine |
| **Installable / offline** (web-app manifest and service worker) | Site |

## Zones & difficulty

Zone 3 (*Master Class*, games 13–18) opens once every Zone 2 game has been played. Turbo Rush, Bubble Blitz, Pinball Blast Extreme, Star Strike 3D and Dungeon Escape 3D are live; game 18 (Zone 3's Legends game) is coming next.

Games are laid out in `ZONES` in `assets/js/games.js`: 6 games per zone, getting harder from #1 (Easy) to #12 (Extreme). The 6th game of every zone is its **Legends game**. Empty slots (`null`) show as "coming soon" cards. To add a game to a slot, put its id in place of the `null`.

## Legends (secret rewards)

Every zone's 6th game is a **Legends game** (*The Vault Job* for Zone 1, *Heist Planner* for Zone 2). They have a fixed number of levels. Finish every level **starting from level 1 without losing a single life** and a secret final level opens. Completing it makes the player a **Legend**:
- golden versions of every game's main character (switchable in each game's menu),
- special gold "Legendary" badges on the home page,
- the hidden **Hall of Legends** page (`/hall-of-legends/`) with every Legend's name,
- a Legend code to restore everything on another device.

Run `supabase/legends-update.sql` once to switch on the Hall of Legends, and `supabase/zone2-update.sql` for the Zone 2 games. Level checkers: `node tools/check-vault-levels.mjs`, `node tools/check-heist-levels.mjs`. Adding golden characters and new Legend games is covered in docs/ADDING_A_GAME.md.

## Project layout

```
index.html                 home page
leaderboard/  about/       other pages
games/<id>/                one folder per game (index.html, game.js, thumb.svg)
games/_template/           copy this to start a new game
assets/js/config.js        ← your settings (Supabase keys, site name)
assets/js/games.js         ← game registry (add new games here)
assets/js/engine.js        shared game engine (loop, input, levels, game over…)
assets/js/scores.js        leaderboard (Supabase or local fallback)
assets/js/audio.js         synthesised sounds + music
assets/js/legends.js       Legends: golden characters, Hall of Legends, Legend codes
hall-of-legends/           the hidden Hall of Legends page
assets/css/                styles
supabase/schema.sql        database setup (run once)
```

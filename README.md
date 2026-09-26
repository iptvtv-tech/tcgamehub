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

> ✅ The publishable/anon key is **meant to be public**. The database only accepts scores through the `submit_score` function, which checks the name, rejects impossible scores and too-short games, and rate-limits spam.
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
assets/css/                styles
supabase/schema.sql        database setup (run once)
```

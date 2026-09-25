# Adding a new game

The shared engine (`assets/js/engine.js`) already handles the title menu, level banners, bonus rounds, combos, lives, pause, sound, the game-over screen, high scores, the daily challenge and badges. A new game only needs to describe itself and draw.

## Steps

### 1. Copy the template
Copy `games/_template/` to `games/<your-id>/`, for example `games/space-dodge/`. Use lowercase letters and dashes only.

The template is a small working game called "Star Catcher". Open `http://localhost:8000/games/_template/` to try it.

### 2. Edit `games/<your-id>/game.js`
- Set `id: 'space-dodge'`. It must match the folder name.
- Write your game class. It needs three methods:

| Method | When it runs |
|---|---|
| `startLevel(level, bonus)` | At the start of every level. Build the level here. `bonus` is `true` on every 5th level. |
| `update(dt)` | 120 times a second while playing. `dt` is in seconds. |
| `render(ctx)` | Every frame. Draw with canvas 2D, using coordinates `0..width, 0..height`. |

And these optional ones: `onAction(a)`, `onPointerMove(x, y, down)`, `idle(dt)`, `reset()`, `onLifeLost()`, `onLevelClear()`, `onGameOver()`.

`onAction` receives `'left' 'right' 'up' 'down'` (arrow keys, WASD or swipes), `'action'` (Space/Enter), `'press'` (finger or mouse down), `'tap'` and `'release'`.

### 3. Things the engine gives you (`this.s` in the template)

```js
s.rng.range(a, b) / s.rng.int(a, b) / s.rng.chance(p) / s.rng.pick(arr)  // seeded random: USE THIS for gameplay
s.speed(0.07)                   // 1.07^(level-1): use it to scale speed/difficulty per level
s.award(10 * level, x, y, { chain: true, color })  // add points (x combo if chain) with a floating "+10"
s.resetCombo()                  // e.g. when the player misses
s.completeLevel()               // level done → banner → startLevel(level + 1)
s.hurt()                        // lose a life; game over on the last one
s.unlock('badge-id')            // unlock a badge listed in games.js
s.sound.play('coin' | 'eat' | 'gem' | 'golden' | 'powerup' | 'flap' | 'bounce' | 'brick' | 'boom' | 'hit' | 'metal' | 'life', intensity)
s.fx.burst(x, y, { color, count, speed })  s.fx.ring(x, y)  s.fx.text(x, y, 'Nice!')  s.fx.shake(6)  s.fx.flash('#fff')
s.input.isDown('left')          // held keys
s.level  s.bonus  s.score  s.lives  s.comboCount  s.multiplier  s.bonusLeft  s.state
```

Always use `s.rng` for anything that affects gameplay, such as where things spawn. That's what makes the **Daily Challenge** identical for every player. For purely cosmetic things like background stars, `Math.random()` is fine.

Badges named `level10`, `score5k`, `score10k` or `combo3` unlock **automatically**. The engine reads the number from the id.

### 4. Register it in `assets/js/games.js`

```js
{
  id: 'space-dodge',
  title: 'Space Dodge',
  tagline: 'One line that sells it.',
  controls: '← → or drag',
  difficulty: 'Medium',
  color: '#34d399',          // accent colour for the card, HUD and glow
  isNew: true,               // shows a NEW pill on the home page
  achievements: [
    { id: 'level10', icon: '🚀', title: 'Deep Space', desc: 'Reach level 10' },
  ],
},
```

The home page card, leaderboard tab, daily-challenge rotation, "Try another game" links and badge list all update from this entry.

### 5. Add a thumbnail
Put a square `thumb.svg` in the game folder. A small animated SVG looks great on the cards. You can copy one of the existing ones.

### 6. Allow it on the online leaderboard
In Supabase → SQL Editor, run:

```sql
insert into public.games (id, title, max_points_per_second) values ('space-dodge', 'Space Dodge', 3000);
```

`max_points_per_second` is the anti-cheat limit: the most points per second, averaged over a whole game, that a very good player could score. Set it generously. Scores above it are rejected.

Also add the page to `sitemap.xml`.

### 7. Test, then push
- Play levels 1–6 so you see a bonus round and a checkpoint.
- Try it on a phone (touch controls).
- Commit and push. GitHub Pages updates in about a minute.

## Tips for a good new game
- **Levels 1–2 should be almost impossible to fail.** They teach the controls.
- Raise speed about **6–7% per level**, and **add one new thing every 2–3 levels**.
- **Bonus rounds** should feel different: new colours, no way to lose, lots to collect.
- Add plenty of feedback: particles, a sound for every point, and screen shake on big moments.

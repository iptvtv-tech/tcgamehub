// ─────────────────────────────────────────────────────────────
//  NEW GAME TEMPLATE — "Star Catcher" (a tiny working example)
//
//  1. Copy this whole folder to  games/<your-game-id>/
//  2. Change `id` below to the same <your-game-id>
//  3. Add an entry in assets/js/games.js
//  4. Add a row to the games table in Supabase (see docs/ADDING_A_GAME.md)
//
//  The engine handles menus, levels, bonus rounds, combos, lives, pause,
//  sound, high scores and badges. You write: startLevel, update, render.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';

const W = 480, H = 720;

runGame({
  id: '_template',          // ← must match your folder name + games.js entry
  width: W, height: H,      // logical canvas size (the engine scales it to fit the screen)
  lives: 3,                 // 1 = one mistake ends the game
  comboWindow: 2,           // seconds between hits before the combo resets (0 = never times out)
  comboStep: 3,             // hits needed per +1 multiplier
  maxMultiplier: 5,
  bonusTime: 15,            // seconds in each bonus round (every 5th level)
  music: { bpm: 120, style: 'major', lead: 'square' }, // style: minor | major | dream ; or music: false

  // Text under the "Level N" banner
  levelInfo: (level, bonus) => bonus ? 'Stars everywhere and no bombs!' : level === 1 ? 'Catch the stars, dodge the bombs.' : 'Faster!',

  create: (shell) => new StarCatcher(shell),
});

class StarCatcher {
  constructor(s) {
    this.s = s;              // the engine: s.rng, s.award(), s.completeLevel(), s.hurt(), s.fx, s.sound, s.input …
    this.t = 0;
    this.x = W / 2;
    this.startLevel(1, false);
  }

  // Called at the start of every level. Use s.rng (seeded) for anything random,
  // so the Daily Challenge is identical for everyone.
  startLevel(level, bonus) {
    this.level = level; this.bonus = bonus;
    this.fallSpeed = 180 * this.s.speed(0.07);   // +7% per level
    this.items = []; this.spawnT = 0;
    this.caught = 0; this.need = 8 + level * 2;
  }

  // Optional: keyboard / tap events ('left','right','up','down','action','press','tap','release')
  onAction(a) {}
  // Optional: mouse / finger position
  onPointerMove(x) { this.x = x; }
  // Optional: called after a life is lost, before "Get ready!"
  onLifeLost() { this.items = []; }

  // Runs 120 times per second while playing
  update(dt) {
    const s = this.s;
    this.t += dt;
    if (s.input.isDown('left')) this.x -= 500 * dt;
    if (s.input.isDown('right')) this.x += 500 * dt;
    this.x = clamp(this.x, 40, W - 40);

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = this.bonus ? 0.15 : 0.7 / this.s.speed(0.05);
      const bomb = !this.bonus && s.rng.chance(0.25);
      this.items.push({ x: s.rng.range(20, W - 20), y: -20, bomb });
    }
    for (const it of this.items) {
      it.y += this.fallSpeed * dt;
      if (it.y > H - 70 && it.y < H - 40 && Math.abs(it.x - this.x) < 50) {
        it.gone = true;
        if (it.bomb) {
          s.fx.burst(it.x, it.y, { color: '#fb7185', count: 30 });
          s.hurt();                       // lose a life (game over on the last one)
          return;
        }
        s.award(10 * this.level, it.x, it.y - 20, { chain: true, color: '#fde047' }); // points × combo
        s.sound.play('coin', s.comboCount);
        s.fx.burst(it.x, it.y, { color: '#fde047', count: 12 });
        if (!this.bonus && ++this.caught >= this.need) return s.completeLevel();
      }
      if (it.y > H + 20) { it.gone = true; if (!it.bomb) s.resetCombo(); }
    }
    this.items = this.items.filter((it) => !it.gone);
  }

  // Also runs on menus / banners (for background animation)
  idle(dt) { this.t += dt; }

  // Draw everything. Coordinates are always 0..W, 0..H.
  render(ctx) {
    ctx.fillStyle = this.bonus ? '#3b1a5c' : '#0f172a';
    ctx.fillRect(0, 0, W, H);
    for (const it of this.items) {
      ctx.fillStyle = it.bomb ? '#fb7185' : '#fde047';
      ctx.beginPath(); ctx.arc(it.x, it.y, it.bomb ? 14 : 10, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#22d3ee';
    roundRect(ctx, this.x - 45, H - 60, 90, 16, 8); ctx.fill();
    if (!this.bonus) progressBar(ctx, 16, 14, W - 32, 18, this.caught / this.need, '#22d3ee', `Stars ${this.caught} / ${this.need}`);
  }
}

// Benchmark contract for the template game (copy it with the folder; see tools/bench.mjs).
// Try it: node tools/bench.mjs --games=_template
// The bot slides the catcher under the lowest star it can reach, and away from bombs.
const W = 480, H = 720;

export default {
  levels: 20,                         // endless game: bench levels 1–20
  limit: (level) => 60 + level * 6,   // seconds the expert may take on a level
  stuck: 20,                          // a star lands every second or so: 20 s without one = stuck

  // rises as the player gets somewhere in the level
  progress: (g) => g.caught,

  // the game's own rules, checked after every engine step
  invariants(g) {
    if (!Number.isFinite(g.x) || g.x < 40 || g.x > W - 40) return `catcher at x=${g.x} is off its track`;
    if (!g.bonus && g.caught > g.need) return `caught ${g.caught} of ${g.need}`;
    return null;
  },

  // called before every engine step while in play — act only through the controls
  bot(g, s, b) {
    const react = (1 - b.skill) * 0.25;                   // the worse the bot, the later it looks
    const seen = g.items.filter((it) => it.y > -20 + react * g.fallSpeed && it.y < H - 40);
    const bombs = seen.filter((it) => it.bomb && it.y > H - 220);
    const stars = seen.filter((it) => !it.bomb).sort((a, c) => c.y - a.y);
    let target = stars[0] ? stars[0].x : W / 2;
    for (const bm of bombs) if (Math.abs(bm.x - target) < 60) target = bm.x + (target >= bm.x ? 70 : -70);
    target += (b.rand() - 0.5) * (1 - b.skill) * 120;     // aim noise
    const dx = target - g.x;
    s.hold(Math.abs(dx) < 8 ? [] : dx < 0 ? ['left'] : ['right']);
  },

  // one real mistake: stand under the next bomb
  mistake(g, s) {
    const bomb = g.items.filter((it) => it.bomb && it.y > 0).sort((a, c) => c.y - a.y)[0];
    if (!bomb) return false;
    const dx = bomb.x - g.x;
    s.hold(Math.abs(dx) < 6 ? [] : dx < 0 ? ['left'] : ['right']);
    return Math.abs(dx) < 6 && bomb.y > H - 140;
  },
};

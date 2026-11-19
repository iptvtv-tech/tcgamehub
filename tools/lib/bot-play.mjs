// ─────────────────────────────────────────────────────────────
//  BOT PLAY — one level played headless by a game's benchmark bot (games/<id>/bench.mjs), for
//  game tests that need a real player: "finish this level after a real mistake, with the rules
//  holding at every step". The same loop as tools/bench.mjs play(), plus a hook after each step.
//
//    import { botPlay } from '../../tools/lib/bot-play.mjs';
//    const r = botPlay(G, B, { level: 7, seed: 2 });       // expert bot, one real mistake
//    r.cleared, r.deaths, r.mistakeCost, r.broken, r.secs, r.shell
// ─────────────────────────────────────────────────────────────
import { STEP } from './headless.mjs';

function dice(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * @param G        loadGame(id)
 * @param B        the game's bench contract (bot, mistake, invariants, limit)
 * @param level    level to start straight at
 * @param seed     game seed (and the bot's dice)
 * @param skill    0..1 (1 = expert)
 * @param mistake  make the contract's one real mistake about 2 s in
 * @param each     (g, s) => string|null, called after every step in play: a broken rule, described
 * @param limit    seconds allowed (default: the contract's limit for this level)
 */
export function botPlay(G, B, { level, seed = 1, skill = 1, mistake = true, each, limit } = {}) {
  const s = G.start({ seed: seed * 7919 + level * 31 + (mistake ? 1 : 0), level, unlimited: true });
  const g = s.game;
  const b = { skill, rand: dice(seed * 104729 + level), t: 0, level, mem: {} };
  let todo = mistake && !!B.mistake && !s.bonus, livesAtMistake = null, playT = 0, broken = null;
  const steps = Math.round((limit ?? (B.limit ? B.limit(level) : 300)) / STEP);
  for (let i = 0; i < steps && !s.cleared && s.state !== 'over' && !broken; i++) {
    if (s.state === 'playing') {
      b.t = playT;
      if (todo && playT > 2) { if (B.mistake(g, s, b)) { todo = false; livesAtMistake = s.livesLost; } }
      else B.bot(g, s, b);
    } else s.hold([]);                                          // a lost life or a banner: let go of the controls
    s.tick();
    if (s.state !== 'playing') continue;
    playT += STEP;
    broken = B.invariants?.(g, s) || each?.(g, s) || null;
  }
  return {
    cleared: !!s.cleared, secs: s.time, deaths: s.livesLost, broken, shell: s,
    mistakeMade: livesAtMistake != null,
    mistakeCost: livesAtMistake == null ? null : s.livesLost - livesAtMistake,
  };
}

/** Why a botPlay() run did not finish, in words (for a test's failure line). */
export const why = (r) => (r.broken ? `rule broken: ${r.broken}` : r.shell.state === 'over' ? 'game over' : `not finished after ${r.secs.toFixed(0)} s`);

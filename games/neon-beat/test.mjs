// node games/neon-beat/test.mjs
// Regression test (29 Oct 2026 review): the song clock follows the audio clock. If the audio
// clock says "running" but stops moving (an output device dropping out), the song used to freeze:
// no notes, no drain, a song that never ends. Plays the real game headless
// (tools/lib/headless.mjs) with a fake audio clock that runs, freezes, then runs again.
import { loadGame, reporter } from '../../tools/lib/headless.mjs';

const NB = await loadGame('neon-beat');
const t = reporter('neon-beat');
const NOOP = new Proxy(function () {}, { get: () => NOOP, apply: () => NOOP });

for (const level of [1, 4, 9]) {
  const s = NB.start({ seed: level, level, lives: 99 }), g = s.game;
  let clock = 0, frozen = false;
  s.sound = new Proxy(NOOP, { get: (_, k) => (k === 'now' ? () => clock : NOOP) });
  // nobody is pressing keys, so keep the energy topped up: a lost life would pause the song
  const tickWithAudio = (secs) => { for (let i = 0; i < secs * 120; i++) { if (!frozen) clock += 1 / 120; g.hp = 100; s.tick(); } };
  tickWithAudio(2);
  const before = g.songT;
  frozen = true; tickWithAudio(2);                  // the audio clock stops moving for 2 s
  const during = g.songT - before;
  frozen = false; tickWithAudio(1);
  t.check(during > 1.4, `level ${level}: the song moved only ${during.toFixed(2)} s in 2 s while the audio clock was stuck — it would never end`);
  t.check(g.songT > before + during + 0.8, `level ${level}: the song didn't pick up again when the audio clock moved`);
}
t.done('the song keeps moving when the audio clock stalls, and follows it again after');

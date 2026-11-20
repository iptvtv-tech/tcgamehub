// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — its own music and sounds (the Zone 3+ rule: nothing borrowed).
//
//  MUSIC (chord runs 'avalanche', 'whiteout' and 'crystalrush' in assets/js/audio.js):
//    slope    D minor, driving eighths over a running bass: the day and dusk runs
//    storm    E minor on the synth kit with a falling hook: the night runs, the blizzard, the giant
//    rush     a bright quick run for the crystal rushes
//  The tempo climbs a little with each run (1.2% a run) and then, on top of that, with the
//  avalanche: the closer the snow behind you, the faster the tune (up to a fifth faster).
//
//  SOUNDS are all made here from tones and filtered noise: the runners on the snow, the wind in a
//  tuck, the avalanche's rumble, wolves, yetis, ice, the giant.
// ─────────────────────────────────────────────────────────────
export const MUSIC = {
  slope: { bpm: 132, style: 'avalanche', lead: 'triangle', arp: [0, 2, 1, 2, 3, 2, 1, 2], oct: [12, 12, 12, 12, 12, 12, 24, 12], bass: 'drive' },
  storm: { bpm: 136, style: 'whiteout', lead: 'sawtooth', kit: 'synth', arp: [0, 1, 2, 1, 3, 1, 2, 1], oct: [12, 12, 12, 12, 12, 12, 12, 24],
    hook: [4, null, 3, null, 2, 3, 1, null, 4, null, 5, 4, 3, null, 2, null] },
  rush: { bpm: 152, style: 'crystalrush', lead: 'square', arp: [0, 1, 2, 3, 4, 3, 2, 1], oct: [12, 12, 12, 12, 12, 12, 12, 12], bass: 'drive' },
};
/** Which tune a run plays. */
export const tuneFor = (level, bonus) => (bonus ? MUSIC.rush : level >= 11 ? MUSIC.storm : MUSIC.slope);

/** All the game's sounds, made on the shell's sound object (which does nothing when muted or headless). */
export function makeSfx(S) {
  const on = () => !S.muted, n = (o) => S.noise(o), t = (o) => S.tone(o), note = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const play = (fn) => (...a) => { if (on()) try { fn(...a); } catch { /* audio not ready */ } };
  return {
    // ── the sled
    runners: play((k) => n({ dur: 0.16, vol: 0.012 + 0.03 * k, freq: 700 + 2600 * k, to: 500 + 1500 * k, type: 'bandpass' })),          // the hiss of snow under the runners, by speed (0..1)
    wind: play((k) => n({ dur: 0.32, vol: 0.02 + 0.035 * k, freq: 500 + 900 * k, to: 1500 + 1600 * k, type: 'bandpass' })),             // the air in a tuck or a boost
    carve: play((pan) => n({ dur: 0.12, vol: 0.05, freq: 2600, to: 900, type: 'bandpass', pan })),                                       // a hard turn
    hop: play(() => { t({ freq: 300, to: 620, dur: 0.1, type: 'sine', vol: 0.07 }); n({ dur: 0.07, vol: 0.06, freq: 2400, to: 900 }); }),
    launch: play(() => { n({ dur: 0.34, vol: 0.12, freq: 600, to: 3600, type: 'bandpass' }); t({ freq: 220, to: 660, dur: 0.3, type: 'triangle', vol: 0.06 }); }),
    land: play(() => { n({ dur: 0.14, vol: 0.14, freq: 1400, to: 260 }); t({ freq: 150, to: 70, dur: 0.12, type: 'sine', vol: 0.1 }); }),
    trick: play((spins) => [0, 4, 7, 12, 16].slice(0, 3 + Math.min(2, spins)).forEach((s, i) => t({ freq: note(76 + s), dur: 0.12, type: 'triangle', vol: 0.11, delay: i * 0.055 }))),
    tumble: play(() => { n({ dur: 0.26, vol: 0.24, freq: 1600, to: 160 }); t({ freq: 190, to: 60, dur: 0.22, type: 'square', vol: 0.09 }); n({ dur: 0.09, vol: 0.12, freq: 900, to: 300, delay: 0.2 }); n({ dur: 0.09, vol: 0.1, freq: 800, to: 260, delay: 0.42 }); }),
    near: play((pan) => n({ dur: 0.16, vol: 0.09, freq: 1200, to: 3600, type: 'bandpass', pan })),                                       // a tree whipping past your ear
    cleared: play(() => t({ freq: 520, to: 880, dur: 0.09, type: 'sine', vol: 0.08 })),
    crystal: play((combo = 0) => { const p = Math.min(14, combo); t({ freq: note(84 + p), dur: 0.09, type: 'sine', vol: 0.1 }); t({ freq: note(91 + p), dur: 0.14, type: 'triangle', vol: 0.06, delay: 0.04 }); }),
    // ── the mountain
    rumble: play((k) => { n({ dur: 0.42, vol: 0.05 + 0.2 * k, freq: 110 + 60 * k, to: 60 }); if (k > 0.6) t({ freq: 52, to: 38, dur: 0.38, type: 'sawtooth', vol: 0.05 * k }); }),   // the avalanche behind you (0..1)
    caught: play(() => { n({ dur: 1.1, vol: 0.34, freq: 900, to: 70 }); t({ freq: 90, to: 30, dur: 0.9, type: 'sawtooth', vol: 0.13 }); n({ dur: 0.5, vol: 0.16, freq: 2800, to: 500, type: 'bandpass', delay: 0.05 }); }),
    fell: play(() => { t({ freq: 880, to: 110, dur: 0.6, type: 'sine', vol: 0.12 }); n({ dur: 0.3, vol: 0.2, freq: 500, to: 90, delay: 0.62 }); }),
    flag: play(() => [0, 7, 12].forEach((s, i) => t({ freq: note(79 + s), dur: 0.22, type: 'sine', vol: 0.12, delay: i * 0.09 }))),
    hut: play(() => { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => t({ freq: note(69 + s), dur: 0.2, type: 'triangle', vol: 0.13, delay: i * 0.1 })); n({ dur: 0.2, vol: 0.1, freq: 500, to: 160, delay: 0.75 }); }),
    ice: play(() => { n({ dur: 0.4, vol: 0.07, freq: 5200, to: 3200, type: 'highpass' }); t({ freq: 1900, to: 1500, dur: 0.3, type: 'sine', vol: 0.03 }); }),
    drift: play(() => { n({ dur: 0.3, vol: 0.2, freq: 500, to: 140 }); n({ dur: 0.25, vol: 0.08, freq: 2400, to: 900, type: 'bandpass', delay: 0.05 }); }),
    gust: play(() => { n({ dur: 0.7, vol: 0.12, freq: 900, to: 5200, type: 'bandpass' }); [0, 5, 7, 12, 17, 19].forEach((s, i) => t({ freq: note(84 + s), dur: 0.16, type: 'sine', vol: 0.08, delay: i * 0.05 })); }),
    blizzard: play(() => n({ dur: 1.5, vol: 0.05, freq: 500, to: 1700, type: 'bandpass', pan: Math.random() * 2 - 1 })),
    // ── the creatures
    howl: play((count = 1) => { for (let i = 0; i < Math.min(2, count); i++) { t({ freq: 330 + i * 45, to: 620 + i * 60, dur: 0.45, type: 'sine', vol: 0.09, delay: i * 0.22, attack: 0.08 }); t({ freq: 620 + i * 60, to: 470 + i * 40, dur: 0.55, type: 'sine', vol: 0.08, delay: 0.45 + i * 0.22 }); } }),
    growl: play((pan) => { t({ freq: 92, to: 74, dur: 0.42, type: 'sawtooth', vol: 0.07, pan }); n({ dur: 0.4, vol: 0.05, freq: 320, to: 200, pan }); }),
    bite: play(() => { n({ dur: 0.06, vol: 0.2, freq: 3200, to: 900 }); t({ freq: 240, to: 120, dur: 0.1, type: 'square', vol: 0.09, delay: 0.03 }); }),
    yelp: play((pan) => { t({ freq: 980, to: 420, dur: 0.16, type: 'triangle', vol: 0.1, pan }); n({ dur: 0.12, vol: 0.12, freq: 900, to: 260, pan }); }),
    roar: play((big) => { t({ freq: big ? 110 : 170, to: big ? 48 : 85, dur: big ? 1.0 : 0.5, type: 'sawtooth', vol: big ? 0.15 : 0.08, attack: 0.05 }); n({ dur: big ? 0.9 : 0.4, vol: big ? 0.14 : 0.06, freq: 420, to: 160 }); }),
    throwIt: play(() => n({ dur: 0.2, vol: 0.05, freq: 500, to: 1800, type: 'bandpass' })),
    thud: play(() => { n({ dur: 0.18, vol: 0.16, freq: 700, to: 120 }); t({ freq: 110, to: 55, dur: 0.14, type: 'sine', vol: 0.1 }); }),
    stomp: play(() => { n({ dur: 0.22, vol: 0.22, freq: 800, to: 110 }); t({ freq: 300, to: 620, dur: 0.14, type: 'triangle', vol: 0.1, delay: 0.05 }); t({ freq: 180, to: 60, dur: 0.3, type: 'sawtooth', vol: 0.07 }); }),
    roller: play((pan) => { for (let i = 0; i < 4; i++) n({ dur: 0.16, vol: 0.1, freq: 240, to: 110, delay: i * 0.16, pan }); }),
    slam: play(() => { n({ dur: 0.7, vol: 0.34, freq: 600, to: 50 }); t({ freq: 70, to: 28, dur: 0.6, type: 'sine', vol: 0.2 }); }),
    dazed: play(() => [12, 7, 3, 0, -5].forEach((s, i) => t({ freq: note(72 + s), dur: 0.16, type: 'triangle', vol: 0.1, delay: i * 0.09 }))),
  };
}

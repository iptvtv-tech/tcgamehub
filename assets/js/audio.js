// All sound is synthesised live with the Web Audio API — no audio files to download.
import { Store } from './storage.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = Store.setting('muted') ? 0 : 0.6;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = Store.setting('music') === false ? 0 : 0.28; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.1, type = 'square', vol = 0.2, delay = 0, bus = null, attack = 0.005 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.3, freq = 1200, to = null, type = 'lowpass', delay = 0 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t); s.stop(t + dur + 0.02);
}

const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

// Named sound effects. `p` is an optional 0..n "intensity" (e.g. combo level) that raises the pitch.
const PRESETS = {
  click:   () => tone({ freq: 660, dur: 0.05, type: 'triangle', vol: 0.15 }),
  eat:     (p = 0) => { const f = note(72 + Math.min(p, 12) * 2); tone({ freq: f, to: f * 1.5, dur: 0.09, type: 'square', vol: 0.12 }); },
  coin:    (p = 0) => { const f = note(83 + Math.min(p, 10)); tone({ freq: f, dur: 0.06, type: 'square', vol: 0.1 }); tone({ freq: f * 1.5, dur: 0.12, type: 'square', vol: 0.1, delay: 0.06 }); },
  gem:     (p = 0) => { const f = note(88 + (p % 8)); tone({ freq: f, dur: 0.15, type: 'sine', vol: 0.2 }); tone({ freq: f * 2, dur: 0.1, type: 'triangle', vol: 0.08 }); },
  golden:  () => [0, 4, 7, 12].forEach((s, i) => tone({ freq: note(79 + s), dur: 0.12, type: 'square', vol: 0.1, delay: i * 0.05 })),
  powerup: () => [0, 3, 7, 10, 12, 15].forEach((s, i) => tone({ freq: note(67 + s), dur: 0.1, type: 'triangle', vol: 0.16, delay: i * 0.04 })),
  flap:    () => noise({ dur: 0.12, vol: 0.18, freq: 2400, to: 600, type: 'bandpass' }),
  pass:    () => tone({ freq: note(76), dur: 0.05, type: 'triangle', vol: 0.1 }),
  bounce:  (p = 0) => tone({ freq: note(60 + p), dur: 0.05, type: 'triangle', vol: 0.18 }),
  brick:   (p = 0) => { const f = note(72 + Math.min(p, 20)); tone({ freq: f, dur: 0.08, type: 'square', vol: 0.1 }); noise({ dur: 0.05, vol: 0.08, freq: 5000, type: 'highpass' }); },
  metal:   () => { tone({ freq: 1200, to: 900, dur: 0.12, type: 'triangle', vol: 0.12 }); tone({ freq: 1830, dur: 0.1, type: 'sine', vol: 0.06 }); },
  boom:    () => { noise({ dur: 0.5, vol: 0.5, freq: 900, to: 60 }); tone({ freq: 120, to: 40, dur: 0.4, type: 'sine', vol: 0.4 }); },
  hit:     () => { noise({ dur: 0.25, vol: 0.4, freq: 1500, to: 100 }); tone({ freq: 200, to: 60, dur: 0.25, type: 'sawtooth', vol: 0.15 }); },
  lose:    () => [0, -3, -7, -12].forEach((s, i) => tone({ freq: note(64 + s), dur: 0.16, type: 'sawtooth', vol: 0.1, delay: i * 0.1 })),
  die:     () => { noise({ dur: 0.6, vol: 0.35, freq: 2000, to: 80 }); [0, -4, -8, -13].forEach((s, i) => tone({ freq: note(60 + s), dur: 0.2, type: 'square', vol: 0.1, delay: 0.1 + i * 0.12 })); },
  levelup: () => [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone({ freq: note(72 + s), dur: 0.13, type: 'square', vol: 0.09, delay: i * 0.07 })),
  bonus:   () => [0, 4, 7, 11, 14, 19, 23, 24].forEach((s, i) => tone({ freq: note(72 + s), dur: 0.15, type: 'triangle', vol: 0.15, delay: i * 0.05 })),
  combo:   (p = 0) => { tone({ freq: note(79 + p * 2), dur: 0.08, type: 'square', vol: 0.1 }); tone({ freq: note(86 + p * 2), dur: 0.12, type: 'square', vol: 0.1, delay: 0.07 }); },
  tick:    () => tone({ freq: 1000, dur: 0.04, type: 'square', vol: 0.08 }),
  go:      () => tone({ freq: note(84), dur: 0.2, type: 'square', vol: 0.12 }),
  achieve: () => [0, 7, 12, 16, 19, 24].forEach((s, i) => tone({ freq: note(76 + s), dur: 0.18, type: 'sine', vol: 0.15, delay: i * 0.06 })),
  highscore: () => [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) => tone({ freq: note(67 + s), dur: 0.2, type: 'triangle', vol: 0.15, delay: i * 0.08 })),
  life:    () => [0, 12, 7, 19].forEach((s, i) => tone({ freq: note(72 + s), dur: 0.12, type: 'sine', vol: 0.18, delay: i * 0.06 })),
};

// ── Tiny background music sequencer (chiptune arpeggios) ─────────
const PROGRESSIONS = {
  minor: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
  major: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
  dream: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], // Dm Bb C A
};
const music = { on: false, timer: null, step: 0, nextTime: 0, bpm: 110, prog: PROGRESSIONS.minor, lead: 'square' };

function scheduleMusic() {
  const c = ctx; if (!c || !music.on) return;
  const stepDur = 60 / music.bpm / 2; // eighth notes
  while (music.nextTime < c.currentTime + 0.15) {
    const bar = Math.floor(music.step / 8) % music.prog.length;
    const chord = music.prog[bar];
    const s = music.step % 8;
    const arp = [0, 1, 2, 1, 0, 1, 2, 1][s];
    const octave = s >= 4 ? 24 : 12;
    const t = music.nextTime - c.currentTime;
    tone({ freq: note(chord[arp] + octave), dur: stepDur * 0.9, type: music.lead, vol: 0.05, delay: t, bus: musicBus });
    if (s % 2 === 0) tone({ freq: note(chord[0] - 12), dur: stepDur * 1.6, type: 'triangle', vol: 0.12, delay: t, bus: musicBus });
    if (s === 0 || s === 4) noise_hat(t, 0.06);
    if (s === 2 || s === 6) noise_hat(t, 0.025);
    music.nextTime += stepDur;
    music.step++;
  }
}
function noise_hat(delay, vol) {
  const c = ctx; const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  s.connect(f).connect(g).connect(musicBus); s.start(t); s.stop(t + 0.06);
}

export const Sound = {
  unlock() { ac(); },
  play(name, p) { if (Store.setting('muted')) return; try { PRESETS[name]?.(p); } catch { /* ignore */ } },
  tone, noise, note,

  get muted() { return !!Store.setting('muted'); },
  setMuted(m) {
    Store.setSetting('muted', m);
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.02);
  },
  get musicOn() { return Store.setting('music') !== false; },
  setMusic(on) {
    Store.setSetting('music', on);
    if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.28 : 0, ctx.currentTime, 0.05);
  },

  /** Start looping background music. style: 'minor' | 'major' | 'dream' */
  startMusic({ bpm = 110, style = 'minor', lead = 'square' } = {}) {
    const c = ac(); if (!c) return;
    music.bpm = bpm; music.prog = PROGRESSIONS[style] || PROGRESSIONS.minor; music.lead = lead;
    if (music.on) return;
    music.on = true; music.step = 0; music.nextTime = c.currentTime + 0.05;
    music.timer = setInterval(scheduleMusic, 30);
  },
  setTempo(bpm) { music.bpm = bpm; },
  stopMusic() { music.on = false; clearInterval(music.timer); music.timer = null; },
};

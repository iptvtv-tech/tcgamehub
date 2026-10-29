// All sound is synthesised live with the Web Audio API — no audio files to download.
import { Store } from './storage.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, echo = null;

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
    // a tempo-synced echo for the synthwave kit's lead (other music never touches it)
    echo = ctx.createDelay(1.5); echo.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    echo.connect(damp).connect(fb).connect(echo); damp.connect(musicBus);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Safari / iOS only let audio start inside a tap or key press. If anything made the context
// before the first gesture it starts "suspended", so wake it on the next gesture (audit P2).
if (typeof window !== 'undefined') {
  const wake = () => { if (ctx && ctx.state !== 'running') ctx.resume().catch?.(() => {}); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });
}

/** Route a sound to the left or right (pan −1 … 1) when the browser supports it. */
function out(c, node, bus, pan) {
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p).connect(bus); }
  else node.connect(bus);
}

/** The equipped sound pack re-voices SFX (never music — music always passes its own bus).
 *  Set by tokens.js via Sound.setPack; 'sfx-classic' is a no-op. */
let sfxPack = 'sfx-classic';
const PACK_TYPE = {
  'sfx-8bit':  { sine: 'square', triangle: 'square', sawtooth: 'square', square: 'square' },
  'sfx-soft':  { square: 'sine', sawtooth: 'triangle', triangle: 'sine', sine: 'sine' },
  'sfx-laser': { square: 'sawtooth', triangle: 'sawtooth', sine: 'triangle', sawtooth: 'sawtooth' },
};
const PACK_VOL = { 'sfx-8bit': 0.9, 'sfx-soft': 0.85, 'sfx-laser': 0.8 };
function sfxVoice(type, vol) {
  const m = PACK_TYPE[sfxPack];
  return m ? [m[type] || type, vol * (PACK_VOL[sfxPack] || 1)] : [type, vol];
}

function tone({ freq = 440, to = null, dur = 0.1, type = 'square', vol = 0.2, delay = 0, bus = null, attack = 0.005, pan = 0 }) {
  const c = ac(); if (!c) return;
  if (!bus) [type, vol] = sfxVoice(type, vol);
  // A silent tone (e.g. Crypt's footsteps exactly 8 tiles away) would ramp the gain to 0,
  // which the Web Audio API rejects with a RangeError that aborted the game's update.
  if (!(vol > 0)) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(c, g, bus || sfxBus, pan);
  o.start(t); o.stop(t + dur + 0.02);
}

/** a filtered (and optionally detuned, doubled) note — used by the synthwave music kit */
function synth({ freq = 220, dur = 0.2, type = 'sawtooth', vol = 0.05, delay = 0, cutoff = 1800, q = 0.7, detune = 0, attack = 0.01, release = null, bus = null, send = 0 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, rel = release ?? dur * 0.6;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g); g.connect(bus || musicBus);
  if (send && echo) { const sg = c.createGain(); sg.gain.value = send; g.connect(sg).connect(echo); }
  for (const dt of detune ? [-detune, detune] : [0]) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = dt;
    o.connect(f); o.start(t); o.stop(t + dur + 0.05);
  }
}

/** A continuous sound you steer every frame (tyre squeal, engine drone…). Each set() holds it for a
 *  moment, then it fades out by itself — so it falls silent on pause, a hidden tab or a dropped frame. */
function voice({ type = 'sawtooth', noise: withNoise = false, filter = 'bandpass', q = 4 } = {}) {
  const c = ac(); if (!c) return { set() {}, stop() {} };
  const f = c.createBiquadFilter(); f.type = filter; f.Q.value = q; f.frequency.value = 1000;
  const g = c.createGain(); g.gain.value = 0;
  f.connect(g).connect(sfxBus);
  let o = null, n = null;
  if (type) { o = c.createOscillator(); o.type = type; o.frequency.value = 100; o.connect(f); o.start(); }
  if (withNoise) { n = c.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.connect(f); n.start(); }
  return {
    set({ freq, vol = 0, cutoff, hold = 0.15 }) {
      const t = c.currentTime;
      if (o && freq) o.frequency.setTargetAtTime(freq, t, 0.03);
      if (cutoff) f.frequency.setTargetAtTime(cutoff, t, 0.04);
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(Store.setting('muted') ? 0 : vol, t, 0.03);
      g.gain.setTargetAtTime(0, t + hold, 0.06);
    },
    stop() { try { o?.stop(); n?.stop(); } catch { /* already stopped */ } },
  };
}

function noise({ dur = 0.2, vol = 0.3, freq = 1200, to = null, type = 'lowpass', delay = 0, pan = 0 }) {
  vol *= PACK_VOL[sfxPack] || 1;
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g); out(c, g, sfxBus, pan);
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
  cosmic: [[52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 51, 54]], // Em C Am B
  bubbly: [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]], // F Dm Bb C
  hero:   [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], // Am F G E
  crypt:  [[48, 51, 55], [44, 48, 51], [41, 44, 48], [43, 47, 50]], // Cm Ab Fm G
  chase:  [[50, 53, 57], [51, 55, 58], [50, 53, 57], [49, 52, 56]], // Dm Eb Dm C#dim — tense
  outrun: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G — the classic night drive
  neon:   [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]], // Fm Db Ab Eb — warm and wistful
  toxic:  [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], // Em C D B — dark drive
  station: [[50, 53, 57], [55, 59, 62], [50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55], [55, 58, 62], [57, 61, 64]], // Dm G Dm Bb F C Gm A — Station Defense: Dorian lift, a long way home
};
const ARP = [0, 1, 2, 1, 0, 1, 2, 1], OCT = [12, 12, 12, 12, 24, 24, 24, 24];
const music = { on: false, timer: null, step: 0, nextTime: 0, bpm: 110, prog: PROGRESSIONS.minor, lead: 'square', arp: ARP, oct: OCT, bass: 'half', kit: 'chip', hook: null };

function scheduleMusic() {
  const c = ctx; if (!c || !music.on) return;
  const stepDur = 60 / music.bpm / 2; // eighth notes
  // After a throttled background tab, nextTime can sit well behind currentTime; without this
  // every missed step would play at once as a burst. Skip ahead to the next step boundary instead.
  if (music.nextTime < c.currentTime - stepDur) {
    const missed = Math.ceil((c.currentTime - music.nextTime) / stepDur);
    music.nextTime += missed * stepDur; music.step += missed;
  }
  while (music.nextTime < c.currentTime + 0.15) {
    const bar = Math.floor(music.step / 8) % music.prog.length;
    const chord = music.prog[bar];
    const s = music.step % 8;
    const a = music.arp[s];
    const pitch = (a >= 3 ? chord[a - 3] + 12 : chord[a]) + music.oct[s];
    const t = music.nextTime - c.currentTime;
    if (music.kit === 'synth') { synthStep(chord, s, pitch, t, stepDur, bar); music.nextTime += stepDur; music.step++; continue; }
    tone({ freq: note(pitch), dur: stepDur * 0.9, type: music.lead, vol: 0.05, delay: t, bus: musicBus });
    if (music.bass === 'drive') tone({ freq: note(chord[0] - (s % 2 ? 12 : 24)), dur: stepDur * 0.8, type: 'triangle', vol: 0.13, delay: t, bus: musicBus });
    else if (s % 2 === 0) tone({ freq: note(chord[0] - 12), dur: stepDur * 1.6, type: 'triangle', vol: 0.12, delay: t, bus: musicBus });
    if (s === 0 || s === 4) noise_hat(t, 0.06);
    if (s === 2 || s === 6) noise_hat(t, 0.025);
    music.nextTime += stepDur;
    music.step++;
  }
}
/** one eighth-note of the synthwave kit: kick + gated snare, offbeat hats, octave-bouncing saw bass,
 *  a detuned pad on each bar, the echoing arp, and (every other 4-bar phrase) a long lead hook */
function synthStep(chord, s, pitch, t, stepDur, bar) {
  const phrase = Math.floor(music.step / (8 * music.prog.length)) % 4;      // 0 intro feel, 1-3 full
  const full = phrase > 0;
  // drums
  if (s === 0 || s === 4 || (full && s === 7 && bar % 2)) {
    tone({ freq: 150, to: 42, dur: 0.24, type: 'sine', vol: 0.32, delay: t, bus: musicBus, attack: 0.002 });
  }
  if (s === 2 || s === 6) {
    noiseHit(t, 0.17, 1900, 0.16, 'bandpass');            // snare crack
    noiseHit(t + 0.01, 0.06, 3200, 0.34, 'lowpass');      // the big 80s gated tail
    tone({ freq: 185, to: 140, dur: 0.08, type: 'triangle', vol: 0.06, delay: t, bus: musicBus });
  }
  if (s % 2 === 1) noise_hat(t, full ? 0.045 : 0.03);
  else if (full) noise_hat(t, 0.015);
  // bass: root bouncing between octaves on every eighth
  const root = chord[0] - 24 + (s % 2 ? 12 : 0);
  synth({ freq: note(root), dur: stepDur * 0.85, type: 'sawtooth', vol: 0.085, delay: t, cutoff: 520 + (s % 2) * 240, q: 2, release: stepDur * 0.5 });
  // pad: the whole chord, held across the bar, slow attack
  if (s === 0) {
    const barDur = stepDur * 8;
    for (const n of chord) synth({ freq: note(n), dur: barDur, type: 'sawtooth', vol: full ? 0.018 : 0.012, delay: t, cutoff: full ? 1500 : 900, detune: 9, attack: barDur * 0.25, release: barDur * 0.3 });
  }
  // arp lead with echo
  synth({ freq: note(pitch), dur: stepDur * 0.7, type: music.lead, vol: 0.032, delay: t, cutoff: 2600, release: stepDur * 0.4, send: 0.45 });
  // the hook: long notes over the top on phrases 1 and 3
  if (music.hook && (phrase === 1 || phrase === 3) && (s === 0 || s === 4)) {
    const h = music.hook[(bar * 2 + (s ? 1 : 0)) % music.hook.length];
    if (h != null) {
      const n = (h >= 3 ? chord[h - 3] + 12 : chord[h]) + 24;
      synth({ freq: note(n), dur: stepDur * 3.6, type: 'sawtooth', vol: 0.03, delay: t, cutoff: 3200, detune: 6, attack: 0.03, release: stepDur * 1.5, send: 0.35 });
    }
  }
}
function noiseHit(delay, vol, freq, dur, type) {
  const c = ctx; const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(musicBus); s.start(t); s.stop(t + dur + 0.02);
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
  /** tokens.js equips a sound pack here ('sfx-classic' | 'sfx-8bit' | 'sfx-soft' | 'sfx-laser') */
  setPack(id) { sfxPack = id || 'sfx-classic'; },
  play(name, p) { if (Store.setting('muted')) return; try { PRESETS[name]?.(p); } catch { /* ignore */ } },
  tone, noise, note, synth, voice,
  /** is background music running right now? */
  get musicPlaying() { return music.on; },

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

  /** Start looping background music. style: 'minor' | 'major' | 'dream' | 'cosmic' | 'bubbly' | 'hero' | 'crypt' | 'chase'.
   *  Optional: arp (8 chord-note indexes, 3-5 = an octave up), oct (8 octave offsets), bass: 'half' | 'drive'. */
  startMusic({ bpm = 110, style = 'minor', lead = 'square', arp = ARP, oct = OCT, bass = 'half', kit = 'chip', hook = null } = {}) {
    const c = ac(); if (!c) return;
    music.bpm = bpm; music.prog = PROGRESSIONS[style] || PROGRESSIONS.minor; music.lead = lead;
    music.arp = arp; music.oct = oct; music.bass = bass; music.kit = kit; music.hook = hook;
    if (echo) echo.delayTime.setTargetAtTime(60 / bpm * 0.75, c.currentTime, 0.05);
    if (music.on) return;
    music.on = true; music.step = 0; music.nextTime = c.currentTime + 0.05;
    music.timer = setInterval(scheduleMusic, 30);
  },
  setTempo(bpm) { music.bpm = bpm; if (echo && ctx) echo.delayTime.setTargetAtTime(60 / bpm * 0.75, ctx.currentTime, 0.05); },
  stopMusic() { music.on = false; clearInterval(music.timer); music.timer = null; },
};

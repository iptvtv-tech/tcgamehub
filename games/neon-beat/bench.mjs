// Benchmark contract for Neon Beat (see tools/bench.mjs). The bot plays on the keyboard (← ↓ ↑ →)
// the way a player follows the falling notes: for each note it plans a key press at the moment
// the note reaches the line, plus its own timing error, and holds the key down to the end of a
// hold note's tail. Lower skill = wider timing spread (some presses land outside the window:
// a miss, and often a NO NOTE stray as well), a few notes not read at all, and on the STEALTH
// levels (L12+, notes fade before the line) a wider spread still. Headless, the song runs on frame
// time (no audio clock), exactly as it does in a muted browser. The mistake: look away and stop
// hitting notes, mashing a key now and then, until the energy runs out and a life is lost.
const DIRS = ['left', 'down', 'up', 'right'];
const bpmFor = (level) => Math.min(150, 75 + (level - 1) * 4);
/** A bell-curve random number (mean 0, spread 1). */
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand() * 0.999999)) * Math.cos(2 * Math.PI * rand());
const STATES = new Set(['live', 'hit', 'miss', 'holding']);

/** The press time this player aims for on each note (decided once, the first time it sees the note). */
function planFor(g, b, n) {
  const m = b.mem;
  m.plan ??= new WeakMap();
  let p = m.plan.get(n);
  if (!p) {
    const spread = 0.006 + (1 - b.skill) * (g.stealth ? 0.15 : 0.13);
    const skip = b.rand() < (1 - b.skill) * 0.06;                       // didn't read it at all
    p = { at: n.t + gauss(b.rand) * spread, skip, holdEnd: n.t + n.hold - (1 - b.skill) * b.rand() * 0.25 };
    m.plan.set(n, p);
  }
  return p;
}

/** The mistake, until it has cost a life: let go of everything and mash a lane now and then. */
function slip(g, s, b) {
  const m = b.mem;
  for (const d of DIRS) if (s.input.isDown(d)) s.keyUp(d);
  if (b.t >= m.slip.next && g.songT > 0) {
    m.slip.next = b.t + 0.6 + b.rand() * 0.8;
    s.keyDown(DIRS[Math.floor(b.rand() * 4)]);
  }
}

function bot(g, s, b) {
  const m = b.mem;
  if (m.slip) {
    if (s.livesLost === m.slip.lives) return slip(g, s, b);
    m.slip = null;                                            // that cost a life: the song restarts, play it properly
  }
  const t = g.songT, want = new Set();
  for (const n of g.notes) {
    if (n.t - t > 0.5) break;
    const p = planFor(g, b, n);
    if (n.state === 'holding') { if (t < p.holdEnd) want.add(DIRS[n.lane]); continue; }
    if (n.state !== 'live' || p.skip || p.done) continue;
    // press on the frame nearest the planned moment (the press is judged against this frame's song time)
    if (t + 1 / 240 >= p.at) { p.done = true; want.add(DIRS[n.lane]); p.press = true; }
  }
  // a new press needs the key up first: let go of lanes that are not wanted, press the new ones
  for (const d of DIRS) if (s.input.isDown(d) && !want.has(d)) s.keyUp(d);
  for (const n of g.notes) {
    if (n.t - t > 0.5) break;
    const p = b.mem.plan.get(n);
    if (p?.press) { p.press = false; const d = DIRS[n.lane]; if (s.input.isDown(d)) s.keyUp(d); s.keyDown(d); }
  }
  for (const d of want) if (!s.input.isDown(d)) s.keyDown(d);
}

/** Notes judged so far this song (hit, missed or being held), plus FEVER hits. */
const judged = (g) => g.notes.reduce((a, n) => a + (n.state === 'live' ? 0 : 1), 0) + (g.bonus ? g.feverHits * 1000 : 0);

export default {
  // 48–64 beats at 75 BPM (L1, ~45 s a song) up to 150 BPM (~30 s). With the mistake the song is
  // played about twice (it restarts when a life is lost)
  limit: (level) => { const beat = 60 / bpmFor(level), song = (4 + (12 + Math.min(4, Math.floor(level / 3))) * 4 + 3) * beat + 1.2; return Math.round(song * 2.2 + 15); },
  stuck: 8,                     // the count-in (3.2 s at L1) and a few empty beats: notes keep coming
  progress: judged,

  invariants(g) {
    if (!Number.isFinite(g.songT) || !Number.isFinite(g.hp)) return `song clock ${g.songT}, energy ${g.hp}`;
    if (g.hp < 0 || g.hp > 100) return `energy ${g.hp} out of 0–100`;
    if (g.bonus && g.hp !== 100) return `FEVER drained energy to ${g.hp}`;
    if (g.songT > g.endT + 0.05 && !g.bonus) return `the song ran past its end (${g.songT.toFixed(2)} of ${g.endT.toFixed(2)} s) without finishing`;
    let done = 0, holds = 0;
    for (const n of g.notes) {
      if (!STATES.has(n.state) || n.lane < 0 || n.lane > 3 || !Number.isInteger(n.lane)) return `a note in lane ${n.lane} is '${n.state}'`;
      if (n.state === 'live' && g.songT - n.t > g.win.good + 1e-9) return `a note ${((g.songT - n.t) * 1000).toFixed(0)} ms past the line was never judged`;
      if (n.state === 'holding' && g.songT >= n.t + n.hold + 1e-9) return 'a hold note is still held after its tail ended';
      if (n.state !== 'live') done++;
      if (n.hold) holds++;
    }
    const st = g.stats, sum = st.perfect + st.great + st.good + st.miss;
    // every judged note counted once; a hold that was hit and then let go early is a hit and a miss
    if (sum < done || sum > done + holds) return `judgements don't add up: ${sum} counted for ${done} notes judged`;
    if (g.bonus && (st.miss || st.stray) && g.hp !== 100) return 'FEVER cost energy';
    for (let i = 1; i < g.notes.length; i++) if (g.notes[i].t < g.notes[i - 1].t) return 'the chart is out of order';
    return null;
  },

  bot,

  mistake(g, s, b) {
    b.mem.slip = { lives: s.livesLost, next: 0 };
    slip(g, s, b);
    return true;
  },
};

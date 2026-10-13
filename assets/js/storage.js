// Everything a visitor's browser remembers: name, bests, checkpoints, badges, settings.
// Wrapped in try/catch so private-browsing modes never break the games.
import { todayKey } from './rng.js';

const KEY = 'arcade:v1';
let data = null;

// Wipe one game's saved best / progress / local scores when it gets a big update.
// Bump the number to reset that game again (badges are kept).
const RESETS = { 'galactic-alien-shooter': 2, 'pinball-blast': 1 };   // pinball-blast: fresh start for the Extreme table

// ── Schema check (audit P1): a corrupt or hand-edited save must never break the site ──
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** keep only { key: finite number ≥ 0 } entries */
function numMap(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && k.length <= 80) out[k] = n;
  return out;
}
function validate(raw) {
  const d = isObj(raw) ? raw : {};
  d.best = numMap(d.best);         // { gameId: score }
  d.maxLevel = numMap(d.maxLevel); // { gameId: highest level reached }
  d.plays = numMap(d.plays);       // { gameId: rounds played }
  d.ach = numMap(d.ach);           // { 'gameId:achId' | 'g:achId': timestamp }
  d.resets = numMap(d.resets);
  // offline leaderboard entries
  d.local = Array.isArray(d.local) ? d.local.filter((e) => isObj(e) && typeof e.game === 'string' && Number.isFinite(e.score)).slice(-600) : [];
  d.settings = isObj(d.settings) ? d.settings : { muted: false, music: true };
  if (typeof d.name !== 'string') delete d.name; else d.name = d.name.slice(0, 12);
  if (d.last !== undefined && !(isObj(d.last) && typeof d.last.game === 'string')) delete d.last;
  if (d.daily !== undefined && !(isObj(d.daily) && typeof d.daily.last === 'string' && Number.isFinite(d.daily.streak))) delete d.daily;
  if (d.rev !== undefined && !Number.isFinite(d.rev)) delete d.rev;
  return d;
}

function load() {
  if (data) return data;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
  data = validate(raw);
  let changed = false;
  for (const [game, v] of Object.entries(RESETS)) {
    if ((data.resets[game] || 0) >= v) continue;
    delete data.best[game]; delete data.maxLevel[game];
    data.local = data.local.filter((e) => e.game !== game);
    data.resets[game] = v; changed = true;
  }
  if (changed) save();
  return data;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}
// Progress that travels with a Legend code (plays → zone unlocks, levels → checkpoints, bests, badges).
// Every change bumps `rev`; legends.js saves it online when a Legend code is on this browser.
const listeners = [];
function progressed() { const d = load(); d.rev = (d.rev || 0) + 1; for (const fn of listeners) { try { fn(); } catch { /* ignore */ } } }

export const Store = {
  get data() { return load(); },
  save,

  name() { return load().name || ''; },
  setName(n) { load().name = n; save(); },

  best(game) { return load().best[game] || 0; },
  /** returns true if this is a new personal best */
  submitBest(game, score) {
    const d = load();
    if (score > (d.best[game] || 0)) { d.best[game] = score; save(); progressed(); return true; }
    return false;
  },

  maxLevel(game) { return load().maxLevel[game] || 1; },
  reachLevel(game, level) {
    const d = load();
    if (level > (d.maxLevel[game] || 1)) { d.maxLevel[game] = level; save(); progressed(); }
  },

  plays(game) { return load().plays[game] || 0; },
  totalPlays() { return Object.values(load().plays).reduce((a, b) => a + b, 0); },
  addPlay(game) {
    const d = load();
    d.plays[game] = (d.plays[game] || 0) + 1;
    d.last = { game, at: Date.now() };
    save(); progressed();
  },
  last() { return load().last || null; },

  hasAch(key) { return !!load().ach[key]; },
  /** returns true if newly unlocked */
  unlockAch(key) {
    const d = load();
    if (d.ach[key]) return false;
    d.ach[key] = Date.now(); save(); progressed(); return true;
  },
  /** Take a badge back (used when a badge's meaning changes). */
  lockAch(key) { const d = load(); if (d.ach[key]) { delete d.ach[key]; save(); } },

  // ── Daily challenge streak (kept only in this browser) ──
  /** { streak, best, today }: streak = days in a row ending today or yesterday (0 once broken). */
  dailyStreak() {
    const d = load().daily;
    if (!d) return { streak: 0, best: 0, today: false };
    const today = todayKey(), yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const alive = d.last === today || d.last === yesterday;
    return { streak: alive ? d.streak : 0, best: d.best || 0, today: d.last === today };
  },
  /** Call when a daily challenge run starts. Returns the new streak. */
  markDaily() {
    const d = load(), today = todayKey();
    const cur = this.dailyStreak();
    if (cur.today) return cur.streak;
    const streak = cur.streak + 1;
    d.daily = { last: today, streak, best: Math.max(streak, d.daily?.best || 0) };
    save();
    return streak;
  },

  /** call fn whenever synced progress changes */
  onProgress(fn) { listeners.push(fn); },
  /** which game resets this browser has applied (so old bests from the cloud aren't brought back) */
  resets() { return load().resets; },

  setting(k) { return load().settings[k]; },
  setSetting(k, v) { load().settings[k] = v; save(); },

  /** Soft reset (audit P1): wipe this browser's arcade save. Legend codes live online, so
   *  re-entering a code on the Legends page brings synced progress back. */
  softReset() {
    // keep the Legend / progress code (if it looks valid) so nothing online is lost
    let keep = {};
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      const ok = (v) => isObj(v) && typeof v.code === 'string' && /^LEGEND-[A-Z0-9]{6}$/.test(v.code);
      if (isObj(raw) && ok(raw.legend)) keep.legend = raw.legend;
      if (isObj(raw) && ok(raw.progressCode)) keep.progressCode = raw.progressCode;
    } catch { keep = {}; }
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('arcade:')) localStorage.removeItem(k);
      localStorage.setItem(KEY, JSON.stringify(keep));
    } catch { /* storage unavailable */ }
    data = null;
  },
};

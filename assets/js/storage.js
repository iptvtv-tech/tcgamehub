// Everything a visitor's browser remembers: name, bests, checkpoints, badges, settings.
// Wrapped in try/catch so private-browsing modes never break the games.
const KEY = 'arcade:v1';
let data = null;

function load() {
  if (data) return data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { data = {}; }
  data.best ??= {};       // { gameId: score }
  data.maxLevel ??= {};   // { gameId: highest level reached }
  data.plays ??= {};      // { gameId: rounds played }
  data.ach ??= {};        // { 'gameId:achId' | 'g:achId': timestamp }
  data.local ??= [];      // offline leaderboard entries
  data.settings ??= { muted: false, music: true };
  return data;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

export const Store = {
  get data() { return load(); },
  save,

  name() { return load().name || ''; },
  setName(n) { load().name = n; save(); },

  best(game) { return load().best[game] || 0; },
  /** returns true if this is a new personal best */
  submitBest(game, score) {
    const d = load();
    if (score > (d.best[game] || 0)) { d.best[game] = score; save(); return true; }
    return false;
  },

  maxLevel(game) { return load().maxLevel[game] || 1; },
  reachLevel(game, level) {
    const d = load();
    if (level > (d.maxLevel[game] || 1)) { d.maxLevel[game] = level; save(); }
  },

  plays(game) { return load().plays[game] || 0; },
  totalPlays() { return Object.values(load().plays).reduce((a, b) => a + b, 0); },
  addPlay(game) {
    const d = load();
    d.plays[game] = (d.plays[game] || 0) + 1;
    d.last = { game, at: Date.now() };
    save();
  },
  last() { return load().last || null; },

  hasAch(key) { return !!load().ach[key]; },
  /** returns true if newly unlocked */
  unlockAch(key) {
    const d = load();
    if (d.ach[key]) return false;
    d.ach[key] = Date.now(); save(); return true;
  },

  setting(k) { return load().settings[k]; },
  setSetting(k, v) { load().settings[k] = v; save(); },
};

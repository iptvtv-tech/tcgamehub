// ─────────────────────────────────────────────────────────────
//  LEGENDS — shared secret-reward system for "Legend games".
//
//  A Legend game has a fixed ending (def.finalLevel) and a secret level
//  (def.secretLevel) that only opens for a flawless run: started at level 1
//  and never lost a life. Every zone of 6 games ends with a Legend game (see ZONES
//  in games.js). Finishing its secret level wins that zone's GOLDEN EGG:
//    • golden versions of the main character in that zone's games (toggle in each game's menu)
//    • an egg badge (crown1/crown2/crown3 — the ids are kept from when they were "crowns")
//    • special "Legendary" badges
//    • access to the hidden Hall of Legends page (/hall-of-legends/)
//    • a Legend code to restore everything on another device
//  Every egg → THE GOLDEN CROWN (badge "grand"): the hidden Crown Room page
//  (/crown-room/), a golden theme for the whole site, and a 👑 by your name on
//  the leaderboards.
//
//  Any future game can join by adding `legend: {...}` to its entry in games.js
//  and finalLevel / secretLevel to its runGame() settings. See docs/ADDING_A_GAME.md
// ─────────────────────────────────────────────────────────────
import { Store } from './storage.js';
import { GAMES, ZONES, zoneOf, legendZones } from './games.js';

import { rpc, ONLINE, nameProblem } from './scores.js';

let crownSet = null, crownPromise = null;
const missingFn = (err) => /could not find the function|does not exist|PGRST202|404/i.test(String(err?.message || err));

/** Group Hall rows by name: [{ name, at, zones:Set, games:[], crownAt }] (crownAt = when their last egg came in). */
export function hallPeople(rows) {
  const byName = new Map();
  for (const r of rows) {
    const k = r.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, { name: r.name, at: r.at, zones: new Map(), games: [] });
    const e = byName.get(k), z = zoneOf(r.game);
    if (z && (!e.zones.has(z.n) || e.zones.get(z.n) > r.at)) e.zones.set(z.n, r.at);
    e.games.push(r.game);
  }
  const need = legendZones().length;
  return [...byName.values()].map((p) => ({ ...p, crown: need > 0 && legendZones().every((z) => p.zones.has(z.n)), crownAt: Math.max(...p.zones.values()) }));
}
export const crownHolders = (rows) => hallPeople(rows).filter((p) => p.crown).sort((a, b) => a.crownAt - b.crownAt);

/** Switch the golden theme on the page (Golden Crown holders only). */
export function applyTheme() {
  try { document.documentElement.toggleAttribute('data-gold-theme', Legends.goldThemeOn()); } catch { /* ignore */ }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function checksum(body) {
  let s = 0;
  for (const c of body) s = (s * 31 + c.charCodeAt(0)) % CODE_CHARS.length;
  return CODE_CHARS[s];
}
function localCode() {
  let body = '';
  for (let i = 0; i < 5; i++) body += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `LEGEND-${body}${checksum(body)}`;
}
const validLocal = (code) => /^LEGEND-[A-Z0-9]{6}$/.test(code) && checksum(code.slice(7, 12)) === code[12];

function data() {
  const d = Store.data;
  d.legend ??= null; // { at, games: [], code, name }
  return d;
}

// ── Progress that travels with your Legend code ──────────────
// Games played (which is what opens each zone), levels reached (checkpoints), best scores and
// badges are saved online against the Legend code whenever they change, and come back when the
// code is entered on another browser. Merging only ever raises numbers — nothing is lost.
// Needs supabase/zone4-completion.sql (sync_progress); until it's run this quietly does nothing.
const SYNC = ['plays', 'maxLevel', 'best', 'ach'];
function payload() { const d = Store.data, out = { resets: Store.resets() || {} }; for (const k of SYNC) out[k] = d[k] || {}; return out; }
/** fold progress from the cloud into this browser; returns how many things it added */
function mergeIn(p) {
  if (!p || typeof p !== 'object') return 0;
  const d = Store.data, mine = Store.resets() || {}, theirs = p.resets || {};
  let n = 0;
  for (const k of SYNC) {
    const src = p[k];
    if (!src || typeof src !== 'object') continue;
    d[k] ??= {};
    for (const [id, v] of Object.entries(src)) {
      const num = Number(v);
      if (!Number.isFinite(num) || num < 0) continue;
      if ((k === 'best' || k === 'maxLevel') && (mine[id] || 0) > (theirs[id] || 0)) continue;   // that game was reset since
      if (k === 'ach' ? !d.ach[id] : (d[k][id] || 0) < num) { d[k][id] = num; n++; }
    }
  }
  if (n) Store.save();
  return n;
}
let syncTimer = null, syncing = null;
/** save this browser's progress online and bring back anything newer; resolves to the number of things added (null = couldn't) */
function syncNow({ keepalive = false } = {}) {
  const d = data(), code = d.legend?.code;
  if (!ONLINE || !code) return Promise.resolve(null);
  if (syncing) return syncing;
  const rev = d.rev || 0;
  syncing = rpc('sync_progress', { p_code: code, p_data: payload() }, { keepalive })
    .then((r) => {
      if (!r) return null;
      const added = mergeIn(r.data);
      if (r.saved) { d.syncedRev = rev; Store.save(); } else scheduleSync(6000);
      return added;
    })
    .catch(() => null)                                     // offline, or the SQL isn't run yet: try again later
    .finally(() => { syncing = null; });
  return syncing;
}
function scheduleSync(ms = 4000) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { const d = data(); if (d.legend?.code && (d.rev || 0) !== d.syncedRev) syncNow(); }, ms);
}
if (typeof window !== 'undefined') {
  Store.onProgress(() => scheduleSync());
  setTimeout(() => syncNow(), 1500);                       // each page load: pick up progress from your other browsers
  addEventListener('visibilitychange', () => { const d = data(); if (document.hidden && d.legend?.code && (d.rev || 0) !== d.syncedRev) syncNow({ keepalive: true }); });
}

export const Legends = {
  isLegend() { return !!data().legend; },
  info() { return data().legend; },

  /** Called by the engine when a flawless secret level is completed. Returns true the first time. */
  grant(gameId) {
    const d = data();
    const first = !d.legend;
    d.legend ??= { at: Date.now(), games: [], code: null, name: null };
    if (!d.legend.games.includes(gameId)) d.legend.games.push(gameId);
    Store.unlockAch('g:legend');
    Store.save();
    return first;
  },

  /** Zones whose Legend game this player has completed = the Golden Eggs they hold. */
  eggs() {
    const done = data().legend?.games || [];
    return ZONES.filter((z) => z.legendGame && done.includes(z.legendGame)).map((z) => z.n);
  },
  hasEgg(zoneN) { return this.eggs().includes(zoneN); },
  /** The Golden Crown: every zone's egg. */
  hasGoldenCrown() { const need = legendZones().length; return need > 0 && this.eggs().length >= need; },
  /** When the crown was won (first seen on this device). */
  crownAt() { return data().legend?.crownAt || null; },
  // old names, still used in a few places
  crowns() { return this.eggs(); },
  hasCrown(zoneN) { return this.hasEgg(zoneN); },
  /** Make sure the egg / crown badges match what's been won (also after restoring on a new device). */
  syncCrowns() {
    const c = this.eggs();
    for (const n of c) Store.unlockAch(`g:crown${n}`);
    // "grand" used to mean "every crown so far" — it's now The Golden Crown (all three eggs)
    if (!this.hasGoldenCrown() && Store.hasAch('g:grand')) Store.lockAch('g:grand');
    if (this.hasGoldenCrown()) {
      Store.unlockAch('g:grand');
      const d = data();
      if (!d.legend.crownAt) { d.legend.crownAt = Date.now(); Store.save(); }
    }
  },

  /** The golden site theme (Golden Crown holders, on by default). */
  goldThemeOn() { return this.hasGoldenCrown() && Store.setting('goldTheme') !== false; },
  setGoldTheme(on) { Store.setSetting('goldTheme', !!on); applyTheme(); },

  /** Is the golden character unlocked for this game? (needs the egg of the game's zone;
   *  in a zone that has no Legends game yet, the Golden Crown unlocks it instead) */
  goldUnlocked(gameId) { const z = zoneOf(gameId); return !!z && (z.legendGame ? this.hasEgg(z.n) : this.hasGoldenCrown()); },
  /** Is the golden character switched on for this game? (on by default once unlocked) */
  goldOn(gameId) { return this.goldUnlocked(gameId) && Store.setting(`gold:${gameId}`) !== false; },
  setGold(gameId, on) { Store.setSetting(`gold:${gameId}`, !!on); },

  /** Every golden character, with whether it's unlocked yet. */
  unlocks() {
    return GAMES.filter((g) => g.gold).map((g) => ({ id: g.id, title: g.title, gold: g.gold, color: g.color, zone: zoneOf(g.id)?.n, unlocked: this.goldUnlocked(g.id) }));
  },

  /** Sign the Hall of Legends. Returns { code, online }. */
  async claim(gameId, name, durationMs) {
    const problem = nameProblem(name);
    if (problem) throw new Error(problem);
    const d = data();
    let code;
    if (ONLINE) {
      const args = { p_game: gameId, p_name: name, p_duration_ms: Math.floor(durationMs) };
      let r;
      // v2 keeps ONE Legend code for all your eggs (when you sign with the same name)
      try { r = await rpc('claim_legend_v2', { ...args, p_code: d.legend?.code || null }); }
      catch (err) { if (!missingFn(err)) throw err; r = await rpc('claim_legend', args); }
      code = r.code;
    } else {
      code = d.legend?.code || localCode();
      d.local.push({ game: gameId, name, score: 0, level: 0, mode: 'legend', at: Date.now() });
    }
    d.legend.code = code; d.legend.name = name; d.legend.codeGames = d.legend.games.length;
    Store.setName(name);
    Store.save();
    scheduleSync(800);                                     // your progress now travels with this code
    return { code, online: ONLINE };
  },

  /** Tidy whatever was typed or pasted ("legend abc123", "ABC123", "Legend-abc 123") into LEGEND-XXXXXX. */
  normalizeCode(raw) {
    let t = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.startsWith('LEGEND')) t = t.slice(6);
    return 'LEGEND-' + t;
  },

  /** Restore Legend status on a new device from a Legend code. */
  async restore(raw) {
    const code = Legends.normalizeCode(raw);
    if (!/^LEGEND-[A-Z0-9]{6}$/.test(code)) throw new Error('That doesn\'t look like a Legend code (LEGEND-XXXXXX).');
    let entry = null;
    if (ONLINE) {
      // v2 brings back every Legends game on this code; v1 (before the SQL update) only one
      try { entry = await rpc('restore_legend_v2', { p_code: code }); }
      catch (err) { if (!missingFn(err)) throw err; entry = await rpc('restore_legend', { p_code: code }); }
    } else if (validLocal(code)) entry = { name: Store.name() || 'Legend', game: GAMES.find((g) => g.legend)?.id };
    const games = entry ? (entry.games || [entry.game]).filter(Boolean) : [];
    if (!games.length) throw new Error('Code not recognised. Check it and try again.');
    const d = data();
    d.legend ??= { at: Date.now(), games: [], code, name: entry.name };
    // keep the code that holds the most eggs as "your" code
    if (!d.legend.code || games.length >= (d.legend.codeGames || 1)) { d.legend.code = code; d.legend.name = entry.name; d.legend.codeGames = games.length; }
    for (const g of games) {
      if (!d.legend.games.includes(g)) d.legend.games.push(g);
      const badge = GAMES.find((x) => x.id === g)?.achievements?.find((a) => a.legendary)?.id;
      if (badge) Store.unlockAch(`${g}:${badge}`);
    }
    entry.game = games[0]; entry.games = games;
    Store.unlockAch('g:legend');
    this.syncCrowns();
    Store.save();
    // bring back the games played on that code (zones), levels, best scores and badges
    entry.progress = d.legend.code === code ? await syncNow() : null;
    return entry;
  },

  /** Save / fetch progress for this browser's Legend code right now (null if it couldn't). */
  syncProgress() { return syncNow(); },

  /** Names (lower-case) of everyone in the Hall who holds the Golden Crown. Cached for 10 minutes. */
  crownNames() { return (crownPromise ||= this.loadCrownNames().catch((e) => { crownPromise = null; throw e; })); },
  async loadCrownNames() {
    try {
      const c = JSON.parse(sessionStorage.getItem('arcade:crowns') || 'null');
      if (c && Date.now() - c.t < 600000) { crownSet = new Set(c.n); return crownSet; }
    } catch { /* ignore */ }
    const rows = await this.hall();
    crownSet = new Set(crownHolders(rows).map((p) => p.name.toLowerCase()));
    try { sessionStorage.setItem('arcade:crowns', JSON.stringify({ t: Date.now(), n: [...crownSet] })); } catch { /* ignore */ }
    return crownSet;
  },
  /** A little 👑 after a name on a leaderboard (call crownNames() first). */
  crownMark(name) { return crownSet?.has(String(name).toLowerCase()) ? ' <span class="crown-mark" title="Holder of the Golden Crown">👑</span>' : ''; },

  /** Everyone in the Hall (oldest first — the first finders are the most legendary). */
  async hall() {
    if (ONLINE) {
      const rows = await rpc('hall_of_legends', {});
      return rows.map((r) => ({ name: r.name, game: r.game, at: new Date(r.created_at).getTime() }));
    }
    return data().local.filter((e) => e.mode === 'legend').sort((a, b) => a.at - b.at);
  },
};

applyTheme();

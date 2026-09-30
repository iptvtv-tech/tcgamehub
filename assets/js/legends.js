// ─────────────────────────────────────────────────────────────
//  LEGENDS — shared secret-reward system for "Legend games".
//
//  A Legend game has a fixed ending (def.finalLevel) and a secret level
//  (def.secretLevel) that only opens for a flawless run: started at level 1
//  and never lost a life. Every zone of 6 games ends with a Legend game (see ZONES
//  in games.js). Finishing its secret level wins that zone's CROWN:
//    • golden versions of the main character in that zone's games (toggle in each game's menu)
//    • a crown badge (both crowns → Grand Legend)
//    • special "Legendary" badges
//    • access to the hidden Hall of Legends page (/hall-of-legends/)
//    • a Legend code to restore everything on another device
//
//  Any future game can join by adding `legend: {...}` to its entry in games.js
//  and finalLevel / secretLevel to its runGame() settings. See docs/ADDING_A_GAME.md
// ─────────────────────────────────────────────────────────────
import { Store } from './storage.js';
import { GAMES, ZONES, zoneOf } from './games.js';
import { rpc, ONLINE, nameProblem } from './scores.js';

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

  /** Zones whose Legend game this player has completed. */
  crowns() {
    const done = data().legend?.games || [];
    return ZONES.filter((z) => z.legendGame && done.includes(z.legendGame)).map((z) => z.n);
  },
  hasCrown(zoneN) { return this.crowns().includes(zoneN); },
  /** Make sure the crown badges match the crowns (also after restoring on a new device). */
  syncCrowns() {
    const c = this.crowns();
    for (const n of c) Store.unlockAch(`g:crown${n}`);
    if (c.length && c.length === ZONES.length) Store.unlockAch('g:grand');
  },

  /** Is the golden character unlocked for this game? (needs the crown of the game's zone) */
  goldUnlocked(gameId) { const z = zoneOf(gameId); return !!z && this.hasCrown(z.n); },
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
      const r = await rpc('claim_legend', { p_game: gameId, p_name: name, p_duration_ms: Math.floor(durationMs) });
      code = r.code;
    } else {
      code = d.legend?.code || localCode();
      d.local.push({ game: gameId, name, score: 0, level: 0, mode: 'legend', at: Date.now() });
    }
    d.legend.code = code; d.legend.name = name;
    Store.setName(name);
    Store.save();
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
    if (ONLINE) entry = await rpc('restore_legend', { p_code: code });
    else if (validLocal(code)) entry = { name: Store.name() || 'Legend', game: GAMES.find((g) => g.legend)?.id };
    if (!entry || !entry.game) throw new Error('Code not recognised. Check it and try again.');
    const d = data();
    d.legend ??= { at: Date.now(), games: [], code, name: entry.name };
    d.legend.code = code; d.legend.name = entry.name;
    if (!d.legend.games.includes(entry.game)) d.legend.games.push(entry.game);
    Store.unlockAch('g:legend');
    const badge = GAMES.find((g) => g.id === entry.game)?.achievements?.find((a) => a.legendary)?.id;
    if (badge) Store.unlockAch(`${entry.game}:${badge}`);
    this.syncCrowns();
    Store.save();
    return entry;
  },

  /** Everyone in the Hall (oldest first — the first finders are the most legendary). */
  async hall() {
    if (ONLINE) {
      const rows = await rpc('hall_of_legends', {});
      return rows.map((r) => ({ name: r.name, game: r.game, at: new Date(r.created_at).getTime() }));
    }
    return data().local.filter((e) => e.mode === 'legend').sort((a, b) => a.at - b.at);
  },
};

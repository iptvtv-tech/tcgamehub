// Shared leaderboard module.
// • With Supabase configured (assets/js/config.js) → one global leaderboard for everyone.
// • Without it → a local leaderboard saved in this browser, so the site still works.
import { CONFIG } from './config.js';
import { Store } from './storage.js';

const URL_ = (CONFIG.supabaseUrl || '').replace(/\/+$/, '');
const KEY = CONFIG.supabaseKey || '';
export const ONLINE = !!(URL_ && KEY);

function headers() {
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  // Legacy "anon" keys are JWTs and also go in Authorization.
  // New publishable keys (sb_publishable_…) must only be sent as `apikey`.
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;
  return h;
}

async function rpc(fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(args),
  });
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error((body && body.message) || `Server error ${res.status}`);
  return body;
}

// ── Name rules ──────────────────────────────────────────────
// Letters, numbers, spaces, _ . - ; max 12 characters; basic rude-word filter.
// The same rules are enforced again on the server (supabase/schema.sql).
const BANNED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'slut', 'whore', 'twat', 'wank',
  'bastard', 'retard', 'penis', 'vagina', 'porn', 'rape', 'nazi', 'hitler', 'pussy', 'asshole',
  'arsehole', 'dildo', 'jizz', 'kkk', 'paki', 'spastic', 'bollock', 'prick', 'bellend'];

export function cleanName(raw) {
  return String(raw || '').replace(/[^A-Za-z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}
export function nameProblem(name) {
  if (!name) return 'Please enter a name.';
  if (!/^[A-Za-z0-9 _.\-]{1,12}$/.test(name)) return 'Letters and numbers only (max 12).';
  const norm = name.toLowerCase().replace(/[013457@$]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' }[c])).replace(/[^a-z]/g, '');
  if (BANNED.some((w) => norm.includes(w))) return 'Please choose a friendlier name.';
  return null;
}

// ── Local fallback ──────────────────────────────────────────
function periodStart(period) {
  const now = new Date();
  if (period === 'today') return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period === 'week') return Date.now() - 7 * 86400000;
  return 0;
}
function localBest(game, period, mode) {
  const since = periodStart(period);
  const best = new Map();
  for (const e of Store.data.local) {
    if (e.game !== game || e.mode !== mode || e.at < since) continue;
    const k = e.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || e.score > cur.score) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
}

// ── Public API ──────────────────────────────────────────────
export const Scores = {
  online: ONLINE,

  /** Top scores (best per name). period: 'today' | 'week' | 'all'; mode: 'normal' | 'daily' */
  async top(game, period = 'today', mode = 'normal', limit = CONFIG.boardSize) {
    if (ONLINE) {
      const rows = await rpc('top_scores', { p_game: game, p_period: period, p_mode: mode, p_limit: limit });
      return rows.map((r) => ({ name: r.name, score: r.score, level: r.level, at: new Date(r.created_at).getTime() }));
    }
    return localBest(game, period, mode).slice(0, limit);
  },

  /** Where would this score rank? (1 = top) */
  async rank(game, score, period = 'today', mode = 'normal') {
    if (ONLINE) return rpc('score_rank', { p_game: game, p_score: score, p_period: period, p_mode: mode });
    return 1 + localBest(game, period, mode).filter((e) => e.score > score).length;
  },

  /** Save a score. Returns { rank } or throws an Error with a friendly message. */
  async submit({ game, name, score, level, durationMs, mode = 'normal' }) {
    const problem = nameProblem(name);
    if (problem) throw new Error(problem);
    if (ONLINE) {
      const r = await rpc('submit_score', {
        p_game: game, p_name: name, p_score: Math.floor(score), p_level: level,
        p_duration_ms: Math.floor(durationMs), p_mode: mode,
      });
      return { rank: r.rank };
    }
    const d = Store.data;
    d.local.push({ game, name, score, level, mode, at: Date.now() });
    if (d.local.length > 600) d.local.splice(0, d.local.length - 600);
    Store.save();
    return { rank: await this.rank(game, score, 'today', mode) };
  },

  /** Most recent scores across all games (for the home page ticker). */
  async recent(limit = 15) {
    if (ONLINE) {
      const rows = await rpc('recent_scores', { p_limit: limit });
      return rows.map((r) => ({ game: r.game, name: r.name, score: r.score, at: new Date(r.created_at).getTime() }));
    }
    return [...Store.data.local].sort((a, b) => b.at - a.at).slice(0, limit);
  },
};

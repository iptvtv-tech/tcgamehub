// Zone progress. Every game is open to everyone; zones are the recommended order
// (difficulty rises with the game number). Playing all six games of a zone completes it,
// which the home page shows as a stamp and the token system rewards.
import { ZONES, zoneOf } from './games.js';
import { Store } from './storage.js';

export const ZoneLock = {
  /** { played, need, games } for zone n itself (how many of its games have been played). */
  progress(n) {
    const z = ZONES.find((x) => x.n === n);
    if (!z) return { played: 0, need: 0, games: [] };
    // need counts every slot, built or not: a zone with games still "coming soon" can't be
    // completed early (Zone 6 opened with one game, 30 Oct 2026)
    const games = z.slots.filter(Boolean);
    return { played: games.filter((id) => Store.plays(id) > 0).length, need: z.slots.length, games };
  },
  /** true when every built game in zone n has been played at least once */
  complete(n) { const p = this.progress(n); return p.need > 0 && p.played >= p.need; },
  // Kept for older code paths: nothing is locked any more.
  isOpen() { return true; },
  gameOpen() { return true; },
  zoneOf,
};

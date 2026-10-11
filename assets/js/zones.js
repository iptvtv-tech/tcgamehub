// Zone locks: a zone opens once every game in the zone before it has been played at least once.
// (Daily Challenge links skip the lock so everyone can try the game of the day.)
import { ZONES, zoneOf } from './games.js';
import { Store } from './storage.js';

export const ZoneLock = {
  /** { played, need, games } for what's needed to open zone n. */
  progress(n) {
    const prev = ZONES.find((z) => z.n === n - 1);
    if (!prev) return { played: 0, need: 0, games: [] };
    const games = prev.slots.filter(Boolean);
    return { played: games.filter((id) => Store.plays(id) > 0).length, need: games.length, games };
  },
  isOpen(n) { const p = this.progress(n); return p.played >= p.need; },
  gameOpen(id) { const z = zoneOf(id); return !z || this.isOpen(z.n); },
};

// Zone locks: a zone opens once every game in the zone before it has been played at least once.
// (Daily Challenge links skip the lock so everyone can try the game of the day.)
// A Legend also gets in: holding a zone's Golden Egg opens that zone and the next one —
// worked out from the eggs themselves, so a Legend code entered on a new browser opens
// every zone straight away, with no play history needed on that browser.
import { ZONES, zoneOf } from './games.js';
import { Store } from './storage.js';

/** highest zone whose Golden Egg this browser holds (0 = none) */
const eggZone = () => Math.max(0, ...(Store.data.legend?.games || []).map((id) => zoneOf(id)?.n || 0));

export const ZoneLock = {
  /** { played, need, games } for what's needed to open zone n. */
  progress(n) {
    const prev = ZONES.find((z) => z.n === n - 1);
    if (!prev) return { played: 0, need: 0, games: [] };
    const games = prev.slots.filter(Boolean);
    if (eggZone() >= n - 1) return { played: games.length, need: games.length, games, byEgg: true };
    return { played: games.filter((id) => Store.plays(id) > 0).length, need: games.length, games };
  },
  isOpen(n) { const p = this.progress(n); return p.played >= p.need; },
  gameOpen(id) { const z = zoneOf(id); return !z || this.isOpen(z.n); },
};

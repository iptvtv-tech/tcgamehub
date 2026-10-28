// ─────────────────────────────────────────────────────────────
//  Visitor stats — privacy-friendly, OFF until CONFIG.goatcounter is set.
//  Uses GoatCounter's counting pixel: no cookies, no third-party script, nothing
//  stored on the visitor's device. Only the page path (never the ?query part, so
//  no player names from challenge links), the page title, the referring SITE and
//  the screen width are sent. Visitors with "Do Not Track" switched on aren't counted.
//
//  "Don't count this browser": open any page with ?nostats (or use the switch on the
//  About page) and nothing more is sent from this browser; ?nostats=0 turns it back on.
//  Use it on your own phones and computers so the stats show real players only.
// ─────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';

const CODE = (CONFIG.goatcounter || '').trim();
const LIVE = /^[a-z0-9-]{2,50}$/.test(CODE)
  && !['localhost', '127.0.0.1'].includes(location.hostname) && !navigator.webdriver;
const DNT = navigator.doNotTrack === '1';
const NOSTATS = 'arcade:nostats';   // kept by the About page's "Reset saved data" (it's a device setting, not a save)

let off = false;
try { off = localStorage.getItem(NOSTATS) === '1'; } catch { /* storage blocked: counted as normal */ }

/** Switch counting on (true) or off (false) for this browser. */
export function setCounting(on) {
  off = !on;
  try { if (on) localStorage.removeItem(NOSTATS); else localStorage.setItem(NOSTATS, '1'); } catch { /* storage blocked: lasts for this page only */ }
}

/** 'on', 'off' (switched off on this browser), 'dnt' (Do Not Track) or 'none' (stats not running here). */
export function countingState() {
  if (!LIVE) return 'none';
  if (DNT) return 'dnt';
  return off ? 'off' : 'on';
}

// ?nostats (or ?nostats=1) switches counting off for this browser, ?nostats=0 back on.
// The switch is then taken out of the address bar so a shared link can't carry it.
{
  const q = new URLSearchParams(location.search);
  if (q.has('nostats')) {
    setCounting(q.get('nostats') === '0');
    q.delete('nostats');
    const rest = q.toString();
    try { history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash); } catch { /* ignore */ }
  }
}

function send(params) {
  if (countingState() !== 'on') return;
  const q = new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) });
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.src = `https://${CODE}.goatcounter.com/count?${q}`;
}

/** One page view (called once per page load). */
function pageView() {
  let ref = '';
  try { const r = new URL(document.referrer); if (r.hostname !== location.hostname) ref = r.origin; } catch { /* none */ }
  send({ p: location.pathname, t: document.title, r: ref, s: String(screen.width) });
}

/** A game event, e.g. event('start', 'neon-snake') or event('over', 'neon-snake', 7). */
export function event(kind, game, level) {
  const band = level ? `/levels-${Math.floor((level - 1) / 5) * 5 + 1}-${Math.floor((level - 1) / 5) * 5 + 5}` : '';
  send({ p: `${kind}/${game}${band}`, t: `${kind} ${game}${band.replace('/', ' ')}`, e: 'true' });
}

pageView();

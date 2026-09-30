// ─────────────────────────────────────────────────────────────
//  Visitor stats — privacy-friendly, OFF until CONFIG.goatcounter is set.
//  Uses GoatCounter's counting pixel: no cookies, no third-party script, nothing
//  stored on the visitor's device. Only the page path (never the ?query part, so
//  no player names from challenge links), the page title, the referring SITE and
//  the screen width are sent. Visitors with "Do Not Track" switched on aren't counted.
// ─────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';

const CODE = (CONFIG.goatcounter || '').trim();
const ON = /^[a-z0-9-]{2,50}$/.test(CODE)
  && !['localhost', '127.0.0.1'].includes(location.hostname)
  && navigator.doNotTrack !== '1' && !navigator.webdriver;

function send(params) {
  if (!ON) return;
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

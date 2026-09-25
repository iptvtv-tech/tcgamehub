// Small helpers shared by the non-game pages.
import { CONFIG } from './config.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.floor(n || 0).toLocaleString('en-GB');

export function ago(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Fill in the site name / year, and register the offline service worker. */
export function siteChrome() {
  document.querySelectorAll('[data-site-name]').forEach((el) => { el.textContent = CONFIG.siteName; });
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const root = new URL('../../', import.meta.url); // assets/js/ → site root
    navigator.serviceWorker.register(new URL('sw.js', root)).catch(() => {});
  }
}

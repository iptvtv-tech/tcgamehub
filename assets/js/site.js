// Small helpers shared by the non-game pages.
import { CONFIG } from './config.js';
import { Legends } from './legends.js';
import { Store } from './storage.js';
import './stats.js';   // privacy-friendly visitor stats (off unless CONFIG.goatcounter is set)
import { Tokens } from './tokens.js';

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
  // Everyone can find the door to the Hall of Legends — only Legends get in.
  const nav = document.querySelector('.site-nav');
  // Retro Vault (homebrew console games): every page has the link in its HTML;
  // this only adds it to a page that's missing it.
  if (nav && !nav.querySelector('.retro-link')) {
    const root = new URL('../../', import.meta.url);
    const r = document.createElement('a');
    r.className = 'retro-link';
    r.href = new URL('retro-vault/', root).href;
    r.innerHTML = '🕹️<span class="nav-label"> Retro</span>';
    r.title = 'Retro Vault';
    if (location.pathname.includes('/retro-vault/')) r.setAttribute('aria-current', 'page');
    nav.appendChild(r);
  }
  if (nav && !nav.querySelector('.legend-link')) {
    const root = new URL('../../', import.meta.url);
    const a = document.createElement('a');
    a.className = 'legend-link' + (Legends.isLegend() ? ' is-legend' : '');
    a.href = new URL('hall-of-legends/', root).href;
    a.innerHTML = `${Legends.isLegend() ? '👑' : '🏛️'}<span class="nav-label"> Legends</span>`;
    a.title = 'Hall of Legends';
    if (location.pathname.includes('/hall-of-legends/')) {
      nav.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current'));
      a.setAttribute('aria-current', 'page');
    }
    nav.appendChild(a);
  }
  // Arcade tokens: balance pill → the shop
  if (nav && !nav.querySelector('.token-pill')) {
    const root = new URL('../../', import.meta.url);
    const t = document.createElement('a');
    t.className = 'token-pill';
    t.href = new URL('shop/', root).href;
    t.title = 'Arcade tokens — spend them in the shop';
    t.innerHTML = `${Tokens.avatarHTML()} ${Tokens.fmt(Tokens.balance())}`;
    if (location.pathname.includes('/shop/')) t.setAttribute('aria-current', 'page');
    nav.after(t);   // sits beside the nav so it stays in the top bar on phones (the nav folds into the ☰ menu)
    Store.onProgress(() => { t.innerHTML = `${Tokens.avatarHTML()} ${Tokens.fmt(Tokens.balance())}`; });
  }
  // Site-wide sound switch (audit P2): the same setting every game's 🔊 button uses.
  if (nav && !nav.querySelector('.mute-link')) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mute-link';
    const show = () => {
      const m = Store.setting('muted') === true;
      b.textContent = m ? '🔇' : '🔊';
      b.setAttribute('aria-label', m ? 'Sound is off — turn sound on' : 'Sound is on — turn sound off');
      b.setAttribute('aria-pressed', String(m));
      b.title = m ? 'Sound off' : 'Sound on';
    };
    b.addEventListener('click', () => { Store.setSetting('muted', Store.setting('muted') !== true); show(); });
    show();
    nav.appendChild(b);
  }
  // Phone header: a ☰ button folds the nav into a sheet under the bar (CSS ≤ 600px).
  if (nav && !document.querySelector('.menu-btn')) {
    const root = new URL('../../', import.meta.url);
    if (!nav.querySelector('a[href$="shop/"]')) {
      const s = document.createElement('a'); s.className = 'shop-link menu-only'; s.href = new URL('shop/', root).href; s.innerHTML = '🪙<span class="nav-label"> Token Shop</span>';
      if (location.pathname.includes('/shop/')) s.setAttribute('aria-current', 'page');
      nav.appendChild(s);
    }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'menu-btn'; b.setAttribute('aria-label', 'Menu'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'site-menu');
    b.innerHTML = '<span></span><span></span><span></span>';
    nav.id = nav.id || 'site-menu';
    const set = (open) => { nav.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('menu-open', open); };
    b.addEventListener('click', () => set(!nav.classList.contains('open')));
    document.addEventListener('click', (e) => { if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== b && !b.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    nav.parentElement.appendChild(b);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const root = new URL('../../', import.meta.url); // assets/js/ → site root
    navigator.serviceWorker.register(new URL('sw.js', root)).catch(() => {});
  }
}

/** WhatsApp share link (opens the app on phones, WhatsApp Web on computers). */
export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const WA_ICON = '<svg class="wa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3z"/></svg>';

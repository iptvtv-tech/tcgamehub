// /games/ — the browse bar. The page is static (tools/build-pages.mjs): one card per
// game with data-genres / data-tier / data-q. The chips are real links to the genre
// pages, so search engines and no-JS visitors still get there; here a click filters
// the grid in place instead. One genre chip and one difficulty chip can be on at once,
// plus a search; the choice is kept in the URL (?g=puzzle&t=hard&q=snake) so it survives
// a refresh and can be shared.
import { siteChrome } from './site.js';
import { Store } from './storage.js';
siteChrome();

const $ = (s) => document.querySelector(s);
const grid = $('#all-games'), cards = [...grid.querySelectorAll('.game-card[data-game]')];
const chips = [...document.querySelectorAll('#browse .chip')];
const q = $('#q'), count = $('#browse-count'), empty = $('#browse-empty');
const state = { genre: null, tier: null, q: '' };

// Played ticks and personal bests, like the home page.
for (const c of cards) {
  if (Store.plays(c.dataset.game) > 0) c.insertAdjacentHTML('afterbegin', '<span class="played-badge">✓ Played</span>');
}

function apply(push = true) {
  let n = 0;
  const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const c of cards) {
    const genres = c.dataset.genres.split(' ');
    const ok = (!state.genre || genres.includes(state.genre))
      && (!state.tier || c.dataset.tier === state.tier)
      && words.every((w) => c.dataset.q.includes(w));
    c.hidden = !ok; if (ok) n++;
  }
  for (const ch of chips) {
    const f = ch.dataset.f;
    ch.classList.toggle('on', f === 'all' ? !state.genre && !state.tier : f === `genre:${state.genre}` || f === `tier:${state.tier}`);
  }
  const any = state.genre || state.tier || words.length;
  count.textContent = any ? `${n} of ${cards.length} games` : `${cards.length} games`;
  empty.hidden = n > 0;
  if (push) {
    const p = new URLSearchParams();
    if (state.genre) p.set('g', state.genre); if (state.tier) p.set('t', state.tier); if (state.q.trim()) p.set('q', state.q.trim());
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }
}

document.getElementById('browse').addEventListener('click', (e) => {
  const ch = e.target.closest('.chip'); if (!ch) return;
  e.preventDefault();
  const [kind, id] = ch.dataset.f.split(':');
  if (kind === 'all') { state.genre = null; state.tier = null; }
  else if (kind === 'genre') state.genre = state.genre === id ? null : id;
  else if (kind === 'tier') state.tier = state.tier === id ? null : id;
  apply();
});
q.addEventListener('input', () => { state.q = q.value; apply(); });
empty.querySelector('[data-clear]').addEventListener('click', (e) => { e.preventDefault(); state.genre = state.tier = null; state.q = q.value = ''; apply(); });

// Start from the URL (?g=&t=&q=).
const p = new URLSearchParams(location.search);
state.genre = p.get('g'); state.tier = p.get('t'); state.q = q.value = p.get('q') || '';
apply(false);

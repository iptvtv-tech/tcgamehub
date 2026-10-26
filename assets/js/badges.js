// /badges/ — static page (tools/build-pages.mjs lists every badge); here we mark the
// ones this player has earned, reveal earned secrets, and count them.
import { siteChrome } from './site.js';
import { Store } from './storage.js';
siteChrome();

const all = [...document.querySelectorAll('.badge[data-key]')];
let got = 0;
for (const el of all) {
  const has = Store.hasAch(el.dataset.key);
  if (!has) continue;
  got++;
  el.classList.add('got'); el.classList.remove('secret');
  if (el.dataset.title) { el.querySelector('.ico').textContent = el.dataset.icon; el.querySelector('b').textContent = el.dataset.title; el.querySelector('small').textContent = el.dataset.desc; }
}
document.getElementById('badge-count').textContent = `${got} / ${all.length} unlocked`;
for (const grp of document.querySelectorAll('.badge-group')) {
  const n = grp.querySelectorAll('.badge.got').length, t = grp.querySelectorAll('.badge').length;
  if (n) grp.querySelector('.section-head .muted').insertAdjacentHTML('afterbegin', `<b class="${n === t ? 'done' : ''}">${n}/${t}</b> · `);
}
const f = document.getElementById('badge-filter');
if (got) {
  f.hidden = false; let only = false;
  f.addEventListener('click', (e) => { e.preventDefault(); only = !only; document.body.classList.toggle('unearned-only', only); f.textContent = only ? 'Show all badges' : 'Show only unearned'; });
}

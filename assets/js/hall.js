// Hall of Legends — hidden page. Locked for everyone except Legends.
import { GAMES, gameById, legendZones } from './games.js';
import { Store } from './storage.js';
import { Legends, hallPeople } from './legends.js';
import { eggSVG, eggName, crownSVG } from './eggs.js';
import { siteChrome, esc } from './site.js';

siteChrome();
const main = document.getElementById('hall');
const date = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function locked() {
  main.innerHTML = `
    <section class="vault">
      <div class="vault-door" aria-hidden="true"><i></i><i></i><i></i></div>
      <h1>The Hall of Legends</h1>
      <p>This door only opens for true Legends. Nobody has ever been told how to become one…</p>
      <p class="small">Already a Legend on another phone or computer? Enter your Legend code — just the 6 letters and numbers is fine:</p>
      <form class="restore" autocomplete="off">
        <input name="c" placeholder="LEGEND-XXXXXX" maxlength="20" aria-label="Legend code" spellcheck="false" autocapitalize="characters" autocomplete="off" inputmode="text">
        <button class="btn primary" type="submit">Unlock</button>
      </form>
      <p class="restore-msg" aria-live="polite"></p>
      <a class="btn" href="../">⌂ Back to the arcade</a>
    </section>`;
  const form = main.querySelector('form'), msg = main.querySelector('.restore-msg');
  // Tidy the code as it's typed or pasted, and accept a restore link (…/hall-of-legends/#LEGEND-XXXXXX).
  form.c.addEventListener('input', () => {
    const t = Legends.normalizeCode(form.c.value).slice(7, 13);
    form.c.value = t ? 'LEGEND-' + t : '';
    msg.className = 'restore-msg'; msg.textContent = '';
  });
  const fromLink = decodeURIComponent(location.hash.slice(1));
  if (/[A-Z0-9]{6}/i.test(fromLink)) { form.c.value = Legends.normalizeCode(fromLink); history.replaceState(null, '', location.pathname); }
  if (matchMedia('(pointer: fine)').matches) form.c.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    form.querySelector('button').disabled = true; msg.className = 'restore-msg'; msg.textContent = 'Checking…';
    try {
      const entry = await Legends.restore(form.c.value);
      msg.textContent = `Welcome back, ${entry.name}!`;
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      msg.className = 'restore-msg err'; msg.textContent = err.message;
      form.querySelector('button').disabled = false;
    }
  };
}

async function open() {
  const me = Legends.info();
  const unlocks = Legends.unlocks();
  main.innerHTML = `
    <section class="hall-head">
      <h1>🏛️ Hall of Legends</h1>
      <p>Only players who finished a Legends game without losing a single life have found their way in here. Each one wins a Golden Egg — all three win the Golden Crown. Welcome, ${esc(me.name || Store.name() || 'Legend')}.</p>
      <div class="egg-shelf">${legendZones().map((z) => {
        const won = Legends.hasEgg(z.n), lg = gameById(z.legendGame);
        return `<div class="egg-stand${won ? ' won' : ''}">${eggSVG(z.n, { size: 70, won })}<b>${esc(eggName(z.n))}</b><small>${won ? 'Won! Golden characters unlocked in Zone ' + z.n + '.' : `Finish ${esc(lg.title)} without losing a life.`}</small></div>`;
      }).join('')}
        ${Legends.hasGoldenCrown()
          ? `<a class="egg-stand crown-stand won" href="../crown-room/">${crownSVG({ size: 110, cls: 'spin' })}<b>The Golden Crown</b><small>All three eggs! Enter the Crown Room →</small></a>`
          : `<div class="egg-stand crown-stand"><span class="crown-ghost">👑</span><b>The Golden Crown</b><small>Collect all ${legendZones().length} Golden Eggs to win it — and open the Crown Room.</small></div>`}
      </div>
    </section>
    <div class="hall-grid">
      <section class="hall-card">
        <h2>The Legends</h2>
        <ol class="legend-list" data-list><li class="muted">Loading…</li></ol>
      </section>
      <div style="display:grid;gap:20px;align-content:start">
        <section class="hall-card">
          <h2>✨ Your golden characters</h2>
          ${unlocks.map((u) => `
            <div class="gold-row${u.unlocked ? '' : ' locked'}">
              <img src="../games/${u.id}/thumb.svg" alt="">
              <div><a href="../games/${u.id}/">${esc(u.title)}</a><small>${esc(u.gold)}${u.unlocked ? '' : ` · 🔒 needs the ${esc(eggName(u.zone))}`}</small></div>
              ${u.unlocked ? `<button class="switch" role="switch" aria-checked="${Legends.goldOn(u.id)}" aria-label="${esc(u.gold)}" data-gold="${u.id}"></button>` : ''}
            </div>`).join('')}
        </section>
        <section class="hall-card">
          <h2>🔑 Your Legend code</h2>
          ${me.code ? `<p class="my-code">${esc(me.code)}</p><p><button class="btn small" data-copy="code">📋 Copy code</button> <button class="btn small" data-copy="link">🔗 Copy restore link</button></p><p class="muted small copy-msg">Enter it on this page — tap <b>🏛️ Legends</b> at the top of any page — on any phone or computer to get your golden characters back. Or open your restore link there.</p>`
            : `<p class="muted small">Sign the Hall at the end of your Legend run to get a code for restoring your eggs and golden characters on another device.</p>`}
          <details class="add-code"><summary>Won an egg on another device? Add its Legend code</summary>
            <form class="restore" autocomplete="off"><input name="c" placeholder="LEGEND-XXXXXX" maxlength="20" aria-label="Another Legend code" spellcheck="false" autocapitalize="characters"><button class="btn small" type="submit">Add</button></form>
            <p class="restore-msg" aria-live="polite"></p>
          </details>
        </section>
      </div>
    </div>`;
  main.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => {
    const text = b.dataset.copy === 'link' ? `${location.origin}${location.pathname}#${me.code}` : me.code;
    try { await navigator.clipboard.writeText(text); b.textContent = '✅ Copied'; }
    catch { prompt('Copy this:', text); }
    setTimeout(() => { b.textContent = b.dataset.copy === 'link' ? '🔗 Copy restore link' : '📋 Copy code'; }, 1600);
  });
  const add = main.querySelector('.add-code form'), addMsg = main.querySelector('.add-code .restore-msg');
  add.onsubmit = async (e) => {
    e.preventDefault();
    const before = Legends.eggs().length;
    add.querySelector('button').disabled = true; addMsg.className = 'restore-msg'; addMsg.textContent = 'Checking…';
    try {
      await Legends.restore(add.c.value);
      const n = Legends.eggs().length - before;
      addMsg.textContent = n > 0 ? `🥚 ${n} more egg${n > 1 ? 's' : ''} added!` : 'Done — no new eggs on that code.';
      setTimeout(() => location.reload(), 1100);
    } catch (err) { addMsg.className = 'restore-msg err'; addMsg.textContent = err.message; add.querySelector('button').disabled = false; }
  };
  main.querySelectorAll('[data-gold]').forEach((b) => b.onclick = () => {
    const on = b.getAttribute('aria-checked') !== 'true';
    Legends.setGold(b.dataset.gold, on); b.setAttribute('aria-checked', on);
  });
  const list = main.querySelector('[data-list]');
  try {
    const rows = await Legends.hall();
    const my = (me.name || '').toLowerCase();
    // one line per Legend, with an egg for every zone they've won
    const people = hallPeople(rows);
    list.innerHTML = people.length ? people.map((p) => {
      const eggs = [...p.zones.keys()].sort().map((n) => eggSVG(n, { size: 18 })).join('');
      return `<li class="${my && p.name.toLowerCase() === my ? 'me' : ''}${p.crown ? ' grand' : ''}"><b>${esc(p.name)} <span class="mini-eggs">${eggs}</span>${p.crown ? ' <span class="grand-title">👑 GOLDEN CROWN</span>' : ''}</b><small>${esc([...new Set(p.games.map((g) => gameById(g)?.title || g))].join(' · '))}<br>${date(p.at)}</small></li>`;
    }).join('')
      : '<li class="muted">No names yet — you could be the first to sign!</li>';
  } catch { list.innerHTML = '<li class="muted">The Hall is closed for cleaning — try again in a minute.</li>'; }
}

if (Legends.isLegend()) open(); else locked();
void GAMES;

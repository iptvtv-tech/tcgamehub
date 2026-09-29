// Hall of Legends — hidden page. Locked for everyone except Legends.
import { GAMES, ZONES, gameById, zoneOf } from './games.js';
import { Store } from './storage.js';
import { Legends } from './legends.js';
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
      <p class="small">Already a Legend on another phone or computer? Enter your Legend code:</p>
      <form class="restore" autocomplete="off">
        <input name="c" placeholder="LEGEND-XXXXXX" maxlength="13" aria-label="Legend code" spellcheck="false">
        <button class="btn primary" type="submit">Unlock</button>
      </form>
      <p class="restore-msg" aria-live="polite"></p>
      <a class="btn" href="../">⌂ Back to the arcade</a>
    </section>`;
  const form = main.querySelector('form'), msg = main.querySelector('.restore-msg');
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
      <p>Only players who finished a Legends game without losing a single life have found their way in here. Welcome, ${esc(me.name || Store.name() || 'Legend')}.</p>
      <div class="crowns">${ZONES.map((z) => {
        const won = Legends.hasCrown(z.n), lg = z.legendGame && gameById(z.legendGame);
        return `<div class="crown-card${won ? ' won' : ''}"><span>${won ? (z.n === 1 ? '🥇' : '💎') : '🔒'}</span><b>Zone ${z.n} Crown</b><small>${won ? 'Won! Golden characters unlocked in this zone.' : lg ? `Finish ${esc(lg.title)} without losing a life.` : 'Its Legends game is coming soon…'}</small></div>`;
      }).join('')}</div>
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
              <div><a href="../games/${u.id}/">${esc(u.title)}</a><small>${esc(u.gold)}${u.unlocked ? '' : ` · 🔒 needs the Zone ${u.zone} crown`}</small></div>
              ${u.unlocked ? `<button class="switch" role="switch" aria-checked="${Legends.goldOn(u.id)}" aria-label="${esc(u.gold)}" data-gold="${u.id}"></button>` : ''}
            </div>`).join('')}
        </section>
        <section class="hall-card">
          <h2>🔑 Your Legend code</h2>
          ${me.code ? `<p class="my-code">${esc(me.code)}</p><p class="muted small">Enter it on this page on any phone or computer to get your golden characters back.</p>`
            : `<p class="muted small">Sign the Hall at the end of your Legend run to get a code for restoring your golden characters on another device.</p>`}
        </section>
      </div>
    </div>`;
  main.querySelectorAll('[data-gold]').forEach((b) => b.onclick = () => {
    const on = b.getAttribute('aria-checked') !== 'true';
    Legends.setGold(b.dataset.gold, on); b.setAttribute('aria-checked', on);
  });
  const list = main.querySelector('[data-list]');
  try {
    const rows = await Legends.hall();
    const my = (me.name || '').toLowerCase();
    // one line per Legend, with a crown for every zone they've won
    const byName = new Map();
    for (const r of rows) {
      const k = r.name.toLowerCase();
      if (!byName.has(k)) byName.set(k, { name: r.name, at: r.at, zones: new Set(), games: [] });
      const e = byName.get(k); const z = zoneOf(r.game);
      if (z) e.zones.add(z.n); e.games.push(gameById(r.game)?.title || r.game);
    }
    const people = [...byName.values()];
    list.innerHTML = people.length ? people.map((p) => {
      const grand = p.zones.size === ZONES.length;
      return `<li class="${my && p.name.toLowerCase() === my ? 'me' : ''}${grand ? ' grand' : ''}"><b>${esc(p.name)} ${[...p.zones].sort().map((n) => n === 1 ? '🥇' : '💎').join('')}${grand ? ' <span class="grand-title">GRAND LEGEND</span>' : ''}</b><small>${esc([...new Set(p.games)].join(' · '))}<br>${date(p.at)}</small></li>`;
    }).join('')
      : '<li class="muted">No names yet — you could be the first to sign!</li>';
  } catch { list.innerHTML = '<li class="muted">The Hall is closed for cleaning — try again in a minute.</li>'; }
}

if (Legends.isLegend()) open(); else locked();
void GAMES;

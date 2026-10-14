// Hall of Legends — hidden page. Locked for everyone except Legends.
import { GAMES, ZONES, gameById, legendZones, crownZones, jewelZones } from './games.js';
import { Store } from './storage.js';
import { Legends, hallPeople } from './legends.js';
import { eggSVG, eggName, crownSVG } from './eggs.js';
import { ZoneLock } from './zones.js';
import { siteChrome, esc } from './site.js';

siteChrome();
const main = document.getElementById('hall');
const date = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const UNIT = { 'heist-planner': 'job', 'crypt-of-crowns': 'crypt', 'crown-heist': 'floor', 'vault-of-stars': 'vault' };

/** One card per zone's Legends game: where it is, the clue, and how far you've got. */
function legendCards() {
  return legendZones().map((z) => {
    const g = gameById(z.legendGame), won = Legends.hasEgg(z.n);
    const lock = ZoneLock.progress(z.n), open = lock.played >= lock.need;
    const far = Store.maxLevel(g.id), played = Store.plays(g.id) > 0;
    const status = won ? `🥚 <b>${esc(eggName(z.n))} won!</b>`
      : !open ? `🔒 Opens when you've played every Zone ${z.n - 1} game (<b>${lock.played} of ${lock.need}</b> so far)`
      : played ? `Your furthest: <b>${UNIT[g.id] || 'level'} ${far}</b> of 15` : 'Unlocked — not played yet';
    return `
      <a class="lg-card${won ? ' won' : ''}${open ? '' : ' locked'}" href="../games/${g.id}/" style="--c:${g.color}">
        <div class="lg-art"><img src="../games/${g.id}/thumb.svg" alt="" width="96" height="96" loading="lazy"><span class="lg-egg">${eggSVG(z.n, { size: 34, won })}</span></div>
        <div class="lg-body">
          <span class="lg-zone">Zone ${z.n} · Game #${g.number} · ${esc(g.difficulty)}</span>
          <h3>${esc(g.title)}</h3>
          <p class="lg-lore">“${esc(g.legendLore || '')}”</p>
          <p class="lg-clue"><b>Clue:</b> ${esc(g.legendHow || `Finish ${g.title} without losing a life.`)}</p>
          <p class="lg-status">${status}</p>
        </div>
        <span class="lg-go">${open ? (played ? 'Play again ▶' : 'Play ▶') : 'Take a look →'}</span>
      </a>`;
  }).join('');
}

function locked() {
  const n = legendZones().length;
  main.innerHTML = `
    <section class="vault">
      <div class="vault-door" aria-hidden="true"><i></i><i></i><i></i></div>
      <h1>The Hall of Legends</h1>
      <p>This door opens for anyone who wins a <b>Golden Egg</b>. There are ${n} hidden in the arcade, one in each zone's Legends game. Few players ever find one.</p>
      <div class="vault-eggs" aria-hidden="true">${legendZones().map((z) => eggSVG(z.n, { size: 30, won: Legends.hasEgg(z.n) })).join('')}<span class="crown-ghost">👑</span></div>
    </section>

    <section class="legend-path">
      <h2>How to become a Legend</h2>
      <ol class="legend-steps">
        <li><b>Open the zones</b><span>Play every game in a zone at least once and the next zone unlocks.</span></li>
        <li><b>Find the Legends game</b><span>The 6th game in every zone is marked <span class="pill legend-pill">👑 LEGENDS</span> on the home page.</span></li>
        <li><b>Win its Golden Egg</b><span>Each one hides its egg in a different way. The clues are below, and perfection is usually the key.</span></li>
        <li><b>Collect the first ${crownZones().length}</b><span>The eggs of Zones 1–${crownZones().length} win the <b>Golden Crown</b>: the Crown Room, a golden arcade and a 👑 by your name on every leaderboard.${jewelZones().length ? ` Every egg after that adds a jewel to your crown.` : ''}</span></li>
      </ol>
    </section>

    <section class="legend-games">
      <h2>The ${n} Legends games</h2>
      <div class="lg-grid">${legendCards()}</div>
    </section>

    <section class="vault code-box">
      <h2>Already a Legend?</h2>
      <p class="small">Got a Legend code — from the Hall, or the one Crown Heist gives you? Enter it to bring back your eggs and your game progress on this phone or computer. Just the 6 letters and numbers is fine:</p>
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
  if (form.c.value) form.c.scrollIntoView({ block: 'center' });
  form.onsubmit = async (e) => {
    e.preventDefault();
    form.querySelector('button').disabled = true; msg.className = 'restore-msg'; msg.textContent = 'Checking…';
    try {
      const entry = await Legends.restore(form.c.value);
      if (entry.progressOnly) {
        msg.innerHTML = `Welcome back, <b>${esc(entry.name)}</b>! Your game progress (zones, levels, best scores, badges) is back. <a href="../">Back to the arcade →</a>`;
        return;
      }
      msg.textContent = entry.progress > 0 ? `Welcome back, ${entry.name}! Your eggs and your game progress (zones, levels, best scores, badges) are back.` : `Welcome back, ${entry.name}!`;
      setTimeout(() => location.reload(), entry.progress > 0 ? 2200 : 900);
    } catch (err) {
      msg.className = 'restore-msg err'; msg.textContent = err.message;
      form.querySelector('button').disabled = false;
    }
  };
}

/** "All 4 crown eggs + 1 jewel" for the crown stand. */
function crownLine() {
  const j = Legends.jewels().length, left = jewelZones().length - j;
  return `All ${crownZones().length} crown eggs${j ? ` + ${j} jewel${j > 1 ? 's' : ''}` : ''}!${left > 0 ? ` ${left} more jewel${left > 1 ? 's' : ''} to win.` : ''}`;
}

async function open() {
  const me = Legends.info();
  const unlocks = Legends.unlocks();
  main.innerHTML = `
    <section class="hall-head">
      <h1>🏛️ Hall of Legends</h1>
      <p>Only players who have won a Legends game's Golden Egg have found their way in here. Every zone's Legends game has one. The eggs of Zones 1–${crownZones().length} win the Golden Crown${jewelZones().length ? ', and every egg after that adds a jewel to it' : ''}. Welcome, ${esc(me.name || Store.name() || 'Legend')}.</p>
      <div class="egg-shelf">${legendZones().map((z) => {
        const won = Legends.hasEgg(z.n), lg = gameById(z.legendGame);
        return `<a class="egg-stand${won ? ' won' : ''}" href="../games/${lg.id}/">${eggSVG(z.n, { size: 70, won })}<b>${esc(eggName(z.n))}</b><small>${won ? 'Won! Golden characters unlocked in Zone ' + z.n + '.' : esc(lg.legendHow || `Finish ${lg.title} without losing a life.`)}</small><span class="stand-link">${esc(lg.title)} →</span></a>`;
      }).join('')}
        ${Legends.hasGoldenCrown()
          ? `<a class="egg-stand crown-stand won" href="../crown-room/">${crownSVG({ size: 110, cls: 'spin', jewels: Legends.jewels() })}<b>The Golden Crown</b><small>${crownLine()} Enter the Crown Room →</small></a>`
          : `<div class="egg-stand crown-stand"><span class="crown-ghost">👑</span><b>The Golden Crown</b><small>Win the eggs of Zones 1–${crownZones().length} to win it — and open the Crown Room.</small></div>`}
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
              <div><a href="../games/${u.id}/">${esc(u.title)}</a><small>${esc(u.gold)}${u.unlocked ? '' : ` · 🔒 needs ${ZONES.find((z) => z.n === u.zone)?.legendGame ? `the ${esc(eggName(u.zone))}${gameById(u.id)?.goldWithCrown ? ' or the Golden Crown' : ''}` : 'the Golden Crown'}`}</small></div>
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

import { CONFIG } from './config.js';
import { GAMES, GLOBAL_ACHIEVEMENTS, gameById, dailyGame } from './games.js';
import { Store } from './storage.js';
import { Scores } from './scores.js';
import { siteChrome, esc, fmt, ago, whatsappLink, WA_ICON } from './site.js';

siteChrome();

// ── WhatsApp share ──────────────────────────────────────────
const wa = document.getElementById('wa-share');
wa.href = whatsappLink(`🎮 Free quick games with levels, bonus rounds and high-score boards. Come and try to beat my scores! ${location.origin + location.pathname}`);
wa.innerHTML = `${WA_ICON} Share on WhatsApp`;

// ── Play now (random game) ──────────────────────────────────
document.getElementById('play-random').onclick = () => {
  // Prefer a game they haven't tried yet
  const fresh = GAMES.filter((g) => !Store.plays(g.id));
  const pool = fresh.length ? fresh : GAMES;
  const g = pool[Math.floor(Math.random() * pool.length)];
  location.href = `games/${g.id}/`;
};

// ── Daily challenge ─────────────────────────────────────────
const daily = dailyGame();
const dEl = document.getElementById('daily');
dEl.querySelector('[data-daily-title]').textContent = daily.title;
dEl.querySelector('[data-daily-link]').href = `games/${daily.id}/?daily=1`;
dEl.querySelector('[data-daily-img]').src = `games/${daily.id}/thumb.svg`;
const cd = dEl.querySelector('[data-countdown]');
function tickCountdown() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  cd.textContent = [s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');
}
tickCountdown(); setInterval(tickCountdown, 1000);
Scores.top(daily.id, 'today', 'daily', 1).then((r) => {
  dEl.querySelector('[data-daily-top]').innerHTML = r[0] ? `Leader: <b>${esc(r[0].name)}</b> — ${fmt(r[0].score)}` : 'No one has set a score yet — claim the top spot!';
}).catch(() => {});

// ── Continue where you left off ─────────────────────────────
const last = Store.last();
const lastGame = last && gameById(last.game);
if (lastGame) {
  const max = Store.maxLevel(lastGame.id);
  const cp = max > CONFIG.bonusEvery ? Math.floor((max - 1) / CONFIG.bonusEvery) * CONFIG.bonusEvery + 1 : 1;
  document.getElementById('continue').innerHTML = `
    <div class="continue">
      <img src="games/${lastGame.id}/thumb.svg" alt="">
      <div><b>Continue ${esc(lastGame.title)}</b><br><span class="muted small">Your best: ${fmt(Store.best(lastGame.id))}${cp > 1 ? ` · checkpoint: level ${cp}` : ''}</span></div>
      <a class="btn primary" href="games/${lastGame.id}/${cp > 1 ? `?start=${cp}` : ''}">▶ ${cp > 1 ? `Level ${cp}` : 'Play'}</a>
    </div>`;
}

// ── Game cards ──────────────────────────────────────────────
const grid = document.getElementById('grid');
grid.innerHTML = GAMES.map((g) => `
  <a class="game-card" href="games/${g.id}/" style="--c:${g.color}">
    <div class="thumb"><img src="games/${g.id}/thumb.svg" alt="" width="120" height="120" loading="lazy"></div>
    <span class="play-cta">PLAY ▶</span>
    <div class="body">
      <h3>${esc(g.title)} ${g.isNew ? '<span class="pill new">NEW</span>' : ''}</h3>
      <p>${esc(g.tagline)}</p>
      <div class="meta">
        <span>📈 ${esc(g.difficulty)}</span>
        <span>Your best: <b>${fmt(Store.best(g.id))}</b></span>
        <span data-top="${g.id}">Today's top: …</span>
      </div>
    </div>
  </a>`).join('') + `
  <div class="game-card soon"><div class="thumb" style="font-size:3em">🎲</div><div class="body"><h3>More coming soon</h3><p>New games are added regularly — check back!</p></div></div>`;

for (const g of GAMES) {
  Scores.top(g.id, 'today', 'normal', 1).then((r) => {
    const el = grid.querySelector(`[data-top="${g.id}"]`);
    el.innerHTML = r[0] ? `Today's top: <b>${esc(r[0].name)}</b> ${fmt(r[0].score)}` : 'Today\'s top: <b>up for grabs</b>';
  }).catch(() => { grid.querySelector(`[data-top="${g.id}"]`).textContent = ''; });
}

// ── Latest scores ticker ────────────────────────────────────
const ticker = document.getElementById('ticker');
async function loadTicker() {
  try {
    const rows = await Scores.recent(15);
    if (!rows.length) { ticker.innerHTML = '<span>No scores yet — be the first name on the board!</span>'; return; }
    ticker.innerHTML = rows.map((r) => `<span>🏆 <b>${esc(r.name)}</b> scored <b>${fmt(r.score)}</b> on ${esc(gameById(r.game)?.title || r.game)} · ${ago(r.at)}</span>`).join('');
  } catch { ticker.innerHTML = '<span>Leaderboard is offline right now.</span>'; }
}
loadTicker(); setInterval(loadTicker, 60000);

// ── Badges ──────────────────────────────────────────────────
const groups = [{ title: 'Arcade', list: GLOBAL_ACHIEVEMENTS, key: (a) => `g:${a.id}` }]
  .concat(GAMES.map((g) => ({ title: g.title, list: g.achievements || [], key: (a) => `${g.id}:${a.id}` })));
let got = 0, total = 0;
document.getElementById('badge-list').innerHTML = groups.map((grp) => `
  <div class="badge-group"><h3>${esc(grp.title)}</h3><div class="badge-grid">
    ${grp.list.map((a) => { const has = Store.hasAch(grp.key(a)); got += has; total++; return `<div class="badge${has ? ' got' : ''}" title="${esc(a.desc)}"><span class="ico">${a.icon}</span><span><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></span></div>`; }).join('')}
  </div></div>`).join('');
document.getElementById('badge-count').textContent = `${got} / ${total} unlocked`;

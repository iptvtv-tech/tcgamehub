import { CONFIG } from './config.js';
import { GAMES, gameById, dailyGame } from './games.js';
import { Store } from './storage.js';
import { Scores } from './scores.js';
import { siteChrome, esc, fmt, ago } from './site.js';

siteChrome();

const params = new URLSearchParams(location.search);
let game = gameById(params.get('game'))?.id || (params.get('period') === 'daily' ? dailyGame().id : GAMES[0].id);
let period = ['today', 'week', 'all', 'daily'].includes(params.get('period')) ? params.get('period') : 'today';

const gameTabs = document.getElementById('game-tabs');
gameTabs.innerHTML = GAMES.map((g) => `<button class="tab" role="tab" data-game="${g.id}" style="--c:${g.color}">${esc(g.title)}</button>`).join('');
gameTabs.onclick = (e) => { const b = e.target.closest('[data-game]'); if (b) { game = b.dataset.game; render(); } };
document.getElementById('period-tabs').onclick = (e) => { const b = e.target.closest('[data-period]'); if (b) { period = b.dataset.period; render(); } };

const board = document.getElementById('board');
const medal = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
let loadId = 0;

async function render() {
  document.querySelectorAll('[data-game]').forEach((b) => b.setAttribute('aria-selected', b.dataset.game === game));
  document.querySelectorAll('[data-period]').forEach((b) => b.setAttribute('aria-selected', b.dataset.period === period));
  history.replaceState(null, '', `?game=${game}&period=${period}`);
  const g = gameById(game);
  const isDaily = period === 'daily';
  const play = document.getElementById('play-btn');
  play.href = `../games/${game}/${isDaily ? '?daily=1' : ''}`;
  play.textContent = `▶ Play ${g.title}${isDaily ? ' (daily)' : ''}`;

  const id = ++loadId;
  board.innerHTML = `<div class="board-empty">Loading…</div>`;
  let rows;
  try { rows = await Scores.top(game, isDaily ? 'today' : period, isDaily ? 'daily' : 'normal', CONFIG.boardSize); }
  catch { if (id === loadId) board.innerHTML = `<div class="board-empty">The leaderboard is offline right now. Try again in a minute.</div>`; return; }
  if (id !== loadId) return;

  if (!rows.length) {
    board.innerHTML = `<div class="board-empty">No scores here yet.<br><br><a class="btn primary" href="${play.href}">Be the first →</a></div>`;
  } else {
    const me = Store.name().toLowerCase();
    board.innerHTML = `
      <table class="board">
        <thead><tr><th>Rank</th><th>Name</th><th class="num">Score</th><th class="num hide-sm">Level</th><th class="num hide-sm">When</th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr class="${me && r.name.toLowerCase() === me ? 'me' : ''}">
            <td>${medal(i)}</td><td>${esc(r.name)}</td>
            <td class="num score">${fmt(r.score)}</td>
            <td class="num hide-sm">${r.level ?? ''}</td>
            <td class="num hide-sm muted">${ago(r.at)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }
  const dg = dailyGame();
  document.getElementById('note').innerHTML = [
    isDaily && game !== dg.id ? `Today's daily challenge game is <a href="?game=${dg.id}&period=daily">${esc(dg.title)}</a>.` : '',
    period === 'today' || isDaily ? 'Daily boards reset at midnight UTC.' : '',
    'Each name appears once, with its best score.',
    Scores.online ? '' : '<br>⚠️ Online leaderboard not connected yet — these scores are saved in this browser only.',
  ].filter(Boolean).join(' ');
}

render();
setInterval(() => { if (!document.hidden) render(); }, 45000);

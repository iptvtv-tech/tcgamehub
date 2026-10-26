import { CONFIG } from './config.js';
import { GAMES, gameById, dailyGame } from './games.js';
import { Store } from './storage.js';
import { Scores } from './scores.js';
import { siteChrome, esc, fmt, ago } from './site.js';
import { Legends } from './legends.js';
import { Tokens } from './tokens.js';

siteChrome();

const params = new URLSearchParams(location.search);
let game = gameById(params.get('game'))?.id || (params.get('period') === 'daily' ? dailyGame().id : GAMES[0].id);
let period = ['today', 'week', 'all', 'daily'].includes(params.get('period')) ? params.get('period') : 'today';

const gameTabs = document.getElementById('game-tabs');
gameTabs.innerHTML = GAMES.map((g) => `<button class="tab" role="tab" data-game="${g.id}" style="--c:${g.color}">${esc(g.title)}</button>`).join('');
gameTabs.onclick = (e) => { const b = e.target.closest('[data-game]'); if (b) { game = b.dataset.game; showAll = false; render(); } };
document.getElementById('period-tabs').onclick = (e) => { const b = e.target.closest('[data-period]'); if (b) { period = b.dataset.period; showAll = false; render(); } };

const board = document.getElementById('board');
const medal = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
let loadId = 0;
const MAX_ROWS = 100;
let showAll = false;
const periodLabel = (p) => ({ today: 'today', week: 'this week', all: 'all time', daily: "today's daily challenge" }[p] || p);

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
  // up to 100 names per board (the server caps it at 100 too); the first 20 show, the rest behind "Show more"
  try { [rows] = await Promise.all([Scores.top(game, isDaily ? 'today' : period, isDaily ? 'daily' : 'normal', MAX_ROWS), Legends.crownNames().catch(() => null)]); }
  catch { if (id === loadId) board.innerHTML = `<div class="board-empty">The leaderboard is offline right now. Try again in a minute.</div>`; return; }
  if (id !== loadId) return;

  if (!rows.length) {
    board.innerHTML = `<div class="board-empty">No scores here yet.<br><br><a class="btn primary" href="${play.href}">Be the first →</a></div>`;
  } else {
    const me = Store.name().toLowerCase();
    const myIdx = me ? rows.findIndex((r) => r.name.toLowerCase() === me) : -1;
    const shown = Math.min(rows.length, showAll ? MAX_ROWS : CONFIG.boardSize);
    const row = (r, i, extra = '') => `
          <tr class="${i === myIdx ? 'me' : ''}${extra}">
            <th scope="row">${medal(i)}</th><td>${esc(r.name)}${Tokens.flairHTML(r.flair)}${Legends.crownMark(r.name)}</td>
            <td class="num score">${fmt(r.score)}</td>
            <td class="num hide-sm">${r.level ?? ''}</td>
            <td class="num hide-sm muted">${ago(r.at)}</td>
          </tr>`;
    // "my rank": your row is always on screen, pinned under the list when it's further down
    const pinned = myIdx >= shown ? `<tr class="gap" aria-hidden="true"><td colspan="5">⋯</td></tr>${row(rows[myIdx], myIdx, ' pinned')}` : '';
    const myNote = me && myIdx < 0
      ? `<p class="board-me muted small">${esc(Store.name())} isn't in the top ${rows.length < MAX_ROWS ? rows.length : MAX_ROWS} on this board yet.</p>` : '';
    board.innerHTML = `
      <table class="board">
        <caption class="visually-hidden">${esc(g.title)} leaderboard, ${esc(periodLabel(isDaily ? 'daily' : period))}</caption>
        <thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col" class="num">Score</th><th scope="col" class="num hide-sm">Level</th><th scope="col" class="num hide-sm">When</th></tr></thead>
        <tbody>${rows.slice(0, shown).map((r, i) => row(r, i)).join('')}${pinned}
        </tbody>
      </table>
      ${rows.length > shown ? `<p class="board-more"><button class="btn" type="button" data-more>Show all ${rows.length}</button></p>` : ''}
      ${myNote}`;
    board.querySelector('[data-more]')?.addEventListener('click', () => { showAll = true; render(); });
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

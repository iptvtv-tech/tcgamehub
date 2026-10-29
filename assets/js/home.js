import { CONFIG } from './config.js';
import { GAMES, GLOBAL_ACHIEVEMENTS, ZONES, SLOTS, gameById, dailyGame, legendZones, crownZones, jewelZones, crownEggsText } from './games.js';
import { Store } from './storage.js';
import { Scores } from './scores.js';
import { Legends } from './legends.js';
import { eggSVG, eggName } from './eggs.js';
import { ZoneLock } from './zones.js';
import { siteChrome, esc, fmt, ago, whatsappLink, WA_ICON } from './site.js';
import { Tokens } from './tokens.js';

siteChrome();

// ── WhatsApp share ──────────────────────────────────────────
const wa = document.getElementById('wa-share');
wa.href = whatsappLink(`🎮 Free quick games with levels, bonus rounds and high-score boards. Come and try to beat my scores! ${location.origin + location.pathname}?from=wa`);
wa.innerHTML = `${WA_ICON} Share on WhatsApp`;

// ── Play now (random game) ──────────────────────────────────
// "Play now" goes to the next game in zone order the player hasn't tried (the first
// game for a new visitor). Once everything has been played, the game they played last.
{
  const next = SLOTS.find((sl) => sl.game && !Store.plays(sl.game.id))?.game || gameById(Store.last()?.game) || GAMES[0];
  const a = document.getElementById('play-next');
  a.href = `games/${next.id}/`;
  a.textContent = Store.plays(next.id) ? `▶ Play ${next.title}` : `▶ Play now: ${next.title}`;
}

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
{
  const { streak, best, today } = Store.dailyStreak();
  const el = document.createElement('div');
  el.className = 'daily-streak';
  el.innerHTML = streak
    ? `🔥 <b>${streak}-day streak</b> ${today ? '— done for today ✓' : '— play today to keep it going!'}`
    : `🔥 Play daily to build a streak${best ? ` <span class="muted">(best: ${best})</span>` : ''}`;
  dEl.querySelector('[data-daily-top]').after(el);
}
Promise.all([Scores.top(daily.id, 'today', 'daily', 1), Legends.crownNames().catch(() => null)]).then(([r]) => {
  dEl.querySelector('[data-daily-top]').innerHTML = r[0] ? `Leader: <b>${esc(r[0].name)}</b>${Tokens.flairHTML(r[0].flair)}${Legends.crownMark(r[0].name)} — ${fmt(r[0].score)}` : 'No one has set a score yet — claim the top spot!';
}).catch(() => {});

// ── Your arcade: avatar, tokens, shop ───────────────────────
{
  const you = document.getElementById('you');
  const bal = Tokens.balance(), left = Tokens.leftToday();
  you.innerHTML = `${Tokens.avatarHTML('big')}<div><b>${Store.name() ? esc(Store.name()) : 'Your arcade'}</b><br><span class="muted small">${Tokens.fmt(bal)} · ${left ? `earn up to ${left} more today` : 'daily cap reached'} · every level, badge and best score pays tokens</span></div><a class="btn" href="shop/">🪙 Token Shop</a>`;
}

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

// ── Game cards, grouped by zone ─────────────────────────────
// The zones and cards are static HTML (written by tools/build-pages.mjs from
// games.js, so search engines and no-JS visitors see every game). Here we only
// add what depends on this player: zone locks, played ticks, best scores,
// egg status and today's top score.
Legends.syncCrowns();
const grid = document.getElementById('grid');
// Which zone bar opens: the first zone this player hasn't finished (or the last zone
// once everything is done). A zone the player opened or closed by hand this visit
// is left alone on later renders.
const yourZone = ZONES.find((z) => { const p = ZoneLock.progress(z.n); return p.played < p.need; })?.n || ZONES[ZONES.length - 1].n;
for (const z of ZONES) {
  const zoneEl = grid.querySelector(`.zone[data-zone="${z.n}"]`);
  if (!zoneEl) continue;
  const crown = Legends.hasCrown(z.n);
  const lock = ZoneLock.progress(z.n), open = lock.played >= lock.need;
  const lg = z.legendGame && gameById(z.legendGame);
  if (zoneEl.tagName === 'DETAILS') zoneEl.open = z.n === yourZone;
  const count = zoneEl.querySelector('[data-progress]');
  if (count) {
    count.textContent = open ? `✅ ${lock.need}/${lock.need}` : lock.played ? `${lock.played}/${lock.need}` : '';
    count.title = open ? 'Zone complete' : `${lock.played} of ${lock.need} games played`;
    count.classList.toggle('done', open);
  }
  const egg = zoneEl.querySelector('[data-egg]');
  if (egg && z.legendGame) {
    egg.className = `crown ${crown ? 'won' : ''}`;
    egg.title = crown ? `You won the ${eggName(z.n)}!` : `${lg?.legendHow || `Finish ${lg ? lg.title : 'the Legends game'} without losing a life.`} Wins the ${eggName(z.n)}.`;
    egg.innerHTML = crown ? `${eggSVG(z.n, { size: 16 })}<span class="crown-txt"> Egg won</span>` : '🥚<span class="crown-txt"> Egg: not yet</span>';
  }
  const lockEl = zoneEl.querySelector('[data-lock]');
  if (lockEl && lock.played > 0) lockEl.innerHTML = open
    ? `<div class="zone-progress done">✅ <b>Zone ${z.n} complete</b> — you've played all ${lock.need} games.</div>`
    : `<div class="zone-progress">🎯 <b>${lock.played} / ${lock.need}</b> games played in this zone <span class="lock-meter"><i style="width:${Math.round(lock.played / lock.need * 100)}%"></i></span> <span class="muted small">play them all to complete the zone</span></div>`;
  for (const cardEl of zoneEl.querySelectorAll('.game-card[data-game]')) {
    const id = cardEl.dataset.game;
    if (Store.plays(id) > 0) cardEl.insertAdjacentHTML('afterbegin', '<span class="played-badge">✓ Played</span>');
    const best = cardEl.querySelector('[data-best]');
    if (best) { best.querySelector('b').textContent = fmt(Store.best(id)); best.hidden = false; }
    const top = cardEl.querySelector('[data-top]');
    if (top) top.textContent = 'Today\'s top: …';
  }
}

// A link to /#zone-3 (breadcrumbs on game pages) opens that zone.
function openHashZone() {
  const m = /^#zone-(\d+)$/.exec(location.hash);
  const el = m && grid.querySelector(`.zone[data-zone="${m[1]}"]`);
  if (el) { el.open = true; el.scrollIntoView({ block: 'start' }); }
}
openHashZone(); addEventListener('hashchange', openHashZone);

const crowns = Legends.crownNames().catch(() => null);
for (const g of GAMES) {
  const el = grid.querySelector(`[data-top="${g.id}"]`);
  if (!el) continue;
  Promise.all([Scores.top(g.id, 'today', 'normal', 1), crowns]).then(([r]) => {
    el.innerHTML = r[0] ? `Today's top: <b>${esc(r[0].name)}</b>${Tokens.flairHTML(r[0].flair)}${Legends.crownMark(r[0].name)} ${fmt(r[0].score)}` : 'Today\'s top: <b>up for grabs</b>';
  }).catch(() => { el.textContent = ''; });
}

// ── Latest scores ticker ────────────────────────────────────
const ticker = document.getElementById('ticker');
async function loadTicker() {
  try {
    const rows = await Scores.recent(15);
    await crowns;
    if (!rows.length) { ticker.innerHTML = '<span>No scores yet — be the first name on the board!</span>'; return; }
    ticker.innerHTML = rows.map((r) => `<span>🏆 <b>${esc(r.name)}</b>${Tokens.flairHTML(r.flair)}${Legends.crownMark(r.name)} scored <b>${fmt(r.score)}</b> on ${esc(gameById(r.game)?.title || r.game)} · ${ago(r.at)}</span>`).join('');
  } catch { ticker.innerHTML = '<span>Leaderboard is offline right now.</span>'; }
}
loadTicker(); setInterval(loadTicker, 60000);

// ── Prizes strip ────────────────────────────────────────────
{
  const goldCount = GAMES.filter((g) => g.gold && Legends.goldUnlocked(g.id)).length;
  const crowned = Legends.hasGoldenCrown();
  const eggCards = legendZones().map((z) => {
    const g = gameById(z.legendGame), won = Legends.hasEgg(z.n);
    return `<a class="prize${won ? ' won' : ''}" href="games/${g.id}/" style="--c:${g.color}">
      <span class="prize-art">${eggSVG(z.n, { size: 52, won })}</span>
      <b>${esc(eggName(z.n))}</b>
      <span class="muted small">${won ? 'Won ✓' : `Hidden in ${esc(g.title)}`}</span>
      <span class="prize-how">${won ? `Golden characters on in Zone ${z.n}` : esc(g.legendHow || 'Finish it without losing a life.')}</span>
    </a>`;
  }).join('');
  const crownCard = `<a class="prize crown-prize${crowned ? ' won' : ''}" href="${crowned ? 'crown-room/' : 'hall-of-legends/'}">
      <span class="prize-art">👑</span>
      <b>The Golden Crown</b>
      <span class="muted small">${crowned ? 'Yours ✓' : `${Legends.eggs().filter((n) => n <= crownZones().length).length} of ${crownZones().length} eggs`}</span>
      <span class="prize-how">${crowned ? 'Golden theme, 👑 on the boards, the Crown Room' : `Win ${crownEggsText()} for the golden theme, a 👑 by your name and the Crown Room`}</span>
    </a>`;
  const goldCard = `<a class="prize gold-prize${goldCount ? ' won' : ''}" href="hall-of-legends/">
      <span class="prize-art">✨</span>
      <b>Golden characters</b>
      <span class="muted small">${goldCount} of ${GAMES.filter((g) => g.gold).length} unlocked</span>
      <span class="prize-how">Every game has one — a golden snake, car, ship, thief… switched on from the game's menu once you hold its zone's egg</span>
    </a>`;
  document.getElementById('prize-grid').innerHTML = eggCards + crownCard + goldCard;
}

// ── Badges: a short strip (the full list is /badges/) ─────────────
{
  const all = [
    ...GLOBAL_ACHIEVEMENTS.map((a) => ({ a, key: `g:${a.id}` })),
    ...GAMES.flatMap((g) => (g.achievements || []).map((a) => ({ a, key: `${g.id}:${a.id}`, game: g }))),
  ];
  const got = all.filter((x) => Store.hasAch(x.key));
  const recent = got.slice(-8).reverse();
  const next = all.filter((x) => !Store.hasAch(x.key) && !x.a.secret && !x.a.legendary).slice(0, recent.length ? 4 : 6);
  const badge = ({ a, game }, has) => `<div class="badge${has ? ' got' : ''}${a.legendary ? ' legendary' : ''}" title="${esc(a.desc)}${game ? ` — ${esc(game.title)}` : ''}"><span class="ico">${a.icon}</span><span><b>${esc(a.title)}</b><small>${esc(game ? game.title : a.desc)}</small></span></div>`;
  document.getElementById('badge-list').innerHTML =
    (recent.length ? `<div class="badge-grid">${recent.map((x) => badge(x, true)).join('')}</div>` : '') +
    (next.length ? `<p class="muted small" style="margin:${recent.length ? 12 : 0}px 0 6px">${recent.length ? 'Up next' : 'Easy ones to start with'}</p><div class="badge-grid">${next.map((x) => badge(x, false)).join('')}</div>` : '');
  document.getElementById('badge-count').textContent = `${got.length} / ${all.length} unlocked`;
}

// ── Legend banner ───────────────────────────────────────────
if (Legends.isLegend()) {
  const el = document.createElement('div');
  el.className = 'legend-banner';
  const crowned = Legends.hasGoldenCrown(), cz = crownZones();
  const short = (n) => eggName(n).replace('Golden ', '');
  const crownMissing = cz.filter((z) => !Legends.hasEgg(z.n)).map((z) => short(z.n));   // a crown won under the old 4-egg rule
  const held = Legends.eggs().filter((n) => n <= cz.length).length;
  el.innerHTML = `<span class="banner-eggs">${Legends.eggs().map((n) => eggSVG(n, { size: 26 })).join('')}</span><div><b>${crowned ? '👑 You hold the Golden Crown.' : 'You are a Legend.'}</b><br><span class="muted small">${crowned ? `The Crown Room is yours — and so is the golden arcade.${crownMissing.length ? ` The ${crownMissing.join(' & ')} is still out there.` : ''}${jewelZones().length > Legends.jewels().length ? ` ${jewelZones().length - Legends.jewels().length === 1 ? 'One jewel' : `${jewelZones().length - Legends.jewels().length} jewels`} still to win for your crown.` : ''}` : `Golden Eggs: ${Legends.eggs().map(short).join(', ').replace(/, ([^,]*)$/, ' & $1')} (${held} of ${cz.length}). Win ${crownEggsText()} for the Golden Crown.`} Your golden characters are on in those zones' games — switch them from each game's menu.</span></div><span class="banner-btns">${crowned ? '<a class="btn gold-btn" href="crown-room/">👑 Crown Room</a>' : ''}<a class="btn" href="hall-of-legends/">🏛️ Hall of Legends</a></span>`;
  document.getElementById('games').before(el);
} else {
  // Not a Legend yet: show where the eggs are hidden, right above the games.
  const el = document.createElement('a');
  el.className = 'legend-banner hall-door';
  el.href = 'hall-of-legends/';
  const n = legendZones().length;
  el.innerHTML = `<span class="banner-eggs">${legendZones().map((z) => eggSVG(z.n, { size: 26, won: false })).join('')}</span><div><b>${n} Golden Eggs are hidden in this arcade</b><br><span class="muted small">Each zone's 6th game, marked 👑 LEGENDS, holds one. Win an egg to enter the Hall of Legends. Win ${crownEggsText()} for the Golden Crown${jewelZones().length ? ', and every egg after that adds a jewel to it' : ''}.</span></div><span class="btn">🏛️ How to become a Legend</span>`;
  document.getElementById('games').before(el);
}

// ── Zone complete celebration ───────────────────────────────
// On first home-page load after every game of a zone has been played, fire confetti.
(function checkZoneUnlocks() {
  const KEY = 'arcade:zone-done';
  let seen;
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { seen = {}; }
  const newly = [];
  for (const z of ZONES) {
    if (ZoneLock.complete(z.n) && !seen[z.n]) newly.push(z);
  }
  if (!newly.length) return;
  // Mark them all seen before firing so a refresh doesn't repeat
  for (const z of newly) seen[z.n] = 1;
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* ignore */ }
  // Build overlay
  const zone = newly[newly.length - 1]; // celebrate the highest newly-opened zone
  const ov = document.createElement('div');
  ov.className = 'zone-unlock-overlay';
  ov.innerHTML = `
    <div class="zone-unlock-panel">
      <div class="zone-unlock-burst" aria-hidden="true"></div>
      <p class="zone-unlock-emoji">🏁</p>
      <h2>Zone ${zone.n} Complete!</h2>
      <p class="zone-unlock-name">${esc(zone.name)}</p>
      <p class="zone-unlock-sub">You've played every game in it.${ZONES.find((x) => x.n === zone.n + 1) ? ` Zone ${zone.n + 1} is up next.` : ''}</p>
      <button class="btn primary zone-unlock-btn">Nice ▶</button>
    </div>`;
  document.body.appendChild(ov);
  // Canvas confetti
  const c = document.createElement('canvas');
  c.className = 'confetti-canvas';
  ov.prepend(c);
  c.width = window.innerWidth; c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  const COLORS = ['#fbbf24','#34d399','#60a5fa','#f472b6','#a78bfa','#fb923c'];
  const bits = Array.from({ length: 80 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * 200,
    vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 3,
    r: 5 + Math.random() * 6, spin: (Math.random() - .5) * .2,
    angle: Math.random() * Math.PI * 2, col: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  let raf;
  function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.vy += .06; b.angle += b.spin;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = b.col; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r);
      ctx.restore();
    }
    if (bits.some((b) => b.y < c.height + 40)) raf = requestAnimationFrame(draw);
  }
  draw();
  const dismiss = () => { cancelAnimationFrame(raf); ov.remove(); };
  ov.querySelector('.zone-unlock-btn').addEventListener('click', dismiss);
  ov.addEventListener('click', (e) => { if (e.target === ov) dismiss(); });
  setTimeout(dismiss, 7000);
})();

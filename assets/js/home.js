import { CONFIG } from './config.js';
import { GAMES, GLOBAL_ACHIEVEMENTS, ZONES, SLOTS, gameById, dailyGame, legendZones, crownZones, jewelZones } from './games.js';
import { Store } from './storage.js';
import { Scores } from './scores.js';
import { Legends } from './legends.js';
import { eggSVG, eggName } from './eggs.js';
import { ZoneLock } from './zones.js';
import { siteChrome, esc, fmt, ago, whatsappLink, WA_ICON } from './site.js';

siteChrome();

// ── WhatsApp share ──────────────────────────────────────────
const wa = document.getElementById('wa-share');
wa.href = whatsappLink(`🎮 Free quick games with levels, bonus rounds and high-score boards. Come and try to beat my scores! ${location.origin + location.pathname}`);
wa.innerHTML = `${WA_ICON} Share on WhatsApp`;

// ── Play now (random game) ──────────────────────────────────
document.getElementById('play-random').onclick = () => {
  // Prefer a game they haven't tried yet
  const open = GAMES.filter((g) => ZoneLock.gameOpen(g.id));
  const fresh = open.filter((g) => !Store.plays(g.id));
  const pool = fresh.length ? fresh : open;
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
  dEl.querySelector('[data-daily-top]').innerHTML = r[0] ? `Leader: <b>${esc(r[0].name)}</b>${Legends.crownMark(r[0].name)} — ${fmt(r[0].score)}` : 'No one has set a score yet — claim the top spot!';
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

// ── Game cards, grouped by zone ─────────────────────────────
const tierBar = (sl) => `<span class="tier" style="--t:${sl.tier.color}" title="Difficulty ${sl.n} of ${SLOTS.length}">
  <i><u style="width:${Math.round(sl.n / SLOTS.length * 100)}%"></u></i><b>${esc(sl.tier.label)}</b></span>`;
const card = (sl) => {
  const g = sl.game;
  if (!g) return `
    <div class="game-card soon${sl.legendSlot ? ' legend-slot' : ''}" style="--c:${sl.tier.color}">
      <div class="thumb"><span class="num">#${sl.n}</span><span style="font-size:3em">${sl.legendSlot ? '👑' : '🔒'}</span></div>
      <div class="body"><h3>${sl.legendSlot ? 'Legends game' : `Game ${sl.n}`}</h3>
        <p>${sl.legendSlot ? `Zone ${sl.zone.n}'s Legends game is on its way. Win it perfectly to earn the ${eggName(sl.zone.n)}.` : 'A new game is being built for this slot — check back soon!'}</p>
        <div class="meta">${tierBar(sl)}<span>Coming soon</span></div></div>
    </div>`;
  const locked = !ZoneLock.isOpen(sl.zone.n);
  const played = !locked && Store.plays(g.id) > 0;
  return `
    <a class="game-card${sl.legendSlot ? ' legend-slot' : ''}${locked ? ' zone-locked' : ''}" href="games/${g.id}/" style="--c:${g.color}">
      ${locked ? '<span class="lock-badge">🔒 Locked</span>' : ''}
      ${played ? '<span class="played-badge">✓ Played</span>' : ''}
      <div class="thumb"><span class="num">#${sl.n}</span><img src="games/${g.id}/thumb.svg" alt="" width="120" height="120" loading="lazy">${g.is3d ? '<span class="chip3d" title="Built with a 3D engine">3D</span>' : ''}</div>
      <span class="play-cta">PLAY ▶</span>
      <div class="body">
        <h3>${esc(g.title)} ${g.isNew ? '<span class="pill new">NEW</span>' : ''}${sl.legendSlot ? '<span class="pill legend-pill">👑 LEGENDS</span>' : ''}</h3>
        <p>${esc(g.tagline)}</p>
        <div class="meta">
          ${tierBar(sl)}
          <span>Your best: <b>${fmt(Store.best(g.id))}</b></span>
          <span data-top="${g.id}">Today's top: …</span>
        </div>
      </div>
    </a>`;
};
Legends.syncCrowns();
const grid = document.getElementById('grid');
grid.className = 'zones';
grid.innerHTML = ZONES.map((z) => {
  const crown = Legends.hasCrown(z.n);
  const lock = ZoneLock.progress(z.n), open = lock.played >= lock.need;
  const lg = z.legendGame && gameById(z.legendGame);
  return `
  <div class="zone zone-${z.n}">
    <div class="zone-head">
      <h3>${esc(z.name)}</h3>
      <span class="muted small">${esc(z.blurb)}</span>
      ${z.legendGame ? `<span class="crown ${crown ? 'won' : ''}" title="${crown ? `You won the ${eggName(z.n)}!` : `${lg?.legendHow || `Finish ${lg ? lg.title : 'the Legends game'} without losing a life.`} Wins the ${eggName(z.n)}.`}">${crown ? `${eggSVG(z.n, { size: 16 })} Egg won` : '🥚 Egg: not yet'}</span>` : ''}
    </div>
    ${open ? '' : `<div class="zone-lock">🔒 <b>Zone ${z.n} is locked.</b> Play every Zone ${z.n - 1} game at least once to open it <span class="lock-meter"><i style="width:${Math.round(lock.played / lock.need * 100)}%"></i></span> <b>${lock.played} / ${lock.need}</b></div>`}
    <div class="game-grid">${SLOTS.filter((sl) => sl.zone === z).map(card).join('')}</div>
  </div>`;
}).join('');

const crowns = Legends.crownNames().catch(() => null);
for (const g of GAMES) {
  Promise.all([Scores.top(g.id, 'today', 'normal', 1), crowns]).then(([r]) => {
    const el = grid.querySelector(`[data-top="${g.id}"]`);
    el.innerHTML = r[0] ? `Today's top: <b>${esc(r[0].name)}</b>${Legends.crownMark(r[0].name)} ${fmt(r[0].score)}` : 'Today\'s top: <b>up for grabs</b>';
  }).catch(() => { grid.querySelector(`[data-top="${g.id}"]`).textContent = ''; });
}

// ── Latest scores ticker ────────────────────────────────────
const ticker = document.getElementById('ticker');
async function loadTicker() {
  try {
    const rows = await Scores.recent(15);
    await crowns;
    if (!rows.length) { ticker.innerHTML = '<span>No scores yet — be the first name on the board!</span>'; return; }
    ticker.innerHTML = rows.map((r) => `<span>🏆 <b>${esc(r.name)}</b>${Legends.crownMark(r.name)} scored <b>${fmt(r.score)}</b> on ${esc(gameById(r.game)?.title || r.game)} · ${ago(r.at)}</span>`).join('');
  } catch { ticker.innerHTML = '<span>Leaderboard is offline right now.</span>'; }
}
loadTicker(); setInterval(loadTicker, 60000);

// ── Badges ──────────────────────────────────────────────────
// Legendary badges get their own gold group at the top; secret ones stay hidden until earned.
const legendary = [
  ...GLOBAL_ACHIEVEMENTS.filter((a) => a.legendary).map((a) => ({ a, key: `g:${a.id}` })),
  ...GAMES.flatMap((g) => (g.achievements || []).filter((a) => a.legendary).map((a) => ({ a, key: `${g.id}:${a.id}` }))),
];
const groups = [{ title: '👑 Legendary', cls: 'legendary', items: legendary }]
  .concat([{ title: 'Arcade', items: GLOBAL_ACHIEVEMENTS.filter((a) => !a.legendary).map((a) => ({ a, key: `g:${a.id}` })) }])
  .concat(GAMES.map((g) => ({ title: g.title, items: (g.achievements || []).filter((a) => !a.legendary).map((a) => ({ a, key: `${g.id}:${a.id}` })) })));
let got = 0, total = 0;
document.getElementById('badge-list').innerHTML = groups.filter((grp) => grp.items.length).map((grp) => `
  <div class="badge-group ${grp.cls || ''}"><h3>${esc(grp.title)}</h3><div class="badge-grid">
    ${grp.items.map(({ a, key }) => {
      const has = Store.hasAch(key); got += has; total++;
      const hidden = a.secret && !has;
      const title = hidden ? '???' : a.title, desc = hidden ? 'A secret. Keep playing…' : a.desc;
      return `<div class="badge${has ? ' got' : ''}${a.legendary ? ' legendary' : ''}${hidden ? ' secret' : ''}" title="${esc(desc)}"><span class="ico">${hidden ? '🔒' : a.icon}</span><span><b>${esc(title)}</b><small>${esc(desc)}</small></span></div>`;
    }).join('')}
  </div></div>`).join('');
document.getElementById('badge-count').textContent = `${got} / ${total} unlocked`;

// ── Legend banner ───────────────────────────────────────────
if (Legends.isLegend()) {
  const el = document.createElement('div');
  el.className = 'legend-banner';
  const crowned = Legends.hasGoldenCrown();
  el.innerHTML = `<span class="banner-eggs">${Legends.eggs().map((n) => eggSVG(n, { size: 26 })).join('')}</span><div><b>${crowned ? '👑 You hold the Golden Crown.' : 'You are a Legend.'}</b><br><span class="muted small">${crowned ? `The Crown Room is yours — and so is the golden arcade.${jewelZones().length > Legends.jewels().length ? ` ${jewelZones().length - Legends.jewels().length === 1 ? 'One jewel' : `${jewelZones().length - Legends.jewels().length} jewels`} still to win for your crown.` : ''}` : `Golden Eggs: ${Legends.eggs().map((n) => eggName(n).replace('Golden ', '')).join(' & ')}. Win the eggs of Zones 1–${crownZones().length} for the Golden Crown.`} Your golden characters are on in those zones' games — switch them from each game's menu.</span></div><span class="banner-btns">${crowned ? '<a class="btn gold-btn" href="crown-room/">👑 Crown Room</a>' : ''}<a class="btn" href="hall-of-legends/">🏛️ Hall of Legends</a></span>`;
  document.getElementById('games').before(el);
} else {
  // Not a Legend yet: show where the eggs are hidden, right above the games.
  const el = document.createElement('a');
  el.className = 'legend-banner hall-door';
  el.href = 'hall-of-legends/';
  const n = legendZones().length;
  el.innerHTML = `<span class="banner-eggs">${legendZones().map((z) => eggSVG(z.n, { size: 26, won: false })).join('')}</span><div><b>${n} Golden Eggs are hidden in this arcade</b><br><span class="muted small">Each zone's 6th game, marked 👑 LEGENDS, holds one. Win an egg to enter the Hall of Legends. The eggs of Zones 1–${crownZones().length} win the Golden Crown${jewelZones().length ? ', and every egg after that adds a jewel to it' : ''}.</span></div><span class="btn">🏛️ How to become a Legend</span>`;
  document.getElementById('games').before(el);
}

// ── Zone unlock celebration ─────────────────────────────────
// On first home-page load after a zone is newly unlocked, fire confetti.
(function checkZoneUnlocks() {
  const KEY = 'arcade:zone-seen';
  let seen;
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { seen = {}; }
  const newly = [];
  for (const z of ZONES) {
    if (z.n === 1) continue; // Zone 1 always open
    if (ZoneLock.isOpen(z.n) && !seen[z.n]) newly.push(z);
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
      <p class="zone-unlock-emoji">🔓</p>
      <h2>Zone ${zone.n} Unlocked!</h2>
      <p class="zone-unlock-name">${esc(zone.name)}</p>
      <p class="zone-unlock-sub">You played every Zone ${zone.n - 1} game. ${zone.n <= 2 ? '2D arcade' : '3D worlds'} await.</p>
      <button class="btn primary zone-unlock-btn">Let's go ▶</button>
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

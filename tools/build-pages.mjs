#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  build-pages.mjs — writes the static, crawlable parts of the site from
//  assets/js/games.js (+ assets/js/game-copy.js). Run it by hand before a
//  push, like the level checkers. The site itself still has no build step:
//  everything this writes is committed.
//
//    node tools/build-pages.mjs            # home grid, footers, game pages, genre pages, sitemap
//    node tools/build-pages.mjs --images   # …and the 1200×630 share cards (needs playwright)
//    node tools/build-pages.mjs --check    # exit 1 if anything would change (CI / pre-push)
//
//  What it writes:
//    index.html                 the block between <!-- build:grid --> … <!-- /build:grid -->
//                               and <!-- build:schema --> … <!-- /build:schema -->
//    every page with            <!-- build:footer --> … <!-- /build:footer -->   (site map footer)
//    games/<id>/index.html      the whole file (head, share card, "about this game" section)
//    games/<id>/og.jpg          share card (only with --images)
//    games/index.html           all games by genre
//    games/<genre>/index.html   one page per genre with 2+ games
//    sitemap.xml                with <lastmod> from git
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://tcgamehub.win/';
const SITE_NAME = 'Quick Play Arcade';
const PUBLISHER = 'TC Game Hub';
const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const IMAGES = args.has('--images');

const { GAMES, ZONES, SLOTS, GENRES, GLOBAL_ACHIEVEMENTS, genreById } = await import(pathToFileURL(join(ROOT, 'assets/js/games.js')).href);
const { COPY } = await import(pathToFileURL(join(ROOT, 'assets/js/game-copy.js')).href);

// ── helpers ──────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const slotOf = (g) => SLOTS.find((sl) => sl.game && sl.game.id === (g.id || g));
const copyOf = (g) => {
  const c = COPY[g.id];
  if (!c) console.warn(`! no entry in assets/js/game-copy.js for ${g.id} — using the tagline`);
  return c || { kind: 'browser game', blurb: g.tagline, how: [] };
};
const genresOf = (g) => {
  const list = (g.genres || []).map(genreById).filter(Boolean);
  if (g.is3d) list.push({ id: '3d', label: '3D' });
  if (g.legend) list.push({ id: 'legends', label: '👑 Legends' });
  return list;
};
const genreCount = (id) => GAMES.filter((g) => genresOf(g).some((x) => x.id === id)).length;
const genrePages = () => [
  ...GENRES.filter((ge) => genreCount(ge.id) >= 2),
  { id: '3d', label: '3D games', blurb: 'Every game built on one of the site\'s 3D engines: raycast crypts, pseudo-3D racers and full WebGL worlds. They all run in the browser with nothing to install.' },
  { id: 'legends', label: 'Legends games', blurb: 'The sixth game of every zone hides a Golden Egg. Finish it from level 1 without losing a life to open its secret final level — win all four eggs of Zones 1–4 for the Golden Crown.' },
];
const hasGenrePage = (id) => genrePages().some((ge) => ge.id === id);
const genreHref = (rel, id) => `${rel}games/${hasGenrePage(id) ? id + '/' : ''}`;
const pageTitle = (g) => `${g.title} – free online ${copyOf(g).kind} | ${SITE_NAME}`;
const difficultyText = (sl) => `${sl.tier.label} · Zone ${sl.zone.n}`;
let changed = 0;
function out(file, content) {
  const path = join(ROOT, file);
  const old = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (old === content) return;
  changed++;
  if (CHECK) { console.log(`would change: ${file}`); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${file}`);
}
function replaceBlock(file, name, html) {
  const path = join(ROOT, file);
  const src = readFileSync(path, 'utf8');
  const open = `<!-- build:${name} -->`, close = `<!-- /build:${name} -->`;
  const a = src.indexOf(open), b = src.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`${file}: missing ${open} … ${close}`);
  const inline = !html.includes('\n') && html.length < 40;
  const next = src.slice(0, a + open.length) + (inline ? html.trim() : '\n' + html.trim() + '\n') + src.slice(b);
  out(file, next);
}
const lastmod = (file) => {
  try {
    const d = execSync(`git log -1 --format=%cI -- "${file}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (d) return d.slice(0, 10);
  } catch { /* not a git checkout */ }
  return new Date().toISOString().slice(0, 10);
};

// ── shared markup ────────────────────────────────────────────
const tierBar = (sl) => `<span class="tier" style="--t:${sl.tier.color}" title="Difficulty ${sl.n} of ${SLOTS.length}"><i><u style="width:${Math.round(sl.n / SLOTS.length * 100)}%"></u></i><b>${esc(sl.tier.label)}</b></span>`;
const genrePills = (g, rel) => genresOf(g).filter((x) => x.id !== 'legends').map((x) => `<a class="pill genre" href="${genreHref(rel, x.id)}">${esc(x.label)}</a>`).join(' ');

/** A game card. `home: true` adds the live slots home.js fills (best / today's top / badges). */
function card(sl, rel, { home = false } = {}) {
  const g = sl.game;
  if (!g) return `
      <div class="game-card soon${sl.legendSlot ? ' legend-slot' : ''}" style="--c:${sl.tier.color}">
        <div class="thumb"><span class="num">#${sl.n}</span><span style="font-size:3em" aria-hidden="true">${sl.legendSlot ? '👑' : '🔒'}</span></div>
        <div class="body"><h3>${sl.legendSlot ? 'Legends game' : `Game ${sl.n}`}</h3>
          <p>${sl.legendSlot ? `Zone ${sl.zone.n}'s Legends game is on its way.` : 'A new game is being built for this slot — check back soon!'}</p>
          <div class="meta">${tierBar(sl)}<span>Coming soon</span></div></div>
      </div>`;
  return `
      <a class="game-card${sl.legendSlot ? ' legend-slot' : ''}" href="${rel}games/${g.id}/" style="--c:${g.color}" data-game="${g.id}" data-zone="${sl.zone.n}" data-tier="${sl.tier.id}" data-genres="${genresOf(g).map((x) => x.id).join(' ')}" data-q="${esc((g.title + ' ' + g.tagline).toLowerCase())}">
        <div class="thumb"><span class="num">#${sl.n}</span><img src="${rel}games/${g.id}/thumb.svg" alt="" width="120" height="120" loading="lazy">${g.is3d ? '<span class="chip3d" title="Built with a 3D engine">3D</span>' : ''}</div>
        <span class="play-cta">PLAY ▶</span>
        <div class="body">
          <h3>${esc(g.title)}${g.isNew ? ' <span class="pill new">NEW</span>' : ''}${sl.legendSlot ? ' <span class="pill legend-pill">👑 LEGENDS</span>' : ''}</h3>
          <p class="genres">${genresOf(g).filter((x) => x.id !== 'legends' && x.id !== '3d').map((x) => esc(x.label)).join(' · ')}</p>
          <p>${esc(g.tagline)}</p>
          <div class="meta">
            ${tierBar(sl)}${home ? `
            <span data-best hidden>Your best: <b></b></span>
            <span data-top="${g.id}"></span>` : `
            <span>Free · no sign-up</span>`}
          </div>
        </div>
      </a>`;
}

/** Site-map footer shared by every page. */
function footer(rel) {
  const zones = ZONES.map((z) => `
        <div><b>${esc(z.name)}</b><ul>${z.slots.filter(Boolean).map((id) => GAMES.find((g) => g.id === id)).filter(Boolean)
          .map((g) => `<li><a href="${rel}games/${g.id}/">${esc(g.title)}</a></li>`).join('')}</ul></div>`).join('');
  const genres = genrePages().map((ge) => `<li><a href="${rel}games/${ge.id}/">${esc(ge.label)}</a></li>`).join('');
  return `
    <div class="wrap footer-map">
      <div class="footer-cols">${zones}
        <div><b>By genre</b><ul>${genres}<li><a href="${rel}games/">All games</a></li></ul></div>
        <div><b>Site</b><ul>
          <li><a href="${rel}">Home</a></li>
          <li><a href="${rel}leaderboard/">Leaderboard</a></li>
          <li><a href="${rel}hall-of-legends/">Hall of Legends</a></li>
          <li><a href="${rel}retro-vault/">Retro Vault</a></li>
          <li><a href="${rel}shop/">Token Shop</a></li>
          <li><a href="${rel}badges/">All badges</a></li>
          <li><a href="${rel}about/">About &amp; privacy</a></li>
        </ul></div>
      </div>
      <div class="footer-base">
        <span>© <span data-year>${new Date().getFullYear()}</span> <span data-site-name>${SITE_NAME}</span> by ${PUBLISHER} · ${GAMES.length} free browser games, no sign-up, no downloads</span>
      </div>
    </div>`;
}

const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.goatcounter.com; font-src 'self'; connect-src 'self' https://*.supabase.co; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;
function head({ rel, title, description, canonical, ogTitle, ogImage, extraCss = [], schema = [], themeColor = '#0b0b1a' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${attr(ogTitle || title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(ogTitle || title)}">
  <meta name="twitter:description" content="${attr(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="theme-color" content="${themeColor}">
  <link rel="icon" href="${rel}favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="${rel}manifest.webmanifest">
  <link rel="apple-touch-icon" href="${rel}assets/img/icon-192.png">
  <script src="${rel}assets/js/theme-boot.js"></script>
  <link rel="stylesheet" href="${rel}assets/css/site.css">
${extraCss.map((c) => `  <link rel="stylesheet" href="${rel}${c}">`).join('\n')}
${schema.map((s) => `  <script type="application/ld+json">\n${JSON.stringify(s, null, 2).replace(/</g, '\\u003c')}\n  </script>`).join('\n')}
</head>`;
}
const siteHeader = (rel, current) => `
  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="${rel}"><img src="${rel}favicon.svg" alt=""><span data-site-name>${SITE_NAME}</span></a>
      <nav class="site-nav">
        <a href="${rel}games/"${current === 'games' ? ' aria-current="page"' : ''}>Games</a>
        <a href="${rel}leaderboard/">Leaderboard</a>
        <a href="${rel}about/">About</a>
        <a class="retro-link" href="${rel}retro-vault/" title="Retro Vault">🕹️<span class="nav-label"> Retro</span></a>
      </nav>
    </div>
  </header>`;
const orgSchema = { '@type': 'Organization', '@id': SITE + '#org', name: PUBLISHER, alternateName: SITE_NAME, url: SITE, logo: SITE + 'assets/img/icon-512.png' };
const breadcrumb = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});

// ── home page ────────────────────────────────────────────────
// Each zone is a <details> block: closed zones stay in the HTML (search engines and
// no-JS visitors still see every card), Zone 1 is open by default, and home.js
// opens the zone the player is currently working on instead.
function homeGrid() {
  return ZONES.map((z) => {
    const slots = SLOTS.filter((sl) => sl.zone === z);
    const tiers = [...new Set(slots.map((sl) => sl.tier.label))];
    const range = tiers.length > 1 ? `${tiers[0]} to ${tiers[tiers.length - 1]}` : tiers[0];
    const built = slots.filter((sl) => sl.game).length;
    return `
  <details class="zone zone-${z.n}" data-zone="${z.n}" id="zone-${z.n}"${z.n === 1 ? ' open' : ''}>
    <summary class="zone-head">
      <span class="zone-num">${z.n}</span>
      <span class="zone-title"><h3>${esc(z.name.replace(/^Zone \d+ · /, ''))}</h3><span class="zone-sub muted small">${esc(range)} · ${built} game${built === 1 ? '' : 's'}</span></span>
      <span class="zone-meta"><span data-progress class="zone-count muted small"></span><span data-egg></span></span>
      <span class="zone-chev" aria-hidden="true">▾</span>
    </summary>
    <div class="zone-body">
      <p class="muted small zone-blurb">${esc(z.blurb)}</p>
      <div data-lock></div>
      <div class="game-grid">${slots.map((sl) => card(sl, '', { home: true })).join('')}
      </div>
    </div>
  </details>`;
  }).join('\n');
}
function homeSchema() {
  const site = {
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': SITE + '#website', url: SITE, name: SITE_NAME, alternateName: PUBLISHER,
    description: `${GAMES.length} free browser games with rising levels, bonus rounds, a daily challenge and a public high-score board. No sign-up, no downloads.`,
    publisher: { '@id': SITE + '#org' }, inLanguage: 'en',
  };
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: `All ${GAMES.length} games on ${SITE_NAME}`, numberOfItems: GAMES.length,
    itemListElement: GAMES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}games/${g.id}/`, name: g.title })),
  };
  return [{ '@context': 'https://schema.org', ...orgSchema }, site, list]
    .map((s) => `  <script type="application/ld+json">\n${JSON.stringify(s, null, 2).replace(/</g, '\\u003c')}\n  </script>`).join('\n');
}

// ── game pages ───────────────────────────────────────────────
function related(g, n = 4) {
  const mine = new Set(genresOf(g).map((x) => x.id).filter((x) => x !== '3d' && x !== 'legends'));
  const score = (o) => genresOf(o).filter((x) => mine.has(x.id)).length * 10 + (o.zone === g.zone ? 3 : 0) - Math.abs((o.number || 0) - (g.number || 0)) / 100;
  return GAMES.filter((o) => o.id !== g.id).sort((a, b) => score(b) - score(a)).slice(0, n);
}
function gamePage(g) {
  const sl = slotOf(g);
  const c = copyOf(g);
  const rel = '../../';
  const url = `${SITE}games/${g.id}/`;
  const title = pageTitle(g);
  const description = c.blurb.length > 155 ? c.blurb.slice(0, 152).replace(/\s+\S*$/, '') + '…' : c.blurb;
  const og = existsSync(join(ROOT, 'games', g.id, 'og.jpg')) ? `${url}og.jpg` : `${SITE}assets/img/og.png`;
  const genres = genresOf(g);
  const z = sl.zone;
  const legendGame = z.legendGame && GAMES.find((x) => x.id === z.legendGame);
  const schema = [
    {
      '@context': 'https://schema.org', '@type': 'VideoGame', '@id': url + '#game', name: g.title, url,
      description: c.blurb, image: og, genre: genres.filter((x) => x.id !== 'legends').map((x) => x.label.replace('👑 ', '')),
      gamePlatform: 'Web Browser', applicationCategory: 'Game', operatingSystem: 'Any', playMode: 'SinglePlayer',
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 1 },
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
      publisher: orgSchema, isPartOf: { '@id': SITE + '#website' }, inLanguage: 'en',
    },
    breadcrumb([[SITE_NAME, SITE], ['Games', `${SITE}games/`], [z.name.replace(/ · /, ': '), `${SITE}#zone-${z.n}`], [g.title, url]]),
  ];
  const ach = (g.achievements || []).filter((a) => !a.secret);
  const secret = (g.achievements || []).filter((a) => a.secret).length;
  const body = `
<body class="game-page">
  <div id="app"><noscript><p style="padding:2em">This game needs JavaScript switched on. <a href="${rel}">Back to the arcade</a>.</p></noscript></div>

  <section class="game-info wrap" id="about">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${rel}">${SITE_NAME}</a> › <a href="${rel}games/">Games</a> › <a href="${rel}#zone-${z.n}">${esc(z.name)}</a> › <span>${esc(g.title)}</span></nav>
    <h1>${esc(g.title)}</h1>
    <p class="lead">${esc(cap(c.kind))} — ${esc(c.blurb)}</p>
    <p class="pills">
      ${genrePills(g, rel)}
      <span class="pill" title="Difficulty ${sl.n} of ${SLOTS.length}">${esc(difficultyText(sl))}</span>
      ${g.legend ? `<span class="pill legend-pill">👑 Legends game</span>` : ''}
      <span class="pill">Free · no sign-up · no download</span>
    </p>
    <div class="info-grid">
      <div>
        <h2>How to play ${esc(g.title)}</h2>
        <ol>${c.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
        <p><b>Controls:</b> ${esc(g.controls)}.</p>
        ${c.tip ? `<p class="tip">💡 ${esc(c.tip)}</p>` : ''}
        <p>Press <kbd>P</kbd> to pause and <kbd>M</kbd> to mute. Works on desktop, tablet and phone.</p>
      </div>
      <div>
        <h2>Levels, bonus rounds and scoring</h2>
        <p>${esc(g.title)} is game ${sl.n} of ${SLOTS.length} on ${SITE_NAME}, in <a href="${rel}#zone-${z.n}">${esc(z.name)}</a> (${esc(sl.tier.label)} difficulty). Every game is open to everyone; the zones are the recommended order, and playing all six games of a zone completes it.</p>
        <ul>
          <li>Every level is a little faster than the last, with something new every few levels.</li>
          <li>Every 5th level is a <b>bonus round</b>: no way to lose, a timer and lots of points. Clear it to unlock a checkpoint you can start from next time.</li>
          <li>Chain hits quickly to raise your <b>combo multiplier</b>.</li>
          <li>Make the top 20 and type a nickname to go on the <a href="${rel}leaderboard/#${g.id}">public leaderboard</a> — no account needed. Boards reset daily and weekly.</li>
          <li>One game a day is the <b>Daily Challenge</b>: the same layout for everyone, with its own board. <a href="./?daily=1">Play today's ${esc(g.title)} challenge</a>.</li>
        </ul>
        ${g.legend ? `<h2>The Legends secret</h2>
        <p>${esc(g.title)} is ${esc(z.name)}'s <b>Legends game</b>. ${esc(g.legendHow || 'Finish it from level 1 without losing a life.')} Win the egg to enter the <a href="${rel}hall-of-legends/">Hall of Legends</a>${z.n <= 4 ? ' — and the Golden Eggs of Zones 1–4 together win the Golden Crown' : ' and add a jewel to the Golden Crown'}.</p>
        ${g.legendLore ? `<p class="lore">“${esc(g.legendLore)}”</p>` : ''}` : (legendGame ? `<p>Looking for this zone's Golden Egg? It is hidden in <a href="${rel}games/${legendGame.id}/">${esc(legendGame.title)}</a>, the zone's Legends game.</p>` : '')}
      </div>
    </div>
    ${ach.length ? `<h2>Badges in ${esc(g.title)}</h2>
    <ul class="badge-list">${ach.map((a) => `<li><span class="ico" aria-hidden="true">${a.icon}</span> <b>${esc(a.title)}</b> — ${esc(a.desc)}</li>`).join('')}${secret ? `<li><span class="ico" aria-hidden="true">🔒</span> <b>${secret} secret ${secret === 1 ? 'badge' : 'badges'}</b> — keep playing…</li>` : ''}</ul>` : ''}
    ${g.gold ? `<p>Win the zone's Golden Egg and ${esc(g.title)} unlocks a golden character: the <b>${esc(g.gold)}</b>.</p>` : ''}
    <h2>More games like this</h2>
    <div class="game-grid mini">${related(g).map((o) => card(slotOf(o), rel)).join('')}
    </div>
    <p class="more-links">Browse: ${genresOf(g).map((x) => `<a href="${genreHref(rel, x.id)}">${esc(x.label.replace('👑 ', ''))} games</a>`).join(' · ')} · <a href="${rel}games/">all ${GAMES.length} games</a></p>
  </section>

  <footer class="site-footer">
    <!-- build:footer -->${footer(rel)}
    <!-- /build:footer -->
  </footer>
  <script type="module" src="game.js"></script>
</body>
</html>
`;
  return head({ rel, title, description, canonical: url, ogTitle: `${g.title} — free browser game`, ogImage: og, extraCss: ['assets/css/game.css'], schema, themeColor: g.color }) + body;
}

// ── genre pages + /games/ ────────────────────────────────────
function genrePage(ge) {
  const rel = '../../';
  const url = `${SITE}games/${ge.id}/`;
  const games = GAMES.filter((g) => genresOf(g).some((x) => x.id === ge.id));
  const label = ge.label.replace('👑 ', '');
  const title = `Free online ${label.toLowerCase()} games to play in your browser | ${SITE_NAME}`;
  const description = `${games.length} free ${label.toLowerCase()} games you can play right now in the browser, no sign-up: ${games.slice(0, 4).map((g) => g.title).join(', ')}${games.length > 4 ? ' and more' : ''}. Levels, bonus rounds and high scores.`;
  const schema = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${label} games`, url, description, isPartOf: { '@id': SITE + '#website' },
      mainEntity: { '@type': 'ItemList', numberOfItems: games.length, itemListElement: games.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}games/${g.id}/`, name: g.title })) } },
    breadcrumb([[SITE_NAME, SITE], ['Games', `${SITE}games/`], [`${label} games`, url]]),
  ];
  const body = `
<body>${siteHeader(rel, 'games')}
  <main class="wrap genre-page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${rel}">${SITE_NAME}</a> › <a href="${rel}games/">Games</a> › <span>${esc(label)}</span></nav>
    <h1>${esc(label)} games</h1>
    <p class="lead">${esc(ge.blurb)} All ${games.length} are free to play in your browser with no sign-up and no download.</p>
    <p class="pills">${genrePages().map((o) => `<a class="pill genre${o.id === ge.id ? ' on' : ''}" href="${rel}games/${o.id}/">${esc(o.label)}</a>`).join(' ')} <a class="pill" href="${rel}games/">All games</a></p>
    <div class="game-grid">${games.map((g) => card(slotOf(g), rel)).join('')}
    </div>
    <section class="section">
      <h2>How the arcade works</h2>
      <p>Games are grouped into zones of six, from Easy up to Ultra — the recommended order, though every game is open from the start. Every 5th level is a bonus round, the best scores go on a public board under a nickname, and the sixth game of each zone hides a Golden Egg for a flawless run. <a href="${rel}about/">More about the arcade →</a></p>
    </section>
  </main>
  <footer class="site-footer">
    <!-- build:footer -->${footer(rel)}
    <!-- /build:footer -->
  </footer>
  <script type="module" src="${rel}assets/js/site-page.js"></script>
</body>
</html>
`;
  return head({ rel, title, description, canonical: url, ogImage: `${SITE}assets/img/og.png`, schema }) + body;
}
function gamesIndex() {
  const rel = '../';
  const url = `${SITE}games/`;
  const title = `All ${GAMES.length} free browser games, by genre | ${SITE_NAME}`;
  const description = `Every game on ${SITE_NAME}: arcade, puzzle, shooter, racing, stealth and 3D adventure games, all free in your browser with no sign-up. Pick a genre or jump straight in.`;
  const schema = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'All games', url, description, isPartOf: { '@id': SITE + '#website' },
      mainEntity: { '@type': 'ItemList', numberOfItems: GAMES.length, itemListElement: GAMES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}games/${g.id}/`, name: g.title })) } },
    breadcrumb([[SITE_NAME, SITE], ['Games', url]]),
  ];
  const tiers = [...new Set(SLOTS.filter((sl) => sl.game).map((sl) => sl.tier))];
  const chip = (href, label, data, extra = '') => `<a class="chip${extra}" href="${href}"${data}>${esc(label)}</a>`;
  const body = `
<body>${siteHeader(rel, 'games')}
  <main class="wrap genre-page browse-page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${rel}">${SITE_NAME}</a> › <span>Games</span></nav>
    <h1>All ${GAMES.length} games</h1>
    <p class="lead">Free browser games with rising levels, bonus rounds and a public high-score board. No sign-up, no downloads — filter by genre or difficulty, search, or <a href="${rel}">go to the arcade</a> to play in zone order.</p>
    <div class="browse-bar" id="browse">
      <label class="browse-search"><span aria-hidden="true">🔍</span><input type="search" id="q" placeholder="Search games…" autocomplete="off" aria-label="Search games"></label>
      <div class="chips" role="group" aria-label="Genre">
        ${chip(`${rel}games/`, 'All', ' data-f="all"', ' on')}
        ${genrePages().filter((ge) => ge.id !== '3d' && ge.id !== 'legends').map((ge) => chip(`${rel}games/${ge.id}/`, ge.label, ` data-f="genre:${ge.id}"`)).join('\n        ')}
      </div>
      <div class="chips" role="group" aria-label="Difficulty and type">
        ${tiers.map((t) => chip(`#tier-${t.id}`, t.label, ` data-f="tier:${t.id}" style="--t:${t.color}"`, ' tier-chip')).join('\n        ')}
        ${chip(`${rel}games/3d/`, '3D', ' data-f="genre:3d"', ' chip-3d')}
        ${chip(`${rel}games/legends/`, '👑 Legends', ' data-f="genre:legends"', ' chip-gold')}
      </div>
      <p class="muted small" id="browse-count" aria-live="polite"></p>
    </div>
    <div class="game-grid" id="all-games">${SLOTS.filter((sl) => sl.game).map((sl) => card(sl, rel)).join('')}
    </div>
    <p class="muted" id="browse-empty" hidden>No games match. <a href="#" data-clear>Clear the filters</a> or <a href="${rel}">go to the arcade</a>.</p>
    <section class="section" id="genres">
      <h2>Browse by genre</h2>
      <div class="genre-links">${genrePages().map((ge) => `<a href="${rel}games/${ge.id}/"><b>${esc(ge.label)}</b> <span class="muted small">${GAMES.filter((g) => genresOf(g).some((x) => x.id === ge.id)).length} games</span><br><span class="muted small">${esc(ge.blurb)}</span></a>`).join('\n      ')}
      </div>
    </section>
  </main>
  <footer class="site-footer">
    <!-- build:footer -->${footer(rel)}
    <!-- /build:footer -->
  </footer>
  <script type="module" src="${rel}assets/js/browse.js"></script>
</body>
</html>
`;
  return head({ rel, title, description, canonical: url, ogImage: `${SITE}assets/img/og.png`, schema }) + body;
}

// ── /badges/ — every badge, static (secret ones shown as ???); badges.js adds the
//    earned state and the count for this player.
function badgesPage() {
  const rel = '../';
  const url = `${SITE}badges/`;
  const all = [
    ...GLOBAL_ACHIEVEMENTS.map((a) => ({ a, key: `g:${a.id}`, group: 'Arcade' })),
    ...GAMES.flatMap((g) => (g.achievements || []).map((a) => ({ a, key: `${g.id}:${a.id}`, group: g.title, game: g }))),
  ];
  const legendary = all.filter((x) => x.a.legendary);
  const groups = [{ title: '👑 Legendary', cls: 'legendary', items: legendary, blurb: 'One per Legends game: the Golden Egg itself.' },
    { title: 'Arcade', items: all.filter((x) => !x.a.legendary && x.group === 'Arcade'), blurb: 'Earned across the whole arcade.' },
    ...GAMES.map((g) => ({ title: g.title, game: g, items: all.filter((x) => x.game === g && !x.a.legendary) }))].filter((grp) => grp.items.length);
  const title = `All ${all.length} badges | ${SITE_NAME}`;
  const description = `Every badge on ${SITE_NAME}: ${all.length} to collect across ${GAMES.length} games, from your first play to the secret Golden Egg badges. Each badge pays arcade tokens.`;
  const schema = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'All badges', url, description, isPartOf: { '@id': SITE + '#website' } },
    breadcrumb([[SITE_NAME, SITE], ['Badges', url]]),
  ];
  const badge = ({ a, key, game }) => `<div class="badge${a.legendary ? ' legendary' : ''}${a.secret ? ' secret' : ''}" data-key="${key}" data-title="${esc(a.title)}" data-desc="${esc(a.desc)}" data-icon="${esc(a.icon)}"><span class="ico">${a.secret ? '🔒' : a.icon}</span><span><b>${a.secret ? '???' : esc(a.title)}</b><small>${a.secret ? 'A secret. Keep playing…' : esc(a.desc)}</small></span></div>`;
  const body = `
<body>${siteHeader(rel, 'badges')}
  <main class="wrap genre-page badges-page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${rel}">${SITE_NAME}</a> › <span>Badges</span></nav>
    <h1>All ${all.length} badges</h1>
    <p class="lead">Badges are earned as you play and live in your browser (a Legend code carries them to any device). Every badge pays <b>+10 🪙 tokens</b> for the <a href="${rel}shop/">Token Shop</a>. Secret badges stay hidden until you find them.</p>
    <p class="badge-summary" id="badge-summary"><span class="progress-count" id="badge-count"></span> <a class="muted small" href="#" id="badge-filter" hidden>Show only unearned</a></p>
    <p class="pills badge-jump">${groups.map((grp) => `<a class="pill genre" href="#${grp.game ? grp.game.id : grp.cls || 'arcade'}">${esc(grp.title)}</a>`).join(' ')}</p>
    ${groups.map((grp) => `
    <section class="badge-group ${grp.cls || ''}" id="${grp.game ? grp.game.id : grp.cls || 'arcade'}">
      <div class="section-head"><h2>${grp.game ? `<a href="${rel}games/${grp.game.id}/">${esc(grp.title)}</a>` : esc(grp.title)}</h2><span class="muted small">${grp.items.length} badge${grp.items.length > 1 ? 's' : ''}${grp.blurb ? ` · ${esc(grp.blurb)}` : ''}</span></div>
      <div class="badge-grid">${grp.items.map(badge).join('')}</div>
    </section>`).join('')}
  </main>
  <footer class="site-footer">
    <!-- build:footer -->${footer(rel)}
    <!-- /build:footer -->
  </footer>
  <script type="module" src="${rel}assets/js/badges.js"></script>
</body>
</html>
`;
  return head({ rel, title, description, canonical: url, ogImage: `${SITE}assets/img/og.png`, schema }) + body;
}

// ── sitemap ──────────────────────────────────────────────────
function sitemap() {
  const urls = [
    ['', 'index.html', '1.0', 'daily'],
    ['games/', 'games/index.html', '0.9', 'weekly'],
    ...genrePages().map((ge) => [`games/${ge.id}/`, `games/${ge.id}/index.html`, '0.8', 'weekly']),
    ...SLOTS.filter((sl) => sl.game).map((sl) => [`games/${sl.game.id}/`, `games/${sl.game.id}/game.js`, sl.legendSlot ? '0.9' : '0.8', 'monthly']),
    ['retro-vault/', 'retro-vault/index.html', '0.7', 'monthly'],
    ['shop/', 'shop/index.html', '0.5', 'monthly'],
    ['badges/', 'badges/index.html', '0.5', 'monthly'],
    ['leaderboard/', 'leaderboard/index.html', '0.6', 'daily'],
    ['about/', 'about/index.html', '0.4', 'yearly'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, f, p, c]) => `  <url><loc>${SITE}${u}</loc><lastmod>${lastmod(f)}</lastmod><changefreq>${c}</changefreq><priority>${p}</priority></url>`).join('\n')}
</urlset>
`;
}

// ── share cards (--images) ───────────────────────────────────
async function shareCards() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    // not in the repo: try the global install (npm i -g playwright && npx playwright install chromium)
    try { const { createRequire } = await import('node:module'); const g = execSync('npm root -g').toString().trim(); ({ chromium } = createRequire(join(g, 'x.js'))('playwright')); }
    catch { console.warn('! playwright not installed — skipping share cards (npm i -g playwright && npx playwright install chromium)'); return; }
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const g of GAMES) {
    const sl = slotOf(g);
    const c = copyOf(g);
    const thumb = readFileSync(join(ROOT, 'games', g.id, 'thumb.svg'), 'utf8').replace(/<\?xml[^>]*>/, '');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0b1a;font-family:ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif;color:#eef}
      .bg{position:absolute;inset:0;background:radial-gradient(700px 500px at 82% 50%, ${g.color}55, transparent 70%), radial-gradient(500px 400px at 10% 100%, ${g.color}22, transparent 70%), #0b0b1a}
      .grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:60px 60px}
      .thumb{position:absolute;right:80px;top:95px;width:440px;height:440px;border-radius:40px;background:#0f0f28;border:2px solid ${g.color}66;box-shadow:0 0 80px ${g.color}66;display:grid;place-items:center;overflow:hidden}
      .thumb svg{width:300px;height:300px}
      .txt{position:absolute;left:80px;top:90px;width:560px}
      .brand{font-size:26px;font-weight:700;color:#aab;letter-spacing:.02em}
      h1{font-size:${g.title.length > 18 ? 68 : 80}px;line-height:1.02;margin:18px 0 14px;background:linear-gradient(90deg,${g.color},#fff 60%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px ${g.color}88)}
      .kind{font-size:32px;color:#d6d5f0;margin:0 0 26px}
      .pills span{display:inline-block;font-size:22px;font-weight:700;padding:8px 18px;border-radius:999px;background:#1a1a3d;border:1px solid #ffffff22;margin:0 8px 10px 0}
      .pills .gold{background:#3b2a06;border-color:#a16207;color:#fbbf24}
      .foot{position:absolute;left:80px;bottom:56px;font-size:26px;color:#aab}
      .foot b{color:#fff}
    </style></head><body><div class="bg"></div><div class="grid"></div>
      <div class="txt"><div class="brand">▶ ${esc(SITE_NAME)}</div><h1>${esc(g.title)}</h1><p class="kind">Free online ${esc(c.kind)}</p>
        <div class="pills"><span>${esc(sl.tier.label)} · Zone ${sl.zone.n}</span>${g.is3d ? '<span>3D</span>' : ''}${g.legend ? '<span class="gold">👑 Legends game</span>' : ''}<span>No sign-up</span></div></div>
      <div class="thumb">${thumb}</div>
      <div class="foot">Play free in your browser at <b>tcgamehub.win</b></div>
    </body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const file = join(ROOT, 'games', g.id, 'og.jpg');
    if (!CHECK) { await page.screenshot({ path: file, type: 'jpeg', quality: 82 }); console.log(`wrote games/${g.id}/og.jpg`); }
  }
  await browser.close();
}

// ── run ──────────────────────────────────────────────────────
if (IMAGES) await shareCards();
replaceBlock('index.html', 'grid', homeGrid());
replaceBlock('index.html', 'schema', homeSchema());
replaceBlock('index.html', 'count', String(GAMES.length));
// the hand-written <title>, meta description and og:title carry the count too
out('index.html', readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/\d+ free browser games/g, `${GAMES.length} free browser games`));
out('badges/index.html', badgesPage());
for (const g of GAMES) out(`games/${g.id}/index.html`, gamePage(g));
out('games/index.html', gamesIndex());
for (const ge of genrePages()) out(`games/${ge.id}/index.html`, genrePage(ge));
// footers on hand-written pages (depth → rel)
for (const [file, rel] of [['index.html', ''], ['about/index.html', '../'], ['leaderboard/index.html', '../'], ['retro-vault/index.html', '../'], ['hall-of-legends/index.html', '../'], ['crown-room/index.html', '../'], ['shop/index.html', '../']]) {
  replaceBlock(file, 'footer', footer(rel));
}
out('sitemap.xml', sitemap());
// stale genre folders (a genre that dropped below 2 games)
for (const d of readdirSync(join(ROOT, 'games'))) {
  const p = join(ROOT, 'games', d);
  if (!statSync(p).isDirectory() || GAMES.some((g) => g.id === d) || d === '_template') continue;
  if (!genrePages().some((ge) => ge.id === d)) console.warn(`! games/${d}/ is not a game or a current genre — delete it by hand if it is stale`);
}
console.log(CHECK ? (changed ? `${changed} file(s) out of date — run node tools/build-pages.mjs` : 'everything up to date') : `done (${changed} file(s) written)`);
if (CHECK && changed) process.exit(1);

// Retro Vault page: catalogue, the player frame, and "bring your own ROM".
import { siteChrome, esc, whatsappLink, WA_ICON } from './site.js';
import { event } from './stats.js';
import { GAMES, SYSTEMS, systemForFile } from './retro-catalogue.js';

siteChrome();

const $ = (id) => document.getElementById(id);
const screen = $('screen');
const cabinet = document.querySelector('.cabinet');
const hosted = GAMES.filter((g) => g.host === 'hosted');
const download = GAMES.filter((g) => g.host === 'download');
const paid = GAMES.filter((g) => g.host === 'paid');

$('count-hosted').textContent = hosted.length;
$('count-download').textContent = download.length;

// Remember the last system picked for "Your ROM" (convenience only).
const PREF = 'arcade:retro-system';
const pref = { get() { try { return localStorage.getItem(PREF) || ''; } catch { return ''; } },
               set(v) { try { localStorage.setItem(PREF, v); } catch { /* private mode */ } } };

// ── Play now (hosted) ───────────────────────────────────────────
$('hosted-grid').innerHTML = hosted.map((g) => `
  <button class="game-card" type="button" data-play="${g.id}" style="--c:${SYSTEMS[g.system].colour}">
    <div class="thumb shot">
      <img src="img/${g.id}.png" alt="" width="320" height="240" loading="lazy">
      <span class="sys">${esc(SYSTEMS[g.system].label)}</span>
    </div>
    <span class="play-cta">▶ Play</span>
    <div class="body">
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.blurb)}</p>
      <div class="meta"><span><b>${esc(g.by)}</b> · ${g.year}</span><span>${esc(g.genre)}</span></div>
    </div>
  </button>`).join('');

document.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => playHosted(b.dataset.play, true)));

function setNowPlaying(title, meta, game) {
  $('np-title').textContent = title;
  $('np-meta').textContent = meta;
  $('np-stop').hidden = false;
  const share = $('np-share');
  if (game) {
    const url = new URL(`?play=${game.id}`, location.href).href;
    share.innerHTML = `${WA_ICON} Share`;
    share.href = whatsappLink(`Play ${game.title} free in your browser on the Retro Vault: ${url}`);
    share.hidden = false;
  } else share.hidden = true;
  document.querySelectorAll('[data-play]').forEach((b) => b.classList.toggle('current', b.dataset.play === game?.id));
  cabinet.classList.add('playing');
}

function focusScreen(scroll) {
  if (scroll) $('player').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  // give keyboard input to the game once the frame has loaded
  const f = () => { try { screen.focus(); screen.contentWindow.focus(); } catch { /* ignore */ } };
  screen.addEventListener('load', f, { once: true });
  setTimeout(f, 400);
}

function playHosted(id, scroll) {
  const g = hosted.find((x) => x.id === id);
  if (!g) return;
  screen.src = `player.html?game=${encodeURIComponent(g.id)}`;
  setNowPlaying(g.title, `${g.by} · ${SYSTEMS[g.system].label} · ${g.tip}`, g);
  history.replaceState(null, '', `?play=${g.id}`);
  focusScreen(scroll);
  event('start', `retro-${g.id}`);
}

$('np-stop').addEventListener('click', () => {
  screen.src = 'player.html';
  $('np-title').textContent = 'Nothing yet';
  $('np-meta').textContent = 'Pick a game below or load your own ROM.';
  $('np-stop').hidden = true; $('np-share').hidden = true;
  cabinet.classList.remove('playing');
  document.querySelectorAll('[data-play]').forEach((b) => b.classList.remove('current'));
  history.replaceState(null, '', location.pathname);
});

// ── Bring your own ROM ─────────────────────────────────────────
const sel = $('system');
sel.insertAdjacentHTML('beforeend', Object.entries(SYSTEMS)
  .map(([id, s]) => `<option value="${id}">${esc(s.label)} (.${s.ext.join(' .')})</option>`).join(''));
let romFile = null;

function chooseFile(file) {
  if (!file) return;
  if (file.size > 64 * 1024 * 1024) { $('drop-title').textContent = 'That file is too big for these consoles (64 MB max).'; return; }
  romFile = file;
  $('drop').classList.add('has-file');
  $('drop-title').textContent = file.name;
  $('drop-sub').textContent = `${Math.max(1, Math.round(file.size / 1024)).toLocaleString('en-GB')} KB · ready`;
  const guess = systemForFile(file.name);
  if (guess) sel.value = guess;
  else if (!sel.value) sel.value = pref.get();
  $('byor-play').disabled = !sel.value;
  if (!sel.value) { $('byor-hint').hidden = false; $('byor-hint').textContent = 'Pick the system this ROM is for.'; }
}
sel.addEventListener('change', () => { $('byor-play').disabled = !(romFile && sel.value); });
$('rom-file').addEventListener('change', (e) => chooseFile(e.target.files[0]));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); chooseFile(e.dataTransfer.files[0]); });

let pending = null;   // the ROM waiting for the player frame to say it's ready
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== screen.contentWindow || !e.data) return;
  if (e.data.retro === 'ready' && pending) { screen.contentWindow.postMessage({ retro: 'rom', ...pending }, location.origin); pending = null; }
});

$('byor-play').addEventListener('click', () => {
  if (!romFile || !sel.value) return;
  pref.set(sel.value);
  pending = { file: romFile, system: sel.value };
  screen.src = `player.html?byor=1&system=${encodeURIComponent(sel.value)}`;
  setNowPlaying(romFile.name.replace(/\.[^.]+$/, ''), `Your ROM · ${SYSTEMS[sel.value].label} · stays on this device`, null);
  history.replaceState(null, '', location.pathname);
  focusScreen(true);
  event('start', `retro-own-${sel.value}`);   // the system only, never the file name
});

// ── Free to download ────────────────────────────────────────────
function dlCard(g) {
  const s = SYSTEMS[g.system];
  const get = g.host === 'paid'
    ? `<a class="btn primary" href="${g.url}" target="_blank" rel="noopener">Buy it ↗</a>`
    : `<a class="btn primary" href="${g.url}" target="_blank" rel="noopener">Get it ↗</a>`;
  return `
  <article class="dl-card${g.host === 'paid' ? ' paid' : ''}" data-system="${g.system}" style="--c:${s.colour}">
    <div class="top"><h3>${esc(g.title)}</h3><span class="sys">${esc(s.label)}</span></div>
    <p class="by">${esc(g.by)} · ${g.year} · ${esc(g.genre)}</p>
    <p class="blurb">${esc(g.blurb)}</p>
    <p class="lic">${esc(g.licence)}</p>
    <div class="acts">${get}<button class="btn" type="button" data-load="${g.id}">Load it ▶</button></div>
  </article>`;
}
const systemsInList = [...new Set(download.map((g) => g.system))];
$('filters').innerHTML = ['all', ...systemsInList].map((id, i) =>
  `<button class="tab" role="tab" type="button" data-filter="${id}" aria-selected="${i === 0}">${id === 'all' ? 'All' : esc(SYSTEMS[id].label)}</button>`).join('');
function renderDownloads(filter) {
  const list = filter === 'all' ? download : download.filter((g) => g.system === filter);
  $('download-grid').innerHTML = list.map(dlCard).join('');
}
$('filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  $('filters').querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
  renderDownloads(b.dataset.filter);
});
renderDownloads('all');
$('paid-grid').innerHTML = paid.map(dlCard).join('');

// "Load it" → jump to Your ROM with the system already chosen
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-load]');
  if (!b) return;
  const g = GAMES.find((x) => x.id === b.dataset.load);
  sel.value = g.system;
  $('byor-play').disabled = !romFile;
  const hint = $('byor-hint');
  hint.hidden = false;
  hint.textContent = g.system === 'mame'
    ? `${g.title}: download the zip from mamedev.org, keep its name (${g.id}.zip), then drop it here.`
    : `${g.title}: download it from the creator's page, then drop the file here.`;
  $('byor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('rom-file').focus({ preventScroll: true });
});

// ── Credits table ──────────────────────────────────────────────
$('credit-rows').innerHTML = hosted.map((g) => `
  <tr><td><b>${esc(g.title)}</b> (${g.year})</td><td>${esc(g.by)}</td><td>${esc(g.licence)}</td>
  <td><a href="${g.source}" download>Download source</a> · <a href="${g.upstream}" target="_blank" rel="noopener">Project page ↗</a><br><span class="muted small">Built from commit ${g.commit}</span></td></tr>`).join('');

// ── Deep link: ?play=<id> loads that game ───────────────────────
const deep = new URLSearchParams(location.search).get('play');
if (deep && hosted.some((g) => g.id === deep)) playHosted(deep, false);

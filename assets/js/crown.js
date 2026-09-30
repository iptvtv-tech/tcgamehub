// The Crown Room — hidden page for holders of the Golden Crown (every zone's Golden Egg).
import { gameById, legendZones } from './games.js';
import { Store } from './storage.js';
import { Legends, crownHolders } from './legends.js';
import { eggSVG, eggName, crownSVG } from './eggs.js';
import { siteChrome, esc, whatsappLink, WA_ICON } from './site.js';
import { CONFIG } from './config.js';

siteChrome();
Legends.syncCrowns();
const main = document.getElementById('crown');
const date = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const myName = () => Legends.info()?.name || Store.name() || 'Legend';

function sealed() {
  const eggs = Legends.eggs().length, need = legendZones().length;
  main.innerHTML = `
    <section class="crown-sealed">
      <div class="sealed-crown" aria-hidden="true">👑</div>
      <h1>The Crown Room</h1>
      <p>The door is sealed with ${need} golden locks. Only a holder of every Golden Egg may enter.</p>
      <div class="egg-shelf">${legendZones().map((z) => `<div class="egg-stand${Legends.hasEgg(z.n) ? ' won' : ''}">${eggSVG(z.n, { size: 60, won: Legends.hasEgg(z.n) })}<b>${esc(eggName(z.n))}</b><small>${esc(gameById(z.legendGame).title)}</small></div>`).join('')}</div>
      <p class="muted">${Legends.isLegend() ? `You hold <b>${eggs} of ${need}</b> eggs.` : 'Nobody has ever been told how to win an egg…'}</p>
      <a class="btn" href="../hall-of-legends/">🏛️ Hall of Legends</a> <a class="btn" href="../">⌂ Arcade</a>
    </section>`;
}

function open() {
  const at = Legends.crownAt() || Date.now();
  main.innerHTML = `
    <section class="crown-hero">
      <div class="crown-stage"><div class="rays" aria-hidden="true"></div>${crownSVG({ size: 260, cls: 'spin big' })}</div>
      <h1>The Crown Room</h1>
      <p class="crown-sub">Welcome, <b>${esc(myName())}</b> — Holder of the Golden Crown</p>
      <p class="muted">Crowned ${date(at)}</p>
    </section>
    <section class="pedestals">${legendZones().map((z) => `
      <div class="pedestal">${eggSVG(z.n, { size: 88 })}<i></i><b>${esc(eggName(z.n))}</b><small>${esc(gameById(z.legendGame).title)} · Zone ${z.n}</small></div>`).join('')}
    </section>
    <div class="hall-grid">
      <section class="hall-card">
        <h2>📜 The Crown Roll</h2>
        <p class="muted small">Everyone who has held all ${legendZones().length} Golden Eggs, in the order they were crowned.</p>
        <ol class="legend-list" data-roll><li class="muted">Loading…</li></ol>
      </section>
      <div style="display:grid;gap:20px;align-content:start">
        <section class="hall-card">
          <h2>✨ The golden arcade</h2>
          <div class="gold-row"><div><b>Golden theme</b><small>Turns the whole arcade gold, on every page.</small></div>
            <button class="switch" role="switch" aria-checked="${Legends.goldThemeOn()}" aria-label="Golden theme" data-theme-switch></button></div>
          <p class="muted small">A 👑 also follows your name on every leaderboard.</p>
        </section>
        <section class="hall-card">
          <h2>🖼️ Your certificate</h2>
          <p class="muted small">A picture of your Golden Crown with your name on it — save it or share it.</p>
          <img class="cert-preview" alt="Golden Crown certificate" hidden>
          <p><button class="btn gold-btn" data-cert>🖼️ Make my certificate</button>
          <a class="btn wa" href="${whatsappLink(`👑 I won the Golden Crown at ${location.origin}/ — all three Golden Eggs, without losing a single life. Can you?`)}" target="_blank" rel="noopener">${WA_ICON} Share</a></p>
        </section>
      </div>
    </div>`;

  const sw = main.querySelector('[data-theme-switch]');
  sw.onclick = () => { const on = sw.getAttribute('aria-checked') !== 'true'; Legends.setGoldTheme(on); sw.setAttribute('aria-checked', on); };
  main.querySelector('[data-cert]').onclick = (e) => makeCertificate(e.currentTarget, at);

  const roll = main.querySelector('[data-roll]');
  Legends.hall().then((rows) => {
    const people = crownHolders(rows), me = myName().toLowerCase();
    roll.innerHTML = people.length ? people.map((p) => `<li class="grand${p.name.toLowerCase() === me ? ' me' : ''}"><b>${esc(p.name)} 👑</b><small>${date(p.crownAt)}</small></li>`).join('')
      : '<li class="muted">Your name appears here once you sign the Hall of Legends at the end of each Legends game — with the same name each time.</li>';
  }).catch(() => { roll.innerHTML = '<li class="muted">The roll is being polished — try again in a minute.</li>'; });
}

/** Draw the certificate onto a canvas and offer it as a PNG. */
async function makeCertificate(btn, at) {
  btn.disabled = true; btn.textContent = 'Painting…';
  const W = 1200, H = 850, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = (svg) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')); });
  // parchment + gold frame
  const bg = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 700);
  bg.addColorStop(0, '#2a1f0b'); bg.addColorStop(1, '#0f0a03');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#fde68a'); gold.addColorStop(0.5, '#f59e0b'); gold.addColorStop(1, '#fde68a');
  g.strokeStyle = gold; g.lineWidth = 14; g.strokeRect(28, 28, W - 56, H - 56);
  g.lineWidth = 3; g.strokeRect(52, 52, W - 104, H - 104);
  for (const [x, y] of [[52, 52], [W - 52, 52], [52, H - 52], [W - 52, H - 52]]) { g.fillStyle = gold; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); }
  try {
    const crown = await img(crownSVG({ size: 320 }));
    g.drawImage(crown, W / 2 - 160, 90, 320, 240);
    const eggs = await Promise.all(legendZones().map((z) => img(eggSVG(z.n, { size: 80 }))));
    const n = eggs.length, gap = 150;
    eggs.forEach((e, i) => g.drawImage(e, W / 2 - ((n - 1) * gap) / 2 + i * gap - 40, 600, 80, 96));
  } catch { /* the words still make a fine certificate */ }
  g.textAlign = 'center'; g.fillStyle = '#fde68a';
  g.font = '700 30px Georgia, "Times New Roman", serif'; g.fillText('This certifies that', W / 2, 390);
  g.font = '900 78px Georgia, "Times New Roman", serif'; g.fillStyle = gold; g.fillText(myName(), W / 2, 470);
  g.font = '700 30px Georgia, "Times New Roman", serif'; g.fillStyle = '#fde68a';
  g.fillText(`won all ${legendZones().length} Golden Eggs without losing a single life`, W / 2, 525);
  g.fillText('and is a Holder of the Golden Crown', W / 2, 565);
  g.font = '600 22px system-ui, sans-serif'; g.fillStyle = '#cdb78a';
  g.fillText(`${date(at)}  ·  ${CONFIG.siteName}  ·  ${location.host}`, W / 2, 760);
  const url = c.toDataURL('image/png');
  const pv = main.querySelector('.cert-preview'); pv.src = url; pv.hidden = false;
  const a = document.createElement('a'); a.href = url; a.download = 'golden-crown-certificate.png'; a.className = 'btn gold-btn'; a.textContent = '⬇️ Save certificate';
  btn.replaceWith(a); a.click();
}

if (Legends.hasGoldenCrown()) open(); else sealed();

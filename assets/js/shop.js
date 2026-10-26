import { Tokens, THEMES, AVATARS, EFFECTS, SOUNDPACKS, FLAIR, EARN, DAILY_CAP } from './tokens.js';
import { Store } from './storage.js';
import { Sound } from './audio.js';
import { siteChrome, esc } from './site.js';

siteChrome();

const $ = (id) => document.getElementById(id);
const fmtN = (n) => n.toLocaleString('en-GB');

function wallet() {
  $('wallet').querySelector('[data-balance]').textContent = Tokens.fmt(Tokens.balance());
  const left = Tokens.leftToday();
  $('wallet').querySelector('[data-today]').textContent = left ? `${fmtN(left)} more can be earned today` : 'Today\'s cap reached — back tomorrow!';
  $('earn').querySelector('[data-cap]').textContent = fmtN(DAILY_CAP);
}

const EARN_ROWS = [
  ['🎯', 'Clear a level', EARN.level], ['⭐', 'Clear a bonus round', EARN.bonus], ['📈', 'Beat your own best score', EARN.best],
  ['📅', 'Play the Daily Challenge', EARN.daily], ['🏅', 'Unlock a badge', EARN.badge], ['🏁', 'Play every game in a zone', EARN.zone], ['🥚', 'Win a Golden Egg', EARN.egg],
];
$('earn-grid').innerHTML = EARN_ROWS.map(([i, t, n]) => `<div class="earn"><span class="ico">${i}</span><span>${t}</span><b>+${n} 🪙</b></div>`).join('');

function themeCard(t) {
  const owned = Tokens.owns(t.id), on = Tokens.theme() === t.id, can = Tokens.canBuy(t.id);
  return `<div class="shop-card${owned ? ' owned' : ''}${on ? ' on' : ''}" data-id="${t.id}">
    <div class="swatch" style="--a:${t.swatch[0]};--b:${t.swatch[1]};--c:${t.swatch[2]}"><i></i><i></i><i></i></div>
    <b>${esc(t.name)}</b>
    <span class="muted small">${esc(t.desc)}</span>
    ${on ? '<button class="btn" disabled>✓ Equipped</button>'
      : owned ? '<button class="btn primary" data-act="equip">Use this theme</button>'
      : `<button class="btn${can ? ' primary' : ''}" data-act="buy" ${can ? '' : 'disabled'}>${can ? 'Buy' : 'Need'} 🪙 ${fmtN(t.price)}</button>`}
  </div>`;
}
function avatarCard(a) {
  const owned = Tokens.owns(a.id), on = Tokens.avatar().id === a.id, can = Tokens.canBuy(a.id);
  return `<button class="avatar-card${owned ? ' owned' : ''}${on ? ' on' : ''}${!owned && !can ? ' cant' : ''}" data-id="${a.id}" data-act="${on ? '' : owned ? 'equip' : 'buy'}" title="${esc(a.name)}" ${on ? 'disabled' : ''}>
    <span class="big">${a.emoji}</span>
    <span class="small">${on ? '✓ On' : owned ? 'Use' : `🪙 ${fmtN(a.price)}`}</span>
  </button>`;
}
/** Effect and sound packs share one card shape. */
function packCard(it, on, kind) {
  const owned = Tokens.owns(it.id), can = Tokens.canBuy(it.id);
  return `<div class="shop-card${owned ? ' owned' : ''}${on ? ' on' : ''}" data-id="${it.id}">
    <div class="pack-ico" aria-hidden="true">${it.emoji}</div>
    <b>${esc(it.name)}</b>
    <span class="muted small">${esc(it.desc)}</span>
    ${kind === 'sfx' ? '<button class="btn small" data-act="preview">🔊 Preview</button>' : ''}
    ${on ? '<button class="btn" disabled>✓ Equipped</button>'
      : owned ? `<button class="btn primary" data-act="equip">Use this pack</button>`
      : `<button class="btn${can ? ' primary' : ''}" data-act="buy" ${can ? '' : 'disabled'}>${can ? 'Buy' : 'Need'} 🪙 ${fmtN(it.price)}</button>`}
  </div>`;
}
function flairCard(f) {
  const owned = Tokens.owns(f.id), on = Tokens.flair() === f.id, can = Tokens.canBuy(f.id);
  return `<button class="avatar-card${owned ? ' owned' : ''}${on ? ' on' : ''}${!owned && !can ? ' cant' : ''}" data-id="${f.id}" data-act="${on ? 'unequip' : owned ? 'equip' : 'buy'}" title="${esc(f.name)}">
    <span class="big">${f.emoji}</span>
    <span class="small">${on ? '✓ On — tap to take off' : owned ? 'Wear' : `🪙 ${fmtN(f.price)}`}</span>
  </button>`;
}
function render() {
  wallet();
  $('theme-grid').innerHTML = THEMES.map(themeCard).join('');
  $('avatar-grid').innerHTML = AVATARS.map(avatarCard).join('');
  $('fx-grid').innerHTML = EFFECTS.map((e) => packCard(e, Tokens.fxPack() === e.id, 'fx')).join('');
  $('sfx-grid').innerHTML = SOUNDPACKS.map((e) => packCard(e, Tokens.sfxPack() === e.id, 'sfx')).join('');
  $('flair-grid').innerHTML = FLAIR.map(flairCard).join('');
}
render();

const kindOf = (id) => THEMES.some((t) => t.id === id) ? 'theme' : AVATARS.some((a) => a.id === id) ? 'avatar'
  : EFFECTS.some((x) => x.id === id) ? 'fx' : SOUNDPACKS.some((x) => x.id === id) ? 'sfx' : 'flair';
const equip = { theme: (id) => Tokens.setTheme(id), avatar: (id) => Tokens.setAvatar(id), fx: (id) => Tokens.setFxPack(id), sfx: (id) => Tokens.setSfxPack(id), flair: (id) => Tokens.setFlair(id) };
function previewPack(id) {
  const prev = Tokens.sfxPack();
  Sound.unlock(); Sound.setPack(id);
  Sound.play('coin'); setTimeout(() => Sound.play('powerup'), 250); setTimeout(() => Sound.play('boom'), 850);
  setTimeout(() => Sound.setPack(prev), 1400);
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || !btn.dataset.act) return;
  const card = btn.closest('[data-id]'), id = card.dataset.id;
  const kind = kindOf(id);
  if (btn.dataset.act === 'preview') return previewPack(id);
  if (btn.dataset.act === 'unequip') { Tokens.setFlair(null); Sound.unlock(); Sound.play('click'); render(); return; }
  if (btn.dataset.act === 'buy') {
    if (!Tokens.buy(id)) return;
    Sound.unlock(); Sound.play('powerup');
    card.classList.add('bought');
  }
  equip[kind](id);
  if (btn.dataset.act === 'equip') { Sound.unlock(); Sound.play('click'); }
  render();
  // the header pill
  Store.onProgress; document.querySelector('.token-pill') && (document.querySelector('.token-pill').innerHTML = `${Tokens.avatarHTML()} ${Tokens.fmt(Tokens.balance())}`);
});

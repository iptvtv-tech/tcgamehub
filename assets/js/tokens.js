// ─────────────────────────────────────────────────────────────
//  ARCADE TOKENS — earned by playing, spent in the shop (/shop/) on cosmetics.
//  Nothing here affects scores or fairness; it's all looks.
//
//  Earning (engine.js calls Tokens.earn): +1 level cleared, +5 bonus round cleared,
//  +10 new personal best, +5 first Daily Challenge of the day, +10 badge, +50 zone
//  completed, +100 Golden Egg. Capped at DAILY_CAP a day.
//
//  Storage: the lifetime total `tokens.earned` and the `owned` map only ever grow,
//  so they merge cleanly across devices with a Legend code (max-merge, like plays).
//  Balance = earned − price of everything owned. Which theme/avatar is equipped is
//  a per-browser setting.
// ─────────────────────────────────────────────────────────────
import { Store } from './storage.js';
import { Sound } from './audio.js';

export const DAILY_CAP = 150;
export const EARN = { level: 1, bonus: 5, best: 10, daily: 5, badge: 10, zone: 50, egg: 100 };

/** Site themes: CSS variable sets in site.css under :root[data-theme="<id>"]. */
export const THEMES = [
  { id: 'classic', name: 'Classic Neon', price: 0,   swatch: ['#0b0b1a', '#22d3ee', '#f472b6'], desc: 'The arcade as it comes.' },
  { id: 'ice',     name: 'Ice',          price: 150, swatch: ['#06121f', '#7dd3fc', '#e0f2fe'], desc: 'Cold blues and frost white.' },
  { id: 'sunset',  name: 'Sunset',       price: 150, swatch: ['#1a0b14', '#fb923c', '#f472b6'], desc: 'Orange skies and pink neon.' },
  { id: 'candy',   name: 'Candy',        price: 150, swatch: ['#1a0f1f', '#f0abfc', '#67e8f9'], desc: 'Bubblegum pink and mint.' },
  { id: 'matrix',  name: 'Matrix',       price: 200, swatch: ['#020a05', '#4ade80', '#bbf7d0'], desc: 'Green on black. Follow the rabbit.' },
  { id: 'lava',    name: 'Lava',         price: 200, swatch: ['#150606', '#f87171', '#fbbf24'], desc: 'Embers, red and gold.' },
  { id: 'midnight',name: 'Midnight',     price: 250, swatch: ['#05060f', '#a78bfa', '#c4b5fd'], desc: 'Deep violet, very dark.' },
  { id: 'retro',   name: 'Retro CRT',    price: 300, swatch: ['#0a0d08', '#d9f99d', '#fde68a'], desc: 'Amber-green phosphor and scanlines.' },
];

/** Avatars: shown by your name on the home page, title screens and game-over panels. */
export const AVATARS = [
  { id: 'a-joystick', emoji: '🕹️', name: 'Joystick', price: 0 },
  { id: 'a-alien',    emoji: '👾', name: 'Invader',  price: 40 },
  { id: 'a-ghost',    emoji: '👻', name: 'Ghost',    price: 40 },
  { id: 'a-robot',    emoji: '🤖', name: 'Robot',    price: 40 },
  { id: 'a-cat',      emoji: '🐱', name: 'Cat',      price: 40 },
  { id: 'a-fox',      emoji: '🦊', name: 'Fox',      price: 40 },
  { id: 'a-frog',     emoji: '🐸', name: 'Frog',     price: 40 },
  { id: 'a-snake',    emoji: '🐍', name: 'Snake',    price: 60 },
  { id: 'a-rocket',   emoji: '🚀', name: 'Rocket',   price: 60 },
  { id: 'a-ufo',      emoji: '🛸', name: 'UFO',      price: 60 },
  { id: 'a-car',      emoji: '🏎️', name: 'Racer',    price: 60 },
  { id: 'a-dice',     emoji: '🎲', name: 'Dice',     price: 60 },
  { id: 'a-fire',     emoji: '🔥', name: 'Fire',     price: 80 },
  { id: 'a-bolt',     emoji: '⚡', name: 'Bolt',     price: 80 },
  { id: 'a-skull',    emoji: '💀', name: 'Skull',    price: 80 },
  { id: 'a-ninja',    emoji: '🥷', name: 'Ninja',    price: 100 },
  { id: 'a-wizard',   emoji: '🧙', name: 'Wizard',   price: 100 },
  { id: 'a-dragon',   emoji: '🐉', name: 'Dragon',   price: 120 },
  { id: 'a-unicorn',  emoji: '🦄', name: 'Unicorn',  price: 120 },
  { id: 'a-trophy',   emoji: '🏆', name: 'Trophy',   price: 150 },
  { id: 'a-gem',      emoji: '💎', name: 'Gem',      price: 150 },
  { id: 'a-astro',    emoji: '👩‍🚀', name: 'Astronaut', price: 150 },
];

/** Effect packs: how every game's particles look (bursts, trails, celebrations). */
export const EFFECTS = [
  { id: 'fx-classic',  name: 'Classic Sparks', price: 0,   desc: 'Crisp square sparks, as the arcade comes.', emoji: '✨' },
  { id: 'fx-confetti', name: 'Confetti',       price: 120, desc: 'Tumbling paper scraps in party colours.',   emoji: '🎊' },
  { id: 'fx-pixel',    name: 'Pixel Bits',     price: 120, desc: 'Chunky 8-bit chunks, snapped to the grid.', emoji: '🟩' },
  { id: 'fx-rainbow',  name: 'Rainbow',        price: 160, desc: 'Every burst cycles through the spectrum.',  emoji: '🌈' },
  { id: 'fx-embers',   name: 'Embers',         price: 160, desc: 'Glowing sparks that drift up like a fire.', emoji: '🔥' },
  { id: 'fx-bubbles',  name: 'Bubbles',        price: 200, desc: 'Round bubbles that float away and pop.',    emoji: '🫧' },
];

/** Sound packs: the voice of every game's sound effects (music is untouched). */
export const SOUNDPACKS = [
  { id: 'sfx-classic', name: 'Arcade Classic', price: 0,   desc: 'The original chip sounds.',                 emoji: '🕹️' },
  { id: 'sfx-8bit',    name: 'Chip 8-bit',     price: 150, desc: 'Everything square, crunchy and retro.',     emoji: '👾' },
  { id: 'sfx-soft',    name: 'Soft Touch',     price: 150, desc: 'Rounded, gentle tones. Easy on the ears.',  emoji: '🌙' },
  { id: 'sfx-laser',   name: 'Laser Show',     price: 200, desc: 'Sharp, zappy, full of edge.',               emoji: '⚡' },
];

/** Name flair: a mark shown beside your name on every leaderboard. */
export const FLAIR = [
  { id: 'flair-spark',  name: 'Spark',   price: 100, emoji: '✨' },
  { id: 'flair-bolt',   name: 'Bolt',    price: 100, emoji: '⚡' },
  { id: 'flair-star',   name: 'Star',    price: 100, emoji: '⭐' },
  { id: 'flair-heart',  name: 'Heart',   price: 100, emoji: '💜' },
  { id: 'flair-fire',   name: 'Fire',    price: 150, emoji: '🔥' },
  { id: 'flair-rocket', name: 'Rocket',  price: 150, emoji: '🚀' },
  { id: 'flair-rainbow',name: 'Rainbow', price: 150, emoji: '🌈' },
  { id: 'flair-gem',    name: 'Gem',     price: 200, emoji: '💎' },
];

const CATALOG = [...THEMES.map((t) => ({ ...t, kind: 'theme' })), ...AVATARS.map((a) => ({ ...a, kind: 'avatar' })),
  ...EFFECTS.map((e) => ({ ...e, kind: 'fx' })), ...SOUNDPACKS.map((e) => ({ ...e, kind: 'sfx' })), ...FLAIR.map((e) => ({ ...e, kind: 'flair' }))];
const byId = (id) => CATALOG.find((i) => i.id === id);
const THEME_KEY = 'arcade:theme';   // mirrored here so theme-boot.js can apply it before the page paints

export const Tokens = {
  EARN, DAILY_CAP, THEMES, AVATARS, EFFECTS, SOUNDPACKS, FLAIR, CATALOG,
  earned() { return Store.tokensEarned(); },
  spent() { return Object.keys(Store.owned()).reduce((sum, id) => sum + (byId(id)?.price || 0), 0); },
  balance() { return Math.max(0, this.earned() - this.spent()); },
  leftToday() { return Math.max(0, DAILY_CAP - Store.tokensToday()); },
  /** Give tokens for an event; returns how many were actually added (0 once the day's cap is hit). */
  earn(what) {
    const n = Math.min(EARN[what] || 0, this.leftToday());
    if (n <= 0) return 0;
    Store.addTokens(n); Store.addTokensToday(n);
    return n;
  },
  owns(id) { const i = byId(id); return !!i && (i.price === 0 || !!Store.owned()[id]); },
  canBuy(id) { const i = byId(id); return !!i && !this.owns(id) && this.balance() >= i.price; },
  buy(id) { if (!this.canBuy(id)) return false; Store.own(id); return true; },

  // ── equipped cosmetics (per browser) ──
  theme() { const t = Store.setting('theme'); return THEMES.some((x) => x.id === t) && this.owns(t) ? t : 'classic'; },
  setTheme(id) {
    if (!this.owns(id)) return false;
    Store.setSetting('theme', id);
    try { localStorage.setItem(THEME_KEY, id); } catch { /* ignore */ }
    this.applyTheme(); return true;
  },
  applyTheme() { try { const t = this.theme(); if (t === 'classic') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; } catch { /* ignore */ } },
  avatar() { const a = Store.setting('avatar'); return AVATARS.find((x) => x.id === a && this.owns(a)) || AVATARS[0]; },
  setAvatar(id) { if (!this.owns(id)) return false; Store.setSetting('avatar', id); return true; },
  // ── effect pack / sound pack / name flair (equipped per browser, like the theme) ──
  fxPack() { const v = Store.setting('fxPack'); return EFFECTS.some((x) => x.id === v) && this.owns(v) ? v : 'fx-classic'; },
  setFxPack(id) { if (!this.owns(id)) return false; Store.setSetting('fxPack', id); return true; },
  sfxPack() { const v = Store.setting('sfxPack'); return SOUNDPACKS.some((x) => x.id === v) && this.owns(v) ? v : 'sfx-classic'; },
  setSfxPack(id) { if (!this.owns(id)) return false; Store.setSetting('sfxPack', id); Sound.setPack(id); return true; },
  /** Equipped flair id, or null. Flair is optional — setFlair(null) takes it off. */
  flair() { const v = Store.setting('flair'); return FLAIR.some((x) => x.id === v) && this.owns(v) ? v : null; },
  setFlair(id) { if (id !== null && !this.owns(id)) return false; Store.setSetting('flair', id); return true; },
  /** The flair mark for a leaderboard row (safe for unknown/absent ids). */
  flairHTML(id) { const f = FLAIR.find((x) => x.id === id); return f ? ` <span class="flair" title="${f.name}">${f.emoji}</span>` : ''; },

  /** <span class="avatar">🕹️</span> for showing by a name */
  avatarHTML(cls = '') { const a = this.avatar(); return `<span class="avatar ${cls}" title="${a.name}">${a.emoji}</span>`; },
  fmt(n) { return `🪙 ${Math.floor(n).toLocaleString('en-GB')}`; },
};

Tokens.applyTheme();
Sound.setPack(Tokens.sfxPack());

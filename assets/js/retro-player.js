// Runs inside retro-vault/player.html (an iframe on the Retro Vault page).
// One emulator per frame load: the Vault reloads the frame to switch games.
//
//  ?game=<id>          → play a hosted ROM from the catalogue
//  ?byor=1&system=<s>  → wait for the parent page to post the visitor's own File
//
// The visitor's ROM is handed over with postMessage (same site only) and given to
// EmulatorJS as a File: it is never uploaded anywhere.
import { GAMES, SYSTEMS } from './retro-catalogue.js';
import { Store } from './storage.js';

const params = new URLSearchParams(location.search);
const idle = document.getElementById('idle');
const say = (html, isErr) => { idle.hidden = false; idle.innerHTML = `<div class="${isErr ? 'err' : ''}">${html}</div>`; };

function start({ system, gameUrl, gameName }) {
  if (!SYSTEMS[system]) { say('That system isn\'t supported here.', true); return; }
  idle.hidden = true;
  const muted = Store.setting('muted') === true;
  Object.assign(window, {
    EJS_player: '#game',
    EJS_core: system,
    EJS_gameUrl: gameUrl,
    EJS_gameName: gameName,
    EJS_pathtodata: '../vendor/emulatorjs/',
    EJS_language: 'en-US',
    EJS_color: '#22d3ee',
    EJS_backgroundColor: '#05050f',
    EJS_startOnLoaded: true,
    EJS_volume: muted ? 0 : 0.5,
    EJS_threads: false,
    // Netplay would connect to another website, so it's switched off.
    EJS_Buttons: { netplay: false },
  });
  // EmulatorJS shows "undefined" as the title of its "tap to resume" pop-up (empty text
  // isn't translated). Patch the text helper so that pop-up reads cleanly.
  window.EJS_ready = () => {
    const emu = window.EJS_emulator;
    if (!emu || emu.__vaultPatched) return;
    const orig = emu.localization.bind(emu);
    emu.localization = (text, log) => {
      if (text === 'Click to resume Emulator') return '▶ Tap to play';
      return orig(text, log) ?? '';
    };
    emu.__vaultPatched = true;
  };
  window.EJS_onGameStart = () => {
    try { parent.postMessage({ retro: 'started', gameName }, location.origin); } catch { /* not framed */ }
  };
  const s = document.createElement('script');
  s.src = '../vendor/emulatorjs/loader.js';
  s.onerror = () => say('The emulator files are missing. Please try again later.', true);
  document.body.appendChild(s);
}

const id = params.get('game');
if (id) {
  const g = GAMES.find((x) => x.id === id && x.host === 'hosted');
  // ROM paths are relative to retro-vault/, which is where this frame lives
  if (g) start({ system: g.system, gameUrl: new URL(g.rom, location.href).href, gameName: g.title });
  else say('That game isn\'t in the Vault.', true);
} else if (params.get('byor')) {
  say('<p>Waiting for your ROM…</p>');
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.retro !== 'rom') return;
    const { file, system } = e.data;
    if (!(file instanceof File)) return;
    start({ system, gameUrl: file, gameName: file.name.replace(/\.[^.]+$/, '') });
  });
  try { parent.postMessage({ retro: 'ready' }, location.origin); } catch { /* not framed */ }
}

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
import { buildTouchControls } from './retro-touch.js';

// Phones and tablets get our own touch controls instead of the emulator's.
const TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
// Shape of each console's picture, so the screen area fits it on phones.
const ASPECT = { nes: '4 / 3', snes: '4 / 3', gb: '10 / 9', gba: '3 / 2', segaMD: '4 / 3', segaMS: '4 / 3', segaGG: '10 / 9', atari2600: '4 / 3', mame: '4 / 3' };

const params = new URLSearchParams(location.search);
const idle = document.getElementById('idle');
const say = (html, isErr) => { idle.hidden = false; idle.innerHTML = `<div class="${isErr ? 'err' : ''}">${html}</div>`; };

function start({ system, gameUrl, gameName }) {
  if (!SYSTEMS[system]) { say('That system isn\'t supported here.', true); return; }
  idle.hidden = true;
  document.documentElement.style.setProperty('--ar', ASPECT[system] || '4 / 3');
  if (TOUCH) {
    document.body.classList.add('touch');
    const pad = document.getElementById('pad');
    let woke = false;
    buildTouchControls(pad, system, (index, down) => {
      const emu = window.EJS_emulator;
      if (!woke) { woke = true; wakeAudio(emu); }   // the first press counts as the tap iPhones need for sound
      try { emu?.gameManager?.simulateInput(0, index, down ? 1 : 0); } catch { /* game not ready yet */ }
    });
  }
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
    if (TOUCH) { try { window.EJS_emulator.toggleVirtualGamepad(false); } catch { /* ignore */ } }
    try { parent.postMessage({ retro: 'started', gameName }, location.origin); } catch { /* not framed */ }
  };
  const s = document.createElement('script');
  s.src = '../vendor/emulatorjs/loader.js';
  s.onerror = () => say('The emulator files are missing. Please try again later.', true);
  document.body.appendChild(s);
}

/** iPhones keep game sound muted until a tap; resume it from our own button presses too. */
function wakeAudio(emu) {
  try { emu?.Module?.AL?.currentCtx?.sources?.forEach((src) => src.gain?.context?.resume?.()); } catch { /* ignore */ }
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

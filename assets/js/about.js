import { siteChrome } from './site.js';
import { CONFIG } from './config.js';
siteChrome();
// The visitor-statistics lines only show when stats are switched on in config.js.
if ((CONFIG.goatcounter || '').trim()) document.querySelectorAll('[data-stats]').forEach((el) => { el.hidden = false; });

// Soft reset for a corrupt or unwanted save (audit P1). Two taps so it can't happen by accident.
import { Store } from './storage.js';
const resetBtn = document.querySelector('[data-soft-reset]');
const resetMsg = document.querySelector('[data-reset-msg]');
let armed = 0;
resetBtn?.addEventListener('click', () => {
  if (Date.now() - armed > 4000) { armed = Date.now(); resetBtn.textContent = 'Tap again to confirm'; resetMsg.textContent = 'This clears scores, badges and progress saved on this browser.'; return; }
  Store.softReset();
  armed = 0; resetBtn.textContent = 'Reset saved data on this browser'; resetMsg.textContent = 'Done — this browser starts fresh.';
});

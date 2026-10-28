import { siteChrome } from './site.js';
import { CONFIG } from './config.js';
import { countingState, setCounting } from './stats.js';
siteChrome();
// The visitor-statistics lines only show when stats are switched on in config.js.
if ((CONFIG.goatcounter || '').trim()) document.querySelectorAll('[data-stats]').forEach((el) => { el.hidden = false; });

// "Don't count this browser" switch (same as opening any page with ?nostats).
const countText = document.querySelector('[data-stats-state]');
const countBtn = document.querySelector('[data-stats-toggle]');
function showCounting() {
  if (!countText || !countBtn) return;
  const s = countingState();
  countText.textContent = s === 'dnt' ? 'Your browser sends "Do Not Track", so it is never counted.'
    : s === 'none' ? 'Nothing is counted on this address.'
    : s === 'off' ? 'This browser is not counted.'
    : 'Visits from this browser are counted.';
  countBtn.hidden = s === 'dnt' || s === 'none';
  countBtn.textContent = s === 'off' ? 'Count this browser again' : 'Don\'t count this browser';
}
countBtn?.addEventListener('click', () => { setCounting(countingState() === 'off'); showCounting(); });
showCounting();

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

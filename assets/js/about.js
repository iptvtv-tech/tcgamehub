import { siteChrome } from './site.js';
import { CONFIG } from './config.js';
siteChrome();
// The visitor-statistics lines only show when stats are switched on in config.js.
if ((CONFIG.goatcounter || '').trim()) document.querySelectorAll('[data-stats]').forEach((el) => { el.hidden = false; });

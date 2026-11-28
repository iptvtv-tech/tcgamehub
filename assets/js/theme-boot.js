// Runs first on every page, before anything reads the save:
//  1. Progress carried over from the old address (tcgamehub.win → tcarcade.com, Nov 2026).
//     A browser keeps saved data per address, so the old address hands it over in the link:
//     https://tcarcade.com/<page>#carry=<data> (assets/js/carry-out.js makes that link).
//     The part after # never leaves the browser. It is merged in here and taken out of the
//     address bar straight away. Merging only ever adds: nothing already on this browser is lost.
//     If the link did not come from the old address (no referrer), it is kept for this tab and
//     the page asks first (site.js, "Bring your saved progress?").
//  2. The equipped arcade theme, applied before the page paints (so there's no flash of the
//     default colours). tokens.js checks ownership and corrects this once it loads.
(function (root) {
  var OLD = 'https://tcgamehub.win';
  var PENDING = 'arcade:carry-pending';   // sessionStorage: a carry waiting for a yes
  var DONE = 'arcade:carried';            // localStorage: when progress last came across

  var isObj = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var num = function (v) { return typeof v === 'number' && isFinite(v) && v >= 0; };
  var parse = function (s) { try { return JSON.parse(s); } catch (e) { return undefined; } };

  /** base64url → text (UTF-8) */
  function decode(b64) {
    var s = atob(String(b64).replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ── merging the main save (arcade:v1, see storage.js) ──
  var MAX = ['best', 'maxLevel', 'plays', 'tokens', 'resets'];   // keep the higher number
  var FIRST = ['ach', 'owned'];                                    // timestamps: keep the earlier one
  function mergeSave(mine, theirs) {
    if (!isObj(theirs)) return mine;
    if (!isObj(mine)) return theirs;
    var out = {}, k;
    for (k in theirs) out[k] = theirs[k];
    for (k in mine) if (mine[k] !== undefined && mine[k] !== null) out[k] = mine[k];   // this browser wins by default
    var myResets = isObj(mine.resets) ? mine.resets : {}, theirResets = isObj(theirs.resets) ? theirs.resets : {};
    MAX.concat(FIRST).forEach(function (key) {
      var a = isObj(mine[key]) ? mine[key] : {}, b = isObj(theirs[key]) ? theirs[key] : {}, m = {}, id;
      for (id in a) if (num(a[id])) m[id] = a[id];
      for (id in b) {
        if (!num(b[id])) continue;
        // a game that was reset after the old save was made: its old best/level don't come back
        if ((key === 'best' || key === 'maxLevel') && (myResets[id] || 0) > (theirResets[id] || 0)) continue;
        if (m[id] === undefined) m[id] = b[id];
        else m[id] = FIRST.indexOf(key) >= 0 ? Math.min(m[id], b[id]) : Math.max(m[id], b[id]);
      }
      out[key] = m;
    });
    // offline leaderboard entries: both lists, no doubles, newest 600
    var seen = {}, local = [];
    [].concat(Array.isArray(theirs.local) ? theirs.local : [], Array.isArray(mine.local) ? mine.local : []).forEach(function (e) {
      var key = JSON.stringify(e);
      if (isObj(e) && !seen[key]) { seen[key] = 1; local.push(e); }
    });
    out.local = local.slice(-600);
    // settings (sound, equipped theme/avatar/packs): this browser's choice wins, the old one fills gaps
    var set = {};
    if (isObj(theirs.settings)) for (k in theirs.settings) set[k] = theirs.settings[k];
    if (isObj(mine.settings)) for (k in mine.settings) set[k] = mine.settings[k];
    out.settings = set;
    // Legend record: every crystal from both, the earliest dates (crownAt decides the four-crystal
    // rule, so the earliest crowning must survive), and the code that holds the most crystals
    var la = isObj(mine.legend) ? mine.legend : null, lb = isObj(theirs.legend) ? theirs.legend : null;
    if (la && lb) {
      var games = (Array.isArray(la.games) ? la.games : []).slice();
      (Array.isArray(lb.games) ? lb.games : []).forEach(function (g) { if (games.indexOf(g) < 0) games.push(g); });
      var leg = {};
      for (k in lb) leg[k] = lb[k];
      for (k in la) if (la[k] !== undefined && la[k] !== null) leg[k] = la[k];
      leg.games = games;
      if (num(la.at) && num(lb.at)) leg.at = Math.min(la.at, lb.at);
      if (num(la.crownAt) || num(lb.crownAt)) leg.crownAt = Math.min(num(la.crownAt) ? la.crownAt : Infinity, num(lb.crownAt) ? lb.crownAt : Infinity);
      if (lb.code && (!la.code || (lb.codeGames || 1) > (la.codeGames || 1))) { leg.code = lb.code; leg.name = lb.name; leg.codeGames = lb.codeGames; }
      out.legend = leg;
    }
    // daily streak and today's token count: whichever is more recent (and the higher count for the same day)
    if (isObj(mine.daily) && isObj(theirs.daily)) out.daily = String(theirs.daily.last) > String(mine.daily.last) ? theirs.daily : mine.daily;
    if (isObj(mine.tokenDay) && isObj(theirs.tokenDay)) {
      var ta = mine.tokenDay, tb = theirs.tokenDay;
      out.tokenDay = ta.date === tb.date ? { date: ta.date, n: Math.max(ta.n || 0, tb.n || 0) } : (String(tb.date) > String(ta.date) ? tb : ta);
    }
    // new revision, so a Legend code saves the merged progress online on the next sync
    out.rev = Math.max(num(mine.rev) ? mine.rev : 0, num(theirs.rev) ? theirs.rev : 0) + 1;
    if (mine.syncedRev === undefined) delete out.syncedRev; else out.syncedRev = mine.syncedRev;
    return out;
  }

  /** Merge one saved key; returns the string to store, or null to leave this browser's value alone. */
  function mergeKey(key, mineStr, theirsStr) {
    if (typeof theirsStr !== 'string') return null;
    if (mineStr === null || mineStr === undefined) return theirsStr;
    if (key === 'arcade:v1') {
      var a = parse(mineStr), b = parse(theirsStr);
      if (!isObj(b)) return null;
      return JSON.stringify(isObj(a) ? mergeSave(a, b) : b);
    }
    if (key === 'arcade:zone-done') {   // { zone: 1 } celebrations already shown
      var za = parse(mineStr), zb = parse(theirsStr), z = {}, n;
      if (!isObj(zb)) return null;
      if (isObj(za)) for (n in za) z[n] = za[n];
      for (n in zb) z[n] = zb[n];
      return JSON.stringify(z);
    }
    if (key === 'arcade:retro-played') {   // Retro Vault games started (a list)
      var ra = parse(mineStr), rb = parse(theirsStr);
      if (!Array.isArray(rb)) return null;
      var list = Array.isArray(ra) ? ra.slice() : [];
      rb.forEach(function (x) { if (typeof x === 'string' && list.indexOf(x) < 0) list.push(x); });
      return JSON.stringify(list.slice(0, 50));
    }
    return null;   // theme, sound packs, "don't count me" and the rest: this browser's choice stands
  }

  /** Fold a carried bundle { v: 1, k: { key: value } } into this browser. Returns how many keys changed. */
  function apply(bundle, store) {
    if (!isObj(bundle) || bundle.v !== 1 || !isObj(bundle.k)) return 0;
    var changed = 0;
    for (var key in bundle.k) {
      if (!/^arcade:[a-z0-9-]{1,40}$/.test(key) || key === DONE || key === PENDING) continue;
      var next = mergeKey(key, store.getItem(key), bundle.k[key]);
      if (next !== null && next !== store.getItem(key)) { store.setItem(key, next); changed++; }
    }
    store.setItem(DONE, JSON.stringify({ at: Date.now(), from: OLD }));
    return changed;
  }

  /** Read #carry= from the address bar; take it out of the address. Returns the bundle or null. */
  function takeFromHash(loc, hist) {
    var m = /(?:^#|&)carry=([A-Za-z0-9_-]+)/.exec(loc.hash || '');
    if (!m) return null;
    try { hist.replaceState(hist.state, '', loc.pathname + loc.search); } catch (e) { /* ignore */ }
    try { return JSON.parse(decode(m[1])); } catch (e) { return null; }
  }

  var api = { mergeSave: mergeSave, mergeKey: mergeKey, apply: apply, decode: decode, takeFromHash: takeFromHash, OLD: OLD, PENDING: PENDING, DONE: DONE };
  root.ArcadeCarry = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }   // Node tests

  try {
    var bundle = takeFromHash(location, history);
    if (bundle) {
      var fromOld = String(document.referrer || '').indexOf(OLD + '/') === 0;
      if (fromOld) apply(bundle, localStorage);
      else sessionStorage.setItem(PENDING, JSON.stringify(bundle));   // ask first (site.js)
    }
  } catch (e) { /* storage unavailable: nothing to carry into */ }

  try {
    var t = localStorage.getItem('arcade:theme');
    if (t && t !== 'classic' && /^[a-z]+$/.test(t)) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable */ }
})(typeof window !== 'undefined' ? window : globalThis);

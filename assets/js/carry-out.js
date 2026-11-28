// Moving day (tcgamehub.win → tcarcade.com): hands this browser's saved progress to the new
// address. A browser keeps saved data per address, so this page, opened on the OLD address,
// reads it and goes to the same page on the new address with the progress in the link after #
// (that part never leaves the browser). theme-boot.js on the new address merges it in.
//
// Opened two ways (see carry/index.html):
//  • by the service worker (sw.js) on a returning player's first visit after the move: the
//    old address answers with a redirect, so the worker shows this page instead;
//  • by the "Bring my progress" link on the new address: https://tcgamehub.win/carry/
(function () {
  var NEW = 'https://tcarcade.com';
  var SENT = 'arcade:carried-out';    // set here, on the old address, once progress has gone across
  var LIMIT = 30000;                  // keep the link well inside every browser's address length

  function encode(text) {
    var bytes = new TextEncoder().encode(text), s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // where to go: the same page on the new address (/carry/ itself → its ?to= page, or the home page)
  var path = location.pathname + location.search;
  if (/^\/carry\/?$/.test(location.pathname)) {
    var to = new URLSearchParams(location.search).get('to') || '/';
    path = /^\/[A-Za-z0-9/_.-]*$/.test(to) && to.indexOf('//') < 0 ? to : '/';
  }
  var target = NEW + path;
  var asked = /^\/carry\/?$/.test(location.pathname);   // the player asked: always send

  var keys = {}, any = false;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^arcade:[a-z0-9-]{1,40}$/.test(k) && k !== SENT && k !== 'arcade:carried') { keys[k] = localStorage.getItem(k); any = true; }
    }
    if (!asked && localStorage.getItem(SENT)) any = false;   // already went across once: just go
  } catch (e) { any = false; }

  if (!any) { location.replace(target); return; }

  var bundle = { v: 1, k: keys };
  var code = encode(JSON.stringify(bundle));
  // very long offline score lists: drop the oldest entries until the link fits
  if (code.length > LIMIT && keys['arcade:v1']) {
    try {
      var save = JSON.parse(keys['arcade:v1']);
      while (code.length > LIMIT && save.local && save.local.length) {
        save.local = save.local.slice(Math.ceil(save.local.length / 4));
        keys['arcade:v1'] = JSON.stringify(save);
        code = encode(JSON.stringify(bundle));
      }
    } catch (e) { /* keep what we have */ }
  }
  try { localStorage.setItem(SENT, String(Date.now())); } catch (e) { /* ignore */ }
  location.replace(target + '#carry=' + code);
})();

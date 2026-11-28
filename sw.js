// Offline support: always try the network first (so updates show up straight away),
// and fall back to the last cached copy when the visitor is offline.
// Bump CACHE_VERSION with every release: old caches are deleted when the new worker activates.
const CACHE_VERSION = '2026-11-28c';
const CACHE = 'arcade-' + CACHE_VERSION;
const OFFLINE = new URL('offline.html', self.registration.scope).href;

// The Retro Vault's emulator and ROMs are big (cores up to 5 MB) and almost never change, so
// they live in their own cache that a release does NOT throw away. Bump RETRO_CACHE only when
// vendor/emulatorjs or retro-vault/roms changes in a way old copies must not survive.
const RETRO_CACHE = 'arcade-retro-1';
const isRetro = (url) => /\/(vendor\/emulatorjs|retro-vault\/roms)\//.test(url.pathname);

// Moving day (Nov 2026): the arcade moves from tcgamehub.win to tcarcade.com. Saved progress is
// kept per address, so on the old address a page that now answers with a redirect to the new
// one is replaced by carry/index.html, which takes the progress along (assets/js/carry-out.js).
const NEW_ORIGIN = 'https://tcarcade.com';
const CARRY_PAGE = new URL('carry/', self.registration.scope).href;
/** Does this address now redirect to the new one? (asks once more, following the redirect) */
const movedToNew = (url) => fetch(url, { redirect: 'follow', credentials: 'omit', cache: 'no-store' })
  .then((r) => new URL(r.url).origin === NEW_ORIGIN).catch(() => false);

// Saved up front, so the home page opens offline even on a first visit that never got further
// than one page. Everything else is saved as it is visited (see the fetch handler).
const SHELL = [
  './', 'games/', 'carry/', 'assets/js/carry-out.js', 'manifest.webmanifest', 'favicon.svg', 'assets/img/icon-192.png',
  'assets/css/site.css', 'assets/css/game.css',
  ...['theme-boot', 'config', 'site', 'stats', 'storage', 'tokens', 'legends', 'games', 'scores',
    'eggs', 'zones', 'home', 'browse', 'engine', 'audio', 'rng'].map((m) => `assets/js/${m}.js`),
].map((p) => new URL(p, self.registration.scope).href);

self.addEventListener('install', (e) => {
  // keep the offline page ready before taking over; the shell is best-effort (one missing
  // file must never stop the worker installing)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE]).catch(() => {})
    .then(() => Promise.all(SHELL.map((u) => fetch(u, { cache: 'no-cache' })
      .then((res) => (res.ok ? c.put(u, res) : null)).catch(() => {})))))
    .catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== RETRO_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only handle our own files; leave Supabase and GoatCounter alone.
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate';
  e.respondWith(
    // 'no-cache' asks the server whether the file changed (cheap), so a new upload shows up on the next visit
    fetch(req, { cache: 'no-cache' }).then(async (res) => {
      // a page that redirects (res.type 'opaqueredirect'): if it's the move, carry the progress
      if (isPage && res.type === 'opaqueredirect' && location.origin !== NEW_ORIGIN && await movedToNew(req.url)) {
        const carry = await caches.match(CARRY_PAGE);
        // a fresh copy, so the page keeps the address asked for (carry-out.js goes to that page)
        if (carry) return new Response(await carry.blob(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      if (res.ok) { const copy = res.clone(); caches.open(isRetro(url) ? RETRO_CACHE : CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      // a page we've never saved: show the friendly offline page
      if (isPage) return (await caches.match(OFFLINE)) || Response.error();
      return Response.error();
    })
  );
});

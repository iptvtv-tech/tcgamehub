// Offline support: always try the network first (so updates show up straight away),
// and fall back to the last cached copy when the visitor is offline.
// Bump CACHE_VERSION with every release: old caches are deleted when the new worker activates.
const CACHE_VERSION = '2026-10-30d';
const CACHE = 'arcade-' + CACHE_VERSION;
const OFFLINE = new URL('offline.html', self.registration.scope).href;

self.addEventListener('install', (e) => {
  // keep the offline page ready before taking over
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE])).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
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

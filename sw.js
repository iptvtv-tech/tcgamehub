// Offline support: always try the network first (so updates show up straight away),
// and fall back to the last cached copy when the visitor is offline.
const CACHE = 'arcade-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only handle our own files; leave Supabase and Google Fonts alone.
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // 'no-cache' asks the server whether the file changed (cheap), so a new upload shows up on the next visit
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match(new URL('./', self.registration.scope))))
  );
});

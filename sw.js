// Offline-Fähigkeit: App-Dateien zwischenspeichern, bei Netz immer die neueste Version holen.
// Die Familiendaten selbst puffert Firestore, daher werden Datenbank-Anfragen hier nicht angefasst.
const CACHE = 'familienmahlzeit-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const CDN = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !CDN.includes(url.hostname)) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

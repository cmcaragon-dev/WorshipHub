/* CHORDIO offline application shell */
const CACHE = 'chordio-shell-v1';
const RUNTIME = 'chordio-runtime-v1';
const SHELL = [
  './', './index.html', './login.html', './register.html', './settings.html',
  './custom-song.html', './multi-screen-output.html', './offline.html',
  './manifest.json', './css/style.css', './css/responsive.css', './css/modern.css',
  './js/pwa.js', './js/app.js', './js/auth.js', './js/firebase.js', './js/firestore.js', './js/initial-songs.js',
  './js/admin-settings.js', './js/song-editor.js', './js/song-edit.js',
  './js/presentation-runtime.js', './js/custom-song-runtime.js', './js/chordio-v63-ux.js',
  './js/print-preview.js', './js/register.js',
  './images/chordio-favicon.png', './images/chordio-logo.png', './images/chordio-topbar.png',
  './images/WHlogo.png', './data/offline-bible.json', './data/artist.json', './data/genre.json', './data/keys.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![CACHE, RUNTIME].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function isFirebaseRequest(url) {
  return url.hostname === 'firestore.googleapis.com' || url.hostname === 'securetoken.googleapis.com' || url.hostname === 'identitytoolkit.googleapis.com' || url.hostname === 'www.googleapis.com' || url.hostname === 'firebaseinstallations.googleapis.com';
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isFirebaseRequest(url)) return; // Firebase SDK manages its own offline queue/cache.

  // CDN modules: cache after first successful load so the already-used app can start offline.
  const isCdn = url.hostname === 'www.gstatic.com';
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isCdn) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(RUNTIME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('./offline.html');
        return cached || new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

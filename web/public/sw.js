const CACHE = 'yallaliv-v4'; // v4: network-first — l'app se met à jour à chaque ouverture (réseau d'abord)
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-512.png'];

// Ne pas cacher les assets de dev Vite (HMR)
const isDevAsset = (u) => u.pathname.startsWith('/src/') || u.pathname.startsWith('/@') || u.pathname.startsWith('/node_modules');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api')) return;
  if (isDevAsset(url)) return; // dev : laisser passer le réseau
  // NETWORK-FIRST : on prend TOUJOURS la version du réseau quand il est là (donc chaque
  // déploiement arrive dans l'app), et le cache ne sert qu'en secours hors-ligne.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html')))
  );
});

// ---- Push notifications (reçues même app fermée) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(
    self.registration.showNotification(d.title || 'YallaLiv 🚀', {
      body: d.body || '',
      icon: '/icons/icon-512.png',
      badge: '/icons/icon-512.png',
      data: { url: d.url || '/' },
      dir: 'auto'
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url ? e.notification.data.url : '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) return c.focus().then(() => c.navigate ? c.navigate(url) : null);
      }
      return self.clients.openWindow(url);
    })
  );
});

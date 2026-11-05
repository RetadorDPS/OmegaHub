/* =============================================================
   Maze Runner Mobile — Service Worker
   Precarga el "app shell" para jugar sin conexión. Nunca cachea
   peticiones a otro origen (Supabase): esas siempre van a la red.
   ============================================================= */

const CACHE = 'maze-runner-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/main.js',
  'src/config.js',
  'src/rng.js',
  'src/storage.js',
  'src/audio.js',
  'src/assets.js',
  'src/textures.js',
  'src/world.js',
  'src/player.js',
  'src/entities.js',
  'src/render.js',
  'src/minimap.js',
  'src/input.js',
  'src/ui.js',
  'src/game.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => { /* algún recurso falló: no bloquea la instalación */ }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase y otros: siempre a la red

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});

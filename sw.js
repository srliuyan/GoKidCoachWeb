const cacheName = "gokidcoach-web-v21";
const assets = [
  "./",
  "./index.html",
  "./styles.css",
  "./engine-analysis.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/t-rex-victory.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== cacheName).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

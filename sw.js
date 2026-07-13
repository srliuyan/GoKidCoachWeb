const cacheName = "gokidcoach-web-v39-rc1";
const assets = [
  "./",
  "./index.html",
  "./styles.css",
  "./engine-analysis.js",
  "./offline-policy.js",
  "./policy-pattern.js",
  "./shape-library.js",
  "./fuseki-library.js",
  "./tactical-library.js",
  "./joseki-library.js",
  "./endgame-library.js",
  "./opening-book.js",
  "./rule-engine.js",
  "./position-evaluator.js",
  "./midgame-stability.js",
  "./context-fusion.js",
  "./product-support.js",
  "./student-model.js",
  "./difficulty-controller.js",
  "./companion-engine.js",
  "./move-quality-controller.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/offline-policy-model.json",
  "./assets/pattern-db.json",
  "./assets/shape-library.json",
  "./assets/fuseki-db.json",
  "./assets/tactical-db.json",
  "./assets/joseki-db.json",
  "./assets/endgame-db.json",
  "./assets/opening-book.json",
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

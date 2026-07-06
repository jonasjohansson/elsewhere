/* WWW '26 service worker — precache the app shell + data for full offline use. */
var CACHE = "www26-v3";
var ASSETS = [
  "./", "index.html", "style.css", "app.js", "ics.js",
  "events.json", "manifest.webmanifest",
  "icons/icon.svg", "icons/pwa-192.png", "icons/pwa-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Add individually so one missing asset doesn't abort the whole install.
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        // Runtime-cache same-origin GETs (e.g. events.json refreshes).
        if (res && res.status === 200 && e.request.url.indexOf(self.location.origin) === 0) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match("index.html");
      });
    })
  );
});

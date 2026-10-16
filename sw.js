// Offline support for the English check-in app.
// Pages: try the network first (so updates arrive), fall back to the saved copy after 4 s or when offline.
// Audio packs are cached by the app itself; this worker only keeps the page, icon and audio index.
var SHELL = 'shell-v7';
var CORE = ['./', './index.html', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(CORE).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req, key, ms) {
  return new Promise(function (resolve) {
    var done = false;
    var fallback = function () {
      if (done) return; done = true;
      caches.match(key || req, { ignoreSearch: true }).then(function (hit) { resolve(hit || fetch(req)); });
    };
    var t = setTimeout(fallback, ms);
    fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(key || req, cp); }); }
      if (!done) { done = true; clearTimeout(t); resolve(r); }
    }).catch(function () { clearTimeout(t); fallback(); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(path)) {
    e.respondWith(networkFirst(req, './index.html', 4000));
    return;
  }
  if (/\/audio\/index\.json$/.test(path)) {
    e.respondWith(networkFirst(req, './audio/index.json', 4000));
    return;
  }
  if (/\/audio\/.+\.bin$/.test(path)) return; // handled by the app's own cache
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(req, cp); }); }
      return r;
    });
  }));
});

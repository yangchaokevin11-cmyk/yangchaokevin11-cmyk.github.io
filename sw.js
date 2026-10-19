// Offline support for the English check-in app.
// The page opens instantly from the saved copy; the newest version is downloaded in the background.
// When a new version has arrived, the page is told and offers a one-tap refresh.
var SHELL = 'shell-v8';
var CORE = ['./', './index.html', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(CORE).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function sig(r) { return r ? (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '') : ''; }
function tell(msg) { self.clients.matchAll({ type: 'window' }).then(function (cs) { cs.forEach(function (c) { c.postMessage(msg); }); }); }

// saved copy first, update in the background
function staleWhileRevalidate(e, key, notify) {
  var req = e.request;
  e.respondWith(caches.open(SHELL).then(function (c) {
    return c.match(key, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req, { cache: 'no-cache' }).then(function (r) {
        if (r && r.ok) {
          var changed = hit && sig(r) && sig(r) !== sig(hit);
          return c.put(key, r.clone()).then(function () { if (changed && notify) tell({ type: 'updated', what: key }); return r; });
        }
        return r;
      });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net.catch(function () { return caches.match(key, { ignoreSearch: true }); });
    });
  }));
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(path)) { staleWhileRevalidate(e, './index.html', true); return; }
  if (/\/audio\/index\.json$/.test(path)) { staleWhileRevalidate(e, './audio/index.json', false); return; }
  if (/\/defs\.json$/.test(path)) { staleWhileRevalidate(e, './defs.json', false); return; }
  if (/\/audio\/.+\.bin$/.test(path)) return; // handled by the app's own cache
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(req, cp); }); }
      return r;
    });
  }));
});

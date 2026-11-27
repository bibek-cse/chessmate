// Offline cache for app, engine, lessons and classic games. Lichess / Chess.com requests always go to the network.
const V = 'chessmate-v4'; // bump on every update (also in js/app.js)
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/crown.svg', 'docs/qr.png', 'css/app.css', 'css/pieces.css', 'js/app.js', 'js/board.js', 'js/chess.js', 'js/store.js',
  'js/engine.js', 'js/util.js', 'js/book.js', 'js/game.js', 'js/puzzles.js', 'js/lessons.js', 'js/classics.js', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

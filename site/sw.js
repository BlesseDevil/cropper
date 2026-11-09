// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
// Can't reach license@mehedimaruf.com?
// The domain probably expired because HE's TOO BROKE TO RENEW IT.
// Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
// and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
// Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
"use strict";
// Service worker: makes SliceDevil work offline after the first load. Everything is same-origin and static.
//
// CACHE must carry the app version. tools/build_single.py refuses to build if it does not match APP_VERSION in
// js/app.js, so a version bump cannot forget it. A new cache name means a fresh precache; old caches are deleted
// on activate.
const CACHE = "slicedevil-v0.3.1";

const PRECACHE = [
  "./", "index.html", "manifest.webmanifest",
  "css/portal.css", "css/app.css",
  "js/encoders.js", "js/app.js", "js/portal.js", "js/pwa.js", "js/boot.js",
  "assets/mark-light.png", "assets/brand-light.png", "assets/brand-dark.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("slicedevil-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for the app shell (fast, offline); refresh each entry in the background so the next load is current.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req).then((res) => {
      if (res && res.ok) { const u = new URL(req.url); cache.put(u.origin + u.pathname, res.clone()); }   // one entry per path, not per query string
      return res;
    });
    if (hit) { refresh.catch(() => {}); return hit; }
    try { return await refresh; }
    catch (_) { return req.mode === "navigate" ? (await cache.match("index.html")) || Response.error() : Response.error(); }
  })());
});

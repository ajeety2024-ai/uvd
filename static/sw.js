// UVD Ultra-Reliable Service Worker for Android PWA
// Copyright (c) 2026 Ajeet Yadav. All Rights Reserved.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Direct native pass-through - eliminates all WebAPK cache-crash and blink bugs
self.addEventListener('fetch', (event) => {
  return;
});

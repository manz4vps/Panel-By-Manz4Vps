// Service Worker biar Chrome HP ngizinin lu install PWA
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
    // Lewatin cache biar web lu tetep update realtime
    e.respondWith(fetch(e.request));
});
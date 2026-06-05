const CACHE_NAME = "lawpath-sa-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/assets/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // API requests: network-first, no cache
  if (event.request.url.includes("/api/")) {
    return;
  }
  // Navigation requests: serve index.html from cache for SPA routing
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/index.html").then((r) => r || fetch(event.request))
      )
    );
    return;
  }
  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && event.request.method === "GET") {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
      }
      return response;
    }))
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json().catch(() => ({ title: "LawPath SA", body: "New notification" }));
  event.waitUntil(
    self.registration.showNotification(data.title || "LawPath SA", {
      body: data.body || "",
      icon: "/assets/favicon.ico",
      badge: "/assets/favicon.ico",
      tag: data.tag || "lawpath-notification",
      data: data.url ? { url: data.url } : undefined
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});

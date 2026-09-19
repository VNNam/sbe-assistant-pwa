const CACHE_NAME = "sbe-assistant-v2";

const ASSETS_TO_CACHE = ["/", "/index.html", "/js/index.js", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Đã lưu cache cho chế độ offline");
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Xóa bỏ các cache cũ khi có phiên bản Service Worker mới
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Đối với API: Network-first, nếu lỗi rớt mạng thì trả về 503 fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: "Ngoại tuyến" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    return;
  }

  // 2. Chỉ cache các request GET đối với static assets
  if (event.request.method !== "GET") {
    return;
  }

  // 3. Cache-First cho static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Chỉ cache các phản hồi HTTP 200 thành công
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === "basic" ||
              networkResponse.type === "default")
          ) {
            // Clone ngay lập tức một cách đồng bộ trước khi body stream bị browser consume
            const responseToCache = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => {
          console.log("Không thể tải tài nguyên từ mạng hoặc đang offline.");
        });
    }),
  );
});

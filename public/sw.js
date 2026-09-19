const CACHE_NAME = "sbe-assistant-v3";

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
  // Xóa bỏ tất cả các cache cũ
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

  // 1. TUYỆT ĐỐI KHÔNG can thiệp vào các API routes (/api/*).
  // Để trình duyệt trực tiếp gửi POST request tới server, không lo bị biến đổi method hay lỗi body.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. Chỉ can thiệp vào các request GET đối với static assets
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

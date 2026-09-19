const CACHE_NAME = "sbe-assistant-v1";

const ASSETS_TO_CACHE = ["/", "/index.html", "/js/index.js", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Đã lưu cache cho chế độ offline");
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bắt và xử lý lỗi cho API khi rớt mạng
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

  // Xử lý tài nguyên tĩnh
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => {
          console.log("Đang dùng dữ liệu tĩnh từ Cache Storage");
        });
      return cachedResponse || fetchPromise;
    }),
  );
});

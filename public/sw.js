const CACHE = "attendance-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Install - يحمل الجديد ويتخطى الانتظار فوراً (يحل مشكلة كروم موبايل)
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS).catch(()=>{}))
  );
});

// Activate - يمسح الكاش القديم ويستلم التحكم فوراً
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// يسمح للتطبيق يطلب التحديث فوراً بدون مسح البيانات
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch - للـ HTML استخدم الشبكة أولاً حتى يجيب التحديثات، للباقي كاش أولاً
self.addEventListener("fetch", (event) => {
  const req = event.request;
  // لا تتعامل مع طلبات خارج النطاق
  if (!req.url.startsWith(self.location.origin)) return;
  
  // لصفحات HTML - Network First حتى يجيب التحديث الجديد
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // للملفات الأخرى - Cache First مع تحديث بالخلفية
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(()=> cached);
      return cached || fetched;
    })
  );
});

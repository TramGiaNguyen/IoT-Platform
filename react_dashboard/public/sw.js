/**
 * Service Worker — stale-while-revalidate cho IoT Dashboard API
 *
 * Chiến lược:
 * - Ưu tiên trả cache tức thì (instant)
 * - Song song fetch API mới → update cache
 * - Nếu cả cache và network đều thất bại → trả empty response
 *
 * Chỉ cache các endpoint dashboard chính, không cache mutation endpoints.
 */

const CACHE_NAME = 'iot-api-v1';

// Các endpoint pattern cần cache — exact match hoặc prefix
// Lưu ý: KHÔNG cache GET /rules, /rooms, /devices (danh sách) — sau CRUD, stale-while-revalidate
// trả cache cũ ngay lập tức nên UI không cập nhật cho đến khi F5 hoặc TTL.
const API_PATTERNS = [
  /\/devices\/latest-all/,         // GET /devices/latest-all (dashboard)
  /\/dashboards/,                  // GET /dashboards, /dashboards/:id
  /\/stats\//,                     // GET /stats/hourly, /stats/daily
  /\/rooms\/\d+\/data/,           // GET /rooms/:id/data
];

// Các request KHÔNG cache (mutation, authenticated)
const EXCLUDE_PATTERNS = [
  /^POST$/,
  /^PUT$/,
  /^DELETE$/,
];

const shouldCache = (request) => {
  if (request.method !== 'GET') return false;
  if (EXCLUDE_PATTERNS.some(p => p.test(request.method))) return false;
  return API_PATTERNS.some(p => p.test(request.url));
};

// ── Install: pre-cache shell ────────────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: clear old cache ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k.startsWith('iot-api-'))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: stale-while-revalidate ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (!shouldCache(event.request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);

      // Fetch song song — update cache khi có response mới
      const fetchAndCache = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            // Clone vì response body chỉ đọc được 1 lần
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Cache tồn tại → trả ngay, song song fetch để update
        fetchAndCache;
        return cached;
      }

      // Không có cache → chờ fetch, hoặc trả empty
      const response = await fetchAndCache;
      return response || new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
});

// ── Message: manual cache invalidation ───────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'INVALIDATE_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      if (event.source) {
        event.source.postMessage({ type: 'CACHE_INVALIDATED' });
      }
    });
  }
});

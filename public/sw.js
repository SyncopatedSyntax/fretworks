// Single service worker for the whole unified Fretworks origin. Covers the
// shell (/, /app) AND the proxied trainer zones (/chord, /diatonic, …) via
// runtime caching, so the entire toolbox installs once and works offline.
const CACHE = "fretworks-v4";
// Proxied trainer zones — these must NEVER fall back to the shell's index.html
// (the shell renders the marketing Brochure for them, causing a click-loop).
const ZONE_RE = /^\/(chord|diatonic|melodic-minor|altered|circle|triads)(\/|$)/;
// App shell to precache so the launcher opens with no network.
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/og-image.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Navigations (shell + proxied trainer pages): network-first so users get the
  // latest deploy when online, with an offline fallback to the cached page.
  if (req.mode === "navigate") {
    const isZone = ZONE_RE.test(new URL(req.url).pathname);
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) =>
            // Shell paths fall back to the app shell; trainer-zone paths must NOT
            // (that would serve the Brochure for /chord, /diatonic, …).
            hit || (isZone ? Response.error() : caches.match("/index.html"))
          )
        )
    );
    return;
  }

  // Static assets (incl. /chord/assets/*, fonts): stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

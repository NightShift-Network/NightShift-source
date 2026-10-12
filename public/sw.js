importScripts("/controller/controller.sw.js");

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Proxied browser frames receive a unique Scramjet prefix when their
// controller initializes. Keep the newest one so cross-origin subresources
// can be wrapped in a proxied URL and handed to Scramjet's router.
const controllerPrefixes = [];
self.addEventListener("message", event => {
  const prefix = event.data?.$controller$init?.prefix;
  if (typeof prefix !== "string" || !prefix) return;
  const normalized = new URL(prefix, self.location.origin).pathname;
  if (!controllerPrefixes.includes(normalized)) controllerPrefixes.push(normalized);
});

// Cross-origin requests that are safe to proxy: static, non-executable
// subresources (images, fonts, audio, video). Scripts, styles, workers, and
// API calls stay direct so rewritten responses are never injected into pages
// that are not running inside a Scramjet frame. This preserves the direct
// browser path for the interactive entertainment SDK and its API.
const PROXIED_DESTINATIONS = new Set(["image", "font", "audio", "video", "track"]);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    if (self.$scramjetController.shouldRoute(event)) {
      event.respondWith(self.$scramjetController.route(event));
    }
    return;
  }

  if (event.request.method !== "GET" && event.request.method !== "HEAD") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (!PROXIED_DESTINATIONS.has(event.request.destination)) return;
  const prefix = controllerPrefixes[controllerPrefixes.length - 1];
  if (!prefix) return; // no proxied session yet; let the browser fetch directly

  // Wrap the destination URL in Scramjet's codec form so the controller can
  // fetch it over the transport. Media responses are passed through as-is.
  const proxiedUrl = new URL(prefix + encodeURIComponent(event.request.url), self.location.origin).href;
  const request = new Request(proxiedUrl, {
    method: event.request.method,
    headers: event.request.headers,
    credentials: "same-origin",
    mode: "cors",
    redirect: "manual",
    cache: event.request.cache,
  });
  event.respondWith(self.$scramjetController.route({ request, clientId: event.clientId }));
});

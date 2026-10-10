importScripts("/controller/controller.sw.js");

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // LuminSDK and its API are third-party requests. Let the browser send them
  // directly instead of handing them to Scramjet's proxy service worker.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  if (self.$scramjetController.shouldRoute(event)) {
    event.respondWith(self.$scramjetController.route(event));
  }
});

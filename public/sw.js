const CACHE = "unplug-v2";
const ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Handle notification scheduling messages from the app ──
self.addEventListener("message", e => {
  if (e.data?.type === "SCHEDULE_NOTIFICATION") {
    const { delayMs, goal, mode } = e.data;
    // Store the timer info
    self._notifTimer && clearTimeout(self._notifTimer);
    self._notifTimer = setTimeout(() => {
      const body = mode === "bedtime"
        ? `时间到了，去${goal}吧。放下手机。`
        : `专注时间结束，「${goal}」完成了吗？`;
      self.registration.showNotification("Unplug · 时间到", {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "unplug-timer",
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 500],
        actions: [
          { action: "open", title: "打开 App" },
        ],
      });
    }, delayMs);
  }

  if (e.data?.type === "CANCEL_NOTIFICATION") {
    self._notifTimer && clearTimeout(self._notifTimer);
  }
});

// ── Clicking notification opens the app ──
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client)
          return client.focus();
      }
      return clients.openWindow("/");
    })
  );
});

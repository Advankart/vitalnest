// Web Push handler, imported into the generated service worker.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'VitalNest', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'VitalNest', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, data: d,
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const path = (d.path || '/') + (d.patient_id ? (d.path && d.path.includes('?') ? '&' : '?') + 'patient=' + d.patient_id : '');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(path); return c.focus(); } }
    return self.clients.openWindow(path);
  }));
});

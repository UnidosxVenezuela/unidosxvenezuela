/* Service worker de Apoyo por Venezuela — SOLO notificaciones push.
   No cachea ni intercepta peticiones (así no se rompe la app con caché vieja);
   su única función es mostrar el aviso push y abrir el enlace al tocarlo. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let datos = {};
  try { datos = event.data ? event.data.json() : {}; } catch (_e) { datos = {}; }
  const titulo = datos.title || 'Apoyo por Venezuela';
  const opciones = {
    body: datos.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: datos.tag || undefined,
    data: { url: datos.url || '/notificaciones' },
  };
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/notificaciones';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if ('focus' in cliente) {
          if ('navigate' in cliente) { cliente.navigate(destino).catch(() => {}); }
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    }),
  );
});

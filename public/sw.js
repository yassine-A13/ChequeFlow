self.addEventListener('push', event => {
  let data = { title: 'ChequeFlow', body: 'Vous avez une nouvelle notification.', url: '/' }
  try {
    const payload = event.data?.json()
    if (payload && typeof payload === 'object') data = { ...data, ...payload }
  } catch {
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.svg',
    data: { url: data.url },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url === target)
    return existing ? existing.focus() : self.clients.openWindow(target)
  }))
})

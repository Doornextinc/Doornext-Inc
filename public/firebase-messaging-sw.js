// Firebase Cloud Messaging Service Worker
// This file must be at the root of the public directory

importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js')

// Firebase config will be injected by the app
// For now use placeholder that gets overridden at runtime
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || 'placeholder',
  authDomain: self.FIREBASE_AUTH_DOMAIN || 'placeholder',
  projectId: self.FIREBASE_PROJECT_ID || 'placeholder',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || 'placeholder',
  appId: self.FIREBASE_APP_ID || 'placeholder',
})

const messaging = firebase.messaging()

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {}
  const data = payload.data ?? {}

  if (!title) return

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data,
    tag: data.orderId ?? 'doornext',
    requireInteraction: false,
  })
})

// Handle notification click — deep link to order
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data ?? {}
  const url = data.orderId ? `/orders/${data.orderId}` : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      return clients.openWindow(url)
    })
  )
})

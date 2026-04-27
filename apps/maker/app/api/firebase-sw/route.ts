import { NextResponse } from 'next/server'

/**
 * Serves the Firebase Messaging service worker with the real Firebase config
 * embedded. Registered via navigator.serviceWorker.register('/api/firebase-sw', { scope: '/' })
 */
const NOOP_SW = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => clients.claim())
`.trim()

const SW_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Service-Worker-Allowed': '/',
  'Cache-Control': 'no-store',
}

export async function GET() {
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID

  if (!messagingSenderId) {
    return new NextResponse(NOOP_SW, { headers: SW_HEADERS })
  }

  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? '',
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
    messagingSenderId,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? '',
  }

  const sw = /* javascript */ `
// Firebase Messaging service worker — config injected at runtime by /api/firebase-sw
try {
  importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js')
  importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js')

  firebase.initializeApp(${JSON.stringify(config)})

  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification ?? {}
    const data = payload.data ?? {}
    if (!title) return
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data,
      tag: data.order_id ?? 'doornext-maker',
      requireInteraction: true,
    })
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = event.notification.data ?? {}
    const url = data.order_id ? '/orders/' + data.order_id : '/orders'
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const client of list) {
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
} catch (err) {
  console.warn('[firebase-sw] init failed, falling back to no-op:', err)
  self.addEventListener('install', () => self.skipWaiting())
  self.addEventListener('activate', () => clients.claim())
}
`.trim()

  return new NextResponse(sw, { headers: SW_HEADERS })
}

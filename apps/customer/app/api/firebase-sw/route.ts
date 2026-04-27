import { NextResponse } from 'next/server'

/**
 * Serves the Firebase Messaging service worker with the real Firebase config
 * embedded. The static public/firebase-messaging-sw.js cannot access
 * process.env, so this route handler injects NEXT_PUBLIC_* values at runtime.
 *
 * Registered via navigator.serviceWorker.register('/api/firebase-sw', { scope: '/' })
 * The Service-Worker-Allowed: / header allows the broader scope.
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

  // If Firebase is not configured, serve a safe no-op SW so registration
  // succeeds without throwing a script evaluation error.
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
      tag: data.order_id ?? 'doornext',
      requireInteraction: false,
    })
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = event.notification.data ?? {}
    const url = data.order_id ? '/orders/' + data.order_id : '/'
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

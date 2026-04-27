// This file is intentionally a no-op stub.
// The active Firebase Messaging service worker is served from /api/firebase-sw
// which has the real Firebase config embedded via process.env at runtime.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => clients.claim())

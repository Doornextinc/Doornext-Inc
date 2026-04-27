'use client'

import { isMedian, registerPushNotifications, getMedianDeviceId } from '@/lib/median'

export async function requestPushPermission(): Promise<string | null> {
  // In Median.co native wrapper — use bridge
  if (isMedian()) {
    registerPushNotifications()
    // Give bridge time to register
    await new Promise((r) => setTimeout(r, 1000))
    const deviceId = await getMedianDeviceId()
    return deviceId
  }

  // Browser FCM path
  if (!('Notification' in window)) return null

  // Bail out silently if Firebase is not configured in this environment.
  // VAPID key must be present AND look like a valid base64url Web Push certificate
  // (~87 chars). An invalid key causes PushManager.subscribe to throw InvalidAccessError.
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  if (!vapidKey || vapidKey.length < 80 || !messagingSenderId) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  try {
    // Dynamically import Firebase to avoid SSR issues
    const { initializeApp, getApps } = await import('firebase/app')
    const { getMessaging, getToken } = await import('firebase/messaging')

    const firebaseConfig = {
      apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId,
      appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
    const messaging = getMessaging(app)

    // Register the SW explicitly from the route handler so it gets the real
    // Firebase config embedded. Service-Worker-Allowed: / is set on the route
    // so scope '/' is permitted even though the script is served from /api/.
    const registration = await navigator.serviceWorker.register('/api/firebase-sw', {
      scope: '/',
    })

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })
    return token
  } catch (error) {
    // Warn rather than error — push notifications are non-critical and these
    // failures are almost always a missing/invalid env var, not a code bug.
    console.warn('FCM token registration skipped:', (error as Error).message ?? error)
    return null
  }
}

export async function savePushToken(token: string, userId: string): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const platform = isMedian()
      ? (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')
          ? 'ios'
          : 'android')
      : 'web'

    await supabase.from('user_push_tokens').upsert(
      { user_id: userId, token, platform },
      { onConflict: 'user_id,token' }
    )
  } catch (error) {
    console.error('Save push token error:', error)
  }
}

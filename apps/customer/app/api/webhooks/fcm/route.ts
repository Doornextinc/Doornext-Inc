import { NextRequest, NextResponse } from 'next/server'
import { getFirebaseAdmin } from '@/lib/firebase-admin'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * Internal endpoint called by Supabase Edge Functions or backend jobs
 * to send FCM push notifications to users.
 */
export async function POST(req: NextRequest) {
  // Verify internal caller via shared secret
  const authHeader = req.headers.get('authorization')
  const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!internalSecret || authHeader !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit: 200 FCM sends per minute per IP (internal callers only)
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`fcm:${ip}`, 200, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const body = await req.json()
    const { userId, token, title, body: msgBody, data } = body

    if (!token || !title) {
      return NextResponse.json({ error: 'token and title required' }, { status: 400 })
    }

    const firebaseAdmin = getFirebaseAdmin()
    await firebaseAdmin.messaging().send({
      token,
      notification: { title, body: msgBody ?? undefined },
      data: data ?? {},
      apns: { payload: { aps: { sound: 'default' } } },
      android: { priority: 'high' },
    })

    return NextResponse.json({ success: true, userId })
  } catch (error) {
    Sentry.captureException(error)
    console.error('FCM push error:', error)
    return NextResponse.json({ error: 'Push failed' }, { status: 500 })
  }
}

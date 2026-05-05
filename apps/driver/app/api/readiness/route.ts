/**
 * GET /api/readiness
 *
 * Deep dependency probe for the driver app.
 * Protected by INTERNAL_WEBHOOK_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: Record<string, { status: 'ok' | 'error' | 'unconfigured'; detail?: string }> = {}

  // ── Supabase ─────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    checks.supabase = { status: 'unconfigured' }
  } else {
    try {
      const sb = createServiceClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { error } = await sb.from('driver_profiles').select('id').limit(1)
      if (error) throw new Error(error.message)
      checks.supabase = { status: 'ok' }
    } catch (err) {
      checks.supabase = { status: 'error', detail: String(err) }
    }
  }

  // ── Firebase Admin (push notifications) ──────────────────────────────────
  const hasFirebase =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  if (!hasFirebase) {
    checks.firebase = { status: 'unconfigured' }
  } else {
    try {
      const { getFirebaseAdmin } = await import('@/lib/firebase-admin')
      const app = getFirebaseAdmin()
      if (!app.messaging) throw new Error('Firebase admin messaging unavailable')
      checks.firebase = { status: 'ok' }
    } catch (err) {
      checks.firebase = { status: 'error', detail: String(err) }
    }
  }

  // ── Stream Chat ───────────────────────────────────────────────────────────
  checks.stream = process.env.STREAM_API_SECRET && process.env.NEXT_PUBLIC_STREAM_API_KEY
    ? { status: 'ok' }
    : { status: 'unconfigured' }

  // ── Cross-app push path ───────────────────────────────────────────────────
  checks.notify_push = process.env.NOTIFY_PUSH_BASE_URL
    ? { status: 'ok' }
    : { status: 'unconfigured' }

  const critical = ['supabase']
  const criticalFailed = critical.filter((k) => checks[k]?.status === 'error')
  const healthy = criticalFailed.length === 0

  return NextResponse.json(
    {
      status: healthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
      critical_failed: criticalFailed,
    },
    { status: healthy ? 200 : 503 },
  )
}

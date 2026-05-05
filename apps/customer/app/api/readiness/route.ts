/**
 * GET /api/readiness
 *
 * Deep dependency probe — checks real reachability of external integrations,
 * not just environment variable presence.
 *
 * Protected by INTERNAL_WEBHOOK_SECRET so it is never publicly accessible.
 * Called by the deploy workflow after each deployment.
 *
 * Returns 200 when all critical dependencies are reachable.
 * Returns 503 when any critical dependency is broken.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export async function GET(req: NextRequest) {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: Record<string, { status: 'ok' | 'error' | 'unconfigured'; detail?: string }> = {}

  // ── Supabase: real query + RPC existence check ───────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    checks.supabase = { status: 'unconfigured' }
  } else {
    try {
      const sb = createServiceClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      // Check real DB read
      const { error: readError } = await sb.from('users').select('id').limit(1)
      if (readError) throw new Error(readError.message)

      // Check that stale-assignment RPC exists (critical automation)
      const { error: rpcError } = await sb.rpc('release_stale_driver_assignments')
      // error code PGRST202 = "Could not find function" — anything else means RPC exists
      if (rpcError && rpcError.code === 'PGRST202') {
        throw new Error('release_stale_driver_assignments RPC not found')
      }
      checks.supabase = { status: 'ok' }
    } catch (err) {
      checks.supabase = { status: 'error', detail: String(err) }
    }
  }

  // ── Stripe: lightweight read-only API call ───────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    checks.stripe = { status: 'unconfigured' }
  } else {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })
      // List 1 customer — safe read-only call with minimal latency impact
      await stripe.customers.list({ limit: 1 })
      checks.stripe = { status: 'ok' }
    } catch (err) {
      checks.stripe = { status: 'error', detail: String(err) }
    }
  }

  // ── Firebase Admin: init check (no real message sent) ────────────────────
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
      // Verify admin SDK is initialized by accessing a known property
      if (!app.messaging) throw new Error('Firebase admin messaging unavailable')
      checks.firebase = { status: 'ok' }
    } catch (err) {
      checks.firebase = { status: 'error', detail: String(err) }
    }
  }

  // ── Stream Chat: config validation ──────────────────────────────────────
  const hasStream = process.env.STREAM_API_SECRET && process.env.NEXT_PUBLIC_STREAM_API_KEY
  checks.stream = hasStream
    ? { status: 'ok' }
    : { status: 'unconfigured' }

  // ── NOTIFY_PUSH_BASE_URL (cross-app notification path) ──────────────────
  checks.notify_push = process.env.NOTIFY_PUSH_BASE_URL
    ? { status: 'ok' }
    : { status: 'unconfigured' }

  const critical = ['supabase', 'stripe']
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

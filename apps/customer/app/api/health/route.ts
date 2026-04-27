import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/health
 * Lightweight liveness + readiness probe.
 * Returns 200 when the app is running and can reach Supabase.
 * Returns 503 when a critical dependency is unreachable.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'error' | 'unconfigured'> = {}

  // ── Supabase ──────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    checks.supabase = 'unconfigured'
  } else {
    try {
      const sb = createServiceClient(supabaseUrl, serviceKey)
      // Lightweight query — just check connectivity
      const { error } = await sb.from('users').select('id').limit(1)
      checks.supabase = error ? 'error' : 'ok'
    } catch {
      checks.supabase = 'error'
    }
  }

  // ── Stripe ────────────────────────────────────────────────
  checks.stripe = process.env.STRIPE_SECRET_KEY ? 'ok' : 'unconfigured'

  // ── Stream ────────────────────────────────────────────────
  checks.stream = process.env.STREAM_API_SECRET ? 'ok' : 'unconfigured'

  // ── Firebase ──────────────────────────────────────────────
  checks.firebase = process.env.FIREBASE_PRIVATE_KEY ? 'ok' : 'unconfigured'

  const healthy = Object.values(checks).every((v) => v !== 'error')
  const status = healthy ? 200 : 503

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      version: process.env.npm_package_version ?? 'unknown',
    },
    { status },
  )
}

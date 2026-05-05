/**
 * GET /api/readiness
 *
 * Deep dependency probe for the admin app.
 * Checks Supabase (including critical RPCs), Stripe, and cron infra.
 * Protected by INTERNAL_WEBHOOK_SECRET.
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

  // ── Supabase + critical RPC availability ─────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    checks.supabase = { status: 'unconfigured' }
    checks.stale_assignment_rpc = { status: 'unconfigured' }
  } else {
    const sb = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
      const { error } = await sb.from('orders').select('id').limit(1)
      if (error) throw new Error(error.message)
      checks.supabase = { status: 'ok' }
    } catch (err) {
      checks.supabase = { status: 'error', detail: String(err) }
    }

    // Check the stale-assignment RPC is deployed (critical cron dependency)
    try {
      const { error } = await sb.rpc('release_stale_driver_assignments')
      if (error && error.code === 'PGRST202') {
        throw new Error('release_stale_driver_assignments RPC not found — migration may not have run')
      }
      checks.stale_assignment_rpc = { status: 'ok' }
    } catch (err) {
      checks.stale_assignment_rpc = { status: 'error', detail: String(err) }
    }
  }

  // ── Stripe ────────────────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    checks.stripe = { status: 'unconfigured' }
  } else {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' })
      await stripe.customers.list({ limit: 1 })
      checks.stripe = { status: 'ok' }
    } catch (err) {
      checks.stripe = { status: 'error', detail: String(err) }
    }
  }

  // ── Cron secret configured ────────────────────────────────────────────────
  checks.cron_secret = process.env.CRON_SECRET
    ? { status: 'ok' }
    : { status: 'unconfigured', detail: 'CRON_SECRET not set — stale-assignment cron will fail auth' }

  const critical = ['supabase', 'stripe', 'stale_assignment_rpc']
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

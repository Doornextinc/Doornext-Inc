/**
 * Cron endpoint: release driver assignments whose heartbeat has gone stale.
 *
 * Call this every 30–60 seconds from your cron provider (Vercel Cron, GitHub Actions,
 * Upstash QStash, etc.).  Secured by a shared secret: CRON_SECRET env var.
 *
 * Example Vercel cron config (vercel.json):
 *   { "crons": [{ "path": "/api/cron/release-stale-assignments", "schedule": "* * * * *" }] }
 *   (runs every minute — Vercel free tier minimum)
 *
 * Returns { released: [ { released_order_id, stale_driver_id }, ... ] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyUser } from '@doornext/shared/notify'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  // Authenticate with shared cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Call the DB function — returns rows of { released_order_id, stale_driver_id }
  const { data: released, error } = await admin.rpc('release_stale_driver_assignments')

  if (error) {
    Sentry.captureException(new Error(`release_stale_driver_assignments failed: ${error.message}`))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (released ?? []) as Array<{ released_order_id: string; stale_driver_id: string }>

  if (rows.length > 0) {
    // Notify customers whose orders were re-queued
    await Promise.allSettled(
      rows.map(async ({ released_order_id }) => {
        const { data: order } = await admin
          .from('orders')
          .select('customer_id')
          .eq('id', released_order_id)
          .single()

        if (order?.customer_id) {
          return notifyUser(admin, {
            userId: order.customer_id,
            type: 'driver_reassigned',
            title: 'Finding you a new driver',
            body: `Your driver went offline. We're finding you a new driver right away!`,
            data: { order_id: released_order_id },
          })
        }
      })
    )

    Sentry.captureMessage(`Released ${rows.length} stale driver assignment(s)`, {
      level: 'info',
      extra: { released: rows },
    })
  }

  return NextResponse.json({ released: rows, count: rows.length })
}

// Also support GET for Vercel Cron (which sends GET by default)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  // Vercel cron passes the secret via CRON_SECRET environment matching
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return POST(req)
}

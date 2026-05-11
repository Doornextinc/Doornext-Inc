/**
 * Cron endpoint: delete Stream Chat order channels 5 minutes after their
 * underlying order has been delivered.
 *
 * Why: chat between Maker / Nexter / Neighbor is a *transaction-scoped*
 * conversation. Once the food is delivered, the channel has no further
 * useful purpose and is a privacy + storage liability. We give a 5-minute
 * window after delivery so the parties can exchange final pleasantries
 * (thanks, packaging notes), then clean up.
 *
 * Call this every minute from your cron provider. Vercel cron config:
 *   { "path": "/api/cron/cleanup-chat-channels", "schedule": "* * * * *" }
 *
 * Authenticated by `CRON_SECRET` (shared with the other cron endpoints).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { StreamChat } from 'stream-chat'
import * as Sentry from '@sentry/nextjs'

const EXPIRY_MS = 5 * 60 * 1000  // 5 minutes after delivery
// Look-back window: only consider orders delivered within the last hour, to
// keep the query bounded. Anything older than that should already have been
// cleaned up on a previous run.
const LOOKBACK_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const streamApiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
  const streamSecret = process.env.STREAM_API_SECRET
  const isUnconfigured = (v?: string) =>
    !v || v.startsWith('your-') || v.includes('placeholder') || v.length < 8

  if (isUnconfigured(streamApiKey) || isUnconfigured(streamSecret)) {
    // No Stream configured — nothing to clean up.
    return NextResponse.json({ deleted: 0, skipped: 'stream_not_configured' })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Find delivered orders whose 5-minute grace has expired ───────────────
  // Prefer `delivered_at` (immutable timestamp of the delivery transition)
  // over `updated_at` (bumped by any post-delivery update — e.g. proof photo,
  // tip submission). Using updated_at would cause the cleanup to never fire
  // on orders that get touched after delivery for any reason.
  const cutoff   = new Date(Date.now() - EXPIRY_MS).toISOString()
  const lookback = new Date(Date.now() - LOOKBACK_MS).toISOString()

  const { data: orders, error } = await admin
    .from('orders')
    .select('id, delivered_at, updated_at')
    .eq('status', 'delivered')
    .or(`delivered_at.lte.${cutoff},and(delivered_at.is.null,updated_at.lte.${cutoff})`)
    .or(`delivered_at.gte.${lookback},and(delivered_at.is.null,updated_at.gte.${lookback})`)
    .limit(200)

  if (error) {
    Sentry.captureException(new Error(`cleanup-chat-channels: order query failed: ${error.message}`))
    return NextResponse.json({ error: 'Failed to load delivered orders' }, { status: 500 })
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  const stream = StreamChat.getInstance(streamApiKey!, streamSecret!)
  let deleted = 0
  const failures: Array<{ orderId: string; reason: string }> = []

  for (const o of orders) {
    const channelId = `order-${o.id}`
    try {
      const channel = stream.channel('messaging', channelId)
      await channel.delete()
      deleted++
    } catch (e) {
      const err = e as { code?: number; message?: string; status?: number }
      // Stream returns 16 (channel does not exist) when the channel was never
      // created or has already been deleted — that's not a real error.
      if (err?.code === 16 || err?.status === 404) {
        continue
      }
      failures.push({ orderId: o.id, reason: err?.message ?? 'unknown' })
      Sentry.captureException(e, {
        extra: { orderId: o.id, channelId, context: 'cleanup-chat-channels' },
      })
    }
  }

  return NextResponse.json({
    deleted,
    failures: failures.length,
    failureDetails: failures.slice(0, 5),
  })
}

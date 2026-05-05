/**
 * Cron endpoint: process the notification outbox with retry/dead-letter logic.
 *
 * Call every minute alongside release-stale-assignments.
 *   • Picks up to 50 'pending' entries due for delivery
 *   • Attempts push via the customer app's FCM endpoint
 *   • On success: marks sent
 *   • On failure: exponential backoff (30s → 1m → 5m → 15m → 1h)
 *   • After max_retries: marks dead (surfaced in admin operations)
 *
 * Secured by CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'

const BACKOFF_SECONDS = [30, 60, 300, 900, 3600]  // 30s, 1m, 5m, 15m, 1h
const BATCH_SIZE = 50

interface OutboxEntry {
  id: string
  user_id: string
  notification_id: string | null
  title: string
  body: string
  data: Record<string, unknown>
  fcm_token: string | null
  retry_count: number
  max_retries: number
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Fetch pending entries due now (skip locked entries being processed concurrently)
  const { data: entries, error: fetchError } = await admin
    .from('notification_outbox')
    .select('id, user_id, notification_id, title, body, data, fcm_token, retry_count, max_retries')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchError) {
    Sentry.captureException(new Error(`Outbox fetch failed: ${fetchError.message}`))
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const rows = (entries ?? []) as OutboxEntry[]
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, dead: 0 })
  }

  const baseUrl    = process.env.NOTIFY_PUSH_BASE_URL
  const secret     = process.env.INTERNAL_WEBHOOK_SECRET
  let sent = 0, failed = 0, dead = 0

  await Promise.allSettled(
    rows.map(async (entry) => {
      const now = new Date().toISOString()
      const nextRetry = entry.retry_count + 1

      try {
        if (!baseUrl || !secret) {
          throw new Error('NOTIFY_PUSH_BASE_URL or INTERNAL_WEBHOOK_SECRET not configured')
        }

        // Fetch user's FCM tokens if not already specified
        let tokens: string[]
        if (entry.fcm_token) {
          tokens = [entry.fcm_token]
        } else {
          const { data: tokenRows } = await admin
            .from('user_push_tokens')
            .select('token')
            .eq('user_id', entry.user_id)
          tokens = (tokenRows ?? []).map((r: { token: string }) => r.token)
        }

        if (tokens.length === 0) {
          // No tokens — mark sent (nothing to deliver, not an error)
          await admin
            .from('notification_outbox')
            .update({ status: 'sent', sent_at: now, last_attempted_at: now })
            .eq('id', entry.id)
          sent++
          return
        }

        const pushData = Object.fromEntries(
          Object.entries(entry.data)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)]),
        )

        // Send via customer app FCM endpoint
        const results = await Promise.allSettled(
          tokens.map((token) =>
            fetch(`${baseUrl}/api/webhooks/fcm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${secret}`,
              },
              body: JSON.stringify({
                userId: entry.user_id,
                token,
                title: entry.title,
                body: entry.body,
                data: pushData,
              }),
              signal: AbortSignal.timeout(10_000),
            }),
          ),
        )

        const anySuccess = results.some((r) => r.status === 'fulfilled' && (r.value as Response).ok)
        if (!anySuccess) {
          const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
          throw new Error(firstError?.reason?.message ?? 'All FCM sends failed')
        }

        await admin
          .from('notification_outbox')
          .update({
            status: 'sent',
            sent_at: now,
            last_attempted_at: now,
            provider_response: { tokens_attempted: tokens.length },
          })
          .eq('id', entry.id)
        sent++
      } catch (err) {
        const isExhausted = nextRetry >= entry.max_retries
        const backoffSec  = BACKOFF_SECONDS[Math.min(entry.retry_count, BACKOFF_SECONDS.length - 1)]
        const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString()

        await admin
          .from('notification_outbox')
          .update({
            status:           isExhausted ? 'dead' : 'pending',
            retry_count:      nextRetry,
            next_attempt_at:  isExhausted ? now : nextAttempt,
            last_attempted_at: now,
            last_error:       String(err),
          })
          .eq('id', entry.id)

        if (isExhausted) {
          dead++
          Sentry.captureMessage(`Notification outbox dead-letter: ${entry.id}`, {
            level: 'warning',
            extra: { entry, error: String(err) },
          })
        } else {
          failed++
        }
      }
    }),
  )

  // Alert if there are dead-letter entries accumulating
  const { count: deadCount } = await admin
    .from('notification_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'dead')

  if ((deadCount ?? 0) > 0) {
    Sentry.captureMessage(`${deadCount} dead-letter notification(s) in outbox`, {
      level: 'warning',
      extra: { dead_count: deadCount },
    })
  }

  return NextResponse.json({
    processed: rows.length,
    sent,
    failed,
    dead,
    dead_total: deadCount ?? 0,
  })
}

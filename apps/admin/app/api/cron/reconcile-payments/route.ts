/**
 * Cron endpoint: reconcile pending Stripe refunds against Stripe API.
 *
 * Runs every 5 minutes. Finds orders where:
 *   • refund_status = 'pending' AND stripe_refund_id IS NOT NULL
 *   • OR stripe_refund_id IS NULL AND status = 'cancelled' AND payment_method = 'card'
 *
 * For each, it checks Stripe's actual refund state and syncs internal status.
 * This ensures DB and Stripe can never drift permanently due to:
 *   - Stripe API timeout after refund was created
 *   - DB write failure after Stripe returned success
 *   - Network partition between refund creation and DB update
 *
 * Secured by CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import * as Sentry from '@sentry/nextjs'

const BATCH_SIZE = 20
// Max age of a pending refund before it's considered stuck (30 minutes)
const STUCK_THRESHOLD_MINUTES = 30

interface OrderRow {
  id: string
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  refund_status: string | null
  status: string
  payment_method: string
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

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' })
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString()

  // Find orders with pending refunds that were requested more than STUCK_THRESHOLD_MINUTES ago
  const { data: pendingOrders, error: fetchError } = await admin
    .from('orders')
    .select('id, stripe_payment_intent_id, stripe_refund_id, refund_status, status, payment_method')
    .eq('refund_status', 'pending')
    .lt('refund_requested_at', stuckThreshold)
    .limit(BATCH_SIZE)

  // Also find cancelled card orders with no refund record at all (missed write-back)
  const { data: missingRefundOrders } = await admin
    .from('orders')
    .select('id, stripe_payment_intent_id, stripe_refund_id, refund_status, status, payment_method')
    .eq('status', 'cancelled')
    .eq('payment_method', 'card')
    .is('refund_status', null)
    .not('stripe_payment_intent_id', 'is', null)
    .limit(BATCH_SIZE)

  if (fetchError) {
    Sentry.captureException(new Error(`Reconciliation fetch failed: ${fetchError.message}`))
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const toReconcile = [
    ...(pendingOrders ?? []) as OrderRow[],
    ...(missingRefundOrders ?? []) as OrderRow[],
  ]

  if (toReconcile.length === 0) {
    return NextResponse.json({ reconciled: 0, completed: 0, failed: 0, stuck: 0 })
  }

  let completed = 0, failed = 0, stuck = 0

  await Promise.allSettled(
    toReconcile.map(async (order) => {
      const now = new Date().toISOString()

      try {
        // If we have a refund ID, check its current status on Stripe
        if (order.stripe_refund_id) {
          const refund = await stripe.refunds.retrieve(order.stripe_refund_id)
          if (refund.status === 'succeeded') {
            await admin.from('orders').update({
              refund_status: 'completed',
              refund_completed_at: now,
            }).eq('id', order.id)
            completed++
          } else if (refund.status === 'failed' || refund.status === 'canceled') {
            await admin.from('orders').update({
              refund_status: 'failed',
              refund_failure_reason: `Stripe refund ${refund.status}: ${refund.failure_reason ?? 'unknown'}`,
            }).eq('id', order.id)
            failed++
            Sentry.captureMessage(`Refund failed for order ${order.id}`, {
              level: 'error',
              extra: { orderId: order.id, refundId: order.stripe_refund_id, refund },
            })
          }
          // 'pending' or 'requires_action' — leave for next reconciliation cycle
        } else if (order.stripe_payment_intent_id) {
          // No refund ID — look up refunds on the PaymentIntent to recover write-backs
          const refunds = await stripe.refunds.list({ payment_intent: order.stripe_payment_intent_id, limit: 1 })
          if (refunds.data.length > 0) {
            const refund = refunds.data[0]
            await admin.from('orders').update({
              stripe_refund_id: refund.id,
              refund_status: refund.status === 'succeeded' ? 'completed' : 'pending',
              refund_completed_at: refund.status === 'succeeded' ? now : null,
            }).eq('id', order.id)
            if (refund.status === 'succeeded') completed++
          } else {
            // No refund on Stripe for a cancelled card order — mark for investigation
            stuck++
            Sentry.captureMessage(`Cancelled card order ${order.id} has no Stripe refund`, {
              level: 'warning',
              extra: { orderId: order.id, stripe_payment_intent_id: order.stripe_payment_intent_id },
            })
          }
        }
      } catch (err) {
        Sentry.captureException(err, { extra: { orderId: order.id } })
        stuck++
      }
    }),
  )

  return NextResponse.json({
    reconciled: toReconcile.length,
    completed,
    failed,
    stuck,
  })
}

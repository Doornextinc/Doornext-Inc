import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { notifyUser } from '@doornext/shared/notify'
import { checkRateLimit } from '@/lib/rate-limit'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  // Rate limit: 10 failed-delivery reports per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`failed-delivery:${ip}`, 10, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId, reason } = await req.json()
  if (!orderId || !reason) {
    return NextResponse.json({ error: 'orderId and reason required' }, { status: 400 })
  }

  // Use service role for the order read — anon client is subject to RLS policies
  // that may block the read when querying by id alone. Ownership is checked below.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch order — include payment fields needed for refund and financial zeroing
  const { data: order } = await admin
    .from('orders')
    .select('id, status, nexter_id, customer_id, maker_id, total, payment_method, stripe_payment_intent_id')
    .eq('id', orderId)
    .single()

  if (!order || order.nexter_id !== user.id) {
    return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: 404 })
  }

  if (order.status !== 'arrived_at_customer' && order.status !== 'on_the_way') {
    return NextResponse.json(
      { error: `Can only report failed delivery while on the way or arrived at customer (current: ${order.status})` },
      { status: 400 }
    )
  }

  const shortId = orderId.slice(-6).toUpperCase()

  // ── 1. Mark order as failed_delivery + zero out payouts ──────────────────
  await admin
    .from('orders')
    .update({
      status: 'failed_delivery',
      failed_delivery_reason: reason,
      // Financial zeroing: no earnings should accrue for a failed delivery
      driver_payout: 0,
      maker_payout: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // ── 2. Stripe refund for card orders ─────────────────────────────────────
  let refundId: string | null = null
  if (order.payment_method === 'card' && order.stripe_payment_intent_id) {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY
      if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured')
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })
      const refund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: { order_id: orderId, failed_delivery_reason: reason },
      })
      refundId = refund.id

      // Persist refund ID on the order for audit trail
      await admin
        .from('orders')
        .update({ stripe_refund_id: refund.id })
        .eq('id', orderId)
    } catch (err) {
      // Refund failure must not block the failed-delivery flow — ops will see
      // this in Sentry and can issue a manual refund via the Stripe dashboard.
      Sentry.captureException(err, {
        extra: { orderId, userId: user.id, context: 'failed-delivery-stripe-refund' },
      })
    }
  }

  // ── 2b. Reliability: increment cancellations ─────────────────────────────
  void (admin.rpc('increment_driver_cancellation', { driver_id: user.id }) as unknown as Promise<unknown>).catch(() => {}) // non-fatal

  // ── 3. Support ticket ─────────────────────────────────────────────────────
  const { data: ticket } = await admin
    .from('support_tickets')
    .insert({
      user_id: user.id,
      order_id: orderId,
      subject: `Failed Delivery — Order #${shortId}`,
      message: [
        `Driver was unable to complete delivery for order #${shortId}.`,
        `Reason: ${reason}`,
        `Driver ID: ${user.id}`,
        `Order total: $${order.total?.toFixed(2) ?? 'N/A'}`,
        `Payment: ${order.payment_method ?? 'N/A'}`,
        refundId ? `Stripe refund: ${refundId}` : 'Refund: N/A (cash or refund pending)',
      ].join('\n'),
      status: 'open',
      priority: 'high',
    })
    .select('id')
    .single()

  // ── 4. Notify customer ────────────────────────────────────────────────────
  try {
    await notifyUser(admin, {
      userId: order.customer_id,
      type: 'failed_delivery',
      title: 'Delivery Unsuccessful',
      body: `We were unable to deliver your order #${shortId}. ${
        order.payment_method === 'card'
          ? 'A full refund has been issued to your card.'
          : 'Our support team has been notified and will contact you shortly.'
      }`,
      data: { order_id: orderId, ticket_id: ticket?.id ?? null },
    })
  } catch (err) {
    Sentry.captureException(err, { extra: { orderId, context: 'failed-delivery-notify' } })
  }

  return NextResponse.json({ success: true, ticketId: ticket?.id ?? null, refundId })
}

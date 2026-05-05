import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyUser } from '@doornext/shared/notify'

// Cancellation is only allowed before the maker starts preparing
const CANCELLABLE_STATUSES = ['pending', 'awaiting_payment', 'confirmed']

export async function POST(req: NextRequest) {
  // Rate limit: 10 cancellations per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`cancel-order:${ip}`, 10, 60)) {
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

  const { orderId } = await req.json()
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  // Verify customer owns the order and check cancellable status
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, payment_method, stripe_payment_intent_id, maker_id, total')
    .eq('id', orderId)
    .eq('customer_id', user.id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: 'Order cannot be cancelled — preparation has already started.' },
      { status: 400 }
    )
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const shortId = orderId.slice(-6).toUpperCase()

  // Cash order: just cancel, no Stripe call needed
  if (order.payment_method === 'cash') {
    await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)

    // Notify customer (DB + push)
    await notifyUser(admin, {
      userId: user.id,
      type: 'order_cancelled',
      title: 'Order Cancelled',
      body: `Your order #${shortId} has been cancelled. No charge was made.`,
      data: { order_id: orderId },
    })

    // Notify maker so they don't start preparing (DB + push)
    const { data: maker } = await admin
      .from('food_makers')
      .select('user_id')
      .eq('id', order.maker_id)
      .single()
    if (maker?.user_id) {
      notifyUser(admin, {
        userId: maker.user_id,
        type: 'order_cancelled',
        title: 'Order Cancelled by Customer',
        body: `Order #${shortId} has been cancelled by the customer.`,
        data: { order_id: orderId },
      })
    }

    return NextResponse.json({ success: true })
  }

  // Card order: process Stripe refund
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Payment service unavailable' }, { status: 500 })

  if (!order.stripe_payment_intent_id) {
    // Payment hasn't settled yet (very rare edge case) — just cancel the order
    await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
    return NextResponse.json({ success: true, note: 'Cancelled before payment settled' })
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })

    if (order.status === 'awaiting_payment') {
      // PaymentIntent not yet captured — void it rather than refund
      await stripe.paymentIntents.cancel(order.stripe_payment_intent_id)
    } else {
      // Payment was captured (confirmed) — issue a full refund
      await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id })
    }

    await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)

    const refundNote = order.status === 'awaiting_payment'
      ? 'No charge was made.'
      : `Your full refund of $${order.total.toFixed(2)} will appear in 3–5 business days.`

    // Notify customer (DB + push)
    await notifyUser(admin, {
      userId: user.id,
      type: 'order_cancelled',
      title: order.status === 'awaiting_payment' ? 'Order Cancelled' : 'Order Cancelled — Full Refund',
      body: `Your order #${shortId} has been cancelled. ${refundNote}`,
      data: { order_id: orderId },
    })

    // Notify maker (DB + push)
    const { data: maker } = await admin
      .from('food_makers')
      .select('user_id')
      .eq('id', order.maker_id)
      .single()
    if (maker?.user_id) {
      notifyUser(admin, {
        userId: maker.user_id,
        type: 'order_cancelled',
        title: 'Order Cancelled by Customer',
        body: `Order #${shortId} has been cancelled by the customer before preparation.`,
        data: { order_id: orderId },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    Sentry.captureException(err, { extra: { orderId, userId: user.id } })
    return NextResponse.json({ error: 'Refund failed. Please contact support.' }, { status: 500 })
  }
}

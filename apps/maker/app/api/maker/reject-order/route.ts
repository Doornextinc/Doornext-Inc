import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { notifyUser } from '@doornext/shared/notify'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 20 rejections per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`reject-order:${ip}`, 20, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

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

  // Verify maker owns this order
  const { data: maker } = await supabase
    .from('food_makers').select('id').eq('user_id', user.id).single()
  if (!maker) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: order } = await supabase
    .from('orders')
    .select('maker_id, status, stripe_payment_intent_id, payment_method, customer_id')
    .eq('id', orderId)
    .single()

  if (!order || order.maker_id !== maker.id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending orders can be rejected' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const isCash = (order as { payment_method?: string }).payment_method === 'cash'

  // Refund via Stripe BEFORE cancelling — if refund fails, order stays pending so customer keeps their money
  if (!isCash && order.stripe_payment_intent_id) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })
      await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id })
    } catch (err) {
      Sentry.captureException(err, { extra: { orderId, userId: user.id } })
      return NextResponse.json({ error: 'Refund failed — please try again or contact support' }, { status: 500 })
    }
  }

  // Cancel order in DB (after successful refund or cash order)
  await admin
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId)

  // Notify customer (DB + push)
  await notifyUser(admin, {
    userId: order.customer_id,
    type: 'order_rejected',
    title: 'Order Cancelled',
    body: isCash
      ? `Your order #${orderId.slice(-6).toUpperCase()} was cancelled by the kitchen. No charge was made.`
      : `Your order #${orderId.slice(-6).toUpperCase()} was cancelled. A full refund has been issued.`,
    data: { order_id: orderId },
  })

  return NextResponse.json({ success: true })
}

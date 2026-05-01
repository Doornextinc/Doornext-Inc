import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`update-payment:${ip}`, 20, 60)) {
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

  const { paymentIntentId, orderId, tipPct } = await req.json()
  if (!paymentIntentId || !orderId || tipPct === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (typeof tipPct !== 'number' || tipPct < 0 || tipPct > 1) {
    return NextResponse.json({ error: 'Invalid tip percentage' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify ownership and fetch all stored fees from DB — never trust client-submitted amounts
  const { data: order } = await admin
    .from('orders')
    .select('customer_id, stripe_payment_intent_id, subtotal, delivery_fee, platform_fee, service_fee, small_order_fee, surge_fee')
    .eq('id', orderId)
    .single()
  if (!order || order.customer_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.stripe_payment_intent_id !== paymentIntentId) {
    return NextResponse.json({ error: 'Payment intent mismatch' }, { status: 400 })
  }

  const dbSubtotal = order.subtotal as number
  const tip = Math.round(dbSubtotal * tipPct * 100) / 100
  const total = dbSubtotal
    + (order.delivery_fee as number)
    + (order.platform_fee as number)
    + ((order.service_fee as number) ?? 0)
    + ((order.small_order_fee as number) ?? 0)
    + ((order.surge_fee as number) ?? 0)
    + tip
  const amountCents = Math.round(total * 100)

  const stripe = new Stripe(stripeKey)
  try {
    await stripe.paymentIntents.update(paymentIntentId, { amount: amountCents })
  } catch (err) {
    Sentry.captureException(err)
    console.error('Stripe update error:', err)
    return NextResponse.json({ error: 'Failed to update payment amount' }, { status: 500 })
  }

  await admin
    .from('orders')
    .update({
      tip_amount: tip,
      total: Math.round(total * 100) / 100,
    })
    .eq('id', orderId)

  return NextResponse.json({ total: amountCents })
}

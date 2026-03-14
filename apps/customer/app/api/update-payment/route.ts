import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { PLATFORM_FEE_PCT, DELIVERY_FEE } from '@/lib/constants'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
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

  const { paymentIntentId, orderId, tipPct, subtotal } = await req.json()
  if (!paymentIntentId || !orderId || tipPct === undefined || subtotal === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (typeof tipPct !== 'number' || tipPct < 0 || tipPct > 1) {
    return NextResponse.json({ error: 'Invalid tip percentage' }, { status: 400 })
  }
  if (typeof subtotal !== 'number' || subtotal <= 0) {
    return NextResponse.json({ error: 'Invalid subtotal' }, { status: 400 })
  }

  // Verify order belongs to authenticated user and paymentIntentId matches
  const adminCheck = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: order } = await adminCheck
    .from('orders')
    .select('customer_id, stripe_payment_intent_id')
    .eq('id', orderId)
    .single()
  if (!order || order.customer_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.stripe_payment_intent_id !== paymentIntentId) {
    return NextResponse.json({ error: 'Payment intent mismatch' }, { status: 400 })
  }

  const tip = subtotal * tipPct
  const platformFee = subtotal * PLATFORM_FEE_PCT
  const total = subtotal + DELIVERY_FEE + platformFee + tip
  const amountCents = Math.round(total * 100)

  const stripe = new Stripe(stripeKey)
  try {
    await stripe.paymentIntents.update(paymentIntentId, { amount: amountCents })
  } catch (err) {
    Sentry.captureException(err)
    console.error('Stripe update error:', err)
    return NextResponse.json({ error: 'Failed to update payment amount' }, { status: 500 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await admin
    .from('orders')
    .update({
      tip_amount: Math.round(tip * 100) / 100,
      total: Math.round(total * 100) / 100,
    })
    .eq('id', orderId)

  return NextResponse.json({ total: amountCents })
}

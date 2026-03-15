import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
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

  const { orderId, tipAmount } = await req.json()
  if (!orderId || typeof tipAmount !== 'number' || tipAmount < 0) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }
  // Allow $0 tip (customer skipped)
  if (tipAmount === 0) return NextResponse.json({ success: true })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify order belongs to user, is delivered, and hasn't been tipped yet
  const { data: order } = await admin
    .from('orders')
    .select('customer_id, status, tip_amount, driver_payout, payment_method')
    .eq('id', orderId)
    .single()

  if (!order || order.customer_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.status !== 'delivered') {
    return NextResponse.json({ error: 'Order is not yet delivered' }, { status: 400 })
  }
  if ((order.tip_amount ?? 0) > 0) {
    return NextResponse.json({ error: 'Tip already submitted' }, { status: 400 })
  }
  // Cash orders: just record the tip (no Stripe charge)
  if (order.payment_method === 'cash') {
    await admin
      .from('orders')
      .update({
        tip_amount: tipAmount,
        driver_payout: (order.driver_payout ?? 0) + tipAmount,
      })
      .eq('id', orderId)
    return NextResponse.json({ success: true })
  }

  // Card orders: charge via saved Stripe payment method (off-session)
  const { data: userProfile } = await admin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  const stripeCustomerId = userProfile?.stripe_customer_id as string | undefined
  if (!stripeCustomerId) {
    return NextResponse.json({ error: 'No saved payment method' }, { status: 400 })
  }

  const stripe = new Stripe(stripeKey)
  try {
    // Get default/first saved payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
      limit: 1,
    })
    const pm = paymentMethods.data[0]
    if (!pm) {
      return NextResponse.json({ error: 'No saved payment method on file' }, { status: 400 })
    }

    await stripe.paymentIntents.create({
      amount: Math.round(tipAmount * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: pm.id,
      confirm: true,
      off_session: true,
      metadata: { order_id: orderId, type: 'tip', customer_id: user.id },
    })
  } catch (err) {
    Sentry.captureException(err)
    console.error('Tip charge error:', err)
    return NextResponse.json({ error: 'Payment failed. Please try again.' }, { status: 500 })
  }

  await admin
    .from('orders')
    .update({
      tip_amount: tipAmount,
      driver_payout: (order.driver_payout ?? 0) + tipAmount,
    })
    .eq('id', orderId)

  return NextResponse.json({ success: true })
}

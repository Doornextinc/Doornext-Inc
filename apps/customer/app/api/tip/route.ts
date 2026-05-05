import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

// Maximum tip amount enforced server-side ($100)
const MAX_TIP = 100

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

  // Rate limit per user: 5 tip attempts per 15 minutes
  if (!await checkRateLimit(`tip:${user.id}`, 5, 900)) {
    return NextResponse.json({ error: 'Too many requests. Please wait before retrying.' }, { status: 429 })
  }

  const { orderId, tipAmount } = await req.json()
  if (!orderId || typeof tipAmount !== 'number' || tipAmount < 0) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }
  // Enforce max tip upper bound
  if (tipAmount > MAX_TIP) {
    return NextResponse.json({ error: `Tip cannot exceed $${MAX_TIP}` }, { status: 400 })
  }
  // Allow $0 tip (customer skipped)
  if (tipAmount === 0) return NextResponse.json({ success: true })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // For card orders: charge Stripe first (with idempotency key to prevent double-charge),
  // then atomically record the tip via DB RPC.
  // For cash orders: just call the RPC directly.

  // Fetch order meta AND eligibility in one query — verify ownership and check tip eligibility
  // BEFORE any Stripe charge to avoid charging then failing to record.
  const { data: orderMeta } = await admin
    .from('orders')
    .select('customer_id, payment_method, status, tip_amount')
    .eq('id', orderId)
    .single()

  if (!orderMeta || orderMeta.customer_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Pre-flight eligibility check: order must be delivered and tip not yet set
  if (orderMeta.status !== 'delivered') {
    return NextResponse.json({ error: 'Order is not eligible for a tip' }, { status: 409 })
  }
  if (orderMeta.tip_amount !== null && orderMeta.tip_amount !== 0) {
    return NextResponse.json({ error: 'Tip already submitted' }, { status: 409 })
  }

  let stripePaymentIntentId: string | undefined

  if (orderMeta.payment_method === 'card') {
    // Fetch stripe_customer_id from users table
    const { data: userProfile } = await admin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    const stripeCustomerId = userProfile?.stripe_customer_id as string | undefined
    if (!stripeCustomerId) {
      return NextResponse.json({ error: 'No saved payment method' }, { status: 400 })
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' })
    try {
      // List saved payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card',
        limit: 1,
      })
      const pm = paymentMethods.data[0]
      if (!pm) {
        return NextResponse.json({ error: 'No saved payment method on file' }, { status: 400 })
      }

      // Idempotency key: orderId + '-tip' ensures at most one charge per order,
      // even if two concurrent requests race through this path.
      const pi = await stripe.paymentIntents.create(
        {
          amount:         Math.round(tipAmount * 100),
          currency:       'usd',
          customer:       stripeCustomerId,
          payment_method: pm.id,
          confirm:        true,
          off_session:    true,
          metadata:       { order_id: orderId, type: 'tip', customer_id: user.id },
        },
        { idempotencyKey: `${orderId}-tip` }
      )
      stripePaymentIntentId = pi.id
    } catch (err) {
      Sentry.captureException(err, { extra: { orderId, context: 'tip-charge' } })
      console.error('Tip charge error:', err)
      return NextResponse.json({ error: 'Payment failed. Please try again.' }, { status: 500 })
    }
  }

  // Atomic CAS update via DB RPC — prevents double-tip even under concurrent requests.
  // Returns the row only if tip_amount was 0/NULL (i.e. not yet tipped) and order is delivered.
  const { data: rows, error: rpcError } = await admin.rpc('submit_tip', {
    p_order_id:    orderId,
    p_customer_id: user.id,
    p_tip_amount:  tipAmount,
  })

  if (rpcError || !rows || rows.length === 0) {
    // RPC failed or CAS lost the race — refund the Stripe charge to avoid phantom charge
    if (stripePaymentIntentId && orderMeta.payment_method === 'card') {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' })
      await stripe.refunds.create({ payment_intent: stripePaymentIntentId }).catch((refundErr) => {
        Sentry.captureException(refundErr, { extra: { orderId, context: 'tip-refund-on-rpc-failure' } })
        console.error('CRITICAL: tip refund failed after RPC failure:', refundErr)
      })
    }
    if (rpcError) {
      Sentry.captureException(rpcError, { extra: { orderId, context: 'submit-tip-rpc' } })
      console.error('submit_tip RPC error:', rpcError)
      return NextResponse.json({ error: 'Failed to record tip' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Tip already submitted or order not eligible' }, { status: 409 })
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })

  const body = await req.json()
  const orderId = body.orderId as string
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('stripe_payment_intent_id, payment_method, status, customer_id')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'Order is already cancelled' }, { status: 400 })
  }

  // Cash orders cannot be refunded via Stripe
  if ((order as { payment_method?: string }).payment_method === 'cash') {
    await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)

    await admin.from('notifications').insert({
      user_id: order.customer_id,
      type: 'order_cancelled',
      title: 'Order Cancelled by Admin',
      body: `Your order #${orderId.slice(-6).toUpperCase()} has been cancelled. No charge was made (cash order).`,
      data: { order_id: orderId },
    })

    return NextResponse.json({ success: true, note: 'Cash order cancelled — no Stripe refund needed' })
  }

  if (!order.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'No payment to refund (no payment intent)' }, { status: 400 })
  }

  try {
    const stripe = new Stripe(stripeKey)
    await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id })

    await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)

    await admin.from('notifications').insert({
      user_id: order.customer_id,
      type: 'order_cancelled',
      title: 'Order Refunded',
      body: `Your order #${orderId.slice(-6).toUpperCase()} has been refunded by admin.`,
      data: { order_id: orderId },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Refund error:', err)
    return NextResponse.json({ error: 'Refund failed — check Stripe dashboard' }, { status: 500 })
  }
}

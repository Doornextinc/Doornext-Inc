import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })

  // Verify admin session
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await session.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/login', req.url))

  const body = await req.formData()
  const orderId = body.get('orderId') as string
  if (!orderId) return NextResponse.redirect(new URL('/orders', req.url))

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('stripe_payment_intent_id, status')
    .eq('id', orderId)
    .single()

  if (!order?.stripe_payment_intent_id) {
    return NextResponse.redirect(new URL('/orders?error=no_payment', req.url))
  }

  try {
    const stripe = new Stripe(stripeKey)
    await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id })

    await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
  } catch (err) {
    console.error('Refund error:', err)
    return NextResponse.redirect(new URL('/orders?error=refund_failed', req.url))
  }

  return NextResponse.redirect(new URL('/orders?refunded=1', req.url))
}

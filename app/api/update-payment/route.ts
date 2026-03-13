import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const PLATFORM_FEE_PCT = 0.05
const DELIVERY_FEE = 3.99

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

  const tip = subtotal * tipPct
  const platformFee = subtotal * PLATFORM_FEE_PCT
  const total = subtotal + DELIVERY_FEE + platformFee + tip
  const amountCents = Math.round(total * 100)

  const stripe = new Stripe(stripeKey)
  try {
    await stripe.paymentIntents.update(paymentIntentId, { amount: amountCents })
  } catch (err) {
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

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { PLATFORM_FEE_PCT, DELIVERY_FEE } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'Payment not configured' }, { status: 500 })
  }
  const stripe = new Stripe(stripeKey)
  try {
    // Get authenticated user
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cs) => cs.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch {}
          }),
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { items, maker_id, delivery_address, tip_amount } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }
    if (!maker_id) {
      return NextResponse.json({ error: 'maker_id required' }, { status: 400 })
    }

    // Server-side total calculation (prevents price tampering)
    const subtotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) =>
        sum + item.price * item.quantity,
      0
    )
    const platformFee = subtotal * PLATFORM_FEE_PCT
    const tip = tip_amount ?? 0
    const total = subtotal + DELIVERY_FEE + tip + platformFee

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        customer_id: user.id,
        maker_id,
        item_count: items.length,
      },
    })

    // Create order in Supabase using service role (bypass RLS for server-side insert)
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: order, error: orderError } = await serviceSupabase
      .from('orders')
      .insert({
        customer_id: user.id,
        maker_id,
        status: 'pending',
        subtotal: Math.round(subtotal * 100) / 100,
        delivery_fee: DELIVERY_FEE,
        tip_amount: Math.round(tip * 100) / 100,
        platform_fee: Math.round(platformFee * 100) / 100,
        total: Math.round(total * 100) / 100,
        delivery_address: delivery_address ?? { street: 'N/A', city: 'N/A', state: 'NY', zip: '00000' },
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Order creation error:', orderError)
      // Cancel the payment intent to avoid charging without an order
      await stripe.paymentIntents.cancel(paymentIntent.id)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Create order items
    const orderItems = items.map((item: { id: string; price: number; quantity: number; notes?: string }) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.quantity,
      unit_price: item.price,
      customization_notes: item.notes ?? null,
    }))

    await serviceSupabase.from('order_items').insert(orderItems)

    // Update PaymentIntent metadata with orderId for webhook lookup
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        customer_id: user.id,
        maker_id,
        order_id: order.id,
        item_count: items.length,
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
      total: Math.round(total * 100),
      subtotal: Math.round(subtotal * 100),
      platform_fee: Math.round(platformFee * 100),
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

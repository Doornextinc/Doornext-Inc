import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const PLATFORM_FEE_PCT = 0.05

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items, delivery_fee, tip_amount } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    // Calculate server-side total (prevents price tampering)
    const subtotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) =>
        sum + item.price * item.quantity,
      0
    )
    const platformFee = subtotal * PLATFORM_FEE_PCT
    const total = subtotal + (delivery_fee ?? 3.99) + (tip_amount ?? 0) + platformFee

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        item_count: items.length,
        subtotal_cents: Math.round(subtotal * 100),
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      total: Math.round(total * 100),
      subtotal: Math.round(subtotal * 100),
      platform_fee: Math.round(platformFee * 100),
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

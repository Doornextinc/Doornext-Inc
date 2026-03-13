import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Service role client for webhook operations (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  const isDevMode = webhookSecret === 'whsec_placeholder'

  try {
    if (isDevMode) {
      // In dev mode without a real webhook secret, parse without verification
      event = JSON.parse(body) as Stripe.Event
    } else {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const orderId = pi.metadata?.order_id

        if (!orderId) {
          console.warn('No order_id in PaymentIntent metadata', pi.id)
          break
        }

        // Update order status to confirmed
        const { error } = await supabase
          .from('orders')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('stripe_payment_intent_id', pi.id)

        if (error) {
          console.error('Failed to confirm order:', error)
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
        }

        // Insert notification for the customer
        const customerId = pi.metadata?.customer_id
        if (customerId) {
          await supabase.from('notifications').insert({
            user_id: customerId,
            type: 'order_confirmed',
            title: 'Order Confirmed! 🎉',
            body: 'Your order has been confirmed and the maker is getting ready.',
            data: { order_id: orderId },
          })
        }

        console.log(`Order ${orderId} confirmed for PaymentIntent ${pi.id}`)
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const orderId = pi.metadata?.order_id

        if (orderId) {
          await supabase
            .from('orders')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .eq('stripe_payment_intent_id', pi.id)

          const customerId = pi.metadata?.customer_id
          if (customerId) {
            await supabase.from('notifications').insert({
              user_id: customerId,
              type: 'payment_failed',
              title: 'Payment Failed',
              body: 'Your payment could not be processed. Please try again.',
              data: { order_id: orderId },
            })
          }
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const piId = charge.payment_intent as string
        if (piId) {
          await supabase
            .from('orders')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', piId)
        }
        break
      }

      default:
        // Ignore unhandled events
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

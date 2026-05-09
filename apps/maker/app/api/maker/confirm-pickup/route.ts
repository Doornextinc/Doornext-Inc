import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { notifyUser } from '@doornext/shared/notify'

const MAX_PIN_ATTEMPTS = 5

type AttemptResult = {
  result: 'success' | 'wrong_pin' | 'locked' | 'wrong_status' | 'wrong_maker' | 'not_found'
  attempts_remaining: number
  customer_id: string | null
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify maker role
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'maker') {
    return NextResponse.json({ error: 'Not a maker account' }, { status: 403 })
  }

  const body = await req.json()
  const { orderId, pin } = body as { orderId?: string; pin?: string }

  if (!orderId || !pin) {
    return NextResponse.json({ error: 'orderId and pin are required' }, { status: 400 })
  }

  // Normalise: must be exactly 4 digits
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve maker_id for ownership check inside the RPC
  const { data: makerProfile } = await admin
    .from('food_makers')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!makerProfile) {
    return NextResponse.json({ error: 'Maker profile not found' }, { status: 404 })
  }

  // Atomic: row-locks the order, validates state + PIN + attempts, increments
  // counter or flips status to picked_up — all in one transaction. See
  // migration 060_atomic_pickup_pin.sql for the full guard logic.
  const { data: rows, error: rpcErr } = await admin.rpc('attempt_pickup_pin', {
    p_order_id: orderId,
    p_pin:      pin,
    p_maker_id: makerProfile.id,
  })

  if (rpcErr) {
    console.error('attempt_pickup_pin RPC error:', rpcErr)
    return NextResponse.json({ error: 'Failed to verify PIN' }, { status: 500 })
  }

  const r = (rows as AttemptResult[] | null)?.[0]
  if (!r) {
    return NextResponse.json({ error: 'Failed to verify PIN' }, { status: 500 })
  }

  switch (r.result) {
    case 'not_found':
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    case 'wrong_maker':
      return NextResponse.json({ error: 'Order does not belong to your kitchen' }, { status: 403 })
    case 'wrong_status':
      return NextResponse.json(
        { error: 'PIN confirmation is only valid when the driver has arrived.' },
        { status: 409 }
      )
    case 'locked': {
      // Notify customer once that pickup is flagged for support
      if (r.customer_id) {
        await notifyUser(admin, {
          userId: r.customer_id,
          type: 'pickup_pin_locked',
          title: 'Pickup Issue — Support Notified',
          body: `Order #${orderId.slice(-6).toUpperCase()} pickup could not be confirmed after ${MAX_PIN_ATTEMPTS} attempts. Our support team has been alerted.`,
          data: { order_id: orderId },
        })
      }
      return NextResponse.json(
        { error: 'Too many incorrect attempts. This pickup has been flagged for support review.', locked: true },
        { status: 423 }
      )
    }
    case 'wrong_pin':
      return NextResponse.json(
        {
          error: `Incorrect PIN. ${r.attempts_remaining} attempt${r.attempts_remaining !== 1 ? 's' : ''} remaining.`,
          attemptsRemaining: r.attempts_remaining,
        },
        { status: 401 }
      )
    case 'success': {
      // Notify the customer that the order is on its way
      if (r.customer_id) {
        await notifyUser(admin, {
          userId: r.customer_id,
          type: 'order_picked_up',
          title: '🛵 Order Picked Up!',
          body: `Your order #${orderId.slice(-6).toUpperCase()} has been picked up and is heading your way.`,
          data: { order_id: orderId },
        })
      }
      return NextResponse.json({ success: true, status: 'picked_up' })
    }
    default:
      return NextResponse.json({ error: 'Unknown PIN verification result' }, { status: 500 })
  }
}

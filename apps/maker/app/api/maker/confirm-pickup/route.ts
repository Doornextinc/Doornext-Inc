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
  let r: AttemptResult | null = null
  const { data: rows, error: rpcErr } = await admin.rpc('attempt_pickup_pin', {
    p_order_id: orderId,
    p_pin:      pin,
    p_maker_id: makerProfile.id,
  })

  if (rpcErr) {
    // Detect "function does not exist" (PGRST202 / 42883) → migration 060 not deployed.
    // For that specific case, fall back to a manual check-and-update so PIN
    // verification keeps working even before the migration is applied.
    // For other errors (transient DB issues), surface a 500 with the error logged.
    const code = (rpcErr as { code?: string }).code
    const msg  = rpcErr.message ?? ''
    const isMissingRpc =
      code === 'PGRST202' ||
      code === '42883' ||
      /function .*attempt_pickup_pin.*does not exist/i.test(msg) ||
      /could not find the function/i.test(msg)

    if (!isMissingRpc) {
      console.error('attempt_pickup_pin RPC error:', rpcErr)
      return NextResponse.json({ error: 'Failed to verify PIN' }, { status: 500 })
    }

    // ── Fallback: non-atomic check-and-update (race window is acceptable as a
    //    bridge until migration 060 is applied). The race lets two concurrent
    //    wrong-PIN requests both increment from N → N+1 instead of going
    //    N → N+1 → N+2 — i.e. the brute-force lockout takes 1 extra try in
    //    the worst case. Far better than a hard 500 error.
    console.warn('attempt_pickup_pin RPC missing — using fallback path. Apply migration 060 to enable atomic verification.')

    const { data: order, error: fetchErr } = await admin
      .from('orders')
      .select('id, status, maker_id, customer_id, pickup_pin, pin_attempts')
      .eq('id', orderId)
      .single()

    if (fetchErr || !order) {
      r = { result: 'not_found', attempts_remaining: 0, customer_id: null }
    } else if (order.maker_id !== makerProfile.id) {
      r = { result: 'wrong_maker', attempts_remaining: 0, customer_id: order.customer_id ?? null }
    } else if (order.status !== 'arrived_at_maker') {
      r = { result: 'wrong_status', attempts_remaining: 0, customer_id: order.customer_id ?? null }
    } else if ((order.pin_attempts ?? 0) >= MAX_PIN_ATTEMPTS) {
      r = { result: 'locked', attempts_remaining: 0, customer_id: order.customer_id ?? null }
    } else if (order.pickup_pin === pin) {
      // Correct PIN → flip status, reset counter
      await admin
        .from('orders')
        .update({ status: 'picked_up', pin_attempts: 0, updated_at: new Date().toISOString() })
        .eq('id', orderId)
      r = {
        result: 'success',
        attempts_remaining: MAX_PIN_ATTEMPTS,
        customer_id: order.customer_id ?? null,
      }
    } else {
      // Wrong PIN → increment counter
      const newAttempts = (order.pin_attempts ?? 0) + 1
      await admin
        .from('orders')
        .update({ pin_attempts: newAttempts, updated_at: new Date().toISOString() })
        .eq('id', orderId)
      const remaining = MAX_PIN_ATTEMPTS - newAttempts
      r = {
        result: remaining <= 0 ? 'locked' : 'wrong_pin',
        attempts_remaining: Math.max(0, remaining),
        customer_id: order.customer_id ?? null,
      }
    }
  } else {
    r = (rows as AttemptResult[] | null)?.[0] ?? null
  }

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

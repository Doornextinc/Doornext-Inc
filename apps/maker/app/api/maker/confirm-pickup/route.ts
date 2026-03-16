import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const MAX_PIN_ATTEMPTS = 5

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

  // Fetch order — verify it belongs to this maker and is in the right state
  const { data: makerProfile } = await admin
    .from('food_makers')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!makerProfile) {
    return NextResponse.json({ error: 'Maker profile not found' }, { status: 404 })
  }

  const { data: order, error: fetchErr } = await admin
    .from('orders')
    .select('id, status, maker_id, customer_id, pickup_pin, pin_attempts, nexter_id')
    .eq('id', orderId)
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Ownership check — order must belong to this maker's kitchen
  if (order.maker_id !== makerProfile.id) {
    return NextResponse.json({ error: 'Order does not belong to your kitchen' }, { status: 403 })
  }

  // State guard — PIN entry is only valid at arrived_at_maker
  if (order.status !== 'arrived_at_maker') {
    return NextResponse.json(
      { error: `PIN confirmation is only valid when driver has arrived. Current status: ${order.status}` },
      { status: 409 }
    )
  }

  // Lockout check — too many failed attempts escalates to support
  if (order.pin_attempts >= MAX_PIN_ATTEMPTS) {
    return NextResponse.json(
      {
        error: 'Too many incorrect attempts. This pickup has been flagged for support review.',
        locked: true,
      },
      { status: 423 }
    )
  }

  // Wrong PIN — increment attempt counter
  if (order.pickup_pin !== pin) {
    const newAttempts = order.pin_attempts + 1
    await admin
      .from('orders')
      .update({ pin_attempts: newAttempts, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    const remaining = MAX_PIN_ATTEMPTS - newAttempts
    if (remaining <= 0) {
      // Flag for support
      await admin.from('notifications').insert({
        user_id: order.customer_id,
        type: 'pickup_pin_locked',
        title: 'Pickup Issue — Support Notified',
        body: `Order #${orderId.slice(-6).toUpperCase()} pickup could not be confirmed after ${MAX_PIN_ATTEMPTS} attempts. Our support team has been alerted.`,
        data: { order_id: orderId },
      })
      return NextResponse.json(
        { error: 'Too many incorrect attempts. This pickup has been flagged for support review.', locked: true },
        { status: 423 }
      )
    }

    return NextResponse.json(
      {
        error: `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining,
      },
      { status: 401 }
    )
  }

  // ── PIN is correct ────────────────────────────────────────────────────────

  await admin
    .from('orders')
    .update({
      status: 'picked_up',
      pin_attempts: 0,   // reset on success
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // Notify the customer that the order is on its way
  if (order.customer_id) {
    await admin.from('notifications').insert({
      user_id: order.customer_id,
      type: 'order_picked_up',
      title: 'Order Picked Up!',
      body: `Your order #${orderId.slice(-6).toUpperCase()} has been picked up and is heading your way.`,
      data: { order_id: orderId },
    })
  }

  return NextResponse.json({ success: true, status: 'picked_up' })
}

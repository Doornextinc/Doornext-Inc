import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { OrderStatus } from '@doornext/shared/types'
import { notifyUser } from '@doornext/shared/notify'
import { snapshotFees } from '@doornext/shared/pricing'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

// NOTE: arrived_at_maker → picked_up is intentionally EXCLUDED.
// That transition is owned by the maker via PIN confirmation
// (POST /api/maker/confirm-pickup). Drivers cannot self-confirm pickup.
const VALID_DRIVER_TRANSITIONS: Record<string, OrderStatus> = {
  driver_assigned:     'arrived_at_maker',
  picked_up:           'on_the_way',
  on_the_way:          'arrived_at_customer',
  arrived_at_customer: 'delivered',
}

export async function POST(req: NextRequest) {
  // Rate limit: 60 status updates per minute per IP (generous for real delivery flow)
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`update-status:${ip}`, 60, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Accept optional GPS coordinates from the driver app
  const { orderId, status, lat, lng } = await req.json()
  if (!orderId || !status) {
    return NextResponse.json({ error: 'orderId and status required' }, { status: 400 })
  }

  // Use admin client for the order read — the anon client is bound by RLS policies
  // that may only allow row access when filtering by nexter_id. We do our own
  // ownership check below so bypassing RLS here is safe.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch order — filter by both id AND nexter_id so the ownership check
  // is enforced in SQL (maybeSingle returns null gracefully on zero rows).
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select(`
      status, nexter_id, customer_id, maker_id,
      subtotal, delivery_fee, service_fee, small_order_fee,
      surge_fee, tip_amount, driver_payout, platform_fee
    `)
    .eq('id', orderId)
    .eq('nexter_id', user.id)
    .maybeSingle()

  if (orderErr) {
    Sentry.captureException(orderErr, { extra: { orderId, userId: user.id, context: 'update-status-order-lookup' } })
    return NextResponse.json({ error: 'Failed to look up order' }, { status: 500 })
  }
  if (!order) {
    Sentry.captureMessage('update-status: order not found for driver', {
      level: 'warning',
      extra: { orderId, userId: user.id },
    })
    return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: 404 })
  }

  if (VALID_DRIVER_TRANSITIONS[order.status] !== status) {
    return NextResponse.json(
      { error: `Invalid transition: ${order.status} → ${status}` },
      { status: 400 }
    )
  }

  // ── Delivery gate: GPS audit only (proof photo is optional) ─────────────
  if (status === 'delivered') {
    // Check if proof photo is required via admin settings (default: false — photo is optional in UI)
    const { data: proofSetting } = await admin
      .from('settings')
      .select('value')
      .eq('key', 'require_delivery_proof')
      .maybeSingle()
    const requireProof = proofSetting?.value === true || proofSetting?.value === 'true'

    if (requireProof) {
      const { data: proofRow } = await admin
        .from('orders')
        .select('proof_photo_path')
        .eq('id', orderId)
        .maybeSingle()
      if (!proofRow?.proof_photo_path) {
        return NextResponse.json(
          { error: 'A proof photo is required before marking as delivered.' },
          { status: 422 }
        )
      }
    }

    // Soft GPS audit — advisory only, never blocks delivery
    if (!lat || !lng) {
      Sentry.captureMessage('Delivered without GPS coordinates', {
        level: 'warning',
        extra: { orderId, userId: user.id },
      })
    }
  }

  // ── Build the status update payload ──────────────────────────────────────
  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = { status, updated_at: now }
  if (status === 'arrived_at_maker') updatePayload.arrived_at_maker_at = now
  if (status === 'on_the_way') updatePayload.on_the_way_at = now
  if (status === 'delivered') {
    if (lat && lng) {
      updatePayload.delivery_lat = lat
      updatePayload.delivery_lng = lng
    }
    updatePayload.delivered_at = now
  }

  // ── Update the order status ───────────────────────────────────────────────
  const { error: updateError } = await admin
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)

  if (updateError) {
    Sentry.captureException(new Error(`update-status DB error: ${updateError.message}`), { extra: { orderId, status, userId: user.id } })
    return NextResponse.json({ error: 'Failed to update order status. Please try again.' }, { status: 500 })
  }

  // ── Financial settlement — runs atomically with the delivered transition ──
  let fees: ReturnType<typeof snapshotFees> | null = null
  if (status === 'delivered') {
    try {
      // Look up platform commission from settings (default 5%)
      const { data: settingRow } = await admin
        .from('settings')
        .select('value')
        .eq('key', 'platform_commission_pct')
        .maybeSingle()
      const commPct = settingRow ? parseFloat(String(settingRow.value)) : 5

      fees = snapshotFees({
        subtotal:        Number(order.subtotal),
        delivery_fee:    Number(order.delivery_fee),
        service_fee:     Number(order.service_fee ?? 0),
        small_order_fee: Number(order.small_order_fee ?? 0),
        surge_fee:       Number(order.surge_fee ?? 0),
        tip_amount:      Number(order.tip_amount ?? 0),
        driver_payout:   Number(order.driver_payout),
        platform_fee_pct: commPct,
      })

      // Write fee records in parallel — idempotent via ON CONFLICT
      const [splitRes, makerRes, countRes] = await Promise.all([
        admin.from('order_fee_splits').upsert(
          {
            order_id:            orderId,
            subtotal:            order.subtotal,
            delivery_fee:        order.delivery_fee,
            service_fee:         order.service_fee ?? 0,
            small_order_fee:     order.small_order_fee ?? 0,
            surge_fee:           order.surge_fee ?? 0,
            tip_amount:          order.tip_amount ?? 0,
            driver_payout:       fees.driverPayout,
            maker_payout:        fees.makerPayout,
            platform_commission: fees.platformCommission,
            platform_net:        fees.platformFee,
          },
          { onConflict: 'order_id', ignoreDuplicates: true }
        ),
        admin.from('maker_earnings').upsert(
          {
            maker_id:            order.maker_id,
            order_id:            orderId,
            subtotal:            order.subtotal,
            platform_commission: fees.platformCommission,
            payout:              fees.makerPayout,
            status:              'pending',
          },
          { onConflict: 'order_id', ignoreDuplicates: true }
        ),
        admin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('nexter_id', user.id)
          .eq('status', 'delivered'),
      ])

      if (splitRes.error) Sentry.captureException(splitRes.error, { extra: { orderId, context: 'fee_split_upsert' } })
      if (makerRes.error) Sentry.captureException(makerRes.error, { extra: { orderId, context: 'maker_earnings_upsert' } })

      // Update driver delivery count + recompute completion rate
      await Promise.all([
        admin
          .from('driver_profiles')
          .update({ total_deliveries: countRes.count ?? 0 })
          .eq('id', user.id),
        admin.rpc('recompute_driver_completion_rate', { driver_id: user.id }),
      ])

      // Recompute avg timing metrics from all delivered orders with timestamps
      try {
        const { data: timingRows } = await admin
          .from('orders')
          .select('arrived_at_maker_at, on_the_way_at, delivered_at')
          .eq('nexter_id', user.id)
          .eq('status', 'delivered')
          .not('arrived_at_maker_at', 'is', null)
          .not('on_the_way_at', 'is', null)
          .not('delivered_at', 'is', null)

        if (timingRows && timingRows.length > 0) {
          const waitMins = timingRows
            .map(r => (new Date(r.on_the_way_at).getTime() - new Date(r.arrived_at_maker_at).getTime()) / 60000)
            .filter(v => v > 0 && v < 120)
          const delivMins = timingRows
            .map(r => (new Date(r.delivered_at).getTime() - new Date(r.on_the_way_at).getTime()) / 60000)
            .filter(v => v > 0 && v < 180)

          const metricsUpdate: Record<string, number> = {}
          if (waitMins.length > 0)
            metricsUpdate.avg_wait_at_maker_mins = Math.round(waitMins.reduce((s, v) => s + v, 0) / waitMins.length * 10) / 10
          if (delivMins.length > 0)
            metricsUpdate.avg_delivery_mins = Math.round(delivMins.reduce((s, v) => s + v, 0) / delivMins.length * 10) / 10

          if (Object.keys(metricsUpdate).length > 0) {
            await admin.from('driver_profiles').update(metricsUpdate).eq('id', user.id)
          }
        }
      } catch {
        // Timing columns may not exist yet — non-blocking
      }
    } catch (err) {
      // Settlement failure is non-blocking — order is already marked delivered.
      // Log to Sentry for ops review; a reconciliation job can recover these.
      Sentry.captureException(err, { extra: { orderId, userId: user.id, context: 'delivery-settlement' } })
    }
  }

  // ── Customer notifications ─────────────────────────────────────────────────
  const notifMap: Record<string, { title: string; body: string }> = {
    picked_up: {
      title: 'Order Picked Up!',
      body: `Your order #${orderId.slice(-6).toUpperCase()} has been picked up and is being prepared for dropoff.`,
    },
    on_the_way: {
      title: 'Driver On The Way!',
      body: `Your order #${orderId.slice(-6).toUpperCase()} is on its way to you.`,
    },
    arrived_at_customer: {
      title: 'Driver Arrived!',
      body: `Your driver has arrived at your location with order #${orderId.slice(-6).toUpperCase()}.`,
    },
    delivered: {
      title: 'Order Delivered!',
      body: `Your order #${orderId.slice(-6).toUpperCase()} has been delivered. Enjoy!`,
    },
  }

  if (notifMap[status]) {
    try {
      await notifyUser(admin, {
        userId: order.customer_id,
        type: `order_${status}`,
        ...notifMap[status],
        data: { order_id: orderId },
      })
    } catch (err) {
      Sentry.captureException(err, { extra: { orderId, status, userId: user.id, context: 'customer-notification' } })
    }
  }

  // When driver arrives at the restaurant, notify the maker to look for the PIN
  if (status === 'arrived_at_maker' && order.maker_id) {
    try {
      const { data: makerProfile } = await admin
        .from('food_makers')
        .select('user_id')
        .eq('id', order.maker_id)
        .single()
      if (makerProfile?.user_id) {
        await notifyUser(admin, {
          userId: makerProfile.user_id,
          type: 'driver_arrived',
          title: '🛵 Driver has arrived!',
          body: `Your driver is at the door for order #${orderId.slice(-6).toUpperCase()}. Ask for their PIN to confirm pickup.`,
          data: { order_id: orderId },
        })
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { orderId, status, context: 'notify-maker-arrived' } })
    }
  }

  return NextResponse.json({
    success: true,
    status,
    ...(fees ? {
      fees: {
        driverPayout:  fees.driverPayout,
        makerPayout:   fees.makerPayout,
        platformNet:   fees.platformFee,
      },
    } : {}),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { OrderStatus } from '@doornext/shared/types'
import { notifyUser } from '@doornext/shared/notify'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

const VALID_TRANSITIONS: Record<string, OrderStatus> = {
  pending:   'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
}

// What the customer sees at each step
const CUSTOMER_NOTIF: Record<string, { title: string; body: (id: string, maker: string) => string }> = {
  confirmed: {
    title: '✅ Order Confirmed!',
    body: (id, maker) => `${maker} confirmed your order #${id}. They'll start cooking soon!`,
  },
  preparing: {
    title: '🍳 Cooking in progress',
    body: (id, maker) => `${maker} has started preparing your order #${id}.`,
  },
  ready: {
    title: '🎉 Order Ready!',
    body: (id) => `Your order #${id} is ready and waiting for a driver to pick it up.`,
  },
}

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  // Rate limit: 60 status updates per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`maker-update-status:${ip}`, 60, 60)) {
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

  const { orderId, status } = await req.json()
  if (!orderId || !status) {
    return NextResponse.json({ error: 'orderId and status required' }, { status: 400 })
  }

  // Verify maker owns this order
  const { data: maker } = await supabase
    .from('food_makers')
    .select('id, display_name, lat, lng')
    .eq('user_id', user.id)
    .single()

  if (!maker) return NextResponse.json({ error: 'Maker profile not found' }, { status: 403 })

  // Load order and verify ownership + valid transition
  const { data: order } = await supabase
    .from('orders')
    .select('status, maker_id, customer_id')
    .eq('id', orderId)
    .single()

  if (!order || order.maker_id !== maker.id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (VALID_TRANSITIONS[order.status] !== status) {
    return NextResponse.json(
      { error: `Invalid transition: ${order.status} → ${status}` },
      { status: 400 }
    )
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await admin
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  const shortId = orderId.slice(-6).toUpperCase()
  const makerName = maker.display_name ?? 'Your kitchen'
  const notif = CUSTOMER_NOTIF[status]

  // Notify customer (DB + push)
  if (notif) {
    await notifyUser(admin, {
      userId: order.customer_id,
      type: `order_${status}`,
      title: notif.title,
      body: notif.body(shortId, makerName),
      data: { order_id: orderId },
    })
  }

  // ── Driver notifications ──────────────────────────────────────────────────

  // Get all currently online drivers with their last known locations
  const { data: onlineDrivers } = await admin
    .from('driver_profiles')
    .select('id')
    .eq('is_active', true)

  if (onlineDrivers && onlineDrivers.length > 0) {
    const driverIds = onlineDrivers.map((d: { id: string }) => d.id)

    if (status === 'preparing') {
      // When preparation starts: notify nearby drivers (≤8km) so they can head toward the area
      // Get recent driver locations for proximity filtering
      const { data: locations } = await admin
        .from('nexter_locations')
        .select('nexter_id, lat, lng')
        .in('nexter_id', driverIds)

      const nearbyDriverIds: string[] = []

      if (locations && maker.lat && maker.lng) {
        for (const loc of locations) {
          const dist = haversineKm(maker.lat, maker.lng, loc.lat, loc.lng)
          if (dist <= 8) nearbyDriverIds.push(loc.nexter_id)
        }
      }

      // If no location data available, notify all online drivers
      const targetIds = nearbyDriverIds.length > 0 ? nearbyDriverIds : driverIds

      const driverNotifs = targetIds.map((id: string) => ({
        user_id: id,
        type: 'order_preparing',
        title: '🍳 Order being prepared nearby',
        body: `Order #${shortId} is being cooked at ${makerName}. Get ready — it'll be available for pickup soon!`,
        data: { order_id: orderId, maker_name: makerName },
      }))

      admin.from('notifications').insert(driverNotifs).then(({ error: e }) => {
        if (e) Sentry.captureException(new Error(e.message), { extra: { context: 'notify-drivers-preparing', orderId } })
      })
    }

    if (status === 'ready') {
      // Order is ready for pickup — notify all online drivers immediately
      const driverNotifs = driverIds.map((id: string) => ({
        user_id: id,
        type: 'order_available',
        title: '📦 New pickup available!',
        body: `Order #${shortId} is ready at ${makerName}. Tap to accept.`,
        data: { order_id: orderId, maker_name: makerName },
      }))

      admin.from('notifications').insert(driverNotifs).then(({ error: e }) => {
        if (e) Sentry.captureException(new Error(e.message), { extra: { context: 'notify-drivers-ready', orderId } })
      })
    }
  }

  return NextResponse.json({ success: true, status })
}

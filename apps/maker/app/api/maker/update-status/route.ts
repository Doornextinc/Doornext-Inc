import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { OrderStatus } from '@doornext/shared/types'

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

export async function POST(req: NextRequest) {
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
    .select('id, display_name')
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

  // Update order status — Supabase Realtime broadcasts this instantly to:
  //   • Customer's useOrderTracking hook (filtered by order id)
  //   • Driver's available-pickups page (when status = 'ready', order appears)
  //   • Maker's own order detail page (filtered by order id)
  await admin
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  const shortId = orderId.slice(-6).toUpperCase()
  const makerName = maker.display_name ?? 'Your kitchen'
  const notif = CUSTOMER_NOTIF[status]

  // Notify customer
  if (notif) {
    await admin.from('notifications').insert({
      user_id: order.customer_id,
      type: `order_${status}`,
      title: notif.title,
      body: notif.body(shortId, makerName),
      data: { order_id: orderId },
    })
  }

  // When order becomes 'ready', also notify all currently-online drivers
  // so they see it in their available pickups list immediately.
  // (The realtime subscription already handles it, but a push notification
  //  means drivers see it even if the app is in the background.)
  if (status === 'ready') {
    const { data: onlineDrivers } = await admin
      .from('drivers')
      .select('user_id')
      .eq('is_available', true)

    if (onlineDrivers && onlineDrivers.length > 0) {
      const driverNotifs = onlineDrivers.map((d: { user_id: string }) => ({
        user_id: d.user_id,
        type: 'order_available',
        title: '📦 New pickup available!',
        body: `Order #${shortId} is ready at ${makerName}. Tap to accept.`,
        data: { order_id: orderId },
      }))
      // Fire-and-forget — don't fail the request if this errors
      admin.from('notifications').insert(driverNotifs).then(({ error }) => {
        if (error) console.error('Failed to notify drivers:', error.message)
      })
    }
  }

  return NextResponse.json({ success: true, status })
}

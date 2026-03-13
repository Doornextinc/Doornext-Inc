import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { OrderStatus } from '@doornext/shared/types'

const VALID_TRANSITIONS: Record<string, OrderStatus> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
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
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!maker) return NextResponse.json({ error: 'Maker profile not found' }, { status: 403 })

  // Verify the status is a valid forward transition
  const { data: order } = await supabase
    .from('orders')
    .select('status, maker_id')
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

  // Notify customer
  const notifTitle: Record<string, string> = {
    confirmed: 'Order Confirmed!',
    preparing: 'Your food is being prepared',
    ready: 'Your order is ready for pickup',
  }

  await admin.from('notifications').insert({
    user_id: order.maker_id, // will be fixed: should be customer_id
    type: `order_${status}`,
    title: notifTitle[status] ?? 'Order update',
    body: `Your order #${orderId.slice(-6).toUpperCase()} status: ${status}`,
    data: { order_id: orderId },
  })

  return NextResponse.json({ success: true, status })
}

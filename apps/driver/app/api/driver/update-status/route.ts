import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { OrderStatus } from '@doornext/shared/types'

const VALID_DRIVER_TRANSITIONS: Record<string, OrderStatus> = {
  picked_up: 'on_the_way',
  on_the_way: 'delivered',
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

  const { data: order } = await supabase
    .from('orders')
    .select('status, nexter_id, customer_id')
    .eq('id', orderId)
    .single()

  if (!order || order.nexter_id !== user.id) {
    return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: 404 })
  }

  if (VALID_DRIVER_TRANSITIONS[order.status] !== status) {
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

  const notifMap: Record<string, { title: string; body: string }> = {
    on_the_way: {
      title: 'Driver On The Way!',
      body: `Your order #${orderId.slice(-6).toUpperCase()} is on its way to you.`,
    },
    delivered: {
      title: 'Order Delivered!',
      body: `Your order #${orderId.slice(-6).toUpperCase()} has been delivered. Enjoy!`,
    },
  }

  if (notifMap[status]) {
    await admin.from('notifications').insert({
      user_id: order.customer_id,
      type: `order_${status}`,
      ...notifMap[status],
      data: { order_id: orderId },
    })
  }

  return NextResponse.json({ success: true, status })
}

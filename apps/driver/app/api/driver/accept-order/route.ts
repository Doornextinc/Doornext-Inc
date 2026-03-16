import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await req.json()
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  // Verify driver role
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'driver') {
    return NextResponse.json({ error: 'Not a driver account' }, { status: 403 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Atomic accept: update only if still unassigned and ready.
  // Use count instead of select().single() — after updating status to
  // 'driver_assigned' the row no longer matches status='ready', so
  // select().single() always returns PGRST116 even on success.
  const { error, count } = await admin
    .from('orders')
    .update({
      nexter_id: user.id,
      status: 'driver_assigned',
      updated_at: new Date().toISOString(),
    }, { count: 'exact' })
    .eq('id', orderId)
    .eq('status', 'ready')
    .is('nexter_id', null)

  if (error) {
    console.error('accept-order update error:', error)
    return NextResponse.json(
      { error: 'Failed to accept order. Please try again.' },
      { status: 500 }
    )
  }

  if (count === 0) {
    return NextResponse.json(
      { error: 'Order is no longer available — another driver accepted it.' },
      { status: 409 }
    )
  }

  // Fetch the accepted order for notification data
  const { data: order } = await admin
    .from('orders')
    .select('customer_id')
    .eq('id', orderId)
    .single()

  if (order?.customer_id) {
    await admin.from('notifications').insert({
      user_id: order.customer_id,
      type: 'order_driver_assigned',
      title: 'Driver Assigned!',
      body: `A driver has accepted your order #${orderId.slice(-6).toUpperCase()} and is heading to the restaurant.`,
      data: { order_id: orderId },
    })
  }

  return NextResponse.json({ success: true, orderId })
}

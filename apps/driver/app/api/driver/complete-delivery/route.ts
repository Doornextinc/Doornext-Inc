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

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify the order belongs to this driver and is in 'delivered' status
  const { data: order } = await admin
    .from('orders')
    .select('nexter_id, status, delivery_fee, tip_amount')
    .eq('id', orderId)
    .single()

  if (!order || order.nexter_id !== user.id) {
    return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: 403 })
  }

  if (order.status !== 'delivered') {
    return NextResponse.json({ error: 'Order is not yet delivered' }, { status: 400 })
  }

  // Increment total_deliveries on driver profile
  const { data: profile } = await admin
    .from('driver_profiles')
    .select('total_deliveries')
    .eq('id', user.id)
    .single()

  if (profile) {
    await admin
      .from('driver_profiles')
      .update({ total_deliveries: (profile.total_deliveries ?? 0) + 1 })
      .eq('id', user.id)
  }

  return NextResponse.json({ success: true })
}

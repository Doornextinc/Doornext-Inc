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

  // Atomic accept: update only if still unassigned and ready
  // Uses service role to bypass RLS for the atomic update
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('orders')
    .update({
      nexter_id: user.id,
      status: 'driver_assigned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'ready')
    .is('nexter_id', null)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Order is no longer available — another driver may have accepted it' },
      { status: 409 }
    )
  }

  // Notify customer
  await admin.from('notifications').insert({
    user_id: data.customer_id,
    type: 'order_driver_assigned',
    title: 'Driver Assigned!',
    body: `A driver has accepted your order #${orderId.slice(-6).toUpperCase()} and is heading to the restaurant.`,
    data: { order_id: orderId },
  })

  return NextResponse.json({ success: true, order: data })
}

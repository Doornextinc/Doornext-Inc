import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

const VALID_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker', 'picked_up',
  'on_the_way', 'arrived_at_customer', 'delivered',
  'failed_delivery', 'cancelled',
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const body = await request.json()
  const { status } = body

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, status, total, subtotal, delivery_fee, tip_amount,
      platform_fee, service_fee, small_order_fee, surge_fee,
      driver_payout, maker_payout, payment_method, is_priority,
      stripe_payment_intent_id, delivery_address, created_at, updated_at,
      nexter_id, customer_id, maker_id,
      food_maker:food_makers(id, display_name, lat, lng),
      order_items(quantity, unit_price, customization_notes, menu_items(name, price)),
      customer:users!orders_customer_id_fkey(full_name, email, phone)
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch driver location if assigned
  let driverLocation = null
  if (order?.nexter_id) {
    const { data: loc } = await supabase
      .from('nexter_locations')
      .select('lat, lng, updated_at')
      .eq('nexter_id', order.nexter_id)
      .single()
    driverLocation = loc ?? null
  }

  // Fetch driver profile if assigned
  let driver = null
  if (order?.nexter_id) {
    const { data: drv } = await supabase
      .from('driver_profiles')
      .select('vehicle_type, avg_rating, total_deliveries')
      .eq('id', order.nexter_id)
      .single()
    const { data: drvUser } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', order.nexter_id)
      .single()
    driver = drv ? { ...drv, full_name: drvUser?.full_name } : null
  }

  return NextResponse.json({ order, driverLocation, driver })
}

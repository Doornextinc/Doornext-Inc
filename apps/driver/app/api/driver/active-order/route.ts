/**
 * GET /api/driver/active-order
 *
 * Returns ALL orders in the driver's current active stack plus the current
 * route plan (ordered stops from driver_route_plans).
 *
 * Response:
 *   {
 *     orders: ActiveOrder[],       // 1 or 2 orders
 *     routePlan: RouteStop[] | null,
 *     isStacked: boolean,
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

const ACTIVE_STATUSES = [
  'driver_assigned',
  'arrived_at_maker',
  'picked_up',
  'on_the_way',
  'arrived_at_customer',
]

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`active-order:${ip}`, 120, 60)) {
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

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all active orders for this driver (may be 1 or 2 when stacked)
  const { data: orders, error } = await admin
    .from('orders')
    .select(`
      id, status, driver_payout, tip_amount, payment_method,
      pickup_pin, pin_attempts, dropoff_note, updated_at, delivery_address,
      order_group_id, arrived_at_maker_at, on_the_way_at,
      order_items(quantity, unit_price, customization_notes, menu_items(name)),
      food_maker:food_makers(display_name, lat, lng),
      customer:users!orders_customer_id_fkey(full_name, phone)
    `)
    .eq('nexter_id', user.id)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[active-order] DB error:', error)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ orders: [], routePlan: null, isStacked: false })
  }

  // Fetch the route plan for this driver (most recent active plan)
  const { data: routePlanRow } = await admin
    .from('driver_route_plans')
    .select('stops, total_distance_km')
    .eq('driver_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const routePlan = routePlanRow?.stops ?? null
  const isStacked = orders.length > 1

  return NextResponse.json({
    orders,
    routePlan,
    totalDistanceKm: routePlanRow?.total_distance_km ?? null,
    isStacked,
    // Legacy single-order compat: first order in the list
    order: orders[0] ?? null,
  })
}

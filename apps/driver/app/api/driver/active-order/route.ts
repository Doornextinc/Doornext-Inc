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

  // Use service role to bypass RLS on nested joins (food_makers, users/customer).
  // The nexter_id = user.id filter is our ownership gate.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('orders')
    .select(`
      id, status, driver_payout, tip_amount, payment_method,
      pickup_pin, pin_attempts, dropoff_note, updated_at, delivery_address,
      order_items(quantity, unit_price, customization_notes, menu_items(name)),
      food_maker:food_makers(display_name, lat, lng),
      customer:users!orders_customer_id_fkey(full_name, phone)
    `)
    .eq('nexter_id', user.id)
    .in('status', ACTIVE_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[active-order] DB error:', error)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }

  return NextResponse.json({ order: data ?? null })
}

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: user, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, account_status, created_at')
    .eq('id', id)
    .single()

  if (error || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let roleData: Record<string, unknown> = {}

  if (user.role === 'customer') {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, status, total, created_at, food_makers(display_name)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: agg } = await supabase
      .from('orders')
      .select('total')
      .eq('customer_id', id)
      .eq('status', 'delivered')

    const totalSpent = (agg ?? []).reduce((s, o) => s + (o.total ?? 0), 0)
    const orderCount = agg?.length ?? 0

    roleData = { orders: orders ?? [], totalSpent, orderCount }
  }

  if (user.role === 'maker') {
    const { data: maker } = await supabase
      .from('food_makers')
      .select('id, display_name, bio, cuisine_tags, avg_rating, total_reviews, is_open, lat, lng')
      .eq('user_id', id)
      .single()

    if (maker) {
      const { count: menuCount } = await supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('maker_id', maker.id)

      const since30d = new Date()
      since30d.setDate(since30d.getDate() - 30)

      const { data: makerOrders } = await supabase
        .from('orders')
        .select('maker_payout')
        .eq('maker_id', maker.id)
        .eq('status', 'delivered')
        .gte('created_at', since30d.toISOString())

      const revenue30d = (makerOrders ?? []).reduce((s, o) => s + (o.maker_payout ?? 0), 0)

      roleData = { maker, menuCount: menuCount ?? 0, revenue30d }
    }
  }

  if (user.role === 'driver') {
    const { data: profile } = await supabase
      .from('driver_profiles')
      .select('id, full_name, vehicle_type, kyc_status, is_active, total_deliveries, avg_rating')
      .eq('id', id)
      .single()

    const since30d = new Date()
    since30d.setDate(since30d.getDate() - 30)

    const { data: driverOrders } = await supabase
      .from('orders')
      .select('driver_payout')
      .eq('nexter_id', id)
      .eq('status', 'delivered')
      .gte('created_at', since30d.toISOString())

    const earnings30d = (driverOrders ?? []).reduce((s, o) => s + (o.driver_payout ?? 0), 0)

    const { data: doc } = await supabase
      .from('driver_documents')
      .select('submitted_at, reviewed_at, review_notes')
      .eq('user_id', id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    roleData = { profile, earnings30d, kycDoc: doc ?? null }
  }

  return NextResponse.json({ user, roleData })
}

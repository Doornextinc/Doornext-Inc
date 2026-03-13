import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const [orderRes, locationRes] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, status, total, platform_fee, driver_payout, maker_payout,
        discount_amt, surge_multiplier, created_at, nexter_id,
        food_maker:food_makers(display_name, address),
        order_items(quantity, unit_price, menu_items(name)),
        delivery_address:addresses(line1, city, postcode),
        user:users(full_name, email),
        driver:driver_profiles(full_name, vehicle_type, avg_rating),
        promo:promo_codes(code, discount_type, discount_value),
        price_tier:price_tiers(name, base_fee)
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('nexter_locations')
      .select('lat, lng, updated_at')
      .eq('nexter_id',
        (await supabase.from('orders').select('nexter_id').eq('id', id).single()).data?.nexter_id ?? ''
      )
      .single(),
  ])

  if (orderRes.error) return NextResponse.json({ error: orderRes.error.message }, { status: 500 })

  return NextResponse.json({
    order: orderRes.data,
    driverLocation: locationRes.data ?? null,
  })
}

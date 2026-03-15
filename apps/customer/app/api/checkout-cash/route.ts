import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { PLATFORM_FEE_PCT } from '@/lib/constants'
import { calculatePricing } from '@doornext/shared/pricing'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cs) => cs.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch {}
          }),
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { items, maker_id, delivery_address, distance_miles, is_priority } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }
    if (!maker_id) {
      return NextResponse.json({ error: 'maker_id required' }, { status: 400 })
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify item prices and availability — never trust client prices
    const itemIds = items.map((i: { id: string }) => i.id)
    const { data: menuItems, error: menuError } = await serviceSupabase
      .from('menu_items')
      .select('id, price, is_available, maker_id')
      .in('id', itemIds)

    if (menuError || !menuItems) {
      return NextResponse.json({ error: 'Failed to verify items' }, { status: 500 })
    }

    for (const item of items as { id: string; quantity: number }[]) {
      const dbItem = menuItems.find((m) => m.id === item.id)
      if (!dbItem) return NextResponse.json({ error: `Item not found: ${item.id}` }, { status: 400 })
      if (!dbItem.is_available) return NextResponse.json({ error: 'One or more items are no longer available' }, { status: 400 })
      if (dbItem.maker_id !== maker_id) return NextResponse.json({ error: 'Items must belong to the same maker' }, { status: 400 })
    }

    const subtotal = (items as { id: string; quantity: number }[]).reduce((sum, item) => {
      const dbItem = menuItems.find((m) => m.id === item.id)!
      return sum + dbItem.price * item.quantity
    }, 0)

    // Load pricing tables
    const [tiersRes, priorityTiersRes, smallOrderFeesRes, surgeRes, settingsRes] = await Promise.all([
      serviceSupabase.from('delivery_distance_tiers').select('*').eq('is_active', true).order('sort_order'),
      serviceSupabase.from('priority_delivery_tiers').select('*').eq('is_active', true).order('sort_order'),
      serviceSupabase.from('small_order_fees').select('*').eq('is_active', true).order('sort_order'),
      serviceSupabase.from('surge_conditions').select('*').eq('is_active', true),
      serviceSupabase.from('settings').select('key, value').in('key', [
        'dynamic_base_pay', 'dynamic_per_mile', 'dynamic_per_min_wait',
        'use_dynamic_pricing', 'priority_driver_bonus', 'service_fee_pct',
      ]),
    ])

    const settingsMap: Record<string, string> = {}
    for (const s of settingsRes.data ?? []) settingsMap[s.key] = s.value

    const pricing = calculatePricing({
      distanceMiles:        distance_miles ?? 3,
      subtotal,
      tip:                  0, // no tip for cash orders
      isPriority:           is_priority ?? false,
      tiers:                tiersRes.data ?? [],
      priorityTiers:        priorityTiersRes.data ?? [],
      smallOrderFees:       smallOrderFeesRes.data ?? [],
      activeSurgeConditions: surgeRes.data ?? [],
      formula: {
        base_pay:              parseFloat(settingsMap.dynamic_base_pay     ?? '2.50'),
        per_mile:              parseFloat(settingsMap.dynamic_per_mile     ?? '0.80'),
        per_min_wait:          parseFloat(settingsMap.dynamic_per_min_wait ?? '0.30'),
        use_dynamic:           settingsMap.use_dynamic_pricing === 'true',
        service_fee_pct:       parseFloat(settingsMap.service_fee_pct      ?? '9'),
        priority_driver_bonus: parseFloat(settingsMap.priority_driver_bonus ?? '2.50'),
      },
    })

    const platformFee = subtotal * PLATFORM_FEE_PCT
    const total = subtotal + pricing.deliveryFee + pricing.smallOrderFee + pricing.surgeFee + pricing.serviceFee

    const { data: order, error: orderError } = await serviceSupabase
      .from('orders')
      .insert({
        customer_id:      user.id,
        maker_id,
        status:           'pending',
        payment_method:   'cash',
        subtotal:         Math.round(subtotal * 100) / 100,
        delivery_fee:     pricing.deliveryFee,
        tip_amount:       0,
        platform_fee:     Math.round(platformFee * 100) / 100,
        service_fee:      pricing.serviceFee,
        small_order_fee:  pricing.smallOrderFee,
        surge_fee:        pricing.surgeFee,
        total:            Math.round(total * 100) / 100,
        is_priority:      is_priority ?? false,
        driver_payout:    pricing.driverTotal,
        maker_payout:     Math.round(subtotal * 0.85 * 100) / 100,
        delivery_address: delivery_address ?? { street: 'N/A', city: 'N/A', state: 'NY', zip: '00000' },
        stripe_payment_intent_id: null,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Cash order creation error:', orderError)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Create order items
    const orderItems = (items as { id: string; quantity: number; notes?: string }[]).map((item) => ({
      order_id:            order.id,
      menu_item_id:        item.id,
      quantity:            item.quantity,
      unit_price:          menuItems.find((m) => m.id === item.id)!.price,
      customization_notes: item.notes ?? null,
    }))
    await serviceSupabase.from('order_items').insert(orderItems)

    return NextResponse.json({
      orderId:         order.id,
      total:           Math.round(total * 100),
      subtotal:        Math.round(subtotal * 100),
      delivery_fee:    pricing.deliveryFee,
      small_order_fee: pricing.smallOrderFee,
      surge_fee:       pricing.surgeFee,
      service_fee:     pricing.serviceFee,
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error('Cash checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

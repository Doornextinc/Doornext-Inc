import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { calculatePricing } from '@doornext/shared/pricing'
import { notifyUser } from '@/lib/push-server'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

/** Parse a DB settings string to a float, falling back to `fallback` on NaN/Infinity. */
function safeFloat(val: string | undefined, fallback: number): number {
  const n = parseFloat(val ?? '')
  return isFinite(n) && n >= 0 ? n : fallback
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 cash checkout attempts per IP per minute
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`checkout-cash:${ip}`, 10, 60)) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
  }

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
    const { items, maker_id, delivery_address, distance_miles, is_priority, dropoff_note } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }
    if (!maker_id) {
      return NextResponse.json({ error: 'maker_id required' }, { status: 400 })
    }
    if (typeof distance_miles !== 'number' || distance_miles < 0) {
      return NextResponse.json({ error: 'distance_miles is required and must be a non-negative number' }, { status: 400 })
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
        'platform_commission_pct',
      ]),
    ])

    const settingsMap: Record<string, string> = {}
    for (const s of settingsRes.data ?? []) settingsMap[s.key] = s.value

    const pricing = calculatePricing({
      distanceMiles:        distance_miles,
      subtotal,
      tip:                  0, // no tip for cash orders
      isPriority:           is_priority ?? false,
      tiers:                tiersRes.data ?? [],
      priorityTiers:        priorityTiersRes.data ?? [],
      smallOrderFees:       smallOrderFeesRes.data ?? [],
      activeSurgeConditions: surgeRes.data ?? [],
      formula: {
        base_pay:              safeFloat(settingsMap.dynamic_base_pay,      2.50),
        per_mile:              safeFloat(settingsMap.dynamic_per_mile,      0.80),
        per_min_wait:          safeFloat(settingsMap.dynamic_per_min_wait,  0.30),
        use_dynamic:           settingsMap.use_dynamic_pricing === 'true',
        service_fee_pct:          safeFloat(settingsMap.service_fee_pct,          9),
        platform_commission_pct:  safeFloat(settingsMap.platform_commission_pct,  5),
        priority_driver_bonus:    safeFloat(settingsMap.priority_driver_bonus,    2.50),
      },
    })

    const commPct = safeFloat(settingsMap.platform_commission_pct, 5) / 100
    const platformFee = subtotal * commPct
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
        maker_payout:     Math.round(subtotal * (1 - commPct) * 100) / 100,
        delivery_address: delivery_address ?? { street: 'N/A', city: 'N/A', state: 'NY', zip: '00000' },
        dropoff_note:     typeof dropoff_note === 'string' ? dropoff_note.trim() : null,
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

    // Notify maker of new cash order (fire-and-forget)
    const { data: makerProfile } = await serviceSupabase
      .from('food_makers')
      .select('user_id')
      .eq('id', maker_id)
      .single()
    if (makerProfile?.user_id) {
      const shortId = order.id.slice(-6).toUpperCase()
      notifyUser(serviceSupabase, {
        userId: makerProfile.user_id,
        type: 'new_order',
        title: '🔔 New Cash Order!',
        body: `Order #${shortId} — cash on delivery. Tap to review.`,
        data: { order_id: order.id },
      }).catch((err) => Sentry.captureException(err, { extra: { orderId: order.id, context: 'checkout-cash-notify' } }))
    }

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

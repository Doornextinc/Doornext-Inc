/**
 * Multi-maker cash checkout.
 *
 * Creates one cash order per maker, linked by a shared order_group_id.
 *
 * POST /api/checkout-cash-multi
 * Body:
 *   {
 *     makers: Array<{
 *       maker_id: string
 *       items:    Array<{ id: string; quantity: number; notes?: string }>
 *       distance_miles: number
 *     }>
 *     delivery_address: { street, city, state, zip, lat?, lng? }
 *     dropoff_note: string
 *     order_group_id: string
 *   }
 *
 * Response:
 *   { orderGroupId, orderIds }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { calculatePricing } from '@doornext/shared/pricing'
import { notifyUser } from '@doornext/shared/notify'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

function safeFloat(val: string | undefined, fallback: number): number {
  const n = parseFloat(val ?? '')
  return isFinite(n) && n >= 0 ? n : fallback
}

type MakerBucket = {
  maker_id: string
  items: Array<{ id: string; quantity: number; notes?: string }>
  distance_miles: number
}

export async function POST(req: NextRequest) {
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
    const {
      makers: makerBuckets,
      delivery_address,
      dropoff_note,
      order_group_id,
    }: {
      makers: MakerBucket[]
      delivery_address: Record<string, unknown>
      dropoff_note: string
      order_group_id: string
    } = body

    if (!makerBuckets || !Array.isArray(makerBuckets) || makerBuckets.length === 0) {
      return NextResponse.json({ error: 'No makers provided' }, { status: 400 })
    }
    if (!delivery_address) {
      return NextResponse.json({ error: 'delivery_address required' }, { status: 400 })
    }
    if (!order_group_id) {
      return NextResponse.json({ error: 'order_group_id required' }, { status: 400 })
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Load shared pricing tables once
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
    const commPct = safeFloat(settingsMap.platform_commission_pct, 5) / 100

    // Collect all item IDs for a single DB lookup
    const allItemIds = makerBuckets.flatMap((b) => b.items.map((i) => i.id))
    const { data: allMenuItems, error: menuError } = await serviceSupabase
      .from('menu_items')
      .select('id, price, is_available, maker_id')
      .in('id', allItemIds)

    if (menuError || !allMenuItems) {
      return NextResponse.json({ error: 'Failed to verify items' }, { status: 500 })
    }

    // Verify maker statuses
    const allMakerIds = makerBuckets.map((b) => b.maker_id)
    const { data: makerStatuses } = await serviceSupabase
      .from('food_makers')
      .select('id, approval_status, is_open, user_id')
      .in('id', allMakerIds)

    // Validate each bucket
    for (const bucket of makerBuckets) {
      if (!bucket.maker_id || !bucket.items?.length) {
        return NextResponse.json({ error: 'Each maker bucket must have a maker_id and items' }, { status: 400 })
      }
      if (typeof bucket.distance_miles !== 'number' || bucket.distance_miles < 0) {
        return NextResponse.json({ error: 'distance_miles must be a non-negative number' }, { status: 400 })
      }

      const makerStatus = makerStatuses?.find((m) => m.id === bucket.maker_id)
      if (!makerStatus || makerStatus.approval_status !== 'approved') {
        return NextResponse.json({ error: `Kitchen ${bucket.maker_id} is not currently available` }, { status: 400 })
      }
      if (!makerStatus.is_open) {
        return NextResponse.json({ error: `Kitchen ${bucket.maker_id} is currently closed` }, { status: 400 })
      }

      for (const item of bucket.items) {
        const dbItem = allMenuItems.find((m) => m.id === item.id)
        if (!dbItem) return NextResponse.json({ error: `Item not found: ${item.id}` }, { status: 400 })
        if (!dbItem.is_available) return NextResponse.json({ error: 'One or more items are no longer available' }, { status: 400 })
        if (dbItem.maker_id !== bucket.maker_id) {
          return NextResponse.json({ error: `Item ${item.id} does not belong to maker ${bucket.maker_id}` }, { status: 400 })
        }
      }
    }

    const orderIds: string[] = []
    const safeDropoffNote = typeof dropoff_note === 'string' ? dropoff_note.trim() : null

    for (const bucket of makerBuckets) {
      const subtotal = bucket.items.reduce((sum, item) => {
        const dbItem = allMenuItems.find((m) => m.id === item.id)!
        return sum + dbItem.price * item.quantity
      }, 0)

      const pricing = calculatePricing({
        distanceMiles:         bucket.distance_miles,
        subtotal,
        tip:                   0,
        isPriority:            false,
        tiers:                 tiersRes.data ?? [],
        priorityTiers:         priorityTiersRes.data ?? [],
        smallOrderFees:        smallOrderFeesRes.data ?? [],
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

      const platformFee = subtotal * commPct
      const orderTotal = subtotal + pricing.deliveryFee + pricing.smallOrderFee + pricing.surgeFee + pricing.serviceFee

      const { data: order, error: orderError } = await serviceSupabase
        .from('orders')
        .insert({
          customer_id:      user.id,
          maker_id:         bucket.maker_id,
          status:           'pending',
          payment_method:   'cash',
          order_group_id,
          subtotal:         Math.round(subtotal * 100) / 100,
          delivery_fee:     pricing.deliveryFee,
          tip_amount:       0,
          platform_fee:     Math.round(platformFee * 100) / 100,
          service_fee:      pricing.serviceFee,
          small_order_fee:  pricing.smallOrderFee,
          surge_fee:        pricing.surgeFee,
          total:            Math.round(orderTotal * 100) / 100,
          is_priority:      false,
          driver_payout:    pricing.driverTotal,
          maker_payout:     Math.round(subtotal * (1 - commPct) * 100) / 100,
          delivery_address: delivery_address,
          dropoff_note:     safeDropoffNote,
          stripe_payment_intent_id: null,
        })
        .select('id')
        .single()

      if (orderError || !order) {
        console.error('Cash order creation error:', orderError)
        // Clean up any orders already created in this group
        if (orderIds.length > 0) {
          await serviceSupabase.from('orders').delete().in('id', orderIds)
        }
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }
      orderIds.push(order.id)

      // Insert order items
      const orderItems = bucket.items.map((item) => ({
        order_id:            order.id,
        menu_item_id:        item.id,
        quantity:            item.quantity,
        unit_price:          allMenuItems.find((m) => m.id === item.id)!.price,
        customization_notes: item.notes ?? null,
      }))
      const { error: itemsError } = await serviceSupabase.from('order_items').insert(orderItems)
      if (itemsError) {
        // Roll back this order plus all earlier orders in the group.
        console.error('Cash multi order items insert failed:', itemsError)
        Sentry.captureException(itemsError, {
          tags: { context: 'order_items_insert_failed_cash_multi' },
          extra: { orderId: order.id, orderGroupId: order_group_id },
        })
        await serviceSupabase.from('orders').delete().in('id', orderIds)
        return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 })
      }

      // Notify maker (fire-and-forget)
      const makerProfile = makerStatuses?.find((m) => m.id === bucket.maker_id)
      if (makerProfile?.user_id) {
        const shortId = order.id.slice(-6).toUpperCase()
        notifyUser(serviceSupabase, {
          userId: makerProfile.user_id,
          type: 'new_order',
          title: '🔔 New Cash Order!',
          body: `Order #${shortId} — cash on delivery. Tap to review.`,
          data: { order_id: order.id, order_group_id },
        }).catch((err) => Sentry.captureException(err, { extra: { orderId: order.id } }))
      }
    }

    return NextResponse.json({ orderGroupId: order_group_id, orderIds })
  } catch (error) {
    Sentry.captureException(error)
    console.error('Multi cash checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

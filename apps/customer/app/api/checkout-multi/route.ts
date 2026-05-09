/**
 * Multi-maker card checkout.
 *
 * Accepts an array of maker buckets, creates one Stripe PaymentIntent for the
 * combined total, and inserts one order per maker linked by a shared
 * order_group_id.
 *
 * POST /api/checkout-multi
 * Body:
 *   {
 *     makers: Array<{
 *       maker_id: string
 *       items:    Array<{ id: string; quantity: number; notes?: string }>
 *       distance_miles: number
 *     }>
 *     order_group_id: string   // client-generated UUID linking all orders
 *   }
 *
 * Response:
 *   { clientSecret, orderGroupId, orderIds, total }
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { calculatePricing } from '@doornext/shared/pricing'
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
  if (!await checkRateLimit(`checkout:${ip}`, 10, 60)) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Payment not configured' }, { status: 500 })
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })

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
      order_group_id,
      delivery_address,
      dropoff_note,
    }: {
      makers: MakerBucket[]
      order_group_id: string
      delivery_address?: { street: string; city: string; state: string; zip: string; lat?: number; lng?: number }
      dropoff_note?: string
    } = body

    if (!makerBuckets || !Array.isArray(makerBuckets) || makerBuckets.length === 0) {
      return NextResponse.json({ error: 'No makers provided' }, { status: 400 })
    }
    if (!order_group_id) {
      return NextResponse.json({ error: 'order_group_id required' }, { status: 400 })
    }
    if (!delivery_address || !delivery_address.street) {
      return NextResponse.json({ error: 'delivery_address required' }, { status: 400 })
    }

    const safeDropoffNote = (dropoff_note ?? '').toString().slice(0, 500).trim() || null

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

    // Collect all item IDs across all makers for a single DB lookup
    const allItemIds = makerBuckets.flatMap((b) => b.items.map((i) => i.id))
    const { data: allMenuItems, error: menuError } = await serviceSupabase
      .from('menu_items')
      .select('id, price, is_available, maker_id')
      .in('id', allItemIds)

    if (menuError || !allMenuItems) {
      return NextResponse.json({ error: 'Failed to verify items' }, { status: 500 })
    }

    // Verify all maker statuses in one query
    const allMakerIds = makerBuckets.map((b) => b.maker_id)
    const { data: makerStatuses } = await serviceSupabase
      .from('food_makers')
      .select('id, approval_status, is_open')
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

    // Check user account status
    const { data: userProfile } = await serviceSupabase
      .from('users')
      .select('stripe_customer_id, email, account_status')
      .eq('id', user.id)
      .single()

    if (userProfile?.account_status === 'banned' || userProfile?.account_status === 'suspended') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
    }

    // Find or create Stripe Customer
    let stripeCustomerId = userProfile?.stripe_customer_id as string | undefined
    if (!stripeCustomerId) {
      const newCustomer = await stripe.customers.create({
        email: user.email ?? userProfile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      const { count: casCount } = await serviceSupabase
        .from('users')
        .update({ stripe_customer_id: newCustomer.id }, { count: 'exact' })
        .eq('id', user.id)
        .is('stripe_customer_id', null)

      if (!casCount || casCount === 0) {
        stripe.customers.del(newCustomer.id).catch(() => {})
        const { data: refreshed } = await serviceSupabase
          .from('users').select('stripe_customer_id').eq('id', user.id).single()
        stripeCustomerId = refreshed?.stripe_customer_id ?? undefined
      } else {
        stripeCustomerId = newCustomer.id
      }
    }

    // Calculate pricing per maker and sum grand total
    let grandTotal = 0
    const pricingResults = makerBuckets.map((bucket) => {
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

      const orderTotal = subtotal + pricing.deliveryFee + pricing.smallOrderFee + pricing.surgeFee + pricing.serviceFee
      grandTotal += orderTotal
      return { bucket, subtotal, pricing, orderTotal }
    })

    // Create one combined PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(grandTotal * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: {
        customer_id: user.id,
        order_group_id,
        maker_count: makerBuckets.length,
      },
    })

    // Insert one order per maker, all sharing order_group_id
    const orderIds: string[] = []
    for (const { bucket, subtotal, pricing, orderTotal } of pricingResults) {
      const platformFee = subtotal * commPct

      const { data: order, error: orderError } = await serviceSupabase
        .from('orders')
        .insert({
          customer_id:      user.id,
          maker_id:         bucket.maker_id,
          status:           'awaiting_payment',
          payment_method:   'card',
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
          delivery_address,
          dropoff_note: safeDropoffNote,
          stripe_payment_intent_id: paymentIntent.id,
        })
        .select('id')
        .single()

      if (orderError || !order) {
        console.error('Order creation error:', orderError)
        // Cancel PI and any orders already created
        await stripe.paymentIntents.cancel(paymentIntent.id)
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
        // Roll back this group entirely — order with no items is unusable.
        console.error('Order items insert failed:', itemsError)
        Sentry.captureException(itemsError, {
          tags: { context: 'order_items_insert_failed_card_multi' },
          extra: { orderId: order.id, orderGroupId: order_group_id, paymentIntentId: paymentIntent.id },
        })
        await Promise.allSettled([
          serviceSupabase.from('orders').delete().in('id', orderIds),
          stripe.paymentIntents.cancel(paymentIntent.id),
        ])
        return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 })
      }
    }

    // Update PI metadata with all order IDs
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        customer_id:   user.id,
        order_group_id,
        order_ids:     orderIds.join(','),
        maker_count:   makerBuckets.length,
      },
    })

    return NextResponse.json({
      clientSecret:   paymentIntent.client_secret,
      orderGroupId:   order_group_id,
      orderIds,
      total:          Math.round(grandTotal * 100),
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error('Multi checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { calculatePricing } from '@doornext/shared/pricing'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

/** Parse a DB settings string to a float, falling back to `fallback` on NaN/Infinity. */
function safeFloat(val: string | undefined, fallback: number): number {
  const n = parseFloat(val ?? '')
  return isFinite(n) && n >= 0 ? n : fallback
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 checkout attempts per IP per minute
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`checkout:${ip}`, 10, 60)) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'Payment not configured' }, { status: 500 })
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' })
  try {
    // Get authenticated user
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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      items,
      maker_id,
      delivery_address,
      distance_miles,
      is_priority,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }
    if (!maker_id) {
      return NextResponse.json({ error: 'maker_id required' }, { status: 400 })
    }
    if (typeof distance_miles !== 'number' || distance_miles < 0) {
      return NextResponse.json({ error: 'distance_miles is required and must be a non-negative number' }, { status: 400 })
    }

    // Load pricing tables from DB (needed before price verification)
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify item prices and availability from DB — never trust client-submitted prices
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
      if (!dbItem) {
        return NextResponse.json({ error: `Item not found: ${item.id}` }, { status: 400 })
      }
      if (!dbItem.is_available) {
        return NextResponse.json({ error: 'One or more items are no longer available' }, { status: 400 })
      }
      if (dbItem.maker_id !== maker_id) {
        return NextResponse.json({ error: 'Items must belong to the same maker' }, { status: 400 })
      }
    }

    // Verify maker is approved — service role bypasses RLS so we must check explicitly
    const { data: makerStatus } = await serviceSupabase
      .from('food_makers')
      .select('approval_status, is_open')
      .eq('id', maker_id)
      .single()
    if (!makerStatus || makerStatus.approval_status !== 'approved') {
      return NextResponse.json({ error: 'This kitchen is not currently available' }, { status: 400 })
    }
    if (!makerStatus.is_open) {
      return NextResponse.json({ error: 'This kitchen is currently closed' }, { status: 400 })
    }

    // Server-side total calculation using verified DB prices (prevents price tampering)
    const subtotal = (items as { id: string; quantity: number }[]).reduce((sum, item) => {
      const dbItem = menuItems.find((m) => m.id === item.id)!
      return sum + dbItem.price * item.quantity
    }, 0)

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

    // Find or create Stripe Customer so payment methods are saved for future use
    const { data: userProfile } = await serviceSupabase
      .from('users')
      .select('stripe_customer_id, email, account_status')
      .eq('id', user.id)
      .single()

    if (userProfile?.account_status === 'banned' || userProfile?.account_status === 'suspended') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
    }

    let stripeCustomerId = userProfile?.stripe_customer_id as string | undefined
    if (!stripeCustomerId) {
      // Create the Stripe customer first, then write it atomically only if no other
      // concurrent request has already done so (first-writer-wins CAS).
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
        // Another concurrent checkout won the race — delete our orphaned customer
        // and use the one that was already written.
        stripe.customers.del(newCustomer.id).catch(() => {})
        const { data: refreshed } = await serviceSupabase
          .from('users')
          .select('stripe_customer_id')
          .eq('id', user.id)
          .single()
        stripeCustomerId = refreshed?.stripe_customer_id ?? undefined
      } else {
        stripeCustomerId = newCustomer.id
      }
    }

    const pricing = calculatePricing({
      distanceMiles:        distance_miles,
      subtotal,
      tip:                  0,
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

    // Create Stripe PaymentIntent — attach customer so payment method is saved
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: {
        customer_id: user.id,
        maker_id,
        item_count: items.length,
      },
    })

    const { data: order, error: orderError } = await serviceSupabase
      .from('orders')
      .insert({
        customer_id:      user.id,
        maker_id,
        status:           'awaiting_payment',
        payment_method:   'card',
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
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Order creation error:', orderError)
      await stripe.paymentIntents.cancel(paymentIntent.id)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Create order items using DB-verified prices
    const orderItems = (items as { id: string; quantity: number; notes?: string }[]).map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.quantity,
      unit_price: menuItems.find((m) => m.id === item.id)!.price,
      customization_notes: item.notes ?? null,
    }))

    await serviceSupabase.from('order_items').insert(orderItems)

    // Update PaymentIntent metadata with orderId for webhook lookup
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        customer_id: user.id,
        maker_id,
        order_id: order.id,
        item_count: items.length,
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
      total: Math.round(total * 100),
      subtotal: Math.round(subtotal * 100),
      delivery_fee: pricing.deliveryFee,
      small_order_fee: pricing.smallOrderFee,
      surge_fee: pricing.surgeFee,
      service_fee: pricing.serviceFee,
      pricing_breakdown: {
        customerLines: pricing.customerLines,
        tierLabel: pricing.tierLabel,
      },
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

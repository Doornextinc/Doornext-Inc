/**
 * Delivery fee estimate endpoint.
 *
 * Returns the full pricing breakdown for a given maker + subtotal + distance.
 * Called client-side whenever the customer selects or changes their delivery address,
 * so the checkout page can show the real fee before creating a PaymentIntent.
 *
 * No order is created. No payment is taken. Safe to call multiple times.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { calculatePricing } from '@doornext/shared/pricing'
import { checkRateLimit } from '@/lib/rate-limit'

/** Parse a DB settings string to a float, falling back to `fallback` on NaN/Infinity. */
function safeFloat(val: string | undefined, fallback: number): number {
  const n = parseFloat(val ?? '')
  return isFinite(n) && n >= 0 ? n : fallback
}

export async function POST(req: NextRequest) {
  // 60 estimates per minute per IP — generous for address-change interactions
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`checkout-estimate:${ip}`, 60, 60)) {
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

  const { maker_id, subtotal, distance_miles, is_priority } = await req.json()

  if (!maker_id || typeof subtotal !== 'number' || typeof distance_miles !== 'number') {
    return NextResponse.json({ error: 'maker_id, subtotal, and distance_miles required' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [tiersRes, priorityTiersRes, smallOrderFeesRes, surgeRes, settingsRes] = await Promise.all([
    admin.from('delivery_distance_tiers').select('*').eq('is_active', true).order('sort_order'),
    admin.from('priority_delivery_tiers').select('*').eq('is_active', true).order('sort_order'),
    admin.from('small_order_fees').select('*').eq('is_active', true).order('sort_order'),
    admin.from('surge_conditions').select('*').eq('is_active', true),
    admin.from('settings').select('key, value').in('key', [
      'dynamic_base_pay', 'dynamic_per_mile', 'dynamic_per_min_wait',
      'use_dynamic_pricing', 'priority_driver_bonus', 'service_fee_pct',
    ]),
  ])

  const settingsMap: Record<string, string> = {}
  for (const s of settingsRes.data ?? []) settingsMap[s.key] = s.value

  const pricing = calculatePricing({
    distanceMiles:         distance_miles,
    subtotal,
    tip:                   0,
    isPriority:            is_priority ?? false,
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

  const total = subtotal + pricing.deliveryFee + pricing.smallOrderFee + pricing.surgeFee + pricing.serviceFee

  return NextResponse.json({
    delivery_fee:    pricing.deliveryFee,
    service_fee:     pricing.serviceFee,
    small_order_fee: pricing.smallOrderFee,
    surge_fee:       pricing.surgeFee,
    driver_total:    pricing.driverTotal,
    total:           Math.round(total * 100) / 100,
    distance_miles,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'
import { snapshotFees } from '@doornext/shared/pricing'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`complete-delivery:${ip}`, 20, 60)) {
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

  const { orderId } = await req.json()
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // ── 1. Load order + verify ownership ───────────────────────────────────
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select(`
        nexter_id, maker_id, status,
        subtotal, delivery_fee, service_fee, small_order_fee,
        surge_fee, tip_amount, driver_payout, platform_fee
      `)
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.nexter_id !== user.id) {
      return NextResponse.json({ error: 'Not your order' }, { status: 403 })
    }
    if (order.status !== 'delivered') {
      return NextResponse.json({ error: 'Order is not yet delivered' }, { status: 400 })
    }

    // ── 2. Look up platform_commission_pct from settings ──────────────────
    const { data: settingRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'platform_commission_pct')
      .maybeSingle()
    const commPct = settingRow ? parseFloat(settingRow.value) : 5

    // ── 3. Calculate fee split ─────────────────────────────────────────────
    const fees = snapshotFees({
      subtotal: Number(order.subtotal),
      delivery_fee: Number(order.delivery_fee),
      service_fee: Number(order.service_fee ?? 0),
      small_order_fee: Number(order.small_order_fee ?? 0),
      surge_fee: Number(order.surge_fee ?? 0),
      tip_amount: Number(order.tip_amount ?? 0),
      driver_payout: Number(order.driver_payout),
      platform_fee_pct: commPct,
    })

    // ── 4. Write all records in parallel (idempotent via ON CONFLICT) ──────
    const [splitRes, makerRes, deliveryCountRes] = await Promise.all([
      // Audit split record
      admin.from('order_fee_splits').upsert(
        {
          order_id: orderId,
          subtotal: order.subtotal,
          delivery_fee: order.delivery_fee,
          service_fee: order.service_fee ?? 0,
          small_order_fee: order.small_order_fee ?? 0,
          surge_fee: order.surge_fee ?? 0,
          tip_amount: order.tip_amount ?? 0,
          driver_payout: fees.driverPayout,
          maker_payout: fees.makerPayout,
          platform_commission: fees.platformCommission,
          platform_net: fees.platformFee,
        },
        { onConflict: 'order_id', ignoreDuplicates: true }
      ),

      // Maker earnings record
      admin.from('maker_earnings').upsert(
        {
          maker_id: order.maker_id,
          order_id: orderId,
          subtotal: order.subtotal,
          platform_commission: fees.platformCommission,
          payout: fees.makerPayout,
          status: 'pending',
        },
        { onConflict: 'order_id', ignoreDuplicates: true }
      ),

      // Delivery count for driver profile (read fresh for idempotency)
      admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('nexter_id', user.id)
        .eq('status', 'delivered'),
    ])

    if (splitRes.error) {
      Sentry.captureException(splitRes.error, { extra: { orderId, context: 'fee_split_upsert' } })
    }
    if (makerRes.error) {
      Sentry.captureException(makerRes.error, { extra: { orderId, context: 'maker_earnings_upsert' } })
    }

    // ── 5. Update driver profile delivery count ────────────────────────────
    await admin
      .from('driver_profiles')
      .update({ total_deliveries: deliveryCountRes.count ?? 0 })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      fees: {
        driverPayout: fees.driverPayout,
        makerPayout: fees.makerPayout,
        platformNet: fees.platformFee,
        platformCommission: fees.platformCommission,
      },
    })
  } catch (err) {
    Sentry.captureException(err, { extra: { userId: user.id, orderId } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

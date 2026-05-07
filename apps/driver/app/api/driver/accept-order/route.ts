/**
 * POST /api/driver/accept-order
 *
 * DoorDash-style stacking:
 *   - 0 active orders → normal single accept
 *   - 1 active order  → check stack compatibility; if compatible, stack with bonus
 *   - 2+ active orders → reject (at limit)
 *
 * Uses accept_order_atomic() SECURITY DEFINER RPC for race-safe acceptance.
 * Creates a driver_route_plans row whenever 2 orders are stacked.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { StreamChat } from 'stream-chat'
import { cookies } from 'next/headers'
import { notifyUser } from '@doornext/shared/notify'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  scoreStackCompatibility,
  buildSingleOrderStops,
  type StackableOrder,
} from '@doornext/shared/stacking'
import * as Sentry from '@sentry/nextjs'

const ACTIVE_STATUSES = [
  'driver_assigned',
  'arrived_at_maker',
  'picked_up',
  'on_the_way',
  'arrived_at_customer',
]

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`accept-order:${ip}`, 20, 60)) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId, driverLat, driverLng } = await req.json()
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  // Verify driver role
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'driver') {
    return NextResponse.json({ error: 'Not a driver account' }, { status: 403 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify driver is approved
  const { data: driverStatus } = await admin
    .from('driver_profiles')
    .select('kyc_status')
    .eq('id', user.id)
    .single()
  if (driverStatus?.kyc_status !== 'approved') {
    return NextResponse.json({ error: 'Driver verification is not complete' }, { status: 403 })
  }

  // ── Load stacking settings ─────────────────────────────────────────────
  const { data: settingsRows } = await admin
    .from('settings')
    .select('key, value')
    .in('key', [
      'stack_limit',
      'stack_bonus_amount',
      'stack_pickup_radius_km',
      'stack_dropoff_radius_km',
      'stack_detour_pct',
    ])

  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const stackLimit      = parseInt(settings.stack_limit      ?? '2', 10)
  const stackBonus      = parseFloat(settings.stack_bonus_amount    ?? '1.50')
  const pickupRadius    = parseFloat(settings.stack_pickup_radius_km ?? '3.0')
  const dropoffRadius   = parseFloat(settings.stack_dropoff_radius_km ?? '4.0')
  const detourPct       = parseFloat(settings.stack_detour_pct       ?? '40')

  // ── Load driver's current active orders ───────────────────────────────
  const { data: activeOrders } = await admin
    .from('orders')
    .select(`
      id, status,
      delivery_address,
      food_maker:food_makers(display_name, lat, lng)
    `)
    .eq('nexter_id', user.id)
    .in('status', ACTIVE_STATUSES)

  const activeCount = activeOrders?.length ?? 0

  if (activeCount >= stackLimit) {
    return NextResponse.json(
      { error: `You already have ${activeCount} active orders — at the stack limit.` },
      { status: 409 }
    )
  }

  // ── Load the candidate order ──────────────────────────────────────────
  const { data: candidateOrder } = await admin
    .from('orders')
    .select(`
      id, customer_id, maker_id,
      delivery_address,
      food_maker:food_makers(display_name, lat, lng)
    `)
    .eq('id', orderId)
    .in('status', ['preparing', 'ready'])
    .is('nexter_id', null)
    .maybeSingle()

  if (!candidateOrder) {
    return NextResponse.json(
      { error: 'Order is no longer available — another driver accepted it.' },
      { status: 409 }
    )
  }

  // ── Determine stacking vs single ─────────────────────────────────────
  const isStacking   = activeCount === 1
  let groupId:       string | null     = null
  let existingIds:   string[]          = []
  let bonusAmount    = 0
  let routeStops:    object[]          = []
  let totalDistKm:   number | null     = null

  type MakerShape = { display_name: string; lat: number; lng: number }
  type AddrShape  = { lat?: number; lng?: number; street?: string }

  // Build stackable order shapes
  const makerData = (candidateOrder.food_maker as unknown) as MakerShape | null
  const candAddr  = candidateOrder.delivery_address as AddrShape | null

  const candidateStackable: StackableOrder | null =
    makerData && candAddr?.lat != null && candAddr?.lng != null
      ? {
          id:      candidateOrder.id,
          pickup:  { lat: makerData.lat,   lng: makerData.lng,   label: makerData.display_name },
          dropoff: { lat: candAddr.lat!,   lng: candAddr.lng!,   label: candAddr.street ?? 'Customer' },
        }
      : null

  if (isStacking && candidateStackable) {
    const existing = activeOrders![0]
    const exMaker  = (existing.food_maker as unknown) as MakerShape | null
    const exAddr   = existing.delivery_address as AddrShape | null

    if (exMaker && exAddr?.lat != null && exAddr?.lng != null) {
      const existingStackable: StackableOrder = {
        id:      existing.id,
        pickup:  { lat: exMaker.lat,  lng: exMaker.lng,  label: exMaker.display_name },
        dropoff: { lat: exAddr.lat!,  lng: exAddr.lng!,  label: exAddr.street ?? 'Customer' },
      }

      const dLat = driverLat ?? 0
      const dLng = driverLng ?? 0
      const compat = scoreStackCompatibility(
        { lat: dLat, lng: dLng },
        existingStackable,
        candidateStackable,
        { pickupRadiusKm: pickupRadius, dropoffRadiusKm: dropoffRadius, detourPct },
      )

      if (compat) {
        // Stack is compatible — use shared group ID
        const existingRec = existing as unknown as { order_group_id?: string | null }
        groupId       = existingRec.order_group_id ?? crypto.randomUUID()
        existingIds   = [existing.id]
        bonusAmount   = stackBonus
        routeStops    = compat.stops
        totalDistKm   = compat.totalDistanceKm
      }
      // If incompatible, fall through to single accept (same as 0 active)
    }
  } else if (!isStacking && candidateStackable) {
    // Single order — build a simple 2-stop plan
    routeStops  = buildSingleOrderStops(candidateStackable)
    totalDistKm = null
  }

  // ── Generate PIN ──────────────────────────────────────────────────────
  const pickup_pin = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000))

  // ── Atomic accept via SECURITY DEFINER RPC ────────────────────────────
  const { data: rpcResult, error: rpcError } = await admin.rpc(
    'accept_order_atomic',
    {
      p_driver_id:    user.id,
      p_order_id:     orderId,
      p_pickup_pin:   pickup_pin,
      p_group_id:     groupId,
      p_existing_ids: existingIds.length > 0 ? existingIds : null,
      p_bonus_amount: bonusAmount,
    }
  )

  if (rpcError) {
    Sentry.captureException(new Error(`accept_order_atomic error: ${rpcError.message}`), {
      extra: { orderId, userId: user.id },
    })
    return NextResponse.json(
      { error: 'Failed to accept order. Please try again.' },
      { status: 500 }
    )
  }

  if (rpcResult === 'taken') {
    return NextResponse.json(
      { error: 'Order is no longer available — another driver accepted it.' },
      { status: 409 }
    )
  }

  if (rpcResult === 'bad_state') {
    return NextResponse.json(
      { error: 'Order cannot be accepted in its current state.' },
      { status: 409 }
    )
  }

  // ── Upsert route plan ─────────────────────────────────────────────────
  if (routeStops.length > 0) {
    const finalGroupId = groupId ?? orderId // single order: use orderId as group
    admin.from('driver_route_plans').upsert(
      {
        driver_id:         user.id,
        order_group_id:    finalGroupId,
        stops:             routeStops,
        total_distance_km: totalDistKm,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: 'driver_id,order_group_id' }
    ).then(({ error: e }) => {
      if (e) Sentry.captureException(e, { extra: { orderId, context: 'route_plan_upsert' } })
    })
  }

  const allOrderIds = [...existingIds, orderId]

  // ── Side-effects (fire-and-forget) ────────────────────────────────────
  void (async () => {
    try {
      const shortId = orderId.slice(-6).toUpperCase()

      // Fetch driver profile + all customer/maker IDs
      const [{ data: driverProfile }] = await Promise.all([
        admin.from('users').select('full_name, avatar_url').eq('id', user.id).single(),
      ])

      // Notify all affected customers
      const orderIdsToNotify = allOrderIds
      const { data: notifyOrders } = await admin
        .from('orders')
        .select('id, customer_id, maker_id')
        .in('id', orderIdsToNotify)

      for (const o of notifyOrders ?? []) {
        const oShortId = o.id.slice(-6).toUpperCase()
        const isStack  = isStacking && bonusAmount > 0

        await notifyUser(admin, {
          userId: o.customer_id,
          type:   'order_driver_assigned',
          title:  'Driver Assigned! 🛵',
          body:   isStack
            ? `A driver is picking up multiple orders including yours #${oShortId}.`
            : `A driver has accepted your order #${oShortId} and is heading to the restaurant.`,
          data: { order_id: o.id },
        }).catch(() => {})

        // Notify maker
        if (o.maker_id) {
          const { data: makerProfile } = await admin
            .from('food_makers').select('user_id').eq('id', o.maker_id).single()
          if (makerProfile?.user_id) {
            notifyUser(admin, {
              userId: makerProfile.user_id,
              type:   'driver_heading_to_maker',
              title:  '🛵 Driver is on the way!',
              body:   `A driver has accepted order #${oShortId} and is heading to your kitchen.`,
              data:   { order_id: o.id },
            }).catch(() => {})
          }
        }
      }

      // Stream Chat: create a channel per order
      const streamApiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
      const streamSecret  = process.env.STREAM_API_SECRET
      const isUnconfigured = (v?: string) =>
        !v || v.startsWith('your-') || v.includes('placeholder') || v.length < 8

      if (!isUnconfigured(streamApiKey) && !isUnconfigured(streamSecret)) {
        const stream = StreamChat.getInstance(streamApiKey!, streamSecret!)
        const usersToUpsert = [
          {
            id:    user.id,
            name:  driverProfile?.full_name ?? 'Driver',
            image: driverProfile?.avatar_url ?? undefined,
            role:  'user' as const,
          },
        ]

        for (const o of notifyOrders ?? []) {
          try {
            const memberIds = [user.id, o.customer_id].filter(Boolean)
            await stream.upsertUsers(usersToUpsert)
            const channel = stream.channel('messaging', `order-${o.id}`, {
              members:        memberIds,
              created_by_id:  user.id,
            })
            await channel.create()
          } catch (e) {
            Sentry.captureException(e, { extra: { orderId: o.id, context: 'stream-channel' } })
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e, { extra: { orderId, context: 'accept-order-side-effects' } })
    }
  })()

  // Reliability stat
  void (admin.rpc('increment_driver_accepted', { driver_id: user.id }) as unknown as Promise<unknown>).catch(() => {})

  return NextResponse.json({
    success:      true,
    orderId,
    stacked:      isStacking && bonusAmount > 0,
    groupId,
    allOrderIds,
    bonusAmount,
  })
}

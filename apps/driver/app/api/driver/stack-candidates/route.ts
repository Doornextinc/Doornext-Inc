/**
 * GET /api/driver/stack-candidates
 *
 * Returns unassigned orders (preparing/ready) that are compatible with the
 * driver's current active order for stacking.
 *
 * Query params:
 *   lat  — driver current latitude
 *   lng  — driver current longitude
 *
 * Response:
 *   { candidates: StackCandidate[] }
 *
 * Each candidate includes the compatibility score, estimated detour, and
 * recommended stop sequence so the UI can display it immediately.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  scoreStackCompatibility,
  type StackableOrder,
  type RouteStop,
} from '@doornext/shared/stacking'
import * as Sentry from '@sentry/nextjs'

const ACTIVE_STATUSES = [
  'driver_assigned',
  'arrived_at_maker',
  'picked_up',
  'on_the_way',
  'arrived_at_customer',
]

export interface StackCandidate {
  order_id:        string
  maker_name:      string
  subtotal:        number
  driver_payout:   number
  tip_amount:      number
  created_at:      string
  score:           number
  detour_km:       number
  total_distance_km: number
  stops:           RouteStop[]
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`stack-candidates:${ip}`, 60, 60)) {
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

  const url     = new URL(req.url)
  const dLat    = parseFloat(url.searchParams.get('lat') ?? '')
  const dLng    = parseFloat(url.searchParams.get('lng') ?? '')
  const driverPos = (!isNaN(dLat) && !isNaN(dLng)) ? { lat: dLat, lng: dLng } : null

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Load settings and active order in parallel
  const [settingsRes, activeRes] = await Promise.all([
    admin.from('settings').select('key, value').in('key', [
      'stack_limit',
      'stack_pickup_radius_km',
      'stack_dropoff_radius_km',
      'stack_detour_pct',
    ]),
    admin.from('orders')
      .select(`
        id, delivery_address,
        food_maker:food_makers(display_name, lat, lng)
      `)
      .eq('nexter_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .limit(2),
  ])

  const settings: Record<string, string> = {}
  for (const row of settingsRes.data ?? []) settings[row.key] = row.value

  const stackLimit = parseInt(settings.stack_limit ?? '2', 10)
  const activeOrders = activeRes.data ?? []

  // Already at limit — no stacking possible
  if (activeOrders.length >= stackLimit) {
    return NextResponse.json({ candidates: [] })
  }

  // No active orders — no stacking needed (driver uses normal order list)
  if (activeOrders.length === 0) {
    return NextResponse.json({ candidates: [] })
  }

  type MakerShape = { display_name: string; lat: number; lng: number }
  type AddrShape  = { lat?: number; lng?: number; street?: string }

  const existing      = activeOrders[0]
  const exMaker       = (existing.food_maker as unknown) as MakerShape | null
  const exAddr        = existing.delivery_address as AddrShape | null

  if (!exMaker || exAddr?.lat == null || exAddr?.lng == null) {
    return NextResponse.json({ candidates: [] })
  }

  const existingStackable: StackableOrder = {
    id:      existing.id,
    pickup:  { lat: exMaker.lat, lng: exMaker.lng, label: exMaker.display_name },
    dropoff: { lat: exAddr.lat!, lng: exAddr.lng!, label: exAddr.street ?? 'Customer' },
  }

  const pickupRadius  = parseFloat(settings.stack_pickup_radius_km  ?? '3.0')
  const dropoffRadius = parseFloat(settings.stack_dropoff_radius_km ?? '4.0')
  const detourPct     = parseFloat(settings.stack_detour_pct        ?? '40')

  // Use existing pickup as driver position proxy if GPS not available
  const pos = driverPos ?? existingStackable.pickup

  // Load unassigned nearby orders (coarse filter: prepared/ready, no driver)
  const { data: rawCandidates, error: candError } = await admin
    .from('orders')
    .select(`
      id, subtotal, driver_payout, tip_amount, created_at,
      delivery_address,
      food_maker:food_makers(display_name, lat, lng)
    `)
    .in('status', ['preparing', 'ready'])
    .is('nexter_id', null)
    .order('created_at', { ascending: true })
    .limit(30)

  if (candError) {
    Sentry.captureException(candError, { extra: { context: 'stack-candidates-query' } })
    return NextResponse.json({ error: 'Failed to load candidates' }, { status: 500 })
  }

  const candidates: StackCandidate[] = []

  for (const row of rawCandidates ?? []) {
    const cMaker = (row.food_maker as unknown) as MakerShape | null
    const cAddr  = row.delivery_address as AddrShape | null

    if (!cMaker || cAddr?.lat == null || cAddr?.lng == null) continue
    if (row.id === existing.id) continue

    const candidateStackable: StackableOrder = {
      id:      row.id,
      pickup:  { lat: cMaker.lat, lng: cMaker.lng, label: cMaker.display_name },
      dropoff: { lat: cAddr.lat!, lng: cAddr.lng!, label: cAddr.street ?? 'Customer' },
    }

    const compat = scoreStackCompatibility(pos, existingStackable, candidateStackable, {
      pickupRadiusKm:  pickupRadius,
      dropoffRadiusKm: dropoffRadius,
      detourPct,
    })

    if (!compat) continue

    candidates.push({
      order_id:          row.id,
      maker_name:        cMaker.display_name,
      subtotal:          row.subtotal,
      driver_payout:     row.driver_payout,
      tip_amount:        row.tip_amount ?? 0,
      created_at:        row.created_at,
      score:             compat.score,
      detour_km:         compat.detourKm,
      total_distance_km: compat.totalDistanceKm,
      stops:             compat.stops,
    })
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  return NextResponse.json({ candidates })
}

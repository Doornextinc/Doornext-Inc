import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { StreamChat } from 'stream-chat'
import { cookies } from 'next/headers'
import { notifyUser } from '@doornext/shared/notify'
import { checkRateLimit } from '@/lib/rate-limit'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  // Rate limit: 20 accept attempts per IP per minute
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

  const { orderId } = await req.json()
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

  // Verify driver is approved — unverified drivers cannot accept orders
  const { data: driverStatus } = await admin
    .from('driver_profiles')
    .select('kyc_status')
    .eq('id', user.id)
    .single()
  if (driverStatus?.kyc_status !== 'approved') {
    return NextResponse.json({ error: 'Driver verification is not complete' }, { status: 403 })
  }

  // Generate a cryptographically secure 4-digit pickup confirmation PIN.
  // The driver will show this to the maker, who must enter it on their screen
  // to confirm the handoff. This PIN is mandatory — neither party can bypass it.
  const pickup_pin = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000))

  // Atomic accept: update only if still unassigned and in an acceptable status.
  // Drivers can accept orders that are either being prepared or already ready —
  // this lets them head over while the food is still cooking.
  // Use count instead of select().single() — after updating status to
  // 'driver_assigned' the row no longer matches the filter, so
  // select().single() always returns PGRST116 even on success.
  const { error, count } = await admin
    .from('orders')
    .update({
      nexter_id: user.id,
      status: 'driver_assigned',
      pickup_pin,
      pin_attempts: 0,
      updated_at: new Date().toISOString(),
    }, { count: 'exact' })
    .eq('id', orderId)
    .in('status', ['preparing', 'ready'])
    .is('nexter_id', null)

  if (error) {
    Sentry.captureException(new Error(`accept-order update error: ${error.message}`))
    console.error('accept-order update error:', error)
    return NextResponse.json(
      { error: 'Failed to accept order. Please try again.' },
      { status: 500 }
    )
  }

  if (count === 0) {
    return NextResponse.json(
      { error: 'Order is no longer available — another driver accepted it.' },
      { status: 409 }
    )
  }

  // All side-effects below are fire-and-forget — nothing must block the response.
  // The driver's app navigates to the active page as soon as this 200 lands.
  void (async () => {
    try {
      const shortId = orderId.slice(-6).toUpperCase()

      // Fetch order + all party profiles in parallel
      const [{ data: order }, { data: driverProfile }] = await Promise.all([
        admin
          .from('orders')
          .select('customer_id, maker_id')
          .eq('id', orderId)
          .single(),
        admin
          .from('users')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single(),
      ])

      const customerUserId: string | null = order?.customer_id ?? null
      let makerUserId: string | null = null

      if (customerUserId) {
        await notifyUser(admin, {
          userId: customerUserId,
          type: 'order_driver_assigned',
          title: 'Driver Assigned! 🛵',
          body: `A driver has accepted your order #${shortId} and is heading to the restaurant.`,
          data: { order_id: orderId },
        })
      }

      if (order?.maker_id) {
        const { data: makerProfile } = await admin
          .from('food_makers')
          .select('user_id')
          .eq('id', order.maker_id)
          .single()
        if (makerProfile?.user_id) {
          makerUserId = makerProfile.user_id
          notifyUser(admin, {
            userId: makerProfile.user_id,
            type: 'driver_heading_to_maker',
            title: '🛵 Driver is on the way!',
            body: `A driver has accepted order #${shortId} and is heading to your kitchen.`,
            data: { order_id: orderId },
          })
        }
      }

      // Stream Chat: create channel and add all three parties as members
      const streamApiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
      const streamSecret = process.env.STREAM_API_SECRET
      const isUnconfigured = (v?: string) =>
        !v || v.startsWith('your-') || v.includes('placeholder') || v.length < 8

      if (!isUnconfigured(streamApiKey) && !isUnconfigured(streamSecret)) {
        try {
          const stream = StreamChat.getInstance(streamApiKey!, streamSecret!)

          // Upsert all known members so Stream has their profiles
          const usersToUpsert = [
            { id: user.id, name: driverProfile?.full_name ?? 'Driver', image: driverProfile?.avatar_url ?? undefined, role: 'user' as const },
          ]
          if (customerUserId) {
            const { data: cp } = await admin.from('users').select('full_name, avatar_url').eq('id', customerUserId).single()
            usersToUpsert.push({ id: customerUserId, name: cp?.full_name ?? 'Customer', image: cp?.avatar_url ?? undefined, role: 'user' as const })
          }
          if (makerUserId) {
            const { data: mp } = await admin.from('users').select('full_name, avatar_url').eq('id', makerUserId).single()
            usersToUpsert.push({ id: makerUserId, name: mp?.full_name ?? 'Maker', image: mp?.avatar_url ?? undefined, role: 'user' as const })
          }

          await stream.upsertUsers(usersToUpsert)

          const memberIds = [user.id, ...(customerUserId ? [customerUserId] : []), ...(makerUserId ? [makerUserId] : [])]
          const channel = stream.channel('messaging', `order-${orderId}`, {
            members: memberIds,
            created_by_id: user.id,
          })
          await channel.create()
        } catch (e) {
          Sentry.captureException(e, { extra: { orderId, context: 'accept-order-stream' } })
        }
      }
    } catch (e) {
      Sentry.captureException(e, { extra: { orderId, context: 'accept-order-notifications' } })
    }
  })()

  // Reliability stat — fire-and-forget
  void (admin.rpc('increment_driver_accepted', { driver_id: user.id }) as unknown as Promise<unknown>).catch(() => {})

  return NextResponse.json({ success: true, orderId })
}

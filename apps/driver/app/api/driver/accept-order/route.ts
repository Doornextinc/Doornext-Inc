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

  // Generate a cryptographically secure 4-digit pickup confirmation PIN.
  // The driver will show this to the maker, who must enter it on their screen
  // to confirm the handoff. This PIN is mandatory — neither party can bypass it.
  const pickup_pin = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000))

  // Atomic accept: update only if still unassigned and ready.
  // Use count instead of select().single() — after updating status to
  // 'driver_assigned' the row no longer matches status='ready', so
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
    .eq('status', 'ready')
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

  // Fetch the accepted order for notification data
  const { data: order } = await admin
    .from('orders')
    .select('customer_id, maker_id')
    .eq('id', orderId)
    .single()

  const shortId = orderId.slice(-6).toUpperCase()

  if (order?.customer_id) {
    await notifyUser(admin, {
      userId: order.customer_id,
      type: 'order_driver_assigned',
      title: 'Driver Assigned! 🛵',
      body: `A driver has accepted your order #${shortId} and is heading to the restaurant.`,
      data: { order_id: orderId },
    })
  }

  // Notify the maker that a driver is on the way to pick up the order
  if (order?.maker_id) {
    const { data: makerProfile } = await admin
      .from('food_makers')
      .select('user_id')
      .eq('id', order.maker_id)
      .single()
    if (makerProfile?.user_id) {
      notifyUser(admin, {
        userId: makerProfile.user_id,
        type: 'driver_heading_to_maker',
        title: '🛵 Driver is on the way!',
        body: `A driver has accepted order #${shortId} and is heading to your kitchen.`,
        data: { order_id: orderId },
      })
    }
  }

  // ── Reliability tracking ──────────────────────────────────────────────────
  // Atomically increment total_accepted and recompute acceptance_rate.
  // Fire-and-forget — stat failure must never block the accept response.
  admin
    .rpc('increment_driver_accepted', { driver_id: user.id })
    .catch(() => {}) // non-fatal

  // Add driver to the order's Stream Chat channel so all three parties can communicate
  const streamApiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
  const streamSecret = process.env.STREAM_API_SECRET
  const isUnconfigured = (v?: string) =>
    !v || v.startsWith('your-') || v.includes('placeholder') || v.length < 8
  if (!isUnconfigured(streamApiKey) && !isUnconfigured(streamSecret)) {
    try {
      const stream = StreamChat.getInstance(streamApiKey!, streamSecret!)
      // Upsert driver so they exist in Stream
      await stream.upsertUser({ id: user.id, role: 'user' })
      // Create or get the order channel and add the driver as a member
      const channel = stream.channel('messaging', `order-${orderId}`)
      await channel.create()
      await channel.addMembers([user.id])
    } catch (e) {
      // Non-fatal — chat will still work once customer or maker creates the channel
      console.error('Stream channel member add failed:', e)
    }
  }

  return NextResponse.json({ success: true, orderId })
}

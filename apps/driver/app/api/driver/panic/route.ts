/**
 * Panic button endpoint.
 *
 * Driver taps the panic button during a delivery (accident, threat, emergency).
 * Actions taken immediately:
 *   1. Creates a P0 support ticket tagged 'emergency'
 *   2. Notifies all admins in the DB (users.role = 'admin')
 *   3. Returns immediately — driver does not wait for notifications to settle
 *
 * The order is NOT auto-reassigned here — ops/admin decide the next step
 * once they contact the driver and confirm the situation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { notifyUser } from '@doornext/shared/notify'
import { checkRateLimit } from '@/lib/rate-limit'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  // 3 panic triggers per 5 minutes per IP — prevents spam while allowing retries
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`panic:${ip}`, 3, 300)) {
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

  const body = await req.json().catch(() => ({}))
  const { orderId, lat, lng, note } = body as {
    orderId?: string
    lat?: number
    lng?: number
    note?: string
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const locationStr = lat && lng ? `Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Location: unknown'

  // 1. Create emergency support ticket
  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .insert({
      user_id:  user.id,
      order_id: orderId ?? null,
      subject:  '🚨 PANIC BUTTON — Driver Emergency',
      message:  [
        `Driver ${user.id} triggered the panic button.`,
        locationStr,
        orderId ? `Order: ${orderId}` : 'No active order.',
        note ? `Note: ${note}` : '',
      ].filter(Boolean).join('\n'),
      status:   'open',
      priority: 'urgent',
    })
    .select('id')
    .single()

  if (ticketError) {
    Sentry.captureException(new Error(`Panic ticket creation failed: ${ticketError.message}`), {
      extra: { userId: user.id, orderId },
    })
  }

  // 2. Notify all admins
  try {
    const { data: admins } = await admin
      .from('users')
      .select('id')
      .eq('role', 'admin')

    await Promise.allSettled(
      (admins ?? []).map((a) =>
        notifyUser(admin, {
          userId: a.id,
          type: 'driver_panic',
          title: '🚨 Driver Emergency',
          body: `Driver hit panic button. ${locationStr}. Order: ${orderId ?? 'N/A'}.`,
          data: {
            driver_id: user.id,
            order_id:  orderId ?? null,
            ticket_id: ticket?.id ?? null,
            lat:       lat ?? null,
            lng:       lng ?? null,
          },
        })
      )
    )
  } catch (err) {
    Sentry.captureException(err, { extra: { userId: user.id, context: 'panic-notify-admins' } })
  }

  // 3. Log to Sentry as a separate event for ops visibility
  Sentry.captureMessage('Driver panic button triggered', {
    level: 'fatal',
    extra: { userId: user.id, orderId, lat, lng, ticketId: ticket?.id },
  })

  return NextResponse.json({ success: true, ticketId: ticket?.id ?? null })
}

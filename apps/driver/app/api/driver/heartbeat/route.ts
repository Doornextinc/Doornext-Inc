import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import * as Sentry from '@sentry/nextjs'
import { requireDriver } from '@/lib/require-driver'

export async function POST(req: NextRequest) {
  // 120 pings per minute = 1 every 0.5 s — far more than any real driver sends.
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`heartbeat:${ip}`, 120, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const auth = await requireDriver(req)
  if (!auth.ok) return auth.response
  const { userId } = auth

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin
    .from('driver_profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    Sentry.captureException(error, { extra: { userId, context: 'heartbeat' } })
  }

  return NextResponse.json({ ok: true })
}

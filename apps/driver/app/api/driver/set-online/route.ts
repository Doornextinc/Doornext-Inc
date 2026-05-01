import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireDriver } from '@/lib/require-driver'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  // Rate limit: 30 toggles per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`set-online:${ip}`, 30, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const auth = await requireDriver(req)
  if (!auth.ok) return auth.response
  const { userId } = auth

  const { online } = await req.json()
  if (typeof online !== 'boolean') {
    return NextResponse.json({ error: 'online must be a boolean' }, { status: 400 })
  }

  try {
    const { error } = await admin
      .from('driver_profiles')
      .update({ is_active: online })
      .eq('id', userId)

    if (error) {
      Sentry.captureException(error, { extra: { userId, online } })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, is_active: online })
  } catch (err) {
    Sentry.captureException(err, { extra: { userId, online } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

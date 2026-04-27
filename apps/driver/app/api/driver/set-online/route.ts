import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 30 toggles per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`set-online:${ip}`, 30, 60)) {
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

  const { online } = await req.json()
  if (typeof online !== 'boolean') {
    return NextResponse.json({ error: 'online must be a boolean' }, { status: 400 })
  }

  try {
    const { error } = await supabase
      .from('driver_profiles')
      .update({ is_active: online })
      .eq('id', user.id)

    if (error) {
      Sentry.captureException(error, { extra: { userId: user.id, online } })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, is_active: online })
  } catch (err) {
    Sentry.captureException(err, { extra: { userId: user.id, online } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

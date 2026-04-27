import { NextRequest, NextResponse } from 'next/server'
import { StreamChat } from 'stream-chat'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 20 token requests per minute per IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`stream-token:${ip}`, 20, 60)) {
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

  // Enforce role: only makers may receive a Stream token from this app.
  const { data: profile } = await supabase
    .from('users')
    .select('full_name, avatar_url, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'maker') {
    return NextResponse.json({ error: 'Forbidden: maker account required' }, { status: 403 })
  }

  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
  const secret = process.env.STREAM_API_SECRET

  const isUnconfigured = (v?: string) =>
    !v || v.startsWith('your-') || v.includes('placeholder') || v.length < 8

  if (isUnconfigured(apiKey) || isUnconfigured(secret)) {
    return NextResponse.json({ error: 'Stream not configured' }, { status: 503 })
  }

  const serverClient = StreamChat.getInstance(apiKey!, secret!)

  await serverClient.upsertUser({
    id: user.id,
    name: profile.full_name ?? user.email ?? 'Maker',
    image: profile.avatar_url ?? undefined,
    role: 'user',
  })

  try {
    const token = serverClient.createToken(user.id, Math.floor(Date.now() / 1000) + 86400)
    return NextResponse.json({ token, userId: user.id })
  } catch (err) {
    Sentry.captureException(err, { extra: { userId: user.id } })
    return NextResponse.json({ error: 'Failed to generate chat token' }, { status: 500 })
  }
}

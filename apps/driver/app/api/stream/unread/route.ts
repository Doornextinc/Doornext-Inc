import { NextRequest, NextResponse } from 'next/server'
import { StreamChat } from 'stream-chat'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY
  const secret = process.env.STREAM_API_SECRET

  const isUnconfigured = (v?: string) =>
    !v || v.startsWith('your-') || v.includes('placeholder') || v.length < 8

  if (isUnconfigured(apiKey) || isUnconfigured(secret)) {
    return NextResponse.json({ total_unread_count: 0 })
  }

  try {
    const serverClient = StreamChat.getInstance(apiKey!, secret!)
    const { total_unread_count } = await serverClient.getUnreadCount(user.id)
    return NextResponse.json({ total_unread_count: total_unread_count ?? 0 })
  } catch {
    return NextResponse.json({ total_unread_count: 0 })
  }
}

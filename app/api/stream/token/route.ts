import { NextResponse } from 'next/server'
import { StreamChat } from 'stream-chat'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!
    const secret = process.env.STREAM_API_SECRET!

    if (!secret || secret.includes('placeholder')) {
      return NextResponse.json({ error: 'Stream not configured' }, { status: 500 })
    }

    const serverClient = StreamChat.getInstance(apiKey, secret)

    // Upsert the user in Stream so they exist
    const profile = await supabase
      .from('users')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single()

    await serverClient.upsertUser({
      id: user.id,
      name: profile.data?.full_name ?? user.email ?? 'Customer',
      image: profile.data?.avatar_url ?? undefined,
      role: 'user',
    })

    // Token valid for 24 hours
    const token = serverClient.createToken(user.id, Math.floor(Date.now() / 1000) + 86400)

    return NextResponse.json({ token, userId: user.id })
  } catch (error) {
    console.error('Stream token error:', error)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }
}

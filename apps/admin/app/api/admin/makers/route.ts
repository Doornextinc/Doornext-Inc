import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export async function GET() {
  const admin = createAdminClient()
  const { data: makers } = await admin
    .from('food_makers')
    .select('id, display_name, cuisine_tags, avg_rating, total_reviews, is_open, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ makers: makers ?? [] })
}

export async function PATCH(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { makerId, is_open } = await req.json()
  if (!makerId || is_open === undefined) {
    return NextResponse.json({ error: 'makerId and is_open required' }, { status: 400 })
  }

  const { error } = await admin.from('food_makers').update({ is_open }).eq('id', makerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

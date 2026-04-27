import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data: makers } = await supabase
    .from('food_makers')
    .select('id, display_name, cuisine_tags, avg_rating, total_reviews, is_open, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ makers: makers ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { makerId, is_open } = await req.json()
  if (!makerId || is_open === undefined) {
    return NextResponse.json({ error: 'makerId and is_open required' }, { status: 400 })
  }

  const { error } = await supabase.from('food_makers').update({ is_open }).eq('id', makerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

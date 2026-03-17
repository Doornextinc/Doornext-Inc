import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const body = await request.json()

  const allowed = [
    'name', 'description', 'geojson', 'lat_min', 'lat_max',
    'lng_min', 'lng_max', 'multiplier', 'reason', 'is_active',
    'starts_at', 'ends_at',
  ]
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  const { error } = await supabase.from('surge_zones').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const { error } = await supabase.from('surge_zones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

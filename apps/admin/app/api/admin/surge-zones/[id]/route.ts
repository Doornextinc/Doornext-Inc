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

  if (update.multiplier !== undefined) {
    const m = Number(update.multiplier)
    if (!isFinite(m) || m < 1.0 || m > 5.0) {
      return NextResponse.json({ error: 'multiplier must be between 1.0 and 5.0' }, { status: 400 })
    }
    update.multiplier = m
  }
  const latMin = update.lat_min as number | undefined
  const latMax = update.lat_max as number | undefined
  const lngMin = update.lng_min as number | undefined
  const lngMax = update.lng_max as number | undefined
  if (latMin !== undefined && (latMin < -90 || latMin > 90)) {
    return NextResponse.json({ error: 'lat_min must be between -90 and 90' }, { status: 400 })
  }
  if (latMax !== undefined && (latMax < -90 || latMax > 90)) {
    return NextResponse.json({ error: 'lat_max must be between -90 and 90' }, { status: 400 })
  }
  if (lngMin !== undefined && (lngMin < -180 || lngMin > 180)) {
    return NextResponse.json({ error: 'lng_min must be between -180 and 180' }, { status: 400 })
  }
  if (lngMax !== undefined && (lngMax < -180 || lngMax > 180)) {
    return NextResponse.json({ error: 'lng_max must be between -180 and 180' }, { status: 400 })
  }
  if (latMin !== undefined && latMax !== undefined && latMin >= latMax) {
    return NextResponse.json({ error: 'lat_min must be less than lat_max' }, { status: 400 })
  }
  if (lngMin !== undefined && lngMax !== undefined && lngMin >= lngMax) {
    return NextResponse.json({ error: 'lng_min must be less than lng_max' }, { status: 400 })
  }
  if (update.starts_at && update.ends_at && new Date(update.ends_at as string) <= new Date(update.starts_at as string)) {
    return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
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

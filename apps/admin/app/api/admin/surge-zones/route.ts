import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data, error } = await supabase
    .from('surge_zones')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ zones: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const body = await request.json()

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const multiplier = Number(body.multiplier ?? 1.5)
  if (!isFinite(multiplier) || multiplier < 1.0 || multiplier > 5.0) {
    return NextResponse.json({ error: 'multiplier must be between 1.0 and 5.0' }, { status: 400 })
  }
  // Validate geographic bounds if provided
  const { lat_min, lat_max, lng_min, lng_max } = body
  if (lat_min !== undefined || lat_max !== undefined || lng_min !== undefined || lng_max !== undefined) {
    if (typeof lat_min !== 'number' || lat_min < -90 || lat_min > 90) {
      return NextResponse.json({ error: 'lat_min must be between -90 and 90' }, { status: 400 })
    }
    if (typeof lat_max !== 'number' || lat_max < -90 || lat_max > 90) {
      return NextResponse.json({ error: 'lat_max must be between -90 and 90' }, { status: 400 })
    }
    if (typeof lng_min !== 'number' || lng_min < -180 || lng_min > 180) {
      return NextResponse.json({ error: 'lng_min must be between -180 and 180' }, { status: 400 })
    }
    if (typeof lng_max !== 'number' || lng_max < -180 || lng_max > 180) {
      return NextResponse.json({ error: 'lng_max must be between -180 and 180' }, { status: 400 })
    }
    if (lat_min >= lat_max) {
      return NextResponse.json({ error: 'lat_min must be less than lat_max' }, { status: 400 })
    }
    if (lng_min >= lng_max) {
      return NextResponse.json({ error: 'lng_min must be less than lng_max' }, { status: 400 })
    }
  }
  if (body.starts_at && body.ends_at && new Date(body.ends_at) <= new Date(body.starts_at)) {
    return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('surge_zones')
    .insert({
      name: body.name.trim(),
      description: body.description ?? null,
      geojson: body.geojson ?? {},
      lat_min: lat_min ?? 0,
      lat_max: lat_max ?? 0,
      lng_min: lng_min ?? 0,
      lng_max: lng_max ?? 0,
      multiplier,
      reason: body.reason ?? null,
      is_active: body.is_active ?? true,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ zone: data })
}

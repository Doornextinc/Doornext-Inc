import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('surge_zones')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ zones: data })
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('surge_zones')
    .insert({
      name: body.name,
      description: body.description ?? null,
      geojson: body.geojson ?? {},
      lat_min: body.lat_min ?? 0,
      lat_max: body.lat_max ?? 0,
      lng_min: body.lng_min ?? 0,
      lng_max: body.lng_max ?? 0,
      multiplier: body.multiplier ?? 1.5,
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

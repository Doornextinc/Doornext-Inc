import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { requireDriver } from '@/lib/require-driver'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOWED_VEHICLE_TYPES = ['car', 'motorbike', 'bicycle', 'foot']

export async function POST(req: NextRequest) {
  const auth = await requireDriver(req)
  if (!auth.ok) return auth.response
  const { userId } = auth

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { vehicle_type, vehicle_make, vehicle_year, vehicle_color, vehicle_plate } = body

  if (vehicle_type && !ALLOWED_VEHICLE_TYPES.includes(vehicle_type)) {
    return NextResponse.json({ error: 'Invalid vehicle_type' }, { status: 400 })
  }

  const update: Record<string, string | null> = {}
  if (vehicle_type !== undefined) update.vehicle_type = vehicle_type || null
  if (vehicle_make !== undefined) update.vehicle_make = vehicle_make || null
  if (vehicle_year !== undefined) update.vehicle_year = vehicle_year || null
  if (vehicle_color !== undefined) update.vehicle_color = vehicle_color || null
  if (vehicle_plate !== undefined) update.vehicle_plate = vehicle_plate || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin
    .from('driver_documents')
    .upsert(
      { driver_id: userId, ...update },
      { onConflict: 'driver_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

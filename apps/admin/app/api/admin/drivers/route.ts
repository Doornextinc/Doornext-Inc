import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export async function GET() {
  const admin = createAdminClient()
  const { data: drivers } = await admin
    .from('driver_profiles')
    .select('id, full_name, vehicle_type, is_active, total_deliveries, avg_rating, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ drivers: drivers ?? [] })
}

export async function PATCH(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { driverId, is_active } = await req.json()
  if (!driverId || is_active === undefined) {
    return NextResponse.json({ error: 'driverId and is_active required' }, { status: 400 })
  }

  const { error } = await admin.from('driver_profiles').update({ is_active }).eq('id', driverId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

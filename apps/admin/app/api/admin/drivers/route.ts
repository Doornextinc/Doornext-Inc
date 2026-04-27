import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data: drivers } = await supabase
    .from('driver_profiles')
    .select('id, full_name, vehicle_type, is_active, kyc_status, total_deliveries, avg_rating, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ drivers: drivers ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const body = await req.json()
  const { driverId, is_active, kyc_status } = body

  if (!driverId) {
    return NextResponse.json({ error: 'driverId required' }, { status: 400 })
  }

  // Handle KYC status update — upsert so it works even if no driver_profiles row exists yet
  if (kyc_status !== undefined) {
    const { error } = await supabase
      .from('driver_profiles')
      .upsert({ id: driverId, kyc_status }, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Handle active/inactive toggle
  if (is_active !== undefined) {
    const { error } = await supabase.from('driver_profiles').update({ is_active }).eq('id', driverId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}

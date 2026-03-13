import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const { fullName, email, password, vehicleType } = await req.json()

  if (!fullName || !email || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  // Create auth user (pre-confirmed so no email verify step)
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const userId = authData.user.id

  // Upsert public.users with driver role
  await adminClient.from('users').upsert(
    { id: userId, email, full_name: fullName, role: 'driver' },
    { onConflict: 'id' }
  )

  // Create driver profile
  await adminClient.from('driver_profiles').upsert(
    { id: userId, full_name: fullName, vehicle_type: vehicleType ?? 'car', is_active: true, total_deliveries: 0, avg_rating: 0 },
    { onConflict: 'id' }
  )

  return NextResponse.json({ ok: true })
}

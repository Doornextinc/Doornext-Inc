import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  // Rate limit: 5 signup attempts per IP per hour
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`driver-signup:${ip}`, 5, 3600)) {
    return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 })
  }

  const { fullName, email, password, phone, vehicleType } = await req.json()

  if (!fullName || !email || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  // Create auth user — email_confirm omitted so Supabase sends a verification email
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name: fullName },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const userId = authData.user.id

  // Upsert public.users with driver role — pending until KYC approved by admin
  const { error: usersError } = await adminClient.from('users').upsert(
    { id: userId, email, full_name: fullName, role: 'driver', account_status: 'pending' },
    { onConflict: 'id' }
  )

  if (usersError) {
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create user profile. Please try again.' }, { status: 500 })
  }

  // Create driver profile (kyc_status defaults to 'not_submitted' via migration)
  const { error: profileError } = await adminClient.from('driver_profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      phone: phone ?? null,
      vehicle_type: ['car', 'motorbike', 'bicycle', 'foot'].includes(vehicleType) ? vehicleType : 'car',
      is_active: false,
      total_deliveries: 0,
      avg_rating: 0,
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create driver profile. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, emailVerificationRequired: true })
}

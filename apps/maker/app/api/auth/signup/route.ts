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
  if (!await checkRateLimit(`maker-signup:${ip}`, 5, 3600)) {
    return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 })
  }

  const { fullName, email, password, displayName, cuisineTags, lat, lng } = await req.json()

  if (!fullName || !email || !password || !displayName) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (lat == null || lng == null) {
    return NextResponse.json({ error: 'Kitchen location is required.' }, { status: 400 })
  }
  if (typeof lat !== 'number' || typeof lng !== 'number' || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid kitchen location coordinates.' }, { status: 400 })
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

  // Upsert public.users with maker role
  const { error: usersError } = await adminClient.from('users').upsert(
    { id: userId, email, full_name: fullName, role: 'maker' },
    { onConflict: 'id' }
  )

  if (usersError) {
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create user profile. Please try again.' }, { status: 500 })
  }

  // Create food_maker record with kitchen location
  const { error: makerError } = await adminClient.from('food_makers').insert({
    user_id: userId,
    display_name: displayName,
    cuisine_tags: cuisineTags ?? [],
    lat,
    lng,
    is_open: false,
    avg_rating: 0,
    total_reviews: 0,
  })

  if (makerError) {
    // Rollback: delete auth user
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create maker profile. ' + makerError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, emailVerificationRequired: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const { fullName, email, password, displayName, cuisineTags, lat, lng } = await req.json()

  if (!fullName || !email || !password || !displayName) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (lat == null || lng == null) {
    return NextResponse.json({ error: 'Kitchen location is required.' }, { status: 400 })
  }

  // Create auth user (pre-confirmed)
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

  // Upsert public.users with maker role
  await adminClient.from('users').upsert(
    { id: userId, email, full_name: fullName, role: 'maker' },
    { onConflict: 'id' }
  )

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

  return NextResponse.json({ ok: true })
}

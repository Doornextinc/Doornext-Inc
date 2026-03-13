import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await req.json()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Increment total_deliveries on driver profile
  const { data: profile } = await admin
    .from('driver_profiles')
    .select('total_deliveries')
    .eq('id', user.id)
    .single()

  if (profile) {
    await admin
      .from('driver_profiles')
      .update({ total_deliveries: profile.total_deliveries + 1 })
      .eq('id', user.id)
  }

  return NextResponse.json({ success: true })
}

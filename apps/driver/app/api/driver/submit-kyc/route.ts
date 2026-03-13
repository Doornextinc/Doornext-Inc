import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminClient = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    fullName, dateOfBirth, ssnLast4, address,
    idType, frontPath, backPath, selfiePath,
  } = await req.json()

  if (!fullName || !dateOfBirth || !ssnLast4 || !address || !idType || !frontPath || !selfiePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Upsert driver_documents
  const { error: docError } = await adminClient
    .from('driver_documents')
    .upsert(
      {
        user_id: user.id,
        kyc_full_name: fullName,
        kyc_date_of_birth: dateOfBirth,
        kyc_ssn_last4: ssnLast4,
        kyc_address: address,
        id_type: idType,
        front_path: frontPath,
        back_path: backPath ?? null,
        selfie_path: selfiePath,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 })
  }

  // Update driver kyc_status to pending_review
  const { error: profileError } = await adminClient
    .from('driver_profiles')
    .update({ kyc_status: 'pending_review' })
    .eq('id', user.id)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

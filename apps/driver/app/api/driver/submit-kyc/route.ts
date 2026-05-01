import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { requireDriver } from '@/lib/require-driver'

const adminClient = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const auth = await requireDriver(req)
  if (!auth.ok) return auth.response
  const { userId } = auth

  const {
    fullName, dateOfBirth, ssnLast4, address,
    idType, frontPath, backPath, insurancePath, selfiePath,
    bgCheckConsent,
    // registrationPath omitted — migration 027 not applied yet
  } = await req.json()

  if (!fullName || !dateOfBirth || !ssnLast4 || !address || !idType || !frontPath || !selfiePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!bgCheckConsent) {
    return NextResponse.json({ error: 'Background check consent is required' }, { status: 400 })
  }

  if (!/^\d{4}$/.test(String(ssnLast4))) {
    return NextResponse.json({ error: 'ssnLast4 must be exactly 4 digits' }, { status: 400 })
  }

  // NOTE: registration_path is intentionally excluded from this payload.
  // Migration 027 adds the column but hasn't been applied to the database yet.
  // Once you run:
  //   ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS registration_path text;
  // re-add `registration_path: registrationPath ?? null` to the object below.
  const docPayload = {
    user_id: userId,
    kyc_full_name: fullName,
    kyc_date_of_birth: dateOfBirth,
    kyc_ssn_last4: ssnLast4,
    kyc_address: address,
    id_type: idType,
    front_path: frontPath,
    back_path: backPath ?? null,
    insurance_path: insurancePath ?? null,
    selfie_path: selfiePath,
    bg_check_consent: true,
    bg_check_consented_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
  }

  const { error: docError } = await adminClient
    .from('driver_documents')
    .upsert(docPayload, { onConflict: 'user_id' })

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })

  const { error: profileError } = await adminClient
    .from('driver_profiles')
    .update({ kyc_status: 'pending_review' })
    .eq('id', userId)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

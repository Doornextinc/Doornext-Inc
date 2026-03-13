import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()

  // Fetch driver_documents with correct column names from migration 005
  const { data: docs, error } = await supabase
    .from('driver_documents')
    .select(`
      id, user_id,
      kyc_full_name, kyc_date_of_birth, kyc_ssn_last4, kyc_address,
      id_type, front_path, back_path, selfie_path, insurance_path,
      bg_check_consent, submitted_at, reviewed_at, review_notes
    `)
    .order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!docs || docs.length === 0) {
    return NextResponse.json({ documents: [] })
  }

  // Fetch driver profiles by user_id (separate query — no direct FK between tables)
  const userIds = docs.map((d) => d.user_id)
  const { data: profiles } = await supabase
    .from('driver_profiles')
    .select('id, full_name, vehicle_type, kyc_status, phone')
    .in('id', userIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  // Generate signed URLs for private storage paths
  const withUrls = await Promise.all(
    docs.map(async (doc) => {
      const [frontUrl, backUrl, selfieUrl, insuranceUrl] = await Promise.all([
        doc.front_path
          ? supabase.storage.from('driver-documents').createSignedUrl(doc.front_path, 3600)
          : Promise.resolve({ data: null }),
        doc.back_path
          ? supabase.storage.from('driver-documents').createSignedUrl(doc.back_path, 3600)
          : Promise.resolve({ data: null }),
        doc.selfie_path
          ? supabase.storage.from('driver-documents').createSignedUrl(doc.selfie_path, 3600)
          : Promise.resolve({ data: null }),
        doc.insurance_path
          ? supabase.storage.from('driver-documents').createSignedUrl(doc.insurance_path, 3600)
          : Promise.resolve({ data: null }),
      ])

      const profile = profileMap[doc.user_id] ?? null

      return {
        id: doc.id,
        user_id: doc.user_id,
        kyc_full_name: doc.kyc_full_name,
        kyc_date_of_birth: doc.kyc_date_of_birth,
        kyc_ssn_last4: doc.kyc_ssn_last4,
        kyc_address: doc.kyc_address,
        id_type: doc.id_type,
        front_url: frontUrl.data?.signedUrl ?? null,
        back_url: backUrl.data?.signedUrl ?? null,
        selfie_url: selfieUrl.data?.signedUrl ?? null,
        insurance_url: insuranceUrl.data?.signedUrl ?? null,
        bg_check_consent: doc.bg_check_consent,
        submitted_at: doc.submitted_at,
        reviewed_at: doc.reviewed_at,
        review_notes: doc.review_notes,
        // Status lives on driver_profiles
        kyc_status: profile?.kyc_status ?? 'not_submitted',
        driver_profile: profile,
      }
    })
  )

  return NextResponse.json({ documents: withUrls })
}

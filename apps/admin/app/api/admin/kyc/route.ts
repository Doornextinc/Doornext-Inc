import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('driver_documents')
    .select(`
      id, driver_id, status, review_notes, submitted_at, reviewed_at,
      first_name, last_name, date_of_birth, phone, address,
      id_type, id_number,
      id_front_url, id_back_url, selfie_url,
      driver_profiles(full_name, vehicle_type, kyc_status)
    `)
    .order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data })
}

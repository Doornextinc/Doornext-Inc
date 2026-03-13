import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action, notes } = await request.json()
  const supabase = createAdminClient()

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const docStatus = action === 'approve' ? 'approved' : 'rejected'
  const kycStatus = action === 'approve' ? 'approved' : 'rejected'

  // Update the document record
  const { data: doc, error: docError } = await supabase
    .from('driver_documents')
    .update({
      status: docStatus,
      review_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('driver_id')
    .single()

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })

  // Update driver profile KYC status
  const { error: profileError } = await supabase
    .from('driver_profiles')
    .update({ kyc_status: kycStatus })
    .eq('id', doc.driver_id)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

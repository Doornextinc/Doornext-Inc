import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action, notes } = await request.json()
  const supabase = createAdminClient()

  const sessionClient = await createSessionClient()
  const { data: { user: adminUser } } = await sessionClient.auth.getUser()
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const kycStatus = action === 'approve' ? 'approved' : 'rejected'

  // Update document with review notes (no status column on driver_documents)
  const { data: doc, error: docError } = await supabase
    .from('driver_documents')
    .update({
      review_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('user_id')
    .single()

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })

  // Update driver profile KYC status via user_id
  const { error: profileError } = await supabase
    .from('driver_profiles')
    .update({ kyc_status: kycStatus })
    .eq('id', doc.user_id)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  if (adminUser) {
    await supabase.from('admin_audit_log').insert({
      admin_id: adminUser.id,
      action: `kyc_${action}`,
      target_type: 'driver',
      target_id: doc.user_id,
      payload: { document_id: id, notes: notes ?? null, kyc_status: kycStatus },
      ip_address: ip,
    })
  }

  return NextResponse.json({ success: true })
}

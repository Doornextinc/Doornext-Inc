import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { notifyUser } from '@doornext/shared/notify'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const { id } = await params
  const { action, notes } = await request.json()

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const kycStatus = action === 'approve' ? 'approved' : 'rejected'

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

  const { error: profileError } = await supabase
    .from('driver_profiles')
    .update({ kyc_status: kycStatus })
    .eq('id', doc.user_id)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: `kyc_${action}`,
    target_type: 'driver',
    target_id: doc.user_id,
    payload: { document_id: id, notes: notes ?? null, kyc_status: kycStatus },
    ip_address: ip,
  })

  // Notify the driver of the KYC decision
  notifyUser(supabase, {
    userId: doc.user_id,
    type: `kyc_${kycStatus}`,
    title: action === 'approve' ? '✅ KYC Approved' : '❌ KYC Rejected',
    body: action === 'approve'
      ? 'Your identity verification has been approved. You can now start accepting deliveries!'
      : `Your identity verification was not approved.${notes ? ` Reason: ${notes}` : ' Please contact support for details.'}`,
    data: { document_id: id },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

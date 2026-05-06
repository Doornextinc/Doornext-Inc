import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const { id: userId } = await params
  const { action, rejection_reason } = await request.json()

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('food_makers')
    .update({
      approval_status: action === 'approve' ? 'approved' : 'rejected',
      kyc_status: action === 'approve' ? 'approved' : 'rejected',
      rejection_reason: action === 'reject' ? (rejection_reason ?? null) : null,
      reviewed_at: now,
      reviewed_by: adminId,
    })
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: `maker_${action}`,
    target_type: 'maker',
    target_id: userId,
    payload: { rejection_reason: rejection_reason ?? null },
    ip_address: ip,
  })

  return NextResponse.json({ ok: true })
}

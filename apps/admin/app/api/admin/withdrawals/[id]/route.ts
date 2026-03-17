import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const { id } = await params
  const { status, payout_ref, notes } = await request.json()

  const allowed = ['approved', 'rejected', 'paid']
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Fetch current state for audit payload
  const { data: current } = await supabase
    .from('withdrawals')
    .select('status, amount, user_id, user_role')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('withdrawals')
    .update({
      status,
      payout_ref: payout_ref ?? null,
      notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'withdrawal_status_update',
    target_type: 'withdrawal',
    target_id: id,
    payload: {
      previous_status: current?.status ?? null,
      new_status: status,
      payout_ref: payout_ref ?? null,
      amount: current?.amount ?? null,
      user_id: current?.user_id ?? null,
      user_role: current?.user_role ?? null,
    },
    ip_address: ip,
  })

  return NextResponse.json({ success: true })
}

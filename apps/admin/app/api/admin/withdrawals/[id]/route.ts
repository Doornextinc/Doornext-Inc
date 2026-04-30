import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { notifyUser } from '@doornext/shared/notify'
import * as Sentry from '@sentry/nextjs'

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

  // Fetch current state for audit payload and notification
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
      reviewed_by: adminId,
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

  // Notify the driver/maker of the withdrawal decision
  if (current?.user_id && (status === 'approved' || status === 'rejected' || status === 'paid')) {
    const amountStr = current.amount ? `$${Number(current.amount).toFixed(2)}` : 'your payout'
    const notifMap: Record<string, { title: string; body: string }> = {
      approved: {
        title: '✅ Withdrawal Approved',
        body: `Your withdrawal request for ${amountStr} has been approved and is being processed.`,
      },
      rejected: {
        title: '❌ Withdrawal Declined',
        body: `Your withdrawal request for ${amountStr} was declined.${notes ? ` Reason: ${notes}` : ' Please contact support for details.'}`,
      },
      paid: {
        title: '💰 Payout Sent!',
        body: `Your payout of ${amountStr} has been sent.${payout_ref ? ` Reference: ${payout_ref}` : ''}`,
      },
    }
    const notif = notifMap[status]
    if (notif) {
      // Fire-and-forget — don't block the response on notification delivery
      notifyUser(supabase, {
        userId: current.user_id,
        type: `withdrawal_${status}`,
        ...notif,
        data: { withdrawal_id: id },
      }).catch((err) => Sentry.captureException(err, { extra: { withdrawalId: id, userId: current?.user_id, context: 'withdrawal-notify' } }))
    }
  }

  return NextResponse.json({ success: true })
}

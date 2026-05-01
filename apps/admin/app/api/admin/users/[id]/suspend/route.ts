import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const { error } = await supabase
    .from('users')
    .update({ account_status: 'suspended' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Revoke all active sessions — user can't renew tokens after current JWT expires
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${id}/sessions`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
    }
  ).catch(() => {})

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'user_suspend',
    target_type: 'user',
    target_id: id,
    payload: { reason: (body as { reason?: string }).reason ?? null },
    ip_address: ip,
  })

  return NextResponse.json({ success: true })
}

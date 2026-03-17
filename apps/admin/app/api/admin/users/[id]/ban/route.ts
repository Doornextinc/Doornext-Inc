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

  const { error } = await supabase
    .from('users')
    .update({ account_status: 'banned' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'user_ban',
    target_type: 'user',
    target_id: id,
    payload: {},
    ip_address: ip,
  })

  return NextResponse.json({ success: true })
}

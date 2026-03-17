import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const body = await req.formData()
  const key = body.get('key') as string
  let value = body.get('value') as string

  if (!key || value === null) {
    return NextResponse.redirect(new URL('/settings?error=missing', req.url))
  }

  // Parse value: boolean, number, or string
  let parsed: boolean | number | string = value
  if (value === 'true') parsed = true
  else if (value === 'false') parsed = false
  else if (!isNaN(Number(value))) parsed = Number(value)

  await supabase
    .from('settings')
    .upsert({ key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'settings_update',
    target_type: 'setting',
    target_id: key,
    payload: { key, value: parsed },
    ip_address: ip,
  })

  return NextResponse.redirect(new URL('/settings?saved=1', req.url))
}

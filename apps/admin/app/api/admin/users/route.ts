import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const search = req.nextUrl.searchParams.get('search') ?? ''
  const accountStatus = req.nextUrl.searchParams.get('account_status')

  let query = supabase
    .from('users')
    .select('id, full_name, email, phone, role, account_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  if (accountStatus) {
    query = query.eq('account_status', accountStatus)
  }

  const { data: users } = await query
  return NextResponse.json({ users: users ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { userId, role } = await req.json()
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })

  const validRoles = ['customer', 'maker', 'driver', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { error } = await supabase.from('users').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

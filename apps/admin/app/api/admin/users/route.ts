import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const search = req.nextUrl.searchParams.get('search') ?? ''

  let query = admin
    .from('users')
    .select('id, full_name, email, phone, role, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data: users } = await query
  return NextResponse.json({ users: users ?? [] })
}

export async function PATCH(req: NextRequest) {
  // Verify admin session
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role } = await req.json()
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })

  const validRoles = ['customer', 'maker', 'driver', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { error } = await admin.from('users').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

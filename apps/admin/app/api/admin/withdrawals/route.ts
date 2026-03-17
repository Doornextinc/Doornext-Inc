import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'pending'

  let query = supabase
    .from('withdrawals')
    .select(`
      id, user_id, user_role, amount, status, method,
      payout_ref, notes, reviewed_at, created_at,
      users(full_name, email)
    `)
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ withdrawals: data })
}

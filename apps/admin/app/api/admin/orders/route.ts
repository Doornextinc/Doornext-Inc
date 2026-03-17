import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  let query = supabase
    .from('orders')
    .select(`
      id, status, total, payment_method, created_at, nexter_id,
      food_maker:food_makers(display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    const term = search.trim()
    query = query.or(`id.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orders: data })
}

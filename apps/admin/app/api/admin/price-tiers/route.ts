import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data, error } = await supabase
    .from('price_tiers')
    .select('*')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tiers: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const body = await request.json()

  const { data, error } = await supabase
    .from('price_tiers')
    .insert({
      name: body.name,
      description: body.description ?? null,
      base_fee: body.base_fee,
      per_km_rate: body.per_km_rate ?? 0,
      min_order_amt: body.min_order_amt ?? 0,
      eta_min_mins: body.eta_min_mins ?? 20,
      eta_max_mins: body.eta_max_mins ?? 45,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 99,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tier: data })
}

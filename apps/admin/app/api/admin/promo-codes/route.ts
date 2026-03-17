import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data, error } = await supabase
    .from('promo_codes')
    .select('*, promo_code_usage(id)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ codes: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const body = await request.json()

  const { error, data } = await supabase
    .from('promo_codes')
    .insert({
      code: body.code?.toUpperCase(),
      description: body.description ?? null,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      min_order_amt: body.min_order_amt ?? 0,
      max_discount: body.max_discount ?? null,
      usage_limit: body.usage_limit ?? null,
      per_user_limit: body.per_user_limit ?? 1,
      starts_at: body.starts_at ?? new Date().toISOString(),
      expires_at: body.expires_at ?? null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ code: data })
}

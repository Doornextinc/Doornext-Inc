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

  // Validate required fields
  const code = body.code?.toString().trim().toUpperCase()
  if (!code || !/^[A-Z0-9_-]{2,32}$/.test(code)) {
    return NextResponse.json({ error: 'code must be 2–32 alphanumeric/dash/underscore characters' }, { status: 400 })
  }
  if (!['percent', 'fixed'].includes(body.discount_type)) {
    return NextResponse.json({ error: 'discount_type must be percent or fixed' }, { status: 400 })
  }
  const discountValue = Number(body.discount_value)
  if (!isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'discount_value must be a positive number' }, { status: 400 })
  }
  if (body.discount_type === 'percent' && discountValue > 100) {
    return NextResponse.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 })
  }
  if (body.discount_type === 'fixed' && discountValue > 500) {
    return NextResponse.json({ error: 'Fixed discount cannot exceed $500' }, { status: 400 })
  }
  const perUserLimit = body.per_user_limit ?? 1
  if (!Number.isInteger(perUserLimit) || perUserLimit < 1) {
    return NextResponse.json({ error: 'per_user_limit must be a positive integer' }, { status: 400 })
  }
  const usageLimit = body.usage_limit ?? null
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
    return NextResponse.json({ error: 'usage_limit must be a positive integer or null' }, { status: 400 })
  }
  const minOrderAmt = Number(body.min_order_amt ?? 0)
  if (!isFinite(minOrderAmt) || minOrderAmt < 0) {
    return NextResponse.json({ error: 'min_order_amt must be a non-negative number' }, { status: 400 })
  }
  if (body.starts_at && body.expires_at && new Date(body.expires_at) <= new Date(body.starts_at)) {
    return NextResponse.json({ error: 'expires_at must be after starts_at' }, { status: 400 })
  }

  const { error, data } = await supabase
    .from('promo_codes')
    .insert({
      code,
      description: body.description ?? null,
      discount_type: body.discount_type,
      discount_value: discountValue,
      min_order_amt: minOrderAmt,
      max_discount: body.max_discount != null ? Number(body.max_discount) : null,
      usage_limit: usageLimit,
      per_user_limit: perUserLimit,
      starts_at: body.starts_at ?? new Date().toISOString(),
      expires_at: body.expires_at ?? null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ code: data })
}

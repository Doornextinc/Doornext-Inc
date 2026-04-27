import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const body = await request.json()

  const allowed = [
    'description', 'discount_type', 'discount_value', 'min_order_amt',
    'max_discount', 'usage_limit', 'per_user_limit', 'starts_at',
    'expires_at', 'is_active',
  ]
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  // Validate bounds on any fields being changed
  if (update.discount_type !== undefined && !['percent', 'fixed'].includes(update.discount_type as string)) {
    return NextResponse.json({ error: 'discount_type must be percent or fixed' }, { status: 400 })
  }
  if (update.discount_value !== undefined) {
    const dv = Number(update.discount_value)
    if (!isFinite(dv) || dv <= 0) {
      return NextResponse.json({ error: 'discount_value must be a positive number' }, { status: 400 })
    }
    const dtype = (update.discount_type ?? body.discount_type) as string
    if (dtype === 'percent' && dv > 100) {
      return NextResponse.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 })
    }
    if (dtype === 'fixed' && dv > 500) {
      return NextResponse.json({ error: 'Fixed discount cannot exceed $500' }, { status: 400 })
    }
    update.discount_value = dv
  }
  if (update.per_user_limit !== undefined) {
    const v = Number(update.per_user_limit)
    if (!Number.isInteger(v) || v < 1) {
      return NextResponse.json({ error: 'per_user_limit must be a positive integer' }, { status: 400 })
    }
  }
  if (update.usage_limit !== undefined && update.usage_limit !== null) {
    const v = Number(update.usage_limit)
    if (!Number.isInteger(v) || v < 1) {
      return NextResponse.json({ error: 'usage_limit must be a positive integer or null' }, { status: 400 })
    }
  }
  if (update.min_order_amt !== undefined) {
    const v = Number(update.min_order_amt)
    if (!isFinite(v) || v < 0) {
      return NextResponse.json({ error: 'min_order_amt must be a non-negative number' }, { status: 400 })
    }
    update.min_order_amt = v
  }
  if (update.starts_at && update.expires_at && new Date(update.expires_at as string) <= new Date(update.starts_at as string)) {
    return NextResponse.json({ error: 'expires_at must be after starts_at' }, { status: 400 })
  }

  const { error } = await supabase.from('promo_codes').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const { error } = await supabase.from('promo_codes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

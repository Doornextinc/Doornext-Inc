import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const body = await req.json()

  // Allowlist — never allow overwriting system fields (is_preset, created_by)
  const ALLOWED = [
    'title', 'description', 'icon', 'mission_type', 'target_value',
    'reward_amount', 'period', 'is_active', 'starts_at', 'ends_at',
  ]
  const update: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Validate numeric bounds
  if (update.target_value !== undefined && (typeof update.target_value !== 'number' || (update.target_value as number) <= 0)) {
    return NextResponse.json({ error: 'target_value must be a positive number' }, { status: 400 })
  }
  if (update.reward_amount !== undefined && (typeof update.reward_amount !== 'number' || (update.reward_amount as number) < 0)) {
    return NextResponse.json({ error: 'reward_amount must be a non-negative number' }, { status: 400 })
  }
  // Validate time window
  if (update.starts_at && update.ends_at && new Date(update.ends_at as string) <= new Date(update.starts_at as string)) {
    return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
  }

  const { error } = await supabase.from('driver_missions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params

  const { error } = await supabase.from('driver_missions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { data, error } = await supabase
    .from('driver_missions')
    .select('*')
    .order('is_preset', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ missions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase, adminId } = auth

  const body = await req.json()

  // Validate required fields
  const { title, description, icon, mission_type, target_value, reward_amount, period, is_active, starts_at, ends_at } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  const VALID_TYPES = ['deliveries', 'ratings', 'hours', 'distance', 'custom']
  if (!VALID_TYPES.includes(mission_type)) {
    return NextResponse.json({ error: `mission_type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  const VALID_PERIODS = ['daily', 'weekly', 'monthly', 'one_time']
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: `period must be one of: ${VALID_PERIODS.join(', ')}` }, { status: 400 })
  }
  if (typeof target_value !== 'number' || target_value <= 0) {
    return NextResponse.json({ error: 'target_value must be a positive number' }, { status: 400 })
  }
  if (typeof reward_amount !== 'number' || reward_amount < 0) {
    return NextResponse.json({ error: 'reward_amount must be a non-negative number' }, { status: 400 })
  }
  if (starts_at && ends_at && new Date(ends_at) <= new Date(starts_at)) {
    return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('driver_missions')
    .insert({
      title: title.trim(),
      description: description ?? null,
      icon: icon ?? null,
      mission_type,
      target_value,
      reward_amount,
      period,
      is_active: is_active ?? true,
      starts_at: starts_at ?? null,
      ends_at: ends_at ?? null,
      created_by: adminId,
      is_preset: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mission: data })
}

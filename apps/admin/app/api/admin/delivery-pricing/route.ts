import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

async function verifyAdmin(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return null
  const { data: profile } = await session.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const [standardRes, priorityRes, smallOrderRes, surgeRes, settingsRes] = await Promise.all([
    admin.from('delivery_distance_tiers').select('*').order('sort_order'),
    admin.from('priority_delivery_tiers').select('*').order('sort_order'),
    admin.from('small_order_fees').select('*').order('sort_order'),
    admin.from('surge_conditions').select('*').order('id'),
    admin.from('settings').select('key, value').in('key', [
      'dynamic_base_pay', 'dynamic_per_mile', 'dynamic_per_min_wait',
      'use_dynamic_pricing', 'priority_driver_bonus', 'service_fee_pct',
    ]),
  ])

  const formula: Record<string, string> = {}
  for (const s of settingsRes.data ?? []) {
    formula[s.key] = s.value
  }

  return NextResponse.json({
    standardTiers:  standardRes.data  ?? [],
    priorityTiers:  priorityRes.data  ?? [],
    smallOrderFees: smallOrderRes.data ?? [],
    surgeConditions: surgeRes.data    ?? [],
    formula,
  })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { table, id, data } = body as {
    table: 'standard' | 'priority' | 'small_order' | 'surge' | 'formula'
    id?: number | string
    data: Record<string, unknown>
  }

  const admin = createAdminClient()

  if (table === 'formula') {
    // data is { key: value, ... }
    const upserts = Object.entries(data).map(([key, value]) => ({
      key,
      value: String(value),
    }))
    const { error } = await admin.from('settings').upsert(upserts, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const tableMap: Record<string, string> = {
    standard:    'delivery_distance_tiers',
    priority:    'priority_delivery_tiers',
    small_order: 'small_order_fees',
    surge:       'surge_conditions',
  }

  const tableName = tableMap[table]
  if (!tableName || !id) return NextResponse.json({ error: 'Invalid table or id' }, { status: 400 })

  const { error } = await admin.from(tableName).update(data).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

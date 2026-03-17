import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const [standardRes, priorityRes, smallOrderRes, surgeRes, settingsRes] = await Promise.all([
    supabase.from('delivery_distance_tiers').select('*').order('sort_order'),
    supabase.from('priority_delivery_tiers').select('*').order('sort_order'),
    supabase.from('small_order_fees').select('*').order('sort_order'),
    supabase.from('surge_conditions').select('*').order('id'),
    supabase.from('settings').select('key, value').in('key', [
      'dynamic_base_pay', 'dynamic_per_mile', 'dynamic_per_min_wait',
      'use_dynamic_pricing', 'priority_driver_bonus', 'service_fee_pct',
    ]),
  ])

  const formula: Record<string, string> = {}
  for (const s of settingsRes.data ?? []) {
    formula[s.key] = s.value
  }

  return NextResponse.json({
    standardTiers:   standardRes.data  ?? [],
    priorityTiers:   priorityRes.data  ?? [],
    smallOrderFees:  smallOrderRes.data ?? [],
    surgeConditions: surgeRes.data     ?? [],
    formula,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const body = await req.json()
  const { table, id, data } = body as {
    table: 'standard' | 'priority' | 'small_order' | 'surge' | 'formula'
    id?: number | string
    data: Record<string, unknown>
  }

  if (table === 'formula') {
    const upserts = Object.entries(data).map(([key, value]) => ({
      key,
      value: String(value),
    }))
    const { error } = await supabase.from('settings').upsert(upserts, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'delivery_pricing_formula_update',
      target_type: 'settings',
      target_id: 'formula',
      payload: data,
      ip_address: ip,
    })

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

  const { error } = await supabase.from(tableName).update(data).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'delivery_pricing_update',
    target_type: table,
    target_id: String(id),
    payload: data,
    ip_address: ip,
  })

  return NextResponse.json({ ok: true })
}

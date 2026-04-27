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
    // Validate formula settings bounds
    const FORMULA_BOUNDS: Record<string, [number, number]> = {
      dynamic_base_pay:      [0, 50],
      dynamic_per_mile:      [0, 10],
      dynamic_per_min_wait:  [0, 5],
      priority_driver_bonus: [0, 20],
      service_fee_pct:       [0, 50],
    }
    for (const [key, value] of Object.entries(data)) {
      const bounds = FORMULA_BOUNDS[key]
      if (bounds) {
        const n = Number(value)
        if (!isFinite(n) || n < bounds[0] || n > bounds[1]) {
          return NextResponse.json(
            { error: `${key} must be between ${bounds[0]} and ${bounds[1]}` },
            { status: 400 }
          )
        }
      }
    }
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

  // Validate tier/fee row values
  const numericFields: Record<string, [number, number]> = {
    customer_fee:          [0, 200],
    driver_base_pay:       [0, 200],
    driver_priority_bonus: [0, 50],
    extra_fee:             [0, 100],
    driver_share_pct:      [0, 100],
    fee:                   [0, 50],
    distance_min:          [0, 500],
    distance_max:          [0, 500],
    order_value_min:       [0, 10000],
    order_value_max:       [0, 10000],
  }
  for (const [key, value] of Object.entries(data)) {
    const bounds = numericFields[key]
    if (bounds && value !== null) {
      const n = Number(value)
      if (!isFinite(n) || n < bounds[0] || n > bounds[1]) {
        return NextResponse.json(
          { error: `${key} must be between ${bounds[0]} and ${bounds[1]}` },
          { status: 400 }
        )
      }
    }
  }
  // Reject inverted distance ranges
  if (data.distance_min !== undefined && data.distance_max !== undefined &&
      data.distance_max !== null &&
      Number(data.distance_min) >= Number(data.distance_max)) {
    return NextResponse.json({ error: 'distance_min must be less than distance_max' }, { status: 400 })
  }

  // Only allow known safe columns — never let arbitrary keys through to the DB
  const ALLOWED_TIER_COLS = new Set([
    'label', 'is_active', 'sort_order', 'customer_fee', 'driver_base_pay',
    'driver_priority_bonus', 'distance_min', 'distance_max',
    'order_value_min', 'order_value_max', 'fee',
    'extra_fee', 'driver_share_pct', 'condition_type',
  ])
  const safeData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_TIER_COLS.has(key)) safeData[key] = value
  }
  if (Object.keys(safeData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase.from(tableName).update(safeData).eq('id', id)
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

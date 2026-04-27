import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

// Allowlist of keys that admins are permitted to update via the settings UI.
// Any key not listed here will be rejected with a 400 — this prevents accidental
// or malicious writes to arbitrary DB columns via the settings endpoint.
const ALLOWED_SETTINGS_KEYS = new Set([
  'platform_commission_pct',
  'maker_payout_delay_days',
  'service_fee_pct',
  'dynamic_base_pay',
  'dynamic_per_mile',
  'dynamic_per_min_wait',
  'use_dynamic_pricing',
  'priority_driver_bonus',
  'surge_multiplier_max',
  'surge_active',
  'small_order_threshold',
  'small_order_fee',
  'min_driver_payout',
  'max_delivery_distance_miles',
  'require_delivery_proof',
  'stale_driver_grace_seconds',
])

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const body = await req.formData()
  const key = body.get('key') as string
  let value = body.get('value') as string

  if (!key || value === null) {
    return NextResponse.redirect(new URL('/settings?error=missing', req.url))
  }

  // Reject unknown keys to prevent writes to arbitrary settings
  if (!ALLOWED_SETTINGS_KEYS.has(key)) {
    return NextResponse.redirect(new URL(`/settings?error=unknown_key`, req.url))
  }

  // Parse value: boolean, number, or string
  let parsed: boolean | number | string = value
  if (value === 'true') parsed = true
  else if (value === 'false') parsed = false
  else if (value.trim() !== '' && !isNaN(Number(value))) parsed = Number(value)

  // Bounds enforcement for numeric settings — prevents absurd values like
  // platform_commission_pct: 10000 or service_fee_pct: -50
  const NUMERIC_BOUNDS: Record<string, [number, number]> = {
    platform_commission_pct:     [0, 50],
    maker_payout_delay_days:     [0, 90],
    service_fee_pct:             [0, 50],
    dynamic_base_pay:            [0, 50],
    dynamic_per_mile:            [0, 10],
    dynamic_per_min_wait:        [0, 5],
    priority_driver_bonus:       [0, 20],
    surge_multiplier_max:        [1, 5],
    small_order_threshold:       [0, 100],
    small_order_fee:             [0, 20],
    min_driver_payout:           [0, 50],
    max_delivery_distance_miles: [1, 200],
    stale_driver_grace_seconds:  [10, 3600],
  }
  const bounds = NUMERIC_BOUNDS[key]
  if (bounds) {
    const n = typeof parsed === 'number' ? parsed : Number(parsed)
    if (!isFinite(n) || n < bounds[0] || n > bounds[1]) {
      return NextResponse.redirect(new URL(`/settings?error=out_of_range&key=${key}`, req.url))
    }
    parsed = n
  }

  await supabase
    .from('settings')
    .upsert({ key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'settings_update',
    target_type: 'setting',
    target_id: key,
    payload: { key, value: parsed },
    ip_address: ip,
  })

  return NextResponse.redirect(new URL('/settings?saved=1', req.url))
}

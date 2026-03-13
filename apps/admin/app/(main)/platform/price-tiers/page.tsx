'use client'

import { useEffect, useState, useCallback } from 'react'
import { Save, RefreshCw, Zap, AlertTriangle, Calculator } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DistanceTier {
  id: number
  distance_min: number
  distance_max: number | null
  customer_fee: number
  driver_base_pay: number
  label: string
  is_active: boolean
  sort_order: number
}

interface PriorityTier {
  id: number
  distance_min: number
  distance_max: number | null
  customer_fee: number
  driver_priority_bonus: number
  label: string
  is_active: boolean
  sort_order: number
}

interface SmallOrderFee {
  id: number
  order_value_min: number
  order_value_max: number | null
  fee: number
  label: string
  is_active: boolean
  sort_order: number
}

interface SurgeCondition {
  id: number
  condition_type: string
  label: string
  description: string | null
  extra_fee: number
  driver_share_pct: number
  is_active: boolean
}

interface FormulaSettings {
  dynamic_base_pay: string
  dynamic_per_mile: string
  dynamic_per_min_wait: string
  use_dynamic_pricing: string
  priority_driver_bonus: string
  service_fee_pct: string
}

type Tab = 'standard' | 'priority' | 'small_order' | 'surge' | 'formula' | 'calculator'

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({ label, value, onChange, type = 'number', prefix = '$', note }: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; prefix?: string; note?: string
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-40 flex-shrink-0">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <div className="relative flex-1 max-w-xs">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>
        )}
        <input
          type={type}
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 ${prefix ? 'pl-7' : ''}`}
        />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PriceTiersPage() {
  const [tab, setTab] = useState<Tab>('standard')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [standardTiers,  setStandardTiers]  = useState<DistanceTier[]>([])
  const [priorityTiers,  setPriorityTiers]  = useState<PriorityTier[]>([])
  const [smallOrderFees, setSmallOrderFees] = useState<SmallOrderFee[]>([])
  const [surgeConditions, setSurgeConditions] = useState<SurgeCondition[]>([])
  const [formula, setFormula] = useState<FormulaSettings>({
    dynamic_base_pay: '2.50',
    dynamic_per_mile: '0.80',
    dynamic_per_min_wait: '0.30',
    use_dynamic_pricing: 'false',
    priority_driver_bonus: '2.50',
    service_fee_pct: '9',
  })

  // Calculator state
  const [calcDistance, setCalcDistance]     = useState('3')
  const [calcSubtotal, setCalcSubtotal]     = useState('25')
  const [calcTip,      setCalcTip]          = useState('3')
  const [calcPriority, setCalcPriority]     = useState(false)
  const [calcWaitMins, setCalcWaitMins]     = useState('0')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/delivery-pricing')
    if (res.ok) {
      const d = await res.json()
      setStandardTiers(d.standardTiers ?? [])
      setPriorityTiers(d.priorityTiers ?? [])
      setSmallOrderFees(d.smallOrderFees ?? [])
      setSurgeConditions(d.surgeConditions ?? [])
      if (d.formula) setFormula(prev => ({ ...prev, ...d.formula }))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Save helpers ─────────────────────────────────────────────────────────

  async function patchRow(table: string, id: number, data: Record<string, unknown>) {
    setSaving(`${table}-${id}`)
    await fetch('/api/admin/delivery-pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id, data }),
    })
    setSaving(null)
    load()
  }

  async function saveFormula() {
    setSaving('formula')
    await fetch('/api/admin/delivery-pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'formula', data: formula }),
    })
    setSaving(null)
  }

  // ─── Live calculator ──────────────────────────────────────────────────────

  function calcResult() {
    const dist    = parseFloat(calcDistance) || 0
    const sub     = parseFloat(calcSubtotal) || 0
    const tip     = parseFloat(calcTip)      || 0
    const wait    = parseFloat(calcWaitMins) || 0
    const isDyn   = formula.use_dynamic_pricing === 'true'
    const svcPct  = parseFloat(formula.service_fee_pct) || 9

    const activeSurge = surgeConditions.filter(s => s.is_active)

    // Delivery fee
    let deliveryFee = 3.99
    let driverBase  = 3.00
    let tierLabel   = 'Standard'

    if (calcPriority && priorityTiers.length > 0) {
      const pt = priorityTiers.find(t => dist >= t.distance_min && (t.distance_max === null || dist < t.distance_max))
        ?? priorityTiers[priorityTiers.length - 1]
      if (pt) { deliveryFee = pt.customer_fee; tierLabel = `Priority: ${pt.label}` }
    } else if (standardTiers.length > 0) {
      const t = standardTiers.find(st => dist >= st.distance_min && (st.distance_max === null || dist < st.distance_max))
        ?? standardTiers[standardTiers.length - 1]
      if (t) { deliveryFee = t.customer_fee; driverBase = t.driver_base_pay; tierLabel = t.label }
    }

    if (isDyn) {
      driverBase = parseFloat(formula.dynamic_base_pay) + dist * parseFloat(formula.dynamic_per_mile) + wait * parseFloat(formula.dynamic_per_min_wait)
    }

    const priorityBonus = calcPriority
      ? (priorityTiers.find(t => dist >= t.distance_min && (t.distance_max === null || dist < t.distance_max))?.driver_priority_bonus ?? 0)
      : 0

    const smallFee = smallOrderFees.find(f => sub >= f.order_value_min && (f.order_value_max === null || sub < f.order_value_max))?.fee ?? 0

    let surgeFee = 0
    let driverSurge = 0
    for (const sc of activeSurge) {
      surgeFee    += sc.extra_fee
      driverSurge += sc.extra_fee * (sc.driver_share_pct / 100)
    }

    const serviceFee = sub * (svcPct / 100)
    const customerTotal = sub + deliveryFee + smallFee + surgeFee + serviceFee + tip
    const driverTotal   = driverBase + priorityBonus + driverSurge + tip
    const platformKeeps = serviceFee + (deliveryFee - driverBase - priorityBonus) + (surgeFee - driverSurge) + smallFee

    return {
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      smallFee:    Math.round(smallFee * 100) / 100,
      surgeFee:    Math.round(surgeFee * 100) / 100,
      serviceFee:  Math.round(serviceFee * 100) / 100,
      tip:         Math.round(tip * 100) / 100,
      customerTotal: Math.round(customerTotal * 100) / 100,
      driverBase:  Math.round(driverBase * 100) / 100,
      priorityBonus: Math.round(priorityBonus * 100) / 100,
      driverSurge: Math.round(driverSurge * 100) / 100,
      driverTotal: Math.round(driverTotal * 100) / 100,
      platformKeeps: Math.round(platformKeeps * 100) / 100,
      tierLabel,
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string }[] = [
    { id: 'standard',    label: 'Standard Tiers' },
    { id: 'priority',    label: 'Priority Tiers' },
    { id: 'small_order', label: 'Small Order Fees' },
    { id: 'surge',       label: 'Surge Conditions' },
    { id: 'formula',     label: 'Formula Settings' },
    { id: 'calculator',  label: 'Live Calculator' },
  ]

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  const calc = tab === 'calculator' ? calcResult() : null

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Delivery Pricing</h1>
        <p className="text-gray-400 text-sm mt-1">Configure all delivery fees, driver pay, surge conditions, and formula settings</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Standard Tiers ── */}
      {tab === 'standard' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Distance-based delivery fee charged to customer and base pay for driver.</p>
          {standardTiers.map(tier => (
            <StandardTierRow
              key={tier.id}
              tier={tier}
              saving={saving === `standard-${tier.id}`}
              onSave={(data) => patchRow('standard', tier.id, data)}
            />
          ))}
        </div>
      )}

      {/* ── Priority Tiers ── */}
      {tab === 'priority' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Priority delivery tiers. Customer pays a higher fee; driver earns a bonus on top of standard base pay.</p>
          {priorityTiers.map(tier => (
            <PriorityTierRow
              key={tier.id}
              tier={tier}
              saving={saving === `priority-${tier.id}`}
              onSave={(data) => patchRow('priority', tier.id, data)}
            />
          ))}
        </div>
      )}

      {/* ── Small Order Fees ── */}
      {tab === 'small_order' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Extra fee added to small orders to cover operational costs. Platform keeps this fee.</p>
          {smallOrderFees.map(fee => (
            <SmallOrderFeeRow
              key={fee.id}
              fee={fee}
              saving={saving === `small_order-${fee.id}`}
              onSave={(data) => patchRow('small_order', fee.id, data)}
            />
          ))}
        </div>
      )}

      {/* ── Surge Conditions ── */}
      {tab === 'surge' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>Activating surge conditions immediately affects all new orders. Driver gets the specified share percentage.</span>
          </div>
          {surgeConditions.map(sc => (
            <SurgeConditionRow
              key={sc.id}
              sc={sc}
              saving={saving === `surge-${sc.id}`}
              onSave={(data) => patchRow('surge', sc.id, data)}
            />
          ))}
        </div>
      )}

      {/* ── Formula Settings ── */}
      {tab === 'formula' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h3 className="font-bold text-gray-900 mb-1">Dynamic Driver Pay Formula</h3>
            <p className="text-sm text-gray-500 mb-4">
              When dynamic pricing is enabled, driver base pay = base + (miles × per_mile) + (wait_mins × per_min_wait).
              The delivery fee charged to the customer still comes from the distance tier.
            </p>
            <div className="space-y-3">
              <FieldRow
                label="Base Pay"
                value={formula.dynamic_base_pay}
                onChange={v => setFormula(f => ({ ...f, dynamic_base_pay: v }))}
                note="Flat base for every delivery"
              />
              <FieldRow
                label="Per Mile Rate"
                value={formula.dynamic_per_mile}
                onChange={v => setFormula(f => ({ ...f, dynamic_per_mile: v }))}
                note="Added per mile driven"
              />
              <FieldRow
                label="Per Wait Minute"
                value={formula.dynamic_per_min_wait}
                onChange={v => setFormula(f => ({ ...f, dynamic_per_min_wait: v }))}
                note="Added per minute of wait time"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5 space-y-3">
            <h3 className="font-bold text-gray-900 mb-1">Platform & Priority</h3>
            <FieldRow
              label="Service Fee %"
              value={formula.service_fee_pct}
              onChange={v => setFormula(f => ({ ...f, service_fee_pct: v }))}
              prefix="%"
              note="Charged on food subtotal"
            />
            <FieldRow
              label="Priority Driver Bonus"
              value={formula.priority_driver_bonus}
              onChange={v => setFormula(f => ({ ...f, priority_driver_bonus: v }))}
              note="Extra pay when driver priority mode is on"
            />
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h3 className="font-bold text-gray-900 mb-3">Dynamic Pricing Toggle</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={formula.use_dynamic_pricing === 'true'}
                  onChange={e => setFormula(f => ({ ...f, use_dynamic_pricing: e.target.checked ? 'true' : 'false' }))}
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${formula.use_dynamic_pricing === 'true' ? 'bg-blue-500' : 'bg-gray-200'}`} />
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formula.use_dynamic_pricing === 'true' ? 'translate-x-5' : ''}`} />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Use Dynamic Pricing</p>
                <p className="text-xs text-gray-500">Override driver base pay with formula; customer fee still comes from tiers</p>
              </div>
            </label>
          </div>

          <button
            onClick={saveFormula}
            disabled={saving === 'formula'}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving === 'formula' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving === 'formula' ? 'Saving…' : 'Save Formula Settings'}
          </button>
        </div>
      )}

      {/* ── Live Calculator ── */}
      {tab === 'calculator' && calc && (
        <div className="grid grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Calculator size={18} className="text-blue-500" />
              <h3 className="font-bold text-gray-900">Order Parameters</h3>
            </div>
            <FieldRow label="Distance (miles)" value={calcDistance} onChange={setCalcDistance} prefix="" />
            <FieldRow label="Food Subtotal" value={calcSubtotal} onChange={setCalcSubtotal} />
            <FieldRow label="Tip" value={calcTip} onChange={setCalcTip} />
            <FieldRow label="Wait (minutes)" value={calcWaitMins} onChange={setCalcWaitMins} prefix="" />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={calcPriority} onChange={e => setCalcPriority(e.target.checked)} />
              Priority delivery
            </label>
            <p className="text-xs text-gray-400 pt-1">Tier matched: <span className="font-semibold text-gray-700">{calc.tierLabel}</span></p>
          </div>

          {/* Results */}
          <div className="space-y-4">
            {/* Customer */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Customer Pays (on top of food)</p>
              <div className="space-y-2">
                {[
                  { label: 'Delivery fee',  value: calc.deliveryFee },
                  ...(calc.smallFee   > 0 ? [{ label: 'Small order fee', value: calc.smallFee }]   : []),
                  ...(calc.surgeFee   > 0 ? [{ label: 'Surge fee',       value: calc.surgeFee }]   : []),
                  { label: `Service fee (${formula.service_fee_pct}%)`, value: calc.serviceFee },
                  ...(calc.tip        > 0 ? [{ label: 'Tip',             value: calc.tip }]        : []),
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{row.label}</span>
                    <span className="font-semibold">${row.value.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-black text-gray-900">
                  <span>Total (excl. food)</span>
                  <span>${(calc.customerTotal - parseFloat(calcSubtotal)).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Driver */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Driver Earns</p>
              <div className="space-y-2">
                {[
                  { label: formula.use_dynamic_pricing === 'true' ? 'Dynamic base pay' : 'Base pay', value: calc.driverBase },
                  ...(calc.priorityBonus > 0 ? [{ label: 'Priority bonus', value: calc.priorityBonus }] : []),
                  ...(calc.driverSurge   > 0 ? [{ label: 'Surge share',    value: calc.driverSurge }]   : []),
                  ...(calc.tip           > 0 ? [{ label: 'Tip (100%)',      value: calc.tip }]           : []),
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{row.label}</span>
                    <span className="font-semibold text-green-700">${row.value.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-black text-green-700">
                  <span>Driver Total</span>
                  <span>${calc.driverTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Platform */}
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-blue-800">Platform Keeps</p>
                <p className="text-2xl font-black text-blue-700">${calc.platformKeeps.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Row components ────────────────────────────────────────────────────────────

function StandardTierRow({ tier, saving, onSave }: {
  tier: DistanceTier
  saving: boolean
  onSave: (data: Partial<DistanceTier>) => void
}) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState(tier)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {edit ? (
        <div>
          <p className="font-bold text-gray-900 mb-3">{tier.label}</p>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {([
              { key: 'customer_fee',    label: 'Customer Fee ($)' },
              { key: 'driver_base_pay', label: 'Driver Base Pay ($)' },
              { key: 'distance_min',    label: 'Min Miles' },
              { key: 'distance_max',    label: 'Max Miles (blank=∞)' },
            ] as { key: keyof DistanceTier; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  type="number" step="0.01"
                  value={d[key] ?? ''}
                  onChange={e => setD(prev => ({ ...prev, [key]: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={d.is_active} onChange={e => setD(p => ({ ...p, is_active: e.target.checked }))} />
              Active
            </label>
            <button
              disabled={saving}
              onClick={() => { onSave({ customer_fee: d.customer_fee, driver_base_pay: d.driver_base_pay, distance_min: d.distance_min, distance_max: d.distance_max, is_active: d.is_active }); setEdit(false) }}
              className="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEdit(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="font-bold text-gray-900">{tier.label}</p>
              <p className="text-xs text-gray-400">{tier.distance_min}–{tier.distance_max ?? '∞'} miles</p>
            </div>
            <div className="flex gap-5 text-sm">
              <div><span className="text-gray-400 text-xs">Customer fee</span><p className="font-black text-gray-900">${tier.customer_fee.toFixed(2)}</p></div>
              <div><span className="text-gray-400 text-xs">Driver base pay</span><p className="font-black text-green-700">${tier.driver_base_pay.toFixed(2)}</p></div>
              <div><span className="text-gray-400 text-xs">Platform margin</span><p className="font-black text-blue-700">${(tier.customer_fee - tier.driver_base_pay).toFixed(2)}</p></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {tier.is_active ? 'Active' : 'Off'}
            </span>
            <button onClick={() => setEdit(true)} className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Edit</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PriorityTierRow({ tier, saving, onSave }: {
  tier: PriorityTier; saving: boolean; onSave: (d: Partial<PriorityTier>) => void
}) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState(tier)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {edit ? (
        <div>
          <p className="font-bold text-gray-900 mb-3">{tier.label}</p>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {([
              { key: 'customer_fee',          label: 'Customer Fee ($)' },
              { key: 'driver_priority_bonus',  label: 'Driver Bonus ($)' },
              { key: 'distance_min',           label: 'Min Miles' },
              { key: 'distance_max',           label: 'Max Miles (blank=∞)' },
            ] as { key: keyof PriorityTier; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  type="number" step="0.01"
                  value={d[key] ?? ''}
                  onChange={e => setD(prev => ({ ...prev, [key]: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={d.is_active} onChange={e => setD(p => ({ ...p, is_active: e.target.checked }))} />
              Active
            </label>
            <button
              disabled={saving}
              onClick={() => { onSave({ customer_fee: d.customer_fee, driver_priority_bonus: d.driver_priority_bonus, distance_min: d.distance_min, distance_max: d.distance_max, is_active: d.is_active }); setEdit(false) }}
              className="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEdit(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="font-bold text-gray-900">{tier.label}</p>
              <p className="text-xs text-gray-400">{tier.distance_min}–{tier.distance_max ?? '∞'} miles</p>
            </div>
            <div className="flex gap-5 text-sm">
              <div><span className="text-gray-400 text-xs">Customer fee</span><p className="font-black text-gray-900">${tier.customer_fee.toFixed(2)}</p></div>
              <div><span className="text-gray-400 text-xs">Driver bonus</span><p className="font-black text-green-700">+${tier.driver_priority_bonus.toFixed(2)}</p></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {tier.is_active ? 'Active' : 'Off'}
            </span>
            <button onClick={() => setEdit(true)} className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Edit</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SmallOrderFeeRow({ fee, saving, onSave }: {
  fee: SmallOrderFee; saving: boolean; onSave: (d: Partial<SmallOrderFee>) => void
}) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState(fee)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {edit ? (
        <div>
          <p className="font-bold text-gray-900 mb-3">{fee.label}</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {([
              { key: 'fee',             label: 'Fee ($)' },
              { key: 'order_value_min', label: 'Order Min ($)' },
              { key: 'order_value_max', label: 'Order Max ($, blank=∞)' },
            ] as { key: keyof SmallOrderFee; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                <input
                  type="number" step="0.01"
                  value={d[key] ?? ''}
                  onChange={e => setD(prev => ({ ...prev, [key]: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={saving}
              onClick={() => { onSave({ fee: d.fee, order_value_min: d.order_value_min, order_value_max: d.order_value_max }); setEdit(false) }}
              className="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEdit(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">{fee.label}</p>
            <p className="text-xs text-gray-400">Orders ${fee.order_value_min}–${fee.order_value_max ?? '∞'}</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="font-black text-gray-900">{fee.fee > 0 ? `+$${fee.fee.toFixed(2)}` : 'No fee'}</p>
            <button onClick={() => setEdit(true)} className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Edit</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SurgeConditionRow({ sc, saving, onSave }: {
  sc: SurgeCondition; saving: boolean; onSave: (d: Partial<SurgeCondition>) => void
}) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState(sc)

  const toggleActive = () => onSave({ is_active: !sc.is_active })

  return (
    <div className={`rounded-2xl border shadow-sm p-5 transition-colors ${sc.is_active ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      {edit ? (
        <div>
          <p className="font-bold text-gray-900 mb-3">{sc.label}</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Extra Fee ($)</label>
              <input type="number" step="0.01" value={d.extra_fee}
                onChange={e => setD(p => ({ ...p, extra_fee: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Driver Share %</label>
              <input type="number" step="1" value={d.driver_share_pct}
                onChange={e => setD(p => ({ ...p, driver_share_pct: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <input type="text" value={d.description ?? ''}
                onChange={e => setD(p => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={saving}
              onClick={() => { onSave({ extra_fee: d.extra_fee, driver_share_pct: d.driver_share_pct, description: d.description }); setEdit(false) }}
              className="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEdit(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {sc.is_active && <Zap size={14} className="text-amber-500" />}
              <p className="font-bold text-gray-900">{sc.label}</p>
            </div>
            {sc.description && <p className="text-xs text-gray-500 mb-1">{sc.description}</p>}
            <div className="flex gap-4 text-sm">
              <div><span className="text-xs text-gray-400">Extra fee</span><p className="font-black text-gray-900">+${sc.extra_fee.toFixed(2)}</p></div>
              <div><span className="text-xs text-gray-400">Driver gets</span><p className="font-black text-green-700">{sc.driver_share_pct}%</p></div>
              <div><span className="text-xs text-gray-400">Platform gets</span><p className="font-black text-blue-700">{100 - sc.driver_share_pct}%</p></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleActive}
              disabled={saving}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                sc.is_active
                  ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {saving ? '…' : sc.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button onClick={() => setEdit(true)} className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Edit</button>
          </div>
        </div>
      )}
    </div>
  )
}

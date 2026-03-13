'use client'

import { useEffect, useState, useCallback } from 'react'

interface PriceTier {
  id: string
  name: string
  description: string | null
  base_fee: number
  per_km_rate: number
  min_order_amt: number
  eta_min_mins: number
  eta_max_mins: number
  is_active: boolean
  sort_order: number
  created_at: string
}

export default function PriceTiersPage() {
  const [tiers, setTiers] = useState<PriceTier[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PriceTier | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/price-tiers')
    if (res.ok) setTiers((await res.json()).tiers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    await fetch(`/api/admin/price-tiers/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: editing.description,
        base_fee: editing.base_fee,
        per_km_rate: editing.per_km_rate,
        min_order_amt: editing.min_order_amt,
        eta_min_mins: editing.eta_min_mins,
        eta_max_mins: editing.eta_max_mins,
        is_active: editing.is_active,
      }),
    })
    setEditing(null)
    setSaving(false)
    load()
  }

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[1,2,3,4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Price Tiers</h1>
        <p className="text-gray-400 text-sm mt-1">Delivery speed and pricing tiers shown to customers</p>
      </div>

      <div className="space-y-4">
        {tiers.map((tier) => (
          <div key={tier.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            {editing?.id === tier.id ? (
              /* Edit mode */
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="font-black text-gray-900 text-lg">{tier.name}</h3>
                  <label className="flex items-center gap-2 text-sm text-gray-500">
                    <input
                      type="checkbox"
                      checked={editing.is_active}
                      onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                    />
                    Active
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                    <input
                      value={editing.description ?? ''}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Base Fee ($)</label>
                    <input
                      type="number" step="0.01"
                      value={editing.base_fee}
                      onChange={(e) => setEditing({ ...editing, base_fee: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Per KM Rate ($)</label>
                    <input
                      type="number" step="0.01"
                      value={editing.per_km_rate}
                      onChange={(e) => setEditing({ ...editing, per_km_rate: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Min Order ($)</label>
                    <input
                      type="number" step="0.01"
                      value={editing.min_order_amt}
                      onChange={(e) => setEditing({ ...editing, min_order_amt: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">ETA Min (mins)</label>
                    <input
                      type="number"
                      value={editing.eta_min_mins}
                      onChange={(e) => setEditing({ ...editing, eta_min_mins: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">ETA Max (mins)</label>
                    <input
                      type="number"
                      value={editing.eta_max_mins}
                      onChange={(e) => setEditing({ ...editing, eta_max_mins: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-5 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-gray-900">{tier.name}</h3>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        tier.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {tier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {tier.description && <p className="text-sm text-gray-500 mb-2">{tier.description}</p>}
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-gray-400 text-xs">Base Fee</span>
                        <p className="font-bold text-gray-900">${tier.base_fee.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-xs">Per KM</span>
                        <p className="font-bold text-gray-900">${tier.per_km_rate.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-xs">Min Order</span>
                        <p className="font-bold text-gray-900">${tier.min_order_amt.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-xs">ETA</span>
                        <p className="font-bold text-gray-900">
                          {tier.eta_min_mins > 0 ? `${tier.eta_min_mins}–${tier.eta_max_mins} min` : 'Scheduled'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setEditing(tier)}
                  className="text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

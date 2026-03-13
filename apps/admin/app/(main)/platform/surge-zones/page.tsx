'use client'

import { useEffect, useState, useCallback } from 'react'

interface SurgeZone {
  id: string
  name: string
  description: string | null
  lat_min: number
  lat_max: number
  lng_min: number
  lng_max: number
  multiplier: number
  reason: string | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

const REASONS = ['High Demand', 'Weather', 'Special Event', 'Holiday', 'Limited Drivers']

const defaultForm = {
  name: '', description: '', lat_min: '', lat_max: '', lng_min: '', lng_max: '',
  multiplier: '1.5', reason: '', is_active: true, starts_at: '', ends_at: '',
}

export default function SurgeZonesPage() {
  const [zones, setZones] = useState<SurgeZone[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/surge-zones')
    if (res.ok) setZones((await res.json()).zones ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/surge-zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        lat_min: parseFloat(form.lat_min),
        lat_max: parseFloat(form.lat_max),
        lng_min: parseFloat(form.lng_min),
        lng_max: parseFloat(form.lng_max),
        multiplier: parseFloat(form.multiplier),
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      }),
    })
    setForm(defaultForm)
    setShowForm(false)
    setSaving(false)
    load()
  }

  const toggle = async (zone: SurgeZone) => {
    setActing(zone.id)
    await fetch(`/api/admin/surge-zones/${zone.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !zone.is_active }),
    })
    setActing(null)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this surge zone?')) return
    await fetch(`/api/admin/surge-zones/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Surge Zones</h1>
          <p className="text-gray-400 text-sm mt-1">Geographic areas with dynamic pricing</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors"
        >
          + New Zone
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">Create Surge Zone</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Zone Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Downtown Core"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Lat Min</label>
              <input
                type="number" step="0.000001"
                value={form.lat_min}
                onChange={(e) => setForm({ ...form, lat_min: e.target.value })}
                placeholder="51.500"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Lat Max</label>
              <input
                type="number" step="0.000001"
                value={form.lat_max}
                onChange={(e) => setForm({ ...form, lat_max: e.target.value })}
                placeholder="51.520"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Lng Min</label>
              <input
                type="number" step="0.000001"
                value={form.lng_min}
                onChange={(e) => setForm({ ...form, lng_min: e.target.value })}
                placeholder="-0.130"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Lng Max</label>
              <input
                type="number" step="0.000001"
                value={form.lng_max}
                onChange={(e) => setForm({ ...form, lng_max: e.target.value })}
                placeholder="-0.110"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Surge Multiplier (e.g. 1.5 = 50% extra)</label>
              <input
                type="number" step="0.1" min="1" max="5"
                value={form.multiplier}
                onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label>
              <select
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              >
                <option value="">Select reason…</option>
                {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Starts At (optional)</label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ends At (optional)</label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={save}
              disabled={saving || !form.name}
              className="px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Create Zone'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">{zone.name}</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      zone.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {zone.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {zone.reason && <p className="text-xs text-gray-400">{zone.reason}</p>}
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-[#FF6B35]">{zone.multiplier}×</span>
                </div>
              </div>
              <div className="text-xs text-gray-400 font-mono mb-3">
                [{zone.lat_min.toFixed(4)}, {zone.lng_min.toFixed(4)}] → [{zone.lat_max.toFixed(4)}, {zone.lng_max.toFixed(4)}]
              </div>
              {(zone.starts_at || zone.ends_at) && (
                <p className="text-xs text-gray-400 mb-3">
                  {zone.starts_at && `From ${new Date(zone.starts_at).toLocaleString()}`}
                  {zone.ends_at && ` until ${new Date(zone.ends_at).toLocaleString()}`}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => toggle(zone)}
                  disabled={acting === zone.id}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                    zone.is_active
                      ? 'text-orange-600 border border-orange-200 hover:bg-orange-50'
                      : 'text-green-600 border border-green-200 hover:bg-green-50'
                  }`}
                >
                  {zone.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => remove(zone.id)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {zones.length === 0 && (
            <div className="col-span-2 text-center py-16 text-gray-400 text-sm">
              No surge zones configured
            </div>
          )}
        </div>
      )}
    </div>
  )
}

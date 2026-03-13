'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'

interface Mission {
  id: string
  title: string
  description: string | null
  icon: string
  mission_type: 'deliveries' | 'ratings' | 'hours' | 'distance' | 'custom'
  target_value: number
  reward_amount: number
  period: 'daily' | 'weekly' | 'monthly' | 'one_time'
  is_active: boolean
  is_preset: boolean
  starts_at: string
  ends_at: string | null
}

const MISSION_TYPE_LABELS: Record<string, string> = {
  deliveries: 'Deliveries',
  ratings:    'Ratings',
  hours:      'Hours',
  distance:   'Distance',
  custom:     'Custom',
}

const PERIOD_LABELS: Record<string, string> = {
  daily:    'Daily',
  weekly:   'Weekly',
  monthly:  'Monthly',
  one_time: 'One-time',
}

const PERIOD_COLORS: Record<string, string> = {
  daily:    'bg-blue-100 text-blue-700',
  weekly:   'bg-purple-100 text-purple-700',
  monthly:  'bg-indigo-100 text-indigo-700',
  one_time: 'bg-gray-100 text-gray-600',
}

export default function MissionsPage() {
  const [missions, setMissions]     = useState<Mission[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/missions')
    if (res.ok) setMissions((await res.json()).missions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (mission: Mission) => {
    setSaving(mission.id)
    await fetch(`/api/admin/missions/${mission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !mission.is_active }),
    })
    setSaving(null)
    load()
  }

  const deleteMission = async (id: string) => {
    if (!confirm('Delete this mission?')) return
    setSaving(id)
    await fetch(`/api/admin/missions/${id}`, { method: 'DELETE' })
    setSaving(null)
    load()
  }

  const presets  = missions.filter(m => m.is_preset)
  const custom   = missions.filter(m => !m.is_preset)
  const activeCount = missions.filter(m => m.is_active).length

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Driver Missions</h1>
          <p className="text-gray-400 text-sm mt-1">
            {activeCount} active mission{activeCount !== 1 ? 's' : ''} · Drivers see active missions in their Earnings tab
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors"
        >
          <Plus size={16} />
          New Mission
        </button>
      </div>

      {/* Preset templates */}
      <div className="mb-8">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Preset Templates</p>
        <div className="grid grid-cols-2 gap-3">
          {presets.map(m => (
            <MissionCard
              key={m.id}
              mission={m}
              saving={saving === m.id}
              onToggle={() => toggleActive(m)}
            />
          ))}
        </div>
      </div>

      {/* Custom missions */}
      {custom.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Custom Missions</p>
          <div className="grid grid-cols-2 gap-3">
            {custom.map(m => (
              <MissionCard
                key={m.id}
                mission={m}
                saving={saving === m.id}
                onToggle={() => toggleActive(m)}
                onDelete={() => deleteMission(m.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateMissionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Mission Card ─────────────────────────────────────────────────────────────

function MissionCard({ mission: m, saving, onToggle, onDelete }: {
  mission: Mission
  saving: boolean
  onToggle: () => void
  onDelete?: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${m.is_active ? 'border-orange-200 shadow-orange-50' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl leading-none mt-0.5">{m.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight">{m.title}</p>
            {m.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{m.description}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PERIOD_COLORS[m.period]}`}>
                {PERIOD_LABELS[m.period]}
              </span>
              <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {MISSION_TYPE_LABELS[m.mission_type]} × {m.target_value}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <p className="font-black text-green-600">+${m.reward_amount.toFixed(2)}</p>
          <button
            onClick={onToggle}
            disabled={saving}
            className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-colors disabled:opacity-50 ${
              m.is_active
                ? 'bg-orange-500 border-orange-500 text-white hover:bg-orange-600'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {saving ? <RefreshCw size={10} className="animate-spin" /> : m.is_active ? 'Active' : 'Activate'}
          </button>
          {onDelete && (
            <button onClick={onDelete} disabled={saving} className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Create Mission Modal ─────────────────────────────────────────────────────

function CreateMissionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    icon: '🎯',
    mission_type: 'deliveries',
    target_value: 5,
    reward_amount: 5.00,
    period: 'daily',
    is_active: false,
  })

  const submit = async () => {
    if (!form.title) return
    setSaving(true)
    await fetch('/api/admin/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-black text-gray-900 mb-5">Create Mission</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Icon</label>
              <input
                value={form.icon}
                onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-2xl text-center focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Complete 5 deliveries"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Mission Type</label>
              <select
                value={form.mission_type}
                onChange={e => setForm(p => ({ ...p, mission_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
              >
                {Object.entries(MISSION_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Period</label>
              <select
                value={form.period}
                onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
              >
                {Object.entries(PERIOD_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Target Value</label>
              <input
                type="number"
                value={form.target_value}
                onChange={e => setForm(p => ({ ...p, target_value: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Reward ($)</label>
              <input
                type="number" step="0.01"
                value={form.reward_amount}
                onChange={e => setForm(p => ({ ...p, reward_amount: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
            />
            Activate immediately
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={submit}
            disabled={saving || !form.title}
            className="flex-1 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Mission'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

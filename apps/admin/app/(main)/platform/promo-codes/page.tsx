'use client'

import { useEffect, useState, useCallback } from 'react'

interface PromoCode {
  id: string
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  min_order_amt: number
  max_discount: number | null
  usage_limit: number | null
  usage_count: number
  per_user_limit: number
  starts_at: string
  expires_at: string | null
  is_active: boolean
  created_at: string
}

const defaultForm = {
  code: '', description: '', discount_type: 'percent', discount_value: '10',
  min_order_amt: '0', max_discount: '', usage_limit: '', per_user_limit: '1',
  expires_at: '', is_active: true,
}

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/promo-codes')
    if (res.ok) setCodes((await res.json()).codes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/promo-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code.toUpperCase(),
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value),
        min_order_amt: parseFloat(form.min_order_amt) || 0,
        max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
        usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
        per_user_limit: parseInt(form.per_user_limit) || 1,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
      }),
    })
    setForm(defaultForm)
    setShowForm(false)
    setSaving(false)
    load()
  }

  const toggleActive = async (code: PromoCode) => {
    setActing(code.id)
    await fetch(`/api/admin/promo-codes/${code.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !code.is_active }),
    })
    setActing(null)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this promo code?')) return
    await fetch(`/api/admin/promo-codes/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Promo Codes</h1>
          <p className="text-gray-400 text-sm mt-1">Manage discount and promotional codes</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors"
        >
          + New Code
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">Create Promo Code</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Code *</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SAVE20"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:outline-none focus:border-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. New user 20% off first order"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Discount Type</label>
              <select
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Discount Value ({form.discount_type === 'percent' ? '%' : '$'})
              </label>
              <input
                type="number" min="0"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Min Order Amount ($)</label>
              <input
                type="number" min="0"
                value={form.min_order_amt}
                onChange={(e) => setForm({ ...form, min_order_amt: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            {form.discount_type === 'percent' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Max Discount Cap ($)</label>
                <input
                  type="number" min="0"
                  value={form.max_discount}
                  onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
                  placeholder="No cap"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Total Usage Limit</label>
              <input
                type="number" min="1"
                value={form.usage_limit}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                placeholder="Unlimited"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Per User Limit</label>
              <input
                type="number" min="1"
                value={form.per_user_limit}
                onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Expires At</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={save}
              disabled={saving || !form.code}
              className="px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Code'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Code</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Discount</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Min Order</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Usage</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Expires</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {codes.map((code) => (
                <tr key={code.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-lg text-xs">
                      {code.code}
                    </span>
                    {code.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{code.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-gray-900">
                    {code.discount_type === 'percent'
                      ? `${code.discount_value}%`
                      : `$${code.discount_value}`}
                    {code.max_discount && <span className="text-xs text-gray-400 font-normal"> (max ${code.max_discount})</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {code.min_order_amt > 0 ? `$${code.min_order_amt}` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-sm">
                      <span className="font-semibold text-gray-900">{code.usage_count}</span>
                      <span className="text-gray-400"> / {code.usage_limit ?? '∞'}</span>
                    </div>
                    {code.usage_limit && (
                      <div className="w-20 h-1 bg-gray-100 rounded-full mt-1">
                        <div
                          className="h-full bg-[#FF6B35] rounded-full"
                          style={{ width: `${Math.min(100, (code.usage_count / code.usage_limit) * 100)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {code.expires_at
                      ? new Date(code.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      code.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleActive(code)}
                        disabled={acting === code.id}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                          code.is_active
                            ? 'text-orange-600 border border-orange-200 hover:bg-orange-50'
                            : 'text-green-600 border border-green-200 hover:bg-green-50'
                        }`}
                      >
                        {code.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => remove(code.id)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">
                    No promo codes yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

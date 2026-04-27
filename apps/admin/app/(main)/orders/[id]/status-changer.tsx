'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ALL_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker', 'picked_up',
  'on_the_way', 'arrived_at_customer', 'delivered',
  'failed_delivery', 'cancelled',
] as const

type OrderStatus = typeof ALL_STATUSES[number]

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:             'Pending',
  confirmed:           'Confirmed',
  preparing:           'Preparing',
  ready:               'Ready for pickup',
  driver_assigned:     'Driver assigned',
  arrived_at_maker:    'Driver at maker',
  picked_up:           'Picked up',
  on_the_way:          'On the way',
  arrived_at_customer: 'Arrived at customer',
  delivered:           'Delivered',
  failed_delivery:     'Failed delivery',
  cancelled:           'Cancelled',
}

interface Props {
  orderId: string
  currentStatus: string
}

export function OrderStatusChanger({ orderId, currentStatus }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<OrderStatus>(currentStatus as OrderStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isDirty = selected !== currentStatus

  const handleSave = async () => {
    if (!isDirty) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: selected }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to update status')
      return
    }

    setSuccess(true)
    router.refresh()
    setTimeout(() => setSuccess(false), 2500)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
        Update Status
      </h2>

      <select
        value={selected}
        onChange={(e) => { setSelected(e.target.value as OrderStatus); setSuccess(false) }}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-800 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all mb-3"
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-xs text-red-500 mb-2">{error}</p>
      )}

      {success && (
        <p className="text-xs text-green-600 font-semibold mb-2">✓ Status updated</p>
      )}

      <button
        onClick={handleSave}
        disabled={!isDirty || saving}
        className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold text-sm py-2.5 rounded-xl transition-colors"
      >
        {saving ? 'Saving…' : 'Save Status'}
      </button>
    </div>
  )
}

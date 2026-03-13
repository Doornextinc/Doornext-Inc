'use client'

import { useEffect, useState, useCallback } from 'react'

interface DriverPerf {
  id: string
  full_name: string
  vehicle_type: string | null
  is_active: boolean
  kyc_status: string | null
  total_deliveries: number
  avg_rating: number
  deliveries_7d: number
  deliveries_30d: number
  earnings_30d: number
  cancellations_total: number
  created_at: string
}

const KYC_COLORS: Record<string, string> = {
  not_submitted: 'bg-gray-100 text-gray-500',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function RatingBar({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 4.5 ? 'bg-green-500' : value >= 3.5 ? 'bg-yellow-400' : 'bg-red-400'}`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700">{value > 0 ? value.toFixed(1) : '—'}</span>
    </div>
  )
}

export default function DriverPerformancePage() {
  const [drivers, setDrivers] = useState<DriverPerf[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<keyof DriverPerf>('deliveries_30d')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/driver-performance')
    if (res.ok) setDrivers((await res.json()).drivers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sorted = [...drivers].sort((a, b) => {
    const av = a[sortBy] as number
    const bv = b[sortBy] as number
    return bv - av
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Driver Performance</h1>
          <p className="text-gray-400 text-sm mt-1">Scorecard across all active drivers</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          Sort by:
          <select
            value={sortBy as string}
            onChange={(e) => setSortBy(e.target.value as keyof DriverPerf)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"
          >
            <option value="deliveries_30d">Deliveries (30d)</option>
            <option value="deliveries_7d">Deliveries (7d)</option>
            <option value="earnings_30d">Earnings (30d)</option>
            <option value="avg_rating">Rating</option>
            <option value="total_deliveries">Total Deliveries</option>
            <option value="cancellations_total">Cancellations</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">KYC</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-gray-400 uppercase">7d</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-gray-400 uppercase">30d</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-gray-400 uppercase">Total</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Earnings (30d)</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-gray-400 uppercase">Cancels</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((driver, rank) => (
                <tr key={driver.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-gray-300 w-4">{rank + 1}</span>
                      <div>
                        <p className="font-medium text-gray-900">{driver.full_name}</p>
                        <p className="text-xs text-gray-400">{driver.vehicle_type ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      KYC_COLORS[driver.kyc_status ?? 'not_submitted']
                    }`}>
                      {(driver.kyc_status ?? 'not_submitted').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center font-semibold text-gray-900">{driver.deliveries_7d}</td>
                  <td className="px-5 py-3 text-center font-bold text-gray-900">{driver.deliveries_30d}</td>
                  <td className="px-5 py-3 text-center text-gray-500">{driver.total_deliveries}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">
                    ${(driver.earnings_30d ?? 0).toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs font-semibold ${
                      driver.cancellations_total > 5 ? 'text-red-500' : 'text-gray-500'
                    }`}>
                      {driver.cancellations_total}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <RatingBar value={driver.avg_rating} />
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {driver.is_active ? 'Online' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                    No driver data yet
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

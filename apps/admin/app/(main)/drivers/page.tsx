'use client'

import { useEffect, useState, useCallback } from 'react'

interface Driver {
  id: string
  full_name: string
  vehicle_type: string | null
  is_active: boolean
  total_deliveries: number
  avg_rating: number
  created_at: string
}

const VEHICLE_ICONS: Record<string, string> = { car: '🚗', bike: '🚲', foot: '🚶' }

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const loadDrivers = useCallback(async () => {
    const res = await fetch('/api/admin/drivers')
    if (res.ok) {
      const data = await res.json()
      setDrivers(data.drivers ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadDrivers() }, [loadDrivers])

  const toggleActive = async (driver: Driver) => {
    setToggling(driver.id)
    await fetch('/api/admin/drivers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driver.id, is_active: !driver.is_active }),
    })
    await loadDrivers()
    setToggling(null)
  }

  if (loading) {
    return (
      <div className="p-8 space-y-2">
        {[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Drivers</h1>
        <span className="text-sm text-gray-400">{drivers.length} total</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Vehicle</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Deliveries</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {drivers.map((driver) => (
              <tr key={driver.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">{driver.full_name}</td>
                <td className="px-5 py-3 text-gray-500">
                  {driver.vehicle_type
                    ? `${VEHICLE_ICONS[driver.vehicle_type] ?? ''} ${driver.vehicle_type}`
                    : '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {driver.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">{driver.total_deliveries}</td>
                <td className="px-5 py-3 text-right text-gray-600">
                  {driver.avg_rating > 0 ? `⭐ ${driver.avg_rating.toFixed(1)}` : '—'}
                </td>
                <td className="px-5 py-3 text-right text-xs text-gray-400">
                  {new Date(driver.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => toggleActive(driver)}
                    disabled={toggling === driver.id}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                      driver.is_active
                        ? 'text-red-500 hover:bg-red-50 border border-red-200'
                        : 'text-green-600 hover:bg-green-50 border border-green-200'
                    }`}
                  >
                    {driver.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">No drivers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Driver {
  id: string
  full_name: string
  vehicle_type: string | null
  is_active: boolean
  kyc_status: string | null
  total_deliveries: number
  avg_rating: number
  created_at: string
}

const KYC_COLORS: Record<string, string> = {
  not_submitted: 'bg-gray-100 text-gray-500',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const VEHICLE_ICONS: Record<string, string> = { car: '🚗', bike: '🚲', foot: '🚶' }

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

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
    setActing(driver.id)
    await fetch('/api/admin/drivers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driver.id, is_active: !driver.is_active }),
    })
    await loadDrivers()
    setActing(null)
  }

  const approveKyc = async (driver: Driver) => {
    setActing(driver.id)
    await fetch('/api/admin/drivers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driver.id, kyc_status: 'approved' }),
    })
    await loadDrivers()
    setActing(null)
  }

  if (loading) {
    return (
      <div className="p-8 space-y-2">
        {[1,2,3,4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Nexters</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/operations/kyc"
            className="text-xs font-semibold px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            KYC Review →
          </Link>
          <Link
            href="/platform/driver-performance"
            className="text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            Performance →
          </Link>
          <span className="text-sm text-gray-400">{drivers.length} total</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Vehicle</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">KYC</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Deliveries</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {drivers.map((driver) => (
              <tr key={driver.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">
                  <Link href={`/users/${driver.id}`} className="hover:text-[#FF6B35] hover:underline">
                    {driver.full_name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {driver.vehicle_type
                    ? `${VEHICLE_ICONS[driver.vehicle_type] ?? ''} ${driver.vehicle_type}`
                    : '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    KYC_COLORS[driver.kyc_status ?? 'not_submitted']
                  }`}>
                    {(driver.kyc_status ?? 'not submitted').replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {driver.is_active ? 'Online' : 'Offline'}
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
                  <div className="flex items-center justify-end gap-2">
                    {driver.kyc_status !== 'approved' && (
                      <button
                        onClick={() => approveKyc(driver)}
                        disabled={acting === driver.id}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 text-amber-700 hover:bg-amber-50 border border-amber-200"
                      >
                        ✓ Approve KYC
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(driver)}
                      disabled={acting === driver.id}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                        driver.is_active
                          ? 'text-red-500 hover:bg-red-50 border border-red-200'
                          : 'text-green-600 hover:bg-green-50 border border-green-200'
                      }`}
                    >
                      {driver.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">No drivers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

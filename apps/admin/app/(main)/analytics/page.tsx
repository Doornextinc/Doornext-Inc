'use client'

import { useEffect, useState } from 'react'

interface DailyStat { date: string; revenue: number; orders: number }
interface TopMaker { name: string; revenue: number; orders: number }
interface Summary {
  gmv: number
  platformFees: number
  serviceFees: number
  netRevenue: number
  driverPayouts: number
  makerPayouts: number
  discounts: number
  totalOrders: number
  deliveredCount: number
  cancelledCount: number
  conversionRate: number
  avgOrderValue: number
  totalUsers: number
  activeDrivers: number
}

const PERIODS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
]

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [topMakers, setTopMakers] = useState<TopMaker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/analytics?days=${period}`)
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary)
        setDaily(d.dailyStats ?? [])
        setTopMakers(d.topMakers ?? [])
        setLoading(false)
      })
  }, [period])

  const maxRevenue = Math.max(...daily.map((d) => d.revenue), 1)
  const maxOrders = Math.max(...daily.map((d) => d.orders), 1)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Analytics</h1>
          <p className="text-gray-400 text-sm mt-1">Platform performance overview</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : summary && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            {[
              { label: 'GMV', value: `$${summary.gmv.toLocaleString('en', { minimumFractionDigits: 2 })}`, sub: 'Gross merchandise value' },
              { label: 'Net Platform Revenue', value: `$${summary.netRevenue.toFixed(2)}`, sub: 'Commission + service fees' },
              { label: 'Commission (15%)', value: `$${summary.platformFees.toFixed(2)}`, sub: '15% of food subtotal' },
              { label: 'Service Fees', value: `$${summary.serviceFees.toFixed(2)}`, sub: 'Customer service charges' },
              { label: 'Total Orders', value: summary.totalOrders.toLocaleString(), sub: `${summary.deliveredCount} delivered` },
              { label: 'Avg Order Value', value: `$${summary.avgOrderValue.toFixed(2)}`, sub: `${summary.conversionRate}% conversion` },
              { label: 'Driver Payouts', value: `$${summary.driverPayouts.toFixed(2)}`, sub: 'Total paid to drivers' },
              { label: 'Seller Payouts', value: `$${summary.makerPayouts.toFixed(2)}`, sub: 'Total paid to sellers' },
              { label: 'Discounts Given', value: `$${summary.discounts.toFixed(2)}`, sub: 'Promo code redemptions' },
              { label: 'Cancelled Orders', value: summary.cancelledCount, sub: `${((summary.cancelledCount / (summary.totalOrders || 1)) * 100).toFixed(1)}% cancel rate` },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-black text-gray-900">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-6">Daily Revenue</h2>
            {daily.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {daily.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="relative w-full">
                      <div
                        className="w-full bg-[#FF6B35] rounded-t-sm transition-all group-hover:bg-[#FF8C5A]"
                        style={{ height: `${(d.revenue / maxRevenue) * 140}px` }}
                        title={`$${d.revenue.toFixed(2)}`}
                      />
                    </div>
                    <span className="text-[9px] text-gray-400 rotate-45 origin-left hidden sm:block">
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Orders Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-6">Daily Orders</h2>
              <div className="flex items-end gap-1 h-32">
                {daily.map((d) => (
                  <div key={d.date} className="flex-1">
                    <div
                      className="w-full bg-blue-400 rounded-t-sm hover:bg-blue-500 transition-colors"
                      style={{ height: `${(d.orders / maxOrders) * 120}px` }}
                      title={`${d.orders} orders`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Top Sellers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4">Top Sellers by Revenue</h2>
              <div className="space-y-3">
                {topMakers.length === 0 ? (
                  <p className="text-sm text-gray-400">No data yet</p>
                ) : topMakers.map((m, i) => (
                  <div key={m.name} className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-300 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.orders} orders</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      ${m.revenue.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

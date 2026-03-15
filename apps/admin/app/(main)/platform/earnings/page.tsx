'use client'

import { useEffect, useState } from 'react'

interface EarningsSummary {
  gmv: number
  platformFees: number
  serviceFees: number
  netRevenue: number
  driverPayouts: number
  makerPayouts: number
  discounts: number
  totalOrders: number
}

interface DailyRow {
  date: string
  gmv: number
  platform_fees: number
  driver_payouts: number
  maker_payouts: number
  orders: number
}

const PERIODS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: '1 year', value: '365d' },
]

export default function EarningsPage() {
  const [period, setPeriod] = useState('30d')
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/earnings?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary)
        setDaily(d.daily ?? [])
        setLoading(false)
      })
  }, [period])

  const exportCSV = () => {
    const header = 'Date,Orders,GMV,Platform Fees,Driver Payouts,Seller Payouts\n'
    const rows = daily.map((d) =>
      `${d.date},${d.orders},${d.gmv.toFixed(2)},${d.platform_fees.toFixed(2)},${d.driver_payouts.toFixed(2)},${d.maker_payouts.toFixed(2)}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `doornext-earnings-${period}.csv`
    a.click()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Company Earnings</h1>
          <p className="text-gray-400 text-sm mt-1">Platform financial performance</p>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            onClick={exportCSV}
            disabled={loading || daily.length === 0}
            className="px-4 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Gross Merchandise Value', value: `$${summary.gmv.toLocaleString('en', { minimumFractionDigits: 2 })}`, accent: false },
              { label: 'Platform Net Revenue', value: `$${summary.netRevenue.toFixed(2)}`, accent: true },
              { label: 'Driver Payouts', value: `$${summary.driverPayouts.toFixed(2)}`, accent: false },
              { label: 'Seller Payouts', value: `$${summary.makerPayouts.toFixed(2)}`, accent: false },
              { label: 'Discount Costs', value: `$${summary.discounts.toFixed(2)}`, accent: false },
              { label: 'Total Orders', value: summary.totalOrders.toLocaleString(), accent: false },
              {
                label: 'Take Rate',
                value: `${summary.gmv ? ((summary.netRevenue / summary.gmv) * 100).toFixed(1) : 0}%`,
                accent: false,
              },
              {
                label: 'Avg Order Value',
                value: `$${summary.totalOrders ? (summary.gmv / summary.totalOrders).toFixed(2) : '0.00'}`,
                accent: false,
              },
            ].map(({ label, value, accent }) => (
              <div key={label} className={`rounded-2xl p-5 border shadow-sm ${
                accent ? 'bg-[#FF6B35] border-[#FF6B35] text-white' : 'bg-white border-gray-100'
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-orange-100' : 'text-gray-400'}`}>
                  {label}
                </p>
                <p className={`text-2xl font-black ${accent ? 'text-white' : 'text-gray-900'}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* P&L breakdown */}
          <div className="grid grid-cols-2 gap-6">
            {/* Breakdown donut-style */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4">Revenue Breakdown</h2>
              <div className="space-y-3">
                {[
                  { label: 'GMV (Total Sales)', value: summary.gmv, color: 'bg-gray-200' },
                  { label: 'Commission (15%)', value: summary.platformFees, color: 'bg-[#FF6B35]' },
                  { label: 'Service Fees', value: summary.serviceFees, color: 'bg-orange-300' },
                  { label: 'Driver Payouts', value: summary.driverPayouts, color: 'bg-blue-400' },
                  { label: 'Seller Payouts', value: summary.makerPayouts, color: 'bg-purple-400' },
                  { label: 'Discounts', value: summary.discounts, color: 'bg-green-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shrink-0 ${color}`} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-bold text-gray-900">${value.toFixed(2)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${summary.gmv ? Math.min(100, (value / summary.gmv) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">Daily Breakdown</h2>
              </div>
              <div className="overflow-y-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-50">
                      <th className="text-left px-4 py-2 text-gray-400 font-bold uppercase">Date</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-bold uppercase">Orders</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-bold uppercase">GMV</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-bold uppercase">Fees</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...daily].reverse().map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-gray-600">{d.date}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{d.orders}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">${d.gmv.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-bold text-[#FF6B35]">${d.platform_fees.toFixed(2)}</td>
                      </tr>
                    ))}
                    {daily.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

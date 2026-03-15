'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface EarningsSummary {
  today: number
  week: number
  month: number
  totalOrders: number
  avgOrderValue: number
}

export default function EarningsPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; maker_payout: number; created_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: maker } = await supabase
        .from('food_makers').select('id').eq('user_id', user.id).single()
      if (!maker) { setError('Kitchen profile not found'); setLoading(false); return }

      const now = new Date()
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, maker_payout, created_at')
        .eq('maker_id', maker.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })

      if (fetchError) { setError('Failed to load earnings data'); setLoading(false); return }

      const all = orders ?? []
      const sumPayout = (arr: typeof all) =>
        arr.reduce((acc, o) => acc + (o.maker_payout ?? 0), 0)

      setSummary({
        today: sumPayout(all.filter(o => new Date(o.created_at) >= startOfDay)),
        week: sumPayout(all.filter(o => new Date(o.created_at) >= startOfWeek)),
        month: sumPayout(all.filter(o => new Date(o.created_at) >= startOfMonth)),
        totalOrders: all.length,
        avgOrderValue: all.length > 0 ? sumPayout(all) / all.length : 0,
      })
      setRecentOrders(all.slice(0, 30))
      setLoading(false)
    }
    load()
  }, [router])

  if (error) {
    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center">
          <h1 className="text-[18px] font-black text-gray-900">Earnings</h1>
        </header>
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h3 className="text-lg font-black text-gray-900">Something went wrong</h3>
          <p className="text-gray-400 text-sm mt-1">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true) }}
            className="mt-6 px-6 py-3 bg-[#FF6B35] text-white rounded-2xl font-bold text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center">
        <h1 className="text-[18px] font-black text-gray-900">Earnings</h1>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-4 space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Today',      value: summary?.today ?? 0 },
              { label: 'This Week',  value: summary?.week ?? 0 },
              { label: 'This Month', value: summary?.month ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
                <p className="font-black text-[#FF6B35] text-xl leading-none">${value.toFixed(0)}</p>
                <p className="text-xs text-gray-400 mt-1.5 font-medium">{label}</p>
              </div>
            ))}
          </div>

          {/* Totals strip */}
          <div className="bg-white rounded-2xl border border-gray-100 flex divide-x divide-gray-100">
            <div className="flex-1 p-4 text-center">
              <p className="font-black text-gray-900 text-2xl">{summary?.totalOrders ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1 font-medium">Total Orders</p>
            </div>
            <div className="flex-1 p-4 text-center">
              <p className="font-black text-[#FF6B35] text-2xl">${summary?.avgOrderValue.toFixed(2) ?? '0.00'}</p>
              <p className="text-xs text-gray-400 mt-1 font-medium">Avg Earnings</p>
            </div>
          </div>

          {/* Recent deliveries */}
          {recentOrders.length > 0 ? (
            <section>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2">
                Recent Orders
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-gray-300 mt-0.5">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <p className="font-black text-[#FF6B35] text-base">
                      ${(order.maker_payout ?? 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
                <span className="text-3xl">📈</span>
              </div>
              <h3 className="text-lg font-black text-gray-900">No earnings yet</h3>
              <p className="text-gray-400 text-sm mt-1">Completed orders will appear here</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

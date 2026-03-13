'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, ShoppingBag, DollarSign } from 'lucide-react'

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
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; total: number; created_at: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: maker } = await supabase
        .from('food_makers').select('id').eq('user_id', user.id).single()
      if (!maker) return

      const now = new Date()
      const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString()
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total, created_at, subtotal')
        .eq('maker_id', maker.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })

      const all = orders ?? []
      const todayOrders = all.filter((o) => o.created_at >= startOfDay)
      const weekOrders = all.filter((o) => o.created_at >= startOfWeek)
      const monthOrders = all.filter((o) => o.created_at >= startOfMonth)

      const sum = (arr: typeof all) => arr.reduce((acc, o) => acc + (o.subtotal ?? 0), 0)

      setSummary({
        today: sum(todayOrders),
        week: sum(weekOrders),
        month: sum(monthOrders),
        totalOrders: all.length,
        avgOrderValue: all.length > 0 ? sum(all) / all.length : 0,
      })
      setRecentOrders(all.slice(0, 20))
      setLoading(false)
    }
    load()
  }, [router])

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-14 flex items-center">
        <h1 className="text-lg font-bold text-gray-900">Earnings</h1>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Today', value: summary?.today ?? 0, icon: '📅' },
              { label: 'This Week', value: summary?.week ?? 0, icon: '📆' },
              { label: 'This Month', value: summary?.month ?? 0, icon: '🗓️' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white rounded-2xl p-3 text-center">
                <span className="text-xl">{icon}</span>
                <p className="font-black text-gray-900 text-base mt-1">${value.toFixed(2)}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="bg-white rounded-2xl p-4 flex gap-4">
            <div className="flex-1 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <ShoppingBag size={18} className="text-[#FF6B35]" />
              </div>
              <div>
                <p className="font-black text-gray-900">{summary?.totalOrders ?? 0}</p>
                <p className="text-xs text-gray-400">Total Orders</p>
              </div>
            </div>
            <div className="w-px bg-gray-100" />
            <div className="flex-1 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <DollarSign size={18} className="text-green-500" />
              </div>
              <div>
                <p className="font-black text-gray-900">${summary?.avgOrderValue.toFixed(2) ?? '0.00'}</p>
                <p className="text-xs text-gray-400">Avg Order</p>
              </div>
            </div>
          </div>

          {/* Recent orders */}
          {recentOrders.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1 mb-3">
                Recent Deliveries
              </h2>
              <div className="bg-white rounded-2xl divide-y divide-gray-50">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </p>
                    </div>
                    <p className="font-bold text-gray-900">${order.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recentOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <TrendingUp size={48} className="text-gray-200 mb-4" />
              <h3 className="text-lg font-bold text-gray-700">No earnings yet</h3>
              <p className="text-gray-400 text-sm mt-1">Completed orders will appear here</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

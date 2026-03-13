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
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; total: number; subtotal: number; created_at: string }>>([])
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
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total, subtotal, created_at')
        .eq('maker_id', maker.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })

      const all = orders ?? []
      const sum = (arr: typeof all) => arr.reduce((acc, o) => acc + (o.subtotal ?? 0), 0)

      setSummary({
        today: sum(all.filter(o => new Date(o.created_at) >= startOfDay)),
        week: sum(all.filter(o => new Date(o.created_at) >= startOfWeek)),
        month: sum(all.filter(o => new Date(o.created_at) >= startOfMonth)),
        totalOrders: all.length,
        avgOrderValue: all.length > 0 ? sum(all) / all.length : 0,
      })
      setRecentOrders(all.slice(0, 30))
      setLoading(false)
    }
    load()
  }, [router])

  return (
    <div className="flex flex-col min-h-full bg-[#F5F4F2]">
      <header className="sticky top-0 z-40 bg-white border-b border-[#EBEBEB] px-4 h-[60px] flex items-center">
        <h1 className="text-[18px] font-black text-[#111]">Earnings</h1>
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
              { label: 'Today', value: summary?.today ?? 0 },
              { label: 'This Week', value: summary?.week ?? 0 },
              { label: 'This Month', value: summary?.month ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-[#EBEBEB] p-3.5 text-center">
                <p className="font-black text-[#111] text-xl leading-none">${value.toFixed(0)}</p>
                <p className="text-xs text-[#AAA] mt-1.5 font-medium">{label}</p>
              </div>
            ))}
          </div>

          {/* Totals strip */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] flex divide-x divide-[#F0F0F0]">
            <div className="flex-1 p-4 text-center">
              <p className="font-black text-[#111] text-2xl">{summary?.totalOrders ?? 0}</p>
              <p className="text-xs text-[#AAA] mt-1 font-medium">Total Orders</p>
            </div>
            <div className="flex-1 p-4 text-center">
              <p className="font-black text-[#111] text-2xl">${summary?.avgOrderValue.toFixed(2) ?? '0.00'}</p>
              <p className="text-xs text-[#AAA] mt-1 font-medium">Avg Order</p>
            </div>
          </div>

          {/* Recent deliveries */}
          {recentOrders.length > 0 ? (
            <section>
              <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2">
                Recent Deliveries
              </p>
              <div className="bg-white rounded-2xl border border-[#EBEBEB] divide-y divide-[#F5F4F2]">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <p className="font-bold text-[#111] text-sm">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-[#BBB] mt-0.5">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <p className="font-black text-[#111] text-base">${order.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white border border-[#EBEBEB] flex items-center justify-center mb-4">
                <span className="text-3xl">📈</span>
              </div>
              <h3 className="text-lg font-black text-[#333]">No earnings yet</h3>
              <p className="text-[#AAA] text-sm mt-1">Completed orders will appear here</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

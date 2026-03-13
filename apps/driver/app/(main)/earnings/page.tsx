'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Package, Star, ChevronRight, Clock } from 'lucide-react'

type Delivery = { id: string; delivery_fee: number; tip_amount: number; created_at: string }
type Period = 'today' | 'week' | 'month' | 'all'

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time',
}

function getPeriodStart(period: Period): Date | null {
  const now = new Date()
  if (period === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d }
  if (period === 'week') { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0, 0, 0, 0); return d }
  if (period === 'month') { return new Date(now.getFullYear(), now.getMonth(), 1) }
  return null
}

function getDayBounds(daysAgo: number) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const end = new Date(start); end.setDate(start.getDate() + 1)
  return { start, end }
}

export default function EarningsPage() {
  const router = useRouter()
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [profile, setProfile] = useState<{ total_deliveries: number; avg_rating: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [ordersRes, profileRes] = await Promise.all([
        supabase.from('orders').select('id, delivery_fee, tip_amount, created_at').eq('nexter_id', user.id).eq('status', 'delivered').order('created_at', { ascending: false }).limit(200),
        supabase.from('driver_profiles').select('total_deliveries, avg_rating').eq('id', user.id).single(),
      ])

      setDeliveries(ordersRes.data ?? [])
      setProfile(profileRes.data)
      setLoading(false)
    }
    load()
  }, [router])

  const filtered = (() => {
    const cutoff = getPeriodStart(period)
    if (!cutoff) return deliveries
    return deliveries.filter(d => new Date(d.created_at) >= cutoff)
  })()

  const totalEarnings = filtered.reduce((s, d) => s + (d.delivery_fee ?? 0), 0)
  const totalTips = filtered.reduce((s, d) => s + (d.tip_amount ?? 0), 0)
  const basePay = totalEarnings - totalTips
  const avgPerTrip = filtered.length > 0 ? totalEarnings / filtered.length : 0

  // 7-day bar chart
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const weekChart = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i
    const { start, end } = getDayBounds(daysAgo)
    const dayDate = new Date(); dayDate.setDate(dayDate.getDate() - daysAgo)
    const dayDeliveries = deliveries.filter(d => { const at = new Date(d.created_at); return at >= start && at < end })
    const total = dayDeliveries.reduce((s, d) => s + (d.delivery_fee ?? 0), 0)
    return { label: DAY_LABELS[dayDate.getDay()], total, count: dayDeliveries.length, isToday: daysAgo === 0 }
  })
  const maxBar = Math.max(...weekChart.map(d => d.total), 1)

  // Group recent deliveries
  const recentByDay = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const todayItems = filtered.filter(d => new Date(d.created_at) >= today)
    const yesterdayItems = filtered.filter(d => { const at = new Date(d.created_at); return at >= yesterday && at < today })
    const earlierItems = filtered.filter(d => new Date(d.created_at) < yesterday)
    return [
      { label: 'Today', items: todayItems },
      { label: 'Yesterday', items: yesterdayItems },
      { label: 'Earlier', items: earlierItems },
    ].filter(g => g.items.length > 0)
  })()

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm px-4 h-14 flex items-center justify-between border-b border-slate-700/40">
        <h1 className="text-xl font-black text-white tracking-tight">Earnings</h1>
        <Link href="/history" className="text-xs text-[#FF6B35] font-bold flex items-center gap-1">
          Full history <ChevronRight size={12} />
        </Link>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Period selector */}
          <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-colors ${period === p ? 'bg-[#FF6B35] text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Hero earnings card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-800/60 rounded-2xl p-5 border border-slate-700/40">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">{PERIOD_LABELS[period]}</p>
            <p className="text-4xl font-black text-white mb-1">${totalEarnings.toFixed(2)}</p>
            <p className="text-sm text-slate-400">{filtered.length} deliveries</p>

            {/* 7-day bar chart */}
            <div className="mt-5 flex items-end gap-1.5 h-14">
              {weekChart.map((day, i) => {
                const height = day.total > 0 ? Math.max((day.total / maxBar) * 100, 12) : 6
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: 44 }}>
                      <div
                        style={{ height: `${height}%` }}
                        className={`w-full rounded-t-md transition-all ${day.isToday ? 'bg-[#FF6B35]' : day.total > 0 ? 'bg-slate-600' : 'bg-slate-700/50'}`}
                        title={`$${day.total.toFixed(2)}`}
                      />
                    </div>
                    <span className={`text-[9px] font-bold ${day.isToday ? 'text-[#FF6B35]' : 'text-slate-600'}`}>{day.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/40">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Breakdown</p>
            </div>
            <div className="divide-y divide-slate-700/30">
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-slate-400">Base Pay</span>
                <span className="text-sm font-bold text-white">${basePay.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-slate-400">Tips</span>
                <span className="text-sm font-bold text-green-400">+${totalTips.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-slate-700/20">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-sm font-black text-[#FF6B35]">${totalEarnings.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800 rounded-2xl p-3 border border-slate-700/40 text-center">
              <div className="w-7 h-7 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center mx-auto mb-2">
                <Package size={14} className="text-[#FF6B35]" />
              </div>
              <p className="font-black text-white text-lg leading-none">{profile?.total_deliveries ?? deliveries.length}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">All time</p>
            </div>
            <div className="bg-slate-800 rounded-2xl p-3 border border-slate-700/40 text-center">
              <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center mx-auto mb-2">
                <Star size={14} className="text-yellow-400" />
              </div>
              <p className="font-black text-white text-lg leading-none">{profile?.avg_rating?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Rating</p>
            </div>
            <div className="bg-slate-800 rounded-2xl p-3 border border-slate-700/40 text-center">
              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                <TrendingUp size={14} className="text-green-400" />
              </div>
              <p className="font-black text-white text-lg leading-none">${avgPerTrip.toFixed(2)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Per trip</p>
            </div>
          </div>

          {/* History grouped */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center mb-4">
                <TrendingUp size={28} className="text-slate-600" />
              </div>
              <p className="text-slate-400 font-semibold">No deliveries yet</p>
              <p className="text-slate-600 text-sm mt-1">Complete orders to see your earnings here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentByDay.map(({ label, items }) => (
                <section key={label}>
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{label}</h2>
                  <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/40 divide-y divide-slate-700/40">
                    {items.map(d => (
                      <div key={d.id} className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <Clock size={13} className="text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">#{d.id.slice(-6).toUpperCase()}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {new Date(d.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-[#FF6B35]">+${d.delivery_fee.toFixed(2)}</p>
                          {d.tip_amount > 0 && <p className="text-[11px] text-green-400 mt-0.5">+${d.tip_amount.toFixed(2)} tip</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

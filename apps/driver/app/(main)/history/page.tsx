'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { Package, MapPin, Clock, ChevronRight } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'


type Delivery = {
  id: string
  driver_payout: number
  total: number
  status: string
  created_at: string
  delivery_address: { street?: string; city?: string; state?: string } | null
  food_maker: { display_name: string } | null
}

type Period = 'week' | 'month' | 'all'

const PERIOD_LABELS: Record<Period, string> = { week: 'Last 7 Days', month: 'Last 30 Days', all: 'All Time' }

function groupByDate(deliveries: Delivery[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)

  const groups: Record<string, Delivery[]> = {}
  for (const d of deliveries) {
    const dt = new Date(d.created_at)
    dt.setHours(0, 0, 0, 0)
    let label: string
    if (dt.getTime() === today.getTime()) label = 'Today'
    else if (dt.getTime() === yesterday.getTime()) label = 'Yesterday'
    else label = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (!groups[label]) groups[label] = []
    groups[label].push(d)
  }
  return groups
}

export default function HistoryPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')

  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }
    async function load() {
      const supabase = createClient()

      const { data } = await supabase
        .from('orders')
        .select('id, driver_payout, total, status, created_at, delivery_address, food_maker:food_makers(display_name)')
        .eq('nexter_id', userId)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(100)

      setDeliveries((data as unknown as Delivery[]) ?? [])
      setLoading(false)
    }
    load()
  }, [router, userId, authReady, hasHydrated])

  const filtered = (() => {
    if (period === 'all') return deliveries
    const now = new Date()
    const cutoff = new Date()
    if (period === 'week') cutoff.setDate(now.getDate() - 7)
    else cutoff.setMonth(now.getMonth() - 1)
    return deliveries.filter(d => new Date(d.created_at) >= cutoff)
  })()

  const totalEarnings = filtered.reduce((s, d) => s + (d.driver_payout ?? 0), 0)
  const groups = groupByDate(filtered)

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Delivery History" showBack backHref="/" />

      {/* Period filter */}
      <div className="px-4 py-3">
        <div className="flex gap-1 bg-[#111] rounded-xl p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${period === p ? 'bg-[#FF7A50] text-white' : 'text-zinc-500 hover:text-slate-300'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-[#111] rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="flex-1 p-4 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#111] rounded-2xl border border-white/5 p-4 text-center">
              <p className="text-2xl font-black text-[#FF7A50]">${totalEarnings.toFixed(2)}</p>
              <p className="text-xs text-zinc-500 mt-1">Total Earned</p>
            </div>
            <div className="bg-[#111] rounded-2xl border border-white/5 p-4 text-center">
              <p className="text-2xl font-black text-white">{filtered.length}</p>
              <p className="text-xs text-zinc-500 mt-1">Deliveries</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-[#111] border border-white/5 flex items-center justify-center mb-4">
                <Package size={28} className="text-zinc-600" />
              </div>
              <p className="text-zinc-400 font-semibold">No deliveries yet</p>
              <p className="text-zinc-600 text-sm mt-1">Your completed deliveries will appear here</p>
            </div>
          ) : (
            Object.entries(groups).map(([date, items]) => (
              <section key={date}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{date}</h2>
                  <span className="text-xs font-semibold text-zinc-500">
                    ${items.reduce((s, d) => s + (d.driver_payout ?? 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="bg-[#111] rounded-2xl overflow-hidden border border-white/5 divide-y divide-white/5">
                  {items.map(d => {
                    const addr = d.delivery_address
                    return (
                      <Link key={d.id} href={`/orders/${d.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-[#FF7A50]/10 flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-[#FF7A50]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {d.food_maker?.display_name ?? 'Kitchen'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {addr?.city ? (
                              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                                <MapPin size={9} /> {addr.city}
                              </span>
                            ) : null}
                            <span className="text-zinc-700 text-[11px]">·</span>
                            <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                              <Clock size={9} />
                              {new Date(d.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-[#FF7A50] text-sm">+${(d.driver_payout ?? 0).toFixed(2)}</p>
                          <p className="text-[11px] text-zinc-600 mt-0.5">#{d.id.slice(-6).toUpperCase()}</p>
                        </div>
                        <ChevronRight size={14} className="text-zinc-500 flex-shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  )
}

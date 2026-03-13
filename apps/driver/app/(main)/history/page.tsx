'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Package, MapPin, Clock, ChevronRight } from 'lucide-react'

type Delivery = {
  id: string
  delivery_fee: number
  total: number
  status: string
  created_at: string
  delivery_address: { street?: string; city?: string; state?: string } | null
  food_maker: { display_name: string } | null
}

type Period = 'week' | 'month' | 'all'

const PERIOD_LABELS: Record<Period, string> = { week: 'This Week', month: 'This Month', all: 'All Time' }

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
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('orders')
        .select('id, delivery_fee, total, status, created_at, delivery_address, food_maker:food_makers(display_name)')
        .eq('nexter_id', user.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(100)

      setDeliveries((data as Delivery[]) ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const filtered = (() => {
    if (period === 'all') return deliveries
    const now = new Date()
    const cutoff = new Date()
    if (period === 'week') cutoff.setDate(now.getDate() - 7)
    else cutoff.setMonth(now.getMonth() - 1)
    return deliveries.filter(d => new Date(d.created_at) >= cutoff)
  })()

  const totalEarnings = filtered.reduce((s, d) => s + d.delivery_fee, 0)
  const groups = groupByDate(filtered)

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm px-4 h-14 flex items-center gap-3 border-b border-slate-700/40">
        <Link href="/" className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></Link>
        <h1 className="text-lg font-black text-white">Delivery History</h1>
      </header>

      {/* Period filter */}
      <div className="px-4 py-3">
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${period === p ? 'bg-[#FF6B35] text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="flex-1 p-4 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-2xl border border-slate-700/40 p-4 text-center">
              <p className="text-2xl font-black text-[#FF6B35]">${totalEarnings.toFixed(2)}</p>
              <p className="text-xs text-slate-500 mt-1">Total Earned</p>
            </div>
            <div className="bg-slate-800 rounded-2xl border border-slate-700/40 p-4 text-center">
              <p className="text-2xl font-black text-white">{filtered.length}</p>
              <p className="text-xs text-slate-500 mt-1">Deliveries</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center mb-4">
                <Package size={28} className="text-slate-600" />
              </div>
              <p className="text-slate-400 font-semibold">No deliveries yet</p>
              <p className="text-slate-600 text-sm mt-1">Your completed deliveries will appear here</p>
            </div>
          ) : (
            Object.entries(groups).map(([date, items]) => (
              <section key={date}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{date}</h2>
                  <span className="text-xs font-semibold text-slate-500">
                    ${items.reduce((s, d) => s + d.delivery_fee, 0).toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/40 divide-y divide-slate-700/40">
                  {items.map(d => {
                    const addr = d.delivery_address
                    return (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-9 h-9 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-[#FF6B35]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {d.food_maker?.display_name ?? 'Restaurant'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {addr?.city ? (
                              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                <MapPin size={9} /> {addr.city}
                              </span>
                            ) : null}
                            <span className="text-slate-700 text-[11px]">·</span>
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <Clock size={9} />
                              {new Date(d.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-[#FF6B35] text-sm">+${d.delivery_fee.toFixed(2)}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5">#{d.id.slice(-6).toUpperCase()}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-700 flex-shrink-0" />
                      </div>
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

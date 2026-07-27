'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { Package, MapPin, Clock, ChevronRight } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { Screen, SegmentedControl, StatCard } from '@/components/ui/kit'


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
    <Screen>
      <AppHeader title="History" showBack backHref="/account" />

      {/* Period filter */}
      <div className="px-5 py-3">
        <SegmentedControl
          options={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {loading ? (
        <div className="px-5 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="px-5 pb-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard value={`$${totalEarnings.toFixed(2)}`} label="Total Earned" accent />
            <StatCard value={String(filtered.length)} label="Deliveries" />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4">
                <Package size={28} className="text-on-surface-variant" />
              </div>
              <p className="text-on-surface font-semibold">No deliveries yet</p>
              <p className="text-on-surface-variant text-sm mt-1">Your completed deliveries will appear here</p>
            </div>
          ) : (
            Object.entries(groups).map(([date, items]) => (
              <section key={date}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="font-mono text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{date}</h2>
                  <span className="font-mono text-xs font-semibold text-primary">
                    ${items.reduce((s, d) => s + (d.driver_payout ?? 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="bg-surface-container-lowest rounded-xl overflow-hidden border border-outline-variant/30 divide-y divide-outline-variant/20">
                  {items.map(d => {
                    const addr = d.delivery_address
                    return (
                      <Link key={d.id} href={`/orders/${d.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-container-low transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center flex-shrink-0">
                          <Package size={18} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-on-surface truncate">
                            {d.food_maker?.display_name ?? 'Kitchen'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {addr?.city ? (
                              <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                                <MapPin size={10} /> {addr.city}
                              </span>
                            ) : null}
                            <span className="text-outline text-[11px]">·</span>
                            <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                              <Clock size={10} />
                              {new Date(d.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-neighborhood-green text-sm">+${(d.driver_payout ?? 0).toFixed(2)}</p>
                          <p className="font-mono text-[11px] text-outline mt-0.5">#{d.id.slice(-6).toUpperCase()}</p>
                        </div>
                        <ChevronRight size={16} className="text-on-surface-variant flex-shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </Screen>
  )
}

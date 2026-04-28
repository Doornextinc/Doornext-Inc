'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@doornext/ui/badge'
import type { Order, OrderStatus } from '@doornext/shared/types'
import { ChevronRight } from 'lucide-react'
import { playWithHaptic, initAudio } from '@/lib/notification-sounds'

type OrderRow = Pick<Order, 'id' | 'status' | 'total' | 'created_at'> & {
  order_items: Array<{ quantity: number; menu_item: { name: string } | null }>
}

const FILTER_TABS: Array<{ label: string; statuses: OrderStatus[] | null }> = [
  // Active = everything the maker still has responsibility for.
  // driver_assigned / arrived_at_maker are included so orders don't vanish the
  // moment a driver accepts — they stay until the driver confirms pickup.
  { label: 'Active',    statuses: ['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'arrived_at_maker'] },
  { label: 'Done',      statuses: ['picked_up', 'on_the_way', 'arrived_at_customer', 'delivered'] },
  { label: 'Cancelled', statuses: ['cancelled'] },
  { label: 'All',       statuses: null },
]

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const makerIdRef = useRef<string | null>(null)
  const knownIdsRef = useRef<Set<string>>(new Set())

  // Unlock audio context on mount
  useEffect(() => { initAudio() }, [])

  const loadOrders = useCallback(async (makerId: string, isRefresh = false) => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, total, created_at, maker_id, order_items(quantity, menu_item:menu_items(name))')
      .eq('maker_id', makerId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (fetchError) { setError('Failed to load orders'); setLoading(false); return }
    const rows = (data ?? []).filter(o => o.status !== 'awaiting_payment') as unknown as OrderRow[]

    if (isRefresh) {
      const newPending = rows.filter(o => o.status === 'pending' && !knownIdsRef.current.has(o.id))
      if (newPending.length > 0) playWithHaptic('order_received')
    }
    knownIdsRef.current = new Set(rows.map(o => o.id))
    setOrders(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: maker } = await supabase
        .from('food_makers').select('id').eq('user_id', user.id).single()
      if (!maker) { setError('Kitchen profile not found'); setLoading(false); return }
      makerIdRef.current = maker.id
      await loadOrders(maker.id)

      // Real-time subscription for new / updated orders
      const ch = supabase
        .channel('maker-orders-rt')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` },
          () => loadOrders(maker.id, true))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` },
          () => loadOrders(maker.id, false))
        .subscribe()

      return () => { supabase.removeChannel(ch) }
    }
    init()
  }, [router, loadOrders])

  const filter = FILTER_TABS[activeTab]
  const filtered = filter.statuses
    ? orders.filter((o) => filter.statuses!.includes(o.status as OrderStatus))
    : orders

  if (error) {
    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center">
          <h1 className="text-[18px] font-black text-gray-900">Orders</h1>
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
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center px-4 h-[60px]">
          <h1 className="text-[18px] font-black text-gray-900">Orders</h1>
          {!loading && (
            <span className="ml-2 text-sm font-semibold text-gray-400">({orders.length})</span>
          )}
        </div>
        <div className="flex gap-2 px-4 pb-3">
          {FILTER_TABS.map((tab, i) => {
            const count = tab.statuses
              ? orders.filter(o => tab.statuses!.includes(o.status as OrderStatus)).length
              : orders.length
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  activeTab === i
                    ? 'bg-[#FF6B35] text-white shadow-sm shadow-[#FF6B35]/30'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] ${activeTab === i ? 'opacity-80' : 'text-gray-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {loading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <p className="font-black text-gray-900 text-lg">No orders here</p>
          <p className="text-gray-400 text-sm mt-1">Nothing in this category yet</p>
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {filtered.map((order) => {
            const summary = order.order_items
              .map((oi) => `${oi.quantity}× ${oi.menu_item?.name ?? 'Item'}`)
              .join(', ')
            return (
              <button
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                className="w-full bg-white rounded-2xl px-4 py-3.5 text-left border border-gray-100 active:bg-orange-50/50 transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-black text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-2">{summary}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-[#FF6B35] text-base">${order.total.toFixed(2)}</span>
                    <span className="text-xs text-gray-300">
                      {new Date(order.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

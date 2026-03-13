'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@doornext/ui/badge'
import { toast } from '@/components/ui/toast'
import type { Order, FoodMaker, OrderStatus } from '@doornext/shared/types'
import { Power, ChevronRight } from 'lucide-react'

function playOrderAlert() {
  try {
    const ctx = new AudioContext()
    const times = [0, 0.15, 0.3]
    times.forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.12)
    })
  } catch {}
}

type OrderWithItems = Order & {
  order_items: Array<{ quantity: number; menu_item: { name: string } | null }>
}

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']

export default function DashboardPage() {
  const router = useRouter()
  const [maker, setMaker] = useState<FoodMaker | null>(null)
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const prevPendingCount = useRef(0)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const makerRes = await supabase.from('food_makers').select('*').eq('user_id', user.id).single()

    if (makerRes.data) {
      setMaker(makerRes.data)
      const ordersRes = await supabase
        .from('orders')
        .select('*, order_items(quantity, menu_item:menu_items(name))')
        .eq('maker_id', makerRes.data.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(50)
      setOrders((ordersRes.data ?? []) as OrderWithItems[])
    }
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const pendingNow = orders.filter((o) => o.status === 'pending').length
    if (!loading && pendingNow > prevPendingCount.current) {
      playOrderAlert()
      toast.info('New order received!')
    }
    prevPendingCount.current = pendingNow
  }, [orders, loading])

  useEffect(() => {
    if (!maker) return
    const supabase = createClient()
    const channel = supabase
      .channel('maker-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [maker, loadData])

  const toggleOpen = async () => {
    if (!maker || toggling) return
    setToggling(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('food_makers')
      .update({ is_open: !maker.is_open })
      .eq('id', maker.id)
      .select()
      .single()
    if (data) setMaker(data)
    setToggling(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <div className="bg-white px-4 h-[60px] flex items-center justify-between border-b border-gray-100">
          <div className="h-5 bg-gray-100 rounded-lg w-36 animate-pulse" />
          <div className="h-9 bg-gray-100 rounded-xl w-24 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  const pending = orders.filter((o) => o.status === 'pending')
  const preparing = orders.filter((o) => ['confirmed', 'preparing'].includes(o.status))
  const ready = orders.filter((o) => o.status === 'ready')
  const todayRevenue = orders.reduce((s, o) => s + (o.total ?? 0), 0)

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-[60px]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">D</span>
            </div>
            <div>
              <h1 className="text-[17px] font-black text-gray-900 leading-tight">{maker?.display_name}</h1>
              <p className="text-[11px] text-gray-400">{orders.length} active order{orders.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={toggleOpen}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 ${
              maker?.is_open
                ? 'bg-[#FF6B35] text-white shadow-md shadow-[#FF6B35]/30'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Power size={14} strokeWidth={2.5} />
            {maker?.is_open ? 'Open' : 'Closed'}
          </button>
        </div>

        {/* Today stats strip */}
        {orders.length > 0 && (
          <div className="flex border-t border-gray-100 divide-x divide-gray-100">
            <div className="flex-1 px-4 py-2 text-center">
              <p className="font-black text-gray-900 text-base leading-none">{orders.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Active</p>
            </div>
            <div className="flex-1 px-4 py-2 text-center">
              <p className="font-black text-gray-900 text-base leading-none">{pending.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Pending</p>
            </div>
            <div className="flex-1 px-4 py-2 text-center">
              <p className="font-black text-[#FF6B35] text-base leading-none">${todayRevenue.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Revenue</p>
            </div>
          </div>
        )}
      </header>

      <div className="p-4 space-y-5">
        {/* New Orders */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-[11px] font-black text-red-500 uppercase tracking-widest">
                New Orders ({pending.length})
              </h2>
            </div>
            <div className="space-y-2">
              {pending.map((order) => (
                <OrderCard key={order.id} order={order} accent="red" onClick={() => router.push(`/orders/${order.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* Preparing */}
        {preparing.length > 0 && (
          <section>
            <h2 className="text-[11px] font-black text-amber-500 uppercase tracking-widest mb-3">
              Preparing ({preparing.length})
            </h2>
            <div className="space-y-2">
              {preparing.map((order) => (
                <OrderCard key={order.id} order={order} accent="amber" onClick={() => router.push(`/orders/${order.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* Ready for pickup */}
        {ready.length > 0 && (
          <section>
            <h2 className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-3">
              Ready for Pickup ({ready.length})
            </h2>
            <div className="space-y-2">
              {ready.map((order) => (
                <OrderCard key={order.id} order={order} accent="green" onClick={() => router.push(`/orders/${order.id}`)} />
              ))}
            </div>
          </section>
        )}

        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-50 to-white border border-orange-100 flex items-center justify-center mb-5 shadow-sm">
              <span className="text-4xl">🍽️</span>
            </div>
            <h3 className="text-xl font-black text-gray-900">No active orders</h3>
            <p className="text-gray-400 text-sm mt-1.5">
              {maker?.is_open ? 'Waiting for new orders…' : 'Kitchen is closed'}
            </p>
            {!maker?.is_open && (
              <button
                onClick={toggleOpen}
                className="mt-5 bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl px-6 py-3 font-bold text-sm shadow-md shadow-[#FF6B35]/30 transition-colors"
              >
                Open Kitchen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OrderCard({ order, accent, onClick }: {
  order: OrderWithItems
  accent: 'red' | 'amber' | 'green'
  onClick: () => void
}) {
  const itemsSummary = order.order_items
    .map((oi) => `${oi.quantity}× ${oi.menu_item?.name ?? 'Item'}`)
    .join(', ')

  const leftBorderColor = accent === 'red' ? '#EF4444' : accent === 'amber' ? '#F59E0B' : '#10B981'

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 text-left border border-gray-100 active:bg-orange-50/50 transition-colors flex items-center gap-3"
      style={{ borderLeft: `3px solid ${leftBorderColor}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="font-black text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</p>
          <span className="text-xs text-gray-400">
            {new Date(order.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate mb-2">{itemsSummary}</p>
        <div className="flex items-center justify-between">
          <span className="font-black text-[#FF6B35] text-base">${order.total.toFixed(2)}</span>
          <StatusBadge status={order.status} />
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  )
}

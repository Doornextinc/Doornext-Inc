'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@doornext/ui/badge'
import { toast } from '@/components/ui/toast'
import type { Order, FoodMaker, OrderStatus } from '@doornext/shared/types'
import { Power } from 'lucide-react'

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
  const prevPendingCount = useRef(0)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [makerRes, ordersRes] = await Promise.all([
      supabase.from('food_makers').select('*').eq('user_id', user.id).single(),
      supabase
        .from('orders')
        .select('*, order_items(quantity, menu_item:menu_items(name))')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (makerRes.data) {
      setMaker(makerRes.data)
      // Filter orders for this maker
      const myOrders = (ordersRes.data ?? []).filter(
        (o) => o.maker_id === makerRes.data.id &&
          ACTIVE_STATUSES.includes(o.status as OrderStatus)
      )
      setOrders(myOrders as OrderWithItems[])
    }
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Alert when pending order count increases
  useEffect(() => {
    const pendingNow = orders.filter((o) => o.status === 'pending').length
    if (!loading && pendingNow > prevPendingCount.current) {
      playOrderAlert()
      toast.info(`🍽️ New order received!`)
    }
    prevPendingCount.current = pendingNow
  }, [orders, loading])

  // Realtime subscription for new orders
  useEffect(() => {
    if (!maker) return
    const supabase = createClient()
    const channel = supabase
      .channel('maker-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` },
        () => loadData()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [maker, loadData])

  const toggleOpen = async () => {
    if (!maker) return
    const supabase = createClient()
    const { data } = await supabase
      .from('food_makers')
      .update({ is_open: !maker.is_open })
      .eq('id', maker.id)
      .select()
      .single()
    if (data) setMaker(data)
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-gray-100">
          <div className="h-6 bg-gray-200 rounded w-32 animate-pulse" />
          <div className="h-9 bg-gray-200 rounded-xl w-24 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  const pending = orders.filter((o) => o.status === 'pending')
  const active = orders.filter((o) => ['confirmed', 'preparing'].includes(o.status))
  const ready = orders.filter((o) => o.status === 'ready')

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 z-40">
        <div>
          <h1 className="text-lg font-black text-gray-900">{maker?.display_name}</h1>
          <p className="text-xs text-gray-400">
            {orders.length} active order{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={toggleOpen}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            maker?.is_open
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          <Power size={15} />
          {maker?.is_open ? 'Open' : 'Closed'}
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* New Orders */}
        {pending.length > 0 && (
          <section>
            <h2 className="font-bold text-red-500 text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              New Orders ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((order) => (
                <OrderCard key={order.id} order={order} onClick={() => router.push(`/orders/${order.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* In Progress */}
        {active.length > 0 && (
          <section>
            <h2 className="font-bold text-orange-500 text-sm mb-3">Preparing ({active.length})</h2>
            <div className="space-y-3">
              {active.map((order) => (
                <OrderCard key={order.id} order={order} onClick={() => router.push(`/orders/${order.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* Ready */}
        {ready.length > 0 && (
          <section>
            <h2 className="font-bold text-purple-500 text-sm mb-3">Ready for Pickup ({ready.length})</h2>
            <div className="space-y-3">
              {ready.map((order) => (
                <OrderCard key={order.id} order={order} onClick={() => router.push(`/orders/${order.id}`)} />
              ))}
            </div>
          </section>
        )}

        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl mb-4">🍽️</span>
            <h3 className="text-xl font-bold text-gray-700">No active orders</h3>
            <p className="text-gray-400 text-sm mt-1">
              {maker?.is_open ? 'Waiting for new orders…' : 'You are currently closed'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function OrderCard({ order, onClick }: { order: OrderWithItems; onClick: () => void }) {
  const itemsSummary = order.order_items
    .map((oi) => `${oi.quantity}x ${oi.menu_item?.name ?? 'Item'}`)
    .join(', ')

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 text-left shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="font-bold text-gray-900 text-sm">Order #{order.id.slice(-6).toUpperCase()}</p>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-xs text-gray-500 truncate mb-2">{itemsSummary}</p>
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-900">${order.total.toFixed(2)}</span>
        <span className="text-xs text-gray-400">
          {new Date(order.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
    </button>
  )
}

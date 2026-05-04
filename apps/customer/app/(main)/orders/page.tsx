'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, ChevronRight, RotateCcw } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import type { Order, OrderStatus } from '@/types'

interface OrderWithMaker extends Omit<Order, 'food_maker' | 'order_items'> {
  food_maker: { display_name: string; id: string } | null
  order_items: Array<{
    quantity: number
    unit_price: number
    menu_item: { id: string; name: string; price: number; maker_id: string; dietary_tags: string[]; is_available: boolean; prep_time_mins: number; category: string | null; description: string | null; photo_url: string | null; daily_limit: number | null }
  }>
}

function formatOrderDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / 86400000)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today · ${time}`
  if (days === 1) return `Yesterday · ${time}`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` · ${time}`
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker',
  'picked_up', 'on_the_way', 'arrived_at_customer',
]

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderWithMaker[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | false>(false)
  const [reorderConfirmId, setReorderConfirmId] = useState<string | null>(null)
  const addItem = useCartStore((s) => s.addItem)
  const clearCart = useCartStore((s) => s.clearCart)

  const loadOrders = useCallback(async () => {
    setLoadError(false as false)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) { setLoading(false); return }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          food_maker:food_makers(id, display_name),
          order_items(
            quantity,
            unit_price,
            menu_item:menu_items(*)
          )
        `)
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Failed to load orders:', JSON.stringify(error))
        setLoadError(error.message ?? 'Unknown error')
      } else if (data) {
        console.log(`[Orders] fetched ${data.length} orders for user ${userId}`)
        setOrders(data as OrderWithMaker[])
      }
    } catch (e) {
      console.error('Failed to load orders:', e)
      setLoadError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  // Re-trigger load once auth session is confirmed (handles mount-before-session timing)
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') loadOrders()
    })
    return () => subscription.unsubscribe()
  }, [loadOrders])

  useEffect(() => {
    const supabase = createClient()
    // Keep a ref to the channel so the cleanup function (which runs synchronously)
    // can always remove it — even when auth resolves after the component unmounts.
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id
      if (!userId) return
      channel = supabase
        .channel('customer-orders-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` },
          () => { loadOrders() }
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [loadOrders])

  const handleReorder = (order: OrderWithMaker) => {
    setReorderConfirmId(null)
    clearCart()
    for (const oi of order.order_items) {
      if (oi.menu_item) {
        addItem(oi.menu_item, order.maker_id, order.food_maker?.display_name ?? 'Unknown Kitchen')
      }
    }
    router.push('/cart')
  }

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status as OrderStatus))
  const pastOrders = orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled' || o.status === 'failed_delivery')

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f9fafb]">
        <TopBar title="Orders" showCart={false} />
        <div className="flex-1 px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col min-h-full bg-[#f9fafb]">
        <TopBar title="Orders" showCart={false} />
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <span className="text-5xl mb-4">⚠️</span>
          <h2 className="heading-lg text-gray-700">Failed to load orders</h2>
          <p className="text-gray-400 text-sm mt-2 mb-2">Check your connection and try again</p>
          {typeof loadError === 'string' && (
            <p className="text-red-400 text-xs font-mono mt-1 mb-6 max-w-xs break-all">{loadError}</p>
          )}
          <Button onClick={loadOrders} size="lg">Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f9fafb]">
      <TopBar title="Orders" showCart={false} />

      <div className="flex-1 px-4 py-4 space-y-5 page-enter">
        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[#FF6B35] rounded-full animate-pulse" />
              <h2 className="font-bold text-gray-900 text-[15px]">Active</h2>
            </div>
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="w-full bg-white rounded-2xl p-4 border-2 border-orange-100 text-left active:bg-orange-50 transition-colors pulse-ring"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <p className="font-bold text-gray-900 text-[15px]">
                        {order.food_maker?.display_name ?? 'Unknown Kitchen'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatOrderDate(order.created_at)}</p>
                    </div>
                    <StatusBadge status={order.status as OrderStatus} />
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-3">
                    {order.order_items.map((oi) => `${oi.quantity}× ${oi.menu_item?.name ?? 'Item'}`).join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">${order.total.toFixed(2)}</span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-[#FF6B35]">
                      Track order <ChevronRight size={13} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Past Orders */}
        {pastOrders.length > 0 && (
          <section>
            <h2 className="font-bold text-gray-500 text-[13px] mb-3 uppercase tracking-wide">Past Orders</h2>
            <div className="space-y-3">
              {pastOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 active:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-gray-900 text-[14px]">{order.food_maker?.display_name ?? 'Unknown Kitchen'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatOrderDate(order.created_at)}</p>
                    </div>
                    <StatusBadge status={order.status as OrderStatus} />
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-3">
                    {order.order_items.map((oi) => `${oi.quantity}× ${oi.menu_item?.name ?? 'Item'}`).join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm">${order.total.toFixed(2)}</span>
                    {order.status === 'delivered' && (
                      reorderConfirmId === order.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setReorderConfirmId(null)}
                            className="text-xs text-gray-400 font-semibold px-2 py-1.5"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReorder(order)}
                            className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#FF6B35] px-3.5 py-2 rounded-full"
                          >
                            <RotateCcw size={11} />
                            Confirm reorder
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setReorderConfirmId(order.id)}
                          className="flex items-center gap-1.5 text-xs text-[#FF6B35] font-semibold bg-orange-50 px-3.5 py-2 rounded-full"
                        >
                          <RotateCcw size={11} />
                          Reorder
                        </button>
                      )
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
              <ShoppingBag size={36} className="text-gray-300" />
            </div>
            <h2 className="heading-lg text-gray-700">No orders yet</h2>
            <p className="text-gray-400 text-sm mt-2 mb-7">Your order history will appear here</p>
            <Button onClick={() => router.push('/')} size="lg">Browse Makers</Button>
          </div>
        )}
      </div>
    </div>
  )
}

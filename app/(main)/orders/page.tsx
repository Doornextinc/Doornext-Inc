'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, ChevronRight, RotateCcw } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import { getMakerEmoji } from '@/lib/mock-data'
import type { Order, OrderStatus } from '@/types'

interface OrderWithMaker extends Omit<Order, 'food_maker' | 'order_items'> {
  food_maker: { display_name: string; id: string }
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
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`
}

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way']

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderWithMaker[]>([])
  const [loading, setLoading] = useState(true)
  const addItem = useCartStore((s) => s.addItem)
  const clearCart = useCartStore((s) => s.clearCart)

  const loadOrders = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

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
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!error && data) {
        setOrders(data as OrderWithMaker[])
      }
    } catch (e) {
      console.error('Failed to load orders:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleReorder = (order: OrderWithMaker) => {
    clearCart()
    for (const oi of order.order_items) {
      if (oi.menu_item) {
        addItem(
          oi.menu_item,
          order.maker_id,
          order.food_maker.display_name
        )
      }
    }
    router.push('/cart')
  }

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status as OrderStatus))
  const pastOrders = orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled')

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <TopBar title="Your Orders" showCart={false} />
        <div className="flex-1 px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar title="Your Orders" showCart={false} />

      <div className="flex-1 px-4 py-4 space-y-5">
        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <section>
            <h2 className="font-bold text-gray-700 text-sm mb-3">Active</h2>
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#FF6B35]/20 text-left active:bg-orange-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getMakerEmoji(order.maker_id)}</span>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{order.food_maker.display_name}</p>
                        <p className="text-xs text-gray-400">{formatOrderDate(order.created_at)}</p>
                      </div>
                    </div>
                    <StatusBadge status={order.status as OrderStatus} />
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-2">
                    {order.order_items.map((oi) => `${oi.quantity}x ${oi.menu_item?.name ?? 'Item'}`).join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">${order.total.toFixed(2)}</span>
                    <span className="text-xs text-[#FF6B35] font-semibold flex items-center gap-1">
                      Track Order <ChevronRight size={12} />
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
            <h2 className="font-bold text-gray-700 text-sm mb-3">Past Orders</h2>
            <div className="space-y-3">
              {pastOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getMakerEmoji(order.maker_id)}</span>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{order.food_maker.display_name}</p>
                        <p className="text-xs text-gray-400">{formatOrderDate(order.created_at)}</p>
                      </div>
                    </div>
                    <StatusBadge status={order.status as OrderStatus} />
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-3">
                    {order.order_items.map((oi) => `${oi.quantity}x ${oi.menu_item?.name ?? 'Item'}`).join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700 text-sm">${order.total.toFixed(2)}</span>
                    {order.status === 'delivered' && (
                      <button
                        onClick={() => handleReorder(order)}
                        className="flex items-center gap-1.5 text-xs text-[#FF6B35] font-semibold bg-orange-50 px-3 py-1.5 rounded-full"
                      >
                        <RotateCcw size={11} />
                        Reorder
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {orders.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag size={60} className="text-gray-200 mb-4" />
            <h2 className="text-xl font-bold text-gray-700">No orders yet</h2>
            <p className="text-gray-400 text-sm mt-1 mb-6">Your order history will appear here</p>
            <Button onClick={() => router.push('/')} size="lg">Browse Makers</Button>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, ChevronRight, RotateCcw } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const MOCK_PAST_ORDERS: Array<{
  id: string
  maker_name: string
  date: string
  status: import('@/types').OrderStatus
  total: number
  items: string[]
  emoji: string
}> = [
  {
    id: 'order_abc123',
    maker_name: "Mama Adaeze's Kitchen",
    date: 'Today, 6:30 PM',
    status: 'on_the_way',
    total: 53.56,
    items: ['Jollof Rice + Chicken ×2', 'Puff Puff ×1'],
    emoji: '🍲',
  },
  {
    id: 'order_def456',
    maker_name: "Rosa's Mexican Cocina",
    date: 'Yesterday, 7:15 PM',
    status: 'delivered',
    total: 28.50,
    items: ['Mole Negro Enchiladas ×1', 'Tamales ×1'],
    emoji: '🌮',
  },
  {
    id: 'order_ghi789',
    maker_name: "Miss Bonnie's Soul Food",
    date: 'Mar 8, 6:00 PM',
    status: 'delivered',
    total: 41.20,
    items: ['Fried Chicken & Waffles ×1', 'Mac & Cheese ×2'],
    emoji: '🍗',
  },
  {
    id: 'order_jkl012',
    maker_name: "Ming's Dim Sum",
    date: 'Mar 5, 12:30 PM',
    status: 'delivered',
    total: 35.00,
    items: ['Pork Dumplings ×2', 'BBQ Pork Bao ×2'],
    emoji: '🥟',
  },
]

export default function OrdersPage() {
  const router = useRouter()
  const activeOrders = MOCK_PAST_ORDERS.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  )
  const pastOrders = MOCK_PAST_ORDERS.filter(
    (o) => o.status === 'delivered' || o.status === 'cancelled'
  )

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
                      <span className="text-2xl">{order.emoji}</span>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">
                          {order.maker_name}
                        </p>
                        <p className="text-xs text-gray-400">{order.date}</p>
                      </div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-2">
                    {order.items.join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">
                      ${order.total.toFixed(2)}
                    </span>
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
                      <span className="text-xl">{order.emoji}</span>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">
                          {order.maker_name}
                        </p>
                        <p className="text-xs text-gray-400">{order.date}</p>
                      </div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-3">
                    {order.items.join(', ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700 text-sm">
                      ${order.total.toFixed(2)}
                    </span>
                    <button className="flex items-center gap-1.5 text-xs text-[#FF6B35] font-semibold bg-orange-50 px-3 py-1.5 rounded-full">
                      <RotateCcw size={11} />
                      Reorder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {MOCK_PAST_ORDERS.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag size={60} className="text-gray-200 mb-4" />
            <h2 className="text-xl font-bold text-gray-700">No orders yet</h2>
            <p className="text-gray-400 text-sm mt-1 mb-6">
              Your order history will appear here
            </p>
            <Button onClick={() => router.push('/')} size="lg">
              Browse Makers
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

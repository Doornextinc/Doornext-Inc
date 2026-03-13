'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@doornext/ui/badge'
import type { Order, OrderStatus } from '@doornext/shared/types'
import { ChevronLeft, Check, X, ChefHat, Bell } from 'lucide-react'

type OrderDetail = Order & {
  order_items: Array<{
    quantity: number
    unit_price: number
    customization_notes: string | null
    menu_item: { name: string; description: string | null } | null
  }>
}

const STATUS_FLOW: Record<string, { next: OrderStatus; label: string; color: string }> = {
  pending: { next: 'confirmed', label: 'Accept Order', color: 'bg-blue-500' },
  confirmed: { next: 'preparing', label: 'Start Preparing', color: 'bg-orange-500' },
  preparing: { next: 'ready', label: 'Mark as Ready', color: 'bg-purple-500' },
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(
            quantity,
            unit_price,
            customization_notes,
            menu_item:menu_items(name, description)
          )
        `)
        .eq('id', id)
        .single()
      if (data) setOrder(data as OrderDetail)
      setLoading(false)
    }
    load()
  }, [id])

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (!order) return
    setUpdating(true)
    const res = await fetch('/api/maker/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, status: newStatus }),
    })
    if (res.ok) {
      setOrder((prev) => prev ? { ...prev, status: newStatus } : prev)
    }
    setUpdating(false)
  }

  const handleReject = async () => {
    if (!order) return
    setUpdating(true)
    await fetch('/api/maker/reject-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    })
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <div className="bg-white px-4 h-14 flex items-center border-b border-gray-100 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-40" />
        </div>
      </div>
    )
  }

  if (!order) return <div className="p-8 text-center text-gray-400">Order not found</div>

  const nextStep = STATUS_FLOW[order.status]

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-14">
        <button
          aria-label="Go back"
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="font-bold text-gray-900">Order #{order.id.slice(-6).toUpperCase()}</h1>
        <StatusBadge status={order.status} />
      </header>

      <div className="p-4 space-y-4">
        {/* Order items */}
        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <ChefHat size={16} className="text-[#FF6B35]" />
            <h2 className="font-bold text-gray-900 text-sm">Items to Prepare</h2>
          </div>
          {order.order_items.map((oi, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-50 last:border-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    <span className="text-[#FF6B35] font-black">{oi.quantity}×</span>{' '}
                    {oi.menu_item?.name ?? 'Item'}
                  </p>
                  {oi.customization_notes && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mt-1 inline-block">
                      Note: {oi.customization_notes}
                    </p>
                  )}
                </div>
                <span className="font-bold text-gray-900 text-sm">
                  ${(oi.unit_price * oi.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery address */}
        <div className="bg-white rounded-2xl px-4 py-4">
          <h2 className="font-bold text-gray-900 text-sm mb-2">Delivery Address</h2>
          <p className="text-sm text-gray-600">
            {typeof order.delivery_address === 'object'
              ? `${order.delivery_address.street}, ${order.delivery_address.city}`
              : 'Address on file'}
          </p>
        </div>

        {/* Order summary */}
        <div className="bg-white rounded-2xl px-4 py-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Subtotal</span>
            <span>${order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-gray-900 mt-2 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {nextStep && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-6 flex gap-3">
          {order.status === 'pending' && (
            <button
              onClick={handleReject}
              disabled={updating}
              className="flex-1 bg-white border border-red-200 text-red-500 rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:bg-red-50 disabled:opacity-50"
            >
              <X size={18} />
              Reject
            </button>
          )}
          <button
            onClick={() => handleStatusUpdate(nextStep.next)}
            disabled={updating}
            className={`flex-1 ${nextStep.color} text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:opacity-90`}
          >
            {order.status === 'preparing' ? <Bell size={18} /> : <Check size={18} />}
            {updating ? 'Updating…' : nextStep.label}
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus } from '@doornext/shared/types'
import { ChevronLeft, Check, X, ChefHat, MapPin, Clock } from 'lucide-react'

type OrderDetail = Order & {
  order_items: Array<{
    quantity: number
    unit_price: number
    customization_notes: string | null
    menu_item: { name: string; description: string | null } | null
  }>
}

const STATUS_FLOW: Record<string, { next: OrderStatus; label: string }> = {
  pending:   { next: 'confirmed', label: 'Accept Order' },
  confirmed: { next: 'preparing', label: 'Start Preparing' },
  preparing: { next: 'ready',     label: 'Mark as Ready' },
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready:     'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-100',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
  preparing: 'bg-purple-50 text-purple-700 border-purple-100',
  ready:     'bg-emerald-50 text-emerald-700 border-emerald-100',
  delivered: 'bg-[#F5F4F2] text-[#666] border-[#EBEBEB]',
  cancelled: 'bg-red-50 text-red-500 border-red-100',
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
    if (res.ok) setOrder((prev) => prev ? { ...prev, status: newStatus } : prev)
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
      <div className="flex flex-col min-h-full bg-[#F5F4F2]">
        <div className="bg-white px-4 h-[60px] flex items-center border-b border-[#EBEBEB] animate-pulse">
          <div className="h-5 bg-[#EBEBEB] rounded w-40" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full bg-[#F5F4F2]">
        <header className="sticky top-0 z-40 bg-white border-b border-[#EBEBEB] px-4 h-[60px] flex items-center gap-3">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-[#F5F4F2] flex items-center justify-center">
            <ChevronLeft size={18} className="text-[#555]" />
          </button>
          <h1 className="text-[18px] font-black text-[#111]">Order</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-[#AAA] text-sm">Order not found</div>
      </div>
    )
  }

  const nextStep = STATUS_FLOW[order.status]
  const statusStyle = STATUS_STYLES[order.status] ?? 'bg-[#F5F4F2] text-[#666] border-[#EBEBEB]'
  const shortId = order.id.slice(-6).toUpperCase()

  return (
    <div className="flex flex-col min-h-full bg-[#F5F4F2]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#EBEBEB] px-4 h-[60px] flex items-center justify-between gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-[#F5F4F2] flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft size={18} className="text-[#555]" />
        </button>
        <h1 className="text-[18px] font-black text-[#111] flex-1">#{shortId}</h1>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${statusStyle}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </header>

      <div className="p-4 space-y-3 pb-32">

        {/* Order time */}
        <div className="flex items-center gap-2 text-xs text-[#AAA] px-1">
          <Clock size={12} />
          <span>
            {new Date(order.created_at).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </span>
        </div>

        {/* Items */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <ChefHat size={11} /> Items to Prepare
          </p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] divide-y divide-[#F5F4F2]">
            {order.order_items.map((oi, i) => (
              <div key={i} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#111] text-sm">
                      <span className="font-black">{oi.quantity}×</span>{' '}
                      {oi.menu_item?.name ?? 'Item'}
                    </p>
                    {oi.customization_notes && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1 mt-1.5 inline-block">
                        {oi.customization_notes}
                      </p>
                    )}
                  </div>
                  <span className="font-bold text-[#111] text-sm flex-shrink-0">
                    ${(oi.unit_price * oi.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Delivery address */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2 flex items-center gap-2">
            <MapPin size={11} /> Delivery Address
          </p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3.5">
            <p className="text-sm text-[#333]">
              {typeof order.delivery_address === 'object' && order.delivery_address
                ? `${(order.delivery_address as { street?: string }).street ?? ''}, ${(order.delivery_address as { city?: string }).city ?? ''}`
                : 'Address on file'}
            </p>
          </div>
        </section>

        {/* Summary */}
        <section>
          <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2">Summary</p>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-4 space-y-2">
            <div className="flex justify-between text-sm text-[#666]">
              <span>Subtotal</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            {(order as { delivery_fee?: number }).delivery_fee != null && (
              <div className="flex justify-between text-sm text-[#666]">
                <span>Delivery fee</span>
                <span>${((order as { delivery_fee?: number }).delivery_fee ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-[#111] pt-2 border-t border-[#F5F4F2]">
              <span>Total</span>
              <span>${order.total.toFixed(2)}</span>
            </div>
          </div>
        </section>

      </div>

      {/* Action bar */}
      {nextStep && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-6 pt-3 bg-gradient-to-t from-[#F5F4F2] via-[#F5F4F2] to-transparent">
          <div className="flex gap-3">
            {order.status === 'pending' && (
              <button
                onClick={handleReject}
                disabled={updating}
                className="flex-1 bg-white border border-[#EBEBEB] text-red-500 rounded-xl py-4 font-bold text-sm flex items-center justify-center gap-2 active:bg-red-50 disabled:opacity-50"
              >
                <X size={16} />
                Reject
              </button>
            )}
            <button
              onClick={() => handleStatusUpdate(nextStep.next)}
              disabled={updating}
              className="flex-1 bg-[#111] text-white rounded-xl py-4 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:bg-[#333]"
            >
              <Check size={16} />
              {updating ? 'Updating…' : nextStep.label}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

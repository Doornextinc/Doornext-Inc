'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppHeader } from '@/components/layout/app-header'
import {
  MapPin, Package, DollarSign, Clock, CheckCircle, Store, MessageSquare,
} from 'lucide-react'

type OrderDetail = {
  id: string
  status: string
  created_at: string
  delivery_fee: number
  tip_amount: number
  driver_payout: number
  total: number
  dropoff_note: string | null
  delivery_address: { street?: string; city?: string; state?: string; zip?: string; label?: string } | null
  food_maker: { display_name: string } | null
  order_items: Array<{
    quantity: number
    unit_price: number
    menu_items: { name: string } | null
  }>
}

export default function DriverOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('orders')
        .select(`
          id, status, created_at, delivery_fee, tip_amount, driver_payout, total,
          dropoff_note, delivery_address,
          food_maker:food_makers(display_name),
          order_items(quantity, unit_price, menu_items(name))
        `)
        .eq('id', id)
        .eq('nexter_id', user.id)
        .single()

      setOrder(data as unknown as OrderDetail ?? null)
      setLoading(false)
    }
    load()
  }, [id, router])

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Delivery" showBack />
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[#141414] rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Delivery" showBack />
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          Delivery not found
        </div>
      </div>
    )
  }

  const addr = order.delivery_address
  const earn = order.driver_payout > 0 ? order.driver_payout : order.delivery_fee
  const tip = order.tip_amount ?? 0

  return (
    <div className="flex flex-col min-h-full pb-6">
      <AppHeader title={`#${order.id.slice(-6).toUpperCase()}`} showBack />

      <div className="p-4 space-y-3">

        {/* Status + date */}
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-sm font-bold text-green-400 capitalize">
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              {new Date(order.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Earnings */}
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={15} className="text-[#FF7A50]" />
            <h2 className="text-xs font-black text-white uppercase tracking-wide">Your Earnings</h2>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Base pay</span>
              {/* driver_payout already includes tip — subtract to show base */}
              <span>${(earn - tip).toFixed(2)}</span>
            </div>
            {tip > 0 && (
              <div className="flex justify-between text-green-400 font-semibold">
                <span>Tip</span>
                <span>+${tip.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-white/8 flex justify-between">
            <span className="text-xs text-zinc-500">Total earned</span>
            {/* earn = driver_payout (base + tip inclusive) */}
            <span className="font-black text-[#FF7A50] text-lg">${earn.toFixed(2)}</span>
          </div>
        </div>

        {/* Pickup location */}
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Store size={15} className="text-[#FF7A50]" />
            <h2 className="text-xs font-black text-white uppercase tracking-wide">Picked Up From</h2>
          </div>
          <p className="text-sm font-bold text-white">
            {order.food_maker?.display_name ?? 'Restaurant'}
          </p>
        </div>

        {/* Delivery address */}
        {addr && (
          <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={15} className="text-[#FF7A50]" />
              <h2 className="text-xs font-black text-white uppercase tracking-wide">Delivered To</h2>
            </div>
            <p className="text-sm font-bold text-white">{addr.street}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}
            </p>
            {addr.label && (
              <p className="text-xs text-zinc-600 mt-0.5 italic">{addr.label}</p>
            )}
          </div>
        )}

        {/* Drop-off instructions */}
        {order.dropoff_note && (
          <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={15} className="text-[#FF7A50]" />
              <h2 className="text-xs font-black text-white uppercase tracking-wide">Drop-off Instructions</h2>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{order.dropoff_note}</p>
          </div>
        )}

        {/* Order items */}
        {order.order_items.length > 0 && (
          <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/5">
              <Package size={15} className="text-[#FF7A50]" />
              <h2 className="text-xs font-black text-white uppercase tracking-wide">
                Items Delivered
              </h2>
            </div>
            <div className="divide-y divide-white/5">
              {order.order_items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-zinc-300">
                    <span className="font-bold text-white mr-1">{item.quantity}×</span>
                    {item.menu_items?.name ?? 'Item'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    ${(item.unit_price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-xs text-zinc-500">Order total</span>
              <span className="text-sm font-bold text-zinc-300">${order.total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Order ID */}
        <div className="flex items-center justify-center gap-2 py-2">
          <Clock size={11} className="text-zinc-700" />
          <p className="text-[11px] text-zinc-700 font-mono">{order.id}</p>
        </div>

      </div>
    </div>
  )
}

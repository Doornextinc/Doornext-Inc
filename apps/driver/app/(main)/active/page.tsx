'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import type { OrderStatus } from '@doornext/shared/types'
import { MapPin, Phone, CheckCircle, Navigation, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'

type OrderItem = { quantity: number; unit_price: number; menu_items: { name: string } | null }
type ActiveOrder = {
  id: string; status: string; delivery_fee: number; tip_amount: number
  delivery_address: { street?: string; city?: string; state?: string; zip?: string; label?: string } | null
  food_maker: { display_name: string; lat: number; lng: number } | null
  customer: { full_name: string; phone: string | null } | null
  order_items: OrderItem[]
  updated_at: string
}

const STEPS: Array<{ status: string; label: string; sublabel: string }> = [
  { status: 'picked_up', label: 'Picked Up', sublabel: 'At restaurant' },
  { status: 'on_the_way', label: 'Driving', sublabel: 'En route' },
  { status: 'delivered', label: 'Delivered', sublabel: 'Complete' },
]

const NEXT_ACTION: Record<string, { next: OrderStatus; label: string; color: string }> = {
  picked_up: { next: 'on_the_way', label: 'Start Driving', color: 'bg-[#D4622B] shadow-[#D4622B]/30' },
  on_the_way: { next: 'delivered', label: 'Confirm Delivery', color: 'bg-green-500 shadow-green-500/30' },
}

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ActiveDeliveryPage() {
  const router = useRouter()
  const { setActiveOrder, setLocation } = useDriverStore()
  const [order, setOrder] = useState<ActiveOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [showItems, setShowItems] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const broadcastLocation = useCallback(async () => {
    if (typeof navigator === 'undefined') return
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      setLocation(lat, lng)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('nexter_locations').upsert(
        { nexter_id: user.id, lat, lng, updated_at: new Date().toISOString() },
        { onConflict: 'nexter_id' }
      )
    })
  }, [setLocation])

  const loadActiveOrder = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(quantity, unit_price, menu_items(name)), food_maker:food_makers(display_name, lat, lng), customer:users!orders_customer_id_fkey(full_name, phone)`)
      .eq('nexter_id', user.id)
      .in('status', ['picked_up', 'on_the_way'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) { setOrder(data as ActiveOrder); setActiveOrder(data.id) }
    else setActiveOrder(null)
    setLoading(false)
  }, [router, setActiveOrder])

  useEffect(() => { loadActiveOrder() }, [loadActiveOrder])

  useEffect(() => {
    if (!order) return
    broadcastLocation()
    locationIntervalRef.current = setInterval(broadcastLocation, 10_000)
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current) }
  }, [order, broadcastLocation])

  useEffect(() => {
    if (!order) return
    const start = new Date(order.updated_at).getTime()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [order])

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (!order) return
    // For pickup: verify all items checked
    if (order.status === 'picked_up' && order.order_items.length > 0 && checkedItems.size < order.order_items.length) {
      const confirmed = window.confirm(`You haven't checked all ${order.order_items.length} items. Continue anyway?`)
      if (!confirmed) return
    }
    setUpdating(true)
    const res = await fetch('/api/driver/update-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, status: newStatus }),
    })
    if (res.ok) {
      if (newStatus === 'delivered') {
        await fetch('/api/driver/complete-delivery', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id }),
        })
        setActiveOrder(null)
        router.push('/')
      } else {
        setOrder(prev => prev ? { ...prev, status: newStatus } : prev)
      }
    }
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Active Delivery" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-[3px] border-[#D4622B] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Active Delivery" />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-24 h-24 rounded-3xl bg-[#141414] border border-white/5 flex items-center justify-center mb-6">
            <Package size={44} className="text-zinc-600" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">No active delivery</h2>
          <p className="text-zinc-500 text-base mb-8">Accept a pickup to start delivering</p>
          <button onClick={() => router.push('/available')} className="bg-[#D4622B] text-white rounded-2xl px-10 py-4 font-black text-base shadow-lg shadow-[#D4622B]/20">
            Find Pickups
          </button>
        </div>
      </div>
    )
  }

  const nextAction = NEXT_ACTION[order.status]
  const addr = order.delivery_address
  const currentStepIdx = STEPS.findIndex(s => s.status === order.status)
  const earn = (order.delivery_fee ?? 0) + (order.tip_amount ?? 0)

  return (
    <div className="flex flex-col min-h-full pb-[140px]">
      <AppHeader title="Active Delivery" />
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#0A0A0A]">
        <span className="text-xs text-zinc-600">Delivery in progress</span>
        <div className="flex items-center gap-2 bg-[#141414] rounded-full px-3 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4622B] animate-pulse" />
          <span className="font-mono text-xs font-bold text-white">{formatElapsed(elapsed)}</span>
        </div>
      </div>

      {/* Progress stepper */}
      <div className="px-5 py-5">
        <div className="flex items-start">
          {STEPS.map((step, i) => {
            const done = i < currentStepIdx; const active = i === currentStepIdx; const upcoming = i > currentStepIdx
            return (
              <div key={step.status} className="flex-1 flex flex-col items-center">
                <div className="flex items-center w-full">
                  {i > 0 && <div className={`flex-1 h-0.5 rounded-full transition-colors ${done || active ? 'bg-[#D4622B]' : 'bg-[#1A1A1A]'}`} />}
                  <div className={`relative w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${done ? 'bg-[#D4622B]' : active ? 'bg-[#D4622B] ring-4 ring-[#D4622B]/25' : 'bg-[#1A1A1A]'}`}>
                    {done ? <CheckCircle size={14} className="text-white" /> : <span className={`text-xs font-black ${upcoming ? 'text-zinc-500' : 'text-white'}`}>{i + 1}</span>}
                    {active && <span className="absolute inset-0 rounded-full animate-ping bg-[#D4622B]/30" />}
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded-full transition-colors ${done ? 'bg-[#D4622B]' : 'bg-[#1A1A1A]'}`} />}
                </div>
                <div className="mt-2 text-center">
                  <p className={`text-[11px] font-bold ${active ? 'text-[#D4622B]' : done ? 'text-zinc-400' : 'text-zinc-600'}`}>{step.label}</p>
                  <p className={`text-[9px] mt-0.5 ${active ? 'text-[#D4622B]/70' : 'text-zinc-600'}`}>{step.sublabel}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Route card */}
      <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3 pb-3">
            <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
              <div className="w-3 h-3 rounded-full bg-[#D4622B] border-2 border-[#FF6B35]/30" />
              <div className="w-px h-8 bg-zinc-600 my-1" />
            </div>
            <div className="flex-1 pb-1">
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wide">Pickup</p>
              <p className="font-black text-white text-base mt-0.5">{order.food_maker?.display_name}</p>
              <p className="text-xs text-zinc-500">Order #{order.id.slice(-6).toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0"><MapPin size={13} className="text-zinc-400" /></div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wide">Deliver to</p>
              {addr ? (
                <div className="mt-0.5">
                  <p className="font-bold text-white text-sm">{addr.street}</p>
                  <p className="text-xs text-zinc-400">{addr.city}, {addr.state} {addr.zip}</p>
                  {addr.label && <p className="text-xs text-zinc-500 mt-0.5 italic">{addr.label}</p>}
                </div>
              ) : <p className="text-sm text-zinc-400 mt-0.5">Address not available</p>}
            </div>
          </div>
        </div>
        {addr && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(`${addr.street}, ${addr.city}, ${addr.state}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-[#1E1E1E] hover:bg-[#1A1A1A] border-t border-white/5 py-3 text-sm font-semibold text-white transition-colors"
          >
            <Navigation size={14} className="text-[#D4622B]" /> Open in Maps
          </a>
        )}
      </div>

      {/* Items checklist — expandable */}
      {order.order_items.length > 0 && (
        <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setShowItems(!showItems)}
            className="w-full flex items-center justify-between px-4 py-3.5"
          >
            <div className="flex items-center gap-2">
              <Package size={15} className="text-[#D4622B]" />
              <span className="text-sm font-bold text-white">Order Items</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${checkedItems.size === order.order_items.length ? 'bg-green-500/20 text-green-400' : 'bg-[#1A1A1A] text-zinc-400'}`}>
                {checkedItems.size}/{order.order_items.length}
              </span>
            </div>
            {showItems ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
          </button>
          {showItems && (
            <div className="border-t border-white/5 divide-y divide-white/5">
              {order.order_items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setCheckedItems(prev => {
                    const next = new Set(prev)
                    next.has(i) ? next.delete(i) : next.add(i)
                    return next
                  })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${checkedItems.has(i) ? 'bg-green-500 border-green-500' : 'border-zinc-700'}`}>
                    {checkedItems.has(i) && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <span className={`text-sm flex-1 ${checkedItems.has(i) ? 'text-zinc-500 line-through' : 'text-white'}`}>
                    {item.quantity}× {item.menu_items?.name ?? 'Item'}
                  </span>
                  <span className="text-xs text-zinc-500">${(item.quantity * item.unit_price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Customer + Earnings row */}
      <div className="mx-4 grid grid-cols-2 gap-3 mb-3">
        {order.customer && (
          <div className="bg-[#141414] rounded-2xl p-3.5 border border-white/5">
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wide mb-1.5">Customer</p>
            <p className="font-bold text-white text-base truncate">{order.customer.full_name}</p>
            {order.customer.phone && (
              <a href={`tel:${order.customer.phone}`} className="mt-2.5 flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                <Phone size={12} /> Call
              </a>
            )}
          </div>
        )}
        <div className="bg-[#141414] rounded-2xl p-3.5 border border-white/5">
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-wide mb-1.5">You earn</p>
          <p className="font-black text-[#D4622B] text-3xl leading-none">${earn.toFixed(2)}</p>
          {order.tip_amount > 0 && <p className="text-sm text-green-400 mt-1.5">+${order.tip_amount.toFixed(2)} tip</p>}
        </div>
      </div>

      {/* CTA */}
      {nextAction && (
        <div className="fixed bottom-[68px] left-0 right-0 max-w-[430px] mx-auto px-4 pb-4 pt-3 bg-gradient-to-t from-[#080808] via-[#080808]/98 to-transparent">
          <button
            onClick={() => handleStatusUpdate(nextAction.next)}
            disabled={updating}
            className={`w-full ${nextAction.color} text-white rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2.5 disabled:opacity-50 transition-all shadow-lg active:scale-[0.98]`}
          >
            {updating
              ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : order.status === 'picked_up' ? <Package size={20} /> : <CheckCircle size={20} />
            }
            {updating ? 'Updating…' : nextAction.label}
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import type { OrderStatus } from '@doornext/shared/types'
import {
  MapPin, Phone, CheckCircle, Navigation, Package,
  ChevronDown, ChevronUp, Banknote, ArrowRight, Clock, Star,
} from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'

type OrderItem = { quantity: number; unit_price: number; menu_items: { name: string } | null }
type ActiveOrder = {
  id: string; status: string; delivery_fee: number; tip_amount: number
  payment_method?: 'card' | 'cash'
  delivery_address: { street?: string; city?: string; state?: string; zip?: string; label?: string } | null
  food_maker: { display_name: string; lat: number; lng: number } | null
  customer: { full_name: string; phone: string | null } | null
  order_items: OrderItem[]
  updated_at: string
}

const STEPS = [
  { status: 'picked_up',  label: 'Heading to Pickup', sublabel: 'Go to restaurant' },
  { status: 'on_the_way', label: 'Out for Delivery',  sublabel: 'Drive to customer' },
  { status: 'delivered',  label: 'Delivered',          sublabel: 'Order complete' },
]

const NEXT_ACTION: Record<string, { next: OrderStatus; label: string }> = {
  picked_up:  { next: 'on_the_way', label: 'Confirm Pickup' },
  on_the_way: { next: 'delivered',  label: 'Confirm Delivery' },
}

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function mapsUrl(addr: ActiveOrder['delivery_address']): string {
  if (!addr) return '#'
  return `https://maps.google.com/?q=${encodeURIComponent(`${addr.street}, ${addr.city}, ${addr.state}`)}`
}

function makerMapsUrl(maker: ActiveOrder['food_maker']): string {
  if (!maker) return '#'
  if (maker.lat && maker.lng) return `https://maps.google.com/?q=${maker.lat},${maker.lng}`
  return `https://maps.google.com/?q=${encodeURIComponent(maker.display_name)}`
}

export default function ActiveDeliveryPage() {
  const router = useRouter()
  const { setActiveOrder, setLocation } = useDriverStore()
  const [order, setOrder] = useState<ActiveOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showItems, setShowItems] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  const [delivered, setDelivered] = useState(false)
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
      .select(`*, payment_method, order_items(quantity, unit_price, menu_items(name)), food_maker:food_makers(display_name, lat, lng), customer:users!orders_customer_id_fkey(full_name, phone)`)
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
    if (order.status === 'picked_up' && order.order_items.length > 0 && checkedItems.size < order.order_items.length) {
      const ok = window.confirm(`You haven't verified all ${order.order_items.length} items. Continue anyway?`)
      if (!ok) return
    }
    setUpdating(true)
    setUpdateError(null)

    try {
      const res = await fetch('/api/driver/update-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUpdateError(data.error ?? 'Failed to update status. Please try again.')
        setUpdating(false)
        return
      }

      if (newStatus === 'delivered') {
        await fetch('/api/driver/complete-delivery', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id }),
        })
        setActiveOrder(null)
        setDelivered(true)
        setTimeout(() => router.push('/'), 3000)
      } else {
        setOrder(prev => prev ? { ...prev, status: newStatus } : prev)
        setCheckedItems(new Set())
      }
    } catch {
      setUpdateError('Network error. Please check your connection and try again.')
    }
    setUpdating(false)
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="Active Delivery" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-[3px] border-[#FF7A50] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  /* ── Delivery success ── */
  if (delivered) {
    const earn = (order?.delivery_fee ?? 0) + (order?.tip_amount ?? 0)
    return (
      <div className="flex flex-col min-h-full bg-[#080808]">
        <AppHeader title="Delivered!" />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="w-24 h-24 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
            <CheckCircle size={48} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white mb-2">Order Delivered!</h2>
            <p className="text-zinc-500">Great work — keep it up.</p>
          </div>
          <div className="bg-[#141414] rounded-2xl border border-white/5 px-8 py-5 w-full max-w-xs text-center">
            <p className="text-sm text-zinc-500 mb-1">You earned</p>
            <p className="text-4xl font-black text-[#FF7A50]">${earn.toFixed(2)}</p>
            {(order?.tip_amount ?? 0) > 0 && (
              <p className="text-sm text-green-400 mt-2">incl. ${order!.tip_amount.toFixed(2)} tip</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            Returning to dashboard…
          </div>
        </div>
      </div>
    )
  }

  /* ── No active order ── */
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
          <button
            onClick={() => router.push('/available')}
            className="bg-[#FF7A50] text-white rounded-2xl px-10 py-4 font-black text-base shadow-lg shadow-[#FF7A50]/20"
          >
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
  const isHeadingToRestaurant = order.status === 'picked_up'
  const isHeadingToCustomer = order.status === 'on_the_way'

  return (
    <div className="flex flex-col min-h-full pb-[144px]">
      <AppHeader title="Active Delivery" />

      {/* Cash banner */}
      {order.payment_method === 'cash' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/12 border-b border-green-500/20">
          <Banknote size={15} className="text-green-400 flex-shrink-0" />
          <p className="text-sm font-bold text-green-400">Cash order — collect payment at drop-off</p>
        </div>
      )}

      {/* Top bar: timer + earnings */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0A0A0A]">
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-zinc-600" />
          <span className="font-mono text-sm font-bold text-white">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">You earn</span>
          <span className="font-black text-[#FF7A50] text-sm">${earn.toFixed(2)}</span>
          {order.tip_amount > 0 && (
            <span className="text-xs text-green-400 font-semibold ml-1">+${order.tip_amount.toFixed(2)} tip</span>
          )}
        </div>
      </div>

      {/* ── Progress stepper ── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start">
          {STEPS.map((step, i) => {
            const done = i < currentStepIdx
            const active = i === currentStepIdx
            const upcoming = i > currentStepIdx
            return (
              <div key={step.status} className="flex-1 flex flex-col items-center">
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 rounded-full transition-colors ${done || active ? 'bg-[#FF7A50]' : 'bg-[#1A1A1A]'}`} />
                  )}
                  <div className={`relative w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    done ? 'bg-[#FF7A50]' : active ? 'bg-[#FF7A50] ring-4 ring-[#FF7A50]/25' : 'bg-[#1A1A1A]'
                  }`}>
                    {done
                      ? <CheckCircle size={14} className="text-white" />
                      : <span className={`text-xs font-black ${upcoming ? 'text-zinc-600' : 'text-white'}`}>{i + 1}</span>
                    }
                    {active && <span className="absolute inset-0 rounded-full animate-ping bg-[#FF7A50]/25" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full transition-colors ${done ? 'bg-[#FF7A50]' : 'bg-[#1A1A1A]'}`} />
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className={`text-[11px] font-bold ${active ? 'text-[#FF7A50]' : done ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {step.label}
                  </p>
                  <p className={`text-[9px] mt-0.5 ${active ? 'text-[#FF7A50]/70' : 'text-zinc-700'}`}>
                    {step.sublabel}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Stage 1: Heading to Restaurant ── */}
      {isHeadingToRestaurant && (
        <>
          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[11px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Pickup at</p>
              <p className="text-xl font-black text-white">{order.food_maker?.display_name}</p>
              <p className="text-sm text-zinc-500 mt-0.5">Order #{order.id.slice(-6).toUpperCase()}</p>
            </div>
            <a
              href={makerMapsUrl(order.food_maker)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#FF7A50] py-3.5 text-sm font-black text-white"
            >
              <Navigation size={16} />
              Navigate to Restaurant
              <ArrowRight size={14} className="opacity-70" />
            </a>
          </div>

          {order.order_items.length > 0 && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setShowItems(!showItems)}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Package size={15} className="text-[#FF7A50]" />
                  <span className="text-sm font-bold text-white">Verify Items</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    checkedItems.size === order.order_items.length
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-[#1A1A1A] text-zinc-500'
                  }`}>
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
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5"
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                        checkedItems.has(i) ? 'bg-green-500 border-green-500' : 'border-zinc-700'
                      }`}>
                        {checkedItems.has(i) && <CheckCircle size={12} className="text-white" />}
                      </div>
                      <span className={`text-sm flex-1 ${checkedItems.has(i) ? 'text-zinc-600 line-through' : 'text-white'}`}>
                        {item.quantity}× {item.menu_items?.name ?? 'Item'}
                      </span>
                      <span className="text-xs text-zinc-600">${(item.quantity * item.unit_price).toFixed(2)}</span>
                    </button>
                  ))}
                  {checkedItems.size === order.order_items.length && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10">
                      <CheckCircle size={13} className="text-green-400" />
                      <span className="text-xs font-bold text-green-400">All items verified — ready to go!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {addr && (
            <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 px-4 py-3.5">
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">Delivering to</p>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-zinc-300">{addr.street}</p>
                  <p className="text-xs text-zinc-500">{addr.city}, {addr.state} {addr.zip}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Stage 2: On the Way to Customer ── */}
      {isHeadingToCustomer && (
        <>
          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[11px] font-black text-[#FF7A50] uppercase tracking-wider mb-1">Delivering to</p>
              {addr ? (
                <>
                  <p className="text-xl font-black text-white leading-tight">{addr.street}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">{addr.city}, {addr.state} {addr.zip}</p>
                  {addr.label && <p className="text-xs text-zinc-500 mt-1 italic">{addr.label}</p>}
                </>
              ) : (
                <p className="text-zinc-500">Address not available</p>
              )}
            </div>
            {addr && (
              <a
                href={mapsUrl(addr)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#FF7A50] py-3.5 text-sm font-black text-white"
              >
                <Navigation size={16} />
                Navigate to Customer
                <ArrowRight size={14} className="opacity-70" />
              </a>
            )}
          </div>

          <div className="mx-4 grid grid-cols-2 gap-3 mb-3">
            {order.customer && (
              <div className="bg-[#141414] rounded-2xl p-3.5 border border-white/5">
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">Customer</p>
                <p className="font-bold text-white text-sm truncate leading-tight">{order.customer.full_name}</p>
                {order.customer.phone ? (
                  <a href={`tel:${order.customer.phone}`} className="mt-2 flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                    <Phone size={12} /> Call customer
                  </a>
                ) : (
                  <p className="text-xs text-zinc-700 mt-2">No phone on file</p>
                )}
              </div>
            )}
            <div className="bg-[#141414] rounded-2xl p-3.5 border border-white/5">
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wide mb-1.5">You earn</p>
              <p className="font-black text-[#FF7A50] text-3xl leading-none">${earn.toFixed(2)}</p>
              {order.tip_amount > 0 && (
                <p className="text-xs text-green-400 mt-1.5 font-semibold">+${order.tip_amount.toFixed(2)} tip</p>
              )}
            </div>
          </div>

          {order.payment_method === 'cash' && (
            <div className="mx-4 mb-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3.5">
              <Banknote size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-300">Collect cash at drop-off</p>
                <p className="text-xs text-amber-400/70 mt-0.5">Confirm the total with the customer before leaving</p>
              </div>
            </div>
          )}

          <div className="mx-4 mb-3 bg-[#141414] rounded-2xl border border-white/5 px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#FF7A50]/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={14} className="text-[#FF7A50]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-600">Picked up from</p>
              <p className="text-sm font-bold text-zinc-300 truncate">{order.food_maker?.display_name}</p>
            </div>
            <Star size={13} className="text-zinc-700 flex-shrink-0" />
          </div>
        </>
      )}

      {/* ── Fixed CTA ── */}
      {nextAction && (
        <div className="fixed bottom-[68px] left-0 right-0 max-w-[430px] mx-auto px-4 pb-4 pt-3 bg-gradient-to-t from-[#080808] via-[#080808]/95 to-transparent">
          {updateError && (
            <div className="mb-2 px-4 py-2.5 bg-red-500/15 border border-red-500/30 rounded-2xl text-xs font-semibold text-red-400 text-center">
              {updateError}
            </div>
          )}
          <button
            onClick={() => handleStatusUpdate(nextAction.next)}
            disabled={updating}
            className={`w-full text-white rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2.5 disabled:opacity-50 transition-all shadow-lg active:scale-[0.98] ${
              isHeadingToCustomer
                ? 'bg-green-500 shadow-green-500/25'
                : 'bg-[#FF7A50] shadow-[#FF7A50]/25'
            }`}
          >
            {updating ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : isHeadingToCustomer ? (
              <CheckCircle size={20} />
            ) : (
              <Package size={20} />
            )}
            {updating ? 'Updating…' : nextAction.label}
          </button>
          {isHeadingToRestaurant && order.order_items.length > 0 && checkedItems.size < order.order_items.length && (
            <p className="text-center text-xs text-zinc-600 mt-2">
              {order.order_items.length - checkedItems.size} item{order.order_items.length - checkedItems.size !== 1 ? 's' : ''} not yet verified
            </p>
          )}
        </div>
      )}
    </div>
  )
}

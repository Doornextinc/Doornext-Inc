'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import type { Order, OrderStatus } from '@doornext/shared/types'
import { MapPin, Phone, CheckCircle, Navigation, Package, Clock } from 'lucide-react'

type ActiveOrder = Order & {
  food_maker: { display_name: string; lat: number; lng: number } | null
  customer: { full_name: string; phone: string | null } | null
}

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'picked_up', label: 'Picked Up' },
  { status: 'on_the_way', label: 'On The Way' },
  { status: 'delivered', label: 'Delivered' },
]

const NEXT_ACTION: Record<string, { next: OrderStatus; label: string }> = {
  picked_up: { next: 'on_the_way', label: 'Start Driving' },
  on_the_way: { next: 'delivered', label: 'Confirm Delivery' },
}

export default function ActiveDeliveryPage() {
  const router = useRouter()
  const { setActiveOrder, setLocation } = useDriverStore()
  const [order, setOrder] = useState<ActiveOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const broadcastLocation = useCallback(async () => {
    if (typeof navigator === 'undefined') return
    navigator.geolocation.getCurrentPosition(async (pos) => {
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
      .select(`
        *,
        food_maker:food_makers(display_name, lat, lng),
        customer:users!orders_customer_id_fkey(full_name, phone)
      `)
      .eq('nexter_id', user.id)
      .in('status', ['picked_up', 'on_the_way'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setOrder(data as ActiveOrder)
      setActiveOrder(data.id)
    } else {
      setActiveOrder(null)
    }
    setLoading(false)
  }, [router, setActiveOrder])

  useEffect(() => { loadActiveOrder() }, [loadActiveOrder])

  // GPS broadcast every 10s
  useEffect(() => {
    if (!order) return
    broadcastLocation()
    locationIntervalRef.current = setInterval(broadcastLocation, 10_000)
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current) }
  }, [order, broadcastLocation])

  // Elapsed timer
  useEffect(() => {
    if (!order) return
    const start = new Date(order.updated_at).getTime()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [order])

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (!order) return
    setUpdating(true)
    const res = await fetch('/api/driver/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, status: newStatus }),
    })
    if (res.ok) {
      if (newStatus === 'delivered') {
        await fetch('/api/driver/complete-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id }),
        })
        setActiveOrder(null)
        router.push('/available')
      } else {
        setOrder((prev) => prev ? { ...prev, status: newStatus } : prev)
      }
    }
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full">
        <div className="w-12 h-12 border-4 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 text-center">
        <Package size={64} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-slate-300">No active delivery</h2>
        <p className="text-slate-500 text-sm mt-2 mb-6">Accept a pickup from the Available tab</p>
        <button
          onClick={() => router.push('/available')}
          className="bg-[#FF6B35] text-white rounded-xl px-6 py-3 font-bold"
        >
          Find Pickups
        </button>
      </div>
    )
  }

  const nextAction = NEXT_ACTION[order.status]
  const addr = typeof order.delivery_address === 'object' ? order.delivery_address : null
  const currentStepIdx = STEPS.findIndex((s) => s.status === order.status)

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700/50 px-4 h-14 flex items-center justify-between">
        <h1 className="text-lg font-black text-white">Active Delivery</h1>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Clock size={14} />
          <span className="font-mono">{formatElapsed(elapsed)}</span>
        </div>
      </header>

      {/* Step progress */}
      <div className="bg-slate-800 px-5 py-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const done = i < currentStepIdx
            const active = i === currentStepIdx
            return (
              <div key={step.status} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 ${done || active ? 'bg-[#FF6B35]' : 'bg-slate-600'}`} />
                  )}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done ? 'bg-[#FF6B35]' : active ? 'bg-[#FF6B35] ring-4 ring-[#FF6B35]/20' : 'bg-slate-600'
                  }`}>
                    {done
                      ? <CheckCircle size={14} className="text-white" />
                      : <span className="text-white text-xs font-bold">{i + 1}</span>
                    }
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 ${done ? 'bg-[#FF6B35]' : 'bg-slate-600'}`} />
                  )}
                </div>
                <span className={`text-[10px] font-medium ${active ? 'text-[#FF6B35]' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Pickup */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-1.5">Pickup From</p>
          <p className="font-bold text-white text-base">{order.food_maker?.display_name}</p>
          <p className="text-xs text-slate-400 mt-0.5">Order #{order.id.slice(-6).toUpperCase()}</p>
        </div>

        {/* Delivery address */}
        {addr && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-2">Deliver To</p>
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-[#FF6B35] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-white text-sm">{addr.street}</p>
                <p className="text-xs text-slate-400">{addr.city}, {addr.state} {addr.zip}</p>
                {addr.label && <p className="text-xs text-slate-500 mt-0.5">{addr.label}</p>}
              </div>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(`${addr.street}, ${addr.city}, ${addr.state}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors"
            >
              <Navigation size={14} />
              Open in Maps
            </a>
          </div>
        )}

        {/* Customer */}
        {order.customer && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-1">Customer</p>
              <p className="font-semibold text-white text-sm">{order.customer.full_name}</p>
            </div>
            <div className="flex gap-2">
              {order.customer.phone && (
                <a
                  href={`tel:${order.customer.phone}`}
                  className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center"
                >
                  <Phone size={17} className="text-green-400" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Earnings */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 flex items-center justify-between">
          <p className="text-sm text-slate-400">Your earnings</p>
          <p className="font-black text-[#FF6B35] text-2xl">${order.delivery_fee.toFixed(2)}</p>
        </div>
      </div>

      {/* CTA */}
      {nextAction && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-8 pt-2 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
          <button
            onClick={() => handleStatusUpdate(nextAction.next)}
            disabled={updating}
            className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:bg-[#E55A24] transition-colors shadow-lg shadow-[#FF6B35]/30"
          >
            {nextAction.next === 'on_the_way' && <Navigation size={18} />}
            {nextAction.next === 'delivered' && <CheckCircle size={18} />}
            {updating ? 'Updating…' : nextAction.label}
          </button>
        </div>
      )}
    </div>
  )
}

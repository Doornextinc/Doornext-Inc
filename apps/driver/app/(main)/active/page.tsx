'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import type { Order, OrderStatus } from '@doornext/shared/types'
import { MapPin, Phone, CheckCircle, Navigation, Package } from 'lucide-react'

type ActiveOrder = Order & {
  food_maker: { display_name: string; lat: number; lng: number } | null
  customer: { full_name: string; phone: string | null } | null
}

const DELIVERY_STATUS_FLOW: Record<string, { next: OrderStatus; label: string; icon: React.ReactNode }> = {
  picked_up: {
    next: 'on_the_way',
    label: 'Start Driving',
    icon: <Navigation size={18} />,
  },
  on_the_way: {
    next: 'delivered',
    label: 'Mark Delivered',
    icon: <CheckCircle size={18} />,
  },
}

export default function ActiveDeliveryPage() {
  const router = useRouter()
  const { activeOrderId, setActiveOrder, setLocation } = useDriverStore()
  const [order, setOrder] = useState<ActiveOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

    // Find the driver's active order
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

  // Broadcast location every 10s while delivery is active
  useEffect(() => {
    if (!order) return
    broadcastLocation()
    locationIntervalRef.current = setInterval(broadcastLocation, 10_000)
    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current)
    }
  }, [order, broadcastLocation])

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

  const nextStep = DELIVERY_STATUS_FLOW[order.status]
  const addr = typeof order.delivery_address === 'object' ? order.delivery_address : null

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700/50 px-4 h-14 flex items-center justify-between">
        <h1 className="text-lg font-black text-white">Active Delivery</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          order.status === 'on_the_way' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-indigo-500/20 text-indigo-400'
        }`}>
          {order.status === 'on_the_way' ? 'On The Way' : 'Picked Up'}
        </span>
      </header>

      <div className="p-4 space-y-4">
        {/* Pickup info */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-2">Pickup From</p>
          <p className="font-bold text-white text-lg">{order.food_maker?.display_name}</p>
          <p className="text-xs text-slate-400 mt-1">Order #{order.id.slice(-6).toUpperCase()}</p>
        </div>

        {/* Delivery address */}
        {addr && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-2">Deliver To</p>
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-[#FF6B35] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">{addr.street}</p>
                <p className="text-sm text-slate-400">{addr.city}, {addr.state} {addr.zip}</p>
                {addr.label && <p className="text-xs text-slate-500 mt-1">{addr.label}</p>}
              </div>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(`${addr.street}, ${addr.city}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 bg-slate-700 rounded-xl py-2.5 text-sm font-semibold text-white"
            >
              <Navigation size={15} />
              Open in Maps
            </a>
          </div>
        )}

        {/* Customer */}
        {order.customer && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-1">Customer</p>
              <p className="font-semibold text-white">{order.customer.full_name}</p>
            </div>
            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center"
              >
                <Phone size={18} className="text-green-400" />
              </a>
            )}
          </div>
        )}

        {/* Earnings */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 flex items-center justify-between">
          <p className="text-sm text-slate-400">Your earnings</p>
          <p className="font-black text-[#FF6B35] text-xl">${order.delivery_fee.toFixed(2)}</p>
        </div>
      </div>

      {/* Action button */}
      {nextStep && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pb-6">
          <button
            onClick={() => handleStatusUpdate(nextStep.next)}
            disabled={updating}
            className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:bg-[#E55A24]"
          >
            {nextStep.icon}
            {updating ? 'Updating…' : nextStep.label}
          </button>
        </div>
      )}
    </div>
  )
}

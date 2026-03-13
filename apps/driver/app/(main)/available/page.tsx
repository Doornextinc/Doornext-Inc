'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { haversineDistance, formatDistance, formatPriceDollars } from '@doornext/shared/utils'
import type { Order } from '@doornext/shared/types'
import { MapPin, Clock, DollarSign, Power } from 'lucide-react'

type AvailableOrder = Pick<Order, 'id' | 'total' | 'delivery_fee' | 'created_at' | 'delivery_address'> & {
  food_maker: { display_name: string; lat: number; lng: number; address?: string } | null
}

export default function AvailablePickupsPage() {
  const router = useRouter()
  const { isOnline, setOnline, currentLat, currentLng, setLocation } = useDriverStore()
  const [orders, setOrders] = useState<AvailableOrder[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Get GPS location
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => {} // silent fail — no GPS in dev
    )
  }, [setLocation])

  const loadOrders = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('orders')
      .select('id, total, delivery_fee, created_at, delivery_address, food_maker:food_makers(display_name, lat, lng)')
      .eq('status', 'ready')
      .is('nexter_id', null)
      .order('created_at', { ascending: true })
      .limit(20)
    setOrders((data as AvailableOrder[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  // Live subscription for new ready orders
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('available-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadOrders])

  const handleAccept = async (orderId: string) => {
    setAccepting(orderId)
    const res = await fetch('/api/driver/accept-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    if (res.ok) {
      useDriverStore.getState().setActiveOrder(orderId)
      router.push('/active')
    } else {
      const { error } = await res.json()
      alert(error ?? 'Order no longer available')
      loadOrders()
    }
    setAccepting(null)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700/50 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-white">Available Pickups</h1>
          <p className="text-xs text-slate-400">{orders.length} ready near you</p>
        </div>
        <button
          onClick={() => setOnline(!isOnline)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            isOnline ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          <Power size={15} />
          {isOnline ? 'Online' : 'Offline'}
        </button>
      </header>

      {!isOnline ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <Power size={48} className="text-slate-600 mb-4" />
          <h2 className="text-xl font-bold text-slate-300">You're offline</h2>
          <p className="text-slate-500 text-sm mt-2">Go online to see available deliveries</p>
        </div>
      ) : loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-4">🛵</span>
          <h2 className="text-xl font-bold text-slate-300">No pickups right now</h2>
          <p className="text-slate-500 text-sm mt-2">We'll show new orders as they become ready</p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {orders.map((order) => {
            const makerLat = order.food_maker?.lat
            const makerLng = order.food_maker?.lng
            const distance =
              currentLat && currentLng && makerLat && makerLng
                ? haversineDistance(currentLat, currentLng, makerLat, makerLng)
                : null

            return (
              <div key={order.id} className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-white">{order.food_maker?.display_name ?? 'Restaurant'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Order #{order.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-[#FF6B35]">
                        {formatPriceDollars(order.delivery_fee)}
                      </p>
                      <p className="text-xs text-slate-400">delivery fee</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    {distance !== null && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-[#FF6B35]" />
                        {formatDistance(distance)} away
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} className="text-green-400" />
                      Order total: ${order.total.toFixed(2)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(order.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleAccept(order.id)}
                  disabled={accepting !== null}
                  className="w-full bg-[#FF6B35] text-white py-3.5 font-bold text-sm disabled:opacity-50 transition-opacity active:opacity-80"
                >
                  {accepting === order.id ? 'Accepting…' : 'Accept Delivery'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

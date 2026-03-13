'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { haversineDistance, formatDistance, formatPriceDollars } from '@doornext/shared/utils'
import type { Order } from '@doornext/shared/types'
import { MapPin, Clock, ChevronRight, Wifi, WifiOff } from 'lucide-react'

type DeliveryAddress = { street?: string; city?: string; state?: string; zip?: string; label?: string }

type AvailableOrder = Pick<Order, 'id' | 'total' | 'delivery_fee' | 'created_at'> & {
  delivery_address: DeliveryAddress | null
  food_maker: { display_name: string; lat: number; lng: number } | null
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function AvailablePickupsPage() {
  const router = useRouter()
  const { isOnline, setOnline, currentLat, currentLng, setLocation } = useDriverStore()
  const [orders, setOrders] = useState<AvailableOrder[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => {}
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
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-700/40">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Pickups</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isOnline ? `${orders.length} available near you` : 'Go online to see orders'}
            </p>
          </div>
          {/* Online toggle */}
          <button
            onClick={() => setOnline(!isOnline)}
            className={`flex items-center gap-2 pl-3 pr-4 py-2 rounded-full font-bold text-sm transition-all ${
              isOnline
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700/50'
            }`}
          >
            {isOnline
              ? <><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><Wifi size={14} /> Online</>
              : <><WifiOff size={14} /> Offline</>
            }
          </button>
        </div>
      </header>

      {/* Offline state */}
      {!isOnline ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center px-6">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-5 border border-slate-700/50">
            <WifiOff size={32} className="text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">You're offline</h2>
          <p className="text-slate-500 text-sm mb-6 max-w-xs">
            Tap "Online" above to start receiving delivery requests
          </p>
          <button
            onClick={() => setOnline(true)}
            className="bg-[#FF6B35] text-white font-bold px-8 py-3.5 rounded-2xl text-sm shadow-lg shadow-[#FF6B35]/25"
          >
            Go Online
          </button>
        </div>
      ) : loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/40 animate-pulse">
              <div className="p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="space-y-1.5">
                    <div className="h-4 bg-slate-700 rounded w-32" />
                    <div className="h-3 bg-slate-700 rounded w-20" />
                  </div>
                  <div className="h-8 bg-slate-700 rounded w-14" />
                </div>
                <div className="flex gap-3">
                  <div className="h-3 bg-slate-700 rounded w-20" />
                  <div className="h-3 bg-slate-700 rounded w-24" />
                </div>
              </div>
              <div className="h-12 bg-slate-700/50" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center px-6">
          <span className="text-6xl mb-4">🛵</span>
          <h2 className="text-xl font-bold text-white mb-2">All caught up!</h2>
          <p className="text-slate-500 text-sm max-w-xs">
            No pickups available right now. New orders will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {orders.map((order) => {
            const makerLat = order.food_maker?.lat
            const makerLng = order.food_maker?.lng
            const distance =
              currentLat && currentLng && makerLat && makerLng
                ? haversineDistance(currentLat, currentLng, makerLat, makerLng)
                : null
            const addr = order.delivery_address
            const isAccepting = accepting === order.id

            return (
              <div
                key={order.id}
                className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/40 shadow-lg"
              >
                {/* Card body */}
                <div className="p-4">
                  {/* Top row: name + fee */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">
                        {order.food_maker?.display_name ?? 'Restaurant'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">#{order.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-black text-[#FF6B35] leading-none">
                        {formatPriceDollars(order.delivery_fee)}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">you earn</p>
                    </div>
                  </div>

                  {/* Route: pickup → dropoff */}
                  <div className="bg-slate-700/40 rounded-xl p-3 mb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#FF6B35] flex-shrink-0" />
                      <p className="text-xs text-slate-300 font-medium truncate">
                        {order.food_maker?.display_name ?? 'Pickup location'}
                        {distance !== null && (
                          <span className="text-slate-500 ml-1">· {formatDistance(distance)} away</span>
                        )}
                      </p>
                    </div>
                    <div className="ml-[3px] w-px h-3 bg-slate-600" />
                    <div className="flex items-center gap-2">
                      <MapPin size={8} className="text-slate-400 flex-shrink-0" />
                      <p className="text-xs text-slate-400 truncate">
                        {addr?.city ? `${addr.city}, ${addr.state}` : 'Delivery address'}
                      </p>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {timeAgo(order.created_at)}
                    </span>
                    <span className="text-slate-700">•</span>
                    <span>Order total ${order.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Accept button */}
                <button
                  onClick={() => handleAccept(order.id)}
                  disabled={accepting !== null}
                  className={`w-full flex items-center justify-center gap-2 py-4 font-bold text-sm transition-all ${
                    isAccepting
                      ? 'bg-[#FF6B35]/80 text-white/80'
                      : 'bg-[#FF6B35] hover:bg-[#E55A24] active:bg-[#E55A24] text-white'
                  } disabled:opacity-60`}
                >
                  {isAccepting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Accepting…
                    </>
                  ) : (
                    <>
                      Accept Delivery
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

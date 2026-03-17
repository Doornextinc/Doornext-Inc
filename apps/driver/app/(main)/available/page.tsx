'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { haversineDistance, formatDistance, formatPriceDollars } from '@doornext/shared/utils'
import type { Order } from '@doornext/shared/types'
import { MapPin, Clock, ChevronRight } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'

// delivery_address is intentionally NOT fetched for unassigned orders.
// Full address is only available to the driver after they accept the order.
type AvailableOrder = Pick<Order, 'id' | 'total' | 'delivery_fee' | 'created_at'> & {
  driver_payout: number
  tip_amount: number
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
  const [togglingOnline, setTogglingOnline] = useState(false)

  const handleToggleOnline = async () => {
    const newStatus = !isOnline
    setOnline(newStatus)
    setTogglingOnline(true)
    try {
      const res = await fetch('/api/driver/set-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: newStatus }),
      })
      if (!res.ok) setOnline(!newStatus) // revert on failure
    } catch {
      setOnline(!newStatus) // revert on network error
    } finally {
      setTogglingOnline(false)
    }
  }

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => {}
    )
  }, [setLocation])

  const loadOrders = useCallback(async () => {
    const supabase = createClient()
    // delivery_address is excluded from this query — full address must never be
    // sent to drivers browsing unassigned orders (P0 privacy requirement).
    const { data } = await supabase
      .from('orders')
      .select('id, total, delivery_fee, driver_payout, tip_amount, created_at, food_maker:food_makers(display_name, lat, lng)')
      .eq('status', 'ready')
      .is('nexter_id', null)
      .order('created_at', { ascending: true })
      .limit(20)
    setOrders((data ?? []) as AvailableOrder[])
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
    // Optimistically remove from list so it feels instant
    setOrders(prev => prev.filter(o => o.id !== orderId))

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
      // Restore the order in the list and re-fetch latest state
      loadOrders()
      alert(error ?? 'Order no longer available')
    }
    setAccepting(null)
  }

  return (
    <div className="flex flex-col min-h-full">
      <AppHeader title="Pickups" />
      {/* Online toggle bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0A0A0A]">
        <p className="text-xs text-zinc-500">
          {isOnline ? `${orders.length} available near you` : 'Go online to see orders'}
        </p>
        {/* Live-tracking icon button */}
        <button
          onClick={handleToggleOnline}
          disabled={togglingOnline}
          className="relative flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-90 disabled:opacity-60"
          title={isOnline ? 'Go Offline' : 'Go Online'}
        >
          {/* outer glow ring — only when online */}
          {isOnline && (
            <span className="absolute inset-0 rounded-full animate-ping bg-green-400 opacity-20" />
          )}
          {/* mid ring */}
          <span className={`absolute inset-0 rounded-full border-2 transition-colors duration-300 ${
            isOnline ? 'border-green-400/50' : 'border-white/10'
          }`} />
          {/* inner filled circle */}
          <span className={`w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${
            isOnline
              ? 'bg-green-400 shadow-green-400/60'
              : 'bg-zinc-600'
          }`}>
            {/* center dot */}
            <span className={`block w-2 h-2 rounded-full mx-auto mt-1.5 transition-colors duration-300 ${
              isOnline ? 'bg-green-900' : 'bg-zinc-800'
            }`} />
          </span>
        </button>
      </div>

      {/* Offline state */}
      {!isOnline ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center px-6">
          <div className="relative w-20 h-20 flex items-center justify-center mb-5">
            <span className="absolute inset-0 rounded-full border-2 border-white/10" />
            <span className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
              <span className="w-4 h-4 rounded-full bg-zinc-500" />
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">You're offline</h2>
          <p className="text-zinc-500 text-sm mb-6 max-w-xs">
            Tap "Online" above to start receiving delivery requests
          </p>
          <button
            onClick={handleToggleOnline}
            disabled={togglingOnline}
            className="bg-[#FF7A50] text-white font-bold px-8 py-3.5 rounded-2xl text-sm shadow-lg shadow-[#FF7A50]/25 disabled:opacity-60"
          >
            Go Online
          </button>
        </div>
      ) : loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#141414] rounded-2xl overflow-hidden border border-white/5 animate-pulse">
              <div className="p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="space-y-1.5">
                    <div className="h-4 bg-[#1A1A1A] rounded w-32" />
                    <div className="h-3 bg-[#1A1A1A] rounded w-20" />
                  </div>
                  <div className="h-8 bg-[#1A1A1A] rounded w-14" />
                </div>
                <div className="flex gap-3">
                  <div className="h-3 bg-[#1A1A1A] rounded w-20" />
                  <div className="h-3 bg-[#1A1A1A] rounded w-24" />
                </div>
              </div>
              <div className="h-12 bg-white/5" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center px-6">
          <span className="text-6xl mb-4">🛵</span>
          <h2 className="text-xl font-bold text-white mb-2">All caught up!</h2>
          <p className="text-zinc-500 text-sm max-w-xs">
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
            const isAccepting = accepting === order.id

            return (
              <div
                key={order.id}
                className="bg-[#141414] rounded-2xl overflow-hidden border border-white/5 shadow-lg"
              >
                {/* Card body */}
                <div className="p-4">
                  {/* Top row: name + fee */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">
                        {order.food_maker?.display_name ?? 'Restaurant'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">#{order.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {(() => {
                        const base = order.driver_payout > 0 ? order.driver_payout : order.delivery_fee
                        const tip = order.tip_amount ?? 0
                        const total = base + tip
                        return (
                          <>
                            <p className="text-2xl font-black text-[#FF7A50] leading-none">
                              {formatPriceDollars(total)}
                            </p>
                            {tip > 0 ? (
                              <p className="text-[10px] text-green-400 mt-0.5 font-semibold">
                                ${base.toFixed(2)} + ${tip.toFixed(2)} tip
                              </p>
                            ) : (
                              <p className="text-[10px] text-zinc-500 mt-0.5">you earn</p>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Route: pickup → dropoff */}
                  <div className="bg-white/5 rounded-xl p-3 mb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#FF7A50] flex-shrink-0" />
                      <p className="text-xs text-zinc-300 font-medium truncate">
                        {order.food_maker?.display_name ?? 'Pickup location'}
                        {distance !== null && (
                          <span className="text-zinc-500 ml-1">· {formatDistance(distance)} away</span>
                        )}
                      </p>
                    </div>
                    <div className="ml-[3px] w-px h-3 bg-zinc-700" />
                    <div className="flex items-center gap-2">
                      <MapPin size={8} className="text-zinc-400 flex-shrink-0" />
                      <p className="text-xs text-zinc-400 truncate">Delivery location</p>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {timeAgo(order.created_at)}
                    </span>
                    <span className="text-zinc-700">•</span>
                    <span>Order total ${order.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Accept button */}
                <button
                  onClick={() => handleAccept(order.id)}
                  disabled={accepting !== null}
                  className={`w-full flex items-center justify-center gap-2 py-4 font-bold text-sm transition-all ${
                    isAccepting
                      ? 'bg-[#FF7A50]/80 text-white/80'
                      : 'bg-[#FF7A50] hover:bg-[#E86B40] active:bg-[#E86B40] text-white'
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

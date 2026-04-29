'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import { ChevronRight, AlertTriangle, MapPin, Clock } from 'lucide-react'
import { haversineDistance, formatDistance, formatPriceDollars } from '@doornext/shared/utils'
import { playWithHaptic, initAudio } from '@/lib/notification-sounds'

const LiveMap = dynamic(() => import('@/components/live-map').then(m => m.LiveMap), { ssr: false })

type HomeData = {
  profile: {
    full_name: string; avg_rating: number; total_deliveries: number; is_active: boolean
    kyc_status: string; avatar_url: string | null
    acceptance_rate: number | null
    avg_wait_at_maker_mins: number | null
    avg_delivery_mins: number | null
  }
  todayEarnings: number
  todayDeliveries: number
  weekEarnings: number
  activeOrder: { id: string; status: string; food_maker: { display_name: string } | null } | null
}

type AvailableOrder = {
  id: string
  total: number
  delivery_fee: number
  driver_payout: number
  tip_amount: number
  created_at: string
  food_maker: { display_name: string; lat: number; lng: number } | null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const DEFAULT_LAT = 40.7128
const DEFAULT_LNG = -74.006

export default function HomePage() {
  const router = useRouter()
  const { isOnline, setOnline, setActiveOrder, currentLat, currentLng } = useDriverStore()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const watchIdRef = useRef<number | null>(null)

  // Available orders state
  const [orders, setOrders] = useState<AvailableOrder[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const knownOrderIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude) },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current) }
  }, [])

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const today = new Date(); today.setHours(0, 0, 0, 0)
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0)

      const [profileRes, ordersRes, activeRes] = await Promise.all([
        supabase.from('driver_profiles').select('full_name, avg_rating, total_deliveries, is_active, kyc_status, avatar_url, acceptance_rate, avg_wait_at_maker_mins, avg_delivery_mins').eq('id', user.id).single(),
        supabase.from('orders').select('driver_payout, created_at').eq('nexter_id', user.id).eq('status', 'delivered').gte('created_at', weekStart.toISOString()),
        supabase.from('orders').select('id, status, food_maker:food_makers(display_name)').eq('nexter_id', user.id).in('status', ['driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer']).maybeSingle(),
      ])

      const allDeliveries = ordersRes.data ?? []
      const todayDeliveries = allDeliveries.filter(d => new Date(d.created_at) >= today)
      const todayEarnings = todayDeliveries.reduce((s: number, d: { driver_payout: number }) => s + (d.driver_payout ?? 0), 0)
      const weekEarnings = allDeliveries.reduce((s: number, d: { driver_payout: number }) => s + (d.driver_payout ?? 0), 0)

      if (profileRes.data?.is_active !== undefined) setOnline(profileRes.data.is_active)
      if (activeRes.data) setActiveOrder(activeRes.data.id)

      setData({
        profile: profileRes.data as unknown as HomeData['profile'],
        todayEarnings,
        todayDeliveries: todayDeliveries.length,
        weekEarnings,
        activeOrder: activeRes.data as unknown as HomeData['activeOrder'],
      })
    } catch (err) {
      console.error('[Home] load error:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [router, setOnline, setActiveOrder])

  useEffect(() => { load() }, [load])

  // Unlock audio on mount (required before any user gesture on iOS)
  useEffect(() => { initAudio() }, [])

  // Heartbeat: ping every 15 sec while online so stale-assignment detection works
  // (stale grace period is 90s = 6 missed pings — plenty of buffer for spotty networks)
  useEffect(() => {
    if (!isOnline) return
    const ping = () => fetch('/api/driver/heartbeat', { method: 'POST' }).catch(() => {})
    ping() // immediate ping when coming online
    const t = setInterval(ping, 15 * 1000)
    return () => clearInterval(t)
  }, [isOnline])

  // Load available orders — play sound when new ones appear
  const loadOrders = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('orders')
      .select('id, total, delivery_fee, driver_payout, tip_amount, created_at, food_maker:food_makers(display_name, lat, lng)')
      .eq('status', 'ready')
      .is('nexter_id', null)
      .order('created_at', { ascending: true })
      .limit(10)
    const incoming = (data ?? []) as unknown as AvailableOrder[]
    const hasNew = incoming.some(o => !knownOrderIds.current.has(o.id))
    if (hasNew && knownOrderIds.current.size > 0) {
      // Only play when orders list was already populated (not on first load)
      playWithHaptic('new_order')
    }
    knownOrderIds.current = new Set(incoming.map(o => o.id))
    setOrders(incoming)
  }, [])

  // Real-time subscription — only subscribe when online
  useEffect(() => {
    if (!isOnline) return
    loadOrders()
    const supabase = createClient()
    const ch = supabase.channel('home-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.ready' }, loadOrders)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isOnline, loadOrders])

  const handleAccept = async (orderId: string) => {
    setAccepting(orderId)
    setOrders(prev => prev.filter(o => o.id !== orderId))
    try {
      const res = await fetch('/api/driver/accept-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      if (res.ok) {
        playWithHaptic('order_accepted')
        setActiveOrder(orderId)
        router.push('/active')
      } else {
        loadOrders()
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Order no longer available')
      }
    } catch {
      loadOrders()
      alert('Network error')
    } finally {
      setAccepting(null)
    }
  }

  const toggleOnline = async () => {
    const newStatus = !isOnline
    setOnline(newStatus) // optimistic
    setToggling(true)
    try {
      const res = await fetch('/api/driver/set-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: newStatus }),
      })
      if (!res.ok) {
        setOnline(!newStatus) // revert on failure
      } else {
        setData(prev => prev ? { ...prev, profile: { ...prev.profile, is_active: newStatus } } : prev)
      }
    } catch {
      setOnline(!newStatus) // revert on network error
    } finally {
      setToggling(false)
    }
  }

  const firstName = data?.profile?.full_name?.split(' ')[0] ?? 'Driver'
  const driverLat = currentLat ?? lat
  const driverLng = currentLng ?? lng

  return (
    <div className="relative flex flex-col overflow-hidden" style={{ height: '100svh' }}>

      {/* Live map — interactive (pan / zoom enabled) */}
      <LiveMap lat={lat} lng={lng} isOnline={isOnline} />

      {/* Floating sticky header */}
      <div className="relative z-10">
        <AppHeader greeting={loading ? undefined : { time: greeting(), name: firstName }} />
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="absolute top-16 left-0 right-0 z-20 px-4 pt-2">
          <button
            onClick={load}
            className="w-full flex items-center justify-center gap-2 bg-red-500/15 border border-red-500/30 rounded-2xl px-4 py-3 text-red-400 text-sm font-bold"
          >
            <AlertTriangle size={15} />
            Failed to load — tap to retry
          </button>
        </div>
      )}

      {/* ── KYC incomplete banner ── */}
      {!loading && !loadError && data?.profile?.kyc_status && data.profile.kyc_status !== 'approved' && (
        <div className="absolute top-16 left-0 right-0 z-20 px-4 pt-2">
          <Link
            href="/onboarding"
            className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 backdrop-blur-sm"
          >
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {data.profile.kyc_status === 'pending_review' ? (
                <>
                  <p className="text-amber-400 font-black text-sm">Verification Under Review</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">We&apos;ll notify you when it&apos;s approved</p>
                </>
              ) : data.profile.kyc_status === 'rejected' ? (
                <>
                  <p className="text-amber-400 font-black text-sm">Verification Rejected</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">Tap to resubmit your documents</p>
                </>
              ) : (
                <>
                  <p className="text-amber-400 font-black text-sm">Identity Verification Required</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">Complete KYC to start accepting orders</p>
                </>
              )}
            </div>
            <ChevronRight size={16} className="text-amber-400/70 flex-shrink-0" />
          </Link>
        </div>
      )}

      {/* ── OFFLINE bottom sheet ── */}
      {!isOnline ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-10 pt-8"
          style={{ background: 'linear-gradient(to top, #0A0A0A 72%, rgba(10,10,10,0.6) 88%, transparent)' }}
        >
          {/* Heading */}
          <div className="text-center mb-7">
            <h2 className="text-3xl font-black text-white leading-tight tracking-tight">Ready to earn?</h2>
            <p className="text-zinc-400 text-base mt-2">Tap GO to start accepting orders</p>
          </div>

          {/* Round GO button */}
          <div className="flex justify-center mb-5">
            <button
              onClick={toggleOnline}
              disabled={toggling}
              className="relative w-32 h-32 rounded-full flex items-center justify-center active:scale-95 transition-all duration-150 disabled:opacity-60"
              style={{
                background: 'linear-gradient(145deg, #1e1e1e, #141414)',
                boxShadow: '0 0 0 5px #1c1c1c, 0 0 0 9px #222, 0 16px 48px rgba(0,0,0,0.9)',
              }}
            >
              <span className="absolute inset-0 rounded-full border border-white/10" />
              <span className="text-white font-black text-3xl tracking-wide">
                {toggling ? '…' : 'Go'}
              </span>
            </button>
          </div>

          {/* Metrics strip — directly below GO button */}
          {!loading && (
            <div className="flex items-stretch bg-[#141414]/95 border border-white/8 rounded-3xl overflow-hidden backdrop-blur-sm mb-4">
              <div className="flex-1 py-3.5 text-center">
                <p className="font-black text-white text-xl leading-none">
                  {data?.profile?.acceptance_rate != null ? `${Math.round(data.profile.acceptance_rate)}%` : '—'}
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Accepted</p>
              </div>
              <div className="w-px bg-white/8" />
              <div className="flex-1 py-3.5 text-center">
                <p className="font-black text-white text-xl leading-none">
                  {data?.profile?.avg_wait_at_maker_mins != null ? `${data.profile.avg_wait_at_maker_mins}m` : '—'}
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Arrival</p>
              </div>
              <div className="w-px bg-white/8" />
              <div className="flex-1 py-3.5 text-center">
                <p className="font-black text-white text-xl leading-none">
                  {data?.profile?.avg_delivery_mins != null ? `${data.profile.avg_delivery_mins}m` : '—'}
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Dropoff</p>
              </div>
            </div>
          )}

          {/* Today / Trips / Rating strip */}
          {!loading && (
            <div className="flex items-stretch bg-[#141414]/95 border border-white/8 rounded-3xl overflow-hidden backdrop-blur-sm">
              <div className="flex-1 py-4 text-center">
                <p className="font-black text-white text-2xl leading-none">${(data?.todayEarnings ?? 0).toFixed(2)}</p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Today</p>
              </div>
              <div className="w-px bg-white/8" />
              <div className="flex-1 py-4 text-center">
                <p className="font-black text-white text-2xl leading-none">{data?.todayDeliveries ?? 0}</p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Trips</p>
              </div>
              <div className="w-px bg-white/8" />
              <div className="flex-1 py-4 text-center">
                <p className="font-black text-white text-2xl leading-none">{data?.profile?.avg_rating != null ? data.profile.avg_rating.toFixed(1) : '—'}</p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Rating</p>
              </div>
            </div>
          )}
        </div>

      ) : (
        /* ── ONLINE bottom sheet ── */
        <div
          className="absolute bottom-0 left-0 right-0 z-10 max-h-[70vh] overflow-y-auto px-4 pb-8 pt-6 space-y-3"
          style={{ background: 'linear-gradient(to top, #0A0A0A 68%, rgba(10,10,10,0.6) 85%, transparent)' }}
        >
          {/* Active order banner */}
          {data?.activeOrder && (
            <Link href="/active" className="block bg-[#E06B38]/10 border border-[#E06B38]/20 rounded-2xl px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-[#E06B38] uppercase tracking-wider mb-1">Active Delivery</p>
                  <p className="font-black text-white text-base">{(data.activeOrder as any).food_maker?.display_name ?? 'Order'}</p>
                  <p className="text-sm text-zinc-400 mt-0.5 capitalize">{data.activeOrder.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E06B38] animate-pulse" />
                  <ChevronRight size={18} className="text-[#E06B38]" />
                </div>
              </div>
            </Link>
          )}

          {/* Stats row — Today / Trips / Rating */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-[#131313]/95 border border-white/8 rounded-2xl px-3 py-4 text-center backdrop-blur-sm">
              <p className="font-black text-white text-xl leading-none">${(data?.todayEarnings ?? 0).toFixed(2)}</p>
              <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Today</p>
            </div>
            <div className="bg-[#131313]/95 border border-white/8 rounded-2xl px-3 py-4 text-center backdrop-blur-sm">
              <p className="font-black text-white text-xl leading-none">{data?.todayDeliveries ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Trips</p>
            </div>
            <Link href="/earnings" className="bg-[#131313]/95 border border-white/8 rounded-2xl px-3 py-4 text-center backdrop-blur-sm">
              <p className="font-black text-white text-xl leading-none">{data?.profile?.avg_rating != null ? data.profile.avg_rating.toFixed(1) : '—'}</p>
              <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Rating</p>
            </Link>
          </div>

          {/* ── Delivery request cards ── */}
          {orders.length > 0 ? (
            <div className="space-y-3">
              {orders.map(order => {
                const makerLat = order.food_maker?.lat
                const makerLng = order.food_maker?.lng
                const distanceM = (makerLat != null && makerLng != null)
                  ? haversineDistance(driverLat, driverLng, makerLat, makerLng)
                  : null
                const isAccepting = accepting === order.id

                return (
                  <div
                    key={order.id}
                    className="bg-[#131313]/95 border border-white/8 rounded-2xl overflow-hidden backdrop-blur-sm"
                  >
                    {/* Card header: restaurant name + payout */}
                    <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-white/6">
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="font-black text-white text-base leading-tight truncate">
                          {order.food_maker?.display_name ?? 'Restaurant'}
                        </p>
                        {/* Time ago chip */}
                        <div className="flex items-center gap-1 mt-1.5">
                          <Clock size={11} className="text-zinc-500 flex-shrink-0" />
                          <span className="text-zinc-500 text-xs font-semibold">{timeAgo(order.created_at)}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-2xl leading-none" style={{ color: '#FF7A50' }}>
                          {formatPriceDollars(order.driver_payout)}
                        </p>
                        {order.tip_amount > 0 && (
                          <p className="text-green-400 text-xs font-black mt-1">
                            +{formatPriceDollars(order.tip_amount)} tip
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route row */}
                    <div className="px-4 py-3 space-y-1.5">
                      {/* Pickup */}
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: '#FF7A50' }}
                        />
                        <span className="text-white text-sm font-semibold flex-1 truncate">
                          {order.food_maker?.display_name ?? 'Restaurant'}
                        </span>
                        {distanceM != null && (
                          <span className="text-zinc-500 text-xs font-semibold flex-shrink-0">
                            {formatDistance(distanceM)}
                          </span>
                        )}
                      </div>
                      {/* Connector */}
                      <div className="ml-[4.5px] w-px h-3 bg-zinc-700" />
                      {/* Dropoff */}
                      <div className="flex items-center gap-2.5">
                        <MapPin size={10} className="text-zinc-400 flex-shrink-0" style={{ marginLeft: 1 }} />
                        <span className="text-zinc-400 text-sm font-semibold flex-1">Delivery location</span>
                      </div>
                    </div>

                    {/* Accept button */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleAccept(order.id)}
                        disabled={isAccepting || accepting !== null}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-black text-sm tracking-wide text-white active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
                        style={{ backgroundColor: '#FF7A50' }}
                      >
                        {isAccepting ? (
                          'Accepting…'
                        ) : (
                          <>
                            Accept Delivery
                            <ChevronRight size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Waiting placeholder — compact, no full empty state */
            <div className="flex items-center gap-3 px-4 py-3 bg-[#131313]/70 border border-white/6 rounded-2xl">
              <span className="text-lg leading-none">🛵</span>
              <span className="text-zinc-500 text-sm font-semibold">Waiting for orders…</span>
            </div>
          )}

          {/* Accepting orders label + Go Off button + metrics */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
              </span>
              <span className="font-black text-green-400 text-sm tracking-wide">Accepting orders</span>
            </div>
            <button
              onClick={toggleOnline}
              disabled={toggling}
              className="relative w-24 h-24 rounded-full flex items-center justify-center active:scale-95 transition-all duration-150 disabled:opacity-60"
              style={{
                background: 'linear-gradient(145deg, #1e1e1e, #141414)',
                boxShadow: '0 0 0 4px #1c1c1c, 0 0 0 7px #222, 0 12px 32px rgba(0,0,0,0.8)',
              }}
            >
              <span className="absolute inset-0 rounded-full border border-white/8" />
              {toggling ? (
                <span className="text-zinc-300 font-black text-xl">…</span>
              ) : (
                <span className="flex flex-col items-center leading-none">
                  <span className="text-white font-black text-lg tracking-widest">Go</span>
                  <span className="text-white font-black text-lg tracking-widest">Off</span>
                </span>
              )}
            </button>
            {/* Metrics strip — directly below GoOff button */}
            <div className="w-full flex items-stretch bg-[#141414]/95 border border-white/8 rounded-3xl overflow-hidden backdrop-blur-sm">
              <div className="flex-1 py-3.5 text-center">
                <p className="font-black text-white text-xl leading-none">
                  {data?.profile?.acceptance_rate != null ? `${Math.round(data.profile.acceptance_rate)}%` : '—'}
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Accepted</p>
              </div>
              <div className="w-px bg-white/8" />
              <div className="flex-1 py-3.5 text-center">
                <p className="font-black text-white text-xl leading-none">
                  {data?.profile?.avg_wait_at_maker_mins != null ? `${data.profile.avg_wait_at_maker_mins}m` : '—'}
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Arrival</p>
              </div>
              <div className="w-px bg-white/8" />
              <div className="flex-1 py-3.5 text-center">
                <p className="font-black text-white text-xl leading-none">
                  {data?.profile?.avg_delivery_mins != null ? `${data.profile.avg_delivery_mins}m` : '—'}
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Dropoff</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

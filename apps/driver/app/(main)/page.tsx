'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import { ChevronRight, Star, Package, TrendingUp, Zap } from 'lucide-react'

// Load map client-side only (Leaflet requires window)
const LiveMap = dynamic(() => import('@/components/live-map').then(m => m.LiveMap), { ssr: false })

type HomeData = {
  profile: { full_name: string; avg_rating: number; total_deliveries: number; is_active: boolean; kyc_status: string; avatar_url: string | null }
  todayEarnings: number
  todayDeliveries: number
  weekEarnings: number
  activeOrder: { id: string; status: string; food_maker: { display_name: string } | null } | null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

const DEFAULT_LAT = 40.7128
const DEFAULT_LNG = -74.006

export default function HomePage() {
  const router = useRouter()
  const { isOnline, setOnline, setActiveOrder } = useDriverStore()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const watchIdRef = useRef<number | null>(null)

  // Live location tracking
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0)

    const [profileRes, ordersRes, activeRes] = await Promise.all([
      supabase.from('driver_profiles').select('full_name, avg_rating, total_deliveries, is_active, kyc_status, avatar_url').eq('id', user.id).single(),
      supabase.from('orders').select('delivery_fee, created_at').eq('nexter_id', user.id).eq('status', 'delivered').gte('created_at', weekStart.toISOString()),
      supabase.from('orders').select('id, status, food_maker:food_makers(display_name)').eq('nexter_id', user.id).in('status', ['picked_up', 'on_the_way']).maybeSingle(),
    ])

    const allDeliveries = ordersRes.data ?? []
    const todayDeliveries = allDeliveries.filter(d => new Date(d.created_at) >= today)
    const todayEarnings = todayDeliveries.reduce((s: number, d: { delivery_fee: number }) => s + (d.delivery_fee ?? 0), 0)
    const weekEarnings = allDeliveries.reduce((s: number, d: { delivery_fee: number }) => s + (d.delivery_fee ?? 0), 0)

    if (profileRes.data?.is_active !== undefined) setOnline(profileRes.data.is_active)
    if (activeRes.data) setActiveOrder(activeRes.data.id)

    setData({
      profile: profileRes.data,
      todayEarnings,
      todayDeliveries: todayDeliveries.length,
      weekEarnings,
      activeOrder: activeRes.data,
    })
    setLoading(false)
  }, [router, setOnline, setActiveOrder])

  useEffect(() => { load() }, [load])

  const toggleOnline = async () => {
    if (!data) return
    setToggling(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const newStatus = !isOnline
      await supabase.from('driver_profiles').update({ is_active: newStatus }).eq('id', user.id)
      setOnline(newStatus)
      setData(prev => prev ? { ...prev, profile: { ...prev.profile, is_active: newStatus } } : prev)
    }
    setToggling(false)
  }

  const firstName = data?.profile.full_name?.split(' ')[0] ?? 'Driver'

  return (
    /* Full-screen stack: map behind, header + bottom-sheet on top */
    <div className="relative flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - 64px)' }}>

      {/* ── Live map (fills everything) ── */}
      <LiveMap lat={lat} lng={lng} isOnline={isOnline} />

      {/* ── Floating header ── */}
      <div className="relative z-10">
        <AppHeader greeting={loading ? undefined : { time: greeting(), name: firstName }} />
      </div>

      {/* ── Bottom sheet ── */}
      {!isOnline ? (
        /* OFFLINE — "Ready to Next?" + big GO button */
        <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-8 pt-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent">
          <div className="flex flex-col items-center gap-5">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white leading-tight">Ready to Next?</h2>
              <p className="text-zinc-400 text-sm mt-1">Tap GO to start accepting orders</p>
            </div>

            {/* Uber-style round GO button */}
            <button
              onClick={toggleOnline}
              disabled={toggling}
              className="relative w-28 h-28 rounded-full flex items-center justify-center active:scale-95 transition-transform duration-150 disabled:opacity-60"
              style={{
                background: 'linear-gradient(145deg, #1a1a1a, #111)',
                boxShadow: '0 0 0 4px #222, 0 0 0 6px #333, 0 12px 40px rgba(0,0,0,0.7)',
              }}
            >
              {/* outer ring */}
              <span className="absolute inset-0 rounded-full border-2 border-white/10" />
              <span className="text-white font-black text-2xl tracking-wider">
                {toggling ? '…' : 'GO'}
              </span>
            </button>

            {/* Earnings pill */}
            {!loading && (
              <div className="flex items-center gap-4 bg-[#141414]/80 border border-white/8 rounded-2xl px-5 py-3 backdrop-blur-sm">
                <div className="text-center">
                  <p className="font-black text-white text-lg">${(data?.todayEarnings ?? 0).toFixed(2)}</p>
                  <p className="text-[10px] text-zinc-500">Today</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="font-black text-white text-lg">{data?.todayDeliveries ?? 0}</p>
                  <p className="text-[10px] text-zinc-500">Trips</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="font-black text-white text-lg">{data?.profile?.avg_rating?.toFixed(1) ?? '—'}</p>
                  <p className="text-[10px] text-zinc-500">Rating</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ONLINE — status bar + active order + go offline */
        <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-8 pt-4 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent space-y-3">

          {/* Active order banner */}
          {data?.activeOrder && (
            <Link href="/active" className="block bg-[#FF6B35]/10 border border-[#FF6B35]/25 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#FF6B35] uppercase tracking-wide mb-1">Active Delivery</p>
                  <p className="font-black text-white text-sm">{(data.activeOrder as any).food_maker?.display_name ?? 'Order'}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 capitalize">{data.activeOrder.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
                  <ChevronRight size={16} className="text-[#FF6B35]" />
                </div>
              </div>
            </Link>
          )}

          {/* Online status row + Go Offline */}
          <div className="flex items-center justify-between bg-[#111]/80 border border-white/8 rounded-2xl px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
              </span>
              <span className="font-black text-green-400 text-sm">Online · Accepting orders</span>
            </div>
            <button
              onClick={toggleOnline}
              disabled={toggling}
              className="text-xs font-bold text-zinc-400 hover:text-white transition-colors disabled:opacity-50 bg-white/5 rounded-xl px-3 py-1.5"
            >
              {toggling ? '…' : 'Go offline'}
            </button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#111]/70 border border-white/8 rounded-xl px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="font-black text-white text-base">${(data?.todayEarnings ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Today</p>
            </div>
            <div className="bg-[#111]/70 border border-white/8 rounded-xl px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="font-black text-white text-base">{data?.todayDeliveries ?? 0}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Trips</p>
            </div>
            <Link href="/earnings" className="bg-[#111]/70 border border-white/8 rounded-xl px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="font-black text-white text-base">{data?.profile?.avg_rating?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Rating</p>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

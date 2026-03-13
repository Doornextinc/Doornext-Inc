'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import { ChevronRight } from 'lucide-react'

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
    <div className="relative flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - 64px)' }}>

      {/* Live map — interactive (pan / zoom enabled) */}
      <LiveMap lat={lat} lng={lng} isOnline={isOnline} />

      {/* Floating sticky header */}
      <div className="relative z-10">
        <AppHeader greeting={loading ? undefined : { time: greeting(), name: firstName }} />
      </div>

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
          <div className="flex justify-center mb-7">
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
              <span className="text-white font-black text-3xl tracking-widest">
                {toggling ? '…' : 'GO'}
              </span>
            </button>
          </div>

          {/* Stats strip */}
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
                <p className="font-black text-white text-2xl leading-none">{data?.profile?.avg_rating?.toFixed(1) ?? '—'}</p>
                <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Rating</p>
              </div>
            </div>
          )}
        </div>

      ) : (
        /* ── ONLINE bottom sheet ── */
        <div
          className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-8 pt-6 space-y-3"
          style={{ background: 'linear-gradient(to top, #0A0A0A 68%, rgba(10,10,10,0.6) 85%, transparent)' }}
        >
          {/* Active order banner */}
          {data?.activeOrder && (
            <Link href="/active" className="block bg-[#D4622B]/10 border border-[#D4622B]/20 rounded-2xl px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-[#D4622B] uppercase tracking-wider mb-1">Active Delivery</p>
                  <p className="font-black text-white text-base">{(data.activeOrder as any).food_maker?.display_name ?? 'Order'}</p>
                  <p className="text-sm text-zinc-400 mt-0.5 capitalize">{data.activeOrder.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#D4622B] animate-pulse" />
                  <ChevronRight size={18} className="text-[#D4622B]" />
                </div>
              </div>
            </Link>
          )}

          {/* Online indicator */}
          <div className="flex items-center gap-3 bg-[#0D190D]/95 border border-green-500/20 rounded-2xl px-4 py-4 backdrop-blur-sm">
            <span className="relative flex h-3.5 w-3.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-400" />
            </span>
            <span className="font-black text-green-400 text-base flex-1">Online · Accepting orders</span>
          </div>

          {/* Stats row */}
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
              <p className="font-black text-white text-xl leading-none">{data?.profile?.avg_rating?.toFixed(1) ?? '—'}</p>
              <p className="text-xs text-zinc-500 mt-1.5 font-semibold">Rating</p>
            </Link>
          </div>

          {/* Go Offline — full width, clearly tappable but not alarming */}
          <button
            onClick={toggleOnline}
            disabled={toggling}
            className="w-full bg-[#181818] border border-white/10 rounded-2xl py-4 font-black text-base text-zinc-300 hover:text-white hover:border-white/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {toggling ? '…' : 'Go Offline'}
          </button>
        </div>
      )}
    </div>
  )
}

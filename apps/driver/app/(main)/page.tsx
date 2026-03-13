'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import { ChevronRight, Star, Package, Zap, Clock, TrendingUp, Navigation, MapPin } from 'lucide-react'

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

export default function HomePage() {
  const router = useRouter()
  const { isOnline, setOnline, setActiveOrder } = useDriverStore()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

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

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="h-44 bg-[#141414] animate-pulse" />
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-[#141414] rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  const firstName = data?.profile.full_name?.split(' ')[0] ?? 'Driver'
  const initials = (data?.profile.full_name ?? 'D')[0].toUpperCase()

  return (
    <div className="flex flex-col min-h-full pb-8">
      <AppHeader greeting={{ time: greeting(), name: firstName }} />

      {/* Online / Offline hero */}
      {!isOnline ? (
        <div className="mx-4 mb-5">
          <div className="bg-gradient-to-br from-[#141414] to-[#0A0A0A] rounded-3xl border border-white/5 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🛵</span>
            </div>
            <h2 className="text-xl font-black text-white mb-1">Ready to dash?</h2>
            <p className="text-zinc-400 text-sm mb-5">Go online to start receiving delivery offers</p>
            <button
              onClick={toggleOnline}
              disabled={toggling}
              className="w-full bg-[#FF6B35] text-white font-black text-base py-4 rounded-2xl shadow-lg shadow-[#FF6B35]/30 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {toggling ? 'Going Online…' : 'Go Online'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-4 mb-5 space-y-3">
          {/* Online status bar */}
          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="font-bold text-green-400 text-sm">You're online</span>
              <span className="text-green-400/50 text-xs">· Accepting orders</span>
            </div>
            <button onClick={toggleOnline} disabled={toggling} className="text-xs font-bold text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
              {toggling ? '…' : 'Go Offline'}
            </button>
          </div>

          {/* Active order banner */}
          {data?.activeOrder && (
            <Link href="/active" className="block bg-[#FF6B35]/10 border border-[#FF6B35]/25 rounded-2xl p-4">
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
        </div>
      )}

      {/* Earnings hero */}
      <div className="mx-4 mb-4">
        <div className="bg-gradient-to-br from-[#141414] to-[#0A0A0A] rounded-2xl border border-white/5 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-wide mb-1">Today's Earnings</p>
              <p className="text-4xl font-black text-white">${(data?.todayEarnings ?? 0).toFixed(2)}</p>
              <p className="text-xs text-zinc-500 mt-1">
                This week: <span className="text-zinc-300 font-semibold">${(data?.weekEarnings ?? 0).toFixed(2)}</span>
              </p>
            </div>
            <Link href="/earnings" className="text-xs text-[#FF6B35] font-bold flex items-center gap-1">
              Details <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
            <div className="text-center">
              <p className="font-black text-white text-lg">{data?.todayDeliveries ?? 0}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Today</p>
            </div>
            <div className="text-center border-x border-white/5">
              <p className="font-black text-white text-lg">{data?.profile.avg_rating?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Rating</p>
            </div>
            <div className="text-center">
              <p className="font-black text-white text-lg">{data?.profile.total_deliveries ?? 0}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">All time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Daily challenge */}
      <div className="mx-4 mb-4">
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center">
                <Zap size={14} className="text-[#FF6B35]" />
              </div>
              <p className="font-bold text-white text-sm">Daily Challenge</p>
            </div>
            <span className="text-xs font-black text-[#FF6B35]">+$5.00</span>
          </div>
          <p className="text-sm text-zinc-300 mb-3">Complete 5 deliveries today</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF6B35] rounded-full"
                style={{ width: `${Math.min(((data?.todayDeliveries ?? 0) / 5) * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-zinc-400 flex-shrink-0">{Math.min(data?.todayDeliveries ?? 0, 5)}/5</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mx-4 mb-4 grid grid-cols-2 gap-3">
        <Link href="/available" className="bg-[#141414] rounded-2xl border border-white/5 p-4 flex items-center gap-3 active:scale-[0.98] transition-all">
          <div className="w-10 h-10 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
            <Navigation size={18} className="text-[#FF6B35]" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Find Pickups</p>
            <p className="text-xs text-zinc-500">Browse orders</p>
          </div>
        </Link>
        <Link href="/history" className="bg-[#141414] rounded-2xl border border-white/5 p-4 flex items-center gap-3 active:scale-[0.98] transition-all">
          <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-zinc-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">History</p>
            <p className="text-xs text-zinc-500">Past deliveries</p>
          </div>
        </Link>
      </div>

      {/* Performance stats */}
      <div className="mx-4">
        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-3 px-0.5">Performance</p>
        <div className="bg-[#141414] rounded-2xl border border-white/5 divide-y divide-white/5">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
                <Star size={15} className="text-[#FF6B35]" />
              </div>
              <p className="text-sm font-semibold text-white">Customer Rating</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-black text-white">{data?.profile.avg_rating?.toFixed(1) ?? '—'}</span>
              <span className="text-zinc-600 text-xs">/ 5.0</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
                <Package size={15} className="text-[#FF6B35]" />
              </div>
              <p className="text-sm font-semibold text-white">Total Deliveries</p>
            </div>
            <span className="font-black text-white">{data?.profile.total_deliveries ?? 0}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
                <TrendingUp size={15} className="text-[#FF6B35]" />
              </div>
              <p className="text-sm font-semibold text-white">This Week</p>
            </div>
            <span className="font-black text-white">${(data?.weekEarnings ?? 0).toFixed(2)}</span>
          </div>
          <Link href="/available" className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#1A1A1A] flex items-center justify-center">
                <MapPin size={15} className="text-zinc-400" />
              </div>
              <p className="text-sm font-semibold text-white">Available Orders</p>
            </div>
            <ChevronRight size={16} className="text-zinc-600" />
          </Link>
        </div>
      </div>
    </div>
  )
}

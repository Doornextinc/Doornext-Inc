'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { ChevronRight, AlertTriangle, MapPin, Clock, Plus, CheckCircle, Star, Menu, X } from 'lucide-react'
import { haversineDistance, formatDistance, formatPriceDollars, estimateMinutes, formatEta } from '@doornext/shared/utils'
import { playWithHaptic, initAudio } from '@/lib/notification-sounds'
import type { StackCandidate } from '@/app/api/driver/stack-candidates/route'

const LiveMap = dynamic(() => import('@/components/live-map').then(m => m.LiveMap), { ssr: false })
const RoutePreviewMap = dynamic(
  () => import('@/components/route-preview-map').then(m => m.RoutePreviewMap),
  { ssr: false }
)

type HomeData = {
  profile: {
    full_name: string; avg_rating: number; total_deliveries: number; is_active: boolean
    kyc_status: string; avatar_url: string | null
    acceptance_rate: number | null
    completion_rate: number | null
    on_time_delivery_rate: number | null
    issues_reported: number
  }
  todayEarnings: number
  todayDeliveries: number
  weekEarnings: number
  activeOrder: { id: string; status: string; food_maker: { display_name: string } | null } | null
}

type AvailableOrder = {
  id: string
  status: string
  total: number
  delivery_fee: number
  driver_payout: number
  tip_amount: number
  created_at: string
  food_maker: { display_name: string; lat: number; lng: number; address?: string | null } | null
  delivery_address: { street?: string; city?: string; lat?: number; lng?: number } | null
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
  const { isOnline, setOnline, setActiveOrder, setActiveOrders, addActiveOrder, activeOrderIds, currentLat, currentLng } = useDriverStore()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionTarget, setTransitionTarget] = useState(false)
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const watchIdRef = useRef<number | null>(null)

  // Available orders state
  const [orders, setOrders] = useState<AvailableOrder[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<{ orderId: string; message: string } | null>(null)
  const knownOrderIds = useRef<Set<string>>(new Set())

  // Stack candidates — shown when driver has 1 active order
  const [stackCandidates, setStackCandidates] = useState<StackCandidate[]>([])
  const [addingToRoute, setAddingToRoute] = useState<string | null>(null)

  // Post-accept holding state: driver stays on home to optionally stack before starting route
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null)
  const [startRouteCountdown, setStartRouteCountdown] = useState<number | null>(null)

  // ── Dasher-style dashboard UI state ─────────────────────────────────────
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const userId = useDriverStore((s) => s.userId)

  // Realtime unread count for the floating bell
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const refresh = () => supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ count }) => setUnreadCount(count ?? 0))
    refresh()
    const channel = supabase
      .channel('driver-home-bell')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // Close side menu when navigating
  const closeSideMenu = useCallback(() => setSideMenuOpen(false), [])

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

      const [profileRes, ordersRes, activeRes, completionRes] = await Promise.all([
        supabase.from('driver_profiles').select('full_name, avg_rating, total_deliveries, is_active, kyc_status, avatar_url, acceptance_rate, on_time_delivery_rate, issues_reported').eq('id', user.id).single(),
        supabase.from('orders').select('driver_payout, created_at').eq('nexter_id', user.id).eq('status', 'delivered').gte('created_at', weekStart.toISOString()),
        supabase.from('orders').select('id, status, food_maker:food_makers(display_name)').eq('nexter_id', user.id).in('status', ['driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer']).maybeSingle(),
        supabase.from('orders').select('status').eq('nexter_id', user.id).in('status', ['delivered', 'failed_delivery']),
      ])

      const allDeliveries = ordersRes.data ?? []
      const todayDeliveries = allDeliveries.filter(d => new Date(d.created_at) >= today)
      const todayEarnings = todayDeliveries.reduce((s: number, d: { driver_payout: number }) => s + (d.driver_payout ?? 0), 0)
      const weekEarnings = allDeliveries.reduce((s: number, d: { driver_payout: number }) => s + (d.driver_payout ?? 0), 0)

      const completionOrders = completionRes.data ?? []
      const computedCompletionRate = completionOrders.length > 0
        ? Math.round((completionOrders.filter(o => o.status === 'delivered').length / completionOrders.length) * 100)
        : null

      if (profileRes.data?.is_active !== undefined) setOnline(profileRes.data.is_active)
      if (activeRes.data) setActiveOrder(activeRes.data.id)

      setData({
        profile: { ...(profileRes.data as unknown as HomeData['profile']), completion_rate: computedCompletionRate },
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
      .select('id, status, total, delivery_fee, driver_payout, tip_amount, created_at, delivery_address, food_maker:food_makers(display_name, lat, lng, address)')
      .in('status', ['preparing', 'ready'])
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

  // Load stack candidates when driver has exactly 1 active order
  const loadStackCandidates = useCallback(async () => {
    if (activeOrderIds.length !== 1) { setStackCandidates([]); return }
    try {
      const params = new URLSearchParams()
      if (currentLat != null) params.set('lat', String(currentLat))
      if (currentLng != null) params.set('lng', String(currentLng))
      const res = await fetch(`/api/driver/stack-candidates?${params}`)
      if (!res.ok) return
      const { candidates } = await res.json()
      setStackCandidates(candidates ?? [])
    } catch {
      setStackCandidates([])
    }
  }, [activeOrderIds.length, currentLat, currentLng])

  useEffect(() => {
    if (!isOnline) return
    loadStackCandidates()
  }, [isOnline, loadStackCandidates])

  // Real-time subscription — only subscribe when online
  useEffect(() => {
    if (!isOnline) return
    loadOrders()
    const supabase = createClient()
    const ch = supabase.channel('home-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.ready' }, loadOrders)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.preparing' }, loadOrders)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isOnline, loadOrders])

  // Auto-navigate countdown after accepting first order
  useEffect(() => {
    if (startRouteCountdown === null) return
    if (startRouteCountdown <= 0) { router.push('/active'); return }
    const t = setTimeout(() => setStartRouteCountdown(c => c !== null ? c - 1 : null), 1000)
    return () => clearTimeout(t)
  }, [startRouteCountdown, router])

  const handleAccept = async (orderId: string) => {
    if (accepting || addingToRoute) return
    setAccepting(orderId)
    setAcceptError(null)

    // 25-second abort timeout. The accept-order route does several DB roundtrips
    // and a SECURITY DEFINER RPC; on Vercel cold starts the first request can take
    // 5–10 s. Without a long timeout, slow networks would flash "Network error"
    // even though the server commits — exactly the bug we're fixing here.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25_000)

    try {
      const res = await fetch('/api/driver/accept-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, driverLat: currentLat, driverLng: currentLng }),
        signal: controller.signal,
      })
      const json = await res.json()

      if (!res.ok) {
        setAcceptError({ orderId, message: json.error ?? 'Could not accept — please try again.' })
        return
      }

      if (json.allOrderIds?.length) setActiveOrders(json.allOrderIds)
      else setActiveOrder(orderId)
      // Skip haptic on idempotent retry so the driver isn't double-buzzed.
      if (!json.alreadyOwned) playWithHaptic('order_accepted')

      if (json.stacked) {
        // Was adding to an existing stack — go straight to active delivery
        router.push('/active')
      } else {
        // First order accepted: stay on screen so the driver can optionally stack,
        // then auto-navigate after a short window.
        setOrders(prev => prev.filter(o => o.id !== orderId))
        setAcceptedOrderId(orderId)
        setStartRouteCountdown(5)
        loadStackCandidates()
      }
    } catch (err) {
      // Distinguish actual abort (slow network) from genuine network failure.
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      setAcceptError({
        orderId,
        message: isAbort
          ? 'Taking longer than usual — tap to try again'
          : 'Network error. Please try again.',
      })
    } finally {
      clearTimeout(timeoutId)
      setAccepting(null)
    }
  }

  const handleAddToRoute = async (orderId: string) => {
    if (accepting || addingToRoute) return
    setAddingToRoute(orderId)
    setStackCandidates(prev => prev.filter(c => c.order_id !== orderId))
    setStartRouteCountdown(null) // cancel pending auto-nav

    // Same generous abort timeout as handleAccept — see comment there.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25_000)

    try {
      const res = await fetch('/api/driver/accept-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, driverLat: currentLat, driverLng: currentLng }),
        signal: controller.signal,
      })
      if (res.ok) {
        const json = await res.json()
        if (json.allOrderIds?.length) setActiveOrders(json.allOrderIds)
        else addActiveOrder(orderId)
        if (!json.alreadyOwned) playWithHaptic('order_accepted')
        router.push('/active')
      } else {
        setStackCandidates([])
        loadStackCandidates()
      }
    } catch {
      loadStackCandidates()
    } finally {
      clearTimeout(timeoutId)
      setAddingToRoute(null)
    }
  }

  const toggleOnline = async () => {
    if (toggling || transitioning) return
    const newStatus = !isOnline
    setTransitionTarget(newStatus)
    setTransitioning(true)
    setToggling(true)
    try {
      const [res] = await Promise.all([
        fetch('/api/driver/set-online', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ online: newStatus }),
        }),
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
      ])
      if (res.ok) {
        setOnline(newStatus)
        setData(prev => prev ? { ...prev, profile: { ...prev.profile, is_active: newStatus } } : prev)
      }
    } catch { /* network error — stay in current state */ } finally {
      setTransitioning(false)
      setToggling(false)
    }
  }

  const firstName = data?.profile?.full_name?.split(' ')[0] ?? 'Nexter'
  const driverLat = currentLat ?? lat
  const driverLng = currentLng ?? lng

  return (
    <div className="fixed inset-0 bg-[#080808] overflow-hidden">

      {/* ── Full-bleed map — Dasher-style background ───────────────────── */}
      <div className="absolute inset-0">
        <LiveMap lat={lat} lng={lng} isOnline={isOnline} />
      </div>

      {/* Subtle top + bottom gradients for legibility of floating controls */}
      <div className="absolute top-0 left-0 right-0 h-44 pointer-events-none bg-gradient-to-b from-[#080808]/75 via-[#080808]/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 pointer-events-none bg-gradient-to-t from-[#080808]/60 via-[#080808]/20 to-transparent" />

      {/* ── Online/Offline transition splash ── */}
      {transitioning && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#080808]/95 backdrop-blur-sm">
          <style>{`
            @keyframes ringFill {
              from { stroke-dashoffset: 427.3; }
              to   { stroke-dashoffset: 0; }
            }
          `}</style>
          <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
            <svg className="absolute inset-0 -rotate-90" width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="68" fill="none" stroke="#1a1a1a" strokeWidth="4" />
              <circle
                cx="80" cy="80" r="68" fill="none"
                stroke={transitionTarget ? '#4ade80' : '#FF7A50'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="427.3"
                style={{ strokeDashoffset: 427.3, animation: 'ringFill 3s linear forwards' }}
              />
            </svg>
            <div
              className="w-28 h-28 rounded-full flex flex-col items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #1e1e1e, #141414)',
                boxShadow: '0 0 0 5px #1c1c1c, 0 0 0 9px #222',
              }}
            >
              {transitionTarget ? (
                <span className="text-white font-black text-2xl tracking-wide">Go</span>
              ) : (
                <span className="flex flex-col items-center leading-none">
                  <span className="text-white font-black text-xl tracking-widest">Go</span>
                  <span className="text-white font-black text-xl tracking-widest">Off</span>
                </span>
              )}
            </div>
          </div>
          <p className="text-white font-black text-xl mt-8 tracking-tight">
            {transitionTarget ? 'Going Online…' : 'Going Offline…'}
          </p>
          <p className="text-zinc-500 text-sm mt-2">
            {transitionTarget ? 'Connecting to nearby orders' : 'Wrapping up your session'}
          </p>
        </div>
      )}

      {/* ── Floating top controls (hamburger / status pill / bell) ───────── */}
      <div className="absolute top-0 left-0 right-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2 px-3 pt-3">
          {/* Hamburger menu */}
          <button
            onClick={() => setSideMenuOpen(true)}
            aria-label="Open menu"
            className="w-11 h-11 rounded-2xl bg-[#0f0f0f]/95 backdrop-blur border border-white/10 flex items-center justify-center shadow-xl active:scale-95 transition-transform flex-shrink-0"
          >
            <Menu size={20} className="text-white" />
          </button>

          {/* Status pill — Online/Offline toggle (the primary action) */}
          <button
            onClick={toggleOnline}
            disabled={toggling || transitioning}
            className={`flex-1 h-11 rounded-2xl backdrop-blur border flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition-all duration-200 disabled:opacity-60 ${
              isOnline
                ? 'bg-green-500/15 border-green-500/40'
                : 'bg-[#0f0f0f]/95 border-white/10'
            }`}
          >
            {isOnline ? (
              <>
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                <span className="text-white font-black text-sm">Online</span>
                <span className="text-green-400/70 text-xs font-semibold">· tap to go off</span>
              </>
            ) : (
              <>
                <span className="text-zinc-500 text-xs">⚫</span>
                <span className="text-white font-black text-sm">Offline</span>
                <span className="text-zinc-500 text-xs font-semibold">· tap GO</span>
              </>
            )}
          </button>

          {/* Bell — notifications + chat unified */}
          <Link
            href="/notifications"
            aria-label="Notifications and messages"
            className="relative w-11 h-11 rounded-2xl bg-[#0f0f0f]/95 backdrop-blur border border-white/10 flex items-center justify-center shadow-xl active:scale-95 transition-transform flex-shrink-0"
          >
            <span className="text-base" aria-hidden>🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#FF7A50] rounded-full border-2 border-[#080808] text-white text-[10px] font-black flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* KYC banner — floats below top bar when verification incomplete */}
        {!loading && !loadError && data?.profile?.kyc_status && data.profile.kyc_status !== 'approved' && (
          <Link
            href="/onboarding"
            className="mx-3 mt-2 flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-2xl px-3 py-2.5 backdrop-blur shadow-xl"
          >
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
            <span className="flex-1 text-amber-300 font-bold text-xs leading-tight">
              {data.profile.kyc_status === 'pending_review' ? 'Verification under review — we\'ll notify you when approved'
                : data.profile.kyc_status === 'rejected' ? 'Verification rejected — tap to resubmit'
                : 'Identity verification required to accept orders'}
            </span>
            <ChevronRight size={14} className="text-amber-400/70 flex-shrink-0" />
          </Link>
        )}

        {/* Load error banner */}
        {loadError && (
          <button
            onClick={load}
            className="mx-3 mt-2 flex items-center justify-center gap-2 bg-red-500/15 border border-red-500/30 rounded-2xl px-3 py-2.5 w-[calc(100%-1.5rem)] backdrop-blur shadow-xl"
          >
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-red-400 font-bold text-xs">Failed to load — tap to retry</span>
          </button>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          Floating bottom UI — only what's actively needed, never a wrapper sheet.
          The map remains fully visible at all times.
          Order of precedence (only the first matching block renders):
            1. Offline → nothing (status pill at top is enough)
            2. Active delivery → small pill linking to /active
            3. Post-accept window → confirmation + countdown + optional stack cards
            4. Stack candidates (1 active order) → floating amber cards
            5. Available orders (no active) → floating order cards (max 2 visible)
            6. Online + no orders → tiny "waiting" pill
          ────────────────────────────────────────────────────────────────── */}

      {isOnline && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-3 pointer-events-none"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pointer-events-auto">
          {/* Active order pill — top priority */}
          {data?.activeOrder ? (
            <Link
              href="/active"
              className="relative block bg-gradient-to-r from-[#FF7A50]/20 via-[#FF7A50]/10 to-[#FF7A50]/5 border border-[#FF7A50]/30 rounded-2xl px-4 py-4 backdrop-blur-xl overflow-hidden active:scale-[0.99] transition-transform shadow-2xl"
            >
              <span
                className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(255,122,80,0.18), transparent 70%)' }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative w-2 h-2 flex-shrink-0">
                      <span className="absolute inset-0 rounded-full bg-[#FF7A50] animate-ping opacity-50" />
                      <span className="absolute inset-0 rounded-full bg-[#FF7A50]" />
                    </span>
                    <p className="text-[10px] font-black text-[#FF7A50] uppercase tracking-widest">Active Delivery</p>
                  </div>
                  <p className="font-black text-white text-base truncate">{data.activeOrder.food_maker?.display_name ?? 'Order'}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 capitalize">
                    {data.activeOrder.status.replace(/_/g, ' ')} · Tap to continue
                  </p>
                </div>
                <ChevronRight size={20} className="text-[#FF7A50] flex-shrink-0" />
              </div>
            </Link>
          ) : null}

          {/* ── Stack offer cards — shown when driver already has 1 active order (normal flow) ── */}
          {stackCandidates.length > 0 && !acceptedOrderId && (
            <div className="space-y-2">
              <p className="text-xs font-black text-[#FF7A50] uppercase tracking-wider px-1">
                💰 Add to your route — earn more
              </p>
              {stackCandidates.slice(0, 2).map((candidate) => {
                const isAdding = addingToRoute === candidate.order_id
                return (
                  <div
                    key={candidate.order_id}
                    className="bg-[#1a1200]/80 border border-amber-500/20 rounded-2xl overflow-hidden backdrop-blur-sm"
                  >
                    <div className="flex items-start justify-between px-4 pt-4 pb-3">
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="font-black text-white text-sm leading-tight truncate">
                          {candidate.maker_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-amber-400 text-xs font-black">
                            +{(candidate.detour_km).toFixed(1)} km detour
                          </span>
                          <span className="text-zinc-500 text-[10px]">•</span>
                          <span className="text-zinc-400 text-xs">
                            {Math.round(candidate.score)}% match
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-xl leading-none text-amber-400">
                          +{formatPriceDollars(candidate.driver_payout)}
                        </p>
                        {candidate.tip_amount > 0 && (
                          <p className="text-green-400 text-xs font-black mt-1">
                            +{formatPriceDollars(candidate.tip_amount)} tip
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleAddToRoute(candidate.order_id)}
                        disabled={isAdding || accepting !== null || addingToRoute !== null}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-black text-sm tracking-wide text-white bg-amber-500/80 active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
                      >
                        {isAdding ? 'Adding…' : (
                          <><Plus size={15} /> Add to Route</>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* (Stats row moved to side drawer — keeps the map free.) */}

          {/* ── Post-accept stacking window ── */}
          {acceptedOrderId && (
            <div className="space-y-3">
              {/* Confirmation + auto-nav countdown */}
              <div className="flex items-center gap-3 px-4 py-3.5 bg-green-500/12 border border-green-500/25 rounded-2xl backdrop-blur-sm">
                <CheckCircle size={22} className="text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-green-300">Order Accepted!</p>
                  <p className="text-xs text-green-400/60 mt-0.5">
                    Starting route in {startRouteCountdown}s — or add another order below
                  </p>
                </div>
                <button
                  onClick={() => { setStartRouteCountdown(null); router.push('/active') }}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-[#FF7A50] text-white text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-all"
                >
                  Start Route <ChevronRight size={13} />
                </button>
              </div>

              {/* Stack candidates */}
              {stackCandidates.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-black text-amber-400 uppercase tracking-wider px-1">
                    💰 Add to your route — earn more
                  </p>
                  {stackCandidates.slice(0, 2).map((candidate) => {
                    const isAdding = addingToRoute === candidate.order_id
                    return (
                      <div
                        key={candidate.order_id}
                        className="bg-[#1a1200]/80 border border-amber-500/20 rounded-2xl overflow-hidden backdrop-blur-sm"
                      >
                        <div className="flex items-start justify-between px-4 pt-4 pb-3">
                          <div className="flex-1 min-w-0 pr-3">
                            <p className="font-black text-white text-sm leading-tight truncate">
                              {candidate.maker_name}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-amber-400 text-xs font-black">
                                +{candidate.detour_km.toFixed(1)} km detour
                              </span>
                              <span className="text-zinc-500 text-[10px]">•</span>
                              <span className="text-zinc-400 text-xs">{Math.round(candidate.score)}% match</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-black text-xl leading-none text-amber-400">
                              +{formatPriceDollars(candidate.driver_payout)}
                            </p>
                            {candidate.tip_amount > 0 && (
                              <p className="text-green-400 text-xs font-black mt-1">
                                +{formatPriceDollars(candidate.tip_amount)} tip
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="px-4 pb-4">
                          <button
                            onClick={() => handleAddToRoute(candidate.order_id)}
                            disabled={isAdding || addingToRoute !== null}
                            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-black text-sm tracking-wide text-white bg-amber-500/80 active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
                          >
                            {isAdding ? 'Adding…' : <><Plus size={15} /> Add to Route</>}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-zinc-600 text-xs py-2">No compatible add-on orders nearby right now</p>
              )}
            </div>
          )}

          {/* ── Delivery request cards ── */}
          {!acceptedOrderId && orders.length > 0 ? (
            <div className="space-y-3">
              {orders.map(order => {
                const makerLat  = order.food_maker?.lat
                const makerLng  = order.food_maker?.lng
                const dropLat   = order.delivery_address?.lat
                const dropLng   = order.delivery_address?.lng

                // Driver → pickup distance
                // Use truthy check so 0,0 (null-island / ungeocoded address) is treated as invalid
                const toPickupM = (makerLat && makerLng)
                  ? haversineDistance(driverLat, driverLng, makerLat, makerLng)
                  : null

                // Pickup → dropoff delivery run distance
                const deliveryM = (makerLat && makerLng && dropLat && dropLng)
                  ? haversineDistance(makerLat, makerLng, dropLat, dropLng)
                  : null

                // Build address strings for display and Nominatim geocoding fallback
                const pickupAddrStr  = order.food_maker?.address ?? null
                const dropoffAddrStr = [
                  order.delivery_address?.street,
                  order.delivery_address?.city,
                ].filter(Boolean).join(', ')

                const dropoffStreet = order.delivery_address?.street
                  ? order.delivery_address.street.replace(/,.*$/, '') // keep street only (trim city)
                  : null

                // Show the route map when we have valid maker coords (pickup), regardless of
                // whether delivery coords are stored — RoutePreviewMap will geocode via Nominatim
                // when dropLat/dropLng are null/zero.
                const hasPickupCoords = !!(makerLat && makerLng)
                const hasMap = hasPickupCoords && !!(dropLat && dropLng || dropoffAddrStr)
                const isAccepting = accepting === order.id

                return (
                  <div
                    key={order.id}
                    className="bg-[#131313]/95 border border-white/8 rounded-2xl overflow-hidden backdrop-blur-sm"
                  >
                    {/* ── Card header: restaurant name + earnings ── */}
                    <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-white/6">
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="font-black text-white text-base leading-tight truncate">
                          {order.food_maker?.display_name ?? 'Kitchen'}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {order.status === 'preparing' ? (
                            <span className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5 text-[10px] font-black text-amber-400 uppercase tracking-wide">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                              Preparing
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 bg-green-500/15 border border-green-500/30 rounded-full px-2 py-0.5 text-[10px] font-black text-green-400 uppercase tracking-wide">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                              Ready
                            </span>
                          )}
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

                    {/* ── Mini route map ── */}
                    {hasMap && (
                      <div className="relative w-full h-36 border-b border-white/6">
                        <RoutePreviewMap
                          pickupLat={makerLat}
                          pickupLng={makerLng}
                          dropoffLat={dropLat}
                          dropoffLng={dropLng}
                          pickupLabel={order.food_maker?.display_name ?? 'Pickup'}
                          dropoffLabel={dropoffStreet ?? 'Dropoff'}
                          pickupAddress={!(makerLat && makerLng) && pickupAddrStr ? pickupAddrStr : undefined}
                          dropoffAddress={!(dropLat && dropLng) && dropoffAddrStr ? dropoffAddrStr : undefined}
                        />
                        {/* Delivery run distance badge — bottom-right overlay (only when we have coords) */}
                        {deliveryM != null && (
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-lg px-2.5 py-1 pointer-events-none">
                            <MapPin size={10} className="text-cyan-400 flex-shrink-0" />
                            <span className="text-white text-xs font-black">
                              {formatDistance(deliveryM)}
                            </span>
                            <span className="text-zinc-400 text-[10px] font-semibold">delivery run</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Itinerary rows ── */}
                    <div className="px-4 py-3 space-y-2">

                      {/* Pickup row */}
                      <div className="flex items-start gap-2.5">
                        {/* Orange filled circle — align with top line */}
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#FF7A50' }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm font-semibold truncate block">
                            {order.food_maker?.display_name ?? 'Kitchen'}
                          </span>
                          {pickupAddrStr && (
                            <span className="text-zinc-500 text-xs truncate block mt-0.5">
                              {pickupAddrStr}
                            </span>
                          )}
                        </div>
                        {toPickupM != null && (
                          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                            <span className="text-zinc-500 text-xs font-semibold">
                              {formatDistance(toPickupM)} away
                            </span>
                            <span className="bg-[#FF7A50]/15 text-[#FF7A50] text-[10px] font-black px-1.5 py-0.5 rounded-full">
                              ~{formatEta(estimateMinutes(toPickupM))}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Dashed connector line */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 flex justify-center flex-shrink-0">
                          <div className="w-px h-4 border-l-2 border-dashed border-zinc-600" />
                        </div>
                        {/* Delivery run distance between the two stops (if no map is shown) */}
                        {!hasMap && deliveryM != null && (
                          <span className="text-zinc-600 text-[10px] font-semibold">{formatDistance(deliveryM)} run</span>
                        )}
                      </div>

                      {/* Dropoff row */}
                      <div className="flex items-start gap-2.5">
                        {/* Cyan hollow circle — align with top line */}
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-cyan-400 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <span className="text-zinc-300 text-sm font-semibold truncate block">
                            {dropoffStreet ?? 'Customer location'}
                          </span>
                          {order.delivery_address?.city && (
                            <span className="text-zinc-500 text-xs truncate block mt-0.5">
                              {[order.delivery_address.city].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                        {deliveryM != null && (
                          <span className="bg-cyan-400/10 text-cyan-400 text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5">
                            {formatDistance(deliveryM)}
                          </span>
                        )}
                      </div>

                    </div>

                    {/* ── Accept error ── */}
                    {acceptError?.orderId === order.id && (
                      <div className="mx-4 mb-2 px-3 py-2 bg-red-500/15 border border-red-500/25 rounded-xl text-xs text-red-400 font-semibold">
                        {acceptError.message}
                      </div>
                    )}

                    {/* ── Accept button ── */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleAccept(order.id)}
                        disabled={isAccepting || (accepting !== null && accepting !== order.id)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-black text-sm tracking-wide text-white active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
                        style={{ backgroundColor: '#FF7A50' }}
                      >
                        {isAccepting ? 'Accepting…' : <>Accept Delivery <ChevronRight size={16} /></>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : !acceptedOrderId ? (
            /* Waiting placeholder — only when no accepted order pending */
            <div className="flex items-center gap-3 px-4 py-3 bg-[#131313]/70 border border-white/6 rounded-2xl">
              <span className="text-lg leading-none">🛵</span>
              <span className="text-zinc-500 text-sm font-semibold">Waiting for orders…</span>
            </div>
          ) : null}

          </div>
        </div>
      )}

      {/* ── Side menu drawer ──────────────────────────────────────────── */}
      <div
        className={`absolute inset-0 z-40 transition-opacity duration-300 ${
          sideMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div onClick={closeSideMenu} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Drawer */}
        <div
          className={`absolute top-0 bottom-0 left-0 w-[280px] bg-[#0A0A0A] border-r border-white/10 shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
            sideMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
            <p className="text-white font-black text-xl tracking-tight">Doornext</p>
            <button
              onClick={closeSideMenu}
              aria-label="Close menu"
              className="w-9 h-9 rounded-xl bg-[#1A1A1A] border border-white/8 flex items-center justify-center active:scale-95 transition-transform"
            >
              <X size={16} className="text-zinc-400" />
            </button>
          </div>

          {/* Profile peek */}
          <Link
            href="/profile"
            onClick={closeSideMenu}
            className="flex items-center gap-3 px-4 py-4 border-b border-white/8 active:bg-white/5"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D4622B] to-[#E07545] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-base">
                {(data?.profile?.full_name ?? firstName)[0]?.toUpperCase() ?? 'N'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{data?.profile?.full_name ?? 'Nexter'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Star size={11} className="text-amber-400 fill-amber-400" />
                <span className="text-zinc-400 text-xs font-semibold">
                  {data?.profile?.avg_rating != null ? data.profile.avg_rating.toFixed(1) : '—'}
                </span>
                <span className="text-zinc-600 text-xs">·</span>
                <span className="text-zinc-500 text-xs">{data?.profile?.total_deliveries ?? 0} trips</span>
              </div>
            </div>
            <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" />
          </Link>

          {/* Today snapshot — earnings + trip count + KPIs (moved here from the old bottom sheet) */}
          {!loading && (
            <div className="px-4 py-4 border-b border-white/8 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Today&apos;s earnings</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="font-black text-white text-3xl leading-none tracking-tight">
                    ${(data?.todayEarnings ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {data?.todayDeliveries ?? 0} trip{data?.todayDeliveries === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="text-xs text-zinc-600 mt-1.5">
                  <span className="text-zinc-400 font-semibold">${(data?.weekEarnings ?? 0).toFixed(0)}</span> this week
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-[#1A1A1A] border border-white/5 rounded-xl py-2 px-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Accept</p>
                  <p className={`text-base font-black leading-none mt-0.5 ${
                    data?.profile?.acceptance_rate == null ? 'text-zinc-500'
                    : data.profile.acceptance_rate >= 80 ? 'text-green-400'
                    : data.profile.acceptance_rate >= 60 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {data?.profile?.acceptance_rate != null ? `${Math.round(data.profile.acceptance_rate)}%` : '—'}
                  </p>
                </div>
                <div className="bg-[#1A1A1A] border border-white/5 rounded-xl py-2 px-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">On-Time</p>
                  <p className={`text-base font-black leading-none mt-0.5 ${
                    data?.profile?.on_time_delivery_rate == null ? 'text-zinc-500'
                    : data.profile.on_time_delivery_rate >= 85 ? 'text-green-400'
                    : data.profile.on_time_delivery_rate >= 65 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {data?.profile?.on_time_delivery_rate != null ? `${Math.round(data.profile.on_time_delivery_rate)}%` : '—'}
                  </p>
                </div>
                <div className="bg-[#1A1A1A] border border-white/5 rounded-xl py-2 px-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Complete</p>
                  <p className={`text-base font-black leading-none mt-0.5 ${
                    data?.profile?.completion_rate == null ? 'text-zinc-500'
                    : data.profile.completion_rate >= 90 ? 'text-green-400'
                    : data.profile.completion_rate >= 70 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {data?.profile?.completion_rate != null ? `${Math.round(data.profile.completion_rate)}%` : '—'}
                  </p>
                </div>
                <div className="bg-[#1A1A1A] border border-white/5 rounded-xl py-2 px-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Issues</p>
                  <p className={`text-base font-black leading-none mt-0.5 ${
                    (data?.profile?.issues_reported ?? 0) === 0 ? 'text-green-400'
                    : (data?.profile?.issues_reported ?? 0) <= 3 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {data?.profile?.issues_reported ?? 0}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Nav items */}
          <nav className="flex-1 py-2 overflow-y-auto">
            {[
              { href: '/',              emoji: '🏠', label: 'Home',          badge: 0 },
              { href: '/active',        emoji: '🗺️', label: 'Trips',         badge: 0 },
              { href: '/earnings',      emoji: '📈', label: 'Earnings',      badge: 0 },
              { href: '/history',       emoji: '📜', label: 'History',       badge: 0 },
              { href: '/notifications', emoji: '🔔', label: 'Notifications', badge: unreadCount },
              { href: '/documents',     emoji: '🪪', label: 'Documents',     badge: 0 },
              { href: '/settings',      emoji: '⚙️', label: 'Settings',      badge: 0 },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSideMenu}
                className="flex items-center gap-3 px-4 py-3 active:bg-white/5 transition-colors"
              >
                <span className="text-xl flex-shrink-0" aria-hidden>{item.emoji}</span>
                <span className="flex-1 text-white text-sm font-semibold">{item.label}</span>
                {item.badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-[#FF7A50] rounded-full text-white text-[10px] font-black flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/8">
            <p className="text-[10px] text-zinc-700 font-semibold tracking-wide">Nexter v1.0.0</p>
          </div>
        </div>
      </div>

    </div>
  )
}

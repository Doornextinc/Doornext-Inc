'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@doornext/ui/badge'
import { Skeleton } from '@doornext/ui/skeleton'
import { toast } from '@/components/ui/toast'
import type { Order, FoodMaker, OrderStatus } from '@doornext/shared/types'
import {
  Power, ChevronRight, Bell, Plus, Package, Clock,
  DollarSign, TrendingUp, UtensilsCrossed, User,
  CheckCircle2, ImagePlus, ChefHat, ArrowRight, Check,
} from 'lucide-react'

// ─── Audio alert ────────────────────────────────────────────────────────────
function playOrderAlert() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.15, 0.3].forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.12)
    })
  } catch {}
}

// ─── Types ───────────────────────────────────────────────────────────────────
type OrderWithItems = Order & {
  order_items: Array<{ quantity: number; menu_item: { name: string } | null }>
}

interface DashboardStats {
  totalMenuItems: number
  availableMenuItems: number
  pendingOrders: number
  todayOrders: number
  todayRevenue: number
  monthOrders: number
  monthRevenue: number
}

// Orders stay "active" for the maker until a driver confirms pickup.
// driver_assigned = driver accepted and is on the way to the kitchen.
// arrived_at_maker = driver is at the door — hand over the food.
// Once status reaches picked_up the order is in transit and leaves this view.
const ACTIVE_STATUSES: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36 rounded-lg" />
              <Skeleton className="h-3.5 w-24 rounded" />
            </div>
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-4 space-y-2 border border-gray-100">
            <Skeleton className="h-3.5 w-20 rounded" />
            <Skeleton className="h-7 w-16 rounded-lg" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        ))}
      </div>
      {/* Orders */}
      <div className="px-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [maker, setMaker] = useState<FoodMaker | null>(null)
  const [activeOrders, setActiveOrders] = useState<OrderWithItems[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    totalMenuItems: 0, availableMenuItems: 0,
    pendingOrders: 0, todayOrders: 0, todayRevenue: 0,
    monthOrders: 0, monthRevenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [quickUpdating, setQuickUpdating] = useState<string | null>(null) // orderId being quick-actioned
  const prevPendingCount = useRef(0)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const makerRes = await supabase
      .from('food_makers').select('*').eq('user_id', user.id).single()
    if (!makerRes.data) { setLoading(false); return }
    const m = makerRes.data

    // Gate: approved makers always go straight to dashboard — admin approval implies KYC pass.
    // Only send to onboarding/pending if not yet approved.
    if (m.approval_status !== 'approved') {
      if (!m.kyc_status || m.kyc_status === 'not_submitted') { router.push('/onboarding'); return }
      router.push('/pending'); return
    }

    setMaker(m)

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const [menuTotal, menuAvail, monthOrders, activeOrdersRes] = await Promise.all([
      supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('maker_id', m.id),
      supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('maker_id', m.id).eq('is_available', true),
      supabase.from('orders')
        .select('id, subtotal, status, created_at')
        .eq('maker_id', m.id)
        .gte('created_at', monthStart.toISOString()),
      supabase.from('orders')
        .select('*, order_items(quantity, menu_item:menu_items(name))')
        .eq('maker_id', m.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const allMonth = monthOrders.data ?? []
    const delivered = allMonth.filter((o) => o.status === 'delivered')
    const todayDelivered = delivered.filter((o) => new Date(o.created_at) >= today)

    setStats({
      totalMenuItems: menuTotal.count ?? 0,
      availableMenuItems: menuAvail.count ?? 0,
      pendingOrders: (activeOrdersRes.data ?? []).filter((o) => o.status === 'pending').length,
      todayOrders: todayDelivered.length,
      todayRevenue: todayDelivered.reduce((s, o) => s + (Number(o.subtotal) || 0) * 0.85, 0),
      monthOrders: delivered.length,
      monthRevenue: delivered.reduce((s, o) => s + (Number(o.subtotal) || 0) * 0.85, 0),
    })
    setActiveOrders((activeOrdersRes.data ?? []) as OrderWithItems[])
    setLoading(false)
  }, [router])

  // Initial load
  useEffect(() => { loadData() }, [loadData])

  // New-order audio alert
  useEffect(() => {
    const pendingNow = activeOrders.filter((o) => o.status === 'pending').length
    if (!loading && pendingNow > prevPendingCount.current) {
      playOrderAlert()
      toast.info('New order received!')
    }
    prevPendingCount.current = pendingNow
  }, [activeOrders, loading])

  // Realtime subscription
  useEffect(() => {
    if (!maker) return
    const supabase = createClient()
    const channel = supabase
      .channel('maker-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` }, loadData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `maker_id=eq.${maker.id}` }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [maker, loadData])

  const quickAdvance = async (e: React.MouseEvent, orderId: string, nextStatus: string) => {
    e.stopPropagation()
    setQuickUpdating(orderId)
    try {
      const res = await fetch('/api/maker/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: nextStatus }),
      })
      if (res.ok) await loadData()
    } finally {
      setQuickUpdating(null)
    }
  }

  const toggleOpen = async () => {
    if (!maker || toggling) return
    setToggling(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('food_makers').update({ is_open: !maker.is_open }).eq('id', maker.id).select().single()
    if (data) setMaker(data)
    setToggling(false)
  }

  if (loading) return <DashboardSkeleton />

  // ── Setup progress ────────────────────────────────────────────────────────
  const setupSteps = [
    { done: !!maker?.display_name,                   label: 'Kitchen name',    href: '/settings' },
    { done: !!maker?.avatar_url,                     label: 'Profile photo',   href: '/settings' },
    { done: (maker?.cuisine_tags?.length ?? 0) > 0,  label: 'Cuisine types',   href: '/settings' },
    { done: stats.totalMenuItems > 0,                label: 'Menu items',      href: '/menu'     },
  ]
  const setupDone = setupSteps.filter((s) => s.done).length
  const setupProgress = (setupDone / setupSteps.length) * 100
  const showSetup = setupProgress < 100

  // ── Order buckets ─────────────────────────────────────────────────────────
  const pending   = activeOrders.filter((o) => o.status === 'pending')
  const preparing = activeOrders.filter((o) => ['confirmed', 'preparing'].includes(o.status))
  // "Ready / Pickup" bucket: food is ready AND includes driver-arrival states
  // so orders never disappear before the driver has actually collected the food.
  const ready     = activeOrders.filter((o) =>
    ['ready', 'driver_assigned', 'arrived_at_maker'].includes(o.status)
  )
  const initials  = (maker?.display_name?.[0] ?? 'D').toUpperCase()

  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* ── Sticky Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="px-4 pt-4 pb-3">

          {/* Store identity row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] overflow-hidden shadow-md shadow-[#FF6B35]/25 flex items-center justify-center">
                  {maker?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={maker.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xl font-black">{initials}</span>
                  )}
                </div>
                {/* Online dot */}
                <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${maker?.is_open ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              </div>

              {/* Name + tags */}
              <div className="min-w-0">
                <h1 className="text-[17px] font-black text-gray-900 leading-tight truncate">
                  {maker?.display_name}
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-xs font-semibold ${maker?.is_open ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {maker?.is_open ? 'Open' : 'Closed'}
                  </span>
                  {(maker?.cuisine_tags ?? []).slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[10px] bg-orange-50 text-[#FF6B35] px-1.5 py-0.5 rounded-full font-semibold border border-orange-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Open/close toggle */}
            <button
              onClick={toggleOpen}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 flex-shrink-0 ${
                maker?.is_open
                  ? 'bg-[#FF6B35] text-white shadow-md shadow-[#FF6B35]/30'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Power size={14} strokeWidth={2.5} />
              {maker?.is_open ? 'Open' : 'Closed'}
            </button>
          </div>

          {/* Action buttons row */}
          <div className="flex gap-2">
            {stats.pendingOrders > 0 && (
              <Link
                href="/orders"
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold active:bg-red-100 transition-colors"
              >
                <Bell size={13} />
                {stats.pendingOrders} new order{stats.pendingOrders !== 1 ? 's' : ''}
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              </Link>
            )}
            <Link
              href="/menu"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B35] text-white rounded-xl text-xs font-bold active:bg-[#E55A24] transition-colors ml-auto shadow-sm shadow-[#FF6B35]/25"
            >
              <Plus size={13} strokeWidth={2.5} />
              Add Item
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 border-t border-gray-100 divide-x divide-gray-100">
          {[
            { label: 'Menu',    value: stats.totalMenuItems,    sub: `${stats.availableMenuItems} live` },
            { label: 'Pending', value: stats.pendingOrders,     sub: 'to process',                       accent: stats.pendingOrders > 0 },
            { label: 'Today',   value: fmt(stats.todayRevenue), sub: `${stats.todayOrders} orders` },
            { label: 'Month',   value: fmt(stats.monthRevenue), sub: `${stats.monthOrders} orders` },
          ].map(({ label, value, sub, accent }) => (
            <div key={label} className="px-2 py-2.5 text-center">
              <p className={`font-black text-[15px] leading-none ${accent ? 'text-red-500' : 'text-gray-900'}`}>{value}</p>
              <p className="text-[9px] font-semibold text-gray-400 mt-0.5 uppercase tracking-wide">{label}</p>
              <p className="text-[9px] text-gray-300 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-5">

        {/* ── Setup progress card ───────────────────────────────────────── */}
        {showSetup && (
          <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-black text-gray-900 text-sm">Finish setting up your kitchen</h2>
                <span className="text-xs font-bold text-[#FF6B35]">{setupDone}/{setupSteps.length}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">Complete your profile to attract more customers</p>

              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-[#FF6B35] to-[#FF8C5A] rounded-full transition-all duration-500"
                  style={{ width: `${setupProgress}%` }}
                />
              </div>

              {/* Steps */}
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {setupSteps.map((step) => (
                  <div key={step.label} className="flex items-center gap-1.5">
                    {step.done ? (
                      <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border-2 border-gray-200 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${step.done ? 'text-gray-400 line-through' : 'text-gray-600 font-medium'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA buttons for remaining steps */}
              <div className="flex flex-wrap gap-2">
                {!maker?.avatar_url && (
                  <Link href="/settings" className="flex items-center gap-1 text-xs text-[#FF6B35] font-bold bg-orange-50 border border-orange-100 px-2.5 py-1.5 rounded-lg">
                    <ImagePlus size={11} />
                    Add photo
                  </Link>
                )}
                {(maker?.cuisine_tags?.length ?? 0) === 0 && (
                  <Link href="/settings" className="flex items-center gap-1 text-xs text-[#FF6B35] font-bold bg-orange-50 border border-orange-100 px-2.5 py-1.5 rounded-lg">
                    <ChefHat size={11} />
                    Add cuisines
                  </Link>
                )}
                {stats.totalMenuItems === 0 && (
                  <Link href="/menu" className="flex items-center gap-1 text-xs text-[#FF6B35] font-bold bg-orange-50 border border-orange-100 px-2.5 py-1.5 rounded-lg">
                    <Package size={11} />
                    Add items
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Live order board ──────────────────────────────────────────── */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-[11px] font-black text-red-500 uppercase tracking-widest">
                New Orders ({pending.length})
              </h2>
            </div>
            <div className="space-y-2">
              {pending.map((order) => (
                <OrderCard
                  key={order.id} order={order} accent="red"
                  onClick={() => router.push(`/orders/${order.id}`)}
                  onQuickAction={(e) => quickAdvance(e, order.id, 'confirmed')}
                  quickActionLabel="Accept Order"
                  quickActionUpdating={quickUpdating === order.id}
                />
              ))}
            </div>
          </section>
        )}

        {preparing.length > 0 && (
          <section>
            <h2 className="text-[11px] font-black text-amber-500 uppercase tracking-widest mb-3">
              Preparing ({preparing.length})
            </h2>
            <div className="space-y-2">
              {preparing.map((order) => (
                <OrderCard
                  key={order.id} order={order} accent="amber"
                  onClick={() => router.push(`/orders/${order.id}`)}
                  onQuickAction={(e) => quickAdvance(e, order.id, order.status === 'confirmed' ? 'preparing' : 'ready')}
                  quickActionLabel={order.status === 'confirmed' ? 'Start Preparing' : 'Mark as Ready'}
                  quickActionUpdating={quickUpdating === order.id}
                />
              ))}
            </div>
          </section>
        )}

        {ready.length > 0 && (
          <section>
            <h2 className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-3">
              Ready / Awaiting Pickup ({ready.length})
            </h2>
            <div className="space-y-2">
              {ready.map((order) => (
                <OrderCard
                  key={order.id} order={order} accent="green"
                  onClick={() => router.push(`/orders/${order.id}`)}
                  driverStatus={
                    order.status === 'arrived_at_maker' ? 'arrived' :
                    order.status === 'driver_assigned'  ? 'on_the_way' : null
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {activeOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-50 to-white border border-orange-100 flex items-center justify-center mb-4 shadow-sm">
              <span className="text-4xl">🍽️</span>
            </div>
            <h3 className="text-lg font-black text-gray-900">
              {maker?.is_open ? 'Waiting for orders…' : 'Kitchen is closed'}
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              {maker?.is_open ? 'New orders will appear here' : 'Open your kitchen to start receiving orders'}
            </p>
            {!maker?.is_open && (
              <button
                onClick={toggleOpen}
                className="mt-5 bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl px-6 py-3 font-bold text-sm shadow-md shadow-[#FF6B35]/30 transition-colors"
              >
                Open Kitchen
              </button>
            )}
          </div>
        )}

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/menu',     icon: UtensilsCrossed, label: 'Manage Menu',  sub: `${stats.totalMenuItems} items` },
              { href: '/orders',   icon: Package,          label: 'All Orders',   sub: `${stats.monthOrders} this month` },
              { href: '/earnings', icon: TrendingUp,       label: 'Earnings',     sub: fmt(stats.monthRevenue) + ' this month' },
              { href: '/profile',  icon: User,             label: 'Account',      sub: 'Profile & settings' },
            ].map(({ href, icon: Icon, label, sub }) => (
              <Link
                key={href}
                href={href}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 active:bg-orange-50/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-[#FF6B35]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{label}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{sub}</p>
                </div>
                <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}

// ─── Order card component ─────────────────────────────────────────────────────
function OrderCard({ order, accent, onClick, onQuickAction, quickActionLabel, quickActionUpdating, driverStatus }: {
  order: OrderWithItems
  accent: 'red' | 'amber' | 'green'
  onClick: () => void
  onQuickAction?: (e: React.MouseEvent) => void
  quickActionLabel?: string
  quickActionUpdating?: boolean
  /** Non-null when a driver has been assigned — shows a pickup status banner */
  driverStatus?: 'on_the_way' | 'arrived' | null
}) {
  const itemsSummary = order.order_items
    .map((oi) => `${oi.quantity}× ${oi.menu_item?.name ?? 'Item'}`)
    .join(', ')

  const borderColor = accent === 'red' ? '#EF4444' : accent === 'amber' ? '#F59E0B' : '#10B981'

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Driver arrival banner — shown when driver is on the way or at the door */}
      {driverStatus === 'arrived' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <span className="text-xs font-black text-emerald-700">🛵 Driver is here — ready to hand over</span>
        </div>
      )}
      {driverStatus === 'on_the_way' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
          <span className="text-xs font-bold text-blue-700">🛵 Driver assigned — on the way to pick up</span>
        </div>
      )}

      <button
        onClick={onClick}
        className="w-full p-4 text-left active:bg-orange-50/50 transition-colors flex items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="font-black text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</p>
            <span className="text-xs text-gray-400">
              {new Date(order.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate mb-2">{itemsSummary}</p>
          <div className="flex items-center justify-between">
            <span className="font-black text-[#FF6B35] text-base">${order.total.toFixed(2)}</span>
            <StatusBadge status={order.status} />
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
      </button>

      {/* Quick action button for actionable states */}
      {onQuickAction && quickActionLabel && (
        <div className="px-3 pb-3">
          <button
            onClick={onQuickAction}
            disabled={quickActionUpdating}
            className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:opacity-90 disabled:opacity-60 ${
              accent === 'red'
                ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                : accent === 'amber'
                  ? 'bg-[#FF6B35] text-white shadow-sm shadow-orange-200'
                  : 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
            }`}
          >
            {quickActionUpdating
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Check size={14} strokeWidth={3} />
            }
            {quickActionUpdating ? 'Updating…' : quickActionLabel}
          </button>
        </div>
      )}
    </div>
  )
}

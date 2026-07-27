'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { Zap, Star, Package, TrendingUp, ChevronDown, ChevronRight, Clock, DollarSign } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { SegmentedControl } from '@/components/ui/kit'

/* ─── types ─── */
type Delivery = { id: string; driver_payout: number; tip_amount: number; created_at: string }
type Withdrawal = { id: string; amount: number; status: string; method: string; created_at: string }
type Period = 'today' | 'week' | 'month' | 'all'
type Mission = {
  id: string; icon: string; title: string; description: string | null
  reward_amount: number; target_value: number; mission_type: string; period: string
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time',
}

/* ─── helpers ─── */
function getPeriodStart(p: Period): Date | null {
  const now = new Date()
  if (p === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d }
  if (p === 'week') {
    const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0, 0, 0, 0); return d
  }
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return null
}

function getDayBounds(daysAgo: number) {
  const base = new Date(); base.setDate(base.getDate() - daysAgo)
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const end = new Date(start); end.setDate(start.getDate() + 1)
  const label = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return { start, end, label, isToday: daysAgo === 0 }
}

const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function EarningsPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [profile, setProfile] = useState<{ total_deliveries: number; avg_rating: number } | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [withdrawnAmount, setWithdrawnAmount] = useState(0)
  const [pendingWithdrawal, setPendingWithdrawal] = useState<Withdrawal | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const [showCashOut, setShowCashOut] = useState(false)
  const [cashOutAmount, setCashOutAmount] = useState('')
  const [cashOutMethod, setCashOutMethod] = useState<'bank_transfer' | 'stripe'>('bank_transfer')
  const [cashOutLoading, setCashOutLoading] = useState(false)
  const [cashOutError, setCashOutError] = useState<string | null>(null)
  const [cashOutSuccess, setCashOutSuccess] = useState(false)

  useEffect(() => {
    // Wait for persist rehydration before making any auth decisions
    if (!hasHydrated) return
    // If userId is already known (from persisted store), load immediately.
    // If userId is null, wait for authReady before redirecting to login.
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }
    async function load() {
      const supabase = createClient()
      const [ordersRes, profileRes, missionsRes, withdrawalsRes] = await Promise.all([
        supabase.from('orders').select('id, driver_payout, tip_amount, created_at').eq('nexter_id', userId).eq('status', 'delivered').order('created_at', { ascending: false }).limit(200),
        supabase.from('driver_profiles').select('total_deliveries, avg_rating').eq('id', userId).single(),
        supabase.from('driver_missions').select('id, icon, title, description, reward_amount, target_value, mission_type, period').eq('is_active', true).order('created_at'),
        // Sum withdrawals that have been requested or paid out (excluding rejected)
        supabase.from('withdrawals').select('id, amount, status, method, created_at').eq('user_id', userId).in('status', ['pending', 'approved', 'paid']).order('created_at', { ascending: false }),
      ])
      setDeliveries(ordersRes.data ?? [])
      setProfile(profileRes.data)
      setMissions(missionsRes.data ?? [])
      const allWithdrawals = (withdrawalsRes.data ?? []) as Withdrawal[]
      setPendingWithdrawal(allWithdrawals.find(w => w.status === 'pending') ?? null)
      setWithdrawnAmount(allWithdrawals.reduce((s, w) => s + (w.amount ?? 0), 0))
      setLoading(false)
    }
    load()
  }, [router, userId, authReady, hasHydrated])

  /* ─── filtered set ─── */
  const filtered = (() => {
    const cutoff = getPeriodStart(period)
    if (!cutoff) return deliveries
    return deliveries.filter(d => new Date(d.created_at) >= cutoff)
  })()

  // driver_payout = base pay + surge share + tip (all-in payout stored at checkout)
  const totalEarnings = filtered.reduce((s, d) => s + (d.driver_payout ?? 0), 0)
  const totalTips     = filtered.reduce((s, d) => s + (d.tip_amount  ?? 0), 0)
  const basePay       = totalEarnings - totalTips
  // Available to cash out = all-time earnings minus already-withdrawn amounts
  const allTimeEarnings  = deliveries.reduce((s, d) => s + (d.driver_payout ?? 0), 0)
  const availableCashOut = Math.max(0, allTimeEarnings - withdrawnAmount)

  /* ─── 7-day chart ─── */
  const weekChart = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i
    const { start, end, label, isToday } = getDayBounds(daysAgo)
    const dayDate = new Date(); dayDate.setDate(dayDate.getDate() - daysAgo)
    const items = deliveries.filter(d => { const at = new Date(d.created_at); return at >= start && at < end })
    return {
      shortLabel: DAY_SHORT[dayDate.getDay()],
      label,
      isToday,
      total: items.reduce((s, d) => s + (d.driver_payout ?? 0), 0),
      count: items.length,
      deliveries: items,
    }
  })
  const maxBar = Math.max(...weekChart.map(d => d.total), 1)

  /* ─── daily breakdown list (past 7 days with deliveries) ─── */
  const dailyRows = weekChart.filter(d => d.count > 0)

  /* ─── today's deliveries for mission progress ─── */
  const todayCount = weekChart[6].count

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <div className="h-14 bg-surface-container border-b border-outline-variant/30 animate-pulse" />
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-surface-container rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <AppHeader title="Earnings" />

      <div className="p-4 space-y-4">
        {/* ── Period selector ── */}
        <SegmentedControl
          options={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          value={period}
          onChange={setPeriod}
        />

        {/* ── Hero earnings + cash out ── */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden">
          {/* Period label + total */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mb-2">
              {PERIOD_LABELS[period]}
            </p>
            <p className="text-5xl font-black text-on-surface tracking-tight leading-none">
              ${totalEarnings.toFixed(2)}
            </p>
            <p className="text-xs text-outline mt-2">
              {filtered.length} {filtered.length === 1 ? 'delivery' : 'deliveries'}
              {totalTips > 0 && <span className="text-neighborhood-green/80"> · ${totalTips.toFixed(2)} in tips</span>}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-surface-container-low mx-5" />

          {/* Available to cash out */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1">
                  Available to Cash Out
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-primary">${availableCashOut.toFixed(2)}</p>
                  {allTimeEarnings > 0 && (
                    <p className="text-xs text-outline">of ${allTimeEarnings.toFixed(2)} all-time</p>
                  )}
                </div>
                <p className="text-[10px] text-outline mt-1">All-time earnings minus prior withdrawals</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center">
                <DollarSign size={22} className="text-primary" />
              </div>
            </div>
          </div>

          {/* Cash Out button / modal */}
          <div className="px-4 pb-5">
            {cashOutSuccess ? (
              <div className="w-full bg-neighborhood-green/15 border border-green-500/30 rounded-2xl py-4 text-center">
                <p className="text-neighborhood-green font-bold text-sm">✓ Withdrawal request submitted!</p>
                <p className="text-outline text-xs mt-1">Admin will process within 1–2 business days</p>
              </div>
            ) : pendingWithdrawal ? (
              <div className="w-full bg-surface-container-high border border-yellow-500/20 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                <span className="text-xl flex-shrink-0">⏳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-yellow-400">Pending Withdrawal</p>
                  <p className="text-sm font-black text-on-surface mt-0.5">${Number(pendingWithdrawal.amount).toFixed(2)}</p>
                  <p className="text-[10px] text-outline mt-0.5">
                    {pendingWithdrawal.method.replace('_', ' ')} · Submitted {new Date(pendingWithdrawal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ) : showCashOut ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Amount</p>
                  <div className="flex items-center bg-surface-container-high border border-outline-variant/40 rounded-xl px-4 h-11 gap-1">
                    <span className="text-on-surface-variant font-bold text-sm">$</span>
                    <input
                      type="number"
                      min="1"
                      max={availableCashOut}
                      step="0.01"
                      value={cashOutAmount}
                      onChange={e => setCashOutAmount(e.target.value)}
                      className="flex-1 bg-transparent text-on-surface font-bold text-sm focus:outline-none"
                    />
                    <button
                      onClick={() => setCashOutAmount(availableCashOut.toFixed(2))}
                      className="text-[10px] font-black text-primary uppercase tracking-wide"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">Payout method</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([['bank_transfer', 'Bank Transfer'], ['stripe', 'Stripe']] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setCashOutMethod(val)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                          cashOutMethod === val ? 'border-primary-container bg-primary-fixed text-primary' : 'border-outline-variant/40 text-on-surface-variant'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                {cashOutError && <p className="text-xs text-error">{cashOutError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setShowCashOut(false); setCashOutError(null) }}
                    className="flex-1 py-3 rounded-2xl border border-outline-variant/40 text-on-surface-variant text-sm font-bold">
                    Cancel
                  </button>
                  <button
                    disabled={cashOutLoading}
                    onClick={async () => {
                      const amt = Math.round(parseFloat(cashOutAmount) * 100) / 100
                      if (!amt || amt < 1) { setCashOutError('Minimum withdrawal is $1.00'); return }
                      if (amt > availableCashOut) { setCashOutError(`Maximum is $${availableCashOut.toFixed(2)}`); return }
                      setCashOutLoading(true); setCashOutError(null)
                      const res = await fetch('/api/driver/request-withdrawal', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: amt, method: cashOutMethod }),
                      })
                      const data = await res.json()
                      if (!res.ok) { setCashOutError(data.error ?? 'Failed to submit request'); setCashOutLoading(false); return }
                      setCashOutSuccess(true); setShowCashOut(false); setCashOutLoading(false)
                    }}
                    className="flex-1 py-3 rounded-2xl bg-primary-container text-on-primary text-sm font-black disabled:opacity-50"
                  >
                    {cashOutLoading ? 'Submitting…' : `Request $${parseFloat(cashOutAmount || '0').toFixed(2)}`}
                  </button>
                </div>
              </div>
            ) : (
              <button
                disabled={availableCashOut < 1}
                onClick={() => { setShowCashOut(true); setCashOutAmount(availableCashOut.toFixed(2)) }}
                className="w-full bg-surface-container-high disabled:bg-surface-container disabled:text-outline border border-outline-variant/30 text-primary font-black text-sm py-2.5 rounded-xl active:scale-[0.98] transition-all"
              >
                {availableCashOut >= 1 ? `Cash Out $${availableCashOut.toFixed(2)}` : 'Nothing to Cash Out'}
              </button>
            )}
          </div>
        </div>

        {/* ── 7-Day Bar Chart ── */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/30 px-4 pt-4 pb-5">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">Last 7 Days</p>
          <div className="flex items-end gap-2 h-20">
            {weekChart.map((day, i) => {
              const pct = day.total > 0 ? Math.max((day.total / maxBar) * 100, 10) : 4
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  {/* Earnings tooltip on hover */}
                  <div className="w-full flex flex-col justify-end" style={{ height: 60 }}>
                    <div
                      style={{ height: `${pct}%` }}
                      className={`w-full rounded-t-md transition-all ${
                        day.isToday ? 'bg-primary-container' : day.total > 0 ? 'bg-outline-variant' : 'bg-surface-container-high'
                      }`}
                      title={day.total > 0 ? `$${day.total.toFixed(2)}` : ''}
                    />
                  </div>
                  <span className={`text-[10px] font-bold ${day.isToday ? 'text-primary' : 'text-outline'}`}>
                    {day.shortLabel}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-outline-variant/30">
            <div className="text-center">
              <p className="font-black text-on-surface">{profile?.total_deliveries ?? deliveries.length}</p>
              <p className="text-[10px] text-outline mt-0.5">Total</p>
            </div>
            <div className="text-center border-x border-outline-variant/30">
              <p className="font-black text-on-surface">{profile?.avg_rating?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] text-outline mt-0.5">Rating</p>
            </div>
            <div className="text-center">
              <p className="font-black text-on-surface">${filtered.length > 0 ? (totalEarnings / filtered.length).toFixed(2) : '0.00'}</p>
              <p className="text-[10px] text-outline mt-0.5">Per trip</p>
            </div>
          </div>
        </div>

        {/* ── Daily Breakdown (accordion) ── */}
        {dailyRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest px-1">Daily Breakdown</p>
            <div className="bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
              {dailyRows.map((day, i) => {
                const isOpen = expandedDay === i
                return (
                  <div key={i}>
                    <button
                      onClick={() => setExpandedDay(isOpen ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-container-low"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${day.isToday ? 'bg-primary-fixed' : 'bg-surface-container-high'}`}>
                          <Clock size={13} className={day.isToday ? 'text-primary' : 'text-on-surface-variant'} />
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-bold ${day.isToday ? 'text-primary' : 'text-on-surface'}`}>
                            {day.isToday ? 'Today' : day.label}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">{day.count} {day.count === 1 ? 'delivery' : 'deliveries'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${day.isToday ? 'text-primary' : 'text-on-surface'}`}>
                          ${day.total.toFixed(2)}
                        </span>
                        {isOpen
                          ? <ChevronDown size={14} className="text-on-surface-variant" />
                          : <ChevronRight size={14} className="text-outline" />
                        }
                      </div>
                    </button>

                    {isOpen && (
                      <div className="bg-surface-container-low divide-y divide-outline-variant/20">
                        {day.deliveries.map(d => (
                          <div key={d.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-outline-variant ml-2.5" />
                              <div>
                                <p className="text-sm text-on-surface font-medium">#{d.id.slice(-6).toUpperCase()}</p>
                                <p className="text-[11px] text-outline">
                                  {new Date(d.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-primary">+${d.driver_payout.toFixed(2)}</p>
                              {d.tip_amount > 0 && (
                                <p className="text-[11px] text-neighborhood-green">+${d.tip_amount.toFixed(2)} tip</p>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-outline-variant/30">
                          <span className="text-xs font-semibold text-outline pl-7">Subtotal</span>
                          <span className="text-xs font-black text-on-surface">${day.total.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state for breakdown */}
        {dailyRows.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center mb-4">
              <TrendingUp size={28} className="text-outline" />
            </div>
            <p className="text-on-surface-variant font-semibold">No deliveries yet</p>
            <p className="text-outline text-sm mt-1">Your completed deliveries will appear here</p>
          </div>
        )}

        {/* ── Available Missions ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Available Missions</p>
            <span className="text-[10px] font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded-full">
              Resets daily
            </span>
          </div>

          {missions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-surface-container rounded-2xl border border-outline-variant/30">
              <p className="text-on-surface-variant font-semibold text-sm">No active missions right now</p>
              <p className="text-outline text-xs mt-1">Check back soon for new challenges</p>
            </div>
          ) : (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
            {missions.map((m) => {
              // Use today's delivery count as proxy for deliveries-type missions
              const progress = Math.min(m.mission_type === 'deliveries' ? todayCount : 0, m.target_value)
              const pct = (progress / m.target_value) * 100
              const complete = progress >= m.target_value

              return (
                <div key={m.id} className={`px-4 py-4 ${complete ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${complete ? 'bg-neighborhood-green/10' : 'bg-primary-fixed'}`}>
                      {complete ? '✅' : m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className={`text-sm font-bold leading-tight ${complete ? 'line-through text-outline' : 'text-on-surface'}`}>
                          {m.title}
                        </p>
                        <span className={`text-xs font-black flex-shrink-0 ${complete ? 'text-neighborhood-green' : 'text-primary'}`}>
                          +${m.reward_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${complete ? 'bg-neighborhood-green' : 'bg-gradient-to-r from-primary-container to-primary'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-outline flex-shrink-0">
                          {progress}/{m.target_value}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          )}

          {/* Missions total potential */}
          {missions.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant/30">
            <div className="w-8 h-8 rounded-xl bg-primary-fixed flex items-center justify-center flex-shrink-0">
              <Zap size={15} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-on-surface">Complete all missions</p>
              <p className="text-xs text-outline">Earn up to ${missions.reduce((s, m) => s + m.reward_amount, 0).toFixed(2)} in bonuses today</p>
            </div>
            <span className="font-black text-primary text-sm">${missions.reduce((s, m) => s + m.reward_amount, 0).toFixed(2)}</span>
          </div>
          )}
        </div>

        {/* Bottom breathing room */}
        <div className="h-4" />
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Star, Package, TrendingUp, ChevronDown, ChevronRight, Clock, DollarSign } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'

/* ─── types ─── */
type Delivery = { id: string; delivery_fee: number; tip_amount: number; created_at: string }
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
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [profile, setProfile] = useState<{ total_deliveries: number; avg_rating: number } | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const [showCashOut, setShowCashOut] = useState(false)
  const [cashOutMethod, setCashOutMethod] = useState<'bank_transfer' | 'paypal' | 'check'>('bank_transfer')
  const [cashOutLoading, setCashOutLoading] = useState(false)
  const [cashOutError, setCashOutError] = useState<string | null>(null)
  const [cashOutSuccess, setCashOutSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [ordersRes, profileRes, missionsRes] = await Promise.all([
        supabase.from('orders').select('id, delivery_fee, tip_amount, created_at').eq('nexter_id', user.id).eq('status', 'delivered').order('created_at', { ascending: false }).limit(200),
        supabase.from('driver_profiles').select('total_deliveries, avg_rating').eq('id', user.id).single(),
        supabase.from('driver_missions').select('id, icon, title, description, reward_amount, target_value, mission_type, period').eq('is_active', true).order('created_at'),
      ])
      setDeliveries(ordersRes.data ?? [])
      setProfile(profileRes.data)
      setMissions(missionsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  /* ─── filtered set ─── */
  const filtered = (() => {
    const cutoff = getPeriodStart(period)
    if (!cutoff) return deliveries
    return deliveries.filter(d => new Date(d.created_at) >= cutoff)
  })()

  const totalEarnings = filtered.reduce((s, d) => s + (d.delivery_fee ?? 0), 0)
  const totalTips     = filtered.reduce((s, d) => s + (d.tip_amount  ?? 0), 0)
  const basePay       = totalEarnings - totalTips
  // Available to cash out = base earnings (tips pend for 24h — simplified as 70% of total)
  const availableCashOut = totalEarnings * 0.7

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
      total: items.reduce((s, d) => s + (d.delivery_fee ?? 0), 0),
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
      <div className="flex flex-col min-h-full bg-[#080808]">
        <div className="h-14 bg-[#111] border-b border-white/5 animate-pulse" />
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-[#111] rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Earnings" />

      <div className="p-4 space-y-4">
        {/* ── Period selector ── */}
        <div className="flex gap-1 bg-[#111] rounded-xl p-1 border border-white/5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-colors ${
                period === p ? 'bg-[#FF6B35] text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* ── Hero earnings + cash out ── */}
        <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden">
          {/* Period label + total */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-2">
              {PERIOD_LABELS[period]}
            </p>
            <p className="text-5xl font-black text-white tracking-tight leading-none">
              ${totalEarnings.toFixed(2)}
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              {filtered.length} {filtered.length === 1 ? 'delivery' : 'deliveries'}
              {totalTips > 0 && <span className="text-green-500/80"> · ${totalTips.toFixed(2)} in tips</span>}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/5 mx-5" />

          {/* Available to cash out */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">
                  Available to Cash Out
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-[#FF6B35]">${availableCashOut.toFixed(2)}</p>
                  {totalEarnings > 0 && (
                    <p className="text-xs text-zinc-600">of ${totalEarnings.toFixed(2)}</p>
                  )}
                </div>
                <p className="text-[10px] text-zinc-700 mt-1">Tips held 24h · Base pay instant</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
                <DollarSign size={22} className="text-[#FF6B35]" />
              </div>
            </div>
          </div>

          {/* Cash Out button / modal */}
          <div className="px-4 pb-5">
            {cashOutSuccess ? (
              <div className="w-full bg-green-500/15 border border-green-500/30 rounded-2xl py-4 text-center">
                <p className="text-green-400 font-bold text-sm">✓ Withdrawal request submitted!</p>
                <p className="text-zinc-600 text-xs mt-1">Admin will process within 1–2 business days</p>
              </div>
            ) : showCashOut ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Payout method</p>
                <div className="grid grid-cols-3 gap-2">
                  {([['bank_transfer', 'Bank'], ['paypal', 'PayPal'], ['check', 'Check']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setCashOutMethod(val)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        cashOutMethod === val ? 'border-[#FF6B35] bg-[#FF6B35]/10 text-[#FF6B35]' : 'border-white/10 text-zinc-500'
                      }`}
                    >{label}</button>
                  ))}
                </div>
                {cashOutError && <p className="text-xs text-red-400">{cashOutError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setShowCashOut(false); setCashOutError(null) }}
                    className="flex-1 py-3 rounded-2xl border border-white/10 text-zinc-500 text-sm font-bold">
                    Cancel
                  </button>
                  <button
                    disabled={cashOutLoading}
                    onClick={async () => {
                      setCashOutLoading(true); setCashOutError(null)
                      const res = await fetch('/api/driver/request-withdrawal', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: availableCashOut, method: cashOutMethod }),
                      })
                      const data = await res.json()
                      if (!res.ok) { setCashOutError(data.error ?? 'Failed to submit request'); setCashOutLoading(false); return }
                      setCashOutSuccess(true); setShowCashOut(false); setCashOutLoading(false)
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#FF6B35] text-white text-sm font-black disabled:opacity-50"
                  >
                    {cashOutLoading ? 'Submitting…' : `Request $${availableCashOut.toFixed(2)}`}
                  </button>
                </div>
              </div>
            ) : (
              <button
                disabled={availableCashOut <= 0}
                onClick={() => setShowCashOut(true)}
                className="w-full bg-[#FF6B35] disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black text-base py-4 rounded-2xl shadow-lg shadow-[#FF6B35]/20 active:scale-[0.98] transition-all disabled:shadow-none"
              >
                {availableCashOut > 0 ? `Cash Out $${availableCashOut.toFixed(2)}` : 'Nothing to Cash Out'}
              </button>
            )}
          </div>
        </div>

        {/* ── 7-Day Bar Chart ── */}
        <div className="bg-[#111] rounded-2xl border border-white/5 px-4 pt-4 pb-5">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Last 7 Days</p>
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
                        day.isToday ? 'bg-[#FF6B35]' : day.total > 0 ? 'bg-zinc-700' : 'bg-zinc-800/60'
                      }`}
                      title={day.total > 0 ? `$${day.total.toFixed(2)}` : ''}
                    />
                  </div>
                  <span className={`text-[10px] font-bold ${day.isToday ? 'text-[#FF6B35]' : 'text-zinc-700'}`}>
                    {day.shortLabel}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
            <div className="text-center">
              <p className="font-black text-white">{profile?.total_deliveries ?? deliveries.length}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Total</p>
            </div>
            <div className="text-center border-x border-white/5">
              <p className="font-black text-white">{profile?.avg_rating?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Rating</p>
            </div>
            <div className="text-center">
              <p className="font-black text-white">${filtered.length > 0 ? (totalEarnings / filtered.length).toFixed(2) : '0.00'}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Per trip</p>
            </div>
          </div>
        </div>

        {/* ── Daily Breakdown (accordion) ── */}
        {dailyRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Daily Breakdown</p>
            <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
              {dailyRows.map((day, i) => {
                const isOpen = expandedDay === i
                return (
                  <div key={i}>
                    {/* Day header row */}
                    <button
                      onClick={() => setExpandedDay(isOpen ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${day.isToday ? 'bg-[#FF6B35]/15' : 'bg-zinc-800'}`}>
                          <Clock size={13} className={day.isToday ? 'text-[#FF6B35]' : 'text-zinc-500'} />
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-bold ${day.isToday ? 'text-[#FF6B35]' : 'text-white'}`}>
                            {day.isToday ? 'Today' : day.label}
                          </p>
                          <p className="text-[11px] text-zinc-600 mt-0.5">{day.count} {day.count === 1 ? 'delivery' : 'deliveries'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${day.isToday ? 'text-[#FF6B35]' : 'text-white'}`}>
                          ${day.total.toFixed(2)}
                        </span>
                        {isOpen
                          ? <ChevronDown size={14} className="text-zinc-600" />
                          : <ChevronRight size={14} className="text-zinc-700" />
                        }
                      </div>
                    </button>

                    {/* Expanded deliveries list */}
                    {isOpen && (
                      <div className="bg-[#0E0E0E] divide-y divide-white/[0.04]">
                        {day.deliveries.map(d => (
                          <div key={d.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 ml-2.5" />
                              <div>
                                <p className="text-sm text-zinc-300 font-medium">#{d.id.slice(-6).toUpperCase()}</p>
                                <p className="text-[11px] text-zinc-600">
                                  {new Date(d.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-[#FF6B35]">+${d.delivery_fee.toFixed(2)}</p>
                              {d.tip_amount > 0 && (
                                <p className="text-[11px] text-green-500/80">+${d.tip_amount.toFixed(2)} tip</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {/* Day subtotal */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-[#111]">
                          <span className="text-xs font-semibold text-zinc-600 pl-7">Subtotal</span>
                          <span className="text-xs font-black text-white">${day.total.toFixed(2)}</span>
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
            <div className="w-16 h-16 rounded-full bg-[#111] border border-white/5 flex items-center justify-center mb-4">
              <TrendingUp size={28} className="text-zinc-700" />
            </div>
            <p className="text-zinc-500 font-semibold">No deliveries yet</p>
            <p className="text-zinc-700 text-sm mt-1">Your completed deliveries will appear here</p>
          </div>
        )}

        {/* ── Available Missions ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Available Missions</p>
            <span className="text-[10px] font-bold text-[#FF6B35] bg-[#FF6B35]/10 px-2 py-0.5 rounded-full">
              Resets daily
            </span>
          </div>

          {missions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-[#111] rounded-2xl border border-white/5">
              <p className="text-zinc-500 font-semibold text-sm">No active missions right now</p>
              <p className="text-zinc-700 text-xs mt-1">Check back soon for new challenges</p>
            </div>
          ) : (
          <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
            {missions.map((m) => {
              // Use today's delivery count as proxy for deliveries-type missions
              const progress = Math.min(m.mission_type === 'deliveries' ? todayCount : 0, m.target_value)
              const pct = (progress / m.target_value) * 100
              const complete = progress >= m.target_value

              return (
                <div key={m.id} className={`px-4 py-4 ${complete ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${complete ? 'bg-green-500/10' : 'bg-[#FF6B35]/10'}`}>
                      {complete ? '✅' : m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className={`text-sm font-bold leading-tight ${complete ? 'line-through text-zinc-600' : 'text-white'}`}>
                          {m.title}
                        </p>
                        <span className={`text-xs font-black flex-shrink-0 ${complete ? 'text-green-400' : 'text-[#FF6B35]'}`}>
                          +${m.reward_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-gradient-to-r from-[#FF6B35] to-[#FF8C5A]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-600 flex-shrink-0">
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
          <div className="flex items-center gap-3 px-4 py-3 bg-[#111] rounded-2xl border border-white/5">
            <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center flex-shrink-0">
              <Zap size={15} className="text-[#FF6B35]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Complete all missions</p>
              <p className="text-xs text-zinc-600">Earn up to ${missions.reduce((s, m) => s + m.reward_amount, 0).toFixed(2)} in bonuses today</p>
            </div>
            <span className="font-black text-[#FF6B35] text-sm">${missions.reduce((s, m) => s + m.reward_amount, 0).toFixed(2)}</span>
          </div>
          )}
        </div>

        {/* Bottom breathing room */}
        <div className="h-4" />
      </div>
    </div>
  )
}

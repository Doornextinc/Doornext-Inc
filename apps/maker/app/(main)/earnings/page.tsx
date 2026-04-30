'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, DollarSign, Clock, ChevronDown, ChevronRight, Info } from 'lucide-react'

/* ─── types ─── */
type OrderRow = {
  id: string
  subtotal: number
  maker_payout: number
  platform_commission: number
  created_at: string
}
type Withdrawal = { id: string; amount: number; status: string; method: string; created_at: string }
type Period = 'today' | 'week' | 'month' | 'all'

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
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('week')
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  // Cash out state
  const [showCashOut, setShowCashOut] = useState(false)
  const [cashOutAmount, setCashOutAmount] = useState('')
  const [cashOutMethod, setCashOutMethod] = useState<'bank_transfer' | 'stripe'>('bank_transfer')
  const [cashOutLoading, setCashOutLoading] = useState(false)
  const [cashOutError, setCashOutError] = useState<string | null>(null)
  const [cashOutSuccess, setCashOutSuccess] = useState(false)
  const [availableCashOut, setAvailableCashOut] = useState(0)
  const [pendingWithdrawal, setPendingWithdrawal] = useState<Withdrawal | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { router.push('/login'); return }

    const { data: maker } = await supabase
      .from('food_makers').select('id').eq('user_id', userId).single()
    if (!maker) { setError('Kitchen profile not found'); setLoading(false); return }

    // Fetch maker_earnings (granular breakdown) and fall back to orders if not yet recorded
    const [earningsRes, ordersRes, withdrawalsRes] = await Promise.all([
      supabase
        .from('maker_earnings')
        .select('order_id, subtotal, payout, platform_commission, created_at')
        .eq('maker_id', maker.id)
        .order('created_at', { ascending: false })
        .limit(500),
      // Also fetch raw orders for orders where maker_earnings hasn't been written yet
      supabase
        .from('orders')
        .select('id, subtotal, maker_payout, created_at')
        .eq('maker_id', maker.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('withdrawals')
        .select('id, amount, status, method, created_at')
        .eq('user_id', userId)
        .in('status', ['pending', 'approved', 'paid'])
        .order('created_at', { ascending: false }),
    ])

    // Merge: prefer maker_earnings rows; fall back to orders rows for unrecorded ones
    const earningsByOrderId = new Map<string, OrderRow>()

    // Add orders first (lower priority)
    for (const o of (ordersRes.data ?? [])) {
      earningsByOrderId.set(o.id, {
        id: o.id,
        subtotal: Number(o.subtotal ?? 0),
        maker_payout: Number(o.maker_payout ?? 0),
        platform_commission: 0, // unknown without maker_earnings
        created_at: o.created_at,
      })
    }
    // Overwrite with maker_earnings (higher fidelity)
    for (const e of (earningsRes.data ?? [])) {
      earningsByOrderId.set(e.order_id, {
        id: e.order_id,
        subtotal: Number(e.subtotal ?? 0),
        maker_payout: Number(e.payout ?? 0),
        platform_commission: Number(e.platform_commission ?? 0),
        created_at: e.created_at,
      })
    }

    const allOrders = Array.from(earningsByOrderId.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const allWithdrawals = (withdrawalsRes.data ?? []) as Withdrawal[]
    const totalEarned = allOrders.reduce((s, o) => s + o.maker_payout, 0)
    const totalWithdrawn = allWithdrawals.reduce((s, w) => s + w.amount, 0)
    setAvailableCashOut(Math.max(0, Math.round((totalEarned - totalWithdrawn) * 100) / 100))
    setPendingWithdrawal(allWithdrawals.find(w => w.status === 'pending') ?? null)
    setOrders(allOrders)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  /* ─── filtered set ─── */
  const filtered = (() => {
    const cutoff = getPeriodStart(period)
    if (!cutoff) return orders
    return orders.filter(o => new Date(o.created_at) >= cutoff)
  })()

  const totalPayout = filtered.reduce((s, o) => s + o.maker_payout, 0)
  const totalSubtotal = filtered.reduce((s, o) => s + o.subtotal, 0)
  const totalCommission = filtered.reduce((s, o) => s + o.platform_commission, 0)
  const knownCommission = totalCommission > 0

  /* ─── 7-day chart ─── */
  const weekChart = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i
    const { start, end, label, isToday } = getDayBounds(daysAgo)
    const dayDate = new Date(); dayDate.setDate(dayDate.getDate() - daysAgo)
    const items = orders.filter(o => { const at = new Date(o.created_at); return at >= start && at < end })
    return {
      shortLabel: DAY_SHORT[dayDate.getDay()],
      label,
      isToday,
      total: items.reduce((s, o) => s + o.maker_payout, 0),
      count: items.length,
      orders: items,
    }
  })
  const maxBar = Math.max(...weekChart.map(d => d.total), 1)
  const dailyRows = weekChart.filter(d => d.count > 0)

  /* ─── cash out handler ─── */
  const submitCashOut = async () => {
    const amt = Math.round(parseFloat(cashOutAmount) * 100) / 100
    if (!amt || amt < 1) { setCashOutError('Minimum withdrawal is $1.00'); return }
    if (amt > availableCashOut) { setCashOutError(`Maximum is $${availableCashOut.toFixed(2)}`); return }
    setCashOutLoading(true)
    setCashOutError(null)
    const res = await fetch('/api/maker/request-withdrawal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, method: cashOutMethod }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCashOutError(data.error ?? 'Failed to submit request')
      setCashOutLoading(false)
      return
    }
    setCashOutSuccess(true)
    setShowCashOut(false)
    setCashOutLoading(false)
    setAvailableCashOut(0)
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center">
          <h1 className="text-[18px] font-black text-gray-900">Earnings</h1>
        </header>
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <span className="text-4xl mb-4">⚠️</span>
          <h3 className="text-lg font-black text-gray-900">Something went wrong</h3>
          <p className="text-gray-400 text-sm mt-1">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); load() }}
            className="mt-6 px-6 py-3 bg-[#FF6B35] text-white rounded-2xl font-bold text-sm">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-[60px] flex items-center justify-between">
        <h1 className="text-[18px] font-black text-gray-900">Earnings</h1>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-4 space-y-4">

          {/* Period selector */}
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-colors ${
                  period === p ? 'bg-[#FF6B35] text-white' : 'text-gray-400 hover:text-gray-700'
                }`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Hero earnings + fee breakdown + cash out */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">
                {PERIOD_LABELS[period]}
              </p>
              <p className="text-5xl font-black text-gray-900 tracking-tight leading-none">
                ${totalPayout.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {filtered.length} {filtered.length === 1 ? 'order' : 'orders'} completed
              </p>
            </div>

            {/* Fee breakdown toggle */}
            {knownCommission && (
              <>
                <button
                  onClick={() => setShowBreakdown(b => !b)}
                  className="w-full flex items-center justify-between px-5 py-3 border-t border-gray-50 text-xs text-gray-400 font-semibold hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Info size={12} />
                    How your payout is calculated
                  </span>
                  {showBreakdown ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>

                {showBreakdown && (
                  <div className="mx-4 mb-4 rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="divide-y divide-gray-50">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-xs text-gray-500">Food subtotal</span>
                        <span className="text-xs font-bold text-gray-800">${totalSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-xs text-gray-500">Platform commission (5%)</span>
                        <span className="text-xs font-bold text-red-400">−${totalCommission.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-orange-50">
                        <span className="text-xs font-bold text-gray-800">Your payout</span>
                        <span className="text-xs font-black text-[#FF6B35]">${totalPayout.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="h-px bg-gray-100 mx-5" />

            {/* Available to cash out */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">
                    Available to Cash Out
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black text-[#FF6B35]">${availableCashOut.toFixed(2)}</p>
                  </div>
                  <p className="text-[10px] text-gray-300 mt-1">Net of previous withdrawals</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
                  <DollarSign size={22} className="text-[#FF6B35]" />
                </div>
              </div>
            </div>

            {/* Cash Out button / expanded form */}
            <div className="px-4 pb-5">
              {cashOutSuccess ? (
                <div className="w-full bg-green-50 border border-green-200 rounded-2xl py-4 text-center">
                  <p className="text-green-700 font-bold text-sm">✓ Withdrawal request submitted!</p>
                  <p className="text-gray-400 text-xs mt-1">Admin will process within 1–2 business days</p>
                </div>
              ) : pendingWithdrawal ? (
                <div className="w-full bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">⏳</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-yellow-600">Pending Withdrawal</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">${Number(pendingWithdrawal.amount).toFixed(2)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {pendingWithdrawal.method.replace('_', ' ')} · Submitted {new Date(pendingWithdrawal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ) : showCashOut ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Amount</p>
                    <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-4 h-11 gap-1">
                      <span className="text-gray-400 font-bold text-sm">$</span>
                      <input
                        type="number"
                        min="1"
                        max={availableCashOut}
                        step="0.01"
                        value={cashOutAmount}
                        onChange={e => setCashOutAmount(e.target.value)}
                        className="flex-1 bg-transparent text-gray-900 font-bold text-sm focus:outline-none"
                      />
                      <button
                        onClick={() => setCashOutAmount(availableCashOut.toFixed(2))}
                        className="text-[10px] font-black text-[#FF6B35] uppercase tracking-wide"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Payout method</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([['bank_transfer', 'Bank Transfer'], ['stripe', 'Stripe']] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setCashOutMethod(val)}
                          className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                            cashOutMethod === val
                              ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]'
                              : 'border-gray-200 text-gray-400'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {cashOutError && <p className="text-xs text-red-500">{cashOutError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setShowCashOut(false); setCashOutError(null) }}
                      className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 text-sm font-bold">
                      Cancel
                    </button>
                    <button disabled={cashOutLoading} onClick={submitCashOut}
                      className="flex-1 py-3 rounded-2xl bg-[#FF6B35] text-white text-sm font-black disabled:opacity-50 active:scale-[0.98] transition-all">
                      {cashOutLoading ? 'Submitting…' : `Request $${parseFloat(cashOutAmount || '0').toFixed(2)}`}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  disabled={availableCashOut < 1}
                  onClick={() => { setShowCashOut(true); setCashOutAmount(availableCashOut.toFixed(2)) }}
                  className="w-full bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed border border-gray-200 text-[#FF6B35] font-black text-sm py-2.5 rounded-xl active:scale-[0.98] transition-all">
                  {availableCashOut >= 1 ? `Cash Out $${availableCashOut.toFixed(2)}` : 'Nothing to Cash Out'}
                </button>
              )}
            </div>
          </div>

          {/* 7-day bar chart */}
          <div className="bg-white rounded-2xl border border-gray-100 px-4 pt-4 pb-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Last 7 Days</p>
            <div className="flex items-end gap-2 h-20">
              {weekChart.map((day, i) => {
                const pct = day.total > 0 ? Math.max((day.total / maxBar) * 100, 10) : 4
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex flex-col justify-end" style={{ height: 60 }}>
                      <div
                        style={{ height: `${pct}%` }}
                        className={`w-full rounded-t-md transition-all ${
                          day.isToday ? 'bg-[#FF6B35]' : day.total > 0 ? 'bg-gray-300' : 'bg-gray-100'
                        }`}
                        title={day.total > 0 ? `$${day.total.toFixed(2)}` : ''}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${day.isToday ? 'text-[#FF6B35]' : 'text-gray-300'}`}>
                      {day.shortLabel}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="font-black text-gray-900">{orders.length}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Total Orders</p>
              </div>
              <div className="text-center border-x border-gray-100">
                <p className="font-black text-[#FF6B35]">
                  ${filtered.length > 0 ? (totalPayout / filtered.length).toFixed(2) : '0.00'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Avg Payout</p>
              </div>
              <div className="text-center">
                <p className="font-black text-gray-900">{filtered.length}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">This Period</p>
              </div>
            </div>
          </div>

          {/* Daily breakdown accordion */}
          {dailyRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Daily Breakdown</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {dailyRows.map((day, i) => {
                  const isOpen = expandedDay === i
                  return (
                    <div key={i}>
                      <button onClick={() => setExpandedDay(isOpen ? null : i)}
                        className="w-full flex items-center justify-between px-4 py-3.5 bg-white active:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${day.isToday ? 'bg-orange-50' : 'bg-gray-100'}`}>
                            <Clock size={13} className={day.isToday ? 'text-[#FF6B35]' : 'text-gray-400'} />
                          </div>
                          <div className="text-left">
                            <p className={`text-sm font-bold ${day.isToday ? 'text-[#FF6B35]' : 'text-gray-800'}`}>
                              {day.isToday ? 'Today' : day.label}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {day.count} {day.count === 1 ? 'order' : 'orders'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-black ${day.isToday ? 'text-[#FF6B35]' : 'text-gray-800'}`}>
                            ${day.total.toFixed(2)}
                          </span>
                          {isOpen
                            ? <ChevronDown size={14} className="text-gray-400" />
                            : <ChevronRight size={14} className="text-gray-300" />
                          }
                        </div>
                      </button>

                      {isOpen && (
                        <div className="bg-gray-50 divide-y divide-gray-100">
                          {day.orders.map(o => (
                            <div key={o.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-2.5" />
                                  <div>
                                    <p className="text-sm text-gray-700 font-medium">#{o.id.slice(-6).toUpperCase()}</p>
                                    <p className="text-[11px] text-gray-400">
                                      {new Date(o.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-black text-[#FF6B35]">+${o.maker_payout.toFixed(2)}</p>
                                  {o.platform_commission > 0 && (
                                    <p className="text-[10px] text-gray-400">
                                      of ${o.subtotal.toFixed(2)} subtotal
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-gray-100">
                            <span className="text-xs font-semibold text-gray-400 pl-7">Subtotal</span>
                            <span className="text-xs font-black text-gray-800">${day.total.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {dailyRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
                <TrendingUp size={28} className="text-[#FF6B35]" />
              </div>
              <h3 className="text-lg font-black text-gray-900">No earnings yet</h3>
              <p className="text-gray-400 text-sm mt-1">Completed orders will appear here</p>
            </div>
          )}

          <div className="h-4" />
        </div>
      )}
    </div>
  )
}

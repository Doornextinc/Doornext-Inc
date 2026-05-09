'use client'

import { useEffect, useState, useCallback } from 'react'

interface Withdrawal {
  id: string
  user_id: string
  user_role: string
  amount: number
  status: string
  method: string
  payout_ref: string | null
  notes: string | null
  reviewed_at: string | null
  created_at: string
  users: { full_name: string; email: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState<string | null>(null)
  const [payoutRef, setPayoutRef] = useState('')
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/withdrawals?status=${filter}`)
    if (res.ok) {
      const data = await res.json()
      setWithdrawals(data.withdrawals ?? [])
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const act = async (id: string, status: 'approved' | 'rejected' | 'paid') => {
    setActing(true)
    await fetch(`/api/admin/withdrawals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, payout_ref: payoutRef || null, notes: notes || null }),
    })
    setSelected(null)
    setPayoutRef('')
    setNotes('')
    setActing(false)
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Withdrawals</h1>
          <p className="text-gray-400 text-sm mt-1">Nexter & Maker payout requests</p>
        </div>
        <span className="text-sm text-gray-400">{withdrawals.length} shown</span>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {['pending', 'approved', 'paid', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">User</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Role</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Method</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Amount</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Requested</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {withdrawals.map((w) => (
                <>
                  <tr key={w.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{w.users?.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{w.users?.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        w.user_role === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {w.user_role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{w.method.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[w.status]}`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">
                      ${w.amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-gray-400">
                      {new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {w.status === 'pending' && (
                        <button
                          onClick={() => setSelected(selected === w.id ? null : w.id)}
                          className="text-xs font-semibold text-[#FF6B35] hover:underline"
                        >
                          Review
                        </button>
                      )}
                      {w.status === 'approved' && (
                        <button
                          onClick={() => act(w.id, 'paid')}
                          disabled={acting}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg text-green-600 border border-green-200 hover:bg-green-50 disabled:opacity-50 transition-colors"
                        >
                          Mark Paid
                        </button>
                      )}
                      {w.payout_ref && (
                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{w.payout_ref}</p>
                      )}
                    </td>
                  </tr>
                  {selected === w.id && (
                    <tr key={`${w.id}-review`} className="bg-gray-50">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="flex gap-3 items-start">
                          <input
                            type="text"
                            placeholder="Payout reference (optional)"
                            value={payoutRef}
                            onChange={(e) => setPayoutRef(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                          />
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                          />
                          <button
                            onClick={() => act(w.id, 'approved')}
                            disabled={acting}
                            className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => act(w.id, 'rejected')}
                            disabled={acting}
                            className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {withdrawals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">
                    No {filter !== 'all' ? filter : ''} withdrawals
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

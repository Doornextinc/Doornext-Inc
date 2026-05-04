'use client'

import { useEffect, useState, useCallback } from 'react'

type ApprovalStatus = 'pending' | 'approved' | 'rejected'

interface Maker {
  id: string
  user_id: string
  display_name: string
  cuisine_tags: string[] | null
  avg_rating: number | null
  total_reviews: number
  is_open: boolean
  approval_status: ApprovalStatus
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
}

const TABS: { label: string; value: ApprovalStatus | 'all' }[] = [
  { label: 'Pending Review', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

export default function MakersPage() {
  const [tab, setTab] = useState<ApprovalStatus | 'all'>('pending')
  const [makers, setMakers] = useState<Maker[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Maker | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const loadMakers = useCallback(async (status: ApprovalStatus | 'all') => {
    setLoading(true)
    const url = status === 'all' ? '/api/admin/makers' : `/api/admin/makers?status=${status}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setMakers(data.makers ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadMakers(tab) }, [tab, loadMakers])

  const approve = async (maker: Maker) => {
    setActing(maker.id)
    await fetch('/api/admin/makers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makerId: maker.id, action: 'approve' }),
    })
    await loadMakers(tab)
    setActing(null)
  }

  const reject = async () => {
    if (!rejectTarget) return
    setActing(rejectTarget.id)
    await fetch('/api/admin/makers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makerId: rejectTarget.id, action: 'reject', rejection_reason: rejectReason.trim() || null }),
    })
    setRejectTarget(null)
    setRejectReason('')
    await loadMakers(tab)
    setActing(null)
  }

  const toggleOpen = async (maker: Maker) => {
    setActing(maker.id)
    await fetch('/api/admin/makers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makerId: maker.id, is_open: !maker.is_open }),
    })
    await loadMakers(tab)
    setActing(null)
  }

  const pendingCount = tab === 'pending' ? makers.length : null

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Food Makers</h1>
        {pendingCount !== null && pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} awaiting review
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
              tab === t.value
                ? 'text-gray-900 border-b-2 border-[#FF6B35] -mb-px bg-white'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Cuisines</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
                {tab === 'approved' && (
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                )}
                {tab === 'rejected' && (
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Reason</th>
                )}
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {makers.map((maker) => (
                <tr key={maker.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{maker.display_name}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1 flex-wrap">
                      {maker.cuisine_tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">
                    ⭐ {maker.avg_rating?.toFixed(1) ?? '—'} ({maker.total_reviews})
                  </td>
                  {tab === 'approved' && (
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        maker.is_open ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {maker.is_open ? 'Open' : 'Closed'}
                      </span>
                    </td>
                  )}
                  {tab === 'rejected' && (
                    <td className="px-5 py-3.5 text-xs text-gray-400 max-w-xs truncate">
                      {maker.rejection_reason ?? '—'}
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-right text-xs text-gray-400">
                    {new Date(maker.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {tab === 'pending' && (
                        <>
                          <button
                            onClick={() => { setRejectTarget(maker); setRejectReason('') }}
                            disabled={acting === maker.id}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => approve(maker)}
                            disabled={acting === maker.id}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                          >
                            {acting === maker.id ? '…' : 'Approve'}
                          </button>
                        </>
                      )}
                      {tab === 'approved' && (
                        <button
                          onClick={() => toggleOpen(maker)}
                          disabled={acting === maker.id}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                            maker.is_open
                              ? 'text-red-500 hover:bg-red-50 border border-red-200'
                              : 'text-green-600 hover:bg-green-50 border border-green-200'
                          }`}
                        >
                          {maker.is_open ? 'Force Close' : 'Force Open'}
                        </button>
                      )}
                      {tab === 'rejected' && (
                        <button
                          onClick={() => approve(maker)}
                          disabled={acting === maker.id}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                        >
                          {acting === maker.id ? '…' : 'Re-approve'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {makers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                    {tab === 'pending' ? 'No applications pending review' : `No ${tab} makers`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-black text-gray-900 text-lg mb-1">Reject application</h2>
            <p className="text-sm text-gray-500 mb-4">
              Rejecting <span className="font-semibold text-gray-700">{rejectTarget.display_name}</span>.
              Optionally add a reason that will be shown to the maker.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)…"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-red-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason('') }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={acting === rejectTarget.id}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50"
              >
                {acting === rejectTarget.id ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { ExternalLink, X } from 'lucide-react'

type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type KycStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected'

interface Maker {
  id: string
  user_id: string
  display_name: string
  cuisine_tags: string[] | null
  avg_rating: number | null
  total_reviews: number
  is_open: boolean
  approval_status: ApprovalStatus
  kyc_status: KycStatus
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
}

interface KycDoc {
  business_type: string
  legal_name: string
  dba_name: string | null
  ein: string | null
  ssn_last4: string | null
  business_phone: string | null
  business_address: string | null
  kyc_status: KycStatus
  submitted_at: string | null
  review_notes: string | null
  identity_front_url: string | null
  identity_back_url: string | null
  business_doc_url: string | null
  food_permit_url: string | null
}

const TABS: { label: string; value: ApprovalStatus | 'all' }[] = [
  { label: 'Pending Review', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

const KYC_BADGE: Record<KycStatus, { label: string; cls: string }> = {
  not_submitted: { label: 'No KYC', cls: 'bg-gray-100 text-gray-500' },
  pending_review: { label: 'KYC Submitted', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'KYC Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'KYC Rejected', cls: 'bg-red-100 text-red-600' },
}

const BIZ_TYPE_LABEL: Record<string, string> = {
  sole_proprietor: 'Sole Proprietorship',
  llc: 'LLC',
  corporation: 'Corporation',
  partnership: 'Partnership',
}

function KycModal({ maker, onClose, onApprove, onReject }: {
  maker: Maker
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const [doc, setDoc] = useState<KycDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/makers/${maker.id}/kyc`)
      .then((r) => r.json())
      .then(({ doc }) => { setDoc(doc); setLoading(false) })
  }, [maker.id])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">{maker.display_name}</h2>
            <p className="text-xs text-gray-400">KYC / Business Verification</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : !doc ? (
            <p className="text-sm text-gray-500 text-center py-6">No business information submitted yet.</p>
          ) : (
            <>
              {/* Business info */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Business Information</p>
                <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                  {[
                    { label: 'Type', value: BIZ_TYPE_LABEL[doc.business_type] ?? doc.business_type },
                    { label: 'Legal Name', value: doc.legal_name },
                    doc.dba_name && { label: 'DBA', value: doc.dba_name },
                    doc.ein && { label: 'EIN', value: doc.ein },
                    doc.ssn_last4 && { label: 'SSN Last 4', value: `•••-••-${doc.ssn_last4}` },
                    doc.business_phone && { label: 'Phone', value: doc.business_phone },
                    doc.business_address && { label: 'Address', value: doc.business_address },
                    doc.submitted_at && { label: 'Submitted', value: new Date(doc.submitted_at).toLocaleString() },
                  ].filter(Boolean).map((row, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-400">{(row as {label:string}).label}</span>
                      <span className="text-sm text-gray-800">{(row as {value:string}).value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Documents */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Documents</p>
                <div className="space-y-2">
                  {[
                    { label: 'ID Front', url: doc.identity_front_url },
                    { label: 'ID Back', url: doc.identity_back_url },
                    { label: 'Business Document', url: doc.business_doc_url },
                    { label: 'Food Permit', url: doc.food_permit_url },
                  ].filter((d) => d.url).map(({ label, url }) => (
                    <a
                      key={label}
                      href={url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors"
                    >
                      <span className="text-sm font-semibold text-blue-700">{label}</span>
                      <ExternalLink size={14} className="text-blue-500" />
                    </a>
                  ))}
                  {!doc.identity_front_url && !doc.business_doc_url && (
                    <p className="text-xs text-gray-400 text-center py-2">No documents uploaded</p>
                  )}
                </div>
              </div>

              {/* Review notes */}
              {doc.review_notes && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Previous Review Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{doc.review_notes}</p>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          {maker.approval_status === 'pending' && !showRejectForm && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowRejectForm(true)}
                className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
              >
                Approve
              </button>
            </div>
          )}

          {showRejectForm && (
            <div className="space-y-3 pt-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (shown to the maker)…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-red-400 resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onReject()}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          )}

          {maker.approval_status === 'rejected' && (
            <button
              onClick={onApprove}
              className="w-full py-2.5 rounded-xl border border-emerald-200 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              Re-approve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MakersPage() {
  const [tab, setTab] = useState<ApprovalStatus | 'all'>('pending')
  const [makers, setMakers] = useState<Maker[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [kycTarget, setKycTarget] = useState<Maker | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Maker | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const loadMakers = useCallback(async (status: ApprovalStatus | 'all') => {
    setLoading(true)
    const url = status === 'all' ? '/api/admin/makers' : `/api/admin/makers?status=${status}`
    const res = await fetch(url)
    if (res.ok) setMakers((await res.json()).makers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadMakers(tab) }, [tab, loadMakers])

  const approve = async (makerId: string) => {
    setActing(makerId)
    await fetch('/api/admin/makers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makerId, action: 'approve' }),
    })
    setKycTarget(null)
    await loadMakers(tab)
    setActing(null)
  }

  const reject = async (makerId: string, reason: string) => {
    setActing(makerId)
    await fetch('/api/admin/makers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makerId, action: 'reject', rejection_reason: reason.trim() || null }),
    })
    setKycTarget(null)
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Food Makers</h1>
        {tab === 'pending' && makers.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {makers.length} awaiting review
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
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">KYC</th>
                {tab === 'approved' && (
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Open</th>
                )}
                {tab === 'rejected' && (
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Reason</th>
                )}
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {makers.map((maker) => {
                const kyc = KYC_BADGE[maker.kyc_status ?? 'not_submitted']
                return (
                  <tr key={maker.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{maker.display_name}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1 flex-wrap">
                        {maker.cuisine_tags?.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${kyc.cls}`}>
                        {kyc.label}
                      </span>
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
                        {/* Review KYC always available for pending */}
                        {tab === 'pending' && (
                          <button
                            onClick={() => setKycTarget(maker)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            Review
                          </button>
                        )}
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
                              onClick={() => approve(maker.id)}
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
                            onClick={() => approve(maker.id)}
                            disabled={acting === maker.id}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          >
                            {acting === maker.id ? '…' : 'Re-approve'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {makers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">
                    {tab === 'pending' ? 'No applications pending review' : `No ${tab} makers`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* KYC review modal */}
      {kycTarget && (
        <KycModal
          maker={kycTarget}
          onClose={() => setKycTarget(null)}
          onApprove={() => approve(kycTarget.id)}
          onReject={() => reject(kycTarget.id, '')}
        />
      )}

      {/* Quick reject modal (from row button, no KYC needed) */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-black text-gray-900 text-lg mb-1">Reject application</h2>
            <p className="text-sm text-gray-500 mb-4">
              Rejecting <span className="font-semibold text-gray-700">{rejectTarget.display_name}</span>.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (shown to the maker — optional)…"
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
                onClick={() => reject(rejectTarget.id, rejectReason)}
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

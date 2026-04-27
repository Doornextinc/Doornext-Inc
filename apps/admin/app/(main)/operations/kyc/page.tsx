'use client'

import { useEffect, useState, useCallback } from 'react'

interface KYCDocument {
  id: string
  user_id: string
  kyc_full_name: string | null
  kyc_date_of_birth: string | null
  kyc_ssn_last4: string | null
  kyc_address: string | null
  id_type: string | null
  front_url: string | null
  back_url: string | null
  selfie_url: string | null
  insurance_url: string | null
  registration_url: string | null
  bg_check_consent: boolean
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
  kyc_status: string
  driver_profile: {
    id: string
    full_name: string
    vehicle_type: string | null
    kyc_status: string | null
    phone: string | null
  } | null
}

const STATUS_COLORS: Record<string, string> = {
  not_submitted: 'bg-gray-100 text-gray-500',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function KYCReviewPage() {
  const [docs, setDocs] = useState<KYCDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<KYCDocument | null>(null)
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)
  const [filter, setFilter] = useState('pending_review')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/kyc')
    if (res.ok) {
      const data = await res.json()
      setDocs(data.documents ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (action: 'approve' | 'reject') => {
    if (!selected) return
    setActing(true)
    await fetch(`/api/admin/kyc/${selected.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes }),
    })
    setSelected(null)
    setNotes('')
    setActing(false)
    load()
  }

  const filtered = docs.filter((d) => filter === 'all' || d.kyc_status === filter)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">KYC Review</h1>
          <p className="text-gray-400 text-sm mt-1">Driver identity verification submissions</p>
        </div>
        <span className="text-sm text-gray-400">{docs.length} total submissions</span>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {['all', 'pending_review', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Submission list */}
          <div className="space-y-2">
            {filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => { setSelected(doc); setNotes('') }}
                className={`w-full text-left bg-white rounded-2xl border p-4 transition-colors ${
                  selected?.id === doc.id ? 'border-[#FF6B35]' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {doc.kyc_full_name ?? doc.driver_profile?.full_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400">{doc.driver_profile?.vehicle_type ?? '—'}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[doc.kyc_status]}`}>
                    {doc.kyc_status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(doc.submitted_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">No submissions</p>
            )}
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="col-span-2 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-gray-900">{selected.kyc_full_name ?? '—'}</h2>
                    <p className="text-xs text-gray-400">{selected.driver_profile?.full_name}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[selected.kyc_status]}`}>
                    {selected.kyc_status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                  {[
                    { label: 'Date of Birth', value: selected.kyc_date_of_birth ?? '—' },
                    { label: 'SSN Last 4', value: selected.kyc_ssn_last4 ? `••••${selected.kyc_ssn_last4}` : '—' },
                    { label: 'Address', value: selected.kyc_address ?? '—' },
                    { label: 'ID Type', value: selected.id_type?.replace(/_/g, ' ') ?? '—' },
                    { label: 'Phone', value: selected.driver_profile?.phone ?? '—' },
                    { label: 'Vehicle', value: selected.driver_profile?.vehicle_type ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="font-medium text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Background check status */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-5 text-xs font-semibold ${selected.bg_check_consent ? 'bg-green-500/10 text-green-400' : 'bg-slate-700/50 text-slate-500'}`}>
                  <span>{selected.bg_check_consent ? '✓' : '○'}</span>
                  Background check consent {selected.bg_check_consent ? 'obtained' : 'not provided'}
                </div>

                {/* Document images */}
                {(() => {
                  const docItems = [
                    { label: 'ID Front', url: selected.front_url },
                    { label: 'ID Back', url: selected.back_url },
                    ...(selected.insurance_url ? [{ label: 'Insurance', url: selected.insurance_url }] : []),
                    ...(selected.registration_url ? [{ label: 'Registration', url: selected.registration_url }] : []),
                    { label: 'Selfie', url: selected.selfie_url },
                  ]
                  const cols = docItems.length <= 3 ? 'grid-cols-3' : 'grid-cols-3'
                  return (
                    <div className={`grid ${cols} gap-3 mb-5`}>
                      {docItems.map(({ label, url }) => (
                        <div
                          key={label}
                          className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-video flex items-center justify-center"
                        >
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="w-full h-full block relative group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={label} className="w-full h-full object-cover" />
                              <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] font-bold text-center py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {label} ↗
                              </div>
                            </a>
                          ) : (
                            <p className="text-xs text-gray-400 p-2 text-center">{label}<br/>not uploaded</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Actions — only when pending */}
                {selected.kyc_status === 'pending_review' && (
                  <>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Review notes (optional for approval, recommended for rejection)…"
                      rows={3}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-400 resize-none mb-3"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => act('approve')}
                        disabled={acting}
                        className="flex-1 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {acting ? 'Processing…' : 'Approve KYC'}
                      </button>
                      <button
                        onClick={() => act('reject')}
                        disabled={acting}
                        className="flex-1 py-2.5 bg-red-50 text-red-600 border border-red-200 text-sm font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                )}

                {selected.review_notes && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Review Notes</p>
                    <p className="text-sm text-gray-700">{selected.review_notes}</p>
                  </div>
                )}

                {selected.reviewed_at && (
                  <p className="text-xs text-gray-400 mt-2">
                    Reviewed {new Date(selected.reviewed_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="col-span-2 flex items-center justify-center text-gray-400 text-sm">
              Select a submission to review
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'

interface KYCDocument {
  id: string
  driver_id: string
  status: string
  review_notes: string | null
  submitted_at: string
  reviewed_at: string | null
  first_name: string
  last_name: string
  date_of_birth: string | null
  phone: string | null
  address: string | null
  id_type: string | null
  id_number: string | null
  id_front_url: string | null
  id_back_url: string | null
  selfie_url: string | null
  driver_profiles: { full_name: string; vehicle_type: string | null; kyc_status: string | null } | null
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

  const filtered = docs.filter((d) => filter === 'all' || d.status === filter)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">KYC Review</h1>
          <p className="text-gray-400 text-sm mt-1">Driver identity verification submissions</p>
        </div>
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
          {/* List */}
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
                      {doc.first_name} {doc.last_name}
                    </p>
                    <p className="text-xs text-gray-400">{doc.driver_profiles?.full_name}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[doc.status]}`}>
                    {doc.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(doc.submitted_at).toLocaleDateString()}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">No submissions</p>
            )}
          </div>

          {/* Detail */}
          {selected ? (
            <div className="col-span-2 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-900">
                    {selected.first_name} {selected.last_name}
                  </h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[selected.status]}`}>
                    {selected.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  {[
                    { label: 'Date of Birth', value: selected.date_of_birth ?? '—' },
                    { label: 'Phone', value: selected.phone ?? '—' },
                    { label: 'Address', value: selected.address ?? '—' },
                    { label: 'ID Type', value: selected.id_type ?? '—' },
                    { label: 'ID Number', value: selected.id_number ?? '—' },
                    { label: 'Vehicle', value: selected.driver_profiles?.vehicle_type ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="font-medium text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Document images */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'ID Front', url: selected.id_front_url },
                    { label: 'ID Back', url: selected.id_back_url },
                    { label: 'Selfie', url: selected.selfie_url },
                  ].map(({ label, url }) => (
                    <div key={label} className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-video flex items-center justify-center">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={label} className="w-full h-full object-cover" />
                        </a>
                      ) : (
                        <p className="text-xs text-gray-400">{label} — not uploaded</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Review notes */}
                {selected.status === 'pending_review' && (
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

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Seller {
  id: string
  user_id: string
  display_name: string
  cuisine_tags: string[] | null
  avg_rating: number | null
  total_reviews: number
  is_open: boolean
  approval_status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function SellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadSellers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/makers')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `API error ${res.status}`)
        setLoading(false)
        return
      }
      const data = await res.json()
      setSellers(data.makers ?? [])
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadSellers() }, [loadSellers])

  const toggleOpen = async (seller: Seller) => {
    setActing(seller.id)
    await fetch('/api/admin/makers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makerId: seller.id, is_open: !seller.is_open }),
    })
    await loadSellers()
    setActing(null)
  }

  const confirmEmail = async (seller: Seller) => {
    setConfirming(seller.id)
    const res = await fetch(`/api/admin/users/${seller.user_id}/confirm-email`, { method: 'POST' })
    if (res.ok) {
      alert(`✅ Email confirmed for ${seller.display_name}. They can now sign in.`)
    } else {
      const body = await res.json().catch(() => ({}))
      alert(`Failed: ${body.error ?? 'Unknown error'}`)
    }
    setConfirming(null)
  }

  const filtered = sellers.filter((s) =>
    !search || s.display_name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 space-y-2">
        {[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Sellers</h1>
        <span className="text-sm text-gray-400">{filtered.length} total</span>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={loadSellers} className="text-xs font-semibold underline ml-4">Retry</button>
        </div>
      )}

      <input
        type="search"
        placeholder="Search sellers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm mb-5 px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors"
      />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Cuisines</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Rating</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Account</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((seller) => (
              <tr key={seller.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">
                  <Link href={`/users/${seller.user_id}`} className="hover:text-[#FF6B35] hover:underline">
                    {seller.display_name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {seller.cuisine_tags?.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-600">
                  ⭐ {seller.avg_rating?.toFixed(1) ?? '—'} ({seller.total_reviews})
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    seller.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                    seller.approval_status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {seller.approval_status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    seller.is_open ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {seller.is_open ? 'Open' : 'Closed'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-xs text-gray-400">
                  {new Date(seller.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/users/${seller.user_id}`}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => confirmEmail(seller)}
                      disabled={confirming === seller.id}
                      title="Force-confirm email so the seller can sign in"
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 transition-colors disabled:opacity-50"
                    >
                      {confirming === seller.id ? '…' : 'Confirm Email'}
                    </button>
                    <button
                      onClick={() => toggleOpen(seller)}
                      disabled={acting === seller.id}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                        seller.is_open
                          ? 'text-red-500 hover:bg-red-50 border border-red-200'
                          : 'text-green-600 hover:bg-green-50 border border-green-200'
                      }`}
                    >
                      {seller.is_open ? 'Force Close' : 'Force Open'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">No sellers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

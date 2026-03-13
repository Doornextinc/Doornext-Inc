'use client'

import { useEffect, useState, useCallback } from 'react'

interface Seller {
  id: string
  display_name: string
  cuisine_tags: string[] | null
  avg_rating: number | null
  total_reviews: number
  is_open: boolean
  created_at: string
}

export default function SellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadSellers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/makers')
    if (res.ok) {
      const data = await res.json()
      setSellers(data.makers ?? [])
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
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((seller) => (
              <tr key={seller.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">{seller.display_name}</td>
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
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">No sellers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

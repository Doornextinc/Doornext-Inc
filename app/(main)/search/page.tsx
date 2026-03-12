'use client'

import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { MOCK_MAKERS, MOCK_MENU_ITEMS } from '@/lib/mock-data'
import { MakerCard } from '@/components/home/maker-card'

export default function SearchPage() {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    if (!query.trim()) return { makers: [], items: [] }
    const q = query.toLowerCase()

    const makers = MOCK_MAKERS.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        m.cuisine_tags.some((t) => t.toLowerCase().includes(q)) ||
        m.bio?.toLowerCase().includes(q)
    )

    const items: Array<{ item: typeof MOCK_MENU_ITEMS['1'][0]; maker: typeof MOCK_MAKERS[0] }> = []
    for (const [makerId, menuItems] of Object.entries(MOCK_MENU_ITEMS)) {
      const maker = MOCK_MAKERS.find((m) => m.id === makerId)
      if (!maker) continue
      for (const item of menuItems) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.dietary_tags.some((t) => t.toLowerCase().includes(q))
        ) {
          items.push({ item, maker })
        }
      }
    }

    return { makers, items }
  }, [query])

  const hasResults = results.makers.length > 0 || results.items.length > 0

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      {/* Search bar */}
      <div className="bg-white px-4 pt-4 pb-3 sticky top-0 z-10 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900 mb-3">Search</h1>
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search food makers or dishes..."
            className="w-full bg-gray-100 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-gray-50 focus:ring-2 focus:ring-[#FF6B35]/20 transition-all"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🔍</span>
            <p className="text-gray-400 text-sm">Search for food makers or dishes</p>
          </div>
        )}

        {query.trim() && !hasResults && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">😔</span>
            <h3 className="text-lg font-bold text-gray-700">No results</h3>
            <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
          </div>
        )}

        {results.makers.length > 0 && (
          <section className="mb-6">
            <h2 className="font-bold text-gray-700 text-sm mb-3">
              Food Makers ({results.makers.length})
            </h2>
            <div className="space-y-4">
              {results.makers.map((maker) => (
                <MakerCard key={maker.id} maker={maker} />
              ))}
            </div>
          </section>
        )}

        {results.items.length > 0 && (
          <section>
            <h2 className="font-bold text-gray-700 text-sm mb-3">
              Dishes ({results.items.length})
            </h2>
            <div className="space-y-3">
              {results.items.map(({ item, maker }) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-3 flex gap-3 shadow-sm border border-gray-100"
                >
                  <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                    <p className="text-xs text-gray-400 truncate">{maker.display_name}</p>
                    <p className="text-sm font-bold text-[#FF6B35] mt-1">
                      ${item.price.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

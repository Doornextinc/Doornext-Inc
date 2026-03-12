'use client'

import { useState, useMemo } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { MakerCard } from '@/components/home/maker-card'
import { CuisineFilter } from '@/components/home/cuisine-filter'
import { MOCK_MAKERS } from '@/lib/mock-data'

export default function HomePage() {
  const [selectedCuisine, setSelectedCuisine] = useState('All')

  const filteredMakers = useMemo(() => {
    if (selectedCuisine === 'All') return MOCK_MAKERS
    return MOCK_MAKERS.filter((m) =>
      m.cuisine_tags.some(
        (t) => t.toLowerCase() === selectedCuisine.toLowerCase()
      )
    )
  }, [selectedCuisine])

  const openMakers = filteredMakers.filter((m) => m.is_open)
  const closedMakers = filteredMakers.filter((m) => !m.is_open)

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar location="Brooklyn, NY" />

      {/* Hero / Greeting */}
      <div className="bg-white px-4 pt-4 pb-2">
        <h2 className="text-2xl font-black text-gray-900">
          What are you{' '}
          <span className="text-[#FF6B35]">craving</span>?
        </h2>
        <p className="text-gray-500 text-sm mt-0.5">
          Home-cooked meals near you
        </p>
      </div>

      {/* Cuisine Filter */}
      <div className="bg-white border-b border-gray-100">
        <CuisineFilter selected={selectedCuisine} onChange={setSelectedCuisine} />
      </div>

      {/* Food Makers */}
      <div className="flex-1 px-4 py-4 space-y-6">
        {openMakers.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-base">
                Open Now{' '}
                <span className="text-[#FF6B35] text-sm font-semibold">
                  {openMakers.length}
                </span>
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {openMakers.map((maker) => (
                <MakerCard key={maker.id} maker={maker} />
              ))}
            </div>
          </section>
        )}

        {closedMakers.length > 0 && (
          <section>
            <h3 className="font-bold text-gray-400 text-base mb-3">
              Currently Closed
            </h3>
            <div className="grid grid-cols-1 gap-4 opacity-60">
              {closedMakers.map((maker) => (
                <MakerCard key={maker.id} maker={maker} />
              ))}
            </div>
          </section>
        )}

        {filteredMakers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🍽️</span>
            <h3 className="text-lg font-bold text-gray-700">No makers found</h3>
            <p className="text-gray-400 text-sm mt-1">
              Try a different cuisine or check back soon
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

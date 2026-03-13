'use client'

import { useState, useMemo, useEffect } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { MakerCard } from '@/components/home/maker-card'
import { CuisineFilter } from '@/components/home/cuisine-filter'
import { MakerCardSkeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { MOCK_MAKERS } from '@/lib/mock-data'
import type { FoodMaker } from '@/types'

const USER_LAT = 40.6782
const USER_LNG = -73.9442

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function HomePage() {
  const [selectedCuisine, setSelectedCuisine] = useState('All')
  const [makers, setMakers] = useState<FoodMaker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadMakers() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('food_makers')
          .select('*')
          .order('avg_rating', { ascending: false })

        if (error || !data || data.length === 0) {
          setMakers(MOCK_MAKERS)
        } else {
          const withDistance = data.map((m) => ({
            ...m,
            distance_km: parseFloat(
              haversine(USER_LAT, USER_LNG, m.lat, m.lng).toFixed(1)
            ),
          }))
          setMakers(withDistance)
        }
      } catch {
        setMakers(MOCK_MAKERS)
      } finally {
        setLoading(false)
      }
    }
    loadMakers()
  }, [])

  const filteredMakers = useMemo(() => {
    if (selectedCuisine === 'All') return makers
    return makers.filter((m) =>
      m.cuisine_tags.some(
        (t) => t.toLowerCase() === selectedCuisine.toLowerCase()
      )
    )
  }, [selectedCuisine, makers])

  const openMakers = filteredMakers.filter((m) => m.is_open)
  const closedMakers = filteredMakers.filter((m) => !m.is_open)

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar location="Brooklyn, NY" />

      <div className="bg-white px-4 pt-4 pb-2">
        <h2 className="text-2xl font-black text-gray-900">
          What are you{' '}
          <span className="text-[#FF6B35]">craving</span>?
        </h2>
        <p className="text-gray-500 text-sm mt-0.5">Home-cooked meals near you</p>
      </div>

      <div className="bg-white border-b border-gray-100">
        <CuisineFilter selected={selectedCuisine} onChange={setSelectedCuisine} />
      </div>

      <div className="flex-1 px-4 py-4 space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((i) => <MakerCardSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {openMakers.length > 0 && (
              <section>
                <h3 className="font-bold text-gray-900 text-base mb-3">
                  Open Now{' '}
                  <span className="text-[#FF6B35] text-sm font-semibold">
                    {openMakers.length}
                  </span>
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {openMakers.map((maker) => (
                    <MakerCard key={maker.id} maker={maker} />
                  ))}
                </div>
              </section>
            )}

            {closedMakers.length > 0 && (
              <section>
                <h3 className="font-bold text-gray-400 text-base mb-3">Currently Closed</h3>
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
                <p className="text-gray-400 text-sm mt-1">Try a different cuisine filter</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

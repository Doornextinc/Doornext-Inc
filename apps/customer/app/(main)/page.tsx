'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { MakerCard } from '@/components/home/maker-card'
import { CuisineFilter } from '@/components/home/cuisine-filter'
import { MakerCardSkeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import type { FoodMaker, Address } from '@/types'
import { MapPin, Navigation, X, Check } from 'lucide-react'
import { haversineDistance } from '@/lib/utils'
import { FALLBACK_LAT, FALLBACK_LNG, FALLBACK_LOCATION_LABEL } from '@/lib/constants'

export default function HomePage() {
  const [selectedCuisine, setSelectedCuisine] = useState('All')
  const [makers, setMakers] = useState<FoodMaker[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string }>({
    lat: FALLBACK_LAT,
    lng: FALLBACK_LNG,
    label: FALLBACK_LOCATION_LABEL,
  })

  // Address picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null)
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | 'gps' | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Get real browser location
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsLocation(gps)
        setLocation({ ...gps, label: 'Your Location' })
        setSelectedId('gps')
      },
      () => {
        // Permission denied — keep fallback
      },
      { timeout: 5000, maximumAge: 300000 }
    )
  }, [])

  useEffect(() => {
    async function loadMakers() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('food_makers')
          .select('*')
          .order('avg_rating', { ascending: false })
          .limit(50)

        if (!error && data && data.length > 0) {
          const withDistance = data.map((m) => ({
            ...m,
            distance_km: parseFloat(
              haversineDistance(location.lat, location.lng, m.lat, m.lng).toFixed(1)
            ),
          }))
          setMakers(withDistance)
        } else {
          setMakers([])
        }
      } catch {
        setMakers([])
      } finally {
        setLoading(false)
      }
    }
    loadMakers()
  }, [location.lat, location.lng])

  const handleOpenPicker = async () => {
    setPickerOpen(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [addrRes, profileRes] = await Promise.all([
      supabase.from('addresses').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('users').select('default_address_id').eq('id', user.id).single(),
    ])
    setSavedAddresses(addrRes.data || [])
    setDefaultAddressId(profileRes.data?.default_address_id || null)
  }

  const handleSelectAddress = (addr: Address) => {
    setSelectedId(addr.id)
    setLocation({
      lat: addr.lat ?? FALLBACK_LAT,
      lng: addr.lng ?? FALLBACK_LNG,
      label: `${addr.street}, ${addr.city}`,
    })
    setPickerOpen(false)
  }

  const handleSelectGps = () => {
    if (gpsLocation) {
      setSelectedId('gps')
      setLocation({ ...gpsLocation, label: 'Your Location' })
    }
    setPickerOpen(false)
  }

  const filteredMakers = useMemo(() => {
    if (selectedCuisine === 'All') return makers
    return makers.filter((m) =>
      m.cuisine_tags.some((t) => t.toLowerCase() === selectedCuisine.toLowerCase())
    )
  }, [selectedCuisine, makers])

  const openMakers = filteredMakers.filter((m) => m.is_open)
  const closedMakers = filteredMakers.filter((m) => !m.is_open)

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar location={location.label} onLocationClick={handleOpenPicker} />

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
                  <span className="text-[#FF6B35] text-sm font-semibold">{openMakers.length}</span>
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {openMakers.map((maker) => <MakerCard key={maker.id} maker={maker} />)}
                </div>
              </section>
            )}

            {closedMakers.length > 0 && (
              <section>
                <h3 className="font-bold text-gray-400 text-base mb-3">Currently Closed</h3>
                <div className="grid grid-cols-1 gap-4 opacity-60">
                  {closedMakers.map((maker) => <MakerCard key={maker.id} maker={maker} />)}
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

      {/* Address picker bottom sheet */}
      {pickerOpen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === overlayRef.current) setPickerOpen(false) }}
        >
          <div className="bg-white rounded-t-3xl p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Deliver to</h2>
              <button
                onClick={() => setPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X size={16} className="text-gray-600" />
              </button>
            </div>

            {/* GPS option */}
            <button
              onClick={handleSelectGps}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                selectedId === 'gps'
                  ? 'border-[#FF6B35] bg-orange-50'
                  : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Navigation size={18} className="text-blue-500" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm text-gray-900">Use current location</p>
                <p className="text-xs text-gray-400">
                  {gpsLocation ? 'GPS location detected' : 'Enable location permission'}
                </p>
              </div>
              {selectedId === 'gps' && (
                <Check size={16} className="text-[#FF6B35] ml-auto" />
              )}
            </button>

            {savedAddresses.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">
                  Saved Addresses
                </p>
                {savedAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    onClick={() => handleSelectAddress(addr)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                      selectedId === addr.id
                        ? 'border-[#FF6B35] bg-orange-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <MapPin size={18} className="text-[#FF6B35]" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900">{addr.label}</p>
                        {addr.id === defaultAddressId && (
                          <span className="text-[10px] font-bold text-[#FF6B35] bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {addr.street}, {addr.city}
                      </p>
                    </div>
                    {selectedId === addr.id && (
                      <Check size={16} className="text-[#FF6B35] ml-auto flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {savedAddresses.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">
                No saved addresses. Add one in your profile.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

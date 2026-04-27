'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar } from '@/components/layout/top-bar'
import { MakerCard } from '@/components/home/maker-card'
import { CuisineFilter } from '@/components/home/cuisine-filter'
import { MakerCardSkeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import type { FoodMaker, Address, OrderStatus } from '@/types'
import { MapPin, Navigation, X, Check, Search, ChevronRight } from 'lucide-react'
import { haversineDistance } from '@/lib/utils'
import { FALLBACK_LAT, FALLBACK_LNG, FALLBACK_LOCATION_LABEL } from '@/lib/constants'
import { loadGoogleMapsScript, parsePlace } from '@/lib/google-maps'

// ── Active order types & helpers ──────────────────────────────────────────────
interface ActiveOrder {
  id: string
  status: OrderStatus
  food_maker: { display_name: string } | null
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready',
  'driver_assigned', 'arrived_at_maker',
  'picked_up', 'on_the_way', 'arrived_at_customer',
]

const STATUS_BANNER: Partial<Record<OrderStatus, { emoji: string; label: string; pulse: string }>> = {
  pending:               { emoji: '⏳', label: 'Waiting for confirmation',       pulse: 'bg-gray-300' },
  confirmed:             { emoji: '✅', label: 'Order confirmed!',                pulse: 'bg-blue-400' },
  preparing:             { emoji: '🍳', label: 'Being prepared…',                 pulse: 'bg-orange-400' },
  ready:                 { emoji: '🎉', label: 'Ready — waiting for driver',      pulse: 'bg-green-400' },
  driver_assigned:       { emoji: '🚗', label: 'Driver heading to restaurant',    pulse: 'bg-[#FF6B35]' },
  arrived_at_maker:      { emoji: '📦', label: 'Driver at restaurant',            pulse: 'bg-[#FF6B35]' },
  picked_up:             { emoji: '🛵', label: 'Order picked up!',                pulse: 'bg-[#FF6B35]' },
  on_the_way:            { emoji: '🚀', label: 'On the way to you',               pulse: 'bg-[#FF6B35]' },
  arrived_at_customer:   { emoji: '📍', label: 'Driver has arrived!',             pulse: 'bg-green-400' },
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function HomePage() {
  const router = useRouter()
  const [selectedCuisine, setSelectedCuisine] = useState('All')
  const [makers, setMakers] = useState<FoodMaker[]>([])
  const [loading, setLoading] = useState(true)
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string }>({
    lat: FALLBACK_LAT,
    lng: FALLBACK_LNG,
    label: FALLBACK_LOCATION_LABEL,
  })

  const [pickerOpen, setPickerOpen] = useState(false)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null)
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | 'gps' | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchSaving, setSearchSaving] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsLocation(gps)
        setLocation({ ...gps, label: 'Your Location' })
        setSelectedId('gps')
      },
      () => {},
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

  // ── Active order: load + real-time ─────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function loadActive() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('orders')
        .select('id, status, food_maker:food_makers(display_name)')
        .eq('customer_id', user.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setActiveOrder(data as ActiveOrder | null)

      channel = supabase
        .channel('home-active-order')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${user.id}` },
          async () => {
            const { data: updated } = await supabase
              .from('orders')
              .select('id, status, food_maker:food_makers(display_name)')
              .eq('customer_id', user.id)
              .in('status', ACTIVE_STATUSES)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            setActiveOrder(updated as ActiveOrder | null)
          }
        )
        .subscribe()
    }

    loadActive()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

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

  // Attach Google Places autocomplete to the picker search input
  useEffect(() => {
    if (!pickerOpen) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return

    let ac: google.maps.places.Autocomplete | null = null

    // Slight delay so the input is mounted in the DOM
    const timer = setTimeout(() => {
      if (!searchRef.current) return
      loadGoogleMapsScript(apiKey).then(() => {
        if (!searchRef.current) return
        ac = new window.google.maps.places.Autocomplete(searchRef.current, {
          types: ['address'],
          fields: ['address_components', 'geometry'],
        })
        ac.addListener('place_changed', async () => {
          const parsed = parsePlace(ac!.getPlace())
          if (!parsed) return

          setSearchSaving(true)
          try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              const { data: newAddr, error } = await supabase
                .from('addresses')
                .insert({ user_id: user.id, label: 'Other', ...parsed })
                .select()
                .single()
              if (newAddr && !error) {
                setSavedAddresses((prev) => [...prev, newAddr as Address])
                handleSelectAddress(newAddr as Address)
                return
              }
            }
            // Not logged in — still set the location
            setSelectedId(null)
            setLocation({ lat: parsed.lat, lng: parsed.lng, label: `${parsed.street}, ${parsed.city}` })
            setPickerOpen(false)
          } finally {
            setSearchSaving(false)
          }
        })
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      if (ac) window.google?.maps?.event?.clearInstanceListeners(ac)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen])

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
    <div className="flex flex-col min-h-full bg-[#f9fafb]">
      <TopBar location={location.label} onLocationClick={handleOpenPicker} />

      {/* Hero greeting */}
      <div className="bg-white px-4 pt-5 pb-3">
        <p className="text-sm font-semibold text-[#FF6B35] mb-0.5">{getGreeting()} 👋</p>
        <h2 className="heading-xl text-gray-900">
          What are you <span className="text-[#FF6B35]">craving?</span>
        </h2>
        <p className="text-gray-400 text-sm mt-1">Home-cooked meals near you</p>
      </div>

      {/* ── Live order tracking banner ── */}
      {activeOrder && (() => {
        const info = STATUS_BANNER[activeOrder.status]
        if (!info) return null
        return (
          <button
            onClick={() => router.push(`/orders/${activeOrder.id}`)}
            className="mx-4 mb-1 w-[calc(100%-2rem)] flex items-center gap-3 bg-white border-2 border-orange-100 rounded-2xl px-4 py-3.5 shadow-sm active:bg-orange-50 transition-colors text-left"
          >
            {/* Pulsing dot */}
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${info.pulse} opacity-60`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${info.pulse}`} />
            </span>

            {/* Emoji + text */}
            <span className="text-xl leading-none flex-shrink-0">{info.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#FF6B35] uppercase tracking-wide leading-none mb-0.5">
                {activeOrder.food_maker?.display_name ?? 'Your order'}
              </p>
              <p className="text-sm font-bold text-gray-900 truncate">{info.label}</p>
            </div>

            {/* Track CTA */}
            <span className="flex items-center gap-0.5 text-xs font-bold text-[#FF6B35] flex-shrink-0">
              Track <ChevronRight size={13} />
            </span>
          </button>
        )
      })()}

      {/* Cuisine filter */}
      <div className="bg-white border-b border-gray-100 sticky top-14 z-30">
        <CuisineFilter selected={selectedCuisine} onChange={setSelectedCuisine} />
      </div>

      <div className="flex-1 px-4 py-5 space-y-6 page-enter">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <MakerCardSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {openMakers.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-bold text-gray-900 text-base">Open Now</h3>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {openMakers.length}
                  </span>
                </div>
                <div className="space-y-4">
                  {openMakers.map((maker) => <MakerCard key={maker.id} maker={maker} />)}
                </div>
              </section>
            )}

            {closedMakers.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-bold text-gray-400 text-base">Closed Now</h3>
                  <span className="bg-gray-100 text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">
                    {closedMakers.length}
                  </span>
                </div>
                <div className="space-y-4 opacity-60">
                  {closedMakers.map((maker) => <MakerCard key={maker.id} maker={maker} />)}
                </div>
              </section>
            )}

            {filteredMakers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="text-5xl mb-4">🍽️</span>
                <h3 className="heading-md text-gray-700">No makers found</h3>
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
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === overlayRef.current) setPickerOpen(false) }}
        >
          <div className="bg-white rounded-t-3xl max-h-[75vh] overflow-y-auto sheet-enter">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="px-5 pb-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="heading-lg text-gray-900">Deliver to</h2>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
                >
                  <X size={15} className="text-gray-600" strokeWidth={2.5} />
                </button>
              </div>

              {/* Address search */}
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  placeholder="Search for an address..."
                  autoComplete="off"
                  className="w-full border-2 border-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:border-[#FF6B35] transition-colors"
                />
                {searchSaving && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* GPS option */}
              <button
                onClick={handleSelectGps}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-colors ${
                  selectedId === 'gps'
                    ? 'border-[#FF6B35] bg-orange-50'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Navigation size={18} className="text-blue-500" strokeWidth={2} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-sm text-gray-900">Use current location</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {gpsLocation ? 'GPS detected' : 'Enable location permission'}
                  </p>
                </div>
                {selectedId === 'gps' && (
                  <Check size={16} className="text-[#FF6B35] flex-shrink-0" strokeWidth={2.5} />
                )}
              </button>

              {savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <p className="label-sm text-gray-400 px-1">Saved Addresses</p>
                  {savedAddresses.map((addr) => (
                    <button
                      key={addr.id}
                      onClick={() => handleSelectAddress(addr)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-colors ${
                        selectedId === addr.id
                          ? 'border-[#FF6B35] bg-orange-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                        <MapPin size={18} className="text-[#FF6B35]" strokeWidth={2} />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-gray-900">{addr.label}</p>
                          {addr.id === defaultAddressId && (
                            <span className="text-[10px] font-bold text-[#FF6B35] bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {addr.street}, {addr.city}
                        </p>
                      </div>
                      {selectedId === addr.id && (
                        <Check size={16} className="text-[#FF6B35] flex-shrink-0" strokeWidth={2.5} />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {savedAddresses.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">
                  Search above to find and save a delivery address.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

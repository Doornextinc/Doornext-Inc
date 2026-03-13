'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Plus, Trash2, Star, Loader2 } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { Address } from '@/types'

const LABELS = ['Home', 'Work', 'Other']

declare global {
  interface Window {
    google: typeof google
    initGoogleMaps?: () => void
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) { resolve(); return }
    const existing = document.getElementById('google-maps-script')
    if (existing) {
      window.initGoogleMaps = resolve
      return
    }
    window.initGoogleMaps = resolve
    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [label, setLabel] = useState('Home')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [lat, setLat] = useState(0)
  const [lng, setLng] = useState(0)

  const streetRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    loadAddresses()
  }, [])

  // Initialize Places autocomplete when the add form opens
  useEffect(() => {
    if (!adding) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !streetRef.current) return

    loadGoogleMapsScript(apiKey).then(() => {
      if (!streetRef.current || autocompleteRef.current) return
      const ac = new window.google.maps.places.Autocomplete(streetRef.current, {
        types: ['address'],
        fields: ['address_components', 'geometry', 'formatted_address'],
      })
      autocompleteRef.current = ac
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place.address_components) return

        let streetNumber = ''
        let route = ''
        let cityVal = ''
        let stateVal = ''
        let zipVal = ''

        for (const comp of place.address_components) {
          const types = comp.types
          if (types.includes('street_number')) streetNumber = comp.long_name
          else if (types.includes('route')) route = comp.long_name
          else if (types.includes('locality')) cityVal = comp.long_name
          else if (types.includes('administrative_area_level_1')) stateVal = comp.short_name
          else if (types.includes('postal_code')) zipVal = comp.long_name
        }

        setStreet(streetNumber ? `${streetNumber} ${route}` : route)
        setCity(cityVal)
        setState(stateVal)
        setZip(zipVal)
        if (place.geometry?.location) {
          setLat(place.geometry.location.lat())
          setLng(place.geometry.location.lng())
        }
      })
    })

    return () => {
      autocompleteRef.current = null
    }
  }, [adding])

  async function loadAddresses() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [addrRes, profileRes] = await Promise.all([
      supabase.from('addresses').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('users').select('default_address_id').eq('id', user.id).single(),
    ])

    setAddresses(addrRes.data || [])
    setDefaultAddressId(profileRes.data?.default_address_id || null)
    setLoading(false)
  }

  const resetForm = () => {
    setLabel('Home')
    setStreet('')
    setCity('')
    setState('')
    setZip('')
    setLat(0)
    setLng(0)
    setError(null)
    autocompleteRef.current = null
  }

  const handleAdd = async () => {
    if (!userId || !street.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError('Please fill in all fields.')
      return
    }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        label,
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        lat,
        lng,
      })
      .select()
      .single()

    if (insertError) {
      setError('Failed to save address. Please try again.')
      setSaving(false)
      return
    }

    const newAddresses = [...addresses, data]
    setAddresses(newAddresses)

    // Auto-set as default if it's the first address
    if (newAddresses.length === 1) {
      await supabase.from('users').update({ default_address_id: data.id }).eq('id', userId)
      setDefaultAddressId(data.id)
    }

    resetForm()
    setAdding(false)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!userId) return
    const supabase = createClient()
    await supabase.from('addresses').delete().eq('id', id)
    const updated = addresses.filter((a) => a.id !== id)
    setAddresses(updated)

    if (defaultAddressId === id) {
      const newDefault = updated[0]?.id || null
      await supabase.from('users').update({ default_address_id: newDefault }).eq('id', userId)
      setDefaultAddressId(newDefault)
    }
  }

  const handleSetDefault = async (id: string) => {
    if (!userId) return
    const supabase = createClient()
    await supabase.from('users').update({ default_address_id: id }).eq('id', userId)
    setDefaultAddressId(id)
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <BackBar title="Saved Addresses" />
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[#FF6B35]" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Saved Addresses" />

      <div className="p-4 space-y-4">
        {addresses.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl">
            <MapPin size={40} className="text-gray-200 mb-3" />
            <h3 className="font-bold text-gray-700">No saved addresses</h3>
            <p className="text-sm text-gray-400 mt-1">Add your home or work address for faster checkout</p>
          </div>
        )}

        {addresses.map((addr) => (
          <div key={addr.id} className="bg-white rounded-2xl px-4 py-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center mt-0.5 flex-shrink-0">
              <MapPin size={16} className="text-[#FF6B35]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900">{addr.label}</span>
                {addr.id === defaultAddressId && (
                  <span className="text-[10px] font-bold text-[#FF6B35] bg-orange-50 px-1.5 py-0.5 rounded-full">
                    Default
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">{addr.street}</p>
              <p className="text-xs text-gray-400">{addr.city}, {addr.state} {addr.zip}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {addr.id !== defaultAddressId && (
                <button
                  onClick={() => handleSetDefault(addr.id)}
                  className="w-8 h-8 rounded-full hover:bg-orange-50 flex items-center justify-center"
                  title="Set as default"
                >
                  <Star size={15} className="text-gray-300" />
                </button>
              )}
              <button
                onClick={() => handleDelete(addr.id)}
                className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center"
              >
                <Trash2 size={15} className="text-red-400" />
              </button>
            </div>
          </div>
        ))}

        {adding ? (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            {/* Label selector */}
            <div className="flex gap-2">
              {LABELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLabel(l)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    label === l
                      ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div>
              <input
                ref={streetRef}
                autoFocus
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Start typing your address..."
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
              />
              <p className="text-xs text-gray-400 mt-1 px-1">Suggestions will appear as you type</p>
            </div>

            {(city || state || zip) && (
              <div className="flex gap-2">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
                />
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  className="w-16 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
                />
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="ZIP"
                  className="w-20 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
                />
              </div>
            )}

            {/* Show manual city/state/zip fields if no autocomplete */}
            {!city && !state && !zip && street.length > 5 && (
              <div className="flex gap-2">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
                />
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  className="w-16 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
                />
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="ZIP"
                  className="w-20 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35]"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setAdding(false); resetForm() }}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                disabled={!street.trim() || !city.trim() || !state.trim() || !zip.trim() || saving}
                onClick={handleAdd}
                className="flex-1"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Address'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 justify-center"
          >
            <Plus size={16} />
            Add New Address
          </Button>
        )}
      </div>
    </div>
  )
}

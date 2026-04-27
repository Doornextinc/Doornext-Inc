'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Plus, Trash2, Star, Loader2, Check } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { loadGoogleMapsScript, parsePlace } from '@/lib/google-maps'
import type { Address } from '@/types'

const LABELS = ['Home', 'Work', 'Other']

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

  useEffect(() => { loadAddresses() }, [])

  // Google Places autocomplete — progressive enhancement only
  useEffect(() => {
    if (!adding) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !streetRef.current) return

    loadGoogleMapsScript(apiKey).then(() => {
      if (!streetRef.current || autocompleteRef.current) return
      const ac = new window.google.maps.places.Autocomplete(streetRef.current, {
        types: ['address'],
        fields: ['address_components', 'geometry'],
      })
      autocompleteRef.current = ac
      ac.addListener('place_changed', () => {
        const parsed = parsePlace(ac.getPlace())
        if (!parsed) return
        setStreet(parsed.street)
        setCity(parsed.city)
        setState(parsed.state)
        setZip(parsed.zip)
        setLat(parsed.lat)
        setLng(parsed.lng)
      })
    })

    return () => { autocompleteRef.current = null }
  }, [adding])

  async function loadAddresses() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const [addrRes, profileRes] = await Promise.allSettled([
        supabase.from('addresses').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('users').select('default_address_id').eq('id', user.id).single(),
      ])

      setAddresses(addrRes.status === 'fulfilled' ? (addrRes.value.data || []) : [])
      setDefaultAddressId(
        profileRes.status === 'fulfilled' ? (profileRes.value.data?.default_address_id || null) : null
      )
    } catch (e) {
      console.error('[addresses] Load error:', e)
    } finally {
      setLoading(false)
    }
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
    if (!street.trim()) { setError('Please enter a street address.'); return }
    if (!city.trim())   { setError('Please enter a city.'); return }
    if (!state.trim())  { setError('Please enter a state.'); return }
    if (!zip.trim())    { setError('Please enter a ZIP code.'); return }
    if (!userId)        { setError('You must be signed in to save an address.'); return }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        label,
        street: street.trim(),
        city:   city.trim(),
        state:  state.trim(),
        zip:    zip.trim(),
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

    // Auto-set as default if this is the first address
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
      const newDefault = updated[0]?.id ?? null
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
      <div className="flex flex-col min-h-full bg-[#f9fafb]">
        <BackBar title="Saved Addresses" />
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[#FF6B35]" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f9fafb]">
      <BackBar title="Saved Addresses" />

      <div className="p-4 space-y-3">

        {/* Empty state */}
        {addresses.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-2xl">
            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mb-4">
              <MapPin size={24} className="text-[#FF6B35]" />
            </div>
            <h3 className="font-bold text-gray-800">No saved addresses</h3>
            <p className="text-sm text-gray-400 mt-1">Add your home or work for faster checkout</p>
          </div>
        )}

        {/* Address list */}
        {addresses.map((addr) => (
          <div key={addr.id} className="bg-white rounded-2xl px-4 py-4 flex items-start gap-3 border border-gray-100">
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center mt-0.5 flex-shrink-0">
              <MapPin size={16} className="text-[#FF6B35]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900">{addr.label}</span>
                {addr.id === defaultAddressId && (
                  <span className="text-[10px] font-bold text-[#FF6B35] bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded-full">
                    Default
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-0.5 truncate">{addr.street}</p>
              <p className="text-xs text-gray-400">{addr.city}, {addr.state} {addr.zip}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {addr.id !== defaultAddressId && (
                <button
                  onClick={() => handleSetDefault(addr.id)}
                  className="w-8 h-8 rounded-full hover:bg-orange-50 flex items-center justify-center transition-colors"
                  title="Set as default"
                >
                  <Star size={15} className="text-gray-300" />
                </button>
              )}
              {addr.id === defaultAddressId && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center">
                  <Check size={15} className="text-[#FF6B35]" />
                </div>
              )}
              <button
                onClick={() => handleDelete(addr.id)}
                className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors"
              >
                <Trash2 size={15} className="text-red-400" />
              </button>
            </div>
          </div>
        ))}

        {/* Add form */}
        {adding ? (
          <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-100">
            <h3 className="font-bold text-gray-900 text-[15px]">New Address</h3>

            {/* Label tabs */}
            <div className="flex gap-2">
              {LABELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLabel(l)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    label === l
                      ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]'
                      : 'border-gray-100 text-gray-500'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Street — autocomplete attaches here when API key is present */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                Street Address
              </label>
              <input
                ref={streetRef}
                autoFocus
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="123 Main St"
                autoComplete="address-line1"
                className="w-full border-2 border-gray-100 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>

            {/* City / State / ZIP — always visible */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  City
                </label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="New York"
                  autoComplete="address-level2"
                  className="w-full border-2 border-gray-100 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
              <div className="w-16">
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  State
                </label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="NY"
                  autoComplete="address-level1"
                  maxLength={2}
                  className="w-full border-2 border-gray-100 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35] transition-colors uppercase"
                />
              </div>
              <div className="w-24">
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  ZIP
                </label>
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="10001"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  maxLength={10}
                  className="w-full border-2 border-gray-100 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-medium">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => { setAdding(false); resetForm() }}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                className="flex-1"
                loading={saving}
                disabled={saving}
              >
                Save Address
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-400 hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors active:bg-orange-50"
          >
            <Plus size={16} />
            Add New Address
          </button>
        )}
      </div>
    </div>
  )
}

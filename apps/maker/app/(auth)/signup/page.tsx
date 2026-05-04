'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadGoogleMapsScript, parsePlace } from '@/lib/google-maps'
import { Loader2, ChevronLeft, MapPin, Navigation } from 'lucide-react'

const CUISINE_OPTIONS = [
  'American', 'Mexican', 'Italian', 'Chinese', 'Indian',
  'Thai', 'Japanese', 'African', 'Soul Food', 'BBQ',
  'Vegan', 'Bakery', 'Desserts', 'Caribbean', 'Other',
]

export default function MakerSignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    displayName: '',
    cuisineTags: [] as string[],
  })
  const [kitchenAddress, setKitchenAddress] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addressRef = useRef<HTMLInputElement>(null)

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const toggleCuisine = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      cuisineTags: prev.cuisineTags.includes(tag)
        ? prev.cuisineTags.filter((t) => t !== tag)
        : [...prev.cuisineTags, tag].slice(0, 5),
    }))
  }

  // Attach Google Places autocomplete to the kitchen address input
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !addressRef.current) return
    let ac: google.maps.places.Autocomplete | null = null
    loadGoogleMapsScript(apiKey).then(() => {
      if (!addressRef.current) return
      ac = new window.google.maps.places.Autocomplete(addressRef.current, {
        types: ['address'],
        fields: ['address_components', 'geometry', 'formatted_address'],
      })
      ac.addListener('place_changed', () => {
        const place = ac!.getPlace()
        const parsed = parsePlace(place)
        if (parsed) {
          setLocation({ lat: parsed.lat, lng: parsed.lng })
          setKitchenAddress(place.formatted_address ?? `${parsed.street}, ${parsed.city}, ${parsed.state} ${parsed.zip}`)
          setError(null)
        }
      })
    })
    return () => { if (ac) window.google?.maps?.event?.clearInstanceListeners(ac) }
  }, [])

  const useGpsLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser.'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setKitchenAddress('Current GPS location')
        setGpsLoading(false)
        setError(null)
      },
      () => {
        setError('Could not get your location. Please type your kitchen address instead.')
        setGpsLoading(false)
      },
      { timeout: 10000 }
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (!form.displayName.trim()) { setError('Kitchen name is required.'); return }
    if (!location) { setError('Please enter your kitchen address or use your current location.'); return }
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lat: location.lat, lng: location.lng }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Signup failed. Please try again.')
      setLoading(false)
      return
    }

    router.push('/check-email?email=' + encodeURIComponent(form.email))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">

        <Link href="/welcome" className="inline-flex items-center gap-1.5 text-gray-400 text-sm mb-8 font-medium hover:text-gray-600 transition-colors">
          <ChevronLeft size={16} />
          Back
        </Link>

        <div className="mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mb-5 shadow-lg shadow-[#FF6B35]/25">
            <span className="text-white font-black text-xl">D</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Set up your kitchen</h1>
          <p className="text-gray-400 text-sm mt-1">Start selling your food on Doornext</p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Your Name</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Kitchen Name</label>
              <input
                type="text"
                required
                value={form.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder="Jane's Kitchen"
                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane@example.com"
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="At least 6 characters"
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
            />
          </div>

          {/* Kitchen address with autocomplete */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Kitchen Address
            </label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={addressRef}
                type="text"
                value={kitchenAddress}
                onChange={(e) => { setKitchenAddress(e.target.value); setLocation(null) }}
                placeholder="Start typing your kitchen address…"
                autoComplete="off"
                className={`w-full bg-white border rounded-xl pl-9 pr-3.5 py-3 text-sm text-gray-900 focus:outline-none transition-colors ${
                  location ? 'border-green-400 focus:border-green-500' : 'border-gray-200 focus:border-[#FF6B35]'
                }`}
              />
              {location && kitchenAddress !== 'Current GPS location' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400" />
              )}
            </div>
            <button
              type="button"
              onClick={useGpsLocation}
              disabled={gpsLoading}
              className="mt-2 flex items-center gap-1.5 text-xs text-[#FF6B35] font-semibold hover:underline disabled:opacity-50"
            >
              {gpsLoading
                ? <><Loader2 size={11} className="animate-spin" /> Detecting…</>
                : <><Navigation size={11} /> Use my current location</>
              }
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">
              Cuisine Types <span className="text-gray-300 normal-case font-normal">(up to 5)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleCuisine(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    form.cuisineTags.includes(tag)
                      ? 'bg-[#FF6B35] border-[#FF6B35] text-white shadow-sm shadow-[#FF6B35]/30'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-[#FF6B35] hover:text-[#FF6B35]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF6B35] hover:bg-[#E55A24] text-white rounded-xl py-4 font-black text-[15px] disabled:opacity-50 active:opacity-90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B35]/25"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Setting up kitchen…' : 'Create Kitchen Account'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#FF6B35] font-bold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

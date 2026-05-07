'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { loadGoogleMapsScript } from '@/lib/google-maps'

interface AddressAutocompleteProps {
  value: string
  /** Called with (text) on every keystroke; called with (text, place) when user picks a suggestion */
  onChange: (address: string, place?: google.maps.places.PlaceResult) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Google Places-backed address input for the maker app.
 * Drop-in replacement for a plain <input> wherever geocoded addresses are needed.
 * Uses a stable ref for onChange to avoid recreating the autocomplete on every render.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing your address…',
  className,
  disabled,
}: AddressAutocompleteProps) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const acRef      = useRef<google.maps.places.Autocomplete | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange   // always up-to-date without recreating effect
  const [loaded, setLoaded] = useState(false)

  // Load Google Maps once
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return
    loadGoogleMapsScript(apiKey).then(() => setLoaded(true))
  }, [])

  // Attach autocomplete once Maps is ready
  useEffect(() => {
    if (!loaded || !inputRef.current || acRef.current) return

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      fields: ['formatted_address', 'address_components', 'geometry'],
    })

    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (place?.formatted_address) {
        onChangeRef.current(place.formatted_address, place)
      }
    })

    acRef.current = ac

    return () => {
      if (acRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(acRef.current)
        acRef.current = null
      }
    }
  }, [loaded]) // stable — onChange read from ref

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChangeRef.current(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={
          className ??
          'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 pr-10 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors'
        }
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
        {loaded
          ? <MapPin className="h-4 w-4" />
          : <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
    </div>
  )
}

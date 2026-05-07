'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { loadGoogleMapsScript } from '@/lib/google-maps'

interface AddressAutocompleteProps {
  value: string
  onChange: (address: string, place?: google.maps.places.PlaceResult) => void
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
}

/**
 * Google Places-backed address autocomplete input.
 * Drop-in replacement for a plain <input> wherever you need address suggestions.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing your address…',
  id = 'address',
  className,
  disabled,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return

    loadGoogleMapsScript(apiKey).then(() => {
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      fields: ['formatted_address', 'address_components', 'geometry'],
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (place?.formatted_address) {
        onChange(place.formatted_address, place)
      }
    })

    autocompleteRef.current = autocomplete

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current)
        autocompleteRef.current = null
      }
    }
  }, [loaded, onChange])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        className={
          className ??
          'w-full h-10 rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
        }
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {loaded ? (
          <MapPin className="h-4 w-4" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
      </div>
    </div>
  )
}

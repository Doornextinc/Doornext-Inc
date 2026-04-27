declare global {
  interface Window {
    google: typeof google
    initGoogleMaps?: () => void
  }
}

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) { resolve(); return }
    const existing = document.getElementById('google-maps-script')
    if (existing) {
      const prev = window.initGoogleMaps
      window.initGoogleMaps = () => { prev?.(); resolve() }
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

export interface ParsedAddress {
  street: string
  city: string
  state: string
  zip: string
  lat: number
  lng: number
}

export function parsePlace(place: google.maps.places.PlaceResult): ParsedAddress | null {
  if (!place.address_components) return null
  let streetNumber = '', route = '', city = '', state = '', zip = ''
  for (const comp of place.address_components) {
    const t = comp.types
    if (t.includes('street_number'))                  streetNumber = comp.long_name
    else if (t.includes('route'))                     route = comp.long_name
    else if (t.includes('locality'))                  city = comp.long_name
    else if (t.includes('administrative_area_level_1')) state = comp.short_name
    else if (t.includes('postal_code'))               zip = comp.long_name
  }
  const lat = place.geometry?.location?.lat()
  const lng = place.geometry?.location?.lng()
  return {
    street: streetNumber ? `${streetNumber} ${route}` : route,
    city,
    state,
    zip,
    // Use null-safe values — 0 is the DB default and is treated as "no coordinate"
    // by the checkout estimate flow, so never store 0,0 from a failed geocode.
    lat: (lat != null && lat !== 0) ? lat : 0,
    lng: (lng != null && lng !== 0) ? lng : 0,
  }
}

'use client'

/**
 * RoutePreviewMap
 *
 * A compact, non-interactive Google Maps embed that renders a pickup pin
 * (orange) and a dropoff pin (teal) connected by a dashed route line.
 * Used inside delivery-request cards so drivers can see the itinerary
 * at a glance before accepting.
 */
import { useEffect, useRef } from 'react'
import { loadGoogleMapsScript } from '@/lib/google-maps'
import { darkMapStyle } from '@/lib/mapStyles'

// SVG data URIs for the two pin styles —— kept inline so the component is
// self-contained and doesn't depend on vehicleIcons (which are top-down car
// sprites, not map pins).
const PICKUP_PIN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/></filter>
    <path d="M18 2C10.27 2 4 8.27 4 16c0 10.5 14 26 14 26S32 26.5 32 16C32 8.27 25.73 2 18 2z"
      fill="#FF7A50" filter="url(#s)"/>
    <circle cx="18" cy="16" r="6" fill="white" fill-opacity="0.9"/>
    <text x="18" y="20" text-anchor="middle" font-size="9" font-weight="900"
      font-family="system-ui,sans-serif" fill="#FF7A50">P</text>
  </svg>`
)}`

const DROPOFF_PIN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/></filter>
    <path d="M18 2C10.27 2 4 8.27 4 16c0 10.5 14 26 14 26S32 26.5 32 16C32 8.27 25.73 2 18 2z"
      fill="#22d3ee" filter="url(#s)"/>
    <circle cx="18" cy="16" r="6" fill="white" fill-opacity="0.9"/>
    <text x="18" y="20" text-anchor="middle" font-size="9" font-weight="900"
      font-family="system-ui,sans-serif" fill="#0891b2">D</text>
  </svg>`
)}`

export interface RoutePreviewMapProps {
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  pickupLabel?: string
  dropoffLabel?: string
}

export function RoutePreviewMap({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  pickupLabel = 'Pickup',
  dropoffLabel = 'Dropoff',
}: RoutePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<google.maps.Map | null>(null)
  // Track whether the map was already initialised for this component instance
  const initRef      = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return

    loadGoogleMapsScript(apiKey).then(() => {
      if (!containerRef.current || initRef.current) return
      initRef.current = true

      const map = new window.google.maps.Map(containerRef.current, {
        disableDefaultUI:   true,
        gestureHandling:    'none',
        keyboardShortcuts:  false,
        clickableIcons:     false,
        styles:             darkMapStyle,
        backgroundColor:    '#212121',
        // Initial center/zoom — will be overridden by fitBounds below
        center: { lat: (pickupLat + dropoffLat) / 2, lng: (pickupLng + dropoffLng) / 2 },
        zoom: 13,
      })
      mapRef.current = map

      // Auto-fit so both markers are always visible
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend({ lat: pickupLat, lng: pickupLng })
      bounds.extend({ lat: dropoffLat, lng: dropoffLng })
      map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 })

      // Pickup marker (orange pin)
      new window.google.maps.Marker({
        position: { lat: pickupLat, lng: pickupLng },
        map,
        title: pickupLabel,
        icon: {
          url:        PICKUP_PIN,
          scaledSize: new window.google.maps.Size(36, 44),
          anchor:     new window.google.maps.Point(18, 44),
        },
        zIndex: 2,
      })

      // Dropoff marker (teal pin)
      new window.google.maps.Marker({
        position: { lat: dropoffLat, lng: dropoffLng },
        map,
        title: dropoffLabel,
        icon: {
          url:        DROPOFF_PIN,
          scaledSize: new window.google.maps.Size(36, 44),
          anchor:     new window.google.maps.Point(18, 44),
        },
        zIndex: 2,
      })

      // Dashed orange polyline connecting pickup → dropoff
      new window.google.maps.Polyline({
        path: [
          { lat: pickupLat, lng: pickupLng },
          { lat: dropoffLat, lng: dropoffLng },
        ],
        map,
        strokeOpacity: 0,   // hide solid stroke; we draw dashes via icons
        icons: [
          {
            icon: {
              path:          'M 0,-1 0,1',
              strokeOpacity: 0.85,
              strokeColor:   '#FF7A50',
              scale:         3,
            },
            offset: '0',
            repeat: '16px',
          },
        ],
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only run on mount — coordinates are stable per card render

  return <div ref={containerRef} className="w-full h-full" />
}

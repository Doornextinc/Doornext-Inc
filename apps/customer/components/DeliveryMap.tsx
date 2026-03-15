'use client'

import { useEffect, useRef } from 'react'

// Leaflet is loaded from CDN to avoid module-resolution issues with Turbopack.
// We keep a simple module-level promise so the script is only injected once.
let leafletPromise: Promise<void> | null = null

function loadLeafletFromCDN(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  // Already loaded
  if ((window as Window & { L?: unknown }).L) return Promise.resolve()
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise((resolve) => {
    // CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    // JS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve()
    script.onerror = () => resolve() // fail silently
    document.head.appendChild(script)
  })
  return leafletPromise
}

interface LatLng { lat: number; lng: number }
interface Props {
  maker: LatLng & { name: string }
  customer: LatLng
  driver?: LatLng | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any

export function DeliveryMap({ maker, customer, driver }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<L>(null)
  const driverRef   = useRef<L>(null)
  const routeRef    = useRef<L>(null)

  // Initialise map once maker / customer coords are known
  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false

    loadLeafletFromCDN().then(() => {
      if (destroyed || !containerRef.current) return
      const L: L = (window as Window & { L: L }).L
      if (!L) return

      // Destroy previous instance if coords changed
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

      const map = L.map(containerRef.current, {
        zoomControl: false, attributionControl: false,
        dragging: true, touchZoom: true,
        doubleClickZoom: false, scrollWheelZoom: false,
      })
      mapRef.current = map

      // CartoDB DarkMatter — fully black with white road lines, no API key
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map)

      // Route points
      const pts: [number, number][] = driver
        ? [[maker.lat, maker.lng], [driver.lat, driver.lng], [customer.lat, customer.lng]]
        : [[maker.lat, maker.lng], [customer.lat, customer.lng]]

      map.fitBounds(L.latLngBounds(pts), { padding: [44, 44] })

      // Dashed white itinerary line
      routeRef.current = L.polyline(pts, {
        color: '#ffffff', weight: 3, opacity: 0.85, dashArray: '10 7',
      }).addTo(map)

      // Marker factory
      const dot = (emoji: string, bg: string, border: string, size = 36) => L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid ${border};font-size:${Math.floor(size * 0.44)}px;box-shadow:0 2px 10px rgba(0,0,0,.7)">${emoji}</div>`,
        className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      })

      L.marker([maker.lat, maker.lng],    { icon: dot('🍳', '#FF6B35', '#fff') }).addTo(map)
      L.marker([customer.lat, customer.lng], { icon: dot('📍', '#22c55e', '#fff') }).addTo(map)

      if (driver) {
        driverRef.current = L.marker(
          [driver.lat, driver.lng],
          { icon: dot('🛵', '#111', '#FF6B35', 42), zIndexOffset: 1000 }
        ).addTo(map)
      }
    })

    return () => {
      destroyed = true
      mapRef.current?.remove()
      mapRef.current = null; driverRef.current = null; routeRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maker.lat, maker.lng, customer.lat, customer.lng])

  // Live-update driver marker without reinit
  useEffect(() => {
    if (!mapRef.current || !driver) return
    const L: L = (window as Window & { L: L }).L
    if (!L) return

    if (driverRef.current) {
      driverRef.current.setLatLng([driver.lat, driver.lng])
    } else {
      const dot = (emoji: string, bg: string, border: string, size = 36) => L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid ${border};font-size:${Math.floor(size * 0.44)}px;box-shadow:0 2px 10px rgba(0,0,0,.7)">${emoji}</div>`,
        className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      })
      driverRef.current = L.marker(
        [driver.lat, driver.lng],
        { icon: dot('🛵', '#111', '#FF6B35', 42), zIndexOffset: 1000 }
      ).addTo(mapRef.current)
    }
    // Redraw route with updated driver position
    const newPts: [number, number][] = [
      [maker.lat, maker.lng], [driver.lat, driver.lng], [customer.lat, customer.lng],
    ]
    routeRef.current?.setLatLngs(newPts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.lat, driver?.lng])

  return <div ref={containerRef} className="w-full h-full" style={{ background: '#0d1117' }} />
}

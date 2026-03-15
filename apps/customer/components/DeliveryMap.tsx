'use client'

import { useEffect, useRef } from 'react'

interface LatLng { lat: number; lng: number }

interface Props {
  maker: LatLng & { name: string }
  customer: LatLng
  driver?: LatLng | null
}

export function DeliveryMap({ maker, customer, driver }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const driverMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const routeLineRef = useRef<import('leaflet').Polyline | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false

    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (destroyed || !containerRef.current) return

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
      })
      mapRef.current = map

      // CartoDB DarkMatter — fully black with white road lines, no API key needed
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      // Build route points: maker → driver (if present) → customer
      const routePoints: [number, number][] = driver
        ? [[maker.lat, maker.lng], [driver.lat, driver.lng], [customer.lat, customer.lng]]
        : [[maker.lat, maker.lng], [customer.lat, customer.lng]]

      // Fit to all relevant points
      const bounds = L.latLngBounds(routePoints)
      map.fitBounds(bounds, { padding: [44, 44] })

      // White dashed itinerary line
      routeLineRef.current = L.polyline(routePoints, {
        color: '#ffffff',
        weight: 3,
        opacity: 0.85,
        dashArray: '10 7',
      }).addTo(map)

      // Marker helpers
      const dot = (emoji: string, bg: string, border: string, size = 36) =>
        L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid ${border};font-size:${Math.floor(size * 0.44)}px;box-shadow:0 2px 10px rgba(0,0,0,0.7)">${emoji}</div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

      // Kitchen marker (orange)
      L.marker([maker.lat, maker.lng], { icon: dot('🍳', '#FF6B35', '#fff') }).addTo(map)

      // Customer / destination marker (green)
      L.marker([customer.lat, customer.lng], { icon: dot('📍', '#22c55e', '#fff') }).addTo(map)

      // Driver marker (white ring, larger, on top)
      if (driver) {
        driverMarkerRef.current = L.marker(
          [driver.lat, driver.lng],
          { icon: dot('🛵', '#111111', '#FF6B35', 42), zIndexOffset: 1000 }
        ).addTo(map)
      }
    }

    init().catch(console.error)
    return () => {
      destroyed = true
      mapRef.current?.remove()
      mapRef.current = null
      driverMarkerRef.current = null
      routeLineRef.current = null
    }
  // Only reinit on mount / coord changes for maker & customer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maker.lat, maker.lng, customer.lat, customer.lng])

  // Smoothly update driver marker + route line without reinitialising the whole map
  useEffect(() => {
    if (!mapRef.current) return

    const updateDriver = async () => {
      const L = (await import('leaflet')).default
      const map = mapRef.current
      if (!map) return

      if (driver) {
        if (driverMarkerRef.current) {
          driverMarkerRef.current.setLatLng([driver.lat, driver.lng])
        } else {
          const dot = (emoji: string, bg: string, border: string, size = 36) =>
            L.divIcon({
              html: `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid ${border};font-size:${Math.floor(size * 0.44)}px;box-shadow:0 2px 10px rgba(0,0,0,0.7)">${emoji}</div>`,
              className: '',
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            })
          driverMarkerRef.current = L.marker(
            [driver.lat, driver.lng],
            { icon: dot('🛵', '#111111', '#FF6B35', 42), zIndexOffset: 1000 }
          ).addTo(map)
        }

        // Redraw route line with updated driver position
        const newPoints: [number, number][] = [
          [maker.lat, maker.lng],
          [driver.lat, driver.lng],
          [customer.lat, customer.lng],
        ]
        routeLineRef.current?.setLatLngs(newPoints)
      }
    }

    updateDriver().catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.lat, driver?.lng])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#0d1117' }}
    />
  )
}

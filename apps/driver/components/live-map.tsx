'use client'

import { useEffect, useRef } from 'react'

interface LiveMapProps {
  lat: number
  lng: number
  isOnline: boolean
}

export function LiveMap({ lat, lng, isOnline }: LiveMapProps) {
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mapRef.current) return // already initialized

    // Dynamic import to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icons (Next.js asset path issue)
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current!, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
      })

      // Dark OSM tile style
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
      }).addTo(map)

      // Custom driver marker
      const driverIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:40px;height:40px;border-radius:50%;
          background:${isOnline ? '#4ade80' : '#FF6B35'};
          border:3px solid #fff;
          box-shadow:0 0 0 4px ${isOnline ? 'rgba(74,222,128,0.35)' : 'rgba(255,107,53,0.35)'};
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
        ">🛵</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })

      const marker = L.marker([lat, lng], { icon: driverIcon }).addTo(map)
      mapRef.current = map
      markerRef.current = marker
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only init once

  // Update marker + center when position changes
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    const ll = [lat, lng] as [number, number]
    markerRef.current.setLatLng(ll)
    mapRef.current.panTo(ll, { animate: true, duration: 0.8 })
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}

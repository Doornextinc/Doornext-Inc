'use client'

import { useMemo } from 'react'

interface LiveMapProps {
  lat: number
  lng: number
  isOnline: boolean
}

export function LiveMap({ lat, lng }: LiveMapProps) {
  // Rebuild iframe src only when coords change by ~1 km (2 decimal places)
  const src = useMemo(() => {
    const delta = 0.018
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Math.round(lat * 100) / 100,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Math.round(lng * 100) / 100,
  ])

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden" style={{ zIndex: 0 }}>
      {/* Natural light OSM tiles — Neighborly Modern uses a light map surface.
          A faint warm wash ties the map into the cream palette. */}
      <iframe
        src={src}
        title="Live map"
        className="w-full h-full border-0"
        style={{
          filter: 'saturate(0.9) brightness(1.02)',
          transform: 'scale(1.05)',
        }}
      />
      <div className="absolute inset-0 pointer-events-none bg-primary/[0.04]" />
      {/* Driver position dot — centered, non-interactive overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <span className="absolute -inset-5 rounded-full bg-primary-container/20 animate-ping" />
          <span className="absolute -inset-2.5 rounded-full bg-primary-container/25" />
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
            style={{
              background: '#f26522',
              border: '3px solid white',
              boxShadow: '0 0 0 5px rgba(242,101,34,0.25), 0 6px 20px rgba(166,59,0,0.35)',
            }}
          >
            🛵
          </div>
        </div>
      </div>
    </div>
  )
}

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
      {/* CSS filter: converts OSM light tiles → dark map. pointer-events enabled for pan/zoom */}
      <iframe
        src={src}
        title="Live map"
        className="w-full h-full border-0"
        style={{
          filter: 'invert(93%) hue-rotate(180deg) saturate(0.65) brightness(0.82)',
          transform: 'scale(1.05)',
        }}
      />
      {/* Driver position dot — centered, non-interactive overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <span className="absolute -inset-5 rounded-full bg-[#D4622B]/15 animate-ping" />
          <span className="absolute -inset-2.5 rounded-full bg-[#D4622B]/20" />
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-2xl"
            style={{
              background: '#D4622B',
              border: '3px solid white',
              boxShadow: '0 0 0 5px rgba(212,98,43,0.3), 0 6px 24px rgba(0,0,0,0.6)',
            }}
          >
            🛵
          </div>
        </div>
      </div>
    </div>
  )
}

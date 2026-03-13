'use client'

import { useMemo } from 'react'

interface LiveMapProps {
  lat: number
  lng: number
  isOnline: boolean
}

export function LiveMap({ lat, lng }: LiveMapProps) {
  // Rebuild the iframe src only when coords change meaningfully (2 decimal places ≈ 1 km)
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
      {/* CSS filter turns OSM light tiles into a dark map */}
      <iframe
        src={src}
        title="Live map"
        scrolling="no"
        className="w-full h-full border-0 pointer-events-none"
        style={{
          filter: 'invert(93%) hue-rotate(180deg) saturate(0.7) brightness(0.85)',
          transform: 'scale(1.05)', // hide white edges from filter
        }}
      />
      {/* Driver dot overlay — centered on screen */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <span className="absolute -inset-3 rounded-full bg-[#FF6B35]/20 animate-ping" />
          <div
            className="w-10 h-10 rounded-full border-3 border-white flex items-center justify-center text-lg shadow-xl"
            style={{
              background: '#FF6B35',
              border: '3px solid white',
              boxShadow: '0 0 0 4px rgba(255,107,53,0.35), 0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            🛵
          </div>
        </div>
      </div>
    </div>
  )
}

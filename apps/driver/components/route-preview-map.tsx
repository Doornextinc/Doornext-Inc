'use client'

/**
 * RoutePreviewMap
 *
 * Compact, non-interactive route preview using OpenStreetMap tiles (no API key).
 * Renders an OSM iframe auto-fitted to the pickup→dropoff bounding box, then
 * overlays an SVG dashed line and coloured pins via absolute positioning.
 *
 * The same dark CSS filter as LiveMap is applied for visual consistency.
 */
import { useMemo } from 'react'

// Degrees of padding added around the bbox on every side (~500–900 m typical)
const PAD = 0.01

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
  const { src, pickupPct, dropoffPct } = useMemo(() => {
    // Build a bounding box that contains both points with padding
    const minLat = Math.min(pickupLat, dropoffLat) - PAD
    const maxLat = Math.max(pickupLat, dropoffLat) + PAD
    const minLng = Math.min(pickupLng, dropoffLng) - PAD
    const maxLng = Math.max(pickupLng, dropoffLng) + PAD

    const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
    const src  = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`

    // Convert lat/lng → % position within the rendered bbox.
    // OSM renders: x = left → right (lng min → max), y = top → bottom (lat max → min)
    const lngSpan = maxLng - minLng
    const latSpan = maxLat - minLat

    const pct = (lat: number, lng: number) => ({
      left: ((lng - minLng) / lngSpan) * 100,
      top:  ((maxLat - lat) / latSpan) * 100,
    })

    return { src, pickupPct: pct(pickupLat, pickupLng), dropoffPct: pct(dropoffLat, dropoffLng) }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng])

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ pointerEvents: 'none' }}
      aria-label={`Route from ${pickupLabel} to ${dropoffLabel}`}
    >
      {/* OSM tile iframe — same dark CSS filter as LiveMap */}
      <iframe
        src={src}
        title="Route preview"
        className="absolute inset-0 w-full h-full border-0"
        style={{
          filter: 'invert(93%) hue-rotate(180deg) saturate(0.65) brightness(0.82)',
          transform: 'scale(1.06)',
        }}
      />

      {/* SVG overlay: dashed route line */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ overflow: 'visible' }}
      >
        <line
          x1={`${pickupPct.left}%`}
          y1={`${pickupPct.top}%`}
          x2={`${dropoffPct.left}%`}
          y2={`${dropoffPct.top}%`}
          stroke="#FF7A50"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.9"
        />
      </svg>

      {/* Pickup pin — orange */}
      <div
        className="absolute"
        style={{
          left:      `${pickupPct.left}%`,
          top:       `${pickupPct.top}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
          style={{ backgroundColor: '#FF7A50', boxShadow: '0 2px 8px rgba(255,122,80,0.6)' }}
        />
      </div>

      {/* Dropoff pin — cyan */}
      <div
        className="absolute"
        style={{
          left:      `${dropoffPct.left}%`,
          top:       `${dropoffPct.top}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
          style={{ backgroundColor: '#22d3ee', boxShadow: '0 2px 8px rgba(34,211,238,0.5)' }}
        />
      </div>
    </div>
  )
}

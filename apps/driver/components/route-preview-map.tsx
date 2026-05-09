'use client'

/**
 * RoutePreviewMap
 *
 * Compact, non-interactive route preview using OpenStreetMap tiles (no API key).
 * Renders an OSM iframe auto-fitted to the pickup→dropoff bounding box, then
 * overlays an SVG dashed line and coloured pins via absolute positioning.
 *
 * When lat/lng are missing or zero (null-island), the component attempts to
 * geocode the supplied address strings via Nominatim before rendering the map.
 *
 * The same dark CSS filter as LiveMap is applied for visual consistency.
 */
import { useMemo, useState, useEffect, useRef } from 'react'

// Degrees of padding added around the bbox on every side (~500–900 m typical)
const PAD = 0.01

async function nominatimGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'Doornext/1.0' } })
    const data: Array<{ lat: string; lon: string }> = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

function isValidCoord(v: number | null | undefined): v is number {
  return typeof v === 'number' && v !== 0
}

export interface RoutePreviewMapProps {
  pickupLat?: number | null
  pickupLng?: number | null
  dropoffLat?: number | null
  dropoffLng?: number | null
  pickupLabel?: string
  dropoffLabel?: string
  /** Fallback address string for geocoding when pickupLat/Lng are zero/null */
  pickupAddress?: string
  /** Fallback address string for geocoding when dropoffLat/Lng are zero/null */
  dropoffAddress?: string
}

export function RoutePreviewMap({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  pickupLabel = 'Pickup',
  dropoffLabel = 'Dropoff',
  pickupAddress,
  dropoffAddress,
}: RoutePreviewMapProps) {
  // Coordinates from props (null-island 0,0 treated as invalid)
  const directPickup = isValidCoord(pickupLat) && isValidCoord(pickupLng)
    ? { lat: pickupLat, lng: pickupLng }
    : null
  const directDropoff = isValidCoord(dropoffLat) && isValidCoord(dropoffLng)
    ? { lat: dropoffLat, lng: dropoffLng }
    : null

  const [geocodedPickup, setGeocodedPickup] = useState<{ lat: number; lng: number } | null>(null)
  const [geocodedDropoff, setGeocodedDropoff] = useState<{ lat: number; lng: number } | null>(null)
  const [geocoding, setGeocoding] = useState(false)

  // Track which addresses we've already attempted so effects don't re-fire on
  // every parent render that doesn't actually change address strings.
  const lastPickupAddr = useRef<string | undefined>(undefined)
  const lastDropoffAddr = useRef<string | undefined>(undefined)

  useEffect(() => {
    const needPickup = !directPickup && !!pickupAddress && pickupAddress !== lastPickupAddr.current
    const needDropoff = !directDropoff && !!dropoffAddress && dropoffAddress !== lastDropoffAddr.current

    if (!needPickup && !needDropoff) return

    if (needPickup) lastPickupAddr.current = pickupAddress
    if (needDropoff) lastDropoffAddr.current = dropoffAddress

    setGeocoding(true)
    Promise.all([
      needPickup  ? nominatimGeocode(pickupAddress!)  : Promise.resolve(null),
      needDropoff ? nominatimGeocode(dropoffAddress!) : Promise.resolve(null),
    ]).then(([p, d]) => {
      if (p) setGeocodedPickup(p)
      if (d) setGeocodedDropoff(d)
      setGeocoding(false)
    }).catch(() => setGeocoding(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupAddress, dropoffAddress, !!directPickup, !!directDropoff])

  const finalPickup  = directPickup  ?? geocodedPickup
  const finalDropoff = directDropoff ?? geocodedDropoff

  const { src, pickupPct, dropoffPct } = useMemo(() => {
    if (!finalPickup || !finalDropoff) {
      return { src: null, pickupPct: null, dropoffPct: null }
    }

    // Build a bounding box that contains both points with padding
    const minLat = Math.min(finalPickup.lat, finalDropoff.lat) - PAD
    const maxLat = Math.max(finalPickup.lat, finalDropoff.lat) + PAD
    const minLng = Math.min(finalPickup.lng, finalDropoff.lng) - PAD
    const maxLng = Math.max(finalPickup.lng, finalDropoff.lng) + PAD

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

    return {
      src,
      pickupPct:  pct(finalPickup.lat,  finalPickup.lng),
      dropoffPct: pct(finalDropoff.lat, finalDropoff.lng),
    }
  }, [finalPickup, finalDropoff])

  // Loading skeleton while geocoding, or blank if no coords and no address to geocode
  if (!src || !pickupPct || !dropoffPct) {
    return (
      <div className="w-full h-full bg-[#111] flex items-center justify-center">
        {geocoding && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#FF7A50]/30 border-t-[#FF7A50] rounded-full animate-spin" />
            <p className="text-zinc-600 text-[10px]">Loading map…</p>
          </div>
        )}
      </div>
    )
  }

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

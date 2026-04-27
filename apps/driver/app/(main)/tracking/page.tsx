'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import { Navigation2, Gauge, Target } from 'lucide-react'

// ─── Dynamic import: LiveMap (no SSR — uses iframe/DOM) ───────────────────────

const LiveMap = dynamic(
  () => import('@/components/live-map').then((m) => m.LiveMap),
  { ssr: false }
)

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const isOnline = useDriverStore((s) => s.isOnline)

  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [speed, setSpeed] = useState<number | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [gpsActive, setGpsActive] = useState(false)

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }
  }, [router, userId, authReady, hasHydrated])

  // ── GPS watchPosition ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setHeading(pos.coords.heading)
        setSpeed(pos.coords.speed)
        setAccuracy(pos.coords.accuracy)
        setGpsActive(true)
      },
      () => {
        setGpsActive(false)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // ── Fallback coords (center of map) if GPS not yet acquired ────────────────
  const displayLat = lat ?? 40.7128
  const displayLng = lng ?? -74.006

  // ── Speed conversion: m/s → mph ────────────────────────────────────────────
  const speedMph = speed !== null ? (speed * 2.237).toFixed(1) : null

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Live Tracking" showBack />

      {/* ── Map section ──────────────────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden bg-[#0D0D0D]" style={{ height: '55dvh' }}>
        <LiveMap lat={displayLat} lng={displayLng} isOnline={isOnline} />

        {/* Online/offline badge overlay (top-right) */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isOnline ? 'bg-green-400' : 'bg-zinc-500'
            }`}
            style={isOnline ? { boxShadow: '0 0 6px #4ade80' } : undefined}
          />
          <span className={`text-[11px] font-bold ${isOnline ? 'text-green-400' : 'text-zinc-400'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── Stats & info panel ────────────────────────────────────────────────── */}
      <div className="flex-1 p-4 space-y-3">

        {/* 3-column stat grid */}
        <div className="grid grid-cols-3 gap-2">

          {/* Heading */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FF7A50]/10 flex items-center justify-center">
              <Navigation2 size={15} className="text-[#FF7A50]" />
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white leading-none">
                {heading !== null ? `${heading.toFixed(0)}°` : '—'}
              </p>
              <p className="text-[10px] text-zinc-600 mt-1 font-semibold uppercase tracking-wider">Heading</p>
            </div>
          </div>

          {/* Speed */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FF7A50]/10 flex items-center justify-center">
              <Gauge size={15} className="text-[#FF7A50]" />
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white leading-none">
                {speedMph !== null ? speedMph : '—'}
              </p>
              <p className="text-[10px] text-zinc-600 mt-1 font-semibold uppercase tracking-wider">MPH</p>
            </div>
          </div>

          {/* Accuracy */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FF7A50]/10 flex items-center justify-center">
              <Target size={15} className="text-[#FF7A50]" />
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white leading-none">
                {accuracy !== null ? `${accuracy.toFixed(0)}m` : '—'}
              </p>
              <p className="text-[10px] text-zinc-600 mt-1 font-semibold uppercase tracking-wider">Accuracy</p>
            </div>
          </div>

        </div>

        {/* Coordinate row */}
        <div className="bg-[#111] border border-white/5 rounded-2xl px-4 py-3.5 flex items-center justify-between">
          <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider">Coordinates</p>
          <p className="text-xs font-mono text-zinc-400">
            {lat !== null && lng !== null
              ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
              : 'Waiting…'
            }
          </p>
        </div>

        {/* GPS status row */}
        <div className="flex items-center gap-3 bg-[#111] border border-white/5 rounded-2xl px-4 py-3.5">
          {gpsActive ? (
            <>
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <p className="text-sm font-bold text-green-400">GPS Active</p>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-600 flex-shrink-0" />
              <p className="text-sm font-bold text-zinc-500">Waiting for GPS…</p>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

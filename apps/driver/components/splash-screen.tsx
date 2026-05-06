'use client'

import { useEffect, useState } from 'react'
import { useDriverStore } from '@/store/driver-store'

export function SplashScreen() {
  const authReady   = useDriverStore((s) => s.authReady)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)

  // visible  → fully shown
  // fading   → opacity-0 transition running
  // gone     → unmounted
  const [phase, setPhase] = useState<'visible' | 'fading' | 'gone'>('visible')

  useEffect(() => {
    // Wait for both persist rehydration AND the first auth event,
    // but enforce a minimum 1.2 s display time so the animation completes.
    if (!hasHydrated || !authReady) return

    const MIN_MS = 3000
    const shownAt = (window as Window & { __splashShownAt?: number }).__splashShownAt ?? Date.now()
    const remaining = Math.max(0, MIN_MS - (Date.now() - shownAt))

    const t = setTimeout(() => {
      setPhase('fading')
      setTimeout(() => setPhase('gone'), 500) // matches transition duration
    }, remaining)

    return () => clearTimeout(t)
  }, [authReady, hasHydrated])

  // Record when the splash first mounted
  useEffect(() => {
    (window as Window & { __splashShownAt?: number }).__splashShownAt = Date.now()
  }, [])

  if (phase === 'gone') return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#080808]"
      style={{
        transition: 'opacity 0.5s ease',
        opacity: phase === 'fading' ? 0 : 1,
        pointerEvents: phase === 'fading' ? 'none' : 'auto',
      }}
    >
      {/* ── Rings ── */}
      <div className="relative flex items-center justify-center">

        {/* Ring 3 — outermost, slowest ping */}
        <span
          className="absolute rounded-full border border-[#FF7A50]/10"
          style={{
            width: 200,
            height: 200,
            animation: 'ring-ping 2.4s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />

        {/* Ring 2 — mid, offset delay */}
        <span
          className="absolute rounded-full border border-[#FF7A50]/20"
          style={{
            width: 148,
            height: 148,
            animation: 'ring-ping 2.4s cubic-bezier(0,0,0.2,1) 0.4s infinite',
          }}
        />

        {/* Ring 1 — inner, solid, gentle pulse */}
        <span
          className="absolute rounded-full border-2 border-[#FF7A50]/40"
          style={{
            width: 100,
            height: 100,
            animation: 'ring-pulse 1.8s ease-in-out infinite',
          }}
        />

        {/* Center icon */}
        <div
          className="relative z-10 w-16 h-16 rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 0 32px rgba(255,122,80,0.35), 0 0 8px rgba(255,122,80,0.2)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" className="w-full h-full">
            <rect width="192" height="192" rx="42" fill="#0A0A0A" />
            <polygon points="112,36 76,108 98,108 80,156 116,84 94,84" fill="#FF7A50" />
          </svg>
        </div>
      </div>

      {/* App name */}
      <p
        className="absolute text-zinc-600 text-xs font-bold tracking-[0.25em] uppercase"
        style={{ bottom: '38%' }}
      >
        Nexter Driver
      </p>

      {/* Keyframe styles */}
      <style>{`
        @keyframes ring-ping {
          0%   { transform: scale(0.85); opacity: 0.6; }
          70%  { transform: scale(1.08); opacity: 0;   }
          100% { transform: scale(0.85); opacity: 0;   }
        }
        @keyframes ring-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.5; }
          50%       { transform: scale(1.06); opacity: 1;   }
        }
      `}</style>
    </div>
  )
}

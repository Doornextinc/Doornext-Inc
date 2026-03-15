'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MapPin, Bell, ChevronDown, ShoppingCart } from 'lucide-react'
import { useCartStore } from '@/store/cart'
import { createClient } from '@/lib/supabase/client'

interface TopBarProps {
  location?: string
  title?: string
  showCart?: boolean
  showNotifications?: boolean
  onLocationClick?: () => void
}

export function TopBar({
  location = 'Your Location',
  title,
  showCart = true,
  showNotifications = true,
  onLocationClick,
}: TopBarProps) {
  const [mounted, setMounted] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  useEffect(() => setMounted(true), [])
  const rawTotal = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0))
  const totalItems = mounted ? rawTotal : 0

  useEffect(() => {
    if (!showNotifications) return
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
    try {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false)
          .then(({ count }) => setUnreadCount(count ?? 0))
      })
    } catch {
      // Supabase not configured — skip notification count
    }
  }, [showNotifications])

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-14">
        {title ? (
          <h1 className="heading-md text-gray-900">{title}</h1>
        ) : (
          <button
            className="flex items-center gap-2 group min-w-0"
            onClick={onLocationClick}
          >
            <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
              <MapPin size={14} className="text-[#FF6B35]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col items-start min-w-0">
              <span className="text-[10px] text-gray-400 font-semibold leading-none uppercase tracking-wide">
                Delivering to
              </span>
              <div className="flex items-center gap-0.5 mt-0.5">
                <span className="text-sm font-bold text-gray-900 leading-tight truncate max-w-[160px]">
                  {location}
                </span>
                <ChevronDown size={13} className="text-gray-500 flex-shrink-0" strokeWidth={2.5} />
              </div>
            </div>
          </button>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          {showNotifications && (
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <Bell size={17} className="text-gray-600" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#FF6B35] rounded-full border-2 border-white" />
              )}
            </Link>
          )}

          {showCart && totalItems > 0 && (
            <Link
              href="/cart"
              aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
              className="flex items-center gap-1.5 bg-[#FF6B35] text-white pl-3 pr-3.5 h-9 rounded-full shadow-cta"
            >
              <ShoppingCart size={15} strokeWidth={2.25} />
              <span className="text-sm font-bold tabular-nums">{totalItems}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export function BackBar({
  title,
  onBack,
  rightAction,
}: {
  title: string
  onBack?: () => void
  rightAction?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-14">
        <button
          onClick={onBack ?? (() => history.back())}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
          aria-label="Go back"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="heading-md text-gray-900">{title}</h1>
        <div className="w-9 flex items-center justify-end">{rightAction}</div>
      </div>
    </header>
  )
}

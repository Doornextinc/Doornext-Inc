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
          .eq('is_read', false)
          .then(({ count }) => setUnreadCount(count ?? 0))
      })
    } catch {
      // Supabase not configured — skip notification count
    }
  }, [showNotifications])

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-14">
        {title ? (
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        ) : (
          <button className="flex items-center gap-1.5 group" onClick={onLocationClick}>
            <MapPin size={16} className="text-[#FF6B35]" />
            <div className="flex flex-col items-start">
              <span className="text-xs text-gray-400 font-medium leading-none">
                Delivering to
              </span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-gray-900 leading-tight">
                  {location}
                </span>
                <ChevronDown size={14} className="text-gray-500" />
              </div>
            </div>
          </button>
        )}

        <div className="flex items-center gap-2">
          {showNotifications && (
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <Bell size={18} className="text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF6B35] rounded-full" />
              )}
            </Link>
          )}
          {showCart && totalItems > 0 && (
            <Link
              href="/cart"
              aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
              className="relative w-9 h-9 rounded-full bg-[#FF6B35] flex items-center justify-center"
            >
              <ShoppingCart size={18} className="text-white" />
              <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
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
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-14">
        <button
          onClick={onBack ?? (() => history.back())}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <svg
            width="18"
            height="18"
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
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        <div className="w-9">{rightAction}</div>
      </div>
    </header>
  )
}

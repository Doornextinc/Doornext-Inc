'use client'

import Link from 'next/link'
import { MapPin, Bell, ChevronDown, ShoppingCart } from 'lucide-react'
import { useCartStore } from '@/store/cart'

interface TopBarProps {
  location?: string
  title?: string
  showCart?: boolean
  showNotifications?: boolean
}

export function TopBar({
  location = 'Your Location',
  title,
  showCart = true,
  showNotifications = true,
}: TopBarProps) {
  const totalItems = useCartStore((s) => s.totalItems())

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-14">
        {title ? (
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        ) : (
          <button className="flex items-center gap-1.5 group">
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
              className="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <Bell size={18} className="text-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF6B35] rounded-full" />
            </Link>
          )}
          {showCart && totalItems > 0 && (
            <Link
              href="/cart"
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

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Home, Search, ShoppingBag, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/search', icon: Search, label: 'Search' },
  { href: '/orders', icon: ShoppingBag, label: 'Orders' },
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-100 bottom-nav max-w-[430px] mx-auto"
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full relative"
            >
              {/* Active pill indicator */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#FF6B35] rounded-full" />
              )}

              <div
                className={cn(
                  'flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200',
                  isActive ? 'bg-orange-50' : ''
                )}
              >
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className={cn(
                    'transition-colors duration-200',
                    isActive ? 'text-[#FF6B35]' : 'text-gray-400'
                  )}
                />
              </div>

              <span
                className={cn(
                  'text-[10px] font-semibold leading-none transition-colors duration-200',
                  isActive ? 'text-[#FF6B35]' : 'text-gray-400'
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

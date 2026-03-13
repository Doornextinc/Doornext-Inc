'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Home, Search, ShoppingBag, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/cart'

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
  const rawTotal = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0))
  const totalItems = mounted ? rawTotal : 0

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 bottom-nav max-w-[430px] mx-auto">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 relative transition-colors',
                isActive ? 'text-[#FF6B35]' : 'text-gray-400'
              )}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="transition-transform active:scale-90"
                />
                {label === 'Orders' && totalItems > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#FF6B35] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {totalItems > 9 ? '9+' : totalItems}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium',
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

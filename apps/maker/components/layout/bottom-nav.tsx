'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardList, UtensilsCrossed, TrendingUp, User } from 'lucide-react'

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/orders', icon: ClipboardList, label: 'Orders' },
  { href: '/menu', icon: UtensilsCrossed, label: 'Menu' },
  { href: '/earnings', icon: TrendingUp, label: 'Earnings' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 max-w-[430px] mx-auto">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 transition-colors ${isActive ? 'text-[#FF6B35]' : 'text-gray-400'}`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] font-medium ${isActive ? 'text-[#FF6B35]' : 'text-gray-400'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

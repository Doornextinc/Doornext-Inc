'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MapPin, Package, TrendingUp, User } from 'lucide-react'

const navItems = [
  { href: '/available', icon: MapPin, label: 'Pickups' },
  { href: '/active', icon: Package, label: 'Active' },
  { href: '/earnings', icon: TrendingUp, label: 'Earnings' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700/50 max-w-[430px] mx-auto">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 transition-colors ${
                isActive ? 'text-[#FF6B35]' : 'text-slate-400'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

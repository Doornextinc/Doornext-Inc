'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, Package, TrendingUp, User } from 'lucide-react'
import { useDriverStore } from '@/store/driver-store'

const navItems = [
  { href: '/',          icon: Home,       label: 'Home',     exact: true },
  { href: '/available', icon: MapPin,      label: 'Pickups',  exact: false },
  { href: '/active',    icon: Package,     label: 'Active',   exact: false },
  { href: '/earnings',  icon: TrendingUp,  label: 'Earnings', exact: false },
  { href: '/profile',   icon: User,        label: 'Account',  exact: false },
]

export function BottomNav() {
  const pathname = usePathname()
  const activeOrderId = useDriverStore(s => s.activeOrderId)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto">
      <div className="h-px bg-slate-700/60" />
      <div className="bg-slate-900/95 backdrop-blur-sm flex items-center justify-around h-[68px] pb-safe">
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          const showBadge = href === '/active' && !!activeOrderId

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 relative"
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#FF6B35] rounded-full" />
              )}
              <div className={`relative p-1.5 rounded-xl transition-colors ${isActive ? 'bg-[#FF6B35]/12' : ''}`}>
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={isActive ? 'text-[#FF6B35]' : 'text-slate-500'}
                />
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-900" />
                )}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-[#FF6B35]' : 'text-slate-500'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

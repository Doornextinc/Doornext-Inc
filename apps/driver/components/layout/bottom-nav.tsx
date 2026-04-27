'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Package, TrendingUp, User } from 'lucide-react'
import { useDriverStore } from '@/store/driver-store'

const navItems = [
  { href: '/',         icon: Home,        label: 'Home',     exact: true  },
  { href: '/active',   icon: Package,     label: 'Active',   exact: false },
  { href: '/earnings', icon: TrendingUp,  label: 'Earnings', exact: false },
  { href: '/profile',  icon: User,        label: 'Account',  exact: false },
]

export function BottomNav() {
  const pathname = usePathname()
  const activeOrderId = useDriverStore(s => s.activeOrderId)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto">
      <div className="h-px bg-white/6" />
      <div className="bg-[#080808]/98 backdrop-blur-sm flex items-center justify-around h-[68px] pb-safe">
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
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.8 : 1.8}
                  className={isActive ? 'text-white' : 'text-zinc-600'}
                />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#080808]" />
                )}
              </div>
              <span className={`text-[11px] tracking-wide ${isActive ? 'font-black text-white' : 'font-semibold text-zinc-600'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

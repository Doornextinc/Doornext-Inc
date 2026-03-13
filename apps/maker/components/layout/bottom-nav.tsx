'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardList, UtensilsCrossed, TrendingUp, User } from 'lucide-react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/orders',    icon: ClipboardList,   label: 'Orders' },
  { href: '/menu',      icon: UtensilsCrossed, label: 'Menu' },
  { href: '/earnings',  icon: TrendingUp,      label: 'Earnings' },
  { href: '/profile',   icon: User,            label: 'Account' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto bg-white border-t border-[#EBEBEB]">
      <div className="flex items-center justify-around h-[60px]">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.8 : 1.8}
                className={isActive ? 'text-[#111]' : 'text-[#BABABA]'}
              />
              <span className={`text-[11px] ${isActive ? 'font-black text-[#111]' : 'font-medium text-[#BABABA]'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

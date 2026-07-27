'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Truck, DollarSign, User } from 'lucide-react'
import { useActiveOrderId } from '@/store/driver-store'

/**
 * Bottom navigation — Neighborly Modern (light).
 *
 * White surface, warm ambient top shadow, and an orange "primary-fixed"
 * pill on the active tab (matching the Stitch kit). Routes are unchanged.
 */
const navItems: Array<{ href: string; icon: React.ElementType; label: string; exact: boolean }> = [
  { href: '/',         icon: Home,       label: 'Home',     exact: true  },
  { href: '/active',   icon: Truck,      label: 'Trips',    exact: false },
  { href: '/earnings', icon: DollarSign, label: 'Earnings', exact: false },
  { href: '/account',  icon: User,       label: 'Account',  exact: false },
]

export function BottomNav() {
  const pathname = usePathname()
  const activeOrderId = useActiveOrderId()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto bg-surface-container-lowest rounded-t-xl shadow-[0_-4px_30px_rgba(166,59,0,0.08)]">
      <div className="flex items-center justify-around pt-2 pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          const showActiveBadge = href === '/active' && !!activeOrderId

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 relative transition-transform active:scale-95 ${
                isActive ? 'bg-primary-fixed rounded-full px-5' : 'px-3'
              }`}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className={isActive ? 'text-on-primary-fixed-variant' : 'text-secondary'}
                />
                {showActiveBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-neighborhood-green rounded-full border-2 border-surface-container-lowest" />
                )}
              </div>
              <span
                className={`font-mono text-[11px] tracking-wide ${
                  isActive ? 'text-on-primary-fixed-variant font-bold' : 'text-on-surface-variant'
                }`}
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

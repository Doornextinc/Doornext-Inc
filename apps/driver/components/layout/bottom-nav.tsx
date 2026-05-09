'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useActiveOrderId } from '@/store/driver-store'
import { EMOJI } from '@doornext/shared/emoji'

/**
 * Bottom nav uses brand emojis instead of lucide icons — matches the
 * neighborly, warm visual voice across the app. Each item has a semantic
 * emoji that reflects its purpose, not a generic glyph.
 */
const navItems: Array<{ href: string; emoji: string; label: string; exact: boolean }> = [
  { href: '/',         emoji: EMOJI.home,      label: 'Home',     exact: true  },
  { href: '/active',   emoji: EMOJI.trips,     label: 'Trips',    exact: false },
  { href: '/earnings', emoji: EMOJI.earnings,  label: 'Earnings', exact: false },
  { href: '/profile',  emoji: EMOJI.user,      label: 'Account',  exact: false },
]

export function BottomNav() {
  const pathname = usePathname()
  const activeOrderId = useActiveOrderId()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto">
      <div className="h-px bg-white/6" />
      <div className="bg-[#080808]/98 backdrop-blur-sm flex items-center justify-around h-[68px] pb-safe">
        {navItems.map(({ href, emoji, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          const showActiveBadge = href === '/active' && !!activeOrderId

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 relative"
            >
              <div className="relative">
                <span
                  className={`text-[22px] block transition-all ${
                    isActive ? 'opacity-100 scale-110' : 'opacity-50'
                  }`}
                  aria-hidden
                >
                  {emoji}
                </span>
                {showActiveBadge && (
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

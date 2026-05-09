'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { EMOJI } from '@doornext/shared/emoji'

const navItems: Array<{ href: string; emoji: string; label: string }> = [
  { href: '/',        emoji: EMOJI.home,     label: 'Home'    },
  { href: '/search',  emoji: EMOJI.search,   label: 'Search'  },
  { href: '/orders',  emoji: EMOJI.receipt,  label: 'Orders'  },
  { href: '/chat',    emoji: EMOJI.chat,     label: 'Chat'    },
  { href: '/profile', emoji: EMOJI.user,     label: 'Profile' },
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
        {navItems.map(({ href, emoji, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full relative"
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#FF6B35] rounded-full" />
              )}

              <div
                className={cn(
                  'flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200',
                  isActive ? 'bg-orange-50' : ''
                )}
              >
                <span
                  className={cn(
                    'text-[20px] block transition-all duration-200',
                    isActive ? 'opacity-100 scale-110' : 'opacity-60'
                  )}
                  aria-hidden
                >
                  {emoji}
                </span>
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

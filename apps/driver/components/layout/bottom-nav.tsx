'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Home, Package, MessageCircle, TrendingUp, User } from 'lucide-react'
import { useDriverStore } from '@/store/driver-store'

const navItems = [
  { href: '/',          icon: Home,          label: 'Home',     exact: true  },
  { href: '/active',    icon: Package,       label: 'Active',   exact: false },
  { href: '/messages',  icon: MessageCircle, label: 'Messages', exact: false },
  { href: '/earnings',  icon: TrendingUp,    label: 'Earnings', exact: false },
  { href: '/profile',   icon: User,          label: 'Account',  exact: false },
]

export function BottomNav() {
  const pathname = usePathname()
  const activeOrderId = useDriverStore(s => s.activeOrderId)
  const userId = useDriverStore(s => s.userId)
  const [unreadMessages, setUnreadMessages] = useState(0)

  // Track unread message count via Stream Chat API
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function checkUnread() {
      try {
        const res = await fetch('/api/stream/unread')
        if (!res.ok || cancelled) return
        const data = await res.json()
        setUnreadMessages(data.total_unread_count ?? 0)
      } catch { /* ignore */ }
    }

    checkUnread()
    const interval = setInterval(checkUnread, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [userId])

  const msgBadgeCount = unreadMessages > 0 ? Math.min(unreadMessages, 9) : 0

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto">
      <div className="h-px bg-white/6" />
      <div className="bg-[#080808]/98 backdrop-blur-sm flex items-center justify-around h-[68px] pb-safe">
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          const showActiveBadge = href === '/active' && !!activeOrderId
          const showMsgBadge = href === '/messages' && msgBadgeCount > 0

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
                {showActiveBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#080808]" />
                )}
                {showMsgBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-[#FF7A50] rounded-full border border-[#080808] flex items-center justify-center">
                    <span className="text-[9px] font-black text-white leading-none">{msgBadgeCount}</span>
                  </span>
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

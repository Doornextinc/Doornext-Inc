'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EMOJI } from '@doornext/shared/emoji'

const navItems: Array<{ href: string; emoji: string; label: string }> = [
  { href: '/dashboard',     emoji: EMOJI.home,           label: 'Dashboard' },
  { href: '/orders',        emoji: EMOJI.receipt,        label: 'Orders'    },
  { href: '/menu',          emoji: EMOJI.utensils,       label: 'Menu'      },
  { href: '/notifications', emoji: EMOJI.notifications,  label: 'Alerts'    },
  { href: '/profile',       emoji: EMOJI.user,           label: 'Account'   },
]

export function BottomNav() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let userId: string | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      userId = user.id

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
      setUnread(count ?? 0)

      supabase
        .channel('maker-nav-notifs')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          async () => {
            const { count: c } = await supabase
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId!)
              .eq('read', false)
            setUnread(c ?? 0)
          }
        )
        .subscribe()
    }

    init()
    return () => { supabase.removeAllChannels() }
  }, [])

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto bg-white border-t border-gray-100">
      <div className="flex items-center justify-around h-[60px]">
        {navItems.map(({ href, emoji, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          const showBadge = href === '/notifications' && unread > 0

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
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
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-[#FF6B35] rounded-full flex items-center justify-center">
                    <span className="text-[9px] font-black text-white leading-none">{Math.min(unread, 9)}</span>
                  </span>
                )}
              </div>
              <span className={`text-[11px] ${isActive ? 'font-black text-[#FF6B35]' : 'font-medium text-gray-300'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

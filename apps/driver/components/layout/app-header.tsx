'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AppHeaderProps {
  /** Custom greeting title (home page only) */
  greeting?: { time: string; name: string }
  /** Simple page title (all other pages) */
  title?: string
  /** Show back button instead of logo/greeting area */
  showBack?: boolean
  backHref?: string
}

export function AppHeader({ greeting, title, showBack, backHref }: AppHeaderProps) {
  const router = useRouter()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [initials, setInitials] = useState('D')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('driver_profiles')
      .select('avatar_url, full_name')
      .then(async ({ data }) => {
        if (!data) {
          // Need user id first
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          const { data: profile } = await supabase.from('driver_profiles').select('avatar_url, full_name').eq('id', user.id).single()
          if (profile) {
            setAvatarUrl(profile.avatar_url)
            setInitials((profile.full_name ?? 'D')[0].toUpperCase())
          }
          return
        }
        const profile = Array.isArray(data) ? data[0] : data
        if (profile) {
          setAvatarUrl(profile.avatar_url)
          setInitials((profile.full_name ?? 'D')[0].toUpperCase())
        }
      })
  }, [])

  return (
    <header className="sticky top-0 z-40 bg-[#080808]/98 backdrop-blur-sm border-b border-white/5">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left side */}
        <div className="flex items-center gap-3">
          {showBack ? (
            <button
              onClick={() => backHref ? router.push(backHref) : router.back()}
              className="w-9 h-9 rounded-xl bg-[#141414] border border-white/5 flex items-center justify-center"
            >
              <ChevronLeft size={18} className="text-zinc-400" />
            </button>
          ) : null}
          {greeting ? (
            <div>
              <p className="text-[11px] text-zinc-500">Good {greeting.time},</p>
              <h1 className="text-lg font-black text-white leading-tight">{greeting.name} 👋</h1>
            </div>
          ) : (
            <h1 className="text-xl font-black text-white tracking-tight">{title}</h1>
          )}
        </div>

        {/* Right side: bell + avatar */}
        <div className="flex items-center gap-2.5">
          <button className="relative w-9 h-9 rounded-xl bg-[#141414] border border-white/5 flex items-center justify-center">
            <Bell size={16} className="text-zinc-400" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF6B35] rounded-full" />
          </button>
          <Link href="/profile">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-black text-sm">{initials}</span>
              )}
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}

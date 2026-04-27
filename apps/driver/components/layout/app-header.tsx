'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronLeft, MessageCircle } from 'lucide-react'
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
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('avatar_url, full_name')
        .eq('id', user.id)
        .single()
      if (profile) {
        setInitials((profile.full_name ?? 'D')[0].toUpperCase())
        // avatar_url stores a storage path — generate a signed URL for display
        const storagePath = profile.avatar_url
        if (storagePath && !storagePath.startsWith('http')) {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(storagePath, 3600)
          setAvatarUrl(signed?.signedUrl ?? null)
        } else {
          setAvatarUrl(storagePath)
        }
      }
    })
  }, [])

  return (
    <header className="sticky top-0 z-40 bg-[#0A0A0A] border-b border-white/8" style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)' }}>
      <div className="flex items-center justify-between px-4 h-[60px]">

        {/* Left side */}
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => backHref ? router.push(backHref) : router.back()}
              className="w-10 h-10 rounded-2xl bg-[#161616] border border-white/8 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ChevronLeft size={20} className="text-zinc-300" />
            </button>
          )}

          {greeting ? (
            <div>
              <p className="text-xs text-zinc-500 leading-none mb-0.5">Good {greeting.time},</p>
              <h1 className="text-xl font-black text-white leading-tight tracking-tight">{greeting.name} 👋</h1>
            </div>
          ) : (
            <h1 className="text-[22px] font-black text-white tracking-tight leading-none">{title}</h1>
          )}
        </div>

        {/* Right side: messages + bell + avatar */}
        <div className="flex items-center gap-2">
          <Link href="/messages">
            <div className="relative w-10 h-10 rounded-2xl bg-[#161616] border border-white/8 flex items-center justify-center active:scale-95 transition-transform">
              <MessageCircle size={18} className="text-zinc-300" />
            </div>
          </Link>
          <Link href="/messages">
            <div className="relative w-10 h-10 rounded-2xl bg-[#161616] border border-white/8 flex items-center justify-center active:scale-95 transition-transform">
              <Bell size={18} className="text-zinc-300" />
            </div>
          </Link>
          <Link href="/profile">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#D4622B] to-[#E07545] flex items-center justify-center overflow-hidden active:scale-95 transition-transform">
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

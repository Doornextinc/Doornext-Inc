'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { getStreamClient, connectStreamUser } from '@/lib/stream'

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
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [unreadChats, setUnreadChats] = useState(0)
  const userId = useDriverStore(s => s.userId)
  const userEmail = useDriverStore(s => s.userEmail)
  const streamPollRef = useRef<NodeJS.Timeout | null>(null)

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

  // ── Unread system notifications (DB) ──────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const refresh = () => supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ count }) => setUnreadNotifs(count ?? 0))

    refresh()

    const channel = supabase
      .channel('driver-header-notifs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // ── Unread Stream chat messages (polled — cheap, only counts) ─────────────
  // Stream WebSocket events are flaky; polling every 30 s is reliable enough
  // for the badge. The notifications page itself uses real-time Stream state.
  useEffect(() => {
    if (!userId) return

    let cancelled = false

    async function refreshChatUnread() {
      try {
        await connectStreamUser(userId!, userEmail ?? 'Nexter', undefined)
        const stream = getStreamClient()
        const channels = await stream.queryChannels(
          { members: { $in: [userId!] }, type: 'messaging' },
          [{ last_message_at: -1 }],
          { limit: 30, watch: false, state: true },
        )
        if (cancelled) return
        const total = channels.reduce((s, ch) => s + ch.countUnread(), 0)
        setUnreadChats(total)
      } catch {
        if (!cancelled) setUnreadChats(0)
      }
    }

    refreshChatUnread()
    streamPollRef.current = setInterval(refreshChatUnread, 30_000)

    return () => {
      cancelled = true
      if (streamPollRef.current) clearInterval(streamPollRef.current)
    }
  }, [userId, userEmail])

  const totalUnread = unreadNotifs + unreadChats

  return (
    <header className="sticky top-0 z-40 bg-[#0A0A0A] border-b border-white/8" style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)' }}>
      <div className="flex items-center justify-between px-4 h-[60px]">

        {/* Left side */}
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => backHref ? router.push(backHref) : router.back()}
              className="w-10 h-10 rounded-2xl bg-[#161616] border border-white/8 flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Back"
            >
              <span className="text-zinc-300 text-lg" aria-hidden>‹</span>
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

        {/* Right side: unified notification bell + avatar.
            Messages icon was merged into the bell — chat previews now live in
            the /notifications feed. See finding from this audit session. */}
        <div className="flex items-center gap-2">
          <Link href="/notifications" aria-label="Notifications and messages">
            <div className="relative w-10 h-10 rounded-2xl bg-[#161616] border border-white/8 flex items-center justify-center active:scale-95 transition-transform">
              <span className="text-base" aria-hidden>🔔</span>
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#FF7A50] rounded-full border-2 border-[#0A0A0A] text-white text-[10px] font-black flex items-center justify-center">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </div>
          </Link>
          <Link href="/profile" aria-label="Profile">
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

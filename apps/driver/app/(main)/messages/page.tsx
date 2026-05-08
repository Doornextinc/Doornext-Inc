'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { getStreamClient, connectStreamUser } from '@/lib/stream'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'

interface ChatPreview {
  id: string
  name: string
  lastMessage: string
  time: string
  unread: number
}

function formatChannelTime(date?: Date | null): string {
  if (!date) return ''
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return 'Now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString('en-US', { weekday: 'short' })
}

export default function MessagesPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const userEmail = useDriverStore((s) => s.userEmail)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const loadChats = useCallback(async () => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { setLoading(false); return }
    try {
      const supabase = createClient()

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .single()

      await connectStreamUser(
        userId,
        profile?.full_name ?? userEmail ?? 'Driver',
        profile?.avatar_url ?? undefined
      )

      const streamClient = getStreamClient()
      const result = await streamClient.queryChannels(
        { members: { $in: [userId] }, type: 'messaging' },
        [{ last_message_at: -1 }],
        { limit: 30, watch: true, state: true }
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const previews: ChatPreview[] = result.map((ch) => {
        const lastMsg = ch.lastMessage()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawName = (ch.data as any)?.name as string | undefined
        const name = rawName || (ch.id ?? '').replace('order-', 'Order #').toUpperCase()
        const createdAt = lastMsg?.created_at
        return {
          id: ch.id ?? '',
          name,
          lastMessage: lastMsg?.text ?? 'No messages yet',
          time: formatChannelTime(createdAt ? new Date(createdAt as unknown as string) : null),
          unread: ch.countUnread(),
        }
      })

      setChats(previews)
    } catch (e) {
      const err = e as { code?: string; isWSFailure?: boolean; message?: string }
      if (
        err?.code === 'STREAM_NOT_CONFIGURED' ||
        err?.isWSFailure === true ||
        err?.message?.includes('WS') ||
        err?.message?.includes('connect')
      ) {
        setUnavailable(true)
      } else {
        console.error('Failed to load chats:', e)
        setUnavailable(true) // fall back gracefully for any other Stream error
      }
    } finally {
      setLoading(false)
    }
  }, [userId, userEmail, authReady, hasHydrated])

  useEffect(() => { loadChats() }, [loadChats])

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Messages" />

      {loading ? (
        <div className="divide-y divide-white/5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <div className="w-12 h-12 rounded-full bg-[#1A1A1A] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[#1A1A1A] rounded animate-pulse w-32" />
                <div className="h-3 bg-[#1A1A1A] rounded animate-pulse w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : unavailable ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-6">
          <MessageCircle size={56} className="text-zinc-700 mb-4" />
          <h2 className="text-xl font-bold text-white">Chat coming soon</h2>
          <p className="text-zinc-500 text-sm mt-1">In-app messaging will be available shortly.</p>
        </div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-6">
          <MessageCircle size={56} className="text-zinc-700 mb-4" />
          <h2 className="text-xl font-bold text-white">No messages yet</h2>
          <p className="text-zinc-500 text-sm mt-1">Accept a delivery to start chatting with customers</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => router.push(`/messages/${chat.id}`)}
              className="w-full flex items-center gap-3 px-4 py-4 active:bg-white/5 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-[#FF7A50]/15 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">📦</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-white text-sm truncate">{chat.name}</p>
                  <p className="text-xs text-zinc-500 flex-shrink-0 ml-2">{chat.time}</p>
                </div>
                <p className="text-sm text-zinc-500 truncate">{chat.lastMessage}</p>
              </div>
              {chat.unread > 0 && (
                <span className="w-5 h-5 bg-[#FF7A50] rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {chat.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { getStreamClient, connectStreamUser } from '@/lib/stream'
import { createClient } from '@/lib/supabase/client'

interface ChatPreview {
  id: string
  name: string
  lastMessage: string
  time: string
  unread: number
  emoji: string
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

export default function ChatListPage() {
  const router = useRouter()
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const loadChats = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()

      await connectStreamUser(
        user.id,
        profile?.full_name || user.email || 'Customer',
        profile?.avatar_url ?? undefined
      )

      const streamClient = getStreamClient()
      const result = await streamClient.queryChannels(
        { members: { $in: [user.id] }, type: 'messaging' },
        [{ last_message_at: -1 }],
        { limit: 30, watch: true, state: true }
      )

      const previews: ChatPreview[] = result.map((ch) => {
        const lastMsg = ch.lastMessage()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = ((ch.data as any)?.name as string) || 'Chat'
        const isOrderChannel = (ch.id ?? '').startsWith('order-')
        const createdAt = lastMsg?.created_at
        return {
          id: ch.id ?? '',
          name,
          lastMessage: lastMsg?.text ?? 'No messages yet',
          time: formatChannelTime(createdAt ? new Date(createdAt as unknown as string) : null),
          unread: ch.countUnread(),
          emoji: isOrderChannel ? '📦' : '💬',
        }
      })

      setChats(previews)
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any)?.code === 'STREAM_NOT_CONFIGURED') {
        setUnavailable(true)
      } else {
        console.error('Failed to load chats:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadChats() }, [loadChats])

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8f8f8]">
        <TopBar title="Messages" showCart={false} />
        <div className="flex-1 bg-white divide-y divide-gray-50">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-32" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar title="Messages" showCart={false} />
      <div className="flex-1">
        {unavailable ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <MessageCircle size={60} className="text-gray-200 mb-4" />
            <h2 className="text-xl font-bold text-gray-700">Chat coming soon</h2>
            <p className="text-gray-400 text-sm mt-1">In-app messaging will be available shortly.</p>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageCircle size={60} className="text-gray-200 mb-4" />
            <h2 className="text-xl font-bold text-gray-700">No messages yet</h2>
            <p className="text-gray-400 text-sm mt-1">Chat with food makers and Nexters here</p>
          </div>
        ) : (
          <div className="bg-white divide-y divide-gray-50">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => router.push(`/chat/${chat.id}`)}
                className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {chat.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-gray-900 text-sm truncate">{chat.name}</p>
                    <p className="text-xs text-gray-400 flex-shrink-0 ml-2">{chat.time}</p>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{chat.lastMessage}</p>
                </div>
                {chat.unread > 0 && (
                  <span className="w-5 h-5 bg-[#FF6B35] rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {chat.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

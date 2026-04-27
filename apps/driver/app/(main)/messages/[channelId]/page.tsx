'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Send, ArrowLeft } from 'lucide-react'
import { getStreamClient, connectStreamUser } from '@/lib/stream'
import { createClient } from '@/lib/supabase/client'
import type { Channel, MessageResponse } from 'stream-chat'

interface Message {
  id: string
  text: string
  sender: 'me' | 'them'
  time: string
  senderName?: string
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function ChatChannelPage() {
  const { channelId } = useParams<{ channelId: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [channelName, setChannelName] = useState('Chat')
  const [userId, setUserId] = useState<string | null>(null)
  const channelRef = useRef<Channel | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const mapMessage = useCallback((msg: MessageResponse, myId: string): Message => ({
    id: msg.id,
    text: msg.text ?? '',
    sender: msg.user?.id === myId ? 'me' : 'them',
    time: formatTime(msg.created_at!),
    senderName: msg.user?.name as string | undefined,
  }), [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let cleanup: (() => void) | null = null

    const setup = async () => {
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
          profile?.full_name ?? user.email ?? 'Driver',
          profile?.avatar_url ?? undefined
        )

        setUserId(user.id)
        const streamClient = getStreamClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (streamClient.channel as any)('messaging', channelId)
        await channel.watch()
        channelRef.current = channel

        const name = (channel.data?.name as string) || channelId.replace('order-', 'Order #').toUpperCase().slice(0, 20)
        setChannelName(name)

        const existing = (channel.state.messages as MessageResponse[]).map((m) =>
          mapMessage(m, user.id)
        )
        setMessages(existing)

        const handleNew = (event: { message?: MessageResponse }) => {
          if (!event.message) return
          setMessages((prev) => {
            if (prev.some((m) => m.id === event.message!.id)) return prev
            return [...prev, mapMessage(event.message!, user.id)]
          })
        }

        channel.on('message.new', handleNew)
        cleanup = () => { channel.off('message.new', handleNew) }
      } catch (e) {
        const err = e as { code?: string; isWSFailure?: boolean }
        // WS / config failures are non-fatal — show empty state, don't crash
        if (err?.code !== 'STREAM_NOT_CONFIGURED' && !err?.isWSFailure) {
          console.error('Chat setup failed:', e)
        }
      } finally {
        setLoading(false)
      }
    }

    setup()
    return () => { cleanup?.() }
  }, [channelId, mapMessage])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || !channelRef.current) return
    setInput('')
    try {
      await channelRef.current.sendMessage({ text })
    } catch (e) {
      console.error('Send failed:', e)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#080808]">
      {/* Header */}
      <div className="bg-[#0A0A0A] px-4 py-3 flex items-center gap-3 border-b border-white/5">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-full flex items-center justify-center">
          <ArrowLeft size={20} className="text-zinc-300" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{channelName}</p>
          <p className="text-xs text-green-400 font-medium">Active now</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#FF7A50] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.sender === 'me'
                    ? 'bg-[#FF7A50] text-white rounded-br-sm'
                    : 'bg-[#1A1A1A] text-zinc-100 rounded-bl-sm border border-white/5'
                }`}>
                  {msg.sender === 'them' && msg.senderName && (
                    <p className="text-[10px] font-semibold text-zinc-500 mb-1">{msg.senderName}</p>
                  )}
                  <p className="leading-relaxed">{msg.text}</p>
                  <p className={`text-[10px] mt-1 text-right ${msg.sender === 'me' ? 'text-white/60' : 'text-zinc-600'}`}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="text-4xl mb-3">💬</span>
                <p className="text-zinc-500 text-sm">No messages yet. Say hi!</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-[#0A0A0A] border-t border-white/5 px-4 py-3 pb-nav flex items-end gap-2">
        <div className="flex-1 bg-[#1A1A1A] rounded-2xl px-4 py-2.5 min-h-[44px] flex items-center border border-white/5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Message..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 resize-none max-h-24"
            rows={1}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-10 h-10 bg-[#FF7A50] rounded-full flex items-center justify-center disabled:opacity-40 active:bg-[#E86B40] transition-colors flex-shrink-0"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  )
}

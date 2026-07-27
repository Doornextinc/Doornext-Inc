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
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="bg-surface px-4 py-3 flex items-center gap-3 border-b border-outline-variant/30">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-full flex items-center justify-center">
          <ArrowLeft size={20} className="text-on-surface" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-on-surface text-sm truncate">{channelName}</p>
          <p className="text-xs text-neighborhood-green font-medium">Active now</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.sender === 'me'
                    ? 'bg-primary text-on-primary rounded-br-sm'
                    : 'bg-surface-container-high text-on-surface rounded-bl-sm border border-outline-variant/30'
                }`}>
                  {msg.sender === 'them' && msg.senderName && (
                    <p className="text-[10px] font-semibold text-on-surface-variant mb-1">{msg.senderName}</p>
                  )}
                  <p className="leading-relaxed">{msg.text}</p>
                  <p className={`text-[10px] mt-1 text-right ${msg.sender === 'me' ? 'text-on-surface/60' : 'text-outline'}`}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="text-4xl mb-3">💬</span>
                <p className="text-on-surface-variant text-sm">No messages yet. Say hi!</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-surface border-t border-outline-variant/30 px-4 py-3 pb-nav flex items-end gap-2">
        <div className="flex-1 bg-surface-container-high rounded-2xl px-4 py-2.5 min-h-[44px] flex items-center border border-outline-variant/30">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Message..."
            className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline resize-none max-h-24"
            rows={1}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-10 h-10 bg-primary-container rounded-full flex items-center justify-center disabled:opacity-40 active:bg-primary transition-colors flex-shrink-0"
        >
          <Send size={16} className="text-on-surface" />
        </button>
      </div>
    </div>
  )
}

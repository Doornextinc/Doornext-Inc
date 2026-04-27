'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Send, Phone, ArrowLeft, MessageCircleOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getStreamClient, connectStreamUser, isChatUnavailableError } from '@/lib/stream'
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
  const [unavailable, setUnavailable] = useState(false)
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
          profile?.full_name || user.email || 'Customer',
          profile?.avatar_url ?? undefined
        )

        setUserId(user.id)
        const streamClient = getStreamClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (streamClient.channel as any)('messaging', channelId)
        await channel.watch()
        channelRef.current = channel

        // Set channel name
        const name = (channel.data?.name as string) || channelId.replace('order-', 'Order #').slice(0, 20)
        setChannelName(name)

        // Load existing messages
        const existing = (channel.state.messages as MessageResponse[]).map((m) =>
          mapMessage(m, user.id)
        )
        setMessages(existing)

        // Subscribe to new messages
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
        if (isChatUnavailableError(e)) {
          setUnavailable(true)
        } else {
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

  if (unavailable) {
    return (
      <div className="flex flex-col h-screen bg-[#f8f8f8]">
        <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100 safe-area-top">
          <button onClick={() => router.back()} className="w-8 h-8 rounded-full flex items-center justify-center">
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <p className="font-bold text-gray-900 text-sm">Chat</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <MessageCircleOff size={56} className="text-gray-200 mb-4" />
          <h2 className="text-lg font-bold text-gray-700">Chat unavailable</h2>
          <p className="text-sm text-gray-400 mt-1">Messaging is temporarily offline. Please try again later.</p>
          <button
            onClick={() => { setUnavailable(false); setLoading(true) }}
            className="mt-6 px-5 py-2.5 bg-[#FF6B35] text-white rounded-xl text-sm font-semibold active:bg-[#E55A24] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#f8f8f8]">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100 safe-area-top">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-full flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{channelName}</p>
          <p className="text-xs text-green-500 font-medium">Active now</p>
        </div>
        <button className="w-8 h-8 rounded-full flex items-center justify-center">
          <Phone size={16} className="text-gray-600" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">Today</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex', msg.sender === 'me' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm',
                  msg.sender === 'me'
                    ? 'bg-[#FF6B35] text-white rounded-br-sm'
                    : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
                )}>
                  {msg.sender === 'them' && msg.senderName && (
                    <p className="text-[10px] font-semibold text-gray-400 mb-1">{msg.senderName}</p>
                  )}
                  <p className="leading-relaxed">{msg.text}</p>
                  <p className={cn('text-[10px] mt-1 text-right', msg.sender === 'me' ? 'text-white/70' : 'text-gray-400')}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="text-4xl mb-3">💬</span>
                <p className="text-gray-400 text-sm">No messages yet. Say hi!</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 pb-nav flex items-end gap-2">
        <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 min-h-[44px] flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Message..."
            className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 resize-none max-h-24"
            rows={1}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-10 h-10 bg-[#FF6B35] rounded-full flex items-center justify-center disabled:opacity-40 active:bg-[#E55A24] transition-colors flex-shrink-0"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  )
}

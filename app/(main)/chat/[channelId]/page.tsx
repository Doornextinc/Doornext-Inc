'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Send, Phone, MoreVertical } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  text: string
  sender: 'me' | 'them'
  time: string
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    text: "Hi! Your order has been received. I'm starting to cook now 🍲",
    sender: 'them',
    time: '6:30 PM',
  },
  {
    id: '2',
    text: 'Can you go light on the pepper please?',
    sender: 'me',
    time: '6:31 PM',
  },
  {
    id: '3',
    text: 'Of course! Will do 😊 Your food will be ready in about 30 minutes',
    sender: 'them',
    time: '6:31 PM',
  },
  {
    id: '4',
    text: 'Your order is almost ready! 🍲',
    sender: 'them',
    time: '6:42 PM',
  },
]

export default function ChatChannelPage() {
  const { channelId } = useParams<{ channelId: string }>()
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!input.trim()) return
    const now = new Date()
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), text: input.trim(), sender: 'me', time },
    ])
    setInput('')

    // Simulate reply
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          text: "Got it! I'll take care of that for you 👍",
          sender: 'them',
          time,
        },
      ])
    }, 1500)
  }

  return (
    <div className="flex flex-col h-screen bg-[#f8f8f8]">
      <BackBar
        title="Mama Adaeze's Kitchen"
        rightAction={
          <div className="flex gap-1">
            <button className="w-8 h-8 rounded-full flex items-center justify-center">
              <Phone size={16} className="text-gray-600" />
            </button>
            <button className="w-8 h-8 rounded-full flex items-center justify-center">
              <MoreVertical size={16} className="text-gray-600" />
            </button>
          </div>
        }
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-area px-4 py-4 space-y-3">
        {/* Date separator */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">Today</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.sender === 'me' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm',
                msg.sender === 'me'
                  ? 'bg-[#FF6B35] text-white rounded-br-sm'
                  : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
              )}
            >
              <p className="leading-relaxed">{msg.text}</p>
              <p
                className={cn(
                  'text-[10px] mt-1 text-right',
                  msg.sender === 'me' ? 'text-white/70' : 'text-gray-400'
                )}
              >
                {msg.time}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 pb-nav flex items-end gap-2">
        <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 min-h-[44px] flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
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

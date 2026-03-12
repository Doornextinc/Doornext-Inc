'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle, ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'

const MOCK_CHATS = [
  {
    id: 'chat_1',
    name: "Mama Adaeze's Kitchen",
    lastMessage: 'Your order is almost ready! 🍲',
    time: '6:42 PM',
    unread: 2,
    emoji: '🍲',
    online: true,
  },
  {
    id: 'chat_2',
    name: 'James O. (Nexter)',
    lastMessage: "I'm 2 minutes away",
    time: '6:45 PM',
    unread: 1,
    emoji: '🛵',
    online: true,
  },
  {
    id: 'chat_3',
    name: "Rosa's Mexican Cocina",
    lastMessage: 'Thanks for your order! Enjoy 🌮',
    time: 'Yesterday',
    unread: 0,
    emoji: '🌮',
    online: false,
  },
]

export default function ChatListPage() {
  const router = useRouter()

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar title="Messages" showCart={false} />

      <div className="flex-1">
        {MOCK_CHATS.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageCircle size={60} className="text-gray-200 mb-4" />
            <h2 className="text-xl font-bold text-gray-700">No messages yet</h2>
            <p className="text-gray-400 text-sm mt-1">
              Chat with food makers and Nexters here
            </p>
          </div>
        ) : (
          <div className="bg-white divide-y divide-gray-50">
            {MOCK_CHATS.map((chat) => (
              <button
                key={chat.id}
                onClick={() => router.push(`/chat/${chat.id}`)}
                className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors text-left"
              >
                <div className="relative w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {chat.emoji}
                  {chat.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-gray-900 text-sm">{chat.name}</p>
                    <p className="text-xs text-gray-400">{chat.time}</p>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{chat.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {chat.unread > 0 && (
                    <span className="w-5 h-5 bg-[#FF6B35] rounded-full text-white text-xs font-bold flex items-center justify-center">
                      {chat.unread}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

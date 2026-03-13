'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  title: string
  body: string
  type: string
  read: boolean
  created_at: string
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      setNotifications(data || [])
      setLoading(false)

      // Mark all as read
      if (data && data.some((n) => !n.read)) {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false)
      }
    }
    load()
  }, [router])

  const typeIcon = (type: string) => {
    switch (type) {
      case 'order_accepted': return '✅'
      case 'order_ready': return '🍽️'
      case 'order_delivered': return '📦'
      case 'new_message': return '💬'
      default: return '🔔'
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="Notifications" />

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell size={48} className="text-gray-200 mb-4" />
          <h3 className="text-lg font-bold text-gray-700">All caught up</h3>
          <p className="text-gray-400 text-sm mt-1">No notifications yet</p>
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-white rounded-2xl px-4 py-3 flex items-start gap-3 ${!n.read ? 'border-l-4 border-[#FF6B35]' : ''}`}
            >
              <span className="text-xl mt-0.5">{typeIcon(n.type)}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                <p className="text-xs text-gray-300 mt-1">
                  {new Date(n.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronRight } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  title: string
  body: string
  type: string
  read: boolean
  created_at: string
  data: { order_id?: string; [key: string]: unknown }
}

function typeIcon(type: string): string {
  switch (type) {
    case 'new_order':              return '🔔'
    case 'order_confirmed':        return '✅'
    case 'order_accepted':         return '✅'
    case 'order_rejected':         return '❌'
    case 'order_cancelled':        return '🚫'
    case 'order_preparing':        return '🍳'
    case 'order_ready':            return '🍽️'
    case 'driver_heading_to_maker': return '🛵'
    case 'order_driver_assigned':  return '🛵'
    case 'order_picked_up':        return '📦'
    case 'order_on_the_way':       return '🚀'
    case 'order_arrived_at_maker': return '📍'
    case 'order_arrived_at_customer': return '📍'
    case 'order_delivered':        return '🎉'
    case 'failed_delivery':        return '⚠️'
    case 'pickup_pin_locked':      return '🔒'
    case 'payment_failed':         return '💳'
    case 'new_message':            return '💬'
    case 'driver_arrived':         return '📍'
    case 'driver_reassigned':      return '🔄'
    case 'withdrawal_approved':    return '✅'
    case 'withdrawal_rejected':    return '❌'
    case 'withdrawal_paid':        return '💰'
    default:                       return '🔔'
  }
}

function destinationFor(n: Notification): string | null {
  if (n.data?.order_id) return `/orders/${n.data.order_id}`
  return null
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

      // Exclude driver-only notification types — a user who is also a driver
      // in the same DB would otherwise see pickup/preparation alerts here.
      const DRIVER_TYPES = ['order_available', 'order_preparing']
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, type, read, created_at, data')
        .eq('user_id', user.id)
        .not('type', 'in', `(${DRIVER_TYPES.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(50)

      setNotifications((data as Notification[]) || [])
      setLoading(false)

      // Mark all unread as read
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
          {notifications.map((n) => {
            const dest = destinationFor(n)
            const Wrapper = dest ? 'button' : 'div'
            return (
              <Wrapper
                key={n.id}
                {...(dest ? { onClick: () => router.push(dest) } : {})}
                className={`w-full text-left bg-white rounded-2xl px-4 py-3 flex items-start gap-3 transition-colors
                  ${!n.read ? 'border-l-4 border-[#FF6B35]' : ''}
                  ${dest ? 'active:bg-gray-50 cursor-pointer' : ''}
                `}
              >
                <span className="text-xl mt-0.5 flex-shrink-0">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                  <p className="text-xs text-gray-300 mt-1">
                    {new Date(n.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                </div>
                {dest && (
                  <ChevronRight size={15} className="text-gray-300 flex-shrink-0 mt-1" />
                )}
              </Wrapper>
            )
          })}
        </div>
      )}
    </div>
  )
}

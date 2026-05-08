'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
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
    case 'order_available':          return '📦'
    case 'order_preparing':          return '🍳'
    case 'order_accepted':           return '✅'
    case 'order_cancelled':          return '🚫'
    case 'driver_assigned':          return '🛵'
    case 'driver_heading_to_maker':  return '🛵'
    case 'arrived_at_maker':         return '📍'
    case 'order_picked_up':          return '📦'
    case 'order_on_the_way':         return '🚀'
    case 'arrived_at_customer':      return '🏠'
    case 'order_delivered':          return '🎉'
    case 'failed_delivery':          return '⚠️'
    case 'new_message':              return '💬'
    case 'earnings_updated':         return '💰'
    case 'withdrawal_approved':      return '✅'
    case 'withdrawal_rejected':      return '❌'
    case 'withdrawal_paid':          return '💰'
    case 'kyc_approved':             return '🪪'
    case 'kyc_rejected':             return '❌'
    default:                         return '🔔'
  }
}

function destinationFor(n: Notification): string | null {
  if (n.data?.order_id) return '/active'
  return null
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
        .select('id, title, body, type, read, created_at, data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      setNotifications((data as Notification[]) || [])
      setLoading(false)

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
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Notifications" showBack backHref="/" />

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[#1A1A1A] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <Bell size={56} className="text-zinc-700 mb-4" />
          <h3 className="text-xl font-bold text-white">All caught up</h3>
          <p className="text-zinc-500 text-sm mt-1">No notifications yet</p>
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {notifications.map((n) => {
            const dest = destinationFor(n)
            return (
              <button
                key={n.id}
                disabled={!dest}
                onClick={() => dest && router.push(dest)}
                className={`w-full text-left bg-[#111111] border rounded-2xl px-4 py-3 flex items-start gap-3 transition-colors
                  ${!n.read ? 'border-[#FF7A50]/40' : 'border-white/6'}
                  ${dest ? 'active:bg-white/5 cursor-pointer' : 'cursor-default'}
                `}
              >
                <span className="text-xl mt-0.5 flex-shrink-0">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white leading-snug">{n.title}</p>
                    <p className="text-[11px] text-zinc-600 flex-shrink-0 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{n.body}</p>
                </div>
                {!n.read && (
                  <span className="w-2 h-2 bg-[#FF7A50] rounded-full flex-shrink-0 mt-1.5" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * Unified notifications feed.
 *
 * Merges:
 *   1. System notifications from the `notifications` table (order events,
 *      KYC updates, withdrawals, etc.)
 *   2. Stream Chat channels the driver belongs to — surfaced as message
 *      previews so the driver doesn't need a separate "Messages" tab.
 *
 * 5-minute expiry: chat previews disappear from the feed 5 minutes after
 * the underlying order is marked `delivered`. The actual channel cleanup
 * happens server-side via the cron job; the client filter below keeps the
 * UX consistent even before the cron runs.
 */
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppHeader } from '@/components/layout/app-header'
import { createClient } from '@/lib/supabase/client'
import { getStreamClient, connectStreamUser } from '@/lib/stream'
import { useDriverStore } from '@/store/driver-store'

// Stream's channel data shape varies by version; cast through this minimal
// interface so we don't pull in their full types here.
type StreamChannel = {
  id?: string
  data?: { name?: string }
  lastMessage(): { text?: string; created_at?: string | Date } | undefined
  countUnread(): number
}

type NotifRow = {
  id: string
  title: string
  body: string
  type: string
  read: boolean
  created_at: string
  data: { order_id?: string; [key: string]: unknown }
}

type FeedItem =
  | {
      kind: 'notif'
      id: string
      title: string
      body: string
      type: string
      read: boolean
      timestamp: number
      orderId: string | null
    }
  | {
      kind: 'chat'
      id: string                      // channel id ("order-{uuid}")
      title: string
      body: string                    // last message preview
      unread: number
      timestamp: number               // last_message_at as ms
      orderId: string                 // for cross-reference with delivered_at filter
    }

const CHAT_EXPIRY_MS = 5 * 60 * 1000  // 5 minutes after delivery

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

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NotificationsPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const userEmail = useDriverStore((s) => s.userEmail)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { setLoading(false); router.push('/login'); return }

    const supabase = createClient()

    // ── 1. Load system notifications ──────────────────────────────────────
    const { data: notifData } = await supabase
      .from('notifications')
      .select('id, title, body, type, read, created_at, data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    const notifItems: FeedItem[] = ((notifData as NotifRow[]) ?? []).map((n) => ({
      kind: 'notif',
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      read: n.read,
      timestamp: new Date(n.created_at).getTime(),
      orderId: (n.data?.order_id as string | undefined) ?? null,
    }))

    // ── 2. Load Stream chat channels (best-effort) ────────────────────────
    type ChatItem = Extract<FeedItem, { kind: 'chat' }>
    let chatItems: ChatItem[] = []
    let orderIdsForExpiry: string[] = []
    try {
      const { data: profile } = await supabase
        .from('users').select('full_name, avatar_url').eq('id', userId).single()
      await connectStreamUser(
        userId,
        profile?.full_name ?? userEmail ?? 'Nexter',
        profile?.avatar_url ?? undefined,
      )
      const stream = getStreamClient()
      const channels = await stream.queryChannels(
        { members: { $in: [userId] }, type: 'messaging' },
        [{ last_message_at: -1 }],
        { limit: 30, watch: false, state: true },
      )
      const candidates = (channels as unknown as StreamChannel[])
        .map((ch) => {
          const channelId = ch.id ?? ''
          if (!channelId.startsWith('order-')) return null
          const orderId = channelId.replace(/^order-/, '')
          const last = ch.lastMessage()
          const ts = last?.created_at ? new Date(last.created_at as string | Date).getTime() : 0
          const rawName = (ch.data?.name as string | undefined)
          const title = rawName || `Order #${orderId.slice(-6).toUpperCase()}`
          return {
            kind: 'chat' as const,
            id: channelId,
            title,
            body: last?.text ?? 'No messages yet',
            unread: ch.countUnread(),
            timestamp: ts,
            orderId,
          }
        })
        .filter((x): x is Extract<FeedItem, { kind: 'chat' }> => x !== null)

      chatItems = candidates
      orderIdsForExpiry = candidates
        .map((c) => c.orderId)
        .filter((id): id is string => !!id)
    } catch {
      // Stream not configured / WS failure / network — chats just don't show.
      chatItems = []
    }

    // ── 3. 5-minute expiry filter on chat items ──────────────────────────
    if (chatItems.length > 0 && orderIdsForExpiry.length > 0) {
      const { data: deliveredRows } = await supabase
        .from('orders')
        .select('id, status, delivered_at, updated_at')
        .in('id', orderIdsForExpiry)
        .eq('status', 'delivered')

      // Build a Set of orderIds whose delivered_at is older than 5 min
      const expiredSet = new Set<string>()
      for (const r of deliveredRows ?? []) {
        const deliveredTs = r.delivered_at
          ? new Date(r.delivered_at).getTime()
          : new Date(r.updated_at).getTime()
        if (Date.now() - deliveredTs > CHAT_EXPIRY_MS) {
          expiredSet.add(r.id)
        }
      }
      chatItems = chatItems.filter((c) => !expiredSet.has(c.orderId))
    }

    // ── 4. Merge + sort by timestamp desc ────────────────────────────────
    const merged = [...notifItems, ...chatItems].sort((a, b) => b.timestamp - a.timestamp)
    setItems(merged)
    setLoading(false)

    // Mark all unread system notifs as read (chat unreads are managed by Stream)
    if (notifData && notifData.some((n) => !n.read)) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
    }
  }, [userId, userEmail, authReady, hasHydrated, router])

  useEffect(() => { load() }, [load])

  // ── Realtime refresh: new DB notification rows + Stream message events ──
  // Without this, the feed only updates on page mount. The driver could miss
  // a new dispatch alert or chat message while the screen is open.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    // 1. New notification rows for this user → reload feed
    const notifChannel = supabase
      .channel('notifications-feed-' + userId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { load() },
      )
      .subscribe()

    // 2. New Stream Chat messages → reload feed (the Stream client we already
    //    connected in load() emits `message.new` events globally).
    let unsubStream: (() => void) | null = null
    try {
      const stream = getStreamClient()
      const handler = stream.on('message.new', () => { load() })
      unsubStream = () => handler.unsubscribe()
    } catch {
      // Stream not connected — fine, just no chat realtime
    }

    return () => {
      supabase.removeChannel(notifChannel)
      if (unsubStream) unsubStream()
    }
  }, [userId, load])

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Notifications" showBack backHref="/" />

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[#1A1A1A] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <span className="text-5xl mb-4">🔔</span>
          <h3 className="text-xl font-bold text-white">All caught up</h3>
          <p className="text-zinc-500 text-sm mt-1">No notifications or messages yet</p>
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {items.map((it) => {
            if (it.kind === 'chat') {
              return (
                <button
                  key={it.id}
                  onClick={() => router.push(`/messages/${it.id}`)}
                  className={`w-full text-left bg-[#111111] border rounded-2xl px-4 py-3 flex items-start gap-3 transition-colors active:bg-white/5
                    ${it.unread > 0 ? 'border-[#FF7A50]/40' : 'border-white/6'}
                  `}
                >
                  <span className="text-xl mt-0.5 flex-shrink-0">💬</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-white leading-snug truncate">{it.title}</p>
                      <p className="text-[11px] text-zinc-600 flex-shrink-0 mt-0.5">
                        {it.timestamp > 0 ? timeAgo(it.timestamp) : ''}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">{it.body}</p>
                  </div>
                  {it.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-[#FF7A50] rounded-full text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      {it.unread > 9 ? '9+' : it.unread}
                    </span>
                  )}
                </button>
              )
            }

            // notif
            const dest = it.orderId ? '/active' : null
            return (
              <button
                key={it.id}
                disabled={!dest}
                onClick={() => dest && router.push(dest)}
                className={`w-full text-left bg-[#111111] border rounded-2xl px-4 py-3 flex items-start gap-3 transition-colors
                  ${!it.read ? 'border-[#FF7A50]/40' : 'border-white/6'}
                  ${dest ? 'active:bg-white/5 cursor-pointer' : 'cursor-default'}
                `}
              >
                <span className="text-xl mt-0.5 flex-shrink-0">{typeIcon(it.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white leading-snug">{it.title}</p>
                    <p className="text-[11px] text-zinc-600 flex-shrink-0 mt-0.5">{timeAgo(it.timestamp)}</p>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{it.body}</p>
                </div>
                {!it.read && (
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

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface LinkedOrder {
  id: string
  status: string
  total: number
  created_at: string
  food_maker: { display_name: string } | null
  order_items: { quantity: number; unit_price: number; menu_items: { name: string } | null }[]
}

interface Ticket {
  id: string
  subject: string
  message: string
  status: string
  priority: string
  created_at: string
  order_id: string | null
  users: { full_name: string; email: string } | null
  order: LinkedOrder | null
}

interface Message {
  id: string
  message: string
  is_internal: boolean
  created_at: string
  sender_id: string
  users: { full_name: string } | null
}

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent']

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-purple-100 text-purple-700',
  picked_up: 'bg-indigo-100 text-indigo-700',
  on_the_way: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [orderSearch, setOrderSearch] = useState('')
  const [searchResults, setSearchResults] = useState<LinkedOrder[]>([])
  const [searching, setSearching] = useState(false)
  const [linkingOrder, setLinkingOrder] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [ticketRes, msgsRes] = await Promise.all([
      fetch(`/api/admin/support/${id}`),
      fetch(`/api/admin/support/${id}/messages`),
    ])
    if (ticketRes.ok) setTicket((await ticketRes.json()).ticket)
    if (msgsRes.ok) setMessages((await msgsRes.json()).messages ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const updateStatus = async (status: string) => {
    await fetch(`/api/admin/support/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const sendReply = async () => {
    if (!reply.trim()) return
    setSending(true)
    await fetch(`/api/admin/support/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: reply.trim(), is_internal: isInternal }),
    })
    setReply('')
    setSending(false)
    load()
  }

  const searchOrders = async () => {
    if (!orderSearch.trim()) return
    setSearching(true)
    const res = await fetch(`/api/admin/orders?search=${encodeURIComponent(orderSearch)}`)
    if (res.ok) {
      const data = await res.json()
      setSearchResults((data.orders ?? []).slice(0, 5))
    }
    setSearching(false)
  }

  const linkOrder = async (orderId: string) => {
    setLinkingOrder(true)
    await fetch(`/api/admin/support/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    })
    setSearchResults([])
    setOrderSearch('')
    setLinkingOrder(false)
    load()
  }

  const unlinkOrder = async () => {
    await fetch(`/api/admin/support/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: null }),
    })
    load()
  }

  if (loading || !ticket) {
    return <div className="p-8"><div className="h-64 bg-gray-100 rounded-2xl animate-pulse" /></div>
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/operations/support" className="text-sm text-gray-400 hover:text-gray-600">← Support</Link>
        <span className="text-gray-200">/</span>
        <span className="font-semibold text-gray-900 truncate">{ticket.subject}</span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Thread */}
        <div className="col-span-2">
          {/* Original message */}
          <div className="bg-blue-50 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-900 text-sm">{ticket.users?.full_name ?? 'Customer'}</span>
              <span className="text-xs text-gray-400">{new Date(ticket.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-700">{ticket.message}</p>
          </div>

          {/* Replies */}
          <div className="space-y-3 mb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-2xl p-4 ${
                  msg.is_internal
                    ? 'bg-yellow-50 border border-yellow-100'
                    : 'bg-white border border-gray-100 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{msg.users?.full_name ?? 'Admin'}</span>
                    {msg.is_internal && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">
                        INTERNAL
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-700">{msg.message}</p>
              </div>
            ))}
          </div>
          <div ref={bottomRef} />

          {/* Reply box */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
              rows={3}
              className="w-full text-sm text-gray-900 resize-none outline-none placeholder-gray-400"
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded"
                />
                Internal note
              </label>
              <button
                onClick={sendReply}
                disabled={!reply.trim() || sending}
                className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {sending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Ticket controls */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4 text-sm">Ticket Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">Status</p>
                <select
                  value={ticket.status}
                  onChange={(e) => updateStatus(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Priority</p>
                <select
                  value={ticket.priority}
                  onChange={async (e) => {
                    await fetch(`/api/admin/support/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ priority: e.target.value }),
                    })
                    load()
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
                >
                  {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Customer</h3>
            <p className="font-medium text-gray-900">{ticket.users?.full_name ?? '—'}</p>
            <p className="text-xs text-gray-400">{ticket.users?.email ?? '—'}</p>
          </div>

          {/* Linked Order */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-sm">Linked Order</h3>
              {ticket.order && (
                <button
                  onClick={unlinkOrder}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Unlink
                </button>
              )}
            </div>

            {ticket.order ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Link
                    href={`/operations/orders/${ticket.order.id}`}
                    className="font-mono text-xs font-bold text-[#FF6B35] hover:underline"
                  >
                    #{ticket.order.id.slice(-8).toUpperCase()}
                  </Link>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    ORDER_STATUS_COLORS[ticket.order.status] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {ticket.order.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {ticket.order.food_maker?.display_name ?? '—'}
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {new Date(ticket.order.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
                {/* Order items summary */}
                <div className="space-y-1 border-t border-gray-50 pt-2 mt-2">
                  {ticket.order.order_items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate">{item.quantity}× {item.menu_items?.name}</span>
                      <span className="text-gray-500 ml-2 shrink-0">
                        ${(item.quantity * item.unit_price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {ticket.order.order_items.length > 4 && (
                    <p className="text-xs text-gray-400">+{ticket.order.order_items.length - 4} more items</p>
                  )}
                </div>
                <div className="border-t border-gray-50 pt-2 mt-2 flex justify-between">
                  <span className="text-xs text-gray-400">Total</span>
                  <span className="text-sm font-bold text-gray-900">${ticket.order.total.toFixed(2)}</span>
                </div>
                <Link
                  href={`/operations/orders/${ticket.order.id}`}
                  className="mt-3 block text-center text-xs font-semibold text-[#FF6B35] border border-orange-100 rounded-lg py-1.5 hover:bg-orange-50 transition-colors"
                >
                  View Full Order →
                </Link>
              </div>
            ) : (
              /* Order search / link */
              <div>
                <p className="text-xs text-gray-400 mb-3">No order linked to this ticket.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchOrders()}
                    placeholder="Search order ID…"
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                  />
                  <button
                    onClick={searchOrders}
                    disabled={searching || !orderSearch.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {searching ? '…' : 'Search'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {searchResults.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => linkOrder(order.id)}
                        disabled={linkingOrder}
                        className="w-full text-left p-2 rounded-lg border border-gray-100 hover:border-[#FF6B35] hover:bg-orange-50/50 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-gray-700">
                            #{order.id.slice(-8).toUpperCase()}
                          </span>
                          <span className="text-xs font-bold text-gray-900">${order.total.toFixed(2)}</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {order.food_maker?.display_name} · {order.status.replace(/_/g, ' ')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

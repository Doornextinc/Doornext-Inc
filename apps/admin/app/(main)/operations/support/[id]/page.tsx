'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Ticket {
  id: string
  subject: string
  message: string
  status: string
  priority: string
  created_at: string
  users: { full_name: string; email: string } | null
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

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
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
      body: JSON.stringify({ message: reply.trim(), is_internal: isInternal, sender_id: 'admin' }),
    })
    setReply('')
    setSending(false)
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

        {/* Ticket info sidebar */}
        <div className="space-y-4">
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Customer</h3>
            <p className="font-medium text-gray-900">{ticket.users?.full_name ?? '—'}</p>
            <p className="text-xs text-gray-400">{ticket.users?.email ?? '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

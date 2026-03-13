'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Ticket {
  id: string
  subject: string
  status: string
  priority: string
  created_at: string
  updated_at: string
  users: { full_name: string; email: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500',
  normal: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const STATUS_TABS = ['all', 'open', 'in_progress', 'resolved', 'closed']

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/support?status=${statusFilter}`)
    if (res.ok) {
      const data = await res.json()
      setTickets(data.tickets ?? [])
    }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Live Support</h1>
          <p className="text-gray-400 text-sm mt-1">Customer support tickets</p>
        </div>
        <span className="text-sm text-gray-400">{tickets.length} tickets</span>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/operations/support/${ticket.id}`}
              className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 truncate">{ticket.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ticket.users?.full_name ?? 'Unknown'} · {ticket.users?.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(ticket.updated_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-[#FF6B35] font-semibold mt-1">View →</p>
                </div>
              </div>
            </Link>
          ))}
          {tickets.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              No {statusFilter !== 'all' ? statusFilter : ''} tickets
            </div>
          )}
        </div>
      )}
    </div>
  )
}

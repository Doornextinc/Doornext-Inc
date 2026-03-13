'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

interface AdminUser {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  account_status: string
  created_at: string
}

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-gray-100 text-gray-600',
  maker: 'bg-orange-100 text-orange-700',
  driver: 'bg-blue-100 text-blue-700',
  admin: 'bg-red-100 text-red-700',
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-orange-100 text-orange-700',
  banned: 'bg-red-100 text-red-700',
}

const ALL_ROLES = ['customer', 'maker', 'driver', 'admin']
const ALL_STATUSES = ['all', 'approved', 'pending', 'suspended', 'banned']

export default function UsersPage() {
  const searchParams = useSearchParams()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ search })
    if (statusFilter !== 'all') params.set('account_status', statusFilter)
    const res = await fetch(`/api/admin/users?${params}`)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
    }
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => { loadUsers() }, [loadUsers])

  const changeRole = async (userId: string, newRole: string) => {
    if (!confirm(`Change this user's role to "${newRole}"?`)) return
    setUpdating(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    await loadUsers()
    setUpdating(null)
  }

  const changeStatus = async (userId: string, action: 'approve' | 'suspend' | 'ban') => {
    const labels = { approve: 'approve', suspend: 'suspend', ban: 'permanently ban' }
    if (!confirm(`Are you sure you want to ${labels[action]} this user?`)) return
    setUpdating(userId)
    await fetch(`/api/admin/users/${userId}/${action}`, { method: 'POST' })
    await loadUsers()
    setUpdating(null)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">All Users</h1>
        <span className="text-sm text-gray-400">{users.length} shown</span>
      </div>

      <div className="flex gap-3 mb-5">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors"
        />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Email</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Role</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{user.full_name}</td>
                  <td className="px-5 py-3 text-gray-500">{user.email ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {user.role}
                      </span>
                      <select
                        value={user.role}
                        disabled={updating === user.id}
                        onChange={(e) => changeRole(user.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-gray-400 disabled:opacity-50 cursor-pointer"
                      >
                        {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[user.account_status ?? 'approved'] ?? 'bg-gray-100 text-gray-600'}`}>
                      {user.account_status ?? 'approved'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-gray-400">
                    {new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {user.account_status !== 'approved' && (
                        <button
                          onClick={() => changeStatus(user.id, 'approve')}
                          disabled={updating === user.id}
                          className="text-xs font-semibold px-2 py-1 rounded-lg text-green-600 border border-green-200 hover:bg-green-50 disabled:opacity-50 transition-colors"
                        >
                          Approve
                        </button>
                      )}
                      {user.account_status !== 'suspended' && user.account_status !== 'banned' && (
                        <button
                          onClick={() => changeStatus(user.id, 'suspend')}
                          disabled={updating === user.id}
                          className="text-xs font-semibold px-2 py-1 rounded-lg text-orange-600 border border-orange-200 hover:bg-orange-50 disabled:opacity-50 transition-colors"
                        >
                          Suspend
                        </button>
                      )}
                      {user.account_status !== 'banned' && (
                        <button
                          onClick={() => changeStatus(user.id, 'ban')}
                          disabled={updating === user.id}
                          className="text-xs font-semibold px-2 py-1 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

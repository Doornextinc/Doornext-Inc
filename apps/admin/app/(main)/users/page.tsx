import { createAdminClient } from '@/lib/supabase/server'

export default async function UsersPage() {
  const supabase = createAdminClient()
  const { data: users, count } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Users</h1>
        <span className="text-sm text-gray-400">{count ?? 0} total</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Email</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Role</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Phone</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(users ?? []).map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">{user.full_name}</td>
                <td className="px-5 py-3 text-gray-500">{user.email ?? '—'}</td>
                <td className="px-5 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-5 py-3 text-gray-500">{user.phone ?? '—'}</td>
                <td className="px-5 py-3 text-right text-xs text-gray-400">
                  {new Date(user.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    customer: 'bg-gray-100 text-gray-600',
    maker: 'bg-orange-100 text-orange-700',
    driver: 'bg-blue-100 text-blue-700',
    admin: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role}
    </span>
  )
}

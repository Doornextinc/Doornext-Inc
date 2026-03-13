'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingBag, Users, UtensilsCrossed,
  Truck, Settings, LogOut,
} from 'lucide-react'

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/orders', icon: ShoppingBag, label: 'Orders' },
  { href: '/users', icon: Users, label: 'Users' },
  { href: '/makers', icon: UtensilsCrossed, label: 'Makers' },
  { href: '/drivers', icon: Truck, label: 'Drivers' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col min-h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
            <span className="text-white text-sm font-black">D</span>
          </div>
          <span className="font-black text-gray-900">Admin Hub</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orange-50 text-[#FF6B35]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={17} strokeWidth={isActive ? 2.5 : 2} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-gray-100">
        <form action="/api/admin/signout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 w-full"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  )
}

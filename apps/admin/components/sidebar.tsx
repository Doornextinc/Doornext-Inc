'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BarChart2, Users, Truck, Store,
  ShoppingBag, Headphones, ShieldCheck, Wallet,
  Zap, Tag, Layers, Award, DollarSign, Target,
  Settings, LogOut, Wrench,
} from 'lucide-react'
import { AdminLogo } from '@/components/ui/logo'

type NavItem = { href: string; icon: React.ElementType; label: string }
type NavGroup = { heading: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { href: '/',          icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/analytics', icon: BarChart2,        label: 'Analytics' },
    ],
  },
  {
    heading: 'Users',
    items: [
      { href: '/users',         icon: Users, label: 'All Users' },
      { href: '/users/drivers', icon: Truck, label: 'Drivers' },
      { href: '/users/sellers', icon: Store, label: 'Sellers' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/operations/orders',         icon: ShoppingBag,  label: 'Orders' },
      { href: '/operations/orders-support', icon: Wrench,       label: 'Order Support' },
      { href: '/operations/support',        icon: Headphones,   label: 'Live Support' },
      { href: '/operations/kyc',            icon: ShieldCheck,  label: 'KYC Review' },
      { href: '/operations/withdrawals',    icon: Wallet,       label: 'Withdrawals' },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { href: '/platform/surge-zones',        icon: Zap,         label: 'Surge Zones' },
      { href: '/platform/promo-codes',        icon: Tag,         label: 'Promo Codes' },
      { href: '/platform/price-tiers',        icon: Layers,      label: 'Price Tiers' },
      { href: '/platform/driver-performance', icon: Award,       label: 'Driver Performance' },
      { href: '/platform/missions',           icon: Target,      label: 'Driver Missions' },
      { href: '/platform/earnings',           icon: DollarSign,  label: 'Company Earnings' },
    ],
  },
  {
    heading: 'System',
    items: [
      { href: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

function isActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-white border-r border-gray-100 flex flex-col min-h-screen sticky top-0 shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <AdminLogo size={32} className="rounded-lg shadow-sm shrink-0" />
          <div>
            <span className="font-black text-gray-900 text-sm">Nexter</span>
            <p className="text-[10px] text-gray-400 -mt-0.5">Admin Hub</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV.map((group) => (
          <div key={group.heading}>
            <p className="px-3 mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {group.heading}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = isActive(href, pathname)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-orange-50 text-[#FF6B35]'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-gray-100">
        <form action="/api/admin/signout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  )
}

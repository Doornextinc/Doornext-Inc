'use client'

import { useRouter } from 'next/navigation'
import {
  User,
  MapPin,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Heart,
  Star,
  Settings,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'

const MOCK_USER = {
  name: 'Alex Johnson',
  email: 'alex@example.com',
  joined: 'March 2026',
  ordersCount: 24,
  favoritesCount: 8,
}

interface ProfileItemProps {
  icon: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
  danger?: boolean
}

function ProfileItem({ icon, label, value, onClick, danger }: ProfileItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${danger ? 'bg-red-50' : 'bg-gray-100'}`}>
        <div className={danger ? 'text-red-500' : 'text-gray-600'}>{icon}</div>
      </div>
      <div className="flex-1 text-left">
        <p className={`text-sm font-semibold ${danger ? 'text-red-500' : 'text-gray-800'}`}>
          {label}
        </p>
        {value && <p className="text-xs text-gray-400">{value}</p>}
      </div>
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  )
}

export default function ProfilePage() {
  const router = useRouter()

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <TopBar title="Profile" showCart={false} showNotifications={false} />

      {/* Profile Header */}
      <div className="bg-white px-4 py-6 mb-3">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
            <span className="text-white text-2xl font-black">
              {MOCK_USER.name[0]}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">{MOCK_USER.name}</h2>
            <p className="text-sm text-gray-400">{MOCK_USER.email}</p>
            <p className="text-xs text-gray-300 mt-0.5">Member since {MOCK_USER.joined}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-5">
          {[
            { label: 'Orders', value: MOCK_USER.ordersCount, icon: '📦' },
            { label: 'Favorites', value: MOCK_USER.favoritesCount, icon: '❤️' },
            { label: 'Reviews', value: 12, icon: '⭐' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
              <span className="text-xl">{icon}</span>
              <p className="font-black text-gray-900 text-lg leading-tight">{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Menu sections */}
      <div className="bg-white mb-3 divide-y divide-gray-50">
        <div className="px-4 py-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Account</p>
        </div>
        <ProfileItem
          icon={<User size={18} />}
          label="Personal Info"
          value={MOCK_USER.name}
        />
        <ProfileItem
          icon={<MapPin size={18} />}
          label="Saved Addresses"
          value="2 addresses"
        />
        <ProfileItem
          icon={<CreditCard size={18} />}
          label="Payment Methods"
          value="Visa ••••4242"
        />
      </div>

      <div className="bg-white mb-3 divide-y divide-gray-50">
        <div className="px-4 py-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Preferences</p>
        </div>
        <ProfileItem icon={<Heart size={18} />} label="Favorite Makers" value="8 saved" />
        <ProfileItem icon={<Star size={18} />} label="My Reviews" value="12 reviews" />
        <ProfileItem icon={<Bell size={18} />} label="Notifications" />
        <ProfileItem icon={<Settings size={18} />} label="App Settings" />
      </div>

      <div className="bg-white mb-3 divide-y divide-gray-50">
        <div className="px-4 py-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Support</p>
        </div>
        <ProfileItem icon={<HelpCircle size={18} />} label="Help & Support" />
        <ProfileItem
          icon={<LogOut size={18} />}
          label="Sign Out"
          danger
          onClick={() => {
            // Handle sign out
          }}
        />
      </div>

      <div className="px-4 py-6 text-center">
        <p className="text-xs text-gray-300">Doornext v1.0.0</p>
        <p className="text-xs text-gray-300 mt-0.5">© 2026 Doornext Inc.</p>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { ChefHat, TrendingUp, Clock, ShieldCheck, ChevronRight } from 'lucide-react'
import { MakerLogo } from '@/components/ui/logo'

const BENEFITS = [
  {
    icon: TrendingUp,
    title: 'Keep More Revenue',
    desc: 'Low platform fees mean you take home more from every order.',
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    icon: Clock,
    title: 'Your Hours, Your Rules',
    desc: 'Open and close your kitchen whenever you want. No minimum hours.',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    icon: ChefHat,
    title: 'Cook What You Love',
    desc: 'No menus to follow. Sell your specialties to a hungry local audience.',
    color: 'text-[#FF6B35]',
    bg: 'bg-orange-50',
  },
  {
    icon: ShieldCheck,
    title: 'We Handle Delivery',
    desc: 'Doornext drivers pick up and deliver. You just cook and get paid.',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
]

export default function MakerWelcomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left panel — hero */}
      <div className="lg:flex-1 flex flex-col justify-center px-8 py-16 lg:px-16 bg-gradient-to-br from-orange-50 to-white">
        <div className="max-w-lg mx-auto lg:mx-0">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <MakerLogo size={40} className="rounded-xl shadow-sm" />
            <span className="text-gray-900 font-black text-xl tracking-tight">Doornext <span className="text-[#FF6B35]">for Makers</span></span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-gray-900 leading-tight mb-4">
            Turn your kitchen<br />
            <span className="text-[#FF6B35]">into a business.</span>
          </h1>
          <p className="text-gray-500 text-lg mb-10 leading-relaxed">
            Sell your homemade food to customers in your area. Set your own prices, your own hours, your own menu.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 bg-[#FF6B35] hover:bg-[#E55A24] text-white font-bold py-4 px-8 rounded-2xl transition-colors text-base shadow-lg shadow-[#FF6B35]/25"
            >
              Apply to Sell
              <ChevronRight size={18} />
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-semibold py-4 px-8 rounded-2xl transition-colors text-base"
            >
              Sign In
            </Link>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            Join hundreds of home chefs already earning on Doornext.
          </p>
        </div>
      </div>

      {/* Right panel — benefits */}
      <div className="lg:w-[480px] border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col justify-center px-8 py-12 lg:px-12 bg-white">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">Why makers love us</h2>
        <div className="space-y-6">
          {BENEFITS.map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="flex gap-4">
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={color} />
              </div>
              <div>
                <p className="font-bold text-gray-900 mb-1">{title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 p-4 bg-orange-50 rounded-2xl border border-orange-100">
          <p className="text-sm text-gray-700 font-semibold mb-1">🍽️ Already a maker?</p>
          <p className="text-xs text-gray-500">
            <Link href="/login" className="text-[#FF6B35] font-semibold hover:underline">Sign in here</Link> to manage your kitchen dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}

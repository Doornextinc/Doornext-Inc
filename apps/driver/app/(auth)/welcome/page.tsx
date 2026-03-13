'use client'

import Link from 'next/link'
import { MapPin, Clock, DollarSign, Star, ChevronRight } from 'lucide-react'

const BENEFITS = [
  {
    icon: Clock,
    title: 'Flexible Hours',
    desc: 'Work whenever you want — morning, evening, or weekends. You set the schedule.',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
  },
  {
    icon: DollarSign,
    title: 'Fast Payouts',
    desc: 'Earnings deposited weekly. Every delivery fee goes straight to you.',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
  },
  {
    icon: MapPin,
    title: 'Local Pickups',
    desc: 'Deliver from home chefs and small kitchens right in your neighborhood.',
    color: 'text-[#FF6B35]',
    bg: 'bg-[#FF6B35]/10',
  },
  {
    icon: Star,
    title: 'Build Your Reputation',
    desc: 'Top-rated drivers earn more. Great service = more orders.',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
  },
]

export default function DriverWelcomePage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col lg:flex-row">
      {/* Left panel — hero */}
      <div className="lg:flex-1 flex flex-col justify-center px-8 py-16 lg:px-16">
        <div className="max-w-lg mx-auto lg:mx-0">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center">
              <span className="text-white text-xl">🛵</span>
            </div>
            <span className="text-white font-black text-xl tracking-tight">Doornext</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight mb-4">
            Deliver on<br />
            <span className="text-[#FF6B35]">your terms.</span>
          </h1>
          <p className="text-slate-400 text-lg mb-10">
            Join Doornext drivers and earn by delivering homemade meals from local chefs to customers nearby.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 bg-[#FF6B35] hover:bg-[#E55A24] text-white font-bold py-4 px-8 rounded-2xl transition-colors text-base"
            >
              Get Started
              <ChevronRight size={18} />
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold py-4 px-8 rounded-2xl transition-colors text-base"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Right panel — benefits */}
      <div className="lg:w-[480px] bg-slate-800/50 border-t lg:border-t-0 lg:border-l border-slate-700/50 flex flex-col justify-center px-8 py-12 lg:px-12">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Why drive with us</h2>
        <div className="space-y-6">
          {BENEFITS.map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="flex gap-4">
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={color} />
              </div>
              <div>
                <p className="font-bold text-white mb-1">{title}</p>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 mt-10">
          By continuing you agree to Doornext's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}

import Link from 'next/link'
import Image from 'next/image'
import { Star, Clock, MapPin } from 'lucide-react'
import { cn, formatDistance, formatTime } from '@/lib/utils'
import type { FoodMaker } from '@/types'

interface MakerCardProps {
  maker: FoodMaker
  className?: string
}

export function MakerCard({ maker, className }: MakerCardProps) {
  return (
    <Link href={`/maker/${maker.id}`} className={cn('block', className)}>
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.98] transition-transform">
        {/* Banner */}
        <div className="relative w-full h-44 bg-gradient-to-br from-orange-100 to-amber-50 overflow-hidden">
          {maker.banner_url ? (
            <Image
              src={maker.banner_url}
              alt={maker.display_name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-5xl">🍲</span>
            </div>
          )}
          {/* Open/Closed badge */}
          <div
            className={cn(
              'absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold',
              maker.is_open
                ? 'bg-green-500 text-white'
                : 'bg-gray-800/70 text-white'
            )}
          >
            {maker.is_open ? 'Open' : 'Closed'}
          </div>
          {/* Avatar */}
          <div className="absolute -bottom-5 left-3 w-12 h-12 rounded-xl border-2 border-white bg-white overflow-hidden shadow-md">
            {maker.avatar_url ? (
              <Image
                src={maker.avatar_url}
                alt={maker.display_name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#FF6B35] flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {maker.display_name[0]}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="pt-8 px-3 pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-base truncate">
                {maker.display_name}
              </h3>
              <div className="flex flex-wrap gap-1 mt-1">
                {maker.cuisine_tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2.5 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Star size={13} className="text-yellow-400 fill-yellow-400" />
              <span className="font-semibold text-gray-700">{maker.avg_rating.toFixed(1)}</span>
              <span className="text-xs">({maker.total_reviews})</span>
            </div>
            <span className="text-gray-300">•</span>
            <div className="flex items-center gap-1">
              <Clock size={13} />
              <span>{formatTime(maker.prep_time_mins)}</span>
            </div>
            {maker.distance_km !== undefined && (
              <>
                <span className="text-gray-300">•</span>
                <div className="flex items-center gap-1">
                  <MapPin size={13} />
                  <span>{formatDistance(maker.distance_km)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

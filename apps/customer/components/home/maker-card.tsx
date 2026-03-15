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
      <div className="bg-white rounded-2xl overflow-hidden card card-interactive">
        {/* Banner */}
        <div className="relative w-full h-44 bg-gradient-to-br from-orange-100 to-amber-50 overflow-hidden">
          {maker.banner_url ? (
            <Image
              src={maker.banner_url}
              alt={maker.display_name}
              fill
              className="object-cover"
              sizes="(max-width: 430px) 100vw, 430px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-5xl">🍲</span>
            </div>
          )}

          {/* Open / Closed pill */}
          <div
            className={cn(
              'absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1',
              maker.is_open
                ? 'bg-green-500 text-white'
                : 'bg-black/60 text-white backdrop-blur-sm'
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', maker.is_open ? 'bg-white' : 'bg-gray-400')} />
            {maker.is_open ? 'Open' : 'Closed'}
          </div>

          {/* Avatar — overlaps banner bottom */}
          <div className="absolute -bottom-5 left-4 w-12 h-12 rounded-2xl border-2 border-white bg-white overflow-hidden shadow-md">
            {maker.avatar_url ? (
              <Image
                src={maker.avatar_url}
                alt={maker.display_name}
                fill
                className="object-cover"
                sizes="48px"
              />
            ) : (
              <div className="w-full h-full bg-[#FF6B35] flex items-center justify-center">
                <span className="text-white font-black text-sm">
                  {maker.display_name[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="pt-8 px-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-[15px] leading-tight truncate">
                {maker.display_name}
              </h3>
              <div className="flex flex-wrap gap-1 mt-1.5">
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

          <div className="flex items-center gap-3 mt-3 text-sm">
            <div className="flex items-center gap-1">
              <Star size={13} className="text-yellow-400 fill-yellow-400" />
              <span className="font-bold text-gray-900 text-xs">{maker.avg_rating.toFixed(1)}</span>
              <span className="text-gray-400 text-xs">({maker.total_reviews})</span>
            </div>
            <span className="text-gray-200">·</span>
            <div className="flex items-center gap-1 text-gray-500 text-xs">
              <Clock size={12} strokeWidth={2} />
              <span>{formatTime(maker.prep_time_mins)}</span>
            </div>
            {maker.distance_km !== undefined && (
              <>
                <span className="text-gray-200">·</span>
                <div className="flex items-center gap-1 text-gray-500 text-xs">
                  <MapPin size={12} strokeWidth={2} />
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

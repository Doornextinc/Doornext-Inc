'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  rating: number
  max?: number
  size?: number
  interactive?: boolean
  onChange?: (rating: number) => void
  className?: string
}

export function StarRating({
  rating,
  max = 5,
  size = 16,
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(i + 1)}
          className={interactive ? 'active:scale-110 transition-transform' : 'cursor-default'}
        >
          <Star
            size={size}
            className={cn(
              i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'
            )}
          />
        </button>
      ))}
    </div>
  )
}

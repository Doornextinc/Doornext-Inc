'use client'

import { cn, CUISINE_TAGS } from '@/lib/utils'

interface CuisineFilterProps {
  selected: string
  onChange: (tag: string) => void
}

export function CuisineFilter({ selected, onChange }: CuisineFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
      {CUISINE_TAGS.map((tag) => (
        <button
          key={tag}
          onClick={() => onChange(tag)}
          className={cn(
            'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95',
            selected === tag
              ? 'bg-[#FF6B35] text-white shadow-sm shadow-orange-200'
              : 'bg-gray-100 text-gray-600'
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}

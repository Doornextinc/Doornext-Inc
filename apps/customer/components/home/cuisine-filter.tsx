'use client'

import { cn, CUISINE_TAGS } from '@/lib/utils'

const CUISINE_EMOJIS: Record<string, string> = {
  All:          '✨',
  Nigerian:     '🇳🇬',
  Mexican:      '🌮',
  Indian:       '🍛',
  Chinese:      '🥡',
  Caribbean:    '🏝️',
  'Soul Food':  '🍗',
  Thai:         '🍜',
  Italian:      '🍝',
  Halal:        '☪️',
  Vegan:        '🌱',
  'Gluten-Free':'🌾',
}

interface CuisineFilterProps {
  selected: string
  onChange: (tag: string) => void
}

export function CuisineFilter({ selected, onChange }: CuisineFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
      {CUISINE_TAGS.map((tag) => {
        const isActive = selected === tag
        return (
          <button
            key={tag}
            onClick={() => onChange(tag)}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-all active:scale-95',
              isActive
                ? 'bg-[#FF6B35] text-white shadow-sm shadow-orange-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-150'
            )}
          >
            <span className="text-sm leading-none">{CUISINE_EMOJIS[tag] ?? '🍽️'}</span>
            {tag}
          </button>
        )
      })}
    </div>
  )
}

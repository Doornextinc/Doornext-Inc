import { cn, DIETARY_TAG_COLORS } from '@doornext/shared/utils'

interface BadgeProps {
  label: string
  className?: string
}

export function DietaryBadge({ label, className }: BadgeProps) {
  const color = DIETARY_TAG_COLORS[label.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        color,
        className
      )}
    >
      {label}
    </span>
  )
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    preparing: 'bg-orange-100 text-orange-700',
    ready: 'bg-purple-100 text-purple-700',
    picked_up: 'bg-indigo-100 text-indigo-700',
    on_the_way: 'bg-cyan-100 text-cyan-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }
  const label = status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
        colors[status] ?? 'bg-gray-100 text-gray-600',
        className
      )}
    >
      {label}
    </span>
  )
}

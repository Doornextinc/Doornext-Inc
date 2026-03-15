import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} />
}

export function MakerCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100" style={{ boxShadow: 'var(--shadow-card)' }}>
      <Skeleton className="w-full h-44 rounded-none" />
      <div className="pt-8 px-4 pb-4 space-y-3">
        <Skeleton className="h-4 w-3/5" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  )
}

export function MenuItemSkeleton() {
  return (
    <div className="flex gap-4 px-4 py-4 border-b border-gray-50 bg-white">
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="w-24 h-24 rounded-2xl flex-shrink-0" />
    </div>
  )
}

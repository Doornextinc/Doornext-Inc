import { cn } from '@doornext/shared/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse bg-gray-200 rounded', className)} />
}

export function MakerCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <Skeleton className="w-full h-40" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </div>
  )
}

export function MenuItemSkeleton() {
  return (
    <div className="flex gap-3 p-4 border-b border-gray-100">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="w-20 h-20 rounded-xl flex-shrink-0" />
    </div>
  )
}

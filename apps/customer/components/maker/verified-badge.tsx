import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * VerifiedBadge — corporate-grade trust signal for Maker surfaces.
 *
 * Doornext's core differentiator vs corporate-restaurant delivery is that
 * Makers are vetted home cooks. KYC + approval is the foundation of that
 * trust, but it has historically been INVISIBLE to customers. This badge
 * surfaces it on every Maker card and the detail page.
 *
 * Two sizes:
 *   - `sm` (default): inline pill for cards / lists
 *   - `lg`: standalone block for the Maker detail "Trusted by Doornext" panel
 */
export function VerifiedBadge({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'lg'
  className?: string
}) {
  if (size === 'lg') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-1.5',
          className,
        )}
      >
        <ShieldCheck size={16} className="text-emerald-600" strokeWidth={2.5} />
        <span className="text-xs font-bold text-emerald-700">Verified by Doornext</span>
      </div>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-1.5 py-0.5',
        className,
      )}
      title="Verified by Doornext — KYC complete"
    >
      <ShieldCheck size={11} className="text-emerald-600" strokeWidth={2.5} />
      <span className="text-[10px] font-bold text-emerald-700 leading-none">Verified</span>
    </span>
  )
}

'use client'

import Link from 'next/link'
import type { ReactNode, ElementType } from 'react'
import { ChevronRight, Check } from 'lucide-react'

/**
 * Neighborly Modern component kit (light theme).
 *
 * Shared building blocks for the redesigned Nexter screens, mapped from the
 * Stitch design kit. Warm cream surfaces, rounded-xl cards, pill buttons,
 * JetBrains Mono for numbers/labels. Replaces the dark `ui/list.tsx` as
 * screens are converted.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Scaffolding
// ─────────────────────────────────────────────────────────────────────────────

/** Page shell: cream background, on-background text, room for the bottom nav. */
export function Screen({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-on-background pb-28">{children}</div>
}

/** Section heading (Anybody display face). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl font-bold text-on-surface px-1 mb-3">{children}</h2>
}

/** White surface card with a soft warm border. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`bg-surface-container-lowest rounded-xl border border-outline-variant/30 ${className}`}>
      {children}
    </div>
  )
}

/** Monospace stat tile — label over a ledger-style figure. */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container p-4 rounded-xl">
      <p className="text-on-surface-variant text-xs font-semibold mb-1 uppercase tracking-wide">{label}</p>
      <p className="font-mono text-xl text-primary">{value}</p>
    </div>
  )
}

/** Monospace pill chip, e.g. a status or category label. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'primary' | 'error'
}) {
  const tones = {
    neutral: 'bg-surface-variant text-on-surface-variant',
    green: 'bg-neighborhood-green/10 text-neighborhood-green',
    primary: 'bg-primary-fixed text-on-primary-fixed-variant',
    error: 'bg-error-container text-on-error-container',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[12px] tracking-wide px-3 py-1 rounded-full ${tones[tone]}`}>
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

/** A grouped list card. Children are ListRow / RadioRow, divided by hairlines. */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/20 overflow-hidden">
      {children}
    </div>
  )
}

type RowProps = {
  icon?: ElementType
  label: string
  sublabel?: string
  right?: ReactNode
  href?: string
  onClick?: () => void
  destructive?: boolean
  hideChevron?: boolean
}

/** One list row: Link when `href`, button when `onClick`, else inert. */
export function ListRow({
  icon: Icon,
  label,
  sublabel,
  right,
  href,
  onClick,
  destructive = false,
  hideChevron = false,
}: RowProps) {
  const navigates = Boolean(href || onClick)
  const showChevron = right === undefined && navigates && !hideChevron

  const inner = (
    <span className="w-full flex items-center gap-3 p-4 active:bg-surface-container-low transition-colors">
      {Icon && (
        <Icon
          size={22}
          strokeWidth={1.75}
          className={destructive ? 'text-error' : 'text-on-surface-variant'}
        />
      )}
      <span className="flex-1 min-w-0 text-left">
        <span className={`block text-[16px] ${destructive ? 'text-error font-semibold' : 'text-on-surface'}`}>
          {label}
        </span>
        {sublabel && <span className="block text-[13px] text-on-surface-variant mt-0.5 truncate">{sublabel}</span>}
      </span>
      {right !== undefined && right}
      {showChevron && <ChevronRight size={20} className="text-on-surface-variant flex-shrink-0" />}
    </span>
  )

  if (href) return <Link href={href} className="block w-full">{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{inner}</button>
  return <div className="block w-full">{inner}</div>
}

/** Read-only label/value pair for profile-style fields. */
export function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="p-4">
      <p className="text-[13px] text-on-surface-variant uppercase tracking-wide font-semibold">{label}</p>
      <p className={`text-[16px] mt-1 break-words ${value ? 'text-on-surface' : 'text-outline'}`}>{value || '—'}</p>
    </div>
  )
}

/** Single-select row with trailing check. */
export function RadioRow({
  label,
  sublabel,
  selected,
  onSelect,
}: {
  label: string
  sublabel?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="block w-full text-left active:bg-surface-container-low transition-colors"
    >
      <span className="w-full flex items-center gap-3 p-4">
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] text-on-surface">{label}</span>
          {sublabel && <span className="block text-[13px] text-on-surface-variant mt-0.5">{sublabel}</span>}
        </span>
        {selected && <Check size={20} className="text-primary flex-shrink-0" />}
      </span>
    </button>
  )
}

/**
 * Pill toggle. `green` variant reads as an "active/online" affirmative
 * (matches the reference's Active Shift switch); default is primary orange.
 */
export function Toggle({
  value,
  onChange,
  label,
  tone = 'primary',
}: {
  value: boolean
  onChange: (v: boolean) => void
  label?: string
  tone?: 'primary' | 'green'
}) {
  const onColor = tone === 'green' ? 'bg-neighborhood-green' : 'bg-primary'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
        value ? onColor : 'bg-secondary-container'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/** Pill button. primary = orange, secondary = deep black, danger = tonal error. */
export function PillButton({
  children,
  onClick,
  href,
  disabled,
  variant = 'primary',
  icon: Icon,
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  icon?: ElementType
}) {
  const variants = {
    primary: 'bg-primary-container text-on-primary',
    secondary: 'bg-inverse-surface text-inverse-on-surface',
    danger: 'bg-surface-container-highest text-error active:bg-error/10',
  }
  const cls = `w-full flex items-center justify-center gap-2 rounded-full text-[16px] font-semibold py-4 transition-transform active:scale-[0.98] disabled:opacity-50 ${variants[variant]}`

  const content = (
    <>
      {Icon && <Icon size={18} />}
      {children}
    </>
  )

  if (href) return <Link href={href} className={cls}>{content}</Link>
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{content}</button>
}

/** Segmented filter control (period selectors, etc.). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 bg-surface-container p-1 rounded-full">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`flex-1 py-2 rounded-full text-[13px] font-semibold transition-colors ${
            value === opt.value ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

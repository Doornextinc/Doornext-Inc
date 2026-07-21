'use client'

import Link from 'next/link'
import type { ReactNode, ElementType } from 'react'
import { ChevronRight, Check } from 'lucide-react'

/**
 * Shared list primitives for the driver app.
 *
 * Every settings-style screen (Account, Profile, App Settings, Vehicle …)
 * is built from these so the whole app reads as one surface: flat #080808
 * background, hairline dividers inset past the icon column, 17px row labels.
 *
 * Previously `SettingRow` / `Toggle` / `SectionLabel` were defined twice —
 * once in profile/page.tsx and once in settings/page.tsx — and had drifted
 * apart. These replace both.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Screen scaffolding
// ─────────────────────────────────────────────────────────────────────────────

/** Large screen title, e.g. the "Account" heading. */
export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[34px] leading-tight font-black text-white tracking-tight px-5 pt-6 pb-5">
      {children}
    </h1>
  )
}

/** Section heading inside a screen, e.g. "Personal information". */
export function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[22px] font-black text-white tracking-tight px-5 pt-7 pb-3">
      {children}
    </h2>
  )
}

/**
 * A group of rows. Renders a top and bottom hairline so a group reads as a
 * block against the flat background, matching the grouped sections in the
 * App Settings screen.
 */
export function ListGroup({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <section>
      {title && <GroupTitle>{title}</GroupTitle>}
      <div className="border-t border-white/8">{children}</div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

type RowProps = {
  icon?: ElementType
  label: string
  sublabel?: string
  /** Replaces the trailing chevron when provided. */
  right?: ReactNode
  href?: string
  onClick?: () => void
  destructive?: boolean
  /** Hide the trailing chevron on a non-navigating row. */
  hideChevron?: boolean
}

/**
 * One list row. Renders as a Link when `href` is set, a button when
 * `onClick` is set, and an inert div otherwise.
 */
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
    <span className="w-full flex items-center gap-4 pl-5 pr-4 py-4 active:bg-white/5 transition-colors">
      {Icon && (
        <Icon
          size={24}
          strokeWidth={1.75}
          className={`flex-shrink-0 ${destructive ? 'text-red-400' : 'text-white'}`}
        />
      )}
      <span className="flex-1 min-w-0 text-left">
        <span className={`block text-[17px] leading-snug ${destructive ? 'text-red-400' : 'text-white'}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-[13px] text-zinc-500 mt-0.5 truncate">{sublabel}</span>
        )}
      </span>
      {right !== undefined && right}
      {showChevron && <ChevronRight size={20} className="text-zinc-500 flex-shrink-0" />}
    </span>
  )

  // Divider is drawn on the row itself so groups don't need separator markup.
  const shell = 'block w-full border-b border-white/8'

  if (href) return <Link href={href} className={shell}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={`${shell} text-left`}>{inner}</button>
  return <div className={shell}>{inner}</div>
}

/**
 * Read-only label/value pair, used on the Profile screen where fields are
 * displayed rather than edited.
 */
export function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="px-5 py-3">
      <p className="text-[13px] text-zinc-500">{label}</p>
      {value ? (
        <p className="text-[17px] text-white mt-1 break-words">{value}</p>
      ) : (
        <p className="text-[17px] text-zinc-600 mt-1">—</p>
      )}
    </div>
  )
}

/** Single-select row with a trailing check, e.g. App Language. */
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
      className="block w-full text-left border-b border-white/8 active:bg-white/5 transition-colors"
    >
      <span className="w-full flex items-center gap-4 pl-5 pr-4 py-4">
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] text-white leading-snug">{label}</span>
          {sublabel && <span className="block text-[13px] text-zinc-500 mt-0.5">{sublabel}</span>}
        </span>
        {selected && <Check size={20} className="text-[#FF7A50] flex-shrink-0" />}
      </span>
    </button>
  )
}

/** Pill toggle. Matches the accent used across the driver app. */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        value ? 'bg-[#FF7A50]' : 'bg-[#2A2A2A]'
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

/** Full-width primary action, e.g. "Edit profile". */
export function PrimaryButton({
  children,
  onClick,
  href,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  disabled?: boolean
}) {
  const cls =
    'block w-full text-center rounded-full bg-[#FF7A50] text-white text-[17px] font-bold py-4 active:scale-[0.98] transition-transform disabled:opacity-50'

  if (href) return <Link href={href} className={cls}>{children}</Link>
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  )
}

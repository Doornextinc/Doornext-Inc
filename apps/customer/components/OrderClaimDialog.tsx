'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Loader2, Package, RefreshCw, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface ClaimItem {
  id: string
  quantity: number
  unit_price: number
  name: string
}

interface OrderClaimDialogProps {
  orderId: string
  customerId: string
  items: ClaimItem[]
  onClose: () => void
  onClaimCreated: () => void
  /** Maker display name for personalising the success message. */
  makerName?: string | null
}

const ISSUE_REASONS = [
  { id: 'missing',  label: 'Missing item',  emoji: '📭' },
  { id: 'wrong',    label: 'Wrong item',    emoji: '🔄' },
  { id: 'damaged',  label: 'Damaged',       emoji: '💔' },
  { id: 'quality',  label: 'Poor quality',  emoji: '😞' },
  { id: 'cold',     label: 'Not fresh',     emoji: '🥶' },
  { id: 'other',    label: 'Other',         emoji: '💬' },
]

export function OrderClaimDialog({ orderId, customerId, items, onClose, onClaimCreated, makerName }: OrderClaimDialogProps) {
  const [claimType, setClaimType]           = useState<'refund' | 'replacement'>('refund')
  const [selectedItems, setSelectedItems]   = useState<Set<string>>(new Set())
  const [selectedIssue, setSelectedIssue]   = useState<string | null>(null)
  const [details, setDetails]               = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [success, setSuccess]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setError(null)
  }

  const toggleAll = () => {
    setSelectedItems(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(i => i.id))
    )
  }

  const buildReason = () => {
    const parts: string[] = []
    const issueLabel = ISSUE_REASONS.find(r => r.id === selectedIssue)?.label
    if (issueLabel) parts.push(`Issue: ${issueLabel}`)
    const affected = items.filter(i => selectedItems.has(i.id))
    if (affected.length === items.length) {
      parts.push('Items: All items')
    } else {
      parts.push(`Items: ${affected.map(i => `${i.name} (x${i.quantity})`).join(', ')}`)
    }
    if (details.trim()) parts.push(details.trim())
    return parts.join(' — ')
  }

  const handleSubmit = async () => {
    if (!selectedIssue) { setError('Please select an issue type'); return }
    if (selectedItems.size === 0) { setError('Please select at least one item'); return }

    setSubmitting(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: dbError } = await supabase.from('order_claims').insert({
        order_id:    orderId,
        customer_id: customerId,
        type:        claimType,
        reason:      buildReason(),
      })
      if (dbError) throw dbError
      setSuccess(true)
      setTimeout(() => {
        onClaimCreated()
        onClose()
      }, 2000)
    } catch (e) {
      console.error('Claim submission failed:', e)
      setError('Unable to submit claim. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />

        {success ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle size={40} className="text-green-500" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Claim Submitted!</h2>
            <p className="text-sm text-gray-500 text-center">
              {makerName?.trim()
                ? `${makerName} will review your claim shortly. Need immediate help? Message them from the order page.`
                : 'Your Maker will review your claim shortly. Need immediate help? Message them from the order page.'}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-black text-gray-900 mb-1">Report an issue</h2>
            <p className="text-sm text-gray-500 mb-6">Select the affected items and describe the problem.</p>

            {/* Claim type */}
            <div className="mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Request type</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'refund',      label: 'Refund',      Icon: Undo2 },
                  { value: 'replacement', label: 'Replacement',  Icon: RefreshCw },
                ] as const).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => setClaimType(value)}
                    className={cn(
                      'flex flex-col items-center gap-2 py-4 rounded-2xl border-2 font-semibold text-sm transition-all',
                      claimType === value
                        ? 'border-[#FF6B35] bg-orange-50 text-[#FF6B35]'
                        : 'border-gray-200 text-gray-500'
                    )}
                  >
                    <Icon size={20} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Item selection */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Affected items</p>
                {items.length > 1 && (
                  <button onClick={toggleAll} className="text-xs font-semibold text-[#FF6B35]">
                    {selectedItems.size === items.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {items.map(item => {
                  const selected = selectedItems.has(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all',
                        selected ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-100'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                        selected ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300'
                      )}>
                        {selected && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">
                        <Package size={16} className="text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity} · ${(item.unit_price * item.quantity).toFixed(2)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Issue type */}
            <div className="mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">What&apos;s the issue?</p>
              <div className="flex flex-wrap gap-2">
                {ISSUE_REASONS.map(issue => (
                  <button
                    key={issue.id}
                    onClick={() => { setSelectedIssue(issue.id); setError(null) }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                      selectedIssue === issue.id
                        ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    )}
                  >
                    {issue.emoji} {issue.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Additional details <span className="normal-case font-normal">(optional)</span></p>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Describe the issue in more detail..."
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-[#FF6B35] focus:outline-none transition-all"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">
                <AlertCircle size={16} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-4 rounded-2xl bg-[#FF6B35] text-white font-black text-sm disabled:opacity-60 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                  : 'Submit Claim'
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

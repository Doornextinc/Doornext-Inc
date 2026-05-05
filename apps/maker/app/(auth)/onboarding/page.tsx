'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRight, ChevronLeft, Upload, CheckCircle2, Loader2,
  User, Building2, Briefcase, Users,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type BusinessType = 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'

interface BusinessForm {
  business_type: BusinessType | null
  legal_name: string
  dba_name: string
  ein: string
  ssn_last4: string
  business_phone: string
  business_address: string
}

interface UploadedDocs {
  identity_front: boolean
  identity_back: boolean
  business_doc: boolean
  food_permit: boolean
}

// ─── Business type options ────────────────────────────────────────────────────

const BUSINESS_TYPES: { type: BusinessType; icon: React.ElementType; title: string; description: string }[] = [
  {
    type: 'sole_proprietor',
    icon: User,
    title: 'Sole Proprietorship',
    description: 'You operate as an individual — no separate legal entity. Most home cooks start here.',
  },
  {
    type: 'llc',
    icon: Building2,
    title: 'LLC',
    description: 'Limited Liability Company — personal asset protection with flexible tax treatment.',
  },
  {
    type: 'corporation',
    icon: Briefcase,
    title: 'Corporation',
    description: 'S-Corp or C-Corp — separate legal entity with shareholders and formal governance.',
  },
  {
    type: 'partnership',
    icon: Users,
    title: 'Partnership',
    description: 'Two or more co-owners operating together under a shared business name.',
  },
]

// ─── Document slot config ────────────────────────────────────────────────────

type DocSlot = 'identity_front' | 'identity_back' | 'business_doc' | 'food_permit'

interface DocConfig {
  slot: DocSlot
  label: string
  hint: string
  required: (type: BusinessType) => boolean
}

const DOC_CONFIGS: DocConfig[] = [
  {
    slot: 'identity_front',
    label: 'Government-issued ID — Front',
    hint: "Driver's license, state ID, or passport photo page",
    required: () => true,
  },
  {
    slot: 'identity_back',
    label: "Government-issued ID — Back",
    hint: "Back of driver's license or state ID (not needed for passport)",
    required: () => false,
  },
  {
    slot: 'business_doc',
    label: 'Business Formation Document',
    hint: 'Articles of Organization/Incorporation, EIN confirmation letter, or partnership agreement',
    required: (t) => t !== 'sole_proprietor',
  },
  {
    slot: 'food_permit',
    label: 'Food Handler\'s Permit (optional)',
    hint: 'Local health permit or food handler\'s license if you have one',
    required: () => false,
  },
]

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < step ? 'w-6 bg-[#FF6B35]' : i === step ? 'w-6 bg-[#FF6B35]' : 'w-3 bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

// ─── File upload button ──────────────────────────────────────────────────────

function DocUpload({
  slot,
  label,
  hint,
  required,
  uploaded,
  onUpload,
}: {
  slot: DocSlot
  label: string
  hint: string
  required: boolean
  uploaded: boolean
  onUpload: (slot: DocSlot, file: File) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await onUpload(slot, file)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`rounded-xl border-2 p-4 transition-colors ${
      uploaded ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            {label}
            {required && <span className="text-red-400 text-xs">*</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors disabled:opacity-50 ${
            uploaded
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-orange-50 text-[#FF6B35] border border-orange-200'
          }`}
        >
          {uploading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : uploaded ? (
            <CheckCircle2 size={12} />
          ) : (
            <Upload size={12} />
          )}
          {uploading ? 'Uploading…' : uploaded ? 'Uploaded' : 'Upload'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0) // 0=type, 1=details, 2=docs, 3=review
  const [form, setForm] = useState<BusinessForm>({
    business_type: null,
    legal_name: '',
    dba_name: '',
    ein: '',
    ssn_last4: '',
    business_phone: '',
    business_address: '',
  })
  const [uploaded, setUploaded] = useState<UploadedDocs>({
    identity_front: false,
    identity_back: false,
    business_doc: false,
    food_permit: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)

  // Guard: skip onboarding if KYC already submitted
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase
        .from('food_makers')
        .select('kyc_status')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.kyc_status === 'pending_review' || data?.kyc_status === 'approved') {
            router.push('/pending')
          }
          setCheckingStatus(false)
        })
    })
  }, [router])

  const set = useCallback(<K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }, [])

  const uploadDoc = useCallback(async (slot: DocSlot, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slot', slot)
    const res = await fetch('/api/maker/upload/document', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
    setUploaded((prev) => ({ ...prev, [slot]: true }))
  }, [])

  const validateDetails = (): string | null => {
    if (!form.legal_name.trim()) return 'Legal name is required'
    if (form.business_type === 'sole_proprietor') {
      if (!form.ssn_last4) return 'Last 4 digits of SSN are required'
      if (!/^\d{4}$/.test(form.ssn_last4)) return 'SSN last 4 must be exactly 4 digits'
    } else {
      if (!form.ein.trim()) return 'EIN is required'
      if (!/^\d{2}-?\d{7}$/.test(form.ein.replace(/\s/g, ''))) return 'EIN format must be XX-XXXXXXX'
    }
    return null
  }

  const validateDocs = (): string | null => {
    if (!uploaded.identity_front) return 'Government-issued ID (front) is required'
    if (form.business_type !== 'sole_proprietor' && !uploaded.business_doc) {
      return 'Business formation document is required for your business type'
    }
    return null
  }

  const handleNext = () => {
    setError(null)
    if (step === 0) {
      if (!form.business_type) { setError('Please select a business type'); return }
      setStep(1)
    } else if (step === 1) {
      const err = validateDetails()
      if (err) { setError(err); return }
      setStep(2)
    } else if (step === 2) {
      const err = validateDocs()
      if (err) { setError(err); return }
      setStep(3)
    }
  }

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/maker/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_type:    form.business_type,
          legal_name:       form.legal_name.trim(),
          dba_name:         form.dba_name.trim() || null,
          ein:              form.ein.trim() || null,
          ssn_last4:        form.ssn_last4 || null,
          business_phone:   form.business_phone.trim() || null,
          business_address: form.business_address.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); return }
      router.push('/pending')
    } finally {
      setSubmitting(false)
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#FF6B35]" />
      </div>
    )
  }

  const selectedType = BUSINESS_TYPES.find((b) => b.type === form.business_type)
  const isSoleProp = form.business_type === 'sole_proprietor'
  const activeDocs = DOC_CONFIGS.filter(
    (d) => form.business_type && (d.required(form.business_type!) || d.slot === 'identity_back' || d.slot === 'food_permit')
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] flex items-center justify-center mb-4 shadow-md shadow-[#FF6B35]/25">
            <span className="text-white font-black text-lg">D</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 leading-tight">
            {step === 0 && 'Business type'}
            {step === 1 && 'Business details'}
            {step === 2 && 'Upload documents'}
            {step === 3 && 'Review & submit'}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {step === 0 && 'How is your kitchen structured?'}
            {step === 1 && 'Your legal information for tax & payout purposes'}
            {step === 2 && 'Secure document upload — only our team can view these'}
            {step === 3 && 'Check everything looks right before submitting'}
          </p>
        </div>

        <StepDots step={step} total={4} />

        <div className="mt-6 space-y-4">

          {/* ── Step 0: Business type ──────────────────────────────────── */}
          {step === 0 && BUSINESS_TYPES.map(({ type, icon: Icon, title, description }) => (
            <button
              key={type}
              type="button"
              onClick={() => set('business_type', type)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                form.business_type === type
                  ? 'border-[#FF6B35] bg-orange-50/60 shadow-sm shadow-[#FF6B35]/10'
                  : 'border-gray-200 bg-white hover:border-orange-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  form.business_type === type ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Icon size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${form.business_type === type ? 'text-[#FF6B35]' : 'text-gray-900'}`}>
                    {title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
                </div>
                {form.business_type === type && (
                  <CheckCircle2 size={17} className="text-[#FF6B35] flex-shrink-0 mt-0.5" />
                )}
              </div>
            </button>
          ))}

          {/* ── Step 1: Business details ───────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  {isSoleProp ? 'Your Full Legal Name' : 'Registered Business Name'}
                  <span className="text-red-400 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={form.legal_name}
                  onChange={(e) => set('legal_name', e.target.value)}
                  placeholder={isSoleProp ? 'Jane Marie Smith' : "Smith's Kitchen LLC"}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  {isSoleProp ? 'Trade / Kitchen Name (if different)' : 'DBA — Doing Business As (if different)'}
                </label>
                <input
                  type="text"
                  value={form.dba_name}
                  onChange={(e) => set('dba_name', e.target.value)}
                  placeholder={isSoleProp ? "Jane's Home Kitchen" : 'Optional trade name'}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>

              {isSoleProp ? (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                    SSN — Last 4 Digits
                    <span className="text-red-400 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.ssn_last4}
                    onChange={(e) => set('ssn_last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors font-mono tracking-widest"
                  />
                  <p className="text-xs text-gray-400 mt-1">Used for 1099-NEC tax reporting only — stored securely.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                    EIN — Employer Identification Number
                    <span className="text-red-400 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.ein}
                    onChange={(e) => set('ein', e.target.value)}
                    placeholder="12-3456789"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">Found on your IRS EIN confirmation letter (CP 575).</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Business Phone
                </label>
                <input
                  type="tel"
                  value={form.business_phone}
                  onChange={(e) => set('business_phone', e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Business Address
                </label>
                <input
                  type="text"
                  value={form.business_address}
                  onChange={(e) => set('business_address', e.target.value)}
                  placeholder="123 Main St, Brooklyn, NY 11201"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </>
          )}

          {/* ── Step 2: Documents ─────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
                Your documents are encrypted and only accessible by our review team. We never share them with third parties.
              </div>
              {activeDocs.map((d) => (
                <DocUpload
                  key={d.slot}
                  slot={d.slot}
                  label={d.label}
                  hint={d.hint}
                  required={!!form.business_type && d.required(form.business_type)}
                  uploaded={uploaded[d.slot]}
                  onUpload={uploadDoc}
                />
              ))}
            </>
          )}

          {/* ── Step 3: Review ─────────────────────────────────────────────── */}
          {step === 3 && selectedType && (
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-sm">
              {[
                { label: 'Business Type', value: selectedType.title },
                { label: isSoleProp ? 'Full Legal Name' : 'Registered Name', value: form.legal_name },
                form.dba_name && { label: 'DBA / Trade Name', value: form.dba_name },
                isSoleProp
                  ? { label: 'SSN Last 4', value: `•••-••-${form.ssn_last4}` }
                  : { label: 'EIN', value: form.ein },
                form.business_phone && { label: 'Business Phone', value: form.business_phone },
                form.business_address && { label: 'Business Address', value: form.business_address },
                { label: 'Government ID (front)', value: uploaded.identity_front ? '✓ Uploaded' : '✗ Missing' },
                uploaded.identity_back && { label: 'Government ID (back)', value: '✓ Uploaded' },
                !isSoleProp && { label: 'Business Document', value: uploaded.business_doc ? '✓ Uploaded' : '✗ Missing' },
                uploaded.food_permit && { label: 'Food Permit', value: '✓ Uploaded' },
              ]
                .filter(Boolean)
                .map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs font-semibold text-gray-400">{(row as { label: string }).label}</span>
                    <span className={`text-sm font-medium ${
                      (row as { value: string }).value?.startsWith('✗') ? 'text-red-500' : 'text-gray-900'
                    }`}>
                      {(row as { value: string }).value}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => { setStep(step - 1); setError(null) }}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={15} />
                Back
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FF6B35] text-white font-bold text-sm shadow-md shadow-[#FF6B35]/30 hover:bg-[#E55A24] transition-colors active:scale-[0.98]"
              >
                Continue
                <ChevronRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FF6B35] text-white font-bold text-sm shadow-md shadow-[#FF6B35]/30 hover:bg-[#E55A24] transition-colors active:scale-[0.98] disabled:opacity-60"
              >
                {submitting
                  ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                  : 'Submit Application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

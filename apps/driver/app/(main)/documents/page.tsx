'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'
import { AppHeader } from '@/components/layout/app-header'
import {
  ShieldCheck,
  Upload,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  X,
  Car,
  Pencil,
  Save,
  Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type KycStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected'

// Frontend display model — assembled from both driver_documents and driver_profiles.
// Field names match what the render logic already uses.
type DriverDocument = {
  drivers_license_front: string | null
  drivers_license_back: string | null
  selfie_with_id: string | null
  vehicle_photo: string | null
  vehicle_insurance: string | null
  vehicle_registration: string | null
  kyc_status: KycStatus | null
  admin_notes: string | null   // maps to driver_documents.review_notes
  vehicle_type: string | null
  vehicle_make: string | null
  vehicle_year: string | null
  vehicle_color: string | null
  vehicle_plate: string | null
}

type SignedUrls = Partial<Record<DocType, string>>

type DocType =
  | 'drivers_license_front'
  | 'drivers_license_back'
  | 'selfie_with_id'
  | 'vehicle_photo'
  | 'vehicle_insurance'
  | 'vehicle_registration'

// ─── Constants ────────────────────────────────────────────────────────────────

const VEHICLE_EMOJI: Record<string, string> = {
  car: '🚗',
  motorbike: '🏍️',
  bicycle: '🚲',
  foot: '🚶',
}

const KYC_BADGE: Record<KycStatus, { label: string; classes: string }> = {
  not_submitted: { label: 'Not Submitted', classes: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  pending_review: { label: 'Pending Review', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  approved: { label: 'Approved', classes: 'bg-green-500/15 text-green-400 border-green-500/30' },
  rejected: { label: 'Rejected', classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countUploadedDocs(doc: DriverDocument | null): number {
  if (!doc) return 0
  let count = 0
  // License counts as 1 if either front or back is uploaded
  if (doc.drivers_license_front || doc.drivers_license_back) count++
  if (doc.selfie_with_id) count++
  if (doc.vehicle_photo) count++
  if (doc.vehicle_registration) count++
  if (doc.vehicle_insurance) count++
  return count
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DocCard({
  title,
  uploaded,
  signedUrl,
  locked,
  onUpload,
  onPreview,
  uploadSlots,
}: {
  title: string
  uploaded: boolean
  signedUrl?: string
  locked: boolean
  onUpload: (docType: DocType, file: File) => void
  onPreview: (url: string) => void
  uploadSlots: { label: string; docType: DocType }[]
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (docType: DocType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(docType, file)
    e.target.value = ''
  }

  return (
    <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
      {/* Image area */}
      <div
        className="relative bg-[#161616] flex items-center justify-center cursor-pointer"
        style={{ height: 110 }}
        onClick={() => signedUrl && onPreview(signedUrl)}
      >
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-zinc-700">
            <Upload size={22} />
            <span className="text-[10px] font-medium">No file</span>
          </div>
        )}
      </div>

      {/* Info + upload */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[12px] font-bold text-white leading-tight">{title}</p>
          {uploaded ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5 flex-shrink-0">
              <CheckCircle2 size={9} /> Uploaded
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 flex-shrink-0">
              <XCircle size={9} /> Required
            </span>
          )}
        </div>

        {uploadSlots.map((slot, i) => (
          <div key={slot.docType}>
            <input
              ref={(el) => { inputRefs.current[i] = el }}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleChange(slot.docType, e)}
              disabled={locked}
            />
            <button
              disabled={locked}
              onClick={() => inputRefs.current[i]?.click()}
              className="w-full py-1.5 rounded-xl border border-white/8 text-[11px] font-bold text-zinc-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <Upload size={11} />
              {slot.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter()
  const userId = useDriverStore((s) => s.userId)
  const hasHydrated = useDriverStore((s) => s._hasHydrated)
  const authReady = useDriverStore((s) => s.authReady)

  const [doc, setDoc] = useState<DriverDocument | null>(null)
  const [signedUrls, setSignedUrls] = useState<SignedUrls>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<DocType | null>(null)

  // Vehicle edit
  const [editingVehicle, setEditingVehicle] = useState(false)
  const [vehicleForm, setVehicleForm] = useState({
    vehicle_type: '',
    vehicle_make: '',
    vehicle_year: '',
    vehicle_color: '',
    vehicle_plate: '',
  })
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [vehicleError, setVehicleError] = useState<string | null>(null)

  // Preview overlay
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // ── Auth guard + data load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hasHydrated) return
    if (!userId && !authReady) return
    if (!userId) { router.push('/login'); return }

    async function load() {
      const supabase = createClient()

      // Load document paths from driver_documents (user_id is the unique key).
      // Cast to a local type since migration 056 columns aren't yet in generated types.
      type DocRow = {
        front_path: string | null; back_path: string | null; selfie_path: string | null
        vehicle_photo_path: string | null; insurance_path: string | null
        registration_path: string | null; review_notes: string | null
      }
      const { data: docData } = await supabase
        .from('driver_documents')
        .select(
          'front_path, back_path, selfie_path, vehicle_photo_path, ' +
          'insurance_path, registration_path, review_notes'
        )
        .eq('user_id', userId)
        .single()
      const docRow = docData as unknown as DocRow | null

      // Load KYC status + vehicle details from driver_profiles.
      // vehicle_make/year/color/plate are added by migration 056.
      type ProfileRow = {
        kyc_status: string | null; vehicle_type: string | null
        vehicle_make: string | null; vehicle_year: string | null
        vehicle_color: string | null; vehicle_plate: string | null
      }
      const { data: profileData } = await supabase
        .from('driver_profiles')
        .select('kyc_status, vehicle_type, vehicle_make, vehicle_year, vehicle_color, vehicle_plate')
        .eq('id', userId)
        .single()
      const profileRow = profileData as unknown as ProfileRow | null

      // Map DB column names to the frontend display model
      const combined: DriverDocument = {
        drivers_license_front: docRow?.front_path         ?? null,
        drivers_license_back:  docRow?.back_path          ?? null,
        selfie_with_id:        docRow?.selfie_path        ?? null,
        vehicle_photo:         docRow?.vehicle_photo_path ?? null,
        vehicle_insurance:     docRow?.insurance_path     ?? null,
        vehicle_registration:  docRow?.registration_path  ?? null,
        admin_notes:           docRow?.review_notes       ?? null,
        kyc_status:            (profileRow?.kyc_status as KycStatus) ?? 'not_submitted',
        vehicle_type:          profileRow?.vehicle_type   ?? null,
        vehicle_make:          profileRow?.vehicle_make   ?? null,
        vehicle_year:          profileRow?.vehicle_year   ?? null,
        vehicle_color:         profileRow?.vehicle_color  ?? null,
        vehicle_plate:         profileRow?.vehicle_plate  ?? null,
      }

      setDoc(combined)
      setVehicleForm({
        vehicle_type:  profileRow?.vehicle_type  ?? '',
        vehicle_make:  profileRow?.vehicle_make  ?? '',
        vehicle_year:  profileRow?.vehicle_year  ?? '',
        vehicle_color: profileRow?.vehicle_color ?? '',
        vehicle_plate: profileRow?.vehicle_plate ?? '',
      })

      // Generate signed URLs for all uploaded storage paths
      const storagePaths: { key: DocType; path: string }[] = [
        { key: 'drivers_license_front', path: combined.drivers_license_front ?? '' },
        { key: 'drivers_license_back',  path: combined.drivers_license_back  ?? '' },
        { key: 'selfie_with_id',        path: combined.selfie_with_id        ?? '' },
        { key: 'vehicle_photo',         path: combined.vehicle_photo         ?? '' },
        { key: 'vehicle_insurance',     path: combined.vehicle_insurance     ?? '' },
        { key: 'vehicle_registration',  path: combined.vehicle_registration  ?? '' },
      ].filter((p) => Boolean(p.path)) as { key: DocType; path: string }[]

      const urls: SignedUrls = {}
      await Promise.all(
        storagePaths.map(async ({ key, path }) => {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(path, 3600)
          if (signed?.signedUrl) urls[key] = signed.signedUrl
        })
      )
      setSignedUrls(urls)
      setLoading(false)
    }
    load()
  }, [router, userId, authReady, hasHydrated])

  // ── Upload handler ──────────────────────────────────────────────────────────
  const handleUpload = async (docType: DocType, file: File) => {
    if (!userId) return
    setUploading(docType)
    try {
      const fd = new FormData()
      fd.append('docType', docType)
      fd.append('file', file)
      const res = await fetch('/api/driver/upload-document', { method: 'POST', body: fd })
      const ct = res.headers.get('content-type') ?? ''
      if (!res.ok) {
        const msg = ct.includes('application/json')
          ? (await res.json().catch(() => ({}))).error ?? 'Upload failed'
          : `Upload failed (${res.status})`
        console.error('[upload]', msg)
        return
      }
      const { path: storagePath } = ct.includes('application/json')
        ? await res.json()
        : { path: null }

      // Update local state immediately with the returned path + generate signed URL
      if (storagePath) {
        setDoc((prev) => prev ? { ...prev, [docType]: storagePath } : prev)
        const supabase = createClient()
        const { data: signed } = await supabase.storage
          .from('driver-documents')
          .createSignedUrl(storagePath, 3600)
        if (signed?.signedUrl) {
          setSignedUrls((prev) => ({ ...prev, [docType]: signed.signedUrl }))
        }
      }
    } finally {
      setUploading(null)
    }
  }

  // ── Save vehicle ────────────────────────────────────────────────────────────
  const handleSaveVehicle = async () => {
    setSavingVehicle(true)
    setVehicleError(null)
    try {
      const res = await fetch('/api/driver/update-vehicle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleForm),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setVehicleError(err.error ?? 'Failed to save')
        return
      }
      setDoc((prev) => prev ? { ...prev, ...vehicleForm } : prev)
      setEditingVehicle(false)
    } finally {
      setSavingVehicle(false)
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const kycStatus = (doc?.kyc_status ?? 'not_submitted') as KycStatus
  const isPending = kycStatus === 'pending_review'
  const isApproved = kycStatus === 'approved'
  const uploadedCount = countUploadedDocs(doc)
  const badge = KYC_BADGE[kycStatus]
  const vehicleEmoji = VEHICLE_EMOJI[doc?.vehicle_type ?? ''] ?? '🚗'

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#080808]">
        <div className="h-[60px] bg-[#111] border-b border-white/5 animate-pulse" />
        <div className="p-4 space-y-3">
          <div className="h-24 bg-[#111] rounded-2xl animate-pulse" />
          <div className="h-36 bg-[#111] rounded-2xl animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-[#111] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[#080808]">
      <AppHeader title="Documents" showBack />

      <div className="p-4 space-y-4 pb-10">

        {/* ── Compliance status banner ──────────────────────────────────────── */}
        <div className="bg-[#111] rounded-2xl border border-white/5 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF7A50]/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-[#FF7A50]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white">
                  {uploadedCount} of 5 documents uploaded
                </p>
                <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${badge.classes}`}>
                  {badge.label}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(uploadedCount / 5) * 100}%`,
                background: isApproved ? '#22c55e' : '#FF7A50',
              }}
            />
          </div>

          {!isApproved && (
            <button
              onClick={() => router.push('/onboarding')}
              className="w-full bg-[#FF7A50] text-white font-black text-sm py-3 rounded-xl active:scale-[0.98] transition-all"
            >
              Complete Verification
            </button>
          )}
        </div>

        {/* ── Admin notes ───────────────────────────────────────────────────── */}
        {doc?.admin_notes && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex gap-3">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-400 mb-1">Admin Notes</p>
              <p className="text-sm text-amber-300/80 leading-relaxed">{doc.admin_notes}</p>
            </div>
          </div>
        )}

        {/* ── Editing locked banner ─────────────────────────────────────────── */}
        {isPending && (
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
            <Lock size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-400">Documents under review — editing is locked</p>
          </div>
        )}

        {/* ── Vehicle information card ──────────────────────────────────────── */}
        <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <Car size={16} className="text-zinc-500" />
              <p className="text-sm font-bold text-white">Vehicle Information</p>
            </div>
            {!isPending && (
              <button
                onClick={() => setEditingVehicle((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-white transition-colors"
              >
                <Pencil size={12} />
                {editingVehicle ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>

          {editingVehicle ? (
            <div className="p-4 space-y-3">
              {[
                { key: 'vehicle_type', label: 'Type', placeholder: 'car / motorbike / bicycle / foot' },
                { key: 'vehicle_make', label: 'Make / Model', placeholder: 'e.g. Toyota Corolla' },
                { key: 'vehicle_year', label: 'Year', placeholder: 'e.g. 2020' },
                { key: 'vehicle_color', label: 'Color', placeholder: 'e.g. Silver' },
                { key: 'vehicle_plate', label: 'Plate', placeholder: 'e.g. ABC-1234' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={vehicleForm[key as keyof typeof vehicleForm]}
                    onChange={(e) =>
                      setVehicleForm((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder={placeholder}
                    className="w-full bg-[#1A1A1A] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF7A50]/50"
                  />
                </div>
              ))}
              {vehicleError && (
                <p className="text-xs text-red-400">{vehicleError}</p>
              )}
              <button
                disabled={savingVehicle}
                onClick={handleSaveVehicle}
                className="w-full bg-[#FF7A50] text-white font-black text-sm py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingVehicle ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving…</>
                ) : (
                  <><Save size={14} /> Save Vehicle Info</>
                )}
              </button>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-0.5">Type</p>
                <p className="text-sm text-white font-semibold">
                  {vehicleEmoji} {doc?.vehicle_type ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-0.5">Make / Model</p>
                <p className="text-sm text-white font-semibold">{doc?.vehicle_make ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-0.5">Year</p>
                <p className="text-sm text-white font-semibold">{doc?.vehicle_year ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-0.5">Color</p>
                <p className="text-sm text-white font-semibold">{doc?.vehicle_color ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-0.5">Plate</p>
                <p className="text-sm text-white font-semibold font-mono tracking-widest">
                  {doc?.vehicle_plate ?? '—'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Required Documents grid ───────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-3 px-1">
            Required Documents
          </p>
          <div className="grid grid-cols-2 gap-3">

            {/* Driver's License (front + back together) */}
            <DocCard
              title="Driver's License"
              uploaded={!!(doc?.drivers_license_front || doc?.drivers_license_back)}
              signedUrl={signedUrls.drivers_license_front ?? signedUrls.drivers_license_back}
              locked={isPending || uploading !== null}
              onUpload={handleUpload}
              onPreview={setPreviewUrl}
              uploadSlots={[
                { label: uploading === 'drivers_license_front' ? 'Uploading…' : 'Upload Front', docType: 'drivers_license_front' },
                { label: uploading === 'drivers_license_back' ? 'Uploading…' : 'Upload Back', docType: 'drivers_license_back' },
              ]}
            />

            {/* Selfie with ID */}
            <DocCard
              title="Selfie with ID"
              uploaded={!!doc?.selfie_with_id}
              signedUrl={signedUrls.selfie_with_id}
              locked={isPending || uploading !== null}
              onUpload={handleUpload}
              onPreview={setPreviewUrl}
              uploadSlots={[
                { label: uploading === 'selfie_with_id' ? 'Uploading…' : 'Upload', docType: 'selfie_with_id' },
              ]}
            />

            {/* Vehicle Photo */}
            <DocCard
              title="Vehicle Photo"
              uploaded={!!doc?.vehicle_photo}
              signedUrl={signedUrls.vehicle_photo}
              locked={isPending || uploading !== null}
              onUpload={handleUpload}
              onPreview={setPreviewUrl}
              uploadSlots={[
                { label: uploading === 'vehicle_photo' ? 'Uploading…' : 'Upload', docType: 'vehicle_photo' },
              ]}
            />

            {/* Vehicle Registration */}
            <DocCard
              title="Registration"
              uploaded={!!doc?.vehicle_registration}
              signedUrl={signedUrls.vehicle_registration}
              locked={isPending || uploading !== null}
              onUpload={handleUpload}
              onPreview={setPreviewUrl}
              uploadSlots={[
                { label: uploading === 'vehicle_registration' ? 'Uploading…' : 'Upload', docType: 'vehicle_registration' },
              ]}
            />

            {/* Vehicle Insurance — spans full width if 5th item */}
            <div className="col-span-2">
              <DocCard
                title="Vehicle Insurance"
                uploaded={!!doc?.vehicle_insurance}
                signedUrl={signedUrls.vehicle_insurance}
                locked={isPending || uploading !== null}
                onUpload={handleUpload}
                onPreview={setPreviewUrl}
                uploadSlots={[
                  { label: uploading === 'vehicle_insurance' ? 'Uploading…' : 'Upload', docType: 'vehicle_insurance' },
                ]}
              />
            </div>

          </div>
        </div>
      </div>

      {/* ── Full-screen preview overlay ─────────────────────────────────────── */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            onClick={() => setPreviewUrl(null)}
          >
            <X size={18} className="text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Document preview"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

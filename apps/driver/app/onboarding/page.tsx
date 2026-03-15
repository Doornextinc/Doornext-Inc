'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadGoogleMapsScript, parsePlace } from '@/lib/google-maps'
import {
  ChevronLeft, ChevronRight, Shield, ShieldCheck, FileCheck,
  Fingerprint, CheckCircle, AlertCircle, Loader2, RefreshCw,
  Eye, Lock, Clock, Upload, Car, FileText,
} from 'lucide-react'

type Step =
  | 'loading'
  | 'intro'
  | 'personal-info'
  | 'select-id'
  | 'scan-front'
  | 'scan-back'
  | 'insurance'
  | 'bg-check'
  | 'scan-selfie'
  | 'submitting'
  | 'submitted'
  | 'pending'
  | 'rejected'

type IdType = 'drivers_license' | 'passport'

const ID_OPTIONS: Array<{ value: IdType; label: string; emoji: string; twoSides: boolean; desc: string }> = [
  { value: 'drivers_license', label: "Driver's License", emoji: '🪪', twoSides: true, desc: 'Front & back scan required' },
  { value: 'passport', label: 'Passport', emoji: '📘', twoSides: false, desc: 'Photo page only' },
]

const NEEDS_INSURANCE = (v: string) => ['car', 'motorbike'].includes(v)

function inputClass(hasError = false) {
  return `w-full bg-slate-800 border ${hasError ? 'border-red-500' : 'border-slate-700'} rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all outline-none`
}

function getProgressStep(step: Step, needsInsurance: boolean): number {
  if (needsInsurance) {
    const map: Partial<Record<Step, number>> = {
      'personal-info': 1, 'select-id': 2, 'scan-front': 2, 'scan-back': 2,
      'insurance': 3, 'bg-check': 4, 'scan-selfie': 5,
    }
    return map[step] ?? 0
  } else {
    const map: Partial<Record<Step, number>> = {
      'personal-info': 1, 'select-id': 2, 'scan-front': 2, 'scan-back': 2,
      'bg-check': 3, 'scan-selfie': 4,
    }
    return map[step] ?? 0
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('loading')
  const [vehicleType, setVehicleType] = useState<string>('car')
  const [personalInfo, setPersonalInfo] = useState({ fullName: '', dateOfBirth: '', ssnLast4: '', address: '' })
  const [idType, setIdType] = useState<IdType | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState('')
  const [backFile, setBackFile] = useState<File | null>(null)
  const [backPreview, setBackPreview] = useState('')
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)
  const [insurancePreview, setInsurancePreview] = useState('')
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState('')
  const [bgCheckConsent, setBgCheckConsent] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const insuranceInputRef = useRef<HTMLInputElement>(null)
  const addressInputRef = useRef<HTMLInputElement>(null)

  const needsInsurance = NEEDS_INSURANCE(vehicleType)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/welcome'); return }

      if (user.user_metadata?.full_name) {
        setPersonalInfo(prev => ({ ...prev, fullName: user.user_metadata.full_name }))
      }

      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('kyc_status, vehicle_type')
        .eq('id', user.id)
        .single()

      if (profile?.vehicle_type) setVehicleType(profile.vehicle_type)

      if (profile?.kyc_status === 'approved') { router.push('/available'); return }
      if (profile?.kyc_status === 'pending_review') { setStep('pending'); return }
      if (profile?.kyc_status === 'rejected') {
        const { data: doc } = await supabase.from('driver_documents').select('review_notes').eq('user_id', user.id).single()
        setReviewNotes(doc?.review_notes ?? null)
        setStep('rejected'); return
      }

      setStep('intro')
    }
    check()
  }, [router])

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  // Attach Google Places autocomplete when on the personal-info step
  useEffect(() => {
    if (step !== 'personal-info') return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return
    let ac: google.maps.places.Autocomplete | null = null
    const timer = setTimeout(() => {
      if (!addressInputRef.current) return
      loadGoogleMapsScript(apiKey).then(() => {
        if (!addressInputRef.current) return
        ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          types: ['address'],
          fields: ['address_components', 'formatted_address'],
        })
        ac.addListener('place_changed', () => {
          const place = ac!.getPlace()
          const parsed = parsePlace(place)
          if (!parsed) return
          const formatted = place.formatted_address ?? `${parsed.street}, ${parsed.city}, ${parsed.state} ${parsed.zip}`
          setPersonalInfo(p => ({ ...p, address: formatted }))
        })
      })
    }, 100)
    return () => {
      clearTimeout(timer)
      if (ac) window.google?.maps?.event?.clearInstanceListeners(ac)
    }
  }, [step])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }, [])

  const openCamera = useCallback(async (facing: 'user' | 'environment') => {
    stopCamera(); setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setCameraActive(true)
    } catch {
      setError('Camera access denied. Please allow camera permissions and try again.')
    }
  }, [stopCamera])

  const capture = useCallback((target: 'front' | 'back' | 'selfie') => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current; const canvas = canvasRef.current
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    if (target === 'selfie') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `${target}-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const url = URL.createObjectURL(file)
      if (target === 'front') { setFrontFile(file); setFrontPreview(url) }
      else if (target === 'back') { setBackFile(file); setBackPreview(url) }
      else { setSelfieFile(file); setSelfiePreview(url) }
      stopCamera()
    }, 'image/jpeg', 0.92)
  }, [stopCamera])

  const retake = (target: 'front' | 'back' | 'selfie') => {
    if (target === 'front') { setFrontFile(null); setFrontPreview(''); openCamera('environment') }
    else if (target === 'back') { setBackFile(null); setBackPreview(''); openCamera('environment') }
    else { setSelfieFile(null); setSelfiePreview(''); openCamera('user') }
  }

  const goToFront = () => { setError(null); setStep('scan-front'); openCamera('environment') }
  const goToBack = () => { setError(null); setStep('scan-back'); openCamera('environment') }
  const goToSelfie = () => { setError(null); setStep('scan-selfie'); openCamera('user') }
  const goToInsurance = () => { setError(null); setStep('insurance') }
  const goToBgCheck = () => { setError(null); setStep('bg-check') }

  const handlePersonalInfoNext = () => {
    if (!personalInfo.fullName.trim()) { setError('Full name is required.'); return }
    if (!personalInfo.dateOfBirth) { setError('Date of birth is required.'); return }
    if (personalInfo.ssnLast4.length < 4) { setError('Last 4 SSN digits are required.'); return }
    if (!personalInfo.address.trim()) { setError('Residential address is required.'); return }
    setError(null); setStep('select-id')
  }

  const handleIdTypeNext = () => {
    if (!idType) { setError('Please select your ID type.'); return }
    setError(null); goToFront()
  }

  const handleFrontNext = () => {
    if (!frontFile) { setError('Please capture your ID.'); return }
    setError(null)
    const sel = ID_OPTIONS.find(o => o.value === idType)
    if (sel?.twoSides) goToBack()
    else if (needsInsurance) goToInsurance()
    else goToBgCheck()
  }

  const handleBackNext = () => {
    if (!backFile) { setError('Please capture the back of your ID.'); return }
    setError(null)
    if (needsInsurance) goToInsurance()
    else goToBgCheck()
  }

  const handleInsuranceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setInsuranceFile(file)
    setInsurancePreview(URL.createObjectURL(file))
  }

  const handleInsuranceNext = () => {
    if (!insuranceFile) { setError('Please upload your insurance document.'); return }
    setError(null); goToBgCheck()
  }

  const handleBgCheckNext = () => {
    if (!bgCheckConsent) { setError('You must consent to a background check to continue.'); return }
    setError(null); goToSelfie()
  }

  const handleSubmit = async () => {
    if (!selfieFile) { setError('Please capture your selfie.'); return }
    setError(null); setStep('submitting')
    try {
      const uploadFile = async (file: File, name: string): Promise<string> => {
        const fd = new FormData(); fd.append('file', file); fd.append('name', name)
        const res = await fetch('/api/driver/upload-doc', { method: 'POST', body: fd })
        if (!res.ok) { const { error } = await res.json(); throw new Error(`Upload failed: ${error}`) }
        return (await res.json()).path
      }

      const frontPath = await uploadFile(frontFile!, 'front')
      const backPath = backFile ? await uploadFile(backFile, 'back') : null
      const insurancePath = insuranceFile ? await uploadFile(insuranceFile, 'insurance') : null
      const selfiePath = await uploadFile(selfieFile!, 'selfie')

      const res = await fetch('/api/driver/submit-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...personalInfo, idType, frontPath, backPath, insurancePath, selfiePath, bgCheckConsent }),
      })

      if (!res.ok) { const { error: apiError } = await res.json(); throw new Error(apiError ?? 'Submission failed') }
      setStep('submitted')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStep('scan-selfie')
    }
  }

  const selectedId = ID_OPTIONS.find(o => o.value === idType)
  const progressStep = getProgressStep(step, needsInsurance)
  const progressLabels = needsInsurance
    ? ['Info', 'ID Scan', 'Insurance', 'Bg Check', 'Selfie']
    : ['Info', 'ID Scan', 'Bg Check', 'Selfie']
  const showProgress = progressStep > 0 && !['submitting', 'submitted', 'pending', 'rejected', 'loading'].includes(step)

  if (step === 'loading') {
    return <div className="flex items-center justify-center py-24"><div className="w-10 h-10 border-[3px] border-[#FF6B35] border-t-transparent rounded-full animate-spin" /></div>
  }

  if (step === 'pending') {
    return (
      <div className="text-center py-8 space-y-6">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
          <Clock size={36} className="text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Under Review</h1>
          <p className="text-slate-400 text-sm mt-2 max-w-xs mx-auto">Your application is being reviewed. This typically takes 24–48 hours.</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/40 text-left space-y-3">
          {['Identity documents submitted', 'Background check initiated', 'Awaiting compliance approval'].map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-5 h-5 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              </div>
              <span className="text-slate-300">{item}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600">We'll notify you once your account is approved.</p>
      </div>
    )
  }

  if (step === 'rejected') {
    return (
      <div className="text-center py-8 space-y-6">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle size={36} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Verification Declined</h1>
          <p className="text-slate-400 text-sm mt-2">We were unable to verify your identity.</p>
        </div>
        {reviewNotes && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-2xl p-4 text-left">
            <p className="text-xs text-red-400 font-bold uppercase tracking-wide mb-1">Reason</p>
            <p className="text-sm text-slate-300">{reviewNotes}</p>
          </div>
        )}
        <button
          onClick={() => { setFrontFile(null); setFrontPreview(''); setBackFile(null); setBackPreview(''); setInsuranceFile(null); setInsurancePreview(''); setSelfieFile(null); setSelfiePreview(''); setIdType(null); setStep('intro') }}
          className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold shadow-lg shadow-[#FF6B35]/20"
        >
          Resubmit Application
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {showProgress && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {progressLabels.map((label, i) => {
              const num = i + 1; const done = num < progressStep; const active = num === progressStep
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-1.5 w-full rounded-full transition-all ${done ? 'bg-[#FF6B35]' : active ? 'bg-[#FF6B35] animate-pulse' : 'bg-slate-700'}`} />
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${num <= progressStep ? 'text-[#FF6B35]' : 'text-slate-600'}`}>{label}</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/60 rounded-lg border border-slate-700/40">
            <Lock size={11} className="text-slate-500 flex-shrink-0" />
            <p className="text-[10px] text-slate-500">256-bit encrypted · Compliance secured</p>
          </div>
        </div>
      )}

      {/* ── INTRO ── */}
      {step === 'intro' && (
        <div className="space-y-6">
          <div className="text-center space-y-4 pt-4">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-[#FF6B35]/10 border border-[#FF6B35]/20 flex items-center justify-center">
              <Shield size={36} className="text-[#FF6B35]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Verify Your Identity</h1>
              <p className="text-slate-400 text-sm mt-2">Required before you can start delivering</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { icon: '📋', title: 'Personal Information', desc: 'Name, date of birth, SSN last 4, address' },
              { icon: '🪪', title: 'Government-Issued ID', desc: "Driver's license or passport" },
              ...(needsInsurance ? [{ icon: '📄', title: 'Insurance Document', desc: 'Current vehicle insurance card required' }] : []),
              { icon: '🔍', title: 'Background Check', desc: 'Consent required for identity verification' },
              { icon: '🤳', title: 'Selfie Match', desc: "Quick photo to confirm it's you" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-slate-800/60 rounded-2xl p-4 border border-slate-700/40">
                <span className="text-2xl mt-0.5">{item.icon}</span>
                <div>
                  <p className="font-bold text-white text-sm">{item.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Clock size={12} /> Takes about {needsInsurance ? '5' : '4'} minutes
          </div>
          <button onClick={() => setStep('personal-info')} className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-black text-base shadow-lg shadow-[#FF6B35]/20 flex items-center justify-center gap-2">
            Start Verification <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── PERSONAL INFO ── */}
      {step === 'personal-info' && (
        <div className="space-y-5">
          <div className="border-b border-slate-700/50 pb-4">
            <h2 className="text-xl font-black text-white">Applicant Information</h2>
            <p className="text-sm text-slate-400 mt-1">Must match exactly what's on your government-issued ID.</p>
          </div>
          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Full Legal Name <span className="text-red-400">*</span></label>
              <input type="text" value={personalInfo.fullName} onChange={e => setPersonalInfo(p => ({ ...p, fullName: e.target.value }))} placeholder="As it appears on your ID" className={inputClass()} maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Date of Birth <span className="text-red-400">*</span></label>
                <input type="date" value={personalInfo.dateOfBirth} onChange={e => setPersonalInfo(p => ({ ...p, dateOfBirth: e.target.value }))} className={inputClass()} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">SSN Last 4 <span className="text-red-400">*</span></label>
                <input type="text" inputMode="numeric" value={personalInfo.ssnLast4} onChange={e => setPersonalInfo(p => ({ ...p, ssnLast4: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="••••" maxLength={4} className={`${inputClass()} font-mono tracking-[0.4em] text-center`} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Residential Address <span className="text-red-400">*</span></label>
              <input ref={addressInputRef} type="text" value={personalInfo.address} onChange={e => setPersonalInfo(p => ({ ...p, address: e.target.value }))} placeholder="Start typing your address…" autoComplete="off" className={inputClass()} />
              <p className="text-[10px] text-slate-600 mt-1.5">Must match the address on your ID document</p>
            </div>
          </div>
          <button onClick={handlePersonalInfoNext} className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold shadow-lg shadow-[#FF6B35]/20 flex items-center justify-center gap-2">
            Continue <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── SELECT ID ── */}
      {step === 'select-id' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('personal-info')} className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
            <div>
              <h2 className="text-xl font-black text-white">Select ID Document</h2>
              <p className="text-sm text-slate-400">Government-issued photo ID</p>
            </div>
          </div>
          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}
          <div className="space-y-3">
            {ID_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setIdType(opt.value)} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${idType === opt.value ? 'border-[#FF6B35] bg-[#FF6B35]/5' : 'border-slate-700 bg-slate-800 hover:border-slate-600'}`}>
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0 ${idType === opt.value ? 'bg-[#FF6B35]/10' : 'bg-slate-700/60'}`}>{opt.emoji}</div>
                <div className="flex-1">
                  <p className="font-bold text-white">{opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
                {idType === opt.value && <CheckCircle size={20} className="text-[#FF6B35] flex-shrink-0" />}
              </button>
            ))}
          </div>
          <button onClick={handleIdTypeNext} disabled={!idType} className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold shadow-lg shadow-[#FF6B35]/20 flex items-center justify-center gap-2 disabled:opacity-50">
            Continue <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── SCAN FRONT ── */}
      {step === 'scan-front' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => { stopCamera(); setStep('select-id') }} className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
            <div>
              <div className="flex items-center gap-2"><FileCheck size={16} className="text-[#FF6B35]" /><h2 className="text-xl font-black text-white">Document — Front</h2></div>
              <p className="text-sm text-slate-400">{selectedId?.label} · {selectedId?.twoSides ? 'Step 1 of 2' : 'Single side'}</p>
            </div>
          </div>
          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}
          {!frontPreview ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/2] border border-slate-700/40">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none">
                {['top-5 left-5 border-t-[3px] border-l-[3px] rounded-tl-lg', 'top-5 right-5 border-t-[3px] border-r-[3px] rounded-tr-lg', 'bottom-5 left-5 border-b-[3px] border-l-[3px] rounded-bl-lg', 'bottom-5 right-5 border-b-[3px] border-r-[3px] rounded-br-lg'].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-[#FF6B35] ${cls}`} />
                ))}
              </div>
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 uppercase tracking-wider"><Eye size={10} /> Live</div>
              {cameraActive && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <button onClick={() => capture('front')} className="w-16 h-16 rounded-full bg-white border-4 border-slate-400 hover:scale-95 active:scale-90 transition-transform shadow-xl" />
                </div>
              )}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden aspect-[3/2] border border-slate-700/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frontPreview} alt="Front of ID" className="w-full h-full object-cover" />
              <div className="absolute bottom-3 left-3 bg-[#FF6B35] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><CheckCircle size={13} /> Captured</div>
            </div>
          )}
          <div className="flex gap-3">
            {frontPreview && <button onClick={() => retake('front')} className="flex-1 border border-slate-700 bg-slate-800 text-slate-300 rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 hover:border-slate-600"><RefreshCw size={15} /> Retake</button>}
            <button onClick={handleFrontNext} disabled={!frontFile} className="flex-1 bg-[#FF6B35] text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-[#FF6B35]/20">
              Next <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── SCAN BACK ── */}
      {step === 'scan-back' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => { stopCamera(); setStep('scan-front') }} className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
            <div>
              <div className="flex items-center gap-2"><FileCheck size={16} className="text-[#FF6B35]" /><h2 className="text-xl font-black text-white">Document — Back</h2></div>
              <p className="text-sm text-slate-400">Flip your {selectedId?.label} · Step 2 of 2</p>
            </div>
          </div>
          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}
          {!backPreview ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/2] border border-slate-700/40">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none">
                {['top-5 left-5 border-t-[3px] border-l-[3px] rounded-tl-lg', 'top-5 right-5 border-t-[3px] border-r-[3px] rounded-tr-lg', 'bottom-5 left-5 border-b-[3px] border-l-[3px] rounded-bl-lg', 'bottom-5 right-5 border-b-[3px] border-r-[3px] rounded-br-lg'].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-[#FF6B35] ${cls}`} />
                ))}
              </div>
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 uppercase tracking-wider"><Eye size={10} /> Live</div>
              {cameraActive && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <button onClick={() => capture('back')} className="w-16 h-16 rounded-full bg-white border-4 border-slate-400 hover:scale-95 active:scale-90 transition-transform shadow-xl" />
                </div>
              )}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden aspect-[3/2] border border-slate-700/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={backPreview} alt="Back of ID" className="w-full h-full object-cover" />
              <div className="absolute bottom-3 left-3 bg-[#FF6B35] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><CheckCircle size={13} /> Captured</div>
            </div>
          )}
          <div className="flex gap-3">
            {backPreview && <button onClick={() => retake('back')} className="flex-1 border border-slate-700 bg-slate-800 text-slate-300 rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 hover:border-slate-600"><RefreshCw size={15} /> Retake</button>}
            <button onClick={handleBackNext} disabled={!backFile} className="flex-1 bg-[#FF6B35] text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-[#FF6B35]/20">
              Next <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── INSURANCE ── (car / motorbike only) */}
      {step === 'insurance' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(selectedId?.twoSides ? 'scan-back' : 'scan-front')} className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
            <div>
              <div className="flex items-center gap-2"><Car size={16} className="text-[#FF6B35]" /><h2 className="text-xl font-black text-white">Insurance Document</h2></div>
              <p className="text-sm text-slate-400">Required for {vehicleType === 'motorbike' ? 'motorbike' : 'car'} drivers</p>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
            <p className="text-sm font-semibold text-yellow-300 mb-1">What to upload</p>
            <p className="text-xs text-yellow-200/70">Current insurance card or declaration page showing your name, vehicle, and coverage dates. Must be valid and not expired.</p>
          </div>

          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}

          <input ref={insuranceInputRef} type="file" accept="image/*,application/pdf" onChange={handleInsuranceFileChange} className="hidden" />

          {!insurancePreview ? (
            <button
              onClick={() => insuranceInputRef.current?.click()}
              className="w-full aspect-[3/2] rounded-2xl border-2 border-dashed border-slate-600 hover:border-[#FF6B35] bg-slate-800/40 hover:bg-[#FF6B35]/5 transition-all flex flex-col items-center justify-center gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-700 flex items-center justify-center">
                <Upload size={24} className="text-slate-400" />
              </div>
              <div className="text-center">
                <p className="font-bold text-white text-sm">Upload Insurance Card</p>
                <p className="text-xs text-slate-500 mt-1">Photo or PDF · Tap to browse files</p>
              </div>
            </button>
          ) : (
            <div className="relative rounded-2xl overflow-hidden aspect-[3/2] border border-slate-700/40 bg-slate-800">
              {insuranceFile?.type === 'application/pdf' ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <FileText size={40} className="text-[#FF6B35]" />
                  <div className="text-center">
                    <p className="font-bold text-white text-sm">{insuranceFile.name}</p>
                    <p className="text-xs text-slate-500 mt-1">PDF document ready</p>
                  </div>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={insurancePreview} alt="Insurance document" className="w-full h-full object-cover" />
              )}
              <div className="absolute bottom-3 left-3 bg-[#FF6B35] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><CheckCircle size={13} /> Document Ready</div>
            </div>
          )}

          <div className="flex gap-3">
            {insurancePreview && (
              <button onClick={() => { setInsuranceFile(null); setInsurancePreview(''); insuranceInputRef.current?.click() }} className="flex-1 border border-slate-700 bg-slate-800 text-slate-300 rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 hover:border-slate-600">
                <RefreshCw size={15} /> Replace
              </button>
            )}
            <button onClick={handleInsuranceNext} disabled={!insuranceFile} className="flex-1 bg-[#FF6B35] text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-[#FF6B35]/20">
              Next <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── BACKGROUND CHECK ── */}
      {step === 'bg-check' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => needsInsurance ? setStep('insurance') : setStep(selectedId?.twoSides ? 'scan-back' : 'scan-front')} className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
            <div>
              <div className="flex items-center gap-2"><Shield size={16} className="text-[#FF6B35]" /><h2 className="text-xl font-black text-white">Background Check</h2></div>
              <p className="text-sm text-slate-400">Required for all delivery partners</p>
            </div>
          </div>

          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}

          <div className="bg-slate-800 rounded-2xl border border-slate-700/40 p-5 space-y-4">
            <div>
              <p className="font-bold text-white mb-2">What we check</p>
              <div className="space-y-2.5">
                {[
                  { icon: '🔍', text: 'Criminal history (county, state, federal)' },
                  { icon: '🚗', text: 'Motor vehicle record (for car/motorbike drivers)' },
                  { icon: '🪪', text: 'Identity and SSN verification' },
                  { icon: '📋', text: 'Sex offender registry check' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-base">{item.icon}</span>
                    <p className="text-sm text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-700/50 pt-4">
              <p className="text-xs text-slate-400 mb-3">Background checks are powered by a FCRA-compliant third-party provider. Results are kept confidential and used solely to determine delivery partner eligibility.</p>
              <p className="text-xs text-slate-500">Your SSN last 4 digits collected earlier will be used for identity matching during the background check process.</p>
            </div>
          </div>

          <button
            onClick={() => setBgCheckConsent(!bgCheckConsent)}
            className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 transition-all text-left ${bgCheckConsent ? 'border-[#FF6B35] bg-[#FF6B35]/5' : 'border-slate-700 bg-slate-800'}`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${bgCheckConsent ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-slate-600'}`}>
              {bgCheckConsent && <CheckCircle size={14} className="text-white" />}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              I consent to a background check and certify that the information I've provided is accurate and complete.
            </p>
          </button>

          <button onClick={handleBgCheckNext} disabled={!bgCheckConsent} className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold shadow-lg shadow-[#FF6B35]/20 flex items-center justify-center gap-2 disabled:opacity-50">
            Continue <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── SCAN SELFIE ── */}
      {step === 'scan-selfie' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => { stopCamera(); setStep('bg-check') }} className="text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
            <div>
              <div className="flex items-center gap-2"><Fingerprint size={16} className="text-[#FF6B35]" /><h2 className="text-xl font-black text-white">Biometric Match</h2></div>
              <p className="text-sm text-slate-400">Face must match your ID photo</p>
            </div>
          </div>
          {error && <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{error}</div>}
          {!selfiePreview ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square border border-slate-700/40">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-60 border-2 border-white/40 rounded-full shadow-[0_0_60px_rgba(255,107,53,0.1)]" />
              </div>
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 uppercase tracking-wider"><Eye size={10} /> Biometric</div>
              {cameraActive && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <button onClick={() => capture('selfie')} className="w-16 h-16 rounded-full bg-white border-4 border-slate-400 hover:scale-95 active:scale-90 transition-transform shadow-xl" />
                </div>
              )}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden aspect-square border border-slate-700/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfiePreview} alt="Selfie" className="w-full h-full object-cover" />
              <div className="absolute bottom-3 left-3 bg-[#FF6B35] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><CheckCircle size={13} /> Captured</div>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/60 rounded-xl border border-slate-700/40">
            <Lock size={11} className="text-slate-500 flex-shrink-0" />
            <p className="text-[10px] text-slate-500">Biometric data is encrypted and never stored after verification</p>
          </div>
          <div className="flex gap-3">
            {selfiePreview && <button onClick={() => retake('selfie')} className="flex-1 border border-slate-700 bg-slate-800 text-slate-300 rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 hover:border-slate-600"><RefreshCw size={15} /> Retake</button>}
            <button onClick={handleSubmit} disabled={!selfieFile} className="flex-1 bg-[#FF6B35] text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-[#FF6B35]/20">
              <ShieldCheck size={18} /> Submit
            </button>
          </div>
        </div>
      )}

      {/* ── SUBMITTING ── */}
      {step === 'submitting' && (
        <div className="text-center py-16 space-y-8">
          <div className="mx-auto w-24 h-24 rounded-2xl bg-[#FF6B35]/10 border border-[#FF6B35]/20 flex items-center justify-center">
            <Shield size={44} className="text-[#FF6B35] animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Processing…</h2>
            <p className="text-slate-400 text-sm mt-2">Securely uploading and encrypting your documents</p>
          </div>
          <div className="space-y-3">
            {['Encrypting documents…', 'Uploading to secure storage…', 'Initiating background check…', 'Submitting for review…'].map((msg, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin text-[#FF6B35] flex-shrink-0" />
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUBMITTED ── */}
      {step === 'submitted' && (
        <div className="text-center py-8 space-y-6">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <ShieldCheck size={36} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Application Submitted</h1>
            <p className="text-slate-400 text-sm mt-2 max-w-xs mx-auto">Your identity verification is under review. We'll notify you within 24–48 hours.</p>
          </div>
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/40 text-left space-y-3">
            {[
              { label: 'Personal info', done: true },
              { label: 'ID document scanned', done: true },
              ...(needsInsurance ? [{ label: 'Insurance document uploaded', done: true }] : []),
              { label: 'Background check initiated', done: true },
              { label: 'Biometric captured', done: true },
              { label: 'Compliance review', done: false },
              { label: 'Account activation', done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {item.done ? <CheckCircle size={16} className="text-green-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex-shrink-0" />}
                <span className={item.done ? 'text-slate-300' : 'text-slate-600'}>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600">Check back here to see your application status.</p>
        </div>
      )}
    </div>
  )
}

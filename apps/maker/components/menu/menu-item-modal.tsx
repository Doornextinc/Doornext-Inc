'use client'

import { useState, useEffect, useRef } from 'react'
import type { MenuItem } from '@doornext/shared/types'
import { X, Loader2, Camera, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const DIETARY_OPTIONS = ['vegan', 'vegetarian', 'halal', 'gluten-free', 'dairy_free', 'spicy']

interface Props {
  item?: MenuItem | null
  onClose: () => void
  onSave: (item: MenuItem) => void
}

export function MenuItemModal({ item, onClose, onSave }: Props) {
  const isEditing = !!item
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    dietary_tags: [] as string[],
    is_available: true,
    daily_limit: '',
    prep_time_mins: '15',
  })

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? '',
        price: item.price.toFixed(2),
        category: item.category ?? '',
        dietary_tags: item.dietary_tags ?? [],
        is_available: item.is_available,
        daily_limit: item.daily_limit?.toString() ?? '',
        prep_time_mins: item.prep_time_mins.toString(),
      })
      setPhotoUrl(item.photo_url ?? null)
      setPhotoPreview(item.photo_url ?? null)
    }
  }, [item])

  const set = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter((t) => t !== tag)
        : [...prev.dietary_tags, tag],
    }))
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file)
    setPhotoPreview(objectUrl)
    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('menu-items')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('menu-items')
        .getPublicUrl(path)

      setPhotoUrl(publicUrl)
    } catch (err) {
      setError('Photo upload failed. Please try again.')
      setPhotoPreview(photoUrl) // revert preview to last good URL
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = () => {
    setPhotoUrl(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (uploading) return
    setSaving(true)
    setError(null)

    const res = await fetch('/api/maker/menu', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isEditing ? { id: item!.id } : {}),
        ...form,
        photo_url: photoUrl,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to save')
      setSaving(false)
      return
    }

    onSave(data.item)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-lg">
            {isEditing ? 'Edit Item' : 'Add Menu Item'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Photo upload */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Photo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
            {photoPreview ? (
              <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Menu item photo"
                  className="w-full h-full object-cover"
                />
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 size={28} className="text-white animate-spin" />
                  </div>
                )}
                {!uploading && (
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
                    >
                      <Camera size={14} className="text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
                    >
                      <Trash2 size={14} className="text-white" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors"
              >
                <Camera size={24} />
                <span className="text-sm font-medium">Add photo</span>
                <span className="text-xs">JPEG, PNG, WebP · Max 5 MB</span>
              </button>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Item Name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              placeholder="e.g. Jollof Rice"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="What's in this dish?"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all resize-none"
            />
          </div>

          {/* Price + Prep time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                Price ($) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                required
                placeholder="12.99"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Prep Time (min)</label>
              <input
                type="number"
                min="1"
                value={form.prep_time_mins}
                onChange={(e) => set('prep_time_mins', e.target.value)}
                placeholder="15"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Category + Daily limit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Category</label>
              <input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="e.g. Mains"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Daily Limit</label>
              <input
                type="number"
                min="1"
                value={form.daily_limit}
                onChange={(e) => set('daily_limit', e.target.value)}
                placeholder="No limit"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Dietary tags */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Dietary Tags</label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    form.dietary_tags.includes(tag)
                      ? 'bg-[#FF6B35] text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Available toggle */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-gray-700">Available now</span>
            <button
              type="button"
              onClick={() => set('is_available', !form.is_available)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                form.is_available ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.is_available ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2 active:bg-[#E55A24] transition-colors"
          >
            {(saving || uploading) ? (
              <><Loader2 size={18} className="animate-spin" /> {uploading ? 'Uploading photo…' : 'Saving…'}</>
            ) : (
              isEditing ? 'Save Changes' : 'Add to Menu'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

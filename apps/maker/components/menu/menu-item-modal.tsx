'use client'

import { useState, useEffect } from 'react'
import type { MenuItem } from '@doornext/shared/types'
import { X, Loader2 } from 'lucide-react'

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch('/api/maker/menu', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(isEditing ? { id: item!.id } : {}), ...form }),
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
            disabled={saving}
            className="w-full bg-[#FF6B35] text-white rounded-2xl py-4 font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2 active:bg-[#E55A24] transition-colors"
          >
            {saving ? (
              <><Loader2 size={18} className="animate-spin" /> Saving…</>
            ) : (
              isEditing ? 'Save Changes' : 'Add to Menu'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

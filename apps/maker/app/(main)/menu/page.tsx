'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MenuItemModal } from '@/components/menu/menu-item-modal'
import type { MenuItem } from '@doornext/shared/types'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export default function MenuPage() {
  const router = useRouter()
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: maker } = await supabase
        .from('food_makers').select('id').eq('user_id', user.id).single()
      if (!maker) { setError('Kitchen profile not found'); setLoading(false); return }

      const { data, error: fetchError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('maker_id', maker.id)
        .order('category')
        .order('name')
      if (fetchError) { setError('Failed to load menu items'); setLoading(false); return }
      setItems(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const toggleAvailability = async (item: MenuItem) => {
    setToggling(item.id)
    const supabase = createClient()
    const { data } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
      .select()
      .single()
    if (data) setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
    setToggling(null)
  }

  const handleSave = (saved: MenuItem) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === saved.id)
      return exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]
    })
    setShowModal(false)
    setEditingItem(null)
  }

  const handleDelete = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return
    setDeleting(item.id)
    await fetch('/api/maker/menu', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    })
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setDeleting(null)
  }

  const openAdd = () => { setEditingItem(null); setShowModal(true) }
  const openEdit = (item: MenuItem) => { setEditingItem(item); setShowModal(true) }

  const byCategory = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category ?? 'Menu'
    acc[cat] = acc[cat] ? [...acc[cat], item] : [item]
    return acc
  }, {})

  if (error) {
    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-[60px]">
          <h1 className="text-[18px] font-black text-gray-900">Menu</h1>
        </header>
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h3 className="text-lg font-black text-gray-900">Something went wrong</h3>
          <p className="text-gray-400 text-sm mt-1">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true) }}
            className="mt-6 px-6 py-3 bg-[#FF6B35] text-white rounded-2xl font-bold text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-[60px]">
        <div>
          <h1 className="text-[18px] font-black text-gray-900">Menu</h1>
          {!loading && <p className="text-xs text-gray-400">{items.length} items</p>}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-[#FF6B35] hover:bg-[#E55A24] text-white px-4 py-2 rounded-xl text-sm font-bold active:opacity-90 transition-colors shadow-sm shadow-[#FF6B35]/30"
        >
          <Plus size={15} strokeWidth={2.5} />
          Add Item
        </button>
      </header>

      {loading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-center px-6">
          <div className="w-20 h-20 rounded-3xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-5">
            <span className="text-4xl">🍽️</span>
          </div>
          <h3 className="text-xl font-black text-gray-900">Menu is empty</h3>
          <p className="text-gray-400 text-sm mt-1.5 mb-6">Add your first dish to get started</p>
          <button
            onClick={openAdd}
            className="bg-[#FF6B35] hover:bg-[#E55A24] text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-md shadow-[#FF6B35]/30 transition-colors"
          >
            Add First Item
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {Object.entries(byCategory).map(([category, categoryItems]) => (
            <section key={category}>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2">
                {category} · {categoryItems.length}
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                {categoryItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                    {/* Availability toggle */}
                    <button
                      onClick={() => toggleAvailability(item)}
                      disabled={toggling === item.id}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                        item.is_available ? 'bg-[#FF6B35]' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                        item.is_available ? 'left-5' : 'left-1'
                      }`} />
                    </button>

                    {/* Photo thumbnail */}
                    {item.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className={`w-12 h-12 rounded-xl object-cover flex-shrink-0 ${!item.is_available ? 'opacity-40' : ''}`}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">
                        <span className="text-xl">🍽️</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm leading-tight ${!item.is_available ? 'text-gray-300' : 'text-gray-900'}`}>
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-sm font-black ${item.is_available ? 'text-[#FF6B35]' : 'text-gray-300'}`}>
                          ${item.price.toFixed(2)}
                        </span>
                        {item.prep_time_mins > 0 && (
                          <span className="text-xs text-gray-300">· {item.prep_time_mins} min</span>
                        )}
                        {item.daily_limit !== null && (
                          <span className="text-xs text-amber-500">· Limit {item.daily_limit}</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-300 truncate mt-0.5">{item.description}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center active:bg-gray-100"
                      >
                        <Pencil size={13} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleting === item.id}
                        className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center active:bg-red-100 disabled:opacity-40"
                      >
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {showModal && (
        <MenuItemModal
          item={editingItem}
          onClose={() => { setShowModal(false); setEditingItem(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

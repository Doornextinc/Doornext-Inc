'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MenuItemModal } from '@/components/menu/menu-item-modal'
import type { MenuItem } from '@doornext/shared/types'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

export default function MenuPage() {
  const router = useRouter()
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: maker } = await supabase
        .from('food_makers').select('id').eq('user_id', user.id).single()
      if (!maker) return

      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('maker_id', maker.id)
        .order('category')
        .order('name')
      setItems(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const toggleAvailability = async (item: MenuItem) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
      .select()
      .single()
    if (data) setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
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

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-14">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Menu</h1>
          {!loading && <p className="text-xs text-gray-400">{items.length} items</p>}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-[#FF6B35] text-white px-3 py-2 rounded-xl text-sm font-bold active:bg-[#E55A24] transition-colors"
        >
          <Plus size={16} />
          Add Item
        </button>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <span className="text-6xl mb-4">🍽️</span>
          <h3 className="text-xl font-bold text-gray-700">Your menu is empty</h3>
          <p className="text-gray-400 text-sm mt-1 mb-6">Add your first dish to get started</p>
          <button onClick={openAdd} className="bg-[#FF6B35] text-white px-6 py-3 rounded-2xl font-bold">
            Add First Item
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {Object.entries(byCategory).map(([category, categoryItems]) => (
            <section key={category}>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1 mb-3">
                {category} <span className="text-gray-300 font-normal">({categoryItems.length})</span>
              </h2>
              <div className="bg-white rounded-2xl divide-y divide-gray-50 overflow-hidden">
                {categoryItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                    <button onClick={() => toggleAvailability(item)} className="flex-shrink-0">
                      {item.is_available
                        ? <ToggleRight size={26} className="text-green-500" />
                        : <ToggleLeft size={26} className="text-gray-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm leading-tight ${!item.is_available ? 'text-gray-400' : 'text-gray-900'}`}>
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-[#FF6B35]">${item.price.toFixed(2)}</span>
                        {item.prep_time_mins > 0 && (
                          <span className="text-xs text-gray-400">· {item.prep_time_mins} min</span>
                        )}
                        {item.daily_limit !== null && (
                          <span className="text-xs text-amber-500">· Limit {item.daily_limit}</span>
                        )}
                      </div>
                      {item.dietary_tags?.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {item.dietary_tags.map((tag) => (
                            <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
                      >
                        <Pencil size={14} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleting === item.id}
                        className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center active:bg-red-100 disabled:opacity-40"
                      >
                        <Trash2 size={14} className="text-red-400" />
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

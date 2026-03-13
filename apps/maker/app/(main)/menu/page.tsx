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

  return (
    <div className="flex flex-col min-h-full bg-[#F5F4F2]">
      <header className="sticky top-0 z-40 bg-white border-b border-[#EBEBEB] flex items-center justify-between px-4 h-[60px]">
        <div>
          <h1 className="text-[18px] font-black text-[#111]">Menu</h1>
          {!loading && <p className="text-xs text-[#999]">{items.length} items</p>}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-[#111] text-white px-4 py-2 rounded-xl text-sm font-bold active:bg-[#333] transition-colors"
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
          <div className="w-20 h-20 rounded-3xl bg-white border border-[#EBEBEB] flex items-center justify-center mb-5">
            <span className="text-4xl">🍽️</span>
          </div>
          <h3 className="text-xl font-black text-[#222]">Menu is empty</h3>
          <p className="text-[#AAA] text-sm mt-1.5 mb-6">Add your first dish to get started</p>
          <button onClick={openAdd} className="bg-[#111] text-white px-6 py-3 rounded-2xl font-bold text-sm">
            Add First Item
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {Object.entries(byCategory).map(([category, categoryItems]) => (
            <section key={category}>
              <p className="text-[11px] font-black text-[#AAA] uppercase tracking-widest px-1 mb-2">
                {category} · {categoryItems.length}
              </p>
              <div className="bg-white rounded-2xl border border-[#EBEBEB] divide-y divide-[#F5F4F2] overflow-hidden">
                {categoryItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                    {/* Availability toggle — pill style */}
                    <button
                      onClick={() => toggleAvailability(item)}
                      disabled={toggling === item.id}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                        item.is_available ? 'bg-[#111]' : 'bg-[#DADADA]'
                      }`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                        item.is_available ? 'left-5' : 'left-1'
                      }`} />
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm leading-tight ${!item.is_available ? 'text-[#CCC]' : 'text-[#111]'}`}>
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-sm font-black ${item.is_available ? 'text-[#111]' : 'text-[#CCC]'}`}>
                          ${item.price.toFixed(2)}
                        </span>
                        {item.prep_time_mins > 0 && (
                          <span className="text-xs text-[#BBB]">· {item.prep_time_mins} min</span>
                        )}
                        {item.daily_limit !== null && (
                          <span className="text-xs text-amber-500">· Limit {item.daily_limit}</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-[#BBB] truncate mt-0.5">{item.description}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="w-8 h-8 rounded-xl bg-[#F5F4F2] flex items-center justify-center active:bg-[#EBEBEB]"
                      >
                        <Pencil size={13} className="text-[#666]" />
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

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MenuItem } from '@doornext/shared/types'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'

export default function MenuPage() {
  const router = useRouter()
  const [items, setItems] = useState<MenuItem[]>([])
  const [makerId, setMakerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: maker } = await supabase
        .from('food_makers').select('id').eq('user_id', user.id).single()
      if (!maker) return

      setMakerId(maker.id)
      const { data: menuData } = await supabase
        .from('menu_items')
        .select('*')
        .eq('maker_id', maker.id)
        .order('category')
        .order('name')

      setItems(menuData ?? [])
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
    if (data) {
      setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
    }
  }

  // Group by category
  const byCategory = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category ?? 'Menu'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-bold text-gray-900">Menu</h1>
        <button className="w-9 h-9 rounded-full bg-[#FF6B35] flex items-center justify-center">
          <Plus size={18} className="text-white" />
        </button>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {Object.entries(byCategory).map(([category, categoryItems]) => (
            <section key={category}>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1 mb-3">
                {category}
              </h2>
              <div className="bg-white rounded-2xl divide-y divide-gray-50 overflow-hidden">
                {categoryItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${!item.is_available ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-400">${item.price.toFixed(2)}</p>
                      {item.daily_limit !== null && (
                        <p className="text-xs text-amber-500">Limit: {item.daily_limit}/day</p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleAvailability(item)}
                      className="flex-shrink-0"
                      aria-label={item.is_available ? 'Mark unavailable' : 'Mark available'}
                    >
                      {item.is_available
                        ? <ToggleRight size={28} className="text-green-500" />
                        : <ToggleLeft size={28} className="text-gray-300" />
                      }
                    </button>
                    <button
                      aria-label="Edit item"
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
                    >
                      <Pencil size={14} className="text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="text-5xl mb-4">🍽️</span>
              <h3 className="text-lg font-bold text-gray-700">No menu items yet</h3>
              <p className="text-gray-400 text-sm mt-1">Tap + to add your first item</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

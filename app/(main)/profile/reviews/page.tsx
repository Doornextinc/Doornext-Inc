'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { BackBar } from '@/components/layout/top-bar'
import { createClient } from '@/lib/supabase/client'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  food_makers: { name: string } | null
}

export default function ReviewsPage() {
  const router = useRouter()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, food_makers(name)')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })

      setReviews((data as Review[]) || [])
      setLoading(false)
    }
    load()
  }, [router])

  return (
    <div className="flex flex-col min-h-full bg-[#f8f8f8]">
      <BackBar title="My Reviews" />

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Star size={48} className="text-gray-200 mb-4" />
          <h3 className="text-lg font-bold text-gray-700">No reviews yet</h3>
          <p className="text-gray-400 text-sm mt-1">Reviews you leave will appear here</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900">{review.food_makers?.name ?? 'Unknown Maker'}</p>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}
                    />
                  ))}
                </div>
              </div>
              {review.comment && (
                <p className="text-sm text-gray-600">{review.comment}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

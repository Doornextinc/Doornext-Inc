'use client'

/**
 * Legacy /messages route — kept as a redirect to /notifications, where the
 * unified notification + chat feed now lives. The per-channel detail page
 * `/messages/[channelId]` remains active for opening individual conversations.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MessagesPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/notifications') }, [router])
  return null
}

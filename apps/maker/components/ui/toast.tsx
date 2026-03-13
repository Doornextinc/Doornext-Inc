'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
}

// Simple event bus for toasts
type Listener = (toast: Toast) => void
const listeners: Set<Listener> = new Set()

export const toast = {
  success: (message: string) => emit({ id: Date.now().toString(), type: 'success', message }),
  error: (message: string) => emit({ id: Date.now().toString(), type: 'error', message }),
  info: (message: string) => emit({ id: Date.now().toString(), type: 'info', message }),
}

function emit(t: Toast) {
  listeners.forEach((fn) => fn(t))
}

const ICONS = {
  success: <CheckCircle size={18} className="text-green-500 flex-shrink-0" />,
  error: <XCircle size={18} className="text-red-500 flex-shrink-0" />,
  info: <AlertCircle size={18} className="text-blue-500 flex-shrink-0" />,
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t])
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
      }, 4000)
    }
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none max-w-[430px] mx-auto">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="w-full bg-white rounded-2xl shadow-lg border border-gray-100 px-4 py-3 flex items-center gap-3 pointer-events-auto animate-in slide-in-from-top-2 fade-in"
        >
          {ICONS[t.type]}
          <p className="text-sm font-medium text-gray-800 flex-1">{t.message}</p>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}

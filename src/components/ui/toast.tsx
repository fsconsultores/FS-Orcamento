'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; variant: ToastVariant }

const ToastContext = createContext<{ show: (message: string, variant?: ToastVariant) => void } | null>(null)

const ICONS: Record<ToastVariant, typeof CheckCircle2> = { success: CheckCircle2, error: AlertCircle, info: Info }
const CLS: Record<ToastVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-secondary-50 text-secondary-700 border-secondary-200',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map(t => {
          const Icon = ICONS[t.variant]
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-lg ${CLS[t.variant]}`}
            >
              <Icon size={16} />
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
